<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { utiliserSonal } from '../composables/sonal'
import type { CommandePersonnes, InventairePersonnes, VueLocuteurPersonne } from '../../shared/corpus/personnes'

const props = defineProps<{ actif: boolean }>()
const { lirePersonnes, commanderPersonnes, allerLocuteurs, variables, badgeVerrou,
  idDistantCourant, lectureSeule, dernierTirage, dossierCourantDir, vue } = utiliserSonal()
const inventaire = ref<InventairePersonnes>({ personnes: [], locuteurs: [], indisponibles: [] })
const selection = ref('')
const recherche = ref('')
const filtre = ref<'tous' | 'problemes'>('tous')
const erreur = ref('')
const message = ref('')
const occupe = ref(false)
const charge = ref(false)
let generation = 0
const lectureUniquement = computed(() => !!idDistantCourant.value || lectureSeule.value)
const desactive = computed(() => occupe.value || lectureUniquement.value)
const personne = computed(() => inventaire.value.personnes.find((p) => `p:${p.id}` === selection.value))
const cleLocuteur = (l: VueLocuteurPersonne) => JSON.stringify([l.entretienId, l.locuteurId])
const locuteur = computed(() => inventaire.value.locuteurs.find((l) => `l:${cleLocuteur(l)}` === selection.value))
const idsPersonnes = computed(() => new Set(inventaire.value.personnes.map((p) => p.id)))
const lies = computed(() => inventaire.value.locuteurs.filter((l) => l.personneRef === personne.value?.id))
const nonLies = computed(() => inventaire.value.locuteurs.filter((l) => !l.personneRef || !idsPersonnes.value.has(l.personneRef)))
const liensInvalides = computed(() => inventaire.value.locuteurs.filter((l) => l.personneRef && !idsPersonnes.value.has(l.personneRef)))
const doublons = computed(() => inventaire.value.personnes.filter((p) => {
  const ls = inventaire.value.locuteurs.filter((l) => l.personneRef === p.id)
  return new Set(ls.map((l) => l.entretienId)).size !== ls.length
}))
const cleRecherche = (texte: string) => texte.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr')
const correspond = (texte: string) => cleRecherche(texte).includes(cleRecherche(recherche.value.trim()))
const personnesVisibles = computed(() => inventaire.value.personnes.filter((p) =>
  (filtre.value === 'tous' || doublons.value.some((d) => d.id === p.id)) &&
  correspond([p.nom, ...inventaire.value.locuteurs.filter((l) => l.personneRef === p.id).map((l) => `${l.nom} ${l.entretienTitre}`)].join(' ')),
))
const groupesNonLies = computed(() => {
  const groupes = new Map<string, { titre: string; locuteurs: VueLocuteurPersonne[] }>()
  for (const l of nonLies.value) {
    if (filtre.value === 'problemes' && !l.personneRef) continue
    if (!correspond(`${l.nom} ${l.entretienTitre}`)) continue
    if (!groupes.has(l.entretienId)) groupes.set(l.entretienId, { titre: l.entretienTitre, locuteurs: [] })
    groupes.get(l.entretienId)!.locuteurs.push(l)
  }
  return [...groupes.entries()]
})
const nom = ref('')
const note = ref('')
const cible = ref('')
watch([selection, inventaire], () => {
  nom.value = personne.value?.nom ?? locuteur.value?.nom ?? ''
  note.value = personne.value?.note ?? ''
  cible.value = ''
})
const variablesLoc = computed(() => variables.value.filter((v) => v.portee === 'locuteur'))
function valeur(l: VueLocuteurPersonne, idVar: string) {
  const idMod = l.valeursLoc[idVar]
  if (!idMod) return '—'
  return variablesLoc.value.find((v) => v.id === idVar)?.modalites.find((m) => m.id === idMod)?.lib ?? 'Modalité absente'
}

