<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { exporterSyntheseTxt } from '../../../../shared/synthese/export'
import type { ExtraitSynthese } from '../../../../shared/synthese/types'
import { utiliserSonal } from '../../../composables/sonal'
import ListeExtraitsSynthese from './ListeExtraitsSynthese.vue'
import VueEnsembleSynthese from './VueEnsembleSynthese.vue'

// Panneau droit de la synthèse : bilan, calcul, double vue et détail.
// Les critères sont dans SyntheseCote.vue.
const {
  chargementSynthese, progressionSynthese, enregistrerContextePanneau,
  modeTexteSynthese, representationSynthese, selectionExtraitSynthese,
  entretiensCalculSynthese, extraitsSynthese, diagnosticsSynthese, resultatPerimeSynthese,
  calculeLeSynthese, entretiensAvecExtraitsSynthese, volumeTexteSynthese,
  lignesResumeSynthese, criteresActifsSynthese, calculSynthesePossible, exportSynthesePossible,
  actualiserSynthese, ouvrirExtraitSynthese,
  casDisponiblesSynthese, filtreCasIndisponibleSynthese, retirerFiltreCasSynthese, filtresSynthese,
  codebook, couleurTrait,
  panneauAnalyseVisible, basculerPanneauAnalyse,
} = utiliserSonal()

const afficherEntretiensSansExtrait = ref(false)
const messageExport = ref('')
onBeforeUnmount(enregistrerContextePanneau('analyser-synthese', () => {
  const afficher = afficherEntretiensSansExtrait.value
  return () => { afficherEntretiensSansExtrait.value = afficher }
}))
const selectionne = computed(() => extraitsSynthese.value.find((item) => item.id === selectionExtraitSynthese.value) ?? null)
const dateCalcul = computed(() => calculeLeSynthese.value?.toLocaleString('fr-FR') ?? 'Aucun calcul')

watch(entretiensCalculSynthese, (entretiens) => {
  if (!entretiens.length) afficherEntretiensSansExtrait.value = false
})

async function exporterTxt() {
  if (!exportSynthesePossible.value || !calculeLeSynthese.value) return
  messageExport.value = ''
  try {
    const contenu = exporterSyntheseTxt({
      titre: 'Synthèse',
      date: calculeLeSynthese.value,
      criteres: [...lignesResumeSynthese.value, `Texte ${modeTexteSynthese.value === 'original' ? 'original' : 'pseudonymisé'}`],
      extraits: extraitsSynthese.value,
      diagnostics: diagnosticsSynthese.value,
      nomTheme: (id) => codebook.value.find((item) => item.id === id)?.nom ?? id,
    })
    const resultat = await window.sonal.corpus.syntheseExporterTxt({ nom: `synthese-${new Date().toISOString().slice(0, 10)}.txt`, contenu })
    if (!resultat.annule) messageExport.value = `Synthèse exportée : ${resultat.chemin ?? 'destination choisie'}`
  } catch (erreur) {
    messageExport.value = erreur instanceof Error ? erreur.message : String(erreur)
  }
}

function selectionnerDepuisMur(extrait: ExtraitSynthese) {
  selectionExtraitSynthese.value = extrait.id
}
function afficherDansExtraits() {
  representationSynthese.value = 'extraits'
}
</script>

