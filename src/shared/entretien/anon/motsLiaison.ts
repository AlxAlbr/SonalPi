/**
 *  Mots de liaison / articles — détection PURE de l'entité-cœur (4b-B).
 *
 *  Quand l'utilisateur valide une entité à affixe (« à Lyon »), on peut lui
 *  proposer de créer AUSSI la règle générale (« Lyon »). La suggestion n'est
 *  JAMAIS automatique : elle est portée à la modale, « Non » ne crée rien.
 *
 *  L'affixe est reconnue en TÊTE de l'entité uniquement (un ou plusieurs mots
 *  de liaison consécutifs) : « à Lyon » ✓, « Maison des Habitants » ✗ (le mot
 *  de liaison est interne). Deux garde-fous : il doit rester un cœur non vide,
 *  et le premier mot du cœur doit être capitalisé (un nom propre) — sinon pas
 *  de proposition (« de fait » ne propose rien).
 *
 *  Le pseudo suit le même rognage en tête : « dans une grande ville » →
 *  « une grande ville » (seuls les tokens DE LA LISTE sont rognés ; l'élision
 *  « d'une » n'est PAS reconnue comme affixe — choix assumé, on reste simple).
 */

import type { MotsLiaisonParams } from '../../format'
import { parserAliases } from './alias'
import { cleEntite } from './brouillonsAnon'
import { scinderPseudos } from './pseudos'

/** Entité-cœur proposée : la règle générale à créer avec son pseudo rogner. */
export interface EntiteCoeur {
  entiteCoeur: string
  pseudoCoeur: string
}

/** Rogne ponctuation et espaces des deux bords (« “à Lyon.” » → « à Lyon »). */
function rognerBords(s: string): string {
  return s.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '')
}

/** Tokens d'une chaîne (bords rognés, séparés par des espaces). */
function tokeniser(s: string): string[] {
  return rognerBords(s).split(/\s+/).filter(Boolean)
}

/**
 *  Détecte l'entité-cœur d'une entité à affixe. Renvoie null s'il n'y a rien
 *  à proposer : pas d'affixe en tête, cœur vide ou non capitalisé.
 *  PURE : aucune consultation des réglages — la liste est passée en paramètre.
 */
export function detecterAffixeLiaison(
  entite: string,
  pseudo: string,
  motsLiaison: string[],
): EntiteCoeur | null {
  const liaison = new Set(motsLiaison.map((m) => m.toLowerCase()))
  const tokens = tokeniser(entite)
  // Affixe = mots de liaison consécutifs EN TÊTE uniquement.
  let tete = 0
  while (tete < tokens.length && liaison.has(tokens[tete].toLowerCase())) tete++
  if (tete === 0 || tete >= tokens.length) return null // pas d'affixe, ou cœur vide
  const coeur = tokens.slice(tete).join(' ')
  // Le cœur doit commencer par un nom propre capitalisé ([A-ZÀ-ÖØ-Þ]).
  if (!/^[A-ZÀ-ÖØ-Þ]/u.test(coeur)) return null
  return { entiteCoeur: coeur, pseudoCoeur: rognerAffixePseudo(pseudo, liaison) }
}

/** Pseudo-cœur : même rognage en tête que l'entité, jamais vide — si tout le pseudo est des mots de liaison, il est repris tel quel. */
function rognerAffixePseudo(pseudo: string, liaison: Set<string>): string {
  const tokens = tokeniser(pseudo)
  let tete = 0
  while (tete < tokens.length && liaison.has(tokens[tete].toLowerCase())) tete++
  if (tete === 0 || tete >= tokens.length) return tokens.join(' ')
  return tokens.slice(tete).join(' ')
}

/**
 *  Décision complète de suggestion, telle qu'appelée après une validation
 *  réussie. Renvoie null (pas de modale) si :
 *  - le réglage est absent, désactivé ou à liste vide ;
 *  - l'entité est multi-alias ou le pseudo multi-pseudo (invariant I2 :
 *    l'affixe ne se combine ni avec l'un ni avec l'autre) ;
 *  - il n'y a pas d'entité-cœur à proposer (`detecterAffixeLiaison`) ;
 *  - la règle-cœur existe déjà (même cle parmi `clesExistantes`, quel que soit
 *    son niveau : brouillon, entretien ou corpus) → pas de doublon, pas de
 *    question.
 */
export function suggestionCoeur(
  reglage: MotsLiaisonParams | undefined,
  entite: string,
  pseudo: string,
  clesExistantes: readonly string[],
): EntiteCoeur | null {
  if (!reglage?.actif || reglage.liste.length === 0) return null
  if (parserAliases(entite).length >= 2) return null
  if (scinderPseudos(pseudo).length >= 2) return null
  const det = detecterAffixeLiaison(entite, pseudo, reglage.liste)
  if (!det) return null
  const cleCoeur = cleEntite(det.entiteCoeur)
  // Une ligne existante COUVRE le cœur dès que l'un de ses aliases le désigne.
  // Un groupe « Lyon/Lyons » matche déjà « Lyon ».
  // Créer la règle-cœur ferait doublon avec lui.
  const existe = clesExistantes.some((c) =>
    c.toLowerCase().split('/').includes(cleCoeur),
  )
  if (existe) return null
  return det
}
