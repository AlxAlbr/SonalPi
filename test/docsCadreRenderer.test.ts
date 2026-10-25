/**
 *  Session documentaire : inventaire, sélection, actualisation et isolation des corpus.
 *  La visibilité du panneau est fournie par la navigation.
 */

import { afterEach, describe, expect, test, vi } from 'vitest'
import { effectScope, ref, type EffectScope } from 'vue'
import { useDocsCadre } from '../src/renderer/composables/corpus/useDocsCadre'
import type { InventaireDocsCadre, ResultatLectureDocsCadre } from '../src/shared/docsCadre'

const fenetreInitiale = globalThis.window
const scopes: EffectScope[] = []

afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
  vi.restoreAllMocks()
  Object.defineProperty(globalThis, 'window', { value: fenetreInitiale, configurable: true })
})

const inventaireComplet: InventaireDocsCadre = {
  mode: 'local',
  projet: [{ source: 'projet', nom: 'consignes.txt', type: 'texte', taille: 3, modifieLe: null }],
  exemples: [{ source: 'exemple', nom: 'Guide de correction.txt', type: 'texte', taille: 3, modifieLe: null }],
}

function contexte(inventaire: InventaireDocsCadre = inventaireComplet, distant = false) {
  const actif = ref(true)
  let surFocus: (() => void) | undefined
  const docsCadre = {
    lister: vi.fn(async () => inventaire),
    lireApercu: vi.fn(async (_source: string, nom: string): Promise<ResultatLectureDocsCadre> => ({
      resume: { source: 'projet', nom, type: 'texte', taille: 3, modifieLe: null },
      apercu: { genre: 'texte', contenu: nom },
    })),
    renommer: vi.fn(),
    supprimer: vi.fn(),
    ajouterFichier: vi.fn(),
    deposer: vi.fn(),
  }
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      sonal: { docsCadre },
      addEventListener: vi.fn((nom, ecouteur) => {
        if (nom === 'focus') surFocus = ecouteur
      }),
      removeEventListener: vi.fn(),
    },
  })
  const scope = effectScope()
  const d = scope.run(() => useDocsCadre({ estDistant: () => distant, actif }))!
  scopes.push(scope)
  return { d, docsCadre, actif, reprendreFocus: () => surFocus?.() }
}

async function terminerRequetes() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('inventaire et sélection', () => {
  test('la préparation reçoit l’inventaire sans choisir de document', async () => {
    const { d, docsCadre } = contexte()
    await d.preparerDocsCadre()
    expect(d.documentsProjet.value.map((x) => x.nom)).toEqual(['consignes.txt'])
    expect(d.documentsExemples.value.map((x) => x.nom)).toEqual(['Guide de correction.txt'])
    expect(d.selection.value).toBeNull()
    d.selectionner({ source: 'exemple', nom: 'Guide de correction.txt' })
    expect(d.selection.value).toEqual({ source: 'exemple', nom: 'Guide de correction.txt' })
    expect(docsCadre.lireApercu).toHaveBeenCalledWith('exemple', 'Guide de correction.txt')
  })

  test('masquer le panneau conserve sa sélection ; le retour relit liste et aperçu', async () => {
    const { d, docsCadre, actif } = contexte()
    await d.preparerDocsCadre()
    d.selectionner({ source: 'projet', nom: 'consignes.txt' })
    await terminerRequetes()
    actif.value = false
    expect(d.selection.value?.nom).toBe('consignes.txt')
    expect(d.apercu.value).toEqual({ genre: 'texte', contenu: 'consignes.txt' })
    actif.value = true
    docsCadre.lireApercu.mockResolvedValueOnce({
      resume: inventaireComplet.projet[0],
      apercu: { genre: 'texte', contenu: 'Contenu modifié' },
    })
    await d.preparerDocsCadre()
    expect(docsCadre.lister).toHaveBeenCalledTimes(2)
    expect(d.selection.value?.nom).toBe('consignes.txt')
    expect(d.apercu.value).toEqual({ genre: 'texte', contenu: 'Contenu modifié' })
  })

  test('un document absent de la liste actualisée est désélectionné', async () => {
    const { d, docsCadre } = contexte()
    await d.preparerDocsCadre()
    d.selectionner({ source: 'projet', nom: 'consignes.txt' })
    docsCadre.lister.mockResolvedValue({ mode: 'local', projet: [], exemples: inventaireComplet.exemples })
    await d.rafraichirDocsCadre()
    expect(d.selection.value).toBeNull()
    expect(d.apercu.value).toBeNull()
  })

  test('le retour de focus ne relit que le panneau local actif', async () => {
    const { d, docsCadre, actif, reprendreFocus } = contexte()
    await d.preparerDocsCadre()
    actif.value = false
    reprendreFocus()
    expect(docsCadre.lister).toHaveBeenCalledOnce()
    actif.value = true
    reprendreFocus()
    await terminerRequetes()
    expect(docsCadre.lister).toHaveBeenCalledTimes(2)
  })

  test('le retour de focus ne relit pas les documents distants', async () => {
    const { d, docsCadre, reprendreFocus } = contexte({ ...inventaireComplet, mode: 'distant' }, true)
    await d.preparerDocsCadre()
    reprendreFocus()
    expect(docsCadre.lister).toHaveBeenCalledOnce()
  })
})

