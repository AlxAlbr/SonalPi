// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { effectScope, ref, toRaw, type EffectScope } from 'vue'
import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier } from '../src/shared/format'
import { appliquerCommandeRecueils, type CommandeRecueils, type Recueil } from '../src/shared/corpus/recueils'
import { useRecueilsCorpus } from '../src/renderer/composables/corpus/useRecueilsCorpus'

const date = '2026-09-01T10:00:00.000Z'
const scopes: EffectScope[] = []

function differe<T>() {
  let resoudre!: (valeur: T) => void
  const promesse = new Promise<T>((resolve) => { resoudre = resolve })
  return { promesse, resoudre }
}

function creer() {
  const recueil: Recueil = {
    id: 'r1', nom: 'Terrain', creeLe: date, modifieLe: date, modeTexte: 'pseudonymise',
    items: [{ id: 'i1', type: 'passage', source: { entretienId: 'e1', repereId: 'p1' }, commentaireEditorial: '' }],
  }
  const source: EntretienFichier = {
    formatVersion: FORMAT_VERSION, lastModified: date,
    corpsTexte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Terrain.' }] }] },
    annotations: [], ancres: [], locuteurs: [], meta: { valeursGen: {}, audioRef: null },
    reperesPassages: [{ id: 'p1', from: 1, to: 9 }],
  }
  const recueils = ref<Record<string, Recueil>>({ r1: recueil })
  const ouvertId = ref<string | null>(null)
  const lireEntretien = vi.fn(async () => ({ ok: true as const, data: source }))
  const recueilsCommander = vi.fn(async () => ({ recueils: { r1: recueil } } as CorpusFichier))
  const enregistrerRepereSelection = vi.fn(async () => ({ id: 'p1', from: 1, to: 9 }))
  const fermerAutreFenetre = vi.fn()
  ;(window as any).sonal = { corpus: { lireEntretien, recueilsCommander } }
  const scope = effectScope()
  scopes.push(scope)
  const outil = scope.run(() => useRecueilsCorpus({
    recueils,
    membership: ref({ e1: { titre: 'Source', date: null, lastModified: date } }),
    ouvertId, sourceOuverte: () => source, enregistrerRepereSelection,
    selectionCourante: () => ouvertId.value ? { entretienId: ouvertId.value, from: 1, to: 9, texte: 'Terrain.' } : null,
    ouvrirSource: vi.fn(), fermerAutreFenetre, definitionsAvecSources: () => true,
  }))!
  return { outil, recueils, ouvertId, recueil, source, lireEntretien, recueilsCommander, enregistrerRepereSelection }
}

afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  vi.restoreAllMocks()
})

