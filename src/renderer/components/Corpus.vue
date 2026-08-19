<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import AjoutEntretien from './AjoutEntretien.vue'
import EditionThemes from './EditionThemes.vue'
import PasAPas from './PasAPas.vue'
import { utiliserSonal } from '../composables/sonal'
import { rechercherDansCorpsTexte } from '../corpus/recherche'
import type { OccurenceRecherche, ResultatRecherche } from '../corpus/recherche'
import type { SegmentThematique } from '../../shared/format'
// Icônes d'onglets (parité vue Entretien) — thèmes = logocat, recherche = logosearch.
import icoThemes from '../assets/icones/logocat.png'
import icoRecherche from '../assets/icones/logosearch.png'

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
// Onglet de la colonne gauche : « Thèmes » par défaut, « Recherche » (texte
// plein corpus, parité SonalPi), « Pas à pas » en mode démo.
const ongletCorpus = ref<'themes' | 'recherche' | 'pas-a-pas'>('themes')
// Quand le mode pas-à-pas s'active, bascule l'onglet sur « Pas à pas ».
watch(pasAPas, (v) => {
  if (v) ongletCorpus.value = 'pas-a-pas'
})

// --- ONGLET RECHERCHE : texte plein CORPUS (parité SonalPi rechercherDansCorpus) ---
const requete = ref('')
const motEntier = ref(false)
const resultats = ref<ResultatRecherche[]>([])
const enCours = ref(false)
const message = ref('')
/** Marqueurs pour le « mur » de waveforms (carte par entretien) : le % divisé
 *  par l'axe caractères de chaque occurrence + le contexte affiché si on clic.
 *  Le clic N'ouvre PAS l'entretien (subtilité SonalPi) : il reste en vue Corpus
 *  et affiche l'extrait dans le panneau de gauche. */
const marqueursRecherche = computed(() => {
  const out: Record<string, Array<OccurenceRecherche>> = {}
  for (const r of resultats.value) out[r.id] = r.occurrences
  return out
})
/** L'extrait d'entretien affiché après le clic sur une barre du mur. */
const extraitAffiche = ref<{ id: string; titre: string; pre: string; match: string; post: string; pos: number } | null>(null)
function afficherExtrait(id: string, o: OccurenceRecherche) {
  const r = resultats.value.find((x) => x.id === id)
  extraitAffiche.value = { id, titre: r?.titre ?? id, pre: o.pre, match: o.match, post: o.post, pos: o.pos }
}
/** Lance la recherche : lit chaque entretien, extrait les occurrences (contexte
 *  ±15 mots + position PM), groupe par entretien. Cliquer = ouvrir l'entretien. */
async function lancerRecherche() {
  const q = requete.value.trim()
  if (!q) return
  message.value = ''
  enCours.value = true
  resultats.value = []
  try {
    const res: ResultatRecherche[] = []
    for (const e of listeEntretiens()) {
      const lecture = await window.sonal.corpus.lireEntretien(e.id)
      if (!lecture.ok) continue
      const occurrences = rechercherDansCorpsTexte(lecture.data.corpsTexte, q, { motEntier: motEntier.value })
      if (occurrences.length) res.push({ id: e.id, titre: e.titre, occurrences })
    }
    resultats.value = res
    const nb = res.reduce((n, r) => n + r.occurrences.length, 0)
    message.value = nb
      ? `${nb} occurrence${nb > 1 ? 's' : ''} dans ${res.length} entretien${res.length > 1 ? 's' : ''}`
      : 'Aucune occurrence trouvée.'
  } finally {
    enCours.value = false
  }
}
function effacerRecherche() {
  requete.value = ''
  resultats.value = []
  message.value = ''
}
/** Cliquer une occurrence → ouvrir l'entretien et cale le texte sur le match
 *  (position PM, comme le clic sur un segment thématique). */
