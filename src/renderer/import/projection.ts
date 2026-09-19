import { debutBloc } from '../../shared/entretien/positions'
import type { Annotation } from '../../shared/entretien/annotation'
import type { Ancre } from '../../shared/entretien/audio'
import type { EntreeExport } from './exportSonal'

// ----------------------------------------------------------------
// PROJECTION DES SEGMENTS — modèle JSON → segments typés
// ----------------------------------------------------------------
// Source de vérité UNIQUE du découpage en segments : ancres temporelles,
// tours de parole, fragments de codage/anonymisation, commentaires.
// Les consommateurs sont de deux familles :
//  - la sérialisation `.sonal` (exportSonal.ts), fidèle au format SonalPi1 ;
//  - les formats autonomes (txt, srt, vtt, docx, html) via exportFormats.ts.
// Aucun accès DOM : tout part du modèle, tout est testable unitairement.

interface BlocPM {
  attrs: { loc: number | null }
  content?: Array<{ type: string; text?: string }>
}
interface DocPM {
  content: BlocPM[]
}

/** Une occurrence d'anonymisation portée par un fragment. */
export interface AnonFragment {
  etat: 'anonymise' | 'exception'
  /** Pseudo mémoire de modèle ; jamais émis pour une exception. */
  pseudo: string | null
}

/** Fragment de texte : plage entre deux bornes (segment ∪ annotations),
 *  portant ses catégories codantes, son anonymisation éventuelle,
 *  l'ouverture/fermeture d'un commentaire et ses sauts de ligne. */
export interface FragmentProjete {
  texte: string
  /** Codes `cat_*` des codages couvrant le fragment (ordre d'émission). */
  codes: string[]
  anon: AnonFragment | null
  /** Commentaire qui OUvre sur ce fragment (data-obs/data-auth). */
  obs: { texte: string; auteur: string } | null
  /** rk du fragment final d'un commentaire (data-finobs) ; null sinon. */
  finObs: number | null
  /** rk courant (data-rk, tabindex de fin de commentaire). */
  rk: number
  /** Nombre d'éléments lexicalisés du texte (data-len, compteur rk). */
  nbMots: number
  /** Offsets (dans `texte`) des SAUTS DE LIGNE du modèle (nœuds hardBreak,
   *  Shift+Entrée) : le retour à la ligne s'insère entre texte[s-1] et texte[s].
 *  Le `.sonal` ne les transporte pas (format SonalPi1 gelé) ; les formats
 *  texte (txt, docx, html) les rendent. */
  sauts: number[]
}

/** Libellé de tour de parole posé sur les segments du 1er bloc du run
 *  (cf. classe `ligloc` SonalPi1). */
export type LibelleTour =
  | { type: 'simple' }
  | { type: 'pseudo'; pseudo: string }
  | { type: 'refuse' }

/** Un segment `.lblseg` : bornes temporelles (dérivées des ancres),
 *  locuteur, libellé de tour et fragments. */
export interface SegmentProjete {
  /** Index du bloc (paragraphe ProseMirror) porteur. La mise en page texte
   *  (retours à la ligne) raisonne au niveau du BLOC, pas du segment : un
   *  tour nouveau = ligne vide, un bloc du même tour = simple retour, les
   *  cues internes coulent. */
  bloc: number
  /** Temps (s) de la 1re ancre à la borne de début ; null si pas d'ancre. */
  deb: number | null
  /** Temps (s) de la dernière ancre à la borne de fin ; null si pas d'ancre. */
  fin: number | null
  loc: number | null
  /** Vrai nom du locuteur du bloc (data-nomloc) ; null si inconnu. */
  nomloc: string | null
  /** Libellé de tour porté par ce segment (1er bloc du run). */
  libelle: LibelleTour | null
  /** rk au début du segment (tabindex). */
  rk: number
  /** Index de séquence (data-rksg). */
  rksg: number
  fragments: FragmentProjete[]
}

/** Projette le modèle en segments typés : un segment par intervalle d'ancres,
 *  un fragment par intervalle borné par les annotations. Porte fidèlement le
 *  compteur rk (mot par mot), les marqueurs de commentaires du `.sonal` et
 *  les sauts de ligne du modèle (hardBreak → offset plat). */
