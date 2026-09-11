<script setup lang="ts">
import { ref, watch } from 'vue'
import { couleurPourLocuteur } from '../../../shared/entretien/locuteurs'
import { utiliserSonal } from '../../composables/sonal'
import RapprochementNommage from './RapprochementNommage.vue'

const props = defineProps<{ actif: boolean; lectureSeule: boolean }>()

const {
  lirePersonnes,
  locuteurs,
  attribuerLoc,
  renommerLoc,
  messagePersonnes,
  rapprochementNommage,
  rapprochementOccupe,
  reporterRapprochement,
  deciderRapprochement,
  nouveauLocuteur,
  setInterviewer,
  setPseudoLoc,
  choisirCouleurLoc,
  locuteurASupprimer,
  demanderSuppressionLocuteur,
  confirmerSuppressionLocuteur,
} = utiliserSonal()

const nomsPersonnesLiees = ref<Record<string, string>>({})
const liensPersonnesCharges = ref(false)
const erreurLiensPersonnes = ref('')
let lectureLiensPersonnes = 0

watch(
  () => [props.actif, locuteurs.value, ...locuteurs.value.map((locuteur) => locuteur.personneRef)],
  async () => {
    const lecture = ++lectureLiensPersonnes
    nomsPersonnesLiees.value = {}
    liensPersonnesCharges.value = false
    erreurLiensPersonnes.value = ''
    if (!props.actif || !locuteurs.value.some((locuteur) => locuteur.personneRef)) return
    try {
      const inventaire = await lirePersonnes()
      if (lecture !== lectureLiensPersonnes) return
      nomsPersonnesLiees.value = Object.fromEntries(
        inventaire.personnes.map((personne) => [personne.id, personne.nom]),
      )
      liensPersonnesCharges.value = true
    } catch {
      if (lecture === lectureLiensPersonnes) {
        erreurLiensPersonnes.value =
          'Le nom des personnes liées est indisponible. Consultez le répertoire Personnes.'
      }
    }
  },
  { immediate: true },
)
</script>

