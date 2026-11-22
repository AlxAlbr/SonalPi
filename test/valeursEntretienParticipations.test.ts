import { describe, expect, test, vi } from 'vitest'
import { computed, reactive, ref } from 'vue'
import { useValeursEntretien } from '../src/renderer/composables/entretien/useValeursEntretien'
import { annuler, appliquerInverse, enregistrer, estApplicable, type CtxInverse, type Inverse, type Journal, type ParticipationJournal } from '../src/shared/entretien/journal'
import type { ItemLotValeur } from '../src/shared/corpus/valeursVariables'
import { entretienCasNatif } from './fixtures/casNatifs'

function banc(resoudre: (idVar: string, libelle: string) => Promise<string> = async () => 'libre') {
  const data = entretienCasNatif()
  data.participations.push({ ...data.participations[0], id: '7', index: 11, nom: data.participations[0].nom,
    locuteurRef: 'autre-identite', valeursLoc: { question: 'a' } })
  const ouvertId = ref<string | null>('e1')
  const participations = ref<ParticipationJournal[]>(data.participations)
  const meta = reactive(data.meta)
  const editable = ref(true), definitions = ref(true)
  const journal: Journal = { entrees: [] }
  let numero = 0
  const action = vi.fn((libelle: string, inverse: Inverse) => enregistrer(journal, libelle, inverse, () => `j-${++numero}`))
  const sauvegarder = vi.fn(), rafraichir = vi.fn(), modalite = vi.fn(resoudre)
  const outils = useValeursEntretien({
    ouvertId, participations, meta, editable: () => editable.value,
    valeurExiste: () => definitions.value, libelleValeur: (v, m) => `${v}/${m}`,
    modaliteParLibelle: modalite, enregistrerAction: action, rafraichirJournal: rafraichir, planifierSauvegarde: sauvegarder,
  })
  const item = (entretienId = 'e1', participationId = '7'): ItemLotValeur => ({
    entretienId, cible: { type: 'participation', participationId }, idVar: 'question', idMod: 'b',
  })
  const contexte = (): CtxInverse => ({
    entretienId: ouvertId.value, entretien: { annotations: [], ancres: [], reperesPassages: [] },
    participations: participations.value, valeursGen: meta.valeursGen,
  })
  const photo = () => JSON.parse(JSON.stringify({ participations: participations.value, meta }))
  return { data, ouvertId, participations, meta, editable, definitions, journal, action, sauvegarder, rafraichir, modalite,
    ...outils, item, contexte, photo }
}

function differee() {
  let terminer!: (id: string) => void
  const promesse = new Promise<string>((resolve) => { terminer = resolve })
  return { promesse, terminer }
}

