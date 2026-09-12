<script setup lang="ts">
import { ref } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import type { ItemRecueil } from '../../../shared/corpus/recueils'

const {
  listeRecueils,
  recueilOuvert,
  recueilOuvertId,
  projection,
  chargement,
  messageRecueil,
  etatSauvegardeRecueil,
  creerRecueil,
  ouvrirRecueil,
  resoudreRecueil,
  ajouterTitre,
  ajouterTexte,
  modifierItem,
  supprimerItem,
  deplacerItem,
  deplacerSection,
  supprimerSection,
  renommerRecueil,
  changerModeRecueil,
  supprimerRecueil,
  voirPassage,
  exporterRecueil,
  ajouterSelectionAuRecueil,
  ajoutPassageEnAttente,
  abandonnerAjoutPassage,
  lectureSeule,
  entretienEditable,
  vue,
} = utiliserSonal()

const nouveauNom = ref('')
const nouveauTitre = ref('')
const niveauTitre = ref<1 | 2 | 3 | 4>(1)
const nouveauTexte = ref('')
const exportIncomplet = ref(false)
const exportCommentaires = ref(true)
const exportSources = ref(true)
const avantSelection = ref<string>('')
const brouillons = ref<Record<string, string>>({})
const sauvegardesDifferees = new Map<string, ReturnType<typeof setTimeout>>()

async function tenter(action: () => Promise<unknown>) {
  try {
    await action()
  } catch {
    // Le composable conserve le message affichable.
  }
}

async function creer() {
  const nom = nouveauNom.value.trim()
  if (!nom) return
  await tenter(() => creerRecueil(nom))
  nouveauNom.value = ''
}

async function insererTitre() {
  const libelle = nouveauTitre.value.trim()
  if (!libelle) return
  await tenter(() => ajouterTitre(libelle, niveauTitre.value))
  nouveauTitre.value = ''
}

async function ajouterSelection() {
  if (!recueilOuvertId.value) return
  await tenter(() => ajouterSelectionAuRecueil(recueilOuvertId.value!, avantSelection.value || null))
}

async function supprimerTouteSection(id: string) {
  if (!window.confirm('Supprimer ce titre et tout le contenu de sa section ?')) return
  await tenter(() => supprimerSection(id))
}

async function insererTexte() {
  if (!nouveauTexte.value.trim()) return
  await tenter(() => ajouterTexte(nouveauTexte.value))
  nouveauTexte.value = ''
}

function itemPersistant(id: string): ItemRecueil | null {
  return recueilOuvert.value?.items.find((item) => item.id === id) ?? null
}

function cleBrouillon(item: ItemRecueil): string {
  return `${item.id}:${item.type}`
}

function valeurBrouillon(item: ItemRecueil): string {
  const cle = cleBrouillon(item)
  if (cle in brouillons.value) return brouillons.value[cle]
  if (item.type === 'titre') return item.libelle
  if (item.type === 'texte') return item.texte
  return item.commentaireEditorial
}

function saisir(item: ItemRecueil, event: Event) {
  const cle = cleBrouillon(item)
  brouillons.value[cle] = (event.target as HTMLInputElement | HTMLTextAreaElement).value
  clearTimeout(sauvegardesDifferees.get(cle))
  sauvegardesDifferees.set(cle, setTimeout(() => {
    if (item.type === 'titre') void changerTitre(item)
    else if (item.type === 'texte') void changerTexte(item)
    else void changerCommentaire(item)
  }, 700))
}

async function changerTitre(item: ItemRecueil) {
  if (item.type !== 'titre') return
  const cle = cleBrouillon(item)
  clearTimeout(sauvegardesDifferees.get(cle))
  sauvegardesDifferees.delete(cle)
  try {
    await modifierItem(item, { ...item, libelle: valeurBrouillon(item) })
    delete brouillons.value[cle]
  } catch {
    // Le brouillon reste visible pour permettre une reprise après conflit.
  }
}