function allerOccurrence(id: string, pos: number) {
  ouvrirAuSegment(id, pos)
}

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
          <!-- Onglets de la colonne gauche (parité vue Entretien) : Thèmes /
               Recherche, + Pas à pas en mode démo. Toujours visibles. -->
          <nav class="onglets-corpus">
            <!-- En corpus DÉMO « Pas à pas », l'onglet arrive EN PREMIER (c'est
                 l'objectif du parcours) ; sinon Thèmes puis Recherche. -->
            <button v-if="pasAPas" :class="{ actif: ongletCorpus === 'pas-a-pas' }" @click="ongletCorpus = 'pas-a-pas'">
              Pas à pas
            </button>
            <button :class="{ actif: ongletCorpus === 'themes' }" title="Thèmes" @click="ongletCorpus = 'themes'">
              <img class="ico-onglet-corpus" :src="icoThemes" alt="" /> Thèmes
            </button>
            <button :class="{ actif: ongletCorpus === 'recherche' }" title="Recherche dans le corpus" @click="ongletCorpus = 'recherche'">
              <img class="ico-onglet-corpus" :src="icoRecherche" alt="" /> Recherche
            </button>
          </nav>

          <!-- Panneau EXtrait (clic sur une barre du mur de recherche) : reste
               en vue Corpus, affiche le contexte de l'occurrence + un bouton pour
               ouvrir l'entretien si besoin. Visible quel que soit l'onglet actif. -->
          <div v-if="extraitAffiche" class="panneau extrait">
            <div class="corpus-tete">
              <h3>Extrait</h3>
              <button class="mini" @click="extraitAffiche = null">✕</button>
            </div>
            <p class="extrait-ent">Entretien : <b>{{ extraitAffiche.titre }}</b></p>
            <p class="extrait-texte">
              <span class="pre">{{ extraitAffiche.pre }}</span>
              <span class="match">{{ extraitAffiche.match }}</span>
              <span class="post">{{ extraitAffiche.post }}</span>
            </p>
            <button class="mini" @click="ouvrirAuSegment(extraitAffiche.id, extraitAffiche.pos)">
              Ouvrir l’entretien ici →
            </button>
          </div>

          <!-- Onglet Thèmes : un entretien sélectionné → ses métadonnées (nom
               éditable + infos), sinon la consultation des thèmes. -->
          <div v-if="ongletCorpus === 'themes' && corpusSelId" class="panneau meta-ent">
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
          <aside v-else-if="ongletCorpus === 'themes'" class="panneau themes-corpus">
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

          <!-- Onglet Recherche : recherche plein texte sur TOUS les entretiens. -->
          <div v-else-if="ongletCorpus === 'recherche'" class="panneau recherche">
            <div class="corpus-tete">
              <h3>Recherche</h3>
            </div>
            <p class="aide-thm">Cherche dans le texte de tous les entretiens (insensible à la casse).</p>
            <div class="barre-recherche">
              <input
                class="req-recherche"
                v-model="requete"
                placeholder="Rechercher…"
                @keyup.enter="lancerRecherche"
              />
              <button class="btn-rech" :disabled="!requete.trim() || enCours" @click="lancerRecherche">
                {{ enCours ? '…' : 'Rechercher' }}
              </button>
            </div>
            <label class="opt-recherche" :class="{ coche: motEntier }">
              <input type="checkbox" v-model="motEntier" @change="lancerRecherche" />
              <span class="opt-lib">Mot entier</span>
            </label>
            <p class="opt-info-texte">Mot entier : seuls les mots exacts comptent — « le » trouve « le », mais pas « parle ».</p>
            <p v-if="message" class="rech-info">{{ message }}</p>

            <ul v-if="resultats.length" class="liste-rech-crp">
              <li v-for="r in resultats" :key="r.id" class="ent-rech">
                <div class="titre-ent-rech">Entretien : <b>{{ r.titre }}</b>
                  <span class="nb-rech">{{ r.occurrences.length }}</span>
                </div>
                <ul class="occ-rech">
                  <li v-for="(o, i) in r.occurrences" :key="i">
                    <button class="occ-rech-btn" title="Ouvrir l’entretien ici" @click="allerOccurrence(r.id, o.pos)">
                      <span class="pre">{{ o.pre }}</span>
                      <span class="match">{{ o.match }}</span>
                      <span class="post">{{ o.post }}</span>
                    </button>
                  </li>
                </ul>
              </li>
            </ul>
            <button v-if="resultats.length" class="effacer-rech" @click="effacerRecherche">✕ Effacer</button>
          </div>

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
                <!-- Forme d'onde de l'audio assigné ; sinon placeholder.
                     Dans les deux cas, le CALQUE du résumé thématique (parité SonalPi)se superpose :
                      un span par segment codé, positionné en % du TEXTE ;
                     clic = ouvrir l'entretien à cet endroit.
                     Layout SonalPi : nom À GAUCHE, onde À DROITE (les lignes empilées forment le « mur » d'ondes). -->
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
                  <!-- Marqueurs de RECHERCHE : une pastille par occurrence, à son
                       emplacement % (axe caractères, aligné sur le résumé). Clic =
                       RESTE en vue Corpus et affiche l'extrait dans le panneau de
                       gauche (subtilité SonalPi) — n'ouvre pas l'entretien. -->
                  <span
                    v-for="(m, mi) in marqueursRecherche[e.id] ?? []"
                    :key="'m' + mi"
                    class="occ-marqueur"
                    :style="{ left: m.pourcent + '%' }"
                    :title="'Afficher l’extrait — « ' + requete + ' »'"
                    @click.stop="afficherExtrait(e.id, m)"
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
  border: 1px solid #1565c0;
  background: #2e73d8;
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
/* --- Onglets colonne gauche (Thèmes / Recherche / Pas à pas) --- */
.onglets-corpus {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
}
.onglets-corpus button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
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
  color: #1565c0;
}
.ico-onglet-corpus {
  width: 15px;
  height: 15px;
  object-fit: contain;
  opacity: 0.6;
  flex: none;
}
.onglets-corpus button.actif .ico-onglet-corpus {
  opacity: 1;
}
/* --- Onglet Recherche : recherche plein texte du corpus (parité SonalPi) --- */
.barre-recherche {
  display: flex;
  gap: 0.35rem;
  margin-top: 0.4rem;
}
.req-recherche {
  flex: 1;
  min-width: 0;
  border: 1px solid #ccc;
  border-radius: 5px;
  padding: 0.25rem 0.4rem;
  font-size: 0.82rem;
}
.btn-rech {
  border: 1px solid #1565c0;
  background: #2e73d8;
  color: #fff;
  border-radius: 5px;
  padding: 0.25rem 0.7rem;
  font-size: 0.8rem;
  cursor: pointer;
  flex: none;
}
.btn-rech:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.opt-recherche {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.4rem;
  font-size: 0.78rem;
  color: #555;
  cursor: pointer;
  user-select: none;
}
.opt-recherche input {
  accent-color: #2e73d8;
  cursor: pointer;
}
.opt-recherche.coche .opt-lib {
  color: #1565c0;
  font-weight: 600;
}
.opt-info-texte {
  margin: 0.25rem 0 0;
  font-size: 0.72rem;
  color: #999;
  font-style: italic;
}
.rech-info {
  margin: 0.4rem 0 0;
  font-size: 0.78rem;
  color: #666;
}
/* Résultats groupés par entretien (parité SonalPi .liste-rech-crp / .occurence-rech) */
.liste-rech-crp {
  list-style: none;
  margin: 0.4rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.ent-rech {
  border: 1px solid #e5e5ef;
  border-radius: 6px;
  padding: 0.3rem 0.4rem;
  background: #fff;
}
.titre-ent-rech {
  font-size: 0.82rem;
  color: #333;
  margin-bottom: 0.25rem;
}
.nb-rech {
  font-size: 0.7rem;
  color: #999;
  font-family: monospace;
  margin-left: 0.3rem;
}
.occ-rech {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  max-height: 220px;
  overflow-y: auto;
}
.occ-rech-btn {
  width: 100%;
  text-align: left;
  border: 1px solid #eee;
  border-radius: 4px;
  background: #fafafe;
  padding: 0.25rem 0.35rem;
  font-size: 0.75rem;
  color: #444;
  cursor: pointer;
  line-height: 1.35;
}
.occ-rech-btn:hover {
  border-color: #2e73d8;
  background: #f0f6ff;
}
.occ-rech-btn .match {
  font-weight: 700;
  color: #1565c0;
  /* Espace VISUEL autour du match : les espaces du template sont des nœuds
     texte réduits à des blancs, que Vue supprime en mode condense — mieux vaut
     une marge (garantie) qu'un espace littéral (détruit à la compilation).
     0.3em ≈ la largeur d'un espace. */
  margin: 0 0.3em;
}
.effacer-rech {
  margin-top: 0.5rem;
  border: 1px dashed #bbb;
  border-radius: 5px;
  background: #fff;
  color: #666;
  cursor: pointer;
  padding: 0.15rem 0.5rem;
  font-size: 0.75rem;
  width: 100%;
}
.effacer-rech:hover {
  border-color: #2e73d8;
  color: #1565c0;
}
/* --- Panneau Extrait (clic sur une barre du mur de recherche) --- */
.extrait {
  border: 1px solid #dce4ef;
  background: #fafdff;
}
.extrait-ent {
  margin: 0.3rem 0 0;
  font-size: 0.8rem;
  color: #333;
}
.extrait-texte {
  margin: 0.4rem 0;
  border: 1px solid #e5e5ef;
  border-left: 3px solid #1565c0;
  border-radius: 4px;
  background: #fff;
  padding: 0.4rem 0.5rem;
  font-size: 0.82rem;
  color: #444;
  line-height: 1.45;
}
.extrait-texte .match {
  font-weight: 700;
  color: #1565c0;
  background: #fff3c4;
  padding: 0 0.15rem;
  /* Espaces VISUEL autour du match (les espaces du template sont détruits par
     le mode condense de Vue — marge garantie, cf. .occ-rech-btn .match). */
  margin: 0 0.3em;
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
  border-color: #2e73d8;
  background: #f0f6ff;
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
  border-radius: 3px; /* conserve le coin arrondi du cadre (overflow visible désormais) */
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
  /* overflow VISIBLE : les marqueurs de recherche dépassent au-dessus/en dessous
     du cadre (parité SonalPi .occurence-canvas). L'image .spectro, elle, est en
     absolute inset:0 → ne déborde jamais ; ses coins sont arrondis par son propre
     border-radius (ci-dessous) puisqu'on ne clippe plus ici. */
  overflow: visible;
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
/* Marqueur de RECHERCHE sur le « mur » d'ondes — parité SonalPi
   .occurence-canvas : barre JAUNE vif, tour ROUGE gras, qui dépasse un peu du
   cadre, bien visible. Centrée sur la position % de l'occurrence ; au survol,
   elle passe au rouge et s'épaissit (comme SonalPi). */
.occ-marqueur {
  position: absolute;
  top: -4px;
  bottom: -4px; /* dépasse un peu au-dessus ET en dessous du cadre */
  width: 4px;
  margin-left: -2px; /* centrée sur son % */
  background: rgb(254 255 0);
  border: 2px solid #ff0000; /* tour gras rouge */
  border-radius: 2px;
  cursor: pointer;
  z-index: 10;
  box-sizing: border-box;
}
.occ-marqueur:hover {
  background: rgb(255 0 0);
  width: 6px;
  margin-left: -3px;
  box-shadow: 0 0 4px rgba(255, 0, 0, 0.5);
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
