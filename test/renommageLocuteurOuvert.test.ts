import { afterEach, expect, test, vi } from 'vitest'
import { ref } from 'vue'
import type { EntretienFichier, ParticipationLocuteur, PayloadEntretien } from '../src/shared/format'
import { useRenommageLocuteurOuvert } from '../src/renderer/composables/entretien/useRenommageLocuteurOuvert'
import { verifierRelectureRenommage } from '../src/shared/entretien/renommageGlobal'

afterEach(() => vi.unstubAllGlobals())
function banc() {
  const participations = ref<ParticipationLocuteur[]>([{ id: 'local', index: 7, nom: 'Nom local', locuteurRef: 'p', valeursLoc: {} }])
  const ouvertId = ref<string | null>('A'), local = ref(true)
  const avant: PayloadEntretien = { corpsTexte: { type: 'doc', content: [] }, annotations: [], ancres: [],
    participations: structuredClone(participations.value.map((p) => ({ ...p, valeursLoc: {} }))), meta: { valeursGen: {}, audioRef: null } }
  const apres: EntretienFichier = { ...structuredClone(avant), formatVersion: 10, lastModified: '2026-01-01T00:00:00Z' }
  apres.participations[0].nom = 'Nouveau nom'
  const inventaire = { locuteurs: [{ id: 'p', nom: 'Nom commun' }], participations: [
    { ...avant.participations[0], participationId: 'local', entretienId: 'A', entretienTitre: 'Courant', interviewer: false },
    { ...avant.participations[0], participationId: 'local', entretienId: 'B', entretienTitre: 'Autre entretien', interviewer: false },
  ], notes: [], indisponibles: [] }
  const lire = vi.fn().mockResolvedValue(inventaire), renommer = vi.fn().mockResolvedValue(apres)
  const rouvrir = vi.fn().mockResolvedValue({ ok: true, acces: 'edition', data: apres })
  vi.stubGlobal('window', { sonal: { corpus: { personnesInventaire: lire, renommerLocuteurDepuisEntretien: renommer, ouvrirEntretienPourEdition: rouvrir } } })
  const sauver = vi.fn(async () => {}), suspendre = vi.fn(async () => structuredClone(avant)), terminer = vi.fn(), rafraichir = vi.fn()
  const appliquer = vi.fn((initial: PayloadEntretien, fichier: EntretienFichier, id: string) => {
    verifierRelectureRenommage(initial, fichier, id)
    participations.value[0].nom = fichier.participations[0].nom
  })
  const outils = useRenommageLocuteurOuvert({ participations, ouvertId, disponible: () => local.value,
    sauver, suspendre, appliquer, terminer, apresCorrection: rafraichir })
  return { outils, participations, ouvertId, local, avant, apres, inventaire, lire, renommer, rouvrir, sauver, suspendre, appliquer, terminer, rafraichir }
}
const reference = { entretienId: 'A', participationId: 'local' }

test('préparer et annuler ne renomment pas le modèle ; les autres entretiens sont montrés', async () => {
  const b = banc()
  await b.outils.preparer(reference, 'Nouveau nom')
  expect(b.sauver).toHaveBeenCalledOnce()
  expect(b.participations.value[0].nom).toBe('Nom local')
  expect(b.outils.demande.value?.apercu?.participations.map((p) => p.entretienId)).toEqual(['A', 'B'])
  b.outils.annuler()
  expect(b.outils.demande.value).toBeNull()
  expect(b.renommer).not.toHaveBeenCalled()
  expect(b.suspendre).not.toHaveBeenCalled()
})

test('la sauvegarde est suspendue avant l’envoi, les noms sont appliqués avant la reprise et les projections invalidées', async () => {
  const b = banc()
  await b.outils.preparer(reference, '  Nouveau nom  ')
  await b.outils.confirmer()
  expect(b.renommer).toHaveBeenCalledExactlyOnceWith(reference, { type: 'renommerGlobal', locuteurId: 'p', nom: 'Nouveau nom', attendu: JSON.stringify(b.inventaire) })
  expect(() => structuredClone(b.renommer.mock.calls[0])).not.toThrow()
  expect(b.suspendre.mock.invocationCallOrder[0]).toBeLessThan(b.renommer.mock.invocationCallOrder[0])
  expect(b.appliquer.mock.invocationCallOrder[0]).toBeLessThan(b.terminer.mock.invocationCallOrder[0])
  expect(b.participations.value[0].nom).toBe('Nouveau nom')
  expect(b.rafraichir).toHaveBeenCalledOnce()
  expect(b.outils.demande.value).toBeNull()
})

