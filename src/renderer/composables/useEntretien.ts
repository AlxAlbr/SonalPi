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
import type { EntretienFichier, Locuteur, SegmentThematique } from '../../shared/format'
import type { LegacyBlobs } from '../import/importSonal'

type Extrait = { id: string; texte: string; locuteurs: string[] }

/**
 * Scope ENTRETIEN (D-S12) : l'ENTRETIEN OUVERT — sa vérité en session (doc
 * ProseMirror + annotations + locuteurs + valeurs), l'éditeur TipTap et ses
 * plugins, les gestes (coder, locuteurs, valeurs), l'autosave et le panneau debug.
 * Ne connaît PAS le corpus : ses dépendances de scope sont injectées —
 *  - `couleurTrait` : résout la couleur d'un code (scope corpus) pour le marquage ;
 *  - `apresSauvegarde` : rafraîchit les requêtes corpus après un save (orchestration) ;
 *  - `codeExtraits` : le thème filtrant la requête Extraits (vestige D-S7) ;
 *  - `nomCode` / `libelleValeur` : libellés lisibles pour le journal S5 (les noms
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
  /** S6 : clic sur la gouttière d'un bloc → l'orchestrateur cale l'audio au
   *  début du tour (le scope entretien ne connaît pas le lecteur). */
  clicTour?: (posBloc: number) => void
  /** S7 : clic DANS le texte → l'orchestrateur cale l'audio au temps interpolé
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
  const ongletDroite = ref<'themes' | 'locuteurs' | 'donnees' | 'journal'>('themes')
  const hintCodage = ref<string | null>(null)
  /** Sélection courante vide ? Pilote le libellé du bouton d'attribution (S4 :
   *  « Attribuer la sélection » vs « …le bloc courant »). */
  const selectionVide = ref(true)

  // --- Journal d'actions (S5) : volatil (D-S9), actions de modèle seules (D-S3) ---
  const journal = reactive<Journal>({ entrees: [] })
  const genIdJournal = () => 'j-' + Math.random().toString(36).slice(2, 9)

  // --- État de persistance de l'entretien ouvert ---
  const ouvertId = ref<string | null>(null)
  const perime = ref(false)
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
      // Un CLIC (pas un drag de sélection) → seek audio à cet endroit (S7).
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
    onUpdate: () => {
      rafraichir()
      planifierSauvegarde()
    },
    onSelectionUpdate: ({ editor: ed }) => {
      selectionVide.value = ed.state.selection.empty
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

  // --- Journal (S5) : contexte d'inverse + projection affichable ---
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

  // --- Projections lisibles du modèle (requête Extraits D-S7 + journal S5) ---
  const extraits = ref<Extrait[]>([])
  /** Résumé thématique LIVE de l'entretien ouvert (calque de la bande du lecteur) :
   *  recalculé avec les autres projections — même requête pure que les cartes
   *  Corpus, sur le modèle en session au lieu du disque. */
  const resumeOuvert = ref<SegmentThematique[]>([])
  function rafraichir() {
    rafraichirExtraits()
    rafraichirJournal() // l'annulabilité dépend du doc et des annotations
    const ed = editor.value
    resumeOuvert.value = ed
      ? resumeThematique({ corpsTexte: ed.getJSON(), annotations: entretien.annotations })
      : []
  }
  /** Extraits du thème courant (REQUÊTE, rien de stocké ; UI retirée — D-S7, mais la
   *  requête reste dans le code). Une annotation = UN extrait même à cheval sur blocs. */
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

  // --- Synchro audio (S7, D-S14) : scope dédié — le pont temps ↔ texte ---
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
    perime.value = false // on vient d'écrire → le disque n'est plus « en retard »
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
    for (const a of res.data.annotations) entretien.annotations.push(a)
    for (const a of res.data.ancres ?? []) entretien.ancres.push(a)
    meta.valeursGen = { ...res.data.meta.valeursGen }
    meta.audioRef = res.data.meta.audioRef
    legacyCourant.value = (res.data.legacy as LegacyBlobs | undefined) ?? { tabAnon: null, notes: '' }
    ouvertId.value = id
    perime.value = res.perime
    chargement = false
    journal.entrees.length = 0 // volatil PAR entretien (D-S9)
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
    refusFormat.value = null
    perime.value = false
    eteindrePlageLue()
    rafraichir()
    rafraichirDecorations()
  }

  // --- Gestes de codage (S3 : clic sur un thème = coder la sélection) ---
  /** Code la sélection courante (snap au mot) avec `code`. Sans sélection → hint,
   *  rien codé (D-S1). Re-clic même thème / même plage = retirer (D-S6). */
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
  /** Retire du modèle tous les codages d'un thème (support D-S10 : suppression
   *  d'un thème depuis l'entretien). Ne persiste pas — l'appelant orchestre le save. */
  function retirerCodagesDuCode(code: string): number {
    const cibles = entretien.annotations.filter((a) => a.type === 'codage' && a.code === code)
    for (const a of cibles) retirerAnnotation(entretien, a.id)
    rafraichir()
    rafraichirDecorations()
    return cibles.length
  }

  // --- Locuteurs (étape 4 : bloc courant ; S4 : attribuer la sélection) ---
  /** Pose `loc`. Sélection VIDE → le bloc courant (geste étape 4). Sélection NON
   *  VIDE → « attribuer la sélection » (S4) : scinde les blocs aux bornes (snap au
   *  mot) et pose `loc` sur les blocs couverts ; annotations remappées, timecodes
   *  selon D-S5/D-S13. Aucune fusion physique (D-S2). */
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
   *  pendant du « ? » SonalPi). Hors journal S5 (comme + Locuteur) : l'inverse
   *  est le re-clic du même interrupteur. */
  function setInterviewer(index: number, actif: boolean) {
    const l = locuteurs.value.find((x) => x.index === index)
    if (!l || (l.interviewer ?? false) === actif) return
    l.interviewer = actif
    rafraichirGouttiere()
    planifierSauvegarde()
  }

  // --- Suppression d'un locuteur (acte destructif : nom + valeurs EAV + le
  // lien de ses blocs — confirmation in-app, comme les thèmes D-S10) ---
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
    selectionVide,
    ouvertId,
    perime,
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
    // cycle de vie / persistance
    ouvrir,
    reinitialiser,
    sauver,
    donneesExport,
    // rafraîchissements (l'App les déclenche après des changements corpus)
    rafraichir,
    rafraichirDecorations,
    resumeOuvert,
    // synchro audio (S7)
    majPlageLue,
    allerAuTexte,
    tempsDuBloc,
    tempsAuTexte,
  }
}
