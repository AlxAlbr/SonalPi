import { computed, ref, watch, type Ref } from 'vue'
import type { Editor } from '@tiptap/core'
import { reperagePluginKey } from '../../editor/reperage'
import { snapToWord } from '../../editor/snap'
import { aplatir, occurrencesDe, plageVersPM, instructionsValiderAnon } from '../../../shared/entretien/anon/anonymisation'
import { hitsAAAnonymiser, hitsDeCategorie, hitsIncluses, type HitAAAnonymiser } from '../../../shared/entretien/anon/compteursAnon'
import { memoriserDefinitionLocale, retirerDefinitionLocale, validerMemoireLocale, normaliserPseudosDeclares, type DefinitionAnonLocale } from '../../../shared/entretien/anon/definitionsLocales'
import { dedupliquerValeursAnon, validerDefinitionAnon } from '../../../shared/corpus/definitionsAnon'
import { empreinteAnon, matchesAliases } from '../../../shared/entretien/anon/classification'
import { parserAliases } from '../../../shared/entretien/anon/alias'
import {
  cleEntite,
  trouverBrouillon,
  ajouterBrouillon,
  majBrouillon,
  retirerBrouillon,
  consommerBrouillon,
  lignesAnonUnifiees,
  type LigneAnon,
} from '../../../shared/entretien/anon/brouillonsAnon'
import { estOrpheline, type Annotation } from '../../../shared/entretien/annotation'
import { retirerAnnotation, type Entretien } from '../../../shared/entretien/entretien'
import { detecterDivergencesPortee } from '../../../shared/entretien/anon/reconciliation'
import { suggestionCoeur } from '../../../shared/entretien/anon/motsLiaison'
import type { BrouillonAnon, RegleAnon, MotsLiaisonParams, Locuteur } from '../../../shared/format'
import { lancerOperationGlobale } from '../../operationGlobaleCorpus'

type LireEditeur = () => Editor | null

