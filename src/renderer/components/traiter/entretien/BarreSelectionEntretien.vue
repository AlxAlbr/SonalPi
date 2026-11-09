<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Editor } from '@tiptap/core'
import { couleurPourLocuteur } from '../../../../shared/entretien/locuteurs'
import { trouverCodage } from '../../../../shared/entretien/entretien'
import { utiliserSonal } from '../../../composables/sonal'
import { snapToWord } from '../../../editor/snap'
import icoAnon from '../../../assets/icones/anon.png'
import icoCas from '../../../assets/icones/cas.svg'
import icoLocuteurs from '../../../assets/icones/locuteurs.png'
import icoRecueils from '../../../assets/icones/recueils.svg'
import icoThemes from '../../../assets/icones/themes.png'

/**
 *  Barre d'actions affichée au-dessus du texte sélectionné dans la transcription.
 *  Elle reprend les actions existantes de l'entretien,
 *  et n'apparaît que lorsque celui-ci est modifiable.
 */
const emit = defineEmits<{ pseudonymiser: []; ajouterCas: []; ajouterRecueil: [] }>()

const {
  editor,
  entretien,
  vue,
  ouvertId,
  locuteurs,
  attribuerLoc,
  arbreThemes,
  couleurHex,
  coderAvec,
  commenterPlage,
  gesteDisponible,
  lectureSeule,
} = utiliserSonal()

const MARGE_SELECTION = 8
const MARGE_FENETRE = 8

const barre = ref<HTMLElement | null>(null)
const fenetre = ref<HTMLElement | null>(null)
const visible = ref(false)
const horsEcran = ref(false)
const position = ref({ left: 0, top: 0 })
const modale = ref<'locuteur' | 'theme' | null>(null)
const codesDeLaSelection = ref<Set<string>>(new Set())
const associationsDisponibles = computed(() => gesteDisponible('definitionsAvecSources') && !lectureSeule.value)

let selectionEnCours = false
let minuteur = 0
let editeurBranche: Editor | null = null

function selectionUtilisable(ed: Editor) {
  const { from, to, empty } = ed.state.selection
  return !empty && ed.isEditable && ed.state.doc.textBetween(from, to, ' ').trim() !== ''
}

function masquer() {
  visible.value = false
  modale.value = null
}

/** Bas de la zone masquée par les éléments épinglés au-dessus du texte. */
function limiteHaute() {
  return Math.max(...['header', '.barre', '.zone-media'].map(
    (selecteur) => document.querySelector(selecteur)?.getBoundingClientRect().bottom ?? 0,
  ))
}

/** Place la barre au-dessus de la sélection, ou dessous s'il manque de la place. */
function positionner() {
  const ed = editor.value
  const element = barre.value
  if (!ed || !element || !visible.value) return
  const { from, to } = ed.state.selection
  const debut = ed.view.coordsAtPos(from)
  const fin = ed.view.coordsAtPos(to)
  const limite = limiteHaute()
  horsEcran.value = fin.bottom < limite || debut.top > window.innerHeight
  const zone = ed.view.dom.getBoundingClientRect()
  const centre = Math.abs(debut.top - fin.top) < 4 ? (debut.left + fin.right) / 2 : zone.left + zone.width / 2
  const dessus = debut.top - element.offsetHeight - MARGE_SELECTION
  position.value = {
    left: Math.max(MARGE_FENETRE, Math.min(window.innerWidth - element.offsetWidth - MARGE_FENETRE, centre - element.offsetWidth / 2)),
    top: dessus < limite ? fin.bottom + MARGE_SELECTION : dessus,
  }
}

async function afficher() {
  const ed = editor.value
  if (!ed || vue.value !== 'entretien' || !selectionUtilisable(ed)) return
  visible.value = true
  await nextTick()
  positionner()
}

function surDebutSelection() {
  selectionEnCours = true
}

/** Le relâchement peut avoir lieu hors du texte ; l'éditeur met ensuite sa sélection à jour. */
function surRelachement(event: MouseEvent) {
  if (!selectionEnCours || event.button !== 0) return
  selectionEnCours = false
  window.clearTimeout(minuteur)
  minuteur = window.setTimeout(() => void afficher(), 50)
}

function surToucheRelachee(event: KeyboardEvent) {
  if (event.shiftKey || event.key === 'Shift' || (event.ctrlKey && event.key.toLowerCase() === 'a')) void afficher()
}

function surClicGlobal(event: MouseEvent) {
  const cible = event.target as Element | null
  if (!cible?.closest('.barre-selection, .voile-selection')) masquer()
}

function surTouche(event: KeyboardEvent) {
  if (event.key === 'Escape' && visible.value && !modale.value) masquer()
}

function surChangementSelection({ editor: ed }: { editor: Editor }) {
  if (!selectionUtilisable(ed)) masquer()
  else if (visible.value) positionner()
}

