/**
 * Serveur WebDAV embarqué dans les tests : le banc de conformité. Il honore
 * les préconditions HTTP (`If-None-Match:*`, `If-Match`), expose des ETags et
 * répond en multistatus 207 : tout ce que le protocole exige d'un serveur.
 * Les tests l'utilisent sans connaître son identité au-delà de ce contrat
 * (une abstraction est testée, pas espérée).
 *
 * Implémentation : une Map en mémoire derrière un `fetch` injectable — aucun
 * réseau, aucune dépendance.
 */

import type { ImplementationFetch } from '../src/main/webdav/client'

interface Entree {
  contenu?: string // absent = fichier binaire ou dossier ; voir `dossier`/`binaire`
  etag: string
  /** Marqueur explicite de DOSSIER (MKCOL). Ne PAS déduire de `contenu ===
   *  undefined` : un PUT binaire stocke des octets sans `contenu` (B2). */
  dossier?: boolean
  /** Octets bruts d'un PUT non décodable en UTF-8 (`putBinaire`). Quand
   *  présent, GET renvoie CES octets et `contenu` est ignoré. */
  binaire?: Uint8Array
}

/** Verrou natif posé sur un fichier (émulation files_lock, variante A) — le
 *  détenteur est l'UTILISATEUR authentifié (comme le vrai plugin). */
interface VerrouNatif {
  utilisateur: string
  time: number
  timeout: number
}

export class ServeurWebDAVMemoire {
  /** Chemins ABSOLUS serveur (`/remote.php/dav/files/max/MonCorpus/corpus.json`). */
  private readonly entrees = new Map<string, Entree>()
  private readonly verrousNatifs = new Map<string, VerrouNatif>()
  private compteurEtag = 0

  readonly racineDav = '/remote.php/dav/files/max/MonCorpus'
  /** Branche compte du serveur émulé : préfixe minimal accepté par le fetch
   *  (le publieur peut y créer la chaîne menant à un NOUVEAU dossier corpus). */
  readonly racineCompte = '/remote.php'
  readonly baseUrl = `http://serveur.test${this.racineDav}`
  readonly identifiants = { utilisateur: 'max', motDePasse: 'app-pass-1234' }
  /** Comptes supplémentaires (simulation multi-utilisateurs : refus d'un
   *  tiers, imposition du verrou natif…) — clé = utilisateur. */
  private readonly comptes: Record<string, string>

  /** `comptes` : paires utilisateur→motDePasse acceptées en plus de max
   *  (ex. { olivier: 'pass-oli' }) pour les scénarios à deux utilisateurs. */
  constructor(comptes: Record<string, string> = {}) {
    this.comptes = comptes
    this.dossier(this.racineDav)
    this.dossier(`${this.racineDav}/entretiens`)
  }

  /** Amorce directe du contenu (état initial des scénarios de test). */
  poser(cheminRelatif: string, contenu: string): void {
    const etag = this.prochainEtag()
    this.entrees.set(this.absolu(cheminRelatif), { contenu, etag })
  }

  /** Amorce d'un fichier BINAIRE (octets bruts — jamais décodés en texte). */
  poserBinaire(cheminRelatif: string, octets: Uint8Array): void {
    const etag = this.prochainEtag()
    this.entrees.set(this.absolu(cheminRelatif), { binaire: octets, etag })
  }

  /** Amorce d'un dossier (équivalent MKCOL) pour la préparation des scénarios. */
  creerDossierRelatif(cheminRelatif: string): void {
    this.dossier(this.absolu(cheminRelatif))
  }

  etagDe(cheminRelatif: string): string | undefined {
    return this.entrees.get(this.absolu(cheminRelatif))?.etag
  }

  /** Octets bruts d'un fichier stocké binairement (PUT streamé/non-UTF-8). */
  binaireDe(cheminRelatif: string): Uint8Array | undefined {
    return this.entrees.get(this.absolu(cheminRelatif))?.binaire
  }

  contenuDe(cheminRelatif: string): string | undefined {
    return this.entrees.get(this.absolu(cheminRelatif))?.contenu
  }

  private absolu(cheminRelatif: string): string {
    return `${this.racineDav}/${cheminRelatif}`
  }

  private dossier(absolu: string): void {
    this.entrees.set(absolu.replace(/\/+$/, ''), { etag: this.prochainEtag(), dossier: true })
  }

  private prochainEtag(): string {
    this.compteurEtag += 1
    return `etag-${String(this.compteurEtag).padStart(4, '0')}`
  }

