<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, onUnmounted, ref, watch } from 'vue'
import { utiliserSonal } from '../../../composables/sonal'
import { operationGlobaleEnCours } from '../../../operationGlobaleCorpus'

const props = defineProps<{
  actif: boolean
  lectureSeuleContenu: boolean
}>()
const ajoutSelectionActif = defineModel<boolean>('ajoutSelectionActif', { required: true })

const {
  selectionAnon,
  hintAnon,
  lignesAnon,
  hitsAAnonymiserParCle,
  inclusesParCle,
  rafraichirCompteursAAAnonymiser,
  reperageAnon,
  demarrerReperage,
  naviguerReperage,
  arreterReperage,
  validerAnon,
  creerBrouillon,
  majBrouillonLigne,
  supprimerLigneAnon,
  changerPorteeAnon,
  validerAvecPriorite,
  categorieDeLigne,
  categoriserLigne,
  thematiquesActives,
  dialoguePorteeCorpus,
  confirmationCouverture,
  accepterCouverture,
  refuserCouverture,
  alignerCorpus,
  garderLesDeuxCorpus,
  annulerDialogueCorpus,
  suggestionLiaison,
  accepterSuggestionLiaison,
  refuserSuggestionLiaison,
  entiteExisteDeja,
  editor,
  lectureSeule,
  gesteDisponible,
} = utiliserSonal()

// --- ANON : lignes de saisie (en bas du tableau) ---
// Compteur « à anonymiser » d'une ligne : longueur de la requête (hits PM),
// recalculée par le composable à l'ouverture de l'onglet, au ⟳ et après chaque geste anon.
// 0 ou ligne absente → compteur masqué.
function nbAAAnonymiser(cle: string): number {
  return hitsAAnonymiserParCle.value[cle]?.length ?? 0
}
// Tooltip de l'exposant d'incluses : « plus N absorbée(s)… », jamais « dont »,
// avec les entités absorbantes distinctes.
function tooltipIncluses(cle: string): string {
  const n = lignesAnon.value.find((l) => l.cle === cle)?.nbIncluse ?? 0
  const pars = inclusesParCle.value[cle] ?? []
  const qui = pars.length ? ` par « ${pars.join('», « ')}»` : ''
  return `plus ${n} absorbée(s)${qui} (non comptée(s) ici)`
}
// Plusieurs lignes vides : on saisit un nom, « passe à la ligne suivante » (Entrée) ;
// le brouillon est persisté, et une nouvelle ligne vide s'ajoute si besoin.
// Un bouton « + » sous le tableau ajoute des lignes.
const lignesSaisie = ref<{ id: number; entite: string; pseudo: string }[]>([])
let seqSaisie = 0
const nouvelleLigneSaisie = () => ({ id: ++seqSaisie, entite: '', pseudo: '' })
lignesSaisie.value = [nouvelleLigneSaisie(), nouvelleLigneSaisie()]
// Refs par ligne (cases Nom/Pseudo) pour piloter le focus, en <textarea> multi-lignes depuis que les champs enveloppent le texte.
const refsNom = ref<Record<number, HTMLTextAreaElement | null>>({})
const refsPseudo = ref<Record<number, HTMLTextAreaElement | null>>({})
const refNom = (id: number) => (el: unknown) => {
  refsNom.value[id] = (el as HTMLTextAreaElement) ?? null
}
const refPseudo = (id: number) => (el: unknown) => {
  refsPseudo.value[id] = (el as HTMLTextAreaElement) ?? null
}
const focusNom = (id: number) => nextTick(() => refsNom.value[id]?.focus())
const focusPseudo = (id: number) => nextTick(() => refsPseudo.value[id]?.focus())

/** Nom d'entité à l'écran : texte complet tant qu'il tient dans les 5 lignes de la colonne Nom,
 *  mesuré par un probe clone ATTACHÉ au DOM (même largeur/police que la colonne,
 *  robuste au zoom/DPI) ; sinon, raccourci « début…fin ». L'affichage est stocké
 *  DANS LE MODÈLE (affichagesNoms), pas muté sur le DOM : Vue reste propriétaire
 *  du texte interpolé. */
let largeurColonneAnon = 0
/** Mesure la hauteur réelle d'un texte enveloppé dans la colonne Nom (5 lignes max en CSS) ;
 *  ici sans clamp pour connaître le besoin naturel avant raccourci. */
function mesurerNomAnon(plein: string) {
  const probe = document.createElement('span')
  probe.className = 'nom-anon'
  const s = probe.style
  s.visibility = 'hidden'
  s.position = 'absolute'
  s.left = '-9999px'
  s.top = '0'
  s.display = 'block' /* empêche le -webkit-box du clamp dans la mesure */
  if (!largeurColonneAnon) {
    const ref = document.querySelector<HTMLElement>('.tableau-anon .nom-anon')
    largeurColonneAnon = ref ? parseFloat(getComputedStyle(ref).width) : 149
  }
  s.width = largeurColonneAnon + 'px' // même largeur de colonne que le vrai span
  s.webkitLineClamp = 'unset'
  s.maxHeight = 'none'
  s.overflow = 'visible'
  probe.textContent = plein
  document.body.appendChild(probe) // DOIT être dans le DOM pour mesurer le wrap
  const h = probe.getBoundingClientRect().height
  const lh = parseFloat(getComputedStyle(probe).lineHeight) || 16.4
  probe.remove()
  return { h, lh, lignes: h / lh }
}
/** Raccourci « début…fin » d'un nom trop large : on garde des MOTS ENTIERS du début et de la fin,
 *  jamais de coupe en plein mot ; joints par « … », on réduit mot à mot tant que
 *  ça ne tient pas dans les 5 lignes. */
