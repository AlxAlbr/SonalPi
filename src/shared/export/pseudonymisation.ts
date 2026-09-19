import type { Note, Locuteur } from '../format'
import type { EntreeExport, FormatExport, OptionsExport } from './types'
import { optionsEfficaces } from './types'

/** Une ligne factuelle du rapport, avec un code stable pour les tests. */
export interface LigneRapportPseudonymisation {
  code: string
  message: string
}

/** Rapport facultatif décrivant la transformation, sans promesse d'anonymat. */
export interface RapportPseudonymisationExport {
  titre: string
  format: FormatExport
  appliquees: LigneRapportPseudonymisation[]
  conserves: LigneRapportPseudonymisation[]
  aVerifier: LigneRapportPseudonymisation[]
}

export interface OptionsRapportPseudonymisation {
  format: FormatExport
  options: OptionsExport
  titre: string
  notes?: Note[]
  mediaPresent?: boolean
}

/** Pseudo exploitable : non vide, différent du vrai nom, non refusé. */
export function pseudoUtilisable(l: Locuteur): boolean {
  const p = l.pseudo?.trim() ?? ''
  return p !== '' && l.pseudoEtat !== 'refuse' && p !== l.nom.trim()
}

/** Index des locuteurs réellement présents dans les blocs de texte. */
function locuteursDansLeTexte(e: EntreeExport): Set<number> {
  const doc = e.corpsTexte as { content?: Array<{ attrs?: { loc?: number | null } }> }
  const presents = new Set<number>()
  for (const b of doc.content ?? []) {
    const loc = b.attrs?.loc
    if (loc != null) presents.add(loc)
  }
  return presents
}

/** Index des locuteurs dont le nom est effectivement porté par le format. */
function locuteursInclus(
  e: EntreeExport,
  format: FormatExport,
  options: OptionsExport,
): Set<number> {
  if (format === 'sonal') return new Set(e.locuteurs.map((l) => l.index))

  const inclus = new Set<number>()
  if (options.loc) {
    for (const index of locuteursDansLeTexte(e)) inclus.add(index)
  }
  if (options.vars) {
    const variablesLocuteur = e.variables.filter((v) => !v.priv && v.portee === 'locuteur')
    for (const l of e.locuteurs) {
      if (variablesLocuteur.some((v) => {
        const valeur = l.valeursLoc[v.id]
        return valeur != null && v.modalites.some((m) => m.id === valeur)
      })) inclus.add(l.index)
    }
  }
  return inclus
}

function quantite(n: number, singulier: string, pluriel: string): string {
  return `${n} ${n === 1 ? singulier : pluriel}`
}

