/// <reference types="vite/client" />
import type { OptionsTableCorrespondance, ApercuExportCorrespondance } from '../shared/corpus/tablesCorrespondance'
import type { DemandeRenommageAnon, ApercuRenommageAnon, BilanRenommageAnon, SuiviRenommageAnon } from '../shared/corpus/renommageAnon'
import type { DemandeDissociationAnon, ApercuDissociationAnon, BilanDissociationAnon, BilanDissociationDistant, SuiviDissociationAnon } from '../shared/corpus/dissociationAnon'
import type { DemandeAjoutVarianteAnon, ResultatAjoutVarianteAnon } from '../shared/corpus/variantesAnon'
import type { DemandeRetraitVarianteAnon, ApercuRetraitVarianteAnon, BilanRetraitVarianteAnon, BilanRetraitVarianteDistant, SuiviRetraitVarianteAnon } from '../shared/corpus/retraitVarianteAnon'
import type { DemandeSuppressionAnon, ApercuSuppressionAnon, BilanSuppressionAnon, BilanSuppressionDistant, SuiviSuppressionAnon } from '../shared/corpus/suppressionAnon'
import type { DocumentCorrespondance, CorrectionCorrespondance, ApercuImportCorrespondance, ChoixImportCorrespondance, BilanImportCorrespondance, SuiviImportCorrespondances } from '../shared/corpus/importCorrespondances'
import type { MemoireNavigationProjet, NavigationProjet } from '../shared/navigationProjet'
import type { EtatMenuApplication } from '../shared/menuApplication'

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

import type {
  Categorie,
  CibleValeur,
  DemandeExportDocx,
  DemandeExportPdf,
  DemandeExportDocxCorpus,
  CorpusFichier,
  DossierCorpus,
  EntreeRecent,
  ItemLotValeur,
  CibleRegleAnon,
  LectureEntretien,
  MarqueurDemo,
  MatriceCorpus,
  ModeTriEntretiens,
  ModeleEAV,
  NoteCategory,
  OuvertureCorpus,
  OuvertureEntretienEdition,
  PatchCategorie,
  PayloadEntretien,
  TranscriptionEntretien,
  RegleAnon,
  ResultatArchiveCorpus,
  ResultatLotValeur,
  ResultatLotAnon,
  ResultatSuppression,
  ResultatSuppressionCategorie,
  SegmentThematique,
  Variable,
  ParamsAnon,
} from '../shared/format'
import type { ScanRegle } from '../shared/corpus/scanAnon'
import type {
  ApercuOperationTheme,
  DemandeOperationTheme,
  DetailsOperationTheme,
  OptionsExecutionOperationTheme,
  ProgressionOperationTheme,
  ResultatOperationTheme,
  SuiviOperationTheme,
  PreparationRepriseOperationTheme,
} from '../shared/corpus/themes'
import type { CommandePersonnes, InventairePersonnes } from '../shared/corpus/personnes'
import type { CommandeNotes, InventaireNotes } from '../shared/corpus/notes'
import type { EntreeJournalCorpusVue, ResultatAnnulationCorpus } from '../shared/corpus/journal'
import type { CommandeRecueils } from '../shared/corpus/recueils'
import type { ResultatInstantaneCorpus, ResultatEcritureCorpus } from '../shared/export/corpus'
import type { QualcoderExportModel } from '../shared/export/qualcoder/modele'
import type { CommandeCas } from '../shared/corpus/cas'
import type { CommandeTableauBord } from '../shared/corpus/tableaubord'
import type { CommandeTraitementsLexico } from '../shared/lexico/traitements'
import type { ImpactSuppressionEntretien } from '../shared/corpus/suppressionEntretien'
import type { DossierFichiersExercice, EtatExemples, InstallationExemple, TravailExemple } from '../shared/exemples'
import type {
  ApiDistant,
  EtatSessionPublic,
  ResultatFermetureSession,
} from '../shared/distant'
import type { ApiGitLab } from '../shared/gitlab'
import type { ApiWebDAV } from '../shared/webdav'
import type {
  InventaireDossierDocsCadre,
  ResultatLectureDocsCadre,
  ResultatMutationDocsCadre,
  SourceDocumentCadre,
} from '../shared/docsCadre'

