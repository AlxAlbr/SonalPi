import type { Ref } from 'vue'
import type { Inverse } from '../../../shared/entretien/journal'
import type { Locuteur } from '../../../shared/format'

/** Gère les valeurs générales et les valeurs propres à chaque locuteur. */
export function useValeursEntretien(deps: {
  meta: { valeursGen: Record<string, string> }
  locuteurs: Ref<Locuteur[]>
  libelleValeur: (idVar: string, idMod: string) => string
  enregistrerAction: (libelle: string, inverse: Inverse) => unknown
  rafraichirJournal: () => void
  planifierSauvegarde: () => void
}) {
  function setValeurGen(idVar: string, idMod: string) {
    const ancien = deps.meta.valeursGen[idVar] ?? null
    if (idMod) deps.meta.valeursGen[idVar] = idMod
    else delete deps.meta.valeursGen[idVar]
    if (ancien !== (idMod || null)) {
      deps.enregistrerAction(
        `Valeur : ${deps.libelleValeur(idVar, idMod)}`,
        { type: 'poserValeurGen', idVar, idMod: ancien },
      )
      deps.rafraichirJournal()
    }
    deps.planifierSauvegarde()
  }

  function setValeurLoc(index: number, idVar: string, idMod: string) {
    const locuteur = deps.locuteurs.value.find((candidat) => candidat.index === index)
    if (!locuteur) return
    const ancien = locuteur.valeursLoc[idVar] ?? null
    if (ancien !== (idMod || null)) {
      deps.enregistrerAction(
        `Valeur (${locuteur.nom}) : ${deps.libelleValeur(idVar, idMod)}`,
        { type: 'poserValeurLoc', index, idVar, idMod: ancien },
      )
      deps.rafraichirJournal()
    }
    if (idMod) locuteur.valeursLoc[idVar] = idMod
    else delete locuteur.valeursLoc[idVar]
    deps.planifierSauvegarde()
  }

  return { setValeurGen, setValeurLoc }
}
