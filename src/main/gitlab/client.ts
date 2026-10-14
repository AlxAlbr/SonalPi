/** Secret présenté à l'instance, sans origine ni stockage. */
export type AutorisationGitLab =
  | { type: 'bearer'; accessToken: string }
  | { type: 'jeton-prive'; jeton: string }

/** Taille maximale d'un document GitLab échangé dans un seul aller-retour.
 *
 *  La lecture d'un fichier avec sa garde, le plan de publication et le corps
 *  HTTP valent tous les trois cette taille. Les aligner n'est pas cosmétique :
 *  un fichier lisible doit rester publiable, sans quoi un entretien s'ouvre,
 *  s'édite, puis refuse de s'enregistrer — un refus dont la cause n'apparaît
 *  nulle part dans l'interface. Un fichier est envoyé plus compact qu'il n'est
 *  stocké, alors que sa lecture est élargie par le base64 ; à taille égale de
 *  garde, la publication passe donc avant la lecture. */
export const TAILLE_MAX_DOCUMENT_GITLAB = 2 * 1024 * 1024

/** Autorisation OAuth ; un compte connecté n'a pas à fournir son jeton. */
export function autorisationOAuth(accessToken: string): AutorisationGitLab {
  return { type: 'bearer', accessToken }
}

export function autorisationJetonPersonnel(jeton: string): AutorisationGitLab {
  return { type: 'jeton-prive', jeton }
}

export interface ConfigurationClientGitLab {
  urlInstance: string
  /** Absent pour une découverte à l'échelle de l'instance. */
  projetId?: number
  autorisation: AutorisationGitLab
  delaiMs?: number
  delaiTransfertMs?: number
  tailleMaxReponseOctets?: number
  tailleMaxRequeteOctets?: number
  nombreRelances429?: number
  delaiRelanceMaxMs?: number
  attendre?: (delaiMs: number, signal: AbortSignal) => Promise<void>
}

export interface OptionsLectureGitLab {
  signal?: AbortSignal
  tailleMaxOctets?: number
}

export interface OptionsEcritureGitLab {
  signal?: AbortSignal
  tailleMaxRequeteOctets?: number
  tailleMaxReponseOctets?: number
}

/**
 *  Nature d'un refus HTTP.
 *  `acces` regroupe les cas d'authentification et de droits : l'appelant doit
 *  tenter un renouvellement du credential avant d'en conclure à une permission
 *  métier. `introuvable` peut aussi cacher un projet interdit.
 */
export type NatureRefusGitLab = 'acces' | 'introuvable' | 'limite' | 'service' | 'autre'

export class ErreurGitLab extends Error {
  constructor(
    public readonly statut: number,
    public readonly nature: NatureRefusGitLab,
    message: string,
  ) {
    super(message)
    this.name = 'ErreurGitLab'
  }
}

export class ErreurEcritureGitLab extends Error {
  constructor(
    public readonly statut: number,
    public readonly nature: NatureRefusGitLab,
    message: string,
  ) {
    super(message)
    this.name = 'ErreurEcritureGitLab'
  }
}

/** Une réponse GitLab dépasse la limite de lecture demandée.
 *
 *  L'appelant qui sait de quoi il s'agit — un entretien, une source — peut
 *  alors nommer le fichier concerné plutôt que de remonter un plafond
 *  anonyme. */
export class ErreurReponseTropVolumineuseGitLab extends Error {
  constructor(readonly limiteOctets: number) {
    super('Réponse GitLab trop volumineuse.')
    this.name = 'ErreurReponseTropVolumineuseGitLab'
  }
}

function natureRefus(statut: number): NatureRefusGitLab {
  if (statut === 401 || statut === 403) return 'acces'
  if (statut === 404) return 'introuvable'
  if (statut === 429) return 'limite'
  if (statut >= 500) return 'service'
  return 'autre'
}

export interface ReponseGitLab<T> {
  corps: T
  entetes: Headers
}

