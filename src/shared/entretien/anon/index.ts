/**
 *  Surface PUBLIQUE du domaine ANONYMISATION (niveau entretien).
 *  Une seule porte d'import pour les consommateurs :
 *  `import { … } from '../entretien/anon'`.
 *  La famille anon vit dans des fichiers granitaires, chacun son cycle de vie :
 *  moteur de spans, brouillons, pseudos multi, application en masse, tous
 *  importés d'un seul geste. Les fichiers ENTRE EUX s'importent en relatif
 *  précis, jamais par ce barrel ; ce qui évite les cycles.
 */
export * from './anonymisation'
export * from './alias'
export * from './brouillonsAnon'
export * from './compteursAnon'
export * from './pseudos'
export * from './applicationMasse'
export * from './motsLiaison'