/**
 * Client WebDAV minimal — zéro dépendance lourde (fetch Node, présent dans le
 * main process Electron ≥ 28). Le périmètre est EXACTEMENT celui du protocole
 * du plan multi-utilisateur (plan-multiuser.md E0) :
 *   PROPFIND / GET / PUT / DELETE / MOVE + préconditions (`If-Match`,
 *   `If-None-Match: *`) — rien de plus. Toute la couche miroir et les sondes
 *   passent par ici ; le renderer ne voit jamais cet objet (invariant §15.1 :
 *   le domaine ignore le backend).
 *
 * L'implémentation de `fetch` est INJECTABLE : les tests branchent un serveur
 * WebDAV embarqué (ou un double) sans connaître l'identité du backend
 * (invariant §15.4 — banc de conformité).
 */

/** Identifiants d'un compte distant. Le mot de passe est un MOT DE PASSE
 *  D'APPLICATION Nextcloud (jamais le principal — cf. plan §2 « Compte »). */
export interface Identifiants {
  utilisateur: string
  motDePasse: string
}

/** Configuration d'un client : racine DAV du corpus (ex.
 *  `https://nuage.exemple.org/remote.php/dav/files/max/MonCorpus`). */
export interface ConfigWebDAV {
  /** URL de base, SANS barre finale. Tous les chemins passés aux méthodes sont
   *  RELATIFS à cette racine (« corpus.json », « entretiens/e1.json »…). */
  baseUrl: string
  identifiants: Identifiants
}

/** Entrée d'un PROPFIND Depth:1 : chemin relatif + ETag (+ indicateur dossier,
 *  pour que le miroir distingue `entretiens/` d'un fichier homonyme). */
export interface EntreePropfind {
  chemin: string // relatif à la racine du corpus, sans barre initiale
  etag: string | null // null = le serveur n'expose pas d'ETag (anomalie signalable)
  dossier: boolean
}

/** Erreur HTTP typée par statut : les décisions du protocole (412 = verrou
 *  contourné / test-and-set perdu, 423 = tenu, 404 = absent…) portent sur CE
 *  nombre, jamais sur un message. */
export class ErreurHttp extends Error {
  constructor(
    public readonly statut: number,
    message: string,
  ) {
    super(message)
    this.name = 'ErreurHttp'
  }
}

/** Options de PUT conditionnel : exactement les deux préconditions utilisées
 *  par le protocole (test-and-set §5.1 et garde de publication §6.1). */
export interface OptionsPut {
  ifMatch?: string // garde de publication : publier SEUL si la version serveur est celle-ci
  ifNoneMatch?: '*' // test-and-set : ne créer que si la ressource N'EXISTE pas
  contentType?: string
}

export type ImplementationFetch = typeof fetch

/** En-tête d'authentification Basic (seule forme acceptée en WebDAV quand la
 *  2FA est active, avec un mot de passe d'application). */
function enteteAuth(identifiants: Identifiants): string {
  return 'Basic ' + Buffer.from(`${identifiants.utilisateur}:${identifiants.motDePasse}`).toString('base64')
}

export class ClientWebDAV {
  constructor(
    /** Public en lecture : les sondes (§8) remontent l'URL racine du site pour
     *  interroger les capabilities, sans dupliquer la config. */
    public readonly config: ConfigWebDAV,
    private readonly faireRequete: ImplementationFetch = fetch,
  ) {}

  /** URL absolue d'un chemin relatif (encodage des segments préservé). */
  private url(chemin: string): string {
    const segments = chemin.split('/').map(encodeURIComponent).join('/')
    return `${this.config.baseUrl}/${segments}`
  }

