import type { VueNoteCorpus } from '../../shared/corpus/notes'
import { libelleRefCommentaire } from './sanitiser'

export interface OptionsMarkdownNotes {
  document: Document
  nomCategorie: (categorieId: string) => string
  maintenant?: Date
}

/** Échappe les caractères de mise en forme produits par le contenu utilisateur. */
export function echapperMarkdown(texte: string): string {
  return texte
    .replaceAll('\\', '\\\\')
    .replaceAll('`', '\\`')
    .replaceAll('*', '\\*')
    .replaceAll('_', '\\_')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
}

function texteMetadonnee(texte: string): string {
  return echapperMarkdown(texte.replace(/\s+/g, ' ').trim())
}

/** Convertit le HTML restreint d'une note en Markdown sans reprendre ses attributs. */
export function corpsNoteEnMarkdown(html: string, doc: Document): string {
  if (!html) return ''
  const conteneur = doc.createElement('div')
  conteneur.innerHTML = html

  function convertir(noeud: Node): string {
    return Array.from(noeud.childNodes).map((enfant) => {
      if (enfant.nodeType === 3) return echapperMarkdown(enfant.textContent ?? '')
      if (enfant.nodeType !== 1) return ''
      const element = enfant as Element
      const contenu = convertir(element)
      const balise = element.tagName.toLowerCase()
      if (balise === 'mark') return `**${contenu}**`
      if (balise === 'em') return `*${contenu}*`
      if (balise === 'br') return '\n'
      return contenu + (/^(?:div|p)$/i.test(element.tagName) ? '\n' : '')
    }).join('')
  }

  return convertir(conteneur).replace(/\r\n?/g, '\n').trim()
}

export function formaterTimecode(secondes: number): string {
  const total = Math.max(0, Math.floor(secondes))
  const heures = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const reste = total % 60
  return [heures, minutes, reste].map((valeur) => String(valeur).padStart(2, '0')).join(':')
}

function dateNote(note: VueNoteCorpus): string {
  return texteMetadonnee(note.date ?? (note.creeLe.slice(0, 10) || 'sans date'))
}

function liensNote(note: VueNoteCorpus): string {
  return note.liensCommentaires.map((lien) => {
    const libelle = libelleRefCommentaire(
      lien.auteur,
      lien.texte || 'commentaire sans texte',
    )
    const temps = lien.timecodeSecondes === null ? '' : ` (${formaterTimecode(lien.timecodeSecondes)})`
    return `[${texteMetadonnee(libelle)}]${temps}`
  }).join(', ')
}

/** Produit le document Markdown des notes visibles, dans leur ordre d'affichage. */
export function genererMarkdownNotes(
  notes: readonly VueNoteCorpus[],
  nomCorpus: string,
  options: OptionsMarkdownNotes,
): string {
  const maintenant = options.maintenant ?? new Date()
  const date = maintenant.toLocaleDateString('fr-FR')
  const heure = maintenant.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const lignes = [
    `# Notes du corpus "${texteMetadonnee(nomCorpus || 'Corpus')}"`,
    '',
    `*Exporté le ${date} à ${heure}*`,
    '',
    '---',
  ]

  for (const note of notes) {
    const categorie = texteMetadonnee(options.nomCategorie(note.categorieId) || note.categorieId)
    const titre = texteMetadonnee(note.titre || '(sans titre)')
    lignes.push(
      '',
      `## ${categorie} - ${titre}`,
      '',
      `**Entretien** : ${texteMetadonnee(note.entretienTitre)} |`,
      `**Date** : ${dateNote(note)} |`,
      `**Statut** : ${note.statut}`,
      '',
      corpsNoteEnMarkdown(note.corps, options.document),
    )
    const liens = liensNote(note)
    if (liens) lignes.push('', `Liens : ${liens}`)
    lignes.push('', '---')
  }

  return `${lignes.join('\n')}\n`
}

/** Construit un nom de téléchargement portable à partir du nom du corpus. */
export function nomFichierMarkdownNotes(nomCorpus: string, maintenant = new Date()): string {
  const nom = nomCorpus
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .trim() || 'Corpus'
  return `notes_${nom}_${maintenant.toISOString().slice(0, 10)}.md`
}
