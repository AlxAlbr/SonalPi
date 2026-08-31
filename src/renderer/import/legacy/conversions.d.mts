// Déclarations minimales pour les convertisseurs SonalPi1 réutilisés (sas d'import :
// tout format étranger passe par `.sonal`).
// `formatSonal` = un HTML `.sonal` complet (#contenuText + .lblseg), directement
// consommable par importerSonal.

// Parseur SonalPi1 headless : ré-extrait les blocs JSON d'un `.sonal` (sert de
// juge de paix du round-trip EAV dans les tests).
export function extractFichierSonal(
  htmlString: string,
  doc: Document,
): {
  tabLoc: unknown
  tabThm: unknown
  tabVar: unknown
  tabDic: unknown
  tabDat: unknown
  tabAnon: unknown
  notes: string
  html: string
}

export function convertSRT(content: string): { formatSonal: string; locuteurs: string[] } | undefined
export function convertVTT(content: string): { formatSonal: string; locut: string[] } | undefined
export function convertTXT(content: string, ext?: string): { formatSonal: string; locuteurs: string[] } | undefined
export function tabSegToSonal(tabSeg: unknown[], locut?: unknown, notes?: string): string
export function TimeToSec(hms: string): number
