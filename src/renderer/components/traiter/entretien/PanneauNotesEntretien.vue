<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch, type Directive } from 'vue'
import {
  ATTR_LIENS_NOTE,
  corpsAvecRefsCommentaires,
  corpsNoteEnTexte,
  decoreRefsCommentaires,
  echapperTexte,
  pruneRefsCommentaires,
  surlignerHtml,
} from '../../../notes/sanitiser'
import { utiliserSonal } from '../../../composables/sonal'
import MenuLiensNote from './MenuLiensNote.vue'
import icoNotes from '../../../assets/icones/notes.png'

defineProps<{ lectureSeule: boolean }>()

const {
  locuteurs,
  notes,
  brouillonNote,
  ajouterNote,
  editerNote,
  validerNote,
  annulerNote,
  avertissementNote,
  ecrireCorpsNote,
  ecrireTitreNote,
  enregistrerSyncZoneHorsModale,
  supprimerNote,
  reordonnerNotes,
  marquerPassage,
  menuLiensNote,
  commentairesPourLiaison,
  resolverCommentaires,
  lierPassage,
  ouvrirMenuLiensNote,
  fermerMenuLiensNote,
  lierCommentaireNote,
  delierCommentaireNote,
  allerAuCommentaire,
  categoriesNote,
  nomCategorieNote,
  couleurCategorieNote,
  ajouterCategorieNote,
  majCouleurCategorieNote,
} = utiliserSonal()
const vueNotes = ref<'cartes' | 'texte'>('cartes')
const zoneCorpsNote = ref<HTMLElement | null>(null)
const creationCategorie = ref<{ nom: string; couleur: string } | null>(null)
watch(
  () => brouillonNote.value?.categorieId,
  () => {
    avertissementNote.value = ''
  },
)
watch(
  () => brouillonNote.value?.id ?? 'new',
  () => {
    nextTick(() => {
      if (zoneCorpsNote.value && brouillonNote.value) {
        zoneCorpsNote.value.innerHTML = brouillonNote.value.corps || ''
        decoreRefsCommentaires(zoneCorpsNote.value, document, resolverCommentaires)
      }
    })
  },
)
function onSaisieCorpsNote() {
  if (brouillonNote.value && zoneCorpsNote.value) {
    pruneRefsCommentaires(zoneCorpsNote.value)
    brouillonNote.value.corps = zoneCorpsNote.value.innerHTML
  }
}
function marquerDansModale() {
  if (!zoneCorpsNote.value) return
  marquerPassage(zoneCorpsNote.value)
  if (brouillonNote.value) brouillonNote.value.corps = zoneCorpsNote.value.innerHTML
}
function onContextmenuCorpsNote(e: MouseEvent) {
  if (zoneCorpsNote.value) ouvrirMenuLiensNote(e, zoneCorpsNote.value)
}
function corpsAvecRefs(n: { corps: string }): string {
  return corpsAvecRefsCommentaires(corpsOuVide(n), document, resolverCommentaires)
}
function clicRefCommentaire(e: MouseEvent) {
  const ref = (e.target as HTMLElement | null)?.closest('[data-ref]')
  if (ref) allerAuCommentaire(ref.getAttribute('data-ref')!)
}
function ouvrirCreationCategorie() {
  creationCategorie.value = { nom: '', couleur: '#ffb74d' }
}
async function validerCreationCategorie() {
  const c = creationCategorie.value
  if (!c || !c.nom.trim()) return
  const id = await ajouterCategorieNote(c.nom, c.couleur)
  if (brouillonNote.value) brouillonNote.value.categorieId = id
  creationCategorie.value = null
}
const notesTriees = computed(() => notes.value.slice().sort((a, b) => a.rang - b.rang))
function nomsLocuteursNote(note: { locuteurIds?: string[] }): string[] {
  const ids = new Set(note.locuteurIds ?? [])
  return locuteurs.value.filter((locuteur) => locuteur.id && ids.has(locuteur.id)).map((locuteur) => locuteur.nom)
}
const libelleLocuteursNote = (note: { locuteurIds?: string[] }) => nomsLocuteursNote(note).join(', ')
const voletRechercheNotes = ref(false)
const filtreNotes = ref('')
const filtreCategorie = ref('')
const filtreStatut = ref<'' | 'prive' | 'public'>('')
const filtrePassage = ref<'' | 'mark' | 'lien'>('')
const rechercheActive = computed(
  () =>
    !!(
      filtreNotes.value.trim() ||
      filtreCategorie.value ||
      filtreStatut.value ||
      filtrePassage.value
    ),
)
function basculerRechercheNotes() {
  voletRechercheNotes.value = !voletRechercheNotes.value
  if (!voletRechercheNotes.value) reinitialiserRechercheNotes()
}
function reinitialiserRechercheNotes() {
  filtreNotes.value = ''
  filtreCategorie.value = ''
  filtreStatut.value = ''
  filtrePassage.value = ''
}
const notesAffichees = computed(() => {
  const q = filtreNotes.value.trim().toLowerCase()
  return notesTriees.value.filter((n) => {
    if (filtreCategorie.value && n.categorieId !== filtreCategorie.value) return false
    if (filtreStatut.value && n.statut !== filtreStatut.value) return false
    if (filtrePassage.value === 'mark' && !n.corps.includes('<mark')) return false
    if (filtrePassage.value === 'lien' && !n.corps.includes(ATTR_LIENS_NOTE)) return false
    if (!q) return true
    return [n.titre, nomCategorieNote(n.categorieId), libelleLocuteursNote(n), corpsNoteEnTexte(n.corps)].some((t) =>
      t.toLowerCase().includes(q),
    )
  })
})
const notesCopiees = ref(false)
let minuteurCopie: ReturnType<typeof setTimeout> | null = null
async function copierNotes() {
  const texte = notesAffichees.value
    .map((n) => {
      const titre = n.titre ? `${n.titre}\n` : ''
      const concerne = libelleLocuteursNote(n)
      return `[${nomCategorieNote(n.categorieId)} · ${dateLibelle(n.date)} · ${n.statut === 'public' ? 'public' : 'privé'}${concerne ? ` · concerne : ${concerne}` : ''}]\n${titre}${corpsNoteEnTexte(n.corps)}`
    })
    .join('\n\n')
  try {
    await navigator.clipboard.writeText(texte)
    notesCopiees.value = true
    if (minuteurCopie) clearTimeout(minuteurCopie)
    minuteurCopie = setTimeout(() => {
      notesCopiees.value = false
    }, 1500)
  } catch {
  }
}
const titreAvecHits = (titre: string) => surlignerHtml(echapperTexte(titre), filtreNotes.value, document)
function corpsAvecRefsEtHits(n: { corps: string }): string {
  return surlignerHtml(corpsAvecRefs(n), filtreNotes.value, document)
}
const dateLibelle = (d: string | null) =>
  d ? new Date(d + 'T00:00').toLocaleDateString('fr-FR') : 'sans date'