export function projeterSegments(e: EntreeExport): SegmentProjete[] {
  const doc = e.corpsTexte as DocPM
  // Un « bloc » = un paragraphe ProseMirror : texte plat (concat des nœuds
  // text) + les SAUTS DE LIGNE internes (nœuds hardBreak, Shift+Entrée).
  // Un hardBreak pèse 1 position PM sans caractère : le POIDS du bloc — qui
  // sert au mapping des positions — vaut texte + sauts, pas le texte seul.
  const blocs = doc.content.map((p) => {
    let texte = ''
    const sauts: number[] = [] // offset plat du saut (le \n s'insère avant texte[o])
    const relSauts: number[] = [] // position PM relative du hardBreak
    let relPM = 0
    for (const n of p.content ?? []) {
      if (n.type === 'hardBreak') {
        sauts.push(texte.length)
        relSauts.push(relPM)
        relPM += 1
      } else {
        const t = n.text ?? ''
        texte += t
        relPM += t.length
      }
    }
    return { loc: p.attrs.loc, texte, sauts, relSauts, poids: relPM }
  })

  /** Indexation des LOCUTEURS : un Map préparé une fois (premier homonyme
   *  gagnant, comme le find() qu'il remplace), pas un find() par segment. */
  const locuteurDe = new Map<number, (typeof e.locuteurs)[number]>()
  for (const l of e.locuteurs) {
    if (!locuteurDe.has(l.index)) locuteurDe.set(l.index, l)
  }

  /** Offset plat d'une position PM relative au bloc : les sauts ne pèsent
   *  aucun caractère, on les soustrait. Ex. relPM 7 avec un saut à 6 → plat 6.
   *  Dichotomie : les relSauts sont triés (ordre d'émission). */
  function platDe(b: (typeof blocs)[number], relPM: number): number {
    let lo = 0
    let hi = b.relSauts.length
    while (lo < hi) {
      const m = (lo + hi) >> 1
      if (b.relSauts[m] < relPM) lo = m + 1
      else hi = m
    }
    return relPM - lo
  }

  // Un segment par INTERVALLE D'ANCRES : un tour fusionné ressort re-découpé en
  // cues avec leurs data-deb/data-fin — SonalPi1 garde sa granularité, et le
  // round-trip re-fusionne à l'import (stable, sans perte).
  // À une même pos peuvent vivre la FIN d'un cue et le DEB du suivant (trou) :
  // la première ancre (t min) ferme le segment de gauche, la dernière ouvre
  // celui de droite. Sans ancre interne, le bloc = un seul segment.
  // Bornes de contenu d'un bloc en PM relatif : [0, poids] (0 = 1er caractère,
  // poids = fin du dernier) — les ancres y sont projetées en offset plat.
  const p0: number[] = []
  for (let k = 0, pos = debutBloc(blocs.map((b) => b.poids), 0); k < blocs.length; pos += 2 + blocs[k].poids, k++)
    p0.push(pos)
  /** Localise une position PM : le bloc la portant (premier tel que
   *  p0[k] ≤ pos ≤ p0[k] + poids), ou -1. Dichotomie sur p0 (strictement
   *  croissant, chaque bloc coûte ≥ 2) : équivaut au findIndex d'origine,
   *  qui balayait TOUS les blocs pour chaque ancre. */
  function blocDe(pos: number): number {
    let lo = 0
    let hi = p0.length - 1
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1
      if (p0[m] <= pos) lo = m
      else hi = m - 1
    }
    return lo >= 0 && p0[lo] <= pos && pos - p0[lo] <= blocs[lo].poids ? lo : -1
  }

  /** Tranches par bloc d'une plage PM, en offsets PLATS (sauts exclus).
   *  Variante de pmVersTranches dont le poids des blocs compte les hardBreaks.
   *  Dichotomie aux bornes : seuls les blocs intersectant [from, to[ sont
   *  parcourus (le balayage global rendait la projection quadratique). */
  function tranchesPlates(from: number, to: number): Array<{ bloc: number; debut: number; fin: number }> {
    const out: Array<{ bloc: number; debut: number; fin: number }> = []
    // Premier bloc dont la fin dépasse from (fin[k] = p0[k] + poids) ; dernier
    // dont le début précède to. Les blocs hors de ces bornes ne peuvent pas
    // intersecter la plage.
    let k0 = 0
    let hi = p0.length - 1
    while (hi > k0) {
      const m = (k0 + hi) >> 1
      if (p0[m] + blocs[m].poids > from) hi = m
      else k0 = m + 1
    }
    let hi2 = p0.length
    let lo2 = k0
    while (lo2 < hi2) {
      const m = (lo2 + hi2) >> 1
      if (p0[m] < to) lo2 = m + 1
      else hi2 = m
    }
    for (let k = k0; k < hi2; k++) {
      const d = Math.max(from, p0[k]) - p0[k]
      const f = Math.min(to, p0[k] + blocs[k].poids) - p0[k]
      if (d < f) out.push({ bloc: k, debut: platDe(blocs[k], d), fin: platDe(blocs[k], f) })
    }
    return out
  }
  const anns = e.annotations.filter((a) => a.to > a.from)

  // Tranches de CHAQUE annotation calculées UNE SEULE fois (l'ancien calcul
  // par couple bloc×annotation rendait la projection quadratique), puis
  // réparties par bloc en gardant l'ordre des annotations.
  const tranchesParAnn = anns.map((a) => tranchesPlates(a.from, a.to))
  const annsParBloc: Array<Array<{ from: number; to: number; ann: Annotation }>> = blocs.map(() => [])
  for (let i = 0; i < anns.length; i++) {
    for (const tr of tranchesParAnn[i]) {
      annsParBloc[tr.bloc].push({ from: tr.debut, to: tr.fin, ann: anns[i] })
    }
  }

  // Ancres localisées UNE fois (dichotomie), puis réparties par bloc :
  // bornes de cue (deb/fin à un même offset plat) et coupes internes.
  const debParBloc = blocs.map(() => new Map<number, number>())
  const finParBloc = blocs.map(() => new Map<number, number>())
  const ancresParBloc: Array<Array<Ancre>> = blocs.map(() => [])
  for (const a of e.ancres) {
    const k = blocDe(a.pos)
    if (k < 0) continue
    ancresParBloc[k].push(a)
    const flat = platDe(blocs[k], a.pos - p0[k])
    debParBloc[k].set(flat, a.t) // la dernière à cette offset gagne
    if (!finParBloc[k].has(flat)) finParBloc[k].set(flat, a.t) // la première gagne
  }

  // Commentaires : le fragment D'OUVERTURE porte obs/auth ;
  // le fragment FINAL porte data-finobs (= son propre rk).
  // Clés « bloc:offset-plat » locales.
  const obsDebut = new Map<string, Annotation>()
  const finsObs = new Set<string>()
  for (let i = 0; i < anns.length; i++) {
    const a = anns[i]
    if (a.type !== 'commentaire') continue
    const trs = tranchesParAnn[i]
    if (trs.length === 0) continue
    const t0 = trs[0]
    const tn = trs[trs.length - 1]
    obsDebut.set(`${t0.bloc}:${t0.debut}`, a) // la première gagne
    finsObs.add(`${tn.bloc}:${tn.fin}`) // la dernière gagne
  }

  const nomDe = (loc: number | null) => (loc == null ? null : (locuteurDe.get(loc)?.nom ?? null))

  const segments: SegmentProjete[] = []
  let rk = 1
  let sg = 0

  // Tour de parole DÉRIVÉ (run de blocs consécutifs de même loc) :
  // le libellé du tour est posé sur les segments du 1er bloc du run.
  let locPrecedent: number | null | undefined = undefined

  blocs.forEach((b, k) => {
    const premierDuTour = b.loc !== locPrecedent
    locPrecedent = b.loc

    // Annotations de ce bloc, précalculées ci-dessus (offsets PLATS locaux).
    const local = annsParBloc[k]

    // Coupes de segments = ancres INTERNES au texte du bloc (offsets plats :
    // le relPM strictement interne [0, poids] projeté en plat [0, len)).
    const coupes = [
      ...new Set(
        ancresParBloc[k]
          .map((a) => a.pos - p0[k])
          .filter((rel) => rel > 0 && rel < b.poids)
          .map((rel) => platDe(b, rel)),
      ),
    ].sort((x, y) => x - y)
    const jalons = [0, ...coupes, b.texte.length]
    const nomloc = nomDe(b.loc)

    // Libellé du tour : nom affiché ; libellé pseudonymisé (pseudo posé, non
    // refusé) → type 'pseudo' ; refus explicite → 'refuse'. La couleur est
    // INTERNE à l'app (aucun marqueur). data-nomloc-barre est un artefact de
    // RENDU SonalPi1, re-dérivé à l'ouverture ; on ne le porte pas.
    const lLoc = locuteurDe.get(b.loc ?? -1)
    let libelle: LibelleTour | null = null
    if (premierDuTour && b.loc != null && nomloc) {
      if (lLoc?.pseudo && lLoc.pseudoEtat !== 'refuse') libelle = { type: 'pseudo', pseudo: lLoc.pseudo }
      else if (lLoc?.pseudoEtat === 'refuse') libelle = { type: 'refuse' }
      else libelle = { type: 'simple' }
    }

    for (let s = 0; s < jalons.length - 1; s++) {
      const sd = jalons[s]
      const sf = jalons[s + 1]
      if (sd >= sf && b.texte.length > 0) continue // (bloc vide : émettre quand même son segment)

      // Frontières de fragments = bornes du segment ∪ bornes d'annotations.
      const bornes = new Set<number>([sd, sf])
      for (const l of local) {
        if (l.from > sd && l.from < sf) bornes.add(l.from)
        if (l.to > sd && l.to < sf) bornes.add(l.to)
      }
      const tri = [...bornes].sort((x, y) => x - y)

      const rkSegment = rk
      const fragments: FragmentProjete[] = []
      for (let i = 0; i < tri.length - 1; i++) {
        const fs = tri[i]
        const fe = tri[i + 1]
        if (fs >= fe) continue
        const texte = b.texte.slice(fs, fe)
        const couvrant = local.filter((l) => l.from <= fs && l.to >= fe)

        const codes: string[] = []
        let anon: AnonFragment | null = null
        for (const { ann } of couvrant) {
          if (ann.type === 'codage' && ann.code) codes.push(ann.code)
          else if (ann.type === 'anon') {
            anon = { etat: ann.etat === 'exception' ? 'exception' : 'anonymise', pseudo: ann.pseudo ?? null }
          }
        }
        const obs = obsDebut.get(`${k}:${fs}`)
        const elements = texte.match(/[\wÀ-ÿ]+|[^\w\s]|[\s]+/g) ?? []
        fragments.push({
          texte,
          codes,
          anon,
          obs: obs ? { texte: obs.texte ?? '', auteur: obs.auteur } : null,
          finObs: finsObs.has(`${k}:${fe}`) ? rk : null,
          rk,
          nbMots: elements.length,
          // Sauts portés par ce fragment : entre fs (exclu) et sf (inclus) —
          // un saut à la fin du fragment rend son \n avant la frontière ; à la
          // toute début d'un bloc (o = 0) il est porté par le fragment précédent.
          sauts: b.sauts.filter((o) => o > fs && o <= sf).map((o) => o - fs),
        })
        rk += elements.length
      }
      segments.push({
        bloc: k,
        deb: debParBloc[k].get(sd) ?? null,
        fin: finParBloc[k].get(sf) ?? null,
        loc: b.loc,
        nomloc,
        libelle,
        rk: rkSegment,
        rksg: sg,
        fragments,
      })
      sg++
    }
  })

  return segments
}

