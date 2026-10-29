import { exporterSonal, sonalPseudonymise } from '../formatSonal/exportSonal'
import type { DemandeExportDocx, DemandeExportPdf } from '../../shared/format'
import type {
  Categorie,
  Note,
  NoteCategory,
  RegleAnon,
  Variable,
} from '../../shared/format'
import type { ReperePassage } from '../../shared/entretien/reperesPassages'
import type {
  ContexteExport,
  EntreeExport,
  FormatExport,
  InstantaneEntretienExport,
  OptionsExport,
} from '../../shared/export/types'
import {
  FORMATS_EXPORT,
  nomFichierExport,
} from '../../shared/export/types'
import { nettoyerBaseNom } from '../../shared/export/nomsFichiers'
import {
  genererTxt,
  genererSrt,
  genererVtt,
  genererHtml,
  genererDonneesDocx,
} from '../../shared/export/formatsTexte'
import {
  etablirRapportPseudonymisation,
  rapportEnTexte,
  type RapportPseudonymisationExport,
} from '../../shared/export/pseudonymisation'

// ----------------------------------------------------------------
// SERVICE D'EXPORT D'ENTRETIEN (renderer, sans Vue)
// ----------------------------------------------------------------
// Orchestration d'un run d'export : instantané → audit → génération →
// écriture. Aucune dépendance Vue/Electron : les accès (données de
// l'entretien ouvert, résolution audio, écritures) sont injectés, ce qui
// rend le service testable avec des doublures.

/** Résultat d'un run d'export : toujours présenté à l'interface. */
export type ResultatExport =
  | { etat: 'succes'; chemin: string }
  | { etat: 'annule' }
  | { etat: 'erreur'; message: string }

export interface ApercuRapportPseudonymisation {
  rapport: RapportPseudonymisationExport
  texte: string
  nomSuggere: string
}

export type ResultatPreparationRapport =
  | { etat: 'succes'; apercu: ApercuRapportPseudonymisation }
  | { etat: 'erreur'; message: string }

/** Données brutes de l'entretien ouvert (l'état mémoire de l'éditeur), avec
 *  les définitions de corpus jointes. */
export type DonneesEntretienOuvert = Omit<
  EntreeExport,
  'codebook' | 'variables' | 'reglesAnon'
> & {
  notes?: Note[]
  reperesPassages: ReperePassage[]
  meta: { valeursGen: Record<string, string>; audioRef: string | null }
}

/** Ce que l'entretien ouvert et le corpus apportent au service. Les données
 *  viennent de l'état MÉMOIRE : aucune écriture, l'entretien n'a pas besoin
 *  d'être enregistré pour être exporté. */
export interface SourceExportEntretien {
  /** Id de l'entretien ouvert ; null = rien à exporter. */
  ouvertId: () => string | null
  titre: (id: string) => string
  donneesExport: () => DonneesEntretienOuvert
  codebook: () => Categorie[]
  variables: () => Variable[]
  categoriesNote: () => NoteCategory[]
  reglesAnon: () => RegleAnon[]
  /** URL audio locale RÉSOLUE par le main (whitelist + existence) ; null
   *  sinon : le service ne construit jamais d'URL ni n'accède au disque. */
  audioLocal: (audioRef: string | null) => Promise<string | null>
  /** Écritures demandées au main (dialogue de destination inclus). */
  ecrireTexte: (nomSuggere: string, contenu: string) => Promise<string | null>
  ecrireDocx: (demande: DemandeExportDocx) => Promise<string | null>
  ecrirePdf: (demande: DemandeExportPdf) => Promise<string | null>
}

/** Assemble l'instantané de l'entretien ouvert depuis l'état en mémoire,
 *  SANS sauvegarde : un export est une photographie, jamais un déclencheur
 *  d'écriture. Un entretien en lecture seule s'exporte autant qu'un autre. */
export async function construireInstantane(
  source: SourceExportEntretien,
): Promise<InstantaneEntretienExport | null> {
  const id = source.ouvertId()
  if (!id) return null
  const donnees = source.donneesExport()
  const refAudio = donnees.meta.audioRef ?? null
  const instantane = JSON.parse(JSON.stringify({
    id,
    titre: source.titre(id),
    date: null,
    reperesPassages: donnees.reperesPassages,
    entretien: {
      ...donnees,
      codebook: source.codebook(),
      variables: source.variables(),
      reglesAnon: source.reglesAnon(),
    },
    notesPubliques: donnees.notes ?? [],
    categoriesNote: source.categoriesNote(),
    audioLocal: null,
  })) as InstantaneEntretienExport
  instantane.audioLocal = refAudio ? await source.audioLocal(refAudio) : null
  return instantane
}

