<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { couleurPourLocuteur } from '../../../../shared/entretien/locuteurs'
import { utiliserSonal } from '../../../composables/sonal'
import RapprochementNommage from './RapprochementNommage.vue'
import StatistiquesLocuteurs from './StatistiquesLocuteurs.vue'

const props = defineProps<{ actif: boolean; lectureSeule: boolean; statistiquesOuvertes: boolean }>()
const emit = defineEmits<{
  'update:statistiquesOuvertes': [ouvertes: boolean]
  naviguerStatistique: [selection: { loc: number | null; pos: number }]
}>()

const {
  lirePersonnes,
  locuteurs,
  ouvertId,
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
  vue,
} = utiliserSonal()

const gestionOuverte = ref(false)
const boutonGestion = ref<HTMLButtonElement | null>(null)
const boutonFermerGestion = ref<HTMLButtonElement | null>(null)
watch(ouvertId, () => { emit('update:statistiquesOuvertes', false) })
const nomsPersonnesLiees = ref<Record<string, string>>({})
const liensPersonnesCharges = ref(false)
const erreurLiensPersonnes = ref('')
let lectureLiensPersonnes = 0

async function ouvrirGestion() {
  gestionOuverte.value = true
  await nextTick()
  boutonFermerGestion.value?.focus()
}

async function fermerGestion() {
  gestionOuverte.value = false
  await nextTick()
  boutonGestion.value?.focus()
}

function garderFocusDansGestion(event: KeyboardEvent) {
  if (event.key !== 'Tab') return
  const boutonsEtChamps = document.querySelectorAll<HTMLElement>(
    '.modale-locuteurs button:not([disabled]), .modale-locuteurs input:not([disabled])',
  )
  const premier = boutonsEtChamps.item(0)
  const dernier = boutonsEtChamps.item(boutonsEtChamps.length - 1)
  if (event.shiftKey && document.activeElement === premier) {
    event.preventDefault()
    dernier?.focus()
  } else if (!event.shiftKey && document.activeElement === dernier) {
    event.preventDefault()
    premier?.focus()
  }
}

// L'écran entretien reste monté quand on le quitte : la fenêtre doit se fermer avec lui.
watch(vue, (ecran) => {
  if (ecran !== 'entretien') gestionOuverte.value = false
})

// Quand l'élément actif disparaît de la liste, le focus revient dans la fenêtre,
// sinon Échap et Tab cesseraient d'y fonctionner.
watch(
  () => [locuteurs.value.length, locuteurASupprimer.value],
  async () => {
    if (!gestionOuverte.value) return
    await nextTick()
    if (document.activeElement === document.body) boutonFermerGestion.value?.focus()
  },
)

