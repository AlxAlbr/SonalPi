<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { RegleAnon } from '../../../../shared/format'
import { nettoyerMessage } from '../../../erreurs'
import type { ApercuRenommageAnon, BilanRenommageAnon, MotifRefusRenommage, SuiviRenommageAnon } from '../../../../shared/corpus/renommageAnon'
const props = defineProps<{ regle: RegleAnon; ancienPseudo: string; nouveauPseudo?: string; disponible: boolean; fournisseur?: 'local' | 'gitlab' | 'webdav' }>()
const emit = defineEmits<{ fermer: []; termine: [bilan: BilanRenommageAnon]; activite: [occupe: boolean] }>()
const nouveau = ref(props.nouveauPseudo ?? props.ancienPseudo)
const apercu = ref<ApercuRenommageAnon | null>(null)
const confirme = ref(false)
const enCours = ref(false)
const suivi = ref<SuiviRenommageAnon | null>(null)
const suiviLu = ref(false)
const progression = ref<SuiviRenommageAnon | null>(null)
let minuterie: ReturnType<typeof setInterval> | undefined
let generationPublication = 0
const erreur = ref<string | null>(null)
const boite = ref<HTMLDivElement | null>(null)
let vivant = true
let focusAvant: HTMLElement | null = null
const motifs: Record<MotifRefusRenommage, string> = {
  indisponible: 'Source indisponible : inventaire incomplet.', 'ancien-format': 'Entretien à enregistrer au format actuel.',
  'annotation-invalide': 'Décision liée avec plage ou texte incohérent.', 'pseudo-divergent': 'Variante choisie absente de la définition actuelle.',
  'memoire-locale-recouvrante': 'Mémoire locale indépendante recouvrant les alias : résolution explicite nécessaire.',
  'annotations-ambigues': 'Identités ou recouvrements d’annotations ambigus.',
}
const fournisseur = computed(() => suivi.value?.fournisseur ?? apercu.value?.lecture ?? props.fournisseur ?? 'gitlab')
const nomFournisseur = computed(() => fournisseur.value === 'webdav' ? 'WebDAV' : fournisseur.value === 'gitlab' ? 'GitLab' : 'local')
const applicationPossible = computed(() => suiviLu.value && !enCours.value && props.disponible && apercu.value?.faisable && apercu.value.applicationDisponible && apercu.value.definitionModifiee && confirme.value)
function activite(valeur: boolean) { if (vivant) { enCours.value = valeur; emit('activite', valeur) } }
async function chargerSuivi() {
  if (enCours.value) return
  activite(true); erreur.value = null; suiviLu.value = false; apercu.value = null; confirme.value = false
  try {
    const resultat = await window.sonal.corpus.suiviRenommageAnon()
    if (vivant) { suivi.value = resultat; suiviLu.value = true; if (resultat) nouveau.value = resultat.demande.nouveauPseudo }
  } catch { if (vivant) erreur.value = 'Suivi indisponible. Relisez-le avant de préparer ou reprendre un renommage.' }
  finally { activite(false) }
}
async function analyser() {
  if (!suiviLu.value || enCours.value || !props.disponible || !nouveau.value.trim()) return
  if (!suivi.value && nouveau.value.includes('/')) {
    erreur.value = 'Pour ajouter une variante avec /, annulez ce bilan puis modifiez le champ Pseudonymes.'
    return
  }
  activite(true); erreur.value = null; apercu.value = null; confirme.value = false
  try {
    const resultat = suivi.value
      ? await window.sonal.corpus.apercuRepriseRenommageAnon(suivi.value.operationId)
      : await window.sonal.corpus.apercuRenommageAnon({ regleId: props.regle.id, ancienPseudo: props.ancienPseudo, nouveauPseudo: nouveau.value })
    if (vivant) apercu.value = resultat
  } catch (e) { if (vivant) erreur.value = e instanceof Error ? nettoyerMessage(e) : 'Inventaire impossible.' }
  finally { activite(false) }
}
async function appliquer() {
  if (!applicationPossible.value || !apercu.value) return
  const token = apercu.value.token
  activite(true); erreur.value = null; apercu.value = null; confirme.value = false
  let lectureEnCours = false
  const generation = ++generationPublication
  minuterie = setInterval(async () => {
    if (lectureEnCours || !vivant) return
    lectureEnCours = true
    try { const etat = await window.sonal.corpus.suiviRenommageAnon(); if (vivant && generation === generationPublication) progression.value = etat }
    catch { /* Le bilan de publication reste prioritaire sur le suivi d’attente. */ }
    finally { lectureEnCours = false }
  }, 1000)
  let incomplet = false
  try {
    const bilan = await window.sonal.corpus.renommerVarianteAnon(token, true)
    if (vivant) {
      if (bilan.statut && bilan.statut !== 'termine') { incomplet = true; erreur.value = bilan.motif ?? 'Le lot reste incomplet. Relisez le suivi et confirmez une reprise.' }
      else emit('termine', bilan)
    }
  } catch (e) { if (vivant) { incomplet = true; erreur.value = e instanceof Error ? nettoyerMessage(e) : 'Renommage refusé. Recalculez l’inventaire.' } }
  finally { generationPublication++; clearInterval(minuterie); progression.value = null; activite(false) }
  if (vivant && incomplet) {
    const motif = erreur.value
    await chargerSuivi()
    if (vivant && suiviLu.value) erreur.value = motif
  }
}
function clavier(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!enCours.value) emit('fermer'); return }
  if (e.key !== 'Tab') return
  const controles = [...(boite.value?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), input:not(:disabled)') ?? [])]
  const premier = controles[0], dernier = controles.at(-1)
  if (!premier) { e.preventDefault(); boite.value?.focus(); return }
  if (e.shiftKey && (document.activeElement === premier || document.activeElement === boite.value)) { e.preventDefault(); dernier?.focus() }
  else if (!e.shiftKey && (document.activeElement === dernier || document.activeElement === boite.value)) { e.preventDefault(); premier.focus() }
}
watch(nouveau, () => { apercu.value = null; confirme.value = false }, { flush: 'sync' })
watch(enCours, async (valeur) => { await nextTick(); if (vivant && valeur) boite.value?.focus() })
onMounted(() => { focusAvant = document.activeElement as HTMLElement; boite.value?.focus(); void chargerSuivi() })
onUnmounted(() => { vivant = false; clearInterval(minuterie); emit('activite', false); if (focusAvant?.isConnected) focusAvant.focus() })
</script>
<template>
  <div class="renommage-fond" role="dialog" aria-modal="true" aria-labelledby="renommage-titre" @keydown="clavier">
    <div ref="boite" class="renommage-boite" tabindex="-1" :aria-busy="enCours">
      <header><h3 id="renommage-titre">Renommer une variante corpus</h3><button :disabled="enCours" @click="emit('fermer')">Annuler</button></header>
      <p>{{ (apercu?.regle ?? regle).entite.join(' / ') }} — variante actuelle : <strong>{{ apercu?.demande.ancienPseudo ?? ancienPseudo }}</strong>.</p>
      <p>Seuls les usages textuels déjà pseudonymisés et liés à cette règle seront renommés, y compris les usages masqués. Aucune occurrence en attente n’est appliquée. Exceptions, autres variantes, décisions indépendantes et locuteurs restent intacts.</p>
      <section v-if="suivi" class="attention">
        <h4>Lot {{ nomFournisseur }} à reprendre</h4>
        <p>Règle {{ suivi.demande.regleId }} : {{ suivi.demande.ancienPseudo }} → {{ suivi.demande.nouveauPseudo }}. {{ suivi.bilan.annotations }} annotation(s) publiée(s) dans {{ suivi.bilan.entretiens }} entretien(s).</p>
        <p v-if="suivi.indeterminee && fournisseur === 'webdav'">Une publication reste indéterminée. Le recalcul cherche son image publiée sans rejouer le PUT. Relire l’original ne prouve pas un refus. Les verrous persistants ne sont jamais repris de force ; une intervention de leur détenteur peut être nécessaire.</p>
        <p v-else-if="suivi.indeterminee">Une publication reste indéterminée. Le recalcul réconcilie son intention sans rejouer le commit.</p>
        <ul><li v-for="c in suivi.cibles.filter(c => c.etat !== 'confirme')" :key="c.id">{{ c.id }} : {{ c.motif || 'restant à publier' }}</li></ul>
        <p v-if="suivi.bilan.nouvellesCibles?.length">Nouveaux usages à examiner et confirmer : {{ suivi.bilan.nouvellesCibles.join(', ') }}.</p>
        <p v-if="suivi.bilan.ciblesRetirees?.length">Cibles sans usage restant, retirées lors d’un nouveau consentement : {{ suivi.bilan.ciblesRetirees.join(', ') }}.</p>
        <p>Les succès sont acquis. Une reprise demande un nouvel inventaire et une nouvelle confirmation ; aucune source concurrente n’est écrasée.</p>
      </section>
      <button v-if="!suiviLu || suivi" :disabled="enCours" @click="chargerSuivi">Relire le suivi {{ nomFournisseur }}</button>
      <label>Nouveau pseudonyme<textarea v-model="nouveau" rows="2" :disabled="enCours || !disponible || !!suivi || !suiviLu" @keydown.enter.exact.prevent="analyser" /></label>
      <button :disabled="enCours || !nouveau.trim() || !disponible || !suiviLu" @click="analyser">{{ suivi ? 'Recalculer la reprise' : 'Préparer l’inventaire' }}</button>
      <template v-if="apercu">
        <p role="status">{{ apercu.renommages }} annotation(s) à renommer, dont {{ apercu.inclusesRenommees }} masquée(s), dans {{ apercu.entretiensModifies }} entretien(s). La définition conserve ses autres variantes.</p>
        <p v-if="!apercu.definitionModifiee">Aucune modification : le libellé est inchangé.</p>
        <p v-if="apercu.lecture === 'gitlab'">Cet inventaire lit un commit publié, jamais le miroir. Tous les entretiens sont lus, mais seuls ceux à modifier reçoivent des baux courts. Les autres entretiens peuvent rester ouverts et être publiés. La définition est publiée d’abord, puis les entretiens consentis ; le lot n’est pas atomique.</p>
        <p v-if="apercu.lecture === 'webdav'">Cet inventaire lit les fichiers publiés sur le serveur, jamais le miroir. Tous les entretiens sont lus ; chaque écriture tient brièvement le verrou corpus puis celui de sa seule cible. Les entretiens non ciblés peuvent rester ouverts. La définition est publiée d’abord, puis les entretiens consentis ; le lot n’est pas atomique et chaque PUT reste conditionnel.</p>
        <p v-if="!apercu.applicationDisponible" class="attention">Terminez la transaction en attente puis recalculez l’inventaire. En local, fermez les entretiens en édition.</p>
        <ul v-if="apercu.disponibilites?.length"><li v-for="d in apercu.disponibilites" :key="d.id">{{ d.id }} : {{ d.etat === 'session-locale' ? 'session locale ou ouverture en cours' : d.etat === 'tenu-autrui' ? 'tenu par un autre poste' : d.etat === 'inconnu' ? 'disponibilité inconnue' : 'observé libre' }}.</li></ul>
        <p v-if="apercu.lecture !== 'local'">Les droits observés ne réservent rien. Les cibles tenues ou changées seront différées, pas écrasées.</p>
        <p v-if="apercu.collisions.length" class="attention">Le nouveau pseudo est aussi déclaré par {{ apercu.collisions.length }} autre(s) règle(s). Ces identités restent indépendantes ; aucune fusion n’est effectuée.</p>
        <ul v-if="apercu.obstacles.length" role="alert"><li v-for="(o, n) in apercu.obstacles" :key="n">{{ o.entretienId }} {{ o.annotationId }} : {{ motifs[o.code] }}</li></ul>
        <div class="liste"><table><thead><tr><th>Entretien</th><th>À renommer / masquées</th><th>Préservés</th></tr></thead><tbody>
          <tr v-for="e in apercu.entretiens" :key="e.id"><td>{{ e.titre }} ({{ e.id }})<details v-if="e.usages.length"><summary>Décisions liées</summary><p v-for="u in e.usages" :key="u.annotationId">{{ u.annotationId }} · {{ u.from }}–{{ u.to }} · {{ u.extrait || 'Plage invalide' }} : {{ u.etat === 'exception' ? 'exception préservée' : u.renomme ? 'à renommer' : 'pseudonymisé préservé' }}<span v-if="u.etat !== 'exception' && u.pseudo"> · {{ u.pseudo }}{{ u.renomme ? ` → ${apercu.demande.nouveauPseudo}` : '' }}</span>{{ u.incluse ? ' · masquée' : '' }}</p></details></td><td>{{ e.renommages }} / {{ e.inclusesRenommees }}</td><td>{{ e.exceptions }} exception(s), {{ e.autresVariantes }} autre(s) variante(s), {{ e.independantes }} décision(s) indépendante(s), {{ e.attentes }} occurrence(s) en attente.</td></tr>
        </tbody></table></div>
        <label><input v-model="confirme" type="checkbox" :disabled="enCours || !apercu.faisable || !apercu.applicationDisponible || !apercu.definitionModifiee" /> Je confirme cette variante et ses seuls usages textuels liés, sans modifier les locuteurs.</label>
        <p v-if="apercu.lecture !== 'local'">Un journal privé conserve les étapes acquises et les cibles différées. Relisez le suivi et confirmez chaque reprise, sans rejouer le renommage. Si le miroir reste incomplet, rouvrez ce corpus pour relire le serveur.</p>
        <p v-else>Publication locale par journal durable, entretiens puis corpus. Une interruption conserve l’intention pour reprise à la réouverture ; aucune source concurrente n’est écrasée.</p>
        <button :disabled="!applicationPossible" @click="appliquer">Confirmer le renommage global</button>
      </template>
      <p v-if="enCours" role="status">{{ progression ? `${progression.bilan.entretiens} entretien(s) publié(s) ; ${progression.cibles.filter(c => c.etat !== 'confirme').length} restant(s).` : 'Préparation ou publication en cours…' }}</p><p v-if="erreur" role="alert" class="erreur">{{ erreur }}</p>
    </div>
  </div>
</template>
<style scoped>
.renommage-fond { position: fixed; inset: 0; z-index: 210; background: #0006; display: grid; place-items: center; }
.renommage-boite { box-sizing: border-box; width: min(980px, 94vw); max-height: 92dvh; overflow: auto; padding: 1.2rem; background: white; border-radius: 8px; }
header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
h3 { margin: 0; }
label { display: block; margin: .6rem 0; }
textarea { display: block; width: 100%; box-sizing: border-box; font: inherit; resize: vertical; }
button { font: inherit; padding: .4rem .6rem; }
.liste { max-height: 40dvh; overflow: auto; margin: .7rem 0; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
td, th { border: 1px solid #ddd; padding: .5rem; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
.attention { background: #fff3df; border-left: 3px solid #ad6800; padding: .5rem; }
.erreur { color: #a12020; }
</style>
