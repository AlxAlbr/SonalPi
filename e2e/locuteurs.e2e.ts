import { test, expect } from '@playwright/test'
import { ouvrir, coderTheme, selectionner } from './util'

/**
 * ÉTAPE 4 — locuteurs. Critères DEMARRAGE : (1) attribuer le loc d'un bloc =
 * commande de domaine (transaction PM sur l'attribut, pas une retouche de texte) ;
 * (2) renommer un locuteur → répercuté sur tous ses blocs SANS toucher aux blocs
 * (référence par index) ; (3) tour de parole DÉRIVÉ (blocs consécutifs de même loc
 * groupés) ; + scission (Entrée) qui hérite le loc (D2).
 *
 * Seed : bloc 1 = Enquêteur (loc 1), bloc 2 = Karine (loc 2).
 */

const gouttiere = (t: string) => `.editeur .gouttiere-loc:text-is("${t}")`

/** Ouvre l'onglet Locuteurs (le panneau est masqué par défaut = onglet Thèmes). */
async function ongletLocuteurs(page: import('@playwright/test').Page) {
  await page.locator('.onglets button', { hasText: 'Loc' }).click()
}

test('la gouttière affiche le nom du locuteur devant chaque tour', async () => {
  const { app, page } = await ouvrir('sonal-loc-')
  await expect(page.locator(gouttiere('Enquêteur'))).toHaveCount(1)
  await expect(page.locator(gouttiere('Karine'))).toHaveCount(1)
  await app.close()
})

test('interrupteur « ? » : un interviewer a ses tours en italique et son label « Nom ? »', async () => {
  const { app, page } = await ouvrir('sonal-loc-')
  await ongletLocuteurs(page)

  // Déclarer « Enquêteur » (index 1) interviewer → son tour passe en italique
  // (classe bloc-interviewer) et la gouttière reprend la convention « Nom ? ».
  await page.locator('.liste-loc .interv').first().click()
  await expect(page.locator('.editeur .bloc-interviewer')).toHaveCount(1)
  await expect(page.locator('.editeur .bloc-interviewer')).toContainText('Karine habite Lyon')
  await expect(page.locator(gouttiere('Enquêteur ?'))).toHaveCount(1)

  // Re-clic = retour à la normale (l'inverse est le même interrupteur).
  await page.locator('.liste-loc .interv').first().click()
  await expect(page.locator('.editeur .bloc-interviewer')).toHaveCount(0)
  await expect(page.locator(gouttiere('Enquêteur'))).toHaveCount(1)
  await app.close()
})

test('croix ✕ : supprimer un locuteur (confirmation) → ses tours passent à « aucun »', async () => {
  const { app, page } = await ouvrir('sonal-loc-')
  await ongletLocuteurs(page)

  // ✕ sur « Karine » (2e ligne) → bannière de confirmation avec le compte.
  await page.locator('.liste-loc .x-loc').nth(1).click()
  await expect(page.locator('.panneau .confirm-suppr')).toContainText('Karine')
  await expect(page.locator('.panneau .confirm-suppr')).toContainText('1 bloc(s)')
  await page.locator('.confirm-actions .danger').click()

  // La liste n'a plus qu'une entrée ; son tour est désattribué (gouttière vide),
  // le TEXTE n'a pas bougé (loc = attribut de bloc, pas une retouche).
  await expect(page.locator('.liste-loc li')).toHaveCount(1)
  await expect(page.locator(gouttiere('Karine'))).toHaveCount(0)
  await expect(page.locator('.editeur .gouttiere-loc.vide')).toHaveCount(1)
  await expect(page.locator('.editeur')).toContainText('Elle parle souvent de son travail')

  // Annuler existe aussi : ✕ sur le survivant puis Annuler → rien ne bouge.
  await page.locator('.liste-loc .x-loc').first().click()
  await page.locator('.confirm-actions button', { hasText: 'Annuler' }).click()
  await expect(page.locator('.liste-loc li')).toHaveCount(1)
  await app.close()
})

test('attribuer un locuteur au bloc courant met à jour la gouttière (tour groupé)', async () => {
  const { app, page } = await ouvrir('sonal-loc-')
  await ongletLocuteurs(page)

  // Curseur dans le bloc de Karine, puis on l'attribue à « Enquêteur ».
  await page.locator('.editeur p', { hasText: 'Elle parle' }).click()
  await page.locator('.boutons-loc .attr', { hasText: 'Enquêteur' }).click()

  // Les deux blocs sont maintenant loc 1 → un seul tour → « Karine » n'est plus
  // un libellé de tour (dérivé), « Enquêteur » reste en tête.
  await expect(page.locator(gouttiere('Karine'))).toHaveCount(0)
  await expect(page.locator(gouttiere('Enquêteur'))).toHaveCount(1)
  await app.close()
})

