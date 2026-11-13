import {
  accessSync, constants, createReadStream, createWriteStream, linkSync,
  lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync,
  rmdirSync, rmSync, statSync, unlinkSync,
} from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { CorpusStore, normaliserCheminAudio } from './corpusStore'
import { cheminCanonique, lireFichierCorpus } from './ouvertureFichier'
import { decoderCrp } from './encodage'
import { lireReglagesLexicoV1 } from './migrationLexicoV1'
import { ConservationMigrationLocale } from './conservationMigrationLocale'
import { mapperDefinitions, mapperEntretiensV1, mapperParamsAnon, mapperTabAnon, type ApercuCrp } from '../shared/corpus/migrationCrp'
import { MIGRATION_ANNULEE, type DemandePreparationMigration, type EntretienSourceMigration } from '../shared/migrationV1'
import type { PayloadEntretien, RegleAnon } from '../shared/format'

interface Source {
  acces: string
  chemin: string
  signature: string
  empreinte?: string
}
interface EntretienPrepare {
  titre: string
  rtrPath: string | null
  source: Source | null
  audioRef: string | null
}
interface CopieMedia {
  source: Source
  relatif: string
  signatureCopie?: string
}

function sousDossier(chemin: string, racine: string): boolean {
  const rel = relative(racine, chemin)
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))
}
function identite(chemin: string): string {
  const s = statSync(chemin, { bigint: true })
  return `${s.dev}:${s.ino}`
}
function signature(chemin: string): string {
  const s = statSync(chemin, { bigint: true })
  if (!s.isFile()) throw new Error(`Ce chemin n’est pas un fichier : ${chemin}`)
  return `${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`
}
function empreinte(contenu: Buffer): string {
  return createHash('sha256').update(contenu).digest('hex')
}
function erreurLisible(erreur: unknown): Error {
  const code = (erreur as NodeJS.ErrnoException)?.code
  if (code === 'ENOSPC') return new Error('Espace disque insuffisant. Choisissez un emplacement disposant de plus d’espace.')
  if (code === 'EACCES' || code === 'EPERM') return new Error('Droits insuffisants pour préparer le corpus à cet emplacement.')
  return erreur instanceof Error ? erreur : new Error(String(erreur))
}

function present(chemin: string): boolean {
  try { lstatSync(chemin); return true }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false; throw e }
}

/** N'accepte qu'un dossier neuf ou vide, hors des sources V1. */
export function verifierDestinationMigration(dossier: string, sourceDir: string): string {
  if (typeof dossier !== 'string' || !dossier.trim()) throw new Error('Choisissez un emplacement pour le corpus SonalPi2.')
  const cible = cheminCanonique(dossier)
  if (sousDossier(cible, sourceDir)) throw new Error('Choisissez un dossier en dehors du dossier SonalPi1 d’origine.')
  if (present(cible)) {
    if (!statSync(cible).isDirectory() || readdirSync(cible).length > 0) {
      throw new Error('Le dossier de destination doit être neuf ou vide. Aucun fichier existant ne sera écrasé.')
    }
  }
  if (!statSync(dirname(cible)).isDirectory()) throw new Error('Choisissez un emplacement existant.')
  return cible
}

export function proposerDestinationMigration(cheminCrp: string, nomDossier: string, emplacement?: string): string {
  const racine = dirname(realpathSync(cheminCrp))
  const parent = cheminCanonique(emplacement ?? dirname(racine))
  const base = nomDossier.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '')
  if (!base || base === '.') throw new Error('Saisissez un nom de dossier.')
  let dossier = join(parent, base)
  for (let n = 2; present(dossier); n++) dossier = join(parent, `${base} (${n})`)
  return verifierDestinationMigration(dossier, racine)
}

/** Construit une cible non active ; les sources ne sont modifiées qu'à la toute fin. */
export class MigrationV1 {
  readonly dossier: string
  private readonly sourceCrp: Source
  private readonly sources: Source[] = []
  private readonly entretiens: EntretienPrepare[] = []
  private readonly copies: CopieMedia[] = []
  private readonly controleur = new AbortController()
  private readonly parentInitial: string
  private readonly destinationInitiale: string | null
  private readonly sourceDir: string
  private readonly req: DemandePreparationMigration
  private readonly apercu: ApercuCrp
  private travail: Promise<void> | null = null
  private temporaire: string | null = null
  private identiteTemporaire: string | null = null
  private store: CorpusStore | null = null
  private imports = 0
  private prete = false
  private phase: 'preparation' | 'finalisation' | 'ouverte' = 'preparation'

