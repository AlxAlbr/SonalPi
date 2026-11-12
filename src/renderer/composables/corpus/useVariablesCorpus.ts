import { ref } from 'vue'
import type {
  CibleValeur,
  CorpusFichier,
  ItemLotValeur,
  MatriceCorpus,
  ModeleEAV,
  Variable,
} from '../../../shared/format'
import { afficherErreurGlobale, effacerErreurGlobaleSi } from '../../erreurs'

/** Gère les variables du corpus et leur matrice de valeurs. */
export function useVariablesCorpus(opts: { flush: () => Promise<void> }) {
  const variables = ref<Variable[]>([])
  const matrice = ref<MatriceCorpus>([])
  const matriceChargee = ref(false)
  const matriceEnCours = ref(false)
  const messageVar = ref<string | null>(null)
  const modelesUtilisateur = ref<ModeleEAV[]>([])
  let chargementMatrice: Promise<boolean> | null = null
  let generationMatrice = 0
  let derniereErreurMatrice: string | null = null

  const varsGen = () => variables.value.filter((variable) => variable.portee === 'entretien')
  const varsLoc = () => variables.value.filter((variable) => variable.portee === 'locuteur')

  function modalitesDe(idVar: string) {
    return variables.value.find((variable) => variable.id === idVar)?.modalites ?? []
  }

  function majVariables(brutes: Record<string, Variable>) {
    variables.value = Object.values(brutes).sort((a, b) => a.ordre - b.ordre)
  }

  /** Relit la matrice sans masquer le dernier résultat disponible. */
  async function rafraichirMatrice(): Promise<boolean> {
    if (chargementMatrice) return chargementMatrice
    const generation = generationMatrice
    matriceEnCours.value = true
    let requete!: Promise<boolean>
    requete = (async () => {
      try {
        const resultat = await window.sonal.corpus.matrice()
        if (generation !== generationMatrice) return false
        matrice.value = resultat
        matriceChargee.value = true
        if (derniereErreurMatrice) effacerErreurGlobaleSi(derniereErreurMatrice)
        derniereErreurMatrice = null
        return true
      } catch (erreur) {
        if (generation !== generationMatrice) return false
        derniereErreurMatrice = afficherErreurGlobale(
          erreur,
          'Actualisation des données impossible',
        )
        return false
      } finally {
        if (generation === generationMatrice) matriceEnCours.value = false
        if (chargementMatrice === requete) chargementMatrice = null
      }
    })()
    chargementMatrice = requete
    return requete
  }

  /** Oublie une matrice qui appartient au corpus précédent. */
  function reinitialiserMatrice() {
    generationMatrice++
    matrice.value = []
    matriceChargee.value = false
    matriceEnCours.value = false
    chargementMatrice = null
    if (derniereErreurMatrice) effacerErreurGlobaleSi(derniereErreurMatrice)
    derniereErreurMatrice = null
  }

  function reinitialiser() {
    variables.value = []
    messageVar.value = null
    reinitialiserMatrice()
  }

  async function ajouterVariable(portee: 'entretien' | 'locuteur'): Promise<string> {
    const resultat = await window.sonal.corpus.ajouterVariable('Nouvelle variable', portee)
    majVariables(resultat.corpus.variables)
    return resultat.id
  }

  async function renommerVariable(id: string, evenement: Event) {
    const libelle = (evenement.target as HTMLInputElement).value.trim()
    if (libelle) {
      const corpus = await window.sonal.corpus.modifierVariable(id, { lib: libelle })
      majVariables(corpus.variables)
    }
  }

  async function basculerPriveeVariable(id: string, privee: boolean) {
    const corpus = await window.sonal.corpus.modifierVariable(id, { priv: privee })
    majVariables(corpus.variables)
  }

  async function ajouterModalite(idVar: string, libelle = 'Modalité') {
    const corpus = await window.sonal.corpus.ajouterModalite(idVar, libelle)
    majVariables(corpus.variables)
  }

  async function ajouterModalitesModele(idVar: string, nomModele: string, libelles: string[]) {
    let corpus: CorpusFichier | null = null
    for (const libelle of libelles) {
      corpus = await window.sonal.corpus.ajouterModalite(idVar, libelle)
    }
    const variable = variables.value.find((item) => item.id === idVar)
    if (variable && variable.lib === 'Nouvelle variable') {
      corpus = await window.sonal.corpus.modifierVariable(idVar, { lib: nomModele })
    }
    if (corpus) majVariables(corpus.variables)
  }

  async function renommerModalite(idVar: string, idMod: string, evenement: Event) {
    const libelle = (evenement.target as HTMLInputElement).value.trim()
    if (libelle) {
      const corpus = await window.sonal.corpus.modifierModalite(idVar, idMod, libelle)
      majVariables(corpus.variables)
    }
  }

  async function lireModelesUtilisateur(): Promise<void> {
    modelesUtilisateur.value = await window.sonal.modeles.lire()
  }

  async function importerModeleUtilisateur(): Promise<string | null> {
    const fichier = await window.sonal.dialog.choisirJson()
    if (!fichier) return null
    try {
      const brut = JSON.parse(fichier.contenu) as unknown
      if (!brut || typeof brut !== 'object') return 'Fichier de modèle invalide (objet attendu).'
      const objet = brut as Record<string, unknown>
      const nom = typeof objet.nom === 'string' ? objet.nom.trim() : ''
      const modalites = Array.isArray(objet.modalites)
        ? objet.modalites.map((modalite) => typeof modalite === 'string' ? modalite.trim() : '')
        : []
      if (!nom) return 'Modèle sans nom — déclarez « nom » dans le JSON.'
      if (modalites.length === 0 || modalites.some((libelle) => !libelle)) {
        return 'Modèle sans modalités — « modalites » doit être une liste de textes non vides.'
      }
      modelesUtilisateur.value = await window.sonal.modeles.ajouter({ nom, modalites })
      return `Modèle « ${nom} » importé (${modalites.length} modalités).`
    } catch {
      return 'Fichier de modèle invalide — JSON mal formé.'
    }
  }

  async function validerCelluleTable(
    entretienId: string,
    cible: CibleValeur,
    idVar: string,
    idMod: string,
  ): Promise<string | null> {
    const resultat = await window.sonal.corpus.poserValeurLot([
      { entretienId, cible, idVar, idMod },
    ])
    if (resultat.echecs.length > 0) return resultat.echecs[0].raison
    await rafraichirMatrice()
    return null
  }

  async function poserGen(entretienId: string, idVar: string, idMod: string) {
    return validerCelluleTable(entretienId, { type: 'entretien' }, idVar, idMod)
  }

  async function poserLoc(entretienId: string, index: number, idVar: string, idMod: string) {
    return validerCelluleTable(entretienId, { type: 'locuteur', index }, idVar, idMod)
  }

  async function modaliteParLibelle(idVar: string, libelle: string): Promise<string> {
    const existante = modalitesDe(idVar).find((modalite) => modalite.lib === libelle)
    if (existante) return existante.id
    const corpus = await window.sonal.corpus.ajouterModalite(idVar, libelle)
    majVariables(corpus.variables)
    return modalitesDe(idVar).find((modalite) => modalite.lib === libelle)!.id
  }

  function poserValeurLot(items: ItemLotValeur[]) {
    return window.sonal.corpus.poserValeurLot(items)
  }

  async function poserGenLibelle(entretienId: string, idVar: string, libelle: string) {
    return poserGen(
      entretienId,
      idVar,
      libelle ? await modaliteParLibelle(idVar, libelle) : '',
    )
  }

  async function poserLocLibelle(
    entretienId: string,
    index: number,
    idVar: string,
    libelle: string,
  ) {
    return poserLoc(
      entretienId,
      index,
      idVar,
      libelle ? await modaliteParLibelle(idVar, libelle) : '',
    )
  }

  return {
    variables,
    matrice,
    matriceChargee,
    matriceEnCours,
    messageVar,
    modelesUtilisateur,
    varsGen,
    varsLoc,
    modalitesDe,
    majVariables,
    rafraichirMatrice,
    reinitialiserMatrice,
    reinitialiser,
    ajouterVariable,
    renommerVariable,
    basculerPriveeVariable,
    ajouterModalite,
    ajouterModalitesModele,
    renommerModalite,
    lireModelesUtilisateur,
    importerModeleUtilisateur,
    poserGen,
    poserLoc,
    poserGenLibelle,
    poserLocLibelle,
    modaliteParLibelle,
    poserValeurLot,
  }
}
