import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier, type RegleAnon } from '../format'
import { aliasesCommuns, validerDefinitionAnon } from './definitionsAnon'
import { inventorierRenommageAnon, type SourceRenommageAnon, type UsageRenommageAnon, type MotifRefusRenommage } from './renommageAnon'
import { validerMemoireLocale, normaliserPseudosDeclares, type DefinitionAnonLocale } from '../entretien/anon/definitionsLocales'
import { parserAliases } from '../entretien/anon/alias'
import { aplatir } from '../entretien/anon/anonymisation'
import { textePlage } from '../entretien/anon/classification'

export interface DemandeDissociationAnon { regleId: string }
export type MotifRefusDissociation = MotifRefusRenommage | 'memoire-locale-invalide' | 'decision-locale-recouvrante' | 'definition-corpus-recouvrante'
export interface ObstacleDissociationAnon { code: MotifRefusDissociation; entretienId: string; annotationId?: string }
export interface InventaireDissociationEntretien {
  id: string; titre: string; annotations: number; anonymisees: number; exceptions: number; incluses: number
  independantes: number; attentes: number; usages: Omit<UsageRenommageAnon, 'renomme'>[]
}
export interface BilanDissociationAnon {
  annotations: number; anonymisees: number; exceptions: number; incluses: number
  entretiens: number; definitionsLocales: number; regleRetiree: boolean
}
export interface InventaireDissociationAnon {
  demande: DemandeDissociationAnon; regle: RegleAnon; definitionLocale: DefinitionAnonLocale
  entretiens: InventaireDissociationEntretien[]; obstacles: ObstacleDissociationAnon[]
  bilan: BilanDissociationAnon; faisable: boolean
}
export interface ApercuDissociationAnon extends InventaireDissociationAnon {
  token: string; lecture: 'local' | 'gitlab' | 'webdav'; applicationDisponible: boolean
  reprise?: string; ciblesRetirees?: string[]; motifIndisponible?: string
}
export interface BilanDissociationDistant extends BilanDissociationAnon {
  operationId: string; statut: 'termine' | 'partiel' | 'indetermine'
  differes: Array<{ id: string; motif: string }>; nouvellesCibles: string[]; motif?: string
}
export interface SuiviDissociationAnon extends BilanDissociationDistant {
  demande: DemandeDissociationAnon
}
export type SourceDissociationAnon = SourceRenommageAnon