const corpsOuVide = (n: { corps: string }) => n.corps || '<span class="vide">(note vide)</span>'
const editionFeuille = computed(() => vueNotes.value === 'texte')
const feuilleEl = ref<HTMLElement | null>(null)
const blocsFeuille = new Map<string, HTMLElement>()
const blocActifId = ref<string | null>(null)
function decorerBlocFeuille(id: string, zone: HTMLElement) {
  const n = notes.value.find((x) => x.id === id)
  if (!n) return
  zone.innerHTML = surlignerHtml(
    corpsAvecRefsCommentaires(n.corps, document, resolverCommentaires),
    filtreNotes.value,
    document,
  )
}
const vDecoreBloc: Directive<HTMLElement, string> = {
  mounted: (el, binding) => decorerBlocFeuille(binding.value, el),
}
function peuplerFeuille() {
  const racine = feuilleEl.value
  if (!racine) return
  for (const zone of Array.from(racine.querySelectorAll<HTMLElement>('.corps-notes-texte'))) {
    const id = zone.getAttribute('data-note-id')
    if (id) decorerBlocFeuille(id, zone)
  }
}
watch(filtreNotes, () => {
  if (vueNotes.value === 'texte') nextTick(peuplerFeuille)
})
function onSaisieBlocFeuille(id: string) {
  const zone = blocsFeuille.get(id)
  if (!zone) return
  pruneRefsCommentaires(zone)
  ecrireCorpsNote(id, zone.innerHTML)
}
enregistrerSyncZoneHorsModale((zone) => {
  for (const [id, el] of blocsFeuille) {
    if (el === zone) {
      onSaisieBlocFeuille(id)
      return
    }
  }
})
onBeforeUnmount(() => enregistrerSyncZoneHorsModale(null))

