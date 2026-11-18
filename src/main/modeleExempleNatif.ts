import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CorpusFichier as CorpusFormat9, EntretienFichier as EntretienFormat9 } from '../shared/format'
import { validerCorpusV2 } from '../shared/ouvertureFichier'
import { lireCorpusCasFormat9 } from '../shared/natif/lectureCasFormat9'
import { FORMAT_NATIF_LOCUTEURS, type CorpusFichier, type EntretienFichier } from '../shared/natif/format'
import { validerCorpusNatif, validerEntretienNatif } from '../shared/natif/validation'

export interface ModeleExempleNatif {
  corpus: CorpusFichier
  entretiens: Record<string, EntretienFichier>
}

/** Prépare uniquement le modèle annoté fourni, pas les corpus de travail des testeurs. */
export function preparerModeleExempleNatif(ressources: string): ModeleExempleNatif {
  const racine = join(ressources, 'CorpusSynthAnnot')
  if (existsSync(join(racine, '.transaction-fichiers.json'))) {
    throw new Error('Le modèle contient une opération à terminer avant sa préparation.')
  }
  const source = JSON.parse(readFileSync(join(racine, 'corpus.crp'), 'utf8')) as CorpusFormat9
  validerCorpusV2(source)
  if (source.formatVersion !== 9 || source.nom !== 'CorpusSynthAnnot') {
    throw new Error('Ce modèle ne correspond pas au corpus annoté fourni.')
  }
  const { personnes: _personnes, variables: _variables, cas: _cas, famillesCas: _familles, ...commun } = source
  const lecture = lireCorpusCasFormat9(source)
  const corpus: CorpusFichier = {
    ...commun, formatVersion: FORMAT_NATIF_LOCUTEURS,
    locuteurs: lecture.locuteurs, variables: lecture.variables,
    ...(source.cas !== undefined ? { cas: lecture.cas } : {}),
    ...(source.famillesCas !== undefined ? { famillesCas: lecture.famillesCas } : {}),
  }
  validerCorpusNatif(corpus)
  const entretiens: Record<string, EntretienFichier> = {}
  for (const id of Object.keys(corpus.membership)) {
    const ancien = JSON.parse(readFileSync(join(racine, 'entretiens', `${id}.json`), 'utf8')) as EntretienFormat9
    if (ancien.formatVersion !== 9) throw new Error('Un entretien du modèle a une version incompatible.')
    const { locuteurs, notes, ...champs } = ancien
    const entretien: EntretienFichier = {
      ...champs, formatVersion: FORMAT_NATIF_LOCUTEURS,
      participations: locuteurs.map(({ personneRef, personneDeliee, rapprochementsRefuses, ...local }) => {
        if (!local.id) throw new Error('Les participations du modèle doivent déjà posséder leurs ids stables.')
        if (rapprochementsRefuses?.length) throw new Error('Les refus du modèle doivent être contextualisés avant publication.')
        return {
          ...local, id: local.id, locuteurRef: personneRef,
          ...(personneDeliee !== undefined ? { associationRetiree: personneDeliee } : {}),
          ...(rapprochementsRefuses !== undefined ? { rapprochementsRefuses: [] } : {}),
        }
      }),
      ...(notes !== undefined ? { notes: notes.map(({ locuteurIds, ...note }) => ({
        ...note, ...(locuteurIds !== undefined ? { participationIds: locuteurIds } : {}),
      })) } : {}),
    }
    validerEntretienNatif(entretien)
    entretiens[id] = entretien
  }
  return { corpus, entretiens }
}