async function changerTexte(item: ItemRecueil) {
  if (item.type !== 'texte') return
  const cle = cleBrouillon(item)
  clearTimeout(sauvegardesDifferees.get(cle))
  sauvegardesDifferees.delete(cle)
  try {
    await modifierItem(item, { ...item, texte: valeurBrouillon(item) })
    delete brouillons.value[cle]
  } catch {
    // Le brouillon reste visible pour permettre une reprise après conflit.
  }
}

async function changerCommentaire(item: ItemRecueil) {
  if (item.type !== 'passage') return
  const cle = cleBrouillon(item)
  clearTimeout(sauvegardesDifferees.get(cle))
  sauvegardesDifferees.delete(cle)
  try {
    await modifierItem(item, { ...item, commentaireEditorial: valeurBrouillon(item) })
    delete brouillons.value[cle]
  } catch {
    // Le brouillon reste visible pour permettre une reprise après conflit.
  }
}
</script>

<template>
  <section class="recueils-corpus">
    <aside class="liste-recueils">
      <div class="tete">
        <h2>Recueils</h2>
      </div>
      <form class="creation" @submit.prevent="creer">
        <input v-model="nouveauNom" :disabled="lectureSeule" placeholder="Nom du nouveau recueil" />
        <button :disabled="lectureSeule || !nouveauNom.trim()">Créer</button>
      </form>
      <p v-if="!listeRecueils.length" class="vide">Aucun recueil.</p>
      <button
        v-for="recueil in listeRecueils"
        :key="recueil.id"
        class="carte-recueil"
        :class="{ actif: recueilOuvertId === recueil.id }"
        @click="ouvrirRecueil(recueil.id)"
      >
        <b>{{ recueil.nom }}</b>
        <span>{{ recueil.items.length }} item(s)</span>
        <small>{{ new Date(recueil.modifieLe).toLocaleString() }}</small>
      </button>
    </aside>

    <main class="document-recueil">
      <p v-if="messageRecueil" class="erreur">{{ messageRecueil }}</p>
      <p v-if="!recueilOuvert" class="vide grande">Créez ou ouvrez un recueil.</p>
      <template v-else>
        <header class="barre-recueil">
          <span class="etat-enregistrement" :class="etatSauvegardeRecueil">{{ etatSauvegardeRecueil }}</span>
          <input
            class="nom-recueil"
            :value="recueilOuvert.nom"
            :disabled="lectureSeule"
            aria-label="Nom du recueil"
            @change="tenter(() => renommerRecueil(($event.target as HTMLInputElement).value))"
          />
          <select
            :value="recueilOuvert.modeTexte"
            :disabled="lectureSeule"
            aria-label="Mode du texte"
            @change="tenter(() => changerModeRecueil(($event.target as HTMLSelectElement).value as 'pseudonymise' | 'original'))"
          >
            <option value="pseudonymise">Pseudonymisé</option>
            <option value="original">Original</option>
          </select>
          <template v-if="vue === 'entretien'">
            <select v-model="avantSelection" aria-label="Emplacement du passage">
              <option value="">Fin du recueil</option>
              <option v-for="item in recueilOuvert.items" :key="item.id" :value="item.id">
                Avant {{ item.type === 'titre' ? item.libelle : item.type === 'texte' ? item.texte.slice(0, 25) : 'un passage' }}
              </option>
            </select>
            <button
              :disabled="!entretienEditable"
              title="Ajouter la sélection libre de la transcription"
              @click="ajouterSelection"
            >{{ ajoutPassageEnAttente ? 'Réessayer l’ajout' : '+ Sélection' }}</button>
            <button v-if="ajoutPassageEnAttente" title="Conserver seulement le repère inutilisé" @click="abandonnerAjoutPassage">Annuler l’ajout</button>
          </template>
          <button @click="resoudreRecueil()">{{ chargement ? '…' : '⟳ Actualiser' }}</button>
          <label class="incomplet"><input v-model="exportCommentaires" type="checkbox" /> Commentaires</label>
          <label class="incomplet"><input v-model="exportSources" type="checkbox" /> Sources</label>
          <label class="incomplet"><input v-model="exportIncomplet" type="checkbox" /> Export incomplet</label>
          <button @click="tenter(() => exporterRecueil('md', { incomplet: exportIncomplet, commentaires: exportCommentaires, sources: exportSources }))">Markdown</button>
          <button @click="tenter(() => exporterRecueil('txt', { incomplet: exportIncomplet, commentaires: exportCommentaires, sources: exportSources }))">Texte</button>
          <button class="danger" :disabled="lectureSeule" @click="tenter(supprimerRecueil)">Supprimer</button>
        </header>

        <p v-if="recueilOuvert.modeTexte === 'original'" class="avertissement">
          Le recueil affiche les transcriptions originales. Les textes éditoriaux et les titres peuvent aussi contenir des informations identifiantes.
        </p>
        <p v-else class="avertissement">
          Les passages et locuteurs sont pseudonymisés. Vérifiez séparément les titres, textes libres et commentaires éditoriaux.
        </p>

        <div v-if="!lectureSeule" class="ajouts">
          <div>
            <select v-model="niveauTitre">
              <option :value="1">Titre 1</option><option :value="2">Titre 2</option>
              <option :value="3">Titre 3</option><option :value="4">Titre 4</option>
            </select>
            <input v-model="nouveauTitre" placeholder="Titre à ajouter" @keyup.enter="insererTitre" />
            <button @click="insererTitre">Ajouter</button>
          </div>
          <div>
            <textarea v-model="nouveauTexte" rows="2" placeholder="Texte libre à ajouter"></textarea>
            <button @click="insererTexte">Ajouter le texte</button>
          </div>
        </div>

        <p v-if="chargement" class="vide">Résolution des sources…</p>
        <ol v-else class="items-recueil">
          <li v-for="(item, index) in projection?.items ?? []" :key="item.id" :class="`item-${item.type}`">
            <div class="actions-item">
              <button :disabled="lectureSeule || index === 0" title="Monter" @click="tenter(() => deplacerItem(item.id, -1))">↑</button>
              <button :disabled="lectureSeule || index === (projection?.items.length ?? 0) - 1" title="Descendre" @click="tenter(() => deplacerItem(item.id, 1))">↓</button>
              <template v-if="item.type === 'titre'">
                <button :disabled="lectureSeule" title="Monter la section" @click="tenter(() => deplacerSection(item.id, -1))">⇑</button>
                <button :disabled="lectureSeule" title="Descendre la section" @click="tenter(() => deplacerSection(item.id, 1))">⇓</button>
                <button :disabled="lectureSeule" title="Supprimer toute la section" @click="supprimerTouteSection(item.id)">✕§</button>
              </template>
              <button
                :disabled="lectureSeule"
                title="Retirer l’item"
                @click="itemPersistant(item.id) && tenter(() => supprimerItem(itemPersistant(item.id)!))"
              >✕</button>
            </div>

            <template v-if="item.type === 'titre'">
              <input
                :class="`titre niveau-${item.niveau}`"
                :value="itemPersistant(item.id) ? valeurBrouillon(itemPersistant(item.id)!) : item.libelle"
                :disabled="lectureSeule"
                @input="itemPersistant(item.id) && saisir(itemPersistant(item.id)!, $event)"
                @change="itemPersistant(item.id) && changerTitre(itemPersistant(item.id)!)"
              />
            </template>
            <textarea
              v-else-if="item.type === 'texte'"
              class="texte-libre"
              :value="itemPersistant(item.id) ? valeurBrouillon(itemPersistant(item.id)!) : item.texte"
              :disabled="lectureSeule"
              rows="3"
              @input="itemPersistant(item.id) && saisir(itemPersistant(item.id)!, $event)"
              @change="itemPersistant(item.id) && changerTexte(itemPersistant(item.id)!)"
            ></textarea>
            <article v-else class="passage" :class="{ casse: item.etat !== 'disponible' }">
              <div class="provenance">
                <b>{{ item.titreEntretien }}</b>
                <span v-if="item.locuteurs.length"> — {{ item.locuteurs.join(', ') }}</span>
                <button v-if="item.etat === 'disponible'" @click="voirPassage(item)">Voir dans l’entretien</button>
              </div>
              <blockquote v-if="item.etat === 'disponible'">{{ item.texte }}</blockquote>
              <p v-else class="diagnostic">⚠ {{ item.diagnostic }}</p>
              <label>
                Commentaire du recueil
                <textarea
                  :value="itemPersistant(item.id) ? valeurBrouillon(itemPersistant(item.id)!) : item.commentaireEditorial"
                  :disabled="lectureSeule"
                  rows="2"
                  @input="itemPersistant(item.id) && saisir(itemPersistant(item.id)!, $event)"
                  @change="itemPersistant(item.id) && changerCommentaire(itemPersistant(item.id)!)"
                ></textarea>
              </label>
            </article>
          </li>
        </ol>
      </template>
    </main>
  </section>
