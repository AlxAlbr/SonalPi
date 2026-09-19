import { computed, ref, toRaw, watch, type Ref } from 'vue'
import { utiliserSonal } from '../sonal'
import { corpsAvecRefsCommentaires, corpsNoteEnTexte, sanitiserCorpsNote } from '../../notes/sanitiser'
import { genererMarkdownNotes, nomFichierMarkdownNotes } from '../../notes/markdown'
import type { ChampsNote, CommandeNotes, CritereTriNotes, InventaireNotes, VueNoteCorpus } from '../../../shared/corpus/notes'

export function useNotesCorpus(actif: Ref<boolean>) {
  const {
    allerNotes,
    badgeVerrou,
    categoriesNote,
    commanderNotes,
    couleurCategorieNote,
    dernierTirage,
    dossierCourantDir,
    dossierCourantNom,
    idDistantCourant,
    lireNotes,
    nomCategorieNote,
    rafraichirJournalCorpus,
    revisionNotesCorpus,
    vue,
  } = utiliserSonal()
  const inventaire = ref<InventaireNotes>({ notes: [], indisponibles: [] })
  const charge = ref(false)
  const chargement = ref(false)
  const erreur = ref('')
  const erreurLecture = ref(false)
  let generation = 0
  let chargementNotes: Promise<void> | null = null

  const recherche = ref('')
  const motCle = ref('')
  const categories = ref<string[]>([])
  const entretiens = ref<string[]>([])
  const statut = ref<'tous' | 'public' | 'prive'>('tous')
  const dateDebut = ref('')
  const dateFin = ref('')
  const importants = ref(false)
  const avecLiens = ref(false)
  const critereTri = ref<CritereTriNotes>('creeLe')
  const ordreTri = ref<'asc' | 'desc'>('desc')
  const modeAffichage = ref<'cartes' | 'tableau' | 'feuille'>('cartes')

  const entretiensDisponibles = computed(() => {
    const uniques = new Map(inventaire.value.notes.map((note) => [note.entretienId, note.entretienTitre]))
    return [...uniques].map(([id, titre]) => ({ id, titre }))
      .sort((a, b) => a.titre.localeCompare(b.titre, 'fr'))
  })
  const resumeIndisponibles = computed(() => {
    const nombre = inventaire.value.indisponibles.length
    return `${nombre} entretien${nombre > 1 ? 's' : ''} indisponible${nombre > 1 ? 's' : ''}`
  })

  function texte(note: VueNoteCorpus): string {
    return corpsNoteEnTexte(note.corps).replaceAll('▸', '').replaceAll('◂', '')
  }

  function cleRecherche(valeur: string): string {
    return valeur.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr')
  }

  function valeurTri(note: VueNoteCorpus): string | number | null {
    if (critereTri.value === 'categorie') return nomCategorieNote(note.categorieId)
    if (critereTri.value === 'statut') return note.statut === 'public' ? 0 : 1
    if (critereTri.value === 'modifieLe') return note.modifieLe ?? note.creeLe
    return note[critereTri.value]
  }

  function comparer(a: VueNoteCorpus, b: VueNoteCorpus): number {
    const va = valeurTri(a)
    const vb = valeurTri(b)
    if (va === null && vb !== null) return 1
    if (vb === null && va !== null) return -1
    let resultat = 0
    if (typeof va === 'number' && typeof vb === 'number') resultat = va - vb
    else resultat = String(va ?? '').localeCompare(String(vb ?? ''), 'fr', { sensitivity: 'base' })
    if (ordreTri.value === 'desc') resultat *= -1
    return resultat || a.entretienTitre.localeCompare(b.entretienTitre, 'fr') || a.rang - b.rang || a.id.localeCompare(b.id)
  }

  const notesFiltrees = computed(() => {
    const requete = cleRecherche(recherche.value.trim())
    const termeCorps = cleRecherche(motCle.value.trim())
    return inventaire.value.notes.filter((note) => {
      const corps = cleRecherche(texte(note))
      if (requete && !cleRecherche([
        note.titre,
        corps,
        nomCategorieNote(note.categorieId),
        note.entretienTitre,
      ].join(' ')).includes(requete)) return false
      if (termeCorps && !corps.includes(termeCorps)) return false
      if (categories.value.length && !categories.value.includes(note.categorieId)) return false
      if (entretiens.value.length && !entretiens.value.includes(note.entretienId)) return false
      if (statut.value !== 'tous' && note.statut !== statut.value) return false
      if (dateDebut.value && (!note.date || note.date < dateDebut.value)) return false
      if (dateFin.value && (!note.date || note.date > dateFin.value)) return false
      if (importants.value && !/<mark(?:\s|>)/i.test(note.corps)) return false
      if (avecLiens.value && !/\bdata-liens\s*=/i.test(note.corps)) return false
      return true
    }).sort(comparer)
  })

  function corpsAffiche(note: VueNoteCorpus): string {
    const commentaires = new Map(note.liensCommentaires.map((lien) => [lien.commentaireId, lien]))
    return corpsAvecRefsCommentaires(note.corps, document, (id) => commentaires.get(id) ?? null)
  }

  async function rafraichirNotes(): Promise<void> {
    if (chargementNotes) return chargementNotes
    const jeton = ++generation
    chargement.value = true
    let requete!: Promise<void>
    requete = (async () => {
      try {
        const resultat = await lireNotes()
        if (jeton !== generation) return
        inventaire.value = {
          ...resultat,
          notes: resultat.notes.map((note) => ({
            ...note,
            corps: sanitiserCorpsNote(note.corps, document),
          })),
        }
        charge.value = true
        erreur.value = ''
        erreurLecture.value = false
      } catch (cause) {
        if (jeton === generation) {
          erreur.value = cause instanceof Error ? cause.message : String(cause)
          erreurLecture.value = true
        }
      } finally {
        if (jeton === generation) chargement.value = false
        if (chargementNotes === requete) chargementNotes = null
      }
    })()
    chargementNotes = requete
    return requete
  }

  async function commander(commande: CommandeNotes): Promise<void> {
    if (idDistantCourant.value) throw new Error('Édition des notes distantes non disponible.')
    erreur.value = ''
    erreurLecture.value = false
    try {
      await commanderNotes(toRaw(commande))
      await Promise.all([rafraichirNotes(), rafraichirJournalCorpus()])
    } catch (cause) {
      erreur.value = cause instanceof Error ? cause.message : String(cause)
      throw cause
    }
  }

  async function modifier(note: VueNoteCorpus, champs: ChampsNote): Promise<void> {
    await commander({
      type: 'modifier',
      entretienId: note.entretienId,
      noteId: note.id,
      attendu: structuredClone(toRaw(note.attendu)),
      champs,
    })
  }

  async function supprimer(note: VueNoteCorpus): Promise<void> {
    await commander({
      type: 'supprimer',
      entretienId: note.entretienId,
      noteId: note.id,
      attendu: structuredClone(toRaw(note.attendu)),
    })
  }

  async function ouvrir(note: VueNoteCorpus): Promise<void> {
    erreur.value = ''
    erreurLecture.value = false
    try {
      await allerNotes(note.entretienId)
    } catch (cause) {
      erreur.value = cause instanceof Error ? cause.message : String(cause)
    }
  }

  function nomCorpusExport(): string {
    if (dossierCourantNom.value.trim()) return dossierCourantNom.value.trim()
    return dossierCourantDir.value?.split(/[\\/]/).filter(Boolean).at(-1) ?? 'Corpus'
  }

  function exporterMarkdown(): void {
    erreur.value = ''
    erreurLecture.value = false
    try {
      const maintenant = new Date()
      const nomCorpus = nomCorpusExport()
      const contenu = genererMarkdownNotes(notesFiltrees.value, nomCorpus, {
        document,
        nomCategorie: nomCategorieNote,
        maintenant,
      })
      const url = URL.createObjectURL(new Blob([contenu], { type: 'text/markdown;charset=utf-8' }))
      const lien = document.createElement('a')
      lien.href = url
      lien.download = nomFichierMarkdownNotes(nomCorpus, maintenant)
      document.body.appendChild(lien)
      lien.click()
      lien.remove()
      setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (cause) {
      erreur.value = cause instanceof Error ? cause.message : String(cause)
    }
  }

  function toutAfficher(): void {
    recherche.value = ''
    motCle.value = ''
    categories.value = []
    entretiens.value = []
    statut.value = 'tous'
    dateDebut.value = ''
    dateFin.value = ''
    importants.value = false
    avecLiens.value = false
  }

  function notesResume(): void {
    toutAfficher()
    const resume = categoriesNote.value.find((categorie) =>
      cleRecherche(categorie.nom) === cleRecherche('résumé'))
    categories.value = resume ? [resume.id] : []
  }

  function notesChronologiques(): void {
    critereTri.value = 'creeLe'
    ordreTri.value = 'desc'
  }

  function notesParEntretien(): void {
    critereTri.value = 'entretienTitre'
    ordreTri.value = 'asc'
  }

  watch(dossierCourantDir, () => {
    generation++
    chargementNotes = null
    inventaire.value = { notes: [], indisponibles: [] }
    charge.value = false
    chargement.value = false
    erreur.value = ''
    erreurLecture.value = false
    toutAfficher()
    critereTri.value = 'creeLe'
    ordreTri.value = 'desc'
    modeAffichage.value = 'cartes'
  })

  watch([actif, vue, dernierTirage, dossierCourantDir, revisionNotesCorpus], () => {
    if (actif.value && vue.value === 'corpus') void rafraichirNotes()
  }, { immediate: true })

  return {
    avecLiens,
    badgeVerrou,
    categories,
    categoriesNote,
    charge,
    chargement,
    corpsAffiche,
    couleurCategorieNote,
    critereTri,
    dateDebut,
    dateFin,
    entretiens,
    entretiensDisponibles,
    erreur,
    erreurLecture,
    exporterMarkdown,
    idDistantCourant,
    importants,
    inventaire,
    modeAffichage,
    modifier,
    motCle,
    nomCategorieNote,
    notesChronologiques,
    notesFiltrees,
    notesParEntretien,
    notesResume,
    ouvrir,
    ordreTri,
    rafraichirNotes,
    recherche,
    resumeIndisponibles,
    statut,
    supprimer,
    toutAfficher,
  }
}