/** Prépare le rapport facultatif sans écrire ni générer l'export final. */
export async function preparerRapportPseudonymisation(
  format: FormatExport,
  options: OptionsExport,
  source: SourceExportEntretien,
): Promise<ResultatPreparationRapport> {
  try {
    const instantane = await construireInstantane(source)
    if (!instantane) {
      return { etat: 'erreur', message: "L'entretien à exporter n'est plus disponible." }
    }
    const rapport = etablirRapportPseudonymisation(instantane.entretien, {
      format,
      options,
      titre: instantane.titre,
      notes: instantane.notesPubliques,
      mediaPresent: instantane.audioLocal != null,
    })
    return {
      etat: 'succes',
      apercu: {
        rapport,
        texte: rapportEnTexte(rapport),
        nomSuggere: `${nettoyerBaseNom(`${instantane.titre}_rapport-pseudonymisation`, 'txt')}.txt`,
      },
    }
  } catch (erreur) {
    return {
      etat: 'erreur',
      message: `Le rapport n'a pas pu être préparé : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
    }
  }
}

/** Enregistre un rapport déjà consulté, sans lancer l'export final. */
export async function enregistrerRapportPseudonymisation(
  apercu: ApercuRapportPseudonymisation,
  source: SourceExportEntretien,
): Promise<ResultatExport> {
  try {
    const chemin = await source.ecrireTexte(apercu.nomSuggere, apercu.texte)
    return chemin ? { etat: 'succes', chemin } : { etat: 'annule' }
  } catch (erreur) {
    return {
      etat: 'erreur',
      message: `L'enregistrement du rapport a échoué : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
    }
  }
}

/** La pseudonymisation applique les remplacements configurés sans bloquer l’export incomplet. */
export async function exporterEntretien(
  format: FormatExport,
  options: OptionsExport,
  source: SourceExportEntretien,
): Promise<ResultatExport> {
  try {
    const instantane = await construireInstantane(source)
    if (!instantane) return { etat: 'erreur', message: "L'entretien à exporter n'est plus disponible." }
    const ctx: ContexteExport = {
      entree: instantane.entretien,
      titre: instantane.titre,
      notes: instantane.notesPubliques,
      categoriesNote: instantane.categoriesNote,
      audioUrl: instantane.audioLocal,
    }
    const ext = FORMATS_EXPORT.find((f) => f.format === format)?.ext ?? `.${format}`
    const nom = nomFichierExport(instantane.titre, ext.slice(1), options.anon)
    switch (format) {
      case 'sonal': {
        const contenu = options.anon
          ? sonalPseudonymise(instantane.entretien)
          : exporterSonal(instantane.entretien)
        const chemin = await source.ecrireTexte(nom, contenu)
        return chemin ? { etat: 'succes', chemin } : { etat: 'annule' }
      }
      case 'txt':
      case 'srt':
      case 'vtt':
      case 'html': {
        const contenu =
          format === 'txt'
            ? genererTxt(ctx, options)
            : format === 'srt'
              ? genererSrt(ctx, options)
              : format === 'vtt'
                ? genererVtt(ctx, options)
                : genererHtml(ctx, options)
        const chemin = await source.ecrireTexte(nom, contenu)
        return chemin ? { etat: 'succes', chemin } : { etat: 'annule' }
      }
      case 'docx': {
        const donnees = genererDonneesDocx(ctx, options)
        const chemin = await source.ecrireDocx({ nomSuggere: nom, ...donnees })
        return chemin ? { etat: 'succes', chemin } : { etat: 'annule' }
      }
      case 'pdf': {
        const chemin = await source.ecrirePdf({
          nomSuggere: nom,
          html: genererHtml(ctx, options),
        })
        return chemin ? { etat: 'succes', chemin } : { etat: 'annule' }
      }
    }
  } catch (erreur) {
    return {
      etat: 'erreur',
      message: `L'export a échoué : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
    }
  }
}
