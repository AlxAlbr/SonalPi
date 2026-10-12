import type { CorpusFichier, EntretienFichier } from '../format'
import { aliasesCommuns, validerDefinitionAnon } from './definitionsAnon'
import type { ApercuImportCorrespondance, LigneImportCorrespondance } from './importCorrespondances'
import { memoriserDefinitionLocale, validerDefinitionLocale, type DefinitionAnonLocale } from '../entretien/anon/definitionsLocales'
import { cleEntite } from '../entretien/anon/brouillonsAnon'
import { parserAliases } from '../entretien/anon/alias'
import { aplatir } from '../entretien/anon/anonymisation'
import { textePlage } from '../entretien/anon/classification'
import { estOrpheline } from '../entretien/annotation'

export type EtatPseudoImporte = 'confirme' | 'refuse' | 'non-precise'
export interface CibleImportCorrespondance {
  id: string
  ligneId: string
  entretienId: string
  titre: string
  nature: 'texte' | 'locuteur'
  locuteurIndex?: number
  nom?: string
  pseudosAvant: string[]
  categorieAvant?: string
  etatAvant?: EtatPseudoImporte
  etatPropose?: EtatPseudoImporte
  actionsPossibles: Array<'ajouter' | 'remplacer' | 'variante'>
  motif: string
}
export interface ChoixCibleCorrespondance {
  cibleId: string
  action: 'ajouter' | 'remplacer' | 'variante'
  etat?: EtatPseudoImporte
}
export interface BilanImportEntretiens { definitionsLocales: number; locuteurs: number; entretiens: number }

type Apercu = Pick<ApercuImportCorrespondance, 'lignes'>
const entitesLigne = (l: LigneImportCorrespondance): string[] => l.definition?.entite ?? (typeof l.entite === 'string' ? [l.entite] : Array.isArray(l.entite) && l.entite.every((e) => typeof e === 'string') ? l.entite : [])
const pseudosLigne = (l: LigneImportCorrespondance): string[] => l.definition?.pseudos ?? (Array.isArray(l.pseudos) && l.pseudos.every((p) => typeof p === 'string') ? l.pseudos : [])
const normaliserNom = (nom: string) => nom.normalize('NFC').trim().toLocaleLowerCase('fr')

function definitionExistante(data: EntretienFichier, entite: string[]): DefinitionAnonLocale | undefined {
  const communes = (data.definitionsAnonLocales ?? []).filter((d) => aliasesCommuns(d.entite, entite))
  if (communes.length > 1 || communes.some((d) => cleEntite(d.entite.join('/')) !== cleEntite(entite.join('/')))) throw new Error('Chevauchement partiel ou ambigu des alias locaux.')
  if (communes[0]) return validerDefinitionLocale(communes[0])
  const brouillons = (data.brouillonsAnon ?? []).filter((b) => aliasesCommuns(parserAliases(b.entite), entite))
  const declarations = Object.entries(data.pseudosDeclares ?? {}).filter(([e]) => aliasesCommuns(parserAliases(e), entite))
  if (brouillons.some((b) => cleEntite(b.entite) !== cleEntite(entite.join('/'))) || declarations.some(([e]) => cleEntite(e) !== cleEntite(entite.join('/')))) throw new Error('Chevauchement partiel d’une déclaration locale existante.')
  const plat = aplatir(data.corpsTexte)
  const ann = data.annotations.filter((a) => a.type === 'anon' && !estOrpheline(a) && aliasesCommuns([textePlage(plat, a.from, a.to)], entite))
  if (ann.some((a) => a.regle)) throw new Error('Des décisions sont liées au corpus : aucun déliage implicite n’est autorisé.')
  const pseudos = [...declarations.flatMap(([, p]) => p), ...brouillons.flatMap((b) => b.pseudo?.split('/') ?? []), ...ann.map((a) => a.pseudo ?? '').filter(Boolean)]
  if (!pseudos.length && !brouillons.length) return undefined
  return { entite, pseudos: [...new Set(pseudos.map((p) => p.trim()).filter(Boolean))], etat: ann.length ? 'declaration' : 'brouillon' }
}

