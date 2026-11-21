import { afterEach, expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../src/main/corpusStore'
import { creerLocuteurFixture } from './fixtures/identitesLocuteurs'
import type { EntretienFichier } from '../src/shared/format'
import { payloadApresRapprochement, verifierPayloadRelecture, verifierRelectureIdentification } from '../src/shared/entretien/identificationLocuteurs'

const dossiers: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const dir of dossiers.splice(0)) rmSync(dir, { force: true, recursive: true }) })
function banc(nom = 'Marie Dupont') {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-nommage-')); dossiers.push(dir)
  const store = new CorpusStore(dir); store.ouvrir()
  const ajouter = (nom: string, titre: string) => {
    const { id } = store.creerEntretienVide(titre)
    const data: EntretienFichier = { formatVersion: 10, lastModified: '',
      corpsTexte: { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: 7 }, content: [{ type: 'text', text: 'Paroles conservées.' }] }] },
      annotations: [{ id: 'a', type: 'codage', auteur: 'test', code: 'theme', from: 1, to: 4 }], ancres: [{ pos: 1, t: 0 }],
      meta: { valeursGen: {}, audioRef: null },
      participations: [{ id: 'local', index: 7, nom, pseudo: 'Pseudo', interviewer: false, couleur: '#123456', valeursLoc: { variable: 'valeur' }, locuteurRef: null }],
      notes: [{ id: 'note', categorieId: 'ncat_generale', titre: 'Note', corps: 'À conserver.', date: null, statut: 'prive', rang: 0, participationIds: ['local'], creeLe: '', modifieLe: null }],
    }
    store.ecrireEntretien(id, data)
    return { entretienId: id, participationId: 'local', nom }
  }
  const cible = ajouter(nom, 'Cible'), source = ajouter(nom, 'Source')
  const lire = (id = cible.entretienId) => { const r = store.lireEntretien(id); if (!r.ok) throw new Error('Fixture illisible'); return r.data }
  const payload = () => { const { formatVersion: _v, lastModified: _d, ...p } = lire(); return p }
  const fichiers = () => [join(dir, 'corpus.crp'), cible.entretienId, source.entretienId].map((p, i) => readFileSync(i ? join(dir, 'entretiens', `${p}.json`) : p, 'utf8'))
  const identifier = () => store.identifierParticipationAuNommage(cible)
  const demande = (reprise = false) => ({ entretienId: cible.entretienId, participationId: cible.participationId,
    source: { entretienId: source.entretienId, participationId: source.participationId }, attendu: JSON.stringify(store.inventaireIdentitesLocuteurs()),
    ...(reprise ? { reprise: { pseudo: true, interviewer: true, variables: [], remplacer: true } } : {}) })
  store.ouvrirEntretienPourEdition(cible.entretienId)
  return { dir, store, cible, source, lire, payload, ajouter, fichiers, identifier, demande }
}

test.each(['Enquêteur', 'Participant 1', 'Inconnu', 'X', 'A', 'Nouveau locuteur', 'Speaker 2', '  Nom validé  '])('un nom validé %s crée une identité propre, sans modifier les données ni deviner le rôle', (nom) => {
  const b = banc(nom), avant = b.payload(), sourceAvant = b.fichiers()[2]
  const apres = b.identifier(), id = apres.participations[0].locuteurRef
  expect(id).toBeTruthy()
  expect(b.store.inventaireIdentitesLocuteurs().locuteurs).toEqual([{ id, nom: nom.trim() }])
  expect(b.store.inventaireIdentitesLocuteurs().participations.filter((p) => p.locuteurRef === id)).toHaveLength(1)
  verifierRelectureIdentification(avant, apres, b.cible)
  expect(apres.participations[0]).toEqual({ ...avant.participations[0], locuteurRef: id })
  expect(b.fichiers()[2]).toBe(sourceAvant)
  expect(b.identifier().participations[0].locuteurRef).toBe(id)
  expect(b.store.inventaireIdentitesLocuteurs().locuteurs).toHaveLength(1)
  expect(b.store.ouvrirEntretienPourEdition(b.cible.entretienId).ok).toBe(true)
})

