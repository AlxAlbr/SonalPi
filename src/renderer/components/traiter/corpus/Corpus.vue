<script setup lang="ts">
import { ref, computed, watch, watchEffect, nextTick, onMounted, onUnmounted } from 'vue'
import AjoutEntretien from './AjoutEntretien.vue'
import EditionThemes from '../partages/themes/EditionThemes.vue'
import MenuTheme from '../partages/themes/MenuTheme.vue'
import PseudonymisationCorpus from './PseudonymisationCorpus.vue'
import ThemesOpsCorpus from './ThemesOpsCorpus.vue'
import { operationGlobaleEnCours } from '../../../operationGlobaleCorpus'
import LocuteursCorpus from './LocuteursCorpus.vue'
import CadreOndeCorpus from './CadreOndeCorpus.vue'
import BandeResumeThematique from './BandeResumeThematique.vue'
import CurseurZoomListe from './CurseurZoomListe.vue'
import NotesCorpus from './NotesCorpus.vue'
import CommentairesCorpus from './CommentairesCorpus.vue'
import BarreOngletCorpus from './BarreOngletCorpus.vue'
import OngletsEspace from '../../app/OngletsEspace.vue'
import { vHauteurDisponible } from '../../../directives/hauteurDisponible'
import type { OngletCorpus } from '../../../composables/espaces'
import TableDonnees from '../partages/donnees/TableDonnees.vue'
import { utiliserSonal } from '../../../composables/sonal'
import { rechercherDansCorpsTexte, transcriptAvecOccurrences } from '../../../editor/rechercheCorpus'
import { visiblesThemes } from '../../../../shared/corpus/categories'
import type { EtatVerrouPublic } from '../../../../shared/distant'
import type { OccurenceRecherche, ResultatRecherche, SegmentTranscript } from '../../../editor/rechercheCorpus'
// Icônes des onglets, partagées avec la vue Entretien.
import icoThemes from '../../../assets/icones/themes.png'
import icoDonnees from '../../../assets/icones/tableau.svg'
import icoAnon from '../../../assets/icones/anon.png'
// Icônes des onglets, spécifiques au Corpus.
import icoEntretiens from '../../../assets/icones/entretiens.svg'
import icoPersonnes from '../../../assets/icones/personnes.png'
import icoNotes from '../../../assets/icones/notes.png'
import icoRecherche from '../../../assets/icones/recherche.png'
import icoCommentaires from '../../../assets/icones/commentaires.svg'

const {
  vue,
  ongletCorpus,
  enregistrerNavigationCorpus,
  revisionCorpus,
  demandeDissociationAnon,
  enregistrerNavigationParcours,
  selectionnerParcours,
  // thèmes (codebook corpus) — CONSULTATION ; l'édition passe par la modale (crayon)
  codebook,
  usages,
  couleurHex,
  arbreThemes,
  modifierTheme,
  resumes,
  ouvrirAuSegment,
  // entretiens (membership) + sélection Corpus.
  membership,
  corpusSelId,
  corpusSelMeta,
  selectionnerCorpus,
  deselectionnerCorpus,
  ouvrirEntretien,
  renommer,
  entretienASupprimer,
  demanderSuppressionEntretien,
  confirmerSuppressionEntretien,
  rafraichirMatrice,
  listeEntretiens,
  // audio.
  urlWaveform,
  assignerAudioSelection,
  ouvrirDesignationAudio,
  // audio : détacher / remplacer / assigner un SRT (panneau métadonnées)
  effacerAudioSelection,
  demanderSrt,
  confirmerSrt,
  srtASurEcrire,
  srtMessage,
  // Intégrité : audios référencés introuvables (fichier déplacé/supprimé)
  audiosManquants,
  // démo pas-à-pas.
  pasAPas,
  // Corpus distant : synchro (barre haute) + lecture seule (grisage)
  idDistantCourant,
  derniereSynchro,
  tirageEnCours,
  actualiserDistant,
  lectureSeule,
  ajoutEntretienPossible,
  verrousIndisponibles,
  // Badges de verrou fiables (état « tenu par X » venant du serveur)
  badgeVerrou,
  gesteDisponible,
  fournisseurCourant,
  metaEditables,
  designationMediaPossible,
  renommagePossible,
  suppressionPossible,
  presencesSur,
} = utiliserSonal()

// Le bandeau des médias introuvables peut être fermé ;
// il revient si la liste des fichiers manquants change.
const bandeauAudioMasquePour = ref<string | null>(null)
const cleAudiosManquants = computed(() => Object.keys(audiosManquants.value).sort().join('|'))
const bandeauAudioVisible = computed(() =>
  cleAudiosManquants.value !== '' && cleAudiosManquants.value !== bandeauAudioMasquePour.value)
function masquerBandeauAudio() {
  bandeauAudioMasquePour.value = cleAudiosManquants.value
}

/** Densité d'affichage de la liste des entretiens, mémorisée sur ce poste. */
/** Le curseur « Zoom » est continu, du plus serré (0, à gauche) au plus aéré (2, à droite, par défaut).
 *  La disposition suit l'état le plus proche ;
 *  la hauteur des cartes et leur espacement glissent d'un état à l'autre.
 */
const DENSITES = ['tres-compact', 'compact', 'aere'] as const
const LIBELLES_DENSITE = ['Très compact', 'Compact', 'Aéré']
const HAUTEURS_CARTE = [22, 40, 67]
const ECARTS_CARTES = [2, 5, 8]
const ZOOM_MAX = DENSITES.length - 1
/** Le réglage est gardé dans le profil de l'utilisateur et repris au prochain démarrage. */
const zoom = ref(ZOOM_MAX)
/** Position donnée au curseur : le réglage repris du profil, pas chaque pas du glissement. */
const zoomInitial = ref(ZOOM_MAX)
window.sonal.profil.zoomEntretiens().then(
  (z) => { if (z !== null) zoom.value = zoomInitial.value = z },
  () => { /* Réglage facultatif : on garde l'affichage aéré. */ }
)
/** Enregistré au relâchement du curseur, pas à chaque pas du glissement. */
function memoriserZoom(): void {
  window.sonal.profil.memoriserZoomEntretiens(zoom.value).catch(() => { /* Réglage facultatif. */ })
}
const indiceDensite = computed(() => Math.round(zoom.value))
const densite = computed(() => DENSITES[indiceDensite.value])
/** Valeur interpolée entre les états voisins du zoom courant. */
function interpoler(valeurs: number[]): number {
  const bas = Math.min(Math.floor(zoom.value), ZOOM_MAX - 1)
  const t = zoom.value - bas
  return valeurs[bas] + (valeurs[bas + 1] - valeurs[bas]) * t
}
// La hauteur des cartes suit le curseur directement sur la liste.
// Seul un changement de disposition redessine l'écran Corpus.
const listeCartes = ref<HTMLElement | null>(null)
watchEffect(() => {
  const liste = listeCartes.value
  if (!liste) return
  liste.style.setProperty('--h-carte', interpoler(HAUTEURS_CARTE) + 'px')
  liste.style.setProperty('--ecart-cartes', interpoler(ECARTS_CARTES) + 'px')
}, { flush: 'post' })

/** Heure locale courte d'un horodatage ISO (« HH:MM »). */
const heureDe = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
/** Rappel du détenteur d'un entretien. Les baux GitLab ne disent pas l'heure
 *  d'acquisition : le « depuis » est alors omis plutôt qu'inventé. */
const detentionDe = (v: EtatVerrouPublic) =>
  `Verrou tenu par ${v.userId}${v.acquiredAt ? ` depuis ${heureDe(v.acquiredAt)}` : ''} — ouverture en lecture seule.`
/** Infobulle des champs du panneau méta : si l'entretien est tenu par autrui,
 *  on explique pourquoi tout est grisé (même vocabulaire que les badges 🔒). */
function titreChampMeta(id: string): string {
  const v = badgeVerrou(id)
  return v
    ? `Ouvert par ${v.userId} — lecture seule.`
    : 'lecture seule (corpus distant)'
}
/** Infobulle du bouton crayon/verrou d'une carte ;
 *  si l'entretien est tenu par autrui, le détail (qui ? depuis quand ?
 *  conséquence) ; sinon le geste normal. */
