/**
 *  SERVICE D'EXPORT DE CORPUS (renderer, sans Vue)
 *  ----------------------------------------------------------------
 *  Orchestration d'un LOT : un entretien à la fois, de l'instantané à
 *  l'écriture. Tous les accès (instantané de l'entretien ouvert, lecture des
 *  fichiers natifs, écritures, copie des médias) sont injectés, ce qui rend
 *  le service testable avec des doublures. La boucle est SÉQUENTIELLE : la
 *  progression est le compteur de la boucle, et annuler, c'est ne pas traiter
 *  l'entretien suivant — jamais de fichier à moitié écrit (écritures
 *  atomiques côté main).
 */
import type {
  ContexteExport,
  FormatExport,
  InstantaneEntretienExport,
  OptionsExport,
} from '../../shared/export/types'
import { FORMATS_EXPORT } from '../../shared/export/types'
import type {
  LigneIndexCorpus,
  ResultatEcritureCorpus,
  ResultatInstantaneCorpus,
} from '../../shared/export/corpus'
import {
  compterMots,
  nomDossierExportCorpus,
  texteIndexCorpus,
} from '../../shared/export/corpus'
import { documentCombine } from '../../shared/export/documentCorpus'
import type { DocumentExport } from '../../shared/export/documentExport'
import type { DemandeExportDocxCorpus } from '../../shared/format'
import {
  genererTxt,
  genererHtml,
  genererHtmlCombineCorpus,
  genererDonneesDocx,
} from '../../shared/export/formatsTexte'
import {
  etablirRapportPseudonymisation,
  rapportEnTexte,
  type RapportPseudonymisationExport,
} from '../../shared/export/pseudonymisation'
import { attribuerNomsUniques, nettoyerBaseNom } from '../../shared/export/nomsFichiers'

/** Les formats de LECTURE du lot : `txt`/`html` produisent un fichier par
 *  entretien ; `docx`/`pdf` produisent UN document combiné. */
const FORMATS_PAR_ENTRETIEN: FormatExport[] = ['txt', 'html']

/** Suivi d'un entretien du lot, présenté dans le résumé final. */
export interface SuiviEntretienLot {
  id: string
  titre: string
  etat: 'succes' | 'echec' | 'abandonne'
  raison?: string
}

/** Synthèse compacte du rapport d'un entretien (vue globale de la modale). */
export interface ResumeRapportEntretien {
  id: string
  titre: string
  appliquees: number
  conserves: number
  aVerifier: number
}

/** Rapport consultable d'un entretien, décliné pour chaque format demandé. */
export interface RapportEntretienCorpus {
  id: string
  titre: string
  formats: Array<{ format: FormatExport; rapport: RapportPseudonymisationExport }>
}

/** Rapport agrégé préparé avant l'export, sans aucune écriture. */
export interface ApercuRapportPseudonymisationCorpus {
  entretiens: RapportEntretienCorpus[]
  indisponibles: Array<{ id: string; titre: string; raison: string }>
  texte: string
  nomSuggere: string
}

export type ResultatPreparationRapportCorpus =
  | { etat: 'succes'; apercu: ApercuRapportPseudonymisationCorpus }
  | { etat: 'erreur'; message: string }

export type ResultatEnregistrementRapportCorpus =
  | { etat: 'succes'; chemin: string }
  | { etat: 'annule' }
  | { etat: 'erreur'; message: string }

/** Résultat d'un run : toujours présenté à l'interface. */
export type ResultatLotCorpus =
  | { etat: 'succes'; dossier: string; faits: SuiviEntretienLot[]; rapportResume: ResumeRapportEntretien[]; rapportTexte: string }
  | { etat: 'annule'; dossier: string | null; faits: SuiviEntretienLot[] }
  | { etat: 'echec'; message: string }

/** Demande d'un run d'export corpus. */
export interface DemandeLotCorpus {
  /** Entretiens choisis, dans l'ordre de la grille. */
  selection: Array<{ id: string; titre: string; date: string | null }>
  /** Id de l'entretien OUVERT, s'il fait partie du lot : son instantané
   *  vient de la mémoire, jamais d'une relecture disque. */
  idOuvert?: string | null
  /** Sous-ensemble des formats de lecture (txt, html, docx, pdf). */
  formats: FormatExport[]
  options: OptionsExport
  /** Copier les médias accessibles dans `medias/` (l'HTML y référence les copies en relatif). */
  copierMedias: boolean
  /** Enregistrer le rapport détaillé de pseudonymisation (`_rapport-…txt`). */
  enregistrerRapport: boolean
}

