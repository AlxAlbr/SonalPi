<script setup lang="ts">
import { computed, ref } from 'vue'
import { utiliserSonal } from '../composables/sonal'
import { celluleVoisine, grilleCellules, type SensNav } from '../tableNavigation'
import EditionVariables from './EditionVariables.vue'
import LotVariable from './LotVariable.vue'

const {
  variables,
  matrice,
  modalitesDe,
  poserGen,
  poserLoc,
  poserGenLibelle,
  poserLocLibelle,
  membership,
  reprise,
  reprendre,
  lectureSeule, // corpus distant : définitions grisées hors ligne
  tableLigneEditable, // garde PAR LIGNE : badge 🔒 = verrou tenu par autrui
  badgeVerrou, // badges « par ligne » — informatifs
  presencesSur,
  idDistantCourant, // null = corpus local (grille directement éditable)
  allerSaisieDonnees, // « Saisir… » par LIGNE d'entretien (corpus distant)
} = utiliserSonal()

// La fenêtre d'édition des variables (crayon).
// La grille ci-dessous reste une pure SAISIE plein écran.
const editerVariables = ref(false)

// Modale « Modifier en lot » : id de la variable de portée ENTRETIEN.
// Ouverte depuis le <th> de la variable (null = fermée).
const lotVarId = ref<string | null>(null)

// --- Filtre de portée + regroupement ---
// Colonnes REGROUPÉES : variables d'entretien d'abord, puis de locuteur.
// Filtre « entretien » : les lignes locuteurs disparaissent.
// Filtre « locuteur » : les lignes entretien RESTENT ; ce sont les séparateurs qui rendent la grille lisible.
const filtrePortee = ref<'toutes' | 'entretien' | 'locuteur'>('toutes')
const variablesVisibles = computed(() => {
  const groupees = [
    ...variables.value.filter((v) => v.portee === 'entretien'),
    ...variables.value.filter((v) => v.portee === 'locuteur'),
  ]
  if (filtrePortee.value === 'toutes') return groupees
  return groupees.filter((v) => v.portee === filtrePortee.value)
})

// --- SAISIE LIBRE ---
// Variable SANS modalité : cellule en champ texte permanent.
// Chaque libellé saisi trouve-ou-crée sa modalité (dictionnaire).
// Variable AVEC modalités : le select garde une option « autre… »,
// qui bascule LA cellule en champ texte.
const AUTRE = ' autre' // sentinelle : ne peut pas être un id de modalité
const celluleLibre = ref<string | null>(null) // clé de LA cellule en mode texte
// Erreur INLINE par cellule : le refus (verrou tenu par autrui, divergence 412…)
// marque LA cellule (bord rouge + tooltip), sans bloquer la saisie ailleurs ;
// effacée au focus suivant. Les rejets IPC (réseau…) remontent à la bannière globale (unhandledrejection, erreurs.ts).
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

/** Libellé affichable d'une valeur (id de modalité) — id brut si inconnu. */
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
/** Commit d'une cellule : seul le refus TRANSACTIONNEL revient ici, en erreur inline.
 *  Un rejet IPC (réseau) n'est pas catché → bannière globale. */
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
/** Focus du champ texte OUVERT via « autre… ».
 *  Les champs permanents, dont la clé ne matche pas, ne volent jamais le focus. */
function focaliserLibre(el: unknown, cle: string) {
  if (el instanceof HTMLInputElement && celluleLibre.value === cle && document.activeElement !== el)
    el.focus()
}

// --- NAVIGATION CLAVIER ---
// Registre de focus : chaque cellule rendue (select ou input libre) s'enregistre sous SA clé ;
// la grille pure (tableNavigation.ts) dit où aller, ce registre dit COMMENT (focus + scrollIntoView).
const refsCellules = new Map<string, HTMLElement>()
function refCellule(el: unknown, cle: string) {
  if (el instanceof HTMLElement) refsCellules.set(cle, el)
  else refsCellules.delete(cle) // démontage : Vue appelle la ref avec null
  focaliserLibre(el, cle) // l'auto-focus des champs « autre… » est conservé
}
const grille = computed(() =>
  grilleCellules({
    entrees: matrice.value,
    variables: variablesVisibles.value,
    montrerLocuteurs: filtrePortee.value !== 'entretien',
    editable: (id) => tableLigneEditable(id),
  }),
)
/** Focus immédiat sur la voisine. Le commit éventuel part déjà en arrière-plan :
 *  la navigation n'attend JAMAIS le réseau. Retour false = pas de cible,
 *  l'appelant laisse Tab/Entrée natifs reprendre. */
