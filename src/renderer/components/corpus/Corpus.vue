<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import AjoutEntretien from './AjoutEntretien.vue'
import EditionThemes from '../themes/EditionThemes.vue'
import MenuTheme from '../themes/MenuTheme.vue'
import PasAPas from './PasAPas.vue'
import PseudonymisationCorpus from './PseudonymisationCorpus.vue'
import PersonnesCorpus from './PersonnesCorpus.vue'
import NotesCorpus from './NotesCorpus.vue'
import PanneauJournalCorpus from './PanneauJournalCorpus.vue'
import TableDonnees from '../donnees/TableDonnees.vue'
import { utiliserSonal } from '../../composables/sonal'
import { rechercherDansCorpsTexte } from '../../editor/rechercheCorpus'
import { visiblesThemes } from '../../../shared/corpus/categories'
import type { OccurenceRecherche, ResultatRecherche } from '../../editor/rechercheCorpus'
import type { SegmentThematique } from '../../../shared/format'
// Icônes des onglets, partagées avec la vue Entretien.
import icoThemes from '../../assets/icones/themes.png'
import icoDonnees from '../../assets/icones/donnees.png'
import icoAnon from '../../assets/icones/anon.png'
import icoMaison from '../../assets/icones/maison.png'
import icoJournal from '../../assets/icones/journal.png'
// Icônes des onglets, spécifiques au Corpus.
import icoPersonnes from '../../assets/icones/personnes.png'
import icoNotes from '../../assets/icones/notes.png'
import icoPasAPas from '../../assets/icones/pas-a-pas.svg'

const {
  vue,
  // thèmes (codebook corpus) — CONSULTATION ; l'édition passe par la modale (crayon)
  codebook,
  usages,
  couleurHex,
  peintureSegment,
  nomTheme,
  arbreThemes,
  modifierTheme,
  resumes,
  ouvrirAuSegment,
  // entretiens (membership) + sélection Corpus.
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
  rafraichirMatrice,
  listeEntretiens,
  // audio.
  urlWaveform,
  assignerAudioSelection,
  ouvrirDesignationAudio,
  // audio : détacher / remplacer / assigner un SRT (panneau métadonnées)
  effacerAudioSelection,
  demanderSrt,
  confirmerSrt,
  srtASurEcrire,
  srtMessage,
  // Intégrité : audios référencés introuvables (fichier déplacé/supprimé)
  audiosManquants,
  // démo pas-à-pas.
  pasAPas,
  // Corpus distant : synchro (barre haute) + lecture seule (grisage)
  idDistantCourant,
  dernierTirage,
  tirageEnCours,
  actualiserDistant,
  lectureSeule,
  // Badges de verrou fiables (état « tenu par X » venant du serveur)
  badgeVerrou,
  metaEditables,
  presencesSur,
} = utiliserSonal()

/** Heure locale courte d'un horodatage ISO (« HH:MM »). */
const heureDe = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
/** Infobulle des champs du panneau méta : si l'entretien est tenu par autrui,
 *  on explique pourquoi tout est grisé (même vocabulaire que les badges 🔒). */
function titreChampMeta(id: string): string {
  const v = badgeVerrou(id)
  return v
    ? `Ouvert par ${v.userId} — lecture seule.`
    : 'lecture seule (corpus distant)'
}
/** Infobulle du bouton crayon/verrou d'une carte ;
 *  si l'entretien est tenu par autrui, le détail (qui ? depuis quand ?
 *  conséquence) ; sinon le geste normal. */
const titreCrayon = (id: string): string => {
  const v = badgeVerrou(id)
  return v
    ? `Verrou tenu par ${v.userId} depuis ${heureDe(v.acquiredAt)} — ouverture en lecture seule.`
    : 'Éditer l’entretien'
}
/** « Actualiser » : tire le miroir à la demande ;
 *  les erreurs crient, ce n'est pas la minuterie silencieuse. */
async function actualiser() {
  try {
    await actualiserDistant(false)
  } catch {
    /* l'échec criant est traité comme un pull doux raté pour l'instant :
       le badge horodaté reste sur la dernière synchro réussie */
  }
}

