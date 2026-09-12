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
  ResultatSuppression,
  ResultatSuppressionCategorie,
  SegmentThematique,
  Variable,
  VerificationDossierDemo,
  ParamsAnon,
} from '../shared/format'
import type { DemandeCreationDistante, ResultatFermetureSession } from '../shared/distant'
import type { ScanRegle } from '../shared/corpus/scanAnon'
import type { CommandePersonnes, InventairePersonnes } from '../shared/corpus/personnes'
import type { CommandeNotes, InventaireNotes } from '../shared/corpus/notes'
import type { EntreeJournalCorpusVue, ResultatAnnulationCorpus } from '../shared/corpus/journal'
import type { CommandeRecueils } from '../shared/corpus/recueils'
import type {
  CompteDistantPublic,
  DemandeConnexion,
  DivergenceDistante,
  EtatSessionPublic,
  OrphelinDistant,
  OuvertureDistante,
  ProgressionTransfert,
  ResultatConnexion,
  ResultatTiragePublic,
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
    /** « Publier maintenant » : PUT If-Match sous verrou toujours tenu.
     *  { ok: false, raison: 'divergence' } = le serveur a changé sous nos pieds :
     *  la copie locale a été mise de côté, JAMAIS écrasée. */
    publierEntretien: (id: string): Promise<{ ok: boolean; raison?: string }> =>
      invoquer('distant:publierEntretien', id),
    ecrireEntretien: (id: string, p: PayloadEntretien): Promise<string> =>
      invoquer('corpus:ecrireEntretien', id, p),
    remplacerTranscription: (id: string, t: TranscriptionEntretien): Promise<string | null> =>
      invoquer('corpus:remplacerTranscription', id, t),
    creerEntretienVide: (titre: string): Promise<{ id: string; corpus: CorpusFichier }> =>
      invoquer('corpus:creerEntretienVide', titre),
    renommerEntretien: (id: string, titre: string): Promise<CorpusFichier> =>
      invoquer('corpus:renommerEntretien', id, titre),
    supprimerEntretien: (id: string): Promise<CorpusFichier> =>
      invoquer('corpus:supprimerEntretien', id),
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
  distant: {
    /** Comptes distants configurés — JAMAIS de secret dans le retour. */
    lister: (): Promise<CompteDistantPublic[]> => invoquer('distant:lister'),
    stockageSecuriseDisponible: (): Promise<boolean> =>
      invoquer('distant:stockageSecuriseDisponible'),
    connecter: (params: DemandeConnexion): Promise<ResultatConnexion> =>
      invoquer('distant:connecter', params),
    /** Création directe d'un corpus distant : publie le squelette sur le serveur,
     *  puis enregistre le compte. L'appelant enchaîne sur `ouvrir(compte.id)` —
     *  créer = ouvrir, comme en local. */
    creer: (params: DemandeCreationDistante): Promise<ResultatConnexion> =>
      invoquer('distant:creer', params),
    ouvrir: (id: string, motDePasse?: string): Promise<OuvertureDistante> =>
      invoquer('distant:ouvrir', id, motDePasse),
    tirer: (): Promise<ResultatTiragePublic | null> => invoquer('distant:tirer'),
    /** Navigation du sélecteur « Désigner dans Nextcloud… » ;
     *  PROPFIND Depth:1 d'un dossier du corpus ; null si corpus local ;
     *  dossiers d'abord. */
    listerDossier: (
      dossier: string,
    ): Promise<{ entrees: { nom: string; dossier: boolean }[] } | null> =>
      invoquer('distant:listerDossier', dossier),
    /** Désignation audio distante sur un entretien FERMÉ (micro-session D4). */
    designerAudio: (
      id: string,
      cheminAudio: string,
    ): Promise<{ ok: boolean; raison?: string; tenuPar?: string }> =>
      invoquer('distant:designerAudio', id, cheminAudio),
    /** Téléversement d'un fichier LOCAL vers le serveur (D5) :
     *  le main lit le fichier et l'envoie avec la garde anti-écrasement,
     *  jamais le renderer ne touche au disque.
     *  { raison:'existe', suggere } en cas de collision. */
    televerserAudio: (
      sourceLocale: string,
      cheminCible: string,
    ): Promise<{ ok: boolean; raison?: string; suggere?: string }> =>
      invoquer('distant:televerserAudio', sourceLocale, cheminCible),
    /** Verrous orphelins d'un crash sans libération. Null si corpus local. */
    orphelins: (): Promise<OrphelinDistant[] | null> => invoquer('distant:orphelins'),
    /** Progression des transferts binaires (rapatriements du tirage,
     *  téléversements). Renvoie la fonction de désabonnement. */
    surProgression: (cb: (p: ProgressionTransfert) => void): (() => void) => {
      const ecouteur = (_e: Electron.IpcRendererEvent, p: ProgressionTransfert): void => cb(p)
      ipcRenderer.on('distant:progression', ecouteur)
      return () => ipcRenderer.removeListener('distant:progression', ecouteur)
    },
    /** Choix « reprendre et publier » : publie la copie locale PUIS libère. */
    reprendreOrphelin: (cheminVerrou: string): Promise<{ ok: boolean; raison?: string }> =>
      invoquer('distant:reprendreOrphelin', cheminVerrou),
    /** Choix « abandonner » : déverrouille SANS publier. */
    abandonnerOrphelin: (cheminVerrou: string): Promise<void> =>
      invoquer('distant:abandonnerOrphelin', cheminVerrou),
    /** Copies de divergence mises de côté (fusion assistée). */
    listerDivergences: (): Promise<DivergenceDistante[]> =>
      invoquer('distant:listerDivergences'),
    lireDivergence: (chemin: string): Promise<unknown> =>
      invoquer('distant:lireDivergence', chemin),
    supprimerDivergence: (chemin: string): Promise<void> =>
      invoquer('distant:supprimerDivergence', chemin),
    /** Présence : signale l'entretien ouvert sur CE poste. */
    noterEntretienOuvert: (id: string | null): Promise<void> =>
      invoquer('distant:noterEntretienOuvert', id),
    oublier: (id: string): Promise<CompteDistantPublic[]> =>
      invoquer('distant:oublier', id),
  },
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
