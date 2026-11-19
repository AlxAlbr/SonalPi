import type { Editor } from '@tiptap/core'
import { ref, type Ref } from 'vue'
import { attribuerSelectionTr } from '../../editor/attribution'
import { snapBornes } from '../../editor/snap'
import {
  ajouterLocuteur,
  nomDeLocuteur,
} from '../../../shared/entretien/locuteurs'
import type { Inverse } from '../../../shared/entretien/journal'
import { participationParId, renommerParticipation as renommerNomParticipation, supprimerParticipation } from '../../../shared/entretien/participations'
import type { ReferenceParticipation } from '../../../shared/locuteurs'
import type { ParticipationLocuteur } from '../../../shared/format'
import type { VueParticipationLocuteur } from '../../../shared/corpus/personnes'
import {
  type ChoixRepriseLocuteur,
  natureNomLocuteur,
  peutCreerLocuteurAuNommage,
  refuserRapprochementLocuteurs,
  reprendreDonneesParticipation,
  suggestionsLocuteurs,
} from "../../../shared/corpus/rapprochementsLocuteurs"

interface EffetsLocuteurs {
  enregistrerAction: (libelle: string, inverse: Inverse) => unknown
  rafraichirJournal: () => void
  rafraichirProjections: () => void
  rafraichirGouttiere: () => void
  planifierSauvegarde: () => void
  viderSauvegarde: () => Promise<void>
  retirerLocuteurDesNotes: (id: string) => void
}

type RapprochementNommage = {
  entretienId: string
  locuteurId: string
  nom: string
  personneRef: string | null
  lienActuel: string
  cible: ParticipationLocuteur
  sources: VueParticipationLocuteur[]
  candidats: VueParticipationLocuteur[]
}

