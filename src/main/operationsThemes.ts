import { createHash, randomUUID } from 'node:crypto'
import { versionSupportee, type CorpusFichier, type EntretienFichier } from '../shared/format'
import { aplatir } from '../shared/entretien/anon'
import {
  appliquerReaffectationsTheme,
  construirePlanEntretienTheme,
  finaliserDefinitionsOperationTheme,
  inventorierCodagesThemes,
  operationThemeRetireThemes,
  preparerDefinitionsOperationTheme,
  RefusOperationTheme,
  sourcesOperationTheme,
  sourcesReaffecteesOperationTheme,
  sourcesSupprimeesOperationTheme,
  verifierDemandeOperationTheme,
  verifierRepartitionOperationTheme,
  type ApercuOperationTheme,
  type DemandeOperationTheme,
  type DetailCodageOperationTheme,
  type DetailsOperationTheme,
  type OptionsExecutionOperationTheme,
  type ProgressionOperationTheme,
  type ReferenceCodage,
  type ResultatOperationTheme,
} from '../shared/corpus/themes'
import type { PlanRemplacementEntretiens } from './transactionsFichiers'

export type EntretienInstantaneTheme =
  | { id: string; titre: string; ok: true; avant: EntretienFichier; data: EntretienFichier }
  | { id: string; titre: string; ok: false; motif: string }

export interface InstantaneOperationTheme {
  corpus: CorpusFichier
  entretiens: EntretienInstantaneTheme[]
}

interface DependancesOperationsThemes {
  lire: () => InstantaneOperationTheme
  appliquer: (plan: PlanRemplacementEntretiens) => void
  verifierEcriture: () => void
  transactionEnAttente: () => boolean
  genIdCategorie: () => string
  inventairePartiel?: boolean
  maintenant?: () => number
  genIdOperation?: () => string
  dureeCacheMs?: number
  maxApercus?: number
  maxOctetsCache?: number
}

export interface ManifesteExecutionTheme {
  apercu: ApercuOperationTheme
  corpus: string
  entretiens: Map<string, string>
}

interface ApercuMemorise {
  demande: DemandeOperationTheme
  apercu: ApercuOperationTheme
  corpus: string
  entretiens: Map<string, string>
  details: Map<string, DetailsOperationTheme>
  expire: number
  octets: number
}

function empreinte(valeur: unknown): string {
  return createHash('sha256').update(JSON.stringify(valeur)).digest('hex')
}

/** Les extraits restent courts ; les codages sans texte gardent leur identité et leurs positions. */
function detailsCodages(
  entree: Extract<EntretienInstantaneTheme, { ok: true }>,
  sources: readonly string[],
): DetailCodageOperationTheme[] {
  const plat = aplatir(entree.data.corpsTexte)
  let offset = 0
  const blocs = plat.blocs.map((bloc) => {
    const resultat = { ...bloc, offset }
    offset += bloc.longueur + 1
    return resultat
  })
  return inventorierCodagesThemes(entree.data, sources).codages.map((codage) => {
    const morceaux = codage.orphelin ? [] : blocs.flatMap((bloc) => {
      const from = Math.max(codage.from, bloc.debut)
      const to = Math.min(codage.to, bloc.debut + bloc.longueur)
      return from < to ? [{ from: bloc.offset + from - bloc.debut, to: bloc.offset + to - bloc.debut }] : []
    })
    const from = morceaux[0]?.from
    const to = morceaux.at(-1)?.to
    return {
      ...codage,
      codage: { entretienId: entree.id, annotationId: codage.annotationId },
      avant: from === undefined ? '' : plat.texte.slice(Math.max(0, from - 80), from),
      extrait: from === undefined || to === undefined ? '' : plat.texte.slice(from, Math.min(to, from + 1000)),
      apres: to === undefined ? '' : plat.texte.slice(to, to + 80),
    }
  })
}

function referencesSources(instantane: InstantaneOperationTheme, sources: readonly string[]): ReferenceCodage[] {
  return instantane.entretiens.flatMap((e) => e.ok
    ? inventorierCodagesThemes(e.data, sources).codages.map((a) => ({ entretienId: e.id, annotationId: a.annotationId }))
    : [])
}

