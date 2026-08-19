/**
 * Anonymisation — cœur PUR du niveau entretien (v1).
 *
 * On anonymise des **occurrences** d'une entité dans le texte : on ne manipule
 * QUE du texte plat et des plages. Aucun DOM, aucun ProseMirror → testable
 * headless. L'intégration éditeur (positions PM, décorations) s'appuie dessus.
 *
 * Distinction fondamentale (cf. plan-anon-debut.md §1) :
 *  - une **OccurrenceAnon** = une décision sur une plage de texte, vit dans
 *    `Annotation{type:'anon'}` (entretien) ;
 *  - une **RegleAnon** = un mappage entité→pseudo partagé, vit au corpus
 *    (étape 2, pas ici).
 *
 * En v1, l'onglet Anon ne fait que des occurrences : on matche une entité à la
 * validation, on pose une occurrence par match non déjà couvert. Pas de règle
 * persistée, pas de « à traiter » en temps réel, pas d'incluses, pas de
 * multi-alias/multi-pseudo (le modèle de données futur reste `string[]`).
 */

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
 * Occurrences d'une entité dans un texte plat.
 *
 * Insensible à la casse, **frontières de mot Unicode**
 * (donc « Paul » ne matche pas dans « Pauline »). La ponctuation de bord du
 * texte est naturellement exclue du match : « Lyon. » est couvert par la plage
 * « Lyon » (le point reste hors de l'occurrence), sans rien rogner manuellement.
 *
 * Les occurrences d'une même entité ne se chevauchent pas (une regex ne produit
 * pas de matches se recouvrant pour un littéral). La résolution « la plus longue
 * gagne » (principe des incluses) n'a donc pas lieu d'être ici ; elle reviendra
 * avec le multi-alias, où deux alias d'une même entité peuvent se recouvrir.
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
// Le moteur raisonne sur du texte plat ; l'éditeur est un doc ProseMirror dont
// les positions comptent les frontières de blocs (open + contenu + close,
// cf. positions.ts : chaque bloc pèse `2 + longueur`). On aplatit le doc en un
// texte plat où les blocs sont séparés par un SAUT DE LIGNE : un saut n'étant
// jamais une lettre, il empêche les matches de franchir la frontière de deux
// blocs (pas de faux positif « New York » à cheval sur deux paragraphes).
// ─────────────────────────────────────────────────────────────────────────────

/** Texte plat d'un doc + la carte de ses blocs (début PM + longueur de texte). */
export interface TextePlat {
  texte: string
  /** Un bloc par paragraphe : `debut` = position PM du 1er caractère du
   *  contenu, `longueur` = nombre de caractères de texte du bloc. */
  blocs: Array<{ debut: number; longueur: number }>
}

/**
 * Aplatit un doc ProseMirror (JSON canonique
 * `{type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]}`) en
 * un `TextePlat`. Les blocs vides (sans contenu) pèsent 0 mais existent
 * toujours (ils gardent leur frontière PM `2`).
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
 * Offset plat → position PM. Le bloc contenant l'offset est trouvé par sa
 * fenêtre plat `[debutFlat, debutFlat + longueur[`. `debutFlat` n'est pas
 * stocké (reconstruit en marchant : un saut de ligne sépare deux blocs).
 * Renvoie null si l'offset tombe sur un séparateur inter-blocs (un match ne
 * peut jamais s'y trouver — les frontières de mot l'interdisent).
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

/** Convertit une plage plat [from,to[ en plage PM. Les deux bornes doivent
 *  appartenir au MÊME bloc (garanti par les frontières de mot + le séparateur). */
export function plageVersPM(t: TextePlat, from: number, to: number): { from: number; to: number } | null {
  const pf = offsetVersPM(t, from)
  const pt = offsetVersPM(t, to)
  if (pf == null || pt == null) return null
  return { from: pf, to: pt }
}
