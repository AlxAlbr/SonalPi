<script setup lang="ts">
import { ref } from 'vue'
import { utiliserSonal } from '../composables/sonal'
import { EXT_MEDIA } from '../../shared/media'

/**
 * « + Ajouter un entretien » — LE point d'entrée unique : une modale à DEUX
 * zones (fichier d'entretien / fichier son), chacune cliquable (dialogue
 * filtré) ou en glisser-déposer ; Valider actif dès qu'UNE zone est remplie.
 * Texte seul = import ; texte+audio = import + assignation ; audio seul =
 * entretien au texte vide à taper (pas de création « vierge » sans fichier).
 */
const {
  ajouterEntretien,
  racineSources,
  verifierChargementEtape1,
  verifierChargementEtape2,
  ouvrirApresImport,
  idDistantCourant,
  creerEntretienVideDistant,
  ouvrirDesignationAudio,
} = utiliserSonal()

// Pendant une session démo, les dialogues natifs s'ouvrent dans racineSources
// (l'utilisateur y retrouve les fichiers du pas-à-pas — ex. srt/1Coordinatrice.srt et
// audio/1Coordinatrice.mp3) ; hors démo (`undefined`), comportement inchangé : défaut OS.

const EXT_TEXTE = ['sonal', 'srt', 'vtt', 'txt']
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
/** Titre du nouvel entretien distant créé pour désigner son média NC. */
const titreNc = ref('')

/** Créer un entretien VIDE dont l'audio vivra sur le Nextcloud : la création
 *  passe par la transaction définitions ; la modale de désignation s'ouvre
 *  ensuite (choisir un fichier serveur OU téléverser depuis ce poste). */
async function creerAvecAudioNc() {
  if (enCours.value || !titreNc.value.trim()) return
  enCours.value = true
  try {
    const id = await creerEntretienVideDistant(titreNc.value)
    if (!id) return
    fermer()
    ouvrirDesignationAudio(id)
  } catch (err) {
    message.value = err instanceof Error ? err.message : String(err)
  } finally {
    enCours.value = false
  }
}

function ouvrir() {
  texte.value = null
  audioChemin.value = null
  audioNom.value = null
  message.value = null
  titreNc.value = ''
  enCours.value = false
  ouverte.value = true
}
function fermer() {
  ouverte.value = false
}

const ext = (nom: string) => nom.toLowerCase().split('.').pop() ?? ''

async function choisirTexte() {
  const f = await window.sonal.dialog.choisirTexte(racineSources.value ?? undefined)
  if (f) {
    texte.value = f
    message.value = null
  }
}
async function choisirAudio() {
  const chemin = await window.sonal.dialog.choisirAudio(racineSources.value ?? undefined)
  if (chemin) {
    audioChemin.value = chemin
    audioNom.value = chemin.replace(/^.*[\\/]/, '')
    message.value = null
  }
}

async function deposerTexte(e: DragEvent) {
  survolTexte.value = false
  const f = e.dataTransfer?.files[0]
  if (!f) return
  if (!EXT_TEXTE.includes(ext(f.name))) {
    message.value = `« ${f.name} » n'est pas un fichier d'entretien (${EXT_TEXTE.map((x) => '.' + x).join(', ')}).`
    return
  }
  texte.value = { nom: f.name, contenu: await f.text() }
  message.value = null
}
function deposerAudio(e: DragEvent) {
  survolAudio.value = false
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
  if (enCours.value) return
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
    await ajouterEntretien(texte.value, audioChemin.value, { ouvrir: ouvrirApresImport() })
    fermer()
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
          <div class="zone-aide">.sonal, .srt, .vtt, .txt — cliquer ou glisser-déposer</div>
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

        <p class="aide-ajout">
          Audio seul : crée un entretien au texte vide, à transcrire dans l'éditeur.
        </p>
        <p v-if="audioChemin" class="note-ref-audio">
          L'audio est <strong>référencé, pas copié</strong> : le fichier d'origine doit rester à cet endroit.
        </p>
        <p v-if="message" class="msg-ajout">{{ message }}</p>

        <!-- En corpus distant, l'audio peut vivre
             sur le serveur dès la création — entretien vide puis désignation. -->
        <div v-if="idDistantCourant" class="bloc-nc">
          <div class="sep-nc">— ou —</div>
          <div class="ligne-nc">
            <input
              v-model="titreNc"
              class="champ-titre"
              placeholder="Titre du nouvel entretien"
              @keyup.enter="creerAvecAudioNc"
            />
            <button class="valider secondaire" :disabled="!titreNc.trim() || enCours" @click="creerAvecAudioNc">
              Audio sur le Nextcloud…
            </button>
          </div>
          <p class="aide-nc">Crée un entretien au texte vide, puis choisissez (ou téléversez) son audio dans le Nextcloud.</p>
        </div>

        <div class="pied-modale">
          <button class="annuler" @click="fermer">Annuler</button>
          <button
            class="valider"
            data-tour="valider"
            :disabled="(!texte && !audioChemin) || enCours"
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
.aide-ajout {
  margin: 0;
  font-size: 0.72rem;
  color: #999;
}
/* Bloc « Audio sur le Nextcloud » (corpus distant uniquement). */
.bloc-nc {
  margin-top: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px dashed #ddd;
}
.sep-nc {
  text-align: center;
  font-size: 0.72rem;
  color: #999;
  margin-bottom: 0.4rem;
}
.ligne-nc {
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
.aide-nc {
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
  font-size: 0.88rem;
  padding: 0.28rem 0.65rem;
}
</style>
