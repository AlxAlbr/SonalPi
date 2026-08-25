<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted, onBeforeUnmount } from 'vue'
import { EditorContent } from '@tiptap/vue-3'
import LecteurAudio from './LecteurAudio.vue'
import VideoPanel from './VideoPanel.vue'
import MenuContexte from './MenuContexte.vue'
import MenuLiensNote from './MenuLiensNote.vue'
import EditionCommentaire from './EditionCommentaire.vue'
import EditionThemes from './EditionThemes.vue'
import EditionVariables from './EditionVariables.vue'
import { utiliserSonal } from '../composables/sonal'
import { couleurPourLocuteur } from '../../shared/entretien/locuteurs'
// Icônes d'onglets rapatriées de SonalPi (img/) ; « journal » et « maison »
// créées dans le même style (glyphe noir à plat) — SonalPi n'a pas d'équivalent.
import icoThemes from '../assets/icones/logocat.png'
import icoLocuteurs from '../assets/icones/logoloc.png'
import icoDonnees from '../assets/icones/logodat2.png'
import icoJournal from '../assets/icones/journal.png'
import icoNotes from '../assets/icones/logonotes2.png'
import icoMaison from '../assets/icones/maison.png'
import icoAnon from '../assets/icones/logoanon.png'

const {
  codebook,
  varsGen,
  varsLoc,
  couleurHex,
  arbreThemes,
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
  setPseudoEtatLoc,
  basculerPseudoEtatLoc,
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
  supprimerNote,
  reordonnerNotes,
  marquerPassage,
  notesEnTexte,
  menuLiensNote,
  commentairesPourLiaison,
  ouvrirMenuLiensNote,
  fermerMenuLiensNote,
  lierCommentaireNote,
  delierCommentaireNote,
  // Catégories de note : définitions au CORPUS — gestes asynchrones (IPC).
  categoriesNote,
  messageCategorieNote,
  nomCategorieNote,
  couleurCategorieNote,
  ajouterCategorieNote,
  renommerCategorieNote,
  majCouleurCategorieNote,
  supprimerCategorieNote,
  // Statut de la session d'écriture (publication) + « Publier maintenant »
  statutSession,
  publiErreur,
  publierMaintenant,
} = utiliserSonal()

// Heure locale courte d'un horodatage ISO (« HH:MM »).
const heureDe = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''

// Lecture seule du CONTENU : l'entretien ouvert est figé ssi son verrou est
// tenu par autrui. Les définitions suivent `lectureSeule`.
const roContenu = computed(() => verrouAutrui.value !== null)
// État partagé du scope média pour l'organisation d'écran (mode vidéo).
const { estVideo, videoVisible, toggleVideo } = audio

// La fenêtre d'édition des thèmes (crayon, parité SonalPi) — locale à la vue ;
// en contexte entretien elle porte la politique de suppression adaptée
// (refus si un AUTRE entretien utilise le thème, sinon retrait des codages ici).
const editerThemes = ref(false)
// Idem pour les variables : le crayon de l'onglet Données ouvre la MÊME fenêtre
// que la Table de données (créer des variables d'entretien/locuteur sans
// repasser par l'écran Corpus).
const editerVariables = ref(false)

// --- Notes d'entretien (état local de la vue) ---
// Vue active de l'onglet Notes : cartes (défaut) ou texte concaténé (expand).
const vueNotes = ref<'cartes' | 'texte'>('cartes')
// Zone d'édition du corps (contenteditable) : on y pose le HTML initial au
// ouverture du brouillon, et on relit son innerHTML à la volée pour suivre
//  le surlignage `<mark>` pendant la frappe.
const zoneCorpsNote = ref<HTMLElement | null>(null)
// Bascule d'un volet « catégories » (gérer les types de note : nom + couleur).
const voletCategoriesNote = ref(false)
// Création de catégorie depuis le select « autre… » du formulaire de note :
//  mini-modale inline (nom + couleur), façon « trouver-ou-créer ».
const creationCategorie = ref<{ nom: string; couleur: string } | null>(null)

// Brouillon de note : on SYNC le contenteditable au montage du formulaire.
//  Quand la modale s'ouvre, on attend le rendu puis on pose le HTML initial.
watch(
  () => brouillonNote.value?.id ?? 'new',
  () => {
    nextTick(() => {
      if (zoneCorpsNote.value && brouillonNote.value) {
        zoneCorpsNote.value.innerHTML = brouillonNote.value.corps || ''
      }
    })
  },
)

// Suit la frappe dans le contenteditable : reporte le HTML courant vers le
//  brouillon (le surlignage est ainsi conservé à la validation).
function onSaisieCorpsNote() {
  if (brouillonNote.value && zoneCorpsNote.value) {
    brouillonNote.value.corps = zoneCorpsNote.value.innerHTML
  }
}

