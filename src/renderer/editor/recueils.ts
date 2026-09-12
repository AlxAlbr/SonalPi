import { Schema, type Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { CorpusFichier, EntretienFichier } from '../../shared/format'
import type { ItemRecueil, Recueil } from '../../shared/corpus/recueils'
import { estRepereOrphelin } from '../../shared/entretien/reperesPassages'

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'text*', attrs: { loc: { default: null } } },
    text: {},
  },
})

export type EtatResolutionPassage =
  | 'disponible'
  | 'repere-orphelin'
  | 'repere-introuvable'
  | 'entretien-hors-corpus'
  | 'source-indisponible'
  | 'source-invalide'

export type SourceRecueilChargee =
  | { ok: true; data: EntretienFichier }
  | { ok: false; raison: string; invalide?: boolean }

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

export interface ProjectionRecueil {
  recueilId: string
  nom: string
  modeTexte: Recueil['modeTexte']
  items: ItemRecueilProjete[]
  problemes: number
}

function diagnostic(etat: Exclude<EtatResolutionPassage, 'disponible'>): string {
  if (etat === 'repere-orphelin') return "Le texte couvert par ce passage n'est plus disponible."
  if (etat === 'repere-introuvable') return "Le repère de ce passage n'existe plus dans l'entretien."
  if (etat === 'entretien-hors-corpus') return "L'entretien ne fait plus partie du corpus."
  if (etat === 'source-indisponible') return 'La source est momentanément indisponible.'
  return 'La source ou la plage du passage est invalide.'
}

function intervallesAnon(data: EntretienFichier, from: number, to: number) {
  const candidats = data.annotations
    .filter((annotation) => annotation.type === 'anon'
      && annotation.etat !== 'exception'
      && annotation.from < to
      && annotation.to > from
      && annotation.from < annotation.to)
    .map((annotation) => ({
      from: Math.max(from, annotation.from),
      to: Math.min(to, annotation.to),
      pseudo: annotation.pseudo?.trim() || '[anonymisé]',
      largeur: annotation.to - annotation.from,
    }))
    .sort((a, b) => a.from - b.from || b.largeur - a.largeur)
  const resultat: typeof candidats = []
  for (const candidat of candidats) {
    const precedent = resultat[resultat.length - 1]
    if (!precedent || candidat.from >= precedent.to) {
      resultat.push(candidat)
    } else {
      precedent.to = Math.max(precedent.to, candidat.to)
      const pseudos = new Set(precedent.pseudo.split(' / '))
      pseudos.add(candidat.pseudo)
      precedent.pseudo = [...pseudos].join(' / ')
      precedent.largeur = Math.max(precedent.largeur, candidat.largeur)
    }
  }
  return resultat
}

/** Extrait un passage sans conserver le texte original dans la projection pseudonymisée. */
export function textePassage(
  doc: ProseMirrorNode,
  data: EntretienFichier,
  from: number,
  to: number,
  mode: Recueil['modeTexte'],
): string {
  if (mode === 'original') return doc.textBetween(from, to, ' ')
  const intervalles = intervallesAnon(data, from, to)
  if (!intervalles.length) return doc.textBetween(from, to, ' ')
  const morceaux: string[] = []
  let curseur = from
  for (const intervalle of intervalles) {
    if (intervalle.from > curseur) morceaux.push(doc.textBetween(curseur, intervalle.from, ' '))
    morceaux.push(intervalle.pseudo)
    curseur = Math.max(curseur, intervalle.to)
  }
  if (curseur < to) morceaux.push(doc.textBetween(curseur, to, ' '))
  return morceaux.join('')
}

