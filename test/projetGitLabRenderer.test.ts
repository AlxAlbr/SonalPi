import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref, type EffectScope } from 'vue'
import { useProjetGitLab } from '../src/renderer/composables/corpus/useProjetGitLab'
import type { ApiGitLab, ProjetGitLabPrepare } from '../src/shared/gitlab'

const projet: ProjetGitLabPrepare = {
  urlInstance: 'https://gitlab.example.org',
  utilisateur: 'moi',
  projetId: 42,
  nomProjet: 'Corpus',
  branche: 'terrain',
}
const scopes: EffectScope[] = []
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
})

function formulaire(preparerProjet: ApiGitLab['preparerProjet'] = vi.fn(async () => projet)) {
  const scope = effectScope()
  scopes.push(scope)
  const etat = { enCours: ref(false), erreur: ref<string | null>(null) }
  const champs = scope.run(() => useProjetGitLab(etat, preparerProjet))!
  champs.urlProjet.value = '  https://gitlab.example.org/groupe/corpus  '
  champs.jeton.value = 'jeton-saisi'
  return { ...champs, ...etat, preparerProjet, scope }
}

describe('formulaire partagé de projet GitLab', () => {
  it('prépare une demande commune à la création et à l’ouverture avec la branche renvoyée', async () => {
    const f = formulaire()
    expect(f.demande.value).toBeNull()
    await f.charger()
    expect(f.preparerProjet).toHaveBeenCalledExactlyOnceWith({
      urlProjet: 'https://gitlab.example.org/groupe/corpus', jeton: 'jeton-saisi',
    })
    expect(f.projet.value).toEqual(projet)
    expect(f.demande.value).toEqual({ ...projet, jeton: 'jeton-saisi', racine: '' })
    expect(f.erreur.value).toBeNull()
    expect(f.enCours.value).toBe(false)
    f.racine.value = ' donnees/corpus '
    expect(f.demande.value?.racine).toBe('donnees/corpus')
    expect(f.preparerProjet).toHaveBeenCalledTimes(1)
  })

  it.each(['urlProjet', 'jeton'] as const)('invalide immédiatement le projet quand %s change', async (champ) => {
    const f = formulaire()
    await f.charger()
    f[champ].value += '-autre'
    expect(f.projet.value).toBeNull()
    expect(f.demande.value).toBeNull()
  })

  it('efface la précédente préparation avant un rechargement qui échoue', async () => {
    const preparer = vi.fn<ApiGitLab['preparerProjet']>()
      .mockResolvedValueOnce(projet)
      .mockRejectedValueOnce(new Error('Projet inaccessible.'))
    const f = formulaire(preparer)
    await f.charger()
    const attente = f.charger()
    expect(f.demande.value).toBeNull()
    expect(f.enCours.value).toBe(true)
    expect(f.chargement.value).toBe(true)
    await attente
    expect(f.demande.value).toBeNull()
    expect(f.erreur.value).toBe('Projet inaccessible.')
    expect(f.enCours.value).toBe(false)
    expect(f.chargement.value).toBe(false)
  })

  it('ignore une réponse devenue obsolète et permet ensuite un nouveau chargement', async () => {
    const attente = Promise.withResolvers<ProjetGitLabPrepare>()
    const preparer = vi.fn<ApiGitLab['preparerProjet']>()
      .mockReturnValueOnce(attente.promise)
      .mockResolvedValueOnce({ ...projet, projetId: 84 })
    const f = formulaire(preparer)
    const chargement = f.charger()
    f.urlProjet.value = 'https://gitlab.example.org/groupe/autre'
    attente.resolve(projet)
    await chargement
    expect(f.demande.value).toBeNull()
    expect(f.enCours.value).toBe(false)
    await f.charger()
    expect(f.demande.value?.projetId).toBe(84)
  })

  it('ignore aussi une erreur devenue obsolète après changement de jeton', async () => {
    const attente = Promise.withResolvers<ProjetGitLabPrepare>()
    const f = formulaire(() => attente.promise)
    const chargement = f.charger()
    f.jeton.value = 'autre-jeton'
    attente.reject(new Error('Ancien jeton refusé.'))
    await chargement
    expect(f.erreur.value).toBeNull()
    expect(f.demande.value).toBeNull()
  })

  it('ne lance pas de chargements concurrents', async () => {
    const attente = Promise.withResolvers<ProjetGitLabPrepare>()
    const preparer = vi.fn(() => attente.promise)
    const f = formulaire(preparer)
    const chargement = f.charger()
    await f.charger()
    expect(preparer).toHaveBeenCalledTimes(1)
    attente.resolve(projet)
    await chargement
  })

  it.each(['urlProjet', 'jeton'] as const)('ne charge rien sans %s', async (champ) => {
    const f = formulaire()
    f[champ].value = ''
    await f.charger()
    expect(f.preparerProjet).not.toHaveBeenCalled()
    expect(f.enCours.value).toBe(false)
  })

  it('ne charge rien pendant une autre opération du formulaire', async () => {
    const f = formulaire()
    f.enCours.value = true
    await f.charger()
    expect(f.preparerProjet).not.toHaveBeenCalled()
    expect(f.enCours.value).toBe(true)
  })

  it('ignore une réponse après fermeture du formulaire', async () => {
    const attente = Promise.withResolvers<ProjetGitLabPrepare>()
    const f = formulaire(() => attente.promise)
    const chargement = f.charger()
    f.scope.stop()
    attente.resolve(projet)
    await chargement
    expect(f.projet.value).toBeNull()
    expect(f.erreur.value).toBeNull()
  })

  it('isole les saisies de deux formulaires', async () => {
    const premier = formulaire()
    const second = formulaire()
    await premier.charger()
    expect(premier.demande.value).not.toBeNull()
    expect(second.demande.value).toBeNull()
    second.jeton.value = 'autre-jeton'
    expect(premier.demande.value?.jeton).toBe('jeton-saisi')
  })
})
