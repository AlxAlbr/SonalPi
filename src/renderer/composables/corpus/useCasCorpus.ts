import { computed, ref, toRaw, watch, type Ref } from 'vue'
import type { EntretienFichier, EntretienRef, Variable } from '../../../shared/format'
import type { InventairePersonnes } from '../../../shared/corpus/personnes'
import {
  normaliserNomCas,
  compterUsagesAttributCas,
  porteeObservationsCas,
  type FamilleCas,
  type CommandeFamilleCas,
  type Cas,
  type CommandeCas,
  type RattachementCas,
  type RegleCas,
  type DefinitionAttributCas,
  type DerivationAttributCas,
  membresPersonnesRegle,
} from '../../../shared/corpus/cas'
import {
  evaluerDerivationFamille,
  libelleValeurSaisie,
  projeterAttributsCas,
  resoudreDerivationCas,
  variablesDisponiblesFamille,
  type AttributCasProjete,
  type DiagnosticAttributCas,
  type VariableCandidateFamille,
} from '../../../shared/corpus/observationsAttributs'
import {
  projeterCas,
  projeterCasDepuisSourcesPreparees,
  type PassageCasProjete,
  type ProjectionCas,
  type SourceCasChargee,
  type ModeMateriauxCas,
} from '../../editor/cas'
import { preparerSourcesPassages, type ModeTextePassage } from '../../editor/passages'
import { lancerOperationGlobale } from '../../operationGlobaleCorpus'

const nouvelId = (prefixe: string): string => `${prefixe}-${globalThis.crypto.randomUUID()}`

export interface ApercuPersonneCas {
  entretiens: number
  passages: number
  sourcesIndisponibles: number
}

export type ChoixLotCas =
  | { type: 'personnes'; ids: string[]; inclureEnqueteurs: boolean }
  | { type: 'entretiens'; ids: string[] }

export interface ApercuFamilleCas {
  famille: FamilleCas
  completion: boolean
  cas: Array<{ cas: Cas; projection: ProjectionCas; selectionne: boolean; dejaPresent: boolean }>
}

export interface ApercuLotCas {
  cas: Cas
  membres: number
  enqueteursExclus: number
  sources: number
  passages: number
  problemes: number
  diagnostics: string[]
  casExistants: string[]
}

function cleRegles(regles: RegleCas[]): string {
  return JSON.stringify(regles.flatMap((regle) => regle.type === 'modalite'
    ? [`modalite:${regle.variableId}:${regle.modaliteId}:${regle.portee}:${regle.portee === 'locuteur' && regle.inclureEnqueteurs}`]
    : regle.type === 'entretiens'
    ? regle.entretienIds.map((id) => `entretien:${id}`)
    : membresPersonnesRegle(regle).map((membre) => `personne:${membre.personneId}:${membre.inclureEnqueteurs}`))
    .sort())
}

export interface SelectionAssociationCas {
  entretienId: string
  titreEntretien: string
  from: number
  to: number
  texte: string
}

