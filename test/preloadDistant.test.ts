import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiDistant, ProgressionTransfert } from '../src/shared/distant'
import type { ApiGitLab, ConnexionGitLabPublique, DemandeCreationGitLab } from '../src/shared/gitlab'
import type { ApiWebDAV, DemandeCreationWebDAV } from '../src/shared/webdav'

const electron = vi.hoisted(() => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: { invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
  webUtils: { getPathForFile: vi.fn() },
}))
vi.mock('electron', () => electron)

let api: { gitlab: ApiGitLab; webdav: ApiWebDAV; distant: ApiDistant; corpus: Window['sonal']['corpus'] }
const demandeTheme = { type: 'transfert' as const, conserverSource: true, source: 'source', cible: { type: 'existante' as const, id: 'cible' } }
const optionsThemes = { entretiens: 'tous-prevus' as const }

const creationWebDAV: DemandeCreationWebDAV = {
  urlServeur: 'https://nuage.example.org/remote.php/dav/files/moi/corpus',
  utilisateur: 'moi',
  motDePasse: 'secret-de-test',
  nomCorpus: 'Mon corpus',
}
const accesGitLab = { urlInstance: 'https://gitlab.example.org', compteId: 'compte-1' }
const connexionGitLab: ConnexionGitLabPublique = {
  urlInstance: accesGitLab.urlInstance,
  applicationConnue: true,
  uriCallback: 'http://127.0.0.1:7474/callback',
  comptes: [],
}
const preparationGitLab = {
  urlProjet: `${accesGitLab.urlInstance}/groupe/corpus`, compteId: accesGitLab.compteId,
}
const baseMedia = {
  urlBase: 'https://nuage.example.org/remote.php/dav/files/moi/Medias',
  utilisateur: 'moi',
  motDePasse: 'secret-media',
}
const creationGitLab: DemandeCreationGitLab = {
  ...accesGitLab,
  projetId: 42,
  utilisateur: 'moi',
  nomProjet: 'Dépôt GitLab',
  branche: 'equipe/terrain',
  nomCorpus: 'Mon corpus',
  baseMedia,
}
const { nomCorpus: _nomCorpus, baseMedia: _baseMedia, ...ouvertureGitLab } = creationGitLab
const { nomCorpus: _nomCorpusWebDAV, ...connexionWebDAV } = creationWebDAV

beforeAll(async () => {
  await import('../src/preload/index')
  const exposition = electron.contextBridge.exposeInMainWorld.mock.calls
    .find(([nom]) => nom === 'sonal')
  expect(exposition).toBeDefined()
  api = exposition![1]
})

beforeEach(() => {
  electron.ipcRenderer.invoke.mockReset()
  electron.ipcRenderer.invoke.mockResolvedValue({ resultat: 'main' })
  electron.ipcRenderer.on.mockClear()
  electron.ipcRenderer.removeListener.mockClear()
})

