// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { createApp, h, nextTick, ref, type App } from 'vue'
import DetailsLocuteursCorpus from '../src/renderer/components/traiter/corpus/DetailsLocuteursCorpus.vue'
import type { InventaireIdentitesLocuteurs } from '../src/shared/corpus/personnes'
import { inventaireCorrections, lignesCorrections } from './fixtures/correctionsLocuteursCorpus'

const injection = vi.hoisted(() => ({ contexte: {} as Record<string, unknown> }))
vi.mock('../src/renderer/composables/sonal', () => ({ utiliserSonal: () => injection.contexte }))
const apps: App[] = []
afterEach(() => { apps.splice(0).forEach((a) => a.unmount()); document.body.replaceChildren(); vi.restoreAllMocks() })
async function attendre() { for (let i = 0; i < 8; i++) await nextTick() }
function bouton(host: HTMLElement, texte: string) {
  const b = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === texte)
  if (!b) throw new Error(`Bouton absent : ${texte}`)
  return b
}
function fixture() {
  const inv = inventaireCorrections()
  inv.locuteurs.push({ id: 'vide', nom: 'Sans entretien' })
  inv.participations[0].pseudo = 'Pseudonyme conservé'
  inv.notes = ['A', 'B', 'C'].map((entretienId) => ({ entretienId, entretienTitre: `Entretien ${entretienId}`, id: 'note', categorieId: 'cat', titre: `Note ${entretienId}`,
    corps: `Texte <em>${entretienId}</em>`, date: null, statut: 'prive' as const, rang: 0, participationIds: ['local'] }))
  return inv
}
async function monter(options: { inventaire?: InventaireIdentitesLocuteurs; lire?: () => Promise<InventaireIdentitesLocuteurs>; corriger?: (...args: unknown[]) => Promise<unknown> } = {}) {
  const inv = options.inventaire ?? fixture(), lire = vi.fn(options.lire ?? (async () => structuredClone(inv)))
  const corriger = vi.fn(options.corriger ?? (async () => 'vide'))
  const dossier = ref('/corpus'), vue = ref('corpus'), actif = ref(true), distant = ref<string | null>(null), lectureSeule = ref(false), revision = ref(0)
  const allerNotes = vi.fn(async () => {}), allerLocuteurs = vi.fn(async () => {}), termine = vi.fn(), selectionner = vi.fn()
  const dernierTirage = ref<string | null>(null), correctionsDistantes = ref(false)
  const lireDetailsLocuteurs = async () => ({ inventaire: await lire(), variables: [{ id: 'v', lib: 'Donnée conservée', portee: 'participation', priv: false, ordre: 0, vExport: 1, modalites: [{ id: 'm', lib: 'Valeur conservée', mExport: 1 }] }], categories: [{ id: 'cat', nom: 'Catégorie', couleur: '#123456' }] })
  injection.contexte = { lireDetailsLocuteurs, corrigerLocuteurs: corriger, dossierCourantDir: dossier, vue, idDistantCourant: distant, lectureSeule,
    gesteDisponible: () => !distant.value || correctionsDistantes.value,
    suiviLocuteurs: ref(null), erreurSuiviLocuteurs: ref(''), suiviLocuteursCharge: ref(true),
    revisionPersonnesCorpus: revision, dernierTirage, variables: ref([{ id: 'v', lib: 'Donnée conservée', modalites: [{ id: 'm', lib: 'Valeur conservée' }] }]),
    nomCategorieNote: () => 'Catégorie', allerNotes, allerLocuteurs }
  const host = document.body.appendChild(document.createElement('div'))
  const app = createApp({ render: () => h(DetailsLocuteursCorpus, { actif: actif.value, selection: lignesCorrections(inv).slice(0, 1), onTermine: termine, onSelectionner: selectionner }) })
  apps.push(app); app.mount(host); await attendre()
  return { host, app, inv, lire, corriger, dossier, vue, actif, distant, lectureSeule, revision, dernierTirage, correctionsDistantes, allerNotes, allerLocuteurs, termine, selectionner }
}

test('affiche notes et données locales sans mélange entre ids locaux identiques ni écriture', async () => {
  const b = await monter(), notes = b.host.querySelector('[aria-label="Notes liées à la sélection"]')!
  expect(notes.textContent).toContain('Note A'); expect(notes.textContent).toContain('Note B'); expect(notes.textContent).not.toContain('Note C')
  expect(notes.querySelector('em')).toBeNull()
  expect(b.host.textContent).toContain('Donnée conservée'); expect(b.host.textContent).toContain('Valeur conservée')
  expect(b.host.textContent).toContain('Pseudonyme conservé')
  bouton(b.host, 'Ouvrir les notes de Entretien B').click(); await attendre()
  expect(b.allerNotes).toHaveBeenCalledExactlyOnceWith('B')
  bouton(b.host, 'Ouvrir les locuteurs de Entretien A').click(); await attendre()
  expect(b.allerLocuteurs).toHaveBeenCalledExactlyOnceWith('A')
  expect(b.corriger).not.toHaveBeenCalled()
  expect(b.host.querySelector('.personnes-corpus')).toBeNull()
})

