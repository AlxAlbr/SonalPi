import { computed, onScopeDispose, ref, type Ref } from 'vue'
import {
  estNomSain,
  type ApercuDocumentCadre,
  type ModeDocumentsCadre,
  type RaisonSansApercu,
  type TypeDocumentCadre,
  type ResultatLectureDocsCadre,
  type ResumeDocumentCadre,
  type SourceDocumentCadre,
} from '../../../shared/docsCadre'

/** Message humain d'une absence d'aperçu (affiché dans la fiche du document). */
export function libelleSansApercu(raison: RaisonSansApercu): string {
  switch (raison) {
    case 'format':
      return "Aucun aperçu intégré pour ce format : SonalPi conserve le fichier dans son format d'origine et délègue son affichage à l'outil approprié."
    case 'taille':
      return 'Fichier trop volumineux pour un aperçu intégré. Il reste listé, et peut être ouvert dans son application ou enregistré comme copie.'
    case 'signature':
      return "Le contenu du fichier ne correspond pas à son extension : aucun aperçu affiché par prudence."
    case 'encodage':
      return "Ce fichier n'est pas du texte UTF-8 : aucun aperçu intégré. Il reste ouvrable avec son application habituelle."
    case 'absent':
      return 'Ce document a disparu du corpus. Actualisez la liste.'
    case 'invalide':
      return 'Nom de document refusé par la sécurité.'
    case 'lecture':
      return 'Lecture impossible (droits, disque ou réseau).'
  }
}

/** Libellé humain d'une famille de document. */
export function libelleTypeDocument(type: TypeDocumentCadre): string {
  switch (type) {
    case 'pdf': return 'PDF'
    case 'texte': return 'Texte'
    case 'image': return 'Image'
    case 'bureautique': return 'Document bureautique'
    case 'html': return 'HTML'
    case 'autre': return 'Fichier'
  }
}

/** Icône minimale d'un document, selon sa famille. */
export function iconeTypeDocument(type: TypeDocumentCadre): string {
  switch (type) {
    case 'pdf': return '📕'
    case 'texte': return '📝'
    case 'image': return '🖼️'
    case 'bureautique': return '📄'
    case 'html': return '🌐'
    case 'autre': return '📦'
  }
}