<template>
  <div class="panneau-synthese" aria-label="Synthèse">
    <header class="entete">
      <div><h2>🧩 Synthèse</h2><small>{{ dateCalcul }}</small></div>
      <div class="actions">
        <label>Affichage
          <select v-model="modeTexteSynthese">
            <option value="pseudonymise">Texte pseudonymisé</option>
            <option value="original">Texte original — peut contenir des identités</option>
          </select>
        </label>
        <button :disabled="!exportSynthesePossible" @click="exporterTxt">Exporter TXT</button>
      </div>
    </header>

    <div v-if="chargementSynthese" class="etat" role="status">Lecture en cours… {{ progressionSynthese.faits }} sur {{ progressionSynthese.total }} entretiens.</div>
    <div v-if="resultatPerimeSynthese" class="etat avertissement" role="status">Les sources ou les critères ont changé. Le résultat précédent reste visible ; actualisez-le pour naviguer.</div>
    <div v-if="!calculSynthesePossible && !calculeLeSynthese" class="etat aide">{{ casDisponiblesSynthese ? 'Choisissez au moins un thème ou un cas pour lancer le calcul.' : 'Choisissez au moins un thème pour lancer le calcul.' }}</div>
    <div v-if="messageExport" class="etat" role="status">{{ messageExport }}</div>
    <details v-if="diagnosticsSynthese.length" class="etat avertissement"><summary>Résultat incomplet · {{ diagnosticsSynthese.length }} problème(s)</summary><ul><li v-for="(item, index) in diagnosticsSynthese" :key="index"><strong>{{ item.titre }}</strong> — {{ item.message }}</li></ul></details>

    <div v-if="filtreCasIndisponibleSynthese" class="etat avertissement" role="status">
      Un filtre utilise des cas qui ne sont plus disponibles. La restriction est conservée.
      <button v-if="filtresSynthese.cas.mode === 'choix'" @click="retirerFiltreCasSynthese">Retirer le filtre Cas</button>
      <span v-else>Le filtre a été retiré des critères ; actualisez la synthèse pour renouveler le résultat.</span>
    </div>
    <section class="bilan">
      <strong>{{ entretiensAvecExtraitsSynthese }} entretien(s) · {{ extraitsSynthese.length }} extrait(s) · {{ volumeTexteSynthese.toLocaleString('fr-FR') }} caractères source</strong>
      <span>{{ criteresActifsSynthese }} critère(s) appliqué(s) · {{ resultatPerimeSynthese ? 'Périmé' : diagnosticsSynthese.length ? 'Incomplet' : calculeLeSynthese ? 'À jour' : 'À calculer' }}</span>
      <details><summary>Détail des critères</summary><ul><li v-for="ligne in lignesResumeSynthese" :key="ligne">{{ ligne }}</li></ul></details>
    </section>

    <div class="commandes">
      <div class="segments" aria-label="Représentation">
        <button :class="{ actif: representationSynthese === 'ensemble' }" @click="representationSynthese = 'ensemble'">Vue d’ensemble</button>
        <button :class="{ actif: representationSynthese === 'extraits' }" @click="representationSynthese = 'extraits'">Extraits</button>
      </div>
      <button class="btn-calcul" :disabled="chargementSynthese || !calculSynthesePossible" @click="actualiserSynthese">
        {{ chargementSynthese ? 'Calcul en cours…' : calculeLeSynthese ? 'Actualiser la synthèse' : 'Calculer la synthèse' }}
      </button>
      <button @click="basculerPanneauAnalyse()">{{ panneauAnalyseVisible ? 'Masquer' : 'Afficher' }} les critères</button>
    </div>

    <main class="resultats">
      <label v-if="representationSynthese === 'ensemble' && entretiensCalculSynthese.length > entretiensAvecExtraitsSynthese" class="option-tous-entretiens">
        <input v-model="afficherEntretiensSansExtrait" type="checkbox" role="switch">
        Afficher tous les entretiens sélectionnés ({{ entretiensCalculSynthese.length }}), dont {{ entretiensAvecExtraitsSynthese }} avec des extraits
      </label>
      <VueEnsembleSynthese v-if="representationSynthese === 'ensemble'" :extraits="extraitsSynthese" :entretiens="entretiensCalculSynthese" :afficher-sans-extrait="afficherEntretiensSansExtrait" :selection="selectionExtraitSynthese" :nom-theme="(id) => codebook.find((item) => item.id === id)?.nom ?? id" :couleur-theme="couleurTrait" @selectionner="selectionnerDepuisMur" />
      <ListeExtraitsSynthese v-else :extraits="extraitsSynthese" :selection="selectionExtraitSynthese" :nom-theme="(id) => codebook.find((item) => item.id === id)?.nom ?? id" :couleur-theme="couleurTrait" :navigation-possible="!resultatPerimeSynthese" @selectionner="selectionnerDepuisMur" @ouvrir="ouvrirExtraitSynthese" />
      <aside v-if="representationSynthese === 'ensemble' && selectionne" class="detail">
        <strong>{{ selectionne.titreEntretien }} · {{ selectionne.locuteurs.join(', ') || 'Sans locuteur' }}</strong>
        <p>{{ selectionne.texte }}</p>
        <p class="discret">Thèmes : {{ selectionne.themeIds.map((id) => codebook.find((item) => item.id === id)?.nom ?? id).join(', ') || 'aucun' }}</p>
        <details><summary>{{ selectionne.annotationIds.length }} annotation(s) contributrice(s)</summary><ul><li v-for="id in selectionne.annotationIds" :key="id">{{ id }}</li></ul></details>
        <button @click="afficherDansExtraits">Afficher dans les extraits</button>
        <button :disabled="resultatPerimeSynthese" @click="ouvrirExtraitSynthese(selectionne)">Ouvrir dans l’entretien</button>
      </aside>
    </main>
  </div>
</template>

<style scoped>
.panneau-synthese { display: flex; flex-direction: column; min-height: 0; height: 100%; background: #fff; border-radius: 8px; overflow: hidden; }
.entete, .commandes, .bilan { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 0.55rem 0.85rem; border-bottom: 1px solid #dde2eb; }
.entete { background: #fff; }
.commandes { background: #f5f8fc; }
.bilan { align-items: flex-start; font-size: 0.84rem; }
.bilan strong { display: block; }
.bilan details { max-width: 42%; }
h2 { margin: 0; }
.actions { display: flex; align-items: center; gap: 0.6rem; }
.actions label { font-size: 0.8rem; }
.etat { margin: 0.5rem 0.85rem 0; padding: 0.45rem 0.7rem; background: #edf5ff; border-radius: 5px; }
.avertissement { background: #fff2d9; }
.aide { background: #f1f3f6; }
.segments { display: flex; }
.segments button.actif { color: white; background: #334e8a; }
.btn-calcul { padding: 0.58rem 1.1rem; border: 1px solid #174f87; background: #1769aa; color: white; font-size: 0.9rem; font-weight: 700; box-shadow: 0 2px 5px rgba(23, 79, 135, 0.24); }
.btn-calcul:hover:not(:disabled) { background: #10578f; }
.btn-calcul:disabled { color: #687080; background: #e1e5eb; border-color: #b9c0ca; box-shadow: none; }
.resultats { flex: 1; min-height: 0; padding: 1rem; overflow: auto; }
.option-tous-entretiens { display: flex; align-items: center; gap: 0.45rem; width: fit-content; margin: 0 0 0.75rem auto; padding: 0.38rem 0.6rem; border: 1px solid #b9c9df; border-radius: 16px; background: #f3f7fc; color: #40516a; font-size: 0.76rem; }
.option-tous-entretiens input { margin: 0; }
.detail { position: sticky; bottom: 0; background: #f7f9fd; border: 1px solid #ccd5e8; border-radius: 7px; padding: 0.75rem; margin-top: 1rem; }
.detail button { margin-right: 0.4rem; }
.discret { color: #657083; font-size: 0.8rem; }
@media (max-width: 780px) {
  .entete, .commandes, .bilan { align-items: flex-start; flex-wrap: wrap; }
  .resultats { overflow: visible; padding: 0.75rem; }
  .bilan details { max-width: 100%; }
}
</style>
