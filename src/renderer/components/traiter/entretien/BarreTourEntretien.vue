<script setup lang="ts">
/**
 *  Barre du tour de parole courant, au-dessus des onglets. Elle suit le curseur
 *  dans le texte ; les flèches permettent de passer d'un tour à l'autre sans
 *  déplacer le curseur. Le début et la fin se modifient sur place : on valide
 *  avec Entrée ou en quittant le champ. « Affiner » ouvre la fenêtre des temps du tour.
 */
import { nextTick, ref, watch } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import ChampTemps from './ChampTemps.vue'
import { formaterTemps, lireTemps } from '../../../../shared/entretien/horodatage'

const { barreTour, allerTourVoisin, tourHorodatage, enregistrerTempsTour, entretienEditable } = utiliserSonal()

const debutSaisi = ref('')
const finSaisie = ref('')
// Message de la fenêtre d'avertissement (chevauchement, saisie invalide), ou null.
const avertissement = ref<string | null>(null)
const popup = ref<HTMLDialogElement | null>(null)

/** Remet les champs sur les temps enregistrés du tour affiché. */
function remettreSaisie() {
  const bornes = barreTour.value?.bornes
  debutSaisi.value = bornes ? formaterTemps(bornes.debut) : ''
  finSaisie.value = bornes ? formaterTemps(bornes.fin) : ''
}
watch(
  () => [barreTour.value?.posBloc, barreTour.value?.bornes?.debut, barreTour.value?.bornes?.fin],
  remettreSaisie,
  { immediate: true },
)

/** Valide la saisie : enregistre si elle change les temps, sinon avertit et revient aux temps enregistrés. */
function valider() {
  const tour = barreTour.value
  const bornes = tour?.bornes
  if (!tour || !bornes || !entretienEditable.value) return
  const debut = lireTemps(debutSaisi.value)
  const fin = lireTemps(finSaisie.value)
  if (debut == null || fin == null) {
    avertissement.value = 'Temps non reconnu. Écrivez par exemple 12,4 ou 1:05.2.'
    remettreSaisie()
    return
  }
  if (debut === bornes.debut && fin === bornes.fin) return
  const message = enregistrerTempsTour(tour.posBloc, debut, fin)
  if (message) {
    avertissement.value = message
    remettreSaisie()
  }
}

function annulerSaisie() {
  remettreSaisie()
}

watch(avertissement, async (message) => {
  if (!message) return
  await nextTick()
  popup.value?.showModal()
})
function fermerAvertissement() {
  popup.value?.close()
  avertissement.value = null
}

function affiner() {
  if (barreTour.value) tourHorodatage.value = barreTour.value.posBloc
}
</script>

<template>
  <div v-if="barreTour" class="barre-tour" :style="{ '--couleur-tour': barreTour.couleur }">
    <div class="ligne-tour">
      <button
        type="button"
        class="fleche"
        :disabled="barreTour.rang <= 1"
        aria-label="Tour précédent"
        title="Tour précédent"
        @click="allerTourVoisin(-1)"
      >‹</button>
      <span class="nom" :title="barreTour.nom">{{ barreTour.nom }}</span>
      <span class="rang">{{ barreTour.rang }} / {{ barreTour.total }}</span>
      <button
        type="button"
        class="fleche"
        :disabled="barreTour.rang >= barreTour.total"
        aria-label="Tour suivant"
        title="Tour suivant"
        @click="allerTourVoisin(1)"
      >›</button>
    </div>
    <div class="ligne-tour secondaire">
      <template v-if="barreTour.bornes">
        <label class="temps" :style="{ color: barreTour.couleur }">
          Début
          <ChampTemps
            v-model="debutSaisi"
            style="--largeur-champ-temps: 4.4rem"
            aria-label="Début du tour"
            :disabled="!entretienEditable"
            @valider="valider"
            @annuler="annulerSaisie"
          />
        </label>
        <label class="temps" :style="{ color: barreTour.couleur }">
          Fin
          <ChampTemps
            v-model="finSaisie"
            style="--largeur-champ-temps: 4.4rem"
            aria-label="Fin du tour"
            :disabled="!entretienEditable"
            @valider="valider"
            @annuler="annulerSaisie"
          />
        </label>
      </template>
      <span v-else class="duree">Pas encore horodaté</span>
      <span class="espace"></span>
      <button type="button" class="affiner" @click="affiner">Affiner…</button>
    </div>
  </div>
  <Teleport to="body">
    <dialog
      ref="popup"
      class="popup-temps"
      aria-labelledby="titre-popup-temps"
      @close="avertissement = null"
    >
      <h2 id="titre-popup-temps">Temps non enregistrés</h2>
      <p>{{ avertissement }}</p>
      <div class="pied-popup">
        <button type="button" class="principal" @click="fermerAvertissement">OK</button>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.barre-tour {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid #c9d8ef;
  border-left: 4px solid var(--couleur-tour);
  border-radius: 8px;
  background: #eef4fc;
  color: #2b3d55;
  font-size: 0.85rem;
}
.ligne-tour {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
}
.secondaire {
  flex-wrap: wrap;
}
.nom {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-weight: 700;
  color: var(--couleur-tour);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rang,
.duree {
  color: #6b7480;
  white-space: nowrap;
}
.temps {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: #55708f;
  white-space: nowrap;
}
.saisie-temps {
  width: 4.4rem;
  box-sizing: border-box;
  padding: 0.1rem 0.35rem;
  border: 1px solid #c9d0da;
  border-radius: 5px;
  background: #fff;
  color: #2a5596;
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  font-size: 0.8rem;
}
.saisie-temps:focus {
  border-color: #2e73d8;
  outline: none;
}
.saisie-temps:disabled {
  background: #f3f4f6;
  color: #8a8f98;
}
.espace {
  flex: 1;
}
.fleche,
.affiner {
  padding: 0.15rem 0.5rem;
  border: 1px solid #c9d0da;
  border-radius: 5px;
  background: #fff;
  color: #2b3d55;
  cursor: pointer;
}
.fleche:hover:not(:disabled),
.affiner:hover {
  border-color: #2e73d8;
  color: #1565c0;
}
.fleche:disabled {
  opacity: 0.4;
  cursor: default;
}
.popup-temps {
  width: min(26rem, calc(100vw - 2rem));
  padding: 1.2rem 1.4rem;
  border: 1px solid #c9d8ef;
  border-radius: 10px;
  color: #2b3d55;
  background: #fff;
  box-shadow: 0 12px 40px #0003;
}
.popup-temps::backdrop {
  background: #0006;
}
.popup-temps h2 {
  margin: 0 0 0.6rem;
  font-size: 1.05rem;
}
.popup-temps p {
  margin: 0;
  line-height: 1.5;
}
.pied-popup {
  display: flex;
  justify-content: flex-end;
  margin-top: 1rem;
}
.popup-temps button.principal {
  padding: 0.35rem 1rem;
  border: 1px solid #1565c0;
  border-radius: 5px;
  background: #2e73d8;
  color: #fff;
  cursor: pointer;
}
</style>
