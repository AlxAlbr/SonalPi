<script setup lang="ts">
/**
 *  Fenêtre d'horodatage d'un tour de parole : la forme d'onde du tour, ses
 *  passages et leurs bornes, modifiables en glissant sur l'onde ou en saisissant
 *  les temps. Rien n'est enregistré avant « Enregistrer ».
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import { chargerPics, PICS_PAR_SECONDE, type Pics } from '../../../audio/enveloppeFine'
import { formaterDuree, formaterTemps, lireTemps } from '../../../../shared/entretien/horodatage'

const props = defineProps<{ posBloc: number }>()
const emit = defineEmits<{ fermer: [] }>()

const { audio, lireHorodatageTour, enregistrerHorodatageTour, entretienEditable } = utiliserSonal()
const { url, duree, position, enLecture, seek, basculer, pause } = audio

const info = lireHorodatageTour(props.posBloc)
// Tour pas encore horodaté : on part d'un passage unique autour du repère estimé.
const creation = !info || info.temps.length < 2
const passages = creation ? [{ de: 0, a: 1, texte: info?.texte ?? '' }] : info!.passages
const minimum = info?.min ?? 0
const maximum = computed(() => info?.max ?? (duree.value > 0 ? duree.value : Number.POSITIVE_INFINITY))

function borner(t: number, bas: number, haut: number): number {
  return Math.min(haut, Math.max(bas, t))
}

const brouillon = ref<number[]>(
  creation
    ? (() => {
        const debut = borner(info?.repere ?? position.value, minimum, maximum.value)
        return [debut, borner(debut + 5, debut, maximum.value)]
      })()
    : [...info!.temps],
)
const dernier = brouillon.value.length - 1

// Ancres affichées : celles qui bornent un passage. Les autres suivent leurs voisines.
const visibles = [...new Set([0, dernier, ...passages.flatMap((p) => [p.de, p.a])])].sort((x, y) => x - y)
const debutsDePassage = new Set(passages.map((p) => p.de))

const estPassage = (i: number, j: number) => passages.some((p) => p.de === i && p.a === j)

/**
 *  Bornes qui bougent avec `k` : la fin d'un passage et le début du suivant restent soudées
 *  tant qu'elles sont au même temps (pas de silence entre les deux).
 *  `seule` détache la borne de ses voisines.
 */
