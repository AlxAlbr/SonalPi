<script setup lang="ts">
import { ref, watch } from 'vue'
import AjoutEntretien from './AjoutEntretien.vue'
import EditionThemes from './EditionThemes.vue'
import PasAPas from './PasAPas.vue'
import { utiliserSonal } from '../composables/sonal'
import type { SegmentThematique } from '../../shared/format'

const {
  // thèmes (codebook corpus) — CONSULTATION ; l'édition passe par la modale (crayon)
  codebook,
  usages,
  couleurHex,
  peintureSegment,
  nomTheme,
  arbreThemes,
  resumes,
  ouvrirAuSegment,
  // entretiens (membership) + sélection Corpus
  membership,
  reprise,
  reprendre,
  corpusSelId,
  corpusSelMeta,
  selectionnerCorpus,
  deselectionnerCorpus,
  ouvrirEntretien,
  renommer,
  entretienASupprimer,
  demanderSuppressionEntretien,
  confirmerSuppressionEntretien,
  allerDonnees,
  listeEntretiens,
  // audio
  urlWaveform,
  assignerAudioSelection,
  // Intégrité : audios référencés introuvables (fichier déplacé/supprimé)
  audiosManquants,
  // démo pas-à-pas
  pasAPas,
} = utiliserSonal()

// La fenêtre d'édition des thèmes (crayon, parité SonalPi) — locale à la vue.
const editerThemes = ref(false)
// Onglet de la colonne gauche : « Thèmes » par défaut, « Pas à pas » en mode
// démo. Les métadonnées d'un entretien sélectionné conservent leur affichage
// (bascule existante, hors onglet pour l'instant).
const ongletCorpus = ref<'themes' | 'pas-a-pas'>('themes')
// Quand le mode pas-à-pas s'active, bascule l'onglet sur « Pas à pas ».
watch(pasAPas, (v) => {
  if (v) ongletCorpus.value = 'pas-a-pas'
})

/** Style d'un segment du calque des cartes : position/largeur en % du TEXTE
 *  (parité SonalPi), peinture partagée `peintureSegment` (useCorpus). */
function styleSegment(s: SegmentThematique): Record<string, string> {
  const p = peintureSegment(s.codes)
  const style: Record<string, string> = {
    left: s.deb + '%',
    width: s.fin - s.deb + '%',
  }
  if (p.background) style.background = p.background
  if (p.borderBottom) style.borderBottom = p.borderBottom
  if (p.masque) style.display = 'none'
  return style
}
</script>

