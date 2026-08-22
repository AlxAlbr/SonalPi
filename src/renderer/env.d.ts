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
import type { AnalyseCrp, DemandeMigration, VerificationDossierMigration } from '../shared/corpus/migrationCrp'
import type {
  CompteDistantPublic,
  DemandeConnexion,
  DemandeCreationDistante,
  DivergenceDistante,
  OrphelinDistant,
  OuvertureDistante,
  ResultatConnexion,
  ResultatTiragePublic,
} from '../shared/distant'

declare global {
  interface Window {
    sonal: {
      platform: string
      corpus: {
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
        fermerEntretien: (id: string) => Promise<boolean>
        etatSession: (
          id: string,
        ) => Promise<{ etat: 'aucune' | 'a-nous'; dernierPubli?: string | null; sale?: boolean }>
        publierEntretien: (id: string) => Promise<{ ok: boolean; raison?: string }>
        ecrireEntretien: (id: string, p: PayloadEntretien) => Promise<string>
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
        supprimerCategorie: (id: string, exceptId?: string) => Promise<ResultatSuppressionCategorie>
        usagesParCategorie: () => Promise<Record<string, number>>
        resumesThematiques: () => Promise<Record<string, SegmentThematique[]>>
        reglesAnon: () => Promise<RegleAnon[]>
        scanAnon: () => Promise<ScanRegle[]>
        regleAnonParEntite: (entite: string) => Promise<RegleAnon | undefined>
        regleAnonCreer: (entite: string, pseudos: string[]) => Promise<RegleAnon>
        regleAnonAjouterPseudo: (id: string, pseudo: string) => Promise<RegleAnon | null>
        regleAnonUtiliseeAilleurs: (id: string, exceptId?: string) => Promise<boolean>
        regleAnonSupprimer: (id: string) => Promise<void>
        appliquerRegleAnon: (entretienId: string, regleId: string) => Promise<{ nb: number; titre: string }>
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
      }
      dialog: {
        choisirTexte: (defaultPath?: string) => Promise<{ nom: string; contenu: string } | null>
        choisirAudio: (defaultPath?: string) => Promise<string | null>
        choisirDossier: (kind?: 'sources' | 'corpus' | 'projet') => Promise<string | null>
        choisirExport: (nomSuggere: string, contenu: string) => Promise<string | null>
      }
      distant: {
        lister: () => Promise<CompteDistantPublic[]>
        connecter: (params: DemandeConnexion) => Promise<ResultatConnexion>
        creer: (params: DemandeCreationDistante) => Promise<ResultatConnexion>
        ouvrir: (id: string) => Promise<OuvertureDistante>
        tirer: () => Promise<ResultatTiragePublic | null>
        orphelins: () => Promise<OrphelinDistant[] | null>
        reprendreOrphelin: (cheminVerrou: string) => Promise<{ ok: boolean; raison?: string }>
        abandonnerOrphelin: (cheminVerrou: string) => Promise<void>
        listerDivergences: () => Promise<DivergenceDistante[]>
        lireDivergence: (chemin: string) => Promise<unknown>
        supprimerDivergence: (chemin: string) => Promise<void>
        /** Présence (E4 §9) : signale l'entretien ouvert sur CE poste (null =
         *  aucun / retour à l'écran Corpus). Best effort côté main. */
        noterEntretienOuvert: (id: string | null) => Promise<void>
        oublier: (id: string) => Promise<CompteDistantPublic[]>
      }
      media: {
        lireLargeurVideo: (dir: string) => Promise<number | null>
        ecrireLargeurVideo: (dir: string, largeur: number) => Promise<void>
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
        verifierCorpus: (dir: string) => Promise<{ dejaCorpus: boolean }>
      }
    }
  }
}
