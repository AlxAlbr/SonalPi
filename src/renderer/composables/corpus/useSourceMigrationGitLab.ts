import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import { CONNEXION_MIGRATION_GITLAB_REQUISE, type DemandeSourceMigrationGitLab } from '../../../shared/corpus/migrationGitLab'
import type { ApiGitLab, DestinationGitLabPublic, ProjetGitLabPrepare } from '../../../shared/gitlab'
import { useProjetGitLab, type ApiGitLabTestable } from './useProjetGitLab'

/** Choisit une source connue ou une nouvelle adresse, en réutilisant ses accès. */
export function useSourceMigrationGitLab(
  etat: { enCours: Ref<boolean>; erreur: Ref<string | null> },
  chargerSource: (demande: DemandeSourceMigrationGitLab) => Promise<ProjetGitLabPrepare>,
  abandonner: () => void,
  api: ApiGitLabTestable & Pick<ApiGitLab, 'lister'> = window.sonal.gitlab,
) {
  const projet = useProjetGitLab(etat, api, chargerSource)
  const destinations = ref<DestinationGitLabPublic[]>([])
  const destinationId = ref('')
  const destination = computed(() => destinations.value.find((d) => d.id === destinationId.value) ?? null)
  const selectionEnCours = ref(false)
  const connexionAReprendre = ref(false)
  let actif = true
  let generation = 0

  watch([projet.urlProjet, projet.compteChoisi, projet.authentification], abandonner, { flush: 'sync' })
  watch(projet.urlProjet, () => { generation += 1; connexionAReprendre.value = false }, { flush: 'sync' })
  watch(destinationId, () => {
    abandonner()
    connexionAReprendre.value = false
    const courante = ++generation
    selectionEnCours.value = true
    void projet.utiliserConnexionEnregistree(destination.value).catch((erreur) => {
      if (actif && courante === generation) {
        etat.erreur.value = erreur instanceof Error ? erreur.message : 'Les accès GitLab ne peuvent pas être lus.'
      }
    }).finally(() => {
      if (actif && courante === generation) selectionEnCours.value = false
    })
  }, { flush: 'sync' })

  onScopeDispose(() => { actif = false; generation += 1 })

  async function chargerDestinations(): Promise<void> {
    try {
      const liste = await api.lister()
      if (actif) destinations.value = liste
    } catch (erreur) {
      if (actif) etat.erreur.value = erreur instanceof Error ? erreur.message : 'Les projets enregistrés ne peuvent pas être lus.'
    }
  }

  async function expliquerEchec(message: string): Promise<void> {
    const courante = generation
    await projet.rafraichirEtat().catch(() => undefined)
    if (!actif || courante !== generation) return
    connexionAReprendre.value = message.includes(CONNEXION_MIGRATION_GITLAB_REQUISE)
    etat.erreur.value = connexionAReprendre.value ? CONNEXION_MIGRATION_GITLAB_REQUISE : message
  }

  async function charger(): Promise<boolean> {
    if (selectionEnCours.value || etat.enCours.value || projet.connexionEnCours.value) return false
    if (!destinationId.value) {
      if (connexionAReprendre.value) {
        if (!await projet.connecter()) return false
        connexionAReprendre.value = false
      }
      const charge = await projet.charger()
      if (!charge && etat.erreur.value) await expliquerEchec(etat.erreur.value)
      return charge
    }
    const choisie = destination.value
    if (!choisie) {
      etat.erreur.value = 'Ce projet GitLab n’est plus enregistré sur ce poste.'
      return false
    }
    const courante = generation
    if (!projet.compteCourant.value?.connecte || connexionAReprendre.value) {
      if (!await projet.connecter()) {
        if (actif && courante === generation && !etat.erreur.value) {
          etat.erreur.value = `Connectez-vous avec le compte « ${choisie.utilisateur} » de ce projet.`
        }
        return false
      }
      connexionAReprendre.value = false
    }
    if (!actif || courante !== generation) return false
    etat.enCours.value = true
    projet.chargement.value = true
    etat.erreur.value = null
    try {
      await chargerSource({ destinationId: choisie.id })
      return actif && courante === generation
    } catch (erreur) {
      if (actif && courante === generation) {
        await expliquerEchec(erreur instanceof Error ? erreur.message : 'Lecture de la source impossible.')
      }
      return false
    } finally {
      if (actif) {
        etat.enCours.value = false
        projet.chargement.value = false
      }
    }
  }

  return { ...projet, destinations, destinationId, destination, selectionEnCours, connexionAReprendre, chargerDestinations, charger }
}
