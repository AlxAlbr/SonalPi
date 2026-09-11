import type { Editor } from '@tiptap/core'
import { computed, reactive, ref, type Ref } from 'vue'
import { estOrpheline } from '../../../shared/entretien/annotation'
import type { Entretien } from '../../../shared/entretien/entretien'
import { genIdNote, prochainRang, renumeroterRangs } from '../../../shared/entretien/notes'
import type { Locuteur, Note } from '../../../shared/format'
import { reperagePluginKey } from '../../editor/reperage'
import {
  ATTR_LIENS_NOTE,
  corpsNoteEnTexte,
  decoreRefsCommentaires,
  lireLiensNote,
  normaliserNotesLues,
  sanitiserCorpsNote,
} from '../../notes/sanitiser'

interface BrouillonNote {
  id: string | null
  categorieId: string
  titre: string
  date: string | null
  statut: 'prive' | 'public'
  corps: string
  locuteurIds: string[]
  rang: number
}

/** Gère les notes structurées et leurs interactions avec les commentaires. */
export function useNotesEntretien(deps: {
  entretien: Entretien
  locuteurs: Ref<Locuteur[]>
  lireEditeur: () => Editor | null
  nomCategorieNote: (id: string) => string
  categorieNoteDefaut: () => string
  planifierSauvegarde: () => void
}) {
  const notes = ref<Note[]>([])
  const brouillonNote = ref<BrouillonNote | null>(null)
  const avertissementNote = ref('')
  const menuLiensNote = ref<{ x: number; y: number; liens: string[] } | null>(null)
  let passageLie: HTMLElement | null = null
  let zoneLiee: HTMLElement | null = null
  let syncZoneHorsModale: ((zone: HTMLElement) => void) | null = null

  function fermerMenuLiensNote() {
    menuLiensNote.value = null
    passageLie = null
    zoneLiee = null
  }

  function reinitialiserEtatVolatil() {
    brouillonNote.value = null
    avertissementNote.value = ''
    fermerMenuLiensNote()
  }

  function charger(notesLues: Note[] | null | undefined) {
    reinitialiserEtatVolatil()
    notes.value = normaliserNotesLues(notesLues, document)
  }

  function reinitialiser() {
    reinitialiserEtatVolatil()
    notes.value = []
  }

  function retirerLocuteur(id: string) {
    for (const note of notes.value) {
      note.locuteurIds = note.locuteurIds?.filter((locuteurId) => locuteurId !== id)
    }
  }

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

  function editerNote(id: string) {
    const note = notes.value.find((candidate) => candidate.id === id)
    if (!note) return
    avertissementNote.value = ''
    brouillonNote.value = reactive<BrouillonNote>({
      id: note.id,
      categorieId: note.categorieId,
      titre: note.titre,
      date: note.date,
      statut: note.statut,
      corps: note.corps,
      locuteurIds: [...(note.locuteurIds ?? [])],
      rang: note.rang,
    })
  }

  function validerNote() {
    const brouillon = brouillonNote.value
    if (!brouillon) return
    if (brouillon.categorieId === ' autre') {
      avertissementNote.value =
        'Choisissez une catégorie dans la liste, ou créez la vôtre avec le bouton ＋.'
      return
    }
    avertissementNote.value = ''
    const titre = brouillon.titre.trim()
    const corps = sanitiserCorpsNote(brouillon.corps, document)
    const idsExistants = new Set(
      deps.locuteurs.value.flatMap((locuteur) => (locuteur.id ? [locuteur.id] : [])),
    )
    const locuteurIds = [
      ...new Set(brouillon.locuteurIds.filter((id) => idsExistants.has(id))),
    ]
    if (brouillon.id) {
      const cible = notes.value.find((note) => note.id === brouillon.id)
      if (cible) {
        cible.categorieId = brouillon.categorieId
        cible.titre = titre
        cible.date = brouillon.date
        cible.statut = brouillon.statut
        cible.corps = corps
        cible.locuteurIds = locuteurIds
        cible.modifieLe = new Date().toISOString()
      }
    } else {
      notes.value.push({
        id: genIdNote(),
        categorieId: brouillon.categorieId,
        titre,
        date: brouillon.date,
        statut: brouillon.statut,
        corps,
        locuteurIds,
        rang: brouillon.rang,
        creeLe: new Date().toISOString(),
        modifieLe: null,
      })
    }
    brouillonNote.value = null
    deps.planifierSauvegarde()
  }

  function annulerNote() {
    brouillonNote.value = null
  }

  function ecrireCorpsNote(id: string, htmlBrut: string) {
    const cible = notes.value.find((note) => note.id === id)
    if (!cible) return
    const corps = sanitiserCorpsNote(htmlBrut, document)
    if (corps === cible.corps) return
    cible.corps = corps
    cible.modifieLe = new Date().toISOString()
    deps.planifierSauvegarde()
  }

  function ecrireTitreNote(id: string, titre: string) {
    const cible = notes.value.find((note) => note.id === id)
    if (!cible) return
    const titreNormalise = titre.trim()
    if (titreNormalise === cible.titre) return
    cible.titre = titreNormalise
    cible.modifieLe = new Date().toISOString()
    deps.planifierSauvegarde()
  }

  function supprimerNote(id: string) {
    const index = notes.value.findIndex((note) => note.id === id)
    if (index < 0) return
    notes.value.splice(index, 1)
    notes.value = renumeroterRangs(notes.value)
    deps.planifierSauvegarde()
  }

  function reordonnerNotes(idsDansLordre: string[]) {
    const ordre = new Map(idsDansLordre.map((id, index) => [id, index]))
    notes.value = renumeroterRangs(
      notes.value
        .slice()
        .sort((a, b) => (ordre.get(a.id) ?? 0) - (ordre.get(b.id) ?? 0)),
    )
    deps.planifierSauvegarde()
  }

  function envelopperSelection(zone: HTMLElement, balise: string): HTMLElement | null {
    const selection = document.getSelection()
    if (!selection || selection.rangeCount === 0) return null
    const plage = selection.getRangeAt(0)
    if (plage.collapsed || !zone.contains(plage.commonAncestorContainer)) return null
    const element = document.createElement(balise)
    try {
      plage.surroundContents(element)
    } catch {
      const fragment = plage.extractContents()
      element.appendChild(fragment)
      plage.insertNode(element)
    }
    return element
  }

  function deballer(passage: Element) {
    const parent = passage.parentElement!
    while (passage.firstChild) parent.insertBefore(passage.firstChild, passage)
    parent.removeChild(passage)
  }

  function passageAncetre(noeud: Node | null, zone: HTMLElement): HTMLElement | null {
    const element = noeud?.nodeType === 3 ? noeud.parentElement : (noeud as HTMLElement | null)
    const passage = (element?.closest('mark, em') as HTMLElement | null) ?? null
    return passage && zone.contains(passage) ? passage : null
  }

  function marquerPassage(zone: HTMLElement) {
    const selection = document.getSelection()
    if (!selection || selection.rangeCount === 0) return
    const markParent = passageAncetre(selection.getRangeAt(0).commonAncestorContainer, zone)
    if (markParent?.tagName.toLowerCase() === 'mark') {
      deballer(markParent)
      return
    }
    envelopperSelection(zone, 'mark')
  }

  const commentairesPourLiaison = computed(() =>
    deps.entretien.annotations
      .filter((annotation) => annotation.type === 'commentaire' && !estOrpheline(annotation))
      .map((annotation) => ({
        id: annotation.id,
        auteur: annotation.auteur,
        texte: annotation.texte ?? '',
      })),
  )

  function ouvrirMenuSur(passage: HTMLElement, zone: HTMLElement, event: MouseEvent) {
    passageLie = passage
    zoneLiee = zone
    menuLiensNote.value = {
      x: event.clientX,
      y: event.clientY,
      liens: lireLiensNote(passage),
    }
  }

  function lierPassage(event: MouseEvent, zone: HTMLElement) {
    const selection = document.getSelection()
    const existant = selection
      ? passageAncetre(selection.getRangeAt(0)?.commonAncestorContainer ?? null, zone)
      : null
    if (existant?.tagName.toLowerCase() === 'em') {
      ouvrirMenuSur(existant, zone, event)
      return
    }
    const passage = envelopperSelection(zone, 'em')
    if (!passage) return
    if (brouillonNote.value) brouillonNote.value.corps = zone.innerHTML
    else syncZoneHorsModale?.(zone)
    ouvrirMenuSur(passage, zone, event)
  }

  function ouvrirMenuLiensNote(event: MouseEvent, zone: HTMLElement) {
    const cible = event.target as HTMLElement | null
    const passage = cible ? passageAncetre(cible, zone) : null
    if (!passage) return
    event.preventDefault()
    ouvrirMenuSur(passage, zone, event)
  }

  function resolverCommentaires(id: string): { auteur: string; texte: string } | null {
    const commentaire = commentairesPourLiaison.value.find((candidat) => candidat.id === id)
    return commentaire ? { auteur: commentaire.auteur, texte: commentaire.texte } : null
  }

  function basculerLienNote(idAnnotation: string, lie: boolean) {
    if (!passageLie || !zoneLiee) return
    const liensCourants = lireLiensNote(passageLie)
    const liensSuivants = lie
      ? [...new Set([...liensCourants, idAnnotation])]
      : liensCourants.filter((id) => id !== idAnnotation)
    if (liensSuivants.length > 0) {
      passageLie.setAttribute(ATTR_LIENS_NOTE, liensSuivants.join(' '))
    } else {
      passageLie.removeAttribute(ATTR_LIENS_NOTE)
      if (passageLie.tagName.toLowerCase() === 'em') deballer(passageLie)
    }
    decoreRefsCommentaires(zoneLiee, document, resolverCommentaires)
    if (brouillonNote.value) brouillonNote.value.corps = zoneLiee.innerHTML
    else syncZoneHorsModale?.(zoneLiee)
  }

  function enregistrerSyncZoneHorsModale(
    synchroniser: ((zone: HTMLElement) => void) | null,
  ) {
    syncZoneHorsModale = synchroniser
  }

  function lierCommentaireNote(idAnnotation: string) {
    basculerLienNote(idAnnotation, true)
    fermerMenuLiensNote()
  }

  function delierCommentaireNote(idAnnotation: string) {
    basculerLienNote(idAnnotation, false)
    fermerMenuLiensNote()
  }

  function allerAuCommentaire(idAnnotation: string) {
    const editeur = deps.lireEditeur()
    if (!editeur) return
    const annotation = deps.entretien.annotations.find(
      (candidate) => candidate.id === idAnnotation,
    )
    if (!annotation || annotation.type !== 'commentaire' || estOrpheline(annotation)) return
    editeur.commands.setTextSelection({ from: annotation.from, to: annotation.to })
    editeur.view.dispatch(
      editeur.state.tr.setMeta(reperagePluginKey, { de: annotation.from, a: annotation.to }),
    )
    const dom = editeur.view.domAtPos(annotation.from).node
    const element = dom instanceof HTMLElement ? dom : dom.parentElement
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function notesEnTexte(): string {
    return notes.value
      .slice()
      .sort((a, b) => a.rang - b.rang)
      .map((note) => {
        const categorie = deps.nomCategorieNote(note.categorieId)
        const date = note.date ?? 'sans date'
        const statut = note.statut === 'public' ? 'public' : 'privé'
        const titre = note.titre ? `${note.titre}\n` : ''
        const corps = corpsNoteEnTexte(note.corps, document)
        return `[${categorie} · ${date} · ${statut}]\n${titre}${corps}`
      })
      .join('\n\n')
  }

  return {
    notes,
    brouillonNote,
    avertissementNote,
    commentairesPourLiaison,
    menuLiensNote,
    charger,
    reinitialiser,
    retirerLocuteur,
    ajouterNote,
    editerNote,
    validerNote,
    annulerNote,
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
  }
}