/** Les candidats ne doivent pas publier de codage ni de parent sans définition. */
export function verifierReferencesThemes(corpus: CorpusFichier, entretiens: EntretienFichier[]): void {
  for (const [id, categorie] of Object.entries(corpus.codebook)) {
    if (categorie.id !== id) throw new RefusOperationTheme('Identité de catégorie incohérente.')
    const visites = new Set<string>([id])
    let parent = categorie.parent
    while (parent !== null) {
      if (!Object.hasOwn(corpus.codebook, parent) || visites.has(parent)) {
        throw new RefusOperationTheme('La hiérarchie des thématiques est invalide.')
      }
      visites.add(parent)
      parent = corpus.codebook[parent].parent
    }
  }
  for (const entretien of entretiens) {
    for (const annotation of entretien.annotations) {
      if (annotation.type === 'codage' && (!annotation.code || !Object.hasOwn(corpus.codebook, annotation.code))) {
        throw new RefusOperationTheme('Un codage référence une thématique absente du codebook.')
      }
    }
  }
}

function dictionnaire(valeur: unknown): boolean {
  return valeur !== null && typeof valeur === 'object' && !Array.isArray(valeur)
}

/** Décode le corpus sans ouvrir le store ni migrer les fichiers. */
export function decoderCorpusTheme(contenu: string): CorpusFichier {
  const corpus = JSON.parse(contenu) as CorpusFichier
  if (!corpus || !versionSupportee(corpus.formatVersion)) {
    throw new RefusOperationTheme('Version de corpus non supportée pour l’atelier. Rouvrez le corpus pour le migrer.')
  }
  if (!dictionnaire(corpus.codebook) || !dictionnaire(corpus.membership)) {
    throw new RefusOperationTheme('Le corpus est incomplet : codebook ou membership invalide.')
  }
  return corpus
}

/** Vérifie les données adaptées avant de compter les codages ou produire leurs extraits. */
export function validerEntretienTheme(data: EntretienFichier): void {
  if (!Array.isArray(data.annotations) || !Array.isArray(data.ancres) || !Array.isArray(data.locuteurs)
    || !data.meta || !dictionnaire(data.meta.valeursGen)
    || !Object.hasOwn(data, 'corpsTexte')
    || data.annotations.some((a) => !a || typeof a.id !== 'string' || !a.id
      || !['codage', 'anon', 'commentaire'].includes(a.type)
      || !Number.isInteger(a.from) || !Number.isInteger(a.to))) {
    throw new RefusOperationTheme('Fichier d’entretien incomplet ou annotations invalides.')
  }
  aplatir(data.corpsTexte)
}

/** Aperçus temporaires ; aucune transcription complète n'est conservée dans le cache. */
export class OperationsThemesCorpus {
  private readonly cache = new Map<string, ApercuMemorise>()
  private readonly maintenant: () => number
  private readonly genIdOperation: () => string

  constructor(private readonly deps: DependancesOperationsThemes) {
    this.maintenant = deps.maintenant ?? Date.now
    this.genIdOperation = deps.genIdOperation ?? randomUUID
  }

  vider(): void {
    this.cache.clear()
  }

