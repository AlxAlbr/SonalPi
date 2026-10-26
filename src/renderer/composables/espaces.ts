/**
 *  Vocabulaire de la navigation principale.
 *  Les espaces regroupent les outils par intention ; `vue` désigne l'écran affiché.
 */

/** Écran affiché : accueil, espace de travail ou traitement (corpus / entretien). */
export type VueApplication = 'accueil' | 'preparer' | 'analyser' | 'organiser' | 'corpus' | 'entretien'

/** Onglets de l'espace « Préparer et suivre ». */
export type SousEspacePreparation = 'accueil' | 'tableau-bord' | 'docs-cadre' | 'documents-exemples'

/** Onglets de l'espace « Analyser et interpréter ». */
export type SousEspaceAnalyse = 'synthese' | 'lexico' | 'analyses-croisees'

/** Onglets de l'espace « Organiser et exporter ». */
export type SousEspaceOrganisation = 'cas' | 'recueils' | 'export'

/** Onglets du corpus dans « Importer et traiter ». */
export type OngletCorpus = 'accueil' | 'themes' | 'recherche' | 'personnes' | 'notes' | 'donnees' | 'anon'
