<script setup lang="ts">
import { computed, ref } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import type { DefinitionAttributCas, ModaliteAttributCas } from '../../../shared/corpus/cas'

const emit = defineEmits<{ fermer: [] }>()

const {
  famillesCas,
  listeCas,
  attributsCas,
  lectureSeule,
  creerDefinitionAttribut,
  modifierDefinitionAttribut,
  supprimerDefinitionAttribut,
  usagesAttribut,
} = utiliserSonal()

const creationOuverte = ref(false)
const libNouveau = ref('')
const typeNouveau = ref<'texte' | 'modalites'>('modalites')
const privNouveau = ref(false)
const modalitesNouvelles = ref<string[]>([''])
const erreurCreation = ref<string | null>(null)
const editionId = ref<string | null>(null)
const libEdition = ref('')
const privEdition = ref(false)
const modalitesEdition = ref<Array<{ id?: string; lib: string }>>([])
const erreurEdition = ref<string | null>(null)
const occupe = ref(false)

const definitions = computed(() => Object.values(attributsCas.value)
  .sort((a, b) => a.ordre - b.ordre || a.lib.localeCompare(b.lib, 'fr')))

function libellesModalitesEnEdition(definition: DefinitionAttributCas): Array<{ id?: string; lib: string }> {
  return definition.modalites.map((modalite) => ({ id: modalite.id, lib: modalite.lib }))
}

function commencerEdition(definition: DefinitionAttributCas) {
  editionId.value = definition.id
  libEdition.value = definition.lib
  privEdition.value = definition.priv
  modalitesEdition.value = libellesModalitesEnEdition(definition)
  erreurEdition.value = null
}

function annulerEdition() {
  editionId.value = null
  erreurEdition.value = null
}

async function enregistrerEdition() {
  const definition = attributsCas.value[editionId.value ?? '']
  if (!definition) return annulerEdition()
  occupe.value = true
  erreurEdition.value = null
  try {
    await modifierDefinitionAttribut(definition.id, {
      lib: libEdition.value,
      priv: privEdition.value,
      ...(definition.type === 'modalites'
        ? {
          modalites: modalitesEdition.value
            .filter((modalite) => modalite.lib.trim())
            .map((modalite) => ({
              id: modalite.id ?? `mod-${globalThis.crypto.randomUUID()}`,
              lib: modalite.lib,
            })),
        }
        : {}),
    })
    annulerEdition()
  } catch (e) {
    erreurEdition.value = e instanceof Error ? e.message : String(e)
  } finally {
    occupe.value = false
  }
}

async function creer() {
  occupe.value = true
  erreurCreation.value = null
  try {
    const modalites = modalitesNouvelles.value.filter((lib) => lib.trim())
    if (typeNouveau.value === 'modalites' && !modalites.length) {
      throw new Error('Ajoutez au moins une modalité de saisie, ou choisissez un attribut de texte libre.')
    }
    await creerDefinitionAttribut({
      lib: libNouveau.value,
      type: typeNouveau.value,
      priv: privNouveau.value,
      modalites: modalites.map((lib) => ({ lib })),
    })
    creationOuverte.value = false
    libNouveau.value = ''
    privNouveau.value = false
    modalitesNouvelles.value = ['']
  } catch (e) {
    erreurCreation.value = e instanceof Error ? e.message : String(e)
  } finally {
    occupe.value = false
  }
}

/** Annonce les usages avant de demander la suppression ; le main revalide. */
async function supprimer(definition: DefinitionAttributCas) {
  const usages = usagesAttribut(definition.id)
  const total = usages.valeursSaisies + usages.derivationsFamilles + usages.derivationsCas
  const message = total
    ? `L’attribut « ${definition.lib} » est encore utilisé : ${usages.valeursSaisies} valeur(s) saisie(s), ${usages.derivationsFamilles + usages.derivationsCas} recette(s) de dérivation. Retirez d’abord ces usages.`
    : `Supprimer l’attribut « ${definition.lib} » ? Aucune valeur ni recette ne l’utilise.`
  if (!window.confirm(message)) return
  occupe.value = true
  try {
    await supprimerDefinitionAttribut(definition.id)
  } catch (e) {
    erreurEdition.value = e instanceof Error ? e.message : String(e)
  } finally {
    occupe.value = false
  }
}

