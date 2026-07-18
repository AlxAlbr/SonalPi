<script setup lang="ts">
import { ref } from 'vue'
import { EditorContent } from '@tiptap/vue-3'
import LecteurAudio from './LecteurAudio.vue'
import EditionThemes from './EditionThemes.vue'
import { utiliserSonal } from '../composables/sonal'
// Icônes d'onglets rapatriées de SonalPi (img/) ; « journal » créée dans le
// même style (glyphe noir à plat) — SonalPi n'a pas d'équivalent.
import icoThemes from '../assets/icones/logocat.png'
import icoLocuteurs from '../assets/icones/logoloc.png'
import icoDonnees from '../assets/icones/logodat2.png'
import icoJournal from '../assets/icones/journal.svg'

const {
  codebook,
  varsGen,
  varsLoc,
  couleurHex,
  arbreThemes,
  locuteurs,
  meta,
  ongletDroite,
  hintCodage,
  selectionVide,
  editor,
  entreesJournal,
  annulerEntree,
  coderAvec,
  attribuerLoc,
  renommerLoc,
  nouveauLocuteur,
  setInterviewer,
  locuteurASupprimer,
  demanderSuppressionLocuteur,
  confirmerSuppressionLocuteur,
  setValeurGen,
  setValeurLoc,
  sauver,
  retourCorpus,
  exporter,
} = utiliserSonal()

// La fenêtre d'édition des thèmes (crayon, parité SonalPi) — locale à la vue ;
// en contexte entretien elle porte la politique de suppression D-S10.
const editerThemes = ref(false)
</script>

