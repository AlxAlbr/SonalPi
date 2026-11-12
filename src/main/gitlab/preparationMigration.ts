import { createHash, randomUUID } from 'node:crypto'
import { posix } from 'node:path'
import type {
  BilanMigrationGitLab,
  CibleMigrationGitLab,
  DemandeBilanMigrationGitLab,
  DemandeSourceMigrationGitLab,
  SourceMigrationGitLab,
} from '../../shared/corpus/migrationGitLab'
import { analyserCrp, mapperEntretiensV1 } from '../../shared/corpus/migrationCrp'
import { importerTraitementsLexicoV1 } from '../../shared/lexico/traitements'
import type { CoffreComptes, ConfigDestinationGitLab } from '../distant/coffre'
import type { IdentificationProjetGitLab, ProjetGitLabPrepare } from '../../shared/gitlab'
import { classifierCorpus } from '../../shared/ouvertureFichier'
import { preparerBaseMediaVerifiee, type BaseMediaVerifiee } from '../medias/baseMedia'
import { verifierCheminMediaRelatif } from '../medias/designation'
import type { ServiceAuthentificationGitLab } from './authentification'
import { LecteurGitLab } from './lecture'
import { preparerConservationMigration } from '../conservationMigration'
import { LectureV1GitLab, resoudreCheminV1GitLab } from './lectureV1'
import { preparerCibleMigrationGitLab, preparerProjetGitLab, preparerProjetEnregistreMigrationGitLab } from './preparationProjet'

interface Preparation {
  source: SourceMigrationGitLab
  lecture: LectureV1GitLab
  fichiers: string[]
  empreintes: Record<string, string>
  bilan?: BilanMigrationGitLab
  baseMedia?: BaseMediaVerifiee
}

/** Inventorie les fichiers sans suivre les liens ni modifier le dépôt. */
export async function inventorierDepotMigration(lecteur: LecteurGitLab): Promise<Record<string, string>> {
  const dossiers = ['']
  const fichiers: Record<string, string> = {}
  while (dossiers.length) {
    const dossier = dossiers.pop()!
    for (const entree of await lecteur.inventorier(dossier)) {
      const chemin = [dossier, entree.chemin].filter(Boolean).join('/')
      if (entree.dossier) dossiers.push(chemin)
      else {
        if (entree.empreinte?.type !== 'gitlab-blob') throw new Error('Une empreinte de fichier manque dans le dépôt.')
        fichiers[chemin] = entree.empreinte.valeur
      }
    }
  }
  return fichiers
}

export async function fichiersDepot(lecteur: LecteurGitLab): Promise<string[]> {
  return Object.keys(await inventorierDepotMigration(lecteur)).sort()
}

/** Seuls les fichiers d'initialisation usuels sont admis dans une cible. */
export async function verifierCibleMigrationGitLab(
  cible: CibleMigrationGitLab,
  authentification: ServiceAuthentificationGitLab,
): Promise<string | null> {
  const client = await authentification.client(cible.compteId, cible.projetId)
  if (cible.branche === null) {
    const { corps } = await client.lireJson<unknown[]>(client.cheminProjet('/repository/branches'))
    if (!Array.isArray(corps) || corps.length !== 0) {
      throw new Error('La destination possède déjà des branches. Choisissez un dépôt vierge.')
    }
    return null
  }
  const lecteur = await LecteurGitLab.depuisBranche(client, cible.branche)
  for (const chemin of await fichiersDepot(lecteur)) {
    if (!/^(?:(?:README|LICEN[CS]E|COPYING)(?:\.(?:md|markdown|txt|rst|adoc))?|\.gitignore|\.gitattributes)$/i.test(chemin)) {
      throw new Error(`La destination contient déjà « ${chemin} ». Choisissez un dépôt vierge de données utilisateur.`)
    }
  }
  return lecteur.commit
}

/** Un seul bilan actif, lié au compte et au commit source préparés. */
export class PreparateurMigrationGitLab {
  private preparation: Preparation | null = null
  private generation = 0

