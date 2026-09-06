// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import {
  afficherErreurGlobale,
  effacerErreurGlobale,
  effacerErreurGlobaleSi,
  erreurGlobale,
} from '../src/renderer/erreurs'

describe('bannière globale du renderer', () => {
  afterEach(() => effacerErreurGlobale())

  it('explique un échec de fermeture avec le détail IPC utile', () => {
    const message = afficherErreurGlobale(
      new Error(
        "Error invoking remote method 'corpus:fermerEntretien': Error: Impossible de libérer le verrou.",
      ),
      'Vous restez dans l’entretien, car sa fermeture a échoué',
    )

    expect(message).toBe(
      'Vous restez dans l’entretien, car sa fermeture a échoué : Impossible de libérer le verrou.',
    )
    expect(erreurGlobale.value).toBe(message)
  })

  it('n’efface pas une erreur plus récente à la réussite suivante', () => {
    const fermeture = afficherErreurGlobale('Échec de fermeture.')
    afficherErreurGlobale('Une autre erreur est survenue.')

    effacerErreurGlobaleSi(fermeture)

    expect(erreurGlobale.value).toBe('Une autre erreur est survenue.')
  })
})
