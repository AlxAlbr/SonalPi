<script setup lang="ts">
/**
 *  Fenêtre « Affiner » d'un tour de parole : la forme d'onde du tour, ses
 *  passages et leurs bornes, modifiables en glissant sur l'onde ou en saisissant
 *  les temps. Le début du tour suivant peut aussi être décalé. Rien n'est
 *  enregistré avant « Enregistrer ». Sans audio, les temps des passages ne sont
 *  pas affichés.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import { chargerPics, PICS_PAR_SECONDE, type Pics } from '../../../audio/enveloppeFine'
import { formaterDuree, formaterTemps, lireTemps } from '../../../../shared/entretien/horodatage'

const props = defineProps<{ posBloc: number }>()
const emit = defineEmits<{ fermer: [] }>()

const { audio, lireHorodatageTour, enregistrerHorodatageTour, entretienEditable, tourHorodatage } = utiliserSonal()
const { url, duree, position, enLecture, seek, basculer, pause } = audio

const info = lireHorodatageTour(props.posBloc)
// Tour pas encore horodaté : on part d'un passage unique autour du repère estimé.
const creation = !info || info.temps.length < 2
const passages = creation ? [{ de: 0, a: 1, texte: info?.texte ?? '' }] : info!.passages
const avecAudio = computed(() => !!url.value)
// Couleur du locuteur du tour : passages, bornes et liste des passages la reprennent.
const couleur = info?.couleur ?? '#2e73d8'
// Début du tour : ne va pas avant la fin du tour précédent, que l'on peut aussi décaler.
const finPrecedentInitial = info?.precedent?.fin ?? null
const finPrecedent = ref<number | null>(finPrecedentInitial)
const minimum = computed(() => finPrecedent.value ?? info?.min ?? 0)
// La fin du tour ne va pas au-delà du début du tour suivant.
const debutSuivantInitial = info?.suivant?.debut ?? null
const debutSuivant = ref<number | null>(debutSuivantInitial)
const maximum = computed(() => debutSuivant.value ?? (duree.value > 0 ? duree.value : Number.POSITIVE_INFINITY))

function borner(t: number, bas: number, haut: number): number {
  return Math.min(haut, Math.max(bas, t))
}

const brouillon = ref<number[]>(
  creation
    ? (() => {
        const debut = borner(info?.repere ?? position.value, minimum.value, maximum.value)
        return [debut, borner(debut + 5, debut, maximum.value)]
      })()
    : [...info!.temps],
)
// Début et fin du tour = début du premier passage et fin du dernier passage qui ont du texte :
// les ancres vides avant ou après ne comptent pas.
const premier = passages.length ? passages[0].de : 0
const dernier = passages.length ? passages[passages.length - 1].a : brouillon.value.length - 1
// Le début du tour suivant ne peut pas être avant la fin de ce tour (données décalées par une suppression).
if (debutSuivant.value != null) debutSuivant.value = Math.max(debutSuivant.value, brouillon.value[dernier])
const tempsInitiaux = [...brouillon.value]

// Bornes affichées : celles qui encadrent un passage qui a encore du texte. Une borne
// de début ou de fin de tour qui ne touche aucun texte n'est pas affichée (les champs la gardent).
// Les autres bornes suivent leurs voisines.
const visibles = [...new Set(passages.flatMap((p) => [p.de, p.a]))].sort((x, y) => x - y)
// Sans audio, seules les bornes du tour sont affichées : les passages n'ont pas de temps visible.
const affichees = computed(() => (avecAudio.value ? visibles : [premier, dernier]))
const debutsDePassage = new Set(passages.map((p) => p.de))

const estPassage = (i: number, j: number) => passages.some((p) => p.de === i && p.a === j)

/**
 *  Bornes qui bougent avec `k` : la fin d'un passage et le début du suivant restent soudées
 *  tant qu'elles sont au même temps (pas de silence entre les deux).
 *  `seule` détache la borne de ses voisines.
 */
function groupeDe(k: number, seule: boolean): number[] {
  if (!visibles.includes(k)) return [k]
  const rang = visibles.indexOf(k)
  let g = rang
  let d = rang
  if (!seule) {
    const t = brouillon.value[k]
    while (g > 0 && !estPassage(visibles[g - 1], visibles[g]) && brouillon.value[visibles[g - 1]] === t) g--
    while (d < visibles.length - 1 && !estPassage(visibles[d], visibles[d + 1]) && brouillon.value[visibles[d + 1]] === t) d++
  }
  return visibles.slice(g, d + 1)
}

