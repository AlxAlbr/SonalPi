/**
 *  Client WebDAV minimal — zéro dépendance lourde (fetch Node, présent dans
 *  le main process Electron ≥ 28). Périmètre strict :
 *   PROPFIND / GET / PUT / DELETE / MOVE + préconditions (`If-Match`,
 *   `If-None-Match: *`) — rien de plus. Toute la couche miroir et les sondes
 *   passent par ici ; le renderer ne voit jamais cet objet (le domaine ignore
 *   le backend).
 *
 *  L'implémentation de `fetch` est INJECTABLE : les tests branchent un serveur
 *  WebDAV embarqué (ou un double) sans connaître l'identité du backend
 *  (banc de conformité).
 */

import {
  createReadStream,
  createWriteStream,
  existsSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

/** Callback de progression d'un transfert binaire (B3) :
 *  octets cumulés et total connu (null sinon), appelé au plus toutes les
 *  ~100 ms, puis à la fin. */
export type SurProgression = (octets: number, total: number | null) => void

/** Transform qui compte les octets traversants et signale la progression,
 *  sans ralentir le pipe (throttle temporel — les chunks peuvent être nombreux). */
function compteurProgression(surProgression: SurProgression, total: number | null): Transform {
  let cumul = 0
  let dernierEnvoi = 0
  return new Transform({
    transform(chunk, _enc, suite) {
      cumul += chunk.length
      const maintenant = Date.now()
      if (maintenant - dernierEnvoi >= 100) {
        dernierEnvoi = maintenant
        surProgression(cumul, total)
      }
      suite(null, chunk)
    },
    flush(suite) {
      surProgression(cumul, total) // 100 % — l'appelant ferme sa barre dessus
      suite()
    },
  })
}

/** Identifiants d'un compte distant ;
 *  le mot de passe est un mot de passe d'application Nextcloud, jamais le
 *  principal (seul accepté en Basic auth quand la 2FA est active). */
export interface Identifiants {
  utilisateur: string
  motDePasse: string
}

/** Configuration d'un client : racine DAV du corpus (ex.
 *  `https://nuage.exemple.org/remote.php/dav/files/max/MonCorpus`). */
export interface ConfigWebDAV {
  /** URL de base, SANS barre finale ;
   *  tous les chemins passés aux méthodes sont RELATIFS à cette racine
   *  (« corpus.json », « entretiens/e1.json »…). */
  baseUrl: string
  identifiants: Identifiants
}

export interface DelaisWebDAV {
  /** Requêtes JSON, verrous et inventaires WebDAV. */
  requeteMs: number
  /** Transferts de fichiers potentiellement volumineux. */
  transfertMs: number
}

const DELAIS_PAR_DEFAUT: DelaisWebDAV = {
  requeteMs: 30_000,
  transfertMs: 30 * 60_000,
}

/** Entrée d'un PROPFIND Depth:1 : chemin relatif + ETag (+ indicateur dossier,
 *  pour que le miroir distingue `entretiens/` d'un fichier homonyme). */
export interface EntreePropfind {
  chemin: string // relatif à la racine du corpus, sans barre initiale
  etag: string | null // null = le serveur n'expose pas d'ETag (anomalie signalable)
  dossier: boolean
  /** Taille en octets (`getcontentlength`) ;
   *  undefined si absente (dossier ou serveur avare) ;
   *  sert à la progression des transferts (voir `compteurProgression`). */
  taille?: number
}

/** Erreur HTTP typée par statut ;
 *  les décisions du protocole (412 = verrou contourné / test-and-set perdu,
 *  423 = tenu, 404 = absent…) portent sur CE nombre, jamais sur un message. */
export class ErreurHttp extends Error {
  constructor(
    public readonly statut: number,
    message: string,
  ) {
    super(message)
    this.name = 'ErreurHttp'
  }
}

export class ErreurDelaiWebDAV extends Error {
  constructor(
    public readonly methode: string,
    public readonly chemin: string,
    public readonly delaiMs: number,
  ) {
    super(`${methode} ${chemin} a dépassé le délai de ${delaiMs} ms`)
    this.name = 'ErreurDelaiWebDAV'
  }
}

/** Options de PUT conditionnel : exactement les deux préconditions du protocole,
 *  test-and-set à la création et garde de publication. */
export interface OptionsPut {
  ifMatch?: string // garde de publication : publier SEUL si la version serveur est celle-ci
  ifNoneMatch?: '*' // test-and-set : ne créer que si la ressource N'EXISTE pas
  contentType?: string
}

export type ImplementationFetch = typeof fetch

/** État du verrou NATIF d'un fichier (props files_lock) ;
 *  c'est la forme brute du serveur, le provider la traduit en `ContenuVerrou`. */
export interface EtatVerrouNatif {
  verrouille: boolean
  /** Identifiant Nextcloud du détenteur ('' si libre). */
  owner: string
  displayname: string
  /** Unix SECONDES (convention files_lock), null si inconnu. */
  time: number | null
  /** Durée annoncée en secondes (0 = n'expire jamais). */
  timeout: number | null
}

/** Vérifie le transport avant toute construction d'en-tête Basic. */
export function verifierTransportWebDAV(baseUrl: string): void {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw new Error('L’adresse WebDAV est invalide.')
  }
  if (url.username || url.password) {
    throw new Error('L’adresse WebDAV ne doit pas contenir d’identifiants.')
  }
  if (url.hash) throw new Error('L’adresse WebDAV ne doit pas contenir de fragment.')
  const hoteLocal = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname.toLowerCase())
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && hoteLocal)) {
    throw new Error(
      'Une connexion WebDAV HTTPS est obligatoire. HTTP est accepté uniquement sur localhost.',
    )
  }
}

