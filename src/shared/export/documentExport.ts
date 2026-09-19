/**
 *  Document intermédiaire d'export : structure neutre partagée entre le
 *  renderer (qui la construit depuis la projection) et le main (DOCX).
 *  Les générateurs texte la convertissent sans réinterpréter le contenu :
 *  aucune chaîne saisie par l'utilisateur (`{g}`, `**…**`, etc.) n'est
 *  décodée comme une mise en forme.
 */

/** Une plage de texte homogène : un seul style par run. */
export interface RunTexteExport {
  texte: string
  gras?: boolean
  italique?: boolean
}

/** Bloc du document :
 *  - `titre` / `section` : lignes de structure (converties en titres Word) ;
 *  - `paragraphe` : ligne de contenu ;
 *  - `espace` : ligne vide (séparation visuelle). */
export type BlocDocumentExport =
  | { type: 'titre' | 'section' | 'paragraphe'; runs?: RunTexteExport[] }
  | { type: 'espace' }

export interface DocumentExport {
  blocs: BlocDocumentExport[]
}

/** Section : un titre de section suivi de ses paragraphes. */
export function sectionDocument(
  titre: string,
  lignes: RunTexteExport[][],
): BlocDocumentExport[] {
  return [
    { type: 'section', runs: [{ texte: titre, gras: true }] },
    ...lignes.map((runs) => ({ type: 'paragraphe' as const, runs })),
  ]
}

/** Aplatit le document en texte : un paragraphe par ligne, un saut pour un
 *  espace. Les styles sont ignorés (TXT). */
export function texteDocument(doc: DocumentExport): string {
  let out = ''
  for (const bloc of doc.blocs) {
    if (bloc.type === 'espace') out += '\n'
    else out += (bloc.runs ?? []).map((r) => r.texte).join('') + '\n'
  }
  return out
}
