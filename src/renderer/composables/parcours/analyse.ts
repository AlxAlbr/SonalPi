import type { Ref } from 'vue'
import type { EntretienRef } from '../../../shared/format'
import type { SousEspaceAnalyse, VueApplication } from '../espaces'
import type { useSyntheseCorpus } from '../corpus/useSyntheseCorpus'
import type { useLexicoCorpus } from '../corpus/useLexicoCorpus'
import type { useAnalysesCroisees } from '../corpus/useAnalysesCroisees'
import type { DefinitionParcours, EtapePasAPas } from './types'

export const THEME_UTILITE = 'cat_009'
export const THEME_DOUTES = 'cat_019'

export interface DepsParcoursAnalyse {
  vue: Ref<VueApplication>
  sousEspaceAnalyse: Ref<SousEspaceAnalyse>
  panneauAnalyseVisible: Ref<boolean>
  membership: Ref<Record<string, EntretienRef>>
  synthese: Pick<ReturnType<typeof useSyntheseCorpus>, 'filtresSynthese' | 'ongletCriteresSynthese'
    | 'extraitsSynthese' | 'entretiensCalculSynthese' | 'resultatPerimeSynthese'
    | 'calculeLeSynthese' | 'chargementSynthese' | 'diagnosticsSynthese'>
  lexico: Pick<ReturnType<typeof useLexicoCorpus>, 'formeSelectionneeLexico' | 'lignesLexico'
    | 'resultatsPerimesLexico' | 'chargementLexico' | 'diagnosticsLexico'>
  croisees: Pick<ReturnType<typeof useAnalysesCroisees>, 'themesAnalyseCroisee' | 'entretiensAnalyseCroisee'
    | 'ongletSelectionAnalyse' | 'selectionAppliquee' | 'calculeLeAnalyseCroisee'
    | 'resultatPerimeAnalyseCroisee' | 'chargementAnalysesCroisees' | 'diagnosticsAnalyseCroisee'
    | 'mesureAnalyseCroisee' | 'celluleSelectionneeAnalyseCroisee'>
}

