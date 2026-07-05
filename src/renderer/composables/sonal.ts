import { ref, watch, onMounted, provide, inject, type InjectionKey } from 'vue'
import { importerFichier } from '../import/sas'
import { exporterSonal } from '../import/exportSonal'
import type { CorpusFichier } from '../../shared/format'
import { useProfil } from './useProfil'
import { useCorpus } from './useCorpus'
import { useEntretien } from './useEntretien'

/**
 * ORCHESTRATION applicative (D-S12) : instancie et COUD les trois scopes (profil,
 * corpus, entretien) et porte la navigation. Créé UNE fois par l'App (`fournirSonal`),
 * `provide`/`inject` aux composants de vue → tous partagent le même éditeur et le
 * même modèle (les composables ne sont pas ré-instanciés).
 */
export function creerSonal() {
  const profil = useProfil()

  // Indirection pour casser le cycle : le scope corpus doit sauver l'entretien
  // ouvert avant un compte d'usages (`flush`), mais l'entretien est créé APRÈS le
  // corpus (il lui injecte `couleurTrait`). On route `flush` via un holder réaffecté.
  let sauverEntretien: () => Promise<void> = async () => {}
  const corpus = useCorpus({ flush: () => sauverEntretien() })

  const ent = useEntretien({
    couleurTrait: corpus.couleurTrait, // le marquage résout la couleur d'un code (corpus)
    apresSauvegarde: () => corpus.rafraichirUsages(), // après un save, les usages suivent
    codeExtraits: () => corpus.codeCourant.value, // filtre requête Extraits (vestige D-S7)
  })
  sauverEntretien = ent.sauver

  // --- Navigation SonalPi : Accueil → Corpus → Entretien (+ Table de données) ---
  const vue = ref<'accueil' | 'corpus' | 'entretien' | 'donnees'>('corpus')
  // Confirmation de suppression d'un thème DEPUIS l'entretien (D-S10, orchestration).
  const themeASupprimer = ref<{ id: string; nom: string; n: number } | null>(null)

  // Le corpus met à jour `codebook` (recolorer / (dés)activer / supprimer un thème)
  // → l'entretien redessine le marquage (couplage inter-scope par OBSERVATION).
  watch(corpus.codebook, () => ent.rafraichirDecorations())
  // Ouvrir l'onglet Données (écran entretien) rafraîchit la matrice corpus (requête).
  watch(ent.ongletDroite, (v) => {
    if (v === 'donnees') corpus.rafraichirMatrice()
  })

  // --- Orchestration : coud profil ↔ corpus ↔ entretien ---
  /** Applique un corpus chargé (définitions + membership) et RÉINITIALISE l'entretien
   *  ouvert — on change potentiellement de dossier. */
  async function appliquerCorpus(c: CorpusFichier) {
    ent.reinitialiser()
    corpus.membership.value = c.membership
    corpus.majCodebook(c.codebook)
    corpus.majVariables(c.variables)
    await corpus.rafraichirUsages()
  }

  async function chargerCorpus() {
    // Le corpus par défaut est chargé en fond (« Corpus courant » de l'Accueil est
    // prêt), mais on ATTERRIT sur l'ACCUEIL (flux SonalPi : choisir un corpus d'abord).
    await appliquerCorpus(await window.sonal.corpus.ouvrir())
    await profil.majDossierCourant()
    await profil.rafraichirRecents()
    vue.value = 'accueil'
  }

  /** « Ouvrir un corpus… » : le scope profil bascule le store sur un autre dossier
   *  et renvoie son contenu ; on l'applique au modèle. */
  async function choisirDossier() {
    const c = await profil.choisirDossier()
    if (!c) return
    await appliquerCorpus(c)
    vue.value = 'corpus'
  }
  /** Rouvrir un corpus récent (par son chemin). */
  async function ouvrirRecent(dir: string) {
    await appliquerCorpus(await profil.ouvrirDossier(dir))
    vue.value = 'corpus'
  }

  async function retourCorpus() {
    await ent.sauver()
    vue.value = 'corpus'
  }
  function allerAccueil() {
    vue.value = 'accueil'
  }
  /** Depuis l'Accueil : revenir au corpus déjà chargé (sans le relire). */
  function ouvrirCorpusCourant() {
    vue.value = 'corpus'
  }

  /** Entrer dans un entretien = le charger (scope entretien) ET basculer sur son écran. */
  async function ouvrirEntretien(id: string) {
    if (await ent.ouvrir(id)) vue.value = 'entretien'
  }

  async function nouvelEntretien() {
    await ent.sauver()
    const res = await window.sonal.corpus.creerEntretien('Nouvel entretien')
    corpus.membership.value = res.corpus.membership
    await ouvrirEntretien(res.id)
  }

  async function importer() {
    const f = await window.sonal.dialog.choisirImport()
    if (!f) return
    const r = importerFichier(f.nom, f.contenu, (html) =>
      new DOMParser().parseFromString(html, 'text/html'),
    )
    const titre = f.nom.replace(/\.[^.]+$/, '')
    const res = await window.sonal.corpus.importer(
      titre,
      { ...r.payload, legacy: r.legacy as unknown as Record<string, unknown> },
      r.codebook,
      r.variables,
    )
    corpus.membership.value = res.corpus.membership
    corpus.majCodebook(res.corpus.codebook)
    corpus.majVariables(res.corpus.variables)
    await ouvrirEntretien(res.id)
  }

  async function exporter() {
    if (!ent.ouvertId.value || !ent.editor.value) return
    await ent.sauver()
    const html = exporterSonal({
      ...ent.donneesExport(),
      codebook: corpus.codebook.value,
      variables: corpus.variables.value,
    })
    const titre = corpus.membership.value[ent.ouvertId.value]?.titre ?? 'entretien'
    await window.sonal.dialog.choisirExport(`${titre}.sonal`, html)
  }

  async function renommer(id: string, evt: Event) {
    const titre = (evt.target as HTMLInputElement).value.trim()
    if (titre) corpus.membership.value = (await window.sonal.corpus.renommerEntretien(id, titre)).membership
  }

  async function supprimer(id: string) {
    corpus.membership.value = (await window.sonal.corpus.supprimerEntretien(id)).membership
    if (ent.ouvertId.value === id) ent.reinitialiser()
  }

  // --- Table de données éditable (D-S11) : verrou de la ligne tenue + navigation ---
  /** Un entretien est « tenu » s'il est ouvert dans l'éditeur (mono-utilisateur :
   *  `ouvertId`) → sa ligne est en lecture seule dans la table (D-S11). */
  function tenu(entretienId: string): boolean {
    return ent.ouvertId.value === entretienId
  }
  async function allerDonnees() {
    await ent.sauver() // flush l'entretien ouvert → la table lit un disque à jour
    await corpus.rafraichirMatrice()
    vue.value = 'donnees'
  }

  // --- Suppression d'un thème DEPUIS l'entretien (D-S10 : croise corpus ↔ entretien) ---
  async function demanderSuppressionTheme(id: string) {
    ent.hintCodage.value = null
    const autres = await window.sonal.corpus.compterUsagesCode(id, ent.ouvertId.value ?? undefined)
    if (autres > 0) {
      ent.hintCodage.value = `« ${corpus.nomTheme(id)} » est utilisé dans ${autres} autre(s) entretien — suppression impossible ici.`
      return
    }
    const n = ent.entretien.annotations.filter((a) => a.type === 'codage' && a.code === id).length
    themeASupprimer.value = { id, nom: corpus.nomTheme(id), n }
  }
  /** Confirme : retire les codages de CET entretien (modèle=vérité), supprime la
   *  DÉFINITION au corpus (exceptId → ne recompte pas cet entretien), autosave. */
  async function confirmerSuppressionTheme() {
    const cible = themeASupprimer.value
    if (!cible) return
    ent.retirerCodagesDuCode(cible.id)
    const r = await window.sonal.corpus.supprimerCategorie(cible.id, ent.ouvertId.value ?? undefined)
    if (r.ok) corpus.majCodebook(r.corpus.codebook)
    themeASupprimer.value = null
    await ent.sauver()
  }

  const listeEntretiens = () =>
    Object.entries(corpus.membership.value).map(([id, ref]) => ({ id, ...ref }))

  onMounted(chargerCorpus)

  // Retour PLAT : les templates (App + composants) utilisent des noms nus. Les
  // wrappers d'orchestration (choisirDossier/ouvrirRecent) écrasent les bruts du profil.
  return {
    ...profil,
    ...corpus,
    ...ent,
    vue,
    themeASupprimer,
    appliquerCorpus,
    chargerCorpus,
    choisirDossier,
    ouvrirRecent,
    retourCorpus,
    allerAccueil,
    ouvrirCorpusCourant,
    ouvrirEntretien,
    nouvelEntretien,
    importer,
    exporter,
    renommer,
    supprimer,
    tenu,
    allerDonnees,
    demanderSuppressionTheme,
    confirmerSuppressionTheme,
    listeEntretiens,
  }
}

export type Sonal = ReturnType<typeof creerSonal>

const CLE: InjectionKey<Sonal> = Symbol('sonal')

/** À appeler UNE fois dans l'App : crée le contexte applicatif et le fournit. */
export function fournirSonal(): Sonal {
  const s = creerSonal()
  provide(CLE, s)
  return s
}
/** Dans un composant de vue : récupère le contexte applicatif partagé. */
export function utiliserSonal(): Sonal {
  const s = inject(CLE)
  if (!s) throw new Error('Contexte « sonal » absent (fournirSonal non appelé).')
  return s
}
