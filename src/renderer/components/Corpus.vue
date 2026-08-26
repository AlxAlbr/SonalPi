<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import AjoutEntretien from './AjoutEntretien.vue'
import EditionThemes from './EditionThemes.vue'
import MenuTheme from './MenuTheme.vue'
import PasAPas from './PasAPas.vue'
import { utiliserSonal } from '../composables/sonal'
import { rechercherDansCorpsTexte } from '../editor/rechercheCorpus'
import { visiblesThemes } from '../../shared/corpus/categories'
import type { OccurenceRecherche, ResultatRecherche } from '../editor/rechercheCorpus'
import type { SegmentThematique, CibleRegleAnon } from '../../shared/format'
import { scannerRegleDetaille, type OccurrenceScan } from '../../shared/corpus/scanAnon'
// Icônes d'onglets (parité vue Entretien) — thèmes = logocat, recherche = logosearch,
// données/pseudos = les mêmes que les onglets « Données » et « Pseudonymisation ».
import icoThemes from '../assets/icones/logocat.png'
import icoRecherche from '../assets/icones/logosearch.png'
import icoDonnees from '../assets/icones/logodat2.png'
import icoAnon from '../assets/icones/logoanon.png'

const {
  // thèmes (codebook corpus) — CONSULTATION ; l'édition passe par la modale (crayon)
  codebook,
  usages,
  couleurHex,
  peintureSegment,
  nomTheme,
  arbreThemes,
  modifierTheme,
  resumes,
  ouvrirAuSegment,
  // entretiens (membership) + sélection Corpus
  membership,
  reprise,
  reprendre,
  corpusSelId,
  corpusSelMeta,
  selectionnerCorpus,
  deselectionnerCorpus,
  ouvrirEntretien,
  renommer,
  entretienASupprimer,
  demanderSuppressionEntretien,
  confirmerSuppressionEntretien,
  allerDonnees,
  listeEntretiens,
  // audio
  urlWaveform,
  assignerAudioSelection,
  ouvrirDesignationAudio,
  // Panneau « Pseudos » du corpus (lecture seule)
  reglesAnon,
  scanAnon,
  rafraichirScanAnon,
  // Intégrité : audios référencés introuvables (fichier déplacé/supprimé)
  audiosManquants,
  // démo pas-à-pas
  pasAPas,
  // Corpus distant : synchro (barre haute) + lecture seule (grisage)
  idDistantCourant,
  dernierTirage,
  tirageEnCours,
  actualiserDistant,
  lectureSeule,
  // Paramètres de pseudonymisation (étape 4a)
  paramsAnon,
  majParamsAnon,
  // Badges de verrou fiables (état « tenu par X » venant du serveur)
  badgeVerrou,
  metaEditables,
  presencesSur,
} = utiliserSonal()

/** Heure locale courte d'un horodatage ISO (« HH:MM »). */
const heureDe = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
/** Infobulle des champs du panneau méta : si l'entretien est tenu par autrui,
 *  on explique pourquoi tout est grisé (même vocabulaire que les badges 🔒). */
function titreChampMeta(id: string): string {
  const v = badgeVerrou(id)
  return v
    ? `Ouvert par ${v.userId} — lecture seule.`
    : 'lecture seule (corpus distant)'
}
/** Infobulle du bouton crayon/verrou d'une carte : si l'entretien est tenu par
 *  autrui, le détail (qui ? depuis quand ? conséquence) ; sinon le geste normal. */
const titreCrayon = (id: string): string => {
  const v = badgeVerrou(id)
  return v
    ? `Verrou tenu par ${v.userId} depuis ${heureDe(v.acquiredAt)} — ouverture en lecture seule.`
    : 'Éditer l’entretien'
}
/** « Actualiser » : tire le miroir à la demande (les erreurs crient — ce n'est
 *  pas la minuterie silencieuse). */
async function actualiser() {
  try {
    await actualiserDistant(false)
  } catch {
    /* l'échec criant est traité comme un pull doux raté pour l'instant :
       le badge horodaté reste sur la dernière synchro réussie */
  }
}

