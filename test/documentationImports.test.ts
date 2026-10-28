// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { importerFichier } from '../src/renderer/formatSonal/sas'

function parse(html: string): Document {
  return new DOMParser().parseFromString(html
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<script\b[^>]*\bsrc=[^>]*><\/script>/gi, ''), 'text/html')
}

const page = parse(readFileSync(join(process.cwd(), 'docs/user/traiter/importer.html'), 'utf8'))

describe('exemples de transcription du guide utilisateur', () => {
  test.each([
    ['exemple.srt', ['Speaker 1', 'Speaker 0'], [1, 4, 8]],
    ['exemple-noms.srt', ['Enquêteur', 'Bénévole'], [1, 4, 8]],
    ['exemple-tabule.txt', ['Enquêteur', 'Bénévole'], [1, 4]],
    ['exemple.txt', ['Enquêteur', 'Bénévole'], [0]],
    ['exemple-chronometre.txt', ['Enquêteur', 'Bénévole'], [1, 4]],
  ] as const)('%s importe le texte, les locuteurs et les repères annoncés', (nom, locuteurs, temps) => {
    const extrait = page.querySelector(`[data-fichier="${nom}"]`)
    expect(extrait).not.toBeNull()
    const { payload } = importerFichier(nom, extrait!.textContent!, parse)
    const texte = JSON.stringify(payload.corpsTexte)
    expect(texte).toContain('Depuis quand êtes-vous bénévole')
    expect(texte).toContain('aide aux devoirs depuis cinq ans')
    expect(payload.locuteurs.map((l) => l.nom)).toEqual(locuteurs)
    expect([...new Set(payload.ancres.map((a) => a.t))]).toEqual(temps)
    expect(payload.locuteurs.every((l) => !l.interviewer)).toBe(true)
  })

  test.each(['docx', 'pdf'])('le texte extrait d’un %s suit les mêmes règles que le TXT', (extension) => {
    const contenu = page.querySelector('[data-fichier="exemple.txt"]')!.textContent!
    const { payload } = importerFichier(`entretien.${extension}`, contenu, parse)
    expect(payload.locuteurs.map((l) => l.nom)).toEqual(['Enquêteur', 'Bénévole'])
  })
})
