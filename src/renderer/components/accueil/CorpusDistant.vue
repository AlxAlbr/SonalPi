<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import { useProjetGitLab } from '../../composables/corpus/useProjetGitLab'
import AideGitLab from './AideGitLab.vue'
import type { DestinationGitLabPublic } from '../../../shared/gitlab'
import type { DestinationWebDAVPublic, ProfilCapacitesWebDAV } from '../../../shared/webdav'

/**
 *  Ouvre une destination Nextcloud ou GitLab.
 *  Les secrets saisis sont transmis au main, jamais renvoyés par le coffre.
 */
const props = defineProps<{
  fournisseurInitiale?: 'nextcloud' | 'gitlab'
}>()
const emit = defineEmits<{ (e: 'fermer'): void }>()
const {
  ouvrirCorpusWebDAV,
  ouvrirDestinationGitLab,
  enregistrerEtOuvrirGitLab,
  oublierDestinationWebDAV,
} = utiliserSonal()

const fournisseur = ref<'nextcloud' | 'gitlab'>(props.fournisseurInitiale ?? 'nextcloud')
const comptes = ref<DestinationWebDAVPublic[]>([])
const destinationsGitLab = ref<DestinationGitLabPublic[]>([])
const stockageSecuriseDisponible = ref<boolean | null>(null)
const motsDePasseSession = ref<Record<string, string>>({})
const urlServeur = ref('')
const utilisateur = ref('')
const motDePasse = ref('')
const enCours = ref(false)
const erreur = ref<string | null>(null)
const aideGitLabOuverte = ref(false)
const profilConnecte = ref<ProfilCapacitesWebDAV | null>(null)
const {
  urlProjet: urlProjetGitLab,
  racine: racineGitLab,
  demande: demandeGitLab,
  chargement: chargementGitLab,
  clientId: clientIdGitLab,
  comptes: comptesGitLab,
  compteChoisi: compteChoisiGitLab,
  compteCourant: compteCourantGitLab,
  connexionEnCours: connexionEnCoursGitLab,
  detecter: detecterInstanceGitLab,
  deconnecter: deconnecterCompteGitLabOAuth,
  charger: preparerProjetGitLab,
} = useProjetGitLab({ enCours, erreur })

/** Destinations du compte choisi : c'est lui qui autorise l'ouverture. */
const destinationsDuCompte = computed(() => destinationsGitLab.value.filter(
  (destination) => !compteChoisiGitLab.value || destination.compteId === compteChoisiGitLab.value,
))

