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
import type { ApercuRapportPseudonymisation } from '../../export/exportEntretien'

const {
  exportOuvert,
  fermerExport,
  exporter,
  preparerRapport,
  enregistrerRapport,
} = utiliserSonal()

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
/** Le rapport est facultatif et toujours consulté avant l'export final. */
const rapportDemande = ref(false)
const apercuRapport = ref<ApercuRapportPseudonymisation | null>(null)
/** Message d'échec ou confirmation d'enregistrement du rapport. */
const message = ref<string | null>(null)
const messageEstErreur = ref(true)
/** Vrai pendant la génération : le bouton est désactivé (double-clic exclu). */
const occupe = ref(false)

watch(format, (f) => {
  if (!f) return
  const cfg = CONFIG_OPTIONS[f]
  for (const { cle } of LIBELLES_OPTIONS) {
    options.value[cle] = cfg[cle]?.defaut ?? false
  }
  message.value = null
  apercuRapport.value = null
})

watch(options, () => {
  apercuRapport.value = null
  message.value = null
}, { deep: true })

// Chaque ouverture repart de l'étape 1 (format), jamais de l'étape précédente.
watch(exportOuvert, (ouvert) => {
  if (ouvert) {
    format.value = null
    message.value = null
    messageEstErreur.value = true
    rapportDemande.value = false
    apercuRapport.value = null
    occupe.value = false
  }
})

/** Options applicable au format courant : `[activée, cochée]` ou absent (masquée). */
const cfgCourante = computed(() => (format.value ? CONFIG_OPTIONS[format.value] : {}))
/** Étape 1 : l'utilisateur a choisi un format ; les options dépendent du format. */
const auFormat = computed(() => format.value !== null)

/** Le premier clic prépare l'aperçu demandé, sans lancer l'export final. */
async function lancerExport() {
  if (!format.value || occupe.value) return
  if (options.value.anon && rapportDemande.value && !apercuRapport.value) {
    occupe.value = true
    message.value = null
    messageEstErreur.value = true
    try {
      const resultat = await preparerRapport(format.value, { ...options.value })
      if (resultat.etat === 'erreur') {
        message.value = resultat.message
        return
      }
      apercuRapport.value = resultat.apercu
    } finally {
      occupe.value = false
    }
    return
  }
  await lancerExportFinal()
}

