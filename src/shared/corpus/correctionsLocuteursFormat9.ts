import type { CorpusFichier, Locuteur } from '../format'
import type { ParticipationLocuteur } from '../locuteurs'
import type { EntreeMatrice } from './requetes'
import { appliquerCorrectionLocuteurs } from './correctionsLocuteurs'
import { validerCommandeCorrectionLocuteurs, type CommandeCorrectionLocuteurs } from './contratsLocuteurs'
import { membresPersonnesRegle } from './cas'
import { reconcilierRefusFormat9, reporterReglesCasFormat9 } from './personnes'
import { lireCasFormat9 } from '../natif/lectureCasFormat9'

type ParticipationCorrection = Pick<ParticipationLocuteur, 'id' | 'nom' | 'locuteurRef' | 'associationRetiree' | 'rapprochementsRefuses'>

/** Adapte les champs modifiés sans convertir les fichiers ni les refus historiques du format 9. */
export function appliquerCorrectionLocuteursFormat9(
  corpus: CorpusFichier, entretiens: EntreeMatrice[], commande: CommandeCorrectionLocuteurs, genererId: () => string,
): string {
  validerCommandeCorrectionLocuteurs(commande)
  const originaux: { original: Locuteur; cible: ParticipationCorrection }[] = []
  const modeles = entretiens.map((e) => ({ id: e.id, titre: e.titre, data: {
    participations: e.data.locuteurs.map((p) => {
      if (!p.id) throw new Error('Les identifiants des participations doivent être complétés avant la correction.')
      const cible: ParticipationCorrection = { id: p.id, nom: p.nom, locuteurRef: p.personneRef, associationRetiree: p.personneDeliee }
      originaux.push({ original: p, cible })
      return cible
    }),
  } }))
  const ids = new Set(commande.type === 'regrouperSelection' ? commande.locuteurIds : [])
  const absorbes = new Set(commande.type === 'regrouperSelection' ? commande.locuteurIds.filter((id) => id !== commande.conserverId) : [])
  const membres = new Set(originaux.filter(({ original }) => original.personneRef && ids.has(original.personneRef))
    .map(({ original }) => `locuteur:${original.id}`))
  const casNatifs = Object.fromEntries(Object.entries(corpus.cas ?? {}).map(([id, cas]) => [id, lireCasFormat9(cas)]))
  const casModifies = Object.entries(corpus.cas ?? {}).filter(([, cas]) =>
    cas.regles.some((r) => membresPersonnesRegle(r).some((m) => absorbes.has(m.personneId))))
  const resultat = appliquerCorrectionLocuteurs({ locuteurs: corpus.personnes, cas: casNatifs }, modeles, commande, genererId)
  const ajouts = originaux.map(({ cible }) => cible.rapprochementsRefuses?.map((r) => {
    if (r.type !== 'locuteur') throw new Error('Un refus contextualisé ne peut pas être enregistré dans le format 9.')
    return `personne:${r.locuteurId}`
  }))
  originaux.forEach(({ original, cible }, i) => {
    original.nom = cible.nom
    original.personneRef = cible.locuteurRef
    if (cible.associationRetiree === undefined) delete original.personneDeliee
    else original.personneDeliee = cible.associationRetiree
    if (ajouts[i] !== undefined) original.rapprochementsRefuses = [...new Set([...(original.rapprochementsRefuses ?? []), ...ajouts[i]!])]
  })
  if (commande.type === 'regrouperSelection') reconcilierRefusFormat9(entretiens, commande.conserverId, absorbes, membres)
  for (const [id, cas] of casModifies) reporterReglesCasFormat9(cas, casNatifs[id])
  return resultat
}
