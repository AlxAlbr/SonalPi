import { describe, expect, test } from 'vitest'
import { debutBloc } from '../src/shared/entretien/positions'
import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier } from '../src/shared/format'
import type { Cas } from '../src/shared/corpus/cas'
import { projeterCas, type SourceCasChargee } from '../src/renderer/editor/cas'
import { projeterRecueil } from '../src/renderer/editor/recueils'

const maintenant = '2026-09-01T10:00:00.000Z'

const textesE1 = [
  'Question préalable.',
  'Bonjour Alice à Lyon.',
  'Je continue.',
  'Paul répond.',
  'Sans locuteur.',
  'Locuteur inconnu.',
  'Retour Alice.',
]

function document(textes: string[], locuteurs: Array<number | null>) {
  return {
    type: 'doc',
    content: textes.map((texte, index) => ({
      type: 'paragraph',
      attrs: { loc: locuteurs[index] },
      ...(texte ? { content: [{ type: 'text', text: texte }] } : {}),
    })),
  }
}

function sourceE1(): EntretienFichier {
  const longueurs = textesE1.map((texte) => texte.length)
  const debutAlice = debutBloc(longueurs, 1)
  return {
    formatVersion: FORMAT_VERSION,
    lastModified: maintenant,
    corpsTexte: document(textesE1, [1, 2, 2, 3, null, 99, 2]),
    annotations: [
      {
        id: 'anon-alice', type: 'anon', from: debutAlice + 8, to: debutAlice + 13,
        auteur: '', etat: 'anonymise', pseudo: 'Personne A',
      },
      {
        id: 'anon-lyon', type: 'anon', from: debutAlice + 16, to: debutAlice + 20,
        auteur: '', etat: 'anonymise', pseudo: 'Ville B',
      },
    ],
    ancres: [],
    locuteurs: [
      { index: 1, nom: 'Enquêteur', interviewer: true, valeursLoc: {}, personneRef: null },
      {
        index: 2, nom: 'Alice', pseudo: 'Locutrice A', pseudoEtat: 'confirme',
        valeursLoc: {}, personneRef: 'personne-1',
      },
      { index: 3, nom: 'Paul', valeursLoc: {}, personneRef: 'personne-2' },
    ],
    meta: { valeursGen: {}, audioRef: null },
    reperesPassages: [{ id: 'repere-1', from: debutAlice, to: debutAlice + 7 }],
  }
}

function sourceE2(): EntretienFichier {
  return {
    formatVersion: FORMAT_VERSION,
    lastModified: maintenant,
    corpsTexte: document(['Question de la personne.'], [1]),
    annotations: [],
    ancres: [],
    locuteurs: [{
      index: 1,
      nom: 'Alice enquêtrice',
      interviewer: true,
      valeursLoc: {},
      personneRef: 'personne-1',
    }],
    meta: { valeursGen: {}, audioRef: null },
    reperesPassages: [],
  }
}

function corpus(): Pick<CorpusFichier, 'membership' | 'personnes'> {
  return {
    personnes: {
      'personne-1': { id: 'personne-1', nom: 'Alice' },
      'personne-2': { id: 'personne-2', nom: 'Paul' },
    },
    membership: {
      e1: { titre: 'Entretien A', date: null, lastModified: maintenant },
      e2: { titre: 'Entretien B', date: null, lastModified: maintenant },
    },
  }
}

function casPersonne(inclureEnqueteurs = false): Cas {
  return {
    id: 'cas-1',
    nom: 'Alice',
    memo: 'Trajectoire.',
    creeLe: maintenant,
    modifieLe: maintenant,
    regles: [{ type: 'personne', personneId: 'personne-1', inclureEnqueteurs }],
    rattachements: [{
      id: 'rattachement-1',
      source: { entretienId: 'e1', repereId: 'repere-1' },
      provenance: 'manuel',
      creeLe: maintenant,
    }],
  }
}

