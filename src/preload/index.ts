import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  Categorie,
  CibleValeur,
  CorpusFichier,
  DossierCorpus,
  LectureEntretien,
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
    assignerAudio: (id: string, source: string): Promise<{ audioRef: string } | null> =>
      ipcRenderer.invoke('corpus:assignerAudio', id, source),
    ecrireWaveform: (id: string, png: Uint8Array): Promise<string> =>
      ipcRenderer.invoke('corpus:ecrireWaveform', id, png),
    audios: (): Promise<Record<string, { audio: string | null; waveform: string | null }>> =>
      ipcRenderer.invoke('corpus:audios'),
    poserValeur: (
      entretienId: string,
      cible: CibleValeur,
      idVar: string,
      idMod: string,
    ): Promise<boolean> =>
      ipcRenderer.invoke('corpus:poserValeur', entretienId, cible, idVar, idMod),
  },
  dialog: {
    choisirTexte: (): Promise<{ nom: string; contenu: string } | null> =>
      ipcRenderer.invoke('dialog:choisirTexte'),
    choisirAudio: (): Promise<string | null> => ipcRenderer.invoke('dialog:choisirAudio'),
    choisirExport: (nomSuggere: string, contenu: string): Promise<string | null> =>
      ipcRenderer.invoke('dialog:choisirExport', nomSuggere, contenu),
  },
  fichier: {
    // Chemin réel d'un File GLISSÉ-DÉPOSÉ (modale d'ajout) — `File.path` n'existe
    // plus, seul le preload peut le résoudre (webUtils).
    cheminDe: (f: File): string => webUtils.getPathForFile(f),
  },
})
