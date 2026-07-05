import { ref, reactive, onBeforeUnmount } from 'vue'
import { Extension } from '@tiptap/core'
import { useEditor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { BlocAttributs } from '../editor/schema'
import { pluginRemap } from '../editor/remap'
import { pluginDecorations, decorationsPluginKey } from '../editor/decorations'
import { pluginGouttiere, gouttierePluginKey } from '../editor/locuteursGutter'
import { snapToWord, snapBornes } from '../editor/snap'
import { attribuerSelectionTr } from '../editor/attribution'
import { renommerLocuteur, ajouterLocuteur, nomDeLocuteur } from '../../shared/entretien/locuteurs'
import { estOrpheline, type Annotation } from '../../shared/entretien/annotation'
import { ajouterCodage, retirerAnnotation, trouverCodage, type Entretien } from '../../shared/entretien/entretien'
import type { EntretienFichier, Locuteur } from '../../shared/format'
import type { LegacyBlobs } from '../import/importSonal'

type Ligne = { id: string; type: string; code: string; from: number; to: number; extrait: string; orpheline: boolean }
type Extrait = { id: string; texte: string; locuteurs: string[] }

/**
 * Scope ENTRETIEN (D-S12) : l'ENTRETIEN OUVERT — sa vérité en session (doc
 * ProseMirror + annotations + locuteurs + valeurs), l'éditeur TipTap et ses
 * plugins, les gestes (coder, locuteurs, valeurs), l'autosave et le panneau debug.
 * Ne connaît PAS le corpus : ses dépendances de scope sont injectées —
 *  - `couleurTrait` : résout la couleur d'un code (scope corpus) pour le marquage ;
 *  - `apresSauvegarde` : rafraîchit les requêtes corpus après un save (orchestration) ;
 *  - `codeExtraits` : le thème filtrant la requête Extraits (vestige D-S7).
 */
export function useEntretien(deps: {
  couleurTrait: (code: string) => string
  apresSauvegarde: () => Promise<void>
  codeExtraits: () => string
}) {
  const auteur = 'moi'
  const genId = () => 'a-' + Math.random().toString(36).slice(2, 9)

  // --- Modèle en session (LA vérité ; éditeur et disque = projections) ---
  const entretien = reactive<Entretien>({ annotations: [] })
  const locuteurs = ref<Locuteur[]>([])
  const legacyCourant = ref<LegacyBlobs>({ tabAnon: null, notes: '' })
  const meta = reactive<{ valeursGen: Record<string, string>; audioRef: string | null }>({
    valeursGen: {},
    audioRef: null,
  })
  const ongletDroite = ref<'themes' | 'locuteurs' | 'donnees'>('themes')
  const hintCodage = ref<string | null>(null)
  /** Sélection courante vide ? Pilote le libellé du bouton d'attribution (S4 :
   *  « Attribuer la sélection » vs « …le bloc courant »). */
  const selectionVide = ref(true)

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
        pluginDecorations(entretien, deps.couleurTrait),
        pluginGouttiere(() => locuteurs.value),
      ]
    },
  })
  const editor = useEditor({
    content: '<p></p>',
    extensions: [StarterKit, BlocAttributs, MoteurExtension],
    editorProps: { attributes: { class: 'editeur' } },
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

  // --- Projections lisibles du modèle (panneau debug + requête Extraits D-S7) ---
  const lignes = ref<Ligne[]>([])
  const extraits = ref<Extrait[]>([])
  function rafraichir() {
    const ed = editor.value
    lignes.value = entretien.annotations.map((a: Annotation) => ({
      id: a.id,
      type: a.type,
      code: a.code ?? '',
      from: a.from,
      to: a.to,
      orpheline: estOrpheline(a),
      extrait: ed && !estOrpheline(a) ? ed.state.doc.textBetween(a.from, a.to, ' ') : '—',
    }))
    rafraichirExtraits()
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
    locuteurs.value = res.data.locuteurs
    ed.commands.setContent(res.data.corpsTexte as Record<string, unknown>, { emitUpdate: false })
    for (const a of res.data.annotations) entretien.annotations.push(a)
    meta.valeursGen = { ...res.data.meta.valeursGen }
    meta.audioRef = res.data.meta.audioRef
    legacyCourant.value = (res.data.legacy as LegacyBlobs | undefined) ?? { tabAnon: null, notes: '' }
    ouvertId.value = id
    perime.value = res.perime
    chargement = false
    rafraichir()
    rafraichirDecorations()
    rafraichirGouttiere()
    etatSauvegarde.value = 'à jour'
    return true
  }
  /** Réinitialise à vide (changement de corpus / suppression de l'entretien ouvert). */
  function reinitialiser() {
    ouvertId.value = null
    entretien.annotations.splice(0, entretien.annotations.length)
    editor.value?.commands.setContent('<p></p>', { emitUpdate: false })
    refusFormat.value = null
    perime.value = false
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
    if (existant) retirerAnnotation(entretien, existant.id)
    else ajouterCodage(entretien, { ...snapped, code, auteur }, genId)
    rafraichir()
    rafraichirDecorations()
    planifierSauvegarde()
  }
  function retirer(id: string) {
    retirerAnnotation(entretien, id)
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
    if (ed.state.selection.empty) {
      ed.chain().focus().updateAttributes('paragraph', { loc }).run()
    } else {
      const { from, to } = snapBornes(ed.state, ed.state.selection.from, ed.state.selection.to)
      const tr = attribuerSelectionTr(ed.state, from, to, loc)
      if (tr) {
        ed.view.dispatch(tr)
        ed.view.focus()
        rafraichir() // le doc a changé : les positions d'annotations ont été remappées
      }
    }
    planifierSauvegarde()
  }
  function renommerLoc(index: number, evt: Event) {
    renommerLocuteur(locuteurs.value, index, (evt.target as HTMLInputElement).value)
    rafraichirGouttiere()
    planifierSauvegarde()
  }
  function nouveauLocuteur() {
    ajouterLocuteur(locuteurs.value, 'Nouveau locuteur')
    rafraichirGouttiere()
    planifierSauvegarde()
  }

  // --- Valeurs EAV de CET entretien (chez leur propriétaire, pas de l="all") ---
  function setValeurGen(idVar: string, idMod: string) {
    if (idMod) meta.valeursGen[idVar] = idMod
    else delete meta.valeursGen[idVar]
    planifierSauvegarde()
  }
  function setValeurLoc(index: number, idVar: string, idMod: string) {
    const l = locuteurs.value.find((x) => x.index === index)
    if (!l) return
    if (idMod) l.valeursLoc[idVar] = idMod
    else delete l.valeursLoc[idVar]
    planifierSauvegarde()
  }

  /** Données brutes de l'entretien ouvert (pour l'export .sonal, assemblé par l'App). */
  function donneesExport(): {
    corpsTexte: unknown
    annotations: Annotation[]
    locuteurs: Locuteur[]
    meta: { valeursGen: Record<string, string> }
    legacy: LegacyBlobs
  } {
    return {
      corpsTexte: editor.value!.getJSON(),
      annotations: entretien.annotations.map((a) => ({ ...a })),
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
    lignes,
    // gestes
    coderAvec,
    retirer,
    retirerCodagesDuCode,
    attribuerLoc,
    renommerLoc,
    nouveauLocuteur,
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
  }
}
