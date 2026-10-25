/**
 *  Navigation par espaces : changer d'espace ne ferme pas la vue de traitement.
 *  « Importer et traiter » reprend l'entretien laissé ouvert ; l'onglet de
 *  « Préparer et suivre » et celui d'« Analyser et interpréter » sont mémorisés
 *  pendant la session du corpus.
 */

import { describe, expect, test } from 'vitest'
import { effectScope, isReadonly, nextTick, ref, type EffectScope } from 'vue'
import { useEspacesTravail } from '../src/renderer/composables/useEspacesTravail'
import type { VueApplication } from '../src/renderer/composables/espaces'

function creer(initial: VueApplication = 'corpus') {
  const vue = ref<VueApplication>(initial)
  const scope: EffectScope = effectScope()
  const espaces = scope.run(() => useEspacesTravail({ vue }))!
  return { vue, espaces, arreter: () => scope.stop() }
}

describe('espaces de travail', () => {
  test('les panneaux actifs sont dérivés immédiatement de la navigation', () => {
    const { vue, espaces, arreter } = creer()
    expect(isReadonly(espaces.docsCadreOuverts)).toBe(true)
    expect(isReadonly(espaces.tableauBordOuverts)).toBe(true)
    expect(isReadonly(espaces.analysesCroiseesOuvertes)).toBe(true)
    // L'espace s'ouvre sur l'Accueil, sans panneau de travail actif.
    espaces.entrerPreparation()
    expect(espaces.sousEspacePreparation.value).toBe('accueil')
    expect(espaces.docsCadreOuverts.value).toBe(false)
    expect(espaces.tableauBordOuverts.value).toBe(false)
    espaces.entrerPreparation('docs-cadre')
    expect(espaces.docsCadreOuverts.value).toBe(true)
    expect(espaces.tableauBordOuverts.value).toBe(false)
    espaces.entrerPreparation('tableau-bord')
    expect(espaces.docsCadreOuverts.value).toBe(false)
    expect(espaces.tableauBordOuverts.value).toBe(true)
    espaces.entrerAnalyse('analyses-croisees')
    expect(espaces.tableauBordOuverts.value).toBe(false)
    expect(espaces.analysesCroiseesOuvertes.value).toBe(true)
    espaces.entrerAnalyse('synthese')
    expect(espaces.analysesCroiseesOuvertes.value).toBe(false)
    vue.value = 'accueil'
    expect(espaces.docsCadreOuverts.value).toBe(false)
    expect(espaces.tableauBordOuverts.value).toBe(false)
    arreter()
  })

  test('une ouverture d’entretien suivie immédiatement d’un espace mémorise le traitement', () => {
    const { vue, espaces, arreter } = creer()
    vue.value = 'entretien'
    espaces.entrerAnalyse()
    espaces.revenirTraitement()
    expect(vue.value).toBe('entretien')
    arreter()
  })

  test('un nouveau corpus ne reprend pas un entretien du précédent', () => {
    const { vue, espaces, arreter } = creer('entretien')
    espaces.entrerPreparation('docs-cadre')
    espaces.reinitialiserEspaces()
    expect(vue.value).toBe('corpus')
    expect(espaces.vueTraitement.value).toBe('corpus')
    espaces.entrerAnalyse()
    espaces.revenirTraitement()
    expect(vue.value).toBe('corpus')
    arreter()
  })

  test('entrer en préparation mémorise l’onglet et laisse la vue de traitement intacte', async () => {
    const { vue, espaces, arreter } = creer('entretien')
    await nextTick()
    expect(espaces.preparationActive.value).toBe(false)

    espaces.entrerPreparation('docs-cadre')
    expect(vue.value).toBe('preparer')
    expect(espaces.preparationActive.value).toBe(true)
    expect(espaces.sousEspacePreparation.value).toBe('docs-cadre')

    // Revenir au traitement rouvre l'entretien, sans le fermer.
    espaces.revenirTraitement()
    expect(vue.value).toBe('entretien')
    arreter()
  })

  test('sans onglet demandé, l’espace reprend le dernier onglet visité', () => {
    const { vue, espaces, arreter } = creer()
    espaces.entrerPreparation('docs-cadre')
    espaces.revenirTraitement()
    expect(vue.value).toBe('corpus')

    espaces.entrerPreparation()
    expect(vue.value).toBe('preparer')
    expect(espaces.sousEspacePreparation.value).toBe('docs-cadre')
    arreter()
  })

  test('depuis l’accueil, l’espace ne s’ouvre pas', () => {
    const { vue, espaces, arreter } = creer('accueil')
    espaces.entrerPreparation('tableau-bord')
    expect(vue.value).toBe('accueil')
    expect(espaces.preparationActive.value).toBe(false)
    arreter()
  })

  test('la réinitialisation ramène l’onglet Accueil', () => {
    const { espaces, arreter } = creer()
    espaces.entrerPreparation('docs-cadre')
    espaces.reinitialiserEspaces()
    expect(espaces.sousEspacePreparation.value).toBe('accueil')
    arreter()
  })

  test('revenir au traitement hors préparation ne change rien', () => {
    const { vue, espaces, arreter } = creer('entretien')
    espaces.revenirTraitement()
    expect(vue.value).toBe('entretien')
    arreter()
  })

  test('l’espace d’analyse s’ouvre sur Synthèse et mémorise l’onglet visité', () => {
    const { vue, espaces, arreter } = creer('entretien')
    espaces.entrerAnalyse()
    expect(vue.value).toBe('analyser')
    expect(espaces.analyseActive.value).toBe(true)
    expect(espaces.sousEspaceAnalyse.value).toBe('synthese')

    espaces.entrerAnalyse('lexico')
    expect(espaces.sousEspaceAnalyse.value).toBe('lexico')
    espaces.revenirTraitement()
    expect(vue.value).toBe('entretien')

    espaces.entrerAnalyse()
    expect(espaces.sousEspaceAnalyse.value).toBe('lexico')
    arreter()
  })

  test('depuis l’accueil, l’espace d’analyse ne s’ouvre pas', () => {
    const { vue, espaces, arreter } = creer('accueil')
    espaces.entrerAnalyse('lexico')
    expect(vue.value).toBe('accueil')
    expect(espaces.analyseActive.value).toBe(false)
    arreter()
  })

  test('les filtres d’analyse se masquent et se rétablissent', () => {
    const { espaces, arreter } = creer()
    expect(espaces.panneauAnalyseVisible.value).toBe(true)
    espaces.basculerPanneauAnalyse()
    expect(espaces.panneauAnalyseVisible.value).toBe(false)
    espaces.basculerPanneauAnalyse()
    expect(espaces.panneauAnalyseVisible.value).toBe(true)
    espaces.basculerPanneauAnalyse()
    espaces.afficherPanneauAnalyse()
    expect(espaces.panneauAnalyseVisible.value).toBe(true)
    arreter()
  })

  test('la réinitialisation ramène l’analyse sur Synthèse, filtres visibles', () => {
    const { espaces, arreter } = creer()
    espaces.entrerAnalyse('analyses-croisees')
    espaces.basculerPanneauAnalyse()
    espaces.reinitialiserEspaces()
    expect(espaces.sousEspaceAnalyse.value).toBe('synthese')
    expect(espaces.panneauAnalyseVisible.value).toBe(true)
    arreter()
  })

  test('revenir au traitement depuis l’analyse rend la vue quittée', () => {
    const { vue, espaces, arreter } = creer('corpus')
    espaces.entrerAnalyse('synthese')
    espaces.revenirTraitement()
    expect(vue.value).toBe('corpus')
    arreter()
  })
})
