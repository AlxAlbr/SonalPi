<script setup lang="ts">
import { onMounted } from 'vue'
import { utiliserSonal } from '../composables/sonal'

/**
 * Fenêtre d'ÉDITION des thèmes (parité SonalPi : le crayon ouvre une modale, la
 * consultation reste compacte dans les panneaux). PARTAGÉE par les écrans Corpus
 * et Entretien — même modèle derrière (le codebook corpus) ; seul le `contexte`
 * change la POLITIQUE de suppression (D-S10) :
 *  - `corpus`   : refus si le thème est utilisé quelque part (compteur) ;
 *  - `entretien`: refus si un AUTRE entretien l'utilise ; sinon confirmation →
 *    retrait des codages de CET entretien + suppression de la définition.
 */
const props = defineProps<{ contexte: 'corpus' | 'entretien' }>()
defineEmits<{ fermer: [] }>()

const {
  usages,
  messageTheme,
  hintCodage,
  couleurHex,
  arbreThemes,
  ajouterTheme,
  ajouterSousTheme,
  modifierTheme,
  deplacerTheme,
  supprimerTheme,
  themeASupprimer,
  demanderSuppressionTheme,
  confirmerSuppressionTheme,
  rafraichirUsages,
} = utiliserSonal()

/** Taille par défaut du texte de l'éditeur (px) : `.editeur` ne fixe pas de
 *  font-size → hérite du 16px navigateur. Affichée comme choix « par défaut »
 *  du sélecteur (valeur '' → pas de taille stockée). */
const TAILLE_TEXTE = 16
/** Autres tailles proposées (px) — l'éventail SonalPi, sans le défaut. */
const TAILLES = [12, 14, 18, 20, 22, 24, 28, 32]

function renommer(id: string, evt: Event) {
  const nom = (evt.target as HTMLInputElement).value.trim()
  if (nom) modifierTheme(id, { nom })
}
function changerTaille(id: string, evt: Event) {
  const v = (evt.target as HTMLSelectElement).value
  // '' = « Aa » → taille: undefined PRÉSENT dans le patch = retour à la taille
  // du texte (le spread écrase, la clé disparaît à l'écriture).
  modifierTheme(id, { taille: v ? Number(v) : undefined })
}
/** ✕ : la politique dépend du contexte (voir en-tête). */
function supprimer(id: string) {
  if (props.contexte === 'corpus') supprimerTheme(id)
  else demanderSuppressionTheme(id)
}

onMounted(() => {
  // Repartir propre (pas de message d'un passage précédent) + compteurs frais.
  messageTheme.value = null
  if (props.contexte === 'entretien') hintCodage.value = null
  rafraichirUsages()
})
</script>

<template>
  <div class="voile" @click.self="$emit('fermer')">
    <div class="modale-themes">
      <div class="corpus-tete">
        <h3>Édition des thèmes</h3>
        <button class="mini" title="Ajouter un thème à la racine" @click="ajouterTheme">+ Thème parent</button>
        <button class="fermer" title="Fermer" @click="$emit('fermer')">✕</button>
      </div>
      <p class="aide-thm">
        Nom, couleur, taille de police des passages codés · « + enfant » pour un sous-thème · ▲▼ pour
        déplacer dans l'arbre
      </p>

      <p v-if="messageTheme" class="msg-thm">{{ messageTheme }}</p>
      <p v-if="contexte === 'entretien' && hintCodage" class="msg-thm">{{ hintCodage }}</p>

      <!-- Confirmation de suppression depuis l'entretien (acte destructif — D-S10) -->
      <div v-if="themeASupprimer" class="confirm-suppr">
        Supprimer « {{ themeASupprimer.nom }} » ? Cela retire
        <b>{{ themeASupprimer.n }} codage(s)</b> de cet entretien — <b>irréversible</b>.
        <div class="confirm-actions">
          <button class="danger" @click="confirmerSuppressionTheme">Supprimer</button>
          <button @click="themeASupprimer = null">Annuler</button>
        </div>
      </div>

      <p v-if="arbreThemes().length === 0" class="vide">Aucun thème — clique « + Thème parent ».</p>

      <!-- En-tête de colonnes : les clones .fantome sont les MÊMES éléments qu'une
           ligne (boutons, input) — largeurs identiques par construction (un span
           n'a ni le padding ni la police par défaut d'un bouton) → chaque intitulé
           tombe pile au-dessus de sa colonne. -->
      <div v-if="arbreThemes().length" class="entete-liste" aria-hidden="true">
        <input type="color" class="swatch fantome" />
        <span class="entete-lbl entete-nom">thème</span>
        <span class="entete-lbl entete-aa" title="Taille de police des passages codés (16 = taille du texte)">Aa</span>
        <span class="entete-lbl entete-usage" title="Nombre de codages dans le corpus">Nbre</span>
        <span class="entete-lbl entete-actif" title="Décoché = thème désactivé (grisé)">Actif</span>
        <button class="mini-sous fantome">+ enfant</button>
        <button class="fleche fantome">▲</button>
        <button class="fleche fantome">▼</button>
        <button class="x fantome">✕</button>
      </div>
      <ul class="liste-thm">
        <li
          v-for="n in arbreThemes()"
          :key="n.cat.id"
          :class="{ inactif: !n.cat.actif }"
          :style="{ paddingLeft: n.profondeur * 1.1 + 'rem' }"
          :data-nom="n.cat.nom"
        >
          <input
            type="color"
            class="swatch"
            :value="couleurHex(n.cat)"
            @change="modifierTheme(n.cat.id, { couleur: ($event.target as HTMLInputElement).value })"
          />
          <input
            class="nom-thm"
            :value="n.cat.nom"
            @keyup.enter="($event.target as HTMLInputElement).blur()"
            @change="renommer(n.cat.id, $event)"
          />
          <select
            class="taille-thm"
            title="Taille de police des passages codés (16 = taille du texte)"
            :value="n.cat.taille ?? ''"
            @change="changerTaille(n.cat.id, $event)"
          >
            <option value="">{{ TAILLE_TEXTE }}</option>
            <option v-for="t in TAILLES" :key="t" :value="t">{{ t }}</option>
          </select>
          <span class="usage" :title="`${usages[n.cat.id] ?? 0} codage(s)`">{{
            usages[n.cat.id] ?? 0
          }}</span>
          <label class="actif" :title="n.cat.actif ? 'actif' : 'inactif'">
            <input
              type="checkbox"
              :checked="n.cat.actif"
              @change="modifierTheme(n.cat.id, { actif: ($event.target as HTMLInputElement).checked })"
            />
          </label>
          <button class="mini-sous" title="Ajouter un sous-thème (enfant de celui-ci)" @click="ajouterSousTheme(n.cat.id)">
            + enfant
          </button>
          <button class="fleche" title="Monter" :disabled="n.premier" @click="deplacerTheme(n.cat.id, -1)">
            ▲
          </button>
          <button class="fleche" title="Descendre" :disabled="n.dernier" @click="deplacerTheme(n.cat.id, 1)">
            ▼
          </button>
          <button class="x" title="Supprimer" @click="supprimer(n.cat.id)">✕</button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.voile {
  position: fixed;
  inset: 0;
  background: rgba(20, 24, 20, 0.35);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 8vh;
  z-index: 50;
}
/* Largeurs PRÉVISIBLES (border-box) : bordures/padding comptés DANS la largeur →
   une colonne de ligne (select, input…) et son intitulé d'en-tête, déclarés à la
   même largeur, occupent exactement la même place (l'alignement en dépend). */
