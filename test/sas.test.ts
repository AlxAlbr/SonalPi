// @vitest-environment happy-dom
import { describe, test, expect } from 'vitest'
import { importerFichier } from '../src/renderer/formatSonal/sas'

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
  test('un .srt devient des blocs éditables + des ANCRES temporelles', () => {
    const { payload } = importerFichier('entretien.srt', SRT, parse)
    const doc = payload.corpsTexte as {
      content: Array<{ content?: Array<{ text?: string }> }>
    }
    expect(doc.content.length).toBe(2)

    // Les timecodes SRT deviennent des ancres {pos, t} (2 par cue : deb + fin).
    expect(payload.ancres.map((a) => a.t)).toEqual([1, 4, 5.5, 9])
    // deb du cue 1 = début du texte du 1er bloc (pos PM 1).
    expect(payload.ancres[0].pos).toBe(1)

    // Le texte des cues est présent.
    const t0 = (doc.content[0].content ?? []).map((n) => n.text ?? '').join('')
    expect(t0).toContain('Bonjour, comment allez-vous')
  })

  test('« Speaker N » garde sa numérotation, même avec des trous ; « None: » = bloc sans locuteur', () => {
    const srt = `1
00:00:00,000 --> 00:00:01,439
None: Renaud.

2
00:00:30,000 --> 00:00:33,679
Speaker 3: Je vous ai perdu, Klaus.

3
00:00:34,140 --> 00:00:37,320
Speaker 3: Mais je ne suis pas responsable.

4
00:00:41,420 --> 00:00:43,240
Speaker 7: Klaus, je vous revois.
`
    const { payload } = importerFichier('entretien.srt', srt, parse)
    const doc = payload.corpsTexte as {
      content: Array<{ attrs: { loc: number | null }; content?: Array<{ text?: string }> }>
    }
    const texte = (k: number) => (doc.content[k].content ?? []).map((n) => n.text ?? '').join('')

    // Les noms conservent la numérotation du fichier (pas de décalage +1),
    // et l'index des blocs pointe bien sur ces locuteurs (position = index).
    expect(payload.locuteurs.map((l) => [l.index, l.nom])).toEqual([
      [1, 'Speaker 3'],
      [2, 'Speaker 7'],
    ])
    // FUSION DES TOURS : les 2 cues consécutifs de Speaker 3 = UN bloc ;
    // le bloc « None » (sans locuteur) reste seul.
    expect(doc.content.map((b) => b.attrs.loc)).toEqual([null, 1, 2])

    // Le préfixe « None: » est retiré et ne crée aucun locuteur.
    expect(texte(0)).toContain('Renaud.')
    expect(texte(0)).not.toContain('None')
    // Le tour fusionné porte le texte des 2 cues, préfixes retirés.
    expect(texte(1)).toContain('Je vous ai perdu')
    expect(texte(1)).toContain('Mais je ne suis pas responsable')
    expect(texte(1)).not.toContain('Speaker')

    // Les frontières de cues SURVIVENT en ancres internes : 8 bornes mesurées,
    // et la fin du cue 2 partage sa position (texte) avec le deb du cue 3.
    expect(payload.ancres.map((a) => a.t)).toEqual([0, 1.439, 30, 33.679, 34.14, 37.32, 41.42, 43.24])
    expect(payload.ancres[3].pos).toBe(payload.ancres[4].pos)
  })

  test('un .txt brut (sans timestamps ni locuteurs) devient un bloc par ligne', () => {
    const { payload } = importerFichier('notes.txt', 'Première ligne.\nSeconde ligne.\n', parse)
    const doc = payload.corpsTexte as {
      content: Array<{ attrs: { deb: number | null }; content?: Array<{ text?: string }> }>
    }
    expect(doc.content.length).toBe(2)
    const t0 = (doc.content[0].content ?? []).map((n) => n.text ?? '').join('')
    expect(t0).toContain('Première ligne.')
  })

  test('un format inconnu est rejeté explicitement', () => {
    expect(() => importerFichier('x.rtf', 'peu importe', parse)).toThrow(/non pris en charge/)
  })
})