test('une réponse perdue ne rejoue pas la commande et relit les noms avant de reprendre', async () => {
  const b = banc()
  b.renommer.mockRejectedValue(new Error('Réponse perdue'))
  await b.outils.preparer(reference, 'Nouveau nom')
  await b.outils.confirmer()
  expect(b.renommer).toHaveBeenCalledOnce()
  expect(b.rouvrir).toHaveBeenCalledExactlyOnceWith('A')
  expect(b.participations.value[0].nom).toBe('Nouveau nom')
  expect(b.outils.erreur.value).toContain('Réponse perdue')
  expect(b.outils.demande.value).not.toBeNull()
  await b.outils.confirmer()
  expect(b.renommer).toHaveBeenCalledOnce()
})

test('un refus avant transaction restaure les noms réellement enregistrés sans toucher le texte', async () => {
  const b = banc()
  b.renommer.mockRejectedValue(new Error('Aperçu périmé'))
  b.rouvrir.mockResolvedValue({ ok: true, acces: 'edition', data: { ...b.apres, participations: b.avant.participations } })
  await b.outils.preparer(reference, 'Nouveau nom')
  await b.outils.confirmer()
  expect(b.participations.value[0].nom).toBe('Nom local')
  expect(b.outils.erreur.value).toContain('Aperçu périmé')
})

test.each(['contenu', 'journal'])('une relecture incertaine (%s) ne réinstalle pas un ancien contenu', async (cas) => {
  const b = banc()
  b.renommer.mockRejectedValue(new Error('Écriture interrompue'))
  if (cas === 'contenu') b.apres.corpsTexte = { type: 'doc', content: [{ type: 'paragraph' }] }
  else b.rouvrir.mockRejectedValue(new Error('Transaction à reprendre'))
  await b.outils.preparer(reference, 'Nouveau nom')
  await b.outils.confirmer()
  expect(b.outils.erreur.value).toContain('Rouvrez le corpus')
  expect(b.participations.value[0].nom).toBe('Nom local')
  expect(b.rafraichir).not.toHaveBeenCalled()
})

test('ni une destination distante ni une participation sans association ne déclenchent ce parcours', async () => {
  const b = banc()
  b.local.value = false
  await b.outils.preparer(reference)
  b.local.value = true; b.participations.value[0].locuteurRef = null
  await b.outils.preparer(reference)
  expect(b.lire).not.toHaveBeenCalled()
  expect(b.renommer).not.toHaveBeenCalled()
})

test('une ancienne préparation annulée ne rouvre pas sa fenêtre', async () => {
  const b = banc()
  let terminer!: (v: typeof b.inventaire) => void
  b.lire.mockImplementation(() => new Promise((resolve) => { terminer = resolve }))
  const travail = b.outils.preparer(reference)
  await Promise.resolve()
  b.outils.annuler()
  terminer(b.inventaire); await travail
  expect(b.outils.demande.value).toBeNull()
})

test('un changement de session pendant l’envoi écarte la réponse et ne modifie pas le nouvel entretien', async () => {
  const b = banc()
  let terminer!: (v: EntretienFichier) => void
  b.renommer.mockImplementation(() => new Promise((resolve) => { terminer = resolve }))
  await b.outils.preparer(reference, 'Nouveau nom')
  const travail = b.outils.confirmer()
  await Promise.resolve()
  b.outils.reinitialiser(); b.ouvertId.value = 'B'
  terminer(b.apres); await travail
  expect(b.appliquer).not.toHaveBeenCalled()
  expect(b.terminer).not.toHaveBeenCalled()
})
