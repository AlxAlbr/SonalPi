<script setup lang="ts">
import { ref, computed, onBeforeUnmount, watch, nextTick } from 'vue'
import { utiliserSonal } from '../composables/sonal'

/**
 * Pas-à-pas (plan-tutoriel §14) : un ONGLET de la vue Corpus (liste des étapes)
 * + un SPOTLIGHT global (projecteur + bulle, téléporté en body → visible dans
 * n'importe quelle vue). L'utilisateur est guidé par la bulle ; l'étape se
 * coche quand son prédicat `fait()` passe à vrai (observation du modèle réactif).
 *
 * Le spotlight n'instrumente pas les vues : il pointe des éléments ciblés par
 * des attributs `data-tour` (getBoundingClientRect) et recalcule sa position en
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
  activer,
  suivante,
  quitterPasAPas,
} = utiliserSonal()

// --- Spotlight : position de la cible courante, recalculée à chaque frame ---
const rect = ref<DOMRect | null>(null) // rectangle de la cible, ou null = bulle centrée
let raf = 0

const selCible = computed(() => etapeCourante.value?.cible() ?? null)

function recalc() {
  if (!etapeCourante.value) {
    rect.value = null
    return
  }
  const sel = selCible.value
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

async function lancerAction() {
  if (etapeCourante.value?.action) await etapeCourante.value.action()
}
</script>

<template>
  <aside v-if="pasAPas" v-show="props.montreListe !== false" class="panneau pas-a-pas">
    <div class="corpus-tete">
      <h3>Pas à pas</h3>
      <button class="mini" @click="quitterPasAPas">Quitter</button>
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

  <!-- Spotlight global (téléporté en body → survit au changement de vue). -->
  <Teleport to="body">
    <template v-if="etapeCourante">
      <!-- Voile plein si pas de cible (bulle centrée) ; sinon le trou crée le voile. -->
      <div v-if="!rect" class="spotlight-voile"></div>
      <div v-else class="spotlight-trou" :style="styleTrou"></div>
      <div class="spotlight-bulle" :style="styleBulle">
        <div class="bulle-titre">{{ etapeCourante.titre }}</div>
        <p class="bulle-texte">{{ etapeCourante.texte() }}</p>
        <div class="bulle-actions">
          <button v-if="etapeCourante.action" class="bulle-btn primaire" @click="lancerAction">
            {{ etapeCourante.libelleAction ?? "Charger l'entretien" }}
          </button>
          <button class="bulle-btn" @click="etapeCouranteId = null">Plus tard</button>
          <button class="bulle-btn" @click="suivante">Suivant →</button>
        </div>
      </div>
    </template>
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
  border-color: #2e9e3f;
  background: #f3fbf4;
}
.liste-pp li.actif .ligne-pp {
  border-color: #2e9e3f;
  background: #f1f8f4;
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
  background: #2e9e3f;
  color: #fff;
}
.titre-pp {
  min-width: 0;
}

/* --- Spotlight (téléporté en body — styles non scoped requis) --- */
:global(.spotlight-voile) {
  position: fixed;
  inset: 0;
  background: rgba(20, 25, 20, 0.55);
  z-index: 100;
}
:global(.spotlight-trou) {
  position: fixed;
  border-radius: 6px;
  box-shadow: 0 0 0 9999px rgba(20, 25, 20, 0.55);
  border: 2px solid #2e9e3f;
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
  color: #2e7d32;
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
  border-color: #2e9e3f;
  color: #2e7d32;
}
:global(.bulle-btn.primaire) {
  border-color: #2e7d32;
  background: #2e9e3f;
  color: #fff;
}
</style>
