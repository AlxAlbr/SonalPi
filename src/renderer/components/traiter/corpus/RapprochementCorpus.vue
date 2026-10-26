<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Variable } from '../../../../shared/format'
import type { CommandePersonnes, InventairePersonnes, VueLocuteurPersonne } from '../../../../shared/corpus/personnes'
import type { ChoixRepriseLocuteur } from '../../../../shared/corpus/rapprochementsPersonnes'

const props = defineProps<{ inventaire: InventairePersonnes; cible: VueLocuteurPersonne; candidat: VueLocuteurPersonne; variables: Variable[] }>()
const emit = defineEmits<{ annuler: []; valider: [commande: CommandePersonnes] }>()
const dialogue = ref<HTMLDialogElement | null>(null)
const annuler = ref<HTMLButtonElement | null>(null)
const retour = document.activeElement as HTMLElement | null
const cle = (l: VueLocuteurPersonne) => JSON.stringify([l.entretienId, l.locuteurId])
const fiches = computed(() => props.inventaire.personnes.filter(p => p.id === props.cible.personneRef || p.id === props.candidat.personneRef))
const fusion = computed(() => fiches.value.length === 2)
const conserverId = ref(props.candidat.personneRef ?? '')
const membres = (id: string) => props.inventaire.locuteurs.filter(l => l.personneRef === id)
const conflits = computed(() => {
  if (!fusion.value) return []
  const tous = fiches.value.flatMap(p => membres(p.id))
  return [...new Set(tous.filter(l => tous.filter(x => x.entretienId === l.entretienId).length > 1).map(l => l.entretienTitre))]
})
const total = computed(() => new Set(fiches.value.flatMap(p => membres(p.id)).map(l => l.entretienId)).size)
const nomsDifferents = computed(() => new Set(fiches.value.map((p) => p.nom.trim())).size > 1)
const sources = computed(() => props.candidat.personneRef
  ? membres(props.candidat.personneRef).filter(l => l.entretienId !== props.cible.entretienId)
  : [props.candidat])
const valeur = (l: VueLocuteurPersonne, v: Variable) => v.modalites.find(m => m.id === l.valeursLoc[v.id])?.lib ?? l.valeursLoc[v.id] ?? 'Vide'
const changements = (l: VueLocuteurPersonne) => {
  const lignes: string[] = []
  if (l.pseudo?.trim() && l.pseudo.trim() !== props.cible.pseudo?.trim()) lignes.push(`pseudonyme : ${props.cible.pseudo?.trim() || 'Vide'} → ${l.pseudo.trim()}`)
  if (l.interviewer !== props.cible.interviewer) lignes.push(`statut : ${props.cible.interviewer ? 'interviewer' : 'interviewé·e'} → ${l.interviewer ? 'interviewer' : 'interviewé·e'}`)
  for (const v of props.variables) {
    if (l.valeursLoc[v.id] && l.valeursLoc[v.id] !== props.cible.valeursLoc[v.id]) lignes.push(`${v.lib} : ${valeur(props.cible, v)} → ${valeur(l, v)}`)
  }
  return lignes
}
const sourcesUtiles = computed(() => sources.value.filter((l) => changements(l).length))
const signatureInformations = (l: VueLocuteurPersonne) => JSON.stringify([
  l.pseudo?.trim() ?? '', l.interviewer,
  props.variables.map((v) => [v.id, l.valeursLoc[v.id] ?? '']),
])
const informationsSourcesDifferentes = computed(() => new Set(sourcesUtiles.value.map(signatureInformations)).size > 1)
const sourceCle = ref('')
const source = computed(() => sourcesUtiles.value.find(l => cle(l) === sourceCle.value))
const reprendreInformations = ref(false)
watch([sourcesUtiles, informationsSourcesDifferentes], () => {
  sourceCle.value = sourcesUtiles.value.length && !informationsSourcesDifferentes.value
    ? cle(sourcesUtiles.value[0])
    : ''
}, { immediate: true })
function confirmer() {
  if ((reprendreInformations.value && !source.value) || conflits.value.length || (fusion.value && props.inventaire.indisponibles.length)) return
  const reprise: ChoixRepriseLocuteur | undefined = reprendreInformations.value && source.value
    ? { variables: props.variables.filter((v) => source.value?.valeursLoc[v.id]).map((v) => v.id), pseudo: true, interviewer: true, remplacer: true }
    : undefined
  if (fusion.value) {
    emit('valider', { type: 'fusionner', conserverId: conserverId.value,
      absorberId: fiches.value.find(p => p.id !== conserverId.value)!.id,
      attendu: JSON.stringify(props.inventaire),
      reprise: reprise && source.value ? { entretienId: props.cible.entretienId, locuteurId: props.cible.locuteurId,
        sourceEntretienId: source.value.entretienId, sourceLocuteurId: source.value.locuteurId, choix: reprise } : undefined })
  } else {
    const sourceRapprochement = source.value ?? props.candidat
    emit('valider', { type: 'rapprocher', entretienId: props.cible.entretienId, locuteurId: props.cible.locuteurId,
      sourceEntretienId: sourceRapprochement.entretienId, sourceLocuteurId: sourceRapprochement.locuteurId, attendu: JSON.stringify(props.inventaire), reprise })
  }
}
onMounted(async () => { dialogue.value?.showModal(); await nextTick(); annuler.value?.focus() })
onBeforeUnmount(() => { dialogue.value?.close(); retour?.focus() })
</script>

