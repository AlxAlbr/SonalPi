<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { utiliserSonal } from '../composables/sonal'
import { scannerRegleDetaille, type OccurrenceScan } from '../../shared/corpus/scanAnon'
import { bornerLargeurPanneau, cleOccurrence, construireDiff } from '../corpus/pseudonymisation'

const props = defineProps<{ actif: boolean }>()
const emit = defineEmits<{ ouvrirOccurrence: [id: string, pos: number] }>()
const {
  membership, reglesAnon, scanAnon, rafraichirScanAnon, perimerScanAnon,
  scanAnonCharge, scanAnonPerime, scanAnonEnCours, scanAnonErreur,
  paramsAnon, majParamsAnon, lectureSeule, badgeVerrou, vue,
} = utiliserSonal()
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

// État ÉDITABLE par occurrence : la case reflète l'ÉTAT,
// (cochée = anonymisée, décochée = à traiter), le 🚫 marque une exception ;
// les modifications restent LOCALES jusqu'à « Valider », clé « from:to ».
const cochees = ref<Record<string, Record<string, boolean>>>({})
const exceptions = ref<Record<string, Record<string, boolean>>>({})
const cleOcc = cleOccurrence
/** Initialise l'état éditable d'un entretien depuis son scan détaillé ;
 *  les incluses n'y figurent pas (non modifiables). */
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
/** État VISUEL d'une occurrence : suit les modifications locales,
 *  pas le dernier scan (couleurs, gras du match, affichage du pseudo). */
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
/** 🚫 droit : demande l'exception (la case se décoche). */
function demanderException(id: string, o: OccurrenceScan) {
  if (lectureSeule.value || badgeVerrou(id)) return
  ;(exceptions.value[id] ??= {})[cleOcc(o)] = true
  ;(cochees.value[id] ??= {})[cleOcc(o)] = false
}
/** 🚫 gauche : retire l'exception → l'occurrence redevient « à traiter ». */
function retirerException(id: string, o: OccurrenceScan) {
  if (lectureSeule.value || badgeVerrou(id)) return
  ;(exceptions.value[id] ??= {})[cleOcc(o)] = false
}
/** Case-tout de l'en-tête ;
 *  coché quand toutes les occurrences modifiables sont cochées, un clic
 *  coche/décoche tout (les exceptions restent posées). */
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
/** L'entretien est « tout traité » si aucune occurrence n'est à traiter,
 *  les incluses comptant comme traitées. */
function entToutTraite(anon: number, exc: number, incl: number, non: number): boolean {
  return anon + exc + incl > 0 && non === 0
}

// Paramètres de pseudonymisation propres au corpus.
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

