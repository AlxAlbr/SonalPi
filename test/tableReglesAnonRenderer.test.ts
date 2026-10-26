// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { createApp, h, type App } from 'vue'
import TableReglesAnon from '../src/renderer/components/traiter/corpus/TableReglesAnon.vue'
import { matriceCapacites } from '../src/main/gitlab/politiqueGestes'

const apps: App[] = []
afterEach(() => { apps.splice(0).forEach((app) => app.unmount()); document.body.replaceChildren() })

test.each(['local', 'gitlab', 'webdav'] as const)('icônes V1 et noms accessibles, sans changer les capacités : %s', (fournisseur) => {
  for (const lectureSeule of [false, true]) {
    const capacites = matriceCapacites(fournisseur), dissocier = vi.fn(), supprimer = vi.fn(), modifier = vi.fn()
    const host = document.createElement('div'); document.body.append(host)
    const app = createApp({ render: () => h(TableReglesAnon, {
      lignes: [{ regle: { id: 'personne', entite: ['Karine'], pseudos: ['Claire'] } }],
      selection: null, tri: 'entite', descendant: false, frais: true,
      collisions: new Set<string>(), categories: [], lectureSeule,
      dissociationDisponible: capacites.dissociationGlobale,
      suppressionDisponible: capacites.suppressionAnonGlobale,
      ajoutVarianteDisponible: capacites.ajoutVarianteAnon, renommageDisponible: capacites.pseudonymisationGlobale,
      onDissocier: dissocier, onSupprimerPartout: supprimer, onModifierPseudos: modifier,
    }) })
    apps.push(app); app.mount(host)
    const fichier = host.querySelector<HTMLButtonElement>('[aria-label="Dissocier globalement Karine"]')!
    const croix = host.querySelector<HTMLButtonElement>('[aria-label="Supprimer partout Karine"]')!
    const variante = host.querySelector<HTMLButtonElement>('[aria-label="Modifier les pseudonymes de Karine"]')!
    expect(host.textContent).not.toContain('+ Variante')
    expect(variante.textContent).toBe('Claire')
    expect(variante.disabled).toBe(lectureSeule || !(capacites.ajoutVarianteAnon || capacites.pseudonymisationGlobale))
    variante.click()
    if (variante.disabled) expect(modifier).not.toHaveBeenCalled()
    else expect(modifier).toHaveBeenCalledExactlyOnceWith('personne')
    expect(fichier.textContent).toBe('📄'); expect(croix.textContent).toBe('✖')
    expect(fichier.firstElementChild!.getAttribute('aria-hidden')).toBe('true')
    expect(croix.firstElementChild!.getAttribute('aria-hidden')).toBe('true')
    expect(fichier.title).toBeTruthy(); expect(croix.title).toBeTruthy()
    expect(fichier.disabled).toBe(lectureSeule || !capacites.dissociationGlobale)
    expect(croix.disabled).toBe(lectureSeule || !capacites.suppressionAnonGlobale)
    fichier.click(); croix.click()
    if (fichier.disabled) expect(dissocier).not.toHaveBeenCalled()
    else expect(dissocier).toHaveBeenCalledExactlyOnceWith('personne')
    if (croix.disabled) expect(supprimer).not.toHaveBeenCalled()
    else expect(supprimer).toHaveBeenCalledExactlyOnceWith('personne')
  }
})
