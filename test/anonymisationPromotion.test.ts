// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { reactive, ref } from 'vue'
import { useAnonymisationEntretien } from '../src/renderer/composables/entretien/useAnonymisationEntretien'
import type { Entretien } from '../src/shared/entretien/entretien'
import type { Locuteur, RegleAnon } from '../src/shared/format'

const editeurs: Editor[] = []
afterEach(() => {
  for (const editeur of editeurs.splice(0)) editeur.destroy()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'sonal')
})

function banc(
  texte = 'Rue de la Gare.',
  regles: RegleAnon[] = [],
  demanderDissociationCorpus?: (id: string, cible: 'entretien' | 'brouillon', entite: string) => Promise<boolean>,
) {
  const ed = new Editor({ extensions: [StarterKit], content: `<p>${texte}</p>` })
  editeurs.push(ed)
  const entretien: Entretien = { annotations: [], ancres: [], reperesPassages: [] }
  const creer = vi.fn(async (entite: string, pseudos: string[]) => {
    const regle = { id: 'r-nouvelle', entite: [entite], pseudos }
    regles.push(regle)
    return { regle, existait: false }
  })
  const ajouterPseudo = vi.fn(async (id: string, pseudo: string) => {
    const regle = regles.find((r) => r.id === id)!
    if (!regle.pseudos.includes(pseudo)) regle.pseudos.push(pseudo)
    return regle
  })
  Object.defineProperty(window, 'sonal', { configurable: true, value: { corpus: {
    regleAnonParEntite: vi.fn(async () => regles[0]), regleAnonCreer: creer,
    regleAnonAjouterPseudo: ajouterPseudo,
  } } })
  let anon!: ReturnType<typeof useAnonymisationEntretien>
  const sauvegarder = vi.fn()
  const locuteurs = ref<Locuteur[]>([])
  anon = useAnonymisationEntretien({
    entretien, locuteurs, ouvertId: ref('e1'), ongletDroite: ref('anon'), lireEditeur: () => ed,
    reglesAnon: () => regles, prioriteAnon: () => 'corpus', demanderDissociationCorpus,
    rafraichirReglesCorpus: vi.fn(async () => {}),
    rafraichirProjections: () => anon.rafraichirLignesAnon(),
    rafraichirDecorations: vi.fn(), planifierSauvegarde: sauvegarder,
  })
  return { ed, entretien, locuteurs, anon, creer, ajouterPseudo, sauvegarder }
}

describe('affichage et applications réussies', () => {
  test('la bascule tient compte des pseudos des locuteurs et des annotations', () => {
    const entretien = reactive<Entretien>({ annotations: [], ancres: [], reperesPassages: [] })
    const locuteurs = ref<Locuteur[]>([{ index: 0, nom: 'Karine' }])
    const anon = useAnonymisationEntretien({
      entretien, locuteurs, ouvertId: ref('e1'), ongletDroite: ref('anon'), lireEditeur: () => null,
      reglesAnon: () => [], prioriteAnon: () => 'entretien',
      rafraichirProjections: vi.fn(), rafraichirDecorations: vi.fn(), planifierSauvegarde: vi.fn(),
    })
    expect(anon.pseudonymisationUtilisee.value).toBe(false)
    locuteurs.value[0].pseudo = 'Claire'
    expect(anon.pseudonymisationUtilisee.value).toBe(true)
    locuteurs.value[0].pseudo = '  '
    expect(anon.pseudonymisationUtilisee.value).toBe(false)
    entretien.annotations.push({ id: 'a', type: 'anon', from: 1, to: 7, pseudo: 'Claire', auteur: 'test' })
    expect(anon.pseudonymisationUtilisee.value).toBe(true)
    entretien.annotations.splice(0)
    expect(anon.pseudonymisationUtilisee.value).toBe(false)
  })

  test('une validation locale ne signale que les occurrences effectivement appliquées', () => {
    const b = banc('Karine.')
    b.anon.validerAnon('Karine', '')
    b.anon.validerAnon('Absente', 'Claire')
    expect(b.anon.applicationsAnon.value).toBe(0)
    b.anon.validerAnon('Karine', 'Claire')
    expect(b.anon.applicationsAnon.value).toBe(1)
  })

  test('attend la réponse corpus avant de signaler une application', async () => {
    const b = banc('Karine.')
    let repondre!: (regle: RegleAnon | undefined) => void
    vi.mocked(window.sonal.corpus.regleAnonParEntite).mockImplementationOnce(
      () => new Promise((resolve) => { repondre = resolve }),
    )
    b.anon.creerBrouillon('Karine', 'Claire')
    const validation = b.anon.validerAvecPriorite('Karine', false)
    expect(b.anon.applicationsAnon.value).toBe(0)
    expect(b.entretien.annotations).toHaveLength(0)
    repondre(undefined)
    await validation
    expect(b.anon.applicationsAnon.value).toBe(1)
    expect(b.entretien.annotations).toHaveLength(1)
  })

  test('un échec corpus ne signale pas de réussite', async () => {
    const b = banc('Karine.')
    b.creer.mockRejectedValueOnce(new Error('Indisponible'))
    b.anon.creerBrouillon('Karine', 'Claire')
    await b.anon.validerAvecPriorite('Karine', false)
    expect(b.anon.hintAnon.value).toBe('Indisponible')
    expect(b.anon.applicationsAnon.value).toBe(0)
    expect(b.entretien.annotations).toHaveLength(0)
  })

  test('une définition corpus sans occurrence ne signale pas de pseudo appliqué', async () => {
    const b = banc('Karine.')
    b.anon.creerBrouillon('Absente', 'Claire')
    await b.anon.validerAvecPriorite('Absente', false)
    expect(b.creer).toHaveBeenCalledTimes(1)
    expect(b.anon.applicationsAnon.value).toBe(0)
  })
})

