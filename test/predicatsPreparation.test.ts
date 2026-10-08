import { describe, expect, it } from 'vitest'
import {
  entretienPreparationPresent,
  guideDemoPresent,
  notePreparationPresente,
  problematiqueRenseignee,
} from '../src/renderer/composables/parcours/predicatsPreparation'
import { tableauBordParDefaut } from '../src/shared/corpus/tableaubord'
import type { Note } from '../src/shared/format'

const note = (titre: string, corps: string): Note => ({
  id: 'n1', categorieId: 'generale', titre, corps, date: null, statut: 'prive',
  rang: 0, creeLe: '2026-01-01', modifieLe: null,
})

describe('prédicats du parcours de préparation', () => {
  it('observe la note de la cellule Problématique', () => {
    const tableau = tableauBordParDefaut()
    expect(problematiqueRenseignee(tableau)).toBe(false)
    tableau.cellules['#traversant'] = { problematique: { note: 'Question de recherche' } }
    expect(problematiqueRenseignee(tableau)).toBe(true)
  })

  it('distingue le guide du projet et les documents exemples', () => {
    expect(guideDemoPresent([{ source: 'exemple', nom: 'Guide-entretien-demo.txt', type: 'texte', taille: 1, modifieLe: null }])).toBe(false)
    expect(guideDemoPresent([{ source: 'projet', nom: 'Autre.txt', type: 'texte', taille: 1, modifieLe: null }])).toBe(false)
    expect(guideDemoPresent([{ source: 'projet', nom: 'Guide-entretien-demo.txt', type: 'texte', taille: 1, modifieLe: null }])).toBe(true)
  })

  it('valide l’entretien identifié et sa note non vide', () => {
    const membership = { cible: { titre: 'Renommé', date: null, lastModified: 'x' } }
    expect(entretienPreparationPresent('cible', membership)).toBe(true)
    expect(entretienPreparationPresent('autre', membership)).toBe(false)
    expect(notePreparationPresente([note('Avant l’entretien', '<p>Questions à poser</p>')])).toBe(true)
    expect(notePreparationPresente([note('Avant l’entretien', '<p> </p>')])).toBe(false)
    expect(notePreparationPresente([note('Autre titre', '<p>Questions</p>')])).toBe(false)
  })
})
