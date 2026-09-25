import { describe, expect, test } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { StockageLocalEntretienGitLab } from '../../src/main/gitlab/stockageSession'

describe('stockage local de session GitLab', () => {
  test('écrit et relit un entretien par remplacement atomique', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-stockage-session-'))
    try {
      const stockage = new StockageLocalEntretienGitLab(dir, 'entretiens/e1.json')
      await stockage.ecrire('{"formatVersion":8}')
      await expect(stockage.lire()).resolves.toBe('{"formatVersion":8}')
      expect(readFileSync(join(dir, 'entretiens/e1.json'), 'utf8')).toBe('{"formatVersion":8}')
      expect(statSync(join(dir, 'entretiens/e1.json')).mode & 0o777).toBe(0o600)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('refuse un chemin local ambigu avant toute écriture', () => {
    expect(() => new StockageLocalEntretienGitLab('/tmp', '../secret.json')).toThrow('invalide')
  })
})
