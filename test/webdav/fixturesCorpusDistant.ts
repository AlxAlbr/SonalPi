import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier } from '../../src/shared/format'
import { squeletteCorpus } from '../../src/shared/corpus/squelette'

export function corpusDistantValide(ids: string[] = []): string {
  const corpus: CorpusFichier = squeletteCorpus('Corpus distant de test')
  corpus.membership = Object.fromEntries(ids.map((id) => [id, {
    titre: id,
    date: null,
    lastModified: '2026-01-01T00:00:00.000Z',
  }]))
  corpus.ordreEntretiens = [...ids]
  return JSON.stringify(corpus)
}

export function entretienDistantValide(
  changements: Partial<EntretienFichier> & Record<string, unknown> = {},
): string {
  const entretien: EntretienFichier = {
    formatVersion: FORMAT_VERSION,
    lastModified: '2026-01-01T00:00:00.000Z',
    corpsTexte: { type: 'doc', content: [] },
    annotations: [],
    ancres: [],
    locuteurs: [],
    meta: { valeursGen: {}, audioRef: null },
    ...changements,
  }
  return JSON.stringify(entretien)
}
