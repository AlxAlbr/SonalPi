/**
 * TRANSACTIONS DE DÉFINITIONS corpus (plan-multiuser.md §4.7 + §4.8, étape E3).
 *
 * Le « point chaud » `corpus.json` (codebook, variables, règles anon de portée
 * corpus, membership, création/suppression/renommage d'entretien) est écrit par
 * des transactions COURTES : verrou corpus → GET frais → transform local pur →
 * PUT If-Match → déverrouillage (~2 allers-retours serveur par commande).
 *
 * Politique α (§4.6.1) : HORS LIGNE, toute écriture dans `corpus.json` est
 * REFUSÉE — pas de file d'attente ni de différé : la transaction échoue avec
 * un message net et le corpus local reste intact.
 *
 * Le verrou corpus est TOUJOURS en variante B (`verrous/corpus.lock.json`,
 * PUT conditionnel) même quand files_lock est disponible — plan §8 dernier
 * point : les transactions courtes n'ont rien à gagner du verrou visible web,
 * un seul code de plus haut niveau suffit. Le verrou ENTRETIEN (suppression
 * sous double verrou, ordre canonique corpus-avant-entretien §4.8) suit,
 * lui, la variante mesurée à l'ouverture (§8).
 *
 * Ordre canonique des verrous pour `supprimerEntretien` (§4.8 invariant 1) :
 * verrou CORPUS d'abord, verrou ENTRETIEN ensuite ; libération en ordre INVERSE.
 * Politique de publication (§4.8 invariant 2) : publication corpus PUIS MOVE
 * serveur de l'entretien vers `corbeille/` — briève redondance transitoire
 * assumée, jamais de membership pointant un fichier disparu sans trace.
 */

import { dirname, join } from 'node:path'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { ClientWebDAV, ErreurHttp } from '../webdav/client'
import type { MiroirWebDAV } from '../miroir'
import type { CorpusStore } from '../corpusStore'
import * as corpusModel from '../../shared/corpus'
import type { IdentiteSession } from './sessions'
import { ProviderPutConditionnel } from '../verrous/providerPutConditionnel'
import { ProviderFilesLock } from '../verrous/providerFilesLock'
import type { ContenuVerrou, VerrouProvider } from '../verrous/types'
import type {
  CorpusFichier,
  EntretienFichier,
  ItemLotValeur,
  ResultatLotValeur,
} from '../../shared/format'

/** Chemin VERROUILLÉ pour les transactions de définitions — TOUJOURS variante
 *  B (fichier annexe), cf. plan §8. */
const CHEMIN_VERROU_CORPUS = 'verrous/corpus.lock.json'
const CHEMIN_CORPUS = 'corpus.json'
const CHEMIN_ENTRETIEN = (id: string) => `entretiens/${id}.json`

/** Erreur porteur d'un MESSAGE UTILISATEUR (français, affichable tel quel par
 *  la bannière renderer). Les refus de domaine du store (catégorie utilisée…)
 *  restent des Error ordinaires et traversent inchangés. */
export class ErreurTransaction extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ErreurTransaction'
  }
}

export interface OptionsTransactions {
  /** true = le verrou ENTRETIEN de `supprimerEntretien` passe par files_lock
   *  natif (variante A, chemin = le fichier de données lui-même) ; false/absent
   *  = PUT conditionnel sur `verrous/<id>.lock.json`. Le verrou corpus, lui,
   *  est TOUJOURS en B (§8). */
  verrouNatif?: boolean
  /** Accès MINIMAL à la couche session — défense en profondeur du lot de
   *  valeurs (plan-lot-table-donnees.md §4.2) : si un entretien visé est
   *  OUVERT CHEZ NOUS (impossible depuis la table aujourd'hui, qui ferme toute
   *  session), on écrit par le chemin existant (`poserValeur` garde levée +
   *  `noterSale`) au lieu d'une auto-concurrence de verrous. */
  getSessions?: () => { idsTenus(): string[]; noterSale(id: string): void } | null
}

export class TransactionsCorpus {
  constructor(
    private readonly client: ClientWebDAV,
    private readonly miroir: MiroirWebDAV,
    /** Le store courant — capturé PAR APPEL : « Ouvrir un corpus… » réaffecte
     *  le store du main, la couche transaction doit toujours viser le dernier. */
    private readonly getStore: () => CorpusStore,
    private readonly identite: () => IdentiteSession,
    private readonly options: OptionsTransactions = {},
  ) {}

