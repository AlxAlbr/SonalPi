import { serializeSonal } from './legacy/sonal.mjs'
import { pmVersTranches, debutBloc } from '../../shared/entretien/positions'
import type { Ancre } from '../../shared/entretien/audio'
import { exporterVariables, exporterValeurs } from './eav'
import { ordreThemes } from '../../shared/corpus'
import { couleurHexPourCode } from '../editor/decorations'
import type { Annotation } from '../../shared/entretien/annotation'
import type { Categorie, Locuteur, Variable } from '../../shared/format'
import type { LegacyBlobs } from './importSonal'

interface BlocPM {
  attrs: { loc: number | null }
  content?: Array<{ type: string; text?: string }>
}
interface DocPM {
  content: BlocPM[]
}

export interface EntreeExport {
  corpsTexte: unknown
  annotations: Annotation[]
  /** Ancres temporelles → re-dérivées en data-deb/data-fin par segment. */
  ancres: Ancre[]
  locuteurs: Locuteur[]
  codebook: Categorie[]
  /** Définitions de variables du corpus → tabVar/tabDic. */
  variables: Variable[]
  /** Valeurs de portée entretien → tabDat `l="all"` (les valeurs de portée
   *  locuteur viennent des `valeursLoc` de chaque locuteur). */
  meta: { valeursGen: Record<string, string> }
  legacy: LegacyBlobs
}

/**
 * Recompose un `.sonal` auto-suffisant, ouvrable dans SonalPi.
 * Le TEXTE, les CODAGES/ANON et les LOCUTEURS sont reconstruits depuis le modèle ;
 * le codebook depuis le corpus ; les blocs non modélisés (règles d'anon, notes)
 * sont ré-émis depuis le pass-through legacy (round-trip sans perte).
 */
export function exporterSonal(e: EntreeExport): string {
  const doc = e.corpsTexte as DocPM
  const blocs = doc.content.map((p) => ({
    loc: p.attrs.loc,
    text: (p.content ?? []).map((n) => n.text ?? '').join(''),
  }))
  const longueurs = blocs.map((b) => b.text.length)

  // Un .lblseg par INTERVALLE D'ANCRES : un tour fusionné ressort
  // re-découpé en cues avec leurs data-deb/data-fin — SonalPi garde sa
  // granularité, et le round-trip re-fusionne à l'import (stable, sans perte).
  // À une même pos peuvent vivre la FIN d'un cue et le DEB du suivant (trou) :
  // la première ancre (t min) ferme le segment de gauche, la dernière ouvre
  // celui de droite. Sans ancre interne, le bloc = un seul segment (bornes de
  // scission vides).
  const debParPos = new Map<number, number>()
  const finParPos = new Map<number, number>()
  for (const a of e.ancres) {
    debParPos.set(a.pos, a.t) // la dernière à cette pos gagne
    if (!finParPos.has(a.pos)) finParPos.set(a.pos, a.t) // la première gagne
  }
  const debuts: number[] = []
  for (let k = 0, p = debutBloc(longueurs, 0); k < longueurs.length; p += 2 + longueurs[k], k++)
    debuts.push(p)
  const anns = e.annotations.filter((a) => a.to > a.from)
  const nomDe = (loc: number | null) =>
    loc == null ? null : (e.locuteurs.find((l) => l.index === loc)?.nom ?? null)

  let html = ''
  let rk = 1
  let sg = 0
  blocs.forEach((b, k) => {
    // Annotations de ce bloc, ramenées en offsets caractère locaux.
    const local = anns
      .map((a) => {
        const tr = pmVersTranches(longueurs, a.from, a.to).find((t) => t.bloc === k)
        return tr ? { from: tr.debut, to: tr.fin, ann: a } : null
      })
      .filter((x): x is { from: number; to: number; ann: Annotation } => x !== null)

    // Coupes de segments = ancres INTERNES au texte du bloc (offsets locaux).
    const debutPM = debuts[k]
    const coupes = [
      ...new Set(
        e.ancres
          .filter((a) => a.pos > debutPM && a.pos < debutPM + b.text.length)
          .map((a) => a.pos - debutPM),
      ),
    ].sort((x, y) => x - y)
    const jalons = [0, ...coupes, b.text.length]
    const nomloc = nomDe(b.loc)

    for (let s = 0; s < jalons.length - 1; s++) {
      const sd = jalons[s]
      const sf = jalons[s + 1]
      if (sd >= sf && b.text.length > 0) continue // (bloc vide : émettre quand même son segment)

      let segAttrs =
        `class="lblseg sautlig" data-deb="${debParPos.get(debutPM + sd) ?? ''}"` +
        ` data-fin="${finParPos.get(debutPM + sf) ?? ''}"` +
        ` data-loc="${b.loc ?? ''}" tabindex="${rk}" data-rksg="${sg}"`
      if (nomloc) segAttrs += ` data-nomloc="${escapeAttr(nomloc)}"`
      let seg = `<span ${segAttrs}>`

      // Frontières de fragments = bornes du segment ∪ bornes d'annotations.
      const bornes = new Set<number>([sd, sf])
      for (const l of local) {
        if (l.from > sd && l.from < sf) bornes.add(l.from)
        if (l.to > sd && l.to < sf) bornes.add(l.to)
      }
      const tri = [...bornes].sort((x, y) => x - y)

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
          `data-sg="${sg}"`,
          `data-len="${elements.length}"`,
          ...extra,
        ].join(' ')
        seg += `<span ${attrs}>${escapeHtml(fragText)}</span>`
        rk += elements.length
      }
      seg += '</span>'
      html += seg
      sg++
    }
  })

  // tabLoc : tableau indexé par index de locuteur (position 0 = vide). Le « ? »
  // de l'interviewer (convention SonalPi) est réintroduit ICI — jamais au modèle.
  const maxIdx = e.locuteurs.reduce((m, l) => Math.max(m, l.index), 0)
  const tabLoc = Array.from({ length: maxIdx + 1 }, (_, i) => {
    const l = e.locuteurs.find((x) => x.index === i)
    return l ? l.nom + (l.interviewer ? '?' : '') : ''
  })

  // tabThm : codebook → forme SonalPi, en PRÉ-ORDRE avec `rang`=profondeur →
  // chaque sous-thème suit son parent, la hiérarchie se relit sans perte à l'import.
  const parId = Object.fromEntries(e.codebook.map((c) => [c.id, c]))
  const tabThm = ordreThemes(parId).map(({ cat, profondeur }) => ({
    code: cat.codeExport,
    // Couleur stockée si présente, sinon synthétisée (même teinte qu'affichée) →
    // le codage reste VISIBLE dans SonalPi (le CSS .cat_XXX a besoin d'un HEX).
    couleur: cat.couleur || couleurHexPourCode(cat.codeExport),
    nom: cat.nom,
    taille: cat.taille ?? '',
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
