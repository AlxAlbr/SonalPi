import { createHash, randomUUID } from 'node:crypto'
import type { CorpusStore } from '../corpusStore'
import type { CorpusFichier, EntretienFichier } from '../../shared/format'
import {
  appliquerReaffectationsTheme,
  construirePlanEntretienTheme,
  finaliserDefinitionsOperationTheme,
  inventorierCodagesThemes,
  operationThemeRetireThemes,
  preparerDefinitionsOperationTheme,
  RefusOperationTheme,
  sourcesSupprimeesOperationTheme,
  verifierDemandeOperationTheme,
  type DemandeOperationTheme,
  type OptionsExecutionOperationTheme,
  type ProgressionOperationTheme,
  type ReferenceCodage,
  type ResultatOperationTheme,
} from '../../shared/corpus/themes'
import { decoderCorpusTheme, empreinteTheme, validerEntretienTheme, verifierReferencesThemes } from '../operationsThemes'
import { exigerAbsenceDissociationGitLab } from './referencesDefinitions'
import { normaliserRacineGitLab } from '../distant/coffre'
import {
  cleRessourceBailGitLab,
  type BailGitLab,
  type DepotCommitsGitLab,
  type DroitsEditionGitLab,
  type FichierGitLab,
} from './bailGitLab'
import { ApercusThemesGitLab } from './apercusThemes'
import { MAX_ACTIONS_PUBLICATION, type ActionPlanGitLab, type PublieurGitLab, type ResultatPublicationGitLab } from './publication'
import type { JournalPublicationGitLab } from './journalPublication'
import { reprendreOperationsGitLab } from './reprise'
import {
  JournalLocalThemesGitLab,
  type JournalThemesGitLab,
  type PublicationThemeGitLabEnAttente,
} from './journalThemes'

interface Dependances {
  destinationId: string
  dirLocal: string
  branche: string
  racine?: string
  store: CorpusStore
  depot: DepotCommitsGitLab
  coordination: BailGitLab
  publication: PublieurGitLab
  journalPublication?: JournalPublicationGitLab
  apercus: ApercusThemesGitLab
  sessionsLocales: () => string[]
  nouvelleOperation?: () => string
  maintenant?: () => number
}

class PublicationInconnue extends Error {}
function message(e: unknown): string { return e instanceof Error ? e.message : String(e) }
function signature(demande: DemandeOperationTheme): string {
  const copie = structuredClone(demande)
  if (copie.type === 'division') copie.choix = []
  return empreinteTheme(copie)
}
const destructive = operationThemeRetireThemes

/** Exécute un lot GitLab par baux courts et protège la suppression finale par tout le membership. */
export class OperationsThemesGitLab {
  private readonly journal: JournalLocalThemesGitLab
  private readonly racine: string
  private readonly maintenant: () => number
  private readonly nouvelleOperation: () => string
  private enCours = false

  constructor(private readonly deps: Dependances) {
    this.racine = normaliserRacineGitLab(deps.racine ?? '')
    this.maintenant = deps.maintenant ?? Date.now
    this.nouvelleOperation = deps.nouvelleOperation ?? randomUUID
    const destination = createHash('sha256')
      .update(`${deps.destinationId}\0${deps.branche}\0${this.racine}`)
      .digest('hex')
    this.journal = new JournalLocalThemesGitLab(deps.dirLocal, destination)
  }

  get occupe(): boolean { return this.enCours }

  lireSuivi() {
    const j = this.journal.lire()
    return j && !j.termine && !j.abandonne ? {
      operationId: j.operationId,
      demande: structuredClone(j.demande),
      bilan: this.bilan(j),
      indeterminee: !!j.publication,
    } : null
  }

