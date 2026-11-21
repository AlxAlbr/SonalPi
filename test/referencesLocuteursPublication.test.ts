import { afterEach, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GardePseudosWebDAV } from '../src/main/distant/gardePseudosWebDAV'
import { verifierContenusReferencesDefinitions, ReferencesDefinitionsInvalidesError } from '../src/main/gitlab/referencesDefinitions'
import { fixtureLocuteursDistants } from './fixtures/locuteursDistants'
import { ServeurWebDAVMemoire } from './webdav/serveurWebdavMemoire'

const dossiers: string[] = []
afterEach(() => { for (const d of dossiers.splice(0)) rmSync(d, { recursive: true, force: true }) })
function fixture(cas: 'association' | 'distinction' | 'valide') {
  const f = fixtureLocuteursDistants(), cible = structuredClone(f.entretiens[0].data)
  if (cas === 'association') delete f.corpus.locuteurs.a
  if (cas === 'distinction') { delete f.corpus.locuteurs.b; cible.participations[0].rapprochementsRefuses = [{ type: 'locuteur', locuteurId: 'b' }] }
  return { ...f, cible }
}

test.each(['association', 'distinction'] as const)('GitLab : une %s vers une identité retirée bloque la publication ordinaire', (cas) => {
  const f = fixture(cas), avant = JSON.stringify(f)
  expect(() => verifierContenusReferencesDefinitions(JSON.stringify(f.cible), JSON.stringify(f.corpus), JSON.stringify(f.entretiens[0].data))).toThrow(ReferencesDefinitionsInvalidesError)
  expect(JSON.stringify(f)).toBe(avant)
})

test.each(['association', 'distinction'] as const)('WebDAV : une %s retirée ne peut pas revenir depuis une copie ancienne, même par appel direct', async (cas) => {
  const f = fixture(cas), serveur = new ServeurWebDAVMemoire(); serveur.creerDossierRelatif('verrous')
  serveur.poser('corpus.crp', JSON.stringify(f.corpus))
  const dir = mkdtempSync(join(tmpdir(), 'sonal-references-locuteurs-')); dossiers.push(dir)
  const garde = new GardePseudosWebDAV(serveur.client(), () => ({ userId: 'max', machineId: 'poste', sessionId: 'session' }), dir)
  let envois = 0
  await expect(garde.publier(JSON.stringify(f.cible), JSON.stringify(f.entretiens[0].data), async () => { envois++; return 'envoyé' }, 'entretiens/A.json')).rejects.toThrow('associations des locuteurs ont changé')
  expect(envois).toBe(0)
  expect(serveur.contenuDe('verrous/corpus.lock.json')).toBeUndefined()
})

test('les références valides restent publiables et ne modifient aucune identité', async () => {
  const f = fixture('valide'), avant = JSON.stringify(f)
  expect(() => verifierContenusReferencesDefinitions(JSON.stringify(f.cible), JSON.stringify(f.corpus), JSON.stringify(f.entretiens[0].data))).not.toThrow()
  const serveur = new ServeurWebDAVMemoire(); serveur.creerDossierRelatif('verrous'); serveur.poser('corpus.crp', JSON.stringify(f.corpus))
  const dir = mkdtempSync(join(tmpdir(), 'sonal-references-valides-')); dossiers.push(dir)
  const garde = new GardePseudosWebDAV(serveur.client(), () => ({ userId: 'max', machineId: 'poste', sessionId: 'session' }), dir)
  expect(await garde.publier(JSON.stringify(f.cible), JSON.stringify(f.cible), async () => 'envoyé', 'entretiens/A.json')).toBe('envoyé')
  expect(JSON.stringify(f)).toBe(avant)
})