/** Où l'attribut apparaît : familles (recettes) et cas (valeurs saisies). */
function apercuUsages(definition: DefinitionAttributCas): string {
  const familles = Object.values(famillesCas.value)
    .filter((famille) => (famille.derivationsAttributs ?? []).some((d) => d.attributId === definition.id))
    .map((famille) => famille.nom)
  const avecValeur = listeCas.value
    .filter((cas) => cas.valeursAttributsSaisis?.[definition.id] !== undefined)
    .map((cas) => cas.nom)
  const parties: string[] = []
  if (familles.length) parties.push(`recettes : ${familles.join(', ')}`)
  if (avecValeur.length) parties.push(`valeurs : ${avecValeur.join(', ')}`)
  return parties.join(' · ')
}
</script>

<template>
  <section class="definitions-attributs">
    <header>
      <div>
        <h2>Attributs de cas du corpus</h2>
        <p>Définitions partagées par tous les cas : libellé, type, domaine de saisie et confidentialité. Les valeurs vivent sur chaque cas.</p>
      </div>
      <button @click="emit('fermer')">Retour aux cas</button>
    </header>

    <p v-if="!definitions.length" class="vide grande">
      Aucun attribut défini. Créez-en un pour saisir des valeurs sur les cas ou configurer des dérivations.
    </p>
    <article v-for="definition in definitions" :key="definition.id" class="definition-attribut">
      <template v-if="editionId === definition.id">
        <fieldset :disabled="occupe || lectureSeule" class="edition">
          <legend>Modifier « {{ definition.lib }} »</legend>
          <label>Libellé<input v-model="libEdition" /></label>
          <label class="case-cocher"><input v-model="privEdition" type="checkbox" /> Attribut privé — exclu des exports et rapports par défaut</label>
          <template v-if="definition.type === 'modalites'">
            <p>Modalités de saisie (les valeurs déjà saisies conservent leur modalité)</p>
            <div v-for="(modalite, index) in modalitesEdition" :key="index" class="ligne-mod">
              <input v-model="modalite.lib" :aria-label="`Modalité ${index + 1}`" />
              <button type="button" :disabled="modalitesEdition.length === 1" @click="modalitesEdition.splice(index, 1)">✕</button>
            </div>
            <button type="button" @click="modalitesEdition.push({ lib: '' })">+ Ajouter une modalité</button>
          </template>
          <p v-else class="aide">Attribut de texte libre : sans modalités.</p>
          <p v-if="erreurEdition" class="erreur">{{ erreurEdition }}</p>
          <div class="actions">
            <button :disabled="occupe" @click="annulerEdition">Annuler</button>
            <button class="primaire" :disabled="occupe || !libEdition.trim()" @click="enregistrerEdition">Enregistrer</button>
          </div>
        </fieldset>
      </template>
      <template v-else>
        <div class="entete-definition">
          <div>
            <b>{{ definition.lib }}</b>
            <span class="type">{{ definition.type === 'texte' ? 'texte libre' : `${definition.modalites.length} modalité(s)` }}</span>
            <span v-if="definition.priv" class="badge-prive">privé</span>
          </div>
          <div class="actions">
            <button :disabled="lectureSeule || occupe" @click="commencerEdition(definition)">Modifier</button>
            <button class="danger" :disabled="lectureSeule || occupe" @click="supprimer(definition)">Supprimer</button>
          </div>
        </div>
        <p v-if="definition.type === 'modalites' && definition.modalites.length" class="modalites">
          {{ definition.modalites.map((m: ModaliteAttributCas) => m.lib).join(' · ') }}
        </p>
        <p class="usages">{{ apercuUsages(definition) || 'Aucun usage pour le moment' }}</p>
      </template>
    </article>

    <details class="creation" :open="creationOuverte || !definitions.length" @toggle="creationOuverte = ($event.target as HTMLDetailsElement).open">
      <summary>Créer un attribut</summary>
      <fieldset :disabled="occupe || lectureSeule">
        <label>Libellé<input v-model="libNouveau" placeholder="Ex. Statut de suivi" /></label>
        <label class="case-cocher"><input v-model="typeNouveau" type="radio" value="modalites" /> Valeurs choisies parmi des modalités</label>
        <label class="case-cocher"><input v-model="typeNouveau" type="radio" value="texte" /> Texte libre</label>
        <template v-if="typeNouveau === 'modalites'">
          <p>Modalités de saisie</p>
          <div v-for="(lib, index) in modalitesNouvelles" :key="index" class="ligne-mod">
            <input v-model="modalitesNouvelles[index]" :aria-label="`Modalité ${index + 1}`" placeholder="Libellé de la modalité" />
            <button type="button" :disabled="modalitesNouvelles.length === 1" @click="modalitesNouvelles.splice(index, 1)">✕</button>
          </div>
          <button type="button" @click="modalitesNouvelles.push('')">+ Ajouter une modalité</button>
        </template>
        <label class="case-cocher"><input v-model="privNouveau" type="checkbox" /> Attribut privé — exclu des exports et rapports par défaut</label>
        <p v-if="erreurCreation" class="erreur">{{ erreurCreation }}</p>
        <div class="actions">
          <button class="primaire" :disabled="!libNouveau.trim()" @click="creer">Créer l’attribut</button>
        </div>
      </fieldset>
    </details>
  </section>
