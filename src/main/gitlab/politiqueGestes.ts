/**
 *  Portée sémantique des gestes du corpus, par commande.
 *
 *  Un corpus distant n'implémente pas tous les gestes : un même drapeau
 *  « modifiable » déverrouillerait des mutations que le serveur ne sait pas
 *  garder cohérentes. Chaque geste est donc classé une fois pour toutes, et le
 *  dispatch du main refuse par son nom tout geste hors de portée du
 *  fournisseur courant — y compris par appel IPC direct.
 *
 *  Le classement est sémantique, jamais technique : une commande ne dépend
 *  d'entretiens que si elle lit ou contrôle des entretiens publiés.
 */

import type { CapacitesCorpus } from '../../shared/distant'
import { referencesAjouteesCommandeCas, type CommandeCas } from '../../shared/corpus/cas'
import type { CommandeRecueils } from '../../shared/corpus/recueils'
import type { ModeTriEntretiens } from '../../shared/format'

/** Ce qu'un geste doit savoir du corpus pour se calculer. */
export type PorteeGesteCorpus =
  /** Mutation calculée sur le seul `corpus.json`. */
  | 'definitions-corpus'
  /** Mutation qui écrit une référence ou une recette à partir des entretiens
   *  publiés : chaque source lue entre dans le commit, sous sa garde. */
  | 'definitions-avec-sources'
  /** Tri calculé sur les contenus publiés, sans garder aucun entretien. */
  | 'tri-contenus'
  /** Retrait d'une définition : les usages qui la référencent décideront du
   *  refus, et une session ouverte peut la republier plus tard. */
  | 'suppression-definition'
  /** Retrait et archivage d'un entretien. */
  | 'suppression-entretien'
  /** Affectation de modalités aux variables d'un entretien. */
  | 'valeurs-entretien'
  /** Application d'une règle de pseudonymisation à un entretien. */
  | 'pseudonymisation-entretiens'
  /** Renommage global des usages liés, après inventaire complet et reprise qualifiée. */
  | 'pseudonymisation-globale'
  /** Transfert des usages et mémoire complète avant retrait de la définition partagée. */
  | 'pseudonymisation-dissociation'
  /** Retrait global des décisions textuelles attribuées, puis de leur règle. */
  | 'pseudonymisation-suppression-globale'
  /** Ajout d’une variante sans publication d’entretien, qualifié séparément. */
  | 'pseudonymisation-ajout-variante'
  /** Retrait d’une variante et repli des choix liés, après bilan et confirmation. */
  | 'pseudonymisation-retrait-variante'
  /** Import ciblé, avec publication et reprise propres au fournisseur. */
  | 'correspondances-entretiens'
  /** Réaffectation des codages, avec création éventuelle de catégories. */
  | 'themes-reaffectation'
  /** Réaffectation suivie du retrait protégé de la source. */
  | 'themes-reaffectation-suppression'
  /** Parcours non pris en charge sur un corpus distant. */
  | 'indisponible'

export type GesteCorpus = string

/** Portées accordées à GitLab.
 *
 *  C'est cette liste, et elle seule, qui décide de ce que l'interface propose
 *  et de ce que le dispatch accepte. */
export const PORTEEES_OVERTES_GITLAB: PorteeGesteCorpus[] = [
  'definitions-corpus',
  'definitions-avec-sources',
  'tri-contenus',
  'suppression-definition',
  'suppression-entretien',
  'valeurs-entretien',
  'pseudonymisation-entretiens',
  'correspondances-entretiens',
  'pseudonymisation-globale',
  'pseudonymisation-dissociation',
  'pseudonymisation-suppression-globale',
  'pseudonymisation-ajout-variante',
  'pseudonymisation-retrait-variante',
  'themes-reaffectation',
  'themes-reaffectation-suppression',
]

/** Les portées WebDAV sont qualifiées séparément de celles de GitLab. */
export const PORTEES_OUVERTES_WEBDAV: PorteeGesteCorpus[] = [
  'definitions-corpus',
  'definitions-avec-sources',
  'tri-contenus',
  'suppression-definition',
  'suppression-entretien',
  'valeurs-entretien',
  'pseudonymisation-entretiens',
  'correspondances-entretiens',
  'themes-reaffectation',
  'pseudonymisation-globale',
  'pseudonymisation-dissociation',
  'pseudonymisation-suppression-globale',
  'pseudonymisation-ajout-variante',
]

/** Portées accordées par fournisseur. Un fournisseur n'accorde jamais une
 *  portée qu'aucun de ses gestes ne partage. */
