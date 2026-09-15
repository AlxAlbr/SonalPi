import { Schema, type Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { CorpusFichier, EntretienFichier } from '../../shared/format'

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'text*', attrs: { loc: { default: null } } },
    text: {},
  },
})

export type ModeTextePassage = 'pseudonymise' | 'original'

export type EtatResolutionPassage =
  | 'disponible'
  | 'repere-orphelin'
  | 'repere-introuvable'
  | 'entretien-hors-corpus'
  | 'source-indisponible'
  | 'source-invalide'

export type SourcePassageChargee =
  | { ok: true; data: EntretienFichier }
  | { ok: false; raison: string; invalide?: boolean }

export type SourcePassagePreparee =
  | { ok: true; data: EntretienFichier; doc: ProseMirrorNode }
  | { ok: false; raison: string; invalide?: boolean }

export interface SourcePassageReference {
  entretienId: string
  repereId: string
}

export interface PassageReferenceResolu {
  etat: EtatResolutionPassage
  titreEntretien: string
  texte: string | null
  locuteurs: string[]
  from: number | null
  to: number | null
  diagnostic: string | null
}

export function diagnosticPassage(
  etat: Exclude<EtatResolutionPassage, 'disponible'>,
): string {
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

/** Extrait un passage sans conserver le texte original dans la vue pseudonymisée. */
export function textePassage(
  doc: ProseMirrorNode,
  data: EntretienFichier,
  from: number,
  to: number,
  mode: ModeTextePassage,
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

/** Liste les locuteurs d'une plage selon le même mode de confidentialité que son texte. */
export function locuteursPassage(
  doc: ProseMirrorNode,
  data: EntretienFichier,
  from: number,
  to: number,
  mode: ModeTextePassage,
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

/** Parse chaque transcription chargée une seule fois pour toutes ses références. */
export function preparerSourcesPassages(
  sources: Map<string, SourcePassageChargee>,
): Map<string, SourcePassagePreparee> {
  const resultat = new Map<string, SourcePassagePreparee>()
  for (const [id, source] of sources) {
    if (!source.ok) {
      resultat.set(id, source)
      continue
    }
    try {
      resultat.set(id, { ok: true, data: source.data, doc: schema.nodeFromJSON(source.data.corpsTexte) })
    } catch {
      resultat.set(id, { ok: false, raison: 'Transcription invalide.', invalide: true })
    }
  }
  return resultat
}

/** Résout une référence de passage sans modifier sa source ni son repère. */
export function resoudrePassageReference(
  corpus: Pick<CorpusFichier, 'membership'>,
  reference: SourcePassageReference,
  sources: Map<string, SourcePassagePreparee>,
  mode: ModeTextePassage,
): PassageReferenceResolu {
  const titreEntretien = corpus.membership[reference.entretienId]?.titre ?? reference.entretienId
  const echec = (
    etat: Exclude<EtatResolutionPassage, 'disponible'>,
  ): PassageReferenceResolu => ({
    etat,
    titreEntretien,
    texte: null,
    locuteurs: [],
    from: null,
    to: null,
    diagnostic: diagnosticPassage(etat),
  })
  if (!corpus.membership[reference.entretienId]) return echec('entretien-hors-corpus')
  const source = sources.get(reference.entretienId)
  if (!source?.ok) return echec(source?.invalide ? 'source-invalide' : 'source-indisponible')
  const repere = (source.data.reperesPassages ?? [])
    .find((candidat) => candidat.id === reference.repereId)
  if (!repere) return echec('repere-introuvable')
  if (repere.from >= repere.to) return echec('repere-orphelin')
  if (repere.from < 0 || repere.to > source.doc.content.size) return echec('source-invalide')
  return {
    etat: 'disponible',
    titreEntretien,
    texte: textePassage(source.doc, source.data, repere.from, repere.to, mode),
    locuteurs: locuteursPassage(source.doc, source.data, repere.from, repere.to, mode),
    from: repere.from,
    to: repere.to,
    diagnostic: null,
  }
}
