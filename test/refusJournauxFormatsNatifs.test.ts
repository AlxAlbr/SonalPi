import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JournalLocalThemesGitLab, type JournalThemesGitLab } from '../src/main/gitlab/journalThemes'
import { JournalLocalThemesWebDAV } from '../src/main/distant/journalThemesWebDAV'
import { JournalPublicationGitLab } from '../src/main/gitlab/journalPublication'
import { squeletteCorpus } from '../src/shared/corpus/squelette'
import type { EntretienFichier } from '../src/shared/format'

const dossiers: string[] = []
afterEach(() => { for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function dossier(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-journal-natif-'))
  dossiers.push(dir)
  return dir
}
function entretien(): EntretienFichier {
  return {
    formatVersion: 2, lastModified: '2026-01-01', corpsTexte: { type: 'doc', content: [] },
    annotations: [], ancres: [], participations: [], meta: { valeursGen: {}, audioRef: null },
  }
}
function contenuJournal(): JournalThemesGitLab {
  return {
    version: 1, destination: 'destination', operationId: 'operation', tentatives: [],
    demande: { type: 'transfert', source: 'source', cible: { type: 'existante', id: 'cible' }, conserverSource: true },
    cibles: [], definitionsConfirmees: false, selectionnes: [], differes: [], corpus: squeletteCorpus(),
    bilan: { reussis: [], echecs: [], ciblesCreees: [], finalisation: 'non-demandee', sourceConservee: true },
    termine: false,
  }
}

for (const fournisseur of ['gitlab', 'webdav'] as const) {
  describe(`journal de thématiques ${fournisseur} et documents natifs`, () => {
    function banc() {
      const dir = dossier()
      const journal = fournisseur === 'gitlab'
        ? new JournalLocalThemesGitLab(dir, 'destination') : new JournalLocalThemesWebDAV(dir, 'destination')
      return { dir, fichier: join(dir, `.themes-${fournisseur}.json`), journal }
    }
    test('la version de l’enveloppe reste indépendante de celle des documents', () => {
      const b = banc(), contenu = contenuJournal()
      b.journal.ecrire(contenu)
      expect(b.journal.lire()).toEqual(contenu)
      expect(b.journal.lire()?.version).toBe(1)
      expect(b.journal.lire()?.corpus.formatVersion).toBe(2)
    })
    test.each([1, 99])('refuse un corpus capturé en format %i sans modifier le journal', (version) => {
      const b = banc(), contenu = contenuJournal()
      b.journal.ecrire(contenu)
      const valide = readFileSync(b.fichier, 'utf8')
      contenu.corpus.formatVersion = version
      expect(() => b.journal.ecrire(contenu)).toThrow('non supportée')
      expect(readFileSync(b.fichier, 'utf8')).toBe(valide)
      writeFileSync(b.fichier, JSON.stringify(contenu))
      const ancien = readFileSync(b.fichier, 'utf8')
      expect(() => b.journal.lire()).toThrow('non supportée')
      expect(readFileSync(b.fichier, 'utf8')).toBe(ancien)
      expect(readdirSync(b.dir)).toEqual([`.themes-${fournisseur}.json`])
    })
    test.each(['entretien', 'definitions'] as const)('refuse une publication %s de version native inconnue', (phase) => {
      const b = banc(), contenu = contenuJournal()
      const document = phase === 'entretien' ? entretien() : squeletteCorpus()
      document.formatVersion = 99
      contenu.publication = {
        operationId: 'publication', phase, chemin: phase === 'entretien' ? 'entretiens/e1.json' : 'corpus.crp',
        contenu: JSON.stringify(document),
        ...(phase === 'entretien' ? { entretien: { id: 'e1', reaffectes: 0, doublonsSupprimes: 0 } } : {}),
      }
      writeFileSync(b.fichier, JSON.stringify(contenu))
      const avant = readFileSync(b.fichier, 'utf8')
      expect(() => b.journal.lire()).toThrow('non supportée')
      expect(readFileSync(b.fichier, 'utf8')).toBe(avant)
    })
    test('refuse un corpus V2 dont la structure est incompatible', () => {
      const b = banc(), contenu = contenuJournal()
      Object.assign(contenu.corpus, { personnes: {} })
      writeFileSync(b.fichier, JSON.stringify(contenu))
      expect(() => b.journal.lire()).toThrow('Répertoire de locuteurs invalide')
    })
  })
}

describe('candidats du journal de publication GitLab', () => {
  for (const encoding of ['text', 'base64'] as const) {
    test.each(['racine/corpus.crp', 'racine/entretiens/e1.json'])(`refuse les documents incompatibles encodés en ${encoding} avant de créer une intention : %s`, (file_path) => {
      const dir = dossier(), journal = new JournalPublicationGitLab('destination', dir)
      const avant = readdirSync(join(dir, 'operations'))
      const document = JSON.stringify({ formatVersion: 99 })
      expect(() => journal.preparer({
        operationId: 'ancienne-publication', nature: 'transaction-corpus', branche: 'main', etat: 'prepare',
        droits: [{ resourceHash: 'a'.repeat(64), generation: 'generation', leaseCommitId: 'b'.repeat(40) }],
        actions: [{ action: 'create', file_path, encoding, content: encoding === 'base64' ? Buffer.from(document).toString('base64') : document }],
      })).toThrow('non supportée')
      expect(readdirSync(join(dir, 'operations'))).toEqual(avant)
      expect(readdirSync(join(dir, 'candidates'))).toEqual([])
    })
  }
})
