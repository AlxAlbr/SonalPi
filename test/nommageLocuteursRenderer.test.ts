// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { ref } from 'vue'
import type { ParticipationLocuteur } from '../src/shared/format'
import type { InventaireIdentitesLocuteurs } from '../src/shared/corpus/personnes'
import { useLocuteursEntretien } from '../src/renderer/composables/entretien/useLocuteursEntretien'

const reference = { entretienId: 'courant', participationId: 'local' }
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
function banc(nomSource = 'Autre nom') {
  const locuteurs = ref<ParticipationLocuteur[]>([{ id: 'local', index: 11, nom: 'Nouveau locuteur', locuteurRef: null, valeursLoc: { v: 'm' }, couleur: '#123456' }])
  const ouvertId = ref<string | null>('courant'), editable = ref(true), local = ref(true)
  const source: ParticipationLocuteur = { id: 'local', index: 0, nom: nomSource, locuteurRef: 'source', valeursLoc: {}, pseudo: 'Pseudonyme source', interviewer: true }
  const inventaire = (): InventaireIdentitesLocuteurs => ({
    locuteurs: [{ id: 'source', nom: nomSource }, ...locuteurs.value.filter((p) => p.locuteurRef).map((p) => ({ id: p.locuteurRef!, nom: p.nom }))],
    participations: [
      ...JSON.parse(JSON.stringify(locuteurs.value)).map((p: ParticipationLocuteur) => ({ ...p, entretienId: 'courant', entretienTitre: 'Courant', participationId: p.id, interviewer: p.interviewer === true })),
      { ...source, entretienId: 'autre', entretienTitre: 'Source', participationId: source.id, interviewer: true },
    ], notes: [], indisponibles: [],
  })
  const api = { inventaireLocuteursDepuisEntretien: vi.fn(async () => inventaire()), personnesCommander: vi.fn() }
  vi.stubGlobal('sonal', undefined)
  Object.assign(window, { sonal: { corpus: api } })
  const effets = { enregistrerAction: vi.fn(), rafraichirJournal: vi.fn(), rafraichirProjections: vi.fn(), rafraichirGouttiere: vi.fn(),
    planifierSauvegarde: vi.fn(), viderSauvegarde: vi.fn(async () => {}), retirerLocuteurDesNotes: vi.fn() }
  const identifier = vi.fn(async (ref: typeof reference, _nom: string) => {
    await effets.viderSauvegarde()
    locuteurs.value.find((p) => p.id === ref.participationId)!.locuteurRef = 'nouvelle'
  })
  const rapprocher = vi.fn(async () => {})
  const outils = useLocuteursEntretien({ locuteurs, ouvertId, lectureSeule: () => !editable.value, identificationPossible: () => local.value,
    identifier, rapprocher, lireEditeur: () => null, effets })
  return { locuteurs, ouvertId, editable, local, source, inventaire, api, effets, identifier, rapprocher, ...outils }
}

test.each(['Enquêteur', 'Participant 1', 'Inconnu', 'X', 'Nouveau locuteur'])('valider %s identifie avant de calculer les propositions', async (nom) => {
  const b = banc(), avant = JSON.parse(JSON.stringify(b.locuteurs.value[0]))
  b.api.inventaireLocuteursDepuisEntretien.mockImplementation(async () => { expect(b.locuteurs.value[0].locuteurRef).toBe('nouvelle'); return b.inventaire() })
  b.renommerParticipation(reference, nom)
  await b.attendreNommages()
  expect(b.identifier).toHaveBeenCalledExactlyOnceWith(reference, nom)
  expect(b.locuteurs.value[0]).toEqual({ ...avant, nom, locuteurRef: 'nouvelle' })
  expect(b.api.personnesCommander).not.toHaveBeenCalled()
})

test('ajouter une entrée provisoire ne crée aucune identité, la validation du même libellé la crée', async () => {
  const b = banc(); b.nouveauLocuteur(); await b.attendreNommages()
  expect(b.identifier).not.toHaveBeenCalled()
  const nouvelle = b.locuteurs.value[1]
  expect(nouvelle.nom).toBe('Nouveau locuteur'); expect(nouvelle.locuteurRef).toBeNull()
  b.renommerParticipation({ entretienId: 'courant', participationId: nouvelle.id }, nouvelle.nom)
  await b.attendreNommages()
  expect(b.identifier).toHaveBeenCalledExactlyOnceWith({ entretienId: 'courant', participationId: nouvelle.id }, 'Nouveau locuteur')
})

