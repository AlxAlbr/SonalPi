/**
 *  Le miroir — copie de travail locale d'un corpus distant.
 *
 *  Le corpus de référence vit sur le serveur ; le miroir vit dans
 *  `userData/miroirs/<corpusId>/`, JAMAIS dans une zone synchronisée par un
 *  client desktop (une synchro externe écraserait la copie).
 *
 *  `CorpusStore` opère sur ce dossier exactement comme sur un corpus local ;
 *  toute la nouveauté tient ICI, dans la couche main-process au-dessus de son
 *  I/O.
 *
 *  `tirer()` applique les règles locales du pull incrémental. Un lecteur
 *  injecté inventorie les contenus et fournit uniquement les fichiers dont
 *  l'empreinte a changé.
 *  Les fichiers disparus côté serveur partent en corbeille du miroir (jamais
 *  effacés).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ProgressionTransfert } from '../../shared/distant'
import type {
  EmpreinteLectureDistante,
  EntreeLectureDistante,
  LectureDistante,
} from './lecture'
import {
  InstallationLocaleMiroir,
  type IdentiteMiroirDistant,
  type ManifesteMiroir,
} from './installationMiroir'
import type {
  ResultatTeleversement,
  SurProgressionFichier,
  TransfertFichiersDistants,
} from './transfert'
import { validerCandidatsMiroir } from './validationMiroir'

export type { IdentiteMiroirDistant } from './installationMiroir'

export interface ResultatTirage {
  /** Fichiers téléchargés (contenu changé ou nouveaux). */
  telecharges: string[]
  /** Fichiers disparus côté serveur, déplacés vers la corbeille du miroir. */
  corbeille: string[]
  /** Audios désignés (meta.audioDistant) dont la récupération a ÉCHOUÉ (403 droits insuffisants, 404 disparu, réseau).
   *  JAMAIS bloquants : leur empreinte n'est pas notée au manifeste.
   *  Le prochain tirage re-tentera automatiquement (droits ouverts plus tard,
   *  rattrapage sans action). */
  inaccessibles: { chemin: string; raison: string }[]
  /** Date du tirage (pour l'UI : « copie du JJ/MM HH:MM »). */
  date: string
}

export type OuvrirLectureDistante = () => Promise<LectureDistante>

/** Copie locale commune, indépendante du protocole de la destination. */
export class MiroirDistant {
  private readonly installationLocale: InstallationLocaleMiroir

  constructor(
    /** Dossier utilisé par le store et les copies de récupération. */
    public readonly dirLocal: string,
    private readonly ouvrirLecture: OuvrirLectureDistante,
    private readonly identiteMiroir: IdentiteMiroirDistant,
    private readonly transfert: TransfertFichiersDistants | null = null,
    /** Progression des transferts binaires relayée vers le renderer. */
    private readonly surProgression?: (p: ProgressionTransfert) => void,
  ) {
    this.installationLocale = new InstallationLocaleMiroir(dirLocal, identiteMiroir)
  }

  private get fichierManifeste(): string {
    return join(this.dirLocal, '.manifeste.json')
  }

  private lireManifeste(): ManifesteMiroir {
    let brut: unknown
    try {
      brut = JSON.parse(readFileSync(this.fichierManifeste, 'utf8'))
    } catch {
      return this.manifesteVide()
    }
    if (!brut || typeof brut !== 'object') return this.manifesteVide()
    const donnees = brut as {
      formatVersion?: unknown
      etags?: Record<string, unknown>
      destination?: Partial<IdentiteMiroirDistant>
      empreintes?: Record<string, unknown>
    }
    if (donnees.formatVersion === 1 && donnees.etags && typeof donnees.etags === 'object') {
      return {
        ...this.manifesteVide(),
        empreintes: Object.fromEntries(
          Object.entries(donnees.etags)
            .filter((entree): entree is [string, string] => typeof entree[1] === 'string')
            .map(([chemin, etag]) => [chemin, { type: 'webdav-etag', valeur: etag }]),
        ),
      }
    }
    if (donnees.formatVersion !== 2 || !donnees.destination || !donnees.empreintes) {
      return this.manifesteVide()
    }
    if (
      donnees.destination.fournisseur !== this.identiteMiroir.fournisseur ||
      donnees.destination.destinationId !== this.identiteMiroir.destinationId
    ) {
      throw new Error('Le miroir local appartient à une autre destination distante.')
    }
    const empreintes = Object.fromEntries(
      Object.entries(donnees.empreintes).filter(
        (entree): entree is [string, EmpreinteLectureDistante] =>
          this.estEmpreinte(entree[1]),
      ),
    )
    return { formatVersion: 2, destination: this.identiteMiroir, empreintes }
  }