/** Accès du service : données de l'entretien ouvert, lecture et écritures
 *  par le main, annulation par consultation. */
export interface SourceExportCorpus {
  nomCorpus: () => string
  /** Instantané de l'entretien OUVERT (état mémoire), ou null. */
  instantaneOuvert: () => Promise<InstantaneEntretienExport | null>
  /** Instantané d'un entretien NON ouvert, assemblé par le main. */
  instantaneDistant: (id: string) => Promise<ResultatInstantaneCorpus>
  choisirDossier: (nomSuggere: string) => Promise<string | null>
  listerDestination: () => Promise<string[]>
  ecrireTexte: (nom: string, contenu: string) => Promise<ResultatEcritureCorpus>
  ecrireDocx: (demande: DemandeExportDocxCorpus, nom: string) => Promise<ResultatEcritureCorpus>
  ecrirePdf: (nom: string, html: string) => Promise<ResultatEcritureCorpus>
  copierMedia: (urlAudio: string) => Promise<ResultatEcritureCorpus>
  fermer: () => Promise<void>
  /** Annulation : consultée AVANT chaque entretien (le courant s'achève) ;
 *  absent = le lot s'exécute jusqu'au bout. */
  doitContinuer?: () => boolean
  /** Progression : k sur n, titre de l'entretien en cours. */
  surProgression?: (faits: number, total: number, titre: string) => void
}

const NOM_INDEX = '_index'
const NOM_RAPPORT = '_rapport-pseudonymisation'

/** Prépare le rapport du lot sélectionné sans choisir de destination ni écrire. */
export async function preparerRapportPseudonymisationCorpus(
  demande: DemandeLotCorpus,
  source: SourceExportCorpus,
): Promise<ResultatPreparationRapportCorpus> {
  try {
    const entretiens: RapportEntretienCorpus[] = []
    const indisponibles: ApercuRapportPseudonymisationCorpus['indisponibles'] = []
    const textes: string[] = []

    for (const selectionne of demande.selection) {
      const resultat = await instantaneDe(selectionne.id, demande, source)
      if (!resultat.instantane) {
        indisponibles.push({
          id: selectionne.id,
          titre: selectionne.titre,
          raison: resultat.raison ?? "L'entretien n'est plus disponible.",
        })
        continue
      }
      const instantane = resultat.instantane
      const rapports = formatsRapport(demande).map((format) => ({
        format,
        rapport: rapportDe(instantane, demande, format),
      }))
      entretiens.push({ id: instantane.id, titre: instantane.titre, formats: rapports })
      textes.push(rapports.map(({ rapport }) => rapportEnTexte(rapport)).join('\n'))
    }

    if (entretiens.length === 0) {
      return {
        etat: 'erreur',
        message: indisponibles[0]?.raison ?? 'Aucun entretien sélectionné ne peut être analysé.',
      }
    }

    return {
      etat: 'succes',
      apercu: {
        entretiens,
        indisponibles,
        texte: textes.join('\n'),
        nomSuggere: `${nettoyerBaseNom(`${source.nomCorpus()}_rapport-pseudonymisation`, 'txt')}.txt`,
      },
    }
  } catch (erreur) {
    return {
      etat: 'erreur',
      message: `Le rapport n'a pas pu être préparé : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
    }
  }
}

/** Enregistre un rapport déjà consulté, indépendamment du dossier d'export. */
export async function enregistrerRapportPseudonymisationCorpus(
  apercu: ApercuRapportPseudonymisationCorpus,
  ecrireTexte: (nomSuggere: string, contenu: string) => Promise<string | null>,
): Promise<ResultatEnregistrementRapportCorpus> {
  try {
    const chemin = await ecrireTexte(apercu.nomSuggere, apercu.texte)
    return chemin ? { etat: 'succes', chemin } : { etat: 'annule' }
  } catch (erreur) {
    return {
      etat: 'erreur',
      message: `L'enregistrement du rapport a échoué : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
    }
  }
}

/** Export d'un lot d'entretiens : dossier choisi une fois, un entretien à la
 *  fois ; un échec est expliqué et n'interrompt jamais le lot. L'index ne
 *  liste que les entretiens exportés. */
