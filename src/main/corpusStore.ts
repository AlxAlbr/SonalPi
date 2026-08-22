import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  copyFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { join, extname, basename, normalize, isAbsolute, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as corpusModel from '../shared/corpus'
import type { ScanRegle } from '../shared/corpus/scanAnon'
import { instructionsAppliquerRegle } from '../shared/entretien/anon'
import { migrerEntretienV1 } from '../shared/entretien/migration'

/** Pourquoi des numéros de version ? Chaque évolution du format de fichier est
 *  migrée EXPLICITEMENT à la lecture, puis le fichier est réécrit aussitôt,
 *  sans jamais lire une version inconnue partiellement.
 *  - v1 → v2 : les timecodes quittent les attributs de bloc (`deb`/`fin`),
 *    pour devenir des ancres `{pos, t}` positionnées dans le texte.
 *  - v2 → v3 : `meta.audioRef` devient un chemin ABSOLU uniquement,
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
} from '../shared/format'

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

/** Identifiant d'entretien : `<slug du titre>_<code aléatoire>`. Le slug rend
 *  le dossier `entretiens/` lisible (« on retrouve le nom SRT/audio d'origine ») ;
 *  le code aléatoire préserve l'unicité (et la future synchro multi-utilisateur).
 *  Le titre (nom de fichier SRT ou audio, sans extension) est assaini — jamais de
 *  séparateur de chemin résiduel, donc pas de traversée (l'id mène à `<id>.json`). */
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

  /** Garde E0 corpus distant (plan-multiuser.md) : quand le store pointe un
   *  MIROIR sans couche verrou/publication (E1), toute écriture est REFUSÉE —
   *  sinon deux postes divergeraient silencieusement. Défense en profondeur :
   *  l'UI grise déjà les gestes, ici on garantit le reste. Les dérivés locaux
   *  purs (PNG waveform, §3.3) restent permis. */
  lectureSeule = false

  private verifierEcriture(): void {
    if (this.lectureSeule) {
      throw new Error(
        'Corpus distant ouvert en lecture seule : la modification partagée sous verrou arrive avec la prochaine étape.',
      )
    }
  }

  /** E1 — exception PAR ENTRETIEN : quand le corpus distant est en lecture
   *  seule (définitions = flux B, toujours bloquées avant E3), le contenu des
   *  entretiens DONT NOUS TENONS le verrou reste écrivable (flux A, §10).
   *  La couche session pose/retire l'id ici à l'acquisition/libération. */
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
    * corpusFile → "/home/user/projets/mon_corpus/corpus.json". */
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

  /** Ancien dossier audio (v2) : reliquat pour les corpus migrés, avec leurs
   *  mp3 legacy référencés en absolu vers leur emplacement existant.
   *  Les nouveaux corpus v3 n'ont pas de dossier `audio/`. */
  private get audioDirLegacy() {
    return join(this.dir, 'audio')
  }

  private ecrireJsonAtomique(fichier: string, obj: unknown): void {
    const tmp = fichier + '.tmp'
    writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8')
    renameSync(tmp, fichier) // rename atomique : un crash laisse l'ancien fichier intact
  }

  /** Ouvre (ou amorce) le corpus */
  ouvrir(): CorpusFichier {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true })
    if (!existsSync(this.entretiensDir)) mkdirSync(this.entretiensDir, { recursive: true })
    
    // Nouveau corpus : traité plus bas.
    if (!existsSync(this.corpusFile)) return this.amorcer()

    // `CorpusFichier` contient les 5 blocs de définitions : codebook, variables,
    // reglesAnon, personnes, membership (voir shared/format.ts).
    const corpus = JSON.parse(readFileSync(this.corpusFile, 'utf8')) as CorpusFichier

    // Migration v1→v2.
    if (corpus.formatVersion === 1) {
      corpus.formatVersion = FORMAT_VERSION
      this.ecrireJsonAtomique(this.corpusFile, corpus)
    }
    // Migration v2→v3 : audioRef relatifs → absolus, PNG `audio/` → `png/`.
    // Même mécanique que v1→v2 : le store migre à la lecture puis réécrit aussitôt ;
    // jamais de lecture partielle d'une version inconnue.
    // One-shot : après migration, formatVersion === 3.
    if (corpus.formatVersion === 2) {
      this.migrerV2VersV3(corpus)
    }
    if (!versionSupportee(corpus.formatVersion)) {
      throw new Error(`Version de corpus non supportée : ${corpus.formatVersion}`)
    }
    return corpus
  }

  /** Pose (ou remplace) le `nom` de PROJET du corpus (D2) et persiste. Le nom
   *  est indépendant du dossier (il survit au renommage du dossier) ; les
   *  consommateurs l'affichent en priorité, avec repli sur le basename du
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

  /** Migration v2→v3 : résout chaque `audioRef` relatif en absolu ;
   *  déplace les PNG waveform `audio/` → `png/` ;
   *  passe le corpus et chaque entretien à v3.
   *  Les mp3 legacy restent dans `audio/`, référencés en absolu sur place ;
   *  aucune recopie, aucun orphelin. */
  private migrerV2VersV3(corpus: CorpusFichier): void {
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
    const blanc = '#ffffff'
    const codebook = {
      cat_001: { id: 'cat_001', nom: 'Pondérations', couleur: blanc, ordre: 0, parent: null, actif: true, codeExport: 'cat_001' },
      cat_002: { id: 'cat_002', nom: '★★★ Très important', couleur: blanc, taille: 24, ordre: 1, parent: 'cat_001', actif: true, codeExport: 'cat_002' },
      cat_003: { id: 'cat_003', nom: '★★☆ Assez important', couleur: blanc, taille: 22, ordre: 2, parent: 'cat_001', actif: true, codeExport: 'cat_003' },
      cat_004: { id: 'cat_004', nom: '★☆☆ Important', couleur: blanc, taille: 20, ordre: 3, parent: 'cat_001', actif: true, codeExport: 'cat_004' },
    }
    const corpus: CorpusFichier = {
      formatVersion: FORMAT_VERSION,
      codebook,
      variables: {},
      reglesAnon: {},
      personnes: {},
      membership: {},
    }
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return corpus
  }

  /** Crée un corpus V2 DANS un dossier dédié, à partir d'une migration
   *  SonalPi V1 (plan-migration.md E3). Contrairement à `amorcer()`, on
   *  n'écrit PAS le bloc Pondérations par défaut : la source de vérité des
   *  définitions est le `.crp` (Q7) — on fusionne exactement ce qu'E1 a mappé.
   *  Le dossier a été vérifié par la garde (`migrer:verifierDossier`) ; en
   *  défense en profondeur on REFUSE ici tout corpus.json existant
   *  (« on n'écrase jamais », plan §8). Les entretiens (lecture des .Sonal +
   *  audio) sont l'étape E2 — elle se branche après cette création. */
  migrerDepuisV1(
    nom: string,
    sourceV1: SourceV1,
    codebook: Categorie[],
    variables: Variable[],
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
    // Migration EXPLICITE v1→v2 : deb/fin des blocs → ancres {pos, t}.
    // Réécrite aussitôt (lastModified préservé — migrer n'est pas une édition).
    if ((data.formatVersion as number) === 1) {
      data = migrerEntretienV1(data as unknown as Record<string, unknown>) as unknown as EntretienFichier
      this.ecrireJsonAtomique(fichier, data)
    }
    // Migration v2→v3 : audioRef relatif → absolu (filet de sécurité).
    // La migration principale a lieu dans `ouvrir()` ;
    // ici, un entretien v2 isolé (ex. copié à la main dans un corpus v3)
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

    // Le renderer peut round-triper un `audioRef` modifié → invalide le cache
    // (sécurité ; l'invariant « muté uniquement via assignerAudio » est visé).
    this.invaliderRefsAudio()

    // §4.7 (désamorçage, 1er point) : PLUS de mise à jour du membership ici.
    // Réécrire corpus.json à chaque autosave obligeait, en distant, à prendre
    // aussi le verrou corpus à chaque fermeture d'entretien. Le membership
    // n'est écrit que par création / import / renommage / suppression ; le
    // `lastModified` affiché est dérivé du fichier entretien lui-même.
    return now
  }

  /** `.bak1` → `.bak2`, puis copie de l'état courant → `.bak1`. Une génération
   *  par session : les `.bak` capturent l'état d'AVANT les sessions précédentes,
   *  pas les derniers autosaves. */
  private tournerBak(id: string): void {
    const f = this.entretienFile(id)
    const b1 = f + '.bak1'
    const b2 = f + '.bak2'
    if (existsSync(b1)) renameSync(b1, b2)
    if (existsSync(f)) copyFileSync(f, b1)
  }

  
  /** Crée un entretien vide (cas où on n'a qu'un AUDIO, pas de fichier
   *  entretien). Le `titre` = nom du fichier audio sans extension : il nomme le
   *  fichier sur disque (« nom d'origine_code ») ET sert de titre affiché. */
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
    // Seul le PNG dérivé (dans `png/`) est déplacé en corbeille : l'audio
    // référencé est externe au corpus, on ne le touche jamais.
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

  /** Usages d'une catégorie, `exceptId` excluant un entretien du comptage ;
   *  sert à vérifier, à la suppression, qu'elle n'est pas utilisée ailleurs. */
  compterUsagesCategorie(code: string, exceptId?: string): number {
    const datas = this.chargerEntretiens()
      .filter((e) => e.id !== exceptId)
      .map((e) => e.data)
    return corpusModel.compterUsagesCategorie(datas, code)
  }
  
  /** Nombre d'usages de chaque catégorie dans l'ensemble des entretiens du
   *  corpus (fonction `usagesParCategorie` de shared/corpus). */
  usagesParCategorie(): Record<string, number> {
    return corpusModel.usagesParCategorie(this.datas())
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

  /** REQUÊTE scan anon corpus : relit TOUS les entretiens sur disque et, pour
   *  chaque règle corpus, classe les occurrences par état (anonymisées /
   *  exceptions / à traiter). Rien de stocké, aucun cache — le texte est relu
   *  à chaque appel (réconciliation « un changement coincide-t-il avec une
   *  règle ? »). */
  scanAnon(): ScanRegle[] {
    return corpusModel.scannerCorpus(this.reglesAnon(), this.chargerEntretiens())
  }

  // ── CRUD règles corpus (3b) : lecture → calcul PUR → écriture atomique ────

  /** Règle d'une entité (insensible à la casse), ou undefined. */
  regleAnonParEntite(entite: string): RegleAnon | undefined {
    return corpusModel.trouverRegleParEntite(this.ouvrir(), entite)
  }

  /** Crée une règle pour une entité qui n'en a pas encore. Renvoie la règle. */
  regleAnonCreer(entite: string, pseudos: string[]): RegleAnon {
    this.verifierEcriture()
    const corpus = this.ouvrir()
    const r = corpusModel.creerRegle(corpus, entite, pseudos, () => genId('reg'))
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return r
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

  /** APPLICATION EN MASSE (3b, étape 4) : pose les `OccurrenceAnon` rule-backed
   *  d'une règle sur un entretien FERMÉ (lecture fichier → instructions PURES →
   *  écriture atomique). Cible les « à traiter » (matchs non couverts), pseudo
   *  primaire de la règle ; exceptions et déjà-anonymisés intacts. Renvoie le
   *  nombre d'occurrences posées. */
  appliquerRegleAnon(entretienId: string, regleId: string): { nb: number; titre: string } {
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
    for (const o of instr.poser) {
      data.annotations.push({ id: o.id, type: 'anon', from: o.from, to: o.to, auteur: 'corpus', etat: 'anonymise', pseudo: o.pseudo, regle: o.regle })
    }
    if (instr.nb > 0) this.ecrireJsonAtomique(file, data)
    return { nb: instr.nb, titre }
  }

  /** Supprime une catégorie — REFUSÉE tant qu'elle est utilisée (politique
   *  explicite + compteur ; pas de suppression silencieuse d'annotations). */
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
    // §4.7 : plus de toucher au membership ici (voir ecrireEntretien).
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
    // §4.7 : plus de toucher au membership ici (voir ecrireEntretien).
    return { audioRef: ref }
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

  /** REQUÊTE : par id d'entretien, son `audioRef` absolu (depuis le cache) et
   *  la présence de sa forme d'onde (scan de `png/` par convention de nommage).
   *  Alimente les cartes de l'écran Corpus + le chargement du lecteur. */
  audios(): Record<string, { audio: string | null; waveform: string | null }> {
    const out: Record<string, { audio: string | null; waveform: string | null }> = {}
    // Waveform : scan de `png/` par convention de nommage
    // (le PNG est un dérivé local, jamais stocké dans l'entretien — découvert par nom).
    if (existsSync(this.pngDir)) {
      for (const nom of readdirSync(this.pngDir)) {
        if (extname(nom).slice(1).toLowerCase() !== 'png') continue
        const id = basename(nom, extname(nom))
        if (!id) continue
        ;(out[id] ??= { audio: null, waveform: null }).waveform = `png/${nom}`
      }
    }
    // Audio : depuis le cache `refsAudio` (audioRef absolu par entretien).
    for (const [id, ref] of this.refsAudio()) {
      ;(out[id] ??= { audio: null, waveform: null }).audio = ref
    }
    return out
  }

  /** Chemin ABSOLU du PNG waveform d'un entretien, résolu par ID opaque :
   *  l'ID vient de `genId` et mène à `<corpus>/png/<id>.png`.
   *  L'id n'étant jamais un chemin, aucun risque de traversal ;
   *  sert au protocole `sonal-media://waveform/<id>`. */
  cheminWaveform(id: string): string | null {
    // Garde : l'id ne doit pas contenir de séparateur
    // (defense en depth — `genId` produit toujours un id sûr, mais un appelant malveillant pourrait forger).
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
    for (const ref of this.refsAudio().values()) {
      if (normalize(ref) === cible) return existsSync(cible) ? cible : null
    }
    return null
  }

  /** Vérifie l'existence des fichiers audio référencés,
   *  pour le contrôle d'intégrité à l'ouverture.
   *  Renvoie 'ok' ou 'manquant' pour chaque entretien à l'`audioRef` non-null ;
   *  sert au bandeau d'intégrité de l'écran Corpus. */
  verifierAudios(): Record<string, 'ok' | 'manquant'> {
    const out: Record<string, 'ok' | 'manquant'> = {}
    for (const [id, ref] of this.refsAudio()) {
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

  /** Invalide le cache `refsAudio` (à appeler sur toute mutation d'`audioRef`). */
  private invaliderRefsAudio(): void {
    this.cacheRefsAudio = null
  }
}