  private manifesteVide(): ManifesteMiroir {
    return { formatVersion: 2, destination: this.identiteMiroir, empreintes: {} }
  }

  private estEmpreinte(valeur: unknown): valeur is EmpreinteLectureDistante {
    if (!valeur || typeof valeur !== 'object') return false
    const entree = valeur as { type?: unknown; valeur?: unknown }
    return (
      (entree.type === 'webdav-etag' || entree.type === 'gitlab-blob') &&
      typeof entree.valeur === 'string'
    )
  }

  private ecrireManifeste(m: ManifesteMiroir): void {
    this.installationLocale.enregistrerManifeste(m)
  }

  /** Pull incrémental, déterministe et idempotent : deux tirages sans changement serveur ne re-téléchargent rien.
   *
   *  `exclus` : chemins relatifs à NE PAS toucher, ni téléchargement ni
   *  corbeille. La couche session y passe les fichiers SOUS NOTRE verrou :
   *  une édition hors app (UI web) ne doit jamais écraser notre copie de
   *  travail pendant la session.
   *  La divergence sera tranchée par les gardes du connecteur à la publication,
   *  pas par un pull sauvage.
   */
  async tirer(exclus: string[] = []): Promise<ResultatTirage> {
    const horsJeu = new Set(exclus)
    if (!existsSync(this.dirLocal)) mkdirSync(this.dirLocal, { recursive: true })
    this.installationLocale.reprendre()
    const manifeste = this.lireManifeste()
    const lecture = await this.ouvrirLecture()

    // L'inventaire et tous les téléchargements sont terminés avant que le
    // premier fichier visible du miroir soit remplacé.
    const racine = await lecture.inventorier('')
    let entretiens: EntreeLectureDistante[] = []
    if (racine.some((e) => e.dossier && e.chemin === 'entretiens')) {
      entretiens = (await lecture.inventorier('entretiens')).map((e) => ({
        ...e,
        chemin: `entretiens/${e.chemin}`,
      }))
    }
    const candidats = [...new Map(
      [...racine, ...entretiens]
        .filter((e) =>
          !e.dossier &&
          (e.chemin === 'corpus.json' || /^entretiens\/[^/]+\.json$/.test(e.chemin)),
        )
        .map((entree) => [entree.chemin, entree]),
    ).values()]

    const preparation = this.installationLocale.nouvellePreparation()
    const installations: { chemin: string; fichierPrepare: string }[] = []
    const contenusPrepares = new Map<string, string>()
    const telecharges: string[] = []
    const inaccessibles: ResultatTirage['inaccessibles'] = []
    const manifesteFinal: ManifesteMiroir = {
      ...manifeste,
      empreintes: { ...manifeste.empreintes },
    }
    let numeroPreparation = 0

    try {
      for (const entree of candidats) {
        if (!entree.empreinte) continue
        if (
          this.memeEmpreinte(manifeste.empreintes[entree.chemin], entree.empreinte) &&
          existsSync(join(this.dirLocal, entree.chemin))
        ) continue
        if (horsJeu.has(entree.chemin)) continue
        const contenu = await lecture.lireTexte(entree.chemin)
        const fichierPrepare = this.installationLocale.cheminFichierPrepare(
          preparation,
          numeroPreparation++,
        )
        writeFileSync(fichierPrepare, contenu, 'utf8')
        contenusPrepares.set(entree.chemin, contenu)
        installations.push({ chemin: entree.chemin, fichierPrepare })
        manifesteFinal.empreintes[entree.chemin] = entree.empreinte
        telecharges.push(entree.chemin)
      }

      validerCandidatsMiroir({
        dirLocal: this.dirLocal,
        candidats,
        contenusPrepares,
        exclus: horsJeu,
      })

      const designations = this.designationsAudio(candidats, horsJeu, contenusPrepares)
      for (const chemin of designations) {
        try {
          const entree = await this.entreeDistanteFichier(lecture, chemin)
          if (!entree?.empreinte) {
            inaccessibles.push({ chemin, raison: '404' })
            continue
          }
          if (
            this.memeEmpreinte(manifeste.empreintes[chemin], entree.empreinte) &&
            existsSync(join(this.dirLocal, chemin))
          ) continue
          if (!this.transfert) {
            inaccessibles.push({ chemin, raison: 'indisponible' })
            continue
          }
          const fichierPrepare = this.installationLocale.cheminFichierPrepare(
            preparation,
            numeroPreparation++,
          )
          await this.transfert.telechargerFichier(chemin, fichierPrepare, (octets, total) =>
            this.surProgression?.({ sens: 'rapatriement', chemin, octets, total }),
          )
          installations.push({ chemin, fichierPrepare })
          manifesteFinal.empreintes[chemin] = entree.empreinte
          telecharges.push(chemin)
        } catch (e) {
          inaccessibles.push({ chemin, raison: this.raisonErreurTransfert(e) })
        }
      }

      const cheminsDistants = new Set([...candidats.map((c) => c.chemin), ...designations])
      const corbeille: string[] = []
      const archives: { chemin: string; destination: string }[] = []
      const destinationsReservees = new Set<string>()
      for (const chemin of Object.keys(manifeste.empreintes)) {
        if (cheminsDistants.has(chemin) || horsJeu.has(chemin)) continue
        delete manifesteFinal.empreintes[chemin]
        if (!existsSync(join(this.dirLocal, chemin))) continue
        archives.push({
          chemin,
          destination: this.destinationCorbeille(chemin, destinationsReservees),
        })
        corbeille.push(chemin)
      }

      this.installationLocale.appliquer(preparation, {
        installations,
        archives,
        manifeste: manifesteFinal,
      })
      return { telecharges, corbeille, inaccessibles, date: new Date().toISOString() }
    } catch (e) {
      if (!this.installationLocale.installationEnCours()) {
        this.installationLocale.abandonner(preparation)
      }
      throw e
    }
  }

