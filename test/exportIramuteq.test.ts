import { describe, test, expect } from 'vitest'
import {
  genererCorpusIramuteq,
  modaliteIramuteq,
  nomVariableIramuteq,
  OPTIONS_IRAMUTEQ_DEFAUT,
  type OptionsIramuteq,
} from '../src/shared/export/iramuteq'
import type { EntreeExport } from '../src/shared/export/types'
import { encoderWindows1252 } from '../src/shared/export/encodageWindows1252'

const QUESTION = 'Où habitez-vous ?'
const REPONSE = 'Karine habite Lyon* depuis 2020.'
const SUITE = 'Et elle aime ça.'

/** Trois paragraphes : question de l'interviewer, puis deux paragraphes de réponse.
 *  Positions : bloc 1 [1, 18), bloc 2 [20, 52), bloc 3 [54, 70). */
function entree(): EntreeExport {
  return {
    corpsTexte: {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { loc: 2 }, content: [{ type: 'text', text: QUESTION }] },
        { type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: REPONSE }] },
        { type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: SUITE }] },
      ],
    },
    annotations: [
      // « Lyon » (offsets 14..18 du bloc 2).
      { id: 'a1', type: 'codage', from: 34, to: 38, auteur: 'moi', code: 'cat_002' },
      { id: 'a2', type: 'codage', from: 34, to: 38, auteur: 'moi', code: 'cat_001' },
      // « Karine » anonymisée en Marie.
      { id: 'a3', type: 'anon', from: 20, to: 26, auteur: 'moi', etat: 'anonymise', pseudo: 'Marie' },
    ],
    ancres: [],
    participations: [
      { id: 'local-karine', index: 1, nom: 'Karine', pseudo: 'Claire', pseudoEtat: 'confirme', valeursLoc: { sexe: 'f' }, locuteurRef: null },
      { id: 'local-marc', index: 2, nom: 'Marc', interviewer: true, valeursLoc: { sexe: 'h' }, locuteurRef: null },
    ],
    codebook: [
      { id: 'c1', nom: 'Lieu de vie', ordre: 0, parent: null, actif: true, codeExport: 'cat_001' },
      { id: 'c2', nom: 'Ville', ordre: 1, parent: null, actif: true, codeExport: 'cat_002' },
    ],
    variables: [
      {
        id: 'region',
        lib: 'Région d’origine',
        portee: 'entretien',
        priv: false,
        ordre: 0,
        vExport: 1,
        modalites: [{ id: 'ra', lib: 'Rhône-Alpes', mExport: 1 }],
      },
      {
        id: 'sexe',
        lib: 'Sexe',
        portee: 'participation',
        priv: false,
        ordre: 1,
        vExport: 2,
        modalites: [
          { id: 'f', lib: 'Femme', mExport: 1 },
          { id: 'h', lib: 'Homme', mExport: 2 },
        ],
      },
      {
        id: 'secret',
        lib: 'Secret',
        portee: 'entretien',
        priv: true,
        ordre: 2,
        vExport: 3,
        modalites: [{ id: 's', lib: 'oui', mExport: 1 }],
      },
    ],
    meta: { valeursGen: { region: 'ra', secret: 's' } },
    legacy: { tabAnon: null, notes: '' },
  }
}

function generer(options: Partial<OptionsIramuteq> = {}, titre = 'Entretien n°1 : Karine') {
  return genererCorpusIramuteq([{ titre, entree: entree() }], { ...OPTIONS_IRAMUTEQ_DEFAUT, ...options })
}

describe('noms IRaMuTeQ', () => {
  test('une variable ne garde que lettres et chiffres', () => {
    expect(nomVariableIramuteq('Région d’origine')).toBe('regiondorigine')
  })
  test('une modalité remplace les caractères spéciaux par des tirets bas', () => {
    expect(modaliteIramuteq('Rhône-Alpes')).toBe('rhone_alpes')
    expect(modaliteIramuteq('  Cœur  (18 ans) ')).toBe('coeur_18_ans')
  })
  test('les symboles porteurs de sens deviennent des mots', () => {
    expect(modaliteIramuteq('+ de 20 ans')).toBe('plus_de_20_ans')
    expect(modaliteIramuteq('- de 5 ans')).toBe('moins_de_5_ans')
    expect(modaliteIramuteq('20-24 ans')).toBe('20_24_ans')
    expect(modaliteIramuteq('< 10 %')).toBe('moins_10_pourcent')
  })
})

describe('encoderWindows1252', () => {
  test('accents, œ, guillemets et apostrophes typographiques', () => {
    expect([...encoderWindows1252('é à « œ ’ …')]).toEqual([
      0xe9, 0x20, 0xe0, 0x20, 0xab, 0x20, 0x9c, 0x20, 0x92, 0x20, 0x85,
    ])
  })
  test('un caractère absent perd son accent ou devient une espace', () => {
    expect([...encoderWindows1252('ő😀')]).toEqual([0x6f, 0x20])
  })
})