<template>
    <section class="ecran corpus-ecran">
      <!-- Barre haute : accès à la base de données (comme SonalPi) -->
      <div class="corpus-barre">
        <button class="btn-table" @click="allerDonnees">Ouvrir la base de données →</button>
      </div>

      <div class="grille-corpus">
        <!-- Colonne GAUCHE : onglets Thèmes / Pas à pas, puis bascule
             Thèmes ⇄ Métadonnées de l'entretien sélectionné -->
        <aside class="colonne-g-corpus">
          <!-- Onglets (seulement en mode pas-à-pas ; sinon Thèmes seul) -->
          <nav v-if="pasAPas" class="onglets-corpus">
            <button :class="{ actif: ongletCorpus === 'themes' }" @click="ongletCorpus = 'themes'">
              Thèmes
            </button>
            <button :class="{ actif: ongletCorpus === 'pas-a-pas' }" @click="ongletCorpus = 'pas-a-pas'">
              Pas à pas
            </button>
          </nav>

          <!-- Un entretien est sélectionné → ses métadonnées (nom éditable + infos) -->
          <div v-if="corpusSelId" class="panneau meta-ent">
            <div class="corpus-tete">
              <h3>Entretien</h3>
              <button class="mini" @click="deselectionnerCorpus">← Thèmes</button>
            </div>
            <label class="champ-nom">
              <span class="champ-lbl">Nom</span>
              <input
                class="titre-meta"
                :value="membership[corpusSelId]?.titre"
                @change="renommer(corpusSelId, $event)"
              />
            </label>
            <ul v-if="corpusSelMeta" class="meta-infos">
              <li><span>Locuteurs</span><b>{{ corpusSelMeta.nbLocuteurs }}</b></li>
              <li><span>Valeurs saisies</span><b>{{ corpusSelMeta.nbValeurs }}</b></li>
              <li><span>Audio</span><b>{{ corpusSelMeta.audio ? 'lié' : '—' }}</b></li>
            </ul>
            <p v-else class="vide">Lecture…</p>
            <button class="mini assigner-audio" @click="assignerAudioSelection">
              {{ corpusSelMeta?.audio ? 'Remplacer l’audio…' : 'Assigner un audio…' }}
            </button>
          </div>

          <!-- Sinon : thèmes en CONSULTATION compacte ; le crayon ouvre la fenêtre
               d'édition partagée (parité SonalPi — nom/couleur/taille/arbre). -->
          <aside v-else v-show="ongletCorpus === 'themes' || !pasAPas" class="panneau themes-corpus">
            <div class="corpus-tete">
              <h3>Thèmes</h3>
              <button class="crayon" title="Éditer les thèmes" @click="editerThemes = true">✏️</button>
            </div>
            <p class="aide-thm">Le codage se fait au niveau des entretiens</p>
            <p v-if="codebook.length === 0" class="vide">Aucun thème — ✏️ pour en créer.</p>
            <ul class="liste-thm-lecture">
              <li
                v-for="n in arbreThemes()"
                :key="n.cat.id"
                :class="{ inactif: !n.cat.actif }"
                :style="{ paddingLeft: n.profondeur * 1.1 + 'rem' }"
              >
                <span class="pastille" :style="{ background: couleurHex(n.cat) }"></span>
                <span class="nom-thm-lecture">{{ n.cat.nom }}</span>
                <span class="usage" :title="`${usages[n.cat.id] ?? 0} codage(s)`">{{ usages[n.cat.id] ?? 0 }}</span>
              </li>
            </ul>
          </aside>

          <!-- Pas à pas (onglet démo) : liste des étapes + spotlight global
               (téléporté en body → visible dans n'importe quelle vue). La liste
               est masquée selon l'onglet, le spotlight reste actif partout. -->
          <PasAPas v-if="pasAPas" :montre-liste="ongletCorpus === 'pas-a-pas'" />
        </aside>

        <!-- Colonne DROITE (large) : entretiens en cartes ; à terme = spectrogramme -->
        <section class="colonne-d-corpus">
          <div class="corpus-tete">
            <h3>Entretiens</h3>
            <span class="actions-ent">
              <!-- Point de reprise : rouvre le dernier entretien
                   fermé là où on en était (texte + audio). -->
              <button v-if="reprise" class="btn-reprise" @click="reprendre">
                ↩ Reprendre « {{ membership[reprise.id]?.titre }} »
              </button>
              <!-- UN seul point d'entrée (à la SonalPi) : la modale à deux
                   zones couvre import texte, texte+audio, audio seul et vierge. -->
              <AjoutEntretien />
            </span>
          </div>
          <!-- Ancre du message « re-test » du pas-à-pas : pour une étape de
               niveau CORPUS (ex. « Charger un entretien »), le message « déjà
               réalisée » s'affiche ici — à côté des cartes d'entretiens — et
               non dans l'éditeur. -->
          <div data-tour="ancre-retest-pp"></div>
          <!-- Confirmation de suppression (acte destructif — mise en corbeille/,
               même idiome de bannière que thèmes et locuteurs). -->
          <div v-if="entretienASupprimer" class="confirm-suppr">
            Supprimer « {{ entretienASupprimer.titre }} » ? L'entretien (et son audio) part dans
            <b>corbeille/</b> du dossier de corpus — il disparaît de l'application.
            <div class="confirm-actions">
              <button class="danger" @click="confirmerSuppressionEntretien">Supprimer</button>
              <button @click="entretienASupprimer = null">Annuler</button>
            </div>
          </div>

          <!-- Bandeau d'intégrité : des audios référencés sont introuvables
               (fichier déplacé/supprimé). Calculé à l'ouverture du corpus ;
               clic = ouvrir l'entretien → le lecteur propose de ré-assigner. -->
          <div v-if="Object.keys(audiosManquants).length > 0" class="bandeau-audio" data-tour="bandeau-audio">
            <span class="bandeau-audio-titre">
              ⚠️ {{ Object.keys(audiosManquants).length }} fichier(s) audio introuvable(s) — déplacé(s) ou supprimé(s) ?
            </span>
            <ul class="bandeau-audio-liste">
              <li v-for="id in Object.keys(audiosManquants)" :key="id">
                <button class="bandeau-audio-ent" @click="ouvrirEntretien(id)">
                  {{ membership[id]?.titre ?? id }}
                </button>
              </li>
            </ul>
          </div>

          <p v-if="listeEntretiens().length === 0" class="vide">Aucun entretien — « + Ajouter un entretien ».</p>
          <ul class="cartes-ent">
            <li
              v-for="e in listeEntretiens()"
              :key="e.id"
              class="carte-ent"
              :class="{ selection: corpusSelId === e.id }"
              @click="selectionnerCorpus(e.id)"
            >
              <div class="ent-titre" :title="e.titre">{{ e.titre }}</div>
                <!-- Forme d'onde de l'audio assigné ; sinon placeholder. Dans
                     les deux cas, le CALQUE du résumé thématique (parité SonalPi)
                     se superpose : un span par segment codé, positionné en % du
                     TEXTE ; clic = ouvrir l'entretien à cet endroit. Layout
                     SonalPi : nom À GAUCHE, onde À DROITE (les lignes empilées
                     forment le « mur » d'ondes). -->
                <div class="spectro-cadre">
                  <img v-if="urlWaveform(e.id)" class="spectro" :src="urlWaveform(e.id)!" alt="" draggable="false" />
                  <div v-else class="spectro-vide" title="Importe un SRT + audio, ou « Assigner un audio »">pas d'audio</div>
                  <span
                    v-for="(s, i) in resumes[e.id] ?? []"
                    :key="i"
                    class="xtr-graph"
                    :style="styleSegment(s)"
                    :title="s.codes.map(nomTheme).join(' + ')"
                    @click.stop="ouvrirAuSegment(e.id, s.pos)"
                  ></span>
                </div>
              <div class="carte-actions">
                <button
                  class="crayon"
                  data-tour="crayon-entretien"
                  title="Éditer l'entretien"
                  @click.stop="ouvrirEntretien(e.id)"
                >✏️</button>
                <button class="suppr" title="Supprimer (corbeille)" @click.stop="demanderSuppressionEntretien(e.id)">✕</button>
              </div>
            </li>
          </ul>
        </section>
      </div>

      <EditionThemes v-if="editerThemes" contexte="corpus" @fermer="editerThemes = false" />
    </section>
</template>

<style scoped>
.actions-ent {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.corpus-barre {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.8rem;
}
.btn-table {
  padding: 0.4rem 0.9rem;
  border: 1px solid #2e7d32;
  background: #2e9e3f;
  color: #fff;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
}
.grille-corpus {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 1rem;
  align-items: start;
}
/* --- Onglets colonne gauche (Thèmes / Pas à pas) --- */
.onglets-corpus {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
}
.onglets-corpus button {
  flex: 1;
  border: 1px solid #ddd;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  background: #f0f0f5;
  padding: 0.3rem 0.2rem;
  font-size: 0.78rem;
  cursor: pointer;
}
.onglets-corpus button.actif {
  background: #fff;
  font-weight: 600;
  color: #2e7d32;
}
/* --- Colonne gauche : métadonnées de l'entretien sélectionné --- */
.meta-ent .champ-nom {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  margin: 0.4rem 0;
}
.champ-lbl {
  font-size: 0.72rem;
  color: #888;
}
.titre-meta {
  border: 1px solid #ccc;
  border-radius: 5px;
  padding: 0.3rem 0.4rem;
  font-size: 0.9rem;
}
.meta-infos {
  list-style: none;
  margin: 0.6rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.meta-infos li {
  display: flex;
  justify-content: space-between;
  font-size: 0.82rem;
  border-bottom: 1px dashed #eee;
  padding-bottom: 0.2rem;
}
.meta-infos li span {
  color: #666;
}
/* --- Colonne droite : entretiens en cartes --- */
/* Bandeau d'intégrité (audio référencé introuvable) : informe, n'empêche
   rien — on ne bloque jamais l'app pour un média manquant. */
.bandeau-audio {
  border: 1px solid #f3b4ad;
  background: #fdecea;
  border-radius: 8px;
  padding: 0.45rem 0.6rem;
  margin-top: 0.5rem;
  font-size: 0.8rem;
  color: #b3261e;
}
.bandeau-audio-titre {
  display: block;
  font-weight: 600;
}
.bandeau-audio-liste {
  list-style: none;
  margin: 0.35rem 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.bandeau-audio-ent {
  border: 1px solid #e0a0a0;
  background: #fff;
  color: #b3261e;
  border-radius: 5px;
  padding: 0.15rem 0.5rem;
  font-size: 0.78rem;
  cursor: pointer;
}
.bandeau-audio-ent:hover {
  border-color: #b3261e;
}
.cartes-ent {
  list-style: none;
  margin: 0.4rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.carte-ent {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid #e0e0ea;
  border-radius: 6px;
  padding: 0.3rem 0.5rem;
  background: #fff;
  cursor: pointer;
}
.carte-ent:hover {
  border-color: #b9c7bb;
}
.carte-ent.selection {
  border-color: #2e9e3f;
  background: #f3fbf4;
}
.ent-titre {
  /* Nom À GAUCHE, largeur fixe (parité SonalPi .lbl-nom-ent 27 %) — les ondes
     empilées forment une colonne régulière (« mur » visuel). */
  width: 27%;
  flex-shrink: 0;
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.spectro {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover; /* parité SonalPi (.ligent-img) : pas de distorsion */
}
/* Cadre de superposition du résumé thématique (les .xtr-graph se positionnent
   en % de SA largeur — la même que l'onde ou le placeholder). Conteneur
   compact à la SonalPi : 25 px de haut, dégradé vertical (creux au centre),
   bord fin — c'est lui qui donne la profondeur au « mur » d'ondes. */
.spectro-cadre {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 25px;
  border-radius: 3px;
  border: 1px solid #cbcbcb;
  background: linear-gradient(#00000040 0%, #fbf5f560 50%, #00000040 100%);
  overflow: hidden;
}
.xtr-graph {
  position: absolute;
  top: 1px;
  bottom: 1px;
  opacity: 0.55; /* parité SonalPi : la couleur reste celle du thème MAIS l'onde reste lisible dessous */
  cursor: pointer;
  box-sizing: border-box;
  border-radius: 2px;
}
.xtr-graph:hover {
  opacity: 0.8; /* survol SonalPi : le segment s'affirme (clic = rouvrir au texte) */
  border: 1px solid #030303;
}
.assigner-audio {
  margin-top: 0.6rem;
  width: 100%;
}
.spectro-vide {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.66rem;
  color: #9a9aa8;
  font-style: italic;
}
.carte-actions {
  display: flex;
  gap: 0.25rem;
  align-items: center;
  flex: none;
}
/* .crayon : style GLOBAL (base.css) — partagé avec l'écran Entretien. */
.suppr {
  border: none;
  background: none;
  color: #c33;
  cursor: pointer;
  font-size: 0.8rem;
}
/* --- Thèmes en consultation (l'édition vit dans la modale EditionThemes) --- */
.liste-thm-lecture {
  list-style: none;
  margin: 0.3rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.liste-thm-lecture li {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.15rem 0.15rem;
}
.liste-thm-lecture li.inactif {
  opacity: 0.5;
}
.pastille {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex: none;
  border: 1px solid rgba(0, 0, 0, 0.15);
}
.nom-thm-lecture {
  flex: 1;
  min-width: 0;
  font-size: 0.82rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.usage {
  font-size: 0.72rem;
  color: #888;
  font-family: monospace;
  min-width: 1.1rem;
  text-align: right;
}
</style>
