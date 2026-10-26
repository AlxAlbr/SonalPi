<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import RapprochementCorpus from './RapprochementCorpus.vue'
import ModaleJournalCorpus from './ModaleJournalCorpus.vue'
import { utiliserSonal } from '../../../composables/sonal'
import { analyserRapprochementPersonne, natureNomPersonne, suggestionsPersonnes } from '../../../../shared/corpus/rapprochementsPersonnes'
import type { CommandePersonnes, InventairePersonnes, VueLocuteurPersonne } from '../../../../shared/corpus/personnes'

const props = defineProps<{ actif: boolean }>()
const { lirePersonnes, commanderPersonnes, allerLocuteurs, allerNotes, variables, badgeVerrou,
  nomCategorieNote, idDistantCourant, lectureSeule, dernierTirage, dossierCourantDir, vue,
  revisionPersonnesCorpus } = utiliserSonal()
const inventaire = ref<InventairePersonnes>({ personnes: [], locuteurs: [], notes: [], indisponibles: [] })
const annulationsOuvertes = ref(false)
watch([() => props.actif, dossierCourantDir, vue], () => { annulationsOuvertes.value = false })
const selection = ref('')
const titreFiche = ref<HTMLHeadingElement | null>(null)
const recherche = ref('')
const filtre = ref<'tous' | 'problemes' | 'refus'>('tous')
const erreur = ref('')
const erreurLecture = ref(false)
const message = ref('')
const ficheVideId = ref('')
const ficheVide = computed(() => inventaire.value.personnes.find(p => p.id === ficheVideId.value && !inventaire.value.locuteurs.some(l => l.personneRef === p.id)))
const occupe = ref(false)
const charge = ref(false)
let generation = 0
let chargementPersonnes: Promise<void> | null = null
const corpusDistant = computed(() => !!idDistantCourant.value)
const lectureUniquement = computed(() => lectureSeule.value)
const desactive = computed(() => occupe.value || lectureUniquement.value)
const desactiveComposite = computed(() => desactive.value)
const refusComposite = (l: VueLocuteurPersonne) =>
  !l.personneRef && !l.personneDeliee && natureNomPersonne(l.nom) === 'specifique'
const rapprochementDesactive = (_cible: VueLocuteurPersonne, _source: VueLocuteurPersonne) =>
  desactive.value
const personne = computed(() => inventaire.value.personnes.find((p) => `p:${p.id}` === selection.value))
const cleLocuteur = (l: VueLocuteurPersonne) => JSON.stringify([l.entretienId, l.locuteurId])
const rapprochementSelectionne = ref('')
function selectionner(valeur: string, cleRapprochement = '') {
  selection.value = valeur
  rapprochementSelectionne.value = cleRapprochement
}
const locuteur = computed(() => inventaire.value.locuteurs.find((l) => `l:${cleLocuteur(l)}` === selection.value))
const idsPersonnes = computed(() => new Set(inventaire.value.personnes.map((p) => p.id)))
const nombreEntretiensPersonne = (personneId: string) => new Set(inventaire.value.locuteurs
  .filter((l) => l.personneRef === personneId)
  .map((l) => l.entretienId)).size
const libelleEntretiensPersonne = (personneId: string) => {
  const nombre = nombreEntretiensPersonne(personneId)
  return `${nombre} entretien${nombre > 1 ? 's' : ''}`
}
const lies = computed(() => inventaire.value.locuteurs.filter((l) => l.personneRef === personne.value?.id))
const notesLiees = computed(() => {
  const ids = new Set(lies.value.map((l) => l.locuteurId))
  return inventaire.value.notes.filter((note) => note.locuteurIds.some((id) => ids.has(id)))
})
const groupesNotesLiees = computed(() => {
  const groupes = new Map<string, { titre: string; notes: InventairePersonnes['notes'] }>()
  for (const note of notesLiees.value) {
    if (!groupes.has(note.entretienId)) groupes.set(note.entretienId, { titre: note.entretienTitre, notes: [] })
    groupes.get(note.entretienId)!.notes.push(note)
  }
  for (const groupe of groupes.values()) groupe.notes.sort((a, b) => a.rang - b.rang)
  return [...groupes.entries()]
})
const texteNote = (corps: string) => {
  const element = document.createElement('div')
  element.innerHTML = corps
  return element.textContent?.trim() ?? ''
}
const dateNote = (date: string | null) => date
  ? new Date(`${date}T00:00`).toLocaleDateString('fr-FR')
  : 'sans date'
const nonLies = computed(() => inventaire.value.locuteurs.filter((l) => !l.personneRef || !idsPersonnes.value.has(l.personneRef)))
const liensInvalides = computed(() => inventaire.value.locuteurs.filter((l) => l.personneRef && !idsPersonnes.value.has(l.personneRef)))
const doublons = computed(() => inventaire.value.personnes.filter((p) => {
  const ls = inventaire.value.locuteurs.filter((l) => l.personneRef === p.id)
  return new Set(ls.map((l) => l.entretienId)).size !== ls.length
}))
const cleRecherche = (texte: string) => texte.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr')
const correspond = (texte: string) => cleRecherche(texte).includes(cleRecherche(recherche.value.trim()))
const personnesVisibles = computed(() => inventaire.value.personnes.filter((p) =>
  (filtre.value === 'tous' || (filtre.value === 'problemes' && doublons.value.some((d) => d.id === p.id))) &&
  correspond([p.nom, ...inventaire.value.locuteurs.filter((l) => l.personneRef === p.id).map((l) => `${l.nom} ${l.entretienTitre}`)].join(' ')),
))
const groupesNonLies = computed(() => {
  const groupes = new Map<string, { titre: string; locuteurs: VueLocuteurPersonne[] }>()
  for (const l of nonLies.value) {
    if (filtre.value === 'refus' || (filtre.value === 'problemes' && !l.personneRef)) continue
    if (!correspond(`${l.nom} ${l.entretienTitre}`)) continue
    if (!groupes.has(l.entretienId)) groupes.set(l.entretienId, { titre: l.entretienTitre, locuteurs: [] })
    groupes.get(l.entretienId)!.locuteurs.push(l)
  }
  return [...groupes.entries()]
})
const suggestionsParLocuteur = computed(() => {
  const convertir = (l: VueLocuteurPersonne) => ({ entretienId: l.entretienId, locuteur: { ...l, id: l.locuteurId } })
  const tous = inventaire.value.locuteurs.map(convertir)
  return new Map(inventaire.value.locuteurs.map((l) => {
    const suggestions = suggestionsPersonnes(convertir(l), tous)
    return [cleLocuteur(l), inventaire.value.locuteurs.filter((c) => suggestions.some((s) => s.entretienId === c.entretienId && s.locuteur.id === c.locuteurId))]
  }))
})
const cleIdentite = (l: VueLocuteurPersonne) => l.personneRef && idsPersonnes.value.has(l.personneRef)
  ? `p:${l.personneRef}`
  : `l:${cleLocuteur(l)}`
