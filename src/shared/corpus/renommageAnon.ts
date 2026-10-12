import { exigerAbsenceSuppressionAnon } from './barriereSuppressionAnon'
import { FORMAT_VERSION, type CorpusFichier, type EntretienFichier, type RegleAnon } from '../format'
import type { Annotation } from '../entretien/annotation'
import { aplatir, plageVersPM, type TextePlat } from '../entretien/anon/anonymisation'
import { annotationVisible, classerPlage, matchesAliases, textePlage } from '../entretien/anon/classification'
import { aliasesCommuns, validerDefinitionAnon } from './definitionsAnon'

export interface DemandeRenommageAnon { regleId: string; ancienPseudo: string; nouveauPseudo: string }
export type MotifRefusRenommage = 'indisponible' | 'ancien-format' | 'annotation-invalide' | 'pseudo-divergent' | 'memoire-locale-recouvrante' | 'annotations-ambigues'
export interface ObstacleRenommageAnon { code: MotifRefusRenommage; entretienId: string; annotationId?: string }
export interface UsageRenommageAnon {
  annotationId: string; from: number; to: number; extrait: string
  etat: 'anonymise' | 'exception'; incluse: boolean; renomme: boolean; pseudo?: string
}
export interface InventaireRenommageEntretien {
  id: string; titre: string; renommages: number; inclusesRenommees: number
  exceptions: number; autresVariantes: number; independantes: number; attentes: number
  usages: UsageRenommageAnon[]
}
export interface InventaireRenommageAnon {
  demande: DemandeRenommageAnon; regle: RegleAnon; apres: RegleAnon
  entretiens: InventaireRenommageEntretien[]; obstacles: ObstacleRenommageAnon[]
  collisions: string[]; renommages: number; inclusesRenommees: number; entretiensModifies: number
  definitionModifiee: boolean; faisable: boolean
}
export interface ApercuRenommageAnon extends InventaireRenommageAnon {
  token: string; lecture: 'local' | 'gitlab' | 'webdav'; applicationDisponible: boolean; reprise?: string
  disponibilites?: Array<{ id: string; etat: 'libre-observe' | 'tenu-autrui' | 'session-locale' | 'inconnu' }>
}
export interface BilanRenommageAnon {
  annotations: number; incluses: number; entretiens: number; definitionModifiee: boolean
  statut?: 'termine' | 'partiel' | 'indetermine'; operationId?: string
  differes?: Array<{ id: string; motif: string }>; nouvellesCibles?: string[]; ciblesRetirees?: string[]; motif?: string
}
export interface SuiviRenommageAnon {
  operationId: string; demande: DemandeRenommageAnon; bilan: BilanRenommageAnon; indeterminee: boolean; fournisseur?: 'gitlab' | 'webdav'
  cibles: Array<{ id: string; etat: 'a-faire' | 'confirme'; motif?: string }>
}
export type SourceRenommageAnon = { id: string; titre: string; data?: EntretienFichier }
const cle = (v: string) => v.trim().normalize('NFC').toLocaleLowerCase('fr')

