import type { Locuteur } from '../shared/locuteurs'
import { FORMAT_NATIF_LOCUTEURS, type CorpusFichier, type EntretienFichier } from '../shared/natif/format'
import { validerCorpusNatif } from '../shared/natif/validation'
import { ajouterEntretienOrdre } from '../shared/corpus/ordreEntretiens'
import { validerAjoutEntretienNatif, type PlanAjoutEntretienNatif } from './transactionsFichiers'

/** Prépare les fichiers ensemble, sans écriture et sans rapprochement par nom. */
export function preparerAjoutEntretienNatif(
  corpus: CorpusFichier,
  id: string,
  titre: string,
  entretien: EntretienFichier,
  identites: readonly Locuteur[] = [],
): PlanAjoutEntretienNatif {
  validerCorpusNatif(corpus)
  if (Object.hasOwn(corpus.membership, id)) throw new Error('Cet entretien existe déjà dans le corpus.')
  const corpusAvant = structuredClone(corpus)
  const corpusApres = structuredClone(corpus)
  for (const identite of identites) {
    if (Object.hasOwn(corpusApres.locuteurs, identite.id)) throw new Error('Cet identifiant de locuteur est déjà utilisé.')
    Object.defineProperty(corpusApres.locuteurs, identite.id, {
      value: structuredClone(identite), enumerable: true, configurable: true, writable: true,
    })
  }
  const donnees = structuredClone(entretien)
  ajouterEntretienOrdre(corpusApres, id, { titre, date: null, lastModified: donnees.lastModified })
  const plan: PlanAjoutEntretienNatif = { operation: 'ajout', id, corpusAvant, corpusApres, entretien: donnees }
  validerAjoutEntretienNatif(plan)
  return plan
}

/** Un entretien vide n'introduit aucune identité ni participation fictive. */
export function preparerCreationEntretienNatif(corpus: CorpusFichier, id: string, titre: string, date: string): PlanAjoutEntretienNatif {
  return preparerAjoutEntretienNatif(corpus, id, titre, {
    formatVersion: FORMAT_NATIF_LOCUTEURS, lastModified: date,
    corpsTexte: { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: null } }] },
    annotations: [], ancres: [], participations: [], brouillonsAnon: [], reperesPassages: [],
    meta: { valeursGen: {}, audioRef: null },
  })
}
