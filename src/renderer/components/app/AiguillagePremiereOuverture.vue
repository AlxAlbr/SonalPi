<script setup lang="ts">
/**
 *  Aiguillage de première ouverture sur ce poste.
 *  La fenêtre propose de corriger un entretien ou de gérer le projet.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { utiliserSonal } from '../../composables/sonal'

const {
  corrigerPremiereOuverturePossible,
  corrigerEntretienPremiereOuverture,
  gererProjetPremiereOuverture,
  fermerPremiereOuverture,
} = utiliserSonal()

const dialogue = ref<HTMLDialogElement | null>(null)
onMounted(() => dialogue.value?.showModal())
onBeforeUnmount(() => dialogue.value?.close())

async function corriger(): Promise<void> {
  await corrigerEntretienPremiereOuverture()
}
</script>

<template>
  <dialog
    ref="dialogue"
    class="modale-aiguillage"
    aria-labelledby="titre-aiguillage"
    @cancel.prevent="fermerPremiereOuverture"
  >
    <header>
      <h2 id="titre-aiguillage">Première ouverture de ce corpus</h2>
      <button class="fermer" aria-label="Fermer" title="Fermer" @click="fermerPremiereOuverture">×</button>
    </header>
    <p class="intro">
      Ce corpus n'a jamais été ouvert sur cet ordinateur.<br>Par quoi voulez-vous commencer ?
    </p>
    <div class="choix">
      <button
        class="choix-corriger"
        :autofocus="corrigerPremiereOuverturePossible"
        :disabled="!corrigerPremiereOuverturePossible"
        @click="corriger"
      >
        Télécharger un entretien pour le corriger
      </button>
      <p v-if="!corrigerPremiereOuverturePossible" class="indisponible">
        Aucun entretien n'est disponible dans ce corpus et vous ne pouvez pas en ajouter.
      </p>
      <button
        class="choix-projet"
        :autofocus="!corrigerPremiereOuverturePossible"
        @click="gererProjetPremiereOuverture"
      >
        Aller vers l'interface de gestion de projet
      </button>
    </div>
    <p class="note">
      Vous pourrez ensuite passer de l'un à l'autre quand vous voulez grâce aux boutons
      « Importer et traiter » et « Préparer et suivre » en haut de la fenêtre.
    </p>
  </dialog>
</template>

<style scoped>
.modale-aiguillage {
  width: min(560px, 92vw);
  box-sizing: border-box;
  border: 1px solid #b8c4d0;
  border-radius: 10px;
  padding: 1.2rem 1.4rem 1.4rem;
  color: #243347;
}
.modale-aiguillage::backdrop { background: rgb(0 0 0 / 45%); }
header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}
h2 {
  margin: 0;
  font-size: 1.15rem;
  color: #294c70;
}
.fermer {
  border: none;
  background: none;
  font-size: 1.1rem;
  line-height: 1;
  padding: 0.1rem 0.3rem;
  cursor: pointer;
  color: #607184;
}
.fermer:hover { color: #243347; }
.intro {
  margin: 0.6rem 0 1.1rem;
  font-size: 0.92rem;
  line-height: 1.5;
}
.choix {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.choix button {
  padding: 0.7rem 0.9rem;
  border-radius: 8px;
  border: 1px solid #c3dbf5;
  background: #fff;
  color: #175d9e;
  font: inherit;
  font-size: 0.95rem;
  text-align: left;
  cursor: pointer;
}
.choix button:hover { background: #f2f7fd; }
.choix button:disabled {
  border-color: #d8dee7;
  background: #f3f5f8;
  color: #7a8794;
  cursor: not-allowed;
}
.choix button:focus-visible { outline: 3px solid #a55b00; outline-offset: 2px; }
.choix button.choix-corriger {
  background: #e3f2fd;
  border-color: #1565c0;
  color: #0d47a1;
  font-weight: 600;
}
.choix button.choix-corriger:hover { background: #d3e9fb; }
.choix button.choix-corriger:disabled { background: #f3f5f8; }
.indisponible {
  margin: -0.15rem 0 0.15rem;
  font-size: 0.8rem;
  line-height: 1.4;
  color: #607184;
}
.note {
  margin: 1.1rem 0 0;
  font-size: 0.82rem;
  line-height: 1.5;
  color: #607184;
}
</style>
