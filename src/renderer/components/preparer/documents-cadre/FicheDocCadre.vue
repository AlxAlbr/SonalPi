<script setup lang="ts">
import { computed } from 'vue'
import { libelleTypeDocument, formaterTaille } from '../../../composables/corpus/useDocsCadre'
import type { ResumeDocumentCadre } from '../../../../shared/docsCadre'

// Fiche d'un document : nom, type, taille et date de modification.
// Présentation seule — les actions vivent dans DocsCadrePanneau.vue, selon la
// source (projet/exemple) et le mode (local/distant).
const props = defineProps<{ resume: ResumeDocumentCadre }>()

const taille = computed(() => formaterTaille(props.resume.taille))
const date = computed(() => {
  if (!props.resume.modifieLe) return null
  try {
    return new Date(props.resume.modifieLe).toLocaleString()
  } catch {
    return null
  }
})
const source = computed(() =>
  props.resume.source === 'exemple' ? 'Document exemple (livré avec l’application)' : 'Document du corpus',
)
</script>

<template>
  <div class="fiche">
    <p class="ligne"><span class="cle">Nom</span> <span class="val">{{ resume.nom }}</span></p>
    <p class="ligne"><span class="cle">Type</span> <span class="val">{{ libelleTypeDocument(resume.type) }}</span></p>
    <p class="ligne"><span class="cle">Taille</span> <span class="val">{{ taille }}</span></p>
    <p v-if="date" class="ligne"><span class="cle">Modifié le</span> <span class="val">{{ date }}</span></p>
    <p class="ligne"><span class="cle">Source</span> <span class="val">{{ source }}</span></p>
  </div>
</template>

<style scoped>
.fiche {
  background: #fff;
  border: 1px solid #e2e6ef;
  border-radius: 6px;
  padding: .6rem .9rem;
  font-size: .84rem;
}
.ligne { margin: .15rem 0; }
.cle { display: inline-block; width: 7.5rem; color: #7a8299; font-weight: 600; }
.val { color: #1c2333; }
</style>
