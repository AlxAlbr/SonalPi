import { lireBarriereRetraitVarianteAnon, memeVarianteAnon } from '../../shared/corpus/barriereRetraitVarianteAnon'
import { normaliserCategoriesNote } from '../../shared/entretien/notes'
import { verifierChoixPseudosAnon } from '../../shared/corpus/choixPseudosAnon'
import { exigerAbsenceSuppressionAnon, lireBarriereSuppressionAnon } from '../../shared/corpus/barriereSuppressionAnon'
import { versionSupportee, type CorpusFichier, type EntretienFichier } from '../../shared/format'

/** Refus d’une publication incompatible avec les définitions courantes. */
export class ReferencesDefinitionsInvalidesError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReferencesDefinitionsInvalidesError'
  }
}

/** Les mutations concurrentes du corpus ne peuvent retirer ni altérer une barrière publiée. */
export function exigerAbsenceDissociationGitLab(corpus: CorpusFichier): void {
  exigerAbsenceSuppressionAnon(corpus)
  if (corpus.dissociationAnon !== undefined) throw new Error('Une dissociation GitLab est engagée. Reprenez son suivi avant toute autre mutation du corpus.')
}

/** Vérifie toutes les références d'un entretien vers les définitions du corpus. */
export function verifierReferencesDefinitions(
  entretien: EntretienFichier,
  corpus: CorpusFichier,
  avant?: EntretienFichier,
): void {
  if (!versionSupportee(entretien.formatVersion)) {
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

  const barriere = corpus.dissociationAnon
  if (barriere !== undefined && (!barriere || typeof barriere !== 'object'
    || typeof barriere.regleId !== 'string' || !barriere.regleId.trim()
    || typeof barriere.operationId !== 'string' || !/^dissociation-[a-zA-Z0-9_-]+$/.test(barriere.operationId))) {
    throw new ReferencesDefinitionsInvalidesError('L’état publié de dissociation est invalide. Aucun entretien publié.')
  }
  let suppression: ReturnType<typeof lireBarriereSuppressionAnon>
  try { suppression = lireBarriereSuppressionAnon(corpus) }
  catch (e) { throw new ReferencesDefinitionsInvalidesError(e instanceof Error ? e.message : 'État de suppression invalide.') }
  let retrait: ReturnType<typeof lireBarriereRetraitVarianteAnon>
  try { retrait = lireBarriereRetraitVarianteAnon(corpus) }
  catch (e) { throw new ReferencesDefinitionsInvalidesError(e instanceof Error ? e.message : 'État de retrait invalide.') }
  for (const annotation of entretien.annotations) {
    if (retrait && annotation.regle === retrait.regleId && typeof annotation.pseudo === 'string' && memeVarianteAnon(annotation.pseudo, retrait.pseudoRetire)) {
      throw new ReferencesDefinitionsInvalidesError('Cette variante est en cours de retrait. Aucun ancien choix lié, même mémorisé dans une exception, ne peut être réintroduit.')
    }
    if (annotation.type === 'anon' && annotation.regle && annotation.etat === 'exception' && typeof annotation.pseudo === 'string') {
      const ancienne = avant?.annotations.find((a) => a.id === annotation.id && a.type === 'anon' && a.regle === annotation.regle)
      const inchange = ancienne && ancienne.pseudo === annotation.pseudo
      const regle = corpus.reglesAnon[annotation.regle]
      if (!inchange && (!regle || !regle.pseudos.includes(annotation.pseudo.trim().normalize('NFC')))) {
        throw new ReferencesDefinitionsInvalidesError('Le pseudonyme mémorisé de cette nouvelle exception n’est plus déclaré. Actualisez les règles avant d’enregistrer.')
      }
    }
    if (suppression && annotation.regle === suppression.regleId) {
      throw new ReferencesDefinitionsInvalidesError('La règle est en cours de suppression. Relisez l’entretien publié avant de l’enregistrer ; aucun ancien lien ne peut être réintroduit.')
    }
    if (barriere && annotation.regle === barriere.regleId) {
      throw new ReferencesDefinitionsInvalidesError('La règle est en cours de dissociation. Relisez l’entretien publié avant de l’enregistrer ; aucun ancien lien ne peut être réintroduit.')
    }
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
  if (avant) {
    try { verifierChoixPseudosAnon(entretien.annotations, corpus.reglesAnon, avant.annotations) } catch (e) {
      throw new ReferencesDefinitionsInvalidesError(e instanceof Error ? e.message : 'Choix de variante invalide.')
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
  contenuAvant?: string,
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
  if (!versionSupportee(corpus.formatVersion)) {
    throw new Error('La version du corpus GitLab n’est pas prise en charge.')
  }
  let avant: EntretienFichier | undefined
  if (contenuAvant !== undefined) {
    try { avant = JSON.parse(contenuAvant) as EntretienFichier } catch {
      throw new ReferencesDefinitionsInvalidesError('La base publiée de l’entretien est illisible.')
    }
    if (!Array.isArray(avant?.annotations)) throw new ReferencesDefinitionsInvalidesError('La base publiée de l’entretien est incomplète.')
  }
  verifierReferencesDefinitions(entretien, corpus, avant)
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
