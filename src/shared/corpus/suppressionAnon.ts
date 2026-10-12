import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier, type RegleAnon } from '../format'
import { inventorierRenommageAnon, type SourceRenommageAnon, type UsageRenommageAnon, type MotifRefusRenommage } from './renommageAnon'
import { validerDefinitionAnon } from './definitionsAnon'
import { exigerAbsenceSuppressionAnon } from './barriereSuppressionAnon'
import { validerMemoireLocale } from '../entretien/anon/definitionsLocales'
import { aplatir } from '../entretien/anon/anonymisation'
import { annotationVisible, textePlage } from '../entretien/anon/classification'

export interface DemandeSuppressionAnon { regleId: string }
export type MotifRefusSuppressionAnon = MotifRefusRenommage | 'memoire-locale-invalide'
export interface BilanSuppressionAnon {
  annotations: number; anonymisees: number; exceptions: number; inclusesRetirees: number
  inclusesRevelees: number; entretiens: number; regleRetiree: boolean
}
export interface InventaireSuppressionEntretien {
  id: string; titre: string; annotations: number; anonymisees: number; exceptions: number
  inclusesRetirees: number; inclusesRevelees: number; independantes: number; attentes: number
  usages: Omit<UsageRenommageAnon, 'renomme'>[]; decisionsRevelees: Omit<UsageRenommageAnon, 'renomme'>[]
}
export interface InventaireSuppressionAnon {
  demande: DemandeSuppressionAnon; regle: RegleAnon; entretiens: InventaireSuppressionEntretien[]
  obstacles: Array<{ code: MotifRefusSuppressionAnon; entretienId: string; annotationId?: string }>
  bilan: BilanSuppressionAnon; faisable: boolean
}
export interface ApercuSuppressionAnon extends InventaireSuppressionAnon {
  token: string; lecture: 'local' | 'gitlab' | 'webdav'; applicationDisponible: boolean
  reprise?: string; ciblesRetirees?: string[]; motifIndisponible?: string
}
export interface BilanSuppressionDistant extends BilanSuppressionAnon {
  operationId: string; statut: 'termine' | 'partiel' | 'indetermine'; miroirIncomplet: boolean
  differes: Array<{ id: string; motif: string }>; nouvellesCibles: string[]; motif?: string
}
export interface SuiviSuppressionAnon extends BilanSuppressionDistant { demande: DemandeSuppressionAnon }
export type SourceSuppressionAnon = SourceRenommageAnon

