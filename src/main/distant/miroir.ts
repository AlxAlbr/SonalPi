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
 *  `tirer()` fait le pull incrémental par ETags : PROPFIND Depth:1 sur la
 *  racine, sur `entretiens/` et sur `verrous/` (badges fiables), comparaison
 *  au `.manifeste.json` local, GET des seuls fichiers changés.
 *  Les fichiers disparus côté serveur partent en corbeille du miroir (jamais
 *  effacés).
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { ClientWebDAV, ErreurHttp, type EntreePropfind, type SurProgression } from '../webdav/client'
import type { ProgressionTransfert } from '../../shared/distant'

/** Dossiers distants qui ne sont PAS du contenu du corpus (protocole et corbeille serveur).
 *  Le miroir ne les télécharge pas comme contenu.
 *  Seul `verrous/` est scanné pour ses métadonnées (ETags → badges). */
const DOSSIERS_HORS_CONTENU = ['verrous', 'presence', 'corbeille', 'sonde']

/** Le manifeste : mémoire des ETags VUS, local pur (`userData`).
 *  Jamais téléversé — c'est l'état de la copie, pas une donnée du corpus. */
interface Manifeste {
  formatVersion: 1
  /** chemin relatif → ETag canonique (sans guillemets). */
  etags: Record<string, string>
}

