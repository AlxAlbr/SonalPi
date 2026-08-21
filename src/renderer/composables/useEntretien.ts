import { ref, reactive, onBeforeUnmount } from 'vue'
import { Extension } from '@tiptap/core'
import { useEditor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { BlocAttributs } from '../editor/schema'
import { pluginRemap } from '../editor/remap'
import { pluginDecorations, decorationsPluginKey } from '../editor/decorations'
import { pluginGouttiere, gouttierePluginKey } from '../editor/locuteursGutter'
import { pluginLecture } from '../editor/lecture'
import { snapToWord, snapBornes } from '../editor/snap'
import { attribuerSelectionTr } from '../editor/attribution'
import { aplatir, occurrencesDe, plageVersPM, chevauche } from '../../shared/entretien/anonymisation'
import {
  cleEntite,
  trouverBrouillon,
  ajouterBrouillon,
  majBrouillon,
  retirerBrouillon,
  consommerBrouillon,
  lignesAnonUnifiees,
  type LigneAnon,
} from '../../shared/entretien/brouillonsAnon'
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
import type { EntretienFichier, Locuteur, SegmentThematique, BrouillonAnon } from '../../shared/format'
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
      ]
    },
  })
  // Double-espace = play/pause (parité SonalPi) : dans le texte, une espace tape
  // un caractère — c'est la 2ᵉ espace rapprochée qui sert de commande de lecture.
  const SEUIL_DOUBLE_ESPACE = 300 // ms
  let derniereEspace = 0
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
    onUpdate: ({ editor: ed }) => {
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
      .map((a) => ({ id: a.id, from: a.from, to: a.to, pseudo: a.pseudo }))
    lignesAnon.value = lignesAnonUnifiees(brouillonsAnon.value, occurrences, (f, t) =>
      ed.state.doc.textBetween(f, t, ' '),
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
    legacyCourant.value = (res.data.legacy as LegacyBlobs | undefined) ?? { tabAnon: null, notes: '' }
    ouvertId.value = id
    chargement = false
    journal.entrees.length = 0 // volatil PAR entretien
    // Le surlignage audio ne survit pas au changement de doc.
    eteindrePlageLue()
    rafraichir()
    rafraichirDecorations()
    rafraichirGouttiere()
    etatSauvegarde.value = 'à jour'
    return true
  }
  /** Réinitialise à vide (changement de corpus / suppression de l'entretien ouvert). */
  function reinitialiser() {
    ouvertId.value = null
    journal.entrees.length = 0
    entretien.annotations.splice(0, entretien.annotations.length)
    entretien.ancres.splice(0, entretien.ancres.length)
    editor.value?.commands.setContent('<p></p>', { emitUpdate: false })
    texteInitial = ''
    texteModifie.value = false
    refusFormat.value = null
    eteindrePlageLue()
    brouillonsAnon.value = []
    selectionAnon.value = null
    hintAnon.value = null
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

  // --- Suppression d'un locuteur (acte destructif : nom + valeurs EAV + le
  // lien de ses blocs — confirmation in-app, même idiome que les thèmes) ---
  const locuteurASupprimer = ref<{ index: number; nom: string; nbBlocs: number } | null>(null)
  function demanderSuppressionLocuteur(index: number) {
    const ed = editor.value
    const l = locuteurs.value.find((x) => x.index === index)
    if (!ed || !l) return
    let nbBlocs = 0
    ed.state.doc.forEach((node) => {
      if (node.type.name === 'paragraph' && node.attrs.loc === index) nbBlocs++
    })
    locuteurASupprimer.value = { index, nom: l.nom, nbBlocs }
  }
  /** Confirme : ses blocs passent à « aucun » (UNE transaction — le remap et le
   *  journal la voient passer), puis l'entrée quitte la liste. Non journalisé
   *  (non réversible, comme la suppression de thème). */
  function confirmerSuppressionLocuteur() {
    const ed = editor.value
    const cible = locuteurASupprimer.value
    if (!ed || !cible) return
    const tr = ed.state.tr
    ed.state.doc.forEach((node, offset) => {
      if (node.type.name === 'paragraph' && node.attrs.loc === cible.index) {
        tr.setNodeMarkup(offset, undefined, { ...node.attrs, loc: null })
      }
    })
    if (tr.steps.length) ed.view.dispatch(tr)
    supprimerLocuteur(locuteurs.value, cible.index)
    locuteurASupprimer.value = null
    rafraichir() // des entrées de journal visant ce locuteur deviennent grisées
    rafraichirGouttiere()
    planifierSauvegarde()
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
    // Relabel les occurrences DÉJÀ posées de cette entité (même texte).
    for (const a of entretien.annotations) {
      if (a.type !== 'anon' || estOrpheline(a)) continue
      if (cleEntite(ed.state.doc.textBetween(a.from, a.to, ' ')) === cle) a.pseudo = p
    }
    // Pose une occurrence sur chaque match. « La plus longue gagne » : un
    // match déjà couvert EN ENTIER n'est pas re-striqué ; un match qui CONTIENT
    // des occurrences plus courtes (ex. « New » / « York » posées à part dans
    // « New York ») les absorbe pour re-poser l'entité comme UNE occurrence
    // pleine. Un chevauchement partiel NON contenu reste en l'état (incluses différé).
    const existant = entretien.annotations.filter((a) => a.type === 'anon' && !estOrpheline(a))
    for (const m of matches) {
      const touches = existant.filter((a) => chevauche(a, m))
      if (touches.length === 0) {
        entretien.annotations.push({
          id: genId(),
          type: 'anon',
          from: m.from,
          to: m.to,
          auteur,
          pseudo: p,
          etat: 'anonymise',
        })
        continue
      }
      // Déjà couvert en entier par une occurrence → rien à faire (re-validation).
      if (touches.some((a) => a.from <= m.from && a.to >= m.to)) continue
      // Le match contient toutes les occurrences qui le touchent : on les retire
      // puis on pose le match en une occurrence unique (la plus longue gagne).
      if (touches.every((a) => a.from >= m.from && a.to <= m.to)) {
        for (const a of touches) retirerAnnotation(entretien, a.id)
        entretien.annotations.push({
          id: genId(),
          type: 'anon',
          from: m.from,
          to: m.to,
          auteur,
          pseudo: p,
          etat: 'anonymise',
        })
      }
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

  /** Supprime une ligne entière : ses occurrences + son éventuel brouillon. */
  function supprimerLigneAnon(entite: string) {
    const cle = cleEntite(entite)
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
    rafraichir()
    rafraichirDecorations()
    planifierSauvegarde()
  }

  /** Slider de portée : change l'état d'une ligne.
   *  brouillon → entretien : pose les occurrences (valider), consomme le brouillon.
   *  entretien → brouillon : retire les occurrences, recrée un brouillon
   *  (pseudo conservé) — l'entité reste saisie, prête à re-valider. */
  function changerPorteeAnon(entite: string, cible: 'brouillon' | 'entretien') {
    const ligne = lignesAnon.value.find((l) => l.cle === cleEntite(entite))
    if (!ligne) return
    if (cible === ligne.etat) return
    if (cible === 'entretien') {
      validerAnon(ligne.entite, ligne.pseudo)
    } else {
      // entretien → brouillon : retirer les occurrences, garder l'entité en brouillon.
      const pseudo = ligne.pseudo
      for (const id of ligne.occurrenceIds) retirerAnnotation(entretien, id)
      ajouterBrouillon(brouillonsAnon.value, ligne.entite, pseudo)
      rafraichir()
      rafraichirDecorations()
      planifierSauvegarde()
    }
  }

  /** Données brutes de l'entretien ouvert (pour l'export .sonal, assemblé par l'App). */
  function donneesExport(): {
    corpsTexte: unknown
    annotations: Annotation[]
    ancres: Ancre[]
    locuteurs: Locuteur[]
    meta: { valeursGen: Record<string, string> }
    legacy: LegacyBlobs
  } {
    return {
      corpsTexte: editor.value!.getJSON(),
      annotations: entretien.annotations.map((a) => ({ ...a })),
      ancres: entretien.ancres.map((a) => ({ ...a })),
      locuteurs: locuteurs.value,
      meta: { valeursGen: meta.valeursGen },
      legacy: legacyCourant.value,
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
    entreesJournal,
    annulerEntree,
    // gestes
    coderAvec,
    retirerCodagesDuCode,
    attribuerLoc,
    renommerLoc,
    nouveauLocuteur,
    setInterviewer,
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
