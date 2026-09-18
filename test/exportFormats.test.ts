// @vitest-environment happy-dom
import { describe, test, expect } from 'vitest'
import {
  genererTxt,
  genererSrt,
  genererVtt,
  genererHtml,
  genererDonneesDocx,
  nomFichierExport,
  sonalAnonymise,
  texteVariablesPubliques,
  type OptionsExport,
  type ContexteExport,
} from '../src/renderer/import/exportFormats'
import { exporterSonal, type EntreeExport } from '../src/renderer/import/exportSonal'
import { importerSonal } from '../src/renderer/import/importSonal'
import type { Note } from '../src/shared/format'

/** Texte brut d'une page exportée (scripts exclus) : le contenu est splitté en
 *  spans, les assertions de contenu passent donc par le texte, pas par la source. */
function texteDe(html: string): string {
  const brut = html.replace(/<script\b[\s\S]*?<\/script>/gi, '')
  return new DOMParser().parseFromString(brut, 'text/html').body.textContent ?? ''
}

const OPTIONS_TOUT: OptionsExport = {
  entete: true,
  notes: true,
  vars: true,
  time: true,
  loc: true,
  thm: true,
  anon: false,
}
const OPTIONS_RIEN: OptionsExport = {
  entete: false,
  notes: false,
  vars: false,
  time: false,
  loc: false,
  thm: false,
  anon: false,
}

const BLOC1 = 'Karine habite Lyon depuis 2020.' // 31 caractères
const BLOC2 = 'Où travaillez-vous ?' // 20 caractères

/** Contenu PM [1, 32) pour le bloc 1, [34, 54) pour le bloc 2 ; ancres aux quatre coins. */
function entreeTeste(): EntreeExport {
  return {
    corpsTexte: {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: BLOC1 }] },
        { type: 'paragraph', attrs: { loc: 2 }, content: [{ type: 'text', text: BLOC2 }] },
      ],
    },
    annotations: [
      // « Lyon » (offsets 14..18 du bloc 1 → PM 15..19)
      { id: 'a1', type: 'codage', from: 15, to: 19, auteur: 'moi', code: 'cat_001' },
      // « Karine » (offsets 0..6 du bloc 1 → PM 1..7) anonymisé avec le pseudo Marie
      {
        id: 'a2',
        type: 'anon',
        from: 1,
        to: 7,
        auteur: 'moi',
        etat: 'anonymise',
        pseudo: 'Marie',
      },
    ],
    ancres: [
      { pos: 1, t: 10.5 },
      { pos: 32, t: 20.25 },
      { pos: 34, t: 25 },
      { pos: 54, t: 30 },
    ],
    locuteurs: [
      {
        index: 1,
        nom: 'Karine',
        interviewer: false,
        pseudo: 'Claire',
        pseudoEtat: 'confirme',
        valeursLoc: { v2: 'v2m1' },
        personneRef: null,
      },
      { index: 2, nom: 'Marc', interviewer: true, valeursLoc: { v2: 'v2m2' }, personneRef: null },
    ],
    codebook: [
      {
        id: 'c1',
        nom: 'Lieu//ville citée',
        couleur: '#ff0000',
        ordre: 0,
        parent: null,
        actif: true,
        codeExport: 'cat_001',
      },
    ],
    variables: [
      {
        id: 'v1',
        lib: 'Lieu',
        portee: 'entretien',
        priv: false,
        ordre: 0,
        vExport: 1,
        modalites: [{ id: 'v1m1', lib: 'Lyon', mExport: 1 }],
      },
      {
        id: 'v2',
        lib: 'sexe',
        portee: 'locuteur',
        priv: false,
        ordre: 1,
        vExport: 2,
        modalites: [
          { id: 'v2m1', lib: 'F', mExport: 1 },
          { id: 'v2m2', lib: 'H', mExport: 2 },
        ],
      },
      {
        id: 'v3',
        lib: 'Confidentiel',
        portee: 'entretien',
        priv: true,
        ordre: 2,
        vExport: 3,
        modalites: [{ id: 'v3m1', lib: 'secret', mExport: 1 }],
      },
    ],
    meta: { valeursGen: { v1: 'v1m1' } },
    legacy: { tabAnon: null, notes: '' },
    brouillonsAnon: [],
  }
}

