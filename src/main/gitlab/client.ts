export interface ConfigurationClientGitLab {
  urlInstance: string
  projetId: number
  jeton: string
  delaiMs?: number
  tailleMaxReponseOctets?: number
  nombreRelances429?: number
  delaiRelanceMaxMs?: number
  attendre?: (delaiMs: number, signal: AbortSignal) => Promise<void>
}

export interface OptionsLectureGitLab {
  signal?: AbortSignal
  tailleMaxOctets?: number
}

export class ErreurGitLab extends Error {
  constructor(
    public readonly statut: number,
    message: string,
  ) {
    super(message)
    this.name = 'ErreurGitLab'
  }
}

export interface ReponseGitLab<T> {
  corps: T
  entetes: Headers
}

/** Client REST GitLab interne, limité pour l'instant aux lectures du dépôt. */
export class ClientGitLab {
  private readonly racineApi: string
  private readonly projet: string
  private readonly delaiMs: number
  private readonly jeton: string
  private readonly tailleMaxReponseOctets: number
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
    if (!Number.isSafeInteger(configuration.projetId) || configuration.projetId <= 0) {
      throw new Error('Identifiant de projet GitLab invalide.')
    }
    if (!configuration.jeton) throw new Error('Jeton GitLab manquant.')

    const base = instance.toString().replace(/\/+$/, '')
    this.racineApi = `${base}/api/v4`
    this.projet = encodeURIComponent(String(configuration.projetId))
    this.delaiMs = configuration.delaiMs ?? 15_000
    this.tailleMaxReponseOctets = configuration.tailleMaxReponseOctets ?? 64 * 1024 * 1024
    this.nombreRelances429 = configuration.nombreRelances429 ?? 2
    this.delaiRelanceMaxMs = configuration.delaiRelanceMaxMs ?? 2_000
    if (
      !Number.isSafeInteger(this.tailleMaxReponseOctets) ||
      this.tailleMaxReponseOctets <= 0 ||
      !Number.isSafeInteger(this.nombreRelances429) ||
      this.nombreRelances429 < 0 ||
      !Number.isFinite(this.delaiRelanceMaxMs) ||
      this.delaiRelanceMaxMs < 0
    ) {
      throw new Error('Limites du client GitLab invalides.')
    }
    this.attendre = configuration.attendre ?? attendreAvecSignal
    this.jeton = configuration.jeton
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
  ): Promise<Response> {
    for (let tentative = 0; ; tentative += 1) {
      const signal = options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(this.delaiMs)])
        : AbortSignal.timeout(this.delaiMs)
      const reponse = await this.fetchImpl(this.url(chemin, parametres), {
        method: 'GET',
        headers: { 'PRIVATE-TOKEN': this.jeton },
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
        `Lecture GitLab refusée (HTTP ${reponse.status}).`,
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

  private async lireCorpsBorne(
    reponse: Response,
    limiteDemandee?: number,
  ): Promise<string> {
    const limite = limiteDemandee ?? this.tailleMaxReponseOctets
    if (!Number.isSafeInteger(limite) || limite <= 0) {
      await reponse.body?.cancel()
      throw new Error('Limite de réponse GitLab invalide.')
    }
    const tailleAnnoncee = Number(reponse.headers.get('content-length'))
    if (Number.isFinite(tailleAnnoncee) && tailleAnnoncee > limite) {
      await reponse.body?.cancel()
      throw new Error('Réponse GitLab trop volumineuse.')
    }
    if (!reponse.body) return ''

    const lecteur = reponse.body.getReader()
    const decodeur = new TextDecoder()
    let taille = 0
    let texte = ''
    try {
      for (;;) {
        const { done, value } = await lecteur.read()
        if (done) break
        taille += value.byteLength
        if (taille > limite) {
          await lecteur.cancel()
          throw new Error('Réponse GitLab trop volumineuse.')
        }
        texte += decodeur.decode(value, { stream: true })
      }
      return texte + decodeur.decode()
    } finally {
      lecteur.releaseLock()
    }
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
