import { describe, expect, test } from 'vitest'
import { FORMAT_VERSION, type EntretienFichier } from '../src/shared/format'
import type { EntreeExport, OptionsExport } from '../src/shared/export/types'
import {
  genererDonneesDocx,
  genererHtml,
  genererHtmlCombineCorpus,
  genererSrt,
  genererTxt,
  genererVtt,
} from '../src/shared/export/formatsTexte'
import { documentCombine } from '../src/shared/export/documentCorpus'
import { sonalPseudonymise } from '../src/renderer/formatSonal/exportSonal'
import {
  exporterRecueilTexte,
  projeterRecueil,
} from '../src/renderer/editor/recueils'
import {
  preparerSourcesPassages,
  type SourcePassageChargee,
} from '../src/renderer/editor/passages'
import { projeterExtraitsSynthese } from '../src/renderer/editor/synthese'
import { projeterCelluleAnalyseCroisee } from '../src/renderer/editor/analysesCroisees'
import { extraireOccurrencesLexico } from '../src/renderer/editor/lexico'
import { projeterCas } from '../src/renderer/editor/cas'
import {
  entreeMatricePseudonymisation,
  EXCEPTION_TEXTE_SENTINELLE,
  IDENTITE_TEXTE_SENTINELLE,
  LOCUTEUR_ORIGINAL_SENTINELLE,
  LOCUTEUR_PSEUDO_SENTINELLE,
  MEMOIRE_ANON_SENTINELLE,
  PSEUDO_LOCAL_MEMOIRE_SENTINELLE,
  PSEUDO_MASQUE_SENTINELLE,
  PSEUDO_REGLE_MEMOIRE_SENTINELLE,
  PSEUDO_TEXTE_SENTINELLE,
  REGLE_ANON_SENTINELLE,
  SANS_PSEUDO_SENTINELLE,
} from './fixtures/export/entretiens'

const OPTIONS: OptionsExport = {
  entete: true,
  notes: true,
  vars: true,
  time: true,
  loc: true,
  thm: true,
  anon: true,
}

const contexte = (entree: EntreeExport) => ({
  entree,
  titre: 'Entretien synthétique',
  notes: [],
  audioUrl: null,
})

interface SortieMatrice {
  nom: string
  locuteur: boolean
  produire: (entree: EntreeExport) => string
}

const sortiesDocuments: SortieMatrice[] = [
  { nom: 'TXT', locuteur: true, produire: (entree) => genererTxt(contexte(entree), OPTIONS) },
  { nom: 'HTML', locuteur: true, produire: (entree) => genererHtml(contexte(entree), OPTIONS) },
  { nom: 'SRT', locuteur: true, produire: (entree) => genererSrt(contexte(entree), OPTIONS) },
  { nom: 'VTT', locuteur: true, produire: (entree) => genererVtt(contexte(entree), OPTIONS) },
  { nom: 'DOCX intermédiaire', locuteur: true, produire: (entree) => JSON.stringify(genererDonneesDocx(contexte(entree), OPTIONS)) },
  { nom: 'PDF individuel', locuteur: true, produire: (entree) => genererHtml(contexte(entree), OPTIONS) },
  { nom: '.sonal pseudonymisé', locuteur: true, produire: (entree) => sonalPseudonymise(entree) },
  {
    nom: 'DOCX corpus',
    locuteur: true,
    produire: (entree) => JSON.stringify(documentCombine([{
      titre: 'Entretien synthétique',
      document: genererDonneesDocx(contexte(entree), OPTIONS).document,
    }])),
  },
  {
    nom: 'PDF corpus',
    locuteur: true,
    produire: (entree) => genererHtmlCombineCorpus([{
      titre: 'Entretien synthétique',
      ctx: contexte(entree),
      options: OPTIONS,
    }], 'Corpus synthétique', 'maintenant'),
  },
]

function fichierEntretien(entree: EntreeExport): { data: EntretienFichier; fin: number } {
  const copie = structuredClone(entree)
  const doc = copie.corpsTexte as { content: Array<{ content?: Array<{ text?: string }> }> }
  const longueur = doc.content[0].content?.reduce((total, noeud) => total + (noeud.text?.length ?? 1), 0) ?? 0
  const fin = longueur + 1
  return {
    fin,
    data: {
      formatVersion: FORMAT_VERSION,
      lastModified: '',
      corpsTexte: copie.corpsTexte,
      annotations: copie.annotations,
      ancres: copie.ancres,
      locuteurs: copie.locuteurs,
      meta: { valeursGen: copie.meta.valeursGen, audioRef: null },
      definitionsAnonLocales: copie.definitionsAnonLocales,
      reperesPassages: [{ id: 'p1', from: 1, to: fin }],
    },
  }
}

