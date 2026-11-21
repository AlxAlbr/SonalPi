import { expect, test } from 'vitest'
import { preparerCorrectionLocuteurs } from '../src/main/preparationCorrectionsLocuteurs'
import type { CommandeCorrectionLocuteurs } from '../src/shared/corpus/contratsLocuteurs'
import { fixtureLocuteursDistants } from './fixtures/locuteursDistants'

const maintenant = '2026-11-20T10:00:00.000Z'
test('renommage : sources complètes, données conservées et aucun changement aux entrées de préparation', () => {
  const b = fixtureLocuteursDistants(), avant = JSON.stringify(b), sources = b.sources()
  const plan = preparerCorrectionLocuteurs(JSON.stringify(b.corpus), sources, { type: 'renommerGlobal', locuteurId: 'a', nom: 'Alice renommée', attendu: b.attendu() }, { maintenant: () => maintenant })
  expect(plan.locuteurId).toBe('a'); expect(plan.entretiens.map((e) => e.id)).toEqual(['A', 'B'])
  expect(plan.corpusApres.locuteurs.a.nom).toBe('Alice renommée')
  for (const e of plan.entretiens) expect(e.apres).toEqual({ ...e.avant, lastModified: maintenant,
    participations: [{ ...e.avant.participations[0], nom: 'Alice renommée' }] })
  expect(plan.corpusApres.membership.C).toEqual(b.corpus.membership.C)
  expect(JSON.stringify(b)).toBe(avant); expect(b.sources()).toEqual(sources)
})

test('réunion : redirection des cas et refus de tiers, choix explicite des noms conservés', () => {
  const b = fixtureLocuteursDistants()
  b.corpus.locuteurs.c = { id: 'c', nom: 'Chloé' }
  const tiers = structuredClone(b.entretiens[2])
  tiers.id = 'D'; tiers.titre = 'Entretien D'
  tiers.data.participations[0] = { ...tiers.data.participations[0], nom: 'Chloé', locuteurRef: 'c', rapprochementsRefuses: [{ type: 'locuteur', locuteurId: 'b' }] }
  b.entretiens.push(tiers); b.corpus.membership.D = { ...b.corpus.membership.C, titre: tiers.titre }
  b.corpus.cas = { suivi: { id: 'suivi', nom: 'Suivi', memo: '', creeLe: '', modifieLe: '', rattachements: [], regles: [{ type: 'locuteur', locuteurId: 'b', inclureEnqueteurs: true }] } }
  b.entretiens[0].data.participations[0].rapprochementsRefuses = [{ type: 'locuteur', locuteurId: 'b' }]
  const plan = preparerCorrectionLocuteurs(JSON.stringify(b.corpus), b.sources(), { type: 'regrouperSelection', locuteurIds: ['a', 'b'], conserverId: 'a', nom: 'Identité réunie', uniformiserNoms: false, attendu: b.attendu() })
  expect(plan.corpusApres.locuteurs.b).toBeUndefined()
  expect(plan.corpusApres.cas!.suivi.regles).toEqual([{ type: 'locuteurs', membres: [{ locuteurId: 'a', inclureEnqueteurs: true }] }])
  expect(plan.entretiens.find((e) => e.id === 'C')!.apres.participations[0]).toMatchObject({ nom: 'Bob', locuteurRef: 'a' })
  expect(plan.entretiens.find((e) => e.id === 'A')!.apres.participations[0].rapprochementsRefuses).toEqual([])
  expect(plan.entretiens.find((e) => e.id === 'D')!.apres.participations[0].rapprochementsRefuses).toEqual([{ type: 'locuteur', locuteurId: 'a' }])
})

test('dissociation : un id par voix choisie et distinctions réciproques sans renommer les voix', () => {
  const b = fixtureLocuteursDistants()
  const plan = preparerCorrectionLocuteurs(JSON.stringify(b.corpus), b.sources(), { type: 'dissocierSelection', locuteurId: 'a', participations: [{ entretienId: 'A', participationId: 'local' }], attendu: b.attendu() }, { genererId: () => 'independant' })
  expect(plan.corpusApres.locuteurs.independant).toEqual({ id: 'independant', nom: 'Alice A' })
  expect(plan.entretiens.find((e) => e.id === 'A')!.apres.participations[0]).toMatchObject({ nom: 'Alice A', locuteurRef: 'independant', rapprochementsRefuses: [{ type: 'locuteur', locuteurId: 'a' }] })
  expect(plan.entretiens.find((e) => e.id === 'B')!.apres.participations[0].rapprochementsRefuses).toEqual([{ type: 'locuteur', locuteurId: 'independant' }])
})

test('supprimer une définition vide ne modifie aucun entretien', () => {
  const b = fixtureLocuteursDistants()
  const plan = preparerCorrectionLocuteurs(JSON.stringify(b.corpus), b.sources(), { type: 'supprimerVide', locuteurId: 'vide', attendu: b.attendu() })
  expect(plan.entretiens).toEqual([]); expect(plan.corpusApres.locuteurs.vide).toBeUndefined()
})

test.each(['manquant', 'doublon', 'étranger', 'format ancien', 'id absent', 'aperçu périmé', 'commande invalide', 'génération en collision'] as const)('%s : préparation refusée sans mutation', (cas) => {
  const b = fixtureLocuteursDistants(), sources = b.sources()
  let commande: CommandeCorrectionLocuteurs = { type: 'renommerGlobal', locuteurId: 'a', nom: 'Après', attendu: b.attendu() }
  if (cas === 'manquant') sources.pop()
  if (cas === 'doublon') sources.push(sources[0])
  if (cas === 'étranger') sources[0] = { ...sources[0], id: 'inconnu' }
  if (cas === 'format ancien' || cas === 'id absent') {
    const data = JSON.parse(sources[0].contenu)
    if (cas === 'format ancien') data.formatVersion = 9
    else delete data.participations[0].id
    sources[0].contenu = JSON.stringify(data)
  }
  if (cas === 'aperçu périmé') commande.attendu = '{}'
  if (cas === 'commande invalide') commande.nom = ''
  if (cas === 'génération en collision') commande = { type: 'dissocierSelection', locuteurId: 'a', participations: [{ entretienId: 'A', participationId: 'local' }], attendu: b.attendu() }
  const avant = JSON.stringify([b.corpus, sources, commande])
  expect(() => preparerCorrectionLocuteurs(JSON.stringify(b.corpus), sources, commande, { genererId: () => 'a' })).toThrow()
  expect(JSON.stringify([b.corpus, sources, commande])).toBe(avant)
})
