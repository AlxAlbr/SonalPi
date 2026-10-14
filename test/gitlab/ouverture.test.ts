import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  CoffreComptes,
  idDeCompteGitLab,
  idDeDestinationGitLab,
  type Chiffreur,
  type ConfigDestinationGitLab,
} from '../../src/main/distant/coffre'
import { ContexteGitLab } from '../../src/main/gitlab/contexte'
import { ServiceAuthentificationGitLab } from '../../src/main/gitlab/authentification'
import { InstancesGitLab } from '../../src/main/gitlab/oauth/instances'
import { ClientGitLab, type AutorisationGitLab } from '../../src/main/gitlab/client'
import type { CredentialOAuthGitLab } from '../../src/main/gitlab/oauth/credential'
import {
  ServiceOuvertureGitLab,
  type OptionsServiceOuvertureGitLab,
  type PreparationOuvertureGitLab,
} from '../../src/main/gitlab/ouverture'
import { JournalPublicationGitLab } from '../../src/main/gitlab/journalPublication'
import { JournalSessionsGitLab } from '../../src/main/gitlab/journalSession'
import { squeletteCorpus } from '../../src/shared/corpus/squelette'
import type { DemandeCreationGitLab, DemandeOuvertureGitLab } from '../../src/shared/gitlab'
import {
  corpusDistantValide,
  entretienDistantValide,
} from '../webdav/fixturesCorpusDistant'

const chiffreur: Chiffreur = {
  disponible: () => true,
  chiffre: (clair) => `chiffre:${Buffer.from(clair).toString('base64')}`,
  dechiffre: (secret) => Buffer.from(secret.slice('chiffre:'.length), 'base64').toString(),
}

const URL_INSTANCE = 'https://gitlab.example.org'
const COMPTE_ID = idDeCompteGitLab(URL_INSTANCE, 'max')

const demande: DemandeOuvertureGitLab = {
  compteId: COMPTE_ID,
  urlInstance: URL_INSTANCE,
  utilisateur: 'max',
  projetId: 42,
  nomProjet: 'Corpus pilote',
  branche: 'equipe/terrain',
}
const demandeCreation: DemandeCreationGitLab = {
  ...demande,
  nomCorpus: 'Enquête 2026',
}

/** Préparation factice : seuls les champs réellement lus par l'installation comptent. */
function preparationFactice(
  destination: ConfigDestinationGitLab,
  dirProfil: string,
): PreparationOuvertureGitLab {
  const dirMiroir = join(dirProfil, 'miroirs', destination.id)
  return {
    contexte: {
      id: destination.id,
      store: { marque: destination.id },
      dirLocal: dirMiroir,
    } as unknown as ContexteGitLab,
    corpus: squeletteCorpus(`Corpus ${destination.nomProjet}`),
    dirMiroir,
  }
}

function preparerFactice(
  dirProfil: string,
  observé?: (
    compte: { utilisateur: string },
    destination: ConfigDestinationGitLab,
    autorisation: AutorisationGitLab,
  ) => void,
): NonNullable<OptionsServiceOuvertureGitLab['preparer']> {
  return async (compte, destination, autorisation) => {
    observé?.(compte, destination, autorisation)
    return preparationFactice(destination, dirProfil)
  }
}

/** Connexion déjà établie : le compte existe au coffre avec son credential. */
function connecterCompte(coffre: CoffreComptes, utilisateur = 'max'): string {
  return coffre.enregistrerCompteGitLab({
    urlInstance: URL_INSTANCE,
    utilisateur,
    credential: credentialOAuth(),
  }).id
}

/** Service d'authentification sans connexion possible : seul le client est utile. */
function authentificationFactice(
  coffre: CoffreComptes,
  fetchImpl?: typeof fetch,
): ServiceAuthentificationGitLab {
  const instances = new InstancesGitLab(
    join(mkdtempSync(join(tmpdir(), 'sonal-gitlab-instances-')), 'instances.json'),
  )
  // Un renouvellement doit pouvoir s'adresser à l'instance.
  instances.declarer(URL_INSTANCE, 'client-de-test')
  return new ServiceAuthentificationGitLab({
    coffre,
    instances,
    ouvrirNavigateur: () => {
      throw new Error('aucune connexion attendue dans ce test')
    },
    ...(fetchImpl ? { fetchImpl } : {}),
  })
}

