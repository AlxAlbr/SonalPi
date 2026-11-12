import { validerMemoireLocale, type DefinitionAnonLocale } from '../../shared/entretien/anon/definitionsLocales'
import { validerDefinitionAnon } from '../../shared/corpus/definitionsAnon'
import { charVersPM } from '../../shared/entretien/positions'
import type { Ancre } from '../../shared/entretien/audio'
import { importerVariables, distribuerValeurs } from './eav'
import { parentsDepuisRangs, scinderNomDescriptionTheme } from '../../shared/corpus'
import type { Annotation } from '../../shared/entretien/annotation'
import type { Categorie, Locuteur, PayloadEntretien, Variable, BrouillonAnon, RegleAnon, Note } from '../../shared/format'
import { scinderPseudos } from '../../shared/entretien/anon'
import { cleEntite } from '../../shared/entretien/anon'
import { genIdNote } from '../../shared/entretien/notes'
import { echapperTexte } from '../notes/sanitiser'
import type { LegacyBlobs } from '../../shared/export/types'

/** Blocs legacy encore en pass-through : `anon` (règles) et `notes`. Les EAV
 *  (var/dic/dat) sont modélisées → hors de ce blob. */
export type { LegacyBlobs } from '../../shared/export/types'

export interface ResultatImport {
  payload: PayloadEntretien
  /** Codebook extrait de cat-json → fusionné dans le corpus (sas d'import). */
  codebook: Categorie[]
  /** Variables EAV extraites de var/dic-json → fusionnées dans le corpus. */
  variables: Variable[]
  /** Règles corpus extraites de l'`anon-json` (portée corpus) → fusionnées dans
   *  corpus.crp.reglesAnon (passées au store à l'import). */
  reglesAnon: RegleAnon[]
  legacy: LegacyBlobs
}

type AnnBrute =
  | { type: 'codage'; code: string; from: number; to: number }
  | { type: 'anon'; entite: string; pseudo: string; etat: 'anonymise' | 'exception'; from: number; to: number }

/** Commentaire SonalPi1 en cours d'import : ouvert au fragment portant `data-obs`,
 *  fermé au fragment final (voir fermetures ci-dessous). Coordonnées PRÉ-fusion
 *  (index de bloc brut + offset caractère local) — remappées après la fusion des
 *  tours, comme les autres annotations. */
interface CommentaireImport {
  auteur: string
  texte: string
  blocDebut: number
  offDebut: number
  blocFin: number
  /** Offset de fin (null = encore ouvert) ; par défaut = fin du bloc. */
  offFin: number | null
  /** Convention « data-finobs = data-rk du fragment final » : déclarée à
   *  l'ouverture, résolue quand on rencontre ce rk. */
  finRk: string | null
}
/** Génère un id de règle corpus à l'import (les entrées SonalPi1 n'en portent pas). */
function genIdRegle(): string {
  return 'reg-' + Math.random().toString(36).slice(2, 10)
}

/** Parse l'`anon-json` SonalPi1 en brouillons (entretien-local) + règles corpus. */
function parserAnonJson(json: unknown): { brouillons: BrouillonAnon[]; regles: RegleAnon[]; locales: DefinitionAnonLocale[] } {
  const brouillons: BrouillonAnon[] = []
  const regles: RegleAnon[] = []
  const locales: DefinitionAnonLocale[] = []
  if (!Array.isArray(json)) return { brouillons, regles, locales }
  for (const es of json) {
    const entite = String((es as Record<string, unknown>)?.entite ?? '').trim()
    if (!entite) continue
    const pseudos = [
      String((es as Record<string, unknown>)?.remplacement ?? '').trim(),
      String((es as Record<string, unknown>)?.remplacementAlt ?? '').trim(),
    ].filter(Boolean)
    const portee = (es as Record<string, unknown>)?.portee
    const categorie = (es as Record<string, unknown>).thematique
    if (portee === 'document' || portee === 'brouillon') {
      locales.push({ ...validerDefinitionAnon(entite, pseudos, categorie, portee === 'brouillon'), etat: portee === 'brouillon' ? 'brouillon' : 'declaration' })
    }
    if (portee === 'brouillon') {
      brouillons.push({ entite, pseudo: pseudos.join(' / ') || undefined })
    } else if (portee === 'corpus' || portee === undefined || portee === '') {
      if (pseudos.length === 0) continue
      regles.push({ id: genIdRegle(), ...validerDefinitionAnon(entite, pseudos, categorie) })
    }
    // Les positions et choix appliqués se relisent uniquement dans les spans.
  }
  return { brouillons, regles, locales: validerMemoireLocale(locales) }
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
 *  Sas d'import : un DOM `.sonal` (issu du HTML natif ou d'un convertisseur
 *  SonalPi1 — SRT/VTT) → charge utile SonalPi2 (doc ProseMirror + annotations + locuteurs)
 *  + codebook + blocs legacy. Les offsets caractère du parseur sont convertis
 *  en positions ProseMirror (positions.ts).
 */
