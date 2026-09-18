import { exporterSonal, type EntreeExport } from './exportSonal'
import type { Categorie, Locuteur, Note, NoteCategory, Variable } from '../../shared/format'
import { corpsNoteEnTexte } from '../notes/sanitiser'

// ----------------------------------------------------------------
// EXPORTS TEXTUELS D'UN ENTRETIEN — TXT, SRT, VTT, HTML (+ .sonal anonymisé)
// ----------------------------------------------------------------
// Tous les générateurs partent de la MÊME source de vérité du découpage :
// le fragment HTML segmenté produit par `exporterSonal` (spans `.lblseg` avec
// leurs data-deb/data-fin/data-loc/classes cat_). On le parse avec DOMParser
// puis on projette vers le format demandé — aucune duplication de la logique
// de segmentation. Les générateurs sont purs : entrée (EntreeExport + options),
// sortie = chaîne ; pas d'accès au DOM live ni au store.

/** Options de la fenêtre d'export (cases à cocher du panneau « options »). */
export interface OptionsExport {
  /** En-tête (nom de l'entretien + ligne d'export). */
  entete: boolean
  /** Notes publiques de l'entretien (les notes privées ne sortent jamais). */
  notes: boolean
  /** Variables (portée entretien + portée locuteur). */
  vars: boolean
  /** Coordonnées temporelles (dérivées des ancres). */
  time: boolean
  /** Libellés de locuteurs en préfixe. */
  loc: boolean
  /** Catégories thématiques (codages). */
  thm: boolean
  /** Pseudonymisation appliquée définitivement dans le fichier produit. */
  anon: boolean
}

export type FormatExport = 'sonal' | 'txt' | 'srt' | 'vtt' | 'html' | 'docx' | 'pdf'

/** Données assemblées une fois par run d'export, consommées par les générateurs. */
export interface ContexteExport {
  entree: EntreeExport
  titre: string
  /** Notes structurées de l'entretien (seules les notes publiques sortent). */
  notes?: Note[]
  /** Définitions de catégories de notes (niveau corpus) pour regrouper les notes. */
  categoriesNote?: NoteCategory[]
  /** Chemin LOCAL de l'audio référencé ; `null`/absent (corpus distant) = pas de player. */
  audioRef?: string | null
}

/** Un format exportable : extension + description affichée dans la fenêtre. */
export interface FormatExportable {
  format: FormatExport
  ext: string
  details: string
}

export const FORMATS_EXPORT: FormatExportable[] = [
  { format: 'sonal', ext: '.sonal', details: 'Fichier SonalPi V1 (sauvegarde, export vers un autre projet)' },
  { format: 'txt', ext: '.txt', details: 'Texte brut' },
  { format: 'srt', ext: '.srt', details: 'Sous-titres SRT' },
  { format: 'vtt', ext: '.vtt', details: 'Sous-titres WebVTT' },
  { format: 'html', ext: '.html', details: 'Page web autonome (codage + son)' },
  { format: 'docx', ext: '.docx', details: 'Traitement de texte (Word)' },
  { format: 'pdf', ext: '.pdf', details: 'Document PDF' },
]

/** Matrice d'options par format, `[activée, cochéeParDéfaut]` ; absent = option
 *  sans objet pour ce format (case masquée). Le `.sonal` transporte tout :
 *  seule la pseudonymisation y est proposée. */
export const CONFIG_OPTIONS: Record<
  FormatExport,
  Partial<Record<keyof OptionsExport, [boolean, boolean]>>
> = {
  sonal: { anon: [true, false] },
  txt: {
    entete: [true, true],
    notes: [true, true],
    vars: [true, true],
    time: [true, true],
    loc: [true, false],
    thm: [true, false],
    anon: [true, true],
  },
  srt: { loc: [true, true], anon: [true, false] },
  vtt: { notes: [true, true], loc: [true, false], thm: [true, false], anon: [true, false] },
  html: {
    entete: [true, false],
    notes: [true, true],
    vars: [true, true],
    time: [true, true],
    loc: [true, true],
    thm: [true, true],
    anon: [true, true],
  },
  docx: {
    entete: [true, true],
    notes: [true, true],
    vars: [true, true],
    time: [true, true],
    loc: [true, false],
    thm: [true, false],
    anon: [true, true],
  },
  pdf: {
    entete: [true, true],
    notes: [true, true],
    vars: [true, true],
    time: [true, true],
    loc: [true, false],
    thm: [true, false],
    anon: [true, false],
  },
}

