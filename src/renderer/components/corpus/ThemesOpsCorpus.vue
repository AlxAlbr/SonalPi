<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import { useOperationsThemesCorpus } from '../../composables/corpus/useOperationsThemesCorpus'
import type { DemandeOperationTheme } from '../../../shared/corpus/themes'
import { operationGlobaleEnCours } from '../../operationGlobaleCorpus'
import RepartitionTheme from './RepartitionTheme.vue'

const props = defineProps<{ actif: boolean }>()
const {
  codebook, arbreThemes, gesteDisponible, lectureSeule, majCodebook, rafraichirUsages,
  vue, revisionCorpus, ouvrirEntretien, membership,
} = utiliserSonal()
type TypeOperation = DemandeOperationTheme['type']
const titres: Record<TypeOperation, string> = {
  transfert: 'Transférer une thématique', fusion: 'Fusionner deux thématiques', division: 'Diviser une thématique',
}
const types: TypeOperation[] = ['transfert', 'fusion', 'division']
const typeChoisi = ref<TypeOperation | null>(null)
const source = ref('')
const secondeFusion = ref('')
const cible = ref('')
const cibleNouvelle = ref(false)
const nomNouvelle = ref('')
const parentNouvelle = ref('')
const couleurNouvelle = ref('#598ac8')
const conserverSource = ref(true)
const nombreDestinations = ref(2)
const destinationsDivision = ref(['', '', '', ''])
const effacerSource = ref(false)
const dialogue = ref<HTMLElement | null>(null)
const atelier = ref<HTMLElement | null>(null)
let focusAvant: HTMLElement | null = null

function disponible(demande: DemandeOperationTheme): boolean {
  if (demande.type === 'transfert') return gesteDisponible('transfertThemes')
    && (demande.conserverSource || gesteDisponible('suppressionSourceThemes'))
  if (demande.type === 'fusion') return gesteDisponible('fusionThemes')
  return gesteDisponible('divisionThemes') && (!demande.effacerSource || gesteDisponible('suppressionSourceThemes'))
}
const ops = useOperationsThemesCorpus({ disponible, majCodebook, rafraichirUsages })
const {
  demande, apercu, details, etape, analyseEnCours, executionEnCours, detailsEnCours, perime,
  erreur, resultat, progression, occupe, choixParCodage, nonRepartis, peutExecuter,
  suivi, erreurSuivi, chargementSuivi, peutVerifier,
} = ops
const categories = computed(() => arbreThemes().map((n) => ({ ...n.cat, libelle: '— '.repeat(n.profondeur) + n.cat.nom })))
const ciblesTransfert = computed(() => categories.value.filter((c) => c.id !== source.value))
const secondesFusion = computed(() => categories.value.filter((c) => c.id !== source.value))
function estDescendantDe(id: string, ancetre: string): boolean {
  const visites = new Set<string>()
  let courant: string | null = id
  while (courant !== null && !visites.has(courant)) {
    if (courant === ancetre) return true
    visites.add(courant)
    courant = codebook.value.find((c) => c.id === courant)?.parent ?? null
  }
  return false
}
const ciblesFusion = computed(() => {
  if (!source.value || !secondeFusion.value) return []
  return categories.value.filter((c) => [source.value, secondeFusion.value]
    .filter((id) => id !== c.id).every((retiree) => !estDescendantDe(c.id, retiree)))
})
function ciblesDivision(index: number) {
  const dejaChoisies = new Set(destinationsDivision.value.slice(0, nombreDestinations.value)
    .filter((id, i) => i !== index && !!id))
  return categories.value.filter((c) => c.id !== source.value && !dejaChoisies.has(c.id))
}
const titre = computed(() => typeChoisi.value ? titres[typeChoisi.value] : '')
const verificationAutorisee = computed(() => {
  const d = suivi.value?.demande ?? demande.value
  return !!d && disponible(d)
})
const bilan = computed(() => resultat.value?.statut === 'partielle' ? resultat.value.bilan
  : resultat.value?.statut === 'indeterminee' ? resultat.value.bilan : undefined)