// Clic droit dans le corps d'une note : sur un passage important, ouvre le
//  menu de liaison aux commentaires (le composable avale le menu natif) ;
//  ailleurs, le menu natif du contenteditable reste disponible.
function onContextmenuCorpsNote(e: MouseEvent) {
  if (zoneCorpsNote.value) ouvrirMenuLiensNote(e, zoneCorpsNote.value)
}

// Ouvre la mini-modale « autre… » pour créer une catégorie (trouver-ou-créer).
function ouvrirCreationCategorie() {
  creationCategorie.value = { nom: '', couleur: '#ffb74d' }
}
// Ajoute une catégorie depuis le champ « nouvelle catégorie… » du volet : si
//  le libellé est non vide, on crée (nom + couleur par défaut) puis on vide le
//  champ. Aucune sélection du brouillon : ce champ vit dans le volet cat.
async function onAjoutCategorieInput(e: Event) {
  const v = (e.target as HTMLInputElement).value.trim()
  if (!v) return
  await ajouterCategorieNote(v, '#ffb74d')
  ;(e.target as HTMLInputElement).value = ''
}
// Valide la création : pose la catégorie (IPC → async), la sélectionne dans
//  le brouillon, ferme la mini-modale.
async function validerCreationCategorie() {
  const c = creationCategorie.value
  if (!c || !c.nom.trim()) return
  const id = await ajouterCategorieNote(c.nom, c.couleur)
  if (brouillonNote.value) brouillonNote.value.categorieId = id
  creationCategorie.value = null
}

// Notes triées par rang (ordre d'affichage par défaut de la vue cartes).
const notesTriees = computed(() => notes.value.slice().sort((a, b) => a.rang - b.rang))

// Libellé court d'une date : « JJ/MM/AAAA » ou « sans date ».
const dateLibelle = (d: string | null) =>
  d ? new Date(d + 'T00:00').toLocaleDateString('fr-FR') : 'sans date'

// Corps d'une note, ou un placeholder si vide (v-html : le corps est sanitisé).
const corpsOuVide = (n: { corps: string }) => n.corps || '<span class="vide">(note vide)</span>'

// Chaîne de la vue « expand » (précalculée : le composable relit le DOM).
const texteExpand = computed(() => (ongletDroite.value === 'notes' ? notesEnTexte() : ''))

// Réordonnancement par glisser-déposer : on PERMET le drag des cartes et on
//  reconstruit l'ordre des ids au drop. Simple natif (dragstart/dragover/drop).
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
// Variable SANS modalité : la ligne est un champ texte permanent — chaque
// libellé saisi trouve-ou-crée sa modalité (dictionnaire corpus). Variable AVEC
// modalités : le select garde une option « autre… » qui bascule LA ligne en
// champ texte. La pose de la valeur passe par setValeurGen/setValeurLoc
// (journal + autosave de l'entretien ouvert).
const AUTRE = ' autre' // sentinelle : ne peut pas être un id de modalité
const celluleLibre = ref<string | null>(null) // clé de LA ligne en mode texte
const cleGen = (idVar: string) => `gen|${idVar}`
const cleLoc = (index: number, idVar: string) => `loc|${index}|${idVar}`

// --- ANON : lignes de saisie (en bas du tableau, façon SonalPi) ---
// Compteur « à anonymiser » d'une ligne : longueur de la requête (hits PM)
// recalculée par le composable à l'ouverture de l'onglet, au ⟳ et après chaque
// geste anon. 0 ou ligne absente → compteur masqué.
function nbAAAnonymiser(cle: string): number {
  return hitsAAnonymiserParCle.value[cle]?.length ?? 0
}
// Tooltip de l'exposant d'incluses : wording V1 (« plus N absorbée(s)… », jamais
// « dont »), avec les entités absorbantes distinctes.
function tooltipIncluses(cle: string): string {
  const n = lignesAnon.value.find((l) => l.cle === cle)?.nbIncluse ?? 0
  const pars = inclusesParCle.value[cle] ?? []
  const qui = pars.length ? ` par « ${pars.join('», « ')}»` : ''
  return `plus ${n} absorbée(s)${qui} (non comptée(s) ici)`
}
// Plusieurs lignes vides : on saisit un nom, « passe à la ligne suivante »
// (Entrée) → le brouillon est persisté, et une nouvelle ligne vide s'ajoute si
// besoin. Un bouton « + » sous le tableau ajoute des lignes.
const lignesSaisie = ref<{ id: number; entite: string; pseudo: string }[]>([])
let seqSaisie = 0
const nouvelleLigneSaisie = () => ({ id: ++seqSaisie, entite: '', pseudo: '' })
lignesSaisie.value = [nouvelleLigneSaisie(), nouvelleLigneSaisie()]
// Refs par ligne (cases Nom/Pseudo) pour piloter le focus. Ce sont des
// <textarea> (multi-lignes) depuis que les champs enveloppent le texte.
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

