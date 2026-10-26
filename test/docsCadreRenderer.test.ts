import { afterEach, describe, expect, test, vi } from 'vitest'
import { effectScope, ref, type EffectScope } from 'vue'
import { useDocsCadre } from '../src/renderer/composables/corpus/useDocsCadre'
import type { EntreeDocsCadre, InventaireDossierDocsCadre, ResultatLectureDocsCadre, SourceDocumentCadre } from '../src/shared/docsCadre'

const fenetreInitiale = globalThis.window
const scopes: EffectScope[] = []
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
  vi.restoreAllMocks()
  Object.defineProperty(globalThis, 'window', { value: fenetreInitiale, configurable: true })
})

function document(chemin: string, source: SourceDocumentCadre = 'projet'): EntreeDocsCadre {
  return { nature: 'document', chemin, source, nom: chemin.split('/').pop()!, type: 'texte', taille: 3, modifieLe: null }
}
function dossier(chemin: string, source: SourceDocumentCadre = 'projet'): EntreeDocsCadre {
  return { nature: 'dossier', chemin, source, nom: chemin.split('/').pop()! }
}
function inventaire(source: SourceDocumentCadre, chemin = '', entrees: EntreeDocsCadre[] = []): InventaireDossierDocsCadre {
  return { mode: 'local', source, dossier: chemin, entrees }
}
const arbre: Record<string, EntreeDocsCadre[]> = {
  'projet:': [dossier('DPO'), dossier('Guides'), document('consignes.txt')],
  'projet:DPO': [dossier('DPO/École'), document('DPO/notice.txt')],
  'projet:DPO/École': [document('DPO/École/notice.txt')],
  'projet:Guides': [document('Guides/notice.txt')],
  'exemple:': [dossier('DPO', 'exemple'), document('Guide.txt', 'exemple')],
  'exemple:DPO': [document('DPO/Modèle.txt', 'exemple')],
}
function contexte(distant = false) {
  const actif = ref(true)
  let surFocus: (() => void) | undefined
  const docsCadre = {
    lister: vi.fn(async (source: SourceDocumentCadre, chemin: string): Promise<InventaireDossierDocsCadre> => ({
      ...inventaire(source, chemin, arbre[`${source}:${chemin}`] ?? []), mode: distant && source === 'projet' ? 'distant' : 'local',
    })),
    lireApercu: vi.fn(async (source: SourceDocumentCadre, chemin: string): Promise<ResultatLectureDocsCadre> => ({
      resume: { ...document(chemin, source), nature: 'document', type: 'texte', taille: 3, modifieLe: null },
      apercu: { genre: 'texte', contenu: chemin },
    })),
    ajouterFichier: vi.fn(), deposer: vi.fn(), creerDossier: vi.fn(),
    ouvrirAvecApplication: vi.fn(), ouvrirDossierLocal: vi.fn(), afficherDansDossier: vi.fn(),
    ouvrirDansNextcloud: vi.fn(), enregistrerCopie: vi.fn(),
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    sonal: { docsCadre }, addEventListener: vi.fn((nom, cb) => { if (nom === 'focus') surFocus = cb }), removeEventListener: vi.fn(),
  } })
  const scope = effectScope()
  const d = scope.run(() => useDocsCadre({ estDistant: () => distant, actif }))!
  scopes.push(scope)
  return { d, docsCadre, actif, reprendreFocus: () => surFocus?.() }
}
async function terminerRequetes() { for (let i = 0; i < 8; i++) await Promise.resolve() }
function differee<T>() {
  let terminer!: (value: T) => void
  const promesse = new Promise<T>((resolve) => { terminer = resolve })
  return { promesse, terminer }
}

