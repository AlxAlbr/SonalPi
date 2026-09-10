<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, toRef } from 'vue'
import { useNotesCorpus } from '../../composables/useNotesCorpus'
import ModaleNoteCorpus from './ModaleNoteCorpus.vue'
import type { ChampsNote, LienCommentaireNoteCorpus, VueNoteCorpus } from '../../../shared/corpus/notes'

const props = defineProps<{ actif: boolean }>()
const {
  avecLiens,
  badgeVerrou,
  categories,
  categoriesNote,
  charge,
  chargement,
  corpsAffiche,
  couleurCategorieNote,
  critereTri,
  dateDebut,
  dateFin,
  entretiens,
  entretiensDisponibles,
  erreur,
  erreurLecture,
  exporterMarkdown,
  idDistantCourant,
  importants,
  inventaire,
  modeAffichage,
  modifier,
  motCle,
  nomCategorieNote,
  notesChronologiques,
  notesFiltrees,
  notesParEntretien,
  notesResume,
  ouvrir,
  ordreTri,
  rafraichirNotes,
  recherche,
  resumeIndisponibles,
  statut,
  supprimer,
  toutAfficher,
} = useNotesCorpus(toRef(props, 'actif'))

const noteEditee = ref<VueNoteCorpus | null>(null)
const commandeEnCours = ref(false)

function ouvrirEdition(note: VueNoteCorpus): void {
  if (!idDistantCourant.value && !commandeEnCours.value) noteEditee.value = note
}

function doubleClic(note: VueNoteCorpus, event: MouseEvent): void {
  if ((event.target as Element | null)?.closest('button')) return
  ouvrirEdition(note)
}

async function validerEdition(champs: ChampsNote): Promise<void> {
  const note = noteEditee.value
  if (!note || commandeEnCours.value) return
  commandeEnCours.value = true
  try {
    await modifier(note, champs)
    noteEditee.value = null
  } catch {
    // Le message de la commande reste affiché dans l’onglet.
  } finally {
    commandeEnCours.value = false
  }
}

async function confirmerSuppression(note: VueNoteCorpus): Promise<void> {
  if (idDistantCourant.value || commandeEnCours.value) return
  const titre = note.titre || '(sans titre)'
  if (!window.confirm(`Supprimer la note '${titre}' ? Cette action apparaîtra dans le Journal.`)) return
  commandeEnCours.value = true
  try {
    await supprimer(note)
  } catch {
    // Le message de la commande reste affiché dans l’onglet.
  } finally {
    commandeEnCours.value = false
  }
}

const panneau = ref<HTMLElement | null>(null)
const largeur = ref(300)
const verticale = ref(false)
const replie = ref(false)
const cleLargeur = 'sonalpi.notesCorpus.largeurGauche'
let observateur: ResizeObserver | undefined

function borner(valeur: number): number {
  return Math.max(240, Math.min(valeur, Math.max(240, (panneau.value?.clientWidth ?? 800) - 420)))
}

function memoriser(): void {
  try { localStorage.setItem(cleLargeur, String(largeur.value)) } catch { /* Stockage facultatif. */ }
}

function redimensionner(event: PointerEvent): void {
  const element = event.currentTarget as HTMLElement
  if (!element.hasPointerCapture(event.pointerId) || !panneau.value) return
  largeur.value = borner(event.clientX - panneau.value.getBoundingClientRect().left)
}

function terminer(event: PointerEvent): void {
  const element = event.currentTarget as HTMLElement
  if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
  memoriser()
}

function ajuster(event: KeyboardEvent): void {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  largeur.value = borner(event.key === 'Home'
    ? 240
    : event.key === 'End'
      ? Infinity
      : largeur.value + (event.key === 'ArrowLeft' ? -20 : 20))
  memoriser()
}

function dateAffichee(date: string | null, creation: string): string {
  const valeur = date ? `${date}T00:00:00` : creation
  const parsed = new Date(valeur)
  return Number.isNaN(parsed.getTime()) ? 'sans date' : parsed.toLocaleDateString('fr-FR')
}

function timecode(secondes: number | null): string {
  if (secondes === null) return ''
  const total = Math.max(0, Math.floor(secondes))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h, m, s].map((valeur) => String(valeur).padStart(2, '0')).join(':')
}

function libelleLien(lien: LienCommentaireNoteCorpus): string {
  const auteur = lien.auteur || 'sans auteur'
  const texte = lien.texte.length > 40 ? `${lien.texte.slice(0, 40)}…` : lien.texte
  return `${auteur} : ${texte || 'commentaire sans texte'}`
}

