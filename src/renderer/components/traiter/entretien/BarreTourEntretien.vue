<script setup lang="ts">
/**
 *  Barre du tour de parole courant, au-dessus des onglets. Elle suit le curseur
 *  dans le texte ; les flèches permettent de passer d'un tour à l'autre sans
 *  déplacer le curseur. « Affiner » ouvre la fenêtre des temps du tour.
 */
import { utiliserSonal } from '../../../composables/sonal'
import { formaterDuree, formaterTemps } from '../../../../shared/entretien/horodatage'

const { barreTour, allerTourVoisin, tourHorodatage } = utiliserSonal()

function affiner() {
  if (barreTour.value) tourHorodatage.value = barreTour.value.posBloc
}
</script>

<template>
  <div v-if="barreTour" class="barre-tour" :style="{ '--couleur-tour': barreTour.couleur }">
    <div class="ligne-tour">
      <button
        type="button"
        class="fleche"
        :disabled="barreTour.rang <= 1"
        aria-label="Tour précédent"
        title="Tour précédent"
        @click="allerTourVoisin(-1)"
      >‹</button>
      <span class="nom" :title="barreTour.nom">{{ barreTour.nom }}</span>
      <span class="rang">{{ barreTour.rang }} / {{ barreTour.total }}</span>
      <button
        type="button"
        class="fleche"
        :disabled="barreTour.rang >= barreTour.total"
        aria-label="Tour suivant"
        title="Tour suivant"
        @click="allerTourVoisin(1)"
      >›</button>
    </div>
    <div class="ligne-tour secondaire">
      <template v-if="barreTour.bornes">
        <span class="plage">{{ formaterTemps(barreTour.bornes.debut) }} → {{ formaterTemps(barreTour.bornes.fin) }}</span>
        <span class="duree">{{ formaterDuree(barreTour.bornes.fin - barreTour.bornes.debut) }}</span>
      </template>
      <span v-else class="duree">Pas encore horodaté</span>
      <span class="espace"></span>
      <button type="button" class="affiner" @click="affiner">Affiner…</button>
    </div>
  </div>
</template>

<style scoped>
.barre-tour {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid #c9d8ef;
  border-left: 4px solid var(--couleur-tour);
  border-radius: 8px;
  background: #eef4fc;
  color: #2b3d55;
  font-size: 0.85rem;
}
.ligne-tour {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
}
.secondaire {
  flex-wrap: wrap;
}
.nom {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-weight: 700;
  color: var(--couleur-tour);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rang,
.duree {
  color: #6b7480;
  white-space: nowrap;
}
.plage {
  padding: 0.05rem 0.5rem;
  border-radius: 999px;
  background: #dbe7fa;
  color: #2a5596;
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  font-size: 0.8rem;
  white-space: nowrap;
}
.espace {
  flex: 1;
}
.fleche,
.affiner {
  padding: 0.15rem 0.5rem;
  border: 1px solid #c9d0da;
  border-radius: 5px;
  background: #fff;
  color: #2b3d55;
  cursor: pointer;
}
.fleche:hover:not(:disabled),
.affiner:hover {
  border-color: #2e73d8;
  color: #1565c0;
}
.fleche:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
