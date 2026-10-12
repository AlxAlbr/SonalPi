import { ContexteGitLab } from './gitlab/contexte'
import type { ContexteCorpusDistant } from './distant/contexte'
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
    const gitlab = this.exigerGitLab(contexte)
    return this.verifierApercu(origine, gitlab, await gitlab.preparerRetraitVarianteAnon(demande))
  }
  lireSuivi() {
    const contexte = this.options.capturer().contexte
    return contexte instanceof ContexteGitLab ? contexte.lireSuiviRetraitVarianteAnon() : null
  }
  async relireSuivi(operationId: string) {
    const origine = this.options.capturer(), contexte = origine.contexte
    if (!(contexte instanceof ContexteGitLab)) throw new Error('Le suivi exige le corpus distant d’origine.')
    const bilan = await contexte.relireSuiviRetraitVarianteAnon(operationId)
    this.options.verifier(origine)
    return bilan
  }
  async preparerReprise(operationId: string) {
    exigerGeste(this.options.fournisseur(), 'anon.retirer-variante')
    const origine = this.options.capturer(), contexte = origine.contexte
    if (!(contexte instanceof ContexteGitLab)) throw new Error('La reprise exige le corpus distant d’origine.')
    return this.verifierApercu(origine, contexte, await contexte.preparerRepriseRetraitVarianteAnon(operationId))
  }
  appliquer(token: string, confirmee: boolean) {
    const origine = this.options.capturer(), contexte = origine.contexte
    if (!contexte) return this.options.local.appliquer(token, confirmee)
    const gitlab = this.exigerGitLab(contexte)
    const execution = this.options.executer((courant) => {
      if (courant !== gitlab) {
        gitlab.oublierApercuRetraitVarianteAnon(token)
        throw new Error('Le corpus a changé. Recalculez le retrait de variante.')
      }
      try {
        this.options.verifier(origine)
        exigerGeste(this.options.fournisseur(), 'anon.retirer-variante')
      }
      catch (e) { gitlab.oublierApercuRetraitVarianteAnon(token); throw e }
      return gitlab.retirerVarianteAnon(token, confirmee)
    })
    if (!execution) {
      gitlab.oublierApercuRetraitVarianteAnon(token)
      throw new Error('Le corpus distant du retrait de variante est indisponible.')
    }
    return execution.then((resultat) => {
      if (!resultat.courant) {
        gitlab.oublierApercuRetraitVarianteAnon(token)
        throw new Error('Le corpus a changé pendant le retrait. Rouvrez le corpus cible sans recommencer.')
      }
      return resultat.valeur
    })
  }
  private exigerGitLab(contexte: Contexte): ContexteGitLab {
    if (!(contexte instanceof ContexteGitLab)) throw new Error('Le retrait de variante n’est pas qualifié pour ce fournisseur distant. Aucun repli sur le miroir.')
    return contexte
  }
  private verifierApercu<T extends { token: string }>(origine: Capture, contexte: ContexteGitLab, apercu: T): T {
    try {
      this.options.verifier(origine)
      exigerGeste(this.options.fournisseur(), 'anon.retirer-variante')
    } catch (e) { contexte.oublierApercuRetraitVarianteAnon(apercu.token); throw e }
    return apercu
  }
}
