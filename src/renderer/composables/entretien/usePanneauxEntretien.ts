import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

export type OngletEntretien = 'locuteurs' | 'anon' | 'themes' | 'commentaires'
type Zone = 'haut' | 'bas'
const ONGLETS: OngletEntretien[] = ['locuteurs', 'anon', 'themes', 'commentaires']

/** Organisation des outils en une ou deux zones, sans recréer leurs contenus. */
export function usePanneauxEntretien(ongletDemande: Ref<OngletEntretien>) {
  const ongletsBas = ref<OngletEntretien[]>([])
  const ongletsHaut = computed(() => ONGLETS.filter((id) => !ongletsBas.value.includes(id)))
  const actifHaut = ref<OngletEntretien>(ongletDemande.value)
  const actifBas = ref<OngletEntretien | null>(null)
  const partage = computed(() => ongletsBas.value.length > 0)
  const proportionHaut = ref(50)
  const colonne = ref<HTMLElement | null>(null)
  const cibleHaut = ref<HTMLElement | null>(null)
  const cibleBas = ref<HTMLElement | null>(null)
  const ongletGlisse = ref<OngletEntretien | null>(null)
  const destination = ref<Zone | null>(null)
  const position = ref({ x: 0, y: 0 })
  let depart: { id: number; onglet: OngletEntretien; x: number; y: number } | null = null
  let redimensionnement: number | null = null
  let ignorerClic = false
  let attenteClic: ReturnType<typeof setTimeout> | undefined

  function visible(id: OngletEntretien) {
    return actifHaut.value === id || actifBas.value === id
  }

  function selectionner(id: OngletEntretien) {
    if (ongletsBas.value.includes(id)) actifBas.value = id
    else actifHaut.value = id
  }
  watch(ongletDemande, selectionner, { immediate: true })

  function cliquer(id: OngletEntretien) {
    if (ignorerClic) return
    selectionner(id)
    ongletDemande.value = id
  }

  function deplacer(id: OngletEntretien, zone: Zone) {
    const enBas = ongletsBas.value.includes(id)
    if (zone === 'bas' && !enBas) {
      // Une zone vide en haut rendrait le retour aux autres outils ambigu.
      if (ongletsHaut.value.length === 1) return
      ongletsBas.value.push(id)
      if (actifHaut.value === id) actifHaut.value = ongletsHaut.value[0]
      actifBas.value = id
      ongletDemande.value = id
    } else if (zone === 'haut' && enBas) {
      ongletsBas.value = ongletsBas.value.filter((onglet) => onglet !== id)
      actifHaut.value = id
      if (actifBas.value === id) actifBas.value = ongletsBas.value[0] ?? null
      ongletDemande.value = id
    }
  }

  async function rendreFocus(id: OngletEntretien) {
    await nextTick()
    colonne.value?.querySelector<HTMLButtonElement>(`[data-onglet="${id}"]`)?.focus()
  }

  function deplacerAuClavier(id: OngletEntretien, zone: Zone) {
    deplacer(id, zone)
    void rendreFocus(id)
  }

  function regrouper() {
    ongletsBas.value = []
    actifBas.value = null
    selectionner(ongletDemande.value)
    void rendreFocus(actifHaut.value)
  }

  function commencerGlissement(event: PointerEvent, id: OngletEntretien) {
    if (event.button !== 0 || depart || redimensionnement !== null) return
    depart = { id: event.pointerId, onglet: id, x: event.clientX, y: event.clientY }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  function contient(element: HTMLElement | null, x: number, y: number) {
    if (!element) return false
    const rect = element.getBoundingClientRect()
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
  }

  function zoneAuPoint(x: number, y: number): Zone | null {
    if (contient(cibleBas.value, x, y)) return 'bas'
    return contient(cibleHaut.value, x, y) ? 'haut' : null
  }

  function glisser(event: PointerEvent) {
    if (depart?.id !== event.pointerId) return
    if (!ongletGlisse.value && Math.hypot(event.clientX - depart.x, event.clientY - depart.y) < 6) return
    ongletGlisse.value = depart.onglet
    position.value = { x: event.clientX, y: event.clientY }
    destination.value = zoneAuPoint(event.clientX, event.clientY)
  }

  function ignorerClicApresGlissement() {
    ignorerClic = true
    clearTimeout(attenteClic)
    attenteClic = setTimeout(() => { ignorerClic = false }, 0)
  }

  function terminerGlissement(event: PointerEvent) {
    if (depart?.id !== event.pointerId) return
    if (ongletGlisse.value) {
      const zone = zoneAuPoint(event.clientX, event.clientY)
      if (event.type === 'pointerup' && zone) deplacer(depart.onglet, zone)
      // Le clic émis après le relâchement ne doit pas changer l'outil resté en haut.
      ignorerClicApresGlissement()
    }
    depart = null
    ongletGlisse.value = null
    destination.value = null
  }

  function annulerGlissement(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !depart) return
    ignorerClicApresGlissement()
    depart = null
    ongletGlisse.value = null
    destination.value = null
    event.preventDefault()
  }

  function commencerRedimensionnement(event: PointerEvent) {
    if (event.button !== 0 || redimensionnement !== null || depart) return
    event.preventDefault()
    redimensionnement = event.pointerId
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  function reglerProportion(valeur: number) {
    proportionHaut.value = Math.max(20, Math.min(80, valeur))
  }

  function redimensionner(event: PointerEvent) {
    if (redimensionnement !== event.pointerId || !colonne.value) return
    const rect = colonne.value.getBoundingClientRect()
    if (rect.height > 0) reglerProportion(100 * (event.clientY - rect.top) / rect.height)
  }

  function terminerRedimensionnement() {
    redimensionnement = null
  }

  function redimensionnerAuClavier(event: KeyboardEvent) {
    const valeurs: Record<string, number> = {
      ArrowUp: proportionHaut.value - 5, ArrowDown: proportionHaut.value + 5, Home: 20, End: 80,
    }
    if (!(event.key in valeurs)) return
    event.preventDefault()
    reglerProportion(valeurs[event.key])
  }

  // L'éditeur peut garder le focus pendant le glissement d'un onglet.
  onMounted(() => document.addEventListener('keydown', annulerGlissement))
  onBeforeUnmount(() => {
    clearTimeout(attenteClic)
    document.removeEventListener('keydown', annulerGlissement)
  })

  return {
    ongletsHaut, ongletsBas, actifHaut, actifBas, partage, proportionHaut,
    colonne, cibleHaut, cibleBas, ongletGlisse, destination, position,
    visible, cliquer, deplacer, deplacerAuClavier, regrouper, commencerGlissement, glisser, terminerGlissement,
    commencerRedimensionnement, redimensionner, terminerRedimensionnement, redimensionnerAuClavier,
  }
}