onMounted(() => {
  try {
    const valeur = Number(localStorage.getItem(cleLargeur))
    if (Number.isFinite(valeur) && valeur > 0) largeur.value = valeur
  } catch { /* Stockage facultatif. */ }
  observateur = new ResizeObserver(() => {
    const disponible = panneau.value?.clientWidth ?? 0
    if (!disponible) return
    verticale.value = disponible < 760
    if (!verticale.value) largeur.value = borner(largeur.value)
  })
  if (panneau.value) observateur.observe(panneau.value)
})

onBeforeUnmount(() => observateur?.disconnect())
</script>

<template>
  <section class="notes-corpus" aria-label="Notes du corpus" :aria-busy="chargement">
    <header class="entete-notes">
      <div>
        <h2>Notes</h2>
        <span>{{ notesFiltrees.length }} affichée{{ notesFiltrees.length === 1 ? '' : 's' }} sur {{ inventaire.notes.length }}</span>
      </div>
      <div class="actions-entete-notes">
        <div class="modes-notes" role="group" aria-label="Mode d’affichage des notes">
          <button
            type="button"
            :aria-pressed="modeAffichage === 'cartes'"
            @click="modeAffichage = 'cartes'"
          >🃏 Cartes</button>
          <button
            type="button"
            :aria-pressed="modeAffichage === 'feuille'"
            @click="modeAffichage = 'feuille'"
          >📄 Feuille</button>
          <button
            type="button"
            :aria-pressed="modeAffichage === 'tableau'"
            @click="modeAffichage = 'tableau'"
          >📊 Tableau</button>
        </div>
        <button
          type="button"
          :disabled="!charge || !notesFiltrees.length"
          aria-label="Exporter les notes filtrées en Markdown"
          @click="exporterMarkdown"
        >📤 Exporter</button>
        <button type="button" :aria-expanded="!replie" @click="replie = !replie">
          {{ replie ? 'Afficher les filtres' : 'Masquer les filtres' }}
        </button>
      </div>
    </header>

    <p v-if="erreur && charge" class="erreur alerte-projection" role="alert">
      {{ erreur }}<template v-if="erreurLecture"> Les notes affichées sont le dernier résultat lisible et peuvent ne plus être à jour.</template>
    </p>
    <details v-if="charge && inventaire.indisponibles.length" class="inventaire-incomplet">
      <summary>{{ resumeIndisponibles }}</summary>
      <ul>
        <li v-for="entretien in inventaire.indisponibles" :key="entretien.id">
          {{ entretien.titre }} : {{ entretien.raison }}
        </li>
      </ul>
    </details>

    <div
      ref="panneau"
      class="deux-colonnes-notes"
      :class="{ verticale, replie }"
      :style="{ '--largeur-notes': largeur + 'px' }"
    >
      <aside v-if="!replie" class="filtres-notes" aria-label="Filtres et tri des notes">
        <h3>Filtres</h3>
        <label>
          Recherche
          <input v-model="recherche" type="search" placeholder="Titre, corps, catégorie…" />
        </label>

        <fieldset v-if="categoriesNote.length">
          <legend>Catégories</legend>
          <label v-for="categorie in categoriesNote" :key="categorie.id" class="choix">
            <input v-model="categories" type="checkbox" :value="categorie.id" />
            <span class="pastille" :style="{ background: categorie.couleur }"></span>
            <span>{{ categorie.nom }}</span>
          </label>
        </fieldset>

        <fieldset v-if="entretiensDisponibles.length">
          <legend>Entretiens</legend>
          <div class="choix-defilants">
            <label v-for="entretien in entretiensDisponibles" :key="entretien.id" class="choix">
              <input v-model="entretiens" type="checkbox" :value="entretien.id" />
              <span>{{ entretien.titre }}</span>
            </label>
          </div>
        </fieldset>

        <label>
          Statut
          <select v-model="statut">
            <option value="tous">Tous</option>
            <option value="public">Public</option>
            <option value="prive">Privé</option>
          </select>
        </label>

        <div class="dates">
          <label>Du<input v-model="dateDebut" type="date" /></label>
          <label>Au<input v-model="dateFin" type="date" /></label>
        </div>

        <label class="choix"><input v-model="importants" type="checkbox" /> Passages importants</label>
        <label class="choix"><input v-model="avecLiens" type="checkbox" /> Liens vers des commentaires</label>
        <label>Mot-clé dans le corps<input v-model="motCle" type="search" /></label>

        <h3>Tri</h3>
        <label>
          Critère
          <select v-model="critereTri">
            <option value="entretienTitre">Entretien</option>
            <option value="categorie">Catégorie</option>
            <option value="statut">Statut</option>
            <option value="titre">Titre</option>
            <option value="creeLe">Date de création</option>
            <option value="date">Date de la note</option>
            <option value="modifieLe">Dernière modification</option>
          </select>
        </label>
        <label>
          Ordre
          <select v-model="ordreTri">
            <option value="asc">Croissant</option>
            <option value="desc">Décroissant</option>
          </select>
        </label>

        <h3>Filtres rapides</h3>
        <div class="raccourcis">
          <button type="button" @click="toutAfficher">Toutes les notes</button>
          <button type="button" @click="notesResume">Notes « résumé »</button>
          <button type="button" @click="notesChronologiques">Notes chronologiques</button>
          <button type="button" @click="notesParEntretien">Notes par entretien</button>
        </div>
      </aside>

      <div
        v-if="!verticale && !replie"
        class="separateur-notes"
        role="separator"
        aria-label="Largeur des filtres de notes"
        aria-orientation="vertical"
        tabindex="0"
        :aria-valuenow="largeur"
        :aria-valuemin="240"
        :aria-valuemax="borner(Infinity)"
        @pointerdown="($event.currentTarget as HTMLElement).setPointerCapture($event.pointerId)"
        @pointermove="redimensionner"
        @pointerup="terminer"
        @pointercancel="terminer"
        @keydown="ajuster"
      ></div>

      <section class="liste-notes" aria-label="Liste des notes" :data-mode="modeAffichage">
        <p v-if="chargement && !charge" class="etat-projection" role="status">Chargement…</p>
        <div v-else-if="erreurLecture && erreur && !charge" class="etat-projection">
          <p role="alert">{{ erreur }}</p>
          <button type="button" :disabled="chargement" @click="rafraichirNotes">Réessayer</button>
        </div>
        <p v-else-if="charge && !inventaire.notes.length" class="vide">Aucune note dans ce corpus.</p>
        <p v-else-if="charge && !notesFiltrees.length" class="vide">Aucune note ne correspond aux filtres.</p>

        <div v-if="notesFiltrees.length && modeAffichage === 'cartes'" class="cartes-notes">
          <article
            v-for="note in notesFiltrees"
            :key="`${note.entretienId}:${note.id}`"
            class="carte-note"
            :class="{ editable: !idDistantCourant }"
            @dblclick="doubleClic(note, $event)"
          >
            <header>
              <div class="titre-note">
                <span class="pastille" :style="{ background: couleurCategorieNote(note.categorieId) }"></span>
                <h3>{{ note.titre || '(sans titre)' }}</h3>
              </div>
              <div class="actions-note">
                <button
                  type="button"
                  class="editer-note"
                  :disabled="!!idDistantCourant || commandeEnCours"
                  :title="idDistantCourant ? 'Édition des notes distantes non disponible' : 'Modifier la note'"
                  :aria-label="`Modifier la note ${note.titre || 'sans titre'}`"
                  @click="ouvrirEdition(note)"
                >✎</button>
                <button
                  type="button"
                  class="supprimer-note"
                  :disabled="!!idDistantCourant || commandeEnCours"
                  :title="idDistantCourant ? 'Édition des notes distantes non disponible' : 'Supprimer la note'"
                  :aria-label="`Supprimer la note ${note.titre || 'sans titre'}`"
                  @click="confirmerSuppression(note)"
                >✕</button>
                <span class="statut" :class="note.statut">{{ note.statut === 'public' ? 'public' : 'privé' }}</span>
              </div>
            </header>
            <div class="metadonnees">
              <button type="button" class="entretien" @click="ouvrir(note)">{{ note.entretienTitre }}</button>
              <span>{{ nomCategorieNote(note.categorieId) }}</span>
              <span>{{ dateAffichee(note.date, note.creeLe) }}</span>
              <span v-if="badgeVerrou(note.entretienId)" class="verrou">
                🔒 {{ badgeVerrou(note.entretienId)?.userId }}
              </span>
            </div>
            <div class="corps-note" v-html="corpsAffiche(note)"></div>
            <div v-if="note.liensCommentaires.length" class="liens-commentaires">
              <strong>Liens :</strong>
              <button
                v-for="lien in note.liensCommentaires"
                :key="lien.commentaireId"
                type="button"
                @click="ouvrir(note)"
              >
                [{{ libelleLien(lien) }}]<span v-if="lien.timecodeSecondes !== null"> ({{ timecode(lien.timecodeSecondes) }})</span>
              </button>
            </div>
            <footer>
              <button type="button" @click="ouvrir(note)">Ouvrir dans l’entretien</button>
            </footer>
          </article>
        </div>

        <div v-else-if="notesFiltrees.length && modeAffichage === 'tableau'" class="conteneur-tableau-notes">
          <table class="tableau-notes">
            <thead>
              <tr>
                <th scope="col">Titre</th>
                <th scope="col">Catégorie</th>
                <th scope="col">Entretien</th>
                <th scope="col">Date</th>
                <th scope="col">Statut</th>
                <th scope="col"><span class="visuellement-cache">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="note in notesFiltrees"
                :key="`${note.entretienId}:${note.id}`"
                :class="{ editable: !idDistantCourant }"
                @dblclick="doubleClic(note, $event)"
              >
                <td :title="note.titre || '(sans titre)'">{{ note.titre || '(sans titre)' }}</td>
                <td :title="nomCategorieNote(note.categorieId)">
                  <span class="categorie-tableau">
                    <span class="pastille" :style="{ background: couleurCategorieNote(note.categorieId) }"></span>
                    {{ nomCategorieNote(note.categorieId) }}
                  </span>
                </td>
                <td>
                  <button type="button" class="entretien" @click="ouvrir(note)">{{ note.entretienTitre }}</button>
                  <span v-if="badgeVerrou(note.entretienId)" class="verrou" :title="`Verrouillé par ${badgeVerrou(note.entretienId)?.userId}`"> 🔒</span>
                </td>
                <td>{{ dateAffichee(note.date, note.creeLe) }}</td>
                <td><span class="statut" :class="note.statut">{{ note.statut === 'public' ? 'public' : 'privé' }}</span></td>
                <td>
                  <div class="actions-note actions-tableau">
                    <button
                      type="button"
                      class="editer-note"
                      :disabled="!!idDistantCourant || commandeEnCours"
                      :title="idDistantCourant ? 'Édition des notes distantes non disponible' : 'Modifier la note'"
                      :aria-label="`Modifier la note ${note.titre || 'sans titre'}`"
                      @click="ouvrirEdition(note)"
                    >✎</button>
                    <button
                      type="button"
                      class="supprimer-note"
                      :disabled="!!idDistantCourant || commandeEnCours"
                      :title="idDistantCourant ? 'Édition des notes distantes non disponible' : 'Supprimer la note'"
                      :aria-label="`Supprimer la note ${note.titre || 'sans titre'}`"
                      @click="confirmerSuppression(note)"
                    >✕</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else-if="notesFiltrees.length" class="feuille-notes">
          <article
            v-for="note in notesFiltrees"
            :key="`${note.entretienId}:${note.id}`"
            class="bloc-feuille-note"
            :class="{ editable: !idDistantCourant }"
            @dblclick="doubleClic(note, $event)"
          >
            <header>
              <div>
                <div class="titre-note">
                  <span class="pastille" :style="{ background: couleurCategorieNote(note.categorieId) }"></span>
                  <h3>{{ note.titre || '(sans titre)' }}</h3>
                </div>
                <div class="metadonnees">
                  <button type="button" class="entretien" @click="ouvrir(note)">{{ note.entretienTitre }}</button>
                  <span>{{ nomCategorieNote(note.categorieId) }}</span>
                  <span>{{ dateAffichee(note.date, note.creeLe) }}</span>
                  <span class="statut" :class="note.statut">{{ note.statut === 'public' ? 'public' : 'privé' }}</span>
                  <span v-if="badgeVerrou(note.entretienId)" class="verrou">
                    🔒 {{ badgeVerrou(note.entretienId)?.userId }}
                  </span>
                </div>
              </div>
              <div class="actions-note">
                <button
                  type="button"
                  class="editer-note"
                  :disabled="!!idDistantCourant || commandeEnCours"
                  :title="idDistantCourant ? 'Édition des notes distantes non disponible' : 'Modifier la note'"
                  :aria-label="`Modifier la note ${note.titre || 'sans titre'}`"
                  @click="ouvrirEdition(note)"
                >✎</button>
                <button
                  type="button"
                  class="supprimer-note"
                  :disabled="!!idDistantCourant || commandeEnCours"
                  :title="idDistantCourant ? 'Édition des notes distantes non disponible' : 'Supprimer la note'"
                  :aria-label="`Supprimer la note ${note.titre || 'sans titre'}`"
                  @click="confirmerSuppression(note)"
                >✕</button>
              </div>
            </header>
            <div class="corps-note corps-note-complet" v-html="corpsAffiche(note)"></div>
            <div v-if="note.liensCommentaires.length" class="liens-commentaires">
              <strong>Liens :</strong>
              <button
                v-for="lien in note.liensCommentaires"
                :key="lien.commentaireId"
                type="button"
                @click="ouvrir(note)"
              >
                [{{ libelleLien(lien) }}]<span v-if="lien.timecodeSecondes !== null"> ({{ timecode(lien.timecodeSecondes) }})</span>
              </button>
            </div>
            <footer>
              <button type="button" @click="ouvrir(note)">Ouvrir dans l’entretien</button>
            </footer>
          </article>
        </div>
      </section>
    </div>

    <ModaleNoteCorpus
      v-if="noteEditee"
      :note="noteEditee"
      :categories="categoriesNote"
      :occupe="commandeEnCours"
      @fermer="noteEditee = null"
      @valider="validerEdition"
    />
  </section>