  /* ── Transaction générique §4.7 ────────────────────────────────────────────*/

  /** Exécute une mutation locale de définitions SOUS transaction complète :
   *  verrou corpus → GET frais si divergence manifeste → mutation (garde
   *  lecture seule levée pendant l'appel, remise après) → PUT If-Match →
   *  libération (toujours, y compris sur échec).
   *
   *  La mutation est SYNCHRONE : elle lit `store.ouvrir()` (le fichier local
   *  fraîchement tiré à l'étape précédente) et réécrit le miroir ; c'est le
   *  PUT final qui porte la version locale au serveur.
   *
   *  Refus de verrou / hors ligne / divergence 412 → `ErreurTransaction`
   *  avec message utilisateur ; refus de domaine (ex. catégorie utilisée)
   *  → Error telle quelle, verrou quand même libéré. */
  async executer<T>(mutation: () => T): Promise<T> {
    const provider = new ProviderPutConditionnel(this.client, this.identite)
    let verrouTenu = false
    try {
      const acquisition = await provider.acquerir(CHEMIN_VERROU_CORPUS)
      if (!acquisition.ok) throw new ErreurTransaction(messageRefusDefinitions(acquisition.tenuPar))
      verrouTenu = true

      // La version d'APRÈS-verrou fait foi (§4.7) : si le serveur porte autre
      // chose que notre miroir, on télécharge AVANT de muter — jamais de
      // transformation posée sur une copie périmée.
      const etagServeur = await this.rafraichirCorpusLocal()

      const store = this.getStore()
      const gardePrecedente = store.lectureSeule
      store.lectureSeule = false // levée PENDANT la mutation seulement (sync)
      let resultat: T
      try {
        resultat = mutation()
      } finally {
        store.lectureSeule = gardePrecedente
      }

      await this.publierCorpus(etagServeur)
      return resultat
    } catch (e) {
      if (e instanceof ErreurHttp && e.statut === 412) {
        // Divergence : notre mutation locale n'a PAS été publiée — ré-absorber
        // la version serveur dans le miroir (best effort) pour ne pas laisser
        // à l'écran une mutation fantôme que le prochain pull effacerait.
        await this.rafraichirCorpusLocal().catch(() => {})
      }
      throw classifier(e)
    } finally {
      if (verrouTenu) await provider.liberer(CHEMIN_VERROU_CORPUS).catch(() => {})
    }
  }

  /* ── Suppression d'entretien — double verrou §4.7/§4.8 ────────────────────*/