  private async requete(
    methode: string,
    chemin: string,
    options: {
      entetes?: Record<string, string>
      corps?: BodyInit | null
      /** Statuts considérés normaux (pas d'exception). */
      statutsOk?: number[]
    } = {},
  ): Promise<Response> {
    const reponse = await this.faireRequete(this.url(chemin), {
      method: methode,
      headers: {
        Authorization: enteteAuth(this.config.identifiants),
        ...options.entetes,
      },
      body: options.corps ?? undefined,
    })
    const ok = options.statutsOk ?? [200, 201, 204]
    if (!ok.includes(reponse.status)) {
      throw new ErreurHttp(reponse.status, `${methode} ${chemin} → ${reponse.status}`)
    }
    return reponse
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
  </d:prop>
</d:propfind>`
    const reponse = await this.requete('PROPFIND', dossierRelatif, {
      entetes: { Depth: '1', 'Content-Type': 'application/xml' },
      corps,
      statutsOk: [207],
    })
    const xml = await reponse.text()
    // Les `href` du multistatus sont des chemins SERVEUR absolus ; on les
    // relativise contre le chemin de la collection interrogée (baseUrl +
    // dossier), décodés tous les deux pour une comparaison stable.
    const cheminRacine = decodeURIComponent(new URL(this.config.baseUrl).pathname).replace(
      /^\/+|\/+$/g,
      '',
    )
    const cible = [cheminRacine, dossierRelatif].filter(Boolean).join('/')
    return analyserMultistatus(xml)
      .filter((e) => e.chemin === cible || e.chemin.startsWith(`${cible}/`))
      // La collection interrogée elle-même est exclue : seules ses entrées
      // enfants reviennent, en chemins RELATIFS à la racine du corpus.
      .filter((e) => e.chemin !== cible)
      .map((e) => ({ ...e, chemin: e.chemin.slice(cible.length + 1) }))
      .sort((a, b) => (a.chemin < b.chemin ? -1 : 1))
  }

  /** GET d'un fichier (texte). 404 → exception typée (l'appelant décide :
   *  corpus absent à l'amorce, fichier disparu entre deux pulls…). */
  async getTexte(chemin: string): Promise<string> {
    const reponse = await this.requete('GET', chemin)
    return reponse.text()
  }

  /** GET d'un fichier binaire (réservé aux futurs besoins ; le protocole ne
   *  fait transiter QUE du JSON — plan §3.3). */
  async getBinaire(chemin: string): Promise<Uint8Array> {
    const reponse = await this.requete('GET', chemin)
    return new Uint8Array(await reponse.arrayBuffer())
  }

  /** PUT avec préconditions optionnelles. Renvoie l'ETag de la nouvelle
   *  version si le serveur en expose un (Nextcloud le fait sur les PUT),
   *  sinon null — l'appelant (publication §4.3) doit alors re-PROPFIND. */
  async putTexte(chemin: string, contenu: string, options: OptionsPut = {}): Promise<string | null> {
    const entetes: Record<string, string> = {}
    if (options.ifMatch) entetes['If-Match'] = `"${retirerGuillemets(options.ifMatch)}"`
    if (options.ifNoneMatch === '*') entetes['If-None-Match'] = '*'
    entetes['Content-Type'] = options.contentType ?? 'application/json; charset=utf-8'
    const reponse = await this.requete('PUT', chemin, { entetes, corps: contenu })
    const etag = reponse.headers.get('etag') ?? reponse.headers.get('ETag')
    return etag ? retirerGuillemets(etag) : null
  }

  /** DELETE conditionnel (libération de verrou §5.2 : idempotent côté app). */
  async supprimer(chemin: string, ifMatch?: string): Promise<void> {
    const entetes: Record<string, string> = {}
    if (ifMatch) entetes['If-Match'] = `"${retirerGuillemets(ifMatch)}"`
    await this.requete('DELETE', chemin, { entetes })
  }

  /** MOVE vers une destination RELATIVE à la même racine (suppression §4.7 :
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

  /** MKCOL (création de dossier) — sert à l'amorce distante du corpus et au
   *  dossier `verrous/`. 405 (existe déjà) est toléré : l'appel crée ce dont
   *  il a besoin sans vérifier avant. */
  async creerDossier(chemin: string): Promise<void> {
    try {
      await this.requete('MKCOL', chemin, { statutsOk: [201] })
    } catch (e) {
      if (!(e instanceof ErreurHttp && e.statut === 405)) throw e
    }
  }
}

/** Normalise un ETag : Nextcloud (comme beaucoup de serveurs) encadre la valeur
 *  de guillemets doubles dans les en-têtes ; les comparaisons de manifeste
 *  exigent une forme canonique sans guillemets. */
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

/** Extrait la valeur textuelle de la première balise dont le nom local vaut
 *  `nomLocal`, quel que soit le préfixe d'espace de noms. */
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
    // on ne garde que le dernier segment de chemin utile : la comparaison se
    // fait par suffixe contre la racine connue de l'appelant (voir plus bas).
    let chemin = decodeURIComponent(hrefBrut.split('?')[0])
    chemin = chemin.replace(/\/+$/, '') // collections avec barre finale
    chemin = chemin.replace(/^\//, '')
    const dossier = /<(?:[\w.-]+:)?collection\s*\/?>/i.test(bloc)
    const etagBrut = valeurBalise(bloc, 'getetag')
    sorties.push({
      chemin,
      etag: etagBrut ? retirerGuillemets(etagBrut) : null,
      dossier,
    })
  }
  return sorties
}
