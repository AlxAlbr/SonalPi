<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import TableReglesAnon from './TableReglesAnon.vue'
import BarreOngletCorpus from './BarreOngletCorpus.vue'
import { vHauteurDisponible } from '../../../directives/hauteurDisponible'
import BadgesAnon from './BadgesAnon.vue'
import FormulaireRegleAnon from './FormulaireRegleAnon.vue'
import EditionPseudosAnon from './EditionPseudosAnon.vue'
import RetraitVarianteAnon from './RetraitVarianteAnon.vue'
import type { DemandeRetraitVarianteAnon, BilanRetraitVarianteAnon, SuiviRetraitVarianteAnon } from '../../../../shared/corpus/retraitVarianteAnon'
import type { ResultatAjoutVarianteAnon } from '../../../../shared/corpus/variantesAnon'
import EchangesCorrespondances from './EchangesCorrespondances.vue'
import RenommageVarianteAnon from './RenommageVarianteAnon.vue'
import DissociationRegleAnon from './DissociationRegleAnon.vue'
import LegendeAnon from './LegendeAnon.vue'
import SuppressionRegleAnon from './SuppressionRegleAnon.vue'
import type { BilanSuppressionAnon, SuiviSuppressionAnon } from '../../../../shared/corpus/suppressionAnon'
import { suspendreTirageAutomatique } from '../../../tirageAutomatique'
import type { BilanDissociationAnon, SuiviDissociationAnon } from '../../../../shared/corpus/dissociationAnon'
import type { RegleAnon } from '../../../../shared/format'
import type { BilanRenommageAnon } from '../../../../shared/corpus/renommageAnon'
import type { DefinitionAnon } from '../../../../shared/corpus/definitionsAnon'
import { presenterReglesAnon, collisionsPseudos, type FiltreEtatAnon, type TriAnon } from '../../../../shared/corpus/presentationAnon'
import {
  cleOccurrence,
  construireDiff,
  etatsDepuisDetails,
  scannerRegleDetaille,
  type OccurrenceScan,
} from '../../../../shared/corpus/scanAnon'

const props = defineProps<{ actif: boolean }>()
const emit = defineEmits<{ ouvrirOccurrence: [id: string, pos: number] }>()
const {
  membership, reglesAnon, scanAnon, rafraichirScanAnon, perimerScanAnon, rafraichirReglesAnon,
  scanAnonCharge, scanAnonPerime, scanAnonEnCours, scanAnonErreur,
  paramsAnon, majParamsAnon, lectureSeule, badgeVerrou,
  pseudonymisationLigneEditable, gesteDisponible, vue, dernierTirage, fournisseurCourant,
  demandeDissociationAnon, revisionCorpus,
} = utiliserSonal()
const selectedRegleId = ref<string | null>(null)
const messagePseudo = ref<string | null>(null)

const scanPourRegle = computed(
  () => scanAnon.value.find((s) => s.regle.id === selectedRegleId.value) ?? null,
)
let generationDetails = 0
async function selectionnerRegle(id: string) {
  if (!(await autoriserSortie())) return
  generationDetails++
  if (selectedRegleId.value === id) {
    selectedRegleId.value = null
    deplie.value = null
    details.value = {}
    cochees.value = {}
    exceptions.value = {}
    return
  }
  selectedRegleId.value = id
  deplie.value = null
  details.value = {}
  cochees.value = {}
  exceptions.value = {}
}
/** Entretiens où la règle apparaît (depuis le scan), avec leurs compteurs. */
function entretiensRegle() {
  const s = scanPourRegle.value
  if (!s) return []
  return Object.entries(s.parEntretien).map(([id, st]) => ({
    id,
    titre: membership.value[id]?.titre ?? id,
    ...st,
  }))
}

// Accordéon : un seul entretien déplié à la fois ; détails chargés au dépliage.
const deplie = ref<string | null>(null)
const details = ref<Record<string, OccurrenceScan[]>>({})
async function basculerDepli(id: string) {
  if (!(await autoriserSortie())) return
  if (deplie.value === id) {
    deplie.value = null
    return
  }
  deplie.value = id
  if (!(id in details.value) && await chargerDetails(id)) initEtatEnt(id)
}
async function chargerDetails(id: string): Promise<boolean> {
  const s = scanPourRegle.value
  if (!s) return false
  const generation = generationDetails
  const regleId = selectedRegleId.value
  let lecture
  try {
    lecture = await window.sonal.corpus.lireEntretien(id)
  } catch {
    if (generation === generationDetails) messagePseudo.value = 'Lecture de l’entretien impossible.'
    return false
  }
  if (generation !== generationDetails || regleId !== selectedRegleId.value) return false
  if (!lecture.ok) {
    messagePseudo.value = 'Lecture de l’entretien impossible.'
    return false
  }
  details.value[id] = scannerRegleDetaille(
    { ...s.regle },
    { id, data: lecture.data as never },
  )
  return true
}
function occurrencesDe(id: string): OccurrenceScan[] {
  return details.value[id] ?? []
}

// État ÉDITABLE par occurrence : la case reflète l'ÉTAT,
// (cochée = anonymisée, décochée = à traiter), le 🚫 marque une exception ;
// les modifications restent LOCALES jusqu'à « Valider », clé « from:to ».
const cochees = ref<Record<string, Record<string, boolean>>>({})
const exceptions = ref<Record<string, Record<string, boolean>>>({})
const cleOcc = cleOccurrence
/** Initialise l'état éditable d'un entretien depuis son scan détaillé ;
 *  les incluses n'y figurent pas (non modifiables). */
function initEtatEnt(id: string) {
  const etats = etatsDepuisDetails({ [id]: occurrencesDe(id) })
  cochees.value[id] = etats.cochees[id]
  exceptions.value[id] = etats.exceptions[id]
}
/** État VISUEL d'une occurrence : suit les modifications locales,
 *  pas le dernier scan (couleurs, gras du match, affichage du pseudo). */
function etatOcc(id: string, o: OccurrenceScan): OccurrenceScan['etat'] {
  if (o.actionnable === false || scanPourRegle.value?.regle.pseudos.length !== 1) return o.etat
  if (o.etat === 'incl') return 'incl'
  if (exceptions.value[id]?.[cleOcc(o)]) return 'exc'
  return cochees.value[id]?.[cleOcc(o)] ? 'anon' : 'non'
}
function estCochee(id: string, o: OccurrenceScan): boolean {
  return etatOcc(id, o) === 'anon'
}
function basculerCoche(id: string, o: OccurrenceScan) {
  if (!occurrenceEditable(id, o)) return
  const c = (cochees.value[id] ??= {})
  const k = cleOcc(o)
  c[k] = !c[k]
}
function enException(id: string, o: OccurrenceScan): boolean {
  return etatOcc(id, o) === 'exc'
}
/** 🚫 droit : demande l'exception (la case se décoche). */
function demanderException(id: string, o: OccurrenceScan) {
  if (!occurrenceEditable(id, o)) return
  ;(exceptions.value[id] ??= {})[cleOcc(o)] = true
  ;(cochees.value[id] ??= {})[cleOcc(o)] = false
}
/** 🚫 gauche : retire l'exception → l'occurrence redevient « à traiter ». */
function retirerException(id: string, o: OccurrenceScan) {
  if (!occurrenceEditable(id, o)) return
  ;(exceptions.value[id] ??= {})[cleOcc(o)] = false
}
/** Case-tout de l'en-tête ;
 *  coché quand toutes les occurrences modifiables sont cochées, un clic
 *  coche/décoche tout (les exceptions restent posées). */
function entToutCoche(id: string): boolean {
  const c = cochees.value[id]
  if (!c) return false
  const ks = Object.keys(c)
  return ks.length > 0 && ks.every((k) => c[k])
}
function occurrenceEditable(id: string, o?: OccurrenceScan): boolean {
  return !validationEnCours.value && pseudonymisationLigneEditable(id) && scanPourRegle.value?.regle.pseudos.length === 1 && o?.actionnable !== false
}
function toutCocherEnt(id: string) {
  if (!occurrenceEditable(id)) return
  const c = cochees.value[id]
  if (!c) return
  const cible = !entToutCoche(id)
  for (const k of Object.keys(c)) c[k] = cible
}
/** L'entretien est « tout traité » si aucune occurrence n'est à traiter,
 *  les incluses comptant comme traitées. */
function entToutTraite(anon: number, exc: number, incl: number, non: number): boolean {
  return anon + exc + incl > 0 && non === 0
}

