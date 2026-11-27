<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import { afficherErreurGlobale } from '../../erreurs'
import { comparerParagraphes, paragraphesDuTexte, type ParagrapheCompare } from '../../../shared/entretien/comparaisonVersions'
import type { EntretienFichier } from '../../../shared/format'

/**
 *  Dialogue proposé à l'ouverture d'un entretien quand des modifications faites sur ce poste
 *  n'ont pas pu être envoyées, parce que l'entretien avait été modifié ailleurs entre-temps.
 *  L'entretien ouvert montre la version du serveur ; celle de l'utilisateur est gardée à part.
 *  Il peut la consulter, la garder, ajouter ses annotations quand le texte est le même,
 *  la supprimer, ou décider plus tard : rien n'est jamais écrasé sans son choix.
 */
const {
  divergenceProposee,
  confirmerFusion,
  jeterDivergence,
  garderMaVersion,
  plusTardDivergence,
  entretienEditable,
  editor,
} = utiliserSonal()

const quand = (iso: string) => new Date(iso).toLocaleString()

/** Choix destructif en attente de confirmation. */
const confirmation = ref<'garder' | 'jeter' | null>(null)
const enCours = ref(false)
const versionVisible = ref(false)
const seulementDifferences = ref(true)
const comparaison = ref<ParagrapheCompare[]>([])

const copie = computed(() => divergenceProposee.value?.contenu as EntretienFichier | undefined)
const nbDifferences = computed(() => comparaison.value.filter((p) => p.different).length)
const paragraphesAffiches = computed(() =>
  seulementDifferences.value ? comparaison.value.filter((p) => p.different) : comparaison.value,
)

watch(divergenceProposee, () => {
  confirmation.value = null
  versionVisible.value = false
  comparaison.value = []
})

function basculerVersion() {
  versionVisible.value = !versionVisible.value
  if (versionVisible.value && copie.value) {
    comparaison.value = comparerParagraphes(copie.value.corpsTexte, editor.value?.getJSON() ?? null)
  }
}

async function copierTexte() {
  if (!copie.value) return
  try {
    await navigator.clipboard.writeText(paragraphesDuTexte(copie.value.corpsTexte).join('\n\n'))
  } catch (e) {
    afficherErreurGlobale(e, 'Le texte n’a pas pu être copié')
  }
}

async function executer(action: () => Promise<void>, titreErreur: string) {
  enCours.value = true
  try {
    await action()
  } catch (e) {
    afficherErreurGlobale(e, titreErreur)
  } finally {
    enCours.value = false
    confirmation.value = null
  }
}

