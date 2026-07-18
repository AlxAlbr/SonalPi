import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CorpusFichier, EntretienFichier } from '../src/shared/format'

/**
 * Seed de DÉMO « Karine » — l'EX-amorçage produit, retiré du store (S8 rév. :
 * un corpus neuf naît VIDE, avec le seul bloc Pondérations). Les tests unitaires
 * (`storeNeuf`) et e2e (`lancer`) écrivent cette baseline dans le dossier de
 * corpus AVANT d'ouvrir le store / de lancer l'app : 1 entretien `e1` à deux
 * blocs, 3 thèmes de démo (Famille/Travail/Lieu) + le bloc Pondérations
 * (cat_004..007) — les ids/contenus historiques dont dépendent les specs.
 */
export function ecrireSeedDemo(dirCorpus: string): void {
  // IDEMPOTENT : ne JAMAIS écraser un corpus existant — les tests de persistance
  // relancent l'app sur le même dossier et doivent retrouver leur état.
  if (existsSync(join(dirCorpus, 'corpus.json'))) return
  const now = new Date().toISOString()
  const blanc = '#ffffff'
  const corpus: CorpusFichier = {
    formatVersion: 2,
    codebook: {
      cat_001: { id: 'cat_001', nom: 'Famille', ordre: 0, parent: null, actif: true, codeExport: 'cat_001' },
      cat_002: { id: 'cat_002', nom: 'Travail', ordre: 1, parent: null, actif: true, codeExport: 'cat_002' },
      cat_003: { id: 'cat_003', nom: 'Lieu', ordre: 2, parent: null, actif: true, codeExport: 'cat_003' },
      cat_004: { id: 'cat_004', nom: 'Pondérations', couleur: blanc, ordre: 3, parent: null, actif: true, codeExport: 'cat_004' },
      cat_005: { id: 'cat_005', nom: '★★★ Très important', couleur: blanc, taille: 24, ordre: 4, parent: 'cat_004', actif: true, codeExport: 'cat_005' },
      cat_006: { id: 'cat_006', nom: '★★☆ Assez important', couleur: blanc, taille: 22, ordre: 5, parent: 'cat_004', actif: true, codeExport: 'cat_006' },
      cat_007: { id: 'cat_007', nom: '★☆☆ Important', couleur: blanc, taille: 20, ordre: 6, parent: 'cat_004', actif: true, codeExport: 'cat_007' },
    },
    variables: {},
    reglesAnon: {},
    personnes: {},
    membership: { e1: { titre: 'Entretien Karine', date: null, lastModified: now } },
  }
  const e1: EntretienFichier = {
    formatVersion: 2,
    lastModified: now,
    corpsTexte: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { loc: 1 },
          content: [{ type: 'text', text: 'Karine habite Lyon depuis sa retraite.' }],
        },
        {
          type: 'paragraph',
          attrs: { loc: 2 },
          content: [{ type: 'text', text: 'Elle parle souvent de son travail passé et de sa famille.' }],
        },
      ],
    },
    annotations: [],
    ancres: [],
    locuteurs: [
      { index: 1, nom: 'Enquêteur', valeursLoc: {}, personneRef: null },
      { index: 2, nom: 'Karine', valeursLoc: {}, personneRef: null },
    ],
    meta: { valeursGen: {}, audioRef: null },
  }
  mkdirSync(join(dirCorpus, 'entretiens'), { recursive: true })
  writeFileSync(join(dirCorpus, 'corpus.json'), JSON.stringify(corpus, null, 2), 'utf8')
  writeFileSync(join(dirCorpus, 'entretiens', 'e1.json'), JSON.stringify(e1, null, 2), 'utf8')
}
