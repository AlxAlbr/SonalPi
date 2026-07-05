import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  copyFileSync,
} from 'node:fs'
import { join } from 'node:path'
import * as corpusModel from '../shared/corpus'
import {
  FORMAT_VERSION,
  versionSupportee,
  type Categorie,
  type CibleValeur,
  type CorpusFichier,
  type EntretienFichier,
  type LectureEntretien,
  type MatriceCorpus,
  type PatchCategorie,
  type PayloadEntretien,
  type ResultatSuppression,
  type ResultatSuppressionCategorie,
  type Variable,
} from '../shared/format'

/** Doc ProseMirror seed (deux blocs porteurs de leur locuteur) — sert à amorcer
 *  un corpus vide, pour garder la démo Karine des étapes 0/1 après persistance. */
const DOC_SEED = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: { loc: 1, deb: null, fin: null },
      content: [{ type: 'text', text: 'Karine habite Lyon depuis sa retraite.' }],
    },
    {
      type: 'paragraph',
      attrs: { loc: 2, deb: null, fin: null },
      content: [{ type: 'text', text: 'Elle parle souvent de son travail passé et de sa famille.' }],
    },
  ],
}

const DOC_VIDE = { type: 'doc', content: [{ type: 'paragraph', attrs: { loc: null, deb: null, fin: null } }] }

function genId(prefixe: string): string {
  return prefixe + '-' + Math.random().toString(36).slice(2, 10)
}

/**
 * Store « dossier de corpus » (MODELE_OBJET §3-§5) — la couche PERSISTANCE (Node
 * pur, aucun electron → testable headless). Les RÈGLES de corpus (id, ordre,
 * usages, matrice, fusion d'import) vivent dans `shared/corpus/` (pures) ; ici
 * on ne fait que lire → appliquer → écrire. La granularité de verrou/écriture est
 * l'entretien ; l'écriture est atomique (write-tmp-rename) ; un filet `.bak` à
 * 2 générations est tourné PAR SESSION (D6).
 */
export class CorpusStore {
  private readonly dir: string
  /** Ids dont la prochaine écriture doit tourner les `.bak` (une rotation par
   *  session = par ouverture). Rempli à la lecture, vidé au 1er write suivant. */
  private readonly rotationEnAttente = new Set<string>()

  constructor(dir: string) {
    this.dir = dir
  }

  private get corpusFile() {
    return join(this.dir, 'corpus.json')
  }
  private get entretiensDir() {
    return join(this.dir, 'entretiens')
  }
  private entretienFile(id: string) {
    return join(this.entretiensDir, `${id}.json`)
  }

  private ecrireJsonAtomique(fichier: string, obj: unknown): void {
    const tmp = fichier + '.tmp'
    writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8')
    renameSync(tmp, fichier) // rename atomique : un crash laisse l'ancien fichier intact
  }

