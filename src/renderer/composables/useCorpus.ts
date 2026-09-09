import { ref, toRaw } from 'vue'
import { ordreThemes } from '../../shared/corpus'
import { couleurPourCode, couleurHexPourCode } from '../editor/decorations'
import type {
  Categorie,
  CibleValeur,
  CorpusFichier,
  EntretienRef,
  ItemLotValeur,
  MatriceCorpus,
  ModeleEAV,
  NoteCategory,
  PatchCategorie,
  RegleAnon,
  SegmentThematique,
  Variable,
  ParamsAnon,
} from '../../shared/format'
import { paramsAnonDefaut } from '../../shared/format'
import { normaliserCategoriesNote } from '../../shared/entretien/notes'
import type { ScanRegle } from '../../shared/corpus/scanAnon'
import type { CommandePersonnes } from '../../shared/corpus/personnes'
import type { EntreeJournalCorpusVue, ResultatAnnulationCorpus } from '../../shared/corpus/journal'

/**
 *  Scope CORPUS : définitions (codebook, variables), membership (index LÉGER —
 *  titres/dates, jamais le contenu des entretiens) et REQUÊTES corpus (matrice,
 *  usages) obtenues comme projections du main. Isomorphe à `corpus.json` et à
 *  `shared/corpus/` ; ne tient jamais tous les entretiens.
 *
 *  `flush` (injecté) : demande à l'orchestration de sauver l'entretien ouvert
 *  avant un compte d'usages (les codages/valeurs doivent être sur disque) —
 *  dépendance de scope déclarée sans connaître l'éditeur.
 */
