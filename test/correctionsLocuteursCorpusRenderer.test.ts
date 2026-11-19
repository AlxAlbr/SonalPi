// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { createApp, h, nextTick, ref, type App } from 'vue'
import CorrectionsLocuteursCorpus from '../src/renderer/components/traiter/corpus/CorrectionsLocuteursCorpus.vue'
import { inventaireCorrections, lignesCorrections } from './fixtures/correctionsLocuteursCorpus'
import type { InventaireIdentitesLocuteurs } from '../src/shared/corpus/personnes'

const injection = vi.hoisted(() => ({ contexte: {} as Record<string, unknown> }))
vi.mock('../src/renderer/composables/sonal', () => ({ utiliserSonal: () => injection.contexte }))
const apps: App[] = []
afterEach(() => { apps.splice(0).forEach((a) => a.unmount()); document.body.replaceChildren(); vi.restoreAllMocks() })
async function attendre() { for (let i = 0; i < 5; i++) await nextTick() }
function bouton(host: HTMLElement, texte: string) {
  const resultat = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === texte)
  if (!resultat) throw new Error(`Bouton absent : ${texte}`)
  return resultat
}
function remplir(host: HTMLElement, texte: string) {
  const input = host.querySelector<HTMLInputElement>('input[type=text]')!
  input.value = texte; input.dispatchEvent(new Event('input', { bubbles: true }))
}
function cocher(host: HTMLElement, selecteur: string) {
  const input = host.querySelector<HTMLInputElement>(selecteur)!
  input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true }))
}
async function monter(options: { nombre?: number; inventaire?: InventaireIdentitesLocuteurs; lire?: ReturnType<typeof vi.fn>; corriger?: ReturnType<typeof vi.fn> } = {}) {
  const inventaire = options.inventaire ?? inventaireCorrections()
  const selection = ref(lignesCorrections(inventaire).slice(0, options.nombre ?? 1))
  const lire = options.lire ?? vi.fn(async () => structuredClone(inventaire))
  const corriger = options.corriger ?? vi.fn(async () => 'p1')
  const lectureSeule = ref(false), distant = ref<string | null>(null), indisponible = ref(false)
  const termine = vi.fn(), ouvrir = vi.fn()
  injection.contexte = { lirePersonnes: lire, corrigerLocuteurs: corriger, lectureSeule, idDistantCourant: distant }
  const host = document.body.appendChild(document.createElement('div'))
  const app = createApp({ render: () => h(CorrectionsLocuteursCorpus, { selection: selection.value, indisponible: indisponible.value,
    onTermine: termine, onOuvrir: ouvrir }) })
  apps.push(app); app.mount(host); await attendre()
  return { host, selection, lire, corriger, lectureSeule, distant, indisponible, termine, ouvrir, app }
}

test('renommage : aperçu frais, entretiens masqués inclus, annulation par Échap et retour du focus', async () => {
  const b = await monter()
  const ouvrir = bouton(b.host, 'Renommer…'); ouvrir.focus(); ouvrir.click(); await attendre()
  expect(b.lire).toHaveBeenCalledOnce()
  expect(b.host.querySelector('dialog')?.textContent).toContain('Entretien B masqué')
  expect(document.activeElement).toBe(bouton(b.host, 'Annuler'))
  b.host.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }))
  await attendre()
  expect(b.host.querySelector('dialog')).toBeNull()
  expect(b.corriger).not.toHaveBeenCalled()
  expect(document.activeElement).toBe(ouvrir)
})

test('renommage : une seule commande, nom validé, références locales contextualisées pour la nouvelle sélection', async () => {
  let terminer!: () => void
  const corriger = vi.fn(() => new Promise<void>((resolve) => { terminer = resolve }))
  const b = await monter({ corriger })
  bouton(b.host, 'Renommer…').click(); await attendre()
  remplir(b.host, '  Nouveau nom  '); await attendre()
  const confirmer = bouton(b.host, 'Renommer dans tous les entretiens')
  confirmer.click(); confirmer.click(); await attendre()
  expect(corriger).toHaveBeenCalledExactlyOnceWith({ type: 'renommerGlobal', locuteurId: 'p1', nom: 'Nouveau nom', attendu: JSON.stringify(inventaireCorrections()) })
  b.host.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }))
  await attendre()
  expect(b.host.querySelector('dialog')).not.toBeNull()
  terminer(); await attendre()
  expect(b.host.querySelector('dialog')).toBeNull()
  expect(b.termine).toHaveBeenCalledExactlyOnceWith([{ entretienId: 'A', participationId: 'local' }, { entretienId: 'B', participationId: 'local' }])
  expect(b.host.querySelector('[role=status]')?.textContent).toContain('modifié dans tous les entretiens')
})