async function actualiser() {
  const jeton = ++generation
  occupe.value = true
  erreur.value = ''
  try {
    const resultat = await lirePersonnes()
    if (jeton !== generation) return
    inventaire.value = resultat
    charge.value = true
  } catch (e) {
    if (jeton === generation) erreur.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (jeton === generation) occupe.value = false
  }
}
async function executer(commande: CommandePersonnes) {
  if (desactive.value) return
  occupe.value = true
  erreur.value = ''
  message.value = ''
  const jeton = generation
  try {
    const id = await commanderPersonnes(commande)
    if (jeton !== generation) return
    if (commande.type === 'creer' && id) selection.value = `p:${id}`
    if (commande.type === 'supprimer') selection.value = ''
    message.value = 'Modification enregistrée.'
  } catch (e) {
    if (jeton === generation) erreur.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (jeton === generation) {
      const erreurCommande = erreur.value
      await actualiser()
      if (erreurCommande) erreur.value = erreurCommande
    }
  }
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
function lier(l: VueLocuteurPersonne, personneId: string | null) {
  const nomCible = inventaire.value.personnes.find((p) => p.id === personneId)?.nom
  const nomSource = inventaire.value.personnes.find((p) => p.id === l.personneRef)?.nom ?? l.personneRef
  const texte = personneId === null
    ? `Délier « ${l.nom} » dans « ${l.entretienTitre} » de « ${nomSource} » ? Le nom local et ses valeurs seront conservés.`
    : `Associer « ${l.nom} » dans « ${l.entretienTitre} » à « ${nomCible} » ?${l.personneRef ? ` Le lien avec « ${nomSource} » sera remplacé.` : ''}`
  void demander(texte, { type: 'lier', entretienId: l.entretienId, locuteurId: l.locuteurId, personneId })
}
async function ouvrir(l: VueLocuteurPersonne) {
  try { await allerLocuteurs(l.entretienId) }
  catch (e) { erreur.value = e instanceof Error ? e.message : String(e) }
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
  inventaire.value = { personnes: [], locuteurs: [], indisponibles: [] }
  selection.value = ''; recherche.value = ''; filtre.value = 'tous'; charge.value = false
  erreur.value = ''; message.value = ''; occupe.value = false
  annuler()
})
watch([() => props.actif, vue, dernierTirage, dossierCourantDir], () => {
  if (props.actif && vue.value === 'corpus') void actualiser()
}, { immediate: true })
</script>

