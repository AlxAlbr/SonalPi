import { describe, expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClientWebDAV } from '../src/main/webdav/client'
import { MiroirWebDAV } from '../src/main/distant/miroirWebDAV'
import { TransactionsCorpus } from '../src/main/distant/transactions'
import { CorpusStore } from '../src/main/corpusStore'
import { creerHandlersOperationsThemes } from '../src/main/ipcOperationsThemes'
import { JournalLocalThemesWebDAV, type JournalThemesWebDAV } from '../src/main/distant/journalThemesWebDAV'
import type { CorpusFichier, EntretienFichier } from '../src/shared/format'
import type { DemandeOperationTheme, ProgressionOperationTheme } from '../src/shared/corpus/themes'
import { ServeurWebDAVMemoire } from './webdav/serveurWebdavMemoire'
import { corpusDistantValide, entretienDistantValide } from './webdav/fixturesCorpusDistant'

const transfert: DemandeOperationTheme = { type: 'transfert', conserverSource: true, source: 'source', cible: { type: 'existante', id: 'cible' } }
const options = { entretiens: 'tous-prevus' as const }
function division(): Extract<DemandeOperationTheme, { type: 'division' }> {
  return { type: 'division', source: 'source', effacerSource: false, choix: ['e1', 'e2', 'e3'].map((entretienId) => ({
    codage: { entretienId, annotationId: 'a' }, destination: 'A',
  })), cibles: ['A', 'B'].map((token) => ({ type: 'nouvelle', token, nom: token, parent: 'source' })) }
}
function corpus(): CorpusFichier {
  const c = JSON.parse(corpusDistantValide(['e1', 'e2', 'e3'])) as CorpusFichier
  c.codebook = Object.fromEntries(['source', 'cible'].map((id, ordre) => [id, { id, nom: id, parent: null, ordre, actif: true, codeExport: id }]))
  return c
}
function entretien(): EntretienFichier {
  return JSON.parse(entretienDistantValide({
    corpsTexte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Texte de test.' }] }] },
    annotations: [
      { id: 'a', type: 'codage', code: 'source', from: 1, to: 6, auteur: 'test' },
      { id: 'orphelin', type: 'codage', code: 'source', from: 8, to: 8, auteur: 'test' },
      { id: 'c', type: 'codage', code: 'cible', from: 1, to: 6, auteur: 'test' },
      { id: 'memo', type: 'commentaire', texte: 'À conserver', from: 1, to: 6, auteur: 'test' },
    ],
  })) as EntretienFichier
}
async function banc(natif = false) {
  const serveur = new ServeurWebDAVMemoire()
  serveur.creerDossierRelatif('verrous')
  serveur.poser('corpus.json', JSON.stringify(corpus()))
  for (const id of ['e1', 'e2', 'e3']) serveur.poser(`entretiens/${id}.json`, JSON.stringify(entretien()))
  const requetes: Request[] = []
  let intercepter: (req: Request) => Promise<Response | undefined> = async () => undefined
  let maximumVerrous = 0
  const client = new ClientWebDAV({ baseUrl: serveur.baseUrl, identifiants: serveur.identifiants }, async (input, init) => {
    const req = new Request(input, init)
    requetes.push(req)
    const reponse = await intercepter(req) ?? await serveur.fetch(input, init)
    maximumVerrous = Math.max(maximumVerrous, ['e1', 'e2', 'e3'].filter((id) => natif
      ? serveur.verrouNatifDe(`entretiens/${id}.json`) : serveur.contenuDe(`verrous/${id}.lock.json`)).length)
    return reponse
  })
  const miroir = new MiroirWebDAV(client, mkdtempSync(join(tmpdir(), 'sonal-lot-themes-')))
  await miroir.tirer()
  const store = new CorpusStore(miroir.dirLocal)
  store.lectureSeule = true
  const sessions: string[] = []
  const recuperables: string[] = []
  const creerTransactions = () => new TransactionsCorpus(client, miroir, () => store, () => ({
    userId: 'max', machineId: 'test', sessionId: 'application',
  }), { verrouNatif: natif, getSessions: () => ({ idsTenus: () => sessions, idsRecuperablesLocalement: () => recuperables, noterSale: vi.fn() }) })
  const tx = creerTransactions()
  const lire = (id: string) => JSON.parse(serveur.contenuDe(`entretiens/${id}.json`)!) as EntretienFichier
  const journal = () => JSON.parse(readFileSync(join(miroir.dirLocal, '.themes-webdav.json'), 'utf8'))
  const puts = () => requetes.filter((r) => r.method === 'PUT' && /\/(corpus\.json|entretiens\/e[123]\.json)$/.test(new URL(r.url).pathname))
  return { serveur, client, miroir, store, tx, creerTransactions, sessions, recuperables, requetes, lire, journal, puts,
    maximumVerrous: () => maximumVerrous, intercepter: (fn: typeof intercepter) => { intercepter = fn } }
}
const cible = (req: Request, id: string) => new URL(req.url).pathname.endsWith(`/entretiens/${id}.json`)

