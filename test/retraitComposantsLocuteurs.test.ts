import { existsSync } from 'node:fs'
import { expect, test } from 'vitest'
import * as inventaire from '../src/shared/corpus/inventaireLocuteurs'
import { CorpusStore } from '../src/main/corpusStore'
import { TransactionsCorpus } from '../src/main/distant/transactions'
import { fixtureLocuteursDistants } from './fixtures/locuteursDistants'

test.each([
  '../src/renderer/components/traiter/corpus/PersonnesCorpus.vue',
  '../src/renderer/components/traiter/corpus/RapprochementCorpus.vue',
  '../src/shared/corpus/personnes.ts',
])('le parcours commun ne conserve pas le fichier historique %s', (chemin) => {
  expect(existsSync(new URL(chemin, import.meta.url))).toBe(false)
})

test('le store n’expose plus l’ancien nom de lecture, sans alias de compatibilité', () => {
  expect(CorpusStore.prototype).not.toHaveProperty('personnesInventaire')
  expect(CorpusStore.prototype.inventaireIdentitesLocuteurs).toBeTypeOf('function')
})

test.each(['personnesCommander', 'creerDefinitionPersonne', 'refuserRapprochementSimple', 'rapprocherPersonneSimple'])('le store ne conserve pas la commande historique %s', (nom) => {
  expect(CorpusStore.prototype).not.toHaveProperty(nom)
})

test.each(['executerEntretienAvecSource', 'refuserRapprochement', 'rapprocherPersonnes', 'fusionnerPersonnes', 'separerPersonne', 'supprimerPersonneVide', 'creerPersonneDepuisLocuteur'])('le fournisseur ne conserve pas le relais historique %s', (nom) => {
  expect(TransactionsCorpus.prototype).not.toHaveProperty(nom)
})

test('le module d’inventaire ne réexporte ni commandes ni alias métier', () => {
  expect(Object.keys(inventaire)).toEqual(['inventorierLocuteurs'])
})

test('l’inventaire conserve les homonymes, les notes contextualisées et les sources sans créer d’identité', () => {
  const f = fixtureLocuteursDistants()
  f.entretiens[0].data.participations[0].locuteurRef = null
  f.entretiens[0].data.participations[0].nom = 'Homonyme'
  f.entretiens[1].data.participations[0].nom = 'Homonyme'
  const avant = structuredClone({ corpus: f.corpus, entretiens: f.entretiens })
  const resultat = inventaire.inventorierLocuteurs(f.corpus, f.entretiens)
  expect(resultat.locuteurs).toHaveLength(Object.keys(avant.corpus.locuteurs).length)
  expect(resultat.participations).toHaveLength(3)
  expect(resultat.participations.filter((p) => p.nom === 'Homonyme')).toHaveLength(2)
  expect(resultat.participations.find((p) => p.entretienId === 'A')?.locuteurRef).toBeNull()
  expect(resultat.notes.map((n) => [n.entretienId, n.participationIds, n.corps])).toEqual([
    ['A', ['local'], 'Contenu A'], ['B', ['local'], 'Contenu B'], ['C', ['local'], 'Contenu C'],
  ])
  expect({ corpus: f.corpus, entretiens: f.entretiens }).toEqual(avant)
})
