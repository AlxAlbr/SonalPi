import { describe, expect, it } from 'vitest'
import type { CorpusFichier, EntretienFichier } from '../src/shared/format'
import type { ContexteExport, EntreeExport, OptionsExport } from '../src/shared/export/types'
import {
  assemblerInstantaneCorpus,
  compterMots,
  nomDossierExportCorpus,
  texteIndexCorpus,
} from '../src/shared/export/corpus'
import { documentCombine } from '../src/shared/export/documentCorpus'
import { genererHtmlCombineCorpus } from '../src/shared/export/formatsTexte'
import { projeterSegments } from '../src/shared/export/projectionEntretien'
import { entreeSentinelle } from './fixtures/export/entretiens'

const OPTIONS: OptionsExport = {
  entete: true, notes: true, vars: true, time: true, loc: true, thm: true, anon: false,
}

/** Corpus minimal : codebook et variables DÉSORDONNÉS pour vérifier le tri. */
function corpusFichier(): CorpusFichier {
  return {
    formatVersion: 7,
    codebook: {
      c2: { id: 'c2', nom: 'B', couleur: '#00ff00', ordre: 1, parent: null, actif: true, codeExport: 'B' },
      c1: { id: 'c1', nom: 'A', couleur: '#ff0000', ordre: 0, parent: null, actif: true, codeExport: 'A' },
    },
    variables: {
      v2: { id: 'v2', lib: 'B', portee: 'entretien', priv: false, ordre: 1, vExport: 2, modalites: [] },
      v1: { id: 'v1', lib: 'A', portee: 'entretien', priv: false, ordre: 0, vExport: 1, modalites: [] },
    },
    reglesAnon: { r1: { id: 'r1', type: 'PER', nom: 'Règle', pseudo: 'P', etat: 'corpus' } as never },
    personnes: {},
    membership: {
      e1: { titre: 'Entretien un', date: '2024-05-01', lastModified: '2024-06-01T10:00:00Z' },
    },
    nom: 'Corpus test',
  }
}

/** Fichier entretien minimal, sans champs optionnels (défauts attendus). */
function fichierEntretien(corps?: unknown): EntretienFichier {
  return {
    formatVersion: 7,
    lastModified: '2024-06-01T10:00:00Z',
    corpsTexte:
      corps ?? { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: null } }] },
    annotations: [],
    ancres: [],
    locuteurs: [],
    meta: { valeursGen: { v1: 'm1' }, audioRef: null },
  }
}

describe('assemblerInstantaneCorpus', () => {
  it('assemble l\'instantané depuis le fichier natif et les définitions du corpus', () => {
    const corpus = corpusFichier()
    const fichier = fichierEntretien()
    fichier.brouillonsAnon = [{ id: 'b1' } as never]
    fichier.notes = [{ id: 'n1', statut: 'public', titre: 'N', categorieId: 'c', corps: '', date: null, rang: 0, creeLe: '' }]

    const r = assemblerInstantaneCorpus('e1', fichier, corpus, 'file:///media/audio.mp3')

    expect(r.id).toBe('e1')
    expect(r.titre).toBe('Entretien un')
    expect(r.date).toBe('2024-05-01')
    expect(r.audioLocal).toBe('file:///media/audio.mp3')
    expect(r.entretien.codebook.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(r.entretien.variables.map((v) => v.id)).toEqual(['v1', 'v2'])
    expect(r.entretien.meta).toEqual({ valeursGen: { v1: 'm1' } })
    expect(r.entretien.reglesAnon).toHaveLength(1)
    expect(r.entretien.brouillonsAnon).toHaveLength(1)
    expect(r.notesPubliques).toHaveLength(1)
  })

  it('applique les replis : titre générique, collections absentes, legacy vide', () => {
    const corpus = corpusFichier()
    const fichier = fichierEntretien()
    fichier.brouillonsAnon = undefined
    fichier.notes = undefined
    fichier.legacy = undefined

    // Corpus sans aucune définition (codebook/variables/règles/membership vides).
    const corpusVide = corpusFichier()
    corpusVide.codebook = {}
    corpusVide.variables = {}
    corpusVide.reglesAnon = {}
    corpusVide.membership = {}

    const r = assemblerInstantaneCorpus('e1', fichier, corpusVide, null)

    expect(r.titre).toBe('entretien')
    expect(r.date).toBeNull()
    expect(r.audioLocal).toBeNull()
    expect(r.entretien.codebook).toEqual([])
    expect(r.entretien.variables).toEqual([])
    expect(r.entretien.reglesAnon).toEqual([])
    expect(r.entretien.brouillonsAnon).toEqual([])
    expect(r.entretien.legacy).toEqual({ tabAnon: null, notes: '' })
    expect(r.notesPubliques).toEqual([])
    // valeursGen vient du FICHIER entretien (pas du corpus) : il passe tel quel.
    expect(r.entretien.meta).toEqual({ valeursGen: { v1: 'm1' } })
  })
})

describe('compterMots', () => {
  it('compte les mots de la transcription, accents compris', () => {
    const corps = {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { loc: 1 }, content: [{ type: 'text', text: 'trois mots ici.' }] },
        { type: 'paragraph', attrs: { loc: 2 }, content: [{ type: 'text', text: 'Décidée à Lyon !' }] },
      ],
    }
    const e = { ...entreeSentinelle(), corpsTexte: corps, annotations: [], ancres: [] }
    expect(compterMots(e)).toBe(6)
  })

  it('ne compte ni ponctuation ni espace', () => {
    const corps = {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { loc: null }, content: [{ type: 'text', text: 'Bonjour, monde…  -->  « fin »' }] }],
    }
    const e = { ...entreeSentinelle(), corpsTexte: corps, annotations: [], ancres: [] }
    expect(compterMots(e)).toBe(3)
  })

  it('renvoie le même total que le nombre de mots des fragments projetés', () => {
    const e = entreeSentinelle()
    const parProjection = projeterSegments(e).reduce(
      (total, seg) =>
        total + seg.fragments.reduce((t, f) => t + (f.texte.match(/[\wÀ-ÿ]+/g)?.length ?? 0), 0),
      0,
    )
    expect(compterMots(e)).toBe(parProjection)
    expect(compterMots(e)).toBeGreaterThan(0)
  })
})

