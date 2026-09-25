<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import { useProjetGitLab } from '../../composables/corpus/useProjetGitLab'

/** Assistant commun de création d'un corpus distant. */
const emit = defineEmits<{ (e: 'fermer'): void }>()
const { creerCorpusWebDAV, creerEtOuvrirGitLab } = utiliserSonal()

const fournisseur = ref<'nextcloud' | 'gitlab'>('nextcloud')
const stockageSecuriseDisponible = ref<boolean | null>(null)
const enCours = ref(false)
const erreur = ref<string | null>(null)

const urlServeur = ref('')
const utilisateur = ref('')
const motDePasse = ref('')
const nomCorpus = ref('')

const {
  urlProjet: urlProjetGitLab,
  jeton: jetonGitLab,
  racine: racineGitLab,
  projet: projetGitLab,
  demande: demandeGitLab,
  chargement: chargementGitLab,
  charger: chargerProjetGitLab,
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
const pretGitLab = computed(
  () => stockageSecuriseDisponible.value !== null &&
    !enCours.value &&
    demandeGitLab.value !== null &&
    nomCorpus.value.trim().length > 0,
)
const pret = computed(() => fournisseur.value === 'nextcloud' ? pretNextcloud.value : pretGitLab.value)

async function creer(): Promise<void> {
  if (!pret.value) return
  enCours.value = true
  erreur.value = null
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
          <span>
            Le secret restera uniquement en mémoire. Vous devrez le saisir après chaque
            redémarrage.
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
          <p class="intro">
            Le corpus sera créé dans un projet GitLab existant, à l'emplacement choisi.
          </p>
          <details class="aide-gitlab">
            <summary>Préparer la connexion GitLab</summary>
            <ol>
              <li>
                Créez ou faites créer un projet GitLab privé pour le corpus,
                initialisé avec un README pour disposer d’une branche par défaut.
              </li>
              <li>
                Vérifiez que votre compte et votre jeton peuvent lire le projet et écrire sur la
                branche par défaut. Si cette branche est protégée, autorisez les développeurs à y pousser.
              </li>
              <li>
                Saisissez l’adresse du projet ci-dessous et cliquez sur « Charger le projet ».
                La branche par défaut est détectée automatiquement. Cette étape ne crée rien sur GitLab.
              </li>
            </ol>
            <p>
              Le projet GitLab doit donc déjà exister. La branche par défaut est choisie
              automatiquement.
            </p>
          </details>
          <div class="question">
            <span class="q-lbl">Adresse du projet GitLab</span>
            <input
              v-model="urlProjetGitLab"
              class="champ url-projet-gitlab"
              type="text"
              placeholder="https://gitlab.exemple.org/mon-groupe/mon-corpus"
              spellcheck="false"
              :disabled="enCours"
            />
          </div>
          <div class="question">
            <span class="q-lbl">Jeton d'accès personnel</span>
            <input v-model="jetonGitLab" class="champ jeton-gitlab" type="password" :disabled="enCours" />
            <button
              class="mini charger-projet-gitlab"
              :disabled="enCours || !jetonGitLab || !urlProjetGitLab.trim()"
              @click="chargerProjetGitLab"
            >
              {{ chargementGitLab ? 'Chargement…' : 'Charger le projet' }}
            </button>
          </div>
          <template v-if="projetGitLab">
            <p class="note-secret">
              {{ projetGitLab.nomProjet }} — branche par défaut :
              <span class="branche-gitlab">{{ projetGitLab.branche }}</span>
            </p>
            <div class="question">
              <span class="q-lbl">Racine du corpus (facultatif)</span>
              <input v-model="racineGitLab" class="champ racine-gitlab" type="text" placeholder="donnees/mon-corpus" spellcheck="false" :disabled="enCours" />
            </div>
          </template>
        </template>

        <div class="question">
          <span class="q-lbl">Nom du corpus</span>
          <input v-model="nomCorpus" class="champ-nom" :disabled="enCours" type="text" placeholder="Nom du corpus" @keyup.enter="creer" />
        </div>

        <p v-if="erreur" class="msg">{{ erreur }}</p>

        <div class="pied-modale">
          <button class="annuler" :disabled="enCours" @click="emit('fermer')">Annuler</button>
          <button class="valider" :disabled="!pret" @click="creer">
            {{ enCours && !chargementGitLab ? 'Création sur le serveur…' : 'Créer le corpus et l’ouvrir' }}
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
.aide-gitlab {
  padding: 0.65rem 0.8rem;
  border: 1px solid #d7e3ec;
  border-radius: 6px;
  background: #f7fafc;
  color: #444;
  font-size: 0.78rem;
}
.aide-gitlab summary {
  cursor: pointer;
  color: #245b7a;
  font-weight: 600;
}
.aide-gitlab ol {
  margin: 0.6rem 0 0;
  padding-left: 1.2rem;
}
.aide-gitlab p {
  margin: 0.6rem 0 0;
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
