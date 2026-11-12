import { constants, createWriteStream, existsSync, linkSync, lstatSync, mkdirSync, rmSync } from 'node:fs'
import { lstat, mkdir, mkdtemp, open, readdir, realpath } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { analyserCrp, mapperEntretiensV1, type CrpV1, type DemandeMigration } from '../shared/corpus/migrationCrp'
import { raisonExclusionMigration, type BilanFichiersMigrationLocale, type FichierNonReprisMigration } from '../shared/corpus/conservationMigration'
import { decoderCrp } from './encodage'
import { lireReglagesLexicoV1 } from './migrationLexicoV1'
import { preparerConservationMigration } from './conservationMigration'

export interface InstallationAutresMigration {
  installer(): void
  nettoyer(): void
}

/** Fige le bilan local puis copie les documents sans suivre les liens ni remplacer un fichier. */
export class ConservationMigrationLocale {
  private capture: { cheminCrp: string; destination: string; racine: string; signature: string; bilan: BilanFichiersMigrationLocale } | null = null

  constructor(private readonly referencesSupplementaires: string[] = []) {}

  async preparer(cheminCrp: string, destination: string, signal?: AbortSignal): Promise<BilanFichiersMigrationLocale> {
    this.capture = null
    const racine = await realpath(dirname(cheminCrp))
    const cible = resolve(destination)
    if (await cheminCanonique(cible) === racine) throw new Error('Choisissez un autre dossier : l’ancien dossier SonalPi1 doit rester intact.')
    const crp = basename(cheminCrp), source = join(racine, crp)
    const analyse = analyserCrp(decoderCrp(await lireDocument(source)), crp)
    if (!analyse.ok) throw new Error(analyse.message)
    const signature = (await empreinte(source)).sha256
    const fichiers: string[] = [], nonRepris: FichierNonReprisMigration[] = []
    const parcourir = async (dir: string, parent = ''): Promise<void> => {
      for (const entree of await readdir(dir, { withFileTypes: true })) {
        signal?.throwIfAborted()
        const chemin = parent ? `${parent}/${entree.name}` : entree.name, abs = join(dir, entree.name)
        if (resolve(abs) === cible) continue
        const exclusion = raisonExclusionMigration(chemin)
        if (exclusion) { nonRepris.push({ chemin, raison: exclusion }); continue }
        if (entree.isSymbolicLink()) { nonRepris.push({ chemin, raison: 'Lien vers un autre emplacement, non copié.' }); continue }
        if (entree.isDirectory()) {
          if (existsSync(join(abs, 'corpus.crp'))) nonRepris.push({ chemin, raison: 'Autre corpus SonalPi2, non copié.' })
          else await parcourir(abs, chemin)
        } else if (entree.isFile()) fichiers.push(chemin)
        else nonRepris.push({ chemin, raison: 'Ce fichier ne peut pas être copié comme un document.' })
      }
    }
    await parcourir(racine)
    const references = (chemin: string, corpus: CrpV1) => {
      const parent = join(racine, dirname(chemin))
      const refs = mapperEntretiensV1(corpus.tabEnt).flatMap((e) => [e.rtrPath, e.audioRef].filter((p): p is string => !!p))
      for (const e of corpus.tabEnt ?? []) if (e.imgPath) refs.push(e.imgPath)
      const base = chemin.slice(0, -extname(chemin).length)
      return [...refs.map((ref) => relatif(racine, resolve(parent, ref))), ...['out', 'lem', 'cnct', 'lexaf.json'].map((ext) => `${base}.${ext}`)]
    }
    const utilises = new Set([crp, ...this.referencesSupplementaires.map((p) => relatif(racine, p)), ...mapperEntretiensV1(analyse.apercu.raw.tabEnt)
      .flatMap((e) => [e.rtrPath, e.audioRef].filter((p): p is string => !!p)).map((p) => relatif(racine, resolve(racine, p)))])
    const lexico = lireReglagesLexicoV1(source), base = crp.slice(0, -extname(crp).length)
    for (const ext of lexico.fichiers) if (!lexico.diagnostics.some((d) => d.startsWith(ext))) utilises.add(`${base}${ext}`)
    const conservation = await preparerConservationMigration({ cheminCrp: crp, fichiers, utilises, nonRepris, references,
      lireCorpus: async (p) => {
        const a = analyserCrp(decoderCrp(await lireDocument(join(racine, p))), basename(p))
        return a.ok ? a.apercu.raw : null
      },
      information: async (p) => { await verifierParents(racine, p); return empreinte(join(racine, p), undefined, signal) },
    })
    for (const e of mapperEntretiensV1(analyse.apercu.raw.tabEnt)) {
      if (e.rtrPath && !existsSync(resolve(racine, e.rtrPath))) conservation.avertissements.push(`Transcription introuvable pour « ${e.titre} » : cet entretien sera créé sans texte.`)
      if (e.audioRef && !existsSync(isAbsolute(e.audioRef) ? e.audioRef : resolve(racine, e.audioRef))) conservation.avertissements.push(`Média introuvable pour « ${e.titre} » : son ancien emplacement restera référencé.`)
    }
    conservation.nonRepris.sort((a, b) => a.chemin.localeCompare(b.chemin))
    if (conservation.autres.length && existsSync(join(cible, 'Autres'))) throw new Error('La destination contient déjà un dossier « Autres ». Choisissez un autre dossier ; aucun document ne sera remplacé.')
    const bilan = { ...conservation, bilanId: randomUUID() }
    this.capture = { cheminCrp: resolve(cheminCrp), destination: cible, racine, signature, bilan }
    return structuredClone(bilan)
  }

