<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { utiliserSonal } from '../../../../composables/sonal'
import { celluleVoisine, grilleCellules, type SensNav } from '../../../../tableNavigation'
import EditionVariables from './EditionVariables.vue'
import LotVariable from './LotVariable.vue'

const props = defineProps<{ actif?: boolean }>()
const {
  variables,
  matrice,
  matriceChargee,
  matriceEnCours,
  modalitesDe,
  poserGen,
  poserLoc,
  poserGenLibelle,
  poserLocLibelle,
  membership,
  reprise,
  reprendre,
  lectureSeule,
  tableLigneEditable,
  badgeVerrou,
  presencesSur,
  idDistantCourant,
  allerSaisieDonnees,
  rafraichirMatrice,
  vue,
  dernierTirage,
} = utiliserSonal()

const editerVariables = ref(false)
const lotVarId = ref<string | null>(null)

// Le panneau pilote les colonnes sans toucher aux définitions du corpus.
const filtrePortee = ref<'toutes' | 'entretien' | 'locuteur'>('toutes')
const rechercheVariable = ref('')
const colonnesCochees = ref<Set<string>>(new Set())
let idsConnus = new Set<string>()
watch(
  variables,
  (liste) => {
    const idsActuels = new Set(liste.map((v) => v.id))
    const suivantes = new Set([...colonnesCochees.value].filter((id) => idsActuels.has(id)))
    for (const id of idsActuels) if (!idsConnus.has(id)) suivantes.add(id)
    colonnesCochees.value = suivantes
    idsConnus = idsActuels
  },
  { immediate: true },
)
const variablesGroupees = computed(() => [
  ...variables.value.filter((v) => v.portee === 'entretien'),
  ...variables.value.filter((v) => v.portee === 'locuteur'),
])
const variablesDePortee = computed(() =>
  filtrePortee.value === 'toutes'
    ? variablesGroupees.value
    : variablesGroupees.value.filter((v) => v.portee === filtrePortee.value),
)
const variablesListe = computed(() => {
  const q = rechercheVariable.value.trim().toLocaleLowerCase()
  return q
    ? variablesDePortee.value.filter((v) => v.lib.toLocaleLowerCase().includes(q))
    : variablesDePortee.value
})
const variablesEntretienListe = computed(() =>
  variablesListe.value.filter((v) => v.portee === 'entretien'),
)
const variablesLocuteurListe = computed(() =>
  variablesListe.value.filter((v) => v.portee === 'locuteur'),
)
const variablesVisibles = computed(() =>
  variablesDePortee.value.filter((v) => colonnesCochees.value.has(v.id)),
)
function basculerColonne(id: string, evt: Event) {
  const suivantes = new Set(colonnesCochees.value)
  if ((evt.target as HTMLInputElement).checked) suivantes.add(id)
  else suivantes.delete(id)
  colonnesCochees.value = suivantes
}
function toutAfficher() {
  const suivantes = new Set(colonnesCochees.value)
  for (const v of variablesDePortee.value) suivantes.add(v.id)
  colonnesCochees.value = suivantes
}
function toutMasquer() {
  const suivantes = new Set(colonnesCochees.value)
  for (const v of variablesDePortee.value) suivantes.delete(v.id)
  colonnesCochees.value = suivantes
}