test.each(['conserver', 'uniformiser'])('regroupement de trois identités : choix explicite des noms (%s), puis commande unique', async (choix) => {
  const b = await monter({ nombre: 3 })
  bouton(b.host, 'C’est le même locuteur…').click(); await attendre()
  const confirmer = bouton(b.host, 'Réunir les locuteurs')
  expect(confirmer.disabled).toBe(true)
  remplir(b.host, 'Nom commun')
  cocher(b.host, `input[value=${choix}]`); await attendre()
  expect(confirmer.disabled).toBe(false)
  confirmer.click(); await attendre()
  expect(b.corriger).toHaveBeenCalledExactlyOnceWith({ type: 'regrouperSelection', attendu: JSON.stringify(inventaireCorrections()),
    locuteurIds: ['p1', 'p2', 'p3'], conserverId: 'p1', nom: 'Nom commun', uniformiserNoms: choix === 'uniformiser' })
  expect(b.termine.mock.calls[0][0]).toHaveLength(4)
})

test('regroupement incompatible : aucune écriture, accès proposé à l’entretien en conflit', async () => {
  const inventaire = inventaireCorrections()
  Object.assign(inventaire.participations[2], { entretienId: 'A', entretienTitre: 'Entretien A', index: 1 })
  const b = await monter({ inventaire, nombre: 2 })
  bouton(b.host, 'C’est le même locuteur…').click(); await attendre()
  cocher(b.host, 'input[value=conserver]'); await attendre()
  expect(bouton(b.host, 'Réunir les locuteurs').disabled).toBe(true)
  expect(b.host.querySelector('[role=alert]')?.textContent).toContain('même entretien')
  bouton(b.host, 'Ouvrir Entretien A').click(); await attendre()
  expect(b.ouvrir).toHaveBeenCalledExactlyOnceWith('A')
  expect(b.corriger).not.toHaveBeenCalled()
})

test('dissociation : chaque référence cochée reste locale, sans nouveau nom et sans pouvoir tout retirer', async () => {
  const b = await monter()
  bouton(b.host, 'Dissocier…').click(); await attendre()
  expect(b.host.querySelector('input[type=text]')).toBeNull()
  const confirmer = bouton(b.host, 'Dissocier les entretiens cochés')
  expect(confirmer.disabled).toBe(true)
  const cases = [...b.host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')]
  for (const input of cases) {
    input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); await attendre()
  }
  await attendre()
  expect(confirmer.disabled).toBe(true)
  expect(b.host.querySelector('[role=alert]')?.textContent).toContain('Laissez au moins un entretien')
  cases[0].checked = false; cases[0].dispatchEvent(new Event('change', { bubbles: true })); await attendre()
  confirmer.click(); await attendre()
  expect(b.corriger).toHaveBeenCalledExactlyOnceWith({ type: 'dissocierSelection', locuteurId: 'p1', attendu: JSON.stringify(inventaireCorrections()),
    participations: [{ entretienId: 'B', participationId: 'local' }] })
})

test('un aperçu devenu périmé bloque les nouvelles tentatives jusqu’à sa fermeture', async () => {
  const corriger = vi.fn().mockRejectedValue(new Error('Les données ont changé'))
  const b = await monter({ corriger })
  bouton(b.host, 'Renommer…').click(); await attendre()
  bouton(b.host, 'Renommer dans tous les entretiens').click(); await attendre()
  expect(b.host.querySelector('dialog [role=alert]')?.textContent).toContain('ont changé')
  expect(bouton(b.host, 'Renommer dans tous les entretiens').disabled).toBe(true)
  b.host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); await attendre()
  expect(corriger).toHaveBeenCalledOnce()
  expect(b.termine).not.toHaveBeenCalled()
})

