export interface SuiviCorrectionLocuteurs {
  operationId: string
  action: string
  etat: 'a-reprendre' | 'a-verifier'
  termines: number
  total: number
}