  async analyser(demande: DemandeOperationTheme, precedent?: string) {
    this.exigerLibre()
    const j = this.journal.lire()
    if (j?.publication) throw new RefusOperationTheme('Une publication GitLab doit être réconciliée avant un nouvel aperçu.')
    if (j && !j.termine && !j.abandonne && signature(j.demande) !== signature(demande)) {
      throw new RefusOperationTheme('Un lot thématique GitLab est incomplet : reprenez-le avant une autre opération.')
    }
    return this.deps.apercus.analyser(demande, precedent,
      j && !j.termine && !j.abandonne && j.definitionsConfirmees ? j.cibles : undefined)
  }

  async preparerReprise(operationId: string) {
    this.exigerLibre()
    const j = this.exigerJournal(operationId)
    if (j.publication) throw new RefusOperationTheme('Réconciliez la publication inconnue avant de reprendre.')
    if (j.termine || j.abandonne) throw new RefusOperationTheme('Ce lot est déjà terminé ou son suivi a été abandonné.')
    const demande = structuredClone(j.demande)
    if (demande.type === 'division') demande.choix = []
    return { demande, apercu: await this.analyser(demande) }
  }

  abandonner(operationId: string): void {
    this.exigerLibre()
    const j = this.exigerJournal(operationId)
    if (j.publication) throw new RefusOperationTheme('Une publication inconnue ne peut pas être abandonnée.')
    j.abandonne = true
    this.journal.ecrire(j)
  }

