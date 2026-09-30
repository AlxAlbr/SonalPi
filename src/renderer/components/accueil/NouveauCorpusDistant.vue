<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import { useProjetGitLab } from '../../composables/corpus/useProjetGitLab'
import AideGitLab from './AideGitLab.vue'

/** Assistant commun de création d'un corpus distant. */
const emit = defineEmits<{ (e: 'fermer'): void }>()
const { creerCorpusWebDAV, creerEtOuvrirGitLab } = utiliserSonal()

const fournisseur = ref<'nextcloud' | 'gitlab'>('nextcloud')
const stockageSecuriseDisponible = ref<boolean | null>(null)
const enCours = ref(false)
const erreur = ref<string | null>(null)
const aideGitLabOuverte = ref(false)

const urlServeur = ref('')
const utilisateur = ref('')
const motDePasse = ref('')
const nomCorpus = ref('')
const baseMediaUrl = ref('')
const baseMediaUtilisateur = ref('')
const baseMediaMotDePasse = ref('')

const {
  urlProjet: urlProjetGitLab,
  demande: demandeGitLab,
  chargement: chargementGitLab,
  clientId: clientIdGitLab,
  authentification: authentificationGitLab,
  jetonPersonnel: jetonPersonnelGitLab,
  comptes: comptesGitLab,
  compteChoisi: compteChoisiGitLab,
  compteCourant: compteCourantGitLab,
  connexionEnCours: connexionEnCoursGitLab,
  detecter: detecterInstanceGitLab,
  deconnecter: deconnecterGitLabOAuth,
  charger: preparerProjetGitLab,
} = useProjetGitLab({ enCours, erreur })

onMounted(async () => {
  stockageSecuriseDisponible.value =
    await window.sonal.distant.stockageSecuriseDisponible()
})

const urlPropre = computed(() => urlServeur.value.trim().replace(/\/+$/, ''))
const cibleAffichee = computed(() => {
  if (!urlPropre.value) return null
  try {
    const u = new URL(urlPropre.value)
    return `${u.host}${decodeURIComponent(u.pathname)}`
  } catch {
    return urlPropre.value
  }
})

const pretNextcloud = computed(
  () => stockageSecuriseDisponible.value !== null &&
    !enCours.value &&
    urlPropre.value.length > 0 &&
    utilisateur.value.trim().length > 0 &&
    motDePasse.value.length > 0 &&
    nomCorpus.value.trim().length > 0,
)
const baseMediaDemandee = computed(
  () => baseMediaUrl.value.trim().length > 0 ||
    baseMediaUtilisateur.value.trim().length > 0 ||
    baseMediaMotDePasse.value.length > 0,
)
const baseMediaPrete = computed(
  () => !baseMediaDemandee.value || (
    baseMediaUrl.value.trim().length > 0 &&
    baseMediaUtilisateur.value.trim().length > 0 &&
    baseMediaMotDePasse.value.length > 0
  ),
)
const pretGitLab = computed(
  () => stockageSecuriseDisponible.value !== null &&
    !enCours.value &&
    !chargementGitLab.value &&
    !connexionEnCoursGitLab.value &&
    urlProjetGitLab.value.trim().length > 0 &&
    nomCorpus.value.trim().length > 0 &&
    baseMediaPrete.value &&
    (authentificationGitLab.value === 'oauth' ||
      compteCourantGitLab.value?.connecte === true ||
      jetonPersonnelGitLab.value.trim().length > 0),
)
const pret = computed(() => fournisseur.value === 'nextcloud' ? pretNextcloud.value : pretGitLab.value)

