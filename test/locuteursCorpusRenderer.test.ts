// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { createApp, h, nextTick, ref, type App } from 'vue'
import LocuteursCorpus from '../src/renderer/components/traiter/corpus/LocuteursCorpus.vue'
import { selectionnerLocuteurs } from '../src/renderer/composables/corpus/selectionListeLocuteurs'
import type { VueLocuteursCorpus } from '../src/shared/corpus/repertoireLocuteurs'

const injection = vi.hoisted(() => ({ contexte: {} as Record<string, unknown> }))
vi.mock('../src/renderer/composables/sonal', () => ({ utiliserSonal: () => injection.contexte }))
vi.mock('../src/renderer/components/traiter/corpus/SuiviCorrectionsLocuteursCorpus.vue', () => ({ default: { template: '<section class="suivi-corrections-locuteurs"></section>' } }))
vi.mock('../src/renderer/components/traiter/corpus/DetailsLocuteursCorpus.vue', () => ({ default: { emits: ['fermer'], template: '<section class="details-locuteurs"><button @click="$emit(\'fermer\')">Fermer les détails</button></section>' } }))
const apps: App[] = []
afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount())
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function donnees(): VueLocuteursCorpus {
  return {
    locuteurs: [
      { cle: 'a', nom: 'Alice', locuteurId: 'p1', participations: [
        { entretienId: 'A', entretienTitre: 'Entretien A', participationId: 'a1', nom: 'A. Original' },
        { entretienId: 'B', entretienTitre: 'Entretien B', participationId: 'a2', nom: 'Alice' },
      ], mots: 7, interventions: 2 },
      { cle: 'b', nom: 'Bob', locuteurId: null, participations: [{ entretienId: 'B', entretienTitre: 'Entretien B', participationId: 'b', nom: 'Bob' }], mots: 5, interventions: 1 },
      ...['C', 'D'].map((id) => ({ cle: id, nom: 'Jean', locuteurId: null, participations: [{ entretienId: id, entretienTitre: `Entretien ${id}`, participationId: id, nom: 'Jean' }], mots: 2, interventions: 1 })),
    ],
    entretiens: [
      { id: 'A', titre: 'Entretien A', tours: [{ cle: 'a', nom: 'Alice', pos: 1, debut: 0, fin: 100, mots: 3 }] },
      { id: 'B', titre: 'Entretien B', tours: [
        { cle: 'a', nom: 'Alice', pos: 1, debut: 0, fin: 40, mots: 4 },
        { cle: 'b', nom: 'Bob', pos: 10, debut: 40, fin: 100, mots: 5 },
      ] },
      ...['C', 'D'].map((id) => ({ id, titre: `Entretien ${id}`, tours: [{ cle: id, nom: 'Jean', pos: 1, debut: 0, fin: 100, mots: 2 }] })),
    ],
    indisponibles: [],
  }
}

async function monter(options: { actif?: boolean; distant?: boolean; lire?: ReturnType<typeof vi.fn> } = {}) {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  const lire = options.lire ?? vi.fn(async () => donnees())
  const ouvrirAuSegment = vi.fn(async () => {}), actualiserDistant = vi.fn(async () => true)
  const dossier = ref('/corpus'), revision = ref(0), vue = ref('corpus'), distant = ref(options.distant ? 'distant' : null)
  const dernierTirage = ref<string | null>(null)
  injection.contexte = {
    lireLocuteursCorpus: lire, ouvrirAuSegment, actualiserDistant, dossierCourantDir: dossier,
    revisionPersonnesCorpus: revision, dernierTirage, vue, idDistantCourant: distant,
    lectureSeule: ref(false), lireApercuLocuteurs: vi.fn(), corrigerLocuteurs: vi.fn(),
    gesteDisponible: () => !distant.value,
    suiviLocuteurs: ref(null), erreurSuiviLocuteurs: ref(''), suiviLocuteursCharge: ref(true),
  }
  const actif = ref(options.actif ?? true)
  const host = document.body.appendChild(document.createElement('div'))
  const app = createApp({ render: () => h(LocuteursCorpus, { actif: actif.value }) })
  apps.push(app)
  app.mount(host)
  await nextTick()
  await nextTick()
  return { host, lire, ouvrirAuSegment, actualiserDistant, actif, dossier, revision, vue, distant, dernierTirage }
}
const liste = (host: HTMLElement) => [...host.querySelectorAll<HTMLButtonElement>('[role="option"]')]
const selection = (host: HTMLElement) => liste(host).filter((b) => b.getAttribute('aria-selected') === 'true').map((b) => b.dataset.cle)
function bouton(host: HTMLElement, texte: string) {
  return [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === texte)!
}