  /* ── Audios désignés ───────────────────────────────────────────────────
   *  Le miroir lit les entretiens LOCAUX (le pull texte vient de les mettre
   *  à jour) pour savoir quels fichiers audio rapporter.
   *  La désignation porte l'information, pas un dossier.
   *  Lecture défensive : un JSON illisible ne doit jamais faire échouer le
   *  tirage. */

  /** Chemins RELATIFS désignés par les entretiens locaux, dédoublonnés et assainis.
   *  Relatifs purs : pas de remontée `..`, pas d'absolu. */
  private designationsAudio(
    candidats: EntreeLectureDistante[],
    exclus: Set<string>,
    contenusPrepares: Map<string, string>,
  ): string[] {
    const out = new Set<string>()
    const chemins = new Set(
      candidats
        .map((entree) => entree.chemin)
        .filter((chemin) => chemin.startsWith('entretiens/') && chemin.endsWith('.json')),
    )
    for (const chemin of exclus) {
      if (chemin.startsWith('entretiens/') && chemin.endsWith('.json')) chemins.add(chemin)
    }
    for (const cheminEntretien of chemins) {
      try {
        const contenu = contenusPrepares.get(cheminEntretien) ??
          readFileSync(join(this.dirLocal, cheminEntretien), 'utf8')
        const data = JSON.parse(contenu) as {
          meta?: { audioDistant?: { chemin?: unknown } }
        }
        const chemin = data.meta?.audioDistant?.chemin
        if (typeof chemin === 'string' && this.cheminSurEstSain(chemin)) out.add(chemin)
      } catch {
        /* Entretien illisible ou incomplet : ignoré, pas bloquant. */
      }
    }
    return [...out].sort()
  }

  private destinationCorbeille(chemin: string, reservees: Set<string>): string {
    const destinationInitiale = `corbeille-miroir/${chemin}`
    let destination = destinationInitiale
    let suffixe = 2
    while (reservees.has(destination) || existsSync(join(this.dirLocal, destination))) {
      destination = `${destinationInitiale}.${suffixe++}`
    }
    reservees.add(destination)
    return destination
  }