describe('navigation documentaire', () => {
  test('corpus plat compatible et exemples disponibles sans sélection automatique', async () => {
    const { d } = contexte()
    await d.preparerDocsCadre()
    expect(d.documentsProjet.value.map((e) => e.nom)).toEqual(['consignes.txt'])
    expect(d.entreesProjet.value[0].nature).toBe('dossier')
    expect(d.documentsExemples.value[0].nom).toBe('Guide.txt')
    expect(d.selection.value).toBeNull()
  })

  test('navigation, fil d’Ariane et désélection à l’entrée', async () => {
    const { d, docsCadre } = contexte()
    await d.preparerDocsCadre()
    d.selectionner({ source: 'projet', chemin: 'consignes.txt' })
    await d.naviguerDocsCadre('projet', 'DPO/École')
    expect(d.selection.value).toBeNull()
    expect(d.dossiersDocsCadre.value.projet).toBe('DPO/École')
    expect(docsCadre.lister).toHaveBeenLastCalledWith('projet', 'DPO/École')
    await d.naviguerDocsCadre('projet', '')
    expect(d.dossiersDocsCadre.value.projet).toBe('')
  })

  test('dossiers et sélections indépendants par onglet, identité par chemin', async () => {
    const { d, docsCadre } = contexte()
    await d.preparerDocsCadre()
    await d.naviguerDocsCadre('projet', 'DPO')
    d.selectionner({ source: 'projet', chemin: 'DPO/notice.txt' })
    await d.preparerDocsCadre('exemple')
    await d.naviguerDocsCadre('exemple', 'DPO')
    d.selectionner({ source: 'exemple', chemin: 'DPO/Modèle.txt' })
    await d.preparerDocsCadre('projet')
    expect(d.selection.value).toEqual({ source: 'projet', chemin: 'DPO/notice.txt' })
    await d.naviguerDocsCadre('projet', 'Guides')
    d.selectionner({ source: 'projet', chemin: 'Guides/notice.txt' })
    expect(docsCadre.lireApercu).toHaveBeenLastCalledWith('projet', 'Guides/notice.txt')
    await d.preparerDocsCadre('exemple')
    expect(d.selection.value).toEqual({ source: 'exemple', chemin: 'DPO/Modèle.txt' })
    expect(d.dossiersDocsCadre.value).toEqual({ projet: 'Guides', exemple: 'DPO' })
  })

  test('le retour relit liste et aperçu ; un fichier disparu est désélectionné', async () => {
    const { d, docsCadre, actif } = contexte()
    await d.preparerDocsCadre()
    d.selectionner({ source: 'projet', chemin: 'consignes.txt' })
    actif.value = false
    expect(d.selection.value?.chemin).toBe('consignes.txt')
    actif.value = true
    await d.preparerDocsCadre()
    expect(d.apercu.value).toEqual({ genre: 'texte', contenu: 'consignes.txt' })
    docsCadre.lister.mockResolvedValueOnce(inventaire('projet'))
    await d.rafraichirDocsCadre()
    expect(d.selection.value).toBeNull()
    expect(d.apercu.value).toBeNull()
  })

  test('dossier disparu : remonte plusieurs niveaux jusqu’au premier parent disponible', async () => {
    const { d, docsCadre } = contexte()
    await d.preparerDocsCadre()
    await d.naviguerDocsCadre('projet', 'DPO/École')
    docsCadre.lister.mockResolvedValueOnce({ ...inventaire('projet', 'DPO/École'), absent: true })
      .mockResolvedValueOnce({ ...inventaire('projet', 'DPO'), absent: true })
    await d.rafraichirDocsCadre()
    expect(d.dossiersDocsCadre.value.projet).toBe('')
    expect(d.entreesProjet.value).toEqual(arbre['projet:'])
  })

  test('focus réservé au panneau local actif', async () => {
    const { d, docsCadre, actif, reprendreFocus } = contexte()
    await d.preparerDocsCadre()
    docsCadre.lister.mockClear()
    actif.value = false
    reprendreFocus()
    expect(docsCadre.lister).not.toHaveBeenCalled()
    actif.value = true
    reprendreFocus()
    await terminerRequetes()
    expect(docsCadre.lister).toHaveBeenCalledOnce()
  })
})