<template>
  <aside class="panneau">
    <div class="corpus-tete">
      <h3>Locuteurs</h3>
      <button v-if="!lectureSeule" class="mini" @click="nouveauLocuteur">+ Locuteur</button>
    </div>

    <div v-if="locuteurASupprimer" class="confirm-suppr">
      Supprimer « {{ locuteurASupprimer.nom }} » ? Ses
      <b>{{ locuteurASupprimer.nbBlocs }} bloc(s)</b> passent à « aucun » — <b>irréversible</b>.
      <div class="confirm-actions">
        <button class="danger" @click="confirmerSuppressionLocuteur">Supprimer</button>
        <button @click="locuteurASupprimer = null">Annuler</button>
      </div>
    </div>

    <div class="tableau-loc">
      <div class="tableau-loc-tetes">
        <span title="Couleur du nom — cliquer pour choisir"></span>
        <span>Nom</span>
        <span>Pseudo (optionnel)</span>
        <span title="Interviewer — pose les questions (tours en italique)">Interv.</span>
      </div>
      <RapprochementNommage
        v-if="rapprochementNommage"
        :key="`${rapprochementNommage.entretienId}:${rapprochementNommage.locuteurId}:${rapprochementNommage.nom}`"
        :cible="rapprochementNommage.cible"
        :sources="rapprochementNommage.sources"
        :nom="rapprochementNommage.nom"
        :lien-actuel="rapprochementNommage.lienActuel"
        :candidats="rapprochementNommage.candidats"
        :occupe="rapprochementOccupe"
        :message="messagePersonnes"
        @reporter="reporterRapprochement"
        @decider="deciderRapprochement"
      />
      <p
        v-if="messagePersonnes"
        :class="{ 'message-personne-creation': messagePersonnes.startsWith('Personne «') }"
        role="status"
      >{{ messagePersonnes }}</p>
      <p v-if="erreurLiensPersonnes" role="status">{{ erreurLiensPersonnes }}</p>
      <ul class="liste-loc">
        <li v-for="(l, i) in locuteurs" :key="l.index">
          <input
            type="color"
            class="carre-couleur"
            :value="l.couleur ?? couleurPourLocuteur(l.index)"
            :title="`Couleur du nom — choisir (actuelle : ${l.couleur ?? 'automatique'})`"
            :disabled="lectureSeule"
            @change="choisirCouleurLoc(l.index, ($event.target as HTMLInputElement).value)"
          />
          <input
            class="nom-loc"
            :data-tour="i === 0 ? 'nom-locuteur' : undefined"
            :value="l.nom"
            :disabled="lectureSeule"
            @change="renommerLoc(l.index, $event)"
          />
          <div class="pseudo-cell">
            <input
              class="pseudo-loc"
              :value="l.pseudo ?? ''"
              placeholder="pseudo…"
              title="Pseudonymise les étiquettes de ce locuteur (Nom̶ [pseudo])"
              :disabled="lectureSeule"
              @change="setPseudoLoc(l.index, ($event.target as HTMLInputElement).value)"
            />
          </div>
          <label class="interv" :title="`${l.nom} pose les questions (interviewer) — tours en italique`">
            <input
              type="checkbox"
              :checked="l.interviewer ?? false"
              :disabled="lectureSeule"
              @change="setInterviewer(l.index, ($event.target as HTMLInputElement).checked)"
            />
            <span class="glisseur"></span>
            <span class="q">?</span>
          </label>
          <button
            v-if="!lectureSeule"
            class="x-loc"
            title="Supprimer ce locuteur"
            @click="demanderSuppressionLocuteur(l.index)"
          >✕</button>
          <span v-if="l.personneRef && liensPersonnesCharges && !nomsPersonnesLiees[l.personneRef]" class="lien-personne-loc reference-personne-absente">
            Référence de personne absente : « {{ l.personneRef }} ». Corrigez cette association dans Personnes.
          </span>
          <span v-else-if="l.personneRef && !liensPersonnesCharges" class="lien-personne-loc">
            Association à « {{ l.personneRef }} » en cours de vérification.
          </span>
        </li>
      </ul>
    </div>
    <div class="attribuer">
      <span class="lbl">Attribuer le bloc courant ou la sélection :</span>
      <div class="boutons-loc">
        <button
          v-for="l in locuteurs"
          :key="l.index"
          class="attr"
          :disabled="lectureSeule"
          @click="attribuerLoc(l.index)"
        >
          <span :style="{ color: l.couleur ?? couleurPourLocuteur(l.index) }">{{ l.nom }}</span>
        </button>
        <button class="attr aucun" :disabled="lectureSeule" @click="attribuerLoc(null)">aucun</button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.locuteurs {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 0.6rem;
  background: #fafafe;
}
.liste-loc {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.tableau-loc-tetes,
.liste-loc li {
  display: grid;
  grid-template-columns: 1.2rem minmax(0, 1fr) 7rem 2.4rem 1.2rem;
  align-items: center;
  gap: 0.4rem;
}
.tableau-loc-tetes {
  font-size: 0.66rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-weight: 700;
  color: #999;
  padding: 0.15rem 0.3rem;
  border-bottom: 1px solid #e5e5ef;
  margin-bottom: 0.25rem;
  text-align: center;
}
.liste-loc li {
  min-width: 0;
}
.message-personne-creation {
  font-size: 0.75rem;
}
.lien-personne-loc {
  grid-column: 2 / -1;
  color: #595969;
  font-size: 0.72rem;
  overflow-wrap: anywhere;
}
.reference-personne-absente {
  color: #a82020;
  font-weight: 600;
}
.nom-loc {
  width: 100%;
  box-sizing: border-box;
  min-width: 0;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.15rem 0.35rem;
  font-size: 0.82rem;
}
.carre-couleur {
  width: 1rem;
  height: 1rem;
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  padding: 0;
  cursor: pointer;
  align-self: center;
  background: transparent;
}
.carre-couleur::-webkit-color-swatch-wrapper {
  padding: 0;
}
.carre-couleur::-webkit-color-swatch {
  border: none;
  border-radius: 3px;
}
.carre-couleur:hover {
  transform: scale(1.15);
}
.pseudo-cell {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  min-width: 0;
}
.pseudo-loc {
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  border: 1px solid #e2e2ea;
  border-radius: 4px;
  padding: 0.08rem 0.3rem;
  font-size: 0.7rem;
  color: #333;
}
.pseudo-loc::placeholder {
  color: #bbb;
  font-style: italic;
}
.interv,
.x-loc {
  justify-self: center;
}
.interv {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
  flex: none;
}
.interv input {
  display: none;
}
.glisseur {
  width: 26px;
  height: 14px;
  border-radius: 7px;
  background: #d5d5dd;
  position: relative;
  transition: background 0.15s;
}
.glisseur::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  transition: left 0.15s;
}
.interv input:checked + .glisseur {
  background: #2e73d8;
}
.interv input:checked + .glisseur::after {
  left: 14px;
}
.interv .q {
  font-size: 0.8rem;
  font-weight: 600;
  color: #aaa;
  font-style: italic;
}
.interv input:checked ~ .q {
  color: #1565c0;
}
.x-loc {
  border: none;
  background: none;
  color: #c33;
  cursor: pointer;
  font-size: 0.8rem;
  flex: none;
  opacity: 0.5;
}
.liste-loc li:hover .x-loc {
  opacity: 1;
}
.attribuer {
  margin-top: 0.9rem;
  border-top: 1px solid #eee;
  padding-top: 0.7rem;
}
.attribuer .lbl {
  font-size: 0.75rem;
  font-weight: 600;
  color: #444;
  text-decoration: underline;
  padding-bottom: 0.35rem;
}
.boutons-loc {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.6rem;
}
.attr {
  font-size: 0.75rem;
  font-weight: 700;
  border: 2px solid #000;
  border-radius: 5px;
  background: #fff;
  color: #333;
  padding: 0.15rem 0.5rem;
  cursor: pointer;
}
.attr:hover {
  background: #f5f5f5;
}
.attr.aucun {
  border-color: #999;
  color: #999;
}
</style>
