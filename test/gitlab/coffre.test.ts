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
    expect(JSON.parse(persiste)).toMatchObject({ formatVersion: 4 })

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
      formatVersion: 4,
      destinationsGitLab: {},
    })
  })

  test('purge le jeton d’accès personnel sans perdre comptes ni destinations', () => {
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
    expect(compte.id).toBe(idCompte)
    expect(compte).not.toHaveProperty('jetonChiffre')
    expect(coffre.listerDestinationsGitLab()).toHaveLength(1)
    expect(coffre.credentialOAuthGitLab(compte.id)).toBeNull()

    const persiste = readFileSync(fichier, 'utf8')
    expect(persiste).not.toContain('glpat-heritage')
    expect(persiste).not.toContain('jetonChiffre')
    expect(JSON.parse(persiste)).toMatchObject({ formatVersion: 4 })
  })

  test('calcule un compte stable sans dépendre du credential', () => {
    expect(idDeCompteGitLab('https://gitlab.example.org/', 'max')).toBe(
      idDeCompteGitLab('https://GITLAB.example.org:443', ' max '),
    )
  })
})
