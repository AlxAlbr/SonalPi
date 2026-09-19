/**
 *  Contrats partagés des « Docs cadre projet » — l'espace documentaire propre
 *  à chaque corpus (notice de consentement, guides de méthode, consignes…).
 *
 *  Principe structurant : SonalPi conserve les documents dans leur format
 *  d'origine et ne modifie JAMAIS leur contenu. L'édition est confiée à
 *  l'application habituelle du poste ou à Nextcloud ; SonalPi assure
 *  l'inventaire, quelques aperçus fiables et l'accès aux fichiers.
 *
 *  Module PUR (zéro import Node/Electron) : partagé par le main, le preload,
 *  le renderer et les tests.
 */

/** Dossier des documents de méthode, à la racine du corpus. */
export const DOSSIER_DOCS_CADRE = 'DocsCadre'
/** Corbeille douce : une suppression déplace le fichier ici, jamais hors corpus. */
export const DOSSIER_CORBEILLE_DOCS_CADRE = 'corbeille/DocsCadre'

/** Origine d'un document : fichier du corpus (« projet ») ou ressource embarquée. */
export type SourceDocumentCadre = 'projet' | 'exemple'

/** Corpus local : fichiers réels. Corpus distant : lecture WebDAV directe, sans miroir. */
export type ModeDocumentsCadre = 'local' | 'distant'

/** Famille de rendu d'un document, déduite de son extension (jamais du contenu). */
export type TypeDocumentCadre = 'pdf' | 'texte' | 'image' | 'bureautique' | 'html' | 'autre'

/** Carte d'un document dans les listes de la fenêtre. */
export interface ResumeDocumentCadre {
  source: SourceDocumentCadre
  /** Nom exact du fichier, extension comprise. */
  nom: string
  type: TypeDocumentCadre
  /** Taille en octets ; null si inconnue (serveur avare, dossier absent). */
  taille: number | null
  /** Date de modification ISO 8601 ; null si indisponible. */
  modifieLe: string | null
}

/** Raison de l'absence d'aperçu intégré. */
export type RaisonSansApercu =
  /** Format sans aperçu fiable et sûr (bureautique, HTML, autre). */
  | 'format'
  /** Fichier plus volumineux que la limite d'aperçu (le fichier reste listé). */
  | 'taille'
  /** Octets lus mais signature minimale non reconnue (extension mensongère). */
  | 'signature'
  /** Contenu non décodable en UTF-8 (autre encodage, données binaires). */
  | 'encodage'
  /** Document disparu entre deux listes. */
  | 'absent'
  /** Erreur de lecture (droits, disque, réseau). */
  | 'lecture'
  /** Nom refusé par la validation de sécurité. */
  | 'invalide'

/** Aperçu d'un document : texte échappé, image, PDF ou absence expliquée. */
export type ApercuDocumentCadre =
  | { genre: 'texte'; contenu: string }
  | { genre: 'image'; octets: Uint8Array; mime: string }
  | { genre: 'pdf'; octets: Uint8Array }
  | { genre: 'aucun'; raison: RaisonSansApercu }

/** Réponse de `lireApercu` : la fiche et son aperçu (ou sa raison d'absence). */
export interface ResultatLectureDocsCadre {
  resume: ResumeDocumentCadre
  apercu: ApercuDocumentCadre
}

/** Inventaire complet pour l'ouverture de la fenêtre. */
export interface InventaireDocsCadre {
  mode: ModeDocumentsCadre
  /** Documents du corpus courant. */
  projet: ResumeDocumentCadre[]
  /** Exemples embarqués, toujours disponibles (même hors ligne). */
  exemples: ResumeDocumentCadre[]
  /** Erreur limitée à l'inventaire distant ; les exemples restent utilisables. */
  erreurProjet?: string
}

/** Résultat d'une mutation de liste (ajout, renommage). */
export type ResultatMutationDocsCadre =
  | { ok: true; nom: string }
  | {
      ok: false
      raison:
        | 'existe'
        | 'invalide'
        | 'absent'
        | 'lecture'
        | 'distant'
        | 'exemple'
        /** Sélecteur annulé (ajout) : rien à signaler à l'utilisateur. */
        | 'annule'
        /** Source de dépôt non valide (dossier, lien, fichier manquant). */
        | 'source'
      /** Premier nom libre proposé (`<base>-2`, `-3`…) en cas de collision. */
      suggere?: string
    }

/* ── Formats ─────────────────────────────────────────────────────────────── */

export const EXTENSIONS_TEXTE = ['txt', 'md', 'csv'] as const
export const EXTENSIONS_IMAGE = ['png', 'jpg', 'jpeg', 'gif', 'webp'] as const
export const EXTENSIONS_BUREAUTIQUE = ['docx', 'odt', 'rtf', 'doc'] as const
export const EXTENSIONS_HTML = ['html', 'htm'] as const

const MIME_IMAGES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

/** MIME d'un type image connu, sinon `application/octet-stream`. */
export function mimeImage(extension: string): string {
  return MIME_IMAGES[extension.toLowerCase()] ?? 'application/octet-stream'
}

