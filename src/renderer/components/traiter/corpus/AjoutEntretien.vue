<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import { EXT_MEDIA } from '../../../../shared/media'
import { EXT_TEXTE_ENTRETIEN as EXT_TEXTE } from '../../../../shared/importEntretien'
import { nettoyerMessage } from '../../../erreurs'

/**
 * « + Ajouter un entretien » — LE point d'entrée unique : une modale à DEUX
 * zones (fichier d'entretien / fichier son), chacune cliquable (dialogue
 * filtré) ou en glisser-déposer. Texte seul = import ; texte+audio = import
 * avec assignation ; audio seul = entretien à transcrire ; sans fichier =
 * entretien vide pour commencer à prendre des notes.
 */
const {
  ajouterEntretien,
  membership,
  racineSources,
  verifierChargementEtape1,
  verifierChargementEtape2,
  ouvrirApresImport,
  enregistrerEntretienCree,
  fournisseurCourant,
  etatBaseMedia,
  creerEntretienVideDistant,
  ouvrirDesignationAudio,
  demandeAjoutEntretien,
} = utiliserSonal()

// Ouverture depuis le menu applicatif (« Entretiens → Ajouter un entretien ») :
// le signal partagé est consommé puis remis à zéro.
watch(demandeAjoutEntretien, (demande) => {
  if (demande) {
    ouvrir()
    demandeAjoutEntretien.value = false
  }
})

// Pendant une session démo, les dialogues natifs s'ouvrent dans racineSources
// (l'utilisateur y retrouve les fichiers du pas-à-pas — ex. srt/1Coordinatrice.srt et
// audio/1Coordinatrice.mp3) ; hors démo (`undefined`), comportement inchangé : défaut OS.

// Zone « fichier son » : elle accepte en réalité AUDIO + VIDÉO (tout média
// assignable) — source UNIQUE partagée avec le dialogue natif côté main.
const EXT_AUDIO = EXT_MEDIA

const ouverte = ref(false)
const texte = ref<{ nom: string; contenu: string } | null>(null)
const audioChemin = ref<string | null>(null)
const audioNom = ref<string | null>(null)
const message = ref<string | null>(null)
const survolTexte = ref(false)
const survolAudio = ref(false)
const enCours = ref(false)
const lectureEnCours = ref(false)
const erreurLecture = ref(false)
const titreVide = ref('Nouvel entretien')
/** Titre du nouvel entretien créé avant le choix de son média distant. */
const titreDistant = ref('')

const creationAvecMediaDistantDisponible = computed(() =>
  fournisseurCourant.value === 'webdav' ||
  (fournisseurCourant.value === 'gitlab' && etatBaseMedia.value === 'configuree'),
)
const libelleChoixDistant = computed(() =>
  fournisseurCourant.value === 'gitlab'
    ? 'Choisir dans les médias WebDAV…'
    : 'Audio sur le serveur…',
)
const aideChoixDistant = computed(() =>
  fournisseurCourant.value === 'gitlab'
    ? 'Crée un entretien au texte vide, puis choisissez son audio dans la base WebDAV associée au projet GitLab.'
    : 'Crée un entretien au texte vide, puis choisissez ou téléversez son audio sur le serveur.',
)

/** Crée l'entretien vide, puis ouvre directement sa base de médias. */
async function creerAvecMediaDistant() {
  if (enCours.value || lectureEnCours.value || !titreDistant.value.trim()) return
  enCours.value = true
  try {
    const id = await creerEntretienVideDistant(titreDistant.value)
    if (!id) return
    ouverte.value = false
    ouvrirDesignationAudio(id)
  } catch (err) {
    message.value = err instanceof Error ? err.message : String(err)
  } finally {
    enCours.value = false
  }
}

function titreVideParDefaut(): string {
  const titres = new Set(Object.values(membership.value).map((entretien) => entretien.titre))
  if (!titres.has('Nouvel entretien')) return 'Nouvel entretien'
  let numero = 2
  while (titres.has(`Nouvel entretien ${numero}`)) numero++
  return `Nouvel entretien ${numero}`
}