/** Pseudonymisation DÉFINITIVE sur la projection : le texte des fragments
 *  anonymisés devient `[pseudo]`, les exceptions restent en clair, les
 *  marqueurs d'anon sont retirés. Les vrais noms disparaissent TOUTES voies
 *  confondues : `nomloc` (data-nomloc) est toujours nillé. Avec
 *  `garderLibelles` (voie `.sonal` : le fichier reste parsable par SonalPi1,
 *  les tables de locuteurs sont pseudonymisées en amont), les libellés de
 *  locuteurs sont conservés ; pour les fichiers AUTONOMES ils sont retirés. */
export function appliquerAnonymisation(
  segments: SegmentProjete[],
  { garderLibelles = false }: { garderLibelles?: boolean } = {},
): SegmentProjete[] {
  return segments.map((seg) => ({
    ...seg,
    nomloc: null,
    // Les libellés gardent la classe ligloc (SonalPi1 re-dérive le reste) ;
    // les marqueurs pseudo/refus sont retirés pour un fichier autonome.
    libelle: garderLibelles
      ? seg.libelle
      : seg.libelle != null
        ? { type: 'simple' }
        : null,
    fragments: seg.fragments.map((f) => {
      if (!f.anon) return f
      // Une exception reste marquée `anon` (pas de distinction d'état dans le
      // fichier produit) : highlight SonalPi1 conservé, pseudo jamais émis.
      const anon: AnonFragment | null =
        f.anon.etat === 'exception' ? { etat: 'anonymise', pseudo: null } : null
      const texte =
        f.anon.etat !== 'exception' && f.anon.pseudo != null ? `[${f.anon.pseudo}]` : f.texte
      return { ...f, texte, anon }
    }),
  }))
}