describe('réseau et réponses tardives', () => {
  test('premier accès distant hors ligne : exemples et mode préservés', async () => {
    const { d, docsCadre, reprendreFocus } = contexte(true)
    docsCadre.lister.mockRejectedValueOnce(new Error('Hors ligne'))
    await d.preparerDocsCadre()
    expect(d.estDistant.value).toBe(true)
    expect(d.erreurListe.value).toBe('Hors ligne')
    expect(d.entreesExemples.value).toEqual(arbre['exemple:'])
    docsCadre.lister.mockClear()
    reprendreFocus()
    expect(docsCadre.lister).not.toHaveBeenCalled()
    await d.preparerDocsCadre('exemple')
    expect(d.estDistant.value).toBe(true)
  })

  test('navigation distante impossible : dossier et dernière liste inchangés', async () => {
    const { d, docsCadre } = contexte(true)
    await d.preparerDocsCadre()
    docsCadre.lister.mockResolvedValueOnce({ ...inventaire('projet', 'DPO'), erreur: 'Réseau coupé' })
    await d.naviguerDocsCadre('projet', 'DPO')
    expect(d.dossiersDocsCadre.value.projet).toBe('')
    expect(d.entreesProjet.value).toEqual(arbre['projet:'])
    expect(d.erreurListe.value).toBe('Réseau coupé')
  })

  test('navigation lente dépassée par une autre navigation', async () => {
    const { d, docsCadre } = contexte()
    await d.preparerDocsCadre()
    const lente = differee<InventaireDossierDocsCadre>()
    docsCadre.lister.mockReturnValueOnce(lente.promesse)
    const navigation = d.naviguerDocsCadre('projet', 'DPO')
    await d.naviguerDocsCadre('projet', 'Guides')
    lente.terminer(inventaire('projet', 'DPO', arbre['projet:DPO']))
    await navigation
    expect(d.dossiersDocsCadre.value.projet).toBe('Guides')
  })

  test('aperçu tardif ignoré après navigation', async () => {
    const { d, docsCadre } = contexte()
    await d.preparerDocsCadre()
    const lente = differee<ResultatLectureDocsCadre>()
    docsCadre.lireApercu.mockReturnValueOnce(lente.promesse)
    d.selectionner({ source: 'projet', chemin: 'consignes.txt' })
    await d.naviguerDocsCadre('projet', 'DPO')
    lente.terminer({ resume: document('consignes.txt') as ResultatLectureDocsCadre['resume'], apercu: { genre: 'texte', contenu: 'Ancien' } })
    await terminerRequetes()
    expect(d.selection.value).toBeNull()
    expect(d.apercu.value).toBeNull()
  })

  test('ancien corpus : liste et aperçu ne reviennent pas après réinitialisation', async () => {
    const { d, docsCadre } = contexte()
    const lente = differee<InventaireDossierDocsCadre>()
    docsCadre.lister.mockReturnValueOnce(lente.promesse)
    const ancienne = d.preparerDocsCadre()
    d.reinitialiserDocsCadre()
    await d.preparerDocsCadre()
    d.selectionner({ source: 'projet', chemin: 'consignes.txt' })
    lente.terminer(inventaire('projet'))
    await ancienne
    expect(d.entreesProjet.value).toEqual(arbre['projet:'])
    expect(d.selection.value?.chemin).toBe('consignes.txt')
    d.reinitialiserDocsCadre()
    expect(d.dossiersDocsCadre.value).toEqual({ projet: '', exemple: '' })
    expect(d.entreesProjet.value).toEqual([])
    expect(d.selection.value).toBeNull()
    expect(d.chargementListe.value).toBe(false)
  })
})