  async executer(operationId: string, demande: DemandeOperationTheme, options: OptionsExecutionOperationTheme,
    progression?: (etat: ProgressionOperationTheme) => void): Promise<ResultatOperationTheme> {
    if (this.enCours) return { statut: 'non-appliquee', motif: 'Une opération sur les thématiques est déjà en cours.' }
    this.enCours = true
    let j: JournalThemesGitLab | null = null
    try {
      if (!options || !['tous-prevus', 'observes-libres'].includes(options.entretiens)) {
        throw new RefusOperationTheme('Option de lancement GitLab invalide.')
      }
      j = this.journal.lire()
      if (j?.publication) throw new RefusOperationTheme('Une publication inconnue doit être réconciliée avant tout envoi.')
      if (j?.termine || j?.abandonne) j = null
      if (j && signature(j.demande) !== signature(demande)) {
        throw new RefusOperationTheme('La demande ne correspond pas au lot GitLab à reprendre.')
      }
      const manifeste = this.deps.apercus.consommer(operationId, demande)
      const indisponibles = manifeste.apercu.obstacles.flatMap((o) =>
        o.entretienId ? [{ id: o.entretienId, motif: o.motif }] : [])
      const bloques = new Set(indisponibles.map((e) => e.id))
      const prevus = manifeste.apercu.parEntretien.filter((e) => e.aModifier && !bloques.has(e.id)).map((e) => e.id)
      const disponibilites = new Map(manifeste.apercu.disponibiliteGitLab?.entretiens.map((e) => [e.id, e]) ?? [])
      const selectionnes = options.entretiens === 'observes-libres'
        ? prevus.filter((id) => disponibilites.get(id)?.etat === 'libre-observe') : prevus
      const differes = prevus.filter((id) => !selectionnes.includes(id)).map((id) => ({
        id,
        motif: disponibilites.get(id)?.motif ?? 'Entretien différé par le lancement confirmé.',
      }))
      if (prevus.length > 0 && selectionnes.length === 0) {
        throw new RefusOperationTheme('Aucun entretien confirmé n’est disponible ; aucune destination n’est créée.')
      }
      const total = selectionnes.length + indisponibles.length + differes.length
      const signaler = (phase: ProgressionOperationTheme['phase'], termines: number, reussis: number, echecs: number) => {
        try { progression?.({ operationId, phase, total, termines, reussis, echecs }) } catch {
          // Un panneau fermé ne change pas le résultat du lot.
        }
      }
      signaler('definitions', 0, 0, indisponibles.length)
      j = await this.preparerDefinitions(j, operationId, demande, selectionnes, differes, indisponibles, manifeste.corpus)

      let termines = indisponibles.length + differes.length
      let reussis = 0
      signaler('entretiens', termines, reussis, indisponibles.length)
      for (const id of selectionnes) {
        try {
          this.exigerSansSession(id)
          await this.modifierEntretien(j, id, demande, manifeste.entretiens.get(id))
          reussis++
        } catch (e) {
          if (j.publication || e instanceof PublicationInconnue) throw e
          j.bilan.echecs.push({ id, motif: message(e) })
          j.selectionnes = j.selectionnes.filter((reste) => reste !== id)
          this.journal.ecrire(j)
        }
        termines++
        signaler('entretiens', termines, reussis, j.bilan.echecs.length)
      }

      if (destructive(demande)) {
        if (j.bilan.echecs.length || j.differes.length || j.selectionnes.length) {
          j.bilan.finalisation = 'bloquee'
          j.bilan.sourceConservee = true
          j.bilan.motifFinalisation = 'Les thématiques à retirer restent présentes tant que des entretiens sont en échec ou différés.'
        } else {
          signaler('finalisation', termines, reussis, j.bilan.echecs.length)
          await this.finaliser(j, demande)
        }
      }
      j.termine = j.bilan.echecs.length === 0 && j.differes.length === 0
        && (!destructive(demande) || j.bilan.finalisation === 'terminee')
      this.journal.ecrire(j)
      signaler('finalisation', termines, reussis, j.bilan.echecs.length)
      return this.resultat(j)
    } catch (e) {
      if (!j) {
        try {
          const durable = this.journal.lire()
          if (durable && (durable.operationId === operationId || durable.tentatives.includes(operationId))) j = durable
        } catch { /* Le motif initial reste prioritaire si le journal ne se relit pas. */ }
      }
      if (j?.publication) {
        if (j.publication.phase === 'finalisation') {
          j.bilan.finalisation = 'indeterminee'
          j.bilan.sourceConservee = null
        }
        try { this.journal.ecrire(j) } catch { /* L’intention précédente reste durable. */ }
        return { statut: 'indeterminee', operationId: j.operationId, motif: message(e), bilan: this.bilan(j) }
      }
      if (j && (j.definitionsConfirmees || j.bilan.reussis.length)) {
        if (destructive(j.demande) && j.bilan.finalisation !== 'terminee') {
          j.bilan.finalisation = 'bloquee'
          j.bilan.sourceConservee = true
          j.bilan.motifFinalisation = message(e)
        }
        try { this.journal.ecrire(j) } catch { /* Le dernier état durable reste reprenable. */ }
        return this.resultat(j)
      }
      return { statut: 'non-appliquee', motif: message(e) }
    } finally { this.enCours = false }
  }

  async reconcilier(operationId: string): Promise<ResultatOperationTheme> {
    this.exigerLibre()
    this.enCours = true
    let j: JournalThemesGitLab | null = null
    try {
      j = this.exigerJournal(operationId)
      const p = j.publication
      if (!p) return this.resultat(j)
      if (this.deps.journalPublication) {
        await reprendreOperationsGitLab({
          depot: this.deps.depot,
          coordination: this.deps.coordination,
          journal: this.deps.journalPublication,
          dirMiroir: this.deps.dirLocal,
        })
      }
      const commits = await this.deps.depot.rechercherCommits(this.deps.branche, `Sonal ${p.operationId}`)
      const retrouve = commits.find((commit) => commit.title === `Sonal ${p.operationId}`)
      if (!retrouve) {
        delete j.publication
        if (p.phase === 'finalisation') {
          j.bilan.finalisation = 'bloquee'
          j.bilan.sourceConservee = true
          j.bilan.motifFinalisation = 'Le commit de finalisation est absent ; il pourra être retenté.'
        }
        this.journal.ecrire(j)
        return this.resultat(j)
      }
      const fichier = await this.deps.depot.lireFichier(p.chemin, retrouve.id)
      if (!fichier || fichier.contenu !== p.contenu) {
        throw new PublicationInconnue('Le commit retrouvé ne prouve pas le contenu attendu ; aucun rejeu automatique.')
      }
      this.confirmer(j, p)
      j.termine = j.selectionnes.length === 0 && j.bilan.echecs.length === 0 && j.differes.length === 0
        && (!destructive(j.demande) || j.bilan.finalisation === 'terminee')
      this.journal.ecrire(j)
      return this.resultat(j)
    } catch (e) {
      return { statut: 'indeterminee', operationId: j?.operationId ?? operationId, motif: message(e),
        ...(j ? { bilan: this.bilan(j) } : {}) }
    } finally { this.enCours = false }
  }