function ouvrir() {
  if (enCours.value || lectureEnCours.value) return
  texte.value = null
  audioChemin.value = null
  audioNom.value = null
  message.value = null
  erreurLecture.value = false
  titreVide.value = titreVideParDefaut()
  titreDistant.value = ''
  enCours.value = false
  ouverte.value = true
}
function fermer() {
  if (enCours.value || lectureEnCours.value) return
  ouverte.value = false
}

const ext = (nom: string) => nom.toLowerCase().split('.').pop() ?? ''

async function choisirTexte() {
  if (enCours.value || lectureEnCours.value) return
  lectureEnCours.value = true
  try {
    const f = await window.sonal.dialog.choisirTexte(racineSources.value ?? undefined)
    if (f) {
      texte.value = f
      erreurLecture.value = false
      message.value = null
    }
  } catch (erreur) {
    texte.value = null
    erreurLecture.value = true
    message.value = nettoyerMessage(erreur)
  } finally {
    lectureEnCours.value = false
  }
}
async function choisirAudio() {
  if (enCours.value || lectureEnCours.value) return
  const chemin = await window.sonal.dialog.choisirAudio(racineSources.value ?? undefined)
  if (chemin) {
    audioChemin.value = chemin
    audioNom.value = chemin.replace(/^.*[\\/]/, '')
    message.value = null
  }
}

async function deposerTexte(e: DragEvent) {
  survolTexte.value = false
  if (enCours.value || lectureEnCours.value) return
  const f = e.dataTransfer?.files[0]
  if (!f) return
  if (!EXT_TEXTE.includes(ext(f.name))) {
    message.value = `« ${f.name} » n'est pas un fichier d'entretien (${EXT_TEXTE.map((x) => '.' + x).join(', ')}).`
    return
  }
  lectureEnCours.value = true
  message.value = null
  try {
    const contenu = ['docx', 'pdf'].includes(ext(f.name))
      ? await window.sonal.fichier.extraireTexteEntretien(f.name, new Uint8Array(await f.arrayBuffer()))
      : await f.text()
    texte.value = { nom: f.name, contenu }
    erreurLecture.value = false
  } catch (erreur) {
    texte.value = null
    erreurLecture.value = true
    message.value = nettoyerMessage(erreur)
  } finally {
    lectureEnCours.value = false
  }
}
function deposerAudio(e: DragEvent) {
  survolAudio.value = false
  if (enCours.value || lectureEnCours.value) return
  const f = e.dataTransfer?.files[0]
  if (!f) return
  if (!EXT_AUDIO.includes(ext(f.name))) {
    message.value = `« ${f.name} » n'est pas un fichier audio/vidéo (${EXT_AUDIO.map((x) => '.' + x).join(', ')}).`
    return
  }
  audioChemin.value = window.sonal.fichier.cheminDe(f)
  audioNom.value = f.name
  message.value = null
}

async function valider() {
  if (enCours.value || lectureEnCours.value || erreurLecture.value) return
  // Garde pas-à-pas (étape « Charger un entretien ») : tant que l'étape active
  // n'est pas validée, seuls srt/1Coordinatrice.srt + audio/1Coordinatrice.mp3
  // sont acceptés — la suite du parcours (notes à chaud, renommer, coder) est
  // construite sur cet entretien. Erreurs affichées dans la modale, aucun
  // entretien créé.
  const refus = verifierChargementEtape1(texte.value?.nom ?? null, audioChemin.value)
  if (refus) {
    message.value = refus
    return
  }
  // Garde de l'étape 2 (audio seul, sans SRT) : tant qu'elle n'est pas
  // validée, la zone texte doit rester vide et l'audio être audio/2RetraiteAnticipee.mp3.
  const refus2 = verifierChargementEtape2(texte.value?.nom ?? null, audioChemin.value)
  if (refus2) {
    message.value = refus2
    return
  }
  enCours.value = true
  try {
    // Pendant le geste guidé de l'étape 1 du pas-à-pas, on n'ouvre PAS
    // l'entretien : la validation affiche « étape terminée » au Corpus (c'est
    // l'étape suivante qui ouvrira l'entretien).
    const titre = texte.value
      ? texte.value.nom.replace(/\.[^.]+$/, '')
      : audioChemin.value
        ? audioChemin.value.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '')
        : titreVide.value.trim()
    const id = await ajouterEntretien(texte.value, audioChemin.value, {
      ouvrir: ouvrirApresImport(),
      titreVide: titreVide.value.trim(),
    })
    if (id) enregistrerEntretienCree(id, titre)
    ouverte.value = false
  } catch (err) {
    message.value = err instanceof Error ? err.message : String(err)
  } finally {
    enCours.value = false
  }
}
</script>

