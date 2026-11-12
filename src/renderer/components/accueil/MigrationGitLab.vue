<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { MIGRATION_GITLAB_QUALIFIEE, type SourceMigrationGitLab } from '../../../shared/corpus/migrationGitLab'
import { EXT_VIDEO, extensionDe } from '../../../shared/media'
import { utiliserSonal } from '../../composables/sonal'
import { useMigrationGitLab } from '../../composables/corpus/useMigrationGitLab'
import BilanMigration from './BilanMigration.vue'

const props = defineProps<{ initial?: SourceMigrationGitLab }>()
const emit = defineEmits<{ fermer: [] }>()
const enCours = ref(false)
const erreur = ref<string | null>(null)
const { migrerGitLab, reprendreMigrationGitLab } = utiliserSonal()
const migration = useMigrationGitLab({ enCours, erreur }, undefined, undefined, {
  executer: migrerGitLab, reprendre: reprendreMigrationGitLab,
}, () => emit('fermer'))
if (props.initial) migration.utiliserSource(props.initial)
onMounted(() => { if (!props.initial) void migration.chargerSuivis() })
function fermer(): void {
  if (migration.publicationEnCours.value) void migration.arreter()
  emit('fermer')
}
const {
  source, cheminCrp, urlCible, externe,
  baseMediaUrl, baseMediaUtilisateur, baseMediaMotDePasse,
  bilan, progression, suivis, publicationEnCours,
} = migration
const pretBilan = computed(() => !enCours.value && Boolean(source.value && cheminCrp.value && urlCible.value.trim()) &&
  (!externe.value || Boolean(baseMediaUrl.value.trim() && baseMediaUtilisateur.value.trim() && baseMediaMotDePasse.value)))
const videosExternes = computed(() => bilan.value?.destinationMedia === 'externe' &&
  bilan.value.medias.some((media) => EXT_VIDEO.includes(extensionDe(media.cheminSource))))
const volume = computed(() => bilan.value
  ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(bilan.value.volumeOctets / (1024 * 1024)) : '')
</script>