/** Change le temps de l'ancre `k` (et des bornes soudées), sans dépasser leurs voisines. */
function changerTemps(k: number, t: number, seule = false) {
  const groupe = groupeDe(k, seule)
  // Voisines affichées de part et d'autre du groupe : sans elles, le début et la fin du tour
  // (non affichés) se bornent au début minimum et à la fin maximum.
  const avant = visibles.filter((i) => i < groupe[0]).at(-1)
  const apres = visibles.find((i) => i > groupe.at(-1)!)
  const bas = avant == null ? minimum.value : brouillon.value[avant]
  const haut = apres == null ? maximum.value : brouillon.value[apres]
  const temps = [...brouillon.value]
  const valeur = Math.round(borner(t, bas, haut) * 100) / 100
  for (const i of groupe) temps[i] = valeur
  // Les ancres masquées restent rangées entre les ancres visibles qui les entourent.
  for (let i = 1; i < temps.length - 1; i++) {
    if (!visibles.includes(i)) temps[i] = borner(temps[i], temps[i - 1], temps[i + 1])
  }
  brouillon.value = temps
}

// --- Tour suivant : son début se décale, entre la fin de ce tour et sa propre fin ---
const suivantAffiche = computed(() => avecAudio.value && !!info?.suivant && info.suivant.debut != null)
const suivantModifie = computed(() => suivantAffiche.value && debutSuivant.value !== debutSuivantInitial)
function changerDebutSuivant(t: number) {
  const suivant = info!.suivant!
  const bas = brouillon.value[dernier]
  const haut = suivant.fin ?? (duree.value > 0 ? duree.value : Number.POSITIVE_INFINITY)
  debutSuivant.value = Math.round(borner(t, bas, haut) * 100) / 100
}

// --- Tour précédent : sa fin se règle, entre son début et le début de ce tour ---
const precedentEditable = computed(() => avecAudio.value && info?.precedent?.debut != null && finPrecedent.value != null)
const finPrecedentModifiee = computed(() => precedentEditable.value && finPrecedent.value !== finPrecedentInitial)
function changerFinPrecedent(t: number) {
  const bas = info!.precedent!.debutDernierPassage ?? info!.precedent!.debut!
  const haut = brouillon.value[premier]
  finPrecedent.value = Math.round(borner(t, bas, haut) * 100) / 100
}

// Changements non enregistrés : la navigation vers un autre tour les refuse.
const brouillonModifie = computed(() => brouillon.value.some((t, k) => t !== tempsInitiaux[k]))
const aDesChangements = computed(() => brouillonModifie.value || suivantModifie.value || finPrecedentModifiee.value)
const modifie = computed(() => creation || aDesChangements.value)

// --- Saisie au clavier ---
const saisieInvalide = ref<string | null>(null)
function saisir(k: number, evenement: Event) {
  const champ = evenement.target as HTMLInputElement
  const t = lireTemps(champ.value)
  const cle = `${k}-${champ.dataset.role}`
  if (t == null) {
    saisieInvalide.value = cle
  } else {
    saisieInvalide.value = null
    changerTemps(k, t)
  }
  champ.value = formaterTemps(brouillon.value[k])
}
function saisirPrecedent(evenement: Event) {
  const champ = evenement.target as HTMLInputElement
  const t = lireTemps(champ.value)
  if (t == null) {
    saisieInvalide.value = 'precedent-fin'
  } else {
    saisieInvalide.value = null
    changerFinPrecedent(t)
  }
  champ.value = formaterTemps(finPrecedent.value ?? 0)
}
function saisirSuivant(evenement: Event) {
  const champ = evenement.target as HTMLInputElement
  const t = lireTemps(champ.value)
  if (t == null) {
    saisieInvalide.value = 'suivant-debut'
  } else {
    saisieInvalide.value = null
    changerDebutSuivant(t)
  }
  champ.value = formaterTemps(debutSuivant.value ?? 0)
}

// --- Vue de l'onde : fenêtre de temps affichée, élargissable ---
const vue = ref({ debut: 0, fin: 1 })
// Le tour précédent et le tour suivant restent visibles dans la vue, pour situer le tour.
const precedentAffiche = computed(() => avecAudio.value && info?.precedent?.debut != null)
const debutAffiche = computed(() =>
  precedentAffiche.value && info!.precedent!.debut != null
    ? Math.min(brouillon.value[premier], info!.precedent!.debut)
    : brouillon.value[premier],
)
const zonePrecedent = computed(() => {
  if (!precedentAffiche.value || !info?.precedent) return null
  const debut = Math.max(0, pourcent(info.precedent.debut!))
  const fin = Math.min(100, pourcent(finPrecedent.value ?? info.precedent.debut!))
  return { gauche: debut, largeur: Math.max(0, fin - debut) }
})
const finAffichee = computed(() =>
  suivantAffiche.value && debutSuivant.value != null ? Math.max(brouillon.value[dernier], debutSuivant.value) : brouillon.value[dernier],
)
function cadrer() {
  const debut = debutAffiche.value
  const fin = finAffichee.value
  const marge = Math.max(1, (fin - debut) * 0.25)
  const plafond = duree.value > 0 ? duree.value : fin + marge
  vue.value = { debut: Math.max(0, debut - marge), fin: Math.min(plafond, fin + marge) }
}
cadrer()
const etendue = computed(() => Math.max(0.1, vue.value.fin - vue.value.debut))

