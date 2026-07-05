<script setup lang="ts">
import { EditorContent } from '@tiptap/vue-3'
import { utiliserSonal } from '../composables/sonal'

const {
  codebook,
  varsGen,
  varsLoc,
  couleurHex,
  arbreThemes,
  ajouterTheme,
  locuteurs,
  meta,
  ongletDroite,
  hintCodage,
  selectionVide,
  editor,
  lignes,
  coderAvec,
  retirer,
  attribuerLoc,
  renommerLoc,
  nouveauLocuteur,
  setValeurGen,
  setValeurLoc,
  sauver,
  themeASupprimer,
  retourCorpus,
  exporter,
  demanderSuppressionTheme,
  confirmerSuppressionTheme,
} = utiliserSonal()
</script>

<template>
    <section class="ecran entretien-ecran">
      <div class="grille-ent">
        <section class="centre">
          <div class="barre">
            <button class="retour" @click="retourCorpus">← Corpus</button>
            <span class="barre-aide">Sélectionne du texte, puis clique un thème (onglet Thématique) pour le coder.</span>
            <button class="sauver" @click="sauver">Enregistrer</button>
            <button class="exporter" @click="exporter">Exporter .sonal</button>
          </div>
          <EditorContent :editor="editor" class="cadre" />
        </section>

        <div class="colonne-droite">
          <nav class="onglets">
            <button :class="{ actif: ongletDroite === 'themes' }" @click="ongletDroite = 'themes'">Thématique</button>
            <button :class="{ actif: ongletDroite === 'locuteurs' }" @click="ongletDroite = 'locuteurs'">Locuteurs</button>
            <button :class="{ actif: ongletDroite === 'donnees' }" @click="ongletDroite = 'donnees'">Données</button>
          </nav>

          <!-- Thématique : clic sur un thème = coder la sélection (S3) ; « + Thème »
               et ✕ agissent sur le codebook CORPUS depuis ici (D-S10). -->
          <aside v-show="ongletDroite === 'themes'" class="panneau themes-coder">
            <div class="corpus-tete">
              <h3>Thématiques</h3>
              <button class="mini" @click="ajouterTheme">+ Thème</button>
            </div>
            <p class="aide-thm">Sélectionne du texte, puis clique un thème pour le coder (re-clic = retirer).</p>
            <p v-if="hintCodage" class="hint-codage">{{ hintCodage }}</p>

            <!-- Confirmation de suppression (acte destructif, non réversible — D-S10) -->
            <div v-if="themeASupprimer" class="confirm-suppr">
              Supprimer « {{ themeASupprimer.nom }} » ? Cela retire
              <b>{{ themeASupprimer.n }} codage(s)</b> de cet entretien — <b>irréversible</b>.
              <div class="confirm-actions">
                <button class="danger" @click="confirmerSuppressionTheme">Supprimer</button>
                <button @click="themeASupprimer = null">Annuler</button>
              </div>
            </div>

            <p v-if="codebook.length === 0" class="vide">Aucun thème — clique « + Thème ».</p>
            <ul class="liste-coder">
              <li v-for="n in arbreThemes()" :key="n.cat.id" class="ligne-coder">
                <button
                  class="theme-coder"
                  :class="{ inactif: !n.cat.actif }"
                  :style="{ marginLeft: n.profondeur * 1.1 + 'rem' }"
                  @click="coderAvec(n.cat.id)"
                >
                  <span class="pastille" :style="{ background: couleurHex(n.cat) }"></span>
                  <span class="theme-nom">{{ n.cat.nom }}</span>
                </button>
                <button class="x-theme" title="Supprimer ce thème" @click="demanderSuppressionTheme(n.cat.id)">✕</button>
              </li>
            </ul>
          </aside>

          <!-- Locuteurs -->
          <aside v-show="ongletDroite === 'locuteurs'" class="panneau">
            <div class="corpus-tete">
              <h3>Locuteurs</h3>
              <button class="mini" @click="nouveauLocuteur">+ Locuteur</button>
            </div>
            <ul class="liste-loc">
              <li v-for="l in locuteurs" :key="l.index">
                <span class="idx">{{ l.index }}</span>
                <input class="nom-loc" :value="l.nom" @change="renommerLoc(l.index, $event)" />
              </li>
            </ul>
            <div class="attribuer">
              <span class="lbl">{{ selectionVide ? 'Attribuer le bloc courant :' : 'Attribuer la sélection :' }}</span>
              <div class="boutons-loc">
                <button v-for="l in locuteurs" :key="l.index" class="attr" @click="attribuerLoc(l.index)">
                  {{ l.nom }}
                </button>
                <button class="attr aucun" @click="attribuerLoc(null)">aucun</button>
              </div>
            </div>
          </aside>

          <!-- Données de CET entretien : saisie des valeurs (2 niveaux : entretien + locuteur).
               Les DÉFINITIONS de variables et la matrice sont à l'écran Corpus. -->
          <aside v-show="ongletDroite === 'donnees'" class="panneau donnees">
            <template v-if="varsGen().length">
              <h4>Valeurs · cet entretien</h4>
              <div v-for="v in varsGen()" :key="v.id" class="saisie">
                <span class="saisie-lib">{{ v.lib }}</span>
                <select
                  class="saisie-sel"
                  :value="meta.valeursGen[v.id] ?? ''"
                  @change="setValeurGen(v.id, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="">—</option>
                  <option v-for="m in v.modalites" :key="m.id" :value="m.id">{{ m.lib }}</option>
                </select>
              </div>
            </template>

            <template v-if="varsLoc().length && locuteurs.length">
              <h4>Valeurs · par locuteur</h4>
              <div v-for="l in locuteurs" :key="l.index" class="fiche-loc">
                <div class="fiche-loc-nom">{{ l.nom }}</div>
                <div v-for="v in varsLoc()" :key="v.id" class="saisie">
                  <span class="saisie-lib">{{ v.lib }}</span>
                  <select
                    class="saisie-sel"
                    :value="l.valeursLoc[v.id] ?? ''"
                    @change="setValeurLoc(l.index, v.id, ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="">—</option>
                    <option v-for="m in v.modalites" :key="m.id" :value="m.id">{{ m.lib }}</option>
                  </select>
                </div>
              </div>
            </template>

            <p v-if="!varsGen().length && !varsLoc().length" class="vide">
              Aucune variable définie — ajoute-en depuis l'écran Corpus.
            </p>
          </aside>

          <!-- Panneau debug (outil de dev, toujours visible) : le modèle en clair. -->
          <aside class="panneau debug modele-debug">
            <h3>Modèle · annotations ({{ lignes.length }})</h3>
            <p v-if="lignes.length === 0" class="vide">Aucune annotation.</p>
            <ul>
              <li v-for="l in lignes" :key="l.id" :class="{ orph: l.orpheline }">
                <div class="l1">
                  <code>{{ l.code || l.type }}</code>
                  <span class="pos">[{{ l.from }}, {{ l.to }}]</span>
                  <button class="x" @click="retirer(l.id)">✕</button>
                </div>
                <div class="l2">
                  <span v-if="l.orpheline" class="tag-orph">orpheline</span>
                  <span v-else class="extrait">« {{ l.extrait }} »</span>
                </div>
              </li>
            </ul>
          </aside>
        </div>
      </div>
    </section>
</template>
