<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import {
  LIGNE_TRAVERSANTE,
  type BadgeTableau,
  type CelluleTableau,
  type ColonneTableau,
  type ContenuCellule,
} from '../../../shared/corpus/tableaubord'

const {
  tableaubord,
  messageTableau,
  ajouterColonne,
  renommerColonne,
  supprimerColonne,
  deplacerColonne,
  ajouterBadge,
  supprimerBadge,
  ajouterLigne,
  renommerLigne,
  supprimerLigne,
  deplacerLigne,
  poserCellule,
  lectureSeule,
} = utiliserSonal()

const editable = computed(() => !lectureSeule.value)

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

/* Ajouts : un champ à la fin de la grille. */
const nomNouvelleColonne = ref('')
const nouvelleTraversante = ref(false)
const nomNouvelleLigne = ref('')
async function creerColonne() {
  const nom = nomNouvelleColonne.value.trim()
  if (!nom) return
  await ajouterColonne(nom, nouvelleTraversante.value)
  nomNouvelleColonne.value = ''
  nouvelleTraversante.value = false
}
async function creerLigne() {
  const nom = nomNouvelleLigne.value.trim()
  if (!nom) return
  await ajouterLigne(nom)
  nomNouvelleLigne.value = ''
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
/** Texte du badge en sombre sur couleur claire, blanc sur couleur sombre. */
function texteLisible(couleur: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(couleur)?.[1]
  if (!hex) return '#fff'
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return (0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!)) > 0.55 ? '#1a1a1a' : '#fff'
}
/** Badges jamais posés dans une case : seuls ceux-là sont supprimables. */
const badgesUtilises = computed(() => new Set(
  Object.values(tableaubord.value?.cellules ?? {})
    .flatMap((rangee) => Object.values(rangee))
    .map((cellule) => cellule.badgeId)
    .filter((id): id is string => id !== undefined),
))
const nomNouveauBadge = ref('')
const couleurNouveauBadge = ref('#3399ff')
async function creerBadge() {
  const nom = nomNouveauBadge.value.trim()
  if (!nom) return
  try {
    await ajouterBadge(nom, couleurNouveauBadge.value)
    nomNouveauBadge.value = ''
  } catch {
    // Le message du composable est affiché au-dessus de la grille.
  }
}
async function retirerBadge(id: string) {
  if (!editable.value || badgesUtilises.value.has(id)) return
  const badge = tableaubord.value!.badges.find((badge) => badge.id === id)
  if (!badge) return
  await supprimerBadge(id, badge.nom)
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
    <div class="aide-tableau">
      <p>Clique sur une cellule pour éditer son contenu.</p>
      <p>Les notes apparaissent au survol de la case avec la souris.</p>
      <p>Les intitulés des lignes et des colonnes sont modifiables (Alt+Entrée pour un retour à la ligne).</p>
    </div>
    <div v-if="tableaubord" class="conteneur">
      <table class="grille">
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
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ligne in tableaubord.lignes" :key="ligne.id">
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
            </th>
            <template v-for="colonne in tableaubord.colonnes" :key="colonne.id">
              <td v-if="!colonne.traversante || tableaubord.lignes.indexOf(ligne) === 0"
                :rowspan="colonne.traversante ? tableaubord.lignes.length : undefined"
                class="case"
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

      <div v-if="editable" class="cartes">
        <section class="carte">
          <h3>Badges</h3>
          <div class="rang-badges">
            <span v-for="badge in tableaubord.badges" :key="badge.id" class="badge" :style="{ background: badge.couleur, color: texteLisible(badge.couleur) }">
              {{ badge.nom }}
              <button v-if="!badgesUtilises.has(badge.id)" class="mini" title="Supprimer ce badge" @click="retirerBadge(badge.id)">✕</button>
            </span>
          </div>
          <div class="rang-creer">
            <input v-model="nomNouveauBadge" class="badge-nom" placeholder="Nom du badge…" @keydown.enter="creerBadge" />
            <input v-model="couleurNouveauBadge" type="color" class="badge-couleur" title="Couleur du nouveau badge" />
            <button @click="creerBadge">+ Créer</button>
          </div>
        </section>
        <section class="carte">
          <h3>Ligne</h3>
          <div class="rang-creer">
            <input v-model="nomNouvelleLigne" placeholder="Nom de la ligne…" @keydown.enter="creerLigne" />
            <button @click="creerLigne">+ Ajouter</button>
          </div>
        </section>
        <section class="carte">
          <h3>Colonne</h3>
          <div class="rang-creer">
            <input v-model="nomNouvelleColonne" placeholder="Nom de la colonne…" @keydown.enter="creerColonne" />
            <button @click="creerColonne">+ Ajouter</button>
          </div>
          <label class="choix-traversante" title="Une seule case pour tous les entretiens">
            <input v-model="nouvelleTraversante" type="checkbox" /> traversante
          </label>
        </section>
      </div>
    </div>

    <div v-if="caseActive" class="voile-case" @click.self="fermerCase">
      <div class="modale-case" @keydown.escape="fermerCase">
        <div class="statuts">
          <button :class="{ actif: brouillon.badge === null }" @click="brouillon.badge = null">Sans badge</button>
          <button v-for="badge in tableaubord?.badges" :key="badge.id" class="badge" :class="{ actif: brouillon.badge === badge.id }" :style="{ background: badge.couleur, color: texteLisible(badge.couleur) }" @click="brouillon.badge = badge.id">{{ badge.nom }}</button>
        </div>
        <label>Note
          <textarea v-model="brouillon.note" class="saisie-note" rows="2" placeholder="Petit texte d'accompagnement…"></textarea>
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
          <button class="valider" @click="validerCase">Appliquer</button>
          <button @click="fermerCase">Annuler</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tableau-bord { position: relative; height: 100%; display: flex; flex-direction: column; gap: 0.5rem; }
.conteneur { overflow: auto; flex: 1; }
.message-tableau { color: #b03030; margin: 0; font-size: 0.8rem; }
.aide-tableau { flex: none; margin: 0; color: #66707f; font-size: 0.74rem; }
.aide-tableau p { margin: 0 0 0.1rem; }
.grille { border-collapse: collapse; background: #fff; }
.grille th, .grille td { border: 1px solid #c8ccd4; padding: 0.15rem 0.3rem; font-size: 0.72rem; }
.coin { width: 7.5rem; }
.entete-colonne { background: #eef1f6; text-align: center; vertical-align: bottom; }
.entete-colonne .nom { cursor: pointer; font-weight: 600; white-space: pre-line; text-align: center; }
.entete-ligne { background: #eef1f6; text-align: left; }
.entete-ligne .nom { cursor: pointer; font-weight: 600; white-space: pre-line; }
.outils-colonne, .outils-ligne { display: inline-flex; gap: 0.1rem; visibility: hidden; }
.entete-colonne { position: relative; }
.entete-colonne:hover .outils-colonne, .entete-ligne:hover .outils-ligne { visibility: visible; }
.outils-colonne { position: absolute; right: 0.1rem; top: 0.1rem; background: #eef1f6; }
.outils-ligne { margin-left: 0.4rem; }
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
.badges { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; padding-top: 0.4rem; }
.cartes { display: flex; flex-wrap: wrap; align-items: stretch; gap: 0.6rem; padding-top: 0.6rem; }
.carte { background: #fff; border: 1px solid #c8ccd4; border-radius: 8px; padding: 0.5rem 0.7rem 0.6rem; display: flex; flex-direction: column; gap: 0.4rem; }
.carte h3 { margin: 0; font-size: 0.76rem; color: #444; text-transform: uppercase; letter-spacing: 0.03em; }
.rang-badges { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; }
.rang-creer { display: flex; align-items: center; gap: 0.35rem; }
.badge-nom { width: 9rem; }
.badge-couleur { width: 2.2rem; padding: 0 0.1rem; }
.choix-traversante { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.78rem; color: #444; white-space: nowrap; }
.ajouts { display: flex; gap: 0.4rem; padding-top: 0.5rem; }
.ajouts input { flex: 1; }
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
