import { createApp } from 'vue'
import App from './App.vue'
import { installerErreursGlobales } from './erreurs'
import './styles/base.css'
import './styles/editeur.css'

// Un fichier lâché HORS des zones de dépôt (modale d'ajout) ne doit pas faire
// naviguer la fenêtre vers le fichier (comportement Chromium par défaut).
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => e.preventDefault())

// Bannière globale : les rejets IPC non catchés (refus de verrou, hors
// ligne, divergence) s'affichent au lieu de mourir dans la console.
installerErreursGlobales()

createApp(App).mount('#app')