const NOTES: Note[] = [
  {
    id: 'n1',
    categorieId: 'ncat_public',
    titre: 'À revoir',
    date: '2024-05-12',
    statut: 'public',
    corps: 'Revenir sur le lieu de travail.',
    rang: 1,
    creeLe: '2024-05-12T10:00:00Z',
    modifieLe: null,
  },
  {
    id: 'n2',
    categorieId: 'ncat_prive',
    titre: 'Note privée',
    date: null,
    statut: 'prive',
    corps: 'Ne doit pas sortir.',
    rang: 2,
    creeLe: '2024-05-12T10:00:00Z',
    modifieLe: null,
  },
]

function contexte(entree: EntreeExport = entreeTeste()): ContexteExport {
  return {
    entree,
    titre: 'Entretien Test',
    notes: NOTES,
    categoriesNote: [{ id: 'ncat_public', nom: 'Analyse', couleur: '#ccc' }],
    audioRef: null,
  }
}

describe('nomFichierExport', () => {
  test('nettoie les caractères interdits et pose le suffixe anonymisé', () => {
    expect(nomFichierExport('Entretien: A/B', 'txt', false)).toBe('Entretien- A-B.txt')
    expect(nomFichierExport('Entretien', 'sonal', true)).toBe('Entretien_anonymise.sonal')
    expect(nomFichierExport('   ', 'txt', false)).toBe('entretien.txt')
  })
})

describe('TXT', () => {
  test('avec toutes les options : en-tête, notes publiques, variables, corps horodaté et codé', () => {
    const out = genererTxt(contexte(), OPTIONS_TOUT)
    expect(out).toContain('Exporté par Sonal π 2 le ')
    expect(out).toContain('Entretien : Entretien Test')
    expect(out).toContain("Notes de l'entretien :")
    expect(out).toContain('[Analyse]')
    expect(out).toContain('- À revoir — Revenir sur le lieu de travail.')
    expect(out).not.toContain('Ne doit pas sortir.')
    expect(out).toContain('Variables associées :')
    expect(out).toContain('Lieu : Lyon')
    expect(out).toContain('sexe : Karine : F, Marc : H')
    expect(out).not.toContain('Confidentiel')
    // Corps : horodatage + libellé sur la 1re ligne du tour, [Lieu] au codage.
    expect(out).toContain('00:00:10 Karine')
    expect(out).toContain('[Lieu] Lyon')
    expect(out).toContain('00:00:25 Marc')
    expect(out).toContain('Où travaillez-vous ?')
  })
  test('anonymisé : texte et locuteurs pseudonymisés', () => {
    const out = genererTxt(contexte(), { ...OPTIONS_TOUT, anon: true })
    expect(out).toContain('00:00:10 [Claire]')
    expect(out).toContain('[Marie]')
    expect(out).toContain('[Lieu] Lyon')
    expect(out).not.toContain('Karine habite')
  })
  test('sans options : texte brut seul', () => {
    const out = genererTxt(contexte(), OPTIONS_RIEN)
    expect(out).not.toContain('Exporté par Sonal π 2')
    expect(out).not.toContain("Notes de l'entretien")
    expect(out).not.toContain('Variables associées')
    expect(out).not.toContain('00:00:10')
    expect(out).toContain('Karine habite Lyon depuis 2020.')
    expect(out).toContain('Où travaillez-vous ?')
  })
})

describe('SRT', () => {
  test('cues bornés par les ancres, horodatage virgule, locuteur en préfixe', () => {
    const out = genererSrt(contexte(), OPTIONS_TOUT)
    expect(out).toContain('1\n00:00:10,500 --> 00:00:20,250\nKarine: Karine habite Lyon depuis 2020.')
    expect(out).toContain('2\n00:00:25,000 --> 00:00:30,000\nMarc: Où travaillez-vous ?')

  })
  test('sans audio : aucun cue', () => {
    const e = entreeTeste()
    const sansCoords = { ...e, ancres: [] }
    expect(genererSrt(contexte(sansCoords), OPTIONS_TOUT)).toBe('')
  })
})

describe('VTT', () => {
  test('WEBVTT, NOTE des notes publiques, balises v et c', () => {
    const out = genererVtt(contexte(), OPTIONS_TOUT)
    expect(out.startsWith('WEBVTT\n\n')).toBe(true)
    expect(out).toContain('NOTE\n')
    expect(out).toContain('00:00:10.500 --> 00:00:20.250')
    expect(out).toContain('<c.cat_001>Lyon</c>')
    expect(out).toContain('<v Karine>')
  })
  test('sans options : cues simples, sans balises ni NOTE', () => {
    const out = genererVtt(contexte(), OPTIONS_RIEN)
    expect(out).not.toContain('<c.')
    expect(out).not.toContain('<v ')
    expect(out).not.toContain('NOTE')
    expect(out).toContain('Karine habite Lyon depuis 2020.')

  })
})

