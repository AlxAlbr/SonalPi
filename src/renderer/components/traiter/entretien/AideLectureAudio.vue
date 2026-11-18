<script setup lang="ts">
import { ref } from 'vue'

const dialogue = ref<HTMLDialogElement | null>(null)
</script>

<template>
  <button
    type="button"
    class="aide-lecture"
    title="Raccourcis clavier du lecteur"
    aria-label="Aide sur les raccourcis clavier du lecteur"
    aria-haspopup="dialog"
    @click="dialogue?.showModal()"
  >
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 9.5h.01M9 9.5h.01M12 9.5h.01M15 9.5h.01M18 9.5h.01M6 12h.01M9 12h.01M12 12h.01M15 12h.01M18 12h.01M8 15h8" />
    </svg>
  </button>
  <Teleport to="body">
    <dialog ref="dialogue" class="dialogue-aide-lecture" aria-label="Raccourcis clavier du lecteur">
      <h2>Contrôler la lecture au clavier</h2>
      <p>Dans le texte de l’entretien, appuyez deux fois rapidement sur la même touche :</p>
      <ul>
        <li><strong>Espace</strong> : lancer la lecture ou la mettre en pause.</li>
        <li><strong>Alt gauche</strong> : reculer de 5 secondes.</li>
        <li><strong>Alt Gr (Alt droite)</strong> : avancer de 5 secondes.</li>
      </ul>
      <p>Vous pouvez ainsi écouter et transcrire sans revenir au bouton de lecture.</p>
      <form method="dialog">
        <button type="submit" autofocus>Fermer</button>
      </form>
    </dialog>
  </Teleport>
</template>

<style scoped>
/* Icône clavier au bout de la ligne de commandes du lecteur. */
.aide-lecture {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  height: 1.6rem;
  padding: 0 0.45rem;
  border: 1px solid #ccc;
  border-radius: 5px;
  background: #fff;
  color: #2b3d55;
  cursor: pointer;
}
.aide-lecture:hover {
  border-color: #2e73d8;
  color: #1565c0;
}
.dialogue-aide-lecture {
  max-width: min(28rem, calc(100vw - 4rem));
  padding: 1.4rem;
  border: 1px solid #c9d8ef;
  border-radius: 10px;
  color: #2b3d55;
  background: #fff;
  box-shadow: 0 12px 40px #0003;
}
.dialogue-aide-lecture::backdrop {
  background: #0006;
}
.dialogue-aide-lecture h2 {
  margin: 0 0 1rem;
  font-size: 1.1rem;
}
.dialogue-aide-lecture p,
.dialogue-aide-lecture li {
  line-height: 1.5;
}
.dialogue-aide-lecture form {
  display: flex;
  justify-content: flex-end;
  margin-top: 1.2rem;
}
.dialogue-aide-lecture button {
  padding: 0.4rem 0.9rem;
  border: 1px solid #1565c0;
  border-radius: 5px;
  background: #2e73d8;
  color: #fff;
  cursor: pointer;
}
</style>
