import type { ElectronApplication } from '@playwright/test'

export type ModeSondeMigration = 'normal' | 'copie' | 'ouverture' | 'perte'
export type SondeMigration = { mode: ModeSondeMigration; suspendue: boolean; publications: number; copies: number }

/** Seules les réponses sont suspendues ou perdues ; les services distants restent réels. */
export async function instrumenterMigration(app: ElectronApplication, projet: number, mode: ModeSondeMigration) {
  await app.evaluate((_electron, args) => {
    const g = globalThis as typeof globalThis & { sondeMigration: SondeMigration }
    const original = g.fetch
    g.sondeMigration = { mode: args.mode, suspendue: false, publications: 0, copies: 0 }
    g.fetch = async (input, init) => {
      const u = new URL(input instanceof Request ? input.url : String(input)), s = g.sondeMigration
      if (s.mode === 'perte' && s.publications && u.searchParams.has('search')) throw new Error('Historique temporairement indisponible pour la qualification.')
      const publication = u.pathname === `/api/v4/projects/${args.projet}/repository/commits` && init?.method === 'POST'
        && /"commit_message":"Sonal migration-[^"]+-pub-/.test(String(init.body))
      const copie = init?.method === 'PUT' && !u.pathname.startsWith('/api/v4/')
      const ouverture = s.publications > 0 && u.pathname.endsWith('/info/lfs/objects/batch')
        && JSON.parse(String(init?.body ?? '{}')).operation === 'download'
      const r = await original(input, init)
      if (publication && r.ok) {
        s.publications++
        if (s.mode === 'perte') { await r.body?.cancel(); throw new Error('Réponse de publication perdue pour la qualification.') }
      }
      if (copie && r.ok) s.copies++
      if (r.ok && ((s.mode === 'copie' && copie) || (s.mode === 'ouverture' && ouverture))) {
        s.suspendue = true
        await r.body?.cancel()
        await new Promise(() => {})
      }
      return r
    }
  }, { projet, mode })
}
export function lireSondeMigration(app: ElectronApplication) {
  return app.evaluate(() => (globalThis as typeof globalThis & { sondeMigration: SondeMigration }).sondeMigration)
}
export function retablirTransportMigration(app: ElectronApplication) {
  return app.evaluate(() => { (globalThis as typeof globalThis & { sondeMigration: SondeMigration }).sondeMigration.mode = 'normal' })
}
export async function tuerApplication(app: ElectronApplication) {
  const processus = app.process()
  const sortie = new Promise<void>((resolve) => processus.once('exit', () => resolve()))
  if (!processus.kill('SIGKILL')) throw new Error('Arrêt réel de l’application impossible.')
  await sortie
  if (processus.signalCode !== 'SIGKILL') throw new Error('Arrêt SIGKILL non confirmé.')
}
