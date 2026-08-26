<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted, onBeforeUnmount, type Directive } from 'vue'
import { EditorContent } from '@tiptap/vue-3'
import LecteurAudio from './LecteurAudio.vue'
import VideoPanel from './VideoPanel.vue'
import MenuContexte from './MenuContexte.vue'
import MenuTheme from './MenuTheme.vue'
import MenuLiensNote from './MenuLiensNote.vue'
import EditionCommentaire from './EditionCommentaire.vue'
import {
  ATTR_LIENS_NOTE,
  corpsAvecRefsCommentaires,
  corpsNoteEnTexte,
  decoreRefsCommentaires,
  echapperTexte,
  pruneRefsCommentaires,
  surlignerHtml,
} from '../notes/sanitiser'
import EditionThemes from './EditionThemes.vue'
import EditionVariables from './EditionVariables.vue'
import { utiliserSonal } from '../composables/sonal'
import { couleurPourLocuteur } from '../../shared/entretien/locuteurs'
import { visiblesThemes } from '../../shared/corpus/categories'
// Icônes des onglets (glyphe noir à plat).
import icoThemes from '../assets/icones/themes.png'
import icoLocuteurs from '../assets/icones/locuteurs.png'
import icoDonnees from '../assets/icones/donnees.png'
import icoJournal from '../assets/icones/journal.png'
import icoNotes from '../assets/icones/notes.png'
import icoMaison from '../assets/icones/maison.png'
import icoAnon from '../assets/icones/anon.png'

const {
  codebook,
  varsGen,
  varsLoc,
  couleurHex,
  arbreThemes,
  modifierTheme,
  usages,
  locuteurs,
  meta,
  ongletDroite,
  hintCodage,
  selectionAnon,
  hintAnon,
  lignesAnon,
  hitsAAnonymiserParCle,
  inclusesParCle,
  rafraichirCompteursAAAnonymiser,
  reperageAnon,
  demarrerReperage,
  naviguerReperage,
  arreterReperage,
  // Recherche / remplacement (Ctrl+F)
  rechercheOuverte,
  rechercheTexte,
  remplacementTexte,
  occurrencesRecherche,
  indexRecherche,
  fermerRecherche,
  naviguerRecherche,
  remplacerOccurrenceCourante,
  remplacerTout,
  validerAnon,
  supprimerAnon,
  creerBrouillon,
  majBrouillonLigne,
  supprimerLigneAnon,
  changerPorteeAnon,
  validerAvecPriorite,
  categorieDeLigne,
  categoriserLigne,
  thematiquesActives,
  menuContextuel,
  fermerMenu,
  basculerException,
  basculerAnonymise,
  basculerPseudoOccurrence,
  editionCommentaire,
  commenterDepuisMenu,
  editerCommentaire,
  fermerEditionCommentaire,
  validerCommentaire,
  supprimerCommentaire,
  retirerCodageMenu,
  dialoguePorteeCorpus,
  alignerCorpus,
  garderLesDeuxCorpus,
  annulerDialogueCorpus,
  suggestionLiaison,
  accepterSuggestionLiaison,
  refuserSuggestionLiaison,
  entiteExisteDeja,
  editor,
  entreesJournal,
  annulerEntree,
  coderAvec,
  attribuerLoc,
  renommerLoc,
  nouveauLocuteur,
  setInterviewer,
  setPseudoLoc,
  choisirCouleurLoc,
  locuteurASupprimer,
  demanderSuppressionLocuteur,
  confirmerSuppressionLocuteur,
  setValeurGen,
  setValeurLoc,
  modalitesDe,
  modaliteParLibelle,
  sauver,
  retourCorpus,
  exporter,
  audio,
  lectureSeule, // corpus en lecture seule : tout l'éditeur est grisé
  verrouAutrui, // verrou de l'entretien ouvert (tenu par autrui ?)
  // Notes d'entretien (notes + corps + rang ; les CATÉGORIES viennent du corpus).
  notes,
  brouillonNote,
  ajouterNote,
  editerNote,
  validerNote,
  annulerNote,
  avertissementNote,
  ecrireCorpsNote,
  ecrireTitreNote,
  enregistrerSyncZoneHorsModale,
  supprimerNote,
  reordonnerNotes,
  marquerPassage,
  menuLiensNote,
  commentairesPourLiaison,
  resolverCommentaires,
  lierPassage,
  ouvrirMenuLiensNote,
  fermerMenuLiensNote,
  lierCommentaireNote,
  delierCommentaireNote,
  allerAuCommentaire,
  // Catégories de note : définitions au CORPUS — gestes asynchrones (IPC).
  categoriesNote,
  nomCategorieNote,
  couleurCategorieNote,
  ajouterCategorieNote,
  majCouleurCategorieNote,
  // Statut de la session d'écriture (publication) + « Publier maintenant »
  statutSession,
  publiErreur,
  publierMaintenant,
} = utiliserSonal()

// Heure locale courte d'un horodatage ISO (« HH:MM »).
const heureDe = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''

// Lecture seule du CONTENU : l'entretien ouvert est figé ssi son verrou est tenu par autrui ;
// les définitions suivent `lectureSeule`.
const roContenu = computed(() => verrouAutrui.value !== null)

// Compteur « i/N » de la boîte recherche/remplacement (vide sans requête).
const compteRecherche = computed(() => {
  if (!rechercheTexte.value.trim()) return ''
  const n = occurrencesRecherche.value.length
  return n === 0 ? '0/0' : `${indexRecherche.value + 1}/${n}`
})
// État partagé du scope média pour l'organisation d'écran (mode vidéo).
const { estVideo, videoVisible, toggleVideo } = audio

// La fenêtre d'édition des thèmes (crayon), locale à la vue ; en contexte entretien,
// elle porte la politique de suppression adaptée :
// refus si un AUTRE entretien utilise le thème, sinon retrait des codages ici.
const editerThemes = ref(false)
// Menu contextuel d'un THÈME du panneau (actif ↔ passif sans ouvrir l'édition).
const menuTheme = ref<{ id: string; nom: string; x: number; y: number; actif: boolean } | null>(null)
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
// Repli des sous-thèmes dans le panneau : état de VUE local (jamais persisté,
// indépendant par écran), les catégories repliées restent visibles.
const repliesThemes = ref<Set<string>>(new Set())
const arbreVisible = computed(() => visiblesThemes(arbreThemes(), repliesThemes.value))
function basculerRepli(id: string) {
  const s = new Set(repliesThemes.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  repliesThemes.value = s
}
// Idem pour les variables : le crayon de l'onglet Données ouvre la MÊME fenêtre que la Table de données,
// pour créer des variables d'entretien/locuteur sans repasser par l'écran Corpus.
const editerVariables = ref(false)

// --- Notes d'entretien (état local de la vue) ---
// Vue active de l'onglet Notes : cartes (défaut) ou texte concaténé (expand).
const vueNotes = ref<'cartes' | 'texte'>('cartes')
// Zone d'édition du corps (contenteditable) : on y pose le HTML initial à l'ouverture du brouillon,
// et on relit son innerHTML à la volée pour suivre les passages `<mark>` pendant la frappe.
const zoneCorpsNote = ref<HTMLElement | null>(null)
// Création de catégorie depuis le select « autre… » du formulaire de note :
//  mini-modale inline (nom + couleur), façon « trouver-ou-créer ».
const creationCategorie = ref<{ nom: string; couleur: string } | null>(null)

// Toute variation de catégorie dans le brouillon efface l'avertissement.
watch(
  () => brouillonNote.value?.categorieId,
  () => {
    avertissementNote.value = ''
  },
)

// Brouillon de note : on SYNC le contenteditable au montage du formulaire.
//  Quand la modale s'ouvre, on attend le rendu puis on pose le HTML initial,
//  décoré des références `[auteur : début…]` après chaque passage lié.
//  Les spans sont non éditables, et retirés du corps à la sauvegarde par le sanitisé.
watch(
  () => brouillonNote.value?.id ?? 'new',
  () => {
    nextTick(() => {
      if (zoneCorpsNote.value && brouillonNote.value) {
        zoneCorpsNote.value.innerHTML = brouillonNote.value.corps || ''
        decoreRefsCommentaires(zoneCorpsNote.value, document, resolverCommentaires)
      }
    })
  },
)

// Suit la frappe dans le contenteditable : reporte le HTML courant vers le brouillon ;
//  les passages `<mark>`/`<em>` sont ainsi conservés à la validation,
//  et les références dont le lien a disparu sont retirées.
function onSaisieCorpsNote() {
  if (brouillonNote.value && zoneCorpsNote.value) {
    pruneRefsCommentaires(zoneCorpsNote.value)
    brouillonNote.value.corps = zoneCorpsNote.value.innerHTML
  }
}

// Bouton ✏ de la modale : toggle `<mark>`, puis report explicite vers le brouillon ;
//  un geste DOM programmatique ne déclenche pas d'événement input,
//  et une validation immédiate perdrait sinon le marquage.
function marquerDansModale() {
  if (!zoneCorpsNote.value) return
  marquerPassage(zoneCorpsNote.value)
  if (brouillonNote.value) brouillonNote.value.corps = zoneCorpsNote.value.innerHTML
}

// Clic droit dans le corps d'une note : sur un passage important ou lié,
//  ouvre le menu de liaison aux commentaires (le composable avale le menu natif) ;
//  ailleurs, le menu natif du contenteditable reste disponible.
function onContextmenuCorpsNote(e: MouseEvent) {
  if (zoneCorpsNote.value) ouvrirMenuLiensNote(e, zoneCorpsNote.value)
}

// Corps d'une carte note décoré des références aux commentaires liés :
//  après chaque passage italique lié, « [alice : début…] » (cf. sanitiser).
function corpsAvecRefs(n: { corps: string }): string {
  return corpsAvecRefsCommentaires(corpsOuVide(n), document, resolverCommentaires)
}

// Clic sur une référence de commentaire (carte OU zone d'édition) :
//  cale l'éditeur sur la zone commentée (sélection + flash + scroll centré).
function clicRefCommentaire(e: MouseEvent) {
  const ref = (e.target as HTMLElement | null)?.closest('[data-ref]')
  if (ref) allerAuCommentaire(ref.getAttribute('data-ref')!)
}

// Ouvre la mini-modale « autre… » pour créer une catégorie (trouver-ou-créer).
function ouvrirCreationCategorie() {
  creationCategorie.value = { nom: '', couleur: '#ffb74d' }
}
// Valide la création : pose la catégorie (IPC → async), la sélectionne dans le brouillon,
// puis ferme la mini-modale.
async function validerCreationCategorie() {
  const c = creationCategorie.value
  if (!c || !c.nom.trim()) return
  const id = await ajouterCategorieNote(c.nom, c.couleur)
  if (brouillonNote.value) brouillonNote.value.categorieId = id
  creationCategorie.value = null
}

// Notes triées par rang (ordre d'affichage par défaut de la vue cartes).
const notesTriees = computed(() => notes.value.slice().sort((a, b) => a.rang - b.rang))

// Recherche parmi les notes : filtre les cartes ET les blocs de la feuille sur le titre,
//  la catégorie et le corps (insensible à la casse), plus des filtres par catégorie et par statut.
//  Fermer le volet réinitialise tout.
const voletRechercheNotes = ref(false)
const filtreNotes = ref('')
const filtreCategorie = ref('') // '' = toutes catégories
const filtreStatut = ref<'' | 'prive' | 'public'>('') // '' = tous statuts
const filtrePassage = ref<'' | 'mark' | 'lien'>('') // '' = tous passages
const rechercheActive = computed(
  () =>
    !!(
      filtreNotes.value.trim() ||
      filtreCategorie.value ||
      filtreStatut.value ||
      filtrePassage.value
    ),
)
function basculerRechercheNotes() {
  voletRechercheNotes.value = !voletRechercheNotes.value
  if (!voletRechercheNotes.value) reinitialiserRechercheNotes()
}
function reinitialiserRechercheNotes() {
  filtreNotes.value = ''
  filtreCategorie.value = ''
  filtreStatut.value = ''
  filtrePassage.value = ''
}
const notesAffichees = computed(() => {
  const q = filtreNotes.value.trim().toLowerCase()
  return notesTriees.value.filter((n) => {
    if (filtreCategorie.value && n.categorieId !== filtreCategorie.value) return false
    if (filtreStatut.value && n.statut !== filtreStatut.value) return false
    // Passages : « mark » = contient un passage important ;
    // « lien » = au moins un passage lié à un commentaire (attribut porteur d'ids).
    if (filtrePassage.value === 'mark' && !n.corps.includes('<mark')) return false
    if (filtrePassage.value === 'lien' && !n.corps.includes(ATTR_LIENS_NOTE)) return false
    if (!q) return true
    return [n.titre, nomCategorieNote(n.categorieId), corpsNoteEnTexte(n.corps, document)].some((t) =>
      t.toLowerCase().includes(q),
    )
  })
})

// Copie des notes AFFICHÉES (filtres compris) dans le presse-papier, au format texte de la feuille ;
//  l'icône passe à ✓ une seconde et demie.
const notesCopiees = ref(false)
let minuteurCopie: ReturnType<typeof setTimeout> | null = null
async function copierNotes() {
  const texte = notesAffichees.value
    .map((n) => {
      const titre = n.titre ? `${n.titre}\n` : ''
      return `[${nomCategorieNote(n.categorieId)} · ${dateLibelle(n.date)} · ${n.statut === 'public' ? 'public' : 'privé'}]\n${titre}${corpsNoteEnTexte(n.corps, document)}`
    })
    .join('\n\n')
  try {
    await navigator.clipboard.writeText(texte)
    notesCopiees.value = true
    if (minuteurCopie) clearTimeout(minuteurCopie)
    minuteurCopie = setTimeout(() => {
      notesCopiees.value = false
    }, 1500)
  } catch {
    // Presse-papier indisponible : silencieux, l'utilisateur réessaiera.
  }
}

// Surbrillance de la recherche : HTML sûr (texte échappé ou déjà sanitisé)
//  décoré de spans .surbrillance-note autour des occurrences.
const titreAvecHits = (titre: string) => surlignerHtml(echapperTexte(titre), filtreNotes.value, document)
function corpsAvecRefsEtHits(n: { corps: string }): string {
  return surlignerHtml(corpsAvecRefs(n), filtreNotes.value, document)
}

// Libellé court d'une date : « JJ/MM/AAAA » ou « sans date ».
const dateLibelle = (d: string | null) =>
  d ? new Date(d + 'T00:00').toLocaleDateString('fr-FR') : 'sans date'

// Corps d'une note, ou un placeholder si vide (v-html : le corps est sanitisé).
const corpsOuVide = (n: { corps: string }) => n.corps || '<span class="vide">(note vide)</span>'

// --- Édition EN FEUILLE (vue texte) : chaque note s'édite sur place —
//  en-tête (catégorie · date · statut) figé, contenu éditable comme dans la modale,
//  avec passages <mark>/<em> et références cliquables. Chaque frappe est sanitisée,
//  puis écrite dans la note. La feuille est éditive DÈS son affichage ;
//  pas de mode lecture séparé.
const editionFeuille = computed(() => vueNotes.value === 'texte')
// Racine de la vue feuille et bloc actif :
//  le bloc focusé en dernier est la cible des boutons ✏ / 🔗.
//  Le Map est hors réactivité (éléments DOM vivants).
const feuilleEl = ref<HTMLElement | null>(null)
const blocsFeuille = new Map<string, HTMLElement>()
const blocActifId = ref<string | null>(null)

// Pose le HTML décoré (références `[auteur : début…]`) dans un bloc,
//  avec surbrillance des occurrences trouvées le cas échéant.
function decorerBlocFeuille(id: string, zone: HTMLElement) {
  const n = notes.value.find((x) => x.id === id)
  if (!n) return
  zone.innerHTML = surlignerHtml(
    corpsAvecRefsCommentaires(n.corps, document, resolverCommentaires),
    filtreNotes.value,
    document,
  )
}

// Décoration d'un bloc à sa CRÉATION dans le DOM (directive) :
//  couvre tous les remontages — ouverture de la feuille, ajout de note,
//  retour d'un bloc masqué puis révélé par les filtres ;
//  ne touche pas aux blocs déjà vivants (le curseur est préservé pendant la frappe).
const vDecoreBloc: Directive<HTMLElement, string> = {
  mounted: (el, binding) => decorerBlocFeuille(binding.value, el),
}
// Changement de recherche : on redécore les blocs visibles pour rafraîchir la surbrillance,
//  sans remonter les blocs eux-mêmes. JAMAIS pendant la frappe dans un bloc,
//  le contenteditable reste la source.
function peuplerFeuille() {
  const racine = feuilleEl.value
  if (!racine) return
  for (const zone of Array.from(racine.querySelectorAll<HTMLElement>('.corps-notes-texte'))) {
    const id = zone.getAttribute('data-note-id')
    if (id) decorerBlocFeuille(id, zone)
  }
}
watch(filtreNotes, () => {
  if (vueNotes.value === 'texte') nextTick(peuplerFeuille)
})

// Saisie dans un bloc : retire les références orphelines, puis écrit le corps sanitisé dans la note ; le curseur ne bouge pas.
function onSaisieBlocFeuille(id: string) {
  const zone = blocsFeuille.get(id)
  if (!zone) return
  pruneRefsCommentaires(zone)
  ecrireCorpsNote(id, zone.innerHTML)
}

// La feuille enregistre sa synchronisation auprès du composable :
//  tant que la modale est fermée, les gestes de liaison (bouton 🔗, menu contextuel)
//  y reportent leurs changements.
enregistrerSyncZoneHorsModale((zone) => {
  for (const [id, el] of blocsFeuille) {
    if (el === zone) {
      onSaisieBlocFeuille(id)
      return
    }
  }
})
onBeforeUnmount(() => enregistrerSyncZoneHorsModale(null))

function blocActif(): HTMLElement | null {
  const el = blocActifId.value ? blocsFeuille.get(blocActifId.value) : null
  // Un élément détaché (note supprimée depuis) ne doit jamais être visé.
  return el && el.isConnected ? el : null
}
// Focus d'un bloc : il devient la cible des outils d'édition.
function onFocusBloc(id: string, e: FocusEvent) {
  blocActifId.value = id
  blocsFeuille.set(id, e.currentTarget as HTMLElement)
}
// Bloc visé par les outils ✏ / 🔗 : celui qui contient la SÉLECTION courante.
//  Source de vérité — le suivi de focus peut pointer un élément périmé après un remontage de blocs.
function blocDeSelection(): HTMLElement | null {
  const sel = document.getSelection()
  const noeud = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).commonAncestorContainer : null
  const el = noeud?.nodeType === 3 ? noeud.parentElement : (noeud as HTMLElement | null)
  return (el?.closest('.corps-notes-texte') as HTMLElement | null) ?? null
}
function blocCible(): { zone: HTMLElement; id: string } | null {
  const zone = blocDeSelection() ?? blocActif()
  const id = zone?.getAttribute('data-note-id') ?? null
  return zone && id ? { zone, id } : null
}
// Bouton ✏ : toggle `<mark>` sur la sélection du bloc visé, puis synchro explicite ;
//  un geste DOM programmatique ne déclenche pas d'input.
function marquerDansFeuille() {
  const cible = blocCible()
  if (!cible) return
  marquerPassage(cible.zone)
  onSaisieBlocFeuille(cible.id)
}
// Bouton 🔗 : enveloppe la sélection d'un `<em>` et ouvre le menu de liaison —
//  la resynchronisation passe par enregistrerSyncZoneHorsModale.
function lierDansFeuille(e: MouseEvent) {
  const cible = blocCible()
  if (cible) lierPassage(e, cible.zone)
}
// Clic droit dans un bloc : menu de liaison si la cible est un passage.
function onContextmenuBlocFeuille(e: MouseEvent) {
  ouvrirMenuLiensNote(e, e.currentTarget as HTMLElement)
}

