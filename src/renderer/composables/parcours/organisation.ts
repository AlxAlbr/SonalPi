import type { Ref } from 'vue'
import type { EntretienRef } from '../../../shared/format'
import type { Cas } from '../../../shared/corpus/cas'
import type { Recueil } from '../../../shared/corpus/recueils'
import type { DemandeLotCorpus, ResultatLotCorpus } from '../../export/exportCorpus'
import type { SousEspaceOrganisation, VueApplication } from '../espaces'
import type { DefinitionParcours, EtapePasAPas } from './types'

export const NOM_RECUEIL_GUIDE = 'Regards sur le bénévolat'

export interface DepsParcoursOrganisation {
  vue: Ref<VueApplication>
  sousEspaceOrganisation: Ref<SousEspaceOrganisation>
  membership: Ref<Record<string, EntretienRef>>
  cas: Ref<Record<string, Cas>>
  recueils: Ref<Record<string, Recueil>>
  recueilOuvertId: Ref<string | null>
  sauvegardeCas: Ref<string>
  sauvegardeRecueil: Ref<string>
  ouvertId: Ref<string | null>
  exportRealise: Ref<{ demande: DemandeLotCorpus; resultat: ResultatLotCorpus } | null>
}

/** Accompagne l'organisation des sources et la préparation de fichiers à relire. */
export function creerParcoursOrganisation(deps: DepsParcoursOrganisation): DefinitionParcours {
  const sur = (onglet: SousEspaceOrganisation) => deps.vue.value === 'organiser' && deps.sousEspaceOrganisation.value === onglet
  const navigation = (onglet: SousEspaceOrganisation) => deps.vue.value !== 'organiser'
    ? '[data-tour="ouvrir-organiser"]' : !sur(onglet) ? `[data-tour="ouvrir-organisation-${onglet}"]` : null
  const coordinatrice = () => Object.entries(deps.membership.value).find(([, r]) => r.titre === '1Coordinatrice')?.[0]
  const recueil = () => Object.values(deps.recueils.value).find((r) => r.nom === NOM_RECUEIL_GUIDE)
  const structurePrete = () => !!recueil()?.items.some((i) => i.type === 'titre' && !!i.libelle.trim())
    && !!recueil()?.items.some((i) => i.type === 'texte' && !!i.texte.trim())
  const dansOrganisation = { panneau: true, panneauAvecTrou: true, panneauSur: ['organisation', 'entretien'], vueFin: 'organiser' } satisfies Partial<EtapePasAPas>
  const etapes: EtapePasAPas[] = [
    {
      ...dansOrganisation, id: 'creer-cas', titre: 'Réunir les matériaux dans un cas',
      cible: () => {
        const nav = navigation('cas')
        if (nav) return nav
        if (!document.querySelector('.creation-cas')) return '[data-tour="nouveau-cas"]'
        if (!document.querySelector('.creation-lot-cas')) return '[data-tour="cas-depuis-entretiens"]'
        if (document.querySelector('.apercu-lot')) return '[data-tour="confirmer-lot-cas"]'
        if (!document.querySelector<HTMLInputElement>(`[data-tour="source-cas-${coordinatrice()}"]`)?.checked) return `[data-tour="source-cas-${coordinatrice()}"]`
        return '[data-tour="previsualiser-cas"]'
      },
      fait: () => deps.sauvegardeCas.value === 'à jour' && !!coordinatrice() && Object.values(deps.cas.value).some((c) =>
        c.regles.some((r) => r.type === 'entretiens' && r.entretienIds.length === 1 && r.entretienIds[0] === coordinatrice())),
      texte: () => !sur('cas') ? 'Ouvrez « Cas » dans l’espace « Organiser et exporter ».'
        : 'Cliquez sur « Nouveau cas », puis « Depuis des entretiens ». Cochez seulement « 1Coordinatrice », conservez « Un cas par entretien », puis prévisualisez et créez le cas.',
      explication: () => 'Un cas réunit les matériaux d’une unité étudiée : une personne, un groupe ou, ici, un entretien entier. Il référence les sources sans les copier ; sa règle inclura aussi les futurs ajouts au texte.',
      fini: () => 'Le cas réunit les matériaux de la coordinatrice. Les sources restent dans leur entretien d’origine. Vous pouvez compléter le mémo du cas pour préciser ce que vous souhaitez comparer.',
    },
    {
      ...dansOrganisation, id: 'structurer-recueil', titre: 'Structurer un recueil',
      cible: () => navigation('recueils') ?? (!recueil() ? '[data-tour="creation-recueil"]'
        : deps.recueilOuvertId.value !== recueil()!.id ? `[data-tour="ouvrir-recueil-${recueil()!.id}"]`
          : !recueil()!.items.some((i) => i.type === 'titre' && i.libelle.trim()) ? '[data-tour="ajouter-titre-recueil"]' : '[data-tour="ajouter-texte-recueil"]'),
      fait: () => deps.sauvegardeRecueil.value === 'à jour' && structurePrete(),
      texte: () => !sur('recueils') ? 'Ouvrez « Recueils » dans l’espace « Organiser et exporter ».'
        : `Créez le recueil « ${NOM_RECUEIL_GUIDE} ». Ouvrez-le, ajoutez un titre, par exemple « Être utile », puis un texte libre présentant une question ou une hypothèse sur le bénévolat.`,
      explication: () => 'Le cas rassemble des matériaux ; le recueil compose un document dans l’ordre de votre choix. Les titres structurent votre argumentation et les textes libres accueillent vos commentaires.',
      fini: () => 'Votre recueil possède un titre et un premier commentaire. Vous allez maintenant y associer un passage de l’entretien.',
    },
    {
      ...dansOrganisation, id: 'ajouter-passage', titre: 'Étayer le recueil avec un passage', requiere: 'structurer-recueil', vueFin: 'entretien',
      cible: () => {
        if (deps.vue.value !== 'entretien') return deps.vue.value === 'corpus'
          ? '[data-tour="carte-1Coordinatrice"] .crayon' : '[data-tour="ouvrir-traiter"]'
        if (deps.ouvertId.value !== coordinatrice()) return '.retour'
        if (document.querySelector('[data-tour="ajout-recueil-guide"]')) return '[data-tour="ajout-recueil-guide"]'
        if (document.querySelector('[data-tour="selection-vers-recueil"]')) return '[data-tour="selection-vers-recueil"]'
        return '.ProseMirror'
      },
      fait: () => deps.sauvegardeRecueil.value === 'à jour' && structurePrete() && !!coordinatrice()
        && !!recueil()?.items.some((i) => i.type === 'passage' && i.source.entretienId === coordinatrice() && !!i.source.repereId),
      texte: () => deps.vue.value !== 'entretien'
        ? 'Revenez dans « Importer et traiter », puis ouvrez « 1Coordinatrice » avec le crayon de sa carte.'
        : deps.ouvertId.value !== coordinatrice() ? 'Revenez au corpus et ouvrez « 1Coordinatrice ».'
          : `Sélectionnez un court passage sur le bénévolat. Faites un clic droit, choisissez « Ajouter au recueil… », sélectionnez « ${NOM_RECUEIL_GUIDE} », puis confirmez « Ajouter le passage ».`,
      explication: () => 'Le passage reste lié à sa source. Vous pourrez le relire dans son contexte depuis le recueil. Vos commentaires ne modifient pas les propos de la personne interrogée.',
      fini: () => 'Le passage est associé au recueil sans copier l’entretien. Retrouvez-le dans « Recueils » : « Voir dans l’entretien » permet de revenir à la source. Relisez les informations personnelles avant tout partage.',
    },
    {
      ...dansOrganisation, id: 'exporter-entretiens', titre: 'Exporter les entretiens pour les relire',
      cible: () => navigation('export') ?? '[data-tour="reglages-export-guide"]',
      fait: () => {
        const exporte = deps.exportRealise.value
        if (!exporte || exporte.resultat.etat !== 'succes') return false
        const ids = Object.keys(deps.membership.value)
        return ids.length === 4 && exporte.demande.selection.length === 4
          && ids.every((id) => exporte.demande.selection.some((s) => s.id === id))
          && exporte.demande.formats.includes('txt') && exporte.demande.options.anon
          && exporte.resultat.faits.length === 4 && exporte.resultat.faits.every((f) => f.etat === 'succes')
      },
      texte: () => !sur('export') ? 'Ouvrez « Exporter le corpus » dans l’espace « Organiser et exporter ».'
        : 'Sélectionnez les quatre entretiens, choisissez les formats de lecture et cochez « Texte brut (.txt) ». Conservez la pseudonymisation, vérifiez le récapitulatif puis exportez dans un dossier de votre choix. L’annulation ou un export incomplet ne valide pas l’étape.',
      explication: () => 'Cet export produit des copies de lecture, sans modifier votre corpus. Il n’inclut pas le document du recueil, qui possède son propre export. Les pseudonymes configurés ne garantissent pas l’anonymat : vérifiez les informations restantes avant de partager.',
      fini: () => 'Les quatre entretiens ont été exportés en texte pour la relecture. Vous avez découvert les cas, les recueils et l’export. Le corpus de la démo conserve votre travail ; vérifiez toujours les fichiers avant de les partager.',
    },
  ]
  return { id: 'organisation', titre: 'Organiser et exporter',
    resume: 'Réunir des matériaux dans un cas, composer un recueil et exporter des copies de lecture.', disponible: () => true, etapes }
}