const membresIdentite = (l: VueLocuteurPersonne) => l.personneRef && idsPersonnes.value.has(l.personneRef)
  ? inventaire.value.locuteurs.filter((membre) => membre.personneRef === l.personneRef)
  : [l]
const nomIdentite = (l: VueLocuteurPersonne) => l.personneRef && idsPersonnes.value.has(l.personneRef)
  ? inventaire.value.personnes.find((p) => p.id === l.personneRef)?.nom ?? l.nom
  : l.nom
const libelleIdentite = (l: VueLocuteurPersonne) => {
  const membres = membresIdentite(l)
  return membres.length > 1
    ? `${nomIdentite(l)} · ${membres.length} entretiens (${membres.map((membre) => membre.entretienTitre).join(', ')})`
    : `${nomIdentite(l)} · ${l.entretienTitre}`
}
const rapprochementsAVerifier = computed(() => {
  const vus = new Set<string>()
  return inventaire.value.locuteurs.flatMap((cible) =>
    (suggestionsParLocuteur.value.get(cleLocuteur(cible)) ?? []).flatMap((candidat) => {
      const cle = [cleIdentite(cible), cleIdentite(candidat)].sort().join('\n')
      if (vus.has(cle)) return []
      vus.add(cle)
      const cibleLiee = cleIdentite(cible).startsWith('p:')
      const candidatLie = cleIdentite(candidat).startsWith('p:')
      return cibleLiee && !candidatLie
        ? [{ cle, cible: candidat, candidat: cible }]
        : [{ cle, cible, candidat }]
    }),
  )
})
const rapprochementActif = computed(() => rapprochementsAVerifier.value.find((r) => r.cle === rapprochementSelectionne.value))
const decisionsEcartees = computed(() => inventaire.value.locuteurs.filter((l) => l.rapprochementsRefuses?.length))
const resumeIndisponibles = computed(() => {
  const nombre = inventaire.value.indisponibles.length
  return `${nombre} entretien${nombre > 1 ? 's' : ''} indisponible${nombre > 1 ? 's' : ''}`
})
const candidats = computed(() => locuteur.value ? suggestionsParLocuteur.value.get(cleLocuteur(locuteur.value)) ?? [] : [])
const candidatsAffiches = computed(() => rapprochementActif.value
  ? [rapprochementActif.value.candidat]
  : candidats.value)
function entretiensRapprochement(a: VueLocuteurPersonne, b: VueLocuteurPersonne) {
  const vus = new Set<string>()
  return [...membresIdentite(a), ...membresIdentite(b)].filter((l) => {
    if (vus.has(l.entretienId)) return false
    vus.add(l.entretienId)
    return true
  })
}
function libelleRefus(r: string) {
  if (r.startsWith('personne:')) return inventaire.value.personnes.find((p) => p.id === r.slice(9))?.nom ?? 'Personne absente'
  const l = inventaire.value.locuteurs.find((l) => l.locuteurId === r.slice(9))
  return l ? `${l.nom} · ${l.entretienTitre}` : 'Locuteur absent'
}
const sourceReprise = ref<VueLocuteurPersonne | null>(null)
const autreFiche = ref('')
const cibleRapprochement = computed(() => locuteur.value ?? lies.value[0])
function verifierAutreFiche() {
  sourceReprise.value = inventaire.value.locuteurs.find(l => l.personneRef === autreFiche.value) ?? null
}
function validerRapprochement(commande: CommandePersonnes) {
  sourceReprise.value = null
  void executer(commande)
}
const nom = ref('')
const cible = ref('')
const locuteursSeparation = ref<string[]>([])
const nomSeparation = ref('')
const separationComplete = computed(() => !!lies.value.length && locuteursSeparation.value.length >= lies.value.length)
watch([selection, inventaire], () => {
  nom.value = personne.value?.nom ?? locuteur.value?.nom ?? ''
  cible.value = ''
  autreFiche.value = ''
  sourceReprise.value = null
  locuteursSeparation.value = []
  nomSeparation.value = ''
})
const variablesLoc = computed(() => variables.value.filter((v) => v.portee === 'locuteur'))
function valeur(l: VueLocuteurPersonne, idVar: string) {
  const idMod = l.valeursLoc[idVar]
  if (!idMod) return '—'
  return variablesLoc.value.find((v) => v.id === idVar)?.modalites.find((m) => m.id === idMod)?.lib ?? 'Modalité absente'
}

