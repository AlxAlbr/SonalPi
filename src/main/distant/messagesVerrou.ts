import { MARGE_DERIVE_S, type ContenuVerrou } from '../verrous/types'
import { abandonneParCePoste } from '../verrous/providerPutConditionnel'

/** Heure lisible d'un horodatage, avec la date s'il ne date pas d'aujourd'hui. */
function moment(iso: string, maintenant: Date): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'une heure inconnue'
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === maintenant.toDateString() ? heure : `${d.toLocaleDateString('fr-FR')} ${heure}`
}

/** Message affiché quand les définitions du corpus sont réservées par quelqu'un d'autre.
 *  Il dit qui, depuis quand, et si la réservation vient d'une session interrompue de ce poste.
 *  Le détail complet part dans la console pour l'assistance. */
export function messageRefusDefinitions(tenuPar: ContenuVerrou | null, machineId?: string, maintenant = new Date()): string {
  console.warn('[verrou corpus] refus d’acquisition, détenteur :', JSON.stringify(tenuPar))
  if (!tenuPar) {
    return 'Le corpus est réservé par une modification en cours ou interrompue, sans que le serveur indique par qui. ' +
      'Réessayez dans un instant ; si le blocage dure plus d’une demi-heure, fermez puis rouvrez le corpus pour le lever.'
  }
  const cePoste = !!machineId && tenuPar.machineId === machineId
  const debut = `Le corpus est en cours de modification par ${tenuPar.userId}${cePoste ? ' sur ce poste' : ''}` +
    ` (dernière activité à ${moment(tenuPar.refreshedAt, maintenant)}).`
  if (cePoste && abandonneParCePoste(tenuPar, maintenant.getTime())) {
    return `${debut} Cette réservation vient d’une session de SonalPi interrompue. ` +
      'Fermez puis rouvrez le corpus pour la libérer.'
  }
  if (cePoste) {
    const levee = new Date(Date.parse(tenuPar.refreshedAt) + (tenuPar.ttl + MARGE_DERIVE_S) * 1000 + 60_000).toISOString()
    return `${debut} Si cette réservation ne sert plus, elle sera levée automatiquement à partir de ${moment(levee, maintenant)} ; ` +
      'réessayez à ce moment-là.'
  }
  return `${debut} Actualisez le corpus, puis réessayez dans un instant.`
}
