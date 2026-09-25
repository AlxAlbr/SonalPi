<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import TableauBord from '../corpus/TableauBord.vue'

const { tableauBordOuverts, fermerTableauBord } = utiliserSonal()

function surTouche(event: KeyboardEvent) {
  if (event.key === 'Escape' && tableauBordOuverts.value) fermerTableauBord()
}
onMounted(() => window.addEventListener('keydown', surTouche))
onUnmounted(() => window.removeEventListener('keydown', surTouche))
</script>

<template>
  <Teleport to="body">
    <div v-show="tableauBordOuverts" class="fond-tableau" role="dialog" aria-modal="true" aria-label="Tableau de bord">
      <section class="modale-tableau">
        <header>
          <h2>📊 Tableau de bord</h2>
          <button title="Fermer le tableau de bord" @click="fermerTableauBord">Quitter ✕</button>
        </header>
        <div class="corps"><TableauBord /></div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.fond-tableau { position: fixed; inset: 0; z-index: 900; background: rgba(0, 0, 0, .45); padding: 1vh 0.8vw; box-sizing: border-box; }
.modale-tableau { height: 98vh; display: flex; flex-direction: column; background: #f6f7fa; border-radius: 10px; box-shadow: 0 8px 35px rgba(0, 0, 0, .3); overflow: hidden; }
.modale-tableau > header { display: flex; align-items: center; justify-content: space-between; flex: none; height: 52px; padding: 0 1rem; border-bottom: 1px solid #ccc; background: #fff; }
h2 { margin: 0; font-size: 1.1rem; }
.corps { flex: 1; overflow: auto; padding: 0.6rem; }
button { border: 1px solid #bbb; border-radius: 5px; background: #fff; padding: .4rem .8rem; cursor: pointer; }
</style>
