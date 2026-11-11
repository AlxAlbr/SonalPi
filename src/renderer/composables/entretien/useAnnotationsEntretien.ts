import { ref } from 'vue'
import type { Editor } from '@tiptap/core'
import type { CibleMenuContexte } from '../../editor/menuContexte'
import { snapToWord } from '../../editor/snap'
import { trouverCodage, ajouterCodage, retirerAnnotation, ajouterCommentaire, modifierCommentaire, type Entretien } from '../../../shared/entretien/entretien'
import type { Annotation } from '../../../shared/entretien/annotation'
import type { Inverse } from '../../../shared/entretien/journal'

type LireEditeur = () => Editor | null

type DescriptionOccurrence = {
  id: string
  etat: 'anonymise' | 'exception'
  entite: string
  pseudosAutres: string[]
}

export function useAnnotationsEntretien(deps: {
  entretien: Entretien
  lireEditeur: LireEditeur
  estCodeActif: (code: string) => boolean
  nomCode: (code: string) => string
  enregistrerAction: (libelle: string, inverse: Inverse) => void
  decrireOccurrence: (annotation: Annotation) => DescriptionOccurrence
  pseudoDeLigne: (annotation: Annotation) => string
  rafraichirAnonymisation: () => void
  rafraichirProjections: () => void
  rafraichirDecorations: () => void
  planifierSauvegarde: () => void
}) {
  const entretien = deps.entretien
  const auteur = 'moi'
  const genId = () => 'a-' + Math.random().toString(36).slice(2, 9)
  const hintCodage = ref<string | null>(null)
  const menuContextuel = ref<{
    x: number
    y: number
    anon: DescriptionOccurrence | null
    codages: { id: string; libelle: string }[]
    commentaires: { id: string; auteur: string; extrait: string }[]
    peutCommenter: boolean
    peutAjouterCas: boolean
    peutAjouterRecueil: boolean
  } | null>(null)
  const editionCommentaire = ref<{
    id: string | null
    from: number
    to: number
    auteur: string
    texte: string
  } | null>(null)
  // --- Gestes de codage (clic sur un thème = coder la sélection) ---
  /** Code la sélection courante (snap au mot) avec `code`. Il faut au moins un
   *  caractère sélectionné : sans sélection, on se contente d'afficher le hint,
   *  pour ne jamais coder un mot que l'utilisateur n'a pas désigné lui-même.
   *  Re-clic même thème / même plage = retirer. */
  function coderAvec(code: string) {
    const ed = deps.lireEditeur()
    if (!ed) return
    const { from, to } = ed.state.selection
    const snapped = snapToWord(ed.state, from, to)
    if (from >= to || snapped.from >= snapped.to) {
      hintCodage.value = 'Sélectionne d’abord du texte, puis clique un thème (re-clic = retirer).'
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
      deps.enregistrerAction(
        `Codage retiré : ${deps.nomCode(code)}`,
        { type: 'reposerAnnotation', annotation: existant },
      )
    } else {
      const a = ajouterCodage(entretien, { ...snapped, code, auteur }, genId)
      if (a)
        deps.enregistrerAction(
          `Codage posé : ${deps.nomCode(code)}`,
          { type: 'retirerAnnotation', annotationId: a.id },
        )
    }
    deps.rafraichirProjections()
    deps.rafraichirDecorations()
    deps.planifierSauvegarde()
  }
  /** Retire du modèle tous les codages d'un thème (support de la suppression
   *  d'un thème depuis l'entretien). Ne persiste pas — l'appelant orchestre le save. */
  function retirerCodagesDuCode(code: string): number {
    const cibles = entretien.annotations.filter((a) => a.type === 'codage' && a.code === code)
    for (const a of cibles) retirerAnnotation(entretien, a.id)
    deps.rafraichirProjections()
    deps.rafraichirDecorations()
    return cibles.length
  }


  // --- Menu contextuel de l'éditeur (anon, codages, commentaires) ---
  /** Ouvre le menu flottant sur la cible résolue par le plugin
   *  `pluginMenuContexte` (appelé à chaque clic droit consommé) : ici on
   *  transforme les annotations brutes en VUE pour le composant MenuContexte. */
  function ouvrirMenuContexte(cible: CibleMenuContexte) {
    if (!deps.lireEditeur()?.isEditable) return
    const anon = cible.anon ? deps.decrireOccurrence(cible.anon) : null
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
      peutAjouterCas: cible.plageSelection != null,
      peutAjouterRecueil: cible.plageSelection != null,
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
    deps.rafraichirProjections()
    deps.rafraichirDecorations()
    deps.rafraichirAnonymisation()
    
    deps.planifierSauvegarde()
  }
  /** « Remettre en anonymisé » : l'exception redevient une occurrence
   *  anonymisée. Priorité au pseudo-mémoire conservé sur l'exception (restore
   *  sans perte), sinon au pseudo de la ligne courante — vide si la
   *  ligne n'en a pas (on re-barre, l'utilisateur relabel au tableau). */
  function basculerAnonymise(id: string) {
    const a = entretien.annotations.find((x) => x.id === id)
    if (!a || a.type !== 'anon' || a.etat === 'anonymise') return
    a.etat = 'anonymise'
    a.pseudo = a.pseudo || deps.pseudoDeLigne(a)
    fermerMenu()
    deps.rafraichirProjections()
    deps.rafraichirDecorations()
    deps.rafraichirAnonymisation()
    
    deps.planifierSauvegarde()
  }

  /** La bascule multi-pseudo ré-anonymise uniquement cette occurrence
   *  avec un autre pseudo autorisé (règle corpus OU ensemble déclaré fichier),
   *  en changeant le `pseudo` de cette annotation seule (le texte [pseudo]
   *  suit). Niveau entretien, par occurrence. */
  function basculerPseudoOccurrence(id: string, pseudo: string) {
    const a = entretien.annotations.find((x) => x.id === id)
    if (!a || a.type !== 'anon') return
    if ((a.pseudo || '').toLowerCase() === pseudo.toLowerCase()) return
    a.pseudo = pseudo
    fermerMenu()
    deps.rafraichirProjections()
    deps.rafraichirDecorations()
    deps.rafraichirAnonymisation()
    
    deps.planifierSauvegarde()
  }

  // --- Commentaires en marge (poser, éditer, supprimer, retirer un codage) ---

  /** Ouvre la modale en CRÉATION sur une plage (appelé par le menu contextuel ;
   *  l'auteur est pré-rempli avec le dernier signataire mémorisé). */
  async function commenterPlage(from: number, to: number) {
    const ed = deps.lireEditeur()
    if (!ed?.isEditable || from >= to) return
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
    if (!deps.lireEditeur()?.isEditable) return
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
    if (!deps.lireEditeur()?.isEditable) return
    const e = editionCommentaire.value
    if (!e || !texte.trim()) return
    await window.sonal.profil.memoriserSignataire(auteur)
    if (e.id) {
      const a = entretien.annotations.find((x) => x.id === e.id)
      if (!a || a.type !== 'commentaire') return
      const avant = { auteur: a.auteur, texte: a.texte ?? '' }
      if (!modifierCommentaire(entretien, e.id, { auteur, texte })) return
      deps.enregistrerAction(
        'Commentaire modifié',
        { type: 'editerAnnotation', annotationId: e.id, ...avant },
      )
    } else {
      const c = ajouterCommentaire(entretien, { from: e.from, to: e.to, auteur, texte }, genId)
      if (c)
        deps.enregistrerAction('Commentaire posé', { type: 'retirerAnnotation', annotationId: c.id })
    }
    editionCommentaire.value = null
    deps.rafraichirProjections()
    deps.rafraichirDecorations()
    deps.planifierSauvegarde()
  }
  /** Supprime le commentaire `id` (depuis la modale d'édition). L'objet retiré
   *  survit dans l'entrée : journalRemap continue à le remapper. */
  function supprimerCommentaire(id: string) {
    if (!deps.lireEditeur()?.isEditable) return
    const a = entretien.annotations.find((x) => x.id === id)
    if (!a || a.type !== 'commentaire') return
    retirerAnnotation(entretien, id)
    deps.enregistrerAction('Commentaire supprimé', { type: 'reposerAnnotation', annotation: { ...a } })
    editionCommentaire.value = null
    fermerMenu()
    deps.rafraichirProjections()
    deps.rafraichirDecorations()
    deps.planifierSauvegarde()
  }
  /** Retire UN codage sans resélectionner (menu contextuel, parité SonalPi1) :
   *  même sillage que le toggle « re-clic = retirer » de coderAvec. */
  function retirerCodageMenu(id: string) {
    const a = entretien.annotations.find((x) => x.id === id)
    if (!a || a.type !== 'codage') return
    retirerAnnotation(entretien, id)
    deps.enregistrerAction(
      `Codage retiré : ${deps.nomCode(a.code ?? '')}`,
      { type: 'reposerAnnotation', annotation: { ...a } },
    )
    fermerMenu()
    deps.rafraichirProjections()
    deps.rafraichirDecorations()
    deps.planifierSauvegarde()
  }


  function reinitialiser() {
    hintCodage.value = null
    fermerMenu()
    editionCommentaire.value = null
  }

  return {
    hintCodage,
    menuContextuel,
    editionCommentaire,
    coderAvec,
    retirerCodagesDuCode,
    ouvrirMenuContexte,
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
    reinitialiser,
  }
}
