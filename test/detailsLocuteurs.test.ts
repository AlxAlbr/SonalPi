import { afterEach, expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../src/main/corpusStore'
import { creerLocuteurFixture, installerIdentitesFixture } from './fixtures/identitesLocuteurs'
import type { EntretienFichier } from '../src/shared/format'
import type { CommandeCorrectionLocuteurs } from '../src/shared/corpus/contratsLocuteurs'
import { validerCommandeCorrectionLocuteurs } from '../src/shared/corpus/contratsLocuteurs'
import { examinerLocuteurs, notesSelectionLocuteurs } from '../src/shared/corpus/detailsLocuteurs'
import { preparerApercuCorrectionLocuteurs } from '../src/shared/corpus/apercusCorrectionsLocuteurs'

const dossiers: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function banc() {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-details-')); dossiers.push(dir)
  const store = new CorpusStore(dir); store.ouvrir()
  const references = ['A', 'B', 'C'].map((titre) => {
    const { id } = store.creerEntretienVide(titre)
    const fichier: EntretienFichier = { formatVersion: 10, lastModified: '',
      corpsTexte: { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: 7 }, content: [{ type: 'text', text: `Paroles ${titre}` }] }] },
      annotations: [], ancres: [{ pos: 1, t: 0 }], meta: { valeursGen: {}, audioRef: null },
      participations: [{ id: 'local', index: 7, nom: 'Enquêteur', pseudo: `Pseudo ${titre}`, interviewer: false, couleur: '#123456', valeursLoc: { v: 'm' }, locuteurRef: null }],
      notes: [{ id: 'note', categorieId: 'ncat_generale', titre: `Note ${titre}`, corps: `Texte ${titre}`, date: null, statut: 'prive', rang: 0, participationIds: ['local'], creeLe: '', modifieLe: null }],
    }
    store.ecrireEntretien(id, fichier)
    return { entretienId: id, participationId: 'local' }
  })
  const lire = (i = 0) => { const r = store.lireEntretien(references[i].entretienId); if (!r.ok) throw new Error('Fixture illisible'); return r.data }
  const fichiers = () => [join(dir, 'corpus.crp'), ...references.map((r) => join(dir, 'entretiens', `${r.entretienId}.json`))].map((p) => readFileSync(p, 'utf8'))
  const individuel = (refs = references.slice(0, 2)) => store.corrigerLocuteurs({ type: 'individualiserSelection', participations: refs, attendu: JSON.stringify(store.inventaireIdentitesLocuteurs()) })!
  const commander = (c: Omit<Extract<CommandeCorrectionLocuteurs, { type: 'ecarterRapprochement' }>, 'attendu'>) => store.corrigerLocuteurs({ ...c, attendu: JSON.stringify(store.inventaireIdentitesLocuteurs()) })
  return { dir, store, references, lire, fichiers, individuel, commander }
}
function sansAssociation(f: EntretienFichier) {
  return { ...f, lastModified: '', participations: f.participations.map(({ locuteurRef: _r, associationRetiree: _a, rapprochementsRefuses: _refus, ...p }) => p) }
}

test('les détails et leurs définitions sont lus ensemble, sans écriture même sur un miroir en lecture seule', () => {
  const b = banc(), { id } = b.store.ajouterVariable('Champ actuel', 'participation')
  b.store.ajouterModalite(id, 'Choix actuel')
  b.store.lectureSeule = true
  const avant = b.fichiers(), details = b.store.detailsLocuteursInventaire()
  expect(details.inventaire).toEqual(b.store.inventaireIdentitesLocuteurs())
  expect(details.variables.find((v) => v.id === id)).toMatchObject({ lib: 'Champ actuel', portee: 'participation', modalites: [expect.objectContaining({ lib: 'Choix actuel' })] })
  expect(details.categories).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'ncat_generale' })]))
  expect(details.inventaire.notes).toHaveLength(3)
  expect(b.fichiers()).toEqual(avant)
})

