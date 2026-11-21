import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CorpusFichier, EntretienFichier } from '../shared/format'
import { validerCorpusNatif, validerEntretienNatif } from '../shared/natif/validation'

export interface ModeleExempleNatif {
  corpus: CorpusFichier
  entretiens: Record<string, EntretienFichier>
}

/** Valide le modèle livré avant toute copie dans un corpus d'apprentissage. */
export function preparerModeleExempleNatif(ressources: string): ModeleExempleNatif {
  const racine = join(ressources, 'CorpusSynthAnnot')
  if (existsSync(join(racine, '.transaction-fichiers.json'))) {
    throw new Error('Le modèle contient une opération à terminer avant son installation.')
  }
  const corpus: unknown = JSON.parse(readFileSync(join(racine, 'corpus.crp'), 'utf8'))
  validerCorpusNatif(corpus)
  if (corpus.nom !== 'CorpusSynthAnnot') throw new Error('Ce modèle ne correspond pas au corpus annoté fourni.')
  const entretiens: Record<string, EntretienFichier> = {}
  for (const id of Object.keys(corpus.membership)) {
    const entretien: unknown = JSON.parse(readFileSync(join(racine, 'entretiens', `${id}.json`), 'utf8'))
    validerEntretienNatif(entretien)
    entretiens[id] = entretien
  }
  return { corpus, entretiens }
}