  /** Supprime un entretien distant sous DOUBLE verrou, ordre canonique §4.8 :
   *  1. verrou CORPUS (variante B),
   *  2. GET frais de corpus.json,
   *  3. verrou ENTRETIEN (variante selon §8) ;
   *  puis mutation locale (membership + fichiers locaux en corbeille miroir),
   *  publication corpus (PUT If-Match) D'ABORD, MOVE serveur `entretiens/<id>.json
   *  → corbeille/<id>.json` ENSUITE (§4.8 invariant 2) ; libération en ordre
   *  inverse (entretien puis corpus).
   *
   *  Pré-requis côté appelant : aucune SESSION d'écriture ne doit rester ouverte
   *  chez NOUS pour cet id (le renderer ferme l'entretien avant de demander la
   *  suppression ; le main ferme par sécurité — sinon ce serait notre propre
   *  verrou qui nous bloquerait, et un orphelin à la clé). */
  async supprimerEntretien(id: string): Promise<CorpusFichier> {
    const providerCorpus = new ProviderPutConditionnel(this.client, this.identite)
    let verrouCorpusTenu = false
    try {
      const acqC = await providerCorpus.acquerir(CHEMIN_VERROU_CORPUS)
      if (!acqC.ok) throw new ErreurTransaction(messageRefusDefinitions(acqC.tenuPar))
      verrouCorpusTenu = true
      const etagServeur = await this.rafraichirCorpusLocal()

      const providerEntretien = this.providerPourEntretien()
      const cheminVerrou = this.cheminVerrouEntretien(id)
      const acqE = await providerEntretien.acquerir(cheminVerrou)
      if (!acqE.ok) {
        throw new ErreurTransaction(
          `« ${id} » est ouvert par ${acqE.tenuPar?.userId ?? 'un autre utilisateur'} — sa suppression est impossible tant que cette session tient.`,
        )
      }

      let corpus: CorpusFichier
      try {
        // Mutation locale : retire le membership et déplace json/.bak/png vers
        // la corbeille DU MIROIR (local pur — le store opère sur sa copie).
        const store = this.getStore()
        const gardePrecedente = store.lectureSeule
        store.lectureSeule = false
        try {
          corpus = store.supprimerEntretien(id)
        } finally {
          store.lectureSeule = gardePrecedente
        }
        // Publication corpus D'ABORD (§4.8) : le membership à jour part avant
        // la disparition du fichier — briève redondance, jamais l'inverse.
        await this.publierCorpus(etagServeur)
        // MOVE serveur ENSUITE (atomique). Un échec ici laisse un entretien
        // orphelin CÔTÉ SERVEUR (ramasse-miettes futur, §4.8) — signalé net.
        await this.client.creerDossier('corbeille')
        try {
          await this.client.deplacer(CHEMIN_ENTRETIEN(id), `corbeille/${id}.json`)
        } catch (e) {
          if (e instanceof ErreurHttp && e.statut === 404) return corpus // déjà parti
          throw new ErreurTransaction(
            'Le membership a été mis à jour mais le fichier entretien n\u2019a pas pu être archivé sur le serveur — il sera récupéré au prochain passage.',
          )
        }
        // Le manifeste liste encore l'ancien chemin : le prochain pull voit
        // la disparition côté serveur et purge simplement l'entrée (le fichier
        // local est déjà parti en corbeille du miroir via le store).
      } finally {
        await providerEntretien.liberer(cheminVerrou).catch(() => {})
      }
      return corpus
    } catch (e) {
      if (e instanceof ErreurHttp && e.statut === 412) {
        await this.rafraichirCorpusLocal().catch(() => {})
      }
      throw classifier(e)
    } finally {
      if (verrouCorpusTenu) await providerCorpus.liberer(CHEMIN_VERROU_CORPUS).catch(() => {})
    }
  }

  /* ── Lot de valeurs — un verrou court PAR ENTRETIEN (plan-lot-table-donnees §4) */

  /** Modification en lot des valeurs EAV (table de données, colonne) : le lot
   *  ne touche PAS `corpus.json` (pas de verrou corpus) — UN cycle par
   *  ENTRETIEN : verrou court → GET frais → PUT If-Match → libérer (le motif
   *  §4.7 appliqué au fichier entretien). Exécution séquentielle ; tout échec
   *  ponctuel (entretien ouvert entre-temps par autrui, divergence 412,
   *  réseau) est signalé nommément SANS bloquer les autres entretiens du lot.
   *  Le miroir est écrit THROUGH (même contenu que le serveur) → la matrice
   *  locale est fraîche sans pull complet, le prochain tirage devient no-op.
   *  JAMAIS de verrou global : un lot long ne doit pas geler le corpus. */
  async poserValeurLot(items: ItemLotValeur[]): Promise<ResultatLotValeur> {
    const succes: string[] = []
    const echecs: { id: string; raison: string }[] = []
    // Regrouper par entretien : UN verrou et UN aller-retour serveur même si
    // plusieurs valeurs demandées pour le même fichier (v1 : 1 variable → 1 item).
    const parEntretien = new Map<string, ItemLotValeur[]>()
    for (const item of items) {
      const liste = parEntretien.get(item.entretienId) ?? []
      liste.push(item)
      parEntretien.set(item.entretienId, liste)
    }
    const sessions = this.options.getSessions?.() ?? null
    for (const [id, lot] of parEntretien) {
      try {
        if (sessions?.idsTenus().includes(id)) {
          // Session À NOUS sur cet id (défense en profondeur, cf. options) :
          // chemin existant — la publication suivra la session (`noterSale`),
          // jamais un second verrou sur un fichier déjà à nous.
          const store = this.getStore()
          const gardePrecedente = store.lectureSeule
          store.lectureSeule = false
          try {
            for (const item of lot)
              if (!store.poserValeur(item.entretienId, item.cible, item.idVar, item.idMod))
                throw new ErreurTransaction(`« ${item.entretienId} » est introuvable dans le corpus.`)
          } finally {
            store.lectureSeule = gardePrecedente
          }
          sessions.noterSale(id)
        } else {
          await this.poserValeurHorsSession(id, lot)
        }
        succes.push(id)
      } catch (e) {
        echecs.push({ id, raison: classifier(e).message })
      }
    }
    return { succes, echecs }
  }

