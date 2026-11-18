import type { Ref } from 'vue'
import type { Inverse, ParticipationJournal } from '../../../shared/entretien/journal'
import { participationParId } from '../../../shared/entretien/participations'
import {
  poserValeurProprietaire, valeursCible, validerLotValeur, type CibleValeur, type ItemLotValeur,
} from '../../../shared/corpus/valeursVariables'

/** Écrit les valeurs dans la session ouverte et garde leurs destinations stables pour l'annulation. */
export function useValeursEntretien(deps: {
  ouvertId: Readonly<Ref<string | null>>
  meta: { valeursGen: Record<string, string> }
  participations: Readonly<Ref<ParticipationJournal[]>>
  editable?: () => boolean
  valeurExiste?: (idVar: string, idMod: string | null) => boolean
  libelleValeur: (idVar: string, idMod: string) => string
  modaliteParLibelle: (idVar: string, libelle: string) => Promise<string>
  enregistrerAction: (libelle: string, inverse: Inverse) => unknown
  rafraichirJournal: () => void
  planifierSauvegarde: () => void
}) {
  const saisies = new WeakMap<Record<string, string>, Map<string, number>>()
  const attentes = new Set<Promise<boolean>>()
  let generation = 0
  const donnees = () => ({ meta: deps.meta, participations: deps.participations.value })
  const valeurDe = (valeurs: Record<string, string>, idVar: string) => Object.hasOwn(valeurs, idVar) ? valeurs[idVar] : null

  function commencerSaisie(valeurs: Record<string, string>, idVar: string): number {
    let revisions = saisies.get(valeurs)
    if (!revisions) { revisions = new Map(); saisies.set(valeurs, revisions) }
    const revision = (revisions.get(idVar) ?? 0) + 1
    revisions.set(idVar, revision)
    return revision
  }

  function poserValeurEntretien(item: ItemLotValeur): boolean {
    validerLotValeur([item])
    if (deps.ouvertId.value !== item.entretienId || deps.editable?.() === false
      || (deps.valeurExiste && !deps.valeurExiste(item.idVar, item.idMod || null))) return false
    const valeurs = valeursCible(donnees(), item.cible)
    if (!valeurs) return false
    commencerSaisie(valeurs, item.idVar)
    const ancien = valeurDe(valeurs, item.idVar)
    poserValeurProprietaire(valeurs, item.idVar, item.idMod)
    if (ancien !== (item.idMod || null)) {
      const participation = item.cible.type === 'participation'
        ? participationParId(deps.participations.value, item.cible.participationId) : undefined
      deps.enregistrerAction(
        `Valeur${participation ? ` (${participation.nom})` : ''} : ${deps.libelleValeur(item.idVar, item.idMod)}`,
        { type: 'poserValeur', entretienId: item.entretienId, cible: { ...item.cible }, idVar: item.idVar, idMod: ancien },
      )
      deps.rafraichirJournal()
    }
    deps.planifierSauvegarde()
    return true
  }

  /** Une réponse attendue ne doit pas être appliquée à une autre session ou après une saisie plus récente. */
  async function preparerValeurLibelle(cible: CibleValeur, idVar: string, libelle: string): Promise<boolean> {
    const session = generation
    const entretienId = deps.ouvertId.value
    if (!entretienId || deps.editable?.() === false) return false
    validerLotValeur([{ entretienId, cible, idVar, idMod: '' }])
    const destination = { ...cible }
    const participations = deps.participations.value
    const valeursGen = deps.meta.valeursGen
    const valeurs = valeursCible(donnees(), destination)
    if (!valeurs) return false
    const ancien = valeurDe(valeurs, idVar)
    const revision = commencerSaisie(valeurs, idVar)
    const idMod = libelle ? await deps.modaliteParLibelle(idVar, libelle) : ''
    if (session !== generation || deps.ouvertId.value !== entretienId || deps.participations.value !== participations
      || deps.meta.valeursGen !== valeursGen || valeursCible(donnees(), destination) !== valeurs
      || saisies.get(valeurs)?.get(idVar) !== revision || valeurDe(valeurs, idVar) !== ancien) return false
    return poserValeurEntretien({ entretienId, cible: destination, idVar, idMod })
  }

  function poserValeurLibelleEntretien(cible: CibleValeur, idVar: string, libelle: string): Promise<boolean> {
    const operation = preparerValeurLibelle(cible, idVar, libelle)
    attentes.add(operation)
    void operation.then(() => attentes.delete(operation), () => attentes.delete(operation))
    return operation
  }

  async function attendreSaisies(): Promise<void> {
    while (attentes.size) await Promise.all([...attentes])
  }

  function annulerSaisies(): void {
    generation++
    attentes.clear()
  }

  return { poserValeurEntretien, poserValeurLibelleEntretien, attendreSaisies, annulerSaisies }
}