  async preparerCopie(req: DemandeMigration, signal?: AbortSignal): Promise<InstallationAutresMigration> {
    const capture = this.capture
    if (!capture || capture.bilan.bilanId !== req.bilanFichiersId || capture.cheminCrp !== resolve(req.cheminCrp) || capture.destination !== resolve(req.dossier)) {
      throw new Error('Le bilan des documents a changé. Choisissez de nouveau le dossier de destination.')
    }
    if ((await empreinte(join(capture.racine, basename(req.cheminCrp)))).sha256 !== capture.signature) throw new Error('Le corpus source a changé depuis le bilan. Relisez-le avant de migrer.')
    const actuel = await this.preparer(capture.cheminCrp, capture.destination, signal)
    if (this.capture?.racine !== capture.racine || JSON.stringify({ ...actuel, bilanId: '' }) !== JSON.stringify({ ...capture.bilan, bilanId: '' })) {
      throw new Error('Les documents sources ont changé depuis le bilan. Choisissez de nouveau la destination avant de migrer.')
    }
    this.capture = capture
    if (!capture.bilan.autres.length) return { installer: () => {}, nettoyer: () => {} }
    const destination = capture.destination, autres = join(destination, 'Autres')
    await mkdir(destination, { recursive: true })
    if (await realpath(destination) !== destination) throw new Error('Le dossier de destination ne doit pas être un lien vers un autre emplacement.')
    if (existsSync(autres)) throw new Error('La destination contient déjà un dossier « Autres ». Choisissez un autre dossier ; aucun document ne sera remplacé.')
    const stage = await mkdtemp(join(destination, '.migration-autres-'))
    try {
      for (const fichier of capture.bilan.autres) {
        signal?.throwIfAborted()
        await verifierParents(capture.racine, fichier.cheminSource)
        const cible = join(stage, fichier.cheminDestination.slice('Autres/'.length))
        await mkdir(dirname(cible), { recursive: true })
        const identite = await empreinte(join(capture.racine, fichier.cheminSource), cible, signal)
        if (identite.sha256 !== fichier.sha256 || identite.taille !== fichier.taille) throw new Error(`Le document « ${fichier.cheminSource} » a changé depuis le bilan. Aucun document ne sera remplacé.`)
      }
      return {
        installer: () => {
          try { mkdirSync(autres) } catch {
            throw new Error('Le dossier « Autres » est apparu depuis le bilan ou n’est pas accessible. Aucun document existant n’a été remplacé ; choisissez une autre destination.')
          }
          for (const fichier of capture.bilan.autres) {
            const ref = fichier.cheminDestination.slice('Autres/'.length)
            let parent = autres
            for (const nom of ref.split('/').slice(0, -1)) {
              parent = join(parent, nom)
              if (!existsSync(parent)) mkdirSync(parent)
              if (!lstatSync(parent).isDirectory() || lstatSync(parent).isSymbolicLink()) throw new Error('Un dossier documentaire a changé. La migration est arrêtée.')
            }
            linkSync(join(stage, ref), join(autres, ref))
          }
        },
        nettoyer: () => rmSync(stage, { recursive: true, force: true }),
      }
    } catch (erreur) { rmSync(stage, { recursive: true, force: true }); throw erreur }
  }
}

function relatif(racine: string, chemin: string): string { return relative(racine, chemin).split(sep).join('/') }
async function cheminCanonique(chemin: string): Promise<string> {
  try { return await realpath(chemin) } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    return join(await cheminCanonique(dirname(chemin)), basename(chemin))
  }
}
async function verifierParents(racine: string, chemin: string): Promise<void> {
  let parent = racine
  for (const nom of chemin.split('/').slice(0, -1)) {
    parent = join(parent, nom)
    const st = await lstat(parent)
    if (!st.isDirectory() || st.isSymbolicLink()) throw new Error(`Le dossier de « ${chemin} » a changé. Relisez le bilan.`)
  }
}
async function lireDocument(chemin: string): Promise<Buffer> {
  const fichier = await open(chemin, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const st = await fichier.stat()
    if (!st.isFile()) throw new Error('Le corpus source n’est pas un fichier ordinaire.')
    return await fichier.readFile()
  } finally { await fichier.close() }
}
async function empreinte(chemin: string, copie?: string, signal?: AbortSignal): Promise<{ taille: number; sha256: string }> {
  const fichier = await open(chemin, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const st = await fichier.stat()
    if (!st.isFile()) throw new Error('Le document source n’est pas un fichier ordinaire.')
    const hash = createHash('sha256'); let taille = 0
    const verification = new Transform({ transform(morceau, _enc, fin) { taille += morceau.length; hash.update(morceau); fin(null, morceau) } })
    const lecture = fichier.createReadStream({ autoClose: false, signal })
    if (copie) await pipeline(lecture, verification, createWriteStream(copie, { flags: 'wx', mode: 0o600 }), { signal })
    else for await (const morceau of lecture) { taille += morceau.length; hash.update(morceau) }
    if (taille !== st.size) throw new Error('Le document source a changé pendant sa lecture.')
    return { taille, sha256: hash.digest('hex') }
  } finally { await fichier.close() }
}