function zoomer(facteur: number) {
  const centre = (vue.value.debut + vue.value.fin) / 2
  const plafond = duree.value > 0 ? duree.value : Number.POSITIVE_INFINITY
  const demi = Math.max(0.5, (etendue.value * facteur) / 2)
  let debut = centre - demi
  let fin = centre + demi
  if (debut < 0) {
    fin = Math.min(plafond, fin - debut)
    debut = 0
  }
  if (fin > plafond) {
    debut = Math.max(0, debut - (fin - plafond))
    fin = plafond
  }
  vue.value = { debut, fin }
}

function pourcent(t: number): number {
  return ((t - vue.value.debut) / etendue.value) * 100
}
const dansLaVue = (t: number) => t >= vue.value.debut && t <= vue.value.fin

/** Zone du tour suivant, de son début à sa fin (ou au bord de la vue). */
const zoneSuivant = computed(() => {
  if (!suivantAffiche.value || debutSuivant.value == null) return null
  const debut = Math.max(0, pourcent(debutSuivant.value))
  const fin = Math.min(100, pourcent(info!.suivant!.fin ?? vue.value.fin))
  return { gauche: debut, largeur: Math.max(0, fin - debut) }
})

// --- Dessin de l'onde ---
const cadreOnde = ref<HTMLElement | null>(null)
const toile = ref<HTMLCanvasElement | null>(null)
const pics = ref<Pics | null>(null)
const etatOnde = ref<'chargement' | 'pret' | 'indisponible'>(url.value ? 'chargement' : 'indisponible')

function dessiner() {
  const canvas = toile.value
  const cadre = cadreOnde.value
  if (!canvas || !cadre) return
  const ratio = window.devicePixelRatio || 1
  const largeur = cadre.clientWidth
  const hauteur = cadre.clientHeight
  canvas.width = Math.round(largeur * ratio)
  canvas.height = Math.round(hauteur * ratio)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, largeur, hauteur)
  const donnees = pics.value
  if (!donnees) return
  // Barres de 2px espacées de 2px, comme la bande du lecteur ; hauteur relative au pic le plus fort de la vue.
  const pas = 4
  const colonnes = Math.floor(largeur / pas)
  const valeurs: number[] = []
  let plusFort = 0
  for (let c = 0; c < colonnes; c++) {
    const t0 = vue.value.debut + (c / colonnes) * etendue.value
    const t1 = vue.value.debut + ((c + 1) / colonnes) * etendue.value
    const i0 = Math.max(0, Math.floor(t0 * PICS_PAR_SECONDE))
    const i1 = Math.min(donnees.length, Math.max(i0 + 1, Math.ceil(t1 * PICS_PAR_SECONDE)))
    let v = 0
    for (let i = i0; i < i1; i++) if (donnees[i] > v) v = donnees[i]
    valeurs.push(v)
    if (v > plusFort) plusFort = v
  }
  const milieu = hauteur / 2
  ctx.fillStyle = '#9aa0a6'
  valeurs.forEach((v, c) => {
    const h = Math.max(2, (v / (plusFort || 1)) * (hauteur - 16))
    ctx.fillRect(c * pas + 1, milieu - h / 2, 2, h)
  })
}

let observateur: ResizeObserver | null = null
onMounted(async () => {
  dialogue.value?.showModal()
  await nextTick()
  if (cadreOnde.value) {
    observateur = new ResizeObserver(() => dessiner())
    observateur.observe(cadreOnde.value)
  }
  dessiner()
  if (url.value) {
    const resultat = await chargerPics(url.value)
    pics.value = resultat
    etatOnde.value = resultat ? 'pret' : 'indisponible'
    dessiner()
  }
})
watch(vue, () => dessiner())