  constructor(req: DemandePreparationMigration) {
    if (typeof req.nom !== 'string' || !req.nom.trim()) throw new Error('Le nom du corpus ne peut pas être vide.')
    const lecture = lireFichierCorpus(req.cheminCrp)
    if (lecture.classification.type !== 'v1') throw new Error('La source n’est pas un corpus SonalPi1.')
    this.apercu = lecture.classification.apercu
    this.sourceDir = dirname(lecture.chemin)
    this.req = { ...req, nom: req.nom.trim(), cheminCrp: lecture.chemin }
    this.sourceCrp = this.referencer(lecture.chemin, true)
    if (readFileSync(lecture.chemin, 'utf8') !== lecture.contenu) throw new Error('La source a changé pendant sa lecture.')
    this.dossier = verifierDestinationMigration(req.dossier, this.sourceDir)
    this.parentInitial = identite(dirname(this.dossier))
    this.destinationInitiale = present(this.dossier) ? identite(this.dossier) : null

    const medias = new Map<string, CopieMedia>()
    const erreurs: string[] = []
    const tabEnt = this.apercu.raw.tabEnt ?? []
    if (tabEnt.some((e) => !e || typeof e !== 'object' || Array.isArray(e)
      || (e.rtrPath != null && typeof e.rtrPath !== 'string')
      || (e.audioPath != null && typeof e.audioPath !== 'string'))) {
      throw new Error('Les références des entretiens V1 sont invalides.')
    }
    for (const e of mapperEntretiensV1(tabEnt)) {
      let source: Source | null = null
      let audioRef: string | null = null
      try {
        if (e.rtrPath) source = this.referencer(resolve(this.sourceDir, e.rtrPath.replace(/[\\/]/g, sep)), true)
      } catch { erreurs.push(`Entretien « ${e.titre} » : ${e.rtrPath}`) }
      try {
        if (e.audioRef) {
          const ref = this.referencer(resolve(this.sourceDir, normaliserCheminAudio(e.audioRef)))
          audioRef = ref.chemin
          if (sousDossier(ref.chemin, this.sourceDir)) {
            let copie = medias.get(ref.chemin)
            if (!copie) {
              const nom = basename(ref.chemin).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
              copie = { source: ref, relatif: join('medias', `${medias.size + 1}-${nom}`) }
              medias.set(ref.chemin, copie)
            }
            audioRef = join(this.dossier, copie.relatif)
          }
        }
      } catch { erreurs.push(`Média de « ${e.titre} » : ${e.audioRef}`) }
      this.entretiens.push({ titre: e.titre, rtrPath: e.rtrPath, source, audioRef })
    }
    this.copies = [...medias.values()]
    if (erreurs.length) throw new Error(`Fichiers référencés manquants ou illisibles. Corrigez les sources puis réessayez :\n${erreurs.join('\n')}`)
    const base = this.req.cheminCrp.replace(/\.crp$/i, '')
    for (const extension of ['.out', '.lem', '.cnct', '.lexaf.json']) {
      if (present(base + extension)) this.referencer(base + extension, true)
    }
    this.verifierSources()
  }

  private referencer(acces: string, texte = false): Source {
    const chemin = realpathSync(acces)
    accessSync(chemin, constants.R_OK)
    const source: Source = { acces, chemin, signature: signature(chemin) }
    if (texte) source.empreinte = empreinte(readFileSync(chemin))
    this.sources.push(source)
    return source
  }

  private verifierSources(): void {
    for (const s of this.sources) {
      if (realpathSync(s.acces) !== s.chemin || signature(s.chemin) !== s.signature
        || (s.empreinte !== undefined && empreinte(readFileSync(s.chemin)) !== s.empreinte)) {
        throw new Error(`Une source a changé pendant la migration : ${s.acces}. Réessayez avec les applications V1 fermées.`)
      }
    }
  }

  private verifierDestination(): void {
    if (cheminCanonique(this.req.dossier) !== this.dossier
      || identite(dirname(this.dossier)) !== this.parentInitial) throw new Error('L’emplacement de destination a changé.')
    verifierDestinationMigration(this.dossier, this.sourceDir)
    const actuelle = present(this.dossier) ? identite(this.dossier) : null
    if (actuelle !== this.destinationInitiale) throw new Error('Le dossier de destination a changé pendant la migration.')
  }

