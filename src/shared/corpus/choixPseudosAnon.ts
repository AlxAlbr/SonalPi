import type { Annotation } from '../entretien/annotation'
import type { RegleAnon } from '../format'

/** Les décisions déjà publiées gardent leur choix ; les nouveaux choix suivent la définition courante. */
export function verifierChoixPseudosAnon(annotations: Annotation[], regles: Record<string, RegleAnon>, avant: Annotation[]): void {
  const precedentes = new Map(avant.map((a) => [a.id, a]))
  const cle = (s: string) => s.trim().normalize('NFC')
  for (const a of annotations) {
    if (a.type !== 'anon' || !a.regle) continue
    const regle = Object.hasOwn(regles, a.regle) ? regles[a.regle] : undefined
    if (!regle) throw new Error('La règle liée n’existe plus. Relisez les définitions avant de publier.')
    if (a.etat === 'exception') continue
    const precedente = precedentes.get(a.id)
    const conserve = precedente?.type === 'anon' && precedente.regle === a.regle
      && precedente.etat !== 'exception' && precedente.pseudo === a.pseudo
    if (!conserve && (typeof a.pseudo !== 'string' || !regle.pseudos.some((p) => cle(p) === cle(a.pseudo!)))) {
      throw new Error('La variante choisie n’est plus déclarée. Relisez la règle publiée avant de créer ou modifier cette décision liée.')
    }
  }
}