// Paramètres de pseudonymisation propres au corpus.
const parametresOuverts = ref(false)
const prioriteLocale = ref<'corpus' | 'entretien'>(paramsAnon.value.prioriteValidation)
const motsLiaisonActif = ref(paramsAnon.value.motsLiaison?.actif ?? true)
const motsLiaisonListe = ref((paramsAnon.value.motsLiaison?.liste ?? []).join(', '))
const thematiquesActif = ref(paramsAnon.value.thematiques?.actif ?? false)
const thematiquesListeTexte = ref((paramsAnon.value.thematiques?.liste ?? []).join(', '))
watch(
  () => paramsAnon.value,
  (p) => {
    prioriteLocale.value = p.prioriteValidation
    motsLiaisonActif.value = p.motsLiaison?.actif ?? true
    motsLiaisonListe.value = (p.motsLiaison?.liste ?? []).join(', ')
    thematiquesActif.value = p.thematiques?.actif ?? false
    thematiquesListeTexte.value = (p.thematiques?.liste ?? []).join(', ')
  },
  { deep: true },
)
watch(prioriteLocale, async (v) => {
  if (v !== paramsAnon.value.prioriteValidation) {
    await majParamsAnon({ ...paramsAnon.value, prioriteValidation: v })
  }
})
/** Commit les mots de liaison : liste scindée sur espaces/virgules/points-virgules. */
async function committerMotsLiaison() {
  const liste = motsLiaisonListe.value
    .split(/[\s,;]+/)
    .map((m) => m.trim())
    .filter(Boolean)
  await majParamsAnon({
    ...paramsAnon.value,
    motsLiaison: { actif: motsLiaisonActif.value, liste },
  })
}
/** Commit les thématiques (même découpage). */
async function committerThematiques() {
  const liste = thematiquesListeTexte.value
    .split(/[\s,;]+/)
    .map((m) => m.trim())
    .filter(Boolean)
  await majParamsAnon({
    ...paramsAnon.value,
    thematiques: { actif: thematiquesActif.value, liste },
  })
}
/** Thématiques actives (vide si réglage désactivé). */
const thematiquesListe = computed(() =>
  paramsAnon.value.thematiques?.actif ? paramsAnon.value.thematiques.liste : [],
)
/** Assigne/retire la catégorie d'une règle puis rafraîchit le scan. */
async function categoriser(regleId: string, categorie: string) {
  if (lectureSeule.value || !(await autoriserSortie())) return
  await window.sonal.corpus.regleAnonCategoriser(regleId, categorie || null)
  await rafraichirReglesAnon(false)
}

const echangesMode = ref<'import' | 'export' | null>(null)
const echangesEnCours = ref(false)
async function ouvrirEchanges(mode: 'import' | 'export') {
  if (!(await autoriserSortie())) return
  echangesMode.value = mode
}
async function apresImport(message: string) {
  echangesMode.value = null
  messagePseudo.value = message
  perimerScanAnon()
  await nextTick()
  await charger(true)
}

const ajoutVariante = ref<RegleAnon | null>(null), ajoutVarianteEnCours = ref(false)
const ajoutVarianteDisponible = computed(() => !lectureSeule.value && gesteDisponible('ajoutVarianteAnon'))
const retraitVarianteDisponible = computed(() => !lectureSeule.value && gesteDisponible('retraitVarianteAnon'))
const retraitVariante = ref<DemandeRetraitVarianteAnon | null>(null), retraitVarianteEnCours = ref(false)
const suiviRetraitVariante = ref<SuiviRetraitVarianteAnon | null>(null), erreurSuiviRetraitVariante = ref<string | null>(null)
const fournisseurRetraitDistant = computed(() => fournisseurCourant?.value === 'gitlab' || fournisseurCourant?.value === 'webdav')
const libelleFournisseurRetrait = computed(() => fournisseurCourant?.value === 'webdav' ? 'WebDAV' : 'GitLab')
let generationSuiviRetrait = 0
async function lireSuiviRetraitVariante() {
  const g = ++generationSuiviRetrait, revision = revisionCorpus.value
  if (!props.actif || !fournisseurRetraitDistant.value) { suiviRetraitVariante.value = null; erreurSuiviRetraitVariante.value = null; return }
  try {
    const suivi = await window.sonal.corpus.suiviRetraitVarianteAnon()
    if (!editionVivante || g !== generationSuiviRetrait || revision !== revisionCorpus.value || !props.actif) return
    if (!suivi && suiviRetraitVariante.value) {
      erreurSuiviRetraitVariante.value = 'Le suivi n’est plus disponible. Vérifiez l’avancement avant tout nouveau retrait.'
    } else { suiviRetraitVariante.value = suivi; erreurSuiviRetraitVariante.value = null }
  } catch {
    if (editionVivante && g === generationSuiviRetrait && revision === revisionCorpus.value && props.actif) erreurSuiviRetraitVariante.value = 'Impossible de vérifier l’avancement. Relisez le suivi avant de continuer.'
  }
}
function memoriserSuiviRetraitVariante(suivi: SuiviRetraitVarianteAnon) {
  generationSuiviRetrait++; suiviRetraitVariante.value = suivi; erreurSuiviRetraitVariante.value = null
}
async function relireSuiviRetraitVariante() {
  if (retraitVarianteEnCours.value || retraitVariante.value || ajoutVarianteEnCours.value) return
  if (!suiviRetraitVariante.value) { await lireSuiviRetraitVariante(); return }
  const g = ++generationSuiviRetrait, revision = revisionCorpus.value, demande = suiviRetraitVariante.value.demande
  const reprendreTirage = suspendreTirageAutomatique()
  retraitVarianteEnCours.value = true
  try {
    const bilan = await window.sonal.corpus.relireSuiviRetraitVarianteAnon(suiviRetraitVariante.value.operationId)
    if (!editionVivante || g !== generationSuiviRetrait || revision !== revisionCorpus.value || !props.actif) return
    erreurSuiviRetraitVariante.value = null
    if (bilan.statut === 'termine') await apresRetraitVariante(bilan)
    else memoriserSuiviRetraitVariante({ ...bilan, demande })
  } catch {
    if (editionVivante && g === generationSuiviRetrait && revision === revisionCorpus.value && props.actif) erreurSuiviRetraitVariante.value = 'Impossible de vérifier l’avancement. Réessayez la lecture du suivi avant de continuer.'
  } finally { retraitVarianteEnCours.value = false; reprendreTirage() }
}
async function ouvrirSuiviRetraitVariante() {
  if (!suiviRetraitVariante.value || !(await autoriserSortie())) return
  retraitVariante.value = JSON.parse(JSON.stringify(suiviRetraitVariante.value.demande)) as DemandeRetraitVarianteAnon
}
function retirerDepuisEdition(pseudoRetire: string, pseudoConserve: string) {
  if (!retraitVarianteDisponible.value || !ajoutVariante.value || ajoutVarianteEnCours.value) return
  retraitVariante.value = { regleAvant: JSON.parse(JSON.stringify(ajoutVariante.value)) as RegleAnon, pseudoRetire, pseudoConserve }
  ajoutVariante.value = null
}
async function apresRetraitVariante(bilan: BilanRetraitVarianteAnon) {
  retraitVariante.value = null; retraitVarianteEnCours.value = false
  generationSuiviRetrait++; suiviRetraitVariante.value = null; erreurSuiviRetraitVariante.value = null
  messagePseudo.value = `Variante retirée : ${bilan.annotations} choix remplacé(s), dont ${bilan.exceptions} exception(s) conservée(s) en clair, dans ${bilan.entretiens} entretien(s). Aucun locuteur modifié.`
  perimerScanAnon()
  await nextTick()
  try { await charger(true) }
  catch { messagePseudo.value += ' Rouvrez le corpus pour vérifier sa définition, sans répéter le retrait.' }
}
let editionVivante = true
onUnmounted(() => { editionVivante = false })
async function ouvrirEditionPseudos(id: string) {
  if ((!ajoutVarianteDisponible.value && !renommageDisponible.value && !retraitVarianteDisponible.value && !suiviRetraitVariante.value) || !(await autoriserSortie())) return
  const revision = revisionCorpus.value
  ajoutVarianteEnCours.value = true
  try {
    if (fournisseurRetraitDistant.value) {
      const retrait = await window.sonal.corpus.suiviRetraitVarianteAnon()
      if (!editionVivante || !props.actif || revision !== revisionCorpus.value) return
      if (retrait) {
        memoriserSuiviRetraitVariante(retrait)
        retraitVariante.value = JSON.parse(JSON.stringify(retrait.demande)) as DemandeRetraitVarianteAnon
        return
      }
      if (suiviRetraitVariante.value || erreurSuiviRetraitVariante.value) {
        messagePseudo.value = 'Relisez le suivi du retrait de variante avant de modifier les pseudonymes.'
        return
      }
    }
    const suivi = await window.sonal.corpus.suiviRenommageAnon()
    if (!editionVivante || !props.actif || revision !== revisionCorpus.value) return
    const regle = reglesAnon.value.find((r) => r.id === (suivi?.demande.regleId ?? id))
    if (!regle) return
    if (suivi) {
      if (renommageDisponible.value) renommage.value = { regle: JSON.parse(JSON.stringify(regle)) as RegleAnon, pseudo: suivi.demande.ancienPseudo }
    } else if (ajoutVarianteDisponible.value || renommageDisponible.value || retraitVarianteDisponible.value) ajoutVariante.value = JSON.parse(JSON.stringify(regle)) as RegleAnon
  } catch {
    if (editionVivante && revision === revisionCorpus.value) messagePseudo.value = 'Impossible de vérifier le suivi des pseudonymes. Actualisez le corpus avant de les modifier.'
  } finally { if (editionVivante && revision === revisionCorpus.value) ajoutVarianteEnCours.value = false }
}
async function apresAjoutVariante(resultat: ResultatAjoutVarianteAnon) {
  ajoutVariante.value = null; ajoutVarianteEnCours.value = false
  messagePseudo.value = resultat.ajoute ? 'Variante ajoutée. Aucun choix d’entretien ni locuteur n’a été modifié.' : 'Cette variante était déjà déclarée. Aucun changement.'
  perimerScanAnon()
  await nextTick()
  try { await charger(true) }
  catch { messagePseudo.value += ' Actualisez le corpus pour vérifier sa définition, sans répéter l’ajout.' }
}