export function preparerCiblesCorrespondances(apercu: Apercu, corpus: CorpusFichier, entretiens: Record<string, EntretienFichier>): CibleImportCorrespondance[] {
  const cibles: CibleImportCorrespondance[] = []
  for (const ligne of apercu.lignes) {
    if (ligne.nature !== 'locuteur' && !(ligne.nature === 'texte' && ligne.portee === 'texte-local')) continue
    const entite = entitesLigne(ligne)
    const pseudos = pseudosLigne(ligne)
    for (const [id, data] of Object.entries(entretiens)) {
      if (cibles.length >= 10_000) throw new Error('L’aperçu dépasse 10 000 cibles. Réduisez le nombre de correspondances.')
      const base = { ligneId: ligne.id, entretienId: id, titre: corpus.membership[id]?.titre ?? id }
      if (ligne.nature === 'locuteur') {
        if (entite.length !== 1) continue
        const nom = entite[0]
        for (const loc of data.locuteurs.filter((l) => normaliserNom(l.nom) === normaliserNom(nom))) {
          let motif = 'Correspondance du nom uniquement : choisissez le locuteur local. Les identités importées ne sont jamais réassignées.'
          let valide = !ligne.erreur && pseudos.length === 1 && !!pseudos[0].trim()
          if (data.locuteurs.filter((l) => l.index === loc.index).length !== 1) { valide = false; motif = 'Index local ambigu : corrigez les locuteurs avant d’importer.' }
          if (!valide && !motif.startsWith('Index')) motif = 'Un locuteur exige exactement un pseudonyme non vide.'
          const origine = ligne.originesLocuteurs?.find((o) => o.entretienId === id && o.locuteurIndex === loc.index)
          const etats = new Set(ligne.originesLocuteurs?.map((o) => o.pseudoEtat ?? 'non-precise') ?? [])
          const etatPropose = origine ? origine.pseudoEtat ?? 'non-precise' : etats.size <= 1 ? [...etats][0] ?? 'non-precise' : undefined
          cibles.push({ ...base, id: JSON.stringify([ligne.id, id, loc.index]), nature: 'locuteur', locuteurIndex: loc.index, nom: loc.nom,
            pseudosAvant: loc.pseudo ? [loc.pseudo] : [], etatAvant: loc.pseudoEtat ?? 'non-precise', etatPropose,
            actionsPossibles: valide ? ['remplacer'] : [], motif,
          })
        }
      } else {
        let actionsPossibles: CibleImportCorrespondance['actionsPossibles'] = []
        let existante: DefinitionAnonLocale | undefined
        let motif = 'Définition locale uniquement : aucune occurrence, exception ou position importée ne sera appliquée.'
        try {
          if (ligne.erreur || ligne.etat === 'invalide') throw new Error(ligne.motif ?? 'Définition locale invalide.')
          const definition = validerDefinitionAnon(ligne.entite, ligne.pseudos, ligne.categorie, ligne.etatLocal === 'brouillon')
          if (Object.values(corpus.reglesAnon ?? {}).some((r) => aliasesCommuns(r.entite, definition.entite))) throw new Error('Des alias appartiennent au corpus : résolution de portée requise avant import local.')
          existante = definitionExistante(data, definition.entite)
          actionsPossibles = existante ? ['remplacer'] : ['ajouter']
          if (existante) {
            try { validerDefinitionAnon(definition.entite, [...existante.pseudos, ...definition.pseudos]); actionsPossibles.push('variante') } catch { /* La définition complète doit rester compatible. */ }
          }
        } catch (erreur) { motif = erreur instanceof Error ? erreur.message : 'Définition invalide.' }
        cibles.push({ ...base, id: JSON.stringify([ligne.id, id]), nature: 'texte', pseudosAvant: existante?.pseudos ?? [], categorieAvant: existante?.categorie, actionsPossibles, motif })
      }
    }
  }
  return cibles
}

