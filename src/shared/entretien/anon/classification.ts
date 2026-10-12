import type { Annotation } from '../annotation'
import { estOrpheline } from '../annotation'
import { aplatir, chevauche, occurrencesDe, type Plage, type TextePlat } from './anonymisation'
import { cleEntite } from './brouillonsAnon'

/** Lit une plage ProseMirror dans le texte aplati. */
export function textePlage(plat: TextePlat, from: number, to: number): string {
  let offset = 0
  const morceaux: string[] = []
  for (const bloc of plat.blocs) {
    const debut = Math.max(from, bloc.debut)
    const fin = Math.min(to, bloc.debut + bloc.longueur)
    if (debut < fin) morceaux.push(plat.texte.slice(offset + debut - bloc.debut, offset + fin - bloc.debut))
    offset += bloc.longueur + 1
  }
  return morceaux.join(' ')
}

/** Les alias qui se recouvrent désignent une seule occurrence, la plus longue. */
export function matchesAliases(texte: string, aliases: string[]): Plage[] {
  const matches = aliases.flatMap((alias) => occurrencesDe(texte, alias))
    .sort((a, b) => (b.to - b.from) - (a.to - a.from) || a.from - b.from)
  const retenus: Plage[] = []
  for (const match of matches) {
    let debut = 0
    let fin = retenus.length
    while (debut < fin) {
      const milieu = (debut + fin) >>> 1
      if (retenus[milieu].from < match.from) debut = milieu + 1
      else fin = milieu
    }
    const avant = retenus[debut - 1]
    const apres = retenus[debut]
    if ((avant && chevauche(match, avant)) || (apres && chevauche(match, apres))) continue
    retenus.splice(debut, 0, match)
  }
  return retenus
}

/** La décision englobante visible prime, indépendamment du pseudo et de l'ordre des annotations. */
export function annotationVisible(annotations: Annotation[], plage: Plage): Annotation | undefined {
  return annotations.filter((a) => a.type === 'anon' && !estOrpheline(a) && a.from <= plage.from && plage.to <= a.to)
    .sort((a, b) => (b.to - b.from) - (a.to - a.from) ||
      Number(b.etat === 'exception') - Number(a.etat === 'exception') || a.id.localeCompare(b.id))[0]
}

export function classerPlage(
  annotations: Annotation[],
  plage: Plage,
  cles: Set<string>,
  texteDe: (from: number, to: number) => string,
): { etat: 'anon' | 'exc' | 'non' | 'incl'; annotation?: Annotation } {
  const annotation = annotationVisible(annotations, plage)
  if (!annotation) return { etat: 'non' }
  const memeEntite = cles.has(cleEntite(texteDe(annotation.from, annotation.to)))
  if (!memeEntite) return { etat: 'incl', annotation }
  return { etat: annotation.etat === 'exception' ? 'exc' : 'anon', annotation }
}

/** Empreinte de revalidation ; aucune identité originale n'est transportée dans le contrat. */
export function empreinteAnon(entretien: { corpsTexte: unknown; annotations: Annotation[] }, regle: unknown): string {
  const definition = regle && typeof regle === 'object' && 'id' in regle && 'entite' in regle && 'pseudos' in regle
    ? [regle.id, regle.entite, regle.pseudos] : regle
  const texte = JSON.stringify([entretien.corpsTexte, entretien.annotations, definition])
  let a = 2166136261
  let b = 5381
  for (let i = 0; i < texte.length; i++) {
    a = Math.imul(a ^ texte.charCodeAt(i), 16777619)
    b = Math.imul(b, 33) ^ texte.charCodeAt(i)
  }
  return `${texte.length}:${a >>> 0}:${b >>> 0}`
}

export function texteDeDoc(corpsTexte: unknown): (from: number, to: number) => string {
  const plat = aplatir(corpsTexte)
  return (from, to) => textePlage(plat, from, to)
}
