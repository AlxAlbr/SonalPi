import type { CibleRegleAnon, EntretienFichier, RegleAnon } from '../format'
import { aplatir, plageVersPM } from '../entretien/anon/anonymisation'
import { parserAliases } from '../entretien/anon/alias'
import { cleEntite } from '../entretien/anon/brouillonsAnon'
import { estOrpheline } from '../entretien/annotation'
import { classerPlage, empreinteAnon, matchesAliases, textePlage } from '../entretien/anon/classification'

export interface StatutScan {
  anon: number
  exc: number
  non: number
  incl: number
}

export interface ScanRegle {
  regle: RegleAnon
  total: StatutScan
  parEntretien: Record<string, StatutScan>
  variantes?: Record<string, number>
}

export interface EntretienScan {
  id: string
  data: EntretienFichier
}

/** Décision visible, contexte et preuve de fraîcheur d'une occurrence textuelle. */
export interface OccurrenceScan {
  from: number
  to: number
  etat: 'anon' | 'exc' | 'non' | 'incl'
  avant: string
  match: string
  apres: string
  pseudo?: string
  annotationId?: string
  inclusePar?: string
  actionnable?: boolean
  motif?: string
  empreinte?: string
}

/** Le scan détaillé et les compteurs corpus utilisent les mêmes décisions visibles. */
export function scannerRegleDetaille(regle: RegleAnon, entretien: EntretienScan, contexte = 24, avecEmpreinte = true): OccurrenceScan[] {
  const plat = aplatir(entretien.data.corpsTexte)
  const aliases = regle.entite.flatMap(parserAliases)
  const cles = new Set(aliases.map(cleEntite))
  const empreinte = avecEmpreinte ? empreinteAnon(entretien.data, regle) : undefined
  const out: OccurrenceScan[] = []
  for (const match of matchesAliases(plat.texte, aliases)) {
    const pm = plageVersPM(plat, match.from, match.to)
    if (!pm) continue
    const { etat, annotation } = classerPlage(entretien.data.annotations, pm, cles,
      (from, to) => textePlage(plat, from, to))
    const exceptionInterne = etat === 'non' && entretien.data.annotations.some((a) =>
      a.type === 'anon' && !estOrpheline(a) && a.etat === 'exception' && a.from < pm.to && pm.from < a.to)
    const actionnable = etat !== 'incl' && !exceptionInterne && (!annotation || annotation.regle === regle.id)
    out.push({
      ...pm, etat, empreinte, actionnable,
      pseudo: annotation?.pseudo,
      annotationId: annotation?.id,
      inclusePar: etat === 'incl' && annotation ? textePlage(plat, annotation.from, annotation.to) : undefined,
      motif: exceptionInterne ? 'Exception interne protégée : ouvrir l’entretien pour examiner cette occurrence.' :
        !actionnable ? 'Décision indépendante ou incluse : modifier dans l’entretien.' : undefined,
      avant: plat.texte.slice(Math.max(0, match.from - contexte), match.from),
      match: plat.texte.slice(match.from, match.to),
      apres: plat.texte.slice(match.to, match.to + contexte),
    })
  }
  return out
}

/** Agrège les décisions textuelles ; les locuteurs restent indépendants. */
export function scannerCorpus(regles: RegleAnon[], entretiens: EntretienScan[]): ScanRegle[] {
  return regles.map((regle) => {
    const total: StatutScan = { anon: 0, exc: 0, non: 0, incl: 0 }
    const parEntretien: Record<string, StatutScan> = {}
    const variantes: Record<string, number> = Object.create(null)
    for (const entretien of entretiens) {
      const occurrences = scannerRegleDetaille(regle, entretien, 0, false)
      if (!occurrences.length) continue
      const st: StatutScan = { anon: 0, exc: 0, non: 0, incl: 0 }
      for (const occurrence of occurrences) {
        st[occurrence.etat]++
        if (occurrence.etat === 'anon' && occurrence.pseudo) {
          variantes[occurrence.pseudo] = (variantes[occurrence.pseudo] ?? 0) + 1
        }
      }
      parEntretien[entretien.id] = st
      for (const etat of ['anon', 'exc', 'non', 'incl'] as const) total[etat] += st[etat]
    }
    return { regle, total, parEntretien, variantes }
  })
}