test('suppression : aperçu frais, focus sur Annuler et Échap sans écriture', async () => {
  const b = await monter(), ouvrir = bouton(b.host, 'Supprimer ce locuteur…')
  ouvrir.focus(); ouvrir.click(); await attendre()
  expect(b.lire).toHaveBeenCalledTimes(2)
  expect(b.host.querySelector('dialog')?.textContent).toContain('Sans entretien')
  expect(document.activeElement).toBe(bouton(b.host, 'Annuler'))
  b.host.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true })); await attendre()
  expect(b.host.querySelector('dialog')).toBeNull()
  expect(document.activeElement).toBe(ouvrir)
  expect(b.corriger).not.toHaveBeenCalled()
})

test('une seule écriture ; le dialogue ne se ferme pas pendant l’enregistrement', async () => {
  let finir!: () => void
  const corriger = vi.fn(() => new Promise<void>((r) => { finir = r })), b = await monter({ corriger })
  bouton(b.host, 'Supprimer ce locuteur…').click(); await attendre()
  const valider = bouton(b.host, 'Supprimer ce locuteur'); valider.click(); valider.click(); await attendre()
  expect(corriger).toHaveBeenCalledExactlyOnceWith({ type: 'supprimerVide', locuteurId: 'vide', attendu: JSON.stringify(b.inv) })
  b.host.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true })); await attendre()
  expect(b.host.querySelector('dialog')).not.toBeNull()
  finir(); await attendre()
  expect(b.host.querySelector('dialog')).toBeNull()
  expect(b.termine).toHaveBeenCalledExactlyOnceWith([{ entretienId: 'A', participationId: 'local' }, { entretienId: 'B', participationId: 'local' }])
})

test('comparer sélectionne des références contextualisées ; garder distincts exige une confirmation', async () => {
  const inv = fixture(); inv.participations.forEach((p) => { p.nom = 'Enquêteur' })
  const b = await monter({ inventaire: inv })
  bouton(b.host, 'Comparer ces locuteurs').click(); await attendre()
  expect(b.selectionner.mock.calls[0][0]).toEqual(expect.arrayContaining([{ entretienId: 'A', participationId: 'local' }, { entretienId: 'B', participationId: 'local' }, { entretienId: 'C', participationId: 'local' }]))
  expect(b.corriger).not.toHaveBeenCalled()
  bouton(b.host, 'Garder distincts…').click(); await attendre(); bouton(b.host, 'Garder distincts').click(); await attendre()
  expect(b.corriger.mock.calls[0][0]).toMatchObject({ type: 'ecarterRapprochement', reference: { entretienId: 'A', participationId: 'local' }, cible: { entretienId: 'C', participationId: 'local' } })
  expect(() => structuredClone(b.corriger.mock.calls[0][0])).not.toThrow()
})

test('une distinction réciproque est présentée une fois et son réexamen ne promet pas une fusion', async () => {
  const inv = fixture(); inv.participations[0].rapprochementsRefuses = [{ type: 'locuteur', locuteurId: 'p2' }]; inv.participations[2].rapprochementsRefuses = [{ type: 'locuteur', locuteurId: 'p1' }]
  const b = await monter({ inventaire: inv })
  expect(b.host.querySelectorAll('button').length).toBeGreaterThan(0)
  expect([...b.host.querySelectorAll('button')].filter((b) => b.textContent === 'Réexaminer cette distinction…')).toHaveLength(1)
  bouton(b.host, 'Réexaminer cette distinction…').click(); await attendre()
  expect(b.host.querySelector('dialog')?.textContent).toContain('aucun regroupement')
  bouton(b.host, 'Réexaminer la distinction').click(); await attendre()
  expect(b.corriger.mock.calls[0][0]).toMatchObject({ type: 'retablirRapprochement', reference: { entretienId: 'A', participationId: 'local' }, cible: { type: 'locuteur', locuteurId: 'p2' } })
})

test.each(['lecture seule', 'incomplet', 'distant'] as const)('%s : consultation possible sans correction', async (cas) => {
  const inv = fixture(); if (cas === 'incomplet') inv.indisponibles.push({ id: 'absent', titre: 'Absent', raison: 'Absent' })
  const b = await monter({ inventaire: inv })
  if (cas === 'lecture seule') b.lectureSeule.value = true
  if (cas === 'distant') b.distant.value = 'nextcloud'
  await attendre()
  expect(bouton(b.host, 'Supprimer ce locuteur…').disabled).toBe(true)
  expect(b.host.textContent).toContain('Pseudonyme conservé')
  expect(b.host.textContent).toContain('Note A')
  expect(b.corriger).not.toHaveBeenCalled()
})

