<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import type {
  BrancheGitLabPublic,
  CompteDistantPublic,
  DestinationGitLabPublic,
  ProfilCapacites,
  ProjetGitLabPublic,
} from '../../../shared/distant'

/**
 *  Ouvre une destination Nextcloud éditable.
 *  Une destination GitLab reste en consultation seule.
 *  Les secrets restent dans le main process.
 */
const emit = defineEmits<{ (e: 'fermer'): void }>()
const {
  ouvrirCorpusDistant,
  ouvrirDestinationGitLab,
  enregistrerEtOuvrirGitLab,
  oublierCompteDistant,
} = utiliserSonal()

const comptes = ref<CompteDistantPublic[]>([])
const destinationsGitLab = ref<DestinationGitLabPublic[]>([])
const stockageSecuriseDisponible = ref<boolean | null>(null)
const motsDePasseSession = ref<Record<string, string>>({})
const jetonsGitLabSession = ref<Record<string, string>>({})
const urlServeur = ref('')
const utilisateur = ref('')
const motDePasse = ref('')
const enCours = ref(false)
const erreur = ref<string | null>(null)
const profilConnecte = ref<ProfilCapacites | null>(null)
const urlGitLab = ref('')
const utilisateurGitLab = ref('')
const jetonGitLab = ref('')
const projetGitLab = ref<number | null>(null)
const nomProjetGitLab = ref('')
const brancheGitLab = ref('')
const racineGitLab = ref('')
const projetsGitLab = ref<ProjetGitLabPublic[]>([])
const branchesGitLab = ref<BrancheGitLabPublic[]>([])
const projetsGitLabTronques = ref(false)
const branchesGitLabTronquees = ref(false)
const actionGitLab = ref<'decouverte' | 'branches' | 'ouverture' | null>(null)

async function rafraichirListe() {
  comptes.value = await window.sonal.distant.lister()
}
async function initialiser() {
  const [liste, gitlab, stockageSecurise] = await Promise.all([
    window.sonal.distant.lister(),
    window.sonal.gitlab.lister(),
    window.sonal.distant.stockageSecuriseDisponible(),
  ])
  comptes.value = liste
  destinationsGitLab.value = gitlab
  stockageSecuriseDisponible.value = stockageSecurise
}
onMounted(initialiser)

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

async function ouvrir(compte: CompteDistantPublic) {
  enCours.value = true
  erreur.value = null
  try {
    const motDePasse = compte.motDePasseDisponible
      ? undefined
      : motsDePasseSession.value[compte.id]
    await ouvrirCorpusDistant(compte.id, motDePasse)
    emit('fermer')
  } catch (e) {
    erreur.value =
      e instanceof Error ? e.message : 'Ouverture impossible (serveur injoignable ?).'
    enCours.value = false
  }
}

async function oublier(id: string) {
  comptes.value = await oublierCompteDistant(id)
}

async function ouvrirGitLab(destination: DestinationGitLabPublic) {
  enCours.value = true
  erreur.value = null
  try {
    const jeton = destination.jetonDisponible
      ? undefined
      : jetonsGitLabSession.value[destination.compteId]
    await ouvrirDestinationGitLab(destination.id, jeton)
    emit('fermer')
  } catch (e) {
    erreur.value = e instanceof Error ? e.message : 'Ouverture GitLab impossible.'
    enCours.value = false
  }
}

function invaliderDecouverteGitLab(): void {
  projetGitLab.value = null
  nomProjetGitLab.value = ''
  brancheGitLab.value = ''
  projetsGitLab.value = []
  branchesGitLab.value = []
  projetsGitLabTronques.value = false
  branchesGitLabTronquees.value = false
}

async function decouvrirProjetsGitLab(): Promise<void> {
  if (!urlGitLab.value.trim() || !jetonGitLab.value) return
  actionGitLab.value = 'decouverte'
  enCours.value = true
  erreur.value = null
  try {
    const resultat = await window.sonal.gitlab.decouvrirProjets({
      urlInstance: urlGitLab.value.trim(),
      jeton: jetonGitLab.value,
    })
    invaliderDecouverteGitLab()
    projetsGitLab.value = resultat.elements
    projetsGitLabTronques.value = resultat.tronque
    if (resultat.elements.length === 0) {
      erreur.value = 'Aucun projet accessible n’a été trouvé avec ce jeton.'
    }
  } catch (e) {
    erreur.value = e instanceof Error ? e.message : 'Découverte des projets impossible.'
  } finally {
    actionGitLab.value = null
    enCours.value = false
  }
}

