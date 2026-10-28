/** Disponibilité des commandes selon le travail affiché dans l’application. */
export interface EtatMenuApplication {
  travail: boolean
  naviguer: boolean
  enregistrer: boolean
  sauvegarder: boolean
  exporter: boolean
  ajouter: boolean
  trier: boolean
  trierContenu: boolean
}

export const MENU_ACCUEIL: EtatMenuApplication = {
  travail: false,
  naviguer: true,
  enregistrer: false,
  sauvegarder: false,
  exporter: false,
  ajouter: false,
  trier: false,
  trierContenu: false,
}