function raccourciMots(plein: string, hMax: number) {
  const { h, lh } = mesurerNomAnon(plein)
  const lignes = h / lh
  const budget = Math.max(6, Math.floor((plein.length / lignes) * 5) - 4) // chars tenables en 5 lignes
  const mots = plein.split(/\s+/)
  const demi = Math.floor(budget / 2)
  const debut: string[] = []
  const fin: string[] = []
  let lenD = 0
  let lenF = 0
  let i = 0
  let j = mots.length - 1
  // Mots du début (dans l'ordre) tant qu'ils tiennent dans la moitié du budget.
  while (i <= j && lenD + mots[i].length + (debut.length ? 1 : 0) <= demi) {
    lenD += mots[i].length + (debut.length ? 1 : 0)
    debut.push(mots[i++])
  }
  // Mots de la fin (en partant du dernier) tant qu'ils tiennent dans l'autre moitié.
  while (i <= j && lenF + mots[j].length + (fin.length ? 1 : 0) <= demi) {
    lenF += mots[j].length + (fin.length ? 1 : 0)
    fin.unshift(mots[j--])
  }
  // Un seul mot plus large que 5 lignes : impossible de couper un mot ; on laisse le clamp CSS tronquer avec « … » en fin de 5e ligne.
  if (!debut.length && !fin.length) return plein
  const compose = () =>
    (debut.length ? debut.join(' ') : '') + (debut.length && fin.length ? ' … ' : '') + fin.join(' ')
  let affiche = compose()
  // Garde-fou : réduit mot à mot (du côté le plus long) tant que le raccourci dépasse encore les 5 lignes mesurées.
  let it = 0
  while (it++ < 30 && mesurerNomAnon(affiche).h > hMax) {
    if (debut.length > fin.length) {
      lenD -= debut.pop()!.length + 1
    } else if (fin.length) {
      lenF -= fin.shift()!.length + 1
    } else break
    affiche = compose()
  }
  return affiche.length >= plein.length ? plein : affiche
}
const affichagesNoms = ref<Record<string, string>>({})
function majNomsAnon() {
  if (!lignesAnon.value.length) return
  const suiv = { ...affichagesNoms.value }
  for (const l of lignesAnon.value) {
    const plein = l.entite
    if (!plein.length) {
      suiv[l.cle] = plein
      continue
    }
    const { lh } = mesurerNomAnon(plein)
    const hMax = lh * 5 /* 5 lignes max */
    suiv[l.cle] = mesurerNomAnon(plein).h > hMax ? raccourciMots(plein, hMax) : plein
  }
  affichagesNoms.value = suiv
}
watch(lignesAnon, majNomsAnon, { deep: true })
onMounted(() => {
  majNomsAnon()
  window.addEventListener('resize', majNomsAnon)
})
onUnmounted(() => window.removeEventListener('resize', majNomsAnon))

/** Valide UNE ligne : pose les occurrences (validerAnon) et vide la ligne.
 *  `majuscule` choisit la priorité de portée ; le bouton ✓ valide directement
 *  au niveau entretien. */
function validerLigne(l: { id: number; entite: string; pseudo: string }, majuscule?: boolean) {
  const e = l.entite.trim()
  const p = l.pseudo.trim()
  if (!e) {
    hintAnon.value = "Saisis ou sélectionne d'abord un nom dans le texte."
    return
  }
  if (!p) {
    hintAnon.value = 'Saisis un pseudo pour cette entité.'
    return
  }
  if (entiteExisteDeja(e)) {
    hintAnon.value = `« ${e} » est déjà dans le tableau.`
    scrollerVersLigne(e)
    return
  }
  hintAnon.value = null
  if (majuscule === undefined) {
    // Bouton ✓ : valide directement au niveau entretien.
    validerAnon(e, p)
    l.entite = ''
    l.pseudo = ''
    return
  }
  // Entrée et Maj+Entrée appliquent la portée correspondant à la priorité choisie.
  creerBrouillon(e, p)
  l.entite = ''
  l.pseudo = ''
  void validerAvecPriorite(e, majuscule)
}
/** Entrée sur le Nom (sans pseudo) → brouillon « entité seule » (draft inerte en attendant un pseudo),
 *  puis passage à la ligne suivante (créée au besoin). */