export const cleOccurrence = (o: { from: number; to: number }): string => `${o.from}:${o.to}`
export type EtatsOccurrences = Record<string, Record<string, boolean>>

export function etatsDepuisDetails(details: Record<string, OccurrenceScan[]>): {
  cochees: EtatsOccurrences
  exceptions: EtatsOccurrences
} {
  const cochees: EtatsOccurrences = {}
  const exceptions: EtatsOccurrences = {}
  for (const [id, occurrences] of Object.entries(details)) {
    cochees[id] = {}
    exceptions[id] = {}
    for (const o of occurrences) {
      if (o.etat === 'incl' || o.actionnable === false) continue
      const cle = cleOccurrence(o)
      cochees[id][cle] = o.etat === 'anon'
      exceptions[id][cle] = o.etat === 'exc'
    }
  }
  return { cochees, exceptions }
}

export interface DiffPseudonymisation {
  cibles: CibleRegleAnon[]
  poses: number
  retraits: number
  exceptionsAjoutees: number
  exceptionsRetirees: number
}

/** Compare des états finaux, sans demander deux actions incompatibles sur une même plage. */
export function construireDiff(
  regleId: string,
  details: Record<string, OccurrenceScan[]>,
  cochees: EtatsOccurrences,
  exceptions: EtatsOccurrences,
): DiffPseudonymisation {
  const diff: DiffPseudonymisation = { cibles: [], poses: 0, retraits: 0, exceptionsAjoutees: 0, exceptionsRetirees: 0 }
  for (const [entretienId, occurrences] of Object.entries(details)) {
    if (!cochees[entretienId]) continue
    const cible: CibleRegleAnon = {
      entretienId, regleId, plages: [], retirer: [], exception: [], retirerException: [],
      empreinte: occurrences[0]?.empreinte,
    }
    for (const o of occurrences) {
      if (o.etat === 'incl' || o.actionnable === false) continue
      const cle = cleOccurrence(o)
      const final = exceptions[entretienId]?.[cle] ? 'exc' : cochees[entretienId]?.[cle] ? 'anon' : 'non'
      if (final === o.etat) continue
      const plage = { from: o.from, to: o.to }
      if (o.etat === 'exc') { cible.retirerException!.push(plage); diff.exceptionsRetirees++ }
      if (o.etat === 'anon' && final === 'non') { cible.retirer!.push(plage); diff.retraits++ }
      if (final === 'exc') { cible.exception!.push(plage); diff.exceptionsAjoutees++ }
      if (final === 'anon') { cible.plages!.push(plage); diff.poses++ }
    }
    if (cible.plages!.length || cible.retirer!.length || cible.exception!.length || cible.retirerException!.length) diff.cibles.push(cible)
  }
  return diff
}

/** Ajuste provisoirement les compteurs après une application, avant le prochain scan. */
export function ajusterScanApresApplication(scan: ScanRegle[], regleId: string, succes: { id: string; nb: number }[]): ScanRegle[] {
  const posees = new Map<string, number>()
  for (const x of succes) posees.set(x.id, (posees.get(x.id) ?? 0) + Math.max(0, x.nb))
  return scan.map((s) => {
    if (s.regle.id !== regleId) return s
    let deplace = 0
    const parEntretien: Record<string, StatutScan> = {}
    for (const [id, st] of Object.entries(s.parEntretien)) {
      const copie = { ...st }
      const nb = posees.get(id)
      if (nb) {
        const n = Math.min(nb, copie.non)
        copie.non -= n
        copie.anon += n
        deplace += n
      }
      parEntretien[id] = copie
    }
    return { ...s, parEntretien, total: { ...s.total, anon: s.total.anon + deplace, non: s.total.non - deplace } }
  })
}