// Le séparateur laisse la matrice récupérer toute la largeur si nécessaire.
const CLE_LARGEUR = 'sonalpi.donneesCorpus.largeurGauche'
const panneau = ref<HTMLElement | null>(null)
const largeurGauche = ref(280)
const dispositionVerticale = ref(false)
const panneauReplie = ref(false)
let redimensionnement = false
function largeurDisponible() {
  return panneau.value?.clientWidth ?? 0
}
function bornerLargeur(largeur: number): number {
  const disponible = largeurDisponible()
  const maximum = Math.max(260, disponible - 420)
  return Math.min(Math.max(largeur, 240), maximum)
}
function mesurerDisposition() {
  const disponible = largeurDisponible()
  dispositionVerticale.value = disponible > 0 && disponible < 720
  if (!dispositionVerticale.value) largeurGauche.value = bornerLargeur(largeurGauche.value)
}
function commencerRedimensionnement(evt: PointerEvent) {
  redimensionnement = true
  ;(evt.currentTarget as HTMLElement).setPointerCapture(evt.pointerId)
}
function redimensionner(evt: PointerEvent) {
  if (!redimensionnement || !panneau.value) return
  largeurGauche.value = bornerLargeur(evt.clientX - panneau.value.getBoundingClientRect().left)
}
function finirRedimensionnement() {
  if (!redimensionnement) return
  redimensionnement = false
  localStorage.setItem(CLE_LARGEUR, String(largeurGauche.value))
}
function ajusterSeparateurClavier(evt: KeyboardEvent) {
  if (evt.key !== 'ArrowLeft' && evt.key !== 'ArrowRight') return
  evt.preventDefault()
  largeurGauche.value = bornerLargeur(
    largeurGauche.value + (evt.key === 'ArrowLeft' ? -20 : 20),
  )
  localStorage.setItem(CLE_LARGEUR, String(largeurGauche.value))
}
function restaurerLargeur() {
  const largeur = Number(localStorage.getItem(CLE_LARGEUR))
  if (Number.isFinite(largeur) && largeur > 0) largeurGauche.value = largeur
  mesurerDisposition()
}
watch(
  () => props.actif,
  async (actif) => {
    if (!actif) return
    await nextTick()
    mesurerDisposition()
  },
)
watch(vue, (courante) => {
  if (courante === 'corpus' && props.actif) void rafraichirMatrice()
})
watch(dernierTirage, () => {
  if (props.actif && vue.value === 'corpus') void rafraichirMatrice()
})
onMounted(() => {
  restaurerLargeur()
  window.addEventListener('resize', mesurerDisposition)
})
onUnmounted(() => window.removeEventListener('resize', mesurerDisposition))

// Une variable sans modalité reste saisissable en texte libre.
const AUTRE = ' autre'
const celluleLibre = ref<string | null>(null)
const erreursCellules = ref<Record<string, string>>({})
function noterErreurCellule(cle: string, raison: string | null) {
  if (raison) erreursCellules.value[cle] = raison
  else delete erreursCellules.value[cle]
}
function effacerErreurCellule(cle: string) {
  delete erreursCellules.value[cle]
}
const cleGen = (entId: string, idVar: string) => `${entId}|${idVar}`
const cleLoc = (entId: string, index: number, idVar: string) => `${entId}|${index}|${idVar}`
function libelleCell(idVar: string, idMod: string | undefined): string {
  if (!idMod) return ''
  return modalitesDe(idVar).find((m) => m.id === idMod)?.lib ?? idMod
}
function surSelectGen(entId: string, idVar: string, evt: Event) {
  const val = (evt.target as HTMLSelectElement).value
  if (val === AUTRE) celluleLibre.value = cleGen(entId, idVar)
  else void surValidationGen(entId, idVar, val)
}
function surSelectLoc(entId: string, index: number, idVar: string, evt: Event) {
  const val = (evt.target as HTMLSelectElement).value
  if (val === AUTRE) celluleLibre.value = cleLoc(entId, index, idVar)
  else void surValidationLoc(entId, index, idVar, val)
}
async function surValidationGen(entId: string, idVar: string, val: string) {
  noterErreurCellule(cleGen(entId, idVar), await poserGen(entId, idVar, val))
}
async function surValidationLoc(entId: string, index: number, idVar: string, val: string) {
  noterErreurCellule(cleLoc(entId, index, idVar), await poserLoc(entId, index, idVar, val))
}
function surLibreGen(entId: string, idVar: string, evt: Event) {
  celluleLibre.value = null
  const cle = cleGen(entId, idVar)
  void poserGenLibelle(entId, idVar, (evt.target as HTMLInputElement).value.trim()).then((r) =>
    noterErreurCellule(cle, r),
  )
}
function surLibreLoc(entId: string, index: number, idVar: string, evt: Event) {
  celluleLibre.value = null
  const cle = cleLoc(entId, index, idVar)
  void poserLocLibelle(entId, index, idVar, (evt.target as HTMLInputElement).value.trim()).then(
    (r) => noterErreurCellule(cle, r),
  )
}
function focaliserLibre(el: unknown, cle: string) {
  if (el instanceof HTMLInputElement && celluleLibre.value === cle && document.activeElement !== el) {
    el.focus()
  }
}

