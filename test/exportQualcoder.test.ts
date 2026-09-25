import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { ecrireProjetQualcoder } from '../src/main/exportQualcoder'
import type { QualcoderExportModel } from '../src/shared/export/qualcoder/modele'

const dossier = mkdtempSync(join(tmpdir(), 'sonal-qualcoder-'))
afterEach(() => rmSync(dossier, { recursive: true, force: true }))

function modele(): QualcoderExportModel {
  return {
    nom: 'Corpus test',
    dateExport: '2026-01-01T00:00:00.000Z',
    sources: [{
      id: 'e1', titre: 'Entretien', fulltext: 'Bonjour le monde', date: null,
      memo: 'Note source', owner: 'SonalPi', attributs: [],
      annotations: [
        { id: 'a1', type: 'codage', from: 0, to: 7, auteur: 'Auteur', texte: '', code: {
          id: 'c1', nom: 'Accueil', memo: '', couleur: '#112233',
          categorie: { id: 'cat1', nom: 'Thème', parent: null, couleur: '#445566' },
        } },
        { id: 'a2', type: 'commentaire', from: 8, to: 13, auteur: 'Auteur', texte: 'Commentaire' },
      ],
    }],
    codebook: [{ id: 'c1', nom: 'Accueil', memo: '', couleur: '#112233', categorie: { id: 'cat1', nom: 'Thème', parent: null, couleur: '#445566' } }],
    cases: [{
      id: 'cas1', nom: 'Cas A', memo: 'Mémo', owner: 'SonalPi', sourceIds: ['e1'],
      passages: [{ sourceId: 'e1', from: 0, to: 7, seltext: 'Bonjour', provenance: 'manuel' }],
      attributs: [{ nom: 'Statut', valeur: 'Actif', type: 'cas', caseId: 'cas1' }],
    }],
    attributs: [{ nom: 'Statut', type: 'cas', confidentiel: false }],
    diagnostics: [],
  }
}

describe('écriture d’un projet QualCoder natif', () => {
  it('crée data.qda, les répertoires et les objets principaux', () => {
    ecrireProjetQualcoder(modele(), dossier)
    const base = new DatabaseSync(join(dossier, 'data.qda'))
    try {
      expect(base.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
      expect(base.prepare('SELECT fulltext FROM source').get()).toEqual({ fulltext: 'Bonjour le monde' })
      expect(base.prepare('SELECT name FROM cases').get()).toEqual({ name: 'Cas A' })
      expect(base.prepare('SELECT seltext FROM code_text').get()).toEqual({ seltext: 'Bonjour' })
      expect(base.prepare('SELECT memo FROM annotation').get()).toEqual({ memo: 'Commentaire' })
      expect(base.prepare('SELECT value FROM attribute').get()).toEqual({ value: 'Actif' })
    } finally {
      base.close()
    }
  })

  it('refuse d’écraser un projet existant', () => {
    ecrireProjetQualcoder(modele(), dossier)
    expect(() => ecrireProjetQualcoder(modele(), dossier)).toThrow(/déjà/)
  })
})