test('plus tard conserve une identité distincte ; une seconde validation ne crée ni fiche ni nouvelle demande', async () => {
  const b = banc('Marie Dupont')
  b.renommerParticipation(reference, 'Marie Dupont'); await b.attendreNommages()
  expect(b.rapprochementNommage.value?.personneRef).toBe('nouvelle')
  expect(b.rapprochementNommage.value?.candidats).toHaveLength(1)
  b.reporterRapprochement()
  b.renommerParticipation(reference, 'Marie Dupont'); await b.attendreNommages()
  expect(b.locuteurs.value[0].locuteurRef).toBe('nouvelle')
  expect(b.identifier).toHaveBeenCalledOnce(); expect(b.rapprocher).not.toHaveBeenCalled()
  expect(b.rapprochementNommage.value).toBeNull()
})

test('seule la confirmation explicite utilise le rapprochement transactionnel', async () => {
  const b = banc('Marie Dupont')
  b.renommerParticipation(reference, 'Marie Dupont'); await b.attendreNommages()
  expect(b.rapprocher).not.toHaveBeenCalled()
  await b.deciderRapprochement('local', 'autre', 'lier')
  expect(b.rapprocher).toHaveBeenCalledOnce()
  const demande = b.rapprocher.mock.calls[0] as unknown as [unknown, unknown]
  expect(() => structuredClone(demande[0])).not.toThrow()
  expect(demande[0]).toMatchObject({ ...reference, source: { entretienId: 'autre', participationId: 'local' }, attendu: expect.any(String) })
  expect(b.api.personnesCommander).not.toHaveBeenCalled()
})

test('aucune de ces personnes mémorise le refus sans supprimer ni recréer l’identité distincte', async () => {
  const b = banc('Marie Dupont')
  b.renommerParticipation(reference, 'Marie Dupont'); await b.attendreNommages()
  await b.deciderRapprochement('local', 'autre', 'refuserTous')
  expect(b.locuteurs.value[0].locuteurRef).toBe('nouvelle')
  expect(b.locuteurs.value[0].rapprochementsRefuses).toEqual([{ type: 'locuteur', locuteurId: 'source' }])
  expect(b.identifier).toHaveBeenCalledOnce(); expect(b.rapprocher).not.toHaveBeenCalled()
})

test.each(['vide', 'retrait', 'lecture seule', 'distant'] as const)('%s : pas de création automatique', async (cas) => {
  const b = banc()
  if (cas === 'retrait') b.locuteurs.value[0].associationRetiree = true
  if (cas === 'lecture seule') b.editable.value = false
  if (cas === 'distant') b.local.value = false
  b.renommerParticipation(reference, cas === 'vide' ? '  ' : 'Marie Dupont'); await b.attendreNommages()
  expect(b.identifier).not.toHaveBeenCalled(); expect(b.api.inventaireLocuteursDepuisEntretien).not.toHaveBeenCalled()
  expect(b.locuteurs.value[0].locuteurRef).toBeNull()
})

test('deux noms saisis avant le démarrage de la création ne créent que le dernier', async () => {
  const b = banc()
  b.renommerParticipation(reference, 'Premier nom'); b.renommerParticipation(reference, 'Dernier nom')
  await b.attendreNommages()
  expect(b.identifier).toHaveBeenCalledExactlyOnceWith(reference, 'Dernier nom')
})

test('un inventaire distant indisponible après création ne présente pas l’identité vérifiée comme un échec', async () => {
  const b = banc()
  b.api.inventaireLocuteursDepuisEntretien.mockRejectedValueOnce(new Error('Un entretien est indisponible'))
  b.renommerParticipation(reference, 'X'); await b.attendreNommages()
  expect(b.locuteurs.value[0].locuteurRef).toBe('nouvelle')
  expect(b.messagePersonnes.value).toContain('Locuteur « X » créé')
  expect(b.messagePersonnes.value).toContain('Les rapprochements ne peuvent pas être vérifiés')
  expect(b.messagePersonnes.value).not.toContain('Identification non terminée')
  expect(b.identifier).toHaveBeenCalledOnce()
})