describe('genererCorpusIramuteq', () => {
  test('un texte par entretien, interviewer retiré, variables publiques', () => {
    const r = generer()
    expect(r.textes).toBe(1)
    expect(r.contenu).toBe(
      '**** *ent_entretien_n_1_karine *regiondorigine_rhone_alpes *sexe_femme\n' +
        '[Marie] habite Lyon depuis 2020.\n' +
        'Et elle aime ça.\n',
    )
  })

  test('sans pseudonymisation, le texte reste en clair', () => {
    expect(generer({ anon: false }).contenu).toContain('Karine habite Lyon depuis 2020.')
  })

  test('avec les interviewers, une variable de locuteur divergente est omise', () => {
    const r = generer({ exclureInterviewers: false })
    expect(r.contenu.split('\n')[0]).toBe('**** *ent_entretien_n_1_karine *regiondorigine_rhone_alpes')
    expect(r.contenu).toContain(QUESTION)
  })

  test('un texte par tour de parole porte le locuteur et ses variables', () => {
    const r = generer({ unite: 'tour', exclureInterviewers: false })
    expect(r.textes).toBe(2)
    const etoilees = r.contenu.split('\n').filter((l) => l.startsWith('****'))
    expect(etoilees).toEqual([
      '**** *ent_entretien_n_1_karine *loc_l2 *regiondorigine_rhone_alpes *sexe_homme',
      '**** *ent_entretien_n_1_karine *loc_claire *regiondorigine_rhone_alpes *sexe_femme',
    ])
  })

  test('sans pseudonymisation, le locuteur garde son nom', () => {
    const r = generer({ unite: 'tour', anon: false })
    expect(r.contenu).toContain('*loc_karine')
  })

  test('deux participations de la même identité gardent leurs noms, pseudonymes et valeurs propres', () => {
    const a = entree(), b = entree()
    a.participations[0].locuteurRef = 'identite-commune'
    b.participations[0] = { ...b.participations[0], locuteurRef: 'identite-commune', nom: 'Mme Dupont', pseudo: 'Nadia', valeursLoc: { sexe: 'h' } }
    const options = { ...OPTIONS_IRAMUTEQ_DEFAUT, unite: 'tour' as const }
    const genererLot = (anon: boolean) => genererCorpusIramuteq([{ titre: 'A', entree: a }, { titre: 'B', entree: b }], { ...options, anon })
      .contenu.split('\n').filter((ligne) => ligne.startsWith('****'))
    expect(genererLot(true)).toEqual([
      '**** *ent_a *loc_claire *regiondorigine_rhone_alpes *sexe_femme',
      '**** *ent_b *loc_nadia *regiondorigine_rhone_alpes *sexe_homme',
    ])
    expect(genererLot(false)).toEqual([
      '**** *ent_a *loc_karine *regiondorigine_rhone_alpes *sexe_femme',
      '**** *ent_b *loc_mme_dupont *regiondorigine_rhone_alpes *sexe_homme',
    ])
  })

  test('les thématiques découpent le texte, premier thème de la grille', () => {
    const r = generer({ thematiques: true, variables: [] })
    expect(r.contenu).toBe(
      '**** *ent_entretien_n_1_karine\n' +
        '-*hors_theme\n' +
        '[Marie] habite\n' +
        '-*lieu_de_vie\n' +
        'Lyon\n' +
        '-*hors_theme\n' +
        'depuis 2020.\n' +
        'Et elle aime ça.\n',
    )
  })

  test('un entretien sans discours retenu est signalé', () => {
    const e = entree()
    e.corpsTexte = {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { loc: 2 }, content: [{ type: 'text', text: QUESTION }] }],
    }
    const r = genererCorpusIramuteq(
      [
        { titre: 'Vide', entree: e },
        { titre: 'Plein', entree: entree() },
      ],
      OPTIONS_IRAMUTEQ_DEFAUT,
    )
    expect(r.textes).toBe(1)
    expect(r.vides).toEqual(['Vide'])
  })

  test('par passage, chaque passage porte tous ses thèmes et le texte non codé est gardé', () => {
    const r = generer({ unite: 'passage', variables: [] })
    expect(r.contenu).toBe(
      '**** *ent_entretien_n_1_karine *loc_claire *thaucun_oui *thlieudevie_non *thville_non\n' +
        '[Marie] habite\n' +
        '\n' +
        '**** *ent_entretien_n_1_karine *loc_claire *thaucun_non *thlieudevie_oui *thville_oui\n' +
        'Lyon\n' +
        '\n' +
        '**** *ent_entretien_n_1_karine *loc_claire *thaucun_oui *thlieudevie_non *thville_non\n' +
        'depuis 2020.\n' +
        'Et elle aime ça.\n',
    )
  })

  test('par passage, des codages qui se chevauchent sont recoupés', () => {
    const e = entree()
    // « Lieu de vie » couvre « habite Lyon », « Ville » seulement « Lyon ».
    e.annotations = e.annotations.map((a) => (a.id === 'a2' ? { ...a, from: 27 } : a))
    const r = genererCorpusIramuteq([{ titre: 'E1', entree: e }], {
      ...OPTIONS_IRAMUTEQ_DEFAUT,
      unite: 'passage',
      variables: [],
      themesAbsents: false,
    })
    expect(r.contenu.split('\n').filter((l) => l !== '')).toEqual([
      '**** *ent_e1 *loc_claire *thaucun_oui',
      '[Marie]',
      '**** *ent_e1 *loc_claire *thlieudevie_oui',
      'habite',
      '**** *ent_e1 *loc_claire *thlieudevie_oui *thville_oui',
      'Lyon',
      '**** *ent_e1 *loc_claire *thaucun_oui',
      'depuis 2020.',
      'Et elle aime ça.',
    ])
  })

  test('seuls les variables et thèmes choisis sont repris', () => {
    const r = generer({ unite: 'passage', variables: ['sexe'], themes: ['c2'], themesAbsents: false })
    expect(r.contenu.split('\n').filter((l) => l.startsWith('****'))).toEqual([
      '**** *ent_entretien_n_1_karine *loc_claire *thaucun_oui *sexe_femme',
      '**** *ent_entretien_n_1_karine *loc_claire *thville_oui *sexe_femme',
      '**** *ent_entretien_n_1_karine *loc_claire *thaucun_oui *sexe_femme',
    ])
  })

  test('un passage codé seulement par un thème écarté compte comme non codé', () => {
    const r = generer({ thematiques: true, variables: [], themes: [] })
    expect(r.contenu).toBe(
      '**** *ent_entretien_n_1_karine\n' +
        '-*hors_theme\n' +
        '[Marie] habite Lyon depuis 2020.\n' +
        'Et elle aime ça.\n',
    )
  })

  test('les variables privées ne sortent que si elles sont autorisées', () => {
    expect(generer({ variables: ['secret'] }).contenu.split('\n')[0]).toBe('**** *ent_entretien_n_1_karine')
    expect(generer({ variablesPrivees: true }).contenu.split('\n')[0]).toBe(
      '**** *ent_entretien_n_1_karine *regiondorigine_rhone_alpes *sexe_femme *secret_oui',
    )
  })

  test('un sous-thème peut compter aussi pour son thème parent', () => {
    const e = entree()
    // « Ville » devient un sous-thème de « Lieu de vie », seul à coder « Lyon ».
    e.codebook = e.codebook.map((c) => (c.id === 'c2' ? { ...c, parent: 'c1' } : c))
    e.annotations = e.annotations.filter((a) => a.id !== 'a2')
    const options = { ...OPTIONS_IRAMUTEQ_DEFAUT, unite: 'passage' as const, variables: [], themesAbsents: false }
    const etoilees = (heriterParents: boolean) =>
      genererCorpusIramuteq([{ titre: 'E1', entree: e }], { ...options, heriterParents })
        .contenu.split('\n')
        .filter((l) => l.startsWith('****'))
    expect(etoilees(false)[1]).toBe('**** *ent_e1 *loc_claire *thville_oui')
    expect(etoilees(true)[1]).toBe('**** *ent_e1 *loc_claire *thlieudevie_oui *thville_oui')
    // Un sous-thème décoché est ignoré : il ne compte pas pour son parent.
    const parentSeul = genererCorpusIramuteq([{ titre: 'E1', entree: e }], { ...options, heriterParents: true, themes: ['c1'] })
    expect(parentSeul.contenu).not.toContain('thlieudevie_oui')
    expect(parentSeul.contenu).toContain('**** *ent_e1 *loc_claire *thaucun_oui\n[Marie] habite Lyon depuis 2020.')
  })

  test('deux titres identiques une fois nettoyés restent distincts', () => {
    const r = genererCorpusIramuteq(
      [
        { titre: 'Entretien 1', entree: entree() },
        { titre: 'entretien-1', entree: entree() },
      ],
      { ...OPTIONS_IRAMUTEQ_DEFAUT, variables: [] },
    )
    expect(r.contenu.split('\n').filter((l) => l.startsWith('****'))).toEqual([
      '**** *ent_entretien_1',
      '**** *ent_entretien_1_2',
    ])
  })
})
