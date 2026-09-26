/// <reference lib="dom" />
/**
 *  Qualification OAuth : piloter le consentement GitLab depuis Playwright.
 *
 *  Le main ouvre l'URL d'autorisation avec `shell.openExternal`, donc dans le
 *  navigateur du système — hors de portée de Playwright. Le banc intercepte
 *  alors le programme du système qui ouvre l'URL (`xdg-open` sous Linux) :
 *  il l'inscrit dans un fichier au lieu de lancer un navigateur, et le test
 *  pilote lui-même la page GitLab.
 *
 *  Rien n'est changé dans le produit : le flux testé est le vrai, authorize et
 *  échange PKCE compris. Le mot de passe du compte sert uniquement à se
 *  connecter au formulaire GitLab, comme le ferait la personne qui qualify.
 */

import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, type BrowserContext, type Page } from '@playwright/test'

/** Programme du système qui ouvre une URL, et où le remplacer. */
const OUVREUR = process.platform === 'darwin' ? 'open' : 'xdg-open'

export interface InterceptionOuvertureUrl {
  /** Répertoire à placer en tête du PATH du poste testé. */
  repertoire: string
  /** Fichier dans lequel l'URL d'autorisation est inscribed. */
  fichierUrl: string
  /** Supprime le shim et le fichier d'interception. */
  nettoyer(): void
}

/**
 * Prépare l'interception. Le script est écrit en Durcissement : il accepte
 * toute URL mais n'inscrit que celle qui porte le chemin d'autorisation, pour
 * ne pas confondre une ouverture de lien externe avec une demande de connexion.
 */
export function intercepterOuvertureUrl(): InterceptionOuvertureUrl {
  const repertoire = mkdtempSync(join(tmpdir(), 'sonal-ouverture-'))
  const fichierUrl = join(repertoire, 'urls-ouvertes.txt')
  const script = join(repertoire, OUVREUR)
  mkdirSync(repertoire, { recursive: true })
  writeFileSync(script, [
    '#!/bin/sh',
    '# Shim de qualification : Sonal ouvre une URL, on l’inscrit au lieu de',
    '# lancer un navigateur que le test ne maîtrise pas.',
    'for arg in "$@"; do',
    '  case "$arg" in',
    `    *${OUVREUR}*) continue ;;`,
    '  esac',
    '  case "$arg" in',
    '    *oauth/authorize*) printf "%s\\n" "$arg" >> "$SONAL_URL_OUVRTE" ;;',
    '  esac',
    'done',
    'exit 0',
    '',
  ].join('\n'), 'utf8')
  chmodSync(script, 0o755)
  return {
    repertoire,
    fichierUrl,
    nettoyer: () => rmSync(repertoire, { recursive: true, force: true }),
  }
}

/** PATH du poste testé, avec le shim en tête. */
export function pathAvecShim(repertoire: string): string {
  return `${repertoire}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`
}

/** Attend l'URL d'autorisation inscrite par le shim. */
export async function attendreUrlAutorisation(
  interception: InterceptionOuvertureUrl,
  delaiMs = 20_000,
): Promise<string> {
  const limite = Date.now() + delaiMs
  for (;;) {
    if (existsSync(interception.fichierUrl)) {
      const url = readFileSync(interception.fichierUrl, 'utf8').split('\n').findLast(Boolean)
      if (url) {
        rmSync(interception.fichierUrl, { force: true })
        return url
      }
    }
    if (Date.now() > limite) {
      throw new Error(
        "Aucune URL d'autorisation interceptée. Le poste testé n'a-t-il pas utilisé " +
        `« ${OUVREUR} » pour ouvrir le lien ?`,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

export interface IdentifiantsGitLab {
  utilisateur: string
  motDePasse: string
}

export interface SessionQualification {
  newPage(): Promise<Page>
  fermer(): Promise<void>
}

/**
 * Session de qualification : le navigateur du banc est le seul endroit où la
 * tolérance au certificat auto-signé est admise, parce que l'instance de
 * qualification en utilise un. L'application, elle, reste en TLS vérifié et
 * n'obtient sa confiance que par `NODE_EXTRA_CA_CERTS` : c'est cette
 * vérification-là que le banc doit éprouver, pas celle du navigateur de test.
 */
export async function sessionQualification(
  browser: { newContext: (options: Record<string, unknown>) => Promise<BrowserContext> },
  tolerantAuCertificatDuBanc = false,
): Promise<SessionQualification> {
  const contexte = await browser.newContext({
    ignoreHTTPSErrors: tolerantAuCertificatDuBanc,
  })
  return {
    newPage: () => contexte.newPage(),
    fermer: () => contexte.close(),
  }
}

/**
 * Joue le consentement comme la personne qui se connecte : formulaire de
 * connexion GitLab puis accord, et attend le retour de la callback loopback
 * (le serveur du main répond alors sa page de confirmation).
 */
export async function consentir(page: Page, identifiants: IdentifiantsGitLab): Promise<void> {
  await page.waitForLoadState('domcontentloaded')
  const champIdentifiant = page.locator('#user_login, input[name="user[login]"]')
  if (await champIdentifiant.isVisible().catch(() => false)) {
    await champIdentifiant.fill(identifiants.utilisateur)
    await page.locator('#user_password, input[name="user[password]"]').fill(identifiants.motDePasse)
    await page.getByRole('button', { name: /sign in|se connecter/i }).first().click()
    await page.waitForLoadState('domcontentloaded')
  }
  const autoriser = page.getByRole('button', {
    name: /^(authorize|autoriser)(\s+.+)?$/i,
  })
  const confirmation = page.getByText('Sonal est connecté à GitLab.')
  await expect(autoriser.or(confirmation).first()).toBeVisible({ timeout: 20_000 })
  if (await autoriser.isVisible().catch(() => false)) {
    await autorizerOuAccepter(autoriser)
  }
  // Le retour du navigateur se termine sur la page servie par la callback.
  await expect(confirmation).toBeVisible({ timeout: 20_000 })
}

async function autorizerOuAccepter(
  bouton: ReturnType<Page['getByRole']>,
): Promise<void> {
  // Le conteneur GitLab intercepte parfois le pointeur dans Chromium sans interface.
  await bouton.first().evaluate((element: HTMLButtonElement) => element.click())
}
