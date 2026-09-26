import { computed, ref, toRaw, watch, type Ref } from 'vue'
import type { CorpusFichier, EntretienFichier, EntretienRef } from '../../../shared/format'
import {
  bornesSection,
  type CommandeRecueils,
  type ItemRecueil,
  type Recueil,
} from '../../../shared/corpus/recueils'
import {
  exporterRecueilMarkdown,
  exporterRecueilTexte,
  projeterRecueil,
  type ProjectionRecueil,
  type SourceRecueilChargee,
  type StyleNumerotation,
} from '../../editor/recueils'

const nouvelId = (prefixe: string): string => `${prefixe}-${globalThis.crypto.randomUUID()}`

export function useRecueilsCorpus(deps: {
  recueils: Ref<Record<string, Recueil>>
  membership: Ref<Record<string, EntretienRef>>
  ouvertId: Ref<string | null>
  sourceOuverte: () => EntretienFichier | null
  enregistrerRepereSelection: () => Promise<{ id: string; from: number; to: number }>
  ouvrirSource: (entretienId: string, pos: number) => void
  fermerAutreFenetre: () => void
  /** Le fournisseur sait-il garder la source publiée d'un passage repris ? */
  definitionsAvecSources: () => boolean
}) {
  const recueilOuvertId = ref<string | null>(null)
  const recueilsOuverts = ref(false)
  const projection = ref<ProjectionRecueil | null>(null)
  const chargement = ref(false)
  const messageRecueil = ref<string | null>(null)
  const etatSauvegardeRecueil = ref<'à jour' | 'enregistrement…' | 'conflit'>('à jour')
  const ajoutPassageEnAttente = ref<{
    recueilId: string
    item: Extract<ItemRecueil, { type: 'passage' }>
    avantId: string | null
  } | null>(null)
  let generation = 0

  const recueilOuvert = computed(() =>
    recueilOuvertId.value ? deps.recueils.value[recueilOuvertId.value] ?? null : null,
  )
  const listeRecueils = computed(() =>
    Object.values(deps.recueils.value).sort((a, b) => b.modifieLe.localeCompare(a.modifieLe)),
  )

  watch(deps.recueils, () => {
    if (recueilOuvertId.value && !deps.recueils.value[recueilOuvertId.value]) {
      recueilOuvertId.value = null
      projection.value = null
    } else if (recueilOuvertId.value) {
      void resoudreRecueil(recueilOuvertId.value)
    }
  })

  async function commander(commande: CommandeRecueils): Promise<void> {
    messageRecueil.value = null
    etatSauvegardeRecueil.value = 'enregistrement…'
    try {
      const corpus = await window.sonal.corpus.recueilsCommander(toRaw(commande))
      etatSauvegardeRecueil.value = 'à jour'
      deps.recueils.value = corpus.recueils ?? {}
      if (recueilOuvertId.value) await resoudreRecueil(recueilOuvertId.value)
    } catch (erreur) {
      etatSauvegardeRecueil.value = 'conflit'
      messageRecueil.value = erreur instanceof Error ? erreur.message : String(erreur)
      try {
        const corpus = await window.sonal.corpus.ouvrir()
        deps.recueils.value = corpus.recueils ?? {}
      } catch {
        // L'erreur initiale reste celle affichée.
      }
      throw erreur
    }
  }

  async function creerRecueil(nom: string): Promise<string> {
    const id = nouvelId('rec')
    await commander({ type: 'creer', id, nom })
    recueilOuvertId.value = id
    await resoudreRecueil(id)
    return id
  }

  async function afficherRecueils(): Promise<void> {
    deps.fermerAutreFenetre()
    recueilsOuverts.value = true
    if (recueilOuvertId.value) await resoudreRecueil(recueilOuvertId.value)
  }

  function fermerRecueils(): void {
    recueilsOuverts.value = false
  }

  async function ouvrirRecueil(id: string): Promise<void> {
    recueilOuvertId.value = id
    await resoudreRecueil(id)
  }

  async function resoudreRecueil(id = recueilOuvertId.value): Promise<ProjectionRecueil | null> {
    const recueil = id ? deps.recueils.value[id] : null
    if (!recueil) {
      projection.value = null
      return null
    }
    const maGeneration = ++generation
    chargement.value = true
    const sources = new Map<string, SourceRecueilChargee>()
    const ids = [...new Set(
      recueil.items
        .filter((item): item is Extract<ItemRecueil, { type: 'passage' }> => item.type === 'passage')
        .map((item) => item.source.entretienId),
    )]
    await Promise.all(ids.map(async (entretienId) => {
      if (entretienId === deps.ouvertId.value) {
        const data = deps.sourceOuverte()
        sources.set(entretienId, data
          ? { ok: true, data }
          : { ok: false, raison: 'Source ouverte indisponible.' })
        return
      }
      try {
        const lecture = await window.sonal.corpus.lireEntretien(entretienId)
        sources.set(entretienId, lecture.ok
          ? { ok: true, data: lecture.data }
          : { ok: false, raison: lecture.raison, invalide: lecture.raison === 'version' })
      } catch (erreur) {
        sources.set(entretienId, {
          ok: false,
          raison: erreur instanceof Error ? erreur.message : String(erreur),
        })
      }
    }))
    if (maGeneration !== generation || recueilOuvertId.value !== id) return null
    projection.value = projeterRecueil(
      { membership: deps.membership.value },
      structuredClone(toRaw(recueil)),
      sources,
    )
    chargement.value = false
    return projection.value
  }

  const ordre = (recueil: Recueil): string[] => recueil.items.map((item) => item.id)

  async function insererItem(item: ItemRecueil, avantId: string | null = null): Promise<void> {
    const recueil = recueilOuvert.value
    if (!recueil) throw new Error('Ouvrez un recueil avant d’ajouter un item.')
    await commander({
      type: 'inserer-item',
      recueilId: recueil.id,
      attenduOrdre: ordre(recueil),
      item,
      avantId,
    })
  }

  async function ajouterTitre(libelle: string, niveau: 1 | 2 | 3 | 4): Promise<void> {
    await insererItem({ id: nouvelId('item'), type: 'titre', niveau, libelle })
  }

  async function ajouterTexte(texte: string): Promise<void> {
    await insererItem({ id: nouvelId('item'), type: 'texte', texte })
  }

  async function ajouterSelectionAuRecueil(recueilId: string, avantId: string | null = null): Promise<void> {
    // Reprendre un passage écrit une référence : le repère ne doit pas être
    // enregistré dans l'entretien pour une commande que le corpus refuse.
    if (!deps.definitionsAvecSources()) {
      throw new Error(
        'Ce corpus ne sait pas relire les entretiens publiés : '
        + 'reprendre un passage n’y est pas disponible.',
      )
    }
    recueilOuvertId.value = recueilId
    let recueil = deps.recueils.value[recueilId]
    if (!recueil) throw new Error("Ce recueil n'existe plus.")
    messageRecueil.value = null
    let attente = ajoutPassageEnAttente.value
    if (!attente || attente.recueilId !== recueilId) {
      const repere = await deps.enregistrerRepereSelection()
      attente = {
        recueilId,
        avantId,
        item: {
          id: nouvelId('item'),
          type: 'passage',
          source: { entretienId: deps.ouvertId.value!, repereId: repere.id },
          commentaireEditorial: '',
        },
      }
      ajoutPassageEnAttente.value = attente
    } else {
      attente.avantId = avantId
    }
    try {
      recueil = deps.recueils.value[recueilId]
      if (!recueil) throw new Error("Ce recueil n'existe plus.")
      await commander({
        type: 'inserer-item',
        recueilId,
        attenduOrdre: ordre(recueil),
        item: attente.item,
        avantId: attente.avantId,
      })
      ajoutPassageEnAttente.value = null
    } catch (erreur) {
      messageRecueil.value = 'Le repère et l’item ont été conservés. Réessayez pour terminer l’ajout.'
      throw erreur
    }
  }

  function abandonnerAjoutPassage(): void {
    ajoutPassageEnAttente.value = null
    messageRecueil.value = null
  }

  async function modifierItem(attendu: ItemRecueil, item: ItemRecueil): Promise<void> {
    const recueil = recueilOuvert.value
    if (!recueil) return
    await commander({
      type: 'modifier-item',
      recueilId: recueil.id,
      itemId: attendu.id,
      attendu: structuredClone(toRaw(attendu)),
      item: structuredClone(toRaw(item)),
    })
  }

  async function supprimerItem(item: ItemRecueil): Promise<void> {
    const recueil = recueilOuvert.value
    if (!recueil) return
    await commander({
      type: 'supprimer-item',
      recueilId: recueil.id,
      itemId: item.id,
      attendu: structuredClone(toRaw(item)),
    })
  }

  async function deplacerItem(itemId: string, sens: -1 | 1): Promise<void> {
    const recueil = recueilOuvert.value
    if (!recueil) return
    const index = recueil.items.findIndex((item) => item.id === itemId)
    const cible = index + sens
    if (index < 0 || cible < 0 || cible >= recueil.items.length) return
    const avantId = sens < 0
      ? recueil.items[cible].id
      : recueil.items[cible + 1]?.id ?? null
    await commander({
      type: 'deplacer-item',
      recueilId: recueil.id,
      itemId,
      avantId,
      attenduOrdre: ordre(recueil),
    })
  }

  async function deplacerSection(titreId: string, sens: -1 | 1): Promise<void> {
    const recueil = recueilOuvert.value
    if (!recueil) return
    const bornes = bornesSection(recueil.items, titreId)
    let avantId: string | null = null
    if (sens < 0) {
      const titresPrecedents = recueil.items
        .slice(0, bornes.debut)
        .filter((item): item is Extract<ItemRecueil, { type: 'titre' }> => item.type === 'titre')
      const precedent = titresPrecedents.at(-1)
      if (!precedent) return
      avantId = precedent.id
    } else {
      const prochainTitre = recueil.items
        .slice(bornes.fin)
        .find((item) => item.type === 'titre')
      if (!prochainTitre) return
      const prochaineSection = bornesSection(recueil.items, prochainTitre.id)
      avantId = recueil.items[prochaineSection.fin]?.id ?? null
    }
    await commander({
      type: 'deplacer-section',
      recueilId: recueil.id,
      titreId,
      avantId,
      attenduOrdre: ordre(recueil),
    })
  }

  async function supprimerSection(titreId: string): Promise<void> {
    const recueil = recueilOuvert.value
    if (!recueil) return
    await commander({
      type: 'supprimer-section',
      recueilId: recueil.id,
      titreId,
      attenduOrdre: ordre(recueil),
    })
  }

  async function renommerRecueil(nom: string): Promise<void> {
    const recueil = recueilOuvert.value
    if (recueil) await commander({ type: 'renommer', recueilId: recueil.id, attendu: recueil.nom, nom })
  }

  async function changerModeRecueil(mode: Recueil['modeTexte']): Promise<void> {
    const recueil = recueilOuvert.value
    if (recueil) await commander({
      type: 'changer-mode',
      recueilId: recueil.id,
      attendu: recueil.modeTexte,
      mode,
    })
  }

  async function supprimerRecueil(): Promise<void> {
    const recueil = recueilOuvert.value
    if (!recueil) return
    await commander({
      type: 'supprimer-recueil',
      recueilId: recueil.id,
      attenduModifieLe: recueil.modifieLe,
    })
    recueilOuvertId.value = null
    projection.value = null
  }

  function voirPassage(item: ItemRecueilProjetePassage): void {
    if (item.etat === 'disponible' && item.from !== null) {
      recueilsOuverts.value = false
      deps.ouvrirSource(item.source.entretienId, item.from)
    }
  }

  async function exporter(
    format: 'md' | 'txt',
    choix: { commentaires: boolean; sources: boolean; numerotation: StyleNumerotation },
    confirmerIncomplet: (infos: { nombre: number; exemples: string[] }) => Promise<boolean> = async () => false,
  ): Promise<void> {
    const courant = await resoudreRecueil()
    if (!courant) return
    let incomplet = false
    if (courant.problemes > 0) {
      const exemples = courant.items
        .filter((item) => item.type === 'passage' && item.etat !== 'disponible')
        .slice(0, 5)
        .map((item) => item.type === 'passage' ? `${item.titreEntretien} : ${item.diagnostic}` : '')
      incomplet = await confirmerIncomplet({ nombre: courant.problemes, exemples })
      if (!incomplet) return
    }
    const options = {
      commentaires: choix.commentaires,
      sources: choix.sources,
      date: new Date().toLocaleString(),
      incomplet,
      numerotation: choix.numerotation,
    }
    const contenu = format === 'md'
      ? exporterRecueilMarkdown(courant, options)
      : exporterRecueilTexte(courant, options)
    const nom = courant.nom.replace(/[\\/:*?"<>|]/g, '-').trim() || 'recueil'
    await window.sonal.dialog.choisirExport(`${nom}.${format}`, contenu)
  }

  type ItemRecueilProjetePassage = Extract<NonNullable<typeof projection.value>['items'][number], { type: 'passage' }>

  return {
    recueils: deps.recueils,
    listeRecueils,
    recueilOuvertId,
    recueilOuvert,
    recueilsOuverts,
    afficherRecueils,
    fermerRecueils,
    projection,
    chargement,
    messageRecueil,
    etatSauvegardeRecueil,
    ajoutPassageEnAttente,
    creerRecueil,
    ouvrirRecueil,
    resoudreRecueil,
    ajouterTitre,
    ajouterTexte,
    ajouterSelectionAuRecueil,
    abandonnerAjoutPassage,
    modifierItem,
    supprimerItem,
    deplacerItem,
    deplacerSection,
    supprimerSection,
    renommerRecueil,
    changerModeRecueil,
    supprimerRecueil,
    voirPassage,
    exporterRecueil: exporter,
  }
}
