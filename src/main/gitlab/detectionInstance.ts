/**
 *  Détection de l'instance GitLab qui héberge un projet.
 *
 *  L'adresse d'un projet ne dit pas où s'arrête l'instance : `groupe/projet`
 *  peut appartenir à un GitLab à la racine du domaine ou installé sous un
 *  sous-chemin (`https://hote/gitlab/groupe/projet`). Les candidats sont donc
 *  sondés du plus profond vers la racine, en demandant la version de l'API :
 *  le premier qui répond est l'instance. Aucun token n'est envoyé pendant
 *  cette reconnaissance.
 */

export interface OptionsDetectionInstance {
  fetchImpl?: typeof fetch
  delaiMs?: number
}

/** Candidats d'instance déduits d'une adresse de projet, du plus profond au plus large. */
export function candidatsInstance(urlProjet: string): string[] {
  let url: URL
  try {
    url = new URL(urlProjet.trim())
  } catch {
    return []
  }
  if (!url.hostname) return []
  const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  const candidats: string[] = []
  // Le dernier segment est le projet : il ne fait jamais partie de l'instance.
  for (let profondeur = segments.length - 1; profondeur >= 1; profondeur -= 1) {
    candidats.push(`${url.origin}/${segments.slice(0, profondeur).map(encodeURIComponent).join('/')}`)
  }
  candidats.push(url.origin)
  return [...new Set(candidats)]
}

/**
 *  Instance hébergeant le projet. En l'absence de réponse exploitable, la
 *  racine est retenue : l'utilisateur peut la corriger dans l'interface.
 */
export async function detecterInstanceGitLab(
  urlProjet: string,
  options: OptionsDetectionInstance = {},
): Promise<string | null> {
  const candidats = candidatsInstance(urlProjet)
  if (candidats.length === 0) return null
  const fetchImpl = options.fetchImpl ?? fetch
  for (const candidat of candidats) {
    if (await repondApiGitLab(candidat, fetchImpl, options.delaiMs ?? 5_000)) return candidat
  }
  return candidats[candidats.length - 1] ?? null
}

async function repondApiGitLab(
  instance: string,
  fetchImpl: typeof fetch,
  delaiMs: number,
): Promise<boolean> {
  try {
    const reponse = await fetchImpl(`${instance}/api/v4/version`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(delaiMs),
      redirect: 'error',
    })
    if (!reponse.ok) return false
    const corps: unknown = await reponse.json()
    return Boolean(
      corps &&
      typeof corps === 'object' &&
      typeof (corps as { version?: unknown }).version === 'string',
    )
  } catch {
    return false
  }
}