const refsCellules = new Map<string, HTMLElement>()
function refCellule(el: unknown, cle: string) {
  if (el instanceof HTMLElement) refsCellules.set(cle, el)
  else refsCellules.delete(cle)
  focaliserLibre(el, cle)
}
const grille = computed(() =>
  grilleCellules({
    entrees: matrice.value,
    variables: variablesVisibles.value,
    montrerLocuteurs: filtrePortee.value !== 'entretien',
    editable: (id) => tableLigneEditable(id),
  }),
)
function naviguer(cle: string, sens: SensNav): boolean {
  const cible = celluleVoisine(grille.value, cle, sens)
  if (!cible) return false
  const el = refsCellules.get(cible)
  if (!el || (el as HTMLInputElement).disabled) return false
  el.focus()
  el.scrollIntoView({ block: 'nearest' })
  return true
}
function entreeInput(cle: string, evt: KeyboardEvent) {
  ;(evt.target as HTMLInputElement).blur()
  naviguer(cle, evt.shiftKey ? 'haut' : 'bas')
}
function entreeSelect(cle: string, evt: KeyboardEvent) {
  naviguer(cle, evt.shiftKey ? 'haut' : 'bas')
}
function tabCellule(cle: string, evt: KeyboardEvent) {
  if (naviguer(cle, evt.shiftKey ? 'gauche' : 'droite')) evt.preventDefault()
}
</script>

