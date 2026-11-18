import { describe, expect, test } from 'vitest'
import { projeterCas, type SourceCasChargee } from '../src/renderer/editor/cas'
import { validerCorpusNatif, validerEntretienNatif } from '../src/shared/natif/validation'
import { corpusCasNatif, entretienCasNatif, casNatif, dateCasNatif, idLocuteurNatif, idParticipationNative } from './fixtures/casNatifs'

function figer(v: unknown): void {
  if (!v || typeof v !== 'object') return
  Object.values(v).forEach(figer)
  Object.freeze(v)
}

describe('cas — lecture native des identités et participations', () => {
  test('conserve l’ordre des provenances à plage identique et ne compte qu’une fois le texte', () => {
    const corpus = corpusCasNatif()
    const entretien = entretienCasNatif()
    const cas = casNatif()
    cas.regles.push({ type: 'modalite', variableId: 'groupe', modaliteId: 'a', portee: 'participation', inclureEnqueteurs: false })
    cas.rattachements.push({ id: 'manuel', source: { entretienId: 'e1', repereId: 'repere' }, provenance: 'manuel', creeLe: dateCasNatif })
    const avant = structuredClone([corpus, entretien, cas])
    validerCorpusNatif(corpus); validerEntretienNatif(entretien)
    figer(corpus); figer(entretien); figer(cas)
    const vue = projeterCas(corpus, cas, new Map([['e1', { ok: true, data: entretien }]]))
    expect(vue.passages.map((p) => p.origine.type)).toEqual(['manuel', 'regle-modalite', 'regle-locuteur'])
    expect(vue.passages.map((p) => [p.from, p.to, p.texte, p.locuteurs])).toEqual([
      [1, 15, 'Bonjour Voix.', ['Voix A']], [1, 15, 'Bonjour Voix.', ['Voix A']], [1, 15, 'Bonjour Voix.', ['Voix A']],
    ])
    expect(vue.metriques).toEqual({ rattachementsManuels: 1, passagesDisponibles: 3, sourcesDistinctes: 1,
      motsSansDoubleCompte: 2, caracteresSansDoubleCompte: 14, chevauchements: 2 })
    expect(vue.vues.regles.metriques.chevauchements).toBe(1)
    expect(vue.vues.manuels.metriques.chevauchements).toBe(0)
    expect(vue.passages[2].origine).toEqual({ type: 'regle-locuteur', locuteurId: idLocuteurNatif,
      entretienId: 'e1', participationIndex: 7, participationId: idParticipationNative })
    expect([corpus, entretien, cas]).toEqual(avant)
  })

  test('les homonymes ne remplacent pas une référence d’identité commune', () => {
    const corpus = corpusCasNatif()
    const entretien = entretienCasNatif()
    entretien.participations.push({ id: 'autre-local', index: 11, nom: entretien.participations[0].nom,
      locuteurRef: 'autre', valeursLoc: { groupe: 'a' } })
    ;(entretien.corpsTexte as { content: unknown[] }).content.push({
      type: 'paragraph', attrs: { loc: 11 }, content: [{ type: 'text', text: 'Paroles de l’homonyme.' }],
    })
    const vue = projeterCas(corpus, casNatif(), new Map([['e1', { ok: true, data: entretien }]]), 'original')
    expect(vue.passages.map((p) => p.texte)).toEqual(['Bonjour Alice.'])
    expect(vue.diagnosticsRegles).toEqual([])
    expect(Object.keys(corpus.locuteurs)).toHaveLength(2)
  })

  test('le rôle reste local et une référence de participation garde toujours son entretien', () => {
    const corpus = corpusCasNatif()
    corpus.membership.e2 = { titre: 'Entretien B', date: null, lastModified: dateCasNatif }
    const premier = entretienCasNatif()
    const second = entretienCasNatif()
    second.participations[0].interviewer = true
    second.participations[0].nom = 'Variante du nom local'
    const sources = new Map<string, SourceCasChargee>([['e1', { ok: true, data: premier }], ['e2', { ok: true, data: second }]])
    const cas = casNatif()
    expect(projeterCas(corpus, cas, sources).passages.map((p) => p.titreEntretien)).toEqual(['Entretien A'])
    cas.regles = [{ type: 'locuteur', locuteurId: idLocuteurNatif, inclureEnqueteurs: true }]
    expect(projeterCas(corpus, cas, sources).passages.map((p) => p.origine)).toEqual([
      { type: 'regle-locuteur', locuteurId: idLocuteurNatif, entretienId: 'e1', participationIndex: 7, participationId: idParticipationNative },
      { type: 'regle-locuteur', locuteurId: idLocuteurNatif, entretienId: 'e2', participationIndex: 7, participationId: idParticipationNative },
    ])
    expect(corpus.locuteurs[idLocuteurNatif]).toEqual({ id: idLocuteurNatif, nom: 'Alice' })
  })

  test('une source indisponible reste un manque signalé, sans suppression de références', () => {
    const corpus = corpusCasNatif()
    const cas = casNatif()
    cas.rattachements.push({ id: 'manuel', source: { entretienId: 'e1', repereId: 'repere' }, provenance: 'manuel', creeLe: dateCasNatif })
    const avant = structuredClone([corpus, cas])
    const vue = projeterCas(corpus, cas, new Map([['e1', { ok: false, raison: 'Version non supportée', invalide: true }]]))
    expect(vue.passages[0].etat).toBe('source-invalide')
    expect(vue.diagnosticsRegles).toEqual([{ type: 'source-invalide', locuteurId: idLocuteurNatif, entretienId: 'e1',
      diagnostic: 'La source ne peut pas être lue pour appliquer la règle.' }])
    expect([corpus, cas]).toEqual(avant)
  })

  test('une identité absente ne se reconstruit pas depuis un homonyme', () => {
    const corpus = corpusCasNatif()
    delete corpus.locuteurs[idLocuteurNatif]
    const avant = structuredClone(corpus)
    const vue = projeterCas(corpus, casNatif(), new Map([['e1', { ok: true, data: entretienCasNatif() }]]))
    expect(vue.passages).toEqual([])
    expect(vue.diagnosticsRegles).toEqual([{ type: 'locuteur-introuvable', locuteurId: idLocuteurNatif, entretienId: null,
      diagnostic: "Le locuteur utilisé par cette règle n'existe plus." }])
    expect(corpus).toEqual(avant)
  })
})
