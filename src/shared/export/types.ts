/**
 *  Contrats partagés de l'export d'entretien : options, formats, contexte de
 *  génération et instantané d'entretien. Le renderer et le main consomment
 *  les MÊMES définitions — la projection (projectionEntretien.ts) et la
 *  sérialisation .sonal (renderer/formatSonal/exportSonal.ts) n'ont plus de
 *  dépendance entre elles.
 */
import type { Ancre } from '../entretien/audio'
import type { Annotation } from '../entretien/annotation'
import type { ReperePassage } from '../entretien/reperesPassages'
import type { Categorie, Locuteur, Note, NoteCategory, Variable, RegleAnon, BrouillonAnon } from '../format'

/** Blobs SonalPi1 non modélisés, re-émis tels quels (round-trip sans perte). */
export interface LegacyBlobs {
  tabAnon: unknown
  notes: string
}

/** Entrée du moteur d'export : le payload COMPLET d'un entretien enrichi des
 *  définitions de corpus (codebook, variables, règles). Assemblé par le
 *  préparateur d'instantané — jamais relu au disque par les générateurs. */
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
   *  Les règles appliquées dans cet entretien ressortent en entries
   *  `portee:'corpus'` de l'`anon-json`. */
  reglesAnon?: RegleAnon[]
  /** Brouillons d'anonymisation de CET entretien → entries `portee:'brouillon'`. */
  brouillonsAnon?: BrouillonAnon[]
  definitionsAnonLocales?: import('../entretien/anon/definitionsLocales').DefinitionAnonLocale[]
}

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
  { format: 'sonal', ext: '.sonal', details: 'Fichier d’échange compatible avec SonalPi V1' },
  { format: 'txt', ext: '.txt', details: 'Texte brut lisible dans tout éditeur' },
  { format: 'srt', ext: '.srt', details: 'Sous-titres SRT (passages horodatés uniquement)' },
  { format: 'vtt', ext: '.vtt', details: 'Sous-titres WebVTT (passages horodatés uniquement)' },
  { format: 'html', ext: '.html', details: 'Page web mise en forme (média local référencé, non copié)' },
  { format: 'docx', ext: '.docx', details: 'Document de traitement de texte' },
  { format: 'pdf', ext: '.pdf', details: 'Document prêt à lire ou imprimer' },
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
  { cle: 'anon', label: 'Appliquer la pseudonymisation' },
]

/** Nommage des fichiers d'export (nettoyage, suffixe, collisions) : vit dans
 *  nomsFichiers.ts, réexporté ici pour la commodité des consommateurs. */
export { nomFichierExport } from './nomsFichiers'

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


/** Photographie d'un entretien prête pour un run d'export : construite par le
 *  préparateur d'instantané SANS écriture (ni `sauver()` automatique, ni
 *  lecture disque) — l'entretien ouvert est photographié en mémoire ; un
 *  entretien non ouvert le sera plus tard par le main depuis les fichiers
 *  natifs. Un export reste possible en lecture seule. */
export interface InstantaneEntretienExport {
  id: string
  titre: string
  /** Date de l'entretien, telle que portée par le corpus (peut être absente) ;
   *  utilisée par l'index d'un export de lot. */
  date?: string | null
  /** Repères nécessaires aux rattachements manuels des cas. */
  reperesPassages: ReperePassage[]
  entretien: EntreeExport
  /** Corps des notes PUBLIQUES déjà aplati en texte (voit la conversion
   *  HTML→texte à sa place ; les générateurs ne connaissent plus le DOM). */
  notesPubliques: Note[]
  /** Catégories nécessaires pour présenter les notes avec leur rubrique. */
  categoriesNote?: NoteCategory[]
  /** URL audio locale résolue et vérifiée, ou null (média absent/inaccessible,
   *  corpus distant, ou décision explicite). */
  audioLocal: string | null
}
