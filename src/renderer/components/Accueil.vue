<script setup lang="ts">
import { ref } from 'vue'
import ModaleDemo from './ModaleDemo.vue'
import MigrationCorpus from './MigrationCorpus.vue'
import NouveauCorpus from './NouveauCorpus.vue'
import CorpusDistant from './CorpusDistant.vue'
import NouveauCorpusDistant from './NouveauCorpusDistant.vue'
import { utiliserSonal } from '../composables/sonal'
import type { ModeDemo } from '../composables/demo'

const {
  recents,
  choisirDossier,
  ouvrirRecent,
  retirerRecent,
  preparer,
  raccrocherEtatDemo,
  pretUnClic,
  enPreparation,
} = utiliserSonal()

// Modale démo ADAPTATIVE : lancée depuis les cartes démo uniquement si le
// corpus de CE mode n'est pas déjà connu et présent (mémoire démo persistée
// settings.json). Une question déjà répondue est sautée (ex. « où importer les
// sources » si elles sont déjà en place). Une fois le corpus du mode créé,
// « un clic » suffit.
const modaleDemo = ref<ModeDemo | null>(null)
// Modale de migration SonalPi V1 → V2 : le `.crp` est analysé (aperçu) avant
// toute écriture ; le corpus V2 naît dans un dossier DÉDIÉ (gardes incluses).
const modaleMigration = ref(false)
// Modale « Nouveau corpus… » : choisir un dossier + donner un nom de projet.
const modaleNouveau = ref(false)
// Modale « Ouvrir un corpus distant » : comptes configurés + connexion Nextcloud (E0).
const modaleDistant = ref(false)
// Assistant « Nouveau corpus distant… » : publication du squelette sur le serveur
// puis ouverture immédiate.
const modaleNouveauDistant = ref(false)

async function lancerPreparer(mode: ModeDemo) {
  await raccrocherEtatDemo()
  if (pretUnClic(mode)) void preparer(mode)
  else modaleDemo.value = mode
}
</script>

