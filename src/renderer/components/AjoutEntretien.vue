<script setup lang="ts">
import { ref } from 'vue'
import { utiliserSonal } from '../composables/sonal'

/**
 * « + Ajouter un entretien » — LE point d'entrée unique, calqué sur la
 * fenêtre `ajout-entretien.html` de SonalPi : une modale à DEUX zones (fichier
 * d'entretien / fichier son), chacune cliquable (dialogue filtré) ou en
 * glisser-déposer ; Valider actif dès qu'UNE zone est remplie. Texte seul =
 * import ; texte+audio = import + assignation ; audio seul = entretien au texte
 * vide à taper (c'est l'ex-« Ajouter un document », avec le lecteur en plus —
 * pas de création « vierge » sans aucun fichier, décision utilisateur).
 */
const { ajouterEntretien, racineSources } = utiliserSonal()

// J4 (§7.4) : pendant une session démo, les dialogues natifs s'ouvrent dans
// racineSources (désamortit le geste réel de l'étape 1 du pas-à-pas) — sinon
// ils s'ouvrent au défaut OS et l'utilisateur chercherait les sources sans
// repère. `undefined` hors démo → comportement inchangé.

const EXT_TEXTE = ['sonal', 'srt', 'vtt', 'txt']
const EXT_AUDIO = ['mp3', 'wav', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'flac', 'webm']

const ouverte = ref(false)
const texte = ref<{ nom: string; contenu: string } | null>(null)
const audioChemin = ref<string | null>(null)
const audioNom = ref<string | null>(null)
const message = ref<string | null>(null)
const survolTexte = ref(false)
const survolAudio = ref(false)
const enCours = ref(false)

function ouvrir() {
  texte.value = null
  audioChemin.value = null
  audioNom.value = null
  message.value = null
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
    message.value = `« ${f.name} » n'est pas un fichier son (${EXT_AUDIO.map((x) => '.' + x).join(', ')}).`
    return
  }
  audioChemin.value = window.sonal.fichier.cheminDe(f)
  audioNom.value = f.name
  message.value = null
}

async function valider() {
  if (enCours.value) return
  enCours.value = true
  try {
    await ajouterEntretien(texte.value, audioChemin.value)
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
          :class="{ pleine: audioChemin, survol: survolAudio }"
          @click="choisirAudio"
          @dragover.prevent="survolAudio = true"
          @dragleave.prevent="survolAudio = false"
          @drop.prevent="deposerAudio($event)"
        >
          <div class="zone-icone">🔊</div>
          <div class="zone-titre">Fichier son</div>
          <div class="zone-aide">.mp3, .wav, .ogg… — cliquer ou glisser-déposer</div>
          <div v-if="audioNom" class="zone-fichier">{{ audioNom }}</div>
        </div>

        <p class="aide-ajout">
          Audio seul : crée un entretien au texte vide, à transcrire dans l'éditeur.
        </p>
        <p v-if="audioChemin" class="note-ref-audio">
          L'audio est <strong>référencé, pas copié</strong> : le fichier d'origine doit rester à cet endroit.
        </p>
        <p v-if="message" class="msg-ajout">{{ message }}</p>

        <div class="pied-modale">
          <button class="annuler" @click="fermer">Annuler</button>
          <button class="valider" :disabled="(!texte && !audioChemin) || enCours" @click="valider">
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
  background: rgba(20, 25, 20, 0.45);
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
  border-color: #2e9e3f;
  background: #f3fbf4;
}
.zone.pleine {
  border-color: #2e9e3f;
  border-style: solid;
  background: #f1f8f4;
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
  color: #2e7d32;
  word-break: break-all;
  background: #e8f5e9;
  border-radius: 5px;
  padding: 0.25rem 0.4rem;
}
.aide-ajout {
  margin: 0;
  font-size: 0.72rem;
  color: #999;
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
  border-color: #2e7d32;
  background: #2e9e3f;
  color: #fff;
}
.valider:disabled {
  border-color: #ccc;
  background: #e6e6e6;
  color: #999;
  cursor: not-allowed;
}
</style>
