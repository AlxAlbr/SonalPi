<script setup lang="ts">
import icoAnon from '../../assets/icones/anon.png'
import icoDonnees from '../../assets/icones/donnees.png'
import icoJournal from '../../assets/icones/journal.png'
import icoLocuteurs from '../../assets/icones/locuteurs.png'
import icoNotes from '../../assets/icones/notes.png'
import icoThemes from '../../assets/icones/themes.png'
</script>

<template>
  <aside class="panneau maison">
    <div class="corpus-tete">
      <h3>Entretien</h3>
    </div>
    <p class="raccourci">
      🎧 Raccourci : tapez <b>DEUX FOIS</b> sur la touche <b>Espace</b> dans l'éditeur
      pour lancer puis arrêter la lecture de l'audio.
    </p>
    <p class="raccourci">
      🔍 Raccourci : dans l'éditeur, <b>Ctrl+F</b> ouvre la recherche
      et le remplacement dans la transcription.
    </p>
    <ul class="liste-tours">
      <li>
        <img class="ico-onglet" :src="icoNotes" alt="" />
        <span><b>Notes</b> — notes structurées (post-collecte, résumé, réflexion…) ; mettez un passage en GRAS (important) ou en ITALIQUE lié à un commentaire.</span>
      </li>
      <li>
        <img class="ico-onglet" :src="icoLocuteurs" alt="" />
        <span><b>Locuteurs</b> — noms, interviewer, attribution des tours de parole.</span>
      </li>
      <li>
        <img class="ico-onglet" :src="icoAnon" alt="" />
        <span><b>Pseudonymisation du texte</b> — masquer les noms (barré + pseudo).</span>
      </li>
      <li>
        <img class="ico-onglet" :src="icoThemes" alt="" />
        <span><b>Thématiques</b> — sélectionnez du texte puis cliquez un thème pour le coder.</span>
      </li>
      <li>
        <img class="ico-onglet" :src="icoDonnees" alt="" />
        <span><b>Données</b> — valeurs de l'entretien et de chaque locuteur.</span>
      </li>
      <li>
        <img class="ico-onglet" :src="icoJournal" alt="" />
        <span><b>Journal</b> — suivi et annulation des actions de la session.</span>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.raccourci {
  background: #fff8e1;
  border: 1px solid #e0b93a;
  border-left: 4px solid #e0a03a;
  color: #5c4a00;
  border-radius: 6px;
  padding: 0.55rem 0.6rem;
  font-size: 0.82rem;
  margin: 0.2rem 0 0;
  line-height: 1.35;
}
.raccourci b {
  color: #a37000;
}
.liste-tours {
  list-style: none;
  margin: 0.9rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.liste-tours li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid #e5e5ef;
  border-radius: 6px;
  padding: 0.4rem 0.5rem;
  background: #fff;
  font-size: 0.8rem;
}
.ico-onglet {
  width: 20px;
  height: 20px;
  object-fit: contain;
  opacity: 0.55;
  flex: none;
}
</style>
