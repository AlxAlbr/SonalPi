import { describe, expect, expectTypeOf, test } from 'vitest'
import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier, type Note, type Variable } from "../src/shared/format"
import { validerCorpusNatif, validerEntretienNatif } from '../src/shared/natif/validation'
import { squeletteCorpus } from '../src/shared/corpus/squelette'
import type { Locuteur, ParticipationLocuteur, ReferenceParticipation } from '../src/shared/locuteurs'

function corpus(): CorpusFichier {
  return {
    formatVersion: FORMAT_VERSION, codebook: {}, variables: {}, reglesAnon: {}, membership: {},
    locuteurs: { commun: { id: 'commun', nom: 'Nom de référence' } },
  }
}
function entretien(): EntretienFichier {
  return {
    formatVersion: FORMAT_VERSION, lastModified: '', annotations: [], ancres: [],
    meta: { valeursGen: {}, audioRef: null },
    corpsTexte: { type: 'doc', content: [
      { type: 'paragraph', attrs: { loc: 7 }, content: [{ type: 'text', text: 'Paroles attribuées.' }] },
      { type: 'paragraph', attrs: { loc: null }, content: [{ type: 'text', text: 'Sans attribution.' }] },
    ] },
    participations: [{ id: 'local', index: 7, nom: 'Nom local', locuteurRef: 'commun',
      interviewer: true, pseudo: 'Pseudo local', couleur: '#123456', pseudoEtat: 'confirme', valeursLoc: { age: 'adulte' } }],
    notes: [{ id: 'note', categorieId: 'generale', titre: 'Note locale', date: null, statut: 'prive',
      corps: 'À conserver', participationIds: ['local'], rang: 0, creeLe: '', modifieLe: null }],
  }
}

function figer(v: unknown): void {
  if (!v || typeof v !== 'object') return
  Object.values(v).forEach(figer)
  Object.freeze(v)
}

