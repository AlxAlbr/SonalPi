<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { RegleAnon } from '../../../shared/format'
import type { ApercuDissociationAnon, BilanDissociationAnon, BilanDissociationDistant, SuiviDissociationAnon, MotifRefusDissociation } from '../../../shared/corpus/dissociationAnon'
import { nettoyerMessage } from '../../erreurs'
import { suspendreTirageAutomatique } from '../../tirageAutomatique'
const props = defineProps<{ regle: RegleAnon; disponible: boolean; fournisseur?: string | null; suivi?: SuiviDissociationAnon | null }>()
const emit = defineEmits<{ fermer: []; termine: [bilan: BilanDissociationAnon]; partiel: [suivi: SuiviDissociationAnon]; activite: [occupe: boolean] }>()
const apercu = ref<ApercuDissociationAnon | null>(null), confirme = ref(false), enCours = ref(false)
const erreur = ref<string | null>(null), diagnostic = ref<string | null>(null), incertain = ref(props.suivi?.statut === 'indetermine'), boite = ref<HTMLDivElement | null>(null)
const suivi = ref<SuiviDissociationAnon | null>(props.suivi ?? null)
const suiviIndisponible = ref(false)
const distant = computed(() => props.fournisseur === 'gitlab' || props.fournisseur === 'webdav')
const nomFournisseur = computed(() => props.fournisseur === 'webdav' ? 'WebDAV' : 'GitLab')
const plafondEntretiens = computed(() => /limitée à (\d+) entretiens/.exec(apercu.value?.motifIndisponible ?? '')?.[1])
let vivant = true, generation = 0, focusAvant: HTMLElement | null = null
let reprendreTirage: (() => void) | null = null
const motifs: Record<MotifRefusDissociation, string> = {
  indisponible: 'Cet entretien ne peut pas être lu. Vérifiez qu’il est accessible.',
  'ancien-format': 'Ouvrez puis enregistrez cet entretien pour le mettre à jour.',
  'annotation-invalide': 'Un passage marqué doit être vérifié dans cet entretien.',
  'pseudo-divergent': 'Un pseudonyme doit être vérifié dans cet entretien.',
  'memoire-locale-recouvrante': 'Des noms ou pseudonymes sont déjà enregistrés séparément dans cet entretien. Vérifiez-les avant de continuer.',
  'memoire-locale-invalide': 'Les noms et pseudonymes enregistrés dans cet entretien doivent être vérifiés.',
  'decision-locale-recouvrante': 'Un choix indépendant concerne déjà le même nom dans cet entretien. Vérifiez-le avant de continuer.',
  'definition-corpus-recouvrante': 'Une autre règle concerne déjà ces noms. Vérifiez-la avant de continuer.',
  'annotations-ambigues': 'Des passages marqués se contredisent dans cet entretien. Vérifiez-les avant de continuer.',
}
function activite(v: boolean) {
  if (v && !reprendreTirage) reprendreTirage = suspendreTirageAutomatique()
  if (!v) { reprendreTirage?.(); reprendreTirage = null }
  enCours.value = v; emit('activite', v)
  if (v) void nextTick(() => { if (vivant && enCours.value) boite.value?.focus() })
}
function fermer() { if (!enCours.value) emit('fermer') }
async function preparer() {
  if (!props.disponible || enCours.value || incertain.value || suiviIndisponible.value || suivi.value?.regleRetiree) return
  const g = ++generation
  apercu.value = null; confirme.value = false; erreur.value = null; diagnostic.value = null; activite(true)
  try {
    const a = suivi.value
      ? await window.sonal.corpus.apercuRepriseDissociationAnon(suivi.value.operationId)
      : await window.sonal.corpus.apercuDissociationAnon({ regleId: props.regle.id })
    if (vivant && g === generation) apercu.value = a
  } catch (e) {
    if (vivant && g === generation) {
      erreur.value = 'Impossible de calculer le bilan. Réessayez ou rouvrez le corpus.'
      diagnostic.value = nettoyerMessage(e)
    }
  }
  finally { if (vivant) activite(false) }
}
async function appliquer() {
  const a = apercu.value
  if (!a || !props.disponible || !a.applicationDisponible || !a.faisable || !confirme.value || enCours.value || incertain.value) return
  const g = ++generation
  apercu.value = null; confirme.value = false; erreur.value = null; diagnostic.value = null; activite(true)
  try {
    const bilan = await window.sonal.corpus.dissocierRegleAnon(a.token, true)
    if (vivant && g === generation) {
      if ('statut' in bilan && bilan.statut !== 'termine') memoriserSuivi(bilan)
      else emit('termine', bilan)
    }
  } catch (e) {
    if (vivant && g === generation) {
      incertain.value = true
      erreur.value = distant.value
        ? `La modification n’a pas pu être terminée. Cliquez sur « Relire le suivi ${nomFournisseur.value} » pour vérifier ce qui a été enregistré avant de continuer.`
        : 'La modification n’a pas pu être terminée. Fermez cette fenêtre puis rouvrez le corpus pour vérifier ce qui a été enregistré, avant toute nouvelle dissociation.'
      diagnostic.value = nettoyerMessage(e)
    }
  } finally { if (vivant) activite(false) }
}
function memoriserSuivi(bilan: BilanDissociationDistant) {
  suivi.value = { ...bilan, demande: { regleId: props.regle.id } }
  incertain.value = bilan.statut === 'indetermine'
  suiviIndisponible.value = false
  emit('partiel', suivi.value)
}
async function relireSuivi() {
  if (enCours.value) return
  const g = ++generation
  apercu.value = null; confirme.value = false; activite(true)
  try {
    const actuel = suivi.value ?? await window.sonal.corpus.suiviDissociationAnon()
    if (!actuel) throw new Error('Aucun suivi trouvé. Rouvrez le corpus pour examiner son état, sans rejouer.')
    const bilan = await window.sonal.corpus.relireSuiviDissociationAnon(actuel.operationId)
    if (!vivant || g !== generation) return
    erreur.value = null; diagnostic.value = null
    if (bilan.statut === 'termine') emit('termine', bilan)
    else memoriserSuivi(bilan)
  } catch (e) {
    if (vivant && g === generation) {
      suiviIndisponible.value = true; incertain.value = true
      erreur.value = 'Impossible de vérifier l’avancement. Réessayez la lecture du suivi avant de continuer.'
      diagnostic.value = nettoyerMessage(e)
    }
  } finally { if (vivant) activite(false) }
}
watch(() => [props.regle.id, props.disponible, props.fournisseur], () => {
  generation++; apercu.value = null; confirme.value = false
})
function clavier(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer() }
  if (e.key !== 'Tab' || !boite.value) return
  const controles = [...boite.value.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), summary')].filter((element) => {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (parent.matches('details:not([open])') && !(element.matches('summary') && element.parentElement === parent)) return false
    }
    return true
  })
  const premier = controles[0], dernier = controles.at(-1)
  if (!controles.includes(document.activeElement as HTMLElement)) {
    e.preventDefault(); (e.shiftKey ? dernier : premier)?.focus()
    return
  }
  if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier?.focus() }
  else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier?.focus() }
}
onMounted(async () => {
  focusAvant = document.activeElement as HTMLElement
  await nextTick()
  if (!vivant) return
  boite.value?.focus()
  if (!distant.value) void preparer()
})
onUnmounted(() => { vivant = false; generation++; reprendreTirage?.(); reprendreTirage = null; emit('activite', false); if (focusAvant?.isConnected) focusAvant.focus() })
</script>
<template>
  <div class="voile" @click.self="fermer">
    <div ref="boite" class="dialogue" role="dialog" aria-modal="true" aria-labelledby="titre-dissociation" tabindex="-1" :aria-busy="enCours" @keydown="clavier">
      <header><h2 id="titre-dissociation">Dissocier une règle du corpus</h2><button :disabled="enCours" @click="fermer">Annuler</button></header>
      <p><strong>{{ regle.entite.join(' / ') }}</strong> — {{ regle.pseudos.join(' / ') }}</p>
      <p>La règle sera retirée du corpus. Chaque entretien concerné conservera ses pseudonymes, ses exceptions et la liste complète des noms et pseudonymes de cette règle. Vous pourrez ensuite les gérer séparément dans chaque entretien.</p>
      <p>Le texte, les autres règles, vos choix indépendants et les locuteurs ne changent pas. Aucun passage supplémentaire ne sera pseudonymisé.</p>
      <p>Cette modification ne peut pas être annulée depuis le Journal.</p>
      <p v-if="distant">Sur {{ nomFournisseur }}, les entretiens sont mis à jour l’un après l’autre. Si l’opération s’arrête, les changements déjà enregistrés sont conservés ; le suivi vous permettra de vérifier l’avancement avant de continuer.</p>
      <section v-if="suivi" role="status">
        <h3>Lot {{ nomFournisseur }} de dissociation à reprendre</h3>
        <p>{{ suivi.annotations }} passage(s) mis à jour dans {{ suivi.entretiens }} entretien(s). {{ suivi.regleRetiree ? 'La règle a été retirée ; il reste à actualiser votre copie du corpus.' : 'La règle reste dans le corpus tant que tous les entretiens concernés ne sont pas mis à jour.' }}</p>
        <p v-if="suivi.statut === 'indetermine'">Le serveur n’a pas confirmé le résultat. Relisez le suivi avant de continuer.</p>
        <p v-if="suivi.differes.length">{{ suivi.differes.length }} entretien(s) restent à mettre à jour. Les changements déjà enregistrés sont conservés.</p>
        <p v-if="suivi.nouvellesCibles.length">D’autres entretiens utilisent maintenant cette règle. Vérifiez le nouveau bilan et confirmez-le avant de continuer.</p>
        <details v-if="suivi.motif || suivi.differes.length || suivi.nouvellesCibles.length"><summary>Informations pour l’assistance</summary>
          <p v-if="suivi.motif">{{ suivi.motif }}</p>
          <ul><li v-for="c in suivi.differes" :key="c.id">{{ c.id }} : {{ c.motif }}</li></ul>
          <p v-if="suivi.nouvellesCibles.length">{{ suivi.nouvellesCibles.join(', ') }}</p>
        </details>
      </section>
      <button v-if="distant" :disabled="enCours" @click="relireSuivi">Relire le suivi {{ nomFournisseur }}</button>
      <p v-if="suiviIndisponible" role="alert">L’avancement ne peut pas être vérifié pour le moment. Réessayez la lecture du suivi avant de continuer.</p>
      <p v-if="enCours" role="status">Veuillez patienter…</p>
      <button v-if="distant || (!apercu && !enCours)" :disabled="!disponible || enCours || incertain || suiviIndisponible || !!suivi?.regleRetiree" @click="preparer">{{ enCours ? 'Opération en cours…' : suivi ? 'Recalculer la reprise' : distant ? 'Préparer la dissociation globale' : 'Actualiser le bilan' }}</button>
      <template v-if="apercu">
        <p><strong>{{ apercu.bilan.annotations }} passage(s) concerné(s) dans {{ apercu.bilan.entretiens }} entretien(s).</strong> Les pseudonymes et les {{ apercu.bilan.exceptions }} exception(s) sont conservés.</p>
        <p v-if="!apercu.bilan.entretiens">Cette règle n’est utilisée dans aucun entretien. Elle sera simplement retirée du corpus.</p>
        <p v-if="apercu.ciblesRetirees?.length">{{ apercu.ciblesRetirees.length }} entretien(s) ne sont plus concernés. Ils ne seront pas modifiés.</p>
        <p>Noms et pseudonymes conservés : {{ apercu.definitionLocale.entite.join(' / ') }} → {{ apercu.definitionLocale.pseudos.join(' / ') }}<template v-if="apercu.definitionLocale.categorie"> ; catégorie {{ apercu.definitionLocale.categorie }}</template>.</p>
        <p v-if="!apercu.applicationDisponible" role="alert">{{ plafondEntretiens ? `Cette version ne permet pas de dissocier plus de ${plafondEntretiens} entretiens à la fois. Cette opération ne peut pas être confirmée.` : apercu.motifIndisponible ? 'Cette opération ne peut pas être effectuée pour le moment. Consultez les informations pour l’assistance avant de réessayer.' : 'Un entretien est encore ouvert en modification, ou une autre opération reste à terminer. Fermez cet entretien ou terminez cette opération, puis fermez et rouvrez cette fenêtre.' }}</p>
        <details v-if="apercu.motifIndisponible"><summary>Informations pour l’assistance</summary><p>{{ apercu.motifIndisponible }}</p></details>
        <ul v-if="apercu.obstacles.length"><li v-for="(o, i) in apercu.obstacles" :key="i">{{ apercu.entretiens.find((e) => e.id === o.entretienId)?.titre ?? o.entretienId }} : {{ motifs[o.code] }}</li></ul>
        <details><summary>Voir les passages concernés</summary>
        <details v-for="e in apercu.entretiens.filter((e) => e.annotations)" :key="e.id"><summary>{{ e.titre }} — {{ e.annotations }} décision(s), {{ e.exceptions }} exception(s), {{ e.incluses }} incluse(s)</summary>
          <ul><li v-for="u in e.usages" :key="u.annotationId">{{ u.extrait }} : {{ u.etat === 'exception' ? 'laissé en clair' : 'pseudonymisé' }}<template v-if="u.pseudo"> → {{ u.pseudo }}</template><template v-if="u.incluse"> (à l’intérieur d’un autre passage)</template></li></ul>
        </details>
        </details>
        <label><input v-model="confirme" type="checkbox" :disabled="enCours || !apercu.faisable || !apercu.applicationDisponible" /> Je souhaite retirer cette règle du corpus et conserver les pseudonymes et exceptions dans chaque entretien concerné.</label>
        <button :disabled="enCours || !disponible || !apercu.faisable || !apercu.applicationDisponible || !confirme" @click="appliquer">Confirmer la dissociation globale</button>
      </template>
      <p v-if="erreur" role="alert" class="erreur">{{ erreur }}</p>
      <details v-if="diagnostic"><summary>Informations pour l’assistance</summary><p>{{ diagnostic }}</p></details>
      <p v-if="!disponible">La dissociation n’est pas disponible pour ce corpus.</p>
    </div>
  </div>
</template>
<style scoped>
.voile { position: fixed; inset: 0; z-index: 1100; background: #0006; display: flex; align-items: center; justify-content: center; padding: 1rem; }
.dialogue { background: white; width: 58rem; max-width: 100%; max-height: calc(100vh - 2rem); overflow: auto; padding: 1.2rem; border-radius: .4rem; }
header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; } h2 { margin: 0; font-size: 1.2rem; }
p, li { overflow-wrap: anywhere; } label { display: block; margin: 1rem 0; } button { padding: .45rem .7rem; } details { margin: .6rem 0; } .erreur { color: #b00020; }
</style>
