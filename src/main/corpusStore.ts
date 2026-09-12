import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  copyFileSync,
  readdirSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { join, extname, basename, normalize, isAbsolute, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import * as corpusModel from '../shared/corpus'
import type { ScanRegle } from '../shared/corpus/scanAnon'
import { annulerRefusRapprochement, natureNomPersonne, peutCreerPersonneAuNommage, refuserRapprochement, reprendreDonneesLocuteur } from '../shared/corpus/rapprochementsPersonnes'
import { fusionnerPersonnes, inventorierPersonnes, creerPersonne, modifierPersonne, trouverLocuteur, lierLocuteur, separerPersonne, supprimerPersonneVide, type InventairePersonnes, type CommandePersonnes } from '../shared/corpus/personnes'
import {
  etatNoteJournal,
  inventorierNotes,
  memeEtatNote,
  memesChampsEditables,
  trouverNote,
  type CommandeNotes,
  type InventaireNotes,
} from '../shared/corpus/notes'
import type { EntreeJournalCorpusVue, ImpactJournalCorpus, ResultatAnnulationCorpus } from '../shared/corpus/journal'
import { instructionsAppliquerRegle, poserDansPlages, appliquerDiffAnon } from '../shared/entretien/anon'
import { migrerEntretienFormatV1 } from '../shared/entretien/migration'
import { squeletteCorpus } from '../shared/corpus/squelette'
import { appliquerCommandeRecueils, normaliserRecueils, type CommandeRecueils } from '../shared/corpus/recueils'
import { normaliserReperesPassages, rendreReperesOrphelins } from '../shared/entretien/reperesPassages'
import {
  TransactionsFichiersCorpus,
  type PlanAjoutEntretien,
  type PlanSuppressionEntretien,
  type PlanTransactionFichiers,
} from './transactionsFichiers'
import {
  JournalCorpus,
  type EtatInverseJournalCorpus,
  type EtatLienJournalCorpus,
  type EtatRefusJournalCorpus,
  type InverseJournalCorpus,
} from './journalCorpus'

/** Pourquoi des numéros de version ?
 *  Chaque évolution du format de fichier est migrée EXPLICITEMENT à la lecture.
 *  Le fichier est ensuite réécrit aussitôt, sans jamais lire une version inconnue
 *  partiellement.
 *  - formatVersion 1 → 2 : les timecodes quittent les attributs de bloc (`deb`/`fin`),
 *    pour devenir des ancres `{pos, t}` positionnées dans le texte.
 *  - formatVersion 2 → 3 : `meta.audioRef` devient un chemin ABSOLU uniquement,
 *    l'audio est référencé, plus copié ; les PNG d'onde passent de `audio/` à `png/`.
 *  - formatVersion 3 → 4 : recueils partagés et repères autonomes de passages.
 *  Voir shared/entretien/migration.ts pour la mécanique de migration.
 */

import {
  FORMAT_VERSION,
  versionSupportee,
  type Categorie,
  type CibleValeur,
  type CorpusFichier,
  type EntretienFichier,
  type LectureEntretien,
  type Locuteur,
  type MarqueurDemo,
  type MatriceCorpus,
  type PatchCategorie,
  type PayloadEntretien,
  type ResultatSuppression,
  type ResultatSuppressionCategorie,
  type SegmentThematique,
  type SourceV1,
  type RegleAnon,
  type Variable,
  type ParamsAnon,
  type Note,
  type NoteCategory,
  paramsAnonDefaut,
  CORPUS_SUPPRIME,
} from '../shared/format'
import {
  normaliserCategoriesNote,
  normaliserNotes,
  notesParRang,
  renumeroterRangs,
  genIdCategorieNote,
  compterUsagesCategorieNote,
} from '../shared/entretien/notes'

/** Un entretien vide est un document ProseMirror minimal (paragraphe vide).
 *  Il sert aussi quand l'utilisateur télécharge seulement un audio,
 *  qu'il transcrit ensuite manuellement. */
const DOC_VIDE = { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: null } }] }


/** Génère un id unique pour un entretien, une variable, une modalité ou une catégorie.
 *  Le préfixe indique le type (ent/var/mod/cat) ;
 *  le reste est aléatoire et opaque (jamais séquentiel),
 *  pour éviter les conflits lors des fusions. */
function genId(prefixe: string): string {
  return prefixe + '-' + Math.random().toString(36).slice(2, 10)
}

/** Identifiant d'entretien : `<slug du titre>_<code aléatoire>`.
 *  Le slug rend le dossier `entretiens/` lisible (« on retrouve le nom SRT/audio d'origine »).
 *  Le code aléatoire préserve l'unicité (et la future synchro multi-utilisateur).
 *  Le titre (nom de fichier SRT ou audio, sans extension) est assaini,
 *  sans jamais laisser de séparateur de chemin résiduel : pas de traversée possible.
 *  L'id mène toujours à `<id>.json`. */
function genIdEntretien(titre: string): string {
  const code = Math.random().toString(36).slice(2, 10)
  const slug =
    (titre || 'entretien')
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 60) || 'entretien'
  return `${slug}_${code}`
}

/** Produit la même identité sur deux postes partis du même ancien entretien. */
function idLocuteurHistorique(entretienId: string, index: number): string {
  const empreinte = createHash('sha256')
    .update(`${entretienId}\0${index}`)
    .digest('base64url')
  return `loc-${empreinte}`
}

/** Complète les anciens locuteurs sans modifier leur index. */
export function completerIdsLocuteurs(
  entretienId: string,
  locuteurs: Locuteur[],
  existants: Locuteur[] = [],
): Locuteur[] {
  const idsParIndex = new Map(
    existants
      .filter((locuteur): locuteur is Locuteur & { id: string } => Boolean(locuteur.id))
      .map((locuteur) => [locuteur.index, locuteur.id] as const),
  )
  return locuteurs.map((locuteur) => {
    if (locuteur.id) return locuteur
    const id = idsParIndex.get(locuteur.index)
      ?? idLocuteurHistorique(entretienId, locuteur.index)
    return { ...locuteur, id }
  })
}

/** Normalise un chemin audio reçu d'un dialogue (assignerAudio).
 *  Certains dialogs Linux renvoient `file://`, d'où `fileURLToPath` ;
 *  `path.normalize` rend la comparaison des chemins fiable.
 *  Le résultat est toujours un chemin absolu natif et normalisé. */
export function normaliserCheminAudio(source: string): string {
  let p = source
  if (p.startsWith('file:')) p = fileURLToPath(p)
  return normalize(p)
}

interface EntretienV2Prepare {
  readonly fichier: string
  readonly contenuInitial: string
  readonly data: EntretienFichier
}

interface DeplacementPngPrepare {
  readonly source: string
  readonly destination: string
  readonly contenuSourceInitial: Buffer
}

/** Résultat d'une préparation en mémoire, sans modification de la cible. */
export interface PreparationOuvertureCorpus {
  readonly corpus: CorpusFichier
  readonly nouveau: boolean
  readonly contenuCorpusInitial: string | null
  readonly versionInitiale: number | null
  readonly entretiensV2: EntretienV2Prepare[]
  readonly deplacementsPng: DeplacementPngPrepare[]
}

/** Les RÈGLES du corpus vivent dans `shared/corpus/` (pures) ;
 *  ICI on ne fait que lire → appliquer → écrire.
 *  Cette classe est le point d'entrée de toutes les opérations sur le corpus,
 *  au sens CRUD (codebook, variables, modalités, entretiens, audio). */
export class CorpusStore {

  /** L'attribut dir contient le chemin vers le répertoire du corpus */
  private readonly dir: string

  private readonly transactionsFichiers: TransactionsFichiersCorpus

  private readonly journalCorpus = new JournalCorpus()

  /** Cache en mémoire des chemins audio référencés du corpus courant,
   *  id → audioRef absolu.
   *  Évite de relire les fichiers entretiens à chaque requête média ;
   *  invalidé à chaque mutation, recalculé paresseusement. */
  private cacheRefsAudio: Map<string, string> | null = null

  /** Ids des sauvegardes à faire : un entretien ouvert est en session.
   *  Rempli à la lecture, vidé au 1er write suivant (.bak avec rotation 1→2).
   *  Le Set garantit l'unicité des ids. */
  private readonly rotationEnAttente = new Set<string>()

  /** Garde corpus distant : quand le store pointe un miroir sans couche verrou/publication active, toute écriture est refusée,
   *  sinon deux postes divergeraient silencieusement.
   *  Défense en profondeur : l'UI grise déjà les gestes, ici on garantit le reste.
   *  Les dérivés locaux purs (PNG waveform) restent permis. */
  lectureSeule = false

  /** Amorçage encore permis pour CE store ? Vrai à la création (le dossier vient d'être choisi explicitement, neuf ou vide),
   *  puis faux dès qu'un corpus existe.
   *  Si `corpus.json` disparaît ensuite (dossier supprimé à l'extérieur de l'app), `ouvrir()` lève CORPUS_SUPPRIME au lieu de recréer un corpus fantôme en silence. */
  private amortissable = true

  private verifierEcriture(): void {
    if (this.lectureSeule) {
      throw new Error(
        'Corpus distant ouvert en lecture seule : la modification partagée sous verrou arrive avec la prochaine étape.',
      )
    }
  }

  /** Exception PAR ENTRETIEN : quand le corpus distant est en lecture seule (les définitions partagées restent bloquées),
   *  le contenu des entretiens DONT NOUS TENONS le verrou reste écrivable.
   *  La couche session pose/retire l'id ici, à l'acquisition/libération. */
  private readonly ecrituresAutorisees = new Set<string>()

  autoriserEcritureEntretien(id: string): void {
    this.ecrituresAutorisees.add(id)
  }

  revoquerEcritureEntretien(id: string): void {
    this.ecrituresAutorisees.delete(id)
  }

  private verifierEcritureEntretien(id: string): void {
    if (!this.lectureSeule) return // corpus local : tout est permis
    if (this.ecrituresAutorisees.has(id)) return // notre verrou tient
    throw new Error(
      `Entretien non modifiable : le verrou n'est pas tenu par cette session${this.ecrituresAutorisees.size ? '' : ''}.`,
    )
  }

  /** Instanciation de la classe CorpusStore avec le chemin du répertoire du corpus */
  constructor(dir: string) {
    this.dir = dir
    this.transactionsFichiers = new TransactionsFichiersCorpus(dir)
  }

  /** Exemple : dir = "/home/user/projets/mon_corpus",
    *  corpusFile → "/home/user/projets/mon_corpus/corpus.json". */
  private get corpusFile() {
    return join(this.dir, 'corpus.json')
  }

  /** Dossier des entretiens : `<corpus>/entretiens/` */
  private get entretiensDir() {
    return join(this.dir, 'entretiens')
  }

