<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { utiliserSonal } from '../composables/sonal'
import type { CompteDistantPublic, ProfilCapacites } from '../../shared/distant'

/**
 * Modale « Corpus distant… » (plan-multiuser.md E0) — deux volets :
 *  1. les comptes déjà configurés : ouvrir (tire le miroir, lecture seule)
 *     ou oublier (le miroir local n'est jamais effacé) ;
 *  2. la connexion : URL DAV du corpus + login + MOT DE PASSE D'APPLICATION
 *     (jamais le principal — cf. plan §2). La connexion mesure les sondes
 *     sur le serveur RÉEL AVANT d'enregistrer quoi que ce soit ; un serveur
 *     qui ignore les préconditions est refusé avec le motif.
 */
const emit = defineEmits<{ (e: 'fermer'): void }>()
const { ouvrirCorpusDistant } = utiliserSonal()

const comptes = ref<CompteDistantPublic[]>([])
const urlServeur = ref('')
const utilisateur = ref('')
const motDePasse = ref('')
const enCours = ref(false)
const erreur = ref<string | null>(null)
const profilConnecte = ref<ProfilCapacites | null>(null)

async function rafraichirListe() {
  comptes.value = await window.sonal.distant.lister()
}
onMounted(rafraichirListe)

async function connecter() {
  enCours.value = true
  erreur.value = null
  try {
    const r = await window.sonal.distant.connecter({
      urlServeur: urlServeur.value.trim().replace(/\/+$/, ''),
      utilisateur: utilisateur.value.trim(),
      motDePasse: motDePasse.value,
    })
    if (!r.ok) {
      erreur.value = r.note
    } else {
      profilConnecte.value = r.profil
      urlServeur.value = ''
      utilisateur.value = ''
      motDePasse.value = ''
      await rafraichirListe()
    }
  } catch (e) {
    erreur.value = e instanceof Error ? e.message : 'Connexion impossible.'
  } finally {
    enCours.value = false
  }
}

async function ouvrir(id: string) {
  enCours.value = true
  erreur.value = null
  try {
    await ouvrirCorpusDistant(id) // tire le miroir + bascule + va à l'écran Corpus
    emit('fermer')
  } catch (e) {
    erreur.value =
      e instanceof Error ? e.message : 'Ouverture impossible (serveur injoignable ?).'
    enCours.value = false
  }
}

async function oublier(id: string) {
  comptes.value = await window.sonal.distant.oublier(id)
}
</script>

<template>
  <Teleport to="body">
    <div class="voile-modale" @click.self="emit('fermer')">
      <div class="modale-distant">
        <h3>☁️ Corpus distant (Nextcloud)</h3>
        <p class="intro">
          Le corpus vit sur le serveur ; l'app en garde une <b>copie locale</b> et se
          synchronise à l'ouverture et sur « Actualiser ». <b>Lecture seule</b> pour
          cette étape — l'écriture partagée sous verrou vient ensuite.
        </p>

        <!-- 1 — comptes configurés -->
        <div v-if="comptes.length > 0" class="bloc-comptes">
          <span class="q-lbl">Comptes configurés</span>
          <ul class="comptes">
            <li v-for="c in comptes" :key="c.id">
              <div class="compte-info">
                <span class="compte-user">{{ c.utilisateur }}</span>
                <span class="compte-url">{{ c.urlServeur }}</span>
              </div>
              <button class="mini ouvrir" :disabled="enCours" @click="ouvrir(c.id)">Ouvrir</button>
              <button class="mini oubli" title="Oublier ce compte (ne supprime rien au serveur)" @click="oublier(c.id)">✕</button>
            </li>
          </ul>
        </div>

        <!-- 2 — connexion -->
        <template v-if="!profilConnecte">
          <div class="question">
            <span class="q-lbl">URL du corpus sur le serveur</span>
            <input
              v-model="urlServeur"
              class="champ"
              type="text"
              placeholder="https://nuage.exemple.org/remote.php/dav/files/moi/MonCorpus"
              spellcheck="false"
            />
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
            dans Nextcloud (Paramètres → Sécurité). Il est chiffré par le trousseau de
            votre système, jamais stocké en clair.
          </p>
        </template>
        <div v-else class="connecte">
          Compte connecté ✓
          <span v-if="profilConnecte.filesLock">
            Verrouillage natif détecté (il sera utilisé dès l'étape écriture).
          </span>
          <span v-else>
            Verrouillage natif indisponible — l'app utilisera son propre verrou
            (fonctionnel, invisible dans l'UI web Nextcloud).
          </span>
        </div>

        <p v-if="erreur" class="msg">{{ erreur }}</p>

        <div class="pied-modale">
          <button class="annuler" :disabled="enCours" @click="emit('fermer')">Fermer</button>
          <button
            v-if="!profilConnecte"
            class="valider"
            :disabled="enCours || !urlServeur.trim() || !utilisateur.trim() || !motDePasse"
            @click="connecter"
          >
            {{ enCours ? 'Vérification du serveur…' : 'Se connecter' }}
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
.modale-distant {
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
.modale-distant h3 {
  margin: 0;
  color: #1565c0;
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
.bloc-comptes {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.q-lbl {
  font-size: 0.82rem;
  font-weight: 600;
}
.comptes {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.comptes li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 0.4rem 0.55rem;
  background: #fafafa;
}
.compte-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.compte-user {
  font-size: 0.85rem;
  font-weight: 600;
}
.compte-url {
  font-size: 0.7rem;
  color: #999;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mini {
  border: 1px solid #ccc;
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
  padding: 0.25rem 0.6rem;
  font-size: 0.78rem;
}
.mini.ouvrir:hover:not(:disabled) {
  border-color: #2e73d8;
  background: #f0f6ff;
}
.mini.oubli {
  opacity: 0.5;
}
.mini.oubli:hover {
  opacity: 1;
}
.question {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
}
.ligne-2 {
  display: flex;
  gap: 0.7rem;
}
.champ {
  border: 1px solid #ccc;
  border-radius: 6px;
  padding: 0.45rem 0.6rem;
  font-size: 0.85rem;
  width: 100%;
  box-sizing: border-box;
}
.champ:focus {
  border-color: #2e73d8;
  outline: none;
}
.connecte {
  font-size: 0.82rem;
  color: #2e7d32;
  background: #edf7ee;
  border: 1px solid #bfe3c2;
  border-radius: 6px;
  padding: 0.45rem 0.55rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
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
.valider:disabled {
  border-color: #ccc;
  background: #e6e6e6;
  color: #999;
  cursor: not-allowed;
}
</style>