function credentialOAuth(surcharge: Partial<CredentialOAuthGitLab> = {}): CredentialOAuthGitLab {
  return {
    accessToken: 'access-oauth',
    refreshToken: 'refresh-oauth',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['api'],
    rotationneeLe: Date.now(),
    ...surcharge,
  }
}

/** Banc d'orchestration : vrai coffre, préparation remplaçable, effets espionnés. */
function bancOuverture(
  options: Partial<OptionsServiceOuvertureGitLab> = {},
): {
  service: ServiceOuvertureGitLab
  coffre: CoffreComptes
  dirProfil: string
  traces: string[]
  installées: { destination: ConfigDestinationGitLab; preparation: PreparationOuvertureGitLab }[]
} {
  const dirProfil = mkdtempSync(join(tmpdir(), 'sonal-gitlab-ouverture-'))
  const coffre = new CoffreComptes(join(dirProfil, 'comptes-distant.json'), chiffreur)
  const traces: string[] = []
  const installées: { destination: ConfigDestinationGitLab; preparation: PreparationOuvertureGitLab }[] = []
  const service = new ServiceOuvertureGitLab({
    coffre,
    authentification: authentificationFactice(coffre, options.fetchImpl),
    dirProfil,
    identiteSession: { machineId: 'poste-test', sessionId: 'session-test' },
    fermerContexte: async () => {
      traces.push('fermer')
    },
    installer: (destination, preparation) => {
      traces.push('installer')
      installées.push({ destination, preparation })
    },
    ...options,
  })
  return { service, coffre, dirProfil, traces, installées }
}

function enregistrerDestination(
  coffre: CoffreComptes,
  demandeLocale: DemandeOuvertureGitLab = demande,
  racine = '',
): ConfigDestinationGitLab {
  const compteId = connecterCompte(coffre, demandeLocale.utilisateur)
  return coffre.enregistrerDestinationGitLab({
    compteId,
    projetId: demandeLocale.projetId,
    nomProjet: demandeLocale.nomProjet,
    branche: demandeLocale.branche,
    racine,
  })
}

/** Dépôt GitLab simulé : lectures à SHA fixé, publications observées. */
interface DepotFactice {
  fichiers: Record<string, string>
  branche: string
  commit: string
  /** Commits visibles par la recherche de réconciliation. */
  commits?: Array<{ id: string; title: string }>
  /** Statut HTTP renvoyé aux publications ; 201 sinon. */
  refusPublier?: number
  /** Coupe le réseau sur la recherche de commits (résultat indéterminé). */
  couperRecherche?: boolean
  requetes: { url: URL; init?: RequestInit }[]
}

