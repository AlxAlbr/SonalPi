import { describe, expect, test } from 'vitest'
import { preparerApercuCorrectionLocuteurs } from '../src/shared/corpus/apercusCorrectionsLocuteurs'
import { inventaireCorrections, lignesCorrections } from './fixtures/correctionsLocuteursCorpus'

describe('aperçus des corrections de la sélection corpus', () => {
  test('le renommage inclut les entretiens masqués, sans modifier l’inventaire ni les noms locaux', () => {
    const inventaire = inventaireCorrections()
    inventaire.locuteurs[0].nom = ' Alice '
    const avant = structuredClone(inventaire)
    const resultat = preparerApercuCorrectionLocuteurs('renommerGlobal', lignesCorrections(inventaire).slice(0, 1), inventaire)
    expect(resultat.participations.map((p) => [p.entretienId, p.participationId, p.nom])).toEqual([
      ['A', 'local', 'Alice locale'], ['B', 'local', 'Mme Alice'],
    ])
    expect(resultat.attendu).toBe(JSON.stringify(avant))
    expect(inventaire).toEqual(avant)
    expect(resultat.conflits).toEqual([])
  })
  test('une sélection de trois identités conserve tous ses entretiens et références contextualisées', () => {
    const inventaire = inventaireCorrections()
    const resultat = preparerApercuCorrectionLocuteurs('regrouperSelection', lignesCorrections(inventaire), inventaire)
    expect(resultat.locuteurs.map((l) => l.id)).toEqual(['p1', 'p2', 'p3'])
    expect(resultat.participations).toHaveLength(4)
    expect(resultat.conflits).toEqual([])
  })
  test('un conflit dans un même entretien reste explicite avant toute commande', () => {
    const inventaire = inventaireCorrections()
    Object.assign(inventaire.participations[2], { entretienId: 'A', entretienTitre: 'Entretien A', index: 1 })
    const resultat = preparerApercuCorrectionLocuteurs('regrouperSelection', lignesCorrections(inventaire), inventaire)
    expect(resultat.conflits).toEqual([{ entretienId: 'A', titre: 'Entretien A' }])
  })
  test.each(['nom', 'participation', 'titre', 'ajout', 'suppression', 'identite'])('un changement de %s invalide la sélection affichée', (changement) => {
    const inventaire = inventaireCorrections(), selection = lignesCorrections(inventaire).slice(0, 1)
    if (changement === 'nom') inventaire.locuteurs[0].nom = 'Autre nom'
    if (changement === 'participation') inventaire.participations[0].nom = 'Nom local changé'
    if (changement === 'titre') inventaire.participations[0].entretienTitre = 'Autre titre'
    if (changement === 'ajout') inventaire.participations.push({ ...inventaire.participations[0], entretienId: 'E' })
    if (changement === 'suppression') inventaire.participations.shift()
    if (changement === 'identite') inventaire.locuteurs.shift()
    expect(() => preparerApercuCorrectionLocuteurs('renommerGlobal', selection, inventaire)).toThrow('ont changé')
  })
  test('un inventaire incomplet bloque aussi une correction dont les membres paraissent lisibles', () => {
    const inventaire = inventaireCorrections()
    inventaire.indisponibles.push({ id: 'absent', titre: 'Entretien absent', raison: 'Absent' })
    expect(() => preparerApercuCorrectionLocuteurs('renommerGlobal', lignesCorrections(inventaire).slice(0, 1), inventaire)).toThrow('indisponibles')
  })
  test('une entrée sans association exige un choix explicite, sans création implicite', () => {
    const inventaire = inventaireCorrections(), selection = lignesCorrections(inventaire).slice(0, 1)
    selection[0].locuteurId = null
    const avant = structuredClone(inventaire)
    expect(() => preparerApercuCorrectionLocuteurs('renommerGlobal', selection, inventaire)).toThrow('Conservez d’abord')
    expect(inventaire).toEqual(avant)
  })
  test('une dissociation exige plusieurs participations ; une sélection dupliquée est refusée', () => {
    const inventaire = inventaireCorrections(), lignes = lignesCorrections(inventaire)
    expect(() => preparerApercuCorrectionLocuteurs('dissocierSelection', [lignes[1]], inventaire)).toThrow('un seul entretien')
    expect(() => preparerApercuCorrectionLocuteurs('regrouperSelection', [lignes[0], lignes[0]], inventaire)).toThrow('plusieurs fois')
    expect(() => preparerApercuCorrectionLocuteurs('renommerGlobal', [], inventaire)).toThrow('nombre')
  })
})
