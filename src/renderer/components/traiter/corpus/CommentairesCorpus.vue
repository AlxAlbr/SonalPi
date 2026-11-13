<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRef } from 'vue'
import BarreOngletCorpus from './BarreOngletCorpus.vue'
import { vHauteurDisponible } from '../../../directives/hauteurDisponible'
import { useCommentairesCorpus } from '../../../composables/corpus/useCommentairesCorpus'

/** Tous les commentaires des entretiens du corpus, sur le modèle de l'onglet Notes. */
const props = defineProps<{ actif: boolean }>()
const {
  auteurs,
  auteursDisponibles,
  badgeVerrou,
  charge,
  chargement,
  commentaires,
  commentairesFiltres,
  critereTri,
  entretiens,
  entretiensDisponibles,
  erreur,
  exporterMarkdown,
  indisponibles,
  modeAffichage,
  ordreTri,
  ouvrir,
  parAuteur,
  parEntretien,
  passagesSupprimes,
  rafraichir,
  recherche,
  toutAfficher,
} = useCommentairesCorpus(toRef(props, 'actif'))

const nombreFiltres = computed(() =>
  Number(!!recherche.value.trim()) + entretiens.value.length + auteurs.value.length + Number(passagesSupprimes.value))
const nombreFiltresDetailles = computed(() => nombreFiltres.value - Number(!!recherche.value.trim()))
const libelleCritereTri = computed(() => ({ entretien: 'Entretien', auteur: 'Auteur', texte: 'Texte du commentaire' })[critereTri.value])
const libelleSensTri = computed(() => (ordreTri.value === 'asc' ? 'A → Z' : 'Z → A'))
const resumeIndisponibles = computed(() => {
  const n = indisponibles.value.length
  return n === 1 ? 'Un entretien n’a pas pu être lu.' : `${n} entretiens n’ont pas pu être lus.`
})