/** Libellé affiché pour chaque option (ordre d'affichage du panneau). */
export const LIBELLES_OPTIONS: Array<{ cle: keyof OptionsExport; label: string }> = [
  { cle: 'entete', label: 'En-tête (Sonal π + nom de l\'entretien)' },
  { cle: 'notes', label: 'Notes (les notes privées ne sont jamais exportées)' },
  { cle: 'vars', label: 'Variables' },
  { cle: 'time', label: 'Coordonnées temporelles' },
  { cle: 'loc', label: 'Locuteurs' },
  { cle: 'thm', label: 'Catégories thématiques' },
  { cle: 'anon', label: 'Anonymiser (appliquer la pseudonymisation de manière définitive)' },
]

/** Nom de fichier d'un export : titre nettoyé, suffixe `_anonymise`, extension. */
export function nomFichierExport(titre: string, ext: string, anon: boolean): string {
  const base = titre.replace(/[/\\?%*:|"<>\x00-\x1f]/g, '-').trim() || 'entretien'
  return `${base}${anon ? '_anonymise' : ''}.${ext}`
}

/** Neutralise les options sans objet pour le format demandé (elles restent
 *  donc fausses dans les générateurs, même si la modale les a cochées) ;
 *  `.srt`/`.vtt` n'existent que pour des segments bornés par des ancres :
 *  les coordonnées y sont de fait toujours actives. */
export function optionsEfficaces(format: FormatExport, opts: OptionsExport): OptionsExport {
  const cfg = CONFIG_OPTIONS[format]
  const out = { ...opts }
  for (const cle of Object.keys(cfg) as Array<keyof OptionsExport>) {
    if (cfg[cle] == null) out[cle] = false
  }
  if (format === 'srt' || format === 'vtt') out.time = true
  return out
}

// ----------------------------------------------------------------
// Projection du fragment `.sonal` en segments
// ----------------------------------------------------------------

/** Un fragment de texte (span du `.sonal`) et ses catégories codées. */
interface FragmentExport {
  texte: string
  thms: string[]
}

/** Un segment `.lblseg` du `.sonal` : bornes temporelles, locuteur, fragments de codage. */
interface SegmentExport {
  deb: number | null
  fin: number | null
  loc: number | null
  fragments: FragmentExport[]
}

/** Lit les segments d'un fragment déjà parsé (et éventuellement anonymisé). */
function extraireSegments(conteneur: Element): SegmentExport[] {
  const segments: SegmentExport[] = []
  for (const seg of conteneur.querySelectorAll('.lblseg')) {
    const el = seg as HTMLElement
    const fragments: FragmentExport[] = []
    for (const span of seg.querySelectorAll('span:not(.lblseg)')) {
      fragments.push({
        texte: span.textContent ?? '',
        thms: [...span.classList].filter((c) => c.startsWith('cat_')),
      })
    }
    segments.push({
      deb: el.dataset.deb ? Number(el.dataset.deb) : null,
      fin: el.dataset.fin ? Number(el.dataset.fin) : null,
      loc: el.dataset.loc != null && el.dataset.loc !== '' ? Number(el.dataset.loc) : null,
      fragments,
    })
  }
  return segments
}

/** Retire les balises chargeant des RESSOURCES DISTANTES (links, scripts src) :
 *  le DOM de test (happy-dom) les fetcherait, et une page hors ligne n'en veut pas. */
function htmlSansRessources(html: string): string {
  return html
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<script\b[^>]*\bsrc=[^>]*><\/script>/gi, '')
}

/** Parse le `.sonal` sérialisé et extrait la liste ordonnée des segments ;
 *  avec `anon`, le fragment est pseudonymisé avant lecture. */
function analyserContenu(sonalHtml: string, anon = false): SegmentExport[] {
  const doc = new DOMParser().parseFromString(htmlSansRessources(sonalHtml), 'text/html')
  const conteneur = doc.getElementById('contenuText')
  if (!conteneur) throw new Error('.sonal invalide : pas de #contenuText')
  if (anon) anonymiserFragment(conteneur)
  return extraireSegments(conteneur)
}

/** Applique la pseudonymisation définitive au fragment : le texte des empan
 *  anonymisés devient `[pseudo]`, les exceptions restent en clair. Avec
 *  `garderLibelles`, les data-nomloc/data-locpseudo des tours sont conservés
 *  (voie `.sonal` : SonalPi1 re-dérive le libellé pseudonymisé à l'ouverture) ;
 *  pour les fichiers AUTONOMES (html/txt…), ils sont retirés — pas de fuite du
 *  vrai nom dans le source. */
function anonymiserFragment(root: Element, garderLibelles = false): void {
  for (const span of root.querySelectorAll('span.anon')) {
    if (span.classList.contains('anon-exception')) {
      span.classList.remove('anon-exception')
      continue
    }
    const pseudo = span.getAttribute('data-pseudo')
    if (pseudo != null) span.textContent = `[${pseudo}]`
    span.classList.remove('anon')
    span.removeAttribute('data-pseudo')
    span.removeAttribute('data-anon-nt')
  }
  if (garderLibelles) return
  for (const seg of root.querySelectorAll('.lblseg.ligloc')) {
    seg.removeAttribute('data-nomloc')
    seg.removeAttribute('data-locpseudo')
    seg.classList.remove('loc-anon', 'loc-suggere-refuse')
  }
}

/** Nom AFFICHÉ de chaque locuteur (par index). Pseudonymisé seulement si
 *  l'option est posée : `[Pseudo]` comme la V1, sinon le nom en clair. */
function nomsAffiches(e: EntreeExport, anon: boolean): Map<number, string> {
  const out = new Map<number, string>()
  for (const l of e.locuteurs) {
    const reel = l.nom.trim()
    const aff =
      anon && l.pseudo && l.pseudoEtat !== 'refuse' && l.pseudo.trim() !== reel
        ? `[${l.pseudo.trim()}]`
        : reel
    out.set(l.index, aff)
  }
  return out
}

/** Horodatage `HH:MM:SS` (secondes entières) pour les en-têtes TXT. */
function tempsCourt(sec: number): string {
  const t = Math.floor(sec)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t - h * 3600) / 60)
  const s = t - h * 3600 - m * 60
  return [h, m, s].map((x) => String(x).padStart(2, '0')).join(':')
}