const PORTEEES_ACCORDEES: Record<FournisseurCorpus, readonly PorteeGesteCorpus[]> = {
  local: [
    'definitions-corpus',
    'definitions-avec-sources',
    'tri-contenus',
    'suppression-definition',
    'suppression-entretien',
    'valeurs-entretien',
    'pseudonymisation-entretiens',
    'correspondances-entretiens',
    'themes-reaffectation',
    'themes-reaffectation-suppression',
    'pseudonymisation-globale',
    'pseudonymisation-dissociation',
    'pseudonymisation-suppression-globale',
    'pseudonymisation-ajout-variante',
    'pseudonymisation-retrait-variante',
    'indisponible',
  ],
  webdav: PORTEES_OUVERTES_WEBDAV,
  gitlab: PORTEEES_OVERTES_GITLAB,
}


/** Fournisseurs de corpus : le dossier local, ou un miroir distant. */
export type FournisseurCorpus = 'local' | 'webdav' | 'gitlab'

/** Chaque geste du corpus, avec la lecture qu'il exige. */
const PORTEE_PAR_GESTE: Readonly<Record<GesteCorpus, PorteeGesteCorpus>> = {
  // Codebook (thèmes).
  'theme.creer': 'definitions-corpus',
  'theme.modifier': 'definitions-corpus',
  'theme.deplacer': 'definitions-corpus',
  'theme.migrer': 'definitions-corpus',
  'theme.supprimer': 'suppression-definition',
  'theme.transferer': 'themes-reaffectation',
  'theme.transferer-supprimer-source': 'themes-reaffectation-suppression',
  'theme.diviser': 'themes-reaffectation',
  'theme.fusionner': 'themes-reaffectation-suppression',
  'theme.diviser-supprimer-source': 'themes-reaffectation-suppression',

  // Catégories de note du corpus.
  'note.creer-categorie': 'definitions-corpus',
  'note.renommer-categorie': 'definitions-corpus',
  'note.colorer-categorie': 'definitions-corpus',
  'note.supprimer-categorie': 'suppression-definition',

  // Recueils : un passage renvoie à un repère d'entretien publié.
  'recueil.creer': 'definitions-corpus',
  'recueil.renommer': 'definitions-corpus',
  'recueil.changer-mode': 'definitions-corpus',
  'recueil.supprimer': 'definitions-corpus',
  'recueil.inserer-item': 'definitions-corpus',
  'recueil.modifier-item': 'definitions-corpus',
  'recueil.supprimer-item': 'definitions-corpus',
  'recueil.deplacer-item': 'definitions-corpus',
  'recueil.deplacer-section': 'definitions-corpus',
  'recueil.supprimer-section': 'definitions-corpus',
  /** Un recueil qui reprend un passage : il dépend de l'entretien publié. */
  'recueil.passage': 'definitions-avec-sources',

  // Tableau de bord.
  'tableau-bord.modifier': 'definitions-corpus',

  // CAS : un rattachement et une dérivation lisent les entretiens publiés.
  'cas.creer-famille': 'definitions-corpus',
  'cas.completer-famille': 'definitions-corpus',
  'cas.dissoudre-famille': 'definitions-corpus',
  'cas.creer': 'definitions-corpus',
  'cas.creer-lot': 'definitions-corpus',
  'cas.renommer': 'definitions-corpus',
  'cas.modifier-memo': 'definitions-corpus',
  'cas.supprimer': 'definitions-corpus',
  'cas.ajouter-rattachement': 'definitions-avec-sources',
  'cas.retirer-rattachement': 'definitions-corpus',
  'cas.creer-attribut': 'definitions-corpus',
  'cas.modifier-attribut': 'definitions-corpus',
  'cas.supprimer-attribut': 'definitions-corpus',
  'cas.definir-valeur-attribut': 'definitions-corpus',
  'cas.ajouter-derivation-famille': 'definitions-avec-sources',
  'cas.retirer-derivation-famille': 'definitions-corpus',
  'cas.ajouter-derivation-cas': 'definitions-avec-sources',
  'cas.retirer-derivation-cas': 'definitions-corpus',

  // Pseudonymisation.
  'anon.creer-regle': 'definitions-corpus',
  'anon.importer-regles': 'definitions-corpus',
  'anon.importer-cibles': 'correspondances-entretiens',
  'anon.renommer-variante': 'pseudonymisation-globale',
  'anon.dissocier-globalement': 'pseudonymisation-dissociation',
  'anon.supprimer-partout': 'pseudonymisation-suppression-globale',
  'anon.ajouter-pseudo': 'definitions-corpus',
  'anon.ajouter-variante': 'pseudonymisation-ajout-variante',
  'anon.retirer-variante': 'pseudonymisation-retrait-variante',
  'anon.supprimer-regle': 'suppression-definition',
  'anon.renommer-theme': 'definitions-corpus',
  'anon.ecrire-parametres': 'definitions-corpus',

  // Variables et modalités.
  'variable.creer': 'definitions-corpus',
  'variable.modifier': 'definitions-corpus',
  'variable.supprimer': 'suppression-definition',
  'modalite.creer': 'definitions-corpus',
  'modalite.modifier': 'definitions-corpus',
  'modalite.supprimer': 'suppression-definition',

  // Entretiens : identité, ordre, création et retrait.
  'entretien.renommer': 'definitions-corpus',
  'entretien.trier-definitions': 'definitions-corpus',
  'entretien.trier-contenus': 'tri-contenus',
  'entretien.creer': 'definitions-corpus',
  'entretien.importer': 'definitions-corpus',
  'entretien.analyser-suppression': 'suppression-entretien',
  'entretien.supprimer': 'suppression-entretien',

  // Écritures ciblées dans les entretiens depuis les vues corpus.
  'valeurs.lot': 'valeurs-entretien',
  'regles.lot': 'pseudonymisation-entretiens',

  // Parcours refusés sur un corpus distant, quel que soit le fournisseur.
  'note.editer': 'indisponible',
  'personnes.commande': 'indisponible',
  'journal.annuler': 'indisponible',
  'corpus.marquer-demo': 'indisponible',
}

