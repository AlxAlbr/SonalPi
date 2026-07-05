/**
 * Agrégat **Corpus** (MODELE_OBJET2 §1) — surface publique. Un fichier par
 * concept du modèle objet, chacun étiqueté par sa section du doc :
 *   • categories.ts — codebook + hiérarchie des thèmes        (§2)
 *   • variables.ts  — base de données EAV (variables/modalités) (§5)
 *   • requetes.ts   — inventaires & matrice = requêtes          (§10)
 *   • import.ts     — sas d'import `.sonal` (idempotent par id) (§12)
 *
 * Toutes ces fonctions sont PURES (aucune I/O, aucun electron), séparées de leur
 * STOCKAGE (`main/corpusStore.ts`). Pendant symétrique de l'agrégat Entretien
 * (`shared/entretien/`).
 */
export * from './categories'
export * from './variables'
export * from './requetes'
export * from './import'
