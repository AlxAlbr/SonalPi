<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Variable } from '../../../shared/format'
import type { CommandePersonnes, InventairePersonnes, VueLocuteurPersonne } from '../../../shared/corpus/personnes'
import type { ChoixRepriseLocuteur } from '../../../shared/corpus/rapprochementsPersonnes'

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
const sources = computed(() => props.candidat.personneRef
  ? membres(props.candidat.personneRef).filter(l => l.entretienId !== props.cible.entretienId)
  : [props.candidat])
const sourceCle = ref(cle(props.candidat))
const source = computed(() => sources.value.find(l => cle(l) === sourceCle.value))
const repriseOuverte = ref(false)
const choix = ref<ChoixRepriseLocuteur>({ variables: [] })
watch(source, () => {
  choix.value = { variables: props.variables.filter(v => source.value?.valeursLoc[v.id] && !props.cible.valeursLoc[v.id]).map(v => v.id), pseudo: false, interviewer: false, remplacer: false }
}, { immediate: true })
const valeur = (l: VueLocuteurPersonne, v: Variable) => v.modalites.find(m => m.id === l.valeursLoc[v.id])?.lib ?? l.valeursLoc[v.id] ?? 'Vide'
function confirmer() {
  if (!source.value || conflits.value.length || (fusion.value && props.inventaire.indisponibles.length)) return
  const reprise = repriseOuverte.value ? { ...choix.value, variables: [...choix.value.variables] } : undefined
  if (fusion.value) {
    emit('valider', { type: 'fusionner', conserverId: conserverId.value,
      absorberId: fiches.value.find(p => p.id !== conserverId.value)!.id,
      attendu: JSON.stringify(props.inventaire),
      reprise: reprise ? { entretienId: props.cible.entretienId, locuteurId: props.cible.locuteurId,
        sourceEntretienId: source.value.entretienId, sourceLocuteurId: source.value.locuteurId, choix: reprise } : undefined })
  } else {
    emit('valider', { type: 'rapprocher', entretienId: props.cible.entretienId, locuteurId: props.cible.locuteurId,
      sourceEntretienId: source.value.entretienId, sourceLocuteurId: source.value.locuteurId, attendu: JSON.stringify(props.inventaire), reprise })
  }
}
onMounted(async () => { dialogue.value?.showModal(); await nextTick(); annuler.value?.focus() })
onBeforeUnmount(() => { dialogue.value?.close(); retour?.focus() })
</script>

<template>
  <dialog ref="dialogue" aria-labelledby="titre-regroupement" @cancel.prevent="emit('annuler')">
    <h2 id="titre-regroupement">Même personne&nbsp;?</h2>
    <template v-if="fusion">
      <ul><li v-for="p in fiches" :key="p.id"><strong>{{ p.nom }}</strong> — {{ membres(p.id).length }} entretien(s)</li></ul>
      <p>Les {{ total }} entretiens seront réunis. Les noms et les données propres aux entretiens resteront inchangés, sauf reprise choisie ci-dessous.</p>
      <label>Nom à conserver
        <select v-model="conserverId"><option v-for="p in fiches" :key="p.id" :value="p.id">{{ p.nom }}</option></select>
      </label>
      <p>Les refus entre ces deux personnes seront retirés. Les décisions concernant d’autres personnes seront conservées.</p>
      <p v-if="conflits.length" role="alert">Réunion impossible : plusieurs locuteurs sont concernés dans {{ conflits.join(', ') }}. Annulez puis modifiez leur association.</p>
      <p v-if="inventaire.indisponibles.length" role="alert">Certains entretiens sont indisponibles. Actualisez l’inventaire avant de les réunir.</p>
    </template>
    <template v-else>
      <p><strong>{{ cible.nom }}</strong> · {{ cible.entretienTitre }}<br /><strong>{{ candidat.nom }}</strong> · {{ candidat.entretienTitre }}</p>
      <p>Ces locuteurs désigneront la même personne. Leurs noms et leurs données resteront propres à chaque entretien.</p>
    </template>
    <details @toggle="repriseOuverte = ($event.target as HTMLDetailsElement).open">
      <summary>Reprendre aussi certaines données…</summary>
      <p>Copie ponctuelle vers « {{ cible.nom }} » dans « {{ cible.entretienTitre }} », sans synchronisation future. Refermer cette section annule la reprise.</p>
      <label>Entretien source des données
        <select v-model="sourceCle"><option v-for="s in sources" :key="cle(s)" :value="cle(s)">{{ s.entretienTitre }} · {{ s.nom }}</option></select>
      </label>
      <p v-if="sources.length > 1">Changer de source réinitialise les champs sélectionnés.</p>
      <template v-if="source">
        <label v-for="v in variables.filter(v => source?.valeursLoc[v.id])" :key="v.id"><input v-model="choix.variables" type="checkbox" :value="v.id" />{{ v.lib }} : {{ valeur(cible, v) }} → {{ valeur(source, v) }}</label>
        <label><input v-model="choix.pseudo" type="checkbox" :disabled="!source.pseudo" />Utiliser le même pseudonyme : {{ cible.pseudo || 'Vide' }} → {{ source.pseudo || 'Vide' }}</label>
        <p>Le pseudonyme repris sera confirmé pour l’affichage. Aucune règle d’anonymisation du texte ne sera modifiée.</p>
        <label><input v-model="choix.interviewer" type="checkbox" />Interv. : {{ cible.interviewer ? 'oui' : 'non' }} → {{ source.interviewer ? 'oui' : 'non' }}</label>
        <label><input v-model="choix.remplacer" type="checkbox" />Autoriser le remplacement des valeurs déjà renseignées pour les champs sélectionnés</label>
        <p>Sans remplacement, seules les valeurs vides seront remplies. Un statut interviewer déjà défini nécessite aussi cette autorisation.</p>
      </template>
    </details>
    <div class="actions">
      <button ref="annuler" @click="emit('annuler')">Annuler</button>
      <button :disabled="!source || !!conflits.length || (fusion && !!inventaire.indisponibles.length)" @click="confirmer">{{ fusion ? 'Réunir' : 'Confirmer' }}</button>
    </div>
  </dialog>
</template>

<style scoped>
dialog { max-width: 650px; max-height: 85vh; overflow: auto; padding: 24px; border: 1px solid #888; border-radius: 8px; }
dialog::backdrop { background: #0006; }
label { display: block; margin: 12px 0; }
select { display: block; max-width: 100%; }
summary { cursor: pointer; }
details { margin: 20px 0; }
.actions { display: flex; justify-content: flex-end; gap: 12px; }
</style>
