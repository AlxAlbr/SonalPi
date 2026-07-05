import { serializeSonal } from './legacy/sonal.mjs'
import { pmVersTranches } from './positions'
import { exporterVariables, exporterValeurs } from './eav'
import { ordreThemes } from '../../shared/corpus'
import { couleurHexPourCode } from '../editor/decorations'
import type { Annotation } from '../../shared/entretien/annotation'
import type { Categorie, Locuteur, Variable } from '../../shared/format'
import type { LegacyBlobs } from './importSonal'

interface BlocPM {
  attrs: { loc: number | null; deb: number | null; fin: number | null }
  content?: Array<{ type: string; text?: string }>
}
interface DocPM {
  content: BlocPM[]
}

export interface EntreeExport {
  corpsTexte: unknown
  annotations: Annotation[]
  locuteurs: Locuteur[]
  codebook: Categorie[]
  /** Définitions de variables du corpus → tabVar/tabDic (SUITE S1). */
  variables: Variable[]
  /** Valeurs de portée entretien → tabDat `l="all"` (les valeurs de portée
   *  locuteur viennent des `valeursLoc` de chaque locuteur). */
  meta: { valeursGen: Record<string, string> }
  legacy: LegacyBlobs
}

/**
 * Recompose un `.sonal` auto-suffisant, ouvrable dans SonalPi (MODELE_OBJET2 §12).
 * Le TEXTE, les CODAGES/ANON et les LOCUTEURS sont reconstruits depuis le modèle ;
 * le codebook depuis le corpus ; les blocs non encore modélisés (var/dic/dat/anon,
 * notes) sont ré-émis depuis le pass-through legacy (round-trip sans perte).
 */
export function exporterSonal(e: EntreeExport): string {
  const doc = e.corpsTexte as DocPM
  const blocs = doc.content.map((p) => ({
    loc: p.attrs.loc,
    deb: p.attrs.deb,
    fin: p.attrs.fin,
    text: (p.content ?? []).map((n) => n.text ?? '').join(''),
  }))
  const longueurs = blocs.map((b) => b.text.length)
  const anns = e.annotations.filter((a) => a.to > a.from)
  const nomDe = (loc: number | null) =>
    loc == null ? null : (e.locuteurs.find((l) => l.index === loc)?.nom ?? null)

  let html = ''
  let rk = 1
  blocs.forEach((b, k) => {
    // Annotations de ce bloc, ramenées en offsets caractère locaux.
    const local = anns
      .map((a) => {
        const tr = pmVersTranches(longueurs, a.from, a.to).find((t) => t.bloc === k)
        return tr ? { from: tr.debut, to: tr.fin, ann: a } : null
      })
      .filter((x): x is { from: number; to: number; ann: Annotation } => x !== null)

    // Frontières de fragments = bornes du bloc ∪ bornes d'annotations.
    const bornes = new Set<number>([0, b.text.length])
    for (const l of local) {
      if (l.from > 0 && l.from < b.text.length) bornes.add(l.from)
      if (l.to > 0 && l.to < b.text.length) bornes.add(l.to)
    }
    const tri = [...bornes].sort((x, y) => x - y)

    const nomloc = nomDe(b.loc)
    let segAttrs =
      `class="lblseg sautlig" data-deb="${b.deb ?? ''}" data-fin="${b.fin ?? ''}"` +
      ` data-loc="${b.loc ?? ''}" tabindex="${rk}" data-rksg="${k}"`
    if (nomloc) segAttrs += ` data-nomloc="${escapeAttr(nomloc)}"`
    let seg = `<span ${segAttrs}>`

    for (let i = 0; i < tri.length - 1; i++) {
      const fs = tri[i]
      const fe = tri[i + 1]
      if (fs >= fe) continue
      const fragText = b.text.slice(fs, fe)
      const couvrant = local.filter((l) => l.from <= fs && l.to >= fe)

      let classes = ''
      const extra: string[] = []
      for (const { ann } of couvrant) {
        if (ann.type === 'codage' && ann.code) classes += ` ${ann.code}`
        else if (ann.type === 'anon') {
          classes += ann.etat === 'exception' ? ' anon-exception' : ' anon'
          if (ann.pseudo) extra.push(`data-pseudo="${escapeAttr(ann.pseudo)}"`)
          extra.push('data-anon-nt="true"')
        }
      }
      const elements = fragText.match(/[\wÀ-ÿ]+|[^\w\s]|[\s]+/g) ?? []
      const attrs = [
        `class="${classes.trim()}"`,
        `data-rk="${rk}"`,
        `data-sg="${k}"`,
        `data-len="${elements.length}"`,
        ...extra,
      ].join(' ')
      seg += `<span ${attrs}>${escapeHtml(fragText)}</span>`
      rk += elements.length
    }
    seg += '</span>'
    html += seg
  })

  // tabLoc : tableau indexé par index de locuteur (position 0 = vide).
  const maxIdx = e.locuteurs.reduce((m, l) => Math.max(m, l.index), 0)
  const tabLoc = Array.from(
    { length: maxIdx + 1 },
    (_, i) => e.locuteurs.find((l) => l.index === i)?.nom ?? '',
  )

  // tabThm : codebook → forme v1, en PRÉ-ORDRE avec `rang`=profondeur (D-S8) →
  // chaque sous-thème suit son parent, la hiérarchie se relit sans perte à l'import.
  const parId = Object.fromEntries(e.codebook.map((c) => [c.id, c]))
  const tabThm = ordreThemes(parId).map(({ cat, profondeur }) => ({
    code: cat.codeExport,
    // Couleur stockée si présente, sinon synthétisée (même teinte qu'affichée) →
    // le codage reste VISIBLE dans SonalPi (le CSS .cat_XXX a besoin d'un HEX).
    couleur: cat.couleur || couleurHexPourCode(cat.codeExport),
    nom: cat.nom,
    taille: '',
    cmpct: false,
    rang: String(profondeur),
    act: cat.actif,
  }))

  // EAV : variables modélisées → tabVar/tabDic ; valeurs (entretien + locuteurs)
  // → tabDat (la sentinelle `l="all"` est réintroduite ici, jamais dans le modèle).
  const { tabVar, tabDic } = exporterVariables(e.variables)
  const tabDat = exporterValeurs(e.meta.valeursGen, e.locuteurs, e.variables)

  return serializeSonal({
    tabLoc,
    tabThm,
    tabVar,
    tabDic,
    tabDat,
    tabAnon: e.legacy.tabAnon,
    notes: e.legacy.notes,
    html,
  })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}