  private verifierAnnulation(): void {
    if (this.controleur.signal.aborted) throw new Error(MIGRATION_ANNULEE)
  }

  async preparer(): Promise<{ nbEntretiens: number }> {
    if (this.travail) throw new Error('La préparation de cette migration a déjà commencé.')
    this.travail = this.construire()
    try {
      await this.travail
      return { nbEntretiens: this.entretiens.length }
    } catch (e) {
      await this.nettoyer()
      if (this.controleur.signal.aborted) throw new Error(MIGRATION_ANNULEE)
      throw erreurLisible(e)
    }
  }

  private async construire(): Promise<void> {
    this.verifierAnnulation()
    this.verifierDestination()
    this.temporaire = mkdtempSync(join(dirname(this.dossier), '.sonal-migration-'))
    this.identiteTemporaire = identite(this.temporaire)
    this.store = new CorpusStore(this.temporaire)
    const { codebook, variables } = mapperDefinitions(this.apercu.raw)
    let n = 0
    this.store.migrerDepuisV1(this.req.nom,
      { cheminCrp: this.req.cheminCrp, dateCreation: this.apercu.dateCreation },
      codebook, variables, mapperTabAnon(this.apercu.raw.tabAnon, () => `reg-crp-${++n}`),
      mapperParamsAnon(this.apercu.raw.paramsAnonCorpus), lireReglagesLexicoV1(this.req.cheminCrp).traitements)
    for (const copie of this.copies) {
      this.verifierAnnulation()
      const destination = join(this.temporaire, copie.relatif)
      // Le store crée les entretiens ; ce dossier contient seulement les médias copiés.
      mkdirSync(dirname(destination), { recursive: true })
      const hash = createHash('sha256')
      await pipeline(createReadStream(copie.source.chemin), new Transform({
        transform(chunk: Buffer, _encodage, suite) { hash.update(chunk); suite(null, chunk) },
      }), createWriteStream(destination, { flags: 'wx' }), { signal: this.controleur.signal })
      const attendu = hash.digest('hex')
      const verification = createHash('sha256')
      for await (const morceau of createReadStream(destination, { signal: this.controleur.signal })) verification.update(morceau)
      if (verification.digest('hex') !== attendu) throw new Error(`La copie du média n’est pas fidèle : ${copie.source.acces}`)
      copie.signatureCopie = signature(destination)
    }
    const conservation = new ConservationMigrationLocale([
      ...this.copies.map((c) => c.source.chemin),
      ...this.entretiens.flatMap((e) => e.source ? [e.source.chemin] : []),
    ])
    const bilan = await conservation.preparer(this.req.cheminCrp, this.temporaire, this.controleur.signal)
    const documents = bilan.autres.map((fichier) => ({
      source: this.referencer(join(this.sourceDir, fichier.cheminSource)),
      relatif: fichier.cheminDestination,
    }))
    const installation = await conservation.preparerCopie({
      nom: this.req.nom, cheminCrp: this.req.cheminCrp, dossier: this.temporaire,
      dateCreation: this.apercu.dateCreation, codebook, variables, bilanFichiersId: bilan.bilanId,
    }, this.controleur.signal)
    try { this.verifierAnnulation(); installation.installer() }
    finally { installation.nettoyer() }
    for (const document of documents) this.copies.push({ ...document, signatureCopie: signature(join(this.temporaire, document.relatif)) })
    this.verifierSources()
    this.verifierAnnulation()
    this.prete = true
  }

  lireEntretien(index: number): EntretienSourceMigration | null {
    this.verifierPreparation(index)
    const s = this.entretiens[index].source
    if (!s) return null
    const contenu = readFileSync(s.chemin)
    if (signature(s.chemin) !== s.signature || empreinte(contenu) !== s.empreinte) throw new Error(`La source a changé : ${s.acces}`)
    return { nom: basename(s.chemin), contenu: decoderCrp(contenu) }
  }

  ajouterEntretien(index: number, payload: PayloadEntretien, regles: RegleAnon[]): void {
    this.verifierPreparation(index)
    const e = this.entretiens[index]
    const meta = { ...payload.meta, audioRef: e.audioRef, sourceV1: { rtrPath: e.rtrPath } }
    delete meta.audioDistant
    this.store!.importerEntretien(e.titre, { ...payload, meta }, [], [], regles)
    this.imports++
  }