<template>
    <section class="ecran accueil">
      <h2>Accueil</h2>

      <!-- Mini Corpus Test : deux modes côte à côte. Chacun choisit ses
           dossiers (sources + corpus de travail) puis construit le corpus de
           démo via le vrai pipeline d'import. -->
      <div class="demo-bloc">
        <h3 class="demo-titre">🎓 Mini Corpus Test</h3>
        <div class="cartes-demo">
          <button
            class="carte-demo pas-a-pas"
            :disabled="enPreparation"
            @click="lancerPreparer('pas-a-pas')"
          >
            <div class="carte-titre">Découverte pas à pas</div>
            <div class="carte-sous">Guidée, étape par étape <br> un entretien à la fois</div>
          </button>
          <button
            class="carte-demo autonomie"
            :disabled="enPreparation"
            @click="lancerPreparer('autonomie')"
          >
            <div class="carte-titre">En autonomie</div>
            <div class="carte-sous">L'ensemble du corpus <br> (4 entretiens + audio)</div>
          </button>
        </div>
        <p class="demo-aide">Un terrain fictif sur l'aide aux devoirs dans les associations.</p>
      </div>

      <!-- Vos corpus : deux mondes distincts.
           Ligne locale = le geste du solitaire ; ligne équipe (fond teinté) =
           Nextcloud. Les sous-titres portent l'intention (« en solo », « à
           plusieurs »), pas la technique. La migration V1 vit en dehors, dans
           sa propre rubrique : action exceptionnelle et
           provisoire ≠ cycle de vie d'un corpus. -->
      <div class="corpus-bloc">
        <h3 class="corpus-titre">📁 Vos corpus</h3>
        <!-- Ligne LOCALE -->
        <div class="cartes-demo">
          <button class="carte-demo nouveau-corpus" @click="modaleNouveau = true">
            <div class="carte-titre">➕ Nouveau corpus local</div>
            <div class="carte-sous">Travail en solo,<br>sur ce poste</div>
          </button>
          <button class="carte-demo ouvrir-corpus" @click="choisirDossier">
            <div class="carte-titre">📂 Ouvrir un corpus local</div>
            <div class="carte-sous">Choisir un dossier existant<br>(un dossier = un corpus)</div>
          </button>
        </div>
        <!-- Ligne ÉQUIPE (séparée visuellement : un solitaire ne clique pas
             par curiosité dans un parcours serveur qu'il ne veut pas). -->
        <h3 class="corpus-titre equipe-titre">☁️ En équipe (Nextcloud)</h3>
        <div class="cartes-demo equipe-ligne">
          <!-- Publie le squelette sur le serveur puis ouvre aussitôt :
               même comportement que la création locale. -->
          <button class="carte-demo nouveau-corpus-distant" @click="modaleNouveauDistant = true">
            <div class="carte-titre">☁️ Nouveau corpus distant</div>
            <div class="carte-sous">Travail à plusieurs — le corpus vivra sur<br>votre serveur Nextcloud</div>
          </button>
          <button class="carte-demo distant-corpus" @click="modaleDistant = true">
            <div class="carte-titre">☁️ Ouvrir un corpus distant</div>
            <div class="carte-sous">Ouvrir un corpus partagé<br>sur un serveur Nextcloud</div>
          </button>
        </div>
      </div>

      <!-- Migration V1 : action EXCEPTIONNELLE et provisoire → sa propre
           rubrique au style « chantier » (bordure pointillée), au-dessus des Récents. -->
      <div class="migration-bloc">
        <h3 class="migration-titre">🚧 Migrer depuis SonalPi V1</h3>
        <div class="cartes-demo">
          <button class="carte-demo migrer-corpus" @click="modaleMigration = true">
            <div class="carte-titre">🚚 Migrer un corpus SonalPi (V1)…</div>
            <div class="carte-sous">Test provisoire — notes, commentaires et anonymisation non encore repris</div>
          </button>
        </div>
      </div>

      <h3 class="recents-titre">Récents</h3>
      <p v-if="recents.length === 0" class="vide">Aucun corpus récent.</p>
      <ul class="recents">
        <li v-for="r in recents" :key="r.type === 'distant' ? `d-${r.id}` : r.dir">
          <button class="recent" @click="ouvrirRecent(r)">
            <span v-if="r.type === 'distant'" title="Corpus distant (serveur)">🌐</span>
            {{ r.nom }}
          </button>
          <span class="recent-dir">{{ r.type === 'distant' ? r.url : r.dir }}</span>
          <!-- Retire le RACCOURCI seulement : ni le dossier disque, ni le
               miroir, ni le serveur ne sont touchés. -->
          <button
            class="x oubli-recent"
            title="Retirer de la liste (ne supprime rien)"
            @click="retirerRecent(r)"
          >✕</button>
        </li>
      </ul>

      <!-- Modale à deux dossiers (sources + corpus de travail) -->
      <ModaleDemo v-if="modaleDemo" :mode="modaleDemo" @fermer="modaleDemo = null" />

      <!-- Modale de migration SonalPi V1 → V2 (aperçu → dossier dédié → exécution) -->
      <MigrationCorpus v-if="modaleMigration" @fermer="modaleMigration = false" />

      <!-- Modale « Nouveau corpus… » (choisir un dossier + donner un nom) -->
      <NouveauCorpus v-if="modaleNouveau" @fermer="modaleNouveau = false" />

      <!-- Modale « Ouvrir un corpus distant » (comptes Nextcloud + connexion, E0) -->
      <CorpusDistant v-if="modaleDistant" @fermer="modaleDistant = false" />

      <!-- Assistant « Nouveau corpus distant » : créer directement sur le serveur -->
      <NouveauCorpusDistant v-if="modaleNouveauDistant" @fermer="modaleNouveauDistant = false" />
    </section>
</template>

<style scoped>
.ecran.accueil {
  max-width: 640px;
}
.ecran.accueil h2 {
  font-size: 1.05rem;
  margin: 0.5rem 0;
}
/* --- Mini Corpus Test --- */
.demo-bloc {
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  padding: 0.7rem 0.8rem 0.6rem;
  margin: 0.3rem 0 1rem;
  background: #f4f8fd;
}
.demo-titre {
  font-size: 0.82rem;
  font-weight: 700;
  color: #1565c0;
  margin: 0 0 0.5rem;
}
.cartes-demo {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
}
.carte-demo {
  flex: 1 1 200px;
  text-align: left;
  border: 1px solid #c9dff5;
  border-radius: 10px;
  padding: 0.8rem 1rem;
  background: #fff;
  cursor: pointer;
}
.carte-demo:hover:not(:disabled) {
  border-color: #2e73d8;
  background: #f0f6ff;
}
.carte-demo:disabled {
  opacity: 0.6;
  cursor: progress;
}
.demo-aide {
  text-align: center;
  margin: 0.5rem 0 0;
  font-size: 0.72rem;
  color: #999;
  font-style: italic;
}
/* --- Ouvrir / migrer un corpus (groupé, comme Mini Corpus Test) --- */
.corpus-bloc {
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  padding: 0.7rem 0.8rem 0.6rem;
  margin: 0 0 1rem;
  background: #f7f8fb;
}
.corpus-titre {
  font-size: 0.82rem;
  font-weight: 700;
  color: #37474f;
  margin: 0 0 0.5rem;
}
.carte-titre {
  text-align: center;
  font-size: 0.95rem;
  font-weight: 600;
}
.carte-sous {
  text-align: center;
  font-size: 0.78rem;
  color: #888;
  margin-top: 0.2rem;
}
/* Sous-titre de la ligne équipe : même idiome que les titres de bloc,
   teinté nuage pour marquer la frontière locale/équipe. */
.equipe-titre {
  color: #0277bd;
  margin-top: 0.6rem;
}
.equipe-ligne {
  border: 1px solid #dceefb;
  background: #f4f9fd;
  border-radius: 8px;
  padding: 0.6rem;
}
/* --- Migration V1 : rubrique propre au-dessus des Récents --- */
.migration-bloc {
  border: 1px dashed #d7ccc8;
  border-radius: 10px;
  padding: 0.7rem 0.8rem 0.6rem;
  margin: 0 0 1rem;
  background: #faf6f4;
}
.migration-titre {
  font-size: 0.82rem;
  font-weight: 700;
  color: #8d6e63;
  margin: 0 0 0.5rem;
}
.recents-titre {
  font-size: 0.9rem;
  margin: 1.4rem 0 0.4rem;
}
.recents {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.recents li {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}
.recent {
  border: 1px solid #ccc;
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
  padding: 0.2rem 0.6rem;
  font-size: 0.82rem;
  color: #1565c0;
  flex: none;
}
.recent:hover {
  border-color: #2e73d8;
  background: #f0f6ff;
}
.recent-dir {
  font-size: 0.72rem;
  color: #aaa;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Croix discrète (révélée au survol de la ligne) — même idiome que les listes. */
.oubli-recent {
  opacity: 0.35;
}
.recents li:hover .oubli-recent {
  opacity: 1;
}
</style>
