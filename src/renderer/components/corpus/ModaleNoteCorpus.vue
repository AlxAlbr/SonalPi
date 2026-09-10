<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import {
  ATTR_LIENS_NOTE,
  decoreRefsCommentaires,
  pruneRefsCommentaires,
  sanitiserCorpsNote,
} from '../../notes/sanitiser'
import type { ChampsNote, VueNoteCorpus } from '../../../shared/corpus/notes'
import type { NoteCategory } from '../../../shared/format'

const props = defineProps<{
  note: VueNoteCorpus
  categories: NoteCategory[]
  occupe: boolean
}>()
const emit = defineEmits<{
  (e: 'fermer'): void
  (e: 'valider', champs: ChampsNote): void
}>()

const titre = ref(props.note.titre)
const categorieId = ref(props.note.categorieId)
const date = ref(props.note.date ?? '')
const statut = ref<'prive' | 'public'>(props.note.statut)
const corps = ref(props.note.corps)
const zoneCorps = ref<HTMLElement | null>(null)
const champTitre = ref<HTMLInputElement | null>(null)

function commentaireDe(id: string): { auteur: string; texte: string } | null {
  return props.note.liensCommentaires.find((lien) => lien.commentaireId === id) ?? null
}

function saisirCorps(): void {
  if (!zoneCorps.value) return
  pruneRefsCommentaires(zoneCorps.value)
  corps.value = zoneCorps.value.innerHTML
}

function deballer(element: Element): void {
  const parent = element.parentElement
  if (!parent) return
  while (element.firstChild) parent.insertBefore(element.firstChild, element)
  parent.removeChild(element)
}

function passageAncetre(noeud: Node | null, zone: HTMLElement): HTMLElement | null {
  const element = noeud?.nodeType === Node.TEXT_NODE
    ? noeud.parentElement
    : noeud as HTMLElement | null
  const passage = element?.closest('mark') as HTMLElement | null
  return passage && zone.contains(passage) ? passage : null
}

function marquerPassage(): void {
  const zone = zoneCorps.value
  const selection = document.getSelection()
  if (!zone || !selection || selection.rangeCount === 0) return
  const plage = selection.getRangeAt(0)
  const passage = passageAncetre(plage.commonAncestorContainer, zone)
  if (passage) {
    if (passage.hasAttribute(ATTR_LIENS_NOTE)) {
      const lien = document.createElement('em')
      lien.setAttribute(ATTR_LIENS_NOTE, passage.getAttribute(ATTR_LIENS_NOTE) ?? '')
      while (passage.firstChild) lien.appendChild(passage.firstChild)
      passage.replaceWith(lien)
    } else {
      deballer(passage)
    }
    saisirCorps()
    return
  }
  if (plage.collapsed || !zone.contains(plage.commonAncestorContainer)) return
  const marque = document.createElement('mark')
  try {
    plage.surroundContents(marque)
  } catch {
    const contenu = plage.extractContents()
    marque.appendChild(contenu)
    plage.insertNode(marque)
  }
  saisirCorps()
}

function champs(): ChampsNote {
  return {
    categorieId: categorieId.value,
    titre: titre.value,
    date: date.value || null,
    statut: statut.value,
    corps: sanitiserCorpsNote(corps.value, document),
  }
}

function sansChangement(valeur: ChampsNote): boolean {
  return valeur.categorieId === props.note.categorieId &&
    valeur.titre === props.note.titre &&
    valeur.date === props.note.date &&
    valeur.statut === props.note.statut &&
    valeur.corps === props.note.corps
}

function valider(): void {
  if (props.occupe) return
  saisirCorps()
  const valeur = champs()
  if (sansChangement(valeur)) emit('fermer')
  else emit('valider', valeur)
}

function surTouche(event: KeyboardEvent): void {
  if (event.key === 'Escape' && !props.occupe) emit('fermer')
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) valider()
}

