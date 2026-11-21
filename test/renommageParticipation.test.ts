import { afterEach, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../src/main/corpusStore'
import { preparerNommageLocuteurs } from '../src/main/preparationCorrectionsLocuteurs'
import { validerRenommageParticipation, type DemandeRenommageParticipation } from '../src/shared/corpus/contratsLocuteurs'
import { verifierRelectureRenommageParticipation } from '../src/shared/entretien/renommageGlobal'
import { fixtureLocuteursDistants } from './fixtures/locuteursDistants'

const dossiers: string[] = []
afterEach(() => { for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true }) })
const demande: DemandeRenommageParticipation = {
  entretienId: 'A', participationId: 'local', locuteurId: 'a', nomAvant: 'Alice A', nom: 'Mme Dupont',
}
function banc() {
  const f = fixtureLocuteursDistants(), dir = mkdtempSync(join(tmpdir(), 'sonal-nom-participation-'))
  dossiers.push(dir); mkdirSync(join(dir, 'entretiens'))
  writeFileSync(join(dir, 'corpus.crp'), JSON.stringify(f.corpus))
  for (const s of f.sources()) writeFileSync(join(dir, 'entretiens', `${s.id}.json`), s.contenu)
  const store = new CorpusStore(dir)
  store.ouvrirEntretienPourEdition('A')
  return { f, dir, store, texte: (id: string) => readFileSync(join(dir, 'entretiens', `${id}.json`), 'utf8') }
}

test('le renommage local conserve l’identité, les autres participations et toutes les données étrangères au nom', () => {
  const b = banc(), avant = b.f.entretiens[0].data, autre = b.texte('B')
  b.store.ouvrirEntretienPourEdition('B')
  const apres = b.store.renommerParticipationDepuisEntretien(demande)
  expect(apres).toEqual({ ...avant, lastModified: expect.any(String), participations: [{ ...avant.participations[0], nom: 'Mme Dupont' }] })
  expect(b.store.ouvrir().locuteurs).toEqual(b.f.corpus.locuteurs)
  expect(b.texte('B')).toBe(autre)
  const { formatVersion: _v, lastModified: _d, ...payload } = avant
  verifierRelectureRenommageParticipation(payload, apres, demande)
  expect(() => b.store.ecrireEntretien('A', avant)).toThrow('Les noms ont changé')
  expect(() => b.store.ecrireEntretien('B', b.f.entretiens[1].data)).not.toThrow()
})

test('un entretien absent sans rapport ne bloque pas le changement du nom local', () => {
  const b = banc()
  unlinkSync(join(b.dir, 'entretiens/B.json'))
  expect(b.store.renommerParticipationDepuisEntretien(demande).participations[0].nom).toBe('Mme Dupont')
})

test('une répétition reconnue ne change plus le fichier ni ses identifiants', () => {
  const b = banc()
  b.store.renommerParticipationDepuisEntretien(demande)
  const avant = b.texte('A')
  b.store.renommerParticipationDepuisEntretien(demande)
  expect(b.texte('A')).toBe(avant)
  expect(b.store.ouvrir().locuteurs).toEqual(b.f.corpus.locuteurs)
})

test.each(['nom', 'association', 'participation', 'session', 'permission'] as const)('%s périmé ou indisponible : aucun fichier modifié', (cas) => {
  const b = banc(), commande = { ...demande }
  if (cas === 'nom') commande.nomAvant = 'Ancien nom'
  if (cas === 'association') commande.locuteurId = 'b'
  if (cas === 'participation') commande.participationId = 'absente'
  if (cas === 'session') b.store.revoquerEcritureEntretien('A')
  if (cas === 'permission') b.store.lectureSeule = true
  const avant = b.texte('A'), corpus = readFileSync(join(b.dir, 'corpus.crp'), 'utf8')
  expect(() => b.store.renommerParticipationDepuisEntretien(commande)).toThrow()
  expect(b.texte('A')).toBe(avant)
  expect(readFileSync(join(b.dir, 'corpus.crp'), 'utf8')).toBe(corpus)
})

test('la préparation distante ne demande que l’entretien courant et ne renomme aucune identité', () => {
  const f = fixtureLocuteursDistants()
  const plan = preparerNommageLocuteurs(JSON.stringify(f.corpus), [f.sources()[0]], { type: 'renommerParticipation', demande })
  expect(plan.entretiens.map((e) => e.id)).toEqual(['A'])
  expect(plan.corpusApres.locuteurs).toEqual(f.corpus.locuteurs)
  expect(plan.entretiens[0].apres.participations[0].nom).toBe('Mme Dupont')
  expect(f.entretiens[0].data.participations[0].nom).toBe('Alice A')
})

test.each(['notes', 'association', 'autre nom'] as const)('une relecture ne peut remplacer les %s', (cas) => {
  const f = fixtureLocuteursDistants(), avant = f.entretiens[0].data, apres = structuredClone(avant)
  apres.participations[0].nom = demande.nom
  if (cas === 'notes') apres.notes![0].corps = 'Remplacée'
  if (cas === 'association') apres.participations[0].locuteurRef = 'b'
  if (cas === 'autre nom') {
    const p = { ...avant.participations[0], id: 'autre', index: 12, locuteurRef: null }
    avant.participations.push(p); apres.participations.push({ ...p, nom: 'Autre nom remplacé' })
  }
  const { formatVersion: _v, lastModified: _d, ...payload } = avant
  expect(() => verifierRelectureRenommageParticipation(payload, apres, demande)).toThrow('contenu')
})

test.each([
  { ...demande, nom: '   ' },
  { ...demande, nomAvant: null },
  { ...demande, locuteurId: '' },
  { ...demande, nomCorpus: 'Autre nom commun' },
  { ...demande, participationId: 7 },
])('une commande de renommage local mal formée est refusée', (valeur) => {
  expect(() => validerRenommageParticipation(valeur)).toThrow('invalide')
})