// La fenêtre d'édition des thèmes (crayon) — locale à la vue.
const editerThemes = ref(false)
// Menu contextuel d'un THÈME (actif ↔ passif sans ouvrir l'édition),
// sur la consultation du Corpus comme sur le panneau Entretien.
const menuTheme = ref<{ id: string; nom: string; x: number; y: number; actif: boolean } | null>(null)
/** Ouvre le menu au clic droit sur un thème (masqué en lecture seule). */
function ouvrirMenuTheme(cat: { id: string; nom: string; actif: boolean }, evt: MouseEvent) {
  if (lectureSeule.value) return
  menuTheme.value = { id: cat.id, nom: cat.nom, x: evt.clientX, y: evt.clientY, actif: cat.actif }
}
/** Bascule actif → passif (ou l'inverse), puis ferme le menu. */
function basculerActifTheme() {
  const m = menuTheme.value
  if (m) modifierTheme(m.id, { actif: !m.actif })
  menuTheme.value = null
}
// Repli des sous-thèmes dans la consultation : état de VUE local,
// jamais persisté, indépendant par écran ;
// les catégories repliées restent visibles.
const repliesThemes = ref<Set<string>>(new Set())
const arbreVisible = computed(() => visiblesThemes(arbreThemes(), repliesThemes.value))
function basculerRepli(id: string) {
  const s = new Set(repliesThemes.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  repliesThemes.value = s
}

type OngletCorpus = 'accueil' | 'themes' | 'recherche' | 'personnes' | 'notes' | 'donnees' | 'anon' | 'journal' | 'pas-a-pas'
const ongletCorpus = ref<OngletCorpus>('accueil')
const pseudonymisation = ref<InstanceType<typeof PseudonymisationCorpus> | null>(null)
async function choisirOnglet(onglet: OngletCorpus) {
  if (ongletCorpus.value === 'anon' && onglet !== 'anon' && !(await pseudonymisation.value?.autoriserSortie())) return
  if (ongletCorpus.value === onglet) return
  deselectionnerCorpus()
  extraitAffiche.value = null
  ongletCorpus.value = onglet
  if (onglet === 'donnees') await rafraichirMatrice()
}
watch(pasAPas, (v) => {
  if (v) void choisirOnglet('pas-a-pas')
})

// Recherche plein texte du corpus, accessible au clavier.
const champRecherche = ref<HTMLInputElement | null>(null)
let ongletAvantRecherche: OngletCorpus = 'accueil'
async function ouvrirRecherche() {
  const precedent = ongletCorpus.value
  await choisirOnglet('recherche')
  if (ongletCorpus.value !== 'recherche') return
  if (precedent !== 'recherche') ongletAvantRecherche = precedent
  deselectionnerCorpus()
  await nextTick()
  champRecherche.value?.focus()
  champRecherche.value?.select()
}
function fermerRecherche() {
  void choisirOnglet(ongletAvantRecherche)
}
function raccourciRecherche(event: KeyboardEvent) {
  if (vue.value !== 'corpus' || event.defaultPrevented) return
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    void ouvrirRecherche()
  } else if (event.key === 'Escape' && ongletCorpus.value === 'recherche') {
    event.preventDefault()
    fermerRecherche()
  }
}
onMounted(() => window.addEventListener('keydown', raccourciRecherche))
onUnmounted(() => window.removeEventListener('keydown', raccourciRecherche))
const requete = ref('')
const motEntier = ref(false)
const resultats = ref<ResultatRecherche[]>([])
const enCours = ref(false)
const message = ref('')
/** Marqueurs pour le « mur » de waveforms (carte par entretien) :
 *  le % divisé par l'axe caractères de chaque occurrence, + le contexte
 *  affiché si on clic. Le clic N'ouvre PAS l'entretien : il reste en vue
 *  Corpus et affiche l'extrait dans le panneau de gauche. */
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
/** Lance la recherche : lit chaque entretien et extrait ses occurrences,
 *  avec contexte ±15 mots + position PM, puis groupe par entretien.
 *  Cliquer = ouvrir l'entretien. */
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
/** Cliquer une occurrence → ouvrir l'entretien et cale le texte sur le match,
 *  position PM (comme le clic sur un segment thématique). */
function allerOccurrence(id: string, pos: number) {
  ouvrirAuSegment(id, pos)
}
/** Libellé de l'onglet actif, pour le bouton retour « ← … » du panneau métadonnées,
 *  affiché quel que soit l'onglet dès qu'un entretien est sélectionné. */