export async function exporterCorpus(
  demande: DemandeLotCorpus,
  source: SourceExportCorpus,
): Promise<ResultatLotCorpus> {
  try {
    demande = JSON.parse(JSON.stringify(demande)) as DemandeLotCorpus
    const nomCorpus = source.nomCorpus()
    const nomDossier = nomDossierExportCorpus(nomCorpus, new Date().toISOString().slice(0, 10))
    const dossier = await source.choisirDossier(nomDossier)
    if (!dossier) return { etat: 'annule', dossier: null, faits: [] }
    const existants = new Set(await source.listerDestination())

    const faits: SuiviEntretienLot[] = []
    const lignesIndex: LigneIndexCorpus[] = []
    const documents: Array<{ titre: string; document: DocumentExport }> = []
    const pagesHtml: Array<{ titre: string; ctx: ContexteExport; options: OptionsExport }> = []
    const rapports: Array<{ titre: string; textes: string[] }> = []
    const resumes: ResumeRapportEntretien[] = []

    // Un jeu de noms par format « par entretien » : les collisions se résolvent
    // DANS chaque famille (et contre le disque), avant toute écriture.
    const nomsParFormat = new Map<FormatExport, string[]>()
    for (const format of FORMATS_PAR_ENTRETIEN) {
      if (!demande.formats.includes(format)) continue
      nomsParFormat.set(format, attribuerNomsUniques(
        demande.selection.map((s) => ({
          titre: s.titre,
          ext: extDe(format),
          suffixe: demande.options.anon ? '_pseudonymise' : '',
        })),
        (nom) => existants.has(nom),
      ))
    }

    let traite = 0
    for (let i = 0; i < demande.selection.length; i++) {
      const selectionne = demande.selection[i]
      if (source.doitContinuer && !source.doitContinuer()) {
        for (const s of demande.selection.slice(i)) {
          faits.push({ id: s.id, titre: s.titre, etat: 'abandonne' })
        }
        break
      }
      traite++
      source.surProgression?.(traite, demande.selection.length, selectionne.titre)

      try {
        const resultat = await instantaneDe(selectionne.id, demande, source)
        if (!resultat.instantane) {
          faits.push({
            id: selectionne.id,
            titre: selectionne.titre,
            etat: 'echec',
            raison: resultat.raison ?? "L'entretien à exporter n'est plus disponible.",
          })
          continue
        }
        const instantane = resultat.instantane
        const ctx: ContexteExport = {
          entree: instantane.entretien,
          titre: instantane.titre,
          notes: instantane.notesPubliques,
          audioUrl: instantane.audioLocal,
        }

        // Médias copiés : l'HTML du lot référence les copies RELATIVES ; une
        // copie manquante ne bloque pas l'export (pas de player, mention au
        // rapport par l'absence de média résolu).
        let cheminMediaRelatif: string | null = null
        if (demande.copierMedias && instantane.audioLocal && demande.formats.includes('html')) {
          const copie = await source.copierMedia(instantane.audioLocal)
          cheminMediaRelatif = copie.etat === 'succes' ? copie.cheminRelatif : null
        }
        const ctxHtml: ContexteExport = { ...ctx, audioUrl: cheminMediaRelatif }

        // Formats « par entretien » : génération pure + écriture atomique.
        let echecFormat: string | null = null
        for (const format of FORMATS_PAR_ENTRETIEN) {
          if (!demande.formats.includes(format)) continue
          const nom = nomsParFormat.get(format)![i]
          const contenu =
            format === 'txt' ? genererTxt(ctx, demande.options) : genererHtml(ctxHtml, demande.options)
          const ecriture = await source.ecrireTexte(nom, contenu)
          if (ecriture.etat === 'echec') echecFormat = ecriture.message
        }
        if (echecFormat) {
          faits.push({ id: selectionne.id, titre: selectionne.titre, etat: 'echec', raison: echecFormat })
          continue
        }

        // Document combiné (DOCX) et page combinée (PDF) : accumulation.
        if (demande.formats.includes('docx')) {
          documents.push({
            titre: instantane.titre,
            document: genererDonneesDocx(ctx, demande.options).document,
          })
        }
        if (demande.formats.includes('pdf')) {
          pagesHtml.push({ titre: instantane.titre, ctx, options: demande.options })
        }

        // Rapport de pseudonymisation : adapté à chaque format demandé.
        rapports.push({ titre: instantane.titre, textes: rapportsTextes(instantane, demande) })
        resumes.push(resumeRapport(instantane, demande))

        faits.push({ id: selectionne.id, titre: selectionne.titre, etat: 'succes' })
        lignesIndex.push({
          titre: selectionne.titre,
          date: selectionne.date,
          nbMots: compterMots(instantane.entretien),
        })
      } catch (erreur) {
        faits.push({
          id: selectionne.id,
          titre: selectionne.titre,
          etat: 'echec',
          raison: `L'export a échoué : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
        })
      }
    }

    // Combinés DOCX/PDF : générés UNE fois, à partir de tout ce qui a réussi.
    if (demande.formats.includes('docx') && documents.length > 0) {
      const ecriture = await source.ecrireDocx(
        { titre: nomCorpus, entete: demande.options.entete, document: documentCombine(documents) },
        `${nettoyerBaseNom(nomCorpus, 'docx')}.docx`,
      )
      if (ecriture.etat === 'echec') {
        faits.push({ id: 'docx', titre: 'Document DOCX combiné', etat: 'echec', raison: ecriture.message })
      }
    }
    if (demande.formats.includes('pdf') && pagesHtml.length > 0) {
      const html = genererHtmlCombineCorpus(pagesHtml, nomCorpus, new Date().toLocaleString())
      const ecriture = await source.ecrirePdf(
        `${nettoyerBaseNom(nomCorpus, 'pdf')}.pdf`,
        html,
      )
      if (ecriture.etat === 'echec') {
        faits.push({ id: 'pdf', titre: 'Document PDF combiné', etat: 'echec', raison: ecriture.message })
      }
    }

    // Index : UNIQUEMENT les entretiens exportés avec succès.
    await source.ecrireTexte(
      `${NOM_INDEX}.txt`,
      texteIndexCorpus(nomCorpus, new Date().toLocaleString(), lignesIndex),
    )

    // Rapport détaillé agrégé (une section par entretien et par format).
    const rapportTexte = rapports.map((r) => r.textes.join('\n')).join('\n')
    if (demande.enregistrerRapport && rapportTexte) {
      await source.ecrireTexte(`${NOM_RAPPORT}.txt`, rapportTexte)
    }

    await source.fermer()
    if (faits.some((f) => f.etat === 'abandonne')) return { etat: 'annule', dossier, faits }
    return { etat: 'succes', dossier, faits, rapportResume: resumes, rapportTexte }
  } catch (erreur) {
    await source.fermer()
    return {
      etat: 'echec',
      message: `L'export du corpus a échoué : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
    }
  }
}

// ----------------------------------------------------------------
// Aides locales du service
// ----------------------------------------------------------------

function extDe(format: FormatExport): string {
  return (FORMATS_EXPORT.find((f) => f.format === format)?.ext ?? `.${format}`).slice(1)
}

/** Instantané d'un entretien du lot : mémoire pour l'ouvert, fichiers natifs
 *  (lus par le main) pour les autres. L'entretien ouvert n'est JAMAIS rouvert ;
 *  un échec de lecture porte sa raison dans le suivi du lot. */
async function instantaneDe(
  id: string,
  demande: DemandeLotCorpus,
  source: SourceExportCorpus,
): Promise<{ instantane: InstantaneEntretienExport | null; raison?: string }> {
  if (id === demande.idOuvert) {
    return { instantane: await source.instantaneOuvert() }
  }
  const resultat = await source.instantaneDistant(id)
  return resultat.etat === 'succes'
    ? { instantane: resultat.instantane }
    : { instantane: null, raison: resultat.message }
}

/** Rapports de pseudonymisation d'un entretien : une version par format
 *  demandé (le rapport tient compte du format et des options choisis). */
function rapportsTextes(
  instantane: InstantaneEntretienExport,
  demande: DemandeLotCorpus,
): string[] {
  return formatsRapport(demande).map((format) =>
    rapportEnTexte(rapportDe(instantane, demande, format)),
  )
}

/** Synthèse compacte (vue globale de la modale) : volumes des trois sections
 *  du rapport, cumulés sur les formats demandés. */
function resumeRapport(
  instantane: InstantaneEntretienExport,
  demande: DemandeLotCorpus,
): ResumeRapportEntretien {
  let appliquees = 0
  let conserves = 0
  let aVerifier = 0
  for (const format of formatsRapport(demande)) {
    const rapport = rapportDe(instantane, demande, format)
    appliquees += rapport.appliquees.length
    conserves += rapport.conserves.length
    aVerifier += rapport.aVerifier.length
  }
  return { id: instantane.id, titre: instantane.titre, appliquees, conserves, aVerifier }
}

function formatsRapport(demande: DemandeLotCorpus): FormatExport[] {
  return demande.formats.length > 0 ? demande.formats : ['txt']
}

function rapportDe(
  instantane: InstantaneEntretienExport,
  demande: DemandeLotCorpus,
  format: FormatExport,
): RapportPseudonymisationExport {
  return etablirRapportPseudonymisation(instantane.entretien, {
    format,
    options: demande.options,
    titre: instantane.titre,
    notes: instantane.notesPubliques,
    mediaPresent: instantane.audioLocal != null,
  })
}
