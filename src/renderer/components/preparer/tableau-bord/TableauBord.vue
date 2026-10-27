<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import {
  LIGNE_TRAVERSANTE,
  type BadgeTableau,
  type CelluleTableau,
  type ColonneTableau,
  type ContenuCellule,
  type LigneTableau,
} from '../../../../shared/corpus/tableaubord'
import { texteLisible } from './tableauBordAffichage'

// Grille du tableau de bord (panneau droit). Les badges, lignes et colonnes se
// créent dans le panneau gauche (PanneauTableauBord.vue).
const {
  tableaubord,
  messageTableau,
  renommerColonne,
  supprimerColonne,
  deplacerColonne,
  renommerLigne,
  supprimerLigne,
  deplacerLigne,
  poserCellule,
  lectureSeule,
} = utiliserSonal()

const editable = computed(() => !lectureSeule.value)

/** L'aide sous le tableau reste ouverte par défaut ; un clic sur son titre la replie. */
const aideOuverte = ref(true)

/* Largeurs de colonnes et hauteurs de lignes : réglages d'affichage du poste.
 *  Ils sont conservés entre deux sessions et partagés par les corpus. */
const LARGEUR_ENTETES = 120
const LARGEUR_COLONNE_DEFAUT = 120
const LARGEUR_COLONNE_MIN = 60
const LARGEUR_COLONNE_MAX = 600
const HAUTEUR_LIGNE_DEFAUT = 30
const HAUTEUR_LIGNE_MIN = 24
const HAUTEUR_LIGNE_MAX = 300
const CLE_LARGEURS = 'sonalpi.tableauBord.largeursColonnes'
const CLE_HAUTEURS = 'sonalpi.tableauBord.hauteursLignes'

const largeursColonnes = ref<Record<string, number>>({})
const hauteursLignes = ref<Record<string, number>>({})

function borner(valeur: number, min: number, max: number): number {
  return Math.max(min, Math.min(valeur, max))
}
function largeurColonne(colonne: ColonneTableau): number {
  return borner(largeursColonnes.value[colonne.id] ?? LARGEUR_COLONNE_DEFAUT, LARGEUR_COLONNE_MIN, LARGEUR_COLONNE_MAX)
}
function hauteurLigne(ligne: LigneTableau): number {
  return borner(hauteursLignes.value[ligne.id] ?? HAUTEUR_LIGNE_DEFAUT, HAUTEUR_LIGNE_MIN, HAUTEUR_LIGNE_MAX)
}
/** La table garde la somme des largeurs choisies.
 *  Elle déborde et défile au lieu de comprimer ses colonnes. */
const largeurTable = computed(() => LARGEUR_ENTETES
  + (tableaubord.value?.colonnes.reduce((total, colonne) => total + largeurColonne(colonne), 0) ?? 0))

function lireTailles(cle: string): Record<string, number> {
  try {
    const brut = JSON.parse(localStorage.getItem(cle) ?? '{}') as unknown
    if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return {}
    return Object.fromEntries(
      Object.entries(brut).filter(([, valeur]) => typeof valeur === 'number' && Number.isFinite(valeur) && valeur > 0),
    )
  } catch {
    return {}
  }
}
function memoriserTailles(): void {
  try {
    localStorage.setItem(CLE_LARGEURS, JSON.stringify(largeursColonnes.value))
    localStorage.setItem(CLE_HAUTEURS, JSON.stringify(hauteursLignes.value))
  } catch {
    // Le stockage est facultatif : les tailles restent valables pour la session.
  }
}
onMounted(() => {
  largeursColonnes.value = lireTailles(CLE_LARGEURS)
  hauteursLignes.value = lireTailles(CLE_HAUTEURS)
})

