import { ref, computed } from 'vue'

/**
 * Scope AUDIO de l'entretien ouvert (S6). Un seul <audio> caché + son état
 * RÉACTIF partagé : le lecteur (haut d'écran), la barre de position sur la
 * forme d'onde et le surlignage du bloc lu se coordonnent par cette réactivité
 * — pas de composant « dynamique », des consommateurs d'un même état (D-S12).
 *
 * L'élément est attaché au <body> (invisible) : il survit aux v-show des
 * écrans et reste observable en e2e (document.querySelector('audio')).
 */
export function useAudio() {
  // Une ré-instanciation (HMR en dev : App rechargée pendant une lecture) ne
  // doit pas ORPHELINER l'élément précédent — il continuerait à jouer hors de
  // tout contrôle (l'UI ne pilote que le nouvel élément). Inerte en prod.
  document.querySelectorAll<HTMLAudioElement>('audio[data-sonal]').forEach((a) => {
    a.pause()
    a.remove()
  })
  const el = document.createElement('audio')
  el.dataset.sonal = ''
  el.preload = 'auto'
  el.style.display = 'none'
  document.body.appendChild(el)

  const url = ref<string | null>(null)
  const waveformUrl = ref<string | null>(null)
  const enLecture = ref(false)
  const duree = ref(0)
  /** Position suivie sur `timeupdate` (~4 Hz, comme SonalPi) — largement assez
   *  fin pour la synchro par bloc ; la barre de position suit au même rythme. */
  const position = ref(0)
  const vitesse = ref(1)

  el.addEventListener('timeupdate', () => (position.value = el.currentTime))
  el.addEventListener('durationchange', () => (duree.value = Number.isFinite(el.duration) ? el.duration : 0))
  el.addEventListener('play', () => (enLecture.value = true))
  el.addEventListener('pause', () => (enLecture.value = false))
  el.addEventListener('ended', () => (enLecture.value = false))

  /** Charge (ou décharge, u=null) l'audio de l'entretien ouvert. */
  function charger(u: string | null, waveform: string | null) {
    el.pause()
    url.value = u
    waveformUrl.value = waveform
    position.value = 0
    duree.value = 0
    if (u) {
      el.src = u
      el.load()
    } else {
      el.removeAttribute('src')
    }
  }
  function basculer() {
    if (el.paused) void el.play()
    else el.pause()
  }
  function pause() {
    el.pause()
  }
  function seek(t: number) {
    el.currentTime = Math.max(0, t)
    position.value = el.currentTime
  }
  function decaler(dt: number) {
    seek(el.currentTime + dt)
  }
  function changerVitesse(sens: '+' | '-' | '=') {
    let v = vitesse.value
    if (sens === '=') v = 1
    if (sens === '+') v += 0.25
    if (sens === '-' && v > 0.25) v -= 0.25
    vitesse.value = v
    el.playbackRate = v
  }

  const ratio = computed(() => (duree.value > 0 ? position.value / duree.value : 0))

  return {
    url,
    waveformUrl,
    enLecture,
    duree,
    position,
    vitesse,
    ratio,
    charger,
    basculer,
    pause,
    seek,
    decaler,
    changerVitesse,
  }
}