</template>

<style scoped>
.notes-corpus { min-width: 0; padding: 16px; }
.entete-notes { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.entete-notes > div { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.entete-notes h2 { margin: 0; }
.entete-notes span { color: #52606d; font-size: 0.85rem; }
.actions-entete-notes { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.modes-notes { display: flex; }
.modes-notes button { border: 1px solid #b8c3cf; background: #fff; }
.modes-notes button + button { margin-left: -1px; }
.modes-notes button:first-child { border-radius: 5px 0 0 5px; }
.modes-notes button:last-child { border-radius: 0 5px 5px 0; }
.modes-notes button[aria-pressed="true"] { position: relative; color: #0d4f91; background: #e8f2fc; border-color: #4385c5; }
button { cursor: pointer; padding: 6px 10px; }
button:disabled { cursor: default; }
.deux-colonnes-notes { display: grid; grid-template-columns: var(--largeur-notes) 6px minmax(0, 1fr); gap: 12px; margin-top: 16px; }
.deux-colonnes-notes.verticale, .deux-colonnes-notes.replie { grid-template-columns: minmax(0, 1fr); }
.filtres-notes, .liste-notes { min-width: 0; }
.filtres-notes { max-height: 74vh; overflow: auto; padding: 12px; border: 1px solid #d4dce6; border-radius: 6px; }
.filtres-notes h3 { margin: 12px 0 6px; font-size: 0.95rem; }
.filtres-notes h3:first-child { margin-top: 0; }
.filtres-notes label:not(.choix) { display: flex; flex-direction: column; gap: 5px; margin: 9px 0; font-size: 0.82rem; }
input[type="search"], input[type="date"], select { box-sizing: border-box; width: 100%; padding: 7px; font: inherit; }
fieldset { margin: 10px 0; border: 1px solid #d4dce6; border-radius: 5px; }
legend { font-size: 0.82rem; }
.choix { display: flex; align-items: center; gap: 7px; margin: 6px 0; font-size: 0.82rem; }
.choix input { margin: 0; }
.choix-defilants { max-height: 130px; overflow: auto; }
.dates { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.raccourcis { display: flex; flex-wrap: wrap; gap: 6px; }
.raccourcis button { font-size: 0.76rem; }
.separateur-notes { background: #e8edf5; cursor: col-resize; touch-action: none; border-radius: 5px; }
.separateur-notes:focus-visible { outline: 2px solid #1565c0; }
.liste-notes { min-width: 0; }
.cartes-notes { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(330px, 100%), 1fr)); align-content: start; gap: 12px; }
.carte-note { display: flex; flex-direction: column; min-width: 0; border: 1px solid #d4dce6; border-radius: 8px; padding: 12px; background: #fff; }
.carte-note > header, .bloc-feuille-note > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.carte-note.editable, .bloc-feuille-note.editable, .tableau-notes tr.editable { cursor: default; }
.titre-note { display: flex; align-items: center; min-width: 0; gap: 8px; }
.titre-note h3 { overflow: hidden; margin: 0; font-size: 1rem; text-overflow: ellipsis; white-space: nowrap; }
.pastille { display: inline-block; width: 12px; height: 12px; flex: none; border: 1px solid #0002; border-radius: 50%; }
.actions-note { display: flex; align-items: center; gap: 6px; }
.editer-note, .supprimer-note { padding: 1px 5px; border: 1px solid #c5ced8; border-radius: 4px; background: #fff; color: #334155; }
.supprimer-note { color: #9b1c1c; }
.editer-note:disabled, .supprimer-note:disabled { cursor: default; opacity: 0.4; }
.statut { flex: none; padding: 2px 7px; border-radius: 999px; font-size: 0.7rem; }
.statut.public { color: #216e39; background: #dafbe1; }
.statut.prive { color: #704500; background: #fff1c2; }
.metadonnees { display: flex; align-items: center; flex-wrap: wrap; gap: 5px 10px; margin-top: 7px; color: #52606d; font-size: 0.76rem; }
.entretien { padding: 0; border: 0; background: transparent; color: #1565c0; font: inherit; font-weight: 600; }
.verrou { color: #6d4c00; }
.corps-note { max-height: 8.2em; overflow: hidden; margin: 12px 0; color: #303840; font-size: 0.88rem; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
.corps-note:empty::after { content: "Note vide"; color: #7b8794; font-style: italic; }
.corps-note :deep(mark) { background: #ffe792; font-weight: 600; }
.corps-note :deep(.ref-note-commentaire) { margin-left: 4px; color: #52606d; font-size: 0.78rem; }
.corps-note-complet { max-height: none; overflow: visible; }
.conteneur-tableau-notes { max-width: 100%; overflow: auto; border: 1px solid #d4dce6; border-radius: 7px; }
.tableau-notes { width: 100%; min-width: 680px; border-collapse: collapse; background: #fff; table-layout: fixed; }
.tableau-notes th, .tableau-notes td { overflow: hidden; padding: 9px 10px; border-bottom: 1px solid #e3e8ee; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.tableau-notes th { color: #52606d; background: #f5f7fa; font-size: 0.76rem; }
.tableau-notes tbody tr:last-child td { border-bottom: 0; }
.tableau-notes tbody tr:hover { background: #f8fbff; }
.tableau-notes th:nth-child(1) { width: 24%; }
.tableau-notes th:nth-child(2) { width: 18%; }
.tableau-notes th:nth-child(3) { width: 23%; }
.tableau-notes th:nth-child(4) { width: 13%; }
.tableau-notes th:nth-child(5) { width: 10%; }
.tableau-notes th:nth-child(6) { width: 72px; }
.categorie-tableau { display: flex; align-items: center; min-width: 0; gap: 6px; overflow: hidden; text-overflow: ellipsis; }
.actions-tableau { justify-content: flex-end; }
.visuellement-cache { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.feuille-notes { max-width: 900px; margin: 0 auto; border: 1px solid #d4dce6; border-radius: 7px; background: #fff; }
.bloc-feuille-note { padding: 20px 24px; border-bottom: 1px solid #cdd6e0; }
.bloc-feuille-note:last-child { border-bottom: 0; }
.bloc-feuille-note footer { display: flex; justify-content: flex-end; padding-top: 12px; }
.liens-commentaires { display: flex; align-items: baseline; flex-wrap: wrap; gap: 5px; padding-top: 8px; border-top: 1px dashed #d4dce6; color: #52606d; font-size: 0.76rem; }
.liens-commentaires button { padding: 0; border: 0; background: transparent; color: #1565c0; font: inherit; text-align: left; }
.carte-note footer { display: flex; justify-content: flex-end; margin-top: auto; padding-top: 10px; }
.erreur { color: #a82020; }
.alerte-projection { margin: 10px 0; padding: 8px 10px; border: 1px solid #e5b4b4; border-radius: 5px; background: #fff8f8; }
.etat-projection { padding: 24px 12px; color: #52606d; text-align: center; }
.etat-projection p { color: #a82020; }
.inventaire-incomplet { margin-top: 10px; padding: 8px 10px; border: 1px solid #e0c77a; border-radius: 5px; background: #fffaf0; color: #6d5700; font-size: 0.85rem; }
.inventaire-incomplet ul { margin-bottom: 0; padding-left: 22px; }
@media (max-width: 700px) {
  .notes-corpus { padding: 10px; }
  .entete-notes { align-items: flex-start; flex-direction: column; }
  .actions-entete-notes { justify-content: flex-start; }
  .filtres-notes { max-height: none; }
  .cartes-notes { grid-template-columns: minmax(0, 1fr); }
  .bloc-feuille-note { padding: 14px; }
}
</style>
