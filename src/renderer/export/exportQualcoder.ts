import type { CorpusFichier, EntretienFichier, Personne, Variable } from '../../shared/format'
import type { Cas, DefinitionAttributCas } from '../../shared/corpus/cas'
import type { AttributCasProjete } from '../../shared/corpus/observationsAttributs'
import type { InstantaneEntretienExport } from '../../shared/export/types'
import type {
  QualcoderAnnotationExport,
  QualcoderCaseExport,
  QualcoderCategorieExport,
  QualcoderCodeExport,
  QualcoderExportModel,
  QualcoderSourceExport,
} from '../../shared/export/qualcoder/modele'
import { projeterTexteQualcoder, plageTexteQualcoder } from '../../shared/export/qualcoder/projection'
import { projeterCasDepuisSourcesPreparees } from '../editor/cas'
import { projeterAttributsCas } from '../../shared/corpus/observationsAttributs'
import { preparerSourcesPassages } from '../editor/passages'

export interface DemandeModeleQualcoder {
  nom: string
  selection: InstantaneEntretienExport[]
  corpus: Pick<CorpusFichier, 'membership' | 'variables' | 'famillesCas' | 'attributsCas' | 'codebook'> & {
    cas: Record<string, Cas>
  }
  personnes: Record<string, Personne>
  casSelectionnes: string[]
  owner: string
}

function sourceNative(instantane: InstantaneEntretienExport): EntretienFichier {
  return {
    formatVersion: 8,
    lastModified: new Date().toISOString(),
    corpsTexte: instantane.entretien.corpsTexte,
    annotations: instantane.entretien.annotations,
    ancres: instantane.entretien.ancres,
    locuteurs: instantane.entretien.locuteurs,
    meta: {
      valeursGen: instantane.entretien.meta.valeursGen,
      audioRef: null,
    },
    notes: instantane.notesPubliques,
    reperesPassages: instantane.reperesPassages,
    legacy: instantane.entretien.legacy as unknown as Record<string, unknown>,
    brouillonsAnon: instantane.entretien.brouillonsAnon,
  }
}

function sourcesNatives(demande: DemandeModeleQualcoder): Map<string, EntretienFichier> {
  return new Map(demande.selection.map((source) => [source.id, sourceNative(source)]))
}

function sourceIdsCas(cas: Cas, membership: Record<string, unknown>): string[] {
  const ids = new Set<string>()
  for (const regle of cas.regles) {
    if (regle.type === 'entretiens') for (const id of regle.entretienIds) ids.add(id)
    else if (regle.type === 'modalite' || regle.type === 'personne' || regle.type === 'personnes') {
      for (const id of Object.keys(membership)) ids.add(id)
    }
  }
  for (const rattachement of cas.rattachements) ids.add(rattachement.source.entretienId)
  return [...ids]
}

function attributExportable(
  attribut: AttributCasProjete,
  definitions: Record<string, DefinitionAttributCas>,
  nomsUtilises: Set<string>,
): { nom: string; valeur: string } | null {
  const definition = attribut.definition ?? definitions[attribut.attributId]
  if (!definition || definition.priv) return null
  const valeur = attribut.valeurSaisie
    ?? (attribut.diagnostic?.statut === 'coherent' || attribut.diagnostic?.statut === 'coherent-incomplet'
      ? attribut.diagnostic.valeurLibelle
      : null)
  if (valeur == null || !valeur.trim()) return null
  const base = `Cas — ${definition.lib}`
  let nom = base
  let suffixe = 2
  while (nomsUtilises.has(nom)) nom = `${base} (${suffixe++})`
  return { nom, valeur }
}

function categorie(
  id: string,
  codebook: CorpusFichier['codebook'],
  vus: Set<string> = new Set(),
): QualcoderCategorieExport | null {
  if (vus.has(id)) return null
  const cat = codebook[id]
  if (!cat) return null
  vus.add(id)
  return {
    id: cat.id,
    nom: cat.nom,
    couleur: cat.couleur ?? '#808080',
    parent: cat.parent ? categorie(cat.parent, codebook, new Set(vus)) : null,
  }
}

function codeExport(
  id: string,
  codebook: CorpusFichier['codebook'],
): QualcoderCodeExport | null {
  const cat = codebook[id]
  if (!cat) return null
  return {
    id: cat.id,
    nom: cat.nom,
    memo: cat.description ?? '',
    couleur: cat.couleur ?? '#808080',
    categorie: categorie(cat.id, codebook),
  }
}

