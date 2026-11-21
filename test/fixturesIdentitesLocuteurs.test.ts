import { afterEach, expect, test } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { CorpusStore } from '../src/main/corpusStore'
import { creerLocuteurFixture, installerIdentitesFixture } from './fixtures/identitesLocuteurs'

const dossiers: string[] = []
afterEach(() => dossiers.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))
function banc() {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-identites-fixture-')); dossiers.push(dir)
  const store = new CorpusStore(dir); store.ouvrir()
  const { id } = store.creerEntretienVide('Synthétique')
  store.ecrireEntretien(id, { corpsTexte: { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: 7 } }] }, annotations: [], ancres: [],
    meta: { valeursGen: {}, audioRef: null }, participations: [
      { id: 'p', index: 7, nom: 'Nom local', pseudo: 'Pseudo local', interviewer: true, couleur: '#123456', valeursLoc: {}, locuteurRef: null },
      { id: 'q', index: 12, nom: 'Autre voix', valeursLoc: {}, locuteurRef: null },
    ] })
  const lire = () => { const r = store.lireEntretien(id); if (!r.ok) throw new Error('Fixture absente'); return r.data }
  const fichiers = () => [join(dir, 'corpus.crp'), join(dir, 'entretiens', `${id}.json`)].map((p) => readFileSync(p, 'utf8'))
  return { dir, store, id, lire, fichiers }
}

test('installer une identité préserve les champs de la participation et les données de l’entretien', () => {
  const b = banc(), avant = b.lire()
  const id = creerLocuteurFixture(b.dir, 'Identité commune', [{ entretienId: b.id, participationId: 'p' }])
  expect(b.store.ouvrir().locuteurs[id]).toEqual({ id, nom: 'Identité commune' })
  expect(b.lire()).toEqual({ ...avant, participations: [{ ...avant.participations[0], locuteurRef: id }, avant.participations[1]] })
})

test('les homonymes de fixture restent indépendants, sans heuristique de nom ou de rôle', () => {
  const b = banc(), a = creerLocuteurFixture(b.dir, 'Enquêteur'), c = creerLocuteurFixture(b.dir, 'Enquêteur')
  expect(a).not.toBe(c)
  expect(Object.values(b.store.ouvrir().locuteurs)).toEqual([{ id: a, nom: 'Enquêteur' }, { id: c, nom: 'Enquêteur' }])
})

test.each(['entretien absent', 'participation absente', 'doublon', 'nom vide'])('une fixture invalide ne laisse aucune écriture partielle : %s', (mode) => {
  const b = banc(), avant = b.fichiers()
  const associations = [{ entretienId: mode === 'entretien absent' ? 'absent' : b.id, participationId: mode === 'participation absente' ? 'absente' : 'p', locuteurRef: 'fixe' }]
  if (mode === 'doublon') associations.push({ entretienId: b.id, participationId: 'q', locuteurRef: 'fixe' })
  expect(() => installerIdentitesFixture(b.dir, { locuteurs: [{ id: 'fixe', nom: mode === 'nom vide' ? '' : 'Nom' }], associations })).toThrow()
  expect(b.fichiers()).toEqual(avant)
})

test('un changement synthétique de définition ne réécrit pas les entretiens', () => {
  const b = banc(), id = creerLocuteurFixture(b.dir, 'Avant', [{ entretienId: b.id, participationId: 'p' }]), avant = b.fichiers()[1]
  installerIdentitesFixture(b.dir, { locuteurs: [{ id, nom: 'Après' }] })
  expect(b.store.ouvrir().locuteurs[id].nom).toBe('Après')
  expect(b.fichiers()[1]).toBe(avant)
})