export interface ResultatTirage {
  /** Fichiers téléchargés (contenu changé ou nouveaux). */
  telecharges: string[]
  /** Fichiers disparus côté serveur, déplacés vers la corbeille du miroir. */
  corbeille: string[]
  /** Entrées verrou vues au pull : chemin relatif (« verrous/<id>.lock.json »),
   *  avec ETag. Matière première des badges de verrou du corpus. */
  verrous: { chemin: string; etag: string | null }[]
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
  ) {}

  private get fichierManifeste(): string {
    return join(this.dirLocal, '.manifeste.json')
  }

  private lireManifeste(): Manifeste {
    try {
      const m = JSON.parse(readFileSync(this.fichierManifeste, 'utf8')) as Manifeste
      if (m.formatVersion === 1 && m.etags && typeof m.etags === 'object') return m
    } catch {
      /* absent ou corrompu → manifeste vierge (pull complet) */
    }
    return { formatVersion: 1, etags: {} }
  }

  private ecrireManifeste(m: Manifeste): void {
    writeFileSync(this.fichierManifeste, JSON.stringify(m, null, 2), 'utf8')
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
    const manifeste = this.lireManifeste()

    // 1. Inventaire distant : racine (corpus.json + dossiers) et entretiens/.
    //    Les entrées sont relativisées contre la RACINE du corpus (« corpus.json », « entretiens/e1.json »),
    //    convention du module.
    const racine = await this.client.propfind('')
    let entretiens: EntreePropfind[] = []
    if (racine.some((e) => e.dossier && e.chemin === 'entretiens')) {
      entretiens = (await this.client.propfind('entretiens')).map((e) => ({
        ...e,
        chemin: `entretiens/${e.chemin}`,
      }))
    }

    // 2. Candidats au téléchargement : fichiers JSON de contenu uniquement.
    const candidats = [...racine, ...entretiens].filter(
      (e) =>
        !e.dossier &&
        e.chemin.endsWith('.json') &&
        !DOSSIERS_HORS_CONTENU.some((d) => e.chemin.startsWith(`${d}/`)) &&
        !e.chemin.startsWith('.'),
    )

    // 3. Diff contre le manifeste : GET des seuls changés.
    const telecharges: string[] = []
    for (const entree of candidats) {
      if (!entree.etag) continue // serveur sans ETag : anomalie à signaler, on ne devine pas
      if (manifeste.etags[entree.chemin] === entree.etag) continue
      if (horsJeu.has(entree.chemin)) continue // sous notre verrou : intouchable
      const contenu = await this.client.getTexte(entree.chemin)
      this.ecrireLocal(entree.chemin, contenu)
      manifeste.etags[entree.chemin] = entree.etag
      telecharges.push(entree.chemin)
    }

    // 4. Disparus côté serveur → corbeille du miroir (jamais effacés).
    //    Les audios désignés (ci-dessous) sont ajoutés au jeu conservé :
    //    ils ne figurent pas dans l'inventaire JSON et partiraient sinon en corbeille à CHAQUE tirage.
    //    Une désignation retirée ne les y laisse plus : c'est exactement le rattrapage voulu.
    const corbeille: string[] = []
    const designations = this.designationsAudio()
    const cheminsDistant = new Set([...candidats.map((c) => c.chemin), ...designations])
    for (const chemin of Object.keys(manifeste.etags)) {
      if (cheminsDistant.has(chemin)) continue
      if (horsJeu.has(chemin)) continue // sous notre verrou : le garder chez nous
      const src = join(this.dirLocal, chemin)
      if (!existsSync(src)) {
        delete manifeste.etags[chemin]
        continue
      }
      const dst = join(this.dirLocal, 'corbeille-miroir', chemin)
      mkdirSync(dirname(dst), { recursive: true })
      renameSync(src, dst)
      delete manifeste.etags[chemin]
      corbeille.push(chemin)
    }

    this.ecrireManifeste(manifeste)

    // 5. Verrous : scan SANS téléchargement de contenu (badges fiables).
    let verrous: ResultatTirage['verrous'] = []
    if (racine.some((e) => e.dossier && e.chemin === 'verrous')) {
      const liste = await this.client.propfind('verrous')
      verrous = liste
        .filter((v) => !v.dossier && v.chemin.endsWith('.lock.json'))
        .map((v) => ({ chemin: `verrous/${v.chemin}`, etag: v.etag }))
    }

    // 6. Audios désignés : pull SÉLECTIF piloté par les meta.audioDistant des entretiens LOCAUX.
    //    Le pull texte vient de les rafraîchir.
    //    Un échec n'empêche ni le reste des audios ni le résultat global ;
    //    sans note d'ETag, le prochain tirage re-tentera.
    const inaccessibles: ResultatTirage['inaccessibles'] = []
    for (const chemin of designations) {
      try {
        if (!existsSync(this.dirLocal)) mkdirSync(this.dirLocal, { recursive: true })
        const entree = await this.entreeDistanteFichier(chemin)
        if (!entree) throw new ErreurHttp(404, `${chemin} absent du serveur`)
        if (entree.etag === null) throw new ErreurHttp(404, `${chemin} sans ETag serveur`)
        if (manifeste.etags[chemin] === entree.etag) continue
        // Download STREAMÉ vers le disque : aucune limite de taille ;
        // la mémoire du poste ne porte jamais le fichier entier,
        // vidéos de plusieurs Go incluses.
        const abs = join(this.dirLocal, chemin)
        mkdirSync(dirname(abs), { recursive: true })
        await this.client.getBinaireFichier(chemin, abs, (octets, total) =>
          this.surProgression?.({ sens: 'rapatriement', chemin, octets, total }),
        )
        manifeste.etags[chemin] = entree.etag
        telecharges.push(chemin)
      } catch (e) {
        const raison =
          e instanceof ErreurHttp ? String(e.statut) : e instanceof Error ? 'réseau' : 'erreur'
        inaccessibles.push({ chemin, raison })
      }
    }

    this.ecrireManifeste(manifeste)
    return { telecharges, corbeille, verrous, inaccessibles, date: new Date().toISOString() }
  }

  /** Écriture locale atomique, même discipline que CorpusStore : un crash laisse l'ancien fichier intact. */
  private ecrireLocal(cheminRelatif: string, contenu: string): void {
    const abs = join(this.dirLocal, cheminRelatif)
    mkdirSync(dirname(abs), { recursive: true })
    const tmp = `${abs}.tmp`
    writeFileSync(tmp, contenu, 'utf8')
    renameSync(tmp, abs)
  }

  /** Miroir binaire d'`ecrireLocal` (les audios désignés ne sont pas du texte).
   *  NB : le chemin nominal du pull est le download streamé
   *  (`getBinaireFichier`) ; cette variante mémoire reste pour des écritures
   *  locales d'un contenu déjà en main. */
  private ecrireLocalBinaire(cheminRelatif: string, contenu: Uint8Array): void {
    const abs = join(this.dirLocal, cheminRelatif)
    mkdirSync(dirname(abs), { recursive: true })
    const tmp = `${abs}.tmp`
    writeFileSync(tmp, contenu)
    renameSync(tmp, abs)
  }

  /* ── Audios désignés ───────────────────────────────────────────────────
   *  Le miroir lit les entretiens LOCAUX (le pull texte vient de les mettre
   *  à jour) pour savoir quels fichiers audio rapporter.
   *  La désignation porte l'information, pas un dossier.
   *  Lecture défensive : un JSON illisible ne doit jamais faire échouer le
   *  tirage. */

  /** Chemins RELATIFS désignés par les entretiens locaux, dédoublonnés et assainis.
   *  Relatifs purs : pas de remontée `..`, pas d'absolu. */
  private designationsAudio(): string[] {
    const out = new Set<string>()
    const dirEntretiens = join(this.dirLocal, 'entretiens')
    if (!existsSync(dirEntretiens)) return []
    for (const nom of readdirSync(dirEntretiens)) {
      if (!nom.endsWith('.json')) continue
      try {
        const data = JSON.parse(readFileSync(join(dirEntretiens, nom), 'utf8')) as {
          meta?: { audioDistant?: { chemin?: unknown } }
        }
        const chemin = data.meta?.audioDistant?.chemin
        if (typeof chemin === 'string' && this.cheminSurEstSain(chemin)) out.add(chemin)
      } catch {
        /* entretien illisible ou incomplet : ignoré, pas bloquant */
      }
    }
    return [...out].sort()
  }

  /** Garde anti-traversal : un chemin de désignation doit rester SOUS la racine du corpus.
   *  Relatif pur, segments normaux. */
  private cheminSurEstSain(chemin: string): boolean {
    if (!chemin || chemin.startsWith('/') || chemin.includes('\\')) return false
    if (chemin.endsWith('.json')) return false // double emploi avec le pull texte
    return !chemin.split('/').some((s) => s === '' || s === '.' || s === '..')
  }

  /** Entrée serveur d'un fichier précis (ETag + taille).
   *  PROPFIND Depth:1 du dossier parent, puis entrée du basename.
   *  Null si le fichier est absent côté serveur. */
  private async entreeDistanteFichier(cheminRelatif: string): Promise<EntreePropfind | null> {
    const i = cheminRelatif.lastIndexOf('/')
    const dossier = i === -1 ? '' : cheminRelatif.slice(0, i)
    const nom = i === -1 ? cheminRelatif : cheminRelatif.slice(i + 1)
    const entrees = await this.client.propfind(dossier)
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
    return this.lireManifeste().etags[cheminRelatif] ?? null
  }

  /** Note l'ETag post-publication, sans toucher au fichier local : il est déjà la version serveur après un PUT réussi. */
  noterEtagPublie(cheminRelatif: string, etag: string): void {
    const m = this.lireManifeste()
    m.etags[cheminRelatif] = etag
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
    const entrees = await this.client.propfind(dossierRelatif)
    return entrees
      .map((e) => ({ nom: e.chemin.split('/').pop() ?? e.chemin, dossier: e.dossier }))
      .sort((a, b) =>
        a.dossier !== b.dossier ? (a.dossier ? -1 : 1) : a.nom < b.nom ? -1 : 1,
      )
  }

  /* ── Téléversement ────────────────────────────────────────────────────────
   *  Un PUT WebDAV vers un chemin existant REMPLACE silencieusement le
   *  fichier serveur (contrairement à l'UI web, qui propose de renommer) —
   *  deux collègues envoyant des enregistrements homonymes s'écraseraient
   *  mutuellement sans le savoir.
   *  D'où la garde : existence vérifiée AVANT le PUT, suggestion de suffixe
   *  en cas de collision. Ni blocage sec, ni perte silencieuse.
   *  Pas de chunking v1 : une erreur réseau/limite serveur remonte telle
   *  quelle à l'appelant. */

  /** Téléverse un fichier vers `cheminCible` (relatif au corpus).
   *  La source est soit des octets déjà en main (`Uint8Array`, tests), soit —
   *  cas nominal — le CHEMIN d'un fichier local lu EN FLUX (`putFichier`) :
   *  mémoire bornée quelle que soit la taille.
   *  Les dossiers parents manquants sont créés (MKCOL par segment).
   *  En cas de collision, renvoie { ok:false, raison:'existe', suggere }, où
   *  `suggeré` est le premier nom libre `<base>-2`, `-3`… du même dossier. */
  async televerserFichier(
    cheminCible: string,
    contenu: Uint8Array | string,
    contentType?: string,
    surProgression?: SurProgression,
  ): Promise<{ ok: boolean; raison?: string; suggere?: string }> {
    if (!this.cheminSurEstSain(cheminCible)) {
      return { ok: false, raison: 'chemin-invalide' }
    }
    // Parents manquants : MKCOL ne crée JAMAIS la chaîne (409 côté réel) —
    // on la crée segment par segment (405 toléré = existe déjà).
    const segments = cheminCible.split('/')
    for (let i = 1; i < segments.length; i++) {
      await this.client.mkcol(segments.slice(0, i).join('/'))
    }
    const i = segments.length - 1
    const dossier = i === 0 ? '' : segments.slice(0, i).join('/')
    const nom = segments[i]
    const existants = new Set(
      (await this.client.propfind(dossier)).filter((e) => !e.dossier).map((e) => e.chemin),
    )
    if (existants.has(nom)) {
      const point = nom.lastIndexOf('.')
      const base = point === -1 ? nom : nom.slice(0, point)
      const ext = point === -1 ? '' : nom.slice(point)
      let n = 2
      while (existants.has(`${base}-${n}${ext}`) && n < 100) n += 1
      const suggereLocal = `${base}-${n}${ext}`
      return { ok: false, raison: 'existe', suggere: dossier ? `${dossier}/${suggereLocal}` : suggereLocal }
    }
    const cible = dossier ? `${dossier}/${nom}` : nom
    if (typeof contenu === 'string') {
      await this.client.putFichier(cible, contenu, { contentType }, surProgression)
    } else {
      await this.client.putBinaire(cible, contenu, { contentType })
    }
    return { ok: true }
  }
}
