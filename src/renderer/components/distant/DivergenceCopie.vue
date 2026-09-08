<script setup lang="ts">
import { utiliserSonal } from '../../composables/sonal'

/**
 *  Dialogue de FUSION ASSISTÉE — proposé à la
 *  RÉOUVERTURE d'un entretien dont une publication avait fini en divergence
 *  (412 : contournement du verrou). La copie mise de côté n'a jamais été ni
 *  perdue ni publiée en silence ; trois choix :
 *   « Fusionner »   : les apports de la copie (annotations, ancres, locuteurs,
 *                     valeurs) rejoignent le modèle ouvert — UNIQUEMENT si le
 *                     texte est identique des deux côtés (sinon pas de merge) ;
 *   « Jeter »       : abandon explicite de la copie ;
 *   « Plus tard »   : la copie reste en place, re-proposée à la prochaine
 *                     ouverture.
 */
const { divergenceProposee, confirmerFusion, jeterDivergence, plusTardDivergence, entretienEditable } =
  utiliserSonal()

const quand = (iso: string) => new Date(iso).toLocaleString()
</script>

<template>
  <Teleport to="body">
    <div v-if="divergenceProposee" class="voile-divergence">
      <div class="modale-divergence">
        <h3>⚠️ Copie de divergence</h3>
        <p class="intro">
          Une session précédente a modifié cet entretien mais sa publication a été
          refusée par le serveur (le fichier avait changé entre-temps). La copie du
          <b>{{ quand(divergenceProposee.date) }}</b> a été mise de côté localement —
          rien n'avait été écrasé. Qu'en faire ?
        </p>
        <p v-if="!entretienEditable" class="note verrou">
          🔒 Cet entretien est actuellement en lecture seule : la fusion nécessite
          notre verrou (« Plus tard », puis rouvrez-le sous verrou).
        </p>
        <p v-else-if="!divergenceProposee.fusionnable" class="note texte">
          Le texte a changé depuis la copie : la fusion automatique est impossible
          (on ne fusionne jamais deux textes) — gardez-la de côté ou jetez-la.
        </p>
        <div class="actions">
          <button
            class="primaire"
            :disabled="!divergenceProposee.fusionnable || !entretienEditable"
            @click="confirmerFusion"
          >
            Fusionner dans l'entretien ouvert
          </button>
          <button class="danger" @click="jeterDivergence">Jeter la copie</button>
          <button class="lien" @click="plusTardDivergence">Plus tard</button>
        </div>
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
  max-width: 34rem;
  box-shadow: 0 8px 40px rgb(0 0 0 / 25%);
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
.note.texte {
  background: #fff8e1;
  color: #7a5b00;
}
.note.verrou {
  background: #eef3fb;
  color: #2a4d7f;
}
.actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-top: 0.8rem;
}
button {
  border-radius: 6px;
  padding: 0.4rem 0.8rem;
  font-size: 0.88rem;
  cursor: pointer;
  border: 1px solid #ccc;
  background: #fff;
}
button.primaire {
  background: #1565c0;
  border-color: #1565c0;
  color: #fff;
}
button.primaire:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
button.danger {
  color: #b3261e;
  border-color: #e3b3af;
}
button.lien {
  border: none;
  background: none;
  color: #666;
}
</style>
