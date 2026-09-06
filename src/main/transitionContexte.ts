import { CorpusStore, type PreparationOuvertureCorpus } from './corpusStore'
import type { OuvertureCorpus } from '../shared/format'
import type { DemandeMigration } from '../shared/corpus/migrationCrp'

/** Exécute une bascule en trois phases : préparation sans écriture,
 *  fermeture de l'ancien contexte, puis finalisation de la cible. */
export async function executerTransitionPreparee<T, R>(
  preparer: () => T,
  fermerContexteActuel: () => Promise<void>,
  finaliser: (preparation: T) => R,
): Promise<R> {
  const preparation = preparer()
  await fermerContexteActuel()
  return finaliser(preparation)
}

interface DependancesTransitionsLocales {
  creerStore?: (dir: string) => CorpusStore
  fermerContexteActuel: () => Promise<void>
  finaliser: (
    store: CorpusStore,
    dir: string,
    preparation: PreparationOuvertureCorpus,
  ) => OuvertureCorpus
}

/** Opérations branchées sur les handlers IPC qui changent de corpus local. */
export function creerTransitionsLocales(deps: DependancesTransitionsLocales) {
  const creerStore = deps.creerStore ?? ((dir: string) => new CorpusStore(dir))

  const preparerStore = (dir: string): CorpusStore => {
    const store = creerStore(dir)
    store.lectureSeule = false
    return store
  }

  return {
    ouvrirDossier: async (dir: string): Promise<OuvertureCorpus> => {
      const store = preparerStore(dir)
      return executerTransitionPreparee(
        () => store.preparerOuverture(),
        deps.fermerContexteActuel,
        (preparation) => deps.finaliser(store, dir, preparation),
      )
    },

    creerNouveau: async (dir: string, nom: string): Promise<OuvertureCorpus> => {
      const store = preparerStore(dir)
      return executerTransitionPreparee(
        () => store.preparerOuverture(nom),
        deps.fermerContexteActuel,
        (preparation) => deps.finaliser(store, dir, preparation),
      )
    },

    migrer: async (req: DemandeMigration): Promise<OuvertureCorpus> => {
      const store = preparerStore(req.dossier)
      return executerTransitionPreparee(
        () => store.preparerMigrationDepuisV1(
          req.nom,
          { cheminCrp: req.cheminCrp, dateCreation: req.dateCreation },
          req.codebook,
          req.variables,
          req.reglesAnon,
          req.paramsAnon,
        ),
        deps.fermerContexteActuel,
        (preparation) => deps.finaliser(store, req.dossier, preparation),
      )
    },
  }
}

interface DependancesOubliCompte<T> {
  id: string
  idActif: string | null
  fermerContexteActuel: () => Promise<void>
  desactiverContexte: () => void
  oublier: (id: string) => void
  lister: () => T[]
}

/** Ferme le compte actif avant de retirer ses identifiants du coffre. */
export async function oublierCompte<T>(deps: DependancesOubliCompte<T>): Promise<T[]> {
  if (deps.idActif === deps.id) {
    await deps.fermerContexteActuel()
    deps.desactiverContexte()
  }
  deps.oublier(deps.id)
  return deps.lister()
}
