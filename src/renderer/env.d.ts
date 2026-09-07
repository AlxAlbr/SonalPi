/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

import type {
  Categorie,
  CibleValeur,
  CorpusFichier,
  DossierCorpus,
  EntreeRecent,
  EtatDemo,
  EtatDemoComplet,
  ItemLotValeur,
  CibleRegleAnon,
  LectureEntretien,
  MarqueurDemo,
  MatriceCorpus,
  ModeleEAV,
  NoteCategory,
  OuvertureCorpus,
  OuvertureEntretienEdition,
  PatchCategorie,
  PayloadEntretien,
  TranscriptionEntretien,
  RegleAnon,
  ResultatLotValeur,
  ResultatLotAnon,
  ResultatSuppression,
  ResultatSuppressionCategorie,
  SegmentThematique,
  Variable,
  VerificationDossierDemo,
  ParamsAnon,
} from '../shared/format'
import type { ScanRegle } from '../shared/corpus/scanAnon'
import type { CommandePersonnes, InventairePersonnes } from '../shared/corpus/personnes'
import type { AnalyseCrp, DemandeMigration, VerificationDossierMigration } from '../shared/corpus/migrationCrp'
import type {
  CompteDistantPublic,
  DemandeConnexion,
  DemandeCreationDistante,
  DivergenceDistante,
  EtatSessionPublic,
  OrphelinDistant,
  OuvertureDistante,
  ProgressionTransfert,
  ResultatConnexion,
  ResultatFermetureSession,
  ResultatTiragePublic,
} from '../shared/distant'