/** Famille d'un document d'après son nom (extension, casse ignorée). */
export function categoriserDocument(nom: string): TypeDocumentCadre {
  const extension = extensionDe(nom)
  if (!extension) return 'autre'
  if ((EXTENSIONS_TEXTE as readonly string[]).includes(extension)) return 'texte'
  if ((EXTENSIONS_IMAGE as readonly string[]).includes(extension)) return 'image'
  if (extension === 'pdf') return 'pdf'
  if ((EXTENSIONS_BUREAUTIQUE as readonly string[]).includes(extension)) return 'bureautique'
  if ((EXTENSIONS_HTML as readonly string[]).includes(extension)) return 'html'
  return 'autre'
}

/** Extension d'un nom de fichier, sans le point, en minuscules ('' si aucune). */
export function extensionDe(nom: string): string {
  const point = nom.lastIndexOf('.')
  return point <= 0 ? '' : nom.slice(point + 1).toLowerCase()
}

/* ── Validation des noms ─────────────────────────────────────────────────── */

/** Noms réservés Windows (CON, COM1…) — invalides ou dangereux sur ce poste. */
const NOMS_RESERVES_WINDOWS = [
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]

/** Garde de forme d'un nom de document cadre : portable et sans traversal.
 *  Refus : vide, trop long, séparateur de chemin, octet nul, caractères de
 *  contrôle, point/espace final, nom réservé Windows (base, extension incluse).
 *  La casse, les espaces et les accents sont CONSERVÉS (le nom reste identité). */
export function estNomSain(nom: string): boolean {
  if (!nom || nom.length > 255) return false
  if (nom.includes('/') || nom.includes('\\') || nom.includes('..')) return false
  if (nom.includes('\0')) return false
  for (const c of nom) {
    const code = c.codePointAt(0) ?? 0
    if (code < 0x20) return false
  }
  if (nom.endsWith('.') || nom.endsWith(' ')) return false
  const base = nom.split('.')[0] ?? ''
  return !NOMS_RESERVES_WINDOWS.includes(base.toUpperCase())
}

/** Fichier listable : ni caché, ni temporaire, ni verrou bureautique.
 *  Les sous-dossiers, liens symboliques et temporaires ne sont pas affichés. */
export function estListable(nom: string): boolean {
  return (
    estNomSain(nom) &&
    !nom.startsWith('.') &&
    !nom.startsWith('~$') &&
    !nom.endsWith('~') &&
    !nom.endsWith('.tmp') &&
    !nom.endsWith('.crdownload') &&
    !nom.endsWith('.part')
  )
}

/** Tri alphabétique français stable (accents et casse gérés par locale). */
export function trierDocuments(liste: ResumeDocumentCadre[]): ResumeDocumentCadre[] {
  return [...liste].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
}

/** Premier nom libre `<base>-2`, `-3`… insensible à la casse, d'après les
 *  existants. Sert aux collisions d'ajout et de renommage, jamais à l'écrasement. */
export function nomLibre(nom: string, existants: readonly string[]): string {
  const pris = new Set(existants.map((n) => n.toLowerCase()))
  if (!pris.has(nom.toLowerCase())) return nom
  const point = nom.lastIndexOf('.')
  const base = point <= 0 ? nom : nom.slice(0, point)
  const ext = point <= 0 ? '' : nom.slice(point)
  for (let n = 2; n < 1000; n++) {
    const candidat = `${base}-${n}${ext}`
    if (!pris.has(candidat.toLowerCase())) return candidat
  }
  return `${base}-${Date.now()}${ext}`
}

/* ── Limites d'aperçu ────────────────────────────────────────────────────── */

/** Plafond de lecture mémoire d'un aperçu TEXTE. Ce ne sont PAS des limites de
 *  stockage : un fichier trop volumineux reste listé et ouvrable ailleurs. */
export const LIMITE_APERCU_TEXTE_OCTETS = 2_000_000
/** Plafond de lecture mémoire d'un aperçu IMAGE. */
export const LIMITE_APERCU_BINAIRE_OCTETS = 20_000_000
/** Plafond de lecture mémoire d'un aperçu PDF. */
export const LIMITE_APERCU_PDF_OCTETS = 30_000_000

/* ── Ressources exemples embarquées ──────────────────────────────────────── */

/** Contenu initial des exemples livrés avec l'application ;
 *  les contenus définitifs les remplaceront sans changer l'API. */
export const CONTENU_EXEMPLE_A_VENIR = 'À venir.'

/** Ordre d'affichage des exemples, décidé par l'application : les documents de
 *  conformité d'abord, les guides de méthode ensuite. Cet ordre fait foi pour
 *  la fenêtre ; il ne dépend pas du tri alphabétique. */
export const NOMS_EXEMPLES_DOCS = [
  'Déclaration traitement DPO.txt',
  'Notice de consentement DPO.txt',
  'Guide de correction.txt',
  'Guide de pseudonymisation.txt',
] as const

/** Range des exemples dans l'ordre de `NOMS_EXEMPLES_DOCS`. Un fichier non
 *  déclaré (déposé à la main dans le dossier des exemples) vient après les
 *  documents connus, trié alphabétiquement. */
export function trierExemplesDocs(liste: ResumeDocumentCadre[]): ResumeDocumentCadre[] {
  const rang = (nom: string): number => {
    const index = NOMS_EXEMPLES_DOCS.indexOf(nom as (typeof NOMS_EXEMPLES_DOCS)[number])
    return index === -1 ? NOMS_EXEMPLES_DOCS.length : index
  }
  return [...liste].sort((a, b) => rang(a.nom) - rang(b.nom) || a.nom.localeCompare(b.nom, 'fr'))
}
