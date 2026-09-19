/**
 *  Corps des notes en TEXTE PUR, sans DOM — consommé par les générateurs
 *  d'export (Node, tests, futur export corpus côté main). Le convertisseur
 *  est limité au sous-HTML déjà sanitisé par `sanitiserCorpsNote` : texte
 *  échappé, `<mark>` (passage important, rendu ▸…◂) et `<em>` (rendu sans
 *  marquage). Tout autre balisage (qui ne devrait plus exister à ce stade)
 *  est simplement jeté.
 */

/** Convertit un corps de note sanitisé en texte brut : `<mark>` encadre le
 *  passage important en ▸…◂, le reste est aplati en texte. */
export function corpsNoteEnTexte(html: string): string {
  if (!html) return ''
  return html
    // Les marqueurs de passage AVANT le décapage des balises.
    .replace(/<mark(\s[^>]*)?>/g, '▸')
    .replace(/<\/mark>/g, '◂')
    .replace(/<(em)\b[^>]*>/g, '')
    .replace(/<\/em>/g, '')
    // Toute balise résiduelle est jetée (l'entrée sanitisée n'en contient plus).
    .replace(/<[^>]*>/g, '')
    // Puis le texte est dés-échappé (l'échappement n'a porté que &, <, >).
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}
