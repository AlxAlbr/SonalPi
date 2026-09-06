import { afterEach, describe, expect, test, vi } from 'vitest'
import type { EtatSessionPublic } from '../src/shared/distant'
import {
  appliquerStatutSession,
  choisirSrtAvantMutation,
  preparerFermetureEntretien,
} from '../src/renderer/couturesApplication'

afterEach(() => {
  vi.useRealTimers()
})

describe('rétrogradation visible du renderer', () => {
  test('fige l’éditeur, annule le debounce et reste dégradée jusqu’à acquittement', async () => {
    vi.useFakeTimers()
    let statut: EtatSessionPublic = { etat: 'a-nous', dernierPubli: null, sale: true }
    let editable = true
    const ecrire = vi.fn()
    let debounce: ReturnType<typeof setTimeout> | undefined = setTimeout(ecrire, 600)
    const annulerSauvegarde = vi.fn(async () => {
      clearTimeout(debounce)
      debounce = undefined
    })

    appliquerStatutSession(statut, { etat: 'degrade' }, {
      definirStatut: (nouveau) => { statut = nouveau },
      rendreEditeurNonModifiable: () => { editable = false },
      annulerSauvegarde,
    })

    expect(statut).toEqual({ etat: 'degrade' })
    expect(editable).toBe(false)
    expect(annulerSauvegarde).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(ecrire).not.toHaveBeenCalled()

    appliquerStatutSession(statut, { etat: 'a-nous', dernierPubli: null, sale: false }, {
      definirStatut: (nouveau) => { statut = nouveau },
      rendreEditeurNonModifiable: () => { editable = false },
      annulerSauvegarde,
    })
    expect(statut).toEqual({ etat: 'degrade' })
    expect(annulerSauvegarde).toHaveBeenCalledOnce()

    appliquerStatutSession(statut, { etat: 'aucune' }, {
      definirStatut: (nouveau) => { statut = nouveau },
      rendreEditeurNonModifiable: () => { editable = false },
      annulerSauvegarde,
    })
    expect(statut).toEqual({ etat: 'aucune' })
  })

  test('ferme une session dégradée sans amorcer de nouvel autosave', async () => {
    const annuler = vi.fn(async () => {})
    const vider = vi.fn(async () => {})

    await preparerFermetureEntretien({
      distant: true,
      degrade: true,
      lectureSeule: false,
      verrouAutrui: false,
      annulerSauvegarde: annuler,
      viderSauvegarde: vider,
    })

    expect(annuler).toHaveBeenCalledOnce()
    expect(vider).not.toHaveBeenCalled()
  })
})

describe('sélection d’une transcription SRT', () => {
  test('une annulation du sélecteur ne lance aucune IPC mutante', async () => {
    const choisir = vi.fn(async () => null)
    const remplacerTranscription = vi.fn(async () => {})

    await expect(choisirSrtAvantMutation(choisir, remplacerTranscription))
      .resolves.toBe(false)

    expect(choisir).toHaveBeenCalledOnce()
    expect(remplacerTranscription).not.toHaveBeenCalled()
  })

  test('la mutation ne commence qu’après le choix du fichier', async () => {
    const trace: string[] = []
    const fichier = { nom: 'entretien.srt', contenu: 'SRT' }

    await expect(choisirSrtAvantMutation(
      async () => { trace.push('dialogue'); return fichier },
      async (selection) => {
        trace.push(`mutation:${selection.nom}`)
      },
    )).resolves.toBe(true)

    expect(trace).toEqual(['dialogue', 'mutation:entretien.srt'])
  })
})