<template>
  <dialog ref="dialogue" aria-labelledby="titre-regroupement" @cancel.prevent="emit('annuler')">
    <h2 id="titre-regroupement">{{ fusion ? 'Réunir ces deux personnes ?' : 'Même personne ?' }}</h2>
    <template v-if="fusion">
      <div class="groupes-personnes">
        <section v-for="p in fiches" :key="p.id">
          <h3>{{ p.nom }}</h3>
          <p>{{ membres(p.id).map((l) => l.entretienTitre).join(', ') }}</p>
        </section>
      </div>
      <p>Les {{ total }} entretien{{ total > 1 ? 's' : '' }} seront réunis. Leurs noms et leurs informations locales resteront inchangés.</p>
      <label v-if="nomsDifferents">Nom de référence à conserver
        <select v-model="conserverId"><option v-for="p in fiches" :key="p.id" :value="p.id">{{ p.nom }}</option></select>
      </label>
      <p v-if="conflits.length" role="alert">Réunion impossible : plusieurs locuteurs sont concernés dans {{ conflits.join(', ') }}. Annulez puis modifiez leur association.</p>
      <p v-if="inventaire.indisponibles.length" role="alert">Certains entretiens sont indisponibles. Actualisez l’inventaire avant de les réunir.</p>
    </template>
    <template v-else>
      <div class="groupes-personnes">
        <section><h3>{{ cible.nom }}</h3><p>{{ cible.entretienTitre }}</p></section>
        <section><h3>{{ candidat.nom }}</h3><p>{{ candidat.entretienTitre }}</p></section>
      </div>
      <p>Ces locuteurs désigneront la même personne. Leurs noms et leurs informations locales resteront inchangés.</p>
    </template>
    <section v-if="sourcesUtiles.length" class="reprise-informations">
      <label class="choix-global">
        <input v-model="reprendreInformations" type="checkbox" />
        Reprendre toutes les informations disponibles vers « {{ cible.nom }} » dans « {{ cible.entretienTitre }} ».
      </label>
      <template v-if="reprendreInformations">
        <fieldset v-if="informationsSourcesDifferentes">
          <legend>Choisir l’entretien source</legend>
          <label v-for="s in sourcesUtiles" :key="cle(s)">
            <input v-model="sourceCle" type="radio" name="source-reprise-corpus" :value="cle(s)" />
            <span><strong>{{ s.entretienTitre }}</strong> · {{ changements(s).join(' · ') }}</span>
          </label>
        </fieldset>
        <p v-else-if="source"><strong>Depuis {{ source.entretienTitre }} :</strong> {{ changements(source).join(' · ') }}.</p>
        <p v-if="informationsSourcesDifferentes && !source">Choisissez une source pour continuer.</p>
      </template>
    </section>
    <div class="actions">
      <button ref="annuler" @click="emit('annuler')">Annuler</button>
      <button :disabled="(reprendreInformations && !source) || !!conflits.length || (fusion && !!inventaire.indisponibles.length)" @click="confirmer">{{ fusion ? 'Réunir' : 'Confirmer' }}</button>
    </div>
  </dialog>
</template>

<style scoped>
dialog { max-width: 650px; max-height: 85vh; overflow: auto; padding: 24px; border: 1px solid #888; border-radius: 8px; }
dialog::backdrop { background: #0006; }
.groupes-personnes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.groupes-personnes section { padding: 12px; border: 1px solid #d4dce6; border-radius: 6px; background: #f6f9fc; }
.groupes-personnes h3, .groupes-personnes p { margin: 0; }
.groupes-personnes p { margin-top: 5px; color: #52606d; }
label { display: block; margin: 12px 0; }
select { display: block; max-width: 100%; }
.reprise-informations { margin: 18px 0; padding: 12px; border: 1px solid #cadbf2; border-radius: 6px; background: #f4f8ff; }
.choix-global, fieldset label { display: flex; align-items: flex-start; gap: 8px; }
.choix-global input, fieldset input { flex: 0 0 auto; margin-top: 3px; }
fieldset { margin-top: 12px; border: 1px solid #cadbf2; }
.actions { display: flex; justify-content: flex-end; gap: 12px; }
</style>
