import { ref } from 'vue'
import { ordreThemes } from '../../shared/corpus'
import { couleurPourCode, couleurHexPourCode } from '../editor/decorations'
import type {
  Categorie,
  CibleValeur,
  EntretienRef,
  MatriceCorpus,
  Variable,
} from '../../shared/format'

/**
 * Scope CORPUS (D-S12) : définitions (codebook, variables), membership (index
 * LÉGER — titres/dates, jamais le contenu des entretiens) et REQUÊTES corpus
 * (matrice, usages) obtenues comme projections du main. Isomorphe à `corpus.json`
 * et à `shared/corpus/`. Ne tient jamais tous les entretiens.
 *
 * `flush` (injecté) : demande à l'orchestration de sauver l'entretien ouvert avant
 * un compte d'usages (les codages/valeurs doivent être sur disque) — dépendance de
 * scope déclarée sans connaître l'éditeur.
 */
export function useCorpus(opts: { flush: () => Promise<void> }) {
  const membership = ref<Record<string, EntretienRef>>({})
  const codebook = ref<Categorie[]>([]) // définitions triées par ordre
  const codeCourant = ref('') // thème choisi pour coder
  const usages = ref<Record<string, number>>({}) // usages par code (requête)
  const messageTheme = ref<string | null>(null) // ex. refus de suppression
  const themeEnEdition = ref<string | null>(null) // thème dont on édite le nom
  const variables = ref<Variable[]>([]) // définitions EAV
  const matrice = ref<MatriceCorpus>([]) // REQUÊTE, jamais stockée
  const messageVar = ref<string | null>(null) // refus de suppression variable/modalité

  const varsGen = () => variables.value.filter((v) => v.portee === 'entretien')
  const varsLoc = () => variables.value.filter((v) => v.portee === 'locuteur')

  /** Couleur d'un code : couleur STOCKÉE du codebook en priorité, sinon synthétisée
   *  (angle d'or). Recolorer un thème se reflète en direct via cette résolution. */
  function couleurTrait(code: string): string {
    return codebook.value.find((c) => c.id === code)?.couleur || couleurPourCode(code).trait
  }
  function couleurHex(c: Categorie): string {
    return c.couleur || couleurHexPourCode(c.codeExport)
  }
  function nomTheme(id: string): string {
    return codebook.value.find((c) => c.id === id)?.nom ?? id
  }
  function modalitesDe(idVar: string) {
    return variables.value.find((v) => v.id === idVar)?.modalites ?? []
  }
  /** Le codebook aplati en PRÉ-ORDRE (parent → enfants), avec profondeur + position
   *  de fratrie — pour l'affichage indenté et les ▲▼ bornés (hiérarchie D-S8). */
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
    usages.value = await window.sonal.corpus.usagesParCode()
  }
  async function rafraichirMatrice() {
    matrice.value = await window.sonal.corpus.matrice()
  }

  // --- Thèmes (codebook) ---
  async function ajouterTheme() {
    const res = await window.sonal.corpus.ajouterCategorie('Nouveau thème')
    majCodebook(res.corpus.codebook)
    codeCourant.value = res.id
  }
  /** Ajoute un sous-thème (enfant de `parentId`) — hiérarchie D-S8. */
  async function ajouterSousTheme(parentId: string) {
    const res = await window.sonal.corpus.ajouterCategorie('Nouveau sous-thème', parentId)
    majCodebook(res.corpus.codebook)
    codeCourant.value = res.id
  }
  /** Renommer / recolorer / (dés)activer : édite la DÉFINITION (corpus.json) →
   *  reflété partout en direct (l'App observe `codebook` → redessine le marquage). */
  async function modifierTheme(id: string, patch: { nom?: string; couleur?: string; actif?: boolean }) {
    majCodebook((await window.sonal.corpus.modifierCategorie(id, patch)).codebook)
  }
  async function deplacerTheme(id: string, sens: -1 | 1) {
    majCodebook((await window.sonal.corpus.deplacerCategorie(id, sens)).codebook)
  }
  function finRenommerTheme(id: string, evt: Event) {
    const nom = (evt.target as HTMLInputElement).value.trim()
    themeEnEdition.value = null
    if (nom && nom !== nomTheme(id)) modifierTheme(id, { nom })
  }
  function focusChamp(el: unknown) {
    if (el) (el as HTMLInputElement).focus()
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

  // --- Variables & modalités (EAV) ---
  async function ajouterVariable(portee: 'entretien' | 'locuteur') {
    majVariables((await window.sonal.corpus.ajouterVariable('Nouvelle variable', portee)).corpus.variables)
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
  async function ajouterModalite(idVar: string) {
    majVariables((await window.sonal.corpus.ajouterModalite(idVar, 'Modalité')).variables)
  }
  async function renommerModalite(idVar: string, idMod: string, evt: Event) {
    const lib = (evt.target as HTMLInputElement).value.trim()
    if (lib) majVariables((await window.sonal.corpus.modifierModalite(idVar, idMod, lib)).variables)
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

  // --- Table de données éditable (D-S11) : écriture ciblée + re-requête ---
  async function poserValeurTable(entretienId: string, cible: CibleValeur, idVar: string, idMod: string) {
    await window.sonal.corpus.poserValeur(entretienId, cible, idVar, idMod)
    await rafraichirMatrice()
  }
  function poserGen(entretienId: string, idVar: string, idMod: string) {
    return poserValeurTable(entretienId, { type: 'entretien' }, idVar, idMod)
  }
  function poserLoc(entretienId: string, index: number, idVar: string, idMod: string) {
    return poserValeurTable(entretienId, { type: 'locuteur', index }, idVar, idMod)
  }

  return {
    // état
    membership,
    codebook,
    codeCourant,
    usages,
    messageTheme,
    themeEnEdition,
    variables,
    matrice,
    messageVar,
    // dérivés / résolveurs
    varsGen,
    varsLoc,
    couleurTrait,
    couleurHex,
    nomTheme,
    modalitesDe,
    arbreThemes,
    // chargement / requêtes
    majCodebook,
    majVariables,
    rafraichirUsages,
    rafraichirMatrice,
    // thèmes
    ajouterTheme,
    ajouterSousTheme,
    modifierTheme,
    deplacerTheme,
    finRenommerTheme,
    focusChamp,
    supprimerTheme,
    // variables/modalités
    ajouterVariable,
    renommerVariable,
    supprimerVariable,
    ajouterModalite,
    renommerModalite,
    supprimerModalite,
    // table de données
    poserGen,
    poserLoc,
  }
}