test('une erreur conserve le nom et une validation identique permet de reprendre', async () => {
  const b = banc(); b.identifier.mockRejectedValueOnce(new Error('Enregistrement indisponible'))
  b.renommerParticipation(reference, 'X'); await b.attendreNommages()
  expect(b.locuteurs.value[0].nom).toBe('X'); expect(b.locuteurs.value[0].locuteurRef).toBeNull()
  expect(b.messagePersonnes.value).toContain('Identification non terminée')
  b.renommerParticipation(reference, 'X'); await b.attendreNommages()
  expect(b.locuteurs.value[0].locuteurRef).toBe('nouvelle')
  expect(b.identifier).toHaveBeenCalledTimes(2)
})

test('une réponse de l’ancien entretien ne présente aucune proposition dans la nouvelle session', async () => {
  const b = banc('Marie Dupont'), cible = b.locuteurs.value[0]
  let reprendre!: () => void
  b.identifier.mockImplementationOnce(async () => { await new Promise<void>((r) => { reprendre = r }); cible.locuteurRef = 'ancienne' })
  b.renommerParticipation(reference, 'Marie Dupont')
  await vi.waitFor(() => expect(b.identifier).toHaveBeenCalledOnce())
  const ancien = b.attendreNommages()
  b.reinitialiser(); b.ouvertId.value = 'nouveau'; b.locuteurs.value = [{ ...cible, nom: 'Autre', locuteurRef: null }]
  reprendre(); await ancien
  expect(b.locuteurs.value[0].locuteurRef).toBeNull()
  expect(b.rapprochementNommage.value).toBeNull(); expect(b.messagePersonnes.value).toBe('')
  expect(b.api.inventaireLocuteursDepuisEntretien).not.toHaveBeenCalled()
})

test('reporter les propositions en préparation garde la création sans ouvrir ensuite un ancien dialogue', async () => {
  const b = banc('Marie Dupont')
  let terminer!: (v: InventaireIdentitesLocuteurs) => void
  b.api.inventaireLocuteursDepuisEntretien.mockImplementationOnce(() => new Promise((r) => { terminer = r }))
  b.renommerParticipation(reference, 'Marie Dupont')
  await vi.waitFor(() => expect(b.api.inventaireLocuteursDepuisEntretien).toHaveBeenCalledOnce())
  b.reporterRapprochement()
  terminer(b.inventaire()); await b.attendreNommages()
  expect(b.locuteurs.value[0].locuteurRef).toBe('nouvelle')
  expect(b.rapprochementNommage.value).toBeNull()
  expect(b.identifier).toHaveBeenCalledOnce()
})

test('une proposition périmée ne déclenche aucun rapprochement ni copie de données', async () => {
  const b = banc('Marie Dupont')
  b.renommerParticipation(reference, 'Marie Dupont'); await b.attendreNommages()
  b.source.pseudo = 'Modification externe'
  const avant = JSON.parse(JSON.stringify(b.locuteurs.value))
  await b.deciderRapprochement('local', 'autre', 'lier', { pseudo: true, variables: [] })
  expect(b.rapprocher).not.toHaveBeenCalled()
  expect(b.locuteurs.value).toEqual(avant)
  expect(b.messagePersonnes.value).toContain('ont changé')
})

test.each(['cible', 'source'])('les refus de la %s restent respectés après création de l’identité', async (cote) => {
  const b = banc('Marie Dupont')
  if (cote === 'cible') b.locuteurs.value[0].rapprochementsRefuses = [{ type: 'locuteur', locuteurId: 'source' }]
  else b.source.rapprochementsRefuses = [{ type: 'participation', ...reference }]
  b.renommerParticipation(reference, 'Marie Dupont'); await b.attendreNommages()
  expect(b.locuteurs.value[0].locuteurRef).toBe('nouvelle')
  expect(b.rapprochementNommage.value).toBeNull()
  expect(b.rapprocher).not.toHaveBeenCalled()
})
