import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

// Lance Vitest depuis un dossier dont la lettre de lecteur est en majuscule.
// Sous Windows, un terminal ouvert en « c:\… » est fréquent (VS Code).
// Vitest y est alors chargé deux fois : aucun test ne trouve sa suite.
const dossier = process.cwd().replace(/^([a-z]):/, (_, lettre) => `${lettre.toUpperCase()}:`)
const vitest = join(dossier, 'node_modules', 'vitest', 'vitest.mjs')

const resultat = spawnSync(process.execPath, [vitest, ...process.argv.slice(2)], {
  cwd: dossier,
  stdio: 'inherit',
})
process.exit(resultat.status ?? 1)