function surTransaction({ transaction }: { transaction: { docChanged: boolean } }) {
  if (transaction.docChanged) masquer()
}

function brancher(ed: Editor | null | undefined) {
  if (editeurBranche) {
    editeurBranche.view.dom.removeEventListener('mousedown', surDebutSelection)
    editeurBranche.view.dom.removeEventListener('keyup', surToucheRelachee)
    editeurBranche.off('selectionUpdate', surChangementSelection)
    editeurBranche.off('transaction', surTransaction)
  }
  editeurBranche = ed ?? null
  if (!editeurBranche) return
  editeurBranche.view.dom.addEventListener('mousedown', surDebutSelection)
  editeurBranche.view.dom.addEventListener('keyup', surToucheRelachee)
  editeurBranche.on('selectionUpdate', surChangementSelection)
  editeurBranche.on('transaction', surTransaction)
}

watch(editor, brancher, { immediate: true })
watch([vue, ouvertId], masquer)

onMounted(() => {
  document.addEventListener('mouseup', surRelachement)
  document.addEventListener('mousedown', surClicGlobal, true)
  document.addEventListener('keydown', surTouche)
  window.addEventListener('scroll', positionner, { capture: true, passive: true })
  window.addEventListener('resize', positionner)
})

onBeforeUnmount(() => {
  window.clearTimeout(minuteur)
  brancher(null)
  document.removeEventListener('mouseup', surRelachement)
  document.removeEventListener('mousedown', surClicGlobal, true)
  document.removeEventListener('keydown', surTouche)
  window.removeEventListener('scroll', positionner, { capture: true })
  window.removeEventListener('resize', positionner)
})

function commenter() {
  const selection = editor.value?.state.selection
  masquer()
  if (selection) void commenterPlage(selection.from, selection.to)
}

function declencher(action: 'pseudonymiser' | 'ajouterCas' | 'ajouterRecueil') {
  masquer()
  if (action === 'pseudonymiser') emit('pseudonymiser')
  else if (action === 'ajouterCas') emit('ajouterCas')
  else emit('ajouterRecueil')
}

async function ouvrirModale(type: 'locuteur' | 'theme') {
  const ed = editor.value
  if (ed && type === 'theme') {
    const plage = snapToWord(ed.state, ed.state.selection.from, ed.state.selection.to)
    codesDeLaSelection.value = new Set(
      arbreThemes().map((noeud) => noeud.cat.id).filter((code) => trouverCodage(entretien, { ...plage, code })),
    )
  }
  modale.value = type
  await nextTick()
  fenetre.value?.querySelector<HTMLElement>('.choix-selection:not([disabled])')?.focus()
}

async function fermerModale() {
  modale.value = null
  editor.value?.commands.focus(undefined, { scrollIntoView: false })
  await nextTick()
  positionner()
}

function terminerChoix() {
  masquer()
  editor.value?.commands.focus(undefined, { scrollIntoView: false })
}

function choisirLocuteur(index: number | null) {
  attribuerLoc(index)
  terminerChoix()
}

function choisirTheme(id: string) {
  coderAvec(id)
  terminerChoix()
}