/** Refus explicite et nommé, jamais un échec silencieux de la commande. */
export class RefusGesteError extends Error {
  constructor(readonly geste: GesteCorpus, readonly motif: string) {
    super(motif)
    this.name = 'RefusGesteError'
  }
}

export function porteeGeste(geste: GesteCorpus): PorteeGesteCorpus | null {
  return Object.hasOwn(PORTEE_PAR_GESTE, geste) ? PORTEE_PAR_GESTE[geste] : null
}

/** Le fournisseur courant accepte-t-il ce geste ?
 *  Un geste inconnu est refusé : mieux vaut un refus qu'un geste non classé. */
export function gesteAutorise(
  fournisseur: FournisseurCorpus,
  geste: GesteCorpus,
): boolean {
  const portee = porteeGeste(geste)
  if (!portee) return false
  return PORTEEES_ACCORDEES[fournisseur].includes(portee)
}

/** Vérifie un geste et renvoie son nom, pour un refus compréhensible. */
export function exigerGeste(fournisseur: FournisseurCorpus, geste: GesteCorpus): void {
  if (gesteAutorise(fournisseur, geste)) return
  const portee = porteeGeste(geste)
  throw new RefusGesteError(
    geste,
    portee
      ? messageRefusPortee(portee)
      : `L’opération « ${geste} » n’est pas connue de ce corpus.`,
  )
}

function messageRefusPortee(portee: PorteeGesteCorpus): string {
  if (portee === 'themes-reaffectation-suppression') {
    return 'La réaffectation avec suppression de la thématique source n’est pas disponible sur ce corpus.'
  }
  if (portee === 'themes-reaffectation') {
    return 'Les opérations de réaffectation des thématiques ne sont pas encore disponibles sur ce corpus.'
  }
  return 'Cette opération n’est pas disponible sur un corpus distant.'
}
/** Geste d'une commande CAS : un rattachement de passage et une dérivation
 *  demandent la version publiée de l'entretien qui les porte. */
export function gestureCas(commande: CommandeCas): GesteCorpus {
  if (commande.type === 'ajouter-rattachements') return 'cas.ajouter-rattachement'
  if (commande.type === 'ajouter-derivation-famille') return 'cas.ajouter-derivation-famille'
  if (commande.type === 'ajouter-derivation-cas') return 'cas.ajouter-derivation-cas'
  // Créer un cas, une famille ou un lot peut déjà y attacher un passage.
  if (referencesAjouteesCommandeCas(commande).length > 0) return 'cas.ajouter-rattachement'
  if (commande.type === 'retirer-rattachement'
    || commande.type === 'retirer-derivation-famille'
    || commande.type === 'retirer-derivation-cas') {
    return `cas.${commande.type}`
  }
  if (commande.type === 'supprimer-cas') return 'cas.supprimer'
  return `cas.${commande.type}`
}

