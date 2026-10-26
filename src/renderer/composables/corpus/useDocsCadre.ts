import { computed, onScopeDispose, reactive, ref, type Ref } from 'vue'
import {
  estCheminDocsCadre,
  estListable,
  type ApercuDocumentCadre,
  type EntreeDocsCadre,
  type ModeDocumentsCadre,
  type RaisonSansApercu,
  type TypeDocumentCadre,
  type ResumeDocumentCadre,
  type SourceDocumentCadre,
} from '../../../shared/docsCadre'

/** Message humain d'une absence d'aperçu. */
export function libelleSansApercu(raison: RaisonSansApercu): string {
  switch (raison) {
    case 'format': return "Aucun aperçu intégré pour ce format. Enregistrez une copie ou ouvrez le document avec son application habituelle."
    case 'taille': return 'Fichier trop volumineux pour un aperçu intégré. Vous pouvez enregistrer une copie.'
    case 'signature': return 'Le contenu du fichier ne correspond pas à son extension : aucun aperçu affiché par prudence.'
    case 'encodage': return 'Ce fichier ne peut pas être affiché comme texte. Vous pouvez enregistrer une copie.'
    case 'absent': return 'Ce document a disparu du corpus. Actualisez la liste.'
    case 'invalide': return 'Ce document ne peut pas être consulté.'
    case 'lecture': return 'Lecture impossible. Vérifiez les droits ou la connexion.'
  }
}

export function libelleTypeDocument(type: TypeDocumentCadre): string {
  return { pdf: 'PDF', texte: 'Texte', image: 'Image', bureautique: 'Document bureautique', html: 'HTML', autre: 'Fichier' }[type]
}

export function iconeTypeDocument(type: TypeDocumentCadre): string {
  return { pdf: '📕', texte: '📝', image: '🖼️', bureautique: '📄', html: '🌐', autre: '📦' }[type]
}