describe('texteIndexCorpus', () => {
  it('listage : entête, une ligne par entretien exporté, ordre conservé', () => {
    const texte = texteIndexCorpus('Corpus test', '12/09/2025 14:30', [
      { titre: 'Entretien B', date: '2024-05-01', nbMots: 1234 },
      { titre: 'Entretien A', date: null, nbMots: 2 },
    ])
    const lignes = texte.split('\n')
    expect(lignes[0]).toBe('Nom du corpus : Corpus test')
    expect(lignes[1]).toBe('Export du corpus réalisé le 12/09/2025 14:30')
    expect(lignes[3]).toBe('2 entretiens exportés.')
    expect(lignes[5]).toBe('- Entretien B (2024-05-01) — 1234 mots')
    expect(lignes[6]).toBe('- Entretien A — 2 mots')
  })

  it('un seul entretien : pas de pluriel ; aucune ligne pour un lot vide', () => {
    expect(texteIndexCorpus('C', 'd', [{ titre: 'T', date: null, nbMots: 0 }])).toContain('1 entretien exporté.')
    const vide = texteIndexCorpus('C', 'd', [])
    expect(vide).toContain('0 entretien exporté.')
    expect(vide.split('\n').filter((l) => l.startsWith('- '))).toEqual([])
  })
})

describe('documentCombine', () => {
  it('un titre de niveau 1 par entretien, blocs conservés, séparés par une ligne vide', () => {
    const combine = documentCombine([
      {
        titre: 'Entretien un',
        document: {
          blocs: [
            { type: 'section', runs: [{ texte: 'NOTES', gras: true }] },
            { type: 'paragraphe', runs: [{ texte: 'note' }] },
          ],
        },
      },
      {
        titre: 'Entretien deux',
        document: { blocs: [{ type: 'espace' }] },
      },
    ])
    expect(combine.blocs).toEqual([
      { type: 'titre', runs: [{ texte: 'Entretien un', gras: true }] },
      { type: 'section', runs: [{ texte: 'NOTES', gras: true }] },
      { type: 'paragraphe', runs: [{ texte: 'note' }] },
      { type: 'espace' },
      { type: 'titre', runs: [{ texte: 'Entretien deux', gras: true }] },
      { type: 'espace' },
    ])
  })

  it('un lot vide donne un document vide', () => {
    expect(documentCombine([]).blocs).toEqual([])
  })

  it('le titre du lot n\'interprète pas le contenu des entretiens', () => {
    const e = entreeSentinelle()
    const combine = documentCombine([
      { titre: '**Titre** {g}', document: { blocs: [{ type: 'paragraphe', runs: [{ texte: e.codebook[0].nom }] }] } },
    ])
    expect(combine.blocs[0].type).toBe('titre')
    expect(combine.blocs[0].runs?.[0].texte).toBe('**Titre** {g}')
  })
})

describe('nomDossierExportCorpus', () => {
  it('nom sûr du corpus + date du jour, repli si nom vide', () => {
    expect(nomDossierExportCorpus('Corpus des Entretiens', '2025-09-19')).toBe('Corpus des Entretiens_2025-09-19')
    expect(nomDossierExportCorpus('a/b:c?', '2025-09-19')).toBe('a-b-c-_2025-09-19')
    expect(nomDossierExportCorpus('', '2025-09-19')).toBe('entretien_2025-09-19')
  })
})

describe('genererHtmlCombineCorpus', () => {
  it('une section par entretien (titre + contenu), CSS mis en commun, aucun player', () => {
    const ctx = (titre: string): ContexteExport => ({
      entree: { ...entreeSentinelle() },
      titre,
      notes: [],
      audioUrl: 'file:///media/audio.mp3',
    })
    const opts: OptionsExport = {
      entete: true, notes: true, vars: true, time: true, loc: true, thm: true, anon: false,
    }
    const html = genererHtmlCombineCorpus(
      [
        { titre: 'Entretien un', ctx: ctx('Entretien un'), options: opts },
        { titre: 'Entretien deux', ctx: ctx('Entretien deux'), options: opts },
      ],
      'Corpus test',
      '19/09/2025 10:00',
    )
    expect(html).toContain('<title>Corpus test</title>')
    expect(html).toContain('Exporté par Sonal π 2 le 19/09/2025 10:00')
    expect(html).toContain('<h1>Entretien un</h1>')
    expect(html).toContain('<h1>Entretien deux</h1>')
    // Le média ne sort PAS dans le PDF combiné : pas de player ni de script.
    expect(html).not.toContain('<audio id="audio-export"')
    expect(html).not.toContain('<script>')
    // Le contenu textuel est bien rendu.
    expect(html).toContain('Anonymise-moi')
  })

  it('un titre hostile est échappé', () => {
    const ctx = { entree: entreeSentinelle(), titre: 'x', notes: [], audioUrl: null }
    const html = genererHtmlCombineCorpus(
      [{ titre: '<script>window.__x=1</script>', ctx, options: OPTIONS }],
      'C',
      'd',
    )
    expect(html).not.toContain('<script>window.__x=1</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