function brouillonDepuisLigne(l: { id: number; entite: string; pseudo: string }) {
  const e = l.entite.trim()
  if (!e) return
  if (entiteExisteDeja(e)) {
    hintAnon.value = `« ${e} » est déjà dans le tableau.`
    scrollerVersLigne(e)
    return
  }
  hintAnon.value = null
  creerBrouillon(e, l.pseudo.trim())
  l.entite = ''
  l.pseudo = ''
  const suivant = lignesSaisie.value.find((x) => x.id > l.id)
  if (suivant) focusNom(suivant.id)
  else {
    const n = nouvelleLigneSaisie()
    lignesSaisie.value.push(n)
    focusNom(n.id)
  }
}
/** Le focus quitte une ligne entièrement → auto-brouillon si un Nom est saisi ;
 *  le passage vers une autre ligne de saisie compte comme une sortie. */
function onBlurLigne(id: number, evt: FocusEvent) {
  const cible = evt.relatedTarget as Node | null
  if (cible && (evt.currentTarget as HTMLElement).contains(cible)) return
  const l = lignesSaisie.value.find((x) => x.id === id)
  if (!l) return
  const e = l.entite.trim()
  if (e && !entiteExisteDeja(e)) creerBrouillon(e, l.pseudo.trim())
  l.entite = ''
  l.pseudo = ''
  hintAnon.value = null
}
/** Pseudo d'une ligne existante édité → relabel (entretien) ou maj brouillon.
 *  Une ligne CORPUS a son pseudo dérivé de la règle : l'édition du champ est
 *  sans effet (la bascule se fait par occurrence via le menu contextuel). */
function surPseudoLigne(entite: string, etat: 'brouillon' | 'entretien' | 'corpus', value: string) {
  if (etat === 'brouillon') majBrouillonLigne(entite, value)
  else if (etat === 'entretien') validerAnon(entite, value)
}
/** Entrée sur le Pseudo d'une ligne existante : brouillon → valider selon la priorité ;
 *  Entrée choisit la portée prioritaire et Maj+Entrée choisit l'autre.
 *  Une ligne d'entretien est renommée à la perte de focus ; une ligne corpus reste inchangée. */
