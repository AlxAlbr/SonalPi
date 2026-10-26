import { expect, test } from 'vitest'
import { useContextesPanneaux } from '../src/renderer/composables/useContextesPanneaux'

test('chaque consultation garde ses propres réglages sans restaurer de données métier', () => {
  const panneaux = useContextesPanneaux()
  let recherche = 'premier cas'
  const retirer = panneaux.enregistrerContextePanneau('cas', () => {
    const texte = recherche
    return () => { recherche = texte }
  })
  const premier = panneaux.capturerContextePanneau('cas')
  recherche = 'second cas'
  const second = panneaux.capturerContextePanneau('cas')
  recherche = 'ailleurs'
  second()
  expect(recherche).toBe('second cas')
  premier()
  expect(recherche).toBe('premier cas')
  retirer()
  recherche = 'nouveau corpus'
  panneaux.capturerContextePanneau('cas')()
  expect(recherche).toBe('nouveau corpus')
})

test('le démontage d’une ancienne instance ne retire pas l’enregistrement de la suivante', () => {
  const panneaux = useContextesPanneaux()
  let actif = ''
  const ancien = panneaux.enregistrerContextePanneau('cas', () => () => { actif = 'ancien' })
  panneaux.enregistrerContextePanneau('cas', () => () => { actif = 'nouveau' })
  ancien()
  panneaux.capturerContextePanneau('cas')()
  expect(actif).toBe('nouveau')
})
