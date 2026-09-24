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
import { ClientWebDAV, ErreurHttp } from '../webdav/client'
import type { ProgressionTransfert } from '../../shared/distant'
import type {
  EmpreinteLectureDistante,
  EntreeLectureDistante,
  LectureDistante,
} from './lecture'
import { LecteurWebDAV } from './lecteurWebDAV'
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
import { TransfertWebDAV } from './transfertWebDAV'

export type { IdentiteMiroirDistant } from './installationMiroir'

/** Dossiers distants qui ne sont PAS du contenu du corpus.
 *  Le miroir les ignore entièrement. */
const DOSSIERS_HORS_CONTENU = ['verrous', 'presence', 'corbeille', 'sonde']

export interface ResultatTirage {
  /** Fichiers téléchargés (contenu changé ou nouveaux). */
  telecharges: string[]
  /** Fichiers disparus côté serveur, déplacés vers la corbeille du miroir. */
  corbeille: string[]
  /** Audios désignés (meta.audioDistant) dont la récupération a ÉCHOUÉ (403 droits insuffisants, 404 disparu, réseau).
   *  JAMAIS bloquants : leur ETag n'est pas noté au manifeste.
   *  Le prochain tirage re-tentera automatiquement (droits ouverts plus tard,
   *  rattrapage sans action). */
  inaccessibles: { chemin: string; raison: string }[]
  /** Date du tirage (pour l'UI : « copie du JJ/MM HH:MM »). */
  date: string
}

export class MiroirWebDAV {
  constructor(
    private readonly client: ClientWebDAV,
    /** Public en lecture : la couche session lit/écrit les fichiers du miroir,
     *  et y range les copies de divergence (sessions/). */
    public readonly dirLocal: string,
    /** Progression des transferts binaires, relais IPC `distant:progression`, émise pendant les rapatriements du tirage.
     *  Le main la relaie aux fenêtres. */
    private readonly surProgression?: (p: ProgressionTransfert) => void,
    private readonly lecture: LectureDistante = new LecteurWebDAV(client),
    private readonly identiteMiroir: IdentiteMiroirDistant = {
      fournisseur: 'webdav',
      destinationId: `${client.config.baseUrl}#${client.config.identifiants.utilisateur}`,
    },
    private readonly transfert: TransfertFichiersDistants = new TransfertWebDAV(client),
  ) {
    this.installationLocale = new InstallationLocaleMiroir(dirLocal, identiteMiroir)
  }

  private readonly installationLocale: InstallationLocaleMiroir

  /** Accès client pour les lectures directes hors miroir (ex. DocsCadre/,
   *  consultation sans copie locale). Le secret ne quitte jamais le main. */
  accesClient(): ClientWebDAV {
    return this.client
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
   *  La divergence sera tranchée par If-Match à la publication, pas par un
   *  pull sauvage.
   */
  async tirer(exclus: string[] = []): Promise<ResultatTirage> {
    const horsJeu = new Set(exclus)
    if (!existsSync(this.dirLocal)) mkdirSync(this.dirLocal, { recursive: true })
    this.installationLocale.reprendre()
    const manifeste = this.lireManifeste()

    // L'inventaire et tous les téléchargements sont terminés avant que le
    // premier fichier visible du miroir soit remplacé.
    const racine = await this.lecture.inventorier('')
    let entretiens: EntreeLectureDistante[] = []
    if (racine.some((e) => e.dossier && e.chemin === 'entretiens')) {
      entretiens = (await this.lecture.inventorier('entretiens')).map((e) => ({
        ...e,
        chemin: `entretiens/${e.chemin}`,
      }))
    }
    const candidats = [...new Map(
      [...racine, ...entretiens]
        .filter(
          (e) =>
            !e.dossier &&
            e.chemin.endsWith('.json') &&
            !DOSSIERS_HORS_CONTENU.some((d) => e.chemin.startsWith(`${d}/`)) &&
            !e.chemin.startsWith('.'),
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
        if (manifeste.empreintes[entree.chemin]?.valeur === entree.empreinte.valeur) continue
        if (horsJeu.has(entree.chemin)) continue
        const contenu = await this.lecture.lireTexte(entree.chemin)
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

      const designations = this.designationsAudio(candidats, horsJeu, contenusPrepares)
      for (const chemin of designations) {
        try {
          const entree = await this.entreeDistanteFichier(chemin)
          if (!entree) throw new ErreurHttp(404, `${chemin} absent du serveur`)
          if (entree.empreinte === null) {
            throw new ErreurHttp(404, `${chemin} sans empreinte serveur`)
          }
          if (manifeste.empreintes[chemin]?.valeur === entree.empreinte.valeur) continue
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
          const raison =
            e instanceof ErreurHttp ? String(e.statut) : e instanceof Error ? 'réseau' : 'erreur'
          inaccessibles.push({ chemin, raison })
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

  /** Entrée serveur d'un fichier précis (empreinte + taille).
   *  PROPFIND Depth:1 du dossier parent, puis entrée du basename.
   *  Null si le fichier est absent côté serveur. */
  private async entreeDistanteFichier(cheminRelatif: string): Promise<EntreeLectureDistante | null> {
    const i = cheminRelatif.lastIndexOf('/')
    const dossier = i === -1 ? '' : cheminRelatif.slice(0, i)
    const nom = i === -1 ? cheminRelatif : cheminRelatif.slice(i + 1)
    const entrees = await this.lecture.inventorier(dossier)
    return entrees.find((e) => e.chemin === nom) ?? null
  }

  /* ── Garde-fou de publication ─────────────────────────────────────────────
   *  Le manifeste est la mémoire des ETags SERVEUR vus.
   *  La publication d'un fichier en a besoin comme garde If-Match (« je publie
   *  SI le serveur porte encore la version que j'ai tirée »), et doit le
   *  METTRE À JOUR après un PUT réussi — sinon le prochain pull
   *  retéléchargerait notre propre publication.
   *  ──────────────────────────────────────────────────────────────────────────*/

  /** ETag serveur connu pour un chemin relatif (null = jamais vu). */
  etagDistant(cheminRelatif: string): string | null {
    const empreinte = this.lireManifeste().empreintes[cheminRelatif]
    return empreinte?.type === 'webdav-etag' ? empreinte.valeur : null
  }

  /** Note l'ETag post-publication, sans toucher au fichier local : il est déjà la version serveur après un PUT réussi. */
  noterEtagPublie(cheminRelatif: string, etag: string): void {
    const m = this.lireManifeste()
    m.empreintes[cheminRelatif] = { type: 'webdav-etag', valeur: etag }
    this.ecrireManifeste(m)
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
      throw new ErreurHttp(400, `chemin de navigation invalide : ${dossierRelatif}`)
    }
    const entrees = await this.lecture.inventorier(dossierRelatif)
    return entrees
      .map((e) => ({ nom: e.chemin.split('/').pop() ?? e.chemin, dossier: e.dossier }))
      .sort((a, b) =>
        a.dossier !== b.dossier ? (a.dossier ? -1 : 1) : a.nom < b.nom ? -1 : 1,
      )
  }

  /** Téléverse un fichier par le connecteur de la destination. */
  televerserFichier(
    cheminCible: string,
    contenu: Uint8Array | string,
    contentType?: string,
    surProgression?: SurProgressionFichier,
  ): Promise<ResultatTeleversement> {
    return this.transfert.televerserFichier(
      cheminCible,
      contenu,
      contentType,
      surProgression,
    )
  }
}