function sortiesPassages(): SortieMatrice[] {
  return [
    {
      nom: 'recueil texte',
      locuteur: true,
      produire: (entree) => {
        const { data } = fichierEntretien(entree)
        const projection = projeterRecueil(
          { membership: { e1: { titre: 'Entretien synthétique', date: null, lastModified: '' } } },
          {
            id: 'r1', nom: 'Recueil', creeLe: '', modifieLe: '', modeTexte: 'pseudonymise',
            items: [{ id: 'i1', type: 'passage', source: { entretienId: 'e1', repereId: 'p1' }, commentaireEditorial: '' }],
          },
          new Map([['e1', { ok: true as const, data }]]),
        )
        return exporterRecueilTexte(projection, {
          commentaires: false,
          sources: true,
          date: 'maintenant',
          incomplet: false,
          numerotation: 'aucune',
        })
      },
    },
    {
      nom: 'synthèse et copie',
      locuteur: true,
      produire: (entree) => {
        const { data, fin } = fichierEntretien(entree)
        const sources = preparerSourcesPassages(new Map<string, SourcePassageChargee>([
          ['e1', { ok: true, data }],
        ]))
        return JSON.stringify(projeterExtraitsSynthese([{
          id: 'x1', entretienId: 'e1', titreEntretien: 'Entretien synthétique',
          from: 1, to: fin, longueurSource: fin, themeIds: [], annotationIds: [],
          locuteurIds: ['1'], personneIds: [], ordre: 0,
        }], sources, 'pseudonymise'))
      },
    },
    {
      nom: 'analyse croisée',
      locuteur: true,
      produire: (entree) => {
        const { data, fin } = fichierEntretien(entree)
        const source = preparerSourcesPassages(new Map<string, SourcePassageChargee>([
          ['e1', { ok: true, data }],
        ])).get('e1')
        return JSON.stringify(projeterCelluleAnalyseCroisee({
          themeId: 't1', entretienId: 'e1', passages: 1, volume: fin - 1,
          couverture: 100, plages: [{ id: 'p1', from: 1, to: fin, annotationIds: [] }],
        }, source, 'pseudonymise'))
      },
    },
    {
      nom: 'cas',
      locuteur: true,
      produire: (entree) => {
        const { data } = fichierEntretien(entree)
        return JSON.stringify(projeterCas(
          {
            membership: { e1: { titre: 'Entretien synthétique', date: null, lastModified: '' } },
            personnes: {},
          },
          {
            id: 'c1', nom: 'Cas', memo: '', creeLe: '', modifieLe: '', regles: [],
            rattachements: [{
              id: 'r1', source: { entretienId: 'e1', repereId: 'p1' },
              provenance: 'manuel', creeLe: '',
            }],
          },
          new Map([['e1', { ok: true as const, data }]]),
        ))
      },
    },
    {
      nom: 'Lexico',
      locuteur: false,
      produire: (entree) => {
        const { data } = fichierEntretien(entree)
        return JSON.stringify(extraireOccurrencesLexico(
          'e1', { titre: 'Entretien synthétique', date: null, lastModified: '' }, data,
        ))
      },
    },
  ]
}

function verifierSortie(sortie: SortieMatrice): void {
  const entree = entreeMatricePseudonymisation()
  const avant = structuredClone(entree)
  const contenu = sortie.produire(entree)
  expect(contenu, sortie.nom).not.toContain(IDENTITE_TEXTE_SENTINELLE)
  expect(contenu, sortie.nom).not.toContain(PSEUDO_MASQUE_SENTINELLE)
  expect(contenu, sortie.nom).not.toContain(MEMOIRE_ANON_SENTINELLE)
  expect(contenu, sortie.nom).not.toContain(REGLE_ANON_SENTINELLE)
  expect(contenu, sortie.nom).not.toContain(PSEUDO_REGLE_MEMOIRE_SENTINELLE)
  expect(contenu, sortie.nom).not.toContain(PSEUDO_LOCAL_MEMOIRE_SENTINELLE)
  expect(contenu, sortie.nom).toContain(PSEUDO_TEXTE_SENTINELLE)
  expect(contenu, sortie.nom).toContain(EXCEPTION_TEXTE_SENTINELLE)
  expect(contenu, sortie.nom).toContain(SANS_PSEUDO_SENTINELLE)
  if (sortie.locuteur) {
    expect(contenu, sortie.nom).not.toContain(LOCUTEUR_ORIGINAL_SENTINELLE)
    expect(contenu, sortie.nom).toContain(LOCUTEUR_PSEUDO_SENTINELLE)
  }
  expect(entree, sortie.nom).toEqual(avant)
}

describe('matrice sentinelle des sorties pseudonymisées', () => {
  test.each(sortiesDocuments)('$nom', verifierSortie)
  test.each(sortiesPassages())('$nom', verifierSortie)
})
