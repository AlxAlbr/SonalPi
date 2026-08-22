/**
 * BANNIÈRE GLOBALE D'ERREURS (E3) — filet de sécurité pour les rejets IPC non
 * catchés : avant E3 les gestes flux B ne pouvaient échouer qu'en local ; avec
 * les transactions §4.7, un refus de verrou (« définitions en cours de
 * modification par X »), une coupure réseau ou une divergence 412 remontent
 * comme exception IPC depuis le main. Les chemins critiques (suppression,
 * publication) affichent déjà leurs propres messages ciblés ; tout AUTRE rejet
 * atterrit ici plutôt que de disparaître dans la console — « rien de tranché
 * ni perdu en silence ».
 */

import { ref } from 'vue'

/** Message affiché par la bannière App (null = rien à afficher). */
export const erreurGlobale = ref<string | null>(null)

export function effacerErreurGlobale(): void {
  erreurGlobale.value = null
}

/** Nettoie un message d'exception IPC Electron pour l'affichage :
 *  « Error invoking remote method 'corpus:X': Error: message réel »
 *  → « message réel » (le canal n'intéresse pas l'utilisateur). */
function nettoyerMessage(raison: unknown): string {
  const brut =
    raison instanceof Error
      ? raison.message
      : typeof raison === 'string'
        ? raison
        : JSON.stringify(raison)
  const m = /Error invoking remote method '[^']+':\s*(?:Error:\s*)?([\s\S]+)$/.exec(brut)
  return (m ? m[1] : brut)?.trim() || 'Erreur inattendue.'
}

let installe = false

/** À appeler UNE fois au démarrage du renderer (main.ts). Sans effet multiple. */
export function installerErreursGlobales(): void {
  if (installe) return
  installe = true
  window.addEventListener('unhandledrejection', (ev) => {
    // On n'appelle PAS preventDefault : la trace reste visible en console dev.
    erreurGlobale.value = nettoyerMessage(ev.reason)
  })
}