const renommage = ref<{ regle: RegleAnon; pseudo: string; nouveau?: string } | null>(null)
const renommageEnCours = ref(false)
const renommageDisponible = computed(() => !lectureSeule.value && gesteDisponible('pseudonymisationGlobale'))
function renommerDepuisEdition(pseudo: string, nouveau: string) {
  if (!renommageDisponible.value || !ajoutVariante.value || ajoutVarianteEnCours.value) return
  renommage.value = { regle: JSON.parse(JSON.stringify(ajoutVariante.value)) as RegleAnon, pseudo, nouveau }
  ajoutVariante.value = null
}
async function apresRenommage(bilan: BilanRenommageAnon) {
  renommage.value = null
  renommageEnCours.value = false
  messagePseudo.value = `Renommage effectué : ${bilan.annotations} annotation(s), dont ${bilan.incluses} masquée(s), dans ${bilan.entretiens} entretien(s). Aucun locuteur modifié.`
  perimerScanAnon()
  await nextTick()
  try { await charger(true) }
  catch { messagePseudo.value += ' Actualisation impossible : relisez le corpus, sans rejouer le renommage.' }
}

const suppression = ref<RegleAnon | null>(null), suppressionEnCours = ref(false)
const suppressionDisponible = computed(() => !lectureSeule.value && gesteDisponible('suppressionAnonGlobale'))
const fournisseurSuppression = computed(() => fournisseurCourant?.value === 'webdav' ? 'WebDAV' : 'GitLab')
const suiviSuppression = ref<SuiviSuppressionAnon | null>(null), erreurSuiviSuppression = ref<string | null>(null)
let generationSuiviSuppression = 0, suiviSuppressionVivant = true
async function lireSuiviSuppression() {
  const g = ++generationSuiviSuppression, revision = revisionCorpus.value
  if (!props.actif || !['gitlab', 'webdav'].includes(fournisseurCourant?.value ?? '')) { suiviSuppression.value = null; erreurSuiviSuppression.value = null; return }
  try {
    const suivi = await window.sonal.corpus.suiviSuppressionAnon()
    if (suiviSuppressionVivant && g === generationSuiviSuppression && revision === revisionCorpus.value && props.actif) {
      suiviSuppression.value = suivi; erreurSuiviSuppression.value = null
    }
  } catch {
    if (suiviSuppressionVivant && g === generationSuiviSuppression && revision === revisionCorpus.value && props.actif) erreurSuiviSuppression.value = 'Impossible de vérifier l’avancement. Relisez le suivi avant de continuer.'
  }
}
function memoriserSuiviSuppression(suivi: SuiviSuppressionAnon) {
  generationSuiviSuppression++; suiviSuppression.value = suivi; erreurSuiviSuppression.value = null
}
async function relireSuiviSuppression() {
  if (suppressionEnCours.value || suppression.value) return
  if (!suiviSuppression.value) { await lireSuiviSuppression(); return }
  const g = ++generationSuiviSuppression, revision = revisionCorpus.value, demande = suiviSuppression.value.demande
  const reprendreTirage = suspendreTirageAutomatique()
  suppressionEnCours.value = true
  try {
    const bilan = await window.sonal.corpus.relireSuiviSuppressionAnon(suiviSuppression.value.operationId)
    if (!suiviSuppressionVivant || g !== generationSuiviSuppression || revision !== revisionCorpus.value || !props.actif) return
    erreurSuiviSuppression.value = null
    if (bilan.statut === 'termine') await apresSuppression(bilan)
    else memoriserSuiviSuppression({ ...bilan, demande })
  } catch {
    if (suiviSuppressionVivant && g === generationSuiviSuppression && revision === revisionCorpus.value && props.actif) erreurSuiviSuppression.value = 'Impossible de vérifier l’avancement. Réessayez la lecture du suivi avant de continuer.'
  } finally { suppressionEnCours.value = false; reprendreTirage() }
}
async function ouvrirRepriseSuppression() {
  const s = suiviSuppression.value
  if (!s || erreurSuiviSuppression.value || s.statut === 'indetermine' || s.regleRetiree || s.miroirIncomplet) return
  await ouvrirSuppression(s.demande.regleId)
}
async function ouvrirSuppression(id: string) {
  if (!suppressionDisponible.value || erreurSuiviSuppression.value
    || (suiviSuppression.value && suiviSuppression.value.demande.regleId !== id) || !(await autoriserSortie())) return
  const regle = reglesAnon.value.find((r) => r.id === id)
  if (regle) suppression.value = JSON.parse(JSON.stringify(regle)) as RegleAnon
}
async function apresSuppression(bilan: BilanSuppressionAnon) {
  suppression.value = null; suppressionEnCours.value = false
  generationSuiviSuppression++; suiviSuppression.value = null; erreurSuiviSuppression.value = null
  messagePseudo.value = `Suppression effectuée : ${bilan.annotations} décision(s) retirée(s), dont ${bilan.exceptions} exception(s), dans ${bilan.entretiens} entretien(s). ${bilan.inclusesRevelees} décision(s) indépendante(s) révélée(s). Mémoires et locuteurs conservés.`
  perimerScanAnon()
  await nextTick()
  try { await charger(true) }
  catch { messagePseudo.value += ' Relisez le corpus, sans rejouer la suppression.' }
}
const dissociation = ref<RegleAnon | null>(null)
const dissociationEnCours = ref(false)
const dissociationDisponible = computed(() => !lectureSeule.value && gesteDisponible('dissociationGlobale'))
const fournisseurDissociation = computed(() => fournisseurCourant?.value === 'webdav' ? 'WebDAV' : 'GitLab')
const suiviDissociation = ref<SuiviDissociationAnon | null>(null)
const erreurSuiviDissociation = ref<string | null>(null)
let generationSuiviDissociation = 0
async function lireSuiviDissociation() {
  const g = ++generationSuiviDissociation, revision = revisionCorpus.value
  if (!props.actif || !['gitlab', 'webdav'].includes(fournisseurCourant?.value ?? '')) { suiviDissociation.value = null; erreurSuiviDissociation.value = null; return }
  try {
    const suivi = await window.sonal.corpus.suiviDissociationAnon()
    if (g === generationSuiviDissociation && revision === revisionCorpus.value && props.actif) {
      suiviDissociation.value = suivi; erreurSuiviDissociation.value = null
    }
  } catch {
    if (g === generationSuiviDissociation && revision === revisionCorpus.value && props.actif) erreurSuiviDissociation.value = 'Suivi indisponible. Relisez-le avant de préparer ou reprendre une dissociation.'
  }
}
async function relireSuiviDissociation() {
  if (dissociationEnCours.value || dissociation.value) return
  if (!suiviDissociation.value) { await lireSuiviDissociation(); return }
  const g = ++generationSuiviDissociation, revision = revisionCorpus.value
  dissociationEnCours.value = true
  try {
    const bilan = await window.sonal.corpus.relireSuiviDissociationAnon(suiviDissociation.value.operationId)
    if (g !== generationSuiviDissociation || revision !== revisionCorpus.value || !props.actif) return
    erreurSuiviDissociation.value = null
    if (bilan.statut === 'termine') await apresDissociation(bilan)
    else suiviDissociation.value = { ...bilan, demande: suiviDissociation.value!.demande }
  } catch {
    if (g === generationSuiviDissociation && revision === revisionCorpus.value && props.actif) erreurSuiviDissociation.value = 'Suivi indisponible. Aucun envoi autorisé avant relecture.'
  } finally { dissociationEnCours.value = false }
}
async function ouvrirRepriseDissociation() {
  if (!suiviDissociation.value || erreurSuiviDissociation.value || suiviDissociation.value.statut === 'indetermine' || suiviDissociation.value.regleRetiree) return
  await ouvrirDissociation(suiviDissociation.value.demande.regleId)
}
async function ouvrirDissociation(id: string) {
  if (!dissociationDisponible.value || erreurSuiviDissociation.value
    || (suiviDissociation.value && suiviDissociation.value.demande.regleId !== id) || !(await autoriserSortie())) return
  const regle = reglesAnon.value.find((r) => r.id === id)
  if (regle) dissociation.value = JSON.parse(JSON.stringify(regle)) as RegleAnon
}
async function apresDissociation(bilan: BilanDissociationAnon) {
  dissociation.value = null; dissociationEnCours.value = false
  suiviDissociation.value = null; erreurSuiviDissociation.value = null
  messagePseudo.value = `Dissociation effectuée : ${bilan.annotations} décision(s), dont ${bilan.exceptions} exception(s), dans ${bilan.entretiens} entretien(s). Définitions locales complètes conservées ; aucun locuteur modifié.`
  perimerScanAnon()
  await nextTick()
  try { await charger(true) }
  catch { messagePseudo.value += ' Relisez le corpus, sans rejouer la dissociation.' }
}
const creationOuverte = ref(false)
const creationEnCours = ref(false)
const erreurCreation = ref<string | null>(null)
const creationDisponible = computed(() => !lectureSeule.value && gesteDisponible('definitions'))
async function ouvrirCreation() {
  if (!creationDisponible.value || !(await autoriserSortie())) return
  erreurCreation.value = null
  creationOuverte.value = true
}
async function creerDefinition(definition: DefinitionAnon) {
  if (!props.actif || !creationDisponible.value || creationEnCours.value) return
  const contexte = generationDetails
  creationEnCours.value = true
  erreurCreation.value = null
  try {
    const resultat = await window.sonal.corpus.regleAnonCreer(definition.entite.join(' / '), definition.pseudos, definition.categorie)
    if (contexte !== generationDetails) return
    creationOuverte.value = false
    messagePseudo.value = resultat.existait
      ? 'Cette entité possède déjà une règle. La définition et les entretiens sont restés inchangés.'
      : 'Définition créée. Aucun entretien n’a été modifié.'
    perimerScanAnon()
    await rafraichirScanAnon(true)
    if (scanAnonPerime.value) await rafraichirScanAnon(true)
    if (contexte !== generationDetails) return
    creationEnCours.value = false
    if (selectedRegleId.value !== resultat.regle.id) await selectionnerRegle(resultat.regle.id)
  } catch (erreur) {
    if (contexte === generationDetails) erreurCreation.value = erreur instanceof Error ? erreur.message : 'La création a échoué.'
  } finally {
    creationEnCours.value = false
  }
}