  private async preparerDefinitions(j: JournalThemesGitLab | null, operationId: string, demande: DemandeOperationTheme,
    selectionnes: string[], differes: Array<{ id: string; motif: string }>, echecs: Array<{ id: string; motif: string }>,
    empreinteCorpus: string): Promise<JournalThemesGitLab> {
    const droit = await this.acquerir(this.ressource('corpus.json'), 'Le corpus GitLab')
    try {
      const fichier = await this.lire('corpus.json', this.deps.branche)
      const corpus = decoderCorpusTheme(fichier.contenu)
      exigerAbsenceDissociationGitLab(corpus)
      verifierDemandeOperationTheme(corpus, demande)
      verifierReferencesThemes(corpus, [])
      if (!j && empreinteTheme(corpus) !== empreinteCorpus) {
        throw new RefusOperationTheme('Le corpus a changé depuis l’aperçu ; recalculez-le.')
      }
      if (!j) {
        const definitions = preparerDefinitionsOperationTheme(corpus, demande, () => `cat-${randomUUID()}`)
        j = {
          version: 1,
          destination: this.destinationDuJournal(),
          operationId,
          tentatives: [operationId],
          demande: structuredClone(demande),
          cibles: definitions.ciblesCreees,
          definitionsConfirmees: false,
          selectionnes: [...selectionnes],
          differes,
          corpus,
          bilan: {
            reussis: [], echecs, ciblesCreees: [], sourceConservee: true,
            finalisation: destructive(demande) ? 'a-faire' : 'non-demandee',
          },
          termine: false,
        }
      } else {
        j.tentatives = [...new Set([...j.tentatives, operationId])]
        j.demande = structuredClone(demande)
        j.selectionnes = [...selectionnes]
        j.differes = differes
        j.bilan.echecs = echecs
        j.bilan.differes = differes
        j.corpus = corpus
        if (destructive(demande)) {
          j.bilan.finalisation = 'a-faire'
          j.bilan.sourceConservee = true
          delete j.bilan.motifFinalisation
        }
      }
      this.journal.ecrire(j)
      if (!j.definitionsConfirmees && j.cibles.length) {
        let index = 0
        const definitions = preparerDefinitionsOperationTheme(corpus, demande, () => j!.cibles[index++].id)
        verifierReferencesThemes(definitions.corpus, [])
        const contenu = JSON.stringify(definitions.corpus, null, 2)
        await this.publier(j, {
          operationId: this.nouvelleOperation(), phase: 'definitions', chemin: this.chemin('corpus.json'), contenu,
        }, [{ action: 'update', chemin: this.chemin('corpus.json'), contenu, commitId: fichier.commitId }], droit)
      } else {
        this.verifierDestinations(corpus, j)
        j.definitionsConfirmees = true
        j.bilan.ciblesCreees = structuredClone(j.cibles)
        this.installerCorpus(j.operationId, corpus)
        this.journal.ecrire(j)
      }
      return j
    } finally { await this.liberer(droit) }
  }