/** En-tête d'authentification Basic : seule forme acceptée en WebDAV,
 *  quand la 2FA est active, avec un mot de passe d'application. */
function enteteAuth(identifiants: Identifiants): string {
  return 'Basic ' + Buffer.from(`${identifiants.utilisateur}:${identifiants.motDePasse}`).toString('base64')
}

export class ClientWebDAV {
  private readonly delais: DelaisWebDAV

  constructor(
    /** Public en lecture : les sondes remontent l'URL racine du site,
     *  pour interroger les capabilities sans dupliquer la config. */
    public readonly config: ConfigWebDAV,
    private readonly faireRequete: ImplementationFetch = fetch,
    delais: Partial<DelaisWebDAV> = {},
  ) {
    verifierTransportWebDAV(config.baseUrl)
    this.delais = { ...DELAIS_PAR_DEFAUT, ...delais }
    if (this.delais.requeteMs <= 0 || this.delais.transfertMs <= 0) {
      throw new Error('Les délais WebDAV doivent être strictement positifs.')
    }
  }

  /** URL absolue d'un chemin relatif (encodage des segments préservé). */
  private url(chemin: string): string {
    const segments = chemin.split('/').map(encodeURIComponent).join('/')
    return `${this.config.baseUrl}/${segments}`
  }

  private async requete<T = Response>(
    methode: string,
    chemin: string,
    options: {
      entetes?: Record<string, string>
      corps?: BodyInit | null
      /** Requis par fetch quand le corps est un flux (PUT streamé). */
      duplex?: 'half'
      /** Statuts considérés normaux (pas d'exception). */
      statutsOk?: number[]
      /** Un transfert garde un délai plus long que les échanges JSON. */
      transfert?: boolean
      /** Le traitement reste sous le même délai que la réception des en-têtes. */
      traiter?: (reponse: Response) => Promise<T> | T
    } = {},
  ): Promise<T> {
    const delaiMs = options.transfert ? this.delais.transfertMs : this.delais.requeteMs
    const controleur = new AbortController()
    const minuterie = setTimeout(() => controleur.abort(), delaiMs)
    ;(minuterie as unknown as { unref?: () => void }).unref?.()
    try {
      const reponse = await this.faireRequete(this.url(chemin), {
        method: methode,
        headers: {
          Authorization: enteteAuth(this.config.identifiants),
          ...options.entetes,
        },
        body: options.corps ?? undefined,
        signal: controleur.signal,
        redirect: 'error',
        ...(options.duplex ? { duplex: options.duplex } : {}),
      })
      const ok = options.statutsOk ?? [200, 201, 204]
      if (!ok.includes(reponse.status)) {
        throw new ErreurHttp(reponse.status, `${methode} ${chemin} → ${reponse.status}`)
      }
      return options.traiter
        ? await options.traiter(reponse)
        : reponse as T
    } catch (e) {
      if (controleur.signal.aborted) throw new ErreurDelaiWebDAV(methode, chemin, delaiMs)
      throw e
    } finally {
      clearTimeout(minuterie)
    }
  }

