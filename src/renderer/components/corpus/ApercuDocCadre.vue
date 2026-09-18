<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { libelleSansApercu } from '../../composables/corpus/useDocsCadre'
import type { ApercuDocumentCadre } from '../../../shared/docsCadre'
import ApercuPdf from './ApercuPdf.vue'

// Aperçu d'un document : texte brut, image raster, PDF en lecture seule,
// ou absence expliquée. Aucun contenu HTML reçu n'est exécuté.
const props = defineProps<{ apercu: ApercuDocumentCadre | null; chargement: boolean }>()

// L'URL d'objet image est créée et révoquée ICI (rendu), jamais en composable.
const urlImage = ref<string | null>(null)

watch(
  () => props.apercu,
  (apercu) => {
    if (urlImage.value) {
      URL.revokeObjectURL(urlImage.value)
      urlImage.value = null
    }
    if (apercu?.genre === 'image') {
      urlImage.value = URL.createObjectURL(new Blob([apercu.octets as unknown as BlobPart], { type: apercu.mime }))
    }
  },
  { immediate: true },
)
onUnmounted(() => {
  if (urlImage.value) URL.revokeObjectURL(urlImage.value)
})
</script>

<template>
  <div v-if="chargement" class="attente">Chargement de l’aperçu…</div>
  <div v-else-if="!apercu || apercu.genre === 'aucun'" class="sans-apercu">
    <p v-if="apercu && apercu.genre === 'aucun'">{{ libelleSansApercu(apercu.raison) }}</p>
  </div>
  <pre v-else-if="apercu.genre === 'texte'" class="texte-echappe">{{ apercu.contenu }}</pre>
  <div v-else-if="apercu.genre === 'image'" class="image">
    <img :src="urlImage ?? ''" :alt="''" />
  </div>
  <ApercuPdf v-else-if="apercu.genre === 'pdf'" :octets="apercu.octets" />
</template>

<style scoped>
.attente { color: #667; font-size: .85rem; padding: .5rem; }
.sans-apercu p {
  background: #f4f6fb;
  border: 1px solid #dde3ef;
  border-radius: 6px;
  color: #44506a;
  font-size: .85rem;
  margin: 0;
  padding: .6rem .8rem;
}
.texte-echappe {
  /* Texte brut ÉCHAPPÉ : mustache interdit toute injection. Aucun rendu
     Markdown ni CSV dans cette première version. */
  white-space: pre-wrap;
  word-break: break-word;
  background: #fff;
  border: 1px solid #e2e6ef;
  border-radius: 6px;
  padding: .8rem 1rem;
  font-size: .82rem;
  line-height: 1.45;
  margin: 0;
}
.image { display: flex; justify-content: center; }
.image img { max-width: 100%; border: 1px solid #e2e6ef; border-radius: 6px; background: #fff; }
</style>
