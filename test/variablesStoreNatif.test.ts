import { describe, expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../src/main/corpusStore'
import type { Variable } from '../src/shared/format'

describe('définitions natives et stockage actif', () => {
  test('les changements de structure refusés ne provoquent ni lecture ni écriture du corpus', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-variable-garde-'))
    try {
      const store = new CorpusStore(dir)
      store.ouvrir()
      const { id } = store.ajouterVariable('Locale', 'locuteur')
      const avant = readFileSync(join(dir, 'corpus.crp'), 'utf8')
      const lecture = vi.spyOn(store, 'ouvrir')
      const patch = { id: 'remplacement', modalites: [], vExport: 99 }
      expect(() => store.modifierVariable(id, patch as unknown as Partial<Pick<Variable, 'lib' | 'portee' | 'priv'>>)).toThrow('invalides')
      expect(() => store.ajouterVariable('Mélange', 'participation' as 'locuteur')).toThrow('portée')
      expect(lecture).not.toHaveBeenCalled()
      expect(readFileSync(join(dir, 'corpus.crp'), 'utf8')).toBe(avant)
    } finally { vi.restoreAllMocks(); rmSync(dir, { recursive: true, force: true }) }
  })
})