function fetchGitLabFactice(depot: DepotFactice): typeof fetch {
  const reponseJson = (valeur: unknown) =>
    new Response(JSON.stringify(valeur), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  return (async (entree: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(entree))
    depot.requetes.push({ url, init })
    const chemin = decodeURIComponent(url.pathname)
    if (chemin.includes('/repository/commits')) {
      if (init?.method === 'POST') {
        if (depot.refusPublier) return new Response('refusé', { status: depot.refusPublier })
        return reponseJson({ id: depot.commit })
      }
      if (depot.couperRecherche) throw new Error('réseau coupé')
      return reponseJson(depot.commits ?? [])
    }
    if (chemin.includes('/repository/branches/')) {
      return reponseJson({ commit: { id: depot.commit } })
    }
    if (chemin.includes('/repository/tree')) {
      // Inventaire non récursif, comme GitLab : enfants directs seulement.
      const dossier = url.searchParams.get('path') ?? ''
      const prefixe = dossier ? `${dossier}/` : ''
      const entrees: { id: string; name: string; type: string; path: string; mode: string }[] = []
      const vus = new Set<string>()
      for (const fichier of Object.keys(depot.fichiers)) {
        if (prefixe && !fichier.startsWith(prefixe)) continue
        const reste = fichier.slice(prefixe.length)
        const intermediaire = reste.includes('/')
        const nom = reste.split('/')[0]
        const cheminEntree = `${prefixe}${nom}`
        if (vus.has(cheminEntree)) continue
        vus.add(cheminEntree)
        entrees.push({
          id: createHash('sha1').update(cheminEntree).digest('hex'),
          name: nom,
          type: intermediaire ? 'tree' : 'blob',
          path: cheminEntree,
          mode: intermediaire ? '040000' : '100644',
        })
      }
      return new Response(JSON.stringify(entrees), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'x-next-page': '' },
      })
    }
    if (chemin.includes('/repository/files/')) {
      const fichier = chemin.slice(
        chemin.lastIndexOf('/repository/files/') + '/repository/files/'.length,
      ).replace(/\/raw$/, '')
      const contenu = depot.fichiers[fichier]
      if (contenu === undefined) return new Response(null, { status: 404 })
      if (url.pathname.includes('/raw')) return new Response(contenu)
      if (init?.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            'x-gitlab-last-commit-id': depot.commit,
            'x-gitlab-execute-filemode': 'false',
          },
        })
      }
      return reponseJson({
        file_path: fichier,
        content: Buffer.from(contenu).toString('base64'),
        encoding: 'base64',
        last_commit_id: depot.commit,
        execute_filemode: false,
      })
    }
    return new Response(null, { status: 404 })
  }) as typeof fetch
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ouverture GitLab — orchestration du service', () => {
  test('un arrêt pendant la préparation interdit une installation tardive et permet une nouvelle ouverture', async () => {
    const annulation = new AbortController()
    let terminer!: () => void
    const attente = new Promise<void>((resolve) => { terminer = resolve })
    const preparer = vi.fn(async (_compte, destination) => {
      await attente
      return preparationFactice(destination, '/miroir-test')
    })
    const { service, coffre, installées, traces } = bancOuverture({ preparer })
    connecterCompte(coffre)
    const ouverture = service.ouvrirMigration(demande, annulation.signal)
    await vi.waitFor(() => expect(preparer).toHaveBeenCalledOnce())
    annulation.abort()
    terminer()
    await expect(ouverture).rejects.toMatchObject({ name: 'AbortError' })
    expect(installées).toHaveLength(0)
    expect(traces).toHaveLength(0)
    expect(coffre.listerDestinationsGitLab()).toHaveLength(0)
    await service.ouvrirMigration(demande, new AbortController().signal)
    expect(installées).toHaveLength(1)
    expect(traces).toEqual(['fermer', 'installer'])
  })

  test('une migration ne remplace pas le contexte si ses médias du dépôt sont inaccessibles', async () => {
    const { service, coffre, installées, traces } = bancOuverture({
      preparer: async (_compte, destination) => ({ ...preparationFactice(destination, '/miroir-test'),
        inaccessibles: [{ chemin: 'medias/voix.mp3', raison: 'indisponible' }] }),
    })
    connecterCompte(coffre)
    await expect(service.ouvrirMigration(demande)).rejects.toThrow(/médias ne sont pas accessibles/)
    expect(installées).toHaveLength(0)
    expect(traces).toHaveLength(0)
    expect(coffre.listerDestinationsGitLab()).toHaveLength(0)
  })

  test('nouvelle destination : préparation avant coffre, fermeture avant installation', async () => {
    const { service, coffre, dirProfil, traces, installées } = bancOuverture({
      preparer: async (compte, destination, client) => {
        traces.push('preparer')
        expect(compte.utilisateur).toBe('max')
        expect(client).toBeDefined()
        // La destination n'est encore nulle part au moment de la préparation.
        expect(coffre.listerDestinationsGitLab()).toHaveLength(0)
        return preparationFactice(destination, dirProfil)
      },
      fermerContexte: async () => {
        traces.push('fermer')
        // Le coffre a été écrit avant la fermeture de l'ancien contexte.
        expect(coffre.listerDestinationsGitLab()).toHaveLength(1)
      },
    })

    connecterCompte(coffre)
    const resultat = await service.enregistrerEtOuvrir(demande)

    expect(traces).toEqual(['preparer', 'fermer', 'installer'])
    expect(installées).toHaveLength(1)
    expect(coffre.listerDestinationsGitLab()).toHaveLength(1)
    expect(coffre.listerComptesGitLab()).toHaveLength(1)
    expect(resultat).toMatchObject({
      dir: installées[0].preparation.dirMiroir,
      nom: 'Corpus Corpus pilote',
      distant: {
        fournisseur: 'gitlab',
        projetId: 42,
        nomProjet: 'Corpus pilote',
        branche: 'equipe/terrain',
        racine: '',
        connexionDisponible: true,
      },
      verrous: [],
    })
    // Aucun secret ne traverse le résultat public.
    expect(JSON.stringify(resultat)).not.toContain('access-secret')
  })

  test('destination enregistrée : mêmes identifiants et branche, client du compte transmis', async () => {
    const observé = vi.fn(async (_compte: { utilisateur: string }, destination: ConfigDestinationGitLab) =>
      preparationFactice(destination, ''))
    const { service, coffre } = bancOuverture({ preparer: observé })
    const destination = enregistrerDestination(coffre)
    coffre.enregistrerBaseMedia({
      destinationGitLabId: destination.id,
      urlBase: 'https://nuage.example.org/dav/medias',
      utilisateur: 'max-media',
      motDePasse: 'secret-media',
    })

    const resultat = await service.ouvrir(destination.id)

    expect(observé).toHaveBeenCalledTimes(1)
    const [compteRecu, destinationRecue, clientRecu] = observé.mock.calls[0]
    expect(compteRecu.utilisateur).toBe('max')
    expect(destinationRecue).toEqual(destination)
    expect(clientRecu).toBeInstanceOf(ClientGitLab)
    expect(resultat.distant).toMatchObject({
      id: destination.id,
      branche: destination.branche,
      racine: destination.racine,
      baseMedia: { utilisateur: 'max-media', secretDisponible: true },
    })
    expect(JSON.stringify(resultat.distant)).not.toContain('nuage.example.org')
    expect(JSON.stringify(resultat.distant)).not.toContain('secret-media')
    expect(resultat.corpus.membership).toEqual({})
  })

  test('un credential périmé est renouvelé avant la préparation', async () => {
    const observé = vi.fn(async (_compte: { utilisateur: string }, destination: ConfigDestinationGitLab) =>
      preparationFactice(destination, ''))
    const { service, coffre } = bancOuverture({
      preparer: observé,
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({
        access_token: 'access-roté',
        refresh_token: 'refresh-roté',
        expires_in: 7200,
        scope: 'read_api write_repository',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch,
    })
    const destination = enregistrerDestination(coffre)
    coffre.memoriserCredentialOAuthGitLab(destination.compteId, credentialOAuth({
      expiresAt: Date.now() - 1,
    }))

    await service.ouvrir(destination.id)

    expect(observé.mock.calls[0][2]).toBeInstanceOf(ClientGitLab)
    expect(coffre.credentialOAuthGitLab(destination.compteId)?.accessToken).toBe('access-roté')
  })

  test('destination ou compte absent : refus avant tout effet', async () => {
    const { service, coffre, traces, installées } = bancOuverture({
      preparer: async () => {
        throw new Error('la préparation ne doit pas être appelée')
      },
    })
    await expect(service.ouvrir('destination-inconnue'))
      .rejects.toThrow('Destination GitLab inconnue.')

    const destination = enregistrerDestination(coffre)
    coffre.oublier(destination.compteId)
    await expect(service.ouvrir(destination.id))
      .rejects.toThrow('Compte GitLab inconnu.')

    // Compte présent au coffre mais sans credential : refus, rien préparé.
    const dirSansConnexion = mkdtempSync(join(tmpdir(), 'sonal-gitlab-ouverture-'))
    const coffreSansConnexion = new CoffreComptes(
      join(dirSansConnexion, 'comptes-distant.json'),
      chiffreur,
    )
    const compteId = coffreSansConnexion.enregistrerCompteGitLab({
      urlInstance: demande.urlInstance,
      utilisateur: demande.utilisateur,
      credential: credentialOAuth(),
    }).id
    const destinationSansConnexion = coffreSansConnexion.enregistrerDestinationGitLab({
      compteId,
      projetId: demande.projetId,
      nomProjet: demande.nomProjet,
      branche: demande.branche,
      racine: '',
    })
    coffreSansConnexion.oublierCredentialOAuthGitLab(compteId)
    const refus = vi.fn(async () => {
      throw new Error('la préparation ne doit pas être appelée')
    })
    const serviceSansConnexion = new ServiceOuvertureGitLab({
      coffre: coffreSansConnexion,
      authentification: authentificationFactice(coffreSansConnexion),
      dirProfil: dirSansConnexion,
      identiteSession: { machineId: 'poste-test', sessionId: 'session-test' },
      fermerContexte: async () => {
        throw new Error('la fermeture ne doit pas être appelée')
      },
      installer: () => {
        throw new Error('l’installation ne doit pas être appelée')
      },
      preparer: refus,
    })
    await expect(serviceSansConnexion.ouvrir(destinationSansConnexion.id))
      .rejects.toThrow('expiré ou a été révoquée')
    expect(refus).not.toHaveBeenCalled()

    expect(traces).toEqual([])
    expect(installées).toHaveLength(0)
  })

  test('échec de préparation : rien d’enregistré, fermé ni installé', async () => {
    const { service, coffre, traces, installées } = bancOuverture({
      preparer: async () => {
        throw new Error('le dépôt ne fournit pas de commit valide')
      },
    })
    connecterCompte(coffre)

    await expect(service.enregistrerEtOuvrir(demande))
      .rejects.toThrow('le dépôt ne fournit pas de commit valide')

    expect(coffre.listerDestinationsGitLab()).toHaveLength(0)
    expect(traces).toEqual([])
    expect(installées).toHaveLength(0)
  })

  test('échec d’enregistrement de la destination : pas de fermeture ni d’installation', async () => {
    const { coffre, dirProfil } = bancOuverture()
    connecterCompte(coffre)
    vi.spyOn(coffre, 'enregistrerDestinationGitLab').mockImplementation(() => {
      throw new Error('coffre indisponible')
    })
    const service = new ServiceOuvertureGitLab({
      coffre,
      authentification: authentificationFactice(coffre),
      dirProfil,
      identiteSession: { machineId: 'poste-test', sessionId: 'session-test' },
      fermerContexte: async () => {
        throw new Error('la fermeture ne doit pas être appelée')
      },
      installer: () => {
        throw new Error('l’installation ne doit pas être appelée')
      },
      preparer: preparerFactice(dirProfil),
    })

    await expect(service.enregistrerEtOuvrir(demande)).rejects.toThrow('coffre indisponible')

    // Le compte connecté reste, la destination n'est pas enregistrée.
    expect(coffre.listerComptesGitLab()).toHaveLength(1)
    expect(coffre.listerDestinationsGitLab()).toHaveLength(0)
  })

  test('fermeture refusée : pas d’installation, erreur remontée, coffre conservé', async () => {
    const { coffre, dirProfil } = bancOuverture()
    connecterCompte(coffre)
    const installées: unknown[] = []
    const service = new ServiceOuvertureGitLab({
      coffre,
      authentification: authentificationFactice(coffre),
      dirProfil,
      identiteSession: { machineId: 'poste-test', sessionId: 'session-test' },
      fermerContexte: async () => {
        throw new Error('publication impossible')
      },
      installer: (destination, preparation) => {
        installées.push({ destination, preparation })
      },
      preparer: preparerFactice(dirProfil),
    })

    await expect(service.enregistrerEtOuvrir(demande)).rejects.toThrow('publication impossible')

    expect(installées).toHaveLength(0)
    // Le coffre conserve l'enregistrement déjà effectué : pas de compensation.
    expect(coffre.listerDestinationsGitLab()).toHaveLength(1)
  })

  test('deux ouvertures rapprochées restent sérialisées par la file de transitions', async () => {
    const { coffre, dirProfil } = bancOuverture()
    const destinationA = enregistrerDestination(coffre, { ...demande, projetId: 42 }, 'donnees')
    const destinationB = enregistrerDestination(coffre, { ...demande, projetId: 43 }, 'archives')
    let enCours = 0
    let auPlus = 0
    const service = new ServiceOuvertureGitLab({
      coffre,
      authentification: authentificationFactice(coffre),
      dirProfil,
      identiteSession: { machineId: 'poste-test', sessionId: 'session-test' },
      fermerContexte: async () => {
        enCours += 1
        auPlus = Math.max(auPlus, enCours)
      },
      installer: () => {
        enCours -= 1
      },
      preparer: async (_compte, destination) => {
        // Laisse une vraie fenêtre de concurrence apparaître si elle existait.
        await new Promise((resolve) => setTimeout(resolve, 5))
        return preparationFactice(destination, dirProfil)
      },
    })
    // File de transitions identique à celle du main : une seule bascule à la fois.
    let file: Promise<void> = Promise.resolve()
    const transitionner = <T>(operation: () => Promise<T>): Promise<T> => {
      const resultat = file.then(operation, operation)
      file = resultat.then(
        () => undefined,
        () => undefined,
      )
      return resultat
    }

    const [resultatA, resultatB] = await Promise.all([
      transitionner(() => service.ouvrir(destinationA.id)),
      transitionner(() => service.ouvrir(destinationB.id)),
    ])

    expect(auPlus).toBe(1)
    expect(resultatA.distant.id).toBe(destinationA.id)
    expect(resultatB.distant.id).toBe(destinationB.id)
  })
})

