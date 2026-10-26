<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import type { ItemRecueil } from '../../../../shared/corpus/recueils'
import {
  numeroterTitres,
  profondeursItems,
  type StyleNumerotation,
} from '../../../../shared/corpus/numerotation'

const {
  listeRecueils, enregistrerContextePanneau,
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
  lectureSeule,
} = utiliserSonal()

const nouveauNom = ref('')
const nouveauTitre = ref('')
const niveauTitre = ref<1 | 2 | 3 | 4>(1)
const nouveauTexte = ref('')
const exportCommentaires = ref(true)
const exportSources = ref(true)
const styleNumerotation = ref<StyleNumerotation>('decimal')
onBeforeUnmount(enregistrerContextePanneau('organiser-recueils', () => {
  const etat = { numerotation: styleNumerotation.value, commentaires: exportCommentaires.value, sources: exportSources.value }
  return () => { styleNumerotation.value = etat.numerotation; exportCommentaires.value = etat.commentaires; exportSources.value = etat.sources }
}))
const modaleIncomplet = ref<null | {
  resoudre: (ok: boolean) => void
  nombre: number
  exemples: string[]
}>(null)
const numeros = computed(() => numeroterTitres(projection.value?.items ?? [], styleNumerotation.value))
const profondeurs = computed(() => profondeursItems(projection.value?.items ?? []))
function retrait(id: string): string {
  return `padding-left: ${(profondeurs.value[id] ?? 0) * 2}rem`
}
const brouillons = ref<Record<string, string>>({})
const sauvegardesDifferees = new Map<string, ReturnType<typeof setTimeout>>()
onBeforeUnmount(() => sauvegardesDifferees.forEach(clearTimeout))

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

function demanderExport(format: 'md' | 'txt') {
  void tenter(() => exporterRecueil(format, {
    commentaires: exportCommentaires.value,
    sources: exportSources.value,
    numerotation: styleNumerotation.value,
  }, (infos) => new Promise((resoudre) => {
    modaleIncomplet.value = { resoudre, nombre: infos.nombre, exemples: infos.exemples }
  })))
}

function fermerModaleIncomplet(ok: boolean) {
  modaleIncomplet.value?.resoudre(ok)
  modaleIncomplet.value = null
}

async function confirmerSuppressionRecueil() {
  if (!recueilOuvert.value) return
  const nom = recueilOuvert.value.nom
  if (!window.confirm(`Êtes-vous bien sûr de vouloir supprimer le recueil « ${nom} » ?`)) return
  await tenter(supprimerRecueil)
}

async function supprimerTouteSection(id: string) {
  if (!window.confirm('Supprimer ce titre et tout le contenu de sa section ?')) return
  await tenter(() => supprimerSection(id))
}

