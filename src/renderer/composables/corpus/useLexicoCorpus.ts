import { computed, ref, toRaw, watch, type Ref } from 'vue'
import type { Categorie, EntretienFichier, EntretienRef, Personne, Variable } from '../../../shared/format'
import type { Cas } from '../../../shared/corpus/cas'
import { agregerOccurrencesLexico, selectionnerOccurrencesLexico } from '../../../shared/lexico/moteur'
import { filtresLexicoParDefaut, type DiagnosticLexico, type FiltresLexico, type OccurrenceLexico, type PlageLexico, type TraitementsLexico } from '../../../shared/lexico/types'
import { appliquerTraitementsLexico, LISTES_MOTS_OUTILS, normaliserFormeLexico, normaliserTraitementsLexico, traitementsLexicoParDefaut } from '../../../shared/lexico/traitements'
import { nombreCriteresLexico, resumerFiltresLexico } from '../../../shared/lexico/resume'
import { extraireOccurrencesLexico } from '../../editor/lexico'
import { preparerSourcesPassages, type SourcePassageChargee } from '../../editor/passages'
import { projeterCasDepuisSourcesPreparees } from '../../editor/cas'

interface SourceLexico {
  id: string
  reference: EntretienRef
  lecture: SourcePassageChargee
}

/** Dimension de filtres affichée dans la colonne de gauche de l'espace. */
export type OngletFiltresLexico = 'entretiens' | 'variables' | 'personnes' | 'themes' | 'cas'