  /** Manipulations DIRECTES des verrous natifs (préparation de scénarios :
   *  simuler qu'un tiers a pris/relâché le verrou sans passer par le client). */
  poserVerrouDirect(cheminRelatif: string, utilisateur: string): void {
    this.verrousNatifs.set(this.absolu(cheminRelatif), {
      utilisateur,
      time: Math.floor(Date.now() / 1000),
      timeout: 300,
    })
  }

  oterVerrouDirect(cheminRelatif: string): void {
    this.verrousNatifs.delete(this.absolu(cheminRelatif))
  }

  verrouNatifDe(cheminRelatif: string): { utilisateur: string } | undefined {
    const v = this.verrousNatifs.get(this.absolu(cheminRelatif))
    return v ? { utilisateur: v.utilisateur } : undefined
  }

  private erreur(statut: number): Response {
    return new Response(`erreur ${statut}`, { status: statut })
  }

  private verifierAuth(requete: Request): Response | null {
    const auth = requete.headers.get('Authorization')
    if (!auth?.startsWith('Basic ')) return this.erreur(401)
    const [u, p] = Buffer.from(auth.slice(6), 'base64').toString('utf8').split(':')
    const motDePasseAttendu = u === this.identifiants.utilisateur ? this.identifiants.motDePasse : this.comptes[u]
    return motDePasseAttendu !== undefined && p === motDePasseAttendu
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
    // Zone autorisée = la branche DAV du compte (`/remote.php/…`) et non plus
    // seulement la racine du corpus : le publieur y crée la chaîne de dossiers
    // menant à un NOUVEAU dossier corpus.
    if (!chemin.startsWith(this.racineDav)) {
      if (!chemin.startsWith(this.racineCompte)) return this.erreur(404)
    }

    switch (requete.method) {
      case 'GET': {
        const e = this.entrees.get(chemin)
        if (!e || e.dossier || (e.contenu === undefined && !e.binaire)) return this.erreur(404)
        const corps = e.binaire ?? e.contenu!
        const taille = e.binaire ? e.binaire.length : Buffer.byteLength(e.contenu!, 'utf8')
        return new Response(corps, {
          status: 200,
          headers: { ETag: `"${e.etag}"`, 'Content-Type': 'application/json', 'Content-Length': String(taille) },
        })
      }
      case 'PUT': {
        // Octets BRUTS : un PUT binaire ne doit pas être détruit par un décodage
        // texte. Si le corps est de l'UTF-8 valide on stocke la chaîne (comportement
        // historique des tests texte), sinon on garde les octets.
        const octets = new Uint8Array(await requete.arrayBuffer())
        let corps: string | undefined
        try {
          corps = new TextDecoder('utf-8', { fatal: true }).decode(octets)
        } catch {
          corps = undefined
        }
        const refusVerrou = this.verifierVerrouNatif(requete, chemin)
        if (refusVerrou) return refusVerrou
        return this.put(corps, requete, chemin, corps === undefined ? octets : undefined)
      }
      case 'DELETE': {
        const e = this.entrees.get(chemin)
        if (!e || e.contenu === undefined) return this.erreur(404)
        const refusVerrou = this.verifierVerrouNatif(requete, chemin)
        if (refusVerrou) return refusVerrou
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
      case 'LOCK':
        return this.lock(requete, chemin)
      case 'UNLOCK':
        return this.unlock(requete, chemin)
      case 'PROPFIND':
        return this.propfind(chemin)
      default:
        return this.erreur(405)
    }
  }

  /** Le cœur du test-and-set : le serveur tranche. */
  private put(corps: string | undefined, requete: Request, chemin: string, binaire?: Uint8Array): Response {
    const existante = this.entrees.get(chemin)
    if (requete.headers.get('If-None-Match') === '*' && existante) {
      return this.erreur(412) // création exclusive refusée : déjà présent
    }
    if (existante && (existante.contenu !== undefined || existante.binaire)) {
      const refus = this.verifierIfMatch(requete, existante.etag)
      if (refus) return refus
    } else if (existante && existante.dossier) {
      return this.erreur(409) // PUT sur un dossier
    }
    const etag = this.prochainEtag()
    this.entrees.set(chemin, { contenu: corps, binaire, etag })
    return new Response(null, { status: existante ? 204 : 201, headers: { ETag: `"${etag}"` } })
  }

  /** Garde de publication : mauvais ETag → 412, jamais d'écrasement. */
  private verifierIfMatch(requete: Request, etagCourant: string): Response | null {
    const attendu = requete.headers.get('If-Match')
    if (attendu === null) return null
    const propre = attendu.replace(/^"|"$/g, '')
    return propre === etagCourant ? null : this.erreur(412)
  }

  /** IMPOSITION du verrou natif (comme files_lock réel, vérifié pile A) :
   *  PUT/DELETE d'un utilisateur autre que le détenteur → 423 ; lecture et
   *  écriture du DÉTENTEUR restent libres. */
  private verifierVerrouNatif(requete: Request, chemin: string): Response | null {
    const v = this.verrousNatifs.get(chemin)
    if (!v) return null
    return v.utilisateur === this.utilisateurDe(requete) ? null : this.erreur(423)
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

  /** LOCK « user owned » (émulation du contrat réel vérifié pile A) : 200
   *  obtenu ou renouvelé (re-LOCK même user = battement), 423 tenu par un
   *  AUTRE utilisateur, 404 fichier absent (le vrai renvoie 500 NotFoundException
   *  — on est plus propre ici, les tests ne verrouillent jamais l'absent). */
  private lock(requete: Request, chemin: string): Response {
    const e = this.entrees.get(chemin)
    if (!e || e.contenu === undefined) return this.erreur(404)
    const utilisateur = this.utilisateurDe(requete)
    const existant = this.verrousNatifs.get(chemin)
    if (existant && existant.utilisateur !== utilisateur) return this.erreur(423)
    this.verrousNatifs.set(chemin, {
      utilisateur,
      time: Math.floor(Date.now() / 1000),
      timeout: 300,
    })
    return new Response(null, {
      status: 200,
      headers: { 'Lock-Token': `<opaquelocktoken:${this.compteurEtag}-${Date.now()}>` },
    })
  }

  /** UNLOCK : 412 pas verrouillé, 423 tenu par autrui, 204 libéré. */
  private unlock(requete: Request, chemin: string): Response {
    const existant = this.verrousNatifs.get(chemin)
    if (!existant) return this.erreur(412)
    if (existant.utilisateur !== this.utilisateurDe(requete)) return this.erreur(423)
    this.verrousNatifs.delete(chemin)
    return new Response(null, { status: 204 })
  }

  private utilisateurDe(requete: Request): string {
    const auth = requete.headers.get('Authorization') ?? ''
    try {
      return Buffer.from(auth.slice(6), 'base64').toString('utf8').split(':')[0]
    } catch {
      return ''
    }
  }

  private propfind(cheminDossier: string): Response {
    const cible = cheminDossier.replace(/\/+$/, '')
    const enfants = [...this.entrees.entries()]
      .filter(([p]) => p === cible || p.startsWith(`${cible}/`))
      .filter(([p]) => p.slice(cible.length + 1).split('/').length <= 2) // Depth: 1
      .sort(([a], [b]) => (a < b ? -1 : 1))

    const bloc = ([p, e]: [string, Entree]): string => {
      const href = p.split('/').map(encodeURIComponent).join('/')
      const estDossier = e.dossier === true
      const verrou = !estDossier ? this.verrousNatifs.get(p) : undefined
      const propsVerrou = verrou
        ? `<nc:lock>1</nc:lock><nc:lock-owner>${verrou.utilisateur}</nc:lock-owner>` +
          `<nc:lock-owner-displayname>${verrou.utilisateur}</nc:lock-owner-displayname>` +
          `<nc:lock-time>${verrou.time}</nc:lock-time><nc:lock-timeout>${verrou.timeout}</nc:lock-timeout>`
        : ''
      return `<d:response>
  <d:href>${href}${estDossier ? '/' : ''}</d:href>
  <d:propstat><d:prop>
    ${estDossier ? '<d:resourcetype><d:collection/></d:resourcetype>' : '<d:resourcetype/>'}
    ${!estDossier ? `<d:getetag>"${e.etag}"</d:getetag>` : ''}
    ${!estDossier ? `<d:getcontentlength>${e.binaire ? e.binaire.length : e.contenu!.length}</d:getcontentlength>` : ''}
    ${propsVerrou}
  </d:prop></d:propstat>
</d:response>`
    }
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:nc="http://nextcloud.org/ns">${enfants.map(bloc).join('\n')}</d:multistatus>`
    return new Response(xml, { status: 207, headers: { 'Content-Type': 'application/xml' } })
  }
}
