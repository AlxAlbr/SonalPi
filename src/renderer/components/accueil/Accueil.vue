<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import NouveauCorpus from './NouveauCorpus.vue'
import NouveauCorpusDistant from './NouveauCorpusDistant.vue'
import ListeRecents from './ListeRecents.vue'
import { utiliserSonal } from '../../composables/sonal'
import type { EntreeRecent } from '../../../shared/format'

const {
  recents,
  choisirFichier,
  ouvertureEnCours,
  ouvrirAuthentification,
  ouvrirRecent,
  retirerRecent,
  ouvrirCatalogueParcours,
  ouvrirExemples,
  modaleNouveauCorpus,
} = utiliserSonal()

const recentsPersonnels = computed(() => recents.value.filter((r) => r.type !== 'local' || !r.exemple))
const recentsExemples = computed(() => recents.value.filter((r) => r.type === 'local' && r.exemple))
// Sans aucun récent, l'accueil devient une page de bienvenue.
const premierLancement = computed(() => recents.value.length === 0)

// Un onglet vide n'est jamais affiché : on bascule sur l'autre.
type Onglet = 'travail' | 'exemples'
const ongletChoisi = ref<Onglet>('travail')
const onglet = computed<Onglet>(() => {
  if (ongletChoisi.value === 'travail' && recentsPersonnels.value.length === 0) return 'exemples'
  if (ongletChoisi.value === 'exemples' && recentsExemples.value.length === 0) return 'travail'
  return ongletChoisi.value
})
const avecOnglets = computed(() => recentsPersonnels.value.length > 0 && recentsExemples.value.length > 0)
const boutonsOnglets = ref<Record<Onglet, HTMLButtonElement | null>>({ travail: null, exemples: null })
async function changerOnglet(suivant: Onglet, focaliser = false): Promise<void> {
  ongletChoisi.value = suivant
  if (!focaliser) return
  await nextTick()
  boutonsOnglets.value[suivant]?.focus()
}

// La recherche n'apparaît que lorsque la liste devient longue.
const recherche = ref('')
const avecRecherche = computed(() => recents.value.length > 5)
const recentsAffiches = computed(() => {
  const liste = onglet.value === 'travail' ? recentsPersonnels.value : recentsExemples.value
  const texte = recherche.value.trim().toLowerCase()
  if (!texte) return liste
  return liste.filter((r) => [r.nom, r.type === 'distant' ? r.url : r.dir].some((v) => v.toLowerCase().includes(texte)))
})

const modaleNouveau = modaleNouveauCorpus
const modaleNouveauDistant = ref(false)
const ouvrirDocumentation = (entree: 'guide' | 'faq') => window.sonal.application.ouvrirDocumentation(entree)

/** Demande le secret dans la modale lorsqu'un récent ne peut pas rouvrir seul. */
async function ouvrirRecentEntree(entree: EntreeRecent): Promise<void> {
  if (entree.type === 'distant') {
    try {
      if (entree.fournisseur === 'gitlab') {
        const destination = (await window.sonal.gitlab.lister())
          .find((candidate) => candidate.id === entree.id)
        if (destination && !destination.connexionDisponible) {
          void ouvrirAuthentification('gitlab')
          return
        }
      } else {
        const compte = (await window.sonal.webdav.lister())
          .find((candidate) => candidate.id === entree.id)
        if (compte && !compte.motDePasseDisponible) {
          void ouvrirAuthentification('webdav')
          return
        }
      }
    } catch {
      void ouvrirAuthentification(entree.fournisseur === 'gitlab' ? 'gitlab' : 'webdav')
      return
    }
  }
  await ouvrirRecent(entree)
}
</script>

