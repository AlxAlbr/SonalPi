<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import RecueilsCorpus from '../corpus/RecueilsCorpus.vue'

const { recueilsOuverts, fermerRecueils } = utiliserSonal()

function surTouche(event: KeyboardEvent) {
  if (event.key === 'Escape' && recueilsOuverts.value) fermerRecueils()
}
onMounted(() => window.addEventListener('keydown', surTouche))
onUnmounted(() => window.removeEventListener('keydown', surTouche))
</script>

<template>
  <Teleport to="body">
    <div v-show="recueilsOuverts" class="fond-recueils" role="dialog" aria-modal="true" aria-label="Recueils">
      <section class="modale-recueils">
        <header>
          <h2>📌 Recueils</h2>
          <button title="Fermer les recueils" @click="fermerRecueils">Quitter ✕</button>
        </header>
        <div class="corps"><RecueilsCorpus /></div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.fond-recueils { position: fixed; inset: 0; z-index: 900; background: rgba(0, 0, 0, .45); padding: 2vh 2vw; box-sizing: border-box; }
.modale-recueils { height: 96vh; display: flex; flex-direction: column; background: #f6f7fa; border-radius: 10px; box-shadow: 0 8px 35px rgba(0, 0, 0, .3); overflow: hidden; }
.modale-recueils > header { display: flex; align-items: center; justify-content: space-between; flex: none; height: 52px; padding: 0 1rem; border-bottom: 1px solid #ccc; background: #fff; }
h2 { margin: 0; font-size: 1.1rem; }.corps { flex: 1; overflow: auto; padding: 1rem; }
button { border: 1px solid #bbb; border-radius: 5px; background: #fff; padding: .4rem .8rem; cursor: pointer; }
</style>
