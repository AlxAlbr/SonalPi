import { describe, expect, test } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier } from '../src/shared/format'

const racine = join(process.cwd(), 'CorpusTest', 'CorpusSynthAnnot')
const corpus = JSON.parse(readFileSync(join(racine, 'corpus.crp'), 'utf8')) as CorpusFichier
const attendus = [
  { titre: '1Coordinatrice', annotations: 80, ancres: 200, locuteurs: 2, caracteres: 4225 },
  { titre: '2RetraiteAnticipee', annotations: 97, ancres: 190, locuteurs: 2, caracteres: 4603 },
  { titre: '3Cuisinier', annotations: 95, ancres: 160, locuteurs: 2, caracteres: 3262 },
  { titre: '4Etudiants', annotations: 52, ancres: 124, locuteurs: 3, caracteres: 3136 },
]

describe('corpus exemple annoté SonalPi2', () => {
  test('contient les quatre entretiens, trente thèmes et trois variables, sans dépendance V1', () => {
    expect(corpus.formatVersion).toBe(FORMAT_VERSION)
    expect(corpus.nom).toBe('CorpusSynthAnnot')
    expect(Object.values(corpus.membership).map((ref) => ref.titre))
      .toEqual(attendus.map((attendu) => attendu.titre))
    expect(Object.keys(corpus.codebook)).toHaveLength(30)
    expect(Object.keys(corpus.variables).sort()).toEqual(['v3', 'v4', 'v5'])
    expect(corpus.codebook.cat_025.parent).toBe('cat_026')
    expect(corpus.codebook.cat_007.description).toContain("l'annonce")
    expect(corpus.meta?.sourceV1).toBeUndefined()
    expect(readdirSync(racine).sort()).toEqual(['corpus.crp', 'entretiens', 'png'])
    for (const categorie of Object.values(corpus.codebook)) {
      if (categorie.parent) expect(corpus.codebook[categorie.parent]).toBeDefined()
    }
  })

  for (const attendu of attendus) {
    test(`${attendu.titre} : texte, annotations, temps, données, note et forme d'onde valides`, () => {
      const [id] = Object.entries(corpus.membership).find(([, ref]) => ref.titre === attendu.titre)!
      const entretien = JSON.parse(
        readFileSync(join(racine, 'entretiens', `${id}.json`), 'utf8'),
      ) as EntretienFichier
      const doc = entretien.corpsTexte as {
        content: Array<{ content?: Array<{ text?: string }> }>
      }
      const textes = doc.content.map((bloc) => (bloc.content ?? []).map((n) => n.text ?? '').join(''))
      const taille = textes.reduce((total, texte) => total + texte.length + 2, 0)
      expect(entretien.formatVersion).toBe(FORMAT_VERSION)
      expect(textes.join(' ')).toHaveLength(attendu.caracteres)
      expect(entretien.annotations).toHaveLength(attendu.annotations)
      for (const annotation of entretien.annotations) {
        expect(annotation.from).toBeGreaterThanOrEqual(1)
        expect(annotation.to).toBeGreaterThan(annotation.from)
        expect(annotation.to).toBeLessThan(taille)
        if (annotation.type === 'codage') expect(corpus.codebook[annotation.code!]).toBeDefined()
      }
      expect(entretien.ancres).toHaveLength(attendu.ancres)
      expect(entretien.ancres.map((ancre) => ancre.pos))
        .toEqual(entretien.ancres.map((ancre) => ancre.pos).sort((a, b) => a - b))
      expect(entretien.locuteurs).toHaveLength(attendu.locuteurs)
      for (const locuteur of entretien.locuteurs) {
        for (const [variableId, modaliteId] of Object.entries(locuteur.valeursLoc)) {
          expect(corpus.variables[variableId].modalites.some((m) => m.id === modaliteId)).toBe(true)
        }
      }
      expect(entretien.meta.sourceV1).toBeUndefined()
      expect(entretien.meta.audioRef).toMatch(new RegExp(`[/\\\\]${attendu.titre}\\.mp3$`))
      expect(existsSync(join(process.cwd(), 'CorpusTest', 'CorpusSynth', 'audio', `${attendu.titre}.mp3`)))
        .toBe(true)
      expect(entretien.notes).toHaveLength(1)
      expect(entretien.notes![0].corps).toContain('Cet entretien est totalement fictif.')
      const png = readFileSync(join(racine, 'png', `${id}.png`))
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    })
  }
})
