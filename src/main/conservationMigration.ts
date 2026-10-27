import { posix } from 'node:path'
import type { CrpV1 } from '../shared/corpus/migrationCrp'
import { raisonExclusionMigration, type ConservationMigration, type FichierAutreMigration, type FichierNonReprisMigration } from '../shared/corpus/conservationMigration'

interface SourceConservationMigration {
  cheminCrp: string
  fichiers: string[]
  utilises: Set<string>
  nonRepris?: FichierNonReprisMigration[]
  lireCorpus(chemin: string): Promise<CrpV1 | null>
  references(chemin: string, corpus: CrpV1): string[]
  information(chemin: string): Promise<Omit<FichierAutreMigration, 'cheminSource' | 'cheminDestination'>>
}

/** Limite les copies au dossier choisi et conserve les documents dans leur format d'origine. */
export async function preparerConservationMigration(source: SourceConservationMigration): Promise<ConservationMigration> {
  const parent = posix.dirname(source.cheminCrp)
  const prefixe = parent === '.' ? '' : `${parent}/`
  const fichiers = source.fichiers.filter((p) => p.startsWith(prefixe)).sort()
  const autresCorpus = fichiers.filter((p) => /\.crp$/i.test(p) && p !== source.cheminCrp)
  const reserves = new Set<string>(autresCorpus)
  const dossiersReserves = new Set(autresCorpus.map((p) => posix.dirname(p)).filter((p) => p !== parent))
  const bilan: ConservationMigration = { autres: [], nonRepris: [...(source.nonRepris ?? [])], autresCorpus: autresCorpus.length, avertissements: [] }
  for (const chemin of autresCorpus.filter((p) => posix.dirname(p) === parent)) {
    const corpus = await source.lireCorpus(chemin)
    if (corpus) for (const ref of source.references(chemin, corpus)) reserves.add(ref)
    else bilan.avertissements.push(`Les fichiers rattachés à « ${chemin.slice(prefixe.length)} » n’ont pas pu être identifiés. Vérifiez la liste des documents supplémentaires.`)
  }
  const destinations = new Set<string>()
  for (const chemin of fichiers) {
    if (source.utilises.has(chemin)) continue
    const relatif = chemin.slice(prefixe.length)
    const raison = raisonExclusionMigration(relatif) ??
      (reserves.has(chemin) || [...dossiersReserves].some((p) => chemin.startsWith(`${p}/`)) ? 'Fichier rattaché à un autre corpus.' : null)
    if (raison) { bilan.nonRepris.push({ chemin: relatif, raison }); continue }
    const cheminDestination = `Autres/${relatif}`
    const cle = cheminDestination.normalize('NFC').toLowerCase()
    if (destinations.has(cle)) throw new Error(`Deux documents portent un nom trop proche : « ${relatif} ». Renommez-les dans une copie de la source avant de migrer.`)
    destinations.add(cle)
    const information = await source.information(chemin)
    bilan.autres.push({ cheminSource: chemin, cheminDestination, ...information })
  }
  return bilan
}