async function actualiser() {
  if (chargementPersonnes) return chargementPersonnes
  const jeton = ++generation
  occupe.value = true
  let requete!: Promise<void>
  requete = (async () => {
    try {
      const resultat = await lirePersonnes()
      if (jeton !== generation) return
      inventaire.value = resultat
      charge.value = true
      erreur.value = ''
      erreurLecture.value = false
    } catch (e) {
      if (jeton === generation) {
        erreur.value = e instanceof Error ? e.message : String(e)
        erreurLecture.value = true
      }
    } finally {
      if (jeton === generation) occupe.value = false
      if (chargementPersonnes === requete) chargementPersonnes = null
    }
  })()
  chargementPersonnes = requete
  return requete
}
async function executer(commande: CommandePersonnes) {
  if (desactive.value) return
  occupe.value = true
  erreur.value = ''
  erreurLecture.value = false
  message.value = ''
  const jeton = generation
  try {
    const ancienLien = commande.type === 'lier'
      ? inventaire.value.locuteurs.find(l => l.entretienId === commande.entretienId && l.locuteurId === commande.locuteurId)?.personneRef : null
    const id = await commanderPersonnes(commande)
    if (jeton !== generation) return
    if (['creer', 'fusionner', 'rapprocher', 'separer'].includes(commande.type) && id) selection.value = `p:${id}`
    if (commande.type === 'fusionner' || commande.type === 'separer') { filtre.value = 'tous'; recherche.value = '' }
    if (commande.type === 'refuser') { filtre.value = 'refus'; rapprochementSelectionne.value = '' }
    if (commande.type === 'supprimer') selection.value = ''
    ficheVideId.value = ancienLien ?? ''
    message.value = commande.type === 'fusionner'
      ? 'Les entretiens sont maintenant réunis sous une même personne.'
      : commande.type === 'separer'
        ? 'Les locuteurs sélectionnés forment maintenant une nouvelle personne.'
        : 'Modification enregistrée.'
  } catch (e) {
    if (jeton === generation) erreur.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (jeton === generation) {
      const erreurCommande = erreur.value
      await actualiser()
      if (erreurCommande) erreur.value = erreurCommande
      if ((commande.type === 'fusionner' || commande.type === 'separer') && !erreur.value) { await nextTick(); titreFiche.value?.focus() }
    }
  }
}

function enregistrerNom() {
  const fiche = personne.value
  if (!fiche || desactive.value) return
  const valeur = nom.value.trim()
  if (!valeur) {
    nom.value = fiche.nom
    erreurLecture.value = false
    erreur.value = 'Le nom de référence ne peut pas être vide.'
    return
  }
  nom.value = valeur
  if (valeur === fiche.nom) return
  void executer({ type: 'modifier', personneId: fiche.id, nom: valeur })
}

const dialogueAide = ref<HTMLDialogElement | null>(null)
let retourFocusAide: HTMLElement | null = null
async function ouvrirAide() {
  retourFocusAide = document.activeElement as HTMLElement | null
  await nextTick()
  dialogueAide.value?.showModal()
}
function fermerAide() {
  dialogueAide.value?.close()
  retourFocusAide?.focus()
}

const confirmation = ref<{ texte: string; commande: CommandePersonnes } | null>(null)
const dialogue = ref<HTMLDialogElement | null>(null)
let retourFocus: HTMLElement | null = null
async function demander(texte: string, commande: CommandePersonnes) {
  retourFocus = document.activeElement as HTMLElement | null
  confirmation.value = { texte, commande }
  await nextTick()
  dialogue.value?.showModal()
}
function annuler() {
  dialogue.value?.close()
  confirmation.value = null
  retourFocus?.focus()
}
async function confirmer() {
  const commande = confirmation.value?.commande
  annuler()
  if (commande) await executer(commande)
}

type CommandeSeparation = Extract<CommandePersonnes, { type: 'separer' }>
const separation = ref<{ commande: CommandeSeparation; locuteurs: VueLocuteurPersonne[]; restants: number } | null>(null)
const dialogueSeparation = ref<HTMLDialogElement | null>(null)
let retourFocusSeparation: HTMLElement | null = null
async function demanderSeparation() {
  const fiche = personne.value
  const selectionnees = lies.value.filter((lie) => locuteursSeparation.value.includes(cleLocuteur(lie)))
  const nouveauNom = nomSeparation.value.trim()
  if (!fiche || !selectionnees.length || selectionnees.length >= lies.value.length || !nouveauNom || desactiveComposite.value) return
  retourFocusSeparation = document.activeElement as HTMLElement | null
  separation.value = {
    commande: {
      type: 'separer',
      personneId: fiche.id,
      nom: nouveauNom,
      locuteurs: selectionnees.map((lie) => ({ entretienId: lie.entretienId, locuteurId: lie.locuteurId })),
      attendu: JSON.stringify(inventaire.value),
    },
    locuteurs: selectionnees,
    restants: lies.value.length - selectionnees.length,
  }
  await nextTick()
  dialogueSeparation.value?.showModal()
}
function annulerSeparation() {
  dialogueSeparation.value?.close()
  separation.value = null
  retourFocusSeparation?.focus()
}
async function confirmerSeparation() {
  const commande = separation.value?.commande
  annulerSeparation()
  if (commande) await executer(commande)
}
function lier(l: VueLocuteurPersonne, personneId: string | null) {
  const nomCible = inventaire.value.personnes.find((p) => p.id === personneId)?.nom
  const nomSource = inventaire.value.personnes.find((p) => p.id === l.personneRef)?.nom ?? l.personneRef
  const texte = personneId === null
    ? `Ne plus associer « ${l.nom} » dans « ${l.entretienTitre} » à « ${nomSource} » ? Le nom local et ses valeurs seront conservés.`
    : `Associer « ${l.nom} » dans « ${l.entretienTitre} » à « ${nomCible} » ?${l.personneRef ? ` L’association avec « ${nomSource} » sera remplacée.` : ''}`
  void demander(texte, { type: 'lier', entretienId: l.entretienId, locuteurId: l.locuteurId, personneId })
}
async function ouvrir(l: VueLocuteurPersonne) {
  try { await allerLocuteurs(l.entretienId) }
  catch (e) {
    erreurLecture.value = false
    erreur.value = e instanceof Error ? e.message : String(e)
  }
}
async function ouvrirNotes(entretienId: string) {
  try { await allerNotes(entretienId) }
  catch (e) {
    erreurLecture.value = false
    erreur.value = e instanceof Error ? e.message : String(e)
  }
}

