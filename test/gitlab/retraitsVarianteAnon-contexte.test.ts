import { afterEach, describe, expect, test, vi } from 'vitest'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ClientGitLab } from '../../src/main/gitlab/client'
import { ContexteGitLab, preparerContexteGitLabLectureSeule } from '../../src/main/gitlab/contexte'
import { TransactionsGitLab } from '../../src/main/gitlab/transactions'
import { PORTEEES_OVERTES_GITLAB } from '../../src/main/gitlab/politiqueGestes'
import { fixtureRetraitVarianteAnonGitLab } from '../fixtures/retraitVarianteAnonGitLab'

const dossiers: string[] = [], portees = [...PORTEEES_OVERTES_GITLAB]
const portee = 'pseudonymisation-retrait-variante' as const
const ouvrirPolitique = () => { if (!PORTEEES_OVERTES_GITLAB.includes(portee)) PORTEEES_OVERTES_GITLAB.push(portee) }
const fermerPolitique = () => { const i = PORTEEES_OVERTES_GITLAB.indexOf(portee); if (i !== -1) PORTEEES_OVERTES_GITLAB.splice(i, 1) }
afterEach(() => {
  vi.restoreAllMocks()
  PORTEEES_OVERTES_GITLAB.splice(0, Infinity, ...portees)
  dossiers.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }))
})
function banc(recuperables: string[] = []) {
  const b = fixtureRetraitVarianteAnonGitLab(dossiers)
  const transactions = new TransactionsGitLab(b.options)
  const session = {
    ouvrir: vi.fn(async () => ({ etat: 'edition', revision: 0, revisionPubliee: 0 })),
    fermer: vi.fn(async () => ({ fermee: true })),
  }
  const tirer = vi.fn(async (_proteges: string[]) => ({ telecharges: [], corbeille: [], inaccessibles: [], date: new Date().toISOString() }))
  const client = new ClientGitLab({ urlInstance: 'https://gitlab.example.org', projetId: 1, autorisation: { type: 'jeton-prive', jeton: 'test' } })
  const c = new ContexteGitLab('destination', b.store, { dirLocal: b.dir, tirer } as never,
    () => session as never, transactions, undefined, undefined,
    { client, branche: 'main', racine: 'racine', cheminsRecuperables: recuperables })
  const preparer = () => c.preparerRetraitVarianteAnon(b.demande)
  const appliquer = async () => { ouvrirPolitique(); return c.retirerVarianteAnon((await preparer()).token, true) }
  const reprendre = async () => c.retirerVarianteAnon((await c.preparerRepriseRetraitVarianteAnon(c.lireSuiviRetraitVarianteAnon()!.operationId)).token, true)
  return { ...b, c, session, tirer, client, transactions, preparer, appliquer, reprendre }
}
const commits = (b: ReturnType<typeof banc>) => b.depot.commits.filter((c) => c.message.startsWith('Sonal retrait-variante-'))