test('un entretien invalide laisse les détails incomplets sans réparation ni faux inventaire complet', () => {
  const b = banc()
  writeFileSync(join(b.dir, 'entretiens', `${b.references[1].entretienId}.json`), '{}')
  b.store.lectureSeule = true
  const avant = b.fichiers(), details = b.store.detailsLocuteursInventaire()
  expect(details.inventaire.indisponibles).toEqual([{ id: b.references[1].entretienId, titre: 'B', raison: 'Version non supportée' }])
  expect(details.inventaire.participations).toHaveLength(2)
  expect(details.inventaire.locuteurs).toEqual([])
  expect(b.fichiers()).toEqual(avant)
})

test('les notes de mêmes ids locaux restent dans leur entretien et ne sont pas comptées deux fois', () => {
  const b = banc(), inv = b.store.inventaireIdentitesLocuteurs(), avant = b.fichiers()
  expect(notesSelectionLocuteurs(inv, [b.references[0]])).toEqual([inv.notes[0]])
  expect(notesSelectionLocuteurs(inv, [b.references[0], b.references[0], b.references[1]])).toEqual(inv.notes.slice(0, 2))
  expect(b.fichiers()).toEqual(avant)
})

test('consultation, suggestions et aperçu ne créent rien ; chaque voix devient indépendante seulement après confirmation', () => {
  const b = banc(), inv = b.store.inventaireIdentitesLocuteurs(), avant = b.fichiers()
  const vue = b.store.locuteursInventaire()
  const apercu = preparerApercuCorrectionLocuteurs('individualiserSelection', vue.locuteurs.slice(0, 2), inv)
  expect(apercu.locuteurs).toEqual([])
  expect(examinerLocuteurs(inv).propositions).toHaveLength(3)
  expect(b.fichiers()).toEqual(avant)
  const donnees = b.references.map((_, i) => sansAssociation(b.lire(i)))
  b.individuel()
  const apres = b.store.inventaireIdentitesLocuteurs()
  expect(apres.locuteurs).toHaveLength(2)
  expect(b.lire(0).participations[0].locuteurRef).not.toBe(b.lire(1).participations[0].locuteurRef)
  expect(b.lire(2).participations[0].locuteurRef).toBeNull()
  expect(b.references.map((_, i) => sansAssociation(b.lire(i)))).toEqual(donnees)
})

test('un retrait volontaire et des références absentes ne sont pas réparés à la lecture, puis deviennent explicitement indépendants', () => {
  const b = banc()
  for (const i of [0, 1]) { const f = b.lire(i); f.participations[0].locuteurRef = i ? 'absent' : null; if (!i) f.participations[0].associationRetiree = true; b.store.ecrireEntretien(b.references[i].entretienId, f) }
  const avant = b.fichiers(); b.store.locuteursInventaire(); examinerLocuteurs(b.store.inventaireIdentitesLocuteurs()); expect(b.fichiers()).toEqual(avant)
  b.individuel()
  expect(b.store.inventaireIdentitesLocuteurs().locuteurs).toHaveLength(2)
  expect(b.lire().participations[0].associationRetiree).toBeUndefined()
  expect(b.lire(1).participations[0].locuteurRef).not.toBe('absent')
})

test('écarter une proposition ne crée aucune identité et mémorise des références contextualisées dans les deux sens', () => {
  const b = banc(), avant = b.references.map((_, i) => sansAssociation(b.lire(i)))
  b.commander({ type: 'ecarterRapprochement', reference: b.references[0], cible: b.references[1] })
  expect(b.store.inventaireIdentitesLocuteurs().locuteurs).toHaveLength(0)
  expect(b.lire().participations[0].rapprochementsRefuses).toEqual([{ type: 'participation', ...b.references[1] }])
  expect(b.lire(1).participations[0].rapprochementsRefuses).toEqual([{ type: 'participation', ...b.references[0] }])
  expect(examinerLocuteurs(b.store.inventaireIdentitesLocuteurs()).propositions).toHaveLength(2)
  expect(examinerLocuteurs(b.store.inventaireIdentitesLocuteurs()).distinctions).toHaveLength(1)
  expect(b.references.map((_, i) => sansAssociation(b.lire(i)))).toEqual(avant)
})