// --- Glisser une borne sur l'onde ---
const glissee = ref<number | null>(null)
const glisseeSuivant = ref(false)
const gliseePrecedent = ref(false)
function tempsAuPointeur(e: PointerEvent): number {
  const rect = cadreOnde.value!.getBoundingClientRect()
  return vue.value.debut + ((e.clientX - rect.left) / rect.width) * etendue.value
}
let glisserSeule = false
function commencerGlisser(k: number, e: PointerEvent) {
  glissee.value = k
  glisserSeule = e.altKey
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function glisser(k: number, e: PointerEvent) {
  if (glissee.value === k) changerTemps(k, tempsAuPointeur(e), glisserSeule)
}
function finirGlisser() {
  glissee.value = null
  glisseeSuivant.value = false
  gliseePrecedent.value = false
}
function commencerGlisserPrecedent(e: PointerEvent) {
  gliseePrecedent.value = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function glisserPrecedentPointeur(e: PointerEvent) {
  if (gliseePrecedent.value) changerFinPrecedent(tempsAuPointeur(e))
}
function deplacerPrecedentAuClavier(e: KeyboardEvent) {
  const sens = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
  if (!sens) return
  e.preventDefault()
  changerFinPrecedent((finPrecedent.value ?? 0) + sens * (e.shiftKey ? 1 : 0.1))
}
function commencerGlisserSuivant(e: PointerEvent) {
  glisseeSuivant.value = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function glisserSuivantPointeur(e: PointerEvent) {
  if (glisseeSuivant.value) changerDebutSuivant(tempsAuPointeur(e))
}
/** Flèches sur une borne : ±0,1 s (±1 s avec Maj, borne seule avec Alt). */
function deplacerAuClavier(k: number, e: KeyboardEvent) {
  const sens = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
  if (!sens) return
  e.preventDefault()
  changerTemps(k, brouillon.value[k] + sens * (e.shiftKey ? 1 : 0.1), e.altKey)
}
function deplacerSuivantAuClavier(e: KeyboardEvent) {
  const sens = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
  if (!sens) return
  e.preventDefault()
  changerDebutSuivant((debutSuivant.value ?? 0) + sens * (e.shiftKey ? 1 : 0.1))
}

// --- Écoute ---
const lectureJusqua = ref<number | null>(null)
const passageEcoute = ref<number | null>(null)
const peutEcouter = computed(() => !!url.value && duree.value > 0)

function ecouter(debut: number, fin: number, passage: number | null = null) {
  if (!peutEcouter.value) return
  seek(debut)
  lectureJusqua.value = fin
  passageEcoute.value = passage
  if (!enLecture.value) basculer()
}
function arreter() {
  lectureJusqua.value = null
  passageEcoute.value = null
  if (enLecture.value) pause()
}
function basculerTour() {
  if (enLecture.value) arreter()
  else ecouter(brouillon.value[premier], brouillon.value[dernier])
}
function basculerPassage(i: number) {
  const p = passages[i]
  if (enLecture.value && passageEcoute.value === i) arreter()
  else ecouter(brouillon.value[p.de], brouillon.value[p.a], i)
}
/** Clic sur l'onde : écoute à partir de ce point jusqu'à la fin du tour (quelques secondes au-delà). */
function clicOnde(e: PointerEvent) {
  if (glissee.value != null || glisseeSuivant.value || gliseePrecedent.value) return
  const t = tempsAuPointeur(e)
  const finTour = brouillon.value[dernier]
  ecouter(t, t < finTour ? finTour : t + 5)
}
watch(position, (t) => {
  if (lectureJusqua.value != null && t >= lectureJusqua.value) arreter()
})
watch(enLecture, (lit) => {
  if (!lit) {
    lectureJusqua.value = null
    passageEcoute.value = null
  }
})

// --- Navigation entre tours ---
const navigation = info?.navigation
function allerTour(posBloc: number | null) {
  if (posBloc == null || aDesChangements.value) return
  if (enLecture.value) arreter()
  tourHorodatage.value = posBloc
}
const raisonNavigation = computed(() =>
  aDesChangements.value ? 'Enregistrez ou annulez vos changements avant de changer de tour' : '',
)

// Taille fixe pour un tour donné : elle ne suit pas la taille de la fenêtre de l'application.
// La liste des passages défile dans l'espace qui reste.
const hauteurFenetre =
  440 + (precedentEditable.value || suivantAffiche.value ? 44 : 0) + 44 * Math.min(passages.length, 5)

// --- Fermeture ---
const dialogue = ref<HTMLDialogElement | null>(null)
function fermer() {
  if (lectureJusqua.value != null) arreter()
  emit('fermer')
}
/**
 *  Repart des temps enregistrés : la fenêtre est remontée à partir du modèle.
 *  Sert à « Annuler » (on abandonne les changements) et après « Enregistrer »
 *  (plus aucun changement en attente, donc la navigation redevient libre).
 */
async function recharger() {
  if (lectureJusqua.value != null) arreter()
  const posBloc = props.posBloc
  tourHorodatage.value = null
  await nextTick()
  tourHorodatage.value = posBloc
}
async function enregistrer() {
  if (!entretienEditable.value) return
  const debut = suivantModifie.value ? debutSuivant.value : null
  const fin = finPrecedentModifiee.value ? finPrecedent.value : null
  // Les ancres vides après la fin du tour prennent cette fin : aucun temps ne dépasse le tour.
  const temps = brouillon.value.map((t, k) => (k < premier ? brouillon.value[premier] : k > dernier ? brouillon.value[dernier] : t))
  if (enregistrerHorodatageTour(props.posBloc, temps, debut, fin)) await recharger()
}
onBeforeUnmount(() => {
  observateur?.disconnect()
  if (dialogue.value?.open) dialogue.value.close()
})

function extrait(texte: string): string {
  return texte.length > 140 ? texte.slice(0, 140).trimEnd() + '…' : texte
}
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialogue"
      class="fenetre-horodatage"
      aria-labelledby="titre-horodatage"
      :style="{ '--couleur-tour': couleur, height: hauteurFenetre + 'px' }"
      @cancel.prevent="fermer"
    >
      <header class="tete">
        <h2 id="titre-horodatage">Temps du tour — {{ info?.nom ?? 'Tour' }}</h2>
        <div v-if="navigation" class="navigation-tour">
          <button
            type="button"
            aria-label="Tour précédent"
            :disabled="navigation.precedent == null || aDesChangements"
            :title="raisonNavigation || 'Tour précédent'"
            @click="allerTour(navigation.precedent)"
          >‹</button>
          <span>{{ navigation.rang }} / {{ navigation.total }}</span>
          <button
            type="button"
            aria-label="Tour suivant"
            :disabled="navigation.suivant == null || aDesChangements"
            :title="raisonNavigation || 'Tour suivant'"
            @click="allerTour(navigation.suivant)"
          >›</button>
        </div>
        <button type="button" class="fermer" aria-label="Fermer sans enregistrer" @click="fermer">✕</button>
      </header>

      <p v-if="creation" class="aide">
        Ce tour n’a pas encore de temps. Indiquez son début et sa fin, sur l’onde ou dans les champs.
      </p>

      <div class="bornes-tour">
        <label>
          Début
          <input
            :value="formaterTemps(brouillon[premier])"
            data-role="tour-debut"
            :class="{ invalide: saisieInvalide === `${premier}-tour-debut` }"
            @change="saisir(premier, $event)"
            @keydown.enter.prevent="saisir(premier, $event)"
          />
        </label>
        <label>
          Fin
          <input
            :value="formaterTemps(brouillon[dernier])"
            data-role="tour-fin"
            :class="{ invalide: saisieInvalide === `${dernier}-tour-fin` }"
            @change="saisir(dernier, $event)"
            @keydown.enter.prevent="saisir(dernier, $event)"
          />
        </label>
        <span class="duree">{{ formaterDuree(brouillon[dernier] - brouillon[premier]) }}</span>
        <span class="espace"></span>
        <button
          type="button"
          class="ecouter-tour"
          :disabled="!peutEcouter"
          :title="peutEcouter ? '' : 'Aucun audio n’est chargé pour cet entretien'"
          @click="basculerTour"
        >
          {{ enLecture ? '⏸ Arrêter' : '▶ Écouter le tour' }}
        </button>
      </div>
      <div class="bornes-voisins">
        <label v-if="precedentEditable && info?.precedent" class="fin-precedent" :style="{ color: info.precedent.couleur }">
          Fin précédent
          <input
            :value="formaterTemps(finPrecedent ?? 0)"
            data-role="precedent-fin"
            :title="info.precedent.nom"
            :class="{ invalide: saisieInvalide === 'precedent-fin' }"
            @change="saisirPrecedent($event)"
            @keydown.enter.prevent="saisirPrecedent($event)"
          />
        </label>
        <label v-if="suivantAffiche && info?.suivant" class="debut-suivant" :style="{ color: info.suivant.couleur }">
          Début suivant
          <input
            :value="formaterTemps(debutSuivant ?? 0)"
            data-role="suivant-debut"
            :title="info.suivant.nom"
            :class="{ invalide: saisieInvalide === 'suivant-debut' }"
            @change="saisirSuivant($event)"
            @keydown.enter.prevent="saisirSuivant($event)"
          />
        </label>
      </div>

      <div class="outils-onde">
        <span class="fenetre-temps">{{ formaterTemps(vue.debut) }} – {{ formaterTemps(vue.fin) }}</span>
        <span class="espace"></span>
        <button type="button" title="Afficher moins de temps autour du tour" @click="zoomer(1 / 1.6)">− Resserrer</button>
        <button type="button" title="Afficher plus de temps autour du tour" @click="zoomer(1.6)">+ Élargir</button>
        <button type="button" title="Revenir au tour entier" @click="cadrer">Recadrer</button>
      </div>

      <div ref="cadreOnde" class="onde" @pointerdown.self="clicOnde">
        <canvas ref="toile" aria-hidden="true"></canvas>
        <p v-if="etatOnde !== 'pret'" class="onde-message">
          {{ etatOnde === 'chargement' ? 'Préparation de la forme d’onde…' : 'Forme d’onde indisponible : modifiez les temps dans les champs.' }}
        </p>
        <!-- Zone du tour précédent, pour le situer : lecture seule. -->
        <span
          v-if="zonePrecedent && info?.precedent"
          class="zone-precedent"
          :style="{
            left: zonePrecedent.gauche + '%',
            width: zonePrecedent.largeur + '%',
            '--couleur-precedent': info.precedent.couleur,
          }"
        >
          <span class="nom-precedent">{{ info.precedent.nom }}</span>
        </span>
        <!-- Zone du tour suivant, dans la couleur de son locuteur. -->
        <span
          v-if="zoneSuivant && info?.suivant"
          class="zone-suivant"
          :style="{
            left: zoneSuivant.gauche + '%',
            width: zoneSuivant.largeur + '%',
            '--couleur-suivant': info.suivant.couleur,
          }"
        >
          <span class="nom-suivant">{{ info.suivant.nom }}</span>
        </span>
        <!-- Zones des passages, puis bornes déplaçables. -->
        <span
          v-for="(p, i) in (avecAudio ? passages : [])"
          :key="'z' + i"
          class="zone-passage"
          :class="{ ecoute: passageEcoute === i, impaire: i % 2 === 1 }"
          :style="{
            left: Math.max(0, pourcent(brouillon[p.de])) + '%',
            width: Math.max(0, Math.min(100, pourcent(brouillon[p.a])) - Math.max(0, pourcent(brouillon[p.de]))) + '%',
          }"
        ></span>
        <span
          v-for="k in affichees"
          v-show="dansLaVue(brouillon[k])"
          :key="'b' + k"
          class="borne"
          :class="{ debut: debutsDePassage.has(k), glissee: glissee === k, 'pres-du-bord': pourcent(brouillon[k]) > 85 }"
          :style="{ left: pourcent(brouillon[k]) + '%' }"
          role="slider"
          tabindex="0"
          :aria-label="debutsDePassage.has(k) ? 'Début de passage' : 'Fin de passage'"
          :aria-valuenow="brouillon[k]"
          :aria-valuetext="formaterTemps(brouillon[k])"
          @pointerdown.stop="commencerGlisser(k, $event)"
          @pointermove="glisser(k, $event)"
          @pointerup="finirGlisser"
          @pointercancel="finirGlisser"
          @keydown="deplacerAuClavier(k, $event)"
        >
          <span class="etiquette">{{ formaterTemps(brouillon[k]) }}</span>
        </span>
        <!-- Fin du tour précédent : borne dans sa couleur, décalable dans l'intervalle du tour précédent. -->
        <span
          v-if="precedentEditable && info?.precedent"
          v-show="dansLaVue(finPrecedent ?? 0)"
          class="borne borne-precedent"
          :class="{ glissee: gliseePrecedent, 'pres-du-bord': pourcent(finPrecedent ?? 0) > 85 }"
          :style="{ left: pourcent(finPrecedent ?? 0) + '%', '--couleur-precedent': info.precedent.couleur }"
          role="slider"
          tabindex="0"
          aria-label="Fin du tour précédent"
          :aria-valuenow="finPrecedent ?? 0"
          :aria-valuetext="formaterTemps(finPrecedent ?? 0)"
          @pointerdown.stop="commencerGlisserPrecedent($event)"
          @pointermove="glisserPrecedentPointeur($event)"
          @pointerup="finirGlisser"
          @pointercancel="finirGlisser"
          @keydown="deplacerPrecedentAuClavier($event)"
        >
          <span class="etiquette">{{ formaterTemps(finPrecedent ?? 0) }}</span>
        </span>
        <!-- Début du tour suivant : borne dans sa couleur, décalable comme les autres. -->
        <span
          v-if="suivantAffiche && info?.suivant"
          v-show="dansLaVue(debutSuivant ?? 0)"
          class="borne borne-suivant"
          :class="{ glissee: glisseeSuivant, 'pres-du-bord': pourcent(debutSuivant ?? 0) > 85 }"
          :style="{ left: pourcent(debutSuivant ?? 0) + '%', '--couleur-suivant': info.suivant.couleur }"
          role="slider"
          tabindex="0"
          aria-label="Début du tour suivant"
          :aria-valuenow="debutSuivant ?? 0"
          :aria-valuetext="formaterTemps(debutSuivant ?? 0)"
          @pointerdown.stop="commencerGlisserSuivant($event)"
          @pointermove="glisserSuivantPointeur($event)"
          @pointerup="finirGlisser"
          @pointercancel="finirGlisser"
          @keydown="deplacerSuivantAuClavier($event)"
        >
          <span class="etiquette">{{ formaterTemps(debutSuivant ?? 0) }}</span>
        </span>
        <span v-if="enLecture && dansLaVue(position)" class="tete-lecture" :style="{ left: pourcent(position) + '%' }"></span>
      </div>
      <p class="aide-onde">
        Glissez une borne pour la déplacer (flèches : ±0,1 s, Maj : ±1 s) ; deux passages qui se touchent bougent
        ensemble, Alt les sépare. Cliquez sur l’onde pour écouter à partir de ce point.
      </p>

      <ol v-if="passages.length > 0" class="passages">
        <li v-for="(p, i) in passages" :key="i" :class="{ ecoute: passageEcoute === i }">
          <button
            v-if="avecAudio"
            type="button"
            class="ecouter-passage"
            :disabled="!peutEcouter"
            :aria-label="`Écouter le passage ${i + 1}`"
            @click="basculerPassage(i)"
          >
            {{ enLecture && passageEcoute === i ? '⏸' : '▶' }}
          </button>
          <span class="texte-passage">{{ extrait(p.texte) }}</span>
          <template v-if="avecAudio">
            <input
              :value="formaterTemps(brouillon[p.de])"
              data-role="debut"
              :aria-label="`Début du passage ${i + 1}`"
              :class="{ invalide: saisieInvalide === `${p.de}-debut` }"
              @change="saisir(p.de, $event)"
              @keydown.enter.prevent="saisir(p.de, $event)"
            />
            <span class="fleche">→</span>
            <input
              :value="formaterTemps(brouillon[p.a])"
              data-role="fin"
              :aria-label="`Fin du passage ${i + 1}`"
              :class="{ invalide: saisieInvalide === `${p.a}-fin` }"
              @change="saisir(p.a, $event)"
              @keydown.enter.prevent="saisir(p.a, $event)"
            />
          </template>
        </li>
      </ol>

      <p v-if="saisieInvalide" class="erreur" role="alert">
        Temps non reconnu. Écrivez par exemple 12,4 ou 1:05.2.
      </p>
      <p v-if="!entretienEditable" class="erreur">Cet entretien est en lecture seule : les temps ne peuvent pas être modifiés.</p>

      <footer class="pied">
        <button
          type="button"
          :disabled="!aDesChangements"
          title="Revenir aux temps enregistrés"
          @click="recharger"
        >Annuler</button>
        <button type="button" class="principal" :disabled="!modifie || !entretienEditable" @click="enregistrer">
          Enregistrer
        </button>
      </footer>
    </dialog>
  </Teleport>
