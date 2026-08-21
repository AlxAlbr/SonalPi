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
  ResultatSuppression,
  ResultatSuppressionCategorie,
  SegmentThematique,
  Variable,
} from '../shared/format'

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
    lireEntretien: (id: string): Promise<LectureEntretien> =>
      ipcRenderer.invoke('corpus:lireEntretien', id),
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
    ): Promise<{ id: string; corpus: CorpusFichier }> =>
      ipcRenderer.invoke('corpus:importer', titre, payload, codebook, variables),
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
