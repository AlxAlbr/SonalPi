<script setup lang="ts">
import { ref, watch } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import EditionVariables from '../partages/donnees/EditionVariables.vue'

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

// Le panneau sépare les deux portées en sous-onglets ; le crayon, sous les
// onglets, crée une variable de la portée AFFICHÉE.
const sousOnglet = ref<'entretien' | 'locuteur'>('locuteur')

// Si un seul niveau porte des variables, s'y installer d'office (le panneau
// reste monté quand on change d'onglet ou d'entretien).
watch(
  () => [varsGen().length, varsLoc().length] as const,
  ([nbGen, nbLoc]) => {
    if (sousOnglet.value === 'entretien' && !nbGen && nbLoc) sousOnglet.value = 'locuteur'
    else if (sousOnglet.value === 'locuteur' && !nbLoc && nbGen) sousOnglet.value = 'entretien'
  },
  { immediate: true },
)

/** Ouvre l'édition des variables, bornée à la portée affichée. */
function ouvrirEdition() {
  editerVariables.value = true
}
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
    </div>

    <nav class="sous-onglets" role="tablist" aria-label="Portée des valeurs">
      <div class="sous-onglet" role="presentation">
        <button
          class="sous-onglet-bouton"
          data-portee="locuteur"
          :class="{ actif: sousOnglet === 'locuteur' }"
          role="tab"
          :aria-selected="sousOnglet === 'locuteur'"
          @click="sousOnglet = 'locuteur'"
        >Locuteur</button>
      </div>
      <div class="sous-onglet" role="presentation">
        <button
          class="sous-onglet-bouton"
          data-portee="entretien"
          :class="{ actif: sousOnglet === 'entretien' }"
          role="tab"
          :aria-selected="sousOnglet === 'entretien'"
          @click="sousOnglet = 'entretien'"
        >Entretien</button>
      </div>
    </nav>

    <button
      v-if="!lectureSeule"
      class="crayon nouvelle-var"
      :title="sousOnglet === 'locuteur'
        ? 'Créer une variable de locuteur (une valeur par locuteur)'
        : 'Créer une variable d’entretien (une valeur par entretien)'"
      @click="ouvrirEdition"
    >✏️</button>

    <template v-if="sousOnglet === 'entretien'">
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
      <p v-if="!varsGen().length" class="vide">Aucune variable d’entretien — ✏️ pour en créer.</p>
    </template>

    <template v-else>
      <template v-if="varsLoc().length && locuteurs.length">
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
      <p v-else-if="varsLoc().length" class="vide">Aucun locuteur dans cet entretien.</p>
      <p v-else class="vide">Aucune variable de locuteur — ✏️ pour en créer.</p>
    </template>

    <Teleport to="body">
      <EditionVariables v-if="editerVariables" :portee="sousOnglet" @fermer="editerVariables = false" />
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

/* Sous-onglets « Locuteur » / « Entretien » : chaque pastille porte la couleur
   de sa portée (les mêmes que les badges « ent » / « loc » de la fenêtre
   d'édition des variables) ; le crayon, sous les onglets, suit la portée
   affichée. */
.sous-onglets {
  display: flex;
  gap: 0.3rem;
  border-bottom: 1px solid #e5e5ef;
  padding-bottom: 0.3rem;
  margin-bottom: 0.3rem;
}
.sous-onglet {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex: 1;
  min-width: 0;
}
.sous-onglet-bouton {
  flex: 1;
  min-width: 0;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 6px 6px 0 0;
  padding: 0.25rem 0.4rem;
  cursor: pointer;
  font-size: 0.78rem;
  color: #555;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sous-onglet-bouton.actif[data-portee='entretien'] {
  border-color: #e5e5ef;
  background: #f5f6ff;
  color: #5c6bc0;
  font-weight: 600;
}
.sous-onglet-bouton.actif[data-portee='locuteur'] {
  border-color: #e5e5ef;
  background: #faf5ec;
  color: #8a6d3b;
  font-weight: 600;
}
.nouvelle-var {
  display: block;
  margin-left: auto; /* colle le crayon au bord droit, sous les onglets */
  margin-bottom: 0.4rem;
}
</style>