test('liste unique, homonymes distingués par leur entretien, filtre des entretiens et statistiques en lecture', async () => {
  const b = await monter()
  expect(liste(b.host).map((b) => b.querySelector('strong')?.textContent)).toEqual(['Alice', 'Bob', 'Jean', 'Jean'])
  expect(liste(b.host)[2].textContent).toContain('Entretien C')
  expect(liste(b.host)[3].textContent).toContain('Entretien D')
  expect(b.host.querySelectorAll('.entretien-interventions')).toHaveLength(4)
  liste(b.host)[0].click()
  await nextTick()
  expect(selection(b.host)).toEqual(['a'])
  expect(b.host.querySelectorAll('.entretien-interventions')).toHaveLength(2)
  liste(b.host)[1].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }))
  await nextTick()
  expect(selection(b.host)).toEqual(['a', 'b'])
  bouton(b.host, 'Statistiques').click()
  await nextTick()
  expect(b.host.querySelector('.statistiques-selection')?.textContent).toContain('12 mots · 3 interventions')
  const tous = b.host.querySelector<HTMLInputElement>('.actions-selection input')!
  tous.checked = true
  tous.dispatchEvent(new Event('change'))
  await nextTick()
  expect(b.host.querySelectorAll('.entretien-interventions')).toHaveLength(4)
  expect(b.ouvrirAuSegment).not.toHaveBeenCalled()
})

test('Maj-clic et clavier suivent les conventions de sélection d’une liste', async () => {
  const b = await monter()
  liste(b.host)[0].click()
  liste(b.host)[2].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }))
  await nextTick()
  expect(selection(b.host)).toEqual(['a', 'b', 'C'])
  liste(b.host)[2].dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown', ctrlKey: true }))
  await nextTick()
  expect(selection(b.host)).toEqual(['a', 'b', 'C'])
  expect(document.activeElement).toBe(liste(b.host)[3])
  liste(b.host)[3].dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ', metaKey: true }))
  await nextTick()
  expect(selection(b.host)).toEqual(['a', 'b', 'C', 'D'])
  liste(b.host)[3].dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Home' }))
  await nextTick()
  expect(selection(b.host)).toEqual(['a'])
  liste(b.host)[0].dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
  await nextTick()
  expect(selection(b.host)).toEqual([])
})

test('la recherche retrouve une variante locale et retire les sélections masquées', async () => {
  const b = await monter()
  liste(b.host)[1].click()
  const recherche = b.host.querySelector<HTMLInputElement>('input[type=search]')!
  recherche.value = 'original'
  recherche.dispatchEvent(new Event('input'))
  await nextTick()
  expect(liste(b.host)).toHaveLength(1)
  expect(liste(b.host)[0].textContent).toContain('Alice')
  expect(selection(b.host)).toEqual([])
  recherche.value = ''
  recherche.dispatchEvent(new Event('input'))
  await nextTick()
  expect(liste(b.host)).toHaveLength(4)
  expect(selection(b.host)).toEqual([])
})

test('la navigation ouvre la bonne intervention et conserve la sélection au retour', async () => {
  const b = await monter()
  liste(b.host)[1].click()
  await nextTick()
  const suivant = b.host.querySelector<HTMLButtonElement>('[aria-label="Intervention suivante dans Entretien B"]')!
  suivant.click()
  await nextTick()
  expect(b.ouvrirAuSegment).toHaveBeenCalledWith('B', 10)
  b.vue.value = 'entretien'
  await nextTick()
  b.vue.value = 'corpus'
  await nextTick()
  await nextTick()
  expect(selection(b.host)).toEqual(['b'])
  expect(b.lire).toHaveBeenCalledTimes(2)
})

test('une ancienne réponse ne remplace pas les données d’un autre corpus', async () => {
  let terminer!: (valeur: VueLocuteursCorpus) => void
  const lire = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { terminer = resolve })).mockResolvedValue(donnees())
  const b = await monter({ lire })
  b.dossier.value = '/autre-corpus'
  await nextTick()
  await nextTick()
  expect(liste(b.host)).toHaveLength(4)
  terminer({ locuteurs: [], entretiens: [], indisponibles: [] })
  await nextTick()
  await nextTick()
  expect(liste(b.host)).toHaveLength(4)
})

test('un échec d’actualisation laisse le dernier résultat lisible avec un avertissement', async () => {
  const lire = vi.fn().mockResolvedValueOnce(donnees()).mockRejectedValue(new Error('Lecture refusée'))
  const b = await monter({ lire })
  bouton(b.host, 'Actualiser').click()
  await nextTick()
  await nextTick()
  expect(liste(b.host)).toHaveLength(4)
  expect(b.host.querySelector('[role=alert]')?.textContent).toContain('dernier état lisible')
})

