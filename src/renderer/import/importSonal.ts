import { charVersPM } from '../../shared/entretien/positions'
import type { Ancre } from '../../shared/entretien/audio'
import { importerVariables, distribuerValeurs } from './eav'
import { parentsDepuisRangs } from '../../shared/corpus'
import type { Annotation } from '../../shared/entretien/annotation'
import type { Categorie, Locuteur, PayloadEntretien, Variable, BrouillonAnon, RegleAnon, Note } from '../../shared/format'
import { scinderPseudos } from '../../shared/entretien/anon'
import { cleEntite } from '../../shared/entretien/anon'
import { genIdNote } from '../../shared/entretien/notes'
import { echapperTexte } from '../notes/sanitiser'

/** Blocs legacy encore en pass-through : `anon` (règles) et `notes`. Les EAV
 *  (var/dic/dat) sont modélisées → hors de ce blob. */
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
  /** Règles corpus extraites de l'`anon-json` (portée corpus) → fusionnées dans
   *  corpus.json.reglesAnon (passées au store à l'import). */
  reglesAnon: RegleAnon[]
  legacy: LegacyBlobs
}

type AnnBrute =
  | { type: 'codage'; code: string; from: number; to: number }
  | { type: 'anon'; entite: string; pseudo: string; etat: 'anonymise' | 'exception'; from: number; to: number }

/** Génère un id de règle corpus à l'import (les entrées SonalPi n'en portent pas). */
function genIdRegle(): string {
  return 'reg-' + Math.random().toString(36).slice(2, 10)
}

/** Parse l'`anon-json` SonalPi en brouillons (entretien-local) + règles corpus. */
function parserAnonJson(json: unknown): { brouillons: BrouillonAnon[]; regles: RegleAnon[] } {
  const brouillons: BrouillonAnon[] = []
  const regles: RegleAnon[] = []
  if (!Array.isArray(json)) return { brouillons, regles }
  for (const es of json) {
    const entite = String((es as Record<string, unknown>)?.entite ?? '').trim()
    if (!entite) continue
    const pseudos = [
      String((es as Record<string, unknown>)?.remplacement ?? '').trim(),
      String((es as Record<string, unknown>)?.remplacementAlt ?? '').trim(),
    ].filter(Boolean)
    const portee = (es as Record<string, unknown>)?.portee
    if (portee === 'brouillon') {
      brouillons.push({ entite, pseudo: pseudos.join(' / ') || undefined })
    } else if (portee === 'corpus' || portee === undefined || portee === '') {
      if (pseudos.length === 0) continue
      regles.push({ id: genIdRegle(), entite: [entite], pseudos })
    }
    // portée 'document' (standalone) : pas d'entrée — les occurrences se relisent des spans.
  }
  return { brouillons, regles }
}

/** Un bloc en cours d'import : texte + annotations (offsets locaux) + ses cues
 *  [de, a[ (fenêtres de texte) avec leurs bornes temporelles mesurées. */
interface BlocImport {
  loc: number | null
  text: string
  anns: AnnBrute[]
  cues: Array<{ deb: number | null; fin: number | null; de: number; a: number }>
}

/**
 * Sas d'import : un HTML `.sonal` (natif, ou produit par un convertisseur
 * SonalPi — SRT/VTT) → charge utile SonalPiTestV2 (doc ProseMirror + annotations + locuteurs)
 * + codebook + blocs legacy. Les offsets caractère du parseur sont convertis
 * en positions ProseMirror (positions.ts).
 */