function garderFocus(event: KeyboardEvent) {
  if (event.key !== 'Tab' || !fenetre.value) return
  const elements = fenetre.value.querySelectorAll<HTMLElement>('button:not([disabled])')
  const premier = elements.item(0)
  const dernier = elements.item(elements.length - 1)
  if (event.shiftKey && document.activeElement === premier) {
    event.preventDefault()
    dernier?.focus()
  } else if (!event.shiftKey && document.activeElement === dernier) {
    event.preventDefault()
    premier?.focus()
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-show="visible && !modale"
      ref="barre"
      class="barre-selection"
      role="toolbar"
      aria-label="Actions sur la sélection"
      :style="{ left: `${position.left}px`, top: `${position.top}px`, visibility: horsEcran ? 'hidden' : 'visible' }"
      @mousedown.prevent
    >
      <button title="Commenter" aria-label="Commenter" @click="commenter">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
        </svg>
      </button>
      <button title="Assigner un locuteur" aria-label="Assigner un locuteur" @click="ouvrirModale('locuteur')">
        <img :src="icoLocuteurs" alt="" draggable="false" />
      </button>
      <button title="Pseudonymiser" aria-label="Pseudonymiser" @click="declencher('pseudonymiser')">
        <img :src="icoAnon" alt="" draggable="false" />
      </button>
      <button title="Assigner une thématique" aria-label="Assigner une thématique" @click="ouvrirModale('theme')">
        <img :src="icoThemes" alt="" draggable="false" />
      </button>
      <template v-if="associationsDisponibles">
        <button title="Ajouter à un cas" aria-label="Ajouter à un cas" @click="declencher('ajouterCas')">
          <img :src="icoCas" alt="" draggable="false" />
        </button>
        <button title="Ajouter à un recueil" aria-label="Ajouter à un recueil" @click="declencher('ajouterRecueil')">
          <img :src="icoRecueils" alt="" draggable="false" />
        </button>
      </template>
    </div>

    <div
      v-if="modale"
      class="voile-selection"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titre-choix-selection"
      @click.self="fermerModale"
      @keydown.esc.stop.prevent="fermerModale"
      @keydown="garderFocus"
    >
      <section ref="fenetre" class="modale-selection">
        <div class="tete-choix">
          <h3 id="titre-choix-selection">{{ modale === 'locuteur' ? 'Assigner un locuteur' : 'Assigner une thématique' }}</h3>
          <button class="fermer-choix" title="Fermer" aria-label="Fermer" @click="fermerModale">✕</button>
        </div>

        <div v-if="modale === 'locuteur'" class="liste-choix">
          <button v-for="l in locuteurs" :key="l.index" class="choix-selection" @click="choisirLocuteur(l.index)">
            <span class="pastille-choix" :style="{ background: l.couleur ?? couleurPourLocuteur(l.index) }"></span>
            <span :style="{ color: l.couleur ?? couleurPourLocuteur(l.index) }">{{ l.nom }}</span>
          </button>
          <button class="choix-selection aucun" @click="choisirLocuteur(null)">
            <span class="pastille-choix vide"></span>
            <span>aucun</span>
          </button>
        </div>

        <div v-else class="liste-choix">
          <p v-if="arbreThemes().length === 0" class="aucun-theme">Aucune thématique pour l’instant. Créez-en dans l’onglet Thématiques.</p>
          <button
            v-for="n in arbreThemes()"
            :key="n.cat.id"
            class="choix-selection"
            :style="{ marginLeft: `${n.profondeur * 1.1}rem`, width: `calc(100% - ${n.profondeur * 1.1}rem)` }"
            :disabled="!n.cat.actif && !codesDeLaSelection.has(n.cat.id)"
            :title="codesDeLaSelection.has(n.cat.id) ? 'Déjà assignée : cliquer pour la retirer de ce passage' : undefined"
            @click="choisirTheme(n.cat.id)"
          >
            <span class="pastille-choix" :style="{ background: couleurHex(n.cat) }"></span>
            <span class="nom-choix">{{ n.cat.nom }}</span>
            <span v-if="codesDeLaSelection.has(n.cat.id)" class="deja-choisi" aria-label="déjà assignée">✓</span>
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.barre-selection {
  position: fixed;
  z-index: 900;
  display: flex;
  align-items: center;
  gap: 0.15rem;
  padding: 0.25rem 0.4rem;
  border: 1px solid #e3e5ec;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 2px 10px rgba(20, 25, 50, 0.2);
}
.barre-selection button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  color: #222;
  cursor: pointer;
}
.barre-selection button:hover {
  background: #e8f0fb;
}
.barre-selection button:focus-visible {
  outline: 2px solid #2e73d8;
  outline-offset: -2px;
}
.barre-selection img {
  width: 20px;
  height: 20px;
  object-fit: contain;
}
.voile-selection {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 12vh 1rem 0;
  background: rgba(30, 30, 40, 0.45);
}
.modale-selection {
  box-sizing: border-box;
  width: min(22rem, 94vw);
  max-height: 76vh;
  overflow-y: auto;
  padding: 0.8rem 1rem 1rem;
  border: 1px solid #d6dce8;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
}
.tete-choix {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.6rem;
}
.tete-choix h3 {
  margin: 0;
  font-size: 0.95rem;
}
.fermer-choix {
  border: none;
  background: none;
  color: #888;
  cursor: pointer;
  font-size: 0.9rem;
}
.liste-choix {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.choix-selection {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  box-sizing: border-box;
  width: 100%;
  border: 1px solid #e5e5ef;
  border-radius: 6px;
  background: #fff;
  color: #333;
  padding: 0.35rem 0.5rem;
  font-size: 0.82rem;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.choix-selection:hover:not(:disabled) {
  border-color: #2e73d8;
  background: #f0f6ff;
}
.choix-selection:focus-visible {
  outline: 2px solid #2e73d8;
  outline-offset: 1px;
}
.choix-selection:disabled {
  opacity: 0.4;
  cursor: default;
}
.choix-selection.aucun {
  color: #777;
}
.pastille-choix {
  width: 12px;
  height: 12px;
  flex: none;
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 50%;
}
.pastille-choix.vide {
  border-color: #c5c5ce;
}
.nom-choix {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.deja-choisi {
  flex: none;
  color: #1565c0;
}
.aucun-theme {
  margin: 0;
  color: #666;
  font-size: 0.8rem;
}
</style>