function locuteursPassage(
  doc: ProseMirrorNode,
  data: EntretienFichier,
  from: number,
  to: number,
  mode: Recueil['modeTexte'],
): string[] {
  const indexes = new Set<number>()
  doc.nodesBetween(from, to, (node) => {
    if (node.type.name === 'paragraph' && typeof node.attrs.loc === 'number') {
      indexes.add(node.attrs.loc)
    }
  })
  return [...indexes].map((index) => {
    const locuteur = data.locuteurs.find((candidat) => candidat.index === index)
    if (!locuteur) return `loc ${index}`
    if (mode === 'pseudonymise' && locuteur.pseudoEtat !== 'refuse' && locuteur.pseudo?.trim()) {
      return locuteur.pseudo.trim()
    }
    return locuteur.nom
  })
}

/** Résout toutes les références depuis un ensemble de sources déjà chargé une fois. */
export function projeterRecueil(
  corpus: Pick<CorpusFichier, 'membership'>,
  recueil: Recueil,
  sources: Map<string, SourceRecueilChargee>,
): ProjectionRecueil {
  let problemes = 0
  const items = recueil.items.map((item): ItemRecueilProjete => {
    if (item.type !== 'passage') return structuredClone(item)
    const titreEntretien = corpus.membership[item.source.entretienId]?.titre ?? item.source.entretienId
    const echec = (etat: Exclude<EtatResolutionPassage, 'disponible'>): ItemRecueilProjete => {
      problemes += 1
      return {
        ...structuredClone(item),
        etat,
        titreEntretien,
        texte: null,
        locuteurs: [],
        from: null,
        to: null,
        diagnostic: diagnostic(etat),
      }
    }
    if (!corpus.membership[item.source.entretienId]) return echec('entretien-hors-corpus')
    const source = sources.get(item.source.entretienId)
    if (!source?.ok) return echec(source?.invalide ? 'source-invalide' : 'source-indisponible')
    const repere = (source.data.reperesPassages ?? [])
      .find((candidat) => candidat.id === item.source.repereId)
    if (!repere) return echec('repere-introuvable')
    if (estRepereOrphelin(repere)) return echec('repere-orphelin')
    try {
      const doc = schema.nodeFromJSON(source.data.corpsTexte)
      if (repere.from < 0 || repere.to > doc.content.size || repere.from >= repere.to) {
        return echec('source-invalide')
      }
      return {
        ...structuredClone(item),
        etat: 'disponible',
        titreEntretien,
        texte: textePassage(doc, source.data, repere.from, repere.to, recueil.modeTexte),
        locuteurs: locuteursPassage(doc, source.data, repere.from, repere.to, recueil.modeTexte),
        from: repere.from,
        to: repere.to,
        diagnostic: null,
      }
    } catch {
      return echec('source-invalide')
    }
  })
  return { recueilId: recueil.id, nom: recueil.nom, modeTexte: recueil.modeTexte, items, problemes }
}

const lignesCitation = (texte: string): string => texte.split(/\r?\n/).map((ligne) => `> ${ligne}`).join('\n')

/** Matérialise une projection déjà résolue, sans relire les sources. */
export function exporterRecueilMarkdown(
  projection: ProjectionRecueil,
  options: { commentaires: boolean; sources: boolean; date: string; incomplet: boolean },
): string {
  if (projection.problemes && !options.incomplet) {
    throw new Error("L'export est bloqué car certains passages sont indisponibles.")
  }
  const lignes = [`# ${projection.nom}`, '', `_Export du ${options.date} — mode ${projection.modeTexte}._`, '']
  for (const item of projection.items) {
    if (item.type === 'titre') lignes.push(`${'#'.repeat(item.niveau)} ${item.libelle}`, '')
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
  options: { commentaires: boolean; sources: boolean; date: string; incomplet: boolean },
): string {
  if (projection.problemes && !options.incomplet) {
    throw new Error("L'export est bloqué car certains passages sont indisponibles.")
  }
  const lignes = [projection.nom.toUpperCase(), `Export du ${options.date} — mode ${projection.modeTexte}`, '']
  for (const item of projection.items) {
    if (item.type === 'titre') lignes.push(`${'='.repeat(item.niveau)} ${item.libelle}`, '')
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
