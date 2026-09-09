/**
 *  Tests des TRANSACTIONS DE DÉFINITIONS
 *  contre le serveur WebDAV embarqué : verrou corpus → GET frais → mutation →
 *  PUT If-Match → libération ; suppression sous DOUBLE verrou (ordre canonique
 *  corpus-avant-entretien, publication corpus puis MOVE) ; refus d'un tiers,
 *  divergence 412, hors ligne.
 */

import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { MiroirWebDAV } from '../../src/main/distant/miroir'
import { CorpusStore } from '../../src/main/corpusStore'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { TransactionsCorpus } from '../../src/main/distant/transactions'
import type { IdentiteSession } from '../../src/main/distant/sessions'
import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier } from '../../src/shared/format'
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

/** Banc standard : serveur amorcé (corpus + entretien e1), miroir tiré une fois,
 *  store en LECTURE SEULE (comme à l'ouverture distante), transactions branchées dessus.
 *  Deux clients : max (nous) et olivier (tiers). */
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
  store.lectureSeule = true // garde : levée PAR la transaction seulement
  const tx = new TransactionsCorpus(clientMax, miroir, () => store, IDENTITE_MAX)
  return { serveur, clientMax, clientOlivier, miroir, store, tx }
}

function corpusServeur(serveur: ServeurWebDAVMemoire): CorpusFichier {
  return JSON.parse(serveur.contenuDe('corpus.json')!) as CorpusFichier
}

describe('Transaction générique', () => {
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
    // Un collègue publie directement (autre poste) :
    // notre manifeste périmé ne doit PAS servir de base à la mutation.
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
    // Middleware : au moment où NOTRE PUT corpus.json part, un collègue pousse sa version —
    // notre garde If-Match ne correspond plus → 412 garanti.
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
    expect(store.ouvrir().nom).toBe('Trans')
    expect(serveur.contenuDe('verrous/corpus.lock.json')).toBeUndefined()
    expect(store.lectureSeule).toBe(true)
  })

  it('réconcilie un PUT appliqué dont la réponse réseau a été perdue', async () => {
    const { serveur, miroir, store } = await banc()
    const clientReponsePerdue = new ClientWebDAV(
      { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
      async (entree, init) => {
        if (init?.method === 'PUT' && String(entree).endsWith('/corpus.json')) {
          await serveur.fetch(entree as URL, init)
          throw new TypeError('réponse perdue')
        }
        return serveur.fetch(entree as URL, init)
      },
    )
    const txReponsePerdue = new TransactionsCorpus(
      clientReponsePerdue,
      miroir,
      () => store,
      IDENTITE_MAX,
    )

    await expect(txReponsePerdue.executer(() => store.poserNom('Confirmé'))).resolves.toBeDefined()
    expect(corpusServeur(serveur).nom).toBe('Confirmé')
    expect(store.ouvrir().nom).toBe('Confirmé')
    expect(serveur.contenuDe('verrous/corpus.lock.json')).toBeUndefined()
  })

  it('restaure le miroir si la mutation locale lève avant publication', async () => {
    const { serveur, store, tx } = await banc()
    await expect(tx.executer(() => {
      store.poserNom('Mutation partielle')
      throw new Error('refus métier')
    })).rejects.toThrow('refus métier')

    expect(store.ouvrir().nom).toBe('Trans')
    expect(corpusServeur(serveur).nom).toBe('Trans')
  })
})

