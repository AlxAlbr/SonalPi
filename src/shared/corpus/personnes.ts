import type { CorpusFichier, EntretienFichier, Locuteur, Personne } from '../format'
import type { EntreeMatrice } from './requetes'
import type { ChoixRepriseLocuteur } from './rapprochementsPersonnes'

export interface VueLocuteurPersonne {
  entretienId: string
  entretienTitre: string
  locuteurId: string
  index: number
  nom: string
  interviewer: boolean
  personneRef: string | null
  valeursLoc: Record<string, string>
  pseudo?: string
  pseudoEtat?: 'confirme' | 'refuse'
  rapprochementsRefuses?: string[]
}

export interface VueNotePersonne {
  entretienId: string
  entretienTitre: string
  id: string
  categorieId: string
  titre: string
  date: string | null
  statut: 'prive' | 'public'
  corps: string
  locuteurIds: string[]
  rang: number
}

export interface InventairePersonnes {
  personnes: Personne[]
  locuteurs: VueLocuteurPersonne[]
  notes: VueNotePersonne[]
  indisponibles: { id: string; titre: string; raison: string }[]
}

export type CommandePersonnes =
  | { type: 'fusionner'; conserverId: string; absorberId: string; attendu: string; reprise?: { entretienId: string; locuteurId: string; sourceEntretienId: string; sourceLocuteurId: string; choix: ChoixRepriseLocuteur } }
  | { type: 'creerDefinition'; nom: string }
  | { type: 'refuser'; entretienId: string; locuteurId: string; sourceEntretienId: string; sourceLocuteurId: string }
  | { type: 'annulerRefus'; entretienId: string; locuteurId: string; cible: string }
  | { type: 'rapprocher'; entretienId: string; locuteurId: string; sourceEntretienId: string; sourceLocuteurId: string; attendu?: string; reprise?: ChoixRepriseLocuteur }
  | { type: 'creer'; entretienId: string; locuteurId: string; nom: string }
  | { type: 'lier'; entretienId: string; locuteurId: string; personneId: string | null }
  | { type: 'modifier'; personneId: string; nom: string }
  | { type: 'supprimer'; personneId: string }

/** Projette les identités sans transporter les transcriptions vers l'interface. */
export function inventorierPersonnes(corpus: CorpusFichier, entretiens: EntreeMatrice[]): InventairePersonnes {
  return {
    personnes: Object.values(corpus.personnes ?? {}).sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.id.localeCompare(b.id)),
    locuteurs: entretiens.flatMap((e) => e.data.locuteurs.map((l) => {
      if (!l.id) throw new Error('Les identifiants des locuteurs doivent être complétés avant l’inventaire.')
      return {
        entretienId: e.id, entretienTitre: e.titre, locuteurId: l.id,
        index: l.index, nom: l.nom, interviewer: l.interviewer === true,
        personneRef: l.personneRef ?? null, valeursLoc: { ...l.valeursLoc },
        pseudo: l.pseudo, pseudoEtat: l.pseudoEtat,
        rapprochementsRefuses: [...(l.rapprochementsRefuses ?? [])],
      }
    })),
    notes: entretiens.flatMap((e) => (e.data.notes ?? [])
      .filter((note) => note.locuteurIds?.length)
      .map((note) => ({
        entretienId: e.id,
        entretienTitre: e.titre,
        id: note.id,
        categorieId: note.categorieId,
        titre: note.titre,
        date: note.date,
        statut: note.statut,
        corps: note.corps,
        locuteurIds: [...(note.locuteurIds ?? [])],
        rang: note.rang,
      }))),
    indisponibles: [],
  }
}

function nomValide(nom: string): string {
  const valeur = nom.trim()
  if (!valeur) throw new Error('Le nom de la personne ne peut pas être vide.')
  return valeur
}

export function creerPersonne(corpus: CorpusFichier, id: string, nom: string): Personne {
  const valeur = nomValide(nom)
  corpus.personnes ??= {}
  if (!id || corpus.personnes[id]) throw new Error('Identifiant de personne déjà utilisé ou invalide.')
  const personne: Personne = { id, nom: valeur }
  corpus.personnes[id] = personne
  return personne
}

export function modifierPersonne(corpus: CorpusFichier, id: string, nom: string): void {
  const personne = corpus.personnes?.[id]
  if (!personne) throw new Error('Cette personne n’existe plus.')
  personne.nom = nomValide(nom)
}

export function trouverLocuteur(entretien: EntretienFichier, locuteurId: string): Locuteur {
  const locuteur = entretien.locuteurs.find((l) => l.id === locuteurId)
  if (!locuteur) throw new Error('Ce locuteur n’existe plus. Actualisez le répertoire.')
  return locuteur
}

/** Un lien ne renomme jamais le locuteur et ne modifie pas ses valeurs. */
export function lierLocuteur(corpus: CorpusFichier, entretien: EntretienFichier, locuteurId: string, personneId: string | null): void {
  const locuteur = trouverLocuteur(entretien, locuteurId)
  if (personneId !== null) {
    if (!corpus.personnes?.[personneId]) throw new Error('Cette personne n’existe plus.')
    if (entretien.locuteurs.some((l) => l.id !== locuteurId && l.personneRef === personneId)) {
      throw new Error('Cette personne a déjà un locuteur dans cet entretien. Corrigez les locuteurs avant de les rapprocher.')
    }
  }
  locuteur.personneRef = personneId
  if (personneId === null) locuteur.personneDeliee = true
  else delete locuteur.personneDeliee
}

/** Regroupe les identités sans propager de données locales. */
export function fusionnerPersonnes(corpus: CorpusFichier, entretiens: EntreeMatrice[], conserverId: string, absorberId: string): void {
  const conservee = corpus.personnes[conserverId]
  const absorbee = corpus.personnes[absorberId]
  if (!conservee || !absorbee || conserverId === absorberId) throw new Error('Choisissez deux personnes distinctes existantes.')
  const appartient = (ref: string | null) => ref === conserverId || ref === absorberId
  for (const e of entretiens) {
    if (e.data.locuteurs.filter(l => appartient(l.personneRef)).length > 1) {
      throw new Error(`Réunion impossible : plusieurs locuteurs seraient associés à la même personne dans « ${e.titre} ». Modifiez leurs associations avant de les réunir.`)
    }
  }
  const membres = new Set(entretiens.flatMap(e => e.data.locuteurs.filter(l => appartient(l.personneRef)).map(l => `locuteur:${l.id}`)))
  for (const e of entretiens) for (const l of e.data.locuteurs) {
    if (appartient(l.personneRef)) l.personneRef = conserverId
    if (l.rapprochementsRefuses) {
      l.rapprochementsRefuses = [...new Set(l.rapprochementsRefuses
        .map(r => r === `personne:${absorberId}` ? `personne:${conserverId}` : r)
        .filter(r => l.personneRef !== conserverId || (r !== `personne:${conserverId}` && !membres.has(r))))]
    }
  }
  delete corpus.personnes[absorberId]
}

/** Une lecture incomplète ne permet pas de prouver qu'une personne est vide. */
export function supprimerPersonneVide(corpus: CorpusFichier, inventaire: InventairePersonnes, id: string): void {
  if (inventaire.indisponibles.length) throw new Error('Suppression impossible : certains entretiens sont illisibles.')
  if (!corpus.personnes?.[id]) throw new Error('Cette personne n’existe plus.')
  if (inventaire.locuteurs.some((l) => l.personneRef === id)) throw new Error('Déliez les locuteurs avant de supprimer cette personne.')
  delete corpus.personnes[id]
}