/** Échappe les caractères sensibles d'un texte inséré dans du HTML. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
/** Échappe un texte inséré dans un ATTRIBUT HTML (guillemets compris). */
export function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

// ----------------------------------------------------------------
// RENDU HTML d'un segment — consommé par le `.sonal` ET par la
// page autonome (exportFormats), avec options de filtrage.
// ----------------------------------------------------------------

export interface OptionsSegmentHtml {
  /** Émettre data-deb/data-fin sur les segments (coordonnées temporelles). */
  time: boolean
  /** Émettre les classes cat_* des fragments (thématiques). */
  thm: boolean
  /** Transforme un code de catégorie en identifiant de classe SÛR (page
   *  autonome) ; absent = code brut (voie `.sonal`, classe attendue par la V1). */
  classeDeCode?: (code: string) => string
  /** Title des fragments codés (tooltip de la page autonome) ; absente = rien. */
  titre?: (codes: string[]) => string | null
  /** Rendre les sauts de ligne du modèle en `<br>` (page autonome) ; absent
   *  = texte plat, conforme au `.sonal` (qui ne les transporte pas). */
  sauts?: boolean
}

/** Texte d'un fragment, sauts rendus en `<br>` si demandé (page autonome). */
function texteHtml(frag: FragmentProjete, sauts: boolean): string {
  if (!sauts || frag.sauts.length === 0) return escapeHtml(frag.texte)
  let out = ''
  let pos = 0
  for (const s of frag.sauts) {
    out += escapeHtml(frag.texte.slice(pos, s)) + '<br>'
    pos = s
  }
  return out + escapeHtml(frag.texte.slice(pos))
}

