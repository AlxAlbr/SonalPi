<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import type { EtapePasAPas } from '../../composables/parcours/types'
import type { ParcoursId } from '../../../shared/format'

const emit = defineEmits<{ (e: 'parcours-lance', parcoursId: ParcoursId): void }>()

const {
  etapes,
  etapeActive,
  etapeCourante,
  validees,
  etatParcours,
  etatsParcours,
  parcoursSelectionneId,
  definitionSelectionnee,
  selectionnerParcours,
  activer,
} = utiliserSonal()

const racine = ref<HTMLElement | null>(null)
const parcoursDisponibles = computed(() => etatsParcours.value.filter((parcours) => parcours.disponible))

function bloquee(etape: EtapePasAPas): boolean {
  return !!etape.requiere && !validees.value.has(etape.requiere)
}

function titreEtape(id: string): string {
  return etapes.value.find((etape) => etape.id === id)?.titre ?? id
}

function libelleAction(parcours: (typeof etatsParcours.value)[number]): string {
  if (parcours.termine) return 'Revoir'
  return parcours.nombreRealisees === 0 ? 'Découvrir' : 'Continuer'
}

function ouvrirParcours(parcoursId: ParcoursId): void {
  selectionnerParcours(parcoursId)
}

function lancerParcours(parcoursId: ParcoursId): void {
  const etat = etatsParcours.value.find((parcours) => parcours.id === parcoursId)
  selectionnerParcours(parcoursId)
  const premiere = etat?.prochaineId ?? definitionSelectionnee.value.etapes[0]?.id
  if (premiere) {
    activer(parcoursId, premiere)
    emit('parcours-lance', parcoursId)
  }
}

async function mettreEnVue(parcoursId?: ParcoursId) {
  if (parcoursId) selectionnerParcours(parcoursId)
  await nextTick()
  racine.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  racine.value?.focus({ preventScroll: true })
}

defineExpose({ mettreEnVue })
</script>

<template>
  <section
    ref="racine"
    class="panneau pas-a-pas"
    data-testid="parcours-pas-a-pas"
    tabindex="-1"
    aria-labelledby="titre-parcours-pas-a-pas"
  >
    <div class="catalogue-tete">
      <div>
        <h3 id="titre-parcours-pas-a-pas">Découverte pas à pas</h3>
        <p>Choisissez votre objectif. Les progressions sont indépendantes.</p>
      </div>
      <span class="analyse-avenir">Analyse — à venir</span>
    </div>

    <div class="cartes-parcours" role="list" aria-label="Parcours disponibles">
      <article
        v-for="parcours in parcoursDisponibles"
        :key="parcours.id"
        class="carte-parcours"
        :class="{ selectionnee: parcoursSelectionneId === parcours.id }"
        role="listitem"
        @click="ouvrirParcours(parcours.id)"
      >
        <div class="carte-parcours-tete">
          <h4>{{ parcours.titre }}</h4>
          <span>{{ parcours.nombreRealisees }}/{{ parcours.total }}</span>
        </div>
        <p>{{ parcours.resume }}</p>
        <div class="carte-parcours-pied">
          <span v-if="parcours.termine" class="termine">Terminé ✓</span>
          <span v-else>{{ parcours.nombreRealisees }} étape{{ parcours.nombreRealisees > 1 ? 's' : '' }} réalisée{{ parcours.nombreRealisees > 1 ? 's' : '' }}</span>
          <button @click.stop="lancerParcours(parcours.id)">{{ libelleAction(parcours) }}</button>
        </div>
      </article>
    </div>

    <div class="detail-parcours">
      <div class="detail-tete">
        <div>
          <h4>{{ definitionSelectionnee.titre }}</h4>
          <p>{{ definitionSelectionnee.resume }}</p>
        </div>
        <span class="progression-pp">{{ etatParcours.nombreRealisees }} étapes sur {{ etapes.length }}</span>
      </div>

      <p v-if="etatParcours.termine" class="etat-parcours termine" role="status">
        Parcours terminé. Vous pouvez revoir une étape ci-dessous.
      </p>
      <p v-else-if="etapeCourante && etapeActive?.parcoursId === parcoursSelectionneId" class="etat-parcours" role="status">
        {{ definitionSelectionnee.titre }} · Étape en cours : <b>{{ etapeCourante.titre }}</b>
      </p>
      <p v-else class="aide-pp">Choisissez une étape : elle se coche lorsque le résultat est réellement enregistré.</p>

      <ol class="liste-pp">
        <li
          v-for="(etape, index) in etapes"
          :key="etape.id"
          :class="{
            fait: validees.has(etape.id),
            actif: etapeActive?.parcoursId === parcoursSelectionneId && etapeActive?.etapeId === etape.id,
            bloquee: bloquee(etape),
          }"
        >
          <button
            class="ligne-pp"
            :disabled="bloquee(etape)"
            :title="bloquee(etape) ? `Faites d'abord « ${titreEtape(etape.requiere!)} »` : undefined"
            @click="activer(parcoursSelectionneId, etape.id)"
          >
            <span class="num">{{ validees.has(etape.id) ? '✓' : (etape.numCle ?? index + 1) }}</span>
            <span class="titre-pp">{{ etape.titre }}</span>
            <span v-if="etapeActive?.parcoursId === parcoursSelectionneId && etapeActive?.etapeId === etape.id" class="statut-pp">en cours</span>
          </button>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped>
