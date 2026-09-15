import type { CorpusFichier } from '../../shared/format'
import type { ItemRecueil, Recueil } from '../../shared/corpus/recueils'
import { numeroterTitres, type StyleNumerotation } from '../../shared/corpus/numerotation'
import {
  preparerSourcesPassages,
  resoudrePassageReference,
  type EtatResolutionPassage,
  type SourcePassageChargee,
} from './passages'

export { textePassage } from './passages'
export type { EtatResolutionPassage } from './passages'
export type SourceRecueilChargee = SourcePassageChargee

export type ItemRecueilProjete =
  | Extract<ItemRecueil, { type: 'titre' | 'texte' }>
  | {
      id: string
      type: 'passage'
      commentaireEditorial: string
      source: Extract<ItemRecueil, { type: 'passage' }>['source']
      etat: EtatResolutionPassage
      titreEntretien: string
      texte: string | null
      locuteurs: string[]
      from: number | null
      to: number | null
      diagnostic: string | null
    }

export type { StyleNumerotation } from '../../shared/corpus/numerotation'

export interface ProjectionRecueil {
  recueilId: string
  nom: string
  modeTexte: Recueil['modeTexte']
  items: ItemRecueilProjete[]
  problemes: number
}

/** Résout toutes les références depuis un ensemble de sources déjà chargé une fois. */
export function projeterRecueil(
  corpus: Pick<CorpusFichier, 'membership'>,
  recueil: Recueil,
  sources: Map<string, SourceRecueilChargee>,
): ProjectionRecueil {
  let problemes = 0
  const sourcesPreparees = preparerSourcesPassages(sources)
  const items = recueil.items.map((item): ItemRecueilProjete => {
    if (item.type !== 'passage') return structuredClone(item)
    const resolution = resoudrePassageReference(
      corpus,
      item.source,
      sourcesPreparees,
      recueil.modeTexte,
    )
    if (resolution.etat !== 'disponible') problemes += 1
    return { ...structuredClone(item), ...resolution }
  })
  return { recueilId: recueil.id, nom: recueil.nom, modeTexte: recueil.modeTexte, items, problemes }
}

const lignesCitation = (texte: string): string => texte.split(/\r?\n/).map((ligne) => `> ${ligne}`).join('\n')

/** Matérialise une projection déjà résolue, sans relire les sources. */
export function exporterRecueilMarkdown(
  projection: ProjectionRecueil,
  options: {
    commentaires: boolean
    sources: boolean
    date: string
    incomplet: boolean
    numerotation: StyleNumerotation
  },
): string {
  if (projection.problemes && !options.incomplet) {
    throw new Error("L'export est bloqué car certains passages sont indisponibles.")
  }
  const numeros = numeroterTitres(projection.items, options.numerotation)
  const lignes = [`# ${projection.nom}`, '', `_Export du ${options.date} — mode ${projection.modeTexte}._`, '']
  for (const item of projection.items) {
    if (item.type === 'titre') {
      const numero = numeros[item.id]
      lignes.push(`${'#'.repeat(item.niveau)} ${numero ? `${numero} ` : ''}${item.libelle}`, '')
    }
    else if (item.type === 'texte') lignes.push(item.texte, '')
    else if (item.etat !== 'disponible') {
      lignes.push(`> ⚠ ${item.diagnostic}`, '')
    } else {
      if (options.sources) {
        const locuteurs = item.locuteurs.length ? ` — ${item.locuteurs.join(', ')}` : ''
        lignes.push(`*${item.titreEntretien}${locuteurs}*`, '')
      }
      lignes.push(lignesCitation(item.texte ?? ''), '')
      if (options.commentaires && item.commentaireEditorial.trim()) {
        lignes.push(`Commentaire : ${item.commentaireEditorial.trim()}`, '')
      }
    }
  }
  return lignes.join('\n').trimEnd() + '\n'
}

/** Produit la variante texte brut depuis la même projection immuable. */
export function exporterRecueilTexte(
  projection: ProjectionRecueil,
  options: {
    commentaires: boolean
    sources: boolean
    date: string
    incomplet: boolean
    numerotation: StyleNumerotation
  },
): string {
  if (projection.problemes && !options.incomplet) {
    throw new Error("L'export est bloqué car certains passages sont indisponibles.")
  }
  const numeros = numeroterTitres(projection.items, options.numerotation)
  const lignes = [projection.nom.toUpperCase(), `Export du ${options.date} — mode ${projection.modeTexte}`, '']
  for (const item of projection.items) {
    if (item.type === 'titre') {
      const numero = numeros[item.id]
      lignes.push(numero
        ? `${'  '.repeat(item.niveau - 1)}${numero} ${item.libelle}`
        : `${'='.repeat(item.niveau)} ${item.libelle}`, '')
    }
    else if (item.type === 'texte') lignes.push(item.texte, '')
    else if (item.etat !== 'disponible') lignes.push(`[${item.diagnostic}]`, '')
    else {
      if (options.sources) {
        const locuteurs = item.locuteurs.length ? ` — ${item.locuteurs.join(', ')}` : ''
        lignes.push(`${item.titreEntretien}${locuteurs}`)
      }
      lignes.push(item.texte ?? '', '')
      if (options.commentaires && item.commentaireEditorial.trim()) {
        lignes.push(`Commentaire : ${item.commentaireEditorial.trim()}`, '')
      }
    }
  }
  return lignes.join('\n').trimEnd() + '\n'
}