test.each(['retrait', 'référence absente', 'sans référence'] as const)('la régularisation explicite dans l’entretien traite %s sans restaurer une association', (cas) => {
  const b = banc(), payload = b.payload()
  payload.participations[0].locuteurRef = cas === 'référence absente' ? 'disparu' : null
  if (cas === 'retrait') payload.participations[0].associationRetiree = true
  b.store.ecrireEntretien(b.cible.entretienId, payload)
  const avant = b.payload(), regulariser = { locuteurRef: avant.participations[0].locuteurRef, associationRetiree: !!avant.participations[0].associationRetiree }
  const sourceAvant = b.fichiers()[2]
  const apres = b.store.identifierParticipationAuNommage({ ...b.cible, regulariser })
  expect(apres.participations[0].locuteurRef).toBeTruthy()
  expect(apres.participations[0].locuteurRef).not.toBe('disparu')
  expect(apres.participations[0].associationRetiree).toBeUndefined()
  verifierRelectureIdentification(avant, apres, b.cible, false, regulariser)
  expect(b.fichiers()[2]).toBe(sourceAvant)
  expect(b.store.locuteursInventaire().locuteurs).toHaveLength(1)
  expect(b.store.locuteursInventaire().aVerifier).toHaveLength(1)
  expect(b.store.identifierParticipationAuNommage({ ...b.cible, regulariser }).participations[0].locuteurRef).toBe(apres.participations[0].locuteurRef)
})

test('une régularisation périmée ou mal formée ne modifie aucun fichier', () => {
  const b = banc(), avant = b.fichiers()
  expect(() => b.store.identifierParticipationAuNommage({ ...b.cible, regulariser: { locuteurRef: 'disparu', associationRetiree: false } })).toThrow('changé')
  expect(() => b.store.identifierParticipationAuNommage({ ...b.cible, regulariser: { locuteurRef: null, associationRetiree: 'oui' } } as never)).toThrow()
  expect(b.fichiers()).toEqual(avant)
})

test('deux noms égaux restent distincts avant toute décision', () => {
  const b = banc('Enquêteur'), id = b.identifier().participations[0].locuteurRef
  b.store.revoquerEcritureEntretien(b.cible.entretienId)
  b.store.ouvrirEntretienPourEdition(b.source.entretienId)
  const autre = b.store.identifierParticipationAuNommage(b.source).participations[0].locuteurRef
  expect(autre).not.toBe(id)
  expect(b.store.inventaireIdentitesLocuteurs().locuteurs).toHaveLength(2)
})

test.each(['vide', 'nom changé', 'retrait', 'lecture seule', 'session fermée', 'autre session', 'journal', 'préparation', 'format refusé'] as const)('%s : aucune création ni modification partielle', (cas) => {
  const b = banc()
  if (cas === 'vide') b.cible.nom = ' \t '
  if (cas === 'nom changé') b.cible.nom = 'Autre nom'
  if (cas === 'retrait') { const data = b.payload(); data.participations[0].associationRetiree = true; b.store.ecrireEntretien(b.cible.entretienId, data) }
  if (cas === 'lecture seule') b.store.lectureSeule = true
  if (cas === 'session fermée') b.store.revoquerEcritureEntretien(b.cible.entretienId)
  if (cas === 'autre session') b.store.ouvrirEntretienPourEdition(b.source.entretienId)
  if (cas === 'journal') writeFileSync(join(b.dir, '.transaction-fichiers.json'), '{}')
  if (cas === 'préparation') b.store.activerModePreparation([b.cible.entretienId], true)
  if (cas === 'format refusé') writeFileSync(join(b.dir, 'entretiens', `${b.cible.entretienId}.json`), JSON.stringify({ ...b.lire(), formatVersion: 9 }))
  const avant = b.fichiers()
  expect(() => cas === 'préparation' ? b.store.avecEcritureCorpus(() => b.identifier()) : b.identifier()).toThrow()
  expect(b.fichiers()).toEqual(avant)
})

test('une source indisponible diffère les suggestions, pas la création indépendante', () => {
  const b = banc()
  unlinkSync(join(b.dir, 'entretiens', `${b.source.entretienId}.json`))
  expect(b.identifier().participations[0].locuteurRef).toBeTruthy()
  expect(b.store.inventaireIdentitesLocuteurs().indisponibles).toHaveLength(1)
  const avant = readFileSync(join(b.dir, 'corpus.crp'), 'utf8')
  expect(() => b.store.rapprocherLocuteurDepuisEntretien(b.demande())).toThrow()
  expect(readFileSync(join(b.dir, 'corpus.crp'), 'utf8')).toBe(avant)
})

