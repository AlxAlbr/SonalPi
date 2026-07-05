export function serializeSonal(parts: {
  tabLoc?: unknown
  tabThm?: unknown
  tabVar?: unknown
  tabDic?: unknown
  tabDat?: unknown
  notes?: string
  html?: string
  tabAnon?: unknown
}): string

export function parseSonal(
  html: string,
  doc: Document,
): {
  segments: Array<{
    rksg: string | null
    deb: string | null
    fin: string | null
    loc: string | null
    statut: string | null
    nomloc: string | null
  }>
  locuteurs: Array<{ loc: string | null; nomloc: string | null }>
  codages: Record<string, number>
  anon: Array<{ rk: string | null; pseudo: string | null; nt: string | null; type: string }>
  commentaires: Array<{ rk: string | null; auteur: string | null; obs: string | null; finobs: string | null }>
}

export function cssFromCodebook(tabThm?: unknown[]): string
