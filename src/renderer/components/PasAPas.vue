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
  finiInfo,
  activer,
  retourCorpus,
  vue,
} = utiliserSonal()

// --- Spotlight : état de la cible de l'étape courante, recalculé à chaque frame ---
// L'état de la cible détermine ce qu'on affiche — trois cas, explicitement :
//  - 'visible' : la cible est présente et à l'écran → trou + bulle calée dessus ;
//  - 'absente' : l'étape n'a aucun point d'ancrage (cible() → null, élément
//    introuvable) → voile plein + bulle centrée (le geste se fait sur
//    l'interface, volontairement masquée) ;
//  - 'cachee' : la cible existe mais dans une AUTRE vue — les écrans restent
//    montés en `v-show` (le DOM existe, `display:none`) → GUIDAGE EN PAUSE
//    SILENCIEUSE, aucune bulle : l'utilisateur a quitté l'écran de l'action
//    (ex. Accueil, Table de données), on ne le poursuit pas — il revient de
//    lui-même. La garde getClientRects() est indispensable : sur un élément
//    caché, getBoundingClientRect() renvoie des ZÉROS, ce qui collerait la
//    bulle en haut à gauche (bug observé). Au retour sur l'écran de l'action,
//    le spotlight reprend seul (recalcule en live).
const cible = ref<{ etat: 'visible'; rect: DOMRect } | { etat: 'absente' } | { etat: 'cachee' }>({
  etat: 'absente',
})
let raf = 0

// NOTE : la cible est lue DIRECTEMENT dans `recalc()` (à chaque frame), et non via
// un `computed` — car `cible()` peut observer l'état du DOM (non réactif, ex. les
// zones de la modale d'ajout). Un computed mettrait la valeur en cache tant que
// l'étape ne change pas, figeant le spotlight sur la 1re cible. Le recalcul en
// live (rAF) rend le parcours guidé réellement séquentiel.

function recalc() {
  const e = etapeCourante.value
  if (!e) {
    cible.value = { etat: 'absente' }
    return
  }
  const sel = e.cible()
  const el = sel ? document.querySelector(sel) : null
  if (!el) {
    // Absent du DOM (ou étape sans cible) → aucune ancre : voile + bulle centrée.
    cible.value = { etat: 'absente' }
    return
  }
  if ((el as HTMLElement).getClientRects().length === 0) {
    // Présent mais dans une vue masquée (v-show) → guidage en pause (voir ci-dessus).
    cible.value = { etat: 'cachee' }
    return
  }
  cible.value = { etat: 'visible', rect: (el as HTMLElement).getBoundingClientRect() }
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
    cible.value = { etat: 'absente' }
  }
})

onBeforeUnmount(() => cancelAnimationFrame(raf))

// Position de la bulle : sous la cible si possible, sinon au-dessus, sinon centrée.
const styleBulle = computed(() => {
  if (cible.value.etat !== 'visible') {
    return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
  }
  const r = cible.value.rect
  const sous = r.bottom + 220 < window.innerHeight
  const top = sous ? `${r.bottom + 12}px` : `${r.top - 12 - 180}px`
  return { left: `${r.left}px`, top, transform: 'none' }
})

