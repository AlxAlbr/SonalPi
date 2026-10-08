<script setup lang="ts">
import { utiliserSonal } from '../../composables/sonal'
import icoAnon from '../../assets/icones/anon.png'
import icoDonnees from '../../assets/icones/donnees.png'
import icoJournal from '../../assets/icones/journal.png'
import icoLocuteurs from '../../assets/icones/locuteurs.png'
import icoNotes from '../../assets/icones/notes.png'
import icoThemes from '../../assets/icones/themes.png'

const { pasAPas, etapes, etapeCourante, etatParcours, voirParcours } = utiliserSonal()
</script>

<template>
  <aside class="panneau maison">
    <div class="corpus-tete">
      <h3>Entretien</h3>
    </div>
    <section v-if="pasAPas" class="rappel-parcours" aria-labelledby="rappel-parcours-titre">
      <div id="rappel-parcours-titre" class="rappel-titre">Découverte pas à pas</div>
      <p class="rappel-progression">{{ etatParcours.nombreRealisees }} étapes sur {{ etapes.length }} réalisées</p>
      <p v-if="etapeCourante" class="rappel-etat">Étape en cours : <b>{{ etapeCourante.titre }}</b></p>
      <p v-else-if="etatParcours.termine" class="rappel-etat">Parcours terminé.</p>
      <p v-else class="rappel-etat">Continuez le parcours depuis l’Accueil du corpus.</p>
      <button class="voir-parcours" @click="voirParcours">Voir le parcours dans le corpus</button>
    </section>
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
.rappel-parcours {
  border: 1px solid #a9c5e8;
  border-left: 4px solid #2e73d8;
  border-radius: 6px;
  background: #f0f6ff;
  padding: 0.5rem 0.6rem;
  margin: 0.2rem 0 0.55rem;
}
.rappel-titre {
  color: #1565c0;
  font-size: 0.85rem;
  font-weight: 700;
}
.rappel-progression,
.rappel-etat {
  font-size: 0.77rem;
  line-height: 1.3;
  margin: 0.2rem 0 0;
}
.rappel-progression {
  color: #596579;
}
.voir-parcours {
  border: 1px solid #2e73d8;
  border-radius: 5px;
  background: #fff;
  color: #1565c0;
  cursor: pointer;
  font-size: 0.76rem;
  margin-top: 0.4rem;
  padding: 0.3rem 0.55rem;
}
.voir-parcours:hover {
  background: #e4effd;
}
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
