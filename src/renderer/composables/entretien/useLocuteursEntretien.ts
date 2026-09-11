import type { Editor } from '@tiptap/core'
import { ref, type Ref } from 'vue'
import { attribuerSelectionTr } from '../../editor/attribution'
import { snapBornes } from '../../editor/snap'
import {
  ajouterLocuteur,
  nomDeLocuteur,
  renommerLocuteur,
  supprimerLocuteur,
} from '../../../shared/entretien/locuteurs'
import type { Inverse } from '../../../shared/entretien/journal'
import type { Locuteur } from '../../../shared/format'
import type { VueLocuteurPersonne } from '../../../shared/corpus/personnes'
import {
  type ChoixRepriseLocuteur,
  natureNomPersonne,
  peutCreerPersonneAuNommage,
  refuserRapprochement,
  reprendreDonneesLocuteur,
  suggestionsPersonnes,
} from '../../../shared/corpus/rapprochementsPersonnes'

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
  cible: Locuteur
  sources: VueLocuteurPersonne[]
  candidats: VueLocuteurPersonne[]
}

/** Gère les gestes sur les locuteurs et leur rapprochement avec les personnes. */
export function useLocuteursEntretien(deps: {
  locuteurs: Ref<Locuteur[]>
  ouvertId: Readonly<Ref<string | null>>
  lireEditeur: () => Editor | null
  lectureSeule?: () => boolean
  effets: EffetsLocuteurs
}) {
  const selectionVide = ref(true)
  const messagePersonnes = ref('')
  const rapprochementNommage = ref<RapprochementNommage | null>(null)
  const rapprochementOccupe = ref(false)
  const locuteurASupprimer = ref<{ index: number; nom: string; nbBlocs: number } | null>(null)
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
              locuteur.personneRef === demande.personneRef,
          )
        : undefined
    if (!courant()) {
      rapprochementNommage.value = null
      return
    }
    const cibleInitiale = courant()!
    const signatureDonnees = (
      locuteur: Pick<Locuteur, 'pseudo' | 'interviewer' | 'valeursLoc'>,
    ) => JSON.stringify([locuteur.pseudo, locuteur.interviewer, locuteur.valeursLoc])
    rapprochementOccupe.value = true
    try {
      await deps.effets.viderSauvegarde()
      const inventaire = await window.sonal.corpus.personnesInventaire()
      const source = inventaire.locuteurs.find(
        (locuteur) =>
          locuteur.locuteurId === sourceId && locuteur.entretienId === sourceEntretienId,
      )
      if (!source || courant() !== cibleInitiale) {
        throw new Error('Le locuteur a changé. Relancez le rapprochement depuis Personnes.')
      }
      const sourceApercu = demande.sources.find(
        (locuteur) =>
          locuteur.locuteurId === sourceId && locuteur.entretienId === sourceEntretienId,
      )
      if (
        decision === 'lier' &&
        (!sourceApercu || source.personneRef !== sourceApercu.personneRef)
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
                const frais = inventaire.locuteurs.find(
                  (locuteur) =>
                    locuteur.locuteurId === candidat.locuteurId &&
                    locuteur.entretienId === candidat.entretienId,
                )
                if (
                  !frais ||
                  frais.personneRef !== candidat.personneRef ||
                  frais.nom !== candidat.nom
                ) {
                  throw new Error('Les propositions ont changé. Rouvrez le dialogue avant de les écarter.')
                }
                return frais
              })
            : [source]
        const cible = courant()!
        for (const refuse of refuses) {
          refuserRapprochement(cible, { ...refuse, id: refuse.locuteurId })
        }
        deps.effets.planifierSauvegarde()
        if (peutCreerPersonneAuNommage(cible)) {
          const id = await window.sonal.corpus.personnesCommander({
            type: 'creerDefinition',
            nom: cible.nom,
          })
          if (courant() !== cible || !peutCreerPersonneAuNommage(cible) || !id) {
            throw new Error('La personne créée est conservée. Le locuteur a changé : reprenez depuis Personnes.')
          }
          cible.personneRef = id
        }
        messagePersonnes.value =
          natureNomPersonne(demande.nom) === 'role'
            ? 'Propositions écartées. Vous pouvez choisir un nom ou pseudonyme spécifique pour distinguer ces locuteurs.'
            : 'Propositions écartées. Vous pourrez revenir sur ce choix dans Personnes.'
      } else {
        let id = source.personneRef
        if (!id) {
          id = await window.sonal.corpus.personnesCommander({
            type: 'creer',
            entretienId: source.entretienId,
            locuteurId: source.locuteurId,
            nom: source.nom,
          })
        }
        const cible = courant()
        if (!cible || cible !== cibleInitiale || !id) {
          throw new Error('La personne source est conservée. Le locuteur cible a changé : reprenez depuis Personnes.')
        }
        if (deps.locuteurs.value.some((locuteur) => locuteur.id !== cible.id && locuteur.personneRef === id)) {
          throw new Error('Cette personne est déjà représentée dans cet entretien.')
        }
        if (
          reprise &&
          (cible !== cibleInitiale || signatureDonnees(cible) !== signatureDonnees(demande.cible))
        ) {
          throw new Error('Les données locales ont changé. La personne source est conservée ; rouvrez le dialogue pour vérifier la reprise.')
        }
        if (reprise) reprendreDonneesLocuteur(cible, { ...source, id: source.locuteurId }, reprise)
        cible.personneRef = id
        delete cible.personneDeliee
        messagePersonnes.value = reprise
          ? 'Liaison appliquée avec reprise des informations disponibles.'
          : `Locuteur lié à « ${inventaire.personnes.find((personne) => personne.id === id)?.nom ?? source.nom} ». Les données locales sont conservées.`
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
    if (!idEntretien || !locuteur?.id || deps.lectureSeule?.() || natureNomPersonne(nom) === 'ignore') return
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
        const personneRef = courant()!.personneRef
        const lienActuel = personneRef
          ? inventaire.personnes.find((personne) => personne.id === personneRef)?.nom ??
            'Personne absente'
          : ''
        const candidats = suggestionsPersonnes(
          { entretienId: idEntretien, locuteur: courant()! },
          inventaire.locuteurs.map((source) => ({
            entretienId: source.entretienId,
            locuteur: { ...source, id: source.locuteurId },
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
            sources: inventaire.locuteurs,
            candidats: inventaire.locuteurs.filter((source) =>
              candidats.some(
                (candidat) =>
                  candidat.entretienId === source.entretienId &&
                  candidat.locuteur.id === source.locuteurId,
              ),
            ),
          }
          messagePersonnes.value = `Un rapprochement est proposé pour « ${nom} ». Il reste aussi disponible dans Personnes.`
          return
        }
        if (!peutCreerPersonneAuNommage(courant()!)) return
        if (inventaire.indisponibles.length) {
          messagePersonnes.value = 'Création de personne différée : certains entretiens sont indisponibles. Vérifiez le répertoire Personnes.'
          return
        }
        const personneId = await window.sonal.corpus.personnesCommander({
          type: 'creerDefinition',
          nom,
        })
        const cible = courant()
        if (!cible || !peutCreerPersonneAuNommage(cible) || !personneId) {
          if (deps.ouvertId.value === idEntretien) {
            messagePersonnes.value = 'Une personne a été créée, mais le locuteur a changé. Vérifiez le répertoire Personnes.'
          }
          return
        }
        cible.personneRef = personneId
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

  function renommerLoc(index: number, event: Event) {
    const nouveau = (event.target as HTMLInputElement).value
    const ancien = deps.locuteurs.value.find((locuteur) => locuteur.index === index)?.nom
    renommerLocuteur(deps.locuteurs.value, index, nouveau)
    if (ancien !== undefined && ancien !== nouveau) {
      deps.effets.enregistrerAction(
        `Locuteur renommé : ${ancien} → ${nouveau}`,
        { type: 'renommerLocuteur', index, nom: ancien },
      )
      deps.effets.rafraichirJournal()
    }
    deps.effets.rafraichirGouttiere()
    deps.effets.planifierSauvegarde()
    if (ancien !== undefined && ancien !== nouveau) proposerIdentite(index, nouveau)
  }

  function nouveauLocuteur() {
    ajouterLocuteur(deps.locuteurs.value, 'Nouveau locuteur')
    deps.effets.rafraichirGouttiere()
    deps.effets.planifierSauvegarde()
  }

  function setInterviewer(index: number, actif: boolean) {
    const locuteur = deps.locuteurs.value.find((candidat) => candidat.index === index)
    if (!locuteur || (locuteur.interviewer ?? false) === actif) return
    locuteur.interviewer = actif
    deps.effets.rafraichirGouttiere()
    deps.effets.planifierSauvegarde()
  }

  function setPseudoLoc(index: number, pseudo: string) {
    const locuteur = deps.locuteurs.value.find((candidat) => candidat.index === index)
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

  function choisirCouleurLoc(index: number, couleur: string) {
    const locuteur = deps.locuteurs.value.find((candidat) => candidat.index === index)
    if (!locuteur) return
    if (couleur) locuteur.couleur = couleur
    else delete locuteur.couleur
    deps.effets.rafraichirGouttiere()
    deps.effets.planifierSauvegarde()
  }

  function supprimerLocuteurSilencieux(index: number) {
    const editeur = deps.lireEditeur()
    if (!editeur) return
    const locuteurId = deps.locuteurs.value.find((locuteur) => locuteur.index === index)?.id
    const transaction = editeur.state.tr
    editeur.state.doc.forEach((node, offset) => {
      if (node.type.name === 'paragraph' && node.attrs.loc === index) {
        transaction.setNodeMarkup(offset, undefined, { ...node.attrs, loc: null })
      }
    })
    if (transaction.steps.length) editeur.view.dispatch(transaction)
    supprimerLocuteur(deps.locuteurs.value, index)
    if (locuteurId) deps.effets.retirerLocuteurDesNotes(locuteurId)
    locuteurASupprimer.value = null
    deps.effets.rafraichirProjections()
    deps.effets.rafraichirGouttiere()
    deps.effets.planifierSauvegarde()
  }

  function demanderSuppressionLocuteur(index: number) {
    const editeur = deps.lireEditeur()
    const locuteur = deps.locuteurs.value.find((candidat) => candidat.index === index)
    if (!editeur || !locuteur) return
    let nbBlocs = 0
    editeur.state.doc.forEach((node) => {
      if (node.type.name === 'paragraph' && node.attrs.loc === index) nbBlocs++
    })
    if (nbBlocs === 0) {
      supprimerLocuteurSilencieux(index)
      return
    }
    locuteurASupprimer.value = { index, nom: locuteur.nom, nbBlocs }
  }

  function confirmerSuppressionLocuteur() {
    const cible = locuteurASupprimer.value
    if (cible) supprimerLocuteurSilencieux(cible.index)
  }

  return {
    selectionVide,
    messagePersonnes,
    rapprochementNommage,
    rapprochementOccupe,
    locuteurASupprimer,
    mettreAJourSelection,
    reinitialiser,
    attribuerLoc,
    renommerLoc,
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
