import type { CorpusStore } from './corpusStore'
import { exigerGeste, RefusGesteError, type FournisseurCorpus } from './gitlab/politiqueGestes'
import {
  RefusOperationTheme,
  type ApercuOperationTheme,
  type DemandeOperationTheme,
  type DetailsOperationTheme,
  type OptionsExecutionOperationTheme,
  type ProgressionOperationTheme,
  type ResultatOperationTheme,
  type PreparationRepriseOperationTheme,
  type SuiviOperationTheme,
} from '../shared/corpus/themes'

interface DependancesHandlersThemes {
  store: () => CorpusStore
  fournisseur: () => FournisseurCorpus
  progression: (etat: ProgressionOperationTheme) => void
  gitlab?: {
    analyser: (demande: DemandeOperationTheme, operationPrecedente?: string) => Promise<ApercuOperationTheme>
    details: (operationId: string, entretienId: string) => Promise<DetailsOperationTheme>
    executer?: (id: string, demande: DemandeOperationTheme, options: OptionsExecutionOperationTheme, progression: (etat: ProgressionOperationTheme) => void) => Promise<ResultatOperationTheme>
    lireSuivi?: () => Promise<SuiviOperationTheme | null>
    preparerReprise?: (id: string) => Promise<PreparationRepriseOperationTheme>
    reconcilier?: (id: string) => Promise<ResultatOperationTheme>
    abandonner?: (id: string) => Promise<void>
  }
  webdav?: {
    analyser: (demande: DemandeOperationTheme, operationPrecedente?: string) => Promise<ApercuOperationTheme>
    details: (operationId: string, entretienId: string) => Promise<DetailsOperationTheme>
    executer?: (id: string, demande: DemandeOperationTheme, options: OptionsExecutionOperationTheme, progression: (etat: ProgressionOperationTheme) => void) => Promise<ResultatOperationTheme>
    lireSuivi?: () => Promise<SuiviOperationTheme | null>
    preparerReprise?: (id: string) => Promise<PreparationRepriseOperationTheme>
    reconcilier?: (id: string) => Promise<ResultatOperationTheme>
    abandonner?: (id: string) => Promise<void>
  }
}

/** Les capacités ne remplacent jamais la garde métier, notamment pour une division destructive. */
export function exigerGestesOperationTheme(fournisseur: FournisseurCorpus, demande: DemandeOperationTheme): void {
  if (demande?.type === 'transfert') {
    exigerGeste(fournisseur, 'theme.transferer')
    if (!demande.conserverSource) exigerGeste(fournisseur, 'theme.transferer-supprimer-source')
  }
  else if (demande?.type === 'fusion') exigerGeste(fournisseur, 'theme.fusionner')
  else if (demande?.type === 'division') {
    exigerGeste(fournisseur, 'theme.diviser')
    if (demande.effacerSource) exigerGeste(fournisseur, 'theme.diviser-supprimer-source')
  } else throw new RefusOperationTheme('Opération de thématique inconnue.')
}

/** Le parcours distant ne doit pas se rabattre sur une lecture ou une écriture du miroir. */
export function creerHandlersOperationsThemes(deps: DependancesHandlersThemes) {
  const exigerLocal = () => {
    if (deps.fournisseur() !== 'local') {
      throw new RefusGesteError('theme.operation', 'Le parcours d’opérations sur les thématiques n’est pas encore livré pour ce corpus distant.')
    }
  }
  return {
    analyser(demande: DemandeOperationTheme, operationPrecedente?: string) {
      if (deps.fournisseur() === 'gitlab' && deps.gitlab) return deps.gitlab.analyser(demande, operationPrecedente)
      exigerGestesOperationTheme(deps.fournisseur(), demande)
      if (deps.fournisseur() === 'webdav' && deps.webdav) {
        return deps.webdav.analyser(demande, operationPrecedente)
      }
      exigerLocal()
      return deps.store().analyserOperationTheme(demande, operationPrecedente)
    },
    details(operationId: string, entretienId: string) {
      if (deps.fournisseur() === 'gitlab' && deps.gitlab) return deps.gitlab.details(operationId, entretienId)
      if (deps.fournisseur() === 'webdav' && deps.webdav) {
        return deps.webdav.details(operationId, entretienId)
      }
      exigerLocal()
      return deps.store().detailsOperationTheme(operationId, entretienId)
    },
    lireSuivi() {
      if (deps.fournisseur() === 'local') return null
      if (deps.fournisseur() === 'gitlab' && deps.gitlab?.lireSuivi) return deps.gitlab.lireSuivi()
      if (deps.fournisseur() === 'webdav' && deps.webdav?.lireSuivi) return deps.webdav.lireSuivi()
      exigerLocal()
      return null
    },
    preparerReprise(id: string) {
      exigerGeste(deps.fournisseur(), 'theme.transferer')
      if (deps.fournisseur() === 'gitlab' && deps.gitlab?.preparerReprise) return deps.gitlab.preparerReprise(id)
      if (deps.fournisseur() === 'webdav' && deps.webdav?.preparerReprise) return deps.webdav.preparerReprise(id)
      throw new RefusOperationTheme('Ce corpus ne dispose pas de reprise distante des thématiques.')
    },
    reconcilier(id: string) {
      exigerGeste(deps.fournisseur(), 'theme.transferer')
      if (deps.fournisseur() === 'gitlab' && deps.gitlab?.reconcilier) return deps.gitlab.reconcilier(id)
      if (deps.fournisseur() === 'webdav' && deps.webdav?.reconcilier) return deps.webdav.reconcilier(id)
      throw new RefusOperationTheme('Ce corpus ne dispose pas de réconciliation distante des thématiques.')
    },
    abandonner(id: string) {
      exigerGeste(deps.fournisseur(), 'theme.transferer')
      if (deps.fournisseur() === 'gitlab' && deps.gitlab?.abandonner) return deps.gitlab.abandonner(id)
      if (deps.fournisseur() === 'webdav' && deps.webdav?.abandonner) return deps.webdav.abandonner(id)
      throw new RefusOperationTheme('Ce corpus ne dispose pas de suivi distant des thématiques.')
    },
    executer(operationId: string, demande: DemandeOperationTheme, options: OptionsExecutionOperationTheme) {
      exigerGestesOperationTheme(deps.fournisseur(), demande)
      if (deps.fournisseur() === 'gitlab' && deps.gitlab?.executer) {
        return deps.gitlab.executer(operationId, demande, options, deps.progression)
      }
      if (deps.fournisseur() === 'webdav' && deps.webdav?.executer) {
        return deps.webdav.executer(operationId, demande, options, deps.progression)
      }
      exigerLocal()
      return deps.store().executerOperationTheme(operationId, demande, options, deps.progression)
    },
  }
}
