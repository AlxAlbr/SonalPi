import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref, type EffectScope } from 'vue'
import {
  useProjetGitLab,
  type ApiGitLabTestable,
} from '../src/renderer/composables/corpus/useProjetGitLab'
import type {
  ApiGitLab,
  ConnexionGitLabPublique,
  ProjetGitLabPrepare,
} from '../src/shared/gitlab'

const projet: ProjetGitLabPrepare = {
  compteId: 'compte-1',
  urlInstance: 'https://gitlab.example.org',
  utilisateur: 'moi',
  projetId: 42,
  nomProjet: 'Corpus',
  branche: 'terrain',
}

function connexion(etat: Partial<ConnexionGitLabPublique> = {}): ConnexionGitLabPublique {
  return {
    urlInstance: 'https://gitlab.example.org',
    applicationConnue: true,
    uriCallback: 'http://127.0.0.1:7474/callback',
    comptes: [{
      id: 'compte-1',
      urlInstance: 'https://gitlab.example.org',
      utilisateur: 'moi',
      connecte: true,
      aRafraichir: false,
      scopes: ['read_api'],
    }],
    ...etat,
  }
}

const scopes: EffectScope[] = []
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
})

function api(
  surcharges: Partial<ApiGitLabTestable> = {},
): ApiGitLabTestable {
  return {
    detecterInstance: vi.fn(async () => 'https://gitlab.example.org'),
    etat: vi.fn(async () => connexion()),
    connecter: vi.fn(async () => connexion()),
    deconnecter: vi.fn(async () => connexion({
      comptes: [{ ...connexion().comptes[0], connecte: false }],
    })),
    ...surcharges,
  }
}

function formulaire(
  apiGitLab: ApiGitLabTestable = api(),
  preparerProjet: ApiGitLab['preparerProjet'] = vi.fn(async () => projet),
) {
  const scope = effectScope()
  scopes.push(scope)
  const etat = { enCours: ref(false), erreur: ref<string | null>(null) }
  const champs = scope.run(() => useProjetGitLab(etat, apiGitLab, preparerProjet))!
  champs.urlProjet.value = '  https://gitlab.example.org/groupe/corpus  '
  return { ...champs, ...etat, api: apiGitLab, preparerProjet, scope }
}