test('réexaminer retire la distinction dans les deux sens sans réunir les voix ni retirer les autres distinctions', () => {
  const b = banc(); b.individuel(b.references)
  b.commander({ type: 'ecarterRapprochement', reference: b.references[0], cible: b.references[1] })
  b.commander({ type: 'ecarterRapprochement', reference: b.references[0], cible: b.references[2] })
  const inv = b.store.inventaireIdentitesLocuteurs(), decision = examinerLocuteurs(inv).distinctions[0]
  const ids = b.references.map((_, i) => b.lire(i).participations[0].locuteurRef)
  b.store.corrigerLocuteurs({ type: 'retablirRapprochement', reference: decision.reference, cible: decision.cible, attendu: JSON.stringify(inv) })
  expect(b.references.map((_, i) => b.lire(i).participations[0].locuteurRef)).toEqual(ids)
  expect(b.store.inventaireIdentitesLocuteurs().locuteurs).toHaveLength(3)
  expect(examinerLocuteurs(b.store.inventaireIdentitesLocuteurs()).distinctions).toHaveLength(1)
  expect(examinerLocuteurs(b.store.inventaireIdentitesLocuteurs()).propositions).toHaveLength(2)
})

test('le réexamen retire aussi les distinctions portées par les autres membres des deux groupes', () => {
  const b = banc(); b.individuel(b.references)
  const idA = b.lire().participations[0].locuteurRef!, idVide = b.lire(1).participations[0].locuteurRef!, idC = b.lire(2).participations[0].locuteurRef!
  installerIdentitesFixture(b.dir, { associations: [{ ...b.references[1], locuteurRef: idA }] })
  for (const i of [0, 1]) {
    const f = b.lire(i); f.participations[0].rapprochementsRefuses = [{ type: 'locuteur', locuteurId: idC }, { type: 'participation', ...b.references[2] }]
    b.store.ecrireEntretien(b.references[i].entretienId, f)
  }
  const c = b.lire(2); c.participations[0].rapprochementsRefuses = [{ type: 'locuteur', locuteurId: idA }, { type: 'participation', ...b.references[1] }, { type: 'locuteur', locuteurId: idVide }]
  b.store.ecrireEntretien(b.references[2].entretienId, c)
  b.store.corrigerLocuteurs({ type: 'retablirRapprochement', reference: b.references[0], cible: { type: 'locuteur', locuteurId: idC }, attendu: JSON.stringify(b.store.inventaireIdentitesLocuteurs()) })
  expect(b.lire().participations[0].rapprochementsRefuses).toEqual([])
  expect(b.lire(1).participations[0].rapprochementsRefuses).toEqual([])
  expect(b.lire(2).participations[0].rapprochementsRefuses).toEqual([{ type: 'locuteur', locuteurId: idVide }])
  expect(b.references.map((_, i) => b.lire(i).participations[0].locuteurRef)).toEqual([idA, idA, idC])
})

test('des références absentes identiques restent des entrées indépendantes dans les propositions', () => {
  const b = banc(), inv = b.store.inventaireIdentitesLocuteurs()
  inv.participations.forEach((p) => { p.locuteurRef = 'absent' })
  expect(examinerLocuteurs(inv).propositions).toHaveLength(3)
})

test('les grandes listes bornent les propositions sans modifier l’inventaire', () => {
  const b = banc(), inv = b.store.inventaireIdentitesLocuteurs(), p = inv.participations[0]
  inv.participations = Array.from({ length: 250 }, (_, i) => ({ ...p, entretienId: `e${i}`, entretienTitre: `Entretien ${i}` }))
  const avant = JSON.stringify(inv)
  expect(examinerLocuteurs(inv, 20).propositions).toHaveLength(20)
  expect(examinerLocuteurs(inv, 40).propositions).toHaveLength(40)
  expect(JSON.stringify(inv)).toBe(avant)
})

