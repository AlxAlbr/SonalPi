import { ContexteGitLab } from './gitlab/contexte'
import { ContexteCorpusDistant } from './distant/contexte'
import { exigerGeste, type FournisseurCorpus } from './gitlab/politiqueGestes'
import type { RetraitsVarianteAnon } from './retraitsVarianteAnon'
import type { ResultatCommandeContexte } from './transitionContexte'
import type { DemandeRetraitVarianteAnon } from '../shared/corpus/retraitVarianteAnon'

type Contexte = ContexteGitLab | ContexteCorpusDistant
interface Options<Capture extends { contexte: Contexte | null }> {
  local: RetraitsVarianteAnon
  capturer: () => Capture
  verifier: (capture: Capture) => void
  fournisseur: () => FournisseurCorpus
  executer: <T>(operation: (contexte: Contexte) => Promise<T>) => Promise<ResultatCommandeContexte<T>> | null
}

/** Lie les commandes de retrait à leur corpus, sans utiliser un miroir comme solution de repli. */
export class CommandesRetraitVarianteAnon<Capture extends { contexte: Contexte | null }> {
  constructor(private readonly options: Options<Capture>) {}
  async preparer(demande: DemandeRetraitVarianteAnon) {
    exigerGeste(this.options.fournisseur(), 'anon.retirer-variante')
    const origine = this.options.capturer(), contexte = origine.contexte
    if (!contexte) return this.options.local.preparer(demande)
    const distant = this.exigerDistant(contexte)
    return this.verifierApercu(origine, distant, await distant.preparerRetraitVarianteAnon(demande))
  }
  lireSuivi() {
    const contexte = this.options.capturer().contexte
    return contexte ? this.exigerDistant(contexte).lireSuiviRetraitVarianteAnon() : null
  }
  async relireSuivi(operationId: string) {
    const origine = this.options.capturer(), contexte = origine.contexte
    if (!contexte) throw new Error('Le suivi exige le corpus distant d’origine.')
    const bilan = await this.exigerDistant(contexte).relireSuiviRetraitVarianteAnon(operationId)
    this.options.verifier(origine)
    return bilan
  }
  async preparerReprise(operationId: string) {
    exigerGeste(this.options.fournisseur(), 'anon.retirer-variante')
    const origine = this.options.capturer(), contexte = origine.contexte
    if (!contexte) throw new Error('La reprise exige le corpus distant d’origine.')
    const distant = this.exigerDistant(contexte)
    return this.verifierApercu(origine, distant, await distant.preparerRepriseRetraitVarianteAnon(operationId))
  }
  appliquer(token: string, confirmee: boolean) {
    const origine = this.options.capturer(), contexte = origine.contexte
    if (!contexte) return this.options.local.appliquer(token, confirmee)
    const distant = this.exigerDistant(contexte)
    const execution = this.options.executer((courant) => {
      if (courant !== distant) {
        distant.oublierApercuRetraitVarianteAnon(token)
        throw new Error('Le corpus a changé. Recalculez le retrait de variante.')
      }
      try {
        this.options.verifier(origine)
        exigerGeste(this.options.fournisseur(), 'anon.retirer-variante')
      }
      catch (e) { distant.oublierApercuRetraitVarianteAnon(token); throw e }
      return distant.retirerVarianteAnon(token, confirmee)
    })
    if (!execution) {
      distant.oublierApercuRetraitVarianteAnon(token)
      throw new Error('Le corpus distant du retrait de variante est indisponible.')
    }
    return execution.then((resultat) => {
      if (!resultat.courant) {
        distant.oublierApercuRetraitVarianteAnon(token)
        throw new Error('Le corpus a changé pendant le retrait. Rouvrez le corpus cible sans recommencer.')
      }
      return resultat.valeur
    })
  }
  private exigerDistant(contexte: Contexte): Contexte {
    if (!(contexte instanceof ContexteGitLab) && !(contexte instanceof ContexteCorpusDistant)) throw new Error('Le corpus distant du retrait de variante est indisponible. Aucun repli sur le miroir.')
    return contexte
  }
  private verifierApercu<T extends { token: string }>(origine: Capture, contexte: Contexte, apercu: T): T {
    try {
      this.options.verifier(origine)
      exigerGeste(this.options.fournisseur(), 'anon.retirer-variante')
    } catch (e) { contexte.oublierApercuRetraitVarianteAnon(apercu.token); throw e }
    return apercu
  }
}
