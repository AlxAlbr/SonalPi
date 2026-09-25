<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import DocsCadre from '../corpus/DocsCadre.vue'

const { docsCadreOuverts, fermerDocsCadre } = utiliserSonal()

function surTouche(event: KeyboardEvent) {
  if (event.key === 'Escape' && docsCadreOuverts.value) fermerDocsCadre()
}
onMounted(() => window.addEventListener('keydown', surTouche))
onUnmounted(() => window.removeEventListener('keydown', surTouche))
</script>

<template>
  <Teleport to="body">
    <div v-show="docsCadreOuverts" class="fond-docs-cadre" role="dialog" aria-modal="true" aria-label="Docs cadre projet">
      <section class="modale-docs-cadre">
        <header>
          <!-- Un tableau et son tour ; même icône que .btn-docs-cadre (BarreOutils.vue). -->
          <h2>🖼️ Docs cadre projet</h2>
          <button title="Fermer les docs cadre" @click="fermerDocsCadre">Quitter ✕</button>
        </header>
        <div class="corps"><DocsCadre /></div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.fond-docs-cadre { position: fixed; inset: 0; z-index: 900; background: rgba(0, 0, 0, .45); padding: 2vh 2vw; box-sizing: border-box; }
.modale-docs-cadre { height: 96vh; display: flex; flex-direction: column; background: #f6f7fa; border-radius: 10px; box-shadow: 0 8px 35px rgba(0, 0, 0, .3); overflow: hidden; }
.modale-docs-cadre > header { display: flex; align-items: center; justify-content: space-between; flex: none; height: 52px; padding: 0 1rem; border-bottom: 1px solid #ccc; background: #fff; }
h2 { margin: 0; font-size: 1.1rem; }
.corps { flex: 1; overflow: hidden; display: flex; }
button { border: 1px solid #bbb; border-radius: 5px; background: #fff; padding: .4rem .8rem; cursor: pointer; }
</style>