// --- Filtre / recherche d'entité dans la table des règles ---
const filtreRegle = ref('')
const filtreEtat = ref<FiltreEtatAnon>('toutes')
const filtreCategorie = ref('')
const tri = ref<TriAnon>('entite')
const descendant = ref(false)
const scanFrais = computed(() => scanAnonCharge.value && !scanAnonPerime.value && !scanAnonErreur.value)
const collisions = computed(() => collisionsPseudos(reglesAnon.value))
const scanFiltre = computed(() => presenterReglesAnon(reglesAnon.value, scanAnon.value, {
  recherche: filtreRegle.value, filtre: filtreEtat.value, tri: tri.value,
  descendant: descendant.value, frais: scanFrais.value, categorie: filtreCategorie.value,
}))
function trier(colonne: TriAnon) {
  descendant.value = tri.value === colonne ? !descendant.value : false
  tri.value = colonne
}
// Le séparateur conserve une largeur en pixels, bornée à l’espace disponible.
const RACCOURCI_LARGEUR = 'sonalpi.pseudonymisationCorpus.largeurGauche'
const panneau = ref<HTMLElement | null>(null)
const largeurGauche = ref(520)
const dispositionVerticale = ref(false)
let redimensionnement = false
function largeurDisponible() { return panneau.value?.clientWidth ?? 0 }
/** Largeur du panneau gauche bornée : au moins `minGauche`,
 *  sans rogner le panneau droit en dessous de `minDroite`. */