describe('erreurs qui préservent la liste', () => {
  test('premier accès distant hors ligne : mode et exemples restent disponibles', async () => {
    const { d } = contexte({
      mode: 'distant', projet: [], exemples: inventaireComplet.exemples, erreurProjet: 'Serveur injoignable',
    }, true)
    await d.preparerDocsCadre()
    expect(d.estDistant.value).toBe(true)
    expect(d.documentsProjet.value).toEqual([])
    expect(d.documentsExemples.value.map((x) => x.nom)).toEqual(['Guide de correction.txt'])
    expect(d.erreurListe.value).toBe('Serveur injoignable')
  })

  test('échec de lister : message explicite et listes déjà chargées intactes', async () => {
    const { d, docsCadre } = contexte()
    await d.preparerDocsCadre()
    docsCadre.lister.mockRejectedValueOnce(new Error('Serveur injoignable'))
    await d.rafraichirDocsCadre()
    expect(d.erreurListe.value).toBe('Serveur injoignable')
    expect(d.documentsProjet.value.map((x) => x.nom)).toEqual(['consignes.txt'])
    expect(d.documentsExemples.value.map((x) => x.nom)).toEqual(['Guide de correction.txt'])
  })
})

describe('réponses tardives', () => {
  test('une lecture lente ne remplace pas le document sélectionné ensuite', async () => {
    const { d, docsCadre } = contexte()
    let terminer: ((lecture: ResultatLectureDocsCadre) => void) | undefined
    docsCadre.lireApercu.mockImplementationOnce(
      () => new Promise<ResultatLectureDocsCadre>((resolve) => { terminer = resolve }),
    )
    await d.preparerDocsCadre()
    d.selectionner({ source: 'projet', nom: 'lent.txt' })
    d.selectionner({ source: 'projet', nom: 'rapide.txt' })
    await terminerRequetes()
    terminer?.({ resume: inventaireComplet.projet[0], apercu: { genre: 'texte', contenu: 'Lent' } })
    await terminerRequetes()
    expect(d.apercu.value).toEqual({ genre: 'texte', contenu: 'rapide.txt' })
    expect(d.selection.value?.nom).toBe('rapide.txt')
  })

  test('un inventaire de l’ancien corpus ne déclenche pas une lecture dans le nouveau', async () => {
    const { d, docsCadre } = contexte()
    let terminer: ((inventaire: InventaireDocsCadre) => void) | undefined
    docsCadre.lister.mockImplementationOnce(
      () => new Promise<InventaireDocsCadre>((resolve) => { terminer = resolve }),
    )
    const ancienneOuverture = d.preparerDocsCadre()
    d.reinitialiserDocsCadre()
    await d.preparerDocsCadre()
    d.selectionner({ source: 'projet', nom: 'consignes.txt' })
    await terminerRequetes()
    const lectures = docsCadre.lireApercu.mock.calls.length
    terminer?.({ mode: 'local', projet: [], exemples: [] })
    await ancienneOuverture
    expect(docsCadre.lireApercu).toHaveBeenCalledTimes(lectures)
    expect(d.documentsProjet.value).toEqual(inventaireComplet.projet)
    expect(d.selection.value?.nom).toBe('consignes.txt')
  })

  test('une lecture de l’ancien corpus ne remplit pas le panneau réinitialisé', async () => {
    const { d, docsCadre } = contexte()
    let terminer: ((lecture: ResultatLectureDocsCadre) => void) | undefined
    docsCadre.lireApercu.mockImplementationOnce(
      () => new Promise<ResultatLectureDocsCadre>((resolve) => { terminer = resolve }),
    )
    await d.preparerDocsCadre()
    d.selectionner({ source: 'projet', nom: 'consignes.txt' })
    d.reinitialiserDocsCadre()
    terminer?.({ resume: inventaireComplet.projet[0], apercu: { genre: 'texte', contenu: 'Ancien corpus' } })
    await terminerRequetes()
    expect(d.documentsProjet.value).toEqual([])
    expect(d.selection.value).toBeNull()
    expect(d.apercu.value).toBeNull()
  })
})