describe('valeurs de l’entretien et références de participation', () => {
  test.each(['entretien', 'participation'] as const)('les vues suivent l’ajout, la correction et l’effacement d’une valeur %s', (type) => {
    const b = banc()
    const cible = type === 'entretien' ? { type } : { type, participationId: '7' }
    const valeurs = type === 'entretien' ? b.meta.valeursGen : b.participations.value[1].valeursLoc
    const cles = computed(() => Object.keys(valeurs))
    const valeur = computed(() => valeurs.nouvelleVariable)
    expect(cles.value).not.toContain('nouvelleVariable')
    expect(valeur.value).toBeUndefined()
    const item = { entretienId: 'e1', cible, idVar: 'nouvelleVariable', idMod: 'ville' }
    expect(b.poserValeurEntretien(item)).toBe(true)
    expect(cles.value).toContain('nouvelleVariable')
    expect(valeur.value).toBe('ville')
    expect(b.poserValeurEntretien({ ...item, idMod: 'autre' })).toBe(true)
    expect(valeur.value).toBe('autre')
    expect(b.poserValeurEntretien({ ...item, idMod: '' })).toBe(true)
    expect(cles.value).not.toContain('nouvelleVariable')
    expect(valeur.value).toBeUndefined()
  })

  test('saisir puis annuler conserve les ids, les rôles, les notes et les paragraphes', () => {
    const b = banc(), avant = b.photo(), notes = structuredClone(b.data.notes), texte = structuredClone(b.data.corpsTexte)
    expect(b.poserValeurEntretien(b.item())).toBe(true)
    expect(b.participations.value[1].valeursLoc.question).toBe('b')
    expect(b.participations.value[0]).toEqual(avant.participations[0])
    expect(b.journal.entrees[0].inverse).toEqual({ type: 'poserValeur', entretienId: 'e1',
      cible: { type: 'participation', participationId: '7' }, idVar: 'question', idMod: 'a' })
    expect(annuler(b.journal, b.journal.entrees[0].id, b.contexte())).toBe(true)
    expect(b.photo()).toEqual(avant)
    expect(b.data.notes).toEqual(notes)
    expect(b.data.corpsTexte).toEqual(texte)
    expect(b.sauvegarder).toHaveBeenCalledOnce()
  })

  test('un changement d’index et d’ordre ne déplace pas la destination d’une annulation', () => {
    const b = banc()
    b.poserValeurEntretien(b.item())
    b.participations.value[0].index = 11
    b.participations.value[1].index = 7
    b.participations.value.reverse()
    expect(annuler(b.journal, b.journal.entrees[0].id, b.contexte())).toBe(true)
    expect(b.participations.value.find((p) => p.id === '7')?.valeursLoc).toEqual({ question: 'a' })
    expect(b.participations.value.map((p) => [p.id, p.index])).toEqual([['7', 7], [b.data.participations[1].id, 11]])
  })

  test('l’entretien reste propriétaire des valeurs générales et l’effacement reste annulable', () => {
    const b = banc(), avant = b.photo()
    b.meta.valeursGen.question = 'a'
    expect(b.poserValeurEntretien({ ...b.item(), cible: { type: 'entretien' }, idMod: '' })).toBe(true)
    expect(b.meta.valeursGen.question).toBeUndefined()
    expect(b.participations.value).toEqual(avant.participations)
    expect(appliquerInverse(b.journal.entrees[0].inverse, b.contexte())).toBe(true)
    expect(b.meta.valeursGen.question).toBe('a')
  })

  test.each(['disparue', 'autre-identite'])('une cible locale %s absente n’est pas remplacée par un index ou une identité corpus', (id) => {
    const b = banc(), avant = b.photo()
    expect(b.poserValeurEntretien(b.item('e1', id))).toBe(false)
    expect(b.photo()).toEqual(avant)
    expect(b.action).not.toHaveBeenCalled()
    expect(b.sauvegarder).not.toHaveBeenCalled()
  })

  test('les ids absents ne sont pas complétés par une saisie ou une annulation', () => {
    const b = banc()
    delete b.participations.value[1].id
    const avant = b.photo()
    expect(b.poserValeurEntretien(b.item())).toBe(false)
    expect(appliquerInverse({ type: 'poserValeur', ...b.item(), idMod: 'a' }, b.contexte())).toBe(false)
    expect(b.photo()).toEqual(avant)
  })

  test('un autre entretien portant le même id local n’est pas une destination équivalente', () => {
    const b = banc(), avant = b.photo()
    expect(b.poserValeurEntretien(b.item('e2'))).toBe(false)
    expect(appliquerInverse({ type: 'poserValeur', ...b.item('e2'), idMod: 'a' }, b.contexte())).toBe(false)
    expect(b.photo()).toEqual(avant)
    expect(b.sauvegarder).not.toHaveBeenCalled()
  })

  test('supprimer une participation puis réutiliser son index ne réactive pas son annulation', () => {
    const b = banc()
    b.poserValeurEntretien(b.item())
    b.participations.value[1] = { id: 'nouvelle', index: 11, nom: 'Même nom', valeursLoc: { question: 'nouvelle' } }
    const avant = b.photo(), entree = b.journal.entrees[0]
    expect(estApplicable(entree.inverse, b.contexte())).toBe(false)
    expect(annuler(b.journal, entree.id, b.contexte())).toBe(false)
    expect(b.journal.entrees).toHaveLength(1)
    expect(b.photo()).toEqual(avant)
  })

  test('les commandes indexées et les anciens inverses ne sont pas réinterprétés', () => {
    const b = banc(), avant = b.photo()
    const ancien = { ...b.item(), cible: { type: 'locuteur', index: 11 } } as unknown as ItemLotValeur
    expect(() => b.poserValeurEntretien(ancien)).toThrow('destination')
    for (const inverse of [
      { type: 'poserValeurLoc', index: 11, idVar: 'question', idMod: 'ancien' },
      { type: 'renommerLocuteur', index: 11, nom: 'Ancien nom' },
      { type: 'poserValeur', ...ancien, idMod: 'ancien' },
    ]) expect(appliquerInverse(inverse as unknown as Inverse, b.contexte())).toBe(false)
    expect(b.photo()).toEqual(avant)
  })

  test('les clés opaques de variables ne lisent ni ne modifient le prototype', () => {
    const b = banc(), prototype = Object.getPrototypeOf(b.meta.valeursGen)
    expect(b.poserValeurEntretien({ ...b.item(), cible: { type: 'entretien' }, idVar: 'constructor' })).toBe(true)
    expect(b.journal.entrees[0].inverse).toMatchObject({ idMod: null })
    expect(appliquerInverse(b.journal.entrees[0].inverse, b.contexte())).toBe(true)
    expect(Object.hasOwn(b.meta.valeursGen, 'constructor')).toBe(false)
    expect(Object.getPrototypeOf(b.meta.valeursGen)).toBe(prototype)
  })

  test('une saisie inchangée ne crée pas d’action artificielle', () => {
    const b = banc()
    expect(b.poserValeurEntretien({ ...b.item(), idMod: 'a' })).toBe(true)
    expect(b.action).not.toHaveBeenCalled()
    expect(b.sauvegarder).toHaveBeenCalledOnce()
  })
})

