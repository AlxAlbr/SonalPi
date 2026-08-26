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
import * as corpusModel from '../shared/corpus'
import type { ScanRegle } from '../shared/corpus/scanAnon'
import { instructionsAppliquerRegle, poserDansPlages, appliquerDiffAnon } from '../shared/entretien/anon'
import { migrerEntretienFormatV1 } from '../shared/entretien/migration'
import { squeletteCorpus } from '../shared/corpus/squelette'

/** Pourquoi des numéros de version ?
 *  Chaque évolution du format de fichier est migrée EXPLICITEMENT à la lecture.
 *  Le fichier est ensuite réécrit aussitôt, sans jamais lire une version inconnue
 *  partiellement.
 *  - formatVersion 1 → 2 : les timecodes quittent les attributs de bloc (`deb`/`fin`),
 *    pour devenir des ancres `{pos, t}` positionnées dans le texte.
 *  - formatVersion 2 → 3 : `meta.audioRef` devient un chemin ABSOLU uniquement,
 *    l'audio est référencé, plus copié ; les PNG d'onde passent de `audio/` à `png/`.
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
  type NoteCategory,
  paramsAnonDefaut,
  CORPUS_SUPPRIME,
} from '../shared/format'
import {
  normaliserCategoriesNote,
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

/** Normalise un chemin audio reçu d'un dialogue (assignerAudio).
 *  Certains dialogs Linux renvoient `file://`, d'où `fileURLToPath` ;
 *  `path.normalize` rend la comparaison des chemins fiable.
 *  Le résultat est toujours un chemin absolu natif et normalisé. */
function normaliserCheminAudio(source: string): string {
  let p = source
  if (p.startsWith('file:')) p = fileURLToPath(p)
  return normalize(p)
}

/** Les RÈGLES du corpus vivent dans `shared/corpus/` (pures) ;
 *  ICI on ne fait que lire → appliquer → écrire.
 *  Cette classe est le point d'entrée de toutes les opérations sur le corpus,
 *  au sens CRUD (codebook, variables, modalités, entretiens, audio). */
export class CorpusStore {

  /** L'attribut dir contient le chemin vers le répertoire du corpus */
  private readonly dir: string

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

