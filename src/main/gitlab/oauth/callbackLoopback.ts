/**
 *  Callback loopback de l'authentification GitLab.
 *
 *  Le serveur n'existe que le temps d'une tentative : il écoute sur
 *  127.0.0.1, refuse les requêtes qui ne sont pas la callback attendue,
 *  vérifie le `state` et le `Host` avant d'accepter un code, puis se ferme.
 *  Un code déjà consommé ou un état qui ne correspond pas met fin à l'essai.
 */

import { createServer, type Server } from 'node:http'
import { etatValide } from './pkce'

export type RaisonRefusCallback =
  | 'delai-depasse'
  | 'annule'
  | 'refus-utilisateur'
  | 'etat-invalide'
  | 'code-absent'
  | 'code-deja-utilise'
  | 'port-indisponible'
  | 'connexion-concurrente'

export class ErreurCallbackOAuth extends Error {
  constructor(
    public readonly raison: RaisonRefusCallback,
    message: string,
  ) {
    super(message)
    this.name = 'ErreurCallbackOAuth'
  }
}

export interface OptionsCallbackLoopback {
  port: number
  chemin: string
  /** Délai maximal d'attente du retour du navigateur. */
  delaiMs?: number
  /** Nombre de state incorrects tolérés avant d'abandonner. */
  tentativesMax?: number
}

export interface ResultatCallbackOAuth {
  code: string
}

const DELAI_DEFAUT_MS = 5 * 60_000
const TENTATIVES_DEFAUT = 5

function page(titre: string, message: string, succes: boolean): string {
  const couleur = succes ? '#2a7d4f' : '#a4232c'
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">` +
    `<title>${titre} — Sonal</title><style>body{font-family:system-ui,sans-serif;` +
    `display:flex;align-items:center;justify-content:center;height:100vh;margin:0;` +
    `background:#f5f6f7}.carte{background:#fff;padding:2rem 2.5rem;border-radius:8px;` +
    `box-shadow:0 1px 4px rgba(0,0,0,.12);max-width:26rem}h1{color:${couleur};font-size:1.3rem;` +
    `margin:0 0 .5rem}p{color:#4c4f52;margin:0}</style></head><body>` +
    `<div class="carte"><h1>${titre}</h1><p>${message}</p></div></body></html>`
}

/** Écoute une seule tentative de retour du navigateur. */
export class CallbackLoopbackOAuth {
  private serveur: Server | null = null
  private minuteur: NodeJS.Timeout | null = null
  private resoluteur: ((resultat: ResultatCallbackOAuth) => void) | null = null
  private rejet: ((erreur: ErreurCallbackOAuth) => void) | null = null
  private refuserDemarrage: ((erreur: ErreurCallbackOAuth) => void) | null = null
  private terminee = false
  private erreurTerminaison: ErreurCallbackOAuth | null = null
  private etatConsomme: string | null = null
  private tentatives = 0

  constructor(
    private readonly options: OptionsCallbackLoopback,
    private readonly etat: string,
  ) {}

  /** Démarre l'écoute et renvoie l'URI à enregistrer sur l'application GitLab. */
  async demarrer(): Promise<string> {
    if (!Number.isSafeInteger(this.options.port) || this.options.port <= 0) {
      throw new ErreurCallbackOAuth('port-indisponible', 'Port de callback GitLab invalide.')
    }
    const uri = `http://127.0.0.1:${this.options.port}${this.options.chemin}`
    if (this.serveur) throw new ErreurCallbackOAuth(
      'connexion-concurrente',
      'Une connexion GitLab est déjà en cours sur ce poste.',
    )
    const serveur = createServer((requete, reponse) => {
      this.servir(requete, reponse)
    })
    serveur.on('error', (erreur: NodeJS.ErrnoException) => {
      const refus = new ErreurCallbackOAuth(
        'port-indisponible',
        erreur.code === 'EADDRINUSE'
          ? `Le port ${this.options.port} est déjà utilisé par un autre programme. ` +
            'Fermez l’application qui l’occupe et réessayez.'
          : 'La callback GitLab n’a pas pu être ouverte.',
      )
      this.refuserDemarrage?.(refus)
      this.terminer(refus)
    })
    this.serveur = serveur
    await new Promise<void>((resolve, reject) => {
      this.refuserDemarrage = reject
      serveur.listen(this.options.port, '127.0.0.1', () => resolve())
    })
    this.refuserDemarrage = null
    this.minuteur = setTimeout(() => {
      this.terminer(new ErreurCallbackOAuth(
        'delai-depasse',
        'Délai de connexion GitLab dépassé. Recommencez.',
      ))
    }, this.options.delaiMs ?? DELAI_DEFAUT_MS)
    return uri
  }

