<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import { EXEMPLES } from '../../../shared/exemples'
import CatalogueParcours from './CatalogueParcours.vue'
import InstallationExemple from './InstallationExemple.vue'
const {
  catalogueParcoursOuvert, explorationExemples, fermerDecouverte, etatExemples,
  explorerExemple, operationExemple, erreurExemples, demandeInstallation, retrouverTravail, choisirTravail,
  demoReinitialisee, lancerParcours,
} = utiliserSonal()
const dialogue = ref<HTMLDialogElement | null>(null)
const titreDialogue = ref<HTMLHeadingElement | null>(null)
watch(demoReinitialisee, async (bilan) => {
  await nextTick()
  if (!dialogue.value?.open) return
  if (bilan) titreDialogue.value?.focus()
  else dialogue.value.querySelector<HTMLButtonElement>('.principal')?.focus()
})
const ouvert = computed(() => catalogueParcoursOuvert.value || explorationExemples.value)
watch(ouvert, async (valeur) => {
  await nextTick()
  if (valeur && !dialogue.value?.open) dialogue.value?.showModal()
  if (!valeur && dialogue.value?.open) dialogue.value.close()
}, { immediate: true })
const libre = (id: string) => etatExemples.value?.travaux.find((t) => t.id === etatExemples.value?.libres[id as 'synth' | 'synth-annote'])
const travauxLibres = (id: string) => etatExemples.value?.travaux.filter((t) => t.usage === 'libre' && t.exemple === id) ?? []
</script>
<template>
  <Teleport to="body">
    <dialog ref="dialogue" class="modale-catalogue-parcours" :class="{ 'voile-catalogue-parcours': ouvert }" aria-labelledby="titre-modale-parcours" @cancel.prevent="fermerDecouverte">
      <header>
        <h2 id="titre-modale-parcours" ref="titreDialogue" :tabindex="demoReinitialisee ? -1 : undefined">
          {{ demoReinitialisee ? 'La démo a été remise à zéro' : explorationExemples ? 'Explorer les corpus exemples' : 'Choisir un parcours pas à pas' }}
        </h2>
        <button :disabled="operationExemple" @click="fermerDecouverte">Fermer {{ explorationExemples ? 'les exemples' : 'les parcours' }}</button>
      </header>
      <section v-if="demoReinitialisee" class="bilan-demo">
        <p v-if="demoReinitialisee.exemple === 'synth-annote'">Le corpus annoté de la démo « {{ demoReinitialisee.titre }} » a été restauré dans son état de départ. Toutes ses étapes sont à refaire.</p>
        <p v-else>Le corpus de la démo « {{ demoReinitialisee.titre }} » est à nouveau vierge. Toutes ses étapes sont à refaire.</p>
        <p>Vos autres corpus n’ont pas été modifiés.</p>
        <p>La démo reste au même emplacement :</p>
        <p class="chemin">{{ demoReinitialisee.emplacement }}</p>
        <div class="actions-bilan">
          <button :disabled="operationExemple" @click="demoReinitialisee = null">Revenir aux parcours</button>
          <button class="principal" :disabled="operationExemple" @click="lancerParcours()">Commencer la première étape</button>
        </div>
      </section>
      <template v-else>
        <p>{{ explorationExemples ? 'Chaque exemple devient votre copie modifiable. Aucun guide ne démarre.' : 'Choisissez ce que vous voulez apprendre. Consulter les parcours ne change pas votre corpus actif.' }}</p>
        <p v-if="!etatExemples" role="status">Lecture de vos travaux…</p>
        <div v-if="explorationExemples" class="exemples">
          <section v-for="exemple in EXEMPLES" :key="exemple.id" class="exemple">
            <h3>{{ exemple.titre }}</h3><p>{{ exemple.resume }}</p>
            <template v-if="libre(exemple.id)?.etat === 'absent'">
              <p>Nous ne retrouvons plus votre corpus.</p><button @click="retrouverTravail(libre(exemple.id)!)">Retrouver mon dossier…</button>
            </template>
            <template v-else>
              <p v-if="libre(exemple.id)" class="chemin">{{ libre(exemple.id)!.dir }}</p>
              <button class="principal" :disabled="operationExemple || !etatExemples" @click="explorerExemple(exemple.id)">{{ libre(exemple.id) ? 'Reprendre mon corpus' : 'Ouvrir ma copie' }}</button>
            </template>
            <details v-if="libre(exemple.id)"><summary>Options</summary>
              <button :disabled="operationExemple" @click="explorerExemple(exemple.id, true)">Commencer dans un nouveau corpus…</button>
              <template v-if="travauxLibres(exemple.id).length > 1">
                <label :for="`choix-libre-${exemple.id}`">Choisir un autre corpus d’exploration</label>
                <select :id="`choix-libre-${exemple.id}`" :value="libre(exemple.id)?.dir" :disabled="operationExemple"
                  @change="choisirTravail(($event.target as HTMLSelectElement).value)">
                  <option v-for="travail in travauxLibres(exemple.id)" :key="travail.id" :value="travail.dir">{{ travail.nom }} — {{ travail.dir }}</option>
                </select>
              </template>
            </details>
          </section>
        </div>
        <CatalogueParcours v-else />
      </template>
      <p v-if="erreurExemples" class="erreur" role="alert">{{ erreurExemples }}</p>
    </dialog>
  </Teleport>
  <InstallationExemple v-if="demandeInstallation" />
</template>
<style scoped>
dialog { width: min(900px, 94vw); max-height: 94vh; overflow: auto; border: 1px solid #bdcde0; border-radius: 12px; padding: 1.2rem; background: #fff; }
dialog::backdrop { background: rgba(0,0,0,.48); }
header { display: flex; justify-content: space-between; align-items: start; gap: 1rem; }
h2 { margin: 0; font-size: 1.1rem; color: #1565c0; } h3 { font-size: 1rem; }
p, button, summary { font-size: .85rem; } p { line-height: 1.5; }
button { border: 1px solid #bdcde0; background: white; border-radius: 6px; padding: .5rem .7rem; cursor: pointer; }
button:focus-visible, summary:focus-visible { outline: 3px solid #ae5b00; outline-offset: 3px; }
.actions-bilan { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: 1rem; }
.exemples { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; } .exemple { padding: .9rem; border: 1px solid #cfd8e6; border-radius: 8px; }
.principal { color: white; background: #2368ae; }.chemin { overflow-wrap: anywhere; } details { margin-top: 1rem; } summary { cursor: pointer; }
label, select { display: block; margin-top: .6rem; max-width: 100%; }
.erreur { color: #8c231b; background: #ffebe8; padding: .7rem; }
@media (max-width: 620px) { .exemples { grid-template-columns: 1fr; } header { flex-wrap: wrap; } }
</style>
