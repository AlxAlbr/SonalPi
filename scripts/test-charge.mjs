import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const aide = `
Test de charge SonalPi2

Usage : npm run test:charge -- [options]

Options :
  --tailles 20000,80000,200000   Nombre de caractères des entretiens.
  --annotations 0,250,1000       Nombre d'annotations présentes.
  --corrections 9                Nombre de frappes mesurées par scénario.
  --seuil 200                    P95 en ms à partir duquel l'usage est délicat.
  --seuil-ouverture 3000         Seuil indicatif d'ouverture en ms.
  --sans-build                   Réutilise le build Electron existant.
  --aide                         Affiche cette aide.
`

const correspondances = {
  '--tailles': 'CHARGE_TAILLES',
  '--annotations': 'CHARGE_ANNOTATIONS',
  '--corrections': 'CHARGE_CORRECTIONS',
  '--seuil': 'CHARGE_SEUIL_MS',
  '--seuil-ouverture': 'CHARGE_SEUIL_OUVERTURE_MS',
}

const env = { ...process.env }
let construire = true
for (let i = 0; i < process.argv.slice(2).length; i++) {
  const argument = process.argv.slice(2)[i]
  if (argument === '--aide' || argument === '-h') {
    console.log(aide)
    process.exit(0)
  }
  if (argument === '--sans-build') {
    construire = false
    continue
  }
  const variable = correspondances[argument]
  if (!variable) {
    console.error(`Option inconnue : ${argument}.${aide}`)
    process.exit(2)
  }
  const valeur = process.argv.slice(2)[++i]
  if (!valeur || valeur.startsWith('--')) {
    console.error(`Valeur manquante pour ${argument}.${aide}`)
    process.exit(2)
  }
  env[variable] = valeur
}

function executer(commande, args) {
  const resultat = spawnSync(commande, args, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (resultat.error) {
    console.error(resultat.error.message)
    process.exit(1)
  }
  if (resultat.signal) {
    console.error(`Commande interrompue par ${resultat.signal}.`)
    process.exit(1)
  }
  if (resultat.status !== 0) process.exit(resultat.status ?? 1)
}

if (construire) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  executer(npm, ['run', 'build'])
}

const executable = join(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'playwright.cmd' : 'playwright',
)
if (!existsSync(executable)) {
  console.error('Playwright est absent. Exécutez npm install avant le test.')
  process.exit(1)
}
executer(executable, ['test', '--config=playwright.charge.config.ts'])