export function useAnonymisationEntretien(deps: {
  entretien: Entretien
  locuteurs: Ref<Locuteur[]>
  ouvertId: Ref<string | null>
  ongletDroite: Ref<string>
  lireEditeur: LireEditeur
  reglesAnon: () => RegleAnon[]
  rafraichirReglesCorpus?: () => Promise<void>
  publierAvantSuppressionDefinition?: () => Promise<boolean>
  demanderDissociationCorpus?: (
    regleId: string,
    cible: 'entretien' | 'brouillon',
    entite: string,
  ) => Promise<boolean>
  prioriteAnon: () => 'corpus' | 'entretien'
  motsLiaison?: () => MotsLiaisonParams
  thematiques?: () => { actif: boolean; liste: string[] }
  categoriserRegle?: (regleId: string, categorie: string | null) => Promise<void>
  rafraichirProjections: () => void
  rafraichirDecorations: () => void
  planifierSauvegarde: () => void
}) {
  const auteur = 'moi'
  const genId = () => 'a-' + Math.random().toString(36).slice(2, 9)
  const entretien = deps.entretien
  /** La bascule des vues concerne le texte et les noms des locuteurs. */
  const pseudonymisationUtilisee = computed(() =>
    entretien.annotations.some((a) => a.type === 'anon')
    || deps.locuteurs.value.some((locuteur) => !!locuteur.pseudo?.trim()))
  /** Signale les applications effectives, y compris après une confirmation. */
  const applicationsAnon = ref(0)
  const selectionAnon = ref<{ texte: string; from: number; to: number } | null>(null)
  const hintAnon = ref<string | null>(null)
  const lignesAnon = ref<LigneAnon[]>([])
  /** Hits « à anonymiser » par cle de ligne — REQUÊTE recalculée à l'affichage
   *  de l'onglet, au clic « ⟳ » et après chaque geste anon (pas à chaque
   *  frappe : le compteur peut être brièvement en retard sur le texte). */
  const hitsAAnonymiserParCle = ref<Record<string, HitAAAnonymiser[]>>({})
  /** Incluses par cle de ligne : entités absorbantes distinctes — l'effectif
   *  « +N » vient de la projection (`ligne.nbIncluse`). REQUÊTE recalculée
   *  avec les autres compteurs. */
  const inclusesParCle = ref<Record<string, string[]>>({})
  function rafraichirCompteursAAAnonymiser() {
    const ed = deps.lireEditeur()
    if (!ed) {
      hitsAAnonymiserParCle.value = {}
      return
    }
    const corpsTexte = ed.getJSON()
    const texteDe = (f: number, t: number) => ed.state.doc.textBetween(f, t, ' ')
    const out: Record<string, HitAAAnonymiser[]> = {}
    const incl: Record<string, string[]> = {}
    for (const l of lignesAnon.value) {
      const aliases = parserAliases(l.entite)
      const cles = [l.cle, ...aliases.map((a) => cleEntite(a))]
      const hits = hitsAAAnonymiser(corpsTexte, aliases, entretien.annotations, cles, texteDe)
      if (hits.length) out[l.cle] = hits
      const abs = hitsIncluses(corpsTexte, aliases, entretien.annotations, cles, texteDe)
      if (abs.length) incl[l.cle] = [...new Set(abs.map((h) => h.par))]
    }
    hitsAAnonymiserParCle.value = out
    inclusesParCle.value = incl
  }
  // À l'ouverture de l'onglet anon (et à sa réouverture) : compteurs frais.
  watch(deps.ongletDroite, (v) => {
    if (v === 'anon') rafraichirCompteursAAAnonymiser()
  })

  // --- Repérage ◄ i/N ► (loupe) — navigation NON destructive entre occurrences ---
  /** Repérage en cours sur une ligne : catégorie navigable (+ variante de
   *  pseudo éventuelle), liste des hits PM triés et index courant. */
  const reperageAnon = ref<{
    cle: string
    categorie: 'anonymise' | 'exception' | 'a-anonymiser'
    variante?: string
    hits: HitAAAnonymiser[]
    index: number
  } | null>(null)
  /** Cale l'éditeur sur le hit courant : sélection de la plage (sans aucun
   *  marquage), décoration transitoire « hit » + scroll centré. */
  function calerSurHitCourant() {
    const ed = deps.lireEditeur()
    const r = reperageAnon.value
    if (!ed || !r || r.hits.length === 0) return
    const hit = r.hits[r.index]
    ed.commands.setTextSelection({ from: hit.from, to: hit.to })
    ed.view.dispatch(ed.state.tr.setMeta(reperagePluginKey, { de: hit.from, a: hit.to }))
    const dom = ed.view.domAtPos(hit.from).node
    const el = dom instanceof HTMLElement ? dom : dom.parentElement
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  /** Recalcule les hits du repérage EN COURS (après une action qui a changé le
   *  modèle) ; index borné à la nouvelle liste, repérage arrêté si vide. */
  function rafraichirReperage() {
    const r = reperageAnon.value
    if (!r) return
    const hits = hitsDuRepere(r)
    if (hits.length === 0) {
      arreterReperage()
      return
    }
    r.hits = hits
    if (r.index >= hits.length) r.index = hits.length - 1
    calerSurHitCourant()
  }
  function hitsDuRepere(r: { cle: string; categorie: 'anonymise' | 'exception' | 'a-anonymiser'; variante?: string }): HitAAAnonymiser[] {
    const ed = deps.lireEditeur()
    if (!ed) return []
    if (r.categorie === 'a-anonymiser') {
      const aliases = parserAliases(entiteDeCle(r.cle))
      return hitsAAAnonymiser(
        ed.getJSON(),
        aliases,
        entretien.annotations,
        [r.cle, ...aliases.map((a) => cleEntite(a))],
        (f, t) => ed.state.doc.textBetween(f, t, ' '),
      )
    }
    return hitsDeCategorie(entretien.annotations, r.cle, r.categorie, (f, t) => ed.state.doc.textBetween(f, t, ' '), r.variante)
  }
  /** Texte d'entité d'une cle : celui de la ligne projetée (suit le doc). */
  function entiteDeCle(cle: string): string {
    return lignesAnon.value.find((l) => l.cle === cle)?.entite ?? ''
  }
  /** Démarre (ou bascule) le repérage d'une catégorie de compteur. Un second
   *  clic sur la même catégorie l'arrête. */
  function demarrerReperage(cle: string, categorie: 'anonymise' | 'exception' | 'a-anonymiser', variante?: string) {
    const meme =
      reperageAnon.value &&
      reperageAnon.value.cle === cle &&
      reperageAnon.value.categorie === categorie &&
      reperageAnon.value.variante?.toLowerCase() === variante?.toLowerCase()
    if (meme) {
      arreterReperage()
      return
    }
    const hits = hitsDuRepere({ cle, categorie, variante })
    if (hits.length === 0) {
      hintAnon.value = "Aucune occurrence trouvée pour cette ligne."
      return
    }
    reperageAnon.value = { cle, categorie, variante, hits, index: 0 }
    calerSurHitCourant()
  }
  /** Pas de navigation ◄ / ► (modulo, comme SonalPi1). */
  function naviguerReperage(sens: number) {
    const r = reperageAnon.value
    if (!r || r.hits.length === 0) return
    r.index = (r.index + sens + r.hits.length) % r.hits.length
    calerSurHitCourant()
  }
  /** Stoppe le repérage et efface la décoration transitoire. */
  function arreterReperage() {
    reperageAnon.value = null
    const ed = deps.lireEditeur()
    if (ed) ed.view.dispatch(ed.state.tr.setMeta(reperagePluginKey, null))
  }


  // Brouillons d'anonymisation entretien-locaux (pas des règles) : entités
  // saisies sans occurrence posée. Persistés dans entretiens/<id>.json.brouillonsAnon.
  const brouillonsAnon = ref<BrouillonAnon[]>([])
  // Mémoire fichier de l'ensemble multi-pseudo par entité (clé `cleEntite`),
  // quand une entité autonome en déclare au moins deux.
  const pseudosDeclares = ref<Record<string, string[]>>(Object.create(null))
  const definitionsAnonLocales = ref<DefinitionAnonLocale[]>([])

  /** Dialogue de divergence à la poussée vers le corpus : une règle
   *  existante porte des pseudos différents de l'entité qu'on pousse → proposer
   *  « Aligner (le pseudo de la règle gagne) / Garder les deux / Annuler ». */
  const dialoguePorteeCorpus = ref<{
    entite: string
    pseudosCible: string[]
    regleExistanteId: string
    reglePseudos: string[]
    regleEntite?: string[]
    cas: 'brouillon' | 'fichier'
    couvertureConfirmee?: string
  } | null>(null)

  /** Lignes du tableau Anon = fusion des brouillons (0 occurrence) et des
   *  occurrences anon posées, une ligne par entité. L'état (brouillon/
   *  entretien) est DÉRIVÉ. Le texte d'une occurrence se lit sur le doc
   *  courant : si le texte est édité, l'entité suit. */
  function rafraichirLignesAnon() {
    const ed = deps.lireEditeur()
    if (!ed) {
      lignesAnon.value = []
      return
    }
    const occurrences = entretien.annotations
      .filter((a) => a.type === 'anon' && !estOrpheline(a))
      .map((a) => ({ id: a.id, from: a.from, to: a.to, pseudo: a.pseudo, etat: a.etat, regle: a.regle }))
    // Prédicat d'inclusion : une occurrence recouverte en entier par une
    // annotation anon d'une AUTRE entité plus longue est masquée (incluse).
    const texteDePM = (f: number, t: number) => ed.state.doc.textBetween(f, t, ' ')
    const estIncluse = (o: { from: number; to: number }) => {
      const cleOcc = cleEntite(texteDePM(o.from, o.to))
      return entretien.annotations.some(
        (y) =>
          y.type === 'anon' &&
          !estOrpheline(y) &&
          y.from <= o.from &&
          o.to <= y.to &&
          y.to - y.from > o.to - o.from &&
          cleEntite(texteDePM(y.from, y.to)) !== cleOcc,
      )
    }
    lignesAnon.value = lignesAnonUnifiees(
      brouillonsAnon.value,
      occurrences,
      texteDePM,
      pseudosDeclares.value,
      deps.reglesAnon(),
      estIncluse,
      definitionsAnonLocales.value,
    )
  }

  // --- Anonymisation (occurrences + brouillons) ---
  // Non journalisé : valider une ligne peut poser/relabeler PLUSIEURS occurrences
  // d'un coup, ce qui ne se moule pas sur les inverses à 1 action du journal.
  // La suppression d'une ligne (✕) reste l'inverse manuel, comme les thèmes.

  /** Clefs d'appartenance d'une ligne : sa cle de groupe PLUS chaque alias
   *  (une occurrence « Lyons » appartient à la ligne « Lyon/Lyons »). */
  function clesDeLigne(ligne: LigneAnon): Set<string> {
    const s = new Set<string>([ligne.cle.toLowerCase()])
    for (const a of parserAliases(ligne.entite)) s.add(cleEntite(a))
    if (ligne.regle) {
      const r = deps.reglesAnon().find((x) => x.id === ligne.regle)
      for (const e of r?.entite ?? []) {
        for (const a of parserAliases(e)) s.add(cleEntite(a))
      }
    }
    return s
  }
  /** L'annotation appartient-elle à cette ligne (par alias du texte courant) ? */
  function annotationDeLigne(a: Annotation, ligne: LigneAnon): boolean {
    return clesDeLigne(ligne).has(lineCle(a))
  }
  /** Une entité est-elle déjà présente dans le tableau (brouillon ou occurrence) ?
   *  Renvoie la cle de la ligne existante, ou null. Sert au composant pour
   *  décider, à la sélection : peupler la ligne de saisie ou scroller vers
   *  la ligne existante (pas de doublon). Partage d'ALIAS : sélectionner
   *  « Lyons » quand « Lyon/Lyons » existe → ligne existante. */
  function entiteExisteDeja(entite: string): string | null {
    const e = entite.trim()
    if (!e) return null
    const brouillon = trouverBrouillon(brouillonsAnon.value, e)
    if (brouillon) return cleEntite(brouillon.entite)
    const clesSaisie = new Set(parserAliases(e).map(cleEntite))
    // Parmi les lignes projetées (groupes déclarés inclus).
    for (const l of lignesAnon.value) {
      for (const a of parserAliases(l.entite)) {
        if (clesSaisie.has(cleEntite(a))) return l.cle
      }
      for (const a of cleEntite(l.entite).split('/')) {
        if (clesSaisie.has(a)) return l.cle
      }
    }
    const ed = deps.lireEditeur()
    if (ed) {
      for (const a of entretien.annotations) {
        if (a.type !== 'anon' || estOrpheline(a)) continue
        if (clesSaisie.has(cleEntite(ed.state.doc.textBetween(a.from, a.to, ' ')))) return cleEntite(e)
      }
    }
    return null
  }

  /** Crée un brouillon (entité saisie, sans occurrence posée). No-op si l'entité
   *  existe déjà (brouillon ou occurrence). Auto-sauvé : le brouillon survit
   *  à un changement de ligne sans validation. Pseudo optionnel. */
  function creerBrouillon(entite: string, pseudo?: string) {
    const e = entite.trim()
    if (!e || entiteExisteDeja(e)) return
    try {
      memoriserDefinitionLocale(definitionsAnonLocales.value, { entite: parserAliases(e), pseudos: pseudo?.split('/') ?? [], etat: 'brouillon' })
    } catch (erreur) { hintAnon.value = erreur instanceof Error ? erreur.message : 'Définition locale invalide.'; return }
    ajouterBrouillon(brouillonsAnon.value, e, pseudo)
    deps.rafraichirProjections()
    deps.planifierSauvegarde()
  }

  /** Met à jour le pseudo d'un brouillon existant (édition en cours de ligne
   *  brouillon non validée). Auto-sauvé au blur du champ Pseudo. */
  function majBrouillonLigne(entite: string, pseudo: string) {
    const definition = definitionsAnonLocales.value.find((d) => cleEntite(d.entite.join('/')) === cleEntite(entite))
    try {
      memoriserDefinitionLocale(definitionsAnonLocales.value, { entite: parserAliases(entite), pseudos: pseudo.split('/'), etat: 'brouillon', categorie: definition?.categorie })
      const declares = definitionsAnonLocales.value.find((d) => cleEntite(d.entite.join('/')) === cleEntite(entite))!.pseudos
      if (declares.length > 1) pseudosDeclares.value[cleEntite(entite)] = [...declares]
      else delete pseudosDeclares.value[cleEntite(entite)]
    } catch (erreur) { hintAnon.value = erreur instanceof Error ? erreur.message : 'Définition locale invalide.' }
    majBrouillon(brouillonsAnon.value, entite, pseudo)
    deps.rafraichirProjections()
    deps.planifierSauvegarde()
  }

  // --- Suggestion d'entité-cœur (mots de liaison) ---
  /** Suggestion courante (null = rien à proposer / déjà traitée). Une seule
   *  modale à la fois : une nouvelle validation remplace une suggestion non
   *  traitée ; « Non » ne mémorise rien. */
  const suggestionLiaison = ref<{
    entiteCoeur: string
    pseudoCoeur: string
    portee: 'entretien' | 'corpus'
  } | null>(null)

  /** Après une validation RÉUSSIE : calcule l'entité-cœur éventuelle (« à Lyon »
   *  validé → proposer « Lyon ») à la MÊME portée que la validation effective.
   *  La décision est PURE (motsLiaison.ts) — réglage, invariants multi-alias/
   *  multi-pseudo, règle-cœur déjà existante ; ici on ne porte que le résultat
   *  à la modale. */
  function proposerCoeur(entite: string, pseudo: string, portee: 'entretien' | 'corpus') {
    const det = suggestionCoeur(
      deps.motsLiaison?.(),
      entite,
      pseudo,
      lignesAnon.value.map((l) => l.cle),
    )
    if (!det) return
    suggestionLiaison.value = { ...det, portee }
  }

  /** « Oui » : crée la règle-cœur au même niveau que l'affixée, par le geste
   *  standard (brouillon puis chemin de portée). Les occurrences de « Lyon »
   *  présentes dans le texte sont posées par ce geste — les chevauchements
   *  suivent le moteur existant (« le large absorbe l'étroit »). */
  async function accepterSuggestionLiaison() {
    const s = suggestionLiaison.value
    if (!s) return
    suggestionLiaison.value = null
    creerBrouillon(s.entiteCoeur, s.pseudoCoeur)
    await changerPorteeAnon(s.entiteCoeur, s.portee)
  }

  /** « Non » : rien n'est créé, aucun refus mémorisé. */
  function refuserSuggestionLiaison() {
    suggestionLiaison.value = null
  }

  const confirmationCouverture = ref<{ entite: string; pseudo: string; nb: number; empreinte: string } | null>(null)
  let suiteCouverture: (() => void | Promise<unknown>) | null = null
  function empreinteEdition(entite: string): string {
    return empreinteAnon({ corpsTexte: deps.lireEditeur()?.getJSON(), annotations: entretien.annotations },
      [entite, deps.ouvertId.value, brouillonsAnon.value, pseudosDeclares.value, definitionsAnonLocales.value])
  }
  function demanderCouverture(entite: string, pseudo: string, nb: number, suite: () => void | Promise<unknown>) {
    confirmationCouverture.value = { entite, pseudo, nb, empreinte: empreinteEdition(entite) }
    suiteCouverture = suite
  }
  function refuserCouverture() {
    confirmationCouverture.value = null
    suiteCouverture = null
  }
  async function accepterCouverture() {
    const demande = confirmationCouverture.value
    const suite = suiteCouverture
    refuserCouverture()
    if (!demande || !suite || !deps.lireEditeur()) return
    if (empreinteEdition(demande.entite) !== demande.empreinte) {
      hintAnon.value = 'Le texte ou les décisions ont changé. Examinez à nouveau la couverture des exceptions.'
      return
    }
    try { await suite() }
    catch { hintAnon.value = 'La promotion n’a pas pu aboutir. Vérifiez les règles du corpus avant de recommencer.' }
  }

  function instructionsCorpus(ligne: LigneAnon, pseudo: string, couvrir = false) {
    const ed = deps.lireEditeur()!
    const plat = aplatir(ed.getJSON())
    const aliases = parserAliases(ligne.entite)
    const matches = matchesAliases(plat.texte, aliases).flatMap((m) => {
      const pm = plageVersPM(plat, m.from, m.to)
      return pm ? [pm] : []
    })
    return instructionsValiderAnon(entretien.annotations, matches, aliases.map(cleEntite), pseudo,
      (f, t) => ed.state.doc.textBetween(f, t, ' '), genId, undefined, couvrir)
  }
  function autoriserCouvertureCorpus(ligne: LigneAnon, confirmation: string | undefined, suite: (empreinte: string) => Promise<unknown>): boolean {
    if (!deps.lireEditeur()) return false
    const empreinte = empreinteEdition(ligne.entite)
    if (confirmation && confirmation !== empreinte) {
      hintAnon.value = 'Le texte ou les décisions ont changé pendant la promotion. Recommencez après examen.'
      return false
    }
    const instructions = instructionsCorpus(ligne, ligne.pseudo.split(' / ')[0])
    if (instructions.exceptionsProtegees.length && !confirmation) {
      demanderCouverture(ligne.entite, ligne.pseudo, instructions.exceptionsProtegees.length, () => suite(empreinte))
      return false
    }
    return true
  }

  /** Pose les occurrences libres en conservant les variantes déjà choisies.
   *  Couvrir une exception interne nécessite une confirmation explicite. */
  function validerAnon(entite: string, pseudo: string, couvrirExceptions = false) {
    const ed = deps.lireEditeur()
    if (!ed) return
    const e = entite.trim()
    const p = pseudo.trim()
    if (!e) {
      hintAnon.value = "Sélectionne d'abord un mot ou une expression dans le texte."
      return
    }
    if (!p) {
      hintAnon.value = 'Saisis un pseudo pour cette entité.'
      return
    }
    hintAnon.value = null
    const t = aplatir(ed.getJSON())
    // Les alias recouvrants ne produisent qu'une seule pose.
    const aliases = parserAliases(e)
    const matches = matchesAliases(t.texte, aliases)
      .map((pl) => plageVersPM(t, pl.from, pl.to))
      .filter((x): x is { from: number; to: number } => x !== null)
    const cle = cleEntite(e)
    // Les variantes déclarées et déjà choisies restent mémorisées ; seule une nouvelle pose reçoit le premier pseudo.
    const declares = dedupliquerValeursAnon(p.split('/'))
    const variantesExistantes = entretien.annotations.filter((a) =>
      a.type === 'anon' && !estOrpheline(a) && aliases.some((alias) =>
        cleEntite(alias) === cleEntite(ed.state.doc.textBetween(a.from, a.to, ' '))))
      .map((a) => a.pseudo ?? '').filter(Boolean)
    const variantesConservees = dedupliquerValeursAnon([
      ...(definitionsAnonLocales.value.find((d) => cleEntite(d.entite.join('/')) === cle)?.pseudos ?? []),
      ...(pseudosDeclares.value[cle] ?? []), ...declares, ...variantesExistantes,
    ])
    try { validerDefinitionAnon(aliases, variantesConservees) }
    catch (erreur) {
      hintAnon.value = erreur instanceof Error ? erreur.message : 'Définition invalide.'
      return
    }
    const applique = declares[0] || p
    // Les instructions sont calculées PUR (anonymisation.ts) puis
    // APPLIQUÉES sur la table réactive : relabel des occurrences ANONYMISÉES
    // seules (les exceptions gardent état + pseudo-mémoire), poses bloquées
    // par une exception couvrante, absorption « la plus longue gagne » sur
    // l'anonymisé pur.
    const instr = instructionsValiderAnon(
      entretien.annotations,
      matches,
      aliases.map((a) => cleEntite(a)),
      applique,
      (f, t2) => ed.state.doc.textBetween(f, t2, ' '),
      genId,
      variantesConservees,
      couvrirExceptions,
    )
    if (instr.exceptionsProtegees.length) {
      demanderCouverture(e, p, instr.exceptionsProtegees.length, () => validerAnon(e, p, true))
      return
    }
    if (!lignesAnon.value.find((l) => l.cle === cle)?.regle) {
      try {
        memoriserDefinitionLocale(definitionsAnonLocales.value, {
          entite: aliases, pseudos: variantesConservees, etat: 'declaration',
          categorie: definitionsAnonLocales.value.find((d) => cleEntite(d.entite.join('/')) === cle)?.categorie,
        })
      } catch (erreur) { hintAnon.value = erreur instanceof Error ? erreur.message : 'Définition locale invalide.'; return }
    }
    if (variantesConservees.length >= 2) pseudosDeclares.value[cle] = variantesConservees
    else delete pseudosDeclares.value[cle]
    for (const r of instr.relabel) {
      const a = entretien.annotations.find((x) => x.id === r.id)
      if (a) a.pseudo = r.pseudo
    }
    for (const o of instr.poser) {
      entretien.annotations.push({
        id: o.id,
        type: 'anon',
        from: o.from,
        to: o.to,
        auteur,
        pseudo: o.pseudo,
        etat: 'anonymise',
      })
    }
    // Le brouillon a fait son travail : il est consommé.
    consommerBrouillon(brouillonsAnon.value, e)
    deps.rafraichirProjections()
    deps.rafraichirDecorations()
    rafraichirCompteursAAAnonymiser()
    rafraichirReperage()
    deps.planifierSauvegarde()
    if (instr.poser.length || instr.relabel.length) applicationsAnon.value++
    // Validation réussie → suggérer l'entité-cœur éventuelle (mots de liaison).
    proposerCoeur(e, p, 'entretien')
  }
  /** Retire toutes les occurrences d'une ligne (dé-barrer). */
  function supprimerAnon(occurrenceIds: string[]) {
    for (const id of occurrenceIds) retirerAnnotation(entretien, id)
    deps.rafraichirProjections()
    deps.rafraichirDecorations()
    rafraichirCompteursAAAnonymiser()
    rafraichirReperage()
    deps.planifierSauvegarde()
  }

  /** Supprime une ligne entière : ses occurrences + son éventuel brouillon.
   *  Pour une ligne CORPUS, la règle liée n'est supprimée QUE si elle est
   *  isolée (aucun autre entretien n'y référence) — sinon BLOQUÉ + message. */
  async function supprimerLigneAnon(entite: string) {
    const cle = cleEntite(entite)
    const ligne = lignesAnon.value.find((l) => l.cle === cle)
    if (!ligne) return
    const clesLigne = clesDeLigne(ligne)
    if (ligne.etat === 'corpus' && ligne.regle) {
      const ailleurs = await window.sonal.corpus.regleAnonUtiliseeAilleurs(
        ligne.regle,
        deps.ouvertId.value ?? undefined,
      )
      if (ailleurs) {
        hintAnon.value = "Vous ne pouvez pas supprimer cette règle car elle est utilisée dans d'autres entretiens."
        return
      }
    }
    const supprimer = async () => {
      const ids = entretien.annotations
        .filter(
          (a) =>
            a.type === 'anon' &&
            !estOrpheline(a) &&
            clesLigne.has(cleEntite(deps.lireEditeur()!.state.doc.textBetween(a.from, a.to, ' '))),
        )
        .map((a) => a.id)
      for (const id of ids) retirerAnnotation(entretien, id)
      retirerBrouillon(brouillonsAnon.value, entite)
      delete pseudosDeclares.value[cle]
      retirerDefinitionLocale(definitionsAnonLocales.value, entite)
      deps.planifierSauvegarde()
      if (
        ligne.etat === 'corpus' &&
        ligne.regle &&
        await publierRetraitAvantSuppression()
      ) {
        await window.sonal.corpus.regleAnonSupprimer(ligne.regle)
        await deps.rafraichirReglesCorpus?.()
      }
      deps.rafraichirProjections()
      deps.rafraichirDecorations()
      rafraichirCompteursAAAnonymiser()
      rafraichirReperage()
    }
    if (ligne.etat === 'corpus' && ligne.regle) await lancerOperationGlobale(supprimer)
    else await supprimer()
  }

  /** Le réglage de portée change l'état d'une ligne sur trois crans.
   *  brouillon → entretien : pose les occurrences standalone (valider).
   *  brouillon/entretien → corpus : crée/réutilise une règle + pose/relie.
   *  entretien → brouillon : retire les décisions et remet la ligne en chantier.
   *  quitter le corpus inventorie tous ses usages avant de choisir le parcours. */
  async function changerPorteeAnon(entite: string, cible: 'brouillon' | 'entretien' | 'corpus') {
    const ligne = lignesAnon.value.find((l) => l.cle === cleEntite(entite))
    if (!ligne) return
    if (cible === ligne.etat) return
    if (cible === 'entretien' && ligne.etat === 'brouillon') {
      validerAnon(ligne.entite, ligne.pseudo)
      return
    }
    if (cible === 'brouillon' && ligne.etat === 'entretien') {
      const pseudo = ligne.pseudo
      try {
        memoriserDefinitionLocale(definitionsAnonLocales.value, { entite: parserAliases(ligne.entite), pseudos: pseudosCibleDeLigne(ligne),
          categorie: categorieDeLigne(ligne.entite), etat: 'brouillon',
        })
      } catch (erreur) { hintAnon.value = erreur instanceof Error ? erreur.message : 'Définition locale invalide.'; return }
      const ids = entretien.annotations
        .filter((annotation) => annotation.type === 'anon' && !estOrpheline(annotation) && annotationDeLigne(annotation, ligne))
        .map((annotation) => annotation.id)
      for (const id of ids) retirerAnnotation(entretien, id)
      ajouterBrouillon(brouillonsAnon.value, ligne.entite, pseudo)
      deps.rafraichirProjections()
      deps.rafraichirDecorations()
      rafraichirCompteursAAAnonymiser()
      rafraichirReperage()
      deps.planifierSauvegarde()
      return
    }
    if (cible === 'corpus') {
      await promouvoirCorpus(ligne)
      return
    }
    if (ligne.etat === 'corpus' && cible === 'entretien') {
      await delierCorpus(ligne)
      return
    }
    if (ligne.etat === 'corpus' && cible === 'brouillon') {
      await retirerCorpusVersBrouillon(ligne)
    }
  }

  /** La validation d'une ligne par ENTRÉE applique la portée
   *  prioritaire (paramsAnon.prioriteValidation, défaut « corpus »), Maj+Entrée
   *  l'autre portée. La ligne doit exister (brouillon ou entretien ; une ligne
   *  corpus est déjà au-delà). Le slider 3 crans reste le geste explicite. */
  async function validerAvecPriorite(entite: string, majuscule: boolean) {
    const ligne = lignesAnon.value.find((l) => l.cle === cleEntite(entite))
    if (!ligne || ligne.etat === 'corpus') return
    const prio = deps.prioriteAnon()
    const cible = (
      majuscule ? (prio === 'corpus' ? 'entretien' : 'corpus') : prio
    ) as 'brouillon' | 'entretien' | 'corpus'
    if (cible === ligne.etat) return
    await changerPorteeAnon(ligne.entite, cible)
  }

  /** Renvoie la catégorie de la règle corpus liée à une ligne. */
  function categorieDeLigne(entite: string): string {
    const ligne = lignesAnon.value.find((l) => l.cle === cleEntite(entite))
    if (!ligne?.regle) return definitionsAnonLocales.value.find((d) => cleEntite(d.entite.join('/')) === cleEntite(entite))?.categorie ?? ''
    return deps.reglesAnon().find((r) => r.id === ligne.regle)?.categorie ?? ''
  }
  /** Assigne ou retire la catégorie d'une ligne corpus. */
  async function categoriserLigne(entite: string, categorie: string) {
    const ligne = lignesAnon.value.find((l) => l.cle === cleEntite(entite))
    if (!ligne) return
    if (!ligne.regle) {
      try {
        memoriserDefinitionLocale(definitionsAnonLocales.value, {
          entite: parserAliases(ligne.entite), pseudos: pseudosCibleDeLigne(ligne),
          etat: ligne.etat === 'brouillon' ? 'brouillon' : 'declaration', ...(categorie ? { categorie } : {}),
        })
        deps.planifierSauvegarde()
      } catch (erreur) { hintAnon.value = erreur instanceof Error ? erreur.message : 'Définition locale invalide.' }

      return
    }
    if (deps.categoriserRegle) await deps.categoriserRegle(ligne.regle, categorie || null)
  }
  /** Liste des catégories actives (vide = réglage désactivé → badge masqué). */
  const thematiquesActives = computed(() =>
    deps.thematiques?.().actif ? deps.thematiques().liste : [],
  )

  /** Pseudos « cible » d'une ligne à pousser au corpus : l'ensemble déclaré
   *  (a/b) s'il existe, sinon le pseudo d'une occurrence ANONYMISÉE DE CETTE
   *  LIGNE (on filtre par cle AVANT de choisir — sinon `find` prendrait la
   *  première occurrence du document, d'une autre entité). */
  function pseudosCibleDeLigne(ligne: LigneAnon): string[] {
    const occurrences = entretien.annotations.filter((a) =>
      a.type === 'anon' && !estOrpheline(a) && a.etat !== 'exception' && annotationDeLigne(a, ligne))
    return dedupliquerValeursAnon([...(ligne.etat === 'brouillon' ? (trouverBrouillon(brouillonsAnon.value, ligne.entite)?.pseudo ?? ligne.pseudo).split('/') : definitionsAnonLocales.value.find((d) => cleEntite(d.entite.join('/')) === ligne.cle)?.pseudos ?? pseudosDeclares.value[ligne.cle] ?? []), ...occurrences.map((a) => a.pseudo ?? '')])
  }
  /** Clef d'entité d'une annotation (lue sur le doc courant). */
  function lineCle(a: Annotation): string {
    const ed = deps.lireEditeur()
    return ed ? cleEntite(ed.state.doc.textBetween(a.from, a.to, ' ')) : ''
  }

  /** Fichier ou entretien vers corpus. Crée la règle si absente ; sinon, si
   *  pseudos identiques → réutilise ; sinon → dialogue de divergence. */
  async function promouvoirCorpus(ligne: LigneAnon, couvertureConfirmee?: string) {
    hintAnon.value = null
    try { await preparerPromotionCorpus(ligne, couvertureConfirmee) }
    catch (erreur) { hintAnon.value = erreur instanceof Error ? erreur.message : 'La promotion a échoué.' }
  }

  async function preparerPromotionCorpus(ligne: LigneAnon, couvertureConfirmee?: string) {
    const cas: 'brouillon' | 'fichier' = ligne.etat === 'brouillon' ? 'brouillon' : 'fichier'
    // Le pseudo saisi vient du brouillon ou des occurrences du fichier.
    const pseudoSaisi =
      cas === 'brouillon'
        ? trouverBrouillon(brouillonsAnon.value, ligne.entite)?.pseudo ?? ligne.pseudo
        : ''
    const pseudosCible =
      cas === 'brouillon'
        ? dedupliquerValeursAnon((trouverBrouillon(brouillonsAnon.value, ligne.entite)?.pseudo ?? ligne.pseudo).split('/'))
        : pseudosCibleDeLigne(ligne)
    if (pseudosCible.length === 0) {
      hintAnon.value = 'Saisis un pseudo avant de pousser cette entité au corpus.'
      return
    }
    try { validerDefinitionAnon(ligne.entite, pseudosCible) }
    catch (erreur) {
      hintAnon.value = erreur instanceof Error ? erreur.message : 'Définition invalide.'
      return
    }
    if (cas === 'brouillon' && !autoriserCouvertureCorpus(ligne, couvertureConfirmee, (empreinte) => promouvoirCorpus(ligne, empreinte))) return
    const versionEdition = empreinteEdition(ligne.entite)
    const existante = await window.sonal.corpus.regleAnonParEntite(ligne.entite)
    if (versionEdition !== empreinteEdition(ligne.entite)) {
      hintAnon.value = 'La ligne a changé pendant la préparation. Recommencez la promotion.'
      return
    }
    if (existante && parserAliases(ligne.entite).some((alias) =>
      !existante.entite.flatMap(parserAliases).some((e) => e.toLocaleLowerCase('fr') === alias.toLocaleLowerCase('fr')))) {
      hintAnon.value = 'Des alias nouveaux recouvrent une règle existante. Résolvez le groupe avant de le rattacher au corpus.'
      return
    }
    const memesPseudos = existante &&
      existante.pseudos.length === pseudosCible.length &&
      pseudosCible.every((p) => existante.pseudos.some((q) => q.toLowerCase() === p.toLowerCase()))
    if (!existante || memesPseudos) {
      const res = await window.sonal.corpus.regleAnonCreer(ligne.entite, pseudosCible)
      // Course multi-user : la transaction peut révéler une règle posée par
      // un collègue depuis notre dernier pull (données locales périmées).
      // Même traitement que « existante » ci-dessus : pseudos identiques →
      // on relie ; divergents → dialogue Aligner / Garder les deux.
      if (res.existait && !memesPseudos) {
        dialoguePorteeCorpus.value = {
          entite: ligne.entite,
          pseudosCible,
          regleExistanteId: res.regle.id,
          reglePseudos: res.regle.pseudos,
          regleEntite: res.regle.entite,
          cas, couvertureConfirmee,
        }
        return
      }
      if (!(await appliquerCorpus(ligne, res.regle.id, cas, undefined, couvertureConfirmee))) return
      // Validation corpus réussie → suggérer l'entité-cœur éventuelle.
      proposerCoeur(ligne.entite, cas === 'brouillon' ? pseudoSaisi : pseudosCible.join(' / '), 'corpus')
      return
    }
    // Divergence → dialogue.
    dialoguePorteeCorpus.value = {
      entite: ligne.entite,
      pseudosCible,
      regleExistanteId: existante.id,
      reglePseudos: existante.pseudos,
      regleEntite: existante.entite,
      cas, couvertureConfirmee,
    }
  }

  /** Applique la portée corpus (create/reuse) : poser (brouillon) ou relier
   *  (fichier). `pseudoAppli` non vide = « aligner » vers ce pseudo de la règle. */
  async function appliquerCorpus(ligne: LigneAnon, regleId: string, cas: 'brouillon' | 'fichier', pseudoAppli?: string, couvertureConfirmee?: string): Promise<boolean> {
    const ed = deps.lireEditeur()
    if (!ed) return false
    const versionEdition = empreinteEdition(ligne.entite)
    await deps.rafraichirReglesCorpus?.()
    if (versionEdition !== empreinteEdition(ligne.entite)) {
      hintAnon.value = 'La ligne a changé pendant la préparation. Recommencez la promotion.'
      return false
    }
    let nbAppliquees = 0
    if (cas === 'brouillon') {
      if (!autoriserCouvertureCorpus(ligne, couvertureConfirmee, (empreinte) => appliquerCorpus(ligne, regleId, cas, pseudoAppli, empreinte))) return false
      nbAppliquees = poserCorpusDepuisBrouillon(ligne, regleId, pseudoAppli ?? ligne.pseudo.split(' / ')[0], !!couvertureConfirmee)
    } else {
      for (const a of entretien.annotations) {
        if (a.type === 'anon' && annotationDeLigne(a, ligne)) {
          a.regle = regleId
          if (pseudoAppli && a.etat !== 'exception') a.pseudo = pseudoAppli
          if (a.etat !== 'exception' && a.pseudo) nbAppliquees++
        }
      }
      delete pseudosDeclares.value[ligne.cle]
      retirerDefinitionLocale(definitionsAnonLocales.value, ligne.entite)
    }
    deps.rafraichirProjections()
    deps.rafraichirDecorations()
    rafraichirCompteursAAAnonymiser()
    rafraichirReperage()
    deps.planifierSauvegarde()
    if (nbAppliquees) applicationsAnon.value++
    return true
  }

  /** Dialogue : « Aligner » — la règle garde ses pseudos, l'entretien adopte son
   *  pseudo primaire (posé/relié). */
  async function alignerCorpus(confirmation?: string) {
    const d = dialoguePorteeCorpus.value
    if (!d) return
    const ligne = lignesAnon.value.find((l) => l.cle === cleEntite(d.entite))
    if (!ligne) return
    const couverture = confirmation ?? d.couvertureConfirmee
    if (d.cas === 'brouillon' && !autoriserCouvertureCorpus(ligne, couverture, alignerCorpus)) return
    dialoguePorteeCorpus.value = null
    await appliquerCorpus(ligne, d.regleExistanteId, d.cas, d.reglePseudos[0], couverture)
  }
  /** Dialogue : « Garder les deux » — ajoute les pseudos de l'entretien à la
   *  règle (si ≤2), puis pose/relie en gardant la variante de l'entretien. */
  async function garderLesDeuxCorpus(confirmation?: string) {
    const d = dialoguePorteeCorpus.value
    if (!d) return
    const ligne = lignesAnon.value.find((l) => l.cle === cleEntite(d.entite))
    if (!ligne) return
    const couverture = confirmation ?? d.couvertureConfirmee
    if (d.cas === 'brouillon' && !autoriserCouvertureCorpus(ligne, couverture, garderLesDeuxCorpus)) return
    try { validerDefinitionAnon(d.regleEntite ?? ligne.entite, dedupliquerValeursAnon([...d.reglePseudos, ...d.pseudosCible])) }
    catch (erreur) {
      hintAnon.value = erreur instanceof Error ? erreur.message : 'Définition invalide.'
      return
    }
    dialoguePorteeCorpus.value = null
    hintAnon.value = null
    try {
      for (const p of d.pseudosCible) await window.sonal.corpus.regleAnonAjouterPseudo(d.regleExistanteId, p)
    } catch (erreur) {
      hintAnon.value = erreur instanceof Error ? erreur.message : 'L’ajout de variante a échoué.'
      return
    }
    // La variante de l'entretien prime pour ses occurrences (garder les deux).
    await appliquerCorpus(ligne, d.regleExistanteId, d.cas, d.cas === 'brouillon' ? d.pseudosCible[0] : undefined, couverture)
  }
  function annulerDialogueCorpus() {
    dialoguePorteeCorpus.value = null
  }

  /* ── Réconciliation POST-PULL ───────────────────────────────────────────
   * En multi-user, une règle corpus régentant une entité déjà travaillée
   * localement peut APPARAÎTRE pendant la session (un collègue l'a poussée
   * entre deux pulls). Au prochain tirage qui ramène un corpus.json modifié,
   * l'orchestrateur appelle ceci : mêmes décisions que le dialogue de
   * promotion (« Aligner / Garder les deux »), jamais de divergence silencieuse.
   * ───────────────────────────────────────────────────────────────────────*/
  /** Divergences déjà proposées cette session — « annuler » n'est pas un refus
   * définitif mais on ne re-dérange pas l'utilisateur à chaque pull. */
  const divergencesIgnorees = new Set<string>()
  /** Détecte et ouvre le dialogue pour la PREMIÈRE divergence trouvée.
   *  Renvoie le nombre de divergences détectées (0 = rien à signaler). */
  function detecterDivergencesPostTirage(): number {
    if (!deps.lireEditeur() || dialoguePorteeCorpus.value) return 0 // dialogue déjà ouvert
    const divergences = detecterDivergencesPortee(lignesAnon.value, deps.reglesAnon()).filter(
      (d) => !divergencesIgnorees.has(`${d.regleId}|${cleEntite(d.entite)}`),
    )
    const premiere = divergences[0]
    if (!premiere) return 0
    divergencesIgnorees.add(`${premiere.regleId}|${cleEntite(premiere.entite)}`)
    dialoguePorteeCorpus.value = {
      entite: premiere.entite,
      pseudosCible: premiere.pseudosLocaux,
      regleExistanteId: premiere.regleId,
      reglePseudos: premiere.reglePseudos,
      regleEntite: deps.reglesAnon().find((r) => r.id === premiere.regleId)?.entite,
      cas: premiere.cas,
    }
    return divergences.length
  }


  /** Brouillon → Corpus : pose les occurrences rule-backed (comme une
   *  validation, mais liée à la règle) puis consomme le brouillon. */
  function poserCorpusDepuisBrouillon(ligne: LigneAnon, regleId: string, pseudo: string, couvrirExceptions = false) {
    const instr = instructionsCorpus(ligne, pseudo, couvrirExceptions)
    for (const r of instr.relabel) {
      const a = entretien.annotations.find((x) => x.id === r.id)
      if (a) { a.pseudo = r.pseudo; a.regle = regleId }
    }
    for (const o of instr.poser) {
      entretien.annotations.push({ id: o.id, type: 'anon', from: o.from, to: o.to, auteur, pseudo: o.pseudo, etat: 'anonymise', regle: regleId })
    }
    retirerBrouillon(brouillonsAnon.value, ligne.entite)
    delete pseudosDeclares.value[ligne.cle]
    retirerDefinitionLocale(definitionsAnonLocales.value, ligne.entite)
    return instr.poser.length + instr.relabel.length
  }

  /** Une sortie du corpus inventorie d’abord tous les usages de la règle.
   *  Si seul l’entretien courant est concerné, le parcours est réalisé directement. */
  async function quitterCorpus(ligne: LigneAnon, cible: 'entretien' | 'brouillon') {
    if (!ligne.regle) return
    if (!deps.demanderDissociationCorpus) {
      hintAnon.value = 'La modification exige le parcours global qualifié. Aucun changement n’a été effectué.'
      return
    }
    if (!await deps.demanderDissociationCorpus(ligne.regle, cible, ligne.entite)) {
      hintAnon.value = 'Modification non engagée : aucun lien ni passage n’a été modifié.'
    }
  }

  async function delierCorpus(ligne: LigneAnon) {
    await quitterCorpus(ligne, 'entretien')
  }

  async function retirerCorpusVersBrouillon(ligne: LigneAnon) {
    await quitterCorpus(ligne, 'brouillon')
  }

  async function publierRetraitAvantSuppression(): Promise<boolean> {
    return await deps.publierAvantSuppressionDefinition?.() ?? true
  }

  function pseudoDeLigne(a: Annotation): string {
    const ed = deps.lireEditeur()
    if (!ed) return ''
    const cle = cleEntite(ed.state.doc.textBetween(a.from, a.to, ' '))
    if (!cle) return ''
    for (const autre of entretien.annotations) {
      if (autre.type !== 'anon' || estOrpheline(autre) || autre.etat === 'exception') continue
      if (cleEntite(ed.state.doc.textBetween(autre.from, autre.to, ' ')) === cle && autre.pseudo) {
        return autre.pseudo
      }
    }
    return trouverBrouillon(brouillonsAnon.value, cle)?.pseudo ?? ''
  }

  function charger(brouillonsLus: BrouillonAnon[] | undefined, pseudosLus: Record<string, string[]> | undefined, definitionsLues?: DefinitionAnonLocale[]) {
    definitionsAnonLocales.value = validerMemoireLocale(definitionsLues ?? [])
    brouillonsAnon.value = brouillonsLus ?? []
    pseudosDeclares.value = normaliserPseudosDeclares(pseudosLus ?? {})
    for (const d of definitionsAnonLocales.value) {
      if (d.pseudos.length > 1) pseudosDeclares.value[cleEntite(d.entite.join('/'))] = [...d.pseudos]
    }
  }

  function reinitialiser() {
    brouillonsAnon.value = []
    pseudosDeclares.value = Object.create(null)
    definitionsAnonLocales.value = []
    selectionAnon.value = null
    hintAnon.value = null
    lignesAnon.value = []
    hitsAAnonymiserParCle.value = {}
    inclusesParCle.value = {}
    suggestionLiaison.value = null
    refuserCouverture()
    dialoguePorteeCorpus.value = null
    arreterReperage()
    divergencesIgnorees.clear()
  }

  function mettreAJourSelection(ed: Editor) {
    const { from, to } = ed.state.selection
    if (from < to) {
      const s = snapToWord(ed.state, from, to)
      selectionAnon.value = s.from < s.to
        ? { texte: ed.state.doc.textBetween(s.from, s.to, ' '), from: s.from, to: s.to }
        : null
    } else {
      selectionAnon.value = null
    }
  }

  function rafraichirApresMutation() {
    rafraichirCompteursAAAnonymiser()
    rafraichirReperage()
  }

  function decrireOccurrence(a: Annotation) {
    const ed = deps.lireEditeur()
    const entite = ed ? ed.state.doc.textBetween(a.from, a.to, ' ') : ''
    let pseudosAutres: string[] = []
    const cle = cleEntite(entite)
    if (a.regle) {
      const regle = deps.reglesAnon().find((r) => r.id === a.regle)
      if (regle && regle.pseudos.length > 1 && a.pseudo) {
        const bas = (p: string) => p.toLowerCase()
        pseudosAutres = regle.pseudos.filter((p) => bas(p) !== bas(a.pseudo!))
      }
    } else if (a.pseudo) {
      const declares = pseudosDeclares.value[cle]
      const bas = (p: string) => p.toLowerCase()
      if (declares && declares.length > 1 && declares.some((p) => bas(p) === bas(a.pseudo!))) {
        pseudosAutres = declares.filter((p) => bas(p) !== bas(a.pseudo!))
      }
    }
    return {
      id: a.id,
      etat: a.etat === 'exception' ? 'exception' as const : 'anonymise' as const,
      entite,
      pseudosAutres,
    }
  }

  return {
    pseudonymisationUtilisee,
    applicationsAnon,
    selectionAnon,
    hintAnon,
    lignesAnon,
    hitsAAnonymiserParCle,
    inclusesParCle,
    reperageAnon,
    brouillonsAnon,
    pseudosDeclares,
    definitionsAnonLocales,
    dialoguePorteeCorpus,
    confirmationCouverture,
    accepterCouverture,
    refuserCouverture,
    suggestionLiaison,
    thematiquesActives,
    rafraichirCompteursAAAnonymiser,
    rafraichirReperage,
    rafraichirLignesAnon,
    demarrerReperage,
    naviguerReperage,
    arreterReperage,
    entiteExisteDeja,
    creerBrouillon,
    majBrouillonLigne,
    validerAnon,
    supprimerAnon,
    supprimerLigneAnon,
    changerPorteeAnon,
    validerAvecPriorite,
    categorieDeLigne,
    categoriserLigne,
    alignerCorpus,
    garderLesDeuxCorpus,
    annulerDialogueCorpus,
    accepterSuggestionLiaison,
    refuserSuggestionLiaison,
    detecterDivergencesPostTirage,
    charger,
    reinitialiser,
    mettreAJourSelection,
    rafraichirApresMutation,
    decrireOccurrence,
    pseudoDeLigne,
  }
}