function definirRenommage(corpus: CorpusFichier, demande: DemandeRenommageAnon) {
  if (corpus.formatVersion !== FORMAT_VERSION) throw new Error('Ouvrez et enregistrez le corpus au format actuel avant un renommage global.')
  if (!demande || typeof demande.regleId !== 'string' || typeof demande.ancienPseudo !== 'string' || typeof demande.nouveauPseudo !== 'string'
    || !Object.hasOwn(corpus.reglesAnon ?? {}, demande.regleId)) throw new Error('La règle du renommage est absente ou la demande est invalide.')
  const regle = structuredClone(corpus.reglesAnon[demande.regleId])
  if (regle.id !== demande.regleId) throw new Error('Identité de règle incohérente.')
  const valide = validerDefinitionAnon(regle.entite, regle.pseudos, regle.categorie)
  if (JSON.stringify(valide.pseudos) !== JSON.stringify(regle.pseudos) || JSON.stringify(valide.entite) !== JSON.stringify(regle.entite)) {
    throw new Error('La définition doit être normalisée sans ambiguïté avant un renommage global.')
  }
  const index = regle.pseudos.findIndex((p) => cle(p) === cle(demande.ancienPseudo))
  if (index < 0) throw new Error('La variante choisie n’est plus déclarée. Recalculez l’aperçu.')
  const nouveau = demande.nouveauPseudo.trim().normalize('NFC')
  if (!nouveau) throw new Error('Saisissez un pseudonyme non vide pour le renommage.')
  if (regle.pseudos.some((p, i) => i !== index && cle(p) === cle(nouveau))) throw new Error('Ce pseudo est déjà une autre variante. Le retrait ou repli d’une variante est une commande distincte.')
  const pseudos = [...regle.pseudos]; pseudos[index] = nouveau
  const definition = validerDefinitionAnon(regle.entite, pseudos, regle.categorie)
  return { regle, apres: { ...regle, pseudos: definition.pseudos },
    demande: { regleId: regle.id, ancienPseudo: regle.pseudos[index], nouveauPseudo: nouveau } }
}
function plageValide(plat: TextePlat, a: Annotation): boolean {
  return Number.isSafeInteger(a.from) && Number.isSafeInteger(a.to) && a.from < a.to
    && plat.blocs.some((b) => b.debut <= a.from && a.to <= b.debut + b.longueur)
}

/** Inventorie les décisions liées ; un pseudo partagé ne crée jamais une identité commune. */
export function inventorierRenommageAnon(corpus: CorpusFichier, sources: SourceRenommageAnon[], demande: DemandeRenommageAnon, pseudosDejaRenommes: string[] = []): InventaireRenommageAnon {
  exigerAbsenceSuppressionAnon(corpus)
  const definition = definirRenommage(corpus, demande)
  const { regle, apres } = definition
  const cles = new Set(regle.entite.map(cle))
  const inventaire: InventaireRenommageAnon = { ...definition, entretiens: [], obstacles: [],
    collisions: Object.values(corpus.reglesAnon).filter((r) => r.id !== regle.id && r.pseudos?.some((p) => cle(p) === cle(definition.demande.nouveauPseudo))).map((r) => r.id),
    renommages: 0, inclusesRenommees: 0, entretiensModifies: 0,
    definitionModifiee: JSON.stringify(regle.pseudos) !== JSON.stringify(apres.pseudos), faisable: true }
  const parId = new Map(sources.map((s) => [s.id, s]))
  if (parId.size !== sources.length) throw new Error('L’inventaire contient des identités d’entretien répétées.')
  for (const [id, membre] of Object.entries(corpus.membership)) {
    const source = parId.get(id)
    const data = source?.data
    const ligne: InventaireRenommageEntretien = { id, titre: source?.titre ?? membre.titre, renommages: 0,
      inclusesRenommees: 0, exceptions: 0, autresVariantes: 0, independantes: 0, attentes: 0, usages: [] }
    inventaire.entretiens.push(ligne)
    if (!data || !Array.isArray(data.annotations)) { inventaire.obstacles.push({ code: 'indisponible', entretienId: id }); continue }
    if (data.formatVersion !== FORMAT_VERSION) inventaire.obstacles.push({ code: 'ancien-format', entretienId: id })
    const liees = data.annotations.filter((a) => a.type === 'anon' && a.regle === regle.id)
    const plat = aplatir(data.corpsTexte)
    const texteDe = (from: number, to: number) => textePlage(plat, from, to)
    const valides = data.annotations.filter((a) => a.type === 'anon' && plageValide(plat, a))
    if (liees.length && (new Set(data.annotations.map((a) => a.id)).size !== data.annotations.length)) {
      inventaire.obstacles.push({ code: 'annotations-ambigues', entretienId: id })
    }
    if (liees.length && (data.definitionsAnonLocales ?? []).some((d) => aliasesCommuns(d.entite, regle.entite))) {
      inventaire.obstacles.push({ code: 'memoire-locale-recouvrante', entretienId: id })
    }
    for (const a of liees) {
      const etat = a.etat ?? 'anonymise'
      const valide = plageValide(plat, a) && cles.has(cle(texteDe(a.from, a.to))) && ['anonymise', 'exception'].includes(etat)
      if (!valide) inventaire.obstacles.push({ code: 'annotation-invalide', entretienId: id, annotationId: a.id })
      const ambigue = valides.some((b) => b !== a && b.from < a.to && a.from < b.to
        && ((b.from === a.from && b.to === a.to) || !(b.from <= a.from && a.to <= b.to) && !(a.from <= b.from && b.to <= a.to)))
      if (ambigue) inventaire.obstacles.push({ code: 'annotations-ambigues', entretienId: id, annotationId: a.id })
      if (etat !== 'exception' && (typeof a.pseudo !== 'string' || ![...regle.pseudos, ...pseudosDejaRenommes].some((p) => cle(p) === cle(a.pseudo!)))) {
        inventaire.obstacles.push({ code: 'pseudo-divergent', entretienId: id, annotationId: a.id })
      }
      const incluse = valide && annotationVisible(valides, a)?.id !== a.id
      const renomme = valide && etat !== 'exception' && typeof a.pseudo === 'string' && cle(a.pseudo) === cle(definition.demande.ancienPseudo)
        && a.pseudo.normalize('NFC') !== definition.demande.nouveauPseudo && inventaire.definitionModifiee
      ligne.usages.push({ annotationId: a.id, from: a.from, to: a.to, extrait: plageValide(plat, a) ? texteDe(a.from, a.to).slice(0, 1000) : '',
        etat: etat === 'exception' ? 'exception' : 'anonymise', incluse, renomme, pseudo: a.pseudo })
      if (etat === 'exception') ligne.exceptions++
      else if (renomme) { ligne.renommages++; if (incluse) ligne.inclusesRenommees++ }
      else if (typeof a.pseudo !== 'string' || cle(a.pseudo) !== cle(definition.demande.ancienPseudo)) ligne.autresVariantes++
    }
    for (const m of matchesAliases(plat.texte, regle.entite)) {
      const plage = plageVersPM(plat, m.from, m.to)
      if (!plage) continue
      const classe = classerPlage(valides, plage, cles, texteDe)
      if (classe.etat === 'non') ligne.attentes++
      else if (classe.annotation?.regle !== regle.id) ligne.independantes++
    }
    inventaire.renommages += ligne.renommages
    inventaire.inclusesRenommees += ligne.inclusesRenommees
    if (ligne.renommages) inventaire.entretiensModifies++
  }
  inventaire.faisable = inventaire.obstacles.length === 0
  return inventaire
}

