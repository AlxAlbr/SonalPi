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
    { from: 1, to: 25, locuteurId: '0', personneId: 'p1', interviewer: false, valeursLocuteur: { statut: 'participant' } },
    { from: 25, to: 80, locuteurId: '1', personneId: 'p2', interviewer: false, valeursLocuteur: { statut: 'participant' } },
  ],
}
const contexte = {
  variables: [
    { id: 'age', portee: 'entretien' as const, modalites: [{ id: 'adulte', lib: 'Adulte' }] },
    { id: 'statut', portee: 'locuteur' as const, modalites: [{ id: 'participant', lib: 'Participant' }] },
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

  it('applique les personnes aux seules paroles concernées', () => {
    const selection = filtres()
    selection.personnes = { selection: { mode: 'choix', ids: ['p2'] }, sansPersonne: false, sansLocuteur: false }
    const resultat = calculerExtraitsSynthese([source], selection, contexte)
    expect(resultat).toHaveLength(1)
    expect([resultat[0].from, resultat[0].to]).toEqual([25, 40])
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
