// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import RenommageVarianteAnon from '../src/renderer/components/traiter/corpus/RenommageVarianteAnon.vue'
import { inventorierRenommageAnon, type ApercuRenommageAnon, type SuiviRenommageAnon, type BilanRenommageAnon } from '../src/shared/corpus/renommageAnon'
import { fixtureRenommageAnon } from './fixtures/renommageAnon'
const apps: App[] = []
afterEach(() => { apps.splice(0).forEach((a) => a.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals() })
async function rendu() { for (let n = 0; n < 12; n++) { await Promise.resolve(); await nextTick() } }
function bouton(texte: string) {
  const b = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === texte)
  if (!b) throw new Error('Bouton attendu absent.')
  return b
}
async function monter(disponible = true, fournisseur?: 'local' | 'gitlab' | 'webdav', nouveauPseudo?: string) {
  const f = fixtureRenommageAnon()
  const apercu: ApercuRenommageAnon = { ...inventorierRenommageAnon(f.corpus, f.sources, f.demande), token: 'jeton-prive', lecture: 'local', applicationDisponible: true }
  const api = { apercuRenommageAnon: vi.fn(async () => structuredClone(apercu)),
    renommerVarianteAnon: vi.fn(async (): Promise<BilanRenommageAnon> => ({ annotations: 4, incluses: 2, entretiens: 2, definitionModifiee: true })),
    suiviRenommageAnon: vi.fn(async (): Promise<SuiviRenommageAnon | null> => null),
    apercuRepriseRenommageAnon: vi.fn(async (): Promise<ApercuRenommageAnon> => ({ ...structuredClone(apercu), lecture: 'gitlab' as const, reprise: 'lot' })) }
  vi.stubGlobal('sonal', { corpus: api })
  const termine = vi.fn(), activite = vi.fn(), fermer = vi.fn()
  const conteneur = document.createElement('div'); document.body.append(conteneur)
  const app = createApp(RenommageVarianteAnon, { regle: f.corpus.reglesAnon.personne, ancienPseudo: 'Claire', nouveauPseudo, disponible, fournisseur, onTermine: termine, onActivite: activite, onFermer: fermer })
  apps.push(app); app.mount(conteneur); await rendu()
  return { app, api, apercu, termine, activite, fermer }
}
function nouveau(valeur: string) { const e = document.querySelector('textarea')!; e.value = valeur; e.dispatchEvent(new Event('input', { bubbles: true })) }
async function preparer() { nouveau('Nouvelle'); await rendu(); bouton('Préparer l’inventaire').click(); await rendu() }
async function confirmer() { document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); await rendu() }
function detruire(app: App) { app.unmount(); apps.splice(apps.indexOf(app), 1) }

test('saisie transmise au bilan ; un slash ne peut pas devenir un pseudonyme littéral par renommage', async () => {
  const b = await monter(true, 'local', 'Nouvelle')
  expect(document.querySelector('textarea')!.value).toBe('Nouvelle')
  bouton('Préparer l’inventaire').click(); await rendu()
  expect(b.api.apercuRenommageAnon).toHaveBeenCalledExactlyOnceWith({ regleId: 'personne', ancienPseudo: 'Claire', nouveauPseudo: 'Nouvelle' })
  nouveau('Claire / Rebecca'); await rendu(); bouton('Préparer l’inventaire').click(); await rendu()
  expect(b.api.apercuRenommageAnon).toHaveBeenCalledTimes(1)
  expect(document.querySelector('[role=alert]')!.textContent).toContain('champ Pseudonymes')
  expect(document.querySelector('input[type=checkbox]')).toBeNull()
})

