/**
 *  Mapping offset-caractère ↔ position ProseMirror.
 *  Le parseur `.sonal` raisonne en offsets caractère dans un texte plat par bloc ;
 *  le modèle attend des positions ProseMirror, qui comptent les frontières de blocs
 *  (chaque paragraphe = un token d'ouverture + son  contenu + un token de fermeture).
 *
 *  Pour des blocs de longueurs de texte `longueurs` :
 *   - on entre dans le 1er bloc → +1 ;
 *   - chaque bloc pèse `2 + len` (open + contenu + close).
 *
 *  Vit dans shared/ (arithmétique pure, aucune dépendance ProseMirror) :
 *  la migration formatVersion 1→2 du store (main) et l'import/export (renderer) s'en servent.
 */

/** Position PM du début du CONTENU du bloc k (avant son 1er caractère). */
export function debutBloc(longueurs: number[], k: number): number {
  let pos = 1
  for (let i = 0; i < k; i++) pos += 2 + longueurs[i]
  return pos
}

/** Offset caractère (dans le bloc k) → position PM absolue. */
export function charVersPM(longueurs: number[], k: number, offset: number): number {
  return debutBloc(longueurs, k) + offset
}

/**
 *  Pour l'export : une plage PM absolue [from, to[ → ses tranches par bloc.
 *  Un codage qui enjambe plusieurs blocs (édition libre) ressort découpé en une
 *  tranche par bloc (offsets caractère locaux) — exactement ce que le `.sonal`
 *  sait représenter (un fragment par segment). Renvoie [] si hors de tout contenu.
 */
export function pmVersTranches(
  longueurs: number[],
  from: number,
  to: number,
): Array<{ bloc: number; debut: number; fin: number }> {
  const tranches: Array<{ bloc: number; debut: number; fin: number }> = []
  for (let k = 0; k < longueurs.length; k++) {
    const start = debutBloc(longueurs, k)
    const end = start + longueurs[k]
    const d = Math.max(from, start)
    const f = Math.min(to, end)
    if (d < f) tranches.push({ bloc: k, debut: d - start, fin: f - start })
  }
  return tranches
}