describe('formulaire partagé de projet GitLab', () => {
  it('détecte l’instance, reprend le compte connecté et prépare la demande', async () => {
    const f = formulaire()
    expect(f.demande.value).toBeNull()
    await f.detecter()
    expect(f.api.detecterInstance).toHaveBeenCalledExactlyOnceWith(
      'https://gitlab.example.org/groupe/corpus',
    )
    expect(f.instance.value).toBe('https://gitlab.example.org')
    expect(f.compteChoisi.value).toBe('compte-1')

    await f.charger()
    expect(f.preparerProjet).toHaveBeenCalledExactlyOnceWith({
      urlProjet: 'https://gitlab.example.org/groupe/corpus',
      compteId: 'compte-1',
    })
    expect(f.projet.value).toEqual(projet)
    expect(f.demande.value).toEqual({ ...projet, racine: '' })
    expect(f.erreur.value).toBeNull()
    expect(f.enCours.value).toBe(false)
    f.racine.value = ' donnees/corpus '
    expect(f.demande.value?.racine).toBe('donnees/corpus')
    expect(f.preparerProjet).toHaveBeenCalledTimes(1)
  })

  it('enchaîne détection, OAuth et vérification depuis une seule action', async () => {
    const sansCompte = connexion({ applicationConnue: false, comptes: [] })
    const f = formulaire(api({
      etat: vi.fn()
        .mockResolvedValueOnce(sansCompte)
        .mockResolvedValueOnce(connexion()),
      connecter: vi.fn(async () => connexion()),
    }))
    f.clientId.value = ' client-sonal '

    await expect(f.charger()).resolves.toBe(true)

    expect(f.api.detecterInstance).toHaveBeenCalledOnce()
    expect(f.api.connecter).toHaveBeenCalledExactlyOnceWith(
      'https://gitlab.example.org',
      'client-sonal',
    )
    expect(f.preparerProjet).toHaveBeenCalledExactlyOnceWith({
      urlProjet: 'https://gitlab.example.org/groupe/corpus',
      compteId: 'compte-1',
    })
    expect(f.demande.value).toEqual({ ...projet, racine: '' })
  })

  it('connecte dans le navigateur avec le client id saisi, sans jamais de jeton', async () => {
    const f = formulaire()
    await f.detecter()
    f.clientId.value = ' client-sonal '

    await f.connecter()

    expect(f.api.connecter).toHaveBeenCalledExactlyOnceWith(
      'https://gitlab.example.org',
      'client-sonal',
    )
    expect(f.clientId.value).toBe('')
    expect(f.compteChoisi.value).toBe('compte-1')
  })

  it('signale une instance sans application Sonal et n’ouvre pas le navigateur', async () => {
    const f = formulaire()
    await f.detecter()
    f.connexion.value = connexion({ applicationConnue: false, comptes: [] })
    f.compteChoisi.value = null

    await f.charger()

    expect(f.api.connecter).not.toHaveBeenCalled()
    expect(f.preparerProjet).not.toHaveBeenCalled()
    expect(f.demande.value).toBeNull()
    expect(f.erreur.value).toMatch(/Client ID/)
  })

  it('déconnecte le compte courant et invalide le projet préparé', async () => {
    const f = formulaire()
    await f.detecter()
    await f.charger()

    await f.deconnecter()

    expect(f.api.deconnecter).toHaveBeenCalledExactlyOnceWith(
      'https://gitlab.example.org',
      'moi',
    )
    expect(f.projet.value).toBeNull()
    expect(f.demande.value).toBeNull()
  })

  it('invalide immédiatement le projet quand l’adresse ou l’instance change', async () => {
    const f = formulaire()
    await f.detecter()
    await f.charger()
    f.urlProjet.value += '-autre'
    expect(f.projet.value).toBeNull()
    expect(f.demande.value).toBeNull()
  })

  it('efface la précédente préparation avant un rechargement qui échoue', async () => {
    const preparer = vi.fn<ApiGitLab['preparerProjet']>()
      .mockResolvedValueOnce(projet)
      .mockRejectedValueOnce(new Error('Projet inaccessible.'))
    const f = formulaire(api(), preparer)
    await f.detecter()
    await f.charger()
    const attente = f.charger()
    expect(f.demande.value).toBeNull()
    expect(f.enCours.value).toBe(true)
    expect(f.chargement.value).toBe(true)
    await attente
    expect(f.demande.value).toBeNull()
    expect(f.erreur.value).toBe('Projet inaccessible.')
    expect(f.enCours.value).toBe(false)
    expect(f.chargement.value).toBe(false)
  })

  it('ignore une réponse devenue obsolète et permet ensuite un nouveau chargement', async () => {
    const attente = Promise.withResolvers<ProjetGitLabPrepare>()
    const preparer = vi.fn<ApiGitLab['preparerProjet']>()
      .mockReturnValueOnce(attente.promise)
      .mockResolvedValueOnce({ ...projet, projetId: 84 })
    const f = formulaire(api(), preparer)
    await f.detecter()
    const chargement = f.charger()
    f.urlProjet.value = 'https://gitlab.example.org/groupe/autre'
    attente.resolve(projet)
    await chargement
    expect(f.demande.value).toBeNull()
    expect(f.enCours.value).toBe(false)
    f.compteChoisi.value = 'compte-1'
    await f.charger()
    expect(f.demande.value?.projetId).toBe(84)
  })

  it('ignore aussi une erreur devenue obsolète après changement d’instance', async () => {
    const attente = Promise.withResolvers<ProjetGitLabPrepare>()
    const f = formulaire(api(), () => attente.promise)
    await f.detecter()
    const chargement = f.charger()
    f.instance.value = 'https://autre.example.org'
    attente.reject(new Error('Ancienne connexion refusée.'))
    await chargement
    expect(f.erreur.value).toBeNull()
    expect(f.demande.value).toBeNull()
  })

  it('ne lance pas de chargements concurrents', async () => {
    const attente = Promise.withResolvers<ProjetGitLabPrepare>()
    const preparer = vi.fn(() => attente.promise)
    const f = formulaire(api(), preparer)
    await f.detecter()
    const chargement = f.charger()
    await f.charger()
    expect(preparer).toHaveBeenCalledTimes(1)
    attente.resolve(projet)
    await chargement
  })

  it('ne charge rien sans adresse de projet ni compte connecté', async () => {
    const f = formulaire()
    await f.detecter()
    await f.charger()
    expect(f.preparerProjet).toHaveBeenCalledTimes(1)

    f.urlProjet.value = ''
    await f.charger()
    f.compteChoisi.value = null
    await f.charger()
    expect(f.preparerProjet).toHaveBeenCalledTimes(1)
    expect(f.enCours.value).toBe(false)
  })

  it('ne charge rien pendant une autre opération du formulaire', async () => {
    const f = formulaire()
    await f.detecter()
    f.enCours.value = true
    await f.charger()
    expect(f.preparerProjet).not.toHaveBeenCalled()
    expect(f.enCours.value).toBe(true)
  })

  it('ignore une réponse tardive après destruction du formulaire', async () => {
    const attente = Promise.withResolvers<ProjetGitLabPrepare>()
    const f = formulaire(api(), () => attente.promise)
    await f.detecter()
    const chargement = f.charger()
    f.scope.stop()
    attente.resolve(projet)
    await chargement
    expect(f.projet.value).toBeNull()
  })

  it('affiche le refus d’une connexion annulée sans vider l’instance', async () => {
    const refuser = vi.fn(async () => {
      throw new Error('Connexion GitLab annulée.')
    })
    const f = formulaire(api({ connecter: refuser }))
    await f.detecter()

    await f.connecter()

    expect(f.erreur.value).toBe('Connexion GitLab annulée.')
    expect(f.instance.value).toBe('https://gitlab.example.org')
    expect(f.connexionEnCours.value).toBe(false)
  })
})
