/**
 *  Vocabulaire de la navigation principale.
 *  Les espaces regroupent les outils par intention ; `vue` désigne l'écran affiché.
 */

/** Écran affiché : accueil, préparation, analyse ou traitement (corpus / entretien). */
export type VueApplication = 'accueil' | 'preparer' | 'analyser' | 'corpus' | 'entretien'

/** Onglets de l'espace « Préparer et suivre ». */
export type SousEspacePreparation = 'accueil' | 'tableau-bord' | 'docs-cadre'

/** Onglets de l'espace « Analyser et interpréter ». */
export type SousEspaceAnalyse = 'synthese' | 'lexico' | 'analyses-croisees'
