/**
 *  Export du corpus au format texte attendu par IRaMuTeQ.
 *  Chaque texte commence par une ligne « **** » et ses variables (*variable_modalite),
 *  puis vient le discours, un paragraphe par ligne.
 *  Les thèmes peuvent devenir des thématiques (« -*theme » en début de ligne).
 *  Fonctions pures : l'appelant fournit les entretiens déjà photographiés.
 */
import type { Categorie, Locuteur, Variable } from '../format'
import type { EntreeExport } from './types'
import { projeterSegments, appliquerAnonymisation, type FragmentProjete, type SegmentProjete } from './projectionEntretien'
import { pseudoUtilisable } from './pseudonymisation'
import { scinderNomDescriptionTheme } from '../corpus/categories'
import type { EncodageTexte } from './encodageWindows1252'

/** Réglages proposés dans le panneau d'export. */
export interface OptionsIramuteq {
  /** Un texte IRaMuTeQ par entretien, par tour de parole,
   *  ou par passage portant les mêmes thèmes (avec une variable par thème). */
  unite: 'entretien' | 'tour' | 'passage'
  /** Retire les tours des locuteurs marqués comme interviewers. */
  exclureInterviewers: boolean
  /** Variables à ajouter sur la ligne étoilée, par identifiant.
   *  null : toutes les variables publiques, et les privées si elles sont autorisées. */
  variables: string[] | null
  /** Autorise l'export des variables privées, qui peuvent identifier les personnes. */
  variablesPrivees: boolean
  /** Thèmes à prendre en compte, par identifiant.
   *  null : tous les thèmes ; un passage codé seulement par des thèmes écartés compte comme non codé. */
  themes: string[] | null
  /** Un passage codé avec un sous-thème compte aussi pour tous ses thèmes parents. */
  heriterParents: boolean
  /** Découpe le discours en thématiques selon les thèmes codés.
   *  Sans effet par passage : les thèmes y deviennent des variables. */
  thematiques: boolean
  /** Par passage, écrit aussi « _non » pour les thèmes absents,
   *  afin de comparer un thème au reste du corpus. */
  themesAbsents: boolean
  /** Applique les pseudonymes configurés au texte et aux locuteurs. */
  anon: boolean
  /** Encodage du fichier : celui qu'IRaMuTeQ propose à l'ouverture.
   *  Sous Windows, c'est Windows-1252 (cp1252) ; ailleurs, UTF-8. */
  encodage: EncodageTexte
}

export const OPTIONS_IRAMUTEQ_DEFAUT: OptionsIramuteq = {
  unite: 'entretien',
  exclureInterviewers: true,
  variables: null,
  variablesPrivees: false,
  themes: null,
  heriterParents: false,
  thematiques: false,
  themesAbsents: true,
  anon: true,
  encodage: 'utf8',
}

export interface EntretienIramuteq {
  titre: string
  entree: EntreeExport
}

export interface CorpusIramuteq {
  contenu: string
  /** Nombre de textes (lignes « **** ») produits. */
  textes: number
  /** Titres des entretiens qui n'ont produit aucun texte. */
  vides: string[]
}

/** Thématique des passages qui ne portent aucun thème. */
const HORS_THEME = 'hors_theme'
/** Variable des passages qui ne portent aucun thème. */
const SANS_THEME = 'thaucun'

/** Les symboles qui portent un sens deviennent des mots,
 *  pour que « + de 20 ans » et « - de 5 ans » restent distincts et lisibles. */
function symbolesEnMots(s: string): string {
  return s
    .replace(/^\s*[-–—]\s*(?=\S)/, ' moins ')
    .replace(/[+>≥]/g, ' plus ')
    .replace(/[<≤]/g, ' moins ')
    .replace(/%/g, ' pourcent ')
    .replace(/&/g, ' et ')
}

