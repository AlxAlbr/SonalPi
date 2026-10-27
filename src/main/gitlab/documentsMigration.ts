import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BilanMigrationGitLab, ConversionEntretienMigrationGitLab } from '../../shared/corpus/migrationGitLab'
import { mapperDefinitions, mapperEntretiensV1, mapperParamsAnon, mapperTabAnon } from '../../shared/corpus/migrationCrp'
import { estDestinationAutreMigration } from '../../shared/corpus/conservationMigration'
import { referenceMediaDistant, type ReferenceMediaDistant } from '../../shared/format'
import { CorpusStore } from '../corpusStore'
import { aplatir } from '../../shared/entretien/anon/anonymisation'
import { parserAliases, regleEnCollisionAlias } from '../../shared/entretien/anon/alias'
import { textePlage } from '../../shared/entretien/anon/classification'
import { pointeurLfsGitLab } from './lfs'
import type { ActionPlanGitLab } from './publication'

/** Construit les fichiers natifs dans une préparation privée, sans ouvrir de corpus. */
export class DocumentsMigrationGitLab {
  private readonly bilan: BilanMigrationGitLab
  private readonly store: CorpusStore
  private readonly ids: string[] = []

  constructor(private readonly dossier: string, bilan: BilanMigrationGitLab, reprendre = false) {
    this.bilan = structuredClone(bilan)
    this.store = new CorpusStore(dossier)
    if (reprendre) {
      const corpus = this.store.ouvrir()
      const source = corpus.meta?.sourceV1
      if (source?.gitlab?.commit !== bilan.commitSource || source.gitlab.projetId !== bilan.source.projetId ||
        source.gitlab.urlInstance !== bilan.source.urlInstance || source.cheminCrp !== bilan.cheminCrp) {
        throw new Error('La préparation locale appartient à une autre source.')
      }
      this.ids.push(...(corpus.ordreEntretiens ?? []))
      if (this.ids.length !== bilan.entretiens.length) throw new Error('La préparation locale est incomplète.')
      return
    }
    const { codebook, variables } = mapperDefinitions(bilan.apercu.raw)
    let numeroRegle = 0
    this.store.migrerDepuisV1(bilan.apercu.nom, {
      cheminCrp: bilan.cheminCrp,
      dateCreation: bilan.apercu.dateCreation,
      gitlab: { urlInstance: bilan.source.urlInstance, projetId: bilan.source.projetId, commit: bilan.commitSource },
    }, codebook, variables, mapperTabAnon(bilan.apercu.raw.tabAnon, () => `reg-crp-${++numeroRegle}`),
    mapperParamsAnon(bilan.apercu.raw.paramsAnonCorpus), bilan.lexicoV1?.traitements)
  }

  get nombreEntretiens(): number { return this.ids.length }