// Ne relit les personnes que si les liens changent, pas à chaque ajout de locuteur.
watch(
  () => JSON.stringify([props.actif, ouvertId.value, locuteurs.value.map((locuteur) => locuteur.personneRef).filter(Boolean)]),
  async () => {
    const lecture = ++lectureLiensPersonnes
    const references = locuteurs.value.flatMap((locuteur) => locuteur.personneRef ?? [])
    erreurLiensPersonnes.value = ''
    // Les noms déjà connus restent affichés pendant la relecture, pour éviter un clignotement.
    if (!references.every((reference) => nomsPersonnesLiees.value[reference])) {
      nomsPersonnesLiees.value = {}
      liensPersonnesCharges.value = false
    }
    if (!props.actif || !references.length) return
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
  <aside class="panneau locuteurs-coder">
    <div class="corpus-tete">
      <div class="actions-locuteurs">
        <button
          ref="boutonGestion"
          v-if="!lectureSeule"
          class="crayon"
          title="Modifier les locuteurs"
          aria-label="Modifier les locuteurs"
          @click="ouvrirGestion"
        >✏️</button>
      </div>
    </div>

    <div class="attribuer">
      <span class="lbl">Attribuer le bloc courant<br />ou la sélection :</span>
      <div class="boutons-loc">
        <button
          v-for="l in locuteurs"
          :key="l.index"
          class="attr"
          :disabled="lectureSeule"
          @click="attribuerLoc(l.index)"
        >
          <span class="pastille-locuteur" :style="{ background: l.couleur ?? couleurPourLocuteur(l.index) }"></span>
          <span :style="{ color: l.couleur ?? couleurPourLocuteur(l.index) }">{{ l.nom }}</span>
        </button>
        <button class="attr aucun" :disabled="lectureSeule" @click="attribuerLoc(null)">aucun</button>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="gestionOuverte"
        class="voile voile-locuteurs"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titre-gestion-locuteurs"
        @click.self="fermerGestion"
        @keydown.esc.stop.prevent="fermerGestion"
        @keydown="garderFocusDansGestion"
      >
        <section class="modale-locuteurs">
          <div class="corpus-tete">
            <h3 id="titre-gestion-locuteurs">Gestion des locuteurs</h3>
            <button class="mini" @click="nouveauLocuteur">+ Locuteur</button>
            <button
              ref="boutonFermerGestion"
              class="fermer"
              title="Fermer la gestion des locuteurs"
              aria-label="Fermer la gestion des locuteurs"
              @click="fermerGestion"
            >✕</button>
          </div>
          <p class="aide-gestion-locuteurs">Modifiez les noms, couleurs, pseudos et rôles, ou ajoutez et supprimez des locuteurs.</p>
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
        </section>
      </div>
    </Teleport>
    <details
      class="statistiques-locuteurs"
      :open="statistiquesOuvertes"
      @toggle="emit('update:statistiquesOuvertes', ($event.target as HTMLDetailsElement).open)"
    >
      <summary>Statistiques des locuteurs</summary>
      <StatistiquesLocuteurs v-if="statistiquesOuvertes && actif" @naviguer="emit('naviguerStatistique', $event)" />
    </details>
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
  gap: 0.6rem;
}
.tableau-loc-tetes,
.liste-loc li {
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr) minmax(0, 1fr) 3.5rem 2.25rem;
  align-items: center;
  gap: 0.4rem;
}
.tableau-loc-tetes {
  font-size: 14px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-weight: 700;
  color: #666;
  padding: 0.15rem 0.3rem;
  border-bottom: 1px solid #e5e5ef;
  margin-bottom: 0.25rem;
  text-align: center;
}
.liste-loc li {
  min-width: 0;
}
.message-personne-creation {
  font-size: 14px;
}
.lien-personne-loc {
  grid-column: 2 / -1;
  color: #595969;
  font-size: 14px;
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
  padding: 0.45rem 0.5rem;
  font-size: 14px;
}
.carre-couleur {
  width: 2rem;
  height: 2rem;
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
  width: 100%;
  padding: 0.45rem 0.5rem;
  font-size: 14px;
  color: #333;
}
.pseudo-loc::placeholder {
  color: #777;
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
  width: 32px;
  height: 20px;
  border-radius: 10px;
  background: #d5d5dd;
  position: relative;
  transition: background 0.15s;
}
.glisseur::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
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
  font-size: 14px;
  font-weight: 600;
  color: #777;
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
  font-size: 14px;
  min-width: 2.25rem;
  min-height: 2.25rem;
  flex: none;
  opacity: 0.8;
}
.liste-loc li:hover .x-loc {
  opacity: 1;
}
.attribuer {
  margin-top: 0.6rem;
  border-top: 1px solid #eee;
  padding-top: 0.7rem;
}
.actions-locuteurs {
  display: flex;
  margin-left: auto;
}
.gestion-locuteurs {
  margin-top: 0.9rem;
  border-top: 1px solid #eee;
  padding-top: 0.7rem;
}
.gestion-locuteurs-entete {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
  color: #444;
  font-size: 14px;
}
.statistiques-locuteurs {
  margin-top: 0.9rem;
  border-top: 1px solid #eee;
  padding-top: 0.7rem;
}
.statistiques-locuteurs > summary {
  color: #444;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  padding: 0.35rem 0;
}
.voile-locuteurs {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  overflow-y: auto;
  padding: 6vh 0;
  background: rgba(30, 30, 40, 0.45);
}
.modale-locuteurs {
  box-sizing: border-box;
  width: min(900px, 94vw);
  padding: 1rem 1.25rem 1.25rem;
  font-size: 14px;
  line-height: 1.5;
  border: 1px solid #d6dce8;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
}
.modale-locuteurs .corpus-tete {
  gap: 0.5rem;
}
.modale-locuteurs .corpus-tete h3 {
  flex: 1;
}
.modale-locuteurs .fermer {
  border: none;
  background: none;
  color: #888;
  cursor: pointer;
  font-size: 1.15rem;
  min-width: 2.5rem;
  min-height: 2.5rem;
}
.aide-gestion-locuteurs {
  margin: 0 0 0.7rem;
  color: #666;
  font-size: 14px;
  line-height: 1.5;
}
.attribuer .lbl {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 14px;
  line-height: 1.5;
  font-weight: 600;
  color: #444;
}
.boutons-loc {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.attr {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  min-width: 0;
  font-size: 14px;
  line-height: 1.4;
  min-height: 2.75rem;
  overflow-wrap: anywhere;
  font-weight: 600;
  text-align: left;
  border: 1px solid #e5e5ef;
  border-radius: 6px;
  background: #fff;
  color: #333;
  padding: 0.6rem 0.75rem;
  cursor: pointer;
}
.attr:hover {
  border-color: #2e73d8;
  background: #f0f6ff;
}
.attr:focus-visible {
  outline: 2px solid #2e73d8;
  outline-offset: 1px;
}
.pastille-locuteur {
  width: 16px;
  height: 16px;
  flex: none;
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 50%;
}
.attr.aucun {
  color: #777;
}
.attr.aucun::before {
  width: 16px;
  height: 16px;
  flex: none;
  border: 1px solid #c5c5ce;
  border-radius: 50%;
  content: '';
}
.actions-locuteurs .crayon {
  font-size: 1.2rem;
  min-width: 2.75rem;
  min-height: 2.75rem;
}
.modale-locuteurs :deep(button:not(.x-loc):not(.fermer)) {
  font-size: 14px;
  min-height: 2.5rem;
  padding: 0.45rem 0.75rem;
}
@media (max-width: 600px) {
  .tableau-loc-tetes,
  .liste-loc li {
    grid-template-columns: 2rem minmax(0, 1fr) minmax(0, 1fr) 3.5rem 2.25rem;
    gap: 0.25rem;
  }
  .modale-locuteurs {
    padding: 0.75rem;
  }
}
</style>
