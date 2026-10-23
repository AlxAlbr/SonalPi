import { Schema, type Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EntretienFichier, EntretienRef, Locuteur } from '../../shared/format'
import type { Annotation } from '../../shared/entretien/annotation'
import { projeterPortionsAnon } from '../../shared/entretien/anon/projectionTexte'
import type { OccurrenceLexico } from '../../shared/lexico/types'

const schemaLexico = new Schema({
  nodes: {
    doc: { content: 'block*' },
    paragraph: { group: 'block', content: 'inline*', attrs: { loc: { default: null } } },
    text: { group: 'inline' },
    hardBreak: { group: 'inline', inline: true },
  },
})

const MOT = /[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu

interface FragmentTexte {
  from: number
  to: number
  texte: string
  locuteurIndex: number | null
}

interface PlageAnon {
  from: number
  to: number
  pseudo: string
  annotation: Annotation
}

interface PlageBloc {
  from: number
  to: number
  locuteurIndex: number | null
}

function plagesAnon(data: EntretienFichier, from: number, to: number): PlageAnon[] {
  // Une décision visible reste une seule occurrence lexicale.
  const parAnnotation = new Map<Annotation, PlageAnon>()
  for (const portion of projeterPortionsAnon(data.annotations, { from, to })) {
    const annotation = portion.annotation
    const pseudo = annotation?.etat === 'exception' ? '' : annotation?.pseudo?.trim() ?? ''
    if (!annotation || !pseudo) continue
    const existante = parAnnotation.get(annotation)
    if (existante) {
      existante.from = Math.min(existante.from, portion.from)
      existante.to = Math.max(existante.to, portion.to)
    } else {
      parAnnotation.set(annotation, { ...portion, annotation, pseudo })
    }
  }
  return [...parAnnotation.values()].sort((a, b) =>
    a.from - b.from || a.to - b.to || a.annotation.id.localeCompare(b.annotation.id))
}

function locuteurPourIndex(data: EntretienFichier, index: number | null): Locuteur | null {
  return index === null ? null : data.locuteurs.find((locuteur) => locuteur.index === index) ?? null
}

function creerOccurrence(params: {
  texte: string
  from: number
  to: number
  locuteurIndex: number | null
  pseudonyme: boolean
  ordre: number
  entretienId: string
  reference: EntretienRef
  data: EntretienFichier
}): OccurrenceLexico {
  const locuteur = locuteurPourIndex(params.data, params.locuteurIndex)
  const themeIds = [...new Set(params.data.annotations
    .filter((annotation) => annotation.type === 'codage'
      && annotation.code
      && annotation.from < params.to
      && annotation.to > params.from)
    .map((annotation) => annotation.code!))]
  return {
    id: `${params.entretienId}:${params.from}:${params.to}:${params.ordre}`,
    forme: params.texte.toLocaleLowerCase('fr'),
    texte: params.texte,
    entretienId: params.entretienId,
    titreEntretien: params.reference.titre,
    from: params.from,
    to: params.to,
    locuteurIndex: params.locuteurIndex,
    personneId: locuteur?.personneRef ?? null,
    interviewer: locuteur?.interviewer === true,
    valeursEntretien: { ...(params.data.meta?.valeursGen ?? {}) },
    valeursLocuteur: locuteur ? { ...(locuteur.valeursLoc ?? {}) } : null,
    themeIds,
    avant: '',
    apres: '',
    pseudonyme: params.pseudonyme,
  }
}

/** Extrait les formes pseudonymisées tout en gardant leurs positions source. */
export function extraireOccurrencesLexico(
  entretienId: string,
  reference: EntretienRef,
  data: EntretienFichier,
): OccurrenceLexico[] {
  const doc = schemaLexico.nodeFromJSON(data.corpsTexte)
  const blocs: PlageBloc[] = []
  const fragments: FragmentTexte[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') {
      blocs.push({
        from: pos + 1,
        to: pos + 1 + node.content.size,
        locuteurIndex: typeof node.attrs.loc === 'number' ? node.attrs.loc as number : null,
      })
      return true
    }
    if (!node.isText || !node.text) return true
    const bloc = [...blocs].reverse().find((candidate) => pos >= candidate.from && pos <= candidate.to)
    fragments.push({
      from: pos,
      to: pos + node.text.length,
      texte: node.text,
      locuteurIndex: bloc?.locuteurIndex ?? null,
    })
    return false
  })

  const debutTexte = fragments.length ? Math.min(...fragments.map((fragment) => fragment.from)) : 0
  const finTexte = fragments.length ? Math.max(...fragments.map((fragment) => fragment.to)) : 0
  const anonymisations = plagesAnon(data, debutTexte, finTexte)
  const occurrences: OccurrenceLexico[] = []
  let ordre = 0
  for (const fragment of fragments) {
    const coupures = anonymisations.filter((plage) => plage.from < fragment.to && plage.to > fragment.from)
    let curseur = fragment.from
    const ajouterTexte = (from: number, to: number) => {
      if (from >= to) return
      const texte = fragment.texte.slice(from - fragment.from, to - fragment.from)
      MOT.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = MOT.exec(texte))) {
        occurrences.push(creerOccurrence({
          texte: match[0],
          from: from + match.index,
          to: from + match.index + match[0].length,
          locuteurIndex: fragment.locuteurIndex,
          pseudonyme: false,
          ordre: ordre++, entretienId, reference, data,
        }))
      }
    }
    for (const coupure of coupures) {
      ajouterTexte(curseur, Math.max(curseur, Math.min(fragment.to, coupure.from)))
      curseur = Math.max(curseur, Math.min(fragment.to, coupure.to))
    }
    ajouterTexte(curseur, fragment.to)
  }

  for (const plage of anonymisations) {
    const fragmentsCouverts = fragments.filter((fragment) => fragment.from < plage.to && fragment.to > plage.from)
    if (!fragmentsCouverts.length) continue
    const locuteurs = new Set(fragmentsCouverts.map((fragment) => fragment.locuteurIndex))
    occurrences.push(creerOccurrence({
      texte: plage.pseudo,
      from: plage.from,
      to: plage.to,
      locuteurIndex: locuteurs.size === 1 ? [...locuteurs][0] : null,
      pseudonyme: true,
      ordre: ordre++, entretienId, reference, data,
    }))
  }

  occurrences.sort((a, b) => a.from - b.from || a.to - b.to || a.id.localeCompare(b.id))
  for (let index = 0; index < occurrences.length; index++) {
    occurrenceAvecContexte(occurrences, index)
  }
  return occurrences
}

function occurrenceAvecContexte(occurrences: OccurrenceLexico[], index: number): void {
  const occurrence = occurrences[index]
  occurrence.avant = occurrences.slice(Math.max(0, index - 10), index)
    .map((candidate) => candidate.texte).join(' ')
  occurrence.apres = occurrences.slice(index + 1, index + 11)
    .map((candidate) => candidate.texte).join(' ')
}
