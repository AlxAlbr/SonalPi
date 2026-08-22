<script setup lang="ts">
import { ref, computed } from 'vue'
import { utiliserSonal } from '../composables/sonal'

/**
 * Assistant « Nouveau corpus distant… » : créer un corpus directement sur le
 * serveur Nextcloud, pour celui qui sait d'emblée qu'il travaillera à
 * plusieurs.
 *
 * Deux champs + les identifiants, dans la même logique que la création locale :
 * le « dossier » est l'URL DAV du futur dossier du corpus, le nom devient
 * `corpus.json.nom`. Le chemin cible résolu est affiché avant publication,
 * pour éviter de créer au mauvais endroit. La publication est gardée par
 * If-None-Match côté main : si un corpus existe déjà à cet emplacement, refus
 * net sans rien écraser. En cas de succès, le corpus s'ouvre aussitôt (miroir
 * tiré + écran Corpus) — même comportement que la création locale.
 */
const emit = defineEmits<{ (e: 'fermer'): void }>()
const { creerCorpusDistant } = utiliserSonal()

const urlServeur = ref('')
const utilisateur = ref('')
const motDePasse = ref('')
const nomProjet = ref('')
const enCours = ref(false)
const erreur = ref<string | null>(null)

/** URL nettoyée (sans barre finale) — celle que le serveur verra réellement. */
const urlPropre = computed(() => urlServeur.value.trim().replace(/\/+$/, ''))
/** Chemin cible affiché à l'utilisateur avant publication, pour éviter de
 *  créer au mauvais endroit. */
const cibleAffichee = computed(() => {
  if (!urlPropre.value) return null
  try {
    const u = new URL(urlPropre.value)
    return `${u.host}${decodeURIComponent(u.pathname)}`
  } catch {
    return urlPropre.value
  }
})

const pret = computed(
  () =>
    !enCours.value &&
    urlPropre.value.length > 0 &&
    utilisateur.value.trim().length > 0 &&
    motDePasse.value.length > 0 &&
    nomProjet.value.trim().length > 0,
)

async function creer() {
  if (!pret.value) return
  enCours.value = true
  erreur.value = null
  try {
    await creerCorpusDistant({
      urlServeur: urlPropre.value,
      utilisateur: utilisateur.value.trim(),
      motDePasse: motDePasse.value,
      nomProjet: nomProjet.value.trim(),
    })
    emit('fermer') // succès : le corpus est déjà ouvert (écran Corpus derrière)
  } catch (e) {
    erreur.value = e instanceof Error ? e.message : 'Création impossible.'
    enCours.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="voile-modale" @click.self="emit('fermer')">
      <div class="modale-nouveau-distant">
        <h3>☁️ Nouveau corpus distant</h3>
        <p class="intro">
          Le corpus vivra sur votre <b>serveur Nextcloud</b> et vos collègues
          l'ouvriront chez eux (« Ouvrir un corpus distant »). Une copie de travail
          est tenue sur ce poste, synchronisée automatiquement.
        </p>

        <!-- 1 — le dossier CIBLE sur le serveur (équivalent distant du choix de
             dossier local) + identifiants -->
        <div class="question">
          <span class="q-lbl">1 — Emplacement du futur corpus sur le serveur</span>
          <input
            v-model="urlServeur"
            class="champ"
            type="text"
            placeholder="https://nuage.exemple.org/remote.php/dav/files/moi/MonCorpus"
            spellcheck="false"
          />
          <span v-if="cibleAffichee" class="cible">
            Sera créé à&nbsp;: <b>{{ cibleAffichee }}</b>
          </span>
        </div>
        <div class="ligne-2">
          <div class="question">
            <span class="q-lbl">Login</span>
            <input v-model="utilisateur" class="champ" type="text" spellcheck="false" />
          </div>
          <div class="question">
            <span class="q-lbl">Mot de passe d'application</span>
            <input v-model="motDePasse" class="champ" type="password" />
          </div>
        </div>
        <p class="note-secret">
          Jamais votre mot de passe principal : créez un mot de passe d'application
          dans Nextcloud (Paramètres → Sécurité).
        </p>

        <!-- 2 — nom du projet -->
        <div class="question">
          <span class="q-lbl">2 — Quel est le nom du projet&nbsp;?</span>
          <input
            v-model="nomProjet"
            class="champ-nom"
            :disabled="enCours"
            type="text"
            placeholder="Nom du projet"
            @keyup.enter="creer"
          />
        </div>

        <p v-if="erreur" class="msg">{{ erreur }}</p>

        <div class="pied-modale">
          <button class="annuler" :disabled="enCours" @click="emit('fermer')">Annuler</button>
          <button class="valider" :disabled="!pret" @click="creer">
            {{ enCours ? 'Création sur le serveur…' : 'Créer le corpus et l’ouvrir' }}
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
.modale-nouveau-distant {
  width: min(560px, 94vw);
  background: #fff;
  border-radius: 10px;
  padding: 1.1rem 1.2rem;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  max-height: 90vh;
  overflow: auto;
}
.modale-nouveau-distant h3 {
  margin: 0;
  color: #0277bd;
}
.intro,
.note-secret {
  margin: 0;
  font-size: 0.78rem;
  color: #555;
}
.note-secret {
  font-style: italic;
  color: #888;
}
.question {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.q-lbl {
  font-size: 0.82rem;
  font-weight: 600;
}
.ligne-2 {
  display: flex;
  gap: 0.7rem;
}
.champ,
.champ-nom {
  border: 1px solid #ccc;
  border-radius: 6px;
  padding: 0.45rem 0.6rem;
  font-size: 0.85rem;
  width: 100%;
  box-sizing: border-box;
}
.champ:focus,
.champ-nom:focus {
  border-color: #2e73d8;
  outline: none;
}
.cible {
  font-size: 0.74rem;
  color: #616161;
  font-family: monospace;
  word-break: break-all;
}
.msg {
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
.annuler:disabled,
.valider:disabled {
  border-color: #ccc;
  background: #e6e6e6;
  color: #999;
  cursor: not-allowed;
}
</style>