  private async modifierEntretien(j: JournalThemesGitLab, id: string, demande: DemandeOperationTheme,
    empreinteAttendue: string | undefined): Promise<void> {
    if (!empreinteAttendue) throw new RefusOperationTheme('Le manifeste de cet entretien est absent.')
    const droit = await this.acquerir(this.ressource(`entretiens/${id}.json`), `L’entretien « ${id} »`)
    try {
      this.exigerSansSession(id)
      const sha = await this.deps.depot.resoudreTete(this.deps.branche)
      const corpusFichier = await this.lire('corpus.json', sha)
      const corpus = decoderCorpusTheme(corpusFichier.contenu)
      exigerAbsenceDissociationGitLab(corpus)
      this.verifierDestinations(corpus, j)
      if (!Object.hasOwn(corpus.membership, id)) throw new RefusOperationTheme('L’entretien ne fait plus partie du corpus.')
      const source = await this.lire(`entretiens/${id}.json`, sha)
      const avant = JSON.parse(source.contenu) as EntretienFichier
      if (empreinteTheme(avant) !== empreinteAttendue) {
        throw new RefusOperationTheme('L’entretien a changé depuis l’aperçu ; ses choix doivent être recalculés.')
      }
      const data = this.deps.store.adapterEntretienOperationTheme(structuredClone(avant))
      validerEntretienTheme(data)
      const mutation = appliquerReaffectationsTheme(data, construirePlanEntretienTheme(data, id, demande, j.cibles))
      verifierReferencesThemes(corpus, [mutation.entretien])
      if (mutation.reaffectes + mutation.doublonsSupprimes === 0) {
        j.selectionnes = j.selectionnes.filter((reste) => reste !== id)
        this.journal.ecrire(j)
        return
      }
      mutation.entretien.lastModified = new Date(this.maintenant()).toISOString()
      const contenu = JSON.stringify(mutation.entretien, null, 2)
      this.exigerSansSession(id)
      await this.publier(j, {
        operationId: this.nouvelleOperation(), phase: 'entretien', chemin: this.chemin(`entretiens/${id}.json`), contenu,
        entretien: { id, reaffectes: mutation.reaffectes, doublonsSupprimes: mutation.doublonsSupprimes },
      }, [
        { action: 'update', chemin: this.chemin(`entretiens/${id}.json`), contenu, commitId: source.commitId },
        { action: 'garde', chemin: this.chemin('corpus.json'), commitId: corpusFichier.commitId, executable: corpusFichier.executable },
      ], droit)
    } finally { await this.liberer(droit) }
  }

  private async finaliser(j: JournalThemesGitLab, demande: DemandeOperationTheme): Promise<void> {
    const droit = await this.acquerir(this.ressource('corpus.json'), 'Le corpus GitLab')
    try {
      const sha = await this.deps.depot.resoudreTete(this.deps.branche)
      const fichier = await this.lire('corpus.json', sha)
      const corpus = decoderCorpusTheme(fichier.contenu)
      exigerAbsenceDissociationGitLab(corpus)
      this.verifierDestinations(corpus, j)
      const ids = Object.keys(corpus.membership)
      if (ids.length > MAX_ACTIONS_PUBLICATION - 2) {
        throw new RefusOperationTheme(`La suppression de thématiques GitLab est limitée à ${MAX_ACTIONS_PUBLICATION - 2} membres.`)
      }
      const gardes: ActionPlanGitLab[] = []
      const restants: ReferenceCodage[] = []
      const entretiens: EntretienFichier[] = []
      const sourcesSupprimees = sourcesSupprimeesOperationTheme(demande)
      for (const id of ids) {
        const source = await this.lire(`entretiens/${id}.json`, sha)
        const entretien = this.deps.store.adapterEntretienOperationTheme(JSON.parse(source.contenu) as EntretienFichier)
        validerEntretienTheme(entretien)
        entretiens.push(entretien)
        restants.push(...inventorierCodagesThemes(entretien, sourcesSupprimees).codages
          .map((a) => ({ entretienId: id, annotationId: a.annotationId })))
        gardes.push({ action: 'garde', chemin: this.chemin(`entretiens/${id}.json`),
          commitId: source.commitId, executable: source.executable })
      }
      const final = finaliserDefinitionsOperationTheme(corpus, demande, restants)
      verifierReferencesThemes(final, entretiens)
      const contenu = JSON.stringify(final, null, 2)
      await this.publier(j, {
        operationId: this.nouvelleOperation(), phase: 'finalisation', chemin: this.chemin('corpus.json'), contenu,
      }, [{ action: 'update', chemin: this.chemin('corpus.json'), contenu, commitId: fichier.commitId }, ...gardes], droit)
    } finally { await this.liberer(droit) }
  }

