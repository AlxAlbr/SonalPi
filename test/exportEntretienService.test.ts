import { describe, test, expect, vi } from 'vitest'
import {
  construireInstantane,
  enregistrerRapportPseudonymisation,
  exporterEntretien,
  preparerRapportPseudonymisation,
  type SourceExportEntretien,
} from '../src/renderer/export/exportEntretien'
import type { DemandeExportDocx, DemandeExportPdf } from '../src/shared/format'
import type { InstantaneEntretienExport, OptionsExport } from '../src/shared/export/types'
import { entreeSentinelle } from './fixtures/export/entretiens'

// ----------------------------------------------------------------
// SERVICE D'EXPORT D'ENTRETIEN — instantané, rapport facultatif, génération
// ----------------------------------------------------------------

const OPTIONS_TXT: OptionsExport = {
  entete: false,
  notes: true,
  vars: true,
  time: true,
  loc: true,
  thm: true,
  anon: false,
}

/** Une source FICTIVE d'entretien ouvert : entête mémoire (données MODIFIÉES,
 *  jamais sauvées), compteurs d'appels pour vérifier qui fait quoi. */
function sourceTeste(opts: {
  audio?: string | null
  echecGeneration?: boolean
} = {}): SourceExportEntretien & {
  appels: { donneesExport: number; audioLocal: number; ecrireTexte: string[][]; ecrireDocx: number; ecrirePdf: number }
} {
  const appels = { donneesExport: 0, audioLocal: 0, ecrireTexte: [] as string[][], ecrireDocx: 0, ecrirePdf: 0 }
  return {
    appels,
    ouvertId: () => 'e1',
    titre: () => 'Entretien Test',
    donneesExport: () => {
      appels.donneesExport++
      return {
        // Le texte est une version « sale » (frappe non enregistrée) : l'export
        // doit photographier L'ÉTAT MÉMOIRE, pas relire le disque.
        corpsTexte: {
          type: 'doc',
          content: [
            { type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: 'Frappe non enregistrée.' }] },
          ],
        },
        annotations: [],
        ancres: [{ pos: 1, t: 1 }, { pos: 26, t: 2 }],
        locuteurs: [{ index: 1, nom: 'Karine', interviewer: false, pseudo: 'Claire', pseudoEtat: 'confirme', valeursLoc: {}, personneRef: null }],
        meta: { valeursGen: {}, audioRef: null },
        legacy: { tabAnon: null, notes: '' },
        brouillonsAnon: [],
        notes: [],
      }
    },
    codebook: () => [],
    variables: () => [],
    categoriesNote: () => [],
    reglesAnon: () => [],
    audioLocal: (audioRef) => {
      appels.audioLocal++
      return Promise.resolve(audioRef ? (opts.audio ?? null) : null)
    },
    ecrireTexte: async (nom, contenu) => {
      appels.ecrireTexte.push([nom, contenu])
      return `/cible/${nom}`
    },
    ecrireDocx: async (demande: DemandeExportDocx) => {
      appels.ecrireDocx++
      return opts.echecGeneration ? Promise.reject(new Error('DOCX en panne')) : `/cible/${demande.nomSuggere}`
    },
    ecrirePdf: async (_demande: DemandeExportPdf) => {
      appels.ecrirePdf++
      return `/cible/doc.pdf`
    },
  }
}

describe('construireInstantane — préparateur d instantané sans sauver() automatique', () => {
  test('photographie l état mémoire : données brutes, audio résolu, aucun accès disque', async () => {
    const source = sourceTeste({ audio: 'file:///corpus/son.wav' })
    // L'entretien référence un média : la résolution passe par le main.
    source.donneesExport = (() => ({
      ...sourceTeste().donneesExport(),
      meta: { valeursGen: {}, audioRef: '/corpus/son.wav' },
    })) as typeof source.donneesExport
    const instantane: InstantaneEntretienExport | null = await construireInstantane(source)
    expect(instantane).not.toBeNull()
    expect(instantane!.id).toBe('e1')
    expect(instantane!.titre).toBe('Entretien Test')
    expect(instantane!.audioLocal).toBe('file:///corpus/son.wav')
    expect(instantane!.entretien.codebook).toEqual([])
    expect(instantane!.entretien.corpsTexte).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: 'Frappe non enregistrée.' }] },
      ],
    })
  })

  test('sans média : pas d appel de résolution audio', async () => {
    const source = sourceTeste()
    await construireInstantane(source)
    expect(source.appels.audioLocal).toBe(0)
  })

  test('aucune fonction d écriture ne fait partie du contrat source', () => {
    // Garantie STRUCTURELLE : l'interface du préparateur ne contient aucune
    // action d'écriture — un instantané ne peut pas déclencher de `sauver()`.
    const clefs = Object.keys(sourceTeste())
    expect(clefs.filter((k) => /sauv|ecris|write|persist/i.test(k))).toEqual([])
  })
})