/** Charge une session Lexico et dérive toutes ses vues du même index. */
export function useLexicoCorpus(deps: {
  membership: Ref<Record<string, EntretienRef>>
  variables: Ref<Variable[]>
  codebook: Ref<Categorie[]>
  cas: Ref<Record<string, Cas>>
  traitements: Ref<TraitementsLexico>
  ouvertId: Ref<string | null>
  sourceOuverte: () => EntretienFichier | null
  ouvrirSource: (entretienId: string, pos: number) => Promise<void> | void
}) {
  const chargementLexico = ref(false)
  const progressionLexico = ref({ faits: 0, total: 0 })
  const occurrencesLexico = ref<OccurrenceLexico[]>([])
  const diagnosticsSourcesLexico = ref<DiagnosticLexico[]>([])
  const diagnosticsCasLexico = ref<Record<string, DiagnosticLexico[]>>({})
  const personnesLexico = ref<Personne[]>([])
  const plagesCasLexico = ref<Record<string, PlageLexico[]>>({})
  const filtresLexico = ref<FiltresLexico>(filtresLexicoParDefaut())
  /** Onglet de filtres courant ; état de vue, réinitialisé avec le corpus. */
  const ongletFiltresLexico = ref<OngletFiltresLexico>('entretiens')
  const traitementsLexico = deps.traitements
  const historiqueTraitementsLexico = ref<TraitementsLexico[]>([])
  const enregistrementTraitementsLexico = ref(false)
  const resultatsPerimesLexico = ref(false)
  const calculeLeLexico = ref<Date | null>(null)
  let generation = 0

  const contexteSelection = computed(() => ({
    variables: deps.variables.value,
    cas: plagesCasLexico.value,
  }))
  const occurrencesTraiteesLexico = computed(() => appliquerTraitementsLexico(
    occurrencesLexico.value,
    traitementsLexico.value,
  ))
  const occurrencesRetenuesLexico = computed(() => selectionnerOccurrencesLexico(
    occurrencesTraiteesLexico.value,
    filtresLexico.value,
    contexteSelection.value,
  ))
  const diagnosticsLexico = computed(() => {
    const selection = filtresLexico.value.cas
    const diagnosticsCas = selection.mode === 'choix'
      ? selection.ids.flatMap((id) => diagnosticsCasLexico.value[id] ?? [])
      : []
    return [...diagnosticsSourcesLexico.value, ...diagnosticsCas]
  })
  const lignesLexico = computed(() => agregerOccurrencesLexico(occurrencesRetenuesLexico.value))
  const entretiensAvecResultatsLexico = computed(() =>
    new Set(occurrencesRetenuesLexico.value.map((occurrence) => occurrence.entretienId)).size)
  const contexteResumeLexico = computed(() => ({
    entretiens: Object.entries(deps.membership.value).map(([id, reference]) => ({ id, nom: reference.titre })),
    variables: deps.variables.value,
    personnes: personnesLexico.value,
    themes: deps.codebook.value,
    cas: Object.values(deps.cas.value),
  }))
  const lignesResumeLexico = computed(() => resumerFiltresLexico(
    filtresLexico.value,
    contexteResumeLexico.value,
  ))
  const criteresActifsLexico = computed(() => nombreCriteresLexico(filtresLexico.value))
  const exportLexicoPossible = computed(() => Boolean(calculeLeLexico.value)
    && !resultatsPerimesLexico.value
    && !chargementLexico.value
    && diagnosticsLexico.value.length === 0)

  async function chargerSources(jeton: number): Promise<SourceLexico[]> {
    const entrees = Object.entries(deps.membership.value)
    progressionLexico.value = { faits: 0, total: entrees.length }
    const resultats = new Array<SourceLexico>(entrees.length)
    let suivant = 0
    async function travailleur() {
      for (;;) {
        const index = suivant++
        if (index >= entrees.length || jeton !== generation) return
        const [id, reference] = entrees[index]
        let lecture: SourcePassageChargee
        if (id === deps.ouvertId.value) {
          const data = deps.sourceOuverte()
          lecture = data ? { ok: true, data } : { ok: false, raison: 'La source ouverte ne peut pas être lue.' }
        } else {
          try {
            const resultat = await window.sonal.corpus.lireEntretien(id)
            lecture = resultat.ok
              ? { ok: true, data: resultat.data }
              : { ok: false, raison: resultat.raison, invalide: resultat.raison === 'version' }
          } catch (erreur) {
            lecture = { ok: false, raison: erreur instanceof Error ? erreur.message : String(erreur) }
          }
        }
        resultats[index] = { id, reference, lecture }
        if (jeton === generation) progressionLexico.value = {
          faits: progressionLexico.value.faits + 1,
          total: entrees.length,
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, entrees.length) }, travailleur))
    return resultats.filter(Boolean)
  }

  async function actualiserLexico(): Promise<void> {
    const jeton = ++generation
    chargementLexico.value = true
    const diagnostics: DiagnosticLexico[] = []
    try {
      let personnes: Personne[] = []
      try {
        // L'inventaire ne force pas la publication de l'entretien ouvert.
        // Ses locuteurs seront relus depuis l'instantané en mémoire ci-dessous.
        personnes = (await window.sonal.corpus.personnesInventaire()).personnes
      } catch (erreur) {
        diagnostics.push({ titre: 'Personnes', message: erreur instanceof Error ? erreur.message : String(erreur) })
      }
      const sources = await chargerSources(jeton)
      if (jeton !== generation) return
      const index: OccurrenceLexico[] = []
      const parId = new Map<string, SourcePassageChargee>()
      for (const source of sources) {
        parId.set(source.id, source.lecture)
        if (!source.lecture.ok) {
          diagnostics.push({ entretienId: source.id, titre: source.reference.titre, message: source.lecture.raison })
          continue
        }
        try {
          index.push(...extraireOccurrencesLexico(source.id, source.reference, source.lecture.data))
          const erreursValeurs: string[] = []
          for (const [variableId, modaliteId] of Object.entries(source.lecture.data.meta?.valeursGen ?? {})) {
            const variable = deps.variables.value.find((candidate) => candidate.id === variableId)
            if (!variable || variable.portee !== 'entretien' || !variable.modalites.some((modalite) => modalite.id === modaliteId)) {
              erreursValeurs.push(variable?.lib ?? variableId)
            }
          }
          for (const locuteur of source.lecture.data.locuteurs) {
            for (const [variableId, modaliteId] of Object.entries(locuteur.valeursLoc ?? {})) {
              const variable = deps.variables.value.find((candidate) => candidate.id === variableId)
              if (!variable || variable.portee !== 'locuteur' || !variable.modalites.some((modalite) => modalite.id === modaliteId)) {
                erreursValeurs.push(`${variable?.lib ?? variableId} (${locuteur.nom})`)
              }
            }
          }
          if (erreursValeurs.length) diagnostics.push({
            entretienId: source.id,
            titre: source.reference.titre,
            message: `Valeur(s) de variable invalide(s) : ${[...new Set(erreursValeurs)].join(', ')}.`,
          })
        } catch {
          diagnostics.push({ entretienId: source.id, titre: source.reference.titre, message: 'La transcription ne peut pas être analysée.' })
        }
      }

      const preparees = preparerSourcesPassages(parId)
      const personnesParId = Object.fromEntries(personnes.map((personne) => [personne.id, personne]))
      const variablesParId = Object.fromEntries(deps.variables.value.map((variable) => [variable.id, variable]))
      const plagesCas: Record<string, PlageLexico[]> = {}
      const diagnosticsParCas: Record<string, DiagnosticLexico[]> = {}
      for (const cas of Object.values(deps.cas.value)) {
        const projection = projeterCasDepuisSourcesPreparees({
          membership: deps.membership.value,
          personnes: personnesParId,
          variables: variablesParId,
        }, structuredClone(toRaw(cas)), preparees, 'pseudonymise')
        plagesCas[cas.id] = projection.passages.flatMap((passage) => {
          if (passage.etat !== 'disponible' || passage.from === null || passage.to === null) return []
          const entretienId = passage.origine.type === 'manuel'
            ? passage.origine.source.entretienId
            : passage.origine.entretienId
          return [{ entretienId, from: passage.from, to: passage.to }]
        })
        diagnosticsParCas[cas.id] = [
          ...projection.diagnosticsRegles.map((probleme) => ({
            entretienId: probleme.entretienId ?? undefined,
            titre: cas.nom,
            message: probleme.diagnostic,
          })),
          ...projection.passages.filter((item) => item.etat !== 'disponible').map((passage) => ({
            titre: cas.nom,
            message: passage.diagnostic ?? 'Un matériau du cas est indisponible.',
          })),
        ]
      }
      if (jeton !== generation) return
      occurrencesLexico.value = index
      diagnosticsSourcesLexico.value = diagnostics
      diagnosticsCasLexico.value = diagnosticsParCas
      personnesLexico.value = personnes
      plagesCasLexico.value = plagesCas
      calculeLeLexico.value = new Date()
      resultatsPerimesLexico.value = false
    } finally {
      if (jeton === generation) chargementLexico.value = false
    }
  }

  /** Charge l'index au premier accès ou lorsque les sources ont changé. */
  async function preparerLexico(): Promise<void> {
    if (chargementLexico.value) return
    if (!calculeLeLexico.value || resultatsPerimesLexico.value) await actualiserLexico()
  }

  function perimerLexico(): void {
    if (calculeLeLexico.value) resultatsPerimesLexico.value = true
  }

  function reinitialiserSelectionLexico(): void {
    filtresLexico.value = filtresLexicoParDefaut()
  }

  async function enregistrerTraitementsLexico(
    traitements: TraitementsLexico,
    memoriser: TraitementsLexico | null,
  ): Promise<void> {
    if (enregistrementTraitementsLexico.value) throw new Error('Un enregistrement Lexico est déjà en cours.')
    const attendu = structuredClone(toRaw(traitementsLexico.value))
    enregistrementTraitementsLexico.value = true
    try {
      const corpus = await window.sonal.corpus.lexicoCommander({ type: 'remplacer', attendu, traitements })
      traitementsLexico.value = normaliserTraitementsLexico(corpus.lexico)
      if (memoriser) historiqueTraitementsLexico.value = [
        ...historiqueTraitementsLexico.value.slice(-29),
        structuredClone(toRaw(memoriser)),
      ]
    } finally {
      enregistrementTraitementsLexico.value = false
    }
  }

  async function modifierTraitementsLexico(mutateur: (copie: TraitementsLexico) => void): Promise<void> {
    const avant = structuredClone(toRaw(traitementsLexico.value))
    const copie = structuredClone(avant)
    mutateur(copie)
    await enregistrerTraitementsLexico(copie, avant)
  }

  async function ajouterMotsOutilsLexico(formes: string[]): Promise<void> {
    const nouvelles = formes.map(normaliserFormeLexico).filter(Boolean)
    if (!nouvelles.length) return
    await modifierTraitementsLexico((traitements) => {
      traitements.motsOutils = [...new Set([...traitements.motsOutils, ...nouvelles])].sort((a, b) => a.localeCompare(b, 'fr'))
    })
  }

  async function personnaliserListeMotsOutilsLexico(nom: string, formes: string[]): Promise<void> {
    if (!Object.hasOwn(LISTES_MOTS_OUTILS, nom)) throw new Error('Cette liste de mots outils n’existe pas.')
    await modifierTraitementsLexico((traitements) => {
      traitements.listesMotsOutils ??= {}
      traitements.listesMotsOutils[nom] = formes
    })
  }

  async function restaurerListeMotsOutilsLexico(nom: string): Promise<void> {
    if (!traitementsLexico.value.listesMotsOutils?.[nom]) return
    await modifierTraitementsLexico((traitements) => {
      if (!traitements.listesMotsOutils) return
      delete traitements.listesMotsOutils[nom]
      if (!Object.keys(traitements.listesMotsOutils).length) delete traitements.listesMotsOutils
    })
  }

  async function retirerMotOutilLexico(forme: string): Promise<void> {
    const normalisee = normaliserFormeLexico(forme)
    await modifierTraitementsLexico((traitements) => {
      traitements.motsOutils = traitements.motsOutils.filter((mot) => mot !== normalisee)
    })
  }

  async function regrouperFormesLexico(formes: string[], formeCible: string): Promise<void> {
    const membres = [...new Set(formes.map(normaliserFormeLexico).filter(Boolean))]
    const cible = normaliserFormeLexico(formeCible)
    if (!membres.length || !cible) throw new Error('Choisissez au moins une forme et indiquez la forme de regroupement.')
    await modifierTraitementsLexico((traitements) => {
      traitements.regroupements = traitements.regroupements.flatMap((regroupement) => {
        const restants = regroupement.membres.filter((membre) => !membres.includes(membre))
        return restants.length ? [{ ...regroupement, membres: restants }] : []
      })
      traitements.regroupements.push({ id: globalThis.crypto.randomUUID(), forme: cible, membres })
    })
  }

  async function retirerRegroupementLexico(id: string): Promise<void> {
    await modifierTraitementsLexico((traitements) => {
      traitements.regroupements = traitements.regroupements.filter((regroupement) => regroupement.id !== id)
    })
  }

  async function ajouterConcatenationLexico(sequenceBrute: string[], formeCible: string): Promise<void> {
    const sequence = sequenceBrute.map(normaliserFormeLexico).filter(Boolean)
    if (sequence.length < 2) throw new Error('Une concaténation demande au moins deux formes successives.')
    const forme = normaliserFormeLexico(formeCible) || sequence.join(' ')
    await modifierTraitementsLexico((traitements) => {
      traitements.concatenations = traitements.concatenations.filter((regle) => regle.sequence.join('\0') !== sequence.join('\0'))
      traitements.concatenations.push({ id: globalThis.crypto.randomUUID(), forme, sequence })
    })
  }

  async function retirerConcatenationLexico(id: string): Promise<void> {
    await modifierTraitementsLexico((traitements) => {
      traitements.concatenations = traitements.concatenations.filter((regle) => regle.id !== id)
    })
  }

  async function annulerTraitementLexico(): Promise<void> {
    const precedent = historiqueTraitementsLexico.value.at(-1)
    if (!precedent) return
    await enregistrerTraitementsLexico(structuredClone(toRaw(precedent)), null)
    historiqueTraitementsLexico.value = historiqueTraitementsLexico.value.slice(0, -1)
  }

  async function reinitialiserTraitementsLexico(): Promise<void> {
    if (!traitementsLexico.value.motsOutils.length
      && !traitementsLexico.value.regroupements.length
      && !traitementsLexico.value.concatenations.length) return
    await modifierTraitementsLexico((traitements) => {
      traitements.motsOutils = []
      traitements.regroupements = []
      traitements.concatenations = []
    })
  }

  function reinitialiserLexico(): void {
    generation++
    chargementLexico.value = false
    progressionLexico.value = { faits: 0, total: 0 }
    occurrencesLexico.value = []
    diagnosticsSourcesLexico.value = []
    diagnosticsCasLexico.value = {}
    personnesLexico.value = []
    plagesCasLexico.value = {}
    filtresLexico.value = filtresLexicoParDefaut()
    ongletFiltresLexico.value = 'entretiens'
    traitementsLexico.value = traitementsLexicoParDefaut()
    historiqueTraitementsLexico.value = []
    enregistrementTraitementsLexico.value = false
    resultatsPerimesLexico.value = false
    calculeLeLexico.value = null
  }

  async function voirOccurrenceLexico(occurrence: OccurrenceLexico): Promise<void> {
    await deps.ouvrirSource(occurrence.entretienId, occurrence.from)
  }

  watch([deps.membership, deps.variables, deps.codebook, deps.cas], perimerLexico, { deep: true })

  return {
    chargementLexico, progressionLexico, occurrencesLexico,
    occurrencesTraiteesLexico, occurrencesRetenuesLexico, lignesLexico, diagnosticsLexico, personnesLexico,
    filtresLexico, ongletFiltresLexico, traitementsLexico, historiqueTraitementsLexico, enregistrementTraitementsLexico,
    resultatsPerimesLexico, calculeLeLexico,
    entretiensAvecResultatsLexico, lignesResumeLexico, criteresActifsLexico,
    exportLexicoPossible, preparerLexico, actualiserLexico,
    perimerLexico, reinitialiserSelectionLexico, reinitialiserLexico,
    ajouterMotsOutilsLexico, retirerMotOutilLexico,
    personnaliserListeMotsOutilsLexico, restaurerListeMotsOutilsLexico,
    regrouperFormesLexico, retirerRegroupementLexico,
    ajouterConcatenationLexico, retirerConcatenationLexico,
    annulerTraitementLexico, reinitialiserTraitementsLexico,
    voirOccurrenceLexico,
  }
}
