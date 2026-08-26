/**
 *  Sondes de connexion — le « profil de capacités » du backend, mesuré sur le
 *  serveur RÉEL à la configuration d'un corpus distant, et répété à chaque
 *  ouverture (un admin peut installer files_lock entre deux sessions).
 *
 *  Deux sondes :
 *  1. Préconditions HTTP : le contrat dont dépend la variante PUT conditionnel
 *  du verrou. Un serveur qui échoue est REFUSÉ pour le verrou conditionnel.
 *  2. Capabilities Nextcloud : présence du plugin `files_lock` → variante
 *  files_lock. Absence d'info ou serveur non-Nextcloud → verrou conditionnel,
 *  sans erreur.
 *
 *  Le protocole de session dépend de ces capacités mesurées,
 *  jamais du nom du backend.
 */

import { ClientWebDAV, ErreurHttp, retirerGuillemets } from './client'

export interface ProfilCapacites {
  /** Test-and-set atomique par préconditions : `PUT If-None-Match: *` refuse un second create,
   *  et `If-Match` garde une publication. Base de la variante B. */
  preconditions: boolean
  /** Verrou natif files_lock détecté (variante A). */
  filesLock: boolean
  /** Détail humain des échecs de sonde (log + message UI). */
  notes?: string[]
}

/** Sonde des préconditions : séquence réelle contre un fichier jetable dans le dossier fourni (`sonde/` à la racine du corpus).
 *  Toute l'arithmétique du test-and-set tient dans ces quatre attentes :
 *  - PUT If-None-Match:* sur absent        → 201
 *  - même PUT (fichier présent désormais)  → 412
 *  - PUT If-Match <bon etag>               → 2xx
 *  - PUT If-Match <mauvais etag>           → 412
 *  Le DELETE final laisse le dossier propre. */
export const sonderPreconditions = async (
  client: ClientWebDAV,
): Promise<{ ok: boolean; note?: string }> => {
  const chemin = 'sonde/capacites.tmp'
  try {
    await client.creerDossier('sonde')
    // 1. Création exclusive attendue.
    await client.putTexte(chemin, 'sonde', { ifNoneMatch: '*' })
    // 2. Deuxième création → doit être refusée (le fichier existe).
    try {
      await client.putTexte(chemin, 'sonde', { ifNoneMatch: '*' })
      return { ok: false, note: "If-None-Match:* accepté sur un fichier existant (attendu 412)" }
    } catch (e) {
      if (!(e instanceof ErreurHttp && e.statut === 412)) throw e
    }
    // 3. Garde If-Match : récupérer l'ETag courant… (les entrées du PROPFIND sont relatives au dossier interrogé).
    const entrees = await client.propfind('sonde')
    const etag = entrees.find((e) => e.chemin === 'capacites.tmp')?.etag
    if (!etag) return { ok: false, note: 'ETag non exposé par le serveur (PROPFIND)' }
    // …publier sous le bon ETag (doit passer),
    await client.putTexte(chemin, 'sonde-2', { ifMatch: etag })
    // puis sous un mauvais (doit être refusé).
    try {
      await client.putTexte(chemin, 'sonde-3', { ifMatch: 'etag-inexistant' })
      return { ok: false, note: 'If-Match avec mauvais ETag accepté (attendu 412)' }
    } catch (e) {
      if (!(e instanceof ErreurHttp && e.statut === 412)) throw e
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, note: `Sonde interrompue : ${message(e)}` }
  } finally {
    try {
      await client.supprimer(chemin)
    } catch {
      /* nettoyage best effort */
    }
  }
}

/** Sonde capabilities Nextcloud (`/ocs/v1.php/cloud/capabilities`),
 *  format JSON, authentifié comme le reste. `files.locking` présent → la
 *  variante files_lock est disponible. Tout échec ici N'EST PAS bloquant : on
 *  retombe en verrou conditionnel (c'est exactement sa raison d'être). */
export const sonderFilesLock = async (
  baseUrl: string,
  identifiants: { utilisateur: string; motDePasse: string },
  faireRequete: typeof fetch = fetch,
): Promise<boolean> => {
  try {
    // La racine DAV est .../remote.php/dav/files/<user>/<corpus> ;
    // les capabilities vivent à la racine du site : on remonte avant /remote.php/.
    const u = new URL(baseUrl)
    const i = u.pathname.indexOf('/remote.php/')
    const racineSite = i > 0 ? u.pathname.slice(0, i) : ''
    const url = `${u.origin}${racineSite}/ocs/v1.php/cloud/capabilities?format=json`
    const reponse = await faireRequete(url, {
      headers: {
        'OCS-APIRequest': 'true',
        Authorization:
          'Basic ' +
          Buffer.from(`${identifiants.utilisateur}:${identifiants.motDePasse}`).toString('base64'),
      },
    })
    if (!reponse.ok) return false
    const donnees = (await reponse.json()) as {
      // OCS v1 enveloppe la charge utile : { ocs: { meta, data: { capabilities } } }.
      ocs?: { data?: { capabilities?: { files?: { locking?: boolean | string | number } } } }
      capabilities?: { files?: { locking?: boolean | string | number } }
    }
    const fichiers =
      donnees.ocs?.data?.capabilities?.files ?? donnees.capabilities?.files
    const locking = fichiers?.locking
    // Nextcloud expose "1" (string), 1, ou true selon les versions —
    // tout le reste (absent, "0", 0, false) signifie « plugin absent ».
    return !!locking && locking !== '0' && locking !== 0
  } catch {
    return false
  }
}

/** Les deux sondes ensemble — c'est CE profil que la connexion stocke,
 *  et que le protocole consulte à chaque ouverture. */
export async function profilerServeur(client: ClientWebDAV): Promise<ProfilCapacites> {
  const notes: string[] = []
  const preconditions = await sonderPreconditions(client)
  if (!preconditions.ok && preconditions.note) notes.push(preconditions.note)
  const filesLock = await sonderFilesLock(
    client.config.baseUrl,
    client.config.identifiants,
  )
  return { preconditions: preconditions.ok, filesLock, notes: notes.length ? notes : undefined }
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