describe('actions ciblées', () => {
  test('ajout, collision, création et dépôt ciblent le dossier projet courant', async () => {
    const { d, docsCadre } = contexte()
    await d.preparerDocsCadre()
    await d.naviguerDocsCadre('projet', 'DPO')
    docsCadre.ajouterFichier.mockResolvedValueOnce({ ok: false, raison: 'existe', suggere: 'notice-2.txt' })
      .mockResolvedValueOnce({ ok: true, nom: 'notice-2.txt' })
    await d.ajouterFichier()
    expect(docsCadre.ajouterFichier).toHaveBeenLastCalledWith('DPO', 'notice-2.txt')
    expect(d.selection.value?.chemin).toBe('DPO/notice-2.txt')
    docsCadre.creerDossier.mockResolvedValue({ ok: true, nom: 'Consentements' })
    expect(await d.creerDossier('Consentements')).toBe(true)
    expect(docsCadre.creerDossier).toHaveBeenCalledWith('DPO', 'Consentements')
    expect(await d.creerDossier('../refus')).toBe(false)
    docsCadre.deposer.mockResolvedValue({ ok: true, nom: 'notice.txt' })
    await d.deposerFichiers(['/tmp/notice.txt', '/tmp/autre.txt'])
    expect(docsCadre.deposer).toHaveBeenCalledWith('/tmp/notice.txt', 'DPO')
    expect(d.selection.value?.chemin).toBe('DPO/notice.txt')
  })

  test('dépôt refusé : homonyme et source non ordinaire expliqués', async () => {
    const { d, docsCadre } = contexte()
    await d.preparerDocsCadre()
    docsCadre.deposer.mockResolvedValueOnce({ ok: false, raison: 'existe' }).mockResolvedValueOnce({ ok: false, raison: 'source' })
    await d.deposerFichiers(['/tmp/a', '/tmp/b'])
    expect(d.messageAction.value).toContain('porte déjà ce nom')
    expect(d.messageAction.value).toContain('fichier ordinaire')
    expect(d.selection.value).toBeNull()
  })

  test('ouverture, affichage et copie utilisent le chemin complet', async () => {
    const { d, docsCadre } = contexte()
    await d.preparerDocsCadre()
    await d.naviguerDocsCadre('projet', 'DPO')
    await d.ouvrirDossierLocal()
    await d.ouvrirDansNextcloud()
    await d.ouvrirAvecApplication('DPO/notice.txt')
    await d.afficherDansDossier('DPO/notice.txt')
    await d.enregistrerCopie('projet', 'DPO/notice.txt')
    expect(docsCadre.ouvrirDossierLocal).toHaveBeenCalledWith('DPO')
    expect(docsCadre.ouvrirDansNextcloud).toHaveBeenCalledWith('DPO')
    expect(docsCadre.ouvrirAvecApplication).toHaveBeenCalledWith('DPO/notice.txt')
    expect(docsCadre.afficherDansDossier).toHaveBeenCalledWith('DPO/notice.txt')
    expect(docsCadre.enregistrerCopie).toHaveBeenCalledWith('projet', 'DPO/notice.txt')
  })

  test('aucune mutation depuis les exemples ou un projet distant', async () => {
    for (const distant of [false, true]) {
      const { d, docsCadre } = contexte(distant)
      await d.preparerDocsCadre(distant ? 'projet' : 'exemple')
      await d.ajouterFichier()
      await d.creerDossier('Refus')
      await d.deposerFichiers(['/tmp/a'])
      expect(docsCadre.ajouterFichier).not.toHaveBeenCalled()
      expect(docsCadre.creerDossier).not.toHaveBeenCalled()
      expect(docsCadre.deposer).not.toHaveBeenCalled()
    }
  })

  test('un changement de corpus interrompt les dépôts restants', async () => {
    const { d, docsCadre } = contexte()
    await d.preparerDocsCadre()
    const lente = differee<{ ok: true; nom: string }>()
    docsCadre.deposer.mockReturnValueOnce(lente.promesse)
    const depot = d.deposerFichiers(['/tmp/a', '/tmp/b'])
    d.reinitialiserDocsCadre()
    lente.terminer({ ok: true, nom: 'a' })
    await depot
    expect(docsCadre.deposer).toHaveBeenCalledOnce()
    expect(d.messageAction.value).toBeNull()
  })
})
