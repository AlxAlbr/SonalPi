<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { MIGRATION_GITLAB_QUALIFIEE } from '../../../shared/corpus/migrationGitLab'
import { utiliserSonal } from '../../composables/sonal'
import { useSourceMigrationGitLab } from '../../composables/corpus/useSourceMigrationGitLab'
import { useMigrationGitLab } from '../../composables/corpus/useMigrationGitLab'
import AideGitLab from './AideGitLab.vue'

const emit = defineEmits<{ (e: 'fermer'): void }>()
const enCours = ref(false)
const erreur = ref<string | null>(null)
const aide = ref(false)
const { migrerGitLab, reprendreMigrationGitLab } = utiliserSonal()
const migration = useMigrationGitLab({ enCours, erreur }, undefined, undefined, {
  executer: migrerGitLab, reprendre: reprendreMigrationGitLab,
})
function fermer(): void {
  if (migration.publicationEnCours.value) void migration.arreter()
  emit('fermer')
}
const {
  source, cheminCrp, urlCible, externe,
  baseMediaUrl, baseMediaUtilisateur, baseMediaMotDePasse,
  bilan, progression, suivis, publicationEnCours,
} = migration
const {
  urlProjet, authentification, clientId, jetonPersonnel,
  comptes, compteChoisi, compteCourant, connexionEnCours, chargement,
  detecter, charger, destinations, destinationId, destination, selectionEnCours, connexionAReprendre,
  chargerDestinations,
} = useSourceMigrationGitLab({ enCours, erreur }, migration.chargerSource, migration.abandonner)

onMounted(() => { void migration.chargerSuivis(); void chargerDestinations() })
const occupe = computed(() => enCours.value || connexionEnCours.value || chargement.value || selectionEnCours.value)
const pretBilan = computed(() =>
  !occupe.value && Boolean(source.value && cheminCrp.value && urlCible.value.trim()) &&
  Boolean(compteCourant.value?.connecte) &&
  (!externe.value || Boolean(baseMediaUrl.value.trim() && baseMediaUtilisateur.value.trim() && baseMediaMotDePasse.value)),
)
const volume = computed(() => bilan.value
  ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(bilan.value.volumeOctets / (1024 * 1024))
  : '')
</script>

