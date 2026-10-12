import type { RegleAnon } from '../format'
import type { EntretienScan } from './scanAnon'
import type { DefinitionAnon } from './definitionsAnon'
import { dedupliquerValeursAnon, aliasesCommuns, validerDefinitionAnon } from './definitionsAnon'
import { inventorierCorrespondancesLocuteurs, type CorrespondanceLocuteur, type DivergenceLocuteurs } from './correspondancesLocuteurs'
import { aplatir } from '../entretien/anon/anonymisation'
import { annotationVisible, textePlage } from '../entretien/anon/classification'
import { parserAliases } from '../entretien/anon/alias'
import { cleEntite } from '../entretien/anon/brouillonsAnon'

export interface OptionsTableCorrespondance {
  regles: 'toutes' | 'utilisees'
  perimetre: 'corpus' | 'corpus-entretiens'
  nature: 'texte' | 'locuteurs' | 'texte-locuteurs'
  categories: boolean
}
export const OPTIONS_TABLE_DEFAUT: OptionsTableCorrespondance = {
  regles: 'utilisees', perimetre: 'corpus-entretiens', nature: 'texte-locuteurs', categories: true,
}
export interface CorrespondanceTexte extends DefinitionAnon {
  nature: 'texte'
  portee: 'corpus' | 'texte-local'
  regleId?: string
  entretienId?: string
  etatLocal?: 'declaration' | 'brouillon'
  utilisee: boolean
  usages: Array<{ entretienId: string; pseudos: string[] }>
  referenceCorpusAbsente?: string
}
export interface CorrespondanceLibelle extends CorrespondanceLocuteur { nature: 'locuteur' }
export type Correspondance = CorrespondanceTexte | CorrespondanceLibelle
export interface DiagnosticCorrespondance { code: string; entretienId?: string; annotationId?: string; regleId?: string }
export interface TableCorrespondanceV2 {
  format: 'sonalpi-correspondances'
  version: 2
  correspondances: Correspondance[]
  divergencesLocuteurs: DivergenceLocuteurs[]
  diagnostics: DiagnosticCorrespondance[]
}
export interface ApercuExportCorrespondance {
  token: string
  table: TableCorrespondanceV2
  indisponibles: Array<{ id: string; titre: string }>
  lecture: 'local' | 'miroir'
}
export interface CorrespondanceV1 { entite_init: string; entite_pseudo: string; entite_pseudo_alt?: string; thematique?: string }

export function validerOptionsTable(options: OptionsTableCorrespondance): void {
  if (!options || !['toutes', 'utilisees'].includes(options.regles) || !['corpus', 'corpus-entretiens'].includes(options.perimetre) ||
    !['texte', 'locuteurs', 'texte-locuteurs'].includes(options.nature) || typeof options.categories !== 'boolean') throw new Error('Options de correspondance invalides.')
  if (options.nature !== 'texte' && options.perimetre !== 'corpus-entretiens') throw new Error('Les locuteurs exigent le périmètre corpus et entretiens.')
}
export function tableExigeEntretiens(options: OptionsTableCorrespondance): boolean {
  validerOptionsTable(options)
  return options.regles === 'utilisees' || options.perimetre === 'corpus-entretiens'
}

