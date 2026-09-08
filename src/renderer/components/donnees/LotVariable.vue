<script setup lang="ts">
import { computed, ref } from 'vue'
import { utiliserSonal } from '../../composables/sonal'
import type { ItemLotValeur } from '../../../shared/format'

/**
 *  Modale « Modifier en lot » : pour UNE variable
 *  de portée ENTRETIEN, choisir UNE valeur et l'appliquer à tous les entretiens.
 *  Côté main, un verrou court par entretien tranche au moment de l'exécution :
 *  tout refus ponctuel (entretien ouvert entre-temps par autrui, divergence…)
 *  revient NOMMÉMENT dans le récapitulatif, sans jamais bloquer les autres
 *  entretiens du lot. Les badges 🔒/👁 de la liste sont purement informatifs —
 *  la décision reste celle du serveur (la présence 👁 n'est jamais décisionnelle).
 */
const props = defineProps<{ idVar: string }>()
const emit = defineEmits<{ fermer: [] }>()

const {
  variables,
  membership,
  matrice,
  modalitesDe,
  badgeVerrou,
  presencesSur,
  modaliteParLibelle,
  poserValeurLot,
  rafraichirMatrice,
} = utiliserSonal()

const variable = computed(() => variables.value.find((v) => v.id === props.idVar))

// Choix de LA valeur appliquée à tout le lot — même idiome que les cellules :
// select des modalités + « autre… » qui bascule en champ texte.
// « — » = effacer (poser '' supprime la valeur chez le propriétaire).
const AUTRE = ' autre' // sentinelle : ne peut pas être un id de modalité
const choix = ref('')
const libre = ref(false)
const libelleLibre = ref('')
function surSelect(evt: Event) {
  const val = (evt.target as HTMLSelectElement).value
  if (val === AUTRE) {
    libre.value = true
    choix.value = ''
  } else {
    libre.value = false
    choix.value = val
  }
}

/** Les cibles = TOUS les entretiens du membership ; le tri suit l'ordre du corpus (membership), comme les lignes de la table. */
const ciblesToutes = computed(() =>
  Object.entries(membership.value).map(([id, ref]) => ({ id, titre: ref.titre })),
)

/** Filtre « lignes sans valeur » : aide au ciblage 100 % RENDERER (matrice + badges,
 *  zéro protocole). La décision reste celle du serveur au moment de l'exécution,
 *  et le récap nominatif fait foi. Désactivé par défaut : tout le membership
 *  est ciblé. Les exclus restent AFFICHÉS, grisés avec leur raison —
 *  informatif, jamais caché. */
const sansValeurSeulement = ref(false)
const ciblesFiltrees = computed(() => {
  if (!sansValeurSeulement.value)
    return { cibles: ciblesToutes.value, ignores: [] as { id: string; titre: string; raison: string }[] }
  const cibles: { id: string; titre: string }[] = []
  const ignores: { id: string; titre: string; raison: string }[] = []
  for (const c of ciblesToutes.value) {
    const verrou = badgeVerrou(c.id)
    const aValeur = !!matrice.value.find((m) => m.entretienId === c.id)?.valeursGen[props.idVar]
    if (!aValeur && !verrou) cibles.push(c)
    else
      ignores.push({
        ...c,
        raison: verrou ? `verrou tenu par ${verrou.userId}` : 'valeur déjà présente',
      })
  }
  return { cibles, ignores }
})

const occupe = ref(false)
const recap = ref<{ succes: string[]; echecs: { id: string; raison: string }[] } | null>(null)

async function appliquer() {
  if (occupe.value || recap.value) return
  occupe.value = true
  try {
    // Saisie libre → trouve-ou-crée la modalité par LIBELLÉ (comme les cellules) ;
    // champ vide = effacer ('').
    // Une erreur IPC (réseau…) remonte à la bannière globale (erreurs.ts) : le finally rend le bouton.
    const idMod = libre.value
      ? libelleLibre.value.trim()
        ? await modaliteParLibelle(props.idVar, libelleLibre.value.trim())
        : ''
      : choix.value
    const items: ItemLotValeur[] = ciblesFiltrees.value.cibles.map((c) => ({
      entretienId: c.id,
      cible: { type: 'entretien' },
      idVar: props.idVar,
      idMod,
    }))
    recap.value = await poserValeurLot(items)
    await rafraichirMatrice() // la grille derrière le voile montre déjà le lot
  } finally {
    occupe.value = false
  }
}
</script>

