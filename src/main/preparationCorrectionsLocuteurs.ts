import { randomUUID } from 'node:crypto'
import type { CorpusFichier, EntretienFichier } from '../shared/format'
import type { CommandeCorrectionLocuteurs } from '../shared/corpus/contratsLocuteurs'
import { validerCommandeCorrectionLocuteurs } from '../shared/corpus/contratsLocuteurs'
import { appliquerCorrectionLocuteurs } from '../shared/corpus/correctionsLocuteurs'
import { inventorierPersonnes } from '../shared/corpus/personnes'
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

/** Prépare les corrections sur des sources complètes, sans lire ni écrire le miroir. */
export function preparerCorrectionLocuteurs(
  contenuCorpus: string,
  sources: readonly SourceCorrectionLocuteurs[],
  commande: CommandeCorrectionLocuteurs,
  options: { genererId?: () => string; maintenant?: () => string } = {},
): PlanCorrectionLocuteurs {
  validerCommandeCorrectionLocuteurs(commande)
  const corpusAvant: unknown = JSON.parse(contenuCorpus)
  validerCorpusNatif(corpusAvant)
  const recus = new Map(sources.map((s) => [s.id, s]))
  const ids = Object.keys(corpusAvant.membership)
  if (recus.size !== sources.length || ids.length !== recus.size || ids.some((id) => !recus.has(id))) {
    throw new Error('Tous les entretiens du corpus doivent être disponibles avant de corriger les locuteurs.')
  }
  const corpusApres = structuredClone(corpusAvant)
  const fichiers = ids.map((id) => {
    const avant: unknown = JSON.parse(recus.get(id)!.contenu)
    validerEntretienNatif(avant)
    return { id, titre: corpusAvant.membership[id].titre, avant, apres: structuredClone(avant) }
  })
  const inventaire = { ...inventorierPersonnes(corpusAvant, fichiers.map((f) => ({ id: f.id, titre: f.titre, data: f.avant }))), indisponibles: [] }
  if (JSON.stringify(inventaire) !== commande.attendu) {
    throw new Error('Les locuteurs ou les entretiens ont changé. Actualisez puis vérifiez à nouveau la correction.')
  }
  if (commande.type === 'reprendreInformations' && commande.choix.variables.some((id) =>
    !Object.hasOwn(corpusAvant.variables, id) || corpusAvant.variables[id].portee !== 'participation')) {
    throw new Error('La définition de ces données a changé. Actualisez les détails avant de reprendre les informations.')
  }
  const locuteurId = appliquerCorrectionLocuteurs(corpusApres,
    fichiers.map((f) => ({ id: f.id, titre: f.titre, data: f.apres })), commande,
    options.genererId ?? (() => `pers-${randomUUID()}`))
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
