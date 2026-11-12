import { afterEach, describe, expect, test, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../src/main/corpusStore'
import type { CorpusFichier, EntretienFichier, PayloadEntretien } from '../src/shared/format'

const injections = vi.hoisted(() => ({ apresRenommage: undefined as ((destination: string) => void) | undefined }))
vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>()
  return {
    ...fs,
    renameSync: (...args: Parameters<typeof fs.renameSync>) => {
      fs.renameSync(...args)
      injections.apresRenommage?.(String(args[1]))
    },
  }
})
const dossiers: string[] = []
afterEach(() => {
  injections.apresRenommage = undefined
  for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function banc() {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-suppression-definition-'))
  dossiers.push(dir)
  const store = new CorpusStore(dir)
  store.ouvrir()
  const theme = store.ajouterCategorie('Thème').id
  const variable = store.ajouterVariable('Statut', 'entretien').id
  const modalite = store.ajouterModalite(variable, 'A').variables[variable].modalites[0].id
  const autre = store.ajouterModalite(variable, 'B').variables[variable].modalites[1].id
  const ids = ['Un', 'Deux'].map((titre) => {
    const payload: PayloadEntretien = {
      corpsTexte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: titre }] }] },
      annotations: [
        { id: 'codage', type: 'codage', code: theme, from: 1, to: 2, auteur: 'test' },
        { id: 'commentaire', type: 'commentaire', texte: 'À conserver', from: 1, to: 2, auteur: 'test' },
      ],
      ancres: [], locuteurs: [{ index: 1, nom: titre, valeursLoc: { [variable]: autre }, personneRef: null }],
      meta: { valeursGen: { [variable]: modalite }, audioRef: '/audio/reference.wav' },
    }
    return store.importerEntretien(titre, payload, []).id
  })
  const lire = (id: string): EntretienFichier => JSON.parse(readFileSync(join(dir, 'entretiens', `${id}.json`), 'utf8'))
  return { store, dir, theme, variable, modalite, autre, ids, lire }
}

type TypeSuppression = 'thème' | 'variable' | 'modalité'
function supprimer(b: ReturnType<typeof banc>, type: TypeSuppression) {
  if (type === 'thème') return b.store.supprimerCategorie(b.theme, undefined, true)
  if (type === 'variable') return b.store.supprimerVariable(b.variable, undefined, true)
  return b.store.supprimerModalite(b.variable, b.modalite, undefined, true)
}

describe.each<TypeSuppression>(['thème', 'variable', 'modalité'])('Suppression de %s', (type) => {
  test.each([0, 1, 2, 3])('reprend après une interruption à l’écriture %i', (arret) => {
    const b = banc()
    let ecritures = 0
    injections.apresRenommage = () => {
      if (ecritures++ === arret) throw new Error('Interruption simulée')
    }
    expect(() => supprimer(b, type)).toThrow('Interruption simulée')
    injections.apresRenommage = undefined
    expect(existsSync(join(b.dir, '.transaction-fichiers.json'))).toBe(true)
    const corpus = new CorpusStore(b.dir).ouvrir()
    expect(existsSync(join(b.dir, '.transaction-fichiers.json'))).toBe(false)
    if (type === 'thème') expect(corpus.codebook[b.theme]).toBeUndefined()
    else if (type === 'variable') expect(corpus.variables[b.variable]).toBeUndefined()
    else expect(corpus.variables[b.variable].modalites.map((m) => m.id)).toEqual([b.autre])
    for (const id of b.ids) {
      const e = b.lire(id)
      expect(e.annotations.find((a) => a.id === 'commentaire')?.texte).toBe('À conserver')
      expect(e.meta.audioRef).toBe('/audio/reference.wav')
      expect(e.annotations.some((a) => a.type === 'codage')).toBe(type !== 'thème')
      expect(e.meta.valeursGen[b.variable]).toBe(type === 'thème' ? b.modalite : undefined)
      expect(e.locuteurs[0].valeursLoc[b.variable]).toBe(type === 'variable' ? undefined : b.autre)
      expect(corpus.membership[id].lastModified).toBe(e.lastModified)
    }
  })

  test('un entretien concerné en édition bloque la suppression jusqu’à sa fermeture', () => {
    const b = banc()
    b.store.ouvrirEntretienPourEdition(b.ids[0])
    const avant = readFileSync(join(b.dir, 'corpus.json'), 'utf8')
    const source = readFileSync(join(b.dir, 'entretiens', `${b.ids[0]}.json`), 'utf8')
    expect(() => supprimer(b, type)).toThrow(/ouvert en édition/)
    expect(readFileSync(join(b.dir, 'corpus.json'), 'utf8')).toBe(avant)
    expect(readFileSync(join(b.dir, 'entretiens', `${b.ids[0]}.json`), 'utf8')).toBe(source)
    expect(existsSync(join(b.dir, '.transaction-fichiers.json'))).toBe(false)
    b.store.revoquerEcritureEntretien(b.ids[0])
    expect(supprimer(b, type).ok).toBe(true)
  })

  test('un entretien non concerné en édition ou une simple lecture ne bloque pas', () => {
    const b = banc()
    const id = b.store.creerEntretienVide('Sans usage').id
    b.store.ouvrirEntretienPourEdition(id)
    b.store.lireEntretien(b.ids[0])
    expect(supprimer(b, type).ok).toBe(true)
  })

  test('un entretien indisponible empêche toute suppression', () => {
    const b = banc()
    const avant = readFileSync(join(b.dir, 'corpus.json'), 'utf8')
    const premier = readFileSync(join(b.dir, 'entretiens', `${b.ids[0]}.json`), 'utf8')
    rmSync(join(b.dir, 'entretiens', `${b.ids[1]}.json`))
    expect(() => supprimer(b, type)).toThrow(/indisponible/)
    expect(readFileSync(join(b.dir, 'corpus.json'), 'utf8')).toBe(avant)
    expect(readFileSync(join(b.dir, 'entretiens', `${b.ids[0]}.json`), 'utf8')).toBe(premier)
    expect(existsSync(join(b.dir, '.transaction-fichiers.json'))).toBe(false)
  })

  test('un état modifié après interruption n’est jamais écrasé', () => {
    const b = banc()
    injections.apresRenommage = () => { throw new Error('Interruption simulée') }
    expect(() => supprimer(b, type)).toThrow('Interruption simulée')
    injections.apresRenommage = undefined
    const fichier = join(b.dir, 'entretiens', `${b.ids[1]}.json`)
    const externe = b.lire(b.ids[1])
    externe.meta.audioRef = '/audio/modifie.wav'
    writeFileSync(fichier, JSON.stringify(externe, null, 2))
    const corpusAvant = JSON.parse(readFileSync(join(b.dir, 'corpus.json'), 'utf8')) as CorpusFichier
    expect(() => new CorpusStore(b.dir).ouvrir()).toThrow(/a changé/)
    expect(b.lire(b.ids[1]).meta.audioRef).toBe('/audio/modifie.wav')
    expect(JSON.parse(readFileSync(join(b.dir, 'corpus.json'), 'utf8'))).toEqual(corpusAvant)
  })
})