/** Gère les gestes sur les locuteurs et leur rapprochement avec les personnes. */
export function useLocuteursEntretien(deps: {
  locuteurs: Ref<ParticipationLocuteur[]>
  ouvertId: Readonly<Ref<string | null>>
  lireEditeur: () => Editor | null
  lectureSeule?: () => boolean
  renommageGlobalPossible?: () => boolean
  demanderRenommageGlobal?: (reference: ReferenceParticipation, nom: string) => void
  effets: EffetsLocuteurs
}) {
  const selectionVide = ref(true)
  const messagePersonnes = ref('')
  const rapprochementNommage = ref<RapprochementNommage | null>(null)
  const rapprochementOccupe = ref(false)
  const locuteurASupprimer = ref<{ reference: ReferenceParticipation; nom: string; nbBlocs: number } | null>(null)
  let nommagesPersonnes = Promise.resolve()

  function mettreAJourSelection(vide: boolean) {
    selectionVide.value = vide
  }

  function reinitialiser() {
    selectionVide.value = true
    messagePersonnes.value = ''
    rapprochementNommage.value = null
    locuteurASupprimer.value = null
  }

  function participationCourante(reference: ReferenceParticipation) {
    if (reference.entretienId !== deps.ouvertId.value || deps.lectureSeule?.()) return undefined
    return participationParId(deps.locuteurs.value, reference.participationId)
  }

  function attribuerLoc(loc: number | null) {
    const editeur = deps.lireEditeur()
    if (!editeur) return
    const libelle = `Locuteur attribué : ${nomDeLocuteur(deps.locuteurs.value, loc) || 'aucun'}`
    if (editeur.state.selection.empty) {
      const { $from } = editeur.state.selection
      const pos = $from.before($from.depth)
      const ancien = ($from.parent.attrs.loc ?? null) as number | null
      editeur.chain().focus().updateAttributes('paragraph', { loc }).run()
      if (ancien !== loc) {
        deps.effets.enregistrerAction(libelle, {
          type: 'restaurerLocs',
          blocs: [{ pos, loc: ancien }],
        })
      }
    } else {
      const { from, to } = snapBornes(
        editeur.state,
        editeur.state.selection.from,
        editeur.state.selection.to,
      )
      const resultat = attribuerSelectionTr(editeur.state, from, to, loc)
      if (resultat) {
        editeur.view.dispatch(resultat.tr)
        editeur.view.focus()
        const changements = resultat.blocs.filter((bloc) => bloc.ancien !== loc)
        if (changements.length) {
          deps.effets.enregistrerAction(libelle, {
            type: 'restaurerLocs',
            blocs: changements.map((bloc) => ({ pos: bloc.pos, loc: bloc.ancien })),
          })
        }
        deps.effets.rafraichirProjections()
      }
    }
    deps.effets.rafraichirJournal()
    deps.effets.planifierSauvegarde()
  }

  function reporterRapprochement() {
    if (!rapprochementOccupe.value) rapprochementNommage.value = null
  }

  async function deciderRapprochement(
    sourceId: string,
    sourceEntretienId: string,
    decision: 'lier' | 'refuser' | 'refuserTous',
    reprise?: ChoixRepriseLocuteur,
  ) {
    const demande = rapprochementNommage.value
    if (!demande || rapprochementOccupe.value) return
    const courant = () =>
      deps.ouvertId.value === demande.entretienId
        ? deps.locuteurs.value.find(
            (locuteur) =>
              locuteur.id === demande.locuteurId &&
              locuteur.nom === demande.nom &&
              locuteur.locuteurRef === demande.personneRef,
          )
        : undefined
    if (!courant()) {
      rapprochementNommage.value = null
      return
    }
    const cibleInitiale = courant()!
    const signatureDonnees = (
      locuteur: Pick<ParticipationLocuteur, 'pseudo' | 'interviewer' | 'valeursLoc'>,
    ) => JSON.stringify([locuteur.pseudo, locuteur.interviewer, locuteur.valeursLoc])
    rapprochementOccupe.value = true
    try {
      await deps.effets.viderSauvegarde()
      const inventaire = await window.sonal.corpus.personnesInventaire()
      const source = inventaire.participations.find(
        (locuteur) =>
          locuteur.participationId === sourceId && locuteur.entretienId === sourceEntretienId,
      )
      if (!source || courant() !== cibleInitiale) {
        throw new Error('Le locuteur a changé. Relancez le rapprochement depuis Personnes.')
      }
      const sourceApercu = demande.sources.find(
        (locuteur) =>
          locuteur.participationId === sourceId && locuteur.entretienId === sourceEntretienId,
      )
      if (
        decision === 'lier' &&
        (!sourceApercu || source.locuteurRef !== sourceApercu.locuteurRef)
      ) {
        throw new Error('La personne sélectionnée a changé. Rouvrez le dialogue pour vérifier l’association.')
      }
      if (reprise && (!sourceApercu || signatureDonnees(source) !== signatureDonnees(sourceApercu))) {
        throw new Error('Les données source ont changé. Rouvrez le dialogue pour vérifier la reprise.')
      }
      if (decision === 'refuser' || decision === 'refuserTous') {
        const refuses =
          decision === 'refuserTous'
            ? demande.candidats.map((candidat) => {
                const frais = inventaire.participations.find(
                  (locuteur) =>
                    locuteur.participationId === candidat.participationId &&
                    locuteur.entretienId === candidat.entretienId,
                )
                if (
                  !frais ||
                  frais.locuteurRef !== candidat.locuteurRef ||
                  frais.nom !== candidat.nom
                ) {
                  throw new Error('Les propositions ont changé. Rouvrez le dialogue avant de les écarter.')
                }
                return frais
              })
            : [source]
        const cible = courant()!
        for (const refuse of refuses) {
          refuserRapprochementLocuteurs(cible, { entretienId: refuse.entretienId, participation: { ...refuse, id: refuse.participationId } })
        }
        deps.effets.planifierSauvegarde()
        if (peutCreerLocuteurAuNommage(cible)) {
          const id = await window.sonal.corpus.personnesCommander({
            type: 'creerDefinition',
            nom: cible.nom,
          })
          if (courant() !== cible || !peutCreerLocuteurAuNommage(cible) || !id) {
            throw new Error('La personne créée est conservée. Le locuteur a changé : reprenez depuis Personnes.')
          }
          cible.locuteurRef = id
        }
        messagePersonnes.value =
          natureNomLocuteur(demande.nom) === 'role'
            ? 'Propositions écartées. Vous pouvez choisir un nom ou pseudonyme spécifique pour distinguer ces locuteurs.'
            : 'Propositions écartées. Vous pourrez revenir sur ce choix dans Personnes.'
      } else {
        let id = source.locuteurRef
        if (!id) {
          id = await window.sonal.corpus.personnesCommander({
            type: 'creer',
            entretienId: source.entretienId,
            participationId: source.participationId,
            nom: source.nom,
          })
        }
        const cible = courant()
        if (!cible || cible !== cibleInitiale || !id) {
          throw new Error('La personne source est conservée. Le locuteur cible a changé : reprenez depuis Personnes.')
        }
        if (deps.locuteurs.value.some((locuteur) => locuteur.id !== cible.id && locuteur.locuteurRef === id)) {
          throw new Error('Cette personne est déjà représentée dans cet entretien.')
        }
        if (
          reprise &&
          (cible !== cibleInitiale || signatureDonnees(cible) !== signatureDonnees(demande.cible))
        ) {
          throw new Error('Les données locales ont changé. La personne source est conservée ; rouvrez le dialogue pour vérifier la reprise.')
        }
        if (reprise) reprendreDonneesParticipation(cible, source, reprise)
        cible.locuteurRef = id
        delete cible.associationRetiree
        messagePersonnes.value = reprise
          ? 'Liaison appliquée avec reprise des informations disponibles.'
          : `Locuteur lié à « ${inventaire.locuteurs.find((personne) => personne.id === id)?.nom ?? source.nom} ». Les données locales sont conservées.`
      }
      if (
        deps.ouvertId.value === demande.entretienId &&
        deps.locuteurs.value.some(
          (locuteur) => locuteur.id === demande.locuteurId && locuteur.nom === demande.nom,
        )
      ) {
        deps.effets.planifierSauvegarde()
        await deps.effets.viderSauvegarde()
      }
      rapprochementNommage.value = null
    } catch (erreur) {
      messagePersonnes.value = `Rapprochement non terminé : ${erreur instanceof Error ? erreur.message : String(erreur)}`
    } finally {
      rapprochementOccupe.value = false
    }
  }

  function proposerIdentite(index: number, nom: string) {
    const idEntretien = deps.ouvertId.value
    const locuteur = deps.locuteurs.value.find((candidat) => candidat.index === index)
    if (!idEntretien || !locuteur?.id || deps.lectureSeule?.() || natureNomLocuteur(nom) === 'ignore') return
    const idLocuteur = locuteur.id
    nommagesPersonnes = nommagesPersonnes.then(async () => {
      const courant = () =>
        deps.ouvertId.value === idEntretien
          ? deps.locuteurs.value.find(
              (candidat) => candidat.id === idLocuteur && candidat.nom === nom,
            )
          : undefined
      if (!courant()) return
      messagePersonnes.value = ''
      try {
        await deps.effets.viderSauvegarde()
        const inventaire = await window.sonal.corpus.personnesInventaire()
        if (!courant()) return
        const personneRef = courant()!.locuteurRef
        const lienActuel = personneRef
          ? inventaire.locuteurs.find((personne) => personne.id === personneRef)?.nom ??
            'Personne absente'
          : ''
        const candidats = suggestionsLocuteurs(
          { entretienId: idEntretien, participation: courant()! },
          inventaire.participations.map((source) => ({
            entretienId: source.entretienId,
            participation: { ...source, id: source.participationId },
          })),
        )
        if (candidats.length) {
          rapprochementNommage.value = {
            entretienId: idEntretien,
            locuteurId: idLocuteur,
            nom,
            personneRef,
            lienActuel,
            cible: JSON.parse(JSON.stringify(courant()!)),
            sources: inventaire.participations,
            candidats: inventaire.participations.filter((source) =>
              candidats.some(
                (candidat) =>
                  candidat.entretienId === source.entretienId &&
                  candidat.participation.id === source.participationId,
              ),
            ),
          }
          messagePersonnes.value = `Un rapprochement est proposé pour « ${nom} ». Il reste aussi disponible dans Personnes.`
          return
        }
        if (!peutCreerLocuteurAuNommage(courant()!)) return
        if (inventaire.indisponibles.length) {
          messagePersonnes.value = 'Création de personne différée : certains entretiens sont indisponibles. Vérifiez le répertoire Personnes.'
          return
        }
        const personneId = await window.sonal.corpus.personnesCommander({
          type: 'creerDefinition',
          nom,
        })
        const cible = courant()
        if (!cible || !peutCreerLocuteurAuNommage(cible) || !personneId) {
          if (deps.ouvertId.value === idEntretien) {
            messagePersonnes.value = 'Une personne a été créée, mais le locuteur a changé. Vérifiez le répertoire Personnes.'
          }
          return
        }
        cible.locuteurRef = personneId
        deps.effets.planifierSauvegarde()
        await deps.effets.viderSauvegarde()
        if (deps.ouvertId.value === idEntretien) {
          messagePersonnes.value = `Personne « ${nom} » créée au niveau du corpus.`
        }
      } catch (erreur) {
        if (deps.ouvertId.value === idEntretien) {
          messagePersonnes.value = `Identification non terminée : ${erreur instanceof Error ? erreur.message : String(erreur)}. Vérifiez le répertoire Personnes avant de réessayer.`
        }
      }
    })
  }

  function renommerParticipation(reference: ReferenceParticipation, event: Event) {
    const cible = participationCourante(reference)
    if (!cible) return
    const champ = event.target as HTMLInputElement
    const nouveau = champ.value
    const ancien = cible.nom
    if (cible.locuteurRef && deps.renommageGlobalPossible?.() && deps.demanderRenommageGlobal && ancien !== nouveau) {
      champ.value = ancien
      deps.demanderRenommageGlobal(reference, nouveau)
      return
    }
    renommerNomParticipation(deps.locuteurs.value, reference.participationId, nouveau)
    if (ancien !== nouveau) {
      deps.effets.enregistrerAction(
        `Locuteur renommé : ${ancien} → ${nouveau}`,
        { type: 'renommerParticipation', reference: { ...reference }, nom: ancien },
      )
      deps.effets.rafraichirJournal()
    }
    deps.effets.rafraichirGouttiere()
    deps.effets.planifierSauvegarde()
    if (ancien !== nouveau) proposerIdentite(cible.index, nouveau)
  }

  function nouveauLocuteur() {
    if (!deps.ouvertId.value || deps.lectureSeule?.()) return
    ajouterLocuteur(deps.locuteurs.value, 'Nouveau locuteur')
    deps.effets.rafraichirGouttiere()
    deps.effets.planifierSauvegarde()
  }

  function setInterviewer(reference: ReferenceParticipation, actif: boolean) {
    const locuteur = participationCourante(reference)
    if (!locuteur || (locuteur.interviewer ?? false) === actif) return
    locuteur.interviewer = actif
    deps.effets.rafraichirGouttiere()
    deps.effets.planifierSauvegarde()
  }

  function setPseudoLoc(reference: ReferenceParticipation, pseudo: string) {
    const locuteur = participationCourante(reference)
    if (!locuteur) return
    const pseudoNormalise = pseudo.trim()
    if (pseudoNormalise) locuteur.pseudo = pseudoNormalise
    else {
      delete locuteur.pseudo
      delete locuteur.pseudoEtat
    }
    deps.effets.rafraichirGouttiere()
    deps.effets.planifierSauvegarde()
  }

  function choisirCouleurLoc(reference: ReferenceParticipation, couleur: string) {
    const locuteur = participationCourante(reference)
    if (!locuteur) return
    if (couleur) locuteur.couleur = couleur
    else delete locuteur.couleur
    deps.effets.rafraichirGouttiere()
    deps.effets.planifierSauvegarde()
  }

  function supprimerParticipationCourante(reference: ReferenceParticipation) {
    const editeur = deps.lireEditeur(), cible = participationCourante(reference)
    if (!editeur || !cible || deps.locuteurs.value.filter((p) => p.index === cible.index).length !== 1) return
    const transaction = editeur.state.tr
    editeur.state.doc.forEach((node, offset) => {
      if (node.type.name === 'paragraph' && node.attrs.loc === cible.index) {
        transaction.setNodeMarkup(offset, undefined, { ...node.attrs, loc: null })
      }
    })
    if (transaction.steps.length) editeur.view.dispatch(transaction)
    supprimerParticipation(deps.locuteurs.value, reference.participationId)
    deps.effets.retirerLocuteurDesNotes(reference.participationId)
    locuteurASupprimer.value = null
    deps.effets.rafraichirProjections()
    deps.effets.rafraichirGouttiere()
    deps.effets.planifierSauvegarde()
  }

  function bilanSuppression(reference: ReferenceParticipation) {
    const editeur = deps.lireEditeur(), cible = participationCourante(reference)
    if (!editeur || !cible) return undefined
    let nbBlocs = 0
    editeur.state.doc.forEach((node) => {
      if (node.type.name === 'paragraph' && node.attrs.loc === cible.index) nbBlocs++
    })
    return { reference: { ...reference }, nom: cible.nom, nbBlocs }
  }

  function demanderSuppressionLocuteur(reference: ReferenceParticipation) {
    const bilan = bilanSuppression(reference)
    if (!bilan) return
    if (bilan.nbBlocs === 0) supprimerParticipationCourante(reference)
    else locuteurASupprimer.value = bilan
  }

  function confirmerSuppressionLocuteur() {
    const demande = locuteurASupprimer.value
    if (!demande) return
    const bilan = bilanSuppression(demande.reference)
    if (!bilan) { locuteurASupprimer.value = null; return }
    if (bilan.nom !== demande.nom || bilan.nbBlocs !== demande.nbBlocs) {
      locuteurASupprimer.value = bilan
      messagePersonnes.value = 'Les interventions ont changé. Vérifiez le bilan avant de confirmer à nouveau la suppression.'
      return
    }
    supprimerParticipationCourante(demande.reference)
  }

  return {
    selectionVide,
    messagePersonnes,
    rapprochementNommage,
    rapprochementOccupe,
    locuteurASupprimer,
    mettreAJourSelection,
    reinitialiser,
    attendreNommages: () => nommagesPersonnes,
    attribuerLoc,
    renommerParticipation,
    reporterRapprochement,
    deciderRapprochement,
    nouveauLocuteur,
    setInterviewer,
    setPseudoLoc,
    choisirCouleurLoc,
    demanderSuppressionLocuteur,
    confirmerSuppressionLocuteur,
  }
}
