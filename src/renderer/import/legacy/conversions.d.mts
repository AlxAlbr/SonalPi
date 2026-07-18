// Déclarations minimales pour les convertisseurs SonalPi réutilisés (sas D1).
// `formatSonal` = un HTML `.sonal` complet (#contenuText + .lblseg), directement
// consommable par importerSonal.

// Parseur SonalPi headless : ré-extrait les blocs JSON d'un `.sonal` (sert de
// juge de paix au round-trip EAV — SUITE S1).
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
