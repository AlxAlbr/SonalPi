<script setup lang="ts">
import { computed } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import type { CorrespondanceAssociation } from '../../../editor/associationsPassage'

const {
  selectionPassage,
  associationsPassage,
  etatAssociationsPassage,
  ouvrirCasAssocie,
  ouvrirOccurrenceRecueilAssociee,
} = utiliserSonal()

const nombreAssociations = computed(() =>
  associationsPassage.value.cas.length + associationsPassage.value.recueils.length)

const libelleResume = computed(() => {
  if (etatAssociationsPassage.value === 'chargement') return 'Associations du passage — vérification…'
  const parties: string[] = []
  if (associationsPassage.value.cas.length) {
    parties.push(`${associationsPassage.value.cas.length} cas`)
  }
  if (associationsPassage.value.recueils.length) {
    parties.push(`${associationsPassage.value.recueils.length} recueil${associationsPassage.value.recueils.length > 1 ? 's' : ''}`)
  }
  if (!parties.length) return etatAssociationsPassage.value === 'incomplet'
    ? 'Associations du passage — vérification incomplète'
    : 'Associations du passage — aucune'
  return `Associations du passage — ${parties.join(' · ')}`
})

function libelleCorrespondance(correspondance: CorrespondanceAssociation): string {
  if (correspondance === 'exacte') return 'passage exact'
  if (correspondance === 'selection-dans-passage') return 'passage plus large'
  if (correspondance === 'passage-dans-selection') return 'passage compris dans la sélection'
  return 'chevauchement partiel'
}
</script>

<template>
  <details v-if="selectionPassage" class="resume-associations">
    <summary>
      <span>{{ libelleResume }}</span>
      <small v-if="etatAssociationsPassage === 'incomplet'">Certaines associations n’ont pas pu être vérifiées.</small>
    </summary>

    <div class="contenu-associations" aria-live="polite">
      <p class="extrait-selection" :title="selectionPassage.texte">« {{ selectionPassage.texte }} »</p>
      <p v-if="etatAssociationsPassage === 'chargement'" class="etat-associations">Vérification des cas et recueils…</p>
      <template v-else>
        <p v-if="nombreAssociations === 0" class="etat-associations">
          {{ etatAssociationsPassage === 'incomplet'
            ? 'Aucune association vérifiée pour cette sélection.'
            : 'Cette sélection ne figure dans aucun cas ni recueil.' }}
        </p>

        <section v-if="associationsPassage.cas.length" class="groupe-associations">
          <h3>Cas</h3>
          <ul>
            <li v-for="courant in associationsPassage.cas" :key="courant.id">
              <button @click="ouvrirCasAssocie(courant.id)">{{ courant.nom }}</button>
              <span v-if="courant.manuel" class="origine manuel">Ajout manuel</span>
              <span
                v-for="raison in courant.raisonsAutomatiques"
                :key="raison"
                class="origine automatique"
              >Inclus automatiquement · {{ raison }}</span>
            </li>
          </ul>
        </section>

        <section v-if="associationsPassage.recueils.length" class="groupe-associations">
          <h3>Recueils</h3>
          <ul>
            <li v-for="recueil in associationsPassage.recueils" :key="recueil.id">
              <button
                v-if="recueil.occurrences.length === 1"
                @click="ouvrirOccurrenceRecueilAssociee(recueil.id, recueil.occurrences[0].itemId)"
              >{{ recueil.nom }}</button>
              <details v-else class="choix-occurrences">
                <summary>{{ recueil.nom }} · {{ recueil.occurrences.length }} occurrences</summary>
                <div class="occurrences">
                  <button
                    v-for="(occurrence, index) in recueil.occurrences"
                    :key="occurrence.itemId"
                    @click="ouvrirOccurrenceRecueilAssociee(recueil.id, occurrence.itemId)"
                  >Ouvrir l’occurrence {{ index + 1 }} · {{ libelleCorrespondance(occurrence.correspondance) }}</button>
                </div>
              </details>
            </li>
          </ul>
        </section>

        <details v-if="associationsPassage.problemes.length" class="associations-incompletes">
          <summary>Éléments non vérifiés ({{ associationsPassage.problemes.length }})</summary>
          <ul><li v-for="probleme in associationsPassage.problemes" :key="probleme">{{ probleme }}</li></ul>
        </details>
      </template>
    </div>
  </details>
</template>

<style scoped>
.resume-associations {
  margin: .45rem 0 .7rem;
  border: 1px solid #d7dfeb;
  border-radius: 7px;
  background: #f8fbff;
  font-size: .82rem;
}
.resume-associations > summary {
  display: flex;
  align-items: center;
  gap: .5rem;
  padding: .42rem .6rem;
  cursor: pointer;
  color: #294b78;
  font-weight: 600;
}
.resume-associations > summary small {
  margin-left: auto;
  color: #9a651b;
  font-weight: 400;
}
.contenu-associations { padding: 0 .65rem .65rem; }
.extrait-selection {
  margin: 0 0 .55rem;
  color: #667085;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.etat-associations { margin: .35rem 0; color: #667085; }
.groupe-associations + .groupe-associations { margin-top: .6rem; }
.groupe-associations h3 { margin: 0 0 .3rem; font-size: .82rem; color: #344054; }
.groupe-associations ul, .associations-incompletes ul { margin: 0; padding-left: 1.15rem; }
.groupe-associations li { margin: .25rem 0; }
.groupe-associations button, .occurrences button {
  border: 0;
  background: transparent;
  color: #1565c0;
  cursor: pointer;
  padding: .1rem .2rem;
  text-align: left;
  font: inherit;
}
.groupe-associations button:hover, .occurrences button:hover { text-decoration: underline; }
.origine {
  display: inline-block;
  margin-left: .35rem;
  padding: .08rem .35rem;
  border-radius: 999px;
  font-size: .7rem;
}
.origine.manuel { background: #e8f1ff; color: #245b9e; }
.origine.automatique { background: #eaf6ee; color: #267044; }
.choix-occurrences > summary { cursor: pointer; color: #1565c0; }
.occurrences { display: flex; flex-direction: column; align-items: flex-start; margin: .2rem 0 .35rem .7rem; }
.associations-incompletes { margin-top: .55rem; color: #8a5a18; }
.associations-incompletes > summary { cursor: pointer; }
@media (max-width: 760px) {
  .resume-associations > summary { align-items: flex-start; flex-direction: column; }
  .resume-associations > summary small { margin-left: 0; }
}
</style>