function changerNiveau(item: ItemRecueil, niveauTexte: string) {
  if (item.type !== 'titre') return
  const persistant = itemPersistant(item.id)
  if (!persistant || persistant.type !== 'titre') return
  const niveau = Number(niveauTexte) as 1 | 2 | 3 | 4
  if (niveau === persistant.niveau) return
  void tenter(() => modifierItem(persistant, { ...persistant, niveau }))
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
          <select v-model="styleNumerotation" aria-label="Numérotation des titres">
            <option value="decimal">1.2.3</option>
            <option value="plan">I. A. 1. a.</option>
            <option value="aucune">Sans numérotation</option>
          </select>
          <button @click="resoudreRecueil()">{{ chargement ? '…' : '⟳ Actualiser' }}</button>
          <button class="danger" :disabled="lectureSeule" @click="confirmerSuppressionRecueil">Supprimer</button>
        </header>
        <div class="barre-export">
          <span class="libelle-export">Exporter</span>
          <label class="incomplet"><input v-model="exportCommentaires" type="checkbox" /> Commentaires</label>
          <label class="incomplet"><input v-model="exportSources" type="checkbox" /> Sources</label>
          <button @click="demanderExport('md')">Markdown</button>
          <button @click="demanderExport('txt')">Texte</button>
        </div>

        <p v-if="recueilOuvert.modeTexte === 'original'" class="avertissement">
          Le recueil affiche les transcriptions originales. Les textes éditoriaux et les titres peuvent aussi contenir des informations identifiantes.
        </p>
        <p v-else class="avertissement">
          Les passages et locuteurs sont pseudonymisés. Cela concerne les verbatims où une pseudonymisation a été produite. Vérifiez séparément les titres, textes libres et commentaires éditoriaux.
        </p>

        <div v-if="!lectureSeule" class="ajouts">
          <div class="carte-ajout carte-titre">
            <h3>Titre</h3>
            <div class="saisie-ajout">
              <select v-model="niveauTitre" aria-label="Niveau du titre">
                <option :value="1">Titre 1</option><option :value="2">Titre 2</option>
                <option :value="3">Titre 3</option><option :value="4">Titre 4</option>
              </select>
              <input v-model="nouveauTitre" placeholder="Libellé du titre" @keyup.enter="insererTitre" />
            </div>
            <button class="bouton-ajout" @click="insererTitre">＋ Ajouter le titre</button>
          </div>
          <div class="carte-ajout carte-texte">
            <h3>Texte libre</h3>
            <div class="saisie-ajout">
              <textarea v-model="nouveauTexte" rows="2" placeholder="Texte libre à ajouter"></textarea>
            </div>
            <button class="bouton-ajout" @click="insererTexte">＋ Ajouter le texte</button>
          </div>
          <div class="carte-ajout carte-passage carte-passage-info">
            <h3>Passage du recueil</h3>
            <p class="note-ajout">
              Pour ajouter un verbatim, allez dans un entretien, sélectionnez le passage voulu,
              clic droit puis « Ajouter au recueil… ».
            </p>
          </div>
        </div>

        <h3 v-if="recueilOuvert" class="titre-document">Recueil « {{ recueilOuvert.nom }} »</h3>

        <p v-if="chargement" class="vide">Résolution des sources…</p>
        <ol v-else class="items-recueil">
          <li
            v-for="(item, index) in projection?.items ?? []"
            :key="item.id"
            :class="`item-${item.type}`"
            :data-recueil-item="item.id"
            tabindex="-1"
          >
            <div class="actions-item">
              <button :disabled="lectureSeule || index === 0" title="Monter" @click="tenter(() => deplacerItem(item.id, -1))">↑</button>
              <button :disabled="lectureSeule || index === (projection?.items.length ?? 0) - 1" title="Descendre" @click="tenter(() => deplacerItem(item.id, 1))">↓</button>
              <template v-if="item.type === 'titre'">
                <select
                  class="niveau-item"
                  :value="item.niveau"
                  :disabled="lectureSeule"
                  title="Niveau hiérarchique du titre"
                  @change="changerNiveau(item, ($event.target as HTMLSelectElement).value)"
                >
                  <option :value="1">1</option><option :value="2">2</option>
                  <option :value="3">3</option><option :value="4">4</option>
                </select>
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

            <div class="corps-item" :style="retrait(item.id)">
              <template v-if="item.type === 'titre'">
                <span v-if="numeros[item.id]" class="numero">{{ numeros[item.id] }}</span>
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
            </div>
          </li>
        </ol>
      </template>
    </main>
    <Teleport to="body">
      <div v-if="modaleIncomplet" class="fond-incomplet" role="dialog" aria-modal="true" aria-label="Export incomplet">
        <section class="modale-incomplet">
          <h3>Passages indisponibles</h3>
          <p>
            {{ modaleIncomplet.nombre }} passage(s) de ce recueil ne peuvent pas être lus
            (source indisponible ou passage introuvable). Sans autorisation, l'export est bloqué.
          </p>
          <ul v-if="modaleIncomplet.exemples.length" class="exemples">
            <li v-for="(exemple, index) in modaleIncomplet.exemples" :key="index">⚠ {{ exemple }}</li>
          </ul>
          <p>Si vous autorisez cet export, chaque passage concerné y sera remplacé par un signal explicite, jamais omis silencieusement.</p>
          <footer>
            <button @click="fermerModaleIncomplet(false)">Annuler</button>
            <button class="confirmer" @click="fermerModaleIncomplet(true)">Autoriser cet export incomplet</button>
          </footer>
        </section>
      </div>
    </Teleport>
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
.barre-export { display: flex; gap: .6rem; align-items: center; flex-wrap: wrap; margin-top: .5rem; padding: .4rem .6rem; background: #f7f8fb; border-radius: 6px; }
.libelle-export { font-size: .8rem; font-weight: 700; color: #555; }
.nom-recueil { flex: 1; min-width: 14rem; font-size: 1.15rem; font-weight: 700; }
.etat-enregistrement { font-size: .72rem; color: #2e7d32; }.etat-enregistrement.conflit { color: #b3261e; }
.incomplet { font-size: .75rem; color: #666; }
.avertissement { padding: .5rem; background: #fff8e1; border-left: 4px solid #e0a03a; font-size: .82rem; }
.ajouts { display: grid; grid-template-columns: 1fr 1fr; gap: .8rem; padding: .6rem; background: #f7f8fb; border-radius: 8px; }
.carte-ajout { background: #fff; border: 1px solid #e2e5ea; border-radius: 8px; padding: .7rem .8rem; display: flex; flex-direction: column; gap: .5rem; }
.carte-titre { background: linear-gradient(135deg, #f0f5fd, #fdfefe); border-color: #c9d8ef; border-left: 4px solid #2e73d8; }
.carte-titre h3 { color: #2e73d8; }
.carte-texte { background: linear-gradient(135deg, #fdfaf0, #fffefb); border-color: #e7dcc0; border-left: 4px solid #c9a83f; }
.carte-texte h3 { color: #a5842a; }
.carte-passage { grid-column: 1 / -1; background: linear-gradient(135deg, #effaf3, #fdfffd); border-color: #cbe6d4; border-left: 4px solid #2e8b57; }
.carte-passage h3 { color: #2e8b57; }
.note-ajout { margin: 0; font-size: .75rem; color: #5c7a68; }
.carte-passage-info { border-left-style: dashed; }
.titre-document { margin: 1rem 0 .2rem; padding-bottom: .35rem; border-bottom: 2px solid #d8dee9; font-size: 1.1rem; color: #2c3e5d; }
.carte-ajout h3 { margin: 0; font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; color: #67718a; }
.saisie-ajout { display: flex; gap: .3rem; }
.saisie-ajout input, .saisie-ajout textarea { flex: 1; min-width: 0; }
.bouton-ajout { align-self: flex-start; font-weight: 600; }
.items-recueil { list-style: none; padding: 0; }
.items-recueil > li { position: relative; border-top: 1px solid #eee; padding: .8rem 7rem .8rem 3.7rem; }
.items-recueil > li:focus { outline: 3px solid #2e73d8; outline-offset: 2px; }
.corps-item { display: block; }
.numero { position: absolute; left: .2rem; top: .95rem; width: 3rem; text-align: right; font-weight: 700; color: #2e73d8; font-variant-numeric: tabular-nums; }
.corps-item > input, .corps-item > textarea, .corps-item > article { width: 100%; box-sizing: border-box; }
.actions-item { position: absolute; right: 0; top: .6rem; display: flex; gap: .2rem; }
.actions-item button { padding: .15rem .35rem; }
.niveau-item { width: auto; padding: 0 .1rem; font-size: .78rem; color: #2e73d8; font-weight: 700; }
.titre, .texte-libre, .passage textarea { width: 100%; box-sizing: border-box; }
.titre { border: 1px solid transparent; border-left-width: 4px; border-radius: 6px; padding: .35rem .6rem; font-weight: 700; }
.titre:focus { background: #fff; }
.niveau-1 { font-size: 1.35rem; background: #e7eefa; border-left-color: #2e73d8; color: #1e4fa0; }
.niveau-2 { font-size: 1.2rem; background: #edf2fb; border-left-color: #6f92cf; color: #2c5aa8; }
.niveau-3 { font-size: 1.05rem; background: #f3f6fc; border-left-color: #a3b9dd; color: #3a557f; }
.niveau-4 { font-size: .95rem; background: #f8fafd; border-left-color: #c6d2e4; color: #4a5f7d; }
.texte-libre { border: 1px solid #e2e5ea; border-left: 3px solid #d9c98a; border-radius: 6px; padding: .5rem .6rem; background: #fffdf6; }
.texte-libre:focus { background: #fff; }
.passage { border-left: 4px solid #2e8b57; background: #f5fbf7; padding: .6rem; max-width: 56rem; margin-inline: auto; box-sizing: border-box; }
.passage.casse { border-color: #c62828; background: #fff5f5; }
.provenance { color: #555; font-size: .82rem; }
.provenance button { float: right; }
blockquote { margin: .5rem 0; white-space: pre-wrap; font-size: 1rem; }
.passage label { display: block; color: #666; font-size: .78rem; }
.passage textarea { display: block; margin-top: .2rem; }
.diagnostic, .erreur { color: #b3261e; }
.danger { color: #b00020; }.vide { color: #888; }.grande { text-align: center; margin-top: 5rem; }
.fond-incomplet { position: fixed; inset: 0; z-index: 950; background: rgba(0, 0, 0, .45); display: flex; align-items: center; justify-content: center; }
.modale-incomplet { width: min(32rem, 90vw); background: #fff; border-radius: 8px; padding: 1rem 1.2rem; box-shadow: 0 8px 35px rgba(0, 0, 0, .3); }
.modale-incomplet h3 { margin: 0 0 .6rem; font-size: 1.05rem; }
.modale-incomplet p { font-size: .88rem; }
.exemples { margin: .4rem 0; padding-left: 1rem; font-size: .8rem; color: #b3261e; }
.modale-incomplet footer { display: flex; justify-content: flex-end; gap: .4rem; margin-top: .8rem; }
.confirmer { color: #b00020; font-weight: 700; }
button, input, select, textarea { font: inherit; }
button { cursor: pointer; }
button:disabled { cursor: default; opacity: .5; }
</style>