const nomSource = computed(() => {
  const d = demande.value
  if (d?.type === 'fusion') return d.sources.map((id) => codebook.value.find((c) => c.id === id)?.nom ?? id).join(' + ')
  const id = d?.source ?? source.value
  return codebook.value.find((c) => c.id === id)?.nom ?? id
})
const suppression = computed(() => demande.value?.type === 'fusion'
  || (demande.value?.type === 'transfert' && !demande.value.conserverSource)
  || (demande.value?.type === 'division' && demande.value.effacerSource))
const disponibilitesGitLab = computed(() => apercu.value?.disponibiliteGitLab?.entretiens ?? [])
const libresGitLab = computed(() => disponibilitesGitLab.value.filter((e) => e.etat === 'libre-observe').length)
const obstaclesGitLab = computed(() => disponibilitesGitLab.value.length - libresGitLab.value)
const vers = computed(() => {
  const d = demande.value
  if (!d) return ''
  if (d.type === 'division') return destinationsRepartition.value.map((c) => c.nom).join(', ')
  const id = d.type === 'fusion' ? d.cible : d.cible.type === 'existante' ? d.cible.id : null
  return id ? codebook.value.find((c) => c.id === id)?.nom ?? id : d.type === 'transfert' && d.cible.type === 'nouvelle' ? d.cible.nom : ''
})

const destinationsRepartition = computed(() => demande.value?.type === 'division' ? demande.value.cibles.map((c) => {
  if (typeof c === 'string') return { id: c, nom: codebook.value.find((cat) => cat.id === c)?.nom ?? c }
  const id = suivi.value?.bilan.ciblesCreees.find((persistante) => persistante.token === c.token)?.id ?? c.token
  return { id, nom: codebook.value.find((cat) => cat.id === id)?.nom ?? c.nom }
}) : [])

