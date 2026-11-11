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
import { nomDeLocuteur } from '../../shared/entretien/locuteurs'
import { estOrpheline, type Annotation } from '../../shared/entretien/annotation'
import type { Entretien } from '../../shared/entretien/entretien'
import type { Ancre } from '../../shared/entretien/audio'
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
  /** Déplace la lecture en secondes ; renvoie false si aucun média n'est chargé. */
  decalerLecture?: (secondes: number) => boolean
  /** Règles corpus (`corpus.json.reglesAnon`) — injectées par l'orchestrateur
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
  /** Priorité de validation définie dans `corpus.json.paramsAnon` : la portée
   *  qu'applique ENTRÉE sur une ligne du tableau ; Maj+Entrée fait l'inverse. */
  prioriteAnon: () => 'corpus' | 'entretien'
  /** Réglage mots de liaison (corpus.json.paramsAnon.motsLiaison) :
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
    remplacerOccurrenceCourante,
    remplacerTout,
  } = recherche
  const anonymisationEntretien = useAnonymisationEntretien({
    entretien,
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
  } = anonymisationEntretien

  // --- Journal d'actions : volatil (session), actions de modèle seules ---
  const journalEntretien = useJournalEntretien({
    entretien,
    locuteurs,
    notes,
    lireValeursGen: () => meta.valeursGen,
    lireEditeur: () => editor.value ?? null,
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
  function rafraichir() {
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