<template>
  <section class="ecran accueil" :class="{ bienvenue: premierLancement }">
    <template v-if="!premierLancement">
      <header class="entete-accueil">
        <h2>Vos corpus</h2>
        <p>Reprenez une enquête en cours, ou commencez-en une nouvelle.</p>
      </header>

      <div class="actions-corpus">
        <section class="carte-action corpus-bloc" aria-labelledby="titre-creer">
          <h3 id="titre-creer">Créer un corpus</h3>
          <div class="paire">
            <button class="carte-demo nouveau-corpus principal" :disabled="ouvertureEnCours" @click="modaleNouveau = true">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M12 11v5M9.5 13.5h5" /></svg>
              <span><span class="carte-titre">Sur cet ordinateur</span><span class="carte-sous">Un nouveau dossier</span></span>
            </button>
            <button class="carte-demo nouveau-corpus-distant secondaire" :disabled="ouvertureEnCours" @click="modaleNouveauDistant = true">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5z" /><path d="M12 11v5M9.5 13.5h5" /></svg>
              <span><span class="carte-titre">En ligne</span><span class="carte-sous">Nextcloud ou GitLab</span></span>
            </button>
          </div>
        </section>
        <section class="carte-action ouverture-bloc" aria-labelledby="titre-ouvrir">
          <h3 id="titre-ouvrir">Ouvrir un corpus existant</h3>
          <div class="paire">
            <button class="carte-demo ouvrir-corpus neutre" :disabled="ouvertureEnCours" @click="choisirFichier">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H7.5a2 2 0 0 0-1.9 1.4L3 19z" /><path d="M3 19l2.6-7.6A2 2 0 0 1 7.5 10H22l-2.6 7.6a2 2 0 0 1-1.9 1.4z" /></svg>
              <span><span class="carte-titre">Un corpus local</span><span class="carte-sous">Fichier .crp</span></span>
            </button>
            <button class="carte-demo distant-corpus neutre" :disabled="ouvertureEnCours" @click="ouvrirAuthentification('webdav')">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5z" /><path d="M12 16v-5M9.5 13.5 12 11l2.5 2.5" /></svg>
              <span><span class="carte-titre">Un corpus en ligne</span><span class="carte-sous">Rejoindre un corpus partagé</span></span>
            </button>
          </div>
        </section>
      </div>

      <div class="colonnes">
        <section class="carte recents-bloc" aria-labelledby="titre-recents">
          <div class="tete-recents">
            <h3 id="titre-recents">Récemment ouverts</h3>
            <label v-if="avecRecherche" class="recherche">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <span class="visuellement-cache">Rechercher un corpus</span>
              <input v-model="recherche" type="search" placeholder="Rechercher…">
            </label>
          </div>
          <div v-if="avecOnglets" class="onglets" role="tablist" aria-label="Type de corpus">
            <button
              :ref="(el) => { boutonsOnglets.travail = el as HTMLButtonElement | null }"
              id="onglet-travail"
              class="onglet travail"
              role="tab"
              aria-controls="liste-recents"
              :aria-selected="onglet === 'travail'"
              :tabindex="onglet === 'travail' ? 0 : -1"
              @click="changerOnglet('travail')"
              @keydown.right.prevent="changerOnglet('exemples', true)"
            >Mes corpus <span class="compte">{{ recentsPersonnels.length }}</span></button>
            <button
              :ref="(el) => { boutonsOnglets.exemples = el as HTMLButtonElement | null }"
              id="onglet-exemples"
              class="onglet exemples-onglet"
              role="tab"
              aria-controls="liste-recents"
              :aria-selected="onglet === 'exemples'"
              :tabindex="onglet === 'exemples' ? 0 : -1"
              @click="changerOnglet('exemples')"
              @keydown.left.prevent="changerOnglet('travail', true)"
            >Copies d’exemples <span class="compte">{{ recentsExemples.length }}</span></button>
          </div>
          <div
            id="liste-recents"
            :role="avecOnglets ? 'tabpanel' : undefined"
            :aria-labelledby="avecOnglets ? `onglet-${onglet}` : undefined"
            class="panneau-recents"
          >
            <ListeRecents
              v-if="recentsAffiches.length > 0"
              :recents="recentsAffiches"
              :occupe="ouvertureEnCours"
              :ton="onglet === 'travail' ? 'travail' : 'exemple'"
              :libelle="onglet === 'travail' ? 'Corpus récents' : 'Copies d’exemples récentes'"
              @ouvrir="ouvrirRecentEntree"
              @retirer="retirerRecent"
            />
            <p v-else class="aucun">Aucun corpus ne correspond à « {{ recherche.trim() }} ».</p>
          </div>
          <p class="note-recents">Retirer un corpus de cette liste ne supprime aucun fichier.</p>
        </section>

        <aside class="cote" aria-labelledby="titre-decouverte">
          <section class="carte decouverte-bloc">
            <h3 id="titre-decouverte">Apprendre SonalPi</h3>
            <button class="carte-demo parcours mise-en-avant" @click="ouvrirCatalogueParcours()">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></svg>
              <span><span class="carte-titre">Parcours pas à pas</span><span class="carte-sous">Être guidé geste par geste sur un corpus fictif.</span></span>
            </button>
            <button class="carte-demo exemples" @click="ouvrirExemples">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3" /><path d="M7 15h10" /></svg>
              <span><span class="carte-titre">Corpus exemples</span><span class="carte-sous">Essayer librement, vierge ou déjà annoté.</span></span>
            </button>
            <div class="aides">
              <button class="carte-demo documentation" @click="ouvrirDocumentation('guide')">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5" /></svg>
                <span class="carte-titre">Documentation</span>
              </button>
              <button class="carte-demo faq" @click="ouvrirDocumentation('faq')">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6" /><path d="M12 17.5h.01" /></svg>
                <span class="carte-titre">FAQ</span>
              </button>
            </div>
          </section>
        </aside>
      </div>
    </template>

    <template v-else>
      <header class="entete-accueil centre">
        <h2>Bienvenue dans SonalPi</h2>
        <p>Transcrire, coder et analyser vos entretiens. Par où voulez-vous commencer ?</p>
      </header>

      <div class="chemins">
        <button class="carte-demo parcours chemin conseille" @click="ouvrirCatalogueParcours()">
          <span class="pastille">Conseillé pour débuter</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></svg>
          <span class="carte-titre">Suivre un parcours</span>
          <span class="carte-sous">SonalPi vous guide geste par geste sur un corpus fictif : importer, transcrire, coder.</span>
        </button>
        <button class="carte-demo exemples chemin" @click="ouvrirExemples">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3" /><path d="M7 15h10" /></svg>
          <span class="carte-titre">Explorer un exemple</span>
          <span class="carte-sous">Une copie d’un corpus fictif, vierge ou déjà annoté, à modifier librement.</span>
        </button>
        <section class="chemin corpus-bloc" aria-labelledby="titre-commencer">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M12 11v5M9.5 13.5h5" /></svg>
          <h3 id="titre-commencer" class="carte-titre">Commencer mon enquête</h3>
          <div class="pile">
            <button class="carte-demo nouveau-corpus principal" :disabled="ouvertureEnCours" @click="modaleNouveau = true">Nouveau corpus sur cet ordinateur</button>
            <button class="carte-demo nouveau-corpus-distant secondaire" :disabled="ouvertureEnCours" @click="modaleNouveauDistant = true">Nouveau corpus en ligne</button>
            <button class="carte-demo ouvrir-corpus secondaire" :disabled="ouvertureEnCours" @click="choisirFichier">Ouvrir un corpus local (.crp SonalPi1 ou SonalPi2)</button>
            <button class="carte-demo distant-corpus secondaire" :disabled="ouvertureEnCours" @click="ouvrirAuthentification('webdav')">Rejoindre un corpus en ligne</button>
          </div>
        </section>
      </div>

      <div class="pied-bienvenue">
        <button class="carte-demo documentation lien" @click="ouvrirDocumentation('guide')">Documentation</button>
        <button class="carte-demo faq lien" @click="ouvrirDocumentation('faq')">FAQ</button>
      </div>
    </template>

    <NouveauCorpus v-if="modaleNouveau" @fermer="modaleNouveau = false" />
    <NouveauCorpusDistant v-if="modaleNouveauDistant" @fermer="modaleNouveauDistant = false" />
  </section>