  /** Fichier d'un entretien : `<entretiens>/id.json` */
  private entretienFile(id: string) {
    return join(this.entretiensDir, `${id}.json`)
  }

  /** Dossier des dérivés PNG (waveform) : `<corpus>/png/` (v3 ; ex-`audio/`). */
  private get pngDir() {
    return join(this.dir, 'png')
  }

  /** Ancien dossier audio (formatVersion 2) : reliquat pour les corpus migrés.
   *  Les mp3 legacy y sont référencés en absolu vers leur emplacement existant ;
   *  les nouveaux corpus v3 n'ont pas de dossier `audio/`. */
  private get audioDirLegacy() {
    return join(this.dir, 'audio')
  }

  private ecrireJsonAtomique(fichier: string, obj: unknown): void {
    const tmp = fichier + '.tmp'
    writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8')
    renameSync(tmp, fichier) // rename atomique : un crash laisse l'ancien fichier intact
  }

  private verifierDossiersOuverture(): void {
    for (const [chemin, role] of [
      [this.dir, 'cible'],
      [this.entretiensDir, 'entretiens'],
      [this.pngDir, 'formes d’onde'],
    ] as const) {
      if (existsSync(chemin) && !statSync(chemin).isDirectory()) {
        throw new Error(`Le chemin ${role} n'est pas un dossier.`)
      }
    }
  }

  /** Prépare l'ouverture en mémoire sans créer de dossier ni modifier la cible. */
  preparerOuverture(nomNouveau?: string): PreparationOuvertureCorpus {
    this.verifierDossiersOuverture()

    if (!existsSync(this.corpusFile)) {
      if (!this.amortissable) {
        throw new Error(
          `${CORPUS_SUPPRIME}: le dossier du corpus courant a été supprimé sur disque.`,
        )
      }
      const corpus = squeletteCorpus()
      if (nomNouveau?.trim()) corpus.nom = nomNouveau.trim()
      return {
        corpus,
        nouveau: true,
        contenuCorpusInitial: null,
        versionInitiale: null,
        entretiensV2: [],
        deplacementsPng: [],
      }
    }

    const contenuCorpusInitial = readFileSync(this.corpusFile, 'utf8')
    const corpus = JSON.parse(contenuCorpusInitial) as CorpusFichier
    corpus.personnes ??= {}
    const versionInitiale = corpus.formatVersion as number
    if (versionInitiale >= 1 && versionInitiale <= 3) {
      corpus.recueils = normaliserRecueils(corpus.recueils)
    }
    const entretiensV2: EntretienV2Prepare[] = []
    const deplacementsPng: DeplacementPngPrepare[] = []

    if (versionInitiale === 1) {
      corpus.formatVersion = FORMAT_VERSION
    } else if (versionInitiale === 2 || versionInitiale === 3) {
      for (const id of Object.keys(corpus.membership)) {
        const fichier = this.entretienFile(id)
        if (!existsSync(fichier)) continue
        const contenuInitial = readFileSync(fichier, 'utf8')
        const data = JSON.parse(contenuInitial) as EntretienFichier
        if ((data.formatVersion as number) === 2) {
          const ref = data.meta?.audioRef
          if (typeof ref === 'string' && ref && !isAbsolute(ref)) {
            data.meta.audioRef = resolve(this.dir, ref)
          }
        } else if ((data.formatVersion as number) !== 3) {
          continue
        }
        data.reperesPassages = normaliserReperesPassages(data.reperesPassages)
        data.formatVersion = FORMAT_VERSION
        entretiensV2.push({ fichier, contenuInitial, data })
      }
      if (versionInitiale === 2 && existsSync(this.audioDirLegacy)) {
        for (const nom of readdirSync(this.audioDirLegacy)) {
          if (extname(nom).slice(1).toLowerCase() !== 'png') continue
          const source = join(this.audioDirLegacy, nom)
          const destination = join(this.pngDir, nom)
          if (!existsSync(destination)) {
            deplacementsPng.push({
              source,
              destination,
              contenuSourceInitial: readFileSync(source),
            })
          }
        }
      }
      corpus.formatVersion = FORMAT_VERSION
    }

    if (!versionSupportee(corpus.formatVersion)) {
      throw new Error(`Version de corpus non supportée : ${corpus.formatVersion}`)
    }
    return {
      corpus,
      nouveau: false,
      contenuCorpusInitial,
      versionInitiale,
      entretiensV2,
      deplacementsPng,
    }
  }