  constructor(
    private readonly authentification: ServiceAuthentificationGitLab,
    private readonly verifierBase = preparerBaseMediaVerifiee,
    private readonly coffre?: Pick<CoffreComptes, 'listerDestinationsGitLab'>,
  ) {}

  async decouvrir(demande: DemandeSourceMigrationGitLab): Promise<SourceMigrationGitLab> {
    const generation = ++this.generation
    this.preparation = null
    const destination = 'destinationId' in demande
      ? this.coffre?.listerDestinationsGitLab().find((d) => d.id === demande.destinationId)
      : null
    if ('destinationId' in demande && !destination) throw new Error('Ce projet GitLab n’est plus enregistré sur ce poste.')
    const projet = 'destinationId' in demande
      ? await preparerProjetEnregistreMigrationGitLab(destination!, this.authentification)
      : await preparerProjetGitLab(demande, this.authentification)
    const client = await this.authentification.client(projet.compteId, projet.projetId)
    const lecteur = await LecteurGitLab.depuisBranche(client, projet.branche)
    const racine = destination?.racine ? `${destination.racine}/` : ''
    const empreintes = await inventorierDepotMigration(lecteur)
    const fichiers = Object.keys(empreintes).sort()
    const corpus = fichiers.filter((chemin) => chemin.startsWith(racine) && /\.crp$/i.test(chemin))
    if (!corpus.length) throw new Error('Aucun corpus SonalPi1 (.crp) trouvé dans ce dépôt.')
    if (generation !== this.generation) throw new Error('La source a changé. Préparez de nouveau la migration.')
    const source: SourceMigrationGitLab = {
      preparationId: randomUUID(), projet, commit: lecteur.commit, corpus,
    }
    this.preparation = { source, lecture: new LectureV1GitLab(client, lecteur.commit), fichiers, empreintes }
    return structuredClone(source)
  }

  /** Identifie le contenu avant toute installation ou reprise d'écriture distante. */
  async identifier(destination: ConfigDestinationGitLab): Promise<IdentificationProjetGitLab> {
    const generation = ++this.generation
    this.preparation = null
    const compte = this.authentification.comptePublic(destination.compteId)
    const projet: ProjetGitLabPrepare = {
      compteId: destination.compteId, urlInstance: compte.urlInstance, utilisateur: compte.utilisateur,
      projetId: destination.projetId, nomProjet: destination.nomProjet, branche: destination.branche,
    }
    const client = await this.authentification.client(projet.compteId, projet.projetId)
    const racine = destination.racine
    const lecteur = await LecteurGitLab.depuisBranche(client, projet.branche, racine)
    const directs = await lecteur.inventorier('')
    const lecture = new LectureV1GitLab(client, lecteur.commit)
    const natif = directs.find((e) => !e.dossier && e.chemin === 'corpus.crp')
    if (natif && classifierCorpus(await lecture.lireDocument([racine, natif.chemin].filter(Boolean).join('/')), natif.chemin).type === 'v2') {
      if (generation !== this.generation) throw new Error('La source a changé pendant sa lecture.')
      return { type: 'v2' }
    }
    if (directs.some((e) => !e.dossier && e.chemin === 'corpus.json')) {
      throw new Error('Ce projet contient un ancien fichier corpus.json. Vérifiez son format et renommez le fichier natif V2 en corpus.crp avant de l’ouvrir.')
    }
    const relatifs = await inventorierDepotMigration(lecteur)
    const empreintes = Object.fromEntries(Object.entries(relatifs).map(([p, hash]) => [[racine, p].filter(Boolean).join('/'), hash]))
    const fichiers = Object.keys(empreintes).sort()
    const corpus: string[] = []
    for (const chemin of fichiers.filter((p) => /\.crp$/i.test(p))) {
      const classification = classifierCorpus(await lecture.lireDocument(chemin), posix.basename(chemin))
      if (classification.type === 'v2') throw new Error(`Le fichier V2 « ${chemin} » doit s’appeler corpus.crp dans le dossier du corpus.`)
      corpus.push(chemin)
    }
    if (!corpus.length) throw new Error('Aucun corpus SonalPi1 ou SonalPi2 trouvé dans ce projet.')
    if (generation !== this.generation) throw new Error('La source a changé pendant sa lecture.')
    const source: SourceMigrationGitLab = { preparationId: randomUUID(), projet, commit: lecteur.commit, corpus }
    this.preparation = { source, lecture, fichiers, empreintes }
    return { type: 'migration', source: structuredClone(source) }
  }