<template>
  <section class="personnes-corpus" aria-label="Personnes du corpus" :aria-busy="occupe">
    <header class="entete">
      <h2>Personnes</h2>
      <span>{{ inventaire.personnes.length }} personnes · {{ nonLies.length }} locuteurs sans lien valide</span>
      <button :disabled="occupe" @click="actualiser">Actualiser</button>
    </header>
    <p v-if="lectureUniquement" class="information">Consultation seule : les corrections de personnes sont disponibles dans les corpus locaux pour le moment.</p>
    <p v-if="erreur" role="alert" class="erreur">{{ erreur }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="occupe" role="status">Chargement…</p>
    <ul v-if="inventaire.indisponibles.length" class="erreur">
      <li v-for="e in inventaire.indisponibles" :key="e.id">{{ e.titre }} : {{ e.raison }}. L’inventaire est incomplet.</li>
    </ul>
    <div ref="panneau" class="deux-colonnes" :class="{ verticale }" :style="{ '--largeur-personnes': largeur + 'px' }">
      <aside class="repertoire" aria-label="Répertoire des personnes">
        <label>Rechercher une personne, un nom local ou un entretien<input v-model="recherche" type="search" /></label>
        <div class="filtres">
          <button :aria-pressed="filtre === 'tous'" @click="filtre = 'tous'">Toutes</button>
          <button :aria-pressed="filtre === 'problemes'" @click="filtre = 'problemes'">À vérifier {{ liensInvalides.length + doublons.length }}</button>
        </div>
        <h3>Répertoire</h3>
        <ul>
          <li v-for="p in personnesVisibles" :key="p.id">
            <button :aria-pressed="selection === `p:${p.id}`" @click="selection = `p:${p.id}`">
              {{ p.nom }} <small>({{ new Set(inventaire.locuteurs.filter(l => l.personneRef === p.id).map(l => l.entretienId)).size }} entretiens)</small>
            </button>
          </li>
        </ul>
        <p v-if="!personnesVisibles.length">Aucune personne dans cette liste.</p>
        <details open>
          <summary>Locuteurs sans lien valide ({{ nonLies.length }})</summary>
          <section v-for="[id, groupe] in groupesNonLies" :key="id">
            <h4>{{ groupe.titre }}</h4>
            <ul><li v-for="l in groupe.locuteurs" :key="cleLocuteur(l)">
              <button :aria-pressed="selection === `l:${cleLocuteur(l)}`" @click="selection = `l:${cleLocuteur(l)}`">
                {{ l.nom || 'Locuteur sans nom' }} <span v-if="l.personneRef">— référence absente</span>
              </button>
            </li></ul>
          </section>
        </details>
      </aside>
      <div v-if="!verticale" class="separateur" role="separator" aria-label="Largeur du répertoire des personnes" aria-orientation="vertical" tabindex="0"
        :aria-valuenow="largeur" :aria-valuemin="240" :aria-valuemax="borner(Infinity)"
        @pointerdown="($event.currentTarget as HTMLElement).setPointerCapture($event.pointerId)"
        @pointermove="redimensionner" @pointerup="terminer" @pointercancel="terminer" @keydown="ajuster"></div>
      <section class="fiche" aria-label="Fiche personne">
        <template v-if="personne">
          <h3>Personne · {{ personne.nom }}</h3>
          <p v-if="doublons.some(p => p.id === personne?.id)" class="erreur">Cette personne possède plusieurs locuteurs dans un même entretien. Déliez ou déplacez les liens incorrects.</p>
          <form @submit.prevent="executer({ type: 'modifier', personneId: personne.id, nom, note })">
            <label>Nom de référence<input v-model="nom" :disabled="desactive" required /></label>
            <label>Note de la personne<textarea v-model="note" :disabled="desactive" rows="3"></textarea></label>
            <button :disabled="desactive || !nom.trim()">Enregistrer la fiche</button>
          </form>
          <p>Le nom de référence ne remplace pas les noms utilisés dans les entretiens.</p>
          <h4>Noms et entretiens</h4>
          <ul class="liens"><li v-for="l in lies" :key="cleLocuteur(l)">
            <strong>{{ l.entretienTitre }} · {{ l.nom }}</strong>
            <span v-if="l.interviewer"> · Enquêteur</span>
            <span v-if="badgeVerrou(l.entretienId)"> · Verrou tenu par {{ badgeVerrou(l.entretienId)?.userId }}</span>
            <div class="actions">
              <button :disabled="occupe" @click="ouvrir(l)">Ouvrir l’entretien</button>
              <button :disabled="desactive" @click="lier(l, null)">Délier</button>
              <button :disabled="desactive" @click="selection = `l:${cleLocuteur(l)}`">Déplacer vers…</button>
            </div>
          </li></ul>
          <p v-if="!lies.length">Cette personne n’a aucun locuteur lié.</p>
          <div v-if="lies.length && variablesLoc.length" class="tableau">
            <h4>Données de locuteur</h4>
            <p>Les valeurs restent propres à chaque entretien ; une différence peut être légitime.</p>
            <table><thead><tr><th scope="col">Entretien · locuteur</th><th v-for="v in variablesLoc" :key="v.id" scope="col">{{ v.lib }}</th></tr></thead>
              <tbody><tr v-for="l in lies" :key="cleLocuteur(l)"><th scope="row">{{ l.entretienTitre }} · {{ l.nom }}</th><td v-for="v in variablesLoc" :key="v.id">{{ valeur(l, v.id) }}</td></tr></tbody>
            </table>
          </div>
          <button v-if="!lies.length" :disabled="desactive || !!inventaire.indisponibles.length" @click="demander(`Supprimer la fiche vide « ${personne.nom} » ?`, { type: 'supprimer', personneId: personne.id })">Supprimer cette personne vide</button>
        </template>
        <template v-else-if="locuteur">
          <h3>{{ locuteur.nom || 'Locuteur sans nom' }}</h3>
          <p>{{ locuteur.entretienTitre }} <span v-if="locuteur.interviewer">· Enquêteur</span></p>
          <p v-if="badgeVerrou(locuteur.entretienId)">Verrou tenu par {{ badgeVerrou(locuteur.entretienId)?.userId }}</p>
          <p v-if="locuteur.personneRef && !idsPersonnes.has(locuteur.personneRef)" class="erreur">Référence absente : {{ locuteur.personneRef }}. Vous pouvez délier ce locuteur ou l’associer à une personne existante.</p>
          <button :disabled="occupe" @click="ouvrir(locuteur)">Ouvrir l’entretien</button>
          <form v-if="!locuteur.personneRef" @submit.prevent="executer({ type: 'creer', entretienId: locuteur.entretienId, locuteurId: locuteur.locuteurId, nom })">
            <label>Nom de la nouvelle personne<input v-model="nom" :disabled="desactive" required /></label>
            <button :disabled="desactive || !nom.trim()">Créer une personne depuis ce locuteur</button>
          </form>
          <form @submit.prevent="lier(locuteur, cible)">
            <label>Personne à associer<select v-model="cible" :disabled="desactive">
              <option value="">Choisir une personne…</option>
              <option v-for="p in inventaire.personnes" :key="p.id" :value="p.id" :disabled="inventaire.locuteurs.some(l => l.entretienId === locuteur?.entretienId && l.personneRef === p.id)">{{ p.nom }} · {{ p.id }}</option>
            </select></label>
            <button :disabled="desactive || !cible">{{ locuteur.personneRef ? 'Déplacer le lien' : 'Lier à cette personne' }}</button>
          </form>
          <button v-if="locuteur.personneRef" :disabled="desactive" @click="lier(locuteur, null)">Délier</button>
        </template>
        <template v-else>
          <h3>Personne</h3>
          <p v-if="charge && !inventaire.personnes.length">Aucune personne n’est encore identifiée. Choisissez un locuteur non lié pour créer sa fiche.</p>
          <p v-else>Sélectionnez une personne ou un locuteur dans le répertoire.</p>
          <p>Une personne relie les locuteurs d’entretiens différents, sans changer leurs noms ni leurs données. Les homonymes peuvent conserver des fiches distinctes.</p>
        </template>
      </section>
    </div>
    <dialog ref="dialogue" aria-labelledby="confirmation-personnes-titre" @cancel.prevent="annuler">
      <h3 id="confirmation-personnes-titre">Confirmer le changement de lien ou de fiche</h3>
      <p>{{ confirmation?.texte }}</p>
      <div class="actions"><button autofocus @click="annuler">Annuler</button><button @click="confirmer">Confirmer</button></div>
    </dialog>
  </section>
</template>

<style scoped>
.personnes-corpus { padding: 16px; min-width: 0; }
.entete, .actions, .filtres { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.entete h2 { margin: 0; }
.entete > button { margin-left: auto; }
.deux-colonnes { display: grid; grid-template-columns: var(--largeur-personnes) 6px minmax(0, 1fr); gap: 12px; margin-top: 16px; }
.deux-colonnes.verticale { grid-template-columns: minmax(0, 1fr); }
.repertoire, .fiche { min-width: 0; padding: 12px; border: 1px solid #d4dce6; border-radius: 6px; }
.repertoire { max-height: 72vh; overflow: auto; }
.repertoire ul, .liens { list-style: none; padding: 0; }
.repertoire li button { width: 100%; text-align: left; margin: 2px 0; }
button { cursor: pointer; padding: 6px 10px; }
button:disabled { cursor: default; }
button[aria-pressed="true"] { background: #e0edff; border-color: #1565c0; }
label { display: flex; flex-direction: column; gap: 5px; margin: 10px 0; }
input, textarea, select { box-sizing: border-box; width: 100%; padding: 7px; font: inherit; }
form { margin-bottom: 16px; }
.liens li { padding: 10px 0; border-bottom: 1px solid #d4dce6; }
.actions { margin-top: 8px; }
.erreur { color: #a82020; }
.information { padding: 10px; background: #fff5d8; }
.separateur { background: #e8edf5; cursor: col-resize; touch-action: none; border-radius: 5px; }
.separateur:focus-visible { outline: 2px solid #1565c0; }
.tableau { overflow: auto; margin-bottom: 16px; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #d4dce6; padding: 8px; text-align: left; }
dialog { max-width: min(560px, 85vw); border: 1px solid #9daabc; border-radius: 8px; }
dialog::backdrop { background: #0006; }
</style>