function naviguer(cle: string, sens: SensNav): boolean {
  const cible = celluleVoisine(grille.value, cle, sens)
  if (!cible) return false
  const el = refsCellules.get(cible)
  if (!el || (el as HTMLInputElement).disabled) return false
  el.focus()
  el.scrollIntoView({ block: 'nearest' })
  return true
}
/** Entrée sur champ texte libre : valider (blur → change → commit), puis descendre.
 *  Shift+Entrée : remonter. */
function entreeInput(cle: string, evt: KeyboardEvent) {
  ;(evt.target as HTMLInputElement).blur()
  naviguer(cle, evt.shiftKey ? 'haut' : 'bas')
}
/** Entrée sur select : descendre.
 *  En keydown SANS preventDefault, Chromium avale le keyup des selects (déroulant fermé) ;
 *  preventDefault empêcherait le déroulant ouvert de se fermer normalement.
 *  Shift+Entrée : remonter. */
function entreeSelect(cle: string, evt: KeyboardEvent) {
  naviguer(cle, evt.shiftKey ? 'haut' : 'bas')
}
/** Tab / Shift+Tab : droite / gauche DANS le modèle de cellules éditables.
 *  On ne reprend la main QUE s'il existe une cible — sinon Tab natif sort de
 *  la grille (badges, boutons ⇊/« Saisir… », filtre… restent atteignables). */
function tabCellule(cle: string, evt: KeyboardEvent) {
  if (naviguer(cle, evt.shiftKey ? 'gauche' : 'droite')) evt.preventDefault()
}
</script>

<template>
    <section class="ecran donnees-ecran">
      <div class="table-tete">
        <h2>Table de données</h2>
        <button v-if="!lectureSeule" class="crayon" title="Éditer les variables (nom, statut, modalités)" @click="editerVariables = true">✏️</button>
        <div class="filtre-portee" title="Filtrer les colonnes par portée">
          <button :class="{ actif: filtrePortee === 'toutes' }" @click="filtrePortee = 'toutes'">toutes</button>
          <button :class="{ actif: filtrePortee === 'entretien' }" @click="filtrePortee = 'entretien'">entretien</button>
          <button :class="{ actif: filtrePortee === 'locuteur' }" @click="filtrePortee = 'locuteur'">locuteurs</button>
        </div>
        <!-- Entrer ici a FERMÉ (et sauvegardé) l'entretien tenu ;
             le point de reprise le rouvre là où on en était (texte + audio). -->
        <button v-if="reprise" class="btn-reprise" @click="reprendre">
          ↩ Reprendre « {{ membership[reprise.id]?.titre }} »
        </button>
      </div>

      <!-- Légende clavier sur UNE ligne, entre le titre et la grille.
           Masquée hors édition (cellules grisées). -->
      <p v-if="!lectureSeule && variablesVisibles.length > 0" class="aide-clavier">
        <span><kbd>Tab</kbd> droite · <kbd>⇧Tab</kbd> gauche</span>
        <span><kbd>Entrée</kbd> descendre · <kbd>⇧Entrée</kbd> remonter</span>
        <span><kbd>⇊</kbd> changement par lot</span>
      </p>

      <p v-if="variables.length === 0" class="vide">Aucune variable — ✏️ pour en créer.</p>
      <p v-else-if="variablesVisibles.length === 0" class="vide">
        Aucune variable de portée « {{ filtrePortee }} ».
      </p>
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
                <!-- Portée puis lot (entretien uniquement) sur une deuxième ligne,
                     sous le libellé : « (ent)⇊ ». -->
                <span class="portee-var">
                  <small>({{ v.portee === 'entretien' ? 'ent' : 'loc' }})</small>
                  <!-- Lot sur les entretiens non ouverts — jamais hors ligne. -->
                  <button v-if="v.portee === 'entretien' && !lectureSeule" class="lot-var"
                          title="Modifier en lot pour tous les entretiens non ouverts"
                          @click="lotVarId = v.id">⇊</button>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            <template v-for="e in matrice" :key="e.entretienId">
              <tr>
                <td class="ligne-ent">📄 {{ e.titre }}
                  <!-- Verrou par ligne (décision = verrou) et présence.
                       (« Ouvert par X », jamais décisionnel.) -->
                  <span v-if="badgeVerrou(e.entretienId)" class="badge-verrou"
                        :title="`Verrou tenu par ${badgeVerrou(e.entretienId)!.userId} — ouverture en lecture seule.`">🔒 {{ badgeVerrou(e.entretienId)!.userId }}</span>
                  <span v-for="p in presencesSur(e.entretienId)" :key="p.machineId"
                        class="badge-presence" :title="`Consulté par ${p.userId} (autre poste)`">👁 {{ p.userId }}</span>
                  <!-- Corpus DISTANT uniquement : ouvrir CET entretien sur son onglet Donnée.
                       Le verrou existant tranche : libre → saisie, tenu ailleurs → lecture seule 🔒.
                       En local, la grille est directement éditable, le bouton n'a pas lieu d'être. -->
                  <button v-if="idDistantCourant && !lectureSeule" class="aller-saisie"
                          title="Ouvrir cet entretien sur l'onglet Donnée pour saisir ses valeurs"
                          @click="allerSaisieDonnees(e.entretienId)">Saisir…</button>
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

      <EditionVariables v-if="editerVariables" @fermer="editerVariables = false" />
      <LotVariable v-if="lotVarId" :id-var="lotVarId" @fermer="lotVarId = null" />
    </section>
