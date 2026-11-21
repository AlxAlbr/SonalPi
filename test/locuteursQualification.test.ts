import { expect, test } from 'vitest'
import { examinerLocuteurs, notesSelectionLocuteurs } from '../src/shared/corpus/detailsLocuteurs'
import type { InventaireIdentitesLocuteurs } from '../src/shared/corpus/inventaireLocuteurs'
import { analyserRapprochementLocuteur, calculerSuggestionsLocuteurs, rapprochementLocuteursRefuse } from '../src/shared/corpus/rapprochementsLocuteurs'

function inventaire(nombre = 2000): InventaireIdentitesLocuteurs {
  return { locuteurs: [{ id: 'a', nom: 'Enquêteur' }, { id: 'b', nom: 'Enquêteur' }, { id: 'vide', nom: 'Sans entretien' }],
    indisponibles: [], notes: [], participations: Array.from({ length: nombre }, (_, i) => ({
      entretienId: `e${i}`, entretienTitre: `Entretien ${i}`, participationId: 'local', index: 7,
      nom: 'Enquêteur', interviewer: i % 2 === 0, pseudo: `Pseudonyme ${i}`, valeursLoc: { v: `m${i}` },
      locuteurRef: i < nombre / 2 ? 'a' : 'b', rapprochementsRefuses: [],
    })) }
}

test('deux mille entretiens : les homonymes restent distincts, une seule proposition et aucune mutation', () => {
  const inv = inventaire(), avant = JSON.stringify(inv), examen = examinerLocuteurs(inv)
  expect(examen.propositions).toHaveLength(1)
  expect(examen.propositions[0].selection).toHaveLength(2000)
  expect(new Set(examen.propositions[0].selection.map((r) => `${r.entretienId}/${r.participationId}`)).size).toBe(2000)
  expect(examen.sansEntretien).toEqual([inv.locuteurs[2]])
  expect(JSON.stringify(inv)).toBe(avant)
})

test('un refus porté par le dernier membre exclut tout le groupe, même avec deux mille entretiens', () => {
  const inv = inventaire()
  inv.participations.at(-1)!.rapprochementsRefuses = [{ type: 'participation', entretienId: 'e0', participationId: 'local' }]
  const avant = JSON.stringify(inv), examen = examinerLocuteurs(inv, 5)
  expect(examen.propositions).toEqual([])
  expect(examen.distinctions).toHaveLength(1)
  expect(JSON.stringify(inv)).toBe(avant)
})

test('un contrôle personnalisé des refus ne parcourt pas le même groupe pour chaque apparition', () => {
  const candidats = inventaire(400).participations.map((p) => ({ entretienId: p.entretienId, participation: { ...p, id: p.participationId } }))
  let controles = 0
  const propositions = calculerSuggestionsLocuteurs(candidats[0], candidats, analyserRapprochementLocuteur, (a, b) => {
    controles++; return rapprochementLocuteursRefuse(a, b)
  })
  expect(propositions).toEqual([candidats[200]])
  expect(controles).toBeGreaterThan(0); expect(controles).toBeLessThan(50_000)
})

test('deux mille ids locaux identiques : les notes publiques et privées restent contextualisées', () => {
  const inv = inventaire()
  inv.notes = inv.participations.map((p, i) => ({ id: 'note', entretienId: p.entretienId, entretienTitre: p.entretienTitre,
    categorieId: 'generale', titre: `Note ${i}`, corps: `Contenu ${i}`, date: null, statut: i % 2 ? 'public' : 'prive', rang: 0, participationIds: ['local'] }))
  const avant = JSON.stringify(inv)
  expect(notesSelectionLocuteurs(inv, [inv.participations[0], inv.participations[0], inv.participations[1999]])).toEqual([inv.notes[0], inv.notes[1999]])
  expect(JSON.stringify(inv)).toBe(avant)
})