describe('ouverture GitLab — création du squelette distant', () => {
  function depotFactice(fichiers: Record<string, string> = {}): DepotFactice {
    return {
      fichiers,
      branche: demande.branche,
      commit: 'a'.repeat(40),
      requetes: [],
    }
  }

  test('création réussie : un seul commit de squelette puis chemin commun d’ouverture', async () => {
    const depot = depotFactice()
    const observé = vi.fn((_compte: { utilisateur: string }, destination: ConfigDestinationGitLab) => {
      expect(destination.branche).toBe('equipe/terrain')
    })
    const { service, coffre, traces, installées } = bancOuverture({
      fetchImpl: fetchGitLabFactice(depot),
      preparer: preparerFactice('', observé),
    })
    connecterCompte(coffre)

    const resultat = await service.creerEtOuvrir(demandeCreation)

    const publications = depot.requetes.filter(({ init }) => init?.method === 'POST')
    expect(publications).toHaveLength(1)
    const corps = JSON.parse(String(publications[0].init?.body)) as {
      branch: string
      commit_message: string
      actions: { action: string; file_path: string; content: string }[]
    }
    expect(corps.branch).toBe('equipe/terrain')
    expect(corps.commit_message).toBe('Sonal création racine')
    expect(corps.actions).toHaveLength(1)
    expect(corps.actions[0].action).toBe('create')
    expect(corps.actions[0].file_path).toBe('corpus.json')
    expect(JSON.parse(corps.actions[0].content).nom).toBe('Enquête 2026')
    expect(observé).toHaveBeenCalledTimes(1)
    expect(traces).toEqual(['fermer', 'installer'])
    expect(coffre.listerDestinationsGitLab()).toHaveLength(1)
    expect(installées).toHaveLength(1)
    expect(resultat.distant).toMatchObject({
      fournisseur: 'gitlab',
      branche: 'equipe/terrain',
      racine: '',
      connexionDisponible: true,
    })
  })

  test('la base média facultative est vérifiée avant la création puis liée à la destination', async () => {
    const depot = depotFactice()
    const demandeBaseMedia = {
      urlBase: 'https://nuage.example.org/dav/medias/',
      utilisateur: 'max-media',
      motDePasse: 'secret-media',
    }
    const preparerBaseMedia = vi.fn(async () => ({
      ok: true as const,
      base: {
        ...demandeBaseMedia,
        urlBase: 'https://nuage.example.org/dav/medias',
      },
    }))
    const { service, coffre } = bancOuverture({
      fetchImpl: fetchGitLabFactice(depot),
      preparer: preparerFactice(''),
      preparerBaseMedia,
    })
    connecterCompte(coffre)

    const resultat = await service.creerEtOuvrir({
      ...demandeCreation,
      baseMedia: demandeBaseMedia,
    })

    expect(preparerBaseMedia).toHaveBeenCalledExactlyOnceWith(demandeBaseMedia)
    expect(coffre.baseMedia(resultat.distant.id)).toMatchObject({
      urlBase: 'https://nuage.example.org/dav/medias',
      utilisateur: 'max-media',
    })
    expect(coffre.motDePasseBaseMedia(resultat.distant.id)).toBe('secret-media')
    expect(resultat.distant.baseMedia).toEqual({
      utilisateur: 'max-media',
      secretDisponible: true,
    })
  })

  test('base média inaccessible : aucun corpus n’est créé', async () => {
    const depot = depotFactice()
    const { service, coffre, traces, installées } = bancOuverture({
      fetchImpl: fetchGitLabFactice(depot),
      preparer: preparerFactice(''),
      preparerBaseMedia: async () => ({ ok: false, motif: 'droits' }),
    })
    connecterCompte(coffre)

    await expect(service.creerEtOuvrir({
      ...demandeCreation,
      baseMedia: {
        urlBase: 'https://nuage.example.org/dav/medias',
        utilisateur: 'max-media',
        motDePasse: 'refuse',
      },
    })).rejects.toThrow('Le compte WebDAV ou son mot de passe est refusé.')

    expect(depot.requetes.filter(({ init }) => init?.method === 'POST')).toHaveLength(0)
    expect(coffre.listerDestinationsGitLab()).toHaveLength(0)
    expect(traces).toEqual([])
    expect(installées).toHaveLength(0)
  })

  test('corpus déjà présent : aucun commit, aucune destination ni installation', async () => {
    const depot = depotFactice({ 'corpus.json': corpusDistantValide([]) })
    const { service, coffre, traces, installées } = bancOuverture({
      fetchImpl: fetchGitLabFactice(depot),
      preparer: preparerFactice(''),
    })

    connecterCompte(coffre)
    await expect(service.creerEtOuvrir(demandeCreation))
      .rejects.toThrow('Un corpus existe déjà à la racine du projet GitLab.')

    expect(depot.requetes.filter(({ init }) => init?.method === 'POST')).toHaveLength(0)
    expect(coffre.listerDestinationsGitLab()).toHaveLength(0)
    expect(traces).toEqual([])
    expect(installées).toHaveLength(0)
  })

  test('publication refusée : pas d’enregistrement ni d’installation', async () => {
    const depot = depotFactice()
    depot.refusPublier = 400
    const { service, coffre, traces, installées } = bancOuverture({
      fetchImpl: fetchGitLabFactice(depot),
      preparer: preparerFactice(''),
    })

    connecterCompte(coffre)
    await expect(service.creerEtOuvrir(demandeCreation)).rejects.toThrow()

    expect(coffre.listerDestinationsGitLab()).toHaveLength(0)
    expect(traces).toEqual([])
    expect(installées).toHaveLength(0)
  })

  test('création publiée puis ouverture échouée : corpus distant conservé, pas de rejeu', async () => {
    const depot = depotFactice()
    const { service, coffre } = bancOuverture({
      fetchImpl: fetchGitLabFactice(depot),
      preparer: async () => {
        throw new Error('ouverture interrompue')
      },
    })

    connecterCompte(coffre)
    await expect(service.creerEtOuvrir(demandeCreation))
      .rejects.toThrow('ouverture interrompue')

    // Le squelette publié reste sur le dépôt : un seul commit, aucune compensation.
    const publications = depot.requetes.filter(({ init }) => init?.method === 'POST')
    expect(publications).toHaveLength(1)
    expect(coffre.listerDestinationsGitLab()).toHaveLength(0)
  })
})