function sources(): Map<string, SourceCasChargee> {
  return new Map([
    ['e1', { ok: true as const, data: sourceE1() }],
    ['e2', { ok: true as const, data: sourceE2() }],
  ])
}

describe('cas — résolution et projection', () => {
  test('réunit plusieurs personnes en respectant leur filtre local et sans compter deux fois les ajouts', () => {
    const cas: Cas = { ...casPersonne(), regles: [{ type: 'personnes', membres: [
      { personneId: 'personne-1', inclureEnqueteurs: false },
      { personneId: 'personne-2', inclureEnqueteurs: true },
    ] }] }
    const projection = projeterCas(corpus(), cas, sources())
    expect(projection.vues.regles.passages.map((passage) => passage.texte))
      .toEqual(['Bonjour Personne A à Ville B. Je continue.', 'Paul répond.', 'Retour Alice.'])
    expect(projection.metriques.caracteresSansDoubleCompte).toBe(projection.vues.regles.metriques.caracteresSansDoubleCompte)
    const regle = cas.regles[0]
    if (regle.type !== 'personnes') throw new Error('Règle attendue')
    regle.membres[0].inclureEnqueteurs = true
    expect(projeterCas(corpus(), cas, sources()).vues.regles.passages.map((passage) => passage.texte))
      .toContain('Question de la personne.')
  })

  test('une règle d’entretien couvre les questions, les blocs sans locuteur et les futurs ajouts', () => {
    const cas: Cas = { ...casPersonne(), regles: [{ type: 'entretiens', entretienIds: ['e1'] }] }
    const avant = structuredClone(cas)
    const projection = projeterCas(corpus(), cas, sources())
    const passage = projection.vues.regles.passages[0]
    expect(passage.origine).toEqual({ type: 'regle-entretien', entretienId: 'e1' })
    expect(passage.from).toBe(0)
    expect(passage.texte).toContain('Question préalable.')
    expect(passage.texte).toContain('Sans locuteur.')
    expect(passage.texte).toContain('Personne A')
    expect(projection.metriques.caracteresSansDoubleCompte).toBe(projection.vues.regles.metriques.caracteresSansDoubleCompte)
    expect(projection.vues.manuels.passages).toHaveLength(1)
    const modifiee = sourceE1()
    modifiee.corpsTexte = document([...textesE1, 'Ajout ultérieur.'], [1, 2, 2, 3, null, 99, 2, null])
    const suivantes = sources()
    suivantes.set('e1', { ok: true, data: modifiee })
    const actualisee = projeterCas(corpus(), cas, suivantes)
    expect(actualisee.vues.regles.passages[0].texte).toContain('Ajout ultérieur.')
    expect(actualisee.vues.regles.passages[0].to).toBeGreaterThan(passage.to!)
    expect(cas).toEqual(avant)
  })

  test('distingue un entretien entier vide, illisible et retiré du corpus', () => {
    const cas: Cas = { ...casPersonne(), rattachements: [], regles: [{ type: 'entretiens', entretienIds: ['e1', 'e2', 'absent'] }] }
    const vide = sourceE1()
    vide.corpsTexte = document(['', ''], [null, null])
    vide.annotations = []
    vide.reperesPassages = []
    const chargees = new Map<string, SourceCasChargee>([
      ['e1', { ok: true, data: vide }],
      ['e2', { ok: false, raison: 'Fichier illisible.' }],
    ])
    const projection = projeterCas(corpus(), cas, chargees)
    expect(projection.vues.regles.passages).toHaveLength(1)
    expect(projection.vues.regles.passages[0]).toMatchObject({ etat: 'disponible', texte: '' })
    expect(projection.metriques).toMatchObject({ sourcesDistinctes: 3, passagesDisponibles: 0, caracteresSansDoubleCompte: 0 })
    expect(projection.diagnosticsRegles.map((diagnostic) => diagnostic.type))
      .toEqual(['source-indisponible', 'entretien-hors-corpus'])
  })

  test('résout les interventions liées et distingue la règle des ajouts manuels', () => {
    const cas = casPersonne()
    const chargees = sources()
    const avantCas = structuredClone(cas)
    const avantSources = structuredClone([...chargees])
    const projection = projeterCas(corpus(), cas, chargees)

    const regle = projection.passages.filter((passage) => passage.origine.type === 'regle-personne')
    const manuels = projection.passages.filter((passage) => passage.origine.type === 'manuel')
    expect(regle).toHaveLength(2)
    expect(manuels).toHaveLength(1)
    expect(regle.map((passage) => passage.texte)).toEqual([
      'Bonjour Personne A à Ville B. Je continue.',
      'Retour Alice.',
    ])
    expect(regle[0].locuteurs).toEqual(['Locutrice A'])
    expect(projection.passages.some((passage) => passage.titreEntretien === 'Entretien B')).toBe(false)
    expect(projection.diagnosticsRegles).toEqual([])
    expect(cas).toEqual(avantCas)
    expect([...chargees]).toEqual(avantSources)
  })

  test('partage la résolution du repère avec les recueils sans partager leur métier', () => {
    const chargees = sources()
    const passageCas = projeterCas(corpus(), { ...casPersonne(), regles: [] }, chargees)
      .passages[0]
    const passageRecueil = projeterRecueil(corpus(), {
      id: 'recueil-1',
      nom: 'Synthèse',
      creeLe: maintenant,
      modifieLe: maintenant,
      modeTexte: 'pseudonymise',
      items: [{
        id: 'item-1',
        type: 'passage',
        source: { entretienId: 'e1', repereId: 'repere-1' },
        commentaireEditorial: 'Commentaire propre au recueil.',
      }],
    }, chargees).items[0]

    expect(passageRecueil.type).toBe('passage')
    if (passageRecueil.type !== 'passage') return
    expect(passageCas).toMatchObject({
      texte: passageRecueil.texte,
      from: passageRecueil.from,
      to: passageRecueil.to,
      locuteurs: passageRecueil.locuteurs,
    })
    expect(passageCas).not.toHaveProperty('commentaireEditorial')
  })

  test('inclut les enquêteurs seulement lorsque la règle le demande', () => {
    const projection = projeterCas(corpus(), casPersonne(true), sources(), 'original')
    const entretienB = projection.passages.find((passage) => passage.titreEntretien === 'Entretien B')
    expect(entretienB).toMatchObject({
      origine: { type: 'regle-personne', personneId: 'personne-1', entretienId: 'e2' },
      texte: 'Question de la personne.',
      locuteurs: ['Alice enquêtrice'],
    })
  })

  test('calcule l’union textuelle sans compter deux fois un chevauchement', () => {
    const avecManuel = projeterCas(corpus(), casPersonne(), sources())
    const sansManuel = projeterCas(
      corpus(),
      { ...casPersonne(), rattachements: [] },
      sources(),
    )

    expect(avecManuel.metriques).toMatchObject({
      rattachementsManuels: 1,
      passagesDisponibles: 3,
      sourcesDistinctes: 1,
      chevauchements: 1,
    })
    expect(avecManuel.metriques.motsSansDoubleCompte)
      .toBe(sansManuel.metriques.motsSansDoubleCompte)
    expect(avecManuel.metriques.caracteresSansDoubleCompte)
      .toBe(sansManuel.metriques.caracteresSansDoubleCompte)
  })

  test('les trois vues conservent leur provenance et leurs métriques propres', () => {
    const cas = casPersonne()
    const projection = projeterCas(corpus(), cas, sources(), 'original')
    const { tous, regles, manuels } = projection.vues
    expect(tous.passages).toBe(projection.passages)
    expect(tous.metriques).toBe(projection.metriques)
    expect(regles.passages).toHaveLength(2)
    expect(regles.passages.every((passage) => passage.origine.type === 'regle-personne')).toBe(true)
    expect(manuels.passages.map((passage) => passage.texte)).toEqual(['Bonjour'])
    expect(manuels.metriques).toMatchObject({
      rattachementsManuels: 1, passagesDisponibles: 1, sourcesDistinctes: 1,
      motsSansDoubleCompte: 1, caracteresSansDoubleCompte: 7, chevauchements: 0,
    })
    expect(regles.metriques).toMatchObject({
      rattachementsManuels: 0, passagesDisponibles: 2, motsSansDoubleCompte: 8, chevauchements: 0,
    })
    expect(tous.metriques.motsSansDoubleCompte).toBe(regles.metriques.motsSansDoubleCompte)
    expect(tous.metriques.chevauchements).toBe(1)
    cas.rattachements = []
    const apresRetrait = projeterCas(corpus(), cas, sources(), 'original')
    expect(apresRetrait.vues.manuels.passages).toEqual([])
    expect(apresRetrait.vues.regles).toEqual(regles)
    expect(apresRetrait.passages).toEqual(regles.passages)
  })

  test('les problèmes restent attachés à leur vue et présents dans la projection complète', () => {
    const cas = casPersonne()
    cas.rattachements[0].source.repereId = 'absent'
    const incompletes = sources()
    incompletes.delete('e2')
    const projection = projeterCas(corpus(), cas, incompletes)
    expect(projection.problemes).toBe(2)
    expect(projection.vues.tous.problemes).toBe(2)
    expect(projection.vues.regles.problemes).toBe(1)
    expect(projection.vues.regles.diagnosticsRegles).toHaveLength(1)
    expect(projection.vues.manuels.problemes).toBe(1)
    expect(projection.vues.manuels.diagnosticsRegles).toEqual([])
    expect(projection.vues.manuels.passages[0].etat).toBe('repere-introuvable')
  })

  test('un cas manuel vide a trois vues vides sans problème ni source à charger', () => {
    const projection = projeterCas(corpus(), { ...casPersonne(), regles: [], rattachements: [] }, new Map())
    for (const vue of Object.values(projection.vues)) {
      expect(vue.passages).toEqual([])
      expect(vue.diagnosticsRegles).toEqual([])
      expect(vue.problemes).toBe(0)
      expect(Object.values(vue.metriques).every((valeur) => valeur === 0)).toBe(true)
    }
  })

  test('un ajout hors règle ne devient pas une contribution automatique', () => {
    const chargees = sources()
    const data = sourceE1()
    const from = debutBloc(textesE1.map((texte) => texte.length), 3)
    data.reperesPassages = [{ id: 'repere-1', from, to: from + textesE1[3].length }]
    chargees.set('e1', { ok: true, data })
    const cas = casPersonne()
    const avantRegles = structuredClone(cas.regles)
    const projection = projeterCas(corpus(), cas, chargees, 'original')
    expect(projection.vues.manuels.passages[0].texte).toBe('Paul répond.')
    expect(projection.vues.regles.passages.every((passage) => !passage.texte?.includes('Paul'))).toBe(true)
    expect(projection.metriques.motsSansDoubleCompte).toBe(
      projection.vues.regles.metriques.motsSansDoubleCompte + projection.vues.manuels.metriques.motsSansDoubleCompte,
    )
    expect(cas.regles).toEqual(avantRegles)
  })

  test('bascule localement entre texte pseudonymisé et original', () => {
    const pseudo = projeterCas(corpus(), casPersonne(), sources(), 'pseudonymise')
    const original = projeterCas(corpus(), casPersonne(), sources(), 'original')
    expect(JSON.stringify(pseudo)).not.toContain('Bonjour Alice à Lyon')
    expect(JSON.stringify(pseudo)).toContain('Bonjour Personne A à Ville B')
    expect(JSON.stringify(original)).toContain('Bonjour Alice à Lyon')
    expect(original.modeTexte).toBe('original')
    expect(original.metriques).toEqual(pseudo.metriques)
  })

  test('diagnostique une personne supprimée et les sources non résolues', () => {
    const sansPersonne = corpus()
    delete sansPersonne.personnes['personne-1']
    let projection = projeterCas(sansPersonne, casPersonne(), sources())
    expect(projection.diagnosticsRegles).toEqual([expect.objectContaining({
      type: 'personne-introuvable', personneId: 'personne-1', entretienId: null,
    })])

    const incompletes = sources()
    incompletes.delete('e2')
    projection = projeterCas(corpus(), casPersonne(), incompletes)
    expect(projection.diagnosticsRegles).toEqual([expect.objectContaining({
      type: 'source-indisponible', entretienId: 'e2',
    })])
    expect(projection.metriques.sourcesDistinctes).toBe(2)
    expect(projection.problemes).toBe(1)

    incompletes.set('e2', {
      ok: true,
      data: { ...sourceE2(), corpsTexte: { type: 'inconnu' } },
    })
    projection = projeterCas(corpus(), casPersonne(), incompletes)
    expect(projection.diagnosticsRegles[0]).toMatchObject({
      type: 'source-invalide', entretienId: 'e2',
    })
  })

  test('conserve deux repères distincts même lorsque leurs bornes sont identiques', () => {
    const data = sourceE1()
    const premierRepere = data.reperesPassages![0]
    data.reperesPassages!.push({ ...premierRepere, id: 'repere-2' })
    const cas = casPersonne()
    cas.regles = []
    cas.rattachements.push({
      id: 'rattachement-2',
      source: { entretienId: 'e1', repereId: 'repere-2' },
      provenance: 'manuel',
      creeLe: maintenant,
    })
    const projection = projeterCas(corpus(), cas, new Map([
      ['e1', { ok: true, data }],
      ['e2', { ok: true, data: sourceE2() }],
    ]))
    expect(projection.passages).toHaveLength(2)
    expect(projection.passages.map((passage) => passage.origine.type === 'manuel'
      ? passage.origine.rattachementId
      : '')).toEqual(['rattachement-1', 'rattachement-2'])
    expect(projection.metriques.chevauchements).toBe(1)
  })

  test('classe un rattachement orphelin, indisponible ou hors limites', () => {
    const cas = { ...casPersonne(), regles: [] }
    const orpheline = sourceE1()
    orpheline.reperesPassages = [{ id: 'repere-1', from: 8, to: 8 }]
    let projection = projeterCas(corpus(), cas, new Map([
      ['e1', { ok: true, data: orpheline }],
    ]))
    expect(projection.passages[0].etat).toBe('repere-orphelin')

    projection = projeterCas(corpus(), cas, new Map([
      ['e1', { ok: false, raison: 'réseau' }],
    ]))
    expect(projection.passages[0].etat).toBe('source-indisponible')

    const invalide = sourceE1()
    invalide.reperesPassages = [{ id: 'repere-1', from: 1, to: 10_000 }]
    projection = projeterCas(corpus(), cas, new Map([
      ['e1', { ok: true, data: invalide }],
    ]))
    expect(projection.passages[0].etat).toBe('source-invalide')
  })

  test('conserve les diagnostics propres aux rattachements manuels', () => {
    const cas = casPersonne()
    cas.regles = []
    cas.rattachements = [
      ...cas.rattachements,
      {
        id: 'absent',
        source: { entretienId: 'e1', repereId: 'repere-absent' },
        provenance: 'manuel',
        creeLe: maintenant,
      },
      {
        id: 'hors-corpus',
        source: { entretienId: 'entretien-retire', repereId: 'repere-x' },
        provenance: 'manuel',
        creeLe: maintenant,
      },
    ]
    const projection = projeterCas(corpus(), cas, sources())
    expect(projection.passages.map((passage) => passage.etat)).toEqual([
      'disponible',
      'repere-introuvable',
      'entretien-hors-corpus',
    ])
    expect(projection.problemes).toBe(2)
  })
})
