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

<style>
/* Boutons de la barre d'onglet : un seul style pour tous les onglets du corpus.
 *  Le style n'est pas restreint au composant, car les boutons viennent des onglets eux-mêmes.
 *  Le sélecteur est volontairement précis pour l'emporter sur les styles locaux.
 */
.corpus-tete.barre-onglet .actions-barre-onglet button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  box-sizing: border-box;
  min-height: 2rem;
  margin: 0;
  padding: 0 0.65rem;
  border: 1px solid #c9d0da;
  border-radius: 6px;
  background: #fff;
  color: #2b3d55;
  font-family: inherit;
  font-size: 0.88rem;
  font-weight: 400;
  line-height: 1.2;
  white-space: nowrap;
  cursor: pointer;
}
.corpus-tete.barre-onglet .actions-barre-onglet button img {
  width: 1rem;
  height: 1rem;
}
.corpus-tete.barre-onglet .actions-barre-onglet button:hover:not(:disabled),
.corpus-tete.barre-onglet .actions-barre-onglet button[aria-pressed='true'],
.corpus-tete.barre-onglet .actions-barre-onglet button[aria-expanded='true'] {
  border-color: #2e73d8;
  background: #f0f6ff;
  color: #1565c0;
}
.corpus-tete.barre-onglet .actions-barre-onglet button:focus-visible {
  outline: 2px solid #2e73d8;
  outline-offset: 2px;
}
.corpus-tete.barre-onglet .actions-barre-onglet button:disabled {
  opacity: 0.55;
  cursor: default;
}
/* Le bouton « i » reste carré. */
.corpus-tete.barre-onglet .actions-barre-onglet button.bouton-info {
  width: 2rem;
  padding: 0;
}
/* Un groupe de choix (Tableau / Feuille) accole ses boutons. */
.corpus-tete.barre-onglet .actions-barre-onglet [role='group'] {
  display: flex;
}
.corpus-tete.barre-onglet .actions-barre-onglet [role='group'] button + button {
  margin-left: -1px;
}
.corpus-tete.barre-onglet .actions-barre-onglet [role='group'] button:not(:first-child) {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}
.corpus-tete.barre-onglet .actions-barre-onglet [role='group'] button:not(:last-child) {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}
.corpus-tete.barre-onglet .actions-barre-onglet [role='group'] button[aria-pressed='true'] {
  position: relative;
}
</style>
