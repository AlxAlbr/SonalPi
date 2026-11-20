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
import { NOM_FICHIER_CORPUS } from '../shared/fichiersCorpus'
import { verifierVersionNative } from '../shared/versionsNatives'
import { preparerCreationEntretienNatif } from './preparationsNatives'
import { validerLotValeur } from '../shared/corpus/valeursVariables'
import { validerCorpusV2 } from '../shared/ouvertureFichier'
import { ajouterVarianteAnon, type DemandeAjoutVarianteAnon, type ResultatAjoutVarianteAnon } from '../shared/corpus/variantesAnon'
import type { ScanRegle } from '../shared/corpus/scanAnon'
import { appliquerImportCorrespondances, type LigneImportCorrespondance, type ChoixImportCorrespondance } from '../shared/corpus/importCorrespondances'
import { normaliserPseudosDeclares, validerMemoireLocale } from '../shared/entretien/anon/definitionsLocales'
import { appliquerCorrespondancesEntretiens, type CibleImportCorrespondance, type ChoixCibleCorrespondance } from '../shared/corpus/importCorrespondancesEntretiens'
import { empreinteCorrespondance, empreinteDefinitionsCorrespondance } from './tablesCorrespondance'
import type {
  DemandeOperationTheme,
  OptionsExecutionOperationTheme,
  ProgressionOperationTheme,
} from '../shared/corpus/themes'
import { decoderCorpusTheme, OperationsThemesCorpus, validerEntretienTheme, type InstantaneOperationTheme } from './operationsThemes'
import { annulerRefusRapprochementLocuteurs, natureNomLocuteur, refuserRapprochementLocuteurs, reprendreDonneesParticipation } from "../shared/corpus/rapprochementsLocuteurs"
import { fusionnerPersonnes, inventorierPersonnes, creerPersonne, modifierPersonne, trouverLocuteur, lierLocuteur, separerPersonne, supprimerPersonneVide, type InventaireIdentitesLocuteurs } from '../shared/corpus/personnes'
import { appliquerCorrectionLocuteurs } from "../shared/corpus/correctionsLocuteurs"
import { identifierParticipationNommage, rapprocherParticipationsNommage } from '../shared/corpus/nommageLocuteurs'
import { estTypeCorrectionLocuteurs, validerIdentificationLocuteur, validerRapprochementNommage, validerCommandeCorrectionLocuteurs, type DemandeIdentificationLocuteur, type DemandeRapprochementNommage, type CommandeCorrectionLocuteurs, type CommandeLocuteurs, type CommandeRenommageLocuteur } from '../shared/corpus/contratsLocuteurs'
import type { ReferenceParticipation } from '../shared/locuteurs'
import { projeterRepertoireLocuteurs, type VueLocuteursCorpus } from '../shared/corpus/repertoireLocuteurs'
import type { DetailsLocuteurs } from '../shared/corpus/detailsLocuteurs'
import { preparerCorpusImportV1, preparerEntretienImportV1 } from '../shared/natif/importV1'
import {
  memeEtatNote,
  memesChampsEditables,
  trouverNote,
  validerCommandeNotes,
  type CommandeNotes,
  type InventaireNotes,
} from '../shared/corpus/notes'
import { etatNoteJournal, inventorierNotes } from '../shared/corpus/notes'
import { normaliserNotes } from '../shared/entretien/notes'
import { validerCorpusNatif, validerEntretienNatif } from '../shared/natif/validation'
import type { EntreeJournalCorpusVue, ImpactJournalCorpus, ResultatAnnulationCorpus } from '../shared/corpus/journal'
import { appliquerCommandeTraitementsLexico, normaliserTraitementsLexico, type CommandeTraitementsLexico } from '../shared/lexico/traitements'
import type { TraitementsLexico } from '../shared/lexico/types'
import { aplatir, appliquerRegleAnonEntretienAvecBilan, bilanAnonVide } from '../shared/entretien/anon'
import { squeletteCorpus } from '../shared/corpus/squelette'
import {
  ajouterEntretienOrdre,
  appliquerOrdreEntretiens,
  calculerOrdreEntretiens,
  normaliserOrdreEntretiens,
  retirerEntretienOrdre,
} from '../shared/corpus/ordreEntretiens'
import { appliquerCommandeRecueils, normaliserRecueils, type CommandeRecueils } from '../shared/corpus/recueils'
import {
  appliquerCommandeTableauBord,
  normaliserTableauBord,
  tableauBordParDefaut,
  type CommandeTableauBord,
  type TableauBord,
} from '../shared/corpus/tableaubord'
import {
  appliquerCommandeCas,
  normaliserCas, normaliserFamillesCas, normaliserAttributsCas, compterUsagesCasVariable,
  referencesAjouteesCommandeCas,
  retirerRattachementsCasEntretien,
  type CommandeCas,
} from '../shared/corpus/cas'
import {
  analyserImpactSuppressionEntretien,
  memeImpactSuppressionEntretien,
  type ImpactSuppressionEntretien,
} from '../shared/corpus/suppressionEntretien'
import { normaliserReperesPassages, rendreReperesOrphelins } from '../shared/entretien/reperesPassages'
import {
  evaluerDerivationFamille,
  resoudreDerivationCas,
  type LectureSourceAttributs,
} from "../shared/corpus/observationsAttributs"
import {
  TransactionsFichiersCorpus,
  DOSSIER_ARCHIVE_LOCAL,
  choisirDestinationArchiveLocale,
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

/** Les documents sont validés avant écriture ; l'ouverture ne convertit aucun ancien format natif. */

import {
  FORMAT_VERSION,
  versionSupportee,
  type Categorie,
  type CibleValeur,
  type ItemLotValeur,
  type CorpusFichier,
  type EntretienFichier,
  type ResultatMutationAnon,
  type LectureEntretien,
  type ParticipationLocuteur,
  type MarqueurDemo,
  type MatriceCorpus,
  type ModeTriEntretiens,
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
  type ParticipationImport,
  type PayloadImportEntretien,
  type NoteCategory,
  paramsAnonDefaut,
  CORPUS_SUPPRIME,
} from '../shared/format'
import {
  normaliserCategoriesNote,
  notesParRang,
  renumeroterRangs,
  genIdCategorieNote,
  compterUsagesCategorieNote,
  referencesNoteDisponibles,
} from '../shared/entretien/notes'

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

/** Complète les ids sur des copies, sans modifier les sources ni leurs index. */
export function completerIdsLocuteurs(
  entretienId: string,
  locuteurs: ParticipationImport[],
  existants: ParticipationLocuteur[] = [],
): (ParticipationLocuteur & { id: string })[] {
  const idsParIndex = new Map(
    existants
      .filter((locuteur): locuteur is ParticipationLocuteur & { id: string } => Boolean(locuteur.id))
      .map((locuteur) => [locuteur.index, locuteur.id] as const),
  )
  return locuteurs.map((locuteur) => {
    const id = locuteur.id || idsParIndex.get(locuteur.index)
      || idLocuteurHistorique(entretienId, locuteur.index)
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

/** Un store de préparation ne connaît que `corpus.crp` et les sources qu'on
 *  lui a prévues : toute lecture, tout inventaire et toute écriture d'entretien
 *  non prévue y est un défaut, pas une donnée absente. Les lectures
 *  « tolérantes » du store ignorent volontairement un entretien manquant et
 *  concluraient donc à tort à zéro usage ; cette erreur les coupe à la racine. */
export class ErreurCorpusSeul extends Error {
  constructor(id?: string) {
    super(
      id
        ? `La préparation ne peut pas lire l’entretien « ${id} » : il n’est pas une source prévue.`
        : 'Cette préparation ne peut pas lire les entretiens.',
    )
    this.name = 'ErreurCorpusSeul'
  }
}

/** Lit le nom affiché sans initialiser ni modifier le corpus. */
export function lireNomCorpus(dir: string, repli = basename(dir)): string {
  try {
    const corpus: unknown = JSON.parse(readFileSync(join(dir, NOM_FICHIER_CORPUS), 'utf8'))
    validerCorpusV2(corpus)
    return corpus.nom?.trim() || repli
  } catch { return repli }
}

/** Résultat d'une préparation en mémoire, sans modification de la cible. */
export interface PreparationOuvertureCorpus {
  readonly corpus: CorpusFichier
  readonly nouveau: boolean
  readonly contenuCorpusInitial: string | null
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

  private readonly operationsThemes: OperationsThemesCorpus

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

  /** Transport dont le miroir contient les médias ; absent pour un corpus local. */
  fournisseurMiroir?: 'webdav' | 'gitlab'

  /** Préparation d'une transaction de définitions : ce store ne connaît que
   *  `corpus.crp`, et les seuls entretiens qui lui sont confiés comme sources.
   *  Voir `ErreurCorpusSeul`. */
  private sourcesPreparation: Set<string> | null = null
  private inventairePreparationComplet = false

  /** Amorçage encore permis pour CE store ? Vrai à la création (le dossier vient d'être choisi explicitement, neuf ou vide),
   *  puis faux dès qu'un corpus existe.
   *  Si `corpus.crp` disparaît ensuite (dossier supprimé à l'extérieur de l'app), `ouvrir()` lève CORPUS_SUPPRIME au lieu de recréer un corpus fantôme en silence. */
  private amortissable = true

  /** Écriture du corpus accordée pour la durée d'un callback de préparation.
   *  Elle ne porte que sur ce store : le miroir actif n'en profite jamais. */
  private ecritureCorpusAutorisee = false

  private verifierEcriture(): void {
    if (this.ecritureCorpusAutorisee) return
    if (this.lectureSeule) {
      throw new Error(
        'Le corpus partagé n’est pas modifiable directement : la modification passe par une transaction sous droit.',
      )
    }
  }

  /** Branche ce store en mode préparation : il n'inventorie rien de plus que
   *  les sources prévues, et signale toute autre lecture. */
  activerModePreparation(
    sources?: Iterable<string>,
    inventaireComplet = false,
  ): void {
    this.lectureSeule = true
    this.sourcesPreparation = new Set(sources ?? [])
    this.inventairePreparationComplet = inventaireComplet
  }

  /** Accorde l'écriture du corpus le temps d'un callback SYNCHRONE, puis la
   *  révoque. Une continuation asynchrone est refusée : elle survivrait à la
   *  révocation et à la suppression du dossier de préparation. */
  avecEcritureCorpus<T>(operation: () => T): T {
    if (this.ecritureCorpusAutorisee) {
      throw new Error('Une écriture du corpus est déjà en préparation.')
    }
    this.ecritureCorpusAutorisee = true
    try {
      const resultat = operation()
      if (resultat && typeof (resultat as { then?: unknown }).then === 'function') {
        throw new Error('La préparation du corpus doit être synchrone.')
      }
      return resultat
    } finally {
      this.ecritureCorpusAutorisee = false
    }
  }

  private verifierEntretienLisible(id?: string): void {
    const sources = this.sourcesPreparation
    if (sources === null) return
    if (id === undefined && this.inventairePreparationComplet) return
    if (id !== undefined && sources.has(id)) return
    throw new ErreurCorpusSeul(id)
  }

  /** Entretiens en cours d’édition, refusés comme cibles d’un import fermé.
   *  En distant, cette inscription correspond également au verrou de session. */
  private readonly ecrituresAutorisees = new Set<string>()
  private readonly sessionsLocalesFermees = new Set<string>()
  /** Refuse qu'une autosauvegarde retardée rétablisse un nom corrigé dans cette session. */
  private readonly nomsGlobauxSession = new Map<string, Map<string, { locuteurId: string; nom: string }>>()
  private readonly associationsVerifieesSession = new Set<string>()

  exigerSessionLocaleEcriture(id: string): void {
    if (!this.lectureSeule && this.sessionsLocalesFermees.has(id)) throw new Error('La session locale est fermée. Rouvrez l’entretien avant d’enregistrer.')
  }

  autoriserEcritureEntretien(id: string): void {
    this.ecrituresAutorisees.add(id)
    this.sessionsLocalesFermees.delete(id)
  }

  /** Refuse qu’une ancienne sauvegarde rétablisse les noms ou associations corrigés. */
  protegerLocuteursSession(id: string): void {
    const lecture = this.lireEntretien(id)
    if (!lecture.ok) throw new Error('Les locuteurs ne peuvent pas être vérifiés. Rouvrez cet entretien.')
    this.associationsVerifieesSession.add(id)
    this.nomsGlobauxSession.set(id, new Map(lecture.data.participations.flatMap((p) => p.locuteurRef
      ? [[p.id, { locuteurId: p.locuteurRef, nom: p.nom }] as const] : [])))
  }

  revoquerEcritureEntretien(id: string): void {
    this.ecrituresAutorisees.delete(id)
    this.nomsGlobauxSession.delete(id)
    this.associationsVerifieesSession.delete(id)
    if (!this.lectureSeule) this.sessionsLocalesFermees.add(id)
  }

  private verifierEcritureEntretien(id: string): void {
    this.verifierEntretienLisible(id)
    if (this.transactionsFichiers.journalPresent()) throw new Error('Une modification reste à terminer. Rouvrez le corpus avant de modifier un entretien.')
    if (this.sourcesPreparation !== null) {
      // Les sources d'une préparation sont des copies de lecture : jamais des
      // fichiers à modifier, même lorsqu'ils sont prévus.
      throw new ErreurCorpusSeul(id)
    }
    if (!this.lectureSeule) return // corpus local : tout est permis
    if (this.ecrituresAutorisees.has(id)) return // notre verrou tient
    throw new Error(
      `Entretien non modifiable : le verrou n'est pas tenu par cette session${this.ecrituresAutorisees.size ? '' : ''}.`,
    )
  }

  /** Instanciation de la classe CorpusStore avec le chemin du répertoire du corpus */
  constructor(dir: string, strict = false) {
    this.amortissable = !strict
    this.dir = dir
    this.transactionsFichiers = new TransactionsFichiersCorpus(dir)
    this.operationsThemes = new OperationsThemesCorpus({
      lire: () => this.lireInstantaneOperationTheme(),
      appliquer: (plan) => this.appliquerTransactionFichiers(plan),
      verifierEcriture: () => this.verifierEcriture(),
      transactionEnAttente: () => this.transactionsFichiers.journalPresent(),
      genIdCategorie: () => genId('cat'),
    })
  }

  get repertoire(): string { return this.dir }

  /** Exemple : dir = "/home/user/projets/mon_corpus",
    *  corpusFile → "/home/user/projets/mon_corpus/corpus.crp". */
  private get corpusFile() {
    return join(this.dir, NOM_FICHIER_CORPUS)
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

  private ecrireJsonAtomique(fichier: string, obj: unknown): void {
    if (fichier === this.corpusFile) validerCorpusNatif(obj)
    else validerEntretienNatif(obj)
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
      }
    }

    const contenuCorpusInitial = readFileSync(this.corpusFile, 'utf8')
    const corpus = JSON.parse(contenuCorpusInitial) as CorpusFichier
    validerCorpusV2(corpus)
    corpus.locuteurs ??= {}
    corpusModel.normaliserDescriptionsThemes(corpus.codebook)
    if (corpus.cas !== undefined) corpus.cas = normaliserCas(corpus.cas)
    if (corpus.famillesCas !== undefined) corpus.famillesCas = normaliserFamillesCas(corpus.famillesCas)
    if (corpus.attributsCas !== undefined) corpus.attributsCas = normaliserAttributsCas(corpus.attributsCas)
    if (corpus.lexico !== undefined) corpus.lexico = normaliserTraitementsLexico(corpus.lexico)
    normaliserOrdreEntretiens(corpus)
    return {
      corpus,
      nouveau: false,
      contenuCorpusInitial,
    }
  }

  /** Applique une préparation après avoir vérifié que la cible n'a pas changé. */
  finaliserOuverture(preparation: PreparationOuvertureCorpus): CorpusFichier {
    this.verifierDossiersOuverture()
    let cible = preparation
    if (this.transactionsFichiers.reprendre()) {
      this.operationsThemes.vider()
      cible = this.preparerOuverture()
    }
    const contenuActuel = existsSync(this.corpusFile)
      ? readFileSync(this.corpusFile, 'utf8')
      : null
    if (contenuActuel !== cible.contenuCorpusInitial) {
      throw new Error('Le corpus cible a changé pendant la préparation de son ouverture.')
    }
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true })
    if (!existsSync(this.entretiensDir)) mkdirSync(this.entretiensDir, { recursive: true })

    if (cible.nouveau) {
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
    if (typeof nom !== 'string' || !nom.trim()) throw new Error('Le nom du corpus ne peut pas être vide.')
    const corpus = this.ouvrir()
    corpus.nom = nom.trim()
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return corpus
  }

  /** Enregistre l'origine, l'usage et les acquis du corpus exemple.
   *  Le marqueur voyage avec le corpus ; les corpus ordinaires n'en portent pas. */
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
    // En préparation GitLab, le repère doit exister dans la source publiée.
    if (
      this.sourcesPreparation !== null &&
      (commande.type === 'inserer-item' || commande.type === 'modifier-item') &&
      commande.item.type === 'passage' &&
      !this.reperePassageExiste(commande.item.source.entretienId, commande.item.source.repereId)
    ) {
      throw new Error("Le repère du passage n'a pas été enregistré dans l'entretien.")
    }
    const corpus = this.ouvrir()
    corpus.recueils = appliquerCommandeRecueils(corpus.recueils, commande, {
      maintenant: () => new Date().toISOString(),
    })
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return corpus
  }

  /** Applique une édition ciblée de cas après relecture du corpus courant. */
  casCommander(commande: CommandeCas): CorpusFichier {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    for (const reference of referencesAjouteesCommandeCas(commande)) {
      if (!this.reperePassageExiste(reference.entretienId, reference.repereId)) {
        throw new Error("La référence de passage n'existe pas dans l'entretien.")
      }
    }
    if (commande.type === 'ajouter-derivation-famille' || commande.type === 'ajouter-derivation-cas') {
      this.verifierCoherenceDerivation(corpus, commande)
    }
    corpus.famillesCas ??= {}
    corpus.attributsCas ??= {}
    corpus.cas = appliquerCommandeCas(corpus.cas, commande, {
      familles: corpus.famillesCas, attributs: corpus.attributsCas, variables: corpus.variables,
      maintenant: () => new Date().toISOString(),
      locuteurExiste: (personneId) => Object.hasOwn(corpus.locuteurs, personneId),
      entretienExiste: (entretienId) => Object.hasOwn(corpus.membership, entretienId),
    })
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return corpus
  }

  /** Lit toutes les sources du corpus pour recalculer les observations d'attributs. */
  private sourcesObservations(corpus: CorpusFichier): Map<string, LectureSourceAttributs> {
    const sources = new Map<string, LectureSourceAttributs>()
    for (const id of Object.keys(corpus.membership)) {
      const lecture = this.lireEntretien(id)
      sources.set(id, lecture.ok ? { ok: true, data: lecture.data } : { ok: false, raison: lecture.raison })
    }
    return sources
  }

  /** Recontrôle une recette sur les sources fraîches : un conflit ou une
   *  source illisible suspend la dérivation, jamais les cas eux-mêmes. */
  private verifierCoherenceDerivation(corpus: CorpusFichier, commande: CommandeCas): void {
    const sources = this.sourcesObservations(corpus)
    if (commande.type === 'ajouter-derivation-famille') {
      const famille = corpus.famillesCas?.[commande.familleId]
      if (!famille) return
      const evaluation = evaluerDerivationFamille(corpus, famille, commande.derivation, sources)
      if (!evaluation.disponible) {
        throw new Error(`La recette ne peut pas être enregistrée : ${evaluation.problemes.join(' ')}`)
      }
      return
    }
    if (commande.type === 'ajouter-derivation-cas') {
      const cas = corpus.cas?.[commande.casId]
      if (!cas) return
      const diagnostic = resoudreDerivationCas(corpus, cas, commande.derivation, sources)
      if (diagnostic.statut === 'incoherent' || diagnostic.statut === 'non-verifiable') {
        throw new Error(`La recette ne peut pas être enregistrée : ${diagnostic.problemes.join(' ')}`)
      }
    }
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
   *  Refuse tout corpus.crp existant : les définitions ne sont jamais écrasées.
   *  Le main complète ensuite ce store non actif avant d'ouvrir le corpus. */
  preparerMigrationDepuisV1(
    nom: string,
    sourceV1: SourceV1,
    codebook: Categorie[],
    variables: Variable[],
    reglesAnonV1?: RegleAnon[],
    paramsAnon?: ParamsAnon,
    traitementsLexico?: TraitementsLexico,
  ): PreparationOuvertureCorpus {
    this.verifierDossiersOuverture()
    if (existsSync(this.corpusFile)) {
      throw new Error('Le dossier contient déjà un corpus — la garde a été contournée.')
    }
    const corpus = preparerCorpusImportV1(
      nom, sourceV1, codebook, variables, reglesAnonV1, paramsAnon, traitementsLexico,
    )
    return {
      corpus,
      nouveau: true,
      contenuCorpusInitial: null,
    }
  }

  migrerDepuisV1(
    nom: string,
    sourceV1: SourceV1,
    codebook: Categorie[],
    variables: Variable[],
    reglesAnonV1?: RegleAnon[],
    paramsAnon?: ParamsAnon,
    traitementsLexico?: TraitementsLexico,
  ): CorpusFichier {
    const preparation = this.preparerMigrationDepuisV1(
      nom,
      sourceV1,
      codebook,
      variables,
      reglesAnonV1,
      paramsAnon,
      traitementsLexico,
    )
    return this.finaliserOuverture(preparation)
  }

  /** Lit et valide un entretien natif, sans conversion ni écriture. */
  lireEntretien(id: string): LectureEntretien {
    this.verifierEntretienLisible(id)
    const fichier = this.entretienFile(id)
    if (!existsSync(fichier)) return { ok: false, raison: 'absent' }

    return this.adapterEntretienLu(JSON.parse(readFileSync(fichier, 'utf8')) as EntretienFichier)
  }

  private adapterEntretienLu(entretien: EntretienFichier): LectureEntretien {
    try { validerEntretienNatif(entretien) }
    catch { return { ok: false, raison: 'version' } }
    return { ok: true, data: entretien }
  }

  /** Ouvre explicitement une session d'édition locale.
   *  La première écriture qui suit conservera l'état antérieur dans `.bak1`. */
  ouvrirEntretienPourEdition(id: string): LectureEntretien {
    if (!this.lectureSeule && this.transactionsFichiers.journalPresent()) throw new Error('Une transaction reste à reprendre. Rouvrez le corpus avant d’éditer un entretien.')
    const lecture = this.lireEntretien(id)
    if (lecture.ok) {
      this.rotationEnAttente.add(id)
      if (!this.lectureSeule) this.autoriserEcritureEntretien(id)
    }
    return lecture
  }

  /** Écrit un entretien (atomique + rotation `.bak` si 1re écriture de session)
   *  et met à jour le lastModified du membership.
   *  Les données à écrire viennent de la classe PayloadEntretien (shared/format.ts). */
  ecrireEntretien(id: string, payload: PayloadEntretien): string {
    this.verifierEcritureEntretien(id)
    if (payload.pseudosDeclares !== undefined) normaliserPseudosDeclares(payload.pseudosDeclares)
    const definitionsLocales = payload.definitionsAnonLocales === undefined ? undefined : validerMemoireLocale(payload.definitionsAnonLocales)
    if (!existsSync(this.entretiensDir)) mkdirSync(this.entretiensDir, { recursive: true })
    const now = new Date().toISOString()
    const fichier: EntretienFichier = {
      formatVersion: FORMAT_VERSION,
      lastModified: now,
      ...payload,
      ...(definitionsLocales !== undefined ? { definitionsAnonLocales: definitionsLocales } : {}),
      reperesPassages: normaliserReperesPassages(payload.reperesPassages),
    }

    validerEntretienNatif(fichier)
    if (this.associationsVerifieesSession.has(id)) {
      const actuel = this.lireEntretien(id)
      if (!actuel.ok || fichier.participations.some((p) => {
        const enregistre = actuel.data.participations.find((a) => a.id === p.id)
        return enregistre && enregistre.locuteurRef !== p.locuteurRef
      })) throw new Error('Les associations des locuteurs ont changé. Rouvrez cet entretien avant de poursuivre les modifications.')
    }
    const noms = this.nomsGlobauxSession.get(id)
    if (fichier.participations.some((p) => {
      const attendu = noms?.get(p.id)
      return attendu && p.locuteurRef === attendu.locuteurId && p.nom !== attendu.nom
    })) throw new Error('Les noms ont changé dans les entretiens associés. Rouvrez cet entretien avant de les modifier.')
    if (this.rotationEnAttente.has(id)) {
      this.tournerBak(id)
      this.rotationEnAttente.delete(id)
    }
    this.ecrireJsonAtomique(this.entretienFile(id), fichier)

    // Le renderer peut round-triper un `audioRef` modifié ; on invalide le cache.
    // Sécurité : l'invariant « muté uniquement via assignerAudio » est visé.
    this.invaliderRefsAudio()

    // Le membership n'est PAS réécrit ici.
    // En distant, écrire corpus.crp à chaque autosave imposerait de prendre aussi le verrou corpus à chaque fermeture d'entretien.
    // Il n'est écrit que par création, import, renommage ou suppression.
    // Le `lastModified` affiché est dérivé du fichier entretien lui-même.
    return now
  }

  /** Remplace la transcription en préservant les métadonnées et notes de la
   *  version fraîche actuellement stockée. */
  remplacerTranscription(
    id: string,
    transcription: Pick<
      PayloadImportEntretien,
      'corpsTexte' | 'annotations' | 'ancres' | "participations"
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
      participations: completerIdsLocuteurs(id, transcription.participations, data.participations),
      meta: data.meta,
      notes: data.notes,
      reperesPassages: rendreReperesOrphelins(data.reperesPassages),
      brouillonsAnon: data.brouillonsAnon,
      pseudosDeclares: data.pseudosDeclares,
      definitionsAnonLocales: data.definitionsAnonLocales,
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
    return preparerCreationEntretienNatif(this.ouvrir(), genIdEntretien(titre), titre, new Date().toISOString())
  }

  /** Crée un entretien vide dans une transaction locale reprise au prochain démarrage. */
  creerEntretienVide(titre: string): { id: string; corpus: CorpusFichier } {
    this.verifierEcriture()
    const plan = this.preparerCreationEntretienVide(titre)
    this.appliquerTransactionFichiers(plan)
    return { id: plan.id, corpus: plan.corpusApres }
  }

  /** Prépare un import et ses identités V1 éventuelles dans une seule transaction. */
  preparerImportEntretien(
    titre: string,
    payload: PayloadImportEntretien,
    codebook: Categorie[] = [],
    variables: Variable[] = [],
    reglesAnon: RegleAnon[] = [],
    origine?: 'v1',
  ): PlanAjoutEntretien {
    if (payload.pseudosDeclares !== undefined) normaliserPseudosDeclares(payload.pseudosDeclares)
    const definitionsLocales = payload.definitionsAnonLocales === undefined ? undefined : validerMemoireLocale(payload.definitionsAnonLocales)
    const corpusAvant = this.ouvrir()
    const corpusApres = structuredClone(corpusAvant)
    const id = genIdEntretien(titre)
    const now = new Date().toISOString()
    const importe = {
      ...payload,
      ...(definitionsLocales !== undefined ? { definitionsAnonLocales: definitionsLocales } : {}),
      reperesPassages: normaliserReperesPassages(payload.reperesPassages),
      participations: completerIdsLocuteurs(id, payload.participations),
    }
    if (origine === 'v1') {
      const preparation = preparerEntretienImportV1(corpusApres.locuteurs, importe, now, () => genId('pers'))
      for (const identite of preparation.locuteurs) corpusApres.locuteurs[identite.id] = identite
      importe.participations = preparation.entretien.participations
    }
    const entretien: EntretienFichier = { formatVersion: FORMAT_VERSION, lastModified: now, ...importe }
    corpusModel.fusionnerImport(corpusApres, codebook, variables)
    corpusModel.fusionnerReglesAnon(corpusApres, reglesAnon)
    ajouterEntretienOrdre(corpusApres, id, { titre, date: null, lastModified: now })
    return { operation: 'ajout', id, corpusAvant, corpusApres, entretien }
  }

  /** Le parsing du fichier se fait dans sas.ts (importerFichier) ;
   *  ici, on crée l'entretien et fusionne ses métadonnées sous transaction. */
  importerEntretien(
    titre: string,
    payload: PayloadImportEntretien,
    codebook: Categorie[] = [],
    variables: Variable[] = [],
    reglesAnon: RegleAnon[] = [],
    origine?: 'v1',
  ): { id: string; corpus: CorpusFichier } {
    this.verifierEcriture()
    const plan = this.preparerImportEntretien(titre, payload, codebook, variables, reglesAnon, origine)
    this.appliquerTransactionFichiers(plan)
    return { id: plan.id, corpus: plan.corpusApres }
  }

  /** Trie les entretiens et ne lit leur contenu que si le critère l'exige. */
  trierEntretiens(mode: ModeTriEntretiens): CorpusFichier {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    let entretiens: Map<string, EntretienFichier> | undefined
    if (mode === 'modif' || mode === 'longueur') {
      entretiens = new Map()
      for (const id of corpus.ordreEntretiens!) {
        const lecture = this.lireEntretien(id)
        if (!lecture.ok) {
          throw new Error(`L’entretien « ${corpus.membership[id].titre} » ne peut pas être lu.`)
        }
        entretiens.set(id, lecture.data)
      }
    }
    return this.trierEntretiensAvecContenus(mode, entretiens)
  }

  /** Applique un tri à partir de contenus déjà validés par l'appelant. */
  trierEntretiensAvecContenus(
    mode: ModeTriEntretiens,
    entretiens?: ReadonlyMap<string, EntretienFichier>,
  ): CorpusFichier {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    const ordre = calculerOrdreEntretiens(corpus, mode, entretiens)
    appliquerOrdreEntretiens(corpus, ordre)
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return corpus
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

  /** Analyse les références concernées sans verrou durable ni écriture. */
  analyserSuppressionEntretien(id: string): ImpactSuppressionEntretien {
    const corpus = this.ouvrir()
    if (!corpus.membership[id]) throw new Error("Cet entretien n'existe plus.")
    return analyserImpactSuppressionEntretien(corpus, id)
  }

  /** Prépare le retrait métier du membership, sans toucher aux fichiers.
   *
   *  C'est la moitié de la suppression qui décide d'un commit : elle se calcule
   *  sur la base réellement publiée, dans le store qui la porte. L'autre moitié,
   *  l'archivage des sauvegardes et des PNG, est un inventaire local et ne
   *  décide jamais du dépôt distant. */
  preparerRetraitEntretien(
    id: string,
    impactAttendu?: ImpactSuppressionEntretien,
  ): { corpusAvant: CorpusFichier; corpusApres: CorpusFichier; impact: ImpactSuppressionEntretien } {
    const corpusAvant = this.ouvrir()
    if (!corpusAvant.membership[id]) throw new Error("Cet entretien n'existe plus.")
    const impactCourant = analyserImpactSuppressionEntretien(corpusAvant, id)
    if ((impactCourant.passagesRecueils || impactCourant.rattachementsCas || impactCourant.casReglesEntretien) && !impactAttendu) {
      throw new Error('Confirmez la suppression après avoir consulté les références concernées.')
    }
    if (impactAttendu && !memeImpactSuppressionEntretien(impactAttendu, impactCourant)) {
      throw new Error('Les références de cet entretien ont changé. Vérifiez-les avant de confirmer à nouveau.')
    }

    const corpusApres = structuredClone(corpusAvant)
    const retrait = retirerRattachementsCasEntretien(
      corpusApres.cas,
      id,
      new Date().toISOString(),
    )
    if (retrait.casAffectes !== impactCourant.casAffectes
      || retrait.rattachementsRetires !== impactCourant.rattachementsCas) {
      throw new Error("L'impact de la suppression n'a pas pu être vérifié.")
    }
    retirerEntretienOrdre(corpusApres, id)
    return { corpusAvant, corpusApres, impact: impactCourant }
  }

  /** Prépare le retrait du membership et l'archivage des fichiers sans écriture.
   *
   *  `choisirDestination` permet de fixer les noms d'archive avant l'envoi
   *  distant : un redémarrage ne les tire plus au hasard, et une collision
   *  constatée plus tard se signale au lieu d'écraser. */
  preparerSuppressionEntretien(
    id: string,
    impactAttendu?: ImpactSuppressionEntretien,
    choisirDestination: (nom: string) => string = (nom) => this.destinationCorbeille(nom),
  ): PlanSuppressionEntretien {
    this.verifierEntretienLisible(id)
    const { corpusAvant, corpusApres } = this.preparerRetraitEntretien(id, impactAttendu)
    return {
      operation: 'suppression',
      id,
      corpusAvant,
      corpusApres,
      deplacements: this.inventorierFichiersSuppression(id, choisirDestination),
    }
  }

  /** Fichiers locaux à archiver : l'entretien, ses deux sauvegardes et les PNG
   *  qui portent son identifiant. Les médias référencés ne sont pas touchés :
   *  ils vivent hors du corpus et restent en place. */
  inventorierFichiersSuppression(
    id: string,
    choisirDestination: (nom: string) => string = (nom) => this.destinationCorbeille(nom),
  ): PlanSuppressionEntretien['deplacements'] {
    const deplacements: PlanSuppressionEntretien['deplacements'] = []
    for (const suffixe of ['.json', '.json.bak1', '.json.bak2']) {
      const nom = id + suffixe
      if (existsSync(join(this.entretiensDir, nom))) {
        deplacements.push({
          source: join('entretiens', nom),
          destination: choisirDestination(nom),
        })
      }
    }
    if (existsSync(this.pngDir)) {
      for (const nom of readdirSync(this.pngDir)) {
        if (nom.startsWith(id + '.')) {
          deplacements.push({
            source: join('png', nom),
            destination: choisirDestination(nom),
          })
        }
      }
    }
    return deplacements
  }

  /** Retire le membership avant d'archiver les fichiers, sous journal récupérable.
   *  L'audio référencé reste externe au corpus et n'est jamais touché. */
  supprimerEntretien(id: string, impactAttendu?: ImpactSuppressionEntretien): CorpusFichier {
    this.verifierEcriture()
    const plan = this.preparerSuppressionEntretien(id, impactAttendu)
    this.appliquerTransactionFichiers(plan)
    return plan.corpusApres
  }

  /** Applique un plan localement après une transaction locale ou un commit distant confirmé. */
  appliquerTransactionFichiers(plan: PlanTransactionFichiers): void {
    if (this.sourcesPreparation !== null) {
      throw new ErreurCorpusSeul(
        plan.operation === 'remplacement' ? plan.entretiens[0]?.id : plan.id,
      )
    }
    this.transactionsFichiers.executer(plan)
    this.invaliderRefsAudio()
  }

  /** Termine l'éventuelle intention durable laissée par un arrêt précédent. */
  reprendreTransactionFichiers(): boolean {
    const reprise = this.transactionsFichiers.reprendre()
    if (reprise) {
      this.invaliderRefsAudio()
      this.operationsThemes.vider()
    }
    return reprise
  }

  private destinationCorbeille(nom: string): string {
    const destination = join(DOSSIER_ARCHIVE_LOCAL, nom)
    if (!existsSync(join(this.dir, destination))) return destination
    return join(DOSSIER_ARCHIVE_LOCAL, `${nom}.copie-${Math.random().toString(36).slice(2, 10)}`)
  }

  /** Archive locale d'un fichier, avec un nom stable et sans écrasement.
   *  Une suppression distante s'en sert pour que son plan, rejoué après un
   *  arrêt, retrouve exactement les mêmes destinations. */
  destinationArchive(nomFichier: string, suffixe: string): string {
    return choisirDestinationArchiveLocale(
      nomFichier,
      suffixe,
      (chemin) => existsSync(join(this.dir, chemin)),
    )
  }

  analyserOperationTheme(demande: DemandeOperationTheme, operationPrecedente?: string) {
    return this.operationsThemes.analyser(demande, operationPrecedente)
  }

  detailsOperationTheme(operationId: string, entretienId: string) {
    return this.operationsThemes.details(operationId, entretienId)
  }

  executerOperationTheme(
    operationId: string,
    demande: DemandeOperationTheme,
    options: OptionsExecutionOperationTheme,
    progression?: (etat: ProgressionOperationTheme) => void,
  ) {
    return this.operationsThemes.executer(operationId, demande, options, progression)
  }

  viderApercusOperationTheme(): void {
    this.operationsThemes.vider()
  }

  /** Adapte une lecture fournie en mémoire, sans lire ni écrire le miroir. */
  adapterEntretienOperationTheme(avant: EntretienFichier): EntretienFichier {
    const lecture = this.adapterEntretienLu(structuredClone(avant))
    if (!lecture.ok) throw new Error('Version d’entretien non supportée.')
    validerEntretienTheme(lecture.data)
    return lecture.data
  }

  /** Inventaire strict sans migration sur disque ni ouverture de session. */
  private lireInstantaneOperationTheme(limiteOctets?: number): InstantaneOperationTheme {
    this.verifierEntretienLisible()
    if (!existsSync(this.corpusFile)) {
      throw new Error(this.amortissable
        ? 'Ouvrez le corpus avant de préparer une opération sur les thématiques.'
        : `${CORPUS_SUPPRIME}: le fichier corpus.crp courant a été supprimé.`)
    }
    let octets = 0
    const lire = (fichier: string): string => {
      if (limiteOctets !== undefined && octets + statSync(fichier).size > limiteOctets) throw new Error('L’inventaire dépasse sa limite de lecture.')
      const contenu = readFileSync(fichier, 'utf8')
      octets += Buffer.byteLength(contenu)
      if (limiteOctets !== undefined && octets > limiteOctets) throw new Error('L’inventaire dépasse sa limite de lecture.')
      return contenu
    }
    const corpus = decoderCorpusTheme(lire(this.corpusFile))
    const entretiens: InstantaneOperationTheme['entretiens'] = []
    for (const [id, ref] of Object.entries(corpus.membership)) {
      const titre = ref?.titre ?? id
      try {
        if (!id || id === '.' || id === '..' || /[/\\\\\0]/.test(id)) {
          throw new Error('Identifiant d’entretien invalide dans le membership.')
        }
        const fichier = this.entretienFile(id)
        if (!existsSync(fichier)) throw new Error('Fichier d’entretien absent.')
        const avant = JSON.parse(lire(fichier)) as EntretienFichier
        const data = this.adapterEntretienOperationTheme(avant)
        entretiens.push({ id, titre, ok: true, avant, data })
      } catch (erreur) {
        entretiens.push({ id, titre, ok: false, motif: erreur instanceof Error ? erreur.message : String(erreur) })
      }
    }
    return { corpus, entretiens }
  }

  /** Lit sur disque les fichiers dont les ids sont dans le membership.
   *  C'est ce qu'utilisent toutes les requêtes analytiques (usages de thèmes,
   *  matrice corpus…). Si un fichier est manquant, on le passe silencieusement. */
  private chargerEntretiens(): corpusModel.EntreeMatrice[] {
    this.verifierEntretienLisible()
    const corpus = this.ouvrir()
    const out: corpusModel.EntreeMatrice[] = []
    for (const [id, ref] of Object.entries(corpus.membership)) {
      const f = this.entretienFile(id)
      if (!existsSync(f)) continue
      const data: unknown = JSON.parse(readFileSync(f, 'utf8'))
      validerEntretienNatif(data)
      out.push({ id, titre: ref.titre, data })
    }
    return out
  }
  private datas(): EntretienFichier[] {
    return this.chargerEntretiens().map((e) => e.data)
  }

  /** Inventaire tolérant : les entretiens illisibles restent signalés. */
  notesInventaire(): InventaireNotes {
    this.verifierEntretienLisible()
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
    return { ...inventorierNotes(entretiens), indisponibles }
  }

  /** Lit les participations sans modifier les fichiers et signale les sources indisponibles. */
  private lireSourcesPersonnes() {
    this.verifierEntretienLisible()
    const corpus = this.ouvrir()
    const entretiens: corpusModel.EntreeMatrice[] = []
    const indisponibles: InventaireIdentitesLocuteurs['indisponibles'] = []
    for (const [id, ref] of Object.entries(corpus.membership)) {
      try {
        const lecture = this.lireEntretien(id)
        if (!lecture.ok) throw new Error(lecture.raison === 'absent' ? 'Fichier absent' : 'Version non supportée')
        entretiens.push({ id, titre: ref.titre, data: lecture.data })
      } catch (erreur) {
        indisponibles.push({ id, titre: ref.titre, raison: erreur instanceof Error ? erreur.message : String(erreur) })
      }
    }
    return { corpus, entretiens, indisponibles }
  }

  /** Inventaire tolérant : les entretiens illisibles restent signalés. */
  personnesInventaire(): InventaireIdentitesLocuteurs {
    const { corpus, entretiens, indisponibles } = this.lireSourcesPersonnes()
    return { ...inventorierPersonnes(corpus, entretiens), indisponibles }
  }

  /** Lit les détails et leurs définitions dans le même contexte, sans modifier les sources. */
  detailsLocuteursInventaire(): DetailsLocuteurs {
    const { corpus, entretiens, indisponibles } = this.lireSourcesPersonnes()
    return {
      inventaire: { ...inventorierPersonnes(corpus, entretiens), indisponibles },
      variables: Object.values(corpus.variables),
      categories: normaliserCategoriesNote(corpus.categoriesNote),
    }
  }

  /** Projette la liste et les interventions sans transmettre les textes à l’interface. */
  locuteursInventaire(): VueLocuteursCorpus {
    const { corpus, entretiens, indisponibles } = this.lireSourcesPersonnes()
    const projection = projeterRepertoireLocuteurs(corpus.locuteurs, entretiens.map((entretien) => ({
      id: entretien.id,
      titre: entretien.titre,
      corpsTexte: entretien.data.corpsTexte,
      participations: entretien.data.participations.map((participation) => ({
        id: participation.id!, index: participation.index, nom: participation.nom,
        locuteurRef: participation.locuteurRef, interviewer: participation.interviewer,
      })),
    })))
    return { ...projection, indisponibles: [...indisponibles, ...projection.indisponibles] }
  }

  private etatLienJournal(locuteur: ParticipationLocuteur): EtatLienJournalCorpus {
    return {
      locuteurRef: locuteur.locuteurRef,
      ...(locuteur.associationRetiree === undefined ? {} : { associationRetiree: locuteur.associationRetiree }),
    }
  }

  private etatRefusJournal(locuteur: ParticipationLocuteur): EtatRefusJournalCorpus {
    return locuteur.rapprochementsRefuses === undefined
      ? {}
      : { rapprochementsRefuses: [...locuteur.rapprochementsRefuses] }
  }

  private memeEtatJournal(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b)
  }

  private lireLocuteurJournal(entretienId: string, locuteurId: string):
    | { ok: true; data: EntretienFichier; locuteur: ParticipationLocuteur }
    | { ok: false; raison: 'entretien' | 'locuteur' } {
    const lecture = this.lireEntretien(entretienId)
    if (!lecture.ok) return { ok: false, raison: 'entretien' }
    const locuteur = lecture.data.participations.find((candidat) => candidat.id === locuteurId)
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
      const personne = this.ouvrir().locuteurs[inverse.personneId]
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
      if (!referencesNoteDisponibles(inverse.note, lecture.data.participations)) {
        return { etat: 'inapplicable', raison: 'Un locuteur concerné par la note n’existe plus dans cet entretien.' }
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
          lecture.locuteur.locuteurRef = inverse.avant.locuteurRef
          if (inverse.avant.associationRetiree === undefined) delete lecture.locuteur.associationRetiree
          else lecture.locuteur.associationRetiree = inverse.avant.associationRetiree
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
    validerCommandeNotes(commande)
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
          { corpus: false, entretiens: [commande.entretienId], projections: ['notes', "locuteurs"] },
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
        { corpus: false, entretiens: [commande.entretienId], projections: ['notes', "locuteurs"] },
      )
    }
    return null
  }

  /** Enregistre la correction en une transaction ; les autres sessions d’édition restent interdites. */
  private corrigerLocuteurs(commande: CommandeCorrectionLocuteurs, entretienAutorise?: string): string {
    validerCommandeCorrectionLocuteurs(commande)
    if (this.sourcesPreparation !== null) {
      throw new Error('Ces corrections ne sont pas encore disponibles dans les corpus distants.')
    }
    if (this.transactionsFichiers.journalPresent()) {
      throw new Error('Une modification reste à terminer. Rouvrez le corpus avant de corriger les locuteurs.')
    }
    if ([...this.ecrituresAutorisees].some((id) => id !== entretienAutorise)) {
      throw new Error('Fermez les entretiens en édition avant de corriger les locuteurs du corpus.')
    }
    const inventaire = this.personnesInventaire()
    if (inventaire.indisponibles.length) {
      throw new Error('Correction impossible : certains entretiens sont illisibles.')
    }
    if (JSON.stringify(inventaire) !== commande.attendu) {
      throw new Error('Les locuteurs ou les entretiens ont changé. Actualisez puis vérifiez à nouveau la correction.')
    }
    const corpusAvant = JSON.parse(readFileSync(this.corpusFile, 'utf8')) as CorpusFichier
    const corpus = structuredClone(this.ouvrir())
    const fichiers = Object.entries(corpus.membership).map(([id, ref]) => {
      const avant = JSON.parse(readFileSync(this.entretienFile(id), 'utf8')) as EntretienFichier
      const lecture = this.lireEntretien(id)
      if (!lecture.ok) throw new Error(`Entretien indisponible : ${ref.titre}`)
      const apres = lecture.data
      return { id, titre: ref.titre, avant, apres, initial: JSON.stringify(apres) }
    })
    if (commande.type === 'reprendreInformations' && commande.choix.variables.some((id) => !Object.hasOwn(corpus.variables, id) || corpus.variables[id].portee !== 'participation')) {
      throw new Error('La définition de ces données a changé. Actualisez les détails avant de reprendre les informations.')
    }
    const locuteurId = appliquerCorrectionLocuteurs(
      corpus,
      fichiers.map((fichier) => ({ id: fichier.id, titre: fichier.titre, data: fichier.apres })),
      commande,
      () => genId('pers'),
    )
    const modifies = fichiers.filter((fichier) => fichier.initial !== JSON.stringify(fichier.apres))
    const now = new Date().toISOString()
    for (const fichier of modifies) {
      fichier.apres.lastModified = now
      corpus.membership[fichier.id].lastModified = now
    }
    this.appliquerTransactionFichiers({
      operation: 'remplacement',
      id: genId('locuteurs'),
      corpusAvant,
      corpusApres: corpus,
      entretiens: modifies.map(({ id, avant, apres }) => ({ id, avant, apres })),
      ordre: commande.type === 'dissocierSelection' || commande.type === 'individualiserSelection' ? 'corpus-puis-entretiens' : 'entretiens-puis-corpus',
    })
    return locuteurId
  }

  private verifierSessionNommage(reference: ReferenceParticipation): void {
    this.verifierEcriture()
    if (!reference || typeof reference.entretienId !== 'string' || !reference.entretienId.trim()
      || typeof reference.participationId !== 'string' || !reference.participationId.trim()
      || !this.ecrituresAutorisees.has(reference.entretienId)) throw new Error('Rouvrez cet entretien avant de modifier ses locuteurs.')
    if (this.sourcesPreparation !== null) throw new Error('La création au nommage est disponible uniquement en local.')
    if (this.transactionsFichiers.journalPresent()) throw new Error('Une modification reste à terminer. Rouvrez le corpus.')
    if ([...this.ecrituresAutorisees].some((id) => id !== reference.entretienId)) throw new Error('Fermez les autres entretiens en édition avant de modifier ces associations.')
  }

  /** Enregistre ensemble les identités et leurs associations, sans remplacer les autres données. */
  private modifierAssociationsSession(
    reference: ReferenceParticipation,
    ids: readonly string[],
    ordre: 'corpus-puis-entretiens' | 'entretiens-puis-corpus',
    modifier: (corpus: CorpusFichier, fichiers: { id: string; titre: string; data: EntretienFichier }[]) => void,
    attendu?: string,
  ): EntretienFichier {
    const corpusAvant = JSON.parse(readFileSync(this.corpusFile, 'utf8')) as CorpusFichier
    const corpus = structuredClone(this.ouvrir())
    const fichiers = ids.map((id) => {
      if (!Object.hasOwn(corpus.membership, id)) throw new Error('Cet entretien ne fait plus partie du corpus.')
      const lecture = this.lireEntretien(id)
      if (!lecture.ok) throw new Error('Cet entretien est indisponible.')
      return { id, titre: corpus.membership[id].titre, avant: lecture.data, data: structuredClone(lecture.data) }
    })
    modifier(corpus, fichiers)
    if (attendu !== undefined && JSON.stringify(this.personnesInventaire()) !== attendu) throw new Error('Les locuteurs ou leurs données ont changé. Rouvrez le dialogue avant de confirmer.')
    const modifies = fichiers.filter((f) => JSON.stringify(f.avant) !== JSON.stringify(f.data))
    const now = new Date().toISOString()
    for (const f of modifies) { f.data.lastModified = now; corpus.membership[f.id].lastModified = now }
    if (modifies.length || JSON.stringify(corpusAvant) !== JSON.stringify(corpus)) {
      this.associationsVerifieesSession.add(reference.entretienId)
      this.appliquerTransactionFichiers({ operation: 'remplacement', id: genId('nommage'), corpusAvant, corpusApres: corpus,
        entretiens: modifies.map((f) => ({ id: f.id, avant: f.avant, apres: f.data })), ordre })
    }
    const relecture = this.lireEntretien(reference.entretienId)
    if (!relecture.ok) throw new Error('Les locuteurs ont été enregistrés mais leur relecture a échoué. Rouvrez le corpus.')
    const noms = this.nomsGlobauxSession.get(reference.entretienId) ?? new Map<string, { locuteurId: string; nom: string }>()
    for (const p of relecture.data.participations) if (p.locuteurRef) noms.set(p.id, { locuteurId: p.locuteurRef, nom: p.nom })
    this.nomsGlobauxSession.set(reference.entretienId, noms)
    return relecture.data
  }

  /** Une répétition du même nommage retrouve l'identité enregistrée au lieu d'en créer une autre. */
  identifierParticipationAuNommage(demande: DemandeIdentificationLocuteur): EntretienFichier {
    this.verifierSessionNommage(demande)
    validerIdentificationLocuteur(demande)
    return this.modifierAssociationsSession(demande, [demande.entretienId], 'corpus-puis-entretiens', (corpus, fichiers) => {
      identifierParticipationNommage(corpus, fichiers[0].data, demande, () => genId('pers'))
      this.associationsVerifieesSession.add(demande.entretienId)
    })
  }

  /** Réunit les identités seulement après le choix explicite d'une proposition fraîche. */
  rapprocherLocuteurDepuisEntretien(demande: DemandeRapprochementNommage): EntretienFichier {
    validerRapprochementNommage(demande)
    this.verifierSessionNommage(demande)
    const inventaire = this.personnesInventaire()
    if (inventaire.indisponibles.length || JSON.stringify(inventaire) !== demande.attendu) throw new Error('Les locuteurs ou leurs données ont changé. Rouvrez le dialogue avant de confirmer.')
    return this.modifierAssociationsSession(demande, Object.keys(this.ouvrir().membership), 'entretiens-puis-corpus', (corpus, fichiers) => {
      rapprocherParticipationsNommage(corpus, fichiers, demande)
    }, demande.attendu)
  }

  /** Renomme depuis la seule session locale ouverte, après sauvegarde et confirmation. */
  renommerLocuteurDepuisEntretien(reference: ReferenceParticipation, commande: CommandeRenommageLocuteur): EntretienFichier {
    this.verifierEcriture()
    validerCommandeCorrectionLocuteurs(commande)
    if (commande.type !== 'renommerGlobal' || !reference || typeof reference.entretienId !== 'string'
      || typeof reference.participationId !== 'string' || !this.ecrituresAutorisees.has(reference.entretienId)) {
      throw new Error('Rouvrez cet entretien avant de renommer le locuteur.')
    }
    const lecture = this.lireEntretien(reference.entretienId)
    if (!lecture.ok || lecture.data.participations.find((p) => p.id === reference.participationId)?.locuteurRef !== commande.locuteurId) {
      throw new Error('Le locuteur ou son association a changé. Rouvrez l’aperçu.')
    }
    this.corrigerLocuteurs(commande, reference.entretienId)
    const apres = this.lireEntretien(reference.entretienId)
    if (!apres.ok) throw new Error('Les noms ont été enregistrés mais leur relecture a échoué. Rouvrez le corpus.')
    const noms = this.nomsGlobauxSession.get(reference.entretienId) ?? new Map<string, { locuteurId: string; nom: string }>()
    for (const p of apres.data.participations) if (p.locuteurRef === commande.locuteurId) noms.set(p.id, { locuteurId: commande.locuteurId, nom: p.nom })
    this.nomsGlobauxSession.set(reference.entretienId, noms)
    return apres.data
  }

  /** Applique les corrections locales des identités et des associations. */
  personnesCommander(
    commande: CommandeLocuteurs,
    journaliser = false,
    autoriserRefusComposite = true,
    autoriserRapprochementComposite = true,
  ): string | null {
    this.verifierEcriture()
    if (estTypeCorrectionLocuteurs(commande.type)) {
      validerCommandeCorrectionLocuteurs(commande)
      return this.corrigerLocuteurs(commande)
    }
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
        return { id, titre: ref.titre, avant, apres, initial: JSON.stringify(apres) }
      })
      const entretiens = fichiers.map(e => ({ id: e.id, titre: e.titre, data: e.apres }))
      if (commande.reprise) {
        const r = commande.reprise
        const cibleData = entretiens.find(e => e.id === r.entretienId)?.data
        const sourceData = entretiens.find(e => e.id === r.sourceEntretienId)?.data
        if (!cibleData || !sourceData || r.entretienId === r.sourceEntretienId) throw new Error('Source de reprise invalide.')
        const cible = trouverLocuteur(cibleData, r.participationId)
        const source = trouverLocuteur(sourceData, r.sourceParticipationId)
        if (![commande.conserverId, commande.absorberId].includes(cible.locuteurRef ?? '')
          || ![commande.conserverId, commande.absorberId].includes(source.locuteurRef ?? '')
          || cible.locuteurRef === source.locuteurRef) throw new Error('Les associations de la reprise ont changé.')
        reprendreDonneesParticipation(cible, source, r.choix)
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
        return { id, titre: ref.titre, avant, apres, initial: JSON.stringify(apres) }
      })
      const entretiens = fichiers.map((fichier) => ({ id: fichier.id, titre: fichier.titre, data: fichier.apres }))
      const personneId = genId('pers')
      separerPersonne(corpus, entretiens, commande.locuteurId, personneId, commande.nom, commande.participations)
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
      const avant = corpus.locuteurs[commande.locuteurId]?.nom
      modifierPersonne(corpus, commande.locuteurId, commande.nom)
      const apres = corpus.locuteurs[commande.locuteurId].nom
      this.ecrireJsonAtomique(this.corpusFile, corpus)
      if (journaliser && avant !== undefined && avant !== apres) {
        this.journalCorpus.enregistrer(
          `Personne renommée : ${avant} → ${apres}`,
          "locuteurs",
          { type: 'personneRenommer', personneId: commande.locuteurId, avant, apres },
          { corpus: true, entretiens: [], projections: ["locuteurs"] },
        )
      }
      return commande.locuteurId
    }
    if (commande.type === 'supprimer') {
      supprimerPersonneVide(corpus, this.personnesInventaire(), commande.locuteurId)
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
        return lecture.data
      }
      const enregistrer = (id: string, data: EntretienFichier) => {
        const { formatVersion: _v, lastModified: _d, ...payload } = data
        this.ecrireEntretien(id, payload)
      }
      const data = charger(commande.entretienId)
      const cible = trouverLocuteur(data, commande.participationId)
      if (commande.type === 'annulerRefus') {
        const avant = this.etatRefusJournal(cible)
        annulerRefusRapprochementLocuteurs(cible, commande.cible)
        const apres = this.etatRefusJournal(cible)
        enregistrer(commande.entretienId, data)
        if (journaliser && !this.memeEtatJournal(avant, apres)) {
          this.journalCorpus.enregistrer(
            `Décision de rapprochement rétablie pour « ${cible.nom} »`,
            "locuteurs",
            { type: 'personneRefus', entretienId: commande.entretienId, locuteurId: commande.participationId, avant, apres },
            { corpus: false, entretiens: [commande.entretienId], projections: ["locuteurs"] },
          )
        }
        return cible.locuteurRef
      }
      if (commande.sourceEntretienId === commande.entretienId) throw new Error('Choisissez un autre entretien.')
      const sourceData = charger(commande.sourceEntretienId)
      const source = trouverLocuteur(sourceData, commande.sourceParticipationId)
      if (commande.type === 'rapprocher' && !autoriserRapprochementComposite
        && (!source.locuteurRef || cible.locuteurRef)) {
        throw new Error('Ce rapprochement doit créer ou modifier plusieurs associations. Cette correction composite n’est pas encore disponible dans les corpus distants.')
      }
      if (commande.type === 'refuser') {
        const creerIdentite = !cible.locuteurRef && !cible.associationRetiree && natureNomLocuteur(cible.nom) === 'specifique'
        if (creerIdentite && !autoriserRefusComposite) {
          throw new Error('Cette décision doit aussi créer une personne distincte. Cette correction composite n’est pas encore disponible dans les corpus distants.')
        }
        const avant = this.etatRefusJournal(cible)
        refuserRapprochementLocuteurs(cible, { entretienId: commande.sourceEntretienId, participation: source })
        const apres = this.etatRefusJournal(cible)
        if (creerIdentite) {
          const id = creerPersonne(corpus, genId('pers'), cible.nom).id
          lierLocuteur(corpus, data, commande.participationId, id)
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
            "locuteurs",
            { type: 'personneRefus', entretienId: commande.entretienId, locuteurId: commande.participationId, avant, apres },
            { corpus: false, entretiens: [commande.entretienId], projections: ["locuteurs"] },
          )
        }
        return cible.locuteurRef
      }
      if (source.locuteurRef && cible.locuteurRef && source.locuteurRef !== cible.locuteurRef) {
        throw new Error('Ces locuteurs sont associés à deux personnes distinctes. Réunissez-les, ou modifiez uniquement l’association du locuteur concerné.')
      }
      const id = source.locuteurRef ?? cible.locuteurRef ?? genId('pers')
      if (!corpus.locuteurs[id]) creerPersonne(corpus, id, source.nom)
      lierLocuteur(corpus, data, commande.participationId, id)
      if (commande.reprise) reprendreDonneesParticipation(cible, source, commande.reprise)
      if (!source.locuteurRef) {
        lierLocuteur(corpus, sourceData, commande.sourceParticipationId, id)
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
    const locuteur = trouverLocuteur(data, commande.participationId)
    const avantLien = this.etatLienJournal(locuteur)
    let personneId: string | null
    if (commande.type === 'creer') {
      if (locuteur.locuteurRef) throw new Error('Déliez ce locuteur avant de créer une nouvelle personne.')
      personneId = creerPersonne(corpus, genId('pers'), commande.nom).id
    } else {
      personneId = commande.locuteurId
    }
    lierLocuteur(corpus, data, commande.participationId, personneId)
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
        const nomAvant = avantLien.locuteurRef
          ? corpus.locuteurs[avantLien.locuteurRef]?.nom ?? 'un locuteur absent'
          : null
        const nomApres = apresLien.locuteurRef
          ? corpus.locuteurs[apresLien.locuteurRef]?.nom ?? 'un locuteur absent'
          : null
        const libelle = nomAvant && nomApres
          ? `Association déplacée : ${nomAvant} → ${nomApres}`
          : nomApres
            ? `Locuteur associé à ${nomApres}`
            : `Locuteur dissocié de ${nomAvant ?? 'sa personne'}`
        this.journalCorpus.enregistrer(
          libelle,
          "locuteurs",
          { type: 'personneLier', entretienId: commande.entretienId, locuteurId: commande.participationId, avant: avantLien, apres: apresLien },
          { corpus: false, entretiens: [commande.entretienId], projections: ["locuteurs", 'notes'] },
        )
      }
    }
    return personneId
  }

  refuserRapprochementSimple(
    commande: Extract<CommandeLocuteurs, { type: 'refuser' }>,
  ): string | null {
    return this.personnesCommander(commande, false, false)
  }

  rapprocherPersonneSimple(
    commande: Extract<CommandeLocuteurs, { type: 'rapprocher' }>,
  ): string | null {
    return this.personnesCommander(commande, false, true, false)
  }

  creerDefinitionPersonne(nom: string, automatique = false): string {
    this.verifierEcriture()
    if (automatique && natureNomLocuteur(nom) !== 'specifique') {
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

  // Les réglages Lexico sont des définitions partagées du corpus.
  traitementsLexicoCommander(commande: CommandeTraitementsLexico): CorpusFichier {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    corpus.lexico = appliquerCommandeTraitementsLexico(corpus.lexico, commande)
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return corpus
  }

  // ── Tableau de bord (définitions corpus) — lire → muter → écrire ─────────
  /** Le tableau de bord du corpus (`corpus.crp.tableaubord`), normalisé :
   *  un corpus ancien sans le champ obtient le tableau par défaut. */
  tableauBord(): TableauBord {
    const c = this.ouvrir()
    return normaliserTableauBord(c.tableaubord) ?? tableauBordParDefaut()
  }

  /** Applique une édition ciblée du tableau de bord après relecture du corpus courant. */
  tableaubordCommander(commande: CommandeTableauBord): CorpusFichier {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    const actuel = normaliserTableauBord(corpus.tableaubord) ?? tableauBordParDefaut()
    corpus.tableaubord = appliquerCommandeTableauBord(actuel, commande, {
      maintenant: () => new Date().toISOString(),
    })
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return corpus
  }

  // ── Catégories de note (définitions corpus) — lire → muter → écrire ───────
  /** Les catégories de note du corpus (`corpus.crp.categoriesNote`),
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

  /** Les règles corpus (`corpus.crp.reglesAnon`), sous forme de tableau.
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

  /** Lecture stricte sans migration sur disque ; les membres indisponibles restent signalés. */
  instantaneCorrespondances(avecEntretiens: boolean, limiteOctets?: number): InstantaneOperationTheme {
    if (avecEntretiens) {
      const instantane = this.lireInstantaneOperationTheme(limiteOctets)
      if (!Object.hasOwn(instantane.corpus, 'reglesAnon')) instantane.corpus = { ...instantane.corpus, reglesAnon: {} }
      return instantane
    }
    return { corpus: this.ouvrir(), entretiens: [] }
  }

  /** Un renommage global local nécessite la fermeture de toutes les sessions d’édition. */
  renommageAnonGlobalPossible(): boolean {
    return !this.lectureSeule && this.sourcesPreparation === null && !this.transactionsFichiers.journalPresent() && this.ecrituresAutorisees.size === 0
  }

  exigerRenommageAnonGlobal(): void {
    this.verifierEcriture()
    if (this.sourcesPreparation !== null) throw new Error('Le renommage global doit passer par le service qualifié du fournisseur.')
    if (this.transactionsFichiers.journalPresent()) throw new Error('Une transaction reste à reprendre. Rouvrez le corpus avant de renommer.')
    if (this.ecrituresAutorisees.size) throw new Error('Fermez tous les entretiens en édition et recalculez l’aperçu avant de renommer.')
  }

  /** Le premier protocole local de dissociation exige des copies fermées et un journal libre. */
  dissociationAnonGlobalePossible(): boolean { return this.renommageAnonGlobalPossible() }

  exigerDissociationAnonGlobale(): void {
    this.verifierEcriture()
    if (this.sourcesPreparation !== null) throw new Error('La dissociation globale doit passer par le service qualifié du fournisseur.')
    if (this.transactionsFichiers.journalPresent()) throw new Error('Une transaction reste à reprendre. Rouvrez le corpus avant de dissocier.')
    if (this.ecrituresAutorisees.size) throw new Error('Fermez les entretiens en édition et recalculez l’aperçu avant de dissocier.')
  }

  /** La suppression globale locale exige des sessions fermées et un journal libre. */
  suppressionAnonGlobalePossible(): boolean { return this.renommageAnonGlobalPossible() }

  exigerSuppressionAnonGlobale(): void {
    this.verifierEcriture()
    if (this.sourcesPreparation !== null) throw new Error('La suppression globale doit passer par le service qualifié du fournisseur.')
    if (this.transactionsFichiers.journalPresent()) throw new Error('Une transaction reste à reprendre. Rouvrez le corpus avant de supprimer.')
    if (this.ecrituresAutorisees.size) throw new Error('Fermez les entretiens en édition et recalculez l’aperçu avant de supprimer.')
  }

  /** Le retrait d’une variante exige un bilan frais, des sessions fermées et un journal libre. */
  retraitVarianteAnonPossible(): boolean { return this.renommageAnonGlobalPossible() }

  exigerRetraitVarianteAnon(): void {
    this.verifierEcriture()
    if (this.sourcesPreparation !== null) throw new Error('Le retrait de variante doit passer par le service qualifié du fournisseur.')
    if (this.transactionsFichiers.journalPresent()) throw new Error('Une transaction reste à reprendre. Rouvrez le corpus avant de retirer une variante.')
    if (this.ecrituresAutorisees.size) throw new Error('Fermez les entretiens en édition et recalculez le bilan avant de retirer une variante.')
  }

  /** L'import ciblé local utilise le journal durable et refuse les entretiens encore édités. */
  importerCorrespondancesEntretiens(preparation: {
    empreinteCorpus: string; empreintesEntretiens: Record<string, string>
    lignes: LigneImportCorrespondance[]; choix: Record<string, ChoixImportCorrespondance>
    cibles: CibleImportCorrespondance[]; choixCibles: ChoixCibleCorrespondance[]
  }) {
    this.verifierEcriture()
    if (this.sourcesPreparation !== null) throw new Error('L’import ciblé doit passer par le service du fournisseur, jamais par un store de préparation.')
    if (this.transactionsFichiers.journalPresent()) throw new Error('Une transaction reste à reprendre. Rouvrez le corpus avant d’importer.')
    const instantane = this.instantaneCorrespondances(true)
    if (empreinteCorrespondance(instantane.corpus) !== preparation.empreinteCorpus) throw new Error('Le corpus a changé depuis l’aperçu. Recalculez avant d’importer.')
    const selection = new Set(preparation.choixCibles.map((c) => {
      const cible = preparation.cibles.find((x) => x.id === c.cibleId)
      if (!cible) throw new Error('Cible inconnue. Recalculez l’aperçu.')
      return cible.entretienId
    }))
    const entretiens: Record<string, EntretienFichier> = Object.create(null)
    for (const id of selection) {
      if (this.ecrituresAutorisees.has(id)) throw new Error('Un entretien cible est ouvert en édition. Fermez-le et recalculez l’aperçu.')
      const source = instantane.entretiens.find((e) => e.id === id)
      if (!source?.ok || empreinteCorrespondance(source.avant) !== preparation.empreintesEntretiens[id]) throw new Error('Un entretien cible a changé ou est indisponible. Recalculez avant d’importer.')
      if (source.avant.formatVersion < 3) throw new Error('Enregistrez cet ancien entretien dans le format actuel avant d’importer des correspondances locales.')
      entretiens[id] = source.avant
    }
    const global = appliquerImportCorrespondances(instantane.corpus.reglesAnon, preparation.lignes, preparation.choix, () => genId('reg'))
    const corpusAvant = JSON.parse(readFileSync(this.corpusFile, 'utf8')) as CorpusFichier
    const corpusApres = structuredClone(corpusAvant)
    if (global.bilan.ajouts + global.bilan.variantes + global.bilan.remplacements) corpusApres.reglesAnon = global.regles
    const local = appliquerCorrespondancesEntretiens({ lignes: preparation.lignes }, { ...corpusApres, reglesAnon: global.regles }, entretiens, preparation.cibles, preparation.choixCibles)
    const modifications = Object.entries(local.apres).map(([id, apres]) => ({ id, avant: entretiens[id], apres: { ...apres, lastModified: new Date().toISOString() } }))
    if (modifications.length || JSON.stringify(corpusAvant) !== JSON.stringify(corpusApres)) this.appliquerTransactionFichiers({
      operation: 'remplacement', id: genId('correspondances'), corpusAvant, corpusApres, entretiens: modifications,
      ordre: 'entretiens-puis-corpus',
    })
    const lignesCiblees = new Set(preparation.choixCibles.map((c) => preparation.cibles.find((x) => x.id === c.cibleId)!.ligneId))
    global.bilan.ignores -= lignesCiblees.size
    return { ...global.bilan, entretiens: local.bilan }
  }

  /** Importe uniquement des définitions partagées ; les décisions et libellés restent intacts. */
  importerDefinitionsAnon(lignes: LigneImportCorrespondance[], choix: Record<string, ChoixImportCorrespondance>, empreinte: string) {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    if (empreinteDefinitionsCorrespondance(corpus.reglesAnon) !== empreinte) throw new Error('Les règles ont changé depuis l’aperçu. Recalculez avant d’importer.')
    const resultat = appliquerImportCorrespondances(corpus.reglesAnon, lignes, choix, () => genId('reg'))
    if (resultat.bilan.ajouts + resultat.bilan.variantes + resultat.bilan.remplacements) {
      corpus.reglesAnon = resultat.regles
      this.ecrireJsonAtomique(this.corpusFile, corpus)
    }
    return resultat.bilan
  }

  /** Crée une règle pour une entité.
   *  Défensive : si la transaction révèle une règle déjà posée par un collègue
   *  (données fraîches du GET d'après-verrou), elle est réutilisée.
   *  `existait: true` signale ce cas à l'UI,
   *  qui ouvre son dialogue Aligner / Garder les deux. */
  regleAnonCreer(entite: string, pseudos: string[], categorie?: string): { regle: RegleAnon; existait: boolean } {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    const identifiantsAvant = new Set(Object.keys(corpus.reglesAnon))
    const r = corpusModel.creerRegle(corpus, entite, pseudos, () => genId('reg'), categorie)
    const existait = identifiantsAvant.has(r.id)
    if (!existait) this.ecrireJsonAtomique(this.corpusFile, corpus)
    return { regle: r, existait }
  }

  /** Une variante supplémentaire ne réécrit aucun entretien, même ouvert en édition. */
  regleAnonAjouterVariante(demande: DemandeAjoutVarianteAnon): ResultatAjoutVarianteAnon {
    this.verifierEcriture()
    if (this.transactionsFichiers.journalPresent()) throw new Error('Une transaction reste à reprendre. Rouvrez le corpus avant d’ajouter une variante.')
    const corpus = this.ouvrir()
    const resultat = ajouterVarianteAnon(corpus, demande)
    if (resultat.ajoute) this.ecrireJsonAtomique(this.corpusFile, corpus)
    return resultat
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

  /** Supprime une règle du corpus seulement lorsqu'aucun entretien ne l'utilise. */
  regleAnonSupprimer(id: string): void {
    this.verifierEcriture()
    if (this.regleAnonUtiliseeAilleurs(id)) {
      throw new Error('Cette règle d’anonymisation est encore utilisée dans un entretien.')
    }
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
      empreinte?: string
      toutes?: boolean
      plages?: { from: number; to: number }[]
      retirer?: { from: number; to: number }[]
      exception?: { from: number; to: number }[]
      retirerException?: { from: number; to: number }[]
    },
  ): ResultatMutationAnon & { titre: string } {
    this.verifierEcritureEntretien(entretienId)
    const corpus = this.ouvrir()
    const titre = corpus.membership[entretienId]?.titre ?? entretienId
    const regle = corpus.reglesAnon[regleId]
    const file = this.entretienFile(entretienId)
    if (!regle || !existsSync(file) || (cible?.empreinte && !Object.hasOwn(corpus.membership, entretienId))) {
      if (cible?.empreinte) throw new Error('La règle ou l’entretien de l’aperçu n’existe plus. Actualisez avant de recommencer.')
      return { nb: 0, actions: bilanAnonVide(), titre }
    }
    const data = JSON.parse(readFileSync(file, 'utf8')) as EntretienFichier
    const resultat = appliquerRegleAnonEntretienAvecBilan(data, regle, cible ?? { toutes: true })
    if (resultat.nb > 0) {
      data.lastModified = new Date().toISOString()
      this.ecrireJsonAtomique(file, data)
    }
    return { ...resultat, titre }
  }

  /** Supprime une définition et ses usages locaux avec une reprise possible après interruption. */
  private appliquerSuppressionDefinition(
    corpusAvant: CorpusFichier,
    corpusApres: CorpusFichier,
    retirerUsages: (data: EntretienFichier) => number,
  ): void {
    if (this.lectureSeule) {
      this.ecrireJsonAtomique(this.corpusFile, corpusApres)
      return
    }
    const instantane = this.lireInstantaneOperationTheme()
    const entretiens = []
    const maintenant = new Date().toISOString()
    for (const e of instantane.entretiens) {
      if (!e.ok) throw new Error(`L’entretien « ${e.titre} » est indisponible. La suppression n’a pas été faite.`)
      const apres = structuredClone(e.avant)
      if (!retirerUsages(apres)) continue
      if (this.ecrituresAutorisees.has(e.id)) {
        throw new Error(`L’entretien « ${e.titre} » est ouvert en édition. Enregistrez-le et fermez-le avant de supprimer cette définition.`)
      }
      this.verifierEcritureEntretien(e.id)
      apres.lastModified = maintenant
      corpusApres.membership[e.id].lastModified = maintenant
      entretiens.push({ id: e.id, avant: e.avant, apres })
    }
    this.appliquerTransactionFichiers({
      operation: 'remplacement', id: genId('suppression-definition'),
      corpusAvant, corpusApres, entretiens, ordre: 'entretiens-puis-corpus',
    })
  }

  /** Supprime un thème après retrait de ses codages, si ce retrait a été confirmé. */
  supprimerCategorie(id: string, exceptId?: string, avecCodages = false): ResultatSuppressionCategorie {
    this.verifierEcriture()
    if (exceptId !== undefined) throw new Error('Enregistrez et fermez l’entretien avant de supprimer ce thème.')
    const usages = this.compterUsagesCategorie(id)
    if (usages > 0 && !avecCodages) return { ok: false, usages }
    if (avecCodages && this.lectureSeule) throw new Error('Le retrait global des codages exige un corpus local.')
    const avant = this.ouvrir()
    const corpus = structuredClone(avant)
    corpusModel.retirerCategorie(corpus, id)
    this.appliquerSuppressionDefinition(avant, corpus, (data) => corpusModel.retirerCodagesDuTheme(data, id))
    return { ok: true, corpus }
  }

  // ── Variables & modalités (EAV) — lire → appliquer → écrire ─────────────────

  ajouterVariable(lib: string, portee: 'entretien' | 'participation'): { id: string; corpus: CorpusFichier } {
    this.verifierEcriture()
    corpusModel.validerCreationVariable(lib, portee)
    const corpus = this.ouvrir()
    const id = corpusModel.ajouterVariable(corpus, lib, portee, () => genId('var'))
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return { id, corpus }
  }

  modifierVariable(id: string, patch: Partial<Pick<Variable, 'lib' | 'portee' | 'priv'>>): CorpusFichier {
    this.verifierEcriture()
    corpusModel.validerPatchVariable(patch)
    const corpus = this.ouvrir()
    corpusModel.modifierVariable(corpus, id, patch)
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return corpus
  }

  ajouterModalite(idVar: string, lib: string): CorpusFichier {
    this.verifierEcriture()
    corpusModel.validerLibelleDonnee(lib)
    const corpus = this.ouvrir()
    corpusModel.ajouterModalite(corpus, idVar, lib, () => genId('mod'))
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return corpus
  }

  modifierModalite(idVar: string, idMod: string, lib: string): CorpusFichier {
    this.verifierEcriture()
    corpusModel.validerLibelleDonnee(lib)
    const corpus = this.ouvrir()
    corpusModel.modifierModalite(corpus, idVar, idMod, lib)
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return corpus
  }

  compterUsagesVariable(idVar: string): number {
    return corpusModel.compterUsagesVariable(this.datas(), idVar) + compterUsagesCasVariable(this.ouvrir(), idVar)
  }

  compterUsagesModalite(idVar: string, idMod: string): number {
    return corpusModel.compterUsagesModalite(this.datas(), idVar, idMod) + compterUsagesCasVariable(this.ouvrir(), idVar, idMod)
  }

  /** Usages d'une variable (ou d'une modalité), en deux parts : les valeurs saisies dans les entretiens,
   *  que l'on peut effacer avec la définition, et les règles ou dérivations des cas, qui bloquent la suppression.
   *  `exceptId` exclut un entretien du comptage (l'entretien ouvert, compté par l'interface). */
  usagesDonnee(idVar: string, idMod?: string, exceptId?: string): { valeurs: number; cas: number } {
    const datas = this.chargerEntretiens().filter((e) => e.id !== exceptId).map((e) => e.data)
    const valeurs = idMod === undefined
      ? corpusModel.compterUsagesVariable(datas, idVar)
      : corpusModel.compterUsagesModalite(datas, idVar, idMod)
    return { valeurs, cas: compterUsagesCasVariable(this.ouvrir(), idVar, idMod) }
  }

  /** Supprime une variable. Les règles et dérivations des cas bloquent toujours la suppression ;
   *  les valeurs saisies la bloquent aussi, sauf si l'appelant a demandé de les effacer (`avecValeurs`).
   *  Les valeurs sont effacées avant la définition : une interruption laisse la variable en place. */
  supprimerVariable(id: string, exceptId?: string, avecValeurs = false): ResultatSuppression {
    this.verifierEcriture()
    if (exceptId !== undefined) throw new Error('Enregistrez et fermez l’entretien avant de supprimer cette variable.')
    const { valeurs, cas } = this.usagesDonnee(id)
    if (cas > 0 || (valeurs > 0 && !avecValeurs)) return { ok: false, usages: valeurs + cas }
    if (avecValeurs && this.lectureSeule) throw new Error('L’effacement global des valeurs exige un corpus local.')
    const avant = this.ouvrir()
    const corpus = structuredClone(avant)
    corpusModel.retirerVariable(corpus, id)
    this.appliquerSuppressionDefinition(avant, corpus, (data) => corpusModel.effacerValeursVariable(data, id))
    return { ok: true, corpus }
  }

  /** Supprime une modalité, selon la même règle que `supprimerVariable`. */
  supprimerModalite(idVar: string, idMod: string, exceptId?: string, avecValeurs = false): ResultatSuppression {
    this.verifierEcriture()
    if (exceptId !== undefined) throw new Error('Enregistrez et fermez l’entretien avant de supprimer cette modalité.')
    const { valeurs, cas } = this.usagesDonnee(idVar, idMod)
    if (cas > 0 || (valeurs > 0 && !avecValeurs)) return { ok: false, usages: valeurs + cas }
    if (avecValeurs && this.lectureSeule) throw new Error('L’effacement global des valeurs exige un corpus local.')
    const avant = this.ouvrir()
    const corpus = structuredClone(avant)
    corpusModel.retirerModalite(corpus, idVar, idMod)
    this.appliquerSuppressionDefinition(avant, corpus, (data) => corpusModel.effacerValeursVariable(data, idVar, idMod))
    return { ok: true, corpus }
  }

  /** Table de données : chaque ligne = un entretien, chaque colonne = une variable,
   *  chaque cellule = la valeur EAV correspondante.
   *  La matrice est construite à la volée à partir des fichiers d'entretiens,
   *  mécanique détaillée dans shared/corpus/requetes.ts. */
  matriceCorpus(): MatriceCorpus {
    return corpusModel.matriceCorpus(this.chargerEntretiens())
  }

  /** Installe un entretien confirmé par le fournisseur distant.
   *  L'orchestrateur garantit qu'aucune session locale ne possède ce fichier. */
  installerEntretienDistant(entretienId: string, entretien: EntretienFichier): void {
    this.ecrireJsonAtomique(this.entretienFile(entretienId), entretien)
  }

  /** Pose une valeur chez son propriétaire, sans rotation de backup ni modification des ids.
   *  Retourne false si l'entretien ou la participation ciblée est introuvable.
   */
  poserValeur(entretienId: string, cible: CibleValeur, idVar: string, idMod: string): boolean {
    return this.poserValeursEntretien(entretienId, [{ entretienId, cible, idVar, idMod }])
  }

  /** Écrit le lot d'un entretien en une fois ; une destination absente ne laisse aucune modification partielle. */
  poserValeursEntretien(entretienId: string, items: readonly ItemLotValeur[]): boolean {
    this.verifierEcritureEntretien(entretienId)
    validerLotValeur(items)
    if (items.some((item) => item.entretienId !== entretienId)) throw new Error('Le lot de valeurs mélange plusieurs entretiens.')
    if (items.length === 0) return true
    const f = this.entretienFile(entretienId)
    if (!existsSync(f)) return false
    const data = JSON.parse(readFileSync(f, 'utf8')) as EntretienFichier
    verifierVersionNative(data, `entretien ${entretienId}`)
    try { validerEntretienNatif(data) } catch { return false }
    for (const item of items) {
      if (!corpusModel.poserValeur(data, item.cible, item.idVar, item.idMod)) return false
    }
    data.lastModified = new Date().toISOString()
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
    this.verifierEntretienLisible()
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
    this.verifierEntretienLisible()
    const out = new Map<string, { chemin: string }>()
    const corpus = this.ouvrir()
    for (const id of Object.keys(corpus.membership)) {
      const f = this.entretienFile(id)
      if (!existsSync(f)) continue
      try {
        const data = JSON.parse(readFileSync(f, 'utf8')) as EntretienFichier
        const d = data.meta?.audioDistant
        if (
          d && typeof d.chemin === 'string' && d.chemin &&
          !d.chemin.startsWith('/') && !d.chemin.includes('\\') && !d.chemin.includes('\0') &&
          !d.chemin.split('/').some((segment) => !segment || segment === '.' || segment === '..') &&
          (this.fournisseurMiroir !== 'gitlab' || d.fournisseur === 'gitlab')
        ) out.set(id, { chemin: d.chemin })
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