const changements: [string, (b: ReturnType<typeof banc>) => void][] = [
  ['autre entretien', (b) => { b.ouvertId.value = 'e2' }],
  ['session fermée', (b) => { b.ouvertId.value = null }],
  ['même entretien rouvert', (b) => { b.participations.value = b.participations.value.map((p) => ({ ...p })) }],
  ['valeurs générales rechargées', (b) => { b.meta.valeursGen = {} }],
  ['participation retirée', (b) => { b.participations.value.splice(1, 1) }],
  ['valeurs locales rechargées', (b) => { b.participations.value[1].valeursLoc = { question: 'a' } }],
  ['droits retirés', (b) => { b.editable.value = false }],
  ['définition supprimée', (b) => { b.definitions.value = false }],
]

describe('saisie libre différée dans l’entretien', () => {
  test.each(changements)('%s pendant la préparation : aucune écriture tardive', async (_nom, changer) => {
    const attente = differee(), b = banc(() => attente.promesse)
    const operation = b.poserValeurLibelleEntretien(b.item().cible, 'question', 'Texte libre')
    changer(b)
    const avant = b.photo()
    attente.terminer('libre')
    expect(await operation).toBe(false)
    expect(b.photo()).toEqual(avant)
    expect(b.action).not.toHaveBeenCalled()
    expect(b.sauvegarder).not.toHaveBeenCalled()
  })

  test('deux réponses arrivées dans le désordre ne remplacent pas la saisie la plus récente', async () => {
    const ancienne = differee(), recente = differee(), b = banc()
    b.modalite.mockImplementationOnce(() => ancienne.promesse).mockImplementationOnce(() => recente.promesse)
    const premiere = b.poserValeurLibelleEntretien(b.item().cible, 'question', 'Première réponse')
    const seconde = b.poserValeurLibelleEntretien(b.item().cible, 'question', 'Seconde réponse')
    recente.terminer('recente')
    expect(await seconde).toBe(true)
    ancienne.terminer('ancienne')
    expect(await premiere).toBe(false)
    expect(b.participations.value[1].valeursLoc.question).toBe('recente')
    expect(b.journal.entrees).toHaveLength(1)
    expect(b.sauvegarder).toHaveBeenCalledOnce()
  })

  test('rechoisir la valeur initiale annule aussi la préparation précédente', async () => {
    const attente = differee(), b = banc(() => attente.promesse)
    const operation = b.poserValeurLibelleEntretien(b.item().cible, 'question', 'Ancienne réponse')
    b.poserValeurEntretien({ ...b.item(), idMod: 'a' })
    attente.terminer('ancienne')
    expect(await operation).toBe(false)
    expect(b.participations.value[1].valeursLoc.question).toBe('a')
    expect(b.action).not.toHaveBeenCalled()
    expect(b.sauvegarder).toHaveBeenCalledOnce()
  })

  test('une autre cellule reste indépendante pendant la préparation', async () => {
    const attente = differee(), b = banc(() => attente.promesse)
    const operation = b.poserValeurLibelleEntretien(b.item().cible, 'question', 'Texte libre')
    b.poserValeurEntretien({ ...b.item(), idVar: 'autre-variable' })
    attente.terminer('libre')
    expect(await operation).toBe(true)
    expect(b.participations.value[1].valeursLoc).toEqual({ question: 'libre', 'autre-variable': 'b' })
  })

  test('la fermeture peut attendre la saisie libre avant de prendre son instantané', async () => {
    const attente = differee(), b = banc(() => attente.promesse)
    const operation = b.poserValeurLibelleEntretien(b.item().cible, 'question', 'Texte libre')
    const instantane = vi.fn()
    const fermeture = b.attendreSaisies().then(() => instantane(b.photo()))
    await Promise.resolve()
    expect(instantane).not.toHaveBeenCalled()
    attente.terminer('libre')
    await fermeture
    expect(await operation).toBe(true)
    expect(instantane.mock.calls[0][0].participations[1].valeursLoc.question).toBe('libre')
  })

  test('la préservation après perte de droits annule les préparations sans attendre leur réponse', async () => {
    const attente = differee(), b = banc(() => attente.promesse)
    const operation = b.poserValeurLibelleEntretien(b.item().cible, 'question', 'Texte libre')
    b.annulerSaisies()
    await b.attendreSaisies()
    const avant = b.photo()
    attente.terminer('libre')
    expect(await operation).toBe(false)
    expect(b.photo()).toEqual(avant)
    expect(b.sauvegarder).not.toHaveBeenCalled()
  })

  test('une préparation en échec interrompt l’attente sans produire de valeur ou d’inverse', async () => {
    let echouer!: (erreur: Error) => void
    const attente = new Promise<string>((_resolve, reject) => { echouer = reject })
    const b = banc(() => attente), avant = b.photo()
    const operation = b.poserValeurLibelleEntretien({ type: 'entretien' }, 'question', 'Texte libre')
    const resultat = expect(operation).rejects.toThrow('indisponible')
    const fermeture = expect(b.attendreSaisies()).rejects.toThrow('indisponible')
    echouer(new Error('indisponible'))
    await Promise.all([resultat, fermeture])
    expect(b.photo()).toEqual(avant)
    expect(b.action).not.toHaveBeenCalled()
    expect(b.sauvegarder).not.toHaveBeenCalled()
  })

  test('une session non éditable ne prépare même pas de nouvelle modalité', async () => {
    const b = banc(), avant = b.photo()
    b.editable.value = false
    expect(b.poserValeurEntretien(b.item())).toBe(false)
    expect(await b.poserValeurLibelleEntretien(b.item().cible, 'question', 'Texte libre')).toBe(false)
    expect(b.modalite).not.toHaveBeenCalled()
    expect(b.photo()).toEqual(avant)
    expect(b.sauvegarder).not.toHaveBeenCalled()
  })
})
