import type { ItemRecueil } from './recueils'

/** Styles de numérotation des titres, dérivés de l'ordre à la lecture, jamais stockés. */
export type StyleNumerotation = 'aucune' | 'decimal' | 'plan'

type ItemAvecNiveau = Extract<ItemRecueil, { type: 'titre' }>

const ROMAINS = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
  [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
] as const

function romain(n: number): string {
  let reste = n
  let resultat = ''
  for (const [valeur, symbole] of ROMAINS) {
    while (reste >= valeur) {
      resultat += symbole
      reste -= valeur
    }
  }
  return resultat
}

function lettres(n: number, minuscule: boolean): string {
  // 1 → A (ou a), 26 → Z, 27 → AA.
  let reste = n
  let resultat = ''
  while (reste > 0) {
    reste -= 1
    resultat = String.fromCharCode(65 + (reste % 26)) + resultat
    reste = Math.floor(reste / 26)
  }
  return minuscule ? resultat.toLowerCase() : resultat
}

function libeller(niveau: number, compteur: number, style: Exclude<StyleNumerotation, 'aucune'>): string {
  if (style === 'decimal') return String(compteur)
  if (niveau === 1) return `${romain(compteur)}.`
  if (niveau === 2) return `${lettres(compteur, false)}.`
  if (niveau === 3) return `${compteur}.`
  return `${lettres(compteur, true)}.`
}

/** Numéro de chaque titre ; un titre de rang n commence par comptabiliser ses ancêtres jamais déclarés. */
export function numeroterTitres(
  items: ItemRecueil[],
  style: StyleNumerotation,
): Record<string, string> {
  const numeros: Record<string, string> = {}
  if (style === 'aucune') return numeros
  const compteurs = [0, 0, 0, 0]
  for (const item of items) {
    if (item.type !== 'titre') continue
    for (let rang = 0; rang < item.niveau - 1; rang += 1) {
      if (compteurs[rang] === 0) compteurs[rang] = 1
    }
    compteurs[item.niveau - 1] += 1
    for (let rang = item.niveau; rang < compteurs.length; rang += 1) compteurs[rang] = 0
    const parties: string[] = []
    for (let rang = 0; rang < item.niveau; rang += 1) {
      parties.push(libeller(rang + 1, compteurs[rang], style))
    }
    numeros[item.id] = parties.join(style === 'decimal' ? '.' : '')
  }
  return numeros
}

/** Profondeur de retrait des titres ; le contenu reste aligné sur la marge, sans décalage par niveau. */
export function profondeursItems(items: ItemRecueil[]): Record<string, number> {
  const profondeurs: Record<string, number> = {}
  for (const item of items) {
    profondeurs[item.id] = item.type === 'titre' ? item.niveau - 1 : 0
  }
  return profondeurs
}