/** Rend un segment en HTML SonalPi1 (`<span class="lblseg sautlig...">`).
 *  La sérialisation `.sonal` l'appelle sans filtrage (time/thm = true) ; la
 *  page autonome décoche ce que ses options retirent. */
export function htmlDeSegment(seg: SegmentProjete, opts: OptionsSegmentHtml): string {
  let ligloc = ''
  let extraSeg = ''
  const lb = seg.libelle
  if (lb) {
    if (lb.type === 'pseudo') {
      ligloc = ' ligloc loc-anon'
      extraSeg = ` data-locpseudo="${escapeAttr(lb.pseudo)}"`
    } else if (lb.type === 'refuse') {
      ligloc = ' ligloc loc-suggere-refuse'
    } else {
      ligloc = ' ligloc'
    }
  }

  let attrs = `class="lblseg sautlig${ligloc}"`
  if (opts.time) attrs += ` data-deb="${seg.deb ?? ''}" data-fin="${seg.fin ?? ''}"`
  attrs += ` data-loc="${seg.loc ?? ''}" tabindex="${seg.rk}" data-rksg="${seg.rksg}"` + extraSeg
  if (seg.nomloc) attrs += ` data-nomloc="${escapeAttr(seg.nomloc)}"`

  let html = `<span ${attrs}>`
  for (const frag of seg.fragments) {
    let classes = ''
    const extra: string[] = []
    if (opts.thm) {
      for (const c of frag.codes) classes += ` ${opts.classeDeCode ? opts.classeDeCode(c) : c}`
    }
    if (frag.anon) {
      classes += frag.anon.etat === 'exception' ? ' anon-exception' : ' anon'
      // Le pseudo n'est JAMAIS sérialisé sur une exception. Il n'est qu'une
      // mémoire de modèle, jamais affichée ni exportée, et le [pseudo] du span
      // ne concerne que les occurrences anonymisées.
      if (frag.anon.pseudo && frag.anon.etat !== 'exception')
        extra.push(`data-pseudo="${escapeAttr(frag.anon.pseudo)}"`)
      extra.push('data-anon-nt="true"')
    }
    if (frag.obs) {
      extra.push(`data-obs="${escapeAttr(frag.obs.texte)}"`)
      extra.push(`data-auth="${escapeAttr(frag.obs.auteur)}"`)
    }
    if (frag.finObs != null) extra.push(`data-finobs="${frag.finObs}"`)
    const titre = opts.titre?.(frag.codes)
    if (titre != null) extra.push(`title="${escapeAttr(titre)}"`)

    const fragmentAttrs =
      `class="${classes.trim()}" data-rk="${frag.rk}" data-sg="${seg.rksg}"` +
      ` data-len="${frag.nbMots}"` +
      (extra.length > 0 ? ' ' + extra.join(' ') : '')
    html += `<span ${fragmentAttrs}>${texteHtml(frag, opts.sauts === true)}</span>`
  }
  html += '</span>'
  return html
}
