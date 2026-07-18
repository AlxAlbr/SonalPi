import { createApp } from 'vue'
import App from './App.vue'
import './styles/base.css'
import './styles/editeur.css'

// Un fichier lâché HORS des zones de dépôt (modale d'ajout) ne doit pas faire
// naviguer la fenêtre vers le fichier (comportement Chromium par défaut).
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => e.preventDefault())

createApp(App).mount('#app')