// Réordonnancement par glisser-déposer : drag des cartes permis, ids réordonnés au drop.
//  Simple natif (dragstart/dragover/drop).
let idNoteGlissee: string | null = null
function onDragStartNote(id: string) {
  idNoteGlissee = id
}
function onDropNote(cibleId: string) {
  if (!idNoteGlissee || idNoteGlissee === cibleId) return
  const ordre = notesTriees.value.map((n) => n.id)
  const from = ordre.indexOf(idNoteGlissee)
  const to = ordre.indexOf(cibleId)
  if (from < 0 || to < 0) return
  ordre.splice(to, 0, ordre.splice(from, 1)[0])
  reordonnerNotes(ordre)
  idNoteGlissee = null
}

// --- SAISIE LIBRE (même motif que TableDonnees) ---
// Variable SANS modalité : la ligne est un champ texte permanent, chaque libellé saisi trouve-ou-crée sa modalité (dictionnaire corpus).
// Variable AVEC modalités : le select garde une option « autre… », qui bascule LA ligne en champ texte.
// La pose de la valeur passe par setValeurGen/setValeurLoc (journal + autosave de l'entretien ouvert).
const AUTRE = ' autre' // sentinelle : ne peut pas être un id de modalité
const celluleLibre = ref<string | null>(null) // clé de LA ligne en mode texte
const cleGen = (idVar: string) => `gen|${idVar}`
const cleLoc = (index: number, idVar: string) => `loc|${index}|${idVar}`

// --- ANON : lignes de saisie (en bas du tableau) ---
// Compteur « à anonymiser » d'une ligne : longueur de la requête (hits PM),
// recalculée par le composable à l'ouverture de l'onglet, au ⟳ et après chaque geste anon.
// 0 ou ligne absente → compteur masqué.
function nbAAAnonymiser(cle: string): number {
  return hitsAAnonymiserParCle.value[cle]?.length ?? 0
}
// Tooltip de l'exposant d'incluses : « plus N absorbée(s)… », jamais « dont »,
// avec les entités absorbantes distinctes.
function tooltipIncluses(cle: string): string {
  const n = lignesAnon.value.find((l) => l.cle === cle)?.nbIncluse ?? 0
  const pars = inclusesParCle.value[cle] ?? []
  const qui = pars.length ? ` par « ${pars.join('», « ')}»` : ''
  return `plus ${n} absorbée(s)${qui} (non comptée(s) ici)`
}
// Plusieurs lignes vides : on saisit un nom, « passe à la ligne suivante » (Entrée) ;
// le brouillon est persisté, et une nouvelle ligne vide s'ajoute si besoin.
// Un bouton « + » sous le tableau ajoute des lignes.
const lignesSaisie = ref<{ id: number; entite: string; pseudo: string }[]>([])
let seqSaisie = 0
const nouvelleLigneSaisie = () => ({ id: ++seqSaisie, entite: '', pseudo: '' })
lignesSaisie.value = [nouvelleLigneSaisie(), nouvelleLigneSaisie()]
// Refs par ligne (cases Nom/Pseudo) pour piloter le focus, en <textarea> multi-lignes depuis que les champs enveloppent le texte.
const refsNom = ref<Record<number, HTMLTextAreaElement | null>>({})
const refsPseudo = ref<Record<number, HTMLTextAreaElement | null>>({})
const refNom = (id: number) => (el: unknown) => {
  refsNom.value[id] = (el as HTMLTextAreaElement) ?? null
}
const refPseudo = (id: number) => (el: unknown) => {
  refsPseudo.value[id] = (el as HTMLTextAreaElement) ?? null
}
const focusNom = (id: number) => nextTick(() => refsNom.value[id]?.focus())
const focusPseudo = (id: number) => nextTick(() => refsPseudo.value[id]?.focus())

/** Nom d'entité à l'écran : texte complet tant qu'il tient dans les 5 lignes de la colonne Nom,
 *  mesuré par un probe clone ATTACHÉ au DOM (même largeur/police que la colonne,
 *  robuste au zoom/DPI) ; sinon, raccourci « début…fin ». L'affichage est stocké
 *  DANS LE MODÈLE (affichagesNoms), pas muté sur le DOM : Vue reste propriétaire
 *  du texte interpolé. */
let largeurColonneAnon = 0
/** Mesure la hauteur réelle d'un texte enveloppé dans la colonne Nom (5 lignes max en CSS) ;
 *  ici sans clamp pour connaître le besoin naturel avant raccourci. */
function mesurerNomAnon(plein: string) {
  const probe = document.createElement('span')
  probe.className = 'nom-anon'
  const s = probe.style
  s.visibility = 'hidden'
  s.position = 'absolute'
  s.left = '-9999px'
  s.top = '0'
  s.display = 'block' /* empêche le -webkit-box du clamp dans la mesure */
  if (!largeurColonneAnon) {
    const ref = document.querySelector<HTMLElement>('.tableau-anon .nom-anon')
    largeurColonneAnon = ref ? parseFloat(getComputedStyle(ref).width) : 149
  }
  s.width = largeurColonneAnon + 'px' // même largeur de colonne que le vrai span
  s.webkitLineClamp = 'unset'
  s.maxHeight = 'none'
  s.overflow = 'visible'
  probe.textContent = plein
  document.body.appendChild(probe) // DOIT être dans le DOM pour mesurer le wrap
  const h = probe.getBoundingClientRect().height
  const lh = parseFloat(getComputedStyle(probe).lineHeight) || 16.4
  probe.remove()
  return { h, lh, lignes: h / lh }
}
/** Raccourci « début…fin » d'un nom trop large : on garde des MOTS ENTIERS du début et de la fin,
 *  jamais de coupe en plein mot ; joints par « … », on réduit mot à mot tant que
 *  ça ne tient pas dans les 5 lignes. */
function raccourciMots(plein: string, hMax: number) {
  const { h, lh } = mesurerNomAnon(plein)
  const lignes = h / lh
  const budget = Math.max(6, Math.floor((plein.length / lignes) * 5) - 4) // chars tenables en 5 lignes
  const mots = plein.split(/\s+/)
  const demi = Math.floor(budget / 2)
  const debut: string[] = []
  const fin: string[] = []
  let lenD = 0
  let lenF = 0
  let i = 0
  let j = mots.length - 1
  // Mots du début (dans l'ordre) tant qu'ils tiennent dans la moitié du budget.
  while (i <= j && lenD + mots[i].length + (debut.length ? 1 : 0) <= demi) {
    lenD += mots[i].length + (debut.length ? 1 : 0)
    debut.push(mots[i++])
  }
  // Mots de la fin (en partant du dernier) tant qu'ils tiennent dans l'autre moitié.
  while (i <= j && lenF + mots[j].length + (fin.length ? 1 : 0) <= demi) {
    lenF += mots[j].length + (fin.length ? 1 : 0)
    fin.unshift(mots[j--])
  }
  // Un seul mot plus large que 5 lignes : impossible de couper un mot ; on laisse le clamp CSS tronquer avec « … » en fin de 5e ligne.
  if (!debut.length && !fin.length) return plein
  const compose = () =>
    (debut.length ? debut.join(' ') : '') + (debut.length && fin.length ? ' … ' : '') + fin.join(' ')
  let affiche = compose()
  // Garde-fou : réduit mot à mot (du côté le plus long) tant que le raccourci dépasse encore les 5 lignes mesurées.
  let it = 0
  while (it++ < 30 && mesurerNomAnon(affiche).h > hMax) {
    if (debut.length > fin.length) {
      lenD -= debut.pop()!.length + 1
    } else if (fin.length) {
      lenF -= fin.shift()!.length + 1
    } else break
    affiche = compose()
  }
  return affiche.length >= plein.length ? plein : affiche
}
const affichagesNoms = ref<Record<string, string>>({})
function majNomsAnon() {
  if (!lignesAnon.value.length) return
  const suiv = { ...affichagesNoms.value }
  for (const l of lignesAnon.value) {
    const plein = l.entite
    if (!plein.length) {
      suiv[l.cle] = plein
      continue
    }
    const { lh } = mesurerNomAnon(plein)
    const hMax = lh * 5 /* 5 lignes max */
    suiv[l.cle] = mesurerNomAnon(plein).h > hMax ? raccourciMots(plein, hMax) : plein
  }
  affichagesNoms.value = suiv
}
watch(lignesAnon, majNomsAnon, { deep: true })
onMounted(() => {
  majNomsAnon()
  window.addEventListener('resize', majNomsAnon)
})
onUnmounted(() => window.removeEventListener('resize', majNomsAnon))

/** Valide UNE ligne : pose les occurrences (validerAnon) et vide la ligne.
 *  `majuscule` (Entrée) route vers la priorité de portée (étape 4a) ; le
 *  bouton ✓ valide directement au niveau entretien. */
function validerLigne(l: { id: number; entite: string; pseudo: string }, majuscule?: boolean) {
  const e = l.entite.trim()
  const p = l.pseudo.trim()
  if (!e) {
    hintAnon.value = "Saisis ou sélectionne d'abord un nom dans le texte."
    return
  }
  if (!p) {
    hintAnon.value = 'Saisis un pseudo pour cette entité.'
    return
  }
  if (entiteExisteDeja(e)) {
    hintAnon.value = `« ${e} » est déjà dans le tableau.`
    scrollerVersLigne(e)
    return
  }
  hintAnon.value = null
  if (majuscule === undefined) {
    // Bouton ✓ : valide directement au niveau entretien.
    validerAnon(e, p)
    l.entite = ''
    l.pseudo = ''
    return
  }
  // Entrée/Maj+Entrée : créer le brouillon puis appliquer la portée routée par la priorité de validation (étape 4a).
  creerBrouillon(e, p)
  l.entite = ''
  l.pseudo = ''
  void validerAvecPriorite(e, majuscule)
}
/** Entrée sur le Nom (sans pseudo) → brouillon « entité seule » (draft inerte en attendant un pseudo),
 *  puis passage à la ligne suivante (créée au besoin). */
function brouillonDepuisLigne(l: { id: number; entite: string; pseudo: string }) {
  const e = l.entite.trim()
  if (!e) return
  if (entiteExisteDeja(e)) {
    hintAnon.value = `« ${e} » est déjà dans le tableau.`
    scrollerVersLigne(e)
    return
  }
  hintAnon.value = null
  creerBrouillon(e, l.pseudo.trim())
  l.entite = ''
  l.pseudo = ''
  const suivant = lignesSaisie.value.find((x) => x.id > l.id)
  if (suivant) focusNom(suivant.id)
  else {
    const n = nouvelleLigneSaisie()
    lignesSaisie.value.push(n)
    focusNom(n.id)
  }
}
/** Le focus quitte une ligne entièrement → auto-brouillon si un Nom est saisi ;
 *  le passage vers une autre ligne de saisie compte comme une sortie. */