export function importerSonal(html: string, domDoc: Document): ResultatImport {
  const contenu = domDoc.getElementById('contenuText')
  if (!contenu) throw new Error('.sonal invalide : pas de #contenuText')

  const tabLoc = (extraireJson(html, 'loc-json') as string[] | null) ?? []
  const tabThm = (extraireJson(html, 'cat-json') as CategorieV1[] | null) ?? []
  const anonJson = extraireJson(html, 'anon-json')
  const { brouillons, regles: reglesAnon } = parserAnonJson(anonJson)
  // Notes V1 : un `<textarea>` de texte libre. On lit son contenu texte
  //  (textContent — robuste en DOM de test comme navigateur ; la V1 stockait
  //  une chaîne brute). On migre ce contenu en une note « générale » (bac
  //  récupérant le libre, sans date) ; `legacy.notes` conserve aussi la chaîne
  //  brute pour un futur export sans perte.
  const elNotes = domDoc.getElementById('txtnotes')
  const notesV1 = (elNotes?.textContent ?? '').trim()
  const legacy: LegacyBlobs = {
    // Consommé : brouillons→payload.brouillonsAnon, règles→ResultatImport.reglesAnon.
    tabAnon: null,
    notes: notesV1,
  }
  // Catégories de note : elles vivent au CORPUS (bacs par défaut normalisés
  //  à la lecture de corpus.json) — l'entretien importé n'en porte pas. La
  //  note migrée référence le bac « générale » (id stable d'un bac par défaut).
  // Une seule note migre le texte V1 : bac « générale », pas de date, privée.
  //  Le `corps` est échappé (HTML sanitisé, sans <mark> : le libre V1 n'en a pas).
  const notes: Note[] = notesV1
    ? [
        {
          id: genIdNote(),
          categorieId: 'ncat_generale',
          titre: '',
          date: null,
          statut: 'prive',
          corps: echapperTexte(notesV1),
          rang: 0,
          creeLe: new Date().toISOString(),
          modifieLe: null,
        },
      ]
    : []
  // EAV : var/dic → définitions de variables ; dat → valeurs distribuées chez
  // leur propriétaire (valeursGen / valeursLoc).
  const variables = importerVariables(extraireJson(html, 'var-json'), extraireJson(html, 'dic-json'))

  // 1) Un SEGMENT (.lblseg) = un cue : texte + annotations en offsets locaux +
  //    sa fenêtre temporelle [deb, fin] (bornes mesurées, ou null).
  const blocs: BlocImport[] = []
  // Marqueurs de libellé des tours (.lblseg.ligloc) : chacun porte le libellé
  // du tour — pseudonymisé (loc-anon + data-locpseudo) ou refusé
  // (loc-suggere-refuse) → Locuteur.pseudo / pseudoEtat.
  const labelsLoc = new Map<number, { pseudo: string } | { refuse: true }>()
  for (const segNode of contenu.querySelectorAll('.lblseg')) {
    const seg = segNode as HTMLElement
    const lig = seg.classList.contains('ligloc')
    const locIdx = nombreOuNull(seg.dataset.loc)
    if (lig && locIdx != null && locIdx > 0) {
      if (seg.classList.contains('loc-anon') && seg.dataset.locpseudo) {
        labelsLoc.set(locIdx, { pseudo: seg.dataset.locpseudo })
      } else if (seg.classList.contains('loc-suggere-refuse')) {
        labelsLoc.set(locIdx, { refuse: true })
      }
    }
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
        // Une exception ne ré-émet JAMAIS de data-pseudo à
        // l'export — mais un éventuel `data-pseudo` du producteur (hors
        // convention SonalPi) est CONSERVÉ en mémoire de modèle, comme la
        // bascule locale le fait : « remettre en anonymisé » peut alors
        // restituer le pseudo d'origine sans perte. Absent → mémoire vide.
        anns.push({ type: 'anon', entite: t, pseudo: frag.dataset.pseudo ?? '', etat: 'exception', from, to })
      } else if (frag.classList.contains('anon')) {
        anns.push({ type: 'anon', entite: t, pseudo: frag.dataset.pseudo ?? '', etat: 'anonymise', from, to })
      }
      text += t
    }
    // data-loc="0" = « aucun locuteur » (convention SonalPi : locut[0] n'existe
    // pas) → null au modèle, comme l'absence — sinon la fusion des tours collerait
    // tous les segments sans locuteur d'un texte brut.
    const locBrut = nombreOuNull(seg.dataset.loc)
    blocs.push({
      loc: locBrut === 0 ? null : locBrut,
      text,
      anns,
      cues: [{ deb: nombreOuNull(seg.dataset.deb), fin: nombreOuNull(seg.dataset.fin), de: 0, a: text.length }],
    })
  }

  // 1b) FUSION DES TOURS : les cues consécutifs d'un même locuteur NON NUL
  //     deviennent UN paragraphe (le tour), leurs frontières survivant en
  //     ancres internes (3b) — sans perte, l'export re-découpe par ancre.
  //     Sans locuteur → un bloc par cue (un SRT non diarisé ne devient pas un
  //     seul pavé). Fusion d'IMPORT uniquement : aucun geste d'édition ne
  //     fusionne.
  const tours: BlocImport[] = []
  for (const b of blocs) {
    const prec = tours[tours.length - 1]
    if (prec && b.loc != null && prec.loc === b.loc) {
      const d = prec.text.length
      prec.text += b.text
      prec.anns.push(...b.anns.map((a) => ({ ...a, from: a.from + d, to: a.to + d })))
      prec.cues.push(...b.cues.map((c) => ({ ...c, de: c.de + d, a: c.a + d })))
    } else {
      tours.push(b)
    }
  }

  // 2) Doc ProseMirror : un paragraphe par tour. Les timecodes ne sont PAS des
  //    attrs de bloc : ils deviennent des ancres (3b).
  const longueurs = tours.map((b) => b.text.length)
  const corpsTexte = {
    type: 'doc',
    content: tours.map((b) => ({
      type: 'paragraph',
      attrs: { loc: b.loc },
      content: b.text ? [{ type: 'text', text: b.text }] : [],
    })),
  }

  // 3) Annotations avec positions ProseMirror (offsets locaux → positions absolues).
  //    Une occurrence anon est LIÉE à la règle corpus de même entité (round-trip
  //    sans perte : à l'export on ne ré-émet que les règles APPLIQUÉES).
  const annotations: Annotation[] = []
  let n = 0
  const reglePour = (entite: string) => {
    const cle = cleEntite(entite)
    const r = reglesAnon.find((rg) => rg.entite.some((e) => cleEntite(e) === cle))
    return r ? r.id : undefined
  }
  tours.forEach((b, k) => {
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
          : { ...base, type: 'anon', pseudo: a.pseudo, etat: a.etat, regle: reglePour(a.entite) },
      )
    }
  })

  // 3b) Ancres temporelles : chaque borne MESURÉE de cue → {pos, t}
  //     (deb = début du texte du cue, fin = sa fin — internes au bloc pour un
  //     tour fusionné). Triées par pos par construction ; deux cues jointifs
  //     (fin_i = deb_i+1, même pos, même t) ne produisent qu'UNE ancre.
  const ancres: Ancre[] = []
  const pousser = (a: Ancre) => {
    const d = ancres[ancres.length - 1]
    if (d && d.pos === a.pos && d.t === a.t) return
    ancres.push(a)
  }
  tours.forEach((b, k) => {
    for (const c of b.cues) {
      if (c.deb != null) pousser({ pos: charVersPM(longueurs, k, c.de), t: c.deb })
      if (c.fin != null) pousser({ pos: charVersPM(longueurs, k, c.a), t: c.fin })
    }
  })

  // 4) Locuteurs depuis tabLoc (position dans le tableau = index du locuteur).
  //    Un « ? » dans le nom (convention SonalPi) = INTERVIEWER → drapeau au
  //    modèle, nom nettoyé ; le « ? » est réintroduit à l'export seulement.
  const locuteurs: Locuteur[] = tabLoc
    .map((nom, index) => ({
      index,
      nom: nom.replaceAll('?', '').trim(),
      interviewer: nom.includes('?'),
      valeursLoc: {},
      personneRef: null,
    }))
    .filter((l) => l.index > 0 && l.nom !== '')

  // 4b) Valeurs EAV : `l="all"` → valeursGen ; `l=index` → valeursLoc (posé ici).
  const valeursGen = distribuerValeurs(extraireJson(html, 'dat-json'), locuteurs)

  // 4c) Marqueurs de libellé du .ligloc → Locuteur.pseudo / pseudoEtat :
  //     pseudonymisé (loc-anon + data-locpseudo) → « confirme » ; refus explicite
  //     (loc-suggere-refuse) → « refuse ». Parité SonalPi ; le « ? » interviewer
  //     vient du tabLoc (4), jamais des marqueurs.
  for (const l of locuteurs) {
    const label = labelsLoc.get(l.index)
    if (!label) continue
    if ('pseudo' in label && label.pseudo !== '') {
      l.pseudo = label.pseudo
      l.pseudoEtat = 'confirme'
    } else if ('refuse' in label) {
      l.pseudoEtat = 'refuse'
    }
  }

  // 5) Codebook depuis cat-json (forme SonalPi → Categorie). La hiérarchie
  //    `parent` est RECONSTRUITE depuis la séquence des `rang`=profondeur.
  const parents = parentsDepuisRangs(tabThm.map((t) => ({ id: t.code, rang: Number(t.rang ?? 0) || 0 })))
  const codebook: Categorie[] = tabThm.map((t, i) => ({
    id: t.code,
    nom: t.nom ?? t.code,
    couleur: t.couleur || undefined,
    // SonalPi stocke un nombre nu (24) ou '' — n'importer qu'un nombre > 0.
    taille: Number(t.taille) > 0 ? Number(t.taille) : undefined,
    ordre: i,
    parent: parents[t.code] ?? null,
    actif: t.act !== false,
    codeExport: t.code,
  }))

  return {
    payload: { corpsTexte, annotations, ancres, locuteurs, meta: { valeursGen, audioRef: null }, brouillonsAnon: brouillons, notes },
    codebook,
    variables,
    reglesAnon,
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