describe('portée corpus : aucune mutation limitée à l’entretien ouvert', () => {
  test.each([true, false, undefined])('corpus vers entretien délègue sans retirer de lien ni sauver : %s', async (accord) => {
    const demande = accord === undefined ? undefined : vi.fn(async () => accord)
    const b = banc('Karine.', [{ id: 'r', entite: ['Karine'], pseudos: ['Claire', 'Rebecca'], categorie: 'PER' }], demande)
    b.entretien.annotations.push({ id: 'a', type: 'anon', regle: 'r', from: 1, to: 7, pseudo: 'Claire', etat: 'anonymise', auteur: 'test' })
    b.anon.rafraichirLignesAnon()
    const avant = structuredClone(b.entretien)
    await b.anon.changerPorteeAnon('Karine', 'entretien')
    expect(b.entretien).toEqual(avant); expect(b.sauvegarder).not.toHaveBeenCalled()
    if (demande) expect(demande).toHaveBeenCalledExactlyOnceWith('r', 'entretien', 'Karine')
  })
  test.each([true, false])('corpus vers brouillon délègue au parcours inventorié sans mutation locale préalable : %s', async (accord) => {
    const regle = { id: 'r', entite: ['Karine'], pseudos: ['Claire', 'Rebecca'], categorie: 'PER' }
    const demande = vi.fn(async () => accord)
    const b = banc('Karine.', [regle], demande)
    b.entretien.annotations.push({ id: 'a', type: 'anon', regle: 'r', from: 1, to: 7, pseudo: 'Claire', etat: 'anonymise', auteur: 'test' })
    b.anon.rafraichirLignesAnon(); const avant = structuredClone(b.entretien)
    await b.anon.changerPorteeAnon('Karine', 'brouillon')
    expect(b.entretien).toEqual(avant); expect(regle.pseudos).toEqual(['Claire', 'Rebecca'])
    expect(b.sauvegarder).not.toHaveBeenCalled()
    expect(demande).toHaveBeenCalledExactlyOnceWith('r', 'brouillon', 'Karine')
  })
})

function preparerException() {
  const b = banc()
  b.entretien.annotations.push({ id: 'exception-interne', type: 'anon', from: 11, to: 15, auteur: 'test', etat: 'exception' })
  b.anon.creerBrouillon('Rue de la Gare', 'Quartier')
  b.sauvegarder.mockClear()
  return b
}

describe('retour en chantier local', () => {
  test('retire aussi une décision incluse sans retirer la décision englobante', async () => {
    const b = banc('Rue Karine.')
    b.entretien.annotations.push(
      { id: 'large', type: 'anon', from: 1, to: 11, auteur: 'test', pseudo: 'Quartier', etat: 'anonymise' },
      { id: 'interne', type: 'anon', from: 5, to: 11, auteur: 'test', pseudo: 'Claire', etat: 'anonymise' },
    )
    b.anon.rafraichirLignesAnon()
    expect(b.anon.lignesAnon.value.find((ligne) => ligne.entite === 'Karine')?.nbIncluse).toBe(1)
    await b.anon.changerPorteeAnon('Karine', 'brouillon')
    expect(b.entretien.annotations.map((annotation) => annotation.id)).toEqual(['large'])
    expect(b.anon.lignesAnon.value.find((ligne) => ligne.entite === 'Karine')?.etat).toBe('brouillon')
  })
})