describe('raccord protégé du retrait de variante au contexte GitLab', () => {
  test('politique fermée : ni préparation ni application ; tentative consommée', async () => {
    const b = banc(); fermerPolitique()
    expect(() => b.preparer()).toThrow('pas disponible sur un corpus distant')
    ouvrirPolitique(); const p = await b.preparer(); fermerPolitique()
    await expect(b.c.retirerVarianteAnon(p.token, true)).rejects.toThrow()
    ouvrirPolitique(); await expect(b.c.retirerVarianteAnon(p.token, true)).rejects.toThrow('expiré')
    expect(commits(b)).toHaveLength(0)
  })
  test.each(['preparation', 'application'] as const)('politique recontrôlée après attente dans la file : %s', async (phase) => {
    const b = banc(); ouvrirPolitique()
    const p = phase === 'application' ? await b.preparer() : undefined
    let relacher!: () => void
    const attente = b.options.file.executer(() => new Promise<void>((r) => { relacher = r }))
    await Promise.resolve()
    const travail = p ? b.c.retirerVarianteAnon(p.token, true) : b.preparer()
    fermerPolitique(); relacher(); await attente
    await expect(travail).rejects.toThrow('pas disponible sur un corpus distant')
    expect(commits(b)).toHaveLength(0)
  })
  test('politique retirée pendant la lecture : aucun aperçu utilisable retourné', async () => {
    const b = banc(); ouvrirPolitique()
    const lire = b.depot.lireFichier.bind(b.depot)
    vi.spyOn(b.depot, 'lireFichier').mockImplementation(async (...args) => {
      const resultat = await lire(...args)
      if (args[0].endsWith('/e2.json')) fermerPolitique()
      return resultat
    })
    await expect(b.preparer()).rejects.toThrow('pas disponible sur un corpus distant')
    expect(commits(b)).toHaveLength(0)
  })
  test('politique retirée après premier acquis : aucun envoi suivant, suivi lisible et accord neuf requis', async () => {
    const b = banc()
    b.depot.avantCommit = (actions) => {
      if (actions.some((a) => a.action === 'update' && a.file_path.endsWith('/e1.json'))) fermerPolitique()
    }
    expect(await b.appliquer()).toMatchObject({ statut: 'partiel', entretiens: 1, annotations: 3, varianteRetiree: false })
    expect(commits(b)).toHaveLength(2)
    expect(b.cp().reglesAnon.personne.pseudos).toEqual(['Claire', 'Rebecca'])
    const suivi = b.c.lireSuiviRetraitVarianteAnon()!
    expect(await b.c.relireSuiviRetraitVarianteAnon(suivi.operationId)).toMatchObject({ statut: 'partiel', entretiens: 1 })
    expect(() => b.c.preparerRepriseRetraitVarianteAnon(suivi.operationId)).toThrow('pas disponible sur un corpus distant')
    b.depot.avantCommit = () => {}; ouvrirPolitique()
    expect(await b.reprendre()).toMatchObject({ statut: 'termine', annotations: 6 })
    expect(commits(b)).toHaveLength(4)
  })
  test('sessions ciblée et indépendante : aucune fermeture forcée, reprise après fermeture explicite', async () => {
    const b = banc(); await b.c.ouvrirSessionEntretien('e2'); await b.c.ouvrirSessionEntretien('e3')
    expect(await b.appliquer()).toMatchObject({ statut: 'partiel', annotations: 3, entretiens: 1 })
    await expect(b.c.ouvrirSessionEntretien('e2')).rejects.toThrow('cible de retrait de variante')
    expect(b.session.fermer).not.toHaveBeenCalled()
    await b.c.fermerEntretien('e2')
    expect(await b.reprendre()).toMatchObject({ statut: 'termine', annotations: 6, exceptions: 3, incluses: 2 })
    expect(b.session.fermer).toHaveBeenCalledTimes(1)
    await b.c.ouvrirSessionEntretien('e3'); expect(b.c.lireSuiviRetraitVarianteAnon()).toBeNull()
    expect(b.lire('e3')).toEqual(b.sources[2].data)
  })
  test('session récupérable exclue du remplacement, du tirage et des ouvertures', async () => {
    const b = banc(['entretiens/e2.json'])
    expect(await b.appliquer()).toMatchObject({ statut: 'partiel', entretiens: 1 })
    await b.c.actualiser()
    expect(b.tirer).toHaveBeenCalledWith(expect.arrayContaining(['entretiens/e2.json']))
    await expect(b.c.ouvrirSessionEntretien('e2')).rejects.toThrow('cible de retrait de variante')
    expect(b.lire('e2')).toEqual(b.sources[1].data)
  })
  test('ouverture déjà engagée comptée avant sa réponse ; aucun écrasement de la cible', async () => {
    const b = banc(); let resoudre!: (v: { etat: string; revision: number; revisionPubliee: number }) => void
    b.session.ouvrir.mockImplementationOnce(() => new Promise((r) => { resoudre = r }))
    const ouverture = b.c.ouvrirSessionEntretien('e2')
    expect(await b.appliquer()).toMatchObject({ statut: 'partiel', entretiens: 1 })
    resoudre({ etat: 'edition', revision: 0, revisionPubliee: 0 }); await ouverture
    expect(b.lire('e2')).toEqual(b.sources[1].data)
  })
  test('réservation avant attente : cible et changement de corpus refusés, non-cible admise', async () => {
    const b = banc(); ouvrirPolitique(); const p = await b.preparer()
    let entrer!: () => void, relacher!: () => void
    const entree = new Promise<void>((r) => { entrer = r }), attente = new Promise<void>((r) => { relacher = r })
    const lire = b.depot.lireFichier.bind(b.depot)
    vi.spyOn(b.depot, 'lireFichier').mockImplementationOnce(async (...args) => { entrer(); await attente; return lire(...args) })
    const travail = b.c.retirerVarianteAnon(p.token, true); await entree
    await expect(b.c.ouvrirSessionEntretien('e1')).rejects.toThrow('cible de retrait de variante')
    await expect(b.c.fermer()).rejects.toThrow('fin du retrait de variante')
    expect(() => b.c.creerEntretienVide('Concurrent')).toThrow('retrait de variante')
    await b.c.ouvrirSessionEntretien('e3')
    relacher(); expect(await travail).toMatchObject({ statut: 'termine' })
    expect(b.session.fermer).not.toHaveBeenCalled()
  })
  test('refus de consentement consomme le jeton et libère la réservation sans envoi', async () => {
    const b = banc(); ouvrirPolitique(); const p = await b.preparer()
    await expect(b.c.retirerVarianteAnon(p.token, false)).rejects.toThrow('Confirmez')
    await expect(b.c.retirerVarianteAnon(p.token, true)).rejects.toThrow('expiré')
    await b.c.ouvrirSessionEntretien('e1'); expect(commits(b)).toHaveLength(0)
  })
  test('contexte fermé : aperçus effacés, ancien jeton non publiable', async () => {
    const b = banc(); ouvrirPolitique(); const p = await b.preparer(); await b.c.fermer()
    await expect(b.c.retirerVarianteAnon(p.token, true)).rejects.toThrow('indisponible')
    expect(commits(b)).toHaveLength(0)
  })
  test('lot partiel ferme les opérations incompatibles, pas les écritures indépendantes', async () => {
    const b = banc(['entretiens/e2.json']); await b.appliquer()
    expect(() => b.c.executerDefinitions('anon.creer-regle', () => {})).toThrow('retrait de variante')
    expect(() => b.c.creerEntretienVide('Vide')).toThrow('retrait de variante')
    expect(() => b.c.importerEntretien('Import', b.sources[2].data, [], [], [])).toThrow('retrait de variante')
    await expect(b.c.supprimerEntretien('e3')).rejects.toThrow('retrait de variante')
    expect(b.c.renommageAnonDisponible()).toBe(false)
    expect(() => b.c.instantaneRenommageAnon()).toThrow('retrait de variante')
    expect(() => b.c.preparerSuppressionAnon({ regleId: 'personne' })).toThrow('retrait de variante')
    expect(() => b.c.preparerDissociationAnon({ regleId: 'personne' })).toThrow('retrait de variante')
    await expect(b.c.importerCorrespondances({} as never)).rejects.toThrow('retrait de variante')
    await b.transactions.designerAudio('e3', 'audio/independant.ogg')
    expect(b.lire('e3').meta.audioDistant?.chemin).toBe('audio/independant.ogg')
    await expect(b.transactions.designerAudio('e2', 'audio/interdit.ogg')).rejects.toThrow('ancien choix')
    expect(b.lire('e2').meta.audioDistant).toBeUndefined()
  })
  test('nouvelle cible protège aussi ouverture et tirage ; consentement renouvelé obligatoire', async () => {
    const b = banc()
    b.depot.avantCommit = (actions) => {
      if (actions.some((a) => a.action === 'update' && a.file_path.endsWith('/e2.json'))) b.changer('e3', (e) => { e.annotations[0].pseudo = 'Claire' })
    }
    expect(await b.appliquer()).toMatchObject({ statut: 'partiel', nouvellesCibles: ['e3'] })
    await expect(b.c.ouvrirSessionEntretien('e3')).rejects.toThrow('cible de retrait de variante')
    await b.c.actualiser(); expect(b.tirer).toHaveBeenCalledWith(expect.arrayContaining(['entretiens/e3.json']))
    b.depot.avantCommit = () => {}
    expect(await b.reprendre()).toMatchObject({ statut: 'termine', annotations: 7 })
    expect(commits(b)).toHaveLength(5)
  })
  test('installation défaillante : acquis conservé, Actualiser répare sans rejouer', async () => {
    const b = banc()
    vi.spyOn(b.store, 'installerEntretienDistant').mockImplementationOnce(() => { throw new Error('Disque') })
    expect(await b.appliquer()).toMatchObject({ statut: 'partiel', entretiens: 1, miroirIncomplet: true })
    await expect(b.c.ouvrirSessionEntretien('e1')).rejects.toThrow('miroir')
    await b.c.actualiser(); expect(b.tirer).toHaveBeenCalledOnce()
    expect(commits(b)).toHaveLength(2)
    expect(JSON.parse(readFileSync(join(b.dir, 'entretiens/e1.json'), 'utf8')).annotations[0].pseudo).toBe('Rebecca')
    expect(await b.reprendre()).toMatchObject({ statut: 'termine' })
  })
  test.each(['barriere', 'entretien', 'retrait'])('réponse %s perdue : suivi dans la même file, aucune répétition', async (phase) => {
    const b = banc()
    b.depot.avantCommit = (actions) => {
      if (actions.some((a) => {
        if (a.action !== 'update') return false
        if (phase === 'entretien') return a.file_path.endsWith('/e1.json')
        if (!a.file_path.endsWith('/corpus.json') || a.content === undefined) return false
        const c = JSON.parse(a.content)
        return phase === 'barriere' ? Boolean(c.retraitVarianteAnon) : c.reglesAnon.personne.pseudos.length === 1
      })) { b.depot.echouerApresAccepter(new Error('Réponse perdue')); b.depot.rendreCommitsIllisibles() }
    }
    expect(await b.appliquer()).toMatchObject({ statut: 'indetermine' })
    await expect(b.c.actualiser()).rejects.toThrow('indéterminée'); expect(b.tirer).not.toHaveBeenCalled()
    await b.c.ouvrirSessionEntretien('e3')
    b.depot.rendreCommits(); b.depot.avantCommit = () => {}
    fermerPolitique()
    await b.c.actualiser(); expect(b.tirer).toHaveBeenCalledOnce()
    expect(b.journal.lister()).toEqual([])
    expect(commits(b)).toHaveLength(phase === 'barriere' ? 1 : phase === 'entretien' ? 2 : 4)
    if (phase === 'retrait') expect(b.c.lireSuiviRetraitVarianteAnon()).toBeNull()
    else expect(b.tirer).toHaveBeenCalledWith(expect.arrayContaining(['entretiens/e2.json']))
  })
  test('suivi sans documents natifs ; copies privées ne donnent pas autorité au renderer', async () => {
    const b = banc(['entretiens/e2.json']); await b.appliquer()
    const suivi = b.c.lireSuiviRetraitVarianteAnon()!
    expect(JSON.stringify(suivi)).not.toContain('corpsTexte')
    suivi.demande.pseudoConserve = 'Intrus'; suivi.nouvellesCibles.push('Intrus')
    expect(b.c.lireSuiviRetraitVarianteAnon()!.demande.pseudoConserve).toBe('Rebecca')
  })
  test.each(['partiel', 'indetermine', 'miroir'] as const)('réouverture protégée de %s : suivi visible sans tirage, réseau ni droits hérités', async (cas) => {
    const b = banc(['entretiens/e2.json'])
    if (cas === 'indetermine') b.depot.avantCommit = (actions) => {
      if (actions.some((a) => a.action === 'update' && a.file_path.endsWith('/e1.json'))) {
        b.depot.echouerApresAccepter(new Error('Réponse perdue')); b.depot.rendreCommitsIllisibles()
      }
    }
    if (cas === 'miroir') vi.spyOn(b.store, 'installerEntretienDistant').mockImplementationOnce(() => { throw new Error('Disque') })
    await b.appliquer()
    const avant = readFileSync(join(b.dir, 'corpus.json'), 'utf8'), publication = b.journal.lister(), transport = vi.fn()
    const client = new ClientGitLab({ urlInstance: 'https://gitlab.example.org', projetId: 1, autorisation: { type: 'jeton-prive', jeton: 'test' } }, transport)
    const preparation = await preparerContexteGitLabLectureSeule({
      id: 'destination', dirLocal: b.dir, branche: 'main', racine: 'racine', client,
      creerSession: () => b.session as never,
      creerTransactions: (store, file) => new TransactionsGitLab({ ...b.options, store, file }),
    })
    expect(transport).not.toHaveBeenCalled()
    expect(readFileSync(join(b.dir, 'corpus.json'), 'utf8')).toBe(avant)
    expect(b.journal.lister()).toEqual(publication)
    expect(preparation.contexte.lireSuiviRetraitVarianteAnon()?.statut).toBe(cas === 'indetermine' ? 'indetermine' : 'partiel')
    expect(preparation.verrousIndisponibles).toBe(true)
    await expect(preparation.contexte.ouvrirSessionEntretien('e2')).rejects.toThrow('cible de retrait de variante')
    await preparation.contexte.ouvrirSessionEntretien('e3')
    expect(commits(b)).toHaveLength(2)
  })
  test('journal altéré à la réouverture : refus avant réseau ou tirage', async () => {
    const b = banc(); writeFileSync(join(b.dir, '.retrait-variante-anon-gitlab.json'), '{invalide')
    const transport = vi.fn()
    const client = new ClientGitLab({ urlInstance: 'https://gitlab.example.org', projetId: 1, autorisation: { type: 'jeton-prive', jeton: 'test' } }, transport)
    await expect(preparerContexteGitLabLectureSeule({ id: 'destination', dirLocal: b.dir, branche: 'main', racine: 'racine', client })).rejects.toThrow('journal de retrait de variante')
    expect(transport).not.toHaveBeenCalled()
  })
})
