/**
 *  Compteur « à anonymiser » — requête PURE du niveau entretien.
 *
 *  Pour une ligne du tableau (une entité), liste les occurrences de l'entité
 *  dans le texte qui ne sont couvertes par AUCUNE annotation anon de cette
 *  même entité (ni anonymisée, ni exception). Rien n'est stocké : on relit le
 *  doc à chaque calcul, l'affichage reste donc une requête.
 *
 *  Une annotation d'une AUTRE entité ne bloque pas le comptage (les
 *  chevauchements inter-règles sont le sujet des « incluses », traités à part).
 */
import type { Annotation } from '../annotation'
import { estOrpheline } from '../annotation'
import { aplatir, occurrencesDe, plageVersPM, type TextePlat } from './anonymisation'
import { cleEntite } from './brouillonsAnon'

/** Catégorie navigable d'un compteur : état posé (par variante) ou requête. */
export type CategorieReperage = 'anonymise' | 'exception' | 'a-anonymiser'

/** Un hit « à anonymiser », en positions ProseMirror (cohérent avec les annotations et le curseur). */
export interface HitAAAnonymiser {
  from: number
  to: number
}

/** Une occurrence INCLUSE : présente dans le texte mais recouverte par une annotation anon d'une AUTRE entité.
 *  Non comptée, non navigable, non actionnable — le clic retombe sur la règle large. */
export interface HitIncluse extends HitAAAnonymiser {
  /** Texte de l'entité absorbante (pour le tooltip « absorbée(s) par … »). */
  par: string
}

/**
 *  Classe les matches des alias contre les annotations vivantes du doc :
 *  - non couvert → « à anonymiser » ;
 *  - recouvert en entier par une annotation d'une AUTRE entité → incluse ;
 *  - couvert par une annotation de la MÊME ligne (anonymisée ou exception) →
 *    déjà traité (ni l'un ni l'autre).
 */
function classerMatches(
  corpsTexte: unknown,
  alias: string[],
  annotations: Annotation[],
  clesDeLigne: string[],
  texteDe: (from: number, to: number) => string,
): { aAnonymiser: HitAAAnonymiser[]; incluses: HitIncluse[] } {
  const plat: TextePlat = aplatir(corpsTexte)
  const ensemble = new Set(clesDeLigne.map((k) => k.toLowerCase()))
  const vivantes = annotations.filter((a) => a.type === 'anon' && !estOrpheline(a))
  const aAnonymiser: HitAAAnonymiser[] = []
  const incluses: HitIncluse[] = []
  for (const g of alias) {
    for (const m of occurrencesDe(plat.texte, g)) {
      const pm = plageVersPM(plat, m.from, m.to)
      if (!pm) continue
      const englobante = vivantes.find((a) => a.from <= pm.from && pm.to <= a.to)
      if (!englobante) {
        aAnonymiser.push(pm)
        continue
      }
      const texteAbsorbant = texteDe(englobante.from, englobante.to)
      if (!ensemble.has(cleEntite(texteAbsorbant))) {
        incluses.push({ from: pm.from, to: pm.to, par: texteAbsorbant })
      }
    }
  }
  const parPosition = (x: { from: number }, y: { from: number }) => x.from - y.from
  aAnonymiser.sort(parPosition)
  incluses.sort(parPosition)
  return { aAnonymiser, incluses }
}

/**
 *  Liste les hits « à anonymiser » de la ligne : occurrences présentes dans le
 *  texte et pas encore traitées par la ligne ELLE-MÊME, hors incluses (matches
 *  absorbés par une entité plus large — voir `hitsIncluses`).
 *
 *  `texteDe` lit le texte d'une plage PM sur le doc courant (injecté) : la
 *  fonction reste pure et testable headless.
 */
export function hitsAAAnonymiser(
  corpsTexte: unknown,
  alias: string[],
  annotations: Annotation[],
  clesDeLigne: string[],
  texteDe: (from: number, to: number) => string,
): HitAAAnonymiser[] {
  return classerMatches(corpsTexte, alias, annotations, clesDeLigne, texteDe).aAnonymiser
}

/** Liste les incluses de la ligne : matches recouverts par une entité plus large.
 *  Rien n'est stocké : au retrait de l'absorbante, elles redeviennent de simples hits « à anonymiser ». */
export function hitsIncluses(
  corpsTexte: unknown,
  alias: string[],
  annotations: Annotation[],
  clesDeLigne: string[],
  texteDe: (from: number, to: number) => string,
): HitIncluse[] {
  return classerMatches(corpsTexte, alias, annotations, clesDeLigne, texteDe).incluses
}

/**
 *  Liste les occurrences NAVIGABLES d'une catégorie POSÉE pour la ligne `cle`,
 *  en positions PM triées : annotations anonymisées ou exceptions (filtrées par
 *  variante de pseudo si donnée). Sans effet sur le modèle — le repérage est
 *  non destructif. La catégorie « à anonymiser » vient de `hitsAAAnonymiser`
 *  (requête sur le doc courant, pilotée par le composable).
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