/** Produit un rapport non bloquant, adapté au contenu réellement demandé. */
export function etablirRapportPseudonymisation(
  e: EntreeExport,
  demande: OptionsRapportPseudonymisation,
): RapportPseudonymisationExport {
  const options = optionsEfficaces(demande.format, demande.options)
  const annotations = e.annotations.filter((a) => a.type === 'anon')
  const remplacees = annotations.filter(
    (a) => a.etat !== 'exception' && (a.pseudo?.trim() ?? '') !== '',
  ).length
  const sansPseudo = annotations.filter(
    (a) => a.etat !== 'exception' && (a.pseudo?.trim() ?? '') === '',
  ).length
  const exceptions = annotations.filter((a) => a.etat === 'exception').length

  const indicesLocuteurs = locuteursInclus(e, demande.format, options)
  const inclus = e.locuteurs.filter((l) => indicesLocuteurs.has(l.index))
  const locuteursAvecPseudo = e.locuteurs.filter(pseudoUtilisable).length
  const locuteursSansPseudo = e.locuteurs.length - locuteursAvecPseudo
  const pseudosUtilises = inclus.filter(pseudoUtilisable).length
  const nomsEnClair = inclus.length - pseudosUtilises
  const detailPseudos = inclus.length === 0
    ? "Aucun nom de locuteur n'est inclus avec les options choisies."
    : `${quantite(pseudosUtilises, 'pseudonyme est utilisé', 'pseudonymes sont utilisés')} dans cet export.`
  const detailNomsEnClair = inclus.length === 0
    ? ''
    : ` ${quantite(nomsEnClair, 'nom est inclus', 'noms sont inclus')} en clair dans cet export.`

  const appliquees: LigneRapportPseudonymisation[] = [
    {
      code: 'occurrences-remplacees',
      message: `${quantite(remplacees, 'occurrence remplacée par son pseudonyme', 'occurrences remplacées par leur pseudonyme')}.`,
    },
    {
      code: 'locuteurs-pseudonymises',
      message:
        `${quantite(locuteursAvecPseudo, 'locuteur possède', 'locuteurs possèdent')} un pseudonyme applicable. `
        + detailPseudos,
    },
  ]
  const conserves: LigneRapportPseudonymisation[] = [
    {
      code: 'occurrences-sans-pseudo',
      message: `${quantite(sansPseudo, 'occurrence sans pseudonyme conservée en clair', 'occurrences sans pseudonyme conservées en clair')}.`,
    },
    {
      code: 'exceptions',
      message: `${quantite(exceptions, 'exception laissée volontairement en clair', 'exceptions laissées volontairement en clair')}.`,
    },
    {
      code: 'locuteurs-en-clair',
      message:
        `${quantite(locuteursSansPseudo, 'locuteur reste', 'locuteurs restent')} sans pseudonyme applicable.`
        + detailNomsEnClair,
    },
  ]
  const aVerifier: LigneRapportPseudonymisation[] = [
    {
      code: 'champ-libre-transcription',
      message: "Le texte libre de la transcription n'est pas vérifié automatiquement.",
    },
  ]

  if (demande.titre.trim()) {
    aVerifier.push({
      code: 'champ-libre-titre',
      message: "Le titre de l'entretien est utilisé dans le nom du fichier et n'est pas vérifié automatiquement.",
    })
  }
  if (options.notes && demande.notes?.some((n) => n.statut === 'public')) {
    aVerifier.push({
      code: 'champ-libre-notes',
      message: 'Le contenu des notes publiques incluses n’est pas vérifié automatiquement.',
    })
  }
  if ((demande.format === 'sonal' || options.thm) && e.codebook.length > 0) {
    aVerifier.push({
      code: 'champ-libre-categories',
      message: 'Les noms des catégories incluses ne sont pas vérifiés automatiquement.',
    })
  }
  if (
    (demande.format === 'sonal' || options.vars)
    && e.variables.some((v) => !v.priv)
  ) {
    aVerifier.push({
      code: 'champ-libre-variables',
      message: 'Les libellés et modalités des variables publiques incluses ne sont pas vérifiés automatiquement.',
    })
  }
  if (
    (demande.format === 'sonal' || demande.format === 'html')
    && e.annotations.some((a) => a.type === 'commentaire')
  ) {
    aVerifier.push({
      code: 'champ-libre-commentaires',
      message: 'Le contenu et les auteurs des commentaires inclus ne sont pas vérifiés automatiquement.',
    })
  }
  if (demande.format === 'html' && !options.anon && demande.mediaPresent) {
    aVerifier.push({
      code: 'champ-libre-media',
      message: 'Le nom et le chemin du média inclus ne sont pas vérifiés automatiquement.',
    })
  }

  return {
    titre: demande.titre,
    format: demande.format,
    appliquees,
    conserves,
    aVerifier,
  }
}

function section(titre: string, lignes: LigneRapportPseudonymisation[]): string {
  const contenu = lignes.length > 0
    ? lignes.map((ligne) => `- ${ligne.message}`).join('\n')
    : '- Aucun élément à signaler.'
  return `${titre}\n${contenu}`
}

/** Version texte enregistrable du rapport facultatif. */
export function rapportEnTexte(r: RapportPseudonymisationExport): string {
  return [
    'Rapport de pseudonymisation',
    '',
    `Format : ${r.format.toUpperCase()}`,
    `Entretien : ${r.titre}`,
    '',
    "Ce rapport décrit les remplacements configurés. Il ne constitue pas une garantie d'anonymat.",
    '',
    section('Pseudonymisation appliquée', r.appliquees),
    '',
    section('Éléments conservés', r.conserves),
    '',
    section('Éléments à vérifier manuellement', r.aVerifier),
    '',
  ].join('\n')
}
