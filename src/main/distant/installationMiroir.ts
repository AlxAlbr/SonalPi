import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { EmpreinteLectureDistante } from './lecture'

export interface IdentiteMiroirDistant {
  fournisseur: 'webdav' | 'gitlab'
  destinationId: string
}

export interface ManifesteMiroir {
  formatVersion: 2
  destination: IdentiteMiroirDistant
  empreintes: Record<string, EmpreinteLectureDistante>
}

export interface PreparationInstallationMiroir {
  id: string
  dossier: string
}

export interface PlanInstallationMiroir {
  installations: { chemin: string; fichierPrepare: string }[]
  archives: { chemin: string; destination: string }[]
  manifeste: ManifesteMiroir
}

interface JournalInstallationMiroir {
  formatVersion: 1
  destination: IdentiteMiroirDistant
  preparationId: string
  actions: (
    | { type: 'installer'; chemin: string; fichierPrepare: string }
    | { type: 'archiver'; chemin: string; destination: string }
  )[]
  manifeste: ManifesteMiroir
}

interface OptionsInstallationMiroir {
  apresAction?: (index: number) => void
}

/** Installe un tirage préparé et reprend une installation interrompue. */
export class InstallationLocaleMiroir {
  private readonly fichierJournal: string
  private readonly racinePreparations: string

  constructor(
    private readonly dirLocal: string,
    private readonly identite: IdentiteMiroirDistant,
    private readonly options: OptionsInstallationMiroir = {},
  ) {
    this.fichierJournal = join(dirLocal, '.installation-miroir.json')
    this.racinePreparations = join(dirLocal, '.installation-miroir')
  }

  installationEnCours(): boolean {
    return existsSync(this.fichierJournal)
  }

  nouvellePreparation(): PreparationInstallationMiroir {
    const id = randomUUID()
    const dossier = join(this.racinePreparations, id)
    mkdirSync(dossier, { recursive: true })
    return { id, dossier }
  }

  cheminFichierPrepare(preparation: PreparationInstallationMiroir, index: number): string {
    return join(preparation.dossier, `${index}.prepare`)
  }

  abandonner(preparation: PreparationInstallationMiroir): void {
    if (existsSync(preparation.dossier)) rmSync(preparation.dossier, { recursive: true, force: true })
    try {
      rmdirSync(this.racinePreparations)
    } catch {
      /* D'autres préparations peuvent encore être présentes. */
    }
  }

  appliquer(preparation: PreparationInstallationMiroir, plan: PlanInstallationMiroir): void {
    if (
      !this.estManifeste(plan.manifeste) ||
      plan.manifeste.destination.fournisseur !== this.identite.fournisseur ||
      plan.manifeste.destination.destinationId !== this.identite.destinationId
    ) {
      throw new Error("Le manifeste préparé appartient à une autre destination distante.")
    }
    if (existsSync(this.fichierJournal)) {
      throw new Error("Une installation précédente doit être reprise avant d'en préparer une autre.")
    }
    const dossierAttendu = resolve(this.racinePreparations, preparation.id)
    if (resolve(preparation.dossier) !== dossierAttendu) {
      throw new Error("La zone de préparation du miroir n'est pas valide.")
    }
    const actions: JournalInstallationMiroir['actions'] = [
      ...plan.installations.map(({ chemin, fichierPrepare }) => {
        const relatif = relative(preparation.dossier, fichierPrepare)
        if (!this.cheminRelatifSain(chemin) || !this.cheminRelatifSain(relatif)) {
          throw new Error("Un chemin d'installation du miroir n'est pas valide.")
        }
        return { type: 'installer' as const, chemin, fichierPrepare: relatif }
      }),
      ...plan.archives.map(({ chemin, destination }) => {
        if (!this.cheminRelatifSain(chemin) || !this.cheminRelatifSain(destination)) {
          throw new Error("Un chemin d'archivage du miroir n'est pas valide.")
        }
        return { type: 'archiver' as const, chemin, destination }
      }),
    ]
    const journal: JournalInstallationMiroir = {
      formatVersion: 1,
      destination: this.identite,
      preparationId: preparation.id,
      actions,
      manifeste: plan.manifeste,
    }
    this.ecrireJsonAtomique(this.fichierJournal, journal)
    this.executer(journal)
  }

  reprendre(): void {
    if (!existsSync(this.fichierJournal)) return
    let donnees: unknown
    try {
      donnees = JSON.parse(readFileSync(this.fichierJournal, 'utf8'))
    } catch {
      throw new Error("Le journal d'installation du miroir est illisible.")
    }
    if (!this.estJournalValide(donnees)) {
      throw new Error("Le journal d'installation du miroir est invalide.")
    }
    if (
      donnees.destination.fournisseur !== this.identite.fournisseur ||
      donnees.destination.destinationId !== this.identite.destinationId
    ) {
      throw new Error("Le journal d'installation appartient à une autre destination distante.")
    }
    this.executer(donnees)
  }

