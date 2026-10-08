<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import type { EtapePasAPas } from '../../composables/demo'

const {
  etapes,
  etapeCouranteId,
  etapeCourante,
  validees,
  etatParcours,
  activer,
} = utiliserSonal()

const racine = ref<HTMLElement | null>(null)
const nombreRealisees = computed(() => etatParcours.value.nombreRealisees)
const parcoursTermine = computed(() => etatParcours.value.termine)
const etapeProposee = computed(() => etatParcours.value.prochaine)
const libelleAction = computed(() => {
  if (!etapeProposee.value) return ''
  return nombreRealisees.value === 0
    ? 'Commencer'
    : `Continuer : ${etapeProposee.value.titre}`
})

function bloquee(e: EtapePasAPas): boolean {
  return !!e.requiere && !validees.value.has(e.requiere)
}

function titreEtape(id: string): string {
  return etapes.find((e) => e.id === id)?.titre ?? id
}

function continuer() {
  if (etapeProposee.value) activer(etapeProposee.value.id)
}

async function mettreEnVue() {
  await nextTick()
  racine.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  racine.value?.focus({ preventScroll: true })
}

defineExpose({ mettreEnVue })
</script>

<template>
  <aside
    ref="racine"
    class="panneau pas-a-pas"
    data-testid="parcours-pas-a-pas"
    tabindex="-1"
    aria-labelledby="titre-parcours-pas-a-pas"
  >
    <div class="corpus-tete">
      <h3 id="titre-parcours-pas-a-pas">Découverte pas à pas</h3>
      <span class="progression-pp">{{ nombreRealisees }} étapes sur {{ etapes.length }} réalisées</span>
    </div>

    <p v-if="parcoursTermine" class="etat-parcours termine" role="status">
      Parcours terminé. Vous pouvez réessayer une étape ci-dessous.
    </p>
    <p v-else-if="etapeCourante" class="etat-parcours" role="status">
      Étape en cours : <b>{{ etapeCourante.titre }}</b>
    </p>
    <p v-else class="aide-pp">Choisissez une étape : elle se coche lorsque l’action est réalisée.</p>

    <button
      v-if="!etapeCourante && etapeProposee"
      class="continuer-pp"
      data-testid="continuer-parcours"
      @click="continuer"
    >
      {{ libelleAction }}
    </button>

    <ol class="liste-pp">
      <li
        v-for="(e, i) in etapes"
        :key="e.id"
        :class="{ fait: validees.has(e.id), actif: etapeCouranteId === e.id, bloquee: bloquee(e) }"
      >
        <button
          class="ligne-pp"
          :disabled="bloquee(e)"
          :title="bloquee(e) ? `Faites d'abord « ${titreEtape(e.requiere!)} »` : undefined"
          @click="activer(e.id)"
        >
          <span class="num">{{ validees.has(e.id) ? '✓' : (e.numCle ?? i + 1) }}</span>
          <span class="titre-pp">{{ e.titre }}</span>
          <span v-if="etapeCouranteId === e.id" class="statut-pp">en cours</span>
        </button>
      </li>
    </ol>
  </aside>
</template>

<style scoped>
.pas-a-pas:focus-visible {
  outline: 3px solid #2e73d8;
  outline-offset: 3px;
}
.pas-a-pas .corpus-tete {
  align-items: flex-start;
  flex-direction: column;
  gap: 0.15rem;
}
.progression-pp {
  color: #596579;
  font-size: 0.75rem;
  font-weight: 600;
}
.aide-pp,
.etat-parcours {
  color: #666;
  font-size: 0.78rem;
  line-height: 1.35;
  margin: 0.4rem 0;
}
.etat-parcours.termine {
  color: #1d7a44;
}
.continuer-pp {
  width: 100%;
  border: 1px solid #1565c0;
  border-radius: 6px;
  background: #2e73d8;
  color: #fff;
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 600;
  padding: 0.45rem 0.6rem;
  margin: 0 0 0.55rem;
}
.continuer-pp:hover {
  background: #1565c0;
}
.liste-pp {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.ligne-pp {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  text-align: left;
  border: 1px solid #e5e5ef;
  border-radius: 6px;
  background: #fff;
  padding: 0.4rem 0.5rem;
  cursor: pointer;
  font-size: 0.82rem;
}
.ligne-pp:hover {
  border-color: #2e73d8;
  background: #f0f6ff;
}
.ligne-pp:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  border-color: #e5e5ef;
}
.ligne-pp:disabled:hover {
  border-color: #e5e5ef;
  background: #fff;
}
.liste-pp li.actif .ligne-pp {
  border-color: #2e73d8;
  background: #e8f0fb;
  font-weight: 600;
}
.num {
  width: 1.4rem;
  height: 1.4rem;
  flex: none;
  border-radius: 50%;
  background: #eef;
  color: #556;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 600;
}
.liste-pp li.fait .num {
  background: #2e73d8;
  color: #fff;
}
.titre-pp {
  min-width: 0;
}
.statut-pp {
  color: #1565c0;
  font-size: 0.68rem;
  font-weight: 600;
  margin-left: auto;
  white-space: nowrap;
}
</style>
