/**
 *  Tests du composable de la fenêtre « Docs cadre projet » : inventaire,
 *  sélection avec génération (une réponse tardive ne mélange jamais les
 *  documents), erreurs réseau qui conservent la liste chargée, fenêtres et
 *  réinitialisation à la bascule de corpus.
 */

import { afterEach, describe, expect, test, vi } from 'vitest'
import { effectScope, type EffectScope } from 'vue'
import { useDocsCadre } from '../src/renderer/composables/corpus/useDocsCadre'
import type { InventaireDocsCadre, ResultatLectureDocsCadre } from '../src/shared/docsCadre'

const fenetreInitiale = globalThis.window
const scopes: EffectScope[] = []

afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
  vi.restoreAllMocks()
  Object.defineProperty(globalThis, 'window', { value: fenetreInitiale, configurable: true })
})

function contexte(inventaire: InventaireDocsCadre, lecture?: ResultatLectureDocsCadre) {
  let ecouteursFocus: (() => void)[] = []
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      sonal: { docsCadre: undefined },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  })
  const docsCadre = {
    lister: vi.fn(async () => inventaire),
    lireApercu: vi.fn(async () => lecture ?? {
      resume: inventaire.projet[0],
      apercu: { genre: 'aucun' as const, raison: 'format' as const },
    }),
  }
  ;(globalThis.window as unknown as { sonal: object }).sonal = { docsCadre }
  return { docsCadre, ecouteursFocus }
}

function creerComposable(deps: { estDistant: () => boolean; fermerAutreFenetre: () => void } = {
  estDistant: () => false,
  fermerAutreFenetre: () => {},
}) {
  const scope = effectScope()
  const composable = scope.run(() => useDocsCadre(deps))!
  scopes.push(scope)
  return composable
}

const inventaireVide: InventaireDocsCadre = { mode: 'local', projet: [], exemples: [] }
const inventaireComplet: InventaireDocsCadre = {
  mode: 'local',
  projet: [{ source: 'projet', nom: 'consignes.txt', type: 'texte', taille: 3, modifieLe: null }],
  exemples: [{ source: 'exemple', nom: 'Guide de correction.txt', type: 'texte', taille: 3, modifieLe: null }],
}

describe('inventaire et sélection', () => {
  test('l’ouverture ferme les autres fenêtres, reçoit l’inventaire et garde l’état vide', async () => {
    const { docsCadre } = contexte(inventaireComplet)
    const fermerAutreFenetre = vi.fn()
    const d = creerComposable({ estDistant: () => false, fermerAutreFenetre })
    await d.afficherDocsCadre()
    expect(fermerAutreFenetre).toHaveBeenCalledOnce()
    expect(d.docsCadreOuverts.value).toBe(true)
    expect(d.documentsProjet.value.map((x) => x.nom)).toEqual(['consignes.txt'])
    expect(d.documentsExemples.value.map((x) => x.nom)).toEqual(['Guide de correction.txt'])
    expect(d.selection.value).toBeNull()
    d.selectionner({ source: 'exemple', nom: 'Guide de correction.txt' })
    expect(d.selection.value).toEqual({ source: 'exemple', nom: 'Guide de correction.txt' })
    expect(docsCadre.lireApercu).toHaveBeenCalledWith('exemple', 'Guide de correction.txt')
    d.fermerDocsCadre()
    expect(d.docsCadreOuverts.value).toBe(false)
    expect(d.selection.value).toBeNull()
    expect(d.apercu.value).toBeNull()
  })

  test('sélection absente de la liste actualisée : désélection propre', async () => {
    const { docsCadre } = contexte(inventaireComplet)
    const d = creerComposable()
    await d.afficherDocsCadre()
    d.selectionner({ source: 'projet', nom: 'consignes.txt' })
    expect(d.selection.value?.nom).toBe('consignes.txt')
    // Le fichier a disparu du corpus entre deux listes.
    const apresSuppression: InventaireDocsCadre = { mode: 'local', projet: [], exemples: inventaireComplet.exemples }
    docsCadre.lister.mockResolvedValue(apresSuppression)
    await d.rafraichirDocsCadre()
    expect(d.selection.value).toBeNull()
  })
})

