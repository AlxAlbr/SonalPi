import { CorpusStore, type PreparationOuvertureCorpus } from './corpusStore'
import type { OuvertureCorpus } from '../shared/format'
import type { DemandeMigration } from '../shared/corpus/migrationCrp'
import type { InstallationAutresMigration } from './conservationMigrationLocale'
import type { InstallationExemple } from '../shared/exemples'
import type { ExemplesLocaux } from './exemples'

export interface CaptureContexteCourant<T> {
  contexte: T
  generation: number
}

export type ResultatCommandeContexte<T> =
  | { courant: true; valeur: T }
  | { courant: false }

/** Conserve l'identité du contexte afin d'écarter les réponses devenues obsolètes. */
export class RegistreContexteCourant<T> {
  private contexte: T | null = null
  private generation = 0

  get actuel(): T | null {
    return this.contexte
  }

  get generationActuelle(): number {
    return this.generation
  }

  remplacer(contexte: T | null): void {
    this.contexte = contexte
    this.generation += 1
  }

  capturer(): CaptureContexteCourant<T> | null {
    return this.contexte === null
      ? null
      : { contexte: this.contexte, generation: this.generation }
  }

  estCourante(capture: CaptureContexteCourant<T>): boolean {
    return this.contexte === capture.contexte && this.generation === capture.generation
  }

  estGenerationCourante(generation: number): boolean {
    return this.generation === generation
  }

  async executer<R>(
    capture: CaptureContexteCourant<T>,
    operation: (contexte: T) => Promise<R>,
  ): Promise<ResultatCommandeContexte<R>> {
    if (!this.estCourante(capture)) return { courant: false }
    try {
      const valeur = await operation(capture.contexte)
      return this.estCourante(capture)
        ? { courant: true, valeur }
        : { courant: false }
    } catch (erreur) {
      if (!this.estCourante(capture)) return { courant: false }
      throw erreur
    }
  }
}

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
  exemples?: Pick<ExemplesLocaux, 'preparerInstallation'>
  fermerContexteActuel: () => Promise<void>
  preparerDocumentsMigration?: (req: DemandeMigration) => Promise<InstallationAutresMigration>
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

    creerNouveau: async (dir: string, nom: string, exemple?: InstallationExemple): Promise<OuvertureCorpus> => {
      if (exemple) {
        if (!deps.exemples) throw new Error('L’installation des exemples n’est pas disponible.')
        const installation = deps.exemples.preparerInstallation(dir, nom, exemple)
        try {
          return await executerTransitionPreparee(
            () => installation,
            deps.fermerContexteActuel,
            ({ publier }) => {
              const store = publier()
              return deps.finaliser(store, dir, store.preparerOuverture())
            },
          )
        } finally { installation.nettoyer() }
      }
      const store = preparerStore(dir)
      return executerTransitionPreparee(
        () => store.preparerOuverture(nom),
        deps.fermerContexteActuel,
        (preparation) => deps.finaliser(store, dir, preparation),
      )
    },

    migrer: async (req: DemandeMigration): Promise<OuvertureCorpus> => {
      const store = preparerStore(req.dossier)
      const preparation = store.preparerMigrationDepuisV1(
        req.nom, { cheminCrp: req.cheminCrp, dateCreation: req.dateCreation },
        req.codebook, req.variables, req.reglesAnon, req.paramsAnon, req.traitementsLexico,
      )
      const documents = await deps.preparerDocumentsMigration?.(req)
      try {
        return await executerTransitionPreparee(
          () => preparation,
          deps.fermerContexteActuel,
          (preparee) => {
            documents?.installer()
            return deps.finaliser(store, req.dossier, preparee)
          },
        )
      } finally { documents?.nettoyer() }
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