.pas-a-pas { border: 1px solid #c9dff5; background: #f7fbff; padding: 0.9rem; }
.pas-a-pas:focus-visible { outline: 3px solid #2e73d8; outline-offset: 3px; }
.catalogue-tete, .detail-tete, .carte-parcours-tete, .carte-parcours-pied {
  display: flex; align-items: center; justify-content: space-between; gap: 0.8rem;
}
h3, h4, p { margin: 0; }
.catalogue-tete h3 { color: #1565c0; font-size: 1rem; }
.catalogue-tete p, .detail-tete p, .carte-parcours p { color: #596579; font-size: 0.78rem; line-height: 1.35; margin-top: 0.18rem; }
.analyse-avenir { color: #7d8490; font-size: 0.74rem; white-space: nowrap; }
.cartes-parcours { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.7rem; margin-top: 0.75rem; }
.carte-parcours { border: 1px solid #cfd8e6; border-radius: 9px; background: #fff; padding: 0.65rem; cursor: pointer; }
.carte-parcours:hover, .carte-parcours.selectionnee { border-color: #2e73d8; }
.carte-parcours.selectionnee { box-shadow: inset 0 0 0 1px #2e73d8; }
.carte-parcours h4 { font-size: 0.9rem; }
.carte-parcours-tete span { color: #1565c0; font-size: 0.75rem; font-weight: 700; }
.carte-parcours-pied { color: #687386; font-size: 0.72rem; margin-top: 0.55rem; }
.carte-parcours-pied .termine { color: #1d7a44; }
.carte-parcours-pied button { border: 1px solid #1565c0; border-radius: 5px; background: #2e73d8; color: #fff; cursor: pointer; font-size: 0.75rem; padding: 0.3rem 0.6rem; }
.detail-parcours { border-top: 1px solid #dbe4f0; margin-top: 0.8rem; padding-top: 0.7rem; }
.detail-tete { align-items: flex-start; }
.detail-tete h4 { font-size: 0.92rem; }
.progression-pp { color: #596579; font-size: 0.75rem; font-weight: 600; white-space: nowrap; }
.aide-pp, .etat-parcours { color: #666; font-size: 0.78rem; line-height: 1.35; margin: 0.45rem 0; }
.etat-parcours.termine { color: #1d7a44; }
.liste-pp { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.35rem; }
.ligne-pp { display: flex; align-items: center; gap: 0.5rem; width: 100%; text-align: left; border: 1px solid #e0e5ed; border-radius: 6px; background: #fff; padding: 0.42rem 0.5rem; cursor: pointer; font-size: 0.8rem; }
.ligne-pp:hover { border-color: #2e73d8; background: #f0f6ff; }
.ligne-pp:disabled { opacity: 0.45; cursor: not-allowed; }
.liste-pp li.actif .ligne-pp { border-color: #2e73d8; background: #e8f0fb; font-weight: 600; }
.num { width: 1.4rem; height: 1.4rem; flex: none; border-radius: 50%; background: #eef; color: #556; display: flex; align-items: center; justify-content: center; font-size: 0.72rem; font-weight: 600; }
.liste-pp li.fait .num { background: #2e73d8; color: #fff; }
.titre-pp { min-width: 0; }
.statut-pp { color: #1565c0; font-size: 0.68rem; font-weight: 600; margin-left: auto; white-space: nowrap; }
@media (max-width: 760px) {
  .cartes-parcours, .liste-pp { grid-template-columns: 1fr; }
  .catalogue-tete { align-items: flex-start; flex-direction: column; }
}
</style>