// La fenêtre d'édition des thèmes (crayon, parité SonalPi) — locale à la vue.
const editerThemes = ref(false)
// Menu contextuel d'un THÈME (actif ↔ passif sans ouvrir l'édition), sur la
// consultation du Corpus comme sur le panneau Entretien.
const menuTheme = ref<{ id: string; nom: string; x: number; y: number; actif: boolean } | null>(null)
/** Ouvre le menu au clic droit sur un thème (masqué en lecture seule). */
function ouvrirMenuTheme(cat: { id: string; nom: string; actif: boolean }, evt: MouseEvent) {
  if (lectureSeule.value) return
  menuTheme.value = { id: cat.id, nom: cat.nom, x: evt.clientX, y: evt.clientY, actif: cat.actif }
}
/** Bascule actif → passif (ou l'inverse), puis ferme le menu. */
function basculerActifTheme() {
  const m = menuTheme.value
  if (m) modifierTheme(m.id, { actif: !m.actif })
  menuTheme.value = null
}
// Repli des sous-thèmes dans la consultation : état de VUE local (jamais
// persisté, indépendant par écran) — les catégories repliées restent visibles.
const repliesThemes = ref<Set<string>>(new Set())
const arbreVisible = computed(() => visiblesThemes(arbreThemes(), repliesThemes.value))
function basculerRepli(id: string) {
  const s = new Set(repliesThemes.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  repliesThemes.value = s
}

// --- Étape 3a — panneau « Pseudos » du corpus (lecture seule) ---
// Bouton dans la barre haute (comme « Ouvrir la base de données »). En 3a,
// aucune règle corpus n'est encore créable (cran corpus inactif) → panneau vide ;
// le scan est relancé à chaque ouverture pour révéler les changements.
const pseudoPanel = ref(false)
async function ouvrirPseudoPanel() {
  await rafraichirScanAnon()
  selectedRegleId.value = null
  deplie.value = null
  details.value = {}
  cochees.value = {}
  exceptions.value = {}
  filtreRegle.value = ''
  messagePseudo.value = null
  pseudoPanel.value = true
  await nextTick()
  ajusterLargeurGauche()
}
function fermerPseudo() {
  pseudoPanel.value = false
  selectedRegleId.value = null
}

// --- Drill-down (loupe) façon SonalPi V1 : accordéons par entretien, badges
//     d'état, occurrences détaillées avec contexte, cases d'état + exceptions,
//     et validation du diff (lot sous verrou court par fichier). ---
const selectedRegleId = ref<string | null>(null)
const messagePseudo = ref<string | null>(null)

const scanPourRegle = computed(
  () => scanAnon.value.find((s) => s.regle.id === selectedRegleId.value) ?? null,
)
function selectionnerRegle(id: string) {
  if (selectedRegleId.value === id) {
    selectedRegleId.value = null
    deplie.value = null
    details.value = {}
    cochees.value = {}
    exceptions.value = {}
    return
  }
  selectedRegleId.value = id
  deplie.value = null
  details.value = {}
  cochees.value = {}
  exceptions.value = {}
}
/** Entretiens où la règle apparaît (depuis le scan), avec leurs compteurs. */
function entretiensRegle() {
  const s = scanPourRegle.value
  if (!s) return []
  return Object.entries(s.parEntretien).map(([id, st]) => ({
    id,
    titre: membership.value[id]?.titre ?? id,
    ...st,
  }))
}

// Accordéon : un seul entretien déplié à la fois ; détails chargés au dépliage.
const deplie = ref<string | null>(null)
const details = ref<Record<string, OccurrenceScan[]>>({})
async function basculerDepli(id: string) {
  if (deplie.value === id) {
    deplie.value = null
    return
  }
  deplie.value = id
  await chargerDetails(id)
  initEtatEnt(id)
}
async function chargerDetails(id: string) {
  const s = scanPourRegle.value
  if (!s) return
  const lecture = await window.sonal.corpus.lireEntretien(id)
  if (!lecture.ok) {
    details.value[id] = []
    return
  }
  details.value[id] = scannerRegleDetaille(
    { ...s.regle },
    { id, data: lecture.data as never },
  )
}
function occurrencesDe(id: string): OccurrenceScan[] {
  return details.value[id] ?? []
}

// État ÉDITABLE par occurrence (parité V1) : la case reflète l'ÉTAT
// (cochée = anonymisée, décochée = à traiter), le 🚫 marque une exception ;
// les modifications restent LOCALES jusqu'à « Valider ». Cle « from:to ».
const cochees = ref<Record<string, Record<string, boolean>>>({})
const exceptions = ref<Record<string, Record<string, boolean>>>({})
const cleOcc = (o: { from: number; to: number }) => `${o.from}:${o.to}`
/** Initialise l'état éditable d'un entretien depuis son scan détaillé
 *  (les incluses n'y figurent pas : non modifiables). */
function initEtatEnt(id: string) {
  const c: Record<string, boolean> = {}
  const x: Record<string, boolean> = {}
  for (const o of occurrencesDe(id)) {
    if (o.etat === 'incl') continue
    c[cleOcc(o)] = o.etat === 'anon'
    x[cleOcc(o)] = o.etat === 'exc'
  }
  cochees.value[id] = c
  exceptions.value[id] = x
}
/** État VISUEL d'une occurrence : suit les modifications locales, pas le
 *  dernier scan (couleurs, gras du match, affichage du pseudo). */
function etatOcc(id: string, o: OccurrenceScan): OccurrenceScan['etat'] {
  if (o.etat === 'incl') return 'incl'
  if (exceptions.value[id]?.[cleOcc(o)]) return 'exc'
  return cochees.value[id]?.[cleOcc(o)] ? 'anon' : 'non'
}
function estCochee(id: string, o: OccurrenceScan): boolean {
  return etatOcc(id, o) === 'anon'
}
function basculerCoche(id: string, o: OccurrenceScan) {
  const c = (cochees.value[id] ??= {})
  const k = cleOcc(o)
  c[k] = !c[k]
}
function enException(id: string, o: OccurrenceScan): boolean {
  return etatOcc(id, o) === 'exc'
}
/** 🚫 droit : demande l'exception (la case se décoche — parité V1). */
function demanderException(id: string, o: OccurrenceScan) {
  ;(exceptions.value[id] ??= {})[cleOcc(o)] = true
  ;(cochees.value[id] ??= {})[cleOcc(o)] = false
}
/** 🚫 gauche : retire l'exception → l'occurrence redevient « à traiter ». */
function retirerException(id: string, o: OccurrenceScan) {
  ;(exceptions.value[id] ??= {})[cleOcc(o)] = false
}
/** Case-tout de l'en-tête : coché quand TOUTES les occurrences modifiables
 *  sont cochées ; un clic coche/décoche tout (les exceptions restent posées). */
function entToutCoche(id: string): boolean {
  const c = cochees.value[id]
  if (!c) return false
  const ks = Object.keys(c)
  return ks.length > 0 && ks.every((k) => c[k])
}
function toutCocherEnt(id: string) {
  const c = cochees.value[id]
  if (!c) return
  const cible = !entToutCoche(id)
  for (const k of Object.keys(c)) c[k] = cible
}
/** L'entretien est « tout traité » si aucune occurrence n'est à traiter
 *  (parité V1 : les incluses comptent comme traitées). */
function entToutTraite(anon: number, exc: number, incl: number, non: number): boolean {
  return anon + exc + incl > 0 && non === 0
}

// --- Paramètres de pseudonymisation (étape 4a + 4b-A) ---
const parametresOuverts = ref(false)
const prioriteLocale = ref<'corpus' | 'entretien'>(paramsAnon.value.prioriteValidation)
const motsLiaisonActif = ref(paramsAnon.value.motsLiaison?.actif ?? true)
const motsLiaisonListe = ref((paramsAnon.value.motsLiaison?.liste ?? []).join(', '))
const thematiquesActif = ref(paramsAnon.value.thematiques?.actif ?? false)
const thematiquesListeTexte = ref((paramsAnon.value.thematiques?.liste ?? []).join(', '))
watch(
  () => paramsAnon.value,
  (p) => {
    prioriteLocale.value = p.prioriteValidation
    motsLiaisonActif.value = p.motsLiaison?.actif ?? true
    motsLiaisonListe.value = (p.motsLiaison?.liste ?? []).join(', ')
    thematiquesActif.value = p.thematiques?.actif ?? false
    thematiquesListeTexte.value = (p.thematiques?.liste ?? []).join(', ')
  },
  { deep: true },
)
watch(prioriteLocale, async (v) => {
  if (v !== paramsAnon.value.prioriteValidation) {
    await majParamsAnon({ ...paramsAnon.value, prioriteValidation: v })
  }
})
/** Commit les mots de liaison : liste scindée sur espaces/virgules/points-virgules. */
async function committerMotsLiaison() {
  const liste = motsLiaisonListe.value
    .split(/[\s,;]+/)
    .map((m) => m.trim())
    .filter(Boolean)
  await majParamsAnon({
    ...paramsAnon.value,
    motsLiaison: { actif: motsLiaisonActif.value, liste },
  })
}
/** Commit les thématiques (même découpage). */
async function committerThematiques() {
  const liste = thematiquesListeTexte.value
    .split(/[\s,;]+/)
    .map((m) => m.trim())
    .filter(Boolean)
  await majParamsAnon({
    ...paramsAnon.value,
    thematiques: { actif: thematiquesActif.value, liste },
  })
}
/** Thématiques actives (vide si réglage désactivé). */
const thematiquesListe = computed(() =>
  paramsAnon.value.thematiques?.actif ? paramsAnon.value.thematiques.liste : [],
)
/** Assigne/retire la catégorie d'une règle puis rafraîchit le scan. */
async function categoriser(regleId: string, categorie: string) {
  await window.sonal.corpus.regleAnonCategoriser(regleId, categorie || null)
  await rafraichirScanAnon()
}

// --- Filtre / recherche d'entité dans la table des règles (parité V1) ---
const filtreRegle = ref('')
const scanFiltre = computed(() => {
  const q = filtreRegle.value.trim().toLowerCase()
  if (!q) return scanAnon.value
  // Recherche par catégorie (4c) : si la saisie correspond EXACTEMENT à un
  // nom de catégorie active, on bascule en filtre par catégorie.
  const exact = thematiquesListe.value.find((c) => c.toLowerCase() === q)
  if (exact) return scanAnon.value.filter((s) => s.regle.categorie === exact)
  return scanAnon.value.filter(
    (s) =>
      s.regle.entite.some((e) => e.toLowerCase().includes(q)) ||
      s.regle.pseudos.some((p) => p.toLowerCase().includes(q)),
  )
})
// --- Largeur du panneau gauche : auto-fit sur la largeur NATURELLE de la
//     table des règles (parité V1) — bornée pour garder le détail lisible à
//     droite. La mesure se fait hors flux : la table est étirée à 100 % de sa
//     colonne, on lit sa largeur idéale puis on restitue l'étirement.
const tableRegles = ref<HTMLTableElement | null>(null)
const largeurGauche = ref('42%')
function ajusterLargeurGauche() {
  const table = tableRegles.value
  const panneau = table?.closest('.pseudo-panneau') as HTMLElement | null
  if (!table || !panneau) return
  const memo = table.style.width
  table.style.width = 'max-content'
  const naturelle = table.offsetWidth
  table.style.width = memo
  if (!naturelle) return
  const CHROME = 44 // paddings horizontaux du panneau + bordure entre colonnes
  const MIN_GAUCHE = 280
  const MIN_DROITE = 320
  const largeurPanneau = panneau.clientWidth
  if (largeurPanneau <= 0) return
  const maxGauche = Math.max(MIN_GAUCHE, largeurPanneau - CHROME - MIN_DROITE)
  const cible = Math.max(MIN_GAUCHE, Math.min(naturelle + 16, maxGauche))
  largeurGauche.value = Math.round((cible / largeurPanneau) * 100) + '%'
}
watch(scanAnon, async () => {
  await nextTick()
  ajusterLargeurGauche()
})

/** État global d'une règle : ✓ tout traité / orange à traiter (les incluses
 *  comptent comme traitées — parité V1). */
function etatRegle(s: { total: { anon: number; exc: number; incl: number; non: number } }): 'ok' | 'todo' {
  return s.total.non === 0 ? 'ok' : 'todo'
}
/** « Valider » (façon V1) : compare l'état éditable de chaque occurrence au
 *  dernier scan et transmet le DIFF par entretien — poses (cases cochées),
 *  retraits (dé-pseudonymiser), exceptions posées/retirées. En distant, le
 *  lot passe par des transactions courtes par entretien : un entretien
 *  verrouillé par autrui est refusé nommément, sans bloquer les autres.
 *  Scan et détails sont rechargés après coup (le diff peut retirer autant
 *  que poser, un ajustement local serait fragile). */
async function valider() {
  const s = scanPourRegle.value
  if (!s) return
  let nbPoses = 0, nbRetires = 0, nbExcAjout = 0, nbExcRetire = 0
  const cibles: CibleRegleAnon[] = []
  for (const [id, rows] of Object.entries(details.value)) {
    // Sans état initialisé (entretien jamais déplié, détails périmés), on ne
    // déduit RIEN : tout y paraîtrait « à traiter » → retraits fantômes.
    if (!cochees.value[id]) continue
    const plages: { from: number; to: number }[] = []
    const retirer: { from: number; to: number }[] = []
    const exception: { from: number; to: number }[] = []
    const retirerException: { from: number; to: number }[] = []
    for (const o of rows) {
      if (o.etat === 'incl') continue
      const k = cleOcc(o)
      const co = !!cochees.value[id]?.[k]
      const ex = !!exceptions.value[id]?.[k]
      const plage = { from: o.from, to: o.to }
      if (co && o.etat === 'non') { plages.push(plage); nbPoses++ }
      if (!co && o.etat === 'anon') { retirer.push(plage); nbRetires++ }
      if (ex && o.etat !== 'exc') { exception.push(plage); nbExcAjout++ }
      if (!ex && o.etat === 'exc') { retirerException.push(plage); nbExcRetire++ }
    }
    if (plages.length || retirer.length || exception.length || retirerException.length)
      cibles.push({ entretienId: id, regleId: s.regle.id, plages, retirer, exception, retirerException })
  }
  if (cibles.length === 0) {
    messagePseudo.value = 'Aucun changement à valider.'
    return
  }
  const res = await window.sonal.corpus.appliquerRegleAnonLot(cibles)
  const touches = res.succes.filter((x) => x.nb > 0)
  const parties: string[] = []
  if (touches.length > 0) {
    const detail: string[] = []
    if (nbPoses) detail.push(`✅ ${nbPoses} anonymisée(s)`)
    if (nbRetires) detail.push(`↩️ ${nbRetires} dé-pseudonymisée(s)`)
    if (nbExcAjout) detail.push(`🚫 ${nbExcAjout} exception(s) ajoutée(s)`)
    if (nbExcRetire) detail.push(`🔓 ${nbExcRetire} exception(s) retirée(s)`)
    parties.push(
      `✓ Changements enregistrés (${detail.join(', ')}) dans ${touches.length} entretien(s) : ` +
        touches.map((x) => membership.value[x.id]?.titre ?? x.id).join(', ') + '.',
    )
  }
  for (const e of res.echecs) {
    parties.push(`✗ ${membership.value[e.id]?.titre ?? e.id} : ${e.raison}`)
  }
  messagePseudo.value = parties.join(' ') || 'Aucun changement effectué.'
  await rafraichirScanAnon()
  cochees.value = {}
  exceptions.value = {}
  // Les états et détails de TOUS les entretiens déjà dépliés sont recalculés :
  // un diff s'appuie toujours sur des compteurs frais (sinon retraits fantômes).
  for (const id of Object.keys(details.value)) {
    await chargerDetails(id)
    initEtatEnt(id)
  }
}
// Onglet de la colonne gauche : « Thèmes » par défaut, « Recherche » (texte
// plein corpus, parité SonalPi), « Pas à pas » en mode démo.
const ongletCorpus = ref<'themes' | 'recherche' | 'pas-a-pas'>('themes')
// Quand le mode pas-à-pas s'active, bascule l'onglet sur « Pas à pas ».
watch(pasAPas, (v) => {
  if (v) ongletCorpus.value = 'pas-a-pas'
})

// --- ONGLET RECHERCHE : texte plein CORPUS (parité SonalPi rechercherDansCorpus) ---
const requete = ref('')
const motEntier = ref(false)
const resultats = ref<ResultatRecherche[]>([])
const enCours = ref(false)
const message = ref('')
/** Marqueurs pour le « mur » de waveforms (carte par entretien) : le % divisé
 *  par l'axe caractères de chaque occurrence + le contexte affiché si on clic.
 *  Le clic N'ouvre PAS l'entretien (subtilité SonalPi) : il reste en vue Corpus
 *  et affiche l'extrait dans le panneau de gauche. */
const marqueursRecherche = computed(() => {
  const out: Record<string, Array<OccurenceRecherche>> = {}
  for (const r of resultats.value) out[r.id] = r.occurrences
  return out
})
/** L'extrait d'entretien affiché après le clic sur une barre du mur. */
const extraitAffiche = ref<{ id: string; titre: string; pre: string; match: string; post: string; pos: number } | null>(null)
function afficherExtrait(id: string, o: OccurenceRecherche) {
  const r = resultats.value.find((x) => x.id === id)
  extraitAffiche.value = { id, titre: r?.titre ?? id, pre: o.pre, match: o.match, post: o.post, pos: o.pos }
}
/** Lance la recherche : lit chaque entretien, extrait les occurrences (contexte
 *  ±15 mots + position PM), groupe par entretien. Cliquer = ouvrir l'entretien. */
async function lancerRecherche() {
  const q = requete.value.trim()
  if (!q) return
  message.value = ''
  enCours.value = true
  resultats.value = []
  try {
    const res: ResultatRecherche[] = []
    for (const e of listeEntretiens()) {
      const lecture = await window.sonal.corpus.lireEntretien(e.id)
      if (!lecture.ok) continue
      const occurrences = rechercherDansCorpsTexte(lecture.data.corpsTexte, q, { motEntier: motEntier.value })
      if (occurrences.length) res.push({ id: e.id, titre: e.titre, occurrences })
    }
    resultats.value = res
    const nb = res.reduce((n, r) => n + r.occurrences.length, 0)
    message.value = nb
      ? `${nb} occurrence${nb > 1 ? 's' : ''} dans ${res.length} entretien${res.length > 1 ? 's' : ''}`
      : 'Aucune occurrence trouvée.'
  } finally {
    enCours.value = false
  }
}
function effacerRecherche() {
  requete.value = ''
  resultats.value = []
  message.value = ''
}
/** Cliquer une occurrence → ouvrir l'entretien et cale le texte sur le match
 *  (position PM, comme le clic sur un segment thématique). */
function allerOccurrence(id: string, pos: number) {
  ouvrirAuSegment(id, pos)
}
/** Libellé de l'onglet actif, pour le bouton retour « ← … » du panneau
 *  métadonnées (affiché quel que soit l'onglet dès qu'un entretien est
 *  sélectionné). */
const libelleOnglet = computed(() =>
  ongletCorpus.value === 'recherche'
    ? 'Recherche'
    : ongletCorpus.value === 'pas-a-pas'
      ? 'Pas à pas'
      : 'Thèmes',
)

/** Style d'un segment du calque des cartes : position/largeur en % du TEXTE
 *  (parité SonalPi), peinture partagée `peintureSegment` (useCorpus). */
function styleSegment(s: SegmentThematique): Record<string, string> {
  const p = peintureSegment(s.codes)
  const style: Record<string, string> = {
    left: s.deb + '%',
    width: s.fin - s.deb + '%',
  }
  if (p.background) style.background = p.background
  if (p.borderBottom) style.borderBottom = p.borderBottom
  if (p.masque) style.display = 'none'
  return style
}
</script>

<template>
    <section class="ecran corpus-ecran">
      <!-- Barre haute : accès à la base de données (comme SonalPi) -->
      <div class="corpus-barre">
        <button class="btn-table" @click="allerDonnees"><img class="btn-ico" :src="icoDonnees" alt="" /> Base de données</button>
        <button class="btn-table" @click="ouvrirPseudoPanel"><img class="btn-ico" :src="icoAnon" alt="" /> Pseudos</button>
        <!-- Corpus distant : horodatage du dernier pull + « Actualiser ».
             Le pull rafraîchit AUSSI les badges 🔒 — c'est le même geste,
             pas une seconde commande. -->
        <span v-if="idDistantCourant" class="synchro-zone">
          <span class="dernier-tirage" title="Copie locale synchronisée avec le serveur">
            ☁ dernière synchro {{ heureDe(dernierTirage) }}
          </span>
          <button class="btn-table" :disabled="tirageEnCours" @click="actualiser">
            {{ tirageEnCours ? '…' : '⟳ Actualiser' }}
          </button>
        </span>
      </div>

      <div class="grille-corpus">
        <!-- Colonne GAUCHE : onglets Thèmes / Pas à pas, puis bascule
             Thèmes ⇄ Métadonnées de l'entretien sélectionné -->
        <aside class="colonne-g-corpus">
          <!-- Onglets de la colonne gauche (parité vue Entretien) : Thèmes /
               Recherche, + Pas à pas en mode démo. Toujours visibles. -->
          <nav class="onglets-corpus">
            <!-- En corpus DÉMO « Pas à pas », l'onglet arrive EN PREMIER (c'est
                 l'objectif du parcours) ; sinon Thèmes puis Recherche. -->
            <button v-if="pasAPas" :class="{ actif: ongletCorpus === 'pas-a-pas' }" @click="ongletCorpus = 'pas-a-pas'">
              Pas à pas
            </button>
            <button :class="{ actif: ongletCorpus === 'themes' }" title="Thèmes" @click="ongletCorpus = 'themes'">
              <img class="ico-onglet-corpus" :src="icoThemes" alt="" /> Thèmes
            </button>
            <button :class="{ actif: ongletCorpus === 'recherche' }" title="Recherche dans le corpus" @click="ongletCorpus = 'recherche'">
              <img class="ico-onglet-corpus" :src="icoRecherche" alt="" /> Recherche
            </button>
          </nav>

          <!-- Panneau EXtrait (clic sur une barre du mur de recherche) : reste
               en vue Corpus, affiche le contexte de l'occurrence + un bouton pour
               ouvrir l'entretien si besoin. Visible quel que soit l'onglet actif. -->
          <div v-if="extraitAffiche" class="panneau extrait">
            <div class="corpus-tete">
              <h3>Extrait</h3>
              <button class="mini" @click="extraitAffiche = null">✕</button>
            </div>
            <p class="extrait-ent">Entretien : <b>{{ extraitAffiche.titre }}</b></p>
            <p class="extrait-texte">
              <span class="pre">{{ extraitAffiche.pre }}</span>
              <span class="match">{{ extraitAffiche.match }}</span>
              <span class="post">{{ extraitAffiche.post }}</span>
            </p>
            <button class="mini" @click="ouvrirAuSegment(extraitAffiche.id, extraitAffiche.pos)">
              Ouvrir l’entretien ici →
            </button>
          </div>

          <!-- Entretien sélectionné → ses métadonnées (nom éditable + infos).
               Indépendant de l'onglet actif : visible sur Thèmes, Recherche et
               Pas à pas ; le bouton retour referme la sélection et rend son
               panneau à l'onglet en cours. -->
          <div v-if="corpusSelId" class="panneau meta-ent">
            <div class="corpus-tete">
              <h3>Entretien</h3>
              <button class="mini" @click="deselectionnerCorpus">← {{ libelleOnglet }}</button>
            </div>
            <label class="champ-nom">
              <span class="champ-lbl">Nom</span>
              <input
                class="titre-meta"
                :value="membership[corpusSelId]?.titre"
                :disabled="!metaEditables(corpusSelId)"
                :title="titreChampMeta(corpusSelId)"
                @change="renommer(corpusSelId, $event)"
              />
            </label>
            <ul v-if="corpusSelMeta" class="meta-infos">
              <li><span>Locuteurs</span><b>{{ corpusSelMeta.nbLocuteurs }}</b></li>
              <li><span>Valeurs saisies</span><b>{{ corpusSelMeta.nbValeurs }}</b></li>
              <li><span>Audio</span><b>{{ corpusSelMeta.audio ? 'lié' : '—' }}</b></li>
            </ul>
            <p v-else class="vide">Lecture…</p>
            <!-- Variables du corpus pour CET entretien, en LECTURE SEULE
                 (parité V1 : l'édition des valeurs passe par la table de
                 données / l'onglet Données de l'entretien). -->
            <div v-if="corpusSelMeta" class="meta-vars">
              <template v-if="corpusSelMeta.generales.length">
                <h4>Variables générales</h4>
                <div v-for="l in corpusSelMeta.generales" :key="l.id" class="ligne-var">
                  <span class="lbl-var" :title="l.lib">{{ l.lib }}</span>
                  <span class="val-var" :class="{ vide: !l.valeur }">{{ l.valeur ?? '—' }}</span>
                </div>
              </template>
              <div v-for="loc in corpusSelMeta.parLocuteur" :key="loc.nom" class="bloc-loc">
                <h4>{{ loc.nom }}</h4>
                <div v-for="l in loc.lignes" :key="l.id" class="ligne-var">
                  <span class="lbl-var" :title="l.lib">{{ l.lib }}</span>
                  <span class="val-var" :class="{ vide: !l.valeur }">{{ l.valeur ?? '—' }}</span>
                </div>
              </div>
            </div>
            <!-- Bouton de retrait du corpus (parité V1 : en fin de panneau).
                 La confirmation réutilise le bandeau commun des cartes. -->
            <button
              class="mini suppr-meta"
              :disabled="!metaEditables(corpusSelId)"
              :title="titreChampMeta(corpusSelId)"
              @click="demanderSuppressionEntretien(corpusSelId)"
            >❌ Supprimer cet entretien du corpus</button>
            <button class="mini assigner-audio" :disabled="!metaEditables(corpusSelId)" @click="assignerAudioSelection">
              {{ corpusSelMeta?.audio ? 'Remplacer l’audio…' : 'Assigner un audio…' }}
            </button>
            <!-- Distant uniquement : lier un audio qui VIT sur le serveur
                 copie miroir chez chaque membre. -->
            <button
              v-if="idDistantCourant && corpusSelId"
              class="mini assigner-audio"
              :disabled="!metaEditables(corpusSelId)"
              @click="ouvrirDesignationAudio(corpusSelId)"
            >
              {{ corpusSelMeta?.audio ? 'Redésigner dans le Nextcloud…' : 'Désigner dans le Nextcloud…' }}
            </button>
          </div>

          <!-- Sinon : thèmes en CONSULTATION compacte ; le crayon ouvre la fenêtre
               d'édition partagée (parité SonalPi — nom/couleur/taille/arbre). -->
          <aside v-else-if="ongletCorpus === 'themes'" class="panneau themes-corpus">
            <div class="corpus-tete">
              <h3>Thèmes</h3>
              <button v-if="!lectureSeule" class="crayon" title="Éditer les thèmes" @click="editerThemes = true">✏️</button>
            </div>
            <p class="aide-thm">Le codage se fait au niveau des entretiens</p>
            <p v-if="codebook.length === 0" class="vide">Aucun thème — ✏️ pour en créer.</p>
            <ul class="liste-thm-lecture">
              <li
                v-for="n in arbreVisible"
                :key="n.cat.id"
                :class="{ inactif: !n.cat.actif }"
                :style="{ paddingLeft: n.profondeur * 1.1 + 'rem' }"
                @contextmenu.prevent="ouvrirMenuTheme(n.cat, $event)"
              >
                <button
                  v-if="n.aEnfants"
                  class="depliant"
                  :title="repliesThemes.has(n.cat.id) ? 'Replier les sous-thèmes' : 'Déplier les sous-thèmes'"
                  @click.stop="basculerRepli(n.cat.id)"
                >
                  {{ repliesThemes.has(n.cat.id) ? '▸' : '▾' }}
                </button>
                <span v-else class="depliant depliant-masque"></span>
                <span class="pastille" :style="{ background: couleurHex(n.cat) }"></span>
                <span class="nom-thm-lecture">{{ n.cat.nom }}</span>
                <span class="usage" :title="`${usages[n.cat.id] ?? 0} codage(s)`">{{ usages[n.cat.id] ?? 0 }}</span>
              </li>
            </ul>
          </aside>

          <!-- Onglet Recherche : recherche plein texte sur TOUS les entretiens. -->
          <div v-else-if="ongletCorpus === 'recherche'" class="panneau recherche">
            <div class="corpus-tete">
              <h3>Recherche</h3>
            </div>
            <p class="aide-thm">Cherche dans le texte de tous les entretiens (insensible à la casse).</p>
            <div class="barre-recherche">
              <input
                class="req-recherche"
                v-model="requete"
                placeholder="Rechercher…"
                @keyup.enter="lancerRecherche"
              />
              <button class="btn-rech" :disabled="!requete.trim() || enCours" @click="lancerRecherche">
                {{ enCours ? '…' : 'Rechercher' }}
              </button>
            </div>
            <label class="opt-recherche" :class="{ coche: motEntier }">
              <input type="checkbox" v-model="motEntier" @change="lancerRecherche" />
              <span class="opt-lib">Mot entier</span>
            </label>
            <p class="opt-info-texte">Mot entier : seuls les mots exacts comptent — « le » trouve « le », mais pas « parle ».</p>
            <p v-if="message" class="rech-info">{{ message }}</p>

            <ul v-if="resultats.length" class="liste-rech-crp">
              <li v-for="r in resultats" :key="r.id" class="ent-rech">
                <div class="titre-ent-rech">Entretien : <b>{{ r.titre }}</b>
                  <span class="nb-rech">{{ r.occurrences.length }}</span>
                </div>
                <ul class="occ-rech">
                  <li v-for="(o, i) in r.occurrences" :key="i">
                    <button class="occ-rech-btn" title="Ouvrir l’entretien ici" @click="allerOccurrence(r.id, o.pos)">
                      <span class="pre">{{ o.pre }}</span>
                      <span class="match">{{ o.match }}</span>
                      <span class="post">{{ o.post }}</span>
                    </button>
                  </li>
                </ul>
              </li>
            </ul>
            <button v-if="resultats.length" class="effacer-rech" @click="effacerRecherche">✕ Effacer</button>
          </div>

          <!-- Pas à pas (onglet démo) : liste des étapes + spotlight global
               (téléporté en body → visible dans n'importe quelle vue). La liste
               est masquée selon l'onglet, le spotlight reste actif partout. -->
          <PasAPas v-if="pasAPas" :montre-liste="ongletCorpus === 'pas-a-pas'" />
        </aside>

        <!-- Colonne DROITE (large) : entretiens en cartes ; à terme = spectrogramme -->
        <section class="colonne-d-corpus">
          <div class="corpus-tete">
            <h3>Entretiens</h3>
            <span class="actions-ent">
              <!-- Point de reprise : rouvre le dernier entretien
                   fermé là où on en était (texte + audio). -->
              <button v-if="reprise" class="btn-reprise" @click="reprendre">
                ↩ Reprendre « {{ membership[reprise.id]?.titre }} »
              </button>
              <!-- UN seul point d'entrée (à la SonalPi) : la modale à deux
                   zones couvre import texte, texte+audio, audio seul et vierge.
                   Masqué en corpus distant (lecture seule). -->
              <AjoutEntretien v-if="!lectureSeule" />
            </span>
          </div>
          <!-- Ancre du message « re-test » du pas-à-pas : pour une étape de
               niveau CORPUS (ex. « Charger un entretien »), le message « déjà
               réalisée » s'affiche ici — à côté des cartes d'entretiens — et
               non dans l'éditeur. -->
          <div data-tour="ancre-retest-pp"></div>
          <!-- Confirmation de suppression (acte destructif — mise en corbeille/,
               même idiome de bannière que thèmes et locuteurs). -->
          <div v-if="entretienASupprimer" class="confirm-suppr">
            Supprimer « {{ entretienASupprimer.titre }} » ? L'entretien (et son audio) part dans
            <b>corbeille/</b> du dossier de corpus — il disparaît de l'application.
            <div class="confirm-actions">
              <button class="danger" @click="confirmerSuppressionEntretien">Supprimer</button>
              <button @click="entretienASupprimer = null">Annuler</button>
            </div>
          </div>

          <!-- Bandeau d'intégrité : des audios référencés sont introuvables
               (fichier déplacé/supprimé). Calculé à l'ouverture du corpus ;
               clic = ouvrir l'entretien → le lecteur propose de ré-assigner. -->
          <div v-if="Object.keys(audiosManquants).length > 0" class="bandeau-audio" data-tour="bandeau-audio">
            <span class="bandeau-audio-titre">
              ⚠️ {{ Object.keys(audiosManquants).length }} fichier(s) média introuvable(s) — déplacé(s) ou supprimé(s) ?
            </span>
            <ul class="bandeau-audio-liste">
              <li v-for="id in Object.keys(audiosManquants)" :key="id">
                <button class="bandeau-audio-ent" @click="ouvrirEntretien(id)">
                  {{ membership[id]?.titre ?? id }}
                </button>
              </li>
            </ul>
          </div>

          <p v-if="listeEntretiens().length === 0" class="vide">Aucun entretien — « + Ajouter un entretien ».</p>
          <ul class="cartes-ent">
            <li
              v-for="e in listeEntretiens()"
              :key="e.id"
              class="carte-ent"
              :class="{ selection: corpusSelId === e.id }"
              @click="selectionnerCorpus(e.id)"
            >
              <div class="ent-titre" :title="e.titre">{{ e.titre }}
                <!-- Badge de verrou fiable : « tenu par X » vient du
                     SERVEUR (scan verrous/ au pull), jamais d'une déduction.
                     Notre propre session n'est pas badgée (filtrée côté main). -->
                <span v-if="badgeVerrou(e.id)" class="badge-verrou"
                      :title="`Verrou tenu par ${badgeVerrou(e.id)!.userId} depuis ${heureDe(badgeVerrou(e.id)!.acquiredAt)} — ouverture en lecture seule.`">
                  🔒 {{ badgeVerrou(e.id)!.userId }}
                </span>
                <!-- Présence : « consulté par X » — informatif, JAMAIS
                     décisionnel (la décision, c'est le verrou ci-dessus). -->
                <span v-for="p in presencesSur(e.id)" :key="p.machineId"
                      class="badge-presence" :title="`Consulté par ${p.userId} (autre poste)`">
                  👁 {{ p.userId }}
                </span>
              </div>
                <!-- Forme d'onde de l'audio assigné ; sinon placeholder.
                     Dans les deux cas, le CALQUE du résumé thématique (parité SonalPi)se superpose :
                      un span par segment codé, positionné en % du TEXTE ;
                     clic = ouvrir l'entretien à cet endroit.
                     Layout SonalPi : nom À GAUCHE, onde À DROITE (les lignes empilées forment le « mur » d'ondes). -->
                <div class="spectro-cadre">
                  <img v-if="urlWaveform(e.id)" class="spectro" :src="urlWaveform(e.id)!" alt="" draggable="false" />
                  <div v-else class="spectro-vide" title="Importe un SRT + audio, ou « Assigner un audio »">pas d'audio</div>
                  <span
                    v-for="(s, i) in resumes[e.id] ?? []"
                    :key="i"
                    class="xtr-graph"
                    :style="styleSegment(s)"
                    :title="s.codes.map(nomTheme).join(' + ')"
                    @click.stop="ouvrirAuSegment(e.id, s.pos)"
                  ></span>
                  <!-- Marqueurs de RECHERCHE : une pastille par occurrence, à son
                       emplacement % (axe caractères, aligné sur le résumé). Clic =
                       RESTE en vue Corpus et affiche l'extrait dans le panneau de
                       gauche (subtilité SonalPi) — n'ouvre pas l'entretien. -->
                  <span
                    v-for="(m, mi) in marqueursRecherche[e.id] ?? []"
                    :key="'m' + mi"
                    class="occ-marqueur"
                    :style="{ left: m.pourcent + '%' }"
                    :title="'Afficher l’extrait — « ' + requete + ' »'"
                    @click.stop="afficherExtrait(e.id, m)"
                  ></span>
                </div>
              <div class="carte-actions">
                <!-- Si l'entretien est verrouillé par autrui, le CRAYON
                     devient VERROU (visible même sur un écran étroit où le
                     badge du titre est tronqué) ; le détail — qui ? depuis
                     quand ? — passe en tooltip au survol. Le clic ouvre
                     toujours, en lecture seule.
                     La SUPPRESSION ne vit pas sur la carte : elle a migré dans
                     le panneau métadonnées (parité V1). -->
                <button
                  class="crayon"
                  data-tour="crayon-entretien"
                  :title="titreCrayon(e.id)"
                  @click.stop="ouvrirEntretien(e.id)"
                >{{ badgeVerrou(e.id) ? '🔒' : '✏️' }}</button>
              </div>
            </li>
          </ul>
        </section>
      </div>

      <!-- Panneau « Pseudos » du corpus (LECTURE SEULE) : règles
           corpus + scan (anonymisé / exception / à traiter par entretien).
           En 3a aucune règle n'est encore créable → état vide (infra préparée
           pour le cran corpus de 3b). -->
      <div v-if="pseudoPanel" class="pseudo-overlay" @click.self="fermerPseudo">
        <div class="pseudo-panneau pseudo-deux-col" :style="{ '--pseudo-gauche-w': largeurGauche }">
          <header class="pseudo-tete">
            <h3>Pseudos <span class="pseudo-sous">— règles d'anonymisation du corpus</span></h3>
            <div class="pseudo-tete-actions">
              <button class="engrenage" title="Paramètres de pseudonymisation" @click="parametresOuverts = !parametresOuverts">⚙</button>
              <button class="close" @click="fermerPseudo" title="Fermer">✕</button>
            </div>
          </header>

          <!-- Paramètres (étape 4a/4b-A) : priorité de validation + mots de liaison. -->
          <div v-if="parametresOuverts" class="pseudo-params">
            <b>Priorité de validation</b>
            <label><input v-model="prioriteLocale" type="radio" value="corpus" /> Corpus — Entrée crée la règle partagée, Maj+Entrée reste sur l'entretien</label>
            <label><input v-model="prioriteLocale" type="radio" value="entretien" /> Entretien — Entrée pose dans l'entretien courant, Maj+Entrée pousse au corpus</label>
            <p class="pseudo-params-hint">
              Décide quelle portée la touche Entrée applique sur une ligne du tableau anon d'un entretien.
            </p>
            <b class="pseudo-params-titre">Mots de liaison et articles</b>
            <label><input v-model="motsLiaisonActif" type="checkbox" @change="committerMotsLiaison" /> Activer la détection (« à Lyon » → proposer « Lyon »)</label>
            <template v-if="motsLiaisonActif">
              <input
                v-model="motsLiaisonListe"
                type="text"
                class="pseudo-params-liste"
                placeholder="à, de, du, au, chez…"
                @change="committerMotsLiaison"
              />
              <p class="pseudo-params-hint">Mots séparés par des espaces ou des virgules. La proposition à la validation arrive avec le livrable dédié.</p>
            </template>
            <b class="pseudo-params-titre">Thématiques d'entités</b>
            <label><input v-model="thematiquesActif" type="checkbox" @change="committerThematiques" /> Activer les catégories (PER, LOC…)</label>
            <template v-if="thematiquesActif">
              <input
                v-model="thematiquesListeTexte"
                type="text"
                class="pseudo-params-liste"
                placeholder="PER, LOC, ORG, DAT"
                @change="committerThematiques"
              />
              <p class="pseudo-params-hint">
                Catégories séparées par des espaces ou des virgules. Dans la recherche,
                saisir exactement un nom de catégorie filtre le tableau dessus.
              </p>
            </template>
          </div>

          <div v-if="reglesAnon.length === 0" class="pseudo-vide">
            Aucune règle d'anonymisation corpus pour l'instant.
            <div class="pseudo-hint">
              (La création de règles s'active via le cran « corpus » du slider, dans l'onglet Anon d'un entretien.)
            </div>
          </div>

          <template v-else>
            <!-- Partie GAUCHE : recherche + table des règles, loupe par ligne. -->
            <div class="pseudo-gauche">
              <input
                v-model="filtreRegle"
                class="pseudo-recherche"
                type="search"
                :placeholder="thematiquesListe.length ? 'Rechercher une entité, un pseudo ou une catégorie…' : 'Rechercher une entité ou un pseudo…'"
              />
              <!-- Compteur de règles affichées / total (parité V1, barre de filtrage). -->
              <div class="pseudo-compteur">
                {{ scanFiltre.length }}<template v-if="scanFiltre.length !== scanAnon.length"> / {{ scanAnon.length }}</template>
                règle(s)
              </div>
              <!-- La table défile SEULE : recherche et compteur restent visibles,
                   l'en-tête des colonnes est épinglé en haut du défilement. -->
              <div class="pseudo-table-wrap">
              <table ref="tableRegles" class="pseudo-table">
                <thead>
                  <tr><th title="Tout traité / à traiter"></th><th>Entité</th><th>Pseudo</th><th>Anon.</th><th>Exc.</th><th>À anon.</th><th title="Détail par entretien"></th></tr>
                </thead>
                <tbody>
                  <tr v-for="s in scanFiltre" :key="s.regle.id" :class="{ sel: selectedRegleId === s.regle.id, ok: etatRegle(s) === 'ok', todo: etatRegle(s) === 'todo' }">
                    <td class="etat"><span class="pastille" :class="etatRegle(s)" :title="etatRegle(s) === 'ok' ? 'Tout est traité' : 'Des occurrences restent à traiter'">{{ etatRegle(s) === 'ok' ? '✓' : '!' }}</span></td>
                    <td class="cell-entite">{{ s.regle.entite.join(' / ') }}</td>
                    <td class="cell-pseudo">{{ s.regle.pseudos.join(' / ') }}</td>
                    <td class="num anon">{{ s.total.anon }}<sup v-if="s.total.incl > 0" class="sup-incl" title="Incluse(s) — absorbée(s) par une entité plus large (non comptée(s) ici)">*</sup></td>
                    <td class="num exc">{{ s.total.exc }}</td>
                    <td class="num non">{{ s.total.non }}</td>
                    <td class="cell-actions">
                      <select
                        v-if="thematiquesListe.length"
                        class="cat-select"
                        :value="s.regle.categorie ?? ''"
                        title="Thématique de l'entité"
                        @change="categoriser(s.regle.id, ($event.target as HTMLSelectElement).value)"
                      >
                        <option value="">—</option>
                        <option v-for="t in thematiquesListe" :key="t" :value="t">{{ t }}</option>
                      </select>
                      <button class="loupe" title="Voir les entretiens concernés" @click="selectionnerRegle(s.regle.id)">🔍</button>
                    </td>
                  </tr>
                </tbody>
              </table>
              </div>
            </div>

            <!-- Partie DROITE : drill-down d'une règle (entretiens + masque). -->
            <div class="pseudo-droite">
              <div v-if="!scanPourRegle" class="pseudo-droite-vide">
                Clique sur la loupe 🔍 d'une règle pour voir les entretiens concernés et valider les occurrences.
              </div>
              <template v-else>
                <div class="pseudo-detail-tete">
                  <b>« {{ scanPourRegle.regle.entite.join(' / ') }} »</b>
                  <span class="pseudo-detail-pseudos">{{ scanPourRegle.regle.pseudos.join(' / ') }}</span>
                </div>
                <p v-if="messagePseudo" class="pseudo-message">{{ messagePseudo }}</p>
                <p class="pseudo-aide">
                  Déplie un entretien : cochée = anonymisée, décochée = à traiter ;
                  le 🚫 de droite met en exception. Ajuste puis Valide.
                </p>
                <ul class="pseudo-ent-list">
                  <li
                    v-for="e in entretiensRegle()"
                    :key="e.id"
                    class="acc"
                    :class="entToutTraite(e.anon, e.exc, e.incl, e.non) ? 'acc-ok' : 'acc-todo'"
                  >
                    <!-- En-tête d'accordéon (façon V1) : coche-tout, titre, badges, flèche -->
                    <div class="acc-tete" @click="basculerDepli(e.id)">
                      <input
                        type="checkbox"
                        :checked="entToutCoche(e.id)"
                        :disabled="!!badgeVerrou(e.id)"
                        :title="
                          badgeVerrou(e.id)
                            ? `Verrou tenu par ${badgeVerrou(e.id)!.userId} — validation impossible tant que cette session tient`
                            : 'Cocher / décocher toutes les occurrences de cet entretien'
                        "
                        @click.stop
                        @change="toutCocherEnt(e.id)"
                      />
                      <span class="acc-titre" :title="e.titre">{{ e.titre }}</span>
                      <span v-if="badgeVerrou(e.id)" class="pseudo-cpt verrou" :title="`Verrou tenu par ${badgeVerrou(e.id)!.userId}`">🔒</span>
                      <span class="acc-badges">
                        <span v-if="e.non > 0" class="badge-rond todo" :title="`${e.non} occurrence(s) à traiter`">{{ e.non }}</span>
                        <span v-if="e.anon > 0" class="badge-rond ok" :title="e.anon + ' anonymisée(s)' + (e.incl > 0 ? ' — plus ' + e.incl + ' absorbée(s) par une autre entité plus large (non comptée(s) ici)' : '')">{{ e.anon }}<sup v-if="e.incl > 0">*</sup></span>
                        <span v-if="e.exc > 0" class="badge-rond exc" :title="e.exc + ' exception(s) laissée(s) en clair'">{{ e.exc }}</span>
                      </span>
                      <span class="acc-fleche" :class="{ ouvert: deplie === e.id }">▼</span>
                    </div>

                    <!-- Contenu déplié : forme ARBORESCENTE (les passages sont
                         décalés sous l'entretien qui les porte) ; chaque ligne
                         porte une case d'ÉTAT façon V1 + le 🚫 d'exception. -->
                    <div v-if="deplie === e.id" class="occ-list">
                      <div
                        v-for="o in occurrencesDe(e.id)"
                        :key="cleOcc(o)"
                        class="occ"
                        :class="`occ-${etatOcc(e.id, o)}`"
                      >
                        <!-- Incluse : case cochée VERROUILLÉE (anonymisée sous une règle plus large). -->
                        <input
                          v-if="o.etat === 'incl'"
                          type="checkbox"
                          checked
                          disabled
                          title="Absorbée par une entité plus large — non modifiable ici"
                        />
                        <!-- Exception : icône 🚫 à GAUCHE, clic = la retirer. -->
                        <span
                          v-else-if="enException(e.id, o)"
                          class="occ-exc-toggle"
                          title="Retirer l'exception — redevient à traiter"
                          @click.stop="retirerException(e.id, o)"
                        >🚫</span>
                        <!-- Sinon la case d'ÉTAT : cochée = anonymisée, décochée = à traiter. -->
                        <input
                          v-else
                          type="checkbox"
                          :checked="estCochee(e.id, o)"
                          :disabled="!!badgeVerrou(e.id)"
                          title="Cochée = anonymiser cette occurrence"
                          @click.stop
                          @change="basculerCoche(e.id, o)"
                        />
                        <span class="occ-texte">
                          <span class="ctx">{{ o.avant }}</span><b>{{ o.match }}</b><span v-if="etatOcc(e.id, o) === 'anon'" class="occ-pseudo">[{{ scanPourRegle.regle.pseudos[0] }}]</span><span v-if="o.etat === 'incl'" class="occ-note">(incluse)</span><span class="ctx">{{ o.apres }}</span>
                        </span>
                        <!-- 🚫 droit : disponible seulement si la case est cochée (parité V1). -->
                        <button
                          v-if="o.etat !== 'incl' && estCochee(e.id, o)"
                          class="occ-exc-btn"
                          title="Marquer comme exception (ne pas anonymiser)"
                          @click.stop="demanderException(e.id, o)"
                        >🚫</button>
                        <button class="pseudo-ouvrir" title="Ouvrir cet entretien à cette occurrence" @click.stop="ouvrirAuSegment(e.id, o.from)">↗</button>
                      </div>
                    </div>
                  </li>
                </ul>
                <div class="pseudo-actions">
                  <button
                    class="pseudo-appliquer"
                    :disabled="lectureSeule"
                    :title="lectureSeule ? 'Nécessite une connexion au corpus partagé' : 'Enregistre les changements cochés : poses, retraits et exceptions'"
                    @click="valider"
                  >Valider</button>
                </div>
              </template>
            </div>
          </template>
        </div>
      </div>

      <EditionThemes v-if="editerThemes" contexte="corpus" @fermer="editerThemes = false" />
      <MenuTheme
        v-if="menuTheme"
        :x="menuTheme.x"
        :y="menuTheme.y"
        :nom="menuTheme.nom"
        :actif="menuTheme.actif"
        @basculer="basculerActifTheme"
        @fermer="menuTheme = null"
      />
    </section>
</template>

<style scoped>
.actions-ent {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.corpus-barre {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.6rem;
  /* Respiration sous la barre : le bouton « + Ajouter un entretien »
     (en-tête de la colonne Entretiens) reste bien détaché des boutons
     « Base de données » / « Pseudos » qui sont juste au-dessus. */
  margin-bottom: 2.2rem;
}
/* Zone de synchro du corpus distant (horodatage + Actualiser) : pousse le
   reste de la barre à gauche, reste discrète. */
.synchro-zone {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}
.dernier-tirage {
  font-size: 0.8rem;
  color: #555;
}
.badge-verrou {
  display: inline-block;
  margin-left: 0.4rem;
  font-size: 0.72rem;
  font-weight: 400;
  color: #6d4c00;
  background: #fff3cd;
  border: 1px solid #e6cf8b;
  border-radius: 999px;
  padding: 0 0.45em;
}
.btn-table {
  padding: 0.4rem 0.9rem;
  border: 1px solid #1565c0;
  background: #2e73d8;
  color: #fff;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
}
/* Icône dans un bouton de la barre haute : calée sur le texte. */
.btn-ico {
  height: 1em;
  vertical-align: -0.15em;
}
.grille-corpus {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 1rem;
  align-items: start;
}
/* --- Onglets colonne gauche (Thèmes / Recherche / Pas à pas) --- */
.onglets-corpus {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
}
.onglets-corpus button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  border: 1px solid #ddd;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  background: #f0f0f5;
  padding: 0.3rem 0.2rem;
  font-size: 0.78rem;
  cursor: pointer;
}
.onglets-corpus button.actif {
  background: #fff;
  font-weight: 600;
  color: #1565c0;
}
.ico-onglet-corpus {
  width: 15px;
  height: 15px;
  object-fit: contain;
  opacity: 0.6;
  flex: none;
}
.onglets-corpus button.actif .ico-onglet-corpus {
  opacity: 1;
}
/* --- Onglet Recherche : recherche plein texte du corpus (parité SonalPi) --- */
.barre-recherche {
  display: flex;
  gap: 0.35rem;
  margin-top: 0.4rem;
}
.req-recherche {
  flex: 1;
  min-width: 0;
  border: 1px solid #ccc;
  border-radius: 5px;
  padding: 0.25rem 0.4rem;
  font-size: 0.82rem;
}
.btn-rech {
  border: 1px solid #1565c0;
  background: #2e73d8;
  color: #fff;
  border-radius: 5px;
  padding: 0.25rem 0.7rem;
  font-size: 0.8rem;
  cursor: pointer;
  flex: none;
}
.btn-rech:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.opt-recherche {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.4rem;
  font-size: 0.78rem;
  color: #555;
  cursor: pointer;
  user-select: none;
}
.opt-recherche input {
  accent-color: #2e73d8;
  cursor: pointer;
}
.opt-recherche.coche .opt-lib {
  color: #1565c0;
  font-weight: 600;
}
.opt-info-texte {
  margin: 0.25rem 0 0;
  font-size: 0.72rem;
  color: #999;
  font-style: italic;
}
.rech-info {
  margin: 0.4rem 0 0;
  font-size: 0.78rem;
  color: #666;
}
/* Résultats groupés par entretien (parité SonalPi .liste-rech-crp / .occurence-rech) */
.liste-rech-crp {
  list-style: none;
  margin: 0.4rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.ent-rech {
  border: 1px solid #e5e5ef;
  border-radius: 6px;
  padding: 0.3rem 0.4rem;
  background: #fff;
}
.titre-ent-rech {
  font-size: 0.82rem;
  color: #333;
  margin-bottom: 0.25rem;
}
.nb-rech {
  font-size: 0.7rem;
  color: #999;
  font-family: monospace;
  margin-left: 0.3rem;
}
.occ-rech {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  max-height: 220px;
  overflow-y: auto;
}
.occ-rech-btn {
  width: 100%;
  text-align: left;
  border: 1px solid #eee;
  border-radius: 4px;
  background: #fafafe;
  padding: 0.25rem 0.35rem;
  font-size: 0.75rem;
  color: #444;
  cursor: pointer;
  line-height: 1.35;
}
.occ-rech-btn:hover {
  border-color: #2e73d8;
  background: #f0f6ff;
}
.occ-rech-btn .match {
  font-weight: 700;
  color: #1565c0;
  /* Espace VISUEL autour du match : les espaces du template sont des nœuds
     texte réduits à des blancs, que Vue supprime en mode condense — mieux vaut
     une marge (garantie) qu'un espace littéral (détruit à la compilation).
     0.3em ≈ la largeur d'un espace. */
  margin: 0 0.3em;
}
.effacer-rech {
  margin-top: 0.5rem;
  border: 1px dashed #bbb;
  border-radius: 5px;
  background: #fff;
  color: #666;
  cursor: pointer;
  padding: 0.15rem 0.5rem;
  font-size: 0.75rem;
  width: 100%;
}
.effacer-rech:hover {
  border-color: #2e73d8;
  color: #1565c0;
}
/* --- Panneau Extrait (clic sur une barre du mur de recherche) --- */
.extrait {
  border: 1px solid #dce4ef;
  background: #fafdff;
}
.extrait-ent {
  margin: 0.3rem 0 0;
  font-size: 0.8rem;
  color: #333;
}
.extrait-texte {
  margin: 0.4rem 0;
  border: 1px solid #e5e5ef;
  border-left: 3px solid #1565c0;
  border-radius: 4px;
  background: #fff;
  padding: 0.4rem 0.5rem;
  font-size: 0.82rem;
  color: #444;
  line-height: 1.45;
}
.extrait-texte .match {
  font-weight: 700;
  color: #1565c0;
  background: #fff3c4;
  padding: 0 0.15rem;
  /* Espaces VISUEL autour du match (les espaces du template sont détruits par
     le mode condense de Vue — marge garantie, cf. .occ-rech-btn .match). */
  margin: 0 0.3em;
}
/* --- Colonne gauche : métadonnées de l'entretien sélectionné --- */
.meta-ent .champ-nom {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  margin: 0.4rem 0;
}
.champ-lbl {
  font-size: 0.72rem;
  color: #888;
}
.titre-meta {
  border: 1px solid #ccc;
  border-radius: 5px;
  padding: 0.3rem 0.4rem;
  font-size: 0.9rem;
}
/* Variables de l'entretien (lecture seule, parité V1) : sections titrées,
   lignes libellé → valeur ; défilement si la liste est longue. */
.meta-vars {
  margin-top: 0.6rem;
  max-height: 40vh;
  overflow-y: auto;
  border-top: 1px dashed #ddd;
  padding-top: 0.3rem;
}
.meta-vars h4 {
  margin: 0.5rem 0 0.2rem;
  font-size: 0.8rem;
  color: #1565c0;
}
.ligne-var {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 0.82rem;
  padding: 0.15rem 0;
  border-bottom: 1px dashed #eee;
}
.lbl-var {
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.val-var {
  font-weight: 600;
  white-space: nowrap;
}
.val-var.vide {
  color: #bbb;
  font-weight: 400;
}
/* Retrait du corpus depuis le panneau (parité V1 : croix en fin de panneau). */
.suppr-meta {
  margin-top: 0.7rem;
  color: #b00020;
  border-color: #e0b4b4;
}
.meta-infos {
  list-style: none;
  margin: 0.6rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.meta-infos li {
  display: flex;
  justify-content: space-between;
  font-size: 0.82rem;
  border-bottom: 1px dashed #eee;
  padding-bottom: 0.2rem;
}
.meta-infos li span {
  color: #666;
}
/* --- Colonne droite : entretiens en cartes --- */
/* Bandeau d'intégrité (audio référencé introuvable) : informe, n'empêche
   rien — on ne bloque jamais l'app pour un média manquant. */
.bandeau-audio {
  border: 1px solid #f3b4ad;
  background: #fdecea;
  border-radius: 8px;
  padding: 0.45rem 0.6rem;
  margin-top: 0.5rem;
  font-size: 0.8rem;
  color: #b3261e;
}
.bandeau-audio-titre {
  display: block;
  font-weight: 600;
}
.bandeau-audio-liste {
  list-style: none;
  margin: 0.35rem 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.bandeau-audio-ent {
  border: 1px solid #e0a0a0;
  background: #fff;
  color: #b3261e;
  border-radius: 5px;
  padding: 0.15rem 0.5rem;
  font-size: 0.78rem;
  cursor: pointer;
}
.bandeau-audio-ent:hover {
  border-color: #b3261e;
}
.cartes-ent {
  list-style: none;
  margin: 0.4rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.carte-ent {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid #e0e0ea;
  border-radius: 6px;
  padding: 0.3rem 0.5rem;
  background: #fff;
  cursor: pointer;
}
.carte-ent:hover {
  border-color: #b9c7bb;
}
.carte-ent.selection {
  border-color: #2e73d8;
  background: #f0f6ff;
}
.ent-titre {
  /* Nom À GAUCHE, largeur fixe (parité SonalPi .lbl-nom-ent 27 %) — les ondes
     empilées forment une colonne régulière (« mur » visuel). */
  width: 27%;
  flex-shrink: 0;
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.carte-ent .badge-verrou {
  flex-shrink: 0; /* le badge ne se fait pas manger par l'ellipse du titre */
}
.badge-presence {
  flex-shrink: 0;
  font-size: 0.72rem;
  padding: 0 0.4rem;
  border-radius: 8px;
  background: #e2ecff;
  color: #1d4fa1;
}
.spectro {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover; /* parité SonalPi (.ligent-img) : pas de distorsion */
  border-radius: 3px; /* conserve le coin arrondi du cadre (overflow visible désormais) */
}
/* Cadre de superposition du résumé thématique (les .xtr-graph se positionnent
   en % de SA largeur — la même que l'onde ou le placeholder). Conteneur
   compact à la SonalPi : 25 px de haut, dégradé vertical (creux au centre),
   bord fin — c'est lui qui donne la profondeur au « mur » d'ondes. */
.spectro-cadre {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 25px;
  border-radius: 3px;
  border: 1px solid #cbcbcb;
  background: linear-gradient(#00000040 0%, #fbf5f560 50%, #00000040 100%);
  /* overflow VISIBLE : les marqueurs de recherche dépassent au-dessus/en dessous
     du cadre (parité SonalPi .occurence-canvas). L'image .spectro, elle, est en
     absolute inset:0 → ne déborde jamais ; ses coins sont arrondis par son propre
     border-radius (ci-dessous) puisqu'on ne clippe plus ici. */
  overflow: visible;
}
.xtr-graph {
  position: absolute;
  top: 1px;
  bottom: 1px;
  opacity: 0.55; /* parité SonalPi : la couleur reste celle du thème MAIS l'onde reste lisible dessous */
  cursor: pointer;
  box-sizing: border-box;
  border-radius: 2px;
}
.xtr-graph:hover {
  opacity: 0.8; /* survol SonalPi : le segment s'affirme (clic = rouvrir au texte) */
  border: 1px solid #030303;
}
/* Marqueur de RECHERCHE sur le « mur » d'ondes — parité SonalPi
   .occurence-canvas : barre JAUNE vif, tour ROUGE gras, qui dépasse un peu du
   cadre, bien visible. Centrée sur la position % de l'occurrence ; au survol,
   elle passe au rouge et s'épaissit (comme SonalPi). */
.occ-marqueur {
  position: absolute;
  top: -4px;
  bottom: -4px; /* dépasse un peu au-dessus ET en dessous du cadre */
  width: 4px;
  margin-left: -2px; /* centrée sur son % */
  background: rgb(254 255 0);
  border: 2px solid #ff0000; /* tour gras rouge */
  border-radius: 2px;
  cursor: pointer;
  z-index: 10;
  box-sizing: border-box;
}
.occ-marqueur:hover {
  background: rgb(255 0 0);
  width: 6px;
  margin-left: -3px;
  box-shadow: 0 0 4px rgba(255, 0, 0, 0.5);
}
.assigner-audio {
  margin-top: 0.6rem;
  width: 100%;
}
.spectro-vide {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.66rem;
  color: #9a9aa8;
  font-style: italic;
}
.carte-actions {
  display: flex;
  gap: 0.25rem;
  align-items: center;
  flex: none;
}
/* .crayon : style GLOBAL (base.css) — partagé avec l'écran Entretien. */
.suppr {
  border: none;
  background: none;
  color: #c33;
  cursor: pointer;
  font-size: 0.8rem;
}
/* --- Thèmes en consultation (l'édition vit dans la modale EditionThemes) --- */
.liste-thm-lecture {
  list-style: none;
  margin: 0.3rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.liste-thm-lecture li {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.15rem 0.15rem;
}
/* Icône de repli d'un parent dans la consultation : `-masque` réserve la place
   (largeur égale) sur les feuilles pour que la pastille reste alignée. */
.depliant {
  width: 1.4rem;
  flex: none;
  border: none;
  background: none;
  color: #777;
  cursor: pointer;
  font-size: 0.9rem;
  padding: 0;
}
.depliant-masque {
  visibility: hidden;
}
.depliant:hover {
  color: #1565c0;
}
.liste-thm-lecture li.inactif {
  opacity: 0.3;
}
.pastille {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex: none;
  border: 1px solid rgba(0, 0, 0, 0.15);
}
.nom-thm-lecture {
  flex: 1;
  min-width: 0;
  font-size: 0.82rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.usage {
  font-size: 0.72rem;
  color: #888;
  font-family: monospace;
  min-width: 1.1rem;
  text-align: right;
}

/* Panneau « Pseudos » du corpus (lecture seule) */
.corpus-barre {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.sync-zone {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.sync-etat {
  font-size: 0.75rem;
  color: #607d8b;
}
.sync-erreur {
  font-size: 0.75rem;
  color: #b3261e;
  cursor: help;
}
.btn-table { margin-right: 0; }
/* L'overlay défile si l'écran est étroit : la modale n'est jamais clippée. */
.pseudo-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  overflow: auto;
  padding: 3vh 3vw;
}
.pseudo-panneau {
  background: #fff;
  border-radius: 8px;
  padding: 1rem 1.2rem;
  /* Bornes RELATIVES à la fenêtre : jamais de débordement inatteignable.
   * Les deux COLONNES défilent indépendamment (façon V1), pas le panneau :
   * l'en-tête et les actions restent en place. */
  width: min(1100px, 94vw);
  max-height: 90vh;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
}
/* Grille 2×2 : ligne 1 = en-tête sur toute la largeur ; ligne 2 = les deux
 * colonnes, chacune avec son propre défilement (minmax(0, 1fr) obligatoire
 * pour que le contenu long ne force pas la hauteur du panneau). */
.pseudo-deux-col {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: var(--pseudo-gauche-w, 42%) minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
}
.pseudo-vide { grid-column: 1 / -1; grid-row: 2; }
.pseudo-gauche {
  box-sizing: border-box;
  border-right: 1px solid #eee;
  padding-right: 1rem;
  min-height: 0;
  display: flex;
  flex-direction: column;
  /* Placement explicite : les deux colonnes sous l'en-tête (ligne 2),
   * sinon l'auto-placement de la grille les répartirait autrement. */
  grid-column: 1;
  grid-row: 2;
}
/* La table seule défile : recherche + compteur restent visibles. */
.pseudo-table-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.pseudo-droite {
  box-sizing: border-box;
  min-width: 0;
  padding-left: 1rem;
  min-height: 0;
  overflow-y: auto;
  grid-column: 2;
  grid-row: 2;
}
.pseudo-droite-vide {
  color: #999;
  font-size: 0.85rem;
  padding: 1rem 0;
}
.pseudo-detail-tete {
  font-size: 0.95rem;
  display: flex;
  gap: 0.6rem;
  align-items: baseline;
  border-bottom: 1px solid #eee;
  padding-bottom: 0.4rem;
}
.pseudo-detail-pseudos {
  color: #888;
  font-size: 0.8rem;
}
.pseudo-message {
  font-size: 0.82rem;
  color: #2e7d32;
  margin: 0.2rem 0 0;
}
/* Liste d'accordéons : elle coule dans la colonne droite (défilement porté
 * par .pseudo-droite), les actions restent collées en bas. */
.pseudo-ent-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.pseudo-ent {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid #eee;
  border-radius: 5px;
  padding: 0.3rem 0.5rem;
}
.pseudo-ent-titre {
  flex: 1;
  font-size: 0.82rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pseudo-ent-cpt {
  display: flex;
  gap: 0.3rem;
  font-size: 0.72rem;
}
/* Recherche d'entité dans la table des règles (parité V1). */
.pseudo-recherche {
  width: 100%;
  padding: 0.3rem 0.5rem;
  border: 1px solid #d0d0d8;
  border-radius: 6px;
  margin-bottom: 0.4rem;
  font-size: 0.82rem;
}
/* Compteur « N / M règle(s) » sous la recherche (parité V1). */
.pseudo-compteur {
  font-size: 0.75rem;
  color: #888;
  margin-bottom: 0.4rem;
  white-space: nowrap;
}
/* Pastille d'état d'une règle : ✓ tout traité / ! à traiter (fond V1). */
.pseudo-table .etat { text-align: center; }
.pastille {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.15rem;
  height: 1.15rem;
  border-radius: 50%;
  font-size: 0.72rem;
  font-weight: bold;
  color: #fff;
}
.pastille.ok { background: #558b2f; }
.pastille.todo { background: #f57c00; }
.sup-incl {
  color: #999;
  font-style: italic;
  margin-left: 1px;
  cursor: help;
}

/* Accordéons par entretien (parité V1) : fond vert = tout traité,
 * orange = à traiter ; badges ronds aux couleurs des états. */
.acc { border-bottom: 1px solid #eee; }
.acc-tete {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 0.5rem;
  cursor: pointer;
  user-select: none;
}
.acc-ok .acc-tete { background: #f1f8e9; }
.acc-todo .acc-tete { background: #fff3e0; }
.acc-titre {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.acc-ok .acc-titre { color: #558b2f; }
.acc-todo .acc-titre { color: #f57c00; }
.acc-badges {
  display: inline-flex;
  gap: 0.25rem;
  align-items: center;
  flex-shrink: 0;
}
.badge-rond {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.2rem;
  height: 1.2rem;
  border-radius: 50%;
  font-size: 0.68rem;
  font-weight: bold;
  color: #fff;
}
.badge-rond.ok { background: #15c095; }
.badge-rond.exc { background: #555; }
.badge-rond.todo { background: #ff9800; }
.badge-rond sup { font-size: 0.56rem; margin-left: 1px; }
.acc-fleche {
  font-size: 0.7rem;
  color: #666;
  transition: transform 0.2s;
  flex-shrink: 0;
}
.acc-fleche.ouvert { transform: rotate(180deg); }

/* Occurrences détaillées : forme ARBORESCENTE (décalage sous l'entretien,
 * parité V1), contexte avant/après gris, match en gras. Les états suivent
 * les modifications locales jusqu'à « Valider ». */
.occ-list {
  background: #fafafa;
  padding: 0.4rem 0.6rem;
  margin-left: 1.75rem; /* décalage arborescent : passages ⊂ entretien */
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.occ {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  font-size: 0.78rem;
}
.occ-texte { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.occ-texte b { font-weight: bold; }
.ctx { color: #999; }
.occ-incl .ctx, .occ-exc .ctx { color: #bbb; }
.occ-incl b, .occ-exc b { font-weight: normal; color: #888; }
.occ-pseudo { color: #1565c0; }
/* Exception (active ou demandée) : fond gris clair arrondi (parité V1). */
.occ.occ-exc { background: #f5f5f5; border-radius: 4px; }
/* Icône 🚫 à gauche : clic = RETIRER l'exception. */
.occ-exc-toggle {
  flex-shrink: 0;
  font-size: 0.85rem;
  line-height: 1;
  cursor: pointer;
}
/* Bouton 🚫 à droite : marque l'exception (visible si la case est cochée). */
.occ-exc-btn {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0 0.15rem;
  opacity: 0.45;
  flex-shrink: 0;
}
.occ-exc-btn:hover { opacity: 1; }
/* Note « (incluse) » d'une occurrence absorbée. */
.occ-note {
  color: #9e9e9e;
  font-style: italic;
  font-size: 0.72em;
}

.pseudo-cpt.anon { color: #15c095; font-weight: 600; }
.pseudo-cpt.exc { color: #555; }
.pseudo-cpt.non { color: #ff9800; font-weight: 600; }
.pseudo-cpt.incl { color: #999; font-style: italic; }
.pseudo-cpt.verrou { color: #555; font-weight: 600; }
.pseudo-ouvrir {
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0.1rem 0.35rem;
}
.pseudo-actions {
  display: flex;
  justify-content: flex-end;
  /* Collé en bas du drill-down : « Appliquer en masse » reste atteignable
   * quelle que soit la longueur de la liste d'entretiens. */
  position: sticky;
  bottom: 0;
  background: #fff;
  padding: 0.5rem 0 0.75rem;
  border-top: 1px solid #eee;
}
.pseudo-appliquer {
  border: 1px solid #1565c0;
  background: #2e73d8;
  color: #fff;
  border-radius: 5px;
  cursor: pointer;
  padding: 0.4rem 0.8rem;
  font-size: 0.82rem;
}
.loupe {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.9rem;
}
/* Sélecteur compact de thématique (colonne Actions, 4c). */
.cat-select {
  font-size: 0.72rem;
  border: 1px solid #ccc;
  border-radius: 999px;
  padding: 0.05rem 0.25rem;
  background: #fff;
  cursor: pointer;
}
.cell-actions { white-space: nowrap; }
/* Couleur des LIGNES de règles (parité V1) : vert = tout traité (anonymisé
 * ou exception), orange = il reste des occurrences à anonymiser. */
.pseudo-table tr.ok { background: #e8f5e9; }
.pseudo-table tr.todo { background: #fff3e0; }
.pseudo-table tr.sel {
  background: #eaf2ff;
}
.pseudo-tete {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
  /* En-tête sur toute la largeur, au-dessus des deux colonnes. */
  grid-column: 1 / -1;
  grid-row: 1;
}
.pseudo-tete h3 { margin: 0; font-size: 1.05rem; }
.pseudo-tete-actions { display: flex; align-items: center; gap: 0.4rem; }
.engrenage {
  border: none;
  background: none;
  font-size: 1.05rem;
  cursor: pointer;
}
.pseudo-params {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.82rem;
  border: 1px solid #eee;
  border-radius: 6px;
  background: #fafafa;
  padding: 0.6rem 0.8rem;
  margin-bottom: 0.75rem;
}
.pseudo-params label {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  cursor: pointer;
}
.pseudo-params-hint {
  margin: 0.15rem 0 0;
  color: #999;
  font-size: 0.75rem;
}
.pseudo-params-titre { margin-top: 0.35rem; }
.pseudo-params-liste {
  padding: 0.3rem 0.5rem;
  border: 1px solid #d0d0d8;
  border-radius: 6px;
  font-size: 0.82rem;
}
.pseudo-sous { color: #888; font-weight: normal; font-size: 0.85rem; }
.pseudo-tete .close { border: none; background: none; font-size: 1.1rem; cursor: pointer; }
.pseudo-vide { color: #666; font-size: 0.9rem; }
.pseudo-hint { color: #999; font-size: 0.78rem; margin-top: 0.4rem; }
.pseudo-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.pseudo-table th, .pseudo-table td {
  border: 1px solid #e0e0e0;
  padding: 0.3rem 0.6rem;
  text-align: left;
}
/* En-tête épinglé en haut du défilement de la table (parité V1 : th sticky). */
.pseudo-table th {
  background: #f3f6fa;
  position: sticky;
  top: 0;
  z-index: 1;
}
/* Entité : les groupes d'alias longs enroulent au lieu de comprimer les
 * compteurs ; Pseudo garde une largeur minimale lisible (parité V1). */
.pseudo-table .cell-entite { overflow-wrap: anywhere; }
.pseudo-table .cell-pseudo { min-width: 120px; }
.pseudo-table .num { text-align: right; font-variant-numeric: tabular-nums; }
/* Palette SonalPi V1 : vert = anonymisé, gris = exception, orange = à traiter
 * (mêmes couleurs que les badges ronds du panneau entretien). */
.pseudo-table .anon { color: #15c095; font-weight: 600; }
.pseudo-table .exc { color: #555; font-weight: 600; }
.pseudo-table .non { color: #ff9800; font-weight: 600; }
</style>