/** Horodatage précis `HH:MM:SS.mmm` ; avec virgule pour le SRT normalisé. */
function tempsPrecis(sec: number, virgule: boolean): string {
  const t = Number(sec)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t - h * 3600) / 60)
  const s = (t - h * 3600 - m * 60).toFixed(3).padStart(6, '0')
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${virgule ? s.replace('.', ',') : s}`
}

/** Nom d'affichage d'un code de catégorie (partie avant `//`, convention V1). */
function nomDeCode(codebook: Categorie[], code: string): string | null {
  const cat = codebook.find((c) => c.codeExport === code)
  return cat ? cat.nom.split('//')[0].trim() || null : null
}

/** Notes PUBLIQUES uniquement, regroupées par catégorie, triées par rang. */
export function texteNotesPubliques(
  notes: Note[],
  categoriesNote: NoteCategory[] | undefined,
  document_: Document = document,
): string {
  const publiques = notes.filter((n) => n.statut === 'public').sort((a, b) => a.rang - b.rang)
  const parCat = new Map<string, Note[]>()
  for (const n of publiques) {
    const liste = parCat.get(n.categorieId) ?? []
    if (liste.length === 0) parCat.set(n.categorieId, liste)
    liste.push(n)
  }
  if (parCat.size === 0) return ''
  const lignes: string[] = []
  for (const [idCat, lns] of parCat) {
    const nomCat = categoriesNote?.find((c) => c.id === idCat)?.nom ?? 'Notes'
    lignes.push(`[${nomCat}]`)
    for (const n of lns) {
      const titre = n.titre.trim()
      const corps = corpsNoteEnTexte(n.corps, document_).trim()
      lignes.push(titre ? `- ${titre} — ${corps}` : `- ${corps}`)
    }
  }
  return lignes.join('\n')
}

