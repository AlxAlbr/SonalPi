import type { ParticipationLocuteur } from '../locuteurs'
import { objet } from '../natif/validationCommune'
import { participationParId } from '../entretien/participations'

export type CibleValeur = { type: 'entretien' } | { type: 'participation'; participationId: string }

export interface ItemLotValeur {
  entretienId: string
  cible: CibleValeur
  idVar: string
  /** Une chaîne vide efface la valeur chez son propriétaire. */
  idMod: string
}

/** Un lot invalide est refusé avant l'ouverture des fichiers ou des transactions. */
export function validerLotValeur(items: unknown): asserts items is ItemLotValeur[] {
  if (!Array.isArray(items)) throw new Error('La liste des valeurs à modifier est invalide.')
  for (const item of items) {
    if (!objet(item) || Object.keys(item).length !== 4
      || !Object.hasOwn(item, 'entretienId') || typeof item.entretienId !== 'string' || !item.entretienId.trim()
      || /[/\\\u0000]/.test(item.entretienId) || item.entretienId === '.' || item.entretienId === '..'
      || !Object.hasOwn(item, 'idVar') || typeof item.idVar !== 'string' || !item.idVar.trim()
      || !Object.hasOwn(item, 'idMod') || typeof item.idMod !== 'string' || !Object.hasOwn(item, 'cible')) {
      throw new Error('Une valeur demandée est invalide.')
    }
    validerCibleValeur(item.cible)
  }
}

interface EntretienValeurs {
  meta: { valeursGen: Record<string, string> }
  participations: readonly Pick<ParticipationLocuteur, 'valeursLoc'>[]
}

export function validerCibleValeur(cible: unknown): asserts cible is CibleValeur {
  if (!objet(cible) || !Object.hasOwn(cible, 'type') || (cible.type !== 'entretien' && cible.type !== 'participation')
    || (cible.type === 'entretien' && Object.keys(cible).length !== 1)
    || (cible.type === 'participation' && (Object.keys(cible).length !== 2 || !Object.hasOwn(cible, 'participationId')
      || typeof cible.participationId !== 'string' || !cible.participationId.trim()))) {
    throw new Error('La destination de cette valeur est invalide.')
  }
}

function valeurDe(valeurs: Record<string, string> | undefined, id: string): string | undefined {
  return valeurs && Object.hasOwn(valeurs, id) ? valeurs[id] : undefined
}

const valeurVisee = (valeur: string | undefined, idMod?: string) => valeur != null && (idMod === undefined || valeur === idMod)

export function compterValeursVariable(entretien: EntretienValeurs, idVar: string, idMod?: string): number {
  let n = valeurVisee(valeurDe(entretien.meta?.valeursGen, idVar), idMod) ? 1 : 0
  for (const p of entretien.participations) if (valeurVisee(valeurDe(p.valeursLoc, idVar), idMod)) n++
  return n
}

export function compterUsagesVariable(entretiens: readonly EntretienValeurs[], idVar: string): number {
  return entretiens.reduce((total, e) => total + compterValeursVariable(e, idVar), 0)
}

export function compterUsagesModalite(entretiens: readonly EntretienValeurs[], idVar: string, idMod: string): number {
  return entretiens.reduce((total, e) => total + compterValeursVariable(e, idVar, idMod), 0)
}

/** L'effacement ne touche que les valeurs demandées, pas les participations ni leurs identités. */
export function effacerValeursVariable(entretien: EntretienValeurs, idVar: string, idMod?: string): number {
  let n = 0
  if (valeurVisee(valeurDe(entretien.meta?.valeursGen, idVar), idMod)) { delete entretien.meta.valeursGen[idVar]; n++ }
  for (const p of entretien.participations) {
    if (valeurVisee(valeurDe(p.valeursLoc, idVar), idMod)) { delete p.valeursLoc[idVar]; n++ }
  }
  return n
}

/** Le propriétaire est déjà résolu ; aucune donnée ne remonte dans l'identité corpus. */
export function poserValeurProprietaire(valeurs: Record<string, string>, idVar: string, idMod: string): void {
  if (typeof idVar !== 'string' || !idVar.trim() || typeof idMod !== 'string') throw new Error('La valeur demandée est invalide.')
  if (idMod) Object.defineProperty(valeurs, idVar, { value: idMod, enumerable: true, configurable: true, writable: true })
  else delete valeurs[idVar]
}

/** Les ids manquants ne sont pas complétés par la résolution d'une destination. */
export function valeursCible(
  data: { meta: EntretienValeurs['meta']; participations: readonly (Pick<ParticipationLocuteur, 'valeursLoc'> & { id?: string })[] },
  cible: CibleValeur,
): Record<string, string> | undefined {
  validerCibleValeur(cible)
  return cible.type === 'entretien' ? data.meta.valeursGen : participationParId(data.participations, cible.participationId)?.valeursLoc
}

/** L'id stable désigne la participation ; l'index des paragraphes n'est jamais utilisé ici. */
export function poserValeur(
  data: Parameters<typeof valeursCible>[0], cible: CibleValeur, idVar: string, idMod: string,
): boolean {
  const valeurs = valeursCible(data, cible)
  if (!valeurs) return false
  poserValeurProprietaire(valeurs, idVar, idMod)
  return true
}