const libelleOnglet = computed(() =>
  ongletCorpus.value === 'accueil'
    ? 'Accueil'
    : ongletCorpus.value === 'recherche'
    ? 'Recherche'
    : ongletCorpus.value === 'journal'
      ? 'Journal'
      : ongletCorpus.value === 'pas-a-pas'
        ? 'Pas à pas'
        : 'Thèmes',
)

/** Style d'un segment du calque des cartes : position/largeur en % du TEXTE,
 *  peinture partagée `peintureSegment` (useCorpus). */
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
      <!-- Corpus distant : horodatage du dernier pull + « Actualiser ».
           Le pull rafraîchit aussi les badges de verrou. -->
      <div v-if="idDistantCourant" class="corpus-barre">
        <span class="synchro-zone">
          <span class="dernier-tirage" title="Copie locale synchronisée avec le serveur">
            ☁ dernière synchro {{ heureDe(dernierTirage) }}
          </span>
          <button class="btn-table" :disabled="tirageEnCours" @click="actualiser">
            {{ tirageEnCours ? '…' : '⟳ Actualiser' }}
          </button>
        </span>
      </div>

      <nav class="onglets-corpus" aria-label="Navigation du corpus">
        <button :class="{ actif: ongletCorpus === 'accueil' }" title="Accueil" aria-label="Accueil" :aria-current="ongletCorpus === 'accueil' ? 'page' : undefined" @click="choisirOnglet('accueil')"><img class="ico-onglet-corpus" :src="icoMaison" alt="" /></button>
        <button :class="{ actif: ongletCorpus === 'notes' }" title="Notes" aria-label="Notes" :aria-current="ongletCorpus === 'notes' ? 'page' : undefined" @click="choisirOnglet('notes')"><img class="ico-onglet-corpus" :src="icoNotes" alt="" /></button>
        <button :class="{ actif: ongletCorpus === 'personnes' }" title="Personnes" aria-label="Personnes" :aria-current="ongletCorpus === 'personnes' ? 'page' : undefined" @click="choisirOnglet('personnes')"><img class="ico-onglet-corpus" :src="icoPersonnes" alt="" /></button>
        <button :class="{ actif: ongletCorpus === 'anon' }" title="Pseudonymisation" aria-label="Pseudonymisation" :aria-current="ongletCorpus === 'anon' ? 'page' : undefined" @click="choisirOnglet('anon')"><img class="ico-onglet-corpus" :src="icoAnon" alt="" /></button>
        <button :class="{ actif: ongletCorpus === 'themes' }" title="Thèmes" aria-label="Thèmes" :aria-current="ongletCorpus === 'themes' ? 'page' : undefined" @click="choisirOnglet('themes')"><img class="ico-onglet-corpus" :src="icoThemes" alt="" /></button>
        <button :class="{ actif: ongletCorpus === 'donnees' }" title="Données" aria-label="Données" :aria-current="ongletCorpus === 'donnees' ? 'page' : undefined" @click="choisirOnglet('donnees')"><img class="ico-onglet-corpus" :src="icoDonnees" alt="" /></button>
        <button data-onglet="journal" :class="{ actif: ongletCorpus === 'journal' }" title="Journal" aria-label="Journal" :aria-current="ongletCorpus === 'journal' ? 'page' : undefined" @click="choisirOnglet('journal')"><img class="ico-onglet-corpus" :src="icoJournal" alt="" /></button>
        <button v-if="pasAPas" :class="{ actif: ongletCorpus === 'pas-a-pas' }" title="Pas à pas" aria-label="Pas à pas" :aria-current="ongletCorpus === 'pas-a-pas' ? 'page' : undefined" @click="choisirOnglet('pas-a-pas')"><img class="ico-onglet-corpus" :src="icoPasAPas" alt="" /></button>
      </nav>

      <div v-show="ongletCorpus !== 'anon' && ongletCorpus !== 'donnees' && ongletCorpus !== 'personnes' && ongletCorpus !== 'notes'" class="grille-corpus">
        <!-- Colonne GAUCHE : onglets Thèmes / Pas à pas,
             puis bascule Thèmes ⇄ Métadonnées de l'entretien sélectionné -->
        <aside class="colonne-g-corpus">
          <!-- Onglets de la colonne gauche : Thèmes / Recherche,
               + Pas à pas en mode démo, toujours visibles. -->


          <!-- Panneau EXtrait (clic sur une barre du mur de recherche) :
               reste en vue Corpus, affiche le contexte de l'occurrence ;
               bouton pour ouvrir l'entretien si besoin.
               Visible quel que soit l'onglet actif. -->
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

          <!-- Entretien sélectionné → ses métadonnées (nom éditable + infos).
               Indépendant de l'onglet actif : visible sur Thèmes, Recherche et
               Pas à pas ; le bouton retour referme la sélection et rend son
               panneau à l'onglet en cours. -->
          <div v-if="corpusSelId" class="panneau meta-ent">
            <div class="corpus-tete">
              <h3>Entretien</h3>
              <button class="mini" @click="deselectionnerCorpus">← {{ libelleOnglet }}</button>
            </div>
            <label class="champ-nom">
              <span class="champ-lbl">Nom</span>
              <input
                class="titre-meta"
                :value="membership[corpusSelId]?.titre"
                :disabled="!metaEditables(corpusSelId)"
                :title="titreChampMeta(corpusSelId)"
                @change="renommer(corpusSelId, $event)"
              />
            </label>
            <ul v-if="corpusSelMeta" class="meta-infos">
              <li><span>Locuteurs</span><b>{{ corpusSelMeta.nbLocuteurs }}</b></li>
              <li><span>Valeurs saisies</span><b>{{ corpusSelMeta.nbValeurs }}</b></li>
              <li><span>Audio</span><b>{{ corpusSelMeta.audio ? 'lié' : '—' }}</b></li>
              <li><span>Srt</span><b>{{ corpusSelMeta.srt ? 'lié' : '—' }}</b></li>
            </ul>
            <p v-else class="vide">Lecture…</p>
            <!-- Actions de l'entretien sélectionné, en fin de panneau ;
                 la confirmation réutilise le bandeau commun. -->
            <button
              class="mini suppr-meta"
              :disabled="!metaEditables(corpusSelId)"
              :title="titreChampMeta(corpusSelId)"
              @click="demanderSuppressionEntretien(corpusSelId)"
            >❌ Supprimer cet entretien du corpus</button>
            <!-- Audio : sans audio un seul geste (assigner) ;
                 avec audio, deux gestes côte à côte — effacer (rouge, détache le média)
                 et remplacer. Le texte reste dans les deux cas. -->
            <div v-if="corpusSelMeta?.audio" class="audio-actions">
              <button
                class="mini audio-effacer"
                :disabled="!metaEditables(corpusSelId)"
                :title="titreChampMeta(corpusSelId)"
                @click="effacerAudioSelection"
              >Effacer l'audio</button>
              <button class="mini assigner-audio" :disabled="!metaEditables(corpusSelId)" @click="assignerAudioSelection">
                Remplacer l'audio…
              </button>
            </div>
            <button v-else class="mini assigner-audio" :disabled="!metaEditables(corpusSelId)" @click="assignerAudioSelection">
              Assigner un audio…
            </button>
            <!-- Transcription : tant qu'aucun SRT n'est assigné,
                 on peut en importer un — le contenu d'éditeur est remplacé
                 (bannière de confirmation si l'éditeur en porte déjà). -->
            <button
              v-if="corpusSelMeta && !corpusSelMeta.srt"
              class="mini assigner-srt"
              :disabled="!metaEditables(corpusSelId)"
              :title="titreChampMeta(corpusSelId)"
              @click="demanderSrt"
            >Assigner un srt…</button>
            <p v-if="srtMessage" class="srt-err">{{ srtMessage }}</p>
            <div v-if="srtASurEcrire" class="confirm-suppr srt-confirm">
              L'éditeur contient déjà du texte : assigner un SRT remplacera le contenu existant.
              <div class="confirm-actions">
                <button class="danger" @click="confirmerSrt">Remplacer le contenu</button>
                <button @click="srtASurEcrire = null">Annuler</button>
              </div>
            </div>
            <!-- Distant uniquement : lier un audio qui vit sur le serveur ;
                 la copie miroir vit chez chaque membre. -->
            <button
              v-if="idDistantCourant && corpusSelId"
              class="mini assigner-audio"
              :disabled="!metaEditables(corpusSelId)"
              @click="ouvrirDesignationAudio(corpusSelId)"
            >
              {{ corpusSelMeta?.audio ? 'Redésigner dans le Nextcloud…' : 'Désigner dans le Nextcloud…' }}
            </button>
            <!-- Variables du corpus pour CET entretien, en LECTURE SEULE ;
                 l'édition des valeurs passe par la table de données / l'onglet
                 Données de l'entretien. -->
            <div v-if="corpusSelMeta" class="meta-vars">
              <template v-if="corpusSelMeta.generales.length">
                <h4>Variables générales</h4>
                <div v-for="l in corpusSelMeta.generales" :key="l.id" class="ligne-var">
                  <span class="lbl-var" :title="l.lib">{{ l.lib }}</span>
                  <span class="val-var" :class="{ vide: !l.valeur }">{{ l.valeur ?? '—' }}</span>
                </div>
              </template>
              <div v-for="loc in corpusSelMeta.parLocuteur" :key="loc.nom" class="bloc-loc">
                <h4>{{ loc.nom }}</h4>
                <div v-for="l in loc.lignes" :key="l.id" class="ligne-var">
                  <span class="lbl-var" :title="l.lib">{{ l.lib }}</span>
                  <span class="val-var" :class="{ vide: !l.valeur }">{{ l.valeur ?? '—' }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Sinon : thèmes en CONSULTATION compacte ;
               le crayon ouvre la fenêtre d'édition partagée (nom/couleur/taille/arbre). -->
          <div v-else-if="ongletCorpus === 'accueil'" class="panneau accueil-corpus">
            <div class="corpus-tete">
              <h3>Corpus</h3>
            </div>
            <p class="accueil-intro">Explorez et gérez l’ensemble des entretiens avec ces outils.</p>
            <p class="raccourci">
              🔍 Raccourci : <b>Ctrl+F / Cmd+F</b> ouvre la recherche dans le texte de tous les entretiens.
            </p>
            <ul class="accueil-outils">
              <li><img :src="icoNotes" alt="" /><span><b>Notes</b> — consulter les notes de tous les entretiens.</span></li>
              <li><img :src="icoPersonnes" alt="" /><span><b>Personnes</b> — relier les locuteurs d’entretiens différents et contrôler leurs identités.</span></li>
              <li><img :src="icoAnon" alt="" /><span><b>Pseudonymisation</b> — contrôler et appliquer les règles partagées au corpus.</span></li>
              <li><img :src="icoThemes" alt="" /><span><b>Thèmes</b> — consulter le codebook et ouvrir son édition.</span></li>
              <li><img :src="icoDonnees" alt="" /><span><b>Données</b> — consulter et saisir les variables pour l’ensemble du corpus.</span></li>
              <li><img :src="icoJournal" alt="" /><span><b>Journal</b> — annuler les actions récentes prises en charge depuis les outils du corpus.</span></li>
              <li v-if="pasAPas"><img :src="icoPasAPas" alt="" /><span><b>Pas à pas</b> — suivre le parcours guidé.</span></li>
            </ul>
          </div>

          <aside v-else-if="ongletCorpus === 'themes'" class="panneau themes-corpus">
            <div class="corpus-tete">
              <h3>Thèmes</h3>
              <button v-if="!lectureSeule" class="crayon" title="Éditer les thèmes" @click="editerThemes = true">✏️</button>
            </div>
            <p class="aide-thm">Le codage se fait au niveau des entretiens</p>
            <p v-if="codebook.length === 0" class="vide">Aucun thème — ✏️ pour en créer.</p>
            <ul class="liste-thm-lecture">
              <li
                v-for="n in arbreVisible"
                :key="n.cat.id"
                :class="{ inactif: !n.cat.actif }"
                :style="{ paddingLeft: n.profondeur * 1.1 + 'rem' }"
                @contextmenu.prevent="ouvrirMenuTheme(n.cat, $event)"
              >
                <button
                  v-if="n.aEnfants"
                  class="depliant"
                  :title="repliesThemes.has(n.cat.id) ? 'Replier les sous-thèmes' : 'Déplier les sous-thèmes'"
                  @click.stop="basculerRepli(n.cat.id)"
                >
                  {{ repliesThemes.has(n.cat.id) ? '▸' : '▾' }}
                </button>
                <span v-else class="depliant depliant-masque"></span>
                <span class="pastille" :style="{ background: couleurHex(n.cat) }"></span>
                <span class="nom-thm-lecture">{{ n.cat.nom }}</span>
                <span class="usage" :title="`${usages[n.cat.id] ?? 0} codage(s)`">{{ usages[n.cat.id] ?? 0 }}</span>
              </li>
            </ul>
          </aside>

          <!-- Recherche plein texte sur tous les entretiens. -->
          <div v-else-if="ongletCorpus === 'recherche'" class="panneau recherche">
            <div class="corpus-tete">
              <h3>Recherche</h3>
              <button class="mini" title="Fermer la recherche (Échap)" aria-label="Fermer la recherche" @click="fermerRecherche">✕</button>
            </div>
            <p class="aide-thm">Cherche dans le texte de tous les entretiens (insensible à la casse).</p>
            <div class="barre-recherche">
              <input
                ref="champRecherche"
                class="req-recherche"
                aria-label="Rechercher dans le corpus"
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

          <PanneauJournalCorpus v-else-if="ongletCorpus === 'journal'" :actif="ongletCorpus === 'journal'" />

          <!-- Pas à pas (onglet démo) : liste des étapes + spotlight global,
               téléporté en body → visible dans n'importe quelle vue.
               La liste est masquée selon l'onglet, le spotlight reste actif. -->
          <PasAPas v-if="pasAPas" :montre-liste="ongletCorpus === 'pas-a-pas'" />
        </aside>

        <!-- Colonne DROITE (large) : entretiens en cartes ; à terme = spectrogramme -->
        <section class="colonne-d-corpus">
          <div class="corpus-tete">
            <h3>Entretiens</h3>
            <span class="actions-ent">
              <!-- Point de reprise : rouvre le dernier entretien fermé,
                   là où on en était (texte + audio). -->
              <button v-if="reprise" class="btn-reprise" @click="reprendre">
                ↩ Reprendre « {{ membership[reprise.id]?.titre }} »
              </button>
              <!-- UN seul point d'entrée : la modale à deux zones,
                   couvrant import texte, texte+audio, audio seul et vierge.
                   Masqué en corpus distant (lecture seule). -->
              <AjoutEntretien v-if="!lectureSeule" />
            </span>
          </div>
          <!-- Ancre du message « re-test » du pas-à-pas :
               pour une étape de niveau CORPUS (ex. « Charger un entretien »),
               le message « déjà réalisée » s'affiche ici, à côté des cartes,
               et non dans l'éditeur. -->
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

          <!-- Bandeau d'intégrité : des audios référencés sont introuvables,
               fichier déplacé/supprimé. Calculé à l'ouverture du corpus ;
               clic = ouvrir l'entretien → le lecteur propose de ré-assigner. -->
          <div v-if="Object.keys(audiosManquants).length > 0" class="bandeau-audio" data-tour="bandeau-audio">
            <span class="bandeau-audio-titre">
              ⚠️ {{ Object.keys(audiosManquants).length }} fichier(s) média introuvable(s) — déplacé(s) ou supprimé(s) ?
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
              :data-tour="'carte-' + e.titre"
              :class="{ selection: corpusSelId === e.id }"
              @click="selectionnerCorpus(e.id)"
            >
              <div class="ent-titre" :title="e.titre">{{ e.titre }}
                <!-- Badge de verrou fiable : « tenu par X » vient du SERVEUR,
                     scan verrous/ au pull, jamais d'une déduction.
                     Notre propre session n'est pas badgée (filtrée côté main). -->
                <span v-if="badgeVerrou(e.id)" class="badge-verrou"
                      :title="`Verrou tenu par ${badgeVerrou(e.id)!.userId} depuis ${heureDe(badgeVerrou(e.id)!.acquiredAt)} — ouverture en lecture seule.`">
                  🔒 {{ badgeVerrou(e.id)!.userId }}
                </span>
                <!-- Présence : « consulté par X » — informatif, JAMAIS décisionnel,
                     la décision, c'est le verrou ci-dessus. -->
                <span v-for="p in presencesSur(e.id)" :key="p.machineId"
                      class="badge-presence" :title="`Consulté par ${p.userId} (autre poste)`">
                  👁 {{ p.userId }}
                </span>
              </div>
                <!-- Forme d'onde de l'audio assigné ; sinon placeholder.
                     Dans les deux cas, le CALQUE du résumé thématique se
                     superpose : un span par segment codé, positionné en % du
                     TEXTE ; clic = ouvrir l'entretien à cet endroit.
                     Layout : nom À GAUCHE, onde À DROITE (les lignes empilées
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
                  <!-- Marqueurs de RECHERCHE : une pastille par occurrence,
                       à son emplacement % (axe caractères, aligné sur le résumé).
                       Clic = RESTE en vue Corpus et affiche l'extrait dans le panneau de gauche,
                       mais n'ouvre pas l'entretien. -->
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
                <!-- Si l'entretien est verrouillé par autrui, le CRAYON devient VERROU,
                     visible même sur un écran étroit où le badge du titre est tronqué.
                     Le détail (qui ? depuis quand ?) passe en tooltip au survol ;
                     le clic ouvre toujours, en lecture seule.
                     La SUPPRESSION ne vit pas sur la carte :
                     elle vit dans le panneau métadonnées. -->
                <button
                  class="crayon"
                  data-tour="crayon-entretien"
                  :title="titreCrayon(e.id)"
                  @click.stop="ouvrirEntretien(e.id)"
                >{{ badgeVerrou(e.id) ? '🔒' : '✏️' }}</button>
              </div>
            </li>
          </ul>
        </section>
      </div>

      <PersonnesCorpus v-show="ongletCorpus === 'personnes'" :actif="ongletCorpus === 'personnes'" />
      <NotesCorpus v-show="ongletCorpus === 'notes'" :actif="ongletCorpus === 'notes'" />
      <div v-show="ongletCorpus === 'donnees'" class="donnees-corpus-conteneur">
        <TableDonnees :actif="ongletCorpus === 'donnees'" />
      </div>

      <div v-show="ongletCorpus === 'anon'" class="pseudonymisation-corpus-conteneur">
        <PseudonymisationCorpus
          ref="pseudonymisation"
          :actif="ongletCorpus === 'anon'"
          @ouvrir-occurrence="ouvrirAuSegment"
        />
      </div>

      <EditionThemes v-if="editerThemes" contexte="corpus" @fermer="editerThemes = false" />
      <MenuTheme
        v-if="menuTheme"
        :x="menuTheme.x"
        :y="menuTheme.y"
        :nom="menuTheme.nom"
        :actif="menuTheme.actif"
        @basculer="basculerActifTheme"
        @fermer="menuTheme = null"
      />
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
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.8rem;
}
/* Zone de synchro du corpus distant (horodatage + Actualiser) : pousse le
   reste de la barre à gauche, reste discrète. */
.synchro-zone {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}
.dernier-tirage {
  font-size: 0.8rem;
  color: #555;
}
.badge-verrou {
  display: inline-block;
  margin-left: 0.4rem;
  font-size: 0.72rem;
  font-weight: 400;
  color: #6d4c00;
  background: #fff3cd;
  border: 1px solid #e6cf8b;
  border-radius: 999px;
  padding: 0 0.45em;
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
  width: 38px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #ddd;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  background: #f0f0f5;
  padding: 0.35rem;
  cursor: pointer;
}
.onglets-corpus button.actif {
  background: #fff;
  font-weight: 600;
  color: #1565c0;
}
.ico-onglet-corpus {
  width: 20px;
  height: 20px;
  object-fit: contain;
  opacity: 0.6;
  flex: none;
}
.onglets-corpus button.actif .ico-onglet-corpus {
  opacity: 1;
}
/* --- Onglet Recherche : recherche plein texte du corpus --- */
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
/* Résultats groupés par entretien. */
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
/* Variables de l'entretien (lecture seule) : sections titrées,
   lignes libellé → valeur ; défilement si la liste est longue. */
.meta-vars {
  margin-top: 0.6rem;
  max-height: 40vh;
  overflow-y: auto;
  border-top: 1px dashed #ddd;
  padding-top: 0.3rem;
}
.meta-vars h4 {
  margin: 0.5rem 0 0.2rem;
  font-size: 0.8rem;
  color: #1565c0;
}
.ligne-var {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 0.82rem;
  padding: 0.15rem 0;
  border-bottom: 1px dashed #eee;
}
.lbl-var {
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.val-var {
  font-weight: 600;
  white-space: nowrap;
}
.val-var.vide {
  color: #bbb;
  font-weight: 400;
}
/* Retrait du corpus depuis le panneau (croix en fin de panneau). */
.suppr-meta {
  margin-top: 0.7rem;
  color: #b00020;
  border-color: #e0b4b4;
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
  /* Nom À GAUCHE, largeur fixe (27 %) — les ondes
     empilées forment une colonne régulière (« mur » visuel). */
  width: 27%;
  flex-shrink: 0;
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.carte-ent .badge-verrou {
  flex-shrink: 0; /* le badge ne se fait pas manger par l'ellipse du titre */
}
.badge-presence {
  flex-shrink: 0;
  font-size: 0.72rem;
  padding: 0 0.4rem;
  border-radius: 8px;
  background: #e2ecff;
  color: #1d4fa1;
}
.spectro {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover; /* pas de distorsion */
  border-radius: 3px; /* conserve le coin arrondi du cadre (overflow visible désormais) */
}
/* Cadre de superposition du résumé thématique (les .xtr-graph se positionnent
   en % de SA largeur — la même que l'onde ou le placeholder). Conteneur
   compact : 25 px de haut, dégradé vertical (creux au centre), bord fin —
   c'est lui qui donne la profondeur au « mur » d'ondes. */
.spectro-cadre {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 25px;
  border-radius: 3px;
  border: 1px solid #cbcbcb;
  background: linear-gradient(#00000040 0%, #fbf5f560 50%, #00000040 100%);
  /* overflow VISIBLE : les marqueurs de recherche dépassent au-dessus/en dessous
     du cadre. L'image .spectro, elle, est en absolute inset:0 → ne déborde
     jamais ; ses coins sont arrondis par son propre border-radius (ci-dessous)
     puisqu'on ne clippe plus ici. */
  overflow: visible;
}
.xtr-graph {
  position: absolute;
  top: 1px;
  bottom: 1px;
  opacity: 0.55; /* la couleur reste celle du thème, l'onde reste lisible dessous */
  cursor: pointer;
  box-sizing: border-box;
  border-radius: 2px;
}
.xtr-graph:hover {
  opacity: 0.8; /* au survol, le segment s'affirme (clic = rouvrir au texte) */
  border: 1px solid #030303;
}
/* Marqueur de RECHERCHE sur le « mur » d'ondes : barre JAUNE vif, tour ROUGE
   gras, qui dépasse un peu du cadre, bien visible. Centrée sur la position %
   de l'occurrence ; au survol, elle passe au rouge et s'épaissit. */
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
/* Ligne « audio » du panneau méta : les deux gestes se côtoient —
   Effacer (rouge) à gauche, Remplacer à droite. */
.audio-actions {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.6rem;
}
.audio-actions .mini {
  flex: 1;
}
.audio-actions .assigner-audio {
  margin-top: 0;
  width: auto;
}
/* « Effacer l'audio » : acte destructif (le média est détaché) — rouge. */
.audio-effacer {
  color: #b00020;
  border-color: #e0b4b4;
}
.audio-effacer:hover:not(:disabled) {
  border-color: #b00020;
  background: #fdecea;
}
/* Bannière de confirmation « le SRT écrase le texte » : même idiome que la
   suppression, posée sous les boutons. */
.srt-confirm {
  margin-top: 0.5rem;
}
.srt-err {
  margin: 0.4rem 0 0;
  color: #b3261e;
  font-size: 0.78rem;
}
/* Bouton « Assigner un srt… » : même gabarit que l'audio, monté de 0.6rem
   comme les autres gestes du panneau. */
.assigner-srt {
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
/* Icône de repli d'un parent dans la consultation : `-masque` réserve la place
   (largeur égale) sur les feuilles pour que la pastille reste alignée. */
.depliant {
  width: 1.4rem;
  flex: none;
  border: none;
  background: none;
  color: #777;
  cursor: pointer;
  font-size: 0.9rem;
  padding: 0;
}
.depliant-masque {
  visibility: hidden;
}
.depliant:hover {
  color: #1565c0;
}
.liste-thm-lecture li.inactif {
  opacity: 0.3;
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

/* Accueil explicatif du corpus. */
.accueil-intro {
  margin: 0.2rem 0 0;
  color: #666;
  font-size: 0.82rem;
  line-height: 1.35;
}
.raccourci {
  background: #fff8e1;
  border: 1px solid #e0b93a;
  border-left: 4px solid #e0a03a;
  color: #5c4a00;
  border-radius: 6px;
  padding: 0.55rem 0.6rem;
  font-size: 0.82rem;
  margin: 0.7rem 0 0;
  line-height: 1.35;
}
.raccourci b {
  color: #a37000;
}
.accueil-outils {
  list-style: none;
  margin: 0.9rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.accueil-outils li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid #e5e5ef;
  border-radius: 6px;
  padding: 0.4rem 0.5rem;
  background: #fff;
  font-size: 0.8rem;
  line-height: 1.35;
}
.accueil-outils img {
  width: 20px;
  height: 20px;
  object-fit: contain;
  flex: none;
}
</style>
