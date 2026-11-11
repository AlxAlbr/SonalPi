<script setup lang="ts">
import { utiliserSonal } from '../../../composables/sonal'

defineProps<{ lectureSeule: boolean }>()

const { entreesJournal, annulerEntree } = utiliserSonal()
</script>

<template>
  <aside class="panneau journal">
    <div class="corpus-tete">
      <h3>Journal</h3>
    </div>
    <p class="aide-thm">
      Les 10 dernières actions de cet entretien, pendant cette session. Utilisez ↩ pour annuler une action de cette liste.
      Dans le texte, Ctrl+Z annule les modifications du texte et les attributions à un locuteur, mais pas les attributions de thèmes.
    </p>
    <p v-if="entreesJournal.length === 0" class="vide">Aucune action enregistrée.</p>
    <ul class="liste-journal">
      <li v-for="e in entreesJournal" :key="e.id" :class="{ grisee: !e.annulable }">
        <span class="heure">{{ e.heure }}</span>
        <span class="lib-journal">{{ e.libelle }}</span>
        <button
          v-if="!lectureSeule"
          class="annuler-entree"
          :disabled="!e.annulable"
          :title="e.annulable ? 'Annuler cette action' : 'Cette action ne peut plus être annulée : les données ont changé.'"
          @click="annulerEntree(e.id)"
        >↩</button>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.liste-journal {
  list-style: none;
  margin: 0.3rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.liste-journal li {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid #e5e5ef;
  border-radius: 6px;
  padding: 0.3rem 0.45rem;
  background: #fff;
  font-size: 0.8rem;
}
.liste-journal li.grisee {
  opacity: 0.45;
}
.heure {
  font-size: 0.68rem;
  color: #999;
  font-family: monospace;
  flex: none;
}
.lib-journal {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.annuler-entree {
  border: 1px solid #ccc;
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
  padding: 0.05rem 0.4rem;
  font-size: 0.85rem;
  flex: none;
}
.annuler-entree:hover:not(:disabled) {
  border-color: #2e73d8;
  color: #1565c0;
}
.annuler-entree:disabled {
  cursor: not-allowed;
  color: #bbb;
}
</style>
