import type { Directive } from 'vue'

/**
 *  Donne à un panneau la hauteur restante entre son bord haut et le bas de la fenêtre,
 *  dans la variable CSS --hauteur-disponible ; le panneau défile alors à l'intérieur.
 *  La valeur suit le défilement de la page, le redimensionnement et les changements de mise en page.
 */
const MARGE_BAS = 16
const HAUTEUR_MINIMALE = 240

const arrets = new WeakMap<HTMLElement, () => void>()

function suivre(el: HTMLElement) {
  let image = 0
  const mettreAJour = () => {
    image = 0
    if (!el.isConnected) return
    const haut = Math.max(el.getBoundingClientRect().top, 0)
    const hauteur = Math.max(HAUTEUR_MINIMALE, window.innerHeight - haut - MARGE_BAS)
    el.style.setProperty('--hauteur-disponible', `${Math.floor(hauteur)}px`)
  }
  const planifier = () => {
    if (!image) image = requestAnimationFrame(mettreAJour)
  }
  // Un panneau masqué puis réaffiché change de taille : l'observateur relance la mesure.
  const observateur = new ResizeObserver(planifier)
  observateur.observe(document.body)
  observateur.observe(el)
  window.addEventListener('resize', planifier)
  window.addEventListener('scroll', planifier, { capture: true, passive: true })
  mettreAJour()
  arrets.set(el, () => {
    observateur.disconnect()
    window.removeEventListener('resize', planifier)
    window.removeEventListener('scroll', planifier, { capture: true })
    if (image) cancelAnimationFrame(image)
  })
}

export const vHauteurDisponible: Directive<HTMLElement> = {
  mounted: suivre,
  unmounted(el) {
    arrets.get(el)?.()
    arrets.delete(el)
  },
}
