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
      { cle: 'b', nom: 'Bob', locuteurId: 'p2', participations: [{ entretienId: 'B', entretienTitre: 'Entretien B', participationId: 'b', nom: 'Bob' }], mots: 5, interventions: 1 },
      ...['C', 'D'].map((id) => ({ cle: id, nom: 'Jean', locuteurId: `p${id}`, participations: [{ entretienId: id, entretienTitre: `Entretien ${id}`, participationId: id, nom: 'Jean' }], mots: 2, interventions: 1 })),
    ],
    entretiens: [
      { id: 'A', titre: 'Entretien A', mots: 6, tours: [{ cle: 'a', nom: 'Alice', pos: 1, debut: 0, fin: 100, mots: 3 }] },
      { id: 'B', titre: 'Entretien B', mots: 9, tours: [
        { cle: 'a', nom: 'Alice', pos: 1, debut: 0, fin: 40, mots: 4 },
        { cle: 'b', nom: 'Bob', pos: 10, debut: 40, fin: 100, mots: 5 },
      ] },
      ...['C', 'D'].map((id) => ({ id, titre: `Entretien ${id}`, mots: 2, tours: [{ cle: id, nom: 'Jean', pos: 1, debut: 0, fin: 100, mots: 2 }] })),
    ],
    aVerifier: [], indisponibles: [],
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
    urlWaveform: (id: string) => id === 'A' ? '/onde-A.png' : null,
    allerLocuteurs: vi.fn(async () => {}),
    revisionLocuteursCorpus: revision, dernierTirage, vue, idDistantCourant: distant,
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
  const tous = b.host.querySelectorAll<HTMLInputElement>('.perimetre-entretiens input')[1]!
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

test('la recherche retrouve une variante locale et conserve les sélections masquées', async () => {
  const b = await monter()
  liste(b.host)[1].click()
  const recherche = b.host.querySelector<HTMLInputElement>('input[type=search]')!
  recherche.value = 'original'
  recherche.dispatchEvent(new Event('input'))
  await nextTick()
  expect(liste(b.host)).toHaveLength(1)
  expect(liste(b.host)[0].textContent).toContain('Alice')
  expect(selection(b.host)).toEqual([])
  expect(b.host.querySelector('.compteur-selection')?.textContent).toContain('1 sélectionné, dont 1 masqué')
  recherche.value = ''
  recherche.dispatchEvent(new Event('input'))
  await nextTick()
  expect(liste(b.host)).toHaveLength(4)
  expect(selection(b.host)).toEqual(['b'])
})

test('la barre ouvre la bonne intervention et conserve la sélection au retour', async () => {
  const b = await monter()
  liste(b.host)[1].click()
  await nextTick()
  const barre = b.host.querySelector<HTMLButtonElement>('[aria-label="Ouvrir une intervention sélectionnée dans Entretien B"]')!
  barre.click()
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
  terminer({ locuteurs: [], entretiens: [], aVerifier: [], indisponibles: [] })
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
  terminer({ locuteurs: [], entretiens: [], aVerifier: [], indisponibles: [] })
  await nextTick(); await nextTick()
  expect(liste(b.host)).toHaveLength(4)
})

test('la sélection pure gère les plages additives et les ancres disparues', () => {
  const ordre = ['a', 'b', 'c', 'd']
  expect(selectionnerLocuteurs({ cles: ['d'], ancre: 'a' }, ordre, 'b', { etendre: true, basculer: true })).toEqual({ cles: ['d', 'a', 'b'], ancre: 'a' })
  expect(selectionnerLocuteurs({ cles: ['ancienne'], ancre: 'ancienne' }, ordre, 'b', { etendre: true })).toEqual({ cles: ['b'], ancre: 'b' })
  expect(selectionnerLocuteurs({ cles: ['masquee'], ancre: 'masquee' }, ordre, 'b', { basculer: true })).toEqual({ cles: ['masquee', 'b'], ancre: 'b' })
})

