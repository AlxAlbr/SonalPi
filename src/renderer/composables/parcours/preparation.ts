import type { Ref } from 'vue'
import type { EntretienRef, Note } from '../../../shared/format'
import type { TableauBord } from '../../../shared/corpus/tableaubord'
import type { ResumeDocumentCadre } from '../../../shared/docsCadre'
import {
  entretienPreparationPresent,
  guideDemoPresent,
  notePreparationPresente,
  problematiqueRenseignee,
} from './predicatsPreparation'
import type { DefinitionParcours, EtapePasAPas } from './types'

export interface DepsParcoursPreparation {
  vue: Ref<'accueil' | 'corpus' | 'entretien'>
  ongletDroite: Ref<'maison' | 'themes' | 'locuteurs' | 'donnees' | 'journal' | 'anon' | 'notes'>
  ouvertId: Ref<string | null>
  membership: Ref<Record<string, EntretienRef>>
  notes: Ref<Note[]>
  tableaubord: Ref<TableauBord | null>
  tableauBordOuverts: Ref<boolean>
  docsCadreOuverts: Ref<boolean>
  documentsProjet: Ref<ResumeDocumentCadre[]>
  idEntretien: () => string | null
}

/** Définit les quatre gestes du parcours de préparation à partir du modèle réactif. */
export function creerParcoursPreparation(deps: DepsParcoursPreparation): DefinitionParcours {
  const etapes: EtapePasAPas[] = [
    {
      id: 'organiser-suivi',
      titre: 'Organiser le suivi',
      cible: () => {
        if (!deps.tableauBordOuverts.value) return '[data-tour="ouvrir-tableau-bord"]'
        if (!document.querySelector('[data-tour="formulaire-cellule-tableau"]')) {
          return '[data-tour="cellule-problematique"]'
        }
        return '[data-tour="note-cellule-tableau"]'
      },
      panneau: true,
      panneauAvecTrou: true,
      panneauSur: ['tableau-bord'],
      fait: () => problematiqueRenseignee(deps.tableaubord.value),
      texte: () => {
        if (!deps.tableauBordOuverts.value) return 'Ouvrez le Tableau de bord depuis la barre d’outils.'
        if (!document.querySelector('[data-tour="formulaire-cellule-tableau"]')) {
          return 'Ouvrez la cellule traversante « Problématique ».'
        }
        return 'Saisissez une courte problématique, puis cliquez sur « Appliquer ».'
      },
      fini: () => 'La problématique est maintenant visible dans le suivi du projet.',
    },
    {
      id: 'documents-cadre',
      titre: 'Ajouter les documents du projet',
      cible: () => deps.docsCadreOuverts.value
        ? '[data-tour="ajouter-document-cadre"]'
        : '[data-tour="ouvrir-docs-cadre"]',
      panneau: true,
      panneauAvecTrou: true,
      panneauSur: ['docs-cadre'],
      fait: () => guideDemoPresent(deps.documentsProjet.value),
      texte: () => deps.docsCadreOuverts.value
        ? 'Ajoutez docs/Guide-entretien-demo.txt depuis les sources de démonstration et vérifiez sa présence dans « Vos Documents ».'
        : 'Ouvrez « Docs cadre projet » depuis la barre d’outils.',
      explication: () => 'Ce document devient un document du projet ; les documents exemples restent une catégorie distincte.',
      fini: () => 'Le guide d’entretien fait maintenant partie des documents du projet.',
    },
    {
      id: 'entretien-preparatoire',
      titre: 'Créer l’entretien préparatoire',
      cible: () => {
        if (!document.querySelector('.modale-ajout')) return '[data-tour="ajouter-entretien"]'
        if (!document.querySelector('[data-tour="titre-entretien-vide"]')) return '[data-tour="valider"]'
        return '[data-tour="titre-entretien-vide"]'
      },
      fait: () => entretienPreparationPresent(deps.idEntretien(), deps.membership.value),
      texte: () => document.querySelector('.modale-ajout')
        ? 'Laissez les deux zones de fichiers vides, nommez l’entretien « Entretien préparatoire », puis validez.'
        : 'Cliquez sur « + Ajouter un entretien » pour préparer un entretien sans audio ni transcription.',
      explication: () => 'L’audio et la transcription pourront être assignés plus tard depuis les métadonnées.',
      fini: () => 'L’entretien est prêt à recevoir vos questions et hypothèses avant la collecte.',
    },
    {
      id: 'note-preparation',
      titre: 'Écrire une note de préparation',
      requiere: 'entretien-preparatoire',
      cible: () => {
        const id = deps.idEntretien()
        if (deps.vue.value !== 'entretien') return id ? `[data-entretien-id="${id}"] .crayon` : null
        const modale = document.querySelector('.modale-note')
        if (!modale) return deps.ongletDroite.value === 'notes'
          ? '[data-tour="creer-note"]'
          : '[data-tour="onglet-notes"]'
        const titre = (modale.querySelector('.champ-titre-note input') as HTMLInputElement | null)?.value.trim()
        if (titre !== 'Avant l’entretien') return '.modale-note .champ-titre-note input'
        const corps = modale.querySelector('.zone-corps-note')?.textContent?.trim()
        return corps ? '.modale-note-pied .principal' : '.modale-note .zone-corps-note'
      },
      panneau: true,
      panneauAvecTrou: true,
      panneauSur: ['entretien'],
      fait: () => deps.ouvertId.value === deps.idEntretien() && notePreparationPresente(deps.notes.value),
      texte: () => {
        if (deps.vue.value !== 'entretien') return 'Ouvrez l’entretien préparatoire avec le crayon de sa carte.'
        if (deps.ongletDroite.value !== 'notes') return 'Ouvrez l’onglet Notes.'
        if (!document.querySelector('.modale-note')) return 'Créez une note avec « + Note ».'
        return 'Intitulez-la « Avant l’entretien », ajoutez une question ou une hypothèse, puis validez.'
      },
      finiEnEntretien: true,
      fini: () => 'Votre préparation est consignée. Vous pourrez assigner l’audio et le SRT après la collecte.',
    },
  ]

  return {
    id: 'preparation',
    titre: 'Préparer son terrain',
    resume: 'Tableau de bord, documents cadre, entretien planifié et note préparatoire.',
    disponible: () => true,
    etapes,
  }
}