/** Prépare des copies intégrales ; les décisions textuelles et les Personnes restent intactes. */
export function appliquerCorrespondancesEntretiens(apercu: Apercu, corpus: CorpusFichier, entretiens: Record<string, EntretienFichier>, cibles: CibleImportCorrespondance[], choix: ChoixCibleCorrespondance[]): { apres: Record<string, EntretienFichier>; bilan: BilanImportEntretiens } {
  const apres: Record<string, EntretienFichier> = Object.create(null)
  const intentions = new Map<string, string>()
  const bilan = { definitionsLocales: 0, locuteurs: 0, entretiens: 0 }
  for (const decision of choix) {
    const cible = cibles.find((c) => c.id === decision.cibleId)
    const ligne = apercu.lignes.find((l) => l.id === cible?.ligneId)
    if (!cible || !ligne || !cible.actionsPossibles.includes(decision.action)) throw new Error('Cible ou choix d’import invalide. Recalculez l’aperçu.')
    const entite = entitesLigne(ligne)
    const pseudos = pseudosLigne(ligne)
    const avant = entretiens[cible.entretienId]
    if (!avant) throw new Error('L’entretien cible n’existe plus.')
    const data = apres[cible.entretienId] ?? structuredClone(avant)
    const identite = JSON.stringify([cible.entretienId, cible.nature, cible.locuteurIndex ?? cleEntite(entite.join('/'))])
    let intention: unknown
    if (cible.nature === 'locuteur') {
      if (!decision.etat || !['confirme', 'refuse', 'non-precise'].includes(decision.etat)) throw new Error('Choisissez explicitement la décision du locuteur.')
      const loc = data.locuteurs.find((l) => l.index === cible.locuteurIndex)
      if (!loc || normaliserNom(loc.nom) !== normaliserNom(entite[0])) throw new Error('L’identité locale du locuteur a changé.')
      intention = { pseudo: pseudos[0], etat: decision.etat }
      if (intentions.has(identite) && intentions.get(identite) !== JSON.stringify(intention)) throw new Error('Deux correspondances contradictoires ciblent le même locuteur.')
      if (loc.pseudo !== pseudos[0] || (loc.pseudoEtat ?? 'non-precise') !== decision.etat) {
        loc.pseudo = pseudos[0]
        if (decision.etat === 'non-precise') delete loc.pseudoEtat
        else loc.pseudoEtat = decision.etat
        bilan.locuteurs++
      }
    } else {
      if (Object.values(corpus.reglesAnon ?? {}).some((r) => aliasesCommuns(r.entite, entite))) throw new Error('Des alias sont retenus au corpus et en local. Choisissez explicitement une seule portée.')
      const existante = definitionExistante(avant, entite)
      const definition = validerDefinitionLocale({ entite,
        pseudos: decision.action === 'variante' ? [...(existante?.pseudos ?? []), ...pseudos] : pseudos,
        categorie: decision.action === 'variante' ? existante?.categorie : ligne.definition?.categorie,
        etat: decision.action === 'variante' ? existante?.etat ?? ligne.etatLocal ?? 'declaration' : ligne.etatLocal ?? 'declaration',
      })
      const plat = aplatir(avant.corpsTexte)
      const choisis = avant.annotations.filter((a) => a.type === 'anon' && !estOrpheline(a) && !a.regle && aliasesCommuns([textePlage(plat, a.from, a.to)], definition.entite)).map((a) => a.pseudo).filter((p): p is string => !!p)
      if (choisis.some((p) => !definition.pseudos.some((d) => normaliserNom(d) === normaliserNom(p)))) throw new Error('Un pseudonyme déjà choisi serait absent de la déclaration. Conservez-le ou modifiez les décisions dans l’entretien.')
      intention = definition
      if (intentions.has(identite) && intentions.get(identite) !== JSON.stringify(intention)) throw new Error('Deux définitions contradictoires ciblent les mêmes alias locaux.')
      const definitions = data.definitionsAnonLocales ??= []
      const precedent = JSON.stringify(definitions)
      memoriserDefinitionLocale(definitions, definition)
      if (JSON.stringify(definitions) !== precedent) {
        const cle = cleEntite(definition.entite.join('/'))
        Object.defineProperty(data.pseudosDeclares ??= {}, cle, { value: [...definition.pseudos], enumerable: true, writable: true, configurable: true })
        data.brouillonsAnon = (data.brouillonsAnon ?? []).filter((b) => cleEntite(b.entite) !== cle)
        if (definition.etat === 'brouillon') data.brouillonsAnon.push({ entite: definition.entite.join('/'), pseudo: definition.pseudos.join(' / ') })
        bilan.definitionsLocales++
      }
    }
    intentions.set(identite, JSON.stringify(intention))
    if (JSON.stringify(data) !== JSON.stringify(avant)) apres[cible.entretienId] = data
  }
  bilan.entretiens = Object.keys(apres).length
  return { apres, bilan }
}
