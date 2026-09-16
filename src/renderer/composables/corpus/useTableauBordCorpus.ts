import { ref, toRaw, type Ref } from 'vue'
import type { CorpusFichier } from '../../../shared/format'
import {
  LIGNE_TRAVERSANTE,
  normaliserTableauBord,
  tableauBordParDefaut,
  type CommandeTableauBord,
  type ContenuCellule,
  type TableauBord,
} from '../../../shared/corpus/tableaubord'

const nouvelId = (prefixe: string): string => `${prefixe}-${globalThis.crypto.randomUUID()}`

/** Fenêtre « Tableau de bord » : orchestration des commandes ciblées du tableau
 *  partagé du corpus. Le composant garde la propriété fonctionnelle ; ici,
 *  commande → mise à jour du modèle → sauvegarde via IPC → le rendu suit. */
export function useTableauBordCorpus(deps: { tableaubord: Ref<TableauBord | null> }) {
  const tableauBordOuverts = ref(false)
  const etatSauvegardeTableau = ref<'à jour' | 'enregistrement…' | 'conflit'>('à jour')
  const messageTableau = ref<string | null>(null)

  function lis(corpus: CorpusFichier): TableauBord {
    return normaliserTableauBord(corpus.tableaubord) ?? tableauBordParDefaut()
  }

  async function commander(commande: CommandeTableauBord): Promise<void> {
    messageTableau.value = null
    etatSauvegardeTableau.value = 'enregistrement…'
    try {
      const corpus = await window.sonal.corpus.tableaubordCommander(toRaw(commande))
      etatSauvegardeTableau.value = 'à jour'
      deps.tableaubord.value = lis(corpus)
    } catch (erreur) {
      etatSauvegardeTableau.value = 'conflit'
      messageTableau.value = erreur instanceof Error ? erreur.message : String(erreur)
      try {
        const corpus = await window.sonal.corpus.ouvrir()
        deps.tableaubord.value = lis(corpus)
      } catch {
        // L'erreur initiale reste celle affichée.
      }
      throw erreur
    }
  }

  async function ajouterColonne(nom: string, traversante = false): Promise<void> {
    await commander({ type: 'ajouter-colonne', id: nouvelId('col'), nom, ...(traversante ? { traversante: true } : {}) })
  }
  async function renommerColonne(colonneId: string, attendu: string, nom: string): Promise<void> {
    await commander({ type: 'renommer-colonne', colonneId, attendu, nom })
  }
  async function supprimerColonne(colonneId: string, attendu: string): Promise<void> {
    await commander({ type: 'supprimer-colonne', colonneId, attendu })
  }
  async function deplacerColonne(colonneId: string, avantId: string | null): Promise<void> {
    const t = deps.tableaubord.value
    if (!t) return
    await commander({
      type: 'deplacer-colonne', colonneId,
      attenduOrdre: t.colonnes.map((c) => c.id), avantId,
    })
  }
  async function ajouterBadge(nom: string, couleur: string): Promise<void> {
    await commander({ type: 'ajouter-badge', id: nouvelId('badge'), nom, couleur })
  }
  async function supprimerBadge(badgeId: string, attendu: string): Promise<void> {
    await commander({ type: 'supprimer-badge', badgeId, attendu })
  }
  async function ajouterLigne(nom: string): Promise<void> {
    await commander({ type: 'ajouter-ligne', id: nouvelId('ent'), nom })
  }
  async function renommerLigne(ligneId: string, attendu: string, nom: string): Promise<void> {
    await commander({ type: 'renommer-ligne', ligneId, attendu, nom })
  }
  async function supprimerLigne(ligneId: string, attendu: string): Promise<void> {
    await commander({ type: 'supprimer-ligne', ligneId, attendu })
  }
  async function deplacerLigne(ligneId: string, avantId: string | null): Promise<void> {
    const t = deps.tableaubord.value
    if (!t) return
    await commander({
      type: 'deplacer-ligne', ligneId,
      attenduOrdre: t.lignes.map((l) => l.id), avantId,
    })
  }
  async function poserCellule(
    ligneId: string,
    colonneId: string,
    contenu: ContenuCellule,
  ): Promise<void> {
    const t = deps.tableaubord.value
    if (!t) return
    // Une colonne traversante n'a qu'une rangée : la garde lit la même case.
    const colonne = t.colonnes.find((c) => c.id === colonneId)
    const cle = colonne?.traversante ? LIGNE_TRAVERSANTE : ligneId
    const actuelle = t.cellules[cle]?.[colonneId]
    await commander({
      type: 'poser-cellule', ligneId: cle, colonneId,
      // Copie brute : l'objet du modèle est un proxy réactif, que l'IPC ne sait pas cloner.
      attendu: actuelle ? { ...actuelle } : null, contenu,
    })
  }

  async function afficherTableauBord(): Promise<void> {
    tableauBordOuverts.value = true
  }
  function fermerTableauBord(): void {
    tableauBordOuverts.value = false
  }

  return {
    tableauBordOuverts,
    etatSauvegardeTableau,
    messageTableau,
    commander,
    ajouterColonne,
    renommerColonne,
    supprimerColonne,
    deplacerColonne,
    ajouterBadge,
    supprimerBadge,
    ajouterLigne,
    renommerLigne,
    supprimerLigne,
    deplacerLigne,
    poserCellule,
    afficherTableauBord,
    fermerTableauBord,
  }
}