describe('couverture des exceptions pendant la promotion', () => {
  test('demande confirmation avant de créer la définition corpus et annuler ne modifie rien', async () => {
    const b = preparerException()
    const avant = structuredClone(b.entretien)
    await b.anon.changerPorteeAnon('Rue de la Gare', 'corpus')
    expect(b.anon.confirmationCouverture.value?.nb).toBe(1)
    expect(b.creer).not.toHaveBeenCalled()
    expect(b.anon.applicationsAnon.value).toBe(0)
    b.anon.refuserCouverture()
    expect(b.anon.applicationsAnon.value).toBe(0)
    expect(b.entretien).toEqual(avant)
    expect(b.anon.brouillonsAnon.value).toHaveLength(1)
    expect(b.sauvegarder).not.toHaveBeenCalled()
  })

  test('confirmer pose l’englobante et conserve l’exception interne', async () => {
    const b = preparerException()
    await b.anon.changerPorteeAnon('Rue de la Gare', 'corpus')
    expect(b.anon.applicationsAnon.value).toBe(0)
    await b.anon.accepterCouverture()
    expect(b.anon.applicationsAnon.value).toBe(1)
    expect(b.creer).toHaveBeenCalledTimes(1)
    expect(b.entretien.annotations).toHaveLength(2)
    expect(b.entretien.annotations[0]).toMatchObject({ id: 'exception-interne', etat: 'exception' })
    expect(b.entretien.annotations[1]).toMatchObject({ from: 1, to: 15, regle: 'r-nouvelle', pseudo: 'Quartier' })
    expect(b.anon.brouillonsAnon.value).toEqual([])
  })

  test.each(['texte', 'brouillon', 'decision'] as const)('refuse une confirmation périmée par changement de %s', async (changement) => {
    const b = preparerException()
    await b.anon.changerPorteeAnon('Rue de la Gare', 'corpus')
    if (changement === 'texte') b.ed.commands.setContent('<p>Texte révisé.</p>')
    if (changement === 'brouillon') b.anon.majBrouillonLigne('Rue de la Gare', 'Autre')
    if (changement === 'decision') b.entretien.annotations[0].etat = 'anonymise'
    await b.anon.accepterCouverture()
    expect(b.creer).not.toHaveBeenCalled()
    expect(b.entretien.annotations).toHaveLength(1)
    expect(b.anon.hintAnon.value).toContain('changé')
    expect(b.anon.applicationsAnon.value).toBe(0)
  })

  test('la validation locale a la même garde de confirmation', async () => {
    const b = preparerException()
    b.anon.validerAnon('Rue de la Gare', 'Quartier')
    expect(b.entretien.annotations).toHaveLength(1)
    expect(b.anon.applicationsAnon.value).toBe(0)
    await b.anon.accepterCouverture()
    expect(b.anon.applicationsAnon.value).toBe(1)
    expect(b.entretien.annotations).toHaveLength(2)
    expect(b.creer).not.toHaveBeenCalled()
  })

  test('une revalidation conserve une variante déclarée sans occurrence actuelle', () => {
    const b = banc('Karine Karine')
    b.entretien.annotations.push({ id: 'a1', type: 'anon', from: 1, to: 7, auteur: 'test', pseudo: 'Claire', etat: 'anonymise' })
    b.anon.charger([], { karine: ['Claire', 'Rebecca'] })
    b.anon.validerAnon('Karine', 'Claire')
    expect(b.anon.pseudosDeclares.value.karine).toEqual(['Claire', 'Rebecca'])
    expect(b.entretien.annotations.every((a) => a.pseudo === 'Claire')).toBe(true)
  })

  test('garder les deux ne peut pas transformer un groupe d’alias en groupe multi-pseudo', async () => {
    const b = banc('Lyon', [{ id: 'r1', entite: ['Lyon', 'Lyons'], pseudos: ['Ville'] }])
    b.entretien.annotations.push({ id: 'a1', type: 'anon', from: 1, to: 5, auteur: 'test', pseudo: 'Cité', etat: 'anonymise' })
    b.anon.rafraichirLignesAnon()
    await b.anon.changerPorteeAnon('Lyon / Lyons', 'corpus')
    await b.anon.garderLesDeuxCorpus()
    expect(b.ajouterPseudo).not.toHaveBeenCalled()
    expect(b.entretien.annotations[0]).not.toHaveProperty('regle')
    expect(b.anon.hintAnon.value).toContain('plusieurs alias')
  })

  test('garder les deux rattache les variantes sans les aplatir', async () => {
    const b = banc('Karine Karine', [{ id: 'r1', entite: ['Karine'], pseudos: ['Claire'] }])
    b.entretien.annotations.push(
      { id: 'a1', type: 'anon', from: 1, to: 7, auteur: 'test', pseudo: 'Claire', etat: 'anonymise' },
      { id: 'a2', type: 'anon', from: 8, to: 14, auteur: 'test', pseudo: 'Rebecca', etat: 'anonymise' },
    )
    b.anon.charger([], { karine: ['Claire', 'Rebecca'] })
    b.anon.rafraichirLignesAnon()
    await b.anon.changerPorteeAnon('Karine', 'corpus')
    expect(b.anon.dialoguePorteeCorpus.value).not.toBeNull()
    expect(b.anon.applicationsAnon.value).toBe(0)
    await b.anon.garderLesDeuxCorpus()
    expect(b.anon.applicationsAnon.value).toBe(1)
    expect(b.entretien.annotations.map((a) => a.pseudo)).toEqual(['Claire', 'Rebecca'])
    expect(b.entretien.annotations.every((a) => a.regle === 'r1')).toBe(true)
  })
})
