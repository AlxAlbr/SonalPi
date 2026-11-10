<script setup lang="ts">
/**
 *  Barre commune aux onglets du corpus : phrase d'aide à gauche,
 *  actions de l'onglet alignées à droite. L'onglet affiche déjà son nom ;
 *  le titre reste lu par les lecteurs d'écran, sans être affiché.
 */
defineProps<{ titre: string; aide?: string }>()
</script>

<template>
  <div class="corpus-tete barre-onglet">
    <div class="barre-onglet-titre">
      <h2 class="titre-onglet">{{ titre }}</h2>
      <p v-if="aide || $slots.aide"><slot name="aide">{{ aide }}</slot></p>
    </div>
    <div class="actions-barre-onglet"><slot /></div>
  </div>
</template>

<style scoped>
.barre-onglet {
  align-items: center;
  gap: 1rem;
  min-height: 2rem;
  margin-bottom: 0.6rem;
}
.barre-onglet-titre {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}
.titre-onglet {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.barre-onglet-titre p {
  margin: 0;
  color: #7a7f8c;
  font-size: 0.8rem;
  line-height: 1.35;
}
.actions-barre-onglet {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 0.4rem;
}
@media (max-width: 780px) {
  .barre-onglet {
    flex-direction: column;
  }
  .actions-barre-onglet {
    justify-content: flex-start;
  }
}
</style>
