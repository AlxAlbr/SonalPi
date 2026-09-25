// @vitest-environment happy-dom
import { describe, test, expect } from 'vitest'
import {
  genererTxt,
  genererSrt,
  genererVtt,
  genererHtml,
  genererDonneesDocx,
  texteVariablesPubliques,
  type OptionsExport,
  type ContexteExport,
} from '../src/shared/export/formatsTexte'
import {
  nomFichierExport,
  CONFIG_OPTIONS,
} from '../src/shared/export/types'
import { idCssCode } from '../src/shared/export/secuCss'
import { texteDocument } from '../src/shared/export/documentExport'
import { exporterSonal, sonalPseudonymise } from '../src/renderer/formatSonal/exportSonal'
import type { EntreeExport } from '../src/shared/export/types'
import { importerSonal } from '../src/renderer/formatSonal/importSonal'
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
    audioUrl: null,
  }
}

describe('nomFichierExport', () => {
  test('nettoie les caractères interdits et pose le suffixe anonymisé', () => {
    expect(nomFichierExport('Entretien: A/B', 'txt', false)).toBe('Entretien- A-B.txt')
    expect(nomFichierExport('Entretien', 'sonal', true)).toBe('Entretien_pseudonymise.sonal')
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

describe('mise en page par bloc (retours à la ligne de l éditeur)', () => {
  /** Deux tours : « Question initiale ? » (Enquêteur), puis « Réponse une. »
   *  + « Réponse deux. » (Karine) séparés par une ANCRE INTERNE (pos 35 →
   *  offset plat 13) : deux cues dans le même bloc. */
  function entreeAvecCues(): EntreeExport {
    return entreeTeste()
  }

  /** Un bloc « Avant. » + hardBreak + « Après. » (PM 1..7, 7..8, 8..14). */
  function entreeAvecSaut(): EntreeExport {
    const base = entreeTeste()
    return {
      ...base,
      corpsTexte: {
        type: 'doc',
        content: [{ type: 'paragraph', attrs: { loc: 1 }, content: [
          { type: 'text', text: 'Avant.' },
          { type: 'hardBreak' },
          { type: 'text', text: 'Après.' },
        ] }],
      },
      annotations: [],
      ancres: [{ pos: 1, t: 1 }, { pos: 14, t: 3 }],
      locuteurs: [{ index: 1, nom: 'Karine', interviewer: false, valeursLoc: {}, personneRef: null }],
    }
  }

  test('TXT : cue interne = aucun retour, tour = ligne vide, saut = retour', () => {
    const out = genererTxt(contexte(entreeAvecCues()), OPTIONS_TOUT)
    // cue interne (2e ancre du bloc 2) : aucun retour entre « Réponse une. »
    // et « Réponse deux. » ; ligne vide entre les tours ; horodatage/libellé
    // uniquement aux débuts de tour.
    expect(out).toContain('00:00:10 Karine \nKarine habite  [Lieu] Lyon [–]  depuis 2020.')
    expect(out).toContain('\n\n00:00:25 Marc \nOù travaillez-vous ?')
  })

  test('TXT : un saut de ligne du modèle se retrouve dans l export', () => {
    const out = genererTxt(contexte(entreeAvecSaut()), OPTIONS_TOUT)
    expect(out).toContain('00:00:01 Karine \nAvant.\nAprès.')
  })

  test('SRT : le saut du modèle rend un espace, pas un retour', () => {
    const out = genererSrt(contexte(entreeAvecSaut()), OPTIONS_TOUT)
    expect(out).toContain('Avant. Après.')
  })

  test('HTML : le saut se rend en <br>', () => {
    const out = genererHtml(contexte(entreeAvecSaut()), OPTIONS_TOUT)
    expect(out).toContain('Avant.<br>Après.')
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
    // Le code (importé, jamais de confiance) devient une classe SÛRE dérivée.
    expect(out).toContain(`<c.${idCssCode('cat_001')}>Lyon</c>`)
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
  test('sections séparées, corps structuré, interviewer en run gras', () => {
    const d = genererDonneesDocx(contexte(), OPTIONS_TOUT)
    expect(d.titre).toBe('Entretien Test')
    expect(d.entete).toBe(true)
    const texte = texteDocument(d.document)
    expect(texte).toContain('[Analyse]')
    expect(texte).not.toContain('Ne doit pas sortir.')
    expect(texte).toContain('sexe : Karine : F, Marc : H')
    expect(texte).toContain('00:00:10 Karine')
    expect(texte).toContain('[Lieu] Lyon')
    expect(texte).toContain('00:00:25 Marc')
    expect(texte).toContain('Où travaillez-vous ?')
    // Gras interviewer = run structuré, plus aucun marqueur {g} ni **…**.
    expect(texte).not.toContain('{g}')
    const marc = d.document.blocs.find(
      (b) =>
        b.type === 'paragraphe' &&
        (b.runs ?? []).some((r) => r.texte === 'Marc ' && r.gras === true),
    )
    expect(marc).toBeDefined()
  })
})

describe('HTML', () => {
  test('page autonome : player (URL audio résolue), sections, légende, CSS thèmes', () => {
    const ctx = contexte()
    ctx.audioUrl = 'file:///C:/corpus/entretien.wav'
    const out = genererHtml(ctx, OPTIONS_TOUT)
    expect(out.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(out).toContain('<audio id="audio-export"')
    expect(out).toContain('file:///C:/corpus/entretien.wav')
    expect(out).toContain('section-notes')
    expect(out).toContain('section-vars')
    expect(out).toContain('section-legend')
    expect(out).toContain('scat-')
    expect(out).toContain('btn-play-seg')
    expect(out).not.toContain('Ne doit pas sortir.')
  })
  test('sans audio référencé : pas de player (corpus distant)', () => {
    const ctx = contexte()
    ctx.audioUrl = null
    const out = genererHtml(ctx, OPTIONS_TOUT)
    expect(out).not.toContain('audio-export')
    expect(out).not.toContain('<button')
  })
  test('thm et time décochés : ni classes cat_, ni coordonnées, ni CSS de codage', () => {
    const ctx = contexte()
    ctx.audioUrl = null
    const out = genererHtml(ctx, { ...OPTIONS_TOUT, thm: false, time: false })
    expect(out).not.toContain('cat_001')
    expect(out).not.toContain('data-deb=')
    expect(texteDe(out)).toContain('Karine habite Lyon depuis 2020.')
  })
  test('anonymisé : aucun nom réel dans le texte ni dans les data-* du source', () => {
    const ctx = contexte()
    ctx.audioUrl = null
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

describe('sonalPseudonymise', () => {
  test('spans anon → [pseudo], anon-json vidé, fichier re-parsable', () => {
    const out = sonalPseudonymise(entreeTeste())
    expect(texteDe(out)).toContain('[Marie] habite Lyon depuis 2020.')
    expect(out).not.toContain('>Karine habite')
    // Le pseudo configuré remplace Karine ; Marc, sans pseudo, reste en clair.
    expect(out).toContain('data-locpseudo="Claire"')
    expect(out).not.toContain('data-nomloc="Karine"')
    expect(out).not.toContain('"Karine?"')
    expect(out).toContain('Marc?')
    expect(out).toContain('<script id="anon-json" type="application/json">')
    // anon-json vidé (l'export sérialise le tableau vide de serializeSonal).
    expect(out).toMatch(/id="anon-json"[^>]*>\s*\{\s*\[\]\s*\}\s*<\/script>/)
    const doc = new DOMParser().parseFromString(out, 'text/html')
    const r = importerSonal(doc)
    // Le réimport voit les pseudos à la place des vrais noms.
    expect(r.payload.locuteurs.map((l) => l.nom)).toContain('Claire')
    expect(r.payload.locuteurs.map((l) => l.nom)).not.toContain('Karine')
    expect(r.payload.locuteurs.map((l) => l.nom)).toContain('Marc')
  })
})

// ----------------------------------------------------------------
// Phase C — fidélité des formats
// ----------------------------------------------------------------

const TEXTE_HOSTILE = 'Texte avec --> et <b>balise</b> {g} et **gras**.'

/** Un fragment portant des chaînes ressemblant à des marqueurs/balises, des
 *  ancres aux bornes arrondies, sans aucune annotation. */
function entreeHostile(): EntreeExport {
  const base = entreeTeste()
  return {
    ...base,
    corpsTexte: {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: TEXTE_HOSTILE }] },
      ],
    },
    annotations: [],
    ancres: [{ pos: 1, t: 59.9999 }, { pos: 1 + TEXTE_HOSTILE.length, t: 61 }],
    locuteurs: [{ index: 1, nom: 'Karine', interviewer: false, valeursLoc: {}, personneRef: null }],
  }
}

describe('marqueurs textuels préservés littéralement', () => {
  test('TXT : `{g}` et `**gras**` restent exactement tels que saisis', () => {
    const out = genererTxt(contexte(entreeHostile()), OPTIONS_TOUT)
    expect(out).toContain(TEXTE_HOSTILE)
  })

  test('DOCX : le document transmis ne décode jamais `{g}` ni `**…**`', () => {
    const d = genererDonneesDocx(contexte(entreeHostile()), OPTIONS_TOUT)
    const texte = texteDocument(d.document)
    expect(texte).toContain(TEXTE_HOSTILE)
    expect(texte).not.toContain('[**gras**') // aucune interprétation
  })
})

describe('temps des cues (SRT/VTT)', () => {
  test('arrondi AVANT décomposition : 59.9999 s → 00:01:00, jamais 00:00:60', () => {
    const srt = genererSrt(contexte(entreeHostile()), OPTIONS_TOUT)
    expect(srt).toContain('00:01:00,000 --> 00:01:01,000')
    const vtt = genererVtt(contexte(entreeHostile()), OPTIONS_TOUT)
    expect(vtt).toContain('00:01:00.000 --> 00:01:01.000')
    expect(vtt).not.toContain('00:00:60')
  })

  test('cues inversés, négatifs ou non finis : le cue fautif n est pas émis', () => {
    const base = entreeTeste()
    const inverse = contexte({ ...base, ancres: [{ pos: 1, t: 30 }, { pos: 32, t: 10 }, { pos: 34, t: 20 }, { pos: 54, t: 25 }] })
    expect(genererSrt(inverse, OPTIONS_TOUT)).not.toContain('00:00:30')
    expect(genererSrt(inverse, OPTIONS_TOUT)).toContain('00:00:20,000 --> 00:00:25,000')
    expect(genererVtt(inverse, OPTIONS_TOUT)).not.toContain('00:00:30')
    const nonFini = contexte({ ...base, ancres: [{ pos: 1, t: Number.NaN }, { pos: 32, t: 20 }, { pos: 34, t: 25 }, { pos: 54, t: 30 }] })
    const srt = genererSrt(nonFini, OPTIONS_TOUT)
    expect(srt).not.toContain('NaN')
    expect(srt).not.toContain('00:00:20,000 --> 00:00:25,000')
    expect(srt).toContain('00:00:25,000 --> 00:00:30,000')
    const negatif = contexte({ ...base, ancres: [{ pos: 1, t: -3 }, { pos: 32, t: 20 }, { pos: 34, t: 25 }, { pos: 54, t: 30 }] })
    expect(genererSrt(negatif, OPTIONS_TOUT)).toContain('00:00:00,000 --> 00:00:20,000')
  })
})

describe('échappement WebVTT', () => {
  test('balises et séparateurs de cue neutralisés dans le texte et le nom', () => {
    const base = entreeHostile()
    base.locuteurs = [{ index: 1, nom: 'Karine<1>', interviewer: false, valeursLoc: {}, personneRef: null }]
    const out = genererVtt(contexte(base), { ...OPTIONS_TOUT, loc: true })
    expect(out).toContain('&lt;b&gt;balise&lt;/b&gt;')
    expect(out).toContain('--&gt;')
    expect(out).toContain('<v Karine&lt;1&gt;>')
    expect(out).not.toContain('<b>balise')
  })

  test('SRT : un `-->` littéral ne ressemble jamais à un séparateur de cue', () => {
    const out = genererSrt(contexte(entreeHostile()), OPTIONS_TOUT)
    expect(out).toContain('- ->')
  })
})

describe('multicodage WebVTT', () => {
  test('TOUTES les catégories d un fragment sortent en classes imbriquées', () => {
    const base = entreeTeste()
    base.codebook = [
      ...base.codebook,
      {
        id: 'c2',
        nom: 'Second//axe',
        couleur: '#00ff00',
        ordre: 1,
        parent: null,
        actif: true,
        codeExport: 'cat_002',
      },
    ]
    base.annotations = [
      { id: 'a1', type: 'codage', from: 15, to: 19, auteur: 'moi', code: 'cat_001' },
      { id: 'a1b', type: 'codage', from: 15, to: 19, auteur: 'moi', code: 'cat_002' },
      ...base.annotations.filter((a) => a.id !== 'a1'),
    ]
    const out = genererVtt(contexte(base), OPTIONS_TOUT)
    const scat1 = idCssCode('cat_001')
    const scat2 = idCssCode('cat_002')
    expect(out).toContain(`<c.${scat1}><c.${scat2}>Lyon</c></c>`)
  })
})

describe('HTML : option coordonnées temporelles', () => {
  test('time décoché : les boutons de lecture disparaissent aussi', () => {
    const ctx = contexte()
    ctx.audioUrl = 'file:///corpus/entretien.wav'
    const out = genererHtml(ctx, { ...OPTIONS_TOUT, time: false })
    expect(out).toContain('audio-export') // le player reste
    expect(out).not.toContain('<button class="btn-play-seg"')
  })
})

describe('matrice d options par format', () => {
  test('options nommées : activée + défaut explicites pour chaque format', () => {
    for (const [, cfg] of Object.entries(CONFIG_OPTIONS)) {
      for (const [cle, o] of Object.entries(cfg)) {
        expect(o, `${cle}`).toMatchObject({ activee: true, defaut: expect.any(Boolean) })
      }
    }
    // Le .sonal ne propose que la pseudonymisation ; les autres options sont masquées.
    expect(CONFIG_OPTIONS.sonal).toEqual({ anon: { activee: true, defaut: false } })
  })
})