  analyser(demande: DemandeOperationTheme, operationPrecedente?: string,
    destinationsPersistantes?: Array<{ token: string; id: string }>): ApercuOperationTheme {
    this.exigerSansTransaction()
    const precedent = operationPrecedente ? this.exigerApercu(operationPrecedente) : undefined
    const instantane = this.deps.lire()
    verifierDemandeOperationTheme(instantane.corpus, demande)
    if (precedent) this.verifierFraicheur(precedent, instantane)
    const operationId = this.genIdOperation()
    const details = new Map<string, DetailsOperationTheme>()
    const manifestes = new Map<string, string>()
    const obstacles: ApercuOperationTheme['obstacles'] = []
    const parEntretien: ApercuOperationTheme['parEntretien'] = []
    let doublonsPrevisibles = 0
    // Les identités d'aperçu ne sont jamais persistées ni retournées comme destinations.
    let n = 0
    const definitionsNouvelles = preparerDefinitionsOperationTheme(instantane.corpus, demande, () => {
      let id: string
      do { id = `apercu-theme-${++n}` } while (Object.hasOwn(instantane.corpus.codebook, id))
      return id
    })
    const definitions = destinationsPersistantes
      ? { corpus: structuredClone(instantane.corpus), ciblesCreees: structuredClone(destinationsPersistantes) }
      : definitionsNouvelles
    if (destinationsPersistantes) {
      const tokens = definitionsNouvelles.ciblesCreees.map((c) => c.token)
      if (destinationsPersistantes.length !== tokens.length
        || new Set(destinationsPersistantes.map((c) => c.token)).size !== tokens.length
        || destinationsPersistantes.some((c) => !tokens.includes(c.token)
          || sourcesOperationTheme(demande).includes(c.id) || !Object.hasOwn(instantane.corpus.codebook, c.id))) {
        throw new RefusOperationTheme('Les destinations persistées ne correspondent pas à la demande.')
      }
    }
    try {
      verifierReferencesThemes(definitions.corpus, [])
    } catch (erreur) {
      obstacles.push({ phase: 'definitions', motif: messageErreur(erreur) })
    }
    const sourcesReaffectees = sourcesReaffecteesOperationTheme(demande)
    for (const entree of instantane.entretiens) {
      if (!entree.ok) {
        obstacles.push({ phase: 'entretiens', entretienId: entree.id, motif: entree.motif })
        continue
      }
      manifestes.set(entree.id, empreinte(entree.avant))
      const codages = detailsCodages(entree, sourcesReaffectees)
      details.set(entree.id, { operationId, entretienId: entree.id, codages })
      let aModifier = false
      try {
        const plan = construirePlanEntretienTheme(entree.data, entree.id, demande, definitions.ciblesCreees)
        const mutation = appliquerReaffectationsTheme(entree.data, plan)
        aModifier = mutation.reaffectes + mutation.doublonsSupprimes > 0
        doublonsPrevisibles += mutation.doublonsSupprimes
        verifierReferencesThemes(definitions.corpus, [mutation.entretien])
      } catch (erreur) {
        obstacles.push({ phase: 'entretiens', entretienId: entree.id, motif: messageErreur(erreur) })
      }
      parEntretien.push({
        id: entree.id, titre: entree.titre, passages: codages.length,
        orphelins: codages.filter((a) => a.orphelin).length, aModifier,
      })
    }
    try {
      verifierRepartitionOperationTheme(demande, referencesSources(instantane, sourcesReaffectees))
    } catch (erreur) {
      obstacles.push({ phase: 'finalisation', motif: messageErreur(erreur) })
    }
    const apercu: ApercuOperationTheme = {
      operationId, sources: sourcesOperationTheme(demande), parEntretien,
      totaux: {
        entretiens: parEntretien.filter((e) => e.passages > 0).length,
        passages: parEntretien.reduce((n, e) => n + e.passages, 0),
        orphelins: parEntretien.reduce((n, e) => n + e.orphelins, 0), doublonsPrevisibles,
        sousThemesDeplaces: demande.type === 'fusion' ? (() => {
          const retirees = new Set(sourcesSupprimeesOperationTheme(demande))
          return Object.values(instantane.corpus.codebook)
            .filter((c) => retirees.has(c.parent ?? '') && !retirees.has(c.id)).length
        })() : 0,
      },
      faisable: this.deps.inventairePartiel
        ? obstacles.every((o) => o.phase === 'entretiens') : obstacles.length === 0,
      motif: obstacles[0]?.motif, obstacles,
    }
    const memorise: ApercuMemorise = {
      demande: structuredClone(demande), apercu, corpus: empreinte(instantane.corpus),
      entretiens: manifestes, details,
      expire: this.maintenant() + (this.deps.dureeCacheMs ?? 15 * 60_000),
      octets: Buffer.byteLength(JSON.stringify([demande, apercu, [...details], [...manifestes]])),
    }
    this.memoriser(operationId, memorise)
    if (operationPrecedente) this.cache.delete(operationPrecedente)
    return structuredClone(apercu)
  }

  details(operationId: string, entretienId: string): DetailsOperationTheme {
    const detail = this.exigerApercu(operationId).details.get(entretienId)
    if (!detail) throw new RefusOperationTheme('Entretien absent ou indisponible dans cet aperçu.')
    return structuredClone(detail)
  }