function motif(type: TypeOperation): string | null {
  if (chargementSuivi.value) return 'Vérification du suivi précédent…'
  if (erreurSuivi.value) return 'Vérifiez le suivi précédent avant une nouvelle opération.'
  if (suivi.value) return 'Reprenez ou clôturez le suivi du lot précédent.'
  if (resultat.value?.statut === 'indeterminee') return 'Rouvrez le corpus pour vérifier ou reprendre l’opération précédente.'
  if (operationGlobaleEnCours.value) return 'Une opération de corpus est en cours.'
  const capacite = type === 'transfert' ? 'transfertThemes' : type === 'fusion' ? 'fusionThemes' : 'divisionThemes'
  if (!gesteDisponible(capacite)) return lectureSeule.value ? 'Ce corpus est actuellement en lecture seule ou hors ligne.' : 'Ce parcours n’est pas encore disponible sur ce corpus.'
  if (!codebook.value.length) return 'Créez d’abord une thématique avec le crayon.'
  if (type === 'fusion' && codebook.value.length < 2) return 'Une fusion demande deux thématiques existantes.'
  if (type === 'division' && codebook.value.length < 3) return 'Une division demande une source et deux destinations existantes.'
  return null
}
async function ouvrir(type: TypeOperation): Promise<void> {
  if (motif(type)) return
  focusAvant = document.activeElement as HTMLElement | null
  ops.reinitialiser()
  typeChoisi.value = type
  source.value = ''
  secondeFusion.value = ''
  cible.value = ''
  cibleNouvelle.value = false
  nomNouvelle.value = ''
  parentNouvelle.value = ''
  conserverSource.value = true
  nombreDestinations.value = 2
  destinationsDivision.value = ['', '', '', '']
  effacerSource.value = false
  await nextTick()
  dialogue.value?.querySelector<HTMLElement>('select')?.focus()
}
function fermer(): void {
  if (occupe.value) return
  if (demande.value?.type === 'division' && demande.value.choix.length && etape.value !== 'bilan'
    && !window.confirm('Abandonner cette répartition ? Aucun choix n’a été enregistré.')) return
  typeChoisi.value = null
  // Un résultat inconnu reste visible et bloque un nouveau lancement jusqu'à réouverture.
  if (resultat.value?.statut !== 'indeterminee') ops.reinitialiser()
  restaurerFocus()
}
function restaurerFocus(): void {
  void nextTick(() => {
    if (focusAvant?.isConnected) focusAvant.focus()
    else atelier.value?.querySelector<HTMLElement>('button:not(:disabled)')?.focus()
  })
}
function requete(): DemandeOperationTheme {
  if (typeChoisi.value === 'fusion') return {
    type: 'fusion', sources: [source.value, secondeFusion.value], cible: cible.value,
  }
  if (typeChoisi.value === 'transfert') return {
    type: 'transfert', source: source.value, conserverSource: conserverSource.value,
    cible: cibleNouvelle.value ? {
      type: 'nouvelle', token: 'destination', nom: nomNouvelle.value.trim(),
      parent: parentNouvelle.value || null, couleur: couleurNouvelle.value,
    } : { type: 'existante', id: cible.value },
  }
  return {
    type: 'division', source: source.value,
    cibles: destinationsDivision.value.slice(0, nombreDestinations.value),
    choix: [], effacerSource: effacerSource.value,
  }
}
async function preparer(): Promise<void> { await ops.commencer(requete()) }
async function reprendre(): Promise<void> {
  const type = suivi.value?.demande.type
  if (!type) return
  focusAvant = document.activeElement as HTMLElement | null
  if (await ops.preparerReprise()) { typeChoisi.value = type; await nextTick(); dialogue.value?.focus() }
}
async function verifierPublication(): Promise<void> {
  const type = suivi.value?.demande.type ?? demande.value?.type
  if (!type) return
  focusAvant = document.activeElement as HTMLElement | null
  typeChoisi.value = type
  await ops.reconcilier()
  await nextTick()
  dialogue.value?.focus()
}
async function cloreSuivi(): Promise<void> {
  if (!window.confirm('Clôturer le suivi sans reprendre ? Les réaffectations réussies et les catégories créées resteront en place.')) return
  if (await ops.abandonnerSuivi()) { typeChoisi.value = null; restaurerFocus() }
}
async function consulter(id: string): Promise<void> {
  if (occupe.value) return
  ops.invalider()
  try { await ouvrirEntretien(id) } catch (e) { erreur.value = e instanceof Error ? e.message : String(e) }
}
function clavierDialogue(event: KeyboardEvent): void {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); fermer() }
  if (event.key !== 'Tab' || !dialogue.value) return
  const elements = [...dialogue.value.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')]
    .filter((element) => element.offsetParent !== null)
  const premier = elements[0]
  const dernier = elements.at(-1)
  if (!premier) { event.preventDefault(); return }
  if (!elements.includes(document.activeElement as HTMLElement)) {
    event.preventDefault()
    const suivant = event.shiftKey ? dernier : premier
    suivant?.focus()
    return
  }
  if (event.shiftKey && document.activeElement === premier) { event.preventDefault(); dernier?.focus() }
  else if (!event.shiftKey && document.activeElement === dernier) { event.preventDefault(); premier?.focus() }
}
watch(source, () => {
  secondeFusion.value = ''
  cible.value = ''
  destinationsDivision.value = ['', '', '', '']
})
watch(secondeFusion, () => { cible.value = '' })
watch(revisionCorpus, () => {
  typeChoisi.value = null
  ops.changerCorpus()
  if (gesteDisponible('transfertThemes')) void ops.chargerSuivi()
}, { flush: 'sync' })
watch(() => gesteDisponible('transfertThemes'), (disponible) => {
  if (disponible) void ops.chargerSuivi()
}, { immediate: true })
watch(codebook, () => ops.invalider(), { flush: 'sync' })
watch(vue, (v) => { if (v !== 'corpus') ops.invalider() })
watch([etape, () => props.actif, vue], async () => {
  await nextTick()
  if (typeChoisi.value && props.actif && vue.value === 'corpus') dialogue.value?.focus()
})
</script>

