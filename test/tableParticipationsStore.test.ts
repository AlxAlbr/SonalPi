import { afterEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { CorpusStore } from '../src/main/corpusStore'
import { poserValeurLotLocal } from '../src/main/distant/transactions'
import { FORMAT_VERSION, type EntretienFichier, type ItemLotValeur } from '../src/shared/format'
import { ecrireSeedDemo } from './seedDemo'

const dossiers: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true }) })

function banc(avecIds = true) {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-table-participations-'))
  dossiers.push(dir)
  ecrireSeedDemo(dir)
  const fichier = join(dir, 'entretiens/e1.json')
  const lire = () => JSON.parse(readFileSync(fichier, 'utf8')) as EntretienFichier
  if (avecIds) {
    const data = lire()
    data.formatVersion = FORMAT_VERSION
    data.participations[0].id = 'loc-V1-conserve'
    data.participations[1].id = '7'
    data.notes = [{ id: 'note-conservee', categorieId: 'ncat_generale', titre: 'Note locale', corps: '<p>Note</p>', date: null, statut: 'prive',
      creeLe: '2025-01-01T00:00:00.000Z', modifieLe: '2025-01-01T00:00:00.000Z', rang: 0, participationIds: ['7'] }]
    writeFileSync(fichier, JSON.stringify(data))
  }
  const store = new CorpusStore(dir)
  store.ouvrir()
  const { id: idVar } = store.ajouterVariable('Réponse locale', 'participation')
  const idMod = store.ajouterModalite(idVar, 'Oui').variables[idVar].modalites[0].id
  const item = (entretienId = 'e1', participationId = '7'): ItemLotValeur => ({
    entretienId, cible: { type: 'participation', participationId }, idVar, idMod,
  })
  return { dir, fichier, lire, store, idVar, idMod, item }
}

function ajouterSecond(b: ReturnType<typeof banc>): string {
  const { id } = b.store.creerEntretienVide('Autre entretien')
  b.store.ecrireEntretien(id, b.lire())
  return id
}