// Largeur du panneau des filtres : réglable et mémorisée, comme dans l'onglet Notes.
const panneau = ref<HTMLElement | null>(null)
const largeur = ref(300)
const verticale = ref(false)
const replie = ref(false)
const cleLargeur = 'sonalpi.commentairesCorpus.largeurGauche'
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
  <section class="commentaires-corpus" aria-label="Commentaires du corpus" :aria-busy="chargement">
    <BarreOngletCorpus titre="Commentaires">
      <template #aide>
        Les commentaires de tous les entretiens, à filtrer, trier et exporter.
        {{ commentairesFiltres.length }} affiché{{ commentairesFiltres.length === 1 ? '' : 's' }} sur {{ commentaires.length }}.
      </template>
      <div class="modes-notes" role="group" aria-label="Mode d’affichage des commentaires">
        <button
          type="button"
          :aria-pressed="modeAffichage === 'tableau'"
          @click="modeAffichage = 'tableau'"
        >📊 Tableau</button>
        <button
          type="button"
          :aria-pressed="modeAffichage === 'feuille'"
          @click="modeAffichage = 'feuille'"
        >📄 Feuille</button>
      </div>
      <button
        type="button"
        :disabled="!charge || !commentairesFiltres.length"
        aria-label="Exporter les commentaires filtrés en Markdown"
        @click="exporterMarkdown"
      >📤 Exporter</button>
      <button type="button" :aria-expanded="!replie" @click="replie = !replie">
        {{ replie ? 'Afficher les filtres' : 'Masquer les filtres' }}
      </button>
    </BarreOngletCorpus>

    <p v-if="erreur && charge" class="erreur alerte-projection" role="alert">{{ erreur }}</p>
    <details v-if="charge && indisponibles.length" class="inventaire-incomplet">
      <summary>{{ resumeIndisponibles }}</summary>
      <ul>
        <li v-for="entretien in indisponibles" :key="entretien.id">{{ entretien.titre }}</li>
      </ul>
    </details>

    <div
      ref="panneau"
      class="deux-colonnes-notes"
      :class="{ verticale, replie }"
      :style="{ '--largeur-notes': largeur + 'px' }"
    >
      <aside v-if="!replie" v-hauteur-disponible class="panneau filtres-notes" aria-label="Filtres et tri des commentaires">
        <div class="corpus-tete"><h2 class="titre-panneau">Filtres</h2></div>
        <section class="section-notes" aria-labelledby="titre-acces-commentaires">
          <h3 id="titre-acces-commentaires">Accès rapides</h3>
          <div class="raccourcis" role="group" aria-label="Accès rapides aux commentaires">
            <button type="button" :aria-pressed="nombreFiltres === 0" @click="toutAfficher">Tous les commentaires</button>
            <button
              type="button"
              :aria-pressed="nombreFiltres === 1 && passagesSupprimes"
              @click="toutAfficher(); passagesSupprimes = true"
            >Passages supprimés</button>
          </div>
        </section>
        <label class="recherche-notes">
          Rechercher dans les commentaires
          <input v-model="recherche" type="search" placeholder="Texte, auteur, passage, entretien…" />
        </label>

        <section class="section-notes" aria-labelledby="titre-ordre-commentaires">
          <h3 id="titre-ordre-commentaires">Ordre d’affichage</h3>
          <div class="raccourcis" role="group" aria-label="Ordre des commentaires">
            <button type="button" :aria-pressed="critereTri === 'entretien' && ordreTri === 'asc'" @click="parEntretien">Par entretien</button>
            <button type="button" :aria-pressed="critereTri === 'auteur' && ordreTri === 'asc'" @click="parAuteur">Par auteur</button>
          </div>
          <p class="aide-notes">{{ libelleCritereTri }} · {{ libelleSensTri }}.</p>
          <details class="autre-tri">
            <summary>Autre ordre…</summary>
            <label>
              <span id="commentaires-critere-tri">Trier par</span>
              <select v-model="critereTri" aria-labelledby="commentaires-critere-tri">
                <option value="entretien">Entretien</option>
                <option value="auteur">Auteur</option>
                <option value="texte">Texte du commentaire</option>
              </select>
            </label>
            <label>
              <span id="commentaires-sens-tri">Sens</span>
              <select v-model="ordreTri" aria-labelledby="commentaires-sens-tri">
                <option value="asc">A → Z</option>
                <option value="desc">Z → A</option>
              </select>
            </label>
          </details>
        </section>

        <details class="filtres-detailles section-notes">
          <summary>Filtres détaillés<span v-if="nombreFiltresDetailles"> ({{ nombreFiltresDetailles }})</span></summary>
          <fieldset v-if="auteursDisponibles.length">
            <legend>Auteurs</legend>
            <div class="choix-defilants">
              <label v-for="auteur in auteursDisponibles" :key="auteur" class="choix">
                <input v-model="auteurs" type="checkbox" :value="auteur" />
                <span>{{ auteur || 'Sans auteur' }}</span>
              </label>
            </div>
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
          <label class="choix"><input v-model="passagesSupprimes" type="checkbox" /> Passage supprimé du texte</label>
        </details>
      </aside>

      <div
        v-if="!verticale && !replie"
        class="separateur-notes"
        role="separator"
        aria-label="Largeur des filtres de commentaires"
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

      <section class="liste-notes" aria-label="Liste des commentaires" :data-mode="modeAffichage">
        <p v-if="chargement && !charge" class="etat-projection" role="status">Chargement…</p>
        <div v-else-if="erreur && !charge" class="etat-projection">
          <p role="alert">{{ erreur }}</p>
          <button type="button" :disabled="chargement" @click="rafraichir">Réessayer</button>
        </div>
        <p v-else-if="charge && !commentaires.length" class="vide">Aucun commentaire dans ce corpus.</p>
        <p v-else-if="charge && !commentairesFiltres.length" class="vide">Aucun commentaire ne correspond aux filtres.</p>

        <div v-if="commentairesFiltres.length && modeAffichage === 'tableau'" class="conteneur-tableau-notes">
          <table class="tableau-notes">
            <thead>
              <tr>
                <th scope="col">Commentaire</th>
                <th scope="col">Auteur</th>
                <th scope="col">Entretien</th>
                <th scope="col">Passage commenté</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="c in commentairesFiltres"
                :key="`${c.entretienId}:${c.id}`"
                class="ligne-commentaire"
                title="Double-cliquez pour retrouver ce commentaire dans l’entretien"
                @dblclick="ouvrir(c)"
              >
                <td :title="c.texte">{{ c.texte }}</td>
                <td :title="c.auteur || 'Sans auteur'">{{ c.auteur || 'Sans auteur' }}</td>
                <td>
                  <button type="button" class="entretien" @click="ouvrir(c)">{{ c.entretienTitre }}</button>
                  <span v-if="badgeVerrou(c.entretienId)" class="verrou" :title="`Verrouillé par ${badgeVerrou(c.entretienId)?.userId}`"> 🔒</span>
                </td>
                <td :title="c.passage" :class="{ 'passage-absent': !c.passage }">
                  {{ c.passage ? `« ${c.passage} »` : 'Passage supprimé' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else-if="commentairesFiltres.length" class="feuille-notes">
          <article
            v-for="c in commentairesFiltres"
            :key="`${c.entretienId}:${c.id}`"
            class="bloc-feuille-note bloc-commentaire"
          >
            <header>
              <div>
                <div class="titre-note"><h3>{{ c.auteur || 'Sans auteur' }}</h3></div>
                <div class="metadonnees">
                  <button type="button" class="entretien" @click="ouvrir(c)">{{ c.entretienTitre }}</button>
                  <span v-if="badgeVerrou(c.entretienId)" class="verrou">
                    🔒 {{ badgeVerrou(c.entretienId)?.userId }}
                  </span>
                </div>
              </div>
            </header>
            <div class="corps-note corps-note-complet">{{ c.texte }}</div>
            <blockquote v-if="c.passage" class="passage-commente">« {{ c.passage }} »</blockquote>
            <p v-else class="passage-commente passage-absent">Le passage commenté a été supprimé du texte.</p>
            <footer>
              <button type="button" @click="ouvrir(c)">Ouvrir dans l’entretien</button>
            </footer>
          </article>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
/* Mêmes repères visuels que l'onglet Notes. */
.commentaires-corpus { min-width: 0; }
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
.filtres-notes { position: sticky; top: calc(var(--entete-h) + 0.5rem); align-self: start; box-sizing: border-box; max-height: var(--hauteur-disponible, 74vh); overflow: auto; }
.deux-colonnes-notes.verticale .filtres-notes { position: static; max-height: none; }
.section-notes { margin-top: 14px; padding-top: 12px; border-top: 1px solid #e5e5ef; }
.filtres-notes .section-notes > :not(h3):not(summary) { margin-inline-start: .75rem; }
.filtres-notes h3, .filtres-detailles > summary { margin: 0 0 8px; font-size: 0.82rem; font-weight: 600; color: #44506a; }
.filtres-notes summary { cursor: pointer; }
.autre-tri { font-size: 0.78rem; }
.aide-notes { margin: 8px 0; font-size: 0.76rem; color: #626b7d; line-height: 1.4; }
.filtres-notes label:not(.choix) { display: flex; flex-direction: column; gap: 5px; margin: 9px 0; font-size: 0.82rem; }
.filtres-notes > label.recherche-notes { margin-inline-start: .75rem; }
input[type="search"], select { box-sizing: border-box; width: 100%; padding: 7px; font: inherit; }
fieldset { margin: 10px 0; border: 1px solid #d4dce6; border-radius: 5px; }
legend { font-size: 0.82rem; }
.choix { display: flex; align-items: center; gap: 7px; margin: 6px 0; font-size: 0.82rem; }
.choix input { margin: 0; }
.choix-defilants { max-height: 130px; overflow: auto; }
.raccourcis { display: flex; flex-wrap: wrap; gap: 6px; }
.raccourcis button { border: 1px solid #d5d5df; border-radius: 5px; background: #fff; color: #44506a; font: inherit; font-size: 0.78rem; text-align: left; }
.raccourcis button[aria-pressed="true"] { background: #e8eaf5; border-color: #8994ba; color: #263b68; }
.raccourcis button:focus-visible { outline: 2px solid #596b9f; outline-offset: 2px; }
.separateur-notes { background: #e8edf5; cursor: col-resize; touch-action: none; border-radius: 5px; }
.separateur-notes:focus-visible { outline: 2px solid #1565c0; }
.bloc-feuille-note > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.titre-note { display: flex; align-items: center; min-width: 0; gap: 8px; }
.titre-note h3 { overflow: hidden; margin: 0; font-size: 1rem; text-overflow: ellipsis; white-space: nowrap; }
.metadonnees { display: flex; align-items: center; flex-wrap: wrap; gap: 5px 10px; margin-top: 7px; color: #52606d; font-size: 0.76rem; }
.entretien { padding: 0; border: 0; background: transparent; color: #1565c0; font: inherit; font-weight: 600; }
.verrou { color: #6d4c00; }
.corps-note { margin: 12px 0; color: #303840; font-size: 0.88rem; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
.passage-commente { margin: 0; padding: 6px 10px; border-left: 3px solid #b8c9df; background: #f7f9fc; color: #52606d; font-size: 0.8rem; font-style: italic; overflow-wrap: anywhere; }
.passage-absent { color: #b06e0f; font-style: italic; }
.conteneur-tableau-notes { max-width: 100%; overflow: auto; border: 1px solid #d4dce6; border-radius: 7px; }
.tableau-notes { width: 100%; min-width: 680px; border-collapse: collapse; background: #fff; table-layout: fixed; }
.tableau-notes th, .tableau-notes td { overflow: hidden; padding: 9px 10px; border-bottom: 1px solid #e3e8ee; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.tableau-notes th { color: #52606d; background: #f5f7fa; font-size: 0.76rem; }
.tableau-notes tbody tr:last-child td { border-bottom: 0; }
.tableau-notes tbody tr:hover { background: #f8fbff; }
.tableau-notes th:nth-child(1) { width: 34%; }
.tableau-notes th:nth-child(2) { width: 14%; }
.tableau-notes th:nth-child(3) { width: 18%; }
.feuille-notes { max-width: 900px; margin: 0 auto; border: 1px solid #d4dce6; border-radius: 7px; background: #fff; }
.bloc-feuille-note { padding: 20px 24px; border-bottom: 1px solid #cdd6e0; }
.bloc-feuille-note:last-child { border-bottom: 0; }
.bloc-feuille-note footer { display: flex; justify-content: flex-end; padding-top: 12px; }
.erreur { color: #a82020; }
.alerte-projection { margin: 10px 0; padding: 8px 10px; border: 1px solid #e5b4b4; border-radius: 5px; background: #fff8f8; }
.etat-projection { padding: 24px 12px; color: #52606d; text-align: center; }
.etat-projection p { color: #a82020; }
.inventaire-incomplet { margin-top: 10px; padding: 8px 10px; border: 1px solid #e0c77a; border-radius: 5px; background: #fffaf0; color: #6d5700; font-size: 0.85rem; }
.inventaire-incomplet ul { margin-bottom: 0; padding-left: 22px; }
@media (max-width: 700px) {
  .commentaires-corpus { padding: 10px; }
  .filtres-notes { position: static; max-height: none; }
  .bloc-feuille-note { padding: 14px; }
}
</style>