describe('recueils — navigation et changement de corpus', () => {
  test('une réponse perdue après insertion se reprend avec le même item et le même repère', async () => {
    const { outil, recueils, ouvertId, recueil, recueilsCommander, enregistrerRepereSelection } = creer()
    ouvertId.value = 'e1'
    let disque: Record<string, Recueil> = { r1: structuredClone(recueil) }
    let perdre = true
    recueilsCommander.mockImplementation(async (...args: unknown[]) => {
      disque = appliquerCommandeRecueils(disque, args[0] as CommandeRecueils, { maintenant: () => date })
      if (perdre) { perdre = false; throw new Error('Réponse perdue') }
      return { recueils: structuredClone(disque) } as CorpusFichier
    })
    ;(window as any).sonal.corpus.ouvrir = async () => ({ recueils: structuredClone(disque) })
    outil.afficherRecueilsPourAssociation()
    await expect(outil.ajouterSelectionAuRecueil('r1')).rejects.toThrow('Réponse perdue')
    const attente = structuredClone(toRaw(outil.ajoutPassageEnAttente.value))
    outil.fermerRecueils()
    outil.afficherRecueilsPourAssociation()
    expect(outil.associationRecueil.value?.texte).toBe('Terrain.')
    await outil.ajouterSelectionAuRecueil('r1')
    expect(enregistrerRepereSelection).toHaveBeenCalledOnce()
    expect(recueils.value.r1.items).toHaveLength(2)
    expect(recueils.value.r1.items[1].id).toBe(attente?.item.id)
    expect(outil.recueilOuvertId.value).toBeNull()
    expect(outil.ajoutPassageEnAttente.value).toBeNull()
  })

  test('une création simple se reprend avec la même identité sans changer le document de gestion', async () => {
    const { outil, recueil, recueilsCommander } = creer()
    let disque: Record<string, Recueil> = { r1: structuredClone(recueil) }
    let perdre = true
    recueilsCommander.mockImplementation(async (...args: unknown[]) => {
      disque = appliquerCommandeRecueils(disque, args[0] as CommandeRecueils, { maintenant: () => date })
      if (perdre) { perdre = false; throw new Error('Réponse perdue') }
      return { recueils: structuredClone(disque) } as CorpusFichier
    })
    ;(window as any).sonal.corpus.ouvrir = async () => ({ recueils: structuredClone(disque) })
    await expect(outil.creerRecueilPourAssociation('Nouveau')).rejects.toThrow('Réponse perdue')
    const id = outil.creationRecueilAssociation.value?.id
    expect(await outil.creerRecueilPourAssociation('Nom ignoré au rejeu')).toBe(id)
    expect(Object.values(disque).filter((r) => r.nom === 'Nouveau')).toHaveLength(1)
    expect(outil.recueilOuvertId.value).toBeNull()
    outil.abandonnerAjoutPassage()
    expect(outil.creationRecueilAssociation.value).toBeNull()
  })

  test('la gestion ne charge rien avant accès et conserve le dernier résultat pendant une relecture', async () => {
    const { outil, source, lireEntretien } = creer()
    expect(lireEntretien).not.toHaveBeenCalled()
    await outil.ouvrirRecueil('r1')
    const precedent = outil.projection.value
    expect(precedent).not.toBeNull()
    expect(outil.recueilsOuverts.value).toBe(false)
    const lecture = differe<{ ok: true; data: EntretienFichier }>()
    lireEntretien.mockReturnValueOnce(lecture.promesse)
    const relecture = outil.resoudreRecueil()
    expect(outil.projection.value).toBe(precedent)
    expect(outil.chargement.value).toBe(true)
    lecture.resoudre({ ok: true, data: source })
    await relecture
    expect(outil.chargement.value).toBe(false)
    expect(outil.recueilOuvertId.value).toBe('r1')
  })

  test('une réponse source du corpus quitté ne remplit pas le nouveau panneau', async () => {
    const { outil, source, lireEntretien } = creer()
    const lecture = differe<{ ok: true; data: EntretienFichier }>()
    lireEntretien.mockReturnValueOnce(lecture.promesse)
    const ouverture = outil.ouvrirRecueil('r1')
    outil.reinitialiserRecueils()
    lecture.resoudre({ ok: true, data: source })
    await ouverture
    expect(outil.projection.value).toBeNull()
    expect(outil.recueilOuvertId.value).toBeNull()
    expect(outil.chargement.value).toBe(false)
  })

  test('une commande du corpus quitté ne remplace ni les définitions ni la sélection courante', async () => {
    const { outil, recueils, recueil, recueilsCommander } = creer()
    await outil.ouvrirRecueil('r1')
    const commande = differe<CorpusFichier>()
    recueilsCommander.mockReturnValueOnce(commande.promesse)
    const creation = outil.creerRecueil('Ancien brouillon')
    const rejet = expect(creation).rejects.toThrow('Le corpus a changé.')
    outil.reinitialiserRecueils()
    recueils.value = {}
    commande.resoudre({ recueils: { r1: recueil } } as CorpusFichier)
    await rejet
    expect(recueils.value).toEqual({})
    expect(outil.recueilOuvertId.value).toBeNull()
    expect(outil.messageRecueil.value).toBeNull()
    expect(outil.etatSauvegardeRecueil.value).toBe('à jour')
  })

  test('un repère créé avant la bascule ne devient pas un ajout du nouveau corpus', async () => {
    const { outil, ouvertId, enregistrerRepereSelection, recueilsCommander } = creer()
    ouvertId.value = 'e1'
    const repere = differe<{ id: string; from: number; to: number }>()
    enregistrerRepereSelection.mockReturnValueOnce(repere.promesse)
    const ajout = outil.ajouterSelectionAuRecueil('r1')
    const rejet = expect(ajout).rejects.toThrow('L’entretien a changé.')
    outil.reinitialiserRecueils()
    repere.resoudre({ id: 'p1', from: 1, to: 9 })
    await rejet
    expect(recueilsCommander).not.toHaveBeenCalled()
    expect(outil.ajoutPassageEnAttente.value).toBeNull()
    expect(outil.recueilOuvertId.value).toBeNull()
  })
})
