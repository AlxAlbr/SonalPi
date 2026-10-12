import { serializeSonal } from './legacy/sonal.mjs'
import {
  projeterSegments,
  appliquerAnonymisation,
  htmlDeSegment,
  type SegmentProjete,
} from '../../shared/export/projectionEntretien'
import { pseudoUtilisable } from '../../shared/export/pseudonymisation'
import type { EntreeExport, LegacyBlobs } from '../../shared/export/types'
import type { Ancre } from '../../shared/entretien/audio'
import { exporterVariables, exporterValeurs } from './eav'
import { ordreThemes } from '../../shared/corpus'
import { couleurCss } from '../../shared/export/secuCss'
import { couleurHexPourCode } from '../editor/decorations'
import type { Annotation } from '../../shared/entretien/annotation'
import type { Categorie, Locuteur, Variable, RegleAnon, BrouillonAnon } from '../../shared/format'
import { cleEntite, scinderPseudos } from '../../shared/entretien/anon'

/** Une règle d'anonymisation à la forme SonalPi1 (`remplacement`/`remplacementAlt`). */
function formeSonalPi(entite: string, pseudos: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { entite, remplacement: pseudos[0] ?? '' }
  if (pseudos[1]) out.remplacementAlt = pseudos[1]
  return out
}

/** Reconstruit l'`anon-json` (tabAnon SonalPi1) depuis le MODÈLE,
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
      tab.push({ ...formeSonalPi(r.entite.join(' / '), r.pseudos), portee: 'corpus', ...(r.categorie ? { thematique: r.categorie } : {}) })
    }
  }
  for (const d of e.definitionsAnonLocales ?? []) {
    tab.push({ ...formeSonalPi(d.entite.join(' / '), d.pseudos), portee: d.etat === 'brouillon' ? 'brouillon' : 'document',
      ...(d.categorie ? { thematique: d.categorie } : {}), ...(d.etat === 'brouillon' ? { occurrences: 0 } : {}),
    })
  }
  for (const b of e.brouillonsAnon ?? []) {
    if (e.definitionsAnonLocales?.some((d) => cleEntite(d.entite.join('/')) === cleEntite(b.entite))) continue
    const pseudos = scinderPseudos(b.pseudo ?? '')
    tab.push({ ...formeSonalPi(b.entite, pseudos), portee: 'brouillon', occurrences: 0 })
  }
  return tab
}


/** Segments projetés → HTML du corps `.sonal` (fidèle au format SonalPi1 :
 *  rien n'est filtré, coordonnées et thématiques toujours émises). */
function serialiserFragmentSonal(segments: SegmentProjete[]): string {
  let html = ''
  for (const seg of segments) html += htmlDeSegment(seg, { time: true, thm: true })
  return html
}

/** Tables SonalPi1 dérivées du modèle : locuteurs, codebook et variables EAV.
 *  Avec `anonymer`, les tables ne transportent PLUS les identifiants réels :
 *  tabLoc porte les pseudos, les variables privées et leurs valeurs sont exclues. */
function tablesSonal(e: EntreeExport, anonymer = false) {
  // tabLoc : tableau indexé par index de locuteur (position 0 = vide). Le « ? »
  // de l'interviewer (convention SonalPi1) est réintroduit ICI — jamais au modèle.
  const maxIdx = e.locuteurs.reduce((m, l) => Math.max(m, l.index), 0)
  const tabLoc = Array.from({ length: maxIdx + 1 }, (_, i) => {
    const l = e.locuteurs.find((x) => x.index === i)
    if (!l) return ''
    if (anonymer) {
      // La pseudonymisation applique les pseudos configurés sans masquer les
      // autres locuteurs : leur nom reste explicitement en clair.
      return (pseudoUtilisable(l) ? l.pseudo!.trim() : l.nom) + (l.interviewer ? '?' : '')
    }
    return l.nom + (l.interviewer ? '?' : '')
  })

  // tabThm : codebook → forme SonalPi1, en PRÉ-ORDRE avec `rang`=profondeur →
  // chaque sous-thème suit son parent, la hiérarchie se relit sans perte à l'import.
  const parId = Object.fromEntries(e.codebook.map((c) => [c.id, c]))
  const tabThm = ordreThemes(parId).map(({ cat, profondeur }) => ({
    code: cat.codeExport,
    // Couleur stockée si présente, sinon synthétisée (même teinte qu'affichée) →
    // le codage reste VISIBLE dans SonalPi1 (le CSS .cat_XXX a besoin d'un HEX).
    // Seule une forme HEX valide est transportée (couleur importée hostile =
    // pas de couleur, donc pas d'injection dans le CSS du fichier).
    couleur: couleurCss(cat.couleur) || couleurHexPourCode(cat.codeExport),
    nom: cat.nom,
    taille: cat.taille ?? '',
    cmpct: false,
    rang: String(profondeur),
    act: cat.actif,
  }))

  // EAV : variables modélisées → tabVar/tabDic ; valeurs (entretien + locuteurs)
  // → tabDat (la sentinelle `l="all"` est réintroduite ici, jamais dans le modèle).
  // En pseudonymisé, les variables privées et leurs valeurs ne sortent pas.
  const visibles = anonymer ? e.variables.filter((v) => !v.priv) : e.variables
  const { tabVar, tabDic } = exporterVariables(visibles)
  const tabDat = exporterValeurs(e.meta.valeursGen, e.locuteurs, visibles)
  return { tabLoc, tabThm, tabVar, tabDic, tabDat }
}

/**
 *  Recompose un `.sonal` auto-suffisant, ouvrable dans SonalPi1.
 *  Le TEXTE, les CODAGES/ANON et les LOCUTEURS sont reconstruits depuis le modèle ;
 *  le codebook depuis le corpus ; les blocs non modélisés (règles d'anon, notes)
 *  sont ré-émis depuis le pass-through legacy (round-trip sans perte).
 */
export function exporterSonal(e: EntreeExport): string {
  const html = serialiserFragmentSonal(projeterSegments(e))
  return serializeSonal({
    ...tablesSonal(e),
    tabAnon: construireTabAnon(e),
    notes: e.legacy.notes,
    html,
  })
}

/** `.sonal` pseudonymisé : copie réimportable dans SonalPi1. Les pseudos
 *  configurés remplacent les occurrences et locuteurs concernés ; les autres
 *  éléments restent en clair. Les marqueurs d'occurrence, règles, anciennes
 *  notes privées et variables privées sont exclus. */
export function sonalPseudonymise(e: EntreeExport): string {
  const html = serialiserFragmentSonal(
    appliquerAnonymisation(projeterSegments(e), { garderLibelles: true }),
  )
  return serializeSonal({ ...tablesSonal(e, true), tabAnon: [], notes: '', html })
}