  async preparer(demande: DemandeBilanMigrationGitLab): Promise<BilanMigrationGitLab> {
    const preparation = this.exigerPreparation(demande.preparationId)
    const generation = ++this.generation
    preparation.bilan = undefined
    preparation.baseMedia = undefined
    const { source, lecture, fichiers } = preparation
    if (!source.corpus.includes(demande.cheminCrp)) throw new Error('Choisissez un corpus de la source préparée.')
    const cible = await preparerCibleMigrationGitLab(demande.cible, this.authentification)
    if (cible.projetId === source.projet.projetId && cible.urlInstance === source.projet.urlInstance) {
      throw new Error('La source et la destination doivent être deux dépôts différents.')
    }
    const commitCible = await verifierCibleMigrationGitLab(cible, this.authentification)
    const analyse = analyserCrp(await lecture.lireDocument(demande.cheminCrp), posix.basename(demande.cheminCrp))
    if (!analyse.ok) throw new Error(analyse.message)
    const baseLexico = demande.cheminCrp.slice(0, -posix.extname(demande.cheminCrp).length)
    const annexes: Partial<Record<'out' | 'lem' | 'cnct', string>> = {}
    const diagnosticsLexico: string[] = []
    for (const extension of ['out', 'lem', 'cnct'] as const) {
      const chemin = `${baseLexico}.${extension}`
      if (!fichiers.includes(chemin)) continue
      const information = await lecture.information(chemin)
      if (information.taille > 5 * 1024 * 1024) {
        diagnosticsLexico.push(`.${extension} ignoré : le fichier dépasse 5 Mio.`)
        continue
      }
      annexes[extension] = await lecture.lireDocument(chemin)
    }
    const lexicoV1 = importerTraitementsLexicoV1(annexes)
    lexicoV1.diagnostics.unshift(...diagnosticsLexico)
    const bilan: BilanMigrationGitLab = {
      bilanId: randomUUID(),
      preparationId: source.preparationId,
      source: source.projet,
      commitSource: source.commit,
      cheminCrp: demande.cheminCrp,
      cible,
      commitCible,
      apercu: analyse.apercu,
      lexicoV1,
      entretiens: [],
      medias: [],
      volumeOctets: 0,
      destinationMedia: demande.baseMedia ? 'externe' : 'depot',
    }
    const dossierMigration = demande.baseMedia
      ? `migrations/${createHash('sha256').update(JSON.stringify([
          source.projet.urlInstance, source.projet.projetId, source.commit,
          demande.cheminCrp, cible.urlInstance, cible.projetId,
        ])).digest('hex')}/`
      : ''
    const medias = new Map<string, number>()
    for (const entretien of mapperEntretiensV1(analyse.apercu.raw.tabEnt)) {
      const cheminSonal = entretien.rtrPath
        ? resoudreCheminV1GitLab(demande.cheminCrp, entretien.rtrPath) : null
      if (cheminSonal) await lecture.information(cheminSonal)
      let media: number | null = null
      if (entretien.audioRef) {
        const cheminSource = resoudreCheminV1GitLab(demande.cheminCrp, entretien.audioRef)
        media = medias.get(cheminSource) ?? null
        if (media === null) {
          const information = await lecture.information(cheminSource)
          const identite = createHash('sha256').update(cheminSource).digest('hex')
          const nom = posix.basename(cheminSource).replace(/[?#%\u0000-\u001f\u007f]/g, '_')
          const cheminDestination = verifierCheminMediaRelatif(`${dossierMigration}medias/${identite}/${nom}`)
          media = bilan.medias.length
          medias.set(cheminSource, media)
          bilan.medias.push({
            cheminSource, cheminDestination,
            taille: information.taille,
            sha256: information.sha256,
            stockageSource: information.stockage,
          })
          bilan.volumeOctets += information.taille
          if (!Number.isSafeInteger(bilan.volumeOctets)) throw new Error('Volume média trop important.')
        }
      }
      bilan.entretiens.push({ titre: entretien.titre, cheminSonal, media })
    }
    const utilises = new Set([demande.cheminCrp,
      ...bilan.entretiens.map((e) => e.cheminSonal).filter((p): p is string => !!p),
      ...bilan.medias.map((m) => m.cheminSource),
    ])
    for (const ext of lexicoV1.fichiers) if (!lexicoV1.diagnostics.some((d) => d.startsWith(ext))) utilises.add(`${baseLexico}${ext}`)
    bilan.conservation = await preparerConservationMigration({ cheminCrp: demande.cheminCrp, fichiers, utilises,
      lireCorpus: async (p) => {
        const a = analyserCrp(await lecture.lireDocument(p), posix.basename(p))
        return a.ok ? a.apercu.raw : null
      },
      references: (p, corpus) => {
        const refs = mapperEntretiensV1(corpus.tabEnt).flatMap((e) => [e.rtrPath, e.audioRef].filter((s): s is string => !!s))
        for (const entretien of corpus.tabEnt ?? []) if (entretien.imgPath) refs.push(entretien.imgPath)
        const base = p.slice(0, -posix.extname(p).length)
        return [...refs.flatMap((ref) => {
          try { return [resoudreCheminV1GitLab(p, ref)] } catch { return [] }
        }), ...['out', 'lem', 'cnct', 'lexaf.json'].map((ext) => `${base}.${ext}`)]
      },
      information: async (p) => {
        const info = await lecture.informationAutre(p, preparation.empreintes[p])
        return { taille: info.taille, sha256: info.sha256, stockageSource: info.stockage }
      },
    })
    let baseMedia: BaseMediaVerifiee | undefined
    if (demande.baseMedia) {
      const resultat = await this.verifierBase(demande.baseMedia)
      if (!resultat.ok) {
        const messages = {
          droits: 'Accès à l’espace média refusé. Vérifiez le compte et le mot de passe d’application.',
          'dossier-absent': 'Le dossier média externe n’existe pas ou n’est pas accessible.',
          indisponible: 'L’espace média externe ne répond pas. Réessayez plus tard.',
        }
        throw new Error(messages[resultat.motif])
      }
      baseMedia = resultat.base
    }
    if (generation !== this.generation || this.preparation !== preparation) {
      throw new Error('La préparation a changé. Recommencez le bilan.')
    }
    preparation.bilan = bilan
    preparation.baseMedia = baseMedia
    return structuredClone(bilan)
  }

  async lireEntretien(preparationId: string, index: number): Promise<{ nom: string; contenu: string } | null> {
    const preparation = this.exigerPreparation(preparationId)
    const bilan = preparation.bilan
    if (!bilan || !Number.isSafeInteger(index) || index < 0 || index >= bilan.entretiens.length) {
      throw new Error('Entretien absent du bilan préparé.')
    }
    const chemin = bilan.entretiens[index].cheminSonal
    if (!chemin) return null
    const contenu = await preparation.lecture.lireDocument(chemin)
    if (this.preparation !== preparation || preparation.bilan !== bilan) throw new Error('Le bilan a changé.')
    return { nom: posix.basename(chemin), contenu }
  }

  capturerBilan(bilanId: string): { bilan: BilanMigrationGitLab; baseMedia?: BaseMediaVerifiee } {
    if (!this.preparation?.bilan || this.preparation.bilan.bilanId !== bilanId) {
      throw new Error('Ce bilan a changé. Préparez de nouveau la migration.')
    }
    return structuredClone({ bilan: this.preparation.bilan, baseMedia: this.preparation.baseMedia })
  }

  abandonner(preparationId: string): boolean {
    if (this.preparation?.source.preparationId !== preparationId) return false
    this.generation += 1
    this.preparation = null
    return true
  }

  private exigerPreparation(id: string): Preparation {
    if (!this.preparation || this.preparation.source.preparationId !== id) {
      throw new Error('Cette préparation n’est plus disponible. Sélectionnez de nouveau la source.')
    }
    return this.preparation
  }
}
