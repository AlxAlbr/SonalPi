import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  CoffreComptes,
  idDeCompteGitLab,
  idDeCorpus,
  type Chiffreur,
} from '../../src/main/distant/coffre'
import type { CredentialOAuthGitLab } from '../../src/main/gitlab/oauth/credential'

const chiffreur: Chiffreur = {
  disponible: () => true,
  chiffre: (clair) => `chiffre:${Buffer.from(clair).toString('base64')}`,
  dechiffre: (secret) => {
    // Comme le vrai chiffreur : une valeur sans préfixe n'est pas déchiffrable.
    if (!secret.startsWith('chiffre:')) throw new Error('secret illisible')
    return Buffer.from(secret.slice('chiffre:'.length), 'base64').toString()
  },
}

function credential(surcharge: Partial<CredentialOAuthGitLab> = {}): CredentialOAuthGitLab {
  return {
    accessToken: 'access-secret',
    refreshToken: 'refresh-secret',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['read_api', 'write_repository'],
    rotationneeLe: Date.now(),
    ...surcharge,
  }
}

describe('coffre GitLab', () => {
  test('sépare le compte secret des destinations projet, branche et racine', () => {
    const fichier = join(mkdtempSync(join(tmpdir(), 'sonal-coffre-gitlab-')), 'comptes.json')
    const coffre = new CoffreComptes(fichier, chiffreur)
    const compte = coffre.enregistrerCompteGitLab({
      urlInstance: 'https://gitlab.example.org/institution/',
      utilisateur: 'max',
      credential: credential(),
    })
    const destinationA = coffre.enregistrerDestinationGitLab({
      compteId: compte.id,
      projetId: 42,
      nomProjet: 'Corpus pilote',
      branche: 'équipe/pilote',
      racine: 'donnees/corpus-a/',
    })
    const destinationB = coffre.enregistrerDestinationGitLab({
      compteId: compte.id,
      projetId: 42,
      nomProjet: 'Corpus pilote',
      branche: 'main',
    })

    expect(compte).toMatchObject({
      fournisseur: 'gitlab',
      urlInstance: 'https://gitlab.example.org/institution',
      utilisateur: 'max',
    })
    expect(destinationA).toMatchObject({
      fournisseur: 'gitlab',
      compteId: compte.id,
      projetId: 42,
      branche: 'équipe/pilote',
      racine: 'donnees/corpus-a',
    })
    expect(destinationB.id).not.toBe(destinationA.id)
    expect(coffre.credentialOAuthGitLab(compte.id)?.accessToken).toBe('access-secret')
    expect(coffre.listerComptesGitLab()).toHaveLength(1)
    expect(coffre.listerDestinationsGitLab()).toHaveLength(2)
    expect(coffre.lister()).toEqual([])

    const persiste = readFileSync(fichier, 'utf8')
    expect(persiste).not.toContain('access-secret')
    expect(persiste).not.toContain('refresh-secret')
    expect(JSON.parse(persiste)).toMatchObject({ formatVersion: 6, basesMedia: {} })

    const memeCompte = coffre.enregistrerCompteGitLab({
      urlInstance: 'https://GITLAB.example.org:443/institution',
      utilisateur: ' max ',
      credential: credential({ accessToken: 'access-renouvelé' }),
    })
    expect(memeCompte.id).toBe(compte.id)
    expect(coffre.credentialOAuthGitLab(compte.id)?.accessToken).toBe('access-renouvelé')
    expect(coffre.listerDestinationsGitLab()).toHaveLength(2)

    coffre.oublier(compte.id)
    expect(coffre.credentialOAuthGitLab(compte.id)).toBeNull()
    expect(coffre.listerDestinationsGitLab()).toHaveLength(2)
    coffre.oublierDestinationGitLab(destinationA.id)
    expect(coffre.listerDestinationsGitLab()).toEqual([destinationB])
  })

  test('chiffre un jeton personnel et le relit sans l’exposer', () => {
    const fichier = join(mkdtempSync(join(tmpdir(), 'sonal-coffre-pat-')), 'comptes.json')
    const coffre = new CoffreComptes(fichier, chiffreur)
    const compte = coffre.enregistrerCompteGitLabAvecJeton({
      urlInstance: 'https://gitlab.example.org',
      utilisateur: 'max',
      jeton: 'glpat-secret',
    })

    expect(compte.authentification).toBe('jeton-personnel')
    expect(coffre.jetonPersonnelGitLab(compte.id)).toBe('glpat-secret')
    expect(readFileSync(fichier, 'utf8')).not.toContain('glpat-secret')

    const relu = new CoffreComptes(fichier, chiffreur)
    expect(relu.jetonPersonnelGitLab(compte.id)).toBe('glpat-secret')
    expect(relu.credentialOAuthGitLab(compte.id)).toBeNull()
  })

  test('garde un jeton personnel en mémoire sans stockage sécurisé', () => {
    const fichier = join(mkdtempSync(join(tmpdir(), 'sonal-coffre-pat-session-')), 'comptes.json')
    const faible: Chiffreur = {
      disponible: () => false,
      chiffre: () => { throw new Error('stockage indisponible') },
      dechiffre: () => { throw new Error('stockage indisponible') },
    }
    const coffre = new CoffreComptes(fichier, faible)
    const compte = coffre.enregistrerCompteGitLabAvecJeton({
      urlInstance: 'https://gitlab.example.org',
      utilisateur: 'max',
      jeton: 'glpat-session',
    })

    expect(coffre.jetonPersonnelGitLab(compte.id)).toBe('glpat-session')
    expect(readFileSync(fichier, 'utf8')).not.toContain('glpat-session')
    expect(new CoffreComptes(fichier, faible).jetonPersonnelGitLab(compte.id)).toBeNull()
  })

  test('migre un coffre WebDAV v2 sans changer ses identifiants', () => {
    const fichier = join(mkdtempSync(join(tmpdir(), 'sonal-coffre-v2-')), 'comptes.json')
    const id = idDeCorpus('https://nuage.example.org/corpus', 'max')
    writeFileSync(fichier, JSON.stringify({
      formatVersion: 2,
      comptes: {
        [id]: {
          id,
          urlServeur: 'https://nuage.example.org/corpus',
          utilisateur: 'max',
          motDePasseChiffre: chiffreur.chiffre('secret-webdav'),
        },
      },
    }))

    const coffre = new CoffreComptes(fichier, chiffreur)

    expect(coffre.lister()).toEqual([{
      fournisseur: 'webdav',
      id,
      urlServeur: 'https://nuage.example.org/corpus',
      utilisateur: 'max',
      motDePasseChiffre: chiffreur.chiffre('secret-webdav'),
    }])
    expect(coffre.motDePasse(id)).toBe('secret-webdav')
    expect(JSON.parse(readFileSync(fichier, 'utf8'))).toMatchObject({
      formatVersion: 6,
      destinationsGitLab: {},
      basesMedia: {},
    })
  })

  test('migre les comptes OAuth du format 5', () => {
    const fichier = join(mkdtempSync(join(tmpdir(), 'sonal-coffre-v5-')), 'comptes.json')
    const idCompte = idDeCompteGitLab('https://gitlab.example.org', 'max')
    const acces = credential()
    writeFileSync(fichier, JSON.stringify({
      formatVersion: 5,
      comptes: {
        [idCompte]: {
          fournisseur: 'gitlab',
          id: idCompte,
          urlInstance: 'https://gitlab.example.org',
          utilisateur: 'max',
          oauth: {
            accessTokenChiffre: chiffreur.chiffre(acces.accessToken),
            refreshTokenChiffre: chiffreur.chiffre(acces.refreshToken),
            expiresAt: acces.expiresAt,
            scopes: acces.scopes,
            rotationneeLe: acces.rotationneeLe,
          },
        },
      },
      destinationsGitLab: {},
      basesMedia: {},
    }))

    const coffre = new CoffreComptes(fichier, chiffreur)

    expect(coffre.listerComptesGitLab()[0].authentification).toBe('oauth')
    expect(coffre.credentialOAuthGitLab(idCompte)?.accessToken).toBe('access-secret')
    expect(JSON.parse(readFileSync(fichier, 'utf8')).formatVersion).toBe(6)
  })

  test('migre un ancien jeton d’accès personnel sans perdre ses destinations', () => {
    const fichier = join(mkdtempSync(join(tmpdir(), 'sonal-coffre-pat-')), 'comptes.json')
    const idCompte = idDeCompteGitLab('https://gitlab.example.org', 'max')
    const idDestination = 'sha256-destination-historique'
    writeFileSync(fichier, JSON.stringify({
      formatVersion: 3,
      comptes: {
        [idCompte]: {
          fournisseur: 'gitlab',
          id: idCompte,
          urlInstance: 'https://gitlab.example.org',
          utilisateur: 'max',
          jetonChiffre: chiffreur.chiffre('glpat-heritage'),
        },
      },
      destinationsGitLab: {
        [idDestination]: {
          fournisseur: 'gitlab',
          id: idDestination,
          compteId: idCompte,
          projetId: 42,
          nomProjet: 'Corpus pilote',
          branche: 'main',
          racine: '',
        },
      },
    }))

    const coffre = new CoffreComptes(fichier, chiffreur)

    const compte = coffre.listerComptesGitLab()[0]
    expect(compte).toMatchObject({
      id: idCompte,
      authentification: 'jeton-personnel',
    })
    expect(compte).not.toHaveProperty('jetonChiffre')
    expect(coffre.listerDestinationsGitLab()).toHaveLength(1)
    expect(coffre.credentialOAuthGitLab(compte.id)).toBeNull()
    expect(coffre.jetonPersonnelGitLab(compte.id)).toBe('glpat-heritage')

    const persiste = readFileSync(fichier, 'utf8')
    expect(persiste).not.toContain('glpat-heritage')
    expect(persiste).not.toContain('"jetonChiffre"')
    expect(JSON.parse(persiste)).toMatchObject({
      formatVersion: 6,
      comptes: { [idCompte]: { jetonPersonnelChiffre: expect.any(String) } },
    })
  })

  test('calcule un compte stable sans dépendre du credential', () => {
    expect(idDeCompteGitLab('https://gitlab.example.org/', 'max')).toBe(
      idDeCompteGitLab('https://GITLAB.example.org:443', ' max '),
    )
  })
})

