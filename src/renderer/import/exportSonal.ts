import { serializeSonal } from './legacy/sonal.mjs'
import { pmVersTranches, debutBloc } from '../../shared/entretien/positions'
import type { Ancre } from '../../shared/entretien/audio'
import { exporterVariables, exporterValeurs } from './eav'
import { ordreThemes } from '../../shared/corpus'
import { couleurHexPourCode } from '../editor/decorations'
import type { Annotation } from '../../shared/entretien/annotation'
import type { Categorie, Locuteur, Variable, RegleAnon, BrouillonAnon } from '../../shared/format'
import { scinderPseudos } from '../../shared/entretien/anon'
import type { LegacyBlobs } from './importSonal'

interface BlocPM {
  attrs: { loc: number | null }
  content?: Array<{ type: string; text?: string }>
}
interface DocPM {
  content: BlocPM[]
}

/** Une règle d'anonymisation à la forme SonalPi (`remplacement`/`remplacementAlt`). */
function formeSonalPi(entite: string, pseudos: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { entite, remplacement: pseudos[0] ?? '' }
  if (pseudos[1]) out.remplacementAlt = pseudos[1]
  return out
}

/** Reconstruit l'`anon-json` (tabAnon SonalPi) depuis le MODÈLE,
 *  pour un round-trip sans perte (retrait du pass-through legacy) : les RÈGLES
 *  CORPUS appliquées dans cet entretien (occurrences `regle`) → entrées
 *  `portee:'corpus'` ; les BROUILLONS → entrées `portee:'brouillon'`,
 *  `occurrences:0`. Les occurrences standalone restent en spans (`data-pseudo`),
 *  pas d'entrée document nécessaire au round-trip interne (elles se relisent
 *  des spans). */
function construireTabAnon(e: EntreeExport): unknown[] {
  const tab: unknown[] = []
  const vus = new Set<string>()
  if (e.reglesAnon) {
    for (const a of e.annotations) {
      if (!a.regle || vus.has(a.regle)) continue
      const r = e.reglesAnon.find((x) => x.id === a.regle)
      if (!r) continue
      vus.add(a.regle)
      tab.push({ ...formeSonalPi(r.entite[0] ?? '', r.pseudos), portee: 'corpus' })
    }
  }
  for (const b of e.brouillonsAnon ?? []) {
    const pseudos = scinderPseudos(b.pseudo ?? '')
    tab.push({ ...formeSonalPi(b.entite, pseudos), portee: 'brouillon', occurrences: 0 })
  }
  return tab
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
  /** Valeurs de portée entretien → tabDat `l="all"` (les valeurs de portée locuteur viennent des `valeursLoc` de chaque locuteur). */
  meta: { valeursGen: Record<string, string> }
  legacy: LegacyBlobs
  /** Règles corpus partagées (corpus.json.reglesAnon).
   *  Les règles appliquées dans CET entretien ressortent en entries
   *  `portee:'corpus'` de l'`anon-json`. */
  reglesAnon?: RegleAnon[]
  /** Brouillons d'anonymisation de CET entretien → entries `portee:'brouillon'`. */
  brouillonsAnon?: BrouillonAnon[]
}

/**
 *  Recompose un `.sonal` auto-suffisant, ouvrable dans SonalPi.
 *  Le TEXTE, les CODAGES/ANON et les LOCUTEURS sont reconstruits depuis le modèle ;
 *  le codebook depuis le corpus ; les blocs non modélisés (règles d'anon, notes)
 *  sont ré-émis depuis le pass-through legacy (round-trip sans perte).
 */
