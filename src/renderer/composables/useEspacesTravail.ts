import { computed, ref, watch, type Ref } from 'vue'
import type { OngletCorpus, SousEspaceAnalyse, SousEspaceOrganisation, SousEspacePreparation, VueApplication } from './espaces'

/**
 *  Navigation des espaces de travail, indépendante du cycle de vie du corpus.
 *  Changer d'espace ne ferme pas l'entretien ouvert.
 */
export function useEspacesTravail(deps: { vue: Ref<VueApplication> }) {
  /** Dernière vue de traitement, conservée tant que le corpus reste ouvert. */
  const vueTraitement = ref<'corpus' | 'entretien'>(
    deps.vue.value === 'entretien' ? 'entretien' : 'corpus',
  )
  /** Onglet actif de « Préparer et suivre », mémorisé pour ce corpus.
   *  L'Accueil présente les outils ; il ne lance aucun chargement. */
  const sousEspacePreparation = ref<SousEspacePreparation>('accueil')
  /** Onglet actif de « Analyser et interpréter ».
   *  Synthèse par défaut : elle ne lance aucun calcul à l'ouverture,
   *  contrairement à Lexico. */
  const sousEspaceAnalyse = ref<SousEspaceAnalyse>('synthese')
  /** Les filtres de l'onglet d'analyse occupent-ils la colonne de gauche ? */
  const panneauAnalyseVisible = ref(true)
  const ongletCorpus = ref<OngletCorpus>('accueil')
  const sousEspaceOrganisation = ref<SousEspaceOrganisation>('cas')
  const organisationActive = computed(() => deps.vue.value === 'organiser')
  const panneauCasActif = computed(() => organisationActive.value && sousEspaceOrganisation.value === 'cas')
  const panneauRecueilsActif = computed(() => organisationActive.value && sousEspaceOrganisation.value === 'recueils')
  let navigationCorpus: ((onglet: OngletCorpus) => Promise<boolean>) | null = null

  /** Le panneau Corpus applique ses protections avant de changer d'onglet. */
  function enregistrerNavigationCorpus(gestionnaire: NonNullable<typeof navigationCorpus>): () => void {
    navigationCorpus = gestionnaire
    return () => {
      if (navigationCorpus === gestionnaire) navigationCorpus = null
    }
  }

  async function choisirOngletCorpus(onglet: OngletCorpus): Promise<boolean> {
    return navigationCorpus ? navigationCorpus(onglet) : false
  }

  watch(deps.vue, (v) => {
    if (v === 'corpus' || v === 'entretien') vueTraitement.value = v
  }, { flush: 'sync' })

  const preparationActive = computed(() => deps.vue.value === 'preparer')
  const analyseActive = computed(() => deps.vue.value === 'analyser')
  const tableauBordOuverts = computed(() => preparationActive.value
    && sousEspacePreparation.value === 'tableau-bord')
  const docsCadreOuverts = computed(() => preparationActive.value
    && sousEspacePreparation.value === 'docs-cadre')
  const documentsExemplesOuverts = computed(() => preparationActive.value
    && sousEspacePreparation.value === 'documents-exemples')
  const documentsOuverts = computed(() => docsCadreOuverts.value || documentsExemplesOuverts.value)
  const analysesCroiseesOuvertes = computed(() => analyseActive.value
    && sousEspaceAnalyse.value === 'analyses-croisees')

  /** Ouvre « Préparer et suivre » ; sans onglet demandé, reprend le dernier visité. */
  function entrerPreparation(sousEspace?: SousEspacePreparation): void {
    if (deps.vue.value === 'accueil') return
    if (sousEspace) sousEspacePreparation.value = sousEspace
    deps.vue.value = 'preparer'
  }

  /** Ouvre « Analyser et interpréter » ; sans onglet demandé, reprend le dernier visité. */
  function entrerAnalyse(sousEspace?: SousEspaceAnalyse): void {
    if (deps.vue.value === 'accueil') return
    if (sousEspace) sousEspaceAnalyse.value = sousEspace
    deps.vue.value = 'analyser'
  }

  /** Ouvre « Organiser et exporter » et reprend son dernier onglet. */
  function entrerOrganisation(sousEspace?: SousEspaceOrganisation): void {
    if (deps.vue.value === 'accueil') return
    if (sousEspace) sousEspaceOrganisation.value = sousEspace
    deps.vue.value = 'organiser'
  }

  /** Revient à la vue de traitement quittée, sans fermer l'entretien. */
  function revenirTraitement(): void {
    if (deps.vue.value !== 'preparer' && deps.vue.value !== 'analyser' && deps.vue.value !== 'organiser') return
    deps.vue.value = vueTraitement.value
  }

  /** Masque ou rétablit les filtres de l'onglet d'analyse courant. */
  function basculerPanneauAnalyse(): void {
    panneauAnalyseVisible.value = !panneauAnalyseVisible.value
  }
  function afficherPanneauAnalyse(): void {
    panneauAnalyseVisible.value = true
  }

  /** Retour aux sous-espaces initiaux : changement de corpus. */
  function reinitialiserEspaces(): void {
    vueTraitement.value = 'corpus'
    if (preparationActive.value || analyseActive.value || organisationActive.value) deps.vue.value = 'corpus'
    ongletCorpus.value = 'accueil'
    sousEspacePreparation.value = 'accueil'
    sousEspaceAnalyse.value = 'synthese'
    sousEspaceOrganisation.value = 'cas'
    panneauAnalyseVisible.value = true
  }

  return {
    vueTraitement,
    ongletCorpus,
    panneauCasActif,
    panneauRecueilsActif,
    organisationActive,
    sousEspaceOrganisation,
    entrerOrganisation,
    enregistrerNavigationCorpus,
    choisirOngletCorpus,
    sousEspacePreparation,
    sousEspaceAnalyse,
    panneauAnalyseVisible,
    preparationActive,
    analyseActive,
    tableauBordOuverts,
    docsCadreOuverts,
    documentsExemplesOuverts,
    documentsOuverts,
    analysesCroiseesOuvertes,
    entrerPreparation,
    entrerAnalyse,
    revenirTraitement,
    basculerPanneauAnalyse,
    afficherPanneauAnalyse,
    reinitialiserEspaces,
  }
}