  /** Le cycle d'UN entretien hors session : acquerir → GET frais → mutation
   *  pure locale → PUT If-Match → écriture THROUGH du miroir, `liberer`
   *  TOUJOURS en `finally` (y compris sur échec). Divergence 412 ou réseau :
   *  exception propagée à l'appelant (échec nommé, miroir NON modifié — il
   *  n'est écrit qu'après un PUT réussi). Pas de retry v1 : l'utilisateur
   *  relance le lot. */
  private async poserValeurHorsSession(id: string, lot: ItemLotValeur[]): Promise<void> {
    const provider = this.providerPourEntretien()
    const cheminVerrou = this.cheminVerrouEntretien(id)
    const acquisition = await provider.acquerir(cheminVerrou)
    if (!acquisition.ok) {
      throw new ErreurTransaction(
        `« ${id} » est ouvert par ${acquisition.tenuPar?.userId ?? 'un autre utilisateur'} — impossible de le modifier tant que cette session tient.`,
      )
    }
    try {
      const cheminFichier = CHEMIN_ENTRETIEN(id)
      // La version d'APRÈS-verrou fait foi (§4.7) : GET frais du SERVEUR,
      // jamais confiance à la copie miroir (périmée possible).
      const etagServeur = await this.etagServeurDe(cheminFichier)
      let brut: string
      if (etagServeur) brut = await this.client.getTexte(cheminFichier)
      else
        brut = readFileSync(join(this.miroir.dirLocal, cheminFichier), 'utf8') // cas dégénéré : absent du serveur, partir du miroir
      const data = JSON.parse(brut) as EntretienFichier
      // Mutation pure locale — parité `store.poserValeur`, sans toucher au
      // membership (§4.7).
      for (const item of lot) corpusModel.poserValeur(data, item.cible, item.idVar, item.idMod)
      data.lastModified = new Date().toISOString()
      const contenu = JSON.stringify(data, null, 2)
      // PUT If-Match : divergence (412) → exception ci-dessus, rien n'est écrasé.
      const nouveauEtag = await this.client.putTexte(
        cheminFichier,
        contenu,
        etagServeur ? { ifMatch: etagServeur } : {},
      )
      const etagFinal = nouveauEtag ?? (await this.etagServeurDe(cheminFichier)) ?? etagServeur ?? ''
      // Écriture THROUGH du MIROIR : le MÊME contenu que le serveur part en
      // local (écriture atomique, même utilitaire que le store) — la matrice
      // est fraîche sans pull complet.
      const abs = join(this.miroir.dirLocal, cheminFichier)
      mkdirSync(dirname(abs), { recursive: true })
      const tmp = `${abs}.tmp`
      writeFileSync(tmp, contenu, 'utf8')
      renameSync(tmp, abs)
      if (etagFinal) this.miroir.noterEtagPublie(cheminFichier, etagFinal)
    } finally {
      await provider.liberer(cheminVerrou).catch(() => {})
    }
  }

  /* ── Aides internes ──────────────────────────────────────────────────────── */

  /** GET frais de `corpus.json` si le serveur n'est plus la version du
   *  manifeste ; renvoie l'ETag serveur OBSERVÉ (garde If-Match du PUT final).
   *  null = fichier absent du serveur (cas dégénéré : première publication). */
  private async rafraichirCorpusLocal(): Promise<string | null> {
    const etatServeur = await this.etagServeurDe(CHEMIN_CORPUS)
    if (!etatServeur) return null
    if (etatServeur === this.miroir.etagDistant(CHEMIN_CORPUS)) return etatServeur
    const contenu = await this.client.getTexte(CHEMIN_CORPUS)
    const abs = join(this.miroir.dirLocal, CHEMIN_CORPUS)
    mkdirSync(dirname(abs), { recursive: true })
    const tmp = `${abs}.tmp`
    writeFileSync(tmp, contenu, 'utf8')
    renameSync(tmp, abs)
    this.miroir.noterEtagPublie(CHEMIN_CORPUS, etatServeur)
    return etatServeur
  }