// Style du « trou » (spotlight) : positionné sur la cible, voile par box-shadow.
const styleTrou = computed(() => {
  if (cible.value.etat !== 'visible') return { display: 'none' }
  const r = cible.value.rect
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

/** « Enchaîner » depuis le message de fin d'étape : on efface le message puis
 *  on lance la prochaine étape (son spotlight commence par faire ouvrir
 *  l'entretien — le geste reste réel). */
function enchainFini() {
  const id = finiInfo.value?.prochaineId
  finiInfo.value = null
  if (id) activer(id)
}

/** « Revenir aux étapes du pas à pas » depuis le message de fin d'étape affiché
 *  DANS l'entretien : efface le message et retourne à la liste (écran Corpus). */
async function revenirFini() {
  finiInfo.value = null
  await retourCorpus()
}

// Ancre de téléport du message re-test : la vue où vit l'action de l'étape
// (ancre `ancre-guide-pp` dans l'entretien, `ancre-retest-pp` dans le corpus).
const cibleRetest = computed(() =>
  retestInfo.value?.vue === 'entretien'
    ? '[data-tour="ancre-guide-pp"]'
    : '[data-tour="ancre-retest-pp"]',
)

// Ancre de téléport du message de fin d'étape : la vue où vit l'étape validée —
// l'entretien (ancre `ancre-guide-pp`, sous les onglets) pour une étape d'édition
// `finiEnEntretien`, le corpus (ancre `ancre-retest-pp`, sous les cartes) sinon.
const cibleFini = computed(() =>
  finiInfo.value?.vue === 'entretien'
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
       mode PANNEAU (consigne sous les onglets), pas de voile ni de bulle. Et si
       la cible est dans une AUTRE vue (état 'cachee', ex. l'utilisateur est
       parti sur l'Accueil ou la Table de données), on ne montre RIEN — pause
       silencieuse : le spotlight reprend seul quand on revient sur l'écran de
       l'action. -->
  <Teleport to="body">
    <template v-if="etapeCourante && !modePanneau && cible.etat !== 'cachee'">
      <!-- Voile plein si aucune cible (bulle centrée) ; sinon trou + bulle sur la cible. -->
      <div v-if="cible.etat === 'absente'" class="spotlight-voile"></div>
      <div v-else class="spotlight-trou" :style="styleTrou"></div>
      <div class="spotlight-bulle" :style="styleBulle">
        <div class="bulle-titre">{{ etapeCourante.titre }}</div>
        <p class="bulle-texte">{{ etapeCourante.texte() }}</p>
        <div class="bulle-actions">
          <!-- Pas de « Suivant » : l'utilisateur fait le geste sur l'interface
               lui-même (le guide ne l'enchaîne pas). Un seul petit « Arrêter »
               discret pour quitter le guidage. -->
          <button class="bulle-btn arreter" @click="etapeCouranteId = null">Arrêter</button>
        </div>
      </div>
    </template>
  </Teleport>

  <!-- Consigne « panneau » : affichée SOUS les onglets de l'entretien (ancre
       data-tour posée dans Entretien.vue) — ne cache pas le texte. Pas de
       bouton d'action : l'utilisateur fait le geste lui-même ; seul un petit
       « Arrêter » discret permet de quitter le guidage. -->
  <Teleport v-if="modePanneau && etapeCourante" to='[data-tour="ancre-guide-pp"]'>
    <div class="guide-pp">
      <div class="guide-pp-titre">{{ etapeCourante.titre }}</div>
      <p class="guide-pp-texte">{{ etapeCourante.texte() }}</p>
      <div class="guide-pp-actions">
        <button class="guide-pp-btn arreter" @click="etapeCouranteId = null">Arrêter</button>
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

  <!-- Message « fin d'étape » : après validation. Selon l'étape :
       - étapes de CORPUS (ex. « Charger un entretien ») → on est revenu à
         l'écran Corpus, le message s'affiche sous les cartes (ancre `ancre-retest-pp`) ;
       - étapes d'ÉDITION `finiEnEntretien` (ex. « Écouter et corriger ») → on
         RESTE dans l'entretien, le message s'affiche SOUS les onglets (ancre
         `ancre-guide-pp`) avec un bouton pour revenir à la liste « Pas à pas »,
         pour que l'utilisateur puisse continuer s'il le souhaite.
       Classe `fini-pp` DISTINCTE de `guide-pp` (les tests comptent `.guide-pp`). -->
  <Teleport
    v-if="finiInfo && finiInfo.vue === vue"
    :to="cibleFini"
  >
    <div class="fini-pp">
      <div class="fini-pp-titre">{{ finiInfo.titre }}</div>
      <p class="fini-pp-texte">{{ finiInfo.suite }}</p>
      <div class="fini-pp-actions">
        <button v-if="finiInfo.prochaineId" class="fini-pp-btn" @click="enchainFini">
          Étape suivante : {{ finiInfo.prochaineTitre }} →
        </button>
        <template v-if="finiInfo.vue === 'entretien'">
          <button class="fini-pp-btn revenir" @click="revenirFini">↩ Revenir aux étapes du pas à pas</button>
          <button class="fini-pp-btn discret" @click="finiInfo = null" title="Continuer dans l'entretien">OK</button>
        </template>
        <button v-else class="fini-pp-btn" @click="finiInfo = null">OK</button>
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
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 0.3rem;
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
/* « Arrêter » : petit et discret — la consigne fuit les boutons d'action,
   l'utilisateur doit cliquer sur l'interface, pas sur le guide. */
:global(.bulle-btn.arreter) {
  border: none;
  background: transparent;
  color: #99a;
  font-size: 0.7rem;
  padding: 0.15rem 0.4rem;
}
:global(.bulle-btn.arreter:hover) {
  color: #667;
  text-decoration: underline;
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
  justify-content: center;
  margin-top: 0.2rem;
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
/* « Arrêter » (panneau) : petit et discret, en bas — même logique que la bulle. */
.guide-pp-btn.arreter {
  border: none;
  background: transparent;
  color: #99a;
  font-size: 0.7rem;
  padding: 0.15rem 0.4rem;
}
.guide-pp-btn.arreter:hover {
  color: #667;
  text-decoration: underline;
}
/* Variante « re-test » : info déjà faite (ambre, pas bleue) — l'étape est
   cochée, l'utilisateur est revenu la voir, on propose de retourner à la liste. */
.guide-pp.retest {
  border-color: #e0a03a;
  background: #fff8ec;
}
.guide-pp.retest .guide-pp-titre {
  color: #8a6d3b;
}

/* --- Message de FIN d'étape (écran Corpus, ancre `ancre-retest-pp`) ---
   Variante « bravo » (verte, pas ambre) : l'étape vient d'être validée,
   l'utilisateur est félicité et peut enchaîner sur l'étape suivante. */
.fini-pp {
  border: 1px solid #2e8b57;
  background: #f0faf4;
  border-radius: 8px;
  padding: 0.5rem 0.6rem;
  margin-bottom: 0.5rem;
}
.fini-pp-titre {
  font-weight: 600;
  font-size: 0.85rem;
  color: #1d7a44;
  margin-bottom: 0.2rem;
}
.fini-pp-texte {
  font-size: 0.8rem;
  color: #333;
  margin: 0 0 0.5rem;
}
.fini-pp-actions {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.fini-pp-btn {
  border: 1px solid #2e8b57;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  padding: 0.3rem 0.7rem;
  font-size: 0.8rem;
  color: #1d7a44;
}
.fini-pp-btn:hover {
  background: #e6f6ec;
}
/* Bouton « revenir aux étapes » (message de fin dans l'entretien) : même gabarit
   vert mais fond blanc neutre — action secondaire face à « Étape suivante ». */
.fini-pp-btn.revenir {
  border-color: #2e8b57;
  background: #fff;
}
.fini-pp-btn.revenir:hover {
  background: #e6f6ec;
}
/* « OK » discret (message de fin dans l'entretien) : ferme le message et
   continue à travailler dans l'entretien, sans retour au Pas à pas. */
.fini-pp-btn.discret {
  border: none;
  background: transparent;
  color: #7a9d88;
  font-size: 0.72rem;
  padding: 0.15rem 0.4rem;
}
.fini-pp-btn.discret:hover {
  color: #1d7a44;
  text-decoration: underline;
}</style>