/** Variables PUBLIQUES en texte « lib : valeurs » (portée entretien puis locuteurs). */
export function texteVariablesPubliques(
  variables: Variable[],
  valeursGen: Record<string, string>,
  locuteurs: Locuteur[],
  noms: Map<number, string>,
): string {
  const lignes: string[] = []
  for (const v of [...variables].sort((a, b) => a.ordre - b.ordre)) {
    if (v.priv) continue
    const libMod = (idMod: string | undefined) =>
      idMod ? (v.modalites.find((m) => m.id === idMod)?.lib ?? null) : null
    let vals: string[] = []
    if (v.portee === 'entretien') {
      const lib = libMod(valeursGen[v.id])
      if (lib) vals = [lib]
    } else {
      for (const l of [...locuteurs].sort((a, b) => a.index - b.index)) {
        const lib = libMod(l.valeursLoc[v.id])
        if (lib) vals.push(`${noms.get(l.index) ?? l.nom} : ${lib}`)
      }
    }
    lignes.push(`${v.lib} : ${vals.length > 0 ? vals.join(', ') : '---'}`)
  }
  return lignes.join('\n')
}

/** Notes et variables formatées pour un run d'export (partagées TXT/DOCX/HTML). */
function sectionsContexte(ctx: ContexteExport, opts: OptionsExport, noms: Map<number, string>) {
  const e = ctx.entree
  const notes = opts.notes ? texteNotesPubliques(ctx.notes ?? [], ctx.categoriesNote) : ''
  const vars = opts.vars
    ? texteVariablesPubliques(e.variables, e.meta.valeursGen, e.locuteurs, noms)
    : ''
  return { notes, vars }
}

/** Corps de texte commun TXT/DOCX : segments avec horodatage, libellés de
 *  locuteurs et [catégories] aux changements ; `grasInterviewer` pose le
 *  marqueur `{g}` sur les lignes de l'interviewer (DOCX). */
function corpsTexte(
  e: EntreeExport,
  segments: SegmentExport[],
  opts: OptionsExport,
  noms: Map<number, string>,
  grasInterviewer: boolean,
): string {
  let out = ''
  let segPrec: SegmentExport | null = null
  let locPrec = ''
  let thmPrec = ''
  for (const seg of segments) {
    const locNom = opts.loc && seg.loc != null ? (noms.get(seg.loc) ?? '') : ''
    const interviewer =
      grasInterviewer && seg.loc != null
        ? (e.locuteurs.find((l) => l.index === seg.loc)?.interviewer ?? false)
        : false
    for (const frag of seg.fragments) {
      const thmStr = opts.thm
        ? frag.thms
            .map((code) => nomDeCode(e.codebook, code))
            .filter((x): x is string => x != null)
            .join(', ')
        : ''
      const segChange = seg !== segPrec
      const locChange = locNom !== locPrec
      const thmChange = thmStr !== thmPrec
      if (segPrec === null || (segChange && locChange)) {
        if (segPrec !== null) out += '\n\n'
        if (opts.time && seg.deb != null) out += `${tempsCourt(seg.deb)} `
        if (opts.loc && locNom) out += `${interviewer ? '{g}' : ''}${locNom} `
        if (opts.thm && thmStr) out += `[${thmStr}] `
        out += '\n'
      } else if (segChange) {
        out += '\n'
        if (opts.thm && thmChange) out += `[${thmStr || '–'}] `
      } else if (opts.thm && thmChange) {
        out += ` [${thmStr || '–'}] `
      }
      out += frag.texte
      segPrec = seg
      locPrec = locNom
      thmPrec = thmStr
    }
  }
  out += '\n'
  return out
}

// ----------------------------------------------------------------
// Générateurs
// ----------------------------------------------------------------

