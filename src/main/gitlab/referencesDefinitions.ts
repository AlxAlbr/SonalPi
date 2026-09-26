import { normaliserCategoriesNote } from '../../shared/entretien/notes'
import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier } from '../../shared/format'

/** Refus d'une publication qui réintroduirait une définition supprimée. */
export class ReferencesDefinitionsInvalidesError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReferencesDefinitionsInvalidesError'
  }
}

/** Vérifie toutes les références d'un entretien vers les définitions du corpus. */
export function verifierReferencesDefinitions(
  entretien: EntretienFichier,
  corpus: CorpusFichier,
): void {
  if (entretien.formatVersion !== FORMAT_VERSION) {
    throw new ReferencesDefinitionsInvalidesError(
      'La version de l’entretien n’est pas prise en charge.',
    )
  }
  if (
    !Array.isArray(entretien.annotations) ||
    !Array.isArray(entretien.locuteurs) ||
    !entretien.meta ||
    typeof entretien.meta.valeursGen !== 'object'
  ) {
    throw new ReferencesDefinitionsInvalidesError('L’entretien à publier est incomplet.')
  }

  for (const annotation of entretien.annotations) {
    if (
      annotation.type === 'codage' &&
      annotation.code &&
      !corpus.codebook[annotation.code]
    ) {
      throw referenceSupprimee('thème', annotation.code, false)
    }
    if (
      annotation.type === 'anon' &&
      annotation.regle &&
      !corpus.reglesAnon[annotation.regle]
    ) {
      throw referenceSupprimee('règle d’anonymisation', annotation.regle, true)
    }
  }

  const categoriesNotes = new Set(
    normaliserCategoriesNote(corpus.categoriesNote).map((categorie) => categorie.id),
  )
  for (const note of entretien.notes ?? []) {
    if (!categoriesNotes.has(note.categorieId)) {
      throw referenceSupprimee('catégorie de note', note.categorieId, true)
    }
  }

  verifierValeurs(entretien.meta?.valeursGen ?? {}, corpus)
  for (const locuteur of entretien.locuteurs) {
    verifierValeurs(locuteur.valeursLoc ?? {}, corpus)
  }
}

/** Parse les deux documents avant de vérifier leurs références. */
export function verifierContenusReferencesDefinitions(
  contenuEntretien: string,
  contenuCorpus: string,
): void {
  let entretien: EntretienFichier
  let corpus: CorpusFichier
  try {
    entretien = JSON.parse(contenuEntretien) as EntretienFichier
  } catch {
    throw new ReferencesDefinitionsInvalidesError('L’entretien à publier est illisible.')
  }
  try {
    corpus = JSON.parse(contenuCorpus) as CorpusFichier
  } catch {
    throw new Error('Le fichier corpus.json de GitLab est illisible.')
  }
  if (corpus.formatVersion !== FORMAT_VERSION) {
    throw new Error('La version du corpus GitLab n’est pas prise en charge.')
  }
  verifierReferencesDefinitions(entretien, corpus)
}

function verifierValeurs(
  valeurs: Record<string, string>,
  corpus: CorpusFichier,
): void {
  for (const [variableId, modaliteId] of Object.entries(valeurs)) {
    const variable = corpus.variables[variableId]
    if (!variable) throw referenceSupprimee('variable', variableId, true)
    if (modaliteId && !variable.modalites.some((modalite) => modalite.id === modaliteId)) {
      throw referenceSupprimee('modalité', modaliteId, true)
    }
  }
}

function referenceSupprimee(
  type: string,
  id: string,
  feminin: boolean,
): ReferencesDefinitionsInvalidesError {
  return new ReferencesDefinitionsInvalidesError(
    `La publication référence ${feminin ? 'la' : 'le'} ${type} supprimé${feminin ? 'e' : ''} « ${id} ». `
    + 'Retirez cette référence de l’entretien, puis publiez de nouveau.',
  )
}
