<script setup lang="ts">
import { ref } from 'vue'

/** Rappel des raccourcis de l'entretien ; une fois fermé, il ne réapparaît plus sur ce poste. */
const CLE_FERMETURE = 'sonal:entretien:raccourcis-fermes'

function lireFermeture() {
  try {
    return localStorage.getItem(CLE_FERMETURE) === 'true'
  } catch {
    return false
  }
}

const fermee = ref(lireFermeture())

function fermer() {
  fermee.value = true
  try {
    localStorage.setItem(CLE_FERMETURE, 'true')
  } catch { /* Stockage facultatif. */ }
}
</script>

<template>
  <aside v-if="!fermee" class="bulle-raccourcis" aria-label="Raccourcis clavier">
    <div class="textes-raccourcis">
      <p>🎧 Tapez <b>DEUX FOIS</b> sur <b>Espace</b> dans l'éditeur pour lancer ou arrêter l'audio.</p>
      <p>🔍 <b>Ctrl+F</b> dans l'éditeur ouvre la recherche et le remplacement.</p>
    </div>
    <button
      type="button"
      class="fermer-raccourcis"
      title="Masquer les raccourcis"
      aria-label="Masquer les raccourcis"
      @click="fermer"
    >✕</button>
  </aside>
</template>

<style scoped>
.bulle-raccourcis {
  display: flex;
  flex: none;
  align-items: flex-start;
  gap: 0.4rem;
  border: 1px solid #e0b93a;
  border-left: 4px solid #e0a03a;
  border-radius: 6px;
  background: #fff8e1;
  color: #5c4a00;
  padding: 0.45rem 0.5rem 0.45rem 0.6rem;
  font-size: 0.8rem;
  line-height: 1.35;
}
.textes-raccourcis {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}
.textes-raccourcis p {
  margin: 0;
}
.textes-raccourcis b {
  color: #a37000;
}
.fermer-raccourcis {
  flex: none;
  border: none;
  background: none;
  color: #8a7320;
  cursor: pointer;
  font-size: 0.8rem;
  line-height: 1;
  padding: 0.15rem;
}
.fermer-raccourcis:hover {
  color: #5c4a00;
}
</style>