async function lancerExportFinal() {
  if (!format.value || occupe.value) return
  occupe.value = true
  message.value = null
  messageEstErreur.value = true
  try {
    const resultat = await exporter(format.value, { ...options.value })
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

async function sauvegarderRapport() {
  if (!apercuRapport.value || occupe.value) return
  occupe.value = true
  message.value = null
  messageEstErreur.value = true
  try {
    const resultat = await enregistrerRapport(apercuRapport.value)
    if (resultat.etat === 'erreur') {
      message.value = resultat.message
    } else if (resultat.etat === 'succes') {
      messageEstErreur.value = false
      message.value = `Rapport enregistré : ${resultat.chemin}`
    }
  } finally {
    occupe.value = false
  }
}

function revenirAuxOptions() {
  apercuRapport.value = null
  message.value = null
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
            <!-- Étape 2 : options puis aperçu facultatif du rapport. -->
            <div class="panneau" v-if="format !== null">
              <template v-if="!apercuRapport">
                <p class="etape">2 — Choisissez les éléments à intégrer à l'export au format <b>{{ format }}</b></p>
                <div class="options">
                  <template v-for="{ cle, label } in LIBELLES_OPTIONS" :key="cle">
                    <label v-if="cfgCourante[cle]" class="option">
                      <input type="checkbox" v-model="options[cle]" />
                      {{ label }}
                    </label>
                  </template>
                  <label v-if="options.anon" class="option rapport-option">
                    <input type="checkbox" v-model="rapportDemande" />
                    Consulter le rapport de pseudonymisation avant l'export
                  </label>
                  <p v-if="options.anon" class="avertissement-anon">
                    Seuls les pseudonymes configurés sont appliqués. Les autres
                    éléments restent en clair ; cette opération ne garantit pas l'anonymat.
                  </p>
                </div>
                <p v-if="message" class="message-erreur" role="alert">{{ message }}</p>
                <div class="actions">
                  <button class="retour" :disabled="occupe" @click="format = null">← Retour</button>
                  <button class="exporter" :disabled="occupe" @click="lancerExport">
                    {{ occupe ? '⏳ Préparation…' : '📥 Exporter' }}
                  </button>
                </div>
              </template>

              <template v-else>
                <p class="etape">3 — Rapport de pseudonymisation avant l'export</p>
                <p class="limite-rapport">
                  Ce rapport décrit les remplacements configurés. Il ne constitue pas une garantie d'anonymat.
                </p>
                <div class="rapport-contenu">
                  <section>
                    <h3>Pseudonymisation appliquée</h3>
                    <ul><li v-for="ligne in apercuRapport.rapport.appliquees" :key="ligne.code">{{ ligne.message }}</li></ul>
                  </section>
                  <section>
                    <h3>Éléments conservés</h3>
                    <ul><li v-for="ligne in apercuRapport.rapport.conserves" :key="ligne.code">{{ ligne.message }}</li></ul>
                  </section>
                  <section>
                    <h3>Éléments à vérifier manuellement</h3>
                    <ul v-if="apercuRapport.rapport.aVerifier.length > 0">
                      <li v-for="ligne in apercuRapport.rapport.aVerifier" :key="ligne.code">{{ ligne.message }}</li>
                    </ul>
                    <p v-else>Aucun élément à signaler.</p>
                  </section>
                </div>
                <p
                  v-if="message"
                  :class="messageEstErreur ? 'message-erreur' : 'message-information'"
                  :role="messageEstErreur ? 'alert' : 'status'"
                >{{ message }}</p>
                <div class="actions actions-rapport">
                  <button class="retour" :disabled="occupe" @click="revenirAuxOptions">← Options</button>
                  <button class="enregistrer" :disabled="occupe" @click="sauvegarderRapport">Enregistrer le rapport</button>
                  <button class="exporter" :disabled="occupe" @click="lancerExportFinal">
                    {{ occupe ? '⏳ Traitement…' : '📥 Lancer l’export' }}
                  </button>
                </div>
              </template>
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
.panneau { width: 50%; max-height: calc(80vh - 52px); padding: 0 1rem 1rem; box-sizing: border-box; overflow-y: auto; }
.etape { font-size: .95rem; margin: 1rem 0 .8rem; color: #333; }
.ligne-format { display: flex; align-items: baseline; gap: .8rem; width: 100%; border: none; background: none; border-bottom: 1px solid #eee; padding: .6rem .2rem; cursor: pointer; text-align: left; }
.ligne-format:hover { background: #f0f6ff; }
.ligne-format .ext { font-weight: 600; min-width: 4.5rem; }
.ligne-format .details { color: #666; font-size: .85rem; }
.options { display: flex; flex-direction: column; gap: .1rem; }
.option { display: flex; align-items: center; gap: .6rem; padding: .35rem 0; cursor: pointer; }
.rapport-option { margin-top: .25rem; border-top: 1px solid #ddd; padding-top: .65rem; }
.message-erreur, .message-information { margin: .6rem 0 0; padding: .6rem .8rem; border-radius: 5px; font-size: .9rem; white-space: pre-wrap; }
.message-erreur { background: #fdecea; color: #b71c1c; border: 1px solid #f5c6cb; }
.message-information { background: #edf7ed; color: #1b5e20; border: 1px solid #a5d6a7; }
.avertissement-anon { margin: .4rem 0 0; padding: .5rem .7rem; border-radius: 5px; background: #fff8e1; color: #7a5c00; border: 1px solid #ffe082; font-size: .85rem; }
.limite-rapport { padding: .5rem .7rem; border-radius: 5px; background: #fff8e1; color: #5f4900; font-size: .85rem; }
.rapport-contenu section { margin-top: .75rem; }
.rapport-contenu h3 { margin: 0 0 .25rem; font-size: .95rem; }
.rapport-contenu ul { margin: 0; padding-left: 1.25rem; }
.rapport-contenu p { margin: 0; font-size: .9rem; }
.actions { display: flex; gap: .6rem; margin-top: 1rem; }
.actions button { padding: .5rem .8rem; border-radius: 5px; cursor: pointer; }
.actions button:disabled { opacity: .55; cursor: default; }
.actions .retour { flex: 1; border: 1px solid #bbb; background: #fff; }
.actions .enregistrer { flex: 2; border: 1px solid #1565c0; color: #0d47a1; background: #e3f2fd; }
.actions .exporter { flex: 2; border: 1px solid #2e7d32; color: #fff; background: #2e7d32; }
.actions-rapport { flex-wrap: wrap; }
.actions .exporter:hover:not(:disabled) { background: #256a28; }
</style>