describe('erreurs qui préservent la liste', () => {
  test('première ouverture distante hors ligne : mode et exemples restent disponibles', async () => {
    const inventaireHorsLigne: InventaireDocsCadre = {
      mode: 'distant',
      projet: [],
      exemples: inventaireComplet.exemples,
      erreurProjet: 'Serveur injoignable',
    }
    contexte(inventaireHorsLigne)
    const d = creerComposable({ estDistant: () => true, fermerAutreFenetre: () => {} })
    await d.afficherDocsCadre()
    expect(d.estDistant.value).toBe(true)
    expect(d.documentsProjet.value).toEqual([])
    expect(d.documentsExemples.value.map((x) => x.nom)).toEqual(['Guide de correction.txt'])
    expect(d.erreurListe.value).toBe('Serveur injoignable')
  })

  test('échec de lister : message explicite, listes déjà chargées intactes', async () => {
    const { docsCadre } = contexte(inventaireComplet)
    const d = creerComposable()
    await d.afficherDocsCadre()
    docsCadre.lister.mockRejectedValueOnce(new Error('Serveur injoignable'))
    await d.rafraichirDocsCadre()
    expect(d.erreurListe.value).toBe('Serveur injoignable')
    // La liste n'est JAMAIS remplacée par une liste vide à cause d'une panne.
    expect(d.documentsProjet.value.map((x) => x.nom)).toEqual(['consignes.txt'])
    expect(d.documentsExemples.value.map((x) => x.nom)).toEqual(['Guide de correction.txt'])
  })
})

describe('génération : une réponse tardive ne s’affiche jamais', () => {
  test('bascule rapide entre deux documents', async () => {
    const { docsCadre } = contexte(inventaireComplet)
    let liberation: (() => void) | null = null
    docsCadre.lireApercu.mockImplementation(async (source: string, nom: string) => {
      if (nom === 'lent.txt') {
        return new Promise<ResultatLectureDocsCadre>((resoudre) => {
          liberation = () =>
            resoudre({
              resume: { source: 'projet', nom: 'lent.txt', type: 'texte', taille: null, modifieLe: null },
              apercu: { genre: 'aucun', raison: 'format' },
            })
        })
      }
      return {
        resume: { source: 'projet', nom, type: 'texte', taille: null, modifieLe: null },
        apercu: { genre: 'texte', contenu: 'rapide' },
      }
    })
    const inventaireLent: InventaireDocsCadre = {
      mode: 'local',
      projet: [
        { source: 'projet', nom: 'lent.txt', type: 'texte', taille: null, modifieLe: null },
        { source: 'projet', nom: 'rapide.txt', type: 'texte', taille: null, modifieLe: null },
      ],
      exemples: [],
    }
    docsCadre.lister.mockResolvedValue(inventaireLent)
    const d = creerComposable()
    await d.afficherDocsCadre()
    d.selectionner({ source: 'projet', nom: 'lent.txt' })
    d.selectionner({ source: 'projet', nom: 'rapide.txt' })
    await Promise.resolve()
    expect(d.apercu.value).toEqual({ genre: 'texte', contenu: 'rapide' })
    // La réponse tardive du document quitté arrive : elle est ignorée.
    liberation?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(d.apercu.value).toEqual({ genre: 'texte', contenu: 'rapide' })
    expect(d.selection.value?.nom).toBe('rapide.txt')
  })
})

describe('mutations locales', () => {
  test('renommage : garde de forme locale et collision expliquée', async () => {
    const { docsCadre } = contexte(inventaireComplet)
    const d = creerComposable()
    await d.afficherDocsCadre()
    expect(d.nomRenommageValide('Notice (2).txt')).toBe(true)
    expect(d.nomRenommageValide('a/b.txt')).toBe(false)
    await d.renommerDocCadre('consignes.txt', 'a/b.txt')
    // La garde de forme du renderer refuse AVANT l'IPC.
    docsCadre.renommer = vi.fn(async () => ({ ok: true as const, nom: 'notice.txt' }))
    await d.renommerDocCadre('consignes.txt', 'a/b.txt')
    expect(docsCadre.renommer).not.toHaveBeenCalled()
    docsCadre.renommer = vi.fn(async () => ({ ok: false as const, raison: 'existe' as const, suggere: 'consignes-2.txt' }))
    await d.renommerDocCadre('consignes.txt', 'notice.txt')
    expect(d.messageAction.value).toContain('consignes-2.txt')
  })

  test('suppression confirmée : sélection libérée et message affiché', async () => {
    const { docsCadre } = contexte(inventaireComplet)
    const d = creerComposable()
    await d.afficherDocsCadre()
    d.selectionner({ source: 'projet', nom: 'consignes.txt' })
    docsCadre.supprimer = vi.fn(async () => ({ ok: true as const, nom: 'consignes.txt' }))
    docsCadre.lister.mockResolvedValue({ mode: 'local', projet: [], exemples: inventaireComplet.exemples })
    d.demanderSuppression('consignes.txt')
    expect(d.documentASupprimer.value).toBe('consignes.txt')
    await d.confirmerSuppression()
    expect(docsCadre.supprimer).toHaveBeenCalledWith('consignes.txt')
    expect(d.messageAction.value).toContain('corbeille')
    expect(d.selection.value).toBeNull()
  })

  test('ajout : collision reprise avec le nom libre proposé', async () => {
    const { docsCadre } = contexte(inventaireComplet)
    const d = creerComposable()
    await d.afficherDocsCadre()
    docsCadre.ajouterFichier = vi
      .fn()
      .mockResolvedValueOnce({ ok: false as const, raison: 'existe' as const, suggere: 'notice-2.txt' })
      .mockResolvedValueOnce({ ok: true as const, nom: 'notice-2.txt' })
    await d.ajouterFichier()
    expect(docsCadre.ajouterFichier).toHaveBeenCalledTimes(2)
    expect(docsCadre.ajouterFichier).toHaveBeenLastCalledWith('notice-2.txt')
    expect(d.messageAction.value).toContain('notice-2.txt')
  })

  test('corpus distant : les mutations lèvent une erreur explicite relayée', async () => {
    const { docsCadre } = contexte(inventaireComplet)
    const d = creerComposable()
    await d.afficherDocsCadre()
    docsCadre.supprimer = vi.fn(async () => {
      throw new Error('Ces documents sont en lecture seule dans un corpus distant.')
    })
    d.demanderSuppression('consignes.txt')
    await d.confirmerSuppression()
    expect(d.messageAction.value).toContain('lecture seule')
  })
})

