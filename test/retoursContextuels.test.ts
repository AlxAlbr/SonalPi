import { describe, expect, test, vi } from 'vitest'
import { useRetoursContextuels } from '../src/renderer/composables/useRetoursContextuels'

function creer(limite = 8) {
  let courant = 'analyse'
  const restaurer = vi.fn(async (contexte: string) => { courant = contexte; return true })
  const erreur = vi.fn()
  const outil = useRetoursContextuels({
    capturer: () => ({ libelle: `Revenir à ${courant}`, contexte: courant }), restaurer, erreur,
  }, limite)
  const consulter = (destination: string) => outil.suivreConsultation(async () => { courant = destination; return true })
  return { outil, consulter, restaurer, erreur, courant: () => courant }
}

describe('retours contextuels', () => {
  test('les consultations imbriquées se dépilent sans créer une boucle', async () => {
    const { outil, consulter, courant } = creer()
    await consulter('source')
    await consulter('cas')
    await consulter('autre source')
    expect(outil.libelleRetourContexte.value).toBe('Revenir à cas')
    await outil.revenirContexte()
    expect(courant()).toBe('cas')
    await outil.revenirContexte()
    expect(courant()).toBe('source')
    await outil.revenirContexte()
    expect(courant()).toBe('analyse')
    expect(outil.libelleRetourContexte.value).toBeNull()
    expect(await outil.revenirContexte()).toBe(false)
  })
  test('un refus de retour conserve la destination pour réessayer', async () => {
    const { outil, consulter, restaurer } = creer()
    await consulter('source')
    restaurer.mockResolvedValueOnce(false)
    expect(await outil.revenirContexte()).toBe(false)
    expect(outil.libelleRetourContexte.value).toBe('Revenir à analyse')
    restaurer.mockRejectedValueOnce(new Error('Sauvegarde refusée'))
    expect(await outil.revenirContexte()).toBe(false)
    expect(outil.libelleRetourContexte.value).toBe('Revenir à analyse')
    expect(await outil.revenirContexte()).toBe(true)
  })
  test('une ouverture refusée ne crée pas de retour', async () => {
    const { outil, erreur } = creer()
    expect(await outil.suivreConsultation(async () => false)).toBe(false)
    expect(outil.libelleRetourContexte.value).toBeNull()
    await outil.suivreConsultation(async () => { throw new Error('Publication refusée') })
    expect(erreur).toHaveBeenCalledOnce()
    expect(outil.libelleRetourContexte.value).toBeNull()
  })
  test('la pile est bornée et une navigation libre la vide', async () => {
    const { outil, consulter } = creer(2)
    await consulter('source')
    await consulter('cas')
    await consulter('recueil')
    await outil.revenirContexte()
    await outil.revenirContexte()
    expect(outil.libelleRetourContexte.value).toBeNull()
    await consulter('ailleurs')
    outil.terminerConsultation()
    expect(outil.libelleRetourContexte.value).toBeNull()
  })
  test('une ouverture en vol ne rétablit pas les retours après un changement de corpus', async () => {
    const { outil } = creer()
    let terminer!: (ouvert: boolean) => void
    const ouverture = outil.suivreConsultation(() => new Promise((resolve) => { terminer = resolve }))
    expect(outil.navigationContexteEnCours.value).toBe(true)
    expect(await outil.suivreConsultation(async () => true)).toBe(false)
    outil.terminerConsultation()
    terminer(true)
    expect(await ouverture).toBe(false)
    expect(outil.libelleRetourContexte.value).toBeNull()
  })
})
