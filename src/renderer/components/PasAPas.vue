<script setup lang="ts">
import { ref, computed, onBeforeUnmount, watch, nextTick } from 'vue'
import { utiliserSonal } from '../composables/sonal'

/**
 * Pas-à-pas : un ONGLET de la vue Corpus (liste des étapes) + un SPOTLIGHT
 * global (projecteur + bulle, téléporté en body → visible dans n'importe
 * quelle vue). L'utilisateur est guidé par la bulle ; l'étape se coche quand
 * son prédicat `fait()` passe à vrai (observation du modèle réactif).
 *
 * Le spotlight ne modifie pas les vues : il pointe des éléments ciblés par des
 * attributs `data-tour` (getBoundingClientRect) et recalcule sa position en
 * live (rAF) — la cible peut changer selon l'état (ex. « crayon » → « onglet »
 * dès qu'un entretien est ouvert).
 */
const props = defineProps<{ montreListe?: boolean }>()

const {
  pasAPas,
  etapes,
  etapeCouranteId,
  etapeCourante,
  validees,
  retestInfo,
  activer,
  suivante,
  retourCorpus,
  vue,
} = utiliserSonal()

// --- Spotlight : position de la cible courante, recalculée à chaque frame ---
const rect = ref<DOMRect | null>(null) // rectangle de la cible, ou null = bulle centrée
let raf = 0

// NOTE : la cible est lue DIRECTEMENT dans `recalc()` (à chaque frame), et non via
// un `computed` — car `cible()` peut observer l'état du DOM (non réactif, ex. les
// zones de la modale d'ajout). Un computed mettrait la valeur en cache tant que
// l'étape ne change pas, figeant le spotlight sur la 1re cible. Le recalcul en
// live (rAF) rend le parcours guidé réellement séquentiel.

function recalc() {
  if (!etapeCourante.value) {
    rect.value = null
    return
  }
  const sel = etapeCourante.value.cible()
  if (!sel) {
    rect.value = null // bulle centrée (pas de cible)
    return
  }
  const el = document.querySelector(sel)
  rect.value = el ? (el as HTMLElement).getBoundingClientRect() : null
}

function boucle() {
  recalc()
  raf = requestAnimationFrame(boucle)
}

watch(etapeCouranteId, (id) => {
  if (id) {
    // démarrage au prochain frame (laisse le DOM se mettre à jour)
    cancelAnimationFrame(raf)
    nextTick(() => {
      recalc()
      raf = requestAnimationFrame(boucle)
    })
  } else {
    cancelAnimationFrame(raf)
    rect.value = null
  }
})

onBeforeUnmount(() => cancelAnimationFrame(raf))

// Position de la bulle : sous la cible si possible, sinon au-dessus, sinon centrée.
const styleBulle = computed(() => {
  if (!rect.value) {
    return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
  }
  const r = rect.value
  const sous = r.bottom + 220 < window.innerHeight
  const top = sous ? `${r.bottom + 12}px` : `${r.top - 12 - 180}px`
  return { left: `${r.left}px`, top, transform: 'none' }
})

// Style du « trou » (spotlight) : positionné sur la cible, voile par box-shadow.
const styleTrou = computed(() => {
  if (!rect.value) return { display: 'none' }
  const r = rect.value
  return {
    left: `${r.left - 6}px`,
    top: `${r.top - 6}px`,
    width: `${r.width + 12}px`,
    height: `${r.height + 12}px`,
  }
})

// Mode « PANNEAU » : la consigne de l'étape courante s'affiche SOUS les onglets
// de l'entretien (colonne de droite) plutôt qu'en bulle flottante — la bulle
// positionnée sous le bouton Lecture masquait le texte pendant la lecture
// (retour utilisateur). Aucun voile ni trou dans ce mode.
const modePanneau = computed(
  () => etapeCourante.value?.panneau === true && vue.value === 'entretien',
)

/** « Revenir au Pas à pas » depuis le message re-test (vue Entretien) :
 *  efface le message et retourne à la liste (écran Corpus). */
