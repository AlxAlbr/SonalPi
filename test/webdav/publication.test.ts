/**
 *  Tests de la PUBLICATION INITIALE d'un corpus distant contre le serveur
 *  WebDAV embarqué : squelette posé sur une cible neuve, garde If-None-Match
 *  (« déjà un corpus », y compris en course bi-poste), reprise idempotente
 *  après échec réseau mi-parcours, et équivalence stricte entre le squelette
 *  distant et l'amorce locale (même codebook par défaut).
 */

import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { PublieurCorpus, ErreurDejaCorpus } from '../../src/main/distant/publication'
import { CorpusStore } from '../../src/main/corpusStore'
import { squeletteCorpus } from '../../src/shared/corpus/squelette'
import { ServeurWebDAVMemoire } from './serveurWebdavMemoire'

/** Un publieur pointant SOUS la racine du banc :
 *  `/…/MonCorpus/<sous>/<corpus>` n'existe PAS à l'amorce du banc —
 *  exactement le cas d'usage « l'utilisateur vise un dossier à créer ».
 *  Exerce aussi `assurerRacine` (chaîne de MKCOL). */
function publieurVersSousDossier(serveur: ServeurWebDAVMemoire, chemin = '/Equipe/MonNouveau') {
  return new PublieurCorpus(
    {
      baseUrl: serveur.baseUrl + chemin,
      identifiants: serveur.identifiants,
    },
    serveur.fetch,
  )
}