  enregistrerManifeste(manifeste: ManifesteMiroir): void {
    this.ecrireJsonAtomique(join(this.dirLocal, '.manifeste.json'), manifeste)
  }

  private executer(journal: JournalInstallationMiroir): void {
    const dossierPreparation = join(this.racinePreparations, journal.preparationId)
    journal.actions.forEach((action, index) => {
      if (action.type === 'installer') {
        const source = join(dossierPreparation, action.fichierPrepare)
        if (!existsSync(source)) {
          throw new Error(`Le fichier préparé pour ${action.chemin} est absent.`)
        }
        const destination = join(this.dirLocal, action.chemin)
        mkdirSync(dirname(destination), { recursive: true })
        const temporaire = `${destination}.installation.tmp`
        copyFileSync(source, temporaire)
        renameSync(temporaire, destination)
      } else {
        const source = join(this.dirLocal, action.chemin)
        const destination = join(this.dirLocal, action.destination)
        if (existsSync(source)) {
          mkdirSync(dirname(destination), { recursive: true })
          renameSync(source, destination)
        } else if (!existsSync(destination)) {
          throw new Error(`Le fichier à archiver ${action.chemin} est absent.`)
        }
      }
      this.options.apresAction?.(index)
    })

    this.enregistrerManifeste(journal.manifeste)
    unlinkSync(this.fichierJournal)
    const dossier = join(this.racinePreparations, journal.preparationId)
    if (existsSync(dossier)) rmSync(dossier, { recursive: true, force: true })
    try {
      rmdirSync(this.racinePreparations)
    } catch {
      /* D'autres préparations peuvent encore être présentes. */
    }
  }

  private estJournalValide(valeur: unknown): valeur is JournalInstallationMiroir {
    if (!valeur || typeof valeur !== 'object') return false
    const journal = valeur as Partial<JournalInstallationMiroir>
    if (
      journal.formatVersion !== 1 ||
      !this.estIdentite(journal.destination) ||
      typeof journal.preparationId !== 'string' ||
      !this.segmentSain(journal.preparationId) ||
      !Array.isArray(journal.actions) ||
      !this.estManifeste(journal.manifeste) ||
      journal.manifeste.destination.fournisseur !== journal.destination.fournisseur ||
      journal.manifeste.destination.destinationId !== journal.destination.destinationId
    ) return false
    return journal.actions.every((action) => {
      if (!action || typeof action !== 'object') return false
      if (action.type === 'installer') {
        return this.cheminRelatifSain(action.chemin) && this.cheminRelatifSain(action.fichierPrepare)
      }
      return action.type === 'archiver' &&
        this.cheminRelatifSain(action.chemin) &&
        this.cheminRelatifSain(action.destination)
    })
  }

  private estManifeste(valeur: unknown): valeur is ManifesteMiroir {
    if (!valeur || typeof valeur !== 'object') return false
    const manifeste = valeur as Partial<ManifesteMiroir>
    if (
      manifeste.formatVersion !== 2 ||
      !this.estIdentite(manifeste.destination) ||
      !manifeste.empreintes ||
      typeof manifeste.empreintes !== 'object'
    ) return false
    return Object.entries(manifeste.empreintes).every(([chemin, empreinte]) =>
      this.cheminRelatifSain(chemin) && this.estEmpreinte(empreinte),
    )
  }

  private estIdentite(valeur: unknown): valeur is IdentiteMiroirDistant {
    if (!valeur || typeof valeur !== 'object') return false
    const identite = valeur as Partial<IdentiteMiroirDistant>
    return (identite.fournisseur === 'webdav' || identite.fournisseur === 'gitlab') &&
      typeof identite.destinationId === 'string'
  }

  private estEmpreinte(valeur: unknown): valeur is EmpreinteLectureDistante {
    if (!valeur || typeof valeur !== 'object') return false
    const empreinte = valeur as Partial<EmpreinteLectureDistante>
    return (empreinte.type === 'webdav-etag' || empreinte.type === 'gitlab-blob') &&
      typeof empreinte.valeur === 'string'
  }

  private cheminRelatifSain(chemin: unknown): chemin is string {
    if (typeof chemin !== 'string' || !chemin || chemin.startsWith('/') || chemin.includes('\\')) {
      return false
    }
    return chemin.split('/').every((segment) => this.segmentSain(segment))
  }

  private segmentSain(segment: string): boolean {
    return segment !== '' &&
      segment !== '.' &&
      segment !== '..' &&
      !segment.includes(':') &&
      !segment.includes('\0')
  }

  private ecrireJsonAtomique(chemin: string, valeur: unknown): void {
    mkdirSync(dirname(chemin), { recursive: true })
    const temporaire = `${chemin}.${randomUUID()}.tmp`
    const fd = openSync(temporaire, 'wx')
    try {
      writeFileSync(fd, JSON.stringify(valeur, null, 2), 'utf8')
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(temporaire, chemin)
  }
}
