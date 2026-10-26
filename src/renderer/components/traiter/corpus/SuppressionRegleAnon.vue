<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { RegleAnon } from '../../../../shared/format'
import type { ApercuSuppressionAnon, BilanSuppressionAnon, BilanSuppressionDistant, SuiviSuppressionAnon, MotifRefusSuppressionAnon } from '../../../../shared/corpus/suppressionAnon'
import { nettoyerMessage } from '../../../erreurs'
import { suspendreTirageAutomatique } from '../../../tirageAutomatique'

const props = defineProps<{ regle: RegleAnon; disponible: boolean; contexte: number; fournisseur?: string | null; suivi?: SuiviSuppressionAnon | null }>()
const emit = defineEmits<{ fermer: []; termine: [bilan: BilanSuppressionAnon]; partiel: [suivi: SuiviSuppressionAnon]; activite: [occupe: boolean] }>()
const apercu = ref<ApercuSuppressionAnon | null>(null), confirme = ref(false), enCours = ref(false)
const erreur = ref<string | null>(null), diagnostic = ref<string | null>(null), incertain = ref(props.suivi?.statut === 'indetermine'), boite = ref<HTMLDivElement | null>(null)
const distant = computed(() => props.fournisseur === 'gitlab' || props.fournisseur === 'webdav')
const nomFournisseur = computed(() => props.fournisseur === 'webdav' ? 'WebDAV' : 'GitLab')
const suivi = ref<SuiviSuppressionAnon | null>(props.suivi ?? null), suiviIndisponible = ref(false), suiviAbsent = ref(false)
const plafondEntretiens = computed(() => /limitée à (\d+) entretiens/.exec(apercu.value?.motifIndisponible ?? '')?.[1])
let vivant = true, generation = 0, focusAvant: HTMLElement | null = null, reprendreTirage: (() => void) | null = null
const motifs: Record<MotifRefusSuppressionAnon, string> = {
  indisponible: 'Cet entretien ne peut pas être lu. Vérifiez qu’il est accessible',
  'ancien-format': 'Ouvrez puis enregistrez cet entretien pour le mettre à jour',
  'annotation-invalide': 'Un passage marqué doit être vérifié dans cet entretien',
  'pseudo-divergent': 'Un pseudonyme doit être vérifié dans cet entretien',
  'memoire-locale-recouvrante': 'Les noms et pseudonymes enregistrés dans cet entretien doivent être vérifiés',
  'memoire-locale-invalide': 'Les noms et pseudonymes enregistrés dans cet entretien doivent être vérifiés',
  'annotations-ambigues': 'Des passages marqués se contredisent dans cet entretien. Vérifiez-les avant de continuer',
}
function activite(v: boolean) {
  if (v && !reprendreTirage) reprendreTirage = suspendreTirageAutomatique()
  if (!v) { reprendreTirage?.(); reprendreTirage = null }
  enCours.value = v; emit('activite', v)
  if (v) void nextTick(() => { if (vivant && enCours.value) boite.value?.focus() })
}
function fermer() { if (!enCours.value) emit('fermer') }
async function preparer() {
  if (!props.disponible || enCours.value || incertain.value || suiviIndisponible.value || suivi.value?.regleRetiree || suivi.value?.miroirIncomplet) return
  const g = ++generation
  apercu.value = null; confirme.value = false; erreur.value = null; diagnostic.value = null; activite(true)
  try {
    const a = suivi.value
      ? await window.sonal.corpus.apercuRepriseSuppressionAnon(suivi.value.operationId)
      : await window.sonal.corpus.apercuSuppressionAnon({ regleId: props.regle.id })
    if (vivant && g === generation) apercu.value = a
  } catch (e) {
    if (vivant && g === generation) {
      erreur.value = 'Impossible de calculer le bilan. Réessayez ou rouvrez le corpus.'
      diagnostic.value = nettoyerMessage(e)
    }
  } finally { if (vivant) activite(false) }
}
async function appliquer() {
  const a = apercu.value
  if (!a || !props.disponible || !a.applicationDisponible || !a.faisable || !confirme.value || enCours.value || incertain.value) return
  const g = ++generation
  apercu.value = null; confirme.value = false; erreur.value = null; diagnostic.value = null; activite(true)
  try {
    const bilan = await window.sonal.corpus.supprimerRegleAnonPartout(a.token, true)
    if (vivant && g === generation) {
      if ('statut' in bilan && bilan.statut !== 'termine') memoriserSuivi(bilan)
      else emit('termine', bilan)
    }
  } catch (e) {
    if (vivant && g === generation) {
      incertain.value = true
      erreur.value = distant.value
        ? `La suppression n’a pas pu être terminée. Cliquez sur « Relire le suivi ${nomFournisseur.value} » pour vérifier ce qui a été enregistré avant de continuer.`
        : 'La suppression n’a pas pu être terminée. Fermez cette fenêtre puis rouvrez le corpus pour vérifier ce qui a été enregistré, avant toute nouvelle suppression.'
      diagnostic.value = nettoyerMessage(e)
    }
  } finally { if (vivant) activite(false) }
}
function memoriserSuivi(bilan: BilanSuppressionDistant) {
  suivi.value = { ...bilan, demande: { regleId: props.regle.id } }
  incertain.value = bilan.statut === 'indetermine'; suiviIndisponible.value = false
  emit('partiel', suivi.value)
}
async function relireSuivi() {
  if (enCours.value) return
  const g = ++generation
  apercu.value = null; confirme.value = false; suiviAbsent.value = false; activite(true)
  try {
    const actuel = suivi.value ?? await window.sonal.corpus.suiviSuppressionAnon()
    if (!actuel) {
      if (vivant && g === generation) {
        suiviIndisponible.value = true; suiviAbsent.value = true; incertain.value = true; diagnostic.value = null
        erreur.value = 'Aucun suivi n’a été trouvé. Fermez cette fenêtre puis rouvrez le corpus pour vérifier son état avant toute nouvelle suppression.'
      }
      return
    }
    const bilan = await window.sonal.corpus.relireSuiviSuppressionAnon(actuel.operationId)
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
watch(() => [props.regle.id, props.disponible, props.contexte, props.fournisseur], () => { generation++; apercu.value = null; confirme.value = false })
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
  if (!controles.includes(document.activeElement as HTMLElement)) { e.preventDefault(); (e.shiftKey ? dernier : premier)?.focus(); return }
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
    <div ref="boite" class="dialogue" role="dialog" aria-modal="true" aria-labelledby="titre-suppression-anon" tabindex="-1" :aria-busy="enCours" @keydown="clavier">
      <header><h2 id="titre-suppression-anon">Supprimer une règle partout</h2><button :disabled="enCours" @click="fermer">Annuler</button></header>
      <p><strong>{{ regle.entite.join(' / ') }}</strong> — {{ regle.pseudos.join(' / ') }}</p>
      <p>La règle sera supprimée du corpus, ainsi que les pseudonymisations et les exceptions qui en dépendent dans les entretiens.</p>
      <p>Les autres règles, vos choix indépendants, les noms et pseudonymes enregistrés dans chaque entretien et les locuteurs sont conservés. Le texte d’origine n’est pas modifié. Certains passages peuvent rester pseudonymisés par un autre choix.</p>
      <p><strong>Cette suppression ne peut pas être annulée depuis le Journal.</strong></p>
      <p v-if="distant">Sur {{ nomFournisseur }}, les entretiens sont mis à jour l’un après l’autre. Si l’opération s’arrête, les suppressions déjà enregistrées sont conservées. Le suivi permet de vérifier l’avancement avant de continuer.</p>
      <section v-if="suivi" role="status">
        <h3>Lot {{ nomFournisseur }} de suppression à reprendre</h3>
        <p>{{ suivi.annotations }} choix retiré(s) dans {{ suivi.entretiens }} entretien(s). {{ suivi.regleRetiree ? 'La règle a été retirée ; il reste à actualiser votre copie du corpus.' : 'La suppression de la règle n’est pas encore terminée.' }}</p>
        <p v-if="suivi.statut === 'indetermine'">Le serveur n’a pas confirmé le résultat. Relisez le suivi avant de continuer.</p>
        <p v-if="suivi.miroirIncomplet && !suivi.regleRetiree">Des suppressions sont enregistrées ; il reste à actualiser votre copie du corpus avant de continuer.</p>
        <p v-if="suivi.differes.length">{{ suivi.differes.length }} entretien(s) restent à traiter. Les suppressions déjà enregistrées sont conservées.</p>
        <p v-if="suivi.nouvellesCibles.length">D’autres entretiens utilisent maintenant cette règle. Vérifiez le nouveau bilan et confirmez-le avant de continuer.</p>
        <details v-if="suivi.motif || suivi.differes.length || suivi.nouvellesCibles.length"><summary>Informations pour l’assistance</summary>
          <p v-if="suivi.motif">{{ suivi.motif }}</p>
          <ul><li v-for="c in suivi.differes" :key="c.id">{{ c.id }} : {{ c.motif }}</li></ul>
          <p v-if="suivi.nouvellesCibles.length">{{ suivi.nouvellesCibles.join(', ') }}</p>
        </details>
      </section>
      <button v-if="distant" :disabled="enCours" @click="relireSuivi">Relire le suivi {{ nomFournisseur }}</button>
      <p v-if="suiviIndisponible && !suiviAbsent" role="alert">L’avancement ne peut pas être vérifié pour le moment. Réessayez la lecture du suivi avant de continuer.</p>
      <p v-if="enCours" role="status">Veuillez patienter…</p>
      <button v-if="distant || (!apercu && !enCours)" :disabled="!disponible || enCours || incertain || suiviIndisponible || !!suivi?.regleRetiree || !!suivi?.miroirIncomplet" @click="preparer">{{ suivi ? 'Recalculer la reprise' : distant ? 'Préparer la suppression globale' : 'Actualiser le bilan' }}</button>
      <template v-if="apercu">
        <p><strong>{{ apercu.bilan.annotations }} passage(s) concerné(s) dans {{ apercu.bilan.entretiens }} entretien(s).</strong> Dont {{ apercu.bilan.exceptions }} exception(s), où vous aviez choisi de laisser le texte en clair.</p>
        <p v-if="apercu.bilan.inclusesRevelees">{{ apercu.bilan.inclusesRevelees }} choix indépendant(s), jusqu’ici masqué(s) par cette règle, redeviendront visibles et seront conservés.</p>
        <p v-if="!apercu.bilan.entretiens">Cette règle n’est utilisée dans aucun entretien. Elle sera simplement retirée du corpus.</p>
        <p v-if="apercu.ciblesRetirees?.length">{{ apercu.ciblesRetirees.length }} entretien(s) ne sont plus concernés. Ils ne seront pas modifiés.</p>
        <p v-if="!apercu.applicationDisponible" role="alert">{{ plafondEntretiens ? `Cette version ne permet pas de supprimer cette règle dans plus de ${plafondEntretiens} entretiens à la fois. Cette opération ne peut pas être confirmée.` : apercu.motifIndisponible ? 'Cette opération ne peut pas être effectuée pour le moment. Consultez les informations pour l’assistance avant de réessayer.' : 'Un entretien est encore ouvert en modification, ou une autre opération reste à terminer. Fermez cet entretien ou terminez cette opération, puis fermez et rouvrez cette fenêtre.' }}</p>
        <details v-if="apercu.motifIndisponible"><summary>Informations pour l’assistance</summary><p>{{ apercu.motifIndisponible }}</p></details>
        <ul v-if="apercu.obstacles.length"><li v-for="(o, i) in apercu.obstacles" :key="i">{{ apercu.entretiens.find((e) => e.id === o.entretienId)?.titre ?? o.entretienId }} : {{ motifs[o.code] }}.</li></ul>
        <details><summary>Voir les passages concernés</summary>
          <details v-for="e in apercu.entretiens.filter((e) => e.annotations)" :key="e.id"><summary>{{ e.titre }} — {{ e.annotations }} passage(s), {{ e.exceptions }} exception(s)</summary>
            <ul><li v-for="u in e.usages" :key="u.annotationId">{{ u.extrait }} : {{ u.etat === 'exception' ? 'laissé en clair' : 'pseudonymisé' }}<template v-if="u.pseudo"> → {{ u.pseudo }}</template><template v-if="u.incluse"> (à l’intérieur d’un autre passage)</template></li></ul>
            <ul><li v-for="u in e.decisionsRevelees" :key="u.annotationId">Choix conservé qui redevient visible : {{ u.extrait }} ; {{ u.etat === 'exception' ? 'laissé en clair' : 'pseudonymisé' }}<template v-if="u.pseudo"> → {{ u.pseudo }}</template>.</li></ul>
          </details>
        </details>
        <label><input v-model="confirme" type="checkbox" :disabled="enCours || !apercu.faisable || !apercu.applicationDisponible" /> Je souhaite supprimer cette règle et les choix qui en dépendent dans tous les entretiens concernés.</label>
        <button :disabled="enCours || !disponible || !apercu.faisable || !apercu.applicationDisponible || !confirme" @click="appliquer">Confirmer la suppression globale</button>
      </template>
      <p v-if="erreur" role="alert" class="erreur">{{ erreur }}</p>
      <details v-if="diagnostic"><summary>Informations pour l’assistance</summary><p>{{ diagnostic }}</p></details>
      <p v-if="!disponible">La suppression partout n’est pas disponible pour ce corpus.</p>
    </div>
  </div>
</template>
<style scoped>
.voile { position: fixed; inset: 0; z-index: 1100; background: #0006; display: flex; align-items: center; justify-content: center; padding: 1rem; }
.dialogue { background: white; width: 58rem; max-width: 100%; max-height: calc(100vh - 2rem); overflow: auto; padding: 1.2rem; border-radius: .4rem; }
header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; } h2 { margin: 0; font-size: 1.2rem; }
p, li { overflow-wrap: anywhere; } label { display: block; margin: 1rem 0; } button { padding: .45rem .7rem; } details { margin: .6rem 0; } .erreur { color: #b00020; }
</style>