<template>
  <section
    ref="panneau"
    class="donnees-ecran"
    :class="{ vertical: dispositionVerticale, replie: panneauReplie }"
    :style="{ '--donnees-gauche-w': largeurGauche + 'px' }"
    :aria-busy="matriceEnCours"
  >
    <aside v-if="!panneauReplie" class="donnees-gauche">
      <div class="variables-tete">
        <h2>Variables</h2>
        <button
          v-if="!lectureSeule"
          class="crayon"
          title="Éditer les variables (nom, statut, modalités)"
          @click="editerVariables = true"
        >✏️</button>
        <button class="replier-variables" title="Replier le panneau des variables" aria-label="Replier le panneau des variables" @click="panneauReplie = true">‹</button>
      </div>

      <label class="recherche-variable">
        <span class="sr-only">Rechercher une variable</span>
        <input v-model="rechercheVariable" type="search" placeholder="Rechercher une variable…" />
      </label>

      <div class="filtre-portee" title="Filtrer les colonnes par portée">
        <button :class="{ actif: filtrePortee === 'toutes' }" @click="filtrePortee = 'toutes'">toutes</button>
        <button :class="{ actif: filtrePortee === 'entretien' }" @click="filtrePortee = 'entretien'">entretien</button>
        <button :class="{ actif: filtrePortee === 'locuteur' }" @click="filtrePortee = 'locuteur'">locuteurs</button>
      </div>

      <div class="actions-colonnes">
        <button @click="toutAfficher">Tout afficher</button>
        <button @click="toutMasquer">Tout masquer</button>
      </div>

      <div v-if="variables.length === 0" class="variables-vide">
        Aucune variable. Utilisez le crayon pour en créer.
      </div>
      <div v-else-if="variablesListe.length === 0" class="variables-vide">
        Aucune variable ne correspond à la recherche.
      </div>
      <div v-else class="liste-variables">
        <section v-if="variablesEntretienListe.length" class="groupe-variables">
          <h3>Variables d’entretien</h3>
          <label v-for="v in variablesEntretienListe" :key="v.id" class="ligne-variable">
            <input
              type="checkbox"
              :checked="colonnesCochees.has(v.id)"
              @change="basculerColonne(v.id, $event)"
            />
            <span class="nom-variable" :title="v.lib">{{ v.lib }}</span>
            <span v-if="v.priv" class="statut-variable" title="Variable privée — exclue des exports">🔒 privée</span>
            <span class="type-variable">{{ v.modalites.length ? `${v.modalites.length} mod.` : 'texte libre' }}</span>
          </label>
        </section>
        <section v-if="variablesLocuteurListe.length" class="groupe-variables">
          <h3>Variables de locuteur</h3>
          <label v-for="v in variablesLocuteurListe" :key="v.id" class="ligne-variable">
            <input
              type="checkbox"
              :checked="colonnesCochees.has(v.id)"
              @change="basculerColonne(v.id, $event)"
            />
            <span class="nom-variable" :title="v.lib">{{ v.lib }}</span>
            <span v-if="v.priv" class="statut-variable" title="Variable privée — exclue des exports">🔒 privée</span>
            <span class="type-variable">{{ v.modalites.length ? `${v.modalites.length} mod.` : 'texte libre' }}</span>
          </label>
        </section>
      </div>
    </aside>

    <div
      v-if="!panneauReplie && !dispositionVerticale"
      class="donnees-separateur"
      role="separator"
      aria-label="Largeur du panneau des variables"
      aria-orientation="vertical"
      tabindex="0"
      :aria-valuenow="largeurGauche"
      @pointerdown="commencerRedimensionnement"
      @pointermove="redimensionner"
      @pointerup="finirRedimensionnement"
      @pointercancel="finirRedimensionnement"
      @keydown="ajusterSeparateurClavier"
    ></div>

    <section class="donnees-droite">
      <div class="table-tete">
        <button
          v-if="panneauReplie"
          class="deplier-variables"
          title="Afficher le panneau des variables"
          aria-label="Afficher le panneau des variables"
          @click="panneauReplie = false"
        >›</button>
        <h2>Table de données</h2>
        <span class="compteur-colonnes">{{ variablesVisibles.length }} colonne(s)</span>
        <button v-if="reprise" class="btn-reprise" @click="reprendre">
          ↩ Reprendre « {{ membership[reprise.id]?.titre }} »
        </button>
      </div>

      <p v-if="!lectureSeule && variablesVisibles.length > 0" class="aide-clavier">
        <span><kbd>Tab</kbd> droite · <kbd>⇧Tab</kbd> gauche</span>
        <span><kbd>Entrée</kbd> descendre · <kbd>⇧Entrée</kbd> remonter</span>
        <span><kbd>⇊</kbd> changement par lot</span>
      </p>

      <div v-if="matriceEnCours && !matriceChargee" class="vide table-vide" role="status">
        Chargement…
      </div>
      <div v-else-if="!matriceChargee" class="vide table-vide">
        <button class="mini" type="button" :disabled="matriceEnCours" @click="rafraichirMatrice">Réessayer</button>
      </div>
      <div v-else-if="variables.length === 0" class="vide table-vide">
        Aucune variable. Utilisez le crayon du panneau Variables pour en créer.
      </div>
      <div v-else-if="variablesVisibles.length === 0" class="vide table-vide">
        <p>Aucune colonne n’est affichée.</p>
        <button class="mini" @click="toutAfficher">Tout afficher</button>
      </div>
      <div v-else class="matrice-scroll">
        <table class="matrice editable">
          <thead>
            <tr>
              <th></th>
              <th v-for="v in variablesVisibles" :key="v.id" :class="'col-' + v.portee">
                <span class="titre-var">
                  <span v-if="v.priv" title="Variable privée — exclue des exports">🔒</span>
                  {{ v.lib }}
                </span>
                <span class="portee-var">
                  <small>({{ v.portee === 'entretien' ? 'ent' : 'loc' }})</small>
                  <button
                    v-if="v.portee === 'entretien' && !lectureSeule"
                    class="lot-var"
                    title="Modifier en lot pour tous les entretiens non ouverts"
                    @click="lotVarId = v.id"
                  >⇊</button>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            <template v-for="e in matrice" :key="e.entretienId">
              <tr>
                <td class="ligne-ent">📄 {{ e.titre }}
                  <span
                    v-if="badgeVerrou(e.entretienId)"
                    class="badge-verrou"
                    :title="`Verrou tenu par ${badgeVerrou(e.entretienId)!.userId} — ouverture en lecture seule.`"
                  >🔒 {{ badgeVerrou(e.entretienId)!.userId }}</span>
                  <span
                    v-for="p in presencesSur(e.entretienId)"
                    :key="p.machineId"
                    class="badge-presence"
                    :title="`Consulté par ${p.userId} (autre poste)`"
                  >👁 {{ p.userId }}</span>
                  <button
                    v-if="idDistantCourant && !lectureSeule"
                    class="aller-saisie"
                    title="Ouvrir cet entretien sur l’onglet Données pour saisir ses valeurs"
                    @click="allerSaisieDonnees(e.entretienId)"
                  >Saisir…</button>
                </td>
                <td v-for="v in variablesVisibles" :key="v.id" class="cell-val">
                  <template v-if="v.portee === 'entretien'">
                    <input
                      v-if="modalitesDe(v.id).length === 0 || celluleLibre === cleGen(e.entretienId, v.id)"
                      class="cell-libre"
                      :class="{ 'cell-erreur': erreursCellules[cleGen(e.entretienId, v.id)] }"
                      :title="erreursCellules[cleGen(e.entretienId, v.id)]"
                      placeholder="texte libre"
                      :disabled="!tableLigneEditable(e.entretienId)"
                      :value="celluleLibre === cleGen(e.entretienId, v.id) ? '' : libelleCell(v.id, e.valeursGen[v.id])"
                      :ref="(el) => refCellule(el, cleGen(e.entretienId, v.id))"
                      @focus="effacerErreurCellule(cleGen(e.entretienId, v.id))"
                      @keydown.enter.prevent="entreeInput(cleGen(e.entretienId, v.id), $event)"
                      @keydown.tab="tabCellule(cleGen(e.entretienId, v.id), $event)"
                      @keyup.esc="celluleLibre = null"
                      @change="surLibreGen(e.entretienId, v.id, $event)"
                      @blur="celluleLibre = null"
                    />
                    <select
                      v-else
                      :class="{ 'cell-erreur': erreursCellules[cleGen(e.entretienId, v.id)] }"
                      :title="erreursCellules[cleGen(e.entretienId, v.id)]"
                      :disabled="!tableLigneEditable(e.entretienId)"
                      :value="e.valeursGen[v.id] ?? ''"
                      :ref="(el) => refCellule(el, cleGen(e.entretienId, v.id))"
                      @focus="effacerErreurCellule(cleGen(e.entretienId, v.id))"
                      @change="surSelectGen(e.entretienId, v.id, $event)"
                      @keydown.tab="tabCellule(cleGen(e.entretienId, v.id), $event)"
                      @keydown.enter="entreeSelect(cleGen(e.entretienId, v.id), $event)"
                    >
                      <option value="">—</option>
                      <option v-for="m in modalitesDe(v.id)" :key="m.id" :value="m.id">{{ m.lib }}</option>
                      <option :value="AUTRE">autre…</option>
                    </select>
                  </template>
                </td>
              </tr>
              <template v-if="filtrePortee !== 'entretien'">
                <tr v-for="l in e.locuteurs" :key="e.entretienId + '-' + l.index" class="ligne-loc">
                  <td>👤 {{ l.nom }}</td>
                  <td v-for="v in variablesVisibles" :key="v.id" class="cell-val">
                    <template v-if="v.portee === 'locuteur'">
                      <input
                        v-if="modalitesDe(v.id).length === 0 || celluleLibre === cleLoc(e.entretienId, l.index, v.id)"
                        class="cell-libre"
                        :class="{ 'cell-erreur': erreursCellules[cleLoc(e.entretienId, l.index, v.id)] }"
                        :title="erreursCellules[cleLoc(e.entretienId, l.index, v.id)]"
                        placeholder="texte libre"
                        :disabled="!tableLigneEditable(e.entretienId)"
                        :value="celluleLibre === cleLoc(e.entretienId, l.index, v.id) ? '' : libelleCell(v.id, l.valeursLoc[v.id])"
                        :ref="(el) => refCellule(el, cleLoc(e.entretienId, l.index, v.id))"
                        @focus="effacerErreurCellule(cleLoc(e.entretienId, l.index, v.id))"
                        @keydown.enter.prevent="entreeInput(cleLoc(e.entretienId, l.index, v.id), $event)"
                        @keydown.tab="tabCellule(cleLoc(e.entretienId, l.index, v.id), $event)"
                        @keyup.esc="celluleLibre = null"
                        @change="surLibreLoc(e.entretienId, l.index, v.id, $event)"
                        @blur="celluleLibre = null"
                      />
                      <select
                        v-else
                        :class="{ 'cell-erreur': erreursCellules[cleLoc(e.entretienId, l.index, v.id)] }"
                        :title="erreursCellules[cleLoc(e.entretienId, l.index, v.id)]"
                        :disabled="!tableLigneEditable(e.entretienId)"
                        :value="l.valeursLoc[v.id] ?? ''"
                        :ref="(el) => refCellule(el, cleLoc(e.entretienId, l.index, v.id))"
                        @focus="effacerErreurCellule(cleLoc(e.entretienId, l.index, v.id))"
                        @change="surSelectLoc(e.entretienId, l.index, v.id, $event)"
                        @keydown.tab="tabCellule(cleLoc(e.entretienId, l.index, v.id), $event)"
                        @keydown.enter="entreeSelect(cleLoc(e.entretienId, l.index, v.id), $event)"
                      >
                        <option value="">—</option>
                        <option v-for="m in modalitesDe(v.id)" :key="m.id" :value="m.id">{{ m.lib }}</option>
                        <option :value="AUTRE">autre…</option>
                      </select>
                    </template>
                  </td>
                </tr>
              </template>
            </template>
          </tbody>
        </table>
      </div>
    </section>

    <EditionVariables v-if="editerVariables" @fermer="editerVariables = false" />
    <LotVariable v-if="lotVarId" :id-var="lotVarId" @fermer="lotVarId = null" />
  </section>
