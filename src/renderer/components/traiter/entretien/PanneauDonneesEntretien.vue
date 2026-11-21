<script setup lang="ts">
import { ref, watch } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import EditionVariables from '../partages/donnees/EditionVariables.vue'
import type { CibleValeur } from '../../../../shared/corpus/valeursVariables'

defineProps<{ lectureSeule: boolean }>()

const {
  varsGen,
  varsLoc,
  meta,
  locuteurs,
  ouvertId,
  poserValeurEntretien,
  poserValeurLibelleEntretien,
  modalitesDe,
} = utiliserSonal()

const editerVariables = ref(false)

// Le panneau sépare les deux portées en sous-onglets ; le crayon, sous les
// onglets, ouvre l'édition des variables bornée à la portée AFFICHÉE.
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
const cleValeur = (cible: CibleValeur, idVar: string) => JSON.stringify([ouvertId.value, cible, idVar])
watch([ouvertId, locuteurs], () => { celluleLibre.value = null })

function libelleCell(idVar: string, idMod: string | undefined): string {
  if (!idMod) return ''
  return modalitesDe(idVar).find((m) => m.id === idMod)?.lib ?? idMod
}

function surSelect(cible: CibleValeur, idVar: string, evt: Event) {
  const entretienId = ouvertId.value
  if (!entretienId) return
  const val = (evt.target as HTMLSelectElement).value
  if (val === AUTRE) celluleLibre.value = cleValeur(cible, idVar)
  else poserValeurEntretien({ entretienId, cible, idVar, idMod: val })
}

function surLibre(cible: CibleValeur, idVar: string, evt: Event) {
  celluleLibre.value = null
  return poserValeurLibelleEntretien(cible, idVar, (evt.target as HTMLInputElement).value.trim())
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

    <div class="gabarit-entete">
      <div class="gabarit-actions">
        <button
          v-if="!lectureSeule"
          type="button"
          class="gabarit-action nouvelle-var"
          :title="sousOnglet === 'locuteur'
            ? 'Créer une variable de locuteur (une valeur par locuteur)'
            : 'Créer une variable d’entretien (une valeur par entretien)'"
          @click="ouvrirEdition"
        >Modifier</button>
      </div>
    </div>

    <template v-if="sousOnglet === 'entretien'">
      <div v-for="v in varsGen()" :key="v.id" class="saisie-eav">
        <span class="saisie-eav-lib">{{ v.lib }}</span>
        <input
          v-if="v.modalites.length === 0 || celluleLibre === cleValeur({ type: 'entretien' }, v.id)"
          class="saisie-eav-libre"
          placeholder="texte libre"
          :disabled="lectureSeule"
          :value="celluleLibre === cleValeur({ type: 'entretien' }, v.id) ? '' : libelleCell(v.id, meta.valeursGen[v.id])"
          :ref="(el) => focaliserLibre(el, cleValeur({ type: 'entretien' }, v.id))"
          @keyup.enter="($event.target as HTMLInputElement).blur()"
          @keyup.esc="celluleLibre = null"
          @change="surLibre({ type: 'entretien' }, v.id, $event)"
          @blur="celluleLibre = null"
        />
        <select
          v-else
          class="saisie-eav-sel"
          :disabled="lectureSeule"
          :value="meta.valeursGen[v.id] ?? ''"
          @change="surSelect({ type: 'entretien' }, v.id, $event)"
        >
          <option value="">—</option>
          <option v-for="m in v.modalites" :key="m.id" :value="m.id">{{ m.lib }}</option>
          <option :value="AUTRE">autre…</option>
        </select>
      </div>
      <p v-if="!varsGen().length" class="gabarit-vide">Aucune variable d’entretien pour le moment. Cliquez sur « Modifier » pour en créer.</p>
    </template>

    <template v-else>
      <template v-if="varsLoc().length && locuteurs.length">
        <div v-for="l in locuteurs" :key="l.id ? `id:${l.id}` : `index:${l.index}`" class="fiche-loc">
          <div class="fiche-loc-nom">{{ l.nom }}</div>
          <div v-for="v in varsLoc()" :key="v.id" class="saisie-eav">
            <span class="saisie-eav-lib">{{ v.lib }}</span>
            <input
              v-if="v.modalites.length === 0 || celluleLibre === cleValeur({ type: 'participation', participationId: l.id ?? '' }, v.id)"
              class="saisie-eav-libre"
              placeholder="texte libre"
              :disabled="lectureSeule || !l.id"
              :value="celluleLibre === cleValeur({ type: 'participation', participationId: l.id ?? '' }, v.id) ? '' : libelleCell(v.id, l.valeursLoc[v.id])"
              :ref="(el) => focaliserLibre(el, cleValeur({ type: 'participation', participationId: l.id ?? '' }, v.id))"
              @keyup.enter="($event.target as HTMLInputElement).blur()"
              @keyup.esc="celluleLibre = null"
              @change="surLibre({ type: 'participation', participationId: l.id ?? '' }, v.id, $event)"
              @blur="celluleLibre = null"
            />
            <select
              v-else
              class="saisie-eav-sel"
              :disabled="lectureSeule || !l.id"
              :value="l.valeursLoc[v.id] ?? ''"
              @change="surSelect({ type: 'participation', participationId: l.id ?? '' }, v.id, $event)"
            >
              <option value="">—</option>
              <option v-for="m in v.modalites" :key="m.id" :value="m.id">{{ m.lib }}</option>
              <option :value="AUTRE">autre…</option>
            </select>
          </div>
        </div>
      </template>
      <p v-else-if="varsLoc().length" class="gabarit-vide">Aucun locuteur dans cet entretien.</p>
      <p v-else class="gabarit-vide">Aucune variable de locuteur pour le moment. Cliquez sur « Modifier » pour en créer.</p>
    </template>

    <Teleport to="body">
      <EditionVariables v-if="editerVariables" :portee="sousOnglet === 'locuteur' ? 'participation' : 'entretien'" @fermer="editerVariables = false" />
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
  padding-top: 0.3rem;
  margin-top: 0.3rem;
  padding-left: 0.9rem;
}
/* Séparation entre deux fiches seulement : pas de trait avant la première. */
.fiche-loc + .fiche-loc {
  border-top: 1px solid #eef1f5;
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
  font-size: 14px;
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
</style>