function garder() {
  if (confirmation.value !== 'garder') { confirmation.value = 'garder'; return }
  void executer(garderMaVersion, 'Votre version n’a pas pu être reprise')
}
function jeter() {
  if (confirmation.value !== 'jeter') { confirmation.value = 'jeter'; return }
  void executer(jeterDivergence, 'Votre version n’a pas pu être supprimée')
}
function ajouterAnnotations() {
  void executer(confirmerFusion, 'Vos annotations n’ont pas pu être ajoutées')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="divergenceProposee" class="voile-divergence">
      <div class="modale-divergence" :class="{ large: versionVisible }" role="dialog" aria-label="Entretien modifié ailleurs">
        <h3>⚠️ Cet entretien a été modifié ailleurs</h3>
        <p class="intro">
          Pendant que vous travailliez sur cet entretien dans SonalPi, il a aussi été modifié ailleurs,
          par exemple sur le site Nextcloud. Pour ne rien écraser, vos modifications n’ont pas été envoyées :
          <b>votre version du {{ quand(divergenceProposee.date) }} est gardée sur ce poste</b>.
          L’entretien ouvert montre la version actuelle, celle du serveur.
        </p>
        <p v-if="!entretienEditable" class="note verrou">
          🔒 L’entretien est ouvert en lecture seule : vous pouvez consulter votre version,
          mais pour la garder, rouvrez l’entretien quand il sera disponible.
        </p>

        <ul class="choix">
          <li>
            <button :disabled="enCours" @click="basculerVersion">
              {{ versionVisible ? 'Masquer ma version' : 'Voir ma version' }}
            </button>
            <span>Affiche le texte de votre version et signale les passages qui diffèrent de la version actuelle.</span>
          </li>
          <li>
            <button class="primaire" :disabled="enCours || !entretienEditable" @click="garder">
              {{ confirmation === 'garder' ? 'Confirmer : garder ma version' : 'Garder ma version' }}
            </button>
            <span>Votre version remplace la version actuelle ; les modifications faites ailleurs sont perdues.</span>
          </li>
          <li v-if="divergenceProposee.fusionnable">
            <button :disabled="enCours || !entretienEditable" @click="ajouterAnnotations">Ajouter mes annotations</button>
            <span>Le texte est le même des deux côtés : vos thèmes, commentaires et valeurs sont ajoutés à la version actuelle.</span>
          </li>
          <li>
            <button class="danger" :disabled="enCours" @click="jeter">
              {{ confirmation === 'jeter' ? 'Confirmer : supprimer ma version' : 'Garder la version actuelle' }}
            </button>
            <span>Votre version est supprimée de ce poste. C’est définitif.</span>
          </li>
          <li>
            <button class="lien" :disabled="enCours" @click="plusTardDivergence">Décider plus tard</button>
            <span>Votre version reste gardée sur ce poste ; la question reviendra à la prochaine ouverture.</span>
          </li>
        </ul>

        <section v-if="versionVisible && copie" class="ma-version">
          <div class="entete-version">
            <b>Votre version du {{ quand(divergenceProposee.date) }}</b>
            <label><input v-model="seulementDifferences" type="checkbox"> Seulement les passages différents</label>
            <button @click="copierTexte">Copier tout le texte</button>
          </div>
          <p class="bilan">
            <template v-if="nbDifferences > 0">
              {{ nbDifferences }} passage{{ nbDifferences > 1 ? 's' : '' }} diffère{{ nbDifferences > 1 ? 'nt' : '' }}
              de la version actuelle.
            </template>
            <template v-else>Le texte est identique à la version actuelle.</template>
            Votre version compte {{ copie.annotations.length }} annotation{{ copie.annotations.length > 1 ? 's' : '' }}
            (thèmes, commentaires, pseudonymisation), non affichées ici.
          </p>
          <div class="texte-version">
            <p v-for="(p, i) in paragraphesAffiches" :key="i" :class="{ different: p.different }">{{ p.texte || ' ' }}</p>
            <p v-if="paragraphesAffiches.length === 0" class="vide">Aucun passage différent.</p>
          </div>
        </section>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.voile-divergence {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 35%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modale-divergence {
  background: #fff;
  border-radius: 10px;
  padding: 1.2rem 1.4rem;
  max-width: 38rem;
  max-height: 92vh;
  overflow-y: auto;
  box-shadow: 0 8px 40px rgb(0 0 0 / 25%);
}
.modale-divergence.large {
  max-width: min(60rem, 95vw);
}
h3 {
  margin: 0 0 0.6rem;
  font-size: 1.05rem;
}
.intro {
  font-size: 0.9rem;
  line-height: 1.45;
  margin: 0 0 0.6rem;
}
.note {
  font-size: 0.85rem;
  margin: 0 0 0.6rem;
  padding: 0.45rem 0.6rem;
  border-radius: 6px;
}
.note.verrou {
  background: #eef3fb;
  color: #2a4d7f;
}
.choix {
  list-style: none;
  margin: 0.8rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
}
.choix li {
  display: grid;
  grid-template-columns: 13rem 1fr;
  gap: 0.7rem;
  align-items: center;
  font-size: 0.85rem;
  color: #555;
}
button {
  border-radius: 6px;
  padding: 0.4rem 0.8rem;
  font-size: 0.88rem;
  cursor: pointer;
  border: 1px solid #ccc;
  background: #fff;
}
button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
button.primaire {
  background: #1565c0;
  border-color: #1565c0;
  color: #fff;
}
button.danger {
  color: #b3261e;
  border-color: #e3b3af;
}
button.lien {
  border: none;
  background: none;
  color: #666;
  text-align: left;
}
.ma-version {
  margin-top: 1rem;
  border-top: 1px solid #eee;
  padding-top: 0.8rem;
}
.entete-version {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  font-size: 0.88rem;
}
.entete-version button {
  margin-left: auto;
}
.bilan {
  font-size: 0.82rem;
  color: #666;
  margin: 0.5rem 0;
}
.texte-version {
  max-height: 45vh;
  overflow-y: auto;
  border: 1px solid #eee;
  border-radius: 6px;
  padding: 0.5rem 0.8rem;
  font-size: 0.88rem;
  line-height: 1.5;
}
.texte-version p {
  margin: 0 0 0.5rem;
  white-space: pre-wrap;
}
.texte-version p.different {
  background: #fff3cd;
  border-left: 3px solid #e0a800;
  padding-left: 0.4rem;
}
.texte-version p.vide {
  color: #888;
}
</style>
