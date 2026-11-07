<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import MigrationGitLab from './MigrationGitLab.vue'
import NouveauCorpus from './NouveauCorpus.vue'
import NouveauCorpusDistant from './NouveauCorpusDistant.vue'
import ListeRecents from './ListeRecents.vue'
import { utiliserSonal } from '../../composables/sonal'
import type { EntreeRecent } from '../../../shared/format'

const {
  recents,
  choisirDossier,
  choisirFichier,
  ouvertureEnCours,
  ouvrirAuthentification,
  migrationGitLabProposee,
  ouvrirMigrationGitLab,
  fermerMigrationGitLab,
  ouvrirRecent,
  retirerRecent,
  ouvrirCatalogueParcours,
  ouvrirExemples,
  modaleNouveauCorpus,
} = utiliserSonal()

const recentsPersonnels = computed(() => recents.value.filter((r) => r.type !== 'local' || !r.exemple))
const recentsExemples = computed(() => recents.value.filter((r) => r.type === 'local' && r.exemple))
const mediaCompact = window.matchMedia('(max-width: 800px)')
const compact = ref(mediaCompact.matches)
function actualiserLargeur(event: MediaQueryListEvent) { compact.value = event.matches }
mediaCompact.addEventListener('change', actualiserLargeur)
onBeforeUnmount(() => mediaCompact.removeEventListener('change', actualiserLargeur))
// L’ordre du clavier suit aussi la priorité aux récents sur une petite fenêtre.
const blocs = computed(() => {
  const ordre = compact.value
    ? ['recents', 'corpus', 'decouverte', 'exemples']
    : ['decouverte', 'exemples', 'corpus', 'recents']
  return ordre.filter((bloc) =>
    (bloc !== 'exemples' || recentsExemples.value.length > 0)
    && (bloc !== 'recents' || recentsPersonnels.value.length > 0),
  )
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
  <section class="ecran accueil">
    <h2>Accueil</h2>
    <div class="grille-accueil">
      <section v-for="bloc in blocs" :key="bloc" class="bloc-accueil" :class="`${bloc}-bloc`" :aria-labelledby="`titre-${bloc}`">
        <template v-if="bloc === 'decouverte'">
          <h3 id="titre-decouverte">Découvrir SonalPi</h3>
          <p class="intro-bloc">Trouver de l'aide et apprendre les gestes.</p>
          <div class="cartes-demo cartes-decouverte">
            <button class="carte-demo documentation" @click="ouvrirDocumentation('guide')">
              <span class="carte-titre">Documentation utilisateur</span>
            </button>
            <button class="carte-demo faq" @click="ouvrirDocumentation('faq')">
              <span class="carte-titre">FAQ</span>
            </button>
            <button class="carte-demo parcours" @click="ouvrirCatalogueParcours()">
              <span class="carte-titre">Parcours pas à pas</span>
              <span class="carte-sous">Apprendre de manière guidée</span>
            </button>
            <button class="carte-demo exemples" @click="ouvrirExemples">
              <span class="carte-titre">Explorer les corpus exemples</span>
              <span class="carte-sous">Tester sur un corpus fictif <br> vierge ou annoté</span>
            </button>
          </div>
        </template>
        <template v-else-if="bloc === 'exemples'">
          <h3 id="titre-exemples">Acceder à mes corpus exemples</h3>
          <ListeRecents :occupe="ouvertureEnCours" class="copies-exemples" :recents="recentsExemples" libelle="Copies d’exemples récentes" @ouvrir="ouvrirRecentEntree" @retirer="retirerRecent" />
        </template>
        <template v-else-if="bloc === 'corpus'">
          <h3 id="titre-corpus">Création de corpus et ouverture</h3>
          <p class="intro-bloc">Commencer une enquête ou ouvrir un dossier existant.</p>
          <div class="cartes-demo cartes-corpus">
            <button class="carte-demo nouveau-corpus" :disabled="ouvertureEnCours" @click="modaleNouveau = true">
              <span class="carte-titre">Nouveau corpus local</span>
              <span class="carte-sous">Créer un dossier sur votre poste</span>
            </button>
            <button class="carte-demo ouvrir-corpus" :disabled="ouvertureEnCours" @click="choisirFichier">
              <span class="carte-titre">Ouvrir un corpus local</span>
              <span class="carte-sous">Fichier .crp SonalPi1 ou SonalPi2</span>
            </button>
            <button class="carte-demo nouveau-corpus-distant" :disabled="ouvertureEnCours" @click="modaleNouveauDistant = true">
              <span class="carte-titre">Nouveau corpus distant</span>
              <span class="carte-sous">Créer sur Nextcloud ou GitLab</span>
            </button>
            <button class="carte-demo distant-corpus" :disabled="ouvertureEnCours" @click="ouvrirAuthentification('webdav')">
              <span class="carte-titre">Ouvrir un corpus distant</span>
              <span class="carte-sous">Rejoindre un corpus distant <br> déjà existant</span>
            </button>
          </div>
          <button class="ouvrir-dossier" :disabled="ouvertureEnCours" @click="choisirDossier">Ouvrir par dossier…</button>
        </template>
        <template v-else>
          <h3 id="titre-recents">Acceder à mes corpus de travail</h3>
          <ListeRecents :occupe="ouvertureEnCours" :recents="recentsPersonnels" libelle="Corpus récents" @ouvrir="ouvrirRecentEntree" @retirer="retirerRecent" />
        </template>
      </section>

      <details class="migration-bloc">
        <summary>Migration SonalPi1 vers SonalPi2 (Temporaire)</summary>
        <p class="aide-bloc">Reprendre un ancien corpus GitLab dans un nouveau dépôt, sans modifier sa source.</p>
        <div class="cartes-demo cartes-migration">
          <button class="carte-demo migrer-gitlab" :disabled="ouvertureEnCours" @click="ouvrirMigrationGitLab">
            <span class="carte-titre">Migration corpus GitLab<br>(V1 → V2)</span>
            <span class="carte-sous">Vers un nouveau dépôt, sans modifier la source. Médias copiés dans GitLab ou dans un espace externe.</span>
          </button>
        </div>
      </details>
    </div>

    <MigrationGitLab v-if="migrationGitLabProposee" @fermer="fermerMigrationGitLab" />
    <NouveauCorpus v-if="modaleNouveau" @fermer="modaleNouveau = false" />
    <NouveauCorpusDistant v-if="modaleNouveauDistant" @fermer="modaleNouveauDistant = false" />
  </section>
</template>

<style scoped>
.accueil { max-width: 1160px; margin-inline: auto; }
h2 { font-size: 1.05rem; margin: .5rem 0 .8rem; }
.grille-accueil { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; align-items: start; }
.bloc-accueil { min-width: 0; padding: 1rem; }
.decouverte-bloc, .corpus-bloc { grid-column: 1; border: 1px solid #dae2ed; border-radius: 12px; background: #f8fafe; }
.decouverte-bloc { grid-row: 1; background: #f2f7fd; }
.corpus-bloc { grid-row: 2; background: #edf7ed; border-color: #c9dfcb; }
.exemples-bloc { grid-column: 2; grid-row: 1; }
.recents-bloc { grid-column: 2; grid-row: 2; --couleur-recent: #1c5c33; }
h3 { font-size: 1rem; margin: 0; color: #294c70; }
.exemples-bloc h3, .recents-bloc h3 { text-decoration: underline; text-underline-offset: .2em; }
.recents-bloc h3, .corpus-bloc h3, .corpus-bloc .carte-titre { color: #1c5c33; }
.exemples-bloc > .recents, .recents-bloc > .recents { margin-inline-start: .85rem; margin-top: .45rem; }
.intro-bloc { font-size: .8rem; color: #586c81; margin: .35rem 0 .85rem; line-height: 1.4; }
.cartes-demo { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .6rem; }
.carte-demo { display: block; width: 100%; min-width: 0; text-align: left; border: 1px solid #cbd9e9; border-radius: 8px; padding: .7rem .8rem; background: #fff; cursor: pointer; }
.carte-demo:hover { border-color: #5284b6; background: #f7fbff; }
.carte-titre { display: block; text-align: center; font-size: .88rem; font-weight: 600; color: #204f7b; line-height: 1.35; }
.carte-sous { display: block; text-align: center; font-size: .75rem; color: #617286; margin-top: .3rem; line-height: 1.4; }
.aide-bloc { font-size: .77rem; line-height: 1.5; color: #607184; margin: .7rem 0 0; }
.copies-exemples { max-height: 8.5rem; }
.migration-bloc { grid-column: 1; grid-row: 3; min-width: 0; border: 1px dashed #d9d5d0; border-radius: 9px; padding: .7rem 1rem; background: #fcfaf8; }
summary, .cartes-migration .carte-titre { color: #6c5b4c; }
summary { cursor: pointer; font-size: .82rem; font-weight: 600; }
.cartes-migration { grid-template-columns: minmax(0, 1fr); margin-top: .7rem; }
button:focus-visible, summary:focus-visible { outline: 3px solid #a55b00; outline-offset: 3px; }
@media (max-width: 800px) {
  .grille-accueil { grid-template-columns: minmax(0, 1fr); }
  .bloc-accueil, .migration-bloc { grid-column: auto; grid-row: auto; }
}
@media (max-width: 420px) {
  .cartes-demo { grid-template-columns: minmax(0, 1fr); }
  .bloc-accueil { padding: .8rem; }
}
</style>
