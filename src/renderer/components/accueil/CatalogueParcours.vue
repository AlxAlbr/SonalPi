<script setup lang="ts">
import { computed } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import type { ParcoursId } from '../../../shared/format'
import { lireProgressionsDemo } from '../../composables/parcours/marqueur'

const {
  catalogueParcours, parcoursChoisi, choisirParcours, definitionChoisie, progressionChoisie,
  presentationChoisie, travailApprentissage, etatExemples,
  lancerParcours, recommencerDemo, retrouverTravail, restaurerSources,
  operationExemple, etapeActive,
} = utiliserSonal()
const descriptionsCartes: Record<ParcoursId, string> = {
  preparation: 'Tableau de bord et documents du projet.',
  traitement: 'Import, notes et codage.',
  analyse: 'Thèmes, mots et comparaisons.',
  organisation: 'Cas, recueils et exports.',
}
const disponible = computed(() => definitionChoisie.value.disponible())
const progressionDisponible = computed(() => !travailApprentissage.value || travailApprentissage.value.etat === 'pret')
const libelle = computed(() => presentationChoisie.value.termine ? 'Revoir le parcours'
  : presentationChoisie.value.nombreRealisees ? 'Continuer le parcours' : 'Commencer le parcours')
function travailPour(id: ParcoursId) {
  const travailId = etatExemples.value?.apprentissages[id]
  return etatExemples.value?.travaux.find((travail) => travail.id === travailId)
}
function resumeProgression(id: ParcoursId): string {
  const travail = travailPour(id)
  if (travail && travail.etat !== 'pret') return 'Démo à retrouver ou à recommencer'
  const marqueur = travail?.marqueur
  const validees = marqueur ? lireProgressionsDemo(marqueur).progressions[id] : new Set<string>()
  const definition = catalogueParcours.find((p) => p.id === id)!
  const nombre = definition.etapes.filter((e) => validees.has(e.id)).length
  return `${nombre} étape${nombre > 1 ? 's' : ''} sur ${definition.etapes.length}`
}
</script>

<template>
  <section class="panneau pas-a-pas" data-testid="parcours-pas-a-pas">
    <div class="cartes-parcours" aria-label="Parcours disponibles">
      <button v-for="parcours in catalogueParcours" :key="parcours.id" class="carte-parcours"
        :aria-pressed="parcoursChoisi === parcours.id" aria-controls="detail-parcours"
        :disabled="operationExemple" @click="choisirParcours(parcours.id)">
        <strong>{{ parcours.titre }}</strong>
        <span>{{ descriptionsCartes[parcours.id] }}</span><span>{{ resumeProgression(parcours.id) }}</span>
      </button>
    </div>
    <div id="detail-parcours" class="detail-parcours">
      <h3>{{ definitionChoisie.titre }}</h3>
      <template v-if="disponible">
        <p>{{ definitionChoisie.resume }}</p>
        <p v-if="progressionDisponible" class="progression-pp">{{ presentationChoisie.nombreRealisees }} étape{{ presentationChoisie.nombreRealisees > 1 ? 's' : '' }} sur {{ definitionChoisie.etapes.length }}</p>
        <p v-else>La progression sera relue lorsque votre corpus sera retrouvé et reconnu.</p>
        <ol class="liste-pp" role="list">
          <li v-for="(etape, index) in definitionChoisie.etapes" :key="etape.id" :class="{ fait: progressionChoisie.has(etape.id), actif: etapeActive?.parcoursId === parcoursChoisi && etapeActive?.etapeId === etape.id }">
            <button class="ligne-pp" :disabled="operationExemple || !progressionDisponible || (!!etape.requiere && !progressionChoisie.has(etape.requiere))"
              @click="lancerParcours(etape.id)">
              <span class="num">{{ progressionChoisie.has(etape.id) ? '✓' : index + 1 }}</span>
              {{ etape.titre }}<span v-if="progressionChoisie.has(etape.id)"> — revoir</span>
            </button>
          </li>
        </ol>
        <template v-if="travailApprentissage?.etat === 'absent'">
          <p class="information" role="status">Nous ne retrouvons plus cette démo.</p>
          <button :disabled="operationExemple" @click="retrouverTravail(travailApprentissage)">Retrouver mon dossier…</button>
        </template>
        <p v-else-if="travailApprentissage?.etat === 'illisible'" class="information" role="status">Cette démo ne peut pas être lue.</p>
        <template v-else>
          <button class="principal" :disabled="operationExemple || !etatExemples" @click="lancerParcours()">{{ libelle }}</button>
          <button v-if="travailApprentissage" class="recommencer" :disabled="operationExemple" @click="recommencerDemo">Recommencer cette démo</button>
        </template>
        <p v-if="etatExemples && !etatExemples.sourcesPresentes" class="information">Des fichiers d’exercice manquent.
          <button :disabled="operationExemple" @click="restaurerSources">Restaurer les fichiers d’exercice</button>
        </p>
      </template>
      <p v-else>{{ definitionChoisie.indisponibilite?.() }}</p>
    </div>
  </section>
</template>

<style scoped>
.cartes-parcours { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .65rem; }
button { font: inherit; cursor: pointer; }
button { border: 1px solid #bdcde0; border-radius: 7px; background: white; color: #245186; padding: .5rem .8rem; }
button:disabled { opacity: .5; cursor: default; }
button:focus-visible { outline: 3px solid #ae5b00; outline-offset: 3px; }
.carte-parcours { display: grid; grid-template-rows: auto 1fr auto; gap: .4rem; text-align: left; padding: .7rem; min-width: 0; }
.carte-parcours strong { font-size: .9rem; line-height: 1.3; min-height: 2.6em; }
.carte-parcours span { font-size: .8rem; line-height: 1.4; }
.carte-parcours[aria-pressed=true] { background: #e9f3ff; border-color: #2769ad; box-shadow: inset 0 0 0 1px #2769ad; }
.detail-parcours { margin-top: 1rem; }
h3 { margin: 0; font-size: 1rem; }
p { font-size: .85rem; line-height: 1.5; }
.liste-pp { list-style: none; padding: 0; }
.liste-pp li { margin-bottom: .45rem; }
.ligne-pp { text-align: left; }
.num { margin-right: .4rem; }
.principal { color: white; background: #2368ae; }
.recommencer { margin-left: .5rem; color: #8c231b; }
.information { border-left: 4px solid #2368ae; padding: .7rem; background: #f0f6ff; }
@media (max-width: 800px) { .cartes-parcours { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 480px) { .cartes-parcours { grid-template-columns: 1fr; } }
</style>