describe('contrat du format natif des locuteurs', () => {
  test('distingue les identités, les participations, les notes et les portées', () => {
    expectTypeOf<CorpusFichier['locuteurs']>().toEqualTypeOf<Record<string, Locuteur>>()
    expectTypeOf<EntretienFichier['participations']>().toEqualTypeOf<ParticipationLocuteur[]>()
    expectTypeOf<Note['participationIds']>().toEqualTypeOf<string[] | undefined>()
    expectTypeOf<Variable['portee']>().toEqualTypeOf<'entretien' | 'participation'>()
    expectTypeOf<ReferenceParticipation>().toEqualTypeOf<{ entretienId: string; participationId: string }>()
  })

  test('valide les propriétaires et les références sans toucher aux données', () => {
    const c = corpus()
    const e = entretien()
    const avant = JSON.stringify([c, e])
    figer(c); figer(e)
    validerCorpusNatif(c)
    validerEntretienNatif(e)
    expect(JSON.stringify([c, e])).toBe(avant)
    expect(c.locuteurs.commun).toEqual({ id: 'commun', nom: 'Nom de référence' })
    expect(e.notes![0].participationIds).toEqual(['local'])
    expect((e.corpsTexte as { content: { attrs: { loc: number | null } }[] }).content.map((p) => p.attrs.loc)).toEqual([7, null])
  })

  test.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 11])('refuse le format natif %s sans le promouvoir ni le modifier', (formatVersion) => {
    const c = { ...corpus(), formatVersion }
    const e = { ...entretien(), formatVersion }
    const avant = JSON.stringify([c, e])
    expect(() => validerCorpusNatif(c)).toThrow('format natif 10 attendu')
    expect(() => validerEntretienNatif(e)).toThrow('format natif 10 attendu')
    expect(JSON.stringify([c, e])).toBe(avant)
  })

  test('changer uniquement le numéro d’un corpus de développement ne suffit pas', () => {
    const { locuteurs, ...commun } = squeletteCorpus()
    const ancien = { ...commun, formatVersion: FORMAT_VERSION, personnes: locuteurs }
    expect(() => validerCorpusNatif(ancien)).toThrow('Répertoire de locuteurs invalide')
  })

  test('ne transforme pas une source V1 en corpus natif', () => {
    expect(() => validerCorpusNatif({ tabEnt: [], tabThm: [], tabVar: [], tabDic: [] })).toThrow('Version')
  })

  test('garde les homonymes distincts et les participations historiques sans identité', () => {
    const c = corpus()
    c.locuteurs.autre = { id: 'autre', nom: c.locuteurs.commun.nom }
    const e = entretien()
    e.participations[0].locuteurRef = null
    e.participations[0].associationRetiree = true
    e.participations[0].rapprochementsRefuses = [
      { type: 'locuteur', locuteurId: 'commun' },
      { type: 'participation', entretienId: 'autre-entretien', participationId: 'local' },
    ]
    const avant = JSON.stringify([c, e])
    validerCorpusNatif(c); validerEntretienNatif(e)
    expect(JSON.stringify([c, e])).toBe(avant)
    expect(Object.keys(c.locuteurs)).toHaveLength(2)
    expect(e.participations[0].locuteurRef).toBeNull()
  })

  test('une référence absente reste visible et ne provoque aucune suppression', () => {
    const e = entretien()
    e.participations[0].locuteurRef = 'identite-absente'
    e.notes![0].participationIds = ['participation-absente']
    const avant = structuredClone(e)
    validerEntretienNatif(e)
    expect(e).toEqual(avant)
  })

  test('une entrée provisoire reste distincte et l’index zéro natif n’est pas la sentinelle V1', () => {
    const e = entretien()
    e.participations = [{ id: 'provisoire', index: 0, nom: '', locuteurRef: null, valeursLoc: {} }]
    validerEntretienNatif(e)
    expect(e.participations[0]).toEqual({ id: 'provisoire', index: 0, nom: '', locuteurRef: null, valeursLoc: {} })
  })

  test('les informations locales ne sont pas admises dans l’identité commune', () => {
    const c = corpus()
    Object.assign(c.locuteurs.commun, { interviewer: true })
    expect(() => validerCorpusNatif(c)).toThrow('Identité de locuteur invalide')
  })

  test('le lecteur ne complète pas un id local manquant', () => {
    const e = entretien()
    Reflect.deleteProperty(e.participations[0], 'id')
    const avant = structuredClone(e)
    expect(() => validerEntretienNatif(e)).toThrow('Participation de locuteur invalide')
    expect(e).toEqual(avant)
  })

  test('refuse un ancien lien de note ou un ancien refus plutôt que changer leur portée', () => {
    const e = entretien()
    Object.assign(e.notes![0], { locuteurIds: ['commun'] })
    expect(() => validerEntretienNatif(e)).toThrow('Note de participation invalide')
    Reflect.deleteProperty(e.notes![0], 'locuteurIds')
    Object.assign(e.participations[0], { rapprochementsRefuses: ['locuteur:local'] })
    expect(() => validerEntretienNatif(e)).toThrow('Refus de rapprochement invalide')
  })

  test('les refus locaux exigent aussi l’entretien de la participation', () => {
    const e = entretien()
    Object.assign(e.participations[0], { rapprochementsRefuses: [{ type: 'participation', participationId: 'local' }] })
    expect(() => validerEntretienNatif(e)).toThrow('Refus de rapprochement invalide')
  })

  test('valide les règles de cas, familles et recettes avec leurs propriétaires cibles', () => {
    const c = corpus()
    c.variables.age = { id: 'age', lib: 'Âge', portee: 'participation', ordre: 0, priv: false, vExport: 1, modalites: [] }
    c.cas = { cas: { id: 'cas', nom: 'Cas', memo: '', creeLe: '', modifieLe: '', rattachements: [], regles: [
      { type: 'locuteur', locuteurId: 'commun', inclureEnqueteurs: false },
      { type: 'locuteurs', membres: [{ locuteurId: 'commun', inclureEnqueteurs: true }] },
      { type: 'entretiens', entretienIds: ['e1'] },
      { type: 'modalite', variableId: 'lieu', modaliteId: 'ici', portee: 'entretien' },
      { type: 'modalite', variableId: 'age', modaliteId: 'adulte', portee: 'participation', inclureEnqueteurs: false },
    ], derivationsPropres: [{ attributId: 'a', variableSourceId: 'age', porteeSource: 'participation' }] } }
    c.famillesCas = { famille: { id: 'famille', nom: 'Famille', creeLe: '',
      origine: { variableId: 'age', portee: 'participation', inclureEnqueteurs: true },
      derivationsAttributs: [{ attributId: 'a', variableSourceId: 'age', porteeSource: 'participation' }],
    } }
    const avant = structuredClone(c)
    validerCorpusNatif(c)
    expect(c).toEqual(avant)
    Object.assign(c.variables.age, { portee: 'locuteur' })
    expect(() => validerCorpusNatif(c)).toThrow('Définition de variable invalide')
    c.variables.age.portee = 'participation'
    Object.assign(c.cas.cas.regles[0], { type: "locuteur", personneId: 'commun' })
    expect(() => validerCorpusNatif(c)).toThrow('Règle de cas invalide')
  })
})
