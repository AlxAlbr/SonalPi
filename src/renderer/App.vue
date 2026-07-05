<script setup lang="ts">
import { fournirSonal } from './composables/sonal'
import Accueil from './components/Accueil.vue'
import Corpus from './components/Corpus.vue'
import TableDonnees from './components/TableDonnees.vue'
import Entretien from './components/Entretien.vue'

// D-S12 : App = COQUILLE. `fournirSonal` crée l'orchestration + les 3 scopes et les
// PROVIDE ; chaque composant de vue les INJECTE (utiliserSonal). App ne garde que
// l'en-tête, le fil d'Ariane et les bannières.
const { vue, etatSauvegarde, allerAccueil, retourCorpus, ouvertId, membership, refusFormat, perime } =
  fournirSonal()
</script>


<template>
  <main class="app">
    <header>
      <h1>
        SonalAsynchro — <small>S2 · Accueil → Corpus → Entretien</small>
        <span class="etat" :class="etatSauvegarde.replace('…', '').replace(' ', '-')">
          {{ etatSauvegarde }}
        </span>
      </h1>
      <nav class="fil" v-if="vue !== 'accueil'">
        <button class="lien-nav" @click="allerAccueil">Accueil</button>
        <span class="sep">›</span>
        <button class="lien-nav" :class="{ courant: vue === 'corpus' }" :disabled="vue === 'corpus'" @click="retourCorpus">
          Corpus
        </button>
        <template v-if="vue === 'entretien'">
          <span class="sep">›</span>
          <span class="lien-nav courant">{{ (ouvertId && membership[ouvertId]?.titre) || 'Entretien' }}</span>
        </template>
        <template v-if="vue === 'donnees'">
          <span class="sep">›</span>
          <span class="lien-nav courant">Table de données</span>
        </template>
      </nav>
    </header>

    <div v-if="refusFormat" class="banniere refus">{{ refusFormat }}</div>
    <div v-if="perime && vue === 'entretien'" class="banniere perime">
      ⚠ Cet entretien semble plus ancien que ce que le corpus a enregistré
      (fichier restauré ?). Vérifie avant d'écraser.
    </div>

    <Accueil v-show="vue === 'accueil'" />
    <Corpus v-show="vue === 'corpus'" />
    <!-- Entretien en v-show : l'éditeur TipTap reste MONTÉ d'un écran à l'autre. -->
    <Entretien v-show="vue === 'entretien'" />
    <TableDonnees v-show="vue === 'donnees'" />
  </main>
</template>

<style>
body {
  font-family: system-ui, -apple-system, sans-serif;
  margin: 0;
  color: #1a1a1a;
}
.editeur {
  outline: none;
  min-height: 300px;
  line-height: 1.9;
}
/* Gouttière des locuteurs : nom cliquable devant le bloc (widget de décoration). */
.editeur .gouttiere-loc {
  display: inline-block;
  width: 6.5rem;
  margin-right: 0.6rem;
  padding-right: 0.4rem;
  color: #8a6d3b;
  font-size: 0.72rem;
  text-align: right;
  cursor: pointer;
  user-select: none;
  vertical-align: baseline;
  border-right: 2px solid #e0d3b8;
}
.editeur .gouttiere-loc:hover {
  color: #5a4a28;
}
.editeur .gouttiere-loc.vide {
  border-right-color: #eee;
}
.editeur .bloc-loc {
  border-radius: 3px;
}
.editeur .annot {
  border-radius: 2px;
  padding-bottom: 4px;
}
</style>

