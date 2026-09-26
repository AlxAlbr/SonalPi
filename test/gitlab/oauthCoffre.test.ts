/**
 *  Stockage et rotation des credentials OAuth GitLab.
 *  Un refresh token consommé ou révoqué ne doit jamais être réémis par une
 *  seconde tentative concurrente, et rien de lisible ne doit subsister sur
 *  disque quand le trousseau du poste est disponible.
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import {
  CoffreComptes,
  type Chiffreur,
} from '../../src/main/distant/coffre'
import { ClientOAuthGitLab, ErreurOAuthGitLab } from '../../src/main/gitlab/oauth/clientOAuth'
import type { CredentialOAuthGitLab } from '../../src/main/gitlab/oauth/credential'
import { GestionnaireCredentialsGitLab } from '../../src/main/gitlab/oauth/credentialProvider'

const chiffreur: Chiffreur = {
  disponible: () => true,
  chiffre: (clair) => `chiffre:${Buffer.from(clair).toString('base64')}`,
  dechiffre: (secret) => {
    // Comme le vrai chiffreur : une valeur sans préfixe n'est pas déchiffrable.
    if (!secret.startsWith('chiffre:')) throw new Error('secret illisible')
    return Buffer.from(secret.slice('chiffre:'.length), 'base64').toString()
  },
}

function coffreAvec(): { coffre: CoffreComptes; fichier: string } {
  const fichier = join(mkdtempSync(join(tmpdir(), 'sonal-oauth-')), 'comptes-distant.json')
  const coffre = new CoffreComptes(fichier, chiffreur)
  coffre.enregistrerCompteGitLab({
    urlInstance: 'https://gitlab.example.org',
    utilisateur: 'max',
    credential: credential(),
  })
  return { coffre, fichier }
}

function credential(surcharge: Partial<CredentialOAuthGitLab> = {}): CredentialOAuthGitLab {
  return {
    accessToken: 'access-secret',
    refreshToken: 'refresh-secret',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['api'],
    rotationneeLe: Date.now(),
    ...surcharge,
  }
}

function gestionnaire(
  coffre: CoffreComptes,
  rafraichir: (refreshToken: string) => Promise<CredentialOAuthGitLab>,
  revoquer: (accessToken: string) => Promise<boolean> = async () => true,
): GestionnaireCredentialsGitLab {
  return new GestionnaireCredentialsGitLab({
    coffre,
    clientOAuth: (urlInstance) => {
      expect(urlInstance).toBe('https://gitlab.example.org')
      return {
        rafraichir: async (refreshToken: string) => rafraichir(refreshToken),
        revoquer: async (accessToken: string) => revoquer(accessToken),
      } as unknown as ClientOAuthGitLab
    },
  })
}

describe('coffre des credentials OAuth', () => {
  test('chiffre les deux tokens, indices de destination compris', () => {
    const { coffre, fichier } = coffreAvec()
    const compte = coffre.listerComptesGitLab()[0]
    coffre.memoriserCredentialOAuthGitLab(compte.id, credential())

    expect(coffre.credentialOAuthGitLab(compte.id)).toMatchObject({
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
      scopes: ['api'],
    })
    expect(coffre.credentialOAuthGitLabDisponible(compte.id)).toBe(true)
    const persiste = readFileSync(fichier, 'utf8')
    expect(persiste).not.toContain('access-secret')
    expect(persiste).not.toContain('refresh-secret')
    // Oublier la destination ne touche pas au credential du compte.
    expect(coffre.credentialOAuthGitLab(compte.id)?.refreshToken).toBe('refresh-secret')
  })

  test('sans stockage sécurisé, le credential reste en mémoire seulement', () => {
    const fichier = join(mkdtempSync(join(tmpdir(), 'sonal-oauth-sans-trousseau-')), 'comptes.json')
    const sansSecurite: Chiffreur = { ...chiffreur, disponible: () => false }
    const coffre = new CoffreComptes(fichier, sansSecurite)
    const compte = coffre.enregistrerCompteGitLab({
      urlInstance: 'https://gitlab.example.org',
      utilisateur: 'max',
      credential: credential(),
    })

    expect(coffre.credentialOAuthGitLab(compte.id)?.accessToken).toBe('access-secret')
    expect(readFileSync(fichier, 'utf8')).not.toContain('access-secret')
  })

  test('un credential illisible est traité comme absent', () => {
    const { fichier } = coffreAvec()
    const relu = new CoffreComptes(fichier, chiffreur)
    const compte = relu.listerComptesGitLab()[0]
    const fichierLu = JSON.parse(readFileSync(fichier, 'utf8')) as {
      comptes: Record<string, { oauth?: { accessTokenChiffre: string } }>
    }
    fichierLu.comptes[compte.id].oauth = {
      accessTokenChiffre: 'b64:illisible',
      refreshTokenChiffre: 'b64:illisible',
      expiresAt: Date.now() + 1000,
      scopes: [],
      rotationneeLe: Date.now(),
    }
    writeFileSync(fichier, JSON.stringify(fichierLu), 'utf8')
    const reluApres = new CoffreComptes(fichier, chiffreur)
    reluApres.assainirSecretsPersistes()

    expect(reluApres.credentialOAuthGitLab(compte.id)).toBeNull()
    expect(readFileSync(fichier, 'utf8')).not.toContain('illisible')
  })

  test('oublier un credential laisse les destinations en place', () => {
    const { coffre } = coffreAvec()
    const compte = coffre.listerComptesGitLab()[0]
    coffre.memoriserCredentialOAuthGitLab(compte.id, credential())
    coffre.enregistrerDestinationGitLab({
      compteId: compte.id,
      projetId: 42,
      nomProjet: 'Corpus pilote',
      branche: 'main',
    })

    coffre.oublierCredentialOAuthGitLab(compte.id)

    expect(coffre.credentialOAuthGitLab(compte.id)).toBeNull()
    expect(coffre.listerDestinationsGitLab()).toHaveLength(1)
    expect(coffre.listerComptesGitLab()).toHaveLength(1)
  })
})

describe('renouvellement du credential', () => {
  test('un credential valide n’appelle pas l’instance', async () => {
    const { coffre } = coffreAvec()
    const compte = coffre.listerComptesGitLab()[0]
    coffre.memoriserCredentialOAuthGitLab(compte.id, credential())
    const rafraichir = vi.fn()

    const obtenu = await gestionnaire(coffre, rafraichir).credential(compte.id)

    expect(rafraichir).not.toHaveBeenCalled()
    expect(obtenu?.accessToken).toBe('access-secret')
  })

  test('un token périmé est renouvelé puis persisté', async () => {
    const { coffre } = coffreAvec()
    const compte = coffre.listerComptesGitLab()[0]
    coffre.memoriserCredentialOAuthGitLab(compte.id, credential({
      expiresAt: Date.now() - 1,
    }))

    const obtenu = await gestionnaire(coffre, async () => credential({
      accessToken: 'access-roté',
      refreshToken: 'refresh-roté',
    })).credential(compte.id)

    expect(obtenu).toMatchObject({ accessToken: 'access-roté', refreshToken: 'refresh-roté' })
    expect(coffre.credentialOAuthGitLab(compte.id)?.refreshToken).toBe('refresh-roté')
  })

  test('des appels concurrents ne consomment le refresh token qu’une fois', async () => {
    const { coffre } = coffreAvec()
    const compte = coffre.listerComptesGitLab()[0]
    coffre.memoriserCredentialOAuthGitLab(compte.id, credential({ expiresAt: Date.now() - 1 }))
    let appels = 0
    const rafraichir = vi.fn(async () => {
      appels += 1
      await new Promise((resolve) => setTimeout(resolve, 5))
      return credential({ accessToken: 'access-roté' })
    })
    const gestionnairePartage = gestionnaire(coffre, rafraichir)

    const resultats = await Promise.all([
      gestionnairePartage.credential(compte.id),
      gestionnairePartage.credential(compte.id),
      gestionnairePartage.credential(compte.id),
    ])

    expect(appels).toBe(1)
    expect(rafraichir).toHaveBeenCalledTimes(1)
    for (const resultat of resultats) expect(resultat?.accessToken).toBe('access-roté')
  })

  test('un refresh refusé retire le credential et ne le rejoue pas', async () => {
    const { coffre } = coffreAvec()
    const compte = coffre.listerComptesGitLab()[0]
    coffre.memoriserCredentialOAuthGitLab(compte.id, credential({ expiresAt: Date.now() - 1 }))
    const refus = vi.fn(async () => {
      throw new ErreurOAuthGitLab('refus-instance', 'La demande a expiré ou a déjà été utilisée.')
    })
    const gestionnairePartage = gestionnaire(coffre, refus)

    const erreurs = await Promise.all([
      gestionnairePartage.credential(compte.id).catch((e) => e),
      gestionnairePartage.credential(compte.id).catch((e) => e),
    ])

    expect(refus).toHaveBeenCalledTimes(1)
    for (const erreur of erreurs) expect(erreur).toBeInstanceOf(ErreurOAuthGitLab)
    expect(coffre.credentialOAuthGitLab(compte.id)).toBeNull()
    // L'état est « non connecté » : les destinations restent utilisables.
    expect(coffre.listerDestinationsGitLab()).toHaveLength(0)
  })

  test('un incident réseau conserve le credential pour une tentative ultérieure', async () => {
    const { coffre } = coffreAvec()
    const compte = coffre.listerComptesGitLab()[0]
    coffre.memoriserCredentialOAuthGitLab(compte.id, credential({ expiresAt: Date.now() - 1 }))

    await expect(gestionnaire(coffre, async () => {
      throw new ErreurOAuthGitLab('reseau', 'L’instance GitLab est injoignable.')
    }).credential(compte.id)).rejects.toMatchObject({ raison: 'reseau' })

    expect(coffre.credentialOAuthGitLab(compte.id)?.refreshToken).toBe('refresh-secret')
  })
})

describe('déconnexion', () => {
  test('révoque chez l’instance puis efface le credential local', async () => {
    const { coffre } = coffreAvec()
    const compte = coffre.listerComptesGitLab()[0]
    coffre.memoriserCredentialOAuthGitLab(compte.id, credential())
    const revoquer = vi.fn(async () => true)

    await expect(gestionnaire(coffre, async () => credential(), revoquer).deconnecter(compte.id))
      .resolves.toBe(true)

    expect(revoquer).toHaveBeenCalledWith('access-secret')
    expect(coffre.credentialOAuthGitLab(compte.id)).toBeNull()
  })

  test('une révocation refusée par l’instance n’empêche pas l’effacement local', async () => {
    const { coffre } = coffreAvec()
    const compte = coffre.listerComptesGitLab()[0]
    coffre.memoriserCredentialOAuthGitLab(compte.id, credential())

    await expect(gestionnaire(coffre, async () => credential(), async () => false)
      .deconnecter(compte.id)).resolves.toBe(false)

    expect(coffre.credentialOAuthGitLab(compte.id)).toBeNull()
  })
})