const panneau = ref<HTMLElement | null>(null)
const largeur = ref(360)
const verticale = ref(false)
const cleLargeur = 'sonalpi.personnesCorpus.largeurGauche'
let observateur: ResizeObserver | undefined
function borner(valeur: number) {
  return Math.max(240, Math.min(valeur, Math.max(240, (panneau.value?.clientWidth ?? 800) - 370)))
}
function memoriser() {
  try { localStorage.setItem(cleLargeur, String(largeur.value)) } catch { /* Stockage facultatif. */ }
}
function redimensionner(e: PointerEvent) {
  if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId) || !panneau.value) return
  largeur.value = borner(e.clientX - panneau.value.getBoundingClientRect().left)
}
function terminer(e: PointerEvent) {
  const element = e.currentTarget as HTMLElement
  if (element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId)
  memoriser()
}
function ajuster(e: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
  e.preventDefault()
  largeur.value = borner(e.key === 'Home' ? 240 : e.key === 'End' ? Infinity : largeur.value + (e.key === 'ArrowLeft' ? -20 : 20))
  memoriser()
}
onMounted(() => {
  try {
    const valeur = Number(localStorage.getItem(cleLargeur))
    if (Number.isFinite(valeur) && valeur > 0) largeur.value = valeur
  } catch { /* Stockage facultatif. */ }
  observateur = new ResizeObserver(() => {
    const disponible = panneau.value?.clientWidth ?? 0
    if (!disponible) return
    verticale.value = disponible < 720
    if (!verticale.value) largeur.value = borner(largeur.value)
  })
  if (panneau.value) observateur.observe(panneau.value)
})
onBeforeUnmount(() => { generation++; observateur?.disconnect() })
watch(dossierCourantDir, () => {
  generation++
  chargementPersonnes = null
  inventaire.value = { personnes: [], locuteurs: [], notes: [], indisponibles: [] }
  selection.value = ''; recherche.value = ''; filtre.value = 'tous'; charge.value = false
  erreur.value = ''; erreurLecture.value = false; message.value = ''; occupe.value = false
  annuler()
  dialogueSeparation.value?.close()
  separation.value = null
})
watch([() => props.actif, vue, dernierTirage, dossierCourantDir, revisionPersonnesCorpus], () => {
  if (props.actif && vue.value === 'corpus') void actualiser()
  else if (!props.actif && dialogueAide.value?.open) fermerAide()
}, { immediate: true })
</script>

