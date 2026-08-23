/**
 * Compteur « à anonymiser » — requête PURE du niveau entretien.
 *
 * Pour une ligne du tableau (une entité), liste les occurrences de l'entité
 * dans le texte qui ne sont couvertes par AUCUNE annotation anon de cette
 * même entité (ni anonymisée, ni exception). Rien n'est stocké : on relit le
 * doc à chaque calcul, l'affichage reste donc une requête.
 *
 * Une annotation d'une AUTRE entité ne bloque pas le comptage (les
 * chevauchements inter-règles sont le sujet des « incluses », traités à part).
 */
import type { Annotation } from '../annotation'
import { estOrpheline } from '../annotation'
import { aplatir, occurrencesDe, plageVersPM, type TextePlat } from './anonymisation'
import { cleEntite } from './brouillonsAnon'

/** Catégorie navigable d'un compteur : état posé (par variante) ou requête. */
export type CategorieReperage = 'anonymise' | 'exception' | 'a-anonymiser'

/** Un hit « à anonymiser », en positions ProseMirror (cohérent avec les
 *  annotations et le curseur). */
export interface HitAAAnonymiser {
  from: number
  to: number
}

/**
 * Liste les hits « à anonymiser » de la ligne `cle` (une entité = un ou
 * plusieurs alias, aujourd'hui toujours un seul texte).
 *
 * `texteDe` lit le texte d'une plage PM sur le doc courant (injecté) : la
 * fonction reste pure et testable headless. Les hits sont triés par position.
 */
export function hitsAAAnonymiser(
  corpsTexte: unknown,
  alias: string[],
  annotations: Annotation[],
  clesDeLigne: string[],
  texteDe: (from: number, to: number) => string,
): HitAAAnonymiser[] {
  const plat: TextePlat = aplatir(corpsTexte)
  const ensemble = new Set(clesDeLigne.map((k) => k.toLowerCase()))
  // Annotations anon VIVANTES de CETTE ligne (tous aliases confondus) : elles
  // masquent les matchs qu'elles couvrent (anonymisées comme exceptions — une
  // exception n'est jamais « à anonymiser »).
  const masques = annotations.filter(
    (a) =>
      a.type === 'anon' &&
      !estOrpheline(a) &&
      ensemble.has(cleEntite(texteDe(a.from, a.to))),
  )
  const hits: HitAAAnonymiser[] = []
  for (const g of alias) {
    for (const m of occurrencesDe(plat.texte, g)) {
      const pm = plageVersPM(plat, m.from, m.to)
      if (!pm) continue
      const couvert = masques.some((a) => a.from <= pm.from && a.to >= pm.to)
      if (!couvert) hits.push(pm)
    }
  }
  return hits.sort((x, y) => x.from - y.from)
}

/**
 * Liste les occurrences NAVIGABLES d'une catégorie POSÉE pour la ligne `cle`,
 * en positions PM triées : annotations anonymisées ou exceptions (filtrées par
 * variante de pseudo si donnée). Sans effet sur le modèle — le repérage est
 * non destructif. La catégorie « à anonymiser » vient de `hitsAAAnonymiser`
 * (requête sur le doc courant, pilotée par le composable).
 */
export function hitsDeCategorie(
  annotations: Annotation[],
  cle: string,
  categorie: Exclude<CategorieReperage, 'a-anonymiser'>,
  texteDe: (from: number, to: number) => string,
  variante?: string,
): HitAAAnonymiser[] {
  const ensemble = new Set(cle.toLowerCase().split('/'))
  const out: HitAAAnonymiser[] = []
  for (const a of annotations) {
    if (a.type !== 'anon' || estOrpheline(a)) continue
    if ((a.etat ?? 'anonymise') !== categorie) continue
    if (variante && (a.pseudo || '').toLowerCase() !== variante.toLowerCase()) continue
    if (!ensemble.has(cleEntite(texteDe(a.from, a.to)))) continue
    out.push({ from: a.from, to: a.to })
  }
  return out.sort((x, y) => x.from - y.from)
}