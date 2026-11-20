import { afterEach, expect, test, vi } from 'vitest'
import { useCorpus } from '../src/renderer/composables/useCorpus'
import type { CommandeCorrectionLocuteurs } from '../src/shared/corpus/contratsLocuteurs'

const commande: CommandeCorrectionLocuteurs = { type: 'renommerGlobal', locuteurId: 'p', nom: 'Nom validé', attendu: '{}' }
afterEach(() => vi.unstubAllGlobals())
function banc(corriger = vi.fn().mockResolvedValue('p'), flush = vi.fn(async () => {})) {
  vi.stubGlobal('window', { sonal: { corpus: { corrigerLocuteurs: corriger } } })
  let revision = 1
  const corpus = useCorpus({ flush, revision: () => revision })
  corpus.matrice.value = [{ entretienId: 'e', titre: 'Ancien nom', valeursGen: {}, participations: [] }]
  corpus.matriceChargee.value = true
  return { corpus, corriger, flush, changer: () => { revision++ } }
}

test('la correction attend la sauvegarde puis invalide répertoire, analyses dépendantes et matrice', async () => {
  const b = banc()
  expect(await b.corpus.corrigerLocuteurs(commande)).toBe('p')
  expect(b.flush).toHaveBeenCalledOnce()
  expect(b.corriger).toHaveBeenCalledExactlyOnceWith(commande)
  expect(b.flush.mock.invocationCallOrder[0]).toBeLessThan(b.corriger.mock.invocationCallOrder[0])
  expect(b.corpus.revisionPersonnesCorpus.value).toBe(1)
  expect(b.corpus.matriceChargee.value).toBe(false)
  expect(b.corpus.matrice.value).toEqual([])
})

test.each(['sauvegarde', 'commande'])('un échec de %s ne présente pas des projections actualisées', async (phase) => {
  const corriger = vi.fn().mockResolvedValue('p'), flush = vi.fn(async () => {})
  if (phase === 'sauvegarde') flush.mockRejectedValue(new Error('Sauvegarde refusée'))
  else corriger.mockRejectedValue(new Error('Aperçu périmé'))
  const b = banc(corriger, flush)
  await expect(b.corpus.corrigerLocuteurs(commande)).rejects.toThrow()
  if (phase === 'sauvegarde') expect(corriger).not.toHaveBeenCalled()
  expect(b.corpus.revisionPersonnesCorpus.value).toBe(0)
  expect(b.corpus.matriceChargee.value).toBe(true)
  expect(b.corpus.matrice.value[0].titre).toBe('Ancien nom')
})

test('changer de corpus pendant la sauvegarde empêche le départ de la commande', async () => {
  let terminer!: () => void
  const b = banc(vi.fn(), vi.fn(() => new Promise<void>((resolve) => { terminer = resolve })))
  const travail = b.corpus.corrigerLocuteurs(commande)
  b.changer(); terminer()
  await expect(travail).rejects.toThrow('Le corpus a changé')
  expect(b.corriger).not.toHaveBeenCalled()
})

test('la réponse tardive d’une ancienne correction n’invalide pas les projections du nouveau corpus', async () => {
  let terminer!: (id: string) => void
  const b = banc(vi.fn(() => new Promise<string>((resolve) => { terminer = resolve })))
  const travail = b.corpus.corrigerLocuteurs(commande)
  await Promise.resolve()
  expect(b.corriger).toHaveBeenCalledOnce()
  b.changer(); terminer('p')
  await travail
  expect(b.corpus.revisionPersonnesCorpus.value).toBe(0)
  expect(b.corpus.matriceChargee.value).toBe(true)
})