function surEntreePseudoLigne(
  entite: string,
  etat: 'brouillon' | 'entretien' | 'corpus',
  value: string,
  majuscule: boolean,
) {
  if (etat === 'brouillon') {
    // Synchroniser le brouillon avec la saisie avant de router (le changement de portée lit le pseudo du brouillon, pas le champ).
    const v = value.trim()
    if (v) majBrouillonLigne(entite, v)
    void validerAvecPriorite(entite, majuscule)
  } else (document.activeElement as HTMLElement | null)?.blur()
}
function scrollerVersLigne(entite: string) {
  const cle = entite.trim().toLowerCase()
  nextTick(() => {
    const el = document.querySelector(`[data-cle-anon="${CSS.escape(cle)}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}
// La sélection dans l'éditeur peuple le Nom de la PREMIÈRE ligne de saisie vide (ou en crée une).
// Les lignes déjà remplies sont d'abord persistées en brouillon :
// c'est l'auto-brouillon, on peut enchaîner plusieurs entités.
function alimenterDepuisSelection() {
  const sel = selectionAnon.value
  if (!sel) return
  const texte = sel.texte.trim()
  if (!texte) return
  const deja = lignesSaisie.value.some((l) => l.entite.trim().toLowerCase() === texte.toLowerCase())
  if (deja) return
  for (const l of lignesSaisie.value) {
    if (l.entite.trim() && !entiteExisteDeja(l.entite)) creerBrouillon(l.entite.trim(), l.pseudo.trim())
  }
  if (entiteExisteDeja(texte)) {
    hintAnon.value = `« ${texte} » est déjà dans le tableau.`
    scrollerVersLigne(texte)
    return
  }
  let ligne = lignesSaisie.value.find((l) => !l.entite.trim())
  if (!ligne) {
    ligne = nouvelleLigneSaisie()
    lignesSaisie.value.push(ligne)
  }
  ligne.entite = texte
  ligne.pseudo = ''
  hintAnon.value = null
  focusPseudo(ligne.id)
}

// Le tableau Anon se remplit au RELÂCHEMENT du clic (`mouseup`), jamais pendant le drag :
// une entité multi-mots (« New York ») n'arrive qu'une fois la souris relâchée.
// ProseMirror propage la sélection DOM de façon ASYNCHRONE (`selectionchange`) :
// plutôt que deviner un délai fixe, on surveille `selectionAnon`, en attendant deux lectures consécutives égales après le relâchement.
// On lit donc la sélection FINALE, jamais un état intermédiaire.
// Et seulement si l'onglet Anon est ouvert ; ailleurs, la sélection reste neutre.
const RELACHE_STEP = 16 // ms — cadence de surveillance (un frame)
const RELACHE_STABILITE = 2 // lectures consécutives égales → sélection figée
const RELACHE_CAP = 250 // ms — marge pire cas (alors on remplit quand même)
let tidRelache = 0
function surRelache() {
  if (!props.actif || !ajoutSelectionActif.value) return
  clearTimeout(tidRelache)
  const signature = (s: typeof selectionAnon.value) =>
    s ? `${s.from}|${s.to}|${s.texte}` : ''
  let precedente = signature(selectionAnon.value)
  let stables = 0
  const depart = Date.now()
  const surveiller = () => {
    if (!props.actif || !ajoutSelectionActif.value) return
    const courante = signature(selectionAnon.value)
    if (courante === precedente) stables++
    else {
      precedente = courante
      stables = 0
    }
    if (stables >= RELACHE_STABILITE || Date.now() - depart >= RELACHE_CAP) {
      alimenterDepuisSelection()
      return
    }
    tidRelache = window.setTimeout(surveiller, RELACHE_STEP)
  }
  surveiller()
}
// Écouteurs posés sur le DOM de l'éditeur, retirés au démontage.
// Les deux rendus audio/vidéo passent par le même viewer : un seul attach suffit.
let domEditeur: HTMLElement | null = null
function attacherEcouteurs(ed: typeof editor.value) {
  if (domEditeur) {
    domEditeur.removeEventListener('mouseup', surRelache)
    domEditeur.removeEventListener('keyup', surRelache)
  }
  domEditeur = ed?.view.dom ?? null
  if (domEditeur) {
    domEditeur.addEventListener('mouseup', surRelache)
    // Sélection au clavier (Maj+flèches) : peuplée à la levée de la touche.
    domEditeur.addEventListener('keyup', surRelache)
  }
}
watch(editor, attacherEcouteurs, { immediate: true })
onBeforeUnmount(() => {
  clearTimeout(tidRelache)
  if (domEditeur) {
    domEditeur.removeEventListener('mouseup', surRelache)
    domEditeur.removeEventListener('keyup', surRelache)
  }
})
</script>

<template>
<!-- Anon : pseudonymisation du texte, une ligne par entité (brouillon sans occurrence ou occurrences posées) ;
     la sélection peuple la ligne de saisie.
     Entrée sur le Pseudo pose les occurrences (barré + [pseudo], cf. editeur.css). -->
<aside class="panneau anon">
  <div class="corpus-tete">
    <h3>Pseudonymisation du texte</h3>
    <div class="tete-actions">
      <button
        type="button"
        class="mini"
        title="Recalculer les compteurs (à anonymiser)"
        @click="rafraichirCompteursAAAnonymiser()"
      >⟳</button>
      <button
        type="button"
        class="mini"
        title="Ajouter une ligne de saisie"
        v-if="!lectureSeuleContenu"
        @click="lignesSaisie.push(nouvelleLigneSaisie())"
      >+ Ligne</button>
    </div>
  </div>
  <p class="aide-thm">
    Sélectionne un mot dans le texte ou saisis un nom ci-dessous, complète le pseudo puis Entrée : toutes les occurrences sont barrées et le pseudo s'affiche.
    Plusieurs graphies d'un même nom : sépare-les par « / » (ex. Lyon/Lyons). Multi-pseudo : « Claire / Rebecca » dans Pseudo, puis clic droit sur une occurrence pour basculer.
  </p>
  <label class="selection-option" title="Ajouter automatiquement le texte sélectionné">
    <span class="selection-option-texte">
      <span class="selection-option-titre">Ajouter le texte sélectionné</span>
    </span>
    <span class="selection-option-commande">
      <input v-model="ajoutSelectionActif" type="checkbox" role="switch" aria-label="Ajouter automatiquement le texte sélectionné" />
      <span class="selection-option-etat" aria-hidden="true">{{ ajoutSelectionActif ? 'Activé' : 'Désactivé' }}</span>
    </span>
  </label>
  <p v-if="hintAnon" class="hint-codage">{{ hintAnon }}</p>

  <table class="tableau-anon">
    <thead>
      <tr>
        <th class="col-entite">Mot ou sélection</th>
        <th class="col-pseudo">Pseudo</th>
        <th class="col-actions">État · Occ.</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="l in lignesAnon"
        :key="l.cle"
        :data-cle-anon="l.cle"
        class="ligne-anon"
        :class="`etat-${l.etat}`"
      >
        <td class="col-entite">
          <span class="nom-anon" :title="l.entite">{{ affichagesNoms[l.cle] ?? l.entite }}</span>
        </td>
        <td class="col-pseudo">
          <textarea
            class="pseudo-anon"
            rows="1"
            :title="l.pseudo"
            :value="l.pseudo"
            :placeholder="l.etat === 'brouillon' ? 'pseudo…' : ''"
            :disabled="lectureSeuleContenu"
            @keydown.enter.prevent="surEntreePseudoLigne(l.entite, l.etat, ($event.target as HTMLTextAreaElement).value, $event.shiftKey)"
            @change="surPseudoLigne(l.entite, l.etat, ($event.target as HTMLTextAreaElement).value)"
          ></textarea>
        </td>
        <td class="col-actions">
          <div class="actions-empile">
            <div class="portee-slider" :class="`portee-${l.etat}`" :title="l.etat === 'brouillon' ? 'Brouillon — draft local' : l.etat === 'entretien' ? 'Entretien — occurrences posées' : 'Corpus — règle partagée'">
              <button
                type="button"
                class="portee-cran"
                :class="{ actif: l.etat === 'brouillon' }"
                :disabled="lectureSeuleContenu || l.etat === 'brouillon' || (l.etat === 'corpus' && (lectureSeule || !gesteDisponible('dissociationGlobale'))) || operationGlobaleEnCours"
                :title="l.etat === 'corpus' ? !gesteDisponible('dissociationGlobale') ? 'Retour en chantier non disponible pour ce fournisseur' : 'Remettre cette règle en chantier dans cet entretien' : 'Brouillon — pas encore appliqué'"
                @click="changerPorteeAnon(l.entite, 'brouillon')"
              >🚧</button>
              <button
                type="button"
                class="portee-cran"
                :class="{ actif: l.etat === 'entretien' }"
                :disabled="lectureSeuleContenu || l.etat === 'entretien' || (l.etat === 'corpus' && (lectureSeule || !gesteDisponible('dissociationGlobale'))) || operationGlobaleEnCours"
                :title="l.etat === 'corpus' ? !gesteDisponible('dissociationGlobale') ? 'Passage à l’entretien non disponible pour ce fournisseur' : 'Conserver cette règle seulement dans les entretiens qui l’utilisent' : 'Entretien — occurrences posées'"
                @click="changerPorteeAnon(l.entite, 'entretien')"
              >📄</button>
              <button
                type="button"
                class="portee-cran corpus"
                :class="{ actif: l.etat === 'corpus' }"
                :disabled="lectureSeuleContenu || l.etat === 'corpus' || lectureSeule"
                :title="lectureSeule ? 'Nécessite une connexion au corpus partagé' : 'Corpus — règle d’anonymisation partagée du corpus'"
                @click="changerPorteeAnon(l.entite, 'corpus')"
              >🌐</button>
            </div>
            <!-- Catégorie de la définition locale ou partagée, lorsque ce réglage est actif. -->
            <select
              v-if="thematiquesActives.length"
              class="cat-select"
              :value="categorieDeLigne(l.entite)"
              title="Thématique de l'entité"
              :disabled="lectureSeuleContenu || (l.etat === 'corpus' && lectureSeule)"
              @change="categoriserLigne(l.entite, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">—</option>
              <option v-for="t in thematiquesActives" :key="t" :value="t">{{ t }}</option>
            </select>
            <div class="occ-action">
              <!-- Widget de navigation ◄ i/N ► (loupe), tant qu'un repérage est actif sur CETTE ligne. -->
              <span v-if="reperageAnon?.cle === l.cle" class="reperage-nav" :class="`rep-${reperageAnon.categorie}`">
                <button type="button" class="rep-btn" title="Occurrence précédente" @click="naviguerReperage(-1)">◄</button>
                <span class="rep-pos">{{ reperageAnon.index + 1 }}/{{ reperageAnon.hits.length }}</span>
                <button type="button" class="rep-btn" title="Occurrence suivante" @click="naviguerReperage(1)">►</button>
                <button type="button" class="rep-btn rep-close" title="Terminer le repérage" @click="arreterReperage()">✕</button>
              </span>
              <template v-else>
                <template v-if="(l.variantes?.length ?? 0) > 1">
                  <span
                    v-for="v in l.variantes"
                    :key="v.pseudo"
                    class="cpt-variante"
                  >{{ v.pseudo }}&nbsp;<button
                      v-if="v.nbAnonymise > 0"
                      type="button"
                      class="cpt-btn cpt-anon"
                      :title="`Repérer les ${v.nbAnonymise} occurrence(s) anonymisée(s) « ${v.pseudo} »`"
                      @click="demarrerReperage(l.cle, 'anonymise', v.pseudo)"
                    >{{ v.nbAnonymise }}</button><button
                      v-if="v.nbException > 0"
                      type="button"
                      class="cpt-btn cpt-exc"
                      :title="`Repérer les ${v.nbException} exception(s) « ${v.pseudo} »`"
                      @click="demarrerReperage(l.cle, 'exception', v.pseudo)"
                    >{{ v.nbException }}</button></span>
                </template>
                <template v-else>
                  <button
                    v-if="l.nbAnonymise > 0"
                    type="button"
                    class="cpt-btn cpt-anon"
                    :title="`Repérer les ${l.nbAnonymise} occurrence(s) anonymisée(s)`"
                    @click="demarrerReperage(l.cle, 'anonymise')"
                  >{{ l.nbAnonymise }}</button>
                  <button
                    v-if="l.nbException > 0"
                    type="button"
                    class="cpt-btn cpt-exc"
                    :title="`Repérer les ${l.nbException} exception(s)`"
                    @click="demarrerReperage(l.cle, 'exception')"
                  >{{ l.nbException }}</button>
                </template>
                <button
                  v-if="nbAAAnonymiser(l.cle) > 0"
                  type="button"
                  class="cpt-btn cpt-aanon"
                  :title="`Repérer les ${nbAAAnonymiser(l.cle)} occurrence(s) à anonymiser`"
                  @click="demarrerReperage(l.cle, 'a-anonymiser')"
                >À {{ nbAAAnonymiser(l.cle) }}</button>
              </template>
              <!-- Incluses : exposant non cliquable, et absorbées par une entité plus large ;
                   le clic retombe sur la règle large. -->
              <span
                v-if="l.nbIncluse > 0"
                class="cpt-incl"
                :title="tooltipIncluses(l.cle)"
              >+{{ l.nbIncluse }}</span>
              <!-- Emplacement réservé : exposant « +N incluse(s) » (chevauchements de règles). -->
              <button v-if="!lectureSeuleContenu && reperageAnon?.cle !== l.cle" class="x-anon" title="Supprimer cette ligne" :disabled="operationGlobaleEnCours" @click="supprimerLigneAnon(l.entite)">✕</button>
            </div>
          </div>
        </td>
      </tr>

      <!-- Lignes de saisie/draft : une entité par ligne ;
           Entrée sur le Nom → brouillon + passage à la ligne suivante ;
           Entrée sur le Pseudo ou ✓ → valider. -->
      <tr
        v-for="l in lignesSaisie"
        :key="l.id"
        class="ligne-anon saisie-anon"
        @focusout="onBlurLigne(l.id, $event)"
      >
        <td class="col-entite">
          <textarea
            class="nom-saisie"
            rows="1"
            v-model="l.entite"
            placeholder="nom…"
            :ref="refNom(l.id)"
            @keydown.enter.prevent="brouillonDepuisLigne(l)"
          ></textarea>
        </td>
        <td class="col-pseudo">
          <textarea
            class="pseudo-anon"
            rows="1"
            v-model="l.pseudo"
            placeholder="pseudo…"
            :ref="refPseudo(l.id)"
            @keydown.enter.prevent="validerLigne(l, $event.shiftKey)"
          ></textarea>
        </td>
        <td class="col-actions">
          <button class="ok-anon" title="Anonymiser toutes les occurrences" @click="validerLigne(l)">✓</button>
        </td>
      </tr>
    </tbody>
  </table>

  <Teleport to="body">
    <!-- Le dialogue sort de la colonne collante afin de couvrir tout l'écran. -->
    <div v-if="dialoguePorteeCorpus" class="portee-dialogue-overlay" @click.self="annulerDialogueCorpus">
      <div class="portee-dialogue">
        <h4>Pseudo divergent — « {{ dialoguePorteeCorpus.entite }} »</h4>
        <p>
          Une règle corpus existe déjà avec
          <b>« {{ dialoguePorteeCorpus.reglePseudos.join(' / ') }} »</b> alors que cette ligne porte
          <b>« {{ dialoguePorteeCorpus.pseudosCible.join(' / ') }} »</b>.
        </p>
        <p v-if="hintAnon" role="alert">{{ hintAnon }}</p>
        <div class="portee-dialogue-actions">
          <button @click="alignerCorpus()">Aligner (pseudo du corpus)</button>
          <button @click="garderLesDeuxCorpus()">Garder les deux</button>
          <button @click="annulerDialogueCorpus">Annuler</button>
        </div>
      </div>
    </div>
    <div v-if="confirmationCouverture" class="portee-dialogue-overlay" role="dialog" aria-modal="true" aria-labelledby="couverture-exceptions-titre">
      <div class="portee-dialogue">
        <h4 id="couverture-exceptions-titre">Couvrir des exceptions internes ?</h4>
        <p>{{ confirmationCouverture.nb }} occurrence(s) de « {{ confirmationCouverture.entite }} » contiennent une exception. La pseudonymisation englobante masquera le texte laissé volontairement en clair.</p>
        <p>Les exceptions sont conservées et réapparaîtront au retrait de l’englobante.</p>
        <div class="portee-dialogue-actions">
          <button @click="refuserCouverture">Annuler</button>
          <button @click="accepterCouverture">Confirmer la couverture</button>
        </div>
      </div>
    </div>
    <div v-if="suggestionLiaison" class="portee-dialogue-overlay">
      <div class="portee-dialogue">
        <h4>Pseudonymiser aussi : « {{ suggestionLiaison.entiteCoeur }} » ?</h4>
        <p>
          Vous venez de valider une entité commençant par un mot de liaison.
          Créer aussi la règle générale <b>« {{ suggestionLiaison.entiteCoeur }} »</b>
          (pseudo proposé : « {{ suggestionLiaison.pseudoCoeur }} »)&nbsp;?
        </p>
        <div class="portee-dialogue-actions">
          <button @click="accepterSuggestionLiaison">Oui</button>
          <button @click="refuserSuggestionLiaison">Non</button>
        </div>
      </div>
    </div>
  </Teleport>
</aside>
</template>

<style scoped>
.hint-codage {
  background: #fff3e0;
  color: #b06e0f;
  border: 1px solid #e0a03a;
  border-radius: 6px;
  padding: 0.3rem 0.5rem;
  font-size: 0.75rem;
  margin: 0.3rem 0;
}
.selection-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  margin: 0.3rem 0;
  padding: 0.55rem 0.65rem;
  border: 1px solid #d5e0ee;
  border-radius: 6px;
  background: #f5f8fc;
  cursor: pointer;
}
.selection-option-texte {
  display: flex;
  align-items: center;
}
.selection-option-titre {
  color: #26384d;
  font-size: 0.8rem;
  font-weight: 600;
}
.selection-option-commande {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex: none;
  color: #5f6b78;
  font-size: 0.7rem;
}
.selection-option-commande input {
  appearance: none;
  position: relative;
  width: 2.25rem;
  height: 1.3rem;
  flex: none;
  margin: 0;
  border: 0;
  border-radius: 999px;
  background: #aaa;
  cursor: pointer;
  transition: background-color 0.15s;
}
.selection-option-commande input::before {
  content: '';
  position: absolute;
  top: 0.15rem;
  left: 0.15rem;
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.15s;
}
.selection-option-commande input:checked {
  background: #2e73d8;
}
.selection-option-commande input:checked::before {
  transform: translateX(0.95rem);
}
.selection-option-commande input:focus-visible {
  outline: 2px solid #2e73d8;
  outline-offset: 2px;
}
/* --- Panneau Anon --- */
/* Tableau Anon : layout FIXE — le nom d'entité est borné (ellipsis au survol) et
 * les colonnes Pseudo porte / Actions restent TOUJOURS visibles. Les largeurs
 * viennent de la 1ʳᵉ ligne (thead) : Nom = reste (auto), Pseudo fixe (large,
 * le Nom se réduit d'autant), Actions fixe. Les inputs de saisie sont calés à
 * 100 % de leur colonne (box-sizing) pour ne jamais déborder de leur cellule. */
.tableau-anon {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  margin-top: 0.3rem;
}
/* En-têtes harmonisés sur les conventions « locuteurs » : petits, hautes
 * (uppercase), gris, centrés — SANS fond ni traits de grille lourds. Un seul
 * séparateur fin sous l'en-tête (comme pour le tableau des locuteurs). */
.tableau-anon th {
  text-align: center;
  font-size: 0.66rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-weight: 600;
  color: #999;
  padding: 0.15rem 0.3rem;
  background: transparent;
  border-bottom: 1px solid #e5e5ef;
}
.tableau-anon td {
  padding: 0.4rem 0.2rem;
  vertical-align: middle;
}
.ligne-anon td {
  background: #fff;
}
.ligne-anon.etat-brouillon td {
  background: #f3f8ff;
}
/* Ligne de saisie/draft : fond jaune pâle, distincte d'une ligne de données.
 * La classe est SAISIE-ANON (pas `saisie`) : `saisie` porte un `display:flex`
 * pour la fiche Données (EAV) qui casserait le layout du tableau en table-layout:fixed. */
.ligne-anon.saisie-anon td {
  background: #fffdf2;
}
/* Deux sous-lignes dans la colonne actions : le slider de portée sur une ligne,
 * les occurrences + l'action (✕) sur l'autre. Le flex vit sur un div INTERNE
 * (`.actions-empile`), PAS sur la cellule `<td>` : un `display:flex` sur un td
 * le retire de son rôle table-cell et casse le calcul des colonnes du tableau
 * en `table-layout:fixed`. */
.ligne-anon .actions-empile {
  display: flex;
  flex-direction: column;
  align-items: center; /* centré dans la colonne État·Occ. */
  gap: 0.15rem;
}
.ligne-anon .occ-action {
  /* Empilement VERTICAL : en multi-pseudo ou avec exceptions, chaque compteur
   * (ou chip de variante) passe à la ligne pour tenir dans la colonne étroite. */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
}
.col-entite {
  width: auto; /* prend le reste → la colonne Nom respire */
  min-width: 0;
  overflow: hidden;
}
.col-pseudo {
  width: 7.25rem; /* pseudo porte : un cran plus large → la colonne Nom (reste) se réduit d'autant */
}
.col-actions {
  width: 5rem; /* juste la largeur du slider de portée (3 crans + padding) */
  text-align: center;
}
/* Contenu centré dans les colonnes Nom et Pseudo (pour l'essai UX). */
td.col-entite,
td.col-pseudo {
  text-align: center;
}
/* Étiquette Nom des lignes existantes : texte MULTI-LIGNES (enveloppe sur
 * plusieurs lignes dans sa colonne), plafonné à 5 lignes. Un très long nom est
 * d'abord raccourci « début…fin » (majNomsAnon) ; le clamp CSS reste un
 * garde-fou si la colonne était plus étroite (zooms petits). Même rendu que le
 * Pseudo — texte noir, sans contour. */
.nom-anon {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 5;
  overflow: hidden;
  overflow-wrap: anywhere; /* coupe les mots très longs */
  white-space: normal;
  line-height: 1.25;
  min-width: 0;
  font-size: 0.82rem;
  color: #333;
  text-align: center;
  border: 1px solid #ccc; /* encadré façon tableau Locuteurs (harmonisation) */
  border-radius: 4px;
  background: transparent;
  padding: 0.1rem 0.3rem;
}
/* Champs de saisie (case Nom des lignes du bas, Pseudo partout) : toujours sur une ligne,
 * un texte plus long défile dans le champ.
 * Encadrés comme les champs du tableau Locuteurs ;
 * le fond de la ligne continue de distinguer les états. */
.nom-saisie,
.pseudo-anon {
  display: block;
  width: 100%;
  box-sizing: border-box;
  resize: none;
  overflow: hidden;
  white-space: pre;
  line-height: 1.25;
  height: calc(1.25em + 0.2rem * 2 + 2px);
  font-size: 0.82rem;
  color: #333;
  text-align: center;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: transparent;
  padding: 0.1rem 0.3rem;
}
/* Au focus, repère léger (sans décaler le layout) pour garder la navigation clavier visible. */
.nom-saisie:focus,
.pseudo-anon:focus {
  outline: 1px solid #2e73d8;
  outline-offset: 1px;
}
.pseudo-anon::placeholder {
  color: #bbb;
  font-weight: 400;
}
/* Compteurs scindés d'une ligne anon : occurrences ANONYMISÉES (barrées) et
 * EXCEPTIONS (laissées en clair). Les badges ronds colorés (.cpt-btn ci-dessous)
 * portent la couleur de chaque état. */
/* Groupe de boutons d'en-tête du panneau anon (⟳ + « + Ligne »). */
.tete-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
/* Compteurs cliquables (repérage ◄ i/N ►) : BADGES RONDS colorés — vert
 * #15c095 = anonymisé, gris #555 = exception, orange #ff9800 = à anonymiser.
 * Chiffre blanc sur la couleur. */
.cpt-btn {
  border: none;
  background: transparent;
  padding: 0;
  color: #fff;
  font-size: 0.66rem;
  font-weight: bold;
  font-family: inherit;
  flex: none;
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.cpt-btn.cpt-anon {
  background: #15c095;
}
.cpt-btn.cpt-exc {
  background: #555;
}
.cpt-btn.cpt-aanon {
  background: #ff9800;
}
.cpt-variante .cpt-btn {
  font-size: 0.62rem;
  width: 1rem;
  height: 1rem;
}
/* Exposant d'incluses : « +N » discret après les badges — absorbées par une
 * entité plus large, non comptées, non navigables (tooltip pour le détail). */
.cpt-incl {
  font-size: 0.62rem;
  color: #999;
  font-style: italic;
  cursor: help;
  line-height: 1;
}
/* Widget de navigation entre occurrences (état actif d'un compteur). */
.reperage-nav {
  display: inline-flex;
  align-items: center;
  gap: 0.1rem;
  flex: none;
}
.rep-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.7rem;
  color: #1565c0;
  padding: 0 0.15rem;
}
/* Le compteur i/N et ses flèches reprennent la COULEUR de la catégorie
 * naviguée : vert = anonymisées, gris = exceptions, orange = à anonymiser —
 * la navigation reste lisible sans retourner aux badges. */
.rep-anonymise .rep-btn,
.rep-anonymise .rep-pos {
  color: #15c095;
}
.rep-exception .rep-btn,
.rep-exception .rep-pos {
  color: #555;
}
.rep-a-anonymiser .rep-btn,
.rep-a-anonymiser .rep-pos {
  color: #ff9800;
}
.rep-close {
  color: #999 !important;
}
.rep-pos {
  font-size: 0.7rem;
  font-family: monospace;
  color: #1565c0;
  font-weight: bold;
  min-width: 2rem;
  text-align: center;
}
/* Compteur « à anonymiser » : occurrences présentes dans le texte mais pas
 * encore traitées (requête recalculée à l'ouverture, au ⟳ et après chaque
 * geste anon) — badge orange SonalPi1 (.cpt-btn.cpt-aanon). */
/* Compteurs PAR VARIANTE (multi-pseudo) : une puce par pseudo, libellé + ses
 * deux compteurs ; empilement lisible dans la colonne étroite. */
.cpt-variante {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  font-size: 0.68rem;
  flex: none;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #444;
}
.cpt-variante b,
.cpt-variante i {
  font-style: normal;
  font-family: monospace;
}
/* Slider de portée 3 crans : brouillon (🚧) / entretien (📄) / corpus (🌐).
 * Le cran corpus active les règles corpus. Le cran courant est désactivé et
 * mis en évidence, les autres sont cliquables (promotion). */
.portee-slider {
  display: inline-flex;
  border: 1px solid #d0d0d8;
  border-radius: 10px;
  overflow: hidden;
  background: #f5f5f7;
}
.portee-cran {
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0.02rem 0.26rem;
  font-size: 0.72rem;
  line-height: 1.3;
  opacity: 0.45;
}
.portee-cran.actif {
  opacity: 1;
  background: #2e73d8;
}
.portee-cran:disabled {
  cursor: default;
}
/* Dialogue de divergence de pseudo (poussée vers le corpus) */
.portee-dialogue-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001;
}
.portee-dialogue {
  background: #fff;
  border-radius: 8px;
  padding: 1rem 1.2rem;
  max-width: 460px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
}
.portee-dialogue h4 {
  margin: 0 0 0.5rem;
}
.portee-dialogue p {
  font-size: 0.85rem;
  color: #444;
  margin: 0 0 0.9rem;
  line-height: 1.4;
}
.portee-dialogue-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}
.portee-dialogue-actions button {
  border: 1px solid #ccc;
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
  padding: 0.35rem 0.7rem;
  font-size: 0.82rem;
}
.portee-dialogue-actions button:first-child {
  background: #2e73d8;
  color: #fff;
  border-color: #1565c0;
}
.ok-anon,
.x-anon {
  border: 1px solid #ccc;
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
  padding: 0.05rem 0.32rem;
  font-size: 0.8rem;
  flex: none;
}
.ok-anon:hover {
  border-color: #2e73d8;
  color: #1565c0;
}
.x-anon {
  color: #c33;
  opacity: 0.55;
}
.ligne-anon:hover .x-anon {
  opacity: 1;
}

</style>