describe('table et écritures locales par participation', () => {
  test('la matrice transmet les ids enregistrés et ne réécrit aucun fichier', () => {
    const b = banc()
    const avant = readFileSync(b.fichier, 'utf8')
    const corpusAvant = readFileSync(join(b.dir, 'corpus.crp'), 'utf8')
    for (let i = 0; i < 2; i++) {
      expect(b.store.matriceCorpus()[0].participations.map((p) => [p.participationId, p.index])).toEqual([
        ['loc-V1-conserve', 1], ['7', 2],
      ])
    }
    expect(readFileSync(b.fichier, 'utf8')).toBe(avant)
    expect(readFileSync(join(b.dir, 'corpus.crp'), 'utf8')).toBe(corpusAvant)
  })

  test('une participation sans id rend le document incompatible, sans correction à la lecture', () => {
    const b = banc(false)
    const data = b.lire()
    writeFileSync(b.fichier, JSON.stringify({ ...data, participations: data.participations.map(({ id: _id, ...p }) => p) }))
    const avant = readFileSync(b.fichier, 'utf8')
    expect(b.store.lireEntretien('e1')).toEqual({ ok: false, raison: 'version' })
    expect(() => b.store.matriceCorpus()).toThrow('Participation de locuteur invalide')
    expect(b.store.poserValeur('e1', b.item().cible, b.idVar, b.idMod)).toBe(false)
    expect(readFileSync(b.fichier, 'utf8')).toBe(avant)
    expect(b.lire().participations.every((p) => !p.id)).toBe(true)
  })

  test('un changement extérieur des index ne change pas la destination ni les ids', () => {
    const b = banc()
    const data = b.lire()
    data.participations[0].index = 2
    data.participations[1].index = 1
    writeFileSync(b.fichier, JSON.stringify(data))
    const corpusAvant = readFileSync(join(b.dir, 'corpus.crp'), 'utf8')
    expect(b.store.poserValeur('e1', b.item().cible, b.idVar, b.idMod)).toBe(true)
    const apres = b.lire()
    expect(apres).toEqual({ ...data, lastModified: apres.lastModified, participations: [data.participations[0],
      { ...data.participations[1], valeursLoc: { [b.idVar]: b.idMod } }] })
    expect(readFileSync(join(b.dir, 'corpus.crp'), 'utf8')).toBe(corpusAvant)
    expect(b.store.poserValeur('e1', b.item().cible, b.idVar, '')).toBe(true)
    expect(b.lire().participations[1].valeursLoc).toEqual({})
  })

  test('le même id local dans deux entretiens reste deux destinations distinctes', async () => {
    const b = banc(), second = ajouterSecond(b)
    const autreModalite = b.store.ajouterModalite(b.idVar, 'Non').variables[b.idVar].modalites.find((m) => m.lib === 'Non')!.id
    const resultat = await poserValeurLotLocal(b.store, [b.item(), { ...b.item(second), idMod: autreModalite }])
    expect(resultat).toEqual({ succes: ['e1', second], echecs: [] })
    expect(b.lire().participations[1].valeursLoc[b.idVar]).toBe(b.idMod)
    const autre = b.store.lireEntretien(second)
    expect(autre.ok && autre.data.participations[1].valeursLoc[b.idVar]).toBe(autreModalite)
    expect(autre.ok && autre.data.participations.map((p) => p.id)).toEqual(['loc-V1-conserve', '7'])
  })

  test('une cible disparue refuse tout le fichier mais pas les autres entretiens du lot', async () => {
    const b = banc(), second = ajouterSecond(b)
    const avant = readFileSync(b.fichier, 'utf8')
    const resultat = await poserValeurLotLocal(b.store, [b.item(), b.item('e1', 'disparue'), b.item(second)])
    expect(resultat.succes).toEqual([second])
    expect(resultat.echecs).toEqual([{ id: 'e1', raison: expect.stringContaining('Actualisez') }])
    expect(readFileSync(b.fichier, 'utf8')).toBe(avant)
    const autre = b.store.lireEntretien(second)
    expect(autre.ok && autre.data.participations[1].valeursLoc[b.idVar]).toBe(b.idMod)
  })

  test('une destination ambiguë ne choisit pas arbitrairement une participation', () => {
    const b = banc(), data = b.lire()
    data.participations[0].id = '7'
    writeFileSync(b.fichier, JSON.stringify(data))
    const avant = readFileSync(b.fichier, 'utf8')
    expect(b.store.poserValeur('e1', b.item().cible, b.idVar, b.idMod)).toBe(false)
    expect(readFileSync(b.fichier, 'utf8')).toBe(avant)
  })

  test('les anciens messages sont refusés avant de confier un fichier au store', async () => {
    const b = banc(), ecrire = vi.spyOn(b.store, 'poserValeursEntretien')
    const items = [b.item(), { ...b.item(), cible: { type: 'locuteur', index: 2 } }] as unknown as ItemLotValeur[]
    const avant = readFileSync(b.fichier, 'utf8')
    await expect(poserValeurLotLocal(b.store, items)).rejects.toThrow('destination')
    expect(ecrire).not.toHaveBeenCalled()
    expect(readFileSync(b.fichier, 'utf8')).toBe(avant)
  })

  test('un lot ne peut pas mélanger les entretiens dans une écriture de fichier', () => {
    const b = banc(), avant = readFileSync(b.fichier, 'utf8')
    expect(() => b.store.poserValeursEntretien('e1', [b.item(), b.item('e2')])).toThrow('mélange')
    expect(readFileSync(b.fichier, 'utf8')).toBe(avant)
  })

  test('la table ne publie pas un document d’un ancien format de développement', () => {
    const b = banc(), data = { ...b.lire(), formatVersion: 9 }
    writeFileSync(b.fichier, JSON.stringify(data))
    const avant = readFileSync(b.fichier, 'utf8')
    expect(() => b.store.poserValeur('e1', b.item().cible, b.idVar, b.idMod)).toThrow('Version native non supportée')
    expect(readFileSync(b.fichier, 'utf8')).toBe(avant)
  })
})
