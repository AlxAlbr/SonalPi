import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  Categorie,
  CibleValeur,
  CorpusFichier,
  DossierCorpus,
  EtatDemo,
  EtatDemoComplet,
  LectureEntretien,
  MarqueurDemo,
  MatriceCorpus,
  OuvertureCorpus,
  PatchCategorie,
  PayloadEntretien,
  RegleAnon,
  ResultatSuppression,
  ResultatSuppressionCategorie,
  SegmentThematique,
  Variable,
} from '../shared/format'
import type { ScanRegle } from '../shared/corpus/scanAnon'
import type {
  CompteDistantPublic,
  DemandeConnexion,
  DivergenceDistante,
  OrphelinDistant,
  OuvertureDistante,
  ResultatConnexion,
  ResultatTiragePublic,
} from '../shared/distant'
import type { AnalyseCrp, DemandeMigration, VerificationDossierMigration } from '../shared/corpus/migrationCrp'

// Pont du store « dossier de corpus » : le renderer ne touche JAMAIS le disque directement
// tout passe par le main process .
contextBridge.exposeInMainWorld('sonal', {
  platform: process.platform,
  corpus: {
    ouvrir: (): Promise<CorpusFichier> => ipcRenderer.invoke('corpus:ouvrir'),
    dossierCourant: (): Promise<DossierCorpus> => ipcRenderer.invoke('corpus:dossierCourant'),
    recents: (): Promise<DossierCorpus[]> => ipcRenderer.invoke('corpus:recents'),
    retirerRecent: (dir: string): Promise<DossierCorpus[]> =>
      ipcRenderer.invoke('corpus:retirerRecent', dir),
    ouvrirDossier: (dir: string): Promise<OuvertureCorpus> =>
      ipcRenderer.invoke('corpus:ouvrirDossier', dir),
    choisirDossier: (): Promise<OuvertureCorpus | null> =>
      ipcRenderer.invoke('corpus:choisirDossier'),
    /** Vérifie si un dossier est DÉJÀ un corpus (modale « Nouveau corpus… »). */
    verifierNouveau: (dir: string): Promise<{ dejaCorpus: boolean }> =>
      ipcRenderer.invoke('corpus:verifierNouveau', dir),
    /** « Nouveau corpus » : crée (ou ouvre) et bascule le store dessus. */
    creerNouveau: (dir: string, nom: string): Promise<OuvertureCorpus> =>
      ipcRenderer.invoke('corpus:creerNouveau', dir, nom),
    lireEntretien: (id: string): Promise<LectureEntretien> =>
      ipcRenderer.invoke('corpus:lireEntretien', id),
    /** Corpus distant : fermer la session (publication finale puis libération
     *  du verrou, §4.4). Sans effet en corpus local. */
    fermerEntretien: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('corpus:fermerEntretien', id),
    /** État de session distant (poll UI) pour un entretien ouvert. */
    etatSession: (
      id: string,
    ): Promise<{ etat: 'aucune' | 'a-nous'; dernierPubli?: string | null; sale?: boolean }> =>
      ipcRenderer.invoke('distant:etatSession', id),
    /** « Publier maintenant » (§4.3) : PUT If-Match sous verrou toujours tenu.
     *  { ok: false, raison: 'divergence' } = le serveur a changé sous nos pieds
     *  (§6) — la copie locale a été mise de côté, JAMAIS écrasée. */
    publierEntretien: (id: string): Promise<{ ok: boolean; raison?: string }> =>
      ipcRenderer.invoke('distant:publierEntretien', id),
    ecrireEntretien: (id: string, p: PayloadEntretien): Promise<string> =>
      ipcRenderer.invoke('corpus:ecrireEntretien', id, p),
    creerEntretienVide: (titre: string): Promise<{ id: string; corpus: CorpusFichier }> =>
      ipcRenderer.invoke('corpus:creerEntretienVide', titre),
    renommerEntretien: (id: string, titre: string): Promise<CorpusFichier> =>
      ipcRenderer.invoke('corpus:renommerEntretien', id, titre),
    supprimerEntretien: (id: string): Promise<CorpusFichier> =>
      ipcRenderer.invoke('corpus:supprimerEntretien', id),
    importer: (
      titre: string,
      payload: PayloadEntretien,
      codebook: Categorie[],
      variables: Variable[],
      reglesAnon?: RegleAnon[],
    ): Promise<{ id: string; corpus: CorpusFichier }> =>
      ipcRenderer.invoke('corpus:importer', titre, payload, codebook, variables, reglesAnon),
    ajouterCategorie: (
      nom: string,
      parent: string | null = null,
    ): Promise<{ id: string; corpus: CorpusFichier }> =>
      ipcRenderer.invoke('corpus:ajouterCategorie', nom, parent),
    modifierCategorie: (id: string, patch: PatchCategorie): Promise<CorpusFichier> =>
      ipcRenderer.invoke('corpus:modifierCategorie', id, patch),
    deplacerCategorie: (id: string, sens: -1 | 1): Promise<CorpusFichier> =>
      ipcRenderer.invoke('corpus:deplacerCategorie', id, sens),
    supprimerCategorie: (id: string, exceptId?: string): Promise<ResultatSuppressionCategorie> =>
      ipcRenderer.invoke('corpus:supprimerCategorie', id, exceptId),
    usagesParCategorie: (): Promise<Record<string, number>> =>
      ipcRenderer.invoke('corpus:usagesParCategorie'),
    resumesThematiques: (): Promise<Record<string, SegmentThematique[]>> =>
      ipcRenderer.invoke('corpus:resumesThematiques'),
    reglesAnon: (): Promise<RegleAnon[]> => ipcRenderer.invoke('corpus:reglesAnon'),
    scanAnon: (): Promise<ScanRegle[]> => ipcRenderer.invoke('corpus:scanAnon'),
    regleAnonParEntite: (entite: string): Promise<RegleAnon | undefined> =>
      ipcRenderer.invoke('corpus:regleAnonParEntite', entite),
    regleAnonCreer: (entite: string, pseudos: string[]): Promise<RegleAnon> =>
      ipcRenderer.invoke('corpus:regleAnonCreer', entite, pseudos),
    regleAnonAjouterPseudo: (id: string, pseudo: string): Promise<RegleAnon | null> =>
      ipcRenderer.invoke('corpus:regleAnonAjouterPseudo', id, pseudo),
    regleAnonUtiliseeAilleurs: (id: string, exceptId?: string): Promise<boolean> =>
      ipcRenderer.invoke('corpus:regleAnonUtiliseeAilleurs', id, exceptId),
    regleAnonSupprimer: (id: string): Promise<void> => ipcRenderer.invoke('corpus:regleAnonSupprimer', id),
    appliquerRegleAnon: (entretienId: string, regleId: string): Promise<{ nb: number; titre: string }> =>
      ipcRenderer.invoke('corpus:appliquerRegleAnon', entretienId, regleId),
    compterUsagesCategorie: (code: string, exceptId?: string): Promise<number> =>
      ipcRenderer.invoke('corpus:compterUsagesCategorie', code, exceptId),
    ajouterVariable: (
      lib: string,
      portee: 'entretien' | 'locuteur',
    ): Promise<{ id: string; corpus: CorpusFichier }> =>
      ipcRenderer.invoke('corpus:ajouterVariable', lib, portee),
    modifierVariable: (id: string, patch: Partial<Variable>): Promise<CorpusFichier> =>
      ipcRenderer.invoke('corpus:modifierVariable', id, patch),
    supprimerVariable: (id: string): Promise<ResultatSuppression> =>
      ipcRenderer.invoke('corpus:supprimerVariable', id),
    ajouterModalite: (idVar: string, lib: string): Promise<CorpusFichier> =>
      ipcRenderer.invoke('corpus:ajouterModalite', idVar, lib),
    modifierModalite: (idVar: string, idMod: string, lib: string): Promise<CorpusFichier> =>
      ipcRenderer.invoke('corpus:modifierModalite', idVar, idMod, lib),
    supprimerModalite: (idVar: string, idMod: string): Promise<ResultatSuppression> =>
      ipcRenderer.invoke('corpus:supprimerModalite', idVar, idMod),
    matrice: (): Promise<MatriceCorpus> => ipcRenderer.invoke('corpus:matrice'),
    marquerDemo: (marqueur: MarqueurDemo): Promise<CorpusFichier> =>
      ipcRenderer.invoke('corpus:marquerDemo', marqueur),
    assignerAudio: (id: string, source: string): Promise<{ audioRef: string } | null> =>
      ipcRenderer.invoke('corpus:assignerAudio', id, source),
    ecrireWaveform: (id: string, png: Uint8Array): Promise<string> =>
      ipcRenderer.invoke('corpus:ecrireWaveform', id, png),
    /** « Associer l'audio local… » (§3.3, E4) : référence un fichier de CE
     *  poste pour un entretien dont l'audioRef partagée n'y pointe nulle part. */
    associerAudioLocal: (id: string, source: string): Promise<{ audioRef: string } | null> =>
      ipcRenderer.invoke('corpus:associerAudioLocal', id, source),
    audios: (): Promise<Record<string, { audio: string | null; waveform: string | null }>> =>
      ipcRenderer.invoke('corpus:audios'),
    verifierAudios: (): Promise<Record<string, 'ok' | 'manquant'>> =>
      ipcRenderer.invoke('corpus:verifierAudios'),
    poserValeur: (
      entretienId: string,
      cible: CibleValeur,
      idVar: string,
      idMod: string,
    ): Promise<boolean> =>
      ipcRenderer.invoke('corpus:poserValeur', entretienId, cible, idVar, idMod),
  },
  distant: {
    /** Comptes distants configurés — JAMAIS de secret dans le retour. */
    lister: (): Promise<CompteDistantPublic[]> => ipcRenderer.invoke('distant:lister'),
    connecter: (params: DemandeConnexion): Promise<ResultatConnexion> =>
      ipcRenderer.invoke('distant:connecter', params),
    ouvrir: (id: string): Promise<OuvertureDistante> => ipcRenderer.invoke('distant:ouvrir', id),
    tirer: (): Promise<ResultatTiragePublic | null> => ipcRenderer.invoke('distant:tirer'),
    /** Verrous orphelins (crash sans libération, §4.5). Null si corpus local. */
    orphelins: (): Promise<OrphelinDistant[] | null> => ipcRenderer.invoke('distant:orphelins'),
    /** Choix « reprendre et publier » : publie la copie locale PUIS libère. */
    reprendreOrphelin: (cheminVerrou: string): Promise<{ ok: boolean; raison?: string }> =>
      ipcRenderer.invoke('distant:reprendreOrphelin', cheminVerrou),
    /** Choix « abandonner » : déverrouille SANS publier. */
    abandonnerOrphelin: (cheminVerrou: string): Promise<void> =>
      ipcRenderer.invoke('distant:abandonnerOrphelin', cheminVerrou),
    /** Copies de divergence mises de côté (§6, fusion assistée E3b). */
    listerDivergences: (): Promise<DivergenceDistante[]> =>
      ipcRenderer.invoke('distant:listerDivergences'),
    lireDivergence: (chemin: string): Promise<unknown> =>
      ipcRenderer.invoke('distant:lireDivergence', chemin),
    supprimerDivergence: (chemin: string): Promise<void> =>
      ipcRenderer.invoke('distant:supprimerDivergence', chemin),
    /** Présence (E4 §9) : signale l'entretien ouvert sur CE poste. */
    noterEntretienOuvert: (id: string | null): Promise<void> =>
      ipcRenderer.invoke('distant:noterEntretienOuvert', id),
    oublier: (id: string): Promise<CompteDistantPublic[]> =>
      ipcRenderer.invoke('distant:oublier', id),
  },
  media: {
    /** Largeur (px) du panneau vidéo mémorisée pour un corpus (dir), ou null. */
    lireLargeurVideo: (dir: string): Promise<number | null> =>
      ipcRenderer.invoke('media:lireLargeurVideo', dir),
    /** Mémorise la largeur du panneau vidéo pour un corpus (dir). */
    ecrireLargeurVideo: (dir: string, largeur: number): Promise<void> =>
      ipcRenderer.invoke('media:ecrireLargeurVideo', dir, largeur),
  },
  dialog: {
    /** Choisir un fichier d'entretien (contenu lu ici). `defaultPath` hinté par
     *  la démo (racineSources) pour que le dialogue natif s'ouvre au bon endroit. */
    choisirTexte: (defaultPath?: string): Promise<{ nom: string; contenu: string } | null> =>
      ipcRenderer.invoke('dialog:choisirTexte', defaultPath),
    /** Choisir un fichier audio (chemin référencé, jamais copié). */
    choisirAudio: (defaultPath?: string): Promise<string | null> =>
      ipcRenderer.invoke('dialog:choisirAudio', defaultPath),
    /** Choisir un DOSSIER pur (aucun effet de bord) — modale démo à deux
     *  dossiers. `kind` hinte le défaut Documents/Sonal/démo/<kind>. */
    choisirDossier: (kind?: 'sources' | 'corpus'): Promise<string | null> =>
      ipcRenderer.invoke('dialog:choisirDossier', kind),
    choisirExport: (nomSuggere: string, contenu: string): Promise<string | null> =>
      ipcRenderer.invoke('dialog:choisirExport', nomSuggere, contenu),
  },
  fichier: {
    // Chemin réel d'un File GLISSÉ-DÉPOSÉ (modale d'ajout) — `File.path` n'existe
    // plus, seul le preload peut le résoudre (webUtils).
    cheminDe: (f: File): string => webUtils.getPathForFile(f),
  },
  migrer: {
    /** Choix d'un `.crp` SonalPi V1 : dialogue + lecture + analyse (aperçu). */
    choisirCrp: (): Promise<{ chemin: string; analyse: AnalyseCrp } | null> =>
      ipcRenderer.invoke('migrer:choisirCrp'),
    /** Choix du dossier DÉDIÉ, pré-rempli Documents/Sonal/<nom>. */
    choisirDossier: (nom: string): Promise<string | null> =>
      ipcRenderer.invoke('migrer:choisirDossier', nom),
    /** Garde « on n'écrase jamais ». */
    verifierDossier: (dir: string): Promise<VerificationDossierMigration> =>
      ipcRenderer.invoke('migrer:verifierDossier', dir),
    /** Crée le corpus V2 dans le dossier dédié et l'OUVRE. */
    executer: (req: DemandeMigration): Promise<OuvertureCorpus> =>
      ipcRenderer.invoke('migrer:executer', req),
    /** Lit le `.Sonal` d'un entretien V1. */
    lireSonal: (
      cheminCrp: string,
      rtrPath: string | null,
    ): Promise<{ nom: string; contenu: string } | null> =>
      ipcRenderer.invoke('migrer:lireSonal', cheminCrp, rtrPath),
  },
  demo: {
    /** Copie UNE FOIS les sources bundled CorpusTest/ (srt/ + audio/) dans le
     *  dossier choisi par l'utilisateur — le corpus les RÉFÉRENCE ensuite. */
    copierSources: (racine: string): Promise<void> =>
      ipcRenderer.invoke('demo:copierSources', racine),
    /** Lit un fichier texte des sources (ex. 'srt/1Coordinatrice.srt'). */
    lireSource: (racine: string, rel: string): Promise<{ nom: string; contenu: string }> =>
      ipcRenderer.invoke('demo:lireSource', racine, rel),
    /** Chemin absolu d'un média des sources (ex. 'audio/E2.mp3'). */
    cheminAudio: (racine: string, rel: string): Promise<string> =>
      ipcRenderer.invoke('demo:cheminAudio', racine, rel),
    /** Mémoire démo persistée (settings.json) : dossiers mémorisés + présence
     *  réelle sur disque (la modale adapte ses questions). */
    etat: (): Promise<EtatDemoComplet | null> => ipcRenderer.invoke('demo:etat'),
    /** Mémoire démo persistée : à appeler après chaque préparation réussie. */
    memoriser: (etat: EtatDemo): Promise<void> => ipcRenderer.invoke('demo:memoriser', etat),
    /** Garde de la modale : le dossier choisi pour le corpus de test ne doit pas
     *  déjà être un corpus (corpus.json présent). */
    verifierCorpus: (dir: string): Promise<{ dejaCorpus: boolean }> =>
      ipcRenderer.invoke('demo:verifierCorpus', dir),
  },
})