function sansAccents(s: string): string {
  return symbolesEnMots(s)
    .replace(/[œŒ]/g, (c) => (c === 'œ' ? 'oe' : 'OE'))
    .replace(/[æÆ]/g, (c) => (c === 'æ' ? 'ae' : 'AE'))
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/** Nom de variable : lettres et chiffres seulement.
 *  IRaMuTeQ sépare la variable de sa modalité au premier tiret bas. */
export function nomVariableIramuteq(libelle: string): string {
  return sansAccents(libelle).replace(/[^A-Za-z0-9]/g, '').toLowerCase()
}

/** Modalité ou thématique : lettres, chiffres et tirets bas. */
export function modaliteIramuteq(libelle: string): string {
  return sansAccents(libelle)
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

/** Rend un nom unique dans `pris` en ajoutant un suffixe numérique. */
function reserver(base: string, pris: Set<string>, separateur: string): string {
  let nom = base
  let rang = 2
  while (pris.has(nom)) nom = `${base}${separateur}${rang++}`
  pris.add(nom)
  return nom
}

/** Une ligne de texte ne doit contenir aucun astérisque :
 *  IRaMuTeQ le réserve aux variables et aux thématiques. */
function nettoyerLigne(texte: string): string {
  return texte.replace(/\*/g, ' ').replace(/\s+/g, ' ').trim()
}

interface VariableNommee {
  variable: Variable
  nom: string
  modalites: Map<string, string>
}

/** Noms stables pour tout le corpus.
 *  Deux variables ou deux modalités identiques une fois nettoyées reçoivent un suffixe. */
function nommerVariables(
  entretiens: EntretienIramuteq[],
  pris: Set<string>,
  ids: string[] | null,
  privees: boolean,
): VariableNommee[] {
  const parId = new Map<string, Variable>()
  for (const { entree } of entretiens) {
    for (const v of entree.variables) {
      if ((privees || !v.priv) && !parId.has(v.id) && (ids === null || ids.includes(v.id))) parId.set(v.id, v)
    }
  }
  return [...parId.values()]
    .sort((a, b) => a.ordre - b.ordre)
    .map((variable) => {
      const nom = reserver(nomVariableIramuteq(variable.lib) || 'var', pris, '')
      const modPris = new Set<string>()
      const modalites = new Map(
        variable.modalites.map((m) => [m.id, reserver(modaliteIramuteq(m.lib) || 'nr', modPris, '_')]),
      )
      return { variable, nom, modalites }
    })
}

/** Thèmes retenus qui ont un code d'export, dans l'ordre de la grille. */
function themesDuCorpus(entretiens: EntretienIramuteq[], ids: string[] | null): Categorie[] {
  const vus = new Set<string>()
  const categories: Categorie[] = []
  for (const { entree } of entretiens) {
    for (const c of entree.codebook) {
      if (c.codeExport && !vus.has(c.codeExport) && (ids === null || ids.includes(c.id))) {
        vus.add(c.codeExport)
        categories.push(c)
      }
    }
  }
  return categories
}

function libelleTheme(c: Categorie): string {
  return scinderNomDescriptionTheme(c.nom).nom || c.codeExport
}

/** Nom de thématique pour chaque code d'export, avec son rang dans la grille. */
function nommerThemes(categories: Categorie[]): { noms: Map<string, string>; rang: Map<string, number> } {
  const noms = new Map<string, string>()
  const rang = new Map<string, number>()
  const pris = new Set([HORS_THEME])
  categories.forEach((c, i) => {
    noms.set(c.codeExport, reserver(modaliteIramuteq(libelleTheme(c)) || 'theme', pris, '_'))
    rang.set(c.codeExport, i)
  })
  return { noms, rang }
}

/** Pour chaque code d'export, les codes de tous ses thèmes parents. */
function codesParents(entretiens: EntretienIramuteq[]): Map<string, string[]> {
  const parId = new Map<string, Categorie>()
  for (const { entree } of entretiens) {
    for (const c of entree.codebook) if (!parId.has(c.id)) parId.set(c.id, c)
  }
  const parents = new Map<string, string[]>()
  for (const c of parId.values()) {
    if (!c.codeExport) continue
    const codes: string[] = []
    const vus = new Set([c.id])
    let parent = c.parent ? parId.get(c.parent) : undefined
    while (parent && !vus.has(parent.id)) {
      vus.add(parent.id)
      if (parent.codeExport) codes.push(parent.codeExport)
      parent = parent.parent ? parId.get(parent.parent) : undefined
    }
    parents.set(c.codeExport, codes)
  }
  return parents
}

/** Ajoute aux codes de chaque fragment ceux des thèmes parents.
 *  Seuls les thèmes retenus transmettent leur codage : un thème décoché est ignoré. */
function avecParents(
  segments: SegmentProjete[],
  parents: Map<string, string[]>,
  retenus: Map<string, number>,
): SegmentProjete[] {
  return segments.map((seg) => ({
    ...seg,
    fragments: seg.fragments.map((frag) => ({
      ...frag,
      codes: [...new Set(frag.codes.flatMap((c) => (retenus.has(c) ? [c, ...(parents.get(c) ?? [])] : [])))],
    })),
  }))
}

/** Codes des thèmes qui couvrent un fragment, dans l'ordre de la grille. */
function codesThemes(frag: FragmentProjete, rang: Map<string, number>): string[] {
  return [...new Set(frag.codes.filter((c) => rang.has(c)))].sort((a, b) => rang.get(a)! - rang.get(b)!)
}

/** Valeur « *loc_… » d'un locuteur : son pseudonyme si demandé.
 *  Sans pseudonyme, un numéro remplace le vrai nom quand la pseudonymisation est active. */
function nomLocuteur(l: Locuteur | undefined, index: number | null, anon: boolean): string {
  if (!l) return `l${index ?? 0}`
  const libelle = anon ? (pseudoUtilisable(l) ? l.pseudo!.trim() : '') : l.nom.trim()
  return modaliteIramuteq(libelle) || `l${l.index}`
}

/** Un futur texte IRaMuTeQ : ses segments et, par passage, ses thèmes. */
interface Groupe {
  segments: SegmentProjete[]
  themes: string[]
}

/** Tours de parole : blocs consécutifs du même locuteur. */
function tours(segments: SegmentProjete[]): SegmentProjete[][] {
  const groupes: SegmentProjete[][] = []
  let prec: SegmentProjete | null = null
  for (const seg of segments) {
    const nouveauTour = prec === null || (seg.bloc !== prec.bloc && seg.loc !== prec.loc)
    if (nouveauTour) groupes.push([])
    groupes[groupes.length - 1].push(seg)
    prec = seg
  }
  return groupes
}

/** Coupe un tour à chaque début et fin de codage.
 *  Les morceaux consécutifs qui portent les mêmes thèmes restent ensemble ;
 *  un morceau fait seulement d'espaces suit le morceau en cours. */
function passages(tour: SegmentProjete[], rang: Map<string, number>): Groupe[] {
  const groupes: Groupe[] = []
  let courant: Groupe | null = null
  let cle: string | null = null
  for (const seg of tour) {
    for (const frag of seg.fragments) {
      if (courant === null || frag.texte.trim() !== '') {
        const themes = codesThemes(frag, rang)
        const nouvelle = themes.join(' ')
        if (courant === null || nouvelle !== cle) {
          courant = { segments: [], themes }
          cle = nouvelle
          groupes.push(courant)
        }
      }
      const dernier: SegmentProjete | undefined = courant.segments[courant.segments.length - 1]
      if (dernier && dernier.bloc === seg.bloc && dernier.rksg === seg.rksg) dernier.fragments.push(frag)
      else courant.segments.push({ ...seg, fragments: [frag] })
    }
  }
  return groupes
}

/** Découpe les segments retenus en textes : un seul par entretien,
 *  un par tour de parole, ou un par passage aux mêmes thèmes. */
function regrouper(
  segments: SegmentProjete[],
  unite: OptionsIramuteq['unite'],
  rang: Map<string, number>,
): Groupe[] {
  if (unite === 'entretien') return segments.length > 0 ? [{ segments, themes: [] }] : []
  if (unite === 'tour') return tours(segments).map((t) => ({ segments: t, themes: [] }))
  return tours(segments).flatMap((t) => passages(t, rang))
}

/** Corps d'un texte : une ligne par paragraphe.
 *  Les lignes « -* » s'ajoutent quand les thématiques sont demandées.
 *  Un passage couvert par plusieurs thèmes est rattaché au premier thème de la grille. */
function corpsTexte(
  segments: SegmentProjete[],
  thematique: ((frag: FragmentProjete) => string) | null,
): string[] {
  const lignes: string[] = []
  let ligne = ''
  let themeCourant: string | null = null
  let enteteEnAttente: string | null = null
  const fermerLigne = (): void => {
    const propre = nettoyerLigne(ligne)
    ligne = ''
    if (!propre) return
    if (enteteEnAttente) {
      lignes.push(`-*${enteteEnAttente}`)
      enteteEnAttente = null
    }
    lignes.push(propre)
  }
  let blocPrec: number | null = null
  for (const seg of segments) {
    if (blocPrec !== null && seg.bloc !== blocPrec) fermerLigne()
    blocPrec = seg.bloc
    for (const frag of seg.fragments) {
      if (thematique && frag.texte.trim() !== '') {
        const theme = thematique(frag)
        if (theme !== themeCourant) {
          fermerLigne()
          themeCourant = theme
          enteteEnAttente = theme
        }
      }
      let pos = 0
      for (const s of frag.sauts) {
        ligne += frag.texte.slice(pos, s)
        fermerLigne()
        pos = s
      }
      ligne += frag.texte.slice(pos)
    }
  }
  fermerLigne()
  return lignes
}

/** Assemble le fichier IRaMuTeQ d'un lot d'entretiens, dans l'ordre reçu. */
export function genererCorpusIramuteq(
  entretiens: EntretienIramuteq[],
  options: OptionsIramuteq,
): CorpusIramuteq {
  const parPassage = options.unite === 'passage'
  const parTour = options.unite !== 'entretien'
  const nomsPris = new Set(['ent', 'loc', SANS_THEME])
  const categories = themesDuCorpus(entretiens, options.themes)
  const grille = nommerThemes(categories)
  const themes = options.thematiques && !parPassage ? grille : null

  // Discours retenu de chaque entretien, calculé une seule fois.
  const parents = options.heriterParents ? codesParents(entretiens) : null
  const prepares = entretiens.map(({ titre, entree }) => {
    const locuteurs = new Map<number, Locuteur>()
    for (const l of entree.locuteurs) if (!locuteurs.has(l.index)) locuteurs.set(l.index, l)
    const estInterviewer = (loc: number | null): boolean =>
      loc != null && (locuteurs.get(loc)?.interviewer ?? false)
    const projection = projeterSegments(entree)
    const retenus = (options.anon ? appliquerAnonymisation(projection) : projection)
      .filter((seg) => !(options.exclureInterviewers && estInterviewer(seg.loc)))
    const segments = parents ? avecParents(retenus, parents, grille.rang) : retenus
    return { titre, entree, locuteurs, segments }
  })

  // Par passage, une variable pour chaque thème présent dans le discours retenu.
  const variablesThemes: Array<{ code: string; nom: string }> = []
  if (parPassage) {
    const presents = new Set<string>()
    for (const { segments } of prepares) {
      for (const seg of segments) {
        for (const frag of seg.fragments) {
          if (frag.texte.trim() !== '') codesThemes(frag, grille.rang).forEach((c) => presents.add(c))
        }
      }
    }
    for (const c of categories) {
      if (!presents.has(c.codeExport)) continue
      const nom = reserver(`th${nomVariableIramuteq(libelleTheme(c))}`, nomsPris, '')
      variablesThemes.push({ code: c.codeExport, nom })
    }
  }
  const variables = nommerVariables(entretiens, nomsPris, options.variables, options.variablesPrivees)
  const idsEntretiens = new Set<string>()
  const blocsTexte: string[] = []
  const vides: string[] = []

  for (const { titre, entree, locuteurs, segments } of prepares) {
    const idEntretien = reserver(modaliteIramuteq(titre) || 'entretien', idsEntretiens, '_')

    const thematique = themes
      ? (frag: FragmentProjete): string => {
          const premier = codesThemes(frag, themes.rang)[0]
          return premier ? themes.noms.get(premier)! : HORS_THEME
        }
      : null

    // Les locuteurs retenus servent aux variables de portée locuteur.
    const locsRetenus = [...new Set(segments.map((s) => s.loc).filter((l): l is number => l != null))]
    const modaliteDe = (v: VariableNommee, idMod: string | undefined): string | null =>
      idMod ? (v.modalites.get(idMod) ?? null) : null

    let produits = 0
    for (const groupe of regrouper(segments, options.unite, grille.rang)) {
      const lignes = corpsTexte(groupe.segments, thematique)
      if (lignes.length === 0) continue
      const etoilees = [`*ent_${idEntretien}`]
      const loc = parTour ? groupe.segments[0].loc : null
      if (parTour) etoilees.push(`*loc_${nomLocuteur(loc != null ? locuteurs.get(loc) : undefined, loc, options.anon)}`)
      if (parPassage) {
        const aucun = groupe.themes.length === 0
        if (aucun || options.themesAbsents) etoilees.push(`*${SANS_THEME}_${aucun ? 'oui' : 'non'}`)
        for (const t of variablesThemes) {
          const present = groupe.themes.includes(t.code)
          if (present || options.themesAbsents) etoilees.push(`*${t.nom}_${present ? 'oui' : 'non'}`)
        }
      }
      for (const v of variables) {
        let modalite: string | null = null
        if (v.variable.portee === 'entretien') {
          modalite = modaliteDe(v, entree.meta.valeursGen[v.variable.id])
        } else if (parTour) {
          modalite = loc != null ? modaliteDe(v, locuteurs.get(loc)?.valeursLoc[v.variable.id]) : null
        } else {
          // Par entretien, une valeur de locuteur n'est reprise que si elle est unique.
          // Tous les locuteurs retenus qui en portent une doivent partager la même.
          const valeurs = new Set(
            locsRetenus
              .map((index) => modaliteDe(v, locuteurs.get(index)?.valeursLoc[v.variable.id]))
              .filter((m): m is string => m != null),
          )
          if (valeurs.size === 1) modalite = [...valeurs][0]
        }
        if (modalite) etoilees.push(`*${v.nom}_${modalite}`)
      }
      blocsTexte.push(`**** ${etoilees.join(' ')}\n${lignes.join('\n')}\n`)
      produits++
    }
    if (produits === 0) vides.push(titre)
  }

  return { contenu: blocsTexte.join('\n'), textes: blocsTexte.length, vides }
}