</template>

<style scoped>
.donnees-ecran {
  --donnees-gauche-w: 280px;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: var(--donnees-gauche-w) 8px minmax(0, 1fr);
  width: 100%;
  height: calc(100vh - 9rem);
  min-height: 420px;
  border: 1px solid #e0e0ea;
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
}
.donnees-ecran.replie {
  grid-template-columns: minmax(0, 1fr);
}
.donnees-gauche {
  min-width: 0;
  min-height: 0;
  padding: 0.8rem;
  border-right: 1px solid #eee;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.variables-tete,
.table-tete {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.variables-tete {
  margin-bottom: 0.65rem;
}
.variables-tete h2,
.table-tete h2 {
  font-size: 1.05rem;
  margin: 0;
}
.variables-tete h2 {
  flex: 1;
}
.replier-variables,
.deplier-variables {
  border: 1px solid #d5d5df;
  border-radius: 4px;
  background: #fff;
  color: #666;
  cursor: pointer;
  font-size: 1.1rem;
  line-height: 1;
  padding: 0.1rem 0.35rem;
}
.recherche-variable input {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid #ccc;
  border-radius: 5px;
  padding: 0.35rem 0.45rem;
  font-size: 0.8rem;
}
.filtre-portee {
  display: flex;
  margin-top: 0.55rem;
  border: 1px solid #ccc;
  border-radius: 6px;
  overflow: hidden;
}
.filtre-portee button {
  flex: 1;
  border: none;
  background: #fff;
  cursor: pointer;
  font-size: 0.7rem;
  padding: 0.25rem 0.35rem;
  color: #666;
}
.filtre-portee button + button {
  border-left: 1px solid #ccc;
}
.filtre-portee button.actif {
  background: #2e73d8;
  color: #fff;
}
.actions-colonnes {
  display: flex;
  gap: 0.35rem;
  margin: 0.45rem 0;
}
.actions-colonnes button {
  flex: 1;
  border: 1px solid #d5d5df;
  border-radius: 4px;
  background: #fafafe;
  color: #555;
  cursor: pointer;
  font-size: 0.7rem;
  padding: 0.2rem;
}
.liste-variables {
  min-height: 0;
  overflow-y: auto;
}
.groupe-variables h3 {
  margin: 0.6rem 0 0.25rem;
  color: #666;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.ligne-variable {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.35rem;
  padding: 0.28rem 0.2rem;
  border-bottom: 1px solid #f0f0f4;
  cursor: pointer;
  font-size: 0.78rem;
}
.nom-variable {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.statut-variable,
.type-variable {
  color: #888;
  font-size: 0.65rem;
  white-space: nowrap;
}
.statut-variable {
  grid-column: 2;
  padding-left: 0.1rem;
}
.type-variable {
  grid-column: 3;
  grid-row: 1 / span 2;
}
.variables-vide {
  padding: 0.8rem 0.2rem;
  color: #999;
  font-size: 0.78rem;
  line-height: 1.4;
}
.donnees-separateur {
  position: relative;
  cursor: col-resize;
  background: #f5f5f8;
  touch-action: none;
}
.donnees-separateur::after {
  content: '';
  position: absolute;
  top: 45%;
  left: 2px;
  width: 3px;
  height: 10%;
  min-height: 28px;
  border-left: 1px solid #aaa;
  border-right: 1px solid #aaa;
}
.donnees-separateur:focus-visible {
  outline: 2px solid #2e73d8;
  outline-offset: -2px;
}
.donnees-droite {
  min-width: 0;
  min-height: 0;
  padding: 0.8rem;
  display: flex;
  flex-direction: column;
}
.table-tete {
  flex-wrap: wrap;
  margin-bottom: 0.6rem;
}
.compteur-colonnes {
  color: #888;
  font-size: 0.72rem;
}
.table-tete .btn-reprise {
  margin-left: auto;
}
.table-vide {
  margin: auto;
  text-align: center;
}
.table-vide p {
  margin: 0 0 0.5rem;
}
.aide-clavier {
  display: flex;
  gap: 1.1rem;
  align-items: baseline;
  margin: 0 0 0.9rem;
  font-size: 0.72rem;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
}
.aide-clavier kbd {
  font-family: inherit;
  font-size: 0.68rem;
  padding: 0 0.35rem;
  border: 1px solid #ccd3e0;
  border-bottom-width: 2px;
  border-radius: 4px;
  background: #f6f8fc;
  color: #333;
}
.matrice-scroll {
  overflow: auto;
  flex: 1;
  min-height: 0;
}
.matrice {
  border-collapse: collapse;
  font-size: 0.72rem;
}
.matrice th,
.matrice td {
  border: 1px solid #e5e5ef;
  padding: 0.2rem 0.4rem;
  white-space: nowrap;
}
.matrice th {
  background: #f0f0f5;
  position: sticky;
  top: 0;
  z-index: 1;
  text-align: center;
}
.matrice th.col-entretien {
  color: #5c6bc0;
}
.matrice th.col-locuteur {
  color: #8a6d3b;
}
.ligne-ent {
  font-weight: 600;
  background: #fafafe;
}
.matrice th .titre-var,
.matrice th .portee-var {
  display: block;
}
.ligne-loc td:first-child {
  padding-left: 0.9rem;
  color: #000;
}
.matrice.editable td.cell-val {
  padding: 0.1rem 0.2rem;
}
.matrice.editable select,
.cell-libre {
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.1rem 0.25rem;
  font-size: 0.72rem;
  background: #fff;
}
.cell-libre {
  min-width: 7rem;
}
.cell-libre::placeholder {
  color: #bbb;
  font-style: italic;
}
.cell-erreur {
  border-color: #d9534f !important;
  background: #fff5f5;
}
.badge-verrou,
.badge-presence {
  font-size: 0.72rem;
  padding: 0 0.4rem;
  border-radius: 8px;
  margin-left: 0.35rem;
  white-space: nowrap;
}
.badge-verrou {
  background: #fff3cd;
  color: #7a5c00;
}
.badge-presence {
  background: #e2ecff;
  color: #1d4fa1;
}
.aller-saisie {
  font-size: 0.72rem;
  padding: 0 0.45rem;
  margin-left: 0.35rem;
  border: 1px solid #c9d6ee;
  border-radius: 8px;
  background: #f3f7ff;
  color: #1d4fa1;
  cursor: pointer;
  white-space: nowrap;
}
.aller-saisie:hover {
  background: #e2ecff;
}
.lot-var {
  border: none;
  background: none;
  color: #1d4fa1;
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0 0.15rem;
  margin-left: 0.1rem;
}
.lot-var:hover {
  background: #e2ecff;
  border-radius: 4px;
}
.donnees-ecran.vertical {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(160px, 35%) minmax(0, 1fr);
  height: calc(100vh - 8rem);
  overflow: auto;
}
.vertical .donnees-gauche {
  border-right: none;
  border-bottom: 1px solid #eee;
}
.vertical .donnees-droite {
  min-height: 320px;
}
.vertical.replie {
  grid-template-rows: minmax(0, 1fr);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