  completerApercu(operationId: string, complement: Partial<Pick<ApercuOperationTheme,
    'faisable' | 'motif' | 'obstacles' | 'execution' | 'instantaneGitLab' | 'disponibiliteGitLab'>>): ApercuOperationTheme {
    const avant = this.exigerApercu(operationId)
    if (complement.faisable && !avant.apercu.faisable) throw new RefusOperationTheme('Un obstacle métier ne peut pas être levé par une observation distante.')
    const apercu = { ...avant.apercu, ...structuredClone(complement) }
    const supplement = Buffer.byteLength(JSON.stringify(apercu)) - Buffer.byteLength(JSON.stringify(avant.apercu))
    this.cache.delete(operationId)
    this.memoriser(operationId, { ...avant, apercu, octets: avant.octets + supplement })
    return structuredClone(apercu)
  }

  /** Consomme un aperçu confirmé pour un publieur distant, sans exposer les transcriptions. */
  consommer(operationId: string, demande: DemandeOperationTheme): ManifesteExecutionTheme {
    const memorise = this.exigerApercu(operationId)
    if (empreinte(demande) !== empreinte(memorise.demande)) {
      throw new RefusOperationTheme('La demande a changé : recalculez l’aperçu.')
    }
    if (!memorise.apercu.faisable) throw new RefusOperationTheme(memorise.apercu.motif ?? 'Aperçu infaisable.')
    const manifeste = structuredClone({ apercu: memorise.apercu, corpus: memorise.corpus, entretiens: memorise.entretiens })
    this.cache.delete(operationId)
    return manifeste
  }

  executer(
    operationId: string,
    demande: DemandeOperationTheme,
    options: OptionsExecutionOperationTheme,
    progression?: (etat: ProgressionOperationTheme) => void,
  ): ResultatOperationTheme {
    let plan: PlanRemplacementEntretiens
    let reaffectes = 0
    let doublonsSupprimes = 0
    let modifies = 0
    try {
      this.deps.verifierEcriture()
      this.exigerSansTransaction()
      if (options?.entretiens !== 'tous-prevus') {
        throw new RefusOperationTheme('Le lancement local doit traiter tous les entretiens prévus.')
      }
      const memorise = this.exigerApercu(operationId)
      if (empreinte(demande) !== empreinte(memorise.demande)) {
        throw new RefusOperationTheme('La demande a changé : recalculez l’aperçu.')
      }
      if (!memorise.apercu.faisable) throw new RefusOperationTheme(memorise.apercu.motif ?? 'Aperçu infaisable.')
      const instantane = this.deps.lire()
      this.verifierFraicheur(memorise, instantane)
      verifierDemandeOperationTheme(instantane.corpus, demande)
      verifierRepartitionOperationTheme(demande,
        referencesSources(instantane, sourcesReaffecteesOperationTheme(demande)))
      const definitions = preparerDefinitionsOperationTheme(instantane.corpus, demande, this.deps.genIdCategorie)
      const suppression = operationThemeRetireThemes(demande)
      const entretiens: PlanRemplacementEntretiens['entretiens'] = []
      const candidats: EntretienFichier[] = []
      const restants: ReferenceCodage[] = []
      const sourcesSupprimees = sourcesSupprimeesOperationTheme(demande)
      for (const entree of instantane.entretiens) {
        if (!entree.ok) throw new RefusOperationTheme(entree.motif)
        const mutation = appliquerReaffectationsTheme(entree.data,
          construirePlanEntretienTheme(entree.data, entree.id, demande, definitions.ciblesCreees))
        candidats.push(mutation.entretien)
        restants.push(...inventorierCodagesThemes(mutation.entretien, sourcesSupprimees).codages
          .map((a) => ({ entretienId: entree.id, annotationId: a.annotationId })))
        if (mutation.reaffectes + mutation.doublonsSupprimes === 0) {
          // Une suppression garde aussi les entretiens vérifiés mais inchangés.
          if (suppression) entretiens.push({ id: entree.id, avant: entree.avant, apres: entree.avant })
          continue
        }
        modifies++
        mutation.entretien.lastModified = new Date(this.maintenant()).toISOString()
        entretiens.push({ id: entree.id, avant: entree.avant, apres: mutation.entretien })
        reaffectes += mutation.reaffectes
        doublonsSupprimes += mutation.doublonsSupprimes
      }
      const corpusApres = finaliserDefinitionsOperationTheme(definitions.corpus, demande, restants)
      verifierReferencesThemes(corpusApres, candidats)
      const creation = definitions.ciblesCreees.length > 0
      plan = {
        operation: 'remplacement', id: operationId,
        corpusAvant: instantane.corpus, corpusApres, entretiens,
        ...(creation && suppression ? { corpusIntermediaire: definitions.corpus } : {}),
        ordre: creation && !suppression ? 'corpus-puis-entretiens' : 'entretiens-puis-corpus',
      }
    } catch (erreur) {
      return { statut: 'non-appliquee', motif: messageErreur(erreur) }
    }
    // Un même aperçu ne lance jamais deux transactions, même après un résultat inconnu.
    this.cache.delete(operationId)
    this.signaler(progression, { operationId, phase: 'entretiens', termines: 0, total: modifies, reussis: 0, echecs: 0 })
    try {
      this.deps.appliquer(plan)
    } catch (erreur) {
      if (this.deps.transactionEnAttente()) {
        return { statut: 'indeterminee', operationId, motif: `Transaction locale à reprendre à l’ouverture : ${messageErreur(erreur)}` }
      }
      return { statut: 'non-appliquee', motif: messageErreur(erreur) }
    }
    this.signaler(progression, {
      operationId, phase: 'finalisation', termines: modifies,
      total: modifies, reussis: modifies, echecs: 0,
    })
    return { statut: 'appliquee', corpus: plan.corpusApres, entretiens: modifies, reaffectes, doublonsSupprimes }
  }

