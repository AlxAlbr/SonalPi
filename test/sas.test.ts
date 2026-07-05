// @vitest-environment happy-dom
import { describe, test, expect } from 'vitest'
import { importerFichier } from '../src/renderer/import/sas'

function parse(html: string): Document {
  const inerte = html
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<script\b[^>]*\bsrc=[^>]*><\/script>/gi, '')
  return new DOMParser().parseFromString(inerte, 'text/html')
}

const SRT = `1
00:00:01,000 --> 00:00:04,000
Bonjour, comment allez-vous ?

2
00:00:05,500 --> 00:00:09,000
Très bien merci, et vous ?
`

describe('sas d’import — SRT via convertSRT (sas unique)', () => {
  test('un .srt devient des blocs horodatés (deb/fin) et éditables', () => {
    const { payload } = importerFichier('entretien.srt', SRT, parse)
    const doc = payload.corpsTexte as {
      content: Array<{ attrs: { deb: number | null; fin: number | null }; content?: Array<{ text?: string }> }>
    }
    expect(doc.content.length).toBe(2)

    // Les timecodes SRT deviennent les attributs deb/fin des blocs.
    expect(doc.content[0].attrs.deb).toBe(1)
    expect(doc.content[0].attrs.fin).toBe(4)
    expect(doc.content[1].attrs.deb).toBe(5.5)

    // Le texte des cues est présent.
    const t0 = (doc.content[0].content ?? []).map((n) => n.text ?? '').join('')
    expect(t0).toContain('Bonjour, comment allez-vous')
  })

  test('un format inconnu est rejeté explicitement', () => {
    expect(() => importerFichier('x.docx', 'peu importe', parse)).toThrow(/non pris en charge/)
  })
})