  private async publier(j: JournalThemesGitLab, p: PublicationThemeGitLabEnAttente,
    actions: ActionPlanGitLab[], droit: DroitsEditionGitLab): Promise<void> {
    j.publication = p
    try { this.journal.ecrire(j) } catch (e) { delete j.publication; throw e }
    let resultat: ResultatPublicationGitLab
    try {
      resultat = await this.deps.publication.publierSousDroit({
        operationId: p.operationId,
        nature: p.phase === 'entretien' ? 'transaction-entretien' : 'transaction-corpus',
        actions,
      }, droit)
    } catch (e) {
      delete j.publication
      this.journal.ecrire(j)
      throw e
    }
    if (resultat.statut === 'confirme') {
      this.confirmer(j, p)
      return
    }
    if (resultat.statut === 'indetermine') throw new PublicationInconnue('Le résultat du commit GitLab doit être réconcilié avant toute reprise.')
    delete j.publication
    this.journal.ecrire(j)
    try {
      if (resultat.raison !== 'droit-perdu' && await this.deps.coordination.revalider(droit)) {
        this.deps.coordination.reprendreApresConflitNeutre(droit)
      }
    } catch {
      // Un bail non réactivé reste suspendu et expirera sans masquer le refus connu.
    }
    const motifs = {
      conflit: 'La garde GitLab a changé pendant la publication.',
      'droit-perdu': 'Le bail GitLab a été perdu pendant la publication.',
      droits: 'GitLab refuse la publication avec les droits de ce compte.',
      limite: 'La publication dépasse une limite GitLab.',
      references: 'GitLab refuse les références de la publication.',
    }
    throw new RefusOperationTheme(resultat.raison === 'references' ? resultat.message : motifs[resultat.raison])
  }

  private confirmer(j: JournalThemesGitLab, p: PublicationThemeGitLabEnAttente): void {
    const confirme = structuredClone(j)
    if (p.phase === 'entretien' && p.entretien) {
      const entretien = JSON.parse(p.contenu) as EntretienFichier
      this.deps.store.installerEntretienDistant(p.entretien.id, entretien)
      confirme.selectionnes = confirme.selectionnes.filter((id) => id !== p.entretien!.id)
      const ancien = confirme.bilan.reussis.find((e) => e.id === p.entretien!.id)
      if (ancien) {
        ancien.reaffectes += p.entretien.reaffectes
        ancien.doublonsSupprimes += p.entretien.doublonsSupprimes
      } else confirme.bilan.reussis.push(p.entretien)
    } else {
      const corpus = decoderCorpusTheme(p.contenu)
      this.installerCorpus(`${j.operationId}-${p.phase}`, corpus)
      confirme.corpus = corpus
      if (p.phase === 'definitions') {
        confirme.definitionsConfirmees = true
        confirme.bilan.ciblesCreees = structuredClone(confirme.cibles)
      } else {
        confirme.bilan.finalisation = 'terminee'
        confirme.bilan.sourceConservee = false
        delete confirme.bilan.motifFinalisation
      }
    }
    delete confirme.publication
    this.journal.ecrire(confirme)
    Object.assign(j, confirme)
    delete j.publication
  }

