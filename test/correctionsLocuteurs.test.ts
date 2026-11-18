import { afterEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CorpusStore } from '../src/main/corpusStore'
import { appliquerCorrectionLocuteursFormat9 } from '../src/shared/corpus/correctionsLocuteursFormat9'
import type { CommandeCorrectionLocuteurs } from '../src/shared/corpus/contratsLocuteurs'
import { suggestionsPersonnes } from '../src/shared/corpus/rapprochementsPersonnes'
import type { EntretienFichier } from '../src/shared/format'
import { squeletteCorpus } from '../src/shared/corpus/squelette'
import { preparerFermetureEntretien } from '../src/renderer/couturesApplication'

const dossiers: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const reference = (p: { entretienId: string; locuteurId: string }) => ({ entretienId: p.entretienId, participationId: p.locuteurId })

function preparer() {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-corrections-locuteurs-'))
  dossiers.push(dir)
  const store = new CorpusStore(dir)
  store.ouvrir()
  const participations = ['Jean Martin', 'J. Martin', 'Monsieur Martin', 'Autre personne'].map((nom, i) => {
    const ref = store.creerEntretienVide(`Entretien ${i + 1}`)
    const locuteurId = `loc-${i}`
    const data: EntretienFichier = {
      formatVersion: 3, lastModified: '',
      corpsTexte: { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: 0 }, content: [{ type: 'text', text: `Paroles ${i}` }] }] },
      ancres: [{ pos: 1, t: 0 }], annotations: [],
      meta: { valeursGen: {}, audioRef: null },
      locuteurs: [{ id: locuteurId, index: 0, nom, pseudo: `Pseudo ${i}`, couleur: '#123456', interviewer: i === 1, valeursLoc: {}, personneRef: null }],
      notes: [{ id: `n-${i}`, categorieId: 'ncat_generale', titre: 'Note', date: null, statut: 'prive', corps: 'À conserver', locuteurIds: [locuteurId], rang: 0, creeLe: '', modifieLe: null }],
    }
    store.ecrireEntretien(ref.id, data)
    const personneId = store.personnesCommander({ type: 'creer', entretienId: ref.id, locuteurId, nom })!
    return { entretienId: ref.id, locuteurId, personneId, nom }
  })
  const attendu = () => JSON.stringify(store.personnesInventaire())
  const regrouper = (nombre = 3, uniformiserNoms = false) => store.personnesCommander({
    type: 'regrouperSelection', locuteurIds: participations.slice(0, nombre).map((p) => p.personneId),
    conserverId: participations[0].personneId, nom: 'Jean Martin', uniformiserNoms, attendu: attendu(),
  })!
  const lire = (id: string) => {
    const lecture = store.lireEntretien(id)
    if (!lecture.ok) throw new Error('Lecture impossible')
    return lecture.data
  }
  const fichiers = () => [join(dir, 'corpus.crp'), ...participations.map((p) => join(dir, 'entretiens', `${p.entretienId}.json`))]
    .map((chemin) => readFileSync(chemin, 'utf8'))
  return { dir, store, participations, attendu, regrouper, lire, fichiers }
}

function horsIdentite(data: EntretienFichier) {
  return {
    ...data, lastModified: '',
    locuteurs: data.locuteurs.map(({ nom: _nom, personneRef: _ref, rapprochementsRefuses: _refus, ...reste }) => reste),
  }
}

