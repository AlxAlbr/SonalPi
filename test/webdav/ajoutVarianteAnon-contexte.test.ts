import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { preparerContexteNextcloud, type ContexteCorpusDistant } from '../../src/main/distant/contexte'
import { ClientWebDAV, type ImplementationFetch } from '../../src/main/webdav/client'
import { ServeurWebDAVMemoire } from './serveurWebdavMemoire'
import { fixtureRenommageAnon } from '../fixtures/renommageAnon'
import { gesteAutorise } from '../../src/main/gitlab/politiqueGestes'

const dossiers: string[] = [], contextes: ContexteCorpusDistant[] = []
afterEach(async () => {
  for (const c of contextes.splice(0)) { await c.fermer(); c.arreterPresence() }
  for (const d of dossiers.splice(0)) rmSync(d, { recursive: true, force: true })
})
function attente() { let terminer!: () => void; const promise = new Promise<void>((r) => { terminer = r }); return { promise, terminer } }
async function banc(natif: boolean) {
  const f = fixtureRenommageAnon(); f.corpus.reglesAnon.personne.pseudos = ['Claire']
  f.corpus.variables.modalite = { id: 'modalite', lib: 'Variable', portee: 'locuteur', priv: false, ordre: 0, vExport: 0, modalites: [{ id: 'Valeur', lib: 'Valeur', mExport: 1 }] }
  const serveur = new ServeurWebDAVMemoire(); serveur.creerDossierRelatif('verrous')
  serveur.poser('corpus.json', JSON.stringify(f.corpus))
  for (const s of f.sources) serveur.poser(`entretiens/${s.id}.json`, JSON.stringify(s.data))
  const dirLocal = mkdtempSync(join(tmpdir(), 'sonal-ajout-variante-contexte-')); dossiers.push(dirLocal)
  const puts: string[] = [], requetes: string[] = [], pieges = { avant: async (_p: string, _init?: RequestInit) => {}, apres: async (_p: string, _init?: RequestInit) => {} }
  const transport: ImplementationFetch = async (url, init) => {
    const p = new URL(String(url)).pathname.replace(`${serveur.racineDav}/`, '')
    requetes.push(p); await pieges.avant(p, init); const r = await serveur.fetch(url, init)
    if (p === 'corpus.json' && init?.method === 'PUT' && r.ok) puts.push(p)
    await pieges.apres(p, init); return r
  }
  const client = new ClientWebDAV({ baseUrl: serveur.baseUrl, identifiants: serveur.identifiants }, transport)
  let instance = 0
  const ouvrir = async () => {
    const identite = { userId: 'max', machineId: 'poste-fixture', sessionId: `contexte-${instance++}` }
    const p = await preparerContexteNextcloud({ id: 'fixture', dirLocal, client, identite: () => identite, verrouNatif: natif })
    contextes.push(p.contexte); return p.contexte
  }
  const contexte = await ouvrir(), demande = { regleAvant: structuredClone(f.corpus.reglesAnon.personne), pseudo: 'Rebecca' }
  puts.length = 0; requetes.length = 0
  return { f, serveur, dirLocal, puts, requetes, pieges, contexte, demande, ouvrir }
}
for (const natif of [false, true]) describe(`ajout de variante : contexte ${natif ? 'natif' : 'conditionnel'}`, () => {
  test('politique normale, session ouverte conservée, corpus seul et mémoire locale intacte', async () => {
    expect(gesteAutorise('webdav', 'anon.ajouter-variante')).toBe(true)
    const b = await banc(natif); await b.contexte.ouvrirEntretienPourEdition('e1')
    const lecture = b.contexte.store.lireEntretien('e1'); if (!lecture.ok) throw new Error('Fixture illisible')
    lecture.data.corpsTexte.content![0].content![0].text += ' Note indépendante conservée.'
    b.contexte.store.ecrireEntretien('e1', lecture.data); b.contexte.sessions.noterSale('e1')
    const contenu = readFileSync(join(b.dirLocal, 'entretiens/e1.json'), 'utf8'), distant = b.serveur.contenuDe('entretiens/e1.json')
    b.requetes.length = 0
    expect(await b.contexte.ajouterVarianteAnon(b.demande)).toMatchObject({ ajoute: true })
    expect(b.contexte.sessions.idsTenus()).toContain('e1'); expect(b.contexte.sessions.etat('e1')).toMatchObject({ etat: 'a-nous', sale: true })
    expect(b.serveur.contenuDe('entretiens/e1.json')).toBe(distant); expect(readFileSync(join(b.dirLocal, 'entretiens/e1.json'), 'utf8')).toBe(contenu)
    expect(b.requetes.some((p) => p.startsWith('entretiens/'))).toBe(false); expect(b.puts).toEqual(['corpus.json'])
    const attendu = structuredClone(b.f.corpus); attendu.reglesAnon.personne.pseudos.push('Rebecca')
    expect(JSON.parse(readFileSync(join(b.dirLocal, 'corpus.json'), 'utf8'))).toEqual(attendu)
  })
  test('activité réservée avant await : deuxième ajout, mutation, actualisation et fermeture refusés', async () => {
    const b = await banc(natif), arrive = attente(), suite = attente()
    b.pieges.avant = async (p, init) => { if (p === 'corpus.json' && init?.method === 'PUT') { arrive.terminer(); await suite.promise } }
    const publication = b.contexte.ajouterVarianteAnon(b.demande); await arrive.promise
    try {
      await expect(b.contexte.ajouterVarianteAnon(b.demande)).rejects.toThrow('autres modifications')
      await expect(b.contexte.transactions.executer(() => null)).rejects.toThrow('ajout')
      await expect(b.contexte.actualiser()).rejects.toThrow('ajout')
      await expect(b.contexte.fermer()).rejects.toThrow('mutation')
      await expect(b.contexte.preparerSuppressionAnon({ regleId: 'personne' })).rejects.toThrow('ajout')
    } finally { suite.terminer() }
    expect(await publication).toMatchObject({ ajoute: true }); expect(b.puts).toHaveLength(1)
  })
  test('réponse perdue : aucune seconde publication ; Actualiser reconnaît et préserve la session', async () => {
    const b = await banc(natif); await b.contexte.ouvrirEntretienPourEdition('e1')
    b.pieges.apres = async (p, init) => { if (p === 'corpus.json' && init?.method === 'PUT') throw new Error('Réponse perdue') }
    await expect(b.contexte.ajouterVarianteAnon(b.demande)).rejects.toThrow('perdue')
    await expect(b.contexte.ajouterVarianteAnon(b.demande)).rejects.toThrow('vérifier')
    await b.contexte.actualiser(); expect(b.puts).toHaveLength(1); expect(b.contexte.transactions.lireAjoutVariante()).toBeNull()
    expect(b.contexte.store.ouvrir().reglesAnon.personne.pseudos).toEqual(['Claire', 'Rebecca'])
    expect(b.contexte.sessions.idsTenus()).toContain('e1')
  })
  test('relance : installation prouvée, bail ancien intact et autre ajout refusé', async () => {
    const b = await banc(natif)
    b.pieges.apres = async (p, init) => { if (p === 'corpus.json' && init?.method === 'PUT') throw new Error('Réponse perdue') }
    await expect(b.contexte.ajouterVarianteAnon(b.demande)).rejects.toThrow('perdue')
    const droit = b.serveur.contenuDe('verrous/corpus.lock.json'), nouveau = await b.ouvrir()
    expect(nouveau.store.ouvrir().reglesAnon.personne.pseudos).toEqual(['Claire', 'Rebecca'])
    expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBe(droit); expect(b.puts).toHaveLength(1)
    await expect(nouveau.ajouterVarianteAnon({ regleAvant: nouveau.store.ouvrir().reglesAnon.autre, pseudo: 'Supplément' })).rejects.toThrow('ailleurs')
    expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBe(droit)
  })
  test('original seul : relance refusée sans tirage, migration ni replay', async () => {
    const b = await banc(natif)
    b.pieges.avant = async (p, init) => { if (p === 'corpus.json' && init?.method === 'PUT') throw new Error('Issue inconnue') }
    await expect(b.contexte.ajouterVarianteAnon(b.demande)).rejects.toThrow('inconnue')
    b.requetes.length = 0
    await expect(b.ouvrir()).rejects.toThrow('original'); expect(b.puts).toHaveLength(0)
    expect(b.requetes).toEqual(['corpus.json'])
  })
  test('journal invalide refusé avant le réseau ; contexte fermé sans publication', async () => {
    const b = await banc(natif); await b.contexte.fermer()
    await expect(b.contexte.ajouterVarianteAnon(b.demande)).rejects.toThrow('fermé')
    writeFileSync(join(b.dirLocal, '.ajout-variante-anon-webdav.json'), '{invalide')
    b.requetes.length = 0; await expect(b.ouvrir()).rejects.toThrow('journal'); expect(b.requetes).toEqual([])
  })
})
