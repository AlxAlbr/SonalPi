import { projeterSegments, appliquerAnonymisation, htmlDeSegment, type SegmentProjete, type FragmentProjete } from './projectionEntretien'
import {
  EntreeExport,
  OptionsExport,
  FormatExport,
  ContexteExport,
  optionsEfficaces,
} from './types'
import type { Categorie, Locuteur, Note, NoteCategory, Variable } from '../format'
import { couleurCss, tailleCss, idCssCode } from './secuCss'
import {
  texteDocument,
  sectionDocument,
  type BlocDocumentExport,
  type DocumentExport,
  type RunTexteExport,
} from './documentExport'
import { corpsNoteEnTexte } from './notesTexte'
import { pseudoUtilisable } from './pseudonymisation'

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
    const aff = anon && pseudoUtilisable(l) ? `[${l.pseudo!.trim()}]` : reel
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

/** Nom d'affichage depuis l'index du codebook (variante indexée de nomDeCode). */
function nomDeCodeDe(parCode: Map<string, Categorie>, code: string): string | null {
  const cat = parCode.get(code)
  return cat ? cat.nom.split('//')[0].trim() || null : null
}

/** Index d'un codebook par code d'export (premier homonyme gagnant, comme le
 *  find() qu'il remplace) : préparé une fois par run d'export, pas un find()
 *  par fragment. */
export function indexCodebook(codebook: Categorie[]): Map<string, Categorie> {
  const out = new Map<string, Categorie>()
  for (const c of codebook) {
    if (c.codeExport && !out.has(c.codeExport)) out.set(c.codeExport, c)
  }
  return out
}

/** Index des locuteurs par index d'affichage (premier homonyme gagnant). */
export function indexLocuteurs(locuteurs: Locuteur[]): Map<number, Locuteur> {
  const out = new Map<number, Locuteur>()
  for (const l of locuteurs) {
    if (!out.has(l.index)) out.set(l.index, l)
  }
  return out
}

/** Notes PUBLIQUES uniquement, regroupées par catégorie, triées par rang. */
export function texteNotesPubliques(
  notes: Note[],
  categoriesNote: NoteCategory[] | undefined,
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
      const corps = corpsNoteEnTexte(n.corps).trim()
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
          .map((code) => nomDeCodeDe(parCode, code))
          .filter((x): x is string => x != null)
          .join(', ')
      : ''
  const parCode = indexCodebook(e.codebook)
  const interviewerDe = indexLocuteurs(e.locuteurs)
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
      seg.loc != null ? (interviewerDe.get(seg.loc)?.interviewer ?? false) : false
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
export interface PiecesPageHtml {
  cssThm: string
  entete: string
  player: string
  sectionNotes: string
  sectionVars: string
  legende: string
  corps: string
  scriptPlayer: string
}

/** Construit les pièces d'une page autonome SANS les assembler ; réutilisées
 *  à l'identique par `genererHtml` et par le document combiné du corpus. */
export function piecesPageHtml(ctx: ContexteExport, optsIn: OptionsExport): PiecesPageHtml {
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
  const parCode = indexCodebook(e.codebook)
  const titreDe = (codes: string[]): string | null => {
    const nomsCats = codes
      .map((code) => nomDeCodeDe(parCode, code))
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

  return { cssThm, entete, player, sectionNotes, sectionVars, legende, corps, scriptPlayer }
}

/** Assemble une page autonome complète à partir des pièces. */
export function genererHtml(ctx: ContexteExport, optsIn: OptionsExport): string {
  const p = piecesPageHtml(ctx, optsIn)
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${echapper(ctx.titre)}</title>
  <style>
${CSS_BASE}
${p.cssThm}  </style>
</head>
<body>
${p.entete}
${p.player}
${p.sectionNotes}
${p.sectionVars}
${p.legende}
  <div id="ent-contenu">
    ${p.corps}
  </div>
  <footer class="ent-footer">Sonal π 2</footer>
  ${p.scriptPlayer}
</body>
</html>`
}

/** Page combinée du CORPUS, source du PDF combiné : une section par entretien
 *  (titre + contenu), CSS des thèmes mis en commun, SANS player ni script —
 *  un PDF ne lit pas d'audio, donc aucun bouton de lecture n'y a de sens. */
export function genererHtmlCombineCorpus(
  items: Array<{ titre: string; ctx: ContexteExport; options: OptionsExport }>,
  nomCorpus: string,
  dateExport: string,
): string {
  const pieces = items.map((item) =>
    piecesPageHtml({ ...item.ctx, audioUrl: null }, item.options),
  )
  const cssThm = [...new Set(pieces.flatMap((p) => p.cssThm.split('\n')))].join('\n')
  const sections = pieces
    .map((p, i) =>
      `<section class="section-entretien-corpus"><h1>${echapper(items[i].titre)}</h1>\n`
      + `${p.sectionNotes}${p.sectionVars}${p.legende}`
      + `<div id="ent-contenu">\n    ${p.corps}\n  </div>\n</section>`)
    .join('\n')
  const entete = `<header class="ent-header"><h1>${echapper(nomCorpus)}</h1>`
    + `<p class="ent-meta">Exporté par Sonal π 2 le ${dateExport}</p></header>`
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${echapper(nomCorpus)}</title>
  <style>
${CSS_BASE}
${cssThm}  </style>
</head>
<body>
${entete}
${sections}
  <footer class="ent-footer">Sonal π 2</footer>
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