  /** Ouvre (ou amorce) le corpus, renvoie ses définitions + membership. */
  ouvrir(): CorpusFichier {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true })
    if (!existsSync(this.entretiensDir)) mkdirSync(this.entretiensDir, { recursive: true })

    if (!existsSync(this.corpusFile)) return this.amorcer()

    const corpus = JSON.parse(readFileSync(this.corpusFile, 'utf8')) as CorpusFichier
    if (!versionSupportee(corpus.formatVersion)) {
      throw new Error(`Version de corpus non supportée : ${corpus.formatVersion}`)
    }
    return corpus
  }

  private amorcer(): CorpusFichier {
    const now = new Date().toISOString()
    const idEnt = 'e1'
    const codebook = {
      cat_001: { id: 'cat_001', nom: 'Famille', ordre: 0, parent: null, actif: true, codeExport: 'cat_001' },
      cat_002: { id: 'cat_002', nom: 'Travail', ordre: 1, parent: null, actif: true, codeExport: 'cat_002' },
      cat_003: { id: 'cat_003', nom: 'Lieu', ordre: 2, parent: null, actif: true, codeExport: 'cat_003' },
    }
    const corpus: CorpusFichier = {
      formatVersion: FORMAT_VERSION,
      codebook,
      variables: {},
      reglesAnon: {},
      personnes: {},
      membership: { [idEnt]: { titre: 'Entretien Karine', date: null, lastModified: now } },
    }
    const entretien: EntretienFichier = {
      formatVersion: FORMAT_VERSION,
      lastModified: now,
      corpsTexte: DOC_SEED,
      annotations: [],
      locuteurs: [
        { index: 1, nom: 'Enquêteur', valeursLoc: {}, personneRef: null },
        { index: 2, nom: 'Karine', valeursLoc: {}, personneRef: null },
      ],
      meta: { valeursGen: {}, audioRef: null },
    }
    this.ecrireJsonAtomique(this.entretienFile(idEnt), entretien)
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return corpus
  }

  /** Lit un entretien. Démarre sa « session » (la prochaine écriture tournera
   *  les `.bak`) et signale s'il est PÉRIMÉ vs le lastModified du membership. */
  lireEntretien(id: string): LectureEntretien {
    const fichier = this.entretienFile(id)
    if (!existsSync(fichier)) return { ok: false, raison: 'absent' }

    const data = JSON.parse(readFileSync(fichier, 'utf8')) as EntretienFichier
    if (!versionSupportee(data.formatVersion)) return { ok: false, raison: 'version' }

    const corpus = this.ouvrir()
    const attendu = corpus.membership[id]?.lastModified
    const perime = attendu != null && data.lastModified < attendu

    this.rotationEnAttente.add(id) // ouverture = début de session
    return { ok: true, data, perime }
  }

  /** Écrit un entretien (atomique + rotation `.bak` si 1re écriture de session)
   *  et met à jour le lastModified du membership. */
  ecrireEntretien(id: string, payload: PayloadEntretien): string {
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

    const corpus = this.ouvrir()
    corpus.membership[id] = {
      titre: corpus.membership[id]?.titre ?? id,
      date: corpus.membership[id]?.date ?? null,
      lastModified: now,
    }
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return now
  }

  /** `.bak1` → `.bak2`, puis copie de l'état courant → `.bak1`. Une génération
   *  par session : les `.bak` capturent l'état d'AVANT les sessions précédentes,
   *  pas les derniers autosaves (D6). */
  private tournerBak(id: string): void {
    const f = this.entretienFile(id)
    const b1 = f + '.bak1'
    const b2 = f + '.bak2'
    if (existsSync(b1)) renameSync(b1, b2)
    if (existsSync(f)) copyFileSync(f, b1)
  }

  creerEntretien(titre: string): { id: string; corpus: CorpusFichier } {
    const corpus = this.ouvrir()
    const id = genId('ent')
    const now = new Date().toISOString()
    const entretien: EntretienFichier = {
      formatVersion: FORMAT_VERSION,
      lastModified: now,
      corpsTexte: DOC_VIDE,
      annotations: [],
      locuteurs: [],
      meta: { valeursGen: {}, audioRef: null },
    }
    this.ecrireJsonAtomique(this.entretienFile(id), entretien)
    corpus.membership[id] = { titre, date: null, lastModified: now }
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return { id, corpus }
  }

  /**
   * Sas d'import : crée un entretien à partir d'une charge utile importée et
   * FUSIONNE son codebook ET ses variables dans le corpus (règle n°3, cf.
   * `corpusModel.fusionnerImport` → double import du même `.sonal` = zéro doublon).
   */
  importerEntretien(
    titre: string,
    payload: PayloadEntretien,
    codebook: Categorie[],
    variables: Variable[] = [],
  ): { id: string; corpus: CorpusFichier } {
    const corpus = this.ouvrir()
    const id = genId('ent')
    const now = new Date().toISOString()
    const entretien: EntretienFichier = { formatVersion: FORMAT_VERSION, lastModified: now, ...payload }
    this.ecrireJsonAtomique(this.entretienFile(id), entretien)

    corpusModel.fusionnerImport(corpus, codebook, variables)
    corpus.membership[id] = { titre, date: null, lastModified: now }
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return { id, corpus }
  }

  renommerEntretien(id: string, titre: string): CorpusFichier {
    const corpus = this.ouvrir()
    if (corpus.membership[id]) {
      corpus.membership[id].titre = titre
      this.ecrireJsonAtomique(this.corpusFile, corpus)
    }
    return corpus
  }

  /** Retire du membership et déplace le fichier (+ ses `.bak`) dans `corbeille/`
   *  — jamais d'effacement (pas de perte silencieuse). */
  supprimerEntretien(id: string): CorpusFichier {
    const corpus = this.ouvrir()
    const corbeille = join(this.dir, 'corbeille')
    if (!existsSync(corbeille)) mkdirSync(corbeille, { recursive: true })
    for (const suffixe of ['.json', '.json.bak1', '.json.bak2']) {
      const src = join(this.entretiensDir, id + suffixe)
      if (existsSync(src)) renameSync(src, join(corbeille, id + suffixe))
    }
    delete corpus.membership[id]
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return corpus
  }

  /** Lit tous les entretiens du membership (I/O) — le carburant des REQUÊTES
   *  pures (usages, matrice). Un fichier absent est ignoré silencieusement. */
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
    const corpus = this.ouvrir()
    const id = corpusModel.ajouterCategorie(corpus, nom, parent)
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return { id, corpus }
  }

  modifierCategorie(id: string, patch: PatchCategorie): CorpusFichier {
    const corpus = this.ouvrir()
    corpusModel.modifierCategorie(corpus, id, patch)
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return corpus
  }

  deplacerCategorie(id: string, sens: -1 | 1): CorpusFichier {
    const corpus = this.ouvrir()
    corpusModel.deplacerCategorie(corpus, id, sens)
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return corpus
  }

  /** Usages d'un code. `exceptId` EXCLUT un entretien du compte (D-S10 : « est-il
   *  utilisé par un AUTRE entretien ? » pour la suppression depuis l'entretien). */
  compterUsagesCode(code: string, exceptId?: string): number {
    const datas = this.chargerEntretiens()
      .filter((e) => e.id !== exceptId)
      .map((e) => e.data)
    return corpusModel.compterUsagesCode(datas, code)
  }

  usagesParCode(): Record<string, number> {
    return corpusModel.usagesParCode(this.datas())
  }

  /** Supprime une catégorie — REFUSÉE tant qu'elle est utilisée (politique
   *  explicite + compteur ; pas de suppression silencieuse d'annotations). */
  supprimerCategorie(id: string, exceptId?: string): ResultatSuppressionCategorie {
    const usages = this.compterUsagesCode(id, exceptId)
    if (usages > 0) return { ok: false, usages }
    const corpus = this.ouvrir()
    corpusModel.retirerCategorie(corpus, id)
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return { ok: true, corpus }
  }

  // ── Variables & modalités (EAV) — lire → appliquer → écrire ─────────────────

  ajouterVariable(lib: string, portee: 'entretien' | 'locuteur'): { id: string; corpus: CorpusFichier } {
    const corpus = this.ouvrir()
    const id = corpusModel.ajouterVariable(corpus, lib, portee, () => genId('var'))
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return { id, corpus }
  }

  modifierVariable(id: string, patch: Partial<Pick<Variable, 'lib' | 'portee' | 'priv'>>): CorpusFichier {
    const corpus = this.ouvrir()
    corpusModel.modifierVariable(corpus, id, patch)
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return corpus
  }

  ajouterModalite(idVar: string, lib: string): CorpusFichier {
    const corpus = this.ouvrir()
    corpusModel.ajouterModalite(corpus, idVar, lib, () => genId('mod'))
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return corpus
  }

  modifierModalite(idVar: string, idMod: string, lib: string): CorpusFichier {
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
    const usages = this.compterUsagesVariable(id)
    if (usages > 0) return { ok: false, usages }
    const corpus = this.ouvrir()
    corpusModel.retirerVariable(corpus, id)
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return { ok: true, corpus }
  }

  supprimerModalite(idVar: string, idMod: string): ResultatSuppression {
    const usages = this.compterUsagesModalite(idVar, idMod)
    if (usages > 0) return { ok: false, usages }
    const corpus = this.ouvrir()
    corpusModel.retirerModalite(corpus, idVar, idMod)
    this.ecrireJsonAtomique(this.corpusFile, corpus)
    return { ok: true, corpus }
  }

  matriceCorpus(): MatriceCorpus {
    return corpusModel.matriceCorpus(this.chargerEntretiens())
  }

  /** Pose une valeur EAV dans UN entretien (D-S11 : édition depuis la table de
   *  données). Écriture ciblée atomique, SANS rotation `.bak` (valeur scalaire,
   *  trop granulaire). Met à jour le watermark de fraîcheur du membership pour
   *  rester cohérent avec `ecrireEntretien`. Renvoie false si l'entretien manque. */
  poserValeur(entretienId: string, cible: CibleValeur, idVar: string, idMod: string): boolean {
    const f = this.entretienFile(entretienId)
    if (!existsSync(f)) return false
    const data = JSON.parse(readFileSync(f, 'utf8')) as EntretienFichier
    corpusModel.poserValeur(data, cible, idVar, idMod)
    const now = new Date().toISOString()
    data.lastModified = now
    this.ecrireJsonAtomique(f, data)

    const corpus = this.ouvrir()
    if (corpus.membership[entretienId]) {
      corpus.membership[entretienId].lastModified = now
      this.ecrireJsonAtomique(this.corpusFile, corpus)
    }
    return true
  }
}