export function useCorpus(opts: { flush: () => Promise<void> }) {
  const membership = ref<Record<string, EntretienRef>>({})
  const codebook = ref<Categorie[]>([]) // définitions triées par ordre
  const codeCourant = ref('') // thème choisi pour coder
  const usages = ref<Record<string, number>>({}) // usages par code (requête)
  const resumes = ref<Record<string, SegmentThematique[]>>({}) // résumés thématiques (requête)
  const messageTheme = ref<string | null>(null) // ex. refus de suppression
  const variables = ref<Variable[]>([]) // définitions EAV
  const matrice = ref<MatriceCorpus>([]) // REQUÊTE, jamais stockée
  const messageVar = ref<string | null>(null) // refus de suppression variable/modalité
  // Registre « Mes modèles » (niveau profil, settings.json) : les modèles IMPORTÉS par l'utilisateur,
  // proposés dans « modèles… » à côté des intégrés.
  const modelesUtilisateur = ref<ModeleEAV[]>([])
  // Règles corpus et projection du scan de pseudonymisation.
  const reglesAnon = ref<RegleAnon[]>([])
  const scanAnon = ref<ScanRegle[]>([])
  const scanAnonCharge = ref(false)
  const scanAnonPerime = ref(true)
  const scanAnonEnCours = ref(false)
  const scanAnonErreur = ref<string | null>(null)
  const dernierScanAnon = ref<string | null>(null)
  let chargementScanAnon: Promise<boolean> | null = null
  // Étape 4a — paramètres anon (corpus.json.paramsAnon, défauts si absents).
  const paramsAnon = ref<ParamsAnon>(paramsAnonDefaut())
  // Catégories de note (définitions corpus, comme le codebook).
  // Un corpus existant sans le champ obtient les bacs par défaut en mémoire ;
  // ils ne sont écrits sur disque qu'au premier geste d'édition.
  const categoriesNote = ref<NoteCategory[]>(normaliserCategoriesNote())
  const messageCategorieNote = ref<string | null>(null) // ex. refus de suppression
  const entreesJournalCorpus = ref<EntreeJournalCorpusVue[]>([])
  const revisionPersonnesCorpus = ref(0)

  async function lirePersonnes() {
    await opts.flush()
    return window.sonal.corpus.personnesInventaire()
  }

  async function commanderPersonnes(commande: CommandePersonnes) {
    await opts.flush()
    return window.sonal.corpus.personnesCommander(toRaw(commande), true)
  }

  async function rafraichirJournalCorpus(): Promise<void> {
    await opts.flush()
    entreesJournalCorpus.value = await window.sonal.corpus.journalLister()
  }

  async function annulerEntreeJournalCorpus(id: string): Promise<ResultatAnnulationCorpus> {
    await opts.flush()
    const resultat = await window.sonal.corpus.journalAnnuler(id)
    if (resultat.ok) {
      if (resultat.impact.projections.includes('personnes')) revisionPersonnesCorpus.value++
      if (resultat.impact.projections.includes('matrice')) await rafraichirMatrice()
      if (resultat.impact.projections.includes('scanAnon')) perimerScanAnon()
    }
    await rafraichirJournalCorpus()
    return resultat
  }

  const varsGen = () => variables.value.filter((v) => v.portee === 'entretien')
  const varsLoc = () => variables.value.filter((v) => v.portee === 'locuteur')

  /** Couleur d'un code : couleur STOCKÉE du codebook en priorité,
   *  sinon synthétisée (angle d'or).
   *  Recolorer un thème se reflète en direct via cette résolution.
   *  Sans couleur stockée, la teinte est dérivée du `codeExport` (identité stable séquentielle `cat_NNN`) —
   *  PAREIL que la pastille/picker et l'export : un thème a UNE couleur partout (avant, le repli sur l'id aléatoire donnait une teinte différente de la pastille pour un thème neuf).
   */
  function couleurTrait(code: string): string {
    const cat = codebook.value.find((c) => c.id === code)
    return cat?.couleur || couleurPourCode(cat?.codeExport ?? code).trait
  }
  function couleurHex(c: Categorie): string {
    return c.couleur || couleurHexPourCode(c.codeExport)
  }
  /** Taille de police STOCKÉE d'un code (px) — `undefined` = taille du texte.
   *  Résolue par id à la projection, comme la couleur (jamais copiée à l'entretien). */
  function tailleTheme(code: string): number | undefined {
    return codebook.value.find((c) => c.id === code)?.taille
  }
  /** Un code est-il ACTIF (définition du codebook) ? Absent du codebook → actif (référence pendante inerte, traitée comme un thème ordinaire).
   *  Sert au scope entretien pour filtrer le marquage et bloquer le codage des thèmes inactifs. */
  function estCodeActif(code: string): boolean {
    return codebook.value.find((c) => c.id === code)?.actif ?? true
  }
  /** PEINTURE d'un segment de résumé thématique (parité SonalPi1) — partagée par les cartes Corpus et la bande du lecteur :
   *  couleurs des thèmes couvrants empilées en DÉGRADÉ VERTICAL à bandes égales ; le BLANC (thème « sans effet ») ne peint pas ;
   *  une pondération (taille > 16, règle SonalPi1) pose une bordure noire en bas ; rien à peindre → `masque`. */
  function peintureSegment(codes: string[]): {
    background?: string
    borderBottom?: string
    masque: boolean
  } {
    // Un thème inactif est « sans effet » (cohérence avec l'éditeur) : il ne peint ni couleur ni pondération,
    // sur les cartes et la bande du lecteur.
    const actifs = codes.filter((c) => estCodeActif(c))
    const couleurs = actifs
      .map((c) => couleurTrait(c))
      .filter((c) => !/^#f{3}(f{3})?$/i.test(c) && c.toLowerCase() !== 'white')
    const stops = couleurs.flatMap((coul, i) => [
      `${coul} ${((i / couleurs.length) * 100).toFixed(2)}%`,
      `${coul} ${(((i + 1) / couleurs.length) * 100).toFixed(2)}%`,
    ])
    const ponderation = actifs.some((c) => (tailleTheme(c) ?? 0) > 16)
    return {
      background: stops.length ? `linear-gradient(to bottom, ${stops.join(', ')})` : undefined,
      borderBottom: ponderation ? '3px solid #000' : undefined,
      masque: !stops.length && !ponderation,
    }
  }
  function nomTheme(id: string): string {
    return codebook.value.find((c) => c.id === id)?.nom ?? id
  }
  /** Nom d'une catégorie de note depuis son id (fallback « générale » :
   *  utile tant que le corpus n'est pas chargé ou après une suppression). */
  function nomCategorieNote(id: string): string {
    return categoriesNote.value.find((c) => c.id === id)?.nom ?? 'générale'
  }
  /** Couleur d'une catégorie de note depuis son id (fallback gris). */
  function couleurCategorieNote(id: string): string {
    return categoriesNote.value.find((c) => c.id === id)?.couleur ?? '#9e9e9e'
  }
  /** Id de la première catégorie (défaut du formulaire de création de note). */
  function categorieNoteDefaut(): string {
    return categoriesNote.value[0]?.id ?? 'ncat_generale'
  }
  /** Applique la liste du corpus (normalisée à la lecture —
   *  même chemin que `majCodebook`, appelée par l'orchestrateur à chaque chargement). */
  function majCategoriesNote(brutes?: NoteCategory[] | null) {
    categoriesNote.value = normaliserCategoriesNote(brutes)
  }
  function modalitesDe(idVar: string) {
    return variables.value.find((v) => v.id === idVar)?.modalites ?? []
  }
  /** Le codebook aplati en PRÉ-ORDRE (parent → enfants), avec profondeur + position de fratrie —
   *  pour l'affichage indenté et les ▲▼ bornés dans la fratrie. */
  function arbreThemes() {
    return ordreThemes(Object.fromEntries(codebook.value.map((c) => [c.id, c])))
  }

  function majCodebook(cats: Record<string, Categorie>) {
    codebook.value = Object.values(cats).sort((a, b) => a.ordre - b.ordre)
    if (!codeCourant.value && codebook.value.length > 0) codeCourant.value = codebook.value[0].id
  }
  function majVariables(vars: Record<string, Variable>) {
    variables.value = Object.values(vars).sort((a, b) => a.ordre - b.ordre)
  }
  async function rafraichirUsages() {
    usages.value = await window.sonal.corpus.usagesParCategorie()
    // Même carburant (les codages sur disque), mêmes moments de fraîcheur :
    // le calque des cartes Corpus (résumé thématique, parité SonalPi1) suit.
    resumes.value = await window.sonal.corpus.resumesThematiques()
  }
  async function rafraichirMatrice() {
    matrice.value = await window.sonal.corpus.matrice()
  }

  // --- Thèmes (codebook) ---
  async function ajouterTheme(): Promise<string> {
    const res = await window.sonal.corpus.ajouterCategorie('Nouveau thème')
    majCodebook(res.corpus.codebook)
    codeCourant.value = res.id
    return res.id
  }
  /** Ajoute un sous-thème (enfant de `parentId`). */
  async function ajouterSousTheme(parentId: string): Promise<string> {
    const res = await window.sonal.corpus.ajouterCategorie('Nouveau sous-thème', parentId)
    majCodebook(res.corpus.codebook)
    codeCourant.value = res.id
    return res.id
  }
  /** Renommer / recolorer / retailler / (dés)activer :
   *  édite la DÉFINITION (corpus.json) → reflété partout en direct (l'App observe `codebook` →
   *  redessine le marquage). */
  async function modifierTheme(id: string, patch: PatchCategorie) {
    majCodebook((await window.sonal.corpus.modifierCategorie(id, patch)).codebook)
  }
  async function deplacerTheme(id: string, sens: -1 | 1) {
    majCodebook((await window.sonal.corpus.deplacerCategorie(id, sens)).codebook)
  }
  /** Change le PARENT d'un thème (migration dans l'arbre) :
   *  sous un autre thème ou à la racine. Ses enfants restent accrochés à lui,
   *  ses codages suivent sans bouger (référence par id). */
  async function migrerTheme(id: string, parentId: string | null) {
    majCodebook((await window.sonal.corpus.migrerCategorie(id, parentId)).codebook)
  }
  async function supprimerTheme(id: string) {
    messageTheme.value = null
    await opts.flush() // les codages de l'entretien ouvert doivent être sur disque pour le compte
    const r = await window.sonal.corpus.supprimerCategorie(id)
    if (!r.ok) {
      messageTheme.value = `« ${nomTheme(id)} » est utilisé ${r.usages}× — retire d'abord ses codages.`
      return
    }
    majCodebook(r.corpus.codebook)
    if (codeCourant.value === id) codeCourant.value = codebook.value[0]?.id ?? ''
  }

  // --- Catégories de note (définitions corpus, gestes IPC) ---
  /** Ajoute une catégorie et renvoie son id (trouver-ou-créer : « autre… »
   *  crée puis sélectionne dans le formulaire de note). */
  async function ajouterCategorieNote(nom: string, couleur: string): Promise<string> {
    const r = await window.sonal.corpus.ajouterCategorieNote(nom, couleur)
    majCategoriesNote(r.corpus.categoriesNote)
    return r.id
  }
  async function renommerCategorieNote(id: string, nom: string) {
    majCategoriesNote((await window.sonal.corpus.renommerCategorieNote(id, nom)).categoriesNote)
  }
  async function majCouleurCategorieNote(id: string, couleur: string) {
    majCategoriesNote((await window.sonal.corpus.majCouleurCategorieNote(id, couleur)).categoriesNote)
  }
  /** Suppression REFUSÉE si une note (n'importe quel entretien du corpus)
   *  référence la catégorie — message affiché, comme les thèmes. */
  async function supprimerCategorieNote(id: string): Promise<string | null> {
    messageCategorieNote.value = null
    await opts.flush() // les notes de l'entretien ouvert doivent être sur disque pour le compte
    const r = await window.sonal.corpus.supprimerCategorieNote(id)
    if (!r.ok) {
      messageCategorieNote.value =
        `« ${nomCategorieNote(id)} » est utilisée ${r.usages}× — retire-la d'abord de tes notes.`
      return null
    }
    majCategoriesNote(r.corpus.categoriesNote)
    return id
  }

  // --- Variables & modalités (EAV) ---
  async function ajouterVariable(portee: 'entretien' | 'locuteur'): Promise<string> {
    const r = await window.sonal.corpus.ajouterVariable('Nouvelle variable', portee)
    majVariables(r.corpus.variables)
    return r.id // pour l'auto-focus de la ligne neuve (même geste que les thèmes)
  }
  async function renommerVariable(id: string, evt: Event) {
    const lib = (evt.target as HTMLInputElement).value.trim()
    if (lib) majVariables((await window.sonal.corpus.modifierVariable(id, { lib })).variables)
  }
  async function supprimerVariable(id: string) {
    messageVar.value = null
    await opts.flush()
    const r = await window.sonal.corpus.supprimerVariable(id)
    if (!r.ok) {
      messageVar.value = `Variable utilisée ${r.usages}× — retire d'abord ses valeurs.`
      return
    }
    majVariables(r.corpus.variables)
  }
  /** Statut SonalPi1 : privée = exclue des exports (le champ `priv` voyage déjà dans tabVar à l'import/export —
   *  ici on ne fait que l'éditer). */
  async function basculerPriveeVariable(id: string, priv: boolean) {
    majVariables((await window.sonal.corpus.modifierVariable(id, { priv })).variables)
  }
  async function ajouterModalite(idVar: string, lib = 'Modalité') {
    majVariables((await window.sonal.corpus.ajouterModalite(idVar, lib)).variables)
  }
  /** Modalités pré-remplies (parité SonalPi1) : ajoute le modèle en masse et baptise la variable du nom du modèle,
   *  si elle porte encore le nom par défaut. */
  async function ajouterModalitesModele(idVar: string, nomModele: string, libs: string[]) {
    let c: CorpusFichier | null = null
    for (const lib of libs) c = await window.sonal.corpus.ajouterModalite(idVar, lib)
    const v = variables.value.find((x) => x.id === idVar)
    if (v && v.lib === 'Nouvelle variable')
      c = await window.sonal.corpus.modifierVariable(idVar, { lib: nomModele })
    if (c) majVariables(c.variables)
  }
  async function renommerModalite(idVar: string, idMod: string, evt: Event) {
    const lib = (evt.target as HTMLInputElement).value.trim()
    if (lib) majVariables((await window.sonal.corpus.modifierModalite(idVar, idMod, lib)).variables)
  }

  // --- Modèles de modalités réutilisables (« Mes modèles », niveau profil) ---
  async function lireModelesUtilisateur(): Promise<void> {
    modelesUtilisateur.value = await window.sonal.modeles.lire()
  }
  /** Import d'un modèle depuis un JSON choisi : lit, valide, ajoute au registre (remplacement si le nom existe déjà),
   *  puis rafraîchit la liste locale.
   *  Renvoie un message pour l'UI (succès ou erreur de format). */
  async function importerModeleUtilisateur(): Promise<string | null> {
    const f = await window.sonal.dialog.choisirJson()
    if (!f) return null // dialogue annulé : pas de message
    try {
      const brut = JSON.parse(f.contenu) as unknown
      if (!brut || typeof brut !== 'object') return 'Fichier de modèle invalide (objet attendu).'
      const o = brut as Record<string, unknown>
      const nom = typeof o.nom === 'string' ? o.nom.trim() : ''
      const libs = Array.isArray(o.modalites) ? o.modalites.map((m) => (typeof m === 'string' ? m.trim() : '')) : []
      if (!nom) return 'Modèle sans nom — déclarez « nom » dans le JSON.'
      if (libs.length === 0 || libs.some((lib) => !lib))
        return 'Modèle sans modalités — « modalites » doit être une liste de textes non vides.'
      modelesUtilisateur.value = await window.sonal.modeles.ajouter({ nom, modalites: libs })
      return `Modèle « ${nom} » importé (${libs.length} modalités).`
    } catch {
      return 'Fichier de modèle invalide — JSON mal formé.'
    }
  }
  async function supprimerModalite(idVar: string, idMod: string) {
    messageVar.value = null
    await opts.flush()
    const r = await window.sonal.corpus.supprimerModalite(idVar, idMod)
    if (!r.ok) {
      messageVar.value = `Modalité utilisée ${r.usages}× — retire d'abord ses valeurs.`
      return
    }
    majVariables(r.corpus.variables)
  }

  // --- Table de données éditable : écriture ciblée + re-requête ---
  /** Valider UNE cellule = le primitif du lot avec UN item (verrou court →
   *  GET frais → PUT If-Match → miroir
   *  écrit-through ; en local, poserValeurLotLocal — mêmes résultats). Renvoie
   *  la raison NOMINATIVE du refus éventuel (null = succès) pour l'erreur
   *  inline de la cellule ; les rejets IPC (réseau…) ne sont PAS catchés : ils
   *  remontent à la bannière globale (erreurs.ts), comme pour le lot. */
  async function validerCelluleTable(
    entretienId: string,
    cible: CibleValeur,
    idVar: string,
    idMod: string,
  ): Promise<string | null> {
    const r = await window.sonal.corpus.poserValeurLot([{ entretienId, cible, idVar, idMod }])
    if (r.echecs.length > 0) return r.echecs[0].raison
    await rafraichirMatrice() // miroir fraîchi par le lot → re-requête suffit
    return null
  }
  async function poserGen(entretienId: string, idVar: string, idMod: string) {
    return validerCelluleTable(entretienId, { type: 'entretien' }, idVar, idMod)
  }
  async function poserLoc(entretienId: string, index: number, idVar: string, idMod: string) {
    return validerCelluleTable(entretienId, { type: 'locuteur', index }, idVar, idMod)
  }
  /** SAISIE LIBRE (parité SonalPi1 `definirValeur`) : trouve-ou-crée la modalité par LIBELLÉ (code max+1 si inconnu —
   *  l'export EAV exige une entrée de dictionnaire, une valeur hors dictionnaire serait ignorée à l'export). */
  async function modaliteParLibelle(idVar: string, lib: string): Promise<string> {
    const deja = modalitesDe(idVar).find((m) => m.lib === lib)
    if (deja) return deja.id
    majVariables((await window.sonal.corpus.ajouterModalite(idVar, lib)).variables)
    return modalitesDe(idVar).find((m) => m.lib === lib)!.id
  }
  /** LOT « modifier en lot » : une valeur appliquée à plusieurs entretiens —
   *  verrou court par entretien côté main ;
   *  échecs nommés, un échec ne bloque jamais les autres. */
  function poserValeurLot(items: ItemLotValeur[]) {
    return window.sonal.corpus.poserValeurLot(items)
  }

  // --- Règles corpus et scan de pseudonymisation. ---
  function perimerScanAnon() {
    scanAnonPerime.value = true
  }
  async function rafraichirReglesAnon() {
    reglesAnon.value = await window.sonal.corpus.reglesAnon()
    perimerScanAnon()
  }
  function reinitialiserScanAnon() {
    reglesAnon.value = []
    scanAnon.value = []
    scanAnonCharge.value = false
    scanAnonPerime.value = true
    scanAnonErreur.value = null
    dernierScanAnon.value = null
  }
  /** Relit les règles et les entretiens, sans lancer deux scans concurrents. */
  async function rafraichirScanAnon(force = true): Promise<boolean> {
    if (!force && scanAnonCharge.value && !scanAnonPerime.value) return true
    if (chargementScanAnon) return chargementScanAnon
    scanAnonEnCours.value = true
    scanAnonErreur.value = null
    chargementScanAnon = (async () => {
      try {
        const [regles, scan] = await Promise.all([
          window.sonal.corpus.reglesAnon(),
          window.sonal.corpus.scanAnon(),
        ])
        reglesAnon.value = regles
        scanAnon.value = scan
        scanAnonCharge.value = true
        scanAnonPerime.value = false
        dernierScanAnon.value = new Date().toISOString()
        return true
      } catch (e) {
        scanAnonErreur.value = e instanceof Error ? e.message : 'Le scan a échoué.'
        return false
      } finally {
        scanAnonEnCours.value = false
        chargementScanAnon = null
      }
    })()
    return chargementScanAnon
  }
  /** Écrit les paramètres anon (IPC transactionné) et reflète localement. */
  async function majParamsAnon(params: ParamsAnon) {
    paramsAnon.value = await window.sonal.corpus.paramsAnonEcrire(params)
  }
  async function poserGenLibelle(entretienId: string, idVar: string, lib: string) {
    return poserGen(entretienId, idVar, lib ? await modaliteParLibelle(idVar, lib) : '')
  }
  async function poserLocLibelle(entretienId: string, index: number, idVar: string, lib: string) {
    return poserLoc(entretienId, index, idVar, lib ? await modaliteParLibelle(idVar, lib) : '')
  }

  return {
    // état
    membership,
    codebook,
    codeCourant,
    usages,
    resumes,
    messageTheme,
    variables,
    matrice,
    messageVar,
    // dérivés / résolveurs
    varsGen,
    varsLoc,
    couleurTrait,
    couleurHex,
    tailleTheme,
    estCodeActif,
    peintureSegment,
    nomTheme,
    modalitesDe,
    arbreThemes,
    // chargement / requêtes
    majCodebook,
    majVariables,
    rafraichirUsages,
    rafraichirMatrice,
    // règles corpus et scan anon.
    reglesAnon,
    scanAnon,
    scanAnonCharge,
    scanAnonPerime,
    scanAnonEnCours,
    scanAnonErreur,
    dernierScanAnon,
    rafraichirScanAnon,
    rafraichirReglesAnon,
    perimerScanAnon,
    reinitialiserScanAnon,
    paramsAnon,
    majParamsAnon,
    // catégories de note (définitions corpus)
    categoriesNote,
    messageCategorieNote,
    majCategoriesNote,
    nomCategorieNote,
    couleurCategorieNote,
    categorieNoteDefaut,
    ajouterCategorieNote,
    renommerCategorieNote,
    majCouleurCategorieNote,
    supprimerCategorieNote,
    // Journal du corpus.
    entreesJournalCorpus,
    revisionPersonnesCorpus,
    rafraichirJournalCorpus,
    annulerEntreeJournalCorpus,
    // thèmes
    ajouterTheme,
    ajouterSousTheme,
    modifierTheme,
    deplacerTheme,
    migrerTheme,
    supprimerTheme,
    lirePersonnes,
    commanderPersonnes,
    // variables/modalités
    ajouterVariable,
    renommerVariable,
    basculerPriveeVariable,
    supprimerVariable,
    ajouterModalite,
    ajouterModalitesModele,
    renommerModalite,
    supprimerModalite,
    // modèles de modalités réutilisables (« Mes modèles », niveau profil)
    modelesUtilisateur,
    lireModelesUtilisateur,
    importerModeleUtilisateur,
    // table de données / saisie libre
    poserGen,
    poserLoc,
    poserGenLibelle,
    poserLocLibelle,
    modaliteParLibelle,
    poserValeurLot,
  }
}
