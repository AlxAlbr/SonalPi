import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { creerParcoursAnalyse, THEME_DOUTES, THEME_UTILITE, type DepsParcoursAnalyse } from '../src/renderer/composables/parcours/analyse'
import { filtresSyntheseParDefaut, type ExtraitSynthese } from '../src/shared/synthese/types'
import type { LigneLexico, OccurrenceLexico } from '../src/shared/lexico/types'
import type { CelluleAnalyseCroisee } from '../src/shared/analysesCroisees/types'

function exercice() {
  const deps: DepsParcoursAnalyse = {
    vue: ref('analyser'), sousEspaceAnalyse: ref('accueil'), panneauAnalyseVisible: ref(true),
    membership: ref(Object.fromEntries(['1Coordinatrice', '2RetraiteAnticipee', '3Cuisinier', '4Etudiants']
      .map((titre, index) => [`e${index}`, { titre, date: null, lastModified: '2026-01-01' }]))),
    synthese: {
      filtresSynthese: ref(filtresSyntheseParDefaut()), ongletCriteresSynthese: ref('themes'),
      extraitsSynthese: ref<ExtraitSynthese[]>([]), entretiensCalculSynthese: ref([]),
      resultatPerimeSynthese: ref(false), calculeLeSynthese: ref(null), chargementSynthese: ref(false), diagnosticsSynthese: ref([]),
    },
    lexico: {
      formeSelectionneeLexico: ref(''), lignesLexico: ref<LigneLexico[]>([]),
      resultatsPerimesLexico: ref(false), chargementLexico: ref(false), diagnosticsLexico: ref([]),
    },
    croisees: {
      themesAnalyseCroisee: ref([]), entretiensAnalyseCroisee: ref([]), ongletSelectionAnalyse: ref('themes'),
      selectionAppliquee: ref(null), calculeLeAnalyseCroisee: ref(null), resultatPerimeAnalyseCroisee: ref(false),
      chargementAnalysesCroisees: ref(false), diagnosticsAnalyseCroisee: ref([]), mesureAnalyseCroisee: ref('passages'),
      celluleSelectionneeAnalyseCroisee: ref<CelluleAnalyseCroisee | null>(null),
    },
  }
  return { deps, parcours: creerParcoursAnalyse(deps) }
}
function extrait(entretienId: string): ExtraitSynthese {
  return { id: `extrait-${entretienId}`, entretienId, titreEntretien: entretienId, from: 1, to: 30,
    longueurSource: 100, themeIds: [THEME_UTILITE], annotationIds: ['a1'], locuteurIds: ['l1'],
    personneIds: [], ordre: 0, texte: 'Se sentir utile dans l’aide aux devoirs.', avant: '', apres: '', locuteurs: ['Bénévole'] }
}
function syntheseCalculee(deps: DepsParcoursAnalyse, ids = Object.keys(deps.membership.value)) {
  deps.sousEspaceAnalyse.value = 'synthese'
  deps.synthese.filtresSynthese.value = { ...filtresSyntheseParDefaut(),
    themes: { mode: 'choix', ids: [THEME_UTILITE] }, entretiens: { mode: 'choix', ids } }
  deps.synthese.extraitsSynthese.value = ids.map(extrait)
  deps.synthese.entretiensCalculSynthese.value = ids.map((id) => ({ id, titre: id, longueurSource: 100 }))
  deps.synthese.calculeLeSynthese.value = new Date()
}
function matriceCalculee(deps: DepsParcoursAnalyse) {
  deps.sousEspaceAnalyse.value = 'analyses-croisees'
  deps.croisees.themesAnalyseCroisee.value = [THEME_UTILITE, THEME_DOUTES]
  deps.croisees.entretiensAnalyseCroisee.value = Object.keys(deps.membership.value)
  deps.croisees.selectionAppliquee.value = {
    themes: [THEME_UTILITE, THEME_DOUTES], entretiens: Object.keys(deps.membership.value),
  }
  deps.croisees.calculeLeAnalyseCroisee.value = new Date()
}

