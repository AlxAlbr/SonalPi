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
  LectureEntretien,
  MatriceCorpus,
  OuvertureCorpus,
  PatchCategorie,
  PayloadEntretien,
  ResultatSuppression,
  ResultatSuppressionCategorie,
  Variable,
} from '../shared/format'

declare global {
  interface Window {
    sonal: {
      platform: string
      corpus: {
        ouvrir: () => Promise<CorpusFichier>
        dossierCourant: () => Promise<DossierCorpus>
        recents: () => Promise<DossierCorpus[]>
        ouvrirDossier: (dir: string) => Promise<OuvertureCorpus>
        choisirDossier: () => Promise<OuvertureCorpus | null>
        lireEntretien: (id: string) => Promise<LectureEntretien>
        ecrireEntretien: (id: string, p: PayloadEntretien) => Promise<string>
        creerEntretien: (titre: string) => Promise<{ id: string; corpus: CorpusFichier }>
        renommerEntretien: (id: string, titre: string) => Promise<CorpusFichier>
        supprimerEntretien: (id: string) => Promise<CorpusFichier>
        importer: (
          titre: string,
          p: PayloadEntretien,
          codebook: Categorie[],
          variables: Variable[],
        ) => Promise<{ id: string; corpus: CorpusFichier }>
        ajouterCategorie: (
          nom: string,
          parent?: string | null,
        ) => Promise<{ id: string; corpus: CorpusFichier }>
        modifierCategorie: (id: string, patch: PatchCategorie) => Promise<CorpusFichier>
        deplacerCategorie: (id: string, sens: -1 | 1) => Promise<CorpusFichier>
        supprimerCategorie: (id: string, exceptId?: string) => Promise<ResultatSuppressionCategorie>
        usagesParCode: () => Promise<Record<string, number>>
        compterUsagesCode: (code: string, exceptId?: string) => Promise<number>
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
        poserValeur: (
          entretienId: string,
          cible: CibleValeur,
          idVar: string,
          idMod: string,
        ) => Promise<boolean>
      }
      dialog: {
        choisirImport: () => Promise<{ nom: string; contenu: string } | null>
        choisirExport: (nomSuggere: string, contenu: string) => Promise<string | null>
      }
    }
  }
}