/** Client REST GitLab interne pour les lectures et les mutations conditionnelles. */
export class ClientGitLab {
  private readonly racineApi: string
  private readonly projet: string | null
  private readonly delaiMs: number
  private readonly delaiTransfertMs: number
  private readonly entetesAutorisation: Record<string, string>
  private readonly tailleMaxReponseOctets: number
  private readonly tailleMaxRequeteOctets: number
  private readonly nombreRelances429: number
  private readonly delaiRelanceMaxMs: number
  private readonly attendre: (delaiMs: number, signal: AbortSignal) => Promise<void>

  constructor(
    configuration: ConfigurationClientGitLab,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    const instance = new URL(configuration.urlInstance)
    if (instance.username || instance.password || instance.search || instance.hash) {
      throw new Error('Adresse GitLab invalide.')
    }
    const hoteLocal = instance.hostname === 'localhost' || instance.hostname === '127.0.0.1'
    if (instance.protocol !== 'https:' && !(instance.protocol === 'http:' && hoteLocal)) {
      throw new Error('Une adresse GitLab HTTPS est requise.')
    }
    if (
      configuration.projetId !== undefined &&
      (!Number.isSafeInteger(configuration.projetId) || configuration.projetId <= 0)
    ) {
      throw new Error('Identifiant de projet GitLab invalide.')
    }
    if (
      configuration.autorisation.type === 'bearer'
        ? !configuration.autorisation.accessToken
        : !configuration.autorisation.jeton
    ) {
      throw new Error('Accès GitLab manquant.')
    }

    const base = instance.toString().replace(/\/+$/, '')
    this.racineApi = `${base}/api/v4`
    this.projet = configuration.projetId === undefined
      ? null
      : encodeURIComponent(String(configuration.projetId))
    this.delaiMs = configuration.delaiMs ?? 15_000
    this.delaiTransfertMs = configuration.delaiTransfertMs ?? 30 * 60_000
    this.tailleMaxReponseOctets = configuration.tailleMaxReponseOctets ?? 64 * 1024 * 1024
    this.tailleMaxRequeteOctets = configuration.tailleMaxRequeteOctets ?? 2 * 1024 * 1024
    this.nombreRelances429 = configuration.nombreRelances429 ?? 2
    this.delaiRelanceMaxMs = configuration.delaiRelanceMaxMs ?? 2_000
    if (
      !Number.isFinite(this.delaiTransfertMs) || this.delaiTransfertMs <= 0 ||
      !Number.isSafeInteger(this.tailleMaxReponseOctets) ||
      this.tailleMaxReponseOctets <= 0 ||
      !Number.isSafeInteger(this.tailleMaxRequeteOctets) ||
      this.tailleMaxRequeteOctets <= 0 ||
      !Number.isSafeInteger(this.nombreRelances429) ||
      this.nombreRelances429 < 0 ||
      !Number.isFinite(this.delaiRelanceMaxMs) ||
      this.delaiRelanceMaxMs < 0
    ) {
      throw new Error('Limites du client GitLab invalides.')
    }
    this.attendre = configuration.attendre ?? attendreAvecSignal
    this.entetesAutorisation = configuration.autorisation.type === 'bearer'
      ? { Authorization: `Bearer ${configuration.autorisation.accessToken}` }
      : { 'PRIVATE-TOKEN': configuration.autorisation.jeton }
  }

  private url(chemin: string, parametres: Record<string, string | undefined> = {}): string {
    const url = new URL(`${this.racineApi}${chemin}`)
    for (const [nom, valeur] of Object.entries(parametres)) {
      if (valeur !== undefined) url.searchParams.set(nom, valeur)
    }
    return url.toString()
  }