async function chercher(host: HTMLElement, texte: string, valider = false) {
  const champ = host.querySelector<HTMLInputElement>('input[type=search]')!
  champ.value = texte; champ.dispatchEvent(new Event('input')); await nextTick()
  if (valider) { champ.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })); await nextTick() }
}

test('tags OU, aperçu de saisie, accents, doublons et retrait indépendant de la sélection', async () => {
  const b = await monter()
  liste(b.host)[1].click(); await nextTick()
  await chercher(b.host, 'Original', true)
  expect(liste(b.host)).toHaveLength(1)
  await chercher(b.host, 'Bób')
  expect(liste(b.host)).toHaveLength(2)
  await chercher(b.host, 'Bób', true)
  await chercher(b.host, 'BOB', true)
  expect(b.host.querySelectorAll('.tags-recherche li')).toHaveLength(2)
  expect(selection(b.host)).toEqual(['b'])
  b.host.querySelector<HTMLButtonElement>('[aria-label="Retirer le tag Bób"]')!.click(); await nextTick()
  expect(selection(b.host)).toEqual([])
  expect(b.host.querySelector('.compteur-selection')?.textContent).toContain('1 masqué')
  bouton(b.host, 'Effacer la recherche').click(); await nextTick()
  expect(liste(b.host)).toHaveLength(4)
  expect(selection(b.host)).toEqual(['b'])
  expect(b.host.querySelector('.tags-recherche')).toBeNull()
})

test('sélection additive entre recherches et Ctrl-A limité aux résultats visibles', async () => {
  const b = await monter()
  liste(b.host)[0].click(); await nextTick()
  await chercher(b.host, 'Bob')
  liste(b.host)[0].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })); await nextTick()
  expect(b.host.querySelector('.compteur-selection')?.textContent).toContain('2 sélectionnés, dont 1 masqué')
  liste(b.host)[0].dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a', ctrlKey: true })); await nextTick()
  expect(b.host.querySelector('.compteur-selection')?.textContent).toContain('1 sélectionné')
  await chercher(b.host, '')
  expect(selection(b.host)).toEqual(['b'])
})

test('les statistiques gardent les sélections masquées et le dénominateur complet de chaque entretien', async () => {
  const b = await monter()
  liste(b.host)[0].click(); await nextTick()
  bouton(b.host, 'Statistiques').click(); await nextTick()
  const stats = b.host.querySelector('.statistiques-selection')!
  expect(stats.textContent).toContain('7 mots · 2 interventions')
  expect(stats.textContent).toContain('50 %')
  expect(stats.textContent).toContain('44,4 %')
  await chercher(b.host, 'Bob')
  expect(stats.textContent).toContain('7 mots · 2 interventions')
  const tous = b.host.querySelectorAll<HTMLInputElement>('.perimetre-entretiens input')[1]
  tous.checked = true; tous.dispatchEvent(new Event('change')); await nextTick()
  expect(stats.textContent).toContain('7 mots · 2 interventions')
  expect(b.host.querySelectorAll('.entretien-interventions')).toHaveLength(4)
})

test('le bilan trie les locuteurs et gère zéro mot et les sources indisponibles', async () => {
  const vue = donnees()
  vue.locuteurs.forEach((l) => { l.mots = 0; l.interventions = 0 })
  vue.entretiens.forEach((e) => { e.mots = 0; e.tours.forEach((t) => { t.mots = 0 }) })
  vue.indisponibles.push({ id: 'absent', titre: 'Absent', raison: 'Lecture impossible' })
  const b = await monter({ lire: vi.fn(async () => vue) })
  liste(b.host)[0].click()
  liste(b.host)[1].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })); await nextTick()
  bouton(b.host, 'Statistiques').click(); await nextTick()
  const stats = b.host.querySelector('.statistiques-selection')!
  expect(stats.textContent).toContain('Bilan incomplet')
  expect(stats.textContent).toContain('0 %')
  expect(stats.textContent).not.toMatch(/NaN|Infinity/)
  bouton(b.host, 'Locuteur').click(); await nextTick()
  expect(stats.querySelector('tbody th')?.textContent).toContain('Alice')
  bouton(b.host, 'Locuteur').click(); await nextTick()
  expect(stats.querySelector('tbody th')?.textContent).toContain('Bob')
})

