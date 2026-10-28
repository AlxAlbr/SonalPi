import { afterEach, describe, expect, test } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { extraireTexteEntretien, lireFichierEntretien } from '../src/main/importEntretien'
import { docxTexte, pdfTexte } from './fixtures/transcriptionsBureautiques'

const lignes = [
  'Enquêteur : Depuis quand êtes-vous bénévole ?',
  'Bénévole : Depuis cinq ans, à l’aide aux devoirs.',
]
const dossiers: string[] = []
afterEach(() => { for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true }) })

describe('extraction des transcriptions Word et PDF', () => {
  test('Word conserve les accents et sépare les paragraphes', async () => {
    const resultat = await extraireTexteEntretien('Entretien.DOCX', await docxTexte(lignes))
    expect(resultat.split(/\n+/).filter(Boolean)).toEqual(lignes)
  })

  test('PDF conserve les lignes et l’ordre des pages', async () => {
    const resultat = await extraireTexteEntretien('Entretien.pdf', pdfTexte([
      ['Enquêteur : Depuis quand êtes-vous bénévole ?', 'Une question complémentaire.'],
      ['Bénévole : Depuis cinq ans.'],
    ]))
    expect(resultat.split(/\n+/).filter(Boolean)).toEqual([
      'Enquêteur : Depuis quand êtes-vous bénévole ?',
      'Une question complémentaire.',
      'Bénévole : Depuis cinq ans.',
    ])
  })

  test.each(['docx', 'pdf'])('un %s endommagé produit une erreur lisible', async (extension) => {
    await expect(extraireTexteEntretien(`entretien.${extension}`, Buffer.from('document invalide')))
      .rejects.toThrow('Impossible de lire ce document')
  })

  test('un document sans texte n’est pas transmis comme une transcription vide', async () => {
    await expect(extraireTexteEntretien('vide.docx', await docxTexte([''])))
      .rejects.toThrow('ne contient pas de texte')
    await expect(extraireTexteEntretien('vide.pdf', pdfTexte([[]])))
      .rejects.toThrow('ne contient pas de texte')
  })

  test('la lecture garde le nom du fichier et laisse l’original intact', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-word-'))
    dossiers.push(dir)
    const chemin = join(dir, 'Mon entretien.docx')
    const original = await docxTexte(lignes)
    writeFileSync(chemin, original)
    const resultat = await lireFichierEntretien(chemin)
    expect(resultat.nom).toBe('Mon entretien.docx')
    expect(resultat.contenu).toContain(lignes[1])
    expect(readFileSync(chemin)).toEqual(original)
  })

  test('les formats texte conservent leur contenu UTF-8 sans conversion', async () => {
    const texte = 'Enquêteur : Bonjour.\r\nBénévole : Bonjour.'
    for (const extension of ['sonal', 'srt', 'vtt', 'txt']) {
      expect(await extraireTexteEntretien(`entretien.${extension}`, Buffer.from(texte))).toBe(texte)
    }
  })

  test('les formats absents du sélecteur sont refusés', async () => {
    await expect(extraireTexteEntretien('entretien.rtf', Buffer.from('texte')))
      .rejects.toThrow('format de transcription')
  })
})
