/**
 *  BANNIÈRE GLOBALE D'ERREURS — filet de sécurité pour les rejets IPC non
 *  catchés : un refus de verrou (« définitions en cours de modification par
 *  X »), une coupure réseau ou une divergence 412 remontent comme exception
 *  IPC depuis le main. Les chemins critiques (suppression, publication)
 *  affichent déjà leurs propres messages ciblés ; tout AUTRE rejet atterrit ici
 *  plutôt que de disparaître dans la console — « rien de tranché ni perdu en
 *  silence ».
 */

import { ref } from 'vue'

/** Message affiché par la bannière App (null = rien à afficher). */
export const erreurGlobale = ref<string | null>(null)

/** Bannière jumelle, ton INFORMATIONNEL : événements rattrapés par l'app
 *  (ex. bascule automatique après suppression du dossier du corpus courant) ;
 *  fermable comme son pendant erreur. */
export const infoGlobale = ref<string | null>(null)

export function effacerErreurGlobale(): void {
  erreurGlobale.value = null
}

/** Efface un message seulement s'il est encore celui qui est affiché. */
export function effacerErreurGlobaleSi(message: string): void {
  if (erreurGlobale.value === message) erreurGlobale.value = null
}

export function effacerInfoGlobale(): void {
  infoGlobale.value = null
}

/** Nettoie un message d'exception IPC Electron pour l'affichage :
 *  « Error invoking remote method 'corpus:X': Error: message réel »
 *  → « message réel » (le canal n'intéresse pas l'utilisateur). */
export function nettoyerMessage(raison: unknown): string {
  const brut =
    raison instanceof Error
      ? raison.message
      : typeof raison === 'string'
        ? raison
        : JSON.stringify(raison)
  const m = /Error invoking remote method '[^']+':\s*(?:Error:\s*)?([\s\S]+)$/.exec(brut)
  return (m ? m[1] : brut)?.trim() || 'Erreur inattendue.'
}

/** Affiche une erreur attendue en conservant son détail utile. */
export function afficherErreurGlobale(raison: unknown, contexte?: string): string {
  const detail = nettoyerMessage(raison)
  const message = contexte ? `${contexte} : ${detail}` : detail
  erreurGlobale.value = message
  return message
}

let installe = false

/** À appeler UNE fois au démarrage du renderer (main.ts). Sans effet multiple. */
export function installerErreursGlobales(): void {
  if (installe) return
  installe = true
  window.addEventListener('unhandledrejection', (ev) => {
    // On n'appelle PAS preventDefault : la trace reste visible en console dev.
    afficherErreurGlobale(ev.reason)
  })
}