const titreCrayon = (id: string): string => {
  const v = badgeVerrou(id)
  return v ? detentionDe(v) : 'Ouvrir l’entretien pour le transcrire et le coder'
}
/** « Actualiser » : tire le miroir à la demande ;
 *  les erreurs crient, ce n'est pas la minuterie silencieuse. */
async function actualiser() {
  try {
    await actualiserDistant(false)
  } catch {
    /* l'échec criant est traité comme un pull doux raté pour l'instant :
       le badge horodaté reste sur la dernière synchro réussie */
  }
}

// La fenêtre d'édition des thèmes (crayon) — locale à la vue.
const editerThemes = ref(false)
// Menu contextuel d'un THÈME (actif ↔ passif sans ouvrir l'édition),
// sur la consultation du Corpus comme sur le panneau Entretien.
const menuTheme = ref<{ id: string; nom: string; x: number; y: number; actif: boolean } | null>(null)
const descriptionsThemesOuvertes = ref<Set<string>>(new Set())
/** Ouvre le menu au clic droit sur un thème (masqué en lecture seule). */
function ouvrirMenuTheme(cat: { id: string; nom: string; actif: boolean }, evt: MouseEvent) {
  if (lectureSeule.value) return
  menuTheme.value = { id: cat.id, nom: cat.nom, x: evt.clientX, y: evt.clientY, actif: cat.actif }
}
/** Bascule actif → passif (ou l'inverse), puis ferme le menu. */
function basculerActifTheme() {
  const m = menuTheme.value
  if (m) modifierTheme(m.id, { actif: !m.actif })
  menuTheme.value = null
}
// Repli des sous-thèmes dans la consultation : état de VUE local,
// jamais persisté, indépendant par écran ;
// les catégories repliées restent visibles.
const repliesThemes = ref<Set<string>>(new Set())
const arbreVisible = computed(() => visiblesThemes(arbreThemes(), repliesThemes.value))
const idsDescriptionsThemes = computed(() => arbreThemes().filter((n) => n.cat.description).map((n) => n.cat.id))
const toutesDescriptionsThemesOuvertes = computed(() =>
  idsDescriptionsThemes.value.length > 0
  && idsDescriptionsThemes.value.every((id) => descriptionsThemesOuvertes.value.has(id)),
)
function basculerRepli(id: string) {
  const s = new Set(repliesThemes.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  repliesThemes.value = s
}
function basculerDescriptionTheme(id: string) {
  const ouvertes = new Set(descriptionsThemesOuvertes.value)
  if (ouvertes.has(id)) ouvertes.delete(id)
  else ouvertes.add(id)
  descriptionsThemesOuvertes.value = ouvertes
}
function basculerToutesDescriptionsThemes() {
  descriptionsThemesOuvertes.value = toutesDescriptionsThemesOuvertes.value
    ? new Set()
    : new Set(idsDescriptionsThemes.value)
}

const pseudonymisation = ref<InstanceType<typeof PseudonymisationCorpus> | null>(null)
watch(() => demandeDissociationAnon?.value, (demande) => { if (demande) void choisirOnglet('anon') }, { flush: 'post' })

async function choisirOnglet(onglet: OngletCorpus): Promise<boolean> {
  const revision = revisionCorpus.value
  if (ongletCorpus.value === 'anon' && onglet !== 'anon' && !(await pseudonymisation.value?.autoriserSortie())) return false
  if (revision !== revisionCorpus.value) return false
  if (ongletCorpus.value === onglet) return true
  transcript.value = null
  ongletCorpus.value = onglet
  if (onglet === 'donnees') await rafraichirMatrice()
  return true
}
// Dès que le corpus contient un entretien, l'un d'eux est sélectionné et sa fiche affichée :
// le premier à l'ouverture, puis celui choisi, jusqu'à sa suppression.
watch(
  () => [vue.value, ongletCorpus.value, corpusSelId.value, listeEntretiens().map((e) => e.id).join('\n')],
  () => {
    if (vue.value !== 'corpus' || (ongletCorpus.value !== 'accueil' && ongletCorpus.value !== 'recherche')) return
    const ids = listeEntretiens().map((e) => e.id)
    if (!ids.length) {
      if (corpusSelId.value) deselectionnerCorpus()
    } else if (!corpusSelId.value || !ids.includes(corpusSelId.value)) {
      void selectionnerCorpus(ids[0])
    }
  },
  { immediate: true },
)
/** Clavier sur la liste : les flèches, Début et Fin changent d'entretien ; Entrée ouvre celui sélectionné. */
async function naviguerListe(event: KeyboardEvent, id: string) {
  // Les boutons de la carte gardent leur propre comportement.
  if (event.target !== event.currentTarget) return
  const ids = listeEntretiens().map((e) => e.id)
  const position = ids.indexOf(id)
  let cible: string | undefined
  if (event.key === 'ArrowDown') cible = ids[Math.min(position + 1, ids.length - 1)]
  else if (event.key === 'ArrowUp') cible = ids[Math.max(position - 1, 0)]
  else if (event.key === 'Home') cible = ids[0]
  else if (event.key === 'End') cible = ids[ids.length - 1]
  else if (event.key === 'Enter') {
    event.preventDefault()
    ouvrirEntretien(id)
    return
  } else return
  event.preventDefault()
  if (!cible || cible === id) return
  void selectionnerCorpus(cible)
  await nextTick()
  document.querySelector<HTMLElement>(`.carte-ent[data-entretien-id="${CSS.escape(cible)}"]`)?.focus()
}
// Le passage au pas à pas revient à l'Accueil du corpus.
watch(pasAPas, (actif) => {
  if (actif) void choisirOnglet('accueil')
})

async function afficherParcours(
  parcoursId?: import('../../../../shared/format').ParcoursId,
): Promise<boolean> {
  if (parcoursId) selectionnerParcours(parcoursId)
  await choisirOnglet('accueil')
  if (ongletCorpus.value !== 'accueil') return false
  transcript.value = null
  await nextTick()
  const resumeParcours = document.querySelector<HTMLElement>('[data-testid="resume-parcours-global"]')
  resumeParcours?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  resumeParcours?.focus({ preventScroll: true })
  return true
}

// Recherche plein texte du corpus, accessible au clavier.
const champRecherche = ref<HTMLInputElement | null>(null)
let ongletAvantRecherche: OngletCorpus = 'accueil'
async function ouvrirRecherche() {
  const precedent = ongletCorpus.value
  await choisirOnglet('recherche')
  if (ongletCorpus.value !== 'recherche') return
  if (precedent !== 'recherche') ongletAvantRecherche = precedent
  await nextTick()
  champRecherche.value?.focus()
  champRecherche.value?.select()
}
function fermerRecherche() {
  // Les marqueurs du mur d'ondes suivent la recherche : on les retire à la fermeture.
  resultats.value = []
  message.value = ''
  transcript.value = null
  void choisirOnglet(ongletAvantRecherche)
}
function raccourciRecherche(event: KeyboardEvent) {
  if (vue.value !== 'corpus' || event.defaultPrevented) return
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    void ouvrirRecherche()
  } else if (event.key === 'Escape' && ongletCorpus.value === 'recherche') {
    event.preventDefault()
    fermerRecherche()
  }
}
let arreterNavigationParcours: (() => void) | null = null
let arreterNavigationCorpus: (() => void) | null = null
onMounted(() => {
  if (demandeDissociationAnon?.value) void choisirOnglet('anon')
  window.addEventListener('keydown', raccourciRecherche)
  arreterNavigationParcours = enregistrerNavigationParcours(afficherParcours)
  arreterNavigationCorpus = enregistrerNavigationCorpus(choisirOnglet)
})
onUnmounted(() => {
  window.removeEventListener('keydown', raccourciRecherche)
  arreterNavigationParcours?.()
  arreterNavigationCorpus?.()
})
const requete = ref('')
const motEntier = ref(false)
const resultats = ref<ResultatRecherche[]>([])
const enCours = ref(false)
const message = ref('')
/** Marqueurs de recherche sur le « mur » d'ondes, par entretien.
 *  Un clic sur un marqueur déplie le transcript sous la carte de l'entretien. */
