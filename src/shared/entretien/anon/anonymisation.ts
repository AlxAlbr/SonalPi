/**
 *  Anonymisation — cœur PUR du niveau entretien (v1).
 *
 *  On anonymise des **occurrences** d'une entité dans le texte ; on ne manipule
 *  QUE du texte plat et des plages. Aucun DOM, aucun ProseMirror → testable
 *  headless. L'intégration éditeur (positions PM, décorations) s'appuie dessus.
 *
 *  Distinction fondamentale :
 *   - une **OccurrenceAnon** = une décision sur une plage de texte, vit dans
 *     `Annotation{type:'anon'}` (entretien) ;
 *   - une **RegleAnon** = un mappage entité→pseudo partagé, vit au corpus
 *     au corpus (pas ici).
 *
 *  En v1, l'onglet Anon ne fait que des occurrences : on matche une entité à la
 *  validation, on pose une occurrence par match non déjà couvert. Pas de règle
 *  persistée, pas de « à traiter » en temps réel, pas d'incluses, pas de
 *  multi-alias/multi-pseudo (le modèle de données futur reste `string[]`).
 */

import { cleEntite } from './brouillonsAnon'
import { estOrpheline, type Annotation } from '../annotation'

export interface Plage {
  from: number
  to: number
}

/** Échappe une chaîne pour un usage littéral dans une regex. */
function echapper(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Deux plages [a,b[ et [c,d[ se chevauchent-elles ? */
export function chevauche(a: Plage, b: Plage): boolean {
  return a.from < b.to && b.from < a.to
}
/**
 *  Occurrences d'une entité dans un texte plat.
 *
 *  Insensible à la casse, **frontières de mot Unicode** (donc « Paul » ne
 *  matche pas dans « Pauline »). La ponctuation de bord du texte est
 *  naturellement exclue du match : « Lyon. » est couvert par la plage « Lyon »
 *  (le point reste hors de l'occurrence), sans rien rogner manuellement.
 *
 *  Les occurrences d'une même entité ne se chevauchent pas (une regex ne
 *  produit pas de matches se recouvrant pour un littéral). La résolution « la
 *  plus longue gagne » (principe des incluses) n'a donc pas lieu d'être ici ;
 *  elle reviendra avec le multi-alias, où deux alias d'une même entité peuvent
 *  se recouvrir.
 */
export function occurrencesDe(texte: string, entite: string): Plage[] {
  const g = entite.trim()
  if (!g) return []
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${echapper(g)})(?![\\p{L}\\p{N}])`, 'giu')
  const out: Plage[] = []
  for (const m of texte.matchAll(re)) {
    if (m.index == null) continue
    out.push({ from: m.index, to: m.index + m[0].length })
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Adaptateur texte plat ↔ positions ProseMirror.
//
// Le moteur raisonne sur du texte plat ; l'éditeur est un doc ProseMirror,
// dont les positions comptent les frontières de blocs (open + contenu + close,
// cf. positions.ts : chaque bloc pèse `2 + longueur`).
// On aplatit le doc en un texte plat, où les blocs sont séparés par un saut de ligne.
// Comme un saut de ligne n'est jamais une lettre, les matches ne le franchissent pas,
// donc pas de faux positif « New York » à cheval sur deux paragraphes.
// ─────────────────────────────────────────────────────────────────────────────

/** Texte plat d'un doc + la carte de ses blocs (début PM + longueur de texte). */
export interface TextePlat {
  texte: string
  /** Un bloc par paragraphe : `debut` = position PM du premier caractère du contenu,
   *  `longueur` = nombre de caractères de texte du bloc. */
  blocs: Array<{ debut: number; longueur: number }>
}

/**
 *  Aplatit un doc ProseMirror (JSON canonique
 *  `{type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]}`) en
 *  un `TextePlat`. Les blocs vides (sans contenu) pèsent 0 mais existent
 *  toujours (ils gardent leur frontière PM `2`).
 */
export function aplatir(corpsTexte: unknown): TextePlat {
  const doc = corpsTexte as { content?: Array<{ content?: Array<{ text?: string }> }> }
  const blocs: Array<{ longueur: number }> = []
  const bouts: string[] = []
  for (const p of doc?.content ?? []) {
    const t = (p.content ?? []).map((n) => n.text ?? '').join('')
    blocs.push({ longueur: t.length })
    bouts.push(t)
  }
  const texte = bouts.join('\n')
  // Début PM du contenu de chaque bloc : 1 (entrée du doc) + Σ(2 + longueur).
  let pos = 1
  const blocsPM = blocs.map((b) => {
    const debut = pos
    pos += 2 + b.longueur
    return { debut, longueur: b.longueur }
  })
  return { texte, blocs: blocsPM }
}

/**
 *  Offset plat → position PM. Le bloc contenant l'offset est trouvé par sa
 *  fenêtre plat `[debutFlat, debutFlat + longueur[`. `debutFlat` n'est pas
 *  stocké (reconstruit en marchant : un saut de ligne sépare deux blocs).
 *  Renvoie null si l'offset tombe sur un séparateur inter-blocs (un match ne
 *  peut jamais s'y trouver — les frontières de mot l'interdisent).
 */
export function offsetVersPM(t: TextePlat, offset: number): number | null {
  let plat = 0
  for (const b of t.blocs) {
    if (offset >= plat && offset < plat + b.longueur) {
      return b.debut + (offset - plat)
    }
    plat += b.longueur + 1 // +1 pour le '\n' séparateur
  }
  return null
}

/** Convertit une plage plat [from,to[ en plage PM.
 *  Les deux bornes doivent appartenir au MÊME bloc (garanti par les frontières
 *  de mot + le séparateur). */
export function plageVersPM(t: TextePlat, from: number, to: number): { from: number; to: number } | null {
  const pf = offsetVersPM(t, from)
  const pt = offsetVersPM(t, to)
  if (pf == null || pt == null) return null
  return { from: pf, to: pt }
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation d'une ligne du tableau (v1) : relabel + pose.
//
// Logique extraite en PURE pour être testable headless ;
// le couplage Vue/PM vit dans useEntretien.validerAnon, qui APPLIQUE les instructions renvoyées ici.
// ─────────────────────────────────────────────────────────────────────────────

/** Instructions d'application produites par une validation de ligne.
 *  Rien n'est muté ici : l'appelant (la table réactive) applique les deux
 *  listes. */
export interface InstructionsValiderAnon {
  /** Occurrences ANONYMISÉES de la ligne à relabeler (jamais les exceptions). */
  relabel: Array<{ id: string; pseudo: string }>
  /** Nouvelles occurrences (etat 'anonymise') à poser. */
  poser: Array<{ id: string; from: number; to: number; pseudo: string }>
}

/**
 *  Applique la validation d'une ligne (Entrée) :
 *   1. Relabel — les occurrences ANONYMISÉES de la ligne reçoivent `pseudo` ;
 *      les EXCEPTIONS gardent leur état et leur pseudo-mémoire intacts
 *      (on n'écrase jamais une exception) ;
 *   2. Pose — une occurrence est posée sur chaque match du texte NON déjà
 *      couvert. Une EXCEPTION au contact du match bloque la pose (le match
 *      reste en clair — « une exception ne repasse jamais à traiter »).
 *      Un match contenant des occurrences ANONYMISÉES plus étroites les
 *      CONSERVE : elles deviennent « incluses » (masquées par la plus large,
 *      comptées nulle part) et réapparaîtront telles quelles au retrait de
 *      celle-ci — la restauration est gratuite car rien n'est détruit.
 *  PURE : lit `annotations`/`texteDe`, ne mute rien.
 */
export function instructionsValiderAnon(
  annotations: Annotation[],
  matches: Plage[],
  cles: string | string[],
  pseudo: string,
  texteDe: (from: number, to: number) => string,
  genId: () => string,
): InstructionsValiderAnon {
  const ensemble = new Set((Array.isArray(cles) ? cles : [cles]).map((k) => k.toLowerCase()))
  const existant = annotations.filter((a) => a.type === 'anon' && !estOrpheline(a))

  // 1. Relabel : occurrences ANONYMISÉES de la ligne uniquement ;
  //    une occurrence appartient à la ligne si SA cle fait partie des aliases.
  const relabel: Array<{ id: string; pseudo: string }> = []
  for (const a of existant) {
    if (a.etat === 'exception') continue
    if (ensemble.has(cleEntite(texteDe(a.from, a.to)))) relabel.push({ id: a.id, pseudo })
  }

  // 2. Pose sur les matches non couverts (avec la garde d'exception).
  const poser: Array<{ id: string; from: number; to: number; pseudo: string }> = []
  for (const m of matches) {
    const touches = existant.filter((a) => chevauche(a, m))
    if (touches.length === 0) {
      poser.push({ id: genId(), from: m.from, to: m.to, pseudo })
      continue
    }
    // Une exception au contact du match bloque la pose : le match reste en clair.
    // La partie exceptée est mémorisée, l'autre n'est pas re-marquée (comportement conservateur).
    if (touches.some((a) => a.etat === 'exception')) continue
    // Déjà couvert en entier par une occurrence anonymisée → rien à faire.
    if (touches.some((a) => a.from <= m.from && a.to >= m.to)) continue
    // Le match contient des occurrences anonymisées plus étroites.
    // Qu'elles soient de cette entité ou d'une autre, on pose l'entité pleine PAR-DESSUS,
    // sans rien retirer ; les étroites deviennent des incluses masquées.
    if (touches.every((a) => a.from >= m.from && a.to <= m.to)) {
      poser.push({ id: genId(), from: m.from, to: m.to, pseudo })
    }
  }

  return { relabel, poser }
}