<template>
  <Teleport to="body">
    <div class="voile-modale" @click.self="fermer">
      <div class="modale-migration-gitlab" role="dialog" aria-modal="true" aria-labelledby="titre-migration-gitlab">
        <h3 id="titre-migration-gitlab">{{ initial ? 'Passer à SonalPi2 — GitLab' : 'Reprendre un passage à SonalPi2' }}</h3>
        <p v-if="initial">Ce projet contient un corpus SonalPi1. Choisissez un autre dépôt pour sa version SonalPi2. La source reste intacte.</p>
        <p v-else>Retrouvez les passages préparés sur ce poste. Les copies déjà acquises seront vérifiées, sans recommencer les envois confirmés.</p>
        <p v-if="!MIGRATION_GITLAB_QUALIFIEE" class="avertissement">Seul le bilan est disponible pour le moment ; aucun fichier n’est envoyé.</p>

        <fieldset v-if="source" :disabled="enCours">
          <legend>Corpus et destination</legend>
          <p>Projet source : <b>{{ source.projet.nomProjet }}</b> — {{ source.projet.utilisateur }}</p>
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
            <label>Dossier média Nextcloud / WebDAV<input v-model="baseMediaUrl" type="url" placeholder="https://nuage.exemple.org/remote.php/dav/files/moi/Medias" /></label>
            <label>Login média<input v-model="baseMediaUtilisateur" autocomplete="username" /></label>
            <label>Mot de passe d’application média<input v-model="baseMediaMotDePasse" type="password" autocomplete="off" /></label>
          </template>
          <p v-else>Les médias seront copiés dans le nouveau dépôt GitLab.</p>
          <button type="button" :disabled="!pretBilan" @click="migration.preparerBilan(source.projet.compteId)">Préparer le bilan</button>
        </fieldset>
        <p v-if="enCours" role="status">{{ progression || 'Lecture de la source…' }}</p>
        <p v-if="erreur" role="alert" class="erreur">{{ erreur }}</p>
        <section v-if="bilan" class="bilan" aria-label="Bilan de migration">
          <h4>{{ bilan.apercu.nom }}</h4>
          <p>Source : {{ bilan.source.nomProjet }} — {{ bilan.cheminCrp }}</p>
          <p>Destination : {{ bilan.cible.nomProjet }}</p>
          <p>{{ bilan.entretiens.length }} entretien(s) vérifié(s), {{ bilan.medias.length }} média(s) à copier — {{ volume }} Mio.</p>
          <p>Médias : {{ bilan.destinationMedia === 'externe' ? 'espace externe déclaré' : 'nouveau dépôt GitLab' }}.</p>
          <p v-if="videosExternes" class="avertissement">Les vidéos seront copiées, mais leur lecture depuis cet espace externe n’est pas encore disponible. Pour les lire dans SonalPi, choisissez la copie dans GitLab.</p>
          <BilanMigration :apercu="bilan.apercu" :lexico="bilan.lexicoV1" :conservation="bilan.conservation" :afficher-entretiens="false" />
          <p v-if="bilan.conservation?.autres.length">Les documents supplémentaires seront conservés dans le nouveau dépôt GitLab, même si les médias vont dans un espace externe.</p>
          <p v-if="bilan.cible.branche === null">Le dépôt est vide et accepté pour la préparation.</p>
          <details><summary>Détails de la source</summary><p>Version source : <code>{{ bilan.commitSource }}</code></p></details>
          <button type="button" :disabled="enCours || !MIGRATION_GITLAB_QUALIFIEE" @click="migration.executer">Copier les médias et créer le corpus</button>
        </section>
        <section v-if="!initial" class="bilan" aria-label="Migrations suivies sur ce poste">
          <h4>Passages suivis sur ce poste</h4>
          <p v-if="!suivis.length && !erreur">Aucun passage à reprendre.</p>
          <article v-for="suivi in suivis" :key="suivi.operationId">
            <p>{{ suivi.bilan.apercu.nom }} → {{ suivi.bilan.cible.nomProjet }}</p>
            <p>{{ suivi.mediasConfirmes }}/{{ suivi.bilan.medias.length }} média(s) confirmé(s), {{ suivi.publicationsConfirmees }}/{{ suivi.publicationsTotal }} envoi(s) confirmé(s).</p>
            <p v-if="suivi.bilan.conservation?.autres.length">{{ suivi.autresConfirmes ?? 0 }}/{{ suivi.bilan.conservation.autres.length }} document(s) conservé(s) dans « Autres ».</p>
            <button type="button" :disabled="enCours || !MIGRATION_GITLAB_QUALIFIEE" @click="migration.reprendre(suivi)">{{ suivi.phase === 'terminee' || suivi.phase === 'ouverture' ? 'Ouvrir le corpus' : 'Vérifier et reprendre' }}</button>
          </article>
          <fieldset v-if="suivis.some((s) => s.bilan.destinationMedia === 'externe')" :disabled="enCours">
            <legend>Accès à l’espace média pour une reprise (si nécessaire)</legend>
            <label>Dossier média<input v-model="baseMediaUrl" type="url" /></label>
            <label>Login média<input v-model="baseMediaUtilisateur" /></label>
            <label>Mot de passe d’application<input v-model="baseMediaMotDePasse" type="password" autocomplete="off" /></label>
          </fieldset>
        </section>
        <button v-if="publicationEnCours" type="button" @click="migration.arreter">Arrêter après le fichier courant</button>
        <div class="actions"><button type="button" @click="fermer">{{ publicationEnCours ? 'Arrêter et fermer' : 'Fermer' }}</button></div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.voile-modale { position: fixed; inset: 0; background: #0007; display: flex; align-items: center; justify-content: center; z-index: 50; }
.modale-migration-gitlab { background: white; border-radius: 10px; padding: 1.2rem; width: min(620px, 94vw); max-height: 90vh; overflow-y: auto; font-size: .85rem; }
fieldset, label { display: grid; gap: .45rem; }
fieldset, .bilan { margin: .8rem 0; }
input, select, button { padding: .4rem; }
.choix-media { display: flex; align-items: center; }
.note { color: #586c81; }
.erreur { color: #b71c1c; }
.avertissement { color: #8a4b00; }
.actions { display: flex; justify-content: flex-end; }
</style>