let redimensionnementColonne: { id: string; depart: number; taille: number } | null = null
function commencerRedimensionnementColonne(event: PointerEvent, colonne: ColonneTableau): void {
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  redimensionnementColonne = { id: colonne.id, depart: event.clientX, taille: largeurColonne(colonne) }
}
function redimensionnerColonne(event: PointerEvent): void {
  const etat = redimensionnementColonne
  if (!etat || !(event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) return
  largeursColonnes.value[etat.id] = borner(
    etat.taille + event.clientX - etat.depart, LARGEUR_COLONNE_MIN, LARGEUR_COLONNE_MAX,
  )
}
function terminerRedimensionnementColonne(event: PointerEvent): void {
  const cible = event.currentTarget as HTMLElement
  if (cible.hasPointerCapture(event.pointerId)) cible.releasePointerCapture(event.pointerId)
  redimensionnementColonne = null
  memoriserTailles()
}
function ajusterLargeurColonneAuClavier(event: KeyboardEvent, colonne: ColonneTableau): void {
  if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return
  event.preventDefault()
  const largeur = event.key === 'Home'
    ? LARGEUR_COLONNE_DEFAUT
    : largeurColonne(colonne) + (event.key === 'ArrowLeft' ? -10 : 10)
  largeursColonnes.value[colonne.id] = borner(largeur, LARGEUR_COLONNE_MIN, LARGEUR_COLONNE_MAX)
  memoriserTailles()
}
function reinitialiserLargeurColonne(colonne: ColonneTableau): void {
  delete largeursColonnes.value[colonne.id]
  memoriserTailles()
}

let redimensionnementLigne: { id: string; depart: number; taille: number } | null = null
function commencerRedimensionnementLigne(event: PointerEvent, ligne: LigneTableau): void {
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  redimensionnementLigne = { id: ligne.id, depart: event.clientY, taille: hauteurLigne(ligne) }
}
function redimensionnerLigne(event: PointerEvent): void {
  const etat = redimensionnementLigne
  if (!etat || !(event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) return
  hauteursLignes.value[etat.id] = borner(
    etat.taille + event.clientY - etat.depart, HAUTEUR_LIGNE_MIN, HAUTEUR_LIGNE_MAX,
  )
}
function terminerRedimensionnementLigne(event: PointerEvent): void {
  const cible = event.currentTarget as HTMLElement
  if (cible.hasPointerCapture(event.pointerId)) cible.releasePointerCapture(event.pointerId)
  redimensionnementLigne = null
  memoriserTailles()
}
function ajusterHauteurLigneAuClavier(event: KeyboardEvent, ligne: LigneTableau): void {
  if (!['ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return
  event.preventDefault()
  const hauteur = event.key === 'Home'
    ? HAUTEUR_LIGNE_DEFAUT
    : hauteurLigne(ligne) + (event.key === 'ArrowUp' ? -5 : 5)
  hauteursLignes.value[ligne.id] = borner(hauteur, HAUTEUR_LIGNE_MIN, HAUTEUR_LIGNE_MAX)
  memoriserTailles()
}
function reinitialiserHauteurLigne(ligne: LigneTableau): void {
  delete hauteursLignes.value[ligne.id]
  memoriserTailles()
}

/* Édition en ligne des noms : la case libellé devient un champ, Entrée confirme. */
const editionColonne = ref<string | null>(null)
const editionLigne = ref<string | null>(null)
const brouillonNom = ref('')

function commencerEditionColonne(id: string, nom: string) {
  if (!editable.value) return
  editionColonne.value = id
  editionLigne.value = null
  brouillonNom.value = nom
}
function commencerEditionLigne(id: string, nom: string) {
  if (!editable.value) return
  editionLigne.value = id
  editionColonne.value = null
  brouillonNom.value = nom
}
async function validerEdition() {
  const nom = brouillonNom.value.trim()
  if (editionColonne.value && nom) {
    const colonne = tableaubord.value!.colonnes.find((c) => c.id === editionColonne.value)
    if (colonne && nom !== colonne.nom) await renommerColonne(colonne.id, colonne.nom, nom)
  }
  if (editionLigne.value && nom) {
    const ligne = tableaubord.value!.lignes.find((l) => l.id === editionLigne.value)
    if (ligne && nom !== ligne.nom) await renommerLigne(ligne.id, ligne.nom, nom)
  }
  editionColonne.value = null
  editionLigne.value = null
}

/* Suppressions : confirmée seulement si des cellules renseignées disparaissent. */
function compterCellulesColonne(colonneId: string): number {
  return Object.values(tableaubord.value!.cellules)
    .filter((rangee) => rangee[colonneId] !== undefined).length
}
function compterCellulesLigne(ligneId: string): number {
  return Object.keys(tableaubord.value!.cellules[ligneId] ?? {}).length
}
async function retirerColonne(id: string) {
  if (!editable.value) return
  const colonne = tableaubord.value!.colonnes.find((c) => c.id === id)
  if (!colonne) return
  const n = compterCellulesColonne(id)
  if (n > 0 && !window.confirm(`Supprimer la colonne « ${colonne.nom} » ? ${n} case(s) renseignée(s) disparaîtront.`)) return
  await supprimerColonne(id, colonne.nom)
}
async function retirerLigne(id: string) {
  if (!editable.value) return
  const ligne = tableaubord.value!.lignes.find((l) => l.id === id)
  if (!ligne) return
  const n = compterCellulesLigne(id)
  if (n > 0 && !window.confirm(`Supprimer la ligne « ${ligne.nom} » ? ${n} case(s) renseignée(s) disparaîtront.`)) return
  await supprimerLigne(id, ligne.nom)
}

/* Cellules : clic → fiche d'édition centrée ; survol → info-bulle native. */
const caseActive = ref<{ ligneId: string; colonneId: string } | null>(null)
const brouillon = reactive<{
  badge: string | null; note: string; date: string; responsable: string
  dateVisible: boolean; responsableVisible: boolean
}>({
  badge: null, note: '', date: '', responsable: '',
  dateVisible: false, responsableVisible: false,
})
/* La date affichée à l'ouverture (date de la case, sinon aujourd'hui) : si
 * l'utilisateur ne la touche pas, on ne l'envoie pas — le modèle conserve
 * la date d'origine au lieu de la dater de la dernière modification. */
const dateInitiale = ref('')
function dateDuJour(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function ouvrirCase(ligneId: string, colonneId: string) {
  if (!editable.value) return
  const t = tableaubord.value!
  const colonne = t.colonnes.find((c) => c.id === colonneId)
  const cle = colonne ? cleCellule(colonne, ligneId) : ligneId
  const cellule = t.cellules[cle]?.[colonneId]
  brouillon.badge = cellule?.badgeId ?? null
  brouillon.note = cellule?.note ?? ''
  brouillon.date = cellule?.date?.slice(0, 10) ?? dateDuJour()
  brouillon.responsable = cellule?.responsable ?? ''
  brouillon.dateVisible = cellule?.dateVisible ?? false
  brouillon.responsableVisible = cellule?.responsableVisible ?? false
  dateInitiale.value = brouillon.date
  caseActive.value = { ligneId: cle, colonneId }
}
function fermerCase() {
  caseActive.value = null
}
/** Pose le brouillon comme contenu de cellule ; date non touchée = laisser au
 *  modèle (conservée si elle existe, posée à aujourd'hui sinon), vidée = null. */
async function validerCase() {
  const cible = caseActive.value
  if (!cible) return
  const dateTouchée = brouillon.date === dateInitiale.value
    ? undefined
    : (brouillon.date || null)
  const contenu: ContenuCellule = {
    badgeId: brouillon.badge ?? undefined,
    note: brouillon.note,
    responsable: brouillon.responsable,
    date: dateTouchée,
    dateVisible: brouillon.dateVisible || undefined,
    responsableVisible: brouillon.responsableVisible || undefined,
  }
  const deja = tableaubord.value!.cellules[cible.ligneId]?.[cible.colonneId]
  const meme = (deja?.badgeId ?? undefined) === contenu.badgeId
    && (deja?.note ?? '') === (contenu.note ?? '').trim()
    && (deja?.responsable ?? '') === (contenu.responsable ?? '').trim()
    && (deja?.dateVisible ?? false) === (contenu.dateVisible ?? false)
    && (deja?.responsableVisible ?? false) === (contenu.responsableVisible ?? false)
    && contenu.date === undefined
  if (meme) {
    fermerCase()
    return
  }
  try {
    await poserCellule(cible.ligneId, cible.colonneId, contenu)
  } catch {
    // Le message du composable est affiché au-dessus de la grille.
  }
  fermerCase()
}

function celluleDe(ligneId: string, colonneId: string): CelluleTableau | undefined {
  const t = tableaubord.value
  if (!t) return undefined
  const colonne = t.colonnes.find((c) => c.id === colonneId)
  const cle = colonne?.traversante ? LIGNE_TRAVERSANTE : ligneId
  return t.cellules[cle]?.[colonneId]
}
/** Clé de rangée pour une case : les colonnes traversantes partagent la même rangée. */
function cleCellule(colonne: ColonneTableau, ligneId: string): string {
  return colonne.traversante ? LIGNE_TRAVERSANTE : ligneId
}
function badgeDe(badgeId: string | undefined): BadgeTableau | undefined {
  return badgeId ? tableaubord.value?.badges.find((badge) => badge.id === badgeId) : undefined
}
function infoBulle(ligneId: string, colonneId: string): string | undefined {
  const c = celluleDe(ligneId, colonneId)
  if (!c) return undefined
  // Le texte d'abord, puis date et responsable chacun sur sa ligne ; ce qui est
  // déjà visible dans la case n'est pas répété, et une case sans rien à dire n'a pas d'info-bulle.
  const morceaux = [
    c.note,
    c.date && !c.dateVisible ? `Date : ${afficherDate(c.date)}` : null,
    c.responsable && !c.responsableVisible ? `Responsable : ${c.responsable}` : null,
  ]
  return morceaux.filter(Boolean).join('\n') || undefined
}
/** Lignes affichées dans la case sous le badge : le responsable d'abord, la
 *  date ensuite (les deux seulement si cochés visibles dans la fiche). */
function detailsDe(ligneId: string, colonneId: string): string[] {
  const c = celluleDe(ligneId, colonneId)
  if (!c) return []
  const morceaux: string[] = []
  if (c.responsableVisible && c.responsable) morceaux.push(c.responsable)
  if (c.dateVisible && c.date) morceaux.push(afficherDate(c.date))
  return morceaux
}
/** Date abrégée pour la case et l'info-bulle : jj/mm/aa ; inchangée si non lisible. */
function afficherDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`
}
</script>

<template>
  <div class="tableau-bord">
    <p v-if="messageTableau" class="message-tableau">{{ messageTableau }}</p>
    <div class="aide-tableau" :class="{ ouvert: aideOuverte }">
      <button class="aide-titre" @click="aideOuverte = !aideOuverte">
        <span>ℹ️ Comment remplir le tableau ?</span>
        <span class="aide-bascule">{{ aideOuverte ? '▾' : '▸' }}</span>
      </button>
      <div v-if="aideOuverte" class="aide-texte">
        <p>Clique sur une cellule pour éditer son contenu.</p>
        <p>Les notes apparaissent au survol de la case avec la souris.</p>
        <p>Les intitulés des lignes et des colonnes sont modifiables (Alt+Entrée pour un retour à la ligne).</p>
        <p>Fais glisser le bord droit d'une colonne ou le bord bas d'une ligne pour ajuster sa taille ; double-clique pour revenir au défaut.</p>
      </div>
    </div>
    <div v-if="tableaubord" class="conteneur">
      <table class="grille" :style="{ width: largeurTable + 'px' }">
        <colgroup>
          <col :style="{ width: LARGEUR_ENTETES + 'px' }" />
          <col v-for="colonne in tableaubord.colonnes" :key="colonne.id" :style="{ width: largeurColonne(colonne) + 'px' }" />
        </colgroup>
        <thead>
          <tr>
            <th class="coin"></th>
            <th v-for="colonne in tableaubord.colonnes" :key="colonne.id" class="entete-colonne">
              <template v-if="editionColonne === colonne.id">
                <textarea v-model="brouillonNom" class="saisie-nom" rows="1"
                  @keydown.enter.exact.prevent="validerEdition"
                  @keydown.escape="editionColonne = null" @blur="validerEdition"></textarea>
              </template>
              <template v-else>
                <span class="nom" :title="colonne.nom" @click="commencerEditionColonne(colonne.id, colonne.nom)">{{ colonne.nom }}</span>
              </template>
              <span v-if="editable" class="outils-colonne">
                <button class="mini" title="Déplacer à gauche" :disabled="tableaubord.colonnes.indexOf(colonne) === 0" @click="deplacerColonne(colonne.id, tableaubord.colonnes[tableaubord.colonnes.indexOf(colonne) - 1]?.id ?? null)">◀</button>
                <button class="mini" title="Déplacer à droite" @click="deplacerColonne(colonne.id, tableaubord.colonnes[tableaubord.colonnes.indexOf(colonne) + 1]?.id ?? null)">▶</button>
                <button class="mini" title="Supprimer la colonne" @click="retirerColonne(colonne.id)">✕</button>
              </span>
              <span
                class="poignee poignee-colonne"
                role="separator"
                aria-orientation="vertical"
                :aria-label="`Largeur de la colonne ${colonne.nom}`"
                :aria-valuenow="largeurColonne(colonne)"
                :aria-valuemin="LARGEUR_COLONNE_MIN"
                :aria-valuemax="LARGEUR_COLONNE_MAX"
                tabindex="0"
                title="Glisser pour régler la largeur ; double-clic pour revenir au défaut"
                @pointerdown.stop="commencerRedimensionnementColonne($event, colonne)"
                @pointermove="redimensionnerColonne"
                @pointerup="terminerRedimensionnementColonne"
                @pointercancel="terminerRedimensionnementColonne"
                @keydown="ajusterLargeurColonneAuClavier($event, colonne)"
                @dblclick.stop.prevent="reinitialiserLargeurColonne(colonne)"
              ></span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ligne in tableaubord.lignes" :key="ligne.id" :style="{ height: hauteurLigne(ligne) + 'px' }">
            <th class="entete-ligne">
              <template v-if="editionLigne === ligne.id">
                <textarea v-model="brouillonNom" class="saisie-nom" rows="1"
                  @keydown.enter.exact.prevent="validerEdition"
                  @keydown.escape="editionLigne = null" @blur="validerEdition"></textarea>
              </template>
              <template v-else>
                <span class="nom" :title="ligne.nom" @click="commencerEditionLigne(ligne.id, ligne.nom)">{{ ligne.nom }}</span>
              </template>
              <span v-if="editable" class="outils-ligne">
                <button class="mini" title="Déplacer vers le haut" :disabled="tableaubord.lignes.indexOf(ligne) === 0" @click="deplacerLigne(ligne.id, tableaubord.lignes[tableaubord.lignes.indexOf(ligne) - 1]?.id ?? null)">▲</button>
                <button class="mini" title="Déplacer vers le bas" @click="deplacerLigne(ligne.id, tableaubord.lignes[tableaubord.lignes.indexOf(ligne) + 1]?.id ?? null)">▼</button>
                <button class="mini" title="Supprimer la ligne" @click="retirerLigne(ligne.id)">✕</button>
              </span>
              <span
                class="poignee poignee-ligne"
                role="separator"
                aria-orientation="horizontal"
                :aria-label="`Hauteur de la ligne ${ligne.nom}`"
                :aria-valuenow="hauteurLigne(ligne)"
                :aria-valuemin="HAUTEUR_LIGNE_MIN"
                :aria-valuemax="HAUTEUR_LIGNE_MAX"
                tabindex="0"
                title="Glisser pour régler la hauteur ; double-clic pour revenir au défaut"
                @pointerdown.stop="commencerRedimensionnementLigne($event, ligne)"
                @pointermove="redimensionnerLigne"
                @pointerup="terminerRedimensionnementLigne"
                @pointercancel="terminerRedimensionnementLigne"
                @keydown="ajusterHauteurLigneAuClavier($event, ligne)"
                @dblclick.stop.prevent="reinitialiserHauteurLigne(ligne)"
              ></span>
            </th>
            <template v-for="colonne in tableaubord.colonnes" :key="colonne.id">
              <td v-if="!colonne.traversante || tableaubord.lignes.indexOf(ligne) === 0"
                :rowspan="colonne.traversante ? tableaubord.lignes.length : undefined"
                class="case"
                :data-tour="colonne.id === 'problematique' ? 'cellule-problematique' : undefined"
                :class="{ 'case-active': caseActive?.ligneId === cleCellule(colonne, ligne.id) && caseActive?.colonneId === colonne.id, 'case-traversante': colonne.traversante }"
                :title="infoBulle(ligne.id, colonne.id)"
                @click="ouvrirCase(ligne.id, colonne.id)">
                <template v-if="celluleDe(ligne.id, colonne.id) && badgeDe(celluleDe(ligne.id, colonne.id)!.badgeId)">
                  <span class="badge" :style="{ background: badgeDe(celluleDe(ligne.id, colonne.id)!.badgeId)!.couleur, color: texteLisible(badgeDe(celluleDe(ligne.id, colonne.id)!.badgeId)!.couleur) }">{{ badgeDe(celluleDe(ligne.id, colonne.id)!.badgeId)!.nom }}</span>
                </template>
                <span v-else-if="celluleDe(ligne.id, colonne.id)" class="sans-badge">·</span>
                <span v-if="detailsDe(ligne.id, colonne.id).length" class="details-case"><span v-for="(detail, i) in detailsDe(ligne.id, colonne.id)" :key="i">{{ detail }}</span></span>
              </td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="caseActive" class="voile-case" @click.self="fermerCase">
      <div class="modale-case" data-tour="formulaire-cellule-tableau" @keydown.escape="fermerCase">
        <div data-tour="ancre-guide-tableau-form"></div>
        <div class="statuts">
          <button :class="{ actif: brouillon.badge === null }" @click="brouillon.badge = null">Sans badge</button>
          <button v-for="badge in tableaubord?.badges" :key="badge.id" class="badge" :class="{ actif: brouillon.badge === badge.id }" :style="{ background: badge.couleur, color: texteLisible(badge.couleur) }" @click="brouillon.badge = badge.id">{{ badge.nom }}</button>
        </div>
        <label>Note
          <textarea v-model="brouillon.note" class="saisie-note" data-tour="note-cellule-tableau" rows="2" placeholder="Petit texte d'accompagnement…"></textarea>
        </label>
        <div class="champ">
          <span>Date</span>
          <span class="rang-case">
            <input v-model="brouillon.date" type="date" />
            <label class="visibilite" title="Afficher la date dans la case, sous le badge">
              <input v-model="brouillon.dateVisible" type="checkbox" /> dans la case
            </label>
          </span>
        </div>
        <div class="champ">
          <span>Responsable</span>
          <span class="rang-case">
            <input v-model="brouillon.responsable" placeholder="Qui s'en occupe ?" />
            <label class="visibilite" title="Afficher le responsable dans la case, sous le badge">
              <input v-model="brouillon.responsableVisible" type="checkbox" /> dans la case
            </label>
          </span>
        </div>
        <div class="modale-actions">
          <button class="valider" data-tour="appliquer-cellule-tableau" @click="validerCase">Appliquer</button>
          <button @click="fermerCase">Annuler</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tableau-bord { position: relative; min-height: 0; flex: 1; display: flex; flex-direction: column; gap: 0.5rem; }
.conteneur { overflow: auto; flex: 1; min-height: 0; }
.message-tableau { color: #b03030; margin: 0; font-size: 0.8rem; }
/* Encadré d'aide repliable, dans l'esprit de celui des documents du projet. */
.aide-tableau { flex: none; border: 1px solid #d5dced; border-radius: 6px; background: #f2f5fb; }
.aide-titre { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: .4rem; text-align: left; background: none; border: none; border-radius: 0; padding: .45rem .6rem; font-size: .8rem; color: #2c3a5e; font-weight: 600; }
.aide-titre:hover { background: rgba(74, 114, 184, .08); }
.aide-bascule { color: #7a8299; }
.aide-texte { padding: 0 .6rem .55rem 2.5rem; font-size: .74rem; line-height: 1.35; color: #44506a; }
.aide-texte p { margin: 0 0 .25rem; }
.aide-texte p:last-child { margin-bottom: 0; }
.grille { border-collapse: collapse; background: #fff; table-layout: fixed; }
.grille th, .grille td { border: 1px solid #c8ccd4; padding: 0.15rem 0.3rem; font-size: 0.72rem; }
.coin { width: 7.5rem; }
.entete-colonne { background: #eef1f6; text-align: center; vertical-align: bottom; }
.entete-colonne .nom { cursor: pointer; font-weight: 600; white-space: pre-line; text-align: center; overflow-wrap: anywhere; }
.entete-ligne { background: #eef1f6; text-align: left; position: relative; }
.entete-ligne .nom { cursor: pointer; font-weight: 600; white-space: pre-line; overflow-wrap: anywhere; }
.poignee { position: absolute; z-index: 1; touch-action: none; user-select: none; }
.poignee-colonne { top: 0; right: 0; bottom: 0; width: 7px; cursor: col-resize; }
.poignee-ligne { right: 0; bottom: 0; left: 0; height: 7px; cursor: row-resize; }
.poignee:hover, .poignee:focus-visible { background: rgba(74, 114, 184, .35); outline: none; }
.outils-colonne, .outils-ligne { display: inline-flex; gap: 0.1rem; visibility: hidden; }
.entete-colonne { position: relative; }
.entete-colonne:hover .outils-colonne, .entete-ligne:hover .outils-ligne { visibility: visible; }
.outils-colonne { position: absolute; right: 0.1rem; top: 0.1rem; background: #eef1f6; z-index: 2; }
.outils-ligne { position: absolute; right: 0.1rem; top: 0.1rem; background: #eef1f6; z-index: 2; }
.mini { border: none; background: transparent; cursor: pointer; font-size: 0.6rem; padding: 0 0.1rem; color: #8a8f9c; }
.mini:hover { color: #333; }
.mini:disabled { visibility: hidden; }
.case { min-width: 2.8rem; min-height: 1.2rem; cursor: pointer; vertical-align: middle; text-align: center; }
.case-traversante { background: #fff; }
.case:hover { background: #f4f7fd; }
.case-active { outline: 2px solid #4a72b8; }
.badge { display: inline-block; border-radius: 9px; padding: 0 0.4rem; font-size: 0.72rem; font-weight: 600; line-height: 1.35; }
.badge .mini { color: inherit; opacity: .7; }
.badge .mini:hover { opacity: 1; }
.sans-badge { color: #8a8f9c; }
.details-case { display: block; font-size: 0.6rem; color: #555; line-height: 1.25; margin-top: 0.1rem; }
.details-case span { display: block; }
.saisie-nom { width: 8rem; font-size: 0.78rem; resize: none; field-sizing: content; min-height: 1.8rem; }
input, button { border: 1px solid #bbb; border-radius: 5px; padding: 0.25rem 0.5rem; font-size: 0.78rem; background: #fff; }
button { cursor: pointer; }
button:hover { background: #f4f7fd; }
.voile-case { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(0, 0, 0, .35); }
.modale-case { box-sizing: border-box; display: flex; flex-direction: column; gap: 0.5rem; background: #fff; border: 1px solid #c8ccd4; border-radius: 8px; padding: 1.1rem; box-shadow: 0 8px 30px rgba(0, 0, 0, .25); width: min(680px, 94vw); max-height: 92vh; overflow: auto; }
.modale-case label { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.74rem; color: #444; }
.modale-case .champ { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.74rem; color: #444; }
.rang-case { display: flex; align-items: center; gap: 0.4rem; }
.rang-case input:not([type='checkbox']) { flex: 1; }
.visibilite { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.74rem; color: #444; white-space: nowrap; cursor: pointer; }
.saisie-note { resize: none; min-height: 2.6rem; }
.statuts { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.statuts button.actif { background: #e3ebf9; border-color: #4a6fa5; font-weight: 600; }
/* Sélection lisible même sur un bouton-badge (fond imposé en ligne) : anneau
 * épais + coche, au lieu du seul liseré fin. */
.statuts button.actif { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #2f5aa8; }
.statuts button.actif::before { content: '✓ '; }
.modale-actions { display: flex; gap: 0.4rem; justify-content: flex-end; }
.valider { background: #2f5aa8; color: #fff; border-color: #2f5aa8; }
.valider:hover { background: #264a8c; }
</style>