declare global {
  interface Window {
    sonal: {
      platform: string
      application: {
        ouvrirKitPedagogique: () => Promise<void>
        ouvrirDocumentation: (entree: 'guide' | 'faq') => Promise<void>
        surPreparationFermeture: (cb: () => Promise<void>) => () => void
        surSuspensionSysteme: (cb: () => Promise<void>) => () => void
        surReveilSysteme: (cb: () => Promise<void>) => () => void
      }
      menu: {
        actualiserEtat: (etat: EtatMenuApplication) => void
        surAction: (cb: (action: string, mode?: ModeTriEntretiens) => void) => () => void
        surOuvrirRecent: (cb: (entree: EntreeRecent) => void) => () => void
      }
      docsCadre: {
        lister: (source: SourceDocumentCadre, dossier: string) => Promise<InventaireDossierDocsCadre>
        lireApercu: (source: SourceDocumentCadre, nom: string) => Promise<ResultatLectureDocsCadre>
        ajouterFichier: (dossier: string, nomSouhaite?: string) => Promise<ResultatMutationDocsCadre>
        creerDossier: (parent: string, nom: string) => Promise<ResultatMutationDocsCadre>
        deposer: (cheminSource: string, dossier: string) => Promise<ResultatMutationDocsCadre>
        renommer: (ancienNom: string, nouveauNom: string) => Promise<ResultatMutationDocsCadre>
        supprimer: (nom: string) => Promise<ResultatMutationDocsCadre>
        ouvrirAvecApplication: (nom: string) => Promise<void>
        ouvrirDossierLocal: (dossier: string) => Promise<void>
        afficherDansDossier: (chemin: string) => Promise<void>
        enregistrerCopie: (source: SourceDocumentCadre, nom: string) => Promise<boolean>
        ouvrirDansNextcloud: (dossier: string) => Promise<void>
      }
      corpus: {
        surSuppressionCourant: (cb: (r: OuvertureCorpus | null) => void) => () => void
        ouvrir: () => Promise<CorpusFichier>
        renommer: (nom: string) => Promise<CorpusFichier>
        dossierCourant: () => Promise<DossierCorpus & { distant: string | null }>
        recents: () => Promise<EntreeRecent[]>
        retirerRecent: (
          entree: { type: 'distant'; id: string } | { type: 'local'; dir: string },
        ) => Promise<boolean>
        ouvrirDossier: (dir: string) => Promise<OuvertureCorpus>
        choisirDossier: () => Promise<OuvertureCorpus | null>
        verifierNouveau: (dir: string) => Promise<{ dejaCorpus: boolean }>
        creerNouveau: (dir: string, nom: string, exemple?: InstallationExemple) => Promise<OuvertureCorpus>
        lireEntretien: (id: string) => Promise<LectureEntretien>
        ouvrirEntretienPourEdition: (id: string) => Promise<OuvertureEntretienEdition>
        fermerEntretien: (id: string) => Promise<ResultatFermetureSession>
        surSessionDegradee: (cb: (id: string) => void) => () => void
        etatSession: (id: string) => Promise<EtatSessionPublic>
        revaliderSession: (id: string) => Promise<EtatSessionPublic>
        publierEntretien: (id: string) => Promise<{ ok: boolean; raison?: string }>
        ecrireEntretien: (id: string, p: PayloadEntretien) => Promise<string>
        preserverEntretienDegrade: (id: string, p: PayloadEntretien) => Promise<boolean>
        remplacerTranscription: (id: string, t: TranscriptionEntretien) => Promise<string | null>
        creerEntretienVide: (titre: string) => Promise<{ id: string; corpus: CorpusFichier }>
        renommerEntretien: (id: string, titre: string) => Promise<CorpusFichier>
        trierEntretiens: (mode: ModeTriEntretiens) => Promise<CorpusFichier>
        analyserSuppressionEntretien: (id: string) => Promise<ImpactSuppressionEntretien>
        supprimerEntretien: (
          id: string,
          impactAttendu?: ImpactSuppressionEntretien,
        ) => Promise<CorpusFichier>
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
        analyserOperationTheme: (demande: DemandeOperationTheme, operationPrecedente?: string) => Promise<ApercuOperationTheme>
        detailsOperationTheme: (operationId: string, entretienId: string) => Promise<DetailsOperationTheme>
        executerOperationTheme: (operationId: string, demande: DemandeOperationTheme, options: OptionsExecutionOperationTheme) => Promise<ResultatOperationTheme>
        lireSuiviOperationTheme: () => Promise<SuiviOperationTheme | null>
        preparerRepriseOperationTheme: (id: string) => Promise<PreparationRepriseOperationTheme>
        reconcilierOperationTheme: (id: string) => Promise<ResultatOperationTheme>
        abandonnerOperationTheme: (id: string) => Promise<void>
        surProgressionOperationTheme: (cb: (etat: ProgressionOperationTheme) => void) => () => void
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
        recueilsCommander: (commande: CommandeRecueils) => Promise<CorpusFichier>
        casCommander: (commande: CommandeCas) => Promise<CorpusFichier>
        tableaubordCommander: (commande: CommandeTableauBord) => Promise<CorpusFichier>
        lexicoCommander: (commande: CommandeTraitementsLexico) => Promise<CorpusFichier>
        lexicoExporterTableau: (demande: {
          nom: string
          contenu: string
          format: 'csv' | 'tsv'
        }) => Promise<{ annule: boolean; chemin?: string }>
        analysesCroiseesExporter: (demande: {
          nom: string
          contenu: string
          format: 'csv' | 'tsv'
        }) => Promise<{ annule: boolean; chemin?: string }>
        syntheseExporterTxt: (demande: {
          nom: string
          contenu: string
        }) => Promise<{ annule: boolean; chemin?: string }>
        reglesAnon: () => Promise<RegleAnon[]>
        scanAnon: () => Promise<ScanRegle[]>
        notesInventaire: () => Promise<InventaireNotes>
        notesCommander: (commande: CommandeNotes) => Promise<string | null>
        personnesInventaire: () => Promise<InventairePersonnes>
        personnesCommander: (commande: CommandePersonnes, depuisRepertoire?: boolean) => Promise<string | null>
        journalLister: () => Promise<EntreeJournalCorpusVue[]>
        journalAnnuler: (id: string) => Promise<ResultatAnnulationCorpus>
        regleAnonParEntite: (entite: string) => Promise<RegleAnon | undefined>
        apercuExportCorrespondances: (options: OptionsTableCorrespondance) => Promise<ApercuExportCorrespondance>
        exporterCorrespondances: (token: string, format: 'v2' | 'v1', confidentiel: boolean, limites: boolean, v1: boolean) => Promise<{ annule: boolean }>
        apercuImportCorrespondances: (documents: DocumentCorrespondance[], corrections?: CorrectionCorrespondance[]) => Promise<ApercuImportCorrespondance>
        importerCorrespondances: (token: string, choix: Record<string, ChoixImportCorrespondance>, cibles?: import('../shared/corpus/importCorrespondancesEntretiens').ChoixCibleCorrespondance[], confirmees?: boolean) => Promise<BilanImportCorrespondance>
        suiviImportCorrespondances: () => Promise<SuiviImportCorrespondances | null>
        reprendreImportCorrespondances: (operationId: string, confirmee: boolean) => Promise<BilanImportCorrespondance>
        apercuRetraitVarianteAnon: (demande: DemandeRetraitVarianteAnon) => Promise<ApercuRetraitVarianteAnon>
        retirerVarianteAnon: (token: string, confirmee: boolean) => Promise<BilanRetraitVarianteAnon | BilanRetraitVarianteDistant>
        suiviRetraitVarianteAnon: () => Promise<SuiviRetraitVarianteAnon | null>
        relireSuiviRetraitVarianteAnon: (operationId: string) => Promise<BilanRetraitVarianteDistant>
        apercuRepriseRetraitVarianteAnon: (operationId: string) => Promise<ApercuRetraitVarianteAnon>
        apercuSuppressionAnon: (demande: DemandeSuppressionAnon) => Promise<ApercuSuppressionAnon>
        supprimerRegleAnonPartout: (token: string, confirmee: boolean) => Promise<BilanSuppressionAnon | BilanSuppressionDistant>
        suiviSuppressionAnon: () => Promise<SuiviSuppressionAnon | null>
        relireSuiviSuppressionAnon: (operationId: string) => Promise<BilanSuppressionDistant>
        apercuRepriseSuppressionAnon: (operationId: string) => Promise<ApercuSuppressionAnon>
        apercuDissociationAnon: (demande: DemandeDissociationAnon) => Promise<ApercuDissociationAnon>
        dissocierRegleAnon: (token: string, confirmee: boolean) => Promise<BilanDissociationAnon | BilanDissociationDistant>
        suiviDissociationAnon: () => Promise<SuiviDissociationAnon | null>
        relireSuiviDissociationAnon: (operationId: string) => Promise<BilanDissociationDistant>
        apercuRepriseDissociationAnon: (operationId: string) => Promise<ApercuDissociationAnon>
        apercuRenommageAnon: (demande: DemandeRenommageAnon) => Promise<ApercuRenommageAnon>
        renommerVarianteAnon: (token: string, confirmee: boolean) => Promise<BilanRenommageAnon>
        suiviRenommageAnon: () => Promise<SuiviRenommageAnon | null>
        apercuRepriseRenommageAnon: (operationId: string) => Promise<ApercuRenommageAnon>
        regleAnonCreer: (entite: string, pseudos: string[], categorie?: string) => Promise<{ regle: RegleAnon; existait: boolean }>
        regleAnonAjouterVariante: (demande: DemandeAjoutVarianteAnon) => Promise<ResultatAjoutVarianteAnon>
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
        marquerDemo: (marqueur: MarqueurDemo, dirAttendu?: string) => Promise<CorpusFichier>
        assignerAudio: (id: string, source: string) => Promise<{ audioRef: string } | null>
        effacerAudio: (id: string) => Promise<{ audioRef: null }>
        ecrireWaveform: (id: string, png: Uint8Array) => Promise<string>
        associerAudioLocal: (id: string, source: string) => Promise<{ audioRef: string } | null>
        audios: () => Promise<Record<string, { audio: string | null; waveform: string | null }>>
        verifierAudios: () => Promise<Record<string, 'ok' | 'manquant'>>
        copieSauvegardeZip: () => Promise<ResultatArchiveCorpus>
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
        choisirDossier: (kind?: 'sources' | 'corpus' | 'projet', proposition?: string) => Promise<string | null>
        choisirExport: (nomSuggere: string, contenu: string) => Promise<string | null>
        choisirJson: (defaultPath?: string) => Promise<{ nom: string; contenu: string } | null>
      }
      /** Exports d'entretien dont le BUFFER est construit côté main (DOCX, PDF). */
      export: {
        entretienDocx: (demande: DemandeExportDocx) => Promise<string | null>
        entretienPdf: (demande: DemandeExportPdf) => Promise<string | null>
        /** URL audio locale vérifiée pour l'export HTML ; null si le média
         *  est absent, inaccessible ou non whiteliste (corpus distant). */
        audioLocal: (audioRef: string) => Promise<string | null>
        /** Instantané d'un entretien NON ouvert, assemblé par le main depuis
         *  les fichiers du corpus (export de lot) ; échec typé sinon. */
        instantaneCorpus: (id: string) => Promise<ResultatInstantaneCorpus>
        /** Session d'écriture d'un LOT : dossier choisi une fois, puis
         *  écritures atomiques limitées à ce dossier. */
        corpus: {
          choisirDossier: (nomSuggere: string) => Promise<string | null>
          lister: () => Promise<string[]>
          ecrireTexte: (nom: string, contenu: string) => Promise<ResultatEcritureCorpus>
          ecrireDocx: (demande: DemandeExportDocxCorpus, nom: string) => Promise<ResultatEcritureCorpus>
          ecrirePdf: (nom: string, html: string) => Promise<ResultatEcritureCorpus>
          copierMedia: (urlAudio: string) => Promise<ResultatEcritureCorpus>
          ecrireQualcoder: (modele: QualcoderExportModel) => Promise<void>
          fermer: () => Promise<void>
        }
      }
      /** Registre « Mes modèles » du profil (settings.json), partagé entre corpus. */
      modeles: {
        lire: () => Promise<ModeleEAV[]>
        ajouter: (modele: ModeleEAV) => Promise<ModeleEAV[]>
      }
      gitlab: ApiGitLab
      webdav: ApiWebDAV
      distant: ApiDistant
      media: {
        lireLargeurVideo: (dir: string) => Promise<number | null>
        ecrireLargeurVideo: (dir: string, largeur: number) => Promise<void>
      }
      profil: {
        lireNavigationProjet: () => Promise<MemoireNavigationProjet>
        memoriserNavigationProjet: (cle: string, navigation: NavigationProjet) => Promise<void>
        signataire: () => Promise<string>
        memoriserSignataire: (nom: string) => Promise<void>
      }
      fichier: {
        extraireTexteEntretien: (nom: string, octets: Uint8Array) => Promise<string>
        cheminDe: (f: File) => string
      }
      migrer: import('../shared/migrationV1').PontMigrationV1 & {
        gitlab: import('../shared/corpus/migrationGitLab').ApiMigrationGitLab
      }
      ouverture: import('../shared/ouvertureFichier').PontOuvertureFichier
      exemples: {
        etat: () => Promise<EtatExemples>
        textesSources: () => Promise<Array<{ cle: string; contenu: string }>>
        selectionner: (dir: string) => Promise<void>
        rattacher: (dir: string, ancienDir?: string) => Promise<TravailExemple>
        restaurerSources: () => Promise<void>
        voirSources: (dossier?: DossierFichiersExercice) => Promise<string>
        surRattachement: (cb: (dir: string) => void) => () => void
      }
    }
  }
}