async function choisirProjetGitLab(): Promise<void> {
  const projet = projetsGitLab.value.find((candidate) => candidate.id === projetGitLab.value)
  brancheGitLab.value = ''
  branchesGitLab.value = []
  branchesGitLabTronquees.value = false
  nomProjetGitLab.value = projet?.nom ?? ''
  if (!projet) return
  if (projet.archive) {
    erreur.value = 'Ce projet GitLab est archivé et ne peut pas être ouvert.'
    return
  }

  actionGitLab.value = 'branches'
  enCours.value = true
  erreur.value = null
  try {
    const resultat = await window.sonal.gitlab.decouvrirBranches({
      urlInstance: urlGitLab.value.trim(),
      jeton: jetonGitLab.value,
      projetId: projet.id,
    })
    branchesGitLab.value = resultat.elements
    branchesGitLabTronquees.value = resultat.tronque
    const brancheParDefaut = resultat.elements.find((branche) => branche.parDefaut)
    brancheGitLab.value = brancheParDefaut?.nom
      ?? resultat.elements.find((branche) => branche.nom === projet.brancheParDefaut)?.nom
      ?? resultat.elements[0]?.nom
      ?? ''
    if (!brancheGitLab.value) {
      erreur.value = 'Ce projet ne contient aucune branche lisible.'
    }
  } catch (e) {
    erreur.value = e instanceof Error ? e.message : 'Découverte des branches impossible.'
  } finally {
    actionGitLab.value = null
    enCours.value = false
  }
}

async function connecterGitLab() {
  if (projetGitLab.value === null) return
  actionGitLab.value = 'ouverture'
  enCours.value = true
  erreur.value = null
  try {
    await enregistrerEtOuvrirGitLab({
      urlInstance: urlGitLab.value,
      utilisateur: utilisateurGitLab.value,
      jeton: jetonGitLab.value,
      projetId: projetGitLab.value,
      nomProjet: nomProjetGitLab.value,
      branche: brancheGitLab.value,
      racine: racineGitLab.value,
    })
    emit('fermer')
  } catch (e) {
    erreur.value = e instanceof Error ? e.message : 'Connexion GitLab impossible.'
    actionGitLab.value = null
    enCours.value = false
  }
}

async function oublierGitLab(id: string) {
  destinationsGitLab.value = await window.sonal.gitlab.oublierDestination(id)
}
</script>