  /** PUT If-Match du `corpus.json` local + mise à jour du manifeste. */
  private async publierCorpus(etagAttendu: string | null): Promise<void> {
    const contenu = readFileSync(join(this.miroir.dirLocal, CHEMIN_CORPUS), 'utf8')
    const nouveauEtag = await this.client.putTexte(
      CHEMIN_CORPUS,
      contenu,
      etagAttendu ? { ifMatch: etagAttendu } : {},
    )
    const etagFinal =
      nouveauEtag ??
      (await this.etagServeurDe(CHEMIN_CORPUS)) ??
      etagAttendu ??
      ''
    if (etagFinal) this.miroir.noterEtagPublie(CHEMIN_CORPUS, etagFinal)
  }

  /** Provider du verrou ENTRETIEN selon la variante mesurée à l'ouverture (§8). */
  private providerPourEntretien(): VerrouProvider {
    return this.options.verrouNatif
      ? new ProviderFilesLock(this.client, this.identite)
      : new ProviderPutConditionnel(this.client, this.identite)
  }

  private cheminVerrouEntretien(id: string): string {
    return this.options.verrouNatif ? CHEMIN_ENTRETIEN(id) : `verrous/${id}.lock.json`
  }

  /** ETag serveur courant d'un fichier, observé par PROPFIND Depth:1. */
  private async etagServeurDe(cheminRelatif: string): Promise<string | null> {
    const dossier = cheminRelatif.includes('/')
      ? cheminRelatif.slice(0, cheminRelatif.lastIndexOf('/'))
      : ''
    const nom = cheminRelatif.slice(cheminRelatif.lastIndexOf('/') + 1)
    const entree = (await this.client.propfind(dossier)).find((x) => x.chemin === nom)
    return entree?.etag ?? null
  }
}

/* ── Lot de valeurs en corpus LOCAL (plan-lot-table-donnees §4.5) ─────────*/

/** Pas de transaction ni de garde en local (aucune couche session) : boucle
 *  directe du store, MÊMES résultats qu'en distant — succès par entretien,
 *  échecs nommés, un échec ne bloque jamais les autres. */
export async function poserValeurLotLocal(
  store: CorpusStore,
  items: ItemLotValeur[],
): Promise<ResultatLotValeur> {
  const succes: string[] = []
  const echecs: { id: string; raison: string }[] = []
  const ids = [...new Set(items.map((i) => i.entretienId))]
  for (const id of ids) {
    try {
      for (const item of items.filter((i) => i.entretienId === id))
        if (!store.poserValeur(item.entretienId, item.cible, item.idVar, item.idMod))
          throw new Error(`« ${id} » est introuvable dans le corpus.`)
      succes.push(id)
    } catch (e) {
      echecs.push({ id, raison: classifier(e).message })
    }
  }
  return { succes, echecs }
}

/* ── Classification des échecs (messages §4.6.1 / §4.7) ──────────────────────*/

function messageRefusDefinitions(tenuPar: ContenuVerrou | null): string {
  return `Définitions en cours de modification par ${tenuPar?.userId ?? 'un autre utilisateur'} — réessayez dans un instant.`
}

/** Traduit les échecs techniques en messages utilisateur ; laisse passer tels
 *  quels les refus de domaine (Error simple levée PAR la mutation) et les
 *  ErreurTransaction déjà formulées. */
function classifier(e: unknown): Error {
  if (e instanceof ErreurTransaction) return e
  if (e instanceof ErreurHttp) {
    if (e.statut === 412) {
      return new ErreurTransaction(
        'Le serveur a changé pendant la modification (divergence). Rien n\u2019a été écrasé — actualisez le corpus puis recommencez.',
      )
    }
    if (e.statut === 0 || e.statut >= 500) {
      return new ErreurTransaction(`Le serveur a répondu une erreur (${e.statut}) — réessayez.`)
    }
    return new ErreurTransaction(`Le serveur a refusé l'opération (${e.statut}).`)
  }
  // fetch réseau : TypeError (« fetch failed »…) — politique α §4.6.1 :
  // pas de différé, un refus explicite. Toute AUTRE erreur (refus de domaine
  // levé par la mutation, fichier local corrompu…) traverse INCHANGÉE —
  // on ne déguise jamais un refus métier en panne réseau.
  if (e instanceof TypeError) {
    return new ErreurTransaction(
      'Serveur injoignable — les modifications partagées nécessitent une connexion au corpus distant.',
    )
  }
  return e instanceof Error ? e : new ErreurTransaction('Modification impossible pour une raison inattendue.')
}
