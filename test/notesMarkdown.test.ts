// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest'
import type { VueNoteCorpus } from '../src/shared/corpus/notes'
import { sanitiserCorpsNote } from '../src/renderer/notes/sanitiser'
import {
  corpsNoteEnMarkdown,
  echapperMarkdown,
  genererMarkdownNotes,
  nomFichierMarkdownNotes,
} from '../src/renderer/notes/markdown'

function doc(): Document {
  return new DOMParser().parseFromString('<!DOCTYPE html><html><body></body></html>', 'text/html')
}

function note(patch: Partial<VueNoteCorpus> = {}): VueNoteCorpus {
  const base = {
    id: 'note-1',
    categorieId: 'ncat_resume',
    titre: 'Titre_[x]',
    date: '2025-01-03',
    statut: 'public' as const,
    corps: '',
    locuteurIds: [],
    rang: 0,
    creeLe: '2025-01-01T10:00:00.000Z',
    modifieLe: null,
  }
  return {
    ...base,
    entretienId: 'entretien-1',
    entretienTitre: 'Entretien *A*',
    liensCommentaires: [],
    attendu: base,
    ...patch,
  }
}

describe('export Markdown des notes du corpus', () => {
  test('convertit les passages, échappe le texte et ajoute les liens résolus', () => {
    const corps = 'Texte *brut* <mark>fort _ici_</mark>\n' +
      '<em data-liens="commentaire-1">lié [x]</em> `code` \\ fin'
    const resultat = genererMarkdownNotes([
      note({
        corps,
        liensCommentaires: [{
          commentaireId: 'commentaire-1',
          auteur: 'Ali[ce]',
          texte: 'Commentaire *important*',
          timecodeSecondes: 65.9,
        }],
      }),
    ], 'Corpus *A*', {
      document: doc(),
      nomCategorie: () => 'Résumé_[principal]',
      maintenant: new Date(2025, 0, 2, 14, 5),
    })

    expect(resultat).toContain('# Notes du corpus "Corpus \\*A\\*"')
    expect(resultat).toContain('*Exporté le 02/01/2025 à 14:05*')
    expect(resultat).toContain('## Résumé\\_\\[principal\\] - Titre\\_\\[x\\]')
    expect(resultat).toContain('**Entretien** : Entretien \\*A\\* |')
    expect(resultat).toContain('**Date** : 2025-01-03 |')
    expect(resultat).toContain('Texte \\*brut\\* **fort \\_ici\\_**\n*lié \\[x\\]* \\`code\\` \\\\ fin')
    expect(resultat).toContain('Liens : [Ali\\[ce\\] : Commentaire \\*important\\*] (00:01:05)')
    expect(resultat).not.toContain('data-liens')
    expect(resultat).not.toMatch(/<\/?(?:mark|em)>/)
  })

  test('ne reprend aucun HTML brut après sanitisation du corps', () => {
    const d = doc()
    const corps = sanitiserCorpsNote(
      '<img src=x onerror=evil()>image<script>alert(1)</script><mark onclick=evil()>important</mark>',
      d,
    )
    const resultat = corpsNoteEnMarkdown(corps, d)

    expect(resultat).toBe('imagealert(1)**important**')
    expect(resultat).not.toMatch(/<|onerror|onclick/)
  })

  test('conserve les privées, les noms et l’ordre de la liste reçue, sans modifier les sources', () => {
    const notes = [
      note({ id: 'privee', titre: 'Hypothèse privée', statut: 'prive', corps: 'Fatima, piste non validée.', rang: 9 }),
      note({ id: 'publique', titre: 'Résumé public', corps: 'Constat à partager.', rang: 0 }),
    ]
    const avant = structuredClone(notes)
    const resultat = genererMarkdownNotes(notes, 'Terrain fictif', {
      document: doc(), nomCategorie: () => 'réflexion', maintenant: new Date('2026-02-18T12:00:00Z'),
    })
    expect(resultat).toContain('**Statut** : prive')
    expect(resultat).toContain('**Statut** : public')
    expect(resultat).toContain('Fatima, piste non validée.')
    expect(resultat.indexOf('Hypothèse privée')).toBeLessThan(resultat.indexOf('Résumé public'))
    expect(notes).toEqual(avant)
  })

  test('échappe les caractères Markdown et produit un nom de fichier portable', () => {
    expect(echapperMarkdown('\\ ` * _ [ ]')).toBe('\\\\ \\` \\* \\_ \\[ \\]')
    expect(nomFichierMarkdownNotes('Corpus : terrain/A', new Date('2025-04-05T10:00:00.000Z')))
      .toBe('notes_Corpus _ terrain_A_2025-04-05.md')
  })
})
