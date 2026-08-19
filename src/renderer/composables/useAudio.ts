import { ref, computed } from 'vue'

/**
 * Scope MÉDIA de l'entretien ouvert. Un unique moyen de lecture (audio OU vidéo)
 * + son état RÉACTIF partagé : le lecteur (haut d'écran), la barre de position sur
 * la forme d'onde et le surlignage du bloc lu se coordonnent par cette réactivité.
 *
 * Deux éléments cohabitent, choisis selon le NATURE du média :
 *  - `<audio data-sonal>` caché : le cas audio actuel (inchangé — les e2e le
 *    retrouvent par `document.querySelector('audio')`) ;
 *  - `<video data-sonal>` : les formats potentiellement vidéo (mp4, webm, mov…).
 *    C'est lui l'horloge en mode vidéo, et le panneau vidéo l'ADOPTE pour
 *    l'afficher (même élément, jamais deux horloges → synchro exacte).
 * La présence d'une piste image se décide au `loadedmetadata` (`videoWidth > 0`),
 * l'extension ne servant qu'à choisir le bon élément au chargement (le format
 * webm peut n'être que l'audio).
 */
export function useAudio() {
  // Une ré-instanciation (HMR en dev : App rechargée pendant une lecture) ne
  // doit pas ORPHELINER les éléments précédents — ils continueraient à jouer hors
  // de tout contrôle. Inerte en prod.
  document.querySelectorAll<HTMLMediaElement>('audio[data-sonal],video[data-sonal]').forEach((a) => {
    a.pause()
    a.remove()
  })
  // Élément AUDIO (cas par défaut, toujours présent pour la rétrocompat e2e).
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
  /** Vrai si le média référencé est introuvable (fichier déplacé/supprimé). */
  const erreur = ref(false)
  /** Vrai quand le média a une piste IMAGE (une vidéo). Décidé au chargement de
   *  métadonnées (`videoWidth > 0`) ; guide l'organisation d'écran vidéo. */
  const estVideo = ref(false)
  /** Dimensions intrinsèques de la vidéo (pour en déduire le ratio 4:3, 16:9…). */
  const videoW = ref(0)
  const videoH = ref(0)
  /** L'élément `<video>` du mode vidéo — adopté et affiché par le panneau vidéo. */
  const elVideo = ref<HTMLVideoElement | null>(null)
  /** Largeur (px) du panneau vidéo. 0 = pas encore fixé (défaut déduit du ratio
   *  à la première lecture de métadonnées, ou valeur mémorisée par corpus). */
  const largeurVideo = ref(0)
  /** Visibilité du panneau vidéo (bouton sous la waveform). Le lecteur a toute
   *  la largeur quand la vidéo est fermée ; l'élément vidéo reste monté (la
   *  lecture audio continue en arrière-plan). Préférence de SESSION. */
  const videoVisible = ref(true)
  function toggleVideo() {
    videoVisible.value = !videoVisible.value
  }

  /** L'élément COURANT — cible de play/pause/seek selon le type de média. */
  let elCourant: HTMLMediaElement = el

  /** Attache les écouteurs d'état à un élément média (partagé audio/vidéo). */
  function brancher(cible: HTMLMediaElement) {
    cible.addEventListener('timeupdate', () => (position.value = cible.currentTime))
    cible.addEventListener('durationchange', () => (duree.value = Number.isFinite(cible.duration) ? cible.duration : 0))
    cible.addEventListener('play', () => (enLecture.value = true))
    cible.addEventListener('pause', () => (enLecture.value = false))
    cible.addEventListener('ended', () => (enLecture.value = false))
    cible.addEventListener('error', () => {
      if (url.value && cible === elCourant) erreur.value = true // erreur de chargement (fichier manquant)
    })
  }
  brancher(el)

  // Extensions par lesquelles on décide du bon élément à créer au chargement.
  const EXT_AUDIO_SEUL = new Set(['mp3', 'wav', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'flac'])
  const EXT_VIDEO = new Set(['mp4', 'm4v', 'mov', 'mkv', 'webm', 'ogv', 'avi'])
  function extDe(u: string): string {
    return u.split(/[?#]/)[0].split('.').pop()?.toLowerCase() ?? ''
  }
  /** Un fichier vidéo de 1280×720 affiché à hauteur cible ~380 px donne une
   *  largeur proportionnelle à son ratio — on s'adapte d'office à 4:3, 16:9… */
  function largeurParDefaut():
    | number
    | null {
    if (videoH.value <= 0 || videoW.value <= 0) return null
    const LARGEUR_MIN = 320
    const LARGEUR_MAX = 760
    const HAUTEUR_CIBLE = 360 // hauteur cible en px pour une vidéo seule
    const w = Math.round((HAUTEUR_CIBLE * videoW.value) / videoH.value)
    return Math.max(LARGEUR_MIN, Math.min(LARGEUR_MAX, w))
  }

  /** Charge (ou décharge, u=null) le média de l'entretien ouvert. Crée le bon
   *  élément (audio/vidéo) selon l'extension ; `estVideo` n'est tranché qu'aux
   *  métadonnées (un webm peut n'être que de l'audio). */
  function charger(u: string | null, waveform: string | null) {
    elCourant.pause()
    url.value = u
    waveformUrl.value = waveform
    position.value = 0
    duree.value = 0
    erreur.value = false
    estVideo.value = false
    videoW.value = 0
    videoH.value = 0
    if (u && EXT_VIDEO.has(extDe(u))) {
      // Mode potentiellement vidéo : (re)crée un <video>, adopte-le comme horloge.
      // `estVideo` est posé OPTIMISTE dès le chargement (le panneau s'affiche
      // tout de suite) ; `loadedmetadata` le tranche au plus juste (un webm peut
      // n'être que de l'audio → on rebascule sur l'organisation audio).
      estVideo.value = true
      if (!elVideo.value) {
        const v = document.createElement('video')
        v.dataset.sonal = ''
        v.preload = 'auto'
        v.playsInline = true
        v.style.width = '100%'
        v.style.height = '100%'
        v.style.objectFit = 'contain'
        v.style.display = 'none' // caché tant que le panneau ne l'adopte pas
        brancher(v)
        v.addEventListener('loadedmetadata', () => {
          videoW.value = v.videoWidth
          videoH.value = v.videoHeight
          estVideo.value = v.videoWidth > 0 // piste image présente → c'est une vidéo
          if (estVideo.value && largeurVideo.value === 0) {
            const w = largeurParDefaut()
            if (w) largeurVideo.value = w
          }
        })
        elVideo.value = v
      }
      const v = elVideo.value
      if (!document.body.contains(v)) document.body.appendChild(v)
      v.src = u
      v.load()
      elCourant = v
      // L'audio seul caché n'a plus de source en mode vidéo.
      el.removeAttribute('src')
    } else {
      elCourant = el
      if (u) {
        el.src = u
        el.load()
      } else {
        el.removeAttribute('src')
      }
      // Nettoyer un éventuel élément vidéo précédent.
      if (elVideo.value) {
        elVideo.value.pause()
        elVideo.value.remove()
        elVideo.value = null
      }
    }
  }

  function basculer() {
    if (elCourant.paused) void elCourant.play()
    else elCourant.pause()
  }
  function pause() {
    elCourant.pause()
  }
  function seek(t: number) {
    elCourant.currentTime = Math.max(0, t)
    position.value = elCourant.currentTime
  }
  function decaler(dt: number) {
    seek(elCourant.currentTime + dt)
  }
  function changerVitesse(sens: '+' | '-' | '=') {
    let v = vitesse.value
    if (sens === '=') v = 1
    if (sens === '+') v += 0.25
    if (sens === '-' && v > 0.25) v -= 0.25
    vitesse.value = v
    elCourant.playbackRate = v
  }

  /** Ajuste la largeur du panneau vidéo (boutons − / +), bornée. */
  function agrandirVideo() {
    largeurVideo.value = Math.min(760, largeurVideo.value + 40)
  }
  function reduireVideo() {
    largeurVideo.value = Math.max(320, largeurVideo.value - 40)
  }
  /** Applique une largeur mémorisée (par corpus) au chargement, si plus précise. */
  function definirLargeurVideo(l: number | null) {
    if (l && Number.isFinite(l)) largeurVideo.value = Math.max(320, Math.min(760, l))
  }

  const ratio = computed(() => (duree.value > 0 ? position.value / duree.value : 0))

  return {
    elVideo,
    url,
    waveformUrl,
    enLecture,
    duree,
    position,
    vitesse,
    ratio,
    erreur,
    estVideo,
    videoW,
    videoH,
    largeurVideo,
    videoVisible,
    toggleVideo,
    charger,
    basculer,
    pause,
    seek,
    decaler,
    changerVitesse,
    agrandirVideo,
    reduireVideo,
    definirLargeurVideo,
  }
}
