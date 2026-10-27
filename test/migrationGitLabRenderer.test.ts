// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref, type EffectScope } from 'vue'
import { useSourceMigrationGitLab } from '../src/renderer/composables/corpus/useSourceMigrationGitLab'
import type { ApiGitLab, ConnexionGitLabPublique, DestinationGitLabPublic } from '../src/shared/gitlab'
import { CONNEXION_MIGRATION_GITLAB_REQUISE } from '../src/shared/corpus/migrationGitLab'
import { useMigrationGitLab } from '../src/renderer/composables/corpus/useMigrationGitLab'
import type { ApiMigrationGitLab, BilanMigrationGitLab, ResultatMigrationGitLab, SourceMigrationGitLab } from '../src/shared/corpus/migrationGitLab'

const projet = {
  compteId: 'compte', urlInstance: 'https://gitlab.example.org', utilisateur: 'moi',
  projetId: 1, nomProjet: 'Source', branche: 'main',
}
const source: SourceMigrationGitLab = {
  preparationId: 'preparation', projet, commit: 'a'.repeat(40), corpus: ['terrain.crp'],
}
const resultat: BilanMigrationGitLab = {
  bilanId: 'bilan', preparationId: source.preparationId, source: projet, commitSource: source.commit,
  cheminCrp: 'terrain.crp', cible: { ...projet, projetId: 2, nomProjet: 'Cible', branche: null },
  commitCible: null,
  apercu: { nom: 'Terrain', dateCreation: null, nbEntretiens: 1, themes: [], variables: [], reglesAnon: [], raw: { tabEnt: [] } },
  entretiens: [{ titre: 'Entretien', cheminSonal: 'entretien1.sonal', media: null }],
  medias: [], volumeOctets: 0, destinationMedia: 'depot',
}
const transcription = readFileSync('test/fixtures/entretien1.sonal', 'utf8')
const scopes: EffectScope[] = []
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
})

function formulaire(surcharges: Partial<ApiMigrationGitLab> = {}, surTerminee?: () => void) {
  const api: ApiMigrationGitLab = {
    decouvrir: vi.fn(async () => structuredClone(source)),
    preparer: vi.fn(async () => structuredClone(resultat)),
    lireEntretien: vi.fn(async () => ({ nom: 'entretien1.sonal', contenu: transcription })),
    abandonner: vi.fn(async () => undefined),
    ajouterConversion: vi.fn(async () => undefined),
    executer: vi.fn(async () => ({ etat: 'interrompue' as const, operationId: 'migration-bilan', message: 'Arrêt' })),
    listerSuivis: vi.fn(async () => []),
    reprendre: vi.fn(async () => ({ etat: 'interrompue' as const, operationId: 'migration-bilan', message: 'Arrêt' })),
    annuler: vi.fn(async () => undefined),
    surProgression: vi.fn(() => vi.fn()),
    ...surcharges,
  }
  const scope = effectScope()
  scopes.push(scope)
  const etat = { enCours: ref(false), erreur: ref<string | null>(null) }
  const parseur = vi.fn((html: string) => new DOMParser().parseFromString(
    html.replace(/<link\b[^>]*>/gi, '').replace(/<script\b[^>]*\bsrc=[^>]*><\/script>/gi, ''),
    'text/html',
  ))
  const f = scope.run(() => useMigrationGitLab(etat, api, parseur, api, surTerminee))!
  f.urlCible.value = 'https://gitlab.example.org/groupe/cible'
  return { ...f, ...etat, api, scope, parseur }
}

function differee<T>() {
  let resoudre!: (valeur: T) => void
  const promesse = new Promise<T>((resolve) => { resoudre = resolve })
  return { promesse, resoudre }
}

async function charger(f: ReturnType<typeof formulaire>) {
  return f.chargerSource({ compteId: 'compte', urlProjet: 'https://gitlab.example.org/groupe/source' })
}

const destinationConnue: DestinationGitLabPublic = {
  fournisseur: 'gitlab', id: 'destination', ...projet, racine: '',
  authentification: 'oauth', connexionDisponible: true, baseMedia: null,
}

