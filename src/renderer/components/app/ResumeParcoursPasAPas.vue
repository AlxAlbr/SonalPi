<script setup lang="ts">
import { computed } from 'vue'
import { utiliserSonal } from '../../composables/sonal'

const {
  dernierParcoursId,
  etapeActive,
  etatsParcours,
  catalogueParcours,
  ouvrirCatalogueParcours,
  activer,
  allerAccueil,
  etapeCouranteId,
} = utiliserSonal()

const etat = computed(() =>
  dernierParcoursId.value
    ? etatsParcours.value.find((parcours) => parcours.id === dernierParcoursId.value) ?? null
    : null,
)
const definition = computed(() =>
  dernierParcoursId.value
    ? catalogueParcours.find((parcours) => parcours.id === dernierParcoursId.value) ?? null
    : null,
)
const etapeAffichee = computed(() => {
  const parcours = etat.value
  const parcoursDefinition = definition.value
  if (!parcours || !parcoursDefinition || parcours.termine) return null
  const id = etapeActive.value?.parcoursId === parcours.id
    ? etapeActive.value.etapeId
    : parcours.prochaineId
  return parcoursDefinition.etapes.find((etape) => etape.id === id) ?? null
})
const libelleEtape = computed(() =>
  etapeActive.value?.parcoursId === etat.value?.id ? 'Étape en cours' : 'Étape à reprendre',
)
const libelleAction = computed(() => {
  if (!etat.value) return 'Choisir un parcours'
  if (etat.value.termine) return 'Revoir le parcours'
  return etapeActive.value?.parcoursId === etat.value.id ? 'Reprendre l’étape' : 'Reprendre le parcours'
})

async function sortirDemo(): Promise<void> {
  try {
    await allerAccueil()
    etapeCouranteId.value = null
  } catch {
    // Le message de navigation explique pourquoi l’entretien reste ouvert.
  }
}

function continuer(): void {
  const parcours = etat.value
  const parcoursDefinition = definition.value
  if (!parcours || !parcoursDefinition) {
    ouvrirCatalogueParcours()
    return
  }
  const etapeId = etapeActive.value?.parcoursId === parcours.id
    ? etapeActive.value.etapeId
    : (parcours.prochaineId ?? parcoursDefinition.etapes[0]?.id)
  if (etapeId) activer(parcours.id, etapeId)
}
</script>

<template>
  <section
    class="resume-parcours"
    aria-label="Suivi du parcours pas à pas"
    data-testid="resume-parcours-global"
    tabindex="-1"
  >
    <div class="resume-contenu">
      <template v-if="etat">
        <div class="resume-titre">Démo : {{ etat.titre }}</div>
        <div class="resume-progression">
          {{ etat.nombreRealisees }} étape{{ etat.nombreRealisees > 1 ? 's' : '' }} sur {{ etat.total }}
          <span v-if="etat.termine" class="termine">· terminé ✓</span>
        </div>
        <div v-if="etapeAffichee" class="resume-etape">
          {{ libelleEtape }} : <strong>{{ etapeAffichee.titre }}</strong>
        </div>
      </template>
      <template v-else>
        <div class="resume-titre">Démo : découverte pas à pas</div>
        <div class="resume-progression">Choisissez un objectif de préparation ou de traitement.</div>
      </template>
    </div>
    <div class="resume-actions">
      <button class="principal" data-testid="continuer-parcours" @click="continuer">{{ libelleAction }}</button>
      <button
        v-if="etat"
        class="secondaire"
        @click="ouvrirCatalogueParcours(dernierParcoursId ?? undefined)"
      >
        <span class="action-principale">Voir les étapes ou changer de parcours</span>
      </button>
      <button class="sortir" @click="sortirDemo">Sortir de la démo</button>
    </div>
  </section>
</template>

<style scoped>
.resume-parcours {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  margin-bottom: 0.7rem;
  padding: 0.5rem 0.65rem;
  border: 1px solid #bdd2ec;
  border-left: 4px solid #2e73d8;
  border-radius: 7px;
  background: #f5f9ff;
}
.resume-contenu { min-width: 0; }
.resume-titre { color: #1565c0; font-size: 0.84rem; font-weight: 700; }
.resume-progression { color: #596579; font-size: 0.74rem; margin-top: 0.08rem; }
.resume-etape { color: #344760; font-size: 0.78rem; margin-top: 0.18rem; }
.termine { color: #1d7a44; }
.resume-actions { display: flex; flex: none; align-items: center; gap: 0.35rem; }
button { border-radius: 5px; cursor: pointer; font-size: 0.75rem; padding: 0.32rem 0.58rem; }
.principal { border: 1px solid #1565c0; background: #2e73d8; color: #fff; }
.secondaire {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  border: 1px solid #b8c9df;
  background: #fff;
  color: #315578;
  line-height: 1.15;
  text-align: left;
}
.secondaire:hover { border-color: #2e73d8; background: #edf5ff; }
.sortir {
  border: 0;
  background: transparent;
  color: #596579;
  text-decoration: underline;
}
.sortir:hover { color: #26384d; }
.action-principale { font-weight: 600; }
@media (max-width: 620px) {
  .resume-parcours { align-items: flex-start; flex-direction: column; }
  .resume-actions { flex-wrap: wrap; }
}
</style>
