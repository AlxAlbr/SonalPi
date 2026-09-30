import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import type {
  ApiGitLab,
  AuthentificationGitLab,
  ConnexionGitLabPublique,
  DemandeOuvertureGitLab,
  ProjetGitLabPrepare,
} from '../../../shared/gitlab'

/** API injectable pour les tests ; l'API réelle par défaut. */
export interface ApiGitLabTestable {
  detecterInstance: ApiGitLab['detecterInstance']
  etat: ApiGitLab['etat']
  connecter: ApiGitLab['connecter']
  connecterAvecJeton: ApiGitLab['connecterAvecJeton']
  deconnecter: ApiGitLab['deconnecter']
}

function apiReelle(): ApiGitLabTestable {
  return {
    detecterInstance: (urlProjet) => window.sonal.gitlab.detecterInstance(urlProjet),
    etat: (urlInstance) => window.sonal.gitlab.etat(urlInstance),
    connecter: (urlInstance, clientId) => window.sonal.gitlab.connecter(urlInstance, clientId),
    connecterAvecJeton: (urlInstance, jeton) =>
      window.sonal.gitlab.connecterAvecJeton(urlInstance, jeton),
    deconnecter: (urlInstance, utilisateur) =>
      window.sonal.gitlab.deconnecter(urlInstance, utilisateur),
  }
}

/**
 *  Parcours GitLab d'un formulaire : détection de l'instance, authentification,
 *  choix du compte, puis chargement du projet.
 *  Un jeton personnel reste dans le formulaire jusqu'à son transfert vers le main.
 */