<template>
  <section ref="atelier" class="themes-ops-corpus" aria-label="Opérations sur les thématiques">
    <h3>Atelier des thématiques</h3>
    <p class="intro">Réorganisez les codages du corpus. Les transcriptions, commentaires et pseudonymisations restent inchangés.</p>
    <div v-if="!typeChoisi && (suivi || erreurSuivi || peutVerifier)" class="alerte" role="status">
      <p v-if="suivi">Un lot précédent {{ suivi.indeterminee ? 'a une publication à vérifier' : 'reste incomplet' }}. {{ suivi.bilan.reussis.length }} entretien(s) réussi(s), {{ suivi.bilan.echecs.length + (suivi.bilan.differes?.length ?? 0) + (suivi.bilan.inconnus?.length ?? 0) }} entretien(s) à vérifier ou reprendre. {{ suivi.demande.type === 'fusion' ? 'Les thématiques à retirer sont conservées.' : 'La source est conservée.' }}</p>
      <p v-if="erreurSuivi">{{ erreurSuivi }}</p>
      <button v-if="erreurSuivi" :disabled="occupe || chargementSuivi" @click="ops.chargerSuivi">Réessayer la lecture du suivi</button>
      <button v-if="peutVerifier" :disabled="occupe || chargementSuivi || !verificationAutorisee" @click="verifierPublication">Vérifier la publication</button>
      <template v-if="suivi && !suivi.indeterminee">
        <button :disabled="occupe || chargementSuivi || !!erreurSuivi || !disponible(suivi.demande)" @click="reprendre">Recalculer et reprendre</button>
        <button :disabled="occupe || chargementSuivi || !!erreurSuivi || !disponible(suivi.demande)" @click="cloreSuivi">Clôturer le suivi sans reprendre</button>
      </template>
    </div>
    <div class="cartes-operations">
      <article v-for="type in types" :key="type" class="carte-operation" :class="type">
        <h4>{{ titres[type] }}</h4>
        <p v-if="type === 'transfert'">Déplacer tous les codages vers une autre thématique.</p>
        <p v-else-if="type === 'fusion'">Réunir deux thématiques dans l’une d’elles ou dans une troisième thématique existante.</p>
        <p v-else>Répartir manuellement les codages vers deux à quatre thématiques existantes.</p>
        <p v-if="motif(type)" class="indisponible">{{ motif(type) }}</p>
        <button :disabled="!!motif(type)" :title="motif(type) ?? undefined" @click="ouvrir(type)">{{ type === 'transfert' ? 'Transférer…' : type === 'fusion' ? 'Fusionner…' : 'Diviser…' }}</button>
      </article>
    </div>
    <p class="note">Un aperçu précède toute écriture. Ces opérations ne peuvent pas être annulées depuis le Journal du corpus.</p>
    <p v-if="!typeChoisi && resultat?.statut === 'indeterminee'" class="alerte" role="alert">{{ resultat.motif }} {{ peutVerifier ? 'Vérifiez la publication avant toute reprise.' : 'Rouvrez ce corpus avant un nouveau lancement.' }}</p>

    <div v-if="typeChoisi && actif && vue === 'corpus'" class="voile" @click.self="fermer">
      <section ref="dialogue" class="modale-operations-themes" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="titre-operation-theme" @keydown="clavierDialogue">
        <header><h3 id="titre-operation-theme">{{ titre }}</h3><button aria-label="Fermer l’opération" :disabled="occupe" @click="fermer">✕</button></header>
        <p v-if="erreur" class="alerte" role="alert">{{ erreur }}</p>
        <p v-if="erreurSuivi" class="alerte" role="alert">{{ erreurSuivi }} <button :disabled="occupe" @click="ops.chargerSuivi">Réessayer la lecture du suivi</button></p>
        <div v-if="executionEnCours" class="attente" role="status" aria-live="polite">
          <span class="roue" aria-hidden="true"></span>
          {{ suivi?.indeterminee ? 'Vérification de la publication…' : 'Modification en cours…' }}
          <span v-if="progression">{{ progression.termines }} / {{ progression.total }} entretien(s) terminé(s).</span>
          <span>Aucune interruption pendant l’écriture.</span>
        </div>

        <form v-if="etape === 'choix'" @submit.prevent="preparer">
          <fieldset :disabled="occupe || !!suivi">
            <template v-if="typeChoisi === 'fusion'">
              <label>Première thématique
                <select v-model="source" required><option value="">Choisir une thématique…</option><option v-for="c in categories" :key="c.id" :value="c.id">{{ c.libelle }}</option></select>
              </label>
              <label>Deuxième thématique
                <select v-model="secondeFusion" required><option value="">Choisir une autre thématique…</option><option v-for="c in secondesFusion" :key="c.id" :value="c.id">{{ c.libelle }}</option></select>
              </label>
              <label>Thématique résultante
                <select v-model="cible" required><option value="">Choisir la thématique résultante…</option><option v-for="c in ciblesFusion" :key="c.id" :value="c.id">{{ c.libelle }}</option></select>
              </label>
              <p class="note">La thématique résultante doit déjà exister. Elle peut être l’une des deux thématiques choisies ou une troisième thématique.</p>
              <p class="note">Une thématique située sous une catégorie retirée n’est pas proposée, pour éviter un cycle.</p>
            </template>
            <template v-else>
              <label>Thématique source
                <select v-model="source" required><option value="">Choisir une thématique…</option><option v-for="c in categories" :key="c.id" :value="c.id">{{ c.libelle }}</option></select>
              </label>
              <template v-if="typeChoisi === 'transfert'">
                <label class="case"><input v-model="cibleNouvelle" type="checkbox" />Créer une nouvelle thématique cible</label>
                <template v-if="cibleNouvelle">
                  <label>Nom de la nouvelle thématique<input v-model="nomNouvelle" required placeholder="Nom de la cible" /></label>
                  <label>Couleur<input v-model="couleurNouvelle" type="color" /></label>
                  <label>Parent de la nouvelle thématique<select v-model="parentNouvelle"><option value="">Racine du codebook</option><option v-for="c in categories" :key="c.id" :value="c.id">{{ c.libelle }}</option></select></label>
                </template>
                <label v-else>Thématique cible<select v-model="cible" required><option value="">Choisir une thématique…</option><option v-for="c in ciblesTransfert" :key="c.id" :value="c.id">{{ c.libelle }}</option></select></label>
                <label class="case"><input v-model="conserverSource" type="checkbox" :disabled="!gesteDisponible('suppressionSourceThemes')" />Conserver la thématique source</label>
                <p v-if="!gesteDisponible('suppressionSourceThemes')" class="note">La suppression de la source n’est pas disponible sur ce corpus.</p>
              </template>
              <template v-else>
                <label>Nombre de destinations<select v-model.number="nombreDestinations"><option v-for="n in [2, 3, 4]" :key="n" :value="n">{{ n }}</option></select></label>
                <div class="destinations-division">
                  <label v-for="n in nombreDestinations" :key="n">Destination {{ n }}
                    <select v-model="destinationsDivision[n - 1]" required>
                      <option value="">Choisir une thématique existante…</option>
                      <option v-for="c in ciblesDivision(n - 1)" :key="c.id" :value="c.id">{{ c.libelle }}</option>
                    </select>
                  </label>
                </div>
                <p class="note">Créez au préalable les thématiques nécessaires avec le crayon du codebook.</p>
                <label v-if="gesteDisponible('suppressionSourceThemes')" class="case"><input v-model="effacerSource" type="checkbox" />Supprimer la source après répartition complète</label>
                <p v-if="effacerSource" class="note">Les sous-thèmes de la source seront replacés sous son ancien parent.</p>
              </template>
            </template>
          </fieldset>
          <footer><button type="button" :disabled="occupe" @click="fermer">Annuler</button><button class="principal" type="submit" :disabled="occupe || !!suivi">{{ analyseEnCours ? 'Analyse…' : typeChoisi === 'division' ? 'Préparer la répartition' : 'Voir l’aperçu' }}</button></footer>
        </form>

        <template v-else-if="etape === 'repartition' && demande?.type === 'division' && apercu">
          <p><b>{{ nonRepartis }}</b> codage(s) sans destination sur {{ apercu.totaux.passages }}. {{ demande.effacerSource ? 'Tous les codages doivent être répartis, orphelins compris.' : 'Les codages sans destination resteront sur la source.' }}</p>
          <p v-if="apercu.execution === 'entretiens-sequentiels'" class="note">Les compteurs portent uniquement sur les codages observés. Les membres indisponibles seront nommés dans l’aperçu ; ils ne seront pas modifiés.</p>
          <p v-if="perime" class="alerte">L’aperçu doit être recalculé avant de continuer. Les choix ne seront conservés que si les fichiers sont toujours valides.</p>
          <RepartitionTheme :apercu="apercu" :destinations="destinationsRepartition" :details="details" :choix="choixParCodage" :chargements="detailsEnCours" :disabled="occupe || perime"
            @charger="ops.chargerDetails" @attribuer="ops.attribuer" @tout-attribuer="ops.toutAttribuer" @consulter="consulter" />
          <footer>
            <button :disabled="occupe || !!suivi" @click="ops.reinitialiser">Modifier les destinations</button>
            <button v-if="perime" :disabled="occupe" @click="ops.analyser">Recalculer avec les choix</button>
            <button v-if="perime" :disabled="occupe" @click="ops.repartirEtatActuel">Repartir de l’état actuel</button>
            <button class="principal" :disabled="occupe || perime || (demande.effacerSource && nonRepartis > 0)" @click="ops.confirmerRepartition">Voir l’aperçu final</button>
          </footer>
        </template>

        <template v-else-if="etape === 'apercu' && apercu && demande">
          <p><b>{{ nomSource }}</b> → <b>{{ vers }}</b></p>
          <dl class="compteurs"><div><dt>Codages observés</dt><dd>{{ apercu.totaux.passages }}</dd></div><div><dt>Entretiens concernés</dt><dd>{{ apercu.totaux.entretiens }}</dd></div><div><dt>Orphelins</dt><dd>{{ apercu.totaux.orphelins }}</dd></div><div><dt>Doublons prévisibles</dt><dd>{{ apercu.totaux.doublonsPrevisibles }}</dd></div></dl>
          <p>{{ apercu.parEntretien.filter((e) => e.aModifier).length }} entretien(s) prévus pour modification.</p>
          <p v-if="apercu.execution === 'entretiens-sequentiels' && apercu.obstacles.length" class="note">Les membres indisponibles ne sont pas comptés dans les codages observés et ne seront pas modifiés.</p>
          <p v-if="demande.type === 'fusion'">{{ apercu.totaux.sousThemesDeplaces ?? 0 }} sous-thème(s) direct(s) seront déplacés vers la cible.</p>
          <p v-if="demande.type === 'division'">{{ nonRepartis }} codage(s) resteront sur la source.</p>
          <p class="consequence">{{ suppression ? (demande.type === 'fusion' ? 'Les thématiques qui ne sont pas retenues comme résultat seront retirées après les réaffectations.' : 'La source sera retirée après les réaffectations.') : 'La source et sa hiérarchie seront conservées.' }} Les doublons sur une plage exacte seront retirés ; les codages cibles existants seront conservés.</p>
          <ul v-if="apercu.obstacles.length" class="alerte"><li v-for="(obstacle, i) in apercu.obstacles" :key="i">{{ obstacle.entretienId ? (membership[obstacle.entretienId]?.titre ?? obstacle.entretienId) + ' : ' : '' }}{{ obstacle.motif }}</li></ul>
          <p v-if="perime" class="alerte">Cet aperçu n’est plus confirmé. Recalculez-le avant toute écriture.</p>
          <template v-if="apercu.disponibiliteGitLab">
            <p class="note">Disponibilité observée le {{ new Date(apercu.disponibiliteGitLab.observeLe).toLocaleString('fr-FR') }} : {{ libresGitLab }} libre(s), {{ obstaclesGitLab }} indisponible(s) ou inconnu(s). Cette observation ne réserve aucun entretien.</p>
            <ul v-if="obstaclesGitLab" class="alerte"><li v-for="e in disponibilitesGitLab.filter((item) => item.etat !== 'libre-observe')" :key="e.id">{{ membership[e.id]?.titre ?? e.id }} : {{ e.motif ?? e.etat }}<span v-if="e.detenteur"> ({{ e.detenteur }})</span></li></ul>
          </template>
          <p v-if="apercu.execution === 'entretiens-sequentiels'" class="note">Les entretiens seront traités un par un, sans atomicité globale. Les succès restent acquis si un autre entretien est refusé. <template v-if="suppression">Les thématiques à retirer ne seront supprimées qu’après la finalisation protégée de tout le corpus.</template><template v-else>La source est conservée.</template> Une réponse inconnue arrête le lot ; vérifiez sa publication avant de reprendre explicitement.</p>
          <p v-else class="note">Cette confirmation lance la modification. Les fichiers seront relus ; toute modification depuis l’aperçu refusera l’opération locale. Une transaction interrompue sera reprise à l’ouverture du corpus.</p>
          <footer>
            <button :disabled="occupe || (!!suivi && demande.type !== 'division')" @click="demande.type === 'division' ? ops.revenirRepartition() : ops.reinitialiser()">Modifier les choix</button>
            <button :disabled="occupe" @click="ops.analyser">Attendre et actualiser</button>
            <button v-if="perime" :disabled="occupe" @click="ops.repartirEtatActuel">Repartir de l’état actuel</button>
            <button v-if="obstaclesGitLab > 0" class="principal" :disabled="!peutExecuter || libresGitLab === 0" @click="ops.executer('observes-libres')">Traiter les entretiens observés libres</button>
            <button class="principal" :disabled="!peutExecuter" @click="ops.executer('tous-prevus')">{{ obstaclesGitLab > 0 ? 'Tenter tous les entretiens prévus' : 'Confirmer et appliquer' }}</button>
          </footer>
        </template>

        <div v-else-if="etape === 'bilan' && resultat" class="bilan-operation" aria-live="polite">
          <template v-if="resultat.statut === 'appliquee'"><h4>Opération appliquée</h4><p>{{ resultat.entretiens }} entretien(s) modifié(s), {{ resultat.reaffectes }} codage(s) réaffecté(s), {{ resultat.doublonsSupprimes }} doublon(s) retiré(s).</p></template>
          <template v-else-if="resultat.statut === 'non-appliquee'"><h4>Opération non appliquée</h4><p>{{ resultat.motif }}</p><button :disabled="occupe" @click="ops.repartirEtatActuel">Recalculer depuis l’état actuel</button></template>
          <template v-else-if="resultat.statut === 'indeterminee'"><h4>Résultat à vérifier</h4><p>{{ resultat.motif }}</p><p>Aucune écriture ne sera rejouée automatiquement. {{ peutVerifier ? 'Vérifiez la publication, puis recalculez une reprise explicite.' : 'Rouvrez ce corpus pour vérifier ou reprendre son état.' }}</p></template>
          <h4 v-else>Opération partielle — les succès restent acquis</h4>
          <template v-if="bilan">
            <p>Retrait demandé : {{ bilan.sourceConservee === null ? 'état inconnu' : bilan.sourceConservee ? 'en attente' : 'terminé' }}. Finalisation : {{ bilan.finalisation }}.</p>
            <p v-if="bilan.motifFinalisation">{{ bilan.motifFinalisation }}</p>
            <h5>Entretiens réussis</h5><ul><li v-for="e in bilan.reussis" :key="e.id">{{ membership[e.id]?.titre ?? e.id }} : {{ e.reaffectes }} réaffectation(s), {{ e.doublonsSupprimes }} doublon(s) retiré(s).</li></ul>
            <h5>Entretiens à reprendre</h5><ul><li v-for="e in bilan.echecs" :key="e.id">{{ membership[e.id]?.titre ?? e.id }} : {{ e.motif }}</li></ul>
            <template v-if="bilan.inconnus?.length"><h5>Publications inconnues — à vérifier</h5><ul><li v-for="e in bilan.inconnus" :key="e.id">{{ membership[e.id]?.titre ?? e.id }} : {{ e.motif }}</li></ul></template>
            <template v-if="bilan.differes?.length"><h5>Entretiens non traités</h5><ul><li v-for="e in bilan.differes" :key="e.id">{{ membership[e.id]?.titre ?? e.id }} : {{ e.motif }}</li></ul></template>
            <p v-if="bilan.ciblesCreees.length">Catégories créées : {{ bilan.ciblesCreees.map((c) => codebook.find((cat) => cat.id === c.id)?.nom ?? c.id).join(', ') }}.</p>
          </template>
          <footer>
            <button v-if="peutVerifier" :disabled="occupe || chargementSuivi || !verificationAutorisee" @click="verifierPublication">Vérifier la publication</button>
            <template v-if="suivi && !suivi.indeterminee">
              <button :disabled="occupe || chargementSuivi || !!erreurSuivi || !disponible(suivi.demande)" @click="reprendre">Recalculer et reprendre</button>
              <button :disabled="occupe || chargementSuivi || !!erreurSuivi || !disponible(suivi.demande)" @click="cloreSuivi">Clôturer le suivi sans reprendre</button>
            </template>
            <button :disabled="occupe" @click="fermer">Fermer le bilan</button>
          </footer>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.themes-ops-corpus { min-width: 0; }
