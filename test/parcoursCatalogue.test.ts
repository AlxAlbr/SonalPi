import { describe, expect, it } from 'vitest'
import { creerCatalogue } from '../src/renderer/composables/parcours/catalogue'
import { etatsCatalogue, recommanderParcoursSuivant } from '../src/renderer/composables/parcours/presentation'
import type { DefinitionParcours } from '../src/renderer/composables/parcours/types'

const etape = (id: string, requiere?: string) => ({
  id,
  titre: id,
  cible: () => null,
  fait: () => false,
  texte: () => '',
  ...(requiere ? { requiere } : {}),
})

const definitions: DefinitionParcours[] = [
  {
    id: 'preparation', titre: 'Préparer', resume: '', disponible: () => true,
    etapes: [etape('suivi'), etape('docs', 'suivi')],
  },
  {
    id: 'traitement', titre: 'Traiter', resume: '', disponible: () => true,
    etapes: [etape('charger'), etape('coder', 'charger')],
  },
  {
    id: 'analyse', titre: 'Analyser', resume: '', disponible: () => true,
    etapes: [etape('synthese'), etape('croiser')],
  },
  {
    id: 'organisation', titre: 'Organiser et exporter', resume: '', disponible: () => true,
    etapes: [etape('cas'), etape('recueil'), etape('passage', 'recueil'), etape('export')],
  },
]

describe('catalogue des parcours pédagogiques', () => {
  it('présente les quatre espaces dans l’ordre pédagogique', () => {
    expect(creerCatalogue(definitions[0], definitions[1], definitions[2], definitions[3]).map((p) => p.id))
      .toEqual(['preparation', 'traitement', 'analyse', 'organisation'])
  })

  it('conserve une progression indépendante et des prérequis locaux', () => {
    const etats = etatsCatalogue(definitions, {
      preparation: new Set(['suivi']),
      traitement: new Set(),
    })
    expect(etats[0]).toMatchObject({ nombreRealisees: 1, prochaineId: 'docs', termine: false })
    expect(etats[1]).toMatchObject({ nombreRealisees: 0, prochaineId: 'charger', termine: false })
    expect(etats[2]).toMatchObject({ disponible: true, nombreRealisees: 0, prochaineId: 'synthese' })
  })

  it('termine un parcours sans terminer les autres et recommande le suivant', () => {
    const progressions = {
      preparation: new Set(['suivi', 'docs']),
      traitement: new Set<string>(),
    }
    const etats = etatsCatalogue(definitions, progressions)
    expect(etats[0].termine).toBe(true)
    expect(etats[1].termine).toBe(false)
    expect(recommanderParcoursSuivant(definitions, 'preparation', progressions)).toBe('traitement')
    expect(recommanderParcoursSuivant(definitions, 'traitement', progressions)).toBe('analyse')
    expect(recommanderParcoursSuivant(definitions, 'analyse', progressions)).toBe('organisation')
    expect(recommanderParcoursSuivant(definitions, 'organisation', progressions)).toBeNull()
  })
})