<template>
  <section class="personnes-corpus" aria-label="Personnes du corpus" :aria-busy="occupe">
    <header class="entete">
      <button :disabled="occupe" @click="annulationsOuvertes = true">Annuler une modification…</button>
      <button class="actualiser" :disabled="occupe" @click="actualiser">Actualiser</button>
      <button class="bouton-aide" type="button" aria-label="Aide sur l’onglet Personnes" title="Aide sur l’onglet Personnes" @click="ouvrirAide">
        <span aria-hidden="true">?</span>
      </button>
    </header>
    <ModaleJournalCorpus v-if="annulationsOuvertes" personnes @fermer="annulationsOuvertes = false" />
    <p v-if="lectureUniquement" class="information">Consultation seule : reconnectez le corpus distant pour appliquer une correction.</p>
    <p v-else-if="corpusDistant" class="information">Les corrections sont publiées sous verrou. Une opération touchant plusieurs entretiens peut réussir partiellement ; actualisez alors le répertoire pour reprendre les éléments restants.</p>
    <p v-if="erreur && charge" role="alert" class="erreur alerte-projection">
      {{ erreur }}<template v-if="erreurLecture"> Le répertoire affiché est le dernier résultat lisible et peut ne plus être à jour.</template>
    </p>
    <p v-if="message && charge" role="status">{{ message }}</p>
    <section v-if="ficheVide && charge" aria-label="Personne sans entretien">
      <p>« {{ ficheVide.nom }} » n’est plus associée à aucun entretien.</p>
      <button :disabled="desactive" @click="selectionner(`p:${ficheVide.id}`)">Examiner cette personne</button>
      <button :disabled="desactive || !!inventaire.indisponibles.length" @click="demander(`Supprimer « ${ficheVide.nom} » ?`, { type: 'supprimer', personneId: ficheVide.id })">Supprimer cette personne…</button>
    </section>
    <div v-if="occupe && !charge" class="etat-projection" role="status">Chargement…</div>
    <div v-else-if="erreurLecture && erreur && !charge" class="etat-projection">
      <p role="alert">{{ erreur }}</p>
      <button type="button" :disabled="occupe" @click="actualiser">Réessayer</button>
    </div>
    <details v-if="charge && inventaire.indisponibles.length" class="inventaire-incomplet">
      <summary>{{ resumeIndisponibles }}</summary>
      <ul>
        <li v-for="e in inventaire.indisponibles" :key="e.id">{{ e.titre }} : {{ e.raison }}</li>
      </ul>
    </details>
    <div v-show="charge" ref="panneau" class="deux-colonnes" :class="{ verticale }" :style="{ '--largeur-personnes': largeur + 'px' }">
      <aside class="panneau repertoire" aria-label="Répertoire des personnes">
        <header>
          <div class="corpus-tete"><h2 class="titre-panneau">Personnes</h2></div>
          <p class="accueil-intro">
            {{ inventaire.personnes.length }} personne{{ inventaire.personnes.length > 1 ? 's' : '' }} ·
            {{ nonLies.length }} locuteur{{ nonLies.length > 1 ? 's' : '' }} à associer
          </p>
          <p class="aide-repertoire">Retrouvez une même personne d’un entretien à l’autre. Choisissez un nom pour consulter sa fiche.</p>
        </header>
        <section class="carte-repertoire carte-recherche" aria-labelledby="titre-recherche-personnes">
          <h3 id="titre-recherche-personnes">Rechercher</h3>
          <label>Nom ou entretien<input v-model="recherche" type="search" /></label>
          <div class="filtres">
            <button :aria-pressed="filtre === 'tous'" @click="filtre = 'tous'">Toutes</button>
            <button :aria-pressed="filtre === 'problemes'" @click="filtre = 'problemes'">À vérifier {{ liensInvalides.length + doublons.length + rapprochementsAVerifier.length }}</button>
            <button :aria-pressed="filtre === 'refus'" @click="filtre = 'refus'">Écartées {{ decisionsEcartees.length }}</button>
          </div>
        </section>
        <section v-if="filtre === 'refus'" class="carte-repertoire carte-decisions" aria-label="Locuteurs avec décisions écartées">
          <h3>Décisions écartées</h3>
          <ul><li v-for="l in decisionsEcartees.filter(l => correspond(`${l.nom} ${l.entretienTitre}`))" :key="cleLocuteur(l)">
            <button :aria-pressed="selection === `l:${cleLocuteur(l)}`" @click="selectionner(`l:${cleLocuteur(l)}`)">{{ l.nom }} · {{ l.entretienTitre }}</button>
          </li></ul>
          <p v-if="!decisionsEcartees.length">Aucune décision écartée.</p>
        </section>
        <details v-if="filtre === 'tous' || (filtre === 'problemes' && personnesVisibles.length)" class="carte-repertoire carte-personnes" open>
          <summary>Personnes identifiées ({{ personnesVisibles.length }})</summary>
          <p class="aide-repertoire">Les personnes déjà associées à des noms dans les entretiens.</p>
          <ul>
            <li v-for="p in personnesVisibles" :key="p.id">
              <button :aria-pressed="selection === `p:${p.id}`" @click="selectionner(`p:${p.id}`)">
                {{ p.nom }} <small>({{ libelleEntretiensPersonne(p.id) }})</small>
              </button>
            </li>
          </ul>
          <p v-if="!personnesVisibles.length">Aucune personne dans cette liste.</p>
        </details>
        <details v-if="filtre === 'tous' || (filtre === 'problemes' && groupesNonLies.length)" class="carte-repertoire carte-sans-lien" open>
          <summary>Locuteurs à associer ({{ nonLies.length }})</summary>
          <p class="aide-repertoire">Les noms utilisés dans les entretiens, à rattacher à une personne. Choisissez un nom pour créer une fiche ou l’associer à une personne existante.</p>
          <section v-for="[id, groupe] in groupesNonLies" :key="id">
            <h4>{{ groupe.titre }}</h4>
            <ul><li v-for="l in groupe.locuteurs" :key="cleLocuteur(l)">
              <button :aria-pressed="selection === `l:${cleLocuteur(l)}`" @click="selectionner(`l:${cleLocuteur(l)}`)">
                {{ l.nom || 'Locuteur sans nom' }} <span v-if="l.personneRef">— référence absente</span>
              </button>
            </li></ul>
          </section>
          <p v-if="!groupesNonLies.length">Aucun locuteur à associer dans cette liste.</p>
        </details>
        <section v-if="filtre !== 'refus'" class="carte-repertoire carte-rapprochements" aria-label="Suggestions à vérifier">
          <h3>Rapprochements à vérifier</h3>
          <p class="aide-repertoire">Des noms proches peuvent désigner la même personne. Vérifiez avant de les réunir.</p>
          <ul v-if="rapprochementsAVerifier.length" class="liste-rapprochements"><li v-for="r in rapprochementsAVerifier.filter(r => correspond(`${libelleIdentite(r.cible)} ${libelleIdentite(r.candidat)}`))" :key="r.cle">
            <button :aria-pressed="rapprochementSelectionne === r.cle" @click="selectionner(`l:${cleLocuteur(r.cible)}`, r.cle)">
              <span>{{ libelleIdentite(r.cible) }}</span>
              <span aria-hidden="true">↔</span>
              <span>{{ libelleIdentite(r.candidat) }}</span>
            </button>
          </li></ul>
          <p v-else>Aucun rapprochement proposé.</p>
        </section>
      </aside>
      <div v-if="!verticale" class="separateur" role="separator" aria-label="Largeur du répertoire des personnes" aria-orientation="vertical" tabindex="0"
        :aria-valuenow="largeur" :aria-valuemin="240" :aria-valuemax="borner(Infinity)"
        @pointerdown="($event.currentTarget as HTMLElement).setPointerCapture($event.pointerId)"
        @pointermove="redimensionner" @pointerup="terminer" @pointercancel="terminer" @keydown="ajuster"></div>
      <section class="fiche" aria-label="Détails de la personne">
        <section v-if="filtre !== 'refus' && locuteur && candidatsAffiches.length" aria-label="Rapprochements proposés">
          <h3>Rapprochements proposés</h3>
          <p>Chaque proposition compare deux identités. Lorsqu’une identité réunit déjà plusieurs entretiens, la décision vaut pour tout le groupe.</p>
          <p v-if="refusComposite(locuteur)">« Personne différente » crée une personne distincte pour ce locuteur et mémorise le refus.</p>
          <p v-if="natureNomPersonne(locuteur.nom) === 'role'">Même rôle ne signifie pas même personne. En cas d’homonymie, vous pouvez choisir un nom ou pseudonyme spécifique pour distinguer les locuteurs.</p>
          <ul class="propositions-rapprochements"><li v-for="s in candidatsAffiches" :key="cleLocuteur(s)">
            <div class="comparaison-identites">
              <strong>{{ libelleIdentite(locuteur) }}</strong>
              <span aria-hidden="true">↔</span>
              <strong>{{ libelleIdentite(s) }}</strong>
            </div>
            <p>{{ analyserRapprochementPersonne(locuteur.nom, s.nom)?.libelle }}</p>
            <div class="actions">
              <button :disabled="rapprochementDesactive(locuteur, s)" @click="sourceReprise = s">C’est la même personne…</button>
              <button :disabled="desactive" @click="executer({ type: 'refuser', entretienId: locuteur.entretienId, locuteurId: locuteur.locuteurId, sourceEntretienId: s.entretienId, sourceLocuteurId: s.locuteurId })">Personne différente</button>
            </div>
            <div v-if="rapprochementActif" class="acces-entretiens">
              <strong>Aller à l’entretien</strong>
              <div class="actions">
                <button v-for="l in entretiensRapprochement(locuteur, s)" :key="cleLocuteur(l)" :disabled="occupe" @click="ouvrir(l)">{{ l.entretienTitre }}</button>
              </div>
            </div>
          </li></ul>
        </section>
        <RapprochementCorpus v-if="sourceReprise && cibleRapprochement" :inventaire="inventaire" :cible="cibleRapprochement" :candidat="sourceReprise" :variables="variablesLoc"
          @annuler="sourceReprise = null" @valider="validerRapprochement" />
        <section v-if="!rapprochementActif && locuteur?.rapprochementsRefuses?.length" aria-label="Décisions écartées">
          <h3>Décisions écartées</h3>
          <ul><li v-for="r in locuteur.rapprochementsRefuses" :key="r">{{ libelleRefus(r) }}
            <button :disabled="desactive" @click="executer({ type: 'annulerRefus', entretienId: locuteur.entretienId, locuteurId: locuteur.locuteurId, cible: r })">Annuler le refus</button>
          </li></ul>
        </section>
        <template v-if="personne">
          <h3 ref="titreFiche" tabindex="-1">Personne · {{ personne.nom }}</h3>
          <p v-if="doublons.some(p => p.id === personne?.id)" class="erreur">Cette personne possède plusieurs locuteurs dans un même entretien. Modifiez les associations incorrectes.</p>
          <div class="edition-nom">
            <label>Nom de référence
              <input v-model="nom" :disabled="desactive" @keydown.enter.prevent="enregistrerNom" @blur="enregistrerNom" />
            </label>
            <small>Entrée ou sortie du champ pour enregistrer.</small>
          </div>
          <details v-if="lies.length">
            <summary>Réunir…</summary>
            <form class="reunir-personne" @submit.prevent="verifierAutreFiche">
              <label><span>Avec</span><select v-model="autreFiche" :disabled="desactiveComposite">
                <option value="">Choisir une personne…</option>
                <option v-for="p in inventaire.personnes.filter(p => p.id !== personne?.id && inventaire.locuteurs.some(l => l.personneRef === p.id))" :key="p.id" :value="p.id">{{ p.nom }} · {{ inventaire.locuteurs.filter(l => l.personneRef === p.id).map(l => l.entretienTitre).join(', ') }}</option>
              </select></label>
              <button :disabled="desactiveComposite || !autreFiche">Continuer…</button>
            </form>
          </details>
          <details v-if="lies.length > 1" class="separer-personne">
            <summary>Séparer…</summary>
            <form @submit.prevent="demanderSeparation">
              <fieldset :disabled="desactiveComposite">
                <legend>Locuteurs à placer dans la nouvelle personne</legend>
                <label v-for="lie in lies" :key="cleLocuteur(lie)" class="choix-separation">
                  <input v-model="locuteursSeparation" type="checkbox" :value="cleLocuteur(lie)" />
                  <span>{{ lie.entretienTitre }} · {{ lie.nom }}</span>
                </label>
              </fieldset>
              <label>Nom de la nouvelle personne
                <input v-model="nomSeparation" :disabled="desactiveComposite" required />
              </label>
              <p v-if="separationComplete" class="erreur">Laissez au moins un locuteur sur « {{ personne.nom }} ».</p>
              <button :disabled="desactiveComposite || !locuteursSeparation.length || separationComplete || !nomSeparation.trim()">Continuer…</button>
            </form>
          </details>
          <h4>Noms et entretiens</h4>
          <ul class="liens"><li v-for="l in lies" :key="cleLocuteur(l)">
            <strong>{{ l.entretienTitre }} · {{ l.nom }}</strong>
            <span v-if="l.interviewer"> · Enquêteur</span>
            <span v-if="badgeVerrou(l.entretienId)"> · Verrou tenu par {{ badgeVerrou(l.entretienId)?.userId }}</span>
            <div class="actions">
              <button :disabled="occupe" @click="ouvrir(l)">Ouvrir l’entretien</button>
              <button :disabled="desactive" @click="selectionner(`l:${cleLocuteur(l)}`)">Modifier l’association…</button>
            </div>
          </li></ul>
          <p v-if="!lies.length">Cette personne n’a aucun locuteur lié.</p>
          <details class="notes-liees">
            <summary>Notes liées ({{ notesLiees.length }})</summary>
            <p v-if="!notesLiees.length">Aucune note d’entretien ne concerne les locuteurs de cette personne.</p>
            <section v-for="[entretienId, groupe] in groupesNotesLiees" :key="entretienId">
              <h5>{{ groupe.titre }}</h5>
              <article v-for="n in groupe.notes" :key="n.id" class="note-liee">
                <strong>{{ n.titre || texteNote(n.corps) || 'Note sans titre' }}</strong>
                <small>{{ nomCategorieNote(n.categorieId) }} · {{ dateNote(n.date) }} · {{ n.statut === 'public' ? 'public' : 'privé' }}</small>
                <p v-if="n.titre && texteNote(n.corps)">{{ texteNote(n.corps) }}</p>
                <button :disabled="occupe" @click="ouvrirNotes(entretienId)">Ouvrir l’entretien dans Notes</button>
              </article>
            </section>
          </details>
          <div v-if="lies.length && variablesLoc.length" class="tableau">
            <h4>Données de locuteur</h4>
            <p>Les valeurs restent propres à chaque entretien ; une différence peut être légitime.</p>
            <table><thead><tr><th scope="col">Entretien · locuteur</th><th v-for="v in variablesLoc" :key="v.id" scope="col">{{ v.lib }}</th></tr></thead>
              <tbody><tr v-for="l in lies" :key="cleLocuteur(l)"><th scope="row">{{ l.entretienTitre }} · {{ l.nom }}</th><td v-for="v in variablesLoc" :key="v.id">{{ valeur(l, v.id) }}</td></tr></tbody>
            </table>
          </div>
          <button v-if="!lies.length" :disabled="desactive || !!inventaire.indisponibles.length" @click="demander(`Supprimer « ${personne.nom} » ?`, { type: 'supprimer', personneId: personne.id })">Supprimer cette personne</button>
        </template>
        <template v-else-if="locuteur && !rapprochementActif">
          <h3>{{ locuteur.nom || 'Locuteur sans nom' }}</h3>
          <p>{{ locuteur.entretienTitre }} <span v-if="locuteur.interviewer">· Enquêteur</span></p>
          <p v-if="badgeVerrou(locuteur.entretienId)">Verrou tenu par {{ badgeVerrou(locuteur.entretienId)?.userId }}</p>
          <p v-if="locuteur.personneRef && !idsPersonnes.has(locuteur.personneRef)" class="erreur">Référence absente : {{ locuteur.personneRef }}. Associez ce locuteur à une autre personne ou supprimez cette association.</p>
          <button :disabled="occupe" @click="ouvrir(locuteur)">Ouvrir l’entretien</button>
          <form v-if="!locuteur.personneRef" class="action-personne" @submit.prevent="executer({ type: 'creer', entretienId: locuteur.entretienId, locuteurId: locuteur.locuteurId, nom })">
            <label><span>Nouvelle personne</span><input v-model="nom" :disabled="desactive" required /></label>
            <button :disabled="desactive || !nom.trim()">Créer</button>
          </form>
          <p v-if="!locuteur.personneRef" class="separateur-action">ou</p>
          <form class="action-personne" @submit.prevent="lier(locuteur, cible)">
            <label><span>Associer à</span><select v-model="cible" :disabled="desactive">
              <option value="">Choisir une personne…</option>
              <option v-for="p in inventaire.personnes" :key="p.id" :value="p.id" :disabled="inventaire.locuteurs.some(l => l.entretienId === locuteur?.entretienId && l.personneRef === p.id)">{{ p.nom }} · {{ inventaire.locuteurs.filter(l => l.personneRef === p.id).map(l => l.entretienTitre).join(', ') }}</option>
            </select></label>
            <button :disabled="desactive || !cible">{{ locuteur.personneRef ? 'Changer' : 'Associer' }}</button>
          </form>
          <button v-if="locuteur.personneRef" :disabled="desactive" @click="lier(locuteur, null)">Ne plus associer</button>
        </template>
        <template v-else-if="!rapprochementActif">
          <h3>Personne</h3>
          <p v-if="charge && !inventaire.personnes.length">Aucune personne n’est encore identifiée. Choisissez un locuteur non lié pour créer une personne.</p>
          <p v-else>Sélectionnez une personne ou un locuteur dans le répertoire.</p>
          <p>Une personne relie les locuteurs d’entretiens différents, sans changer leurs noms ni leurs données. Les homonymes peuvent rester distincts.</p>
        </template>
      </section>
    </div>
    <dialog ref="dialogueAide" class="aide-personnes" aria-labelledby="aide-personnes-titre" @cancel.prevent="fermerAide">
      <h3 id="aide-personnes-titre">Comprendre l’onglet Personnes</h3>
      <p>Cet onglet permet de reconnaître une même personne dans plusieurs entretiens, sans uniformiser les informations propres à chaque entretien.</p>

      <h4>Personne ou locuteur&nbsp;?</h4>
      <ul>
        <li>Une <strong>personne</strong> est une identité commune au corpus, avec un nom de référence.</li>
        <li>Un <strong>locuteur</strong> appartient à un entretien. Son nom local, son pseudonyme, son rôle et ses données restent dans cet entretien.</li>
        <li>Une personne peut réunir plusieurs locuteurs, mais jamais deux locuteurs d’un même entretien.</li>
      </ul>

      <h4>Trouver et vérifier</h4>
      <ul>
        <li><strong>Rechercher</strong> consulte les noms de référence, les noms locaux et les titres d’entretien, sans tenir compte des majuscules ni des accents.</li>
        <li><strong>À vérifier</strong> affiche chaque rapprochement une seule fois entre deux identités. Une identité peut déjà réunir plusieurs entretiens.</li>
        <li>Le détail d’un rapprochement permet d’ouvrir tous les entretiens concernés, sans proposer d’association manuelle.</li>
        <li>Ce filtre rassemble aussi les références absentes et les personnes associées plusieurs fois au même entretien.</li>
        <li><strong>Écartées</strong> conserve les rapprochements refusés et permet de choisir une autre association. Un refus peut être annulé.</li>
      </ul>

      <h4>Créer, associer ou réunir</h4>
      <ul>
        <li>Choisissez un locuteur sans lien pour créer une personne ou l’associer à une personne existante.</li>
        <li>Un nom identique, une graphie proche stricte ou un même rôle produit seulement une suggestion expliquée&nbsp;: aucun rapprochement n’est validé automatiquement.</li>
        <li><strong>C’est la même personne…</strong> relie deux locuteurs. <strong>Réunir…</strong> rassemble sous une même personne des entretiens déjà rapprochés séparément.</li>
        <li><strong>Modifier l’association…</strong> déplace ou dissocie uniquement le locuteur sélectionné. Une personne sans entretien reste disponible jusqu’à sa suppression explicite.</li>
        <li><strong>Séparer…</strong> crée une nouvelle personne avec les locuteurs choisis. Au moins un locuteur doit rester sur la fiche d’origine.</li>
      </ul>

      <h4>Notes liées</h4>
      <p>Dans l’onglet Notes d’un entretien, le champ <strong>Concerne</strong> permet d’associer une note à un ou plusieurs locuteurs. La personne réunit automatiquement les notes de tous ses locuteurs, sans les copier ni les déplacer.</p>

      <h4>Ce qui reste inchangé</h4>
      <p>Modifier une personne ou réunir ses entretiens ne change ni les noms locaux, ni les pseudonymes, ni les rôles, ni les données ou notes des entretiens. Ces informations peuvent différer légitimement d’un entretien à l’autre.</p>
      <p><strong>Ouvrir l’entretien</strong> permet de consulter ou modifier le locuteur et ses notes dans leur contexte. Dans un corpus distant, les corrections utilisent des verrous courts et signalent précisément les publications partielles à reprendre.</p>
      <div class="actions"><button autofocus @click="fermerAide">Fermer</button></div>
    </dialog>
    <dialog ref="dialogueSeparation" aria-labelledby="separation-personnes-titre" @cancel.prevent="annulerSeparation">
      <h3 id="separation-personnes-titre">Séparer cette personne</h3>
      <template v-if="separation">
        <p>Créer « {{ separation.commande.nom }} » avec {{ separation.locuteurs.length }} locuteur{{ separation.locuteurs.length > 1 ? 's' : '' }}. « {{ personne?.nom }} » conservera {{ separation.restants }} locuteur{{ separation.restants > 1 ? 's' : '' }}.</p>
        <ul>
          <li v-for="lie in separation.locuteurs" :key="cleLocuteur(lie)">{{ lie.entretienTitre }} · {{ lie.nom }}</li>
        </ul>
      </template>
      <div class="actions"><button autofocus @click="annulerSeparation">Annuler</button><button @click="confirmerSeparation">Séparer</button></div>
    </dialog>
    <dialog ref="dialogue" aria-labelledby="confirmation-personnes-titre" @cancel.prevent="annuler">
      <h3 id="confirmation-personnes-titre">Confirmer l’association</h3>
      <p>{{ confirmation?.texte }}</p>
      <div class="actions"><button autofocus @click="annuler">Annuler</button><button @click="confirmer">Confirmer</button></div>
    </dialog>
  </section>