test('renommer un locuteur se répercute dans la gouttière, texte intact', async () => {
  const { app, page } = await ouvrir('sonal-loc-')
  await ongletLocuteurs(page)

  await page.locator('.nom-loc').first().fill('Chercheur') // locuteur index 1
  await page.keyboard.press('Tab') // blur → @change

  await expect(page.locator(gouttiere('Chercheur'))).toHaveCount(1)
  await expect(page.locator(gouttiere('Enquêteur'))).toHaveCount(0)
  // Le texte des blocs n'a PAS bougé (référence par index, pas de retouche).
  await expect(page.locator('.editeur')).toContainText('Karine habite Lyon')
  await app.close()
})

test('S4 — attribuer la sélection scinde le bloc et pose le locuteur sur le fragment couvert', async () => {
  const { app, page } = await ouvrir('sonal-loc-')
  await ongletLocuteurs(page)

  // Sélection d'une SOUS-PARTIE du bloc 1 (le mot « Lyon », loc 1 = Enquêteur).
  await selectionner(page, 'Lyon')

  // Le bouton devient dynamique : « …la sélection » (sélection non vide) — sert
  // aussi de barrière : PM a synchronisé la sélection dans son état.
  await expect(page.locator('.attribuer .lbl')).toHaveText('Attribuer la sélection :')

  await page.locator('.boutons-loc .attr', { hasText: 'Karine' }).click()

  // Le bloc 1 est scindé en 3 → 4 blocs au total ; seul « Lyon » passe à loc 2.
  // (Le texte du bloc inclut le libellé de gouttière du tour → on teste par contenu.)
  await expect(page.locator('.editeur p')).toHaveCount(4)
  const lyon = page.locator('.editeur p[data-loc="2"]', { hasText: 'Lyon' })
  await expect(lyon).toHaveCount(1)
  await expect(lyon).toContainText('Lyon')
  await expect(lyon).not.toContainText('habite')
  // Les fragments de tête/queue gardent l'Enquêteur (loc 1 ; aucune fusion — D-S2).
  await expect(page.locator('.editeur p[data-loc="1"]', { hasText: 'habite' })).toHaveCount(1)
  await expect(page.locator('.editeur p[data-loc="1"]', { hasText: 'retraite' })).toHaveCount(1)
  await app.close()
})

test('S4 — un passage codé survit à la scission par attribution (annotation intacte)', async () => {
  const { app, page } = await ouvrir('sonal-loc-')
  const ed = page.locator('.editeur')
  await ongletLocuteurs(page)

  // Code « Lyon » (thème Lieu) → décoration présente.
  await selectionner(page, 'Lyon')
  await expect(page.locator('.attribuer .lbl')).toHaveText('Attribuer la sélection :')
  await coderTheme(page, 'Lieu')
  await expect(ed.locator('.annot')).toHaveText('Lyon')

  // Attribue « Lyon » à Karine : le bloc est scindé autour du passage codé.
  await selectionner(page, 'Lyon')
  await ongletLocuteurs(page)
  await expect(page.locator('.attribuer .lbl')).toHaveText('Attribuer la sélection :')
  await page.locator('.boutons-loc .attr', { hasText: 'Karine' }).click()

  // Le codage tient : toujours surligné sur « Lyon », dans un bloc désormais loc 2.
  await expect(ed.locator('.annot')).toHaveText('Lyon')
  const lyon = ed.locator('p[data-loc="2"]', { hasText: 'Lyon' })
  await expect(lyon).toContainText('Lyon')
  await expect(lyon).not.toContainText('habite')
  await app.close()
})

test('scinder un bloc (Entrée) hérite le locuteur (tour non dupliqué)', async () => {
  const { app, page } = await ouvrir('sonal-loc-')

  // Fin du bloc 1 (Enquêteur), Entrée, on tape → nouveau bloc, même loc.
  await page.locator('.editeur p', { hasText: 'Karine habite' }).click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Suite du même tour.')

  // Le nouveau bloc hérite loc 1 → toujours un SEUL « Enquêteur » en tête de tour.
  await expect(page.locator('.editeur')).toContainText('Suite du même tour')
  await expect(page.locator(gouttiere('Enquêteur'))).toHaveCount(1)
  await expect(page.locator(gouttiere('Karine'))).toHaveCount(1)
  await app.close()
})