  private bilan(j: JournalThemesGitLab) {
    const inconnu = j.publication?.entretien?.id
    return {
      ...structuredClone(j.bilan),
      inconnus: inconnu ? [{ id: inconnu, motif: 'Publication GitLab non confirmée ; aucun rejeu automatique.' }] : [],
      differes: structuredClone(j.differes),
    }
  }

  private resultat(j: JournalThemesGitLab): ResultatOperationTheme {
    if (!j.termine) return { statut: 'partielle', operationId: j.operationId, corpus: structuredClone(j.corpus), bilan: this.bilan(j) }
    return {
      statut: 'appliquee', corpus: structuredClone(j.corpus), entretiens: j.bilan.reussis.length,
      reaffectes: j.bilan.reussis.reduce((n, e) => n + e.reaffectes, 0),
      doublonsSupprimes: j.bilan.reussis.reduce((n, e) => n + e.doublonsSupprimes, 0),
    }
  }

  private verifierDestinations(corpus: CorpusFichier, j: JournalThemesGitLab): void {
    const demande = structuredClone(j.demande)
    if (demande.type === 'division') demande.choix = []
    verifierDemandeOperationTheme(corpus, demande)
    verifierReferencesThemes(corpus, [])
    if (j.definitionsConfirmees && j.cibles.some((c) => !Object.hasOwn(corpus.codebook, c.id))) {
      throw new RefusOperationTheme('Une destination créée a disparu ; le lot ne peut pas continuer.')
    }
  }

  private async lire(relatif: string, ref: string): Promise<FichierGitLab> {
    const fichier = await this.deps.depot.lireFichier(this.chemin(relatif), ref)
    if (!fichier) throw new RefusOperationTheme(`Le fichier ${relatif} est absent de GitLab.`)
    return fichier
  }

  private async acquerir(ressource: string, sujet: string): Promise<DroitsEditionGitLab> {
    const acquisition = await this.deps.coordination.acquireRessource(ressource)
    if (!acquisition.ok) {
      throw new RefusOperationTheme(`${sujet} est tenu par ${acquisition.tenupar?.userId ?? 'un autre poste'}.`)
    }
    return acquisition.droit
  }

  private async liberer(droit: DroitsEditionGitLab): Promise<void> {
    try {
      if (!this.deps.coordination.snapshot(droit).suspendu) await this.deps.coordination.liberer(droit)
    } catch { /* Un bail non rendu expirera et ne change pas le résultat déjà confirmé. */ }
  }

  private installerCorpus(id: string, corpus: CorpusFichier): void {
    this.deps.store.appliquerTransactionFichiers({
      operation: 'remplacement', id,
      corpusAvant: this.deps.store.ouvrir(), corpusApres: corpus, entretiens: [],
    })
  }

  private exigerSansSession(id: string): void {
    if (this.deps.sessionsLocales().includes(id)) {
      throw new RefusOperationTheme('Une session locale ou récupérable doit être fermée avant cette réaffectation.')
    }
  }

  private exigerJournal(operationId: string): JournalThemesGitLab {
    const j = this.journal.lire()
    if (!j || (j.operationId !== operationId && !j.tentatives.includes(operationId))) {
      throw new RefusOperationTheme('Lot GitLab absent ou appartenant à un autre corpus.')
    }
    return j
  }

  private exigerLibre(): void {
    if (this.enCours) throw new RefusOperationTheme('Une opération sur les thématiques est déjà en cours.')
  }

  private chemin(relatif: string): string { return this.racine ? `${this.racine}/${relatif}` : relatif }
  private ressource(relatif: string): string { return cleRessourceBailGitLab(this.deps.branche, this.chemin(relatif)) }

  /** Le journal recalcule la même empreinte que son constructeur sans exposer son chemin. */
  private destinationDuJournal(): string {
    return createHash('sha256')
      .update(`${this.deps.destinationId}\0${this.deps.branche}\0${this.racine}`)
      .digest('hex')
  }
}