function sourceExport(
  instantane: InstantaneEntretienExport,
  codebook: CorpusFichier['codebook'],
  variables: Variable[],
  diagnostics: string[],
): QualcoderSourceExport {
  const projection = projeterTexteQualcoder(instantane.entretien.corpsTexte)
  const annotations: QualcoderAnnotationExport[] = []
  for (const annotation of instantane.entretien.annotations) {
    if (annotation.from >= annotation.to) continue
    const plage = plageTexteQualcoder(projection, annotation.from, annotation.to)
    if (annotation.type === 'commentaire') {
      annotations.push({
        id: annotation.id,
        type: 'commentaire',
        from: plage.from,
        to: plage.to,
        auteur: annotation.auteur,
        texte: annotation.texte ?? '',
      })
    } else if (annotation.type === 'codage') {
      const code = annotation.code ? codeExport(annotation.code, codebook) : null
      if (!code) {
        diagnostics.push(`Codage ignoré dans ${instantane.titre} : la catégorie ${annotation.code ?? '(inconnue)'} est absente.`)
        continue
      }
      annotations.push({
        id: annotation.id,
        type: 'codage',
        from: plage.from,
        to: plage.to,
        auteur: annotation.auteur,
        texte: plage.seltext,
        code,
      })
    }
  }
  const modalites = new Map(variables.flatMap((variable) => variable.modalites.map((modalite) => [modalite.id, modalite.lib])))
  const attributs = variables
    .filter((variable) => !variable.priv)
    .flatMap((variable) => {
      const valeur = instantane.entretien.meta.valeursGen[variable.id]
      return valeur && modalites.has(valeur) ? [{ nom: variable.lib, valeur: modalites.get(valeur)!, type: 'fichier' as const }] : []
    })
  return {
    id: instantane.id,
    titre: instantane.titre,
    fulltext: projection.fulltext,
    date: instantane.date ?? null,
    memo: '',
    owner: 'SonalPi',
    annotations,
    attributs,
  }
}

function casExport(
  cas: Cas,
  demande: DemandeModeleQualcoder,
  natives: Map<string, EntretienFichier>,
  nomsAttributs: Set<string>,
  diagnostics: string[],
): QualcoderCaseExport {
  const corpus = {
    membership: demande.corpus.membership,
    personnes: demande.personnes,
    variables: demande.corpus.variables,
    famillesCas: demande.corpus.famillesCas,
    attributsCas: demande.corpus.attributsCas,
    cas: demande.corpus.cas,
  }
  const sources = new Map(natives)
  const sourcesLecture = new Map([...natives].map(([id, data]) => [id, { ok: true as const, data }]))
  const projection = projeterCasDepuisSourcesPreparees(
    corpus,
    cas,
    preparerSourcesPassages(new Map([...sources].map(([id, data]) => [id, { ok: true as const, data }]))),
  )
  for (const diagnostic of projection.diagnosticsRegles) diagnostics.push(diagnostic.diagnostic)
  const passagesParCle = new Map<string, {
    sourceId: string
    from: number
    to: number
    seltext: string
    provenance: string
  }>()
  for (const passage of projection.passages) {
    if (passage.etat !== 'disponible' || passage.from === null || passage.to === null) continue
    const sourceId = passage.origine.type === 'manuel' ? passage.origine.source.entretienId : passage.origine.entretienId
    const source = natives.get(sourceId)
    if (!source) continue
    const textProjection = projeterTexteQualcoder(source.corpsTexte)
    const plage = plageTexteQualcoder(textProjection, passage.from, passage.to)
    const cle = `${sourceId}\0${plage.from}\0${plage.to}`
    const provenance = passage.origine.type
    const existant = passagesParCle.get(cle)
    if (existant) {
      if (!existant.provenance.includes(provenance)) existant.provenance += `+${provenance}`
    } else {
      passagesParCle.set(cle, {
        sourceId,
        from: plage.from,
        to: plage.to,
        seltext: plage.seltext,
        provenance,
      })
    }
  }
  const passages = [...passagesParCle.values()]
  const attributes = projeterAttributsCas(corpus, cas, sourcesLecture)
    .map((attribut) => attributExportable(attribut, demande.corpus.attributsCas ?? {}, nomsAttributs))
    .filter((value): value is { nom: string; valeur: string } => value !== null)
    .map((value) => ({ ...value, type: 'cas' as const, caseId: cas.id }))
  return {
    id: cas.id,
    nom: cas.nom,
    memo: cas.memo,
    owner: demande.owner,
    sourceIds: sourceIdsCas(cas, demande.corpus.membership).filter((id) => natives.has(id)),
    passages,
    attributs: attributes,
  }
}

/** Construit le modèle indépendant de SQL et du système de fichiers. */
export function assemblerModeleQualcoder(demande: DemandeModeleQualcoder): QualcoderExportModel {
  const diagnostics: string[] = []
  const natives = sourcesNatives(demande)
  const sources = demande.selection.map((source) => sourceExport(source, demande.corpus.codebook, Object.values(demande.corpus.variables), diagnostics))
  const nomsAttributs = new Set(Object.values(demande.corpus.variables)
    .filter((variable) => !variable.priv)
    .map((variable) => variable.lib))
  const cases = demande.casSelectionnes
    .map((id) => demande.corpus.cas[id])
    .filter((cas): cas is Cas => Boolean(cas))
    .map((cas) => casExport(cas, demande, natives, nomsAttributs, diagnostics))
  const attributs = [
    ...Object.values(demande.corpus.variables)
      .filter((variable) => !variable.priv)
      .map((variable) => ({ nom: variable.lib, type: 'fichier' as const, confidentiel: false })),
    ...Object.values(demande.corpus.attributsCas ?? {})
      .filter((definition) => !definition.priv)
      .map((definition) => ({ nom: `Cas — ${definition.lib}`, type: 'cas' as const, confidentiel: false })),
  ]
  const codebook = Object.values(demande.corpus.codebook)
    .map((category) => codeExport(category.id, demande.corpus.codebook))
    .filter((code): code is QualcoderCodeExport => code !== null)
  return {
    nom: demande.nom,
    dateExport: new Date().toISOString(),
    sources,
    codebook,
    cases,
    attributs,
    diagnostics,
  }
}