describe('Corrections des locuteurs — stockage local', () => {
  test('renomme tous les membres sans modifier les paroles, notes ou données locales', () => {
    const b = preparer()
    const personneId = b.regrouper()
    const avant = b.participations.map((p) => b.lire(p.entretienId))
    const nonCible = b.fichiers()[4]
    expect(b.store.personnesCommander({ type: 'renommerGlobal', locuteurId: personneId, nom: '  Jean Dupont  ', attendu: b.attendu() })).toBe(personneId)
    const relu = new CorpusStore(b.dir)
    expect(relu.personnesInventaire().personnes.find((p) => p.id === personneId)?.nom).toBe('Jean Dupont')
    for (const [i, p] of b.participations.entries()) {
      const apres = b.lire(p.entretienId)
      expect(apres.locuteurs[0].nom).toBe(i < 3 ? 'Jean Dupont' : p.nom)
      expect(horsIdentite(apres)).toEqual(horsIdentite(avant[i]))
    }
    expect(b.fichiers()[4]).toBe(nonCible)
  })

  test.each([false, true])('réunit trois identités, avec uniformisation des noms = %s', (uniformiserNoms) => {
    const b = preparer()
    const avant = b.participations.map((p) => b.lire(p.entretienId))
    const personneId = b.regrouper(3, uniformiserNoms)
    const inventaire = b.store.personnesInventaire()
    expect(inventaire.personnes).toHaveLength(2)
    expect(inventaire.locuteurs.filter((l) => l.personneRef === personneId)).toHaveLength(3)
    for (const [i, p] of b.participations.entries()) {
      const apres = b.lire(p.entretienId)
      expect(apres.locuteurs[0].nom).toBe(uniformiserNoms && i < 3 ? 'Jean Martin' : p.nom)
      expect(horsIdentite(apres)).toEqual(horsIdentite(avant[i]))
    }
  })

  test('redirige les règles de cas et les refus extérieurs lors du regroupement multiple', () => {
    const b = preparer()
    const date = '2026-09-01T10:00:00.000Z'
    b.store.casCommander({ type: 'creer', cas: {
      id: 'cas', nom: 'Suivi', memo: 'Mémo', creeLe: date, modifieLe: date, rattachements: [],
      regles: [{ type: 'personnes', membres: b.participations.slice(0, 3).map((p, i) => ({ personneId: p.personneId, inclureEnqueteurs: i === 1 })) }],
    } })
    const autre = b.lire(b.participations[3].entretienId)
    autre.locuteurs[0].rapprochementsRefuses = [`personne:${b.participations[2].personneId}`]
    b.store.ecrireEntretien(b.participations[3].entretienId, autre)
    const personneId = b.regrouper()
    expect(b.store.ouvrir().cas?.cas.regles).toEqual([{ type: 'personnes', membres: [{ personneId, inclureEnqueteurs: true }] }])
    expect(b.lire(b.participations[3].entretienId).locuteurs[0].rapprochementsRefuses).toEqual([`personne:${personneId}`])
  })

  test('vérifie tous les conflits avant de commencer un regroupement', () => {
    const b = preparer()
    const premiere = b.lire(b.participations[0].entretienId)
    premiere.locuteurs.push({ id: 'doublon', index: 1, nom: 'Doublon', valeursLoc: {}, personneRef: b.participations[2].personneId })
    b.store.ecrireEntretien(b.participations[0].entretienId, premiere)
    const avant = b.fichiers()
    expect(() => b.regrouper()).toThrow('Réunion impossible')
    expect(b.fichiers()).toEqual(avant)
  })

  test('dissocie chaque participation choisie sans créer de locuteur local ni exiger un nom', () => {
    const b = preparer()
    const personneId = b.regrouper(4, true)
    const avant = b.participations.map((p) => b.lire(p.entretienId))
    b.store.personnesCommander({
      type: 'dissocierSelection', locuteurId: personneId, attendu: b.attendu(),
      participations: b.participations.slice(2).map(reference),
    })
    const inventaire = new CorpusStore(b.dir).personnesInventaire()
    expect(inventaire.personnes).toHaveLength(3)
    const refs = b.participations.map((p) => inventaire.locuteurs.find((l) => l.locuteurId === p.locuteurId)!.personneRef)
    expect(refs[0]).toBe(personneId)
    expect(refs[1]).toBe(personneId)
    expect(new Set(refs)).toHaveProperty('size', 3)
    for (const [i, p] of b.participations.entries()) {
      const apres = b.lire(p.entretienId)
      expect(apres.locuteurs[0].nom).toBe('Jean Martin')
      expect(horsIdentite(apres)).toEqual(horsIdentite(avant[i]))
      const cible = inventaire.locuteurs.find((l) => l.locuteurId === p.locuteurId)!
      expect(suggestionsPersonnes(
        { entretienId: p.entretienId, locuteur: { ...cible, id: cible.locuteurId } },
        inventaire.locuteurs.map((l) => ({ entretienId: l.entretienId, locuteur: { ...l, id: l.locuteurId } })),
      )).toEqual([])
    }
  })

  test('une dissociation ne transfère pas les règles des cas aux identités dissociées', () => {
    const b = preparer()
    const personneId = b.regrouper()
    const date = '2026-09-01T10:00:00.000Z'
    b.store.casCommander({ type: 'creer', cas: {
      id: 'cas', nom: 'Suivi', memo: '', creeLe: date, modifieLe: date, rattachements: [],
      regles: [{ type: 'personne', personneId, inclureEnqueteurs: true }],
    } })
    const avant = b.store.ouvrir().cas
    b.store.personnesCommander({ type: 'dissocierSelection', locuteurId: personneId, participations: [reference(b.participations[1])], attendu: b.attendu() })
    expect(b.store.ouvrir().cas).toEqual(avant)
  })

  test('refuse une sélection périmée ou vide et laisse un membre sur l’identité d’origine', () => {
    const b = preparer()
    const personneId = b.regrouper()
    const avant = b.fichiers()
    for (const locuteurs of [[], b.participations.slice(0, 3), [b.participations[1], b.participations[1]], [b.participations[3]]]) {
      expect(() => b.store.personnesCommander({ type: 'dissocierSelection', locuteurId: personneId, participations: locuteurs.map(reference), attendu: b.attendu() })).toThrow()
      expect(b.fichiers()).toEqual(avant)
    }
  })

  test('refuse un nom vide et une sélection invalide avant toute écriture', () => {
    const b = preparer()
    const avant = b.fichiers()
    const personneId = b.participations[0].personneId
    const commandes: CommandeCorrectionLocuteurs[] = [
      { type: 'renommerGlobal', locuteurId: personneId, nom: ' ', attendu: b.attendu() },
      { type: 'renommerGlobal', locuteurId: 'absent', nom: 'Nom', attendu: b.attendu() },
      { type: 'regrouperSelection', conserverId: personneId, locuteurIds: [personneId, personneId], nom: 'Nom', uniformiserNoms: false, attendu: b.attendu() },
      { type: 'regrouperSelection', conserverId: personneId, locuteurIds: [personneId, 'absent'], nom: 'Nom', uniformiserNoms: false, attendu: b.attendu() },
    ]
    for (const commande of commandes) {
      expect(() => b.store.personnesCommander(commande)).toThrow()
      expect(b.fichiers()).toEqual(avant)
    }
  })

  test('rejette les anciens messages avant de consulter les sources ou préparer une écriture', () => {
    const b = preparer()
    const avant = b.fichiers()
    const ancien = { type: 'renommerGlobal', personneId: b.participations[0].personneId, nom: 'Nom', attendu: b.attendu() }
    const lecture = vi.spyOn(b.store, 'personnesInventaire')
    const ecriture = vi.spyOn(b.store, 'appliquerTransactionFichiers')
    expect(() => b.store.personnesCommander(ancien as unknown as CommandeCorrectionLocuteurs)).toThrow('demande de correction')
    expect(lecture).not.toHaveBeenCalled()
    expect(ecriture).not.toHaveBeenCalled()
    expect(b.fichiers()).toEqual(avant)
  })

  test('refuse un aperçu ancien, un corpus en lecture seule et une session encore ouverte', () => {
    const b = preparer()
    const commande: CommandeCorrectionLocuteurs = { type: 'renommerGlobal', locuteurId: b.participations[0].personneId, nom: 'Nom commun', attendu: b.attendu() }
    const autre = b.lire(b.participations[0].entretienId)
    autre.locuteurs[0].pseudo = 'Pseudo modifié'
    b.store.ecrireEntretien(b.participations[0].entretienId, autre)
    const avant = b.fichiers()
    expect(() => b.store.personnesCommander(commande)).toThrow('ont changé')
    b.store.lectureSeule = true
    expect(() => b.store.personnesCommander({ ...commande, attendu: b.attendu() })).toThrow()
    b.store.lectureSeule = false
    b.store.autoriserEcritureEntretien(b.participations[0].entretienId)
    expect(() => b.store.personnesCommander({ ...commande, attendu: b.attendu() })).toThrow('Fermez les entretiens')
    expect(b.fichiers()).toEqual(avant)
  })

  test('corrige après la sauvegarde et la fermeture locales, puis relit les noms à la réouverture', async () => {
    const b = preparer()
    const personneId = b.regrouper()
    const { entretienId } = b.participations[0]
    const ouverture = b.store.ouvrirEntretienPourEdition(entretienId)
    if (!ouverture.ok) throw new Error('Ouverture impossible')
    ouverture.data.corpsTexte = {
      type: 'doc', content: [{ type: 'paragraph', attrs: { loc: 0 }, content: [{ type: 'text', text: 'Dernières paroles sauvegardées.' }] }],
    }
    await preparerFermetureEntretien({
      distant: false, degrade: false, lectureSeule: false, verrouAutrui: false,
      annulerSauvegarde: vi.fn(),
      viderSauvegarde: async () => {
        b.store.exigerSessionLocaleEcriture(entretienId)
        b.store.ecrireEntretien(entretienId, ouverture.data)
      },
    })
    b.store.revoquerEcritureEntretien(entretienId)
    expect(() => b.store.exigerSessionLocaleEcriture(entretienId)).toThrow('session locale est fermée')
    b.store.personnesCommander({ type: 'renommerGlobal', locuteurId: personneId, nom: 'Nom corrigé au corpus', attendu: b.attendu() })
    const reouverture = b.store.ouvrirEntretienPourEdition(entretienId)
    if (!reouverture.ok) throw new Error('Réouverture impossible')
    expect(reouverture.data.locuteurs[0].nom).toBe('Nom corrigé au corpus')
    expect(reouverture.data.corpsTexte).toEqual(ouverture.data.corpsTexte)
    expect(() => b.store.exigerSessionLocaleEcriture(entretienId)).not.toThrow()
  })

  test('refuse un inventaire incomplet avant de renommer', () => {
    const b = preparer()
    const attendu = b.attendu()
    const corpusAvant = b.fichiers()[0]
    unlinkSync(join(b.dir, 'entretiens', `${b.participations[2].entretienId}.json`))
    expect(() => b.store.personnesCommander({ type: 'renommerGlobal', locuteurId: b.participations[0].personneId, nom: 'Nom', attendu })).toThrow('illisibles')
    expect(readFileSync(join(b.dir, 'corpus.crp'), 'utf8')).toBe(corpusAvant)
  })

  test.each(['renommerGlobal', 'regrouperSelection', 'dissocierSelection'] as const)('reprend %s après une interruption sans nouvelle identité en double', (type) => {
    const b = preparer()
    const personneId = type === 'regrouperSelection' ? b.participations[0].personneId : b.regrouper()
    const commande: CommandeCorrectionLocuteurs = type === 'renommerGlobal'
      ? { type, locuteurId: personneId, nom: 'Nom corrigé', attendu: b.attendu() }
      : type === 'regrouperSelection'
        ? { type, locuteurIds: b.participations.slice(0, 3).map((p) => p.personneId), conserverId: personneId, nom: 'Nom corrigé', uniformiserNoms: true, attendu: b.attendu() }
        : { type, locuteurId: personneId, participations: b.participations.slice(1, 3).map(reference), attendu: b.attendu() }
    let cible: ReturnType<CorpusStore['personnesInventaire']> | undefined
    vi.spyOn(b.store, 'appliquerTransactionFichiers').mockImplementation((plan) => {
      if (plan.operation !== 'remplacement') throw new Error('Plan inattendu')
      writeFileSync(join(b.dir, '.transaction-fichiers.json'), JSON.stringify({ formatVersion: 1, plan }))
      if (type === 'dissocierSelection') {
        expect(plan.ordre).toBe('corpus-puis-entretiens')
        writeFileSync(join(b.dir, 'corpus.crp'), JSON.stringify(plan.corpusApres))
      } else {
        expect(plan.ordre).toBe('entretiens-puis-corpus')
        const premier = plan.entretiens[0]
        writeFileSync(join(b.dir, 'entretiens', `${premier.id}.json`), JSON.stringify(premier.apres))
      }
      cible = {
        personnes: Object.values(plan.corpusApres.personnes).sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.id.localeCompare(b.id)),
        locuteurs: [], notes: [], indisponibles: [],
      }
      throw new Error('Arrêt simulé')
    })
    expect(() => b.store.personnesCommander(commande)).toThrow('Arrêt simulé')
    const relu = new CorpusStore(b.dir)
    const apres = relu.personnesInventaire()
    expect(apres.personnes).toEqual(cible!.personnes)
    for (const p of b.participations.slice(0, 3)) {
      const locuteur = apres.locuteurs.find((l) => l.locuteurId === p.locuteurId)!
      if (type === 'dissocierSelection') {
        expect(apres.personnes.some((personne) => personne.id === locuteur.personneRef)).toBe(true)
      } else {
        expect(locuteur).toMatchObject({ personneRef: personneId, nom: 'Nom corrigé' })
      }
    }
    expect(new CorpusStore(b.dir).personnesInventaire()).toEqual(apres)
  })
})

test('la dissociation vérifie tous les identifiants générés avant de modifier les copies', () => {
  const corpus = squeletteCorpus()
  corpus.personnes.p = { id: 'p', nom: 'Même nom' }
  const entretiens = ['a', 'b', 'c'].map((id) => ({
    id, titre: id,
    data: {
      formatVersion: 3, lastModified: '', corpsTexte: {}, annotations: [], ancres: [],
      meta: { valeursGen: {}, audioRef: null },
      locuteurs: [{ id, index: 0, nom: 'Même nom', personneRef: 'p', valeursLoc: {} }],
    } satisfies EntretienFichier,
  }))
  const avant = JSON.stringify([corpus, entretiens])
  expect(() => appliquerCorrectionLocuteursFormat9(corpus, entretiens, {
    type: 'dissocierSelection', locuteurId: 'p',
    participations: [{ entretienId: 'b', participationId: 'b' }, { entretienId: 'c', participationId: 'c' }], attendu: 'initial',
  }, () => 'meme-identifiant')).toThrow('identifiant')
  expect(JSON.stringify([corpus, entretiens])).toBe(avant)
})
