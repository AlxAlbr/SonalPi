// @vitest-environment happy-dom
import { describe, test, expect } from 'vitest'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { importerSonal } from '../src/renderer/formatSonal/importSonal'
import { exporterSonal } from '../src/renderer/formatSonal/exportSonal'
import type { EntreeExport } from '../src/shared/export/types'
import type { Annotation } from '../src/shared/entretien/annotation'

/** Filet de sécurité du refactoring d'export : la sortie `exporterSonal` est
 *  comparée OCTET PAR OCTET à des fichiers golden (test/fixtures/golden-exports/).
 *  Pour (re)générer les golden : GENERER_GOLDEN=1 npm run test. Toute diff non
 *  volontaire du `.sonal` doit faire échouer ces tests. */

const DOSSIER = join(process.cwd(), 'test/fixtures/golden-exports')

function parse(html: string): Document {
  const inerte = html
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<script\b[^>]*\bsrc=[^>]*><\/script>/gi, '')
  return new DOMParser().parseFromString(inerte, 'text/html')
}

const BLOC1 = 'Karine habite Lyon depuis 2020.'
const BLOC2 = 'Où travaillez-vous ?'

/** Entretien de référence : codage, anon + exception, ancres, interviewer,
 *  locuteur pseudonymisé, commentaire, bloc vide, tour sans locuteur. */
function entreeRiche(): EntreeExport {
  const anns: Annotation[] = [
    // « Lyon » (PM 15..19) codé
    { id: 'a1', type: 'codage', from: 15, to: 19, auteur: 'Ana', code: 'cat_001' },
    // « Karine » (PM 1..7) anonymisé
    { id: 'a2', type: 'anon', from: 1, to: 7, auteur: 'Ana', etat: 'anonymise', pseudo: 'Marie' },
    // « 2020 » (PM 28..32) exception
    { id: 'a3', type: 'anon', from: 28, to: 32, auteur: 'Ana', etat: 'exception', pseudo: 'Souvenir' },
    // Commentaire sur « depuis » (PM 21..27)
    { id: 'a4', type: 'commentaire', from: 21, to: 27, auteur: 'Ana', texte: 'Vérifier la date.' },
  ]
  return {
    corpsTexte: {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: BLOC1 }] },
        { type: 'paragraph', attrs: { loc: 1 }, content: [] }, // bloc vide
        { type: 'paragraph', attrs: { loc: null }, content: [{ type: 'text', text: BLOC2 }] },
      ],
    },
    annotations: anns,
    ancres: [
      { pos: 1, t: 10.5 },
      { pos: 16, t: 12 },
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
        valeursLoc: {},
        personneRef: null,
      },
      { index: 2, nom: 'Marc', interviewer: true, valeursLoc: {}, personneRef: null },
    ],
    codebook: [
      {
        id: 'c1',
        nom: 'Lieu',
        description: 'ville citée',
        couleur: '#ff0000',
        ordre: 0,
        parent: null,
        actif: true,
        codeExport: 'cat_001',
      },
    ],
    variables: [],
    meta: { valeursGen: {} },
    legacy: { tabAnon: null, notes: '' },
    brouillonsAnon: [],
  }
}

/** Tour fusionné re-découpé en cues (ancres internes au bloc, 2 ancres à la même pos). */
function entreeTourFusionne(): EntreeExport {
  return {
    corpsTexte: {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: 'Un deux. Trois quatre.' }] },
      ],
    },
    annotations: [],
    ancres: [
      { pos: 1, t: 0 },
      { pos: 10, t: 2 },
      { pos: 10, t: 3 },
      { pos: 23, t: 5 },
    ],
    locuteurs: [{ index: 1, nom: 'Speaker 3', valeursLoc: {}, personneRef: null }],
    codebook: [],
    variables: [],
    meta: { valeursGen: {} },
    legacy: { tabAnon: null, notes: '' },
    brouillonsAnon: [],
  }
}