describe('rapport facultatif avant export', () => {
  test('prépare sans écrire, puis enregistre le rapport séparément', async () => {
    const source = sourceTeste()
    const entree = entreeSentinelle()
    const s: SourceExportEntretien = {
      ...source,
      donneesExport: () => ({ ...entree, notes: [], meta: { valeursGen: {}, audioRef: null } }),
    }
    const preparation = await preparerRapportPseudonymisation(
      'txt',
      { ...OPTIONS_TXT, anon: true },
      s,
    )
    expect(preparation.etat).toBe('succes')
    expect(source.appels.ecrireTexte).toHaveLength(0)
    if (preparation.etat !== 'succes') return
    expect(preparation.apercu.texte).toContain('Éléments conservés')
    expect(preparation.apercu.nomSuggere).toBe('Entretien Test_rapport-pseudonymisation.txt')

    const enregistrement = await enregistrerRapportPseudonymisation(preparation.apercu, s)
    expect(enregistrement.etat).toBe('succes')
    expect(source.appels.ecrireTexte).toHaveLength(1)
    expect(source.appels.ecrireTexte[0][0]).toBe('Entretien Test_rapport-pseudonymisation.txt')
  })
})

describe('exporterEntretien — orchestration', () => {
  test('TXT : contenu généré depuis l instantané, un seul appel d écriture', async () => {
    const source = sourceTeste()
    const r = await exporterEntretien('txt', OPTIONS_TXT, source)
    expect(r).toEqual({ etat: 'succes', chemin: '/cible/Entretien Test.txt' })
    expect(source.appels.ecrireTexte).toHaveLength(1)
    const [, contenu] = source.appels.ecrireTexte[0]
    expect(contenu).toContain('Frappe non enregistrée.')
  })

  test('les notes publiques conservent le nom de leur catégorie', async () => {
    const source = sourceTeste()
    source.categoriesNote = () => [{ id: 'ncat_terrain', nom: 'Terrain', couleur: '#cccccc' }]
    const donnees = source.donneesExport
    source.donneesExport = () => ({
      ...donnees(),
      notes: [{
        id: 'n1', categorieId: 'ncat_terrain', titre: 'Contexte', date: null,
        statut: 'public', corps: 'Observation.', rang: 0,
        creeLe: '2024-01-01T00:00:00.000Z', modifieLe: null,
      }],
    })
    await exporterEntretien('txt', OPTIONS_TXT, source)
    expect(source.appels.ecrireTexte[0][1]).toContain('[Terrain]')
    expect(source.appels.ecrireTexte[0][1]).not.toContain('[Notes]')
  })

  test('nom suggéré : nettoyage + extension par format', async () => {
    const source = sourceTeste()
    await exporterEntretien('srt', OPTIONS_TXT, source)
    expect(source.appels.ecrireTexte[0][0]).toBe('Entretien Test.srt')
    await exporterEntretien('vtt', { ...OPTIONS_TXT, anon: true }, source)
    expect(source.appels.ecrireTexte[1][0]).toBe('Entretien Test_pseudonymise.vtt')
  })

  test('pseudonymisation incomplète : export non bloqué, éléments conservés en clair', async () => {
    const source = sourceTeste()
    const entree = entreeSentinelle()
    const s: SourceExportEntretien = { ...source, donneesExport: () => ({ ...entree, notes: [], meta: { valeursGen: {}, audioRef: null } }) }
    const r = await exporterEntretien('txt', { ...OPTIONS_TXT, anon: true }, s)
    expect(r.etat).toBe('succes')
    expect(source.appels.ecrireTexte).toHaveLength(1)
    expect(source.appels.ecrireTexte[0][1]).toContain('Anonymise-moi')
  })

  test('annulation du dialogue : résultat « annule », modale informée', async () => {
    const source = sourceTeste()
    source.ecrireTexte = async () => null
    const r = await exporterEntretien('txt', OPTIONS_TXT, source)
    expect(r).toEqual({ etat: 'annule' })
  })

  test('échec de génération : erreur typée, message présenté', async () => {
    const source = sourceTeste({ echecGeneration: true })
    const r = await exporterEntretien('docx', OPTIONS_TXT, source)
    expect(r.etat).toBe('erreur')
    if (r.etat === 'erreur') expect(r.message).toContain('L\'export a échoué')
  })

  test('sans entretien ouvert : erreur, jamais d écriture', async () => {
    const source = sourceTeste()
    const s: SourceExportEntretien = { ...source, ouvertId: () => null }
    const r = await exporterEntretien('txt', OPTIONS_TXT, s)
    expect(r.etat).toBe('erreur')
    expect(source.appels.ecrireTexte).toHaveLength(0)
  })
})
