/**
 *  Détection textuelle et préparation pure des décisions de pseudonymisation.
 *  Chaque annotation conserve sa plage, son état et la variante choisie.
 *  Les règles partagées restent définies dans le corpus, indépendamment des locuteurs.
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
const segmentateurAlias = new Intl.Segmenter('fr', { granularity: 'grapheme' })

/** Recherche les occurrences entières avec leurs positions dans le texte original. */
export function occurrencesDe(texte: string, entite: string): Plage[] {
  const g = entite.trim()
  if (!g) return []
  // Les formes Unicode équivalentes sont reconnues sans changer les positions du texte.
  const motif = [...segmentateurAlias.segment(g.normalize('NFC'))].map(({ segment }) => {
    const formes = [...new Set([segment, segment.normalize('NFD')])].map(echapper)
    return formes.length === 1 ? formes[0] : `(?:${formes.join('|')})`
  }).join('')
  const re = new RegExp(`(?<![\\p{L}\\p{N}\\p{M}])(${motif})(?![\\p{L}\\p{N}\\p{M}])`, 'giu')
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
  const doc = corpsTexte as { content?: Array<{ content?: Array<{ type?: string; text?: string }> }> }
  const blocs: Array<{ longueur: number }> = []
  const bouts: string[] = []
  for (const p of doc?.content ?? []) {
    const t = (p.content ?? []).map((n) => n.type === 'hardBreak' ? '\n' : n.text ?? '').join('')
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
 *  Les deux bornes doivent appartenir au même bloc ; la borne finale est exclusive. */
export function plageVersPM(t: TextePlat, from: number, to: number): { from: number; to: number } | null {
  const pf = offsetVersPM(t, from)
  const dernier = offsetVersPM(t, to - 1)
  if (pf == null || dernier == null || to <= from) return null
  const bloc = t.blocs.find((b) => b.debut <= pf && pf < b.debut + b.longueur)
  if (!bloc || dernier >= bloc.debut + bloc.longueur) return null
  return { from: pf, to: dernier + 1 }
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation d'une ligne du tableau (itération 1) : relabel + pose.
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
  /** Plages contenant une exception et nécessitant une confirmation. */
  exceptionsProtegees: Plage[]
}

/**
 *  Applique la validation d'une ligne (Entrée) :
 *   1. Les occurrences anonymisées conservent leurs variantes déclarées ;
 *      les exceptions gardent leur état et leur pseudo-mémoire intacts ;
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
  variantesConservees: string[] = annotations.map((a) => a.pseudo ?? '').filter(Boolean),
  autoriserCouvertureExceptions = false,
): InstructionsValiderAnon {
  const ensemble = new Set((Array.isArray(cles) ? cles : [cles]).map((k) => k.toLowerCase()))
  const existant = annotations.filter((a) => a.type === 'anon' && !estOrpheline(a))

  // 1. Relabel : occurrences ANONYMISÉES de la ligne uniquement ;
  //    une occurrence appartient à la ligne si SA cle fait partie des aliases.
  const relabel: Array<{ id: string; pseudo: string }> = []
  for (const a of existant) {
    if (a.etat === 'exception') continue
    if (!ensemble.has(cleEntite(texteDe(a.from, a.to)))) continue
    const conserver = variantesConservees.some((p) => p.toLowerCase() === a.pseudo?.toLowerCase())
    relabel.push({ id: a.id, pseudo: conserver ? a.pseudo! : pseudo })
  }

  // 2. Pose sur les matches non couverts (avec la garde d'exception).
  const poser: Array<{ id: string; from: number; to: number; pseudo: string }> = []
  const exceptionsProtegees: Plage[] = []
  const uniques = matches.filter((m, i) => matches.findIndex((p) => p.from === m.from && p.to === m.to) === i)
  for (const m of uniques) {
    const touches = existant.filter((a) => chevauche(a, m))
    if (touches.length === 0) {
      poser.push({ id: genId(), from: m.from, to: m.to, pseudo })
      continue
    }
    // Une exception interne exige une confirmation ; une couverture partielle reste refusée.
    const exceptions = touches.filter((a) => a.etat === 'exception')
    if (exceptions.length) {
      const internes = exceptions.every((a) => m.from <= a.from && a.to <= m.to &&
        (m.from < a.from || a.to < m.to))
      if (!internes) continue
      if (!autoriserCouvertureExceptions) {
        exceptionsProtegees.push(m)
        continue
      }
    }
    // Déjà couvert en entier par une occurrence anonymisée → rien à faire.
    if (touches.some((a) => a.from <= m.from && a.to >= m.to)) continue
    // Le match contient des occurrences anonymisées plus étroites.
    // Qu'elles soient de cette entité ou d'une autre, on pose l'entité pleine PAR-DESSUS,
    // sans rien retirer ; les étroites deviennent des incluses masquées.
    if (touches.every((a) => a.from >= m.from && a.to <= m.to)) {
      poser.push({ id: genId(), from: m.from, to: m.to, pseudo })
    }
  }

  return { relabel, poser, exceptionsProtegees }
}
