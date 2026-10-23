import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { lireReglagesLexicoV1 } from '../src/main/migrationLexicoV1'

describe('annexes Lexico pendant la migration SonalPi1', () => {
  test('reprend seulement les annexes portant le nom du .crp sans les modifier', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-migration-lexico-'))
    const crp = join(dir, 'terrain.crp')
    const out = join(dir, 'terrain.out')
    const lem = join(dir, 'terrain.lem')
    const cnct = join(dir, 'terrain.cnct')
    writeFileSync(crp, '{}')
    writeFileSync(out, 'le\nla')
    writeFileSync(lem, 'allais\taller\tV\nligne invalide')
    writeFileSync(cnct, 'prise en charge\tprise en charge\tC')
    writeFileSync(join(dir, 'autre.out'), 'ne-doit-pas-etre-lu')
    const avant = [out, lem, cnct].map((chemin) => readFileSync(chemin))

    const resultat = lireReglagesLexicoV1(crp)

    expect(resultat.fichiers).toEqual(['.out', '.lem', '.cnct'])
    expect(resultat.traitements.motsOutils).toEqual(['le', 'la'])
    expect(resultat.traitements.regroupements[0]).toMatchObject({ forme: 'aller', membres: ['allais'] })
    expect(resultat.traitements.concatenations[0]).toMatchObject({ sequence: ['prise', 'en', 'charge'] })
    expect(resultat.diagnostics).toEqual(['.lem ligne 2 ignorée : source ou cible absente.'])
    for (const [index, chemin] of [out, lem, cnct].entries()) {
      expect(readFileSync(chemin).equals(avant[index])).toBe(true)
    }
  })

  test('continue sans réglage lorsqu’aucune annexe correspondante n’existe', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-migration-lexico-vide-'))
    const resultat = lireReglagesLexicoV1(join(dir, 'terrain.crp'))
    expect(resultat).toEqual({
      traitements: { motsOutils: [], regroupements: [], concatenations: [] },
      diagnostics: [],
      fichiers: [],
    })
  })
})
