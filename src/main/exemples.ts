import { randomUUID } from 'node:crypto'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { CorpusStore } from './corpusStore'
import { FORMAT_VERSION, type CorpusFichier, type MarqueurDemo } from '../shared/format'
import { CLEFS_SOURCES, EXEMPLES_PAR_PARCOURS, identiteExemple, type EtatExemples, type InstallationExemple, type MemoireExemples, type ResumeTravailExemple, type TravailExemple } from '../shared/exemples'

const FICHIERS_SOURCES = [
  ...CLEFS_SOURCES.flatMap((cle) => [`srt/${cle}.srt`, `audio/${cle}.mp3`]),
  'docs/Guide-entretien-demo.txt',
]
function lireJson<T>(chemin: string): T {
  return JSON.parse(readFileSync(chemin, 'utf8')) as T
}
function canonique(chemin: string): string {
  const absolu = resolve(chemin)
  if (existsSync(absolu)) return realpathSync(absolu)
  const parent = dirname(absolu)
  return parent === absolu ? absolu : join(canonique(parent), basename(absolu))
}
function seRecouvrent(a: string, b: string): boolean {
  const contient = (parent: string, enfant: string) => {
    const rel = relative(parent, enfant)
    return !rel || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))
  }
  return contient(a, b) || contient(b, a)
}

/** Installe les points de départ une seule fois et mémorise les travaux sans les réimporter. */
export class ExemplesLocaux {
  constructor(private readonly deps: {
    ressources: string
    documents: string
    lire: () => MemoireExemples | undefined
    ecrire: (memoire: MemoireExemples) => void
  }) {}

  private memoire(): MemoireExemples {
    const existante = this.deps.lire()
    if (existante && typeof existante.sources === 'string' && Array.isArray(existante.travaux)
      && existante.apprentissages && existante.libres) return structuredClone(existante)
    const memoire: MemoireExemples = {
      sources: join(this.deps.documents, 'Sonal', 'Exemples', 'Sources', 'CorpusSynth'),
      travaux: [], apprentissages: {}, libres: {},
    }
    this.deps.ecrire(memoire)
    return memoire
  }

  reconnaitre(dir: string): { travail: TravailExemple; marqueur: MarqueurDemo } | null {
    try {
      const corpus = lireJson<CorpusFichier>(join(dir, 'corpus.crp'))
      const identite = identiteExemple(corpus.demo)
      if (!identite || !corpus.demo || !Number.isInteger(corpus.formatVersion)
        || corpus.formatVersion < 1 || corpus.formatVersion > FORMAT_VERSION
        || !corpus.membership || typeof corpus.membership !== 'object' || !corpus.codebook) return null
      return {
        travail: {
          id: corpus.demo.id,
          dir: resolve(dir),
          nom: corpus.nom ?? basename(dir),
          ...identite,
          ...(identite.usage === 'apprentissage'
            ? { parcoursApprentissage: corpus.demo.parcoursApprentissage }
            : {}),
        },
        marqueur: corpus.demo,
      }
    } catch { return null }
  }

  rattacher(dir: string, ancienDir?: string): TravailExemple {
    const reconnu = this.reconnaitre(dir)
    if (!reconnu) throw new Error('Ce dossier ne contient pas un corpus exemple reconnu et lisible.')
    const memoire = this.memoire()
    const ancien = memoire.travaux.find((t) => t.dir === (ancienDir ?? resolve(dir)))
    const memeIdentite = memoire.travaux.find((t) => t.id === reconnu.travail.id && t.dir !== reconnu.travail.dir)
    if (memeIdentite && this.reconnaitre(memeIdentite.dir)?.travail.id === reconnu.travail.id) {
      throw new Error('Ce corpus est déjà associé à un autre dossier.')
    }
    if (ancien && (ancien.usage !== reconnu.travail.usage || ancien.exemple !== reconnu.travail.exemple
      || (ancien.parcoursApprentissage && ancien.parcoursApprentissage !== reconnu.travail.parcoursApprentissage)
      || ancien.id !== reconnu.marqueur.id)) {
      throw new Error('Ce dossier ne correspond pas à votre corpus d’exercice. Votre ancien accès est conservé.')
    }
    const travail = reconnu.travail
    if (!memoire.travaux.length) memoire.sources = reconnu.marqueur.racineSources
    memoire.travaux = [...memoire.travaux.filter((t) => t.id !== travail.id && t.dir !== travail.dir), travail]
    if (travail.usage === 'apprentissage' && travail.parcoursApprentissage
      && (!memoire.apprentissages[travail.parcoursApprentissage] || ancienDir)) {
      memoire.apprentissages = { ...memoire.apprentissages, [travail.parcoursApprentissage]: travail.id }
    }
    if (travail.usage === 'libre' && !memoire.libres[travail.exemple]) {
      memoire.libres = { ...memoire.libres, [travail.exemple]: travail.id }
    }
    this.deps.ecrire(memoire)
    return travail
  }

