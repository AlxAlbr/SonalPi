export type SurProgressionFichier = (octets: number, total: number | null) => void

export interface ResultatTeleversement {
  ok: boolean
  raison?: string
  suggere?: string
}

/** Transfère les fichiers binaires sans exposer le protocole du fournisseur. */
export interface TransfertFichiersDistants {
  telechargerFichier(
    cheminRelatif: string,
    destination: string,
    surProgression?: SurProgressionFichier,
  ): Promise<void>
  televerserFichier(
    cheminCible: string,
    contenu: Uint8Array | string,
    contentType?: string,
    surProgression?: SurProgressionFichier,
  ): Promise<ResultatTeleversement>
}