/** Segments → TXT : en-tête, notes, variables, puis corps de texte. */
export function genererTxt(ctx: ContexteExport, optsIn: OptionsExport): string {
  const opts = optionsEfficaces('txt', optsIn)
  const e = ctx.entree
  const segments = analyserContenu(exporterSonal(e), opts.anon)
  const noms = nomsAffiches(e, opts.anon)
  const { notes, vars } = sectionsContexte(ctx, opts, noms)

  let out = ''
  if (opts.entete) {
    out += `Exporté par Sonal π 2 le ${new Date().toLocaleString()}\n\n`
    out += `Entretien : ${ctx.titre}\n\n`
  }
  if (notes) out += `Notes de l'entretien :\n${notes}\n\n`
  if (vars) out += `Variables associées :\n${vars}\n\n`
  out += corpsTexte(e, segments, opts, noms, false)
  return out
}

/** Sous-titres SRT : un sous-titre par segment borné par des ancres ; les
 *  segments sans coordonnées sont ignorés (une transcription sans audio
 *  n'a pas de cue). */
export function genererSrt(ctx: ContexteExport, optsIn: OptionsExport): string {
  const opts = optionsEfficaces('srt', optsIn)
  const segments = analyserContenu(exporterSonal(ctx.entree), opts.anon)
  const noms = nomsAffiches(ctx.entree, opts.anon)
  let out = ''
  let n = 0
  for (const seg of segments) {
    if (seg.deb == null || seg.fin == null) continue
    n++
    const texte = seg.fragments.map((f) => f.texte).join('').trim().replace(/\s+/g, ' ')
    let prefixe = ''
    if (opts.loc && seg.loc != null) {
      const nom = noms.get(seg.loc)
      if (nom) prefixe = `${nom}: `
    }
    out += `${n}\n${tempsPrecis(seg.deb, true)} --> ${tempsPrecis(seg.fin, true)}\n${prefixe}${texte}\n\n`
  }
  return out
}

/** Sous-titres WebVTT : NOTE des notes publiques, puis un cue par segment
 *  borné ; codages en balises `<c.cat_XXX>` et locuteur en `<v Nom>`. */
export function genererVtt(ctx: ContexteExport, optsIn: OptionsExport): string {
  const opts = optionsEfficaces('vtt', optsIn)
  const segments = analyserContenu(exporterSonal(ctx.entree), opts.anon)
  const noms = nomsAffiches(ctx.entree, opts.anon)
  const { notes } = sectionsContexte(ctx, opts, noms)
  let out = 'WEBVTT\n\n'
  if (notes) out += `NOTE\n${notes.replace(/\n{2,}/g, '\n').trim()}\n\n`
  let n = 0
  for (const seg of segments) {
    if (seg.deb == null || seg.fin == null) continue
    let payload = ''
    for (const frag of seg.fragments) {
      if (opts.thm && frag.thms.length > 0) payload += `<c.${frag.thms[0]}>${frag.texte}</c>`
      else payload += frag.texte
    }
    if (opts.loc && seg.loc != null) {
      const nom = noms.get(seg.loc)
      if (nom) payload = `<v ${nom}>${payload}</v>`
    }
    out += `${++n}\n${tempsPrecis(seg.deb, false)} --> ${tempsPrecis(seg.fin, false)}\n${payload.trim().replace(/\s+/g, ' ')}\n\n`
  }
  return out
}

/** Contenu TXT du DOCX : sections notes/variables à part (posées en titres
 *  Word par le main), corps avec marqueur `{g}` pour le gras interviewer. */
export function genererDonneesDocx(
  ctx: ContexteExport,
  optsIn: OptionsExport,
): { titre: string; entete: boolean; notes: string; variables: string; contenuTxt: string } {
  const opts = optionsEfficaces('docx', optsIn)
  const e = ctx.entree
  const segments = analyserContenu(exporterSonal(e), opts.anon)
  const noms = nomsAffiches(e, opts.anon)
  const { notes, vars } = sectionsContexte(ctx, opts, noms)
  return {
    titre: ctx.titre,
    entete: opts.entete,
    notes,
    variables: vars,
    contenuTxt: corpsTexte(e, segments, opts, noms, true),
  }
}

// ----------------------------------------------------------------
// HTML autonome
// ----------------------------------------------------------------

