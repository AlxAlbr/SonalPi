<script setup lang="ts">
import { ref } from 'vue'
import AjoutEntretien from './AjoutEntretien.vue'
import EditionThemes from './EditionThemes.vue'
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
  // audio (S6)
  urlWaveform,
  assignerAudioSelection,
} = utiliserSonal()

// La fenêtre d'édition des thèmes (crayon, parité SonalPi) — locale à la vue.
const editerThemes = ref(false)

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
        <!-- Colonne GAUCHE : bascule Thèmes ⇄ Métadonnées de l'entretien sélectionné -->
        <aside class="colonne-g-corpus">
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
          <aside v-else class="panneau themes-corpus">
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
        </aside>

        <!-- Colonne DROITE (large) : entretiens en cartes ; à terme = spectrogramme -->
        <section class="colonne-d-corpus">
          <div class="corpus-tete">
            <h3>Entretiens</h3>
            <span class="actions-ent">
              <!-- Point de reprise (D-S11 rév.) : rouvre le dernier entretien
                   fermé là où on en était (texte + audio). -->
              <button v-if="reprise" class="btn-reprise" @click="reprendre">
                ↩ Reprendre « {{ membership[reprise.id]?.titre }} »
              </button>
              <!-- UN seul point d'entrée (S6 rev., à la SonalPi) : la modale à deux
                   zones couvre import texte, texte+audio, audio seul et vierge. -->
              <AjoutEntretien />
            </span>
          </div>
          <!-- Confirmation de suppression (acte destructif — mise en corbeille/,
               même idiome de bannière que thèmes D-S10 et locuteurs). -->
          <div v-if="entretienASupprimer" class="confirm-suppr">
            Supprimer « {{ entretienASupprimer.titre }} » ? L'entretien (et son audio) part dans
            <b>corbeille/</b> du dossier de corpus — il disparaît de l'application.
            <div class="confirm-actions">
              <button class="danger" @click="confirmerSuppressionEntretien">Supprimer</button>
              <button @click="entretienASupprimer = null">Annuler</button>
            </div>
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
              <div class="carte-corps">
                <div class="ent-titre">{{ e.titre }}</div>
                <!-- Forme d'onde de l'audio assigné (S6) ; sinon placeholder. Dans
                     les deux cas, le CALQUE du résumé thématique (parité SonalPi)
                     se superpose : un span par segment codé, positionné en % du
                     TEXTE ; clic = ouvrir l'entretien à cet endroit. -->
                <div class="spectro-cadre">
                  <img v-if="urlWaveform(e.id)" class="spectro" :src="urlWaveform(e.id)!" alt="" draggable="false" />
                  <div v-else class="spectro-vide">pas d'audio — importe un SRT + audio, ou « Assigner un audio »</div>
                  <span
                    v-for="(s, i) in resumes[e.id] ?? []"
                    :key="i"
                    class="xtr-graph"
                    :style="styleSegment(s)"
                    :title="s.codes.map(nomTheme).join(' + ')"
                    @click.stop="ouvrirAuSegment(e.id, s.pos)"
                  ></span>
                </div>
              </div>
              <div class="carte-actions">
                <button class="crayon" title="Éditer l'entretien" @click.stop="ouvrirEntretien(e.id)">✏️</button>
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
  align-items: stretch;
  gap: 0.5rem;
  border: 1px solid #e0e0ea;
  border-radius: 8px;
  padding: 0.5rem 0.6rem;
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
.carte-corps {
  flex: 1;
  min-width: 0;
}
.ent-titre {
  font-size: 0.9rem;
  font-weight: 600;
  margin-bottom: 0.35rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.spectro {
  display: block;
  width: 100%;
  height: 46px;
  object-fit: fill;
  border: 1px solid #e3e8e3;
  border-radius: 5px;
  background: #fff;
}
/* Cadre de superposition du résumé thématique (les .xtr-graph se positionnent
   en % de SA largeur — la même que l'onde ou le placeholder). */
.spectro-cadre {
  position: relative;
}
.xtr-graph {
  position: absolute;
  top: 1px;
  bottom: 1px;
  opacity: 0.45; /* translucide : l'onde reste lisible sous la couleur */
  cursor: pointer;
  box-sizing: border-box;
  border-radius: 2px;
}
.xtr-graph:hover {
  opacity: 0.8;
}
.assigner-audio {
  margin-top: 0.6rem;
  width: 100%;
}
.spectro-vide {
  height: 46px;
  border: 1px dashed #d8d8e0;
  border-radius: 5px;
  background: repeating-linear-gradient(90deg, #f6f6fa 0 6px, #fafafe 6px 12px);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.68rem;
  color: #b3b3c0;
  font-style: italic;
}
.carte-actions {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
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
