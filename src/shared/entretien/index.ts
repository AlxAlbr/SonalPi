/**
 *  Agrégat ENTREtien — surface publique (pendant symétrique de
 *  `shared/corpus/index.ts`). Un fichier par concept :
 *  • positions.ts    — positions ProseMirror + tranches (texte plat)
 *  • annotation.ts   — modèle des annotations (codage / anon / exception)
 *  • audio.ts        — ancres temporelles {pos, t}
 *  • entretien.ts    — commandes de l'agrégat Entretien
 *  • journal.ts      — journal d'activité
 *  • locuteurs.ts    — locuteurs (dont pseudo/pseudoEtat)
 *  • migration.ts    — migration v1→v2 des entretiens
 *  • anon/           — DOMAINE anonymisation (moteur, brouillons, pseudos,
 *                      application en masse), voir anon/index.ts
 *
 *  Toutes ces fonctions sont PURES (aucune I/O, aucun DOM, aucun electron),
 *  testables headless. Les fichiers s'importent entre eux en relatif précis,
 *  jamais par ce barrel (pas de cycle).
 */
export * from './positions'
export * from './annotation'
export * from './audio'
export * from './entretien'
export * from './journal'
export * from './locuteurs'
export * from './migration'
export * from './anon'