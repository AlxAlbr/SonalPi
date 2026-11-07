import { afterEach, describe, expect, test } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { CorpusStore, lireNomCorpus } from '../src/main/corpusStore'

const dossiers: string[] = []
function dossier() {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-nom-'))
  dossiers.push(dir)
  return dir
}
afterEach(() => { for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true }) })

describe('nom du projet, indépendant de son emplacement', () => {
  test('renommer ne change que le nom du corpus, sans modifier les entretiens ni les médias', () => {
    const dir = dossier()
    const store = new CorpusStore(dir)
    store.ouvrir()
    const { id } = store.creerEntretienVide('Témoin')
    const media = join(dir, 'entretien.wav')
    writeFileSync(media, 'audio')
    store.assignerAudio(id, media)
    const entretien = readFileSync(join(dir, 'entretiens', `${id}.json`))
    const avant = store.ouvrir()
    const fichiers = readdirSync(dir)
    expect(store.poserNom('  Enquête été  ').nom).toBe('Enquête été')
    expect(new CorpusStore(dir).ouvrir()).toEqual({ ...avant, nom: 'Enquête été' })
    expect(readFileSync(join(dir, 'entretiens', `${id}.json`))).toEqual(entretien)
    expect(readFileSync(media, 'utf8')).toBe('audio')
    expect(readdirSync(dir)).toEqual(fichiers)
    expect(lireNomCorpus(dir)).toBe('Enquête été')
  })

  test('un nom vide ou une écriture non autorisée laisse le corpus intact', () => {
    const dir = dossier()
    const store = new CorpusStore(dir)
    store.ouvrir()
    store.poserNom('Avant')
    const avant = readFileSync(join(dir, 'corpus.crp'))
    expect(() => store.poserNom(' \n\t ')).toThrow(/vide/)
    expect(readFileSync(join(dir, 'corpus.crp'))).toEqual(avant)
    store.lectureSeule = true
    expect(() => store.poserNom('Après')).toThrow(/pas modifiable directement/)
    expect(readFileSync(join(dir, 'corpus.crp'))).toEqual(avant)
  })

  test('le repli pour un corpus sans nom n’écrit pas de champ et n’amorce aucun dossier', () => {
    const dir = dossier()
    new CorpusStore(dir).ouvrir()
    const avant = readFileSync(join(dir, 'corpus.crp'))
    expect(lireNomCorpus(dir)).toBe(basename(dir))
    expect(readFileSync(join(dir, 'corpus.crp'))).toEqual(avant)
    expect(new CorpusStore(dir).ouvrir().nom).toBeUndefined()
    const absent = join(dir, 'absent')
    expect(lireNomCorpus(absent, 'Dossier serveur')).toBe('Dossier serveur')
    expect(existsSync(absent)).toBe(false)
  })

  test('des métadonnées illisibles ne cassent pas les récents', () => {
    const dir = dossier()
    writeFileSync(join(dir, 'corpus.crp'), '{cassé')
    expect(lireNomCorpus(dir)).toBe(basename(dir))
    expect(readFileSync(join(dir, 'corpus.crp'), 'utf8')).toBe('{cassé')
  })
})