test.each(['gitlab', 'nextcloud'])('%s : les détails restent contextualisés et se relisent après synchronisation', async (fournisseur) => {
  const b = await monter()
  b.distant.value = fournisseur; await attendre()
  expect(b.host.textContent).toContain('Note A'); expect(b.host.textContent).toContain('Note B')
  expect(b.host.textContent).not.toContain('Note C')
  expect(b.host.textContent).toContain('Donnée conservée')
  expect(bouton(b.host, 'Supprimer ce locuteur…').disabled).toBe(true)
  const lectures = b.lire.mock.calls.length
  b.inv.participations[0].pseudo = 'Pseudo publié'
  b.dernierTirage.value = '2026-11-20T09:00:00.000Z'; await attendre()
  expect(b.lire.mock.calls.length).toBeGreaterThan(lectures)
  expect(b.host.textContent).toContain('Pseudo publié')
  bouton(b.host, 'Ouvrir les notes de Entretien A').click(); await attendre()
  expect(b.allerNotes).toHaveBeenCalledExactlyOnceWith('A')
  expect(b.corriger).not.toHaveBeenCalled()
})

test('un changement depuis la liste empêche l’ouverture de la confirmation', async () => {
  const inv = fixture(), frais = structuredClone(inv); frais.locuteurs[3].nom = 'Nom changé'
  const lire = vi.fn().mockResolvedValueOnce(inv).mockResolvedValue(frais), b = await monter({ lire })
  bouton(b.host, 'Supprimer ce locuteur…').click(); await attendre()
  expect(b.host.querySelector('dialog')).toBeNull()
  expect(b.host.querySelector('[role=alert]')?.textContent).toContain('La liste a changé')
  expect(b.corriger).not.toHaveBeenCalled()
})

test('une réponse de préparation annulée ne rouvre pas le dialogue', async () => {
  const inv = fixture(); let finir!: (v: InventaireIdentitesLocuteurs) => void
  const lire = vi.fn().mockResolvedValueOnce(inv).mockImplementationOnce(() => new Promise((r) => { finir = r })), b = await monter({ lire })
  bouton(b.host, 'Supprimer ce locuteur…').click(); await attendre()
  bouton(b.host, 'Annuler la préparation').click(); finir(inv); await attendre()
  expect(b.host.querySelector('dialog')).toBeNull(); expect(b.corriger).not.toHaveBeenCalled()
})

test('une réponse de correction de l’ancien corpus ne modifie pas la sélection du nouveau', async () => {
  let finir!: () => void
  const b = await monter({ corriger: vi.fn(() => new Promise<void>((r) => { finir = r })) })
  bouton(b.host, 'Supprimer ce locuteur…').click(); await attendre(); bouton(b.host, 'Supprimer ce locuteur').click(); await attendre()
  b.dossier.value = '/autre'; await attendre(); finir(); await attendre()
  expect(b.termine).not.toHaveBeenCalled()
  expect(b.host.querySelector('dialog')).toBeNull()
})

test('la reprise exige une source et capture seulement les champs choisis avant envoi', async () => {
  const b = await monter()
  bouton(b.host, 'Reprendre des informations…').click(); await attendre()
  const valider = bouton(b.host, 'Reprendre les informations')
  expect(valider.disabled).toBe(true)
  const source = b.host.querySelector<HTMLSelectElement>('dialog select')!
  source.value = JSON.stringify(['B', 'local']); source.dispatchEvent(new Event('change', { bubbles: true })); await attendre()
  expect(valider.disabled).toBe(false)
  valider.click(); await attendre()
  expect(b.corriger).toHaveBeenCalledExactlyOnceWith({ type: 'reprendreInformations', reference: { entretienId: 'A', participationId: 'local' }, source: { entretienId: 'B', participationId: 'local' },
    choix: { pseudo: true, interviewer: true, variables: [], remplacer: false }, attendu: JSON.stringify(b.inv) })
  expect(() => structuredClone(b.corriger.mock.calls[0][0])).not.toThrow()
})

test('un refus d’écriture ne ferme pas la confirmation et empêche les répétitions', async () => {
  const b = await monter({ corriger: vi.fn().mockRejectedValue(new Error('Encore utilisé par un cas')) })
  bouton(b.host, 'Supprimer ce locuteur…').click(); await attendre(); bouton(b.host, 'Supprimer ce locuteur').click(); await attendre()
  expect(b.host.querySelector('dialog [role=alert]')?.textContent).toContain('Encore utilisé')
  expect(bouton(b.host, 'Supprimer ce locuteur').disabled).toBe(true)
  expect(b.corriger).toHaveBeenCalledOnce()
})
