import { charVersPM } from './positions'
import { importerVariables, distribuerValeurs } from './eav'
import { parentsDepuisRangs } from '../../shared/corpus'
import type { Annotation } from '../../shared/entretien/annotation'
import type { Categorie, Locuteur, PayloadEntretien, Variable } from '../../shared/format'

/** Blocs legacy encore en pass-through : `anon` et `notes` (SUITE S1). Les EAV
 *  (var/dic/dat) sont désormais modélisées → hors de ce blob. */
export interface LegacyBlobs {
  tabAnon: unknown
  notes: string
}

export interface ResultatImport {
  payload: PayloadEntretien
  /** Codebook extrait de cat-json → fusionné dans le corpus (sas d'import). */
  codebook: Categorie[]
  /** Variables EAV extraites de var/dic-json → fusionnées dans le corpus. */
  variables: Variable[]
  legacy: LegacyBlobs
}

type AnnBrute =
  | { type: 'codage'; code: string; from: number; to: number }
  | { type: 'anon'; pseudo: string; etat: 'anonymise' | 'exception'; from: number; to: number }

/**
 * Sas d'import (D1) : un HTML `.sonal` (natif, ou produit par un convertisseur
 * SonalPi — SRT/VTT) → charge utile SonalAsynchro (doc ProseMirror + annotations + locuteurs)
 * + codebook + blocs legacy. Aucun Yjs : les offsets caractère du parseur sont
 * convertis en positions ProseMirror (positions.ts).
 */
export function importerSonal(html: string, domDoc: Document): ResultatImport {
  const contenu = domDoc.getElementById('contenuText')
  if (!contenu) throw new Error('.sonal invalide : pas de #contenuText')

  const tabLoc = (extraireJson(html, 'loc-json') as string[] | null) ?? []
  const tabThm = (extraireJson(html, 'cat-json') as CategorieV1[] | null) ?? []
  const legacy: LegacyBlobs = {
    tabAnon: extraireJson(html, 'anon-json'),
    notes: (domDoc.getElementById('txtnotes') as HTMLElement | null)?.innerHTML.trim() ?? '',
  }
  // EAV : var/dic → définitions de variables ; dat → valeurs distribuées (§S1).
  const variables = importerVariables(extraireJson(html, 'var-json'), extraireJson(html, 'dic-json'))

  // 1) Un bloc par segment (.lblseg) : texte concaténé + annotations en offsets locaux.
  const blocs: Array<{ loc: number | null; deb: number | null; fin: number | null; text: string; anns: AnnBrute[] }> = []
  for (const segNode of contenu.querySelectorAll('.lblseg')) {
    const seg = segNode as HTMLElement
    let text = ''
    const anns: AnnBrute[] = []
    for (const fragNode of seg.querySelectorAll('span[data-rk]')) {
      const frag = fragNode as HTMLElement
      const t = frag.textContent ?? ''
      const from = text.length
      const to = from + t.length
      for (const cls of Array.from(frag.classList)) {
        if (/^cat_\d+$/.test(cls)) anns.push({ type: 'codage', code: cls, from, to })
      }
      if (frag.classList.contains('anon-exception')) {
        anns.push({ type: 'anon', pseudo: frag.dataset.pseudo ?? '', etat: 'exception', from, to })
      } else if (frag.classList.contains('anon')) {
        anns.push({ type: 'anon', pseudo: frag.dataset.pseudo ?? '', etat: 'anonymise', from, to })
      }
      text += t
    }
    blocs.push({
      loc: nombreOuNull(seg.dataset.loc),
      deb: nombreOuNull(seg.dataset.deb),
      fin: nombreOuNull(seg.dataset.fin),
      text,
      anns,
    })
  }

  // 2) Doc ProseMirror : un paragraphe (« bloc » D2) par segment.
  const longueurs = blocs.map((b) => b.text.length)
  const corpsTexte = {
    type: 'doc',
    content: blocs.map((b) => ({
      type: 'paragraph',
      attrs: { loc: b.loc, deb: b.deb, fin: b.fin },
      content: b.text ? [{ type: 'text', text: b.text }] : [],
    })),
  }

  // 3) Annotations avec positions ProseMirror (offsets locaux → positions absolues).
  const annotations: Annotation[] = []
  let n = 0
  blocs.forEach((b, k) => {
    for (const a of b.anns) {
      if (a.from >= a.to) continue
      const base = {
        id: `import-${n++}`,
        from: charVersPM(longueurs, k, a.from),
        to: charVersPM(longueurs, k, a.to),
        auteur: 'import',
      }
      annotations.push(
        a.type === 'codage'
          ? { ...base, type: 'codage', code: a.code }
          : { ...base, type: 'anon', pseudo: a.pseudo, etat: a.etat },
      )
    }
  })

  // 4) Locuteurs depuis tabLoc (position dans le tableau = index du locuteur).
  const locuteurs: Locuteur[] = tabLoc
    .map((nom, index) => ({ index, nom, valeursLoc: {}, personneRef: null }))
    .filter((l) => l.index > 0 && l.nom !== '')

  // 4b) Valeurs EAV : `l="all"` → valeursGen ; `l=index` → valeursLoc (posé ici).
  const valeursGen = distribuerValeurs(extraireJson(html, 'dat-json'), locuteurs)

  // 5) Codebook depuis cat-json (v1 → Categorie). La hiérarchie `parent` est
  //    RECONSTRUITE depuis la séquence des `rang`=profondeur (SonalPi, D-S8).
  const parents = parentsDepuisRangs(tabThm.map((t) => ({ id: t.code, rang: Number(t.rang ?? 0) || 0 })))
  const codebook: Categorie[] = tabThm.map((t, i) => ({
    id: t.code,
    nom: t.nom ?? t.code,
    couleur: t.couleur || undefined,
    ordre: i,
    parent: parents[t.code] ?? null,
    actif: t.act !== false,
    codeExport: t.code,
  }))

  return {
    payload: { corpsTexte, annotations, locuteurs, meta: { valeursGen, audioRef: null } },
    codebook,
    variables,
    legacy,
  }
}

interface CategorieV1 {
  code: string
  nom?: string
  couleur?: string
  taille?: string | number
  cmpct?: boolean
  rang?: string
  act?: boolean
}

function nombreOuNull(v: string | undefined): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

/** Extrait et parse un bloc <script id="…-json"> du HTML `.sonal` (port POC1). */
function extraireJson(html: string, id: string): unknown {
  const regex = new RegExp(`<script[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/script>`, 'i')
  const match = html.match(regex)
  if (!match) return null
  try {
    let content = match[1]
      .replace(/\s+/g, ' ')
      .replace(/,\s*,+/g, ',')
      .replace(/^\s*,+\s*/, '')
      .replace(/\s*,+\s*$/, '')
      .replace(/{\s*,+\s*/, '{')
      .replace(/,+\s*}/g, '}')
      .replace(/\[\s*,+\s*/, '[')
      .replace(/,+\s*\]/g, ']')
      .trim()
    if (content.startsWith('{') && content.endsWith('}')) {
      const inner = content.slice(1, -1).trim()
      if (inner.startsWith('[') || inner.startsWith('{')) content = inner
    }
    if (!content || content.length < 2) return null
    return JSON.parse(content)
  } catch {
    return null
  }
}
