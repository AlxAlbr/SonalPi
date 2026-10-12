import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { ClientWebDAV, type ImplementationFetch } from '../../src/main/webdav/client'
import { preparerContexteNextcloud, type ContexteCorpusDistant } from '../../src/main/distant/contexte'
import { ServeurWebDAVMemoire } from './serveurWebdavMemoire'
import { TablesCorrespondance } from '../../src/main/tablesCorrespondance'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { corpusImportWebDAV, entretienImportWebDAV, preparationImportWebDAV, documentsImportWebDAV } from '../fixtures/correspondancesWebDAV'

const dossiers: string[] = []
const contextes: ContexteCorpusDistant[] = []
afterEach(() => {
  for (const contexte of contextes.splice(0)) { contexte.sessions.dispose(); contexte.arreterPresence() }
  for (const dir of dossiers.splice(0)) rmSync(dir, { recursive: true, force: true })
})
function attente() {
  let terminer!: () => void
  const promise = new Promise<void>((resolve) => { terminer = resolve })
  return { promise, terminer }
}
async function banc(natif: boolean) {
  const serveur = new ServeurWebDAVMemoire()
  serveur.creerDossierRelatif('verrous')
  serveur.poser('corpus.json', corpusImportWebDAV())
  for (const id of ['e1', 'e2']) serveur.poser(`entretiens/${id}.json`, entretienImportWebDAV())
  const dirLocal = mkdtempSync(join(tmpdir(), 'sonal-import-contexte-')); dossiers.push(dirLocal)
  const puts: string[] = []
  const pieges = { avant: async (_chemin: string, _init?: RequestInit) => {} }
  const transport: ImplementationFetch = async (url, init) => {
    const chemin = new URL(String(url)).pathname.replace(`${serveur.racineDav}/`, '')
    await pieges.avant(chemin, init)
    const r = await serveur.fetch(url, init)
    if (r.ok && init?.method === 'PUT' && (chemin === 'corpus.json' || chemin.startsWith('entretiens/'))) puts.push(chemin)
    return r
  }
  const client = new ClientWebDAV({ baseUrl: serveur.baseUrl, identifiants: serveur.identifiants }, transport)
  let lancement = 0
  const ouvrir = async () => {
    const { contexte } = await preparerContexteNextcloud({ id: 'synthétique', dirLocal, client,
      identite: () => ({ userId: 'max', machineId: 'poste-test', sessionId: `session-${lancement}` }), verrouNatif: natif })
    lancement++
    contextes.push(contexte)
    return contexte
  }
  const contexte = await ouvrir()
  const preparation = preparationImportWebDAV(contexte.store, await contexte.instantaneCorrespondances())
  return { serveur, client, contexte, preparation, ouvrir, pieges, puts }
}