export function formaterTaille(octets: number | null): string {
  if (octets === null) return 'inconnue'
  if (octets < 1024) return `${octets} octets`
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`
}

export interface SelectionDocCadre {
  source: SourceDocumentCadre
  chemin: string
}

/** Navigation indépendante des documents du projet et des exemples en lecture seule. */
export function useDocsCadre(deps: {
  estDistant: () => boolean
  actif: Readonly<Ref<boolean>>
}) {
  const mode = ref<ModeDocumentsCadre>(deps.estDistant() ? 'distant' : 'local')
  const sourceActive = ref<SourceDocumentCadre>('projet')
  const etats = reactive({ projet: creerEtat(), exemple: creerEtat() })
  function creerEtat() {
    return { dossier: '', entrees: [] as EntreeDocsCadre[], selection: null as string | null,
      generation: 0, charge: false, chargement: false, absent: false, erreur: null as string | null }
  }
  const dossiersDocsCadre = computed(() => ({ projet: etats.projet.dossier, exemple: etats.exemple.dossier }))
  const entreesProjet = computed(() => etats.projet.entrees)
  const entreesExemples = computed(() => etats.exemple.entrees)
  const documentsProjet = computed(() => etats.projet.entrees.filter((e): e is ResumeDocumentCadre => e.nature === 'document'))
  const documentsExemples = computed(() => etats.exemple.entrees.filter((e): e is ResumeDocumentCadre => e.nature === 'document'))
  const selection = ref<SelectionDocCadre | null>(null)
  const resumeSelection = ref<ResumeDocumentCadre | null>(null)
  const apercu = ref<ApercuDocumentCadre | null>(null)
  const chargementListe = computed(() => etats[sourceActive.value].chargement)
  const chargementApercu = ref(false)
  const erreurListe = computed(() => etats[sourceActive.value].erreur)
  const dossierDocsAbsent = computed(() => etats[sourceActive.value].absent)
  const messageAction = ref<string | null>(null)
  let session = 0
  let generationApercu = 0
  const estDistant = computed(() => mode.value === 'distant')
  const selectionCourante = computed(() => selection.value)

  function resumePour(source: SourceDocumentCadre, chemin: string): ResumeDocumentCadre | null {
    return etats[source].entrees.find((e): e is ResumeDocumentCadre => e.nature === 'document' && e.chemin === chemin) ?? null
  }

  /** En cas de disparition, remonte au premier parent encore disponible. */
  async function lister(source = sourceActive.value, cible = etats[source].dossier): Promise<boolean> {
    const etat = etats[source]
    const maSession = session
    const generation = ++etat.generation
    etat.chargement = true
    try {
      while (true) {
        const inventaire = await window.sonal.docsCadre.lister(source, cible)
        if (maSession !== session || generation !== etat.generation) return false
        if (inventaire.erreur) {
          etat.erreur = inventaire.erreur
          return false
        }
        if (inventaire.absent && cible) {
          cible = cible.split('/').slice(0, -1).join('/')
          continue
        }
        if (source === 'projet') mode.value = inventaire.mode
        etat.entrees = inventaire.entrees
        etat.dossier = cible
        etat.absent = !!inventaire.absent
        etat.charge = true
        etat.erreur = null
        if (etat.selection && !resumePour(source, etat.selection)) etat.selection = null
        if (selection.value?.source === source && !resumePour(source, selection.value.chemin)) selectionner(null)
        return true
      }
    } catch (erreur) {
      if (maSession === session && generation === etat.generation) etat.erreur = messageErreur(erreur)
      return false
    } finally {
      if (maSession === session && generation === etat.generation) etat.chargement = false
    }
  }

  async function preparerDocsCadre(source: SourceDocumentCadre = 'projet'): Promise<void> {
    const maSession = session
    mode.value = deps.estDistant() ? 'distant' : 'local'
    sourceActive.value = source
    if (selection.value?.source !== source) selectionner(null)
    // Les exemples restent disponibles même quand la première lecture projet échoue.
    const lectures = [lister(source)]
    if (source === 'projet' && !etats.exemple.charge) lectures.push(lister('exemple'))
    await Promise.all(lectures)
    if (maSession !== session || sourceActive.value !== source) return
    const chemin = etats[source].selection
    selectionner(chemin && resumePour(source, chemin) ? { source, chemin } : null, false)
    if (selection.value) await chargerApercu()
  }

  function reinitialiserDocsCadre(): void {
    session += 1
    generationApercu += 1
    etats.projet = creerEtat()
    etats.exemple = creerEtat()
    selection.value = null
    resumeSelection.value = null
    apercu.value = null
    chargementApercu.value = false
    messageAction.value = null
    sourceActive.value = 'projet'
    mode.value = deps.estDistant() ? 'distant' : 'local'
  }

  function selectionner(cible: SelectionDocCadre | null, lire = true): void {
    if (cible && selection.value?.source === cible.source && selection.value.chemin === cible.chemin) return
    generationApercu += 1
    selection.value = cible
    messageAction.value = null
    if (cible) etats[cible.source].selection = cible.chemin
    resumeSelection.value = cible ? resumePour(cible.source, cible.chemin) : null
    apercu.value = null
    chargementApercu.value = false
    if (cible && lire) void chargerApercu()
  }

  async function chargerApercu(): Promise<void> {
    const sel = selection.value
    if (!sel) return
    const generation = ++generationApercu
    chargementApercu.value = true
    try {
      const resultat = await window.sonal.docsCadre.lireApercu(sel.source, sel.chemin)
      if (generation !== generationApercu) return
      resumeSelection.value = resultat.resume
      apercu.value = resultat.apercu
    } catch (erreur) {
      if (generation !== generationApercu) return
      apercu.value = { genre: 'aucun', raison: 'lecture' }
      messageAction.value = messageErreur(erreur)
    } finally {
      if (generation === generationApercu) chargementApercu.value = false
    }
  }

  async function naviguerDocsCadre(source: SourceDocumentCadre, dossier: string): Promise<void> {
    if (!estCheminDocsCadre(dossier, true)) return
    sourceActive.value = source
    selectionner(null)
    etats[source].selection = null
    await lister(source, dossier)
  }

  async function rafraichirDocsCadre(): Promise<void> {
    if (await lister() && selection.value) await chargerApercu()
  }

  function contexteAction() {
    const maSession = session
    const dossier = etats.projet.dossier
    return { dossier, actuelle: () => maSession === session && dossier === etats.projet.dossier && sourceActive.value === 'projet' }
  }

  async function ajouterFichier(): Promise<void> {
    if (estDistant.value || sourceActive.value !== 'projet') return
    const action = contexteAction()
    messageAction.value = null
    try {
      let resultat = await window.sonal.docsCadre.ajouterFichier(action.dossier)
      if (!action.actuelle()) return
      if (!resultat.ok && resultat.raison === 'existe' && resultat.suggere) {
        resultat = await window.sonal.docsCadre.ajouterFichier(action.dossier, resultat.suggere)
      }
      if (!action.actuelle()) return
      if (resultat.ok) {
        await lister('projet', action.dossier)
        if (!action.actuelle()) return
        selectionner({ source: 'projet', chemin: cheminEnfant(action.dossier, resultat.nom) })
        messageAction.value = `« ${resultat.nom} » a été ajouté au dossier.`
      } else if (resultat.raison !== 'annule') messageAction.value = messageMutation(resultat.raison)
    } catch (erreur) {
      if (action.actuelle()) messageAction.value = messageErreur(erreur)
    }
  }

  async function creerDossier(nom: string): Promise<boolean> {
    if (estDistant.value || sourceActive.value !== 'projet') return false
    if (!estListable(nom)) {
      messageAction.value = 'Choisissez un nom sans caractère réservé ni séparateur de chemin.'
      return false
    }
    const action = contexteAction()
    try {
      const resultat = await window.sonal.docsCadre.creerDossier(action.dossier, nom)
      if (!action.actuelle()) return false
      if (!resultat.ok) {
        messageAction.value = messageMutation(resultat.raison)
        return false
      }
      await lister('projet', action.dossier)
      if (!action.actuelle()) return false
      messageAction.value = `Le dossier « ${nom} » a été créé.`
      return true
    } catch (erreur) {
      if (action.actuelle()) messageAction.value = messageErreur(erreur)
      return false
    }
  }

  /** Chaque dépôt garde la destination initiale, même pendant une navigation. */
  async function deposerFichiers(chemins: string[]): Promise<void> {
    if (estDistant.value || sourceActive.value !== 'projet' || !chemins.length) return
    const action = contexteAction()
    const maSession = session
    let dernier: string | null = null
    const refus: string[] = []
    let ajoutes = 0
    for (const chemin of chemins) {
      if (maSession !== session) return
      try {
        const resultat = await window.sonal.docsCadre.deposer(chemin, action.dossier)
        if (resultat.ok) { dernier = resultat.nom; ajoutes += 1 }
        else refus.push(messageMutation(resultat.raison))
      } catch (erreur) { refus.push(messageErreur(erreur)) }
    }
    if (!action.actuelle()) return
    if (ajoutes) {
      await lister('projet', action.dossier)
      if (!action.actuelle()) return
      selectionner({ source: 'projet', chemin: cheminEnfant(action.dossier, dernier!) })
    }
    messageAction.value = [ajoutes ? `${ajoutes} document(s) ajouté(s).` : '', ...refus].filter(Boolean).join(' ')
  }

  async function executerAction(action: () => Promise<unknown>, message?: string): Promise<void> {
    const maSession = session
    messageAction.value = null
    try {
      await action()
      if (maSession === session && message) messageAction.value = message
    } catch (erreur) {
      if (maSession === session) messageAction.value = messageErreur(erreur)
    }
  }

  const ouvrirAvecApplication = (chemin: string) => executerAction(() => window.sonal.docsCadre.ouvrirAvecApplication(chemin))
  const afficherDansDossier = (chemin: string) => executerAction(() => window.sonal.docsCadre.afficherDansDossier(chemin))
  const ouvrirDossierLocal = () => executerAction(
    () => window.sonal.docsCadre.ouvrirDossierLocal(etats.projet.dossier),
    'Le dossier a été ouvert dans le gestionnaire de fichiers.',
  )
  const ouvrirDansNextcloud = () => executerAction(() => window.sonal.docsCadre.ouvrirDansNextcloud(etats.projet.dossier))
  const enregistrerCopie = (source: SourceDocumentCadre, chemin: string) => executerAction(async () => {
    const maSession = session
    if (await window.sonal.docsCadre.enregistrerCopie(source, chemin) && maSession === session) {
      messageAction.value = 'Une copie exacte du fichier original a été enregistrée.'
    }
  })

  const surFocus = (): void => {
    if (deps.actif.value && mode.value === 'local') void rafraichirDocsCadre()
  }
  window.addEventListener('focus', surFocus)
  onScopeDispose(() => { session += 1; generationApercu += 1; window.removeEventListener('focus', surFocus) })

  return {
    mode, estDistant, documentsProjet, documentsExemples, entreesProjet, entreesExemples,
    dossiersDocsCadre, dossierDocsAbsent, selection, resumeSelection, apercu, chargementListe,
    chargementApercu, erreurListe, messageAction, selectionCourante,
    preparerDocsCadre, reinitialiserDocsCadre, lister, rafraichirDocsCadre, selectionner,
    naviguerDocsCadre, ajouterFichier, creerDossier, deposerFichiers, ouvrirAvecApplication,
    afficherDansDossier, ouvrirDossierLocal, enregistrerCopie, ouvrirDansNextcloud,
  }
}

function cheminEnfant(dossier: string, nom: string): string { return dossier ? `${dossier}/${nom}` : nom }
function messageErreur(erreur: unknown): string {
  return erreur instanceof Error && erreur.message ? erreur.message : 'Opération impossible. Vérifiez les droits ou la connexion.'
}
function messageMutation(raison: string): string {
  switch (raison) {
    case 'existe': return 'Un fichier ou dossier porte déjà ce nom : rien n’a été remplacé.'
    case 'source': return 'La source n’est pas un fichier ordinaire : les dossiers et liens ne sont pas copiés.'
    case 'invalide': return 'Nom refusé. Choisissez un nom sans caractère réservé ni séparateur de chemin.'
    case 'absent': return 'Ce fichier ou dossier n’existe plus. Actualisez la liste.'
    default: return 'Opération impossible. Vérifiez les droits et actualisez la liste.'
  }
}