describe('publication des opérations de thèmes WebDAV', () => {
  test.each([false, true])('transfert sous verrou natif = %s, source et autres annotations conservées', async (natif) => {
    const b = await banc(natif)
    const a = await b.tx.analyserOperationTheme(transfert)
    const etapes: ProgressionOperationTheme[] = []
    const resultat = await b.tx.executerOperationTheme(a.operationId, transfert, options, (p) => etapes.push(p))
    expect(resultat).toMatchObject({ statut: 'appliquee', entretiens: 3, reaffectes: 3, doublonsSupprimes: 3 })
    expect(b.maximumVerrous()).toBe(1)
    for (const id of ['e1', 'e2', 'e3']) {
      expect(b.lire(id).annotations.filter((a) => a.type === 'codage').map((a) => a.code)).toEqual(['cible', 'cible'])
      expect(b.lire(id).annotations.find((a) => a.id === 'memo')).toEqual(entretien().annotations[3])
      expect(JSON.parse(readFileSync(join(b.miroir.dirLocal, `entretiens/${id}.json`), 'utf8'))).toEqual(b.lire(id))
      expect(b.serveur.verrouNatifDe(`entretiens/${id}.json`)).toBeUndefined()
      expect(b.serveur.contenuDe(`verrous/${id}.lock.json`)).toBeUndefined()
    }
    expect(JSON.parse(b.serveur.contenuDe('corpus.json')!).codebook.source).toBeDefined()
    expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBeUndefined()
    expect(b.puts()).toHaveLength(3)
    expect(b.journal().termine).toBe(true)
    expect(b.tx.lireSuiviOperationTheme()).toBeNull()
    expect(etapes.at(-1)).toMatchObject({ operationId: a.operationId, phase: 'finalisation', total: 3, termines: 3, reussis: 3, echecs: 0 })
    expect(b.store.lectureSeule).toBe(true)
  })

  test('refus d’un entretien : les succès précédents et suivants restent acquis', async () => {
    const b = await banc()
    b.intercepter(async (req) => req.method === 'PUT' && cible(req, 'e2') ? new Response('refus', { status: 412 }) : undefined)
    const a = await b.tx.analyserOperationTheme(transfert)
    const r = await b.tx.executerOperationTheme(a.operationId, transfert, options)
    expect(r).toMatchObject({ statut: 'partielle', bilan: { reussis: [{ id: 'e1' }, { id: 'e3' }], echecs: [{ id: 'e2' }], sourceConservee: true } })
    expect(b.lire('e2')).toEqual(entretien())
    expect(b.lire('e3').annotations.filter((a) => a.code === 'source')).toHaveLength(0)
    expect(b.journal().publication).toBeUndefined()
    expect(b.serveur.contenuDe('verrous/e2.lock.json')).toBeUndefined()
  })

  test('division partielle puis reprise après redémarrage : mêmes destinations, choix redemandés', async () => {
    const b = await banc()
    let refuser = true
    b.intercepter(async (req) => refuser && req.method === 'PUT' && cible(req, 'e2') ? new Response('refus', { status: 423 }) : undefined)
    const d = division()
    const a = await b.tx.analyserOperationTheme(d)
    const r = await b.tx.executerOperationTheme(a.operationId, d, options)
    expect(r.statut).toBe('partielle')
    const ids = b.journal().cibles
    expect(ids).toHaveLength(2)
    expect(Object.values(JSON.parse(b.serveur.contenuDe('corpus.json')!).codebook)).toHaveLength(4)
    const tx = b.creerTransactions()
    refuser = false
    const reprise = await tx.preparerRepriseOperationTheme(a.operationId)
    expect(reprise.demande).toMatchObject({ type: 'division', choix: [] })
    const nouvelleDemande = reprise.demande as Extract<DemandeOperationTheme, { type: 'division' }>
    nouvelleDemande.choix = [{ codage: { entretienId: 'e2', annotationId: 'a' }, destination: 'B' }]
    const final = await tx.analyserOperationTheme(nouvelleDemande, reprise.apercu.operationId)
    const fini = await tx.executerOperationTheme(final.operationId, nouvelleDemande, options)
    expect(fini).toMatchObject({ statut: 'appliquee', entretiens: 3, reaffectes: 3 })
    expect(b.journal().cibles).toEqual(ids)
    expect(b.lire('e2').annotations.find((a) => a.id === 'a')?.code).toBe(ids[1].id)
    expect(b.lire('e2').annotations.find((a) => a.id === 'orphelin')?.code).toBe('source')
    expect(b.puts().filter((req) => new URL(req.url).pathname.endsWith('/corpus.json'))).toHaveLength(1)
  })

  test('entretien changé après l’aperçu : aucun écrasement, échec nommé et poursuite du lot', async () => {
    const b = await banc()
    const a = await b.tx.analyserOperationTheme(transfert)
    const modifie = { ...entretien(), notes: [{ id: 'nouveau' }] }
    b.serveur.poser('entretiens/e2.json', JSON.stringify(modifie))
    const r = await b.tx.executerOperationTheme(a.operationId, transfert, options)
    expect(r).toMatchObject({ statut: 'partielle', bilan: { echecs: [{ id: 'e2', motif: expect.stringMatching(/a changé/) }] } })
    expect(b.lire('e2')).toEqual(modifie)
    expect(b.puts()).toHaveLength(2)
  })

  test.each(['active', 'recuperable'])('session locale %s : pas de second verrou ni écrasement du miroir', async (mode) => {
    const b = await banc(true)
    const a = await b.tx.analyserOperationTheme(transfert)
    const idsSessions = mode === 'active' ? b.sessions : b.recuperables
    idsSessions.push('e1')
    const fichier = join(b.miroir.dirLocal, 'entretiens/e1.json')
    writeFileSync(fichier, 'copie locale non publiée')
    const r = await b.tx.executerOperationTheme(a.operationId, transfert, options)
    expect(r).toMatchObject({ statut: 'partielle', bilan: { echecs: [{ id: 'e1', motif: expect.stringMatching(/session locale/) }] } })
    expect(readFileSync(fichier, 'utf8')).toBe('copie locale non publiée')
    expect(b.lire('e1')).toEqual(entretien())
    expect(b.requetes.filter((r) => r.method === 'LOCK' && cible(r, 'e1'))).toHaveLength(0)
  })

  test('réponse PUT perdue mais contenu confirmé : pas de rejeu et lot poursuivi', async () => {
    const b = await banc()
    b.intercepter(async (req) => {
      if (req.method === 'PUT' && cible(req, 'e1')) {
        await b.serveur.fetch(req)
        throw new Error('réponse perdue après commit')
      }
      return undefined
    })
    const a = await b.tx.analyserOperationTheme(transfert)
    expect(await b.tx.executerOperationTheme(a.operationId, transfert, options)).toMatchObject({ statut: 'appliquee', entretiens: 3 })
    expect(b.puts()).toHaveLength(3)
  })

  test('réponse inconnue : arrêt, intention persistée, reprise interdite et réconciliation sans PUT de données', async () => {
    const b = await banc()
    b.intercepter(async (req) => {
      if (req.method === 'PUT' && cible(req, 'e2')) throw new Error('connexion interrompue avant réponse')
      return undefined
    })
    const a = await b.tx.analyserOperationTheme(transfert)
    const r = await b.tx.executerOperationTheme(a.operationId, transfert, options)
    expect(r).toMatchObject({ statut: 'indeterminee', bilan: { reussis: [{ id: 'e1' }], inconnus: [{ id: 'e2' }], differes: [{ id: 'e3' }] } })
    expect(b.lire('e3')).toEqual(entretien())
    const attente = b.journal().publication
    expect(attente.chemin).toBe('entretiens/e2.json')
    expect(b.puts()).toHaveLength(2)
    const tx = b.creerTransactions()
    expect(() => tx.analyserOperationTheme(transfert)).toThrow(/indéterminée|réconciliée/)
    await expect(tx.preparerRepriseOperationTheme(a.operationId)).rejects.toThrow(/Réconciliez/)
    expect(() => tx.abandonnerOperationTheme(a.operationId)).toThrow(/inconnue ne peut pas être abandonnée/)
    expect(await tx.reconcilierOperationTheme(a.operationId)).toMatchObject({ statut: 'indeterminee' })
    expect(b.puts()).toHaveLength(2)
    // Le serveur finit par rendre visible la publication ; seule cette preuve autorise la suite.
    b.serveur.poser(attente.chemin, attente.contenu)
    b.intercepter(async () => undefined)
    expect(await tx.reconcilierOperationTheme(a.operationId)).toMatchObject({ statut: 'indeterminee' })
    expect(await b.tx.reconcilierOperationTheme(a.operationId)).toMatchObject({ statut: 'partielle', bilan: { reussis: [{ id: 'e1' }, { id: 'e2' }] } })
    expect(b.puts()).toHaveLength(2)
    const reprise = await tx.preparerRepriseOperationTheme(a.operationId)
    expect(reprise.apercu.parEntretien.filter((e) => e.aModifier).map((e) => e.id)).toEqual(['e3'])
    expect(await tx.executerOperationTheme(reprise.apercu.operationId, reprise.demande, options)).toMatchObject({ statut: 'appliquee', entretiens: 3 })
  })

  test('la relecture thématique ne peut pas reconnaître une autre intention de publication', async () => {
    const b = await banc()
    b.intercepter(async (req) => {
      if (req.method === 'PUT' && cible(req, 'e2')) throw new Error('Réponse inconnue')
      return undefined
    })
    const a = await b.tx.analyserOperationTheme(transfert)
    await b.tx.executerOperationTheme(a.operationId, transfert, options)
    const chemin = join(b.miroir.dirLocal, '.publication-pseudos-webdav.json')
    const original = readFileSync(chemin, 'utf8'), j = JSON.parse(original)
    j.chemin = 'entretiens/e3.json'
    writeFileSync(chemin, JSON.stringify(j))
    try {
      await expect(b.tx.reconcilierOperationTheme(a.operationId)).rejects.toThrow('indéterminée')
      expect(b.puts()).toHaveLength(2)
      expect(readFileSync(chemin, 'utf8')).toBe(JSON.stringify(j))
    } finally { writeFileSync(chemin, original) }
  })

  test('création de destinations inconnue : aucune réaffectation avant confirmation', async () => {
    const b = await banc()
    b.intercepter(async (req) => {
      if (req.method === 'PUT' && new URL(req.url).pathname.endsWith('/corpus.json')) throw new Error('réponse des définitions perdue')
      return undefined
    })
    const d = division()
    const a = await b.tx.analyserOperationTheme(d)
    expect(await b.tx.executerOperationTheme(a.operationId, d, options)).toMatchObject({ statut: 'indeterminee', bilan: { ciblesCreees: [] } })
    expect(b.puts()).toHaveLength(1)
    for (const id of ['e1', 'e2', 'e3']) expect(b.lire(id)).toEqual(entretien())
    const j = b.journal()
    b.serveur.poser('corpus.json', j.publication.contenu)
    b.intercepter(async () => undefined)
    expect(await b.tx.reconcilierOperationTheme(a.operationId)).toMatchObject({ statut: 'partielle', bilan: { ciblesCreees: j.cibles } })
    expect((await b.tx.preparerRepriseOperationTheme(a.operationId)).demande).toMatchObject({ choix: [] })
    expect(b.puts()).toHaveLength(1)
  })

  test('les définitions restent créées si tous les entretiens refusent la publication', async () => {
    const b = await banc()
    b.intercepter(async (req) => req.method === 'PUT' && /\/entretiens\/e/.test(new URL(req.url).pathname)
      ? new Response('refus', { status: 403 }) : undefined)
    const d = division()
    const a = await b.tx.analyserOperationTheme(d)
    expect(await b.tx.executerOperationTheme(a.operationId, d, options)).toMatchObject({ statut: 'partielle', bilan: { reussis: [], echecs: [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }], ciblesCreees: [{ token: 'A' }, { token: 'B' }] } })
    expect(Object.keys(JSON.parse(b.serveur.contenuDe('corpus.json')!).codebook)).toHaveLength(4)
  })

  test('un miroir non actualisable après un commit garde l’intention et ne relance pas le PUT', async () => {
    const b = await banc()
    const noter = vi.spyOn(b.miroir, 'noterEtagPublie').mockImplementation((chemin) => {
      if (chemin === 'entretiens/e1.json') throw new Error('miroir indisponible')
    })
    const a = await b.tx.analyserOperationTheme(transfert)
    expect(await b.tx.executerOperationTheme(a.operationId, transfert, options)).toMatchObject({ statut: 'indeterminee' })
    expect(b.journal().publication.chemin).toBe('entretiens/e1.json')
    expect(b.puts()).toHaveLength(1)
    noter.mockRestore()
    expect(await b.tx.reconcilierOperationTheme(a.operationId)).toMatchObject({ statut: 'partielle', bilan: { reussis: [{ id: 'e1' }] } })
    expect(b.puts()).toHaveLength(1)
  })

  test('échec de persistance après le commit : intention conservée et succès compté une seule fois', async () => {
    const b = await banc()
    const ecrire = JournalLocalThemesWebDAV.prototype.ecrire
    const espion = vi.spyOn(JournalLocalThemesWebDAV.prototype, 'ecrire').mockImplementation(function (this: JournalLocalThemesWebDAV, j: JournalThemesWebDAV) {
      if (!j.publication && j.bilan.reussis.some((e) => e.id === 'e1')) throw new Error('journal non actualisable')
      ecrire.call(this, j)
    })
    try {
      const a = await b.tx.analyserOperationTheme(transfert)
      expect(await b.tx.executerOperationTheme(a.operationId, transfert, options)).toMatchObject({ statut: 'indeterminee' })
      expect(b.journal().publication.chemin).toBe('entretiens/e1.json')
      expect(b.journal().bilan.reussis).toEqual([])
      espion.mockRestore()
      expect(await b.tx.reconcilierOperationTheme(a.operationId)).toMatchObject({ statut: 'partielle', bilan: { reussis: [{ id: 'e1', reaffectes: 1 }] } })
      expect(await b.tx.reconcilierOperationTheme(a.operationId)).toMatchObject({ statut: 'partielle', bilan: { reussis: [{ id: 'e1', reaffectes: 1 }] } })
      expect(b.puts()).toHaveLength(1)
    } finally { espion.mockRestore() }
  })

  test('une intention qui ne peut pas être persistée interdit le PUT concerné', async () => {
    const b = await banc()
    const ecrire = JournalLocalThemesWebDAV.prototype.ecrire
    const espion = vi.spyOn(JournalLocalThemesWebDAV.prototype, 'ecrire').mockImplementation(function (this: JournalLocalThemesWebDAV, j: JournalThemesWebDAV) {
      if (j.publication?.entretien?.id === 'e1') throw new Error('journal non inscriptible')
      ecrire.call(this, j)
    })
    try {
      const a = await b.tx.analyserOperationTheme(transfert)
      expect(await b.tx.executerOperationTheme(a.operationId, transfert, options)).toMatchObject({ statut: 'partielle', bilan: { echecs: [{ id: 'e1', motif: expect.stringMatching(/journal non inscriptible/) }] } })
      expect(b.puts().some((req) => cible(req, 'e1'))).toBe(false)
      expect(b.lire('e1')).toEqual(entretien())
    } finally { espion.mockRestore() }
  })

  test('corpus changé, commande non confirmée et variantes destructives : refus avant mutation', async () => {
    const b = await banc()
    const a = await b.tx.analyserOperationTheme(transfert)
    expect(await b.tx.executerOperationTheme(a.operationId, { ...transfert, source: 'cible' }, options)).toMatchObject({ statut: 'non-appliquee' })
    b.serveur.poser('corpus.json', JSON.stringify({ ...corpus(), nom: 'Modifié' }))
    expect(await b.tx.executerOperationTheme(a.operationId, transfert, options)).toMatchObject({ statut: 'non-appliquee', motif: expect.stringMatching(/corpus a changé/) })
    expect(await b.tx.executerOperationTheme('inexistant', { ...division(), effacerSource: true }, options)).toMatchObject({ statut: 'non-appliquee' })
    expect(b.puts()).toHaveLength(0)
  })

  test('journal corrompu ou d’une autre destination : aucune reprise ni publication', async () => {
    const b = await banc()
    const fichier = join(b.miroir.dirLocal, '.themes-webdav.json')
    writeFileSync(fichier, '{')
    await expect(b.tx.analyserOperationTheme(transfert)).rejects.toThrow(/illisible/)
    expect(await b.tx.reconcilierOperationTheme('autre')).toMatchObject({ statut: 'indeterminee' })
    writeFileSync(fichier, JSON.stringify({ version: 1, destination: 'ailleurs' }))
    await expect(b.tx.analyserOperationTheme(transfert)).rejects.toThrow(/invalide/)
    expect(b.puts()).toHaveLength(0)
  })

  test('IPC publie et reprend par le service dédié, sans appeler le backend local', async () => {
    const b = await banc()
    let fournisseur: 'local' | 'webdav' | 'gitlab' = 'webdav'
    const executerLocal = vi.spyOn(b.store, 'executerOperationTheme')
    const progression = vi.fn()
    const h = creerHandlersOperationsThemes({ store: () => b.store, fournisseur: () => fournisseur, progression,
      webdav: {
        analyser: (d, precedent) => b.tx.analyserOperationTheme(d, precedent),
        details: async (id, entretien) => b.tx.detailsOperationTheme(id, entretien),
        executer: (id, d, o, p) => b.tx.executerOperationTheme(id, d, o, p),
        lireSuivi: async () => b.tx.lireSuiviOperationTheme(),
        preparerReprise: (id) => b.tx.preparerRepriseOperationTheme(id),
        reconcilier: (id) => b.tx.reconcilierOperationTheme(id),
        abandonner: async (id) => b.tx.abandonnerOperationTheme(id),
      },
    })
    b.intercepter(async (req) => req.method === 'PUT' && cible(req, 'e2') ? new Response('refus', { status: 412 }) : undefined)
    const a = await h.analyser(transfert)
    expect(a.execution).toBe('entretiens-sequentiels')
    expect(await h.executer(a.operationId, transfert, options)).toMatchObject({ statut: 'partielle' })
    expect(progression).toHaveBeenCalled()
    expect(executerLocal).not.toHaveBeenCalled()
    expect(await h.lireSuivi()).toMatchObject({ operationId: a.operationId, indeterminee: false })
    expect((await h.preparerReprise(a.operationId)).apercu.parEntretien.filter((e) => e.aModifier).map((e) => e.id)).toEqual(['e2'])
    const nombre = b.puts().length
    expect(await h.reconcilier(a.operationId)).toMatchObject({ statut: 'partielle' })
    await h.abandonner(a.operationId)
    expect(await h.lireSuivi()).toBeNull()
    expect(await h.reconcilier(a.operationId)).toMatchObject({ statut: 'partielle' })
    expect(b.puts()).toHaveLength(nombre)
    fournisseur = 'gitlab'
    expect(() => h.reconcilier(a.operationId)).toThrow()
    expect(() => h.executer(a.operationId, transfert, options)).toThrow()
    fournisseur = 'local'
    expect(h.lireSuivi()).toBeNull()
  })

  test('anti-double lancement et aperçu consommé, même pendant une attente serveur', async () => {
    const b = await banc()
    const a = await b.tx.analyserOperationTheme(transfert)
    let continuer!: () => void
    const pause = new Promise<void>((resolve) => { continuer = resolve })
    let entre!: () => void
    const commence = new Promise<void>((resolve) => { entre = resolve })
    b.intercepter(async (req) => {
      if (req.method === 'PUT' && cible(req, 'e1')) { entre(); await pause }
      return undefined
    })
    const premiere = b.tx.executerOperationTheme(a.operationId, transfert, options)
    await commence
    expect(b.tx.operationThemeEnCours).toBe(true)
    expect(await b.tx.executerOperationTheme(a.operationId, transfert, options)).toMatchObject({ statut: 'non-appliquee', motif: expect.stringMatching(/déjà en cours/) })
    continuer()
    await premiere
    expect(b.tx.operationThemeEnCours).toBe(false)
    expect(await b.tx.executerOperationTheme(a.operationId, transfert, options)).toMatchObject({ statut: 'non-appliquee', motif: expect.stringMatching(/absent/) })
    expect(b.puts()).toHaveLength(3)
  })
})