test('les refus IPC restent lisibles sans le préfixe technique Electron', async () => {
  const b = await monter(true, 'webdav'); b.apercu.lecture = 'webdav'
  b.api.apercuRenommageAnon.mockRejectedValueOnce(new Error("Error invoking remote method 'corpus:apercuRenommageAnon': Error: Actualisez le corpus pour relire la publication incertaine."))
  await preparer()
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('Actualisez le corpus pour relire la publication incertaine.')
  await preparer(); await confirmer()
  b.api.renommerVarianteAnon.mockRejectedValueOnce(new Error("Error invoking remote method 'corpus:renommerVarianteAnon': Error: La cible a changé. Recalculez la reprise."))
  bouton('Confirmer le renommage global').click(); await rendu()
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('La cible a changé. Recalculez la reprise.')
})
test('inventaire explicite, seules les cibles liées ; confirmation obligatoire et double envoi refusé', async () => {
  const b = await monter(); await preparer()
  expect(b.api.apercuRenommageAnon).toHaveBeenCalledWith({ regleId: 'personne', ancienPseudo: 'Claire', nouveauPseudo: 'Nouvelle' })
  expect(document.body.textContent).toContain('4 annotation(s) à renommer, dont 2 masquée(s)')
  expect(document.body.textContent).toContain('aucune fusion')
  expect(bouton('Confirmer le renommage global').disabled).toBe(true)
  await confirmer()
  let terminer!: (v: Awaited<ReturnType<typeof b.api.renommerVarianteAnon>>) => void
  b.api.renommerVarianteAnon.mockImplementation(() => new Promise((resolve) => { terminer = resolve }))
  bouton('Confirmer le renommage global').click()
  await rendu(); bouton('Préparer l’inventaire').click()
  expect(b.api.renommerVarianteAnon).toHaveBeenCalledExactlyOnceWith('jeton-prive', true)
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  document.querySelector('[role="dialog"]')!.dispatchEvent(escape)
  expect(escape.defaultPrevented).toBe(true); expect(b.fermer).not.toHaveBeenCalled()
  terminer({ annotations: 4, incluses: 2, entretiens: 2, definitionModifiee: true }); await rendu()
  expect(b.termine).toHaveBeenCalledTimes(1)
})
test('modifier le libellé invalide immédiatement l’inventaire et le consentement', async () => {
  const b = await monter(); await preparer(); await confirmer()
  const appliquer = bouton('Confirmer le renommage global')
  nouveau('Autre intention'); appliquer.click(); await rendu()
  expect(b.api.renommerVarianteAnon).not.toHaveBeenCalled()
  expect(document.querySelector('input[type="checkbox"]')).toBeNull()
})
test('un refus concurrent ne garde ni jeton ni confirmation ; une préparation neuve est nécessaire', async () => {
  const b = await monter(); await preparer(); await confirmer()
  b.api.renommerVarianteAnon.mockRejectedValue(new Error('Un entretien a changé. Recalculez le renommage.'))
  bouton('Confirmer le renommage global').click(); await rendu()
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('Recalculez')
  expect(document.querySelector('input[type="checkbox"]')).toBeNull()
  bouton('Préparer l’inventaire').click(); await rendu()
  expect(bouton('Confirmer le renommage global').disabled).toBe(true)
  expect(b.termine).not.toHaveBeenCalled()
})
test.each(['obstacle', 'session', 'lecture-seule', 'inchange'] as const)('aucune application sans préparation qualifiée : %s', async (cas) => {
  const b = await monter(cas !== 'lecture-seule')
  if (cas === 'obstacle') { b.apercu.faisable = false; b.apercu.obstacles.push({ code: 'annotation-invalide', entretienId: 'e1', annotationId: 'a0' }) }
  if (cas === 'session') b.apercu.applicationDisponible = false
  if (cas === 'inchange') b.apercu.definitionModifiee = false
  await preparer()
  if (cas === 'lecture-seule') expect(b.api.apercuRenommageAnon).not.toHaveBeenCalled()
  else { expect(document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled).toBe(true); bouton('Confirmer le renommage global').click() }
  expect(b.api.renommerVarianteAnon).not.toHaveBeenCalled()
})
test('GitLab décrit les baux ciblés et le lot non atomique, jamais une transaction locale', async () => {
  const b = await monter(); b.apercu.lecture = 'gitlab'
  await preparer()
  expect(document.body.textContent).toContain('un commit publié, jamais le miroir')
  expect(document.body.textContent).toContain('seuls ceux à modifier reçoivent des baux courts')
  expect(document.body.textContent).toContain('le lot n’est pas atomique')
  expect(document.body.textContent).toContain('sans rejouer le renommage')
  expect(document.body.textContent).not.toContain('Publication locale par journal durable')
})
test('suivi indisponible : aucun aperçu ni reprise avant une nouvelle lecture', async () => {
  const b = await monter(); b.api.suiviRenommageAnon.mockRejectedValue(new Error('Réseau'))
  b.api.renommerVarianteAnon.mockRejectedValue(new Error('Publication refusée'))
  await preparer(); await confirmer(); bouton('Confirmer le renommage global').click(); await rendu()
  expect(document.body.textContent).toContain('Suivi indisponible')
  expect(bouton('Préparer l’inventaire').disabled).toBe(true)
  b.api.suiviRenommageAnon.mockResolvedValue(null)
  bouton('Relire le suivi GitLab').click(); await rendu()
  expect(bouton('Préparer l’inventaire').disabled).toBe(false)
})
test('succès partiel : pas de fermeture ni annonce de fin ; reprise fraîche avec nouveau consentement', async () => {
  const b = await monter(); await preparer(); await confirmer()
  b.api.renommerVarianteAnon.mockResolvedValue({ annotations: 2, incluses: 1, entretiens: 1, definitionModifiee: true, statut: 'partiel', operationId: 'lot' })
  b.api.suiviRenommageAnon.mockResolvedValue({ operationId: 'lot', demande: { regleId: 'personne', ancienPseudo: 'Claire', nouveauPseudo: 'Nouvelle' },
    bilan: { annotations: 2, incluses: 1, entretiens: 1, definitionModifiee: true, statut: 'partiel' }, indeterminee: false,
    cibles: [{ id: 'e2', etat: 'a-faire', motif: 'Tenue par un autre poste' }] })
  bouton('Confirmer le renommage global').click(); await rendu()
  expect(b.termine).not.toHaveBeenCalled(); expect(document.body.textContent).toContain('Lot GitLab à reprendre')
  expect(document.body.textContent).toContain('Tenue par un autre poste')
  expect(document.querySelector('textarea')!.disabled).toBe(true)
  bouton('Recalculer la reprise').click(); await rendu()
  expect(b.api.apercuRepriseRenommageAnon).toHaveBeenCalledExactlyOnceWith('lot')
  expect(bouton('Confirmer le renommage global').disabled).toBe(true)
  await confirmer(); b.api.renommerVarianteAnon.mockResolvedValue({ annotations: 4, incluses: 2, entretiens: 2, definitionModifiee: true, statut: 'termine' })
  bouton('Confirmer le renommage global').click(); await rendu()
  expect(b.termine).toHaveBeenCalledOnce()
})
test.each(['inventaire', 'application'] as const)('réponse tardive après destruction pendant %s : aucune annonce ni relance', async (phase) => {
  const b = await monter()
  let terminer!: () => void
  if (phase === 'inventaire') {
    b.api.apercuRenommageAnon.mockImplementation(() => new Promise((resolve) => { terminer = () => resolve(b.apercu) }))
    nouveau('Nouvelle'); await rendu(); bouton('Préparer l’inventaire').click(); await rendu()
  } else {
    await preparer(); await confirmer()
    b.api.renommerVarianteAnon.mockImplementation(() => new Promise((resolve) => { terminer = () => resolve({ annotations: 4, incluses: 2, entretiens: 2, definitionModifiee: true }) }))
    bouton('Confirmer le renommage global').click(); await rendu()
  }
  detruire(b.app); terminer(); await rendu()
  expect(b.termine).not.toHaveBeenCalled(); expect(b.activite.mock.calls.at(-1)).toEqual([false])
})

