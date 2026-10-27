import { computed, onScopeDispose, ref, type Ref } from 'vue'
import { importerFichier } from '../formatSonal/sas'
import { nettoyerMessage } from '../erreurs'
import type { ParcoursId } from '../../shared/format'
import { EXEMPLES, EXEMPLES_PAR_PARCOURS, type EtatExemples, type ExempleId, type InstallationExemple, type ResumeTravailExemple } from '../../shared/exemples'
import { lireProgressionsDemo } from './parcours/marqueur'
import { etatPresentationParcours } from './parcours/presentation'
import type { useGuide } from './parcours/useGuide'
import type { VueApplication } from './espaces'

interface DemandeLancement {
  parcoursId: ParcoursId
  etapeId: string
  explicite: boolean
}
export interface DemandeInstallation {
  exemple: ExempleId
  usage: 'apprentissage' | 'libre'
  lancement?: DemandeLancement
  emplacement: string
}

/** Relie le catalogue aux commandes de création et d'ouverture, jamais à une réimportation. */
export function useExemples(deps: {
  guide: ReturnType<typeof useGuide>
  vue: Ref<VueApplication>
  creer: (dir: string, nom: string, exemple?: InstallationExemple) => Promise<void>
  ouvrir: (dir: string) => Promise<void>
  afficherSynthese: () => void
}) {
  const etatExemples = ref<EtatExemples | null>(null)
  const parcoursChoisi = ref<ParcoursId>('preparation')
  const catalogueParcoursOuvert = ref(false)
  const explorationExemples = ref(false)
  const demandeInstallation = ref<DemandeInstallation | null>(null)
  const demoReinitialisee = ref<{ titre: string; emplacement: string; exemple: ExempleId } | null>(null)
  const erreurExemples = ref<string | null>(null)
  const operationExemple = ref(false)
  const repereAnalyse = ref(false)
  const definitionChoisie = computed(() => deps.guide.catalogueParcours.find((p) => p.id === parcoursChoisi.value)!)
  const travailApprentissage = computed(() => {
    const id = etatExemples.value?.apprentissages[parcoursChoisi.value]
    return etatExemples.value?.travaux.find((travail) => travail.id === id)
  })
  const progressionChoisie = computed(() => {
    if (travailApprentissage.value?.dir === deps.guide.dossierGuide.value && deps.guide.pasAPas.value) {
      return deps.guide.valideesParParcours.value[parcoursChoisi.value]
    }
    const marqueur = travailApprentissage.value?.marqueur
    if (!marqueur) return new Set<string>()
    const validees = lireProgressionsDemo(marqueur).progressions[parcoursChoisi.value]
    return validees
  })
  const presentationChoisie = computed(() => etatPresentationParcours(definitionChoisie.value.etapes, progressionChoisie.value))

  async function rafraichirExemples(): Promise<void> {
    etatExemples.value = await window.sonal.exemples.etat()
  }
  async function ouvrirCatalogueParcours(id?: ParcoursId): Promise<void> {
    demoReinitialisee.value = null
    erreurExemples.value = null
    if (id) parcoursChoisi.value = id
    explorationExemples.value = false
    catalogueParcoursOuvert.value = true
    try { await rafraichirExemples() } catch (e) { erreurExemples.value = nettoyerMessage(e) }
  }
  async function ouvrirExemples(): Promise<void> {
    demoReinitialisee.value = null
    erreurExemples.value = null
    catalogueParcoursOuvert.value = false
    explorationExemples.value = true
    try { await rafraichirExemples() } catch (e) { erreurExemples.value = nettoyerMessage(e) }
  }
  function choisirParcours(id: ParcoursId): void {
    parcoursChoisi.value = id
    erreurExemples.value = null
  }
  function fermerDecouverte(): void {
    if (operationExemple.value) return
    catalogueParcoursOuvert.value = false
    explorationExemples.value = false
    demoReinitialisee.value = null
  }
  function emplacementDisponible(base: string): string {
    let proposition = base
    let n = 2
    while (etatExemples.value?.travaux.some((t) => t.dir === proposition)) proposition = `${base}_${n++}`
    return proposition
  }
  function activerLancement(lancement: DemandeLancement): void {
    const definition = deps.guide.catalogueParcours.find((p) => p.id === lancement.parcoursId)!
    const progression = deps.guide.valideesParParcours.value[lancement.parcoursId]
    const prochaine = etatPresentationParcours(definition.etapes, progression).prochaine
    const etapeId = lancement.explicite ? lancement.etapeId
      : prochaine?.id ?? definition.etapes[0].id
    deps.vue.value = lancement.parcoursId === 'organisation' ? 'organiser'
      : lancement.parcoursId === 'analyse' ? 'analyser'
      : lancement.parcoursId === 'preparation' && ['organiser-suivi', 'documents-cadre'].includes(etapeId) ? 'preparer' : 'corpus'
    deps.guide.activer(lancement.parcoursId, etapeId)
  }
  async function reprendreTravail(travail: ResumeTravailExemple, lancement?: DemandeLancement): Promise<void> {
    if (travail.etat !== 'pret') throw new Error(travail.etat === 'absent'
      ? 'Nous ne retrouvons plus votre corpus. Retrouvez son dossier pour reprendre votre travail.'
      : 'Ce corpus ne peut pas être lu. Il ne sera pas remplacé ; choisissez un autre travail ou demandez de l’aide.')
    await window.sonal.exemples.selectionner(travail.dir)
    await deps.ouvrir(travail.dir)
    explorationExemples.value = false
    catalogueParcoursOuvert.value = false
    demoReinitialisee.value = null
    if (lancement) activerLancement(lancement)
    else if (travail.exemple === 'synth-annote') repereAnalyse.value = true
  }
  async function lancerParcours(etapeId?: string): Promise<void> {
    if (operationExemple.value || !etatExemples.value) return
    erreurExemples.value = null
    const etape = etapeId ?? presentationChoisie.value.prochaine?.id
      ?? definitionChoisie.value.etapes[0]?.id
    const definition = definitionChoisie.value.etapes.find((e) => e.id === etape)
    if (!etape || !definition || (definition.requiere && !progressionChoisie.value.has(definition.requiere))) return
    const lancement = { parcoursId: parcoursChoisi.value, etapeId: etape, explicite: !!etapeId }
    const travail = travailApprentissage.value
    if (travail) {
      operationExemple.value = true
      try { await reprendreTravail(travail, lancement) } catch (e) { erreurExemples.value = nettoyerMessage(e) }
      finally { operationExemple.value = false }
    } else {
      demandeInstallation.value = { exemple: EXEMPLES_PAR_PARCOURS[lancement.parcoursId], usage: 'apprentissage', lancement,
        emplacement: emplacementDisponible(etatExemples.value.emplacementsApprentissage[lancement.parcoursId]) }
    }
  }
  async function explorerExemple(exemple: ExempleId, nouveau = false): Promise<void> {
    if (operationExemple.value || !etatExemples.value) return
    erreurExemples.value = null
    const travail = etatExemples.value.travaux.find((t) => t.id === etatExemples.value?.libres[exemple])
    if (travail && !nouveau) {
      operationExemple.value = true
      try { await reprendreTravail(travail) } catch (e) { erreurExemples.value = nettoyerMessage(e) }
      finally { operationExemple.value = false }
    } else {
      demandeInstallation.value = { exemple, usage: 'libre',
        emplacement: emplacementDisponible(`${etatExemples.value.emplacementExemples}/${exemple === 'synth' ? 'Entretiens_transcrits' : 'Corpus_annote'}`) }
    }
  }
  async function installerExemple(dir: string): Promise<void> {
    const demande = demandeInstallation.value
    if (!demande || operationExemple.value) return
    operationExemple.value = true
    try {
      const installation: InstallationExemple = {
        exemple: demande.exemple,
        usage: demande.usage,
        ...(demande.lancement ? { parcoursApprentissage: demande.lancement.parcoursId } : {}),
      }
      if (demande.exemple === 'synth' && demande.usage === 'libre') {
        installation.entretiens = (await window.sonal.exemples.textesSources()).map(({ cle, contenu }) => {
          const resultat = importerFichier(`${cle}.srt`, contenu, (html) => new DOMParser().parseFromString(html, 'text/html'))
          return { cle, payload: resultat.payload, codebook: resultat.codebook, variables: resultat.variables }
        })
      }
      const nom = demande.usage === 'apprentissage'
        ? deps.guide.catalogueParcours.find((parcours) => parcours.id === demande.lancement?.parcoursId)?.titre ?? 'Démo'
        : EXEMPLES.find((e) => e.id === demande.exemple)!.titre
      await deps.creer(dir, nom, installation)
      await rafraichirExemples()
      demandeInstallation.value = null
      explorationExemples.value = false
      catalogueParcoursOuvert.value = false
      if (demande.lancement) activerLancement(demande.lancement)
      else if (demande.exemple === 'synth-annote') { deps.afficherSynthese(); repereAnalyse.value = true }
      else deps.vue.value = 'corpus'
    } finally { operationExemple.value = false }
  }
  async function recommencerDemo(): Promise<void> {
    const travail = travailApprentissage.value
    if (operationExemple.value || !travail || travail.etat !== 'pret') return
    if (!window.confirm('Recommencer cette démo ? Tout le travail réalisé dans cette démo et sa progression seront supprimés. Vos autres corpus ne seront pas modifiés.')) return
    operationExemple.value = true
    erreurExemples.value = null
    try {
      const parcoursId = parcoursChoisi.value
      const nom = definitionChoisie.value.titre
      await deps.creer(travail.dir, nom, {
        exemple: EXEMPLES_PAR_PARCOURS[parcoursId],
        usage: 'apprentissage',
        parcoursApprentissage: parcoursId,
        recommencer: true,
      })
      await rafraichirExemples()
      catalogueParcoursOuvert.value = true
      demoReinitialisee.value = { titre: nom, emplacement: travail.dir, exemple: travail.exemple }
    } catch (e) {
      erreurExemples.value = nettoyerMessage(e)
    } finally {
      operationExemple.value = false
    }
  }
  async function choisirTravail(dir: string): Promise<void> {
    try { await window.sonal.exemples.selectionner(dir); await rafraichirExemples() }
    catch (e) { erreurExemples.value = nettoyerMessage(e) }
  }
  async function retrouverTravail(travail: ResumeTravailExemple): Promise<void> {
    const dir = await window.sonal.dialog.choisirDossier('corpus')
    if (!dir) return
    try {
      await window.sonal.exemples.rattacher(dir, travail.dir)
      await rafraichirExemples()
    } catch (e) { erreurExemples.value = nettoyerMessage(e) }
  }
  async function restaurerSources(): Promise<void> {
    try { await window.sonal.exemples.restaurerSources(); await rafraichirExemples() }
    catch (e) { erreurExemples.value = nettoyerMessage(e) }
  }
  const retirerEcoute = window.sonal.exemples.surRattachement(async (dir) => {
    await window.sonal.exemples.selectionner(dir)
    await ouvrirCatalogueParcours()
  })
  onScopeDispose(retirerEcoute)
  return { etatExemples, parcoursChoisi, catalogueParcoursOuvert, explorationExemples, demandeInstallation,
    erreurExemples, operationExemple, repereAnalyse, demoReinitialisee,
    definitionChoisie, travailApprentissage, progressionChoisie, presentationChoisie,
    ouvrirCatalogueParcours, ouvrirExemples, choisirParcours, fermerDecouverte, lancerParcours,
    recommencerDemo, explorerExemple, installerExemple, choisirTravail,
    retrouverTravail, restaurerSources }
}