const marqueursRecherche = computed(() => {
  const out: Record<string, Array<OccurenceRecherche>> = {}
  for (const r of resultats.value) out[r.id] = r.occurrences
  return out
})
// Textes lus pendant la recherche, réutilisés pour déplier un transcript sans relire le disque.
const corpsLus = new Map<string, unknown>()
const requeteLancee = ref('')
let motEntierLance = false

/** Transcript déplié sous une carte, avec l'occurrence choisie mise en avant. */
const transcript = ref<{ id: string; pos: number; paragraphes: SegmentTranscript[][] } | null>(null)
const cadreTranscript = ref<HTMLElement | null>(null)
// Le transcript est rendu dans la boucle des cartes : on garde l'élément par une fonction.
function poserCadreTranscript(el: unknown) {
  cadreTranscript.value = el instanceof HTMLElement ? el : null
}
const occurrencesTranscript = computed(() =>
  transcript.value ? (marqueursRecherche.value[transcript.value.id] ?? []).map((o) => o.pos) : [])
const rangTranscript = computed(() =>
  transcript.value ? occurrencesTranscript.value.indexOf(transcript.value.pos) : -1)

async function afficherTranscript(id: string, pos: number) {
  if (transcript.value?.id === id) {
    transcript.value.pos = pos
  } else {
    let corps = corpsLus.get(id)
    if (corps === undefined) {
      const lecture = await window.sonal.corpus.lireEntretien(id)
      if (!lecture.ok) return
      corps = lecture.data.corpsTexte
      corpsLus.set(id, corps)
    }
    transcript.value = {
      id,
      pos,
      paragraphes: transcriptAvecOccurrences(corps, requeteLancee.value, { motEntier: motEntierLance }),
    }
    if (corpusSelId.value !== id) void selectionnerCorpus(id)
  }
  await nextTick()
  centrerOccurrence()
}
/** Fait défiler le transcript jusqu'à l'occurrence choisie, et la page jusqu'au transcript. */
function centrerOccurrence() {
  const cadre = cadreTranscript.value
  const marque = cadre?.querySelector<HTMLElement>('mark.courante')
  if (!cadre || !marque) return
  cadre.scrollTop = marque.offsetTop - cadre.clientHeight / 2
  cadre.closest('li')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}
function occurrenceVoisine(sens: 1 | -1) {
  const liste = occurrencesTranscript.value
  if (!transcript.value || !liste.length) return
  const rang = (rangTranscript.value + sens + liste.length) % liste.length
  void afficherTranscript(transcript.value.id, liste[rang])
}

/** Lance la recherche : lit chaque entretien et extrait ses occurrences,
 *  avec leur contexte et leur position, groupées par entretien. */
async function lancerRecherche() {
  const q = requete.value.trim()
  if (!q) return
  message.value = ''
  enCours.value = true
  resultats.value = []
  transcript.value = null
  corpsLus.clear()
  requeteLancee.value = q
  motEntierLance = motEntier.value
  try {
    const res: ResultatRecherche[] = []
    for (const e of listeEntretiens()) {
      const lecture = await window.sonal.corpus.lireEntretien(e.id)
      if (!lecture.ok) continue
      const occurrences = rechercherDansCorpsTexte(lecture.data.corpsTexte, q, { motEntier: motEntier.value })
      if (occurrences.length) {
        res.push({ id: e.id, titre: e.titre, occurrences })
        corpsLus.set(e.id, lecture.data.corpsTexte)
      }
    }
    resultats.value = res
    const nb = res.reduce((n, r) => n + r.occurrences.length, 0)
    message.value = nb
      ? `${nb} occurrence${nb > 1 ? 's' : ''} dans ${res.length} entretien${res.length > 1 ? 's' : ''}`
      : 'Aucune occurrence trouvée.'
  } finally {
    enCours.value = false
  }
}
function effacerRecherche() {
  requete.value = ''
  resultats.value = []
  message.value = ''
  transcript.value = null
}
/** Onglets du corpus, dans l'ordre d'affichage ; « accueil » est l'onglet Entretiens. */
const ONGLETS: { id: OngletCorpus; libelle: string; icone: string }[] = [
  { id: 'accueil', libelle: 'Entretiens', icone: icoEntretiens },
  { id: 'locuteurs', libelle: 'Locuteurs', icone: icoPersonnes },
  { id: 'donnees', libelle: 'Données', icone: icoDonnees },
  { id: 'anon', libelle: 'Pseudonymisation', icone: icoAnon },
  { id: 'themes', libelle: 'Thèmes', icone: icoThemes },
  { id: 'commentaires', libelle: 'Commentaires', icone: icoCommentaires },
  { id: 'notes', libelle: 'Notes', icone: icoNotes },
]

</script>