</template>

<style scoped>
.accueil {
  --encre: #1a2633;
  --discret: #5a6b7d;
  --bord: #dde4ec;
  --vert: #1c5c33;
  --vert-clair: #f1f8f3;
  --vert-bord: #b9d3c0;
  --bleu: #175d9e;
  --bleu-clair: #eef5fc;
  --bleu-bord: #c6daef;
  max-width: 1160px;
  margin-inline: auto;
  padding: 1rem 0 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  color: var(--encre);
}
.accueil.bienvenue { max-width: 960px; padding-top: 2.5rem; gap: 2rem; }
h2, h3, p { margin: 0; }
button { font: inherit; }
svg { width: 20px; height: 20px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

.entete-accueil { display: flex; flex-direction: column; gap: .25rem; }
.entete-accueil h2 { font-size: 1.5rem; font-weight: 700; }
.entete-accueil p { font-size: .875rem; color: var(--discret); }
.entete-accueil.centre { text-align: center; gap: .5rem; }
.entete-accueil.centre h2 { font-size: 1.75rem; }
.entete-accueil.centre p { font-size: .95rem; }

.carte, .carte-action { background: #fff; border: 1px solid var(--bord); border-radius: 12px; }
.actions-corpus { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; }
.carte-action { padding: 1rem; display: flex; flex-direction: column; gap: .75rem; }
.carte-action h3 { font-size: .8rem; font-weight: 600; color: var(--discret); letter-spacing: .02em; }
.paire { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .5rem; }
.paire .carte-demo { display: flex; align-items: center; gap: .6rem; min-height: 3.25rem; padding: .5rem .85rem; border-radius: 8px; text-align: left; cursor: pointer; }
.paire .carte-demo > span { display: flex; flex-direction: column; min-width: 0; }
.carte-titre { font-size: .875rem; font-weight: 600; }
.carte-sous { font-size: .75rem; color: var(--discret); line-height: 1.4; }
.principal { border: 1px solid var(--vert); background: var(--vert); color: #fff; }
.principal .carte-sous { color: #e6f2ea; }
.principal:hover { background: #154a28; }
.secondaire { border: 1px solid var(--vert-bord); background: var(--vert-clair); color: var(--vert); }
.secondaire .carte-sous { color: #3d6b4c; }
.secondaire:hover { border-color: var(--vert); }
.neutre { border: 1px solid #c9d4e0; background: #fff; color: var(--encre); }
.neutre svg { color: var(--vert); }
.neutre:hover { border-color: #8fa3b8; background: #fafbfd; }

.colonnes { display: flex; flex-wrap: wrap; gap: 1.5rem; align-items: flex-start; }
.recents-bloc { flex: 999 1 560px; min-width: 0; overflow: hidden; }
.cote { flex: 1 1 280px; min-width: 0; display: flex; flex-direction: column; gap: 1rem; }
.tete-recents { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .75rem; padding: .9rem 1rem .6rem; }
.tete-recents h3 { font-size: 1rem; font-weight: 700; }
.recherche { display: flex; align-items: center; gap: .5rem; height: 2.25rem; padding: 0 .6rem; border: 1px solid #c9d4e0; border-radius: 8px; background: #fafbfd; color: var(--discret); }
.recherche svg { width: 16px; height: 16px; }
.recherche input { border: 0; outline: 0; background: transparent; font: inherit; font-size: .85rem; color: var(--encre); width: 11rem; }
.recherche:focus-within { outline: 3px solid #a55b00; outline-offset: 2px; }
.visuellement-cache { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.onglets { display: flex; gap: .25rem; padding: 0 1rem; border-bottom: 1px solid var(--bord); }
.onglet { display: flex; align-items: center; gap: .4rem; min-height: 2.5rem; padding: 0 .75rem; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--discret); font-size: .875rem; font-weight: 500; cursor: pointer; }
.onglet .compte { font-size: .75rem; padding: .05rem .45rem; border-radius: 10px; background: #edf1f5; }
.onglet.travail[aria-selected='true'] { color: var(--vert); border-bottom-color: var(--vert); font-weight: 600; }
.onglet.travail[aria-selected='true'] .compte { background: #e3f1e7; }
.onglet.exemples-onglet[aria-selected='true'] { color: var(--bleu); border-bottom-color: var(--bleu); font-weight: 600; }
.onglet.exemples-onglet[aria-selected='true'] .compte { background: #e3eef9; }
.panneau-recents { padding-top: .25rem; }
.aucun { padding: 1rem; font-size: .85rem; color: var(--discret); }
.note-recents { padding: .6rem 1rem .9rem; font-size: .75rem; color: var(--discret); border-top: 1px solid #edf1f5; }

.decouverte-bloc { padding: 1rem; display: flex; flex-direction: column; gap: .6rem; }
.decouverte-bloc h3 { font-size: 1rem; font-weight: 700; }
.decouverte-bloc .carte-demo { display: flex; align-items: flex-start; gap: .75rem; padding: .75rem; border: 1px solid var(--bord); border-radius: 10px; background: #fff; color: var(--encre); text-align: left; cursor: pointer; }
.decouverte-bloc .carte-demo > span { display: flex; flex-direction: column; gap: .1rem; }
.decouverte-bloc .carte-demo svg { color: var(--bleu); width: 22px; height: 22px; }
.decouverte-bloc .carte-demo:hover { border-color: #8fb3d9; }
.mise-en-avant { border-color: var(--bleu-bord) !important; background: var(--bleu-clair) !important; }
.mise-en-avant .carte-titre { color: var(--bleu); }
.aides { display: flex; gap: .5rem; }
.decouverte-bloc .aides .carte-demo { flex: 1; align-items: center; justify-content: center; min-height: 2.75rem; padding: 0 .5rem; border-radius: 8px; }
.aides .carte-demo svg { width: 16px; height: 16px; }
.aides .carte-titre { font-size: .8rem; font-weight: 500; }

.lien { border: 0; background: none; padding: .35rem 0; color: var(--bleu); font-size: .82rem; text-decoration: underline; text-underline-offset: .2em; cursor: pointer; }
.lien:hover { color: #0f4475; }

.chemins { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; align-items: stretch; }
.chemin { display: flex; flex-direction: column; align-items: flex-start; gap: .6rem; padding: 1.25rem; border: 1px solid var(--bord); border-radius: 14px; background: #fff; color: var(--encre); text-align: left; }
button.chemin { cursor: pointer; }
button.chemin:hover { border-color: #8fb3d9; }
.chemin svg { width: 28px; height: 28px; color: var(--bleu); }
.chemin .carte-titre { font-size: 1.05rem; font-weight: 700; }
.chemin .carte-sous { font-size: .82rem; color: #44566a; line-height: 1.5; }
.chemin.conseille { border: 2px solid var(--bleu); }
.chemin.conseille .carte-titre { color: var(--bleu); }
.pastille { font-size: .75rem; font-weight: 600; color: #fff; background: var(--bleu); padding: .15rem .5rem; border-radius: 6px; }
.chemin.corpus-bloc { border-color: var(--vert-bord); background: var(--vert-clair); }
.chemin.corpus-bloc svg, .chemin.corpus-bloc .carte-titre { color: var(--vert); }
.pile { display: flex; flex-direction: column; gap: .4rem; align-self: stretch; }
.pile .carte-demo { min-height: 2.75rem; padding: 0 .75rem; border-radius: 8px; font-size: .875rem; font-weight: 600; text-align: left; cursor: pointer; }
.pile .secondaire { background: #fff; }
.pied-bienvenue { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: .25rem 1.5rem; padding-top: .5rem; border-top: 1px solid var(--bord); font-size: .85rem; }
.pied-bienvenue .lien { font-size: .875rem; }

button:focus-visible { outline: 3px solid #a55b00; outline-offset: 3px; }
/* Pendant l'ouverture d'un corpus, les boutons d'ouverture et de création attendent. */
.carte-demo:disabled { opacity: .6; cursor: progress; }
@media (max-width: 420px) {
  .paire { grid-template-columns: minmax(0, 1fr); }
  .aides { flex-direction: column; }
}
</style>