  selectionner(dir: string): void {
    const travail = this.rattacher(dir)
    const memoire = this.memoire()
    if (travail.usage === 'apprentissage' && travail.parcoursApprentissage) {
      memoire.apprentissages = { ...memoire.apprentissages, [travail.parcoursApprentissage]: travail.id }
    } else memoire.libres = { ...memoire.libres, [travail.exemple]: travail.id }
    this.deps.ecrire(memoire)
  }

  estApprentissage(dir: string): boolean {
    const reconnu = this.reconnaitre(dir)
    if (reconnu?.travail.usage !== 'apprentissage') return false
    this.rattacher(dir)
    return true
  }

  sourcesCompletes(dir: string): boolean {
    try { return FICHIERS_SOURCES.every((fichier) => statSync(join(dir, fichier)).isFile()) }
    catch { return false }
  }

  etat(): EtatExemples {
    const memoire = this.memoire()
    return {
      sources: memoire.sources,
      sourcesPresentes: this.sourcesCompletes(memoire.sources),
      emplacementsApprentissage: {
        preparation: join(this.deps.documents, 'Sonal', 'Apprentissage', 'Preparer_et_suivre'),
        traitement: join(this.deps.documents, 'Sonal', 'Apprentissage', 'Importer_et_traiter'),
        analyse: join(this.deps.documents, 'Sonal', 'Apprentissage', 'Analyser_et_interpreter'),
        organisation: join(this.deps.documents, 'Sonal', 'Apprentissage', 'Organiser_et_exporter'),
      },
      emplacementExemples: join(this.deps.documents, 'Sonal', 'Exemples'),
      apprentissages: memoire.apprentissages,
      libres: memoire.libres,
      travaux: memoire.travaux.map((travail): ResumeTravailExemple => {
        const reconnu = this.reconnaitre(travail.dir)
        const meme = reconnu && reconnu.travail.usage === travail.usage && reconnu.travail.exemple === travail.exemple
          && reconnu.travail.parcoursApprentissage === travail.parcoursApprentissage
          && reconnu.marqueur.id === travail.id
        return { ...travail, etat: meme ? 'pret' : existsSync(join(travail.dir, 'corpus.crp')) ? 'illisible' : 'absent',
          ...(meme ? { nom: reconnu.travail.nom, marqueur: reconnu.marqueur } : {}) }
      }),
    }
  }

  textesSources(): Array<{ cle: string; contenu: string }> {
    return CLEFS_SOURCES.map((cle) => ({ cle, contenu: readFileSync(join(this.deps.ressources, 'CorpusSynth', 'srt', `${cle}.srt`), 'utf8') }))
  }

  private verifierDestination(dir: string): void {
    if (!isAbsolute(dir)) throw new Error('Choisissez un dossier avec son emplacement complet.')
    const cible = canonique(dir)
    const memoire = this.memoire()
    const reserves = [this.deps.ressources, memoire.sources, ...memoire.travaux.map((t) => t.dir)]
    if (reserves.some((reserve) => seRecouvrent(cible, canonique(reserve)))) {
      throw new Error('Ce dossier est déjà utilisé pour un corpus ou ses fichiers d’exercice. Choisissez un autre emplacement.')
    }
    if (existsSync(dir) && readdirSync(dir).length > 0) {
      throw new Error('Ce dossier contient déjà des fichiers. Choisissez un dossier vide pour ne rien remplacer.')
    }
  }

