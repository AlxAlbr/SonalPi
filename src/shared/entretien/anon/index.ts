/**
 * Surface PUBLIQUE du domaine ANONYMISATION (niveau entretien) — une seule
 * porte d'import pour les consommateurs : `import { … } from '../entretien/anon'`.
 *
 * La famille anon vit dans des fichiers granitaires (chacun a son cycle de
 * vie : moteur de spans, brouillons, pseudos multi, application en masse) mais
 * s'importe d'un seul geste. Les fichiers ENTRE EUX s'importent en relatif
 * précis — jamais par ce barrel (pas de cycle).
 */
export * from './anonymisation'
export * from './brouillonsAnon'
export * from './pseudos'
export * from './applicationMasse'