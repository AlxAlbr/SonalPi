import type { CorpusFichier } from '../shared/format'
import {
  referencesAjouteesCommandeCas,
  type CommandeCas,
  type SourcePassageCas,
} from '../shared/corpus/cas'

export interface DependancesCommandeCas {
  sessionsTenues: () => string[]
  publierEntretien: (entretienId: string) => Promise<{ ok: boolean; raison?: string }>
  verifierReferencesPubliees?: (references: SourcePassageCas[]) => Promise<void>
  repereExiste: (entretienId: string, repereId: string) => boolean
  executerDefinitions: () => Promise<CorpusFichier> | CorpusFichier
  /** Transaction distante qui relit aussi les entretiens de contrôle. */
  executerDefinitionsAvecSources?: () => Promise<CorpusFichier> | CorpusFichier
}

/** Publie les sources concernées avant la transaction courte sur le corpus. */
export async function executerCommandeCas(
  commande: CommandeCas,
  deps: DependancesCommandeCas,
): Promise<CorpusFichier> {
  const references = referencesAjouteesCommandeCas(commande)
  const ajoutDerivation = commande.type === 'ajouter-derivation-famille'
    || commande.type === 'ajouter-derivation-cas'
  const tenues = new Set(deps.sessionsTenues())
  const entretiens = new Set(references.map((reference) => reference.entretienId))
  // Une recette est contrôlée sur toutes ses sources. Les sources détenues par
  // cette session sont donc publiées avant la transaction de lecture fraîche.
  if (ajoutDerivation) for (const entretienId of tenues) entretiens.add(entretienId)
  for (const entretienId of entretiens) {
    if (!tenues.has(entretienId)) continue
    const publication = await deps.publierEntretien(entretienId)
    if (!publication.ok) {
      throw new Error(`Le passage n'a pas été publié (${publication.raison ?? 'échec inconnu'}).`)
    }
  }

  await deps.verifierReferencesPubliees?.(references)
  for (const reference of references) {
    if (!deps.repereExiste(reference.entretienId, reference.repereId)) {
      throw new Error("Le repère du passage n'a pas été enregistré dans l'entretien.")
    }
  }
  if (ajoutDerivation && deps.executerDefinitionsAvecSources) {
    return deps.executerDefinitionsAvecSources()
  }
  return deps.executerDefinitions()
}