// --- Filtre / recherche d'entité dans la table des règles ---
const filtreRegle = ref('')
const scanFiltre = computed(() => {
  const q = filtreRegle.value.trim().toLowerCase()
  if (!q) return scanAnon.value
  // Une catégorie saisie exactement agit comme filtre.
  // si la saisie correspond EXACTEMENT à un nom de catégorie active,
  // on bascule en filtre par catégorie.
  const exact = thematiquesListe.value.find((c) => c.toLowerCase() === q)
  if (exact) return scanAnon.value.filter((s) => s.regle.categorie === exact)
  return scanAnon.value.filter(
    (s) =>
      s.regle.entite.some((e) => e.toLowerCase().includes(q)) ||
      s.regle.pseudos.some((p) => p.toLowerCase().includes(q)),
  )
})
// Le séparateur conserve une largeur en pixels, bornée à l’espace disponible.
const RACCOURCI_LARGEUR = 'sonalpi.pseudonymisationCorpus.largeurGauche'
const panneau = ref<HTMLElement | null>(null)
const tableRegles = ref<HTMLTableElement | null>(null)
const largeurGauche = ref(420)
const dispositionVerticale = ref(false)
let redimensionnement = false
function largeurDisponible() { return panneau.value?.clientWidth ?? 0 }
function bornerLargeur() {
  const disponible = largeurDisponible()
  dispositionVerticale.value = disponible > 0 && disponible < 620
  if (!dispositionVerticale.value) largeurGauche.value = bornerLargeurPanneau(largeurGauche.value, disponible)
}
function restaurerLargeur() {
  const memorisee = Number(localStorage.getItem(RACCOURCI_LARGEUR))
  if (Number.isFinite(memorisee) && memorisee > 0) largeurGauche.value = memorisee
  bornerLargeur()
}
function commencerRedimensionnement(e: PointerEvent) {
  redimensionnement = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function redimensionner(e: PointerEvent) {
  if (!redimensionnement || !panneau.value) return
  largeurGauche.value = bornerLargeurPanneau(e.clientX - panneau.value.getBoundingClientRect().left, largeurDisponible())
}
function finirRedimensionnement() {
  if (!redimensionnement) return
  redimensionnement = false
  localStorage.setItem(RACCOURCI_LARGEUR, String(largeurGauche.value))
}
function ajusterSeparateurClavier(e: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return
  e.preventDefault()
  largeurGauche.value = bornerLargeurPanneau(largeurGauche.value + (e.key === 'ArrowLeft' ? -20 : 20), largeurDisponible())
  localStorage.setItem(RACCOURCI_LARGEUR, String(largeurGauche.value))
}
/** État global d'une règle : ✓ tout traité / orange à traiter ;
 *  les incluses comptent comme traitées. */
function etatRegle(s: { total: { anon: number; exc: number; incl: number; non: number } }): 'ok' | 'todo' {
  return s.total.non === 0 ? 'ok' : 'todo'
}
/** « Valider » : compare l'état éditable de chaque occurrence au dernier scan,
 *  et transmet le DIFF par entretien — poses (cases cochées), retraits
 *  (dé-pseudonymiser), exceptions posées/retirées. En distant, le lot passe
 *  par des transactions courtes par entretien ; un entretien verrouillé par
 *  autrui est refusé nommément, sans bloquer les autres. Scan et détails sont
 *  rechargés après coup (le diff peut retirer autant que poser). */
async function valider(): Promise<boolean> {
  const s = scanPourRegle.value
  if (!s) return true
  const diff = construireDiff(s.regle.id, details.value, cochees.value, exceptions.value)
  if (diff.cibles.length === 0) {
    messagePseudo.value = 'Aucun changement à valider.'
    return true
  }
  const etatAvant = {
    cochees: structuredClone(cochees.value),
    exceptions: structuredClone(exceptions.value),
  }
  const res = await window.sonal.corpus.appliquerRegleAnonLot(diff.cibles)
  const touches = res.succes.filter((x) => x.nb > 0)
  const parties: string[] = []
  if (touches.length > 0) {
    const detail: string[] = []
    if (diff.poses) detail.push(`✅ ${diff.poses} anonymisée(s)`)
    if (diff.retraits) detail.push(`↩️ ${diff.retraits} dé-pseudonymisée(s)`)
    if (diff.exceptionsAjoutees) detail.push(`🚫 ${diff.exceptionsAjoutees} exception(s) ajoutée(s)`)
    if (diff.exceptionsRetirees) detail.push(`🔓 ${diff.exceptionsRetirees} exception(s) retirée(s)`)
    parties.push(`✓ Changements enregistrés (${detail.join(', ')}) dans ${touches.length} entretien(s) : ` +
      touches.map((x) => membership.value[x.id]?.titre ?? x.id).join(', ') + '.')
  }
  for (const e of res.echecs) parties.push(`✗ ${membership.value[e.id]?.titre ?? e.id} : ${e.raison}`)
  messagePseudo.value = parties.join(' ') || 'Aucun changement effectué.'
  perimerScanAnon()
  await rafraichirScanAnon()
  const idsEnEchec = new Set(res.echecs.map((e) => e.id))
  for (const id of Object.keys(details.value)) {
    await chargerDetails(id)
    initEtatEnt(id)
    if (idsEnEchec.has(id)) {
      cochees.value[id] = etatAvant.cochees[id] ?? {}
      exceptions.value[id] = etatAvant.exceptions[id] ?? {}
    }
  }
  return !aDesChangements.value
}
const aDesChangements = computed(() => {
  const id = selectedRegleId.value
  return !!id && construireDiff(id, details.value, cochees.value, exceptions.value).cibles.length > 0
})
function abandonner() {
  const etats = etatsLocaux()
  cochees.value = etats.cochees
  exceptions.value = etats.exceptions
}
function etatsLocaux() {
  const c: Record<string, Record<string, boolean>> = {}
  const x: Record<string, Record<string, boolean>> = {}
  for (const id of Object.keys(details.value)) {
    c[id] = {}
    x[id] = {}
    for (const o of details.value[id]) {
      if (o.etat === 'incl') continue
      c[id][cleOcc(o)] = o.etat === 'anon'
      x[id][cleOcc(o)] = o.etat === 'exc'
    }
  }
  return { cochees: c, exceptions: x }
}
const gardeOuverte = ref(false)
let resoudreGarde: ((choix: 'valider' | 'abandonner' | 'rester') => void) | null = null
function demanderChoix(): Promise<'valider' | 'abandonner' | 'rester'> {
  gardeOuverte.value = true
  return new Promise((resolve) => { resoudreGarde = resolve })
}
function choisirGarde(choix: 'valider' | 'abandonner' | 'rester') {
  gardeOuverte.value = false
  resoudreGarde?.(choix)
  resoudreGarde = null
}
async function autoriserSortie(): Promise<boolean> {
  if (!aDesChangements.value) return true
  const choix = await demanderChoix()
  if (choix === 'rester') return false
  if (choix === 'abandonner') {
    abandonner()
    return true
  }
  return valider()
}
defineExpose({ autoriserSortie })

const tableWrap = ref<HTMLElement | null>(null)
const detailWrap = ref<HTMLElement | null>(null)
let contexteRetour: { regleId: string | null; entretienId: string | null; tableScroll: number; detailScroll: number } | null = null
async function ouvrirOccurrence(id: string, pos: number) {
  if (!(await autoriserSortie())) return
  contexteRetour = {
    regleId: selectedRegleId.value,
    entretienId: deplie.value,
    tableScroll: tableWrap.value?.scrollTop ?? 0,
    detailScroll: detailWrap.value?.scrollTop ?? 0,
  }
  emit('ouvrirOccurrence', id, pos)
}
async function restaurerContexte() {
  if (!contexteRetour) return
  if (scanAnonPerime.value) await charger(true)
  const contexte = contexteRetour
  selectedRegleId.value = scanAnon.value.some((s) => s.regle.id === contexte.regleId) ? contexte.regleId : null
  if (selectedRegleId.value && contexte.entretienId && scanPourRegle.value?.parEntretien[contexte.entretienId]) {
    deplie.value = contexte.entretienId
    await chargerDetails(contexte.entretienId)
    initEtatEnt(contexte.entretienId)
  } else deplie.value = null
  await nextTick()
  if (tableWrap.value) tableWrap.value.scrollTop = contexte.tableScroll
  if (detailWrap.value) detailWrap.value.scrollTop = contexte.detailScroll
  contexteRetour = null
}
async function charger(force = false) {
  const ok = await rafraichirScanAnon(force)
  if (ok && selectedRegleId.value && !scanAnon.value.some((s) => s.regle.id === selectedRegleId.value)) selectionnerRegle(selectedRegleId.value)
  await nextTick()
  if (!localStorage.getItem(RACCOURCI_LARGEUR) && tableRegles.value) {
    largeurGauche.value = tableRegles.value.scrollWidth + 16
  }
  bornerLargeur()
}
watch(() => props.actif, async (actif) => {
  if (actif) {
    await charger(false)
    await restaurerContexte()
  }
}, { immediate: true })
watch(vue, (v, avant) => {
  if (v === 'corpus' && avant === 'entretien' && props.actif) void restaurerContexte()
})
function surResize() { bornerLargeur() }
onMounted(() => {
  restaurerLargeur()
  window.addEventListener('resize', surResize)
})
onUnmounted(() => window.removeEventListener('resize', surResize))
</script>

<template>
      <section ref="panneau" class="pseudo-panneau pseudo-deux-col" :class="{ vertical: dispositionVerticale }" :style="{ '--pseudo-gauche-w': largeurGauche + 'px' }">
        <div class="pseudo-haut">
          <header class="pseudo-tete">
            <h3>Pseudonymisation <span class="pseudo-sous">— règles d'anonymisation du corpus</span></h3>
            <div class="pseudo-tete-actions">
              <button class="actualiser-pseudo" :disabled="scanAnonEnCours" @click="charger(true)">{{ scanAnonEnCours ? 'Actualisation…' : '⟳ Actualiser' }}</button>
              <button class="engrenage" title="Paramètres de pseudonymisation" @click="parametresOuverts = !parametresOuverts">⚙</button>
            </div>
          </header>

          <!-- Paramètres partagés par la pseudonymisation des entretiens. -->
          <div v-if="parametresOuverts" class="pseudo-params">
            <b>Priorité de validation</b>
            <div class="pseudo-params-bloc">
              <label><input v-model="prioriteLocale" type="radio" value="corpus" /> Corpus — Entrée crée la règle partagée, Maj+Entrée reste sur l'entretien</label>
              <label><input v-model="prioriteLocale" type="radio" value="entretien" /> Entretien — Entrée pose dans l'entretien courant, Maj+Entrée pousse au corpus</label>
              <p class="pseudo-params-hint">
                Décide quelle portée la touche Entrée applique sur une ligne du tableau anon d'un entretien.
              </p>
            </div>
            <b class="pseudo-params-titre">Mots de liaison et articles</b>
            <div class="pseudo-params-bloc">
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
            </div>
            <b class="pseudo-params-titre">Thématiques d'entités</b>
            <div class="pseudo-params-bloc">
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
          </div>
          <p v-if="scanAnonErreur" class="pseudo-erreur">{{ scanAnonErreur }} Le dernier résultat reste affiché.</p>
        </div>
          <div v-if="scanAnonEnCours && !scanAnonCharge" class="pseudo-vide">Analyse du corpus…</div>
          <div v-else-if="reglesAnon.length === 0" class="pseudo-vide">
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
              <!-- Compteur de règles affichées / total (barre de filtrage). -->
              <div class="pseudo-compteur">
                {{ scanFiltre.length }}<template v-if="scanFiltre.length !== scanAnon.length"> / {{ scanAnon.length }}</template>
                règle(s)
              </div>
              <!-- La table défile SEULE : recherche et compteur restent visibles,
                   l'en-tête des colonnes est épinglé en haut du défilement. -->
              <div ref="tableWrap" class="pseudo-table-wrap">
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
            <div v-if="!dispositionVerticale" class="pseudo-separateur" role="separator" aria-label="Largeur de la table" aria-orientation="vertical" tabindex="0" :aria-valuenow="largeurGauche" @pointerdown="commencerRedimensionnement" @pointermove="redimensionner" @pointerup="finirRedimensionnement" @pointercancel="finirRedimensionnement" @keydown="ajusterSeparateurClavier"></div>

            <!-- Partie DROITE : drill-down d'une règle (entretiens + masque). -->
            <div ref="detailWrap" class="pseudo-droite">
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
                    <!-- En-tête d'accordéon : coche-tout, titre, badges, flèche -->
                    <div class="acc-tete" @click="basculerDepli(e.id)">
                      <input
                        type="checkbox"
                        :checked="entToutCoche(e.id)"
                        :disabled="lectureSeule || !!badgeVerrou(e.id)"
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

                    <!-- Contenu déplié : forme ARBORESCENTE,
                         les passages sont décalés sous l'entretien qui les porte ;
                         chaque ligne porte une case d'ÉTAT + le 🚫 d'exception. -->
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
                          :class="{ verrouille: lectureSeule || !!badgeVerrou(e.id) }"
                          :title="lectureSeule || badgeVerrou(e.id) ? 'Modification impossible actuellement' : 'Retirer l’exception — redevient à traiter'"
                          @click.stop="retirerException(e.id, o)"
                        >🚫</span>
                        <!-- Sinon la case d'ÉTAT : cochée = anonymisée, décochée = à traiter. -->
                        <input
                          v-else
                          type="checkbox"
                          :checked="estCochee(e.id, o)"
                          :disabled="lectureSeule || !!badgeVerrou(e.id)"
                          title="Cochée = anonymiser cette occurrence"
                          @click.stop
                          @change="basculerCoche(e.id, o)"
                        />
                        <span class="occ-texte">
                          <span class="ctx">{{ o.avant }}</span><b>{{ o.match }}</b><span v-if="etatOcc(e.id, o) === 'anon'" class="occ-pseudo">[{{ scanPourRegle.regle.pseudos[0] }}]</span><span v-if="o.etat === 'incl'" class="occ-note">(incluse)</span><span class="ctx">{{ o.apres }}</span>
                        </span>
                        <!-- 🚫 droit : disponible seulement si la case est cochée. -->
                        <button
                          v-if="o.etat !== 'incl' && estCochee(e.id, o)"
                          class="occ-exc-btn"
                          :disabled="lectureSeule || !!badgeVerrou(e.id)"
                          title="Marquer comme exception (ne pas anonymiser)"
                          @click.stop="demanderException(e.id, o)"
                        >🚫</button>
                        <button class="pseudo-ouvrir" title="Ouvrir cet entretien à cette occurrence" @click.stop="ouvrirOccurrence(e.id, o.from)">↗</button>
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
      </section>
      <div v-if="gardeOuverte" class="garde-fond" role="dialog" aria-modal="true" aria-labelledby="garde-anon-titre">
        <div class="garde-dialogue">
          <h3 id="garde-anon-titre">Changements non validés</h3>
          <p>Validez ou abandonnez les changements avant de quitter la pseudonymisation.</p>
          <div class="garde-actions">
            <button class="pseudo-appliquer" @click="choisirGarde('valider')">Valider</button>
            <button @click="choisirGarde('abandonner')">Abandonner</button>
            <button @click="choisirGarde('rester')">Rester</button>
          </div>
        </div>
      </div>
</template>

<style scoped>
.pseudo-panneau {
  background: #fff;
  border-radius: 8px;
  padding: 1rem 1.2rem;
  /* Bornes RELATIVES à la fenêtre : jamais de débordement inatteignable.
   * Les deux COLONNES défilent indépendamment, pas le panneau :
   * l'en-tête et les actions restent en place. */
  width: 100%;
  height: min(72vh, 760px);
  border: 1px solid #e0e0ea;
}
/* Grille 2×2 : ligne 1 = en-tête sur toute la largeur ; ligne 2 = les deux
 * colonnes, chacune avec son propre défilement (minmax(0, 1fr) obligatoire
 * pour que le contenu long ne force pas la hauteur du panneau). */
.pseudo-deux-col {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: var(--pseudo-gauche-w, 420px) 8px minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
}
.pseudo-haut { grid-column: 1 / -1; grid-row: 1; }
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
  grid-column: 3;
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
/* Recherche d'entité dans la table des règles. */
.pseudo-recherche {
  width: 100%;
  padding: 0.3rem 0.5rem;
  border: 1px solid #d0d0d8;
  border-radius: 6px;
  margin-bottom: 0.4rem;
  font-size: 0.82rem;
}
/* Compteur « N / M règle(s) » sous la recherche. */
.pseudo-compteur {
  font-size: 0.75rem;
  color: #888;
  margin-bottom: 0.4rem;
  white-space: nowrap;
}
/* Pastille d'état d'une règle : ✓ tout traité / ! à traiter. */
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

/* Accordéons par entretien : fond vert = tout traité, orange = à traiter ;
 * badges ronds aux couleurs des états. */
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

/* Occurrences détaillées : forme ARBORESCENTE (décalage sous l'entretien),
 * contexte avant/après gris, match en gras. Les états suivent les
 * modifications locales jusqu'à « Valider ». */
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
/* Exception (active ou demandée) : fond gris clair arrondi. */
.occ.occ-exc { background: #f5f5f5; border-radius: 4px; }
/* Icône 🚫 à gauche : clic = RETIRER l'exception. */
.occ-exc-toggle {
  flex-shrink: 0;
  font-size: 0.85rem;
  line-height: 1;
  cursor: pointer;
}
.occ-exc-toggle.verrouille { cursor: not-allowed; opacity: .45; }
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
/* Sélecteur compact de thématique dans la colonne des actions. */
.cat-select {
  font-size: 0.72rem;
  border: 1px solid #ccc;
  border-radius: 999px;
  padding: 0.05rem 0.25rem;
  background: #fff;
  cursor: pointer;
}
.cell-actions { white-space: nowrap; }
/* Couleur des LIGNES de règles : vert = tout traité (anonymisé ou exception),
 * orange = il reste des occurrences à anonymiser. */
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
.pseudo-params-bloc {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding-left: 0.9rem; /* retrait du contenu sous son titre */
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
.pseudo-vide { color: #666; font-size: 0.9rem; }
.pseudo-hint { color: #999; font-size: 0.78rem; margin-top: 0.4rem; }
.pseudo-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.pseudo-table th, .pseudo-table td {
  border: 1px solid #e0e0e0;
  padding: 0.3rem 0.6rem;
  text-align: left;
}
/* En-tête épinglé en haut du défilement de la table (th sticky). */
.pseudo-table th {
  background: #f3f6fa;
  position: sticky;
  top: 0;
  z-index: 1;
}
/* Entité : les groupes d'alias longs enroulent au lieu de comprimer les
 * compteurs ; Pseudo garde une largeur minimale lisible. */
.pseudo-table .cell-entite { overflow-wrap: anywhere; }
.pseudo-table .cell-pseudo { min-width: 120px; }
.pseudo-table .num { text-align: right; font-variant-numeric: tabular-nums; }
/* Palette : vert = anonymisé, gris = exception, orange = à traiter (mêmes
 * couleurs que les badges ronds du panneau entretien). */
.pseudo-table .anon { color: #15c095; font-weight: 600; }
.pseudo-table .exc { color: #555; font-weight: 600; }
.pseudo-table .non { color: #ff9800; font-weight: 600; }
.pseudo-separateur { grid-column: 2; grid-row: 2; cursor: col-resize; background: #e8edf5; border-radius: 5px; touch-action: none; }
.pseudo-separateur:focus { outline: 2px solid #1565c0; }
.pseudo-deux-col.vertical { display: flex; flex-direction: column; height: auto; min-height: 620px; }
.vertical .pseudo-gauche, .vertical .pseudo-droite { width: 100%; min-height: 280px; padding: .5rem 0; border: 0; }
.actualiser-pseudo { border: 1px solid #bbb; border-radius: 5px; background: #fff; padding: .3rem .55rem; cursor: pointer; }
.pseudo-erreur { color: #b3261e; font-size: .82rem; }
.garde-fond { position: fixed; inset: 0; z-index: 200; display: grid; place-items: center; background: rgba(0,0,0,.35); }
.garde-dialogue { width: min(440px, 90vw); background: white; border-radius: 8px; padding: 1rem; box-shadow: 0 8px 30px rgba(0,0,0,.3); }
.garde-dialogue h3 { margin-top: 0; }
.garde-actions { display: flex; justify-content: flex-end; gap: .5rem; }
.garde-actions button { border: 1px solid #bbb; border-radius: 5px; padding: .4rem .7rem; cursor: pointer; }

</style>
