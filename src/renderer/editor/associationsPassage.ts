import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EntretienFichier, Variable } from '../../shared/format'
import { membresPersonnesRegle, type Cas } from '../../shared/corpus/cas'
import type { Recueil } from '../../shared/corpus/recueils'
import { preparerSourcesPassages } from './passages'

export type CorrespondanceAssociation =
  | 'exacte'
  | 'selection-dans-passage'
  | 'passage-dans-selection'
  | 'chevauchement'

export interface AssociationCasPassage {
  id: string
  nom: string
  manuel: boolean
  raisonsAutomatiques: string[]
  correspondances: CorrespondanceAssociation[]
}

export interface OccurrenceRecueilPassage {
  itemId: string
  correspondance: CorrespondanceAssociation
}

export interface AssociationRecueilPassage {
  id: string
  nom: string
  occurrences: OccurrenceRecueilPassage[]
}

export interface ResumeAssociationsPassage {
  cas: AssociationCasPassage[]
  recueils: AssociationRecueilPassage[]
  problemes: string[]
}

interface Plage {
  from: number
  to: number
}

function correspondance(selection: Plage, passage: Plage): CorrespondanceAssociation | null {
  if (selection.to <= passage.from || passage.to <= selection.from) return null
  if (selection.from === passage.from && selection.to === passage.to) return 'exacte'
  if (passage.from <= selection.from && passage.to >= selection.to) return 'selection-dans-passage'
  if (selection.from <= passage.from && selection.to >= passage.to) return 'passage-dans-selection'
  return 'chevauchement'
}

function interventions(
  doc: ProseMirrorNode,
  locuteursRetenus: Set<number>,
): Plage[] {
  const resultat: Plage[] = []
  let courante: (Plage & { locuteurIndex: number }) | null = null
  const terminer = () => {
    if (courante && courante.from < courante.to) resultat.push(courante)
    courante = null
  }
  doc.forEach((node, offset) => {
    const locuteurIndex = typeof node.attrs.loc === 'number' ? node.attrs.loc as number : null
    if (node.type.name !== 'paragraph' || locuteurIndex === null || !locuteursRetenus.has(locuteurIndex)) {
      terminer()
      return
    }
    const from = offset + 1
    const to = from + node.content.size
    if (courante?.locuteurIndex === locuteurIndex) courante.to = to
    else {
      terminer()
      courante = { from, to, locuteurIndex }
    }
  })
  terminer()
  return resultat
}

function ajouterCorrespondance(
  correspondances: CorrespondanceAssociation[],
  selection: Plage,
  passage: Plage,
): boolean {
  const relation = correspondance(selection, passage)
  if (!relation) return false
  if (!correspondances.includes(relation)) correspondances.push(relation)
  return true
}