/** Nom d'entité à l'écran : texte complet tant qu'il tient dans le bloc de 5
 *  lignes de la colonne Nom (mesuré par un probe clone ATTACHÉ au DOM — même
 *  largeur/police que la colonne → robuste au zoom/DPI) ; sinon, raccourci
 *  « début…fin ». Le titre garde le texte complet au survol. L'affichage est
 *  stocké DANS LE MODÈLE (affichagesNoms), pas muté sur le DOM : Vue reste
 *  propriétaire du texte interpolé et ne peut pas l'écraser. */
let largeurColonneAnon = 0
/** Mesure la hauteur réelle d'un texte enveloppé dans la colonne Nom (5 lignes
 *  max en CSS ; ici sans clamp pour connaître le besoin naturel avant raccourci). */
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
/** Raccourci « début…fin » d'un nom qui dépasse la largeur de la colonne : on
 *  garde des MOTS ENTIERS du début et de la fin (jamais de coupe en plein mot),
 *  joints par « … », puis on réduit mot à mot tant que ça ne tient pas dans les
 *  5 lignes de la colonne. */
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
  // Un seul mot plus large que 5 lignes : on ne peut pas couper de mot → on
  // laisse le clamp CSS tronquer avec « … » en fin de 5e ligne.
  if (!debut.length && !fin.length) return plein
  const compose = () =>
    (debut.length ? debut.join(' ') : '') + (debut.length && fin.length ? ' … ' : '') + fin.join(' ')
  let affiche = compose()
  // Garde-fou : réduit mot à mot (du côté le plus long) tant que le raccourci
  // dépasse encore les 5 lignes mesurées.
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

/** Valide UNE ligne : pose les occurrences (validerAnon), vide la ligne.
 *  `majuscule` (Entrée clavier uniquement) route vers la priorité de portée
 *  (étape 4a) au lieu du comportement historique du bouton ✓ (entretien). */
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
    // Bouton ✓ : comportement historique (pose au niveau entretien).
    validerAnon(e, p)
    l.entite = ''
    l.pseudo = ''
    return
  }
  // Entrée/Maj+Entrée : créer le brouillon puis appliquer la portée routée
  // par la priorité de validation (étape 4a).
  creerBrouillon(e, p)
  l.entite = ''
  l.pseudo = ''
  void validerAvecPriorite(e, majuscule)
}
/** Entrée sur le Nom (sans pseudo) → brouillon « entité seule » (draft inerte
 *  en attendant un pseudo), puis passage à la ligne suivante (créée au besoin). */
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
/** Le focus quitte une ligne entièrement → auto-brouillon si un Nom est saisi
 *  (le passage vers une autre ligne de saisie compte comme une sortie). */
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
/** Entrée sur le Pseudo d'une ligne existante : brouillon → valider selon la
 *  priorité (Entrée = portée prioritaire, Maj+Entrée = l'autre, étape 4a),
 *  entretien → relabel via le change au blur. Corpus → sans effet. */