for (const natif of [false, true]) describe(`gardes du contexte d’import — ${natif ? 'natif' : 'conditionnel'}`, () => {
  test('installe le miroir après confirmation et refuse une sauvegarde sans session', async () => {
    const b = await banc(natif)
    expect(() => b.contexte.exigerEcritureEntretien('e1')).toThrow('session WebDAV')
    expect((await b.contexte.importerCorrespondances(b.preparation)).entretiens?.entretiens).toBe(2)
    expect(b.contexte.store.lireEntretien('e1')).toMatchObject({ ok: true, data: { locuteurs: [{ pseudo: 'Claire' }] } })
    await expect(b.contexte.ouvrirEntretienPourEdition('e1')).resolves.toMatchObject({ acces: 'edition' })
    expect(() => b.contexte.exigerEcritureEntretien('e1')).not.toThrow()
    await b.contexte.fermerEntretien('e1')
    expect(() => b.contexte.exigerEcritureEntretien('e1')).toThrow('session WebDAV')
    await b.contexte.fermer()
  })
  test('cache publié WebDAV : confirmation obligatoire, clones publics sans autorité, application depuis les empreintes privées', async () => {
    const b = await banc(natif)
    const tables = new TablesCorrespondance({ store: () => b.contexte.store, lecture: () => 'miroir' })
    const instantane = await b.contexte.instantaneCorrespondances()
    const apercu = tables.preparerImportWebDAV(documentsImportWebDAV, [], instantane)
    expect(apercu.lecture).toBe('webdav')
    expect(apercu.cibles).toHaveLength(4)
    const choix = b.preparation.choixCibles
    expect(() => tables.consommerImport(apercu.token, {}, choix, false)).toThrow('Confirmez explicitement')
    expect(() => tables.consommerImport(apercu.token, {}, choix, true)).toThrow('expiré')
    const nouveau = tables.preparerImportWebDAV(documentsImportWebDAV, [], instantane)
    const selections = nouveau.cibles!.map((c) => ({ cibleId: c.id, action: c.actionsPossibles[0], ...(c.nature === 'locuteur' ? { etat: 'confirme' as const } : {}) }))
    nouveau.cibles![0].entretienId = '../faux'
    nouveau.lignes[0].pseudos = ['Faux pseudo']
    const preparation = tables.consommerImport(nouveau.token, {}, selections, true)
    expect(preparation.cibles[0].entretienId).toBe('e1')
    expect(preparation.lignes[0].pseudos).toEqual(['Lieu témoin'])
    expect((await b.contexte.importerCorrespondances(preparation)).entretiens?.entretiens).toBe(2)
    await b.contexte.fermer()
  })
  test('refuse ouverture, tirage, mutations et changement de corpus pendant un envoi', async () => {
    const b = await banc(natif), arrive = attente(), suite = attente()
    b.pieges.avant = async (chemin, init) => {
      if (chemin === 'entretiens/e1.json' && init?.method === 'PUT') { arrive.terminer(); await suite.promise }
    }
    const importEnCours = b.contexte.importerCorrespondances(b.preparation)
    await arrive.promise
    try {
      await expect(b.contexte.ouvrirEntretienPourEdition('e2')).rejects.toThrow('import WebDAV')
      await expect(b.contexte.actualiser()).rejects.toThrow('import WebDAV')
      await expect(b.contexte.transactions.executer(() => { throw new Error('Ne doit pas être appelé') })).rejects.toThrow('import WebDAV')
      await expect(b.contexte.fermer()).rejects.toThrow('Attendez')
      expect(() => b.contexte.exigerEcritureEntretien('e1')).toThrow('import WebDAV')
    } finally { suite.terminer() }
    await importEnCours
    await b.contexte.fermer()
  })
  test('l’ouverture déjà commencée exclut l’import, avant même l’acquisition de session', async () => {
    const b = await banc(natif), arrive = attente(), suite = attente()
    b.pieges.avant = async (chemin, init) => {
      if ((natif ? chemin === 'entretiens/e1.json' && init?.method === 'LOCK'
        : chemin === 'verrous/e1.lock.json' && init?.method === 'PUT')) { arrive.terminer(); await suite.promise }
    }
    const ouverture = b.contexte.ouvrirEntretienPourEdition('e1')
    await arrive.promise
    try { await expect(b.contexte.importerCorrespondances(b.preparation)).rejects.toThrow('sessions locales') }
    finally { suite.terminer() }
    await ouverture
    expect(b.puts).toEqual([])
    await expect(b.contexte.importerCorrespondances(b.preparation)).rejects.toThrow('sessions locales')
    await b.contexte.fermer()
  })
  test('une mutation de définitions déjà commencée exclut l’import', async () => {
    const b = await banc(natif), arrive = attente(), suite = attente()
    b.pieges.avant = async (chemin, init) => {
      if (chemin === 'verrous/corpus.lock.json' && init?.method === 'PUT') { arrive.terminer(); await suite.promise }
    }
    const mutation = b.contexte.executerDefinitions(() => b.contexte.store.renommerEntretien('e1', 'Titre synthétique'))
    await arrive.promise
    try { await expect(b.contexte.importerCorrespondances(b.preparation)).rejects.toThrow('Terminez les mutations') }
    finally { suite.terminer() }
    await mutation
    expect(b.puts).toEqual(['corpus.json'])
    await b.contexte.fermer()
  })
  if (!natif) test('arrêt avant le journal : un bail d’import n’est jamais proposé ni publié comme une session', async () => {
    const b = await banc(natif)
    const provider = new ProviderPutConditionnel(b.client, () => ({ userId: 'max', machineId: 'poste-test', sessionId: 'import-preparation-interrompue' }))
    expect((await provider.acquerir('verrous/e1.lock.json')).ok).toBe(true)
    expect(await b.contexte.listerOrphelins()).toEqual([])
    await expect(b.contexte.reprendreOrphelin('verrous/e1.lock.json')).rejects.toThrow('ne correspond pas à une session')
    await expect(b.contexte.abandonnerOrphelin('verrous/e1.lock.json')).rejects.toThrow('ne correspond pas à une session')
    expect(await provider.etat('verrous/e1.lock.json')).not.toBeNull()
    expect(b.puts).toEqual([])
    await provider.liberer('verrous/e1.lock.json')
    await b.contexte.fermer()
  })
  test('relance : conserve le suivi, bloque les mutations ordinaires, reprend uniquement après confirmation', async () => {
    const b = await banc(natif)
    b.pieges.avant = async (chemin, init) => { if (chemin === 'entretiens/e2.json' && init?.method === 'PUT') throw new Error('coupure') }
    await expect(b.contexte.importerCorrespondances(b.preparation)).rejects.toThrow('incomplet')
    const suivi = b.contexte.lireSuiviImportCorrespondances()!
    await b.contexte.fermer()
    b.pieges.avant = async () => {}
    const reprise = await b.ouvrir()
    expect(reprise.lireSuiviImportCorrespondances()).toEqual(suivi)
    await expect(reprise.ouvrirEntretienPourEdition('e1')).rejects.toThrow('import WebDAV')
    await expect(reprise.publierEntretien('e1')).rejects.toThrow('import WebDAV')
    await expect(reprise.reprendreOrphelin(natif ? 'entretiens/e1.json' : 'verrous/e1.lock.json')).rejects.toThrow('import WebDAV')
    const mutations = [
      () => reprise.transactions.executer(() => null),
      () => reprise.transactions.creerEntretienVide('Ne pas créer'),
      () => reprise.transactions.supprimerEntretien('e1'),
      () => reprise.transactions.poserValeurLot([]),
      () => reprise.transactions.appliquerRegleLot([]),
      () => reprise.transactions.executerEntretien('e1', () => null),
      () => reprise.transactions.trierEntretiens('modif'),
      () => reprise.transactions.reconcilierFichiersOrphelins(),
    ]
    for (const mutation of mutations) await expect(mutation()).rejects.toThrow('import WebDAV')
    await expect(reprise.reprendreImportCorrespondances(suivi.operationId, false)).rejects.toThrow('Confirmez explicitement')
    expect(b.puts).toEqual(['entretiens/e1.json'])
    expect((await reprise.reprendreImportCorrespondances(suivi.operationId, true)).entretiens?.entretiens).toBe(2)
    expect(b.puts).toEqual(['entretiens/e1.json', 'entretiens/e2.json'])
    await reprise.fermer()
  })
})