</template>

<style scoped>
.definitions-attributs { max-width: 46rem; margin: 0 auto; display: grid; gap: .8rem; }
.definitions-attributs header { display: flex; align-items: center; justify-content: space-between; gap: .5rem; border-bottom: 1px solid #eee; padding-bottom: .7rem; }
.definitions-attributs header p { margin: .25rem 0 0; color: #666; font-size: .85rem; }
h2 { margin: 0; font-size: 1.1rem; }
.definition-attribut { border: 1px solid #ddd; border-radius: 6px; padding: .6rem; }
.entete-definition { display: flex; justify-content: space-between; align-items: flex-start; gap: .5rem; }
.type { color: #777; font-size: .8rem; margin-left: .5rem; }
.badge-prive { margin-left: .5rem; padding: .05rem .35rem; border-radius: 999px; background: #fdecea; color: #b3261e; font-size: .7rem; }
.modalites { color: #555; font-size: .85rem; margin: .3rem 0 0; }
.usages { color: #888; font-size: .78rem; margin: .25rem 0 0; }
.edition { display: grid; gap: .6rem; }
.edition label { display: grid; gap: .25rem; font-size: .85rem; color: #555; }
.case-cocher { display: flex; align-items: center; gap: .4rem; }
.case-cocher input { width: auto; flex: none; }
.ligne-mod { display: flex; gap: .3rem; }
.ligne-mod input { flex: 1; }
.actions { display: flex; justify-content: flex-end; gap: .5rem; }
.creation summary { cursor: pointer; color: #2e73d8; }
.creation fieldset { display: grid; gap: .6rem; border: 1px solid #ddd; border-radius: 6px; margin-top: .5rem; }
.creation label { display: grid; gap: .25rem; font-size: .85rem; color: #555; }
.aide { font-size: .82rem; color: #666; }
.erreur { color: #b3261e; }
.primaire { border-color: #1565c0; background: #2e73d8; color: #fff; }
.danger { color: #b3261e; }
.vide { color: #888; }
.grande { text-align: center; margin-top: 3rem; }
</style>