</template>

<style scoped>
/* Badges « par ligne » — même sémantique que les cartes Corpus.
   Verrou = décision ; présence = purement informatif, jamais décisionnel. */
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
/* Bouton « Saisir… » de la ligne entretien —
   même gabarit discret que les badges, à la suite. */
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
/* Bouton de COLONNE « modifier en lot » —
   discret, dans l'en-tête, à côté du libellé. */
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
.hint {
  color: #666;
  font-size: 0.85rem;
  margin: 0;
  flex: 1;
}
/* Légende clavier — UNE ligne compacte. */
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
/* Plein écran : la grille occupe la hauteur restante de la fenêtre,
   et défile dans son cadre (en-tête de colonnes collant). */
.donnees-ecran {
  max-width: 100%;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 7.5rem); /* fenêtre − en-tête App (titre + fil d'Ariane) */
}
.table-tete {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  margin-bottom: 0.6rem;
}
.table-tete h2 {
  font-size: 1.05rem;
  margin: 0.3rem 0;
}
/* Filtre de portée : boutons segmentés (le badge ent/loc reprend ces couleurs). */
.filtre-portee {
  display: inline-flex;
  border: 1px solid #ccc;
  border-radius: 6px;
  overflow: hidden;
}
.filtre-portee button {
  border: none;
  background: #fff;
  cursor: pointer;
  font-size: 0.72rem;
  padding: 0.2rem 0.55rem;
  color: #666;
}
.filtre-portee button + button {
  border-left: 1px solid #ccc;
}
.filtre-portee button.actif {
  background: #2e73d8;
  color: #fff;
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
  text-align: center; /* en-têtes centrés, comme l'onglet Pseudonymisation */
}
/* Couleurs des colonnes par portée, comme l'onglet Données de l'entretien :
   variable d'entretien en bleu-violet, variable de locuteur en marron,
   reprise aussi par les badges ent/loc d'EditionVariables. */
.matrice th.col-entretien {
  color: #5c6bc0;
}
.matrice th.col-locuteur {
  color: #8a6d3b;
}
.ligne-ent {
  font-weight: 600; /* nom de l'entretien en gras */
  background: #fafafe;
}
/* En-tête de variable sur DEUX lignes : libellé en haut,
   portée « (ent) » / « (loc) » et bouton ⇊ en dessous. */
.matrice th .titre-var,
.matrice th .portee-var {
  display: block;
}
.ligne-loc td:first-child {
  padding-left: 0.9rem;
  color: #000; /* nom du locuteur en noir, comme l'onglet Données (fiche-loc) */
}
.matrice.editable td.cell-val {
  padding: 0.1rem 0.2rem;
}
.matrice.editable select {
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.1rem 0.25rem;
  font-size: 0.72rem;
  background: #fff;
}
.cell-libre {
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.1rem 0.25rem;
  font-size: 0.72rem;
  min-width: 7rem;
}
.cell-libre::placeholder {
  color: #bbb;
  font-style: italic;
}
/* Erreur INLINE — refus nominatif (verrou autrui, divergence…) :
   marqué sur LA cellule, sans bloquer les autres. */
.cell-erreur {
  border-color: #d9534f !important;
  background: #fff5f5;
}
</style>