describe('DOCX (données transmises au main)', () => {
  test('sections séparées, corps avec marqueur {g} sur les lignes interviewer', () => {
    const d = genererDonneesDocx(contexte(), OPTIONS_TOUT)
    expect(d.titre).toBe('Entretien Test')
    expect(d.entete).toBe(true)
    expect(d.notes).toContain('[Analyse]')
    expect(d.notes).not.toContain('Ne doit pas sortir.')
    expect(d.variables).toContain('sexe : Karine : F, Marc : H')
    expect(d.contenuTxt).toContain('00:00:10 Karine')
    expect(d.contenuTxt).toContain('[Lieu] Lyon')
    expect(d.contenuTxt).toContain('00:00:25 {g}Marc')
    expect(d.contenuTxt).toContain('Où travaillez-vous ?')
  })
})

describe('HTML', () => {
  test('page autonome : player (audio local), sections, légende, CSS thèmes', () => {
    const ctx = contexte()
    ctx.audioRef = 'C:\\corpus\\entretien.wav'
    const out = genererHtml(ctx, OPTIONS_TOUT)
    expect(out.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(out).toContain('<audio id="audio-export"')
    expect(out).toContain('file:///C:/corpus/entretien')
    expect(out).toContain('section-notes')
    expect(out).toContain('section-vars')
    expect(out).toContain('section-legend')
    expect(out).toContain('.cat_001 {')
    expect(out).toContain('btn-play-seg')
    expect(out).not.toContain('Ne doit pas sortir.')
  })
  test('sans audio référencé : pas de player (corpus distant)', () => {
    const ctx = contexte()
    ctx.audioRef = null
    const out = genererHtml(ctx, OPTIONS_TOUT)
    expect(out).not.toContain('audio-export')
    expect(out).not.toContain('<button')
  })
  test('thm et time décochés : ni classes cat_, ni coordonnées, ni CSS de codage', () => {
    const ctx = contexte()
    ctx.audioRef = null
    const out = genererHtml(ctx, { ...OPTIONS_TOUT, thm: false, time: false })
    expect(out).not.toContain('cat_001')
    expect(out).not.toContain('data-deb=')
    expect(texteDe(out)).toContain('Karine habite Lyon depuis 2020.')
  })
  test('anonymisé : aucun nom réel dans le texte ni dans les data-* du source', () => {
    const ctx = contexte()
    ctx.audioRef = null
    const out = genererHtml(ctx, { ...OPTIONS_TOUT, anon: true })
    expect(texteDe(out)).toContain('[Marie] habite Lyon depuis 2020.')
    expect(out).toContain('[Claire]')
    expect(out).not.toContain('Karine')
    expect(out).not.toContain('data-nomloc')
  })
})

describe('variables publiques', () => {
  test('variables privées exclues, valeurs absentes en ---', () => {
    const e = entreeTeste()
    const noms = new Map([
      [1, 'Karine'],
      [2, 'Marc'],
    ])
    const out = texteVariablesPubliques(e.variables, {}, e.locuteurs, noms)
    expect(out).toContain('Lieu : ---')
    expect(out).toContain('sexe : Karine : F, Marc : H')
    expect(out).not.toContain('Confidentiel')
  })
})

describe('sonalAnonymise', () => {
  test('spans anon → [pseudo], anon-json vidé, fichier re-parsable', () => {
    const sonal = exporterSonal(entreeTeste())
    const out = sonalAnonymise(sonal)
    expect(texteDe(out)).toContain('[Marie] habite Lyon depuis 2020.')
    expect(out).not.toContain('>Karine habite')
    // Voie `.sonal` : les libellés restent parsables par SonalPi1 (pseudo conservé,
    // vrai nom posé sur data-nomloc comme la V1).
    expect(out).toContain('data-locpseudo="Claire"')
    expect(out).toContain('data-nomloc="Karine"')
    expect(out).toContain('{\n[]\n}')
    const doc = new DOMParser().parseFromString(out, 'text/html')
    const r = importerSonal(doc)
    expect(r.payload.locuteurs.map((l) => l.nom)).toContain('Karine')
  })
})