function blocActif(): HTMLElement | null {
  const el = blocActifId.value ? blocsFeuille.get(blocActifId.value) : null
  return el && el.isConnected ? el : null
}
function onFocusBloc(id: string, e: FocusEvent) {
  blocActifId.value = id
  blocsFeuille.set(id, e.currentTarget as HTMLElement)
}
function blocDeSelection(): HTMLElement | null {
  const sel = document.getSelection()
  const noeud = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).commonAncestorContainer : null
  const el = noeud?.nodeType === 3 ? noeud.parentElement : (noeud as HTMLElement | null)
  return (el?.closest('.corps-notes-texte') as HTMLElement | null) ?? null
}
function blocCible(): { zone: HTMLElement; id: string } | null {
  const zone = blocDeSelection() ?? blocActif()
  const id = zone?.getAttribute('data-note-id') ?? null
  return zone && id ? { zone, id } : null
}
function marquerDansFeuille() {
  const cible = blocCible()
  if (!cible) return
  marquerPassage(cible.zone)
  onSaisieBlocFeuille(cible.id)
}
function lierDansFeuille(e: MouseEvent) {
  const cible = blocCible()
  if (cible) lierPassage(e, cible.zone)
}
function onContextmenuBlocFeuille(e: MouseEvent) {
  ouvrirMenuLiensNote(e, e.currentTarget as HTMLElement)
}
let idNoteGlissee: string | null = null
function onDragStartNote(id: string) {
  idNoteGlissee = id
}
function onDropNote(cibleId: string) {
  if (!idNoteGlissee || idNoteGlissee === cibleId) return
  const ordre = notesTriees.value.map((n) => n.id)
  const from = ordre.indexOf(idNoteGlissee)
  const to = ordre.indexOf(cibleId)
  if (from < 0 || to < 0) return
  ordre.splice(to, 0, ordre.splice(from, 1)[0])
  reordonnerNotes(ordre)
  idNoteGlissee = null
}
</script>

