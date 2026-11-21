import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CorpusFichier, EntretienFichier, Locuteur, ReferenceParticipation } from '../../src/shared/format'
import { associerParticipation } from '../../src/shared/corpus/identitesLocuteurs'
import { validerCorpusNatif, validerEntretienNatif } from '../../src/shared/natif/validation'

/** Installe des données synthétiques natives, sans dépendre des commandes de l’application. */
export function installerIdentitesFixture(dir: string, donnees: {
  locuteurs?: readonly Locuteur[]
  associations?: readonly (ReferenceParticipation & { locuteurRef: string | null })[]
}): void {
  const chemin = join(dir, 'corpus.crp'), corpus: CorpusFichier = JSON.parse(readFileSync(chemin, 'utf8'))
  const fichiers = new Map<string, EntretienFichier>()
  for (const locuteur of donnees.locuteurs ?? []) corpus.locuteurs[locuteur.id] = structuredClone(locuteur)
  for (const ref of donnees.associations ?? []) {
    if (!Object.hasOwn(corpus.membership, ref.entretienId)) throw new Error('Entretien de fixture absent du corpus.')
    let data = fichiers.get(ref.entretienId)
    if (!data) { data = JSON.parse(readFileSync(join(dir, 'entretiens', `${ref.entretienId}.json`), 'utf8')) as EntretienFichier; fichiers.set(ref.entretienId, data) }
    associerParticipation(corpus, data, ref.participationId, ref.locuteurRef)
  }
  validerCorpusNatif(corpus)
  for (const data of fichiers.values()) validerEntretienNatif(data)
  writeFileSync(chemin, JSON.stringify(corpus, null, 2))
  for (const [id, data] of fichiers) writeFileSync(join(dir, 'entretiens', `${id}.json`), JSON.stringify(data, null, 2))
}

export function creerLocuteurFixture(dir: string, nom: string, participations: readonly ReferenceParticipation[] = []): string {
  const id = `fixture-${randomUUID()}`
  installerIdentitesFixture(dir, { locuteurs: [{ id, nom }], associations: participations.map((p) => ({ ...p, locuteurRef: id })) })
  return id
}
