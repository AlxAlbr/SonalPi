import { projeterSegments, appliquerAnonymisation, htmlDeSegment, type SegmentProjete, type FragmentProjete } from './projection'
import type { EntreeExport } from './exportSonal'
import type { Categorie, Locuteur, Note, NoteCategory, Variable } from '../../shared/format'
import { couleurCss, tailleCss, idCssCode } from '../../shared/export/secuCss'
import {
  texteDocument,
  sectionDocument,
  type BlocDocumentExport,
  type DocumentExport,
  type RunTexteExport,
} from '../../shared/export/documentExport'
import { corpsNoteEnTexte } from '../notes/sanitiser'

// ----------------------------------------------------------------
// EXPORTS TEXTUELS D'UN ENTRETIEN — TXT, SRT, VTT, HTML
// ----------------------------------------------------------------
// Tous les générateurs partent de la MÊME source de vérité du découpage :
// `projeterSegments` (modèle JSON → segments typés, sans DOM). Les
// générateurs sont purs : entrée (EntreeExport + options), sortie = chaîne ;
// pas d'accès au DOM live ni au store.

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
  /** URL de l'audio local, RÉSOLUE et vérifiée par le main (fichier présent
   *  sur ce poste) ; `null` = média absent/inaccessible ou corpus distant :
   *  pas de player. Une URL déjà construite ne se recombine JAMAIS ici. */
  audioUrl?: string | null
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

/** Options applicables à un format : `activee` (case proposée) et `defaut`
 *  (état au choix du format). Absent = option sans objet (case masquée).
 *  Le `.sonal` transporte tout : seule la pseudonymisation y est proposée. */
export interface OptionFormatExport {
  activee: boolean
  defaut: boolean
}
export const CONFIG_OPTIONS: Record<
  FormatExport,
  Partial<Record<keyof OptionsExport, OptionFormatExport>>
