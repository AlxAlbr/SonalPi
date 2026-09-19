/**
 *  Assemblage d'instantanés pour l'export de lot : un entretien NON ouvert
 *  est lu depuis les fichiers natifs par le main, jamais par le renderer.
 *  Aucun verrou d'écriture n'est requis — l'export est une lecture, et un
 *  entretien en échec est un échec typé, jamais une exception qui rompt le lot.
 */
import type { CorpusStore } from './corpusStore'
import type { ResultatInstantaneCorpus } from '../shared/export/corpus'
import { assemblerInstantaneCorpus } from '../shared/export/corpus'
import { urlAudioLocal } from './exportEntretien'

/** Assemble l'instantané complet d'un entretien non ouvert : fichier natif
 *  lu par le store, définitions du corpus courant, URL audio résolue par le
 *  main (null si média absent ou inaccessible). */
export function assemblerInstantaneDistant(
  store: CorpusStore,
  id: string,
): ResultatInstantaneCorpus {
  let corpus
  try {
    corpus = store.ouvrir()
  } catch (erreur) {
    return {
      etat: 'echec',
      message: `Le corpus n'a pas pu être relu : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
    }
  }
  const lecture = store.lireEntretien(id)
  if (!lecture.ok) {
    const titre = corpus.membership[id]?.titre ?? id
    return {
      etat: 'echec',
      message:
        lecture.raison === 'version'
          ? `L'entretien « ${titre} » est dans une version de fichier non prise en charge.`
          : `L'entretien « ${titre} » est introuvable dans le corpus.`,
    }
  }
  const audioRef = lecture.data.meta.audioRef
  const audioLocal = audioRef ? urlAudioLocal(store, audioRef) : null
  return {
    etat: 'succes',
    instantane: assemblerInstantaneCorpus(id, lecture.data, corpus, audioLocal),
  }
}