/** Résume les objets qui couvrent tout ou partie de la sélection courante. */
export function resumerAssociationsPassage(params: {
  entretienId: string
  source: EntretienFichier
  selection: Plage
  cas: Record<string, Cas>
  recueils: Record<string, Recueil>
  variables: Variable[]
  personnesConnues: Set<string> | null
}): ResumeAssociationsPassage {
  const problemes = new Set<string>()
  const preparee = preparerSourcesPassages(new Map([
    [params.entretienId, { ok: true as const, data: params.source }],
  ])).get(params.entretienId)
  if (!preparee?.ok) {
    return {
      cas: [],
      recueils: [],
      problemes: ['Le passage ouvert ne peut pas être vérifié.'],
    }
  }

  const reperes = new Map((params.source.reperesPassages ?? []).map((repere) => [repere.id, repere]))
  const variables = new Map(params.variables.map((variable) => [variable.id, variable]))
  const cas: AssociationCasPassage[] = []

  for (const courant of Object.values(params.cas)) {
    const resultat: AssociationCasPassage = {
      id: courant.id,
      nom: courant.nom,
      manuel: false,
      raisonsAutomatiques: [],
      correspondances: [],
    }

    for (const rattachement of courant.rattachements) {
      if (rattachement.source.entretienId !== params.entretienId) continue
      const repere = reperes.get(rattachement.source.repereId)
      if (!repere || repere.from >= repere.to) {
        problemes.add(`Un ajout manuel du cas « ${courant.nom} » ne peut pas être situé.`)
        continue
      }
      if (ajouterCorrespondance(resultat.correspondances, params.selection, repere)) {
        resultat.manuel = true
      }
    }

    for (const regle of courant.regles) {
      let plages: Plage[] = []
      let raison = ''
      if (regle.type === 'entretiens') {
        if (!regle.entretienIds.includes(params.entretienId)) continue
        plages = [{ from: 0, to: preparee.doc.content.size }]
        raison = 'règle d’entretien'
      } else if (regle.type === 'modalite') {
        const variable = variables.get(regle.variableId)
        if (!variable || variable.portee !== regle.portee
          || !variable.modalites.some((modalite) => modalite.id === regle.modaliteId)) {
          problemes.add(`Une règle du cas « ${courant.nom} » ne peut pas être vérifiée.`)
          continue
        }
        if (regle.portee === 'entretien') {
          if (params.source.meta.valeursGen?.[regle.variableId] !== regle.modaliteId) continue
          plages = [{ from: 0, to: preparee.doc.content.size }]
          raison = `règle sur « ${variable.lib} »`
        } else {
          const retenus = new Set(params.source.locuteurs
            .filter((locuteur) => locuteur.valeursLoc?.[regle.variableId] === regle.modaliteId
              && (regle.inclureEnqueteurs || locuteur.interviewer !== true))
            .map((locuteur) => locuteur.index))
          plages = interventions(preparee.doc, retenus)
          raison = `règle sur « ${variable.lib} »`
        }
      } else {
        if (params.personnesConnues === null) {
          problemes.add(`Les règles de personnes du cas « ${courant.nom} » n’ont pas pu être vérifiées.`)
          continue
        }
        const retenus = new Set<number>()
        for (const membre of membresPersonnesRegle(regle)) {
          if (!params.personnesConnues.has(membre.personneId)) {
            problemes.add(`Une personne du cas « ${courant.nom} » n’existe plus.`)
            continue
          }
          for (const locuteur of params.source.locuteurs) {
            if (locuteur.personneRef === membre.personneId
              && (membre.inclureEnqueteurs || locuteur.interviewer !== true)) {
              retenus.add(locuteur.index)
            }
          }
        }
        plages = interventions(preparee.doc, retenus)
        raison = regle.type === 'personnes' ? 'règle de groupe de personnes' : 'règle de personne'
      }

      if (plages.some((plage) => ajouterCorrespondance(
        resultat.correspondances,
        params.selection,
        plage,
      )) && !resultat.raisonsAutomatiques.includes(raison)) {
        resultat.raisonsAutomatiques.push(raison)
      }
    }

    if (resultat.manuel || resultat.raisonsAutomatiques.length) cas.push(resultat)
  }

  const recueils: AssociationRecueilPassage[] = []
  for (const recueil of Object.values(params.recueils)) {
    const occurrences: OccurrenceRecueilPassage[] = []
    for (const item of recueil.items) {
      if (item.type !== 'passage' || item.source.entretienId !== params.entretienId) continue
      const repere = reperes.get(item.source.repereId)
      if (!repere || repere.from >= repere.to) {
        problemes.add(`Un passage du recueil « ${recueil.nom} » ne peut pas être situé.`)
        continue
      }
      const relation = correspondance(params.selection, repere)
      if (relation) occurrences.push({ itemId: item.id, correspondance: relation })
    }
    if (occurrences.length) recueils.push({ id: recueil.id, nom: recueil.nom, occurrences })
  }

  cas.sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.id.localeCompare(b.id))
  recueils.sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.id.localeCompare(b.id))
  return { cas, recueils, problemes: [...problemes] }
}