test('une réponse perdue se retrouve sans fiche vide supplémentaire et les anciennes associations ne peuvent pas être autosauvées', () => {
  const b = banc(), ancien = b.payload(), appliquer = b.store.appliquerTransactionFichiers.bind(b.store)
  vi.spyOn(b.store, 'appliquerTransactionFichiers').mockImplementationOnce((plan) => { appliquer(plan); throw new Error('Réponse perdue') })
  expect(() => b.identifier()).toThrow('Réponse perdue')
  expect(() => b.store.ecrireEntretien(b.cible.entretienId, ancien)).toThrow('associations')
  const retrouve = b.identifier()
  expect(b.store.inventaireIdentitesLocuteurs().locuteurs).toHaveLength(1)
  verifierRelectureIdentification(ancien, retrouve, b.cible)
})

test('une interruption entre la création et son association se reprend sans recréer une identité', () => {
  const b = banc(), avant = b.payload()
  vi.spyOn(b.store, 'appliquerTransactionFichiers').mockImplementationOnce((plan) => {
    writeFileSync(join(b.dir, '.transaction-fichiers.json'), JSON.stringify({ formatVersion: 1, plan }))
    writeFileSync(join(b.dir, 'corpus.crp'), JSON.stringify(plan.corpusApres))
    throw new Error('Interruption')
  })
  expect(() => b.identifier()).toThrow('Interruption')
  expect(() => b.store.ecrireEntretien(b.cible.entretienId, avant)).toThrow('Une modification reste à terminer')
  const repris = new CorpusStore(b.dir); repris.ouvrir(); repris.ouvrirEntretienPourEdition(b.cible.entretienId)
  const apres = repris.identifierParticipationAuNommage(b.cible)
  expect(repris.inventaireIdentitesLocuteurs().locuteurs).toHaveLength(1)
  verifierRelectureIdentification(avant, apres, b.cible)
})

test.each([false, true])('la réunion explicite absorbe l’identité provisoirement indépendante, reprise = %s', (reprise) => {
  const b = banc(), avant = b.payload(), idCible = b.identifier().participations[0].locuteurRef!
  const source = b.lire(b.source.entretienId)
  source.participations[0].pseudo = 'Source'
  source.participations[0].interviewer = true
  b.store.ecrireEntretien(b.source.entretienId, source)
  const idSource = creerLocuteurFixture(b.dir, 'Nom commun source', [b.source])
  const inventaire = b.store.inventaireIdentitesLocuteurs(), demande = b.demande(reprise), sauve = b.payload()
  const attendu = payloadApresRapprochement(sauve, demande, inventaire)
  const apres = b.store.rapprocherLocuteurDepuisEntretien(demande)
  verifierPayloadRelecture(attendu, apres)
  expect(apres.participations[0].locuteurRef).toBe(idSource)
  expect(apres.participations[0].nom).toBe(avant.participations[0].nom)
  expect(apres.participations[0].pseudo).toBe(reprise ? 'Source' : 'Pseudo')
  expect(apres.participations[0].interviewer).toBe(reprise)
  expect(b.store.inventaireIdentitesLocuteurs().locuteurs.map((l) => l.id)).toEqual([idSource])
  expect(b.store.ouvrir().locuteurs[idCible]).toBeUndefined()
  expect(() => b.store.ecrireEntretien(b.cible.entretienId, sauve)).toThrow('associations')
})

test('une proposition non associée rejoint explicitement la nouvelle identité sans autre création', () => {
  const b = banc(), id = b.identifier().participations[0].locuteurRef
  const demande = b.demande(), inv = b.store.inventaireIdentitesLocuteurs(), attendu = payloadApresRapprochement(b.payload(), demande, inv)
  const apres = b.store.rapprocherLocuteurDepuisEntretien(demande)
  verifierPayloadRelecture(attendu, apres)
  expect(b.lire(b.source.entretienId).participations[0].locuteurRef).toBe(id)
  expect(b.store.inventaireIdentitesLocuteurs().locuteurs).toHaveLength(1)
})

test('un aperçu périmé, une source du même entretien et une reprise invalide sont refusés sans écriture', () => {
  const b = banc(); b.identifier()
  const demande = b.demande(), ancien = b.fichiers()
  expect(() => b.store.rapprocherLocuteurDepuisEntretien({ ...demande, attendu: '{}' })).toThrow()
  expect(() => b.store.rapprocherLocuteurDepuisEntretien({ ...demande, source: b.cible })).toThrow()
  expect(() => b.store.rapprocherLocuteurDepuisEntretien({ ...demande, reprise: { variables: [], pseudo: 'non' } } as never)).toThrow()
  expect(b.fichiers()).toEqual(ancien)
})

