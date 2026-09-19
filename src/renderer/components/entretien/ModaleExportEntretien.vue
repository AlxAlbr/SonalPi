<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import {
  FORMATS_EXPORT,
  CONFIG_OPTIONS,
  LIBELLES_OPTIONS,
  type FormatExport,
  type OptionsExport,
} from '../../../shared/export/types'

const { exportOuvert, fermerExport, exporter } = utiliserSonal()

/** Format choisi ; `null` = panneau des formats (étape 1). */
const format = ref<FormatExport | null>(null)
// Options cochées, initialisées aux défauts du format au moment du choix.
const options = ref<OptionsExport>({
  entete: true,
  notes: true,
  vars: true,
  time: true,
  loc: true,
  thm: true,
  anon: false,
})
/** Pseudonymisation : STRICT bloque toute sortie incomplète ; PARTIEL n'applique
 *  que les pseudonymes configurés (le fichier peut encore porter des noms réels). */
const modeAnon = ref<'strict' | 'partiel'>('strict')
/** Message d'échec (pseudonymisation bloquée ou erreur de génération). */
const message = ref<string | null>(null)
/** Vrai pendant la génération : le bouton est désactivé (double-clic exclu). */
const occupe = ref(false)

watch(format, (f) => {
  if (!f) return
  const cfg = CONFIG_OPTIONS[f]
  for (const { cle } of LIBELLES_OPTIONS) {
    options.value[cle] = cfg[cle]?.defaut ?? false
  }
  message.value = null
})

// Chaque ouverture repart de l'étape 1 (format), jamais de l'étape précédente.
watch(exportOuvert, (ouvert) => {
  if (ouvert) {
    format.value = null
    message.value = null
    occupe.value = false
  }
})

/** Options applicable au format courant : `[activée, cochée]` ou absent (masquée). */
const cfgCourante = computed(() => (format.value ? CONFIG_OPTIONS[format.value] : {}))
/** Étape 1 : l'utilisateur a choisi un format ; les options dépendent du format. */
const auFormat = computed(() => format.value !== null)

/** Émet l'export : la fenêtre ne se ferme qu'après succès ou annulation
 *  explicite du dialogue ; un blocage ou une erreur reste affiché. */
async function lancerExport() {
  if (!format.value || occupe.value) return
  occupe.value = true
  message.value = null
  try {
    const resultat = await exporter(format.value, { ...options.value, modeAnon: modeAnon.value })
    if (resultat.etat === 'bloque') {
      message.value =
        'Export pseudonymisé bloqué — pseudonymisation incomplète :\n' +
        resultat.rapport.bloquants.map((p) => p.message).join('\n')
      return
    }
    if (resultat.etat === 'erreur') {
      message.value = resultat.message
      return
    }
    // Succès ou annulation du dialogue : la fenêtre se ferme.
    fermerExport()
  } finally {
    occupe.value = false
  }
}

function surTouche(event: KeyboardEvent) {
  if (event.key === 'Escape' && exportOuvert.value && !occupe.value) fermerExport()
}
onMounted(() => window.addEventListener('keydown', surTouche))
onUnmounted(() => window.removeEventListener('keydown', surTouche))
</script>