describe('pont IPC des corpus distants', () => {
  const cas: Array<{
    canal: string
    appeler: () => Promise<unknown>
    arguments: unknown[]
  }> = [
    { canal: 'corpus:analyserOperationTheme', appeler: () => api.corpus.analyserOperationTheme(demandeTheme), arguments: [demandeTheme, undefined] },
    { canal: 'corpus:analyserOperationTheme', appeler: () => api.corpus.analyserOperationTheme(demandeTheme, 'op-avant'), arguments: [demandeTheme, 'op-avant'] },
    { canal: 'corpus:detailsOperationTheme', appeler: () => api.corpus.detailsOperationTheme('op-1', 'e1'), arguments: ['op-1', 'e1'] },
    { canal: 'corpus:executerOperationTheme', appeler: () => api.corpus.executerOperationTheme('op-1', demandeTheme, optionsThemes), arguments: ['op-1', demandeTheme, optionsThemes] },
    { canal: 'webdav:lister', appeler: () => api.webdav.lister(), arguments: [] },
    { canal: 'corpus:lireSuiviOperationTheme', appeler: () => api.corpus.lireSuiviOperationTheme(), arguments: [] },
    { canal: 'corpus:preparerRepriseOperationTheme', appeler: () => api.corpus.preparerRepriseOperationTheme('op-1'), arguments: ['op-1'] },
    { canal: 'corpus:reconcilierOperationTheme', appeler: () => api.corpus.reconcilierOperationTheme('op-1'), arguments: ['op-1'] },
    { canal: 'corpus:abandonnerOperationTheme', appeler: () => api.corpus.abandonnerOperationTheme('op-1'), arguments: ['op-1'] },
    { canal: 'webdav:connecter', appeler: () => api.webdav.connecter(connexionWebDAV), arguments: [connexionWebDAV] },
    { canal: 'webdav:creer', appeler: () => api.webdav.creer(creationWebDAV), arguments: [creationWebDAV] },
    { canal: 'webdav:ouvrir', appeler: () => api.webdav.ouvrir('destination-dav', 'secret'), arguments: ['destination-dav', 'secret'] },
    { canal: 'webdav:ouvrir', appeler: () => api.webdav.ouvrir('destination-dav'), arguments: ['destination-dav', undefined] },
    { canal: 'webdav:oublier', appeler: () => api.webdav.oublier('destination-dav'), arguments: ['destination-dav'] },
    { canal: 'gitlab:lister', appeler: () => api.gitlab.lister(), arguments: [] },
    { canal: 'gitlab:preparerProjet', appeler: () => api.gitlab.preparerProjet(preparationGitLab), arguments: [preparationGitLab] },
    { canal: 'gitlab:enregistrerEtOuvrir', appeler: () => api.gitlab.enregistrerEtOuvrir(ouvertureGitLab), arguments: [ouvertureGitLab] },
    { canal: 'gitlab:creerEtOuvrir', appeler: () => api.gitlab.creerEtOuvrir(creationGitLab), arguments: [creationGitLab] },
    { canal: 'gitlab:ouvrir', appeler: () => api.gitlab.ouvrir('destination-gitlab'), arguments: ['destination-gitlab'] },
    { canal: 'gitlab:configurerBaseMedia', appeler: () => api.gitlab.configurerBaseMedia('destination-gitlab', baseMedia), arguments: ['destination-gitlab', baseMedia] },
    { canal: 'gitlab:oublierBaseMedia', appeler: () => api.gitlab.oublierBaseMedia('destination-gitlab'), arguments: ['destination-gitlab'] },
    { canal: 'gitlab:detecterInstance', appeler: () => api.gitlab.detecterInstance(`${accesGitLab.urlInstance}/groupe/corpus`), arguments: [`${accesGitLab.urlInstance}/groupe/corpus`] },
    { canal: 'gitlab:etat', appeler: () => api.gitlab.etat(accesGitLab.urlInstance), arguments: [accesGitLab.urlInstance] },
    { canal: 'gitlab:connecter', appeler: () => api.gitlab.connecter(accesGitLab.urlInstance, 'client-sonal'), arguments: [accesGitLab.urlInstance, 'client-sonal'] },
    { canal: 'gitlab:connecterAvecJeton', appeler: () => api.gitlab.connecterAvecJeton(accesGitLab.urlInstance, 'glpat-secret'), arguments: [accesGitLab.urlInstance, 'glpat-secret'] },
    { canal: 'gitlab:deconnecter', appeler: () => api.gitlab.deconnecter(accesGitLab.urlInstance, 'moi'), arguments: [accesGitLab.urlInstance, 'moi'] },
    { canal: 'gitlab:oublierCompte', appeler: () => api.gitlab.oublierCompte(accesGitLab.urlInstance, 'moi'), arguments: [accesGitLab.urlInstance, 'moi'] },
    { canal: 'gitlab:oublierDestination', appeler: () => api.gitlab.oublierDestination('destination-gitlab'), arguments: ['destination-gitlab'] },
    { canal: 'distant:stockageSecuriseDisponible', appeler: () => api.distant.stockageSecuriseDisponible(), arguments: [] },
    { canal: 'distant:tirer', appeler: () => api.distant.tirer(), arguments: [] },
    { canal: 'distant:listerDossier', appeler: () => api.distant.listerDossier('audio'), arguments: ['audio'] },
    { canal: 'distant:verifierMedia', appeler: () => api.distant.verifierMedia('audio/test.wav'), arguments: ['audio/test.wav'] },
    { canal: 'distant:preparerLectureMedia', appeler: () => api.distant.preparerLectureMedia('entretien'), arguments: ['entretien'] },
    { canal: 'distant:designerAudio', appeler: () => api.distant.designerAudio('entretien', 'audio/test.wav'), arguments: ['entretien', 'audio/test.wav'] },
    { canal: 'distant:televerserAudio', appeler: () => api.distant.televerserAudio('/local/test.wav', 'audio/test.wav'), arguments: ['/local/test.wav', 'audio/test.wav'] },
    { canal: 'distant:orphelins', appeler: () => api.distant.orphelins(), arguments: [] },
    { canal: 'distant:reprendreOrphelin', appeler: () => api.distant.reprendreOrphelin('verrous/entretien.lock.json'), arguments: ['verrous/entretien.lock.json'] },
    { canal: 'distant:abandonnerOrphelin', appeler: () => api.distant.abandonnerOrphelin('verrous/entretien.lock.json'), arguments: ['verrous/entretien.lock.json'] },
    { canal: 'distant:listerDivergences', appeler: () => api.distant.listerDivergences(), arguments: [] },
    { canal: 'distant:lireDivergence', appeler: () => api.distant.lireDivergence('sessions/copie.json'), arguments: ['sessions/copie.json'] },
    { canal: 'distant:supprimerDivergence', appeler: () => api.distant.supprimerDivergence('sessions/copie.json'), arguments: ['sessions/copie.json'] },
    { canal: 'distant:noterEntretienOuvert', appeler: () => api.distant.noterEntretienOuvert(null), arguments: [null] },
  ]

  it.each(cas)('transmet $canal et ses arguments sans transformation', async (cas) => {
    await expect(cas.appeler()).resolves.toEqual({ resultat: 'main' })
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledExactlyOnceWith(cas.canal, ...cas.arguments)
  })

  it('ne conserve pas les anciennes entrées ambiguës ou inutilisées', () => {
    for (const nom of ['lister', 'connecter', 'creer', 'ouvrir', 'oublier']) {
      expect(api.distant).not.toHaveProperty(nom)
    }
    expect(api.gitlab).not.toHaveProperty('decouvrirProjets')
    expect(api.gitlab).not.toHaveProperty('decouvrirBranches')
    expect(api.gitlab).not.toHaveProperty('listerBranches')
    expect(api.gitlab).not.toHaveProperty('lireUtilisateur')
    expect(api.gitlab).not.toHaveProperty('chargerProjet')
  })

  it('relaie les erreurs du main sans second appel', async () => {
    const erreur = new Error('Destination inaccessible.')
    electron.ipcRenderer.invoke.mockRejectedValueOnce(erreur)
    await expect(api.webdav.ouvrir('destination')).rejects.toBe(erreur)
    expect(electron.ipcRenderer.invoke).toHaveBeenCalledTimes(1)
  })

  it('abonne et désabonne les états de lecture distante', () => {
    const recevoir = vi.fn()
    const arreter = api.distant.surEtatLectureMedia(recevoir)
    const [canal, ecouteur] = electron.ipcRenderer.on.mock.calls[0]
    expect(canal).toBe('distant:etatLectureMedia')
    ecouteur({}, 'entretien', 'version-changee')
    expect(recevoir).toHaveBeenCalledExactlyOnceWith('entretien', 'version-changee')
    arreter()
    expect(electron.ipcRenderer.removeListener)
      .toHaveBeenCalledExactlyOnceWith('distant:etatLectureMedia', ecouteur)
  })

  it('abonne et désabonne la progression des opérations de thèmes avec son identifiant', () => {
    const recevoir = vi.fn()
    const arreter = api.corpus.surProgressionOperationTheme(recevoir)
    const [canal, ecouteur] = electron.ipcRenderer.on.mock.calls[0]
    expect(canal).toBe('corpus:progressionOperationTheme')
    const progression = { operationId: 'op-1', phase: 'entretiens', termines: 2, total: 4, reussis: 1, echecs: 1 }
    ecouteur({}, progression)
    expect(recevoir).toHaveBeenCalledExactlyOnceWith(progression)
    arreter()
    expect(electron.ipcRenderer.removeListener).toHaveBeenCalledExactlyOnceWith(canal, ecouteur)
  })

  it('abonne et désabonne la progression commune aux fournisseurs', () => {
    const recevoir = vi.fn()
    const arreter = api.distant.surProgression(recevoir)
    const [canal, ecouteur] = electron.ipcRenderer.on.mock.calls[0]
    expect(canal).toBe('distant:progression')
    const progression: ProgressionTransfert = {
      sens: 'rapatriement', chemin: 'audio/test.wav', octets: 25, total: 100,
    }
    ecouteur({}, progression)
    expect(recevoir).toHaveBeenCalledExactlyOnceWith(progression)
    arreter()
    expect(electron.ipcRenderer.removeListener)
      .toHaveBeenCalledExactlyOnceWith('distant:progression', ecouteur)
  })
})
