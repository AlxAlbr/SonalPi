/**
 *  Assemblage d'instantanés pour l'export de lot : un entretien NON ouvert
 *  est lu depuis les fichiers natifs par le main, jamais par le renderer.
 *  Aucun verrou d'écriture n'est requis — l'export est une lecture, et un
 *  entretien en échec est un échec typé, jamais une exception qui rompt le lot.
 */
import type { CorpusStore } from './corpusStore'
import type { ResultatInstantaneCorpus } from '../shared/export/corpus'
import { assemblerInstantaneCorpus } from '../shared/export/corpus'
import { urlAudioLocal } from './exportEntretien'
import { BrowserWindow, dialog } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { basename, join } from 'node:path'
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { DemandeExportDocxCorpus } from '../shared/format'
import type { ResultatEcritureCorpus } from '../shared/export/corpus'
import { nettoyerBaseNom } from '../shared/export/nomsFichiers'
import { paragrapheDe, ecrireFichierAtomique, imprimerPdf } from './exportEntretien'
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'

/** Assemble l'instantané complet d'un entretien non ouvert : fichier natif
 *  lu par le store, définitions du corpus courant, URL audio résolue par le
 *  main (null si média absent ou inaccessible). */
export function assemblerInstantaneDistant(
  store: CorpusStore,
  id: string,
): ResultatInstantaneCorpus {
  let corpus
  try {
    corpus = store.ouvrir()
  } catch (erreur) {
    return {
      etat: 'echec',
      message: `Le corpus n'a pas pu être relu : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
    }
  }
  const lecture = store.lireEntretien(id)
  if (!lecture.ok) {
    const titre = corpus.membership[id]?.titre ?? id
    return {
      etat: 'echec',
      message:
        lecture.raison === 'version'
          ? `L'entretien « ${titre} » est dans une version de fichier non prise en charge.`
          : `L'entretien « ${titre} » est introuvable dans le corpus.`,
    }
  }
  const audioRef = lecture.data.meta.audioRef
  const audioLocal = audioRef ? urlAudioLocal(store, audioRef) : null
  return {
    etat: 'succes',
    instantane: assemblerInstantaneCorpus(id, lecture.data, corpus, audioLocal),
  }
}

// ----------------------------------------------------------------
// SESSION D'ÉCRITURE D'UN LOT : dossier choisi une fois, écritures atomiques
// ----------------------------------------------------------------

/** Une session par fenêtre : le dossier choisi par l'utilisateur est la SEULE
 *  zone où le lot a le droit d'écrire. Les noms de fichiers sont re-sécurisés
 *  ici (basenames + nettoyage), le renderer ne fournit jamais un chemin libre. */
const sessions = new Map<number, string>()

/** Sécurise un nom de fichier demandé par le renderer : basename imposé
 *  (aucun séparateur de chemin), base et extension nettoyées comme partout. */
function securiserNomFichier(nom: string): string {
  const brut = basename(nom)
  const point = brut.lastIndexOf('.')
  const ext = point > 0 ? brut.slice(point + 1) : ''
  const base = point > 0 ? brut.slice(0, point) : brut
  return `${nettoyerBaseNom(base, ext)}.${ext}`
}

function dossierDe(e: IpcMainInvokeEvent): string | null {
  return sessions.get(e.sender.id) ?? null
}

function resultatEcriture(cheminRelatif: string): ResultatEcritureCorpus {
  return { etat: 'succes', cheminRelatif }
}

function echecEcriture(erreur: unknown, action: string): ResultatEcritureCorpus {
  return {
    etat: 'echec',
    message: `${action} a échoué : ${erreur instanceof Error ? erreur.message : String(erreur)}`,
  }
}

/** Choix du dossier de destination (dialogue natif, une seule fois par lot) ;
 *  le dossier est créé s'il n'existe pas, et devient la seule zone d'écriture
 *  de la session. */
export async function choisirDossierCorpus(
  e: IpcMainInvokeEvent,
  nomSuggere: string,
): Promise<string | null> {
  const fenetre = BrowserWindow.fromWebContents(e.sender)
  const options = {
    defaultPath: nomSuggere,
    properties: ['createDirectory'] as Array<'createDirectory'>,
  }
  const r = fenetre
    ? await dialog.showSaveDialog(fenetre, options)
    : await dialog.showSaveDialog(options)
  if (r.canceled || !r.filePath) return null
  mkdirSync(r.filePath, { recursive: true })
  sessions.set(e.sender.id, r.filePath)
  return r.filePath
}

/** Fichiers déjà présents dans le dossier de destination (pour que le
 *  renderer résolve les collisions de noms avant d'écrire). */
export function listerDossierCorpus(e: IpcMainInvokeEvent): string[] {
  const dossier = dossierDe(e)
  if (!dossier || !existsSync(dossier)) return []
  try {
    return readdirSync(dossier)
  } catch {
    return []
  }
}