describe('parcours d’analyse du corpus annoté', () => {
  it('propose quatre étapes dans les trois onglets sans prévalider le corpus fourni', () => {
    const { deps, parcours } = exercice()
    expect(parcours.disponible()).toBe(true)
    expect(parcours.etapes).toHaveLength(4)
    expect(parcours.etapes.every((e) => e.vueFin === 'analyser')).toBe(true)
    expect(parcours.etapes.map((e) => e.fait())).toEqual([false, false, false, false])
    expect(parcours.etapes[3].requiere).toBe('croiser-themes')
    deps.vue.value = 'corpus'
    expect(parcours.etapes[0].cible()).toBe('[data-tour="ouvrir-analyser"]')
  })

  it('valide une synthèse calculée et complète, pas une sélection sans résultat ou périmée', () => {
    const { deps, parcours } = exercice()
    deps.synthese.filtresSynthese.value.themes = { mode: 'choix', ids: [THEME_UTILITE] }
    expect(parcours.etapes[0].fait()).toBe(false)
    syntheseCalculee(deps)
    expect(parcours.etapes[0].fait()).toBe(true)
    deps.synthese.resultatPerimeSynthese.value = true
    expect(parcours.etapes[0].fait()).toBe(false)
    deps.synthese.resultatPerimeSynthese.value = false
    deps.synthese.diagnosticsSynthese.value = [{ titre: 'Entretien illisible', message: 'Indisponible.' }]
    expect(parcours.etapes[0].fait()).toBe(false)
    deps.synthese.diagnosticsSynthese.value = []
    syntheseCalculee(deps, ['e0'])
    expect(parcours.etapes[0].fait()).toBe(false)
  })

  it('guide la correction des critères lorsqu’une synthèse a déjà été explorée librement', () => {
    const { deps, parcours } = exercice()
    syntheseCalculee(deps)
    deps.synthese.filtresSynthese.value.themes = { mode: 'choix', ids: [THEME_UTILITE, THEME_DOUTES] }
    expect(parcours.etapes[0].cible()).toBe('[data-tour="vider-themes-synthese"]')
    expect(parcours.etapes[0].fait()).toBe(false)
    deps.synthese.filtresSynthese.value.themes = { mode: 'choix', ids: [THEME_UTILITE] }
    deps.panneauAnalyseVisible.value = false
    expect(parcours.etapes[0].cible()).toBe('[data-tour="afficher-criteres-synthese"]')
  })

  it('demande les concordances du mot de l’exercice et non la simple ouverture de Lexico', () => {
    const { deps, parcours } = exercice()
    deps.sousEspaceAnalyse.value = 'lexico'
    expect(parcours.etapes[1].fait()).toBe(false)
    const occurrence: OccurrenceLexico = { id: 'o1', forme: 'enfants', texte: 'enfants',
      entretienId: 'e0', titreEntretien: '1Coordinatrice', from: 1, to: 8, locuteurIndex: 1,
      personneId: null, interviewer: false, valeursEntretien: {}, valeursLocuteur: {}, themeIds: [],
      avant: 'aider les', apres: 'à apprendre', pseudonyme: false }
    deps.lexico.lignesLexico.value = [{ forme: 'enfants', occurrences: 1, entretiens: 1, details: [occurrence] }]
    expect(parcours.etapes[1].fait()).toBe(false)
    deps.lexico.formeSelectionneeLexico.value = 'enfants'
    expect(parcours.etapes[1].fait()).toBe(true)
    deps.lexico.resultatsPerimesLexico.value = true
    expect(parcours.etapes[1].fait()).toBe(false)
  })

  it('demande une matrice à jour pour deux thèmes et quatre entretiens, puis la couverture', () => {
    const { deps, parcours } = exercice()
    matriceCalculee(deps)
    expect(parcours.etapes[2].fait()).toBe(false)
    deps.croisees.mesureAnalyseCroisee.value = 'couverture'
    expect(parcours.etapes[2].fait()).toBe(true)
    deps.croisees.selectionAppliquee.value!.themes = [THEME_UTILITE]
    expect(parcours.etapes[2].fait()).toBe(false)
    matriceCalculee(deps)
    deps.croisees.resultatPerimeAnalyseCroisee.value = true
    expect(parcours.etapes[2].fait()).toBe(false)
    deps.croisees.resultatPerimeAnalyseCroisee.value = false
    deps.croisees.selectionAppliquee.value!.entretiens = ['e0']
    expect(parcours.etapes[2].fait()).toBe(false)
  })

  it('termine en relisant les passages du bon thème et du bon entretien', () => {
    const { deps, parcours } = exercice()
    syntheseCalculee(deps)
    expect(parcours.etapes[3].fait()).toBe(false)
    syntheseCalculee(deps, ['e1'])
    expect(parcours.etapes[3].fait()).toBe(false)
    syntheseCalculee(deps, ['e0'])
    expect(parcours.etapes[3].fait()).toBe(true)
    deps.synthese.extraitsSynthese.value = []
    expect(parcours.etapes[3].fait()).toBe(false)
  })
})