  private signaler(callback: ((etat: ProgressionOperationTheme) => void) | undefined, etat: ProgressionOperationTheme): void {
    try { callback?.(etat) } catch { /* Un panneau fermé ne change pas le résultat de la transaction. */ }
  }

  private exigerSansTransaction(): void {
    if (this.deps.transactionEnAttente()) {
      throw new RefusOperationTheme('Une transaction locale doit être reprise : rouvrez le corpus avant un nouvel aperçu.')
    }
  }

  private verifierFraicheur(memorise: ApercuMemorise, instantane: InstantaneOperationTheme): void {
    const obsolete = this.deps.inventairePartiel
      ? [...memorise.entretiens].some(([id, avant]) => {
        const frais = instantane.entretiens.find((e) => e.id === id)
        return !frais?.ok || avant !== empreinte(frais.avant)
      })
      : instantane.entretiens.length !== memorise.entretiens.size
        || instantane.entretiens.some((e) => !e.ok || memorise.entretiens.get(e.id) !== empreinte(e.avant))
    if (memorise.corpus !== empreinte(instantane.corpus) || obsolete) {
      throw new RefusOperationTheme('Le corpus ou un entretien a changé : recalculez l’aperçu et les choix de répartition.')
    }
  }

  private exigerApercu(operationId: string): ApercuMemorise {
    this.purger()
    const memorise = this.cache.get(operationId)
    if (!memorise) throw new RefusOperationTheme('Aperçu absent, expiré ou appartenant à un autre corpus : recalculez-le.')
    return memorise
  }

  private purger(): void {
    for (const [id, memorise] of this.cache) if (memorise.expire <= this.maintenant()) this.cache.delete(id)
  }

  private memoriser(id: string, memorise: ApercuMemorise): void {
    this.purger()
    const maxOctets = this.deps.maxOctetsCache ?? 32 * 1024 * 1024
    const maxApercus = this.deps.maxApercus ?? 8
    if (memorise.octets > maxOctets || maxApercus < 1) {
      throw new RefusOperationTheme('L’aperçu est trop volumineux pour être conservé : réduisez son périmètre.')
    }
    while (this.cache.size >= maxApercus
      || [...this.cache.values()].reduce((total, a) => total + a.octets, 0) + memorise.octets > maxOctets) {
      this.cache.delete(this.cache.keys().next().value!)
    }
    this.cache.set(id, memorise)
  }
}

export { empreinte as empreinteTheme }

function messageErreur(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur)
}