  restaurerSources(): void {
    const memoire = this.memoire()
    const sources = memoire.sources
    const racine = canonique(sources)
    if (!isAbsolute(sources) || existsSync(join(sources, 'corpus.crp'))
      || seRecouvrent(racine, canonique(this.deps.ressources))
      || memoire.travaux.some((t) => seRecouvrent(racine, canonique(t.dir)))) {
      throw new Error('Le dossier des fichiers d’exercice doit être distinct des corpus de travail et des exemples fournis.')
    }
    for (const fichier of FICHIERS_SOURCES) {
      const cible = join(sources, fichier)
      const rel = relative(racine, canonique(cible))
      if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)
        || (existsSync(cible) && !statSync(cible).isFile())) {
        throw new Error('Un fichier d’exercice ne peut pas être restauré dans ce dossier. Choisissez un emplacement distinct de vos travaux.')
      }
    }
    for (const fichier of FICHIERS_SOURCES) {
      const cible = join(sources, fichier)
      if (existsSync(cible)) continue
      mkdirSync(dirname(cible), { recursive: true })
      copyFileSync(join(this.deps.ressources, 'CorpusSynth', fichier), cible)
    }
  }

  /** Prépare hors de la destination ; la publication attend la fermeture du corpus courant. */
  preparerInstallation(dir: string, nom: string, demande: InstallationExemple): { publier: () => CorpusStore; nettoyer: () => void } {
    const parcours = demande.parcoursApprentissage
    if (!['synth', 'synth-annote'].includes(demande.exemple) || !['apprentissage', 'libre'].includes(demande.usage)
      || (demande.usage === 'apprentissage' && (!parcours
        || demande.exemple !== EXEMPLES_PAR_PARCOURS[parcours]))
      || (demande.usage === 'libre' && (parcours || demande.recommencer))) {
      throw new Error('Cet exemple ne peut pas être préparé pour cet usage.')
    }
    const remplace = demande.recommencer ? this.reconnaitre(dir) : null
    if (demande.recommencer && (!remplace || remplace.travail.usage !== 'apprentissage'
      || remplace.travail.parcoursApprentissage !== parcours)) {
      throw new Error('Cette démo ne peut pas être recommencée dans ce dossier.')
    }
    if (!demande.recommencer) this.verifierDestination(dir)
    const temporaire = mkdtempSync(join(tmpdir(), 'sonal-exemple-'))
    const stage = join(temporaire, 'corpus')
    const nettoyer = () => rmSync(temporaire, { recursive: true, force: true })
    try {
      const sources = this.memoire().sources
      const marqueur: MarqueurDemo = {
        id: remplace?.marqueur.id ?? randomUUID(),
        exemple: demande.exemple,
        usage: demande.usage,
        racineSources: sources,
        ...(parcours ? { parcoursApprentissage: parcours, dernierParcoursId: parcours } : {}),
        parcours: parcours ? { [parcours]: { validees: [] } } : {},
      }
      if (demande.exemple === 'synth-annote') {
        mkdirSync(stage, { recursive: true })
        for (const fichier of ['corpus.crp', 'entretiens', 'png']) {
          cpSync(join(this.deps.ressources, 'CorpusSynthAnnot', fichier), join(stage, fichier), { recursive: true })
        }
        const corpus = lireJson<CorpusFichier>(join(stage, 'corpus.crp'))
        for (const id of Object.keys(corpus.membership)) {
          const chemin = join(stage, 'entretiens', `${id}.json`)
          const entretien = lireJson<{ meta: { audioRef: string | null } }>(chemin)
          const fichier = entretien.meta.audioRef?.replace(/\\/g, '/').split('/').at(-1)
          if (!fichier || !CLEFS_SOURCES.some((cle) => `${cle}.mp3` === fichier)) throw new Error('Un audio du corpus annoté ne peut pas être retrouvé.')
          entretien.meta.audioRef = join(sources, 'audio', fichier)
          writeFileSync(chemin, JSON.stringify(entretien, null, 2))
        }
      }
      const store = new CorpusStore(stage)
      store.ouvrir()
      store.poserNom(nom.trim() || (demande.exemple === 'synth-annote'
        ? 'Corpus annoté'
        : parcours === 'preparation' ? 'Préparer et suivre' : 'Importer et traiter'))
      if (parcours === 'traitement') store.ajouterVariable('Ville', 'locuteur')
      if (demande.exemple === 'synth' && demande.usage === 'libre') {
        if (!demande.entretiens || demande.entretiens.length !== CLEFS_SOURCES.length
          || !CLEFS_SOURCES.every((cle) => demande.entretiens!.filter((e) => e.cle === cle).length === 1)) {
          throw new Error('Les quatre entretiens doivent être préparés avant de créer cet exemple.')
        }
        for (const entretien of demande.entretiens) {
          store.importerEntretien(entretien.cle,
            { ...entretien.payload, meta: { ...entretien.payload.meta, audioRef: join(sources, 'audio', `${entretien.cle}.mp3`) } },
            entretien.codebook, entretien.variables)
        }
      }
      store.marquerDemo(marqueur)
      return {
        nettoyer,
        publier: () => {
          if (!demande.recommencer) {
            this.verifierDestination(dir)
            this.restaurerSources()
            this.verifierDestination(dir)
            cpSync(stage, dir, { recursive: true, force: false, errorOnExist: true })
            return new CorpusStore(dir)
          }
          this.restaurerSources()
          const actuel = this.reconnaitre(dir)
          if (!actuel || actuel.marqueur.id !== remplace?.marqueur.id
            || actuel.travail.parcoursApprentissage !== parcours) {
            throw new Error('La démo a changé avant sa remise à zéro.')
          }
          const sauvegarde = join(dirname(dir), `.${basename(dir)}-avant-reinitialisation-${randomUUID()}`)
          renameSync(dir, sauvegarde)
          try {
            cpSync(stage, dir, { recursive: true, force: false, errorOnExist: true })
            rmSync(sauvegarde, { recursive: true, force: true })
          } catch (erreur) {
            rmSync(dir, { recursive: true, force: true })
            renameSync(sauvegarde, dir)
            throw erreur
          }
          return new CorpusStore(dir)
        },
      }
    } catch (erreur) { nettoyer(); throw erreur }
  }
}