function formulaireSource(
  authentification: 'oauth' | 'jeton-personnel' = 'oauth',
  surcharges: Partial<ApiGitLab> = {},
  migrationApi: Partial<ApiMigrationGitLab> = {},
) {
  const base = formulaire(migrationApi)
  const destination = { ...destinationConnue, authentification }
  const connexion: ConnexionGitLabPublique = {
    urlInstance: projet.urlInstance, applicationConnue: true, uriCallback: 'http://127.0.0.1:7474/callback',
    comptes: [{ id: projet.compteId, urlInstance: projet.urlInstance, utilisateur: projet.utilisateur,
      authentification, connecte: true, aRafraichir: false, scopes: ['api'] }],
  }
  const api = {
    lister: vi.fn(async () => [destination]),
    detecterInstance: vi.fn(async () => projet.urlInstance),
    etat: vi.fn(async () => structuredClone(connexion)),
    connecter: vi.fn(async () => structuredClone(connexion)),
    connecterAvecJeton: vi.fn(async () => structuredClone(connexion)),
    deconnecter: vi.fn(async () => structuredClone(connexion)),
    ...surcharges,
  }
  const scope = effectScope(); scopes.push(scope)
  const f = scope.run(() => useSourceMigrationGitLab(base, base.chargerSource, base.abandonner, api))!
  return { ...f, base, api, connexion, scope }
}

async function choisirSourceConnue(f: ReturnType<typeof formulaireSource>) {
  await f.chargerDestinations()
  f.destinationId.value = 'destination'
  await vi.waitFor(() => expect(f.selectionEnCours.value).toBe(false))
}

describe('choix de la source et réutilisation des accès GitLab', () => {
  it.each(['oauth', 'jeton-personnel'] as const)('lit un projet connu sans redemander ses accès (%s)', async (mode) => {
    const f = formulaireSource(mode)
    await choisirSourceConnue(f)
    await expect(f.charger()).resolves.toBe(true)
    expect(f.api.detecterInstance).not.toHaveBeenCalled()
    expect(f.api.connecter).not.toHaveBeenCalled()
    expect(f.api.connecterAvecJeton).not.toHaveBeenCalled()
    expect(f.authentification.value).toBe(mode)
    expect(f.compteChoisi.value).toBe('compte')
    expect(f.base.api.decouvrir).toHaveBeenCalledExactlyOnceWith({ destinationId: 'destination' })
    expect(f.base.source.value).toEqual(source)
    expect(f.base.api.executer).not.toHaveBeenCalled()
  })

  it.each(['oauth', 'jeton-personnel'] as const)('réutilise un accès disponible pour une nouvelle adresse (%s)', async (mode) => {
    const f = formulaireSource(mode)
    f.urlProjet.value = 'https://gitlab.example.org/groupe/source'
    await expect(f.charger()).resolves.toBe(true)
    expect(f.base.api.decouvrir).toHaveBeenCalledExactlyOnceWith({ compteId: 'compte', urlProjet: f.urlProjet.value })
    expect(f.api.connecter).not.toHaveBeenCalled()
    expect(f.api.connecterAvecJeton).not.toHaveBeenCalled()
    expect(f.authentification.value).toBe(mode)
  })

  it('ne remplace pas le compte du projet par un autre compte connecté', async () => {
    const f = formulaireSource()
    f.connexion.comptes[0].connecte = false
    f.connexion.comptes.push({ ...f.connexion.comptes[0], id: 'autre-compte', utilisateur: 'autre', connecte: true })
    await choisirSourceConnue(f)
    expect(f.compteCourant.value?.connecte).toBe(false)
    await expect(f.charger()).resolves.toBe(false)
    expect(f.api.connecter).toHaveBeenCalledOnce()
    expect(f.base.api.decouvrir).not.toHaveBeenCalled()
    expect(f.base.erreur.value).toContain('Connectez-vous avec le compte « moi »')
  })

  it('ne demande un jeton que si celui du compte enregistré est absent', async () => {
    const f = formulaireSource('jeton-personnel')
    f.connexion.comptes[0].connecte = false
    f.api.connecterAvecJeton = vi.fn(async () => {
      f.connexion.comptes[0].connecte = true
      return structuredClone(f.connexion)
    })
    await choisirSourceConnue(f)
    f.jetonPersonnel.value = 'nouveau-jeton'
    await expect(f.charger()).resolves.toBe(true)
    expect(f.api.connecterAvecJeton).toHaveBeenCalledExactlyOnceWith(projet.urlInstance, 'nouveau-jeton')
    expect(f.jetonPersonnel.value).toBe('')
    expect(f.api.connecter).not.toHaveBeenCalled()
  })

  it('permet de se reconnecter après un refus du jeton pourtant mémorisé', async () => {
    const decouvrir = vi.fn<ApiMigrationGitLab['decouvrir']>()
      .mockRejectedValueOnce(new Error(`Error invoking remote method 'migrer:gitlab:decouvrir': ${CONNEXION_MIGRATION_GITLAB_REQUISE}`))
      .mockResolvedValueOnce(source)
    const f = formulaireSource('jeton-personnel', {}, { decouvrir })
    await choisirSourceConnue(f)
    await expect(f.charger()).resolves.toBe(false)
    expect(f.connexionAReprendre.value).toBe(true)
    expect(f.base.erreur.value).toBe(CONNEXION_MIGRATION_GITLAB_REQUISE)
    expect(f.api.connecterAvecJeton).not.toHaveBeenCalled()
    f.jetonPersonnel.value = 'jeton-remplace'
    await expect(f.charger()).resolves.toBe(true)
    expect(f.api.connecterAvecJeton).toHaveBeenCalledOnce()
    expect(f.connexionAReprendre.value).toBe(false)
  })

  it('ne demande pas une nouvelle connexion pour une erreur réseau', async () => {
    const f = formulaireSource('oauth', {}, { decouvrir: vi.fn(async () => { throw new Error('Serveur indisponible.') }) })
    await choisirSourceConnue(f)
    await expect(f.charger()).resolves.toBe(false)
    expect(f.connexionAReprendre.value).toBe(false)
    expect(f.base.erreur.value).toBe('Serveur indisponible.')
    expect(f.api.connecter).not.toHaveBeenCalled()
  })

  it('invalide la source quand on revient à une nouvelle adresse', async () => {
    const f = formulaireSource('jeton-personnel')
    await choisirSourceConnue(f)
    await f.charger()
    f.destinationId.value = ''
    await vi.waitFor(() => expect(f.selectionEnCours.value).toBe(false))
    expect(f.base.source.value).toBeNull()
    expect(f.base.api.abandonner).toHaveBeenCalledWith('preparation')
    expect(f.instance.value).toBe('')
    expect(f.compteCourant.value).toBeNull()
  })

  it('ignore l’état d’une connexion si la sélection a changé', async () => {
    const attente = differee<ConnexionGitLabPublique>()
    const f = formulaireSource('oauth', { etat: vi.fn(() => attente.promesse) })
    await f.chargerDestinations()
    f.destinationId.value = 'destination'
    f.destinationId.value = ''
    attente.resoudre(f.connexion)
    await vi.waitFor(() => expect(f.selectionEnCours.value).toBe(false))
    expect(f.compteCourant.value).toBeNull()
    expect(f.base.api.decouvrir).not.toHaveBeenCalled()
  })

  it('ignore la liste reçue après fermeture', async () => {
    const attente = differee<DestinationGitLabPublic[]>()
    const f = formulaireSource('oauth', { lister: vi.fn(() => attente.promesse) })
    const chargement = f.chargerDestinations()
    f.scope.stop()
    attente.resoudre([destinationConnue])
    await chargement
    expect(f.destinations.value).toEqual([])
  })
})