test.each(['lié', 'vide', 'périmé', 'lecture seule', 'session', 'journal', 'préparation'] as const)('%s : aucune régularisation partielle', (cas) => {
  const b = banc(), attendu = JSON.stringify(b.store.inventaireIdentitesLocuteurs())
  if (cas === 'lié') b.individuel([b.references[1]])
  if (cas === 'vide') { const f = b.lire(1); f.participations[0].nom = ' '; b.store.ecrireEntretien(b.references[1].entretienId, f) }
  if (cas === 'lecture seule') b.store.lectureSeule = true
  if (cas === 'session') b.store.ouvrirEntretienPourEdition(b.references[0].entretienId)
  if (cas === 'journal') writeFileSync(join(b.dir, '.transaction-fichiers.json'), '{}')
  if (cas === 'préparation') b.store.activerModePreparation(b.references.map((r) => r.entretienId), true)
  const avant = b.fichiers()
  const action = () => b.store.corrigerLocuteurs({ type: 'individualiserSelection', participations: b.references.slice(0, 2), attendu: cas === 'périmé' ? '{}' : cas === 'lié' || cas === 'vide' ? JSON.stringify(b.store.inventaireIdentitesLocuteurs()) : attendu })
  expect(() => cas === 'préparation' ? b.store.avecEcritureCorpus(action) : action()).toThrow()
  expect(b.fichiers()).toEqual(avant)
})

test.each(['participation', 'refus', 'cas', 'incomplet', 'périmé', 'session'] as const)('%s : protège la suppression d’un locuteur vide', (cas) => {
  const b = banc(), id = creerLocuteurFixture(b.dir, 'Sans entretien')
  let attendu = JSON.stringify(b.store.inventaireIdentitesLocuteurs())
  if (cas === 'participation') installerIdentitesFixture(b.dir, { associations: [{ ...b.references[0], locuteurRef: id }] })
  if (cas === 'refus') { const f = b.lire(); f.participations[0].rapprochementsRefuses = [{ type: 'locuteur', locuteurId: id }]; b.store.ecrireEntretien(b.references[0].entretienId, f) }
  if (cas === 'cas') b.store.casCommander({ type: 'creer', cas: { id: 'cas', nom: 'Suivi', memo: '', creeLe: '2026-01-01T00:00:00Z', modifieLe: '2026-01-01T00:00:00Z', rattachements: [], regles: [{ type: 'locuteur', locuteurId: id, inclureEnqueteurs: true }] } })
  if (cas === 'incomplet') writeFileSync(join(b.dir, 'entretiens', `${b.references[2].entretienId}.json`), '{}')
  if (cas === 'périmé') installerIdentitesFixture(b.dir, { locuteurs: [{ id, nom: 'Nom changé' }] })
  if (cas === 'session') b.store.ouvrirEntretienPourEdition(b.references[0].entretienId)
  if (cas !== 'périmé') attendu = JSON.stringify(b.store.inventaireIdentitesLocuteurs())
  const avant = b.fichiers()
  expect(() => b.store.corrigerLocuteurs({ type: 'supprimerVide', locuteurId: id, attendu })).toThrow()
  expect(b.fichiers()).toEqual(avant)
})

test('supprime uniquement une définition vide sans usages, sans toucher les entretiens', () => {
  const b = banc(), id = creerLocuteurFixture(b.dir, 'Vide'), avant = b.fichiers().slice(1)
  b.store.corrigerLocuteurs({ type: 'supprimerVide', locuteurId: id, attendu: JSON.stringify(b.store.inventaireIdentitesLocuteurs()) })
  expect(b.store.inventaireIdentitesLocuteurs().locuteurs).toEqual([])
  expect(b.fichiers().slice(1)).toEqual(avant)
})

test('une interruption de régularisation reprend les mêmes identifiants sans double création', () => {
  const b = banc()
  vi.spyOn(b.store, 'appliquerTransactionFichiers').mockImplementationOnce((plan) => {
    writeFileSync(join(b.dir, '.transaction-fichiers.json'), JSON.stringify({ formatVersion: 1, plan }))
    writeFileSync(join(b.dir, 'corpus.crp'), JSON.stringify(plan.corpusApres))
    throw new Error('Interruption')
  })
  expect(() => b.individuel()).toThrow('Interruption')
  const repris = new CorpusStore(b.dir); repris.ouvrir()
  expect(repris.inventaireIdentitesLocuteurs().locuteurs).toHaveLength(2)
  expect(repris.inventaireIdentitesLocuteurs().participations.filter((p) => p.locuteurRef)).toHaveLength(2)
})

