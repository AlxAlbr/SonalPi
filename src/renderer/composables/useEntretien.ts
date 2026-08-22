import { ref, reactive, onBeforeUnmount } from 'vue'
import { Extension } from '@tiptap/core'
import { useEditor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { BlocAttributs } from '../editor/schema'
import { pluginRemap } from '../editor/remap'
import { pluginDecorations, decorationsPluginKey } from '../editor/decorations'
import { pluginGouttiere, gouttierePluginKey } from '../editor/locuteursGutter'
import { pluginLecture } from '../editor/lecture'
import { pluginMenuAnon, type CibleMenuAnon } from '../editor/menuContexteAnon'
import { snapToWord, snapBornes } from '../editor/snap'
import { attribuerSelectionTr } from '../editor/attribution'
import { aplatir, occurrencesDe, plageVersPM, instructionsValiderAnon } from '../../shared/entretien/anon/anonymisation'
import { scinderPseudos } from '../../shared/entretien/anon/pseudos'
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
import { ajouterCodage, retirerAnnotation, trouverCodage, type Entretien } from '../../shared/entretien/entretien'
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
import type { EntretienFichier, Locuteur, SegmentThematique, BrouillonAnon, RegleAnon } from '../../shared/format'
import { FORMAT_VERSION } from '../../shared/format'
import { fusionnerEntretiens, corpsIdentiques } from '../../shared/entretien/fusion'
import { detecterDivergencesPortee } from '../../shared/entretien/anon/reconciliation'
import type { LegacyBlobs } from '../import/importSonal'

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
  apresSauvegarde: () => Promise<void>
  codeExtraits: () => string
  nomCode: (code: string) => string
  libelleValeur: (idVar: string, idMod: string) => string
  /** Clic sur la gouttière d'un bloc → l'orchestrateur cale l'audio au
   *  début du tour (le scope entretien ne connaît pas le lecteur). */
  clicTour?: (posBloc: number) => void
  /** Clic DANS le texte → l'orchestrateur cale l'audio au temps interpolé
   *  à cet endroit précis (comme SonalPi — la barre suit, play reprend là). */
  clicTexte?: (pos: number) => void
  /** Double-espace dans le texte = play/pause (parité SonalPi). Renvoie `true`
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
  /** Corpus distant : lecture seule des DÉFINITIONS (flux B, grisage permanent
   *  avant E3). L'éditeur suit `entretienEditable`, pas ce drapeau. */
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
  const meta = reactive<{ valeursGen: Record<string, string>; audioRef: string | null }>({
    valeursGen: {},
    audioRef: null,
  })
  // L'entretien s'ouvre sur l'ACCUEIL par défaut : il présente les conseils et
  // la vue d'ensemble des autres onglets (icone + titre) avant de commencer.
  const ongletDroite = ref<'maison' | 'themes' | 'locuteurs' | 'donnees' | 'journal' | 'anon'>('maison')
  const hintCodage = ref<string | null>(null)
  // Sélection courante pour l'onglet Anon (texte + plage snappée au mot) :
  // c'est elle qui peuple le « Nom » de la ligne de saisie. REQUÊTE, jamais
  // stockée — recalculée au moindre déplacement du curseur.
  const selectionAnon = ref<{ texte: string; from: number; to: number } | null>(null)
  const hintAnon = ref<string | null>(null)
  const lignesAnon = ref<LigneAnon[]>([])
  // Brouillons d'anonymisation entretien-locaux (pas des règles) : entités
  // saisies sans occurrence posée. Persistés dans entretiens/<id>.json.brouillonsAnon.
  const brouillonsAnon = ref<BrouillonAnon[]>([])
  // Mémoire fichier de l'ensemble multi-pseudo par entité (clé `cleEntite`),
  // quand une entité standalone en déclare ≥2 (3b multi-pseudo). Persistée dans
  // entretiens/<id>.json.pseudosDeclares (ni une règle, ni partagé).
  const pseudosDeclares = ref<Record<string, string[]>>({})
  /** Menu contextuel d'une occurrence anon (clic droit, §2.3) — requête
   *  VOLATILE : cible (coordonnées écran + occurrence) tant que le menu est
   *  ouvert, sinon null. Le composant MenuContexteAnon le consomme. */
  const menuContextuelAnon = ref<{
    x: number
    y: number
    id: string
    etat: 'anonymise' | 'exception'
    entite: string
    /** Autres pseudos autorisés par la règle (multi-pseudo >1), hors le pseudo
     *  courant, pour l'occurrence — vide si mono-pseudo/standalone. */
    pseudosAutres: string[]
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
  /** Vrai dès que le TEXTE de l'entretien ouvert a été édité depuis son
   *  ouverture (frappe/suppression — les attributs, ex. locuteur, ne comptent
   *  pas : `getText()` ne change pas). Observé par le pas-à-pas (étape
   *  « Écouter et corriger la transcription »). Volatil : repart à faux à
   *  chaque ouverture/réinitialisation d'entretien. */
  const texteModifie = ref(false)
  let texteInitial = ''

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
        pluginDecorations(entretien, deps.couleurTrait, deps.tailleTrait),
        pluginGouttiere(() => locuteurs.value, deps.clicTour),
        pluginLecture(),
        pluginMenuAnon(entretien, ouvrirMenuAnon),
      ]
    },
  })
  // Double-espace = play/pause (parité SonalPi) : dans le texte, une espace tape
  // un caractère — c'est la 2ᵉ espace rapprochée qui sert de commande de lecture.
  const SEUIL_DOUBLE_ESPACE = 300 // ms
  let derniereEspace = 0
  /** Verrou tenu par autrui sur l'entretien OUVERT (null sinon) — alimente le
   *  bandeau « tenu par X depuis HH:MM » (plan §4.1/§10). */
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
    onUpdate: ({ editor: ed, transaction }) => {
      // Texte réellement ÉDITÉ depuis l'ouverture → observable pour le pas-à-pas
      // (l'étape « Écouter et corriger la transcription »). On compare à l'état
      // INITIAL (pas au précédent) mais on REMET à faux quand le texte redevient
      // identique à l'ouverture : le double-espace lecture/pause insère PUIS
      // retire une espace au même endroit (une seule « frappe ») — le texte
      // revient à son état d'ouverture, donc une simple commande de lecture ne
      // doit PAS compter comme une correction. Seule une modification qui RESTE
      // (différente de l'initial) valide l'étape.
      // `texteInitial !== ''` : un entretien vide (créé sans texte) ne se
      // « modifie » pas au premier caractère tapé.
      if (!chargement && ouvertId.value) {
        texteModifie.value = texteInitial !== '' && ed.getText() !== texteInitial
      }
      rafraichir()
      // Seule une transaction qui CHANGE LE DOCUMENT programme une écriture :
      // `setEditable` (passage en lecture seule à l'ouverture sous verrou
      // d'autrui) émet une transaction SANS docChanged — si on programmmait
      // quand même la sauvegarde, elle partait 600 ms plus tard, la garde du
      // main la rejetait (« verrou non tenu par cette session ») et la bannière
      // globale d'erreur restait affichée pendant toute la suite du scénario
      // (attrapé par la démo visible E4 ; visible seulement aux rythmes lents,
      // la pause efficace s'achève avant l'échéance du debounce).
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
    lignesAnon.value = lignesAnonUnifiees(
      brouillonsAnon.value,
      occurrences,
      (f, t) => ed.state.doc.textBetween(f, t, ' '),
      pseudosDeclares.value,
      deps.reglesAnon(),
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
  function planifierSauvegarde() {
    if (chargement || !ouvertId.value) return
    etatSauvegarde.value = 'modifié'
    clearTimeout(tid)
    tid = setTimeout(sauver, 600)
  }
  async function sauver() {
    if (!ouvertId.value || !editor.value) return
    etatSauvegarde.value = 'sauvegarde…'
    await window.sonal.corpus.ecrireEntretien(ouvertId.value, payloadCourant())
    etatSauvegarde.value = 'à jour'
    await deps.apresSauvegarde() // les compteurs d'usage corpus reflètent l'état sauvé
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
      // legacyCourant est un ref → .value est un proxy réactif, non clonable par
      // l'IPC (structured clone) : on l'aplatit aussi.
      legacy: JSON.parse(JSON.stringify(legacyCourant.value)),
    }
  }

  // --- Cycle de vie de l'entretien ouvert (charger / réinitialiser) ---
  /** Ouvre un entretien : lit le disque, peuple le modèle + l'éditeur. Renvoie
   *  false (+ pose `refusFormat`) si version inconnue / absent (aucune écriture). */
  async function ouvrir(id: string): Promise<boolean> {
    const ed = editor.value
    if (!ed) return false
    const res = await window.sonal.corpus.lireEntretien(id)
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
    texteInitial = ed.getText()
    texteModifie.value = false
    for (const a of res.data.annotations) entretien.annotations.push(a)
    for (const a of res.data.ancres ?? []) entretien.ancres.push(a)
    meta.valeursGen = { ...res.data.meta.valeursGen }
    meta.audioRef = res.data.meta.audioRef
    brouillonsAnon.value = res.data.brouillonsAnon ?? []
    pseudosDeclares.value = { ...(res.data.pseudosDeclares ?? {}) }
    legacyCourant.value = (res.data.legacy as LegacyBlobs | undefined) ?? { tabAnon: null, notes: '' }
    ouvertId.value = id
    chargement = false
    // Éditable ssi le contenu nous appartient : en corpus distant,
    // lireEntretien a tenté le verrou — un `verrouTenuParAutrui` présent =
    // refus = lecture seule avec détenteur affiché (plan §4.1).
    verrouAutrui.value = res.verrouTenuParAutrui ?? null
    editor.value?.setEditable(deps.entretienEditable ? deps.entretienEditable() : !deps.lectureSeule?.())
    journal.entrees.length = 0 // volatil PAR entretien
    // Le surlignage audio ne survit pas au changement de doc.
    eteindrePlageLue()
    rafraichir()
    rafraichirDecorations()
    rafraichirGouttiere()
    etatSauvegarde.value = 'à jour'
    fermerMenuAnon() // un menu ouvert pointait vers l'entretien précédent
    return true
  }
  /** Réinitialise à vide (changement de corpus / suppression de l'entretien ouvert). */
  function reinitialiser() {
    ouvertId.value = null
    verrouAutrui.value = null
    journal.entrees.length = 0
    entretien.annotations.splice(0, entretien.annotations.length)
    entretien.ancres.splice(0, entretien.ancres.length)
    editor.value?.commands.setContent('<p></p>', { emitUpdate: false })
    texteInitial = ''
    texteModifie.value = false
    refusFormat.value = null
    eteindrePlageLue()
    brouillonsAnon.value = []
    pseudosDeclares.value = {}
    selectionAnon.value = null
    hintAnon.value = null
    fermerMenuAnon()
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
  }
  function nouveauLocuteur() {
    ajouterLocuteur(locuteurs.value, 'Nouveau locuteur')
    rafraichirGouttiere()
    planifierSauvegarde()
  }
  /** (Dé)clare un locuteur INTERVIEWER : ses tours passent en italique (le
   *  pendant du « ? » SonalPi). Hors journal (comme + Locuteur) : l'inverse
   *  est le re-clic du même interrupteur. */
  function setInterviewer(index: number, actif: boolean) {
    const l = locuteurs.value.find((x) => x.index === index)
    if (!l || (l.interviewer ?? false) === actif) return
    l.interviewer = actif
    rafraichirGouttiere()
    planifierSauvegarde()
  }

  // --- Pseudonymisation du LIBELLÉ (étape 2, §3.3) : le pseudo est un champ du
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
  /** Décision persistée de pseudonymiser (✓ « confirme ») ou non (⊘ « refuse »)
   *  le libellé d'un locuteur — parité SonalPi `loc-anon` / `loc-suggere-refuse`.
   *  La décision n'a de sens qu'avec un pseudo posé (garde ci-dessous). */
  function setPseudoEtatLoc(index: number, etat: 'confirme' | 'refuse') {
    const l = locuteurs.value.find((x) => x.index === index)
    if (!l || !l.pseudo) return
    l.pseudoEtat = etat
    rafraichirGouttiere()
    planifierSauvegarde()
  }
  /** Bascule la décision de pseudonymisation d'un locuteur en un seul bouton :
   *  ✓ (confirme) ⟷ ⊘ (refuse). Un pseudo posé sans décision vaut « confirme »
   *  (pseudonymisé), donc cliquer une 1re fois le passe en « refuse ». */
  function basculerPseudoEtatLoc(index: number) {
    const l = locuteurs.value.find((x) => x.index === index)
    if (!l || !l.pseudo) return
    l.pseudoEtat = l.pseudoEtat === 'refuse' ? 'confirme' : 'refuse'
    rafraichirGouttiere()
    planifierSauvegarde()
  }
  /** Choisit la couleur du NOM d'un locuteur (tableau §3.3) : `couleur` posée,
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
    const tr = ed.state.tr
    ed.state.doc.forEach((node, offset) => {
      if (node.type.name === 'paragraph' && node.attrs.loc === index) {
        tr.setNodeMarkup(offset, undefined, { ...node.attrs, loc: null })
      }
    })
    if (tr.steps.length) ed.view.dispatch(tr)
    supprimerLocuteur(locuteurs.value, index)
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

  /** Une entité est-elle déjà présente dans le tableau (brouillon ou occurrence) ?
   *  Renvoie la cle de la ligne existante, ou null. Sert au composant pour
   *  décider, à la sélection : peupler la ligne de saisie ou scroller vers
   *  la ligne existante (pas de doublon). */
  function entiteExisteDeja(entite: string): string | null {
    const e = entite.trim()
    if (!e) return null
    const cle = cleEntite(e)
    if (trouverBrouillon(brouillonsAnon.value, e)) return cle
    const ed = editor.value
    if (ed) {
      for (const a of entretien.annotations) {
        if (a.type !== 'anon' || estOrpheline(a)) continue
        if (cleEntite(ed.state.doc.textBetween(a.from, a.to, ' ')) === cle) return cle
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
    const matches = occurrencesDe(t.texte, e)
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
    // Les instructions sont calculées PUR (anonymisation.ts §2.4) puis
    // APPLIQUÉES sur la table réactive : relabel des occurrences ANONYMISÉES
    // seules (les exceptions gardent état + pseudo-mémoire), poses bloquées
    // par une exception couvrante, absorption « la plus longue gagne » sur
    // l'anonymisé pur (intacts par rapport à v1).
    const instr = instructionsValiderAnon(
      entretien.annotations,
      matches,
      cle,
      applique,
      (f, t2) => ed.state.doc.textBetween(f, t2, ' '),
      genId,
    )
    for (const r of instr.relabel) {
      const a = entretien.annotations.find((x) => x.id === r.id)
      if (a) a.pseudo = r.pseudo
    }
    for (const id of instr.retirer) retirerAnnotation(entretien, id)
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
    planifierSauvegarde()
  }
  /** Retire toutes les occurrences d'une ligne (dé-barrer). */
  function supprimerAnon(occurrenceIds: string[]) {
    for (const id of occurrenceIds) retirerAnnotation(entretien, id)
    rafraichir()
    rafraichirDecorations()
    planifierSauvegarde()
  }

  /** Supprime une ligne entière : ses occurrences + son éventuel brouillon.
   *  Pour une ligne CORPUS, la règle liée n'est supprimée QUE si elle est
   *  isolée (aucun autre entretien n'y référence) — sinon BLOQUÉ + message. */
  async function supprimerLigneAnon(entite: string) {
    const cle = cleEntite(entite)
    const ligne = lignesAnon.value.find((l) => l.cle === cle)
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
          cleEntite(editor.value!.state.doc.textBetween(a.from, a.to, ' ')) === cle,
      )
      .map((a) => a.id)
    for (const id of ids) retirerAnnotation(entretien, id)
    retirerBrouillon(brouillonsAnon.value, entite)
    delete pseudosDeclares.value[cle]
    rafraichir()
    rafraichirDecorations()
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
        lineCle(a) === ligne.cle &&
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
      const regleId = existante ? existante.id : (await window.sonal.corpus.regleAnonCreer(ligne.entite, pseudosCible)).id
      await appliquerCorpus(ligne, regleId, cas, undefined)
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
        if (a.type === 'anon' && lineCle(a) === ligne.cle) {
          a.regle = regleId
          if (pseudoAppli && a.etat !== 'exception') a.pseudo = pseudoAppli
        }
      }
      delete pseudosDeclares.value[ligne.cle]
    }
    await deps.rafraichirReglesCorpus?.()
    rafraichir()
    rafraichirDecorations()
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

  /* ── Réconciliation I-POR-3 POST-PULL (plan-multiuser §4.8 point 3) ───────
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

  /* ── Fusion assistée §6 (copie de divergence → modèle ouvert) ────────────
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
      meta: { valeursGen: { ...meta.valeursGen }, audioRef: meta.audioRef },
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
    const matches = occurrencesDe(t.texte, ligne.entite)
      .map((pl) => plageVersPM(t, pl.from, pl.to))
      .filter((x): x is { from: number; to: number } => x !== null)
    const instr = instructionsValiderAnon(
      entretien.annotations,
      matches,
      ligne.cle,
      pseudo,
      (f, t2) => ed.state.doc.textBetween(f, t2, ' '),
      genId,
    )
    for (const r of instr.relabel) {
      const a = entretien.annotations.find((x) => x.id === r.id)
      if (a) { a.pseudo = r.pseudo; a.regle = regleId }
    }
    for (const id of instr.retirer) retirerAnnotation(entretien, id)
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
      if (a.type === 'anon' && lineCle(a) === ligne.cle) delete a.regle
    }
    if (!ailleurs) await window.sonal.corpus.regleAnonSupprimer(regleId)
    await deps.rafraichirReglesCorpus?.()
    rafraichir()
    rafraichirDecorations()
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
    planifierSauvegarde()
  }

  // --- Menu contextuel des occurrences (exceptions, §2.3) ---
  /** Ouvre le menu flottant sur une occurrence (appelé par le plugin
   *  `pluginMenuAnon` à chaque clic droit couvrant). L'occurrence est résolue
   *  par le plugin ; ici on ne fait que capturer la cible pour le composant. */
  function ouvrirMenuAnon(cible: CibleMenuAnon) {
    const a = cible.annotation
    const ed = editor.value
    // Le texte d'entité se lit sur le doc courant (les positions suivent le remap).
    const entite = ed ? ed.state.doc.textBetween(a.from, a.to, ' ') : ''
    // Multi-pseudo (3b) : les AUTRES pseudos autorisés pour CETTE occurrence.
    // Priorité à la règle (occurrence rule-backed, portée corpus) ; sinon à
    // l'ensemble déclaré au niveau fichier (`pseudosDeclares`, occurrence
    // standalone). Vide si mono-pseudo → pas d'item de bascule.
    let pseudosAutres: string[] = []
    const cle = cleEntite(entite)
    if (a.regle) {
      const regle = deps.reglesAnon().find((r) => r.id === a.regle)
      if (regle && regle.pseudos.length > 1 && a.pseudo) {
        const bas = (p: string) => p.toLowerCase()
        const courant = bas(a.pseudo)
        pseudosAutres = regle.pseudos.filter((p) => bas(p) !== courant)
      }
    } else if (a.pseudo) {
      const declares = pseudosDeclares.value[cle]
      const bas = (p: string) => p.toLowerCase()
      if (declares && declares.length > 1 && declares.some((p) => bas(p) === bas(a.pseudo!))) {
        pseudosAutres = declares.filter((p) => bas(p) !== bas(a.pseudo!))
      }
    }
    menuContextuelAnon.value = {
      x: cible.x,
      y: cible.y,
      id: a.id,
      etat: a.etat === 'exception' ? 'exception' : 'anonymise',
      entite,
      pseudosAutres,
    }
  }
  /** Ferme le menu (clic hors menu, Escape, ou après une action). */
  function fermerMenuAnon() {
    menuContextuelAnon.value = null
  }
  /** Pseudo de la LIGNE du tableau contenant l'occurrence `a` : celui d'une
   *  autre occurrence ANONYMISÉE de même entité (le relabel de ligne), sinon
   *  celui du brouillon courant. Vide si la ligne n'en a aucun (entité dont
   *  toutes les occurrences sont des exceptions) — « remettre en anonymisé »
   *  re-barre alors sans pseudo, prêt à être relabelé au tableau (§2.1 : le
   *  pseudo vit sur la ligne/règle, pas sur l'exception). */
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
   *  (jamais affiché, jamais sérialisé — option 2, plan §2.1) pour que
   *  « remettre en anonymisé » soit sans perte. Non journalisée (comme
   *  validerAnon) ; l'inverse est le second item du menu. */
  function basculerException(id: string) {
    const a = entretien.annotations.find((x) => x.id === id)
    if (!a || a.type !== 'anon' || a.etat === 'exception') return
    a.etat = 'exception'
    fermerMenuAnon()
    rafraichir()
    rafraichirDecorations()
    planifierSauvegarde()
  }
  /** « Remettre en anonymisé » : l'exception redevient une occurrence
   *  anonymisée. Priorité au pseudo-mémoire conservé sur l'exception (restore
   *  sans perte), sinon au pseudo de la ligne courante (§2.3) — vide si la
   *  ligne n'en a pas (on re-barre, l'utilisateur relabel au tableau). */
  function basculerAnonymise(id: string) {
    const a = entretien.annotations.find((x) => x.id === id)
    if (!a || a.type !== 'anon' || a.etat === 'anonymise') return
    a.etat = 'anonymise'
    a.pseudo = a.pseudo || pseudoDeLigne(a)
    fermerMenuAnon()
    rafraichir()
    rafraichirDecorations()
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
    fermerMenuAnon()
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
  } {
    return {
      corpsTexte: editor.value!.getJSON(),
      annotations: entretien.annotations.map((a) => ({ ...a })),
      ancres: entretien.ancres.map((a) => ({ ...a })),
      locuteurs: locuteurs.value,
      meta: { valeursGen: meta.valeursGen },
      legacy: legacyCourant.value,
      brouillonsAnon: brouillonsAnon.value,
    }
  }

  onBeforeUnmount(() => {
    clearTimeout(tid)
    editor.value?.destroy()
  })

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
    brouillonsAnon,
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
    validerAnon,
    supprimerAnon,
    creerBrouillon,
    majBrouillonLigne,
    supprimerLigneAnon,
    changerPorteeAnon,
    menuContextuelAnon,
    fermerMenuAnon,
    basculerException,
    basculerAnonymise,
    basculerPseudoOccurrence,
    dialoguePorteeCorpus,
    alignerCorpus,
    garderLesDeuxCorpus,
    annulerDialogueCorpus,
    detecterDivergencesPostTirage,
    fusionPossible,
    absorberFusion,
    entiteExisteDeja,
    // cycle de vie / persistance
    ouvrir,
    reinitialiser,
    sauver,
    donneesExport,
    texteModifie,
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