export function useCasCorpus(deps: {
  cas: Ref<Record<string, Cas>>
  famillesCas?: Ref<Record<string, FamilleCas>>
  attributsCas?: Ref<Record<string, DefinitionAttributCas>>
  variables?: Ref<Variable[]>
  membership: Ref<Record<string, EntretienRef>>
  ouvertId: Ref<string | null>
  sourceOuverte: () => EntretienFichier | null
  selectionCourante: () => Omit<SelectionAssociationCas, 'titreEntretien'> | null
  enregistrerRepereSelection: (attendu: {
    entretienId: string
    from: number
    to: number
  }) => Promise<{ id: string; from: number; to: number }>
  lirePersonnes: () => Promise<InventairePersonnes>
  ouvrirSource: (entretienId: string, pos: number) => Promise<void> | void
  fermerRecueils: () => void
  /** Le fournisseur sait-il garder les sources qu'un rattachement ou une
   *  recette désignent ? Un corpus distant peut refuser. */
  definitionsAvecSources: () => boolean
}) {
  function exigerSources(): void {
    if (deps.definitionsAvecSources()) return
    throw new Error(
      'Ce corpus ne sait pas relire les entretiens publiés : '
      + 'cette opération n’est pas disponible ici.',
    )
  }
  const casOuverts = ref(false)
  const casOuvertId = ref<string | null>(null)
  const modeTexteCas = ref<ModeTextePassage>('pseudonymise')
  const modeMateriauxCas = ref<ModeMateriauxCas>('tous')
  const projectionsCas = ref<Record<string, ProjectionCas>>({})
  const inventairePersonnesCas = ref<InventairePersonnes | null>(null)
  const chargementCas = ref(false)
  const messageCas = ref<string | null>(null)
  const etatSauvegardeCas = ref<'à jour' | 'enregistrement…' | 'conflit'>('à jour')
  const associationCas = ref<SelectionAssociationCas | null>(null)
  const ajoutCasEnAttente = ref<{
    casIds: string[]
    rattachement: RattachementCas
    nouveauCas?: Cas
  } | null>(null)
  const creationCasEnAttente = ref<Extract<CommandeCas, { type: 'creer-lot' }> | null>(null)
  const famillesCas = deps.famillesCas ?? ref<Record<string, FamilleCas>>({})
  const variablesCas = deps.variables ?? ref<Variable[]>([])
  const creationFamilleEnAttente = ref<Exclude<CommandeFamilleCas, { type: 'dissoudre-famille' }> | null>(null)
  const attributsCasRef = deps.attributsCas ?? ref<Record<string, DefinitionAttributCas>>({})
  const attributsProjeteCas = ref<Record<string, AttributCasProjete[]>>({})
  let familleEnCours = false
  const generationsApercus = new WeakMap<object, number>()
  let generation = 0
  let generationCorpus = 0
  let creationLotEnCours = false

  const casOuvert = computed(() =>
    casOuvertId.value ? deps.cas.value[casOuvertId.value] ?? null : null,
  )
  const projectionCas = computed(() =>
    casOuvertId.value ? projectionsCas.value[casOuvertId.value] ?? null : null,
  )
  const attributsCasOuvert = computed(() =>
    casOuvertId.value ? attributsProjeteCas.value[casOuvertId.value] ?? [] : [],
  )
  const vueMateriauxCas = computed(() =>
    projectionCas.value?.vues[modeMateriauxCas.value] ?? null,
  )
  const listeCas = computed(() =>
    Object.values(deps.cas.value)
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.id.localeCompare(b.id)),
  )

  const entretiensCas = computed(() => Object.entries(deps.membership.value)
    .map(([id, reference]) => ({ id, nom: reference.titre }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.id.localeCompare(b.id)))

  async function chargerInventairePersonnes(force = false): Promise<InventairePersonnes> {
    if (!force && inventairePersonnesCas.value) return inventairePersonnesCas.value
    const corpusAttendu = generationCorpus
    const inventaire = await deps.lirePersonnes()
    if (corpusAttendu !== generationCorpus) throw new Error('Le corpus a changé pendant la lecture des personnes.')
    inventairePersonnesCas.value = inventaire
    return inventaire
  }

  async function chargerSources(ids: Iterable<string>): Promise<Map<string, SourceCasChargee>> {
    const sources = new Map<string, SourceCasChargee>()
    await Promise.all([...new Set(ids)].map(async (entretienId) => {
      if (entretienId === deps.ouvertId.value) {
        const data = deps.sourceOuverte()
        sources.set(entretienId, data
          ? { ok: true, data }
          : { ok: false, raison: 'Source ouverte indisponible.' })
        return
      }
      try {
        const lecture = await window.sonal.corpus.lireEntretien(entretienId)
        sources.set(entretienId, lecture.ok
          ? { ok: true, data: lecture.data }
          : { ok: false, raison: lecture.raison, invalide: lecture.raison === 'version' })
      } catch (erreur) {
        sources.set(entretienId, {
          ok: false,
          raison: erreur instanceof Error ? erreur.message : String(erreur),
        })
      }
    }))
    return sources
  }

  function idsSources(casCourants: Cas[]): string[] {
    const ids = new Set<string>()
    for (const courant of casCourants) {
      for (const regle of courant.regles) {
        const sources = regle.type === 'entretiens' ? regle.entretienIds : Object.keys(deps.membership.value)
        for (const id of sources) ids.add(id)
      }
      for (const rattachement of courant.rattachements) ids.add(rattachement.source.entretienId)
    }
    return [...ids]
  }

  function corpusPourProjections() {
    return {
      membership: deps.membership.value,
      personnes: {},
      variables: Object.fromEntries(variablesCas.value.map((v) => [v.id, v])),
      famillesCas: famillesCas.value,
      attributsCas: attributsCasRef.value,
      cas: deps.cas.value,
    }
  }

  async function rafraichirProjections(): Promise<void> {
    const courants = Object.values(deps.cas.value)
    const maGeneration = ++generation
    if (!courants.length) {
      projectionsCas.value = {}
      attributsProjeteCas.value = {}
      chargementCas.value = false
      return
    }
    chargementCas.value = true
    try {
      const inventaire = courants.some((courant) => courant.regles.some((regle) => membresPersonnesRegle(regle).length > 0))
        ? await chargerInventairePersonnes()
        : null
      const sources = await chargerSources(idsSources(courants))
      if (maGeneration !== generation) return
      const personnes = Object.fromEntries((inventaire?.personnes ?? []).map((personne) => [personne.id, personne]))
      const preparees = preparerSourcesPassages(sources)
      const corpus = corpusPourProjections()
      projectionsCas.value = Object.fromEntries(courants.map((courant) => [
        courant.id,
        projeterCasDepuisSourcesPreparees(
          { membership: deps.membership.value, personnes, variables: corpus.variables },
          structuredClone(toRaw(courant)),
          preparees,
          modeTexteCas.value,
        ),
      ]))
      // Les attributs dérivés sont recalculés depuis ces mêmes sources : aucune
      // valeur issue d'un état antérieur n'est jamais réaffichée comme valide.
      attributsProjeteCas.value = Object.fromEntries(courants.map((courant) => [
        courant.id,
        projeterAttributsCas(corpus, structuredClone(toRaw(courant)), sources),
      ]))
    } finally {
      if (maGeneration === generation) chargementCas.value = false
    }
  }

  async function afficherCas(): Promise<void> {
    deps.fermerRecueils()
    if (!ajoutCasEnAttente.value) associationCas.value = null
    casOuverts.value = true
    messageCas.value = null
    try {
      await chargerInventairePersonnes(true)
      await rafraichirProjections()
    } catch (erreur) {
      messageCas.value = erreur instanceof Error ? erreur.message : String(erreur)
    }
  }

  async function afficherCasPourAssociation(): Promise<void> {
    const selection = deps.selectionCourante()
    if (!selection) throw new Error('Sélectionnez un passage avant de l’associer à un cas.')
    deps.fermerRecueils()
    associationCas.value = {
      ...selection,
      titreEntretien: deps.membership.value[selection.entretienId]?.titre
        ?? selection.entretienId,
    }
    casOuverts.value = true
    messageCas.value = null
    await chargerInventairePersonnes(true)
    await rafraichirProjections()
  }

  function fermerCas(): void {
    casOuverts.value = false
    if (!ajoutCasEnAttente.value) associationCas.value = null
  }

  function annulerAssociationCas(): void {
    associationCas.value = null
    ajoutCasEnAttente.value = null
    messageCas.value = null
    casOuverts.value = false
  }

  function reinitialiserCas(): void {
    generation += 1
    generationCorpus += 1
    creationCasEnAttente.value = null
    creationFamilleEnAttente.value = null
    famillesCas.value = {}
    attributsCasRef.value = {}
    attributsProjeteCas.value = {}
    casOuverts.value = false
    casOuvertId.value = null
    modeTexteCas.value = 'pseudonymise'
    modeMateriauxCas.value = 'tous'
    projectionsCas.value = {}
    inventairePersonnesCas.value = null
    chargementCas.value = false
    messageCas.value = null
    etatSauvegardeCas.value = 'à jour'
    associationCas.value = null
    ajoutCasEnAttente.value = null
  }

  async function ouvrirCas(id: string): Promise<void> {
    if (!deps.cas.value[id]) return
    casOuvertId.value = id
    if (!projectionsCas.value[id]) await rafraichirProjections()
  }

  async function commanderCas(commande: CommandeCas): Promise<void> {
    const corpusAttendu = generationCorpus
    messageCas.value = null
    etatSauvegardeCas.value = 'enregistrement…'
    try {
      const corpus = await window.sonal.corpus.casCommander(toRaw(commande))
      if (corpusAttendu !== generationCorpus) throw new Error('Le corpus a changé pendant la commande.')
      deps.cas.value = corpus.cas ?? {}
      famillesCas.value = corpus.famillesCas ?? {}
      attributsCasRef.value = corpus.attributsCas ?? {}
      variablesCas.value = Object.values(corpus.variables ?? {})
      etatSauvegardeCas.value = 'à jour'
      await rafraichirProjections()
    } catch (erreur) {
      if (corpusAttendu !== generationCorpus) throw erreur
      etatSauvegardeCas.value = 'conflit'
      messageCas.value = erreur instanceof Error ? erreur.message : String(erreur)
      try {
        const corpus = await window.sonal.corpus.ouvrir()
        if (corpusAttendu !== generationCorpus) throw erreur
        deps.cas.value = corpus.cas ?? {}
        famillesCas.value = corpus.famillesCas ?? {}
        attributsCasRef.value = corpus.attributsCas ?? {}
        variablesCas.value = Object.values(corpus.variables ?? {})
        await rafraichirProjections()
      } catch {
        // L'erreur initiale reste celle affichée.
      }
      throw erreur
    }
  }

  async function previsualiserPersonne(
    personneId: string,
    inclureEnqueteurs: boolean,
  ): Promise<ApercuPersonneCas> {
    const inventaire = await chargerInventairePersonnes()
    const personne = inventaire.personnes.find((candidate) => candidate.id === personneId)
    if (!personne) throw new Error("Cette personne n'existe plus.")
    const sources = await chargerSources(Object.keys(deps.membership.value))
    const date = new Date().toISOString()
    const projection = projeterCas({
      membership: deps.membership.value,
      personnes: { [personne.id]: personne },
    }, {
      id: 'apercu',
      nom: personne.nom,
      memo: '',
      creeLe: date,
      modifieLe: date,
      regles: [{ type: 'personne', personneId, inclureEnqueteurs }],
      rattachements: [],
    }, sources, modeTexteCas.value)
    const entretiens = new Set(projection.passages.map((passage) =>
      passage.origine.type === 'manuel'
        ? passage.origine.source.entretienId
        : passage.origine.entretienId))
    return {
      entretiens: entretiens.size,
      passages: projection.passages.length,
      sourcesIndisponibles: projection.diagnosticsRegles
        .filter((diagnostic) => diagnostic.type !== 'personne-introuvable').length,
    }
  }

  async function preparerLotCas(choix: ChoixLotCas, regroupement: 'collectif' | 'individuel'): Promise<ApercuLotCas[]> {
    if (!choix.ids.length || new Set(choix.ids).size !== choix.ids.length) {
      throw new Error('Choisissez au moins une source, sans doublon.')
    }
    const corpusAttendu = generationCorpus
    const inventaire = choix.type === 'personnes' ? await chargerInventairePersonnes(true) : null
    const candidats = choix.type === 'personnes' ? inventaire!.personnes : entretiensCas.value
    const parId = new Map(candidats.map((candidat) => [candidat.id, candidat.nom]))
    for (const id of choix.ids) {
      if (!parId.has(id)) throw new Error('Une source sélectionnée n’existe plus. Actualisez la sélection.')
    }
    const groupes = regroupement === 'collectif' ? [choix.ids] : choix.ids.map((id) => [id])
    const noms = new Set(Object.values(deps.cas.value).map((cas) => normaliserNomCas(cas.nom)))
    const date = new Date().toISOString()
    const nouveaux = groupes.map((ids): Cas => {
      const base = ids.length === 1 ? parId.get(ids[0])! : choix.type === 'personnes' ? 'Groupe de personnes' : 'Groupe d’entretiens'
      let nom = base
      for (let suffixe = 2; noms.has(normaliserNomCas(nom)); suffixe++) nom = `${base} (${suffixe})`
      noms.add(normaliserNomCas(nom))
      const regle: RegleCas = choix.type === 'personnes'
        ? { type: 'personnes', membres: ids.map((personneId) => ({ personneId, inclureEnqueteurs: choix.inclureEnqueteurs })) }
        : { type: 'entretiens', entretienIds: [...ids] }
      return {
        id: nouvelId('cas'), nom, memo: '', creeLe: date, modifieLe: date,
        regles: [regle], rattachements: [],
      }
    })
    const sources = preparerSourcesPassages(await chargerSources(idsSources(nouveaux)))
    if (corpusAttendu !== generationCorpus) throw new Error('Le corpus a changé. Recommencez la création.')
    const personnes = Object.fromEntries((inventaire?.personnes ?? []).map((personne) => [personne.id, personne]))
    return nouveaux.map((cas) => {
      const personnesRetenues = new Set(cas.regles.flatMap(membresPersonnesRegle).map((membre) => membre.personneId))
      const projection = projeterCasDepuisSourcesPreparees({ membership: deps.membership.value, personnes, variables: Object.fromEntries(variablesCas.value.map((v) => [v.id, v])) }, cas, sources, modeTexteCas.value)
      return {
        cas,
        membres: choix.type === 'personnes' ? personnesRetenues.size
          : cas.regles.reduce((total, regle) => total + (regle.type === 'entretiens' ? regle.entretienIds.length : 0), 0),
        enqueteursExclus: choix.type === 'personnes' && !choix.inclureEnqueteurs
          ? (inventaire?.locuteurs ?? []).filter((locuteur) => locuteur.interviewer && locuteur.personneRef !== null && personnesRetenues.has(locuteur.personneRef)).length
          : 0,
        sources: projection.metriques.sourcesDistinctes,
        passages: projection.metriques.passagesDisponibles,
        problemes: projection.problemes,
        diagnostics: projection.diagnosticsRegles.map((diagnostic) =>
          `${diagnostic.entretienId ? deps.membership.value[diagnostic.entretienId]?.titre ?? diagnostic.entretienId : cas.nom} : ${diagnostic.diagnostic}`),
        casExistants: Object.values(deps.cas.value)
          .filter((courant) => cleRegles(courant.regles) === cleRegles(cas.regles))
          .map((courant) => courant.nom),
      }
    })
  }

  async function preparerFamilleCas(params: {
    variableId: string; nom: string; inclureEnqueteurs: boolean; familleId?: string
  }): Promise<ApercuFamilleCas> {
    const corpusAttendu = generationCorpus
    const existante = params.familleId ? famillesCas.value[params.familleId] : undefined
    if (params.familleId && !existante) throw new Error('La famille n’existe plus.')
    const variable = variablesCas.value.find((v) => v.id === (existante?.origine.variableId ?? params.variableId))
    if (!variable) throw new Error('Choisissez une variable.')
    const date = new Date().toISOString()
    const famille: FamilleCas = existante ? structuredClone(toRaw(existante)) : {
      id: nouvelId('famille'), nom: params.nom.trim() || variable.lib, creeLe: date,
      origine: variable.portee === 'locuteur'
        ? { variableId: variable.id, portee: 'locuteur', inclureEnqueteurs: params.inclureEnqueteurs }
        : { variableId: variable.id, portee: 'entretien' },
    }
    const sources = preparerSourcesPassages(await chargerSources(Object.keys(deps.membership.value)))
    if (corpusAttendu !== generationCorpus) throw new Error('Le corpus a changé. Recommencez l’aperçu.')
    const noms = new Set(Object.values(deps.cas.value).map((cas) => normaliserNomCas(cas.nom)))
    const apercu: ApercuFamilleCas = { famille, completion: Boolean(existante), cas: variable.modalites.map((modalite) => {
      let nom = modalite.lib
      for (let suffixe = 2; noms.has(normaliserNomCas(nom)); suffixe++) nom = `${modalite.lib} (${suffixe})`
      noms.add(normaliserNomCas(nom))
      const cas: Cas = { id: nouvelId('cas'), nom, memo: '', creeLe: date, modifieLe: date,
        familleId: famille.id, regles: [{ type: 'modalite', ...famille.origine, modaliteId: modalite.id }], rattachements: [] }
      const projection = projeterCasDepuisSourcesPreparees({ membership: deps.membership.value, personnes: {},
        variables: Object.fromEntries(variablesCas.value.map((v) => [v.id, v])) }, cas, sources, modeTexteCas.value)
      const dejaPresent = Object.values(deps.cas.value).some((courant) => courant.familleId === famille.id
        && courant.regles.some((regle) => regle.type === 'modalite' && regle.modaliteId === modalite.id))
      return { cas, projection, dejaPresent, selectionne: !dejaPresent && projection.observationsModalite.membres > 0 }
    }) }
    // Les identités de cet aperçu ne sont valables que dans le corpus qui l’a produit.
    generationsApercus.set(apercu, corpusAttendu)
    return apercu
  }

  async function creerOuCompleterFamilleCas(apercu?: ApercuFamilleCas): Promise<void> {
    if (familleEnCours) throw new Error('Une opération de famille est déjà en cours.')
    if (!creationFamilleEnAttente.value) {
      const brut = apercu ? toRaw(apercu) : undefined
      if (!brut || generationsApercus.get(brut) !== generationCorpus) {
        throw new Error('Prévisualisez la famille dans le corpus courant.')
      }
      const cas = brut.cas.filter((item) => item.selectionne && !item.dejaPresent).map((item) => structuredClone(toRaw(item.cas)))
      if (!cas.length) throw new Error('Choisissez au moins une modalité.')
      creationFamilleEnAttente.value = { type: brut.completion ? 'completer-famille' : 'creer-famille', famille: structuredClone(toRaw(brut.famille)), cas }
    }
    const commande = structuredClone(toRaw(creationFamilleEnAttente.value!))
    const corpusAttendu = generationCorpus
    familleEnCours = true
    try {
      await commanderCas(commande)
      if (corpusAttendu !== generationCorpus) throw new Error('Le corpus a changé pendant la création.')
      creationFamilleEnAttente.value = null
      casOuvertId.value = commande.cas[0].id
    } finally {
      familleEnCours = false
    }
  }

  function abandonnerCreationFamilleCas(): void {
    if (!familleEnCours) creationFamilleEnAttente.value = null
  }

  async function dissoudreFamilleCas(famille: FamilleCas, membresAttendus: string[]): Promise<void> {
    await commanderCas({ type: 'dissoudre-famille', famille: structuredClone(toRaw(famille)), membresAttendus: [...membresAttendus] })
  }

  async function creerLotCas(nouveaux?: Cas[]): Promise<string[]> {
    if (creationLotEnCours) throw new Error('Une création de cas est déjà en cours.')
    if (!creationCasEnAttente.value) {
      if (!nouveaux?.length) throw new Error('Prévisualisez les cas avant de les créer.')
      creationCasEnAttente.value = { type: 'creer-lot', cas: nouveaux.map((cas) => structuredClone(toRaw(cas))) }
    }
    const commande = structuredClone(toRaw(creationCasEnAttente.value))
    const corpusAttendu = generationCorpus
    creationLotEnCours = true
    try {
      await commanderCas(commande)
      if (corpusAttendu !== generationCorpus) throw new Error('Le corpus a changé pendant la création.')
      creationCasEnAttente.value = null
      casOuvertId.value = commande.cas[0].id
      return commande.cas.map((cas) => cas.id)
    } finally {
      creationLotEnCours = false
    }
  }

  function abandonnerCreationCas(): void {
    if (!creationLotEnCours) creationCasEnAttente.value = null
  }

  async function creerCasVide(params: { nom: string; memo: string }): Promise<string> {
    const date = new Date().toISOString()
    const id = nouvelId('cas')
    await commanderCas({
      type: 'creer',
      cas: {
        id,
        nom: params.nom,
        memo: params.memo,
        creeLe: date,
        modifieLe: date,
        regles: [],
        rattachements: [],
      },
    })
    casOuvertId.value = id
    return id
  }

  async function creerCasDepuisPersonne(params: {
    personneId: string
    nom: string
    memo: string
    inclureEnqueteurs: boolean
  }): Promise<string> {
    const inventaire = await chargerInventairePersonnes()
    if (!inventaire.personnes.some((personne) => personne.id === params.personneId)) {
      throw new Error("Cette personne n'existe plus.")
    }
    const date = new Date().toISOString()
    const id = nouvelId('cas')
    await commanderCas({
      type: 'creer',
      cas: {
        id,
        nom: params.nom,
        memo: params.memo,
        creeLe: date,
        modifieLe: date,
        regles: [{
          type: 'personne',
          personneId: params.personneId,
          inclureEnqueteurs: params.inclureEnqueteurs,
        }],
        rattachements: [],
      },
    })
    casOuvertId.value = id
    return id
  }

  async function associerSelectionCas(
    casIds: string[],
    nouveau?: { nom: string; memo: string },
  ): Promise<void> {
    exigerSources()
    const selection = associationCas.value
    if (!selection) throw new Error('La sélection à associer n’est plus disponible.')
    let attente = ajoutCasEnAttente.value
    if (!attente) {
      if (!casIds.length && !nouveau) throw new Error('Choisissez au moins un cas.')
      if (casIds.some((id) => !deps.cas.value[id])) {
        throw new Error("Un cas sélectionné n'existe plus. Actualisez la liste.")
      }
      if (nouveau) {
        if (!nouveau.nom.trim()) throw new Error('Le nom du cas est obligatoire.')
        const cle = normaliserNomCas(nouveau.nom)
        if (Object.values(deps.cas.value).some((courant) => normaliserNomCas(courant.nom) === cle)) {
          throw new Error('Un cas porte déjà ce nom. Associez plutôt la sélection au cas existant.')
        }
      }
      const repere = await deps.enregistrerRepereSelection(selection)
      const date = new Date().toISOString()
      const rattachement: RattachementCas = {
        id: nouvelId('rattachement'),
        source: { entretienId: selection.entretienId, repereId: repere.id },
        provenance: 'manuel',
        creeLe: date,
      }
      attente = {
        casIds: [...casIds],
        rattachement,
        ...(nouveau ? {
          nouveauCas: {
            id: nouvelId('cas'),
            nom: nouveau.nom,
            memo: nouveau.memo,
            creeLe: date,
            modifieLe: date,
            regles: [],
            rattachements: [structuredClone(rattachement)],
          },
        } : {}),
      }
      ajoutCasEnAttente.value = attente
    }
    try {
      const commande = structuredClone(toRaw(attente))
      await commanderCas({ type: 'ajouter-rattachements', ...commande })
      casOuvertId.value = attente.nouveauCas?.id ?? attente.casIds[0] ?? null
      ajoutCasEnAttente.value = null
      associationCas.value = null
    } catch (erreur) {
      messageCas.value = 'Le repère a été conservé. Réessayez pour terminer l’association ou abandonnez la tentative.'
      throw erreur
    }
  }

  async function renommerCas(nom: string): Promise<void> {
    const courant = casOuvert.value
    if (courant) await commanderCas({
      type: 'renommer', casId: courant.id, attendu: courant.nom, nom,
    })
  }

  async function modifierMemoCas(memo: string): Promise<void> {
    const courant = casOuvert.value
    if (courant) await commanderCas({
      type: 'modifier-memo', casId: courant.id, attendu: courant.memo, memo,
    })
  }

  async function supprimerCas(): Promise<void> {
    const courant = casOuvert.value
    if (!courant) return
    await commanderCas({
      type: 'supprimer-cas', casId: courant.id, attenduModifieLe: courant.modifieLe,
    })
    casOuvertId.value = null
  }

  async function retirerRattachementCas(rattachement: RattachementCas): Promise<void> {
    const courant = casOuvert.value
    if (!courant) return
    await commanderCas({
      type: 'retirer-rattachement',
      casId: courant.id,
      rattachementId: rattachement.id,
      attendu: structuredClone(toRaw(rattachement)),
    })
  }

  /** Inventaire des usages d'une définition, pour annoncer la suppression. */
  function usagesAttribut(attributId: string) {
    return compterUsagesAttributCas(
      { cas: deps.cas.value, famillesCas: famillesCas.value },
      attributId,
    )
  }

  /** Enregistre une définition partagée ; l'ordre suit la fin du registre. */
  async function creerDefinitionAttribut(params: {
    lib: string
    type: 'texte' | 'modalites'
    priv: boolean
    modalites: Array<{ id?: string; lib: string }>
  }): Promise<void> {
    const ordre = Object.values(attributsCasRef.value)
      .reduce((maximum, definition) => Math.max(maximum, definition.ordre), 0)
    await commanderCas({
      type: 'creer-attribut',
      definition: {
        id: nouvelId('attribut-cas'),
        lib: params.lib,
        type: params.type,
        priv: params.priv,
        ordre: ordre + 1,
        modalites: params.type === 'texte' ? [] : params.modalites.map((modalite) => ({
          id: modalite.id ?? nouvelId('mod-attribut'),
          lib: modalite.lib,
        })),
      },
    })
  }

  async function modifierDefinitionAttribut(
    attributId: string,
    patch: Partial<Pick<DefinitionAttributCas, 'lib' | 'priv' | 'modalites'>>,
  ): Promise<void> {
    const courante = attributsCasRef.value[attributId]
    if (!courante) throw new Error("Cet attribut n'existe plus.")
    await commanderCas({
      type: 'modifier-attribut',
      attributId,
      attendu: structuredClone(toRaw(courante)),
      patch: structuredClone(toRaw(patch)),
    })
  }

  async function supprimerDefinitionAttribut(attributId: string): Promise<void> {
    await commanderCas({ type: 'supprimer-attribut', attributId })
  }

  /** Saisit (ou efface) une valeur sur le cas ouvert, sous valeur attendue. */
  async function definirValeurAttribut(attributId: string, valeur: string | null): Promise<void> {
    const courant = casOuvert.value
    if (!courant) throw new Error('Aucun cas ouvert.')
    await commanderCas({
      type: 'definir-valeur-attribut',
      casId: courant.id,
      attributId,
      attendu: courant.valeursAttributsSaisis?.[attributId] ?? null,
      valeur,
    })
  }

  /** Variables de la portée de la famille, avec disponibilité et diagnostics. */
  async function apercuVariablesFamille(familleId: string): Promise<VariableCandidateFamille[]> {
    const famille = famillesCas.value[familleId]
    if (!famille) throw new Error('La famille n’existe plus.')
    const sources = await chargerSources(Object.keys(deps.membership.value))
    return variablesDisponiblesFamille(corpusPourProjections(), famille, sources)
  }

  /** Évalue une recette pour toute la famille, sans écrire dans le corpus. */
  async function apercuDerivationFamille(
    familleId: string,
    variableSourceId: string,
  ): Promise<{ famille: FamilleCas; derivation: DerivationAttributCas; evaluation: ReturnType<typeof evaluerDerivationFamille> }> {
    const famille = famillesCas.value[familleId]
    if (!famille) throw new Error('La famille n’existe plus.')
    const derivation: DerivationAttributCas = {
      attributId: 'apercu', variableSourceId, porteeSource: famille.origine.portee,
    }
    const sources = await chargerSources(Object.keys(deps.membership.value))
    return {
      famille, derivation,
      evaluation: evaluerDerivationFamille(corpusPourProjections(), famille, derivation, sources),
    }
  }

  async function ajouterDerivationFamille(
    familleId: string,
    params: {
      variableSourceId: string
      attributExistantId?: string
      nouvelleDefinition?: { lib: string; priv: boolean }
    },
  ): Promise<boolean> {
    exigerSources()
    const famille = famillesCas.value[familleId]
    if (!famille) throw new Error('La famille n’existe plus.')
    const variable = variablesCas.value.find((v) => v.id === params.variableSourceId)
    if (!variable || variable.portee !== famille.origine.portee) {
      throw new Error('La variable source est absente ou sa portée ne correspond pas à la famille.')
    }
    const { derivation, definition } = construireRecette(
      params, famille.origine.portee,
    )
    const membresAttendus = Object.values(deps.cas.value)
      .filter((courant) => courant.familleId === familleId).map((courant) => courant.id).sort()
    return lancerOperationGlobale(() => commanderCas({
      type: 'ajouter-derivation-famille', familleId,
      membresAttendus, derivation,
      ...(definition ? { definition } : {}),
    }))
  }

  async function retirerDerivationFamille(familleId: string, attributId: string): Promise<void> {
    const famille = famillesCas.value[familleId]
    if (!famille) throw new Error('La famille n’existe plus.')
    const attendu = (famille.derivationsAttributs ?? []).find((derivation) =>
      derivation.attributId === attributId)
    if (!attendu) throw new Error('Cette recette a déjà été retirée.')
    await commanderCas({
      type: 'retirer-derivation-famille', familleId, attributId,
      attendu: structuredClone(toRaw(attendu)),
    })
  }

  /** Variables dérivables pour le cas ouvert : même portée que ses observations. */
  async function apercuVariablesDerivationCas(casId: string): Promise<Variable[]> {
    exigerSources()
    const courant = deps.cas.value[casId]
    if (!courant) throw new Error('Ce cas n’existe plus.')
    const portee = porteeObservationsCas(courant)
    if (!portee) return []
    return variablesCas.value.filter((variable) => variable.portee === portee)
  }

  /** Évalue une dérivation propre sur le cas, sans écrire dans le corpus. */
  async function apercuDerivationPropre(
    casId: string,
    variableSourceId: string,
  ): Promise<DiagnosticAttributCas> {
    const courant = deps.cas.value[casId]
    if (!courant) throw new Error('Ce cas n’existe plus.')
    const variable = variablesCas.value.find((v) => v.id === variableSourceId)
    const portee = porteeObservationsCas(courant)
    if (!variable || variable.portee !== portee) {
      throw new Error('La variable doit avoir la même portée que les observations du cas.')
    }
    const derivation: DerivationAttributCas = {
      attributId: 'apercu', variableSourceId, porteeSource: variable.portee,
    }
    const sources = await chargerSources(idsSources([courant]))
    return resoudreDerivationCas(corpusPourProjections(), courant, derivation, sources)
  }

  /** Construit la recette et, si demandé, la définition cible (ordre suivant
   *  le registre, sans modalités : la valeur dérivée se résout depuis la
   *  variable source, aucune copie n'est persistée). */
  function construireRecette(
    params: { variableSourceId: string; attributExistantId?: string; nouvelleDefinition?: { lib: string; priv: boolean } },
    porteeSource: DerivationAttributCas['porteeSource'],
  ): { derivation: DerivationAttributCas; definition?: DefinitionAttributCas } {
    if (params.attributExistantId) {
      return {
        derivation: { attributId: params.attributExistantId, variableSourceId: params.variableSourceId, porteeSource },
      }
    }
    const lib = params.nouvelleDefinition?.lib?.trim()
    if (!lib) throw new Error('Le libellé du nouvel attribut est obligatoire.')
    const ordre = Object.values(attributsCasRef.value)
      .reduce((maximum, definition) => Math.max(maximum, definition.ordre), 0)
    const id = nouvelId('attribut-cas')
    return {
      derivation: { attributId: id, variableSourceId: params.variableSourceId, porteeSource },
      definition: {
        id, lib, type: 'modalites',
        priv: params.nouvelleDefinition?.priv ?? false,
        ordre: ordre + 1, modalites: [],
      },
    }
  }

  async function ajouterDerivationPropre(
    casId: string,
    params: {
      variableSourceId: string
      attributExistantId?: string
      nouvelleDefinition?: { lib: string; priv: boolean }
    },
  ): Promise<boolean> {
    exigerSources()
    const courant = deps.cas.value[casId]
    if (!courant) throw new Error('Ce cas n’existe plus.')
    const portee = porteeObservationsCas(courant)
    if (!portee) throw new Error('Un cas manuel ne peut pas recevoir d’attribut dérivé.')
    const { derivation, definition } = construireRecette(params, portee)
    return lancerOperationGlobale(() => commanderCas({
      type: 'ajouter-derivation-cas', casId, derivation,
      ...(definition ? { definition } : {}),
    }))
  }

  async function retirerDerivationPropre(casId: string, attributId: string): Promise<void> {
    const courant = deps.cas.value[casId]
    if (!courant) throw new Error('Ce cas n’existe plus.')
    const attendu = (courant.derivationsPropres ?? []).find((derivation) =>
      derivation.attributId === attributId)
    if (!attendu) throw new Error('Cette recette a déjà été retirée.')
    await commanderCas({
      type: 'retirer-derivation-cas', casId, attributId,
      attendu: structuredClone(toRaw(attendu)),
    })
  }

  async function changerModeTexteCas(mode: ModeTextePassage): Promise<void> {
    modeTexteCas.value = mode
    await rafraichirProjections()
  }

  async function voirPassageCas(passage: PassageCasProjete): Promise<void> {
    if (passage.etat !== 'disponible' || passage.from === null) return
    const entretienId = passage.origine.type === 'manuel'
      ? passage.origine.source.entretienId
      : passage.origine.entretienId
    casOuverts.value = false
    await deps.ouvrirSource(entretienId, passage.from)
  }

  watch(casOuvertId, () => { modeMateriauxCas.value = 'tous' }, { flush: 'sync' })

  watch(deps.cas, () => {
    if (casOuvertId.value && !deps.cas.value[casOuvertId.value]) casOuvertId.value = null
    if (casOuverts.value && etatSauvegardeCas.value !== 'enregistrement…') {
      void rafraichirProjections()
    }
  })
  watch([variablesCas, famillesCas, attributsCasRef], () => {
    if (casOuverts.value) void rafraichirProjections()
  })
  watch(deps.membership, () => {
    if (casOuverts.value) void rafraichirProjections()
  })

  return {
    famillesCas, variablesCas, preparerFamilleCas, creerOuCompleterFamilleCas,
    creationFamilleEnAttente, abandonnerCreationFamilleCas, dissoudreFamilleCas,
    attributsCas: attributsCasRef,
    attributsProjeteCas,
    attributsCasOuvert,
    usagesAttribut,
    creerDefinitionAttribut,
    modifierDefinitionAttribut,
    supprimerDefinitionAttribut,
    definirValeurAttribut,
    apercuVariablesFamille,
    apercuDerivationFamille,
    ajouterDerivationFamille,
    retirerDerivationFamille,
    apercuVariablesDerivationCas,
    apercuDerivationPropre,
    ajouterDerivationPropre,
    retirerDerivationPropre,
    listeCas,
    casOuvert,
    casOuvertId,
    casOuverts,
    projectionCas,
    projectionsCas,
    inventairePersonnesCas,
    modeTexteCas,
    modeMateriauxCas,
    vueMateriauxCas,
    chargementCas,
    messageCas,
    etatSauvegardeCas,
    associationCas,
    ajoutCasEnAttente,
    afficherCas,
    afficherCasPourAssociation,
    fermerCas,
    annulerAssociationCas,
    reinitialiserCas,
    ouvrirCas,
    rafraichirProjectionsCas: rafraichirProjections,
    previsualiserPersonne,
    entretiensCas,
    preparerLotCas,
    creerLotCas,
    creationCasEnAttente,
    abandonnerCreationCas,
    creerCasVide,
    creerCasDepuisPersonne,
    associerSelectionCas,
    renommerCas,
    modifierMemoCas,
    supprimerCas,
    retirerRattachementCas,
    changerModeTexteCas,
    voirPassageCas,
  }
}