  private verifierPreparation(index: number): void {
    this.verifierAnnulation()
    if (!this.prete || this.phase !== 'preparation' || index !== this.imports || !this.entretiens[index]) {
      throw new Error('Cet entretien ne correspond pas à la migration en cours.')
    }
  }

  verifierAvantBascule(): void {
    this.verifierAnnulation()
    if (!this.prete || this.imports !== this.entretiens.length || !this.temporaire || !this.store) {
      throw new Error('Le corpus n’est pas entièrement préparé.')
    }
    this.verifierDestination()
    this.verifierSources()
    if (lstatSync(this.temporaire).isSymbolicLink() || identite(this.temporaire) !== this.identiteTemporaire
      || realpathSync(this.temporaire) !== this.temporaire) throw new Error('Le dossier de préparation a changé.')
    for (const c of this.copies) {
      if (signature(join(this.temporaire, c.relatif)) !== c.signatureCopie) throw new Error('Un média copié a changé pendant la préparation.')
    }
    const corpus = this.store.ouvrir()
    if (Object.keys(corpus.membership).length !== this.imports) throw new Error('Le nombre d’entretiens préparés est incohérent.')
    for (const id of Object.keys(corpus.membership)) {
      if (!this.store.lireEntretien(id).ok) throw new Error('Un entretien préparé est illisible.')
    }
  }

  get enBascule(): boolean { return this.phase === 'finalisation' }

  verrouillerBascule(): void { this.phase = 'finalisation' }

  promouvoir(): void {
    this.verifierAvantBascule()
    if (this.phase !== 'finalisation') throw new Error('La bascule n’a pas été autorisée.')
    try {
      if (present(this.dossier)) rmdirSync(this.dossier)
      renameSync(this.temporaire!, this.dossier)
    }
    catch (erreur) { throw erreurLisible(erreur) }
    this.temporaire = null
  }

  marquerOuverte(): void { this.phase = 'ouverte' }

  /** Le lien exclusif évite l'écrasement d'une sauvegarde apparue entre deux contrôles. */
  terminer(): string | null {
    if (this.phase !== 'ouverte') throw new Error('Le corpus SonalPi2 n’a pas encore été ouvert.')
    const sauvegarde = `${this.req.cheminCrp}.sauvegarde-v1`
    let lienCree = false
    const identiteSource = this.sourceCrp.signature.split(':').slice(0, 2).join(':')
    try {
      this.verifierSources()
      linkSync(this.req.cheminCrp, sauvegarde)
      lienCree = true
      if (lstatSync(this.req.cheminCrp).isSymbolicLink() || lstatSync(sauvegarde).isSymbolicLink()
        || identite(this.req.cheminCrp) !== identiteSource || identite(sauvegarde) !== identiteSource
        || empreinte(readFileSync(this.req.cheminCrp)) !== this.sourceCrp.empreinte) throw new Error('La source a changé.')
      unlinkSync(this.req.cheminCrp)
      return null
    } catch {
      if (lienCree) {
        try {
          if (!lstatSync(sauvegarde).isSymbolicLink() && identite(sauvegarde) === identiteSource) unlinkSync(sauvegarde)
        } catch { /* Le contenu d'origine reste conservé. */ }
      }
      return 'Le corpus SonalPi2 est prêt, mais le fichier V1 n’a pas pu être renommé. Il reste ouvrable à son emplacement d’origine.'
    }
  }

  async annuler(): Promise<void> {
    if (this.phase === 'finalisation') return
    this.controleur.abort()
    await this.travail?.catch(() => {})
    await this.nettoyer()
  }

  async nettoyer(): Promise<void> {
    if (!this.temporaire) return
    try {
      if (!present(this.temporaire)) {
        if (identite(dirname(this.temporaire)) !== this.parentInitial) throw new Error('L’emplacement de préparation a changé.')
        this.temporaire = null
        return
      }
      if (lstatSync(this.temporaire).isSymbolicLink() || identite(this.temporaire) !== this.identiteTemporaire
        || realpathSync(this.temporaire) !== this.temporaire) throw new Error('Le dossier temporaire a changé.')
      rmSync(this.temporaire, { recursive: true })
      this.temporaire = null
    } catch {
      throw new Error(`Nettoyage impossible. Vérifiez le dossier de préparation : ${this.temporaire}`)
    }
  }
}