  /** PROPFIND Depth:1 sur un dossier relatif (« », « entretiens »).
   *  Renvoie les entrées ENFANTS (la collection interrogée elle-même est
   *  exclue), triées par chemin pour un diff déterministe. */
  async propfind(dossierRelatif: string): Promise<EntreePropfind[]> {
    const corps = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:getetag/>
    <d:resourcetype/>
    <d:getcontentlength/>
  </d:prop>
</d:propfind>`
    const xml = await this.requete<string>('PROPFIND', dossierRelatif, {
      entetes: { Depth: '1', 'Content-Type': 'application/xml' },
      corps,
      statutsOk: [207],
      traiter: (reponse) => reponse.text(),
    })
    // Les `href` du multistatus sont des chemins SERVEUR absolus ;
    // on les relativise contre le chemin de la collection interrogée (baseUrl + dossier),
    // décodés tous les deux pour une comparaison stable.
    const cheminRacine = decodeURIComponent(new URL(this.config.baseUrl).pathname).replace(
      /^\/+|\/+$/g,
      '',
    )
    const cible = [cheminRacine, dossierRelatif].filter(Boolean).join('/')
    return analyserMultistatus(xml)
      .filter((e) => e.chemin === cible || e.chemin.startsWith(`${cible}/`))
      // La collection interrogée elle-même est exclue ;
      // seules ses entrées enfants reviennent, en chemins relatifs à la racine du corpus.
      .filter((e) => e.chemin !== cible)
      .map((e) => ({ ...e, chemin: e.chemin.slice(cible.length + 1) }))
      .sort((a, b) => (a.chemin < b.chemin ? -1 : 1))
  }

  /** GET d'un fichier (texte). 404 → exception typée (l'appelant décide :
   *  corpus absent à l'amorce, fichier disparu entre deux pulls…). */
  async getTexte(chemin: string): Promise<string> {
    return this.requete<string>('GET', chemin, {
      traiter: (reponse) => reponse.text(),
    })
  }

  /** GET d'un fichier binaire EN MÉMOIRE (réservé aux petits fichiers ;
   *  les gros passent par `getBinaireFichier`, streamé vers le disque). */
  async getBinaire(chemin: string): Promise<Uint8Array> {
    return this.requete<Uint8Array>('GET', chemin, {
      traiter: async (reponse) => new Uint8Array(await reponse.arrayBuffer()),
    })
  }

  /** GET d'un fichier binaire ÉCRIT EN FLUX vers un chemin local ABSOLU :
   *  le corps HTTP est pipé sur disque par chunks — la mémoire du poste ne
   *  porte JAMAIS le fichier entier, quelle que soit sa taille (vidéos).
   *  Écriture atomique (`<destination>.tmp` puis rename), même discipline que
   *  le store ; le `.tmp` est nettoyé si le transfert échoue en cours de route. */
  async getBinaireFichier(
    chemin: string,
    destination: string,
    surProgression?: SurProgression,
  ): Promise<void> {
    const tmp = `${destination}.tmp`
    try {
      await this.requete<void>('GET', chemin, {
        transfert: true,
        traiter: async (reponse) => {
          if (!reponse.body) throw new ErreurHttp(0, `GET ${chemin} → corps vide`)
          // Total si le serveur l'expose (Nextcloud le fait) ;
          // sinon progression indéterminée : l'UI affiche les octets seuls.
          const tailleBrute = Number(reponse.headers.get('content-length') ?? '')
          const total = Number.isFinite(tailleBrute) && tailleBrute > 0 ? tailleBrute : null
          const fluxCompteur = surProgression ? compteurProgression(surProgression, total) : null
          await pipeline(
            Readable.fromWeb(reponse.body as unknown as import('node:stream/web').ReadableStream),
            ...(fluxCompteur ? [fluxCompteur] : []),
            createWriteStream(tmp),
          )
          renameSync(tmp, destination)
        },
      })
    } catch (e) {
      if (existsSync(tmp)) rmSync(tmp)
      throw e
    }
  }

  /** PUT avec préconditions optionnelles.
   *  Renvoie l'ETag de la nouvelle version si le serveur en expose un
   *  (Nextcloud le fait sur les PUT), sinon null — l'appelant doit alors
   *  re-PROPFIND. */
  async putTexte(chemin: string, contenu: string, options: OptionsPut = {}): Promise<string | null> {
    const entetes: Record<string, string> = {}
    if (options.ifMatch) entetes['If-Match'] = `"${retirerGuillemets(options.ifMatch)}"`
    if (options.ifNoneMatch === '*') entetes['If-None-Match'] = '*'
    entetes['Content-Type'] = options.contentType ?? 'application/json; charset=utf-8'
    const reponse = await this.requete('PUT', chemin, { entetes, corps: contenu })
    const etag = reponse.headers.get('etag') ?? reponse.headers.get('ETag')
    return etag ? retirerGuillemets(etag) : null
  }

  /** PUT binaire — miroir exact de `putTexte` :
   *  les audios téléversés ne sont pas du texte. Mêmes préconditions, même
   *  contrat de retour (ETag de la nouvelle version ou null). */
  async putBinaire(
    chemin: string,
    contenu: Uint8Array,
    options: OptionsPut = {},
  ): Promise<string | null> {
    const entetes: Record<string, string> = {}
    if (options.ifMatch) entetes['If-Match'] = `"${retirerGuillemets(options.ifMatch)}"`
    if (options.ifNoneMatch === '*') entetes['If-None-Match'] = '*'
    entetes['Content-Type'] = options.contentType ?? 'application/octet-stream'
    const reponse = await this.requete('PUT', chemin, {
      entetes,
      // Vue typée sur le buffer : évite une copie, satisfait BodyInit.
      corps: contenu as unknown as BodyInit,
    })
    const etag = reponse.headers.get('etag') ?? reponse.headers.get('ETag')
    return etag ? retirerGuillemets(etag) : null
  }

  /** PUT d'un fichier LOCAL lu EN FLUX : miroir de `getBinaireFichier` ;
   *  le fichier source est pipé vers le corps HTTP par chunks, jamais chargé en
   *  mémoire entière (téléversement de vidéos). Mêmes préconditions et même
   *  contrat de retour que `putBinaire`. */
  async putFichier(
    chemin: string,
    sourceLocale: string,
    options: OptionsPut = {},
    surProgression?: SurProgression,
  ): Promise<string | null> {
    const entetes: Record<string, string> = {}
    if (options.ifMatch) entetes['If-Match'] = `"${retirerGuillemets(options.ifMatch)}"`
    if (options.ifNoneMatch === '*') entetes['If-None-Match'] = '*'
    entetes['Content-Type'] = options.contentType ?? 'application/octet-stream'
    // Total connu d'avance : c'est la taille du fichier source.
    let total: number | null = null
    try {
      total = statSync(sourceLocale).size
    } catch {
      /* l'échec de lecture remontera par le flux */
    }
    const fluxLecture = createReadStream(sourceLocale)
    const fluxCompteur = surProgression ? compteurProgression(surProgression, total) : null
    const corps = Readable.toWeb(
      fluxCompteur ? fluxLecture.pipe(fluxCompteur) : fluxLecture,
    ) as unknown as BodyInit
    const reponse = await this.requete('PUT', chemin, {
      entetes,
      // Readable Node → ReadableStream web ;
      // `duplex: 'half'` est exigé par fetch quand le corps est un flux,
      // le client écrivant sans lire la réponse en même temps.
      corps,
      duplex: 'half',
      transfert: true,
    })
    const etag = reponse.headers.get('etag') ?? reponse.headers.get('ETag')
    return etag ? retirerGuillemets(etag) : null
  }

  /** DELETE conditionnel (libération de verrou : idempotent côté app). */
  async supprimer(chemin: string, ifMatch?: string): Promise<void> {
    const entetes: Record<string, string> = {}
    if (ifMatch) entetes['If-Match'] = `"${retirerGuillemets(ifMatch)}"`
    await this.requete('DELETE', chemin, { entetes })
  }

  /** MOVE vers une destination RELATIVE à la même racine (ex. mise à la corbeille :
   *  `MOVE entretiens/<id>.json → corbeille/<id>.json`, atomique). */
  async deplacer(source: string, destination: string, ecraser = false): Promise<void> {
    await this.requete('MOVE', source, {
      entetes: {
        Destination: this.url(destination),
        Overwrite: ecraser ? 'T' : 'F',
      },
      statutsOk: [201, 204],
    })
  }

  /** MKCOL (création de dossier) — sert à l'amorce distante du corpus,
   *  et au dossier `verrous/`. 405 (existe déjà) est toléré : l'appel crée ce
   *  dont il a besoin sans vérifier avant. */
  async creerDossier(chemin: string): Promise<void> {
    try {
      await this.requete('MKCOL', chemin, { statutsOk: [201] })
    } catch (e) {
      if (!(e instanceof ErreurHttp && e.statut === 405)) throw e
    }
  }

  /* ── Verrou natif files_lock ─────────────────────────────────────────────
   * Contrat vérifié contre Nextcloud réel (pile A) :
   *   LOCK + X-User-Lock:1   → 200 obtenu (re-LOCK même user = battement,
   *                             renouvelle) / 423 tenu par un autre user
   *   UNLOCK + X-User-Lock:1 → 200 libéré / 423 tenu par autrui / 412 pas
   *                             verrouillé
   *   Le serveur IMPOSE le verrou : PUT/DELETE d'un tiers → 423.
   *   La lecture d'un tiers reste libre (GET 200) ; le détenteur publie
   *   normalement (PUT même user → 2xx).
   * ─────────────────────────────────────────────────────────────────────────*/

  /** LOCK « user owned manual lock » (type 0). 423 → ErreurHttp typée. */
  async verrouiller(chemin: string): Promise<void> {
    const corps = `<?xml version="1.0" encoding="utf-8"?>
<d:lockinfo xmlns:d="DAV:">
  <d:lockscope><d:exclusive/></d:lockscope>
  <d:locktype><d:write/></d:locktype>
</d:lockinfo>`
    await this.requete('LOCK', chemin, {
      entetes: { 'X-User-Lock': '1', Depth: '0', 'Content-Type': 'application/xml' },
      corps,
      statutsOk: [200],
    })
  }

  /** UNLOCK du verrou de L'UTILISATEUR authentifié (pas besoin de token avec X-User-Lock,
   *  vérifié réel). Tolérant : 412 (pas verrouillé) est ok. */
  async deverrouiller(chemin: string): Promise<void> {
    await this.requete('UNLOCK', chemin, {
      entetes: { 'X-User-Lock': '1' },
      statutsOk: [200, 204],
    })
  }

  /** MKCOL : crée une COLLECTION (dossier).
   *  Un PUT WebDAV ne crée jamais les parents (409 Conflict sur serveur réel) —
   *  les dossiers techniques (`presence/`…) doivent être créés explicitement.
   *  405 = existe déjà. */
  async mkcol(cheminRelatif: string): Promise<void> {
    await this.requete('MKCOL', cheminRelatif, { statutsOk: [201, 405] })
  }

  /** État du verrou natif d'une ressource, observé par PROPFIND Depth:0 ;
   *  propriétés ns `http://nextcloud.org/ns`. null = libre/absent. */
  async etatVerrouNatif(chemin: string): Promise<EtatVerrouNatif | null> {
    const corps = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:nc="http://nextcloud.org/ns">
  <d:prop>
    <nc:lock/>
    <nc:lock-owner/>
    <nc:lock-owner-displayname/>
    <nc:lock-time/>
    <nc:lock-timeout/>
  </d:prop>
</d:propfind>`
    let xml: string
    try {
      xml = await this.requete<string>('PROPFIND', chemin, {
        entetes: { Depth: '0', 'Content-Type': 'application/xml' },
        corps,
        statutsOk: [207],
        traiter: (reponse) => reponse.text(),
      })
    } catch (e) {
      if (e instanceof ErreurHttp && e.statut === 404) return null
      throw e
    }
    return analyserEtatVerrouNatif(xml)
  }

  /** État verrou natif de TOUT UN DOSSIER (Depth:1) ;
   *  matière des badges en variante A : une seule requête pour tous les
   *  entretiens. Retourne un chemin relatif → état, les fichiers libres ne
   *  figurent PAS dans la carte. Les entrées dossiers sont exclues.
   */
  async etatsVerrouxDossier(dossierRelatif: string): Promise<Record<string, EtatVerrouNatif>> {
    const corps = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:nc="http://nextcloud.org/ns">
  <d:prop>
    <nc:lock/>
    <nc:lock-owner/>
    <nc:lock-owner-displayname/>
    <nc:lock-time/>
    <nc:lock-timeout/>
  </d:prop>
</d:propfind>`
    const xml = await this.requete<string>('PROPFIND', dossierRelatif, {
      entetes: { Depth: '1', 'Content-Type': 'application/xml' },
      corps,
      statutsOk: [207],
      traiter: (reponse) => reponse.text(),
    })
    // Même relativisation que `propfind` : hrefs absolus → chemins relatifs,
    // alignés sur la racine du corpus.
    const cheminRacine = decodeURIComponent(new URL(this.config.baseUrl).pathname).replace(
      /^\/+|\/+$/g,
      '',
    )
    const cible = [cheminRacine, dossierRelatif].filter(Boolean).join('/')
    const sorties: Record<string, EtatVerrouNatif> = {}
    for (const bloc of xml.match(/<(?:[\w.-]+:)?response\b[\s\S]*?<\/(?:[\w.-]+:)?response>/gi) ?? []) {
      const hrefBrut = /<(?:[\w.-]+:)?href(?:\s[^>]*)?>([^<]*)<\/(?:[\w.-]+:)?href>/i.exec(bloc)?.[1]
      if (!hrefBrut) continue
      let chemin = decodeURIComponent(hrefBrut.split('?')[0]).replace(/\/+$/, '')
      chemin = chemin.replace(/^\//, '')
      if (!chemin.startsWith(`${cible}/`)) continue // la collection elle-même
      const relatif = chemin.slice(cible.length + 1)
      const etat = analyserEtatVerrouNatif(bloc)
      if (etat) sorties[relatif] = etat // les libres ne sont pas retenus
    }
    return sorties
  }
}

/** Normalise un ETag ;
 *  Nextcloud (comme beaucoup de serveurs) encadre la valeur entre guillemets
 *  doubles dans les en-têtes ; les comparaisons de manifeste exigent une forme
 *  canonique sans guillemets. */
export function retirerGuillemets(etag: string): string {
  return etag.replace(/^"|"$/g, '')
}

/* ── Analyse du multistatus 207 ──────────────────────────────────────────────
 * Un mini-parseur SUFFIT : le contrat est borné (réponses du serveur à nos
 * propres PROPFIND, deux propriétés attendues). Pas de DOM XML ni de
 * dépendance — mais un parseur naïf sur tout le document confondrait les
 * espaces de noms (`<d:href>` vs `<href>` vs `<D:href>`). La boucle ci-dessous
 * isole donc chaque bloc `<response>` PUIS y cherche les propriétés, quelque
 * soit leur préfixe. C'est la seule partie « XML » du projet, testée à part.
 * ───────────────────────────────────────────────────────────────────────────*/

/** Décodage des entités XML limité au jeu que produit un href DAV. */
function decoderXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
}

/** Extrait la valeur textuelle de la première balise dont le nom local vaut `nomLocal`,
 *  quel que soit le préfixe d'espace de noms. */
function valeurBalise(bloc: string, nomLocal: string): string | null {
  const re = new RegExp(`<[^>]*:?${nomLocal}(?:\\s[^>]*)?>([\\s\\S]*?)</[^>]*:?${nomLocal}`, 'i')
  const m = re.exec(bloc)
  if (!m) return null
  const texte = m[1].replace(/<[^>]*>/g, '').trim()
  return texte.length ? decoderXml(texte) : ''
}

export function analyserMultistatus(xml: string): EntreePropfind[] {
  const sorties: EntreePropfind[] = []
  // Blocs `<response>` (préfixe quelconque ou absent).
  const blocs = xml.match(/<(?:[\w.-]+:)?response\b[\s\S]*?<\/(?:[\w.-]+:)?response>/gi) ?? []
  for (const bloc of blocs) {
    const hrefBrut = valeurBalise(bloc, 'href')
    if (hrefBrut === null) continue
    // Le href est URL-encodé et ABSOLU (path) chez la plupart des serveurs ;
    // on ne garde que le dernier segment de chemin utile,
    // la comparaison se faisant par suffixe contre la racine connue de l'appelant,
    // comme détaillé plus bas.
    let chemin = decodeURIComponent(hrefBrut.split('?')[0])
    chemin = chemin.replace(/\/+$/, '') // collections avec barre finale
    chemin = chemin.replace(/^\//, '')
    const dossier = /<(?:[\w.-]+:)?collection\s*\/?>/i.test(bloc)
    const etagBrut = valeurBalise(bloc, 'getetag')
    const tailleBrute = valeurBalise(bloc, 'getcontentlength')
    const taille = tailleBrute !== null && /^\d+$/.test(tailleBrute.trim()) ? Number(tailleBrute.trim()) : undefined
    sorties.push({
      chemin,
      etag: etagBrut ? retirerGuillemets(etagBrut) : null,
      dossier,
      ...(taille !== undefined ? { taille } : {}),
    })
  }
  return sorties
}

/** Analyse l'état verrou natif d'un PROPFIND files_lock.
 *  Le mini-parseur suit la même discipline que `analyserMultistatus` : on
 *  cherche les éléments par nom LOCAL (n'importe quel préfixe), tolérant aux
 *  attributs d'espace de noms et à la mise en forme du serveur.
 *  Absence/videsse de `<nc:lock>` = libre. */
export function analyserEtatVerrouNatif(xml: string): EtatVerrouNatif | null {
  // PAS de garde « multistatus » ici.
  // La fonction est appelée soit sur le document complet (etatVerrouNatif),
  // soit PAR BLOC <d:response> (etatsVerrouxDossier) ;
  // un bloc ne porte pas la balise racine, et une erreur sabre (<d:error>)
  // ne contient aucun élément lock.
  // verrouille=false → null, ce qui rend le garde redondant.
  const texteDe = (local: string): string | null => {
    const m = new RegExp(`<[^>]*:?${local}(?:\\s[^>]*)?>([^<]*)<`, 'i').exec(xml)
    return m ? m[1].trim() : null
  }
  const lockBrut = texteDe('lock')
  const owner = texteDe('lock-owner') ?? ''
  const displayname = texteDe('lock-owner-displayname') ?? ''
  const timeBrut = texteDe('lock-time')
  const timeoutBrut = texteDe('lock-timeout')
  // Attention : « lock-owner » matche aussi « lock-owner-displayname » —
  // texteDe renvoie la PREMIÈRE occurrence ; ordonner les tests en conséquence.
  const time = timeBrut !== null && timeBrut !== '' ? Number(timeBrut) : null
  const timeout = timeoutBrut !== null && timeoutBrut !== '' ? Number(timeoutBrut) : null
  const verrouille =
    (lockBrut !== null && lockBrut !== '0' && lockBrut !== '') ||
    (owner !== '' && lockBrut === null)
  if (!verrouille) return null
  return { verrouille: true, owner, displayname, time, timeout }
}
