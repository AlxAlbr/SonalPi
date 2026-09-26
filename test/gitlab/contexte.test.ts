import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { BailGitLab, cleRessourceBailGitLab } from '../../src/main/gitlab/bailGitLab'
import { ClientGitLab } from '../../src/main/gitlab/client'
import {
  ContexteGitLab,
  preparerContexteGitLabLectureSeule,
} from '../../src/main/gitlab/contexte'
import { PublieurGitLab } from '../../src/main/gitlab/publication'
import { SessionGitLab } from '../../src/main/gitlab/session'
import { StockageLocalEntretienGitLab } from '../../src/main/gitlab/stockageSession'
import { CorpusStore } from '../../src/main/corpusStore'
import { DepotMemoire } from './depotMemoire'
import {
  corpusDistantValide,
  entretienDistantValide,
} from '../webdav/fixturesCorpusDistant'

const SHA_1 = '1111111111111111111111111111111111111111'
const SHA_2 = '2222222222222222222222222222222222222222'

function reponseJson(valeur: unknown): Response {
  return new Response(JSON.stringify(valeur), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function sessionFactice() {
  return {
    ouvrir: vi.fn(async () => ({ etat: 'edition', revision: 0, revisionPubliee: 0 })),
    marquerSale: vi.fn(async () => undefined),
    publier: vi.fn(async () => ({
      statut: 'confirme',
      commitId: '1'.repeat(40),
      compteurBail: 2,
    })),
    renouveler: vi.fn(async () => true),
    fermer: vi.fn(async () => ({ fermee: true })),
    etat: vi.fn(() => ({ etat: 'edition', revision: 1, revisionPubliee: 1 })),
  }
}

function contexteDeSession(session: ReturnType<typeof sessionFactice>) {
  const tirer = vi.fn(async () => ({
    telecharges: [],
    corbeille: [],
    inaccessibles: [],
    date: new Date(0).toISOString(),
  }))
  const contexte = new ContexteGitLab(
    'destination-test',
    {} as never,
    { tirer } as never,
    () => session as unknown as SessionGitLab,
  )
  return { contexte, tirer }
}

describe('contexte GitLab en lecture seule', () => {
  test('résout un nouveau commit à chaque tirage sans aucune écriture serveur', async () => {
    let tete = SHA_1
    const requetes: { url: URL; init?: RequestInit }[] = []
    const fetchImpl = vi.fn(async (
      entree: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = new URL(String(entree))
      requetes.push({ url, init })
      if (url.pathname.includes('/repository/branches/')) {
        return reponseJson({ commit: { id: tete } })
      }
      if (url.pathname.endsWith('/repository/tree')) {
        const ref = url.searchParams.get('ref')
        const suffixe = ref === SHA_1 ? '1' : '2'
        if (url.searchParams.get('path') === 'donnees') {
          return reponseJson([
            {
              id: `corpus-${suffixe}`,
              name: 'corpus.json',
              type: 'blob',
              path: 'donnees/corpus.json',
              mode: '100644',
            },
            {
              id: `entretiens-${suffixe}`,
              name: 'entretiens',
              type: 'tree',
              path: 'donnees/entretiens',
              mode: '040000',
            },
          ])
        }
        return reponseJson([{
          id: `e1-${suffixe}`,
          name: 'e1.json',
          type: 'blob',
          path: 'donnees/entretiens/e1.json',
          mode: '100644',
        }])
      }
      if (url.pathname.includes('/repository/files/')) {
        const chemin = decodeURIComponent(url.pathname)
        if (chemin.includes('/donnees/corpus.json/raw')) {
          return new Response(corpusDistantValide(['e1']))
        }
        const texte = url.searchParams.get('ref') === SHA_1 ? 'première version' : 'seconde version'
        return new Response(entretienDistantValide({ texte }))
      }
      return new Response(null, { status: 404 })
    }) as typeof fetch
    const client = new ClientGitLab({
      urlInstance: 'https://gitlab.example.org',
      projetId: 42,
      autorisation: { type: 'jeton-prive', jeton: 'secret' },
    }, fetchImpl)

    const preparation = await preparerContexteGitLabLectureSeule({
      id: 'gitlab:42:main:donnees',
      dirLocal: mkdtempSync(join(tmpdir(), 'sonal-gitlab-contexte-')),
      client,
      branche: 'main',
      racine: 'donnees',
    })

    expect(preparation.corpus.membership).toHaveProperty('e1')
    expect(preparation.contexte.store.lectureSeule).toBe(true)
    expect(preparation.contexte.store.lireEntretien('e1')).toMatchObject({
      ok: true,
      data: { texte: 'première version' },
    })
    const finPremierTirage = requetes.length
    expect(requetes.slice(1).every(({ url }) =>
      url.searchParams.get('ref') === SHA_1)).toBe(true)

    tete = SHA_2
    await expect(preparation.contexte.actualiser()).resolves.toMatchObject({
      telecharges: ['corpus.json', 'entretiens/e1.json'],
      verrous: [],
    })
    expect(preparation.contexte.store.lireEntretien('e1')).toMatchObject({
      ok: true,
      data: { texte: 'seconde version' },
    })
    expect(requetes.slice(finPremierTirage + 1).every(({ url }) =>
      url.searchParams.get('ref') === SHA_2)).toBe(true)
    expect(requetes.every(({ init }) => init?.method === 'GET')).toBe(true)

    await preparation.contexte.fermer()
    await expect(preparation.contexte.actualiser()).rejects.toThrow('fermé')
  })

  test('rejoue les commandes de session depuis le contexte sans les exposer au renderer', async () => {
    const session = sessionFactice()
    const { contexte, tirer } = contexteDeSession(session)

    await expect(contexte.ouvrirSessionEntretien('e1')).resolves.toEqual({
      etat: 'edition',
      revision: 0,
      revisionPubliee: 0,
    })
    const ressource = contexte.ressourceEntretien('e1')
    await contexte.marquerSessionSale(ressource)
    await expect(contexte.publierSession(ressource)).resolves.toMatchObject({
      statut: 'confirme',
    })
    await expect(contexte.renouvelerSession(ressource)).resolves.toBe(true)
    expect(contexte.etatSession(ressource)).toEqual({
      etat: 'edition',
      revision: 1,
      revisionPubliee: 1,
    })
    await contexte.actualiser()
    expect(tirer).toHaveBeenLastCalledWith(['entretiens/e1.json'])
    await expect(contexte.fermerSession(ressource)).resolves.toBe(true)
    expect(session.ouvrir).toHaveBeenCalledTimes(1)
    expect(session.fermer).toHaveBeenCalledTimes(1)
  })

  test('protège le tirage pendant l’ouverture et ne retient pas une session en lecture seule', async () => {
    const session = sessionFactice()
    let poursuivre!: () => void
    const attente = new Promise<void>((resolve) => { poursuivre = resolve })
    session.ouvrir.mockImplementationOnce(async () => {
      await attente
      return { etat: 'edition', revision: 0, revisionPubliee: 0 }
    })
    const { contexte, tirer } = contexteDeSession(session)
    const ouverture = contexte.ouvrirSessionEntretien('e1')
    await contexte.actualiser()
    expect(tirer).toHaveBeenLastCalledWith(['entretiens/e1.json'])
    poursuivre()
    await ouverture

    const lecteur = sessionFactice()
    lecteur.ouvrir.mockResolvedValueOnce({
      etat: 'lecture-seule',
      raison: 'bail',
      tenupar: null,
    })
    const contexteLecteur = new ContexteGitLab(
      'destination-test',
      {} as never,
      { tirer } as never,
      () => lecteur as unknown as SessionGitLab,
    )
    await expect(contexteLecteur.ouvrirSessionEntretien('e2')).resolves.toMatchObject({
      etat: 'lecture-seule',
    })
    await contexteLecteur.actualiser()
    expect(tirer).toHaveBeenLastCalledWith([])
  })

  test('conserve le contexte si une session empêche sa fermeture', async () => {
    const session = sessionFactice()
    session.fermer.mockResolvedValueOnce({ fermee: false, raison: 'publication' })
    const { contexte } = contexteDeSession(session)
    await contexte.ouvrirSessionEntretien('e1')

    await expect(contexte.fermer()).rejects.toThrow('empêche la fermeture')
    session.fermer.mockResolvedValueOnce({ fermee: true })
    await expect(contexte.fermer()).resolves.toBeUndefined()
  })
})

/** Contexte complet : store local, session réelle et dépôt partagé en mémoire. */
function storeAvecE1(): string {
  const dirLocal = mkdtempSync(join(tmpdir(), 'sonal-gitlab-banc-'))
  mkdirSync(join(dirLocal, 'entretiens'), { recursive: true })
  writeFileSync(join(dirLocal, 'corpus.json'), corpusDistantValide(['e1']))
  writeFileSync(join(dirLocal, 'entretiens', 'e1.json'), entretienDistantValide())
  return dirLocal
}

function contexteBanc(
  depot: DepotMemoire,
  identite: { userId: string; machineId: string; sessionId: string },
  maintenant: () => number,
): ContexteGitLab {
  const dirLocal = storeAvecE1()
  const store = new CorpusStore(dirLocal)
  store.lectureSeule = true
  const coordination = new BailGitLab({
    branche: 'main',
    depot,
    identite: () => identite,
    maintenant,
    dureeBailMs: 60_000,
  })
  const cheminDistant = 'entretiens/e1.json'
  return new ContexteGitLab(
    'destination-test',
    store,
    { tirer: async () => ({
      telecharges: [],
      corbeille: [],
      inaccessibles: [],
      date: new Date(maintenant()).toISOString(),
    }) } as never,
    (ressource, cheminRelatif) => new SessionGitLab({
      id: identite.sessionId,
      ressource,
      ressourcePartagee: cleRessourceBailGitLab('main', cheminDistant),
      cheminRelatif,
      cheminDistant,
      branche: 'main',
      depot,
      coordination,
      publication: new PublieurGitLab({ branche: 'main', depot, coordination }),
      stockageLocal: new StockageLocalEntretienGitLab(dirLocal, cheminRelatif),
      maintenant,
      nouvelleOperation: () => `operation-${identite.sessionId}`,
    }),
  )
}

function depotAvecE1(): DepotMemoire {
  const depot = new DepotMemoire()
  depot.fichiers.set('entretiens/e1.json', {
    contenu: entretienDistantValide(),
    commitId: '1'.repeat(40),
  })
  return depot
}

describe('détenteur connu à l’ouverture d’un entretien GitLab', () => {
  test('nomme le compte qui tient l’entretien, sans date ni poste inventés', async () => {
    const depot = depotAvecE1()
    const maintenant = () => Date.UTC(2026, 0, 1)
    const alice = contexteBanc(depot, { userId: 'alice', machineId: 'poste-a', sessionId: 's-a' }, maintenant)
    const bob = contexteBanc(depot, { userId: 'bob', machineId: 'poste-b', sessionId: 's-b' }, maintenant)

    await expect(alice.ouvrirEntretienPourEdition('e1')).resolves.toMatchObject({
      ok: true,
      acces: 'edition',
    })
    // La session qu'on détient déjà n'affiche personne.
    await expect(alice.ouvrirEntretienPourEdition('e1')).resolves.toMatchObject({
      ok: true,
      acces: 'edition',
    })
    await expect(bob.ouvrirEntretienPourEdition('e1')).resolves.toEqual({
      ok: true,
      acces: 'lecture-seule',
      data: expect.anything(),
      verrouTenuParAutrui: { userId: 'alice', machineId: '', acquiredAt: '' },
    })
  })

  test('exclut le même compte sur une autre session et le nomme quand même', async () => {
    const depot = depotAvecE1()
    const maintenant = () => Date.UTC(2026, 0, 1)
    const premiere = contexteBanc(depot, { userId: 'alice', machineId: 'poste-a', sessionId: 's-1' }, maintenant)
    const seconde = contexteBanc(depot, { userId: 'alice', machineId: 'poste-a', sessionId: 's-2' }, maintenant)
    const autrePoste = contexteBanc(depot, { userId: 'alice', machineId: 'poste-b', sessionId: 's-3' }, maintenant)

    await premiere.ouvrirEntretienPourEdition('e1')
    for (const contexte of [seconde, autrePoste]) {
      const ouverture = await contexte.ouvrirEntretienPourEdition('e1')
      expect(ouverture).toMatchObject({
        acces: 'lecture-seule',
        verrouTenuParAutrui: { userId: 'alice' },
      })
    }
  })

  test('un bail expiré repris n’est plus un détenteur nommé', async () => {
    const depot = depotAvecE1()
    let maintenant = Date.UTC(2026, 0, 1)
    const alice = contexteBanc(depot, { userId: 'alice', machineId: 'poste-a', sessionId: 's-a' }, () => maintenant)
    const bob = contexteBanc(depot, { userId: 'bob', machineId: 'poste-b', sessionId: 's-b' }, () => maintenant)

    await alice.ouvrirEntretienPourEdition('e1')
    maintenant += 60_001
    await expect(bob.ouvrirEntretienPourEdition('e1')).resolves.toMatchObject({
      acces: 'edition',
    })
  })

  test('un refus sans bail lisible ne nomme personne et n’accorde aucune écriture', async () => {
    const store = new CorpusStore(storeAvecE1())
    store.lectureSeule = true
    const autoriser = vi.spyOn(store, 'autoriserEcritureEntretien')
    const session = sessionFactice()
    session.ouvrir.mockResolvedValue({ etat: 'lecture-seule', raison: 'bail', tenupar: null })
    const contexte = new ContexteGitLab(
      'destination-test',
      store,
      { tirer: vi.fn(async () => ({
        telecharges: [],
        corbeille: [],
        inaccessibles: [],
        date: new Date(0).toISOString(),
      })) } as never,
      () => session as unknown as SessionGitLab,
    )

    await expect(contexte.ouvrirEntretienPourEdition('e1')).resolves.toMatchObject({
      acces: 'lecture-seule',
      verrouTenuParAutrui: null,
    })
    expect(autoriser).not.toHaveBeenCalled()
  })

  test('une session dégradée ne nomme aucun détenteur', async () => {
    const store = new CorpusStore(storeAvecE1())
    store.lectureSeule = true
    const session = sessionFactice()
    session.ouvrir.mockResolvedValue({ etat: 'degrade', raison: 'reseau' })
    const contexte = new ContexteGitLab(
      'destination-test',
      store,
      { tirer: vi.fn() } as never,
      () => session as unknown as SessionGitLab,
    )

    await expect(contexte.ouvrirEntretienPourEdition('e1')).resolves.toMatchObject({
      acces: 'lecture-seule',
      verrouTenuParAutrui: null,
    })
  })
})
