import type { EntreeExport } from '../../../src/shared/export/types'
import type { Annotation } from '../../../src/shared/entretien/annotation'

/**
 *  Fixtures d'export : faux identifiants RECONNAISSABLES (sentinelles), codes
 *  et couleurs HOSTILES, multicodages, textes à marqueurs DOCX. Les sentinelles
 *  permettent de vérifier quels identifiants sont remplacés ou conservés selon
 *  la configuration de pseudonymisation.
 */

/** Nom réel « sentinelle » d'un locuteur doté d'un pseudonyme. */
export const NOM_SENTINELLE = 'NomRéel-SENTINELLE-7'
/** Pseudo utilisable du locuteur sentinelle. */
export const PSEUDO_SENTINELLE = 'PseudoFaux-1'
/** Nom d'un deuxième locuteur sans pseudo, conservé en clair. */
export const NOM_SENTINELLE_2 = 'NomRéel-SENTINELLE-9'
/** Texte des anciennes notes SonalPi1 (migrées en notes privées ; ne sortent jamais). */
export const NOTES_LEGACY_SENTINELLE = 'NotesLegacy-SENTINELLE'
/** Balise hostile posée dans les notes legacy : ne doit pas être réémise. */
export const SCRIPT_NOTES_HOSTILE = '<script>window.__notesInjete=1</script>'

/** Code de catégorie hostile : une interpolation directe en sélecteur CSS
 *  fermerait la règle et injecterait du CSS arbitraire. */
export const CODE_HOSTILE = 'x;} html{display:none} .injete{'
/** Couleur hostile : ferme le bloc CSS puis le <style>, injecte un <script>. */
export const COULEUR_HOSTILE = '#abc;} </style><script>window.__couleurInjete=1</script>'
/** Code de catégorie inoffensif pour les multicodages. */
export const CODE_SECOND = 'cat_second'

const TEXTE_BLOC1 = 'Anonymise-moi et {g} **gras** littéral.' // marqueurs DOCX + occurrence sans pseudo
const TEXTE_BLOC2 = 'Cue --> balise <script> fin.' // chaînes hostiles WebVTT

/** Entretien sentinelle : occurrence anonymisée SANS pseudo, locuteur sans
 *  pseudo, multicodage (2 codes sur le même fragment), codebook hostile,
 *  notes legacy hostiles, variable privée. */
export function entreeSentinelle(): EntreeExport {
  // « Anonymise-moi » = PM [1..14) sans pseudo ; « {g} **gras** littéral. » codé
  // deux fois (multicodage) ; « balise <script> » codé (code hostile).
  const annotations: Annotation[] = [
    { id: 's1', type: 'anon', from: 1, to: 14, auteur: 'sent', etat: 'anonymise', pseudo: null },
    // Multicodage : deux codages superposés sur « et {g} **gras** littéral. » (PM [14..41))
    { id: 's2', type: 'codage', from: 14, to: 41, auteur: 'sent', code: CODE_HOSTILE },
    { id: 's3', type: 'codage', from: 14, to: 41, auteur: 'sent', code: CODE_SECOND },
    // « balise <script> » (bloc 2, plat [8..23) → PM [51..66))
    { id: 's4', type: 'codage', from: 51, to: 66, auteur: 'sent', code: CODE_HOSTILE },
  ]
  return {
    corpsTexte: {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: TEXTE_BLOC1 }] },
        { type: 'paragraph', attrs: { loc: 2 }, content: [{ type: 'text', text: TEXTE_BLOC2 }] },
      ],
    },
    annotations,
    ancres: [
      { pos: 1, t: 0 },
      { pos: 43, t: 2 },
      { pos: 71, t: 5 },
    ],
    locuteurs: [
      {
        index: 1,
        nom: NOM_SENTINELLE,
        interviewer: false,
        pseudo: PSEUDO_SENTINELLE,
        pseudoEtat: 'confirme',
        valeursLoc: {},
        personneRef: null,
      },
      { index: 2, nom: NOM_SENTINELLE_2, interviewer: true, valeursLoc: {}, personneRef: null },
    ],
    codebook: [
      {
        id: 'c1',
        nom: 'Catégorie hostile//test',
        couleur: COULEUR_HOSTILE,
        ordre: 0,
        parent: null,
        actif: true,
        codeExport: CODE_HOSTILE,
      },
      {
        id: 'c2',
        nom: 'Catégorie seconde//test',
        couleur: '#00ff00',
        ordre: 1,
        parent: null,
        actif: true,
        codeExport: CODE_SECOND,
      },
    ],
    variables: [
      {
        id: 'sv1',
        lib: 'Publique',
        portee: 'entretien',
        priv: false,
        ordre: 0,
        vExport: 1,
        modalites: [{ id: 'sv1m1', lib: 'Lyon', mExport: 1 }],
      },
      {
        id: 'sv2',
        lib: 'Privée-SENTINELLE',
        portee: 'entretien',
        priv: true,
        ordre: 1,
        vExport: 2,
        modalites: [{ id: 'sv2m1', lib: 'Secret-SENTINELLE', mExport: 1 }],
      },
    ],
    meta: { valeursGen: { sv1: 'sv1m1', sv2: 'sv2m1' } },
    legacy: {
      tabAnon: null,
      notes: `${SCRIPT_NOTES_HOSTILE}${NOTES_LEGACY_SENTINELLE}`,
    },
    brouillonsAnon: [],
  }
}

/** Même entretien, mais aucun pseudo utilisable pour les deux locuteurs. */
export function entreeSansPseudos(): EntreeExport {
  const e = entreeSentinelle()
  return {
    ...e,
    annotations: e.annotations.map((a) =>
      a.type === 'anon' ? { ...a, etat: 'exception' as const, pseudo: null } : a,
    ),
    locuteurs: e.locuteurs.map((l) => ({ ...l, pseudo: '' })),
  }
}

/** Même entretien avec un pseudo exploitable pour l'occurrence et les deux
 *  locuteurs. */
export function entreePseudonymisable(): EntreeExport {
  const e = entreeSentinelle()
  return {
    ...e,
    annotations: e.annotations.map((a) =>
      a.type === 'anon' && a.etat === 'anonymise'
        ? { ...a, pseudo: 'PseudoFaux-2' }
        : a,
    ),
    locuteurs: e.locuteurs.map((l) => ({
      ...l,
      pseudo: l.index === 1 ? PSEUDO_SENTINELLE : 'PseudoFaux-3',
      pseudoEtat: 'confirme' as const,
    })),
  }
}
