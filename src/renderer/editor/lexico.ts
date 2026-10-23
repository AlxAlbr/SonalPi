import { Schema, type Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EntretienFichier, EntretienRef, Locuteur } from '../../shared/format'
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
}

interface PlageBloc {
  from: number
  to: number
  locuteurIndex: number | null
}

function plagesAnon(data: EntretienFichier): PlageAnon[] {
  const candidates = data.annotations
    .filter((annotation) => annotation.type === 'anon'
      && annotation.etat !== 'exception'
      && annotation.from < annotation.to)
    .map((annotation) => ({
      from: annotation.from,
      to: annotation.to,
      pseudo: annotation.pseudo?.trim() || '[anonymisé]',
    }))
    .sort((a, b) => a.from - b.from || b.to - a.to)
  const reunies: PlageAnon[] = []
  for (const candidate of candidates) {
    const precedente = reunies.at(-1)
    if (!precedente || candidate.from >= precedente.to) {
      reunies.push({ ...candidate })
      continue
    }
    precedente.to = Math.max(precedente.to, candidate.to)
    if (!precedente.pseudo.split(' / ').includes(candidate.pseudo)) {
      precedente.pseudo += ` / ${candidate.pseudo}`
    }
  }
  return reunies
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

  const anonymisations = plagesAnon(data)
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