describe('coffre — base média locale d\'une destination GitLab', () => {
  const chiffreur: Chiffreur = {
    disponible: () => true,
    chiffre: (clair) => `chiffre:${Buffer.from(clair).toString('base64')}`,
    dechiffre: (secret) => Buffer.from(secret.slice('chiffre:'.length), 'base64').toString(),
  }

  function coffreAvecDestination() {
    const fichier = join(mkdtempSync(join(tmpdir(), 'sonal-coffre-media-')), 'comptes.json')
    const coffre = new CoffreComptes(fichier, chiffreur)
    const compte = coffre.enregistrerCompteGitLab({
      urlInstance: 'https://gitlab.example.org',
      utilisateur: 'max',
      credential: credential(),
    })
    const destination = coffre.enregistrerDestinationGitLab({
      compteId: compte.id,
      projetId: 42,
      nomProjet: 'Corpus pilote',
      branche: 'équipe/pilote',
      racine: 'donnees/corpus-a',
    })
    return { fichier, coffre, destination }
  }

  test('la base est rattachée à sa destination et chiffrée comme un secret', () => {
    const { fichier, coffre, destination } = coffreAvecDestination()

    const base = coffre.enregistrerBaseMedia({
      destinationGitLabId: destination.id,
      urlBase: 'https://nuage.example.org/remote.php/dav/files/max/CorpusPartage/',
      utilisateur: 'max',
      motDePasse: 'mot-de-passe-application',
    })

    expect(base).toMatchObject({
      destinationGitLabId: destination.id,
      urlBase: 'https://nuage.example.org/remote.php/dav/files/max/CorpusPartage',
      utilisateur: 'max',
    })
    expect(coffre.motDePasseBaseMedia(destination.id)).toBe('mot-de-passe-application')
    const persiste = readFileSync(fichier, 'utf8')
    expect(persiste).not.toContain('mot-de-passe-application')
    expect(JSON.parse(persiste)).toMatchObject({
      formatVersion: 6,
      basesMedia: { [destination.id]: { utilisateur: 'max' } },
    })
  })

  test('une base n\'est ni un compte WebDAV ni une destination', () => {
    const { coffre, destination } = coffreAvecDestination()
    const base = coffre.enregistrerBaseMedia({
      destinationGitLabId: destination.id,
      urlBase: 'https://nuage.example.org/remote.php/dav/files/max/CorpusPartage',
      utilisateur: 'max',
      motDePasse: 'secret',
    })

    // Le dossier partagé ne doit jamais être proposé à l'ouverture d'un corpus.
    expect(coffre.lister()).toEqual([])
    expect(coffre.listerDestinationsGitLab()).toEqual([
      expect.objectContaining({ id: destination.id, fournisseur: 'gitlab' }),
    ])
    expect(base).not.toHaveProperty('fournisseur')
  })

  test('une destination inconnue ne peut pas recevoir de base', () => {
    const { coffre } = coffreAvecDestination()

    expect(() =>
      coffre.enregistrerBaseMedia({
        destinationGitLabId: 'sha256-destination-inexistante',
        urlBase: 'https://nuage.example.org/dav',
        utilisateur: 'max',
        motDePasse: 'secret',
      }),
    ).toThrow('Destination GitLab inconnue')
    expect(coffre.baseMedia('sha256-destination-inexistante')).toBeNull()
  })

  test.each([
    ['une adresse HTTP distante', 'http://nuage.example.org/dav', 'secret'],
    ['des identifiants dans l’adresse', 'https://max:secret@nuage.example.org/dav', 'secret'],
    ['un secret vide', 'https://nuage.example.org/dav', ''],
  ])('refuse directement %s', (_cas, urlBase, motDePasse) => {
    const { coffre, destination } = coffreAvecDestination()

    expect(() => coffre.enregistrerBaseMedia({
      destinationGitLabId: destination.id,
      urlBase,
      utilisateur: 'max',
      motDePasse,
    })).toThrow()
    expect(coffre.baseMedia(destination.id)).toBeNull()
  })

  test('le secret d\'une base ne se confond pas avec celui d\'un compte', () => {
    const { coffre, destination } = coffreAvecDestination()
    const compteWebdav = coffre.enregistrer({
      urlServeur: 'https://nuage.example.org/remote.php/dav/files/max/MonCorpus',
      utilisateur: 'max',
      motDePasse: 'secret-corpus',
    })
    coffre.enregistrerBaseMedia({
      destinationGitLabId: destination.id,
      urlBase: 'https://nuage.example.org/remote.php/dav/files/max/CorpusPartage',
      utilisateur: 'max',
      motDePasse: 'secret-media',
    })

    expect(coffre.motDePasseBaseMedia(destination.id)).toBe('secret-media')
    expect(coffre.motDePasse(compteWebdav.id)).toBe('secret-corpus')
  })

  test('oublier la destination emporte sa base, pas le compte GitLab', () => {
    const { coffre, destination } = coffreAvecDestination()
    coffre.enregistrerBaseMedia({
      destinationGitLabId: destination.id,
      urlBase: 'https://nuage.example.org/remote.php/dav/files/max/CorpusPartage',
      utilisateur: 'max',
      motDePasse: 'secret-media',
    })

    coffre.oublierDestinationGitLab(destination.id)

    expect(coffre.baseMedia(destination.id)).toBeNull()
    expect(coffre.motDePasseBaseMedia(destination.id)).toBeNull()
    expect(coffre.listerComptesGitLab()).toHaveLength(1)
  })

  test('sans stockage sécurisé, le secret reste en session et rien n\'est écrit', () => {
    const fichier = join(mkdtempSync(join(tmpdir(), 'sonal-coffre-media-')), 'comptes.json')
    const faible: Chiffreur = {
      disponible: () => false,
      chiffre: (clair) => `chiffre:${Buffer.from(clair).toString('base64')}`,
      dechiffre: (secret) => Buffer.from(secret.slice('chiffre:'.length), 'base64').toString(),
    }
    const coffre = new CoffreComptes(fichier, faible)
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

    coffre.enregistrerBaseMedia({
      destinationGitLabId: destination.id,
      urlBase: 'https://nuage.example.org/dav',
      utilisateur: 'max',
      motDePasse: 'secret-media',
    })

    expect(coffre.motDePasseBaseMedia(destination.id)).toBe('secret-media')
    expect(readFileSync(fichier, 'utf8')).not.toContain('secret-media')
    expect(coffre.baseMedia(destination.id)).not.toHaveProperty('motDePasseChiffre')
  })
})