/** Seul le lien explicite attribue une décision à la règle supprimée. */
export function inventorierSuppressionAnon(corpus: CorpusFichier, sources: SourceSuppressionAnon[], demande: DemandeSuppressionAnon): InventaireSuppressionAnon {
  if (!demande || typeof demande.regleId !== 'string' || !Object.hasOwn(corpus.reglesAnon ?? {}, demande.regleId)) throw new Error('La règle à supprimer est absente ou la demande est invalide.')
  if (corpus.formatVersion !== FORMAT_VERSION) throw new Error('Enregistrez le corpus au format actuel avant une suppression globale.')
  if (corpus.dissociationAnon !== undefined) throw new Error('Une dissociation est engagée. Aucun retrait de règle autorisé.')
  exigerAbsenceSuppressionAnon(corpus)
  const regle = structuredClone(corpus.reglesAnon[demande.regleId])
  const definition = validerDefinitionAnon(regle.entite, regle.pseudos, regle.categorie)
  if (regle.id !== demande.regleId || JSON.stringify(regle.entite) !== JSON.stringify(definition.entite)
    || JSON.stringify(regle.pseudos) !== JSON.stringify(definition.pseudos) || regle.categorie !== definition.categorie) throw new Error('Normalisez la définition sans ambiguïté avant de la supprimer.')
  const obstacles: InventaireSuppressionAnon['obstacles'] = []
  const lisibles: SourceSuppressionAnon[] = sources.map((s) => {
    const d = s.data
    if (!d || !Array.isArray(d.annotations) || d.annotations.some((a) => !a || typeof a !== 'object')) return { id: s.id, titre: s.titre }
    try { aplatir(d.corpsTexte) } catch { return { id: s.id, titre: s.titre } }
    if (d.annotations.some((a) => a.regle !== undefined && typeof a.regle !== 'string')) obstacles.push({ code: 'annotation-invalide', entretienId: s.id })
    if (d.annotations.some((a) => a.regle === regle.id)) {
      if (d.annotations.some((a) => typeof a.id !== 'string' || !a.id.trim())) {
        obstacles.push({ code: 'annotations-ambigues', entretienId: s.id })
        return { id: s.id, titre: s.titre }
      }
      if (d.annotations.some((a) => a.regle === regle.id && (a.type !== 'anon' || typeof a.id !== 'string' || !a.id.trim()
        || (a.pseudo !== undefined && typeof a.pseudo !== 'string')))) obstacles.push({ code: 'annotation-invalide', entretienId: s.id })
      try { validerMemoireLocale(d.definitionsAnonLocales ?? []) }
      catch { obstacles.push({ code: 'memoire-locale-invalide', entretienId: s.id }) }
    }
    // La mémoire indépendante reste intacte ; son recouvrement ne demande aucune fusion.
    return { ...s, data: { ...d, definitionsAnonLocales: [] } }
  })
  const choisis = lisibles.flatMap((s) => s.data?.annotations.filter((a) => a.regle === regle.id && typeof a.pseudo === 'string' && a.pseudo.trim()).map((a) => a.pseudo!) ?? [])
  const controle = inventorierRenommageAnon(corpus, lisibles, { regleId: regle.id, ancienPseudo: regle.pseudos[0], nouveauPseudo: regle.pseudos[0] }, choisis)
  obstacles.push(...controle.obstacles)
  const entretiens: InventaireSuppressionEntretien[] = controle.entretiens.map((e) => {
    const d = lisibles.find((s) => s.id === e.id)?.data
    const plat = d ? aplatir(d.corpsTexte) : null
    const restantes = d?.annotations.filter((a) => a.regle !== regle.id) ?? []
    const revelees = restantes.filter((a) => a.type === 'anon' && annotationVisible(d!.annotations, a)?.id !== a.id && annotationVisible(restantes, a)?.id === a.id)
    return { id: e.id, titre: e.titre, annotations: e.usages.length,
      anonymisees: e.usages.filter((u) => u.etat === 'anonymise').length, exceptions: e.exceptions,
      inclusesRetirees: e.usages.filter((u) => u.incluse).length, inclusesRevelees: revelees.length,
      independantes: e.independantes, attentes: e.attentes, usages: e.usages.map(({ renomme: _r, ...u }) => u),
      decisionsRevelees: revelees.map((a) => ({ annotationId: a.id, from: a.from, to: a.to, extrait: textePlage(plat!, a.from, a.to).slice(0, 1000),
        etat: a.etat === 'exception' ? 'exception' : 'anonymise', incluse: false, pseudo: a.pseudo })) }
  })
  const bilan: BilanSuppressionAnon = { annotations: 0, anonymisees: 0, exceptions: 0, inclusesRetirees: 0, inclusesRevelees: 0,
    entretiens: entretiens.filter((e) => e.annotations).length, regleRetiree: true }
  for (const e of entretiens) for (const k of ['annotations', 'anonymisees', 'exceptions', 'inclusesRetirees', 'inclusesRevelees'] as const) bilan[k] += e[k]
  return { demande: { regleId: regle.id }, regle, entretiens, obstacles, bilan, faisable: obstacles.length === 0 }
}

/** Retire les seules décisions liées ; le texte natif et toutes les mémoires restent inchangés. */
export function preparerSuppressionAnon(corpus: CorpusFichier, sources: SourceSuppressionAnon[], demande: DemandeSuppressionAnon) {
  const inventaire = inventorierSuppressionAnon(corpus, sources, demande)
  if (!inventaire.faisable) throw new Error('Résolvez les obstacles de l’inventaire avant de supprimer. Aucune mutation préparée.')
  const corpusApres = structuredClone(corpus)
  const entretiens: Array<{ id: string; avant: EntretienFichier; apres: EntretienFichier }> = []
  for (const e of inventaire.entretiens) {
    if (!e.annotations) continue
    const avant = sources.find((s) => s.id === e.id)!.data!
    const apres = structuredClone(avant)
    apres.annotations = apres.annotations.filter((a) => !(a.type === 'anon' && a.regle === demande.regleId))
    entretiens.push({ id: e.id, avant: structuredClone(avant), apres })
  }
  if (Object.keys(corpus.membership).some((id) => (entretiens.find((e) => e.id === id)?.apres ?? sources.find((s) => s.id === id)!.data!).annotations.some((a) => a.regle === demande.regleId))) throw new Error('Des références subsistent. Aucun retrait de définition autorisé.')
  delete corpusApres.reglesAnon[demande.regleId]
  return { inventaire, corpusApres, entretiens, bilan: inventaire.bilan }
}
