<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { ParticipationLocuteur } from '../../../../shared/format'
import { couleurPourLocuteur, libelleRole, roleParticipation } from '../../../../shared/entretien/locuteurs'
import { utiliserSonal } from '../../../composables/sonal'
import RapprochementNommage from './RapprochementNommage.vue'
import RenommageLocuteurOuvert from './RenommageLocuteurOuvert.vue'
import StatistiquesLocuteurs from './StatistiquesLocuteurs.vue'

const props = defineProps<{ actif: boolean; lectureSeule: boolean; statistiquesOuvertes: boolean }>()
const emit = defineEmits<{
  'update:statistiquesOuvertes': [ouvertes: boolean]
  naviguerStatistique: [selection: { loc: number | null; pos: number }]
}>()

const {
  lireIdentitesLocuteurs,
  locuteurs,
  ouvertId,
  attribuerLoc,
  renommerParticipation,
  regulariserLocuteur,
  demandeRenommageGlobal,
  erreurRenommageGlobal,
  renommageGlobalOccupe,
  editionNomsSuspendue,
  renommageEnCours,
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
const editionIndisponible = computed(() => props.lectureSeule || editionNomsSuspendue.value || renommageEnCours.value)

function regulariser(locuteur: ParticipationLocuteur) {
  if (!window.confirm(`Enregistrer « ${locuteur.nom} » comme locuteur distinct dans le corpus ? Les paroles et informations seront conservées. Aucune ancienne association ne sera rétablie.`)) return
  regulariserLocuteur({ entretienId: ouvertId.value ?? '', participationId: locuteur.id })
}

const VALEURS_ROLE = { interviewer: true, repondant: false, indefini: undefined } as const

function choisirRole(locuteur: ParticipationLocuteur, event: Event) {
  const role = (event.target as HTMLSelectElement).value as keyof typeof VALEURS_ROLE
  setInterviewer({ entretienId: ouvertId.value ?? '', participationId: locuteur.id ?? '' }, VALEURS_ROLE[role])
}

function detailsLocuteur(locuteur: ParticipationLocuteur): string {
  const pseudo = locuteur.pseudo?.trim()
  const role = libelleRole(locuteur)
  return pseudo && pseudo !== locuteur.nom.trim() ? `${pseudo} · ${role}` : role
}

const gestionOuverte = ref(false)
const boutonGestion = ref<HTMLButtonElement | null>(null)
const aideOuverte = ref(false)
const raccourcisOuverts = ref(false)
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

// Relit les locuteurs du corpus quand les associations changent.
watch(
  () => JSON.stringify([props.actif, ouvertId.value, locuteurs.value.map((locuteur) => locuteur.locuteurRef).filter(Boolean)]),
  async () => {
    const lecture = ++lectureLiensPersonnes
    const references = locuteurs.value.flatMap((locuteur) => locuteur.locuteurRef ?? [])
    erreurLiensPersonnes.value = ''
    // Les noms déjà connus restent affichés pendant la relecture, pour éviter un clignotement.
    if (!references.every((reference) => nomsPersonnesLiees.value[reference])) {
      nomsPersonnesLiees.value = {}
      liensPersonnesCharges.value = false
    }
    if (!props.actif || !references.length) return
    try {
      const inventaire = await lireIdentitesLocuteurs()
      if (lecture !== lectureLiensPersonnes) return
      nomsPersonnesLiees.value = Object.fromEntries(
        inventaire.locuteurs.map((personne) => [personne.id, personne.nom]),
      )
      liensPersonnesCharges.value = true
    } catch {
      if (lecture === lectureLiensPersonnes) {
        erreurLiensPersonnes.value =
          'Les associations des locuteurs ne peuvent pas être vérifiées pour le moment.'
      }
    }
  },
  { immediate: true },
)
</script>

<template>
  <aside class="panneau locuteurs-coder">
    <div class="gabarit-entete">
      <button
        type="button"
        class="gabarit-icone"
        :aria-expanded="aideOuverte"
        aria-label="Aide sur les locuteurs"
        title="Aide"
        @click="aideOuverte = !aideOuverte"
      ><span class="ico-info" aria-hidden="true"></span></button>
      <button
        type="button"
        class="gabarit-icone"
        :aria-expanded="raccourcisOuverts"
        aria-label="Raccourcis clavier de la sélection"
        title="Raccourcis clavier"
        @click="raccourcisOuverts = !raccourcisOuverts"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
          <rect x="2.5" y="6" width="19" height="12" rx="2" />
          <path d="M6 9.5h.01M9 9.5h.01M12 9.5h.01M15 9.5h.01M18 9.5h.01M6 12h.01M9 12h.01M12 12h.01M15 12h.01M18 12h.01M8 15h8" />
        </svg>
      </button>
      <div class="gabarit-actions">
        <button
          ref="boutonGestion"
          v-if="!lectureSeule"
          type="button"
          class="gabarit-action"
          title="Modifier les locuteurs"
          aria-label="Modifier les locuteurs"
          @click="ouvrirGestion"
        >Modifier</button>
      </div>
    </div>
    <div v-if="aideOuverte" class="gabarit-aide">
      <p>
        Cliquez sur un locuteur pour l’attribuer au tour de parole courant ou à la sélection.
        « aucun » retire le locuteur. Modifier ouvre la liste pour changer les noms, couleurs, pseudos et rôles.
      </p>
    </div>
    <div v-if="raccourcisOuverts" class="gabarit-aide">
      <p>
        Pour sélectionner un long passage : cliquez au début, puis maintenez <kbd class="touche">⇧ Maj</kbd> et cliquez à la fin.
        Tout le texte entre les deux est sélectionné. Vous pouvez aussi étendre la sélection au clavier avec <kbd class="touche">⇧ Maj</kbd> + flèches.
      </p>
    </div>

    <p v-if="editionNomsSuspendue && !renommageEnCours" role="alert">Les dernières paroles sont sauvegardées. Rouvrez le corpus avant de modifier à nouveau cet entretien.</p>
    <div class="attribuer">
      <div class="boutons-loc">
        <div v-for="l in locuteurs" :key="l.index" class="choix-loc">
          <button
            class="gabarit-ligne attr"
            :aria-label="l.nom"
            :aria-describedby="`details-locuteur-${l.index}`"
            :disabled="editionIndisponible"
            @click="attribuerLoc(l.index)"
          >
            <span class="gabarit-pastille pastille-locuteur" :style="{ background: l.couleur ?? couleurPourLocuteur(l.index) }"></span>
            <span class="libelle-loc">
              <span class="nom-attribution" :style="{ color: l.couleur ?? couleurPourLocuteur(l.index) }">{{ l.nom }}</span>
              <span :id="`details-locuteur-${l.index}`" class="details-attribution">{{ detailsLocuteur(l) }}</span>
            </span>
          </button>
        </div>
        <button class="gabarit-ligne attr aucun" :disabled="editionIndisponible" @click="attribuerLoc(null)">aucun</button>
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
            <button class="mini" :disabled="editionIndisponible" @click="nouveauLocuteur">+ Locuteur</button>
            <button
              ref="boutonFermerGestion"
              class="fermer"
              title="Fermer la gestion des locuteurs"
              aria-label="Fermer la gestion des locuteurs"
              @click="fermerGestion"
            >✕</button>
          </div>
          <p v-if="renommageGlobalOccupe && !demandeRenommageGlobal?.confirmationRequise" role="status">Enregistrement du nom…</p>
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
              <span>Rôle</span>
            </div>
            <RapprochementNommage
              v-if="rapprochementNommage"
              :key="`${rapprochementNommage.entretienId}:${rapprochementNommage.locuteurId}:${rapprochementNommage.nom}`"
              :entretien-id="rapprochementNommage.entretienId"
              :cible="rapprochementNommage.cible"
              :sources="rapprochementNommage.sources"
              :nom="rapprochementNommage.nom"
              :candidats="rapprochementNommage.candidats"
              :occupe="rapprochementOccupe"
              :message="messagePersonnes"
              @reporter="reporterRapprochement"
              @decider="deciderRapprochement"
            />
            <p
              v-if="messagePersonnes"
              role="status"
            >{{ messagePersonnes }}</p>
            <p v-if="erreurLiensPersonnes" role="status">{{ erreurLiensPersonnes }}</p>
            <ul class="liste-loc">
              <li v-for="(l, i) in locuteurs" :key="l.id ? `id:${l.id}` : `index:${l.index}`">
                <input
                  type="color"
                  class="carre-couleur"
                  :value="l.couleur ?? couleurPourLocuteur(l.index)"
                  :title="`Couleur du nom — choisir (actuelle : ${l.couleur ?? 'automatique'})`"
                  :disabled="editionIndisponible"
                  @change="choisirCouleurLoc({ entretienId: ouvertId ?? '', participationId: l.id ?? '' }, ($event.target as HTMLInputElement).value)"
                />
                <div class="nom-cell">
                  <input
                    class="nom-loc"
                    :data-participation-id="l.id"
                    :data-tour="i === 0 ? 'nom-locuteur' : undefined"
                    :value="l.nom"
                    :disabled="editionIndisponible || !l.id || renommageGlobalOccupe"
                    @change="renommerParticipation({ entretienId: ouvertId ?? '', participationId: l.id }, $event)"
                    @keydown.enter.prevent="renommerParticipation({ entretienId: ouvertId ?? '', participationId: l.id }, $event)"
                  />
                </div>
                <div class="pseudo-cell">
                  <input
                    class="pseudo-loc"
                    :value="l.pseudo ?? ''"
                    placeholder="pseudo…"
                    title="Pseudonymise les étiquettes de ce locuteur (Nom̶ [pseudo])"
                    :disabled="editionIndisponible"
                    @change="setPseudoLoc({ entretienId: ouvertId ?? '', participationId: l.id ?? '' }, ($event.target as HTMLInputElement).value)"
                  />
                </div>
                <select
                  class="role-loc"
                  :class="{ 'role-a-preciser': roleParticipation(l) === 'indefini' }"
                  :value="roleParticipation(l)"
                  :aria-label="`Rôle de ${l.nom}`"
                  :title="`${libelleRole(l)}. Les tours de la personne qui pose les questions sont en italique.`"
                  :disabled="editionIndisponible"
                  @change="choisirRole(l, $event)"
                >
                  <option value="indefini">À préciser</option>
                  <option value="interviewer">Interroge</option>
                  <option value="repondant">Répond</option>
                </select>
                <button
                  v-if="!lectureSeule"
                  class="x-loc"
                  :disabled="editionIndisponible"
                  title="Supprimer ce locuteur"
                  @click="demanderSuppressionLocuteur({ entretienId: ouvertId ?? '', participationId: l.id ?? '' })"
                >✕</button>
                <span v-if="!l.locuteurRef || l.associationRetiree || (liensPersonnesCharges && !nomsPersonnesLiees[l.locuteurRef])" class="lien-personne-loc reference-personne-absente">
                  {{ l.nom.trim() ? 'Ce locuteur n’est pas encore disponible dans le corpus.' : 'Renseignez un nom pour enregistrer ce locuteur.' }}
                  <button v-if="!lectureSeule && l.nom.trim()" type="button" :disabled="renommageGlobalOccupe || rapprochementOccupe || editionIndisponible" @click="regulariser(l)">Enregistrer ce locuteur…</button>
                </span>
                <span v-else-if="l.locuteurRef && !liensPersonnesCharges" class="lien-personne-loc">
                  Association à « {{ l.locuteurRef }} » en cours de vérification.
                </span>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </Teleport>
    <RenommageLocuteurOuvert v-if="demandeRenommageGlobal && (demandeRenommageGlobal.confirmationRequise || erreurRenommageGlobal)" />
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
  grid-template-columns: 2rem minmax(0, 1fr) minmax(0, 1fr) 8rem 2.25rem;
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
.nom-cell { min-width: 0; }
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
.x-loc {
  justify-self: center;
}
.role-loc {
  min-width: 0;
  width: 100%;
  border: 1px solid #e2e2ea;
  border-radius: 4px;
  padding: 0.45rem 1.6rem 0.45rem 0.4rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  color: #333;
  background: #fff;
}
.role-loc.role-a-preciser {
  border-color: #d89b2e;
  color: #6b4a00;
  font-style: italic;
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
/* Touche du clavier, pour montrer la touche à garder enfoncée. */
.touche {
  display: inline-block;
  padding: 0 0.35rem;
  border: 1px solid #b8c4d6;
  border-bottom-width: 2px;
  border-radius: 4px;
  background: #f7f9fc;
  color: #2b3d55;
  font-family: inherit;
  font-size: 0.85em;
  font-weight: 600;
  line-height: 1.5;
  white-space: nowrap;
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
.choix-loc {
  position: relative;
  min-width: 0;
}
.libelle-loc {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
.nom-attribution,
.details-attribution {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.details-attribution {
  font-size: 12px;
  font-weight: 400;
  color: #595969;
}
.attr {
  font-weight: 600;
  color: #2b3d55;
}
.attr:focus-visible {
  outline: 2px solid #2e73d8;
  outline-offset: 1px;
}
.attr .nom-attribution {
  font-size: 0.85rem;
}
/* « aucun » n'est pas un locuteur : ligne pointillée, à part. */
.attr.aucun {
  margin-top: 0.25rem;
  border-style: dashed;
  color: #6b7480;
  font-weight: 600;
}
.attr.aucun::before {
  width: 0.75rem;
  height: 0.75rem;
  flex: none;
  border: 1px solid #c5c5ce;
  border-radius: 50%;
  content: '';
}
.modale-locuteurs :deep(button:not(.x-loc):not(.fermer)) {
  font-size: 14px;
  min-height: 2.5rem;
  padding: 0.45rem 0.75rem;
}
@media (max-width: 600px) {
  .tableau-loc-tetes,
  .liste-loc li {
    grid-template-columns: 2rem minmax(0, 1fr) minmax(0, 1fr) 7.5rem 2.25rem;
    gap: 0.25rem;
  }
  .modale-locuteurs {
    padding: 0.75rem;
  }
}
</style>