  ajouter(index: number, conversion: ConversionEntretienMigrationGitLab): string {
    if (index !== this.ids.length || index >= this.bilan.entretiens.length) {
      throw new Error('Ajoutez les entretiens dans l’ordre du bilan préparé.')
    }
    const entretien = this.bilan.entretiens[index]
    const payload = structuredClone(conversion.payload)
    payload.meta.audioRef = null
    delete payload.meta.audioDistant
    if (entretien.media !== null) {
      const media = this.bilan.medias[entretien.media]
      if (!media) throw new Error('Média absent du bilan préparé.')
      payload.meta.audioDistant = referenceMediaDistant(media.cheminDestination,
        this.bilan.destinationMedia === 'depot' ? 'gitlab' : 'webdav')
    }
    payload.meta.sourceV1 = { rtrPath: mapperEntretiensV1(this.bilan.apercu.raw.tabEnt)[index]?.rtrPath ?? null }
    const plan = this.store.preparerImportEntretien(entretien.titre, payload, conversion.codebook ?? [], conversion.variables ?? [], conversion.reglesAnon)
    const regles = Object.values(plan.corpusApres.reglesAnon)
    const plat = aplatir(payload.corpsTexte)
    // La fusion conserve les règles existantes, pas les identifiants temporaires de l'import.
    for (const annotation of plan.entretien.annotations) {
      if (annotation.type !== 'anon' || !annotation.regle) continue
      const source = conversion.reglesAnon.find((r) => r.id === annotation.regle)
      if (!source) throw new Error('La règle d’une décision importée est introuvable.')
      const correspondances = new Set(source.entite.flatMap(parserAliases)
        .map((alias) => regleEnCollisionAlias(alias, regles)?.id).filter((id): id is string => !!id))
      const correspondanceTexte = regleEnCollisionAlias(textePlage(plat, annotation.from, annotation.to), regles)?.id
      const cible = correspondances.size === 1 ? [...correspondances][0]
        : correspondanceTexte && correspondances.has(correspondanceTexte) ? correspondanceTexte : undefined
      if (!cible) throw new Error('Une décision importée ne peut pas être rattachée aux règles du corpus.')
      annotation.regle = cible
    }
    this.store.appliquerTransactionFichiers(plan)
    this.ids.push(plan.id)
    return plan.id
  }

  /** Rend les créations seulement lorsque tous les médias ont été confirmés. */
  *documents(referencesConfirmees: readonly ReferenceMediaDistant[]): Generator<Extract<ActionPlanGitLab, { action: 'create' }>> {
    if (this.ids.length !== this.bilan.entretiens.length) throw new Error('La conversion des entretiens n’est pas terminée.')
    if (referencesConfirmees.length !== this.bilan.medias.length) throw new Error('La copie des médias n’est pas terminée.')
    const fournisseur = this.bilan.destinationMedia === 'depot' ? 'gitlab' : 'webdav'
    for (let index = 0; index < this.bilan.medias.length; index += 1) {
      const media = this.bilan.medias[index]
      const reference = referencesConfirmees[index]
      if (reference.chemin !== media.cheminDestination || reference.fournisseur !== fournisseur) {
        throw new Error('La copie média confirmée ne correspond pas au bilan préparé.')
      }
    }
    yield* this.contenusPrepares()
  }

  /** Prépare les contenus locaux avant la première copie, sans autoriser leur envoi. */
  *contenusPrepares(): Generator<Extract<ActionPlanGitLab, { action: 'create' }>> {
    if (this.ids.length !== this.bilan.entretiens.length) throw new Error('La conversion des entretiens n’est pas terminée.')
    if (this.bilan.destinationMedia === 'depot' && this.bilan.medias.length) {
      yield {
        action: 'create', chemin: 'medias/.gitattributes',
        contenu: '**/* filter=lfs diff=lfs merge=lfs -text\n.gitattributes -filter -diff -merge text\n',
      }
      for (const media of this.bilan.medias) {
        yield { action: 'create', chemin: media.cheminDestination, contenu: pointeurLfsGitLab(media) }
      }
    }
    const autres = this.bilan.conservation?.autres ?? []
    if (autres.length) {
      yield { action: 'create', chemin: 'Autres/.gitattributes',
        contenu: '**/* filter=lfs diff=lfs merge=lfs -text\n.gitattributes -filter -diff -merge text\n' }
      for (const fichier of autres) {
        if (!estDestinationAutreMigration(fichier.cheminDestination)) throw new Error('Chemin documentaire invalide.')
        yield { action: 'create', chemin: fichier.cheminDestination, contenu: pointeurLfsGitLab(fichier) }
      }
    }
    for (const id of this.ids) {
      const chemin = `entretiens/${id}.json`
      yield { action: 'create', chemin, contenu: JSON.stringify(JSON.parse(readFileSync(join(this.dossier, chemin), 'utf8'))) }
    }
    yield { action: 'create', chemin: 'corpus.json', contenu: JSON.stringify(this.store.ouvrir()) }
  }
}
