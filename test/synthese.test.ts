import { describe, expect, it } from 'vitest'
import { exporterSyntheseTxt } from '../src/shared/synthese/export'
import { calculerExtraitsSynthese } from '../src/shared/synthese/moteur'
import { filtresSyntheseParDefaut, type FiltresSynthese, type SourceMoteurSynthese } from '../src/shared/synthese/types'

const source: SourceMoteurSynthese = {
  entretienId: 'e1',
  titreEntretien: 'Entretien 1',
  longueurSource: 100,
  ordre: 0,
  valeursEntretien: { age: 'adulte' },
  contributions: [
    { from: 10, to: 30, themeIds: ['t1'], annotationIds: ['a1'] },
    { from: 20, to: 40, themeIds: ['t2'], annotationIds: ['a2'] },
  ],
  tours: [
    { from: 1, to: 25, participationIndex: 0, participationId: 'local-a', locuteurId: 'p1', interviewer: false, valeursParticipation: { statut: 'participant' } },
    { from: 25, to: 80, participationIndex: 1, participationId: 'local-b', locuteurId: 'p2', interviewer: false, valeursParticipation: { statut: 'participant' } },
  ],
}
const contexte = {
  variables: [
    { id: 'age', portee: 'entretien' as const, modalites: [{ id: 'adulte', lib: 'Adulte' }] },
    { id: 'statut', portee: 'participation' as const, modalites: [{ id: 'participant', lib: 'Participant' }] },
  ],
  cas: { c1: [{ entretienId: 'e1', from: 15, to: 35 }] },
}
function filtres(): FiltresSynthese {
  const valeur = filtresSyntheseParDefaut()
  valeur.themes = { mode: 'choix', ids: ['t1', 't2'] }
  return valeur
}

describe('moteur de synthèse', () => {
  it('réunit les codages qui se chevauchent sans franchir un changement de locuteur', () => {
    const resultat = calculerExtraitsSynthese([source], filtres(), contexte)
    expect(resultat.map((item) => [item.from, item.to])).toEqual([[10, 25], [25, 40]])
    expect(resultat[0].annotationIds).toEqual(['a1', 'a2'])
    expect(resultat[1].themeIds).toEqual(['t1', 't2'])
    expect(resultat.map((item) => item.participationIds)).toEqual([['local-a'], ['local-b']])
    expect(resultat.map((item) => item.locuteurIds)).toEqual([['p1'], ['p2']])
  })

  it('retient uniquement le chevauchement lorsque tous les thèmes sont demandés au même endroit', () => {
    const selection = filtres()
    selection.correspondanceThemes = 'tous-au-meme-endroit'
    expect(calculerExtraitsSynthese([source], selection, contexte).map((item) => [item.from, item.to]))
      .toEqual([[20, 25], [25, 30]])
  })

  it('intersecte un thème et un cas sur les mêmes positions', () => {
    const selection = filtres()
    selection.themes = { mode: 'choix', ids: ['t1'] }
    selection.cas = { mode: 'choix', ids: ['c1'] }
    expect(calculerExtraitsSynthese([source], selection, contexte).map((item) => [item.from, item.to]))
      .toEqual([[15, 25], [25, 30]])
  })

  it('applique les identités de locuteurs aux seules paroles concernées', () => {
    const selection = filtres()
    selection.locuteurs = { selection: { mode: 'choix', ids: ['p2'] }, sansIdentiteCommune: false, sansParticipation: false }
    const resultat = calculerExtraitsSynthese([source], selection, contexte)
    expect(resultat).toHaveLength(1)
    expect([resultat[0].from, resultat[0].to]).toEqual([25, 40])
  })

  it('distingue une participation non associée d’une plage sans tour', () => {
    const data = structuredClone(source)
    data.tours[1].from = 35
    data.tours[1].locuteurId = null
    const selection = filtres()
    selection.locuteurs = { selection: { mode: 'choix', ids: [] }, sansIdentiteCommune: true, sansParticipation: false }
    const positions = () => calculerExtraitsSynthese([data], selection, contexte).map((e) => [e.from, e.to])
    expect(positions()).toEqual([[35, 40]])
    selection.locuteurs.sansIdentiteCommune = false
    selection.locuteurs.sansParticipation = true
    expect(positions()).toEqual([[25, 35]])
    selection.locuteurs.selection = { mode: 'choix', ids: ['p1'] }
    expect(positions()).toEqual([[10, 25], [25, 35]])
  })

  it('évalue le rôle et les variables sur chaque participation, pas sur l’identité commune', () => {
    const a = structuredClone(source)
    a.tours = [a.tours[0]]
    const b = structuredClone(a)
    b.entretienId = 'autre-entretien'
    b.ordre = 1
    b.tours[0].interviewer = true
    const selection = filtres()
    selection.locuteurs = { selection: { mode: 'choix', ids: ['p1'] }, sansIdentiteCommune: false, sansParticipation: false }
    selection.variables.statut = { portee: 'participation', modaliteIds: ['participant'], nonRenseigne: false }
    expect(calculerExtraitsSynthese([a, b], selection, contexte).map((e) => e.entretienId)).toEqual(['e1'])
    selection.inclureEnqueteurs = true
    const resultat = calculerExtraitsSynthese([a, b], selection, contexte)
    expect(resultat.map((e) => e.entretienId)).toEqual(['e1', 'autre-entretien'])
    expect(resultat.map((e) => e.participationIds)).toEqual([['local-a'], ['local-a']])
    expect(resultat.map((e) => e.locuteurIds)).toEqual([['p1'], ['p1']])
  })

  it('ne calcule jamais la transcription entière sans thème ni cas', () => {
    expect(calculerExtraitsSynthese([source], filtresSyntheseParDefaut(), contexte)).toEqual([])
  })

  it('produit un identifiant stable', () => {
    const premier = calculerExtraitsSynthese([source], filtres(), contexte)
    const second = calculerExtraitsSynthese([structuredClone(source)], filtres(), contexte)
    expect(second.map((item) => item.id)).toEqual(premier.map((item) => item.id))
  })

  it('exporte la collection visible sans autre version du texte', () => {
    const brut = calculerExtraitsSynthese([source], filtres(), contexte)[0]
    const contenu = exporterSyntheseTxt({
      titre: 'Synthèse',
      date: new Date('2026-01-02T10:00:00Z'),
      criteres: ['Thèmes : thème 1'],
      diagnostics: [],
      nomTheme: (id) => id,
      extraits: [{ ...brut, texte: 'texte visible', avant: '', apres: '', locuteurs: ['Alice'] }],
    })
    expect(contenu).toContain('texte visible')
    expect(contenu).toContain('Résultat complet')
  })
})
