import { randomUUID } from 'node:crypto'
import type { CorpusFichier, EntretienFichier } from '../shared/format'
import type { CommandeCorrectionLocuteurs, OperationNommageLocuteurs } from '../shared/corpus/contratsLocuteurs'
import { validerCommandeCorrectionLocuteurs, validerOperationNommageLocuteurs } from '../shared/corpus/contratsLocuteurs'
import { appliquerCorrectionLocuteurs } from '../shared/corpus/correctionsLocuteurs'
import { identifierParticipationNommage, rapprocherParticipationsNommage } from '../shared/corpus/nommageLocuteurs'
import { inventorierLocuteurs } from '../shared/corpus/inventaireLocuteurs'
import { validerCorpusNatif, validerEntretienNatif } from '../shared/natif/validation'

export interface SourceCorrectionLocuteurs {
  id: string
  contenu: string
}

export interface PlanCorrectionLocuteurs {
  locuteurId: string
  corpusAvant: CorpusFichier
  corpusApres: CorpusFichier
  entretiens: { id: string; avant: EntretienFichier; apres: EntretienFichier }[]
}

interface OptionsPreparation {
  genererId?: () => string
  maintenant?: () => string
}
interface FichierPreparation {
  id: string
  titre: string
  data: EntretienFichier
}

/** Prépare les corrections sur des sources complètes, sans lire ni écrire le miroir. */
export function preparerCorrectionLocuteurs(
  contenuCorpus: string,
  sources: readonly SourceCorrectionLocuteurs[],
  commande: CommandeCorrectionLocuteurs,
  options: OptionsPreparation = {},
): PlanCorrectionLocuteurs {
  validerCommandeCorrectionLocuteurs(commande)
  return preparerPlan(contenuCorpus, sources, options, (corpus, fichiers) => {
    verifierInventaire(corpus, fichiers, commande.attendu)
    if (commande.type === 'reprendreInformations' && commande.choix.variables.some((id) =>
      !Object.hasOwn(corpus.variables, id) || corpus.variables[id].portee !== 'participation')) {
      throw new Error('La définition de ces données a changé. Actualisez les détails avant de reprendre les informations.')
    }
    return appliquerCorrectionLocuteurs(corpus, fichiers, commande, options.genererId ?? genererId)
  })
}

/** La création n’a besoin que de la voix courante ; un rapprochement contrôle tout le corpus. */
export function preparerNommageLocuteurs(
  contenuCorpus: string,
  sources: readonly SourceCorrectionLocuteurs[],
  operation: OperationNommageLocuteurs,
  options: OptionsPreparation = {},
): PlanCorrectionLocuteurs {
  validerOperationNommageLocuteurs(operation)
  return preparerPlan(contenuCorpus, sources, options, (corpus, fichiers) => {
    if (operation.type === 'identifierAuNommage') {
      return identifierParticipationNommage(corpus, fichiers[0].data, operation.demande, options.genererId ?? genererId)
    }
    verifierInventaire(corpus, fichiers, operation.demande.attendu)
    return rapprocherParticipationsNommage(corpus, fichiers, operation.demande)
  }, operation.type === 'identifierAuNommage' ? operation.demande.entretienId : undefined)
}

function genererId(): string { return `pers-${randomUUID()}` }
function verifierInventaire(corpus: CorpusFichier, fichiers: FichierPreparation[], attendu: string) {
  const inventaire = { ...inventorierLocuteurs(corpus, fichiers), indisponibles: [] }
  if (JSON.stringify(inventaire) !== attendu) {
    throw new Error('Les locuteurs ou les entretiens ont changé. Actualisez puis vérifiez à nouveau la correction.')
  }
}

function preparerPlan(
  contenuCorpus: string,
  sources: readonly SourceCorrectionLocuteurs[],
  options: OptionsPreparation,
  modifier: (corpus: CorpusFichier, fichiers: FichierPreparation[]) => string,
  entretienUnique?: string,
): PlanCorrectionLocuteurs {
  const corpusAvant: unknown = JSON.parse(contenuCorpus)
  validerCorpusNatif(corpusAvant)
  const recus = new Map(sources.map((s) => [s.id, s]))
  const ids = entretienUnique === undefined ? Object.keys(corpusAvant.membership) : [entretienUnique]
  if (recus.size !== sources.length || ids.length !== recus.size || ids.some((id) => !Object.hasOwn(corpusAvant.membership, id) || !recus.has(id))) {
    throw new Error(entretienUnique === undefined ? 'Tous les entretiens du corpus doivent être disponibles avant de corriger les locuteurs.' : 'Cet entretien est indisponible ou ne fait plus partie du corpus.')
  }
  const corpusApres = structuredClone(corpusAvant)
  const fichiers = ids.map((id) => {
    const avant: unknown = JSON.parse(recus.get(id)!.contenu)
    validerEntretienNatif(avant)
    return { id, titre: corpusAvant.membership[id].titre, avant, apres: structuredClone(avant) }
  })
  const locuteurId = modifier(corpusApres, fichiers.map((f) => ({ id: f.id, titre: f.titre, data: f.apres })))
  const entretiens = fichiers.filter((f) => JSON.stringify(f.avant) !== JSON.stringify(f.apres))
  const maintenant = (options.maintenant ?? (() => new Date().toISOString()))()
  for (const f of entretiens) {
    f.apres.lastModified = maintenant
    corpusApres.membership[f.id].lastModified = maintenant
    validerEntretienNatif(f.apres)
  }
  validerCorpusNatif(corpusApres)
  return { locuteurId, corpusAvant, corpusApres, entretiens: entretiens.map(({ id, avant, apres }) => ({ id, avant, apres })) }
}