/** Accompagne l'analyse du corpus annoté, du thème aux passages qui étayent une comparaison. */
export function creerParcoursAnalyse(deps: DepsParcoursAnalyse): DefinitionParcours {
  const s = deps.synthese
  const l = deps.lexico
  const c = deps.croisees
  const sur = (onglet: SousEspaceAnalyse) => deps.vue.value === 'analyser' && deps.sousEspaceAnalyse.value === onglet
  const navigation = (onglet: SousEspaceAnalyse) => deps.vue.value !== 'analyser'
    ? '[data-tour="ouvrir-analyser"]' : !sur(onglet) ? `[data-tour="ouvrir-${onglet}"]` : null
  const tousEntretiens = (ids: string[]) => ids.length === 4 && Object.keys(deps.membership.value).length === 4
    && Object.keys(deps.membership.value).every((id) => ids.includes(id))
  const themesCroises = () => c.themesAnalyseCroisee.value.length === 2
    && [THEME_UTILITE, THEME_DOUTES].every((id) => c.themesAnalyseCroisee.value.includes(id))
  const syntheseUtilite = () => s.filtresSynthese.value.themes.mode === 'choix'
    && s.filtresSynthese.value.themes.ids.length === 1 && s.filtresSynthese.value.themes.ids[0] === THEME_UTILITE
  const synthesePrete = () => sur('synthese') && syntheseUtilite()
    && Object.keys(s.filtresSynthese.value.variables).length === 0
    && s.filtresSynthese.value.personnes.selection.mode === 'sans-restriction'
    && s.filtresSynthese.value.cas.mode === 'sans-restriction' && !!s.calculeLeSynthese.value
    && !s.chargementSynthese.value && !s.resultatPerimeSynthese.value
    && s.diagnosticsSynthese.value.length === 0 && s.extraitsSynthese.value.length > 0
  const matricePrete = () => !!c.calculeLeAnalyseCroisee.value && !c.chargementAnalysesCroisees.value
    && !c.resultatPerimeAnalyseCroisee.value && c.diagnosticsAnalyseCroisee.value.length === 0
    && themesCroises() && tousEntretiens(c.selectionAppliquee.value?.entretiens ?? [])
    && c.selectionAppliquee.value?.themes.length === 2
    && [THEME_UTILITE, THEME_DOUTES].every((id) => c.selectionAppliquee.value?.themes.includes(id))
  const coordinatrice = () => Object.entries(deps.membership.value).find(([, r]) => r.titre === '1Coordinatrice')?.[0]

  function cibleSynthese(): string {
    const nav = navigation('synthese')
    if (nav) return nav
    if (!deps.panneauAnalyseVisible.value) return '[data-tour="afficher-criteres-synthese"]'
    const filtres = s.filtresSynthese.value
    if (!syntheseUtilite()) {
      if (s.ongletCriteresSynthese.value !== 'themes') return '[data-tour="onglet-themes-synthese"]'
      return filtres.themes.mode === 'choix' && filtres.themes.ids.some((id) => id !== THEME_UTILITE)
        ? '[data-tour="vider-themes-synthese"]' : `[data-tour="theme-synthese-${THEME_UTILITE}"]`
    }
    if (filtres.entretiens.mode === 'choix' && !tousEntretiens(filtres.entretiens.ids)) {
      return s.ongletCriteresSynthese.value !== 'entretiens'
        ? '[data-tour="onglet-entretiens-synthese"]' : '[data-tour="tous-entretiens-synthese"]'
    }
    if (Object.keys(filtres.variables).length) return '[data-tour="onglet-variables-synthese"]'
    if (filtres.personnes.selection.mode === 'choix') return '[data-tour="onglet-personnes-synthese"]'
    if (filtres.cas.mode === 'choix') return '[data-tour="onglet-cas-synthese"]'
    return '[data-tour="calculer-synthese"]'
  }
  function texteSynthese(): string {
    if (!sur('synthese')) return 'Ouvrez « Tri et synthèse » dans l’espace « Analyser et interpréter ».'
    if (!deps.panneauAnalyseVisible.value) return 'Affichez les critères pour choisir le thème à explorer.'
    const filtres = s.filtresSynthese.value
    if (!syntheseUtilite()) return 'Dans « Thèmes », cochez seulement « Sens de l’utilité ». Si d’autres thèmes sont cochés, désélectionnez-les d’abord.'
    if (filtres.entretiens.mode === 'choix' && !tousEntretiens(filtres.entretiens.ids)) return 'Dans « Entretiens », cliquez sur « Tout sélectionner » pour comparer les quatre entretiens.'
    if (Object.keys(filtres.variables).length) return 'Dans « Variables », cliquez sur « Effacer la sélection » pour explorer tous les profils.'
    if (filtres.personnes.selection.mode === 'choix') return 'Dans « Personnes », cliquez sur « Effacer la sélection » pour conserver tous les répondants.'
    if (filtres.cas.mode === 'choix') return 'Dans « Cas », cliquez sur « Tout désélectionner » pour ne pas restreindre les passages.'
    return 'Cliquez sur « Calculer la synthèse ». Les passages sur le sens de l’utilité seront rassemblés pour les quatre entretiens.'
  }
  function cibleMatrice(): string {
    const nav = navigation('analyses-croisees')
    if (nav) return nav
    if (!deps.panneauAnalyseVisible.value) return '[data-tour="afficher-selection-analyse"]'
    if (!themesCroises()) {
      if (c.ongletSelectionAnalyse.value !== 'themes') return '[data-tour="onglet-themes-analyse"]'
      if (c.themesAnalyseCroisee.value.some((id) => ![THEME_UTILITE, THEME_DOUTES].includes(id))) return '[data-tour="vider-themes-analyse"]'
      return `[data-tour="theme-analyse-${c.themesAnalyseCroisee.value.includes(THEME_UTILITE) ? THEME_DOUTES : THEME_UTILITE}"]`
    }
    if (!tousEntretiens(c.entretiensAnalyseCroisee.value)) return c.ongletSelectionAnalyse.value !== 'entretiens'
      ? '[data-tour="onglet-entretiens-analyse"]' : '[data-tour="tous-entretiens-analyse"]'
    return '[data-tour="calculer-analyse"]'
  }
  function texteMatrice(): string {
    if (!sur('analyses-croisees')) return 'Ouvrez « Analyses croisées » dans l’espace « Analyser et interpréter ».'
    if (!deps.panneauAnalyseVisible.value) return 'Affichez la sélection pour choisir les thèmes et les entretiens.'
    if (!themesCroises()) return 'Dans « Thèmes », désélectionnez tout, puis cochez seulement « Sens de l’utilité » et « Peur de ne pas savoir faire ». Faites défiler la liste si nécessaire.'
    if (!tousEntretiens(c.entretiensAnalyseCroisee.value)) return 'Dans « Entretiens », sélectionnez les quatre entretiens.'
    return 'Cliquez sur « Calculer l’analyse » pour comparer la présence de ces deux thèmes dans les quatre entretiens.'
  }
  const dansAnalyse = { panneau: true, panneauAvecTrou: true, panneauSur: ['analyse'], vueFin: 'analyser' } satisfies Partial<EtapePasAPas>
  const etapes: EtapePasAPas[] = [
    {
      ...dansAnalyse, id: 'rassembler-passages', titre: 'Rassembler les passages d’un thème',
      cible: cibleSynthese,
      fait: () => synthesePrete() && tousEntretiens(s.entretiensCalculSynthese.value.map((e) => e.id)),
      texte: texteSynthese,
      explication: () => 'Question de départ : comment les bénévoles décrivent-ils leur utilité dans l’aide aux devoirs ? Le corpus fourni contient quatre entretiens déjà codés. La synthèse rassemble les passages concernés sans les copier dans un autre corpus.',
      fini: () => 'Les passages sur le sens de l’utilité sont rassemblés. Comparez les propos dans la vue d’ensemble ou dans « Extraits » : un même thème ne signifie pas que tous les bénévoles lui donnent le même sens.',
    },
    {
      ...dansAnalyse, id: 'explorer-vocabulaire', titre: 'Explorer les mots en contexte',
      cible: () => navigation('lexico') ?? (l.resultatsPerimesLexico.value ? '[data-tour="actualiser-lexico"]' : document.querySelector<HTMLInputElement>('[data-tour="rechercher-forme-lexico"]')?.value.trim().toLocaleLowerCase('fr') !== 'enfants'
        ? '[data-tour="rechercher-forme-lexico"]' : '[data-tour="forme-lexico-enfants"]'),
      fait: () => sur('lexico') && !l.chargementLexico.value && !l.resultatsPerimesLexico.value
        && l.diagnosticsLexico.value.length === 0 && l.formeSelectionneeLexico.value === 'enfants'
        && l.lignesLexico.value.some((ligne) => ligne.forme === 'enfants' && ligne.details.length > 0),
      texte: () => !sur('lexico') ? 'Ouvrez « Lexico ». L’index des quatre entretiens est préparé à l’ouverture.'
        : l.resultatsPerimesLexico.value ? 'Les sources ont changé. Cliquez sur « Actualiser », puis recherchez à nouveau « enfants ».'
          : 'Dans « Rechercher une forme », saisissez « enfants », puis cliquez sur le mot dans le tableau pour afficher ses concordances. Lisez les phrases autour du mot : parlent-elles toutes du même aspect de l’aide aux devoirs ?',
      explication: () => 'Une fréquence signale un mot à explorer, pas son sens. Les concordances montrent les contextes ; cliquer sur l’une d’elles permet de relire l’entretien.',
      fini: () => 'Les concordances d’« enfants » sont affichées. Relisez-les avant d’interpréter la fréquence : les bénévoles peuvent parler des apprentissages, des relations ou des difficultés avec le même mot.',
    },
    {
      ...dansAnalyse, id: 'croiser-themes', titre: 'Comparer les thèmes entre entretiens',
      cible: () => sur('analyses-croisees') && matricePrete() ? '[data-tour="mesure-analyse"]' : cibleMatrice(),
      fait: () => sur('analyses-croisees') && matricePrete() && c.mesureAnalyseCroisee.value === 'couverture',
      texte: () => sur('analyses-croisees') && matricePrete()
        ? 'Comparez les nombres de passages, puis choisissez « Couverture » dans « Valeur affichée ». Cette mesure rapporte le volume codé à la longueur de chaque entretien.' : texteMatrice(),
      explication: () => 'Les entretiens n’ont pas tous la même longueur. Le nombre de passages et la couverture éclairent des aspects différents. Ni l’un ni l’autre ne mesure à lui seul l’importance d’un thème pour une personne.',
      fini: () => 'La matrice compare l’utilité et les doutes dans les quatre entretiens. Une différence de couverture est un point de départ pour relire les propos, pas une conclusion sur les personnes.',
    },
    {
      ...dansAnalyse, id: 'interpreter-passages', titre: 'Revenir aux passages pour interpréter', requiere: 'croiser-themes',
      cible: () => {
        if (sur('synthese') && syntheseUtilite() && s.filtresSynthese.value.entretiens.mode === 'choix'
          && s.filtresSynthese.value.entretiens.ids.length === 1
          && s.filtresSynthese.value.entretiens.ids[0] === coordinatrice()) return '[data-tour="calculer-synthese"]'
        if (!sur('analyses-croisees') || !matricePrete()) return cibleMatrice()
        return document.querySelector('[data-tour="cellule-vers-synthese"]') && c.celluleSelectionneeAnalyseCroisee.value?.themeId === THEME_UTILITE
          && c.celluleSelectionneeAnalyseCroisee.value?.entretienId === coordinatrice()
          ? '[data-tour="cellule-vers-synthese"]' : `[data-tour="cellule-analyse-${THEME_UTILITE}-${coordinatrice()}"]`
      },
      fait: () => synthesePrete() && s.filtresSynthese.value.entretiens.mode === 'choix'
        && s.filtresSynthese.value.entretiens.ids.length === 1 && s.filtresSynthese.value.entretiens.ids[0] === coordinatrice()
        && s.extraitsSynthese.value.every((e) => e.entretienId === coordinatrice()),
      texte: () => sur('synthese')
        ? 'Calculez la synthèse limitée au « Sens de l’utilité » de « 1Coordinatrice », puis relisez les extraits pour comprendre ce que recouvre le chiffre.'
        : !matricePrete() ? texteMatrice()
          : 'Dans la matrice, cliquez sur la cellule « Sens de l’utilité » × « 1Coordinatrice ». Lisez les justificatifs, puis cliquez sur « Afficher dans Tri et synthèse ».',
      explication: () => 'Pour interpréter, revenez aux formulations et à leur contexte. Qu’entend la coordinatrice par être utile ? Comparez ensuite avec un autre entretien pour chercher des nuances ou des contre-exemples.',
      fini: () => 'Vous êtes revenu du tableau aux passages qui étayent la comparaison. Vous pouvez maintenant explorer librement d’autres thèmes, confronter les entretiens et consigner vos hypothèses dans des notes, sans confondre fréquence et interprétation.',
    },
  ]
  return { id: 'analyse', titre: 'Analyser et interpréter',
    resume: 'Rassembler les passages, explorer les mots et comparer quatre entretiens annotés.', disponible: () => true, etapes }
}
