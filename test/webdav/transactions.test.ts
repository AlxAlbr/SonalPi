/**
 * Tests des TRANSACTIONS DE DÉFINITIONS (plan-multiuser.md §4.7/§4.8, étape E3)
 * contre le serveur WebDAV embarqué : verrou corpus → GET frais → mutation →
 * PUT If-Match → libération ; suppression sous DOUBLE verrou (ordre canonique
 * corpus-avant-entretien, publication corpus puis MOVE) ; refus d'un tiers,
 * divergence 412, hors ligne.
 */

import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { MiroirWebDAV } from '../../src/main/miroir'
import { CorpusStore } from '../../src/main/corpusStore'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { TransactionsCorpus } from '../../src/main/distant/transactions'
import type { IdentiteSession } from '../../src/main/distant/sessions'
import { FORMAT_VERSION, type CorpusFichier } from '../../src/shared/format'
import type { ImplementationFetch } from '../../src/main/webdav/client'
import { ServeurWebDAVMemoire } from './serveurWebdavMemoire'

const IDENTITE_MAX: () => IdentiteSession = () => ({
  userId: 'max',
  machineId: 'portable-max',
  sessionId: 's-MAX',
})
const IDENTITE_OLIVIER: () => IdentiteSession = () => ({
  userId: 'olivier',
  machineId: 'fixe-olivier',
  sessionId: 's-OLI',
})

function corpusInitial(): string {
  const c: CorpusFichier = {
    formatVersion: FORMAT_VERSION,
    nom: 'Trans',
    codebook: {},
    variables: {},
    reglesAnon: {},
    personnes: {},
    membership: {
      e1: { titre: 'Entretien un', date: null, lastModified: '2026-01-01T00:00:00Z' },
    },
  }
  return JSON.stringify(c, null, 2)
}

function entretienE1(): string {
  return JSON.stringify({
    formatVersion: FORMAT_VERSION,
    lastModified: '2026-01-01T00:00:00Z',
    corpsTexte: { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: null } }] },
    annotations: [],
    ancres: [],
    locuteurs: [],
    brouillonsAnon: [],
    meta: { valeursGen: {}, audioRef: null },
  })
}

interface Banc {
  serveur: ServeurWebDAVMemoire
  clientMax: ClientWebDAV
  clientOlivier: ClientWebDAV
  miroir: MiroirWebDAV
  store: CorpusStore
  tx: TransactionsCorpus
}

/** Banc standard : serveur amorcé (corpus + entretien e1), miroir tiré une
 *  fois, store en LECTURE SEULE (comme à l'ouverture distante), transactions
 *  branchées dessus. Deux clients : max (nous) et olivier (tiers). */