<template>
  <Teleport to="body">
    <div class="voile-modale" @click.self="fermer">
      <div class="modale-migration-gitlab" role="dialog" aria-modal="true" aria-labelledby="titre-migration-gitlab">
        <h3 id="titre-migration-gitlab">Migration SonalPi1 — GitLab</h3>
        <p>Préparez la reprise d’un corpus dans un nouveau dépôt GitLab. La source reste intacte.</p>
        <p v-if="!MIGRATION_GITLAB_QUALIFIEE" class="avertissement">Seul le bilan est disponible pour le moment. La copie et la reprise attendent leur qualification réelle ; aucun fichier n’est envoyé.</p>

        <fieldset :disabled="occupe">
          <legend>1 — Dépôt SonalPi1</legend>
          <label v-if="destinations.length">Projet source
            <select v-model="destinationId">
              <option value="">Nouveau projet — saisir son adresse</option>
              <option v-for="connue in destinations" :key="connue.id" :value="connue.id">{{ connue.nomProjet }} — {{ connue.utilisateur }} ({{ connue.urlInstance }} · {{ connue.branche }}{{ connue.racine ? ` · ${connue.racine}` : '' }})</option>
            </select>
          </label>
          <p v-if="destination" class="note">Les accès du compte « {{ destination.utilisateur }} » sont réutilisés. Le corpus enregistré reste intact et n’est pas ouvert pendant cette préparation.</p>
          <label v-if="!destinationId">Adresse du projet source
            <input v-model="urlProjet" type="url" placeholder="https://gitlab.exemple.org/groupe/corpus-v1" spellcheck="false" @change="detecter" />
          </label>
          <label v-if="!destinationId">Connexion GitLab
            <select v-model="authentification">
              <option value="oauth">OAuth (recommandé)</option>
              <option value="jeton-personnel">Jeton d’accès GitLab</option>
            </select>
          </label>
          <template v-if="!compteCourant?.connecte || connexionAReprendre">
            <p v-if="destinationId">Une connexion avec le compte de ce projet est nécessaire.</p>
            <label v-if="authentification === 'oauth'">Client ID OAuth
              <input v-model="clientId" placeholder="Laissez vide si cette instance est déjà connue" spellcheck="false" />
            </label>
            <label v-else>Jeton d’accès GitLab (scope api)
              <input v-model="jetonPersonnel" type="password" autocomplete="off" />
            </label>
          </template>
          <label v-if="!destinationId && comptes.length > 1">Compte
            <select v-model="compteChoisi">
              <option v-for="compte in comptes" :key="compte.id" :value="compte.id">{{ compte.utilisateur }}</option>
            </select>
          </label>
          <p v-if="compteCourant?.connecte && !connexionAReprendre">Connecté : {{ compteCourant.utilisateur }}</p>
          <button type="button" :disabled="!destinationId && !urlProjet.trim()" @click="charger">{{ compteCourant?.connecte && !connexionAReprendre ? 'Lire la source' : 'Se connecter et lire la source' }}</button>
          <button type="button" @click="aide = true">Aide à la connexion GitLab</button>
        </fieldset>

        <fieldset v-if="source" :disabled="occupe">
          <legend>2 — Corpus et destination</legend>
          <label v-if="source.corpus.length > 1">Corpus à migrer
            <select v-model="cheminCrp">
              <option value="" disabled>Choisir un fichier .crp</option>
              <option v-for="chemin in source.corpus" :key="chemin" :value="chemin">{{ chemin }}</option>
            </select>
          </label>
          <p v-else>Corpus : {{ cheminCrp }}</p>
          <label>Adresse du nouveau projet GitLab
            <input v-model="urlCible" type="url" placeholder="https://gitlab.exemple.org/groupe/corpus-v2" spellcheck="false" />
          </label>
          <p class="note">Sur la même instance et accessible au compte connecté. Un dépôt vide ou initialisé uniquement par un README, une licence ou des fichiers de configuration Git convient.</p>
          <label class="choix-media"><input v-model="externe" type="checkbox" /> Copier les médias dans un espace externe</label>
          <template v-if="externe">
            <label>Dossier média Nextcloud / WebDAV
              <input v-model="baseMediaUrl" type="url" placeholder="https://nuage.exemple.org/remote.php/dav/files/moi/Medias" spellcheck="false" />
            </label>
            <label>Login média<input v-model="baseMediaUtilisateur" autocomplete="username" /></label>
            <label>Mot de passe d’application média<input v-model="baseMediaMotDePasse" type="password" autocomplete="off" /></label>
          </template>
          <p v-else>Les médias seront copiés dans le nouveau dépôt GitLab.</p>
          <button type="button" :disabled="!pretBilan" @click="migration.preparerBilan(compteChoisi!)">Préparer le bilan</button>
        </fieldset>

        <p v-if="occupe" role="status">{{ progression || 'Connexion et lecture de la source…' }}</p>
        <p v-if="erreur" role="alert" class="erreur">{{ erreur }}</p>
        <section v-if="bilan" class="bilan" aria-label="Bilan de migration">
          <h4>{{ bilan.apercu.nom }}</h4>
          <p>Source : {{ bilan.source.nomProjet }} — {{ bilan.cheminCrp }}</p>
          <p>Destination : {{ bilan.cible.nomProjet }}</p>
          <p>{{ bilan.entretiens.length }} entretien(s) vérifié(s), {{ bilan.medias.length }} média(s) à copier — {{ volume }} Mio.</p>
          <p>Médias : {{ bilan.destinationMedia === 'externe' ? 'espace externe déclaré' : 'nouveau dépôt GitLab' }}.</p>
          <p v-if="bilan.cible.branche === null">Le dépôt est vide et accepté pour la préparation.</p>
          <details>
            <summary>Détails de la source</summary>
            <p>Version source : <code>{{ bilan.commitSource }}</code></p>
            <p>{{ bilan.apercu.themes.length }} thème(s), {{ bilan.apercu.variables.length }} variable(s).</p>
          </details>
          <button type="button" :disabled="occupe || !MIGRATION_GITLAB_QUALIFIEE" @click="migration.executer">{{ MIGRATION_GITLAB_QUALIFIEE ? 'Copier les médias et créer le corpus' : 'Migrer (pas encore disponible)' }}</button>
        </section>
        <section v-if="suivis.length" class="bilan" aria-label="Migrations suivies sur ce poste">
          <h4>Migrations suivies sur ce poste</h4>
          <article v-for="suivi in suivis" :key="suivi.operationId">
            <p>{{ suivi.bilan.apercu.nom }} → {{ suivi.bilan.cible.nomProjet }}</p>
            <p>{{ suivi.mediasConfirmes }}/{{ suivi.bilan.medias.length }} média(s) confirmé(s), {{ suivi.publicationsConfirmees }}/{{ suivi.publicationsTotal }} envoi(s) confirmé(s).</p>
            <button type="button" :disabled="occupe || !MIGRATION_GITLAB_QUALIFIEE" @click="migration.reprendre(suivi)">{{ suivi.phase === 'terminee' ? 'Ouvrir le corpus' : 'Vérifier et reprendre' }}</button>
          </article>
          <fieldset v-if="suivis.some((s) => s.bilan.destinationMedia === 'externe')" :disabled="occupe">
            <legend>Accès à l’espace média pour une reprise (si nécessaire)</legend>
            <label>Dossier média<input v-model="baseMediaUrl" type="url" /></label>
            <label>Login média<input v-model="baseMediaUtilisateur" autocomplete="username" /></label>
            <label>Mot de passe d’application<input v-model="baseMediaMotDePasse" type="password" autocomplete="off" /></label>
          </fieldset>
        </section>
        <button v-if="publicationEnCours" type="button" @click="migration.arreter">Arrêter après le fichier courant</button>
        <div class="actions"><button type="button" @click="fermer">{{ publicationEnCours ? 'Arrêter et fermer' : 'Fermer' }}</button></div>
      </div>
    </div>
    <AideGitLab v-if="aide" @fermer="aide = false" />
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
.modale-migration-gitlab {
  background: white;
  border-radius: 10px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
  padding: 1.2rem;
  width: min(580px, 92vw);
  max-height: 90vh;
  overflow-y: auto;
  font-size: 0.85rem;
}
fieldset { border: 1px solid #ddd; border-radius: 6px; margin: 1rem 0; }
label { display: flex; flex-direction: column; gap: 0.3rem; margin: 0.6rem 0; }
input, select { padding: 0.4rem; min-width: 0; }
.choix-media { flex-direction: row; align-items: center; }
button { padding: 0.4rem 0.7rem; margin: 0.2rem; cursor: pointer; }
button:disabled { cursor: not-allowed; }
.note { color: #666; font-size: 0.78rem; }
.avertissement { background: #fff4df; padding: 0.6rem; border-radius: 5px; }
.erreur { color: #b71c1c; }
.bilan { background: #f1f7fa; padding: 0.8rem; border-radius: 5px; }
.actions { display: flex; justify-content: flex-end; margin-top: 1rem; }
code { overflow-wrap: anywhere; }
</style>