/** Reconstruit des correspondances déclaratives, jamais des positions à réappliquer. */
export function construireTableCorrespondance(regles: RegleAnon[], entretiens: EntretienScan[], options: OptionsTableCorrespondance): TableCorrespondanceV2 {
  validerOptionsTable(options)
  const diagnostics: DiagnosticCorrespondance[] = []
  const textes: CorrespondanceTexte[] = regles.map((r) => ({
    nature: 'texte', portee: 'corpus', regleId: r.id, entite: [...r.entite], pseudos: [...r.pseudos],
    ...(options.categories && r.categorie ? { categorie: r.categorie } : {}), utilisee: false, usages: [],
  }))
  for (const r of textes) {
    try { validerDefinitionAnon(r.entite, r.pseudos, r.categorie) }
    catch { diagnostics.push({ code: 'definition-corpus-invalide', regleId: r.regleId }) }
  }
  const parRegle = new Map(textes.map((r) => [r.regleId!, r]))
  for (const { id, data } of entretiens) {
    const plat = aplatir(data.corpsTexte)
    const locaux: CorrespondanceTexte[] = (data.definitionsAnonLocales ?? []).map((d) => ({
      nature: 'texte', portee: 'texte-local', entretienId: id, entite: [...d.entite], pseudos: [...d.pseudos],
      etatLocal: d.etat, utilisee: false, usages: [], ...(options.categories && d.categorie ? { categorie: d.categorie } : {}),
    }))
    const memoireExplicite = new Set(locaux)
    for (const [entite, pseudos] of Object.entries(data.pseudosDeclares ?? {})) {
      if (locaux.some((r) => cleEntite(r.entite.join('/')) === cleEntite(entite))) continue
      locaux.push({ nature: 'texte', portee: 'texte-local', entretienId: id, entite: parserAliases(entite), pseudos: [...pseudos], etatLocal: 'declaration', utilisee: false, usages: [] })
    }
    for (const b of data.brouillonsAnon ?? []) {
      const deja = locaux.find((r) => cleEntite(r.entite.join('/')) === cleEntite(b.entite))
      if (deja) {
        const pseudos = b.pseudo ? dedupliquerValeursAnon(b.pseudo.split('/')) : []
        if (JSON.stringify(deja.pseudos) !== JSON.stringify(pseudos)) diagnostics.push({ code: 'brouillon-definition-divergente', entretienId: id })
        deja.etatLocal = 'brouillon'
        deja.pseudos = pseudos
        continue
      }
      locaux.push({ nature: 'texte', portee: 'texte-local', entretienId: id, entite: parserAliases(b.entite), pseudos: b.pseudo ? dedupliquerValeursAnon(b.pseudo.split('/')) : [], etatLocal: 'brouillon', utilisee: false, usages: [] })
    }
    for (const a of data.annotations.filter((a) => a.type === 'anon')) {
      const valide = Number.isInteger(a.from) && Number.isInteger(a.to) && a.from < a.to &&
        plat.blocs.some((b) => a.from >= b.debut && a.to <= b.debut + b.longueur)
      if (!valide) { diagnostics.push({ code: 'plage-invalide', entretienId: id, annotationId: a.id }); continue }
      const entite = textePlage(plat, a.from, a.to).trim()
      if (!entite) { diagnostics.push({ code: 'entite-vide', entretienId: id, annotationId: a.id }); continue }
      const pseudo = typeof a.pseudo === 'string' ? a.pseudo.trim() : ''
      let ligne = a.regle ? parRegle.get(a.regle) : undefined
      if (ligne && !ligne.entite.flatMap(parserAliases).some((e) => e.normalize('NFC').toLocaleLowerCase('fr') === entite.normalize('NFC').toLocaleLowerCase('fr'))) {
        diagnostics.push({ code: 'entite-hors-regle', entretienId: id, annotationId: a.id, regleId: a.regle })
        ligne = undefined
      }
      if (!ligne) {
        const candidats = locaux.filter((r) => aliasesCommuns(r.entite, [entite]))
        if (candidats.length > 1) diagnostics.push({ code: 'declarations-locales-ambigues', entretienId: id, annotationId: a.id })
        ligne = candidats.length === 1 ? candidats[0] : undefined
        if (!ligne) {
          ligne = { nature: 'texte', portee: 'texte-local', entretienId: id, entite: [entite], pseudos: [], etatLocal: 'declaration', utilisee: false, usages: [] }
          locaux.push(ligne)
        }
        if (a.regle) {
          ligne.referenceCorpusAbsente = a.regle
          diagnostics.push({ code: 'reference-corpus-non-resolue', entretienId: id, annotationId: a.id, regleId: a.regle })
        }
        if (pseudo && !memoireExplicite.has(ligne)) ligne.pseudos = dedupliquerValeursAnon([...ligne.pseudos, pseudo])
      }
      if (a.etat === 'exception') continue
      if (!pseudo || pseudo === entite) {
        diagnostics.push({ code: 'pseudo-inexploitable', entretienId: id, annotationId: a.id })
        continue
      }
      if (annotationVisible(data.annotations, a)?.id !== a.id) continue
      ligne.utilisee = true
      const usage = ligne.usages.find((u) => u.entretienId === id) ?? { entretienId: id, pseudos: [] }
      if (!ligne.usages.includes(usage)) ligne.usages.push(usage)
      if (!usage.pseudos.includes(pseudo)) usage.pseudos.push(pseudo)
      if ((ligne.portee === 'corpus' || memoireExplicite.has(ligne)) && !ligne.pseudos.some((p) => p.toLocaleLowerCase('fr') === pseudo.toLocaleLowerCase('fr'))) {
        diagnostics.push({ code: 'variante-hors-definition', entretienId: id, annotationId: a.id, regleId: a.regle })
      }
    }
    for (const r of locaux) {
      try { validerDefinitionAnon(r.entite, r.pseudos, r.categorie, r.etatLocal === 'brouillon') }
      catch { diagnostics.push({ code: 'definition-locale-invalide', entretienId: id }) }
    }
    if (options.perimetre === 'corpus-entretiens') textes.push(...locaux)
  }
  const pourLocuteurs = options.nature === 'texte' ? [] : entretiens.map((e) => ({ ...e, data: { ...e.data, locuteurs: e.data.locuteurs.filter((l) => {
    const valide = !!l && typeof l.nom === 'string' && (l.pseudo == null || typeof l.pseudo === 'string') &&
      (l.pseudoEtat === undefined || l.pseudoEtat === 'confirme' || l.pseudoEtat === 'refuse') && Number.isInteger(l.index)
    if (!valide) diagnostics.push({ code: 'libelle-locuteur-invalide', entretienId: e.id })
    return valide
  }) } }))
  const inventaire = options.nature !== 'texte' ? inventorierCorrespondancesLocuteurs(pourLocuteurs) : { correspondances: [], divergences: [] }
  const correspondances: Correspondance[] = [
    ...(options.nature !== 'locuteurs' ? textes : []),
    ...inventaire.correspondances.map((r): CorrespondanceLibelle => ({ nature: 'locuteur', ...r })),
  ].filter((r) => options.regles === 'toutes' || r.utilisee)
  correspondances.sort((a, b) => a.nature.localeCompare(b.nature) ||
    (a.nature === 'texte' ? a.entite.join('/') : a.nom).localeCompare(b.nature === 'texte' ? b.entite.join('/') : b.nom, 'fr'))
  return { format: 'sonalpi-correspondances', version: 2, correspondances, divergencesLocuteurs: inventaire.divergences, diagnostics: options.nature === 'locuteurs' ? diagnostics.filter((d) => d.code === 'libelle-locuteur-invalide') : diagnostics }
}

/** Le format V1 perd nature, portée, états et provenance ; toutes les variantes restent présentes. */
export function aplatirTableV1(table: TableCorrespondanceV2): CorrespondanceV1[] {
  const lignes = new Map<string, CorrespondanceV1>()
  for (const r of table.correspondances) {
    const entite = r.nature === 'texte' ? r.entite.join(' / ') : r.nom
    const pseudos = r.nature === 'texte' ? dedupliquerValeursAnon([...r.pseudos, ...r.usages.flatMap((u) => u.pseudos)]) : [r.pseudo]
    for (let i = 0; i < pseudos.length; i += 2) {
      const ligne: CorrespondanceV1 = { entite_init: entite, entite_pseudo: pseudos[i] }
      if (pseudos[i + 1]) ligne.entite_pseudo_alt = pseudos[i + 1]
      if (r.nature === 'texte' && r.categorie) ligne.thematique = r.categorie
      lignes.set(JSON.stringify(ligne), ligne)
    }
  }
  return [...lignes.values()]
}