> = {
  sonal: { anon: { activee: true, defaut: false } },
  txt: {
    entete: { activee: true, defaut: true },
    notes: { activee: true, defaut: true },
    vars: { activee: true, defaut: true },
    time: { activee: true, defaut: true },
    loc: { activee: true, defaut: false },
    thm: { activee: true, defaut: false },
    anon: { activee: true, defaut: true },
  },
  srt: { loc: { activee: true, defaut: true }, anon: { activee: true, defaut: false } },
  vtt: {
    notes: { activee: true, defaut: true },
    loc: { activee: true, defaut: false },
    thm: { activee: true, defaut: false },
    anon: { activee: true, defaut: false },
  },
  html: {
    entete: { activee: true, defaut: false },
    notes: { activee: true, defaut: true },
    vars: { activee: true, defaut: true },
    time: { activee: true, defaut: true },
    loc: { activee: true, defaut: true },
    thm: { activee: true, defaut: true },
    anon: { activee: true, defaut: true },
  },
  docx: {
    entete: { activee: true, defaut: true },
    notes: { activee: true, defaut: true },
    vars: { activee: true, defaut: true },
    time: { activee: true, defaut: true },
    loc: { activee: true, defaut: false },
    thm: { activee: true, defaut: false },
    anon: { activee: true, defaut: true },
  },
  pdf: {
    entete: { activee: true, defaut: true },
    notes: { activee: true, defaut: true },
    vars: { activee: true, defaut: true },
    time: { activee: true, defaut: true },
    loc: { activee: true, defaut: false },
    thm: { activee: true, defaut: false },
    anon: { activee: true, defaut: false },
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

/** Neutralise les options sans objet pour le format demandé : TOUTES les
 *  options connues sont parcourues, celles que le format ne porte pas tombent
 *  à false (elles restent donc fausses dans les générateurs, même si la
 *  modale les a cochées) ; `.srt`/`.vtt` n'existent que pour des segments
 *  bornés par des ancres : les coordonnées y sont de fait toujours actives. */
export function optionsEfficaces(format: FormatExport, opts: OptionsExport): OptionsExport {
  const cfg = CONFIG_OPTIONS[format]
  const out = { ...opts }
  for (const { cle } of LIBELLES_OPTIONS) {
    if (cfg[cle] == null) out[cle] = false
  }
  if (format === 'srt' || format === 'vtt') out.time = true
  return out
}

// ----------------------------------------------------------------
// Projection des segments (JSON), avec pseudonymisation si demandée
// ----------------------------------------------------------------

/** Segments du modèle pour un run d'export : pseudonymisés si l'option est
 *  posée (libellés de locuteurs retirés — pas de fuite du vrai nom dans le
 *  fichier produit). */
function segmentsExport(e: EntreeExport, anon: boolean): SegmentProjete[] {
  const segments = projeterSegments(e)
  return anon ? appliquerAnonymisation(segments, { garderLibelles: false }) : segments
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

/** Millisecondes entières d'un temps de cue : arrondies AVANT toute
 *  décomposition (59.9999 → 60 000 ms, jamais « 00:00:60.000 »). Un temps
 *  non fini (NaN, ±Infini) est inutilisable : null. Un temps négatif est
 *  ramené à 0. */
function msCue(sec: unknown): number | null {
  if (typeof sec !== 'number' || !Number.isFinite(sec)) return null
  return Math.max(0, Math.round(sec * 1000))
}

/** Horodatage d'un cue depuis des millisecondes : virgule pour le SRT,
 *  point pour le WebVTT. */
function horodatageCue(ms: number, virgule: boolean): string {
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms - h * 3600000) / 60000)
  const s = Math.floor((ms - h * 3600000 - m * 60000) / 1000)
  const milli = String(ms % 1000).padStart(3, '0')
  return (
    `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:` +
    `${String(s).padStart(2, '0')}${virgule ? ',' : '.'}${milli}`
  )
}

/** Échappe un texte inséré dans un cue WebVTT : `<` ouvre une balise de
 *  synchronisation ou de style, et toute occurrence de `>` pourrait
 *  ressembler à la fin d'un séparateur `-->`. Les références HTML sont la
 *  forme d'échappement officielle du WebVTT. */
function echapperVtt(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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

/** Texte d'un fragment avec ses SAUTS DE LIGNE du modèle (hardBreak → \n).
 *  Le `.sonal` les ignore (format SonalPi1 gelé) ; txt/docx les rendent en
 *  retour à la ligne, les sous-titres les normalisent en espace. */
function texteAvecSauts(frag: FragmentProjete): string {
  let out = ''
  let pos = 0
  for (const s of frag.sauts) {
    out += frag.texte.slice(pos, s) + '\n'
    pos = s
  }
  return out + frag.texte.slice(pos)
}

/** Corps du document structuré (aplati pour le TXT, converti pour le DOCX).
 *  La mise en page suit les BLOCS (paragraphe de l'éditeur) — un tour nouveau
 *  = ligne vide, un bloc du même tour = simple retour, les cues internes
 *  coulent sans retour. Horodatage et libellés de locuteurs aux débuts de
 *  tour ; le libellé d'un tour d'interviewer est posé comme run GRAS du
 *  document, sans aucun marqueur textuel interprété. */
function corpsDocument(
  e: EntreeExport,
  segments: SegmentProjete[],
  opts: OptionsExport,
  noms: Map<number, string>,
): BlocDocumentExport[] {
  const thmStrDe = (frag: FragmentProjete): string =>
    opts.thm
      ? frag.codes
          .map((code) => nomDeCode(e.codebook, code))
          .filter((x): x is string => x != null)
          .join(', ')
      : ''
  const blocs: BlocDocumentExport[] = []
  let ligne: RunTexteExport[] = []
  const cloturer = (): void => {
    blocs.push({ type: 'paragraphe', runs: ligne })
    ligne = []
  }
  let segPrec: SegmentProjete | null = null
  let thmPrec = ''
  for (const seg of segments) {
    const blocChange = segPrec === null || seg.bloc !== segPrec.bloc
    const tourChange = blocChange && segPrec !== null && seg.loc !== segPrec.loc
    const locNom = opts.loc && seg.loc != null ? (noms.get(seg.loc) ?? '') : ''
    const interviewer =
      seg.loc != null ? (e.locuteurs.find((l) => l.index === seg.loc)?.interviewer ?? false) : false
    if (blocChange) {
      if (segPrec === null || tourChange) {
        // Tour nouveau : fermer la ligne courante puis une ligne vide.
        if (segPrec !== null) {
          cloturer()
          blocs.push({ type: 'espace' })
        }
        const enTete: RunTexteExport[] = []
        if (opts.time && seg.deb != null) enTete.push({ texte: `${tempsCourt(seg.deb)} ` })
        if (opts.loc && locNom) enTete.push({ texte: `${locNom} `, gras: interviewer })
        const thmPrem = seg.fragments.length > 0 ? thmStrDe(seg.fragments[0]) : ''
        if (thmPrem) enTete.push({ texte: `[${thmPrem}] ` })
        blocs.push({ type: 'paragraphe', runs: enTete })
      } else {
        cloturer()
        const thmPrem = seg.fragments.length > 0 ? thmStrDe(seg.fragments[0]) : ''
        if (thmPrem !== thmPrec) ligne.push({ texte: `[${thmPrem || '–'}] ` })
      }
    }
    let premierDuBloc = blocChange
    for (const frag of seg.fragments) {
      const thmStr = thmStrDe(frag)
      if (!premierDuBloc && opts.thm && thmStr !== thmPrec) {
        ligne.push({ texte: ` [${thmStr || '–'}] ` })
      }
      // Les sauts de ligne du modèle (hardBreak → \n) ouvrent chacun une
      // nouvelle ligne du document.
      let pos = 0
      for (const s of frag.sauts) {
        ligne.push({ texte: frag.texte.slice(pos, s) })
        cloturer()
        pos = s
      }
      ligne.push({ texte: frag.texte.slice(pos) })
      thmPrec = thmStr
      premierDuBloc = false
    }
    segPrec = seg
  }
  cloturer()
  return blocs
}

// ----------------------------------------------------------------
// Générateurs
// ----------------------------------------------------------------

/** Segments → TXT : en-tête, notes, variables, puis corps de texte (le
 *  document intermédiaire est aplati : les styles sont perdus, le contenu
 *  reste littéral). */
export function genererTxt(ctx: ContexteExport, optsIn: OptionsExport): string {
  const opts = optionsEfficaces('txt', optsIn)
  const e = ctx.entree
  const segments = segmentsExport(e, opts.anon)
  const noms = nomsAffiches(e, opts.anon)
  const { notes, vars } = sectionsContexte(ctx, opts, noms)

  let out = ''
  if (opts.entete) {
    out += `Exporté par Sonal π 2 le ${new Date().toLocaleString()}\n\n`
    out += `Entretien : ${ctx.titre}\n\n`
  }
  if (notes) out += `Notes de l'entretien :\n${notes}\n\n`
  if (vars) out += `Variables associées :\n${vars}\n\n`
  out += texteDocument({ blocs: corpsDocument(e, segments, opts, noms) })
  return out
}

/** Sous-titres SRT : un sous-titre par segment borné par des ancres ; les
 *  segments sans coordonnées finies sont ignorés, tout comme un cue inversé
 *  (fin ≤ début). Le texte est aplati (les sauts du modèle deviennent des
 *  espaces) ; un `-->` littéral est neutralisé pour ne jamais ressembler à
 *  un séparateur de cue. */
export function genererSrt(ctx: ContexteExport, optsIn: OptionsExport): string {
  const opts = optionsEfficaces('srt', optsIn)
  const segments = segmentsExport(ctx.entree, opts.anon)
  const noms = nomsAffiches(ctx.entree, opts.anon)
  let out = ''
  let n = 0
  for (const seg of segments) {
    const deb = msCue(seg.deb)
    const fin = msCue(seg.fin)
    if (deb == null || fin == null || fin <= deb) continue
    n++
    const texte = seg.fragments
      .map((f) => texteAvecSauts(f))
      .join('')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/-->/g, '- ->')
    let prefixe = ''
    if (opts.loc && seg.loc != null) {
      const nom = noms.get(seg.loc)
      if (nom) prefixe = `${nom}: `
    }
    out += `${n}\n${horodatageCue(deb, true)} --> ${horodatageCue(fin, true)}\n${prefixe}${texte}\n\n`
  }
  return out
}

/** Sous-titres WebVTT : NOTE des notes publiques, puis un cue par segment
 *  borné ; TOUTES les catégories d'un fragment multicodé sont émises en
 *  classes `<c>` imbriquées (identifiants sûrs, jamais le code brut), et le
 *  locuteur en `<v Nom>` échappé. Textes et noms sont échappés : un texte
 *  importé ne peut ni ouvrir une balise ni ressembler à un séparateur de cue. */
export function genererVtt(ctx: ContexteExport, optsIn: OptionsExport): string {
  const opts = optionsEfficaces('vtt', optsIn)
  const segments = segmentsExport(ctx.entree, opts.anon)
  const noms = nomsAffiches(ctx.entree, opts.anon)
  const { notes } = sectionsContexte(ctx, opts, noms)
  let out = 'WEBVTT\n\n'
  if (notes) out += `NOTE\n${notes.replace(/\n{2,}/g, '\n').trim()}\n\n`
  let n = 0
  for (const seg of segments) {
    const deb = msCue(seg.deb)
    const fin = msCue(seg.fin)
    if (deb == null || fin == null || fin <= deb) continue
    let payload = ''
    for (const frag of seg.fragments) {
      // Un fragment multicodé porte chacune de ses catégories : classes
      // imbriquées `<c.scat-…><c.scat-…>texte</c></c>`.
      if (opts.thm && frag.codes.length > 0) {
        payload +=
          frag.codes.map((c) => `<c.${idCssCode(c)}>`).join('') +
          echapperVtt(texteAvecSauts(frag)) +
          '</c>'.repeat(frag.codes.length)
      } else {
        payload += echapperVtt(texteAvecSauts(frag))
      }
    }
    if (opts.loc && seg.loc != null) {
      const nom = noms.get(seg.loc)
      if (nom) payload = `<v ${echapperVtt(nom)}>${payload}</v>`
    }
    out += `${++n}\n${horodatageCue(deb, false)} --> ${horodatageCue(fin, false)}\n${payload.trim().replace(/\s+/g, ' ')}\n\n`
  }
  return out
}

/** Données du DOCX : titre, en-tête, et le document intermédiaire structuré
 *  (sections notes/variables/contenu ; le gras de l'interviewer est un run,
 *  plus aucun marqueur `{g}`/`**…**` à décoder par le main). */
export interface DonneesDocxExport {
  titre: string
  entete: boolean
  document: DocumentExport
}

export function genererDonneesDocx(ctx: ContexteExport, optsIn: OptionsExport): DonneesDocxExport {
  const opts = optionsEfficaces('docx', optsIn)
  const e = ctx.entree
  const segments = segmentsExport(e, opts.anon)
  const noms = nomsAffiches(e, opts.anon)
  const { notes, vars } = sectionsContexte(ctx, opts, noms)
  const lignes = (texte: string): RunTexteExport[][] =>
    texte.split('\n').map((l) => [{ texte: l }])
  const blocs: BlocDocumentExport[] = []
  if (notes) blocs.push(...sectionDocument('NOTES', lignes(notes)), { type: 'espace' })
  if (vars) blocs.push(...sectionDocument('VARIABLES', lignes(vars)), { type: 'espace' })
  blocs.push(
    ...sectionDocument('CONTENU', []),
    ...corpsDocument(e, segments, opts, noms),
    { type: 'espace' },
  )
  return {
    titre: ctx.titre,
    entete: opts.entete,
    document: { blocs },
  }
}

// ----------------------------------------------------------------
// HTML autonome
// ----------------------------------------------------------------

/** CSS des catégories du codebook : règles mono-catégorie (dégradé + taille)
 *  et règles multi-catégories (cumul de bandes de couleur, convention V1).
 *  Codes, couleurs et tailles viennent de fichiers importés (jamais de
 *  confiance) : le code devient un identifiant sûr dérivé, la couleur n'est
 *  interpolée que si c'est un HEX valide, la taille est bornée. */
function cssThemes(codebook: Categorie[], combos: string[]): string {
  const parCode = new Map(codebook.map((c) => [c.codeExport, c]))
  const classeDe = (code: string): string => idCssCode(code)
  let css = ''
  for (const cat of codebook) {
    const couleur = couleurCss(cat.couleur)
    const gradient = couleur
      ? `background-image: linear-gradient(rgba(0,0,0,0) 60%, ${couleur}60 95%, ${couleur} 100%); padding-bottom: 4px;`
      : ''
    const taille = tailleCss(cat.taille)
    const tailleStyle =
      taille != null && cat.taille != null && cat.taille > 18
        ? `font-size: ${taille}px; font-weight: bold;`
        : ''
    if (gradient || taille) css += `.${classeDe(cat.codeExport)} { ${gradient} ${taille} }\n`
  }
  const EPAISSEUR = 10
  for (const combo of new Set(combos)) {
    const codes = combo.split(' ')
    const n = codes.length
    if (n < 2) continue
    const seuil = 90 - (n - 1) * EPAISSEUR
    const prem = parCode.get(codes[0])
    const premCouleur = couleurCss(prem?.couleur)
    if (!premCouleur) continue
    let chaine = ''
    for (let i = 1; i < n; i++) {
      const couleur = couleurCss(parCode.get(codes[i])?.couleur)
      if (!couleur) continue
      const prog = seuil + EPAISSEUR * i
      chaine += `, white ${prog}%, white ${prog + 3}%, ${couleur} ${prog + 3}%, ${couleur} ${prog + EPAISSEUR}%`
    }
    const bg = `linear-gradient(rgba(0,0,0,0) 50%, ${premCouleur}60 ${seuil}%, ${premCouleur} ${seuil + 7}%${chaine})`
    css += `${codes.map((c) => '.' + classeDe(c)).join('')} { background-image: ${bg}; line-height: ${(1.5 + 0.05 * n).toFixed(2)}em; }\n`
  }
  return css
}

/** Page autonome : en-tête optionnel, player (audio local référencé),
 *  sections notes/variables, légende des thèmes, texte rendu depuis les
 *  segments du modèle (en-têtes de locuteurs, boutons de lecture, tooltips). */
export function genererHtml(ctx: ContexteExport, optsIn: OptionsExport): string {
  const opts = optionsEfficaces('html', optsIn)
  const e = ctx.entree
  const segments = segmentsExport(e, opts.anon)
  const noms = nomsAffiches(e, opts.anon)

  // Combos multi-catégories présents dans le texte (pour le CSS cumulé).
  const combos: string[] = []
  if (opts.thm) {
    for (const seg of segments) {
      for (const frag of seg.fragments) {
        if (frag.codes.length > 1) combos.push(frag.codes.join(' '))
      }
    }
  }
  // CSS des thèmes : généré seulement si l'option est cochée (sinon aucune
  // trace de codage dans la page, ni classes ni règles).
  const cssThm = opts.thm ? cssThemes(e.codebook, combos) : ''

  // En-têtes de locuteurs + boutons de lecture avant chaque tour (.ligloc) ;
  // bouton uniquement si les coordonnées sortent ET que l'URL locale existe
  // (résolue et vérifiée par le main ; `null` = média absent, inaccessible
  // ou corpus distant). Le chemin absolu local d'un média ne sort JAMAIS
  // d'un export pseudonymisé (pas de player sans décision explicite).
  const audioUrl = opts.anon ? null : (ctx.audioUrl ?? null)
  const titreDe = (codes: string[]): string | null => {
    const nomsCats = codes
      .map((code) => nomDeCode(e.codebook, code))
      .filter((x): x is string => x != null)
    return nomsCats.length > 0 ? nomsCats.join(', \n') : null
  }
  let corps = ''
  let segPrec: SegmentProjete | null = null
  for (const seg of segments) {
    // La mise en page suit les BLOCS (paragraphe de l'éditeur) : `<br>` aux
    // frontières de blocs, cues internes coulent — comme dans l'interface ;
    // les sauts internes d'un tour sont rendus dans les fragments eux-mêmes.
    if (segPrec !== null && seg.bloc !== segPrec.bloc) corps += '<br>'
    segPrec = seg
    if (opts.loc && seg.libelle) {
      const nom = seg.loc != null ? noms.get(seg.loc) : undefined
      const btn =
        opts.time && audioUrl && seg.deb != null
          ? `<button class="btn-play-seg" data-deb="${String(seg.deb)}" title="${tempsCourt(seg.deb)}">\u25B6</button>`
          : ''
      const nomSpan = nom ? `<span class="speaker-name">${echapper(nom)}</span>` : ''
      if (btn || nomSpan) corps += `<div class="ligloc-header">${btn}${nomSpan}</div>`
    }
    corps += htmlDeSegment(seg, {
      time: opts.time,
      thm: opts.thm,
      // Codebook importé : jamais de code brut en classe CSS dans la page.
      classeDeCode: idCssCode,
      titre: opts.thm ? titreDe : undefined,
      sauts: true,
    })
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
      (cat) => cat.codeExport && (couleurCss(cat.couleur) || (cat.taille != null && cat.taille > 18)),
    )
    if (avecStyle.length > 0) {
      const lignes = avecStyle
        .map((cat) => {
          const [nom, desc] = cat.nom.split('//')
          const couleur = couleurCss(cat.couleur)
          const taille = tailleCss(cat.taille)
          const swatch = couleur
            ? `<span class="legend-swatch" style="background:${couleur}"></span>`
            : `<span class="legend-swatch legend-swatch-size" style="font-size:${taille ?? ''}px;font-weight:bold">A</span>`
          return `<tr><td>${swatch}</td><td class="legend-name">${echapper(nom ?? '')}</td><td class="legend-desc">${echapper(desc ?? '')}</td></tr>`
        })
        .join('\n')
      legende = `<section class="section-legend"><h3>Thématiques</h3><table class="legend-table"><tbody>\n${lignes}\n    </tbody></table></section>`
    }
  }

  const player = audioUrl
    ? `<div class="audio-player-wrapper"><audio id="audio-export" controls src="${echapperAttrUrl(audioUrl)}">Votre navigateur ne supporte pas la lecture audio.</audio></div>`
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
    ${corps}
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

/** Échappe une URL insérée dans un attribut HTML (guillemets compris). */
function echapperAttrUrl(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
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