/** Prépare sur copies, sans poser d’occurrence ni modifier une décision indépendante. */
export function preparerRenommageAnon(corpus: CorpusFichier, sources: SourceRenommageAnon[], demande: DemandeRenommageAnon, pseudosDejaRenommes: string[] = []) {
  const inventaire = inventorierRenommageAnon(corpus, sources, demande, pseudosDejaRenommes)
  if (!inventaire.faisable) throw new Error('L’inventaire présente des sources ou décisions à résoudre. Aucun renommage n’a été préparé.')
  const corpusApres = structuredClone(corpus)
  if (inventaire.definitionModifiee) corpusApres.reglesAnon[demande.regleId] = structuredClone(inventaire.apres)
  const entretiens: Array<{ id: string; avant: EntretienFichier; apres: EntretienFichier }> = []
  for (const ligne of inventaire.entretiens) {
    if (!ligne.renommages) continue
    const avant = sources.find((s) => s.id === ligne.id)!.data!
    const apres = structuredClone(avant)
    const ids = new Set(ligne.usages.filter((u) => u.renomme).map((u) => u.annotationId))
    for (const a of apres.annotations) if (ids.has(a.id)) a.pseudo = inventaire.demande.nouveauPseudo
    entretiens.push({ id: ligne.id, avant: structuredClone(avant), apres })
  }
  const bilan: BilanRenommageAnon = { annotations: inventaire.renommages, incluses: inventaire.inclusesRenommees,
    entretiens: entretiens.length, definitionModifiee: inventaire.definitionModifiee }
  return { inventaire, corpusApres, entretiens, bilan }
}
