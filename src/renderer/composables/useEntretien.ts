import { ref, reactive, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { Extension } from '@tiptap/core'
import { useEditor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { BlocAttributs } from '../editor/schema'
import { pluginRemap } from '../editor/remap'
import { pluginDecorations, decorationsPluginKey } from '../editor/decorations'
import { pluginGouttiere, gouttierePluginKey } from '../editor/locuteursGutter'
import { pluginLecture } from '../editor/lecture'
import { pluginMenuContexte, type CibleMenuContexte } from '../editor/menuContexte'
import { pluginCommentairesMarge } from '../editor/commentairesMarge'
import { pluginReperage, reperagePluginKey } from '../editor/reperage'
import { pluginRecherche, recherchePluginKey, trouverOccurrences, type OccurrenceRecherche } from '../editor/recherche'
import { snapToWord, snapBornes } from '../editor/snap'
import { attribuerSelectionTr } from '../editor/attribution'
import { aplatir, occurrencesDe, plageVersPM, instructionsValiderAnon } from '../../shared/entretien/anon/anonymisation'
import { hitsAAAnonymiser, hitsDeCategorie, hitsIncluses, type HitAAAnonymiser } from '../../shared/entretien/anon/compteursAnon'
import { scinderPseudos } from '../../shared/entretien/anon/pseudos'
import { parserAliases } from '../../shared/entretien/anon/alias'
import {
  cleEntite,
  trouverBrouillon,
  ajouterBrouillon,
  majBrouillon,
  retirerBrouillon,
  consommerBrouillon,
  lignesAnonUnifiees,
  type LigneAnon,
} from '../../shared/entretien/anon/brouillonsAnon'
import { pluginRemapJournal } from '../editor/journalRemap'
import {
  renommerLocuteur,
  ajouterLocuteur,
  supprimerLocuteur,
  nomDeLocuteur,
} from '../../shared/entretien/locuteurs'
import { estOrpheline, type Annotation } from '../../shared/entretien/annotation'
import { ajouterCodage, retirerAnnotation, trouverCodage, ajouterCommentaire, modifierCommentaire, type Entretien } from '../../shared/entretien/entretien'
import {
  enregistrer,
  annuler as annulerAuJournal,
  estApplicable,
  type CtxInverse,
  type Journal,
} from '../../shared/entretien/journal'
import type { Ancre } from '../../shared/entretien/audio'
import { useSynchroAudio } from './useSynchroAudio'
import { resumeThematique } from '../../shared/corpus'
import type { EntretienFichier, Locuteur, SegmentThematique, BrouillonAnon, RegleAnon, MotsLiaisonParams, Note } from '../../shared/format'
import { FORMAT_VERSION } from '../../shared/format'
import { fusionnerEntretiens, corpsIdentiques } from '../../shared/entretien/fusion'
import { detecterDivergencesPortee } from '../../shared/entretien/anon/reconciliation'
import { suggestionCoeur } from '../../shared/entretien/anon/motsLiaison'
import type { LegacyBlobs } from '../import/importSonal'
import {
  genIdNote,
  prochainRang,
  renumeroterRangs,
} from '../../shared/entretien/notes'
import {
  sanitiserCorpsNote,
  normaliserNotesLues,
  corpsNoteEnTexte,
  lireLiensNote,
  decoreRefsCommentaires,
  ATTR_LIENS_NOTE,
} from '../notes/sanitiser'

type Extrait = { id: string; texte: string; locuteurs: string[] }

/** Ligne du tableau Anon : voir brouillonsAnon.ts. (Type réimporté pour le
 *  template ; la projection vit dans le module pur.) */

/**
 * Scope ENTRETIEN : l'ENTRETIEN OUVERT — sa vérité en session (doc
 * ProseMirror + annotations + locuteurs + valeurs), l'éditeur TipTap et ses
 * plugins, les gestes (coder, locuteurs, valeurs), l'autosave et le panneau debug.
 * Ne connaît PAS le corpus : ses dépendances de scope sont injectées —
 *  - `couleurTrait` : résout la couleur d'un code (scope corpus) pour le marquage ;
 *  - `apresSauvegarde` : rafraîchit les requêtes corpus après un save (orchestration) ;
 *  - `codeExtraits` : le thème filtrant la requête Extraits (plus d'UI dédiée,
 *    la requête reste disponible pour un futur écran de recueil) ;
 *  - `nomCode` / `libelleValeur` : libellés lisibles pour le journal (les noms
 *    de thèmes/variables vivent au corpus, le journal vit ici).
 */
import type { VueLocuteurPersonne } from '../../shared/corpus/personnes'
import { type ChoixRepriseLocuteur, natureNomPersonne, peutCreerPersonneAuNommage, refuserRapprochement, reprendreDonneesLocuteur, suggestionsExactesPersonnes } from '../../shared/corpus/rapprochementsPersonnes'

export function useEntretien(deps: {
  couleurTrait: (code: string) => string
  /** Taille de police (px) d'un code — la `taille` du codebook (scope corpus),
   *  `undefined` = taille du texte. Même idiome d'injection que `couleurTrait`. */
  tailleTrait?: (code: string) => number | undefined
  /** Un code est-il ACTIF (définition du codebook, scope corpus) : un thème
   *  inactif est masqué du marquage de l'éditeur et refusé au codage. */
  estCodeActif: (code: string) => boolean
  apresSauvegarde: () => Promise<void>
  codeExtraits: () => string
  nomCode: (code: string) => string
  libelleValeur: (idVar: string, idMod: string) => string
  /** Catégories de note (définitions corpus) : nom d'une catégorie depuis
   *  son id (les notesEnTexte l'affichent) et id par défaut du formulaire de
   *  création. Injection orchestrateur — le scope entretien ne porte plus la
   *  typologie, elle vit au corpus. */
  nomCategorieNote: (id: string) => string
  categorieNoteDefaut: () => string
  /** Clic sur la gouttière d'un bloc → l'orchestrateur cale l'audio au
   *  début du tour (le scope entretien ne connaît pas le lecteur). */
  clicTour?: (posBloc: number) => void
  /** Clic DANS le texte → l'orchestrateur cale l'audio au temps interpolé
   *  à cet endroit précis (comme SonalPi1 — la barre suit, play reprend là). */
  clicTexte?: (pos: number) => void
  /** Double-espace dans le texte = play/pause (parité SonalPi1). Renvoie `true`
   *  si un audio était chargé et a donc été (dé)clenché ; `false` sinon (aucun
   *  audio → l'éditeur laisse la 2ᵉ espace se taper normalement). */
  basculerLecture?: () => boolean
  /** Règles corpus (`corpus.json.reglesAnon`) — injectées par l'orchestrateur
   *  (useCorpus) : le menu contexte et les promotions résolvent les règles
   *  multi-pseudo et créent/relient les règles à la portée corpus (3b). */
  reglesAnon: () => RegleAnon[]
  /** Rafraîchit le cache des règles corpus après une mutation (création,
   *  « garder les deux », déliage/suppression) — injecté par l'orchestrateur
   *  pour que la projection des lignes reflète la règle fraîche. */
  rafraichirReglesCorpus?: () => Promise<void>
  /** Priorité de validation (étape 4a, corpus.json.paramsAnon) : la portée
   *  qu'applique ENTRÉE sur une ligne du tableau ; Maj+Entrée fait l'inverse. */
  prioriteAnon: () => 'corpus' | 'entretien'
  /** Réglage mots de liaison (corpus.json.paramsAnon.motsLiaison) :
   *  suggestion d'entité-cœur à la validation (« à Lyon » → proposer « Lyon »).
   *  Absent → aucune proposition (tests PUR). */
  motsLiaison?: () => MotsLiaisonParams
  /** Thématiques d'entités (4c) — réglage courant (actif + liste). */
  thematiques?: () => { actif: boolean; liste: string[] }
  /** Assigne/retire la catégorie d'une règle corpus puis rafraîchit le
   *  cache des règles (injection orchestrateur, écriture transactionnée). */
  categoriserRegle?: (regleId: string, categorie: string | null) => Promise<void>
  /** Corpus distant : lecture seule des DÉFINITIONS (grisage permanent).
   *  L'éditeur suit `entretienEditable`, pas ce drapeau. */
  lectureSeule?: () => boolean
  /** L'entretien ouvert est-il éditable ? (corpus local : toujours ; distant :
   *  seulement si NOUS tenons son verrou — état renvoyé par lireEntretien.) */
  entretienEditable?: () => boolean
}) {
  const auteur = 'moi'
  const genId = () => 'a-' + Math.random().toString(36).slice(2, 9)

  // --- Modèle en session (LA vérité ; éditeur et disque = projections) ---
  const entretien = reactive<Entretien>({ annotations: [], ancres: [] })
  const locuteurs = ref<Locuteur[]>([])
  const legacyCourant = ref<LegacyBlobs>({ tabAnon: null, notes: '' })
  // Notes structurées de l'entretien (normalisées à l'ouverture : un fichier
  // non migré obtient []). Leurs CATÉGORIES vivent au corpus (deps).
  const notes = ref<Note[]>([])
  const meta = reactive<{
    valeursGen: Record<string, string>
    audioRef: string | null
    audioDistant?: { chemin: string } | null // transporté tel quel par payloadCourant
  }>({
    valeursGen: {},
    audioRef: null,
  })
  // L'entretien s'ouvre sur l'ACCUEIL par défaut : il présente les conseils et
  // la vue d'ensemble des autres onglets (icone + titre) avant de commencer.
  const ongletDroite = ref<'maison' | 'themes' | 'locuteurs' | 'donnees' | 'journal' | 'anon' | 'notes'>('maison')
  const hintCodage = ref<string | null>(null)
  // Sélection courante pour l'onglet Anon (texte + plage snappée au mot) :
  // c'est elle qui peuple le « Nom » de la ligne de saisie. REQUÊTE, jamais
  // stockée — recalculée au moindre déplacement du curseur.
  const selectionAnon = ref<{ texte: string; from: number; to: number } | null>(null)
  const hintAnon = ref<string | null>(null)
  const lignesAnon = ref<LigneAnon[]>([])
  /** Hits « à anonymiser » par cle de ligne — REQUÊTE recalculée à l'affichage
   *  de l'onglet, au clic « ⟳ » et après chaque geste anon (pas à chaque
   *  frappe : le compteur peut être brièvement en retard sur le texte). */
  const hitsAAnonymiserParCle = ref<Record<string, HitAAAnonymiser[]>>({})
  /** Incluses par cle de ligne : entités absorbantes distinctes — l'effectif
   *  « +N » vient de la projection (`ligne.nbIncluse`). REQUÊTE recalculée
   *  avec les autres compteurs. */
  const inclusesParCle = ref<Record<string, string[]>>({})
  function rafraichirCompteursAAAnonymiser() {
    const ed = editor.value
    if (!ed) {
      hitsAAnonymiserParCle.value = {}
      return
    }
    const corpsTexte = ed.getJSON()
    const texteDe = (f: number, t: number) => ed.state.doc.textBetween(f, t, ' ')
    const out: Record<string, HitAAAnonymiser[]> = {}
    const incl: Record<string, string[]> = {}
    for (const l of lignesAnon.value) {
      const aliases = parserAliases(l.entite)
      const cles = [l.cle, ...aliases.map((a) => cleEntite(a))]
      const hits = hitsAAAnonymiser(corpsTexte, aliases, entretien.annotations, cles, texteDe)
      if (hits.length) out[l.cle] = hits
      const abs = hitsIncluses(corpsTexte, aliases, entretien.annotations, cles, texteDe)
      if (abs.length) incl[l.cle] = [...new Set(abs.map((h) => h.par))]
    }
    hitsAAnonymiserParCle.value = out
    inclusesParCle.value = incl
  }
  // À l'ouverture de l'onglet anon (et à sa réouverture) : compteurs frais.
  watch(ongletDroite, (v) => {
    if (v === 'anon') rafraichirCompteursAAAnonymiser()
  })

  // --- Repérage ◄ i/N ► (loupe) — navigation NON destructive entre occurrences ---
  /** Repérage en cours sur une ligne : catégorie navigable (+ variante de
   *  pseudo éventuelle), liste des hits PM triés et index courant. */
  const reperageAnon = ref<{
    cle: string
    categorie: 'anonymise' | 'exception' | 'a-anonymiser'
    variante?: string
    hits: HitAAAnonymiser[]
    index: number
  } | null>(null)
  /** Cale l'éditeur sur le hit courant : sélection de la plage (sans aucun
   *  marquage), décoration transitoire « hit » + scroll centré. */
  function calerSurHitCourant() {
    const ed = editor.value
    const r = reperageAnon.value
    if (!ed || !r || r.hits.length === 0) return
    const hit = r.hits[r.index]
    ed.commands.setTextSelection({ from: hit.from, to: hit.to })
    ed.view.dispatch(ed.state.tr.setMeta(reperagePluginKey, { de: hit.from, a: hit.to }))
    const dom = ed.view.domAtPos(hit.from).node
    const el = dom instanceof HTMLElement ? dom : dom.parentElement
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  /** Recalcule les hits du repérage EN COURS (après une action qui a changé le
   *  modèle) ; index borné à la nouvelle liste, repérage arrêté si vide. */
  function rafraichirReperage() {
    const r = reperageAnon.value
    if (!r) return
    const hits = hitsDuRepere(r)
    if (hits.length === 0) {
      arreterReperage()
      return
    }
    r.hits = hits
    if (r.index >= hits.length) r.index = hits.length - 1
    calerSurHitCourant()
  }
  function hitsDuRepere(r: { cle: string; categorie: 'anonymise' | 'exception' | 'a-anonymiser'; variante?: string }): HitAAAnonymiser[] {
    const ed = editor.value
    if (!ed) return []
    if (r.categorie === 'a-anonymiser') {
      const aliases = parserAliases(entiteDeCle(r.cle))
      return hitsAAAnonymiser(
        ed.getJSON(),
        aliases,
        entretien.annotations,
        [r.cle, ...aliases.map((a) => cleEntite(a))],
        (f, t) => ed.state.doc.textBetween(f, t, ' '),
      )
    }
    return hitsDeCategorie(entretien.annotations, r.cle, r.categorie, (f, t) => ed.state.doc.textBetween(f, t, ' '), r.variante)
  }
  /** Texte d'entité d'une cle : celui de la ligne projetée (suit le doc). */
  function entiteDeCle(cle: string): string {
    return lignesAnon.value.find((l) => l.cle === cle)?.entite ?? ''
  }
  /** Démarre (ou bascule) le repérage d'une catégorie de compteur. Un second
   *  clic sur la même catégorie l'arrête. */
  function demarrerReperage(cle: string, categorie: 'anonymise' | 'exception' | 'a-anonymiser', variante?: string) {
    const meme =
      reperageAnon.value &&
      reperageAnon.value.cle === cle &&
      reperageAnon.value.categorie === categorie &&
      reperageAnon.value.variante?.toLowerCase() === variante?.toLowerCase()
    if (meme) {
      arreterReperage()
      return
    }
    const hits = hitsDuRepere({ cle, categorie, variante })
    if (hits.length === 0) {
      hintAnon.value = "Aucune occurrence trouvée pour cette ligne."
      return
    }
    reperageAnon.value = { cle, categorie, variante, hits, index: 0 }
    calerSurHitCourant()
  }
  /** Pas de navigation ◄ / ► (modulo, comme SonalPi1). */
  function naviguerReperage(sens: number) {
    const r = reperageAnon.value
    if (!r || r.hits.length === 0) return
    r.index = (r.index + sens + r.hits.length) % r.hits.length
    calerSurHitCourant()
  }
  /** Stoppe le repérage et efface la décoration transitoire. */
  function arreterReperage() {
    reperageAnon.value = null
    const ed = editor.value
    if (ed) ed.view.dispatch(ed.state.tr.setMeta(reperagePluginKey, null))
  }

  // --- Recherche / remplacement (Ctrl+F) -------------------------------------
  /** Boîte ouverte et texte saisi. Le remplacement est désactivé en lecture
   *  seule (roContenu côté vue) ; la recherche reste toujours disponible. */
  const rechercheOuverte = ref(false)
  const rechercheTexte = ref('')
  const remplacementTexte = ref('')
  /** Occurrences courantes dans le document + index de l'occurrence active
   *  (surlignée différemment) — recalculées à chaque changement (requête ou doc). */
  const occurrencesRecherche = ref<OccurrenceRecherche[]>([])
  const indexRecherche = ref(-1)

  /** Pousse les plages + index courant dans le plugin (décorations). */
  function majDecorationsRecherche() {
    const ed = editor.value
    if (!ed) return
    ed.view.dispatch(
      ed.state.tr.setMeta(recherchePluginKey, {
        plages: occurrencesRecherche.value,
        actif: indexRecherche.value,
      }),
    )
  }
  /** Sélectionne l'occurrence active et fait défiler jusqu'à elle (centré,
   *  comme le repérage anon). */
  function calerOccurrenceActive() {
    const ed = editor.value
    const occ = occurrencesRecherche.value[indexRecherche.value]
    if (!ed || !occ) return
    ed.commands.setTextSelection({ from: occ.de, to: occ.a })
    const dom = ed.view.domAtPos(occ.de).node
    const el = dom instanceof HTMLElement ? dom : dom.parentElement
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  /** Recalcule les occurrences pour la requête courante ; l'index est borné.
   *  `premier` (changement de requête) sélectionne en plus la première
   *  occurrence — sans ça, la frappe dans l'éditeur ne bouge pas la sélection. */
  function recalculerRecherche(premier = false) {
    const ed = editor.value
    const q = rechercheTexte.value.trim()
    occurrencesRecherche.value = ed && q ? trouverOccurrences(ed.state.doc, q) : []
    if (occurrencesRecherche.value.length === 0) indexRecherche.value = -1
    else if (premier || indexRecherche.value < 0) {
      indexRecherche.value = 0
    } else if (indexRecherche.value >= occurrencesRecherche.value.length) {
      indexRecherche.value = occurrencesRecherche.value.length - 1
    }
    majDecorationsRecherche()
    if (premier) calerOccurrenceActive()
  }
  watch(rechercheTexte, () => {
    if (!rechercheOuverte.value) return
    recalculerRecherche(true)
  })
  /** Ouvre la boîte (ou y retourne) : préremplit avec la sélection courante si
   *  elle a du texte, puis focalise le champ de recherche. */
  async function ouvrirRecherche() {
    const ed = editor.value
    if (!rechercheTexte.value && ed) {
      const { from, to } = ed.state.selection
      const selection = to > from ? ed.state.doc.textBetween(from, to, ' ') : ''
      if (selection.trim()) rechercheTexte.value = selection.trim()
    }
    rechercheOuverte.value = true
    await nextTick()
    const champ = document.getElementById('champ-recherche') as HTMLInputElement | null
    champ?.focus()
    champ?.select()
  }
  /** Ferme la boîte et efface le surlignage. */
  function fermerRecherche() {
    rechercheOuverte.value = false
    occurrencesRecherche.value = []
    indexRecherche.value = -1
    majDecorationsRecherche()
  }
  /** Navigation ◄ / ► dans les occurrences (modulo). */
  function naviguerRecherche(sens: number) {
    const n = occurrencesRecherche.value.length
    if (n === 0) return
    indexRecherche.value = (indexRecherche.value + sens + n) % n
    majDecorationsRecherche()
    calerOccurrenceActive()
  }
  /** Remplace l'occurrence active par le texte de remplacement, puis se cale
   *  sur l'occurrence suivante au même rang (le recalcul suit la transaction). */
  function remplacerOccurrenceCourante() {
    const ed = editor.value
    const occ = occurrencesRecherche.value[indexRecherche.value]
    if (!ed || !occ) return
    ed.view.dispatch(ed.state.tr.insertText(remplacementTexte.value, occ.de, occ.a))
    // La transaction a déjà déclenché le recalcul (onUpdate) ; on retombe sur
    // la même position dans la nouvelle liste (dernière si la liste a fondu).
    indexRecherche.value = Math.min(indexRecherche.value, Math.max(occurrencesRecherche.value.length - 1, 0))
    majDecorationsRecherche()
    calerOccurrenceActive()
  }
  /** Remplace TOUTES les occurrences en une seule transaction (une seule
   *  annulation Ctrl+Z). Les positions d'origine restent valides car les
   *  remplacements vont de la FIN vers le DÉBUT du document. */
  function remplacerTout() {
    const ed = editor.value
    if (!ed || occurrencesRecherche.value.length === 0) return
    const tr = ed.state.tr
    for (const occ of [...occurrencesRecherche.value].reverse()) {
      tr.insertText(remplacementTexte.value, occ.de, occ.a)
    }
    ed.view.dispatch(tr)
  }
  // Brouillons d'anonymisation entretien-locaux (pas des règles) : entités
  // saisies sans occurrence posée. Persistés dans entretiens/<id>.json.brouillonsAnon.
  const brouillonsAnon = ref<BrouillonAnon[]>([])
  // Mémoire fichier de l'ensemble multi-pseudo par entité (clé `cleEntite`),
  // quand une entité standalone en déclare ≥2 (3b multi-pseudo). Persistée dans
  // entretiens/<id>.json.pseudosDeclares (ni une règle, ni partagé).
  const pseudosDeclares = ref<Record<string, string[]>>({})
  /** Menu contextuel de l'éditeur (clic droit) — requête VOLATILE : la vue
   *  à montrer tant que le menu est ouvert, sinon null. Consommé par le
   *  composant MenuContexte : sections anon / codages / commentaires. */
  const menuContextuel = ref<{
    x: number
    y: number
    anon: { id: string; etat: 'anonymise' | 'exception'; entite: string; pseudosAutres: string[] } | null
    codages: { id: string; libelle: string }[]
    commentaires: { id: string; auteur: string; extrait: string }[]
    peutCommenter: boolean
  } | null>(null)
  /** Modale d'un commentaire (création ET édition) : null = fermée. `id`
   *  null = création sur [from,to[ ; sinon édition du commentaire existant. */
  const editionCommentaire = ref<{
    id: string | null
    from: number
    to: number
    auteur: string
    texte: string
  } | null>(null)
  /** Dialogue de divergence à la poussée vers le corpus (3b) : une règle
   *  existante porte des pseudos différents de l'entité qu'on pousse → proposer
   *  « Aligner (le pseudo de la règle gagne) / Garder les deux / Annuler ». */
  const dialoguePorteeCorpus = ref<{
    entite: string
    pseudosCible: string[]
    regleExistanteId: string
    reglePseudos: string[]
    cas: 'brouillon' | 'fichier'
  } | null>(null)
  /** Sélection courante vide ? Pilote le libellé du bouton d'attribution (
   *  « Attribuer la sélection » vs « …le bloc courant »). */
  const selectionVide = ref(true)

  // --- Journal d'actions : volatil (session), actions de modèle seules ---
  const journal = reactive<Journal>({ entrees: [] })
  const genIdJournal = () => 'j-' + Math.random().toString(36).slice(2, 9)

  // --- État de persistance de l'entretien ouvert ---
  const ouvertId = ref<string | null>(null)
  const refusFormat = ref<string | null>(null)
  const etatSauvegarde = ref<'à jour' | 'modifié' | 'sauvegarde…'>('à jour')
  let chargement = false

  // --- Éditeur TipTap + plugins (moteur POC vendoré) ---
  const MoteurExtension = Extension.create({
    name: 'sonalMoteur',
    addProseMirrorPlugins() {
      return [
        pluginRemap(entretien),
        pluginRemapJournal(journal),
        pluginDecorations(entretien, deps.couleurTrait, deps.tailleTrait, deps.estCodeActif, deps.nomCode),
        pluginGouttiere(() => locuteurs.value, deps.clicTour),
        pluginLecture(),
        pluginReperage(),
        pluginRecherche(),
        pluginMenuContexte(entretien, ouvrirMenuContexte),
        pluginCommentairesMarge(entretien, editerCommentaire),
      ]
    },
  })
  // Double-espace = play/pause (parité SonalPi1) : dans le texte, une espace tape
  // un caractère — c'est la 2ᵉ espace rapprochée qui sert de commande de lecture.
  const SEUIL_DOUBLE_ESPACE = 300 // ms
  let derniereEspace = 0
  /** Verrou tenu par autrui sur l'entretien OUVERT (null sinon) — alimente le
   *  bandeau « tenu par X depuis HH:MM ». */
  const verrouAutrui = ref<{ userId: string; machineId: string; acquiredAt: string } | null>(null)

  const editor = useEditor({
    content: '<p></p>',
    extensions: [StarterKit, BlocAttributs, MoteurExtension],
    editorProps: {
      attributes: { class: 'editeur' },
      // Un CLIC (pas un drag de sélection) → seek audio à cet endroit.
      // On ne consomme pas l'événement : le curseur se place normalement.
      handleClick: (_view, pos) => {
        deps.clicTexte?.(pos)
        return false
      },
      // Deux espaces à moins de SEUIL_DOUBLE_ESPACE = play/pause : on retire la
      // 1ʳᵉ espace (déjà insérée) et on consomme la 2ᵉ. Ne se déclenche QUE si un
      // audio est chargé (sinon `basculerLecture` renvoie false → frappe normale).
      handleKeyDown: (view, event) => {
        // Toute autre touche « coupe » la séquence : seules DEUX espaces
        // consécutives (rien entre elles) comptent, jamais deux espaces
        // rapprochées dans le temps mais séparées par de la frappe.
        if (event.key !== ' ') {
          derniereEspace = 0
          return false
        }
        const now = Date.now()
        const rapprochee = now - derniereEspace < SEUIL_DOUBLE_ESPACE
        derniereEspace = now
        if (!rapprochee) return false // 1ʳᵉ espace : frappe normale
        if (!deps.basculerLecture?.()) return false // pas d'audio : ne rien manger
        derniereEspace = 0 // évite qu'une 3ᵉ espace enchaîne un nouveau toggle
        event.preventDefault()
        // Retirer la 1ʳᵉ espace, déjà insérée juste avant le curseur.
        const { from } = view.state.selection
        if (from > 0 && view.state.doc.textBetween(from - 1, from) === ' ') {
          view.dispatch(view.state.tr.delete(from - 1, from))
        }
        return true
      },
    },
    onUpdate: ({ transaction }) => {
      rafraichir()
      // Boîte recherche/remplacement ouverte : les occurrences suivent le texte.
      if (transaction.docChanged && rechercheOuverte.value) recalculerRecherche()
      // Seule une transaction qui CHANGE LE DOCUMENT programme une écriture :
      // `setEditable` (passage en lecture seule à l'ouverture sous verrou
      // d'autrui) émet une transaction SANS docChanged — si on programmmait
      // quand même la sauvegarde, elle partait 600 ms plus tard, la garde du
      // main la rejetait (« verrou non tenu par cette session ») et la bannière
      // globale d'erreur restait affichée pendant toute la suite du scénario
      // (scénario visible seulement aux rythmes lents : la pause efficace
      // s'achève avant l'échéance du debounce).
      if (!transaction.docChanged) return
      planifierSauvegarde()
    },
    onSelectionUpdate: ({ editor: ed }) => {
      selectionVide.value = ed.state.selection.empty
      // Onglet Anon : on capture la sélection snappée au mot (le « Nom » à
      // anonymiser). La snap rend l'entité propre (pas de ponctuation de bord).
      const { from, to } = ed.state.selection
      if (from < to) {
        const s = snapToWord(ed.state, from, to)
        selectionAnon.value =
          s.from < s.to
            ? { texte: ed.state.doc.textBetween(s.from, s.to, ' '), from: s.from, to: s.to }
            : null
      } else {
        selectionAnon.value = null
      }
    },
  })
  function rafraichirDecorations() {
    const ed = editor.value
    if (ed) ed.view.dispatch(ed.state.tr.setMeta(decorationsPluginKey, 'refresh'))
  }
  function rafraichirGouttiere() {
    const ed = editor.value
    if (ed) ed.view.dispatch(ed.state.tr.setMeta(gouttierePluginKey, 'refresh'))
  }

  // --- Journal : contexte d'inverse + projection affichable ---
  /** Le contexte sur lequel un inverse s'applique : le modèle + l'accès aux blocs
   *  du doc (injecté ici — le module journal reste pur). */
  function ctxInverse(): CtxInverse {
    const ed = editor.value
    return {
      entretien,
      locuteurs: locuteurs.value,
      valeursGen: meta.valeursGen,
      blocs: ed
        ? {
            locDe: (pos) => {
              const n = ed.state.doc.nodeAt(pos)
              return n?.type.name === 'paragraph' ? ((n.attrs.loc ?? null) as number | null) : undefined
            },
            poserLoc: (pos, loc) => {
              const n = ed.state.doc.nodeAt(pos)
              if (n) ed.view.dispatch(ed.state.tr.setNodeMarkup(pos, undefined, { ...n.attrs, loc }))
            },
          }
        : undefined,
    }
  }
  type LigneJournal = { id: string; heure: string; libelle: string; annulable: boolean }
  const entreesJournal = ref<LigneJournal[]>([])
  /** Projection du journal (REQUÊTE : l'annulabilité dépend de l'état courant du
   *  modèle/doc — recalculée, jamais stockée). */
  function rafraichirJournal() {
    const ctx = ctxInverse()
    entreesJournal.value = journal.entrees.map((e) => ({
      id: e.id,
      heure: new Date(e.horodatage).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      libelle: e.libelle,
      annulable: estApplicable(e.inverse, ctx),
    }))
  }
  /** Annule une entrée : applique son inverse si encore applicable, la retire du
   *  journal, redessine et autosave. Cible disparue → rien (l'entrée reste grisée). */
  function annulerEntree(id: string) {
    if (annulerAuJournal(journal, id, ctxInverse())) {
      rafraichir()
      rafraichirDecorations()
      rafraichirGouttiere()
      rafraichirCompteursAAAnonymiser()
      rafraichirReperage()
      planifierSauvegarde()
    }
    rafraichirJournal()
  }

  // --- Projections lisibles du modèle (requête Extraits + journal) ---
  const extraits = ref<Extrait[]>([])
  /** Résumé thématique LIVE de l'entretien ouvert (calque de la bande du lecteur) :
   *  recalculé avec les autres projections — même requête pure que les cartes
   *  Corpus, sur le modèle en session au lieu du disque. */
  const resumeOuvert = ref<SegmentThematique[]>([])
  function rafraichir() {
    rafraichirExtraits()
    rafraichirJournal() // l'annulabilité dépend du doc et des annotations
    rafraichirLignesAnon()
    const ed = editor.value
    resumeOuvert.value = ed
      ? resumeThematique({ corpsTexte: ed.getJSON(), annotations: entretien.annotations })
      : []
  }
  /** Lignes du tableau Anon = fusion des brouillons (0 occurrence) et des
   *  occurrences anon posées, une ligne par entité. L'état (brouillon/
   *  entretien) est DÉRIVÉ. Le texte d'une occurrence se lit sur le doc
   *  courant : si le texte est édité, l'entité suit. */
  function rafraichirLignesAnon() {
    const ed = editor.value
    if (!ed) {
      lignesAnon.value = []
      return
    }
    const occurrences = entretien.annotations
      .filter((a) => a.type === 'anon' && !estOrpheline(a))
      .map((a) => ({ id: a.id, from: a.from, to: a.to, pseudo: a.pseudo, etat: a.etat, regle: a.regle }))
    // Prédicat d'inclusion : une occurrence recouverte en entier par une
    // annotation anon d'une AUTRE entité plus longue est masquée (incluse).
    const texteDePM = (f: number, t: number) => ed.state.doc.textBetween(f, t, ' ')
    const estIncluse = (o: { from: number; to: number }) => {
      const cleOcc = cleEntite(texteDePM(o.from, o.to))
      return entretien.annotations.some(
        (y) =>
          y.type === 'anon' &&
          !estOrpheline(y) &&
          y.from <= o.from &&
          o.to <= y.to &&
          y.to - y.from > o.to - o.from &&
          cleEntite(texteDePM(y.from, y.to)) !== cleOcc,
      )
    }
    lignesAnon.value = lignesAnonUnifiees(
      brouillonsAnon.value,
      occurrences,
      texteDePM,
      pseudosDeclares.value,
      deps.reglesAnon(),
      estIncluse,
    )
  }
  /** Extraits du thème courant (REQUÊTE, rien de stocké ; l'UI a été retirée,
   *  la requête reste disponible pour un futur écran de recueil).
   *  Une annotation = UN extrait même à cheval sur blocs. */
  function rafraichirExtraits() {
    const ed = editor.value
    if (!ed) {
      extraits.value = []
      return
    }
    const code = deps.codeExtraits()
    extraits.value = entretien.annotations
      .filter((a) => a.type === 'codage' && a.code === code && !estOrpheline(a))
      .map((a) => {
        const idx = new Set<number>()
        ed.state.doc.nodesBetween(a.from, a.to, (node) => {
          const loc = node.attrs?.loc
          if (node.type.name === 'paragraph' && loc != null) idx.add(loc as number)
        })
        return {
          id: a.id,
          texte: ed.state.doc.textBetween(a.from, a.to, ' '),
          locuteurs: [...idx].map((i) => nomDeLocuteur(locuteurs.value, i)).filter(Boolean),
        }
      })
  }

  // --- Synchro audio (ancres temporelles) : scope dédié — le pont temps ↔ texte ---
  const { majPlageLue, eteindre: eteindrePlageLue, allerAuTexte, tempsAuTexte, tempsDuBloc } =
    useSynchroAudio({ editor, ancres: entretien.ancres })

  // --- Autosave (débounce) + persistance de l'entretien ouvert ---
  let tid: ReturnType<typeof setTimeout> | undefined
  let sauvegardes = Promise.resolve()
  function planifierSauvegarde() {
    if (chargement || !ouvertId.value) return
    etatSauvegarde.value = 'modifié'
    clearTimeout(tid)
    tid = setTimeout(() => {
      void sauver().catch(() => {
        etatSauvegarde.value = 'modifié'
      })
    }, 600)
  }
  function sauver(): Promise<void> {
    clearTimeout(tid)
    tid = undefined
    if (!ouvertId.value || !editor.value) return sauvegardes
    const id = ouvertId.value
    const payload = payloadCourant()
    const operation = sauvegardes.then(async () => {
      if (ouvertId.value === id) etatSauvegarde.value = 'sauvegarde…'
      await window.sonal.corpus.ecrireEntretien(id, payload)
      if (ouvertId.value === id) etatSauvegarde.value = 'à jour'
      await deps.apresSauvegarde()
    })
    sauvegardes = operation.catch(() => {})
    return operation
  }
  /** Vide le debounce et attend aussi une sauvegarde déjà en cours. */
  async function viderSauvegarde(): Promise<void> {
    await sauver()
    await sauvegardes
  }
  /** Annule le debounce sans créer d'écriture, puis attend l'opération déjà partie. */
  async function annulerEtAttendreSauvegarde(): Promise<void> {
    clearTimeout(tid)
    tid = undefined
    await sauvegardes
  }
  function payloadCourant() {
    const ed = editor.value!
    return {
      corpsTexte: ed.getJSON(),
      annotations: entretien.annotations.map((a) => ({ ...a })),
      ancres: entretien.ancres.map((a) => ({ ...a })),
      // Clone PLAT : locuteurs.value est un proxy réactif Vue, non clonable par l'IPC
      // Electron (structured clone) → on l'aplatit avant l'envoi.
      locuteurs: JSON.parse(JSON.stringify(locuteurs.value)),
      meta: JSON.parse(JSON.stringify(meta)),
      // Même raison : brouillonsAnon.value est un proxy réactif → aplatir.
      brouillonsAnon: JSON.parse(JSON.stringify(brouillonsAnon.value)),
      pseudosDeclares: JSON.parse(JSON.stringify(pseudosDeclares.value)),
      notes: JSON.parse(JSON.stringify(notes.value)),
      // legacyCourant est un ref → .value est un proxy réactif, non clonable par
      // l'IPC (structured clone) : on l'aplatit aussi.
      legacy: JSON.parse(JSON.stringify(legacyCourant.value)),
    }
  }

  // --- Cycle de vie de l'entretien ouvert (charger / réinitialiser) ---
  /** Ouvre un entretien : lit le disque, peuple le modèle + l'éditeur. Renvoie
   *  false (+ pose `refusFormat`) si version inconnue / absent (aucune écriture). */
  async function ouvrir(id: string, sessionExistante = false): Promise<boolean> {
    const ed = editor.value
    if (!ed) return false
    const ouverture = sessionExistante
      ? null
      : await window.sonal.corpus.ouvrirEntretienPourEdition(id)
    const res = ouverture ?? (await window.sonal.corpus.lireEntretien(id))
    if (!res.ok) {
      refusFormat.value =
        res.raison === 'version'
          ? 'Entretien dans un format non reconnu — non ouvert (aucune écriture).'
          : 'Entretien introuvable sur le disque.'
      return false
    }
    refusFormat.value = null
    chargement = true
    // Ordre : vider le modèle AVANT de remplacer le doc (le remap ne mappe rien),
    // puis recharger le doc, puis reposer les annotations (positions valides par
    // construction contre ce doc), puis redessiner.
    entretien.annotations.splice(0, entretien.annotations.length)
    entretien.ancres.splice(0, entretien.ancres.length)
    locuteurs.value = res.data.locuteurs
    ed.commands.setContent(res.data.corpsTexte as Record<string, unknown>, { emitUpdate: false })
    for (const a of res.data.annotations) entretien.annotations.push(a)
    for (const a of res.data.ancres ?? []) entretien.ancres.push(a)
    meta.valeursGen = { ...res.data.meta.valeursGen }
    meta.audioRef = res.data.meta.audioRef
    meta.audioDistant = res.data.meta.audioDistant ?? null
    brouillonsAnon.value = res.data.brouillonsAnon ?? []
    pseudosDeclares.value = { ...(res.data.pseudosDeclares ?? {}) }
    notes.value = normaliserNotesLues(res.data.notes, document)
    legacyCourant.value = (res.data.legacy as LegacyBlobs | undefined) ?? { tabAnon: null, notes: '' }
    ouvertId.value = id
    chargement = false
    // Le statut d'accès est obligatoire ; l'absence d'identité du détenteur
    // ne transforme jamais un refus en autorisation d'écrire.
    if (ouverture?.ok) {
      verrouAutrui.value =
        ouverture.acces === 'lecture-seule'
          ? (ouverture.verrouTenuParAutrui ?? {
              userId: 'un autre utilisateur',
              machineId: '',
              acquiredAt: '',
            })
          : null
    }
    editor.value?.setEditable(deps.entretienEditable ? deps.entretienEditable() : !deps.lectureSeule?.())
    journal.entrees.length = 0 // volatil PAR entretien
    // Le surlignage audio ne survit pas au changement de doc.
    eteindrePlageLue()
    rafraichir()
    rafraichirDecorations()
    rafraichirGouttiere()
    etatSauvegarde.value = 'à jour'
    fermerMenu() // un menu ouvert pointait vers l'entretien précédent
    editionCommentaire.value = null
    return true
  }
  /** Réinitialise à vide (changement de corpus / suppression de l'entretien ouvert). */
  function reinitialiser() {
    ouvertId.value = null
    messagePersonnes.value = ''
    rapprochementNommage.value = null
    verrouAutrui.value = null
    journal.entrees.length = 0
    entretien.annotations.splice(0, entretien.annotations.length)
    entretien.ancres.splice(0, entretien.ancres.length)
    editor.value?.commands.setContent('<p></p>', { emitUpdate: false })
    refusFormat.value = null
    eteindrePlageLue()
    brouillonsAnon.value = []
    pseudosDeclares.value = {}
    notes.value = []
    selectionAnon.value = null
    hintAnon.value = null
    suggestionLiaison.value = null
    fermerMenu()
    editionCommentaire.value = null
    rafraichir()
    rafraichirDecorations()
  }

  // --- Gestes de codage (clic sur un thème = coder la sélection) ---
  /** Code la sélection courante (snap au mot) avec `code`. Sans sélection → hint,
   *  rien codé (pas de codage accidentel). Re-clic même thème / même plage = retirer. */
  function coderAvec(code: string) {
    const ed = editor.value
    if (!ed) return
    const { from, to } = ed.state.selection
    const snapped = snapToWord(ed.state, from, to)
    if (snapped.from >= snapped.to) {
      hintCodage.value = 'Sélectionne d’abord du texte, puis clique un thème.'
      return
    }
    hintCodage.value = null
    const existant = trouverCodage(entretien, { ...snapped, code })
    // Thème inactif : on refuse de poser un NOUVEAU codage, mais on laisse le
    // retrait (re-clic sur un passage déjà codé = nettoyage toujours possible).
    if (!existant && !deps.estCodeActif(code)) {
      hintCodage.value = 'Thème inactif — réactivez-le pour coder.'
      return
    }
    if (existant) {
      retirerAnnotation(entretien, existant.id)
      // L'objet retiré survit dans l'entrée : journalRemap continue à le remapper.
      enregistrer(
        journal,
        `Codage retiré : ${deps.nomCode(code)}`,
        { type: 'reposerAnnotation', annotation: existant },
        genIdJournal,
      )
    } else {
      const a = ajouterCodage(entretien, { ...snapped, code, auteur }, genId)
      if (a)
        enregistrer(
          journal,
          `Codage posé : ${deps.nomCode(code)}`,
          { type: 'retirerAnnotation', annotationId: a.id },
          genIdJournal,
        )
    }
    rafraichir()
    rafraichirDecorations()
    planifierSauvegarde()
  }
  /** Retire du modèle tous les codages d'un thème (support de la suppression
   *  d'un thème depuis l'entretien). Ne persiste pas — l'appelant orchestre le save. */
  function retirerCodagesDuCode(code: string): number {
    const cibles = entretien.annotations.filter((a) => a.type === 'codage' && a.code === code)
    for (const a of cibles) retirerAnnotation(entretien, a.id)
    rafraichir()
    rafraichirDecorations()
    return cibles.length
  }

  // --- Locuteurs (bloc courant, ou attribution de la sélection) ---
  /** Pose `loc`. Sélection VIDE → le bloc courant. Sélection NON VIDE →
   *  « attribuer la sélection » : scinde les blocs aux bornes (snap au mot) et
   *  pose `loc` sur les blocs couverts ; annotations remappées, ancres
   *  temporelles non déplacées par la coupe. Aucune fusion physique. */
  function attribuerLoc(loc: number | null) {
    const ed = editor.value
    if (!ed) return
    const libelle = `Locuteur attribué : ${nomDeLocuteur(locuteurs.value, loc) || 'aucun'}`
    if (ed.state.selection.empty) {
      const { $from } = ed.state.selection
      const pos = $from.before($from.depth)
      const ancien = ($from.parent.attrs.loc ?? null) as number | null
      ed.chain().focus().updateAttributes('paragraph', { loc }).run()
      if (ancien !== loc)
        enregistrer(journal, libelle, { type: 'restaurerLocs', blocs: [{ pos, loc: ancien }] }, genIdJournal)
    } else {
      const { from, to } = snapBornes(ed.state, ed.state.selection.from, ed.state.selection.to)
      const r = attribuerSelectionTr(ed.state, from, to, loc)
      if (r) {
        ed.view.dispatch(r.tr)
        ed.view.focus()
        // L'inverse : restaurer l'ancien loc des blocs qui ont VRAIMENT changé
        // (positions valides post-dispatch ; enregistrées APRÈS → pas re-remappées).
        const changes = r.blocs.filter((b) => b.ancien !== loc)
        if (changes.length)
          enregistrer(
            journal,
            libelle,
            { type: 'restaurerLocs', blocs: changes.map((b) => ({ pos: b.pos, loc: b.ancien })) },
            genIdJournal,
          )
        rafraichir() // le doc a changé : les positions d'annotations ont été remappées
      }
    }
    rafraichirJournal()
    planifierSauvegarde()
  }
  const messagePersonnes = ref('')
  const rapprochementNommage = ref<{ entretienId: string; locuteurId: string; nom: string; personneRef: string | null; lienActuel: string; cible: Locuteur; sources: VueLocuteurPersonne[]; candidats: VueLocuteurPersonne[] } | null>(null)
  const rapprochementOccupe = ref(false)
  function reporterRapprochement() {
    if (!rapprochementOccupe.value) rapprochementNommage.value = null
  }
  async function deciderRapprochement(sourceId: string, sourceEntretienId: string, decision: 'lier' | 'refuser' | 'refuserTous', reprise?: ChoixRepriseLocuteur) {
    const demande = rapprochementNommage.value
    if (!demande || rapprochementOccupe.value) return
    const courant = () => ouvertId.value === demande.entretienId
      ? locuteurs.value.find((l) => l.id === demande.locuteurId && l.nom === demande.nom && l.personneRef === demande.personneRef) : undefined
    if (!courant()) { rapprochementNommage.value = null; return }
    const cibleInitiale = courant()!
    const signatureDonnees = (l: Pick<Locuteur, 'pseudo' | 'interviewer' | 'valeursLoc'>) => JSON.stringify([l.pseudo, l.interviewer, l.valeursLoc])
    rapprochementOccupe.value = true
    try {
      await viderSauvegarde()
      const inventaire = await window.sonal.corpus.personnesInventaire()
      const source = inventaire.locuteurs.find((l) => l.locuteurId === sourceId && l.entretienId === sourceEntretienId)
      if (!source || courant() !== cibleInitiale) throw new Error('Le locuteur a changé. Relancez le rapprochement depuis Personnes.')
      const sourceApercu = demande.sources.find((l) => l.locuteurId === sourceId && l.entretienId === sourceEntretienId)
      if (decision === 'lier' && (!sourceApercu || source.personneRef !== sourceApercu.personneRef)) throw new Error('La personne sélectionnée a changé. Rouvrez le dialogue pour vérifier l’association.')
      if (reprise && (!sourceApercu || signatureDonnees(source) !== signatureDonnees(sourceApercu))) throw new Error('Les données source ont changé. Rouvrez le dialogue pour vérifier la reprise.')
      if (decision === 'refuser' || decision === 'refuserTous') {
        const refuses = decision === 'refuserTous' ? demande.candidats.map(c => {
          const frais = inventaire.locuteurs.find(l => l.locuteurId === c.locuteurId && l.entretienId === c.entretienId)
          if (!frais || frais.personneRef !== c.personneRef || frais.nom !== c.nom) throw new Error('Les propositions ont changé. Rouvrez le dialogue avant de les écarter.')
          return frais
        }) : [source]
        const cible = courant()!
        for (const refuse of refuses) refuserRapprochement(cible, { ...refuse, id: refuse.locuteurId })
        planifierSauvegarde()
        if (peutCreerPersonneAuNommage(cible)) {
          const id = await window.sonal.corpus.personnesCommander({ type: 'creerDefinition', nom: cible.nom })
          if (courant() !== cible || !peutCreerPersonneAuNommage(cible) || !id) throw new Error('La personne créée est conservée. Le locuteur a changé : reprenez depuis Personnes.')
          cible.personneRef = id
        }
        messagePersonnes.value = natureNomPersonne(demande.nom) === 'role'
          ? 'Propositions écartées. Vous pouvez choisir un nom ou pseudonyme spécifique pour distinguer ces locuteurs.'
          : 'Propositions écartées. Vous pourrez revenir sur ce choix dans Personnes.'
      } else {
        let id = source.personneRef
        if (!id) id = await window.sonal.corpus.personnesCommander({ type: 'creer', entretienId: source.entretienId, locuteurId: source.locuteurId, nom: source.nom })
        const cible = courant()
        if (!cible || cible !== cibleInitiale || !id) throw new Error('La personne source est conservée. Le locuteur cible a changé : reprenez depuis Personnes.')
        if (locuteurs.value.some((l) => l.id !== cible.id && l.personneRef === id)) throw new Error('Cette personne est déjà représentée dans cet entretien.')
        if (reprise && (cible !== cibleInitiale || signatureDonnees(cible) !== signatureDonnees(demande.cible))) throw new Error('Les données locales ont changé. La personne source est conservée ; rouvrez le dialogue pour vérifier la reprise.')
        if (reprise) reprendreDonneesLocuteur(cible, { ...source, id: source.locuteurId }, reprise)
        cible.personneRef = id
        delete cible.personneDeliee
        messagePersonnes.value = reprise ? 'Liaison et reprise des champs sélectionnés appliquées.' : `Locuteur lié à « ${inventaire.personnes.find((p) => p.id === id)?.nom ?? source.nom} ». Les données locales sont conservées.`
      }
      if (ouvertId.value === demande.entretienId && locuteurs.value.some((l) => l.id === demande.locuteurId && l.nom === demande.nom)) {
        planifierSauvegarde()
        await viderSauvegarde()
      }
      rapprochementNommage.value = null
    } catch (e) {
      messagePersonnes.value = `Rapprochement non terminé : ${e instanceof Error ? e.message : String(e)}`
    } finally { rapprochementOccupe.value = false }
  }
  let nommagesPersonnes = Promise.resolve()
  function proposerIdentite(index: number, nom: string) {
    const idEntretien = ouvertId.value
    const l = locuteurs.value.find((l) => l.index === index)
    if (!idEntretien || !l?.id || deps.lectureSeule?.() || natureNomPersonne(nom) === 'ignore') return
    const idLocuteur = l.id
    nommagesPersonnes = nommagesPersonnes.then(async () => {
      const courant = () => ouvertId.value === idEntretien
        ? locuteurs.value.find((l) => l.id === idLocuteur && l.nom === nom) : undefined
      if (!courant()) return
      try {
        await viderSauvegarde()
        const inventaire = await window.sonal.corpus.personnesInventaire()
        if (!courant()) return
        const personneRef = courant()!.personneRef
        const lienActuel = personneRef ? inventaire.personnes.find((p) => p.id === personneRef)?.nom ?? 'Personne absente' : ''
        if (personneRef) messagePersonnes.value = `Lié à « ${lienActuel} » — le nom saisi reste le nom local de cet entretien.`
        const candidats = suggestionsExactesPersonnes({ entretienId: idEntretien, locuteur: courant()! },
          inventaire.locuteurs.map((l) => ({ entretienId: l.entretienId, locuteur: { ...l, id: l.locuteurId } })))
        if (candidats.length) {
          rapprochementNommage.value = { entretienId: idEntretien, locuteurId: idLocuteur, nom, personneRef, lienActuel,
            cible: JSON.parse(JSON.stringify(courant()!)), sources: inventaire.locuteurs,
            candidats: inventaire.locuteurs.filter((l) => candidats.some((c) => c.entretienId === l.entretienId && c.locuteur.id === l.locuteurId)) }
          messagePersonnes.value = `Un rapprochement est proposé pour « ${nom} ». Il reste aussi disponible dans Personnes.`
          return
        }
        if (!peutCreerPersonneAuNommage(courant()!)) return
        if (inventaire.indisponibles.length) {
          messagePersonnes.value = 'Création de personne différée : certains entretiens sont indisponibles. Vérifiez le répertoire Personnes.'
          return
        }
        const personneId = await window.sonal.corpus.personnesCommander({ type: 'creerDefinition', nom })
        const cible = courant()
        if (!cible || !peutCreerPersonneAuNommage(cible) || !personneId) {
          if (ouvertId.value === idEntretien) messagePersonnes.value = 'Une personne a été créée, mais le locuteur a changé. Vérifiez le répertoire Personnes.'
          return
        }
        cible.personneRef = personneId
        planifierSauvegarde()
        await viderSauvegarde()
        if (ouvertId.value === idEntretien) messagePersonnes.value = `Personne « ${nom} » créée. Le nom local, le pseudo et le rôle restent indépendants.`
      } catch (e) {
        if (ouvertId.value === idEntretien) messagePersonnes.value = `Identification non terminée : ${e instanceof Error ? e.message : String(e)}. Vérifiez le répertoire Personnes avant de réessayer.`
      }
    })
  }
  function renommerLoc(index: number, evt: Event) {
    const nouveau = (evt.target as HTMLInputElement).value
    const ancien = locuteurs.value.find((l) => l.index === index)?.nom
    renommerLocuteur(locuteurs.value, index, nouveau)
    if (ancien !== undefined && ancien !== nouveau) {
      enregistrer(
        journal,
        `Locuteur renommé : ${ancien} → ${nouveau}`,
        { type: 'renommerLocuteur', index, nom: ancien },
        genIdJournal,
      )
      rafraichirJournal()
    }
    rafraichirGouttiere()
    planifierSauvegarde()
    if (ancien !== undefined && ancien !== nouveau) proposerIdentite(index, nouveau)
  }
  function nouveauLocuteur() {
    ajouterLocuteur(locuteurs.value, 'Nouveau locuteur')
    rafraichirGouttiere()
    planifierSauvegarde()
  }
  /** (Dé)clare un locuteur INTERVIEWER : ses tours passent en italique (le
   *  pendant du « ? » SonalPi1). Hors journal (comme + Locuteur) : l'inverse
   *  est le re-clic du même interrupteur. */
  function setInterviewer(index: number, actif: boolean) {
    const l = locuteurs.value.find((x) => x.index === index)
    if (!l || (l.interviewer ?? false) === actif) return
    l.interviewer = actif
    rafraichirGouttiere()
    planifierSauvegarde()
  }

  // --- Pseudonymisation du LIBELLÉ : le pseudo est un champ du
  // locuteur, le rendu suit par référence (gouttière, futur export). Hors
  // journal (comme l'interrupteur interviewer) : l'inverse est le re-clic. ---
  /** Pose ou retire le pseudo d'un locuteur. Pseudo vidé → la décision
   *  (confirme/refuse) repart aussi à absent (plus rien à afficher ni à
   *  refuser). Le rendu « Nom̶ [pseudo] » suit immédiatement (rafraichirGouttiere). */
  function setPseudoLoc(index: number, pseudo: string) {
    const l = locuteurs.value.find((x) => x.index === index)
    if (!l) return
    const p = pseudo.trim()
    if (p) l.pseudo = p
    else {
      delete l.pseudo
      delete l.pseudoEtat
    }
    rafraichirGouttiere()
    planifierSauvegarde()
  }
  /** Choisit la couleur du NOM d'un locuteur (tableau des couleurs) : `couleur` posée,
   *  le nom s'écrit dans cette couleur dans l'éditeur — SANS toucher au pseudo
   *  (la pseudonymisation du libellé reste un choix indépendant). Choix vide
   *  (∅) → retour à l'auto par index. Hors journal (comme les interrupteurs). */
  function choisirCouleurLoc(index: number, couleur: string) {
    const l = locuteurs.value.find((x) => x.index === index)
    if (!l) return
    if (couleur) l.couleur = couleur
    else delete l.couleur
    rafraichirGouttiere()
    planifierSauvegarde()
  }

  // --- Suppression d'un locuteur (acte destructif : nom + valeurs EAV + le
  // lien de ses blocs — confirmation in-app, même idiome que les thèmes) ---
  const locuteurASupprimer = ref<{ index: number; nom: string; nbBlocs: number } | null>(null)
  /** Supprime un locuteur immédiatement (sans confirmation). Utilisée telle
   *  quelle quand le locuteur n'a AUCUN bloc attribué (rien à risque → aucune
   *  alerte), et par `confirmerSuppressionLocuteur` après validation du cas
   *  « il a des blocs ». */
  function supprimerLocuteurSilencieux(index: number) {
    const ed = editor.value
    if (!ed) return
    const locuteurId = locuteurs.value.find((locuteur) => locuteur.index === index)?.id
    const tr = ed.state.tr
    ed.state.doc.forEach((node, offset) => {
      if (node.type.name === 'paragraph' && node.attrs.loc === index) {
        tr.setNodeMarkup(offset, undefined, { ...node.attrs, loc: null })
      }
    })
    if (tr.steps.length) ed.view.dispatch(tr)
    supprimerLocuteur(locuteurs.value, index)
    if (locuteurId) {
      for (const note of notes.value) note.locuteurIds = note.locuteurIds?.filter((id) => id !== locuteurId)
    }
    locuteurASupprimer.value = null
    rafraichir() // des entrées de journal visant ce locuteur deviennent grisées
    rafraichirGouttiere()
    planifierSauvegarde()
  }
  function demanderSuppressionLocuteur(index: number) {
    const ed = editor.value
    const l = locuteurs.value.find((x) => x.index === index)
    if (!ed || !l) return
    let nbBlocs = 0
    ed.state.doc.forEach((node) => {
      if (node.type.name === 'paragraph' && node.attrs.loc === index) nbBlocs++
    })
    // Aucun bloc attribué → suppression directe et SILENCIEUSE (pas d'alerte).
    if (nbBlocs === 0) {
      supprimerLocuteurSilencieux(index)
      return
    }
    locuteurASupprimer.value = { index, nom: l.nom, nbBlocs }
  }
  /** Confirme (cas « ce locuteur a des blocs ») : ils passent à « aucun », puis
   *  l'entrée quitte la liste. Non journalisé (non réversible, comme la
   *  suppression de thème). */
  function confirmerSuppressionLocuteur() {
    const cible = locuteurASupprimer.value
    if (!cible) return
    supprimerLocuteurSilencieux(cible.index)
  }

  // --- Notes d'entretien (typologie locale + corps HTML sanitisé + rang) ---
  //  Hors journal (comme + Locuteur) : un geste de note ne remonte pas dans
  //  l'historique d'annulation. Chaque mutation planifie la sauvegarde.
  /** Brouillon de note en cours de création/édition : la modale garde le
   *  formulaire (corps contenteditable + méta) tant que l'utilisateur n'a pas
   *  validé ou annulé. `null` = modale fermée. */
  interface BrouillonNote {
    id: string | null // null = création, sinon note éditée
    categorieId: string
    titre: string // optionnel : vu seul en vue cartes à la place de l'extrait
    date: string | null
    statut: 'prive' | 'public'
    corps: string // HTML du contenteditable (brut, sanitisé à la validation)
    locuteurIds: string[]
    rang: number
  }
  const brouillonNote = ref<BrouillonNote | null>(null)
  // Avertissement affiché dans la modale (ex. catégorie « autre… » non
  //  créée au moment de la validation). Vide = pas d'avertissement.
  const avertissementNote = ref('')

  /** Ouvre le formulaire de création d'une note. Par défaut : première
   *  catégorie du corpus (via deps), date du jour, privée, rang « après la
   *  dernière ». */
  function ajouterNote() {
    avertissementNote.value = ''
    brouillonNote.value = reactive<BrouillonNote>({
      id: null,
      categorieId: deps.categorieNoteDefaut(),
      titre: '',
      date: new Date().toISOString().slice(0, 10),
      statut: 'prive',
      corps: '',
      locuteurIds: [],
      rang: prochainRang(notes.value),
    })
  }

  /** Ouvre le formulaire d'édition d'une note existante (pré-rempli). */
  function editerNote(id: string) {
    const n = notes.value.find((x) => x.id === id)
    if (!n) return
    avertissementNote.value = ''
    brouillonNote.value = reactive<BrouillonNote>({
      id: n.id,
      categorieId: n.categorieId,
      titre: n.titre,
      date: n.date,
      statut: n.statut,
      corps: n.corps,
      locuteurIds: [...(n.locuteurIds ?? [])],
      rang: n.rang,
    })
  }

  /** Valide le brouillon : sanitarise le corps, pose/écrit la note, ferme la
   *  modale. En édition, le `rang` est conservé ; en création, le rang choisi
   *  est appliqué tel quel (défaut = après la dernière). */
  function validerNote() {
    const b = brouillonNote.value
    if (!b) return
    // « autre… » n'est pas une catégorie : tant qu'elle n'est pas créée
    //  (bouton ＋) ou remplacée par un vrai choix, on bloque la validation.
    if (b.categorieId === ' autre') {
      avertissementNote.value =
        'Choisissez une catégorie dans la liste, ou créez la vôtre avec le bouton ＋.'
      return
    }
    avertissementNote.value = ''
    const doc = document
    const titre = b.titre.trim()
    const corps = sanitiserCorpsNote(b.corps, doc)
    const idsExistants = new Set(locuteurs.value.flatMap((locuteur) => locuteur.id ? [locuteur.id] : []))
    const locuteurIds = [...new Set(b.locuteurIds.filter((id) => idsExistants.has(id)))]
    if (b.id) {
      const cible = notes.value.find((x) => x.id === b.id)
      if (cible) {
        cible.categorieId = b.categorieId
        cible.titre = titre
        cible.date = b.date
        cible.statut = b.statut
        cible.corps = corps
        cible.locuteurIds = locuteurIds
        cible.modifieLe = new Date().toISOString()
      }
    } else {
      notes.value.push({
        id: genIdNote(),
        categorieId: b.categorieId,
        titre,
        date: b.date,
        statut: b.statut,
        corps,
        locuteurIds,
        rang: b.rang,
        creeLe: new Date().toISOString(),
        modifieLe: null,
      })
    }
    brouillonNote.value = null
    planifierSauvegarde()
  }

  /** Ferme le formulaire sans rien écrire. */
  function annulerNote() {
    brouillonNote.value = null
  }

  // Écriture DIRECTE d'une note, hors modale (édition dans la vue feuille) :
  // chaque frappe est sanitisee puis posee, et la sauvegarde planifiee.
  /** Écrit le corps d'une note depuis une zone d'édition vivante : on
   *  sanitarise une COPIE (le contenteditable reste la source, le curseur ne
   *  bouge pas) et on ne pose que si le résultat change. */
  function ecrireCorpsNote(id: string, htmlBrut: string) {
    const cible = notes.value.find((x) => x.id === id)
    if (!cible) return
    const corps = sanitiserCorpsNote(htmlBrut, document)
    if (corps === cible.corps) return
    cible.corps = corps
    cible.modifieLe = new Date().toISOString()
    planifierSauvegarde()
  }
  /** Écrit le titre d'une note (trim ; vide = pas de titre). */
  function ecrireTitreNote(id: string, titre: string) {
    const cible = notes.value.find((x) => x.id === id)
    if (!cible) return
    const t = titre.trim()
    if (t === cible.titre) return
    cible.titre = t
    cible.modifieLe = new Date().toISOString()
    planifierSauvegarde()
  }

  /** Supprime une note (sans confirmation : acte non destructeur pour le
   *  texte de l'entretien — la note est indépendante). */
  function supprimerNote(id: string) {
    const i = notes.value.findIndex((x) => x.id === id)
    if (i < 0) return
    notes.value.splice(i, 1)
    notes.value = renumeroterRangs(notes.value)
    planifierSauvegarde()
  }

  /** Réordonne les notes par glisser-déposer : le tableau fourni donne le
   *  nouvel ordre des ids ; les rangs sont renumérotés denses. */
  function reordonnerNotes(idsDansLordre: string[]) {
    const ordre = new Map(idsDansLordre.map((id, i) => [id, i]))
    notes.value = renumeroterRangs(
      notes.value.slice().sort((a, b) => (ordre.get(a.id) ?? 0) - (ordre.get(b.id) ?? 0)),
    )
    planifierSauvegarde()
  }

  /** Enveloppe la sélection d'un élément de la balise donnée, renvoie l'élément
   *  créé (null si la sélection est vide ou hors de la zone). */
  function envelopperSelection(el: HTMLElement, balise: string): HTMLElement | null {
    const sel = document.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    const range = sel.getRangeAt(0)
    if (range.collapsed) return null
    if (!el.contains(range.commonAncestorContainer)) return null
    const cree = document.createElement(balise)
    try {
      range.surroundContents(cree)
    } catch {
      // surroundContents échoue sur une sélection à cheval sur plusieurs
      //  noeuds : on extrait le contenu et le réinjecte enveloppé.
      const frag = range.extractContents()
      cree.appendChild(frag)
      range.insertNode(cree)
    }
    return cree
  }
  /** Déballe un passage : ses enfants remontent à sa place, lui disparaît. */
  function deballer(passage: Element) {
    const parent = passage.parentElement!
    while (passage.firstChild) parent.insertBefore(passage.firstChild, passage)
    parent.removeChild(passage)
  }
  /** Ancêtre passage (`<mark>` ou `<em>`) d'un noeud, s'il est dans la zone. */
  function passageAncetre(noeud: Node | null, zone: HTMLElement): HTMLElement | null {
    const el = noeud?.nodeType === 3
      ? noeud.parentElement
      : (noeud as HTMLElement | null)
    const passage = (el?.closest('mark, em') as HTMLElement | null) ?? null
    return passage && zone.contains(passage) ? passage : null
  }
  /** Toggle « Marquer comme important » : enveloppe la sélection courante du
   *  contenteditable de note d'un `<mark>` (rendu en gras), ou le retire si la
   *  sélection est déjà dans un mark. Impérieux d'utiliser l'API Selection sur
   *  l'élément donné (la modale peut en héberger plusieurs). */
  function marquerPassage(el: HTMLElement) {
    const sel = document.getSelection()
    if (!sel || sel.rangeCount === 0) return
    // Si la sélection est déjà dans un <mark>, on retire celui-ci (toggle).
    const markParent = passageAncetre(sel.getRangeAt(0).commonAncestorContainer, el)
    if (markParent && markParent.tagName.toLowerCase() === 'mark') {
      deballer(markParent)
      return
    }
    envelopperSelection(el, 'mark')
  }

  // --- Liaison des passages aux commentaires ---
  //  Un `<em>` du corps d'une note porte les ids des commentaires qui
  //  l'éclairent (attribut data-liens) et se rend en italique : italique =
  //  lié. La liaison se pose par le bouton « Lier… » (enveloppe la sélection
  //  puis ouvre le menu) ou au clic droit sur un passage existant ; une
  //  référence vers un commentaire supprimé reste en place (référence
  //  pendante, comme les annotations) et se délie depuis le même menu.
  /** Commentaires liaisables de l'entretien (hors orphelines). */
  const commentairesPourLiaison = computed(() =>
    entretien.annotations
      .filter((a) => a.type === 'commentaire' && !estOrpheline(a))
      .map((a) => ({ id: a.id, auteur: a.auteur, texte: a.texte ?? '' })),
  )
  /** État du menu de liaison : position + liens COURANTS au moment de
   *  l'ouverture (le passage visé vit à part, non réactif). */
  const menuLiensNote = ref<{ x: number; y: number; liens: string[] } | null>(null)
  let passageLie: HTMLElement | null = null
  let zoneLiee: HTMLElement | null = null
  function ouvrirMenuSur(passage: HTMLElement, zone: HTMLElement, e: MouseEvent) {
    passageLie = passage
    zoneLiee = zone
    menuLiensNote.value = { x: e.clientX, y: e.clientY, liens: lireLiensNote(passage) }
  }
  /** Bouton « Lier… » : enveloppe la sélection d'un `<em>` puis ouvre le menu
   *  de liaison dessus. Si la sélection est déjà dans un `<em>`, le menu
   *  s'ouvre directement (gestion des liens existants). */
  function lierPassage(e: MouseEvent, zone: HTMLElement) {
    const sel = document.getSelection()
    const existant = sel
      ? passageAncetre(sel.getRangeAt(0)?.commonAncestorContainer ?? null, zone)
      : null
    if (existant && existant.tagName.toLowerCase() === 'em') {
      ouvrirMenuSur(existant, zone, e)
      return
    }
    const em = envelopperSelection(zone, 'em')
    if (!em) return
    if (brouillonNote.value) brouillonNote.value.corps = zone.innerHTML
    else syncZoneHorsModale?.(zone)
    ouvrirMenuSur(em, zone, e)
  }
  /** Clic droit dans le corps d'une note : si la cible est un passage
   *  (`<mark>` ou `<em>`), on ouvre le menu de liaison et on avale le menu
   *  natif ; sinon on laisse le comportement par défaut du contenteditable. */
  function ouvrirMenuLiensNote(e: MouseEvent, zone: HTMLElement) {
    const cible = e.target as HTMLElement | null
    const passage = cible ? passageAncetre(cible, zone) : null
    if (!passage) return
    e.preventDefault()
    ouvrirMenuSur(passage, zone, e)
  }
  function fermerMenuLiensNote() {
    menuLiensNote.value = null
    passageLie = null
    zoneLiee = null
  }
  /** Pose ou retire un id de commentaire sur le passage visé puis reporte le
   *  HTML courant dans le brouillon (le contenteditable reste la source).
   *  Retirer le dernier lien d'un `<em>` le déballe : italique = lié, un em
   *  sans lien n'a pas de sens. Un `<mark>` reste en place (il reste un
   *  passage important même délié). */
  function basculerLienNote(idAnnotation: string, lie: boolean) {
    if (!passageLie || !zoneLiee) return
    const courants = lireLiensNote(passageLie)
    const suivants = lie
      ? [...new Set([...courants, idAnnotation])]
      : courants.filter((x) => x !== idAnnotation)
    if (suivants.length > 0) {
      passageLie.setAttribute(ATTR_LIENS_NOTE, suivants.join(' '))
    } else {
      passageLie.removeAttribute(ATTR_LIENS_NOTE)
      if (passageLie.tagName.toLowerCase() === 'em') deballer(passageLie)
    }
    // Les références `[auteur : début…]` suivent dans la zone d'édition.
    decoreRefsCommentaires(zoneLiee, document, resolverCommentaires)
    if (brouillonNote.value) brouillonNote.value.corps = zoneLiee.innerHTML
    else syncZoneHorsModale?.(zoneLiee)
  }

  // Zone d'édition HORS modale (vue feuille) : la vue enregistre une fonction
  // qui écrit le HTML courant de la zone dans la note qu'elle édite ; les
  // gestes de liaison ci-dessus y reportent leurs changements quand la modale
  // est fermée (sinon, priorité au brouillon de la modale).
  let syncZoneHorsModale: ((zone: HTMLElement) => void) | null = null
  function enregistrerSyncZoneHorsModale(f: ((zone: HTMLElement) => void) | null) {
    syncZoneHorsModale = f
  }
  /** Résout un id de commentaire vers son libellé (les orphelines sont hors
   *  liste → pas de référence pour un commentaire supprimé). */
  function resolverCommentaires(id: string): { auteur: string; texte: string } | null {
    const c = commentairesPourLiaison.value.find((x) => x.id === id)
    return c ? { auteur: c.auteur, texte: c.texte } : null
  }
  function lierCommentaireNote(idAnnotation: string) {
    basculerLienNote(idAnnotation, true)
    fermerMenuLiensNote()
  }
  function delierCommentaireNote(idAnnotation: string) {
    basculerLienNote(idAnnotation, false)
    fermerMenuLiensNote()
  }

  /** Cale l'éditeur sur la zone commentée : sélection de la plage de
   *  l'annotation + décoration transitoire « hit » (repérage) + scroll centré.
   *  Utilisé par les références cliquables des notes liées. */
  function allerAuCommentaire(idAnnotation: string) {
    const ed = editor.value
    if (!ed) return
    const a = entretien.annotations.find((x) => x.id === idAnnotation)
    if (!a || a.type !== 'commentaire' || estOrpheline(a)) return
    ed.commands.setTextSelection({ from: a.from, to: a.to })
    ed.view.dispatch(ed.state.tr.setMeta(reperagePluginKey, { de: a.from, a: a.to }))
    const dom = ed.view.domAtPos(a.from).node
    const el = dom instanceof HTMLElement ? dom : dom.parentElement
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // --- Catégories de note : définitions au CORPUS (useCorpus). Le scope
  //  entretien n'en porte plus que la résolution par deps (nom + défaut). ---

  /** Vue « expand » : concaténation plain text de toutes les notes (tri par
   *  rang), préfixées par [catégorie · date · statut] ; passages importants
   *  marqués ▸…◊. Renvoie une chaîne brute (pas d'HTML). */
  function notesEnTexte(): string {
    const doc = document
    return notes.value
      .slice()
      .sort((a, b) => a.rang - b.rang)
      .map((n) => {
        const cat = deps.nomCategorieNote(n.categorieId)
        const date = n.date ?? 'sans date'
        const statut = n.statut === 'public' ? 'public' : 'privé'
        const titre = n.titre ? `${n.titre}\n` : ''
        const corps = corpsNoteEnTexte(n.corps, doc)
        return `[${cat} · ${date} · ${statut}]\n${titre}${corps}`
      })
      .join('\n\n')
  }

  // --- Valeurs EAV de CET entretien (chez leur propriétaire, pas de l="all") ---
  function setValeurGen(idVar: string, idMod: string) {
    const ancien = meta.valeursGen[idVar] ?? null
    if (idMod) meta.valeursGen[idVar] = idMod
    else delete meta.valeursGen[idVar]
    if (ancien !== (idMod || null)) {
      enregistrer(
        journal,
        `Valeur : ${deps.libelleValeur(idVar, idMod)}`,
        { type: 'poserValeurGen', idVar, idMod: ancien },
        genIdJournal,
      )
      rafraichirJournal()
    }
    planifierSauvegarde()
  }
  function setValeurLoc(index: number, idVar: string, idMod: string) {
    const l = locuteurs.value.find((x) => x.index === index)
    if (!l) return
    const ancien = l.valeursLoc[idVar] ?? null
    if (ancien !== (idMod || null)) {
      enregistrer(
        journal,
        `Valeur (${l.nom}) : ${deps.libelleValeur(idVar, idMod)}`,
        { type: 'poserValeurLoc', index, idVar, idMod: ancien },
        genIdJournal,
      )
      rafraichirJournal()
    }
    if (idMod) l.valeursLoc[idVar] = idMod
    else delete l.valeursLoc[idVar]
    planifierSauvegarde()
  }

  // --- Anonymisation (occurrences + brouillons) ---
  // Non journalisé : valider une ligne peut poser/relabeler PLUSIEURS occurrences
  // d'un coup, ce qui ne se moule pas sur les inverses à 1 action du journal.
  // La suppression d'une ligne (✕) reste l'inverse manuel, comme les thèmes.

  /** Clefs d'appartenance d'une ligne : sa cle de groupe PLUS chaque alias
   *  (une occurrence « Lyons » appartient à la ligne « Lyon/Lyons »). */
  function clesDeLigne(ligne: LigneAnon): Set<string> {
    const s = new Set<string>([ligne.cle.toLowerCase()])
    for (const a of parserAliases(ligne.entite)) s.add(cleEntite(a))
    if (ligne.regle) {
      const r = deps.reglesAnon().find((x) => x.id === ligne.regle)
      for (const e of r?.entite ?? []) {
        for (const a of parserAliases(e)) s.add(cleEntite(a))
      }
    }
    return s
  }
  /** L'annotation appartient-elle à cette ligne (par alias du texte courant) ? */
  function annotationDeLigne(a: Annotation, ligne: LigneAnon): boolean {
    return clesDeLigne(ligne).has(lineCle(a))
  }
  /** Une entité est-elle déjà présente dans le tableau (brouillon ou occurrence) ?
   *  Renvoie la cle de la ligne existante, ou null. Sert au composant pour
   *  décider, à la sélection : peupler la ligne de saisie ou scroller vers
   *  la ligne existante (pas de doublon). Partage d'ALIAS : sélectionner
   *  « Lyons » quand « Lyon/Lyons » existe → ligne existante. */
  function entiteExisteDeja(entite: string): string | null {
    const e = entite.trim()
    if (!e) return null
    const brouillon = trouverBrouillon(brouillonsAnon.value, e)
    if (brouillon) return cleEntite(brouillon.entite)
    const clesSaisie = new Set(parserAliases(e).map((a) => a.toLowerCase()))
    // Parmi les lignes projetées (groupes déclarés inclus).
    for (const l of lignesAnon.value) {
      for (const a of parserAliases(l.entite)) {
        if (clesSaisie.has(a.toLowerCase())) return l.cle
      }
      for (const a of cleEntite(l.entite).split('/')) {
        if (clesSaisie.has(a)) return l.cle
      }
    }
    const ed = editor.value
    if (ed) {
      for (const a of entretien.annotations) {
        if (a.type !== 'anon' || estOrpheline(a)) continue
        if (clesSaisie.has(cleEntite(ed.state.doc.textBetween(a.from, a.to, ' ')))) return cleEntite(e)
      }
    }
    return null
  }

  /** Crée un brouillon (entité saisie, sans occurrence posée). No-op si l'entité
   *  existe déjà (brouillon ou occurrence). Auto-sauvé : le brouillon survit
   *  à un changement de ligne sans validation. Pseudo optionnel. */
  function creerBrouillon(entite: string, pseudo?: string) {
    const e = entite.trim()
    if (!e || entiteExisteDeja(e)) return
    ajouterBrouillon(brouillonsAnon.value, e, pseudo)
    rafraichir()
    planifierSauvegarde()
  }

  /** Met à jour le pseudo d'un brouillon existant (édition en cours de ligne
   *  brouillon non validée). Auto-sauvé au blur du champ Pseudo. */
  function majBrouillonLigne(entite: string, pseudo: string) {
    majBrouillon(brouillonsAnon.value, entite, pseudo)
    rafraichir()
    planifierSauvegarde()
  }

  // --- Suggestion d'entité-cœur (mots de liaison) ---
  /** Suggestion courante (null = rien à proposer / déjà traitée). Une seule
   *  modale à la fois : une nouvelle validation remplace une suggestion non
   *  traitée ; « Non » ne mémorise rien. */
  const suggestionLiaison = ref<{
    entiteCoeur: string
    pseudoCoeur: string
    portee: 'entretien' | 'corpus'
  } | null>(null)

  /** Après une validation RÉUSSIE : calcule l'entité-cœur éventuelle (« à Lyon »
   *  validé → proposer « Lyon ») à la MÊME portée que la validation effective.
   *  La décision est PURE (motsLiaison.ts) — réglage, invariants multi-alias/
   *  multi-pseudo, règle-cœur déjà existante ; ici on ne porte que le résultat
   *  à la modale. */
  function proposerCoeur(entite: string, pseudo: string, portee: 'entretien' | 'corpus') {
    const det = suggestionCoeur(
      deps.motsLiaison?.(),
      entite,
      pseudo,
      lignesAnon.value.map((l) => l.cle),
    )
    if (!det) return
    suggestionLiaison.value = { ...det, portee }
  }

  /** « Oui » : crée la règle-cœur au même niveau que l'affixée, par le geste
   *  standard (brouillon puis chemin de portée). Les occurrences de « Lyon »
   *  présentes dans le texte sont posées par ce geste — les chevauchements
   *  suivent le moteur existant (« le large absorbe l'étroit »). */
  async function accepterSuggestionLiaison() {
    const s = suggestionLiaison.value
    if (!s) return
    suggestionLiaison.value = null
    creerBrouillon(s.entiteCoeur, s.pseudoCoeur)
    await changerPorteeAnon(s.entiteCoeur, s.portee)
  }

  /** « Non » : rien n'est créé, aucun refus mémorisé. */
  function refuserSuggestionLiaison() {
    suggestionLiaison.value = null
  }

  /** Valide une ligne : relabel toutes les occurrences existantes de `entite`
   *  avec `pseudo`, et pose une occurrence anon sur chaque match du texte NON
   *  déjà couvert. Consomme le brouillon de même entité (son travail est fini). */
  function validerAnon(entite: string, pseudo: string) {
    const ed = editor.value
    if (!ed) return
    const e = entite.trim()
    const p = pseudo.trim()
    if (!e) {
      hintAnon.value = "Sélectionne d'abord un mot ou une expression dans le texte."
      return
    }
    if (!p) {
      hintAnon.value = 'Saisis un pseudo pour cette entité.'
      return
    }
    hintAnon.value = null
    const t = aplatir(ed.getJSON())
    // Multi-alias : la saisie « Lyon/Lyons » matche chaque graphie.
    const aliases = parserAliases(e)
    const matches = aliases
      .flatMap((a) => occurrencesDe(t.texte, a))
      .map((pl) => plageVersPM(t, pl.from, pl.to))
      .filter((x): x is { from: number; to: number } => x !== null)
    const cle = cleEntite(e)
    // Multi-pseudo (3b) : la saisie peut être « Claire / Rebecca ». On scinde et
    // on mémorise l'ensemble déclaré (pseudosDeclares) pour offrir la bascule du
    // menu contextuel ; les occurrences sont posées/relabelées avec le PREMIER
    // pseudo (l'utilisateur bascule les autres par occurrence via le menu).
    const declares = scinderPseudos(p)
    if (declares.length >= 2) pseudosDeclares.value[cle] = declares
    else delete pseudosDeclares.value[cle]
    const applique = declares[0] || p
    // Les instructions sont calculées PUR (anonymisation.ts) puis
    // APPLIQUÉES sur la table réactive : relabel des occurrences ANONYMISÉES
    // seules (les exceptions gardent état + pseudo-mémoire), poses bloquées
    // par une exception couvrante, absorption « la plus longue gagne » sur
    // l'anonymisé pur (intacts par rapport à l'itération 1).
    const instr = instructionsValiderAnon(
      entretien.annotations,
      matches,
      aliases.map((a) => cleEntite(a)),
      applique,
      (f, t2) => ed.state.doc.textBetween(f, t2, ' '),
      genId,
    )
    for (const r of instr.relabel) {
      const a = entretien.annotations.find((x) => x.id === r.id)
      if (a) a.pseudo = r.pseudo
    }
    for (const o of instr.poser) {
      entretien.annotations.push({
        id: o.id,
        type: 'anon',
        from: o.from,
        to: o.to,
        auteur,
        pseudo: o.pseudo,
        etat: 'anonymise',
      })
    }
    // Le brouillon a fait son travail : il est consommé.
    consommerBrouillon(brouillonsAnon.value, e)
    rafraichir()
    rafraichirDecorations()
    rafraichirCompteursAAAnonymiser()
    rafraichirReperage()
    planifierSauvegarde()
    // Validation réussie → suggérer l'entité-cœur éventuelle (mots de liaison).
    proposerCoeur(e, p, 'entretien')
  }
  /** Retire toutes les occurrences d'une ligne (dé-barrer). */
  function supprimerAnon(occurrenceIds: string[]) {
    for (const id of occurrenceIds) retirerAnnotation(entretien, id)
    rafraichir()
    rafraichirDecorations()
    rafraichirCompteursAAAnonymiser()
    rafraichirReperage()
    planifierSauvegarde()
  }

  /** Supprime une ligne entière : ses occurrences + son éventuel brouillon.
   *  Pour une ligne CORPUS, la règle liée n'est supprimée QUE si elle est
   *  isolée (aucun autre entretien n'y référence) — sinon BLOQUÉ + message. */
  async function supprimerLigneAnon(entite: string) {
    const cle = cleEntite(entite)
    const ligne = lignesAnon.value.find((l) => l.cle === cle)
    if (!ligne) return
    const clesLigne = clesDeLigne(ligne)
    if (ligne?.etat === 'corpus' && ligne.regle) {
      const ailleurs = await window.sonal.corpus.regleAnonUtiliseeAilleurs(ligne.regle, ouvertId.value ?? undefined)
      if (ailleurs) {
        hintAnon.value = "Vous ne pouvez pas supprimer cette règle car elle est utilisée dans d'autres entretiens."
        return
      }
      await window.sonal.corpus.regleAnonSupprimer(ligne.regle)
      await deps.rafraichirReglesCorpus?.()
    }
    const ids = entretien.annotations
      .filter(
        (a) =>
          a.type === 'anon' &&
          !estOrpheline(a) &&
          clesLigne.has(cleEntite(editor.value!.state.doc.textBetween(a.from, a.to, ' '))),
      )
      .map((a) => a.id)
    for (const id of ids) retirerAnnotation(entretien, id)
    retirerBrouillon(brouillonsAnon.value, entite)
    delete pseudosDeclares.value[cle]
    rafraichir()
    rafraichirDecorations()
    rafraichirCompteursAAAnonymiser()
    rafraichirReperage()
    planifierSauvegarde()
  }

  /** Slider de portée : change l'état d'une ligne (3 crans, 3b).
   *  brouillon → entretien : pose les occurrences standalone (valider).
   *  brouillon/entretien → corpus : crée/réutilise une règle + pose/relie.
   *  entretien → brouillon : retire les occurrences, recrée un brouillon.
   *  corpus → entretien : délie (rend standalone) ; la règle est supprimée si elle
   *    devient isolée, sinon elle reste (partagée par d'autres entretiens).
   *  corpus → brouillon : retire les occurrences + recrée un brouillon — BLOQUÉ
   *    si la règle est utilisée ailleurs (message d'isolation). */
  async function changerPorteeAnon(entite: string, cible: 'brouillon' | 'entretien' | 'corpus') {
    const ligne = lignesAnon.value.find((l) => l.cle === cleEntite(entite))
    if (!ligne) return
    if (cible === ligne.etat) return
    if (cible === 'entretien' && ligne.etat === 'brouillon') {
      validerAnon(ligne.entite, ligne.pseudo)
      return
    }
    if (cible === 'brouillon' && ligne.etat === 'entretien') {
      const pseudo = ligne.pseudo
      for (const id of ligne.occurrenceIds) retirerAnnotation(entretien, id)
      ajouterBrouillon(brouillonsAnon.value, ligne.entite, pseudo)
      rafraichir()
      rafraichirDecorations()
      planifierSauvegarde()
      return
    }
    if (cible === 'corpus') {
      await promouvoirCorpus(ligne)
      return
    }
    if (ligne.etat === 'corpus' && cible === 'entretien') {
      await delierCorpus(ligne)
      return
    }
    if (ligne.etat === 'corpus' && cible === 'brouillon') {
      await retirerCorpusVersBrouillon(ligne)
    }
  }

  /** Étape 4a — validation d'une ligne par ENTRÉE : applique la portée
   *  prioritaire (paramsAnon.prioriteValidation, défaut « corpus »), Maj+Entrée
   *  l'autre portée. La ligne doit exister (brouillon ou entretien ; une ligne
   *  corpus est déjà au-delà). Le slider 3 crans reste le geste explicite. */
  async function validerAvecPriorite(entite: string, majuscule: boolean) {
    const ligne = lignesAnon.value.find((l) => l.cle === cleEntite(entite))
    if (!ligne || ligne.etat === 'corpus') return
    const prio = deps.prioriteAnon()
    const cible = (
      majuscule ? (prio === 'corpus' ? 'entretien' : 'corpus') : prio
    ) as 'brouillon' | 'entretien' | 'corpus'
    if (cible === ligne.etat) return
    await changerPorteeAnon(ligne.entite, cible)
  }

  /** Étape 4c — catégorie de la règle corpus liée à une ligne (badge). */
  function categorieDeLigne(entite: string): string {
    const ligne = lignesAnon.value.find((l) => l.cle === cleEntite(entite))
    if (!ligne?.regle) return ''
    return deps.reglesAnon().find((r) => r.id === ligne.regle)?.categorie ?? ''
  }
  /** Étape 4c — assigne/retire la catégorie d'une ligne CORPUS (badge). */
  async function categoriserLigne(entite: string, categorie: string) {
    const ligne = lignesAnon.value.find((l) => l.cle === cleEntite(entite))
    if (!ligne?.regle || !deps.categoriserRegle) return
    await deps.categoriserRegle(ligne.regle, categorie || null)
  }
  /** Liste des catégories actives (vide = réglage désactivé → badge masqué). */
  const thematiquesActives = computed(() =>
    deps.thematiques?.().actif ? deps.thematiques().liste : [],
  )

  /** Pseudos « cible » d'une ligne à pousser au corpus : l'ensemble déclaré
   *  (a/b) s'il existe, sinon le pseudo d'une occurrence ANONYMISÉE DE CETTE
   *  LIGNE (on filtre par cle AVANT de choisir — sinon `find` prendrait la
   *  première occurrence du document, d'une autre entité). */
  function pseudosCibleDeLigne(ligne: LigneAnon): string[] {
    const declares = pseudosDeclares.value[ligne.cle]
    if (declares && declares.length > 1) return [...declares]
    const occ = entretien.annotations.find(
      (a) =>
        a.type === 'anon' &&
        !estOrpheline(a) &&
        a.etat !== 'exception' &&
        annotationDeLigne(a, ligne) &&
        !!a.pseudo,
    )
    if (occ) return [occ.pseudo!]
    return []
  }
  /** Clef d'entité d'une annotation (lue sur le doc courant). */
  function lineCle(a: Annotation): string {
    const ed = editor.value
    return ed ? cleEntite(ed.state.doc.textBetween(a.from, a.to, ' ')) : ''
  }

  /** Fichier/Entretien → Corpus (3b). Crée la règle si absente ; sinon, si
   *  pseudos identiques → réutilise ; sinon → dialogue de divergence. */
  async function promouvoirCorpus(ligne: LigneAnon) {
    const cas: 'brouillon' | 'fichier' = ligne.etat === 'brouillon' ? 'brouillon' : 'fichier'
    // Pseudo SAISI pour cette ligne (base de la détection 4b-B) : celui du
    // brouillon ; en fichier, il sera relu sur les occurrences plus bas.
    const pseudoSaisi =
      cas === 'brouillon'
        ? trouverBrouillon(brouillonsAnon.value, ligne.entite)?.pseudo ?? ligne.pseudo
        : ''
    const pseudosCible =
      cas === 'brouillon'
        ? scinderPseudos(trouverBrouillon(brouillonsAnon.value, ligne.entite)?.pseudo ?? ligne.pseudo)
        : pseudosCibleDeLigne(ligne)
    if (pseudosCible.length === 0) {
      hintAnon.value = 'Saisis un pseudo avant de pousser cette entité au corpus.'
      return
    }
    const existante = await window.sonal.corpus.regleAnonParEntite(ligne.entite)
    const memesPseudos = existante &&
      existante.pseudos.length === pseudosCible.length &&
      pseudosCible.every((p) => existante.pseudos.some((q) => q.toLowerCase() === p.toLowerCase()))
    if (!existante || memesPseudos) {
      const res = await window.sonal.corpus.regleAnonCreer(ligne.entite, pseudosCible)
      // Course multi-user : la transaction peut révéler une règle posée par
      // un collègue depuis notre dernier pull (données locales périmées).
      // Même traitement que « existante » ci-dessus : pseudos identiques →
      // on relie ; divergents → dialogue Aligner / Garder les deux.
      if (res.existait && !memesPseudos) {
        dialoguePorteeCorpus.value = {
          entite: ligne.entite,
          pseudosCible,
          regleExistanteId: res.regle.id,
          reglePseudos: res.regle.pseudos,
          cas,
        }
        return
      }
      await appliquerCorpus(ligne, res.regle.id, cas, undefined)
      // Validation corpus réussie → suggérer l'entité-cœur éventuelle.
      proposerCoeur(ligne.entite, cas === 'brouillon' ? pseudoSaisi : pseudosCible.join(' / '), 'corpus')
      return
    }
    // Divergence → dialogue.
    dialoguePorteeCorpus.value = {
      entite: ligne.entite,
      pseudosCible,
      regleExistanteId: existante.id,
      reglePseudos: existante.pseudos,
      cas,
    }
  }

  /** Applique la portée corpus (create/reuse) : poser (brouillon) ou relier
   *  (fichier). `pseudoAppli` non vide = « aligner » vers ce pseudo de la règle. */
  async function appliquerCorpus(ligne: LigneAnon, regleId: string, cas: 'brouillon' | 'fichier', pseudoAppli?: string) {
    const ed = editor.value
    if (!ed) return
    if (cas === 'brouillon') {
      poserCorpusDepuisBrouillon(ligne, regleId, pseudoAppli ?? ligne.pseudo.split(' / ')[0])
    } else {
      for (const a of entretien.annotations) {
        if (a.type === 'anon' && annotationDeLigne(a, ligne)) {
          a.regle = regleId
          if (pseudoAppli && a.etat !== 'exception') a.pseudo = pseudoAppli
        }
      }
      delete pseudosDeclares.value[ligne.cle]
    }
    await deps.rafraichirReglesCorpus?.()
    rafraichir()
    rafraichirDecorations()
    rafraichirCompteursAAAnonymiser()
    rafraichirReperage()
    planifierSauvegarde()
  }

  /** Dialogue : « Aligner » — la règle garde ses pseudos, l'entretien adopte son
   *  pseudo primaire (posé/relié). */
  async function alignerCorpus() {
    const d = dialoguePorteeCorpus.value
    if (!d) return
    dialoguePorteeCorpus.value = null
    const ligne = lignesAnon.value.find((l) => l.cle === cleEntite(d.entite))
    if (!ligne) return
    await appliquerCorpus(ligne, d.regleExistanteId, d.cas, d.reglePseudos[0])
  }
  /** Dialogue : « Garder les deux » — ajoute les pseudos de l'entretien à la
   *  règle (si ≤2), puis pose/relie en gardant la variante de l'entretien. */
  async function garderLesDeuxCorpus() {
    const d = dialoguePorteeCorpus.value
    if (!d) return
    dialoguePorteeCorpus.value = null
    for (const p of d.pseudosCible) {
      await window.sonal.corpus.regleAnonAjouterPseudo(d.regleExistanteId, p)
    }
    const ligne = lignesAnon.value.find((l) => l.cle === cleEntite(d.entite))
    if (!ligne) return
    // La variante de l'entretien prime pour ses occurrences (garder les deux).
    await appliquerCorpus(ligne, d.regleExistanteId, d.cas, d.pseudosCible[0])
  }
  function annulerDialogueCorpus() {
    dialoguePorteeCorpus.value = null
  }

  /* ── Réconciliation POST-PULL ───────────────────────────────────────────
   * En multi-user, une règle corpus régentant une entité déjà travaillée
   * localement peut APPARAÎTRE pendant la session (un collègue l'a poussée
   * entre deux pulls). Au prochain tirage qui ramène un corpus.json modifié,
   * l'orchestrateur appelle ceci : mêmes décisions que le dialogue de
   * promotion (« Aligner / Garder les deux »), jamais de divergence silencieuse.
   * ───────────────────────────────────────────────────────────────────────*/
  /** Divergences déjà proposées cette session — « annuler » n'est pas un refus
   * définitif mais on ne re-dérange pas l'utilisateur à chaque pull. */
  const divergencesIgnorees = new Set<string>()
  /** Détecte et ouvre le dialogue pour la PREMIÈRE divergence trouvée.
   *  Renvoie le nombre de divergences détectées (0 = rien à signaler). */
  function detecterDivergencesPostTirage(): number {
    if (!editor.value || dialoguePorteeCorpus.value) return 0 // dialogue déjà ouvert
    const divergences = detecterDivergencesPortee(lignesAnon.value, deps.reglesAnon()).filter(
      (d) => !divergencesIgnorees.has(`${d.regleId}|${cleEntite(d.entite)}`),
    )
    const premiere = divergences[0]
    if (!premiere) return 0
    divergencesIgnorees.add(`${premiere.regleId}|${cleEntite(premiere.entite)}`)
    dialoguePorteeCorpus.value = {
      entite: premiere.entite,
      pseudosCible: premiere.pseudosLocaux,
      regleExistanteId: premiere.regleId,
      reglePseudos: premiere.reglePseudos,
      cas: premiere.cas,
    }
    return divergences.length
  }

  /* ── Fusion assistée (copie de divergence → modèle ouvert) ──────────────
   * Une copie mise de côté par une rétrogradation (publication 412) est
   * proposée à la fusion à la RÉOUVERTURE de l'entretien (verrou frais,
   * contenu courant = version serveur). Union par id — le courant gagne ;
   * garde préalable : corpsTexte identiques (sinon pas de merge, choix only).
   * ───────────────────────────────────────────────────────────────────────*/
  /** La fusion automatique est-elle proposable pour cette copie ? */
  function fusionPossible(copie: EntretienFichier): boolean {
    return corpsIdentiques(editor.value ? editor.value.getJSON() : null, copie.corpsTexte)
  }
  /** Applique les apports de la copie dans le modèle ouvert puis sauvegarde.
   *  Renvoie le bilan (nombre d'éléments apportés par la copie). */
  async function absorberFusion(copie: EntretienFichier): Promise<{
    annotations: number
    ancres: number
    locuteurs: number
    valeurs: number
  }> {
    const courant: EntretienFichier = {
      formatVersion: FORMAT_VERSION,
      lastModified: new Date().toISOString(),
      corpsTexte: editor.value ? editor.value.getJSON() : {},
      annotations: JSON.parse(JSON.stringify(entretien.annotations)),
      ancres: [...entretien.ancres],
      locuteurs: JSON.parse(JSON.stringify(locuteurs.value)),
      meta: {
        valeursGen: { ...meta.valeursGen },
        audioRef: meta.audioRef,
        audioDistant: meta.audioDistant ?? undefined,
      },
      brouillonsAnon: JSON.parse(JSON.stringify(brouillonsAnon.value)),
      pseudosDeclares: JSON.parse(JSON.stringify(pseudosDeclares.value)),
    }
    const { fusion, ajouts } = fusionnerEntretiens(courant, copie)
    entretien.annotations = fusion.annotations
    entretien.ancres = fusion.ancres
    locuteurs.value = fusion.locuteurs
    Object.assign(meta.valeursGen, fusion.meta.valeursGen)
    brouillonsAnon.value = fusion.brouillonsAnon ?? []
    pseudosDeclares.value = fusion.pseudosDeclares ?? {}
    rafraichir()
    rafraichirDecorations()
    planifierSauvegarde()
    return ajouts
  }

  /** Brouillon → Corpus : pose les occurrences rule-backed (comme une
   *  validation, mais liée à la règle) puis consomme le brouillon. */
  function poserCorpusDepuisBrouillon(ligne: LigneAnon, regleId: string, pseudo: string) {
    const ed = editor.value!
    const t = aplatir(ed.getJSON())
    const aliases = parserAliases(ligne.entite)
    const matches = aliases
      .flatMap((a) => occurrencesDe(t.texte, a))
      .map((pl) => plageVersPM(t, pl.from, pl.to))
      .filter((x): x is { from: number; to: number } => x !== null)
    const instr = instructionsValiderAnon(
      entretien.annotations,
      matches,
      aliases.map((a) => cleEntite(a)),
      pseudo,
      (f, t2) => ed.state.doc.textBetween(f, t2, ' '),
      genId,
    )
    for (const r of instr.relabel) {
      const a = entretien.annotations.find((x) => x.id === r.id)
      if (a) { a.pseudo = r.pseudo; a.regle = regleId }
    }
    for (const o of instr.poser) {
      entretien.annotations.push({ id: o.id, type: 'anon', from: o.from, to: o.to, auteur, pseudo: o.pseudo, etat: 'anonymise', regle: regleId })
    }
    retirerBrouillon(brouillonsAnon.value, ligne.entite)
    delete pseudosDeclares.value[ligne.cle]
  }

  /** Corpus → Entretien (déliage) : les occurrences redeviennent standalone ;
   *  la règle est supprimée si elle devient isolée, sinon reste (partagée). */
  async function delierCorpus(ligne: LigneAnon) {
    const regleId = ligne.regle!
    const ailleurs = await window.sonal.corpus.regleAnonUtiliseeAilleurs(regleId, ouvertId.value ?? undefined)
    for (const a of entretien.annotations) {
      if (a.type === 'anon' && annotationDeLigne(a, ligne)) delete a.regle
    }
    if (!ailleurs) await window.sonal.corpus.regleAnonSupprimer(regleId)
    await deps.rafraichirReglesCorpus?.()
    rafraichir()
    rafraichirDecorations()
    rafraichirCompteursAAAnonymiser()
    rafraichirReperage()
    planifierSauvegarde()
  }

  /** Corpus → Brouillon : retire les occurrences + recrée un brouillon. BLOQUÉ
   *  si la règle est utilisée dans d'autres entretiens (message d'isolation). */
  async function retirerCorpusVersBrouillon(ligne: LigneAnon) {
    const regleId = ligne.regle!
    const ailleurs = await window.sonal.corpus.regleAnonUtiliseeAilleurs(regleId, ouvertId.value ?? undefined)
    if (ailleurs) {
      hintAnon.value = "Vous ne pouvez pas supprimer cette règle car elle est utilisée dans d'autres entretiens."
      return
    }
    for (const id of ligne.occurrenceIds) retirerAnnotation(entretien, id)
    ajouterBrouillon(brouillonsAnon.value, ligne.entite, ligne.pseudo)
    await window.sonal.corpus.regleAnonSupprimer(regleId)
    await deps.rafraichirReglesCorpus?.()
    rafraichir()
    rafraichirDecorations()
    rafraichirCompteursAAAnonymiser()
    rafraichirReperage()
    planifierSauvegarde()
  }

  // --- Menu contextuel de l'éditeur (anon, codages, commentaires) ---
  /** Ouvre le menu flottant sur la cible résolue par le plugin
   *  `pluginMenuContexte` (appelé à chaque clic droit consommé) : ici on
   *  transforme les annotations brutes en VUE pour le composant MenuContexte. */
  function ouvrirMenuContexte(cible: CibleMenuContexte) {
    const ed = editor.value
    const texteDe = (f: number, t: number) => (ed ? ed.state.doc.textBetween(f, t, ' ') : '')
    // Section anon : entité + AUTRES pseudos autorisés (multi-pseudo 3b).
    // Priorité à la règle (occurrence rule-backed, portée corpus) ; sinon à
    // l'ensemble déclaré au niveau fichier (`pseudosDeclares`, occurrence
    // standalone). Vide si mono-pseudo → pas d'item de bascule.
    let anon: { id: string; etat: 'anonymise' | 'exception'; entite: string; pseudosAutres: string[] } | null = null
    if (cible.anon) {
      const a = cible.anon
      const entite = texteDe(a.from, a.to)
      let pseudosAutres: string[] = []
      const cle = cleEntite(entite)
      if (a.regle) {
        const regle = deps.reglesAnon().find((r) => r.id === a.regle)
        if (regle && regle.pseudos.length > 1 && a.pseudo) {
          const bas = (p: string) => p.toLowerCase()
          pseudosAutres = regle.pseudos.filter((p) => bas(p) !== bas(a.pseudo!))
        }
      } else if (a.pseudo) {
        const declares = pseudosDeclares.value[cle]
        const bas = (p: string) => p.toLowerCase()
        if (declares && declares.length > 1 && declares.some((p) => bas(p) === bas(a.pseudo!))) {
          pseudosAutres = declares.filter((p) => bas(p) !== bas(a.pseudo!))
        }
      }
      anon = {
        id: a.id,
        etat: a.etat === 'exception' ? 'exception' : 'anonymise',
        entite,
        pseudosAutres,
      }
    }
    // Sections codages / commentaires : libellés lisibles + dédoublonnage des
    // codages par thème (plusieurs annotations du même code sous le clic = un
    // seul item ; le retrait visera la plus large).
    const vus = new Set<string>()
    const codages: { id: string; libelle: string }[] = []
    for (const c of [...cible.codages].sort((x, y) => y.to - y.from - (x.to - x.from))) {
      if (vus.has(c.code ?? '')) continue
      vus.add(c.code ?? '')
      codages.push({ id: c.id, libelle: deps.nomCode(c.code ?? '') })
    }
    const commentaires = cible.commentaires.map((c) => ({
      id: c.id,
      auteur: c.auteur,
      extrait: `${c.auteur || 'sans auteur'} : ${(c.texte ?? '').slice(0, 60)}`,
    }))
    menuContextuel.value = {
      x: cible.x,
      y: cible.y,
      anon,
      codages,
      commentaires,
      peutCommenter: cible.plageCommenter != null,
    }
    plageCommenterCourante.value = cible.plageCommenter
  }
  /** Plage à commenter capturée à l'ouverture du menu (sélection ou bornes de
   *  l'annotation sous le clic) — consommée par le geste « Commenter ». */
  const plageCommenterCourante = ref<{ from: number; to: number } | null>(null)
  /** Ferme le menu (clic hors menu, Escape, ou après une action). */
  function fermerMenu() {
    menuContextuel.value = null
    plageCommenterCourante.value = null
  }
  /** Pseudo de la LIGNE du tableau contenant l'occurrence `a` : celui d'une
   *  autre occurrence ANONYMISÉE de même entité (le relabel de ligne), sinon
   *  celui du brouillon courant. Vide si la ligne n'en a aucun (entité dont
   *  toutes les occurrences sont des exceptions) — « remettre en anonymisé »
   *  re-barre alors sans pseudo, prêt à être relabelé au tableau (le pseudo
   *  vit sur la ligne/règle, pas sur l'exception). */
  function pseudoDeLigne(a: Annotation): string {
    const ed = editor.value
    if (!ed) return ''
    const cle = cleEntite(ed.state.doc.textBetween(a.from, a.to, ' '))
    if (!cle) return ''
    for (const autre of entretien.annotations) {
      if (autre.type !== 'anon' || estOrpheline(autre) || autre.etat === 'exception') continue
      if (cleEntite(ed.state.doc.textBetween(autre.from, autre.to, ' ')) === cle && autre.pseudo) {
        return autre.pseudo
      }
    }
    return trouverBrouillon(brouillonsAnon.value, cle)?.pseudo ?? ''
  }
  /** « Laisser en clair » : l'occurrence devient une EXCEPTION. On ne stocke
   *  que l'état ; le pseudo éventuel reste en MODÈLE comme mémoire locale
   *  (jamais affiché, jamais sérialisé) pour que
   *  « remettre en anonymisé » soit sans perte. Non journalisée (comme
   *  validerAnon) ; l'inverse est le second item du menu. */
  function basculerException(id: string) {
    const a = entretien.annotations.find((x) => x.id === id)
    if (!a || a.type !== 'anon' || a.etat === 'exception') return
    a.etat = 'exception'
    fermerMenu()
    rafraichir()
    rafraichirDecorations()
    rafraichirCompteursAAAnonymiser()
    rafraichirReperage()
    planifierSauvegarde()
  }
  /** « Remettre en anonymisé » : l'exception redevient une occurrence
   *  anonymisée. Priorité au pseudo-mémoire conservé sur l'exception (restore
   *  sans perte), sinon au pseudo de la ligne courante — vide si la
   *  ligne n'en a pas (on re-barre, l'utilisateur relabel au tableau). */
  function basculerAnonymise(id: string) {
    const a = entretien.annotations.find((x) => x.id === id)
    if (!a || a.type !== 'anon' || a.etat === 'anonymise') return
    a.etat = 'anonymise'
    a.pseudo = a.pseudo || pseudoDeLigne(a)
    fermerMenu()
    rafraichir()
    rafraichirDecorations()
    rafraichirCompteursAAAnonymiser()
    rafraichirReperage()
    planifierSauvegarde()
  }

  /** Bascule multi-pseudo par occurrence (3b) : ré-anonymise CETTE occurrence
   *  avec un autre pseudo autorisé (règle corpus OU ensemble déclaré fichier),
   *  en changeant le `pseudo` de cette annotation seule (le texte [pseudo]
   *  suit). Niveau entretien, par occurrence. */
  function basculerPseudoOccurrence(id: string, pseudo: string) {
    const a = entretien.annotations.find((x) => x.id === id)
    if (!a || a.type !== 'anon') return
    if ((a.pseudo || '').toLowerCase() === pseudo.toLowerCase()) return
    a.pseudo = pseudo
    fermerMenu()
    rafraichir()
    rafraichirDecorations()
    rafraichirCompteursAAAnonymiser()
    rafraichirReperage()
    planifierSauvegarde()
  }

  // --- Commentaires en marge (poser, éditer, supprimer, retirer un codage) ---

  /** Ouvre la modale en CRÉATION sur une plage (appelé par le menu contextuel ;
   *  l'auteur est pré-rempli avec le dernier signataire mémorisé). */
  async function commenterPlage(from: number, to: number) {
    const ed = editor.value
    if (!ed || from >= to) return
    const snappe = snapToWord(ed.state, from, to)
    if (snappe.from >= snappe.to) return
    fermerMenu()
    editionCommentaire.value = {
      id: null,
      from: snappe.from,
      to: snappe.to,
      auteur: await window.sonal.profil.signataire(),
      texte: '',
    }
  }
  /** « Commenter » depuis le menu contextuel : reprend la plage capturée à
   *  l'ouverture (sélection ou annotation sous le clic). */
  function commenterDepuisMenu() {
    const p = plageCommenterCourante.value
    if (p) void commenterPlage(p.from, p.to)
  }
  /** Ouvre la modale en ÉDITION sur le commentaire `id` (clic carte ou menu). */
  function editerCommentaire(id: string) {
    const a = entretien.annotations.find((x) => x.id === id)
    if (!a || a.type !== 'commentaire') return
    fermerMenu()
    editionCommentaire.value = { id, from: a.from, to: a.to, auteur: a.auteur ?? '', texte: a.texte ?? '' }
  }
  /** Ferme la modale sans rien toucher. */
  function fermerEditionCommentaire() {
    editionCommentaire.value = null
  }
  /** Valide la modale : pose ou réécrit le commentaire, journalise, mémorise
   *  le signataire et sauvegarde — le même sillage que les codages. */
  async function validerCommentaire(auteur: string, texte: string) {
    const e = editionCommentaire.value
    if (!e || !texte.trim()) return
    await window.sonal.profil.memoriserSignataire(auteur)
    if (e.id) {
      const a = entretien.annotations.find((x) => x.id === e.id)
      if (!a || a.type !== 'commentaire') return
      const avant = { auteur: a.auteur, texte: a.texte ?? '' }
      if (!modifierCommentaire(entretien, e.id, { auteur, texte })) return
      enregistrer(
        journal,
        'Commentaire modifié',
        { type: 'editerAnnotation', annotationId: e.id, ...avant },
        genIdJournal,
      )
    } else {
      const c = ajouterCommentaire(entretien, { from: e.from, to: e.to, auteur, texte }, genId)
      if (c)
        enregistrer(journal, 'Commentaire posé', { type: 'retirerAnnotation', annotationId: c.id }, genIdJournal)
    }
    editionCommentaire.value = null
    rafraichir()
    rafraichirDecorations()
    planifierSauvegarde()
  }
  /** Supprime le commentaire `id` (depuis la modale d'édition). L'objet retiré
   *  survit dans l'entrée : journalRemap continue à le remapper. */
  function supprimerCommentaire(id: string) {
    const a = entretien.annotations.find((x) => x.id === id)
    if (!a || a.type !== 'commentaire') return
    retirerAnnotation(entretien, id)
    enregistrer(journal, 'Commentaire supprimé', { type: 'reposerAnnotation', annotation: { ...a } }, genIdJournal)
    editionCommentaire.value = null
    fermerMenu()
    rafraichir()
    rafraichirDecorations()
    planifierSauvegarde()
  }
  /** Retire UN codage sans resélectionner (menu contextuel, parité SonalPi1) :
   *  même sillage que le toggle « re-clic = retirer » de coderAvec. */
  function retirerCodageMenu(id: string) {
    const a = entretien.annotations.find((x) => x.id === id)
    if (!a || a.type !== 'codage') return
    retirerAnnotation(entretien, id)
    enregistrer(
      journal,
      `Codage retiré : ${deps.nomCode(a.code ?? '')}`,
      { type: 'reposerAnnotation', annotation: { ...a } },
      genIdJournal,
    )
    fermerMenu()
    rafraichir()
    rafraichirDecorations()
    planifierSauvegarde()
  }

  /** Données brutes de l'entretien ouvert (pour l'export .sonal, assemblé par l'App). */
  function donneesExport(): {
    corpsTexte: unknown
    annotations: Annotation[]
    ancres: Ancre[]
    locuteurs: Locuteur[]
    meta: { valeursGen: Record<string, string> }
    legacy: LegacyBlobs
    brouillonsAnon: BrouillonAnon[]
    notes: Note[]
  } {
    return {
      corpsTexte: editor.value!.getJSON(),
      annotations: entretien.annotations.map((a) => ({ ...a })),
      ancres: entretien.ancres.map((a) => ({ ...a })),
      locuteurs: locuteurs.value,
      meta: { valeursGen: meta.valeursGen },
      legacy: legacyCourant.value,
      brouillonsAnon: brouillonsAnon.value,
      notes: notes.value,
    }
  }

  onBeforeUnmount(() => {
    clearTimeout(tid)
    window.removeEventListener('keydown', surRaccourciRecherche)
    editor.value?.destroy()
  })

  /** Ctrl+F / Cmd+F : ouvre la boîte recherche/remplacement quand un entretien
   *  est ouvert (le navigateur n'a pas de recherche propre à détourner ici). */
  function surRaccourciRecherche(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
    if (event.key.toLowerCase() !== 'f' || !ouvertId.value) return
    event.preventDefault()
    ouvrirRecherche()
  }
  window.addEventListener('keydown', surRaccourciRecherche)

  return {
    // état / modèle
    entretien,
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
    // recherche / remplacement (Ctrl+F)
    rechercheOuverte,
    rechercheTexte,
    remplacementTexte,
    occurrencesRecherche,
    indexRecherche,
    fermerRecherche,
    naviguerRecherche,
    remplacerOccurrenceCourante,
    remplacerTout,
    brouillonsAnon,
    notes,
    brouillonNote,
    selectionVide,
    ouvertId,
    refusFormat,
    etatSauvegarde,
    editor,
    verrouAutrui, // état du verrou de l'entretien ouvert (bandeau lecture seule)
    entreesJournal,
    annulerEntree,
    // gestes
    coderAvec,
    retirerCodagesDuCode,
    attribuerLoc,
    renommerLoc,
    messagePersonnes,
    rapprochementNommage,
    rapprochementOccupe,
    reporterRapprochement,
    deciderRapprochement,
    nouveauLocuteur,
    setInterviewer,
    setPseudoLoc,
    choisirCouleurLoc,
    locuteurASupprimer,
    demanderSuppressionLocuteur,
    confirmerSuppressionLocuteur,
    setValeurGen,
    setValeurLoc,
    // notes d'entretien
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
    notesEnTexte,
    commentairesPourLiaison,
    menuLiensNote,
    lierPassage,
    ouvrirMenuLiensNote,
    fermerMenuLiensNote,
    lierCommentaireNote,
    delierCommentaireNote,
    allerAuCommentaire,
    resolverCommentaires,
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
    editionCommentaire,
    commenterPlage,
    commenterDepuisMenu,
    editerCommentaire,
    fermerEditionCommentaire,
    validerCommentaire,
    supprimerCommentaire,
    retirerCodageMenu,
    basculerException,
    basculerAnonymise,
    basculerPseudoOccurrence,
    dialoguePorteeCorpus,
    alignerCorpus,
    garderLesDeuxCorpus,
    annulerDialogueCorpus,
    suggestionLiaison,
    accepterSuggestionLiaison,
    refuserSuggestionLiaison,
    detecterDivergencesPostTirage,
    fusionPossible,
    absorberFusion,
    entiteExisteDeja,
    // cycle de vie / persistance
    ouvrir,
    reinitialiser,
    sauver,
    viderSauvegarde,
    annulerEtAttendreSauvegarde,
    donneesExport,
    // rafraîchissements (l'App les déclenche après des changements corpus)
    rafraichir,
    rafraichirDecorations,
    resumeOuvert,
    // synchro audio
    majPlageLue,
    allerAuTexte,
    tempsDuBloc,
    tempsAuTexte,
  }
}
