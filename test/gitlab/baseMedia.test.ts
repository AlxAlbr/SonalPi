/**
 *  Base média locale d'un corpus GitLab : déclaration, validation et test
 *  d'accès au dossier partagé.
 *
 *  La base est un réglage DU POSTE : elle vit dans le coffre, jamais dans le
 *  corpus, et son secret ne sort jamais du main. Une base absente n'empêche
 *  rien — un corpus GitLab sans médias reste utilisable.
 */

import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { CoffreComptes, type Chiffreur } from '../../src/main/distant/coffre'
import {
  baseMediaLocale,
  enregistrerBaseMediaVerifiee,
  resoudreBaseMedia,
  testerAccesBase,
  verifierDeclarationBaseMedia,
} from '../../src/main/medias/baseMedia'
import { ClientWebDAV } from '../../src/main/webdav/client'
import { ServeurWebDAVMemoire } from '../webdav/serveurWebdavMemoire'
import type { CredentialOAuthGitLab } from '../../src/main/gitlab/oauth/credential'

const chiffreur: Chiffreur = {
  disponible: () => true,
  chiffre: (clair) => `chiffre:${Buffer.from(clair).toString('base64')}`,
  dechiffre: (secret) => {
    if (!secret.startsWith('chiffre:')) throw new Error('secret illisible')
    return Buffer.from(secret.slice('chiffre:'.length), 'base64').toString()
  },
}

function credential(): CredentialOAuthGitLab {
  return {
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['api'],
    rotationneeLe: Date.now(),
  }
}

function coffreAvecDestination(fichier?: string) {
  const chemin = fichier ?? join(mkdtempSync(join(tmpdir(), 'sonal-base-media-')), 'comptes.json')
  const coffre = new CoffreComptes(chemin, chiffreur)
  const compte = coffre.enregistrerCompteGitLab({
    urlInstance: 'https://gitlab.example.org',
    utilisateur: 'max',
    credential: credential(),
  })
  const destination = coffre.enregistrerDestinationGitLab({
    compteId: compte.id,
    projetId: 42,
    nomProjet: 'Corpus pilote',
    branche: 'main',
  })
  return { chemin, coffre, destination }
}

describe('base média — déclaration locale', () => {
  test('un corpus sans base reste utilisable : la résolution le dit, sans erreur', () => {
    const { coffre, destination } = coffreAvecDestination()

    expect(baseMediaLocale(coffre, destination.id)).toBeNull()
    expect(resoudreBaseMedia(coffre, destination.id)).toEqual({
      ok: false,
      motif: 'non-configuree',
    })
  })

  test('la base déclarée donne un client configuré, et son secret reste au main', () => {
    const { coffre, destination } = coffreAvecDestination()
    coffre.enregistrerBaseMedia({
      destinationGitLabId: destination.id,
      urlBase: 'https://nuage.example.org/remote.php/dav/files/max/CorpusPartage/',
      utilisateur: 'max',
      motDePasse: 'mot-de-passe-application',
    })

    const resolution = resoudreBaseMedia(coffre, destination.id)

    expect(resolution.ok).toBe(true)
    if (!resolution.ok) return
    expect(resolution.base).toEqual({
      destinationGitLabId: destination.id,
      urlBase: 'https://nuage.example.org/remote.php/dav/files/max/CorpusPartage',
      utilisateur: 'max',
      secretDisponible: true,
    })
    // La forme destinée à l'interface ne porte aucun secret.
    expect(Object.keys(resolution.base)).not.toContain('motDePasse')
    expect(resolution.client.config.identifiants).toEqual({
      utilisateur: 'max',
      motDePasse: 'mot-de-passe-application',
    })
  })

  test('un secret illisible est signalé, jamais contourné', () => {
    const { chemin, coffre, destination } = coffreAvecDestination()
    coffre.enregistrerBaseMedia({
      destinationGitLabId: destination.id,
      urlBase: 'https://nuage.example.org/remote.php/dav/files/max/CorpusPartage',
      utilisateur: 'max',
      motDePasse: 'secret-media',
    })
    const enRuine = new CoffreComptes(chemin, {
      disponible: () => true,
      chiffre: chiffreur.chiffre,
      dechiffre: () => {
        throw new Error('trousseau inaccessible')
      },
    })

    expect(baseMediaLocale(enRuine, destination.id)).toEqual(
      expect.objectContaining({ secretDisponible: false }),
    )
    expect(resoudreBaseMedia(enRuine, destination.id)).toEqual({
      ok: false,
      motif: 'secret-indisponible',
    })
  })

  test('une base déclarée ne touche ni au corpus ni aux corpus distants récents', () => {
    const { chemin, coffre, destination } = coffreAvecDestination()
    coffre.enregistrerBaseMedia({
      destinationGitLabId: destination.id,
      urlBase: 'https://nuage.example.org/remote.php/dav/files/max/CorpusPartage',
      utilisateur: 'max',
      motDePasse: 'secret-media',
    })

    expect(coffre.lister()).toEqual([])
    const persiste = readFileSync(chemin, 'utf8')
    expect(persiste).not.toContain('secret-media')
    expect(JSON.parse(persiste)).toMatchObject({
      basesMedia: { [destination.id]: { utilisateur: 'max' } },
    })
  })
})