<template>
    <section class="ecran entretien-ecran">
      <div class="grille-ent">
        <section class="centre">
          <!-- En-tête COLLANT de la colonne texte : barre d'actions puis lecteur
               audio (S6) — reste visible quand le suivi de lecture fait défiler
               le texte. Le lecteur ne s'affiche que si un audio est assigné. -->
          <div class="entete-centre">
            <div class="barre">
              <button class="retour" @click="retourCorpus">← Corpus</button>
              <span class="barre-aide">Sélectionne du texte, puis clique un thème (onglet Thématique) pour le coder.</span>
              <button class="sauver" @click="sauver">Enregistrer</button>
              <button class="exporter" @click="exporter">Exporter .sonal</button>
            </div>
            <LecteurAudio />
          </div>
          <EditorContent :editor="editor" class="cadre" />
        </section>

        <div class="colonne-droite">
          <nav class="onglets">
            <button :class="{ actif: ongletDroite === 'themes' }" @click="ongletDroite = 'themes'">
              <img class="ico-onglet" :src="icoThemes" alt="" />Thèmes
            </button>
            <button :class="{ actif: ongletDroite === 'locuteurs' }" @click="ongletDroite = 'locuteurs'">
              <img class="ico-onglet" :src="icoLocuteurs" alt="" />Loc
            </button>
            <button :class="{ actif: ongletDroite === 'donnees' }" @click="ongletDroite = 'donnees'">
              <img class="ico-onglet" :src="icoDonnees" alt="" />Données
            </button>
            <button :class="{ actif: ongletDroite === 'journal' }" @click="ongletDroite = 'journal'">
              <img class="ico-onglet" :src="icoJournal" alt="" />Journal
            </button>
          </nav>

          <!-- Thématique : clic sur un thème = coder la sélection (S3). L'ÉDITION
               (créer/renommer/couleur/taille/arbre/supprimer — D-S10) passe par le
               crayon → fenêtre EditionThemes partagée avec l'écran Corpus. -->
          <aside v-show="ongletDroite === 'themes'" class="panneau themes-coder">
            <div class="corpus-tete">
              <h3>Thématiques</h3>
              <button class="crayon" title="Éditer les thèmes" @click="editerThemes = true">✏️</button>
            </div>
            <p class="aide-thm">Sélectionne du texte, puis clique un thème pour le coder (re-clic = retirer).</p>
            <p v-if="hintCodage" class="hint-codage">{{ hintCodage }}</p>

            <p v-if="codebook.length === 0" class="vide">Aucun thème — ✏️ pour en créer.</p>
            <ul class="liste-coder">
              <li v-for="n in arbreThemes()" :key="n.cat.id" class="ligne-coder">
                <button
                  class="theme-coder"
                  :class="{ inactif: !n.cat.actif }"
                  :style="{ marginLeft: n.profondeur * 1.1 + 'rem' }"
                  @click="coderAvec(n.cat.id)"
                >
                  <span class="pastille" :style="{ background: couleurHex(n.cat) }"></span>
                  <!-- Taille de police UNIFORME (décision utilisateur : la taille
                       d'un thème ne s'applique qu'au marquage dans le texte). -->
                  <span class="theme-nom">{{ n.cat.nom }}</span>
                </button>
              </li>
            </ul>
          </aside>

          <!-- Locuteurs -->
          <aside v-show="ongletDroite === 'locuteurs'" class="panneau">
            <div class="corpus-tete">
              <h3>Locuteurs</h3>
              <button class="mini" @click="nouveauLocuteur">+ Locuteur</button>
            </div>
            <p class="aide-thm">Interrupteur « ? » = interviewer : ses tours (questions) s'affichent en italique.</p>

            <!-- Confirmation de suppression (destructif : nom + valeurs + lien des blocs) -->
            <div v-if="locuteurASupprimer" class="confirm-suppr">
              Supprimer « {{ locuteurASupprimer.nom }} » ? Ses
              <b>{{ locuteurASupprimer.nbBlocs }} bloc(s)</b> passent à « aucun » — <b>irréversible</b>.
              <div class="confirm-actions">
                <button class="danger" @click="confirmerSuppressionLocuteur">Supprimer</button>
                <button @click="locuteurASupprimer = null">Annuler</button>
              </div>
            </div>

            <ul class="liste-loc">
              <li v-for="l in locuteurs" :key="l.index">
                <span class="idx">{{ l.index }}</span>
                <input class="nom-loc" :value="l.nom" @change="renommerLoc(l.index, $event)" />
                <label class="interv" :title="`${l.nom} pose les questions (interviewer) — tours en italique`">
                  <input
                    type="checkbox"
                    :checked="l.interviewer ?? false"
                    @change="setInterviewer(l.index, ($event.target as HTMLInputElement).checked)"
                  />
                  <span class="glisseur"></span>
                  <span class="q">?</span>
                </label>
                <button class="x-loc" title="Supprimer ce locuteur" @click="demanderSuppressionLocuteur(l.index)">✕</button>
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

          <!-- Journal des actions de modèle (S5) : 10 dernières, annulation sélective. -->
          <aside v-show="ongletDroite === 'journal'" class="panneau journal">
            <div class="corpus-tete">
              <h3>Journal</h3>
            </div>
            <p class="aide-thm">
              Actions de modèle de la session (10 dernières). La frappe de texte s'annule avec Ctrl+Z.
            </p>
            <p v-if="entreesJournal.length === 0" class="vide">Aucune action enregistrée.</p>
            <ul class="liste-journal">
              <li v-for="e in entreesJournal" :key="e.id" :class="{ grisee: !e.annulable }">
                <span class="heure">{{ e.heure }}</span>
                <span class="lib-journal">{{ e.libelle }}</span>
                <button
                  class="annuler-entree"
                  :disabled="!e.annulable"
                  :title="e.annulable ? 'Annuler cette action' : 'Non annulable — la cible a disparu'"
                  @click="annulerEntree(e.id)"
                >↩</button>
              </li>
            </ul>
          </aside>

        </div>
      </div>

      <EditionThemes v-if="editerThemes" contexte="entretien" @fermer="editerThemes = false" />
    </section>
</template>

<style scoped>
.grille-ent {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 1rem;
  align-items: start;
}
.retour {
  padding: 0.3rem 0.7rem;
  border: 1px solid #bbb;
  background: #fff;
  border-radius: 5px;
  cursor: pointer;
}
/* En-tête collant de la colonne texte (barre + lecteur audio) : reste visible
   quand la fenêtre défile ; le fond masque le texte qui passe dessous. */
.entete-centre {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #fff;
  padding-bottom: 0.1rem;
}
.barre {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.barre select {
  padding: 0.3rem 0.5rem;
  border: 1px solid #ccc;
  border-radius: 5px;
}
.sauver,
.exporter {
  padding: 0.3rem 0.8rem;
  border: 1px solid #bbb;
  background: #fff;
  border-radius: 5px;
  cursor: pointer;
}
/* Hôte <EditorContent> (le contenteditable ProseMirror est stylé dans editeur.css). */
.cadre {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 0.8rem 1rem;
  background: #fff;
}
/* Colonne de droite collante : les onglets et le panneau restent visibles
   pendant le défilement ; au-delà d'un écran, elle défile en interne. */
.colonne-droite {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  position: sticky;
  top: 0;
  max-height: 100vh;
  overflow-y: auto;
}
.onglets {
  display: flex;
  gap: 0.25rem;
}
.onglets button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.28rem;
  border: 1px solid #ddd;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  background: #f0f0f5;
  padding: 0.3rem 0.2rem;
  font-size: 0.78rem;
  cursor: pointer;
}
.onglets button.actif {
  background: #fff;
  font-weight: 600;
  color: #2e7d32;
}
/* Icônes SonalPi (glyphes noirs) : adoucies sur l'onglet inactif. */
.ico-onglet {
  width: 13px;
  height: 13px;
  object-fit: contain;
  opacity: 0.55;
  flex: none;
}
.onglets button.actif .ico-onglet {
  opacity: 1;
}
/* --- Onglet Thématique : clic = coder (S3) --- */
.barre-aide {
  flex: 1;
  font-size: 0.72rem;
  color: #999;
  align-self: center;
}
.hint-codage {
  background: #fff3e0;
  color: #b06e0f;
  border: 1px solid #e0a03a;
  border-radius: 6px;
  padding: 0.3rem 0.5rem;
  font-size: 0.75rem;
  margin: 0.3rem 0;
}
.liste-coder {
  list-style: none;
  margin: 0.3rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.theme-coder {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  width: 100%;
  text-align: left;
  border: 1px solid #e5e5ef;
  border-radius: 6px;
  background: #fff;
  padding: 0.3rem 0.5rem;
  cursor: pointer;
  font-size: 0.85rem;
}
.theme-coder:hover {
  border-color: #2e9e3f;
  background: #f3fbf4;
}
.theme-coder.inactif {
  opacity: 0.45;
}
.pastille {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex: none;
  border: 1px solid rgba(0, 0, 0, 0.15);
}
.theme-nom {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ligne-coder {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}
.ligne-coder .theme-coder {
  flex: 1;
}
/* --- Fiche données de CET entretien (saisie EAV) --- */
.saisie {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0.2rem 0;
}
.saisie-lib {
  flex: 1;
  font-size: 0.8rem;
  color: #444;
}
.saisie-sel {
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.1rem 0.3rem;
  font-size: 0.8rem;
}
.fiche-loc {
  border-top: 1px dashed #eee;
  padding-top: 0.3rem;
  margin-top: 0.3rem;
}
.fiche-loc-nom {
  font-size: 0.78rem;
  font-weight: 600;
  color: #8a6d3b;
}
/* --- Panneau Locuteurs --- */
.locuteurs {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 0.6rem;
  background: #fafafe;
}
.liste-loc {
  list-style: none;
  margin: 0.3rem 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.liste-loc li {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.liste-loc .idx {
  font-size: 0.7rem;
  color: #999;
  font-family: monospace;
  width: 1rem;
}
.nom-loc {
  flex: 1;
  min-width: 0;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.15rem 0.35rem;
  font-size: 0.82rem;
}
/* Interrupteur « interviewer » : pilule compacte + « ? » (la convention SonalPi,
   rendue cliquable). Coché → vert, tours du locuteur en italique. */
.interv {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
  flex: none;
}
.interv input {
  display: none;
}
.glisseur {
  width: 26px;
  height: 14px;
  border-radius: 7px;
  background: #d5d5dd;
  position: relative;
  transition: background 0.15s;
}
.glisseur::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  transition: left 0.15s;
}
.interv input:checked + .glisseur {
  background: #2e9e3f;
}
.interv input:checked + .glisseur::after {
  left: 14px;
}
.interv .q {
  font-size: 0.8rem;
  font-weight: 600;
  color: #aaa;
  font-style: italic;
}
.interv input:checked ~ .q {
  color: #2e7d32;
}
/* Croix de suppression d'un locuteur — même idiome discret que les thèmes. */
.x-loc {
  border: none;
  background: none;
  color: #c33;
  cursor: pointer;
  font-size: 0.8rem;
  flex: none;
  opacity: 0.5;
}
.liste-loc li:hover .x-loc {
  opacity: 1;
}
.attribuer {
  margin-top: 0.5rem;
  border-top: 1px solid #eee;
  padding-top: 0.5rem;
}
.attribuer .lbl {
  font-size: 0.75rem;
  color: #666;
}
.boutons-loc {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.35rem;
}
.attr {
  font-size: 0.75rem;
  border: 1px solid #ccc;
  border-radius: 5px;
  background: #fff;
  padding: 0.15rem 0.5rem;
  cursor: pointer;
}
.attr.aucun {
  color: #999;
}
/* --- Panneau Journal (S5) --- */
.liste-journal {
  list-style: none;
  margin: 0.3rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.liste-journal li {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid #e5e5ef;
  border-radius: 6px;
  padding: 0.3rem 0.45rem;
  background: #fff;
  font-size: 0.8rem;
}
.liste-journal li.grisee {
  opacity: 0.45;
}
.heure {
  font-size: 0.68rem;
  color: #999;
  font-family: monospace;
  flex: none;
}
.lib-journal {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.annuler-entree {
  border: 1px solid #ccc;
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
  padding: 0.05rem 0.4rem;
  font-size: 0.85rem;
  flex: none;
}
.annuler-entree:hover:not(:disabled) {
  border-color: #2e9e3f;
  color: #2e7d32;
}
.annuler-entree:disabled {
  cursor: not-allowed;
  color: #bbb;
}
</style>