/** Écriture atomique d'un fichier texte dans le dossier de la session. */
export function ecrireTexteCorpus(e: IpcMainInvokeEvent, nom: string, contenu: string): ResultatEcritureCorpus {
  const dossier = dossierDe(e)
  if (!dossier) return { etat: 'echec', message: 'Aucun dossier de destination choisi.' }
  try {
    ecrireFichierAtomique(join(dossier, securiserNomFichier(nom)), contenu)
    return resultatEcriture(securiserNomFichier(nom))
  } catch (erreur) {
    return echecEcriture(erreur, `L'écriture de « ${nom} »`)
  }
}

/** Construit le buffer du DOCX combiné : en-tête CORPUS optionnel, puis le
 *  document combiné (une section par entretien). */
export async function construireDocxBufferCorpus(demande: DemandeExportDocxCorpus): Promise<Buffer> {
  const enfants: Paragraph[] = []
  if (demande.entete) {
    enfants.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: 'CORPUS', bold: true })], spacing: { after: 100 } }))
    enfants.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: demande.titre, bold: true })], spacing: { after: 100 } }))
    enfants.push(
      new Paragraph({
        children: [new TextRun({ text: `Exporté par Sonal π 2 le ${new Date().toLocaleString()}`, size: 20 })],
        spacing: { after: 200 },
      }),
    )
  }
  for (const bloc of demande.document.blocs) enfants.push(paragrapheDe(bloc))
  return Packer.toBuffer(new Document({ sections: [{ children: enfants }] }))
}

/** DOCX combiné du corpus : buffer construit ici, écrit de façon atomique
 *  dans le dossier de la session. */
export async function ecrireDocxCorpus(
  e: IpcMainInvokeEvent,
  demande: DemandeExportDocxCorpus,
  nom: string,
): Promise<ResultatEcritureCorpus> {
  const dossier = dossierDe(e)
  if (!dossier) return { etat: 'echec', message: 'Aucun dossier de destination choisi.' }
  const nomFichier = securiserNomFichier(nom)
  try {
    const buffer = await construireDocxBufferCorpus(demande)
    ecrireFichierAtomique(join(dossier, nomFichier), buffer)
    return resultatEcriture(nomFichier)
  } catch (erreur) {
    return echecEcriture(erreur, `L'écriture de « ${nomFichier} »`)
  }
}

/** PDF combiné du corpus : le HTML multi-sections est imprimé par le main
 *  (printToPDF, même fenêtre sandboxée que l'export d'entretien). */
export async function ecrirePdfCorpus(
  e: IpcMainInvokeEvent,
  nom: string,
  html: string,
): Promise<ResultatEcritureCorpus> {
  const dossier = dossierDe(e)
  if (!dossier) return { etat: 'echec', message: 'Aucun dossier de destination choisi.' }
  const nomFichier = securiserNomFichier(nom)
  try {
    const buffer = await imprimerPdf(html)
    ecrireFichierAtomique(join(dossier, nomFichier), buffer)
    return resultatEcriture(nomFichier)
  } catch (erreur) {
    return echecEcriture(erreur, `L'écriture de « ${nomFichier} »`)
  }
}

/** Copie un média résolu (URL file:// déjà vérifiée par le main) dans le
 *  sous-dossier `medias/` de la destination ; renvoie le chemin RELATIF à
 *  référencer depuis l'HTML. Une collision est résolue localement. */
export async function copierMediaCorpus(
  e: IpcMainInvokeEvent,
  urlAudio: string,
): Promise<ResultatEcritureCorpus> {
  const dossier = dossierDe(e)
  if (!dossier) return { etat: 'echec', message: 'Aucun dossier de destination choisi.' }
  try {
    const source = fileURLToPath(urlAudio)
    if (!existsSync(source)) {
      return { etat: 'echec', message: 'Le média n\'est plus accessible sur ce poste.' }
    }
    const ext = basename(source).includes('.') ? basename(source).split('.').pop()! : ''
    const base = nettoyerBaseNom(basename(source, ext ? `.${ext}` : ''), ext)
    const dossierMedias = join(dossier, 'medias')
    mkdirSync(dossierMedias, { recursive: true })
    let nomFinal = `${base}.${ext}`
    let rang = 2
    while (existsSync(join(dossierMedias, nomFinal))) {
      nomFinal = `${base} (${rang++}).${ext}`
    }
    copyFileSync(source, join(dossierMedias, nomFinal))
    return resultatEcriture(`medias/${nomFinal}`)
  } catch (erreur) {
    return echecEcriture(erreur, 'La copie du média')
  }
}

/** Libère la session de la fenêtre (appelé en fin de lot, succès comme échec). */
export function fermerExportCorpus(e: IpcMainInvokeEvent): void {
  sessions.delete(e.sender.id)
}