function groupeDe(k: number, seule: boolean): number[] {
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
  const avant = visibles[visibles.indexOf(groupe[0]) - 1]
  const apres = visibles[visibles.indexOf(groupe.at(-1)!) + 1]
  const bas = avant == null ? minimum : brouillon.value[avant]
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

const modifie = computed(() => creation || brouillon.value.some((t, k) => t !== info!.temps[k]))

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

// --- Vue de l'onde : fenêtre de temps affichée, élargissable ---
const vue = ref({ debut: 0, fin: 1 })
function cadrer() {
  const debut = brouillon.value[0]
  const fin = brouillon.value[dernier]
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
}
/** Flèches sur une borne : ±0,1 s (±1 s avec Maj, borne seule avec Alt). */
function deplacerAuClavier(k: number, e: KeyboardEvent) {
  const sens = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
  if (!sens) return
  e.preventDefault()
  changerTemps(k, brouillon.value[k] + sens * (e.shiftKey ? 1 : 0.1), e.altKey)
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
  else ecouter(brouillon.value[0], brouillon.value[dernier])
}
function basculerPassage(i: number) {
  const p = passages[i]
  if (enLecture.value && passageEcoute.value === i) arreter()
  else ecouter(brouillon.value[p.de], brouillon.value[p.a], i)
}
/** Clic sur l'onde : écoute à partir de ce point jusqu'à la fin du tour (quelques secondes au-delà). */
function clicOnde(e: PointerEvent) {
  if (glissee.value != null) return
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

// --- Fermeture ---
const dialogue = ref<HTMLDialogElement | null>(null)
function fermer() {
  if (lectureJusqua.value != null) arreter()
  emit('fermer')
}
function enregistrer() {
  if (!entretienEditable.value) return
  if (enregistrerHorodatageTour(props.posBloc, brouillon.value)) fermer()
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
      @cancel.prevent="fermer"
    >
      <header class="tete">
        <h2 id="titre-horodatage">Temps du tour — {{ info?.nom ?? 'Tour' }}</h2>
        <button type="button" class="fermer" aria-label="Fermer sans enregistrer" @click="fermer">✕</button>
      </header>

      <p v-if="creation" class="aide">
        Ce tour n’a pas encore de temps. Indiquez son début et sa fin, sur l’onde ou dans les champs.
      </p>

      <div class="bornes-tour">
        <label>
          Début
          <input
            :value="formaterTemps(brouillon[0])"
            data-role="tour-debut"
            :class="{ invalide: saisieInvalide === '0-tour-debut' }"
            @change="saisir(0, $event)"
            @keydown.enter.prevent="saisir(0, $event)"
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
        <span class="duree">{{ formaterDuree(brouillon[dernier] - brouillon[0]) }}</span>
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
        <!-- Zones des passages, puis bornes déplaçables. -->
        <span
          v-for="(p, i) in passages"
          :key="'z' + i"
          class="zone-passage"
          :class="{ ecoute: passageEcoute === i, impaire: i % 2 === 1 }"
          :style="{
            left: Math.max(0, pourcent(brouillon[p.de])) + '%',
            width: Math.max(0, Math.min(100, pourcent(brouillon[p.a])) - Math.max(0, pourcent(brouillon[p.de]))) + '%',
          }"
        ></span>
        <span
          v-for="k in visibles"
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
        <span v-if="enLecture && dansLaVue(position)" class="tete-lecture" :style="{ left: pourcent(position) + '%' }"></span>
      </div>
      <p class="aide-onde">
        Glissez une borne pour la déplacer (flèches : ±0,1 s, Maj : ±1 s) ; deux passages qui se touchent bougent
        ensemble, Alt les sépare. Cliquez sur l’onde pour écouter à partir de ce point.
      </p>

      <ol v-if="passages.length > 1" class="passages">
        <li v-for="(p, i) in passages" :key="i" :class="{ ecoute: passageEcoute === i }">
          <button
            type="button"
            class="ecouter-passage"
            :disabled="!peutEcouter"
            :aria-label="`Écouter le passage ${i + 1}`"
            @click="basculerPassage(i)"
          >
            {{ enLecture && passageEcoute === i ? '⏸' : '▶' }}
          </button>
          <span class="texte-passage">{{ extrait(p.texte) }}</span>
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
        </li>
      </ol>

      <p v-if="saisieInvalide" class="erreur" role="alert">
        Temps non reconnu. Écrivez par exemple 12,4 ou 1:05.2.
      </p>
      <p v-if="!entretienEditable" class="erreur">Cet entretien est en lecture seule : les temps ne peuvent pas être modifiés.</p>

      <footer class="pied">
        <button type="button" @click="fermer">Annuler</button>
        <button type="button" class="principal" :disabled="!modifie || !entretienEditable" @click="enregistrer">
          Enregistrer
        </button>
      </footer>
    </dialog>
  </Teleport>
</template>

<style scoped>
.fenetre-horodatage {
  width: min(56rem, calc(100vw - 4rem));
  padding: 1.2rem 1.4rem;
  border: 1px solid #c9d8ef;
  border-radius: 10px;
  color: #2b3d55;
  background: #fff;
  box-shadow: 0 12px 40px #0003;
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
.bornes-tour,
.outils-onde {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-top: 1rem;
}
.bornes-tour label {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 600;
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
  background: rgb(46 115 216 / 0.12);
  pointer-events: none;
}
.zone-passage.impaire {
  background: rgb(46 115 216 / 0.2);
}
.zone-passage.ecoute {
  background: rgb(46 115 216 / 0.3);
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
  background: #1f3f73;
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
  background: #dbe7fa;
  color: #2a5596;
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  font-size: 0.75rem;
  white-space: nowrap;
  pointer-events: none;
}
.borne.debut .etiquette {
  top: 4px;
  bottom: auto;
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
  max-height: 16rem;
  margin: 1rem 0 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
  border-top: 1px solid #eef1f5;
}
.passages li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.2rem;
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
