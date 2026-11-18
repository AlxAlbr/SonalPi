import { computed, nextTick, ref, watch, type Ref } from 'vue'
import { utiliserSonal } from '../sonal'
import {
  commentairesDeEntretien,
  filtrerCommentaires,
  genererMarkdownCommentaires,
  nomFichierMarkdownCommentaires,
  normaliser,
  trierCommentaires,
  type CommentaireCorpus,
  type CritereTriCommentaires,
} from '../../editor/commentairesCorpus'

/** État de l'onglet Commentaires du corpus : lecture, filtres, tri et export. */
export function useCommentairesCorpus(actif: Ref<boolean>) {
  const {
    allerAuCommentaire,
    badgeVerrou,
    dernierTirage,
    dossierCourantDir,
    dossierCourantNom,
    listeEntretiens,
    ongletDroite,
    ouvertId,
    ouvrirAuSegment,
    vue,
  } = utiliserSonal()

  const commentaires = ref<CommentaireCorpus[]>([])
  const indisponibles = ref<{ id: string; titre: string }[]>([])
  const chargement = ref(false)
  const charge = ref(false)
  const erreur = ref('')

  const modeAffichage = ref<'tableau' | 'feuille'>('tableau')
  const recherche = ref('')
  const entretiens = ref<string[]>([])
  const auteurs = ref<string[]>([])
  const passagesSupprimes = ref(false)
  const critereTri = ref<CritereTriCommentaires>('entretien')
  const ordreTri = ref<'asc' | 'desc'>('asc')

  // Une lecture plus récente rend la précédente caduque.
  let generation = 0
  async function rafraichir(): Promise<void> {
    const numero = ++generation
    chargement.value = true
    erreur.value = ''
    const trouves: CommentaireCorpus[] = []
    const echecs: { id: string; titre: string }[] = []
    try {
      for (const e of listeEntretiens()) {
        const lecture = await window.sonal.corpus.lireEntretien(e.id)
        if (numero !== generation) return
        if (!lecture.ok) {
          echecs.push({ id: e.id, titre: e.titre })
          continue
        }
        trouves.push(...commentairesDeEntretien(e, lecture.data.corpsTexte, lecture.data.annotations))
      }
      commentaires.value = trouves
      indisponibles.value = echecs
      charge.value = true
    } catch (cause) {
      if (numero === generation) erreur.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      if (numero === generation) chargement.value = false
    }
  }

  const entretiensDisponibles = computed(() => {
    const vus = new Map<string, string>()
    for (const c of commentaires.value) vus.set(c.entretienId, c.entretienTitre)
    return [...vus].map(([id, titre]) => ({ id, titre }))
  })
  const auteursDisponibles = computed(() =>
    [...new Set(commentaires.value.map((c) => c.auteur))]
      .sort((a, b) => normaliser(a).localeCompare(normaliser(b), 'fr')))

  const commentairesFiltres = computed(() => {
    let liste = filtrerCommentaires(commentaires.value, recherche.value)
    if (entretiens.value.length) liste = liste.filter((c) => entretiens.value.includes(c.entretienId))
    if (auteurs.value.length) liste = liste.filter((c) => auteurs.value.includes(c.auteur))
    if (passagesSupprimes.value) liste = liste.filter((c) => c.orphelin)
    return trierCommentaires(liste, critereTri.value, ordreTri.value)
  })

  function toutAfficher(): void {
    recherche.value = ''
    entretiens.value = []
    auteurs.value = []
    passagesSupprimes.value = false
  }
  function parEntretien(): void {
    critereTri.value = 'entretien'
    ordreTri.value = 'asc'
  }
  function parAuteur(): void {
    critereTri.value = 'auteur'
    ordreTri.value = 'asc'
  }

  /** Ouvre l'entretien sur le passage commenté, avec le panneau Commentaires. */
  async function ouvrir(c: CommentaireCorpus): Promise<void> {
    erreur.value = ''
    try {
      await ouvrirAuSegment(c.entretienId, c.pos)
      if (ouvertId.value !== c.entretienId) return
      ongletDroite.value = 'commentaires'
      await nextTick()
      allerAuCommentaire(c.id)
    } catch (cause) {
      erreur.value = cause instanceof Error ? cause.message : String(cause)
    }
  }

  function exporterMarkdown(): void {
    erreur.value = ''
    try {
      const maintenant = new Date()
      const nomCorpus = dossierCourantNom.value.trim()
        || dossierCourantDir.value?.split(/[\\/]/).filter(Boolean).at(-1)
        || 'Corpus'
      const contenu = genererMarkdownCommentaires(commentairesFiltres.value, nomCorpus, maintenant)
      const url = URL.createObjectURL(new Blob([contenu], { type: 'text/markdown;charset=utf-8' }))
      const lien = document.createElement('a')
      lien.href = url
      lien.download = nomFichierMarkdownCommentaires(nomCorpus, maintenant)
      document.body.appendChild(lien)
      lien.click()
      lien.remove()
      setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (cause) {
      erreur.value = cause instanceof Error ? cause.message : String(cause)
    }
  }

  // Un autre corpus repart d'un onglet vierge.
  watch(dossierCourantDir, () => {
    generation++
    commentaires.value = []
    indisponibles.value = []
    charge.value = false
    chargement.value = false
    erreur.value = ''
    toutAfficher()
    parEntretien()
    modeAffichage.value = 'tableau'
  })

  watch(
    () => [actif.value, vue.value, dernierTirage.value, dossierCourantDir.value, listeEntretiens().map((e) => e.id).join('\n')],
    () => { if (actif.value && vue.value === 'corpus') void rafraichir() },
    { immediate: true },
  )

  return {
    auteurs,
    auteursDisponibles,
    badgeVerrou,
    charge,
    chargement,
    commentaires,
    commentairesFiltres,
    critereTri,
    entretiens,
    entretiensDisponibles,
    erreur,
    exporterMarkdown,
    indisponibles,
    modeAffichage,
    ordreTri,
    ouvrir,
    parAuteur,
    parEntretien,
    passagesSupprimes,
    rafraichir,
    recherche,
    toutAfficher,
  }
}