describe('base média — validation de la déclaration', () => {
  test('accepte une adresse HTTPS, en retirant la barre finale', () => {
    expect(
      verifierDeclarationBaseMedia({
        urlBase: 'https://nuage.example.org/remote.php/dav/files/max/CorpusPartage/',
        utilisateur: ' max ',
        motDePasse: 'secret',
      }),
    ).toEqual({
      urlBase: 'https://nuage.example.org/remote.php/dav/files/max/CorpusPartage',
      utilisateur: 'max',
    })
  })

  test.each([
    ['http nu', { urlBase: 'http://nuage.example.org/dav', utilisateur: 'max', motDePasse: 's' }, /HTTPS/],
    [
      'identifiants dans l\'URL',
      { urlBase: 'https://max:secret@nuage.example.org/dav', utilisateur: 'max', motDePasse: 's' },
      /identifiants/,
    ],
    [
      'fragment',
      { urlBase: 'https://nuage.example.org/dav#x', utilisateur: 'max', motDePasse: 's' },
      /fragment/,
    ],
    ['URL vide', { urlBase: '  ', utilisateur: 'max', motDePasse: 's' }, /manquante/],
    ['sans identité', { urlBase: 'https://nuage.example.org/dav', utilisateur: ' ', motDePasse: 's' }, /Identité/],
    ['sans mot de passe', { urlBase: 'https://nuage.example.org/dav', utilisateur: 'max', motDePasse: '' }, /Mot de passe/],
  ])('refuse : %s', (_cas, params, motif) => {
    expect(() => verifierDeclarationBaseMedia(params)).toThrow(motif)
  })
})

describe('base média — test d\'accès au dossier', () => {
  test('la déclaration n’est persistée qu’après un test réussi', async () => {
    const { coffre, destination } = coffreAvecDestination()
    const serveur = new ServeurWebDAVMemoire()
    serveur.poser('audios/e1.mp3', 'contenu')

    const creerClient = (config: ConstructorParameters<typeof ClientWebDAV>[0]) =>
      new ClientWebDAV(config, serveur.fetch)

    await expect(enregistrerBaseMediaVerifiee(coffre, destination.id, {
      urlBase: serveur.baseUrl,
      utilisateur: serveur.identifiants.utilisateur,
      motDePasse: 'incorrect',
    }, creerClient)).resolves.toEqual({ ok: false, motif: 'droits' })
    expect(coffre.baseMedia(destination.id)).toBeNull()

    await expect(enregistrerBaseMediaVerifiee(coffre, destination.id, {
      urlBase: `${serveur.baseUrl}/`,
      utilisateur: serveur.identifiants.utilisateur,
      motDePasse: serveur.identifiants.motDePasse,
    }, creerClient)).resolves.toEqual({ ok: true })
    expect(coffre.baseMedia(destination.id)).toMatchObject({
      urlBase: serveur.baseUrl,
      utilisateur: serveur.identifiants.utilisateur,
    })
  })

  test('un dossier partagé accessible est accepté', async () => {
    const serveur = new ServeurWebDAVMemoire()
    serveur.poser('audios/e1.mp3', 'contenu')

    const client = new ClientWebDAV(
      { baseUrl: serveur.baseUrl, identifiants: serveur.identifiants },
      serveur.fetch,
    )

    expect(await testerAccesBase(client)).toEqual({ ok: true })
  })

  test.each([
    [401, 'droits'],
    [403, 'droits'],
    [404, 'dossier-absent'],
    [503, 'indisponible'],
  ])('un refus %i se reformule en « %s »', async (statut, motif) => {
    const client = new ClientWebDAV(
      { baseUrl: 'https://serveur.test/dav', identifiants: { utilisateur: 'max', motDePasse: 'x' } },
      async () => new Response('refus', { status: statut }),
    )

    expect(await testerAccesBase(client)).toEqual({ ok: false, motif })
  })

  test('un délai dépassé est une indisponibilité, pas un refus de droits', async () => {
    const client = new ClientWebDAV(
      { baseUrl: 'https://serveur.test/dav', identifiants: { utilisateur: 'max', motDePasse: 'x' } },
      (_url, init) =>
        new Promise((_resoudre, rejeter) => {
          init?.signal?.addEventListener('abort', () => rejeter(new Error('aborted')))
        }),
      { requeteMs: 20 },
    )

    expect(await testerAccesBase(client)).toEqual({ ok: false, motif: 'indisponible' })
  })
})
