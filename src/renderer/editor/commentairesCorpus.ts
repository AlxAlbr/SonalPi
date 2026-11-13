import { Node } from '@tiptap/pm/model'
import type { Annotation } from '../../shared/entretien/annotation'
import { estOrpheline } from '../../shared/entretien/annotation'
import { schemaCorpsTexte } from './rechercheCorpus'
import { echapperMarkdown } from '../notes/markdown'

/**
 *  Commentaires d'un entretien, prêts pour l'onglet Commentaires du corpus.
 *  Fonctions pures : elles lisent le corps de texte stocké, sans DOM ni disque.
 */

export interface CommentaireCorpus {
  id: string
  entretienId: string
  entretienTitre: string
  auteur: string
  texte: string
  /** Passage commenté, vide si le texte qui le portait a été supprimé. */
  passage: string
  /** Position ProseMirror du début du passage, navigable dans l'entretien. */
  pos: number
  orphelin: boolean
}

/** Extrait les commentaires d'un entretien, dans l'ordre du texte. */
export function commentairesDeEntretien(
  entretien: { id: string; titre: string },
  corpsTexte: unknown,
  annotations: Annotation[],
): CommentaireCorpus[] {
  let doc: Node | null = null
  try {
    doc = Node.fromJSON(schemaCorpsTexte, corpsTexte as never)
  } catch {
    doc = null
  }
  const taille = doc?.content.size ?? 0
  return annotations
    .filter((a) => a.type === 'commentaire' && (a.texte ?? '').trim())
    .map((a) => {
      const orphelin = estOrpheline(a)
      const de = Math.max(0, Math.min(a.from, taille))
      const fin = Math.max(de, Math.min(a.to, taille))
      const passage = doc && !orphelin ? doc.textBetween(de, fin, ' ').trim() : ''
      return {
        id: a.id,
        entretienId: entretien.id,
        entretienTitre: entretien.titre,
        auteur: a.auteur ?? '',
        texte: a.texte ?? '',
        passage,
        pos: a.from,
        orphelin,
      }
    })
    .sort((x, y) => x.pos - y.pos)
}

/** Minuscules sans accents : « Élève » et « eleve » se retrouvent. */
export function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/** Garde les commentaires dont l'auteur, le texte, le passage ou l'entretien contient la requête. */
export function filtrerCommentaires(commentaires: CommentaireCorpus[], requete: string): CommentaireCorpus[] {
  const q = normaliser(requete.trim())
  if (!q) return commentaires
  return commentaires.filter((c) =>
    [c.texte, c.auteur, c.passage, c.entretienTitre].some((champ) => normaliser(champ).includes(q)))
}

export type CritereTriCommentaires = 'entretien' | 'auteur' | 'texte'

/** Trie une copie de la liste ; à égalité, l'ordre du texte de chaque entretien est conservé. */
export function trierCommentaires(
  commentaires: CommentaireCorpus[],
  critere: CritereTriCommentaires,
  ordre: 'asc' | 'desc',
): CommentaireCorpus[] {
  const cle = (c: CommentaireCorpus) => normaliser(
    critere === 'entretien' ? c.entretienTitre : critere === 'auteur' ? c.auteur : c.texte)
  const sens = ordre === 'asc' ? 1 : -1
  return [...commentaires].sort((x, y) =>
    sens * cle(x).localeCompare(cle(y), 'fr')
    || x.entretienTitre.localeCompare(y.entretienTitre, 'fr')
    || x.pos - y.pos)
}

function ligneMarkdown(texte: string): string {
  return echapperMarkdown(texte.replace(/\s+/g, ' ').trim())
}

/** Document Markdown des commentaires affichés, dans l'ordre reçu. */
export function genererMarkdownCommentaires(
  commentaires: readonly CommentaireCorpus[],
  nomCorpus: string,
  maintenant = new Date(),
): string {
  const date = maintenant.toLocaleDateString('fr-FR')
  const heure = maintenant.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const lignes = [
    `# Commentaires du corpus "${ligneMarkdown(nomCorpus || 'Corpus')}"`,
    '',
    `*Exporté le ${date} à ${heure}*`,
    '',
    '---',
  ]
  for (const c of commentaires) {
    lignes.push(
      '',
      `## ${ligneMarkdown(c.entretienTitre)} - ${ligneMarkdown(c.auteur || 'Sans auteur')}`,
      '',
      ...c.texte.trim().split(/\r?\n/).map(echapperMarkdown),
      '',
      c.passage ? `> ${ligneMarkdown(c.passage)}` : '*Passage commenté supprimé du texte.*',
    )
  }
  return lignes.join('\n') + '\n'
}

export function nomFichierMarkdownCommentaires(nomCorpus: string, maintenant = new Date()): string {
  const nom = nomCorpus.replace(/[<>:"/\|?*\u0000-\u001f]/g, '_').trim() || 'Corpus'
  return `commentaires_${nom}_${maintenant.toISOString().slice(0, 10)}.md`
}
