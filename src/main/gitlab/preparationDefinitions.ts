/**
 *  Préparation isolée d'une transaction de définitions.
 *
 *  Le store du miroir actif n'est jamais utilisé pour préparer et n'est jamais
 *  déverrouillé : il reste en lecture seule, et ne reçoit ni base fraîche ni
 *  candidat avant que leur statut soit certain. La préparation se fait donc dans
 *  un `CorpusStore` neuf, alimenté du seul `corpus.json` lu sur le serveur, et
 *  détruit en `finally`.
 *
 *  Un geste qui écrit une référence ou une recette a besoin des entretiens
 *  publiés qu'il contrôle : ils sont déposés dans ce store, et lui seuls. Sans
 *  cette liste explicite, les lectures « tolérantes » du store concluraient à
 *  tort à zéro usage sur un entretien absent, et un geste dependent des
 *  entretiens passerait pour un simple renommage de thème.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../corpusStore'
import { normaliserOrdreEntretiens } from '../../shared/corpus/ordreEntretiens'
import type { CorpusFichier } from '../../shared/format'

/** Un entretien lu sur GitLab, avec la garde qui le protège au commit. */
export interface SourcePreparation {
  readonly id: string
  readonly contenu: string
}

export interface ResultatPreparationDefinitions<T> {
  /** Valeur de retour du gesture métier, calculée sur la base fraîche. */
  readonly valeur: T
  /** Base normalisée lue sur le serveur : c'est elle qui décide d'un commit. */
  readonly baseFraîche: CorpusFichier
  /** Candidat produit par le geste, ou `null` si le geste n'a rien écrit. */
  readonly candidat: CorpusFichier | null
}

function contenuJson(valeur: unknown): string {
  return JSON.stringify(valeur, null, 2)
}

/** Deux états du corpus ne diffèrent que si leur JSON normalisé diffère.
 *  L'ordre des entretiens est normalisé : une base fraîche classée autrement
 *  que le miroir n'est pas, pour autant, un changement de fond. */
export function normaliserBaseCorpus(corpus: CorpusFichier): CorpusFichier {
  return normaliserOrdreEntretiens(structuredClone(corpus))
}

export function basesEquivalentes(gauche: CorpusFichier, droite: CorpusFichier): boolean {
  return contenuJson(normaliserBaseCorpus(gauche)) === contenuJson(normaliserBaseCorpus(droite))
}

/**
 *  Applique un geste de définitions sur la seule base fraîche du serveur.
 *
 *  `contenuServeur` sont les octets exacts reçus de GitLab, pas une
 *  reconstruction locale : la publication sous garde repart de ces octets.
 *  Les sources prévues sont déposées telles que lues sur l'instantané Git, et
 *  le store n'acquiert de droit de lecture que sur elles. Le geste est
 *  synchrone, borné à l'autorisation d'écriture du store jetable.
 */
export function preparerDefinitions<T>(
  contenuServeur: string,
  gesture: (store: CorpusStore) => T,
  sources: readonly SourcePreparation[] = [],
): ResultatPreparationDefinitions<T> {
  const dossier = mkdtempSync(join(tmpdir(), 'sonal-gitlab-definitions-'))
  try {
    const cheminCorpus = join(dossier, 'corpus.json')
    writeFileSync(cheminCorpus, contenuServeur, 'utf8')
    mkdirSync(join(dossier, 'entretiens'), { recursive: true })
    for (const source of sources) {
      writeFileSync(join(dossier, 'entretiens', `${source.id}.json`), source.contenu, 'utf8')
    }
    const store = new CorpusStore(dossier)
    store.activerModePreparation(sources.map((source) => source.id))
    const baseFraîche = store.ouvrir()
    const valeur = store.avecEcritureCorpus(() => gesture(store))
    const apres = store.ouvrir()
    const candidat = basesEquivalentes(baseFraîche, apres) ? null : apres
    return { valeur, baseFraîche, candidat }
  } finally {
    rmSync(dossier, { recursive: true, force: true })
  }
}