declare global {
  interface Window {
    sonal: {
      platform: string
      application: {
        surPreparationFermeture: (cb: () => Promise<void>) => () => void
      }
      corpus: {
        surSuppressionCourant: (cb: (r: OuvertureCorpus | null) => void) => () => void
        ouvrir: () => Promise<CorpusFichier>
        dossierCourant: () => Promise<DossierCorpus & { distant: string | null }>
        recents: () => Promise<EntreeRecent[]>
        retirerRecent: (
          entree: { type: 'distant'; id: string } | { type: 'local'; dir: string },
        ) => Promise<boolean>
        ouvrirDossier: (dir: string) => Promise<OuvertureCorpus>
        choisirDossier: () => Promise<OuvertureCorpus | null>
        verifierNouveau: (dir: string) => Promise<{ dejaCorpus: boolean }>
        creerNouveau: (dir: string, nom: string) => Promise<OuvertureCorpus>
        lireEntretien: (id: string) => Promise<LectureEntretien>
        ouvrirEntretienPourEdition: (id: string) => Promise<OuvertureEntretienEdition>
        fermerEntretien: (id: string) => Promise<ResultatFermetureSession>
        surSessionDegradee: (cb: (id: string) => void) => () => void
        etatSession: (id: string) => Promise<EtatSessionPublic>
        publierEntretien: (id: string) => Promise<{ ok: boolean; raison?: string }>
        ecrireEntretien: (id: string, p: PayloadEntretien) => Promise<string>
        remplacerTranscription: (id: string, t: TranscriptionEntretien) => Promise<string | null>
        creerEntretienVide: (titre: string) => Promise<{ id: string; corpus: CorpusFichier }>
        renommerEntretien: (id: string, titre: string) => Promise<CorpusFichier>
        supprimerEntretien: (id: string) => Promise<CorpusFichier>
        importer: (
          titre: string,
          p: PayloadEntretien,
          codebook: Categorie[],
          variables: Variable[],
          reglesAnon?: RegleAnon[],
        ) => Promise<{ id: string; corpus: CorpusFichier }>
        ajouterCategorie: (
          nom: string,
          parent?: string | null,
        ) => Promise<{ id: string; corpus: CorpusFichier }>
        modifierCategorie: (id: string, patch: PatchCategorie) => Promise<CorpusFichier>
        deplacerCategorie: (id: string, sens: -1 | 1) => Promise<CorpusFichier>
        migrerCategorie: (id: string, nouveauParent: string | null) => Promise<CorpusFichier>
        supprimerCategorie: (id: string, exceptId?: string) => Promise<ResultatSuppressionCategorie>
        usagesParCategorie: () => Promise<Record<string, number>>
        categoriesNote: () => Promise<NoteCategory[]>
        ajouterCategorieNote: (
          nom: string,
          couleur: string,
        ) => Promise<{ id: string; corpus: CorpusFichier }>
        renommerCategorieNote: (id: string, nom: string) => Promise<CorpusFichier>
        majCouleurCategorieNote: (id: string, couleur: string) => Promise<CorpusFichier>
        supprimerCategorieNote: (id: string) => Promise<ResultatSuppressionCategorie>
        compterUsagesCategorieNote: (id: string) => Promise<number>
        resumesThematiques: () => Promise<Record<string, SegmentThematique[]>>
        reglesAnon: () => Promise<RegleAnon[]>
        scanAnon: () => Promise<ScanRegle[]>
        personnesInventaire: () => Promise<InventairePersonnes>
        personnesCommander: (commande: CommandePersonnes) => Promise<string | null>
        regleAnonParEntite: (entite: string) => Promise<RegleAnon | undefined>
        regleAnonCreer: (entite: string, pseudos: string[]) => Promise<{ regle: RegleAnon; existait: boolean }>
        regleAnonAjouterPseudo: (id: string, pseudo: string) => Promise<RegleAnon | null>
        regleAnonUtiliseeAilleurs: (id: string, exceptId?: string) => Promise<boolean>
        regleAnonSupprimer: (id: string) => Promise<void>
        appliquerRegleAnonLot: (cibles: CibleRegleAnon[]) => Promise<ResultatLotAnon>
        paramsAnonLire: () => Promise<ParamsAnon>
        paramsAnonEcrire: (params: ParamsAnon) => Promise<ParamsAnon>
        regleAnonCategoriser: (id: string, categorie: string | null) => Promise<RegleAnon | null>
        compterUsagesCategorie: (code: string, exceptId?: string) => Promise<number>
        ajouterVariable: (
          lib: string,
          portee: 'entretien' | 'locuteur',
        ) => Promise<{ id: string; corpus: CorpusFichier }>
        modifierVariable: (id: string, patch: Partial<Variable>) => Promise<CorpusFichier>
        supprimerVariable: (id: string) => Promise<ResultatSuppression>
        ajouterModalite: (idVar: string, lib: string) => Promise<CorpusFichier>
        modifierModalite: (idVar: string, idMod: string, lib: string) => Promise<CorpusFichier>
        supprimerModalite: (idVar: string, idMod: string) => Promise<ResultatSuppression>
        matrice: () => Promise<MatriceCorpus>
        marquerDemo: (marqueur: MarqueurDemo) => Promise<CorpusFichier>
        assignerAudio: (id: string, source: string) => Promise<{ audioRef: string } | null>
        effacerAudio: (id: string) => Promise<{ audioRef: null }>
        ecrireWaveform: (id: string, png: Uint8Array) => Promise<string>
        associerAudioLocal: (id: string, source: string) => Promise<{ audioRef: string } | null>
        audios: () => Promise<Record<string, { audio: string | null; waveform: string | null }>>
        verifierAudios: () => Promise<Record<string, 'ok' | 'manquant'>>
        poserValeur: (
          entretienId: string,
          cible: CibleValeur,
          idVar: string,
          idMod: string,
        ) => Promise<boolean>
        poserValeurLot: (items: ItemLotValeur[]) => Promise<ResultatLotValeur>
      }
      dialog: {
        choisirTexte: (defaultPath?: string) => Promise<{ nom: string; contenu: string } | null>
        choisirSrt: (defaultPath?: string) => Promise<{ nom: string; contenu: string } | null>
        choisirAudio: (defaultPath?: string) => Promise<string | null>
        choisirDossier: (kind?: 'sources' | 'corpus' | 'projet') => Promise<string | null>
        choisirExport: (nomSuggere: string, contenu: string) => Promise<string | null>
        choisirJson: (defaultPath?: string) => Promise<{ nom: string; contenu: string } | null>
      }
      /** Registre « Mes modèles » du profil (settings.json), partagé entre corpus. */
      modeles: {
        lire: () => Promise<ModeleEAV[]>
        ajouter: (modele: ModeleEAV) => Promise<ModeleEAV[]>
      }
      distant: {
        lister: () => Promise<CompteDistantPublic[]>
        stockageSecuriseDisponible: () => Promise<boolean>
        connecter: (params: DemandeConnexion) => Promise<ResultatConnexion>
        creer: (params: DemandeCreationDistante) => Promise<ResultatConnexion>
        ouvrir: (id: string, motDePasse?: string) => Promise<OuvertureDistante>
        tirer: () => Promise<ResultatTiragePublic | null>
        /** Navigation du sélecteur « Désigner dans Nextcloud… ». Null si
         *  corpus local ; dossiers d'abord. */
        listerDossier: (
          dossier: string,
        ) => Promise<{ entrees: { nom: string; dossier: boolean }[] } | null>
        /** Désignation audio distante sur un entretien FERMÉ (micro-session). */
        designerAudio: (
          id: string,
          cheminAudio: string,
        ) => Promise<{ ok: boolean; raison?: string; tenuPar?: string }>
        /** Téléversement d'un fichier LOCAL vers le serveur. */
        televerserAudio: (
          sourceLocale: string,
          cheminCible: string,
        ) => Promise<{ ok: boolean; raison?: string; suggere?: string }>
        orphelins: () => Promise<OrphelinDistant[] | null>
        /** Progression des transferts binaires (rapatriements du tirage et
         *  téléversements). Renvoie la fonction de désabonnement. */
        surProgression: (cb: (p: ProgressionTransfert) => void) => () => void
        reprendreOrphelin: (cheminVerrou: string) => Promise<{ ok: boolean; raison?: string }>
        abandonnerOrphelin: (cheminVerrou: string) => Promise<void>
        listerDivergences: () => Promise<DivergenceDistante[]>
        lireDivergence: (chemin: string) => Promise<unknown>
        supprimerDivergence: (chemin: string) => Promise<void>
        /** Présence : signale l'entretien ouvert sur CE poste (null =
         *  aucun / retour à l'écran Corpus). Best effort côté main. */
        noterEntretienOuvert: (id: string | null) => Promise<void>
        oublier: (id: string) => Promise<CompteDistantPublic[]>
      }
      media: {
        lireLargeurVideo: (dir: string) => Promise<number | null>
        ecrireLargeurVideo: (dir: string, largeur: number) => Promise<void>
      }
      profil: {
        signataire: () => Promise<string>
        memoriserSignataire: (nom: string) => Promise<void>
      }
      fichier: {
        cheminDe: (f: File) => string
      }
      migrer: {
        choisirCrp: () => Promise<{ chemin: string; analyse: AnalyseCrp } | null>
        choisirDossier: (nom: string) => Promise<string | null>
        verifierDossier: (dir: string) => Promise<VerificationDossierMigration>
        executer: (req: DemandeMigration) => Promise<OuvertureCorpus>
        lireSonal: (
          cheminCrp: string,
          rtrPath: string | null,
        ) => Promise<{ nom: string; contenu: string } | null>
      }
      demo: {
        copierSources: (racine: string) => Promise<void>
        lireSource: (racine: string, rel: string) => Promise<{ nom: string; contenu: string }>
        cheminAudio: (racine: string, rel: string) => Promise<string>
        etat: () => Promise<EtatDemoComplet | null>
        memoriser: (etat: EtatDemo) => Promise<void>
        verifierCorpus: (dir: string) => Promise<VerificationDossierDemo>
      }
    }
  }
}