/** Taille lisible (octets, Ko, Mo) ; null si inconnue. */
export function formaterTaille(octets: number | null): string {
  if (octets === null) return 'inconnue'
  if (octets < 1024) return `${octets} octets`
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`
}

/** Sélection partagée entre la liste des documents et le panneau d'aperçu. */
export interface SelectionDocCadre {
  source: SourceDocumentCadre
  nom: string
}

/**
 *  Gère les documents du projet et les exemples fournis avec l'application.
 *  La lecture seule du corpus distant est aussi garantie par le processus principal.
 */
export function useDocsCadre(deps: {
  estDistant: () => boolean
  actif: Readonly<Ref<boolean>>
}) {
  const mode = ref<ModeDocumentsCadre>(deps.estDistant() ? 'distant' : 'local')
  const documentsProjet = ref<ResumeDocumentCadre[]>([])
  const documentsExemples = ref<ResumeDocumentCadre[]>([])
  const selection = ref<SelectionDocCadre | null>(null)
  const resumeSelection = ref<ResumeDocumentCadre | null>(null)
  const apercu = ref<ApercuDocumentCadre | null>(null)
  const chargementListe = ref(false)
  const chargementApercu = ref(false)
  const erreurListe = ref<string | null>(null)
  const messageAction = ref<string | null>(null)
  /** Suppression en attente de confirmation (motif « Supprimer/Confirmer »). */
  const documentASupprimer = ref<string | null>(null)
  const derniereSelection: Record<SourceDocumentCadre, string | null> = {
    projet: null,
    exemple: null,
  }
  let generation = 0
  let generationListe = 0

  const estDistant = computed(() => mode.value === 'distant')

  const resumePour = (source: SourceDocumentCadre, nom: string): ResumeDocumentCadre | null => {
    const liste = source === 'projet' ? documentsProjet.value : documentsExemples.value
    return liste.find((d) => d.nom === nom) ?? null
  }

  /** Relit l'inventaire sans effacer une liste déjà chargée en cas d'erreur réseau. */
  async function lister(): Promise<boolean> {
    const maGeneration = ++generationListe
    chargementListe.value = true
    try {
      const inventaire = await window.sonal.docsCadre.lister()
      if (maGeneration !== generationListe) return false
      mode.value = inventaire.mode
      documentsExemples.value = inventaire.exemples
      if (inventaire.erreurProjet) {
        erreurListe.value = inventaire.erreurProjet
        return false
      }
      documentsProjet.value = inventaire.projet
      erreurListe.value = null
      // Une sélection disparue de sa liste est désélectionnée.
      if (selection.value && !resumePour(selection.value.source, selection.value.nom)) {
        selectionner(null)
      }
      return true
    } catch (erreur) {
      if (maGeneration !== generationListe) return false
      erreurListe.value =
        erreur instanceof Error && erreur.message
          ? erreur.message
          : 'Impossible de lire les documents du corpus. Vérifiez la connexion ; les documents exemples restent disponibles.'
      return false
    } finally {
      if (maGeneration === generationListe) chargementListe.value = false
    }
  }

  /** Relit les documents au retour dans un onglet, puis restaure sa sélection. */
  async function preparerDocsCadre(source: SourceDocumentCadre = 'projet'): Promise<void> {
    mode.value = deps.estDistant() ? 'distant' : 'local'
    if (selection.value?.source !== source) selectionner(null)
    await rafraichirDocsCadre()
    activerSource(source)
  }

  /** Libère la session documentaire et invalide les requêtes de l'ancien corpus. */
  function reinitialiserDocsCadre(): void {
    generation += 1
    generationListe += 1
    selection.value = null
    resumeSelection.value = null
    apercu.value = null
    chargementListe.value = false
    chargementApercu.value = false
    erreurListe.value = null
    messageAction.value = null
    documentASupprimer.value = null
    derniereSelection.projet = null
    derniereSelection.exemple = null
    mode.value = deps.estDistant() ? 'distant' : 'local'
    documentsProjet.value = []
    documentsExemples.value = []
  }

  /** Sélectionne (ou désélectionne) un document, puis charge son aperçu frais.
   *  Une réponse tardive d'un document quitté ne s'affiche jamais (génération). */
  function selectionner(cible: SelectionDocCadre | null): void {
    if (
      selection.value &&
      cible &&
      selection.value.source === cible.source &&
      selection.value.nom === cible.nom
    ) {
      return
    }
    documentASupprimer.value = null
    messageAction.value = null
    generation += 1
    selection.value = cible
    if (cible) derniereSelection[cible.source] = cible.nom
    resumeSelection.value = cible ? resumePour(cible.source, cible.nom) : null
    apercu.value = null
    if (!cible) {
      chargementApercu.value = false
      return
    }
    void chargerApercu()
  }

  /** Affiche uniquement la famille demandée et restaure son dernier document. */
  function activerSource(source: SourceDocumentCadre): void {
    if (selection.value?.source === source) return
    const nom = derniereSelection[source]
    selectionner(nom && resumePour(source, nom) ? { source, nom } : null)
  }

  async function chargerApercu(): Promise<void> {
    const sel = selection.value
    if (!sel) return
    const maGeneration = ++generation
    chargementApercu.value = true
    apercu.value = null
    try {
      const resultat = await window.sonal.docsCadre.lireApercu(sel.source, sel.nom)
      if (maGeneration !== generation || selection.value !== sel) return
      resumeSelection.value = resultat.resume
      apercu.value = resultat.apercu
    } catch (erreur) {
      if (maGeneration !== generation || selection.value !== sel) return
      apercu.value = { genre: 'aucun', raison: 'lecture' }
      messageAction.value =
        erreur instanceof Error && erreur.message
          ? erreur.message
          : 'Lecture impossible (droits, disque ou réseau).'
    } finally {
      if (maGeneration === generation) chargementApercu.value = false
    }
  }

  /** Recharge l'inventaire et l'aperçu courant (action « Actualiser », retour
   *  de focus d'une application externe : pas de surveillance en continu). */
  async function rafraichirDocsCadre(): Promise<void> {
    if (await lister() && selection.value) await chargerApercu()
  }

  /** Relecture fraîche UNIQUEMENT si l'aperçu courant a été dépassé (écriture
   *  externe) — la fonction renvoie la sélection courante pour l'appelant. */
  const selectionCourante = computed(() => selection.value)

  /* ── Actions locales (aucune en corpus distant, garanti aussi par le main) ── */

  async function ajouterFichier(): Promise<void> {
    messageAction.value = null
    try {
      let resultat = await window.sonal.docsCadre.ajouterFichier()
      if (resultat.ok) {
        await lister()
        selectionner({ source: 'projet', nom: resultat.nom })
        messageAction.value = `« ${resultat.nom} » a été ajouté au corpus.`
        return
      }
      if (resultat.raison === 'annule') return
      if (resultat.raison === 'existe' && resultat.suggere) {
        // Collision : on reprend avec le premier nom libre proposé.
        const reprise = await window.sonal.docsCadre.ajouterFichier(resultat.suggere)
        if (reprise.ok) {
          await lister()
          selectionner({ source: 'projet', nom: reprise.nom })
          messageAction.value =
            `Un homonyme existait : le document a été ajouté sous le nom « ${reprise.nom} ».`
          return
        }
        resultat = reprise
      }
      messageAction.value = messageMutation(resultat, 'ajout impossible')
    } catch (erreur) {
      messageAction.value = messageErreur(erreur)
    }
  }

  /** Glisser-déposer : copie exacte d'un ou plusieurs fichiers vers
   *  `DocsCadre/`. Jamais d'écrasement : un homonyme est REFUSÉ (pas de
   *  renommage automatique), message explicite dans le panneau. */
  async function deposerFichiers(chemins: string[]): Promise<void> {
    messageAction.value = null
    if (chemins.length === 0) return
    const ajoutes: string[] = []
    const refus: string[] = []
    for (const chemin of chemins) {
      try {
        const resultat = await window.sonal.docsCadre.deposer(chemin)
        if (resultat.ok) {
          ajoutes.push(resultat.nom)
          continue
        }
        if (resultat.raison === 'existe') {
          refus.push('un fichier porte déjà ce nom dans DocsCadre, rien n’a été copié')
          continue
        }
        refus.push(messageMutation(resultat, 'dépôt refusé'))
      } catch (erreur) {
        refus.push(messageErreur(erreur))
      }
    }
    if (ajoutes.length > 0) {
      await lister()
      selectionner({ source: 'projet', nom: ajoutes[ajoutes.length - 1] })
      messageAction.value =
        ajoutes.length === 1
          ? `« ${ajoutes[0]} » a été ajouté au corpus.`
          : `${ajoutes.length} documents ont été ajoutés au corpus.`
    }
    if (refus.length > 0) {
      messageAction.value = messageAction.value
        ? `${messageAction.value} ${refus.length} élément(s) refusé(s) : ${refus[0]}.`
        : `Dépôt refusé : ${refus[0]}.`
    }
  }

  /** Saisie d'un nouveau nom : la garde de forme est jouée ici ET au main. */
  function nomRenommageValide(nouveau: string): boolean {
    return estNomSain(nouveau)
  }

  async function renommerDocCadre(ancienNom: string, nouveauNom: string): Promise<void> {
    messageAction.value = null
    const cible = nouveauNom.trim()
    if (cible === ancienNom) return
    if (!estNomSain(cible)) {
      messageAction.value =
        'Nom refusé : conservez espaces, accents, extension et casse, sans séparateur de chemin ni caractère réservé.'
      return
    }
    try {
      const resultat = await window.sonal.docsCadre.renommer(ancienNom, cible)
      if (resultat.ok) {
        // Sélection mise à jour AVANT le rechargement : la liste fraîche la
        // retrouve sous son nouveau nom (sinon elle serait désélectionnée).
        if (selection.value?.source === 'projet' && selection.value.nom === ancienNom) {
          selection.value = { source: 'projet', nom: resultat.nom }
        }
        await lister()
        if (selection.value?.nom === resultat.nom) {
          resumeSelection.value = resumePour('projet', resultat.nom)
        }
        messageAction.value = `Document renommé en « ${resultat.nom} » (contenu inchangé).`
        return
      }
      messageAction.value = messageMutation(resultat, 'renommage impossible')
    } catch (erreur) {
      messageAction.value = messageErreur(erreur)
    }
  }

  function demanderSuppression(nom: string): void {
    messageAction.value = null
    documentASupprimer.value = nom
  }

  function annulerSuppression(): void {
    documentASupprimer.value = null
  }

  async function confirmerSuppression(): Promise<void> {
    const nom = documentASupprimer.value
    if (!nom) return
    documentASupprimer.value = null
    messageAction.value = null
    try {
      const resultat = await window.sonal.docsCadre.supprimer(nom)
      if (resultat.ok) {
        await lister()
        if (selection.value?.source === 'projet' && selection.value.nom === nom) {
          selectionner(null)
        }
        messageAction.value = `« ${nom} » a été déplacé dans la corbeille du corpus.`
        return
      }
      messageAction.value = messageMutation(resultat, 'suppression impossible')
    } catch (erreur) {
      messageAction.value = messageErreur(erreur)
    }
  }

  async function ouvrirAvecApplication(nom: string): Promise<void> {
    messageAction.value = null
    try {
      await window.sonal.docsCadre.ouvrirAvecApplication(nom)
    } catch (erreur) {
      messageAction.value = messageErreur(erreur)
    }
  }

  async function ouvrirDossierLocal(): Promise<void> {
    messageAction.value = null
    try {
      await window.sonal.docsCadre.ouvrirDossierLocal()
      messageAction.value = 'Le dossier DocsCadre a été ouvert dans le gestionnaire de fichiers.'
    } catch (erreur) {
      messageAction.value = messageErreur(erreur)
    }
  }

  async function enregistrerCopie(source: SourceDocumentCadre, nom: string): Promise<void> {
    messageAction.value = null
    try {
      const ok = await window.sonal.docsCadre.enregistrerCopie(source, nom)
      if (ok) {
        messageAction.value = 'Une copie exacte du fichier original a été enregistrée.'
      }
    } catch (erreur) {
      messageAction.value = messageErreur(erreur)
    }
  }

  async function ouvrirDansNextcloud(): Promise<void> {
    messageAction.value = null
    try {
      await window.sonal.docsCadre.ouvrirDansNextcloud()
    } catch (erreur) {
      messageAction.value = messageErreur(erreur)
    }
  }

  /* ── Messages ────────────────────────────────────────────────────────── */

  function messageMutation(resultat: { raison: string; suggere?: string }, contexte: string): string {
    switch (resultat.raison) {
      case 'existe':
        return `Un document de ce nom existe déjà (${contexte}). Nom libre proposé : ${resultat.suggere ?? '—'}.`
      case 'source':
        return 'La source n’est pas un fichier ordinaire (dossier, lien ou fichier illisible) : rien n’a été copié.'
      case 'invalide':
        return 'Nom refusé : séparateur de chemin, caractère réservé ou forme non portable.'
      case 'absent':
        return `Le document n'existe plus (${contexte}). Actualisez la liste.`
      case 'lecture':
        return `Opération impossible (${contexte}) : erreur de lecture sur le disque.`
      default:
        return `Opération impossible (${contexte}).`
    }
  }

  function messageErreur(erreur: unknown): string {
    return erreur instanceof Error && erreur.message
      ? erreur.message
      : 'Opération impossible : erreur inattendue.'
  }

  /* ── Retour de focus : pas de surveillance en continu des écritures tierces ── */
  const surFocus = (): void => {
    if (!deps.actif.value || mode.value !== 'local') return
    void rafraichirDocsCadre()
  }
  window.addEventListener('focus', surFocus)
  onScopeDispose(() => window.removeEventListener('focus', surFocus))

  return {
    mode,
    estDistant,
    documentsProjet,
    documentsExemples,
    selection,
    resumeSelection,
    apercu,
    chargementListe,
    chargementApercu,
    erreurListe,
    messageAction,
    documentASupprimer,
    selectionCourante,
    preparerDocsCadre,
    reinitialiserDocsCadre,
    lister,
    rafraichirDocsCadre,
    selectionner,
    nomRenommageValide,
    ajouterFichier,
    deposerFichiers,
    renommerDocCadre,
    demanderSuppression,
    annulerSuppression,
    confirmerSuppression,
    ouvrirAvecApplication,
    ouvrirDossierLocal,
    enregistrerCopie,
    ouvrirDansNextcloud,
  }
}