describe('ouverture GitLab — préparation réelle avec journaux', () => {
  const SHA_PUB = 'c'.repeat(40)

  function bancReel() {
    const dirProfil = mkdtempSync(join(tmpdir(), 'sonal-gitlab-ouverture-'))
    const coffre = new CoffreComptes(join(dirProfil, 'comptes-distant.json'), chiffreur)
    const destination = enregistrerDestination(coffre, demande, 'donnees')
    const journalRepertoire = join(dirProfil, 'operations-gitlab', destination.id)
    const ressource = `entretien:${destination.id}:e1`
    const resourceHash = createHash('sha256').update(ressource).digest('hex')
    const contenuPublie = entretienDistantValide()
    const depot: DepotFactice = {
      fichiers: {
        'donnees/corpus.json': corpusDistantValide(['e1']),
        'donnees/entretiens/e1.json': contenuPublie,
      },
      branche: destination.branche,
      commit: 'b'.repeat(40),
      commits: [{ id: SHA_PUB, title: 'Sonal op-crash' }],
      requetes: [],
    }
    return {
      coffre,
      dirProfil,
      destination,
      journalRepertoire,
      ressource,
      resourceHash,
      contenuPublie,
      depot,
    }
  }

  function serviceReel(banc: ReturnType<typeof bancReel>) {
    const installées: PreparationOuvertureGitLab[] = []
    const service = new ServiceOuvertureGitLab({
      coffre: banc.coffre,
      authentification: authentificationFactice(
        banc.coffre,
        fetchGitLabFactice(banc.depot),
      ),
      dirProfil: banc.dirProfil,
      identiteSession: { machineId: 'poste-test', sessionId: 'session-test' },
      fermerContexte: async () => undefined,
      installer: (_destination, preparation) => {
        installées.push(preparation)
      },
    })
    return { service, installées }
  }

  function semerJournaux(banc: ReturnType<typeof bancReel>) {
    const journal = new JournalPublicationGitLab(banc.destination.id, banc.journalRepertoire)
    journal.preparer({
      operationId: 'op-crash',
      nature: 'session-entretien',
      branche: banc.destination.branche,
      droits: [{ resourceHash: banc.resourceHash, generation: 'generation-test', leaseCommitId: 'd'.repeat(40) }],
      etat: 'prepare',
      actions: [{
        action: 'update',
        file_path: 'donnees/entretiens/e1.json',
        content: banc.contenuPublie,
        last_commit_id: 'e'.repeat(40),
      }],
    })
    const journalSessions = new JournalSessionsGitLab(banc.destination.id, banc.journalRepertoire)
    journalSessions.ouvrir(
      banc.ressource,
      'entretiens/e1.json',
      'donnees/entretiens/e1.json',
      banc.destination.branche,
      'f'.repeat(40),
      banc.contenuPublie,
    )
    return { journal, journalSessions }
  }

  test('journal confirmé : session confirmée avant la suppression de l’opération', async () => {
    const banc = bancReel()
    const { journal, journalSessions } = semerJournaux(banc)
    const ordre: string[] = []
    const confirmerOrigine = JournalSessionsGitLab.prototype.confirmerPublication
    const supprimerOrigine = JournalPublicationGitLab.prototype.supprimer
    vi.spyOn(JournalSessionsGitLab.prototype, 'confirmerPublication')
      .mockImplementation(function (this: JournalSessionsGitLab, ...args: Parameters<typeof confirmerOrigine>) {
        ordre.push('confirmer')
        return confirmerOrigine.apply(this, args)
      })
    vi.spyOn(JournalPublicationGitLab.prototype, 'supprimer')
      .mockImplementation(function (this: JournalPublicationGitLab, ...args: Parameters<typeof supprimerOrigine>) {
        ordre.push('supprimer')
        return supprimerOrigine.apply(this, args)
      })
    const { service, installées } = serviceReel(banc)

    const resultat = await service.ouvrir(banc.destination.id)

    expect(ordre).toEqual(['confirmer', 'supprimer'])
    expect(journal.lister()).toHaveLength(0)
    const reprise = journalSessions.lire(banc.ressource)
    expect(reprise).not.toBeNull()
    expect(reprise?.commitId).toBe(SHA_PUB)
    expect(installées).toHaveLength(1)
    expect(resultat.distant.id).toBe(banc.destination.id)
    expect(resultat.corpus.membership).toHaveProperty('e1')
  })

  test('journal indéterminé : copie récupérable exclue du premier tirage, sans nouvelle publication', async () => {
    const banc = bancReel()
    const { journal } = semerJournaux(banc)
    banc.depot.couperRecherche = true
    // Copie locale non publiée, déjà présente dans le miroir avant l'ouverture.
    const dirMiroir = join(banc.dirProfil, 'miroirs', banc.destination.id)
    mkdirSync(join(dirMiroir, 'entretiens'), { recursive: true })
    const copieLocale = entretienDistantValide({
      corpsTexte: { type: 'doc', content: [{ type: 'paragraph' }] },
    })
    writeFileSync(join(dirMiroir, 'entretiens', 'e1.json'), copieLocale, 'utf8')
    const { service, installées } = serviceReel(banc)

    const resultat = await service.ouvrir(banc.destination.id)

    // L'opération indéterminée est conservée, et rien n'a été republié.
    expect(journal.lister()).toHaveLength(1)
    expect(banc.depot.requetes.every(({ init }) => init?.method !== 'POST')).toBe(true)
    // Le premier tirage a remplacé corpus.json mais épargné la copie récupérable.
    expect(readFileSync(join(dirMiroir, 'entretiens', 'e1.json'), 'utf8')).toBe(copieLocale)
    expect(existsSync(join(dirMiroir, 'corpus.json'))).toBe(true)
    expect(installées).toHaveLength(1)
    expect(resultat.corpus.membership).toHaveProperty('e1')
  })
})
