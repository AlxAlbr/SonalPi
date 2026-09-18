import { projeterSegments } from './projection'
import type { EntreeExport } from './exportSonal'
import type { Locuteur } from '../../shared/format'

// ----------------------------------------------------------------
// AUDIT DE PSEUDONYMISATION — rapport AVANT génération
// ----------------------------------------------------------------
// Un export « pseudonymisé » ne doit jamais laisser passer un identifiant
// réel. L'audit parcourt le modèle et la projection AVANT tout formatage :
// ce qui est automatiquement vérifiable est BLOQUANT (mode strict) ou
// AVERTISSEMENT (mode partiel) ; ce qui ne l'est pas (champs libres) est
// toujours signalé comme AVERTISSEMENT.
//
// Deux modes :
// - STRICT (défaut) : l'export est refusé tant qu'une occurrence à
//   pseudonymiser ou un locuteur affiché n'a pas de pseudo exploitable.
// - PARTIEL : seuls les pseudonymes configurés sont appliqués ; le fichier
//   produit peut encore contenir des noms réels — jamais présenté comme
//   anonymisé.

export type ModePseudonymisation = 'strict' | 'partiel'

/** Un problème détecté avant génération, présentable tel quel dans l'interface. */
export interface ProblemeExport {
  /** Code machine (test, journalisation) : 'occurrence-sans-pseudo',
   *  'locuteur-sans-pseudo', 'chemin-libre'… */
  code: string
  /** Message lisible par l'utilisateur, sans détail technique. */
  message: string
}

export interface RapportPseudonymisationExport {
  bloquants: ProblemeExport[]
  avertissements: ProblemeExport[]
}

export interface OptionsAuditPseudonymisation {
  mode: ModePseudonymisation
  /** Le format visé affiche-t-il des libellés de locuteurs ? (faux : les
   *  coordonnées sortent sans noms — pas de fuite possible par ce canal). */
  locuteursInclus?: boolean
  /** Notes structurées destinées au format (seules les publiques sortent) :
   *  leur TEXT est un champ libre non inspectable automatiquement. */
  notes?: Array<{ statut: string }>
  /** Le format porte-t-il un lecteur de média local ? */
  media?: boolean
  /** Titre affiché dans le format (champ libre non inspectable). */
  titre?: string
}

/** Pseudo exploitable : non vide, différent du vrai nom, non refusé. */
export function pseudoUtilisable(l: Locuteur): boolean {
  const p = l.pseudo?.trim() ?? ''
  return p !== '' && l.pseudoEtat !== 'refuse' && p !== l.nom.trim()
}

/** Index des locuteurs réellement présents dans le texte (blocs porteurs). */
function locuteursAffiches(e: EntreeExport): Set<number> {
  const doc = e.corpsTexte as { content?: Array<{ attrs?: { loc?: number | null } }> }
  const presents = new Set<number>()
  for (const b of doc.content ?? []) {
    const loc = b.attrs?.loc
    if (loc != null) presents.add(loc)
  }
  return presents
}

/** Occurrences anonymisées (hors exceptions) sans pseudo exploitable. */
function occurrencesSansPseudo(e: EntreeExport): number {
  let n = 0
  for (const seg of projeterSegments(e)) {
    for (const f of seg.fragments) {
      if (f.anon && f.anon.etat === 'anonymise' && (f.anon.pseudo == null || f.anon.pseudo.trim() === '')) n++
    }
  }
  return n
}

/** Établit le rapport complet pour l'entretien et le mode demandés. Le mode
 *  ne change PAS le contenu du rapport, seulement ce qui est bloquant : en
 *  partiel, les bloquants restent visibles (l'appelant les traite en
 *  avertissements) — le rapport pré-génération est toujours produit. */
export function auditerPseudonymisation(
  e: EntreeExport,
  opts: OptionsAuditPseudonymisation,
): RapportPseudonymisationExport {
  const strict = opts.mode === 'strict'
  const bloquants: ProblemeExport[] = []
  const avertissements: ProblemeExport[] = []

  const push = (bloque: boolean, code: string, message: string): void => {
    ;(bloque ? bloquants : avertissements).push({ code, message })
  }

  // Occurrences anonymisées sans pseudo : elles resteraient EN CLAIR.
  const nOccurrences = occurrencesSansPseudo(e)
  if (nOccurrences > 0) {
    push(
      strict,
      'occurrence-sans-pseudo',
      `${nOccurrences} occurrence${nOccurrences > 1 ? 's' : ''} à anonymiser n'${nOccurrences > 1 ? 'ont' : 'a'} pas de pseudonyme.`,
    )
  }

  // Locuteurs affichés sans pseudo exploitable : leur vrai nom sortirait.
  if (opts.locuteursInclus !== false) {
    const presents = locuteursAffiches(e)
    for (const l of e.locuteurs) {
      if (!presents.has(l.index)) continue
      if (!pseudoUtilisable(l)) {
        push(strict, 'locuteur-sans-pseudo', `Le locuteur « ${l.nom} » n'a pas de pseudonyme utilisable.`)
      }
    }
  }

  // Champs libres : jamais inspectables automatiquement → avertissements.
  if (opts.titre?.trim()) {
    avertissements.push({
      code: 'champ-libre-titre',
      message: "Le titre de l'entretien n'est pas vérifié automatiquement.",
    })
  }
  if (opts.notes?.some((n) => n.statut === 'public')) {
    avertissements.push({
      code: 'champ-libre-notes',
      message: 'Le contenu des notes publiques n’est pas vérifié automatiquement.',
    })
  }
  if (e.codebook.length > 0) {
    avertissements.push({
      code: 'champ-libre-categories',
      message: 'Les noms de catégories ne sont pas vérifiés automatiquement.',
    })
  }
  if (e.variables.some((v) => !v.priv)) {
    avertissements.push({
      code: 'champ-libre-variables',
      message: 'Les libellés de variables et de modalités ne sont pas vérifiés automatiquement.',
    })
  }
  for (const ann of e.annotations) {
    if (ann.type === 'commentaire') {
      avertissements.push({
        code: 'champ-libre-commentaires',
        message: 'Le contenu des commentaires n’est pas vérifié automatiquement.',
      })
      break
    }
  }
  if (opts.media) {
    avertissements.push({
      code: 'champ-libre-media',
      message: 'Le nom et le chemin du média ne sont pas vérifiés automatiquement.',
    })
  }

  return { bloquants, avertissements }
}

/** Rapport en texte lisible (modale, journal) : bloquants puis avertissements. */
export function rapportEnTexte(r: RapportPseudonymisationExport): string {
  return [...r.bloquants, ...r.avertissements].map((p) => p.message).join('\n')
}