describe('mutations locales', () => {
  test('renommage : garde de forme locale et collision expliquée', async () => {
    const { d, docsCadre } = contexte()
    await d.preparerDocsCadre()
    expect(d.nomRenommageValide('Notice (2).txt')).toBe(true)
    expect(d.nomRenommageValide('a/b.txt')).toBe(false)
    await d.renommerDocCadre('consignes.txt', 'a/b.txt')
    expect(docsCadre.renommer).not.toHaveBeenCalled()
    docsCadre.renommer.mockResolvedValue({ ok: false, raison: 'existe', suggere: 'consignes-2.txt' })
    await d.renommerDocCadre('consignes.txt', 'notice.txt')
    expect(d.messageAction.value).toContain('consignes-2.txt')
  })

  test('suppression confirmée : sélection libérée et message affiché', async () => {
    const { d, docsCadre } = contexte()
    await d.preparerDocsCadre()
    d.selectionner({ source: 'projet', nom: 'consignes.txt' })
    docsCadre.supprimer.mockResolvedValue({ ok: true, nom: 'consignes.txt' })
    docsCadre.lister.mockResolvedValue({ mode: 'local', projet: [], exemples: inventaireComplet.exemples })
    d.demanderSuppression('consignes.txt')
    expect(d.documentASupprimer.value).toBe('consignes.txt')
    await d.confirmerSuppression()
    expect(docsCadre.supprimer).toHaveBeenCalledWith('consignes.txt')
    expect(d.messageAction.value).toContain('corbeille')
    expect(d.selection.value).toBeNull()
  })

  test('ajout : collision reprise avec le nom libre proposé', async () => {
    const { d, docsCadre } = contexte()
    await d.preparerDocsCadre()
    docsCadre.ajouterFichier
      .mockResolvedValueOnce({ ok: false, raison: 'existe', suggere: 'notice-2.txt' })
      .mockResolvedValueOnce({ ok: true, nom: 'notice-2.txt' })
    await d.ajouterFichier()
    expect(docsCadre.ajouterFichier).toHaveBeenCalledTimes(2)
    expect(docsCadre.ajouterFichier).toHaveBeenLastCalledWith('notice-2.txt')
    expect(d.messageAction.value).toContain('notice-2.txt')
  })

  test('corpus distant : les refus de mutation sont relayés', async () => {
    const { d, docsCadre } = contexte({ ...inventaireComplet, mode: 'distant' }, true)
    await d.preparerDocsCadre()
    docsCadre.supprimer.mockRejectedValue(new Error('Ces documents sont en lecture seule dans un corpus distant.'))
    d.demanderSuppression('consignes.txt')
    await d.confirmerSuppression()
    expect(d.messageAction.value).toContain('lecture seule')
  })
})

describe('dépôt par glisser-déposer', () => {
  test('copie, reçoit la liste et sélectionne le dernier fichier déposé', async () => {
    const { d, docsCadre } = contexte()
    await d.preparerDocsCadre()
    docsCadre.deposer.mockResolvedValue({ ok: true, nom: 'depose.txt' })
    docsCadre.lister.mockResolvedValue({
      ...inventaireComplet,
      projet: [...inventaireComplet.projet,
        { source: 'projet', nom: 'depose.txt', type: 'texte', taille: 1, modifieLe: null }],
    })
    await d.deposerFichiers(['/tmp/depose.txt'])
    expect(docsCadre.deposer).toHaveBeenCalledWith('/tmp/depose.txt')
    expect(d.selection.value).toEqual({ source: 'projet', nom: 'depose.txt' })
    expect(d.messageAction.value).toContain('depose.txt')
  })

  test('homonyme : refus explicite, pas de renommage automatique', async () => {
    const { d, docsCadre } = contexte()
    await d.preparerDocsCadre()
    docsCadre.deposer.mockResolvedValue({ ok: false, raison: 'existe', suggere: 'notice-2.txt' })
    await d.deposerFichiers(['/tmp/notice.txt'])
    expect(docsCadre.deposer).toHaveBeenCalledTimes(1)
    expect(d.messageAction.value).toContain('porte déjà ce nom')
    expect(d.selection.value).toBeNull()
  })

  test('source non ordinaire : message explicite, rien de copié', async () => {
    const { d, docsCadre } = contexte()
    await d.preparerDocsCadre()
    docsCadre.deposer.mockResolvedValue({ ok: false, raison: 'source' })
    await d.deposerFichiers(['/tmp/dossier'])
    expect(d.messageAction.value).toContain('fichier ordinaire')
  })
})

describe('bascule de corpus', () => {
  test('réinitialisation : listes, sélection, messages et requêtes vidés', async () => {
    const { d } = contexte()
    await d.preparerDocsCadre()
    d.selectionner({ source: 'projet', nom: 'consignes.txt' })
    d.demanderSuppression('consignes.txt')
    d.reinitialiserDocsCadre()
    expect(d.documentsProjet.value).toEqual([])
    expect(d.documentsExemples.value).toEqual([])
    expect(d.selection.value).toBeNull()
    expect(d.apercu.value).toBeNull()
    expect(d.documentASupprimer.value).toBeNull()
    expect(d.messageAction.value).toBeNull()
    expect(d.chargementListe.value).toBe(false)
    expect(d.chargementApercu.value).toBe(false)
    expect(d.mode.value).toBe('local')
  })
})
