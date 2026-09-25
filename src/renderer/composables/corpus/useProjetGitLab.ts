import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import type {
  ApiGitLab,
  DemandeOuvertureGitLab,
  ProjetGitLabPrepare,
} from '../../../shared/gitlab'

/** Prépare la même destination pour les formulaires de création et d'ouverture. */
export function useProjetGitLab(
  etat: { enCours: Ref<boolean>; erreur: Ref<string | null> },
  preparerProjet: ApiGitLab['preparerProjet'] = (demande) => window.sonal.gitlab.preparerProjet(demande),
) {
  const urlProjet = ref('')
  const jeton = ref('')
  const racine = ref('')
  const projet = ref<ProjetGitLabPrepare | null>(null)
  const chargement = ref(false)
  let generation = 0
  let actif = true

  watch([urlProjet, jeton], () => {
    generation += 1
    projet.value = null
    etat.erreur.value = null
  }, { flush: 'sync' })

  onScopeDispose(() => {
    actif = false
    generation += 1
  })

  const demande = computed<DemandeOuvertureGitLab | null>(() => projet.value ? {
    ...projet.value,
    jeton: jeton.value,
    racine: racine.value.trim(),
  } : null)

  async function charger(): Promise<void> {
    if (etat.enCours.value || !urlProjet.value.trim() || !jeton.value) return
    const courante = ++generation
    projet.value = null
    etat.erreur.value = null
    etat.enCours.value = true
    chargement.value = true
    try {
      const resultat = await preparerProjet({ urlProjet: urlProjet.value.trim(), jeton: jeton.value })
      // Une réponse tardive ne doit pas réactiver un ancien projet.
      if (actif && courante === generation) projet.value = resultat
    } catch (erreur) {
      if (actif && courante === generation) {
        etat.erreur.value = erreur instanceof Error ? erreur.message : 'Chargement du projet GitLab impossible.'
      }
    } finally {
      if (actif) {
        chargement.value = false
        etat.enCours.value = false
      }
    }
  }

  return { urlProjet, jeton, racine, projet, demande, chargement, charger }
}