/** Retire le lien partagé sans changer les choix, positions, états ni identités des décisions. */
export function inventorierDissociationAnon(corpus: CorpusFichier, sources: SourceDissociationAnon[], demande: DemandeDissociationAnon): InventaireDissociationAnon {
  if (!demande || typeof demande.regleId !== 'string' || !Object.hasOwn(corpus.reglesAnon ?? {}, demande.regleId)) throw new Error('La règle à dissocier est absente ou la demande est invalide.')
  if (corpus.formatVersion !== FORMAT_VERSION) throw new Error('Enregistrez le corpus au format actuel avant une dissociation globale.')
  const regle = structuredClone(corpus.reglesAnon[demande.regleId])
  const definition = validerDefinitionAnon(regle.entite, regle.pseudos, regle.categorie)
  if (regle.id !== demande.regleId || JSON.stringify(regle.entite) !== JSON.stringify(definition.entite)
    || JSON.stringify(regle.pseudos) !== JSON.stringify(definition.pseudos) || regle.categorie !== definition.categorie) throw new Error('Normalisez la définition sans ambiguïté avant de la dissocier.')
  const obstacles: ObstacleDissociationAnon[] = []
  const lisibles = sources.map((s) => {
    const d = s.data
    if (!d || !Array.isArray(d.annotations) || d.annotations.some((a) => !a || typeof a !== 'object')) return { id: s.id, titre: s.titre }
    try { aplatir(d.corpsTexte) } catch { return { id: s.id, titre: s.titre } }
    if (d.annotations.some((a) => a.regle !== undefined && typeof a.regle !== 'string')) obstacles.push({ code: 'annotation-invalide', entretienId: s.id })
    if (d.annotations.some((a) => a.regle === regle.id)) {
      try { validerMemoireLocale(d.definitionsAnonLocales ?? []) }
      catch {
        obstacles.push({ code: 'memoire-locale-invalide', entretienId: s.id })
        return { ...s, data: { ...d, definitionsAnonLocales: [] } }
      }
    }
    return s
  })
  // Les anciens choix publiés ne deviennent pas des variantes déclarées.
  const choisis = lisibles.flatMap((s) => s.data?.annotations.filter((a) => a.regle === regle.id && typeof a.pseudo === 'string' && a.pseudo.trim()).map((a) => a.pseudo!) ?? [])
  const controle = inventorierRenommageAnon(corpus, lisibles, { regleId: regle.id, ancienPseudo: regle.pseudos[0], nouveauPseudo: regle.pseudos[0] }, choisis)
  obstacles.push(...controle.obstacles)
  const entretiens: InventaireDissociationEntretien[] = controle.entretiens.map((e) => ({ id: e.id, titre: e.titre,
    annotations: e.usages.length, anonymisees: e.usages.filter((u) => u.etat === 'anonymise').length,
    exceptions: e.exceptions, incluses: e.usages.filter((u) => u.incluse).length,
    independantes: e.independantes, attentes: e.attentes,
    usages: e.usages.map(({ renomme: _renomme, ...u }) => u) }))
  for (const e of entretiens) {
    const data = lisibles.find((s) => s.id === e.id)?.data
    if (!data) continue
    if (data.annotations.some((a) => a.regle === regle.id && a.type !== 'anon')) obstacles.push({ code: 'annotation-invalide', entretienId: e.id })
    if (!e.annotations) continue
    if (data.annotations.some((a) => a.regle === regle.id && (typeof a.id !== 'string' || !a.id.trim() || (a.pseudo !== undefined && typeof a.pseudo !== 'string')))) obstacles.push({ code: 'annotation-invalide', entretienId: e.id })
    try { validerMemoireLocale(data.definitionsAnonLocales ?? []) }
    catch { obstacles.push({ code: 'memoire-locale-invalide', entretienId: e.id }); continue }
    const plat = aplatir(data.corpsTexte)
    for (const a of data.annotations) {
      if (a.type === 'anon' && !a.regle && aliasesCommuns([textePlage(plat, a.from, a.to)], regle.entite)) {
        obstacles.push({ code: 'decision-locale-recouvrante', entretienId: e.id, annotationId: a.id })
      }
    }
    try {
      const brouillons = data.brouillonsAnon ?? []
      if (!Array.isArray(brouillons) || brouillons.some((b) => !b || typeof b.entite !== 'string' || typeof b.pseudo !== 'string')) throw new Error()
      const locales = [...brouillons.map((b) => b.entite), ...Object.keys(normaliserPseudosDeclares(data.pseudosDeclares ?? {}))]
      if (locales.some((entite) => aliasesCommuns(parserAliases(entite), regle.entite))) obstacles.push({ code: 'memoire-locale-recouvrante', entretienId: e.id })
    } catch { obstacles.push({ code: 'memoire-locale-invalide', entretienId: e.id }) }
    if (Object.values(corpus.reglesAnon).some((r) => r.id !== regle.id && aliasesCommuns(r.entite, regle.entite))) obstacles.push({ code: 'definition-corpus-recouvrante', entretienId: e.id })
  }
  const cibles = entretiens.filter((e) => e.annotations)
  const bilan: BilanDissociationAnon = { annotations: 0, anonymisees: 0, exceptions: 0, incluses: 0,
    entretiens: cibles.length, definitionsLocales: cibles.length, regleRetiree: true }
  for (const e of cibles) for (const k of ['annotations', 'anonymisees', 'exceptions', 'incluses'] as const) bilan[k] += e[k]
  return { demande: { regleId: regle.id }, regle, definitionLocale: { ...definition, etat: 'declaration' }, entretiens,
    obstacles, bilan, faisable: obstacles.length === 0 }
}

/** Prépare toutes les mémoires locales avant de retirer la définition partagée. */
export function preparerDissociationAnon(corpus: CorpusFichier, sources: SourceDissociationAnon[], demande: DemandeDissociationAnon) {
  const inventaire = inventorierDissociationAnon(corpus, sources, demande)
  if (!inventaire.faisable) throw new Error('Résolvez les sources ou collisions de l’inventaire avant de dissocier. Aucune mutation préparée.')
  const corpusApres = structuredClone(corpus)
  const entretiens: Array<{ id: string; avant: EntretienFichier; apres: EntretienFichier }> = []
  for (const e of inventaire.entretiens) {
    if (!e.annotations) continue
    const avant = sources.find((s) => s.id === e.id)!.data!
    const apres = structuredClone(avant)
    apres.definitionsAnonLocales = [...(apres.definitionsAnonLocales ?? []), structuredClone(inventaire.definitionLocale)]
    for (const a of apres.annotations) if (a.type === 'anon' && a.regle === demande.regleId) delete a.regle
    entretiens.push({ id: e.id, avant: structuredClone(avant), apres })
  }
  if (Object.keys(corpus.membership).some((id) => (entretiens.find((e) => e.id === id)?.apres ?? sources.find((s) => s.id === id)!.data!).annotations.some((a) => a.regle === demande.regleId))) throw new Error('Des références subsistent. Aucun retrait de définition autorisé.')
  delete corpusApres.reglesAnon[demande.regleId]
  return { inventaire, corpusApres, entretiens, bilan: inventaire.bilan }
}