<template>
  <button class="mini ajout-ent" data-tour="ajouter-entretien" @click="ouvrir">+ Ajouter un entretien</button>

  <Teleport to="body">
    <div v-if="ouverte" class="voile-modale" @click.self="fermer">
      <div class="modale-ajout">
        <h3>Ajouter un entretien</h3>

        <div
          class="zone zone-texte"
          data-tour="zone-texte"
          :class="{ pleine: texte, survol: survolTexte }"
          @click="choisirTexte"
          @dragover.prevent="survolTexte = true"
          @dragleave.prevent="survolTexte = false"
          @drop.prevent="deposerTexte($event)"
        >
          <div class="zone-icone">📄</div>
          <div class="zone-titre">Fichier d'entretien</div>
          <div class="zone-aide">.sonal, .srt, .vtt, .txt, .docx, .pdf — cliquer ou glisser-déposer</div>
          <div v-if="texte" class="zone-fichier">{{ texte.nom }}</div>
        </div>

        <div
          class="zone zone-audio"
          data-tour="zone-audio"
          :class="{ pleine: audioChemin, survol: survolAudio }"
          @click="choisirAudio"
          @dragover.prevent="survolAudio = true"
          @dragleave.prevent="survolAudio = false"
          @drop.prevent="deposerAudio($event)"
        >
          <div class="zone-icone">🔊</div>
          <div class="zone-titre">Fichier son / vidéo</div>
          <div class="zone-aide">.mp3, .wav, .mp4, .webm… — cliquer ou glisser-déposer</div>
          <div v-if="audioNom" class="zone-fichier">{{ audioNom }}</div>
        </div>

        <label v-if="!texte && !audioChemin" class="titre-vide">
          <span>Titre du nouvel entretien</span>
          <input v-model="titreVide" data-tour="titre-entretien-vide" autofocus @keyup.enter="valider" />
        </label>
        <p class="aide-ajout">
          Sans fichier : commencez par les notes. Vous pourrez assigner l'audio et la transcription plus tard.
        </p>
        <p v-if="audioChemin" class="note-ref-audio">
          L'audio est <strong>référencé, pas copié</strong> : le fichier d'origine doit rester à cet endroit.
        </p>
        <p v-if="lectureEnCours" role="status">Lecture du fichier…</p>
        <p v-if="message" class="msg-ajout" role="alert">{{ message }}</p>

        <!-- Un média distant peut être choisi dès la création de l'entretien. -->
        <div v-if="creationAvecMediaDistantDisponible" class="bloc-distant">
          <div class="sep-distant">— ou —</div>
          <div class="ligne-distante">
            <input
              v-model="titreDistant"
              class="champ-titre"
              placeholder="Titre du nouvel entretien"
              @keyup.enter="creerAvecMediaDistant"
            />
            <button
              class="valider secondaire"
              :disabled="!titreDistant.trim() || enCours || lectureEnCours"
              @click="creerAvecMediaDistant"
            >
              {{ libelleChoixDistant }}
            </button>
          </div>
          <p class="aide-distante">{{ aideChoixDistant }}</p>
        </div>

        <div class="pied-modale">
          <button class="annuler" :disabled="enCours || lectureEnCours" @click="fermer">Annuler</button>
          <button
            class="valider"
            data-tour="valider"
            :disabled="(!texte && !audioChemin && !titreVide.trim()) || enCours || lectureEnCours || erreurLecture"
            @click="valider"
          >
            {{ enCours ? 'Ajout…' : 'Valider' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.voile-modale {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}
.modale-ajout {
  width: min(520px, 92vw);
  background: #fff;
  border-radius: 10px;
  padding: 1.1rem 1.2rem;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.modale-ajout h3 {
  margin: 0;
}
.zone {
  border: 2px dashed #ccc;
  border-radius: 8px;
  padding: 0.9rem;
  text-align: center;
  cursor: pointer;
  background: #fafafa;
  transition: border-color 0.15s, background 0.15s;
}
.zone:hover,
.zone.survol {
  border-color: #2e73d8;
  background: #f0f6ff;
}
.zone.pleine {
  border-color: #2e73d8;
  border-style: solid;
  background: #e8f0fb;
}
.zone-icone {
  font-size: 1.2rem;
}
.zone-titre {
  font-weight: 600;
  font-size: 0.88rem;
  margin-top: 0.15rem;
}
.zone-aide {
  font-size: 0.72rem;
  color: #999;
  margin-top: 0.1rem;
}
.zone-fichier {
  margin-top: 0.45rem;
  font-size: 0.8rem;
  color: #1565c0;
  word-break: break-all;
  background: #e3f2fd;
  border-radius: 5px;
  padding: 0.25rem 0.4rem;
}
.titre-vide {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  color: #555;
  font-size: 0.78rem;
}
.titre-vide input {
  border: 1px solid #ccc;
  border-radius: 6px;
  padding: 0.4rem 0.5rem;
  font-size: 0.85rem;
}
.aide-ajout {
  margin: 0;
  font-size: 0.72rem;
  color: #777;
}
/* Choix d'un média déjà présent sur le stockage distant. */
.bloc-distant {
  margin-top: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px dashed #ddd;
}
.sep-distant {
  text-align: center;
  font-size: 0.72rem;
  color: #999;
  margin-bottom: 0.4rem;
}
.ligne-distante {
  display: flex;
  gap: 0.5rem;
}
.champ-titre {
  flex: 1;
  border: 1px solid #ccc;
  border-radius: 6px;
  padding: 0.35rem 0.55rem;
  font-size: 0.8rem;
}
.valider.secondaire {
  background: #eef3fb;
  color: #2b4a75;
  border: 1px solid #c9d8ef;
}
.aide-distante {
  margin: 0.3rem 0 0;
  font-size: 0.72rem;
  color: #2b4a75;
}
.note-ref-audio {
  margin: 0;
  font-size: 0.72rem;
  color: #666;
  background: #fff8e1;
  border: 1px solid #ffe082;
  border-radius: 6px;
  padding: 0.35rem 0.5rem;
}
.msg-ajout {
  white-space: pre-line;
  margin: 0;
  background: #fdecea;
  color: #b3261e;
  border: 1px solid #f3b4ad;
  border-radius: 6px;
  padding: 0.35rem 0.5rem;
  font-size: 0.78rem;
}
.pied-modale {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.2rem;
}
.annuler,
.valider {
  border: 1px solid #ccc;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  padding: 0.4rem 1rem;
  font-size: 0.85rem;
}
.valider {
  border-color: #1565c0;
  background: #2e73d8;
  color: #fff;
}
.valider:disabled {
  border-color: #ccc;
  background: #e6e6e6;
  color: #999;
  cursor: not-allowed;
}
/* Point d'entrée principal de la vue Corpus : plus visible que les
   boutons .mini génériques (gras, un peu plus grand). */
.ajout-ent {
  font-weight: 700;
  font-size: 0.88rem;
  padding: 0.28rem 0.65rem;
}
</style>
