/** Empreinte de contenu utilisée pour comparer deux lectures, jamais comme garde d'écriture. */
export type EmpreinteLectureDistante =
  | { type: 'webdav-etag'; valeur: string }
  | { type: 'gitlab-blob'; valeur: string }

/** Entrée d'un inventaire limité aux enfants directs d'un dossier. */
export interface EntreeLectureDistante {
  chemin: string
  dossier: boolean
  empreinte: EmpreinteLectureDistante | null
  taille?: number
}

/** Accès en lecture nécessaire au miroir, sans opération de publication. */
export interface LectureDistante {
  inventorier(dossierRelatif: string): Promise<EntreeLectureDistante[]>
  lireTexte(cheminRelatif: string): Promise<string>
}
