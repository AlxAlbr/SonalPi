<script setup lang="ts" generic="T extends string">
/**
 *  Onglets communs aux espaces de travail : icône et libellé,
 *  trait bleu sous l'onglet actif, ligne fine sous l'ensemble.
 */
defineProps<{
  onglets: { id: T; libelle: string; icone: string; tour?: string }[]
  actif: T | null
}>()
const emit = defineEmits<{ choisir: [id: T] }>()
</script>

<template>
  <nav class="onglets-espace">
    <button
      v-for="onglet in onglets"
      :key="onglet.id"
      class="onglet"
      :class="{ actif: actif === onglet.id }"
      :aria-current="actif === onglet.id ? 'page' : undefined"
      :aria-label="onglet.libelle"
      :title="onglet.libelle"
      :data-tour="onglet.tour"
      @click="emit('choisir', onglet.id)"
    ><img class="ico-onglet" :src="onglet.icone" alt="" /><span class="libelle-onglet">{{ onglet.libelle }}</span></button>
  </nav>
</template>

<style scoped>
.onglets-espace {
  display: flex;
  flex: none;
  gap: 0.25rem;
  min-width: 0;
  border-bottom: 1px solid #e2e4ec;
}
.onglet {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  /* Le trait de l'onglet actif recouvre la ligne de séparation. */
  margin-bottom: -1px;
  border: none;
  border-bottom: 3px solid transparent;
  border-radius: 0;
  background: none;
  padding: 0.35rem 0.75rem;
  color: #6a6e80;
  font-size: 0.85rem;
  white-space: nowrap;
  cursor: pointer;
}
.onglet:hover {
  color: #23253a;
}
.onglet:focus-visible {
  outline: 2px solid #2e73d8;
  outline-offset: -2px;
}
.onglet.actif {
  border-bottom-color: #2e73d8;
  font-weight: 600;
  color: #1565c0;
}
.ico-onglet {
  width: 20px;
  height: 20px;
  object-fit: contain;
  opacity: 0.6;
  flex: none;
}
.onglet.actif .ico-onglet {
  opacity: 1;
}
/* En fenêtre étroite, les onglets reviennent aux icônes seules ;
   le libellé reste lu par les lecteurs d'écran et affiché au survol. */
@media (max-width: 900px) {
  .onglet {
    padding: 0.35rem;
    width: 38px;
  }
  .libelle-onglet {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}
</style>
