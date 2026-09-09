<script setup lang="ts">
import { ref } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import EditionVariables from '../donnees/EditionVariables.vue'

defineProps<{ lectureSeule: boolean }>()

const {
  varsGen,
  varsLoc,
  meta,
  locuteurs,
  setValeurGen,
  setValeurLoc,
  modalitesDe,
  modaliteParLibelle,
} = utiliserSonal()

const editerVariables = ref(false)
const AUTRE = ' autre'
const celluleLibre = ref<string | null>(null)
const cleGen = (idVar: string) => `gen|${idVar}`
const cleLoc = (index: number, idVar: string) => `loc|${index}|${idVar}`

function libelleCell(idVar: string, idMod: string | undefined): string {
  if (!idMod) return ''
  return modalitesDe(idVar).find((m) => m.id === idMod)?.lib ?? idMod
}

function surSelectGen(idVar: string, evt: Event) {
  const val = (evt.target as HTMLSelectElement).value
  if (val === AUTRE) celluleLibre.value = cleGen(idVar)
  else setValeurGen(idVar, val)
}

function surSelectLoc(index: number, idVar: string, evt: Event) {
  const val = (evt.target as HTMLSelectElement).value
  if (val === AUTRE) celluleLibre.value = cleLoc(index, idVar)
  else setValeurLoc(index, idVar, val)
}

async function surLibreGen(idVar: string, evt: Event) {
  celluleLibre.value = null
  const lib = (evt.target as HTMLInputElement).value.trim()
  setValeurGen(idVar, lib ? await modaliteParLibelle(idVar, lib) : '')
}

async function surLibreLoc(index: number, idVar: string, evt: Event) {
  celluleLibre.value = null
  const lib = (evt.target as HTMLInputElement).value.trim()
  setValeurLoc(index, idVar, lib ? await modaliteParLibelle(idVar, lib) : '')
}

/** Focalise uniquement le champ ouvert avec l'option « autre… ». */
function focaliserLibre(el: unknown, cle: string) {
  if (el instanceof HTMLInputElement && celluleLibre.value === cle && document.activeElement !== el) {
    el.focus()
  }
}
</script>

<template>
  <aside class="panneau donnees">
    <div class="corpus-tete">
      <h3>Données</h3>
      <button
        v-if="!lectureSeule"
        class="crayon"
        title="Éditer les variables (nom, statut, modalités)"
        @click="editerVariables = true"
      >✏️</button>
    </div>

    <template v-if="varsGen().length">
      <h4 class="h4-ent">Valeurs · cet entretien</h4>
      <div v-for="v in varsGen()" :key="v.id" class="saisie-eav">
        <span class="saisie-eav-lib">{{ v.lib }}</span>
        <input
          v-if="v.modalites.length === 0 || celluleLibre === cleGen(v.id)"
          class="saisie-eav-libre"
          placeholder="texte libre"
          :disabled="lectureSeule"
          :value="celluleLibre === cleGen(v.id) ? '' : libelleCell(v.id, meta.valeursGen[v.id])"
          :ref="(el) => focaliserLibre(el, cleGen(v.id))"
          @keyup.enter="($event.target as HTMLInputElement).blur()"
          @keyup.esc="celluleLibre = null"
          @change="surLibreGen(v.id, $event)"
          @blur="celluleLibre = null"
        />
        <select
          v-else
          class="saisie-eav-sel"
          :disabled="lectureSeule"
          :value="meta.valeursGen[v.id] ?? ''"
          @change="surSelectGen(v.id, $event)"
        >
          <option value="">—</option>
          <option v-for="m in v.modalites" :key="m.id" :value="m.id">{{ m.lib }}</option>
          <option :value="AUTRE">autre…</option>
        </select>
      </div>
    </template>

    <template v-if="varsLoc().length && locuteurs.length">
      <h4 class="h4-loc">Valeurs · par locuteur</h4>
      <div v-for="l in locuteurs" :key="l.index" class="fiche-loc">
        <div class="fiche-loc-nom">{{ l.nom }}</div>
        <div v-for="v in varsLoc()" :key="v.id" class="saisie-eav">
          <span class="saisie-eav-lib">{{ v.lib }}</span>
          <input
            v-if="v.modalites.length === 0 || celluleLibre === cleLoc(l.index, v.id)"
            class="saisie-eav-libre"
            placeholder="texte libre"
            :disabled="lectureSeule"
            :value="celluleLibre === cleLoc(l.index, v.id) ? '' : libelleCell(v.id, l.valeursLoc[v.id])"
            :ref="(el) => focaliserLibre(el, cleLoc(l.index, v.id))"
            @keyup.enter="($event.target as HTMLInputElement).blur()"
            @keyup.esc="celluleLibre = null"
            @change="surLibreLoc(l.index, v.id, $event)"
            @blur="celluleLibre = null"
          />
          <select
            v-else
            class="saisie-eav-sel"
            :disabled="lectureSeule"
            :value="l.valeursLoc[v.id] ?? ''"
            @change="surSelectLoc(l.index, v.id, $event)"
          >
            <option value="">—</option>
            <option v-for="m in v.modalites" :key="m.id" :value="m.id">{{ m.lib }}</option>
            <option :value="AUTRE">autre…</option>
          </select>
        </div>
      </div>
    </template>

    <p v-if="!varsGen().length && !varsLoc().length" class="vide">
      Aucune variable — ✏️ pour en créer.
    </p>

    <Teleport to="body">
      <EditionVariables v-if="editerVariables" @fermer="editerVariables = false" />
    </Teleport>
  </aside>
</template>

<style scoped>
.saisie-eav {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0.2rem 0;
  padding-left: 0.9rem;
}
.saisie-eav-lib {
  flex: 1;
  font-size: 0.8rem;
  color: #444;
}
.saisie-eav-sel {
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.1rem 0.3rem;
  font-size: 0.8rem;
}
.saisie-eav-libre {
  flex: none;
  width: 9.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.1rem 0.3rem;
  font-size: 0.8rem;
}
.saisie-eav-libre::placeholder {
  color: #bbb;
  font-style: italic;
}
.fiche-loc {
  border-top: 1px dashed #eee;
  padding-top: 0.3rem;
  margin-top: 0.3rem;
  padding-left: 0.9rem;
}
.fiche-loc-nom {
  font-size: 0.78rem;
  font-weight: 600;
  color: #000;
}
.h4-ent {
  color: #5c6bc0;
}
.h4-loc {
  color: #8a6d3b;
}
</style>