<template>
    <section class="ecran corpus-ecran">
      <!-- Corpus distant : horodatage du dernier pull + « Actualiser ».
           Le pull rafraîchit aussi les badges de verrou. -->
      <div v-if="idDistantCourant" class="corpus-barre">
        <span class="synchro-zone">
          <span class="dernier-tirage" title="Copie locale synchronisée avec le serveur">
            ☁ dernière synchro {{ heureDe(derniereSynchro) }}
          </span>
          <!-- Aucun badge affiché ne signifie RIEN quand l'observation a échoué :
               l'interface le dit, et l'ouverture d'un entretien reste vérifiée
               par le verrou du serveur. -->
          <span
            v-if="verrousIndisponibles"
            class="verrous-indispo"
            title="Impossible de savoir qui tient un entretien (serveur injoignable ou droits insuffisants). Ouvrir un entretien vérifiera lui-même s'il est tenu."
          >🔒 détenteurs : indisponible</span>
          <button class="btn-table" :disabled="tirageEnCours" @click="actualiser">
            {{ tirageEnCours ? '…' : '⟳ Actualiser' }}
          </button>
        </span>
      </div>

      <!-- Onglets du corpus ; le renommage se fait depuis le menu Corpus. -->
      <div class="ligne-onglets-corpus">
        <OngletsEspace class="onglets-corpus" aria-label="Navigation du corpus" :onglets="ONGLETS" :actif="ongletCorpus" @choisir="choisirOnglet" />
        <span class="fin-ligne-onglets" aria-hidden="true"></span>
      </div>
      <!-- Les messages du parcours disposent toujours d'une cible dans la vue Corpus. -->
      <div v-if="pasAPas" data-tour="ancre-guide-corpus"></div>

      <BarreOngletCorpus
        v-if="ongletCorpus === 'themes'"
        titre="Thèmes"
        aide="Le codebook du corpus. Le codage se fait dans les entretiens ; ici, on réorganise les codages."
      >
        <button v-if="!lectureSeule" class="editer-themes" :disabled="operationGlobaleEnCours" @click="editerThemes = true">✏️ Éditer les thèmes</button>
      </BarreOngletCorpus>

      <BarreOngletCorpus
        v-if="ongletCorpus === 'accueil' || ongletCorpus === 'recherche'"
        titre="Entretiens"
      >
        <label class="mini densite-liste" :title="'Densité de la liste : ' + LIBELLES_DENSITE[indiceDensite]">
          <span class="densite-libelle">Zoom</span>
          <CurseurZoomListe
            :valeur="zoomInitial"
            :max="ZOOM_MAX"
            aria-label="Densité de la liste des entretiens"
            :aria-valuetext="LIBELLES_DENSITE[indiceDensite]"
            @glisser="(valeur) => (zoom = valeur)"
            @relacher="memoriserZoom"
          />
        </label>
        <!-- La recherche remplace la fiche dans le panneau gauche, le temps de la consulter. -->
        <button
          class="ouvrir-recherche-corpus"
          :class="{ actif: ongletCorpus === 'recherche' }"
          :aria-pressed="ongletCorpus === 'recherche'"
          title="Rechercher dans tous les entretiens (Ctrl+F)"
          aria-label="Rechercher dans tous les entretiens"
          @click="ongletCorpus === 'recherche' ? fermerRecherche() : ouvrirRecherche()"
        >
          <img :src="icoRecherche" alt="" draggable="false" />
          <span>Rechercher</span>
        </button>
        <!-- Un seul point d'entrée : la modale à deux zones,
             couvrant import texte, texte+audio et audio seul.
             Masqué quand le fournisseur ne permet pas l'ajout. -->
        <AjoutEntretien v-if="ajoutEntretienPossible" />
      </BarreOngletCorpus>

      <div v-show="ongletCorpus !== 'anon' && ongletCorpus !== 'donnees' && ongletCorpus !== 'locuteurs' && ongletCorpus !== 'notes' && ongletCorpus !== 'commentaires'" class="grille-corpus" :class="{ 'atelier-actif': ongletCorpus === 'themes', 'sans-panneau': ongletCorpus === 'accueil' && !corpusSelId }">
        <!-- Colonne gauche : fiche de l'entretien, recherche ou codebook. -->
        <aside v-if="ongletCorpus !== 'accueil' || corpusSelId" class="colonne-g-corpus">
          <!-- Fiche de l'entretien sélectionné : il y en a toujours un dès que le corpus en contient.
               Réglages en haut, gestes qui retirent quelque chose en bas. -->
          <aside v-if="corpusSelId && ongletCorpus === 'accueil'" v-hauteur-disponible class="panneau meta-ent" aria-label="Fiche de l’entretien">
            <div class="corpus-tete">
              <h3>Fiche de l’entretien</h3>
            </div>
            <label class="champ-nom">
              <span class="champ-lbl">Nom</span>
              <input
                class="titre-meta"
                :value="membership[corpusSelId]?.titre"
                :disabled="!renommagePossible(corpusSelId)"
                :title="titreChampMeta(corpusSelId)"
                @change="renommer(corpusSelId, $event)"
              />
            </label>
            <ul v-if="corpusSelMeta" class="meta-infos">
              <li><span>Locuteurs</span><b>{{ corpusSelMeta.nbParticipations }}</b></li>
              <li><span>Valeurs saisies</span><b>{{ corpusSelMeta.nbValeurs }}</b></li>
              <li><span>Audio</span><b>{{ corpusSelMeta.audio ? 'lié' : '—' }}</b></li>
              <li><span>SRT</span><b>{{ corpusSelMeta.srt ? 'lié' : '—' }}</b></li>
            </ul>
            <p v-else class="vide">Lecture…</p>
            <div v-if="corpusSelMeta?.audio" class="audio-actions">
              <button class="mini assigner-audio" :disabled="!metaEditables(corpusSelId)" @click="assignerAudioSelection">
                Remplacer l'audio…
              </button>
            </div>
            <button v-else class="mini assigner-audio" :disabled="!metaEditables(corpusSelId)" @click="assignerAudioSelection">
              Assigner un audio…
            </button>
            <!-- Tant qu'aucun SRT n'est assigné, on peut en importer un ;
                 une confirmation précède le remplacement d'un texte existant. -->
            <button
              v-if="corpusSelMeta && !corpusSelMeta.srt"
              class="mini assigner-srt"
              :disabled="!metaEditables(corpusSelId)"
              :title="titreChampMeta(corpusSelId)"
              @click="demanderSrt"
            >Assigner un SRT…</button>
            <p v-if="srtMessage" class="srt-err">{{ srtMessage }}</p>
            <div v-if="srtASurEcrire" class="confirm-suppr srt-confirm">
              L'éditeur contient déjà du texte : assigner un SRT remplacera le contenu existant.
              <div class="confirm-actions">
                <button class="danger" @click="confirmerSrt">Remplacer le contenu</button>
                <button @click="srtASurEcrire = null">Annuler</button>
              </div>
            </div>
            <!-- La désignation d'un média existant est une capacité distincte.
                 GitLab la publie sous un bail d'entretien court. -->
            <button
              v-if="idDistantCourant && gesteDisponible('designationMedia') && corpusSelId"
              class="mini assigner-audio"
              :disabled="!designationMediaPossible(corpusSelId)"
              @click="ouvrirDesignationAudio(corpusSelId)"
            >
              {{ corpusSelMeta?.audio ? 'Redésigner' : 'Désigner' }}
              {{ fournisseurCourant === 'gitlab' ? 'dans la base WebDAV…' : 'dans le Nextcloud…' }}
            </button>
            <!-- Variables du corpus pour cet entretien, en lecture seule ;
                 la saisie passe par l'onglet Données. -->
            <div v-if="corpusSelMeta" class="meta-vars">
              <template v-if="corpusSelMeta.generales.length">
                <h4>Variables générales</h4>
                <div v-for="l in corpusSelMeta.generales" :key="l.id" class="ligne-var">
                  <span class="lbl-var" :title="l.lib">{{ l.lib }}</span>
                  <span class="val-var" :class="{ vide: !l.valeur }">{{ l.valeur ?? '—' }}</span>
                </div>
              </template>
              <div v-for="loc in corpusSelMeta.parParticipation" :key="loc.participationId !== null ? `id:${loc.participationId}` : `index:${loc.participationIndex}`" class="bloc-loc">
                <h4>{{ loc.nom }}</h4>
                <div v-for="l in loc.lignes" :key="l.id" class="ligne-var">
                  <span class="lbl-var" :title="l.lib">{{ l.lib }}</span>
                  <span class="val-var" :class="{ vide: !l.valeur }">{{ l.valeur ?? '—' }}</span>
                </div>
              </div>
            </div>
            <!-- Zone sensible : les gestes qui retirent quelque chose, séparés du reste. -->
            <div class="zone-sensible">
              <h4>Zone sensible</h4>
              <button
                v-if="corpusSelMeta?.audio"
                class="mini audio-effacer"
                :disabled="!metaEditables(corpusSelId)"
                :title="titreChampMeta(corpusSelId)"
                @click="effacerAudioSelection"
              >Effacer l'audio</button>
              <button
                class="mini suppr-meta"
                :disabled="!suppressionPossible(corpusSelId)"
                :title="titreChampMeta(corpusSelId)"
                @click="demanderSuppressionEntretien(corpusSelId)"
              >Supprimer cet entretien du corpus</button>
            <!-- Confirmation de suppression (acte destructif — mise en corbeille/,
                 même idiome de bannière que thèmes et locuteurs). -->
            <div v-if="entretienASupprimer" class="confirm-suppr">
              <p>
                Supprimer « {{ entretienASupprimer.titre }} » ? Ses fichiers internes sont archivés
                dans <b>corbeille/</b> et l'entretien disparaît de l'application. Le fichier audio
                externe éventuellement référencé n'est pas supprimé.
              </p>
              <p v-if="entretienASupprimer.impact.rattachementsCas">
                {{ entretienASupprimer.impact.rattachementsCas }} rattachement(s) manuel(s), dans
                {{ entretienASupprimer.impact.casAffectes }} cas, seront retirés. Les cas et leurs
                règles dynamiques seront conservés.
              </p>
              <p v-if="entretienASupprimer.impact.casReglesEntretien">
                {{ entretienASupprimer.impact.casReglesEntretien }} cas référencent cet entretien entier.
                Leurs règles seront conservées et signaleront cette source comme retirée du corpus.
              </p>
              <p v-if="entretienASupprimer.impact.passagesRecueils">
                {{ entretienASupprimer.impact.passagesRecueils }} passage(s), dans
                {{ entretienASupprimer.impact.recueilsAffectes }} recueil(s), resteront présents et
                seront signalés comme indisponibles.
              </p>
              <div class="confirm-actions">
                <button class="danger" @click="confirmerSuppressionEntretien">Supprimer</button>
                <button @click="entretienASupprimer = null">Annuler</button>
              </div>
            </div>
            </div>
          </aside>

          <aside v-if="ongletCorpus === 'themes'" v-hauteur-disponible class="panneau themes-corpus">
            <div class="corpus-tete">
              <h3>Codebook</h3>
              <button
                v-if="idsDescriptionsThemes.length"
                class="toutes-descriptions"
                :aria-label="toutesDescriptionsThemesOuvertes ? 'Masquer toutes les descriptions' : 'Afficher toutes les descriptions'"
                :aria-pressed="toutesDescriptionsThemesOuvertes"
                :title="toutesDescriptionsThemesOuvertes ? 'Masquer toutes les descriptions' : 'Afficher toutes les descriptions'"
                @click="basculerToutesDescriptionsThemes"
              ><span class="ico-info" aria-hidden="true"></span> tout</button>
            </div>
            <p v-if="codebook.length === 0" class="vide">Aucun thème — « Éditer les thèmes » pour en créer.</p>
            <ul class="liste-thm-lecture">
              <li
                v-for="n in arbreVisible"
                :key="n.cat.id"
                :class="{ inactif: !n.cat.actif }"
                :style="{ paddingLeft: n.profondeur * 1.1 + 'rem' }"
                @contextmenu.prevent="ouvrirMenuTheme(n.cat, $event)"
              >
                <button
                  v-if="n.aEnfants"
                  class="depliant"
                  :title="repliesThemes.has(n.cat.id) ? 'Replier les sous-thèmes' : 'Déplier les sous-thèmes'"
                  @click.stop="basculerRepli(n.cat.id)"
                >
                  {{ repliesThemes.has(n.cat.id) ? '▸' : '▾' }}
                </button>
                <span v-else class="depliant depliant-masque"></span>
                <span class="pastille" :style="{ background: couleurHex(n.cat) }"></span>
                <span class="nom-thm-lecture">{{ n.cat.nom }}</span>
                <button
                  v-if="n.cat.description"
                  class="info-theme"
                  :aria-label="descriptionsThemesOuvertes.has(n.cat.id) ? `Masquer la description de ${n.cat.nom}` : `Afficher la description de ${n.cat.nom}`"
                  :aria-expanded="descriptionsThemesOuvertes.has(n.cat.id)"
                  :title="descriptionsThemesOuvertes.has(n.cat.id) ? 'Masquer la description' : 'Afficher la description'"
                  @click="basculerDescriptionTheme(n.cat.id)"
                ><span class="ico-info" aria-hidden="true"></span></button>
                <span v-else class="info-theme info-theme-masque" aria-hidden="true"><span class="ico-info" aria-hidden="true"></span></span>
                <span class="usage" :title="`${usages[n.cat.id] ?? 0} codage(s)`">{{ usages[n.cat.id] ?? 0 }}</span>
                <p v-if="descriptionsThemesOuvertes.has(n.cat.id)" class="description-theme">{{ n.cat.description }}</p>
              </li>
            </ul>
          </aside>

          <!-- Recherche plein texte sur tous les entretiens : elle prend la place de la fiche.
               La fermer ramène la fiche de l'entretien sélectionné. -->
          <div v-else-if="ongletCorpus === 'recherche'" v-hauteur-disponible class="panneau recherche">
            <div class="corpus-tete">
              <h3>Recherche</h3>
              <button class="mini" title="Fermer la recherche (Échap)" aria-label="Fermer la recherche" @click="fermerRecherche">✕</button>
            </div>
            <p class="aide-thm">Cherche dans le texte de tous les entretiens (insensible à la casse).</p>
            <div class="barre-recherche">
              <input
                ref="champRecherche"
                class="req-recherche"
                aria-label="Rechercher dans le corpus"
                v-model="requete"
                placeholder="Rechercher…"
                @keyup.enter="lancerRecherche"
              />
              <button class="btn-rech" :disabled="!requete.trim() || enCours" @click="lancerRecherche">
                {{ enCours ? '…' : 'Rechercher' }}
              </button>
            </div>
            <label class="opt-recherche" :class="{ coche: motEntier }">
              <input type="checkbox" v-model="motEntier" @change="lancerRecherche" />
              <span class="opt-lib">Mot entier</span>
            </label>
            <p class="opt-info-texte">Mot entier : seuls les mots exacts comptent — « le » trouve « le », mais pas « parle ».</p>
            <p v-if="message" class="rech-info">{{ message }}</p>

            <ul v-if="resultats.length" class="liste-rech-crp">
              <li v-for="r in resultats" :key="r.id" class="ent-rech">
                <div class="titre-ent-rech">Entretien : <b>{{ r.titre }}</b>
                  <span class="nb-rech">{{ r.occurrences.length }}</span>
                </div>
                <ul class="occ-rech">
                  <li v-for="(o, i) in r.occurrences" :key="i">
                    <button
                      class="occ-rech-btn"
                      :class="{ actif: transcript?.id === r.id && transcript.pos === o.pos }"
                      title="Afficher ce passage dans le transcript, sous l’entretien"
                      @click="afficherTranscript(r.id, o.pos)"
                    >
                      <span class="pre">{{ o.pre }}</span>
                      <span class="match">{{ o.match }}</span>
                      <span class="post">{{ o.post }}</span>
                    </button>
                  </li>
                </ul>
              </li>
            </ul>
            <button v-if="resultats.length" class="effacer-rech" @click="effacerRecherche">✕ Effacer</button>
          </div>
        </aside>

        <ThemesOpsCorpus v-show="ongletCorpus === 'themes'" :actif="ongletCorpus === 'themes'" />

        <!-- Liste des entretiens ; la fiche de l'entretien sélectionné est dans le panneau gauche. -->
        <section v-show="ongletCorpus !== 'themes'" class="colonne-d-corpus">
          <div class="liste-entretiens">
            <!-- Bandeau d'intégrité : des audios référencés sont introuvables,
                 fichier déplacé/supprimé. Calculé à l'ouverture du corpus ;
                 clic = ouvrir l'entretien → le lecteur propose de ré-assigner. -->
            <div v-if="bandeauAudioVisible" class="bandeau-audio" data-tour="bandeau-audio">
              <button class="bandeau-audio-fermer" title="Fermer ce message" aria-label="Fermer le message sur les médias introuvables" @click="masquerBandeauAudio">×</button>
              <span class="bandeau-audio-titre">
                ⚠️ {{ Object.keys(audiosManquants).length }} fichier(s) média introuvable(s) — déplacé(s) ou supprimé(s) ?
              </span>
              <ul class="bandeau-audio-liste">
                <li v-for="id in Object.keys(audiosManquants)" :key="id">
                  <button class="bandeau-audio-ent" @click="ouvrirEntretien(id)">
                    {{ membership[id]?.titre ?? id }}
                  </button>
                </li>
              </ul>
            </div>

            <p v-if="listeEntretiens().length === 0" class="vide">Aucun entretien — « + Ajouter un entretien ».</p>
            <ul class="cartes-ent" ref="listeCartes" :class="'densite-' + densite" aria-label="Entretiens du corpus">
              <template v-for="e in listeEntretiens()" :key="e.id">
              <li
                class="carte-ent"
                :data-tour="'carte-' + e.titre"
                :data-entretien-id="e.id"
                :class="{ selection: corpusSelId === e.id }"
                :tabindex="corpusSelId === e.id ? 0 : -1"
                :aria-current="corpusSelId === e.id ? 'true' : undefined"
                @click="selectionnerCorpus(e.id)"
                @dblclick="ouvrirEntretien(e.id)"
                @keydown="naviguerListe($event, e.id)"
              >
                <!-- En-tête : titre et bouton au-dessus de l'onde, qui prend toute la largeur. -->
                <div class="carte-entete">
                  <div class="ent-titre" :title="e.titre">{{ e.titre }}
                    <!-- Badge de verrou fiable : « tenu par X » vient du SERVEUR,
                         scan verrous/ au pull, jamais d'une déduction.
                         Notre propre session n'est pas badgée (filtrée côté main). -->
                    <span v-if="badgeVerrou(e.id)" class="badge-verrou"
                          :title="detentionDe(badgeVerrou(e.id)!)">
                      🔒 {{ badgeVerrou(e.id)!.userId }}
                    </span>
                    <!-- Présence : « consulté par X » — informatif, JAMAIS décisionnel,
                         la décision, c'est le verrou ci-dessus. -->
                    <span v-for="p in presencesSur(e.id)" :key="p.machineId"
                          class="badge-presence" :title="`Consulté par ${p.userId} (autre poste)`">
                      👁 {{ p.userId }}
                    </span>
                  </div>
                  <div class="carte-actions">
                    <!-- Si l'entretien est verrouillé par autrui, le CRAYON devient VERROU,
                         visible même sur un écran étroit où le badge du titre est tronqué.
                         Le détail (qui ? depuis quand ?) passe en tooltip au survol ;
                         le clic ouvre toujours, en lecture seule.
                         La suppression vit dans la zone sensible de la fiche. -->
                    <button
                      class="crayon ouvrir-ent"
                      data-tour="crayon-entretien"
                      :title="titreCrayon(e.id)"
                      @click.stop="ouvrirEntretien(e.id)"
                      :aria-label="titreCrayon(e.id)"
                    >{{ badgeVerrou(e.id) ? '🔒 Ouvrir' : 'Ouvrir' }}</button>
                  </div>
                </div>
                  <!-- Forme d'onde de l'audio assigné ; sinon placeholder.
                       Dans les deux cas, le CALQUE du résumé thématique se
                       superpose : un span par segment codé, positionné en % du
                       TEXTE ; clic = ouvrir l'entretien à cet endroit.
                       Les ondes empilées sur toute la largeur forment le « mur » d'ondes. -->
                  <CadreOndeCorpus :source="urlWaveform(e.id)">
                    <BandeResumeThematique
                      v-if="resumes[e.id]"
                      :entretien-id="e.id"
                      :segments="resumes[e.id]"
                      @ouvrir="ouvrirAuSegment"
                    />
                    <!-- Marqueurs de recherche : une pastille par occurrence, à sa place dans le texte.
                         Le clic déplie le transcript sous la carte, sans ouvrir l'entretien. -->
                    <span
                      v-for="(m, mi) in marqueursRecherche[e.id] ?? []"
                      :key="'m' + mi"
                      class="occ-marqueur"
                      :class="{ courant: transcript?.id === e.id && transcript.pos === m.pos }"
                      :style="{ left: m.pourcent + '%' }"
                      :title="'Afficher le passage dans le transcript — « ' + requeteLancee + ' »'"
                      @click.stop="afficherTranscript(e.id, m.pos)"
                    ></span>
                  </CadreOndeCorpus>
              </li>
              <!-- Transcript déplié sous la carte : texte simple, occurrences surlignées. -->
              <li v-if="transcript?.id === e.id" class="transcript-ent" :aria-label="`Transcript de ${e.titre}`">
                <div class="transcript-tete">
                  <span class="transcript-compte">
                    Occurrence {{ rangTranscript + 1 }} / {{ occurrencesTranscript.length }}
                  </span>
                  <button class="mini" title="Occurrence précédente" aria-label="Occurrence précédente" @click="occurrenceVoisine(-1)">◄</button>
                  <button class="mini" title="Occurrence suivante" aria-label="Occurrence suivante" @click="occurrenceVoisine(1)">►</button>
                  <button class="mini transcript-ouvrir" @click="ouvrirAuSegment(transcript.id, transcript.pos)">Ouvrir l’entretien ici</button>
                  <button class="mini" title="Replier le transcript" aria-label="Replier le transcript" @click="transcript = null">✕</button>
                </div>
                <div :ref="poserCadreTranscript" class="transcript-texte">
                  <p v-for="(paragraphe, pi) in transcript.paragraphes" :key="pi">
                    <template v-for="(seg, si) in paragraphe" :key="si">
                      <mark
                        v-if="seg.pos !== undefined"
                        :class="{ courante: seg.pos === transcript.pos }"
                        @click="afficherTranscript(e.id, seg.pos)"
                      >{{ seg.texte }}</mark>
                      <template v-else>{{ seg.texte }}</template>
                    </template>
                  </p>
                </div>
              </li>
              </template>
            </ul>
          </div>
        </section>
      </div>

      <LocuteursCorpus v-show="ongletCorpus === 'locuteurs'" :actif="ongletCorpus === 'locuteurs'" />
      <NotesCorpus v-show="ongletCorpus === 'notes'" :actif="ongletCorpus === 'notes'" />
      <CommentairesCorpus v-show="ongletCorpus === 'commentaires'" :actif="ongletCorpus === 'commentaires'" />
      <div v-show="ongletCorpus === 'donnees'" class="donnees-corpus-conteneur">
        <TableDonnees :actif="ongletCorpus === 'donnees'" />
      </div>

      <div v-show="ongletCorpus === 'anon'" class="pseudonymisation-corpus-conteneur">
        <PseudonymisationCorpus
          ref="pseudonymisation"
          :actif="ongletCorpus === 'anon'"
          @ouvrir-occurrence="ouvrirAuSegment"
        />
      </div>

      <EditionThemes v-if="editerThemes" contexte="corpus" @fermer="editerThemes = false" />
      <MenuTheme
        v-if="menuTheme"
        :x="menuTheme.x"
        :y="menuTheme.y"
        :nom="menuTheme.nom"
        :actif="menuTheme.actif"
        @basculer="basculerActifTheme"
        @fermer="menuTheme = null"
      />
    </section>
