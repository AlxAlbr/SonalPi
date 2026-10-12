import type { RegleAnon } from '../format'
import type { ScanRegle, StatutScan } from './scanAnon'

export type FiltreEtatAnon = 'toutes' | 'a-traiter' | 'exceptions' | 'traitees' | 'inutilisees' | 'collisions'
export type TriAnon = 'entite' | 'pseudo'
export interface LignePresentationAnon { regle: RegleAnon; scan?: ScanRegle }
export type EtatRegleAnon = 'ok' | 'todo' | 'neutre' | 'inconnu'

export function etatRegleAnon(total?: StatutScan, frais = true): EtatRegleAnon {
  if (!total || !frais) return 'inconnu'
  if (total.non > 0) return 'todo'
  return total.anon + total.exc + total.incl > 0 ? 'ok' : 'neutre'
}

export function abregerEntite(entite: string): string {
  const mots = entite.trim().split(/\s+/)
  return mots.length > 12 ? `${mots.slice(0, 6).join(' ')} […] ${mots.slice(-6).join(' ')}` : entite
}

/** Une collision de pseudo n'est pas une collision d'alias ni une demande de fusion. */
export function collisionsPseudos(regles: RegleAnon[]): Set<string> {
  const usages = new Map<string, Set<string>>()
  for (const regle of regles) {
    for (const pseudo of regle.pseudos) {
      const cle = pseudo.trim().toLocaleLowerCase('fr')
      if (!cle) continue
      const ids = usages.get(cle) ?? new Set<string>()
      ids.add(regle.id)
      usages.set(cle, ids)
    }
  }
  return new Set([...usages.values()].filter((ids) => ids.size > 1).flatMap((ids) => [...ids]))
}

export function presenterReglesAnon(
  regles: RegleAnon[], scan: ScanRegle[],
  options: { recherche: string; filtre: FiltreEtatAnon; tri: TriAnon; descendant: boolean; frais: boolean; categorie?: string },
): LignePresentationAnon[] {
  const scans = new Map(scan.map((s) => [s.regle.id, s]))
  const collisions = collisionsPseudos(regles)
  const q = options.recherche.trim().toLocaleLowerCase('fr')
  const collation = new Intl.Collator('fr', { sensitivity: 'base', numeric: true })
  return regles.map((regle) => ({ regle, scan: scans.get(regle.id) })).filter(({ regle, scan }) => {
    if (options.categorie && regle.categorie !== options.categorie) return false
    if (q && ![...regle.entite, ...regle.pseudos, regle.categorie ?? ''].some((valeur) => valeur.toLocaleLowerCase('fr').includes(q))) return false
    const etat = etatRegleAnon(scan?.total, options.frais)
    switch (options.filtre) {
      case 'a-traiter': return (scan?.total.non ?? 0) > 0
      case 'exceptions': return (scan?.total.exc ?? 0) > 0
      case 'traitees': return etat === 'ok'
      case 'inutilisees': return etat === 'neutre'
      case 'collisions': return collisions.has(regle.id)
      default: return true
    }
  }).sort((a, b) => {
    const valeur = (r: RegleAnon) => options.tri === 'entite' ? r.entite.join(' / ') : r.pseudos.join(' / ')
    const ordre = collation.compare(valeur(a.regle), valeur(b.regle)) || collation.compare(a.regle.entite.join(' / '), b.regle.entite.join(' / ')) || a.regle.id.localeCompare(b.regle.id)
    return options.descendant ? -ordre : ordre
  })
}
