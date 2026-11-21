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
import type { InventaireIdentitesLocuteurs, VueParticipationLocuteur } from '../../../shared/corpus/inventaireLocuteurs'
import type { DemandeIdentificationLocuteur, DemandeRapprochementNommage, ChoixRepriseParticipation } from '../../../shared/corpus/contratsLocuteurs'
import {
  natureNomLocuteur,
  peutCreerLocuteurAuNommage,
  refuserRapprochementLocuteurs,
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
  locuteurRef: string | null
  attendu: string
  cible: ParticipationLocuteur
  sources: VueParticipationLocuteur[]
  candidats: VueParticipationLocuteur[]
}

/** Gère l'attribution, le nommage et les choix de rapprochement des locuteurs. */
export function useLocuteursEntretien(deps: {
  locuteurs: Ref<ParticipationLocuteur[]>
  ouvertId: Readonly<Ref<string | null>>
  lireEditeur: () => Editor | null
  lectureSeule?: () => boolean
  identificationPossible?: () => boolean
  identifier?: (reference: ReferenceParticipation, nom: string, regulariser?: DemandeIdentificationLocuteur['regulariser']) => Promise<void>
  rapprocher?: (demande: DemandeRapprochementNommage, inventaire: InventaireIdentitesLocuteurs) => Promise<void>
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
  let generation = 0
  let revisionPropositions = 0

  function mettreAJourSelection(vide: boolean) {
    selectionVide.value = vide
  }

  function reinitialiser() {
    generation++
    nommagesPersonnes = Promise.resolve()
    rapprochementOccupe.value = false
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
    if (!deps.ouvertId.value || deps.lectureSeule?.()) return
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
    if (rapprochementOccupe.value) return
    revisionPropositions++
    rapprochementNommage.value = null
  }

  async function deciderRapprochement(
    sourceId: string,
    sourceEntretienId: string,
    decision: 'lier' | 'refuser' | 'refuserTous',
    reprise?: ChoixRepriseParticipation,
  ) {
    const demande = rapprochementNommage.value
    if (!demande || rapprochementOccupe.value || deps.lectureSeule?.()) return
    const jeton = generation
    const courant = () =>
      generation === jeton && deps.ouvertId.value === demande.entretienId
        ? deps.locuteurs.value.find(
            (locuteur) =>
              locuteur.id === demande.locuteurId &&
              locuteur.nom === demande.nom &&
              locuteur.locuteurRef === demande.locuteurRef,
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
      const inventaire = await window.sonal.corpus.inventaireLocuteursDepuisEntretien({ entretienId: demande.entretienId, participationId: demande.locuteurId })
      if (inventaire.indisponibles.length || JSON.stringify(inventaire) !== demande.attendu) throw new Error('Les propositions ou leurs données ont changé. Rouvrez le dialogue avant de confirmer.')
      const source = inventaire.participations.find(
        (locuteur) =>
          locuteur.participationId === sourceId && locuteur.entretienId === sourceEntretienId,
      )
      if (!source || courant() !== cibleInitiale) {
        throw new Error('Le locuteur a changé. Relancez le rapprochement depuis les locuteurs.')
      }
      const sourceApercu = demande.sources.find(
        (locuteur) =>
          locuteur.participationId === sourceId && locuteur.entretienId === sourceEntretienId,
      )
      if (
        decision === 'lier' &&
        (!sourceApercu || source.locuteurRef !== sourceApercu.locuteurRef)
      ) {
        throw new Error('Le locuteur sélectionné a changé. Rouvrez le dialogue pour vérifier l’association.')
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
        messagePersonnes.value =
          natureNomLocuteur(demande.nom) === 'role'
            ? 'Propositions écartées. Vous pouvez choisir un nom ou pseudonyme spécifique pour distinguer ces locuteurs.'
            : 'Propositions écartées. Vous pourrez revenir sur ce choix dans les détails des locuteurs du corpus.'
      } else {
        if (!deps.rapprocher || !deps.identificationPossible?.()) throw new Error('Ce rapprochement n’est pas disponible dans cet entretien.')
        if (reprise && signatureDonnees(cibleInitiale) !== signatureDonnees(demande.cible)) throw new Error('Les données locales ont changé. Rouvrez le dialogue avant de confirmer leur reprise.')
        await deps.rapprocher({ entretienId: demande.entretienId, participationId: demande.locuteurId,
          source: { entretienId: source.entretienId, participationId: source.participationId },
          attendu: JSON.stringify(inventaire), ...(reprise ? { reprise } : {}) }, inventaire)
        if (generation !== jeton || deps.ouvertId.value !== demande.entretienId || !deps.locuteurs.value.includes(cibleInitiale)) return
        messagePersonnes.value = reprise
          ? 'Locuteurs réunis avec reprise des informations disponibles.'
          : 'Locuteurs réunis. Les noms et les données locales sont conservés.'
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
      if (generation === jeton) rapprochementNommage.value = null
    } catch (erreur) {
      if (generation === jeton && deps.ouvertId.value === demande.entretienId) messagePersonnes.value = `Rapprochement non terminé : ${erreur instanceof Error ? erreur.message : String(erreur)}`
    } finally {
      if (generation === jeton) rapprochementOccupe.value = false
    }
  }

  function proposerIdentite(reference: ReferenceParticipation, nom: string, regulariser?: DemandeIdentificationLocuteur['regulariser']) {
    const idEntretien = reference.entretienId, locuteur = participationCourante(reference)
    if (!locuteur || !nom.trim() || !deps.identificationPossible?.() || !deps.identifier || (!regulariser && !peutCreerLocuteurAuNommage(locuteur))) return
    const idLocuteur = locuteur.id, jeton = generation, proposition = revisionPropositions
    nommagesPersonnes = nommagesPersonnes.then(async () => {
      const courant = () =>
        generation === jeton && deps.ouvertId.value === idEntretien
          ? deps.locuteurs.value.find(
              (candidat) => candidat === locuteur && candidat.id === idLocuteur && candidat.nom === nom,
            )
          : undefined
      if (!courant() || (!regulariser && !peutCreerLocuteurAuNommage(courant()!))) return
      messagePersonnes.value = ''
      try {
        if (regulariser || !courant()!.locuteurRef) {
          await deps.identifier!({ entretienId: idEntretien, participationId: idLocuteur }, nom, ...(regulariser ? [regulariser] : []))
        }
        if (!courant()) return
        if (!courant()!.locuteurRef) throw new Error('L’enregistrement du locuteur n’a pas pu être vérifié.')
        messagePersonnes.value = `Locuteur « ${nom} » créé au niveau du corpus.`
        let inventaire: InventaireIdentitesLocuteurs
        try { inventaire = await window.sonal.corpus.inventaireLocuteursDepuisEntretien({ entretienId: idEntretien, participationId: idLocuteur }) }
        catch (e) {
          if (courant() && proposition === revisionPropositions) messagePersonnes.value += ` Les rapprochements ne peuvent pas être vérifiés pour le moment. ${e instanceof Error ? e.message : String(e)}`
          return
        }
        if (!courant() || proposition !== revisionPropositions) return
        if (inventaire.indisponibles.length) {
          messagePersonnes.value += ' Les propositions sont différées : certains entretiens sont indisponibles.'
          return
        }
        const locuteurRef = courant()!.locuteurRef
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
            locuteurRef,
            attendu: JSON.stringify(inventaire),
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
          messagePersonnes.value = `Un rapprochement est proposé pour « ${nom} ». Il reste aussi disponible dans les détails des locuteurs du corpus.`
          return
        }
      } catch (erreur) {
        if (courant()) {
          messagePersonnes.value = `Identification non terminée : ${erreur instanceof Error ? erreur.message : String(erreur)}`
        }
      }
    })
  }

  function regulariserLocuteur(reference: ReferenceParticipation) {
    const locuteur = participationCourante(reference)
    if (!locuteur) return
    proposerIdentite(reference, locuteur.nom, { locuteurRef: locuteur.locuteurRef, associationRetiree: !!locuteur.associationRetiree })
  }

  function renommerParticipation(reference: ReferenceParticipation, event: Event | string) {
    const cible = participationCourante(reference)
    if (!cible) return
    const champ = typeof event === 'string' ? null : event.target as HTMLInputElement
    const nouveau = typeof event === 'string' ? event : champ!.value
    const ancien = cible.nom
    if (!nouveau.trim()) {
      if (champ) champ.value = ancien
      messagePersonnes.value = 'Le nom ne peut pas être vide.'
      return
    }
    if (cible.locuteurRef && deps.renommageGlobalPossible?.() && deps.demanderRenommageGlobal && ancien !== nouveau) {
      if (champ) champ.value = ancien
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
    proposerIdentite(reference, nouveau)
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
    regulariserLocuteur,
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
