/**
 * Brouillons d'anonymisation — cœur PUR du niveau entretien.
 *
 * Un `BrouillonAnon` est une entité saisie (depuis une sélection ou la ligne
 * de saisie du tableau) sans occurrence posée. Ce n'est PAS une règle : il vit
 * à l'entretien, n'est pas partagé au corpus. Validé (Entrée), il est consommé
 * et des `OccurrenceAnon` (annotations `type:'anon'`) sont posées à sa place.
 *
 * Ce module reste pur (pas de DOM, pas de ProseMirror) : la lecture du texte
 * d'une occurrence est injectée par l'appelant, ce qui le rend testable headless.
 */
import type { BrouillonAnon, RegleAnon } from '../../format'
import { joindrePseudos } from './pseudos'

/** Clef de groupement d'une entité (insensible à la casse, normalisée). */
export function cleEntite(entite: string): string {
  return entite.trim().toLowerCase()
}

/** Trouve un brouillon pour cette entité (insensible à la casse), ou undefined. */
export function trouverBrouillon(
  brouillons: BrouillonAnon[],
  entite: string,
): BrouillonAnon | undefined {
  const cle = cleEntite(entite)
  return brouillons.find((b) => cleEntite(b.entite) === cle)
}

/** Ajoute un brouillon (sans doublon de cle). Renvoie le brouillon créé ou
 *  l'existant si la cle est déjà présente. Pseudo optionnel. */
export function ajouterBrouillon(
  brouillons: BrouillonAnon[],
  entite: string,
  pseudo?: string,
): BrouillonAnon {
  const existant = trouverBrouillon(brouillons, entite)
  if (existant) return existant
  const b: BrouillonAnon = { entite: entite.trim() }
  const p = pseudo?.trim()
  if (p) b.pseudo = p
  brouillons.push(b)
  return b
}

/** Met à jour le pseudo d'un brouillon (repéré par cle d'entité). No-op si absent. */
export function majBrouillon(
  brouillons: BrouillonAnon[],
  entite: string,
  pseudo: string,
): void {
  const b = trouverBrouillon(brouillons, entite)
  if (!b) return
  const p = pseudo.trim()
  if (p) b.pseudo = p
  else delete b.pseudo
}

/** Retire le brouillon de cette entité (par cle). Renvoie true si retiré. */
export function retirerBrouillon(brouillons: BrouillonAnon[], entite: string): boolean {
  const cle = cleEntite(entite)
  const i = brouillons.findIndex((b) => cleEntite(b.entite) === cle)
  if (i === -1) return false
  brouillons.splice(i, 1)
  return true
}

/** Consomme le brouillon de cette entité (retire). Appelé à la validation,
 *  quand les occurrences sont posées : le brouillon a fait son travail. */
export function consommerBrouillon(brouillons: BrouillonAnon[], entite: string): void {
  retirerBrouillon(brouillons, entite)
}

// ─────────────────────────────────────────────────────────────────────────────
// Projection du tableau — une ligne par entité.
//
// Fusion des brouillons (0 occurrence) et des occurrences anonymisées posées.
// L'état d'une ligne est DÉRIVÉ (pas stocké) : `entretien` si des occurrences
// existent pour cette cle, `brouillon` sinon (un `BrouillonAnon` existe).
// Le « texte d'entité » d'une occurrence se lit sur le doc courant (injecté),
// donc si le texte est édité, l'entité suit.
// ─────────────────────────────────────────────────────────────────────────────

export type EtatLigneAnon = 'brouillon' | 'entretien' | 'corpus'

