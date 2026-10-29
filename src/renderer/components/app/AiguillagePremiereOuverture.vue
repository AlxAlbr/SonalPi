<script setup lang="ts">
/**
 *  Aiguillage de PREMIÈRE OUVERTURE : le corpus n'a jamais été consulté sur ce
 *  poste. Plutôt que de laisser l'utilisateur devant un espace de travail encore
 *  vide, la fenêtre propose les deux premiers gestes utiles — corriger un
 *  entretien ou gérer le projet — et rappelle que l'on passe ensuite librement
 *  de l'un à l'autre.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { utiliserSonal } from '../../composables/sonal'

const {
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
      <button class="choix-corriger" autofocus @click="corriger">
        Télécharger un entretien pour le corriger
      </button>
      <button class="choix-projet" @click="gererProjetPremiereOuverture">
        Aller vers l'interface de gestion de projet
      </button>
    </div>
    <p class="note">
      Vous pourrez ensuite passer de l'un à l'autre quand vous voulez <br>
      en passant de l'espace « Importer et traiter » : bouton "ajouter un entretien"
      à l'espace  « Préparer et suivre », onglet "Tableau de bord".
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
.choix button:focus-visible { outline: 3px solid #a55b00; outline-offset: 2px; }
.choix button.choix-corriger {
  background: #e3f2fd;
  border-color: #1565c0;
  color: #0d47a1;
  font-weight: 600;
}
.choix button.choix-corriger:hover { background: #d3e9fb; }
.note {
  margin: 1.1rem 0 0;
  font-size: 0.82rem;
  line-height: 1.5;
  color: #607184;
}
</style>