  /** Attend le code d'autorisation, ou refuse la tentative. */
  attendre(): Promise<ResultatCallbackOAuth> {
    if (this.terminee && this.erreurTerminaison) {
      return Promise.reject(this.erreurTerminaison)
    }
    return new Promise<ResultatCallbackOAuth>((resolve, reject) => {
      this.resoluteur = resolve
      this.rejet = reject
    })
  }

  /** Ferme l'écoute ; une tentative en attente est déclarée annulée. */
  arreter(): void {
    this.terminer(new ErreurCallbackOAuth('annule', 'Connexion GitLab annulée.'))
  }

  private servir(requete: import('node:http').IncomingMessage, reponse: import('node:http').ServerResponse): void {
    const chemin = (requete.url ?? '/').split('?')[0]
    if (chemin !== this.options.chemin) {
      reponse.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      reponse.end('Introuvable')
      return
    }
    const hote = requete.headers.host
    if (hote !== `127.0.0.1:${this.options.port}`) {
      // Un nom d'hôte inattendu peut venir d'une résolution DNS locale :
      // ce n'est pas le navigateur qui revient, on ignore sans rien révéler.
      reponse.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
      reponse.end('Refusé')
      return
    }
    const url = new URL(requete.url ?? '/', `http://127.0.0.1:${this.options.port}`)
    const erreur = url.searchParams.get('error')
    if (erreur) {
      this.repondre(reponse, 'Connexion refusée',
        'La connexion GitLab a été refusée. Vous pouvez fermer cet onglet.', false)
      this.terminer(new ErreurCallbackOAuth(
        erreur === 'access_denied' ? 'refus-utilisateur' : 'etat-invalide',
        erreur === 'access_denied'
          ? 'Vous avez refusé l’accès demandé par Sonal.'
          : 'GitLab a refusé la connexion.',
      ))
      return
    }
    const etatRecu = url.searchParams.get('state')
    if (!etatValide(this.etat, etatRecu)) {
      this.tentatives += 1
      reponse.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      reponse.end('Refusé')
      if (this.tentatives >= (this.options.tentativesMax ?? TENTATIVES_DEFAUT)) {
        this.terminer(new ErreurCallbackOAuth(
          'etat-invalide',
          'La réponse du navigateur GitLab n’a pas pu être validée. Recommencez.',
        ))
      }
      return
    }
    if (this.etatConsomme === this.etat) {
      reponse.writeHead(409, { 'Content-Type': 'text/plain; charset=utf-8' })
      reponse.end('Déjà traitée')
      return
    }
    const code = url.searchParams.get('code')
    if (!code) {
      this.repondre(reponse, 'Connexion incomplète',
        'GitLab n’a pas renvoyé de code d’autorisation. Vous pouvez fermer cet onglet.', false)
      this.terminer(new ErreurCallbackOAuth(
        'code-absent',
        'GitLab n’a pas renvoyé de code d’autorisation.',
      ))
      return
    }
    this.etatConsomme = this.etat
    this.repondre(reponse, 'Connexion réussie',
      'Sonal est connecté à GitLab. Vous pouvez fermer cet onglet et revenir à Sonal.', true)
    const { resoluteur } = this
    this.fermer()
    resoluteur?.({ code })
  }

  private repondre(
    reponse: import('node:http').ServerResponse,
    titre: string,
    message: string,
    succes: boolean,
  ): void {
    reponse.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    reponse.end(page(titre, message, succes))
  }

  private terminer(erreur: ErreurCallbackOAuth): void {
    if (this.terminee) return
    this.terminee = true
    this.erreurTerminaison = erreur
    const { rejet } = this
    this.fermer()
    rejet?.(erreur)
  }

  private fermer(): void {
    if (this.minuteur) {
      clearTimeout(this.minuteur)
      this.minuteur = null
    }
    const serveur = this.serveur
    this.serveur = null
    if (serveur) {
      serveur.closeAllConnections?.()
      serveur.close()
    }
  }
}