/** Geste d'une commande de recueil : reprendre un passage le distingue des
 *  autres insertions, qui ne portent que du texte. */
export function gestureRecueil(commande: CommandeRecueils): GesteCorpus {
  if (
    (commande.type === 'inserer-item' || commande.type === 'modifier-item') &&
    commande.item.type === 'passage'
  ) {
    return 'recueil.passage'
  }
  if (commande.type === 'supprimer-recueil') return 'recueil.supprimer'
  return `recueil.${commande.type}`
}

/** Geste d'un tri : seuls le tri alphabétique et le tri d'ajout se calculent
 *  sur le corpus ; les autres lisent le contenu des entretiens. */
export function gestureTri(mode: ModeTriEntretiens): GesteCorpus {
  return mode === 'alpha' || mode === 'ajout'
    ? 'entretien.trier-definitions'
    : 'entretien.trier-contenus'
}

/** Capacités du corpus vues par l'interface : ce que le fournisseur courant
 *  sait faire, indépendamment de l'état réseau ou d'une session en cours. */
export type { CapacitesCorpus }

/** Parcours propres à chaque transport, en plus des portées accordées. */
const PARCOURS_PAR_FOURNISSEUR: Record<FournisseurCorpus, Omit<
  CapacitesCorpus,
  | 'definitions'
  | 'definitionsAvecSources'
  | 'triContenu'
  | 'ajoutEntretien'
  | 'editionEntretien'
  | 'suppressionEntretien'
  | 'tableDonnees'
  | 'pseudonymisationEntretiens'
  | 'pseudonymisationGlobale'
  | 'dissociationGlobale'
  | 'suppressionAnonGlobale'
  | 'ajoutVarianteAnon'
  | 'retraitVarianteAnon'
  | 'transfertThemes'
  | 'divisionThemes'
  | 'fusionThemes'
  | 'suppressionSourceThemes'
>> = {
  local: {
    renommageEntretien: true,
    metadonneesEntretien: true,
    notes: true,
    personnes: true,
    annulationJournal: true,
    designationMedia: false,
    televersementMedia: false,
    docsCadre: true,
  },
  webdav: {
    renommageEntretien: true,
    metadonneesEntretien: true,
    notes: false,
    personnes: true,
    annulationJournal: false,
    designationMedia: true,
    televersementMedia: true,
    docsCadre: true,
  },
  gitlab: {
    // Le renommage part avec les définitions ; l'audio et le SRT d'un
    // entretien fermé demanderaient une session d'écriture, qui n'est pas
    // ouverte pour ce geste.
    renommageEntretien: true,
    metadonneesEntretien: false,
    notes: false,
    personnes: false,
    annulationJournal: false,
    designationMedia: true,
    televersementMedia: false,
    docsCadre: false,
  },
}

/** Matrice publique d'un fournisseur, dérivée des portées accordées puis
 *  complétée des parcours propres à son transport. */
export function matriceCapacites(fournisseur: FournisseurCorpus): CapacitesCorpus {
  const portees = new Set(PORTEEES_ACCORDEES[fournisseur])
  return {
    definitions: portees.has('definitions-corpus'),
    definitionsAvecSources: portees.has('definitions-avec-sources'),
    triContenu: portees.has('tri-contenus'),
    ajoutEntretien: portees.has('definitions-corpus'),
    editionEntretien: true,
    suppressionEntretien: portees.has('suppression-entretien'),
    tableDonnees: portees.has('valeurs-entretien'),
    pseudonymisationEntretiens: portees.has('pseudonymisation-entretiens'),
    pseudonymisationGlobale: portees.has('pseudonymisation-globale'),
    dissociationGlobale: portees.has('pseudonymisation-dissociation'),
    suppressionAnonGlobale: portees.has('pseudonymisation-suppression-globale'),
    ajoutVarianteAnon: portees.has('pseudonymisation-ajout-variante'),
    retraitVarianteAnon: portees.has('pseudonymisation-retrait-variante'),
    transfertThemes: gesteAutorise(fournisseur, 'theme.transferer'),
    divisionThemes: gesteAutorise(fournisseur, 'theme.diviser'),
    fusionThemes: gesteAutorise(fournisseur, 'theme.fusionner'),
    suppressionSourceThemes: gesteAutorise(fournisseur, 'theme.transferer-supprimer-source'),
    ...PARCOURS_PAR_FOURNISSEUR[fournisseur],
  }
}