function surEntreePseudoLigne(
  entite: string,
  etat: 'brouillon' | 'entretien' | 'corpus',
  value: string,
  majuscule: boolean,
) {
  if (etat === 'brouillon') {
    // Synchroniser le brouillon avec la saisie avant de router (le changement
    // de portée lit le pseudo du brouillon, pas le champ).
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
// La sélection dans l'éditeur peuple le Nom de la PREMIÈRE ligne de saisie vide
// (ou en crée une). Les lignes déjà remplies sont d'abord persistées en
// brouillon : c'est l'auto-brouillon, on peut enchaîner plusieurs entités.
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

// Le tableau Anon se remplit au RELÂCHEMENT du clic (`mouseup`), jamais
// pendant le drag : une entité multi-mots (« New York ») n'arrive qu'une fois
// la souris relâchée, même si on marque une pause en cours de glisser (une
// pause ne relâche pas le bouton → rien ne se remplit).
//
// ProseMirror propage la sélection DOM de façon ASYNCHRONE (événement
// `selectionchange`) : plutôt que deviner un délai fixe, on surveille
// `selectionAnon` jusqu'à ce qu'elle soit STABLE (2 lectures égales) après le
// relâchement, puis on remplit — on lit donc toujours la sélection FINALE,
// jamais celle d'un état intermédiaire. Et SEULEMENT si l'onglet Anon est
// ouvert : ailleurs, la sélection reste neutre.
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
// Écouteurs posés sur le DOM de l'éditeur (les deux rendus audio/vidéo passent
// par le même viewer : un seul attach suffit), retirés au démontage.
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
/** Focus du champ texte OUVERT via « autre… » (les champs permanents, dont la
 *  clé ne matche pas, ne volent jamais le focus). */
function focaliserLibre(el: unknown, cle: string) {
  if (el instanceof HTMLInputElement && celluleLibre.value === cle && document.activeElement !== el)
    el.focus()
}
</script>

<template>
    <section class="ecran entretien-ecran">
      <!-- Corpus distant : bandeau si le verrou de CET entretien est tenu
           par autrui (qui, depuis quand). -->
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
          <!-- Corpus distant, session à nous : statut de publication
               + « Publier maintenant ». En lecture seule (verrou autrui) :
               rien à publier, le bandeau 🔒 au-dessus parle déjà. -->
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

        <!-- Colonne GAUCHE : onglets + panneau de l'onglet actif. Collante, à
             défilement interne au-delà d'un écran, pour rester visible pendant
             la lecture. -->
        <div class="colonne-gauche">
          <nav class="onglets">
            <!-- Onglets réduits à l'ICONE : le titre apparaît au survol (title) et
                 sur le panneau d'accueil (vue d'ensemble). L'ACCUEIL vient en
                 PREMIER et par DÉFAUT : il accueille l'utilisateur avec les
                 conseils et la liste des autres onglets (icone + titre). -->
            <button data-onglet="maison" :class="{ actif: ongletDroite === 'maison' }" title="Accueil" @click="ongletDroite = 'maison'">
              <img class="ico-onglet" :src="icoMaison" alt="Accueil" />
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
            <button data-onglet="notes" :class="{ actif: ongletDroite === 'notes' }" title="Notes" @click="ongletDroite = 'notes'">
              <img class="ico-onglet" :src="icoNotes" alt="Notes" />
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
            <ul class="liste-tours">
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
                <img class="ico-onglet" :src="icoNotes" alt="" />
                <span><b>Notes</b> — notes structurées (post-collecte, résumé, réflexion…) avec surlignage des passages importants.</span>
              </li>
              <li>
                <img class="ico-onglet" :src="icoJournal" alt="" />
                <span><b>Journal</b> — suivi et annulation des actions de la session.</span>
              </li>
            </ul>
          </aside>

          <!-- Thématique : clic sur un thème = coder la sélection. L'ÉDITION
               (créer/renommer/couleur/taille/arbre/supprimer) passe par le
               crayon → fenêtre EditionThemes partagée avec l'écran Corpus. -->
          <aside v-show="ongletDroite === 'themes'" class="panneau themes-coder">
            <div class="corpus-tete">
              <h3>Thématiques</h3>
              <button v-if="!lectureSeule" class="crayon" title="Éditer les thèmes" @click="editerThemes = true">✏️</button>
            </div>
            <p class="aide-thm">Sélectionne du texte, puis clique un thème pour le coder (re-clic = retirer).</p>
            <p v-if="hintCodage" class="hint-codage">{{ hintCodage }}</p>

            <p v-if="codebook.length === 0" class="vide">Aucun thème — ✏️ pour en créer.</p>
            <ul class="liste-coder">
              <li v-for="n in arbreThemes()" :key="n.cat.id" class="ligne-coder">
                <button
                  class="theme-coder"
                  :class="{ inactif: !n.cat.actif }"
                  :style="{ marginLeft: n.profondeur * 1.1 + 'rem' }"
                  :disabled="roContenu"
                  @click="coderAvec(n.cat.id)"
                >
                  <span class="pastille" :style="{ background: couleurHex(n.cat) }"></span>
                  <!-- Taille de police UNIFORME (décision utilisateur : la taille
                       d'un thème ne s'applique qu'au marquage dans le texte). -->
                  <span class="theme-nom">{{ n.cat.nom }}</span>
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

            <!-- Petit tableau des locuteurs : Nom | Pseudo
                 (optionnel) | Interv. | ✕. Le pseudo posé pseudonymise les
                 étiquettes des tours (barré + [pseudo] dans la gouttière) ;
                 ✓ contrôle la confirmation, ⊘ le refus (libellé en clair). -->
            <div class="tableau-loc">
              <div class="tableau-loc-tetes">
                <span title="Couleur du nom — cliquer pour choisir"></span>
                <span>Nom</span>
                <span>Pseudo (optionnel)</span>
                <span title="Interviewer — pose les questions (tours en italique)">Interv.</span>
              </div>
              <ul class="liste-loc">
                <li v-for="(l, i) in locuteurs" :key="l.index">
                  <!-- Sélecteur de couleur du nom : défaut auto par index
                       (palette prédéfinie) ; au clic, le sélecteur NATIF du
                       navigateur (même mécanisme que l'édition des thèmes :
                       TOUTES les couleurs possibles). Le nom s'écrit dans la
                       couleur choisie dans l'éditeur, sans toucher au pseudo. -->
                  <input
                    type="color"
                    class="carre-couleur"
                    :value="l.couleur ?? couleurPourLocuteur(l.index)"
                    :title="`Couleur du nom — choisir (actuelle : ${l.couleur ?? 'automatique'})`"
                    :disabled="roContenu"
                    @change="choisirCouleurLoc(l.index, ($event.target as HTMLInputElement).value)"
                  />
                  <!-- data-tour sur le 1er nom uniquement : cible de l'étape
                       « Renommer les locuteurs » du pas-à-pas. -->
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
                    <template v-if="(l.pseudo ?? '').trim()">
                      <!-- Un seul bouton-bascule ✓ / ⊘ (économie de place dans la
                           colonne Pseudo) : ✓ vert = pseudonymisation confirmée,
                           ⊘ rouge = libellé en clair refusé. Un clic bascule. -->
                      <button
                        class="dec-pseudo"
                        :class="l.pseudoEtat === 'refuse' ? 'refus actif' : 'actif'"
                        :title="l.pseudoEtat === 'refuse'
                          ? 'Libellé en clair (refusé) — cliquer pour confirmer ✓'
                          : 'Pseudonymisation confirmée ✓ — cliquer pour refuser (⊘)'"
                        v-if="!roContenu" @click="basculerPseudoEtatLoc(l.index)"
                      >{{ l.pseudoEtat === 'refuse' ? '⊘' : '✓' }}</button>
                    </template>
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

          <!-- Données de CET entretien : saisie des valeurs (2 niveaux : entretien +
               locuteur), même saisie libre que la Table de données (« autre… »,
               variable sans modalité = champ texte). Le crayon ouvre la fenêtre
               EditionVariables partagée (créer/éditer des variables sans repasser
               par l'écran Corpus) ; la matrice complète reste à la Table. -->
          <aside v-show="ongletDroite === 'donnees'" class="panneau donnees">
            <div class="corpus-tete">
              <h3>Données</h3>
              <button v-if="!roContenu" class="crayon" title="Éditer les variables (nom, statut, modalités)" @click="editerVariables = true">✏️</button>
            </div>

            <template v-if="varsGen().length">
              <h4>Valeurs · cet entretien</h4>
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
              <h4>Valeurs · par locuteur</h4>
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

          <!-- Notes : notes structurées (catégorie + date + statut + corps
               surlignable). Vue cartes par défaut, ou texte concaténé (expand).
               Création/édition par modale inline ; catégories gérées dans un
               sous-volet (nom + couleur, comme les locuteurs). -->
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
                  title="Vue texte (toutes les notes à la suite)"
                  @click="vueNotes = 'texte'">📄</button>
                <button v-if="!roContenu" class="mini"
                  :class="{ actif: voletCategoriesNote }"
                  title="Gérer les catégories de note"
                  @click="voletCategoriesNote = !voletCategoriesNote">⚙</button>
              </div>
              <button v-if="!roContenu" class="mini" @click="ajouterNote">+ Note</button>
            </div>

            <!-- Volet catégories : nom + couleur, façon locuteurs.
                 Définitions au CORPUS : les gestes passent par l'IPC. -->
            <div v-if="voletCategoriesNote" class="volet-categories-note">
              <p v-if="messageCategorieNote" class="msg-thm">{{ messageCategorieNote }}</p>
              <div class="tableau-loc tetes-courtes">
                <span title="Couleur"></span>
                <span>Nom</span>
                <span></span>
              </div>
              <ul class="liste-loc">
                <li v-for="c in categoriesNote" :key="c.id">
                  <input type="color" class="carre-couleur"
                    :value="c.couleur"
                    :disabled="roContenu"
                    @change="majCouleurCategorieNote(c.id, ($event.target as HTMLInputElement).value)"
                  />
                  <input class="nom-loc"
                    :value="c.nom"
                    :disabled="roContenu"
                    @change="renommerCategorieNote(c.id, ($event.target as HTMLInputElement).value)"
                  />
                  <button v-if="!roContenu" class="x-loc" title="Supprimer cette catégorie"
                    @click="supprimerCategorieNote(c.id)">✕</button>
                </li>
                <li v-if="!roContenu">
                  <span class="plus-couleur">＋</span>
                  <input class="nom-loc" placeholder="nouvelle catégorie…"
                    @change="onAjoutCategorieInput($event)"
                  />
                </li>
              </ul>
            </div>

            <!-- Vue cartes : une carte par note, triée par rang. -->
            <div v-if="vueNotes === 'cartes'" class="notes-cartes">
              <p v-if="notes.length === 0" class="vide">Aucune note — « + Note » pour en créer une.</p>
              <article v-for="n in notesTriees" :key="n.id" class="carte-note"
                :draggable="!roContenu"
                @dragstart="onDragStartNote(n.id)"
                @dragover.prevent
                @drop="onDropNote(n.id)"
              >
                <header class="carte-note-tete">
                  <span class="pastille-cat" :style="{ background: couleurCategorieNote(n.categorieId) }"></span>
                  <span class="nom-cat">{{ nomCategorieNote(n.categorieId) }}</span>
                  <span class="date-cat">{{ dateLibelle(n.date) }}</span>
                  <span class="statut-cat" :class="n.statut">{{ n.statut === 'public' ? 'public' : 'privé' }}</span>
                  <span v-if="!roContenu" class="carte-note-actions">
                    <button class="mini" title="Éditer" @click="editerNote(n.id)">✎</button>
                    <button class="mini danger" title="Supprimer" @click="supprimerNote(n.id)">✕</button>
                  </span>
                </header>
                <!-- v-html : le `corps` est sanitisé (texte échappé + <mark>)
                     côté composable à la validation → sûr. -->
                <div class="corps-note" v-html="corpsOuVide(n)"></div>
              </article>
            </div>

            <!-- Vue texte : concaténation plain text (expand), format V1. -->
            <pre v-else class="notes-texte">{{ texteExpand || '(aucune note)' }}</pre>
          </aside>

          <!-- Formulaire de note (modale inline) : corps contenteditable +
               méta (catégorie, date, statut). Ouvert par + Note ou éditer.
               Teleport vers <body> : la colonne gauche est sticky (contexte
               d'empilement), l'éditeur serait sinon peint PAR-DESSUS la
               modale quel que soit son z-index. -->
          <Teleport to="body">
          <div v-if="brouillonNote" class="modale-note">
            <div class="modale-note-fond" @click="annulerNote"></div>
            <div class="modale-note-fenetre">
              <div class="corpus-tete">
                <h3>{{ brouillonNote.id ? 'Éditer la note' : 'Nouvelle note' }}</h3>
                <button class="mini" title="Fermer" @click="annulerNote">✕</button>
              </div>
              <div class="modale-note-corps">
                <!-- Corps : contenteditable. Le surlignage des passages
                     importants y est visible (bouton « Marquer » enveloppe la
                     sélection d'un <mark>). -->
                <div
                  ref="zoneCorpsNote"
                  class="zone-corps-note"
                  contenteditable="true"
                  data-placeholder="Votre note… (sélectionnez un passage puis ✏ pour le marquer)"
                  @input="onSaisieCorpsNote"
                  @contextmenu="onContextmenuCorpsNote"
                ></div>
                <div class="barre-outils-note">
                  <button class="mini" title="Marquer le passage sélectionné (toggle)"
                    @click="zoneCorpsNote && marquerPassage(zoneCorpsNote)">✏ Marquer</button>
                </div>
                <div class="modale-note-meta">
                  <label class="champ-note">
                    <span>Catégorie</span>
                    <select v-model="brouillonNote.categorieId">
                      <option v-for="c in categoriesNote" :key="c.id" :value="c.id">{{ c.nom }}</option>
                      <option value=" autre">autre…</option>
                    </select>
                    <button v-if="brouillonNote.categorieId === ' autre'" class="mini" @click="ouvrirCreationCategorie">＋ Créer</button>
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
                  <button class="principal" @click="validerCreationCategorie">Créer</button>
                  <button @click="creationCategorie = null">Annuler</button>
                </div>
              </div>
            </div>
            <!-- Menu de liaison d'un passage important aux commentaires
                 (clic droit sur un `<mark>` du corps, cf. onContextmenuCorpsNote). -->
            <MenuLiensNote
              v-if="menuLiensNote && brouillonNote"
              :x="menuLiensNote.x"
              :y="menuLiensNote.y"
              :commentaires="commentairesPourLiaison"
              :liens="menuLiensNote.liens"
              @lier="lierCommentaireNote"
              @delier="delierCommentaireNote"
              @fermer="fermerMenuLiensNote"
            />
          </div>
          </Teleport>

          <!-- Anon : pseudonymisation du texte. Une ligne par entité (brouillon
               sans occurrence, ou occurrences posées). La sélection peuple
               la ligne de saisie ; Entrée sur le Pseudo pose les occurrences
               (barré + [pseudo], cf. editeur.css). -->
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
                      <!-- Thématique (4c) : badge-sélecteur sur les lignes CORPUS
                           quand le réglage est activé au panneau Pseudos. -->
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
                        <!-- Widget de navigation ◄ i/N ► (loupe) tant qu'un
                             repérage est actif sur CETTE ligne. -->
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
                        <!-- Incluses : exposant non cliquable — absorbées par une
                             entité plus large, le clic retombe sur la règle large. -->
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

                <!-- Lignes de saisie/draft : lignes du tableau (façon SonalPi), une
                     entité par ligne. Entrée sur le Nom → brouillon + passage à la
                     ligne suivante ; Entrée sur le Pseudo ou ✓ → valider. -->
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

          <!-- Ancre de la consigne « panneau » du pas-à-pas : le guide de
               l'étape (ex. « Écouter et corriger ») s'affiche EN BAS de la
               colonne de gauche, sous le panneau de l'onglet actif — pas en
               haut (à la place du panneau) ni en bulle flottante sur le texte. -->
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
                <!-- Ouvrir/fermer la vue vidéo : quand elle est fermée, la barre
                     de son prend toute la largeur (pas de trou), l'audio continue. -->
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
      <EditionVariables v-if="editerVariables" @fermer="editerVariables = false" />

      <!-- Menu contextuel de l'éditeur (clic droit) : sections anon
           (exception ↔ anonymisé, multi-pseudo), codages couvrants (retrait
           sans resélectionner) et commentaires (créer / éditer). -->
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

      <!-- Dialogue de divergence à la poussée vers le corpus (3b) : une règle
           existante porte des pseudos différents → Aligner / Garder les deux. -->
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
      <!-- Suggestion d'entité-cœur (mots de liaison) : à la validation
           d'une entité à affixe (« à Lyon »), proposer aussi la règle générale
           (« Lyon »), à la même portée. Jamais automatique : Oui crée la
           règle, Non ne crée rien et ne mémorise aucun refus. -->
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
  /* Barre d'actions épinglée juste sous l'en-tête de l'appli (--entete-h est
     défini dans App.vue). Fond opaque pour masquer le contenu qui glisse. */
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
/* Colonne de gauche collante : onglets + panneau, reste visible ; au-delà d'un
   écran elle défile en interne. Ses points d'épinglage tiennent compte des
   deux barres épinglées du dessus (en-tête app + barre d'actions). La hauteur
   max est RÉDUITE du même décalage que `top` : sinon une liste longue (beaucoup
   de thèmes) déborderait d'un écran sous le bord bas de la fenêtre — les
   derniers thèmes resteraient inaccessibles tant qu'on n'a pas fait défiler le
   texte (la colonne collante repart vers le haut). */
.colonne-gauche {
  grid-area: gauche;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  position: sticky;
  top: calc(var(--entete-h) + var(--barre-h));
  /* `top` ci-dessus vs hauteur d'écran : le panneau doit tenir entre la barre
     d'actions et le bord bas de la fenêtre, sinon son défilement interne garde
     les derniers éléments du panneau visibles SANS toucher au texte. Le −1rem
     compense l'écart de la grille : à la position naturelle (page en haut) le
     panneau s'appuie sur la ligne « barre » + son gap, soit `top` + gap. */
  max-height: calc(100vh - var(--entete-h) - var(--barre-h) - 1rem);
  overflow-y: auto;
}
/* Colonne de droite : lecteur audio puis éditeur. Le lecteur est collant en
   haut (fond opaque) pour rester visible pendant la lecture ; l'éditeur défile
   dessous. */
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
/* Zone média du MODE VIDÉO : lecteur+waveform empilés à gauche ‖ panneau vidéo
   à droite. Collante comme le lecteur audio. Les deux colonnes SE PARTAGENT la
   largeur : le lecteur (flex 1 1) prend ce que la vidéo ne prend pas, et quand on
   réduit la vidéo, la place libérée revient à la barre de son (jamais tronquée). */
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
/* Icônes SonalPi (glyphes noirs) : adoucies sur l'onglet inactif. Plus
   grandes dans les onglets de la barre gauche (20px) — la liste d'accueil
   garde sa taille propre (20px, cf. .liste-tours). L'onglet Anonymisation est
   un cran plus grand (23px). */
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
/* Panneau Accueil : le raccourci en tête, puis la vue d'ensemble des autres
   onglets (icone + titre) — chaque ligne rappelle ce que fait l'onglet. */
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
  gap: 0.45rem;
  width: 100%;
  text-align: left;
  border: 1px solid #e5e5ef;
  border-radius: 6px;
  background: #fff;
  padding: 0.3rem 0.5rem;
  cursor: pointer;
  font-size: 0.85rem;
}
.theme-coder:hover {
  border-color: #2e73d8;
  background: #f0f6ff;
}
.theme-coder.inactif {
  opacity: 0.45;
}
.pastille {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex: none;
  border: 1px solid rgba(0, 0, 0, 0.15);
}
.theme-nom {
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
}
.fiche-loc-nom {
  font-size: 0.78rem;
  font-weight: 600;
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
 * La grille de colonnes est partagée entre l'en-tête et les lignes —
 * les largeurs restent stables, le champ Nom respire (colonne 2). */
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
/* Sélecteur de couleur du nom : auto-rempli par index par défaut (palette
 * prédéfinie) ; au clic, le sélecteur NATIF du navigateur (même mécanisme que
 * l'édition des thèmes — TOUTES les couleurs possibles). Le nom du locuteur
 * s'écrit dans cette couleur dans l'éditeur, sans toucher au pseudo. */
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
/* Le `<input type="color">` natif dessine la couleur dans un carré interne
 * entouré d'un liseré clair (« carré dans un carré ») : on force le swatch
 * interne à occuper tout l'élément pour que la couleur prenne toute la place. */
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
/* Cellule Pseudo : champ + décision confirmer ✓ / refuser ⊘ (le pseudo posé
 * pseudonymise les étiquettes de ses tours, rendues barrées + [pseudo]). */
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
.dec-pseudo {
  flex: none;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  padding: 0 0.28rem;
  font-size: 0.66rem;
  line-height: 1.4;
  cursor: pointer;
  opacity: 0.45;
}
.dec-pseudo:hover {
  opacity: 1;
}
.dec-pseudo.actif {
  opacity: 1;
  border-color: #2e73d8;
  color: #1565c0;
  background: #eef4ff;
}
.dec-pseudo.refus.actif {
  border-color: #c33;
  color: #c33;
  background: #fff3f3;
}
.interv {
  justify-self: center;
}
.x-loc {
  justify-self: center;
}
/* Interrupteur « interviewer » : pilule compacte + « ? » (la convention SonalPi,
   rendue cliquable). Coché → bleu, tours du locuteur en italique. */
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
/* Deux sous-lignes dans la colonne actions, façon SonalPi : le slider de portée
 * sur une ligne, les occurrences + l'action (✕) sur l'autre. Le flex vit sur un
 * div INTERNE (`.actions-empile`), PAS sur la cellule `<td>` : un `display:flex`
 * sur un td le retire de son rôle table-cell et casse la participation de la
 * ligne au calcul des colonnes du tableau en `table-layout:fixed`. */
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
 * Pseudo — texte noir, sans contour — pour l'essai UX de cohérence visuelle. */
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
 * enveloppe le texte sur plusieurs lignes, s'étire au contenu (field-sizing) et
 * plafonne à 5 lignes — au-delà, défilement INTERNE (on ne tronque jamais la
 * valeur d'un champ éditable, le texte complet reste modifiable). Encadrés comme
 * les champs du tableau Locuteurs (contour #ccc, radius 4) pour harmoniser les
 * deux tableaux ; le fond de la ligne (brouillon/saisie) continue de distinguer
 * les états, le contour assure la ressemblance avec le tableau Locuteurs. */
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
/* Compteurs scindés d'une ligne anon : quantité d'occurrences ANONYMISÉES
 * (barrées) et d'EXCEPTIONS (laissées en clair). Palette SonalPi V1 : les
 * badges ronds colorés (.cpt-btn ci-dessous) portent la couleur de chaque état. */
/* Groupe de boutons d'en-tête du panneau anon (⟳ + « + Ligne »). */
.tete-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
/* Compteurs cliquables (repérage ◄ i/N ►) : BADGES RONDS colorés, palette
 * SonalPi V1 — vert #15c095 = anonymisé, gris #555 = exception, orange
 * #ff9800 = à anonymiser. Chiffre blanc sur la couleur, comme V1. */
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
 * naviguée (palette V1) : vert = anonymisées, gris = exceptions, orange = à
 * anonymiser — la navigation reste lisible sans retourner aux badges. */
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
 * geste anon) — badge orange V1 (.cpt-btn.cpt-aanon). */
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
/* Dialogue de divergence de pseudo (poussée vers le corpus, 3b) */
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
/* Volet catégories : mini-tableau nom + couleur (mêmes classes que locuteurs). */
.volet-categories-note {
  margin-bottom: 0.6rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px dashed #d8d8d8;
}
.tetes-courtes span:nth-child(3) { width: 1.5rem; }
.plus-couleur {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.8rem;
  color: #8a8a8a;
}

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
.corps-note mark {
  background: none;
  font-weight: bold;
  padding: 0;
}
/* Passage important relié à au moins un commentaire (data-liens porté par le
   `<mark>` et conservé par le sanitisé) : souligné pour le distinguer. */
.corps-note mark[data-liens],
.zone-corps-note mark[data-liens] {
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* Vue texte (expand) : bloc préformaté, une note par bloc. */
.notes-texte {
  font-family: inherit;
  font-size: 0.83rem;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  line-height: 1.45;
  color: #333;
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
.zone-corps-note mark {
  background: none;
  font-weight: bold;
  padding: 0;
}
.barre-outils-note {
  display: flex;
  gap: 0.3rem;
  margin: 0.4rem 0;
}
.modale-note-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
  margin-top: 0.3rem;
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
</style>