function onBlurLigne(id: number, evt: FocusEvent) {
  const cible = evt.relatedTarget as Node | null
  if (cible && (evt.currentTarget as HTMLElement).contains(cible)) return
  const l = lignesSaisie.value.find((x) => x.id === id)
  if (!l) return
  const e = l.entite.trim()
  if (e && !entiteExisteDeja(e)) creerBrouillon(e, l.pseudo.trim())
  l.entite = ''
  l.pseudo = ''
  hintAnon.value = null
}
/** Pseudo d'une ligne existante édité → relabel (entretien) ou maj brouillon.
 *  Une ligne CORPUS a son pseudo dérivé de la règle : l'édition du champ est
 *  sans effet (la bascule se fait par occurrence via le menu contextuel). */
function surPseudoLigne(entite: string, etat: 'brouillon' | 'entretien' | 'corpus', value: string) {
  if (etat === 'brouillon') majBrouillonLigne(entite, value)
  else if (etat === 'entretien') validerAnon(entite, value)
}
/** Entrée sur le Pseudo d'une ligne existante : brouillon → valider selon la priorité ;
 *  Entrée = portée prioritaire, Maj+Entrée = l'autre (étape 4a), entretien → relabel
 *  via le change au blur. Corpus → sans effet. */
function surEntreePseudoLigne(
  entite: string,
  etat: 'brouillon' | 'entretien' | 'corpus',
  value: string,
  majuscule: boolean,
) {
  if (etat === 'brouillon') {
    // Synchroniser le brouillon avec la saisie avant de router (le changement de portée lit le pseudo du brouillon, pas le champ).
    const v = value.trim()
    if (v) majBrouillonLigne(entite, v)
    void validerAvecPriorite(entite, majuscule)
  } else (document.activeElement as HTMLElement | null)?.blur()
}
function scrollerVersLigne(entite: string) {
  const cle = entite.trim().toLowerCase()
  nextTick(() => {
    const el = document.querySelector(`[data-cle-anon="${CSS.escape(cle)}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}
// La sélection dans l'éditeur peuple le Nom de la PREMIÈRE ligne de saisie vide (ou en crée une).
// Les lignes déjà remplies sont d'abord persistées en brouillon :
// c'est l'auto-brouillon, on peut enchaîner plusieurs entités.
function alimenterDepuisSelection() {
  const sel = selectionAnon.value
  if (!sel) return
  const texte = sel.texte.trim()
  if (!texte) return
  const deja = lignesSaisie.value.some((l) => l.entite.trim().toLowerCase() === texte.toLowerCase())
  if (deja) return
  for (const l of lignesSaisie.value) {
    if (l.entite.trim() && !entiteExisteDeja(l.entite)) creerBrouillon(l.entite.trim(), l.pseudo.trim())
  }
  if (entiteExisteDeja(texte)) {
    hintAnon.value = `« ${texte} » est déjà dans le tableau.`
    scrollerVersLigne(texte)
    return
  }
  let ligne = lignesSaisie.value.find((l) => !l.entite.trim())
  if (!ligne) {
    ligne = nouvelleLigneSaisie()
    lignesSaisie.value.push(ligne)
  }
  ligne.entite = texte
  ligne.pseudo = ''
  hintAnon.value = null
  focusPseudo(ligne.id)
}

// Le tableau Anon se remplit au RELÂCHEMENT du clic (`mouseup`), jamais pendant le drag :
// une entité multi-mots (« New York ») n'arrive qu'une fois la souris relâchée.
// ProseMirror propage la sélection DOM de façon ASYNCHRONE (`selectionchange`) :
// plutôt que deviner un délai fixe, on surveille `selectionAnon`, en attendant deux lectures consécutives égales après le relâchement.
// On lit donc la sélection FINALE, jamais un état intermédiaire.
// Et seulement si l'onglet Anon est ouvert ; ailleurs, la sélection reste neutre.
const RELACHE_STEP = 16 // ms — cadence de surveillance (un frame)
const RELACHE_STABILITE = 2 // lectures consécutives égales → sélection figée
const RELACHE_CAP = 250 // ms — marge pire cas (alors on remplit quand même)
let tidRelache = 0
function surRelache() {
  if (ongletDroite.value !== 'anon') return
  clearTimeout(tidRelache)
  const signature = (s: typeof selectionAnon.value) =>
    s ? `${s.from}|${s.to}|${s.texte}` : ''
  let precedente = signature(selectionAnon.value)
  let stables = 0
  const depart = Date.now()
  const surveiller = () => {
    const courante = signature(selectionAnon.value)
    if (courante === precedente) stables++
    else {
      precedente = courante
      stables = 0
    }
    if (stables >= RELACHE_STABILITE || Date.now() - depart >= RELACHE_CAP) {
      alimenterDepuisSelection()
      return
    }
    tidRelache = window.setTimeout(surveiller, RELACHE_STEP)
  }
  surveiller()
}
// Écouteurs posés sur le DOM de l'éditeur, retirés au démontage.
// Les deux rendus audio/vidéo passent par le même viewer : un seul attach suffit.
let domEditeur: HTMLElement | null = null
function attacherEcouteurs(ed: typeof editor.value) {
  if (domEditeur) {
    domEditeur.removeEventListener('mouseup', surRelache)
    domEditeur.removeEventListener('keyup', surRelache)
  }
  domEditeur = ed?.view.dom ?? null
  if (domEditeur) {
    domEditeur.addEventListener('mouseup', surRelache)
    // Sélection au clavier (Maj+flèches) : peuplée à la levée de la touche.
    domEditeur.addEventListener('keyup', surRelache)
  }
}
watch(editor, attacherEcouteurs, { immediate: true })
onBeforeUnmount(() => {
  clearTimeout(tidRelache)
  if (domEditeur) {
    domEditeur.removeEventListener('mouseup', surRelache)
    domEditeur.removeEventListener('keyup', surRelache)
  }
})

/** Libellé affichable d'une valeur (id de modalité) — id brut si inconnu. */
function libelleCell(idVar: string, idMod: string | undefined): string {
  if (!idMod) return ''
  return modalitesDe(idVar).find((m) => m.id === idMod)?.lib ?? idMod
}
function surSelectGen(idVar: string, evt: Event) {
  const val = (evt.target as HTMLSelectElement).value
  if (val === AUTRE) celluleLibre.value = cleGen(idVar)
  else setValeurGen(idVar, val)
}
function surSelectLoc(index: number, idVar: string, evt: Event) {
  const val = (evt.target as HTMLSelectElement).value
  if (val === AUTRE) celluleLibre.value = cleLoc(index, idVar)
  else setValeurLoc(index, idVar, val)
}
async function surLibreGen(idVar: string, evt: Event) {
  celluleLibre.value = null
  const lib = (evt.target as HTMLInputElement).value.trim()
  setValeurGen(idVar, lib ? await modaliteParLibelle(idVar, lib) : '')
}
async function surLibreLoc(index: number, idVar: string, evt: Event) {
  celluleLibre.value = null
  const lib = (evt.target as HTMLInputElement).value.trim()
  setValeurLoc(index, idVar, lib ? await modaliteParLibelle(idVar, lib) : '')
}
/** Focus du champ texte OUVERT via « autre… ».
 *  Les champs permanents (clé non matcheuse) ne volent jamais le focus. */
function focaliserLibre(el: unknown, cle: string) {
  if (el instanceof HTMLInputElement && celluleLibre.value === cle && document.activeElement !== el)
    el.focus()
}
</script>

<template>
    <section class="ecran entretien-ecran">
      <!-- Corpus distant : bandeau quand le verrou de CET entretien est tenu par autrui ;
           le bandeau dit qui, et depuis quand. -->
      <div v-if="verrouAutrui" class="banniere-ro">
        🔒 Ouvert en lecture seule — verrou tenu par <b>{{ verrouAutrui.userId }}</b>
        depuis {{ new Date(verrouAutrui.acquiredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}.
      </div>
      <div class="grille-ent">
        <!-- Ligne d'actions pleine largeur, en HAUT de l'écran : retour corpus,
             Enregistrer, Exporter. Toute la vue ci-dessous (les deux colonnes)
             vient sous cette barre. -->
        <div class="barre">
          <button class="retour" @click="retourCorpus">← Corpus</button>
          <span class="barre-aide">Sélectionne du texte, puis clique un thème (onglet Thématique) pour le coder.</span>
          <!-- Corpus distant, session à nous : statut de publication + « Publier maintenant ».
               En lecture seule (verrou autrui) : rien à publier,
               le bandeau 🔒 au-dessus parle déjà. -->
          <template v-if="statutSession.etat === 'a-nous'">
            <span v-if="publiErreur" class="statut-session divergence">⚠️ {{ publiErreur }}</span>
            <span v-else-if="statutSession.sale" class="statut-session sale" title="Publication périodique toutes les 5 min ; le bouton force à la demande.">
              ● modifications non publiées<template v-if="statutSession.dernierPubli"> depuis {{ heureDe(statutSession.dernierPubli) }}</template>
            </span>
            <span v-else class="statut-session publie">☁ publié<template v-if="statutSession.dernierPubli"> à {{ heureDe(statutSession.dernierPubli) }}</template></span>
            <button v-if="!roContenu" class="publier-maintenant" @click="publierMaintenant">Publier maintenant</button>
          </template>
          <button v-if="!roContenu" class="sauver" @click="sauver">Enregistrer</button>
          <button class="exporter" @click="exporter">Exporter .sonal</button>
        </div>

        <!-- Colonne GAUCHE : onglets + panneau de l'onglet actif ;
             collante, à défilement interne au-delà d'un écran,
             pour rester visible pendant la lecture. -->
        <div class="colonne-gauche">
          <nav class="onglets">
            <!-- Onglets réduits à l'ICONE : le titre apparaît au survol (title),
                 et sur le panneau d'accueil (vue d'ensemble).
                 L'ACCUEIL vient en PREMIER et par DÉFAUT : accueil de l'utilisateur,
                 conseils et liste des autres onglets (icone + titre).
                 Les NOTES suivent en DEUXIÈME. -->
            <button data-onglet="maison" :class="{ actif: ongletDroite === 'maison' }" title="Accueil" @click="ongletDroite = 'maison'">
              <img class="ico-onglet" :src="icoMaison" alt="Accueil" />
            </button>
            <button data-onglet="notes" data-tour="onglet-notes" :class="{ actif: ongletDroite === 'notes' }" title="Notes" @click="ongletDroite = 'notes'">
              <img class="ico-onglet" :src="icoNotes" alt="Notes" />
            </button>
            <button data-onglet="locuteurs" data-tour="onglet-locuteurs" :class="{ actif: ongletDroite === 'locuteurs' }" title="Locuteurs" @click="ongletDroite = 'locuteurs'">
              <img class="ico-onglet" :src="icoLocuteurs" alt="Locuteurs" />
            </button>
            <button data-onglet="anon" :class="{ actif: ongletDroite === 'anon' }" title="Pseudonymisation du texte" @click="ongletDroite = 'anon'">
              <img class="ico-onglet" :src="icoAnon" alt="Pseudonymisation du texte" />
            </button>
            <button data-onglet="themes" data-tour="onglet-themes" :class="{ actif: ongletDroite === 'themes' }" title="Thématiques" @click="ongletDroite = 'themes'">
              <img class="ico-onglet" :src="icoThemes" alt="Thématiques" />
            </button>
            <button data-onglet="donnees" data-tour="onglet-donnees" :class="{ actif: ongletDroite === 'donnees' }" title="Données" @click="ongletDroite = 'donnees'">
              <img class="ico-onglet" :src="icoDonnees" alt="Données" />
            </button>
            <button data-onglet="journal" :class="{ actif: ongletDroite === 'journal' }" title="Journal" @click="ongletDroite = 'journal'">
              <img class="ico-onglet" :src="icoJournal" alt="Journal" />
            </button>
          </nav>

          <!-- Accueil : conseils + vue d'ensemble des onglets (icone + titre) →
               l'utilisateur qui arrive sur l'entretien comprend d'un coup d'œil
               ce qu'il peut faire. -->
          <aside v-show="ongletDroite === 'maison'" class="panneau maison">
            <div class="corpus-tete">
              <h3>Accueil</h3>
            </div>
            <p class="raccourci">
              🎧 Raccourci : tapez <b>DEUX FOIS</b> sur la touche <b>Espace</b> dans l'éditeur
              pour lancer puis arrêter la lecture de l'audio.
            </p>
            <p class="raccourci">
              🔍 Raccourci : dans l'éditeur, <b>Ctrl+F</b> ouvre la recherche
              et le remplacement dans la transcription.
            </p>
            <ul class="liste-tours">
              <li>
                <img class="ico-onglet" :src="icoNotes" alt="" />
                <span><b>Notes</b> — notes structurées (post-collecte, résumé, réflexion…) ; mettez un passage en GRAS (important) ou en ITALIQUE lié à un commentaire.</span>
              </li>
              <li>
                <img class="ico-onglet" :src="icoLocuteurs" alt="" />
                <span><b>Locuteurs</b> — noms, interviewer, attribution des tours de parole.</span>
              </li>
              <li>
                <img class="ico-onglet" :src="icoAnon" alt="" />
                <span><b>Pseudonymisation du texte</b> — masquer les noms (barré + pseudo).</span>
              </li>
              <li>
                <img class="ico-onglet" :src="icoThemes" alt="" />
                <span><b>Thématiques</b> — sélectionnez du texte puis cliquez un thème pour le coder.</span>
              </li>
              <li>
                <img class="ico-onglet" :src="icoDonnees" alt="" />
                <span><b>Données</b> — valeurs de l'entretien et de chaque locuteur.</span>
              </li>
              <li>
                <img class="ico-onglet" :src="icoJournal" alt="" />
                <span><b>Journal</b> — suivi et annulation des actions de la session.</span>
              </li>
            </ul>
          </aside>

          <!-- Thématique : clic sur un thème = coder la sélection.
               L'ÉDITION (créer/renommer/couleur/taille/arbre/supprimer) passe par le crayon,
               vers la fenêtre EditionThemes partagée avec l'écran Corpus. -->
          <aside v-show="ongletDroite === 'themes'" class="panneau themes-coder">
            <div class="corpus-tete">
              <h3>Thématiques</h3>
              <button v-if="!lectureSeule" class="crayon" title="Éditer les thèmes" @click="editerThemes = true">✏️</button>
            </div>
            <p class="aide-thm">Sélectionne du texte, puis clique un thème pour le coder (re-clic = retirer).</p>
            <p v-if="hintCodage" class="hint-codage">{{ hintCodage }}</p>

            <p v-if="codebook.length === 0" class="vide">Aucun thème — ✏️ pour en créer.</p>
            <ul class="liste-coder">
              <li v-for="n in arbreVisible" :key="n.cat.id" class="ligne-coder">
                <button
                  class="theme-coder"
                  :class="{ inactif: !n.cat.actif }"
                  :style="{ marginLeft: n.profondeur * 1.1 + 'rem' }"
                  :disabled="roContenu"
                  @click="coderAvec(n.cat.id)"
                  @contextmenu.prevent="ouvrirMenuTheme(n.cat, $event)"
                >
                  <span
                    v-if="n.aEnfants"
                    class="depliant"
                    role="button"
                    :title="repliesThemes.has(n.cat.id) ? 'Replier les sous-thèmes' : 'Déplier les sous-thèmes'"
                    @click.stop="basculerRepli(n.cat.id)"
                  >
                    {{ repliesThemes.has(n.cat.id) ? '▸' : '▾' }}
                  </span>
                  <span v-else class="depliant depliant-masque"></span>
                  <span class="pastille" :style="{ background: couleurHex(n.cat) }"></span>
                  <!-- Taille de police UNIFORME : la taille d'un thème ne s'applique qu'au marquage dans le texte. -->
                  <span class="theme-nom">{{ n.cat.nom }}</span>
                  <span class="usage" :title="`${usages[n.cat.id] ?? 0} codage(s)`">{{ usages[n.cat.id] ?? 0 }}</span>
                </button>
              </li>
            </ul>
          </aside>

          <!-- Locuteurs -->
          <aside v-show="ongletDroite === 'locuteurs'" class="panneau">
            <div class="corpus-tete">
              <h3>Locuteurs</h3>
              <button v-if="!roContenu" class="mini" @click="nouveauLocuteur">+ Locuteur</button>
            </div>

            <!-- Confirmation de suppression (destructif : nom + valeurs + lien des blocs) -->
            <div v-if="locuteurASupprimer" class="confirm-suppr">
              Supprimer « {{ locuteurASupprimer.nom }} » ? Ses
              <b>{{ locuteurASupprimer.nbBlocs }} bloc(s)</b> passent à « aucun » — <b>irréversible</b>.
              <div class="confirm-actions">
                <button class="danger" @click="confirmerSuppressionLocuteur">Supprimer</button>
                <button @click="locuteurASupprimer = null">Annuler</button>
              </div>
            </div>

            <!-- Petit tableau des locuteurs : Nom | Pseudo (optionnel) | Interv. | ✕.
                 Le pseudo posé pseudonymise les étiquettes des tours ;
                 barré + [pseudo] dans la gouttière. -->
            <div class="tableau-loc">
              <div class="tableau-loc-tetes">
                <span title="Couleur du nom — cliquer pour choisir"></span>
                <span>Nom</span>
                <span>Pseudo (optionnel)</span>
                <span title="Interviewer — pose les questions (tours en italique)">Interv.</span>
              </div>
              <ul class="liste-loc">
                <li v-for="(l, i) in locuteurs" :key="l.index">
                  <!-- Sélecteur de couleur du nom : défaut auto par index (palette prédéfinie) ;
                       au clic, le sélecteur NATIF du navigateur (même mécanisme que l'édition des thèmes,
                       TOUTES les couleurs possibles).
                       Le nom s'écrit dans la couleur choisie dans l'éditeur, sans toucher au pseudo. -->
                  <input
                    type="color"
                    class="carre-couleur"
                    :value="l.couleur ?? couleurPourLocuteur(l.index)"
                    :title="`Couleur du nom — choisir (actuelle : ${l.couleur ?? 'automatique'})`"
                    :disabled="roContenu"
                    @change="choisirCouleurLoc(l.index, ($event.target as HTMLInputElement).value)"
                  />
                  <!-- data-tour sur le 1er nom uniquement : cible de l'étape « Renommer les locuteurs » du pas-à-pas. -->
                  <input
                    class="nom-loc"
                    :data-tour="i === 0 ? 'nom-locuteur' : undefined"
                    :value="l.nom"
                    :disabled="roContenu"
                    @change="renommerLoc(l.index, $event)"
                  />
                  <div class="pseudo-cell">
                    <input
                      class="pseudo-loc"
                      :value="l.pseudo ?? ''"
                      placeholder="pseudo…"
                      title="Pseudonymise les étiquettes de ce locuteur (Nom̶ [pseudo])"
                      :disabled="roContenu"
                      @change="setPseudoLoc(l.index, ($event.target as HTMLInputElement).value)"
                    />
                  </div>
                  <label class="interv" :title="`${l.nom} pose les questions (interviewer) — tours en italique`">
                    <input
                      type="checkbox"
                      :checked="l.interviewer ?? false"
                      :disabled="roContenu"
                      @change="setInterviewer(l.index, ($event.target as HTMLInputElement).checked)"
                    />
                    <span class="glisseur"></span>
                    <span class="q">?</span>
                  </label>
                  <button v-if="!roContenu" class="x-loc" title="Supprimer ce locuteur" @click="demanderSuppressionLocuteur(l.index)">✕</button>
                </li>
              </ul>
            </div>
            <div class="attribuer">
              <span class="lbl">Attribuer le bloc courant ou la sélection :</span>
              <div class="boutons-loc">
                <button v-for="l in locuteurs" :key="l.index" class="attr" :disabled="roContenu" @click="attribuerLoc(l.index)">
                  <span
                    :style="{ color: l.couleur ?? couleurPourLocuteur(l.index) }"
                  >{{ l.nom }}</span>
                </button>
                <button class="attr aucun" :disabled="roContenu" @click="attribuerLoc(null)">aucun</button>
              </div>
            </div>
          </aside>

          <!-- Données de CET entretien : saisie des valeurs (2 niveaux : entretien + locuteur),
               même saisie libre que la Table de données (« autre… », variable sans modalité = champ texte).
               Le crayon ouvre la fenêtre EditionVariables partagée (créer/éditer des variables sans repasser par l'écran Corpus) ;
               la matrice complète reste à la Table. -->
          <aside v-show="ongletDroite === 'donnees'" class="panneau donnees">
            <div class="corpus-tete">
              <h3>Données</h3>
              <button v-if="!roContenu" class="crayon" title="Éditer les variables (nom, statut, modalités)" @click="editerVariables = true">✏️</button>
            </div>

            <template v-if="varsGen().length">
              <h4 class="h4-ent">Valeurs · cet entretien</h4>
              <div v-for="v in varsGen()" :key="v.id" class="saisie-eav">
                <span class="saisie-eav-lib">{{ v.lib }}</span>
                <input
                  v-if="v.modalites.length === 0 || celluleLibre === cleGen(v.id)"
                  class="saisie-eav-libre"
                  placeholder="texte libre"
                  :disabled="roContenu"
                  :value="celluleLibre === cleGen(v.id) ? '' : libelleCell(v.id, meta.valeursGen[v.id])"
                  :ref="(el) => focaliserLibre(el, cleGen(v.id))"
                  @keyup.enter="($event.target as HTMLInputElement).blur()"
                  @keyup.esc="celluleLibre = null"
                  @change="surLibreGen(v.id, $event)"
                  @blur="celluleLibre = null"
                />
                <select
                  v-else
                  class="saisie-eav-sel"
                  :disabled="roContenu"
                  :value="meta.valeursGen[v.id] ?? ''"
                  @change="surSelectGen(v.id, $event)"
                >
                  <option value="">—</option>
                  <option v-for="m in v.modalites" :key="m.id" :value="m.id">{{ m.lib }}</option>
                  <option :value="AUTRE">autre…</option>
                </select>
              </div>
            </template>

            <template v-if="varsLoc().length && locuteurs.length">
              <h4 class="h4-loc">Valeurs · par locuteur</h4>
              <div v-for="l in locuteurs" :key="l.index" class="fiche-loc">
                <div class="fiche-loc-nom">{{ l.nom }}</div>
                <div v-for="v in varsLoc()" :key="v.id" class="saisie-eav">
                  <span class="saisie-eav-lib">{{ v.lib }}</span>
                  <input
                    v-if="v.modalites.length === 0 || celluleLibre === cleLoc(l.index, v.id)"
                    class="saisie-eav-libre"
                    placeholder="texte libre"
                    :disabled="roContenu"
                    :value="celluleLibre === cleLoc(l.index, v.id) ? '' : libelleCell(v.id, l.valeursLoc[v.id])"
                    :ref="(el) => focaliserLibre(el, cleLoc(l.index, v.id))"
                    @keyup.enter="($event.target as HTMLInputElement).blur()"
                    @keyup.esc="celluleLibre = null"
                    @change="surLibreLoc(l.index, v.id, $event)"
                    @blur="celluleLibre = null"
                  />
                  <select
                    v-else
                    class="saisie-eav-sel"
                    :disabled="roContenu"
                    :value="l.valeursLoc[v.id] ?? ''"
                    @change="surSelectLoc(l.index, v.id, $event)"
                  >
                    <option value="">—</option>
                    <option v-for="m in v.modalites" :key="m.id" :value="m.id">{{ m.lib }}</option>
                    <option :value="AUTRE">autre…</option>
                  </select>
                </div>
              </div>
            </template>

            <p v-if="!varsGen().length && !varsLoc().length" class="vide">
              Aucune variable — ✏️ pour en créer.
            </p>
          </aside>

          <!-- Journal des actions de modèle : 10 dernières, annulation sélective. -->
          <aside v-show="ongletDroite === 'journal'" class="panneau journal">
            <div class="corpus-tete">
              <h3>Journal</h3>
            </div>
            <p class="aide-thm">
              Actions de modèle de la session (10 dernières). La frappe de texte s'annule avec Ctrl+Z.
            </p>
            <p v-if="entreesJournal.length === 0" class="vide">Aucune action enregistrée.</p>
            <ul class="liste-journal">
              <li v-for="e in entreesJournal" :key="e.id" :class="{ grisee: !e.annulable }">
                <span class="heure">{{ e.heure }}</span>
                <span class="lib-journal">{{ e.libelle }}</span>
                <button
                  class="annuler-entree"
                  :disabled="!e.annulable"
                  :title="e.annulable ? 'Annuler cette action' : 'Non annulable — la cible a disparu'"
                  v-if="!roContenu"
                  @click="annulerEntree(e.id)"
                >↩</button>
              </li>
            </ul>
          </aside>

          <!-- Notes : notes structurées (catégorie + date + statut + corps surlignable).
               Vue cartes par défaut, ou texte concaténé (expand).
               Création/édition par modale inline.
               Catégories gérées dans un sous-volet (nom + couleur, comme les locuteurs). -->
          <aside v-show="ongletDroite === 'notes'" class="panneau notes">
            <div class="corpus-tete">
              <h3>Notes</h3>
              <div class="notes-outils">
                <button class="mini"
                  :class="{ actif: vueNotes === 'cartes' }"
                  title="Vue cartes"
                  @click="vueNotes = 'cartes'">🃏</button>
                <button class="mini"
                  :class="{ actif: vueNotes === 'texte' }"
                  title="Vue feuille (toutes les notes à la suite, éditables)"
                  @click="vueNotes = 'texte'">📄</button>
                <button class="mini"
                  :class="{ actif: voletRechercheNotes }"
                  title="Rechercher et filtrer les notes"
                  @click="basculerRechercheNotes">🔍</button>
                <button class="mini" :disabled="notes.length === 0"
                  :title="notesCopiees ? 'Copié !' : 'Copier les notes affichées dans le presse-papier'"
                  @click="copierNotes">{{ notesCopiees ? '✓' : '📋' }}</button>
              </div>
              <button v-if="!roContenu" class="mini" data-tour="creer-note" @click="ajouterNote">+ Note</button>
            </div>

            <!-- Volet recherche (deux lignes pour ne pas déborder) :
                 texte libre + compteur, puis filtres catégorie / statut /
                 passages (important, lié à un commentaire). -->
            <div v-if="voletRechercheNotes" class="volet-recherche-notes">
              <div class="ligne-recherche">
                <input v-model="filtreNotes" placeholder="Rechercher dans les notes…" />
                <span class="compte-notes" title="Notes affichées / total">{{ notesAffichees.length }}/{{ notes.length }}</span>
                <button class="mini" title="Effacer la recherche et les filtres"
                  @click="reinitialiserRechercheNotes">✕</button>
              </div>
              <div class="ligne-recherche">
                <select v-model="filtreCategorie" class="filtre-categorie" title="Filtrer par catégorie">
                  <option value="">Toutes catégories</option>
                  <option v-for="c in categoriesNote" :key="c.id" :value="c.id">{{ c.nom }}</option>
                </select>
                <select v-model="filtreStatut" class="filtre-statut" title="Filtrer par statut">
                  <option value="">Tous statuts</option>
                  <option value="prive">privé</option>
                  <option value="public">public</option>
                </select>
                <select v-model="filtrePassage" class="filtre-passage" title="Filtrer par passage">
                  <option value="">Tous passages</option>
                  <option value="mark">avec passage important</option>
                  <option value="lien">lié à un commentaire</option>
                </select>
              </div>
            </div>

            <!-- Vue cartes : une carte par note, triée par rang. -->
            <div v-if="vueNotes === 'cartes'" class="notes-cartes">
              <p v-if="notesAffichees.length === 0" class="vide">
                {{ rechercheActive ? 'Aucune note ne correspond.' : 'Aucune note — « + Note » pour en créer une.' }}
              </p>
              <article v-for="n in notesAffichees" :key="n.id" class="carte-note"
                :draggable="!roContenu"
                @dragstart="onDragStartNote(n.id)"
                @dragover.prevent
                @drop="onDropNote(n.id)"
              >
                <header class="carte-note-tete">
                  <span class="pastille-cat" :style="{ background: couleurCategorieNote(n.categorieId) }"></span>
                  <span class="nom-cat" :style="{ color: couleurCategorieNote(n.categorieId) }">{{ nomCategorieNote(n.categorieId) }}</span>
                  <span class="date-cat">{{ dateLibelle(n.date) }}</span>
                  <span class="statut-cat" :class="n.statut">{{ n.statut === 'public' ? 'public' : 'privé' }}</span>
                  <span v-if="!roContenu" class="carte-note-actions">
                    <button class="mini" title="Éditer" @click="editerNote(n.id)">✎</button>
                    <button class="mini danger" title="Supprimer" @click="supprimerNote(n.id)">✕</button>
                  </span>
                </header>
                <!-- v-html sûr : titre échappé ou corps sanitisé, puis surlignage des occurrences au DOM.
                     Sans titre : aperçu borné par CSS (.apercu-note) ; avec titre, le titre seul. -->
                <div v-if="n.titre" class="titre-note" v-html="titreAvecHits(n.titre)"></div>
                <div v-else class="corps-note apercu-note" v-html="corpsAvecRefsEtHits(n)" @click="clicRefCommentaire"></div>
              </article>
            </div>

            <!-- Vue feuille : toutes les notes à la suite, ÉDITABLES par défaut ;
                 en-tête (catégorie · date · statut) figé.
                 Contenu éditable sur place (passages <mark>/<em>, sauvegarde à chaque frappe). -->
            <div v-else ref="feuilleEl" class="notes-texte">
              <p v-if="notesAffichees.length === 0" class="vide">
                {{ rechercheActive ? 'Aucune note ne correspond.' : '(aucune note)' }}
              </p>
              <div v-if="!roContenu && notesAffichees.length > 0" class="barre-outils-note">
                <button class="mini" title="Mettre en gras le passage sélectionné (passage important, toggle)"
                  @click="marquerDansFeuille">✏ Marquer comme important</button>
                <button class="mini" title="Lier le passage sélectionné à un commentaire (italique)"
                  @click="lierDansFeuille($event)">🔗 Lier à un commentaire</button>
              </div>
              <article v-for="n in notesAffichees" :key="n.id" class="bloc-notes-texte">
                <!-- En-tête à la couleur de la catégorie, même teinte que la pastille des cartes. -->
                <!-- En-tête harmonisé avec les cartes : catégorie à sa couleur (en gras), date et statut grisés. -->
                <span class="tete-notes-texte">[<span class="cat-notes-texte" :style="{ color: couleurCategorieNote(n.categorieId) }">{{ nomCategorieNote(n.categorieId) }}</span><span class="meta-notes-texte"> · {{ dateLibelle(n.date) }} · {{ n.statut === 'public' ? 'public' : 'privé' }}</span>]</span>
                <!-- Le titre s'édite en place quand la feuille est en édition. -->
                <input v-if="editionFeuille && !roContenu" class="titre-feuille" :value="n.titre"
                  placeholder="(sans titre)"
                  @change="ecrireTitreNote(n.id, ($event.target as HTMLInputElement).value)"
                />
                <span v-else-if="n.titre" class="titre-note" v-html="titreAvecHits(n.titre)"></span>
                <div class="corps-notes-texte"
                  v-decore-bloc="n.id"
                  :data-note-id="n.id"
                  :contenteditable="editionFeuille && !roContenu ? 'true' : 'false'"
                  data-placeholder="Votre note… (sélectionnez un passage puis ✏ pour le marquer)"
                  @focusin="onFocusBloc(n.id, $event)"
                  @input="onSaisieBlocFeuille(n.id)"
                  @contextmenu="onContextmenuBlocFeuille"
                  @click="clicRefCommentaire"
                ></div>
              </article>
            </div>
          </aside>

          <!-- Formulaire de note (modale inline) : corps contenteditable + méta (catégorie, date, statut).
               Ouvert par + Note ou éditer.
               Teleport vers <body> : la colonne gauche est sticky (contexte d'empilement),
               sinon l'éditeur serait peint PAR-DESSUS la modale quel que soit son z-index. -->
          <Teleport to="body">
          <div v-if="brouillonNote" class="modale-note">
            <div class="modale-note-fond" @click="annulerNote"></div>
            <div class="modale-note-fenetre">
              <div class="corpus-tete">
                <h3>{{ brouillonNote.id ? 'Éditer la note' : 'Nouvelle note' }}</h3>
                <button class="mini" title="Fermer" @click="annulerNote">✕</button>
              </div>
              <div class="modale-note-corps">
                <!-- Titre optionnel : affiché seul en vue cartes à la place d'un aperçu du corps ; vide = aperçu du corps tronqué. -->
                <label class="champ-note champ-titre-note">
                  <span>Titre (optionnel)</span>
                  <input type="text" v-model="brouillonNote.titre" placeholder="ex. hypothèse centrale" />
                </label>
                <!-- Corps : contenteditable. Les passages y sont visibles :
                     « Marquer comme important » enveloppe la sélection d'un
                     <mark> (gras), « Lier à un commentaire » d'un <em> (italique,
                     lié aux commentaires). -->
                <div
                  ref="zoneCorpsNote"
                  class="zone-corps-note"
                  contenteditable="true"
                  data-placeholder="Votre note… (sélectionnez un passage puis ✏ pour le marquer)"
                  @input="onSaisieCorpsNote"
                  @contextmenu="onContextmenuCorpsNote"
                  @click="clicRefCommentaire"
                ></div>
                <div class="barre-outils-note">
                  <button class="mini" title="Mettre en gras le passage sélectionné (passage important, toggle)"
                    @click="marquerDansModale">✏ Marquer comme important</button>
                  <button class="mini" title="Lier le passage sélectionné à un commentaire (italique)"
                    @click="zoneCorpsNote && lierPassage($event, zoneCorpsNote)">🔗 Lier à un commentaire</button>
                </div>
                <!-- Avertissement (ex. « autre… » non créé au moment de la validation) :
                     visible au-dessus des méta. -->
                <p v-if="avertissementNote" class="msg-avert">{{ avertissementNote }}</p>
                <div class="modale-note-meta">
                  <label class="champ-note">
                    <span>Catégorie</span>
                    <select v-model="brouillonNote.categorieId">
                      <option v-for="c in categoriesNote" :key="c.id" :value="c.id">{{ c.nom }}</option>
                      <option value=" autre">autre…</option>
                    </select>
                    <!-- Carré couleur : recolore la catégorie choisie (déf.
                         corpus, partagée par tous les entretiens). Sur
                         « autre… », il ouvre la mini-modale de création à la
                         place de l'ancien bouton ＋ Créer. -->
                    <input v-if="brouillonNote.categorieId !== ' autre'" type="color"
                      class="carre-couleur"
                      :value="couleurCategorieNote(brouillonNote.categorieId)"
                      :title="`Couleur de la catégorie « ${nomCategorieNote(brouillonNote.categorieId)} »`"
                      @change="majCouleurCategorieNote(brouillonNote.categorieId, ($event.target as HTMLInputElement).value)"
                    />
                    <button v-else type="button" class="carre-couleur carre-creation"
                      title="Nouvelle catégorie (nom + couleur)"
                      @click="ouvrirCreationCategorie">＋</button>
                  </label>
                  <label class="champ-note">
                    <span>Date</span>
                    <input type="date" v-model="brouillonNote.date" />
                    <button v-if="brouillonNote.date" class="mini" title="Pas de date" @click="brouillonNote.date = null">✕</button>
                  </label>
                  <label class="champ-note">
                    <span>Statut</span>
                    <select v-model="brouillonNote.statut">
                      <option value="prive">privé</option>
                      <option value="public">public</option>
                    </select>
                  </label>
                </div>
              </div>
              <div class="modale-note-pied">
                <button class="principal" @click="validerNote">Valider</button>
                <button @click="annulerNote">Annuler</button>
              </div>
            </div>

            <!-- Mini-modale créer une catégorie (trouver-ou-créer). -->
            <div v-if="creationCategorie" class="sous-modale-categorie">
              <div class="sous-modale-fond" @click="creationCategorie = null"></div>
              <div class="sous-modale-fenetre">
                <h4>Nouvelle catégorie</h4>
                <label class="champ-note">
                  <span>Nom</span>
                  <input v-model="creationCategorie.nom" placeholder="ex. synthèse" @keyup.enter="validerCreationCategorie" />
                </label>
                <label class="champ-note">
                  <span>Couleur</span>
                  <input type="color" v-model="creationCategorie.couleur" />
                </label>
                <div class="modale-note-pied">
                  <button class="principal" :disabled="!creationCategorie.nom.trim()" title="Donnez un nom à la catégorie"
                    @click="validerCreationCategorie">Créer</button>
                  <button @click="creationCategorie = null">Annuler</button>
                </div>
              </div>
            </div>
          </div>
          <!-- Menu de liaison d'un passage aux commentaires (clic droit ou bouton 🔗) :
               frère DE LA MODALE dans le Teleport — monté dès que menuLiensNote est posé,
               modale ouverte ou non (feuille). -->
          <MenuLiensNote
              v-if="menuLiensNote"
              :x="menuLiensNote.x"
              :y="menuLiensNote.y"
              :commentaires="commentairesPourLiaison"
              :liens="menuLiensNote.liens"
              @lier="lierCommentaireNote"
              @delier="delierCommentaireNote"
              @fermer="fermerMenuLiensNote"
            />
          </Teleport>

          <!-- Anon : pseudonymisation du texte, une ligne par entité (brouillon sans occurrence ou occurrences posées) ;
               la sélection peuple la ligne de saisie.
               Entrée sur le Pseudo pose les occurrences (barré + [pseudo], cf. editeur.css). -->
          <aside v-show="ongletDroite === 'anon'" class="panneau anon">
            <div class="corpus-tete">
              <h3>Pseudonymisation du texte</h3>
              <div class="tete-actions">
                <button
                  type="button"
                  class="mini"
                  title="Recalculer les compteurs (à anonymiser)"
                  @click="rafraichirCompteursAAAnonymiser()"
                >⟳</button>
                <button
                  type="button"
                  class="mini"
                  title="Ajouter une ligne de saisie"
                  v-if="!roContenu"
                  @click="lignesSaisie.push(nouvelleLigneSaisie())"
                >+ Ligne</button>
              </div>
            </div>
            <p class="aide-thm">
              Sélectionne un mot dans le texte ou saisis un nom ci-dessous, complète le pseudo puis Entrée : toutes les occurrences sont barrées et le pseudo s'affiche.
              Plusieurs graphies d'un même nom : sépare-les par « / » (ex. Lyon/Lyons). Multi-pseudo : « Claire / Rebecca » dans Pseudo, puis clic droit sur une occurrence pour basculer.
            </p>
            <p v-if="hintAnon" class="hint-codage">{{ hintAnon }}</p>

            <table class="tableau-anon">
              <thead>
                <tr>
                  <th class="col-entite">Mot ou sélection</th>
                  <th class="col-pseudo">Pseudo</th>
                  <th class="col-actions">État · Occ.</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="l in lignesAnon"
                  :key="l.cle"
                  :data-cle-anon="l.cle"
                  class="ligne-anon"
                  :class="`etat-${l.etat}`"
                >
                  <td class="col-entite">
                    <span class="nom-anon" :title="l.entite">{{ affichagesNoms[l.cle] ?? l.entite }}</span>
                  </td>
                  <td class="col-pseudo">
                    <textarea
                      class="pseudo-anon"
                      rows="1"
                      :value="l.pseudo"
                      :placeholder="l.etat === 'brouillon' ? 'pseudo…' : ''"
                      :disabled="roContenu"
                      @keydown.enter.prevent="surEntreePseudoLigne(l.entite, l.etat, ($event.target as HTMLTextAreaElement).value, $event.shiftKey)"
                      @change="surPseudoLigne(l.entite, l.etat, ($event.target as HTMLTextAreaElement).value)"
                    ></textarea>
                  </td>
                  <td class="col-actions">
                    <div class="actions-empile">
                      <div class="portee-slider" :class="`portee-${l.etat}`" :title="l.etat === 'brouillon' ? 'Brouillon — draft local' : l.etat === 'entretien' ? 'Entretien — occurrences posées' : 'Corpus — règle partagée'">
                        <button
                          type="button"
                          class="portee-cran"
                          :class="{ actif: l.etat === 'brouillon' }"
                          :disabled="roContenu || l.etat === 'brouillon'"
                          title="Brouillon — pas encore appliqué"
                          @click="changerPorteeAnon(l.entite, 'brouillon')"
                        >🚧</button>
                        <button
                          type="button"
                          class="portee-cran"
                          :class="{ actif: l.etat === 'entretien' }"
                          :disabled="roContenu || l.etat === 'entretien' || l.etat === 'corpus'"
                          title="Entretien — occurrences posées"
                          @click="changerPorteeAnon(l.entite, 'entretien')"
                        >📄</button>
                        <button
                          type="button"
                          class="portee-cran corpus"
                          :class="{ actif: l.etat === 'corpus' }"
                          :disabled="roContenu || l.etat === 'corpus' || lectureSeule"
                          :title="lectureSeule ? 'Nécessite une connexion au corpus partagé' : 'Corpus — règle d’anonymisation partagée du corpus'"
                          @click="changerPorteeAnon(l.entite, 'corpus')"
                        >🌐</button>
                      </div>
                      <!-- Thématique (4c) : badge-sélecteur sur les lignes CORPUS quand le réglage est activé au panneau Pseudos. -->
                      <select
                        v-if="l.etat === 'corpus' && thematiquesActives.length"
                        class="cat-select"
                        :value="categorieDeLigne(l.entite)"
                        title="Thématique de l'entité"
                        :disabled="roContenu || lectureSeule"
                        @change="categoriserLigne(l.entite, ($event.target as HTMLSelectElement).value)"
                      >
                        <option value="">—</option>
                        <option v-for="t in thematiquesActives" :key="t" :value="t">{{ t }}</option>
                      </select>
                      <div class="occ-action">
                        <!-- Widget de navigation ◄ i/N ► (loupe), tant qu'un repérage est actif sur CETTE ligne. -->
                        <span v-if="reperageAnon?.cle === l.cle" class="reperage-nav" :class="`rep-${reperageAnon.categorie}`">
                          <button type="button" class="rep-btn" title="Occurrence précédente" @click="naviguerReperage(-1)">◄</button>
                          <span class="rep-pos">{{ reperageAnon.index + 1 }}/{{ reperageAnon.hits.length }}</span>
                          <button type="button" class="rep-btn" title="Occurrence suivante" @click="naviguerReperage(1)">►</button>
                          <button type="button" class="rep-btn rep-close" title="Terminer le repérage" @click="arreterReperage()">✕</button>
                        </span>
                        <template v-else>
                          <template v-if="(l.variantes?.length ?? 0) > 1">
                            <span
                              v-for="v in l.variantes"
                              :key="v.pseudo"
                              class="cpt-variante"
                            >{{ v.pseudo }}&nbsp;<button
                                v-if="v.nbAnonymise > 0"
                                type="button"
                                class="cpt-btn cpt-anon"
                                :title="`Repérer les ${v.nbAnonymise} occurrence(s) anonymisée(s) « ${v.pseudo} »`"
                                @click="demarrerReperage(l.cle, 'anonymise', v.pseudo)"
                              >{{ v.nbAnonymise }}</button><button
                                v-if="v.nbException > 0"
                                type="button"
                                class="cpt-btn cpt-exc"
                                :title="`Repérer les ${v.nbException} exception(s) « ${v.pseudo} »`"
                                @click="demarrerReperage(l.cle, 'exception', v.pseudo)"
                              >{{ v.nbException }}</button></span>
                          </template>
                          <template v-else>
                            <button
                              v-if="l.nbAnonymise > 0"
                              type="button"
                              class="cpt-btn cpt-anon"
                              :title="`Repérer les ${l.nbAnonymise} occurrence(s) anonymisée(s)`"
                              @click="demarrerReperage(l.cle, 'anonymise')"
                            >{{ l.nbAnonymise }}</button>
                            <button
                              v-if="l.nbException > 0"
                              type="button"
                              class="cpt-btn cpt-exc"
                              :title="`Repérer les ${l.nbException} exception(s)`"
                              @click="demarrerReperage(l.cle, 'exception')"
                            >{{ l.nbException }}</button>
                          </template>
                          <button
                            v-if="nbAAAnonymiser(l.cle) > 0"
                            type="button"
                            class="cpt-btn cpt-aanon"
                            :title="`Repérer les ${nbAAAnonymiser(l.cle)} occurrence(s) à anonymiser`"
                            @click="demarrerReperage(l.cle, 'a-anonymiser')"
                          >À {{ nbAAAnonymiser(l.cle) }}</button>
                        </template>
                        <!-- Incluses : exposant non cliquable, et absorbées par une entité plus large ;
                             le clic retombe sur la règle large. -->
                        <span
                          v-if="l.nbIncluse > 0"
                          class="cpt-incl"
                          :title="tooltipIncluses(l.cle)"
                        >+{{ l.nbIncluse }}</span>
                        <!-- Emplacement réservé : exposant « +N incluse(s) » (chevauchements de règles). -->
                        <button v-if="!roContenu && reperageAnon?.cle !== l.cle" class="x-anon" title="Supprimer cette ligne" @click="supprimerLigneAnon(l.entite)">✕</button>
                      </div>
                    </div>
                  </td>
                </tr>

                <!-- Lignes de saisie/draft : une entité par ligne ;
                     Entrée sur le Nom → brouillon + passage à la ligne suivante ;
                     Entrée sur le Pseudo ou ✓ → valider. -->
                <tr
                  v-for="l in lignesSaisie"
                  :key="l.id"
                  class="ligne-anon saisie-anon"
                  @focusout="onBlurLigne(l.id, $event)"
                >
                  <td class="col-entite">
                    <textarea
                      class="nom-saisie"
                      rows="1"
                      v-model="l.entite"
                      placeholder="nom…"
                      :ref="refNom(l.id)"
                      @keydown.enter.prevent="brouillonDepuisLigne(l)"
                    ></textarea>
                  </td>
                  <td class="col-pseudo">
                    <textarea
                      class="pseudo-anon"
                      rows="1"
                      v-model="l.pseudo"
                      placeholder="pseudo…"
                      :ref="refPseudo(l.id)"
                      @keydown.enter.prevent="validerLigne(l, $event.shiftKey)"
                    ></textarea>
                  </td>
                  <td class="col-actions">
                    <button class="ok-anon" title="Anonymiser toutes les occurrences" @click="validerLigne(l)">✓</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </aside>

          <!-- Ancre de la consigne « panneau » du pas-à-pas : le guide de l'étape (ex. « Prendre des notes à chaud »)
               s'affiche EN BAS de la colonne de gauche, sous le panneau de l'onglet actif.
               Pas en haut, ni en bulle flottante sur le texte. -->
          <div data-tour="ancre-guide-pp"></div>
        </div>

        <!-- Colonne DROITE : en audio, lecteur (barre d'écoute + waveform)
             collant puis éditeur ; en vidéo, zone média épinglée (lecteur +
             waveform EMPILÉS à gauche ‖ panneau vidéo à droite) puis éditeur
             pleine largeur dessous. -->
        <div class="colonne-droite">
          <template v-if="!estVideo">
            <div class="lecteur-ancre">
              <LecteurAudio />
            </div>
            <EditorContent :editor="editor" class="cadre" />
          </template>
          <template v-else>
            <div class="zone-media">
              <div class="tele">
                <LecteurAudio :empile="true" />
                <!-- Ouvrir/fermer la vue vidéo : quand elle est fermée, la barre de son prend toute la largeur (pas de trou), l'audio continue. -->
                <button class="video-toggle" :title="videoVisible ? 'Masquer la vidéo' : 'Afficher la vidéo'" @click="toggleVideo">
                  {{ videoVisible ? '▾ Masquer la vidéo' : '▸ Afficher la vidéo' }}
                </button>
              </div>
              <VideoPanel v-show="videoVisible" />
            </div>
            <EditorContent :editor="editor" class="cadre" />
          </template>
        </div>
      </div>

      <EditionThemes v-if="editerThemes" contexte="entretien" @fermer="editerThemes = false" />
      <MenuTheme
        v-if="menuTheme"
        :x="menuTheme.x"
        :y="menuTheme.y"
        :nom="menuTheme.nom"
        :actif="menuTheme.actif"
        @basculer="basculerActifTheme"
        @fermer="menuTheme = null"
      />
      <EditionVariables v-if="editerVariables" @fermer="editerVariables = false" />

      <!-- Boîte recherche/remplacement (ouverte par Ctrl+F) : flottante en bas à droite,
           visible quel que soit le défilement du texte. Entrée = occurrence suivante,
           Échap ferme ; le remplacement est masqué si le verrou d'autrui fige
           l'entretien (roContenu). -->
      <div v-if="rechercheOuverte" class="barre-recherche">
        <div class="ligne-recherche">
          <input
            id="champ-recherche"
            v-model="rechercheTexte"
            placeholder="Rechercher…"
            @keydown.enter.prevent="naviguerRecherche(1)"
            @keydown.escape="fermerRecherche"
          />
          <span class="compte">{{ compteRecherche }}</span>
          <button title="Occurrence précédente" :disabled="!occurrencesRecherche.length" @click="naviguerRecherche(-1)">‹</button>
          <button title="Occurrence suivante (Entrée)" :disabled="!occurrencesRecherche.length" @click="naviguerRecherche(1)">›</button>
          <button class="fermer" title="Fermer (Échap)" @click="fermerRecherche">✕</button>
        </div>
        <div v-if="!roContenu" class="ligne-remplacement">
          <input
            v-model="remplacementTexte"
            placeholder="Remplacer par…"
            @keydown.enter.prevent="remplacerOccurrenceCourante"
            @keydown.escape="fermerRecherche"
          />
          <button :disabled="!occurrencesRecherche.length || indexRecherche < 0" title="Remplacer l'occurrence courante" @click="remplacerOccurrenceCourante">Remplacer</button>
          <button :disabled="!occurrencesRecherche.length" title="Remplacer toutes les occurrences (une seule annulation Ctrl+Z)" @click="remplacerTout">Tout</button>
        </div>
      </div>

      <!-- Menu contextuel de l'éditeur (clic droit) : sections anon,
           codages couvrants (retrait sans resélectionner) et commentaires
           (créer / éditer). -->
      <MenuContexte
        v-if="menuContextuel"
        :x="menuContextuel.x"
        :y="menuContextuel.y"
        :anon="menuContextuel.anon"
        :codages="menuContextuel.codages"
        :commentaires="menuContextuel.commentaires"
        :peut-commenter="menuContextuel.peutCommenter"
        @basculer-exception="basculerException(menuContextuel.anon!.id)"
        @basculer-anonymise="basculerAnonymise(menuContextuel.anon!.id)"
        @basculer-pseudo="basculerPseudoOccurrence(menuContextuel.anon!.id, $event)"
        @retirer-codage="retirerCodageMenu"
        @commenter="commenterDepuisMenu"
        @editer-commentaire="editerCommentaire"
        @fermer="fermerMenu"
      />

      <!-- Modale d'un commentaire (création/édition/suppression). -->
      <EditionCommentaire
        v-if="editionCommentaire"
        :id="editionCommentaire.id"
        :auteur-initial="editionCommentaire.auteur"
        :texte-initial="editionCommentaire.texte"
        @valider="validerCommentaire"
        @supprimer="supprimerCommentaire(editionCommentaire!.id!)"
        @fermer="fermerEditionCommentaire"
      />

      <!-- Dialogue de divergence à la poussée vers le corpus :
           une règle existante porte des pseudos différents → Aligner / Garder les deux. -->
      <div v-if="dialoguePorteeCorpus" class="portee-dialogue-overlay" @click.self="annulerDialogueCorpus">
        <div class="portee-dialogue">
          <h4>Pseudo divergent — « {{ dialoguePorteeCorpus.entite }} »</h4>
          <p>
            Une règle corpus existe déjà avec
            <b>« {{ dialoguePorteeCorpus.reglePseudos.join(' / ') }} »</b> alors que cette ligne porte
            <b>« {{ dialoguePorteeCorpus.pseudosCible.join(' / ') }} »</b>.
          </p>
          <div class="portee-dialogue-actions">
            <button @click="alignerCorpus">Aligner (pseudo du corpus)</button>
            <button @click="garderLesDeuxCorpus">Garder les deux</button>
            <button @click="annulerDialogueCorpus">Annuler</button>
          </div>
        </div>
      </div>
      <!-- Suggestion d'entité-cœur (mots de liaison) : à la validation d'une entité à affixe (« à Lyon »),
           proposer aussi la règle générale (« Lyon »), à la même portée.
           Jamais automatique : Oui crée la règle ; Non ne crée rien, et ne mémorise aucun refus. -->
      <div v-if="suggestionLiaison" class="portee-dialogue-overlay">
        <div class="portee-dialogue">
          <h4>Pseudonymiser aussi : « {{ suggestionLiaison.entiteCoeur }} » ?</h4>
          <p>
            Vous venez de valider une entité commençant par un mot de liaison.
            Créer aussi la règle générale <b>« {{ suggestionLiaison.entiteCoeur }} »</b>
            (pseudo proposé : « {{ suggestionLiaison.pseudoCoeur }} »)&nbsp;?
          </p>
          <div class="portee-dialogue-actions">
            <button @click="accepterSuggestionLiaison">Oui</button>
            <button @click="refuserSuggestionLiaison">Non</button>
          </div>
        </div>
      </div>
    </section>
</template>

<style scoped>
.grille-ent {
  display: grid;
  grid-template-columns: 400px 1fr;
  gap: 1rem;
  align-items: start;
  grid-template-areas:
    'barre barre'
    'gauche droite';
  /* Hauteur de la barre d'actions (ci-dessous), pour caler les colonnes. */
  --barre-h: 2.4rem;
}
.retour {
  padding: 0.3rem 0.7rem;
  border: 1px solid #bbb;
  background: #fff;
  border-radius: 5px;
  cursor: pointer;
}
.barre {
  grid-area: barre;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  /* Barre d'actions épinglée juste sous l'en-tête de l'appli (--entete-h est défini dans App.vue).
     Fond opaque pour masquer le contenu qui glisse. */
  position: sticky;
  top: var(--entete-h);
  z-index: 30;
  background: #fff;
  height: var(--barre-h);
  box-sizing: border-box;
}
.sauver,
.exporter {
  padding: 0.3rem 0.8rem;
  border: 1px solid #bbb;
  background: #fff;
  border-radius: 5px;
  cursor: pointer;
}
/* Statut de session (publication) dans la barre d'actions */
.statut-session {
  font-size: 0.8rem;
  white-space: nowrap;
  color: #555;
}
.statut-session.sale {
  color: #a05a00;
}
.statut-session.publie {
  color: #2e7d32;
}
.statut-session.divergence {
  color: #b3261e;
  max-width: 34rem;
  white-space: normal;
  line-height: 1.25;
}
.publier-maintenant {
  padding: 0.3rem 0.8rem;
  border: 1px solid #2e7d32;
  color: #2e7d32;
  background: #fff;
  border-radius: 5px;
  cursor: pointer;
}
.publier-maintenant:hover {
  background: #edf7ee;
}
/* Hôte <EditorContent> (le contenteditable ProseMirror est stylé dans editeur.css). */
.cadre {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 0.8rem 1rem;
  background: #fff;
}
/* Colonne de gauche collante : onglets + panneau, reste visible ; au-delà d'un écran, elle défile en interne.
   Ses points d'épinglage tiennent compte des deux barres épinglées du dessus (en-tête app + barre d'actions).
   La hauteur max est RÉDUITE du même décalage que `top` :
   sinon une liste longue (beaucoup de thèmes) déborderait sous le bord bas de la fenêtre,
   et les derniers thèmes resteraient inaccessibles tant que le texte n'a pas défilé (la colonne collante repart vers le haut). */
.colonne-gauche {
  grid-area: gauche;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  position: sticky;
  top: calc(var(--entete-h) + var(--barre-h));
  /* `top` ci-dessus vs hauteur d'écran : le panneau doit tenir entre la barre d'actions et le bord bas de la fenêtre,
     sinon son défilement interne garde les derniers éléments visibles SANS toucher au texte.
     Le −1rem compense l'écart de la grille ; à la position naturelle (page en haut),
     le panneau s'appuie sur la ligne « barre » + son gap, soit `top` + gap. */
  max-height: calc(100vh - var(--entete-h) - var(--barre-h) - 1rem);
  overflow-y: auto;
}
/* Colonne de droite : lecteur audio puis éditeur.
   Le lecteur est collant en haut (fond opaque), pour rester visible pendant la lecture ;
   l'éditeur défile dessous. */
.colonne-droite {
  grid-area: droite;
  display: flex;
  flex-direction: column;
}
.lecteur-ancre {
  position: sticky;
  top: calc(var(--entete-h) + var(--barre-h));
  z-index: 20;
  background: #fff;
}
/* Zone média du MODE VIDÉO : lecteur+waveform empilés à gauche ‖ panneau vidéo à droite.
   Collante comme le lecteur audio. Les deux colonnes SE PARTAGENT la largeur :
   le lecteur (flex 1 1) prend ce que la vidéo ne prend pas, et quand on réduit la vidéo,
   la place libérée revient à la barre de son (jamais tronquée). */
.zone-media {
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
  position: sticky;
  top: calc(var(--entete-h) + var(--barre-h));
  z-index: 20;
  background: #fff;
  /* Respire au-dessus de l'éditeur (le bouton vidéo n'est pas collé au cadre). */
  padding-bottom: 0.75rem;
}
.tele {
  flex: 1 1 auto;
  min-width: 260px; /* garde au lecteur une largeur confortable, la vidéo se réduit */
}
/* Bouton ouvrir/fermer la vue vidéo, sous la waveform — aligné à gauche, sobre. */
.video-toggle {
  align-self: flex-start;
  border: 1px solid #dce4ef;
  border-radius: 5px;
  background: #fafdff;
  color: #555;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0.2rem 0.6rem;
  margin-top: 0.1rem;
}
.video-toggle:hover {
  border-color: #2e73d8;
  color: #1565c0;
}
.onglets {
  display: flex;
  gap: 0.25rem;
}
.onglets button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.28rem;
  border: 1px solid #ddd;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  background: #f0f0f5;
  padding: 0.3rem 0.1rem;
  font-size: 0.78rem;
  cursor: pointer;
}
.onglets button.actif {
  background: #fff;
  font-weight: 600;
  color: #1565c0;
}
/* Icônes des onglets (glyphes noirs), adoucies sur l'onglet inactif.
   Plus grandes dans la barre gauche (20px) ; la liste d'accueil garde sa taille propre (20px, cf. .liste-tours).
   L'onglet Anonymisation est un cran plus grand (23px). */
.ico-onglet {
  object-fit: contain;
  opacity: 0.55;
  flex: none;
}
.onglets .ico-onglet {
  width: 20px;
  height: 20px;
}
.onglets button[data-onglet="anon"] .ico-onglet {
  width: 23px;
  height: 23px;
}
.onglets button.actif .ico-onglet {
  opacity: 1;
}
/* Panneau Accueil : le raccourci en tête, puis la vue d'ensemble des autres onglets (icone + titre),
   chaque ligne rappelant ce que fait l'onglet. */
/* Raccourci mis en AVANT (bandeau contrasté) pour être immédiatement repéré. */
.raccourci {
  background: #fff8e1;
  border: 1px solid #e0b93a;
  border-left: 4px solid #e0a03a;
  color: #5c4a00;
  border-radius: 6px;
  padding: 0.55rem 0.6rem;
  font-size: 0.82rem;
  margin: 0.2rem 0 0;
  line-height: 1.35;
}
.raccourci b {
  color: #a37000;
}
/* Un peu plus d'espace entre le raccourci et le détail des onglets. */
.liste-tours {
  list-style: none;
  margin: 0.9rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.liste-tours li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid #e5e5ef;
  border-radius: 6px;
  padding: 0.4rem 0.5rem;
  background: #fff;
  font-size: 0.8rem;
}
.liste-tours li .ico-onglet {
  width: 20px;
  height: 20px;
}
/* --- Onglet Thématique : clic = coder --- */
.barre-aide {
  flex: 1;
  font-size: 0.72rem;
  color: #999;
  align-self: center;
}
.hint-codage {
  background: #fff3e0;
  color: #b06e0f;
  border: 1px solid #e0a03a;
  border-radius: 6px;
  padding: 0.3rem 0.5rem;
  font-size: 0.75rem;
  margin: 0.3rem 0;
}
.liste-coder {
  list-style: none;
  margin: 0.3rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.theme-coder {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  width: 100%;
  text-align: left;
  border: 1px solid #e5e5ef;
  border-radius: 6px;
  background: #fff;
  padding: 0.3rem 0.5rem;
  cursor: pointer;
  font-size: 0.85rem;
}
/* Icône de repli d'un parent dans le panneau : même liseré que l'édition des thèmes ;
   `-masque` réserve la place (largeur égale) sur les feuilles, pour que la pastille reste alignée. */
.depliant {
  width: 1.1rem;
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
/* Compteur de codages (corpus) d'un thème, collé à droite du nom. */
.usage {
  font-size: 0.68rem;
  color: #888;
  font-family: monospace;
  flex: none;
}
.theme-coder:hover {
  border-color: #2e73d8;
  background: #f0f6ff;
}
.theme-coder.inactif {
  opacity: 0.3;
}
.pastille {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex: none;
  border: 1px solid rgba(0, 0, 0, 0.15);
}
.theme-nom {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ligne-coder {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}
.ligne-coder .theme-coder {
  flex: 1;
}
/* --- Fiche données de CET entretien (saisie EAV) --- */
.saisie-eav {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0.2rem 0;
  padding-left: 0.9rem; /* décalé sous le titre « Valeurs… » */
}
.saisie-eav-lib {
  flex: 1;
  font-size: 0.8rem;
  color: #444;
}
.saisie-eav-sel {
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.1rem 0.3rem;
  font-size: 0.8rem;
}
/* Champ texte de saisie libre (variable sans modalité, ou « autre… ») —
   même gabarit que le select pour que la ligne ne saute pas. */
.saisie-eav-libre {
  flex: none;
  width: 9.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.1rem 0.3rem;
  font-size: 0.8rem;
}
.saisie-eav-libre::placeholder {
  color: #bbb;
  font-style: italic;
}
.fiche-loc {
  border-top: 1px dashed #eee;
  padding-top: 0.3rem;
  margin-top: 0.3rem;
  padding-left: 0.9rem; /* niveau locuteur ; les saisies imbriquées
                           (saisie-eav) gagnent un second retrait */
}
.fiche-loc-nom {
  font-size: 0.78rem;
  font-weight: 600;
  color: #000;
}
/* Couleurs des en-têtes « Valeurs… » alignées sur les badges ent/loc (créés dans EditionVariables),
   pour raccorder visuellement la fiche données aux variables qu'elle détaille. */
.h4-ent {
  color: #5c6bc0;
}
.h4-loc {
  color: #8a6d3b;
}
/* --- Panneau Locuteurs --- */
.locuteurs {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 0.6rem;
  background: #fafafe;
}
.liste-loc {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
/* Petit tableau des locuteurs : Couleur | Nom | Pseudo | Interv. | ✕.
 *  La grille de colonnes est partagée entre l'en-tête et les lignes —
 *  les largeurs restent stables, le champ Nom respire (colonne 2). */
.tableau-loc-tetes,
.liste-loc li {
  display: grid;
  grid-template-columns: 1.2rem minmax(0, 1fr) 7rem 2.4rem 1.2rem;
  align-items: center;
  gap: 0.4rem;
}
.tableau-loc-tetes {
  font-size: 0.66rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-weight: 700; /* en gras (demande utilisateur) */
  color: #999;
  padding: 0.15rem 0.3rem;
  border-bottom: 1px solid #e5e5ef;
  margin-bottom: 0.25rem;
  text-align: center; /* en-têtes centrés, comme l'onglet Pseudonymisation du texte */
}
.liste-loc li {
  min-width: 0;
}
.nom-loc {
  width: 100%;
  box-sizing: border-box;
  min-width: 0;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.15rem 0.35rem;
  font-size: 0.82rem;
}
/* Sélecteur de couleur du nom : auto-rempli par index par défaut (palette prédéfinie) ;
 *  au clic, le sélecteur NATIF du navigateur (même mécanisme que l'édition des thèmes :
 *  TOUTES les couleurs possibles). Le nom du locuteur s'écrit dans cette couleur
 *  dans l'éditeur, sans toucher au pseudo. */
.carre-couleur {
  width: 1rem;
  height: 1rem;
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  padding: 0;
  cursor: pointer;
  align-self: center;
  background: transparent;
}
/* Le `<input type="color">` natif dessine la couleur dans un carré interne,
 *  entouré d'un liseré clair (« carré dans un carré ») : on force le swatch
 *  interne à occuper tout l'élément, pour que la couleur prenne toute la place. */
.carre-couleur::-webkit-color-swatch-wrapper {
  padding: 0;
}
.carre-couleur::-webkit-color-swatch {
  border: none;
  border-radius: 3px;
}
.carre-couleur:hover {
  transform: scale(1.15);
}
/* Cellule Pseudo : champ + décision confirmer ✓ / refuser ⊘ ; le pseudo posé
 *  pseudonymise les étiquettes de ses tours, rendues barrées + [pseudo]. */
.pseudo-cell {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  min-width: 0;
}
.pseudo-loc {
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  border: 1px solid #e2e2ea;
  border-radius: 4px;
  padding: 0.08rem 0.3rem;
  font-size: 0.7rem;
  color: #333;
}
.pseudo-loc::placeholder {
  color: #bbb;
  font-style: italic;
}
.interv {
  justify-self: center;
}
.x-loc {
  justify-self: center;
}
/* Interrupteur « interviewer » : pilule compacte + « ? », rendue cliquable.
   Coché → bleu, tours du locuteur en italique. */
.interv {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
  flex: none;
}
.interv input {
  display: none;
}
.glisseur {
  width: 26px;
  height: 14px;
  border-radius: 7px;
  background: #d5d5dd;
  position: relative;
  transition: background 0.15s;
}
.glisseur::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  transition: left 0.15s;
}
.interv input:checked + .glisseur {
  background: #2e73d8;
}
.interv input:checked + .glisseur::after {
  left: 14px;
}
.interv .q {
  font-size: 0.8rem;
  font-weight: 600;
  color: #aaa;
  font-style: italic;
}
.interv input:checked ~ .q {
  color: #1565c0;
}
/* Croix de suppression d'un locuteur — même idiome discret que les thèmes. */
.x-loc {
  border: none;
  background: none;
  color: #c33;
  cursor: pointer;
  font-size: 0.8rem;
  flex: none;
  opacity: 0.5;
}
.liste-loc li:hover .x-loc {
  opacity: 1;
}
.attribuer {
  margin-top: 0.9rem; /* un peu plus bas (demande utilisateur) */
  border-top: 1px solid #eee;
  padding-top: 0.7rem;
}
.attribuer .lbl {
  font-size: 0.75rem;
  font-weight: 600; /* « Attribuer le bloc courant : » en gras (demande utilisateur) */
  color: #444;
  text-decoration: underline; /* souligné (demande utilisateur) */
  padding-bottom: 0.35rem; /* aérer entre le libellé et les boutons */
}
.boutons-loc {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem; /* un peu plus d'écart entre les rectangles (aérer) */
  margin-top: 0.6rem; /* les rectangles descendent un peu (demande utilisateur) */
}
.attr {
  font-size: 0.75rem;
  font-weight: 700; /* bien visibles (demande utilisateur) */
  border: 2px solid #000; /* contour noir net, SANS fond (demande utilisateur) */
  border-radius: 5px;
  background: #fff;
  color: #333;
  padding: 0.15rem 0.5rem;
  cursor: pointer;
}
.attr:hover {
  background: #f5f5f5;
}
.attr.aucun {
  border-color: #999;
  color: #999;
}
/* --- Panneau Journal --- */
.liste-journal {
  list-style: none;
  margin: 0.3rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.liste-journal li {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid #e5e5ef;
  border-radius: 6px;
  padding: 0.3rem 0.45rem;
  background: #fff;
  font-size: 0.8rem;
}
.liste-journal li.grisee {
  opacity: 0.45;
}
.heure {
  font-size: 0.68rem;
  color: #999;
  font-family: monospace;
  flex: none;
}
.lib-journal {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.annuler-entree {
  border: 1px solid #ccc;
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
  padding: 0.05rem 0.4rem;
  font-size: 0.85rem;
  flex: none;
}
.annuler-entree:hover:not(:disabled) {
  border-color: #2e73d8;
  color: #1565c0;
}
.annuler-entree:disabled {
  cursor: not-allowed;
  color: #bbb;
}
/* --- Panneau Anon --- */
/* Tableau Anon : layout FIXE — le nom d'entité est borné (ellipsis au survol) et
 * les colonnes Pseudo porte / Actions restent TOUJOURS visibles. Les largeurs
 * viennent de la 1ʳᵉ ligne (thead) : Nom = reste (auto), Pseudo fixe (large,
 * le Nom se réduit d'autant), Actions fixe. Les inputs de saisie sont calés à
 * 100 % de leur colonne (box-sizing) pour ne jamais déborder de leur cellule. */
.tableau-anon {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  margin-top: 0.3rem;
}
/* En-têtes harmonisés sur les conventions « locuteurs » : petits, hautes
 * (uppercase), gris, centrés — SANS fond ni traits de grille lourds. Un seul
 * séparateur fin sous l'en-tête (comme pour le tableau des locuteurs). */
.tableau-anon th {
  text-align: center;
  font-size: 0.66rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-weight: 600;
  color: #999;
  padding: 0.15rem 0.3rem;
  background: transparent;
  border-bottom: 1px solid #e5e5ef;
}
.tableau-anon td {
  padding: 0.4rem 0.5rem; /* plus d'écart entre le contour du champ et le rebord de la cellule (demande utilisateur) */
  vertical-align: middle;
}
.ligne-anon td {
  background: #fff;
}
.ligne-anon.etat-brouillon td {
  background: #f3f8ff;
}
/* Ligne de saisie/draft : fond jaune pâle, distincte d'une ligne de données.
 * La classe est SAISIE-ANON (pas `saisie`) : `saisie` porte un `display:flex`
 * pour la fiche Données (EAV) qui casserait le layout du tableau en table-layout:fixed. */
.ligne-anon.saisie-anon td {
  background: #fffdf2;
}
/* Deux sous-lignes dans la colonne actions : le slider de portée sur une ligne,
 * les occurrences + l'action (✕) sur l'autre. Le flex vit sur un div INTERNE
 * (`.actions-empile`), PAS sur la cellule `<td>` : un `display:flex` sur un td
 * le retire de son rôle table-cell et casse le calcul des colonnes du tableau
 * en `table-layout:fixed`. */
.ligne-anon .actions-empile {
  display: flex;
  flex-direction: column;
  align-items: center; /* centré dans la colonne État·Occ. */
  gap: 0.15rem;
}
.ligne-anon .occ-action {
  /* Empilement VERTICAL : en multi-pseudo ou avec exceptions, chaque compteur
   * (ou chip de variante) passe à la ligne pour tenir dans la colonne étroite. */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
}
.col-entite {
  width: auto; /* prend le reste → la colonne Nom respire */
  min-width: 0;
  overflow: hidden;
}
.col-pseudo {
  width: 7.25rem; /* pseudo porte : un cran plus large → la colonne Nom (reste) se réduit d'autant */
}
.col-actions {
  width: 5rem; /* juste la largeur du slider de portée (3 crans + padding) */
  text-align: center;
}
/* Contenu centré dans les colonnes Nom et Pseudo (pour l'essai UX). */
td.col-entite,
td.col-pseudo {
  text-align: center;
}
/* Étiquette Nom des lignes existantes : texte MULTI-LIGNES (enveloppe sur
 * plusieurs lignes dans sa colonne), plafonné à 5 lignes. Un très long nom est
 * d'abord raccourci « début…fin » (majNomsAnon) ; le clamp CSS reste un
 * garde-fou si la colonne était plus étroite (zooms petits). Même rendu que le
 * Pseudo — texte noir, sans contour. */
.nom-anon {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 5;
  overflow: hidden;
  overflow-wrap: anywhere; /* coupe les mots très longs */
  white-space: normal;
  line-height: 1.25;
  min-width: 0;
  font-size: 0.82rem;
  color: #333;
  text-align: center;
  border: 1px solid #ccc; /* encadré façon tableau Locuteurs (harmonisation) */
  border-radius: 4px;
  background: transparent;
  padding: 0.1rem 0.3rem;
}
/* Champs de saisie (case Nom des lignes du bas, Pseudo partout) : textarea qui
 * enveloppe le texte, s'étire au contenu (field-sizing) et plafonne à 5 lignes —
 * au-delà, défilement INTERNE (on ne tronque jamais la valeur d'un champ
 * éditable). Encadrés comme les champs du tableau Locuteurs (contour #ccc,
 * radius 4) ; le fond de la ligne continue de distinguer les états. */
.nom-saisie,
.pseudo-anon {
  display: block;
  width: 100%;
  box-sizing: border-box;
  field-sizing: content;
  resize: none;
  overflow-y: auto;
  overflow-x: hidden;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.25;
  min-height: calc(1.25em + 0.2rem * 2); /* une ligne au minimum (champ vide) */
  max-height: calc(1.25em * 5 + 0.2rem * 2); /* 5 lignes max */
  font-size: 0.82rem;
  color: #333;
  text-align: center;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: transparent;
  padding: 0.1rem 0.3rem;
}
/* Au focus, repère léger (sans décaler le layout) pour garder la navigation clavier visible. */
.nom-saisie:focus,
.pseudo-anon:focus {
  outline: 1px solid #2e73d8;
  outline-offset: 1px;
}
.pseudo-anon::placeholder {
  color: #bbb;
  font-weight: 400;
}
/* Compteurs scindés d'une ligne anon : occurrences ANONYMISÉES (barrées) et
 * EXCEPTIONS (laissées en clair). Les badges ronds colorés (.cpt-btn ci-dessous)
 * portent la couleur de chaque état. */
/* Groupe de boutons d'en-tête du panneau anon (⟳ + « + Ligne »). */
.tete-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
/* Compteurs cliquables (repérage ◄ i/N ►) : BADGES RONDS colorés — vert
 * #15c095 = anonymisé, gris #555 = exception, orange #ff9800 = à anonymiser.
 * Chiffre blanc sur la couleur. */
.cpt-btn {
  border: none;
  background: transparent;
  padding: 0;
  color: #fff;
  font-size: 0.66rem;
  font-weight: bold;
  font-family: inherit;
  flex: none;
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.cpt-btn.cpt-anon {
  background: #15c095;
}
.cpt-btn.cpt-exc {
  background: #555;
}
.cpt-btn.cpt-aanon {
  background: #ff9800;
}
.cpt-variante .cpt-btn {
  font-size: 0.62rem;
  width: 1rem;
  height: 1rem;
}
/* Exposant d'incluses : « +N » discret après les badges — absorbées par une
 * entité plus large, non comptées, non navigables (tooltip pour le détail). */
.cpt-incl {
  font-size: 0.62rem;
  color: #999;
  font-style: italic;
  cursor: help;
  line-height: 1;
}
/* Widget de navigation entre occurrences (état actif d'un compteur). */
.reperage-nav {
  display: inline-flex;
  align-items: center;
  gap: 0.1rem;
  flex: none;
}
.rep-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.7rem;
  color: #1565c0;
  padding: 0 0.15rem;
}
/* Le compteur i/N et ses flèches reprennent la COULEUR de la catégorie
 * naviguée : vert = anonymisées, gris = exceptions, orange = à anonymiser —
 * la navigation reste lisible sans retourner aux badges. */
.rep-anonymise .rep-btn,
.rep-anonymise .rep-pos {
  color: #15c095;
}
.rep-exception .rep-btn,
.rep-exception .rep-pos {
  color: #555;
}
.rep-a-anonymiser .rep-btn,
.rep-a-anonymiser .rep-pos {
  color: #ff9800;
}
.rep-close {
  color: #999 !important;
}
.rep-pos {
  font-size: 0.7rem;
  font-family: monospace;
  color: #1565c0;
  font-weight: bold;
  min-width: 2rem;
  text-align: center;
}
/* Compteur « à anonymiser » : occurrences présentes dans le texte mais pas
 * encore traitées (requête recalculée à l'ouverture, au ⟳ et après chaque
 * geste anon) — badge orange SonalPi V1 (.cpt-btn.cpt-aanon). */
/* Compteurs PAR VARIANTE (multi-pseudo) : une puce par pseudo, libellé + ses
 * deux compteurs ; empilement lisible dans la colonne étroite. */
.cpt-variante {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  font-size: 0.68rem;
  flex: none;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #444;
}
.cpt-variante b,
.cpt-variante i {
  font-style: normal;
  font-family: monospace;
}
/* Slider de portée 3 crans : brouillon (🚧) / entretien (📄) / corpus (🌐).
 * Le cran corpus active les règles corpus. Le cran courant est désactivé et
 * mis en évidence, les autres sont cliquables (promotion). */
.portee-slider {
  display: inline-flex;
  border: 1px solid #d0d0d8;
  border-radius: 10px;
  overflow: hidden;
  background: #f5f5f7;
}
.portee-cran {
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0.02rem 0.26rem;
  font-size: 0.72rem;
  line-height: 1.3;
  opacity: 0.45;
}
.portee-cran.actif {
  opacity: 1;
  background: #2e73d8;
}
.portee-cran:disabled {
  cursor: default;
}
/* Dialogue de divergence de pseudo (poussée vers le corpus) */
.portee-dialogue-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001;
}
.portee-dialogue {
  background: #fff;
  border-radius: 8px;
  padding: 1rem 1.2rem;
  max-width: 460px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
}
.portee-dialogue h4 {
  margin: 0 0 0.5rem;
}
.portee-dialogue p {
  font-size: 0.85rem;
  color: #444;
  margin: 0 0 0.9rem;
  line-height: 1.4;
}
.portee-dialogue-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}
.portee-dialogue-actions button {
  border: 1px solid #ccc;
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
  padding: 0.35rem 0.7rem;
  font-size: 0.82rem;
}
.portee-dialogue-actions button:first-child {
  background: #2e73d8;
  color: #fff;
  border-color: #1565c0;
}
.ok-anon,
.x-anon {
  border: 1px solid #ccc;
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
  padding: 0.05rem 0.32rem;
  font-size: 0.8rem;
  flex: none;
}
.ok-anon:hover {
  border-color: #2e73d8;
  color: #1565c0;
}
.x-anon {
  color: #c33;
  opacity: 0.55;
}
.ligne-anon:hover .x-anon {
  opacity: 1;
}

/* Corpus distant — bandeau de lecture seule au-dessus de la grille. */
.banniere-ro {
  background: #fff8e6;
  color: #8a6d1a;
  border: 1px solid #ecd9a0;
  border-radius: 8px;
  padding: 0.45rem 0.7rem;
  font-size: 0.8rem;
  margin-bottom: 0.5rem;
}

/* --- Notes --- */
.notes-outils {
  display: flex;
  gap: 0.25rem;
  margin-left: auto;
}
.notes-outils .mini.actif {
  background: #e8eefc;
  border-color: #6485d6;
}
/* Icônes des outils de notes : un cran plus grandes que le .mini global. */
.notes-outils .mini {
  font-size: 0.95rem;
  padding: 0.1rem 0.35rem;
}
/* Cartes et feuille : légèrement décalées à gauche (écart accru avec les
   outils suivants). */
.notes-outils .mini:nth-child(1) { margin-left: -0.3rem; }
.notes-outils .mini:nth-child(2) { margin-right: 0.35rem; }
/* Carré « création » de catégorie (mode « autre… ») : même format que le
   carré couleur, il ouvre la mini-modale nom + couleur. */
.carre-creation {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #ffb74d;
  color: #fff;
  font-size: 0.8rem;
  line-height: 1;
}
.carre-creation:hover { filter: brightness(0.95); }

/* Vue cartes : empilement vertical, carte = bloc léger. */
.notes-cartes {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.carte-note {
  border: 1px solid #e2e2e2;
  border-radius: 8px;
  padding: 0.5rem 0.6rem;
  background: #fbfbfd;
  cursor: grab;
}
.carte-note:active { cursor: grabbing; }
.carte-note-tete {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  color: #555;
  margin-bottom: 0.3rem;
  flex-wrap: wrap;
}
.pastille-cat {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}
.nom-cat { font-weight: 600; color: #222; }
.date-cat { color: #777; }
.statut-cat {
  font-size: 0.68rem;
  padding: 0.05rem 0.35rem;
  border-radius: 10px;
  border: 1px solid #d0d0d0;
}
.statut-cat.prive { background: #f3f3f3; color: #777; }
.statut-cat.public { background: #e8f5e9; color: #2e7d32; border-color: #a5d6a7; }
.carte-note-actions { margin-left: auto; display: flex; gap: 0.2rem; }
.corps-note {
  font-size: 0.85rem;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
}
/* Titre de carte (note titrée) : mis en évidence, il remplace le corps. */
.titre-note {
  font-size: 0.9rem;
  font-weight: 600;
  word-break: break-word;
}
/* Aperçu d'une note SANS titre : le corps complet est rendu (références de
   commentaires cliquables conservées) mais borné à UNE ligne, pour que
   plusieurs cartes tiennent à l'écran. */
.apercu-note {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
  overflow: hidden;
}
.champ-titre-note input {
  flex: 1;
}
/* Passages de note : le contenu du contenteditable (et celui injecté par
   v-html) ne porte pas l'attribut de scope → :deep() obligatoire, sinon les
   règles ne s'appliquent jamais. */
.corps-note :deep(mark),
.zone-corps-note :deep(mark),
.corps-notes-texte :deep(mark) {
  background: none;
  font-weight: bold;
  padding: 0;
}
/* Passage lié à au moins un commentaire : `<em>` italique porteur de
   data-liens (conservé par le sanitisé). L'italique vient du navigateur ; on
   le rappelle juste pour être explicite dans les trois zones (cartes,
   modale, feuille). */
.corps-note :deep(em),
.zone-corps-note :deep(em),
.corps-notes-texte :deep(em) {
  font-style: italic;
}
/* Référence à un commentaire, insérée après un passage lié — dans les cartes
   comme dans la zone d'édition (span contenteditable=false) : petit lien
   cliquable qui cale l'éditeur sur la zone commentée. */
.corps-note :deep(.ref-note-commentaire),
.zone-corps-note :deep(.ref-note-commentaire),
.corps-notes-texte :deep(.ref-note-commentaire) {
  color: #1565c0;
  font-size: 0.75rem;
  cursor: pointer;
}
.corps-note :deep(.ref-note-commentaire:hover),
.zone-corps-note :deep(.ref-note-commentaire:hover),
.corps-notes-texte :deep(.ref-note-commentaire:hover) {
  text-decoration: underline;
}

/* Volet recherche : filtre les cartes et la feuille, sur deux lignes
   (saisie + compteur, puis filtres) pour rester dans le panneau. */
.volet-recherche-notes {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin: 0 0 0.5rem;
}
.ligne-recherche {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  /* Retour à la ligne dès que les libellés ne tiennent plus : chaque filtre
     garde une largeur minimale (son flex-basis) au lieu de se compresser. */
  flex-wrap: wrap;
}
.ligne-recherche input {
  flex: 1;
  min-width: 0;
  padding: 0.25rem 0.45rem;
  border: 1px solid #d4d4d4;
  border-radius: 6px;
  font-size: 0.8rem;
}
.ligne-recherche select {
  min-width: 0;
  padding: 0.25rem 0.3rem;
  border: 1px solid #d4d4d4;
  border-radius: 6px;
  font-size: 0.78rem;
}
/* Répartition de la ligne de filtres : les noms de catégories sont les plus
   longs à afficher, ils prennent la plus grande part ; les valeurs de statut
   (« privé »/« public ») tiennent sur peu de place. Le flex-basis sert de
   largeur minimale : en dessous, le sélecteur passe à la ligne (wrap). */
.ligne-recherche .filtre-categorie { flex: 2 1 10rem; }
.ligne-recherche .filtre-passage { flex: 1.4 1 9rem; }
.ligne-recherche .filtre-statut { flex: 1 1 6rem; }
.compte-notes {
  font-size: 0.75rem;
  color: #777;
  white-space: nowrap;
}
/* Occurrence trouvée : fond jaune pâle, dans les cartes comme dans la
   feuille (span décoratif injecté par v-html/innerHTML : :deep()
   obligatoire, il ne porte pas l'attribut de scope). Aplati par le sanitisé
   à la sauvegarde. */
:deep(.surbrillance-note) {
  background: #fff3a6;
  border-radius: 2px;
}

/* Vue texte (feuille) : une note par bloc, cliquable pour éditer. */
.notes-texte {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.bloc-notes-texte {
  border-radius: 6px;
  padding: 0.3rem 0.4rem;
}
.tete-notes-texte {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: #777;
}
/* Harmonisation avec les cartes : nom de catégorie coloré (inline) et
   méta (date, statut) grises non grasses. */
.meta-notes-texte {
  color: #777;
  font-weight: 400;
}
.corps-notes-texte {
  display: block;
  font-size: 0.83rem;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.45;
  color: #333;
}
/* Corps de bloc éditable : même convention que la zone de la modale. */
.corps-notes-texte[contenteditable='true'] {
  outline: none;
}
.corps-notes-texte[contenteditable='true']:focus {
  background: #f7f8fc;
  box-shadow: inset 0 -1px 0 #6485d6;
}
.corps-notes-texte:empty::before {
  content: attr(data-placeholder);
  color: #aaa;
}
/* Titre édité en place : champ transparent, seule la mise en gras le
   distingue du corps. */
.titre-feuille {
  display: block;
  width: 100%;
  border: none;
  padding: 0.05rem 0;
  font-size: 0.9rem;
  font-weight: 600;
  background: none;
  outline: none;
}

/* Modale de création/édition de note. */
.modale-note {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
}
.modale-note-fond {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
}
.modale-note-fenetre {
  position: relative;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
  width: min(560px, 92vw);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
}
.modale-note-corps {
  padding: 0.7rem 1rem;
  overflow-y: auto;
}
.zone-corps-note {
  min-height: 7rem;
  border: 1px solid #d4d4d4;
  border-radius: 8px;
  padding: 0.5rem 0.6rem;
  font-size: 0.88rem;
  line-height: 1.45;
  outline: none;
}
.zone-corps-note:focus { border-color: #6485d6; }
.zone-corps-note:empty::before {
  content: attr(data-placeholder);
  color: #aaa;
}
.barre-outils-note {
  display: flex;
  gap: 0.3rem;
  margin: 0.4rem 0;
}
/* Barre d'outils de la FEUILLE : collante en tête du panneau défilant
   (.colonne-gauche), sinon elle disparaît sous les notes au scroll et les
   boutons ✏ / 🔗 deviennent inaccessibles. Fond opaque pour masquer les
   notes qui défilent dessous. */
.notes-texte .barre-outils-note {
  position: sticky;
  top: 0;
  z-index: 5;
  background: #fff;
  margin: 0;
  padding: 0.3rem 0;
  border-bottom: 1px solid #ececf2;
}
.modale-note-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
  margin-top: 0.3rem;
}
/* Avertissement bloquant de la modale (catégorie « autre… » non créée). */
.msg-avert {
  margin: 0.4rem 0 0;
  font-size: 0.78rem;
  color: #b3261e;
}
.champ-note {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  color: #555;
}
.champ-note span { min-width: 3.5rem; }
.champ-note select,
.champ-note input[type='date'],
.champ-note input[type='text'] {
  padding: 0.2rem 0.35rem;
  border: 1px solid #d4d4d4;
  border-radius: 6px;
  font-size: 0.8rem;
}
.modale-note-pied {
  display: flex;
  justify-content: flex-end;
  gap: 0.4rem;
  padding: 0.6rem 1rem;
  border-top: 1px solid #eee;
}
.modale-note-pied .principal {
  background: #6485d6;
  color: #fff;
  border-color: #6485d6;
}

/* Sous-modale créer une catégorie. */
.sous-modale-categorie {
  position: absolute;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
}
.sous-modale-fond {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 12px;
}
.sous-modale-fenetre {
  position: relative;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  padding: 0.8rem 1rem;
  width: min(340px, 88vw);
}
.sous-modale-fenetre h4 { margin: 0 0 0.5rem; }
.sous-modale-fenetre .champ-note { margin-bottom: 0.4rem; }

/* --- Boîte recherche/remplacement (Ctrl+F) --------------------------------
 * Flottante en bas à droite de la fenêtre : visible quel que soit le
 * défilement du texte, sans recouvrir le lecteur audio ni les onglets. */
.barre-recherche {
  position: fixed;
  bottom: 0.8rem;
  right: 0.8rem;
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  padding: 0.5rem;
}
.ligne-recherche,
.ligne-remplacement {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.barre-recherche input {
  width: 13rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.2rem 0.4rem;
  font-size: 0.85rem;
}
.barre-recherche .compte {
  min-width: 2.6rem;
  text-align: center;
  font-size: 0.75rem;
  color: #666;
  white-space: nowrap;
}
.barre-recherche button {
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  padding: 0.15rem 0.45rem;
  font-size: 0.8rem;
}
.barre-recherche button:hover:not(:disabled) {
  background: #eef4ff;
}
.barre-recherche button:disabled {
  opacity: 0.4;
  cursor: default;
}
.barre-recherche .fermer {
  color: #888;
}
</style>