describe('dépôt par glisser-déposer', () => {
  test('copie, reçoit la liste et sélectionne le dernier fichier déposé', async () => {
    const { docsCadre } = contexte(inventaireComplet)
    const d = creerComposable()
    await d.afficherDocsCadre()
    docsCadre.deposer = vi.fn(async () => ({ ok: true as const, nom: 'depose.txt' }))
    docsCadre.lister.mockResolvedValue({
      mode: 'local',
      projet: [
        ...inventaireComplet.projet,
        { source: 'projet', nom: 'depose.txt', type: 'texte', taille: 1, modifieLe: null },
      ],
      exemples: inventaireComplet.exemples,
    })
    await d.deposerFichiers(['/tmp/depose.txt'])
    expect(docsCadre.deposer).toHaveBeenCalledWith('/tmp/depose.txt')
    expect(d.selection.value).toEqual({ source: 'projet', nom: 'depose.txt' })
    expect(d.messageAction.value).toContain('depose.txt')
  })

  test('homonyme : refus explicite, pas de renommage automatique', async () => {
    const { docsCadre } = contexte(inventaireComplet)
    const d = creerComposable()
    await d.afficherDocsCadre()
    docsCadre.deposer = vi.fn(async () => ({
      ok: false as const,
      raison: 'existe' as const,
      suggere: 'notice-2.txt',
    }))
    await d.deposerFichiers(['/tmp/notice.txt'])
    expect(docsCadre.deposer).toHaveBeenCalledTimes(1)
    expect(d.messageAction.value).toContain('porte déjà ce nom')
    expect(d.selection.value).toBeNull()
  })

  test('source non ordinaire : message explicite, rien de copié', async () => {
    const { docsCadre } = contexte(inventaireComplet)
    const d = creerComposable()
    await d.afficherDocsCadre()
    docsCadre.deposer = vi.fn(async () => ({ ok: false as const, raison: 'source' as const }))
    await d.deposerFichiers(['/tmp/dossier'])
    expect(d.messageAction.value).toContain('fichier ordinaire')
  })
})

describe('mode distant', () => {
  test('l’inventaire distant est repéré et la fenêtre suit', async () => {
    const inventaireDistant: InventaireDocsCadre = {
      mode: 'distant',
      projet: [{ source: 'projet', nom: 'Notice.pdf', type: 'pdf', taille: 10, modifieLe: null }],
      exemples: [],
    }
    contexte(inventaireDistant)
    const d = creerComposable()
    await d.afficherDocsCadre()
    expect(d.mode.value).toBe('distant')
    expect(d.estDistant.value).toBe(true)
  })
})

describe('bascule de corpus', () => {
  test('une réponse d’inventaire tardive ne repeuple pas l’ancien corpus', async () => {
    const { docsCadre } = contexte(inventaireComplet)
    let terminer: ((inventaire: InventaireDocsCadre) => void) | undefined
    docsCadre.lister.mockImplementationOnce(
      () => new Promise<InventaireDocsCadre>((resolve) => { terminer = resolve }),
    )
    const d = creerComposable()
    const ouverture = d.afficherDocsCadre()
    d.reinitialiserDocsCadre()
    terminer?.(inventaireComplet)
    await ouverture
    expect(d.documentsProjet.value).toEqual([])
    expect(d.documentsExemples.value).toEqual([])
    expect(d.docsCadreOuverts.value).toBe(false)
  })

  test('réinitialisation : fenêtre fermée, listes et sélection vidées', async () => {
    const { docsCadre } = contexte(inventaireComplet)
    const d = creerComposable()
    await d.afficherDocsCadre()
    d.selectionner({ source: 'projet', nom: 'consignes.txt' })
    d.reinitialiserDocsCadre()
    expect(d.docsCadreOuverts.value).toBe(false)
    expect(d.documentsProjet.value).toEqual([])
    expect(d.selection.value).toBeNull()
    expect(d.apercu.value).toBeNull()
    expect(d.mode.value).toBe('local')
  })
})