test('détails secondaires et interventions utilisent la même vue en local et en distant', async () => {
  const b = await monter({ actif: false })
  expect(b.lire).not.toHaveBeenCalled()
  b.actif.value = true
  await nextTick()
  await nextTick()
  bouton(b.host, 'Détails et vérifications…').click()
  await nextTick()
  expect(b.host.querySelector('.details-locuteurs')).not.toBeNull()
  expect(b.host.querySelector('.personnes-corpus')).toBeNull()
  expect(liste(b.host)).toHaveLength(4)
  bouton(b.host, 'Fermer les détails').click()
  await nextTick()
  await nextTick()
  expect(liste(b.host)).toHaveLength(4)
  const lectures = b.lire.mock.calls.length
  b.distant.value = 'distant'
  await nextTick(); await nextTick()
  expect(b.host.querySelector('.personnes-corpus')).toBeNull()
  expect(liste(b.host)).toHaveLength(4)
  expect(b.lire.mock.calls.length).toBeGreaterThan(lectures)
  expect(b.host.querySelector('.consultation-distante')?.textContent).toContain('copie présente sur cet ordinateur')
})

test('borne le rendu initial des grandes listes sans perdre les éléments restants', async () => {
  const vue = donnees()
  vue.locuteurs = Array.from({ length: 250 }, (_, i) => ({ ...vue.locuteurs[0], cle: `l${i}`, nom: `Locuteur ${i}` }))
  const b = await monter({ lire: vi.fn(async () => vue) })
  expect(liste(b.host)).toHaveLength(200)
  bouton(b.host, 'Afficher les locuteurs suivants (50)').click()
  await nextTick()
  expect(liste(b.host)).toHaveLength(250)
})

test.each(['gitlab', 'nextcloud'])('%s : consultation, sélection et statistiques sans ouverture des corrections', async (fournisseur) => {
  const b = await monter({ distant: true })
  b.distant.value = fournisseur
  await nextTick(); await nextTick()
  liste(b.host)[0].click(); await nextTick()
  expect(selection(b.host)).toEqual(['a'])
  expect(bouton(b.host, 'Renommer…').disabled).toBe(true)
  bouton(b.host, 'Statistiques').click(); await nextTick()
  expect(b.host.querySelector('.statistiques-selection')?.textContent).toContain('7 mots · 2 interventions')
  expect(b.host.querySelector('.personnes-corpus')).toBeNull()
  b.dernierTirage.value = '2026-11-20T09:00:00.000Z'
  await nextTick(); await nextTick()
  expect(b.host.querySelector('time')?.dateTime).toBe('2026-11-20T09:00:00.000Z')
  expect(selection(b.host)).toEqual(['a'])
  expect(b.ouvrirAuSegment).not.toHaveBeenCalled()
})

test('Actualiser synchronise la copie distante ; une panne conserve le dernier résultat sans le présenter comme frais', async () => {
  const b = await monter({ distant: true })
  expect(b.actualiserDistant).not.toHaveBeenCalled()
  bouton(b.host, 'Actualiser').click(); await nextTick(); await nextTick(); await nextTick()
  expect(b.actualiserDistant).toHaveBeenCalledOnce()
  b.actualiserDistant.mockRejectedValueOnce(new Error('Serveur inaccessible'))
  bouton(b.host, 'Actualiser').click(); await nextTick(); await nextTick(); await nextTick()
  expect(liste(b.host)).toHaveLength(4)
  expect(b.host.querySelector('[role=alert]')?.textContent).toContain('Serveur inaccessible')
  expect(b.host.querySelector('[role=alert]')?.textContent).toContain('dernier état lisible')
})

test('une réponse de l’ancienne destination ne peuple pas la nouvelle, même avec le même dossier', async () => {
  let terminer!: (vue: VueLocuteursCorpus) => void
  const lire = vi.fn().mockImplementationOnce(() => new Promise((r) => { terminer = r })).mockResolvedValue(donnees())
  const b = await monter({ distant: true, lire })
  b.distant.value = 'autre-destination'
  await nextTick(); await nextTick()
  expect(liste(b.host)).toHaveLength(4)
  terminer({ locuteurs: [], entretiens: [], indisponibles: [] })
  await nextTick(); await nextTick()
  expect(liste(b.host)).toHaveLength(4)
})

test('la sélection pure gère les plages additives et les ancres disparues', () => {
  const ordre = ['a', 'b', 'c', 'd']
  expect(selectionnerLocuteurs({ cles: ['d'], ancre: 'a' }, ordre, 'b', { etendre: true, basculer: true })).toEqual({ cles: ['d', 'a', 'b'], ancre: 'a' })
  expect(selectionnerLocuteurs({ cles: ['ancienne'], ancre: 'ancienne' }, ordre, 'b', { etendre: true })).toEqual({ cles: ['b'], ancre: 'b' })
})