</template>

<style scoped>
.actions-ent {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.corpus-barre {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.8rem;
}
/* Zone de synchro du corpus distant (horodatage + Actualiser) : pousse le
   reste de la barre à gauche, reste discrète. */
.synchro-zone {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}
.dernier-tirage {
  font-size: 0.8rem;
  color: #555;
}
/* information manquante, pas une erreur : elle n'empêche aucun geste */
.verrous-indispo {
  font-size: 0.8rem;
  color: #8a6d3b;
  border-bottom: 1px dotted currentColor;
  cursor: help;
}
.badge-verrou {
  display: inline-block;
  margin-left: 0.4rem;
  font-size: 0.72rem;
  font-weight: 400;
  color: #6d4c00;
  background: #fff3cd;
  border: 1px solid #e6cf8b;
  border-radius: 999px;
  padding: 0 0.45em;
}
.btn-table {
  padding: 0.4rem 0.9rem;
  border: 1px solid #1565c0;
  background: #2e73d8;
  color: #fff;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
}
.grille-corpus {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 1rem;
  align-items: start;
}
.grille-corpus.atelier-actif { grid-template-columns: 300px minmax(0, 1fr); }
.grille-corpus.sans-panneau { grid-template-columns: minmax(0, 1fr); }
@media (max-width: 780px) {
  .grille-corpus,
  .grille-corpus.atelier-actif { grid-template-columns: minmax(0, 1fr); }
}
/* --- Onglets colonne gauche (Thèmes / Recherche / Pas à pas) --- */
.ligne-onglets-corpus {
  display: flex;
  align-items: stretch;
  margin-bottom: 0.75rem;
}
/* La ligne des onglets se prolonge jusqu'au bord. */
.fin-ligne-onglets {
  flex: 1;
  border-bottom: 1px solid #e2e4ec;
}

/* Respiration sous l'en-tête de l'appli (fil d'Ariane) : les onglets
   ne collent pas à sa bordure basse. */
.corpus-ecran {
  padding-top: 0.7rem;
}
/* --- Onglet Recherche : recherche plein texte du corpus --- */
.barre-recherche {
  display: flex;
  gap: 0.35rem;
  margin-top: 0.4rem;
}
.req-recherche {
  flex: 1;
  min-width: 0;
  border: 1px solid #ccc;
  border-radius: 5px;
  padding: 0.25rem 0.4rem;
  font-size: 0.82rem;
}
.btn-rech {
  border: 1px solid #1565c0;
  background: #2e73d8;
  color: #fff;
  border-radius: 5px;
  padding: 0.25rem 0.7rem;
  font-size: 0.8rem;
  cursor: pointer;
  flex: none;
}
.btn-rech:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.opt-recherche {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.4rem;
  font-size: 0.78rem;
  color: #555;
  cursor: pointer;
  user-select: none;
}
.opt-recherche input {
  accent-color: #2e73d8;
  cursor: pointer;
}
.opt-recherche.coche .opt-lib {
  color: #1565c0;
  font-weight: 600;
}
.opt-info-texte {
  margin: 0.25rem 0 0;
  font-size: 0.72rem;
  color: #999;
  font-style: italic;
}
.rech-info {
  margin: 0.4rem 0 0;
  font-size: 0.78rem;
  color: #666;
}
/* Résultats groupés par entretien. */
.liste-rech-crp {
  list-style: none;
  margin: 0.4rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.ent-rech {
  border: 1px solid #e5e5ef;
  border-radius: 6px;
  padding: 0.3rem 0.4rem;
  background: #fff;
}
.titre-ent-rech {
  font-size: 0.82rem;
  color: #333;
  margin-bottom: 0.25rem;
}
.nb-rech {
  font-size: 0.7rem;
  color: #999;
  font-family: monospace;
  margin-left: 0.3rem;
}
.occ-rech {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  max-height: 220px;
  overflow-y: auto;
}
.occ-rech-btn {
  width: 100%;
  text-align: left;
  border: 1px solid #eee;
  border-radius: 4px;
  background: #fafafe;
  padding: 0.25rem 0.35rem;
  font-size: 0.75rem;
  color: #444;
  cursor: pointer;
  line-height: 1.35;
}
.occ-rech-btn:hover,
.occ-rech-btn.actif {
  border-color: #2e73d8;
  background: #f0f6ff;
}
.occ-rech-btn .match {
  font-weight: 700;
  color: #1565c0;
  /* Espace VISUEL autour du match : les espaces du template sont des nœuds
     texte réduits à des blancs, que Vue supprime en mode condense — mieux vaut
     une marge (garantie) qu'un espace littéral (détruit à la compilation).
     0.3em ≈ la largeur d'un espace. */
  margin: 0 0.3em;
}
.effacer-rech {
  margin-top: 0.5rem;
  border: 1px dashed #bbb;
  border-radius: 5px;
  background: #fff;
  color: #666;
  cursor: pointer;
  padding: 0.15rem 0.5rem;
  font-size: 0.75rem;
  width: 100%;
}
.effacer-rech:hover {
  border-color: #2e73d8;
  color: #1565c0;
}
/* --- Transcript déplié sous une carte après le choix d'une occurrence --- */
.transcript-ent {
  margin-top: -0.5rem;
  border: 1px solid #2e73d8;
  border-top: 3px solid #2e73d8;
  border-radius: 0 0 6px 6px;
  background: #fff;
}
.transcript-tete {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.5rem;
  border-bottom: 1px solid #e5e5ef;
  background: #f5f8fd;
}
.transcript-compte {
  margin-right: auto;
  font-size: 0.78rem;
  color: #44506a;
}
.transcript-texte {
  position: relative;
  max-height: 45vh;
  overflow-y: auto;
  padding: 0.5rem 0.75rem;
  font-size: 0.85rem;
  line-height: 1.55;
  color: #333;
}
.transcript-texte p {
  margin: 0 0 0.6rem;
  white-space: pre-wrap;
}
.transcript-texte mark {
  background: #fff3a8;
  border-radius: 2px;
  cursor: pointer;
}
.transcript-texte mark.courante {
  background: #ffb347;
  outline: 2px solid #e65100;
  font-weight: 600;
}
/* --- Colonne gauche : métadonnées de l'entretien sélectionné --- */
.meta-ent .champ-nom {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  margin: 0.4rem 0;
}
.champ-lbl {
  font-size: 0.72rem;
  color: #888;
}
.titre-meta {
  border: 1px solid #ccc;
  border-radius: 5px;
  padding: 0.3rem 0.4rem;
  font-size: 0.9rem;
}
/* Variables de l'entretien (lecture seule) : sections titrées,
   lignes libellé → valeur ; défilement si la liste est longue. */
.meta-vars {
  margin-top: 0.6rem;
  max-height: 40vh;
  overflow-y: auto;
  border-top: 1px dashed #ddd;
  padding-top: 0.3rem;
}
.meta-vars h4 {
  margin: 0.5rem 0 0.2rem;
  font-size: 0.8rem;
  color: #1565c0;
}
.ligne-var {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 0.82rem;
  padding: 0.15rem 0;
  border-bottom: 1px dashed #eee;
}
.lbl-var {
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.val-var {
  font-weight: 600;
  white-space: nowrap;
}
.val-var.vide {
  color: #bbb;
  font-weight: 400;
}
/* Retrait du corpus depuis le panneau (croix en fin de panneau). */
.suppr-meta {
  margin-top: 0.7rem;
  color: #b00020;
  border-color: #e0b4b4;
}
.meta-infos {
  list-style: none;
  margin: 0.6rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.meta-infos li {
  display: flex;
  justify-content: space-between;
  font-size: 0.82rem;
  border-bottom: 1px dashed #eee;
  padding-bottom: 0.2rem;
}
.meta-infos li span {
  color: #666;
}
/* --- Colonne droite : entretiens en cartes --- */
/* Bandeau d'intégrité (audio référencé introuvable) : informe, n'empêche
   rien — on ne bloque jamais l'app pour un média manquant. */
.bandeau-audio {
  border: 1px solid #f3b4ad;
  background: #fdecea;
  border-radius: 8px;
  padding: 0.45rem 0.6rem;
  margin-top: 0.5rem;
  font-size: 0.8rem;
  color: #b3261e;
}
.bandeau-audio-titre {
  display: block;
  font-weight: 600;
}
.bandeau-audio-fermer {
  float: right;
  border: none;
  background: none;
  color: inherit;
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 0.2rem;
}
.bandeau-audio-liste {
  list-style: none;
  margin: 0.35rem 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.bandeau-audio-ent {
  border: 1px solid #e0a0a0;
  background: #fff;
  color: #b3261e;
  border-radius: 5px;
  padding: 0.15rem 0.5rem;
  font-size: 0.78rem;
  cursor: pointer;
}
.bandeau-audio-ent:hover {
  border-color: #b3261e;
}
.cartes-ent {
  list-style: none;
  margin: 0.4rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.carte-ent {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  border: 1px solid #e0e0ea;
  border-radius: 6px;
  padding: 0.3rem 0.5rem;
  background: #fff;
  cursor: pointer;
  /* Les cartes hors de l'écran ne sont ni mises en page ni dessinées :
     un gros corpus s'affiche sans attendre ses dizaines de bandes de thèmes. */
  content-visibility: auto;
  contain-intrinsic-size: auto 4.5rem;
}
.carte-ent:hover {
  border-color: #b9c7bb;
}
.carte-ent.selection {
  border-color: #2e73d8;
  background: #f0f6ff;
}
.carte-ent:focus-visible {
  outline: 2px solid #2e73d8;
  outline-offset: 1px;
}
.carte-entete {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.ent-titre {
  flex: 1;
  min-width: 0;
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.carte-ent .badge-verrou {
  flex-shrink: 0; /* le badge ne se fait pas manger par l'ellipse du titre */
}
.badge-presence {
  flex-shrink: 0;
  font-size: 0.72rem;
  padding: 0 0.4rem;
  border-radius: 8px;
  background: #e2ecff;
  color: #1d4fa1;
}
/* Marqueur de RECHERCHE sur le « mur » d'ondes : barre JAUNE vif, tour ROUGE
   gras, qui dépasse un peu du cadre, bien visible. Centrée sur la position %
   de l'occurrence ; au survol, elle passe au rouge et s'épaissit. */
.occ-marqueur {
  position: absolute;
  top: -4px;
  bottom: -4px; /* dépasse un peu au-dessus ET en dessous du cadre */
  width: 4px;
  margin-left: -2px; /* centrée sur son % */
  background: rgb(254 255 0);
  border: 2px solid #ff0000; /* tour gras rouge */
  border-radius: 2px;
  cursor: pointer;
  z-index: 10;
  box-sizing: border-box;
}
.occ-marqueur:hover,
.occ-marqueur.courant {
  background: rgb(255 0 0);
  width: 6px;
  margin-left: -3px;
  box-shadow: 0 0 4px rgba(255, 0, 0, 0.5);
}
.assigner-audio {
  margin-top: 0.6rem;
  width: 100%;
}
/* Ligne « audio » du panneau méta : les deux gestes se côtoient —
   Effacer (rouge) à gauche, Remplacer à droite. */
.audio-actions {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.6rem;
}
.audio-actions .mini {
  flex: 1;
}
.audio-actions .assigner-audio {
  margin-top: 0;
  width: auto;
}
/* « Effacer l'audio » : acte destructif (le média est détaché) — rouge. */
.audio-effacer {
  color: #b00020;
  border-color: #e0b4b4;
}
.audio-effacer:hover:not(:disabled) {
  border-color: #b00020;
  background: #fdecea;
}
/* Bannière de confirmation « le SRT écrase le texte » : même idiome que la
   suppression, posée sous les boutons. */
.srt-confirm {
  margin-top: 0.5rem;
}
.srt-err {
  margin: 0.4rem 0 0;
  color: #b3261e;
  font-size: 0.78rem;
}
/* Bouton « Assigner un SRT… » : même gabarit que l'audio, monté de 0.6rem
   comme les autres gestes du panneau. */
.assigner-srt {
  margin-top: 0.6rem;
  width: 100%;
}
.carte-actions {
  display: flex;
  gap: 0.25rem;
  align-items: center;
  flex: none;
}
.carte-actions .crayon {
  border: 2px solid #777;
}
.carte-actions .crayon:hover {
  border-color: #2e73d8;
}
.suppr {
  border: none;
  background: none;
  color: #c33;
  cursor: pointer;
  font-size: 0.8rem;
}
/* --- Thèmes en consultation (l'édition vit dans la modale EditionThemes) --- */
.liste-thm-lecture {
  list-style: none;
  margin: 0.3rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.liste-thm-lecture li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  padding: 0.15rem 0.15rem;
}
/* Icône de repli d'un parent dans la consultation : `-masque` réserve la place
   (largeur égale) sur les feuilles pour que la pastille reste alignée. */
.depliant {
  width: 1.4rem;
  flex: none;
  border: none;
  background: none;
  color: #777;
  cursor: pointer;
  font-size: 0.9rem;
  padding: 0;
}
.depliant-masque {
  visibility: hidden;
}
.depliant:hover {
  color: #1565c0;
}
.liste-thm-lecture li.inactif {
  opacity: 0.3;
}
.pastille {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex: none;
  border: 1px solid rgba(0, 0, 0, 0.15);
}
.nom-thm-lecture {
  flex: 1;
  min-width: 0;
  font-size: 0.82rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.usage {
  font-size: 0.72rem;
  color: #888;
  font-family: monospace;
  min-width: 1.1rem;
  text-align: right;
}
.toutes-descriptions {
  border: 1px solid #d3dae5;
  border-radius: 5px;
  background: #fff;
  color: #55708f;
  cursor: pointer;
  padding: 0.12rem 0.35rem;
  font-size: 0.68rem;
}
.toutes-descriptions[aria-pressed="true"],
.toutes-descriptions:hover {
  border-color: #2e73d8;
  color: #1565c0;
  background: #f0f6ff;
}
.info-theme {
  width: 1.3rem;
  height: 1.3rem;
  margin-right: -0.3rem;
  flex: none;
  border: 1px solid transparent;
  border-radius: 50%;
  background: #fff;
  color: #55708f;
  cursor: pointer;
  padding: 0;
  font-size: 0.9rem;
  line-height: 1;
}
.info-theme:hover {
  border-color: #2e73d8;
  color: #1565c0;
  background: #f0f6ff;
}
.info-theme-masque {
  visibility: hidden;
}
.description-theme {
  flex-basis: 100%;
  margin: 0 0 0.2rem 1.8rem;
  padding: 0.4rem 0.5rem;
  border-left: 3px solid #b8c9df;
  background: #f7f9fc;
  color: #4f5966;
  font-size: 0.76rem;
  line-height: 1.35;
  white-space: pre-wrap;
}

/* --- Onglet Entretiens : liste et fiche --- */
/* Comme sur les autres onglets, le panneau gauche reste en vue pendant le défilement,
   s'arrête au bas de la fenêtre et défile à l'intérieur. */
.colonne-g-corpus {
  position: sticky;
  top: calc(var(--entete-h) + 0.5rem);
  align-self: start;
}
.colonne-g-corpus .meta-ent,
.colonne-g-corpus .recherche,
.colonne-g-corpus .themes-corpus {
  box-sizing: border-box;
  max-height: var(--hauteur-disponible, 70vh);
  overflow-y: auto;
}
.liste-entretiens {
  min-width: 0;
}
.zone-sensible {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 1rem;
  padding: 0.6rem;
  border: 1px solid #f3c3bd;
  border-radius: 6px;
  background: #fdf3f2;
}
.zone-sensible h4 {
  margin: 0;
  color: #b3261e;
  font-size: 0.72rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.zone-sensible .mini {
  width: 100%;
  margin-top: 0;
  background: #fff;
}
.zone-sensible .confirm-suppr {
  margin: 0.2rem 0 0;
}
.carte-actions .ouvrir-ent {
  border: 1px solid #1565c0;
  background: #2e73d8;
  color: #fff;
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0.2rem 0.75rem;
}
.carte-actions .ouvrir-ent:hover {
  background: #1f63c6;
}

/* Curseur de densité de la liste, dans la barre d'onglets. */
.densite-liste {
  display: inline-flex;
  align-items: center;
  align-self: stretch; /* même hauteur que les boutons voisins */
  /* Mêmes marges intérieures et taille de texte que « Rechercher » et « Ajouter ». */
  gap: 0.35rem;
  padding: 0 0.65rem;
  font-size: 0.88rem;
  color: #666;
}
.densite-libelle {
  white-space: nowrap;
}
.densite-liste input {
  appearance: none;
  width: 7.5rem;
  height: 16px;
  margin: 0;
  background: transparent;
  cursor: pointer;
}
.densite-liste input::-webkit-slider-runnable-track {
  height: 3px;
  border-radius: 2px;
  background: #d6d6d6;
}
.densite-liste input::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  margin-top: -5.5px;
  border-radius: 50%;
  background: #111;
}
.densite-liste input:focus-visible {
  outline: 2px solid #2e73d8;
  outline-offset: 2px;
}

/* Le zoom fixe la hauteur des cartes et leur espacement ;
   l'onde occupe toute la place laissée par le titre et le bouton. */
.cartes-ent {
  gap: var(--ecart-cartes, 0.5rem);
}
.cartes-ent .carte-ent {
  box-sizing: border-box;
  height: var(--h-carte, auto);
}
.cartes-ent .spectro-cadre {
  flex: 1 1 0;
  min-height: 0;
  height: auto;
}
.densite-aere .carte-entete {
  flex: none;
}

/* Modes compacts : titre, onde et bouton sur une seule ligne.
   L'en-tête s'efface pour que ses enfants se placent autour de l'onde. */
.densite-compact .carte-ent,
.densite-tres-compact .carte-ent {
  flex-direction: row;
  align-items: center;
}
.densite-compact .carte-entete,
.densite-tres-compact .carte-entete {
  display: contents;
}
.densite-compact .spectro-cadre,
.densite-tres-compact .spectro-cadre {
  order: 1;
  align-self: stretch;
}
.densite-compact .carte-actions {
  order: 2;
}

/* Compact : titre dans une colonne fixe, onde au milieu, bouton à droite. */
.densite-compact .carte-ent {
  gap: 0.5rem;
  padding: 3px 0.35rem 3px 0.6rem;
  border-radius: 8px;
}
.densite-compact .ent-titre {
  flex: 0 0 10rem;
}

/* Très compact : une fine bande par entretien, titre posé sur l'onde.
   Le double-clic ouvre l'entretien. */
.densite-tres-compact {
  margin-top: 0.25rem;
}
.densite-tres-compact .carte-ent {
  position: relative;
  padding: 1px;
  border-radius: 8px;
}
.densite-tres-compact .spectro-cadre {
  border-radius: 7px;
}
.densite-tres-compact .spectro {
  border-radius: 7px;
}
.densite-tres-compact .ent-titre {
  position: absolute;
  left: 0.6rem;
  top: 50%;
  transform: translateY(-50%);
  z-index: 5;
  max-width: 40%;
  padding: 0 0.3rem;
  font-size: 0.72rem;
  font-weight: 500;
  line-height: 1.2;
  background: rgba(255, 255, 255, 0.92);
  pointer-events: none;
}
.densite-tres-compact .carte-actions {
  display: none;
}
.densite-tres-compact .badge-presence,
.densite-tres-compact .badge-verrou {
  font-size: 0.65rem;
}
@media (max-width: 780px) {
  .colonne-g-corpus { position: static; }
  .colonne-g-corpus .meta-ent,
  .colonne-g-corpus .recherche,
  .colonne-g-corpus .themes-corpus { max-height: none; }
}
</style>