async function banc(): Promise<Banc> {
  const serveur = new ServeurWebDAVMemoire({ olivier: 'pass-oli' })
  serveur.poser('corpus.json', corpusInitial())
  serveur.poser('entretiens/e1.json', entretienE1())
  const clientMax = new ClientWebDAV(
    { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
    serveur.fetch,
  )
  const clientOlivier = new ClientWebDAV(
    { baseUrl: serveur.baseUrl, identifiants: { utilisateur: 'olivier', motDePasse: 'pass-oli' } },
    serveur.fetch,
  )
  const miroir = new MiroirWebDAV(clientMax, mkdtempSync(join(tmpdir(), 'sonal-tx-')))
  await miroir.tirer()
  const store = new CorpusStore(miroir.dirLocal)
  store.lectureSeule = true // garde E3 : levée PAR la transaction seulement
  const tx = new TransactionsCorpus(clientMax, miroir, () => store, IDENTITE_MAX)
  return { serveur, clientMax, clientOlivier, miroir, store, tx }
}

function corpusServeur(serveur: ServeurWebDAVMemoire): CorpusFichier {
  return JSON.parse(serveur.contenuDe('corpus.json')!) as CorpusFichier
}

describe('Transaction générique §4.7', () => {
  it('chemin heureux : mutation locale publiée sur le serveur, verrou libéré, garde restaurée', async () => {
    const { serveur, store, tx } = await banc()
    const r = await tx.executer(() => store.ajouterCategorie('Thèmes à nous', null))
    expect(r.id).toMatch(/^cat/)
    // Le serveur porte la mutation…
    expect(corpusServeur(serveur).codebook[r.id].nom).toBe('Thèmes à nous')
    // …le miroir local aussi (la mutation a écrit le fichier fraîchement lu).
    expect(store.ouvrir().codebook[r.id]).toBeDefined()
    // Le verrou corpus est LIBÉRÉ (un tiers peut prendre son tour).
    expect(serveur.contenuDe('verrous/corpus.lock.json')).toBeUndefined()
    // Et la garde lecture seule est RESTAURÉE après la transaction.
    expect(store.lectureSeule).toBe(true)
  })

  it('refus de verrou : « définitions en cours de modification par olivier »', async () => {
    const { clientOlivier, tx } = await banc()
    const pOlivier = new ProviderPutConditionnel(clientOlivier, IDENTITE_OLIVIER)
    await pOlivier.acquerir('verrous/corpus.lock.json')
    await expect(tx.executer(() => 0)).rejects.toThrow(/olivier/)
  })

  it('GET frais : une publication concurrente AVANT la transaction est absorbée, pas écrasée', async () => {
    const { serveur, store, tx } = await banc()
    // Un collègue publie directement (autre poste) : notre manifeste périmé ne
    // doit PAS servir de base à la mutation.
    const concurrent = JSON.parse(corpusInitial()) as CorpusFichier
    concurrent.nom = 'Version du collègue'
    serveur.poser('corpus.json', JSON.stringify(concurrent))
    await tx.executer(() => store.ajouterCategorie('À nous', null))
    const final = corpusServeur(serveur)
    expect(final.nom).toBe('Version du collègue') // la version fraîche était la base…
    expect(Object.values(final.codebook).some((c) => c.nom === 'À nous')).toBe(true) // …et notre mutation l'a complétée
  })

  it('divergence 412 : un PUT concurrent juste avant le nôtre → refus NET, jamais d\u2019écrasement', async () => {
    const { serveur, clientOlivier, miroir, store } = await banc()
    // Middleware : au moment où NOTRE PUT corpus.json part, un collègue pousse
    // sa version — notre garde If-Match ne correspond plus → 412 garanti.
    const clientInstrumente = new ClientWebDAV(
      { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
      async (entree, init) => {
        if (init?.method === 'PUT' && String(entree).endsWith('/corpus.json')) {
          await clientOlivier.putTexte('corpus.json', corpusInitial())
        }
        return serveur.fetch(entree as URL, init)
      },
    )
    const txDivergente = new TransactionsCorpus(clientInstrumente, miroir, () => store, IDENTITE_MAX)
    await expect(txDivergente.executer(() => store.poserNom('Écrasé ?'))).rejects.toThrow(
      /divergence|changé/i,
    )
    // Rien n'a été écrasé côté serveur ; le verrou est reparti.
    expect(corpusServeur(serveur).nom).toBe('Trans')
    expect(serveur.contenuDe('verrous/corpus.lock.json')).toBeUndefined()
  })

  it('hors ligne : échec réseau à la publication → message clair, verrou libéré, garde restaurée (politique α)', async () => {
    const { serveur, miroir, store } = await banc()
    const clientMort = new ClientWebDAV(
      { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
      async (entree, init) => {
        if (init?.method === 'PUT' && String(entree).endsWith('/corpus.json')) {
          throw new TypeError('fetch failed') // politique α : refus immédiat
        }
        return serveur.fetch(entree as URL, init)
      },
    )
    const txHorsLigne = new TransactionsCorpus(clientMort, miroir, () => store, IDENTITE_MAX)
    await expect(txHorsLigne.executer(() => store.poserNom('X'))).rejects.toThrow(/injoignable/)
    expect(serveur.contenuDe('verrous/corpus.lock.json')).toBeUndefined()
    expect(store.lectureSeule).toBe(true)
  })
})

describe('Suppression d\u2019entretien — double verrou §4.7/§4.8', () => {
  it('chemin heureux : membership publié D\u2019ABORD, MOVE serveur ENSUITE, les deux verrous libérés', async () => {
    const { serveur, tx, store } = await banc()
    await tx.supprimerEntretien('e1')
    const c = corpusServeur(serveur)
    expect(c.membership.e1).toBeUndefined()
    // Le fichier entretien a quitté entretiens/ pour corbeille/ (atomique MOVE).
    expect(serveur.contenuDe('entretiens/e1.json')).toBeUndefined()
    expect(serveur.contenuDe('corbeille/e1.json')).toBeDefined()
    // Les DEUX verrous sont libérés (ordre inverse : entretien puis corpus).
    expect(serveur.contenuDe('verrous/e1.lock.json')).toBeUndefined()
    expect(serveur.contenuDe('verrous/corpus.lock.json')).toBeUndefined()
    // Localement, le store a retiré le membership (fichiers en corbeille du miroir).
    expect(store.ouvrir().membership.e1).toBeUndefined()
  })

  it('refus : l\u2019entretien est verrouillé par olivier → suppression impossible, corpus intact, corpus lock rendu', async () => {
    const { serveur, clientOlivier, tx } = await banc()
    const pOlivier = new ProviderPutConditionnel(clientOlivier, IDENTITE_OLIVIER)
    await pOlivier.acquerir('verrous/e1.lock.json')
    await expect(tx.supprimerEntretien('e1')).rejects.toThrow(/olivier/)
    // Le membership n'a PAS bougé ; notre verrou corpus a été rendu ;
    // le verrou d'olivier est INTACT (on ne force jamais pour supprimer).
    expect(corpusServeur(serveur).membership.e1).toBeDefined()
    expect(serveur.contenuDe('verrous/corpus.lock.json')).toBeUndefined()
    expect(await pOlivier.etat('verrous/e1.lock.json')).not.toBeNull()
  })

  it('l\u2019ordre canonique tient : le verrou CORPUS est pris avant le verrou ENTRETIEN (§4.8)', async () => {
    const { serveur, miroir, store } = await banc()
    const ordre: string[] = []
    // Espion : note l'ordre réel des acquisitions de verrou par NOTRE session.
    const fetchEspion: ImplementationFetch = async (entree, init) => {
      if (
        init?.method === 'PUT' &&
        String(entree).endsWith('.lock.json') &&
        typeof init.body === 'string' &&
        init.body.includes('"s-MAX"')
      ) {
        ordre.push(String(entree).includes('corpus.lock.json') ? 'corpus' : 'entretien')
      }
      return serveur.fetch(entree, init)
    }
    const clientEspion = new ClientWebDAV(
      { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
      fetchEspion,
    )
    const txEspion = new TransactionsCorpus(clientEspion, miroir, () => store, IDENTITE_MAX)
    await txEspion.supprimerEntretien('e1')
    expect(ordre).toEqual(['corpus', 'entretien'])
  })
})