<template>
  <aside class="panneau notes">
    <div class="corpus-tete">
      <h3 data-onglet="notes" data-tour="onglet-notes"><img class="icone-entete-panneau" :src="icoNotes" alt="" />Notes</h3>
      <div class="notes-outils">
        <button class="mini"
          :class="{ actif: vueNotes === 'cartes' }"
          title="Vue cartes"
          @click="vueNotes = 'cartes'">🃏</button>
        <button class="mini"
          :class="{ actif: vueNotes === 'texte' }"
          title="Vue feuille (toutes les notes à la suite, éditables)"
          @click="vueNotes = 'texte'">📄</button>
        <button class="mini"
          :class="{ actif: voletRechercheNotes }"
          title="Rechercher et filtrer les notes"
          @click="basculerRechercheNotes">🔍</button>
        <button class="mini" :disabled="notes.length === 0"
          :title="notesCopiees ? 'Copié !' : 'Copier les notes affichées dans le presse-papier'"
          @click="copierNotes">{{ notesCopiees ? '✓' : '📋' }}</button>
      </div>
      <button v-if="!lectureSeule" class="mini" data-tour="creer-note" @click="ajouterNote">+ Note</button>
    </div>

    <div v-if="voletRechercheNotes" class="volet-recherche-notes">
      <div class="ligne-recherche">
        <input v-model="filtreNotes" placeholder="Rechercher dans les notes…" />
        <span class="compte-notes" title="Notes affichées / total">{{ notesAffichees.length }}/{{ notes.length }}</span>
        <button class="mini" title="Effacer la recherche et les filtres"
          @click="reinitialiserRechercheNotes">✕</button>
      </div>
      <div class="ligne-recherche">
        <select v-model="filtreCategorie" class="filtre-categorie" title="Filtrer par catégorie">
          <option value="">Toutes catégories</option>
          <option v-for="c in categoriesNote" :key="c.id" :value="c.id">{{ c.nom }}</option>
        </select>
        <select v-model="filtreStatut" class="filtre-statut" title="Filtrer par statut">
          <option value="">Tous statuts</option>
          <option value="prive">privé</option>
          <option value="public">public</option>
        </select>
        <select v-model="filtrePassage" class="filtre-passage" title="Filtrer par passage">
          <option value="">Tous passages</option>
          <option value="mark">avec passage important</option>
          <option value="lien">lié à un commentaire</option>
        </select>
      </div>
    </div>

    <div v-if="vueNotes === 'cartes'" class="notes-cartes">
      <p v-if="notesAffichees.length === 0" class="vide">
        {{ rechercheActive ? 'Aucune note ne correspond.' : 'Aucune note — « + Note » pour en créer une.' }}
      </p>
      <article v-for="n in notesAffichees" :key="n.id" class="carte-note"
        :draggable="!lectureSeule"
        @dragstart="onDragStartNote(n.id)"
        @dragover.prevent
        @drop="onDropNote(n.id)"
      >
        <header class="carte-note-tete">
          <span class="pastille-cat" :style="{ background: couleurCategorieNote(n.categorieId) }"></span>
          <span class="nom-cat" :style="{ color: couleurCategorieNote(n.categorieId) }">{{ nomCategorieNote(n.categorieId) }}</span>
          <span class="date-cat">{{ dateLibelle(n.date) }}</span>
          <span class="statut-cat" :class="n.statut">{{ n.statut === 'public' ? 'public' : 'privé' }}</span>
          <span v-if="!lectureSeule" class="carte-note-actions">
            <button class="mini" title="Éditer" @click="editerNote(n.id)">✎</button>
            <button class="mini danger" title="Supprimer" @click="supprimerNote(n.id)">✕</button>
          </span>
        </header>
        <div v-if="nomsLocuteursNote(n).length" class="cibles-note">Concerne : {{ libelleLocuteursNote(n) }}</div>
        <div v-if="n.titre" class="titre-note" v-html="titreAvecHits(n.titre)"></div>
        <div v-else class="corps-note apercu-note" v-html="corpsAvecRefsEtHits(n)" @click="clicRefCommentaire"></div>
      </article>
    </div>

    <div v-else ref="feuilleEl" class="notes-texte">
      <p v-if="notesAffichees.length === 0" class="vide">
        {{ rechercheActive ? 'Aucune note ne correspond.' : '(aucune note)' }}
      </p>
      <div v-if="!lectureSeule && notesAffichees.length > 0" class="barre-outils-note">
        <button class="mini" title="Mettre en gras le passage sélectionné (passage important, toggle)"
          @click="marquerDansFeuille">✏ Marquer comme important</button>
        <button class="mini" title="Lier le passage sélectionné à un commentaire (italique)"
          @click="lierDansFeuille($event)">🔗 Lier à un commentaire</button>
      </div>
      <article v-for="n in notesAffichees" :key="n.id" class="bloc-notes-texte">
        <span class="tete-notes-texte">[<span class="cat-notes-texte" :style="{ color: couleurCategorieNote(n.categorieId) }">{{ nomCategorieNote(n.categorieId) }}</span><span class="meta-notes-texte"> · {{ dateLibelle(n.date) }} · {{ n.statut === 'public' ? 'public' : 'privé' }}<template v-if="nomsLocuteursNote(n).length"> · concerne : {{ libelleLocuteursNote(n) }}</template></span>]</span>
        <input v-if="editionFeuille && !lectureSeule" class="titre-feuille" :value="n.titre"
          placeholder="(sans titre)"
          @change="ecrireTitreNote(n.id, ($event.target as HTMLInputElement).value)"
        />
        <span v-else-if="n.titre" class="titre-note" v-html="titreAvecHits(n.titre)"></span>
        <div class="corps-notes-texte"
          v-decore-bloc="n.id"
          :data-note-id="n.id"
          :contenteditable="editionFeuille && !lectureSeule ? 'true' : 'false'"
          data-placeholder="Votre note… (sélectionnez un passage puis ✏ pour le marquer)"
          @focusin="onFocusBloc(n.id, $event)"
          @input="onSaisieBlocFeuille(n.id)"
          @contextmenu="onContextmenuBlocFeuille"
          @click="clicRefCommentaire"
        ></div>
      </article>
    </div>

    <Teleport to="body">
      <div v-if="brouillonNote" class="modale-note">
        <div class="modale-note-fond" @click="annulerNote"></div>
        <div class="modale-note-fenetre">
          <div class="corpus-tete">
            <h3>{{ brouillonNote.id ? 'Éditer la note' : 'Nouvelle note' }}</h3>
            <button class="mini" title="Fermer" @click="annulerNote">✕</button>
          </div>
          <div class="modale-note-corps">
            <label class="champ-note champ-titre-note">
              <span>Titre (optionnel)</span>
              <input type="text" v-model="brouillonNote.titre" placeholder="ex. hypothèse centrale" />
            </label>
            <div
              ref="zoneCorpsNote"
              class="zone-corps-note"
              contenteditable="true"
              data-placeholder="Votre note… (sélectionnez un passage puis ✏ pour le marquer)"
              @input="onSaisieCorpsNote"
              @contextmenu="onContextmenuCorpsNote"
              @click="clicRefCommentaire"
            ></div>
            <div class="barre-outils-note">
              <button class="mini" title="Mettre en gras le passage sélectionné (passage important, toggle)"
                @click="marquerDansModale">✏ Marquer comme important</button>
              <button class="mini" title="Lier le passage sélectionné à un commentaire (italique)"
                @click="zoneCorpsNote && lierPassage($event, zoneCorpsNote)">🔗 Lier à un commentaire</button>
            </div>
            <p v-if="avertissementNote" class="msg-avert">{{ avertissementNote }}</p>
            <fieldset class="cibles-note-form">
              <legend>Concerne (optionnel)</legend>
              <p>Associez cette note aux locuteurs concernés pour la retrouver dans Personnes.</p>
              <div v-if="locuteurs.some((locuteur) => locuteur.id)" class="choix-cibles-note">
                <label v-for="locuteur in locuteurs.filter((item) => item.id)" :key="locuteur.id">
                  <input v-model="brouillonNote.locuteurIds" type="checkbox" :value="locuteur.id" />
                  <span>{{ locuteur.nom || 'Locuteur sans nom' }}</span>
                </label>
              </div>
              <p v-else>Aucun locuteur n’est disponible dans cet entretien.</p>
            </fieldset>
            <div class="modale-note-meta">
              <label class="champ-note">
                <span>Catégorie</span>
                <select v-model="brouillonNote.categorieId">
                  <option v-for="c in categoriesNote" :key="c.id" :value="c.id">{{ c.nom }}</option>
                  <option value=" autre">autre…</option>
                </select>
                <input v-if="brouillonNote.categorieId !== ' autre'" type="color"
                  class="carre-couleur"
                  :value="couleurCategorieNote(brouillonNote.categorieId)"
                  :title="`Couleur de la catégorie « ${nomCategorieNote(brouillonNote.categorieId)} »`"
                  @change="majCouleurCategorieNote(brouillonNote.categorieId, ($event.target as HTMLInputElement).value)"
                />
                <button v-else type="button" class="carre-couleur carre-creation"
                  title="Nouvelle catégorie (nom + couleur)"
                  @click="ouvrirCreationCategorie">＋</button>
              </label>
              <label class="champ-note">
                <span>Date</span>
                <input type="date" v-model="brouillonNote.date" />
                <button v-if="brouillonNote.date" class="mini" title="Pas de date" @click="brouillonNote.date = null">✕</button>
              </label>
              <label class="champ-note">
                <span>Statut</span>
                <select v-model="brouillonNote.statut">
                  <option value="prive">privé</option>
                  <option value="public">public</option>
                </select>
              </label>
            </div>
          </div>
          <div class="modale-note-pied">
            <button class="principal" @click="validerNote">Valider</button>
            <button @click="annulerNote">Annuler</button>
          </div>
        </div>

        <div v-if="creationCategorie" class="sous-modale-categorie">
          <div class="sous-modale-fond" @click="creationCategorie = null"></div>
          <div class="sous-modale-fenetre">
            <h4>Nouvelle catégorie</h4>
            <label class="champ-note">
              <span>Nom</span>
              <input v-model="creationCategorie.nom" placeholder="ex. synthèse" @keyup.enter="validerCreationCategorie" />
            </label>
            <label class="champ-note">
              <span>Couleur</span>
              <input type="color" v-model="creationCategorie.couleur" />
            </label>
            <div class="modale-note-pied">
              <button class="principal" :disabled="!creationCategorie.nom.trim()" title="Donnez un nom à la catégorie"
                @click="validerCreationCategorie">Créer</button>
              <button @click="creationCategorie = null">Annuler</button>
            </div>
          </div>
        </div>
      </div>
      <MenuLiensNote
          v-if="menuLiensNote"
          :x="menuLiensNote.x"
          :y="menuLiensNote.y"
          :commentaires="commentairesPourLiaison"
          :liens="menuLiensNote.liens"
          @lier="lierCommentaireNote"
          @delier="delierCommentaireNote"
          @fermer="fermerMenuLiensNote"
        />    </Teleport>
  </aside>