  /** Garde anti-traversal : un chemin de désignation doit rester SOUS la racine du corpus.
   *  Relatif pur, segments normaux. */
  private cheminSurEstSain(chemin: string): boolean {
    if (!chemin || chemin.startsWith('/') || chemin.includes('\\')) return false
    if (chemin.endsWith('.json')) return false // double emploi avec le pull texte
    return !chemin.split('/').some((s) => s === '' || s === '.' || s === '..')
  }

  /** Cherche un fichier dans l'inventaire direct de son dossier parent.
   *  Null si le fichier est absent côté serveur. */
  private async entreeDistanteFichier(
    lecture: LectureDistante,
    cheminRelatif: string,
  ): Promise<EntreeLectureDistante | null> {
    const i = cheminRelatif.lastIndexOf('/')
    const dossier = i === -1 ? '' : cheminRelatif.slice(0, i)
    const nom = i === -1 ? cheminRelatif : cheminRelatif.slice(i + 1)
    const entrees = await lecture.inventorier(dossier)
    return entrees.find((e) => e.chemin === nom) ?? null
  }

  /* ── Versions observées ───────────────────────────────────────────────────
   *  Le manifeste mémorise les empreintes du dernier tirage installé.
   *  Un connecteur peut les actualiser après une publication confirmée afin
   *  que le tirage suivant ne retélécharge pas son propre contenu.
   *  ──────────────────────────────────────────────────────────────────────────*/

  /** Empreinte observée lors du dernier tirage installé. */
  empreinteDistante(cheminRelatif: string): EmpreinteLectureDistante | null {
    return this.lireManifeste().empreintes[cheminRelatif] ?? null
  }

  /** Note l'empreinte confirmée par une publication du connecteur. */
  noterEmpreintePubliee(
    cheminRelatif: string,
    empreinte: EmpreinteLectureDistante,
  ): void {
    const manifeste = this.lireManifeste()
    manifeste.empreintes[cheminRelatif] = empreinte
    this.ecrireManifeste(manifeste)
  }

  /** Chemin local du miroir pour un chemin relatif du corpus.
   *  C'est là que `CorpusStore` sera pointé (lecture ; écriture sous verrou). */
  cheminLocal(cheminRelatif: string): string {
    return join(this.dirLocal, cheminRelatif)
  }

  /** Navigation du sélecteur de fichiers : entrées ENFANTS d'un dossier,
   *  dossiers d'abord puis fichiers, tri alphabétique.
   *  Le garde anti-traversal est le même que pour les désignations — on ne
   *  liste jamais au-dessus de la racine du corpus. */
  async listerDossier(
    dossierRelatif: string,
  ): Promise<{ nom: string; dossier: boolean }[]> {
    if (!this.cheminSurEstSain(dossierRelatif) && dossierRelatif !== '') {
      throw new Error(`Chemin de navigation distant invalide : ${dossierRelatif}.`)
    }
    const lecture = await this.ouvrirLecture()
    const entrees = await lecture.inventorier(dossierRelatif)
    return entrees
      .map((e) => ({ nom: e.chemin.split('/').pop() ?? e.chemin, dossier: e.dossier }))
      .sort((a, b) =>
        a.dossier !== b.dossier ? (a.dossier ? -1 : 1) : a.nom < b.nom ? -1 : 1,
      )
  }

  private memeEmpreinte(
    gauche: EmpreinteLectureDistante | undefined,
    droite: EmpreinteLectureDistante,
  ): boolean {
    return gauche?.type === droite.type && gauche.valeur === droite.valeur
  }

  private raisonErreurTransfert(erreur: unknown): string {
    if (erreur && typeof erreur === 'object' && 'statut' in erreur) {
      const statut = (erreur as { statut?: unknown }).statut
      if (typeof statut === 'number') return String(statut)
    }
    return erreur instanceof Error ? 'réseau' : 'erreur'
  }

  /** Téléverse un fichier par le connecteur de la destination. */
  televerserFichier(
    cheminCible: string,
    contenu: Uint8Array | string,
    contentType?: string,
    surProgression?: SurProgressionFichier,
  ): Promise<ResultatTeleversement> {
    if (!this.transfert) {
      return Promise.resolve({ ok: false, raison: 'indisponible' })
    }
    return this.transfert.televerserFichier(
      cheminCible,
      contenu,
      contentType,
      surProgression,
    )
  }
}