test('une nouvelle sélection invalide une ancienne réponse de préparation', async () => {
  let terminer!: (v: InventaireIdentitesLocuteurs) => void
  const b = await monter({ lire: vi.fn(() => new Promise((resolve) => { terminer = resolve })) })
  bouton(b.host, 'Renommer…').click(); await attendre()
  b.selection.value = lignesCorrections(inventaireCorrections()).slice(1, 2); await attendre()
  terminer(inventaireCorrections()); await attendre()
  expect(b.host.querySelector('dialog')).toBeNull()
  expect(b.corriger).not.toHaveBeenCalled()
})

test('les restrictions de lecture, de distant et de sources indisponibles ne sont pas contournées', async () => {
  const b = await monter()
  for (const [bloquer, debloquer] of [
    [() => { b.lectureSeule.value = true }, () => { b.lectureSeule.value = false }],
    [() => { b.distant.value = 'gitlab' }, () => { b.distant.value = null }],
    [() => { b.indisponible.value = true }, () => { b.indisponible.value = false }],
  ]) {
    bloquer(); await attendre()
    expect(bouton(b.host, 'Renommer…').disabled).toBe(true)
    bouton(b.host, 'Renommer…').click(); await attendre()
    debloquer()
  }
  expect(b.lire).not.toHaveBeenCalled()
  expect(b.corriger).not.toHaveBeenCalled()
})

test('les participations sans association ne sont pas silencieusement transformées', async () => {
  const b = await monter()
  b.selection.value[0].locuteurId = null; await attendre()
  expect(bouton(b.host, 'Renommer…').disabled).toBe(true)
  bouton(b.host, 'Ouvrir l’entretien').click()
  expect(b.ouvrir).toHaveBeenCalledExactlyOnceWith('A')
  expect(b.lire).not.toHaveBeenCalled()
})

test('régularisation explicite : aucune création dans l’aperçu, seule la voix sans identité est corrigée', async () => {
  const inventaire = inventaireCorrections(); inventaire.participations[2].locuteurRef = null
  const b = await monter({ inventaire })
  b.selection.value = [b.selection.value[0], { cle: 'solo', nom: 'Bob local', locuteurId: null, participations: [{ entretienId: 'C', entretienTitre: 'Entretien C', participationId: 'local', nom: 'Bob local' }], mots: 0, interventions: 0 }]
  await attendre()
  expect(b.corriger).not.toHaveBeenCalled()
  bouton(b.host, 'Conserver séparément…').click(); await attendre()
  expect(b.corriger).not.toHaveBeenCalled()
  expect(b.host.querySelector('input[type=text]')).toBeNull()
  bouton(b.host, 'Conserver séparément').click(); await attendre()
  expect(b.corriger).toHaveBeenCalledExactlyOnceWith({ type: 'individualiserSelection', participations: [{ entretienId: 'C', participationId: 'local' }], attendu: JSON.stringify(inventaire) })
  expect(b.termine.mock.calls[0][0]).toHaveLength(3)
})

test('une source devenue indisponible pendant la préparation ne produit pas de confirmation', async () => {
  const inventaire = inventaireCorrections()
  inventaire.indisponibles.push({ id: 'inaccessible', titre: 'Inaccessible', raison: 'Absent' })
  const b = await monter({ inventaire })
  bouton(b.host, 'Renommer…').click(); await attendre()
  expect(b.host.querySelector('[role=alert]')?.textContent).toContain('indisponibles')
  expect(b.host.querySelector('dialog')).toBeNull()
})

test('une réponse de correction après démontage ne sélectionne pas les locuteurs du prochain corpus', async () => {
  let terminer!: () => void
  const b = await monter({ corriger: vi.fn(() => new Promise<void>((resolve) => { terminer = resolve })) })
  bouton(b.host, 'Renommer…').click(); await attendre()
  bouton(b.host, 'Renommer dans tous les entretiens').click(); await attendre()
  b.app.unmount(); apps.splice(apps.indexOf(b.app), 1)
  terminer(); await attendre()
  expect(b.termine).not.toHaveBeenCalled()
})
