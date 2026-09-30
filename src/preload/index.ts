import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  Categorie,
  CibleValeur,
  CorpusFichier,
  DossierCorpus,
  EntreeRecent,
  EtatDemo,
  ItemLotValeur,
  CibleRegleAnon,
  EtatDemoComplet,
  LectureEntretien,
  MarqueurDemo,
  MatriceCorpus,
  ModeTriEntretiens,
  ModeleEAV,
  NoteCategory,
  ResultatLotValeur,
  ResultatLotAnon,
  OuvertureCorpus,
  OuvertureEntretienEdition,
  PatchCategorie,
  PayloadEntretien,
  TranscriptionEntretien,
  RegleAnon,
  ResultatArchiveCorpus,
  ResultatSuppression,
  ResultatSuppressionCategorie,
  SegmentThematique,
  Variable,
  VerificationDossierDemo,
  DemandeExportDocx,
  DemandeExportPdf,
  DemandeExportDocxCorpus,
  ParamsAnon,
} from '../shared/format'
import type { ApiGitLab } from '../shared/gitlab'
import type { ApiWebDAV } from '../shared/webdav'
import type {
  InventaireDocsCadre,
  ResultatLectureDocsCadre,
  ResultatMutationDocsCadre,
  SourceDocumentCadre,
} from '../shared/docsCadre'
import type { ScanRegle } from '../shared/corpus/scanAnon'
import type { CommandePersonnes, InventairePersonnes } from '../shared/corpus/personnes'
import type { CommandeNotes, InventaireNotes } from '../shared/corpus/notes'
import type { EntreeJournalCorpusVue, ResultatAnnulationCorpus } from '../shared/corpus/journal'
import type { CommandeRecueils } from '../shared/corpus/recueils'
import type { ResultatInstantaneCorpus, ResultatEcritureCorpus } from '../shared/export/corpus'
import type { QualcoderExportModel } from '../shared/export/qualcoder/modele'
import type { CommandeCas } from '../shared/corpus/cas'
import type { CommandeTableauBord } from '../shared/corpus/tableaubord'
import type { ImpactSuppressionEntretien } from '../shared/corpus/suppressionEntretien'
import type {
  ApiDistant,
  EtatSessionPublic,
  ProgressionTransfert,
  ResultatFermetureSession,
} from '../shared/distant'
import type { AnalyseCrp, DemandeMigration, VerificationDossierMigration } from '../shared/corpus/migrationCrp'
import { CORPUS_SUPPRIME } from '../shared/format'

// Invocation IPC avec garde « corpus courant supprimé » :
// tout appel qui échoue avec la sentinelle CORPUS_SUPPRIME déclenche une bascule.
// Le main bascule vers le récent vivant suivant (`corpus:apresSuppression`),
// prévient les abonnés (surSuppressionCourant), puis LAISSE PASSER l'erreur ;
// l'opération visait l'ancien corpus, elle ne doit pas s'exécuter sur le nouveau.
const ecoutesSuppression: ((r: OuvertureCorpus | null) => void)[] = []
function invoquer<T>(canal: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(canal, ...args).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    if (!message.includes(CORPUS_SUPPRIME)) throw err
    return ipcRenderer.invoke('corpus:apresSuppression').then((suivant) => {
      for (const cb of [...ecoutesSuppression]) cb(suivant as OuvertureCorpus | null)
      throw err
    })
  }) as Promise<T>
}

