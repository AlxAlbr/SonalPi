/**
 * Serveur WebDAV EMBARQUÉ dans les tests — le banc de conformité du plan
 * (plan-multiuser.md §12). Il honore les préconditions HTTP (`If-None-Match:*`,
 * `If-Match`), expose des ETags et répond en multistatus 207 : tout ce que le
 * protocole exige d'un serveur. Les tests l'utilisent SANS connaître son
 * identité au-delà de ce contrat (invariant §15.4 : une abstraction est testée,
 * pas espérée ; si GitLab revenait, il passerait ce même banc).
 *
 * Implémentation : une Map en mémoire derrière un `fetch` injectable — aucun
 * réseau, aucune dépendance.
 */

import type { ImplementationFetch } from '../src/main/webdav/client'

interface Entree {
  contenu?: string // absent = dossier
  etag: string
}

export class ServeurWebDAVMemoire {
  /** Chemins ABSOLUS serveur (`/remote.php/dav/files/max/MonCorpus/corpus.json`). */
  private readonly entrees = new Map<string, Entree>()
  private compteurEtag = 0

  readonly racineDav = '/remote.php/dav/files/max/MonCorpus'
  readonly baseUrl = `http://serveur.test${this.racineDav}`
  readonly identifiants = { utilisateur: 'max', motDePasse: 'app-pass-1234' }

  constructor() {
    this.dossier(this.racineDav)
    this.dossier(`${this.racineDav}/entretiens`)
  }

  /** Amorce directe du contenu (état initial des scénarios de test). */
  poser(cheminRelatif: string, contenu: string): void {
    const etag = this.prochainEtag()
    this.entrees.set(this.absolu(cheminRelatif), { contenu, etag })
  }

  /** Amorce d'un dossier (équivalent MKCOL) pour la préparation des scénarios. */
  creerDossierRelatif(cheminRelatif: string): void {
    this.dossier(this.absolu(cheminRelatif))
  }

  etagDe(cheminRelatif: string): string | undefined {
    return this.entrees.get(this.absolu(cheminRelatif))?.etag
  }

  contenuDe(cheminRelatif: string): string | undefined {
    return this.entrees.get(this.absolu(cheminRelatif))?.contenu
  }

  private absolu(cheminRelatif: string): string {
    return `${this.racineDav}/${cheminRelatif}`
  }

  private dossier(absolu: string): void {
    this.entrees.set(absolu.replace(/\/+$/, ''), { etag: this.prochainEtag() })
  }

  private prochainEtag(): string {
    this.compteurEtag += 1
    return `etag-${String(this.compteurEtag).padStart(4, '0')}`
  }

  private erreur(statut: number): Response {
    return new Response(`erreur ${statut}`, { status: statut })
  }

  private verifierAuth(requete: Request): Response | null {
    const auth = requete.headers.get('Authorization')
    if (!auth?.startsWith('Basic ')) return this.erreur(401)
    const [u, p] = Buffer.from(auth.slice(6), 'base64').toString('utf8').split(':')
    return u === this.identifiants.utilisateur && p === this.identifiants.motDePasse
      ? null
      : this.erreur(401)
  }

  /** Le `fetch` à injecter dans ClientWebDAV. */
  readonly fetch: ImplementationFetch = async (
    entree: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const requete = new Request(entree, init)
    const nonAutorise = this.verifierAuth(requete)
    if (nonAutorise) return nonAutorise

    const chemin = decodeURIComponent(new URL(requete.url).pathname)
    if (!chemin.startsWith(`${this.racineDav}`)) return this.erreur(404)

    switch (requete.method) {
      case 'GET': {
        const e = this.entrees.get(chemin)
        if (!e || e.contenu === undefined) return this.erreur(404)
        return new Response(e.contenu, {
          status: 200,
          headers: { ETag: `"${e.etag}"`, 'Content-Type': 'application/json' },
        })
      }
      case 'PUT': {
        const corps = await requete.text()
        return this.put(corps, requete, chemin)
      }
      case 'DELETE': {
        const e = this.entrees.get(chemin)
        if (!e || e.contenu === undefined) return this.erreur(404)
        const refus = this.verifierIfMatch(requete, e.etag)
        if (refus) return refus
        this.entrees.delete(chemin)
        return new Response(null, { status: 204 })
      }
      case 'MKCOL': {
        if (this.entrees.has(chemin)) return this.erreur(405)
        this.dossier(chemin)
        return new Response(null, { status: 201 })
      }
      case 'MOVE':
        return this.move(requete, chemin)
      case 'PROPFIND':
        return this.propfind(chemin)
      default:
        return this.erreur(405)
    }
  }

  /** Le cœur du test-and-set (plan §5.1) : le serveur tranche. */
  private put(corps: string, requete: Request, chemin: string): Response {
    const existante = this.entrees.get(chemin)
    if (requete.headers.get('If-None-Match') === '*' && existante) {
      return this.erreur(412) // création exclusive refusée : déjà présent
    }
    if (existante && existante.contenu !== undefined) {
      const refus = this.verifierIfMatch(requete, existante.etag)
      if (refus) return refus
    } else if (existante && existante.contenu === undefined) {
      return this.erreur(409) // PUT sur un dossier
    }
    const etag = this.prochainEtag()
    this.entrees.set(chemin, { contenu: corps, etag })
    return new Response(null, { status: existante ? 204 : 201, headers: { ETag: `"${etag}"` } })
  }

  /** Garde de publication (§6.1) : mauvais ETag → 412, jamais d'écrasement. */
  private verifierIfMatch(requete: Request, etagCourant: string): Response | null {
    const attendu = requete.headers.get('If-Match')
    if (attendu === null) return null
    const propre = attendu.replace(/^"|"$/g, '')
    return propre === etagCourant ? null : this.erreur(412)
  }

  private move(requete: Request, source: string): Response {
    const e = this.entrees.get(source)
    if (!e) return this.erreur(404)
    const destination = decodeURIComponent(
      new URL(requete.headers.get('Destination') ?? '', 'http://x').pathname,
    )
    if (requete.headers.get('Overwrite') === 'F' && this.entrees.has(destination)) {
      return this.erreur(412)
    }
    this.entrees.delete(source)
    this.entrees.set(destination, e)
    return new Response(null, { status: 201 })
  }

  /** Multistatus 207 avec hrefs ABSOLUS encodés (comme Nextcloud). */
  private propfind(cheminDossier: string): Response {
    const cible = cheminDossier.replace(/\/+$/, '')
    const enfants = [...this.entrees.entries()]
      .filter(([p]) => p === cible || p.startsWith(`${cible}/`))
      .filter(([p]) => p.slice(cible.length + 1).split('/').length <= 2) // Depth: 1
      .sort(([a], [b]) => (a < b ? -1 : 1))

    const bloc = ([p, e]: [string, Entree]): string => {
      const href = p.split('/').map(encodeURIComponent).join('/')
      const estDossier = e.contenu === undefined
      return `<d:response>
  <d:href>${href}${estDossier ? '/' : ''}</d:href>
  <d:propstat><d:prop>
    ${estDossier ? '<d:resourcetype><d:collection/></d:resourcetype>' : '<d:resourcetype/>'}
    ${e.contenu !== undefined ? `<d:getetag>"${e.etag}"</d:getetag>` : ''}
  </d:prop></d:propstat>
</d:response>`
    }
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">${enfants.map(bloc).join('\n')}</d:multistatus>`
    return new Response(xml, { status: 207, headers: { 'Content-Type': 'application/xml' } })
  }
}