</template>

<style scoped>
.fenetre-horodatage {
  box-sizing: border-box;
  width: 60rem;
  max-width: none;
  max-height: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 1.2rem 1.4rem;
  border: 1px solid #c9d8ef;
  border-radius: 10px;
  color: #2b3d55;
  background: #fff;
  box-shadow: 0 12px 40px #0003;
}
.fenetre-horodatage > :not(.passages) {
  flex: none;
}
.fenetre-horodatage::backdrop {
  background: #0006;
}
.tete {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.tete h2 {
  flex: 1;
  margin: 0;
  font-size: 1.1rem;
}
.navigation-tour {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  color: #6b7480;
  font-size: 0.85rem;
  white-space: nowrap;
}
.navigation-tour button {
  width: 1.9rem;
  height: 1.9rem;
  padding: 0;
  font-size: 1rem;
}
.fermer {
  border: none;
  background: none;
  color: #6b7480;
  font-size: 1rem;
  cursor: pointer;
}
.aide {
  margin: 0.8rem 0 0;
  color: #5b6573;
}
.bornes-voisins {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.8rem;
  margin-top: 0.6rem;
}
.bornes-tour,
.outils-onde {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.8rem;
  margin-top: 1rem;
}
.bornes-tour label {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 600;
  white-space: nowrap;
}
.ecouter-tour {
  white-space: nowrap;
}
.espace {
  flex: 1;
}
.duree,
.fenetre-temps {
  color: #8a8f98;
  font-size: 0.9rem;
}
input {
  width: 6.5rem;
  box-sizing: border-box;
  padding: 0.25rem 0.45rem;
  border: 1px solid #c9d0da;
  border-radius: 5px;
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  font-size: 0.85rem;
  color: #2a5596;
}
input.invalide {
  border-color: #c62828;
}
button {
  padding: 0.3rem 0.7rem;
  border: 1px solid #c9d0da;
  border-radius: 5px;
  background: #fff;
  color: #2b3d55;
  cursor: pointer;
}
button:hover:not(:disabled) {
  border-color: #2e73d8;
  color: #1565c0;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
.outils-onde {
  margin-top: 0.8rem;
}
.onde {
  position: relative;
  height: 110px;
  margin-top: 0.4rem;
  border: 1px solid #dde3ea;
  border-radius: 8px;
  background: #fafbfc;
  overflow: hidden;
  cursor: pointer;
  user-select: none;
}
.onde canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.onde-message {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  color: #8a8f98;
  pointer-events: none;
}
.zone-passage {
  position: absolute;
  top: 0;
  bottom: 0;
  background: color-mix(in srgb, var(--couleur-tour) 14%, transparent);
  pointer-events: none;
}
.zone-passage.impaire {
  background: color-mix(in srgb, var(--couleur-tour) 26%, transparent);
}
.zone-passage.ecoute {
  background: color-mix(in srgb, var(--couleur-tour) 38%, transparent);
}
/* Tour précédent : bande grisée, lecture seule, bord droit marqué. */
.zone-precedent {
  position: absolute;
  top: 0;
  bottom: 0;
  background: color-mix(in srgb, var(--couleur-precedent) 10%, transparent);
  pointer-events: none;
}
.nom-precedent {
  position: absolute;
  top: 2px;
  right: 6px;
  color: var(--couleur-precedent);
  font-size: 0.7rem;
  font-weight: 600;
  white-space: nowrap;
}
/* Tour suivant : bande dans la couleur de son locuteur, sous les passages. */
.zone-suivant {
  position: absolute;
  top: 0;
  bottom: 0;
  background: color-mix(in srgb, var(--couleur-suivant) 16%, transparent);
  border-left: 2px solid var(--couleur-suivant);
  pointer-events: none;
}
.nom-suivant {
  position: absolute;
  top: 2px;
  left: 6px;
  color: var(--couleur-suivant);
  font-size: 0.7rem;
  font-weight: 600;
  white-space: nowrap;
}
/* Borne : trait bleu foncé, large zone de prise, temps en pastille (en haut pour un début, en bas pour une fin). */
.borne {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 14px;
  margin-left: -7px;
  cursor: ew-resize;
  touch-action: none;
  z-index: 2;
}
.borne::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 6px;
  width: 2px;
  background: var(--couleur-tour);
}
.borne-precedent::before {
  background: var(--couleur-precedent);
}
.borne-precedent .etiquette {
  top: 4px;
  bottom: auto;
  background: color-mix(in srgb, var(--couleur-precedent) 20%, #fff);
  color: var(--couleur-precedent);
}
.borne-suivant::before {
  background: var(--couleur-suivant);
}
.borne:focus-visible {
  outline: none;
}
.borne:focus-visible::before,
.borne.glissee::before {
  left: 5px;
  width: 4px;
}
.etiquette {
  position: absolute;
  bottom: 4px;
  left: 10px;
  padding: 0.05rem 0.45rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--couleur-tour) 16%, #fff);
  color: var(--couleur-tour);
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  font-size: 0.75rem;
  white-space: nowrap;
  pointer-events: none;
}
.borne.debut .etiquette {
  top: 4px;
  bottom: auto;
}
.borne-suivant .etiquette {
  top: 4px;
  bottom: auto;
  background: color-mix(in srgb, var(--couleur-suivant) 20%, #fff);
  color: var(--couleur-suivant);
}
/* Près du bord droit, la pastille passe à gauche du trait pour rester visible. */
.borne.pres-du-bord .etiquette {
  left: auto;
  right: 10px;
}
.tete-lecture {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: #d84315;
  pointer-events: none;
  z-index: 3;
}
.aide-onde {
  margin: 0.35rem 0 0;
  color: #8a8f98;
  font-size: 0.8rem;
}
.passages {
  flex: 1;
  min-height: 0;
  margin: 0.8rem 0 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
  border-top: 1px solid #eef1f5;
}
.passages li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.2rem 0.4rem 0.5rem;
  border-left: 3px solid var(--couleur-tour);
  border-bottom: 1px solid #eef1f5;
}
.passages li.ecoute {
  background: #f1f6fe;
}
.ecouter-passage {
  flex: none;
  width: 2rem;
  padding: 0.2rem 0;
}
.texte-passage {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 0.9rem;
  line-height: 1.35;
}
.fleche {
  color: #8a8f98;
}
.erreur {
  margin: 0.6rem 0 0;
  color: #c62828;
}
.pied {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  margin-top: 1.2rem;
}
.principal {
  border-color: #1565c0;
  background: #2e73d8;
  color: #fff;
}
.principal:hover:not(:disabled) {
  color: #fff;
  background: #1565c0;
}
</style>