</template>

<style scoped>
.carre-couleur {
  width: 1rem;
  height: 1rem;
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  padding: 0;
  cursor: pointer;
  align-self: center;
  background: transparent;
}
.carre-couleur::-webkit-color-swatch-wrapper {
  padding: 0;
}
.carre-couleur::-webkit-color-swatch {
  border: none;
  border-radius: 3px;
}
.carre-couleur:hover {
  transform: scale(1.15);
}

.notes-outils {
  display: flex;
  gap: 0.25rem;
  margin-left: auto;
}
.notes-outils .mini.actif {
  background: #e8eefc;
  border-color: #6485d6;
}
.notes-outils .mini {
  font-size: 0.95rem;
  padding: 0.1rem 0.35rem;
}
.notes-outils .mini:nth-child(1) { margin-left: -0.3rem; }
.notes-outils .mini:nth-child(2) { margin-right: 0.35rem; }
.carre-creation {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #ffb74d;
  color: #fff;
  font-size: 0.8rem;
  line-height: 1;
}
.carre-creation:hover { filter: brightness(0.95); }

.notes-cartes {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.carte-note {
  border: 1px solid #e2e2e2;
  border-radius: 8px;
  padding: 0.5rem 0.6rem;
  background: #fbfbfd;
  cursor: grab;
}
.carte-note:active { cursor: grabbing; }
.carte-note-tete {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  color: #555;
  margin-bottom: 0.3rem;
  flex-wrap: wrap;
}
.pastille-cat {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}
.nom-cat { font-weight: 600; color: #222; }
.date-cat { color: #777; }
.statut-cat {
  font-size: 0.68rem;
  padding: 0.05rem 0.35rem;
  border-radius: 10px;
  border: 1px solid #d0d0d0;
}
.statut-cat.prive { background: #f3f3f3; color: #777; }
.statut-cat.public { background: #e8f5e9; color: #2e7d32; border-color: #a5d6a7; }
.carte-note-actions { margin-left: auto; display: flex; gap: 0.2rem; }
.cibles-note {
  margin-bottom: 0.35rem;
  color: #52606d;
  font-size: 0.78rem;
}
.corps-note {
  font-size: 0.85rem;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
}
.titre-note {
  font-size: 0.9rem;
  font-weight: 600;
  word-break: break-word;
}
.apercu-note {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
  overflow: hidden;
}
.champ-titre-note input {
  flex: 1;
}
.corps-note :deep(mark),
.zone-corps-note :deep(mark),
.corps-notes-texte :deep(mark) {
  background: none;
  font-weight: bold;
  padding: 0;
}
.corps-note :deep(em),
.zone-corps-note :deep(em),
.corps-notes-texte :deep(em) {
  font-style: italic;
}
.corps-note :deep(.ref-note-commentaire),
.zone-corps-note :deep(.ref-note-commentaire),
.corps-notes-texte :deep(.ref-note-commentaire) {
  color: #1565c0;
  font-size: 0.75rem;
  cursor: pointer;
}
.corps-note :deep(.ref-note-commentaire:hover),
.zone-corps-note :deep(.ref-note-commentaire:hover),
.corps-notes-texte :deep(.ref-note-commentaire:hover) {
  text-decoration: underline;
}

.volet-recherche-notes {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin: 0 0 0.5rem;
}
.ligne-recherche {
  display: flex;
  align-items: center;
  gap: 0.3rem;
    flex-wrap: wrap;
}
.ligne-recherche input {
  flex: 1;
  min-width: 0;
  padding: 0.25rem 0.45rem;
  border: 1px solid #d4d4d4;
  border-radius: 6px;
  font-size: 0.8rem;
}
.ligne-recherche select {
  min-width: 0;
  padding: 0.25rem 0.3rem;
  border: 1px solid #d4d4d4;
  border-radius: 6px;
  font-size: 0.78rem;
}
.ligne-recherche .filtre-categorie { flex: 2 1 10rem; }
.ligne-recherche .filtre-passage { flex: 1.4 1 9rem; }
.ligne-recherche .filtre-statut { flex: 1 1 6rem; }
.compte-notes {
  font-size: 0.75rem;
  color: #777;
  white-space: nowrap;
}
:deep(.surbrillance-note) {
  background: #fff3a6;
  border-radius: 2px;
}

.notes-texte {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.bloc-notes-texte {
  border-radius: 6px;
  padding: 0.3rem 0.4rem;
}
.tete-notes-texte {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: #777;
}
.meta-notes-texte {
  color: #777;
  font-weight: 400;
}
.corps-notes-texte {
  display: block;
  font-size: 0.83rem;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.45;
  color: #333;
}
.corps-notes-texte[contenteditable='true'] {
  outline: none;
}
.corps-notes-texte[contenteditable='true']:focus {
  background: #f7f8fc;
  box-shadow: inset 0 -1px 0 #6485d6;
}
.corps-notes-texte:empty::before {
  content: attr(data-placeholder);
  color: #aaa;
}
.titre-feuille {
  display: block;
  width: 100%;
  border: none;
  padding: 0.05rem 0;
  font-size: 0.9rem;
  font-weight: 600;
  background: none;
  outline: none;
}

.modale-note {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
}
.modale-note-fond {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
}
.modale-note-fenetre {
  position: relative;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
  width: min(560px, 92vw);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
}
.modale-note-corps {
  padding: 0.7rem 1rem;
  overflow-y: auto;
}
.zone-corps-note {
  min-height: 7rem;
  border: 1px solid #d4d4d4;
  border-radius: 8px;
  padding: 0.5rem 0.6rem;
  font-size: 0.88rem;
  line-height: 1.45;
  outline: none;
}
.zone-corps-note:focus { border-color: #6485d6; }
.zone-corps-note:empty::before {
  content: attr(data-placeholder);
  color: #aaa;
}
.barre-outils-note {
  display: flex;
  gap: 0.3rem;
  margin: 0.4rem 0;
}
.notes-texte .barre-outils-note {
  position: sticky;
  top: 0;
  z-index: 5;
  background: #fff;
  margin: 0;
  padding: 0.3rem 0;
  border-bottom: 1px solid #ececf2;
}
.modale-note-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
  margin-top: 0.3rem;
}
.cibles-note-form {
  margin-top: 0.75rem;
  padding: 0.65rem 0.8rem;
  border: 1px solid #c8d0da;
  border-radius: 5px;
}
.cibles-note-form p { margin: 0.25rem 0 0.5rem; color: #52606d; }
.choix-cibles-note { display: flex; flex-wrap: wrap; gap: 0.45rem 1rem; }
.choix-cibles-note label { display: inline-flex; align-items: center; gap: 0.3rem; }
.msg-avert {
  margin: 0.4rem 0 0;
  font-size: 0.78rem;
  color: #b3261e;
}
.champ-note {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  color: #555;
}
.champ-note span { min-width: 3.5rem; }
.champ-note select,
.champ-note input[type='date'],
.champ-note input[type='text'] {
  padding: 0.2rem 0.35rem;
  border: 1px solid #d4d4d4;
  border-radius: 6px;
  font-size: 0.8rem;
}
.modale-note-pied {
  display: flex;
  justify-content: flex-end;
  gap: 0.4rem;
  padding: 0.6rem 1rem;
  border-top: 1px solid #eee;
}
.modale-note-pied .principal {
  background: #6485d6;
  color: #fff;
  border-color: #6485d6;
}

.sous-modale-categorie {
  position: absolute;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
}
.sous-modale-fond {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 12px;
}
.sous-modale-fenetre {
  position: relative;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  padding: 0.8rem 1rem;
  width: min(340px, 88vw);
}
.sous-modale-fenetre h4 { margin: 0 0 0.5rem; }
.sous-modale-fenetre .champ-note { margin-bottom: 0.4rem; }
</style>
