<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import ParcoursPasAPas from './ParcoursPasAPas.vue'

const {
  catalogueParcoursOuvert,
  fermerCatalogueParcours,
} = utiliserSonal()

function surTouche(event: KeyboardEvent): void {
  if (event.key === 'Escape' && catalogueParcoursOuvert.value) fermerCatalogueParcours()
}

onMounted(() => window.addEventListener('keydown', surTouche))
onUnmounted(() => window.removeEventListener('keydown', surTouche))
</script>

<template>
  <Teleport to="body">
    <div
      v-show="catalogueParcoursOuvert"
      class="voile-catalogue-parcours"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titre-modale-parcours"
      @click.self="fermerCatalogueParcours"
    >
      <section class="modale-catalogue-parcours">
        <header>
          <div>
            <h2 id="titre-modale-parcours">Choisir un parcours pas à pas</h2>
            <p>Votre choix n’impose aucun ordre entre la préparation et le traitement.</p>
          </div>
          <button title="Fermer le choix des parcours" @click="fermerCatalogueParcours">Plus tard ✕</button>
        </header>
        <div class="corps-catalogue-parcours">
          <ParcoursPasAPas @parcours-lance="fermerCatalogueParcours" />
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.voile-catalogue-parcours {
  position: fixed;
  inset: 0;
  z-index: 950;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 2vh 2vw;
  background: rgba(0, 0, 0, 0.48);
}
.modale-catalogue-parcours {
  display: flex;
  flex-direction: column;
  width: min(980px, 96vw);
  max-height: 96vh;
  overflow: hidden;
  border-radius: 12px;
  background: #f6f7fa;
  box-shadow: 0 10px 38px rgba(0, 0, 0, 0.32);
}
.modale-catalogue-parcours > header {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.8rem 1rem;
  border-bottom: 1px solid #ccd3df;
  background: #fff;
}
h2 { margin: 0; color: #1565c0; font-size: 1.05rem; }
header p { margin: 0.15rem 0 0; color: #596579; font-size: 0.78rem; }
header button { border: 1px solid #bbb; border-radius: 6px; background: #fff; padding: 0.4rem 0.7rem; cursor: pointer; white-space: nowrap; }
.corps-catalogue-parcours { overflow-y: auto; padding: 0.8rem; }
@media (max-height: 620px) {
  .voile-catalogue-parcours { align-items: stretch; padding: 1vh 1vw; }
  .modale-catalogue-parcours { max-height: 98vh; }
}
</style>
