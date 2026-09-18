<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import {
  FORMATS_EXPORT,
  CONFIG_OPTIONS,
  LIBELLES_OPTIONS,
  type FormatExport,
  type OptionsExport,
} from '../../import/exportFormats'

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

watch(format, (f) => {
  if (!f) return
  const cfg = CONFIG_OPTIONS[f]
  for (const { cle } of LIBELLES_OPTIONS) {
    const defaut = cfg[cle]
    options.value[cle] = defaut ? defaut[1] : false
  }
})

/** Options applicable au format courant : `[activée, cochée]` ou absent (masquée). */
const cfgCourante = computed(() => (format.value ? CONFIG_OPTIONS[format.value] : {}))
/** Étape 1 : l'utilisateur a choisi un format ; les options dépendent du format. */
const auFormat = computed(() => format.value !== null)

/** Émet l'export : la fenêtre se ferme et le générateur du format prend le relais. */
function lancerExport() {
  if (!format.value) return
  fermerExport()
  void exporter(format.value, { ...options.value })
}

function surTouche(event: KeyboardEvent) {
  if (event.key === 'Escape' && exportOuvert.value) fermerExport()
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
          <button title="Fermer" @click="fermerExport">Fermer ✕</button>
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
              </div>
              <div class="actions">
                <button class="retour" @click="format = null">← Retour</button>
                <button class="exporter" @click="lancerExport">📥 Exporter</button>
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
.actions { display: flex; gap: .6rem; margin-top: 1rem; }
.actions button { padding: .5rem .8rem; border-radius: 5px; cursor: pointer; }
.actions .retour { flex: 1; border: 1px solid #bbb; background: #fff; }
.actions .exporter { flex: 2; border: 1px solid #2e7d32; color: #fff; background: #2e7d32; }
.actions .exporter:hover { background: #256a28; }
</style>