export function exporterSonal(e: EntreeExport): string {
  const doc = e.corpsTexte as DocPM
  const blocs = doc.content.map((p) => ({
    loc: p.attrs.loc,
    text: (p.content ?? []).map((n) => n.text ?? '').join(''),
  }))
  const longueurs = blocs.map((b) => b.text.length)

  // Un .lblseg par INTERVALLE D'ANCRES : un tour fusionné ressort re-découpé en cues avec leurs data-deb/data-fin —
  // SonalPi garde sa granularité, et le round-trip re-fusionne à l'import (stable, sans perte).
  // À une même pos peuvent vivre la FIN d'un cue et le DEB du suivant (trou) :
  // la première ancre (t min) ferme le segment de gauche, la dernière ouvre celui de droite.
  // Sans ancre interne, le bloc = un seul segment (bornes de scission vides).
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
  // Commentaires : le fragment D'OUVERTURE porte data-obs/data-auth ;
  // le fragment FINAL porte data-finobs (= son propre data-rk),
  // lisible à la fois comme référence de rk et comme marqueur de fin.
  // Clés « bloc:offset » locales.
  const obsDebut = new Map<string, Annotation>()
  const finsObs = new Set<string>()
  for (const a of anns) {
    if (a.type !== 'commentaire') continue
    const trs = pmVersTranches(longueurs, a.from, a.to)
    if (trs.length === 0) continue
    const t0 = trs[0]
    const tn = trs[trs.length - 1]
    obsDebut.set(`${t0.bloc}:${t0.debut}`, a) // la première gagne
    finsObs.add(`${tn.bloc}:${tn.fin}`) // la dernière gagne
  }
  const nomDe = (loc: number | null) =>
    loc == null ? null : (e.locuteurs.find((l) => l.index === loc)?.nom ?? null)

  let html = ''
  let rk = 1
  let sg = 0
  // Tour de parole DÉRIVÉ (run de blocs consécutifs de même loc) :
  // le libellé du tour n'est posé que sur le 1er bloc du run (cf. ligloc ci-dessous).
  let locPrecedent: number | null | undefined = undefined
  blocs.forEach((b, k) => {
    const premierDuTour = b.loc !== locPrecedent
    locPrecedent = b.loc
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
    // Libellé du tour : sur le 1er SEGMENT du 1er BLOC du run (parité SonalPi `.ligloc` « deb »).
    // data-nomloc = le VRAI nom ; libellé pseudonymisé (pseudo posé, non refusé)
    // → classe `loc-anon` + `data-locpseudo` ; refus explicite → `loc-suggere-refuse`.
    // La couleur est INTERNE à l'app (aucun marqueur).
    // `data-nomloc-barre` est un artefact de RENDU SonalPi, re-dérivé à l'ouverture ;
    // on ne l'émet pas (le vrai nom ne doit pas fuiter, et SonalPi le recompose).
    const lLoc = e.locuteurs.find((x) => x.index === b.loc)
    let ligloc = ''
    let extraSeg = ''
    if (premierDuTour && b.loc != null && nomloc) {
      if (lLoc?.pseudo && lLoc.pseudoEtat !== 'refuse') {
        ligloc = ' ligloc loc-anon'
        extraSeg = ` data-locpseudo="${escapeAttr(lLoc.pseudo)}"`
      } else if (lLoc?.pseudoEtat === 'refuse') {
        ligloc = ' ligloc loc-suggere-refuse'
      } else {
        ligloc = ' ligloc'
      }
    }

    for (let s = 0; s < jalons.length - 1; s++) {
      const sd = jalons[s]
      const sf = jalons[s + 1]
      if (sd >= sf && b.text.length > 0) continue // (bloc vide : émettre quand même son segment)

      let segAttrs =
        `class="lblseg sautlig${ligloc}" data-deb="${debParPos.get(debutPM + sd) ?? ''}"` +
        ` data-fin="${finParPos.get(debutPM + sf) ?? ''}"` +
        ` data-loc="${b.loc ?? ''}" tabindex="${rk}" data-rksg="${sg}"` +
        extraSeg
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
            // Le pseudo n'est JAMAIS sérialisé sur une exception.
            // Il n'est qu'une mémoire de modèle, jamais affichée ni exportée,
            // et le [pseudo] du span ne concerne que les occurrences anonymisées.
            if (ann.pseudo && ann.etat !== 'exception') extra.push(`data-pseudo="${escapeAttr(ann.pseudo)}"`)
            extra.push('data-anon-nt="true"')
          }
        }
        // Commentaires portés par ce fragment : ouverture (il commence la plage)
        // et/ou fin (il la termine — data-finobs = SON rk courant).
        const obs = obsDebut.get(`${k}:${fs}`)
        if (obs) {
          extra.push(`data-obs="${escapeAttr(obs.texte ?? '')}"`)
          extra.push(`data-auth="${escapeAttr(obs.auteur)}"`)
        }
        if (finsObs.has(`${k}:${fe}`)) extra.push(`data-finobs="${rk}"`)
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
    tabAnon: construireTabAnon(e),
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