test('la validation pendant une composition ne crée pas de tag et le retrait rend le focus au champ', async () => {
  const b = await monter()
  await chercher(b.host, 'Alice')
  const champ = b.host.querySelector<HTMLInputElement>('input[type=search]')!
  const composition = new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', isComposing: true, cancelable: true })
  champ.dispatchEvent(composition); await nextTick()
  expect(composition.defaultPrevented).toBe(false)
  expect(b.host.querySelector('.tags-recherche')).toBeNull()
  await chercher(b.host, 'Alice', true)
  b.host.querySelector<HTMLButtonElement>('[aria-label="Retirer le tag Alice"]')!.click(); await nextTick(); await nextTick()
  expect(document.activeElement).toBe(champ)
})

test('les entrées à vérifier ouvrent les locuteurs de leur entretien sans correction dans le corpus', async () => {
  const vue = donnees()
  vue.aVerifier.push({ entretienId: 'A', entretienTitre: 'Entretien A', participationId: 'ancien', nom: 'Ancien' })
  const b = await monter({ lire: vi.fn(async () => vue) })
  expect(b.host.querySelector('.verification-locuteurs')?.textContent).toContain('vérification')
  bouton(b.host, 'Ouvrir les locuteurs de Entretien A').click(); await nextTick()
  expect(injection.contexte.allerLocuteurs).toHaveBeenCalledWith('A')
  expect(injection.contexte.corrigerLocuteurs).not.toHaveBeenCalled()
  expect(b.host.textContent).not.toContain('Conserver séparément')
})

test('les commandes sont à gauche et les cartes réutilisent les ondes disponibles', async () => {
  const b = await monter()
  expect(b.host.textContent).not.toContain('Ctrl ou ⌘ pour plusieurs')
  b.host.querySelector<HTMLButtonElement>('[aria-label="Raccourcis clavier de la sélection"]')!.click(); await nextTick()
  expect(b.host.querySelector('.repertoire-locuteurs')?.textContent).toContain('Ctrl ou ⌘ pour plusieurs ; Maj pour une plage.')
  liste(b.host)[0].click(); await nextTick()
  expect(b.host.querySelector('.repertoire-locuteurs [title="Renommer…"]')).not.toBeNull()
  expect(b.host.querySelector('.repertoire-locuteurs [title="Détails et vérifications…"]')).toBeNull()
  expect(b.host.querySelector('.interventions-locuteurs [title="Renommer…"]')).toBeNull()
  expect(b.host.querySelector('[data-entretien-id="A"] h3')?.textContent).toBe('Entretien A (1 intervention)')
  expect(b.host.querySelector('[data-entretien-id="A"]')?.textContent).not.toContain('Ouvrir')
  expect(b.host.querySelector('[data-entretien-id="A"]')?.textContent).not.toContain('de la sélection')
  expect(b.host.querySelector('img.spectro')?.getAttribute('src')).toBe('/onde-A.png')
  expect(b.host.querySelectorAll('.spectro-vide')).toHaveLength(1)
  expect(b.host.querySelector('[role=separator]')).not.toBeNull()
})

test('actualiser retire les locuteurs disparus sans confondre les filtres et les changements de données', async () => {
  const vue = donnees(), lire = vi.fn().mockResolvedValueOnce(vue)
  const b = await monter({ lire })
  liste(b.host)[0].click(); await nextTick()
  await chercher(b.host, 'Bob', true)
  lire.mockResolvedValue({ ...vue, locuteurs: vue.locuteurs.filter((l) => l.cle !== 'a') })
  bouton(b.host, 'Actualiser').click(); await nextTick(); await nextTick()
  expect(b.host.querySelector('.compteur-selection')?.textContent).toContain('0 sélectionné')
  expect(b.host.querySelector('.tags-recherche')?.textContent).toContain('Bob')
  b.dossier.value = '/autre'; await nextTick(); await nextTick()
  expect(b.host.querySelector('.tags-recherche')).toBeNull()
})