<template>
  <div class="voile" @click.self="emit('fermer')">
    <div class="modale-lot">
      <div class="corpus-tete">
        <h3>Modifier en lot — {{ variable?.lib ?? idVar }}</h3>
        <button class="fermer" title="Fermer" @click="emit('fermer')">✕</button>
      </div>
      <p class="aide-thm">
        Applique UNE valeur à tous les entretiens non ouverts. Un entretien ouvert par
        quelqu'un d'autre sera REFUSÉ nommément — les autres seront modifiés.
      </p>

      <!-- Choix de la valeur (avant exécution) -->
      <template v-if="!recap">
        <div class="choix-valeur">
          <label>Valeur :</label>
          <input
            v-if="libre || modalitesDe(idVar).length === 0"
            v-model="libelleLibre"
            class="cell-libre"
            placeholder="texte libre (vide = effacer)"
            @keyup.enter="appliquer"
          />
          <select v-else :value="choix" @change="surSelect">
            <option value="">—</option>
            <option v-for="m in modalitesDe(idVar)" :key="m.id" :value="m.id">{{ m.lib }}</option>
            <option :value="AUTRE">autre…</option>
          </select>
        </div>

        <!-- Filtre « lignes sans valeur » : aide au ciblage locale ;
             les exclus restent affichés ci-dessous. -->
        <label class="filtre-sans-valeur">
          <input type="checkbox" v-model="sansValeurSeulement" />
          Seulement les entretiens <strong>sans valeur</strong>
          (protège les valeurs déjà saisies et les verrouillés 🔒)
        </label>

        <p class="cibles-titre">
          Appliquer à {{ ciblesFiltrees.cibles.length }} entretien(s)<template
            v-if="sansValeurSeulement && ciblesFiltrees.ignores.length"
          >
            — {{ ciblesFiltrees.ignores.length }} ignoré(s)</template
          > :</p>
        <ul class="liste-cibles">
          <li v-for="c in ciblesFiltrees.cibles" :key="c.id">
            📄 {{ c.titre }}
            <!-- Informatif uniquement : la décision reste au moment du lot. -->
            <span v-if="badgeVerrou(c.id)" class="badge-verrou"
                  :title="`Verrou tenu par ${badgeVerrou(c.id)!.userId} — ce refus est probable.`">🔒 {{ badgeVerrou(c.id)!.userId }}</span>
            <span v-for="p in presencesSur(c.id)" :key="p.machineId" class="badge-presence"
                  :title="`Consulté par ${p.userId} (autre poste)`">👁 {{ p.userId }}</span>
          </li>
          <li v-if="ciblesFiltrees.cibles.length === 0" class="aucune-cible">
            Aucune cible — décochez le filtre pour cibler tout le monde.
          </li>
        </ul>
        <!-- Les exclus du filtre restent VISIBLES, grisés avec leur raison. -->
        <ul v-if="sansValeurSeulement && ciblesFiltrees.ignores.length" class="liste-ignores">
          <li v-for="i in ciblesFiltrees.ignores" :key="i.id">
            📄 {{ i.titre }} — ignoré : {{ i.raison }}
          </li>
        </ul>

        <div class="actions-lot">
          <button class="valider" :disabled="occupe || ciblesFiltrees.cibles.length === 0" @click="appliquer">
            {{ occupe ? 'Application…' : 'Appliquer' }}
          </button>
        </div>
      </template>

      <!-- Récapitulatif après exécution -->
      <template v-else>
        <p class="recap-ok">✅ {{ recap.succes.length }} entretien(s) modifié(s).</p>
        <template v-if="recap.echecs.length > 0">
          <p class="recap-echec-titre">Refusés :</p>
          <ul class="liste-echecs">
            <li v-for="e in recap.echecs" :key="e.id">
              <strong>{{ membership[e.id]?.titre ?? e.id }}</strong> — {{ e.raison }}
            </li>
          </ul>
        </template>
        <div class="actions-lot">
          <button class="valider" @click="emit('fermer')">Fermer</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* .voile/.modale-* : même idiome que EditionVariables/EditionThemes. */
.voile {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 8vh;
  z-index: 50;
}
.modale-lot,
.modale-lot * {
  box-sizing: border-box;
}
.modale-lot {
  width: min(520px, 92vw);
  max-height: 80vh;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #d6dce8;
  border-radius: 10px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
  padding: 0.8rem 1rem 1rem;
}
.corpus-tete h3 {
  flex: 1;
}
.fermer {
  border: none;
  background: none;
  color: #888;
  cursor: pointer;
  font-size: 0.9rem;
}
.choix-valeur {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.4rem 0;
}
.choix-valeur select,
.choix-valeur .cell-libre {
  font-size: 0.8rem;
  padding: 0.2rem 0.35rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
}
.cibles-titre {
  font-size: 0.78rem;
  color: #555;
  margin: 0.5rem 0 0.2rem;
}
/* Filtre « lignes sans valeur » + liste des exclus (informatifs,
   jamais cachés). */
.filtre-sans-valeur {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  color: #444;
  margin: 0.6rem 0 0.2rem;
  cursor: pointer;
}
.filtre-sans-valeur input {
  cursor: pointer;
}
.liste-ignores {
  list-style: none;
  margin: 0.25rem 0 0;
  padding: 0 0.45rem;
  font-size: 0.72rem;
}
.liste-ignores li {
  padding: 0.15rem 0;
  color: #999;
  font-style: italic;
}
.aucune-cible {
  color: #999;
  font-style: italic;
}
.liste-cibles {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 30vh;
  overflow-y: auto;
  border: 1px solid #e5e5ef;
  border-radius: 6px;
}
.liste-cibles li {
  padding: 0.25rem 0.45rem;
  font-size: 0.75rem;
  border-bottom: 1px solid #f0f0f5;
}
.liste-cibles li:last-child {
  border-bottom: none;
}
/* Badges : même sémantique visuelle que ceux de la table. */
.badge-verrou,
.badge-presence {
  font-size: 0.68rem;
  padding: 0 0.35rem;
  border-radius: 8px;
  margin-left: 0.35rem;
  white-space: nowrap;
}
.badge-verrou {
  background: #fff3cd;
  color: #7a5c00;
}
.badge-presence {
  background: #e2ecff;
  color: #1d4fa1;
}
.actions-lot {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.7rem;
}
.valider {
  font-size: 0.8rem;
  padding: 0.3rem 0.9rem;
  cursor: pointer;
}
.valider:disabled {
  opacity: 0.6;
  cursor: default;
}
.recap-ok {
  color: #1b7a2d;
  font-weight: 600;
  margin: 0.5rem 0;
}
.recap-echec-titre {
  font-size: 0.78rem;
  color: #a12622;
  margin: 0.4rem 0 0.2rem;
}
.liste-echecs {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.75rem;
}
.liste-echecs li {
  padding: 0.2rem 0;
  border-top: 1px solid #f5dddd;
}
</style>