describe('bilan GitLab sans publication', () => {
  it.each(['executer', 'reprendre'] as const)('ferme le formulaire après %s réussi, sans envoyer un arrêt tardif', async (action) => {
    const avant = Object.getOwnPropertyDescriptor(window, 'confirm')
    Object.defineProperty(window, 'confirm', { value: vi.fn(() => true), configurable: true })
    const succes: ResultatMigrationGitLab = { etat: 'terminee', operationId: 'migration-bilan', ouverture: {} as never }
    const fermer = vi.fn(() => {
      expect(f.publicationEnCours.value).toBe(false)
      expect(f.enCours.value).toBe(false)
      f.scope.stop()
    })
    const f = formulaire({ executer: vi.fn(async () => succes), reprendre: vi.fn(async () => succes) }, fermer)
    try {
      await charger(f); await f.preparerBilan('compte')
      if (action === 'executer') await f.executer()
      else await f.reprendre({ operationId: 'migration-bilan', bilan: resultat, phase: 'ouverture',
        mediasConfirmes: 0, publicationsConfirmees: 1, publicationsTotal: 1 })
      expect(fermer).toHaveBeenCalledOnce()
      expect(f.api.annuler).not.toHaveBeenCalled()
    } finally {
      if (avant) Object.defineProperty(window, 'confirm', avant)
      else Reflect.deleteProperty(window, 'confirm')
    }
  })

  it('la fermeture demande l’arrêt et ignore le résultat tardif de l’opération', async () => {
    const reponse = differee<ResultatMigrationGitLab>()
    const retirerProgression = vi.fn()
    const f = formulaire({ executer: vi.fn(() => reponse.promesse), surProgression: () => retirerProgression })
    await charger(f); await f.preparerBilan('compte')
    const avant = Object.getOwnPropertyDescriptor(window, 'confirm')
    Object.defineProperty(window, 'confirm', { configurable: true, value: () => true })
    try {
      const execution = f.executer()
      await vi.waitFor(() => expect(f.api.executer).toHaveBeenCalledOnce())
      f.scope.stop()
      expect(f.api.annuler).toHaveBeenCalledExactlyOnceWith('migration-bilan')
      expect(retirerProgression).toHaveBeenCalledOnce()
      reponse.resoudre({ etat: 'interrompue', operationId: 'migration-bilan', message: 'Arrêt après fermeture' })
      await execution
      expect(f.erreur.value).toBeNull()
      expect(f.api.listerSuivis).not.toHaveBeenCalled()
    } finally {
      if (avant) Object.defineProperty(window, 'confirm', avant)
      else Reflect.deleteProperty(window, 'confirm')
    }
  })

  it('conserve chaque conversion avec le bilan auquel elle appartient, sans envoi', async () => {
    const f = formulaire()
    await charger(f)
    await f.preparerBilan('compte')
    expect(f.api.ajouterConversion).toHaveBeenCalledExactlyOnceWith('bilan', 0, expect.objectContaining({ payload: expect.any(Object) }))
    expect(f.api.executer).not.toHaveBeenCalled()
  })

  it('exige la confirmation et transmet l’identité du bilan, pas les champs modifiables', async () => {
    const f = formulaire()
    await charger(f); await f.preparerBilan('compte')
    const avant = Object.getOwnPropertyDescriptor(window, 'confirm')
    const confirmer = vi.fn(() => false)
    Object.defineProperty(window, 'confirm', { configurable: true, value: confirmer })
    try {
      await f.executer()
      expect(f.api.executer).not.toHaveBeenCalled()
      confirmer.mockReturnValue(true)
      await f.executer()
      expect(f.api.executer).toHaveBeenCalledExactlyOnceWith('bilan', true)
      expect(f.erreur.value).toBe('Arrêt')
      expect(f.api.listerSuivis).toHaveBeenCalledOnce()
    } finally {
      if (avant) Object.defineProperty(window, 'confirm', avant)
      else Reflect.deleteProperty(window, 'confirm')
    }
  })

  it('ne rend pas le bilan utilisable si la conversion privée n’a pas pu être conservée', async () => {
    const f = formulaire({ ajouterConversion: vi.fn(async () => { throw new Error('Préparation indisponible') }) })
    await charger(f); await f.preparerBilan('compte')
    expect(f.bilan.value).toBeNull()
    expect(f.erreur.value).toBe('Préparation indisponible')
    expect(f.api.executer).not.toHaveBeenCalled()
  })

  it('sélectionne le corpus unique et réutilise le vrai importeur .Sonal pour vérifier la conversion', async () => {
    const f = formulaire()
    expect(await charger(f)).toEqual(projet)
    expect(f.cheminCrp.value).toBe('terrain.crp')
    await f.preparerBilan('compte')
    expect(f.api.preparer).toHaveBeenCalledExactlyOnceWith({
      preparationId: 'preparation', cheminCrp: 'terrain.crp',
      cible: { compteId: 'compte', urlProjet: 'https://gitlab.example.org/groupe/cible' },
    })
    expect(f.api.lireEntretien).toHaveBeenCalledExactlyOnceWith('preparation', 0)
    expect(f.parseur).toHaveBeenCalledExactlyOnceWith(transcription)
    expect(f.bilan.value).toEqual(resultat)
    expect(f.erreur.value).toBeNull()
    expect(f.enCours.value).toBe(false)
  })

  it('ne fusionne pas les corpus et demande un choix lorsqu’il y en a plusieurs', async () => {
    const f = formulaire({ decouvrir: vi.fn(async () => ({ ...source, corpus: ['un.crp', 'deux.crp'] })) })
    await charger(f)
    expect(f.cheminCrp.value).toBe('')
    await f.preparerBilan('compte')
    expect(f.api.preparer).not.toHaveBeenCalled()
  })

  it('transmet la déclaration média seulement vers la préparation', async () => {
    const f = formulaire()
    await charger(f)
    f.externe.value = true
    f.baseMediaUrl.value = ' https://nuage.example.org/media '
    f.baseMediaUtilisateur.value = ' media-user '
    f.baseMediaMotDePasse.value = 'secret'
    await f.preparerBilan('compte')
    expect(f.api.preparer).toHaveBeenCalledWith(expect.objectContaining({
      baseMedia: { urlBase: 'https://nuage.example.org/media', utilisateur: 'media-user', motDePasse: 'secret' },
    }))
    expect(JSON.stringify(f.bilan.value)).not.toContain('secret')
    f.scope.stop()
    expect(f.baseMediaMotDePasse.value).toBe('')
  })

  it('invalide le bilan dès que la cible ou le choix média change', async () => {
    const f = formulaire()
    await charger(f)
    await f.preparerBilan('compte')
    f.urlCible.value = 'https://gitlab.example.org/groupe/autre'
    expect(f.bilan.value).toBeNull()
    await f.preparerBilan('compte')
    f.externe.value = true
    expect(f.bilan.value).toBeNull()
  })

  it('arrête une lecture inaccessible sans annoncer un bilan réussi', async () => {
    const f = formulaire({ lireEntretien: vi.fn(async () => { throw new Error('Transcription inaccessible') }) })
    await charger(f)
    await f.preparerBilan('compte')
    expect(f.bilan.value).toBeNull()
    expect(f.erreur.value).toBe('Transcription inaccessible')
    expect(f.enCours.value).toBe(false)
  })

  it('refuse un résultat de lecture vide lorsque la source annonce une transcription', async () => {
    const f = formulaire({ lireEntretien: vi.fn(async () => null) })
    await charger(f)
    await f.preparerBilan('compte')
    expect(f.bilan.value).toBeNull()
    expect(f.erreur.value).toContain('n’a pas pu être lue')
  })

  it('autorise un entretien sans transcription explicitement déclaré dans le corpus', async () => {
    const f = formulaire({
      preparer: vi.fn(async () => ({ ...resultat, entretiens: [{ titre: 'Audio seul', cheminSonal: null, media: null }] })),
      lireEntretien: vi.fn(async () => null),
    })
    await charger(f)
    await f.preparerBilan('compte')
    expect(f.bilan.value?.entretiens[0].titre).toBe('Audio seul')
    expect(f.erreur.value).toBeNull()
  })

  it('ne poursuit pas les lectures après fermeture du formulaire', async () => {
    const lecture = differee<{ nom: string; contenu: string }>()
    const lire = vi.fn(() => lecture.promesse)
    const f = formulaire({
      preparer: vi.fn(async () => ({ ...resultat, entretiens: [...resultat.entretiens, ...resultat.entretiens] })),
      lireEntretien: lire,
    })
    await charger(f)
    const preparation = f.preparerBilan('compte')
    await vi.waitFor(() => expect(lire).toHaveBeenCalledTimes(1))
    f.scope.stop()
    lecture.resoudre({ nom: 'entretien1.sonal', contenu: transcription })
    await preparation
    expect(lire).toHaveBeenCalledTimes(1)
    expect(f.bilan.value).toBeNull()
    expect(f.api.abandonner).toHaveBeenCalledWith('preparation')
  })

  it('ignore une réponse tardive après changement de cible', async () => {
    const reponse = differee<BilanMigrationGitLab>()
    const f = formulaire({ preparer: vi.fn(() => reponse.promesse) })
    await charger(f)
    const preparation = f.preparerBilan('compte')
    f.urlCible.value = 'https://gitlab.example.org/groupe/autre'
    reponse.resoudre(resultat)
    await preparation
    expect(f.bilan.value).toBeNull()
    expect(f.api.lireEntretien).not.toHaveBeenCalled()
  })

  it('abandonne une découverte devenue obsolète', async () => {
    const decouverte = differee<SourceMigrationGitLab>()
    const f = formulaire({ decouvrir: vi.fn(() => decouverte.promesse) })
    const chargement = charger(f)
    f.abandonner()
    decouverte.resoudre(source)
    await expect(chargement).rejects.toThrow('La source a changé')
    expect(f.source.value).toBeNull()
    expect(f.api.abandonner).toHaveBeenCalledWith('preparation')
  })
})