<template>
  <Teleport to="body">
    <div v-show="exportOuvert" class="fond-export" role="dialog" aria-modal="true" aria-label="Exporter">
      <section class="modale-export">
        <header>
          <h2>📤 Exporter l'entretien</h2>
          <button title="Fermer" :disabled="occupe" @click="fermerExport">Fermer ✕</button>
        </header>
        <!-- Viewport glissant : les deux étapes glissent d'un panneau à l'autre. -->
        <div class="viewport">
          <div class="slider" :class="{ etape2: format !== null }">
            <!-- Étape 1 : choix du format -->
            <div class="panneau">
              <p class="etape">1 — Choisissez un format d'export</p>
              <div class="formats">
                <button
                  v-for="f in FORMATS_EXPORT"
                  :key="f.format"
                  class="ligne-format"
                  @click="format = f.format"
                >
                  <span class="ext">{{ f.ext }}</span>
                  <span class="details">{{ f.details }}</span>
                </button>
              </div>
            </div>
            <!-- Étape 2 : options du format choisi -->
            <div class="panneau" v-if="format !== null">
              <p class="etape">2 — Choisissez les éléments à intégrer à l'export au format <b>{{ format }}</b></p>
              <div class="options">
                <template v-for="{ cle, label } in LIBELLES_OPTIONS" :key="cle">
                  <label v-if="cfgCourante[cle]" class="option">
                    <input type="checkbox" v-model="options[cle]" />
                    {{ label }}
                  </label>
                </template>
                <label v-if="options.anon" class="option">
                  Mode&nbsp;:
                  <select v-model="modeAnon">
                    <option value="strict">strict (bloque si incomplet)</option>
                    <option value="partiel">partiel (pseudonymes configurés seuls)</option>
                  </select>
                </label>
                <p v-if="options.anon && modeAnon === 'partiel'" class="avertissement-anon">
                  Mode partiel : seuls les pseudonymes configurés sont appliqués.
                  Le fichier produit peut encore contenir des noms réels ;
                  il n'est pas anonymisé.
                </p>
              </div>
              <p v-if="message" class="message-erreur" role="alert">{{ message }}</p>
              <div class="actions">
                <button class="retour" :disabled="occupe" @click="format = null">← Retour</button>
                <button class="exporter" :disabled="occupe" @click="lancerExport">
                  {{ occupe ? '⏳ Génération…' : '📥 Exporter' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.fond-export { position: fixed; inset: 0; z-index: 900; background: rgba(0, 0, 0, .45); box-sizing: border-box; }
.modale-export { position: absolute; top: 20vh; left: 50%; transform: translateX(-50%); width: min(640px, 90vw); background: #fff; border-radius: 10px; box-shadow: 0 8px 35px rgba(0, 0, 0, .3); overflow: hidden; }
.modale-export > header { display: flex; align-items: center; justify-content: space-between; height: 52px; padding: 0 1rem; border-bottom: 1px solid #ccc; }
h2 { margin: 0; font-size: 1.1rem; }
.modale-export > header button { border: 1px solid #bbb; border-radius: 5px; background: #fff; padding: .4rem .8rem; cursor: pointer; }
.modale-export > header button:disabled { opacity: .5; cursor: default; }
.viewport { overflow: hidden; }
/* Deux panneaux côte à côte ; l'étape 2 se révèle par glissement (animation de la V1). */
.slider { display: flex; width: 200%; transition: transform .35s cubic-bezier(.4, 0, .2, 1); transform: translateX(0); }
.slider.etape2 { transform: translateX(-50%); }
.panneau { width: 50%; padding: 0 1rem 1rem; box-sizing: border-box; }
.etape { font-size: .95rem; margin: 1rem 0 .8rem; color: #333; }
.ligne-format { display: flex; align-items: baseline; gap: .8rem; width: 100%; border: none; background: none; border-bottom: 1px solid #eee; padding: .6rem .2rem; cursor: pointer; text-align: left; }
.ligne-format:hover { background: #f0f6ff; }
.ligne-format .ext { font-weight: 600; min-width: 4.5rem; }
.ligne-format .details { color: #666; font-size: .85rem; }
.options { display: flex; flex-direction: column; gap: .1rem; }
.option { display: flex; align-items: center; gap: .6rem; padding: .35rem 0; cursor: pointer; }
.message-erreur { margin: .6rem 0 0; padding: .6rem .8rem; border-radius: 5px; background: #fdecea; color: #b71c1c; border: 1px solid #f5c6cb; font-size: .9rem; white-space: pre-wrap; }
.avertissement-anon { margin: .4rem 0 0; padding: .5rem .7rem; border-radius: 5px; background: #fff8e1; color: #7a5c00; border: 1px solid #ffe082; font-size: .85rem; }
.actions { display: flex; gap: .6rem; margin-top: 1rem; }
.actions button { padding: .5rem .8rem; border-radius: 5px; cursor: pointer; }
.actions button:disabled { opacity: .55; cursor: default; }
.actions .retour { flex: 1; border: 1px solid #bbb; background: #fff; }
.actions .exporter { flex: 2; border: 1px solid #2e7d32; color: #fff; background: #2e7d32; }
.actions .exporter:hover:not(:disabled) { background: #256a28; }
</style>
