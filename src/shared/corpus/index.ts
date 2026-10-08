/**
 *  Agrégat **Corpus** (docs/dev/modele-objet.md) — surface publique ; un fichier
 *  par concept du modèle objet :
 *   • categories.ts — codebook + hiérarchie des thèmes
 *   • variables.ts  — base de données EAV (variables/modalités)
 *   • requetes.ts   — inventaires & matrice = requêtes (rien de stocké)
 *   • import.ts     — sas d'import `.sonal` (idempotent par id)
 *
 *  Toutes ces fonctions sont PURES (aucune I/O, aucun electron), séparées de
 *  leur STOCKAGE (`main/corpusStore.ts`) ; pendant symétrique de l'agrégat
 *  Entretien (`shared/entretien/`).
 */
export * from './categories'
export * from './themes'
export * from './variables'
export * from './requetes'
export * from './import'
export * from './scanAnon'
export * from './reglesAnon'
export * from './eav'
export * from './squelette'
export * from './notes'
export * from './recueils'
export * from './cas'
export * from './observationsAttributs'
export * from './suppressionEntretien'
export * from './ordreEntretiens'
