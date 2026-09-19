import { exporterSonal, sonalAnonymise } from '../import/exportSonal'
import type { DemandeExportDocx, DemandeExportPdf } from '../../shared/format'
import type {
  Categorie,
  Note,
  NoteCategory,
  RegleAnon,
  Variable,
} from '../../shared/format'
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
  optionsEfficaces,
} from '../../shared/export/types'
import {
  genererTxt,
  genererSrt,
  genererVtt,
  genererHtml,
  genererDonneesDocx,
} from '../../shared/export/formatsTexte'
import {
  auditerPseudonymisation,
  type ModePseudonymisation,
  type RapportPseudonymisationExport,
} from '../../shared/export/pseudonymisation'

// ----------------------------------------------------------------
// SERVICE D'EXPORT D'ENTRETIEN (renderer, sans Vue)
// ----------------------------------------------------------------
// Orchestration d'un run d'export : instantané → audit → génération →
// écriture. Aucune dépendance Vue/Electron : les accès (données de
// l'entretien ouvert, résolution audio, écritures) sont injectés, ce qui
// rend le service testable avec des doublures.

/** Résultat d'un run d'export : toujours présenté à l'interface (jamais de
 *  promesse rejetée silencieuse) : fichier écrit, annulation du dialogue,
 *  pseudonymisation incomplète en mode strict, ou erreur de génération. */
export type ResultatExport =
  | { etat: 'succes'; chemin: string }
  | { etat: 'annule' }
  | { etat: 'bloque'; rapport: RapportPseudonymisationExport }
  | { etat: 'erreur'; message: string }

/** Données brutes de l'entretien ouvert (l'état mémoire de l'éditeur), avec
 *  les définitions de corpus jointes. */
export type DonneesEntretienOuvert = Omit<
  EntreeExport,
  'codebook' | 'variables' | 'reglesAnon'
> & {
  notes?: Note[]
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
  return {
    id,
    titre: source.titre(id),
    entretien: {
      ...donnees,
      codebook: source.codebook(),
      variables: source.variables(),
      reglesAnon: source.reglesAnon(),
    },
    notesPubliques: donnees.notes ?? [],
    audioLocal: refAudio ? await source.audioLocal(refAudio) : null,
  }
}

/** Export de l'entretien ouvert dans le format demandé. Tous les formats
 *  projettent le MÊME fragment segmenté (source unique du découpage) ; le
 *  `.sonal` reste la voie d'archivage SonalPi1. Un export pseudonymisé est
 *  d'abord AUDITÉ : en mode strict, une pseudonymisation incomplète bloque
 *  la génération (rapport présenté) ; en mode partiel, seuls les pseudonymes
 *  configurés s'appliquent (avertissement affiché). */
export async function exporterEntretien(
  format: FormatExport,
  options: OptionsExport & { modeAnon?: ModePseudonymisation },
  source: SourceExportEntretien,
): Promise<ResultatExport> {
  const instantane = await construireInstantane(source)
  if (!instantane) {
    return { etat: 'erreur', message: "L'entretien à exporter n'est plus disponible." }
  }
  const ctx: ContexteExport = {
    entree: instantane.entretien,
    titre: instantane.titre,
    notes: instantane.notesPubliques,
    audioUrl: instantane.audioLocal,
  }
  const ext = FORMATS_EXPORT.find((f) => f.format === format)?.ext ?? `.${format}`
  const nom = nomFichierExport(instantane.titre, ext.slice(1), options.anon)
  try {
    if (options.anon) {
      const rapport = auditerPseudonymisation(instantane.entretien, {
        mode: options.modeAnon ?? 'strict',
        // Le .sonal porte toujours les locuteurs (tables) ; pour les formats
        // documentaires, l'option « Locuteurs » décide.
        locuteursInclus: format === 'sonal' || optionsEfficaces(format, options).loc,
        notes: instantane.notesPubliques,
        titre: instantane.titre,
        media: format === 'html',
      })
      if ((options.modeAnon ?? 'strict') === 'strict' && rapport.bloquants.length > 0) {
        return { etat: 'bloque', rapport }
      }
    }
    switch (format) {
      case 'sonal': {
        const contenu = options.anon
          ? sonalAnonymise(instantane.entretien)
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