.modale-themes,
.modale-themes * {
  box-sizing: border-box;
}
.modale-themes {
  width: min(560px, 92vw);
  max-height: 80vh;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #d8ddd8;
  border-radius: 10px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
  padding: 0.8rem 1rem 1rem;
}
/* .corpus-tete/.mini/.aide-thm/.msg-thm/.vide/.x : styles GLOBAUX (base.css). */
.corpus-tete {
  gap: 0.5rem;
}
.corpus-tete h3 {
  flex: 1;
}
.fermer {
  border: none;
  background: none;
  color: #888;
  cursor: pointer;
  font-size: 0.9rem;
}
.liste-thm {
  list-style: none;
  margin: 0.3rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.liste-thm li {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  border: 1px solid transparent;
  border-radius: 5px;
  padding: 0.1rem 0.15rem;
}
.liste-thm li.inactif {
  opacity: 0.5;
}
.swatch {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
  flex: none;
}
.nom-thm {
  flex: 1;
  min-width: 0;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.15rem 0.35rem;
  font-size: 0.82rem;
}
.taille-thm {
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.75rem;
  padding: 0.1rem;
  flex: none;
  width: 3.2rem; /* fixe : l'en-tête « Aa » se cale sur cette colonne */
}
/* En-tête de colonnes : même flex/gap qu'une ligne ; les clones .fantome
   réservent les largeurs, seul « Aa » est visible. */
.entete-liste {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  /* Miroir EXACT d'une ligne li racine : bordure transparente, padding droit,
     et padding GAUCHE À 0 (les li racine ont `padding-left: 0rem` inline). */
  border: 1px solid transparent;
  padding: 0 0.15rem 0 0;
  margin-top: 0.3rem;
}
.fantome {
  visibility: hidden;
}
.entete-lbl {
  flex: none;
  text-align: center;
  font-size: 0.68rem;
  font-style: italic;
  color: #888;
}
.entete-nom {
  flex: 1;
  text-align: left;
  padding-left: 0.45rem; /* = bordure + padding du .nom-thm : « thème » démarre où le texte démarre */
}
.entete-aa {
  width: 3.2rem; /* = .taille-thm */
}
.entete-usage {
  width: 2.4rem; /* = .usage */
}
.entete-actif {
  width: 2.4rem; /* = .actif */
}
/* Colonnes nbre/actif : largeur FIXE partagée avec leur intitulé d'en-tête. */
.usage {
  font-size: 0.72rem;
  color: #888;
  font-family: monospace;
  width: 2.4rem;
  flex: none;
  text-align: center;
}
.actif {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.4rem;
  flex: none;
}
.fleche {
  border: none;
  background: none;
  color: #999;
  cursor: pointer;
  font-size: 0.65rem;
  padding: 0 0.1rem;
}
.fleche:disabled {
  color: #ddd;
  cursor: default;
}
.mini-sous {
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  color: #666;
  cursor: pointer;
  font-size: 0.62rem;
  padding: 0 0.25rem;
  flex: none;
}
.mini-sous:hover {
  border-color: #2e9e3f;
  color: #2e7d32;
}
/* .confirm-suppr/.confirm-actions : styles GLOBAUX (base.css). */
</style>