<template>
  <Teleport to="body">
    <div class="voile-modale" @click.self="emit('fermer')">
      <div class="modale-distant">
        <h3>☁️ Ouvrir un corpus distant</h3>
        <p class="intro">
          Le corpus vit sur le serveur ; l'app en garde une <b>copie locale</b> et se
          synchronise à l'ouverture et sur « Actualiser ». <b>Lecture seule</b> pour
          cette étape — l'écriture partagée sous verrou vient ensuite.
        </p>

        <div v-if="stockageSecuriseDisponible === false" class="avertissement-coffre">
          <strong>Stockage sécurisé indisponible</strong>
          <span>
            Sonal ne conservera pas votre mot de passe ou jeton : vous devrez le
            saisir après chaque redémarrage. Conservez-le dans un gestionnaire comme
            KeePassXC, ou configurez GNOME Keyring/KWallet. Il restera uniquement en
            mémoire jusqu'à la fermeture de Sonal.
          </span>
        </div>

        <!-- 1 — comptes configurés -->
        <div v-if="comptes.length > 0" class="bloc-comptes">
          <span class="q-lbl">Comptes configurés</span>
          <ul class="comptes">
            <li v-for="c in comptes" :key="c.id">
              <div class="compte-info">
                <span class="compte-user">{{ c.utilisateur }}</span>
                <span class="compte-url">{{ c.urlServeur }}</span>
              </div>
              <div class="compte-actions">
                <input
                  v-if="!c.motDePasseDisponible"
                  v-model="motsDePasseSession[c.id]"
                  class="secret-compte"
                  type="password"
                  placeholder="Mot de passe pour cette session"
                  :disabled="enCours"
                />
                <button
                  class="mini ouvrir"
                  :disabled="stockageSecuriseDisponible === null || enCours || (!c.motDePasseDisponible && !motsDePasseSession[c.id])"
                  @click="ouvrir(c)"
                >
                  Ouvrir
                </button>
              </div>
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
            dans Nextcloud (Paramètres → Sécurité).
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

        <hr />
        <span class="q-lbl">GitLab — consultation seule</span>
        <p class="note-secret">
          Cette préversion consulte les transcriptions sans commit, verrou ni sonde
          d'écriture. L'édition et les médias partagés GitLab restent indisponibles.
        </p>

        <div v-if="destinationsGitLab.length > 0" class="bloc-comptes">
          <ul class="comptes">
            <li v-for="destination in destinationsGitLab" :key="destination.id">
              <div class="compte-info">
                <span class="compte-user">{{ destination.nomProjet || destination.projetId }}</span>
                <span class="compte-url">
                  {{ destination.urlInstance }} · {{ destination.branche }}<template v-if="destination.racine">/{{ destination.racine }}</template>
                </span>
              </div>
              <div class="compte-actions">
                <input
                  v-if="!destination.jetonDisponible"
                  v-model="jetonsGitLabSession[destination.compteId]"
                  class="secret-compte"
                  type="password"
                  placeholder="Jeton pour cette session"
                  :disabled="enCours"
                />
                <button
                  class="mini ouvrir"
                  :disabled="enCours || (!destination.jetonDisponible && !jetonsGitLabSession[destination.compteId])"
                  @click="ouvrirGitLab(destination)"
                >
                  Ouvrir
                </button>
              </div>
              <button class="mini oubli" title="Oublier cette destination" @click="oublierGitLab(destination.id)">✕</button>
            </li>
          </ul>
        </div>

        <div class="question">
          <span class="q-lbl">URL de l'instance GitLab</span>
          <input v-model="urlGitLab" class="champ url-gitlab" type="text" placeholder="https://gitlab.exemple.org" spellcheck="false" :disabled="enCours" @input="invaliderDecouverteGitLab" />
        </div>
        <div class="ligne-2">
          <div class="question">
            <span class="q-lbl">Utilisateur</span>
            <input v-model="utilisateurGitLab" class="champ utilisateur-gitlab" type="text" spellcheck="false" :disabled="enCours" @input="invaliderDecouverteGitLab" />
          </div>
          <div class="question">
            <span class="q-lbl">Jeton d'accès personnel</span>
            <input v-model="jetonGitLab" class="champ jeton-gitlab" type="password" :disabled="enCours" @input="invaliderDecouverteGitLab" />
          </div>
        </div>
        <button
          class="mini decouvrir-gitlab"
          :disabled="enCours || !urlGitLab.trim() || !utilisateurGitLab.trim() || !jetonGitLab"
          @click="decouvrirProjetsGitLab"
        >
          {{ actionGitLab === 'decouverte' ? 'Recherche…' : 'Découvrir les projets' }}
        </button>
        <p v-if="projetsGitLabTronques" class="note-decouverte">
          Les 250 premiers projets ont été lus. Affinez la sélection ou utilisez un
          jeton disposant d’un accès plus restreint.
        </p>
        <div v-if="projetsGitLab.length > 0" class="question">
          <span class="q-lbl">Projet</span>
          <select
            v-model.number="projetGitLab"
            class="champ projet-gitlab"
            :disabled="enCours"
            @change="choisirProjetGitLab"
          >
            <option :value="null">Choisir un projet…</option>
            <option v-for="projet in projetsGitLab" :key="projet.id" :value="projet.id">
              {{ projet.nom }} — {{ projet.chemin }}{{ projet.archive ? ' (archivé)' : '' }}
            </option>
          </select>
        </div>
        <div v-if="projetGitLab !== null" class="ligne-2">
          <div class="question">
            <span class="q-lbl">Branche</span>
            <select
              v-if="projetGitLab !== null"
              v-model="brancheGitLab"
              class="champ branche-gitlab"
              :disabled="enCours || branchesGitLab.length === 0"
            >
              <option value="">Choisir une branche…</option>
              <option v-for="branche in branchesGitLab" :key="branche.nom" :value="branche.nom">
                {{ branche.nom }}{{ branche.parDefaut ? ' (par défaut)' : '' }}
              </option>
            </select>
          </div>
          <div class="question">
            <span class="q-lbl">Racine du corpus (facultatif)</span>
            <input v-model="racineGitLab" class="champ racine-gitlab" type="text" placeholder="donnees/mon-corpus" spellcheck="false" />
          </div>
        </div>
        <p v-if="branchesGitLabTronquees" class="note-decouverte">
          La liste des branches est tronquée. Choisissez la branche affichée si elle
          convient ; les branches suivantes ne sont pas encore listées.
        </p>
        <button
          class="valider"
          :disabled="enCours || !urlGitLab.trim() || !utilisateurGitLab.trim() || !jetonGitLab || !projetGitLab || !brancheGitLab"
          @click="connecterGitLab"
        >
          {{ actionGitLab === 'ouverture' ? 'Ouverture…' : 'Ouvrir depuis GitLab' }}
        </button>

        <p v-if="erreur" class="msg">{{ erreur }}</p>

        <div class="pied-modale">
          <button class="annuler" :disabled="enCours" @click="emit('fermer')">Fermer</button>
          <button
            v-if="!profilConnecte"
            class="valider"
            :disabled="stockageSecuriseDisponible === null || enCours || !urlServeur.trim() || !utilisateur.trim() || !motDePasse"
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
.avertissement-coffre {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid #e2a842;
  border-radius: 6px;
  background: #fff8e8;
  color: #704b09;
  font-size: 0.78rem;
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
.compte-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.secret-compte {
  width: 180px;
  border: 1px solid #d4a34f;
  border-radius: 5px;
  padding: 0.3rem 0.45rem;
  font-size: 0.75rem;
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
.mini.decouvrir-gitlab {
  align-self: flex-start;
}
.note-decouverte {
  margin: -0.25rem 0 0;
  color: #795500;
  font-size: 0.75rem;
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
