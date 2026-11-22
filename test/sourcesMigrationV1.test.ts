import { afterEach, expect, test } from 'vitest'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { inspecterSourcesMigration } from '../src/main/sourcesMigrationV1'
import { MigrationV1 } from '../src/main/migrationV1'
import type { RemplacementTranscriptionMigration } from '../src/shared/migrationV1'

const dossiers: string[] = []
afterEach(() => { for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function banc() {
  const base = mkdtempSync(join(tmpdir(), 'sonal-verification-v1-'))
  dossiers.push(base)
  const source = join(base, 'V1')
  mkdirSync(source)
  const cheminCrp = join(source, 'Enquete.crp')
  const brut = { tabEnt: [
    { id: 7, nom: 'Premier', rtrPath: 'textes\\premier.Sonal', audioPath: 'absent.mp3' },
    { id: 8, nom: 'Sans transcription', rtrPath: '', audioPath: '' },
    { id: 9, nom: 'Autre', rtrPath: 'autre.Sonal', audioPath: '' },
  ] }
  mkdirSync(join(source, 'textes'))
  writeFileSync(join(source, 'textes', 'premier.Sonal'), '<div id="contenuText">Premier.</div>')
  writeFileSync(join(source, 'autre.Sonal'), '<div id="contenuText">Autre.</div>')
  const ecrire = () => writeFileSync(cheminCrp, JSON.stringify(brut))
  ecrire()
  return { base, source, cheminCrp, brut, ecrire }
}

test('vérification seule, références relatives et séparateurs Windows, sans création ni modification', () => {
  const b = banc(), original = readFileSync(b.cheminCrp)
  const { bilan } = inspecterSourcesMigration(b)
  expect(bilan.transcriptions.map((f) => [f.index, f.etat])).toEqual([[0, 'ok'], [2, 'ok']])
  expect(bilan.transcriptions[0].chemin).toBe(join(b.source, 'textes', 'premier.Sonal'))
  expect(bilan.medias).toEqual([expect.objectContaining({ index: 0, etat: 'manquant' })])
  expect(readFileSync(b.cheminCrp)).toEqual(original)
  expect(readdirSync(b.base)).toEqual(['V1'])
})

test('distingue une transcription absente d’un dossier à la place du fichier', () => {
  const b = banc()
  rmSync(join(b.source, 'autre.Sonal'))
  mkdirSync(join(b.source, 'autre.Sonal'))
  rmSync(join(b.source, 'textes', 'premier.Sonal'))
  expect(inspecterSourcesMigration(b).bilan.transcriptions.map((f) => f.etat)).toEqual(['manquant', 'illisible'])
})

test('un choix de fichier ne se reporte pas sur un autre entretien après un changement du CRP', () => {
  const b = banc(), { bilan } = inspecterSourcesMigration(b)
  b.brut.tabEnt.reverse()
  b.ecrire()
  const demande = { ...b, empreinteCrp: bilan.empreinteCrp,
    transcriptions: [{ index: 0, chemin: join(b.source, 'autre.Sonal') }] }
  expect(() => inspecterSourcesMigration(demande)).toThrow(/corpus SonalPi1 a changé/)
  expect(() => new MigrationV1({ ...demande, nom: 'Enquete', dossier: join(b.base, 'V2') })).toThrow(/corpus SonalPi1 a changé/)
  expect(existsSync(join(b.base, 'V2'))).toBe(false)
})

test.each([
  [{ index: 90, chemin: '/tmp/absent.sonal' }],
  [{ index: -1, chemin: '/tmp/absent.sonal' }],
  [{ index: 1, chemin: '/tmp/absent.sonal' }],
  [{ index: 0, chemin: 'relatif.sonal' }],
  [{ index: 0, chemin: '/tmp/a.sonal' }, { index: 0, chemin: '/tmp/b.sonal' }],
])('refuse les remplacements incohérents : %j', (...transcriptions) => {
  const b = banc(), { bilan } = inspecterSourcesMigration(b)
  expect(() => inspecterSourcesMigration({ ...b, empreinteCrp: bilan.empreinteCrp,
    transcriptions: transcriptions as RemplacementTranscriptionMigration[] })).toThrow(/fichiers choisis/)
})

test('un remplacement doit être associé au CRP vérifié', () => {
  const b = banc()
  expect(() => inspecterSourcesMigration({ ...b, transcriptions: [{ index: 0, chemin: join(b.source, 'autre.Sonal') }] })).toThrow(/fichiers choisis/)
})

test.skipIf(process.platform === 'win32')('conserve un ancien chemin Windows sans fabriquer un sous-dossier C: dans le corpus', () => {
  const b = banc(), ancien = 'C:\\Users\\ancien\\Enquete\\premier.Sonal'
  b.brut.tabEnt[0].rtrPath = ancien
  b.brut.tabEnt[0].audioPath = 'C:\\Users\\ancien\\Enquete\\voix.mp3'
  b.ecrire()
  const { bilan } = inspecterSourcesMigration(b)
  expect(bilan.transcriptions[0]).toMatchObject({ chemin: ancien, reference: ancien, etat: 'manquant' })
  expect(bilan.medias[0]).toMatchObject({ chemin: b.brut.tabEnt[0].audioPath, etat: 'manquant' })
})

test('une URL de média invalide reste un avertissement sans bloquer les transcriptions', async () => {
  const b = banc()
  b.brut.tabEnt[0].audioPath = 'file:///%ZZ'
  b.ecrire()
  const { bilan } = inspecterSourcesMigration(b)
  expect(bilan.medias[0].etat).not.toBe('ok')
  const job = new MigrationV1({ cheminCrp: b.cheminCrp, nom: 'Enquete', dossier: join(b.base, 'V2') })
  await job.preparer()
  await job.annuler()
  expect(existsSync(b.cheminCrp)).toBe(true)
})

test.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('signale les permissions ; un média illisible ne bloque pas la préparation', async () => {
  const b = banc(), media = join(b.source, 'prive.mp3'), texte = join(b.source, 'autre.Sonal')
  writeFileSync(media, 'MEDIA')
  b.brut.tabEnt[0].audioPath = media
  b.ecrire()
  chmodSync(media, 0o000)
  chmodSync(texte, 0o000)
  try {
    expect(inspecterSourcesMigration(b).bilan.transcriptions[1].etat).toBe('illisible')
    expect(inspecterSourcesMigration(b).bilan.medias[0].etat).toBe('illisible')
    chmodSync(texte, 0o600)
    const job = new MigrationV1({ cheminCrp: b.cheminCrp, nom: 'Enquete', dossier: join(b.base, 'V2') })
    await job.preparer()
    await job.annuler()
  } finally { chmodSync(media, 0o600); chmodSync(texte, 0o600) }
})