  /** Applique une préparation après avoir vérifié que la cible n'a pas changé. */
  finaliserOuverture(preparation: PreparationOuvertureCorpus): CorpusFichier {
    this.verifierDossiersOuverture()
    let cible = preparation
    if (this.transactionsFichiers.reprendre()) cible = this.preparerOuverture()
    const contenuActuel = existsSync(this.corpusFile)
      ? readFileSync(this.corpusFile, 'utf8')
      : null
    if (contenuActuel !== cible.contenuCorpusInitial) {
      throw new Error('Le corpus cible a changé pendant la préparation de son ouverture.')
    }
    for (const entretien of cible.entretiensV2) {
      if (!existsSync(entretien.fichier)
        || readFileSync(entretien.fichier, 'utf8') !== entretien.contenuInitial) {
        throw new Error('Un entretien cible a changé pendant la préparation de son ouverture.')
      }
    }
    for (const deplacement of cible.deplacementsPng) {
      if (!existsSync(deplacement.source)
        || existsSync(deplacement.destination)
        || !readFileSync(deplacement.source).equals(deplacement.contenuSourceInitial)) {
        throw new Error('Une forme d’onde cible a changé pendant la préparation de son ouverture.')
      }
    }

    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true })
    if (!existsSync(this.entretiensDir)) mkdirSync(this.entretiensDir, { recursive: true })

    if (cible.versionInitiale === 2 && cible.deplacementsPng.length) {
      if (!existsSync(this.pngDir)) mkdirSync(this.pngDir, { recursive: true })
      for (const deplacement of cible.deplacementsPng) {
        renameSync(deplacement.source, deplacement.destination)
      }
    }
    for (const entretien of cible.entretiensV2) {
      this.ecrireJsonAtomique(entretien.fichier, entretien.data)
    }
    if (cible.nouveau || cible.versionInitiale === 1
      || cible.versionInitiale === 2 || cible.versionInitiale === 3) {
      this.ecrireJsonAtomique(this.corpusFile, cible.corpus)
      this.invaliderRefsAudio()
    }

    this.amortissable = false
    return cible.corpus
  }

  /** Ouvre ou amorce le corpus en conservant le comportement historique. */
  ouvrir(): CorpusFichier {
    return this.finaliserOuverture(this.preparerOuverture())
  }

  /** Pose (ou remplace) le `nom` de PROJET du corpus et persiste.
   *  Le nom est indépendant du dossier (il survit au renommage du dossier) ;
   *  les consommateurs l'affichent en priorité, avec repli sur le basename du
   *  dossier quand il est absent (corpus anciens sans nom). */
  poserNom(nom: string): CorpusFichier {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    corpus.nom = nom
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return corpus
  }

  /** Marque le corpus courant comme corpus de TEST (démo) : `corpus.json:
   *  { demo: { mode, racineSources, validees } }`.
   *  Champ ADDITIF optionnel, donc pas de bump de version ;
   *  un corpus normal n'a pas de marqueur, la démo n'y touche jamais.
   *  Posé par le builder à la création, mis à jour à chaque étape validée,
   *  l'historique du pas-à-pas voyageant avec le corpus. */
  marquerDemo(marqueur: MarqueurDemo): CorpusFichier {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    corpus.demo = marqueur
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return corpus
  }

  /** Applique une édition ciblée de recueil après relecture du corpus courant. */
  recueilsCommander(commande: CommandeRecueils): CorpusFichier {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    corpus.recueils = appliquerCommandeRecueils(corpus.recueils, commande, {
      maintenant: () => new Date().toISOString(),
    })
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return corpus
  }

  /** Vérifie qu'un repère a bien été enregistré avant de partager sa référence. */
  reperePassageExiste(entretienId: string, repereId: string): boolean {
    const corpus = this.ouvrir()
    if (!corpus.membership[entretienId]) return false
    const lecture = this.lireEntretien(entretienId)
    return lecture.ok
      && (lecture.data.reperesPassages ?? []).some((repere) => repere.id === repereId)
  }

  /** Prépare un corpus SonalPi2 dans un dossier dédié, à partir d'une migration SonalPi1.
   *  Contrairement à un corpus neuf, on n'ajoute pas le bloc « Pondérations ».
   *  La source de vérité des définitions est le `.crp`, on fusionne exactement ce que la lecture a mappé.
   *  Le dossier a déjà été vérifié par la garde (`migrer:verifierDossier`).
   *  En défense en profondeur, on REFUSE ici tout corpus.json existant, on n'écrase jamais.
   *  La lecture des entretiens (.Sonal + audio) se branche après la finalisation. */
  preparerMigrationDepuisV1(
    nom: string,
    sourceV1: SourceV1,
    codebook: Categorie[],
    variables: Variable[],
    reglesAnonV1?: RegleAnon[],
    paramsAnon?: ParamsAnon,
  ): PreparationOuvertureCorpus {
    this.verifierDossiersOuverture()
    if (existsSync(this.corpusFile)) {
      throw new Error('Le dossier contient déjà un corpus — la garde a été contournée.')
    }
    const corpus: CorpusFichier = {
      formatVersion: FORMAT_VERSION,
      codebook: {},
      variables: {},
      reglesAnon: {},
      personnes: {},
      membership: {},
      recueils: {},
      nom,
      meta: { sourceV1 },
    }
    corpusModel.fusionnerImport(corpus, codebook, variables)
    for (const r of reglesAnonV1 ?? []) {
      if (!corpus.reglesAnon[r.id]) corpus.reglesAnon[r.id] = r
    }
    if (paramsAnon) corpus.paramsAnon = paramsAnon
    return {
      corpus,
      nouveau: true,
      contenuCorpusInitial: null,
      versionInitiale: null,
      entretiensV2: [],
      deplacementsPng: [],
    }
  }

  migrerDepuisV1(
    nom: string,
    sourceV1: SourceV1,
    codebook: Categorie[],
    variables: Variable[],
    reglesAnonV1?: RegleAnon[],
    paramsAnon?: ParamsAnon,
  ): CorpusFichier {
    const preparation = this.preparerMigrationDepuisV1(
      nom,
      sourceV1,
      codebook,
      variables,
      reglesAnonV1,
      paramsAnon,
    )
    return this.finaliserOuverture(preparation)
  }

  /** Lit un entretien sans modifier le disque ni l'état des sauvegardes.
   *  Les anciens formats supportés sont adaptés en mémoire ; ils seront
   *  persistés seulement lors d'une véritable édition. */
  lireEntretien(id: string): LectureEntretien {
    const fichier = this.entretienFile(id)
    if (!existsSync(fichier)) return { ok: false, raison: 'absent' }

    let data = JSON.parse(readFileSync(fichier, 'utf8')) as EntretienFichier
    if ((data.formatVersion as number) === 1) {
      data = migrerEntretienFormatV1(
        data as unknown as Record<string, unknown>,
      ) as unknown as EntretienFichier
    }
    if ((data.formatVersion as number) === 2) {
      const ref = data.meta?.audioRef
      if (typeof ref === 'string' && ref && !isAbsolute(ref)) {
        data.meta.audioRef = resolve(this.dir, ref)
      }
      data.formatVersion = FORMAT_VERSION
    }
    if ((data.formatVersion as number) === 3) data.formatVersion = FORMAT_VERSION
    if (!versionSupportee(data.formatVersion)) return { ok: false, raison: 'version' }
    data.reperesPassages = normaliserReperesPassages(data.reperesPassages)
    return { ok: true, data }
  }

  /** Ouvre explicitement une session d'édition locale.
   *  La première écriture qui suit conservera l'état antérieur dans `.bak1`. */
  ouvrirEntretienPourEdition(id: string): LectureEntretien {
    const lecture = this.lireEntretien(id)
    if (lecture.ok) {
      lecture.data.locuteurs = completerIdsLocuteurs(id, lecture.data.locuteurs)
      this.rotationEnAttente.add(id)
    }
    return lecture
  }

  /** Écrit un entretien (atomique + rotation `.bak` si 1re écriture de session)
   *  et met à jour le lastModified du membership.
   *  Les données à écrire viennent de la classe PayloadEntretien (shared/format.ts). */
  ecrireEntretien(id: string, payload: PayloadEntretien): string {
    this.verifierEcritureEntretien(id)
    if (!existsSync(this.entretiensDir)) mkdirSync(this.entretiensDir, { recursive: true })
    const now = new Date().toISOString()
    const fichier: EntretienFichier = {
      formatVersion: FORMAT_VERSION,
      lastModified: now,
      ...payload,
      reperesPassages: normaliserReperesPassages(payload.reperesPassages),
    }

    if (this.rotationEnAttente.has(id)) {
      this.tournerBak(id)
      this.rotationEnAttente.delete(id)
    }
    this.ecrireJsonAtomique(this.entretienFile(id), fichier)

    // Le renderer peut round-triper un `audioRef` modifié ; on invalide le cache.
    // Sécurité : l'invariant « muté uniquement via assignerAudio » est visé.
    this.invaliderRefsAudio()

    // Le membership n'est PAS réécrit ici.
    // En distant, écrire corpus.json à chaque autosave imposerait de prendre aussi le verrou corpus à chaque fermeture d'entretien.
    // Il n'est écrit que par création, import, renommage ou suppression.
    // Le `lastModified` affiché est dérivé du fichier entretien lui-même.
    return now
  }

  /** Remplace la transcription en préservant les métadonnées et notes de la
   *  version fraîche actuellement stockée. */
  remplacerTranscription(
    id: string,
    transcription: Pick<
      PayloadEntretien,
      'corpsTexte' | 'annotations' | 'ancres' | 'locuteurs'
    >,
  ): string | null {
    this.verifierEcritureEntretien(id)
    const lecture = this.lireEntretien(id)
    if (!lecture.ok) return null
    const data = lecture.data
    return this.ecrireEntretien(id, {
      corpsTexte: transcription.corpsTexte,
      annotations: transcription.annotations,
      ancres: transcription.ancres,
      locuteurs: completerIdsLocuteurs(id, transcription.locuteurs, data.locuteurs),
      meta: data.meta,
      notes: data.notes,
      reperesPassages: rendreReperesOrphelins(data.reperesPassages),
      brouillonsAnon: data.brouillonsAnon,
      pseudosDeclares: data.pseudosDeclares,
      legacy: data.legacy,
    })
  }

  /** `.bak1` → `.bak2`, puis copie de l'état courant → `.bak1`.
   *  Une génération par session : les `.bak` capturent l'état d'AVANT les sessions précédentes, pas les derniers autosaves. */
  private tournerBak(id: string): void {
    const f = this.entretienFile(id)
    const b1 = f + '.bak1'
    const b2 = f + '.bak2'
    if (existsSync(b1)) renameSync(b1, b2)
    if (existsSync(f)) copyFileSync(f, b1)
  }


  /** Prépare sans écriture la création d'un entretien vide. */
  preparerCreationEntretienVide(titre: string): PlanAjoutEntretien {
    const corpusAvant = this.ouvrir()
    const corpusApres = structuredClone(corpusAvant)
    const id = genIdEntretien(titre)
    const now = new Date().toISOString()
    const entretien: EntretienFichier = {
      formatVersion: FORMAT_VERSION,
      lastModified: now,
      corpsTexte: DOC_VIDE,
      annotations: [],
      ancres: [],
      locuteurs: [],
      brouillonsAnon: [],
      reperesPassages: [],
      meta: { valeursGen: {}, audioRef: null },
    }
    corpusApres.membership[id] = { titre, date: null, lastModified: now }
    return { operation: 'ajout', id, corpusAvant, corpusApres, entretien }
  }

  /** Crée un entretien vide dans une transaction locale reprise au prochain démarrage. */
  creerEntretienVide(titre: string): { id: string; corpus: CorpusFichier } {
    this.verifierEcriture()
    const plan = this.preparerCreationEntretienVide(titre)
    this.appliquerTransactionFichiers(plan)
    return { id: plan.id, corpus: plan.corpusApres }
  }

  /** Prépare un import et la fusion de ses définitions sans modifier le disque. */
  preparerImportEntretien(
    titre: string,
    payload: PayloadEntretien,
    codebook: Categorie[] = [],
    variables: Variable[] = [],
    reglesAnon: RegleAnon[] = [],
  ): PlanAjoutEntretien {
    const corpusAvant = this.ouvrir()
    const corpusApres = structuredClone(corpusAvant)
    const id = genIdEntretien(titre)
    const now = new Date().toISOString()
    const entretien: EntretienFichier = {
      formatVersion: FORMAT_VERSION,
      lastModified: now,
      ...payload,
      reperesPassages: normaliserReperesPassages(payload.reperesPassages),
      locuteurs: completerIdsLocuteurs(id, payload.locuteurs),
    }
    corpusModel.fusionnerImport(corpusApres, codebook, variables)
    corpusModel.fusionnerReglesAnon(corpusApres, reglesAnon)
    corpusApres.membership[id] = { titre, date: null, lastModified: now }
    return { operation: 'ajout', id, corpusAvant, corpusApres, entretien }
  }

  /** Le parsing du fichier se fait dans sas.ts (importerFichier) ;
   *  ici, on crée l'entretien et fusionne ses métadonnées sous transaction. */
  importerEntretien(
    titre: string,
    payload: PayloadEntretien,
    codebook: Categorie[] = [],
    variables: Variable[] = [],
    reglesAnon: RegleAnon[] = [],
  ): { id: string; corpus: CorpusFichier } {
    this.verifierEcriture()
    const plan = this.preparerImportEntretien(titre, payload, codebook, variables, reglesAnon)
    this.appliquerTransactionFichiers(plan)
    return { id: plan.id, corpus: plan.corpusApres }
  }

  renommerEntretien(id: string, titre: string): CorpusFichier {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    if (corpus.membership[id]) {
      corpus.membership[id].titre = titre
      this.ecrireJsonAtomique(this.corpusFile, corpus)
    }
    return corpus
  }

  /** Prépare le retrait du membership et l'archivage des fichiers sans écriture. */
  preparerSuppressionEntretien(id: string): PlanSuppressionEntretien {
    const corpusAvant = this.ouvrir()
    const corpusApres = structuredClone(corpusAvant)
    delete corpusApres.membership[id]
    const deplacements: PlanSuppressionEntretien['deplacements'] = []
    for (const suffixe of ['.json', '.json.bak1', '.json.bak2']) {
      const nom = id + suffixe
      if (existsSync(join(this.entretiensDir, nom))) {
        deplacements.push({
          source: join('entretiens', nom),
          destination: this.destinationCorbeille(nom),
        })
      }
    }
    if (existsSync(this.pngDir)) {
      for (const nom of readdirSync(this.pngDir)) {
        if (nom.startsWith(id + '.')) {
          deplacements.push({
            source: join('png', nom),
            destination: this.destinationCorbeille(nom),
          })
        }
      }
    }
    return { operation: 'suppression', id, corpusAvant, corpusApres, deplacements }
  }

  /** Retire le membership avant d'archiver les fichiers, sous journal récupérable.
   *  L'audio référencé reste externe au corpus et n'est jamais touché. */
  supprimerEntretien(id: string): CorpusFichier {
    this.verifierEcriture()
    const plan = this.preparerSuppressionEntretien(id)
    this.appliquerTransactionFichiers(plan)
    return plan.corpusApres
  }

  /** Applique un plan localement après une transaction locale ou un commit distant confirmé. */
  appliquerTransactionFichiers(plan: PlanTransactionFichiers): void {
    this.transactionsFichiers.executer(plan)
    this.invaliderRefsAudio()
  }

  /** Termine l'éventuelle intention durable laissée par un arrêt précédent. */
  reprendreTransactionFichiers(): boolean {
    const reprise = this.transactionsFichiers.reprendre()
    if (reprise) this.invaliderRefsAudio()
    return reprise
  }

  private destinationCorbeille(nom: string): string {
    const destination = join('corbeille', nom)
    if (!existsSync(join(this.dir, destination))) return destination
    return join('corbeille', `${nom}.copie-${Math.random().toString(36).slice(2, 10)}`)
  }

  /** Lit sur disque les fichiers dont les ids sont dans le membership.
   *  C'est ce qu'utilisent toutes les requêtes analytiques (usages de thèmes,
   *  matrice corpus…). Si un fichier est manquant, on le passe silencieusement. */
  private chargerEntretiens(): corpusModel.EntreeMatrice[] {
    const corpus = this.ouvrir()
    const out: corpusModel.EntreeMatrice[] = []
    for (const [id, ref] of Object.entries(corpus.membership)) {
      const f = this.entretienFile(id)
      if (!existsSync(f)) continue
      out.push({ id, titre: ref.titre, data: JSON.parse(readFileSync(f, 'utf8')) as EntretienFichier })
    }
    return out
  }
  private datas(): EntretienFichier[] {
    return this.chargerEntretiens().map((e) => e.data)
  }

  /** Inventaire tolérant : les entretiens illisibles restent signalés. */
  notesInventaire(): InventaireNotes {
    const corpus = this.ouvrir()
    const entretiens: corpusModel.EntreeMatrice[] = []
    const indisponibles: InventaireNotes['indisponibles'] = []
    for (const [id, ref] of Object.entries(corpus.membership)) {
      try {
        const lecture = this.lireEntretien(id)
        if (!lecture.ok) throw new Error(lecture.raison === 'absent' ? 'Fichier absent' : 'Version non supportée')
        entretiens.push({ id, titre: ref.titre, data: lecture.data })
      } catch (erreur) {
        indisponibles.push({
          id,
          titre: ref.titre,
          raison: erreur instanceof Error ? erreur.message : String(erreur),
        })
      }
    }
    return { ...inventorierNotes(corpus, entretiens), indisponibles }
  }

  /** Inventaire tolérant : les entretiens illisibles restent signalés. */
  personnesInventaire(): InventairePersonnes {
    const corpus = this.ouvrir()
    const entretiens: corpusModel.EntreeMatrice[] = []
    const indisponibles: InventairePersonnes['indisponibles'] = []
    for (const [id, ref] of Object.entries(corpus.membership)) {
      try {
        const lecture = this.lireEntretien(id)
        if (!lecture.ok) throw new Error(lecture.raison === 'absent' ? 'Fichier absent' : 'Version non supportée')
        lecture.data.locuteurs = completerIdsLocuteurs(id, lecture.data.locuteurs)
        entretiens.push({ id, titre: ref.titre, data: lecture.data })
      } catch (erreur) {
        indisponibles.push({ id, titre: ref.titre, raison: erreur instanceof Error ? erreur.message : String(erreur) })
      }
    }
    return { ...inventorierPersonnes(corpus, entretiens), indisponibles }
  }

  private etatLienJournal(locuteur: Locuteur): EtatLienJournalCorpus {
    return {
      personneRef: locuteur.personneRef ?? null,
      ...(locuteur.personneDeliee === undefined ? {} : { personneDeliee: locuteur.personneDeliee }),
    }
  }

  private etatRefusJournal(locuteur: Locuteur): EtatRefusJournalCorpus {
    return locuteur.rapprochementsRefuses === undefined
      ? {}
      : { rapprochementsRefuses: [...locuteur.rapprochementsRefuses] }
  }

  private memeEtatJournal(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b)
  }

  private lireLocuteurJournal(entretienId: string, locuteurId: string):
    | { ok: true; data: EntretienFichier; locuteur: Locuteur }
    | { ok: false; raison: 'entretien' | 'locuteur' } {
    const lecture = this.lireEntretien(entretienId)
    if (!lecture.ok) return { ok: false, raison: 'entretien' }
    lecture.data.locuteurs = completerIdsLocuteurs(entretienId, lecture.data.locuteurs)
    const locuteur = lecture.data.locuteurs.find((candidat) => candidat.id === locuteurId)
    return locuteur
      ? { ok: true, data: lecture.data, locuteur }
      : { ok: false, raison: 'locuteur' }
  }

  private lireNoteJournal(entretienId: string, noteId: string):
    | { ok: true; data: EntretienFichier; note: Note }
    | { ok: false; raison: 'entretien' | 'note' } {
    const lecture = this.lireEntretien(entretienId)
    if (!lecture.ok) return { ok: false, raison: 'entretien' }
    lecture.data.notes = normaliserNotes(lecture.data.notes)
    const note = lecture.data.notes.find((candidate) => candidate.id === noteId)
    return note
      ? { ok: true, data: lecture.data, note }
      : { ok: false, raison: 'note' }
  }

  private evaluerInverseJournal(inverse: InverseJournalCorpus): EtatInverseJournalCorpus {
    if (this.transactionsFichiers.journalPresent()) {
      return { etat: 'bloquee', raison: 'Une transaction de fichiers doit d’abord être terminée.' }
    }
    if (inverse.type === 'personneRenommer') {
      const personne = this.ouvrir().personnes[inverse.personneId]
      return personne?.nom === inverse.apres
        ? { etat: 'annulable' }
        : { etat: 'inapplicable', raison: 'La personne a été modifiée depuis cette action.' }
    }
    if (inverse.type === 'noteModifier') {
      const lecture = this.lireNoteJournal(inverse.entretienId, inverse.noteId)
      if (!lecture.ok) {
        return lecture.raison === 'note' || !this.ouvrir().membership[inverse.entretienId]
          ? { etat: 'inapplicable', raison: 'L’entretien ou la note n’existe plus.' }
          : { etat: 'bloquee', raison: 'L’entretien nécessaire est momentanément indisponible.' }
      }
      return memeEtatNote(etatNoteJournal(lecture.note), inverse.apres)
        ? { etat: 'annulable' }
        : { etat: 'inapplicable', raison: 'La note a été modifiée depuis cette action.' }
    }
    if (inverse.type === 'noteSupprimer') {
      const lecture = this.lireEntretien(inverse.entretienId)
      if (!lecture.ok) {
        return !this.ouvrir().membership[inverse.entretienId]
          ? { etat: 'inapplicable', raison: 'L’entretien n’existe plus.' }
          : { etat: 'bloquee', raison: 'L’entretien nécessaire est momentanément indisponible.' }
      }
      const ordreCourant = notesParRang(normaliserNotes(lecture.data.notes)).map((note) => note.id)
      if (ordreCourant.includes(inverse.note.id)) {
        return { etat: 'inapplicable', raison: 'La note existe de nouveau.' }
      }
      return this.memeEtatJournal(ordreCourant, inverse.ordreApres)
        ? { etat: 'annulable' }
        : { etat: 'inapplicable', raison: 'L’ordre des notes a changé depuis cette action.' }
    }
    const lecture = this.lireLocuteurJournal(inverse.entretienId, inverse.locuteurId)
    if (!lecture.ok) {
      if (lecture.raison === 'locuteur' || !this.ouvrir().membership[inverse.entretienId]) {
        return { etat: 'inapplicable', raison: 'L’entretien ou le locuteur n’existe plus.' }
      }
      return { etat: 'bloquee', raison: 'L’entretien nécessaire est momentanément indisponible.' }
    }
    const courant = inverse.type === 'personneLier'
      ? this.etatLienJournal(lecture.locuteur)
      : this.etatRefusJournal(lecture.locuteur)
    return this.memeEtatJournal(courant, inverse.apres)
      ? { etat: 'annulable' }
      : { etat: 'inapplicable', raison: 'Le locuteur a été modifié depuis cette action.' }
  }

  private appliquerInverseJournal(
    inverse: InverseJournalCorpus,
    impact: ImpactJournalCorpus,
  ): ResultatAnnulationCorpus {
    const etat = this.evaluerInverseJournal(inverse)
    if (etat.etat !== 'annulable') {
      return { ok: false, raison: etat.raison ?? 'Cette action ne peut plus être annulée.', temporaire: etat.etat === 'bloquee' }
    }
    try {
      if (inverse.type === 'personneRenommer') {
        const corpus = this.ouvrir()
        modifierPersonne(corpus, inverse.personneId, inverse.avant)
        this.ecrireJsonAtomique(this.corpusFile, corpus)
      } else if (inverse.type === 'noteModifier') {
        const lecture = this.lireNoteJournal(inverse.entretienId, inverse.noteId)
        if (!lecture.ok) return { ok: false, raison: 'L’entretien ou la note n’est plus disponible.', temporaire: lecture.raison === 'entretien' }
        const index = lecture.data.notes!.findIndex((note) => note.id === inverse.noteId)
        lecture.data.notes![index] = {
          ...structuredClone(inverse.avant),
          modifieLe: new Date().toISOString(),
        }
        const { formatVersion: _version, lastModified: _date, ...payload } = lecture.data
        this.ecrireEntretien(inverse.entretienId, payload)
      } else if (inverse.type === 'noteSupprimer') {
        const lecture = this.lireEntretien(inverse.entretienId)
        if (!lecture.ok) return { ok: false, raison: 'L’entretien n’est plus disponible.', temporaire: true }
        const notes = notesParRang(normaliserNotes(lecture.data.notes))
        notes.splice(Math.max(0, Math.min(inverse.note.rang, notes.length)), 0, structuredClone(inverse.note))
        lecture.data.notes = renumeroterRangs(notes)
        const { formatVersion: _version, lastModified: _date, ...payload } = lecture.data
        this.ecrireEntretien(inverse.entretienId, payload)
      } else {
        const lecture = this.lireLocuteurJournal(inverse.entretienId, inverse.locuteurId)
        if (!lecture.ok) return { ok: false, raison: 'L’entretien ou le locuteur n’est plus disponible.', temporaire: lecture.raison === 'entretien' }
        if (inverse.type === 'personneLier') {
          lecture.locuteur.personneRef = inverse.avant.personneRef
          if (inverse.avant.personneDeliee === undefined) delete lecture.locuteur.personneDeliee
          else lecture.locuteur.personneDeliee = inverse.avant.personneDeliee
        } else if (inverse.avant.rapprochementsRefuses === undefined) {
          delete lecture.locuteur.rapprochementsRefuses
        } else {
          lecture.locuteur.rapprochementsRefuses = [...inverse.avant.rapprochementsRefuses]
        }
        const { formatVersion: _version, lastModified: _date, ...payload } = lecture.data
        this.ecrireEntretien(inverse.entretienId, payload)
      }
      return { ok: true, impact }
    } catch (erreur) {
      return {
        ok: false,
        raison: erreur instanceof Error ? erreur.message : String(erreur),
        temporaire: true,
      }
    }
  }

  journalCorpusLister(): EntreeJournalCorpusVue[] {
    return this.journalCorpus.lister((inverse) => this.evaluerInverseJournal(inverse))
  }

  journalCorpusAnnuler(id: string): ResultatAnnulationCorpus {
    this.verifierEcriture()
    return this.journalCorpus.annuler(
      id,
      (inverse) => this.evaluerInverseJournal(inverse),
      (inverse, impact) => this.appliquerInverseJournal(inverse, impact),
    )
  }

  /** Modifie ou supprime une note après relecture fraîche de son état sémantique. */
  notesCommander(commande: CommandeNotes, journaliser = false): string | null {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    if (!corpus.membership[commande.entretienId]) {
      throw new Error('Cet entretien ne fait plus partie du corpus.')
    }
    const lecture = this.lireEntretien(commande.entretienId)
    if (!lecture.ok) throw new Error('Cet entretien est indisponible.')
    const data = lecture.data
    data.notes = normaliserNotes(data.notes)
    const note = trouverNote(data, commande.noteId)
    if (!memeEtatNote(etatNoteJournal(note), commande.attendu)) {
      throw new Error('Cette note a changé. Actualisez la liste des notes.')
    }

    if (commande.type === 'modifier') {
      if (!normaliserCategoriesNote(corpus.categoriesNote)
        .some((categorie) => categorie.id === commande.champs.categorieId)) {
        throw new Error('Cette catégorie de note n’existe plus.')
      }
      if (commande.champs.statut !== 'public' && commande.champs.statut !== 'prive') {
        throw new Error('Le statut de la note est invalide.')
      }
      if (typeof commande.champs.titre !== 'string' || typeof commande.champs.corps !== 'string'
        || (commande.champs.date !== null && typeof commande.champs.date !== 'string')) {
        throw new Error('Le contenu de la note est invalide.')
      }
      if (memesChampsEditables(note, commande.champs)) return note.id

      const avant = structuredClone(note)
      Object.assign(note, structuredClone(commande.champs))
      note.modifieLe = new Date().toISOString()
      const apres = etatNoteJournal(note)
      const { formatVersion: _version, lastModified: _date, ...payload } = data
      this.ecrireEntretien(commande.entretienId, payload)
      if (journaliser) {
        this.journalCorpus.enregistrer(
          `Note modifiée : « ${note.titre || '(sans titre)'} »`,
          'notes',
          { type: 'noteModifier', entretienId: commande.entretienId, noteId: note.id, avant, apres },
          { corpus: false, entretiens: [commande.entretienId], projections: ['notes', 'personnes'] },
        )
      }
      return note.id
    }

    const noteSupprimee = structuredClone(note)
    data.notes = renumeroterRangs(
      notesParRang(data.notes).filter((candidate) => candidate.id !== note.id),
    )
    const ordreApres = data.notes.map((candidate) => candidate.id)
    const { formatVersion: _version, lastModified: _date, ...payload } = data
    this.ecrireEntretien(commande.entretienId, payload)
    if (journaliser) {
      this.journalCorpus.enregistrer(
        `Note supprimée : « ${note.titre || '(sans titre)'} »`,
        'notes',
        { type: 'noteSupprimer', entretienId: commande.entretienId, note: noteSupprimee, ordreApres },
        { corpus: false, entretiens: [commande.entretienId], projections: ['notes', 'personnes'] },
      )
    }
    return null
  }

  /** Corrections locales du répertoire, sans réécriture des noms de locuteurs. */
  personnesCommander(
    commande: CommandePersonnes,
    journaliser = false,
    autoriserRefusComposite = true,
    autoriserRapprochementComposite = true,
  ): string | null {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    if (commande.type === 'fusionner') {
      const inventaire = this.personnesInventaire()
      if (inventaire.indisponibles.length) throw new Error('Réunion impossible : certains entretiens sont illisibles.')
      if (JSON.stringify(inventaire) !== commande.attendu) throw new Error('Les personnes ou les entretiens ont changé. Actualisez puis vérifiez à nouveau la réunion.')
      const corpusAvant = JSON.parse(readFileSync(this.corpusFile, 'utf8')) as CorpusFichier
      const fichiers = Object.entries(corpus.membership).map(([id, ref]) => {
        const avant = JSON.parse(readFileSync(this.entretienFile(id), 'utf8')) as EntretienFichier
        const lecture = this.lireEntretien(id)
        if (!lecture.ok) throw new Error(`Entretien indisponible : ${ref.titre}`)
        const apres = lecture.data
        apres.locuteurs = completerIdsLocuteurs(id, apres.locuteurs)
        return { id, titre: ref.titre, avant, apres, initial: JSON.stringify(apres) }
      })
      const entretiens = fichiers.map(e => ({ id: e.id, titre: e.titre, data: e.apres }))
      if (commande.reprise) {
        const r = commande.reprise
        const cibleData = entretiens.find(e => e.id === r.entretienId)?.data
        const sourceData = entretiens.find(e => e.id === r.sourceEntretienId)?.data
        if (!cibleData || !sourceData || r.entretienId === r.sourceEntretienId) throw new Error('Source de reprise invalide.')
        const cible = trouverLocuteur(cibleData, r.locuteurId)
        const source = trouverLocuteur(sourceData, r.sourceLocuteurId)
        if (![commande.conserverId, commande.absorberId].includes(cible.personneRef ?? '')
          || ![commande.conserverId, commande.absorberId].includes(source.personneRef ?? '')
          || cible.personneRef === source.personneRef) throw new Error('Les associations de la reprise ont changé.')
        reprendreDonneesLocuteur(cible, source, r.choix)
      }
      fusionnerPersonnes(corpus, entretiens, commande.conserverId, commande.absorberId)
      const now = new Date().toISOString()
      const modifies = fichiers.filter(e => e.initial !== JSON.stringify(e.apres)).map(({ id, avant, apres }) => ({ id, avant, apres }))
      for (const e of modifies) {
        e.apres.lastModified = now
        corpus.membership[e.id].lastModified = now
      }
      this.appliquerTransactionFichiers({ operation: 'remplacement', id: genId('fusion'), corpusAvant, corpusApres: corpus, entretiens: modifies })
      return commande.conserverId
    }
    if (commande.type === 'separer') {
      const inventaire = this.personnesInventaire()
      if (inventaire.indisponibles.length) throw new Error('Séparation impossible : certains entretiens sont illisibles.')
      if (JSON.stringify(inventaire) !== commande.attendu) throw new Error('Les personnes ou les entretiens ont changé. Actualisez puis vérifiez à nouveau la séparation.')
      const corpusAvant = JSON.parse(readFileSync(this.corpusFile, 'utf8')) as CorpusFichier
      const fichiers = Object.entries(corpus.membership).map(([id, ref]) => {
        const avant = JSON.parse(readFileSync(this.entretienFile(id), 'utf8')) as EntretienFichier
        const lecture = this.lireEntretien(id)
        if (!lecture.ok) throw new Error(`Entretien indisponible : ${ref.titre}`)
        const apres = lecture.data
        apres.locuteurs = completerIdsLocuteurs(id, apres.locuteurs)
        return { id, titre: ref.titre, avant, apres, initial: JSON.stringify(apres) }
      })
      const entretiens = fichiers.map((fichier) => ({ id: fichier.id, titre: fichier.titre, data: fichier.apres }))
      const personneId = genId('pers')
      separerPersonne(corpus, entretiens, commande.personneId, personneId, commande.nom, commande.locuteurs)
      const now = new Date().toISOString()
      const modifies = fichiers
        .filter((fichier) => fichier.initial !== JSON.stringify(fichier.apres))
        .map(({ id, avant, apres }) => ({ id, avant, apres }))
      for (const entretien of modifies) {
        entretien.apres.lastModified = now
        corpus.membership[entretien.id].lastModified = now
      }
      this.appliquerTransactionFichiers({
        operation: 'remplacement',
        id: genId('separation'),
        corpusAvant,
        corpusApres: corpus,
        entretiens: modifies,
        ordre: 'corpus-puis-entretiens',
      })
      return personneId
    }
    if (commande.type === 'creerDefinition') {
      return this.creerDefinitionPersonne(commande.nom, true)
    }
    if (commande.type === 'modifier') {
      const avant = corpus.personnes[commande.personneId]?.nom
      modifierPersonne(corpus, commande.personneId, commande.nom)
      const apres = corpus.personnes[commande.personneId].nom
      this.ecrireJsonAtomique(this.corpusFile, corpus)
      if (journaliser && avant !== undefined && avant !== apres) {
        this.journalCorpus.enregistrer(
          `Personne renommée : ${avant} → ${apres}`,
          'personnes',
          { type: 'personneRenommer', personneId: commande.personneId, avant, apres },
          { corpus: true, entretiens: [], projections: ['personnes'] },
        )
      }
      return commande.personneId
    }
    if (commande.type === 'supprimer') {
      supprimerPersonneVide(corpus, this.personnesInventaire(), commande.personneId)
      this.ecrireJsonAtomique(this.corpusFile, corpus)
      return null
    }
    if (commande.type === 'refuser' || commande.type === 'annulerRefus' || commande.type === 'rapprocher') {
      if (commande.type === 'rapprocher' && commande.attendu && JSON.stringify(this.personnesInventaire()) !== commande.attendu) {
        throw new Error('Les personnes ou les données ont changé. Vérifiez à nouveau le rapprochement.')
      }
      const charger = (id: string) => {
        if (!corpus.membership[id]) throw new Error('Cet entretien ne fait plus partie du corpus.')
        const lecture = this.lireEntretien(id)
        if (!lecture.ok) throw new Error('Cet entretien est indisponible.')
        lecture.data.locuteurs = completerIdsLocuteurs(id, lecture.data.locuteurs)
        return lecture.data
      }
      const enregistrer = (id: string, data: EntretienFichier) => {
        const { formatVersion: _v, lastModified: _d, ...payload } = data
        this.ecrireEntretien(id, payload)
      }
      const data = charger(commande.entretienId)
      const cible = trouverLocuteur(data, commande.locuteurId)
      if (commande.type === 'annulerRefus') {
        const avant = this.etatRefusJournal(cible)
        annulerRefusRapprochement(cible, commande.cible)
        const apres = this.etatRefusJournal(cible)
        enregistrer(commande.entretienId, data)
        if (journaliser && !this.memeEtatJournal(avant, apres)) {
          this.journalCorpus.enregistrer(
            `Décision de rapprochement rétablie pour « ${cible.nom} »`,
            'personnes',
            { type: 'personneRefus', entretienId: commande.entretienId, locuteurId: commande.locuteurId, avant, apres },
            { corpus: false, entretiens: [commande.entretienId], projections: ['personnes'] },
          )
        }
        return cible.personneRef
      }
      if (commande.sourceEntretienId === commande.entretienId) throw new Error('Choisissez un autre entretien.')
      const sourceData = charger(commande.sourceEntretienId)
      const source = trouverLocuteur(sourceData, commande.sourceLocuteurId)
      if (commande.type === 'rapprocher' && !autoriserRapprochementComposite
        && (!source.personneRef || cible.personneRef)) {
        throw new Error('Ce rapprochement doit créer ou modifier plusieurs associations. Cette correction composite n’est pas encore disponible dans les corpus distants.')
      }
      if (commande.type === 'refuser') {
        const creerIdentite = peutCreerPersonneAuNommage(cible)
        if (creerIdentite && !autoriserRefusComposite) {
          throw new Error('Cette décision doit aussi créer une personne distincte. Cette correction composite n’est pas encore disponible dans les corpus distants.')
        }
        const avant = this.etatRefusJournal(cible)
        refuserRapprochement(cible, source)
        const apres = this.etatRefusJournal(cible)
        if (creerIdentite) {
          const id = creerPersonne(corpus, genId('pers'), cible.nom).id
          lierLocuteur(corpus, data, commande.locuteurId, id)
          this.ecrireJsonAtomique(this.corpusFile, corpus)
        }
        try { enregistrer(commande.entretienId, data) }
        catch (e) {
          if (creerIdentite) throw new Error(`La personne distincte a été créée, mais l’association et le refus n’ont pas été enregistrés. Reprenez depuis le répertoire. ${String(e)}`)
          throw e
        }
        if (journaliser && !creerIdentite && !this.memeEtatJournal(avant, apres)) {
          this.journalCorpus.enregistrer(
            `Rapprochement écarté pour « ${cible.nom} »`,
            'personnes',
            { type: 'personneRefus', entretienId: commande.entretienId, locuteurId: commande.locuteurId, avant, apres },
            { corpus: false, entretiens: [commande.entretienId], projections: ['personnes'] },
          )
        }
        return cible.personneRef
      }
      if (source.personneRef && cible.personneRef && source.personneRef !== cible.personneRef) {
        throw new Error('Ces locuteurs sont associés à deux personnes distinctes. Réunissez-les, ou modifiez uniquement l’association du locuteur concerné.')
      }
      const id = source.personneRef ?? cible.personneRef ?? genId('pers')
      if (!corpus.personnes[id]) creerPersonne(corpus, id, source.nom)
      lierLocuteur(corpus, data, commande.locuteurId, id)
      if (commande.reprise) reprendreDonneesLocuteur(cible, source, commande.reprise)
      if (!source.personneRef) {
        lierLocuteur(corpus, sourceData, commande.sourceLocuteurId, id)
        this.ecrireJsonAtomique(this.corpusFile, corpus)
        try { enregistrer(commande.sourceEntretienId, sourceData) }
        catch (e) { throw new Error(`Personne créée, mais association avec l’entretien source échouée. Reprenez depuis le répertoire. ${String(e)}`) }
      }
      try { enregistrer(commande.entretienId, data) }
      catch (e) { throw new Error(`La personne source est conservée, mais la liaison cible et la reprise ont échoué. Reprenez depuis le répertoire. ${String(e)}`) }
      return id
    }
    if (commande.type !== 'creer' && commande.type !== 'lier') throw new Error('Commande Personnes inconnue.')
    if (!corpus.membership[commande.entretienId]) throw new Error('Cet entretien ne fait plus partie du corpus.')
    const lecture = this.lireEntretien(commande.entretienId)
    if (!lecture.ok) throw new Error('Cet entretien est indisponible.')
    const data = lecture.data
    data.locuteurs = completerIdsLocuteurs(commande.entretienId, data.locuteurs)
    const locuteur = trouverLocuteur(data, commande.locuteurId)
    const avantLien = this.etatLienJournal(locuteur)
    let personneId: string | null
    if (commande.type === 'creer') {
      if (locuteur.personneRef) throw new Error('Déliez ce locuteur avant de créer une nouvelle personne.')
      personneId = creerPersonne(corpus, genId('pers'), commande.nom).id
    } else {
      personneId = commande.personneId
    }
    lierLocuteur(corpus, data, commande.locuteurId, personneId)
    // La définition précède son lien : un échec ne laisse jamais une référence pendante.
    if (commande.type === 'creer') this.ecrireJsonAtomique(this.corpusFile, corpus)
    const { formatVersion: _version, lastModified: _date, ...payload } = data
    try {
      this.ecrireEntretien(commande.entretienId, payload)
    } catch (erreur) {
      if (commande.type === 'creer') {
        throw new Error(`La personne a été créée, mais le lien a échoué. Retrouvez-la dans le répertoire pour réessayer. ${erreur instanceof Error ? erreur.message : String(erreur)}`)
      }
      throw erreur
    }
    if (journaliser && commande.type === 'lier') {
      const apresLien = this.etatLienJournal(locuteur)
      if (!this.memeEtatJournal(avantLien, apresLien)) {
        const nomAvant = avantLien.personneRef
          ? corpus.personnes[avantLien.personneRef]?.nom ?? 'une personne absente'
          : null
        const nomApres = apresLien.personneRef
          ? corpus.personnes[apresLien.personneRef]?.nom ?? 'une personne absente'
          : null
        const libelle = nomAvant && nomApres
          ? `Association déplacée : ${nomAvant} → ${nomApres}`
          : nomApres
            ? `Locuteur associé à ${nomApres}`
            : `Locuteur dissocié de ${nomAvant ?? 'sa personne'}`
        this.journalCorpus.enregistrer(
          libelle,
          'personnes',
          { type: 'personneLier', entretienId: commande.entretienId, locuteurId: commande.locuteurId, avant: avantLien, apres: apresLien },
          { corpus: false, entretiens: [commande.entretienId], projections: ['personnes', 'notes'] },
        )
      }
    }
    return personneId
  }

  refuserRapprochementSimple(
    commande: Extract<CommandePersonnes, { type: 'refuser' }>,
  ): string | null {
    return this.personnesCommander(commande, false, false)
  }

  rapprocherPersonneSimple(
    commande: Extract<CommandePersonnes, { type: 'rapprocher' }>,
  ): string | null {
    return this.personnesCommander(commande, false, true, false)
  }

  creerDefinitionPersonne(nom: string, automatique = false): string {
    this.verifierEcriture()
    if (automatique && natureNomPersonne(nom) !== 'specifique') {
      throw new Error('Un nom spécifique est nécessaire pour créer automatiquement une personne.')
    }
    const corpus = this.ouvrir()
    const id = creerPersonne(corpus, genId('pers'), nom).id
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return id
  }

  // ── Codebook (thèmes) — lire → appliquer (shared/corpus) → écrire ───────────

  ajouterCategorie(nom: string, parent: string | null = null): { id: string; corpus: CorpusFichier } {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    const id = corpusModel.ajouterCategorie(corpus, nom, parent, () => genId('cat'))
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return { id, corpus }
  }

  modifierCategorie(id: string, patch: PatchCategorie): CorpusFichier {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    corpusModel.modifierCategorie(corpus, id, patch)
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return corpus
  }

  deplacerCategorie(id: string, sens: -1 | 1): CorpusFichier {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    corpusModel.deplacerCategorie(corpus, id, sens)
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return corpus
  }

  migrerCategorie(id: string, nouveauParent: string | null): CorpusFichier {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    corpusModel.migrerCategorie(corpus, id, nouveauParent)
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return corpus
  }

  /** Usages d'une catégorie, `exceptId` excluant un entretien du comptage ;
   *  sert à vérifier, à la suppression, qu'elle n'est pas utilisée ailleurs. */
  compterUsagesCategorie(code: string, exceptId?: string): number {
    const datas = this.chargerEntretiens()
      .filter((e) => e.id !== exceptId)
      .map((e) => e.data)
    return corpusModel.compterUsagesCategorie(datas, code)
  }

  /** Nombre d'usages de chaque catégorie dans l'ensemble des entretiens du corpus.
   *  Fonction `usagesParCategorie` de shared/corpus. */
  usagesParCategorie(): Record<string, number> {
    return corpusModel.usagesParCategorie(this.datas())
  }

  // ── Catégories de note (définitions corpus) — lire → muter → écrire ───────
  /** Les catégories de note du corpus (`corpus.json.categoriesNote`),
   *  normalisées : un corpus existant sans le champ obtient les bacs par défaut. */
  categoriesNote(): NoteCategory[] {
    const c = this.ouvrir()
    return normaliserCategoriesNote(c.categoriesNote)
  }

  ajouterCategorieNote(nom: string, couleur: string): { id: string; corpus: CorpusFichier } {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    const liste = normaliserCategoriesNote(corpus.categoriesNote)
    const id = genIdCategorieNote()
    liste.push({ id, nom: nom.trim() || 'note', couleur: couleur || '#9e9e9e' })
    corpus.categoriesNote = liste
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return { id, corpus }
  }

  renommerCategorieNote(id: string, nom: string): CorpusFichier {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    const liste = normaliserCategoriesNote(corpus.categoriesNote)
    const c = liste.find((x) => x.id === id)
    if (c) {
      c.nom = nom.trim() || c.nom
      corpus.categoriesNote = liste
      this.ecrireJsonAtomique(this.corpusFile, corpus)
    }
    return corpus
  }

  majCouleurCategorieNote(id: string, couleur: string): CorpusFichier {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    const liste = normaliserCategoriesNote(corpus.categoriesNote)
    const c = liste.find((x) => x.id === id)
    if (c) {
      c.couleur = couleur || c.couleur
      corpus.categoriesNote = liste
      this.ecrireJsonAtomique(this.corpusFile, corpus)
    }
    return corpus
  }

  /** Usages d'une catégorie de note : notes de TOUS les entretiens qui la référencent.
   *  Scan des fichiers, comme `compterUsagesCategorie`. */
  compterUsagesCategorieNote(id: string): number {
    return compterUsagesCategorieNote(this.datas(), id)
  }

  /** Supprime une catégorie de note — REFUSÉE tant qu'une note l'utilise.
   *  Parité thèmes : pas de suppression en cascade. */
  supprimerCategorieNote(id: string): ResultatSuppressionCategorie {
    this.verifierEcriture()
    const usages = this.compterUsagesCategorieNote(id)
    if (usages > 0) return { ok: false, usages }
    const corpus = this.ouvrir()
    const liste = normaliserCategoriesNote(corpus.categoriesNote).filter((x) => x.id !== id)
    corpus.categoriesNote = liste
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return { ok: true, corpus }
  }

  /** REQUÊTE : résumé thématique de chaque entretien : segments en % du texte, jamais stockés. */
  resumesThematiques(): Record<string, SegmentThematique[]> {
    return corpusModel.resumesThematiques(this.chargerEntretiens())
  }

  // ── Règles d'anonymisation corpus + scan (étape 3a, lecture seule) ────────

  /** Les règles corpus (`corpus.json.reglesAnon`), sous forme de tableau.
   *  En 3a (lecture) on ne fait que LIRE : aucune création possible tant que le
   *  cran corpus du slider (3b) n'est pas activé. */
  reglesAnon(): RegleAnon[] {
    const corpus = this.ouvrir()
    return Object.values(corpus.reglesAnon)
  }

  /** REQUÊTE scan anon corpus : relit TOUS les entretiens sur disque et, pour chaque règle corpus,
   *  classe les occurrences par état (anonymisées, exceptions, à traiter).
   *  Rien de stocké, aucun cache — le texte est relu à chaque appel.
   *  Réconciliation : « un changement coincide-t-il avec une règle ? ». */
  scanAnon(): ScanRegle[] {
    return corpusModel.scannerCorpus(this.reglesAnon(), this.chargerEntretiens())
  }

  // ── CRUD règles corpus (3b) : lecture → calcul PUR → écriture atomique ────

  /** Règle d'une entité (insensible à la casse), ou undefined. */
  regleAnonParEntite(entite: string): RegleAnon | undefined {
    return corpusModel.trouverRegleParEntite(this.ouvrir(), entite)
  }

  /** Crée une règle pour une entité.
   *  Défensive : si la transaction révèle une règle déjà posée par un collègue
   *  (données fraîches du GET d'après-verrou), elle est réutilisée.
   *  `existait: true` signale ce cas à l'UI,
   *  qui ouvre son dialogue Aligner / Garder les deux. */
  regleAnonCreer(entite: string, pseudos: string[]): { regle: RegleAnon; existait: boolean } {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    const existante = corpusModel.trouverRegleParEntite(corpus, entite)
    const r = corpusModel.creerRegle(corpus, entite, pseudos, () => genId('reg'))
    if (!existante) this.ecrireJsonAtomique(this.corpusFile, corpus)
    return { regle: r, existait: !!existante }
  }

  /** « Garder les deux » : ajoute un pseudo secondaire à une règle (si ≤2). */
  regleAnonAjouterPseudo(id: string, pseudo: string): RegleAnon | null {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    corpusModel.ajouterPseudoRegle(corpus, id, pseudo)
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return corpus.reglesAnon[id] ?? null
  }

  /** La règle est-elle référencée par un entretien AUTRE que `exceptId` ?
   *  (garde de suppression : on ne retire une règle que si elle est isolée). */
  regleAnonUtiliseeAilleurs(id: string, exceptId?: string): boolean {
    return this.chargerEntretiens().some((e) => {
      if (e.id === exceptId) return false
      return e.data.annotations.some((a) => a.type === 'anon' && a.regle === id)
    })
  }

  /** Supprime une règle du corpus (l'appelant a déjà vérifié l'isolation). */
  regleAnonSupprimer(id: string): void {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    corpusModel.retirerRegle(corpus, id)
    this.ecrireJsonAtomique(this.corpusFile, corpus)
  }

  /** Paramètres de pseudonymisation (étape 4) : lecture tolérante (absence ou champ manquant → défauts,
   *  fusion imbriquée pour motsLiaison), écriture complète sous garde d'écriture. */
  lireParamsAnon(): ParamsAnon {
    const corpus = this.ouvrir()
    const defauts = paramsAnonDefaut()
    return {
      ...defauts,
      ...(corpus.paramsAnon ?? {}),
      motsLiaison: { ...defauts.motsLiaison!, ...(corpus.paramsAnon?.motsLiaison ?? {}) },
      thematiques: { ...defauts.thematiques!, ...(corpus.paramsAnon?.thematiques ?? {}) },
    }
  }

  ecrireParamsAnon(params: ParamsAnon): ParamsAnon {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    const defauts = paramsAnonDefaut()
    corpus.paramsAnon = {
      ...defauts,
      ...params,
      motsLiaison: { ...defauts.motsLiaison!, ...(params.motsLiaison ?? {}) },
      thematiques: { ...defauts.thematiques!, ...(params.thematiques ?? {}) },
    }
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return corpus.paramsAnon
  }

  /** Assigne (ou retire, `null`) la thématique d'une règle (étape 4c).
   *  Renvoie la règle mise à jour, ou null si inconnue. */
  regleAnonCategoriser(id: string, categorie: string | null): RegleAnon | null {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    const regle = corpus.reglesAnon[id]
    if (!regle) return null
    if (categorie) regle.categorie = categorie
    else delete regle.categorie
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return regle
  }

  /** APPLICATION EN MASSE / VALIDATION DU DIFF (étape 2) : applique sur un entretien FERMÉ les changements de la vue vérification (lecture fichier → instructions PURES → écriture atomique).
   *  `plages` restreint les POSES aux seules occurrences cochées ; `retirer`, `exception` et `retirerException` portent le diff façon SonalPi1 (« Valider »).
   *  Renvoie le nombre total de changements écrits. */
  appliquerRegleAnon(
    entretienId: string,
    regleId: string,
    cible?: {
      plages?: { from: number; to: number }[]
      retirer?: { from: number; to: number }[]
      exception?: { from: number; to: number }[]
      retirerException?: { from: number; to: number }[]
    },
  ): { nb: number; titre: string } {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    const titre = corpus.membership[entretienId]?.titre ?? entretienId
    const regle = corpus.reglesAnon[regleId]
    const file = this.entretienFile(entretienId)
    if (!regle || !existsSync(file)) return { nb: 0, titre }
    const data = JSON.parse(readFileSync(file, 'utf8')) as EntretienFichier
    const instr = instructionsAppliquerRegle(data, regle, () =>
      'a-' + Math.random().toString(36).slice(2, 9),
    )
    const poser = poserDansPlages(instr.poser, cible?.plages)
    const nbDiff = appliquerDiffAnon(
      data.annotations,
      regle.id,
      cible?.retirer,
      cible?.exception,
      cible?.retirerException,
    )
    for (const o of poser) {
      data.annotations.push({ id: o.id, type: 'anon', from: o.from, to: o.to, auteur: 'corpus', etat: 'anonymise', pseudo: o.pseudo, regle: o.regle })
    }
    const nb = nbDiff + poser.length
    if (nb > 0) this.ecrireJsonAtomique(file, data)
    return { nb, titre }
  }

  /** Supprime une catégorie — REFUSÉE tant qu'elle est utilisée.
   *  Politique explicite + compteur, pas de suppression silencieuse d'annotations. */
  supprimerCategorie(id: string, exceptId?: string): ResultatSuppressionCategorie {
    this.verifierEcriture()
    const usages = this.compterUsagesCategorie(id, exceptId)
    if (usages > 0) return { ok: false, usages }
    const corpus = this.ouvrir()
    corpusModel.retirerCategorie(corpus, id)
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return { ok: true, corpus }
  }

  // ── Variables & modalités (EAV) — lire → appliquer → écrire ─────────────────

  ajouterVariable(lib: string, portee: 'entretien' | 'locuteur'): { id: string; corpus: CorpusFichier } {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    const id = corpusModel.ajouterVariable(corpus, lib, portee, () => genId('var'))
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return { id, corpus }
  }

  modifierVariable(id: string, patch: Partial<Pick<Variable, 'lib' | 'portee' | 'priv'>>): CorpusFichier {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    corpusModel.modifierVariable(corpus, id, patch)
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return corpus
  }

  ajouterModalite(idVar: string, lib: string): CorpusFichier {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    corpusModel.ajouterModalite(corpus, idVar, lib, () => genId('mod'))
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return corpus
  }

  modifierModalite(idVar: string, idMod: string, lib: string): CorpusFichier {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    corpusModel.modifierModalite(corpus, idVar, idMod, lib)
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return corpus
  }

  compterUsagesVariable(idVar: string): number {
    return corpusModel.compterUsagesVariable(this.datas(), idVar)
  }

  compterUsagesModalite(idVar: string, idMod: string): number {
    return corpusModel.compterUsagesModalite(this.datas(), idVar, idMod)
  }

  supprimerVariable(id: string): ResultatSuppression {
    this.verifierEcriture()
    const usages = this.compterUsagesVariable(id)
    if (usages > 0) return { ok: false, usages }
    const corpus = this.ouvrir()
    corpusModel.retirerVariable(corpus, id)
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return { ok: true, corpus }
  }

  supprimerModalite(idVar: string, idMod: string): ResultatSuppression {
    this.verifierEcriture()
    const usages = this.compterUsagesModalite(idVar, idMod)
    if (usages > 0) return { ok: false, usages }
    const corpus = this.ouvrir()
    corpusModel.retirerModalite(corpus, idVar, idMod)
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return { ok: true, corpus }
  }

  /** Table de données : chaque ligne = un entretien, chaque colonne = une variable,
   *  chaque cellule = la valeur EAV correspondante.
   *  La matrice est construite à la volée à partir des fichiers d'entretiens,
   *  mécanique détaillée dans shared/corpus/requetes.ts. */
  matriceCorpus(): MatriceCorpus {
    return corpusModel.matriceCorpus(this.chargerEntretiens())
  }

  /** Pose une valeur EAV dans un entretien (table de données).
   *  Écriture ciblée atomique, sans rotation `.bak` (valeur scalaire) ;
   *  le watermark du membership est mis à jour,
   *  pour rester cohérent avec `ecrireEntretien`.
   *  Renvoie false si l'entretien manque. */
  poserValeur(entretienId: string, cible: CibleValeur, idVar: string, idMod: string): boolean {
    this.verifierEcritureEntretien(entretienId)
    const f = this.entretienFile(entretienId)
    if (!existsSync(f)) return false
    const data = JSON.parse(readFileSync(f, 'utf8')) as EntretienFichier
    corpusModel.poserValeur(data, cible, idVar, idMod)
    const now = new Date().toISOString()
    data.lastModified = now
    this.ecrireJsonAtomique(f, data)
    // Membership inchangé ici (voir ecrireEntretien).
    return true
  }


  // ── Audio : référence (chemin absolu) + dérivés PNG ──────────────────────────

  /** Assigne un fichier audio à un entretien par RÉFÉRENCE (chemin absolu).
   *  Plus de copie : le fichier d'origine est lu en streaming + forme d'onde,
   *  jamais écrit par l'app (parité SonalPi1).
   *  Le chemin stocké est normalisé (`file://` → natif, `path.normalize`),
   *  pour une comparaison fiable des chemins.
   *  Écriture ciblée comme `poserValeur` (pas de rotation `.bak`). */
  assignerAudio(id: string, source: string): { audioRef: string } | null {
    this.verifierEcritureEntretien(id)
    const f = this.entretienFile(id)
    // Normaliser : certains dialogs (Linux) renvoient `file://` → natif.
    const ref = normaliserCheminAudio(source)
    if (!existsSync(f) || !existsSync(ref)) return null

    const data = JSON.parse(readFileSync(f, 'utf8')) as EntretienFichier
    data.meta.audioRef = ref
    const now = new Date().toISOString()
    data.lastModified = now
    this.ecrireJsonAtomique(f, data)

    this.invaliderRefsAudio()
    // Membership inchangé ici (voir ecrireEntretien).
    return { audioRef: ref }
  }

  /** Détache l'audio d'un entretien : `meta.audioRef` → null, désignation distante et association machine-locale oubliées.
   *  Forme d'onde dérivée supprimée ; le texte reste, seul le média est retiré.
   *  Parité « Assigner un audio » : on retire la référence, jamais le fichier source. */
  effacerAudio(id: string): { audioRef: null } {
    this.verifierEcritureEntretien(id)
    const f = this.entretienFile(id)
    if (!existsSync(f)) return { audioRef: null }
    const data = JSON.parse(readFileSync(f, 'utf8')) as EntretienFichier
    data.meta.audioRef = null
    delete data.meta.audioDistant
    data.lastModified = new Date().toISOString()
    this.ecrireJsonAtomique(f, data)

    // Association machine-locale (`audio-locaux.json`) : la ref n'existe plus.
    const locaux = this.lireAudiosLocaux()
    if (locaux[id]) {
      delete locaux[id]
      writeFileSync(this.cheminAudiosLocaux(), JSON.stringify(locaux, null, 2), 'utf8')
    }

    // Dérivé PNG : supprimé (régénérable — jamais de reliquat sans source).
    if (existsSync(this.pngDir)) {
      for (const nom of readdirSync(this.pngDir)) {
        if (nom.startsWith(id + '.')) unlinkSync(join(this.pngDir, nom))
      }
    }
    this.invaliderRefsAudio()
    return { audioRef: null }
  }

  /** Aligne les caches et dérivés locaux après une mutation audio publiée par
   *  une transaction distante. */
  apresMutationAudio(id: string, efface: boolean): void {
    if (efface) {
      const locaux = this.lireAudiosLocaux()
      if (locaux[id]) {
        delete locaux[id]
        writeFileSync(this.cheminAudiosLocaux(), JSON.stringify(locaux, null, 2), 'utf8')
      }
      if (existsSync(this.pngDir)) {
        for (const nom of readdirSync(this.pngDir)) {
          if (nom.startsWith(id + '.')) unlinkSync(join(this.pngDir, nom))
        }
      }
    }
    this.invaliderRefsAudio()
  }

  /** Écrit le PNG de la forme d'onde (`png/<id>.png`).
   *  C'est un dérivé régénérable, hors format natif mais copié avec le dossier.
   *  Un PNG supprimé à la main est régénéré en fond à l'ouverture du corpus,
   *  par `regenererOndesManquantes` (sonal.ts). */
  ecrireWaveform(id: string, png: Uint8Array): string {
    if (!existsSync(this.pngDir)) mkdirSync(this.pngDir, { recursive: true })
    const rel = `png/${id}.png`
    writeFileSync(join(this.dir, rel), png)
    return rel
  }

  /** REQUÊTE : par id d'entretien, son `audioRef` absolu (depuis le cache) et la présence de sa forme d'onde.
   *  Alimente les cartes de l'écran Corpus + le chargement du lecteur. */
  audios(): Record<string, { audio: string | null; waveform: string | null }> {
    const out: Record<string, { audio: string | null; waveform: string | null }> = {}
    // Waveform : scan de `png/` par convention de nommage,
    // le PNG est un dérivé local découvert par nom, jamais stocké dans l'entretien.
    if (existsSync(this.pngDir)) {
      for (const nom of readdirSync(this.pngDir)) {
        if (extname(nom).slice(1).toLowerCase() !== 'png') continue
        const id = basename(nom, extname(nom))
        if (!id) continue
        ;(out[id] ??= { audio: null, waveform: null }).waveform = `png/${nom}`
      }
    }
    // Audio : depuis la résolution EFFECTIVE, ref partagée ou retombée locale.
    // Un poste qui a associé son fichier travaille comme les autres.
    for (const [id, ref] of this.audiosResolus()) {
      ;(out[id] ??= { audio: null, waveform: null }).audio = ref
    }
    return out
  }

  /* ── Audio LOCAL sur un poste distant ────────────────────────────────────
   *  `meta.audioRef` est un chemin absolu DU POSTE QUI A ASSIGNÉ : chez les
   *  autres, le fichier est manquant.
   *  « Associer l'audio local… » RÉFÉRENCE le fichier là où il est (parité
   *  assignerAudio : jamais de copie) dans `<corpus>/audio-locaux.json` —
   *  fichier MACHINE-LOCAL, jamais poussé (le miroir ne fait que tirer) :
   *  aucune écriture en cascade des audioRef entre postes.
   *  La résolution retombe dessus quand la ref du JSON ne pointe nulle part
   *  ici. */

  private cheminAudiosLocaux(): string {
    return join(this.dir, 'audio-locaux.json')
  }

  private lireAudiosLocaux(): Record<string, string> {
    try {
      return JSON.parse(readFileSync(this.cheminAudiosLocaux(), 'utf8')) as Record<string, string>
    } catch {
      return {} // absent/corrompu : aucune association locale
    }
  }

  /** Associe UN FICHIER LOCAL à un entretien, sans copie ni écriture partagée.
   *  Retourne le chemin enregistré (null = source inexistante). */
  associerAudioLocal(id: string, source: string): { audioRef: string } | null {
    const ref = normaliserCheminAudio(source)
    if (!existsSync(ref)) return null
    const locaux = this.lireAudiosLocaux()
    locaux[id] = ref
    writeFileSync(this.cheminAudiosLocaux(), JSON.stringify(locaux, null, 2), 'utf8')
    this.invaliderRefsAudio()
    return { audioRef: ref }
  }

  /** id → chemin EFFECTIF de l'audio sur CE poste, ordre de priorité :
   *  1. la désignation distante dont la copie miroir est présente (vérité
   *     partagée, une fois téléchargée) ;
   *  2. la ref partagée si son fichier existe ici (poste assigneur) ;
   *  3. la retombée locale (`audio-locaux.json`).
   *  Les ids sans aucune piste restent absents de la carte. */
  private audiosResolus(): Map<string, string> {
    const locaux = this.lireAudiosLocaux()
    const distants = this.refsAudioDistants()
    const out = new Map<string, string>()
    for (const [id, ref] of this.refsAudio()) {
      const copie = distants.get(id)
      if (copie && existsSync(join(this.dir, copie.chemin))) {
        out.set(id, join(this.dir, copie.chemin))
        continue
      }
      out.set(id, existsSync(ref) ? ref : locaux[id] ?? ref)
    }
    // Désignation SANS audioRef (création directe en distant) : la seule piste partagée est le fichier serveur.
    // On ne retient que si sa copie est là.
    for (const [id, copie] of distants) {
      if (this.refsAudio().has(id)) continue
      const abs = join(this.dir, copie.chemin)
      if (existsSync(abs)) out.set(id, abs)
    }
    return out
  }

  /** Chemin ABSOLU du PNG waveform d'un entretien, résolu par ID opaque :
   *  l'ID vient de `genId` et mène à `<corpus>/png/<id>.png`.
   *  L'id n'étant jamais un chemin, aucun risque de traversal ;
   *  sert au protocole `sonal-media://waveform/<id>`. */
  cheminWaveform(id: string): string | null {
    // Garde : l'id ne doit pas contenir de séparateur.
    // Defense en profondeur — `genId` produit toujours un id sûr, mais un appelant malveillant pourrait forger.
    if (!id || id.includes(sep) || id.includes('/')) return null
    const abs = join(this.pngDir, `${id}.png`)
    return existsSync(abs) ? abs : null
  }

  /** Chemin ABSOLU d'un audio référencé, pour le protocole `sonal-media://abs/`.
   *  Whitelist stricte : le chemin doit appartenir aux `audioRef` stockées, dans le corpus courant, et exister sur disque.
   *  Jamais de garde par préfixe de dossier :
   *  n'importe quel chemin du disque serait alors serviable au renderer. */
  cheminMediaAbs(p: string): string | null {
    const cible = normalize(p)
    const locaux = this.lireAudiosLocaux()
    const resolus = this.audiosResolus()
    for (const [id, ref] of this.refsAudio()) {
      // La requête porte LA REF PARTAGÉE : servir le fichier EFFECTIF de ce poste,
      // copie miroir d'une désignation ou retombée locale.
      const effectif = resolus.get(id) ?? ref
      if (
        normalize(ref) === cible ||
        normalize(effectif) === cible ||
        (locaux[id] && normalize(locaux[id]) === cible)
      ) {
        return existsSync(effectif) ? effectif : null
      }
    }
    // Désignation sans audioRef : la seule ref stockée est le chemin miroir.
    for (const [id, effectif] of resolus) {
      if (this.refsAudio().has(id)) continue
      if (normalize(effectif) === cible) return existsSync(effectif) ? effectif : null
    }
    return null
  }

  /** Vérifie l'existence des fichiers audio référencés,
   *  pour le contrôle d'intégrité à l'ouverture.
   *  Renvoie 'ok' ou 'manquant' pour chaque entretien à l'`audioRef` non-null ;
   *  sert au bandeau d'intégrité de l'écran Corpus. */
  verifierAudios(): Record<string, 'ok' | 'manquant'> {
    const out: Record<string, 'ok' | 'manquant'> = {}
    for (const [id, ref] of this.audiosResolus()) {
      out[id] = existsSync(ref) ? 'ok' : 'manquant'
    }
    return out
  }

  /** Cache paresseux des `audioRef` (id → chemin absolu) du corpus courant,
   *  calculé à la première utilisation puis invalidé sur mutation.
   *  La passe de lecture est partagée entre `cheminMediaAbs` et `audios()` :
   *  whitelist des chemins d'une part, liste des audios d'autre part. */
  private refsAudio(): Map<string, string> {
    if (this.cacheRefsAudio) return this.cacheRefsAudio
    const out = new Map<string, string>()
    const corpus = this.ouvrir()
    for (const id of Object.keys(corpus.membership)) {
      const f = this.entretienFile(id)
      if (!existsSync(f)) continue
      const data = JSON.parse(readFileSync(f, 'utf8')) as EntretienFichier
      const ref = data.meta?.audioRef
      if (typeof ref === 'string' && ref && isAbsolute(ref)) out.set(id, ref)
    }
    this.cacheRefsAudio = out
    return out
  }

  /** Désignations distantes (id → meta.audioDistant), relues À CHAQUE appel :
   *  contrairement aux `audioRef`, elles arrivent par le PULL du miroir — une
   *  écriture extérieure au store qu'aucun appel métier n'invalide, donc pas
   *  de cache ici (fichiers petits, fréquence faible). */
  private refsAudioDistants(): Map<string, { chemin: string }> {
    const out = new Map<string, { chemin: string }>()
    const corpus = this.ouvrir()
    for (const id of Object.keys(corpus.membership)) {
      const f = this.entretienFile(id)
      if (!existsSync(f)) continue
      try {
        const data = JSON.parse(readFileSync(f, 'utf8')) as EntretienFichier
        const d = data.meta?.audioDistant
        if (d && typeof d.chemin === 'string' && d.chemin) out.set(id, { chemin: d.chemin })
      } catch {
        /* fichier illisible : pas de désignation retenue */
      }
    }
    return out
  }

  /** Invalide le cache `refsAudio` (à appeler sur toute mutation d'`audioRef`). */
  private invaliderRefsAudio(): void {
    this.cacheRefsAudio = null
  }
}