// Pont du store « dossier de corpus » : le renderer ne touche JAMAIS le disque directement ;
// tout passe par le main process.
contextBridge.exposeInMainWorld('sonal', {
  platform: process.platform,
  application: {
    /** Demande du main avant fermeture : attendre le callback, puis acquitter. */
    surPreparationFermeture: (cb: () => Promise<void>): (() => void) => {
      const ecouteur = async (_e: Electron.IpcRendererEvent, jeton: string): Promise<void> => {
        try {
          await cb()
          ipcRenderer.send('application:fermeturePrete', jeton, true)
        } catch {
          ipcRenderer.send('application:fermeturePrete', jeton, false)
        }
      }
      ipcRenderer.on('application:preparerFermeture', ecouteur)
      return () => ipcRenderer.removeListener('application:preparerFermeture', ecouteur)
    },
    surSuspensionSysteme: (cb: () => Promise<void>): (() => void) => {
      const ecouteur = (): void => { void cb() }
      ipcRenderer.on('application:systemeSuspendu', ecouteur)
      return () => ipcRenderer.removeListener('application:systemeSuspendu', ecouteur)
    },
    surReveilSysteme: (cb: () => Promise<void>): (() => void) => {
      const ecouteur = (): void => { void cb() }
      ipcRenderer.on('application:systemeReveille', ecouteur)
      return () => ipcRenderer.removeListener('application:systemeReveille', ecouteur)
    },
  },
  /** Menu applicatif (construit côté main) : les items émettent un canal,
   *  le renderer route vers les actions/modales existantes. */
  menu: {
    /** Action de menu (voir menuApplication.ts). Renvoie le désabonnement. */
    surAction: (
      cb: (action: string, mode?: ModeTriEntretiens) => void,
    ): (() => void) => {
      const ecouteur = (
        _e: Electron.IpcRendererEvent,
        action: string,
        mode?: ModeTriEntretiens,
      ): void => cb(action, mode)
      ipcRenderer.on('menu:action', ecouteur)
      return () => ipcRenderer.removeListener('menu:action', ecouteur)
    },
    /** Choix d'un corpus récent (entrée locale OU distante, jamais un chemin
     *  miroir) ; le renderer route vers ouvrirRecent. Renvoie le désabonnement. */
    surOuvrirRecent: (cb: (entree: EntreeRecent) => void): (() => void) => {
      const ecouteur = (_e: Electron.IpcRendererEvent, entree: EntreeRecent): void => cb(entree)
      ipcRenderer.on('menu:ouvrirRecent', ecouteur)
      return () => ipcRenderer.removeListener('menu:ouvrirRecent', ecouteur)
    },
  },
  /** Docs cadre projet : documents de méthode propres au corpus courant.
   *  Le renderer ne transmet qu'une source et un nom, jamais un chemin.
   *  Les mutations sont refusées par le main en corpus distant et pour les
   *  exemples (lecture + copie seulement). */
  docsCadre: {
    /** Inventaire complet : mode, documents du corpus, exemples embarqués. */
    lister: (): Promise<InventaireDocsCadre> => invoquer('docsCadre:lister'),
    /** Fiche + aperçu d'un document ; formats non pris en charge expliqués. */
    lireApercu: (source: SourceDocumentCadre, nom: string): Promise<ResultatLectureDocsCadre> =>
      invoquer('docsCadre:lireApercu', source, nom),
    /** Sélecteur natif + copie du fichier choisi dans DocsCadre/ ;
     *  un 2e appel avec `nomSouhaite` reprend après collision (suffixe proposé). */
    ajouterFichier: (nomSouhaite?: string): Promise<ResultatMutationDocsCadre> =>
      invoquer('docsCadre:ajouterFichier', nomSouhaite),
    /** Copie d'un fichier glissé-déposé vers DocsCadre/ ; jamais un
     *  écrasement (homonyme refusé). Vaut pour le corpus local uniquement. */
    deposer: (cheminSource: string): Promise<ResultatMutationDocsCadre> =>
      invoquer('docsCadre:deposer', cheminSource),
    renommer: (ancienNom: string, nouveauNom: string): Promise<ResultatMutationDocsCadre> =>
      invoquer('docsCadre:renommer', ancienNom, nouveauNom),
    /** Suppression douce : le fichier part sous corbeille/DocsCadre/. */
    supprimer: (nom: string): Promise<ResultatMutationDocsCadre> =>
      invoquer('docsCadre:supprimer', nom),
    /** Ouvre le document avec l'application par défaut du poste. */
    ouvrirAvecApplication: (nom: string): Promise<void> =>
      invoquer('docsCadre:ouvrir', nom),
    /** Ouvre le dossier DocsCadre/ dans le gestionnaire de fichiers. */
    ouvrirDossierLocal: (): Promise<void> => invoquer('docsCadre:ouvrirDossier'),
    /** Copie EXACTE du fichier original vers une destination choisie
     *  (false si annulé). Flux streamé pour un distant volumineux. */
    enregistrerCopie: (source: SourceDocumentCadre, nom: string): Promise<boolean> =>
      invoquer('docsCadre:enregistrerCopie', source, nom),
    /** Corpus distant : ouvre le dossier du corpus dans l'app Fichiers Nextcloud. */
    ouvrirDansNextcloud: (): Promise<void> => invoquer('docsCadre:ouvrirDansNextcloud'),
  },
  corpus: {
    /** S'abonner aux bascules « corpus courant supprimé sur disque ».
     *  Le paramètre est le nouveau courant (`OuvertureCorpus`), ou null si
     *  aucun récent vivant — l'UI repart d'un état vide. Renvoie le désabonnement. */
    surSuppressionCourant: (cb: (r: OuvertureCorpus | null) => void): (() => void) => {
      ecoutesSuppression.push(cb)
      return () => {
        const i = ecoutesSuppression.indexOf(cb)
        if (i >= 0) ecoutesSuppression.splice(i, 1)
      }
    },
    ouvrir: (): Promise<CorpusFichier> => invoquer('corpus:ouvrir'),
    dossierCourant: (): Promise<DossierCorpus> => invoquer('corpus:dossierCourant'),
    recents: (): Promise<EntreeRecent[]> => invoquer('corpus:recents'),
    retirerRecent: (
      entree: { type: 'distant'; id: string } | { type: 'local'; dir: string },
    ): Promise<boolean> => invoquer('corpus:retirerRecent', entree),
    ouvrirDossier: (dir: string): Promise<OuvertureCorpus> =>
      invoquer('corpus:ouvrirDossier', dir),
    choisirDossier: (): Promise<OuvertureCorpus | null> =>
      invoquer('corpus:choisirDossier'),
    /** Vérifie si un dossier est DÉJÀ un corpus (modale « Nouveau corpus… »). */
    verifierNouveau: (dir: string): Promise<{ dejaCorpus: boolean }> =>
      invoquer('corpus:verifierNouveau', dir),
    /** « Nouveau corpus » : crée (ou ouvre) et bascule le store dessus. */
    creerNouveau: (dir: string, nom: string): Promise<OuvertureCorpus> =>
      invoquer('corpus:creerNouveau', dir, nom),
    lireEntretien: (id: string): Promise<LectureEntretien> =>
      invoquer('corpus:lireEntretien', id),
    ouvrirEntretienPourEdition: (id: string): Promise<OuvertureEntretienEdition> =>
      invoquer('corpus:ouvrirEntretienPourEdition', id),
    /** Corpus distant : fermer la session (publication finale + libération du verrou).
     *  Sans effet en corpus local. */
    fermerEntretien: (id: string): Promise<ResultatFermetureSession> =>
      invoquer('corpus:fermerEntretien', id),
    /** Signale sans attendre le prochain poll qu'une session a perdu son verrou. */
    surSessionDegradee: (cb: (id: string) => void): (() => void) => {
      const ecouteur = (_e: Electron.IpcRendererEvent, id: string): void => cb(id)
      ipcRenderer.on('distant:sessionDegradee', ecouteur)
      return () => ipcRenderer.removeListener('distant:sessionDegradee', ecouteur)
    },
    /** État de session distant (poll UI) pour un entretien ouvert. */
    etatSession: (id: string): Promise<EtatSessionPublic> =>
      invoquer('distant:etatSession', id),
    revaliderSession: (id: string): Promise<EtatSessionPublic> =>
      invoquer('corpus:revaliderSession', id),
    /** « Publier maintenant » : PUT If-Match sous verrou toujours tenu.
     *  { ok: false, raison: 'divergence' } = le serveur a changé sous nos pieds :
     *  la copie locale a été mise de côté, JAMAIS écrasée. */
    publierEntretien: (id: string): Promise<{ ok: boolean; raison?: string }> =>
      invoquer('distant:publierEntretien', id),
    ecrireEntretien: (id: string, p: PayloadEntretien): Promise<string> =>
      invoquer('corpus:ecrireEntretien', id, p),
    preserverEntretienDegrade: (id: string, p: PayloadEntretien): Promise<boolean> =>
      invoquer('corpus:preserverEntretienDegrade', id, p),
    remplacerTranscription: (id: string, t: TranscriptionEntretien): Promise<string | null> =>
      invoquer('corpus:remplacerTranscription', id, t),
    creerEntretienVide: (titre: string): Promise<{ id: string; corpus: CorpusFichier }> =>
      invoquer('corpus:creerEntretienVide', titre),
    renommerEntretien: (id: string, titre: string): Promise<CorpusFichier> =>
      invoquer('corpus:renommerEntretien', id, titre),
    trierEntretiens: (mode: ModeTriEntretiens): Promise<CorpusFichier> =>
      invoquer('corpus:trierEntretiens', mode),
    analyserSuppressionEntretien: (id: string): Promise<ImpactSuppressionEntretien> =>
      invoquer('corpus:analyserSuppressionEntretien', id),
    supprimerEntretien: (
      id: string,
      impactAttendu?: ImpactSuppressionEntretien,
    ): Promise<CorpusFichier> => invoquer('corpus:supprimerEntretien', id, impactAttendu),
    importer: (
      titre: string,
      payload: PayloadEntretien,
      codebook: Categorie[],
      variables: Variable[],
      reglesAnon?: RegleAnon[],
    ): Promise<{ id: string; corpus: CorpusFichier }> =>
      invoquer('corpus:importer', titre, payload, codebook, variables, reglesAnon),
    ajouterCategorie: (
      nom: string,
      parent: string | null = null,
    ): Promise<{ id: string; corpus: CorpusFichier }> =>
      invoquer('corpus:ajouterCategorie', nom, parent),
    modifierCategorie: (id: string, patch: PatchCategorie): Promise<CorpusFichier> =>
      invoquer('corpus:modifierCategorie', id, patch),
    deplacerCategorie: (id: string, sens: -1 | 1): Promise<CorpusFichier> =>
      invoquer('corpus:deplacerCategorie', id, sens),
    migrerCategorie: (id: string, nouveauParent: string | null): Promise<CorpusFichier> =>
      invoquer('corpus:migrerCategorie', id, nouveauParent),
    supprimerCategorie: (id: string, exceptId?: string): Promise<ResultatSuppressionCategorie> =>
      invoquer('corpus:supprimerCategorie', id, exceptId),
    usagesParCategorie: (): Promise<Record<string, number>> =>
      invoquer('corpus:usagesParCategorie'),
    // Catégories de note (définitions corpus)
    categoriesNote: (): Promise<NoteCategory[]> => invoquer('corpus:categoriesNote'),
    ajouterCategorieNote: (
      nom: string,
      couleur: string,
    ): Promise<{ id: string; corpus: CorpusFichier }> =>
      invoquer('corpus:ajouterCategorieNote', nom, couleur),
    renommerCategorieNote: (id: string, nom: string): Promise<CorpusFichier> =>
      invoquer('corpus:renommerCategorieNote', id, nom),
    majCouleurCategorieNote: (id: string, couleur: string): Promise<CorpusFichier> =>
      invoquer('corpus:majCouleurCategorieNote', id, couleur),
    supprimerCategorieNote: (id: string): Promise<ResultatSuppressionCategorie> =>
      invoquer('corpus:supprimerCategorieNote', id),
    compterUsagesCategorieNote: (id: string): Promise<number> =>
      invoquer('corpus:compterUsagesCategorieNote', id),
    resumesThematiques: (): Promise<Record<string, SegmentThematique[]>> =>
      invoquer('corpus:resumesThematiques'),
    recueilsCommander: (commande: CommandeRecueils): Promise<CorpusFichier> =>
      invoquer('corpus:recueilsCommander', commande),
    casCommander: (commande: CommandeCas): Promise<CorpusFichier> =>
      invoquer('corpus:casCommander', commande),
    tableaubordCommander: (commande: CommandeTableauBord): Promise<CorpusFichier> =>
      invoquer('corpus:tableaubordCommander', commande),
    reglesAnon: (): Promise<RegleAnon[]> => invoquer('corpus:reglesAnon'),
    scanAnon: (): Promise<ScanRegle[]> => invoquer('corpus:scanAnon'),
    notesInventaire: (): Promise<InventaireNotes> => invoquer('corpus:notesInventaire'),
    notesCommander: (commande: CommandeNotes): Promise<string | null> =>
      invoquer('corpus:notesCommander', commande),
    personnesInventaire: (): Promise<InventairePersonnes> => invoquer('corpus:personnesInventaire'),
    personnesCommander: (commande: CommandePersonnes, depuisRepertoire = false): Promise<string | null> =>
      invoquer('corpus:personnesCommander', commande, depuisRepertoire),
    journalLister: (): Promise<EntreeJournalCorpusVue[]> => invoquer('corpus:journalLister'),
    journalAnnuler: (id: string): Promise<ResultatAnnulationCorpus> => invoquer('corpus:journalAnnuler', id),
    regleAnonParEntite: (entite: string): Promise<RegleAnon | undefined> =>
      invoquer('corpus:regleAnonParEntite', entite),
    regleAnonCreer: (entite: string, pseudos: string[]): Promise<{ regle: RegleAnon; existait: boolean }> =>
      invoquer('corpus:regleAnonCreer', entite, pseudos),
    regleAnonAjouterPseudo: (id: string, pseudo: string): Promise<RegleAnon | null> =>
      invoquer('corpus:regleAnonAjouterPseudo', id, pseudo),
    regleAnonUtiliseeAilleurs: (id: string, exceptId?: string): Promise<boolean> =>
      invoquer('corpus:regleAnonUtiliseeAilleurs', id, exceptId),
    regleAnonSupprimer: (id: string): Promise<void> => invoquer('corpus:regleAnonSupprimer', id),
    appliquerRegleAnonLot: (cibles: CibleRegleAnon[]): Promise<ResultatLotAnon> =>
      invoquer('corpus:appliquerRegleAnonLot', cibles),
    paramsAnonLire: (): Promise<ParamsAnon> => invoquer('corpus:paramsAnonLire'),
    paramsAnonEcrire: (params: ParamsAnon): Promise<ParamsAnon> =>
      invoquer('corpus:paramsAnonEcrire', params),
    regleAnonCategoriser: (id: string, categorie: string | null): Promise<RegleAnon | null> =>
      invoquer('corpus:regleAnonCategoriser', id, categorie),
    compterUsagesCategorie: (code: string, exceptId?: string): Promise<number> =>
      invoquer('corpus:compterUsagesCategorie', code, exceptId),
    ajouterVariable: (
      lib: string,
      portee: 'entretien' | 'locuteur',
    ): Promise<{ id: string; corpus: CorpusFichier }> =>
      invoquer('corpus:ajouterVariable', lib, portee),
    modifierVariable: (id: string, patch: Partial<Variable>): Promise<CorpusFichier> =>
      invoquer('corpus:modifierVariable', id, patch),
    supprimerVariable: (id: string): Promise<ResultatSuppression> =>
      invoquer('corpus:supprimerVariable', id),
    ajouterModalite: (idVar: string, lib: string): Promise<CorpusFichier> =>
      invoquer('corpus:ajouterModalite', idVar, lib),
    modifierModalite: (idVar: string, idMod: string, lib: string): Promise<CorpusFichier> =>
      invoquer('corpus:modifierModalite', idVar, idMod, lib),
    supprimerModalite: (idVar: string, idMod: string): Promise<ResultatSuppression> =>
      invoquer('corpus:supprimerModalite', idVar, idMod),
    matrice: (): Promise<MatriceCorpus> => invoquer('corpus:matrice'),
    marquerDemo: (marqueur: MarqueurDemo): Promise<CorpusFichier> =>
      invoquer('corpus:marquerDemo', marqueur),
    assignerAudio: (id: string, source: string): Promise<{ audioRef: string } | null> =>
      invoquer('corpus:assignerAudio', id, source),
    /** Détache l'audio d'un entretien (ref + onde dérivée) — le texte reste. */
    effacerAudio: (id: string): Promise<{ audioRef: null }> => invoquer('corpus:effacerAudio', id),
    ecrireWaveform: (id: string, png: Uint8Array): Promise<string> =>
      invoquer('corpus:ecrireWaveform', id, png),
    /** Copie de sauvegarde du corpus LOCAL en archive ZIP (refus en distant). */
    copieSauvegardeZip: (): Promise<ResultatArchiveCorpus> =>
      invoquer('corpus:copieSauvegardeZip'),
    /** « Associer l'audio local… » : référence un fichier de CE poste,
     *  pour un entretien dont l'audioRef partagée n'y pointe nulle part. */
    associerAudioLocal: (id: string, source: string): Promise<{ audioRef: string } | null> =>
      invoquer('corpus:associerAudioLocal', id, source),
    audios: (): Promise<Record<string, { audio: string | null; waveform: string | null }>> =>
      invoquer('corpus:audios'),
    verifierAudios: (): Promise<Record<string, 'ok' | 'manquant'>> =>
      invoquer('corpus:verifierAudios'),
    poserValeur: (
      entretienId: string,
      cible: CibleValeur,
      idVar: string,
      idMod: string,
    ): Promise<boolean> =>
      invoquer('corpus:poserValeur', entretienId, cible, idVar, idMod),
    /** Lot « modifier en lot » : une valeur appliquée à plusieurs entretiens ;
     *  verrou court par entretien côté main, échecs nommés, un échec ne bloque
     *  jamais les autres. */
    poserValeurLot: (items: ItemLotValeur[]): Promise<ResultatLotValeur> =>
      invoquer('corpus:poserValeurLot', items),
  },
  gitlab: {
    lister: () => invoquer('gitlab:lister'),
    detecterInstance: (urlProjet) => invoquer('gitlab:detecterInstance', urlProjet),
    etat: (urlInstance) => invoquer('gitlab:etat', urlInstance),
    connecter: (urlInstance, clientId) => invoquer('gitlab:connecter', urlInstance, clientId),
    connecterAvecJeton: (urlInstance, jeton) =>
      invoquer('gitlab:connecterAvecJeton', urlInstance, jeton),
    deconnecter: (urlInstance, utilisateur) =>
      invoquer('gitlab:deconnecter', urlInstance, utilisateur),
    oublierCompte: (urlInstance, utilisateur) =>
      invoquer('gitlab:oublierCompte', urlInstance, utilisateur),
    preparerProjet: (demande) => invoquer('gitlab:preparerProjet', demande),
    enregistrerEtOuvrir: (demande) => invoquer('gitlab:enregistrerEtOuvrir', demande),
    creerEtOuvrir: (demande) => invoquer('gitlab:creerEtOuvrir', demande),
    ouvrir: (id) => invoquer('gitlab:ouvrir', id),
    configurerBaseMedia: (destinationId, demande) =>
      invoquer('gitlab:configurerBaseMedia', destinationId, demande),
    oublierBaseMedia: (destinationId) =>
      invoquer('gitlab:oublierBaseMedia', destinationId),
    oublierDestination: (id) => invoquer('gitlab:oublierDestination', id),
  } satisfies ApiGitLab,
  webdav: {
    lister: () => invoquer('webdav:lister'),
    connecter: (demande) => invoquer('webdav:connecter', demande),
    creer: (demande) => invoquer('webdav:creer', demande),
    ouvrir: (id, motDePasse) => invoquer('webdav:ouvrir', id, motDePasse),
    oublier: (id) => invoquer('webdav:oublier', id),
  } satisfies ApiWebDAV,
  distant: {
    stockageSecuriseDisponible: () => invoquer('distant:stockageSecuriseDisponible'),
    tirer: () => invoquer('distant:tirer'),
    listerDossier: (dossier) => invoquer('distant:listerDossier', dossier),
    verifierMedia: (chemin) => invoquer('distant:verifierMedia', chemin),
    preparerLectureMedia: (id) => invoquer('distant:preparerLectureMedia', id),
    surEtatLectureMedia: (cb) => {
      const ecouteur = (
        _e: Electron.IpcRendererEvent,
        id: Parameters<typeof cb>[0],
        motif: Parameters<typeof cb>[1],
      ): void => cb(id, motif)
      ipcRenderer.on('distant:etatLectureMedia', ecouteur)
      return () => ipcRenderer.removeListener('distant:etatLectureMedia', ecouteur)
    },
    designerAudio: (id, cheminAudio) => invoquer('distant:designerAudio', id, cheminAudio),
    televerserAudio: (sourceLocale, cheminCible) =>
      invoquer('distant:televerserAudio', sourceLocale, cheminCible),
    orphelins: () => invoquer('distant:orphelins'),
    surProgression: (cb) => {
      const ecouteur = (_e: Electron.IpcRendererEvent, p: ProgressionTransfert): void => cb(p)
      ipcRenderer.on('distant:progression', ecouteur)
      return () => ipcRenderer.removeListener('distant:progression', ecouteur)
    },
    reprendreOrphelin: (cheminVerrou) => invoquer('distant:reprendreOrphelin', cheminVerrou),
    abandonnerOrphelin: (cheminVerrou) => invoquer('distant:abandonnerOrphelin', cheminVerrou),
    listerDivergences: () => invoquer('distant:listerDivergences'),
    lireDivergence: (chemin) => invoquer('distant:lireDivergence', chemin),
    supprimerDivergence: (chemin) => invoquer('distant:supprimerDivergence', chemin),
    noterEntretienOuvert: (id) => invoquer('distant:noterEntretienOuvert', id),
  } satisfies ApiDistant,
  media: {
    /** Largeur (px) du panneau vidéo mémorisée pour un corpus (dir), ou null. */
    lireLargeurVideo: (dir: string): Promise<number | null> =>
      invoquer('media:lireLargeurVideo', dir),
    /** Mémorise la largeur du panneau vidéo pour un corpus (dir). */
    ecrireLargeurVideo: (dir: string, largeur: number): Promise<void> =>
      invoquer('media:ecrireLargeurVideo', dir, largeur),
  },
  profil: {
    /** Dernier signataire des commentaires (settings.json du profil). */
    signataire: (): Promise<string> => invoquer('profil:lireSignataire'),
    memoriserSignataire: (nom: string): Promise<void> =>
      invoquer('profil:memoriserSignataire', nom),
  },
  dialog: {
    /** Choisir un fichier d'entretien (contenu lu ici).
     *  `defaultPath` est hinté par la démo (racineSources) pour que le dialogue
     *  natif s'ouvre au bon endroit. */
    choisirTexte: (defaultPath?: string): Promise<{ nom: string; contenu: string } | null> =>
      invoquer('dialog:choisirTexte', defaultPath),
    /** Choisir une transcription chronométrée (SRT/VTT) — « Assigner un srt… ». */
    choisirSrt: (defaultPath?: string): Promise<{ nom: string; contenu: string } | null> =>
      invoquer('dialog:choisirSrt', defaultPath),
    /** Choisir un fichier audio (chemin référencé, jamais copié). */
    choisirAudio: (defaultPath?: string): Promise<string | null> =>
      invoquer('dialog:choisirAudio', defaultPath),
    /** Choisir un DOSSIER pur (aucun effet de bord) — modale démo à deux dossiers ;
     *  `kind` hinte le défaut Documents/Sonal/démo/<kind>. */
    choisirDossier: (kind?: 'sources' | 'corpus'): Promise<string | null> =>
      invoquer('dialog:choisirDossier', kind),
    choisirExport: (nomSuggere: string, contenu: string): Promise<string | null> =>
      invoquer('dialog:choisirExport', nomSuggere, contenu),
  },
  /** Exports d'entretien dont le BUFFER est construit côté main (DOCX, PDF). */
  export: {
    /** DOCX : document intermédiaire assemblé par le renderer, buffer posé au main. */
    entretienDocx: (demande: DemandeExportDocx): Promise<string | null> =>
      invoquer('export:entretienDocx', demande),
    /** PDF : le HTML autonome est imprimé par le main (printToPDF). */
    entretienPdf: (demande: DemandeExportPdf): Promise<string | null> =>
      invoquer('export:entretienPdf', demande),
    /** URL audio locale vérifiée pour l'export HTML ; null si média absent
     *  ou inaccessible (le chemin est whiteliste par le main). */
    audioLocal: (audioRef: string): Promise<string | null> =>
      invoquer('export:audioLocal', audioRef),
    /** Instantané d'un entretien NON ouvert, assemblé par le main depuis les
     *  fichiers du corpus (export de lot) ; échec typé sinon. */
    instantaneCorpus: (id: string): Promise<ResultatInstantaneCorpus> =>
      invoquer('export:instantaneCorpus', id),
    /** Session d'écriture d'un LOT de corpus : dossier choisi une fois, puis
     *  écritures atomiques limitées à ce dossier (noms re-sécurisés au main). */
    corpus: {
      choisirDossier: (nomSuggere: string): Promise<string | null> =>
        invoquer('export:corpusChoisirDossier', nomSuggere),
      lister: (): Promise<string[]> => invoquer('export:corpusLister'),
      ecrireTexte: (nom: string, contenu: string): Promise<ResultatEcritureCorpus> =>
        invoquer('export:corpusEcrireTexte', nom, contenu),
      ecrireDocx: (demande: DemandeExportDocxCorpus, nom: string): Promise<ResultatEcritureCorpus> =>
        invoquer('export:corpusEcrireDocx', demande, nom),
      ecrirePdf: (nom: string, html: string): Promise<ResultatEcritureCorpus> =>
        invoquer('export:corpusEcrirePdf', nom, html),
      copierMedia: (urlAudio: string): Promise<ResultatEcritureCorpus> =>
        invoquer('export:corpusCopierMedia', urlAudio),
      ecrireQualcoder: (modele: QualcoderExportModel): Promise<void> =>
        invoquer('export:corpusEcrireQualcoder', modele),
      fermer: (): Promise<void> => invoquer('export:corpusFermer'),
    },
    /** Choisir un fichier MODÈLE de modalités (JSON, contenu lu ici). */
    choisirJson: (defaultPath?: string): Promise<{ nom: string; contenu: string } | null> =>
      invoquer('dialog:choisirJson', defaultPath),
  },
  modeles: {
    /** Registre « Mes modèles » du profil (settings.json), partagé entre corpus. */
    lire: (): Promise<ModeleEAV[]> => invoquer('modeles:lire'),
    /** Ajoute (ou remplace, par nom insensible à la casse) un modèle IMPORTÉ. */
    ajouter: (modele: ModeleEAV): Promise<ModeleEAV[]> => invoquer('modeles:ajouter', modele),
  },
  fichier: {
    // Chemin réel d'un File GLISSÉ-DÉPOSÉ (modale d'ajout) ;
    // `File.path` n'existe plus, seul le preload peut le résoudre (webUtils).
    cheminDe: (f: File): string => webUtils.getPathForFile(f),
  },
  migrer: {
    /** Choix d'un `.crp` SonalPi1 : dialogue + lecture + analyse (aperçu). */
    choisirCrp: (): Promise<{ chemin: string; analyse: AnalyseCrp } | null> =>
      invoquer('migrer:choisirCrp'),
    /** Choix du dossier DÉDIÉ, pré-rempli Documents/Sonal/<nom>. */
    choisirDossier: (nom: string): Promise<string | null> =>
      invoquer('migrer:choisirDossier', nom),
    /** Garde « on n'écrase jamais ». */
    verifierDossier: (dir: string): Promise<VerificationDossierMigration> =>
      invoquer('migrer:verifierDossier', dir),
    /** Crée le corpus SonalPi2 dans le dossier dédié et l'OUVRE. */
    executer: (req: DemandeMigration): Promise<OuvertureCorpus> =>
      invoquer('migrer:executer', req),
    /** Lit le `.Sonal` d'un entretien SonalPi1. */
    lireSonal: (
      cheminCrp: string,
      rtrPath: string | null,
    ): Promise<{ nom: string; contenu: string } | null> =>
      invoquer('migrer:lireSonal', cheminCrp, rtrPath),
  },
  demo: {
    /** Copie UNE FOIS les sources bundled CorpusTest/ (srt/ + audio/) ;
     *  elles arrivent dans le dossier choisi par l'utilisateur,
     *  puis le corpus les RÉFÉRENCE. */
    copierSources: (racine: string): Promise<void> =>
      invoquer('demo:copierSources', racine),
    /** Lit un fichier texte des sources (ex. 'srt/1Coordinatrice.srt'). */
    lireSource: (racine: string, rel: string): Promise<{ nom: string; contenu: string }> =>
      invoquer('demo:lireSource', racine, rel),
    /** Chemin absolu d'un média des sources (ex. 'audio/E2.mp3'). */
    cheminAudio: (racine: string, rel: string): Promise<string> =>
      invoquer('demo:cheminAudio', racine, rel),
    /** Mémoire démo persistée (settings.json) : dossiers mémorisés,
     *  plus présence réelle sur disque (la modale adapte ses questions). */
    etat: (): Promise<EtatDemoComplet | null> => invoquer('demo:etat'),
    /** Mémoire démo persistée : à appeler après chaque préparation réussie. */
    memoriser: (etat: EtatDemo): Promise<void> => invoquer('demo:memoriser', etat),
    /** Garde de la modale : le dossier choisi pour le corpus de test ;
     *  refus s'il porte déjà un travail (marqué démo, non vide, illisible) ;
     *  un squelette amorcé vide passe. */
    verifierCorpus: (dir: string): Promise<VerificationDossierDemo> =>
      invoquer('demo:verifierCorpus', dir),
  },
})