async function creer(): Promise<void> {
  if (!pret.value) return
  erreur.value = null
  if (fournisseur.value === 'gitlab') {
    const projetPret = await preparerProjetGitLab()
    if (!projetPret || !demandeGitLab.value) return
  }
  enCours.value = true
  try {
    if (fournisseur.value === 'nextcloud') {
      await creerCorpusWebDAV({
        urlServeur: urlPropre.value,
        utilisateur: utilisateur.value.trim(),
        motDePasse: motDePasse.value,
        nomCorpus: nomCorpus.value.trim(),
      })
    } else if (demandeGitLab.value) {
      await creerEtOuvrirGitLab({
        ...demandeGitLab.value,
        nomCorpus: nomCorpus.value.trim(),
        ...(baseMediaDemandee.value
          ? {
              baseMedia: {
                urlBase: baseMediaUrl.value.trim(),
                utilisateur: baseMediaUtilisateur.value.trim(),
                motDePasse: baseMediaMotDePasse.value,
              },
            }
          : {}),
      })
    }
    emit('fermer')
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
          Choisissez un fournisseur, puis créez la copie de travail et son miroir local.
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
            Le mot de passe restera uniquement en mémoire. Vous devrez le saisir après chaque
            redémarrage.
          </span>
          <span v-else>
            Sonal ne conservera pas votre accès GitLab ni un éventuel mot de passe média.
            Après chaque redémarrage, vous devrez les saisir de nouveau.
          </span>
        </div>

        <template v-if="fournisseur === 'nextcloud'">
          <p class="intro">
            Le corpus sera créé dans un nouveau dossier de votre serveur Nextcloud.
          </p>
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
            Utilisez un mot de passe d'application Nextcloud, jamais votre mot de passe principal.
          </p>
        </template>

        <template v-else>
          <div class="intro-gitlab">
            <p class="intro">
              Le projet GitLab doit déjà exister. Sonal se chargera de la connexion,
              de sa vérification et de la création du corpus.
            </p>
            <button class="lien-aide-gitlab" type="button" @click="aideGitLabOuverte = true">
              Première utilisation ? Voir le guide de préparation GitLab
            </button>
          </div>
          <div class="question">
            <span class="q-lbl">Adresse du projet GitLab</span>
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
            <span class="q-lbl">Authentification</span>
            <select v-model="authentificationGitLab" class="champ" :disabled="enCours || connexionEnCoursGitLab">
              <option value="oauth">OAuth (recommandé)</option>
              <option value="jeton-personnel">Jeton d’accès GitLab</option>
            </select>
          </div>
          <div v-if="authentificationGitLab === 'oauth'" class="question">
            <span class="q-lbl">Client ID OAuth</span>
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
          <div v-else class="question">
            <span class="q-lbl">Jeton d’accès GitLab</span>
            <input
              v-model="jetonPersonnelGitLab"
              class="champ"
              type="password"
              placeholder="glpat-…"
              autocomplete="off"
              :disabled="enCours || chargementGitLab || connexionEnCoursGitLab"
            />
            <span class="aide-champ">Le jeton doit disposer du scope <code>api</code>.</span>
          </div>
          <div v-if="comptesGitLab.length > 1" class="question">
            <span class="q-lbl">Compte GitLab</span>
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
        </template>

        <div class="question">
          <span class="q-lbl">Nom du corpus</span>
          <input v-model="nomCorpus" class="champ-nom" :disabled="enCours" type="text" placeholder="Nom du corpus" @keyup.enter="creer" />
        </div>

        <details v-if="fournisseur === 'gitlab'" class="options-gitlab">
          <summary>Médias partagés (facultatif)</summary>
          <div class="base-media-form">
            <label class="question">
              <span class="q-lbl">Dossier WebDAV des médias</span>
              <input
                v-model="baseMediaUrl"
                class="champ"
                type="text"
                placeholder="https://nuage.exemple.org/remote.php/dav/files/moi/Medias"
                spellcheck="false"
                :disabled="enCours"
              />
            </label>
            <div class="ligne-2">
              <label class="question">
                <span class="q-lbl">Identifiant WebDAV</span>
                <input
                  v-model="baseMediaUtilisateur"
                  class="champ"
                  type="text"
                  spellcheck="false"
                  :disabled="enCours"
                />
              </label>
              <label class="question">
                <span class="q-lbl">Mot de passe d’application</span>
                <input
                  v-model="baseMediaMotDePasse"
                  class="champ"
                  type="password"
                  :disabled="enCours"
                />
              </label>
            </div>
            <span class="aide-champ">
              Les médias restent hors de GitLab. L’adresse et le mot de passe restent
              uniquement sur ce poste. Cette configuration pourra aussi être ajoutée plus tard.
            </span>
          </div>
        </details>

        <p v-if="erreur" class="msg">{{ erreur }}</p>

        <div class="pied-modale">
          <button class="annuler" :disabled="enCours" @click="emit('fermer')">Annuler</button>
          <button class="valider" :disabled="!pret" @click="creer">
            {{ fournisseur === 'gitlab' && (chargementGitLab || connexionEnCoursGitLab)
              ? 'Connexion et vérification…'
              : enCours ? 'Création sur le serveur…' : 'Créer le corpus et l’ouvrir' }}
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
.modale-nouveau-distant {
  width: min(600px, 94vw);
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
  color: #777;
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
  font-size: 0.76rem;
  text-decoration: underline;
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
.base-media-form {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-top: 0.65rem;
}
.options-gitlab .base-media-form .question {
  margin-top: 0;
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
.mini {
  border: 1px solid #ccc;
  border-radius: 5px;
  background: #fff;
  padding: 0.25rem 0.6rem;
  font-size: 0.75rem;
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
button {
  cursor: pointer;
}
button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