describe('PublieurCorpus.publierSquelette', () => {
  it('crée un corpus neuf sur une cible inexistante : chaîne de dossiers + dossiers techniques + corpus.crp', async () => {
    const serveur = new ServeurWebDAVMemoire()
    const clientCible = new ClientWebDAV(
      { baseUrl: serveur.baseUrl + '/Equipe/MonNouveau', identifiants: serveur.identifiants },
      serveur.fetch,
    )

    await publieurVersSousDossier(serveur).publierSquelette('Terrain Aide aux Devoirs')

    // Le corpus.crp distant est exactement le squelette partagé (né en mémoire).
    const contenu = JSON.parse(await clientCible.getTexte('corpus.crp'))
    expect(contenu).toEqual(squeletteCorpus('Terrain Aide aux Devoirs'))

    // Les dossiers techniques existent (PROPFIND de la racine du corpus).
    const entrees = await clientCible.propfind('')
    const noms = entrees.filter((e) => e.dossier).map((e) => e.chemin)
    expect(noms).toEqual(expect.arrayContaining(['entretiens', 'verrous', 'presence', 'corbeille', 'DocsPrepaProjet']))
  })

  it('refuse NET si un corpus existe déjà (garde If-None-Match) et n’écrase rien', async () => {
    const serveur = new ServeurWebDAVMemoire()
    const publieur = publieurVersSousDossier(serveur)
    await publieur.publierSquelette('Premier nom')

    // Second appel sur la MÊME cible → ErreurDejaCorpus, message utilisateur net.
    await expect(publieur.publierSquelette('Autre nom')).rejects.toBeInstanceOf(ErreurDejaCorpus)

    // Le contenu initial est INTACT (jamais d'écrasement).
    const clientCible = new ClientWebDAV(
      { baseUrl: serveur.baseUrl + '/Equipe/MonNouveau', identifiants: serveur.identifiants },
      serveur.fetch,
    )
    const contenu = JSON.parse(await clientCible.getTexte('corpus.crp'))
    expect((contenu as { nom?: string }).nom).toBe('Premier nom')
  })

  it('reprise après crash mi-parcours : les dossiers préexistants (405) ne gênent pas le second essai', async () => {
    const serveur = new ServeurWebDAVMemoire()
    const clientCible = new ClientWebDAV(
      { baseUrl: serveur.baseUrl + '/Equipe/MonNouveau', identifiants: serveur.identifiants },
      serveur.fetch,
    )
    // Simulation d'un échec après les MKCOL mais avant le PUT (réseau coupé).
    await clientCible.mkcol('entretiens')
    await clientCible.mkcol('verrous')

    // La republication est IDEMPOTENTE : MKCOL 405 tolérés, PUT aboutit.
    await publieurVersSousDossier(serveur).publierSquelette('Reprise')
    const contenu = JSON.parse(await clientCible.getTexte('corpus.crp'))
    expect((contenu as { nom?: string }).nom).toBe('Reprise')
  })

  it('échec réseau mi-parcours (PUT refusé) PUIS reprise : le second essai aboutit', async () => {
    const serveur = new ServeurWebDAVMemoire()
    const config = {
      baseUrl: serveur.baseUrl + '/Equipe/MonNouveau',
      identifiants: serveur.identifiants,
    }
    // fetch qui laisse passer les MKCOL mais COUPE le réseau au PUT (crash,
    // wifi perdu…) : l'utilisateur se retrouve avec des dossiers sans corpus.
    let couper = true
    const fetchCassee: ImplementationFetch = async (entree, init) => {
      const methode = init?.method ?? (entree instanceof Request ? entree.method : 'GET')
      if (couper && methode === 'PUT') throw new Error('network down')
      return serveur.fetch(entree as RequestInfo | URL, init)
    }
    await expect(new PublieurCorpus(config, fetchCassee).publierSquelette('Interrompu')).rejects.toThrow(
      'network down',
    )

    // Reprise : fetch normal, MKCOL 405 tolérés, PUT aboutit —
    // l'état laissé par l'échec n'est JAMAIS bloquant (aucun « semi-corpus » verrouillé).
    couper = false
    await new PublieurCorpus(config, serveur.fetch).publierSquelette('Reprise après échec')
    const clientCible = new ClientWebDAV(config, serveur.fetch)
    const contenu = JSON.parse(await clientCible.getTexte('corpus.crp'))
    expect((contenu as { nom?: string }).nom).toBe('Reprise après échec')
  })

  it('course de création bi-poste : exactement UN gagnant, l’autre reçoit « déjà un corpus »', async () => {
    const serveur = new ServeurWebDAVMemoire({ olivier: 'pass-oli' })
    const cible = '/Equipe/MonNouveau'
    const max = new PublieurCorpus(
      { baseUrl: serveur.baseUrl + cible, identifiants: serveur.identifiants },
      serveur.fetch,
    )
    const olivier = new PublieurCorpus(
      { baseUrl: serveur.baseUrl + cible, identifiants: { utilisateur: 'olivier', motDePasse: 'pass-oli' } },
      serveur.fetch,
    )

    const resultats = await Promise.allSettled([max.publierSquelette(), olivier.publierSquelette()])
    const gagnes = resultats.filter((r) => r.status === 'fulfilled')
    const perdus = resultats.filter((r) => r.status === 'rejected')

    expect(gagnes).toHaveLength(1)
    expect(perdus).toHaveLength(1)
    // Le perdant a reçu l'erreur TYPÉE (le serveur a tranché, pas une course locale).
    expect((perdus[0] as PromiseRejectedResult).reason).toBeInstanceOf(ErreurDejaCorpus)
  })
})

describe('squeletteCorpus — partagé local/distant', () => {
  it("l'amorce LOCALE écrit exactement le même squelette (aucune divergence de codebook)", () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'sonal-amorce-')), 'corpus')
    const store = new CorpusStore(dir)
    store.ouvrir() // déclenche amorcer() sur dossier vierge

    const ecrit = JSON.parse(readFileSync(join(dir, 'corpus.crp'), 'utf8'))
    expect(ecrit).toEqual(squeletteCorpus())
  })

  it('le nom de projet optionnel voyage dans le squelette distant', () => {
    expect(squeletteCorpus('Mon projet').nom).toBe('Mon projet')
    expect('nom' in squeletteCorpus()).toBe(false) // amorce locale nue : pas de nom imposé
  })
})
