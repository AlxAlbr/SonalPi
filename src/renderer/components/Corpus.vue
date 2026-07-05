<script setup lang="ts">
import { utiliserSonal } from '../composables/sonal'

const {
  codebook,
  usages,
  messageTheme,
  themeEnEdition,
  variables,
  messageVar,
  couleurHex,
  arbreThemes,
  ajouterTheme,
  ajouterSousTheme,
  modifierTheme,
  deplacerTheme,
  finRenommerTheme,
  focusChamp,
  supprimerTheme,
  ajouterVariable,
  renommerVariable,
  supprimerVariable,
  ajouterModalite,
  renommerModalite,
  supprimerModalite,
  ouvertId,
  ouvrirEntretien,
  nouvelEntretien,
  importer,
  renommer,
  supprimer,
  allerDonnees,
  listeEntretiens,
} = utiliserSonal()
</script>

<template>
    <section class="ecran corpus-ecran">
      <div class="grille-corpus">
        <aside class="corpus">
          <div class="corpus-tete">
            <h3>Entretiens</h3>
            <div>
              <button class="mini" @click="importer">Importer</button>
              <button class="mini" @click="nouvelEntretien">+ Nouveau</button>
            </div>
          </div>
          <p v-if="listeEntretiens().length === 0" class="vide">Aucun entretien — importe ou crée.</p>
          <ul class="ents">
            <li v-for="e in listeEntretiens()" :key="e.id" :class="{ actif: ouvertId === e.id }">
              <input class="titre" :value="e.titre" @change="renommer(e.id, $event)" />
              <div class="ent-actions">
                <button class="open" @click="ouvrirEntretien(e.id)">ouvrir</button>
                <button class="suppr" title="Supprimer (corbeille)" @click="supprimer(e.id)">✕</button>
              </div>
            </li>
          </ul>
        </aside>

        <!-- Thèmes : CRUD complet du codebook corpus (déménagé ici — S2) -->
        <aside class="panneau themes-corpus">
          <div class="corpus-tete">
            <h3>Thèmes</h3>
            <button class="mini" @click="ajouterTheme">+ Thème</button>
          </div>
          <p v-if="messageTheme" class="msg-thm">{{ messageTheme }}</p>
          <p class="aide-thm">Gestion · double-clic pour renommer · « + sous » pour un sous-thème (le codage se fait à l'écran Entretien)</p>
          <ul class="liste-thm">
            <li
              v-for="n in arbreThemes()"
              :key="n.cat.id"
              :class="{ inactif: !n.cat.actif }"
              :style="{ paddingLeft: n.profondeur * 1.1 + 'rem' }"
            >
              <input
                type="color"
                class="swatch"
                :value="couleurHex(n.cat)"
                @change="modifierTheme(n.cat.id, { couleur: ($event.target as HTMLInputElement).value })"
              />
              <input
                v-if="themeEnEdition === n.cat.id"
                class="nom-thm"
                :value="n.cat.nom"
                :ref="focusChamp"
                @keyup.enter="($event.target as HTMLInputElement).blur()"
                @blur="finRenommerTheme(n.cat.id, $event)"
              />
              <span
                v-else
                class="nom-thm-label"
                @dblclick="themeEnEdition = n.cat.id"
                >{{ n.cat.nom }}</span
              >
              <span class="usage" :title="`${usages[n.cat.id] ?? 0} codage(s)`">{{ usages[n.cat.id] ?? 0 }}</span>
              <label class="actif" :title="n.cat.actif ? 'actif' : 'inactif'">
                <input
                  type="checkbox"
                  :checked="n.cat.actif"
                  @change="modifierTheme(n.cat.id, { actif: ($event.target as HTMLInputElement).checked })"
                />
              </label>
              <button class="mini-sous" title="Ajouter un sous-thème" @click="ajouterSousTheme(n.cat.id)">+ sous</button>
              <button class="fleche" title="Monter" :disabled="n.premier" @click="deplacerTheme(n.cat.id, -1)">▲</button>
              <button class="fleche" title="Descendre" :disabled="n.dernier" @click="deplacerTheme(n.cat.id, 1)">▼</button>
              <button class="x" title="Supprimer" @click="supprimerTheme(n.cat.id)">✕</button>
            </li>
          </ul>
        </aside>

        <!-- Données : variables/modalités (définitions corpus) + matrice -->
        <aside class="panneau donnees donnees-corpus">
          <p v-if="messageVar" class="msg-thm">{{ messageVar }}</p>
          <div class="corpus-tete">
            <h3>Variables</h3>
            <span>
              <button class="mini" @click="ajouterVariable('entretien')">+ entretien</button>
              <button class="mini" @click="ajouterVariable('locuteur')">+ locuteur</button>
            </span>
          </div>
          <ul class="liste-var">
            <li v-for="v in variables" :key="v.id">
              <div class="var-tete">
                <span class="portee" :class="v.portee">{{ v.portee === 'entretien' ? 'ent' : 'loc' }}</span>
                <input class="nom-var" :value="v.lib" @change="renommerVariable(v.id, $event)" />
                <button class="x" title="Supprimer la variable" @click="supprimerVariable(v.id)">✕</button>
              </div>
              <div class="modalites">
                <span v-for="m in v.modalites" :key="m.id" class="mod">
                  <input class="nom-mod" :value="m.lib" @change="renommerModalite(v.id, m.id, $event)" />
                  <button class="x-mod" @click="supprimerModalite(v.id, m.id)">✕</button>
                </span>
                <button class="mini" @click="ajouterModalite(v.id)">+ mod</button>
              </div>
            </li>
          </ul>

          <button class="btn-table" @click="allerDonnees">Ouvrir la table de données →</button>
        </aside>
      </div>
    </section>
</template>