  /** Ouvre (ou amorce) le corpus.
   *  L'amorçage n'a lieu qu'une fois par store, au moment où le dossier est
   *  CHOISI ; ensuite, un `corpus.json` absent signifie « supprimé sur
   *  disque » → erreur sentinelle CORPUS_SUPPRIME, jamais de recréation
   *  silencieuse. La garde précède toute création de dossier : un corpus
   *  supprimé ne laisse pas de squelette derrière lui. */
  ouvrir(): CorpusFichier {
    if (!existsSync(this.corpusFile)) {
      if (!this.amortissable) {
        throw new Error(
          `${CORPUS_SUPPRIME}: le dossier du corpus courant a été supprimé sur disque.`,
        )
      }
    } else {
      this.amortissable = false // un corpus existant est ouvert : plus jamais d'amorçage implicite
    }
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true })
    if (!existsSync(this.entretiensDir)) mkdirSync(this.entretiensDir, { recursive: true })

    // Nouveau corpus : traité plus bas.
    if (!existsSync(this.corpusFile)) {
      const amorce = this.amorcer()
      this.amortissable = false // même un corpus qu'on vient d'amorcer ne se ré-amorce pas
      return amorce
    }

    // `CorpusFichier` contient les 5 blocs de définitions : codebook, variables,
    // reglesAnon, personnes, membership (voir shared/format.ts).
    const corpus = JSON.parse(readFileSync(this.corpusFile, 'utf8')) as CorpusFichier

    // Migration formatVersion 1→2.
    if (corpus.formatVersion === 1) {
      corpus.formatVersion = FORMAT_VERSION
      this.ecrireJsonAtomique(this.corpusFile, corpus)
    }
    // Migration formatVersion 2→3 : audioRef relatifs → absolus, PNG `audio/` → `png/`.
    // Même mécanique que formatVersion 1→2 : le store migre à la lecture puis réécrit aussitôt ;
    // jamais de lecture partielle d'une version inconnue.
    // One-shot : après migration, formatVersion === 3.
    if (corpus.formatVersion === 2) {
      this.migrerFormatV2Vers3(corpus)
    }
    if (!versionSupportee(corpus.formatVersion)) {
      throw new Error(`Version de corpus non supportée : ${corpus.formatVersion}`)
    }
    return corpus
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

  /** Migration formatVersion 2→3 : résout chaque `audioRef` relatif en absolu ;
   *  déplace les PNG waveform `audio/` → `png/` ;
   *  passe le corpus et chaque entretien à v3.
   *  Les mp3 legacy restent dans `audio/`, référencés en absolu sur place ;
   *  aucune recopie, aucun orphelin. */
  private migrerFormatV2Vers3(corpus: CorpusFichier): void {
    if (!existsSync(this.pngDir)) mkdirSync(this.pngDir, { recursive: true })
    // 1. Déplacer les PNG waveform `audio/<id>.png` → `png/<id>.png`.
    if (existsSync(this.audioDirLegacy)) {
      for (const nom of readdirSync(this.audioDirLegacy)) {
        if (extname(nom).slice(1).toLowerCase() !== 'png') continue
        const src = join(this.audioDirLegacy, nom)
        const dst = join(this.pngDir, nom)
        if (existsSync(dst)) continue // idempotent : ne pas écraser un PNG déjà migré
        renameSync(src, dst)
      }
    }
    // 2. Résoudre chaque `audioRef` relatif en absolu + bump entretien à v3.
    for (const id of Object.keys(corpus.membership)) {
      const f = this.entretienFile(id)
      if (!existsSync(f)) continue
      const data = JSON.parse(readFileSync(f, 'utf8')) as EntretienFichier
      if ((data.formatVersion as number) === 2) {
        const ref = data.meta?.audioRef
        if (typeof ref === 'string' && ref && !isAbsolute(ref)) {
          data.meta.audioRef = resolve(this.dir, ref)
        }
        data.formatVersion = FORMAT_VERSION
        this.ecrireJsonAtomique(f, data)
      }
    }
    // 3. Bump le corpus à v3.
    corpus.formatVersion = FORMAT_VERSION
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    this.invaliderRefsAudio() // le cache (s'il existait) est périmé
  }

  /** Le bloc « Pondérations » par défaut de SonalPi, aux mêmes codes que lui (cat_001..004).
   *  Ces ids `cat_NNN` sont VOLONTAIREMENT figés (espace réservé, administré),
   *  écrits une fois à l'amorçage, jamais créés par un utilisateur :
   *  ils garantissent que deux corpus neufs partagent le même codebook par défaut,
   *  et la parité d'ids avec les `.sonal` importés de SonalPi.
   *  Toute catégorie créée ENSUITE passe par `genId('cat')` ;
   *  l'id est opaque et sûr en offline divergent,
   *  `cat_NNN` étant relégué au `codeExport`. */
  private amorcer(): CorpusFichier {
    // Squelette partagé avec la création distante : un seul codebook par défaut.
    // Deux lieux d'écriture possibles : disque local / serveur.
    const corpus = squeletteCorpus()
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return corpus
  }

  /** Crée un corpus SonalTau DANS un dossier dédié, à partir d'une migration SonalPi V1.
   *  Contrairement à `amorcer()`, on n'écrit PAS le bloc « Pondérations ».
   *  La source de vérité des définitions est le `.crp`, on fusionne exactement ce que la lecture a mappé.
   *  Le dossier a déjà été vérifié par la garde (`migrer:verifierDossier`).
   *  En défense en profondeur, on REFUSE ici tout corpus.json existant, on n'écrase jamais.
   *  La lecture des entretiens (.Sonal + audio) se branche après cette création. */
  migrerDepuisV1(
    nom: string,
    sourceV1: SourceV1,
    codebook: Categorie[],
    variables: Variable[],
    reglesAnonV1?: RegleAnon[],
    paramsAnon?: ParamsAnon,
  ): CorpusFichier {
    if (existsSync(this.corpusFile)) {
      throw new Error('Le dossier contient déjà un corpus — la garde a été contournée.')
    }
    mkdirSync(this.dir, { recursive: true })
    mkdirSync(this.entretiensDir, { recursive: true })
    const corpus: CorpusFichier = {
      formatVersion: FORMAT_VERSION,
      codebook: {},
      variables: {},
      reglesAnon: {},
      personnes: {},
      membership: {},
      nom,
      meta: { sourceV1 },
    }
    corpusModel.fusionnerImport(corpus, codebook, variables)
    // E4 : le `tabAnon` du .crp devient des règles corpus, écrites AVANT les imports `.sonal`.
    // Doctrine SonalPi V1 : le global du corpus gagne.
    // La dédup par alias de `fusionnerReglesAnon` rend ensuite l'import `.sonal` idempotent.
    // La catégorie/thématique du .crp reste sur la règle.
    for (const r of reglesAnonV1 ?? []) {
      if (!corpus.reglesAnon[r.id]) corpus.reglesAnon[r.id] = r
    }
    if (paramsAnon) corpus.paramsAnon = paramsAnon
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return corpus
  }

  /** Lit un entretien et démarre sa « session »,
   *  la prochaine écriture fera tourner les `.bak`.
   *  Pas de contrôle de fraîcheur croisée fichier/membership :
   *  en mono-utilisateur, le disque est la vérité. */
  lireEntretien(id: string): LectureEntretien {
    const fichier = this.entretienFile(id)
    if (!existsSync(fichier)) return { ok: false, raison: 'absent' }

    let data = JSON.parse(readFileSync(fichier, 'utf8')) as EntretienFichier
    // Migration EXPLICITE formatVersion 1→2 : deb/fin des blocs → ancres {pos, t}.
    // Réécrite aussitôt (lastModified préservé — migrer n'est pas une édition).
    if ((data.formatVersion as number) === 1) {
      data = migrerEntretienFormatV1(data as unknown as Record<string, unknown>) as unknown as EntretienFichier
      this.ecrireJsonAtomique(fichier, data)
    }
    // Migration formatVersion 2→3 : audioRef relatif → absolu (filet de sécurité).
    // La migration principale a lieu dans `ouvrir()` ;
    // ici, un entretien formatVersion 2 isolé (ex. copié à la main dans un corpus formatVersion 3)
    // est rattrapé au passage.
    if ((data.formatVersion as number) === 2) {
      const ref = data.meta?.audioRef
      if (typeof ref === 'string' && ref && !isAbsolute(ref)) {
        data.meta.audioRef = resolve(this.dir, ref)
      }
      data.formatVersion = FORMAT_VERSION
      this.ecrireJsonAtomique(fichier, data)
      this.invaliderRefsAudio()
    }
    if (!versionSupportee(data.formatVersion)) return { ok: false, raison: 'version' }

    this.rotationEnAttente.add(id) // ouverture = début de session
    return { ok: true, data }
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

  /** `.bak1` → `.bak2`, puis copie de l'état courant → `.bak1`.
   *  Une génération par session : les `.bak` capturent l'état d'AVANT les sessions précédentes, pas les derniers autosaves. */
  private tournerBak(id: string): void {
    const f = this.entretienFile(id)
    const b1 = f + '.bak1'
    const b2 = f + '.bak2'
    if (existsSync(b1)) renameSync(b1, b2)
    if (existsSync(f)) copyFileSync(f, b1)
  }


  /** Crée un entretien vide (cas où on n'a qu'un AUDIO, pas de fichier entretien).
   *  Le `titre` est le nom du fichier audio sans extension ; il nomme le fichier sur disque (« nom d'origine_code »).
   *  Le même `titre` sert d'affichage. */
  creerEntretienVide(titre: string): { id: string; corpus: CorpusFichier } {
    this.verifierEcriture()
    const corpus = this.ouvrir()
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
      meta: { valeursGen: {}, audioRef: null },
    }
    this.ecrireJsonAtomique(this.entretienFile(id), entretien)
    corpus.membership[id] = { titre, date: null, lastModified: now }
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return { id, corpus }
  }

  /** Le parsing du fichier se fait dans sas.ts (importerFichier) ;
   *  ici, on ne fait que créer un entretien et fusionner les métadonnées.
   *  Appelé par l'IPC `window.sonal.corpus.importer()` (cf. preload). */
  importerEntretien(
    titre: string,
    payload: PayloadEntretien,
    codebook: Categorie[] = [],
    variables: Variable[] = [],
    reglesAnon: RegleAnon[] = [],
  ): { id: string; corpus: CorpusFichier } {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    const id = genIdEntretien(titre)
    const now = new Date().toISOString()
    const entretien: EntretienFichier = { formatVersion: FORMAT_VERSION, lastModified: now, ...payload }
    this.ecrireJsonAtomique(this.entretienFile(id), entretien)

    corpusModel.fusionnerImport(corpus, codebook, variables)
    corpusModel.fusionnerReglesAnon(corpus, reglesAnon)
    corpus.membership[id] = { titre, date: null, lastModified: now }
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return { id, corpus }
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

  /** Retire le fichier du membership et le déplace dans `corbeille/`,
   *  avec ses `.bak` et son PNG waveform (`png/<id>.png`).
   *  Jamais d'effacement ni d'orphelin sur disque ;
   *  l'audio référencé n'est jamais touché, car jamais copié. */
  supprimerEntretien(id: string): CorpusFichier {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    const corbeille = join(this.dir, 'corbeille')
    if (!existsSync(corbeille)) mkdirSync(corbeille, { recursive: true })
    for (const suffixe of ['.json', '.json.bak1', '.json.bak2']) {
      const src = join(this.entretiensDir, id + suffixe)
      if (existsSync(src)) renameSync(src, join(corbeille, id + suffixe))
    }
    // Seul le PNG dérivé (dans `png/`) est déplacé en corbeille :
    // l'audio référencé est externe au corpus, on ne le touche jamais.
    if (existsSync(this.pngDir)) {
      for (const f of readdirSync(this.pngDir)) {
        if (f.startsWith(id + '.')) renameSync(join(this.pngDir, f), join(corbeille, f))
      }
    }
    delete corpus.membership[id]
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    this.invaliderRefsAudio()
    return corpus
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
   *  `plages` restreint les POSES aux seules occurrences cochées ; `retirer`, `exception` et `retirerException` portent le diff façon SonalPi V1 (« Valider »).
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
   *  jamais écrit par l'app (parité SonalPi).
   *  Le chemin stocké est normalisé (`file://` → natif, `path.normalize`),
   *  pour une comparaison fiable des chemins.
   *  Écriture ciblée comme `poserValeur` (pas de rotation `.bak`). */
  assignerAudio(id: string, source: string): { audioRef: string } | null {
    this.verifierEcritureEntretien(id)
    const f = this.entretienFile(id)
    if (!existsSync(f) || !existsSync(source)) return null
    // Normaliser : certains dialogs (Linux) renvoient `file://` → natif.
    const ref = normaliserCheminAudio(source)

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