/** URL `file://` d'un chemin audio local (l'audio est référencé, jamais embarqué). */
function urlAudio(chemin: string): string {
  const normalise = chemin.replace(/\\/g, '/')
  const url = /^[a-zA-Z]:\//.test(normalise)
    ? `file:///${normalise}`
    : normalise.startsWith('/')
      ? `file://${normalise}`
      : normalise
  return url.replace(/"/g, '&quot;')
}

/** CSS des catégories du codebook : règles mono-catégorie (dégradé + taille)
 *  et règles multi-catégories (cumul de bandes de couleur, convention V1). */
function cssThemes(codebook: Categorie[], combos: string[]): string {
  const parCode = new Map(codebook.map((c) => [c.codeExport, c]))
  let css = ''
  for (const cat of codebook) {
    const gradient = cat.couleur
      ? `background-image: linear-gradient(rgba(0,0,0,0) 60%, ${cat.couleur}60 95%, ${cat.couleur} 100%); padding-bottom: 4px;`
      : ''
    const taille =
      cat.taille && cat.taille > 18 ? `font-size: ${cat.taille}px; font-weight: bold;` : ''
    if (gradient || taille) css += `.${cat.codeExport} { ${gradient} ${taille} }\n`
  }
  const EPAISSEUR = 10
  for (const combo of new Set(combos)) {
    const codes = combo.split(' ')
    const n = codes.length
    if (n < 2) continue
    const seuil = 90 - (n - 1) * EPAISSEUR
    const prem = parCode.get(codes[0])
    if (!prem || !prem.couleur) continue
    let chaine = ''
    for (let i = 1; i < n; i++) {
      const cat = parCode.get(codes[i])
      if (!cat?.couleur) continue
      const prog = seuil + EPAISSEUR * i
      chaine += `, white ${prog}%, white ${prog + 3}%, ${cat.couleur} ${prog + 3}%, ${cat.couleur} ${prog + EPAISSEUR}%`
    }
    const bg = `linear-gradient(rgba(0,0,0,0) 50%, ${prem.couleur}60 ${seuil}%, ${prem.couleur} ${seuil + 7}%${chaine})`
    css += `${codes.map((c) => '.' + c).join('')} { background-image: ${bg}; line-height: ${(1.5 + 0.05 * n).toFixed(2)}em; }\n`
  }
  return css
}

/** HTML autonome : en-tête optionnel, player (audio local référencé),
 *  sections notes/variables, légende des thèmes, texte avec codage. */
export function genererHtml(ctx: ContexteExport, optsIn: OptionsExport): string {
  const opts = optionsEfficaces('html', optsIn)
  const e = ctx.entree
  const doc = new DOMParser().parseFromString(htmlSansRessources(exporterSonal(e)), 'text/html')
  const conteneur = doc.getElementById('contenuText')
  if (!conteneur) throw new Error('Fragment d\'export invalide : pas de #contenuText')
  if (opts.anon) anonymiserFragment(conteneur)
  const noms = nomsAffiches(e, opts.anon)

  // Combos multi-catégories présents dans le fragment (pour le CSS cumulé).
  const combos: string[] = []
  for (const span of conteneur.querySelectorAll('span')) {
    const cats = [...span.classList].filter((c) => c.startsWith('cat_'))
    if (cats.length > 1) combos.push(cats.join(' '))
  }
  // CSS des thèmes : généré seulement si l'option est cochée (sinon aucune
  // trace de codage dans la page, ni classes ni règles).
  const cssThm = opts.thm ? cssThemes(e.codebook, combos) : ''

  if (!opts.thm) {
    for (const span of conteneur.querySelectorAll('span')) {
      for (const c of [...span.classList].filter((x) => x.startsWith('cat_'))) {
        span.classList.remove(c)
      }
    }
  } else {
    // Tooltip des catégories sur chaque fragment codé.
    for (const span of conteneur.querySelectorAll('span')) {
      const cats = [...span.classList].filter((c) => c.startsWith('cat_'))
      if (cats.length === 0) continue
      const nomsCats = cats
        .map((code) => nomDeCode(e.codebook, code))
        .filter((x): x is string => x != null)
      if (nomsCats.length > 0) span.setAttribute('title', nomsCats.join(', \n'))
    }
  }
  if (!opts.time) {
    for (const el of conteneur.querySelectorAll('[data-deb], [data-fin]')) {
      el.removeAttribute('data-deb')
      el.removeAttribute('data-fin')
    }
  }

  // En-têtes de locuteurs + boutons de lecture avant chaque tour (.ligloc).
  const audioRef = ctx.audioRef ?? null
  const audioUrl = audioRef ? urlAudio(audioRef) : ''
  if (opts.loc) {
    for (const seg of Array.from(conteneur.querySelectorAll('.lblseg'))) {
      if (!seg.classList.contains('ligloc')) continue
      const el = seg as HTMLElement
      const locIdx = el.dataset.loc
      const nom = locIdx != null && locIdx !== '' ? noms.get(Number(locIdx)) : undefined
      const deb = el.dataset.deb
      const lignes = document.createElement('div')
      lignes.className = 'ligloc-header'
      if (audioUrl && deb) {
        const btn = document.createElement('button')
        btn.className = 'btn-play-seg'
        btn.dataset.deb = deb
        btn.title = tempsCourt(Number(deb))
        btn.textContent = '\u25B6'
        lignes.appendChild(btn)
      }
      if (nom) {
        const nomSpan = document.createElement('span')
        nomSpan.className = 'speaker-name'
        nomSpan.textContent = nom
        lignes.appendChild(nomSpan)
      }
      if (lignes.childNodes.length > 0) seg.parentNode?.insertBefore(lignes, seg)
    }
  }

  // Sections optionnelles.
  const { notes, vars } = sectionsContexte(ctx, opts, noms)
  let sectionNotes = ''
  if (notes) {
    sectionNotes = `<section class="section-notes"><h3>Notes</h3><pre>${echapper(notes)}</pre></section>`
  }
  let sectionVars = ''
  if (vars) {
    const labels = vars
      .split('\n')
      .map((l) => {
        const [lib, ...valeurs] = l.split(' : ')
        return `<label class="var-pub">${echapper(lib)}<b>${echapper(valeurs.join(' : ') || '---')}</b></label>`
      })
      .join('\n')
    sectionVars = `<section class="section-vars"><h3>Variables</h3>${labels}</section>`
  }
  let legende = ''
  if (opts.thm) {
    const avecStyle = e.codebook.filter(
      (cat) => cat.codeExport && (cat.couleur || (cat.taille != null && cat.taille > 18)),
    )
    if (avecStyle.length > 0) {
      const lignes = avecStyle
        .map((cat) => {
          const [nom, desc] = cat.nom.split('//')
          const swatch = cat.couleur
            ? `<span class="legend-swatch" style="background:${cat.couleur}"></span>`
            : `<span class="legend-swatch legend-swatch-size" style="font-size:${cat.taille ?? ''}px;font-weight:bold">A</span>`
          return `<tr><td>${swatch}</td><td class="legend-name">${echapper(nom ?? '')}</td><td class="legend-desc">${echapper(desc ?? '')}</td></tr>`
        })
        .join('\n')
      legende = `<section class="section-legend"><h3>Thématiques</h3><table class="legend-table"><tbody>\n${lignes}\n    </tbody></table></section>`
    }
  }

  const player = audioUrl
    ? `<div class="audio-player-wrapper"><audio id="audio-export" controls src="${audioUrl}">Votre navigateur ne supporte pas la lecture audio.</audio></div>`
    : ''
  const entete = opts.entete
    ? `<header class="ent-header"><h1>${echapper(ctx.titre)}</h1><p class="ent-meta">Exporté par Sonal π 2 le ${new Date().toLocaleString()}</p></header>`
    : ''
  const scriptPlayer = audioUrl
    ? `<script>
    document.querySelectorAll('.btn-play-seg').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var aud = document.getElementById('audio-export');
        if (!aud) return;
        aud.currentTime = parseFloat(btn.dataset.deb);
        aud.play();
        document.querySelectorAll('.btn-play-seg.playing').forEach(function(b) { b.classList.remove('playing'); });
        btn.classList.add('playing');
        aud.addEventListener('pause', function() { btn.classList.remove('playing'); }, { once: true });
      });
    });
  <\/script>`
    : ''

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${echapper(ctx.titre)}</title>
  <style>
${CSS_BASE}
${cssThm}  </style>
</head>
<body>
${entete}
${player}
${sectionNotes}
${sectionVars}
${legende}
  <div id="ent-contenu">
    ${conteneur.innerHTML}
  </div>
  <footer class="ent-footer">Sonal π 2</footer>
  ${scriptPlayer}
</body>
</html>`
}

/** Échappe les caractères sensibles d'un texte inséré dans le HTML. */
function echapper(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** `.sonal` anonymisé : le fragment parsé est pseudonymisé puis re-sérialisé
 *  avec un anon-json vide (les règles ne quittent pas l'entretien). */
export function sonalAnonymise(contenu: string): string {
  const doc = new DOMParser().parseFromString(htmlSansRessources(contenu), 'text/html')
  const conteneur = doc.getElementById('contenuText')
  if (!conteneur) throw new Error('.sonal invalide : pas de #contenuText')
  anonymiserFragment(conteneur, true)
  const anonJson = doc.getElementById('anon-json')
  if (anonJson) anonJson.textContent = '{\n[]\n}'
  return `<!DOCTYPE html>
<html lang="en">
<head>
${doc.head.innerHTML}
</head>
<body>
${doc.body.innerHTML}
</body>
</html>`
}

/** CSS de base de la page autonome (port de la V1, sans dépendance distante). */
const CSS_BASE = `/* Base : styles généraux de la page exportée. */
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #fafafa;
  color: #323232;
  padding: 30px 5%;
  line-height: 1.5;
}
.audio-player-wrapper {
  position: sticky;
  top: 0;
  z-index: 100;
  background: #fafafa;
  padding: 8px 0 12px;
  border-bottom: 1px solid #e0e0e0;
  margin-bottom: 20px;
}
.audio-player-wrapper audio { width: 100%; }
.ent-header {
  border-bottom: 2px solid #548dc1;
  margin-bottom: 24px;
  padding-bottom: 12px;
}
.ent-header h1 { color: #548dc1; font-size: 1.8em; margin-bottom: 4px; }
.ent-meta { color: #999; font-size: 0.85em; }
.section-notes, .section-vars, .section-legend {
  background: #f4f4f4;
  border-left: 4px solid #548dc1;
  border-radius: 3px;
  padding: 14px 18px;
  margin-bottom: 20px;
}
.section-notes h3, .section-vars h3, .section-legend h3 {
  color: #548dc1;
  margin-bottom: 8px;
  font-size: 1em;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.section-notes pre { white-space: pre-wrap; font-family: inherit; }
.var-pub { display: inline-block; margin-right: 14px; margin-bottom: 6px; font-size: 0.9em; }
#ent-contenu {
  line-height: 1.5rem;
  padding-bottom: 20px;
  margin-top: 8px;
}
.lblseg { font-size: 18px; margin-right: 3px; margin-bottom: 1px; color: #323232; }
.ligloc-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 18px;
  padding-bottom: 4px;
  border-bottom: 2px solid transparent;
  border-image: linear-gradient(to right, #83838373, #f9f9f9) 1;
  margin-bottom: 3px;
}
.speaker-name {
  color: #838383;
  font-style: italic;
  font-weight: 100;
}
.btn-play-seg {
  background: none;
  border: 1px solid #548dc1;
  border-radius: 50%;
  width: 22px;
  height: 22px;
  cursor: pointer;
  color: #548dc1;
  font-size: 0.65em;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 0;
}
.btn-play-seg:hover, .btn-play-seg.playing { background: #548dc1; color: #fff; }
.ent-footer {
  margin-top: 40px;
  color: #bbb;
  font-size: 0.8em;
  border-top: 1px solid #eee;
  padding-top: 10px;
}
.section-legend h3 { margin-bottom: 10px; }
.legend-table { border-collapse: collapse; }
.legend-table td { padding: 3px 10px 3px 0; vertical-align: middle; }
.legend-swatch {
  display: inline-block;
  width: 18px;
  height: 18px;
  border-radius: 3px;
  vertical-align: middle;
}
.legend-name { font-weight: 500; }
.legend-desc { color: #777; font-size: 0.9em; }
.legend-swatch-size {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  background: none;
  border-radius: 0;
  color: #323232;
}`