export function useProjetGitLab(
  etat: { enCours: Ref<boolean>; erreur: Ref<string | null> },
  api: ApiGitLabTestable = apiReelle(),
  preparerProjet: ApiGitLab['preparerProjet'] = (demande) =>
    window.sonal.gitlab.preparerProjet(demande),
) {
  const urlProjet = ref('')
  const projet = ref<ProjetGitLabPrepare | null>(null)
  const chargement = ref(false)
  const connexion = ref<ConnexionGitLabPublique | null>(null)
  const instance = ref('')
  const clientId = ref('')
  const authentification = ref<AuthentificationGitLab>('oauth')
  const jetonPersonnel = ref('')
  const connexionEnCours = ref(false)
  const compteChoisi = ref<string | null>(null)
  let generation = 0
  let actif = true

  const comptes = computed(() => (connexion.value?.comptes ?? [])
    .filter((compte) => compte.authentification === authentification.value))
  const compteCourant = computed(
    () => comptes.value.find((compte) => compte.id === compteChoisi.value) ?? null,
  )
  const pretConnexion = computed(
    () => Boolean(instance.value) && !connexionEnCours.value && !etat.enCours.value,
  )

  watch([urlProjet, instance], () => {
    generation += 1
    projet.value = null
    etat.erreur.value = null
  }, { flush: 'sync' })

  /** Un compte déjà connecté sur l'instance est repris automatiquement. */
  function choisirCompteParDefaut(): void {
    if (
      compteChoisi.value &&
      comptes.value.some((compte) => compte.id === compteChoisi.value && compte.connecte)
    ) return
    compteChoisi.value = comptes.value.find((compte) => compte.connecte)?.id ?? null
  }

  watch(connexion, () => choisirCompteParDefaut())
  watch(authentification, () => {
    projet.value = null
    compteChoisi.value = null
    choisirCompteParDefaut()
    etat.erreur.value = null
  })

  onScopeDispose(() => {
    actif = false
    generation += 1
  })

  const demande = computed<DemandeOuvertureGitLab | null>(() => (
    projet.value && compteChoisi.value
      ? { ...projet.value, compteId: compteChoisi.value }
      : null
  ))

  /** Détecte l'instance depuis l'adresse du projet, puis lit son état. */
  async function detecter(): Promise<void> {
    const url = urlProjet.value.trim()
    if (!url) {
      instance.value = ''
      connexion.value = null
      return
    }
    const courante = ++generation
    try {
      const detectee = await api.detecterInstance(url)
      if (!actif || courante !== generation) return
      instance.value = detectee ?? ''
      await rafraichirEtat()
    } catch (e) {
      if (actif && courante === generation) {
        etat.erreur.value = e instanceof Error ? e.message : 'Instance GitLab introuvable.'
      }
    }
  }

  async function rafraichirEtat(): Promise<void> {
    if (!instance.value) {
      connexion.value = null
      return
    }
    const cible = instance.value
    const courant = await api.etat(cible)
    if (!actif || cible !== instance.value) return
    connexion.value = courant
    choisirCompteParDefaut()
  }

  /** Ouvre le navigateur GitLab et attend le retour du consentement. */
  async function connecter(): Promise<boolean> {
    if (!pretConnexion.value || !instance.value) return false
    connexionEnCours.value = true
    etat.erreur.value = null
    try {
      const resultat = authentification.value === 'oauth'
        ? await api.connecter(instance.value, clientId.value.trim() || undefined)
        : await api.connecterAvecJeton(instance.value, jetonPersonnel.value)
      connexion.value = resultat
      if (authentification.value === 'oauth') clientId.value = ''
      else jetonPersonnel.value = ''
      choisirCompteParDefaut()
      await rafraichirEtat()
      return compteCourant.value?.connecte === true
    } catch (e) {
      etat.erreur.value = e instanceof Error
        ? e.message
        : 'Connexion à GitLab impossible.'
      return false
    } finally {
      connexionEnCours.value = false
    }
  }

  async function deconnecter(): Promise<void> {
    const compte = compteCourant.value
    if (!compte || !instance.value) return
    connexionEnCours.value = true
    etat.erreur.value = null
    try {
      connexion.value = await api.deconnecter(instance.value, compte.utilisateur)
      compteChoisi.value = comptes.value.find((c) => c.connecte)?.id ?? null
      projet.value = null
    } catch (e) {
      etat.erreur.value = e instanceof Error
        ? e.message
        : 'Déconnexion GitLab impossible.'
    } finally {
      connexionEnCours.value = false
    }
  }

  async function charger(): Promise<boolean> {
    if (etat.enCours.value || connexionEnCours.value || !urlProjet.value.trim()) return false
    // L'adresse peut avoir été collée puis le bouton final cliqué directement.
    if (!instance.value || !urlProjet.value.trim().startsWith(instance.value)) {
      await detecter()
    }
    if (!instance.value) {
      etat.erreur.value = 'Instance GitLab introuvable à partir de cette adresse.'
      return false
    }
    if (!compteCourant.value?.connecte) {
      if (
        authentification.value === 'oauth' &&
        connexion.value &&
        !connexion.value.applicationConnue &&
        !clientId.value.trim()
      ) {
        etat.erreur.value =
          'Saisissez le Client ID de l’application Sonal configurée sur cette instance.'
        return false
      }
      if (!await connecter()) return false
    }
    if (!compteChoisi.value) {
      etat.erreur.value = 'La connexion GitLab n’a renvoyé aucun compte utilisable.'
      return false
    }
    const courante = ++generation
    projet.value = null
    etat.erreur.value = null
    etat.enCours.value = true
    chargement.value = true
    try {
      const resultat = await preparerProjet({
        urlProjet: urlProjet.value.trim(),
        compteId: compteChoisi.value,
      })
      // Une réponse tardive ne doit pas réactiver un ancien projet.
      if (actif && courante === generation) projet.value = resultat
      return actif && courante === generation
    } catch (erreur) {
      if (actif && courante === generation) {
        etat.erreur.value = erreur instanceof Error
          ? erreur.message
          : 'Chargement du projet GitLab impossible.'
      }
      return false
    } finally {
      if (actif) {
        chargement.value = false
        etat.enCours.value = false
      }
    }
  }

  return {
    urlProjet,
    projet,
    demande,
    chargement,
    instance,
    clientId,
    authentification,
    jetonPersonnel,
    connexion,
    comptes,
    compteChoisi,
    compteCourant,
    connexionEnCours,
    pretConnexion,
    detecter,
    rafraichirEtat,
    connecter,
    deconnecter,
    charger,
  }
}