  private async lireReponse(
    chemin: string,
    parametres: Record<string, string | undefined> | undefined,
    options: OptionsLectureGitLab,
    methode: 'GET' | 'HEAD' = 'GET',
    delaiMs = this.delaiMs,
  ): Promise<Response> {
    for (let tentative = 0; ; tentative += 1) {
      const signal = options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(delaiMs)])
        : AbortSignal.timeout(delaiMs)
      const reponse = await this.fetchImpl(this.url(chemin, parametres), {
        method: methode,
        headers: this.entetesAutorisation,
        signal,
        redirect: 'error',
      })
      if (reponse.ok) return reponse
      await reponse.body?.cancel()
      if (reponse.status === 429 && tentative < this.nombreRelances429) {
        const delai = this.delaiAvantRelance(reponse.headers.get('retry-after'), tentative)
        const signalAttente = options.signal ?? new AbortController().signal
        await this.attendre(delai, signalAttente)
        continue
      }
      throw new ErreurGitLab(
        reponse.status,
        natureRefus(reponse.status),
        this.messageErreurLecture(reponse.status),
      )
    }
  }

  async lireJson<T>(
    chemin: string,
    parametres?: Record<string, string | undefined>,
    options: OptionsLectureGitLab = {},
  ): Promise<ReponseGitLab<T>> {
    const reponse = await this.lireReponse(chemin, parametres, options)
    const texte = await this.lireCorpsBorne(reponse, options.tailleMaxOctets)
    return { corps: JSON.parse(texte) as T, entetes: reponse.headers }
  }

  async lireTexte(
    chemin: string,
    parametres?: Record<string, string | undefined>,
    options: OptionsLectureGitLab = {},
  ): Promise<string> {
    const reponse = await this.lireReponse(chemin, parametres, options)
    return this.lireCorpsBorne(reponse, options.tailleMaxOctets)
  }

  /** Ouvre un transfert binaire sans appliquer les limites des documents JSON. */
  async lireFlux(
    chemin: string,
    parametres?: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<Response> {
    return this.lireReponse(chemin, parametres, { signal }, 'GET', this.delaiTransfertMs)
  }

  /** Lit un document brut borné, avant détection de son encodage. */
  async lireOctets(
    chemin: string,
    parametres?: Record<string, string | undefined>,
    options: OptionsLectureGitLab = {},
  ): Promise<Uint8Array> {
    const reponse = await this.lireReponse(chemin, parametres, options)
    return this.lireOctetsBornes(reponse, options.tailleMaxOctets)
  }

  /** Lit seulement les métadonnées HTTP d'une ressource GitLab. */
  async lireEntetes(
    chemin: string,
    parametres?: Record<string, string | undefined>,
    options: OptionsLectureGitLab = {},
  ): Promise<Headers> {
    const reponse = await this.lireReponse(chemin, parametres, options, 'HEAD')
    await reponse.body?.cancel()
    return reponse.headers
  }

  /** Envoie exactement une mutation JSON. Un transport ambigu reste une erreur réseau. */
  async ecrireJson<T>(
    chemin: string,
    corps: unknown,
    options: OptionsEcritureGitLab = {},
  ): Promise<ReponseGitLab<T>> {
    const limiteRequete = options.tailleMaxRequeteOctets ?? this.tailleMaxRequeteOctets
    if (!Number.isSafeInteger(limiteRequete) || limiteRequete <= 0) {
      throw new Error('Limite de requête GitLab invalide.')
    }
    const texte = JSON.stringify(corps)
    if (texte === undefined) throw new Error('Corps de requête GitLab invalide.')
    const octets = new TextEncoder().encode(texte)
    if (octets.byteLength > limiteRequete) {
      throw new Error('Requête GitLab trop volumineuse.')
    }
    const signal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(this.delaiMs)])
      : AbortSignal.timeout(this.delaiMs)
    const reponse = await this.fetchImpl(this.url(chemin), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': String(octets.byteLength),
        ...this.entetesAutorisation,
      },
      body: texte,
      signal,
      redirect: 'error',
    })
    if (!reponse.ok) {
      await reponse.body?.cancel()
      throw new ErreurEcritureGitLab(
        reponse.status,
        natureRefus(reponse.status),
        this.messageErreurEcriture(reponse.status),
      )
    }
    const texteReponse = await this.lireCorpsBorne(
      reponse,
      options.tailleMaxReponseOctets,
    )
    return { corps: JSON.parse(texteReponse) as T, entetes: reponse.headers }
  }

  private async lireCorpsBorne(
    reponse: Response,
    limiteDemandee?: number,
  ): Promise<string> {
    return new TextDecoder().decode(await this.lireOctetsBornes(reponse, limiteDemandee))
  }

  private async lireOctetsBornes(
    reponse: Response,
    limiteDemandee?: number,
  ): Promise<Uint8Array> {
    const limite = limiteDemandee ?? this.tailleMaxReponseOctets
    if (!Number.isSafeInteger(limite) || limite <= 0) {
      await reponse.body?.cancel()
      throw new Error('Limite de réponse GitLab invalide.')
    }
    const tailleAnnoncee = Number(reponse.headers.get('content-length'))
    if (Number.isFinite(tailleAnnoncee) && tailleAnnoncee > limite) {
      await reponse.body?.cancel()
      throw new ErreurReponseTropVolumineuseGitLab(limite)
    }
    if (!reponse.body) return new Uint8Array()

    const lecteur = reponse.body.getReader()
    let taille = 0
    const morceaux: Uint8Array[] = []
    try {
      for (;;) {
        const { done, value } = await lecteur.read()
        if (done) break
        taille += value.byteLength
        if (taille > limite) {
          await lecteur.cancel()
          throw new ErreurReponseTropVolumineuseGitLab(limite)
        }
        morceaux.push(value)
      }
      const octets = new Uint8Array(taille)
      let offset = 0
      for (const morceau of morceaux) {
        octets.set(morceau, offset)
        offset += morceau.byteLength
      }
      return octets
    } finally {
      lecteur.releaseLock()
    }
  }

  private messageErreurLecture(statut: number): string {
    if (statut === 401) {
      return 'Accès GitLab refusé : votre connexion a expiré ou a été révoquée.'
    }
    if (statut === 403) {
      return 'Accès GitLab refusé. Votre connexion ne couvre pas ce projet.'
    }
    if (statut === 404) {
      return 'Ressource GitLab introuvable ou inaccessible. Vérifiez le projet et la branche.'
    }
    if (statut === 429) {
      return 'GitLab demande de ralentir. Réessayez dans quelques instants.'
    }
    if (statut >= 500) {
      return 'Le service GitLab est temporairement indisponible.'
    }
    return `Lecture GitLab refusée (HTTP ${statut}).`
  }

  private messageErreurEcriture(statut: number): string {
    if (statut === 400) {
      return 'Publication GitLab refusée. Une action est invalide ou une garde est périmée.'
    }
    if (statut === 401) {
      return 'Écriture GitLab refusée : votre connexion a expiré ou a été révoquée.'
    }
    if (statut === 403) {
      return 'Écriture GitLab refusée. Votre connexion ne couvre pas ce projet.'
    }
    if (statut === 404) {
      return 'Ressource GitLab introuvable ou inaccessible pendant l’écriture.'
    }
    if (statut === 409) {
      return 'Conflit GitLab pendant l’écriture.'
    }
    if (statut === 413) {
      return 'La publication GitLab dépasse la taille autorisée.'
    }
    if (statut === 429) {
      return 'GitLab limite les écritures. Aucune relance automatique ne sera tentée.'
    }
    if (statut >= 500) {
      return 'Le service GitLab est temporairement indisponible.'
    }
    return `Écriture GitLab refusée (HTTP ${statut}).`
  }

  private delaiAvantRelance(retryAfter: string | null, tentative: number): number {
    let delai = 250 * 2 ** tentative
    if (retryAfter) {
      const secondes = Number(retryAfter)
      if (Number.isFinite(secondes) && secondes >= 0) {
        delai = secondes * 1_000
      } else {
        const date = Date.parse(retryAfter)
        if (Number.isFinite(date)) delai = Math.max(0, date - Date.now())
      }
    }
    return Math.min(delai, this.delaiRelanceMaxMs)
  }

  cheminProjet(suffixe: string): string {
    if (this.projet === null) throw new Error('Aucun projet GitLab sélectionné.')
    return `/projects/${this.projet}${suffixe}`
  }
}

function attendreAvecSignal(delaiMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    const minuteur = setTimeout(() => {
      signal.removeEventListener('abort', annuler)
      resolve()
    }, delaiMs)
    const annuler = (): void => {
      clearTimeout(minuteur)
      reject(signal.reason)
    }
    signal.addEventListener('abort', annuler, { once: true })
  })
}