async function rafraichirListe() {
  comptes.value = await window.sonal.webdav.lister()
}
async function initialiser() {
  const [liste, gitlab, stockageSecurise] = await Promise.all([
    window.sonal.webdav.lister(),
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
    const r = await window.sonal.webdav.connecter({
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

async function ouvrir(compte: DestinationWebDAVPublic) {
  enCours.value = true
  erreur.value = null
  try {
    const motDePasse = compte.motDePasseDisponible
      ? undefined
      : motsDePasseSession.value[compte.id]
    await ouvrirCorpusWebDAV(compte.id, motDePasse)
    emit('fermer')
  } catch (e) {
    erreur.value =
      e instanceof Error ? e.message : 'Ouverture impossible (serveur injoignable ?).'
    enCours.value = false
  }
}

async function oublier(id: string) {
  comptes.value = await oublierDestinationWebDAV(id)
}

async function ouvrirGitLab(destination: DestinationGitLabPublic) {
  enCours.value = true
  erreur.value = null
  try {
    if (!destination.connexionDisponible) {
      await window.sonal.gitlab.connecter(destination.urlInstance)
      destinationsGitLab.value = await window.sonal.gitlab.lister()
      destination = destinationsGitLab.value.find((candidate) => candidate.id === destination.id)
        ?? destination
      if (!destination.connexionDisponible) {
        throw new Error('La reconnexion GitLab n’a pas abouti.')
      }
    }
    await ouvrirDestinationGitLab(destination.id)
    emit('fermer')
  } catch (e) {
    erreur.value = e instanceof Error ? e.message : 'Ouverture GitLab impossible.'
    enCours.value = false
  }
}

async function connecterGitLab() {
  if (enCours.value || chargementGitLab.value || connexionEnCoursGitLab.value) return
  erreur.value = null
  const projetPret = await preparerProjetGitLab()
  if (!projetPret || !demandeGitLab.value) return
  enCours.value = true
  try {
    await enregistrerEtOuvrirGitLab(demandeGitLab.value)
    emit('fermer')
  } catch (e) {
    erreur.value = e instanceof Error ? e.message : 'Connexion GitLab impossible.'
    enCours.value = false
  }
}

async function deconnecterGitLabOAuth() {
  await deconnecterCompteGitLabOAuth()
  destinationsGitLab.value = await window.sonal.gitlab.lister()
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
          synchronise à l'ouverture et sur « Actualiser ».
        </p>

        <div class="onglets-fournisseur" role="tablist" aria-label="Fournisseur distant">
          <button
            :class="{ actif: fournisseur === 'nextcloud' }"
            role="tab"
            :aria-selected="fournisseur === 'nextcloud'"
            @click="fournisseur = 'nextcloud'"
          >
            Nextcloud
          </button>
          <button
            :class="{ actif: fournisseur === 'gitlab' }"
            role="tab"
            :aria-selected="fournisseur === 'gitlab'"
            @click="fournisseur = 'gitlab'"
          >
            GitLab
          </button>
        </div>

        <div v-if="stockageSecuriseDisponible === false" class="avertissement-coffre">
          <strong>Stockage sécurisé indisponible</strong>
          <span v-if="fournisseur === 'nextcloud'">
            Sonal ne conservera pas votre mot de passe : vous devrez le saisir après
            chaque redémarrage. Conservez-le dans un gestionnaire comme KeePassXC, ou
            configurez GNOME Keyring/KWallet.
          </span>
          <span v-else>
            Sonal ne conservera pas votre connexion GitLab : vous devrez vous reconnecter
            dans le navigateur après chaque redémarrage.
          </span>
        </div>

        <template v-if="fournisseur === 'nextcloud'">
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
            Verrouillage natif détecté (il sera utilisé dès l'étape édition).
          </span>
          <span v-else>
            Verrouillage natif indisponible — l'app utilisera son propre verrou
            (fonctionnel, invisible dans l'UI web Nextcloud).
          </span>
        </div>
        </template>

        <template v-else>
        <div class="intro-gitlab">
          <div>
            <span class="q-lbl">Projets GitLab</span>
            <p class="note-secret">
              Aucun jeton à créer : la connexion se fait dans votre navigateur.
            </p>
          </div>
          <button class="lien-aide-gitlab" type="button" @click="aideGitLabOuverte = true">
            Guide de préparation GitLab
          </button>
        </div>

        <div v-if="destinationsDuCompte.length > 0" class="bloc-comptes">
          <ul class="comptes">
            <li v-for="destination in destinationsDuCompte" :key="destination.id">
              <div class="compte-info">
                <span class="compte-user">{{ destination.nomProjet || destination.projetId }}</span>
                <span class="compte-url">
                  {{ destination.urlInstance }} · {{ destination.branche }}<template v-if="destination.racine">/{{ destination.racine }}</template>
                </span>
              </div>
              <div class="compte-actions">
                <button
                  class="mini ouvrir"
                  :disabled="enCours"
                  @click="ouvrirGitLab(destination)"
                >
                  {{ destination.connexionDisponible ? 'Ouvrir' : 'Se reconnecter et ouvrir' }}
                </button>
              </div>
              <button class="mini oubli" title="Oublier cette destination" @click="oublierGitLab(destination.id)">✕</button>
            </li>
          </ul>
        </div>

        <div class="nouveau-projet-gitlab">
          <span class="q-lbl">Ouvrir un autre projet</span>
          <div class="question">
            <span class="q-lbl secondaire">Adresse du projet GitLab</span>
            <input
              v-model="urlProjetGitLab"
              class="champ url-projet-gitlab"
              type="text"
              placeholder="https://gitlab.exemple.org/mon-groupe/mon-corpus"
              spellcheck="false"
              :disabled="enCours || chargementGitLab || connexionEnCoursGitLab"
              @change="detecterInstanceGitLab"
            />
            <span class="aide-champ">Copiez l’adresse de la page du projet.</span>
          </div>
          <div class="question">
            <span class="q-lbl secondaire">Client ID OAuth</span>
            <input
              v-model="clientIdGitLab"
              class="champ client-id-gitlab"
              type="text"
              placeholder="Fourni par votre institution ou créé avec le guide"
              spellcheck="false"
              :disabled="enCours || chargementGitLab || connexionEnCoursGitLab"
            />
            <span class="aide-champ">
              Public et non secret. Laissez vide si Sonal connaît déjà cette instance.
            </span>
          </div>
          <div v-if="comptesGitLab.length > 1" class="question">
            <span class="q-lbl secondaire">Compte GitLab</span>
            <select v-model="compteChoisiGitLab" class="champ" :disabled="enCours">
              <option v-for="compte in comptesGitLab" :key="compte.id" :value="compte.id">
                {{ compte.utilisateur }}{{ compte.connecte ? '' : ' — à reconnecter' }}
              </option>
            </select>
          </div>
          <div v-if="compteCourantGitLab?.connecte" class="connexion-compacte">
            <span>Connecté avec {{ compteCourantGitLab.utilisateur }}.</span>
            <button class="mini deconnecter-gitlab" type="button" @click="deconnecterGitLabOAuth">
              Se déconnecter
            </button>
          </div>
          <details class="options-gitlab">
            <summary>Options avancées</summary>
            <div class="question">
              <span class="q-lbl secondaire">Dossier du corpus dans le projet</span>
              <input
                v-model="racineGitLab"
                class="champ racine-gitlab"
                type="text"
                placeholder="donnees/mon-corpus"
                spellcheck="false"
                :disabled="enCours"
              />
              <span class="aide-champ">Laissez vide pour utiliser la racine du projet.</span>
            </div>
          </details>
          <button
            class="valider action-gitlab"
            :disabled="enCours || chargementGitLab || connexionEnCoursGitLab || !urlProjetGitLab.trim()"
            @click="connecterGitLab"
          >
            {{ chargementGitLab || connexionEnCoursGitLab
              ? 'Connexion et vérification…'
              : enCours ? 'Ouverture…' : 'Ouvrir le corpus' }}
          </button>
        </div>
        </template>

        <p v-if="erreur" class="msg">{{ erreur }}</p>

        <div class="pied-modale">
          <button class="annuler" :disabled="enCours" @click="emit('fermer')">Fermer</button>
          <button
            v-if="fournisseur === 'nextcloud' && !profilConnecte"
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
  <AideGitLab v-if="aideGitLabOuverte" @fermer="aideGitLabOuverte = false" />
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
.onglets-fournisseur {
  display: flex;
  gap: 0.35rem;
  border-bottom: 1px solid #ddd;
  padding-bottom: 0.35rem;
}
.onglets-fournisseur button {
  border: 1px solid transparent;
  background: transparent;
  border-radius: 6px 6px 0 0;
  padding: 0.45rem 0.8rem;
  cursor: pointer;
}
.onglets-fournisseur button.actif {
  border-color: #ddd;
  border-bottom-color: white;
  background: #f5f9ff;
  color: #1565c0;
  font-weight: 600;
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
.aide-champ {
  display: block;
  margin-top: 0.35rem;
  color: #777;
  font-size: 0.72rem;
}
.intro-gitlab {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
}
.lien-aide-gitlab {
  flex-shrink: 0;
  border: 0;
  background: transparent;
  color: #1565c0;
  cursor: pointer;
  font-size: 0.76rem;
  text-decoration: underline;
}
.nouveau-projet-gitlab {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding-top: 0.75rem;
  border-top: 1px solid #ddd;
}
.q-lbl.secondaire {
  color: #555;
  font-size: 0.76rem;
}
.options-gitlab {
  padding: 0.55rem 0.7rem;
  border: 1px solid #d7e3ec;
  border-radius: 6px;
  background: #f7fafc;
}
.options-gitlab summary {
  cursor: pointer;
  color: #555;
  font-size: 0.78rem;
  font-weight: 600;
}
.options-gitlab .question {
  margin-top: 0.65rem;
}
.connexion-compacte {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  padding: 0.45rem 0.6rem;
  border: 1px solid #bfe3c2;
  border-radius: 6px;
  background: #edf7ee;
  color: #2e7d32;
  font-size: 0.78rem;
}
.action-gitlab {
  align-self: flex-end;
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