test.each([false, true])('reprise ponctuelle choisie, remplacement = %s : aucune association ni note modifiée', (remplacer) => {
  const b = banc(); b.individuel([b.references[0]])
  const id = b.lire().participations[0].locuteurRef!
  installerIdentitesFixture(b.dir, { associations: [{ ...b.references[1], locuteurRef: id }] })
  const source = b.lire(1); source.participations[0].interviewer = true; source.participations[0].valeursLoc.v = 'source'
  b.store.ecrireEntretien(b.references[1].entretienId, source)
  const avant = b.references.map((_, i) => b.lire(i))
  b.store.corrigerLocuteurs({ type: 'reprendreInformations', reference: b.references[0], source: b.references[1],
    choix: { pseudo: true, interviewer: true, variables: [], remplacer }, attendu: JSON.stringify(b.store.inventaireIdentitesLocuteurs()) })
  const apres = b.lire()
  expect(apres.participations[0]).toEqual({ ...avant[0].participations[0], ...(remplacer ? { pseudo: 'Pseudo B', pseudoEtat: 'confirme', interviewer: true } : {}) })
  expect(apres.notes).toEqual(avant[0].notes); expect(apres.corpsTexte).toEqual(avant[0].corpsTexte)
  expect(b.lire(1)).toEqual(avant[1]); expect(b.lire(2)).toEqual(avant[2])
})

test('la reprise d’une valeur choisie conserve les autres données et refuse les variables supprimées', () => {
  const b = banc(); b.individuel([b.references[0]])
  installerIdentitesFixture(b.dir, { associations: [{ ...b.references[1], locuteurRef: b.lire().participations[0].locuteurRef }] })
  const v = b.store.ajouterVariable('Donnée choisie', 'participation')
  let corpus = b.store.ajouterModalite(v.id, 'Source')
  const sourceId = corpus.variables[v.id].modalites[0].id
  corpus = b.store.ajouterModalite(v.id, 'Cible')
  const cibleId = corpus.variables[v.id].modalites[1].id
  const source = b.lire(1), cible = b.lire()
  source.participations[0].valeursLoc[v.id] = sourceId; cible.participations[0].valeursLoc[v.id] = cibleId
  b.store.ecrireEntretien(b.references[1].entretienId, source); b.store.ecrireEntretien(b.references[0].entretienId, cible)
  b.store.corrigerLocuteurs({ type: 'reprendreInformations', reference: b.references[0], source: b.references[1], choix: { variables: [v.id], remplacer: true }, attendu: JSON.stringify(b.store.inventaireIdentitesLocuteurs()) })
  expect(b.lire().participations[0].valeursLoc).toEqual({ v: 'm', [v.id]: sourceId })
  expect(b.lire().participations[0].pseudo).toBe('Pseudo A')
  const avant = b.fichiers()
  expect(() => b.store.corrigerLocuteurs({ type: 'reprendreInformations', reference: b.references[0], source: b.references[1], choix: { variables: ['supprimee'], remplacer: true }, attendu: JSON.stringify(b.store.inventaireIdentitesLocuteurs()) })).toThrow('définition')
  expect(b.fichiers()).toEqual(avant)
})

test('la reprise refuse un autre locuteur et des données périmées sans modification', () => {
  const b = banc(); b.individuel()
  const avant = b.fichiers()
  expect(() => b.store.corrigerLocuteurs({ type: 'reprendreInformations', reference: b.references[0], source: b.references[1], choix: { pseudo: true, variables: [] }, attendu: JSON.stringify(b.store.inventaireIdentitesLocuteurs()) })).toThrow('même locuteur')
  expect(b.fichiers()).toEqual(avant)
})

test('contrats stricts : ni référence ambiguë, ni doublon, ni ancien refus textuel', () => {
  const attendu = '{}', r = { entretienId: 'e', participationId: 'p' }
  for (const c of [
    { type: 'individualiserSelection', attendu, participations: [r, r] },
    { type: 'individualiserSelection', attendu, participations: [{ entretienId: 'e', index: 0 }] },
    { type: 'ecarterRapprochement', attendu, reference: r, cible: { entretienId: 'e', index: 0 } },
    { type: 'retablirRapprochement', attendu, reference: r, cible: 'e:p' },
    { type: 'supprimerVide', attendu, locuteurId: 'p', nom: 'Inattendu' },
    { type: 'reprendreInformations', attendu, reference: r, source: r, choix: { pseudo: 'oui', variables: [] } },
  ]) expect(() => validerCommandeCorrectionLocuteurs(c)).toThrow()
})
