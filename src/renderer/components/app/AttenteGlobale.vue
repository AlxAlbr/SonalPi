<script setup lang="ts">
import { onMounted, onScopeDispose, ref, watch } from 'vue'
import { fermetureEnCours, messageAttente } from '../../attente'

/**
 *  Voile d'attente affiché pendant une opération bloquante.
 *  Il intercepte aussitôt clics et clavier, mais n'apparaît qu'après un court délai,
 *  pour ne pas clignoter lors des opérations rapides.
 *  Pendant la fermeture, un bouton permet de ne pas attendre un serveur trop lent.
 */
const visible = ref(false)
const voile = ref<HTMLElement | null>(null)
let focusAvant: HTMLElement | null = null
let minuterie: ReturnType<typeof setTimeout> | null = null
const DELAI_BOUTON_FERMETURE_MS = 5_000
const proposerFermetureImmediate = ref(false)
let minuterieFermeture: ReturnType<typeof setTimeout> | null = null

watch(fermetureEnCours, (enCours) => {
  if (enCours && !minuterieFermeture) {
    minuterieFermeture = setTimeout(() => { proposerFermetureImmediate.value = true }, DELAI_BOUTON_FERMETURE_MS)
  }
}, { immediate: true })

function fermerSansAttendre() {
  window.sonal.application.fermerSansAttendre()
}

function bloquerClavier(evenement: KeyboardEvent) {
  if (evenement.key === 'Tab') {
    evenement.preventDefault()
    evenement.stopPropagation()
    const bouton = voile.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')
    ;(bouton ?? voile.value)?.focus()
    return
  }
  // Les commandes du voile restent accessibles, sans réactiver l'écran derrière.
  if (evenement.target instanceof Node && voile.value?.contains(evenement.target)) return
  evenement.preventDefault()
  evenement.stopPropagation()
}

watch(messageAttente, (message, avant) => {
  if (message && !avant) {
    focusAvant = document.activeElement instanceof HTMLElement ? document.activeElement : null
    voile.value?.focus()
    window.addEventListener('keydown', bloquerClavier, true)
    minuterie = setTimeout(() => { visible.value = true }, 150)
  } else if (!message && avant) {
    window.removeEventListener('keydown', bloquerClavier, true)
    if (minuterie) clearTimeout(minuterie)
    minuterie = null
    visible.value = false
    if (focusAvant?.isConnected) focusAvant.focus()
    focusAvant = null
  }
}, { flush: 'post', immediate: true })

onMounted(() => { if (messageAttente.value) voile.value?.focus() })

onScopeDispose(() => {
  window.removeEventListener('keydown', bloquerClavier, true)
  if (minuterie) clearTimeout(minuterie)
  if (minuterieFermeture) clearTimeout(minuterieFermeture)
  if (focusAvant?.isConnected) focusAvant.focus()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="messageAttente"
      ref="voile"
      class="voile-attente"
      :class="{ visible }"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-label="Opération en cours"
      aria-busy="true"
      @keydown.stop
      @keyup.stop
    >
      <div v-if="visible" class="boite-attente" role="status" aria-live="polite">
        <div class="ligne-attente">
          <span class="roue" aria-hidden="true"></span>
          <span>{{ messageAttente }}</span>
        </div>
        <div v-if="fermetureEnCours && proposerFermetureImmediate" class="fermeture-immediate">
          <p>Le serveur met du temps à répondre. Vous pouvez fermer maintenant :
            votre travail reste enregistré sur ce poste, et SonalPi proposera de l’envoyer au prochain lancement.</p>
          <button type="button" @click="fermerSansAttendre">Fermer sans attendre</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.voile-attente {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  cursor: progress;
  transition: background 0.2s;
}
.voile-attente.visible {
  background: rgba(0, 0, 0, 0.25);
}
.boite-attente {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  max-width: min(30rem, calc(100vw - 2rem));
  padding: 0.9rem 1.2rem;
  border-radius: 10px;
  background: #fff;
  color: #333;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
  font-size: 0.95rem;
}
.ligne-attente {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}
.fermeture-immediate {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: #555;
}
.fermeture-immediate p {
  margin: 0;
}
.fermeture-immediate button {
  padding: 0.35rem 0.9rem;
  border: 1px solid #4527a0;
  border-radius: 6px;
  background: #fff;
  color: #4527a0;
  cursor: pointer;
}
.roue {
  width: 1.1rem;
  height: 1.1rem;
  flex: none;
  border: 2px solid #b7a9e8;
  border-top-color: #4527a0;
  border-radius: 50%;
  animation: tourner 0.8s linear infinite;
}
@keyframes tourner {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .roue { animation-duration: 2.4s; }
}
</style>
