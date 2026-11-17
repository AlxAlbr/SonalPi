import { ref, shallowRef, reactive, onBeforeUnmount } from 'vue'
import { Extension } from '@tiptap/core'
import { useEditor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { BlocAttributs } from '../editor/schema'
import { pluginRemap } from '../editor/remap'
import { pluginDecorations, decorationsPluginKey } from '../editor/decorations'
import { pluginGouttiere, gouttierePluginKey } from '../editor/locuteursGutter'
import { pluginLecture } from '../editor/lecture'
import { pluginMenuContexte } from '../editor/menuContexte'
import { pluginCommentairesMarge } from '../editor/commentairesMarge'
import { pluginReperage } from '../editor/reperage'
import { pluginRecherche } from '../editor/recherche'
import { pluginRemapJournal } from '../editor/journalRemap'
import { creerDetectionDoubleAlt, estToucheAlt, SEUIL_DOUBLE_APPUI } from '../editor/raccourcisLecture'
import { libelleGouttiere, nomDeLocuteur } from '../../shared/entretien/locuteurs'
import { estOrpheline, type Annotation } from '../../shared/entretien/annotation'
import type { Entretien } from '../../shared/entretien/entretien'
import type { Ancre } from '../../shared/entretien/audio'
import { bornesTour, formaterTemps, toursHorodates, type BlocHorodatage } from '../../shared/entretien/horodatage'
import type { BlocParole } from '../../shared/entretien/statistiquesLocuteurs'
import { useSynchroAudio } from './useSynchroAudio'
import { useRechercheEntretien } from './entretien/useRechercheEntretien'
import { useJournalEntretien } from './entretien/useJournalEntretien'
import { useValeursEntretien } from './entretien/useValeursEntretien'
import { useNotesEntretien } from './entretien/useNotesEntretien'
import { useLocuteursEntretien } from './entretien/useLocuteursEntretien'
import { useAnonymisationEntretien } from './entretien/useAnonymisationEntretien'
import { useAnnotationsEntretien } from './entretien/useAnnotationsEntretien'
import { resumeThematique } from '../../shared/corpus'
import type { EntretienFichier, Locuteur, SegmentThematique, BrouillonAnon, RegleAnon, MotsLiaisonParams, Note, ReferenceMediaDistant } from '../../shared/format'
import { FORMAT_VERSION } from '../../shared/format'
import { fusionnerEntretiens, corpsIdentiques } from '../../shared/entretien/fusion'
import { creerReperePassage } from '../../shared/entretien/reperesPassages'
import type { ReperePassage } from '../../shared/entretien/reperesPassages'
import { snapToWord } from '../editor/snap'
import type { LegacyBlobs } from '../formatSonal/importSonal'

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

/** Tour de parole tel que la barre au-dessus des onglets le présente. */
export interface BarreTour {
  posBloc: number
  nom: string
  couleur: string
  bornes: { debut: number; fin: number } | null
  rang: number
  total: number
}

interface TourBarre {
  posBloc: number
  loc: number | null
  bornes: { debut: number; fin: number } | null
  premierBloc: number
  dernierBloc: number
  premiereAncre: number
  derniereAncre: number
}

/** Temps d'un tour de parole, tels que la fenêtre d'horodatage les présente. */
export interface HorodatageTour {
  nom: string
  /** Temps des ancres du tour, dans l'ordre ; vide si le tour n'est pas encore horodaté. */
  temps: number[]
  /** Passages du tour : chacun va de l'ancre `de` à l'ancre `a` (index dans `temps`). */
  passages: { de: number; a: number; texte: string }[]
  texte: string
  /** Bornes imposées par les tours voisins (null : jusqu'à la fin de l'audio). */
  min: number
  max: number | null
  /** Temps estimé du début du tour, pour un tour pas encore horodaté. */
  repere: number | null
  /** Couleur du locuteur du tour. */
  couleur: string
  /** Tour qui précède : affiché pour le situer, sans modification (null : premier tour). */
  precedent: {
    posBloc: number
    nom: string
    couleur: string
    debut: number | null
    fin: number | null
    /** Début du dernier passage qui a du texte : la fin du tour précédent ne peut pas remonter avant. */
    debutDernierPassage: number | null
  } | null
  /** Tour qui suit : son début peut être décalé s'il est horodaté (null : dernier tour). */
  suivant: {
    posBloc: number
    nom: string
    couleur: string
    debut: number | null
    fin: number | null
    indexAncre: number
  } | null
  /** Rang du tour dans l'entretien (à partir de 1), et tours voisins à parcourir. */
  navigation: { rang: number; total: number; precedent: number | null; suivant: number | null }
}

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
  themeExiste?: (id: string) => boolean
  valeurExiste?: (idVar: string, idMod: string | null) => boolean
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
  /** Déplace la lecture en secondes ; renvoie false si aucun média n'est chargé. */
  decalerLecture?: (secondes: number) => boolean
  /** Règles corpus (`corpus.crp.reglesAnon`) — injectées par l'orchestrateur
   *  (useCorpus) : le menu contexte et les promotions résolvent les règles
   *  multi-pseudo et créent ou relient les règles à la portée corpus. */
  reglesAnon: () => RegleAnon[]
  /** Rafraîchit le cache des règles corpus après une mutation (création,
   *  « garder les deux », déliage/suppression) — injecté par l'orchestrateur
   *  pour que la projection des lignes reflète la règle fraîche. */
  rafraichirReglesCorpus?: () => Promise<void>
  /** Publie le retrait local avant de supprimer sa définition partagée. */
  publierAvantSuppressionDefinition?: () => Promise<boolean>
  demanderDissociationCorpus?: (
    regleId: string,
    cible: 'entretien' | 'brouillon',
    entite: string,
  ) => Promise<boolean>
  /** Priorité de validation définie dans `corpus.crp.paramsAnon` : la portée
   *  qu'applique ENTRÉE sur une ligne du tableau ; Maj+Entrée fait l'inverse. */
  prioriteAnon: () => 'corpus' | 'entretien'
  /** Réglage mots de liaison (corpus.crp.paramsAnon.motsLiaison) :
   *  suggestion d'entité-cœur à la validation (« à Lyon » → proposer « Lyon »).
   *  Absent → aucune proposition (tests PUR). */
  motsLiaison?: () => MotsLiaisonParams
  /** Thématiques d'entités : réglage courant (actif + liste). */
  thematiques?: () => { actif: boolean; liste: string[] }
  /** Assigne/retire la catégorie d'une règle corpus puis rafraîchit le
   *  cache des règles (injection orchestrateur, écriture transactionnée). */
  categoriserRegle?: (regleId: string, categorie: string | null) => Promise<void>
  /** L'écran Entretien est-il actuellement affiché ? */
  actif?: () => boolean
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
  const entretien = reactive<Entretien>({ annotations: [], ancres: [], reperesPassages: [] })
  const locuteurs = ref<Locuteur[]>([])
  /** Tour dont la fenêtre d'horodatage est ouverte (position de son premier bloc), ou null. */
  const tourHorodatage = ref<number | null>(null)
  const legacyCourant = ref<LegacyBlobs>({ tabAnon: null, notes: '' })
  const notesEntretien = useNotesEntretien({
    entretien,
    locuteurs,
    lireEditeur: () => editor.value ?? null,
    nomCategorieNote: deps.nomCategorieNote,
    categorieNoteDefaut: deps.categorieNoteDefaut,
    planifierSauvegarde,
    enregistrerAction: (libelle, inverse) => enregistrerAction(libelle, inverse),
  })
  const {
    notes,
    brouillonNote,
    brouillonEditionNote,
    avertissementNote,
    commentairesPourLiaison,
    menuLiensNote,
    ajouterNote,
    editerNote,
    validerNote,
    validerEditionNote,
    annulerNote,
    agrandirNote,
    reduireNote,
    fermerNotePanneau,
    ecrireCorpsNote,
    ecrireTitreNote,
    enregistrerSyncZoneHorsModale,
    supprimerNote,
    reordonnerNotes,
    marquerPassage,
    notesEnTexte,
    lierPassage,
    ouvrirMenuLiensNote,
    fermerMenuLiensNote,
    lierCommentaireNote,
    delierCommentaireNote,
    allerAuCommentaire,
    resolverCommentaires,
  } = notesEntretien
  const meta = reactive<{
    valeursGen: Record<string, string>
    audioRef: string | null
    audioDistant?: ReferenceMediaDistant | null // transporté tel quel par payloadCourant
  }>({
    valeursGen: {},
    audioRef: null,
  })
  // L'entretien s'ouvre sur le premier onglet de travail.
  const ongletDroite = ref<'themes' | 'locuteurs' | 'donnees' | 'journal' | 'anon' | 'notes' | 'commentaires'>('locuteurs')
  // Sélection courante pour l'onglet Anon (texte + plage snappée au mot) :
  // c'est elle qui peuple le « Nom » de la ligne de saisie. REQUÊTE, jamais
  // stockée — recalculée au moindre déplacement du curseur.
  // --- Recherche / remplacement (Ctrl+F) -------------------------------------
  const ouvertId = ref<string | null>(null)
  const selectionPassage = ref<{
    entretienId: string
    from: number
    to: number
    texte: string
  } | null>(null)
  const recherche = useRechercheEntretien({
    lireEditeur: () => editor.value ?? null,
    ouvertId,
    actif: deps.actif,
  })
  const {
    rechercheOuverte,
    rechercheTexte,
    remplacementTexte,
    occurrencesRecherche,
    indexRecherche,
    ouvrirRecherche,
    fermerRecherche,
    naviguerRecherche,
    allerOccurrence,
    remplacerOccurrenceCourante,
    remplacerTout,
  } = recherche
  const anonymisationEntretien = useAnonymisationEntretien({
    entretien,
    locuteurs,
    ouvertId,
    ongletDroite,
    lireEditeur: () => editor.value ?? null,
    reglesAnon: deps.reglesAnon,
    rafraichirReglesCorpus: deps.rafraichirReglesCorpus,
    publierAvantSuppressionDefinition: deps.publierAvantSuppressionDefinition,
    demanderDissociationCorpus: deps.demanderDissociationCorpus,
    prioriteAnon: deps.prioriteAnon,
    motsLiaison: deps.motsLiaison,
    thematiques: deps.thematiques,
    categoriserRegle: deps.categoriserRegle,
    rafraichirProjections: rafraichir,
    rafraichirDecorations,
    planifierSauvegarde,
  })
  const {
    selectionAnon,
    hintAnon,
    lignesAnon,
    hitsAAnonymiserParCle,
    inclusesParCle,
    reperageAnon,
    brouillonsAnon,
    pseudosDeclares,
    definitionsAnonLocales,
    dialoguePorteeCorpus,
    confirmationCouverture,
    accepterCouverture,
    refuserCouverture,
    suggestionLiaison,
    thematiquesActives,
    rafraichirCompteursAAAnonymiser,
    rafraichirReperage,
    demarrerReperage,
    naviguerReperage,
    arreterReperage,
    entiteExisteDeja,
    creerBrouillon,
    majBrouillonLigne,
    validerAnon,
    supprimerAnon,
    supprimerLigneAnon,
    changerPorteeAnon,
    validerAvecPriorite,
    categorieDeLigne,
    categoriserLigne,
    alignerCorpus,
    garderLesDeuxCorpus,
    annulerDialogueCorpus,
    accepterSuggestionLiaison,
    refuserSuggestionLiaison,
    detecterDivergencesPostTirage,
    pseudonymisationUtilisee,
    applicationsAnon,
  } = anonymisationEntretien

  // --- Journal d'actions : volatil (session), actions de modèle seules ---
  const journalEntretien = useJournalEntretien({
    entretien,
    locuteurs,
    notes,
    lireValeursGen: () => meta.valeursGen,
    lireEditeur: () => editor.value ?? null,
    themeExiste: deps.themeExiste,
    valeurExiste: deps.valeurExiste,
    effetsAnnulation: {
      rafraichirProjections: rafraichir,
      rafraichirDecorations,
      rafraichirGouttiere,
      rafraichirCompteursAnonymisation: rafraichirCompteursAAAnonymiser,
      rafraichirReperage,
      planifierSauvegarde,
    },
  })
  const {
    journal,
    entreesJournal,
    enregistrerAction,
    rafraichirJournal,
    annulerEntree,
    reinitialiserJournal,
  } = journalEntretien

  const locuteursEntretien = useLocuteursEntretien({
    locuteurs,
    ouvertId,
    lireEditeur: () => editor.value ?? null,
    lectureSeule: deps.lectureSeule,
    effets: {
      enregistrerAction,
      rafraichirJournal,
      rafraichirProjections: rafraichir,
      rafraichirGouttiere,
      planifierSauvegarde,
      viderSauvegarde,
      retirerLocuteurDesNotes: notesEntretien.retirerLocuteur,
    },
  })
  const {
    selectionVide,
    messagePersonnes,
    rapprochementNommage,
    rapprochementOccupe,
    locuteurASupprimer,
    attribuerLoc,
    renommerLoc,
    reporterRapprochement,
    deciderRapprochement,
    nouveauLocuteur,
    setInterviewer,
    setPseudoLoc,
    choisirCouleurLoc,
    demanderSuppressionLocuteur,
    confirmerSuppressionLocuteur,
  } = locuteursEntretien

  const { setValeurGen, setValeurLoc } = useValeursEntretien({
    meta,
    locuteurs,
    libelleValeur: deps.libelleValeur,
    enregistrerAction,
    rafraichirJournal,
    planifierSauvegarde,
  })

  const annotationsEntretien = useAnnotationsEntretien({
    entretien,
    lireEditeur: () => editor.value ?? null,
    estCodeActif: deps.estCodeActif,
    nomCode: deps.nomCode,
    enregistrerAction,
    decrireOccurrence: anonymisationEntretien.decrireOccurrence,
    pseudoDeLigne: anonymisationEntretien.pseudoDeLigne,
    rafraichirAnonymisation: anonymisationEntretien.rafraichirApresMutation,
    rafraichirProjections: rafraichir,
    rafraichirDecorations,
    planifierSauvegarde,
  })
  const {
    hintCodage,
    menuContextuel,
    editionCommentaire,
    coderAvec,
    retirerCodagesDuCode,
    fermerMenu,
    commenterPlage,
    commenterDepuisMenu,
    copierSelectionMenu,
    editerCommentaire,
    fermerEditionCommentaire,
    validerCommentaire,
    supprimerCommentaire,
    retirerCodageMenu,
    basculerException,
    basculerAnonymise,
    basculerPseudoOccurrence,
  } = annotationsEntretien

  // --- État de persistance de l'entretien ouvert ---
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
        pluginMenuContexte(entretien, annotationsEntretien.ouvrirMenuContexte),
        pluginCommentairesMarge(entretien, editerCommentaire),
      ]
    },
  })
  // Le double appui sur Espace contrôle la lecture sans ajouter de texte.
  let derniereEspace = 0
  const doubleAlt = creerDetectionDoubleAlt()
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
      handleDOMEvents: {
        blur: () => {
          derniereEspace = 0
          doubleAlt.reinitialiser()
          return false
        },
      },
      // Les raccourcis de lecture ne s'appliquent que dans le texte.
      // Pour le double Espace, la première espace insérée est retirée.
      handleKeyDown: (view, event) => {
        const decalage = doubleAlt.appui(event)
        if (estToucheAlt(event)) {
          derniereEspace = 0
          if (decalage !== null) deps.decalerLecture?.(decalage)
          // Empêche Alt d'activer le menu et de sortir le clavier du texte.
          return true
        }
        // Toute autre touche « coupe » la séquence : seules DEUX espaces
        // consécutives (rien entre elles) comptent, jamais deux espaces
        // rapprochées dans le temps mais séparées par de la frappe.
        if (event.key !== ' ') {
          derniereEspace = 0
          return false
        }
        const now = Date.now()
        const rapprochee = now - derniereEspace < SEUIL_DOUBLE_APPUI
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
      selectionPassage.value = selectionPassageCourante()
      // Boîte recherche/remplacement ouverte : les occurrences suivent le texte.
      if (transaction.docChanged) recherche.surDocumentModifie()
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
      locuteursEntretien.mettreAJourSelection(ed.state.selection.empty)
      anonymisationEntretien.mettreAJourSelection(ed)
      selectionPassage.value = selectionPassageCourante()
      rafraichirBarreTour()
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

  // --- Projections lisibles du modèle (requête Extraits + journal) ---
  const extraits = ref<Extrait[]>([])
  /** Résumé thématique LIVE de l'entretien ouvert (calque de la bande du lecteur) :
   *  recalculé avec les autres projections — même requête pure que les cartes
   *  Corpus, sur le modèle en session au lieu du disque. */
  const resumeOuvert = ref<SegmentThematique[]>([])
  const blocsParole = shallowRef<BlocParole[]>([])
  /** Tour affiché dans la barre au-dessus du panneau d'onglets (null : entretien vide). */
  const barreTour = ref<BarreTour | null>(null)
  /** Tour choisi à la main (flèches) ou suivi depuis le curseur, identifié par son premier bloc. */
  let tourAffiche: number | null = null
  /** Tour où se trouvait le curseur à la dernière mise à jour : seul un CHANGEMENT de tour le déplace. */
  let tourCurseurPrec: number | null = null
  let entretienBarre: string | null = null

  /** Tours du document et le tour contenant le curseur, pour la barre. */
  function analyserTours(): { tours: TourBarre[]; tourCurseur: number | null } {
    const ed = editor.value
    if (!ed) return { tours: [], tourCurseur: null }
    const blocs: BlocHorodatage[] = []
    const offsets: number[] = []
    ed.state.doc.forEach((node, offset) => {
      if (node.type.name !== 'paragraph') return
      blocs.push({ pos: offset + 1, longueur: node.content.size, loc: (node.attrs.loc ?? null) as number | null })
      offsets.push(offset)
    })
    const ancres = entretien.ancres
    const tours: TourBarre[] = toursHorodates(blocs, ancres).map((t) => ({
      posBloc: offsets[t.premierBloc],
      loc: blocs[t.premierBloc].loc,
      bornes: bornesTour(t, ancres),
      premierBloc: t.premierBloc,
      dernierBloc: t.dernierBloc,
      premiereAncre: t.premiereAncre,
      derniereAncre: t.derniereAncre,
    }))
    // Bloc du curseur : le dernier bloc qui commence avant lui.
    const curseur = ed.state.selection.from
    let bloc = -1
    offsets.forEach((offset, i) => {
      if (offset < curseur) bloc = i
    })
    const tour = tours.find((t) => bloc >= t.premierBloc && bloc <= t.dernierBloc)
    return { tours, tourCurseur: tour?.posBloc ?? null }
  }

  /** Couleur du locuteur d'un tour (celle des libellés et de la barre). */
  function couleurDeTour(loc: number | null): string {
    const interviewer = !!locuteurs.value.find((l) => l.index === loc)?.interviewer
    return libelleGouttiere(locuteurs.value, loc, interviewer).couleur
  }

  /** Recalcule la barre : suit le curseur quand il change de tour, sinon garde le tour choisi. */
  function rafraichirBarreTour() {
    const { tours, tourCurseur } = analyserTours()
    if (entretienBarre !== ouvertId.value) {
      // Le chargement pose le curseur en fin de texte : il ne doit pas choisir le tour affiché.
      entretienBarre = ouvertId.value
      tourAffiche = null
      tourCurseurPrec = tourCurseur
    }
    if (tours.length === 0) {
      barreTour.value = null
      tourAffiche = null
      return
    }
    if (tourCurseur !== tourCurseurPrec) {
      tourCurseurPrec = tourCurseur
      if (tourCurseur != null) tourAffiche = tourCurseur
    }
    if (tourAffiche == null || !tours.some((t) => t.posBloc === tourAffiche)) tourAffiche = tours[0].posBloc
    const rang = tours.findIndex((t) => t.posBloc === tourAffiche)
    const t = tours[rang]
    const interviewer = !!locuteurs.value.find((l) => l.index === t.loc)?.interviewer
    barreTour.value = {
      posBloc: t.posBloc,
      nom: nomDeLocuteur(locuteurs.value, t.loc) || 'Tour sans locuteur',
      couleur: libelleGouttiere(locuteurs.value, t.loc, interviewer).couleur,
      bornes: t.bornes,
      rang: rang + 1,
      total: tours.length,
    }
  }

  /** Passe au tour précédent ou suivant (flèches de la barre) sans déplacer le curseur. */
  function allerTourVoisin(sens: 1 | -1) {
    const { tours } = analyserTours()
    const rang = tours.findIndex((t) => t.posBloc === tourAffiche)
    const voisin = tours[rang + sens]
    if (!voisin) return
    tourAffiche = voisin.posBloc
    rafraichirBarreTour()
  }

  function rafraichir() {
    rafraichirBarreTour()
    rafraichirExtraits()
    rafraichirJournal() // l'annulabilité dépend du doc et des annotations
    anonymisationEntretien.rafraichirLignesAnon()
    const ed = editor.value
    resumeOuvert.value = ed
      ? resumeThematique({ corpsTexte: ed.getJSON(), annotations: entretien.annotations })
      : []
    const blocs: BlocParole[] = []
    ed?.state.doc.forEach((noeud, offset) => {
      if (noeud.type.name === 'paragraph') {
        blocs.push({ pos: offset + 1, longueur: noeud.content.size, texte: noeud.textBetween(0, noeud.content.size, ' ', ' '), loc: noeud.attrs.loc ?? null })
      }
    })
    blocsParole.value = blocs
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
  const { majPlageLue, eteindre: eteindrePlageLue, allerAuTexte, tempsAuTexte, tempsDuBloc, oublierProjection } =
    useSynchroAudio({ editor, ancres: entretien.ancres })

  // --- Horodatage d'un tour : lecture et modification des temps de ses ancres ---
  function tourAuBloc(posBloc: number) {
    const ed = editor.value
    if (!ed) return null
    const blocs: BlocHorodatage[] = []
    const offsets: number[] = []
    ed.state.doc.forEach((node, offset) => {
      if (node.type.name !== 'paragraph') return
      blocs.push({ pos: offset + 1, longueur: node.content.size, loc: (node.attrs.loc ?? null) as number | null })
      offsets.push(offset)
    })
    const tour = toursHorodates(blocs, entretien.ancres).find((t) => offsets[t.premierBloc] === posBloc)
    return tour ? { tour, loc: blocs[tour.premierBloc].loc } : null
  }

  /** Ce que la fenêtre d'horodatage affiche pour le tour qui commence au bloc `posBloc`. */
  /** Début du dernier passage du tour qui a du texte (null s'il n'en a pas). */
  function debutDernierPassage(tour: TourBarre): number | null {
    const ed = editor.value
    if (!ed) return null
    const ancres = entretien.ancres
    for (let i = tour.derniereAncre - 1; i >= tour.premiereAncre; i--) {
      if (ed.state.doc.textBetween(ancres[i].pos, ancres[i + 1].pos, ' ').trim()) return ancres[i].t
    }
    return null
  }

  function lireHorodatageTour(posBloc: number): HorodatageTour | null {
    const ed = editor.value
    const trouve = tourAuBloc(posBloc)
    if (!ed || !trouve) return null
    const { tour, loc } = trouve
    const ancres = entretien.ancres
    const temps: number[] = []
    const passages: HorodatageTour['passages'] = []
    if (tour.derniereAncre - tour.premiereAncre >= 1) {
      for (let i = tour.premiereAncre; i <= tour.derniereAncre; i++) temps.push(ancres[i].t)
      for (let i = tour.premiereAncre; i < tour.derniereAncre; i++) {
        const texte = ed.state.doc.textBetween(ancres[i].pos, ancres[i + 1].pos, ' ').trim()
        if (texte) passages.push({ de: i - tour.premiereAncre, a: i + 1 - tour.premiereAncre, texte })
      }
    }
    const { tours } = analyserTours()
    const rang = tours.findIndex((t) => t.posBloc === posBloc)
    const apres = rang >= 0 ? tours[rang + 1] : undefined
    const avant = rang > 0 ? tours[rang - 1] : undefined
    const horodatageApres = !!apres && apres.derniereAncre - apres.premiereAncre >= 1
    return {
      nom: nomDeLocuteur(locuteurs.value, loc) || 'Tour sans locuteur',
      temps,
      passages,
      texte: ed.state.doc.textBetween(tour.debut, tour.fin, ' ').trim(),
      min: tour.premiereAncre > 0 ? ancres[tour.premiereAncre - 1].t : 0,
      max: tour.derniereAncre + 1 < ancres.length ? ancres[tour.derniereAncre + 1].t : null,
      repere: tempsDuBloc(posBloc),
      couleur: couleurDeTour(loc),
      precedent: avant
        ? {
            posBloc: avant.posBloc,
            nom: nomDeLocuteur(locuteurs.value, avant.loc) || 'Tour sans locuteur',
            couleur: couleurDeTour(avant.loc),
            debut: avant.derniereAncre - avant.premiereAncre >= 1 ? ancres[avant.premiereAncre].t : null,
            fin: avant.derniereAncre - avant.premiereAncre >= 1 ? ancres[avant.derniereAncre].t : null,
            debutDernierPassage:
              avant.derniereAncre - avant.premiereAncre >= 1
                ? (debutDernierPassage(avant) ?? ancres[avant.premiereAncre].t)
                : null,
          }
        : null,
      suivant: apres
        ? {
            posBloc: apres.posBloc,
            nom: nomDeLocuteur(locuteurs.value, apres.loc) || 'Tour sans locuteur',
            couleur: couleurDeTour(apres.loc),
            debut: horodatageApres ? ancres[apres.premiereAncre].t : null,
            fin: horodatageApres ? ancres[apres.derniereAncre].t : null,
            indexAncre: horodatageApres ? apres.premiereAncre : -1,
          }
        : null,
      navigation: {
        rang: rang + 1,
        total: tours.length,
        precedent: avant?.posBloc ?? null,
        suivant: apres?.posBloc ?? null,
      },
    }
  }

  /**
   *  Enregistre les temps du tour. Sans horodatage préalable, `temps` = [début, fin] :
   *  deux ancres sont posées au début et à la fin du texte du tour.
   */
  function enregistrerHorodatageTour(
    posBloc: number,
    temps: number[],
    debutSuivant: number | null = null,
    finPrecedent: number | null = null,
  ): boolean {
    const trouve = tourAuBloc(posBloc)
    if (!trouve) return false
    const { tour } = trouve
    const ancres = entretien.ancres
    // Le début du tour suivant est écrit avant les ancres du tour : leur insertion ne le décale pas.
    if (debutSuivant != null) {
      const { tours } = analyserTours()
      const apres = tours[tours.findIndex((t) => t.posBloc === posBloc) + 1]
      if (apres && apres.derniereAncre - apres.premiereAncre >= 1) ancres[apres.premiereAncre].t = debutSuivant
    }
    // De même pour la fin du tour précédent, qui est l'ancre juste avant le début de ce tour.
    if (finPrecedent != null) {
      const { tours } = analyserTours()
      const avant = tours[tours.findIndex((t) => t.posBloc === posBloc) - 1]
      if (avant && avant.derniereAncre - avant.premiereAncre >= 1) ancres[avant.derniereAncre].t = finPrecedent
    }
    const nb = tour.derniereAncre - tour.premiereAncre + 1
    if (nb >= 2) {
      if (temps.length !== nb) return false
      temps.forEach((t, k) => {
        ancres[tour.premiereAncre + k].t = t
      })
    } else {
      if (temps.length !== 2) return false
      ancres.splice(
        tour.premiereAncre,
        Math.max(0, nb),
        { pos: tour.debut, t: temps[0] },
        { pos: tour.fin, t: temps[1] },
      )
    }
    oublierProjection()
    rafraichir()
    rafraichirGouttiere()
    planifierSauvegarde()
    return true
  }

  /**
   *  Modifie en place le début et la fin d'un tour déjà horodaté (champs de la barre).
   *  Rend null si c'est enregistré, sinon le message à présenter : le tour ne doit pas
   *  chevaucher le tour précédent ou le tour suivant, ni un passage sortir de ses bornes.
   */
  function enregistrerTempsTour(posBloc: number, debut: number, fin: number): string | null {
    if (!(debut < fin)) return 'Le début doit être avant la fin du tour.'
    const { tours } = analyserTours()
    const rang = tours.findIndex((t) => t.posBloc === posBloc)
    if (rang < 0) return 'Ce tour n’est plus dans l’entretien.'
    const tour = tours[rang]
    const ancres = entretien.ancres
    if (tour.derniereAncre - tour.premiereAncre < 1) {
      return 'Ce tour n’a pas encore de temps : utilisez « Affiner… » pour le régler.'
    }
    const min = tour.premiereAncre > 0 ? ancres[tour.premiereAncre - 1].t : 0
    const max = tour.derniereAncre + 1 < ancres.length ? ancres[tour.derniereAncre + 1].t : Number.POSITIVE_INFINITY
    if (debut < min) {
      return `Le début chevauche le tour précédent : il doit être après ${formaterTemps(min)}.`
    }
    if (fin > max) {
      return `La fin chevauche le tour suivant : elle doit être avant ${formaterTemps(max)}.`
    }
    // Une ancre intérieure qui touche du texte ne doit pas sortir du tour. Les ancres
    // restées sans texte (passage supprimé) sont simplement ramenées dans les bornes.
    const ed = editor.value
    const texteAvant = (i: number) =>
      ed ? ed.state.doc.textBetween(ancres[i - 1].pos, ancres[i].pos, ' ').trim() !== '' : false
    const texteApres = (i: number) =>
      ed ? ed.state.doc.textBetween(ancres[i].pos, ancres[i + 1].pos, ' ').trim() !== '' : false
    for (let i = tour.premiereAncre + 1; i < tour.derniereAncre; i++) {
      if (ancres[i].t >= debut && ancres[i].t <= fin) continue
      if (texteAvant(i) || texteApres(i)) {
        return `Un passage du tour sortirait des nouvelles bornes (${formaterTemps(ancres[i].t)}).`
      }
    }
    for (let i = tour.premiereAncre + 1; i < tour.derniereAncre; i++) {
      ancres[i].t = Math.min(fin, Math.max(debut, ancres[i].t))
    }
    ancres[tour.premiereAncre].t = debut
    ancres[tour.derniereAncre].t = fin
    oublierProjection()
    rafraichir()
    rafraichirGouttiere()
    planifierSauvegarde()
    return null
  }

  /** Pendant la lecture audio, la barre suit le tour où se trouve la lecture. */
  function suivreTempsLecture(t: number) {
    const { tours } = analyserTours()
    const tour = tours.find((x) => x.bornes && t >= x.bornes.debut && t < x.bornes.fin)
    if (!tour || tour.posBloc === tourAffiche) return
    tourAffiche = tour.posBloc
    rafraichirBarreTour()
  }

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
  /** Annule le debounce et préserve l'état courant hors du miroir publiable. */
  async function preserverEtAnnulerSauvegarde(): Promise<boolean> {
    clearTimeout(tid)
    tid = undefined
    const id = ouvertId.value
    const payload = id && editor.value ? payloadCourant() : null
    await sauvegardes
    if (!id || !payload) return true
    return window.sonal.corpus.preserverEntretienDegrade(id, payload)
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
      reperesPassages: entretien.reperesPassages.map((repere) => ({ ...repere })),
      // Clone PLAT : locuteurs.value est un proxy réactif Vue, non clonable par l'IPC
      // Electron (structured clone) → on l'aplatit avant l'envoi.
      locuteurs: JSON.parse(JSON.stringify(locuteurs.value)),
      meta: JSON.parse(JSON.stringify(meta)),
      // Même raison : brouillonsAnon.value est un proxy réactif → aplatir.
      brouillonsAnon: JSON.parse(JSON.stringify(brouillonsAnon.value)),
      pseudosDeclares: JSON.parse(JSON.stringify(pseudosDeclares.value)),
      definitionsAnonLocales: JSON.parse(JSON.stringify(definitionsAnonLocales.value)),
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
    recherche.reinitialiser()
    // Ordre : vider le modèle AVANT de remplacer le doc (le remap ne mappe rien),
    // puis recharger le doc, puis reposer les annotations (positions valides par
    // construction contre ce doc), puis redessiner.
    entretien.annotations.splice(0, entretien.annotations.length)
    entretien.ancres.splice(0, entretien.ancres.length)
    entretien.reperesPassages.splice(0, entretien.reperesPassages.length)
    locuteurs.value = res.data.locuteurs
    locuteursEntretien.reinitialiser()
    ed.commands.setContent(res.data.corpsTexte as Record<string, unknown>, { emitUpdate: false })
    for (const a of res.data.annotations) entretien.annotations.push(a)
    for (const a of res.data.ancres ?? []) entretien.ancres.push(a)
    for (const repere of res.data.reperesPassages ?? []) entretien.reperesPassages.push(repere)
    meta.valeursGen = { ...res.data.meta.valeursGen }
    meta.audioRef = res.data.meta.audioRef
    meta.audioDistant = res.data.meta.audioDistant ?? null
    anonymisationEntretien.reinitialiser()
    anonymisationEntretien.charger(res.data.brouillonsAnon, res.data.pseudosDeclares, res.data.definitionsAnonLocales)
    notesEntretien.charger(res.data.notes)
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
    reinitialiserJournal() // volatil PAR entretien
    // Le surlignage audio ne survit pas au changement de doc.
    eteindrePlageLue()
    rafraichir()
    rafraichirDecorations()
    rafraichirGouttiere()
    etatSauvegarde.value = 'à jour'
    annotationsEntretien.reinitialiser()
    selectionPassage.value = selectionPassageCourante()
    return true
  }
  /** Réinitialise à vide (changement de corpus / suppression de l'entretien ouvert). */
  function reinitialiser() {
    ouvertId.value = null
    selectionPassage.value = null
    recherche.reinitialiser()
    locuteursEntretien.reinitialiser()
    verrouAutrui.value = null
    reinitialiserJournal()
    entretien.annotations.splice(0, entretien.annotations.length)
    entretien.ancres.splice(0, entretien.ancres.length)
    entretien.reperesPassages.splice(0, entretien.reperesPassages.length)
    editor.value?.commands.setContent('<p></p>', { emitUpdate: false })
    refusFormat.value = null
    eteindrePlageLue()
    anonymisationEntretien.reinitialiser()
    notesEntretien.reinitialiser()
    annotationsEntretien.reinitialiser()
    rafraichir()
    rafraichirDecorations()
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
    reperesPassages: number
    locuteurs: number
    valeurs: number
  }> {
    const courant: EntretienFichier = {
      formatVersion: FORMAT_VERSION,
      lastModified: new Date().toISOString(),
      corpsTexte: editor.value ? editor.value.getJSON() : {},
      annotations: JSON.parse(JSON.stringify(entretien.annotations)),
      ancres: [...entretien.ancres],
      reperesPassages: JSON.parse(JSON.stringify(entretien.reperesPassages)),
      locuteurs: JSON.parse(JSON.stringify(locuteurs.value)),
      meta: {
        valeursGen: { ...meta.valeursGen },
        audioRef: meta.audioRef,
        audioDistant: meta.audioDistant ?? undefined,
      },
      brouillonsAnon: JSON.parse(JSON.stringify(brouillonsAnon.value)),
      pseudosDeclares: JSON.parse(JSON.stringify(pseudosDeclares.value)),
      definitionsAnonLocales: JSON.parse(JSON.stringify(definitionsAnonLocales.value)),
    }
    const { fusion, ajouts } = fusionnerEntretiens(courant, copie)
    entretien.annotations = fusion.annotations
    entretien.ancres = fusion.ancres
    entretien.reperesPassages = fusion.reperesPassages ?? []
    locuteurs.value = fusion.locuteurs
    Object.assign(meta.valeursGen, fusion.meta.valeursGen)
    brouillonsAnon.value = fusion.brouillonsAnon ?? []
    pseudosDeclares.value = fusion.pseudosDeclares ?? {}
    definitionsAnonLocales.value = fusion.definitionsAnonLocales ?? []
    rafraichir()
    rafraichirDecorations()
    planifierSauvegarde()
    return ajouts
  }

  /** Décrit la sélection libre courante sans créer de repère. */
  function selectionPassageCourante(): {
    entretienId: string
    from: number
    to: number
    texte: string
  } | null {
    const editeur = editor.value
    if (!editeur || !ouvertId.value || editeur.state.selection.empty) return null
    const plage = snapToWord(
      editeur.state,
      editeur.state.selection.from,
      editeur.state.selection.to,
    )
    if (plage.from >= plage.to) return null
    return {
      entretienId: ouvertId.value,
      ...plage,
      texte: editeur.state.doc.textBetween(plage.from, plage.to, ' '),
    }
  }

  /** Crée puis enregistre un repère autonome sur la sélection libre courante. */
  async function enregistrerRepereSelection(attendu?: {
    entretienId: string
    from: number
    to: number
  }): Promise<{ id: string; from: number; to: number }> {
    const editeur = editor.value
    if (!editeur || !ouvertId.value) throw new Error("Aucun entretien n'est ouvert.")
    if (!editeur.isEditable) throw new Error("L'entretien est ouvert en lecture seule.")
    const selection = selectionPassageCourante()
    if (!selection) throw new Error('Sélectionnez un passage avant de le référencer.')
    if (attendu && (attendu.entretienId !== selection.entretienId
      || attendu.from !== selection.from || attendu.to !== selection.to)) {
      throw new Error('La sélection a changé. Sélectionnez à nouveau le passage.')
    }
    const repere = creerReperePassage(
      entretien.reperesPassages,
      selection,
      () => `rep-${globalThis.crypto.randomUUID()}`,
    )
    if (!repere) throw new Error('La sélection ne contient aucun passage.')
    planifierSauvegarde()
    await sauver()
    return { ...repere }
  }

  /** Instantané cohérent de la source ouverte pour les projections de passages. */
  function donneesSourceOuverte(): EntretienFichier | null {
    if (!ouvertId.value || !editor.value) return null
    return {
      formatVersion: FORMAT_VERSION,
      lastModified: new Date().toISOString(),
      ...payloadCourant(),
    }
  }

  /** Données brutes de l'entretien ouvert (pour l'export .sonal, assemblé par l'App). */
  function donneesExport(): {
    corpsTexte: unknown
    annotations: Annotation[]
    ancres: Ancre[]
    locuteurs: Locuteur[]
    meta: { valeursGen: Record<string, string>; audioRef: string | null }
    legacy: LegacyBlobs
    brouillonsAnon: BrouillonAnon[]
    definitionsAnonLocales: import('../../shared/entretien/anon/definitionsLocales').DefinitionAnonLocale[]
    notes: Note[]
    reperesPassages: ReperePassage[]
  } {
    return {
      corpsTexte: editor.value!.getJSON(),
      annotations: entretien.annotations.map((a) => ({ ...a })),
      ancres: entretien.ancres.map((a) => ({ ...a })),
      locuteurs: locuteurs.value,
      meta: { valeursGen: meta.valeursGen, audioRef: meta.audioRef },
      legacy: legacyCourant.value,
      brouillonsAnon: brouillonsAnon.value,
      definitionsAnonLocales: definitionsAnonLocales.value,
      notes: notes.value,
      reperesPassages: entretien.reperesPassages.map((repere) => ({ ...repere })),
    }
  }

  onBeforeUnmount(() => {
    clearTimeout(tid)
    editor.value?.destroy()
  })

  return {
    // état / modèle
    entretien,
    pseudonymisationUtilisee,
    applicationsAnon,
    locuteurs,
    blocsParole,
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
    ouvrirRecherche,
    fermerRecherche,
    naviguerRecherche,
    allerOccurrence,
    remplacerOccurrenceCourante,
    remplacerTout,
    brouillonsAnon,
    notes,
    brouillonNote,
    brouillonEditionNote,
    selectionVide,
    ouvertId,
    refusFormat,
    etatSauvegarde,
    editor,
    tourHorodatage,
    barreTour,
    allerTourVoisin,
    lireHorodatageTour,
    enregistrerHorodatageTour,
    enregistrerTempsTour,
    suivreTempsLecture,
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
    validerEditionNote,
    annulerNote,
    agrandirNote,
    reduireNote,
    fermerNotePanneau,
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
    copierSelectionMenu,
    editerCommentaire,
    fermerEditionCommentaire,
    validerCommentaire,
    supprimerCommentaire,
    retirerCodageMenu,
    basculerException,
    basculerAnonymise,
    basculerPseudoOccurrence,
    dialoguePorteeCorpus,
    confirmationCouverture,
    accepterCouverture,
    refuserCouverture,
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
    preserverEtAnnulerSauvegarde,
    annulerEtAttendreSauvegarde,
    donneesExport,
    selectionPassageCourante,
    selectionPassage,
    enregistrerRepereSelection,
    donneesSourceOuverte,
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