onMounted(async () => {
  window.addEventListener('keydown', surTouche)
  await nextTick()
  if (zoneCorps.value) {
    zoneCorps.value.innerHTML = props.note.corps
    decoreRefsCommentaires(zoneCorps.value, document, commentaireDe)
  }
  champTitre.value?.focus()
})

onUnmounted(() => window.removeEventListener('keydown', surTouche))
</script>

<template>
  <Teleport to="body">
    <div class="voile-note" @click.self="!occupe && emit('fermer')">
      <section class="modale-note" role="dialog" aria-modal="true" aria-labelledby="titre-modale-note">
        <h2 id="titre-modale-note">Modifier la note</h2>
        <label>
          Titre
          <input ref="champTitre" v-model="titre" type="text" :disabled="occupe" />
        </label>
        <label>
          Catégorie
          <select v-model="categorieId" :disabled="occupe">
            <option v-for="categorie in categories" :key="categorie.id" :value="categorie.id">
              {{ categorie.nom }}
            </option>
          </select>
        </label>
        <div class="ligne-champs">
          <label>
            Date
            <input v-model="date" type="date" :disabled="occupe" />
          </label>
          <label>
            Statut
            <select v-model="statut" :disabled="occupe">
              <option value="public">Public</option>
              <option value="prive">Privé</option>
            </select>
          </label>
        </div>
        <div class="entete-corps">
          <span>Corps</span>
          <button type="button" :disabled="occupe" title="Marquer la sélection comme importante" @mousedown.prevent @click="marquerPassage">
            ✏ Marquer comme important
          </button>
        </div>
        <div
          ref="zoneCorps"
          class="zone-corps"
          :contenteditable="occupe ? 'false' : 'true'"
          role="textbox"
          aria-multiline="true"
          aria-label="Corps de la note"
          @input="saisirCorps"
        ></div>
        <p class="aide">
          Pour modifier « Concerne » ou lier un passage à un commentaire, ouvrez l’entretien.
          Ctrl+Entrée valide, Échap ferme.
        </p>
        <div class="actions">
          <button type="button" :disabled="occupe" @click="emit('fermer')">Annuler</button>
          <button type="button" class="primaire" :disabled="occupe" @click="valider">
            {{ occupe ? 'Enregistrement…' : 'Valider' }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.voile-note { position: fixed; inset: 0; z-index: 1100; display: flex; align-items: center; justify-content: center; padding: 20px; background: #1e1e286f; }
.modale-note { box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; width: min(680px, 94vw); max-height: 92vh; overflow: auto; padding: 20px; border-radius: 10px; background: #fff; box-shadow: 0 8px 30px #0004; }
h2 { margin: 0 0 4px; font-size: 1.1rem; }
label { display: flex; flex-direction: column; gap: 5px; color: #46515c; font-size: 0.84rem; }
input, select { box-sizing: border-box; width: 100%; padding: 7px; border: 1px solid #b9c2cc; border-radius: 5px; font: inherit; }
.ligne-champs { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.entete-corps { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: #46515c; font-size: 0.84rem; }
.entete-corps button { padding: 5px 8px; }
.zone-corps { min-height: 150px; max-height: 34vh; overflow: auto; padding: 10px; border: 1px solid #b9c2cc; border-radius: 6px; line-height: 1.45; white-space: pre-wrap; }
.zone-corps:focus { border-color: #1565c0; outline: 2px solid #1565c033; }
.zone-corps :deep(mark) { background: #ffe792; font-weight: 600; }
.zone-corps :deep(.ref-note-commentaire) { margin-left: 4px; color: #52606d; font-size: 0.78rem; }
.aide { margin: 0; color: #66727e; font-size: 0.75rem; line-height: 1.4; }
.actions { display: flex; justify-content: flex-end; gap: 8px; }
.actions button { padding: 7px 14px; cursor: pointer; }
.actions .primaire { border-color: #1565c0; border-radius: 5px; background: #1565c0; color: #fff; }
button:disabled { cursor: default; opacity: 0.55; }
@media (max-width: 520px) {
  .ligne-champs { grid-template-columns: 1fr; }
}
</style>
