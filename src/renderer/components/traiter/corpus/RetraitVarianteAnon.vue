<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { ApercuRetraitVarianteAnon, BilanRetraitVarianteAnon, BilanRetraitVarianteDistant, DemandeRetraitVarianteAnon, SuiviRetraitVarianteAnon } from '../../../../shared/corpus/retraitVarianteAnon'
import type { MotifRefusSuppressionAnon } from '../../../../shared/corpus/suppressionAnon'
import { nettoyerMessage } from '../../../erreurs'
import { suspendreTirageAutomatique } from '../../../tirageAutomatique'

const props = defineProps<{ demande: DemandeRetraitVarianteAnon; disponible: boolean; contexte: number; fournisseur?: string | null; suivi?: SuiviRetraitVarianteAnon | null }>()
const emit = defineEmits<{ fermer: []; termine: [bilan: BilanRetraitVarianteAnon]; partiel: [suivi: SuiviRetraitVarianteAnon]; activite: [occupe: boolean] }>()
const demande = JSON.parse(JSON.stringify(props.demande)) as DemandeRetraitVarianteAnon
const apercu = ref<ApercuRetraitVarianteAnon | null>(null), confirme = ref(false), enCours = ref(false)
const erreur = ref<string | null>(null), diagnostic = ref<string | null>(null), incertain = ref(false), perime = ref(false)
const boite = ref<HTMLDivElement | null>(null)
const distant = computed(() => props.fournisseur === 'gitlab' || props.fournisseur === 'webdav')
const libelleFournisseur = props.fournisseur === 'webdav' ? 'WebDAV' : 'GitLab'
const suivi = ref<SuiviRetraitVarianteAnon | null>(props.suivi ?? null), suiviIndisponible = ref(false)
const contexteInitial = props.contexte, fournisseurInitial = props.fournisseur, demandeInitiale = JSON.stringify(props.demande)
const plafondEntretiens = computed(() => /limitée à (\d+) entretiens/.exec(apercu.value?.motifIndisponible ?? '')?.[1])
function origineValide() { return props.contexte === contexteInitial && props.fournisseur === fournisseurInitial && JSON.stringify(props.demande) === demandeInitiale }
incertain.value = suivi.value?.statut === 'indetermine'
let vivant = true, generation = 0, focusAvant: HTMLElement | null = null, reprendreTirage: (() => void) | null = null
const motifs: Record<MotifRefusSuppressionAnon, string> = {
  indisponible: 'Cet entretien ne peut pas être lu. Vérifiez qu’il est accessible.',
  'ancien-format': 'Ouvrez puis enregistrez cet entretien pour le mettre à jour.',
  'annotation-invalide': 'Un passage marqué doit être vérifié dans cet entretien.',
  'pseudo-divergent': 'Un pseudonyme doit être vérifié dans cet entretien.',
  'memoire-locale-recouvrante': 'Les noms et pseudonymes enregistrés dans cet entretien doivent être vérifiés.',
  'memoire-locale-invalide': 'Les noms et pseudonymes enregistrés dans cet entretien doivent être vérifiés.',
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
  if (!props.disponible || enCours.value || incertain.value || perime.value || suiviIndisponible.value || suivi.value?.varianteRetiree || suivi.value?.miroirIncomplet) return
  const g = ++generation
  apercu.value = null; confirme.value = false; erreur.value = null; diagnostic.value = null; activite(true)
  try {
    const a = suivi.value
      ? await window.sonal.corpus.apercuRepriseRetraitVarianteAnon(suivi.value.operationId)
      : await window.sonal.corpus.apercuRetraitVarianteAnon(JSON.parse(JSON.stringify(demande)))
    if (vivant && g === generation) apercu.value = a
  } catch (e) {
    if (vivant && g === generation) { erreur.value = 'Impossible de calculer le bilan. Réessayez ou rouvrez le corpus.'; diagnostic.value = nettoyerMessage(e) }
  } finally { if (vivant) activite(false) }
}
async function appliquer() {
  const a = apercu.value
  if (!a || !props.disponible || !a.applicationDisponible || !a.faisable || !confirme.value || enCours.value || incertain.value || perime.value) return
  const g = ++generation
  apercu.value = null; confirme.value = false; erreur.value = null; diagnostic.value = null; activite(true)
  try {
    const bilan = await window.sonal.corpus.retirerVarianteAnon(a.token, true)
    if (vivant && g === generation) {
      if ('statut' in bilan && bilan.statut !== 'termine') memoriserSuivi(bilan)
      else emit('termine', bilan)
    }
  } catch (e) {
    if (vivant && g === generation) {
      incertain.value = true
      erreur.value = distant.value
        ? `Le retrait n’a pas pu être terminé. Cliquez sur « Relire le suivi ${libelleFournisseur} » pour vérifier ce qui a été enregistré avant de continuer.`
        : 'Le retrait n’a pas pu être terminé. Fermez cette fenêtre puis rouvrez le corpus pour vérifier ce qui a été enregistré, avant tout nouveau retrait.'
      diagnostic.value = nettoyerMessage(e)
    }
  } finally { if (vivant) activite(false) }
}
function memoriserSuivi(bilan: BilanRetraitVarianteDistant) {
  suivi.value = { ...bilan, demande: JSON.parse(JSON.stringify(demande)) as DemandeRetraitVarianteAnon }
  incertain.value = bilan.statut === 'indetermine'; suiviIndisponible.value = false
  emit('partiel', suivi.value)
}
async function relireSuivi() {
  if (enCours.value || !distant.value || !origineValide()) return
  const g = ++generation
  apercu.value = null; confirme.value = false; erreur.value = null; diagnostic.value = null; activite(true)
  try {
    const actuel = suivi.value ?? await window.sonal.corpus.suiviRetraitVarianteAnon()
    if (!vivant || g !== generation) return
    if (!actuel || JSON.stringify(actuel.demande) !== JSON.stringify(demande)) {
      suiviIndisponible.value = true; incertain.value = true
      erreur.value = 'Aucun suivi correspondant n’a été trouvé. Fermez cette fenêtre puis rouvrez le corpus pour vérifier son état avant tout nouveau retrait.'
      return
    }
    const bilan = await window.sonal.corpus.relireSuiviRetraitVarianteAnon(actuel.operationId)
    if (!vivant || g !== generation) return
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
watch(() => [props.contexte, props.disponible, props.fournisseur, JSON.stringify(props.demande)], () => {
  generation++; apercu.value = null; confirme.value = false; perime.value = true
}, { flush: 'sync' })
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
onMounted(async () => { focusAvant = document.activeElement as HTMLElement; await nextTick(); if (vivant) { boite.value?.focus(); if (!distant.value) void preparer() } })
onUnmounted(() => { vivant = false; generation++; reprendreTirage?.(); reprendreTirage = null; emit('activite', false); if (focusAvant?.isConnected) focusAvant.focus() })
</script>
<template>
  <div class="voile" @click.self="fermer">
    <div ref="boite" class="dialogue" role="dialog" aria-modal="true" aria-labelledby="titre-retrait-variante" tabindex="-1" :aria-busy="enCours" @keydown="clavier">
      <header><h2 id="titre-retrait-variante">Retirer une variante</h2><button :disabled="enCours" @click="fermer">Annuler</button></header>
      <p><strong>{{ demande.regleAvant.entite.join(' / ') }}</strong> — retirer <strong>{{ demande.pseudoRetire }}</strong>, conserver <strong>{{ demande.pseudoConserve }}</strong>.</p>
      <p>Les choix liés utilisant {{ demande.pseudoRetire }} seront remplacés par {{ demande.pseudoConserve }}, y compris ceux masqués par un autre passage. La règle gardera uniquement {{ demande.pseudoConserve }}.</p>
      <p>Les passages laissés en clair restent en clair : seul leur pseudonyme mémorisé change. Le texte d’origine, vos choix indépendants, les noms et pseudonymes enregistrés dans chaque entretien et les locuteurs restent inchangés.</p>
      <p>Les passages à traiter ne sont pas modifiés. Ce retrait ne peut pas être annulé depuis le Journal.</p>
      <p v-if="distant">Sur {{ libelleFournisseur }}, les entretiens sont mis à jour l’un après l’autre. Si l’opération s’arrête, les remplacements déjà enregistrés sont conservés. Les deux variantes restent proposées jusqu’à la fin du retrait.</p>
      <section v-if="suivi" role="status">
        <h3>Retrait de variante {{ libelleFournisseur }} à reprendre</h3>
        <p>{{ suivi.annotations }} choix remplacé(s) dans {{ suivi.entretiens }} entretien(s). {{ suivi.varianteRetiree ? 'La variante est retirée ; il reste à actualiser votre copie du corpus.' : 'Le retrait de la variante n’est pas encore terminé.' }}</p>
        <p v-if="suivi.statut === 'indetermine'">Le serveur n’a pas confirmé le résultat. Relisez le suivi avant de continuer.</p>
        <p v-if="suivi.miroirIncomplet && !suivi.varianteRetiree">Des remplacements sont enregistrés ; il reste à actualiser votre copie du corpus avant de continuer.</p>
        <p v-if="suivi.differes.length">{{ suivi.differes.length }} entretien(s) restent à traiter. Les remplacements déjà enregistrés sont conservés.</p>
        <p v-if="suivi.nouvellesCibles.length">D’autres entretiens utilisent maintenant cette variante. Examinez le nouveau bilan et confirmez-le avant de continuer.</p>
        <details v-if="suivi.motif || suivi.differes.length || suivi.nouvellesCibles.length"><summary>Informations pour l’assistance</summary>
          <p v-if="suivi.motif">{{ suivi.motif }}</p>
          <ul><li v-for="c in suivi.differes" :key="c.id">{{ c.id }} : {{ c.motif }}</li></ul>
          <p v-if="suivi.nouvellesCibles.length">{{ suivi.nouvellesCibles.join(', ') }}</p>
        </details>
      </section>
      <button v-if="distant" :disabled="enCours || !origineValide()" @click="relireSuivi">Relire le suivi {{ libelleFournisseur }}</button>
      <p v-if="enCours" role="status">Veuillez patienter…</p>
      <button v-if="distant || (!apercu && !enCours)" :disabled="!disponible || enCours || incertain || perime || suiviIndisponible || !!suivi?.varianteRetiree || !!suivi?.miroirIncomplet" @click="preparer">{{ suivi ? 'Recalculer la reprise' : distant ? 'Préparer le retrait de variante' : 'Actualiser le bilan' }}</button>
      <template v-if="apercu">
        <p><strong>{{ apercu.bilan.annotations }} choix à remplacer dans {{ apercu.bilan.entretiens }} entretien(s).</strong> Dont {{ apercu.bilan.exceptions }} exception(s) et {{ apercu.bilan.incluses }} choix masqué(s).</p>
        <p v-if="!apercu.bilan.annotations">Aucun choix lié n’utilise cette variante. Elle sera seulement retirée de la règle.</p>
        <p v-if="apercu.ciblesRetirees?.length">{{ apercu.ciblesRetirees.length }} entretien(s) ne sont plus concernés. Ils ne seront pas modifiés.</p>
        <p v-if="!apercu.applicationDisponible" role="alert">{{ plafondEntretiens ? `Cette version ne permet pas de retirer cette variante dans plus de ${plafondEntretiens} entretiens à la fois. Cette opération ne peut pas être confirmée.` : apercu.motifIndisponible ? 'Cette opération ne peut pas être effectuée pour le moment. Consultez les informations pour l’assistance avant de réessayer.' : 'Un entretien est encore ouvert en modification, ou une autre opération reste à terminer. Fermez cet entretien ou terminez cette opération, puis fermez et rouvrez cette fenêtre.' }}</p>
        <details v-if="apercu.motifIndisponible"><summary>Informations pour l’assistance</summary><p>{{ apercu.motifIndisponible }}</p></details>
        <ul v-if="apercu.obstacles.length"><li v-for="(o, i) in apercu.obstacles" :key="i">{{ apercu.entretiens.find((e) => e.id === o.entretienId)?.titre ?? o.entretienId }} : {{ motifs[o.code] }}</li></ul>
        <details><summary>Voir les passages concernés</summary>
          <details v-for="e in apercu.entretiens.filter((e) => e.annotations)" :key="e.id"><summary>{{ e.titre }} — {{ e.annotations }} choix, {{ e.exceptions }} exception(s)</summary>
            <ul><li v-for="u in e.usages" :key="u.annotationId">{{ u.extrait }} : {{ u.pseudo }} → {{ demande.pseudoConserve }} ; {{ u.etat === 'exception' ? 'reste en clair' : 'pseudonymisé' }}<template v-if="u.incluse"> (masqué par un autre passage)</template>.</li></ul>
          </details>
        </details>
        <label><input v-model="confirme" type="checkbox" :disabled="enCours || !apercu.faisable || !apercu.applicationDisponible" /> Je retire {{ demande.pseudoRetire }} et remplace ses choix liés par {{ demande.pseudoConserve }}, y compris le pseudonyme mémorisé des exceptions.</label>
        <button :disabled="enCours || !disponible || !apercu.faisable || !apercu.applicationDisponible || !confirme" @click="appliquer">Remplacer les choix et retirer la variante</button>
      </template>
      <p v-if="perime" role="alert">La règle ou le corpus a changé. Fermez cette fenêtre puis examinez un nouveau bilan.</p>
      <p v-if="erreur" role="alert" class="erreur">{{ erreur }}</p>
      <details v-if="diagnostic"><summary>Informations pour l’assistance</summary><p>{{ diagnostic }}</p></details>
      <p v-if="!disponible">Le retrait de variante n’est pas disponible pour ce corpus.</p>
    </div>
  </div>
</template>
<style scoped>
.voile { position: fixed; inset: 0; z-index: 220; background: #0006; display: grid; place-items: center; }
.dialogue { box-sizing: border-box; width: min(740px, 94vw); max-height: 90dvh; overflow: auto; background: white; border-radius: 8px; padding: 1.2rem; }
header { display: flex; align-items: center; justify-content: space-between; gap: .8rem; }
h2 { margin: 0; font-size: 1.2rem; }
p, details, label { font-size: .9rem; }
label { display: flex; align-items: flex-start; gap: .5rem; margin: 1rem 0; }
button { padding: .4rem .7rem; cursor: pointer; }
button:disabled { cursor: not-allowed; }
.erreur { color: #a12020; }
</style>
