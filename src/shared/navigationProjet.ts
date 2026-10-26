/** Emplacement restauré lorsqu’un projet déjà consulté est rouvert sur ce poste. */
export type NavigationProjet =
  | {
      vue: 'preparer'
      onglet: 'accueil' | 'tableau-bord' | 'docs-cadre' | 'documents-exemples'
    }
  | {
      vue: 'analyser'
      onglet: 'accueil' | 'synthese' | 'lexico' | 'analyses-croisees'
      panneauVisible: boolean
    }
  | {
      vue: 'organiser'
      onglet: 'accueil' | 'cas' | 'recueils' | 'export'
    }
  | {
      vue: 'corpus'
      onglet: 'accueil' | 'themes' | 'personnes' | 'notes' | 'donnees' | 'anon'
    }

/** La clé désigne le projet local ou distant dans les réglages de ce profil. */
export interface MemoireNavigationProjet {
  cle: string
  navigation: NavigationProjet | null
}
