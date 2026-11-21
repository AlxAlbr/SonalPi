import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EntretienRef } from '../../shared/format'
import type { EntretienFichier, Variable } from "../../shared/format"
import type { ParticipationLocuteur } from '../../shared/locuteurs'
import type { ExtraitSynthese, ExtraitSyntheseBrut, SourceMoteurSynthese, TourSynthese } from '../../shared/synthese/types'
import {
  locuteursPassage,
  textePassage,
  type ModeTextePassage,
  type SourcePassagePreparee,
} from './passages'

type ParticipationSourceSynthese = Pick<ParticipationLocuteur, 'index' | 'nom' | 'locuteurRef' | 'interviewer' | 'valeursLoc'>
  & Partial<Pick<ParticipationLocuteur, 'id'>>

export interface SourceSynthesePreparee {
  doc: ProseMirrorNode
  data: Pick<EntretienFichier, 'annotations' | 'meta'> & { participations: readonly ParticipationSourceSynthese[] }
}

/** Prépare les plages du moteur sans fabriquer un id depuis l'index du texte. */
export function sourceMoteurSynthese(
  entretienId: string,
  reference: EntretienRef,
  source: SourceSynthesePreparee,
  ordre: number,
): SourceMoteurSynthese {
  const tours: TourSynthese[] = []
  source.doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') return true
    const index = typeof node.attrs.loc === 'number' ? node.attrs.loc as number : null
    const participation = index === null ? null : source.data.participations.find((item) => item.index === index) ?? null
    tours.push({
      from: pos + 1,
      to: pos + 1 + node.content.size,
      participationIndex: index,
      participationId: participation?.id ?? null,
      locuteurId: participation?.locuteurRef ?? null,
      interviewer: participation?.interviewer === true,
      valeursParticipation: participation ? { ...(participation.valeursLoc ?? {}) } : null,
    })
    return true
  })
  return {
    entretienId,
    titreEntretien: reference.titre,
    longueurSource: source.doc.content.size,
    ordre,
    valeursEntretien: { ...(source.data.meta?.valeursGen ?? {}) },
    contributions: source.data.annotations.flatMap((annotation) => {
      if (annotation.type !== 'codage' || !annotation.code || annotation.from >= annotation.to
        || annotation.from < 0 || annotation.to > source.doc.content.size) return []
      return [{
        from: annotation.from,
        to: annotation.to,
        themeIds: [annotation.code],
        annotationIds: [annotation.id],
      }]
    }),
    tours,
  }
}

/** Projette uniquement le mode visible ; l'autre version du texte n'est pas conservée. */
export function projeterExtraitsSynthese(
  extraits: ExtraitSyntheseBrut[],
  sources: Map<string, SourcePassagePreparee>,
  mode: ModeTextePassage,
  contexte = 160,
): ExtraitSynthese[] {
  return extraits.flatMap((extrait) => {
    const source = sources.get(extrait.entretienId)
    if (!source?.ok) return []
    const avantFrom = Math.max(0, extrait.from - contexte)
    const apresTo = Math.min(source.doc.content.size, extrait.to + contexte)
    return [{
      ...extrait,
      texte: textePassage(source.doc, source.data, extrait.from, extrait.to, mode),
      avant: textePassage(source.doc, source.data, avantFrom, extrait.from, mode).trim(),
      apres: textePassage(source.doc, source.data, extrait.to, apresTo, mode).trim(),
      locuteurs: locuteursPassage(source.doc, source.data.participations, extrait.from, extrait.to, mode),
    }]
  })
}

export function diagnosticsValeursSynthese(
  source: SourceSynthesePreparee,
  variables: readonly Variable[],
): string[] {
  const erreurs: string[] = []
  const verifier = (valeurs: Record<string, string>, portee: Variable['portee'], suffixe = '') => {
    for (const [variableId, modaliteId] of Object.entries(valeurs)) {
      const variable = variables.find((candidate) => candidate.id === variableId)
      if (!variable || variable.portee !== portee || !variable.modalites.some((modalite) => modalite.id === modaliteId)) {
        erreurs.push(`${variable?.lib ?? variableId}${suffixe}`)
      }
    }
  }
  verifier(source.data.meta?.valeursGen ?? {}, 'entretien')
  for (const participation of source.data.participations) verifier(participation.valeursLoc ?? {}, 'participation', ` (${participation.nom})`)
  return [...new Set(erreurs)]
}