describe('Création et import d’entretien — transaction multi-fichiers', () => {
  it('publie l’entretien avant son membership et met le miroir à jour', async () => {
    const { serveur, miroir, store } = await banc()
    const ordre: string[] = []
    const clientEspion = new ClientWebDAV(
      { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
      async (entree, init) => {
        const url = String(entree)
        if (init?.method === 'PUT' && url.includes('/entretiens/')) ordre.push('entretien')
        if (init?.method === 'PUT' && url.endsWith('/corpus.json')) ordre.push('corpus')
        return serveur.fetch(entree as URL, init)
      },
    )
    const tx = new TransactionsCorpus(clientEspion, miroir, () => store, IDENTITE_MAX)

    const resultat = await tx.creerEntretienVide('Nouvel entretien')

    expect(ordre).toEqual(['entretien', 'corpus'])
    expect(corpusServeur(serveur).membership[resultat.id]).toBeDefined()
    expect(serveur.contenuDe(`entretiens/${resultat.id}.json`)).toBeDefined()
    expect(store.lireEntretien(resultat.id).ok).toBe(true)
    expect(miroir.etagDistant(`entretiens/${resultat.id}.json`)).not.toBeNull()
  })

  it('publie aussi le fichier d’un entretien importé', async () => {
    const { serveur, tx } = await banc()
    const fichier = JSON.parse(entretienE1()) as EntretienFichier
    const { formatVersion: _formatVersion, lastModified: _lastModified, ...payload } = fichier
    payload.corpsTexte = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Importé' }] }],
    }

    const resultat = await tx.importerEntretien('Entretien importé', payload)

    expect(corpusServeur(serveur).membership[resultat.id]?.titre).toBe('Entretien importé')
    expect(serveur.contenuDe(`entretiens/${resultat.id}.json`)).toContain('Importé')
  })

  it('récupère une réponse perdue après la création exclusive de l’entretien', async () => {
    const { serveur, miroir, store } = await banc()
    let reponsePerdue = false
    const clientReponsePerdue = new ClientWebDAV(
      { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
      async (entree, init) => {
        const url = String(entree)
        if (!reponsePerdue && init?.method === 'PUT' && url.includes('/entretiens/')) {
          reponsePerdue = true
          await serveur.fetch(entree as URL, init)
          throw new TypeError('réponse perdue')
        }
        return serveur.fetch(entree as URL, init)
      },
    )
    const tx = new TransactionsCorpus(clientReponsePerdue, miroir, () => store, IDENTITE_MAX)

    const resultat = await tx.creerEntretienVide('Réponse perdue')

    expect(corpusServeur(serveur).membership[resultat.id]).toBeDefined()
    expect(serveur.contenuDe(`entretiens/${resultat.id}.json`)).toBeDefined()
  })

  it('retire l’entretien créé si la publication du membership échoue certainement', async () => {
    const { serveur, miroir, store } = await banc()
    const clientPanne = new ClientWebDAV(
      { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
      async (entree, init) => {
        if (init?.method === 'PUT' && String(entree).endsWith('/corpus.json')) {
          return new Response('panne', { status: 503 })
        }
        return serveur.fetch(entree as URL, init)
      },
    )
    const tx = new TransactionsCorpus(clientPanne, miroir, () => store, IDENTITE_MAX)

    await expect(tx.creerEntretienVide('Échec corpus')).rejects.toThrow(/erreur|réessayez/i)

    const fichiers = (await clientPanne.propfind('entretiens'))
      .filter((entree) => !entree.dossier)
      .map((entree) => entree.chemin)
    expect(fichiers).toEqual(['e1.json'])
    expect(Object.keys(corpusServeur(serveur).membership)).toEqual(['e1'])
  })
})

describe('Réconciliation des fichiers orphelins', () => {
  it('archive sous verrou un entretien absent du membership', async () => {
    const { serveur, tx } = await banc()
    serveur.poser('entretiens/orphelin.json', entretienE1())

    await expect(tx.reconcilierFichiersOrphelins()).resolves.toEqual(['orphelin'])

    expect(serveur.contenuDe('entretiens/orphelin.json')).toBeUndefined()
    expect(serveur.contenuDe('corbeille/orphelin.json')).toBeDefined()
    expect(serveur.contenuDe('entretiens/e1.json')).toBeDefined()
  })
})

describe('Suppression d\u2019entretien — double verrou', () => {
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

  it('MOVE appliqué puis réponse perdue : confirme source et destination', async () => {
    const { serveur, miroir, store } = await banc()
    const clientReponsePerdue = new ClientWebDAV(
      { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
      async (entree, init) => {
        if (init?.method === 'MOVE' && String(entree).endsWith('/entretiens/e1.json')) {
          await serveur.fetch(entree as URL, init)
          throw new TypeError('réponse perdue')
        }
        return serveur.fetch(entree as URL, init)
      },
    )
    const txReponsePerdue = new TransactionsCorpus(
      clientReponsePerdue,
      miroir,
      () => store,
      IDENTITE_MAX,
    )

    await expect(txReponsePerdue.supprimerEntretien('e1')).resolves.toBeDefined()
    expect(corpusServeur(serveur).membership.e1).toBeUndefined()
    expect(serveur.contenuDe('entretiens/e1.json')).toBeUndefined()
    expect(serveur.contenuDe('corbeille/e1.json')).toBeDefined()
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

  it('échec de publication : restaure membership, entretien, sauvegarde et PNG locaux', async () => {
    const { serveur, miroir, store } = await banc()
    writeFileSync(join(miroir.dirLocal, 'entretiens', 'e1.json.bak1'), 'bak', 'utf8')
    mkdirSync(join(miroir.dirLocal, 'png'), { recursive: true })
    writeFileSync(join(miroir.dirLocal, 'png', 'e1.png'), 'png', 'utf8')
    const clientPanne = new ClientWebDAV(
      { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
      async (entree, init) => {
        if (init?.method === 'PUT' && String(entree).endsWith('/corpus.json')) {
          return new Response('panne', { status: 503 })
        }
        return serveur.fetch(entree as URL, init)
      },
    )
    const txPanne = new TransactionsCorpus(clientPanne, miroir, () => store, IDENTITE_MAX)

    await expect(txPanne.supprimerEntretien('e1')).rejects.toThrow(/erreur|réessayez/i)
    expect(store.ouvrir().membership.e1).toBeDefined()
    expect(existsSync(join(miroir.dirLocal, 'entretiens', 'e1.json'))).toBe(true)
    expect(readFileSync(join(miroir.dirLocal, 'entretiens', 'e1.json.bak1'), 'utf8')).toBe('bak')
    expect(readFileSync(join(miroir.dirLocal, 'png', 'e1.png'), 'utf8')).toBe('png')
    expect(corpusServeur(serveur).membership.e1).toBeDefined()
  })

  it('l\u2019ordre canonique tient : le verrou CORPUS est pris avant le verrou ENTRETIEN)', async () => {
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

/* ── Lot de valeurs — un verrou court PAR ENTRETIEN */

import { ErreurHttp } from '../../src/main/webdav/client'
import { poserValeurLotLocal, appliquerRegleLotLocal } from '../../src/main/distant/transactions'
import type { CibleRegleAnon } from '../../src/shared/format'
import type { ItemLotValeur } from '../../src/shared/format'

/** Deux items de lot : UNE valeur « Ville = Lyon » pour e1 et e2. */
function lotDeux(): ItemLotValeur[] {
  return [
    { entretienId: 'e1', cible: { type: 'entretien' }, idVar: 'var_ville', idMod: 'mod_lyon' },
    { entretienId: 'e2', cible: { type: 'entretien' }, idVar: 'var_ville', idMod: 'mod_lyon' },
  ]
}

describe('Lot de valeurs — distant (verrou court par entretien)', () => {
  it('lot de 2 libres → 2 succès, fichiers serveur ET miroir à jour, verrous libérés', async () => {
    const { serveur, miroir, tx } = await banc()
    serveur.poser('entretiens/e2.json', entretienE1())
    await miroir.tirer() // le second entretien rejoint le miroir

    const r = await tx.poserValeurLot(lotDeux())
    expect(r.succes.sort()).toEqual(['e1', 'e2'])
    expect(r.echecs).toEqual([])

    for (const id of ['e1', 'e2']) {
      // Le SERVEUR porte la valeur…
      const cote = JSON.parse(serveur.contenuDe(`entretiens/${id}.json`)!) as {
        meta: { valeursGen: Record<string, string> }
      }
      expect(cote.meta.valeursGen.var_ville).toBe('mod_lyon')
      // …et le MIROIR AUSSI (écriture through → prochain pull no-op).
      const local = JSON.parse(
        readFileSync(join(miroir.dirLocal, `entretiens/${id}.json`), 'utf8'),
      ) as { meta: { valeursGen: Record<string, string> } }
      expect(local.meta.valeursGen.var_ville).toBe('mod_lyon')
      // Le verrou court est LIBÉRÉ (un tiers peut prendre son tour).
      expect(serveur.contenuDe(`verrous/${id}.lock.json`)).toBeUndefined()
    }
  })

  it('lot à UN item de portée LOCUTEUR → serveur ET miroir à jour', async () => {
    const { serveur, miroir, tx } = await banc()
    // Un entretien AVEC un locuteur, posé sur le serveur APRÈS le tirage du miroir :
    // le GET frais post-verrou fait foi — la valeur partira du contenu SERVEUR,
    // pas de la copie miroir périmée.
    const avecLoc = JSON.parse(entretienE1()) as {
      locuteurs: { index: number; nom: string; valeursLoc: Record<string, string> }[]
    }
    avecLoc.locuteurs.push({ index: 0, nom: 'Marie', valeursLoc: {} })
    serveur.poser('entretiens/e1.json', JSON.stringify(avecLoc))

    const r = await tx.poserValeurLot([
      {
        entretienId: 'e1',
        cible: { type: 'locuteur', index: 0 },
        idVar: 'var_ville',
        idMod: 'mod_lyon',
      },
    ])
    expect(r.succes).toEqual(['e1'])
    expect(r.echecs).toEqual([])

    // La valeur est chez son PROPRIÉTAIRE (valeursLoc du locuteur), jamais dans valeursGen ;
    // serveur ET miroir à jour ; verrou libéré.
    const attendu = (json: string) => {
      const e = JSON.parse(json) as {
        meta: { valeursGen: Record<string, string> }
        locuteurs: { index: number; valeursLoc: Record<string, string> }[]
      }
      expect(e.locuteurs[0].valeursLoc.var_ville).toBe('mod_lyon')
      expect(e.meta.valeursGen.var_ville).toBeUndefined()
    }
    attendu(serveur.contenuDe('entretiens/e1.json')!)
    attendu(readFileSync(join(miroir.dirLocal, 'entretiens/e1.json'), 'utf8'))
    expect(serveur.contenuDe('verrous/e1.lock.json')).toBeUndefined()
  })

  it('un entretien tenu par autrui → échec NOMINATIF, l\u2019autre réussit quand même', async () => {
    const { serveur, clientOlivier, miroir, tx } = await banc()
    serveur.poser('entretiens/e2.json', entretienE1())
    await miroir.tirer()
    const pOlivier = new ProviderPutConditionnel(clientOlivier, IDENTITE_OLIVIER)
    await pOlivier.acquerir('verrous/e1.lock.json')

    const r = await tx.poserValeurLot(lotDeux())
    expect(r.succes).toEqual(['e2']) // l'échec ne bloque PAS le reste du lot
    expect(r.echecs).toHaveLength(1)
    expect(r.echecs[0].id).toBe('e1')
    expect(r.echecs[0].raison).toContain('olivier')

    // e2 est modifié côté serveur ; e1 est INTACT ; le verrou d'olivier tient.
    const e2 = JSON.parse(serveur.contenuDe('entretiens/e2.json')!) as {
      meta: { valeursGen: Record<string, string> }
    }
    expect(e2.meta.valeursGen.var_ville).toBe('mod_lyon')
    const e1 = JSON.parse(serveur.contenuDe('entretiens/e1.json')!) as {
      meta: { valeursGen: Record<string, string> }
    }
    expect(e1.meta.valeursGen.var_ville).toBeUndefined()
    expect(await pOlivier.etat('verrous/e1.lock.json')).not.toBeNull()
  })

  it('divergence 412 → échec « divergence », miroir NON modifié pour cet item, verrou libéré', async () => {
    const { serveur, clientMax, miroir, tx } = await banc()
    // Simulation déterministe :
    // notre PUT ENTRETIEN échoue en 412 (le serveur a changé sous nos pieds —
    // contournement du verrou). Les autres PUT (verrous…) passent normalement.
    const reel = clientMax.putTexte.bind(clientMax)
    clientMax.putTexte = async (chemin, contenu, options) => {
      if (chemin === 'entretiens/e1.json') throw new ErreurHttp(412, 'simulation divergence')
      return reel(chemin, contenu, options)
    }
    const miroirAvant = readFileSync(join(miroir.dirLocal, 'entretiens/e1.json'), 'utf8')

    const r = await tx.poserValeurLot([
      { entretienId: 'e1', cible: { type: 'entretien' }, idVar: 'var_ville', idMod: 'mod_lyon' },
    ])
    expect(r.succes).toEqual([])
    expect(r.echecs).toHaveLength(1)
    expect(r.echecs[0].raison).toMatch(/divergence/i)
    // Rien n'a été écrasé côté serveur ;
    // le MIROIR n'a pas bougé (il n'est écrit qu'après un PUT réussi) ;
    // le verrou est reparti (finally).
    const e1 = JSON.parse(serveur.contenuDe('entretiens/e1.json')!) as {
      meta: { valeursGen: Record<string, string> }
    }
    expect(e1.meta.valeursGen.var_ville).toBeUndefined()
    expect(readFileSync(join(miroir.dirLocal, 'entretiens/e1.json'), 'utf8')).toBe(miroirAvant)
    expect(serveur.contenuDe('verrous/e1.lock.json')).toBeUndefined()
  })

  it('réponse perdue après un PUT de valeur : réconcilie serveur et miroir', async () => {
    const { serveur, miroir, store } = await banc()
    const clientReponsePerdue = new ClientWebDAV(
      { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
      async (entree, init) => {
        if (init?.method === 'PUT' && String(entree).endsWith('/entretiens/e1.json')) {
          await serveur.fetch(entree as URL, init)
          throw new TypeError('réponse perdue')
        }
        return serveur.fetch(entree as URL, init)
      },
    )
    const txReponsePerdue = new TransactionsCorpus(
      clientReponsePerdue,
      miroir,
      () => store,
      IDENTITE_MAX,
    )

    const r = await txReponsePerdue.poserValeurLot([
      { entretienId: 'e1', cible: { type: 'entretien' }, idVar: 'var_ville', idMod: 'mod_lyon' },
    ])
    expect(r).toEqual({ succes: ['e1'], echecs: [] })
    const serveurJson = JSON.parse(serveur.contenuDe('entretiens/e1.json')!)
    const miroirJson = JSON.parse(readFileSync(join(miroir.dirLocal, 'entretiens/e1.json'), 'utf8'))
    expect(serveurJson.meta.valeursGen.var_ville).toBe('mod_lyon')
    expect(miroirJson.meta.valeursGen.var_ville).toBe('mod_lyon')
  })

  it('session à nous (défense en profondeur) : chemin store + noterSale, pas de verrou parallèle', async () => {
    const { serveur, clientMax, miroir, store, tx } = await banc()
    const tenus: string[] = []
    const sales: string[] = []
    const txSessions = new TransactionsCorpus(clientMax, miroir, () => store, IDENTITE_MAX, {
      getSessions: () => ({
        idsTenus: () => tenus,
        noterSale: (id) => sales.push(id),
      }),
    })
    void tx // la banc standard n'a pas de getSessions : on n'utilise qu'elle pour l'infra
    tenus.push('e1') // comme si l'entretien était OUVERT CHEZ NOUS

    const r = await txSessions.poserValeurLot([
      { entretienId: 'e1', cible: { type: 'entretien' }, idVar: 'var_ville', idMod: 'mod_lyon' },
    ])
    expect(r.succes).toEqual(['e1'])
    expect(sales).toEqual(['e1']) // la publication suivra la session existante
    // Chemin STORE : la copie locale (= miroir) porte la valeur…
    const local = JSON.parse(
      readFileSync(join(miroir.dirLocal, 'entretiens/e1.json'), 'utf8'),
    ) as { meta: { valeursGen: Record<string, string> } }
    expect(local.meta.valeursGen.var_ville).toBe('mod_lyon')
    // …mais RIEN n'est parti au serveur par le lot (la session publiera),
    // et aucun verrou d'entretien n'a été pris en parallèle.
    const e1 = JSON.parse(serveur.contenuDe('entretiens/e1.json')!) as {
      meta: { valeursGen: Record<string, string> }
    }
    expect(e1.meta.valeursGen.var_ville).toBeUndefined()
    expect(serveur.contenuDe('verrous/e1.lock.json')).toBeUndefined()
  })
})

/* ── Lot d'anonymisation en masse (verrou court par entretien) ───────────────*/

/** Un entretien dont le texte contient « Karine » deux fois. */
function entretienKarine(): string {
  return JSON.stringify({
    formatVersion: FORMAT_VERSION,
    lastModified: '2026-01-01T00:00:00Z',
    corpsTexte: {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { loc: null }, content: [{ type: 'text', text: 'Bonjour Karine ici.' }] },
        { type: 'paragraph', attrs: { loc: null }, content: [{ type: 'text', text: 'Et Karine encore.' }] },
      ],
    },
    annotations: [],
    ancres: [],
    locuteurs: [],
    brouillonsAnon: [],
    meta: { valeursGen: {}, audioRef: null },
  })
}

/** Banc standard + une règle corpus « Karine → Marie » + e2 posé sur serveur,
 *  miroir re-tiré (l'état que verrait le panneau Pseudos). */
async function bancAnon() {
  const b = await banc()
  const c = JSON.parse(b.serveur.contenuDe('corpus.json')!) as CorpusFichier
  c.reglesAnon['reg-1'] = { id: 'reg-1', entite: ['Karine'], pseudos: ['Marie'] }
  c.membership.e2 = { titre: 'Entretien deux', date: null, lastModified: '2026-01-01T00:00:00Z' }
  b.serveur.poser('corpus.json', JSON.stringify(c, null, 2))
  b.serveur.poser('entretiens/e2.json', entretienKarine())
  await b.miroir.tirer()
  return b
}

const LOT_ANON: CibleRegleAnon[] = [
  { entretienId: 'e1', regleId: 'reg-1' },
  { entretienId: 'e2', regleId: 'reg-1' },
]

describe("Lot d'anonymisation en masse — distant (verrou court par entretien)", () => {
  it('lot de 2 libres → occurrences posées côté serveur ET miroir, verrous libérés', async () => {
    // e1 (baseline) n'a pas de texte « Karine » → 0 occurrence mais succès ;
    // e2 en porte deux → les deux sont couvertes.
    const { serveur, miroir, tx } = await bancAnon()

    const r = await tx.appliquerRegleLot(LOT_ANON)
    expect(r.echecs).toEqual([])
    expect(r.succes.map((x) => [x.id, x.nb]).sort()).toEqual([
      ['e1', 0],
      ['e2', 2],
    ])

    const cote = JSON.parse(serveur.contenuDe('entretiens/e2.json')!) as {
      annotations: { type: string; pseudo?: string; regle?: string }[]
    }
    expect(cote.annotations.filter((a) => a.type === 'anon')).toHaveLength(2)
    expect(cote.annotations.every((a) => a.pseudo === 'Marie' && a.regle === 'reg-1')).toBe(true)
    const local = JSON.parse(
      readFileSync(join(miroir.dirLocal, 'entretiens/e2.json'), 'utf8'),
    ) as { annotations: unknown[] }
    expect(local.annotations).toHaveLength(2) // écriture THROUGH.
    expect(serveur.contenuDe('verrous/e2.lock.json')).toBeUndefined()
  })

  it("un entretien tenu par autrui → échec NOMINATIF, l'autre réussit", async () => {
    const { serveur, clientOlivier, tx } = await bancAnon()
    const pOlivier = new ProviderPutConditionnel(clientOlivier, IDENTITE_OLIVIER)
    await pOlivier.acquerir('verrous/e2.lock.json')

    const r = await tx.appliquerRegleLot(LOT_ANON)
    expect(r.succes.map((x) => x.id)).toEqual(['e1'])
    expect(r.echecs).toHaveLength(1)
    expect(r.echecs[0].id).toBe('e2')
    expect(r.echecs[0].raison).toContain('olivier')
    // e2 intact côté serveur ; le verrou d'olivier tient toujours.
    const e2 = JSON.parse(serveur.contenuDe('entretiens/e2.json')!) as { annotations: unknown[] }
    expect(e2.annotations).toHaveLength(0)
    expect(await pOlivier.etat('verrous/e2.lock.json')).not.toBeNull()
  })

  it('divergence 412 → échec « divergence », miroir NON modifié, verrou libéré', async () => {
    const { clientMax, miroir, tx } = await bancAnon()
    const reel = clientMax.putTexte.bind(clientMax)
    clientMax.putTexte = async (chemin, contenu, options) => {
      if (chemin === 'entretiens/e2.json') throw new ErreurHttp(412, 'simulation divergence')
      return reel(chemin, contenu, options)
    }
    const avant = readFileSync(join(miroir.dirLocal, 'entretiens/e2.json'), 'utf8')

    const r = await tx.appliquerRegleLot([{ entretienId: 'e2', regleId: 'reg-1' }])
    expect(r.succes).toEqual([])
    expect(r.echecs[0].raison).toMatch(/divergence/i)
    expect(readFileSync(join(miroir.dirLocal, 'entretiens/e2.json'), 'utf8')).toBe(avant)
  })

  it('session à nous : chemin store + noterSale, pas de verrou parallèle', async () => {
    const { serveur, clientMax, miroir, store, tx } = await bancAnon()
    const tenus: string[] = ['e2']
    const sales: string[] = []
    const txSessions = new TransactionsCorpus(clientMax, miroir, () => store, IDENTITE_MAX, {
      getSessions: () => ({ idsTenus: () => tenus, noterSale: (id) => sales.push(id) }),
    })

    const r = await txSessions.appliquerRegleLot([{ entretienId: 'e2', regleId: 'reg-1' }])
    expect(r.succes.map((x) => [x.id, x.nb])).toEqual([['e2', 2]])
    expect(sales).toEqual(['e2']) // la publication suivra la session existante.
    // Chemin STORE : le fichier local porte les annotations…
    const local = JSON.parse(readFileSync(join(miroir.dirLocal, 'entretiens/e2.json'), 'utf8')) as {
      annotations: unknown[]
    }
    expect(local.annotations).toHaveLength(2)
    // …mais RIEN n'est parti au serveur par le lot, aucun verrou parallèle.
    const e2 = JSON.parse(serveur.contenuDe('entretiens/e2.json')!) as { annotations: unknown[] }
    expect(e2.annotations).toHaveLength(0)
    expect(serveur.contenuDe('verrous/e2.lock.json')).toBeUndefined()
  })
})

describe('Correction courte d’un entretien distant', () => {
  function avecLocuteur(pseudo?: string): string {
    const data = JSON.parse(entretienE1()) as EntretienFichier
    data.locuteurs = [{
      id: 'loc-1', index: 0, nom: 'Marie locale', interviewer: false,
      valeursLoc: {}, personneRef: null, ...(pseudo ? { pseudo } : {}),
    }]
    return JSON.stringify(data, null, 2)
  }

  function entretienAvecLocuteur(
    id: string,
    nom: string,
    personneRef: string | null = null,
  ): string {
    const data = JSON.parse(entretienE1()) as EntretienFichier
    data.locuteurs = [{
      id, index: 0, nom, interviewer: false, valeursLoc: {}, personneRef,
    }]
    return JSON.stringify(data, null, 2)
  }

  async function installerSource(b: Banc, contenu: string): Promise<void> {
    const corpus = corpusServeur(b.serveur)
    corpus.membership.e2 = {
      titre: 'Entretien deux', date: null, lastModified: '2026-01-01T00:00:00Z',
    }
    b.serveur.poser('corpus.json', JSON.stringify(corpus, null, 2))
    b.serveur.poser('entretiens/e2.json', contenu)
    await b.miroir.tirer()
  }

  async function creerPersonne(b: Banc): Promise<string> {
    const id = await b.tx.executer(() => b.store.personnesCommander({ type: 'creerDefinition', nom: 'Marie Dupont' }))
    if (!id) throw new Error('Personne non créée dans le banc.')
    return id
  }

  it('GET frais puis PUT conditionnel conserve les modifications extérieures', async () => {
    const b = await banc()
    const personneId = await creerPersonne(b)
    b.serveur.poser('entretiens/e1.json', avecLocuteur('Pseudo extérieur'))

    await b.tx.executerEntretien('e1', () => b.store.personnesCommander({
      type: 'lier', entretienId: 'e1', locuteurId: 'loc-1', personneId,
    }))

    const serveur = JSON.parse(b.serveur.contenuDe('entretiens/e1.json')!) as EntretienFichier
    expect(serveur.locuteurs[0]).toMatchObject({ personneRef: personneId, pseudo: 'Pseudo extérieur' })
    const miroir = JSON.parse(readFileSync(join(b.miroir.dirLocal, 'entretiens/e1.json'), 'utf8')) as EntretienFichier
    expect(miroir.locuteurs[0]).toMatchObject({ personneRef: personneId, pseudo: 'Pseudo extérieur' })
    expect(b.store.lectureSeule).toBe(true)
    expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBeUndefined()
    expect(b.serveur.contenuDe('verrous/e1.lock.json')).toBeUndefined()
  })

  it('refuse depuis une source fraîche maintenue sous verrou', async () => {
    const b = await banc()
    b.serveur.poser('entretiens/e1.json', entretienAvecLocuteur('loc-cible', 'Interviewer'))
    await installerSource(b, entretienAvecLocuteur('loc-source', 'Intervieweur'))

    const corpus = corpusServeur(b.serveur)
    corpus.personnes['pers-source'] = { id: 'pers-source', nom: 'Camille Martin' }
    b.serveur.poser('corpus.json', JSON.stringify(corpus, null, 2))
    b.serveur.poser(
      'entretiens/e2.json',
      entretienAvecLocuteur('loc-source', 'Intervieweur', 'pers-source'),
    )

    await b.tx.executerEntretienAvecSource('e1', 'e2', () => b.store.refuserRapprochementSimple({
      type: 'refuser',
      entretienId: 'e1',
      locuteurId: 'loc-cible',
      sourceEntretienId: 'e2',
      sourceLocuteurId: 'loc-source',
    }))

    const cible = JSON.parse(b.serveur.contenuDe('entretiens/e1.json')!) as EntretienFichier
    expect(cible.locuteurs[0].rapprochementsRefuses).toEqual(['personne:pers-source'])
    const sourceLocale = JSON.parse(
      readFileSync(join(b.miroir.dirLocal, 'entretiens/e2.json'), 'utf8'),
    ) as EntretienFichier
    expect(sourceLocale.locuteurs[0].personneRef).toBe('pers-source')
    expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBeUndefined()
    expect(b.serveur.contenuDe('verrous/e1.lock.json')).toBeUndefined()
    expect(b.serveur.contenuDe('verrous/e2.lock.json')).toBeUndefined()
  })

  it('libère les premiers verrous si la source est tenue par un tiers', async () => {
    const b = await banc()
    b.serveur.poser('entretiens/e1.json', entretienAvecLocuteur('loc-cible', 'Interviewer'))
    await installerSource(b, entretienAvecLocuteur('loc-source', 'Intervieweur'))
    const olivier = new ProviderPutConditionnel(b.clientOlivier, IDENTITE_OLIVIER)
    await olivier.acquerir('verrous/e2.lock.json')

    await expect(b.tx.executerEntretienAvecSource('e1', 'e2', () =>
      b.store.refuserRapprochementSimple({
        type: 'refuser',
        entretienId: 'e1',
        locuteurId: 'loc-cible',
        sourceEntretienId: 'e2',
        sourceLocuteurId: 'loc-source',
      }))).rejects.toThrow(/olivier/)

    const cible = JSON.parse(b.serveur.contenuDe('entretiens/e1.json')!) as EntretienFichier
    expect(cible.locuteurs[0].rapprochementsRefuses).toBeUndefined()
    expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBeUndefined()
    expect(b.serveur.contenuDe('verrous/e1.lock.json')).toBeUndefined()
    expect(await olivier.etat('verrous/e2.lock.json')).not.toBeNull()
  })

  it('crée une Personne distincte avec son lien et son refus', async () => {
    const b = await banc()
    b.serveur.poser('entretiens/e1.json', entretienAvecLocuteur('loc-cible', 'Marie Dupont'))
    await installerSource(b, entretienAvecLocuteur('loc-source', 'Maria Dupont'))

    const personneId = await b.tx.refuserRapprochement({
      type: 'refuser',
      entretienId: 'e1',
      locuteurId: 'loc-cible',
      sourceEntretienId: 'e2',
      sourceLocuteurId: 'loc-source',
    })

    expect(personneId).toMatch(/^pers/)
    expect(corpusServeur(b.serveur).personnes[personneId!]).toMatchObject({
      id: personneId, nom: 'Marie Dupont',
    })
    const cible = JSON.parse(b.serveur.contenuDe('entretiens/e1.json')!) as EntretienFichier
    expect(cible.locuteurs[0]).toMatchObject({
      personneRef: personneId,
      rapprochementsRefuses: ['locuteur:loc-source'],
    })
  })

  it('conserve la Personne distincte si la publication du refus échoue', async () => {
    const b = await banc()
    b.serveur.poser('entretiens/e1.json', entretienAvecLocuteur('loc-cible', 'Marie Dupont'))
    await installerSource(b, entretienAvecLocuteur('loc-source', 'Maria Dupont'))
    const reel = b.clientMax.putTexte.bind(b.clientMax)
    b.clientMax.putTexte = async (chemin, contenu, options) => {
      if (chemin === 'entretiens/e1.json') throw new ErreurHttp(412, 'simulation divergence')
      return reel(chemin, contenu, options)
    }

    await expect(b.tx.refuserRapprochement({
      type: 'refuser',
      entretienId: 'e1',
      locuteurId: 'loc-cible',
      sourceEntretienId: 'e2',
      sourceLocuteurId: 'loc-source',
    })).rejects.toThrow(/appliquée partiellement.*définition.*e1.*Actualisez/i)

    expect(Object.values(corpusServeur(b.serveur).personnes)).toEqual([
      expect.objectContaining({ nom: 'Marie Dupont' }),
    ])
    const cible = JSON.parse(b.serveur.contenuDe('entretiens/e1.json')!) as EntretienFichier
    expect(cible.locuteurs[0].personneRef).toBeNull()
    expect(cible.locuteurs[0].rapprochementsRefuses).toBeUndefined()
  })

  it('refuse sans écriture une décision qui devrait aussi créer une personne', async () => {
    const b = await banc()
    b.serveur.poser('entretiens/e1.json', entretienAvecLocuteur('loc-cible', 'Marie Dupont'))
    await installerSource(b, entretienAvecLocuteur('loc-source', 'Maria Dupont'))

    await expect(b.tx.executerEntretienAvecSource('e1', 'e2', () =>
      b.store.refuserRapprochementSimple({
        type: 'refuser',
        entretienId: 'e1',
        locuteurId: 'loc-cible',
        sourceEntretienId: 'e2',
        sourceLocuteurId: 'loc-source',
      }))).rejects.toThrow(/créer une personne distincte.*composite/i)

    expect(corpusServeur(b.serveur).personnes).toEqual({})
    const cible = JSON.parse(b.serveur.contenuDe('entretiens/e1.json')!) as EntretienFichier
    expect(cible.locuteurs[0]).toMatchObject({ personneRef: null })
    expect(cible.locuteurs[0].rapprochementsRefuses).toBeUndefined()
  })

  it('rapproche vers une Personne existante avec les données fraîches de la source', async () => {
    const b = await banc()
    b.serveur.poser('entretiens/e1.json', entretienAvecLocuteur('loc-cible', 'Marie Dupont'))
    await installerSource(b, entretienAvecLocuteur('loc-source', 'Mme Dupont'))
    const corpus = corpusServeur(b.serveur)
    corpus.personnes['pers-source'] = { id: 'pers-source', nom: 'Marie Dupont' }
    b.serveur.poser('corpus.json', JSON.stringify(corpus, null, 2))
    const source = JSON.parse(
      entretienAvecLocuteur('loc-source', 'Mme Dupont', 'pers-source'),
    ) as EntretienFichier
    source.locuteurs[0].pseudo = 'Pseudo frais'
    b.serveur.poser('entretiens/e2.json', JSON.stringify(source, null, 2))

    const personneId = await b.tx.rapprocherPersonnes({
      type: 'rapprocher',
      entretienId: 'e1',
      locuteurId: 'loc-cible',
      sourceEntretienId: 'e2',
      sourceLocuteurId: 'loc-source',
      reprise: { pseudo: true, variables: [] },
    })

    expect(personneId).toBe('pers-source')
    const cible = JSON.parse(b.serveur.contenuDe('entretiens/e1.json')!) as EntretienFichier
    expect(cible.locuteurs[0]).toMatchObject({
      personneRef: 'pers-source', pseudo: 'Pseudo frais', pseudoEtat: 'confirme',
    })
    const sourceServeur = JSON.parse(b.serveur.contenuDe('entretiens/e2.json')!) as EntretienFichier
    expect(sourceServeur.locuteurs[0]).toMatchObject({
      personneRef: 'pers-source', pseudo: 'Pseudo frais',
    })
  })

  it('refuse un aperçu de rapprochement devenu périmé', async () => {
    const b = await banc()
    b.serveur.poser('entretiens/e1.json', entretienAvecLocuteur('loc-cible', 'Marie Dupont'))
    await installerSource(b, entretienAvecLocuteur('loc-source', 'Mme Dupont'))
    const corpus = corpusServeur(b.serveur)
    corpus.personnes['pers-source'] = { id: 'pers-source', nom: 'Marie Dupont' }
    b.serveur.poser('corpus.json', JSON.stringify(corpus, null, 2))
    b.serveur.poser(
      'entretiens/e2.json',
      entretienAvecLocuteur('loc-source', 'Mme Dupont', 'pers-source'),
    )
    await b.miroir.tirer()
    const attendu = JSON.stringify(b.store.personnesInventaire())
    const sourceModifiee = JSON.parse(
      entretienAvecLocuteur('loc-source', 'Mme Dupont', 'pers-source'),
    ) as EntretienFichier
    sourceModifiee.locuteurs[0].pseudo = 'Modification extérieure'
    b.serveur.poser('entretiens/e2.json', JSON.stringify(sourceModifiee, null, 2))

    await expect(b.tx.rapprocherPersonnes({
      type: 'rapprocher',
      entretienId: 'e1',
      locuteurId: 'loc-cible',
      sourceEntretienId: 'e2',
      sourceLocuteurId: 'loc-source',
      attendu,
    })).rejects.toThrow(/données ont changé/i)

    const cible = JSON.parse(b.serveur.contenuDe('entretiens/e1.json')!) as EntretienFichier
    expect(cible.locuteurs[0].personneRef).toBeNull()
  })

  it('crée une Personne et lie deux locuteurs non associés', async () => {
    const b = await banc()
    b.serveur.poser('entretiens/e1.json', entretienAvecLocuteur('loc-cible', 'Marie Dupont'))
    const source = JSON.parse(entretienAvecLocuteur('loc-source', 'Mme Dupont')) as EntretienFichier
    source.locuteurs[0].pseudo = 'Marie D.'
    await installerSource(b, JSON.stringify(source, null, 2))

    const personneId = await b.tx.rapprocherPersonnes({
      type: 'rapprocher',
      entretienId: 'e1',
      locuteurId: 'loc-cible',
      sourceEntretienId: 'e2',
      sourceLocuteurId: 'loc-source',
      reprise: { pseudo: true, variables: [] },
    })

    expect(personneId).toMatch(/^pers/)
    expect(corpusServeur(b.serveur).personnes[personneId!]).toMatchObject({
      id: personneId, nom: 'Mme Dupont',
    })
    const cible = JSON.parse(b.serveur.contenuDe('entretiens/e1.json')!) as EntretienFichier
    const sourceFinale = JSON.parse(b.serveur.contenuDe('entretiens/e2.json')!) as EntretienFichier
    expect(cible.locuteurs[0]).toMatchObject({
      personneRef: personneId, pseudo: 'Marie D.', pseudoEtat: 'confirme',
    })
    expect(sourceFinale.locuteurs[0].personneRef).toBe(personneId)
  })

  it('conserve la définition et le lien source après un échec du lien cible', async () => {
    const b = await banc()
    b.serveur.poser('entretiens/e1.json', entretienAvecLocuteur('loc-cible', 'Marie Dupont'))
    await installerSource(b, entretienAvecLocuteur('loc-source', 'Mme Dupont'))
    const reel = b.clientMax.putTexte.bind(b.clientMax)
    b.clientMax.putTexte = async (chemin, contenu, options) => {
      if (chemin === 'entretiens/e1.json') throw new ErreurHttp(412, 'simulation divergence')
      return reel(chemin, contenu, options)
    }

    await expect(b.tx.rapprocherPersonnes({
      type: 'rapprocher',
      entretienId: 'e1',
      locuteurId: 'loc-cible',
      sourceEntretienId: 'e2',
      sourceLocuteurId: 'loc-source',
    })).rejects.toThrow(/appliquée partiellement.*définition.*e2.*e1.*Actualisez/i)

    const personnes = Object.values(corpusServeur(b.serveur).personnes)
    expect(personnes).toHaveLength(1)
    const personneId = personnes[0].id
    const cible = JSON.parse(b.serveur.contenuDe('entretiens/e1.json')!) as EntretienFichier
    const sourceFinale = JSON.parse(b.serveur.contenuDe('entretiens/e2.json')!) as EntretienFichier
    expect(cible.locuteurs[0].personneRef).toBeNull()
    expect(sourceFinale.locuteurs[0].personneRef).toBe(personneId)
  })

  it('conserve seulement la définition après un échec du premier lien', async () => {
    const b = await banc()
    b.serveur.poser('entretiens/e1.json', entretienAvecLocuteur('loc-cible', 'Marie Dupont'))
    await installerSource(b, entretienAvecLocuteur('loc-source', 'Mme Dupont'))
    const reel = b.clientMax.putTexte.bind(b.clientMax)
    b.clientMax.putTexte = async (chemin, contenu, options) => {
      if (chemin === 'entretiens/e2.json') throw new ErreurHttp(412, 'simulation divergence')
      return reel(chemin, contenu, options)
    }

    await expect(b.tx.rapprocherPersonnes({
      type: 'rapprocher',
      entretienId: 'e1',
      locuteurId: 'loc-cible',
      sourceEntretienId: 'e2',
      sourceLocuteurId: 'loc-source',
    })).rejects.toThrow(/appliquée partiellement.*définition.*e2.*Actualisez/i)

    expect(Object.values(corpusServeur(b.serveur).personnes)).toHaveLength(1)
    for (const id of ['e1', 'e2']) {
      const entretien = JSON.parse(b.serveur.contenuDe(`entretiens/${id}.json`)!) as EntretienFichier
      expect(entretien.locuteurs[0].personneRef).toBeNull()
    }
  })

  it('refuse sans écriture un rapprochement qui devrait créer une Personne', async () => {
    const b = await banc()
    b.serveur.poser('entretiens/e1.json', entretienAvecLocuteur('loc-cible', 'Marie Dupont'))
    await installerSource(b, entretienAvecLocuteur('loc-source', 'Mme Dupont'))

    await expect(b.tx.executerEntretienAvecSource(
      'e1',
      'e2',
      () => b.store.rapprocherPersonneSimple({
        type: 'rapprocher',
        entretienId: 'e1',
        locuteurId: 'loc-cible',
        sourceEntretienId: 'e2',
        sourceLocuteurId: 'loc-source',
      }),
    )).rejects.toThrow(/plusieurs associations.*composite/i)

    expect(corpusServeur(b.serveur).personnes).toEqual({})
    for (const id of ['e1', 'e2']) {
      const entretien = JSON.parse(b.serveur.contenuDe(`entretiens/${id}.json`)!) as EntretienFichier
      expect(entretien.locuteurs[0].personneRef).toBeNull()
    }
  })

  it('réunit les entretiens avant de retirer la définition absorbée', async () => {
    const b = await banc()
    b.serveur.poser('entretiens/e1.json', entretienAvecLocuteur('loc-1', 'Marie', 'p1'))
    await installerSource(b, entretienAvecLocuteur('loc-2', 'Mme Dupont', 'p2'))
    const corpus = corpusServeur(b.serveur)
    corpus.personnes.p1 = { id: 'p1', nom: 'Marie Dupont' }
    corpus.personnes.p2 = { id: 'p2', nom: 'Mme Dupont' }
    b.serveur.poser('corpus.json', JSON.stringify(corpus, null, 2))
    await b.miroir.tirer()
    const ordre: string[] = []
    const reel = b.clientMax.putTexte.bind(b.clientMax)
    b.clientMax.putTexte = async (chemin, contenu, options) => {
      if (chemin === 'corpus.json' || chemin.startsWith('entretiens/')) ordre.push(chemin)
      return reel(chemin, contenu, options)
    }

    await expect(b.tx.fusionnerPersonnes({
      type: 'fusionner',
      conserverId: 'p1',
      absorberId: 'p2',
      attendu: JSON.stringify(b.store.personnesInventaire()),
    })).resolves.toBe('p1')

    expect(corpusServeur(b.serveur).personnes).toEqual({
      p1: { id: 'p1', nom: 'Marie Dupont' },
    })
    const entretien2 = JSON.parse(b.serveur.contenuDe('entretiens/e2.json')!) as EntretienFichier
    expect(entretien2.locuteurs[0].personneRef).toBe('p1')
    expect(ordre.indexOf('entretiens/e2.json')).toBeLessThan(ordre.indexOf('corpus.json'))
  })

  it('publie une session déjà tenue avant de terminer une réunion', async () => {
    const b = await banc()
    b.serveur.poser('entretiens/e1.json', entretienAvecLocuteur('loc-1', 'Marie', 'p1'))
    await installerSource(b, entretienAvecLocuteur('loc-2', 'Mme Dupont', 'p2'))
    const corpus = corpusServeur(b.serveur)
    corpus.personnes.p1 = { id: 'p1', nom: 'Marie Dupont' }
    corpus.personnes.p2 = { id: 'p2', nom: 'Mme Dupont' }
    b.serveur.poser('corpus.json', JSON.stringify(corpus, null, 2))
    await b.miroir.tirer()
    const ordre: string[] = []
    const txSession = new TransactionsCorpus(b.clientMax, b.miroir, () => b.store, IDENTITE_MAX, {
      getSessions: () => ({
        idsTenus: () => ['e2'],
        noterSale: () => ordre.push('session-sale'),
        publier: async () => {
          ordre.push('session-publiee')
          const contenu = readFileSync(join(b.miroir.dirLocal, 'entretiens/e2.json'), 'utf8')
          await b.clientMax.putTexte('entretiens/e2.json', contenu)
          return { ok: true }
        },
      }),
    })
    const reel = b.clientMax.putTexte.bind(b.clientMax)
    b.clientMax.putTexte = async (chemin, contenu, options) => {
      if (chemin === 'corpus.json') ordre.push('corpus')
      return reel(chemin, contenu, options)
    }

    await txSession.fusionnerPersonnes({
      type: 'fusionner',
      conserverId: 'p1',
      absorberId: 'p2',
      attendu: JSON.stringify(b.store.personnesInventaire()),
    })

    expect(ordre).toEqual(['session-sale', 'session-publiee', 'corpus'])
    expect(corpusServeur(b.serveur).personnes.p2).toBeUndefined()
    expect((JSON.parse(b.serveur.contenuDe('entretiens/e2.json')!) as EntretienFichier)
      .locuteurs[0].personneRef).toBe('p1')
  })

  it('conserve les deux définitions et reprend une réunion partielle', async () => {
    const b = await banc()
    b.serveur.poser('entretiens/e1.json', entretienAvecLocuteur('loc-1', 'Marie A', 'p2'))
    await installerSource(b, entretienAvecLocuteur('loc-2', 'Marie B', 'p2'))
    const corpus = corpusServeur(b.serveur)
    corpus.personnes.p1 = { id: 'p1', nom: 'Marie Dupont' }
    corpus.personnes.p2 = { id: 'p2', nom: 'Mme Dupont' }
    corpus.membership.e3 = {
      titre: 'Entretien trois', date: null, lastModified: '2026-01-01T00:00:00Z',
    }
    b.serveur.poser('corpus.json', JSON.stringify(corpus, null, 2))
    b.serveur.poser('entretiens/e3.json', entretienAvecLocuteur('loc-3', 'Marie C', 'p1'))
    await b.miroir.tirer()
    const reel = b.clientMax.putTexte.bind(b.clientMax)
    b.clientMax.putTexte = async (chemin, contenu, options) => {
      if (chemin === 'entretiens/e2.json') throw new ErreurHttp(412, 'simulation divergence')
      return reel(chemin, contenu, options)
    }

    await expect(b.tx.fusionnerPersonnes({
      type: 'fusionner',
      conserverId: 'p1',
      absorberId: 'p2',
      attendu: JSON.stringify(b.store.personnesInventaire()),
    })).rejects.toThrow(/partiellement.*e1.*e2.*Actualisez/i)

    expect(Object.keys(corpusServeur(b.serveur).personnes)).toEqual(['p1', 'p2'])
    expect((JSON.parse(b.serveur.contenuDe('entretiens/e1.json')!) as EntretienFichier)
      .locuteurs[0].personneRef).toBe('p1')
    expect((JSON.parse(b.serveur.contenuDe('entretiens/e2.json')!) as EntretienFichier)
      .locuteurs[0].personneRef).toBe('p2')

    b.clientMax.putTexte = reel
    await expect(b.tx.fusionnerPersonnes({
      type: 'fusionner',
      conserverId: 'p1',
      absorberId: 'p2',
      attendu: JSON.stringify(b.store.personnesInventaire()),
    })).resolves.toBe('p1')
    expect(Object.keys(corpusServeur(b.serveur).personnes)).toEqual(['p1'])
    expect((JSON.parse(b.serveur.contenuDe('entretiens/e2.json')!) as EntretienFichier)
      .locuteurs[0].personneRef).toBe('p1')
  })

  it('crée la définition séparée avant de déplacer ses locuteurs', async () => {
    const b = await banc()
    b.serveur.poser('entretiens/e1.json', entretienAvecLocuteur('loc-1', 'Marie', 'p1'))
    await installerSource(b, entretienAvecLocuteur('loc-2', 'Mme Dupont', 'p1'))
    const corpus = corpusServeur(b.serveur)
    corpus.personnes.p1 = { id: 'p1', nom: 'Marie Dupont' }
    b.serveur.poser('corpus.json', JSON.stringify(corpus, null, 2))
    await b.miroir.tirer()
    const attendu = JSON.stringify(b.store.personnesInventaire())
    const ordre: string[] = []
    const reel = b.clientMax.putTexte.bind(b.clientMax)
    b.clientMax.putTexte = async (chemin, contenu, options) => {
      if (chemin === 'corpus.json' || chemin.startsWith('entretiens/')) ordre.push(chemin)
      return reel(chemin, contenu, options)
    }

    const nouvelleId = await b.tx.separerPersonne({
      type: 'separer',
      personneId: 'p1',
      nom: 'Marie entretien 2',
      locuteurs: [{ entretienId: 'e2', locuteurId: 'loc-2' }],
      attendu,
    })

    expect(nouvelleId).toMatch(/^pers/)
    expect(corpusServeur(b.serveur).personnes[nouvelleId!]).toMatchObject({
      id: nouvelleId, nom: 'Marie entretien 2',
    })
    const entretien1 = JSON.parse(b.serveur.contenuDe('entretiens/e1.json')!) as EntretienFichier
    const entretien2 = JSON.parse(b.serveur.contenuDe('entretiens/e2.json')!) as EntretienFichier
    expect(entretien1.locuteurs[0].personneRef).toBe('p1')
    expect(entretien2.locuteurs[0].personneRef).toBe(nouvelleId)
    expect(ordre.indexOf('corpus.json')).toBeLessThan(ordre.indexOf('entretiens/e2.json'))
  })

  it('conserve la nouvelle définition si un déplacement de séparation échoue', async () => {
    const b = await banc()
    b.serveur.poser('entretiens/e1.json', entretienAvecLocuteur('loc-1', 'Marie', 'p1'))
    await installerSource(b, entretienAvecLocuteur('loc-2', 'Mme Dupont', 'p1'))
    const corpus = corpusServeur(b.serveur)
    corpus.personnes.p1 = { id: 'p1', nom: 'Marie Dupont' }
    b.serveur.poser('corpus.json', JSON.stringify(corpus, null, 2))
    await b.miroir.tirer()
    const attendu = JSON.stringify(b.store.personnesInventaire())
    const reel = b.clientMax.putTexte.bind(b.clientMax)
    b.clientMax.putTexte = async (chemin, contenu, options) => {
      if (chemin === 'entretiens/e2.json') throw new ErreurHttp(412, 'simulation divergence')
      return reel(chemin, contenu, options)
    }

    await expect(b.tx.separerPersonne({
      type: 'separer',
      personneId: 'p1',
      nom: 'Marie entretien 2',
      locuteurs: [{ entretienId: 'e2', locuteurId: 'loc-2' }],
      attendu,
    })).rejects.toThrow(/partiellement.*définitions.*e2.*Actualisez/i)

    expect(Object.values(corpusServeur(b.serveur).personnes)).toEqual([
      { id: 'p1', nom: 'Marie Dupont' },
      expect.objectContaining({ nom: 'Marie entretien 2' }),
    ])
    const entretien2 = JSON.parse(b.serveur.contenuDe('entretiens/e2.json')!) as EntretienFichier
    expect(entretien2.locuteurs[0].personneRef).toBe('p1')
  })

  it('supprime une Personne après contrôle frais de tous les entretiens', async () => {
    const b = await banc()
    const personneId = await creerPersonne(b)

    await expect(b.tx.supprimerPersonneVide(personneId)).resolves.toBeNull()

    expect(corpusServeur(b.serveur).personnes[personneId]).toBeUndefined()
    expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBeUndefined()
    expect(b.serveur.contenuDe('verrous/e1.lock.json')).toBeUndefined()
  })

  it('conserve une Personne qu’un entretien frais référence encore', async () => {
    const b = await banc()
    const personneId = await creerPersonne(b)
    b.serveur.poser(
      'entretiens/e1.json',
      entretienAvecLocuteur('loc-cible', 'Marie Dupont', personneId),
    )

    await expect(b.tx.supprimerPersonneVide(personneId)).rejects.toThrow(/Déliez/)

    expect(corpusServeur(b.serveur).personnes[personneId]).toBeDefined()
    const miroir = JSON.parse(
      readFileSync(join(b.miroir.dirLocal, 'entretiens/e1.json'), 'utf8'),
    ) as EntretienFichier
    expect(miroir.locuteurs[0].personneRef).toBe(personneId)
  })

  it('ne supprime rien si un entretien de contrôle est verrouillé par un tiers', async () => {
    const b = await banc()
    const personneId = await creerPersonne(b)
    const olivier = new ProviderPutConditionnel(b.clientOlivier, IDENTITE_OLIVIER)
    await olivier.acquerir('verrous/e1.lock.json')

    await expect(b.tx.supprimerPersonneVide(personneId)).rejects.toThrow(/olivier/)

    expect(corpusServeur(b.serveur).personnes[personneId]).toBeDefined()
    expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBeUndefined()
    expect(await olivier.etat('verrous/e1.lock.json')).not.toBeNull()
  })

  it('crée une définition puis son premier lien', async () => {
    const b = await banc()
    b.serveur.poser('entretiens/e1.json', avecLocuteur())

    const personneId = await b.tx.creerPersonneDepuisLocuteur('e1', 'loc-1', 'Marie Dupont')

    expect(corpusServeur(b.serveur).personnes[personneId]).toMatchObject({
      id: personneId, nom: 'Marie Dupont',
    })
    const entretien = JSON.parse(b.serveur.contenuDe('entretiens/e1.json')!) as EntretienFichier
    expect(entretien.locuteurs[0].personneRef).toBe(personneId)
  })

  it('conserve la fiche vide et explique un échec du premier lien', async () => {
    const b = await banc()
    b.serveur.poser('entretiens/e1.json', avecLocuteur())
    const olivier = new ProviderPutConditionnel(b.clientOlivier, IDENTITE_OLIVIER)
    await olivier.acquerir('verrous/e1.lock.json')

    await expect(b.tx.creerPersonneDepuisLocuteur('e1', 'loc-1', 'Marie Dupont'))
      .rejects.toThrow(/personne a été créée.*lien a échoué.*olivier/i)

    expect(Object.values(corpusServeur(b.serveur).personnes)).toEqual([
      expect.objectContaining({ nom: 'Marie Dupont' }),
    ])
    const entretien = JSON.parse(b.serveur.contenuDe('entretiens/e1.json')!) as EntretienFichier
    expect(entretien.locuteurs[0].personneRef).toBeNull()
    expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBeUndefined()
  })

  it('un verrou tiers refuse nominativement la correction et libère le verrou corpus', async () => {
    const b = await banc()
    const personneId = await creerPersonne(b)
    b.serveur.poser('entretiens/e1.json', avecLocuteur())
    const olivier = new ProviderPutConditionnel(b.clientOlivier, IDENTITE_OLIVIER)
    await olivier.acquerir('verrous/e1.lock.json')

    await expect(b.tx.executerEntretien('e1', () => b.store.personnesCommander({
      type: 'lier', entretienId: 'e1', locuteurId: 'loc-1', personneId,
    }))).rejects.toThrow(/olivier/)

    expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBeUndefined()
    expect(await olivier.etat('verrous/e1.lock.json')).not.toBeNull()
  })

  it('une divergence ne laisse ni lien local anticipé ni verrou', async () => {
    const b = await banc()
    const personneId = await creerPersonne(b)
    b.serveur.poser('entretiens/e1.json', avecLocuteur())
    const reel = b.clientMax.putTexte.bind(b.clientMax)
    b.clientMax.putTexte = async (chemin, contenu, options) => {
      if (chemin === 'entretiens/e1.json') throw new ErreurHttp(412, 'simulation divergence')
      return reel(chemin, contenu, options)
    }

    await expect(b.tx.executerEntretien('e1', () => b.store.personnesCommander({
      type: 'lier', entretienId: 'e1', locuteurId: 'loc-1', personneId,
    }))).rejects.toThrow(/divergence/i)

    const serveur = JSON.parse(b.serveur.contenuDe('entretiens/e1.json')!) as EntretienFichier
    const miroir = JSON.parse(readFileSync(join(b.miroir.dirLocal, 'entretiens/e1.json'), 'utf8')) as EntretienFichier
    expect(serveur.locuteurs[0].personneRef).toBeNull()
    expect(miroir.locuteurs[0].personneRef).toBeNull()
    expect(b.serveur.contenuDe('verrous/corpus.lock.json')).toBeUndefined()
    expect(b.serveur.contenuDe('verrous/e1.lock.json')).toBeUndefined()
  })

  it('une session déjà tenue réutilise le store et diffère sa publication', async () => {
    const b = await banc()
    const personneId = await creerPersonne(b)
    const contenu = avecLocuteur()
    b.serveur.poser('entretiens/e1.json', contenu)
    writeFileSync(join(b.miroir.dirLocal, 'entretiens/e1.json'), contenu, 'utf8')
    const sales: string[] = []
    const txSession = new TransactionsCorpus(b.clientMax, b.miroir, () => b.store, IDENTITE_MAX, {
      getSessions: () => ({ idsTenus: () => ['e1'], noterSale: (id) => sales.push(id) }),
    })

    await txSession.executerEntretien('e1', () => b.store.personnesCommander({
      type: 'lier', entretienId: 'e1', locuteurId: 'loc-1', personneId,
    }))

    const serveur = JSON.parse(b.serveur.contenuDe('entretiens/e1.json')!) as EntretienFichier
    const miroir = JSON.parse(readFileSync(join(b.miroir.dirLocal, 'entretiens/e1.json'), 'utf8')) as EntretienFichier
    expect(serveur.locuteurs[0].personneRef).toBeNull()
    expect(miroir.locuteurs[0].personneRef).toBe(personneId)
    expect(sales).toEqual(['e1'])
    expect(b.serveur.contenuDe('verrous/e1.lock.json')).toBeUndefined()
  })
})

describe("Lot d'anonymisation en masse — corpus LOCAL (boucle directe du store)", () => {
  it('occurrences posées ; doublons dédupliqués ; rien à traiter → succès à 0', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-anon-local-'))
    const store = new CorpusStore(dir)
    const corpus = store.ouvrir()
    corpus.reglesAnon['reg-1'] = { id: 'reg-1', entite: ['Karine'], pseudos: ['Marie'] }
    writeFileSync(join(dir, 'corpus.json'), JSON.stringify(corpus, null, 2), 'utf8')
    writeFileSync(join(dir, 'entretiens', 'e1.json'), entretienKarine(), 'utf8')

    const r = await appliquerRegleLotLocal(store, [
      { entretienId: 'e1', regleId: 'reg-1' },
      { entretienId: 'e1', regleId: 'reg-1' }, // doublon : un seul cycle.
      { entretienId: 'e9', regleId: 'reg-inconnu' }, // absent : succès à 0 (contrat store)
    ])
    expect(r.succes).toEqual([
      { id: 'e1', nb: 2, titre: expect.any(String) },
      { id: 'e9', nb: 0, titre: 'e9' },
    ])
    expect(r.echecs).toEqual([])
    const data = JSON.parse(readFileSync(join(dir, 'entretiens', 'e1.json'), 'utf8')) as {
      annotations: { type: string; pseudo?: string }[]
    }
    expect(data.annotations.filter((a) => a.type === 'anon')).toHaveLength(2)
  })
})

describe('Lot de valeurs — corpus LOCAL (boucle directe du store)', () => {
  it('valeurs posées chez leur propriétaire ; introuvable signalé sans bloquer les autres', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sonal-lot-local-'))
    const store = new CorpusStore(dir)
    store.ouvrir() // amorce corpus vide
    writeFileSync(join(dir, 'entretiens', 'e1.json'), entretienE1(), 'utf8')

    const r = await poserValeurLotLocal(store, [
      { entretienId: 'e1', cible: { type: 'entretien' }, idVar: 'var_ville', idMod: 'mod_lyon' },
      { entretienId: 'e9', cible: { type: 'entretien' }, idVar: 'var_ville', idMod: 'mod_lyon' },
    ])
    expect(r.succes).toEqual(['e1']) // l'inconnu ne bloque pas le connu
    expect(r.echecs.map((e) => e.id)).toEqual(['e9'])
    const data = JSON.parse(readFileSync(join(dir, 'entretiens', 'e1.json'), 'utf8')) as {
      meta: { valeursGen: Record<string, string> }
    }
    expect(data.meta.valeursGen.var_ville).toBe('mod_lyon')
  })
})
