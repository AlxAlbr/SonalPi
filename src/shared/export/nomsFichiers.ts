/**
 *  Nommage sûr des fichiers d'export, préparé pour les lots : un futur
 *  export corpus traitera une LISTE de noms AVANT toute écriture — noms
 *  valides sur toutes les plateformes prises en charge, collisions résolues
 *  de façon déterministe, aucun écrasement silencieux d'un fichier existant.
 */

/** Caractères interdits ou à risque sur Windows/macOS/Linux. */
const INTERDITS = /[/\\?%*:|"<>\x00-\x1f]/g

/** Noms réservés Windows (insensibles à la casse), avec ou sans extension. */
const RESERVES_WINDOWS = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
])

/** Longueur plafond d'un nom de fichier (marge conservatrice sous les limites
 *  des systèmes de fichiers, extension comprise). */
const LONGUEUR_MAX = 200

/** Titre de repli quand la base nettoyée est vide. */
const REPLI = 'entretien'

/** Base de nom SÛRE et déterministe pour un titre : caractères interdits
 *  remplacés, noms réservés Windows préfixés, points/espaces finaux retirés
 *  (Windows les ignore et peut rendre le fichier inouvrable), longueur bornée
 *  en conservant la place pour l'extension. */
export function nettoyerBaseNom(titre: string, ext: string): string {
  const base = titre.replace(INTERDITS, '-').trim() || REPLI
  const longueurBase = Math.max(1, LONGUEUR_MAX - (ext.length + 1))
  const tronque = (RESERVES_WINDOWS.has(base.toUpperCase()) ? `-${base}` : base).slice(0, longueurBase)
  // Un point ou une espace final (ex. « Entretien. ») est illégal sur Windows.
  return tronque.replace(/[. ]+$/, '') || REPLI
}

/** Nom de fichier d'un export : titre nettoyé, suffixe `_pseudonymise`, extension. */
export function nomFichierExport(titre: string, ext: string, anon: boolean): string {
  return `${nettoyerBaseNom(titre, ext)}${anon ? '_pseudonymise' : ''}.${ext}`
}

/** Nom de candidat avec un rang de collision (0 = pas de rang) : le rang est
 *  inséré AVANT l'extension, jamais dans l'extension. */
function candidat(base: string, ext: string, rang: number): string {
  return `${base}${rang > 0 ? ` (${rang})` : ''}.${ext}`
}

/** Attribue des noms UNIQUES à toute une liste d'artefacts avant écriture :
 *  - une collision DANS le lot se résout en `Entretien (2).txt`, `Entretien
 *    (3).txt`… de façon déterministe (ordre d'arrivée) ;
 *  - un fichier DÉJÀ PRÉSENT sur disque n'est jamais écrasé : le premier rang
 *    libre est choisi, même règle.
 *  Renvoie les noms dans l'ordre des demandes. */
export function attribuerNomsUniques(
  demandes: Array<{ titre: string; ext: string; suffixe?: string }>,
  existe: (nom: string) => boolean = () => false,
): string[] {
  const pris = new Set<string>()
  return demandes.map(({ titre, ext, suffixe = '' }) => {
    const base = nettoyerBaseNom(titre, ext) + suffixe
    // Le nom SANS rang d'abord ; les collisions s'incrémentent à partir de 2
    // (convention « fichier (2).ext », le rang est inséré avant l'extension).
    let nom = candidat(base, ext, 0)
    let rang = 2
    // Chaque candidat est testé contre le lot ET le disque : un nom pris par
    // le lot ou déjà présent sur disque n'est jamais réutilisé tel quel.
    while (pris.has(nom) || existe(nom)) {
      // Borne défensive : une borne quasi inatteignable en usage réel.
      if (rang > 10_000) throw new Error('Impossible de nommer les fichiers sans collision.')
      nom = candidat(base, ext, rang++)
    }
    pris.add(nom)
    return nom
  })
}