export interface LigneAnon {
  /** Clef de groupement (insensible à la casse). */
  cle: string
  /** Texte d'entité courant (dérivé du doc pour une occurrence, brut pour un brouillon). */
  entite: string
  /** Pseudo(s) affiché(s) — « a / b » pour une ligne multi. */
  pseudo: string
  /** État dérivé : `entretien` si occurrences posées standalone (pas de règle),
   *  `corpus` si au moins une occurrence est liée à une règle, sinon `brouillon`. */
  etat: EtatLigneAnon
  /** Id de la règle corpus liée (état `corpus`), sinon absent. */
  regle?: string
  /** Nombre total d'occurrences (anonymisées + exceptions). */
  nb: number
  /** Occurrences anonymisées (barrées + [pseudo]). */
  nbAnonymise: number
  /** Occurrences en exception (laissées en clair, marqueur pointillé). */
  nbException: number
  /** Ids des occurrences (vide pour un brouillon). */
  occurrenceIds: string[]
}

/** Une occurrence anonymisée vue par la projection (plage PM + pseudo + état). */
export interface OccurrenceAnonProjection {
  id: string
  from: number
  to: number
  pseudo?: string
  /** Id de la règle corpus liée (portée corpus), sinon absent (standalone). */
  regle?: string
  /** `exception` = décision « laisser en clair » (le pseudo éventuel n'est
   *  qu'une mémoire de modèle, jamais affichée ni sérialisée). */
  etat?: 'anonymise' | 'exception'
}

/**
 * Construit les lignes du tableau : une par entité, fusion brouillons +
 * occurrences. Les occurrences d'une même entité sont groupées (état
 * `entretien`) ; un brouillon sans occurrence devient une ligne `brouillon`.
 *
 * Le texte d'une occurrence est lu via `texteEntre` (injecté) : la fonction
 * reste pure, le doc est l'affaire de l'appelant.
 */
export function lignesAnonUnifiees(
  brouillons: BrouillonAnon[],
  occurrences: OccurrenceAnonProjection[],
  texteEntre: (from: number, to: number) => string,
  pseudosDeclares: Record<string, string[]> = {},
  reglesAnon: RegleAnon[] = [],
): LigneAnon[] {
  const parCle = new Map<string, LigneAnon>()
  // 1. Occurrences : une ligne par cle, agrégeant ses occurrences.
  for (const o of occurrences) {
    const entite = texteEntre(o.from, o.to)
    const cle = cleEntite(entite)
    let ligne = parCle.get(cle)
    if (!ligne) {
      // Portée corpus : si une occurrence est liée à une règle, la ligne est
      // `corpus` et affiche les pseudos de la règle (« a / b » si multi).
      const regle = o.regle ? reglesAnon.find((r) => r.id === o.regle) : undefined
      let etat: EtatLigneAnon = 'entretien'
      let pseudo = o.pseudo ?? ''
      if (regle) {
        etat = 'corpus'
        pseudo = joindrePseudos(regle.pseudos)
      } else {
        // Multi-pseudo standalone : un ensemble ≥2 déclaré prime sur le
        // pseudo d'une occurrence pour l'AFFICHAGE « a / b ».
        const declares = pseudosDeclares[cle]
        if (declares && declares.length > 1) pseudo = joindrePseudos(declares)
      }
      ligne = {
        cle,
        entite,
        pseudo,
        etat,
        regle: regle?.id,
        nb: 0,
        nbAnonymise: 0,
        nbException: 0,
        occurrenceIds: [],
      }
      parCle.set(cle, ligne)
    }
    ligne.nb++
    if (o.etat === 'exception') ligne.nbException++
    else ligne.nbAnonymise++
    ligne.occurrenceIds.push(o.id)
  }
  // 2. Brouillons : une ligne `brouillon` seulement si aucune occurrence n'a
  //    la même cle (sinon l'état `entretien` prime, le brouillon est absorbé).
  for (const b of brouillons) {
    const cle = cleEntite(b.entite)
    if (parCle.has(cle)) continue
    parCle.set(cle, {
      cle,
      entite: b.entite,
      pseudo: b.pseudo ?? '',
      etat: 'brouillon',
      nb: 0,
      nbAnonymise: 0,
      nbException: 0,
      occurrenceIds: [],
    })
  }
  return [...parCle.values()]
}