function bornerLargeurPanneau(valeur: number, disponible: number, minGauche = 420, minDroite = 320): number {
  if (!Number.isFinite(valeur)) valeur = minGauche
  return Math.max(minGauche, Math.min(valeur, Math.max(minGauche, disponible - minDroite)))
}
function bornerLargeur() {
  const disponible = largeurDisponible()
  if (disponible === 0) return
  dispositionVerticale.value = disponible > 0 && disponible < 780
  if (!dispositionVerticale.value) largeurGauche.value = bornerLargeurPanneau(largeurGauche.value, disponible)
}
function restaurerLargeur() {
  const memorisee = Number(localStorage.getItem(RACCOURCI_LARGEUR))
  if (Number.isFinite(memorisee) && memorisee > 0) largeurGauche.value = memorisee
  bornerLargeur()
}
function commencerRedimensionnement(e: PointerEvent) {
  redimensionnement = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function redimensionner(e: PointerEvent) {
  if (!redimensionnement || !panneau.value) return
  largeurGauche.value = bornerLargeurPanneau(e.clientX - panneau.value.getBoundingClientRect().left, largeurDisponible())
}
function finirRedimensionnement() {
  if (!redimensionnement) return
  redimensionnement = false
  localStorage.setItem(RACCOURCI_LARGEUR, String(largeurGauche.value))
}
function ajusterSeparateurClavier(e: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return
  e.preventDefault()
  largeurGauche.value = bornerLargeurPanneau(largeurGauche.value + (e.key === 'ArrowLeft' ? -20 : 20), largeurDisponible())
  localStorage.setItem(RACCOURCI_LARGEUR, String(largeurGauche.value))
}
const validationEnCours = ref(false)
/** Publie le diff par entretien et conserve les intentions des entretiens en échec. */
async function valider(): Promise<boolean> {
  if (validationEnCours.value) return false
  if (!occurrenceEditable('')) {
    messagePseudo.value = 'La modification des entretiens n’est pas disponible sur ce corpus.'
    return false
  }
  const s = scanPourRegle.value
  if (!s) return true
  const diff = construireDiff(s.regle.id, details.value, cochees.value, exceptions.value)
  if (diff.cibles.length === 0) {
    messagePseudo.value = 'Aucun changement à valider.'
    return true
  }
  const etatAvant = {
    cochees: JSON.parse(JSON.stringify(cochees.value)),
    exceptions: JSON.parse(JSON.stringify(exceptions.value)),
  }
  validationEnCours.value = true
  try {
    const res = await window.sonal.corpus.appliquerRegleAnonLot(diff.cibles)
    const touches = res.succes.filter((x) => x.nb > 0)
    const parties: string[] = []
    if (touches.length > 0) {
      const nb = touches.reduce((total, entretien) => total + entretien.nb, 0)
      const bilan = touches.reduce((total, entretien) => {
        for (const action of ['poses', 'retraits', 'exceptionsAjoutees', 'exceptionsRetirees'] as const) total[action] += entretien.actions[action]
        return total
      }, { poses: 0, retraits: 0, exceptionsAjoutees: 0, exceptionsRetirees: 0 })
      const detail = [
        bilan.poses && `${bilan.poses} anonymisée(s)`,
        bilan.retraits && `${bilan.retraits} retrait(s)`,
        bilan.exceptionsAjoutees && `${bilan.exceptionsAjoutees} exception(s) ajoutée(s)`,
        bilan.exceptionsRetirees && `${bilan.exceptionsRetirees} exception(s) retirée(s)`,
      ].filter(Boolean).join(', ')
      parties.push(`✓ ${nb} changement(s) enregistré(s) (${detail}) dans ${touches.length} entretien(s) : ` +
        touches.map((x) => membership.value[x.id]?.titre ?? x.id).join(', ') + '.')
    }
    for (const e of res.echecs) parties.push(`✗ ${membership.value[e.id]?.titre ?? e.id} : ${e.raison}`)
    messagePseudo.value = parties.join(' ') || 'Aucun changement effectué.'
    perimerScanAnon()
    await rafraichirScanAnon()
    const idsEnEchec = new Set(res.echecs.map((e) => e.id))
    for (const id of Object.keys(details.value)) {
      if (idsEnEchec.has(id)) {
        cochees.value[id] = etatAvant.cochees[id] ?? {}
        exceptions.value[id] = etatAvant.exceptions[id] ?? {}
      } else if (await chargerDetails(id)) initEtatEnt(id)
      else {
        delete details.value[id]
        delete cochees.value[id]
        delete exceptions.value[id]
        if (deplie.value === id) deplie.value = null
      }
    }
    return !aDesChangements.value
  } catch {
    messagePseudo.value = 'Validation interrompue. Actualisez pour vérifier les changements avant de recommencer.'
    perimerScanAnon()
    return false
  } finally {
    validationEnCours.value = false
  }
}
const aDesChangements = computed(() => {
  const id = selectedRegleId.value
  return !!id && construireDiff(id, details.value, cochees.value, exceptions.value).cibles.length > 0
})
function abandonner() {
  const etats = etatsDepuisDetails(details.value)
  cochees.value = etats.cochees
  exceptions.value = etats.exceptions
}
const gardeOuverte = ref(false)
let resoudreGarde: ((choix: 'valider' | 'abandonner' | 'rester') => void) | null = null
function demanderChoix(): Promise<'valider' | 'abandonner' | 'rester'> {
  gardeOuverte.value = true
  return new Promise((resolve) => { resoudreGarde = resolve })
}
function choisirGarde(choix: 'valider' | 'abandonner' | 'rester') {
  gardeOuverte.value = false
  resoudreGarde?.(choix)
  resoudreGarde = null
}
async function autoriserSortie(): Promise<boolean> {
  if (retraitVariante.value || retraitVarianteEnCours.value || ajoutVariante.value || ajoutVarianteEnCours.value || validationEnCours.value || creationEnCours.value || echangesEnCours.value || renommage.value || renommageEnCours.value || dissociation.value || dissociationEnCours.value || suppression.value || suppressionEnCours.value || gardeOuverte.value) return false
  if (!aDesChangements.value) return true
  const choix = await demanderChoix()
  if (choix === 'rester') return false
  if (choix === 'abandonner') {
    abandonner()
    return true
  }
  return valider()
}
defineExpose({ autoriserSortie })

const tableWrap = ref<HTMLElement | null>(null)
const detailWrap = ref<HTMLElement | null>(null)
let contexteRetour: { regleId: string | null; entretienId: string | null; tableScroll: number; detailScroll: number } | null = null
async function ouvrirOccurrence(id: string, pos: number) {
  if (!(await autoriserSortie())) return
  contexteRetour = {
    regleId: selectedRegleId.value,
    entretienId: deplie.value,
    tableScroll: tableWrap.value?.scrollTop ?? 0,
    detailScroll: detailWrap.value?.scrollTop ?? 0,
  }
  emit('ouvrirOccurrence', id, pos)
}
async function restaurerContexte() {
  if (!contexteRetour) return
  if (scanAnonPerime.value) await charger(true)
  const contexte = contexteRetour
  selectedRegleId.value = scanAnon.value.some((s) => s.regle.id === contexte.regleId) ? contexte.regleId : null
  if (selectedRegleId.value && contexte.entretienId && scanPourRegle.value?.parEntretien[contexte.entretienId]) {
    deplie.value = contexte.entretienId
    if (await chargerDetails(contexte.entretienId)) initEtatEnt(contexte.entretienId)
  } else deplie.value = null
  await nextTick()
  if (tableWrap.value) tableWrap.value.scrollTop = contexte.tableScroll
  if (detailWrap.value) detailWrap.value.scrollTop = contexte.detailScroll
  contexteRetour = null
}
async function charger(force = false) {
  if (!(await autoriserSortie())) return
  const ok = await rafraichirScanAnon(force)
  if (ok) {
    generationDetails++
    details.value = {}
    cochees.value = {}
    exceptions.value = {}
    if (deplie.value && await chargerDetails(deplie.value)) initEtatEnt(deplie.value)
  }
  if (ok && selectedRegleId.value && !scanAnon.value.some((s) => s.regle.id === selectedRegleId.value)) selectionnerRegle(selectedRegleId.value)
  await nextTick()
  bornerLargeur()
}
watch(() => [props.actif, demandeDissociationAnon?.value], async () => {
  const demande = demandeDissociationAnon?.value
  if (!props.actif || !demande) return
  demandeDissociationAnon.value = null
  await charger(true)
  if (props.actif && revisionCorpus.value === demande.revision) await ouvrirDissociation(demande.regleId)
}, { immediate: true })
watch(() => [props.actif, revisionCorpus.value, fournisseurCourant?.value], () => {
  generationSuiviRetrait++; suiviRetraitVariante.value = null; erreurSuiviRetraitVariante.value = null
  retraitVariante.value = null; retraitVarianteEnCours.value = false
  void lireSuiviRetraitVariante()
  ajoutVariante.value = null; ajoutVarianteEnCours.value = false
  generationSuiviSuppression++
  suiviSuppression.value = null; erreurSuiviSuppression.value = null; suppression.value = null
  void lireSuiviSuppression()
  generationSuiviDissociation++
  suiviDissociation.value = null; erreurSuiviDissociation.value = null
  void lireSuiviDissociation()
}, { immediate: true })
watch(() => props.actif, async (actif) => {
  if (actif) {
    await charger(false)
    await restaurerContexte()
  }
}, { immediate: true })
watch(vue, (v, avant) => {
  if (v !== 'corpus' || !props.actif) return
  if (avant === 'entretien') void restaurerContexte()
  // Un espace simplement masqué conserve les choix non validés.
  else if (!aDesChangements.value) void charger(false)
})
watch(scanAnonCharge, (charge) => {
  if (charge) return
  generationDetails++
  selectedRegleId.value = null
  deplie.value = null
  details.value = {}
  cochees.value = {}
  exceptions.value = {}
  contexteRetour = null
  creationOuverte.value = false
  retraitVariante.value = null; retraitVarianteEnCours.value = false
  ajoutVariante.value = null; ajoutVarianteEnCours.value = false
  echangesMode.value = null
  dissociation.value = null
  dissociationEnCours.value = false
  suppression.value = null
  suppressionEnCours.value = false
}, { flush: 'sync' })
async function actualiserPanneau() {
  await charger(true)
  if (props.actif && !retraitVariante.value && !retraitVarianteEnCours.value && !ajoutVarianteEnCours.value) await lireSuiviRetraitVariante()
}
watch(dernierTirage, () => {
  if (props.actif && vue.value === 'corpus') void actualiserPanneau()
})
function surResize() { bornerLargeur() }
onMounted(() => {
  restaurerLargeur()
  window.addEventListener('resize', surResize)
})
onUnmounted(() => {
  generationSuiviRetrait++
  suiviSuppressionVivant = false; generationSuiviSuppression++
  generationDetails++
  choisirGarde('rester')
  window.removeEventListener('resize', surResize)
})
</script>

<template>
      <BarreOngletCorpus
        class="pseudo-tete"
        titre="Pseudonymisation"
        aide="Les règles partagées par tous les entretiens du corpus."
      >
          <button class="actualiser-pseudo" :disabled="scanAnonEnCours" @click="actualiserPanneau">{{ scanAnonEnCours ? 'Actualisation…' : '⟳ Actualiser' }}</button>
          <div class="pseudo-outils-regles">
            <button class="ajouter-regle" aria-label="Import règles" title="Importer des règles ou des pseudonymes depuis un fichier" @click="ouvrirEchanges('import')">Import règles <span aria-hidden="true">📥</span></button>
            <button class="ajouter-regle" aria-label="Export règles" title="Exporter une table de règles et de pseudonymes" @click="ouvrirEchanges('export')">Export règles <span aria-hidden="true">📤</span></button>
            <button class="ajouter-regle" aria-label="Paramètres de pseudonymisation" :aria-expanded="parametresOuverts" aria-controls="parametres-pseudonymisation" title="Paramètres de pseudonymisation" @click="parametresOuverts = !parametresOuverts">Paramètres <span aria-hidden="true">⚙</span></button>
          </div>
      </BarreOngletCorpus>
      <section ref="panneau" v-hauteur-disponible class="pseudo-panneau pseudo-deux-col" :class="{ vertical: dispositionVerticale }" :style="{ '--pseudo-gauche-w': largeurGauche + 'px' }" :aria-busy="scanAnonEnCours">
        <div class="pseudo-haut">
          <p v-if="messagePseudo && !scanPourRegle" class="pseudo-message" role="status">{{ messagePseudo }}</p>

          <!-- Paramètres partagés par la pseudonymisation des entretiens. -->
          <div v-if="parametresOuverts" id="parametres-pseudonymisation" class="pseudo-params">
            <b>Priorité de validation</b>
            <div class="pseudo-params-bloc">
              <label><input v-model="prioriteLocale" type="radio" value="corpus" /> Corpus — Entrée crée la règle partagée, Maj+Entrée reste sur l'entretien</label>
              <label><input v-model="prioriteLocale" type="radio" value="entretien" /> Entretien — Entrée pose dans l'entretien courant, Maj+Entrée pousse au corpus</label>
              <p class="pseudo-params-hint">
                Décide quelle portée la touche Entrée applique sur une ligne du tableau anon d'un entretien.
              </p>
            </div>
            <b class="pseudo-params-titre">Mots de liaison et articles</b>
            <div class="pseudo-params-bloc">
              <label><input v-model="motsLiaisonActif" type="checkbox" @change="committerMotsLiaison" /> Activer la détection (« à Lyon » → proposer « Lyon »)</label>
              <template v-if="motsLiaisonActif">
                <input
                  v-model="motsLiaisonListe"
                  type="text"
                  class="pseudo-params-liste"
                  placeholder="à, de, du, au, chez…"
                  @change="committerMotsLiaison"
                />
                <p class="pseudo-params-hint">Mots séparés par des espaces ou des virgules. La proposition à la validation arrive avec le livrable dédié.</p>
              </template>
            </div>
            <b class="pseudo-params-titre">Thématiques d'entités</b>
            <div class="pseudo-params-bloc">
              <label><input v-model="thematiquesActif" type="checkbox" @change="committerThematiques" /> Activer les catégories (PER, LOC…)</label>
              <template v-if="thematiquesActif">
                <input
                  v-model="thematiquesListeTexte"
                  type="text"
                  class="pseudo-params-liste"
                  placeholder="PER, LOC, ORG, DAT"
                  @change="committerThematiques"
                />
                <p class="pseudo-params-hint">
                  Catégories séparées par des espaces ou des virgules. Dans la recherche,
                  saisir exactement un nom de catégorie filtre le tableau dessus.
                </p>
              </template>
            </div>
          </div>
          <LegendeAnon />
          <div v-if="!reglesAnon.length" class="pseudo-filtres">
            <select aria-label="Filtre d’état" disabled><option>Toutes les règles</option></select>
            <button class="ajouter-regle" :disabled="!creationDisponible || creationEnCours" @click="ouvrirCreation">Ajouter une règle</button>
          </div>
          <p v-if="scanAnonPerime && scanAnonCharge" class="pseudo-hint" role="status">Résultat périmé : actualisez avant de vous fier aux compteurs.</p>
          <p v-if="scanAnonErreur && scanAnonCharge" class="pseudo-erreur" role="alert">{{ scanAnonErreur }} Le dernier résultat lisible reste affiché et peut ne plus être à jour.</p>
        </div>
          <section v-if="suiviRetraitVariante || erreurSuiviRetraitVariante" class="pseudo-hint" role="status">
            <strong>Retrait de variante {{ libelleFournisseurRetrait }} à reprendre</strong>
            <p v-if="suiviRetraitVariante">{{ suiviRetraitVariante.annotations }} choix remplacé(s) dans {{ suiviRetraitVariante.entretiens }} entretien(s). {{ suiviRetraitVariante.varianteRetiree || suiviRetraitVariante.miroirIncomplet ? 'Les remplacements sont enregistrés ; il reste à actualiser votre copie du corpus.' : 'Le retrait de la variante n’est pas encore terminé.' }}</p>
            <p v-if="suiviRetraitVariante?.statut === 'indetermine'">Le serveur n’a pas confirmé le résultat. Relisez le suivi avant de continuer.</p>
            <p v-if="erreurSuiviRetraitVariante" role="alert">{{ erreurSuiviRetraitVariante }}</p>
            <button :disabled="retraitVarianteEnCours || !!retraitVariante || ajoutVarianteEnCours" @click="relireSuiviRetraitVariante">Relire le suivi {{ libelleFournisseurRetrait }}</button>
            <button v-if="suiviRetraitVariante" :disabled="retraitVarianteEnCours || !!retraitVariante || ajoutVarianteEnCours" @click="ouvrirSuiviRetraitVariante">Examiner le retrait de variante</button>
          </section>
          <section v-if="suiviSuppression || erreurSuiviSuppression" class="pseudo-hint" role="status">
            <h3>Lot {{ fournisseurSuppression }} de suppression à reprendre</h3>
            <p v-if="suiviSuppression">{{ suiviSuppression.annotations }} choix retiré(s) dans {{ suiviSuppression.entretiens }} entretien(s). {{ suiviSuppression.regleRetiree || suiviSuppression.miroirIncomplet ? 'Les suppressions sont enregistrées ; il reste à actualiser votre copie du corpus.' : 'La suppression de la règle n’est pas encore terminée.' }}</p>
            <p v-if="suiviSuppression?.statut === 'indetermine'">Le serveur n’a pas confirmé le résultat. Relisez le suivi avant de continuer.</p>
            <p v-if="erreurSuiviSuppression" role="alert">{{ erreurSuiviSuppression }}</p>
            <button :disabled="suppressionEnCours || !!suppression" @click="relireSuiviSuppression">Relire le suivi {{ fournisseurSuppression }}</button>
            <button v-if="suiviSuppression" :disabled="!suppressionDisponible || suppressionEnCours || !!suppression || !!erreurSuiviSuppression || suiviSuppression.statut === 'indetermine' || suiviSuppression.regleRetiree || suiviSuppression.miroirIncomplet" @click="ouvrirRepriseSuppression">Recalculer la reprise</button>
          </section>
          <section v-if="suiviDissociation || erreurSuiviDissociation" class="pseudo-hint" role="status">
            <h3>Lot {{ fournisseurDissociation }} de dissociation à reprendre</h3>
            <p v-if="suiviDissociation">{{ suiviDissociation.annotations }} décision(s) acquise(s) dans {{ suiviDissociation.entretiens }} entretien(s). {{ suiviDissociation.regleRetiree ? 'Retrait acquis ; miroir à relire.' : 'Retrait de la définition non confirmé.' }}</p>
            <p v-if="suiviDissociation?.statut === 'indetermine'">Publication indéterminée : aucune reprise avant reconnaissance de son issue.</p>
            <p v-if="erreurSuiviDissociation" role="alert">{{ erreurSuiviDissociation }}</p>
            <button :disabled="dissociationEnCours || !!dissociation" @click="relireSuiviDissociation">Relire le suivi {{ fournisseurDissociation }}</button>
            <button v-if="suiviDissociation" :disabled="!dissociationDisponible || dissociationEnCours || !!dissociation || !!erreurSuiviDissociation || suiviDissociation.statut === 'indetermine' || suiviDissociation.regleRetiree" @click="ouvrirRepriseDissociation">Recalculer la reprise</button>
          </section>
          <div v-if="scanAnonEnCours && !scanAnonCharge && !reglesAnon.length" class="pseudo-vide" role="status">Analyse du corpus…</div>
          <div v-else-if="scanAnonErreur && !scanAnonCharge && !reglesAnon.length" class="pseudo-vide pseudo-premiere-erreur">
            <p role="alert">{{ scanAnonErreur }}</p>
            <button type="button" :disabled="scanAnonEnCours" @click="charger(true)">Réessayer</button>
          </div>
          <div v-else-if="reglesAnon.length === 0" class="pseudo-vide">
            Aucune règle d'anonymisation corpus pour l'instant.
            <div class="pseudo-hint">
              Ajoutez une définition ici, ou depuis l’onglet Anon d’un entretien. La création au corpus ne pseudonymise aucun texte.
            </div>
          </div>

          <template v-else>
            <!-- Partie GAUCHE : recherche + table des règles, loupe par ligne. -->
            <div class="panneau pseudo-gauche">
              <div class="corpus-tete"><h3 class="titre-panneau">Pseudonymisation</h3></div>
              <p class="accueil-intro pseudo-intro">Règles d’anonymisation du corpus.</p>
              <div class="pseudo-filtres">
                <select v-model="filtreEtat" aria-label="Filtre d’état">
                  <option value="toutes">Toutes les règles</option>
                  <option value="a-traiter">À traiter</option>
                  <option value="exceptions">Avec exceptions</option>
                  <option value="traitees">Entièrement traitées</option>
                  <option value="inutilisees">Inutilisées</option>
                  <option value="collisions">Collisions de pseudo</option>
                </select>
                <button class="ajouter-regle" :disabled="!creationDisponible || creationEnCours" :title="creationDisponible ? 'Ajouter une règle sans modifier les textes' : 'Ajout indisponible pour ce corpus'" @click="ouvrirCreation">Ajouter une règle</button>
                <select v-if="thematiquesListe.length" v-model="filtreCategorie" aria-label="Filtre de catégorie">
                  <option value="">Toutes les catégories</option>
                  <option v-for="categorie in thematiquesListe" :key="categorie" :value="categorie">{{ categorie }}</option>
                </select>
              </div>
              <input
                v-model="filtreRegle"
                aria-label="Rechercher une règle"
                class="pseudo-recherche"
                type="search"
                :placeholder="thematiquesListe.length ? 'Rechercher une entité, un pseudo ou une catégorie…' : 'Rechercher une entité ou un pseudo…'"
              />
              <!-- Compteur de règles affichées / total (barre de filtrage). -->
              <div class="pseudo-compteur">
                {{ scanFiltre.length }} / {{ reglesAnon.length }}
                règle(s)
              </div>
              <!-- La table défile SEULE : recherche et compteur restent visibles,
                   l'en-tête des colonnes est épinglé en haut du défilement. -->
              <div ref="tableWrap" class="pseudo-table-wrap">
              <TableReglesAnon :lignes="scanFiltre" :selection="selectedRegleId" :tri="tri" :descendant="descendant" :frais="scanFrais" :collisions="collisions" :categories="thematiquesListe" :lecture-seule="lectureSeule || validationEnCours" :ajout-variante-disponible="ajoutVarianteDisponible" :retrait-variante-disponible="retraitVarianteDisponible" @modifier-pseudos="ouvrirEditionPseudos" :renommage-disponible="renommageDisponible" :dissociation-disponible="dissociationDisponible" :suppression-disponible="suppressionDisponible && !suiviSuppression && !erreurSuiviSuppression" @supprimer-partout="ouvrirSuppression" @dissocier="ouvrirDissociation" @selectionner="selectionnerRegle" @trier="trier" @categoriser="categoriser" />
              </div>
            </div>
            <div v-if="!dispositionVerticale" class="pseudo-separateur" role="separator" aria-label="Largeur de la table" aria-orientation="vertical" tabindex="0" :aria-valuenow="largeurGauche" @pointerdown="commencerRedimensionnement" @pointermove="redimensionner" @pointerup="finirRedimensionnement" @pointercancel="finirRedimensionnement" @keydown="ajusterSeparateurClavier"></div>

            <!-- Partie DROITE : drill-down d'une règle (entretiens + masque). -->
            <div ref="detailWrap" class="pseudo-droite">
              <div v-if="!scanPourRegle" class="pseudo-droite-vide">
                Clique sur la loupe 🔍 d'une règle pour voir les entretiens concernés et valider les occurrences.
              </div>
              <template v-else>
                <div class="pseudo-detail-tete">
                  <b>« {{ scanPourRegle.regle.entite.join(' / ') }} »</b>
                  <span class="pseudo-detail-pseudos">{{ scanPourRegle.regle.pseudos.join(' / ') }}</span>
                </div>
                <p v-if="messagePseudo" class="pseudo-message">{{ messagePseudo }}</p>
                <BadgesAnon :compteurs="scanPourRegle.total" :variantes="scanPourRegle.variantes" :frais="scanFrais" />
                <p v-if="scanPourRegle.regle.pseudos.length > 1" class="pseudo-aide">Plusieurs variantes : choisissez les pseudonymes dans l’entretien. Ce détail est en lecture seule.</p>
                <p v-else class="pseudo-aide">
                  Déplie un entretien : cochée = anonymisée, décochée = à traiter ;
                  le 🚫 de droite met en exception. Ajuste puis Valide.
                </p>
                <ul class="pseudo-ent-list">
                  <li
                    v-for="e in entretiensRegle()"
                    :key="e.id"
                    class="acc"
                    :class="scanFrais ? entToutTraite(e.anon, e.exc, e.incl, e.non) ? 'acc-ok' : 'acc-todo' : ''"
                  >
                    <!-- En-tête d'accordéon : coche-tout, titre, badges, flèche -->
                    <div class="acc-tete" @click="basculerDepli(e.id)">
                      <input
                        type="checkbox"
                        :checked="entToutCoche(e.id)"
                        :disabled="!occurrenceEditable(e.id)"
                        title="Cocher / décocher toutes les occurrences de cet entretien"
                        @click.stop
                        @change="toutCocherEnt(e.id)"
                      />
                      <button class="acc-titre" :title="e.titre" :aria-expanded="deplie === e.id" :aria-controls="`occurrences-${e.id}`" @click.stop="basculerDepli(e.id)">{{ e.titre }}</button>
                      <span v-if="badgeVerrou(e.id)" class="pseudo-cpt verrou" :title="`Verrou tenu par ${badgeVerrou(e.id)!.userId}`">🔒</span>
                      <BadgesAnon :compteurs="e" :frais="scanFrais" />
                      <span class="acc-fleche" :class="{ ouvert: deplie === e.id }">▼</span>
                    </div>

                    <!-- Contenu déplié : forme ARBORESCENTE,
                         les passages sont décalés sous l'entretien qui les porte ;
                         chaque ligne porte une case d'ÉTAT + le 🚫 d'exception. -->
                    <div v-if="deplie === e.id" :id="`occurrences-${e.id}`" class="occ-list">
                      <div
                        v-for="o in occurrencesDe(e.id)"
                        :key="cleOcc(o)"
                        class="occ"
                        :class="`occ-${etatOcc(e.id, o)}`"
                      >
                        <!-- Incluse : case cochée VERROUILLÉE (anonymisée sous une règle plus large). -->
                        <input
                          v-if="o.etat === 'incl'"
                          type="checkbox"
                          checked
                          disabled
                          title="Absorbée par une entité plus large — non modifiable ici"
                        />
                        <!-- Exception : icône 🚫 à GAUCHE, clic = la retirer. -->
                        <button
                          v-else-if="enException(e.id, o)"
                          class="occ-exc-toggle"
                          :disabled="!occurrenceEditable(e.id, o)"
                          :aria-label="`Retirer l’exception sur ${o.match}`"
                          :class="{ verrouille: !occurrenceEditable(e.id, o) }"
                          :title="!occurrenceEditable(e.id, o) ? o.motif ?? 'Modification impossible ici : ouvrir l’entretien' : 'Retirer l’exception — redevient à traiter'"
                          @click.stop="retirerException(e.id, o)"
                        >🚫</button>
                        <!-- Sinon la case d'ÉTAT : cochée = anonymisée, décochée = à traiter. -->
                        <input
                          v-else
                          type="checkbox"
                          :checked="estCochee(e.id, o)"
                          :aria-label="`Anonymiser ${o.match}`"
                          :disabled="!occurrenceEditable(e.id, o)"
                          :title="o.motif ?? 'Cochée = anonymiser cette occurrence'"
                          @click.stop
                          @change="basculerCoche(e.id, o)"
                        />
                        <span class="occ-texte">
                          <span class="ctx">{{ o.avant }}</span><b>{{ o.match }}</b><span v-if="etatOcc(e.id, o) === 'anon'" class="occ-pseudo">[{{ o.pseudo || scanPourRegle.regle.pseudos[0] }}]</span><span v-if="o.etat === 'incl'" class="occ-note" :title="o.inclusePar">(incluse)</span><span class="ctx">{{ o.apres }}</span>
                        </span>
                        <!-- 🚫 droit : disponible seulement si la case est cochée. -->
                        <button
                          v-if="o.etat !== 'incl' && estCochee(e.id, o)"
                          class="occ-exc-btn"
                          :disabled="!occurrenceEditable(e.id, o)"
                          title="Marquer comme exception (ne pas anonymiser)"
                          @click.stop="demanderException(e.id, o)"
                        >🚫</button>
                        <button class="pseudo-ouvrir" :aria-label="`Ouvrir l’entretien à l’occurrence ${o.match}`" title="Ouvrir cet entretien à cette occurrence" @click.stop="ouvrirOccurrence(e.id, o.from)">↗</button>
                      </div>
                    </div>
                  </li>
                </ul>
                <div class="pseudo-actions">
                  <button
                    class="pseudo-appliquer"
                    :disabled="!occurrenceEditable('') || !aDesChangements"
                    :title="!pseudonymisationLigneEditable('') ? 'Modification des entretiens indisponible' : 'Enregistre les changements cochés : poses, retraits et exceptions'"
                    @click="valider"
                  >{{ validationEnCours ? 'Validation…' : 'Valider' }}</button>
                  <button :disabled="validationEnCours || !aDesChangements" @click="abandonner">Abandonner</button>
                </div>
              </template>
            </div>
          </template>
      </section>
      <SuppressionRegleAnon v-if="suppression" :regle="suppression" :disponible="suppressionDisponible && !erreurSuiviSuppression" :contexte="revisionCorpus" :fournisseur="fournisseurCourant" :suivi="suiviSuppression" @fermer="suppression = null" @activite="suppressionEnCours = $event" @partiel="memoriserSuiviSuppression" @termine="apresSuppression" />
      <DissociationRegleAnon v-if="dissociation" :regle="dissociation" :disponible="dissociationDisponible" :fournisseur="fournisseurCourant" :suivi="suiviDissociation" @fermer="dissociation = null" @activite="dissociationEnCours = $event" @partiel="suiviDissociation = $event" @termine="apresDissociation" />
      <EditionPseudosAnon v-if="ajoutVariante" :regle="ajoutVariante" :ajout-disponible="ajoutVarianteDisponible" :renommage-disponible="renommageDisponible" :retrait-disponible="retraitVarianteDisponible" :contexte="revisionCorpus" @fermer="ajoutVariante = null" @activite="ajoutVarianteEnCours = $event" @termine="apresAjoutVariante" @renommer="renommerDepuisEdition" @retirer="retirerDepuisEdition" />
      <RetraitVarianteAnon v-if="retraitVariante" :demande="retraitVariante" :disponible="retraitVarianteDisponible" :contexte="revisionCorpus" :fournisseur="fournisseurCourant" :suivi="suiviRetraitVariante" @fermer="retraitVariante = null" @activite="retraitVarianteEnCours = $event" @partiel="memoriserSuiviRetraitVariante" @termine="apresRetraitVariante" />
      <RenommageVarianteAnon v-if="renommage" :regle="renommage.regle" :ancien-pseudo="renommage.pseudo" :nouveau-pseudo="renommage.nouveau" :disponible="renommageDisponible" :fournisseur="fournisseurCourant ?? 'local'" @fermer="renommage = null" @activite="renommageEnCours = $event" @termine="apresRenommage" />
      <EchangesCorrespondances v-if="echangesMode" :mode="echangesMode" :import-disponible="creationDisponible" @fermer="echangesMode = null" @activite="echangesEnCours = $event" @importe="apresImport" />
      <FormulaireRegleAnon v-if="creationOuverte" :categories="thematiquesListe" :en-cours="creationEnCours" :erreur="erreurCreation" @creer="creerDefinition" @fermer="creationOuverte = false" />
      <div v-if="gardeOuverte" class="garde-fond" role="dialog" aria-modal="true" aria-labelledby="garde-anon-titre">
        <div class="garde-dialogue">
          <h3 id="garde-anon-titre">Changements non validés</h3>
          <p>Validez ou abandonnez les changements avant de quitter la pseudonymisation.</p>
          <div class="garde-actions">
            <button class="pseudo-appliquer" @click="choisirGarde('valider')">Valider</button>
            <button @click="choisirGarde('abandonner')">Abandonner</button>
            <button @click="choisirGarde('rester')">Rester</button>
          </div>
        </div>
      </div>
</template>

<style scoped>
.pseudo-panneau {
  background: #fff;
  border-radius: 8px;
  padding: 1rem 1.2rem;
  /* Le cadre s'arrête au bas de la fenêtre ; ses deux colonnes défilent indépendamment. */
  box-sizing: border-box;
  width: 100%;
  height: var(--hauteur-disponible, calc(100dvh - 270px));
  min-height: 22rem;
  border: 1px solid #e0e0ea;
}
/* Grille 2×2 : ligne 1 = en-tête sur toute la largeur ; ligne 2 = les deux
 * colonnes, chacune avec son propre défilement (minmax(0, 1fr) obligatoire
 * pour que le contenu long ne force pas la hauteur du panneau). */
.pseudo-deux-col {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: var(--pseudo-gauche-w, 520px) 8px minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
}
.pseudo-haut { grid-column: 1 / -1; grid-row: 1; }
.pseudo-vide { grid-column: 1 / -1; grid-row: 2; }
.pseudo-gauche {
  box-sizing: border-box;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  /* Placement explicite : les deux colonnes sous l'en-tête (ligne 2),
   * sinon l'auto-placement de la grille les répartirait autrement. */
  grid-column: 1;
  grid-row: 2;
}
/* La table seule défile : recherche + compteur restent visibles. */
.pseudo-table-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.pseudo-droite {
  box-sizing: border-box;
  min-width: 0;
  padding-left: 1rem;
  min-height: 0;
  overflow-y: auto;
  grid-column: 3;
  grid-row: 2;
}
.pseudo-droite-vide {
  color: #999;
  font-size: 0.85rem;
  padding: 1rem 0;
}
.pseudo-detail-tete {
  font-size: 0.95rem;
  display: flex;
  gap: 0.6rem;
  align-items: baseline;
  border-bottom: 1px solid #eee;
  padding-bottom: 0.4rem;
}
.pseudo-detail-pseudos {
  color: #888;
  font-size: 0.8rem;
}
.pseudo-message {
  font-size: 0.82rem;
  color: #2e7d32;
  margin: 0.2rem 0 0;
}
/* Liste d'accordéons : elle coule dans la colonne droite (défilement porté
 * par .pseudo-droite), les actions restent collées en bas. */
.pseudo-ent-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.pseudo-ent {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid #eee;
  border-radius: 5px;
  padding: 0.3rem 0.5rem;
}
.pseudo-ent-titre {
  flex: 1;
  font-size: 0.82rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pseudo-ent-cpt {
  display: flex;
  gap: 0.3rem;
  font-size: 0.72rem;
}
/* Recherche d'entité dans la table des règles. */
.pseudo-recherche {
  width: 100%;
  padding: 0.3rem 0.5rem;
  border: 1px solid #d0d0d8;
  border-radius: 6px;
  margin-bottom: 0.4rem;
  font-size: 0.82rem;
}
/* Compteur « N / M règle(s) » sous la recherche. */
.pseudo-compteur {
  font-size: 0.75rem;
  color: #888;
  margin-bottom: 0.4rem;
  white-space: nowrap;
}
/* Pastille d'état d'une règle : ✓ tout traité / ! à traiter. */
.pseudo-table .etat { text-align: center; }
.pastille {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.15rem;
  height: 1.15rem;
  border-radius: 50%;
  font-size: 0.72rem;
  font-weight: bold;
  color: #fff;
}
.pastille.ok { background: #558b2f; }
.pastille.todo { background: #f57c00; }
.sup-incl {
  color: #999;
  font-style: italic;
  margin-left: 1px;
  cursor: help;
}

/* Accordéons par entretien : fond vert = tout traité, orange = à traiter ;
 * badges ronds aux couleurs des états. */
.acc { border-bottom: 1px solid #eee; }
.acc-tete {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 0.5rem;
  cursor: pointer;
  user-select: none;
}
.acc-ok .acc-tete { background: #f1f8e9; }
.acc-todo .acc-tete { background: #fff3e0; }
.acc-titre {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.acc-titre { border: none; background: transparent; text-align: left; cursor: pointer; font-size: inherit; font-family: inherit; }
.acc-ok .acc-titre { color: #558b2f; }
.acc-todo .acc-titre { color: #f57c00; }
.acc-badges {
  display: inline-flex;
  gap: 0.25rem;
  align-items: center;
  flex-shrink: 0;
}
.badge-rond {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.2rem;
  height: 1.2rem;
  border-radius: 50%;
  font-size: 0.68rem;
  font-weight: bold;
  color: #fff;
}
.badge-rond.ok { background: #15c095; }
.badge-rond.exc { background: #555; }
.badge-rond.todo { background: #ff9800; }
.badge-rond sup { font-size: 0.56rem; margin-left: 1px; }
.acc-fleche {
  font-size: 0.7rem;
  color: #666;
  transition: transform 0.2s;
  flex-shrink: 0;
}
.acc-fleche.ouvert { transform: rotate(180deg); }

/* Occurrences détaillées : forme ARBORESCENTE (décalage sous l'entretien),
 * contexte avant/après gris, match en gras. Les états suivent les
 * modifications locales jusqu'à « Valider ». */
.occ-list {
  background: #fafafa;
  padding: 0.4rem 0.6rem;
  margin-left: 1.75rem; /* décalage arborescent : passages ⊂ entretien */
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.occ {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  font-size: 0.78rem;
}
.occ-texte { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.occ-texte b { font-weight: bold; }
.ctx { color: #999; }
.occ-incl .ctx, .occ-exc .ctx { color: #bbb; }
.occ-incl b, .occ-exc b { font-weight: normal; color: #888; }
.occ-pseudo { color: #1565c0; }
/* Exception (active ou demandée) : fond gris clair arrondi. */
.occ.occ-exc { background: #f5f5f5; border-radius: 4px; }
/* Icône 🚫 à gauche : clic = RETIRER l'exception. */
.occ-exc-toggle {
  flex-shrink: 0;
  font-size: 0.85rem;
  line-height: 1;
  cursor: pointer;
  border: none;
  background: transparent;
  padding: 0;
}
.occ-exc-toggle.verrouille { cursor: not-allowed; opacity: .45; }
/* Bouton 🚫 à droite : marque l'exception (visible si la case est cochée). */
.occ-exc-btn {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0 0.15rem;
  opacity: 0.45;
  flex-shrink: 0;
}
.occ-exc-btn:hover { opacity: 1; }
/* Note « (incluse) » d'une occurrence absorbée. */
.occ-note {
  color: #9e9e9e;
  font-style: italic;
  font-size: 0.72em;
}

.pseudo-cpt.anon { color: #15c095; font-weight: 600; }
.pseudo-cpt.exc { color: #555; }
.pseudo-cpt.non { color: #ff9800; font-weight: 600; }
.pseudo-cpt.incl { color: #999; font-style: italic; }
.pseudo-cpt.verrou { color: #555; font-weight: 600; }
.pseudo-ouvrir {
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0.1rem 0.35rem;
}
.pseudo-actions {
  display: flex;
  justify-content: flex-end;
  /* Les actions restent accessibles pendant le défilement du détail. */
  position: sticky;
  bottom: 0;
  background: #fff;
  padding: 0.5rem 0 0.75rem;
  border-top: 1px solid #eee;
}
.pseudo-appliquer:disabled { background: #eee; color: #777; border-color: #ccc; cursor: not-allowed; }
.pseudo-appliquer {
  border: 1px solid #1565c0;
  background: #2e73d8;
  color: #fff;
  border-radius: 5px;
  cursor: pointer;
  padding: 0.4rem 0.8rem;
  font-size: 0.82rem;
}
.loupe {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.9rem;
}
/* Sélecteur compact de thématique dans la colonne des actions. */
.cat-select {
  font-size: 0.72rem;
  border: 1px solid #ccc;
  border-radius: 999px;
  padding: 0.05rem 0.25rem;
  background: #fff;
  cursor: pointer;
}
.cell-actions { white-space: nowrap; }
/* Couleur des LIGNES de règles : vert = tout traité (anonymisé ou exception),
 * orange = il reste des occurrences à anonymiser. */
.pseudo-table tr.ok { background: #e8f5e9; }
.pseudo-table tr.todo { background: #fff3e0; }
.pseudo-table tr.sel { outline: 2px solid #1565c0; outline-offset: -2px; }
.pseudo-tete {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
  /* En-tête sur toute la largeur, au-dessus des deux colonnes. */
  grid-column: 1 / -1;
  grid-row: 1;
}
.pseudo-outils-regles { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: .4rem; margin-left: auto; }
.pseudo-params {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.82rem;
  border: 1px solid #eee;
  border-radius: 6px;
  background: #fafafa;
  padding: 0.6rem 0.8rem;
  margin-bottom: 0.75rem;
}
.pseudo-params label {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  cursor: pointer;
}
.pseudo-params-bloc {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding-left: 0.9rem; /* retrait du contenu sous son titre */
}
.pseudo-params-hint {
  margin: 0.15rem 0 0;
  color: #999;
  font-size: 0.75rem;
}
.pseudo-params-titre { margin-top: 0.35rem; }
.pseudo-params-liste {
  padding: 0.3rem 0.5rem;
  border: 1px solid #d0d0d8;
  border-radius: 6px;
  font-size: 0.82rem;
}
.pseudo-intro { margin-bottom: .7rem; }
.pseudo-vide { color: #666; font-size: 0.9rem; }
.pseudo-hint { color: #999; font-size: 0.78rem; margin-top: 0.4rem; }
.pseudo-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.pseudo-table th, .pseudo-table td {
  border: 1px solid #e0e0e0;
  padding: 0.3rem 0.6rem;
  text-align: center;
}
/* En-tête épinglé en haut du défilement de la table (th sticky). */
.pseudo-table th {
  background: #f3f6fa;
  position: sticky;
  top: 0;
  z-index: 1;
}
/* Entité : les groupes d'alias longs enroulent au lieu de comprimer les
 * compteurs ; Pseudo garde une largeur minimale lisible. */
.pseudo-table .cell-entite { overflow-wrap: anywhere; }
.pseudo-table .cell-pseudo { min-width: 120px; }
.pseudo-table .num { text-align: right; font-variant-numeric: tabular-nums; }
/* Palette : vert = anonymisé, gris = exception, orange = à traiter (mêmes
 * couleurs que les badges ronds du panneau entretien). */
.pseudo-table .anon { color: #15c095; font-weight: 600; }
.pseudo-table .exc { color: #555; font-weight: 600; }
.pseudo-table .non { color: #ff9800; font-weight: 600; }
.pseudo-separateur { grid-column: 2; grid-row: 2; cursor: col-resize; background: #e8edf5; border-radius: 5px; touch-action: none; }
.pseudo-separateur:focus { outline: 2px solid #1565c0; }
.pseudo-deux-col.vertical { display: flex; flex-direction: column; height: auto; min-height: 620px; }
.vertical .pseudo-gauche, .vertical .pseudo-droite { width: 100%; min-height: 280px; }
.vertical .pseudo-droite { padding: .5rem 0; }
.vertical .pseudo-gauche { height: 380px; flex: none; }
.vertical .pseudo-droite { max-height: 480px; }
.pseudo-tete { flex-wrap: wrap; gap: .5rem; }
.ajouter-regle { border: 1px solid #1565c0; border-radius: 5px; background: white; padding: .3rem .55rem; cursor: pointer; }
.ajouter-regle:disabled { border-color: #bbb; color: #888; cursor: not-allowed; }
.actualiser-pseudo { border: 1px solid #bbb; border-radius: 5px; background: #fff; padding: .3rem .55rem; cursor: pointer; }
.pseudo-erreur { color: #b3261e; font-size: .82rem; }
.pseudo-premiere-erreur { text-align: center; }
.pseudo-premiere-erreur p { color: #b3261e; }
.pseudo-filtres { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; margin-bottom: .4rem; }
.pseudo-filtres select { min-width: 0; max-width: 100%; padding: .3rem; }
.garde-fond { position: fixed; inset: 0; z-index: 200; display: grid; place-items: center; background: rgba(0,0,0,.35); }
.garde-dialogue { width: min(440px, 90vw); background: white; border-radius: 8px; padding: 1rem; box-shadow: 0 8px 30px rgba(0,0,0,.3); }
.garde-dialogue h3 { margin-top: 0; }
.garde-actions { display: flex; justify-content: flex-end; gap: .5rem; }
.garde-actions button { border: 1px solid #bbb; border-radius: 5px; padding: .4rem .7rem; cursor: pointer; }

</style>