/** Codage enjambant deux blocs, texte avec guillemets et esperluette (échappements). */
function entreeEchappements(): EntreeExport {
  return {
    corpsTexte: {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: 'Il dit "bonjour" & part.' }] },
        { type: 'paragraph', attrs: { loc: 2 }, content: [{ type: 'text', text: "L'été à Aix." }] },
      ],
    },
    annotations: [
      // « bonjour" & part.<fin bloc> L'été » : un codage sur toute la plage
      { id: 'a1', type: 'codage', from: 8, to: 33, auteur: 'Ana', code: 'cat_001' },
    ],
    ancres: [],
    locuteurs: [
      { index: 1, nom: 'Lui & Elle', valeursLoc: {}, personneRef: null },
      { index: 2, nom: 'Autre', interviewer: true, valeursLoc: {}, personneRef: null },
    ],
    codebook: [
      { id: 'c1', nom: 'Récit', ordre: 0, parent: null, actif: true, codeExport: 'cat_001' },
    ],
    variables: [],
    meta: { valeursGen: {} },
    legacy: { tabAnon: null, notes: '' },
    brouillonsAnon: [],
  }
}

/** Sauts de ligne du modèle (hardBreak) : ancres APRÈS un saut — le poids PM
 *  du saut doit être compté (data-deb/data-fin à la bonne borne, bug d'offset
 *  antérieur corrigé) ; le `.sonal` reste plat (le saut ne sort pas). */
function entreeSauts(): EntreeExport {
  // PM : contenu à partir de 1 ; « Avant. » occupe [1..7[, le hardBreak 7..8,
  // « Après. » [8..14[ ; ancres à 1, 8 et 14.
  return {
    corpsTexte: {
      type: 'doc',
      content: [{
        type: 'paragraph',
        attrs: { loc: 1 },
        content: [
          { type: 'text', text: 'Avant.' },
          { type: 'hardBreak' },
          { type: 'text', text: 'Après.' },
        ],
      }],
    },
    annotations: [],
    ancres: [
      { pos: 1, t: 1 },
      { pos: 8, t: 2 },
      { pos: 14, t: 3 },
    ],
    locuteurs: [{ index: 1, nom: 'Karine', valeursLoc: {}, personneRef: null }],
    codebook: [],
    variables: [],
    meta: { valeursGen: {} },
    legacy: { tabAnon: null, notes: '' },
    brouillonsAnon: [],
  }
}

const FIXTURES = ['entretien1.sonal', 'entretien2.sonal', 'entretien3.sonal']
const SYNTHETIQUES: Array<[string, EntreeExport]> = [
  ['synthetique-riche.sonal', entreeRiche()],
  ['synthetique-tour-fusionne.sonal', entreeTourFusionne()],
  ['synthetique-echappements.sonal', entreeEchappements()],
  ['synthetique-sauts.sonal', entreeSauts()],
]

function entreeDeFixture(nom: string): EntreeExport {
  const html = readFileSync(join(process.cwd(), 'test/fixtures', nom), 'utf8')
  const r = importerSonal(parse(html))
  return { ...r.payload, codebook: r.codebook, variables: r.variables, legacy: r.legacy }
}

function sortie(_nom: string, entree: EntreeExport): string {
  return exporterSonal(entree)
}

describe('export .sonal — golden octet par octet', () => {
  const entrees: Array<[string, EntreeExport]> = [
    ...SYNTHETIQUES,
    ...FIXTURES.map((f) => [`golden-${f}`, entreeDeFixture(f)] as [string, EntreeExport]),
  ]

  for (const [nom, entree] of entrees) {
    test(`${nom} : sortie inchangée`, () => {
      const chemin = join(DOSSIER, nom)
      if (process.env.GENERER_GOLDEN) {
        mkdirSync(DOSSIER, { recursive: true })
        writeFileSync(chemin, sortie(nom, entree))
      }
      expect(existsSync(chemin)).toBe(true)
      expect(sortie(nom, entree)).toBe(readFileSync(chemin, 'utf8'))
    })
  }
})