<style>
.app {
  max-width: 1250px;
  margin: 1.2rem auto;
  padding: 0 1rem;
}
h1 {
  font-size: 1.2rem;
  margin: 0 0 0.3rem;
}
h1 small {
  color: #999;
  font-weight: 400;
}
.etat {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.1rem 0.5rem;
  border-radius: 10px;
  margin-left: 0.5rem;
  vertical-align: middle;
}
.etat.à-jour {
  background: #e6f4ea;
  color: #2e7d32;
}
.etat.modifié {
  background: #fff3e0;
  color: #b06e0f;
}
.etat.sauvegarde {
  background: #e3f2fd;
  color: #1565c0;
}
.hint {
  color: #666;
  font-size: 0.85rem;
  margin: 0 0 1rem;
}
.banniere {
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  font-size: 0.85rem;
  margin-bottom: 0.8rem;
}
.banniere.refus {
  background: #fdecea;
  color: #b3261e;
  border: 1px solid #f3b4ad;
}
.banniere.perime {
  background: #fff8ec;
  color: #b06e0f;
  border: 1px solid #e0a03a;
}
.grille {
  display: grid;
  grid-template-columns: 220px 1fr 320px;
  gap: 1rem;
  align-items: start;
}
/* --- S2 : navigation à trois écrans --- */
.fil {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0 0 1rem;
  font-size: 0.85rem;
}
.lien-nav {
  border: none;
  background: none;
  color: #2e7d32;
  cursor: pointer;
  padding: 0.1rem 0.2rem;
  font-size: 0.85rem;
}
.lien-nav.courant {
  color: #1a1a1a;
  font-weight: 600;
  cursor: default;
}
.fil .sep {
  color: #bbb;
}
.ecran.accueil {
  max-width: 640px;
}
.ecran.accueil h2 {
  font-size: 1.05rem;
  margin: 0.5rem 0;
}
.cartes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
}
.carte {
  text-align: left;
  border: 1px solid #ddd;
  border-radius: 10px;
  padding: 0.9rem 1.1rem;
  background: #fafafe;
  cursor: pointer;
  min-width: 240px;
}
.carte:hover {
  border-color: #2e9e3f;
  background: #f3fbf4;
}
.carte-titre {
  font-size: 0.95rem;
  font-weight: 600;
}
.carte-sous {
  font-size: 0.78rem;
  color: #888;
  margin-top: 0.2rem;
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
  color: #2e7d32;
  flex: none;
}
.recent:hover {
  border-color: #2e9e3f;
  background: #f3fbf4;
}
.recent-dir {
  font-size: 0.72rem;
  color: #aaa;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.grille-corpus {
  display: grid;
  grid-template-columns: 240px 320px 1fr;
  gap: 1rem;
  align-items: start;
}
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
.vide {
  color: #aaa;
  font-size: 0.85rem;
}
.corpus {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 0.6rem;
  background: #fafafe;
}
.corpus-tete {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}
.corpus-tete h3 {
  margin: 0;
  font-size: 0.95rem;
}
.mini {
  font-size: 0.75rem;
  border: 1px solid #ccc;
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
  padding: 0.15rem 0.4rem;
}
.ents {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.ents li {
  border: 1px solid #e5e5ef;
  border-radius: 6px;
  padding: 0.35rem;
  background: #fff;
}
.ents li.actif {
  border-color: #2e9e3f;
}
.titre {
  width: 100%;
  border: none;
  font-size: 0.82rem;
  padding: 0.1rem 0.15rem;
  background: transparent;
}
.titre:focus {
  outline: 1px solid #ccc;
  border-radius: 3px;
}
.ent-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 0.25rem;
}
.open {
  cursor: pointer;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  padding: 0.1rem 0.5rem;
  font-size: 0.75rem;
}
.ents li.actif .open {
  background: #2e9e3f;
  color: #fff;
  border-color: #2e9e3f;
}
.suppr {
  border: none;
  background: none;
  color: #c33;
  cursor: pointer;
  font-size: 0.8rem;
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
.coder {
  padding: 0.3rem 0.8rem;
  border: 1px solid #2e7d32;
  background: #2e9e3f;
  color: #fff;
  border-radius: 5px;
  cursor: pointer;
}
.sauver,
.exporter {
  padding: 0.3rem 0.8rem;
  border: 1px solid #bbb;
  background: #fff;
  border-radius: 5px;
  cursor: pointer;
}
.cadre {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 0.8rem 1rem;
  background: #fff;
}
.colonne-droite {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.onglets {
  display: flex;
  gap: 0.25rem;
}
.onglets button {
  flex: 1;
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
.panneau {
  border: 1px solid #ddd;
  border-radius: 0 8px 8px 8px;
  padding: 0.75rem;
  background: #fafafe;
}
.msg-thm {
  background: #fdecea;
  color: #b3261e;
  border: 1px solid #f3b4ad;
  border-radius: 6px;
  padding: 0.4rem 0.5rem;
  font-size: 0.78rem;
  margin: 0.3rem 0;
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
.x-theme {
  border: none;
  background: none;
  color: #c33;
  cursor: pointer;
  font-size: 0.8rem;
  flex: none;
  opacity: 0.5;
}
.ligne-coder:hover .x-theme {
  opacity: 1;
}
.confirm-suppr {
  background: #fdecea;
  color: #b3261e;
  border: 1px solid #f3b4ad;
  border-radius: 6px;
  padding: 0.5rem 0.6rem;
  font-size: 0.8rem;
  margin: 0.3rem 0;
}
.confirm-actions {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.4rem;
}
.confirm-actions button {
  border: 1px solid #ccc;
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
  padding: 0.2rem 0.6rem;
  font-size: 0.78rem;
}
.confirm-actions .danger {
  border-color: #b3261e;
  background: #d84315;
  color: #fff;
}
.liste-thm {
  list-style: none;
  margin: 0.3rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.aide-thm {
  font-size: 0.7rem;
  color: #999;
  margin: 0.2rem 0;
}
.liste-thm li {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  border: 1px solid transparent;
  border-radius: 5px;
  padding: 0.1rem 0.15rem;
}
.liste-thm li.inactif {
  opacity: 0.5;
}
.liste-thm li.courant {
  border-color: #2e9e3f;
  background: #eefaf0;
}
.nom-thm-label {
  flex: 1;
  min-width: 0;
  padding: 0.2rem 0.35rem;
  font-size: 0.82rem;
  cursor: pointer;
  border-radius: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nom-thm-label:hover {
  background: #eee;
}
.liste-thm li.courant .nom-thm-label {
  font-weight: 600;
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
.usage {
  font-size: 0.72rem;
  color: #888;
  font-family: monospace;
  min-width: 1.1rem;
  text-align: right;
}
.actif {
  display: flex;
  align-items: center;
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
.liste-xtr {
  list-style: none;
  margin: 0.3rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.liste-xtr li {
  border: 1px solid #e5e5ef;
  border-radius: 6px;
  padding: 0.4rem 0.5rem;
  background: #fff;
}
.xtr-loc {
  font-size: 0.72rem;
  color: #8a6d3b;
  margin-bottom: 0.2rem;
}
.xtr-txt {
  font-size: 0.85rem;
  color: #444;
}
/* --- Onglet Données (EAV) --- */
.donnees h4 {
  margin: 0.8rem 0 0.3rem;
  font-size: 0.82rem;
  color: #555;
}
.donnees h4 small {
  color: #aaa;
  font-weight: 400;
}
.liste-var {
  list-style: none;
  margin: 0.3rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.liste-var > li {
  border: 1px solid #e5e5ef;
  border-radius: 6px;
  padding: 0.35rem;
  background: #fff;
}
.var-tete {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.portee {
  font-size: 0.62rem;
  font-weight: 700;
  padding: 0.05rem 0.3rem;
  border-radius: 3px;
  color: #fff;
}
.portee.entretien {
  background: #5c6bc0;
}
.portee.locuteur {
  background: #8a6d3b;
}
.nom-var {
  flex: 1;
  min-width: 0;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.15rem 0.35rem;
  font-size: 0.82rem;
}
.modalites {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.3rem;
  padding-left: 0.3rem;
}
.mod {
  display: inline-flex;
  align-items: center;
  border: 1px solid #ddd;
  border-radius: 10px;
  background: #f6f6fa;
  padding: 0 0.1rem 0 0.3rem;
}
.nom-mod {
  border: none;
  background: transparent;
  font-size: 0.75rem;
  width: 4.5rem;
}
.x-mod {
  border: none;
  background: none;
  color: #c33;
  cursor: pointer;
  font-size: 0.7rem;
}
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
.matrice-scroll {
  overflow-x: auto;
  margin-top: 0.3rem;
}
.matrice {
  border-collapse: collapse;
  font-size: 0.72rem;
}
.matrice th,
.matrice td {
  border: 1px solid #e5e5ef;
  padding: 0.2rem 0.4rem;
  text-align: left;
  white-space: nowrap;
}
.matrice th {
  background: #f0f0f5;
}
.ligne-ent td {
  font-weight: 600;
  background: #fafafe;
}
.ligne-loc td:first-child {
  padding-left: 0.9rem;
  color: #8a6d3b;
}
/* --- Table de données éditable (D-S11) --- */
.btn-table {
  margin-top: 0.6rem;
  padding: 0.35rem 0.7rem;
  border: 1px solid #2e7d32;
  background: #2e9e3f;
  color: #fff;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.82rem;
}
.donnees-ecran {
  max-width: 100%;
}
.table-tete h2 {
  font-size: 1.05rem;
  margin: 0.3rem 0;
}
.matrice.editable td.cell-val {
  padding: 0.1rem 0.2rem;
}
.matrice.editable select {
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.1rem 0.25rem;
  font-size: 0.72rem;
  background: #fff;
}
.matrice.editable tr.tenu td {
  background: #f4f4f7;
  color: #999;
}
.matrice.editable tr.tenu select:disabled {
  background: #f0f0f0;
  color: #999;
  cursor: not-allowed;
}
.cadenas {
  margin-left: 0.3rem;
  font-size: 0.75rem;
}
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
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.15rem 0.35rem;
  font-size: 0.82rem;
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
.debug {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 0.75rem;
  background: #fafafe;
}
.debug h3 {
  margin: 0 0 0.6rem;
  font-size: 0.95rem;
}
.debug .vide {
  color: #aaa;
  font-size: 0.85rem;
}
.debug ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.debug li {
  border: 1px solid #e5e5ef;
  border-radius: 6px;
  padding: 0.4rem 0.5rem;
  background: #fff;
}
.debug li.orph {
  border-color: #e0a03a;
  background: #fff8ec;
}
.l1 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.l1 code {
  font-size: 0.8rem;
  color: #333;
}
.pos {
  color: #999;
  font-size: 0.75rem;
  font-family: monospace;
}
.x {
  margin-left: auto;
  border: none;
  background: none;
  color: #c33;
  cursor: pointer;
  font-size: 0.85rem;
}
.l2 {
  margin-top: 0.2rem;
  font-size: 0.8rem;
}
.extrait {
  color: #555;
}
.tag-orph {
  color: #b06e0f;
  font-weight: 600;
  font-size: 0.75rem;
}
</style>