test('les relectures refusent les changements de texte, notes, nom, rôle et données même si la référence paraît correcte', () => {
  const b = banc(), avant = b.payload(), apres = b.identifier()
  const mutations = [
    (e: EntretienFichier) => { e.formatVersion = 9 },
    (e: EntretienFichier) => { e.corpsTexte = { type: 'doc', content: [] } },
    (e: EntretienFichier) => { e.notes![0].corps = 'Autre note' },
    (e: EntretienFichier) => { e.participations[0].nom = 'Autre nom' },
    (e: EntretienFichier) => { e.participations[0].interviewer = true },
    (e: EntretienFichier) => { e.participations[0].valeursLoc.variable = 'Autre valeur' },
  ]
  for (const changer of mutations) { const modifie = structuredClone(apres); changer(modifie); expect(() => verifierRelectureIdentification(avant, modifie, b.cible)).toThrow() }
})

test('un marqueur de retrait explicitement faux n’empêche pas la création vérifiée', () => {
  const b = banc(), avant = b.payload(); avant.participations[0].associationRetiree = false
  b.store.ecrireEntretien(b.cible.entretienId, avant)
  verifierRelectureIdentification(avant, b.identifier(), b.cible)
})

test('un changement de source pendant la préparation est refusé sans écraser les données externes', () => {
  const b = banc(); b.identifier()
  const demande = b.demande(true), original = b.store.inventaireIdentitesLocuteurs.bind(b.store)
  let apresExterne: string[] = []
  vi.spyOn(b.store, 'inventaireIdentitesLocuteurs').mockImplementationOnce(() => {
    const avant = original(), source = b.lire(b.source.entretienId)
    source.participations[0].pseudo = 'Modification externe'
    b.store.ecrireEntretien(b.source.entretienId, source)
    apresExterne = b.fichiers()
    return avant
  })
  expect(() => b.store.rapprocherLocuteurDepuisEntretien(demande)).toThrow('ont changé')
  expect(b.fichiers()).toEqual(apresExterne)
})

test('une identité déjà présente dans cet entretien empêche la réunion avant toute reprise', () => {
  const b = banc(); b.identifier()
  const id = creerLocuteurFixture(b.dir, 'Source', [b.source])
  const data = b.payload()
  data.participations.push({ id: 'autre', index: 8, nom: 'Autre présence', locuteurRef: id, valeursLoc: {} })
  b.store.ecrireEntretien(b.cible.entretienId, data)
  const avant = b.fichiers()
  expect(() => b.store.rapprocherLocuteurDepuisEntretien(b.demande(true))).toThrow('plusieurs participations')
  expect(b.fichiers()).toEqual(avant)
})

test('les refus extérieurs et les cas suivent l’identité réunie, sans références pendantes', () => {
  const b = banc(), absorbe = b.identifier().participations[0].locuteurRef!
  const conserve = creerLocuteurFixture(b.dir, 'Source', [b.source])
  const data = b.payload()
  data.participations.push({ id: 'autre', index: 8, nom: 'Autre', locuteurRef: null, valeursLoc: {}, rapprochementsRefuses: [{ type: 'locuteur', locuteurId: absorbe }] })
  b.store.ecrireEntretien(b.cible.entretienId, data)
  b.store.casCommander({ type: 'creer', cas: { id: 'cas', nom: 'Suivi', memo: '', creeLe: '2026-01-01T00:00:00Z', modifieLe: '2026-01-01T00:00:00Z', rattachements: [], regles: [{ type: 'locuteur', locuteurId: absorbe, inclureEnqueteurs: true }] } })
  const demande = b.demande(), attendu = payloadApresRapprochement(b.payload(), demande, b.store.inventaireIdentitesLocuteurs())
  const apres = b.store.rapprocherLocuteurDepuisEntretien(demande)
  verifierPayloadRelecture(attendu, apres)
  expect(apres.participations[1].rapprochementsRefuses).toEqual([{ type: 'locuteur', locuteurId: conserve }])
  expect(b.store.ouvrir().cas?.cas.regles).toEqual([{ type: 'locuteurs', membres: [{ locuteurId: conserve, inclureEnqueteurs: true }] }])
})
