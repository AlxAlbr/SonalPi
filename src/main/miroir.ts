/**
 * Le miroir — copie de travail locale d'un corpus distant (plan §2-§3).
 *
 * Le corpus de référence vit sur le serveur ; le miroir vit dans
 * `userData/miroirs/<corpusId>/` — JAMAIS dans une zone synchronisée par un
 * client desktop (piège n°1, plan §13). `CorpusStore` opère sur ce dossier
 * exactement comme sur un corpus local : toute la nouveauté tient ICI, dans la
 * couche main-process au-dessus de son I/O (invariant §15.1).
 *
 * E0 = lecture seule : `tirer()` fait le pull incrémental par ETags (§3.1) —
 * PROPFIND Depth:1 sur la racine, `entretiens/` ET `verrous/` (badges fiables,
 * décision 2026-08), comparaison au `.manifeste.json` local, GET des seuls
 * fichiers changés, disparus déplacés en corbeille du miroir (jamais effacés).
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { ClientWebDAV, type EntreePropfind } from './webdav/client'

/** Dossiers distants qui ne sont PAS du contenu du corpus : protocole et
 *  corbeille serveur. Le miroir ne les télécharge pas comme contenu ; seul
 *  `verrous/` est scanné pour ses métadonnées (ETags → badges). */
const DOSSIERS_HORS_CONTENU = ['verrous', 'presence', 'corbeille', 'sonde']

/** Le manifeste : mémoire des ETags VUS. Local pur (`userData`), jamais
 *  téléversé — c'est l'état de la copie, pas une donnée du corpus. */
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
  /** Entrées verrou vues au pull (chemin relatif « verrous/<id>.lock.json » +
   *  ETag) — matière première des badges §10 en attendant E1. */
  verrous: { chemin: string; etag: string | null }[]
  /** Date du tirage (pour l'UI : « copie du JJ/MM HH:MM », §4.6). */
  date: string
}

export class MiroirWebDAV {
  constructor(
    private readonly client: ClientWebDAV,
    /** Public en lecture : la couche session lit/écrit les fichiers du miroir
     *  et y range les copies de divergence (sessions/). */
    public readonly dirLocal: string,
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

  /** Pull incrémental §3.1. Déterministe et idempotent : deux tirages sans
   *  changement serveur ne re-téléchargent rien. */
  async tirer(): Promise<ResultatTirage> {
    if (!existsSync(this.dirLocal)) mkdirSync(this.dirLocal, { recursive: true })
    const manifeste = this.lireManifeste()

    // 1. Inventaire distant : racine (corpus.json + dossiers) et entretiens/.
    //    Les entrées sont relativisées contre la RACINE du corpus (chemins
    //    « corpus.json », « entretiens/e1.json ») — convention de tout le module.
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
      const contenu = await this.client.getTexte(entree.chemin)
      this.ecrireLocal(entree.chemin, contenu)
      manifeste.etags[entree.chemin] = entree.etag
      telecharges.push(entree.chemin)
    }

    // 4. Disparus côté serveur → corbeille du miroir (jamais effacés, §3.1).
    const corbeille: string[] = []
    const cheminsDistant = new Set(candidats.map((c) => c.chemin))
    for (const chemin of Object.keys(manifeste.etags)) {
      if (cheminsDistant.has(chemin)) continue
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
    return { telecharges, corbeille, verrous, date: new Date().toISOString() }
  }

  /** Écriture locale atomique (même discipline que CorpusStore : un crash
   *  laisse l'ancien fichier intact). */
  private ecrireLocal(cheminRelatif: string, contenu: string): void {
    const abs = join(this.dirLocal, cheminRelatif)
    mkdirSync(dirname(abs), { recursive: true })
    const tmp = `${abs}.tmp`
    writeFileSync(tmp, contenu, 'utf8')
    renameSync(tmp, abs)
  }

  /* ── Garde-fou de publication (E1) ────────────────────────────────────────
   * Le manifeste est la mémoire des ETags SERVEUR vus. La publication d'un
   * fichier en a besoin comme garde If-Match (« je publie SI le serveur porte
   * encore la version que j'ai tirée »), et doit le METTRE À JOUR après un PUT
   * réussi — sinon le prochain pull retéléchargerait notre propre publication.
   * ──────────────────────────────────────────────────────────────────────────*/

  /** ETag serveur connu pour un chemin relatif (null = jamais vu). */
  etagDistant(cheminRelatif: string): string | null {
    return this.lireManifeste().etags[cheminRelatif] ?? null
  }

  /** Note l'ETag post-publication (sans toucher au fichier local : il EST
   *  déjà la version serveur après un PUT réussi). */
  noterEtagPublie(cheminRelatif: string, etag: string): void {
    const m = this.lireManifeste()
    m.etags[cheminRelatif] = etag
    this.ecrireManifeste(m)
  }

  /** Chemin local du miroir pour un chemin relatif du corpus — c'est là que
   *  `CorpusStore` sera pointé (E0 : lecture ; E1 : écriture sous verrou). */
  cheminLocal(cheminRelatif: string): string {
    return join(this.dirLocal, cheminRelatif)
  }
}