</template>

<style scoped>
.personnes-corpus { min-width: 0; }
.entete, .actions, .filtres { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.entete { justify-content: flex-end; }
.bouton-aide {
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid #64748b;
  border-radius: 50%;
  background: transparent;
  color: #334155;
  font-weight: 700;
}
.bouton-aide:hover { background: #eef3f8; }
.deux-colonnes { display: grid; grid-template-columns: var(--largeur-personnes) 6px minmax(0, 1fr); gap: 12px; margin-top: 16px; }
.deux-colonnes.verticale { grid-template-columns: minmax(0, 1fr); }
.repertoire, .fiche { min-width: 0; }
.fiche { padding: 12px; border: 1px solid #d4dce6; border-radius: 6px; font-size: 0.85rem; }
.fiche h3 { font-size: 0.9rem; }
.fiche h4 { font-size: 0.82rem; font-weight: 600; }
.fiche h5 { font-size: 0.78rem; font-weight: 600; }
.repertoire { display: grid; align-content: start; gap: 12px; max-height: 72vh; overflow: auto; font-size: 0.82rem; }
.aide-repertoire { margin: 6px 0 10px; color: #626b7d; font-size: 0.78rem; line-height: 1.4; }
.repertoire header .aide-repertoire { margin-bottom: 0; }
.carte-repertoire + .carte-repertoire { padding-top: 12px; border-top: 1px solid #e5e5ef; }
.carte-repertoire > :not(h3):not(summary) { margin-inline-start: .75rem; }
.carte-repertoire h3 { margin: 0 0 8px; font-size: 0.82rem; font-weight: 600; color: #44506a; }
.carte-repertoire h4 { margin: 12px 0 6px; font-size: 0.78rem; font-weight: 600; color: #626b7d; }
.carte-repertoire > p:last-child { margin-bottom: 0; }
.carte-repertoire > summary { cursor: pointer; font-size: 0.82rem; font-weight: 600; color: #44506a; }
.carte-repertoire[open] > summary { margin-bottom: 10px; }
.carte-recherche label { margin-bottom: 10px; }
.repertoire ul, .liens { list-style: none; padding: 0; }
.repertoire ul { margin-bottom: 0; }
.repertoire li button { width: 100%; text-align: left; margin: 2px 0; }
.liste-rapprochements button, .comparaison-identites {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 6px;
}
.liste-rapprochements button span:nth-child(2), .comparaison-identites > span { text-align: center; }
.propositions-rapprochements { list-style: none; padding: 0; }
.propositions-rapprochements li { padding: 12px 0; border-bottom: 1px solid #d4dce6; }
.propositions-rapprochements li > p { margin: 6px 0; color: #52606d; }
.acces-entretiens { margin-top: 14px; padding-top: 12px; border-top: 1px solid #d4dce6; }
.acces-entretiens > .actions { margin-top: 6px; }
button { cursor: pointer; padding: 6px 10px; }
button:disabled { cursor: default; }
button[aria-pressed="true"] { background: #e0edff; border-color: #1565c0; }
label { display: flex; flex-direction: column; gap: 5px; margin: 10px 0; }
input, textarea, select { box-sizing: border-box; width: 100%; padding: 7px; font: inherit; }
form { margin-bottom: 16px; }
.liens li { padding: 10px 0; border-bottom: 1px solid #d4dce6; }
.edition-nom { margin-bottom: 16px; }
.edition-nom small { display: block; margin-top: -6px; color: #52606d; }
.reunir-personne { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 8px 0 16px; }
.reunir-personne label { flex: 1 1 280px; flex-direction: row; align-items: center; margin: 0; }
.reunir-personne label span { flex: 0 0 auto; }
.reunir-personne select { flex: 1; width: auto; min-width: 0; }
.separer-personne form { margin-top: 8px; }
.separer-personne fieldset { margin: 8px 0; border: 1px solid #d4dce6; }
.choix-separation { flex-direction: row; align-items: center; margin: 6px 0; }
.choix-separation input { width: auto; }
.action-personne { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 12px 0; }
.action-personne label { flex: 1 1 280px; flex-direction: row; align-items: center; margin: 0; }
.action-personne label span { flex: 0 0 auto; }
.action-personne input, .action-personne select { flex: 1; width: auto; min-width: 0; }
.separateur-action { margin: -4px 0; color: #52606d; font-size: 1.15rem; font-weight: 600; text-align: center; }
.actions { margin-top: 8px; }
.erreur { color: #a82020; }
.alerte-projection { margin: 10px 0; padding: 8px 10px; border: 1px solid #e5b4b4; border-radius: 5px; background: #fff8f8; }
.etat-projection { padding: 24px 12px; color: #52606d; text-align: center; }
.etat-projection p { color: #a82020; }
.inventaire-incomplet { margin-top: 10px; padding: 8px 10px; border: 1px solid #e0c77a; border-radius: 5px; background: #fffaf0; color: #6d5700; font-size: 0.85rem; }
.inventaire-incomplet ul { margin-bottom: 0; }
.information { padding: 10px; background: #fff5d8; }
.separateur { background: #e8edf5; cursor: col-resize; touch-action: none; border-radius: 5px; }
.separateur:focus-visible { outline: 2px solid #1565c0; }
.tableau { overflow: auto; margin-bottom: 16px; }
.notes-liees { margin: 16px 0; }
.notes-liees h5 { margin-bottom: 6px; }
.note-liee { display: grid; gap: 5px; padding: 10px 0; border-bottom: 1px solid #d4dce6; }
.note-liee small { color: #52606d; }
.note-liee p { margin: 2px 0; white-space: pre-wrap; }
.note-liee button { justify-self: start; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #d4dce6; padding: 8px; text-align: left; }
dialog { max-width: min(560px, 85vw); border: 1px solid #9daabc; border-radius: 8px; }
dialog::backdrop { background: #0006; }
.aide-personnes { max-height: 80vh; overflow: auto; padding: 24px; }
.aide-personnes h3 { margin-top: 0; }
.aide-personnes h4 { margin-bottom: 4px; }
.aide-personnes ul { margin-top: 4px; padding-left: 22px; }
.aide-personnes li + li { margin-top: 6px; }
.aide-personnes .actions { justify-content: flex-end; }

</style>