</template>

<style scoped>
.recueils-corpus { display: grid; grid-template-columns: 260px 1fr; gap: 1rem; min-height: 65vh; }
.liste-recueils, .document-recueil { border: 1px solid #ddd; border-radius: 8px; background: #fff; padding: .8rem; }
.tete h2 { margin: 0 0 .7rem; }
.creation { display: flex; gap: .3rem; margin-bottom: .7rem; }
.creation input { min-width: 0; flex: 1; }
.carte-recueil { width: 100%; display: flex; flex-direction: column; align-items: flex-start; margin: .3rem 0; padding: .5rem; border: 1px solid #ddd; border-radius: 6px; background: #fff; cursor: pointer; }
.carte-recueil.actif { border-color: #2e73d8; background: #f0f6ff; }
.carte-recueil span, .carte-recueil small { color: #777; }
.barre-recueil { display: flex; gap: .4rem; align-items: center; flex-wrap: wrap; }
.nom-recueil { flex: 1; min-width: 14rem; font-size: 1.15rem; font-weight: 700; }
.etat-enregistrement { font-size: .72rem; color: #2e7d32; }.etat-enregistrement.conflit { color: #b3261e; }
.incomplet { font-size: .75rem; color: #666; }
.avertissement { padding: .5rem; background: #fff8e1; border-left: 4px solid #e0a03a; font-size: .82rem; }
.ajouts { display: grid; grid-template-columns: 1fr 1fr; gap: .6rem; padding: .6rem; background: #f7f8fb; }
.ajouts > div { display: flex; gap: .3rem; }
.ajouts input, .ajouts textarea { flex: 1; min-width: 0; }
.items-recueil { list-style: none; padding: 0; }
.items-recueil > li { position: relative; border-top: 1px solid #eee; padding: .8rem 7rem .8rem .2rem; }
.actions-item { position: absolute; right: 0; top: .6rem; display: flex; gap: .2rem; }
.actions-item button { padding: .15rem .35rem; }
.titre, .texte-libre, .passage textarea { width: 100%; box-sizing: border-box; }
.titre { border: 1px solid transparent; font-weight: 700; }
.niveau-1 { font-size: 1.35rem; }.niveau-2 { font-size: 1.2rem; }.niveau-3 { font-size: 1.05rem; }.niveau-4 { font-size: .95rem; }
.texte-libre { border: 1px solid #ddd; border-radius: 5px; padding: .45rem; }
.passage { border-left: 4px solid #2e73d8; background: #fafdff; padding: .6rem; }
.passage.casse { border-color: #c62828; background: #fff5f5; }
.provenance { color: #555; font-size: .82rem; }
.provenance button { float: right; }
blockquote { margin: .5rem 0; white-space: pre-wrap; font-size: 1rem; }
.passage label { display: block; color: #666; font-size: .78rem; }
.passage textarea { display: block; margin-top: .2rem; }
.diagnostic, .erreur { color: #b3261e; }
.danger { color: #b00020; }.vide { color: #888; }.grande { text-align: center; margin-top: 5rem; }
button, input, select, textarea { font: inherit; }
button { cursor: pointer; }
button:disabled { cursor: default; opacity: .5; }
</style>