h3 { margin: 0 0 .6rem; font-size: 1rem; }
.intro, .note { font-size: .82rem; color: #687184; line-height: 1.5; }
.cartes-operations { display: grid; gap: .8rem; }
.carte-operation { padding: 1rem; border: 1px solid #dce4ee; border-left: 4px solid #6b96cc; border-radius: 9px; background: #f5f8fc; }
.carte-operation.fusion { border-left-color: #aa83ba; background: #faf6fc; }
.carte-operation.division { border-left-color: #74a687; background: #f4faf6; }
h4 { margin: 0 0 .6rem; font-size: .95rem; }
.carte-operation p { font-size: .85rem; line-height: 1.5; }
.indisponible { color: #815a21; }
button { font: inherit; font-size: .82rem; border: 1px solid #b9c7d8; border-radius: 6px; background: white; padding: .45rem .8rem; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
.principal { color: white; background: #356ac3; border-color: #356ac3; }
.voile { position: fixed; inset: 0; background: #101d354f; z-index: 150; display: flex; justify-content: center; align-items: center; padding: 1rem; }
.modale-operations-themes { width: min(950px, 100%); max-height: 88vh; overflow-y: auto; background: white; border-radius: 12px; padding: 1.2rem; box-shadow: 0 12px 50px #182a4952; }
header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
header h3 { margin: 0; }
fieldset { border: 0; padding: 0; margin: 0; }
label { display: flex; flex-direction: column; gap: .35rem; font-size: .85rem; margin: .7rem 0; }
label.case { flex-direction: row; align-items: center; }
select, input:not([type=checkbox]):not([type=color]) { font: inherit; border: 1px solid #bdc9db; border-radius: 5px; padding: .5rem; background: white; min-width: 0; }
input[type=color] { border: 0; width: 3rem; height: 2rem; padding: 0; background: none; }
.destinations-division { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 1rem; }
footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .6rem; margin-top: 1.2rem; border-top: 1px solid #e2e7ee; padding-top: 1rem; }
.alerte { background: #fff2ed; color: #893f29; border: 1px solid #ecc7b9; border-radius: 6px; padding: .7rem 1rem; font-size: .85rem; }
.compteurs { display: grid; grid-template-columns: repeat(4, 1fr); gap: .6rem; }
.compteurs div { background: #f2f5fa; padding: .7rem; border-radius: 7px; }
dt { font-size: .75rem; color: #626d81; }
dd { margin: .3rem 0 0; font-size: 1.3rem; font-weight: 600; }
.consequence { background: #f4f7fc; padding: .8rem; font-size: .85rem; }
.attente { display: flex; flex-wrap: wrap; gap: .6rem; align-items: center; background: #f4f0ff; color: #533a85; padding: .8rem; font-size: .85rem; }
.roue { width: .9rem; height: .9rem; border: 2px solid #c8bee0; border-top-color: #533a85; border-radius: 50%; animation: tourner 1s linear infinite; }
@keyframes tourner { to { transform: rotate(360deg); } }
button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid #356ac3; outline-offset: 2px; }
@media (max-width: 650px) { .compteurs { grid-template-columns: repeat(2, 1fr); } .destinations-division { grid-template-columns: 1fr; } .modale-operations-themes { padding: .8rem; } }
</style>