export function importerSonal(domDoc: Document): ResultatImport {
  const contenu = domDoc.getElementById('contenuText')
  if (!contenu) throw new Error('.sonal invalide : pas de #contenuText')

  const tabLoc = (extraireJson(domDoc, 'loc-json') as string[] | null) ?? []
  const tabThm = (extraireJson(domDoc, 'cat-json') as CategorieV1[] | null) ?? []
  const anonJson = extraireJson(domDoc, 'anon-json')
  const { brouillons, regles: reglesAnon, locales } = parserAnonJson(anonJson)
  // Notes SonalPi1 : un `<textarea>` de texte libre. On lit son contenu texte
  //  (textContent — robuste en DOM de test comme navigateur ; SonalPi1 stockait
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
  //  à la lecture de corpus.crp) — l'entretien importé n'en porte pas. La
  //  note migrée référence le bac « générale » (id stable d'un bac par défaut).
  // Une seule note migre le texte SonalPi1 : bac « générale », pas de date, privée.
  //  Le `corps` est échappé (HTML sanitisé, sans <mark> : le libre SonalPi1 n'en a pas).
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
  const variables = importerVariables(extraireJson(domDoc, 'var-json'), extraireJson(domDoc, 'dic-json'))

  // 1) Un SEGMENT (.lblseg) = un cue : texte + annotations en offsets locaux +
  //    sa fenêtre temporelle [deb, fin] (bornes mesurées, ou null).
  const blocs: BlocImport[] = []
  // Marqueurs de libellé des tours (.lblseg.ligloc) : chacun porte le libellé
  // du tour — pseudonymisé (loc-anon + data-locpseudo) ou refusé
  // (loc-suggere-refuse) → Locuteur.pseudo / pseudoEtat.
  const labelsLoc = new Map<number, { pseudo: string } | { refuse: true }>()
  // Commentaires SonalPi1 (data-obs/data-auth/data-finobs) : collectés à travers les
  // segments, remappés après la fusion des tours. Deux conventions de FIN
  // coexistent dans les fichiers SonalPi1 : `data-finobs` = le data-rk du fragment
  // final (déclaré au fragment d'ouverture), ou un simple marqueur posé sur ce
  // fragment final. Les deux lectures sont couvertes (fermeture par égalité de
  // rk, puis par présence du marqueur) ; sans fin, le commentaire se termine
  // au bout de son bloc.
  const commentaires: CommentaireImport[] = []
  for (const segNode of contenu.querySelectorAll('.lblseg')) {
    const seg = segNode as HTMLElement
    const iB = blocs.length // index FUTUR du bloc de ce segment
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
        // convention SonalPi1) est CONSERVÉ en mémoire de modèle, comme la
        // bascule locale le fait : « remettre en anonymisé » peut alors
        // restituer le pseudo d'origine sans perte. Absent → mémoire vide.
        anns.push({ type: 'anon', entite: t, pseudo: frag.dataset.pseudo ?? '', etat: 'exception', from, to })
      } else if (frag.classList.contains('anon')) {
        anns.push({ type: 'anon', entite: t, pseudo: frag.dataset.pseudo ?? '', etat: 'anonymise', from, to })
      }
      // Commentaires : ouverture (data-obs) et fermetures éventuelles sur CE
      // fragment. L'ordre importe : l'ouverture d'abord, puis la fermeture par
      // égalité de rk (couvre le commentaire d'un seul fragment, dont le finRk
      // vaut son propre rk), puis le marqueur nu (ne s'applique jamais au
      // fragment qui VIENT d'ouvrir).
      if (frag.dataset.obs != null) {
        commentaires.push({
          auteur: (frag.dataset.auth ?? '').trim(),
          texte: frag.dataset.obs.trim(),
          blocDebut: iB,
          offDebut: from,
          blocFin: iB,
          offFin: null,
          finRk: frag.dataset.finobs?.trim() || null,
        })
      }
      for (const c of commentaires) {
        if (c.offFin == null && c.finRk != null && c.finRk === (frag.dataset.rk ?? '')) {
          c.offFin = to
          c.blocFin = iB
        }
      }
      if (frag.dataset.finobs != null && frag.dataset.obs == null) {
        const ouvert = [...commentaires].reverse().find((c) => c.offFin == null)
        if (ouvert) {
          ouvert.offFin = to
          ouvert.blocFin = iB
        }
      }
      text += t
    }
    // data-loc="0" = « aucun locuteur » (convention SonalPi1 : locut[0] n'existe
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
  // Destination de chaque bloc BRUT dans la liste fusionnée : index du tour +
  // décalage d'offset — sert à remapper les commentaires ouverts/fermés de
  // part et d'autre d'une frontière de fusion.
  const destParBloc: Array<{ tour: number; decalage: number }> = []
  for (const b of blocs) {
    const prec = tours[tours.length - 1]
    if (prec && b.loc != null && prec.loc === b.loc) {
      const d = prec.text.length
      destParBloc.push({ tour: tours.length - 1, decalage: d })
      prec.text += b.text
      prec.anns.push(...b.anns.map((a) => ({ ...a, from: a.from + d, to: a.to + d })))
      prec.cues.push(...b.cues.map((c) => ({ ...c, de: c.de + d, a: c.a + d })))
    } else {
      destParBloc.push({ tour: tours.length, decalage: 0 })
      tours.push(b)
    }
  }
  // Commentaires encore ouverts en bout de fichier : ils se terminent au bout
  // de leur dernier bloc connu (fichier tronqué, finobs absent).
  for (const c of commentaires) {
    if (c.offFin == null) c.offFin = blocs[c.blocFin]?.text.length ?? 0
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

  // 3bis) Commentaires SonalPi1 : remappés en coordonnées de tours FUSIONNÉS (les
  //    bornes peuvent encadrer une fusion), avec l'auteur d'origine sinon « import »
  //    (même convention que les autres annotations importées).
  for (const c of commentaires) {
    const dd = destParBloc[c.blocDebut]
    const df = destParBloc[c.blocFin]
    if (!dd || !df || c.offFin == null) continue
    const from = charVersPM(longueurs, dd.tour, c.offDebut + dd.decalage)
    const to = charVersPM(longueurs, df.tour, c.offFin + df.decalage)
    if (from >= to) continue
    annotations.push({
      id: `import-${n++}`,
      type: 'commentaire',
      from,
      to,
      auteur: c.auteur || 'import',
      texte: c.texte,
    })
  }

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
  //    Un « ? » dans le nom (convention SonalPi1) = INTERVIEWER → drapeau au
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
  const valeursGen = distribuerValeurs(extraireJson(domDoc, 'dat-json'), locuteurs)

  // 4c) Marqueurs de libellé du .ligloc → Locuteur.pseudo / pseudoEtat :
  //     pseudonymisé (loc-anon + data-locpseudo) → « confirme » ; refus explicite
  //     (loc-suggere-refuse) → « refuse ». Parité SonalPi1 ; le « ? » interviewer
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

  // 5) Codebook depuis cat-json (forme SonalPi1 → Categorie). La hiérarchie
  //    `parent` est RECONSTRUITE depuis la séquence des `rang`=profondeur.
  const parents = parentsDepuisRangs(tabThm.map((t) => ({ id: t.code, rang: Number(t.rang ?? 0) || 0 })))
  const codebook: Categorie[] = tabThm.map((t, i) => ({
    id: t.code,
    ...scinderNomDescriptionTheme(t.nom ?? t.code),
    couleur: t.couleur || undefined,
    // SonalPi1 stocke un nombre nu (24) ou '' — n'importer qu'un nombre > 0.
    taille: Number(t.taille) > 0 ? Number(t.taille) : undefined,
    ordre: i,
    parent: parents[t.code] ?? null,
    actif: t.act !== false,
    codeExport: t.code,
  }))

  return {
    payload: { corpsTexte, annotations, ancres, locuteurs, meta: { valeursGen, audioRef: null }, brouillonsAnon: brouillons, ...(locales.length ? { definitionsAnonLocales: locales } : {}), notes },
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

/** Extrait et parse un bloc `<script id="…-json">` du DOM `.sonal`.
 *  Le format emballe ses blocs JSON dans des accolades externes.
 *  Il tolère des virgules sauvages (fichiers SonalPi1) : on déballe, on parse
 *  STRICT d'abord, et on répare (hors chaînes) en secours. */
function extraireJson(domDoc: Document, id: string): unknown {
  const brut = domDoc.getElementById(id)?.textContent?.trim()
  if (!brut) return null
  let contenu = brut
  if (contenu.startsWith('{') && contenu.endsWith('}')) {
    const interieur = contenu.slice(1, -1).trim()
    if (interieur.startsWith('[') || interieur.startsWith('{')) contenu = interieur
  }
  if (contenu.length < 2) return null
  try {
    return JSON.parse(contenu)
  } catch {
    try {
      return JSON.parse(reparerJson(contenu))
    } catch {
      return null
    }
  }
}

/** Réparation minimale du JSON SonalPi1, hors chaînes.
 *  Une virgule dans une string n'est jamais touchée : seules les virgules
 *  doublées, ou collées aux crochets/accolades, sont retirées. */
function reparerJson(s: string): string {
  const blancs = ' \n\t\r'
  let sortie = ''
  let preced = ''
  let dansChaine = false
  let echappe = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (dansChaine) {
      sortie += c
      if (echappe) echappe = false
      else if (c === '\\') echappe = true
      else if (c === '"') {
        dansChaine = false
        preced = c
      }
      continue
    }
    if (c === '"') {
      dansChaine = true
      sortie += c
      continue
    }
    if (c === ',') {
      let j = i + 1
      while (j < s.length && blancs.includes(s[j])) j++
      const suivi = s[j] ?? ''
      const sauvage = preced === '' || '[,{'.includes(preced) || ']},'.includes(suivi)
      if (!sauvage) sortie += c
      continue
    }
    if (!blancs.includes(c)) preced = c
    sortie += c
  }
  return sortie
}
