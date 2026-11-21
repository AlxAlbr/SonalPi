import { expect, test } from 'vitest'
import { preparerNommageLocuteurs } from '../src/main/preparationCorrectionsLocuteurs'
import { fixtureLocuteursDistants } from './fixtures/locuteursDistants'

const reference = { entretienId: 'A', participationId: 'local' }
const maintenant = '2026-11-21T10:00:00.000Z'

test.each(['Enquêteur', 'Participant 1', 'X', 'Alice'])('nommage %s : création indépendante avec la seule source courante, sans mutation des entrées', (nom) => {
  const f = fixtureLocuteursDistants(), a = f.entretiens[0].data.participations[0]
  a.locuteurRef = null; a.nom = nom
  const avant = JSON.stringify(f)
  const plan = preparerNommageLocuteurs(JSON.stringify(f.corpus), f.sources().filter((s) => s.id === 'A'), { type: 'identifierAuNommage', demande: { ...reference, nom } }, { genererId: () => 'nouveau', maintenant: () => maintenant })
  expect(plan.locuteurId).toBe('nouveau')
  expect(plan.corpusApres.locuteurs.nouveau).toEqual({ id: 'nouveau', nom })
  expect(plan.corpusApres.locuteurs.a).toEqual(f.corpus.locuteurs.a)
  expect(plan.entretiens).toHaveLength(1)
  expect(plan.entretiens[0].apres).toEqual({ ...f.entretiens[0].data, lastModified: maintenant, participations: [{ ...a, locuteurRef: 'nouveau' }] })
  expect(plan.corpusApres.membership.B).toEqual(f.corpus.membership.B)
  expect(JSON.stringify(f)).toBe(avant)
})

test('répéter un nommage confirmé retrouve son identité, sans génération ni modification', () => {
  const f = fixtureLocuteursDistants()
  const plan = preparerNommageLocuteurs(JSON.stringify(f.corpus), f.sources().filter((s) => s.id === 'A'), { type: 'identifierAuNommage', demande: { ...reference, nom: 'Alice A' } }, { genererId: () => { throw new Error('Ne doit pas être appelé') } })
  expect(plan.locuteurId).toBe('a'); expect(plan.entretiens).toEqual([]); expect(plan.corpusApres).toEqual(f.corpus)
})

test.each(['retrait volontaire', 'autre nom', 'champ inconnu', 'collision', 'source étrangère'] as const)('%s : création refusée sans nouvelle définition', (cas) => {
  const f = fixtureLocuteursDistants(), a = f.entretiens[0].data.participations[0]
  a.locuteurRef = null
  if (cas === 'retrait volontaire') a.associationRetiree = true
  const demande = { ...reference, nom: cas === 'autre nom' ? 'Autre' : a.nom, ...(cas === 'champ inconnu' ? { role: true } : {}) }
  const avant = JSON.stringify(f)
  expect(() => preparerNommageLocuteurs(JSON.stringify(f.corpus), f.sources().filter((s) => s.id === (cas === 'source étrangère' ? 'B' : 'A')), { type: 'identifierAuNommage', demande }, { genererId: () => 'a' })).toThrow()
  expect(JSON.stringify(f)).toBe(avant)
})

function reunion() {
  const f = fixtureLocuteursDistants()
  f.corpus.variables.v = { id: 'v', lib: 'Donnée', portee: 'participation', priv: false, ordre: 0, vExport: 0, modalites: [{ id: 'm', lib: 'Valeur', mExport: 1 }] }
  f.entretiens[2].data.participations[0].valeursLoc.v = 'm'
  f.corpus.cas = { suivi: { id: 'suivi', nom: 'Suivi', memo: '', creeLe: '', modifieLe: '', rattachements: [], regles: [{ type: 'locuteur', locuteurId: 'a', inclureEnqueteurs: true }] } }
  f.corpus.locuteurs.c = { id: 'c', nom: 'Tiers' }
  const tiers = structuredClone(f.entretiens[2]); tiers.id = 'D'; tiers.titre = 'Tiers'
  tiers.data.participations[0].locuteurRef = 'c'; tiers.data.participations[0].rapprochementsRefuses = [{ type: 'locuteur', locuteurId: 'a' }]
  f.entretiens.push(tiers); f.corpus.membership.D = { ...f.corpus.membership.C, titre: 'Tiers' }
  return f
}

test('rapprochement : retrait de la définition seulement dans le plan complet, cas et tiers redirigés, noms conservés', () => {
  const f = reunion(), avant = JSON.stringify(f)
  const plan = preparerNommageLocuteurs(JSON.stringify(f.corpus), f.sources(), { type: 'rapprocherAuNommage', demande: { ...reference, source: { entretienId: 'C', participationId: 'local' }, attendu: f.attendu(), reprise: { pseudo: true, interviewer: true, variables: ['v'], remplacer: true } } })
  expect(plan.locuteurId).toBe('b'); expect(plan.corpusApres.locuteurs.a).toBeUndefined()
  expect(plan.corpusApres.cas!.suivi.regles).toEqual([{ type: 'locuteurs', membres: [{ locuteurId: 'b', inclureEnqueteurs: true }] }])
  expect(plan.entretiens.find((e) => e.id === 'D')!.apres.participations[0].rapprochementsRefuses).toEqual([{ type: 'locuteur', locuteurId: 'b' }])
  const a = plan.entretiens.find((e) => e.id === 'A')!
  expect(a.apres).toEqual({ ...a.avant, lastModified: expect.any(String), participations: [{ ...a.avant.participations[0], locuteurRef: 'b', pseudo: 'Pseudo C', pseudoEtat: 'confirme', interviewer: false, valeursLoc: { v: 'm' } }] })
  expect(plan.entretiens.find((e) => e.id === 'B')!.apres.participations[0].nom).toBe('Alice B')
  expect(JSON.stringify(f)).toBe(avant)
})

test.each(['aperçu périmé', 'source absente', 'même entretien', 'variable entretien', 'retrait volontaire'] as const)('rapprochement %s : refus sans mutation', (cas) => {
  const f = reunion()
  if (cas === 'variable entretien') f.corpus.variables.v.portee = 'entretien'
  if (cas === 'retrait volontaire') f.entretiens[0].data.participations[0].associationRetiree = true
  if (cas === 'même entretien') f.entretiens[0].data.participations.push({ ...structuredClone(f.entretiens[2].data.participations[0]), id: 'autre', index: 9 })
  const avant = JSON.stringify(f)
  expect(() => preparerNommageLocuteurs(JSON.stringify(f.corpus), f.sources().filter((s) => cas !== 'source absente' || s.id !== 'D'), { type: 'rapprocherAuNommage', demande: { ...reference, source: { entretienId: 'C', participationId: 'local' }, attendu: cas === 'aperçu périmé' ? '{}' : f.attendu(), reprise: { variables: ['v'] } } })).toThrow()
  expect(JSON.stringify(f)).toBe(avant)
})