test('WebDAV explique les PUT conditionnels ciblés et n’annonce ni commit ni journal local', async () => {
  const b = await monter(true, 'webdav'); b.apercu.lecture = 'webdav'
  await preparer()
  expect(document.body.textContent).toContain('fichiers publiés sur le serveur, jamais le miroir')
  expect(document.body.textContent).toContain('sa seule cible')
  expect(document.body.textContent).toContain('chaque PUT reste conditionnel')
  expect(document.body.textContent).not.toContain('commit publié')
  expect(document.body.textContent).not.toContain('Publication locale par journal durable')
})
test('WebDAV indéterminé : suivi privé, pas de succès ; reprise nécessite nouveau consentement', async () => {
  const b = await monter(true, 'webdav'); b.apercu.lecture = 'webdav'
  await preparer(); await confirmer()
  b.api.renommerVarianteAnon.mockResolvedValue({ annotations: 0, incluses: 0, entretiens: 0, definitionModifiee: true, statut: 'indetermine' })
  b.api.suiviRenommageAnon.mockResolvedValue({ operationId: 'lot', fournisseur: 'webdav', demande: b.apercu.demande,
    bilan: { annotations: 0, incluses: 0, entretiens: 0, definitionModifiee: true, statut: 'indetermine' }, indeterminee: true,
    cibles: [{ id: 'e1', etat: 'a-faire' }] })
  b.api.apercuRepriseRenommageAnon.mockResolvedValue({ ...b.apercu, reprise: 'lot', token: 'jeton-reprise' })
  bouton('Confirmer le renommage global').click(); await rendu()
  expect(b.termine).not.toHaveBeenCalled()
  expect(document.body.textContent).toContain('Lot WebDAV à reprendre')
  expect(document.body.textContent).toContain('Relire l’original ne prouve pas un refus')
  expect(document.body.textContent).toContain('jamais repris de force')
  bouton('Recalculer la reprise').click(); await rendu()
  expect(bouton('Confirmer le renommage global').disabled).toBe(true)
  await confirmer()
  b.api.renommerVarianteAnon.mockResolvedValue({ annotations: 4, incluses: 2, entretiens: 2, definitionModifiee: true, statut: 'termine' })
  bouton('Confirmer le renommage global').click(); await rendu()
  expect(b.api.renommerVarianteAnon).toHaveBeenLastCalledWith('jeton-reprise', true)
  expect(b.termine).toHaveBeenCalledOnce()
})
test('suivi WebDAV indisponible : le bouton du bon fournisseur bloque toute nouvelle préparation', async () => {
  const b = await monter(true, 'webdav'); b.apercu.lecture = 'webdav'
  await preparer(); await confirmer()
  b.api.suiviRenommageAnon.mockRejectedValue(new Error('Réseau'))
  b.api.renommerVarianteAnon.mockRejectedValue(new Error('Publication non confirmée'))
  bouton('Confirmer le renommage global').click(); await rendu()
  expect(bouton('Préparer l’inventaire').disabled).toBe(true)
  b.api.suiviRenommageAnon.mockResolvedValue(null)
  bouton('Relire le suivi WebDAV').click(); await rendu()
  expect(bouton('Préparer l’inventaire').disabled).toBe(false)
})