async function revenirPasAPas() {
  retestInfo.value = null
  await retourCorpus()
}

/** Ferme le message re-test. Dans l'entretien, on revient aussi à la liste
 *  « Pas à pas » ; dans le corpus (étape de corpus), le bouton « revenir » n'a
 *  pas de sens — on y est déjà, il suffit de fermer le message. */
function fermerRetest() {
  if (retestInfo.value?.vue === 'entretien') void revenirPasAPas()
  else retestInfo.value = null
}

// Ancre de téléport du message re-test : la vue où vit l'action de l'étape
// (ancre `ancre-guide-pp` dans l'entretien, `ancre-retest-pp` dans le corpus).
const cibleRetest = computed(() =>
  retestInfo.value?.vue === 'entretien'
    ? '[data-tour="ancre-guide-pp"]'
    : '[data-tour="ancre-retest-pp"]',
)

</script>

<template>
  <aside v-if="pasAPas" v-show="props.montreListe !== false" class="panneau pas-a-pas">
    <div class="corpus-tete">
      <h3>Pas à pas</h3>
    </div>
    <p class="aide-pp">Suis les étapes — elles se cochent quand l'action est faite.</p>
    <ol class="liste-pp">
      <li
        v-for="(e, i) in etapes"
        :key="e.id"
        :class="{ fait: validees.has(e.id), actif: etapeCouranteId === e.id }"
      >
        <button class="ligne-pp" @click="activer(e.id)">
          <span class="num">{{ validees.has(e.id) ? '✓' : i + 1 }}</span>
          <span class="titre-pp">{{ e.titre }}</span>
        </button>
      </li>
    </ol>
  </aside>

  <!-- Spotlight global (téléporté en body → survit au changement de vue). En
       mode PANNEAU (consigne sous les onglets), pas de voile ni de bulle. -->
  <Teleport to="body">
    <template v-if="etapeCourante && !modePanneau">
      <!-- Voile plein si pas de cible (bulle centrée) ; sinon le trou crée le voile. -->
      <div v-if="!rect" class="spotlight-voile"></div>
      <div v-else class="spotlight-trou" :style="styleTrou"></div>
      <div class="spotlight-bulle" :style="styleBulle">
        <div class="bulle-titre">{{ etapeCourante.titre }}</div>
        <p class="bulle-texte">{{ etapeCourante.texte() }}</p>
        <div class="bulle-actions">
          <button class="bulle-btn" @click="etapeCouranteId = null">Plus tard</button>
          <button class="bulle-btn" @click="suivante">Suivant →</button>
        </div>
      </div>
    </template>
  </Teleport>

  <!-- Consigne « panneau » : affichée SOUS les onglets de l'entretien (ancre
       data-tour posée dans Entretien.vue) — ne cache pas le texte. Pas de
       bouton d'action : l'utilisateur fait le geste lui-même. -->
  <Teleport v-if="modePanneau && etapeCourante" to='[data-tour="ancre-guide-pp"]'>
    <div class="guide-pp">
      <div class="guide-pp-titre">{{ etapeCourante.titre }}</div>
      <p class="guide-pp-texte">{{ etapeCourante.texte() }}</p>
      <div class="guide-pp-actions">
        <button class="guide-pp-btn" @click="etapeCouranteId = null">Plus tard</button>
        <button class="guide-pp-btn" @click="suivante">Suivant →</button>
      </div>
    </div>
  </Teleport>

  <!-- Message « re-test » : une étape DÉJÀ validée a été rouverte → on
       l'annonce (texte propre à chaque étape) dans la vue où vit son action :
       l'entretien (ancre `ancre-guide-pp`, sous les onglets) pour les étapes
       d'édition, le corpus (ancre `ancre-retest-pp`, sous le titre Entretiens)
       pour une étape de corpus (ex. « Charger un entretien »). L'ancre cible
       suit la vue du message ; un bouton propose de revenir à la liste. -->
  <Teleport
    v-if="retestInfo && retestInfo.vue === vue"
    :to="cibleRetest"
  >
    <div class="guide-pp retest">
      <div class="guide-pp-titre">« {{ retestInfo.titre }} » déjà réalisée</div>
      <p class="guide-pp-texte">
        Vous pouvez essayer de {{ retestInfo.suite }}.
      </p>
      <div class="guide-pp-actions">
        <button class="guide-pp-btn" @click="fermerRetest">
          {{ retestInfo.vue === 'entretien' ? '↩ Revenir au Pas à pas' : 'OK' }}
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pas-a-pas .corpus-tete {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.aide-pp {
  font-size: 0.74rem;
  color: #999;
  margin: 0.3rem 0 0.4rem;
}
.liste-pp {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.ligne-pp {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  text-align: left;
  border: 1px solid #e5e5ef;
  border-radius: 6px;
  background: #fff;
  padding: 0.4rem 0.5rem;
  cursor: pointer;
  font-size: 0.85rem;
}
.ligne-pp:hover {
  border-color: #2e73d8;
  background: #f0f6ff;
}
.liste-pp li.actif .ligne-pp {
  border-color: #2e73d8;
  background: #e8f0fb;
  font-weight: 600;
}
.num {
  width: 1.4rem;
  height: 1.4rem;
  flex: none;
  border-radius: 50%;
  background: #eef;
  color: #556;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.78rem;
  font-weight: 600;
}
.liste-pp li.fait .num {
  background: #2e73d8;
  color: #fff;
}
.titre-pp {
  min-width: 0;
}

/* --- Spotlight (téléporté en body — styles non scoped requis) --- */
:global(.spotlight-voile) {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 100;
}
:global(.spotlight-trou) {
  position: fixed;
  border-radius: 6px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.55);
  border: 2px solid #2e73d8;
  pointer-events: none;
  z-index: 100;
  transition: all 0.12s ease-out;
}
:global(.spotlight-bulle) {
  position: fixed;
  width: min(320px, 80vw);
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 10px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
  padding: 0.7rem 0.9rem;
  z-index: 101;
}
:global(.bulle-titre) {
  font-weight: 600;
  font-size: 0.88rem;
  color: #1565c0;
  margin-bottom: 0.2rem;
}
:global(.bulle-texte) {
  font-size: 0.82rem;
  color: #333;
  margin: 0 0 0.5rem;
}
:global(.bulle-actions) {
  display: flex;
  gap: 0.4rem;
  justify-content: flex-end;
  flex-wrap: wrap;
}
:global(.bulle-btn) {
  border: 1px solid #ccc;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  padding: 0.3rem 0.7rem;
  font-size: 0.8rem;
}
:global(.bulle-btn:hover) {
  border-color: #2e73d8;
  color: #1565c0;
}

/* --- Consigne « panneau » (sous les onglets de l'entretien) --- */
.guide-pp {
  border: 1px solid #2e73d8;
  background: #f0f6ff;
  border-radius: 8px;
  padding: 0.5rem 0.6rem;
  margin-bottom: 0.5rem;
}
.guide-pp-titre {
  font-weight: 600;
  font-size: 0.85rem;
  color: #1565c0;
  margin-bottom: 0.2rem;
}
.guide-pp-texte {
  font-size: 0.8rem;
  color: #333;
  margin: 0 0 0.5rem;
}
.guide-pp-actions {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.guide-pp-btn {
  border: 1px solid #ccc;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  padding: 0.3rem 0.7rem;
  font-size: 0.8rem;
}
.guide-pp-btn:hover {
  border-color: #2e73d8;
}
/* Variante « re-test » : info déjà faite (ambre, pas bleue) — l'étape est
   cochée, l'utilisateur est revenu la voir, on propose de retourner à la liste. */
.guide-pp.retest {
  border-color: #e0a03a;
  background: #fff8ec;
}
.guide-pp.retest .guide-pp-titre {
  color: #8a6d3b;
}</style>
