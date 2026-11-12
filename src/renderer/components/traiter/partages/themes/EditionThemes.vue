<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from 'vue'
import { utiliserSonal } from '../../../../composables/sonal'
import { visiblesThemes } from '../../../../../shared/corpus/categories'
import { operationGlobaleEnCours } from '../../../../operationGlobaleCorpus'
import DialogueSuppression from '../DialogueSuppression.vue'

/**
 *  Fenêtre d'ÉDITION des thèmes : le crayon ouvre une modale, la consultation
 *  reste compacte dans les panneaux. PARTAGÉE par les écrans Corpus et
 *  Entretien — même modèle (le codebook corpus).
 *  Supprimer un thème demande toujours une confirmation. Si le thème est utilisé,
 *  la confirmation le signale en évidence et la suppression reste possible :
 *  elle retire alors aussi les passages codés avec ce thème.
 */
const props = defineProps<{ contexte: 'corpus' | 'entretien' }>()
defineEmits<{ fermer: [] }>()

const {
  usages,
  messageTheme,
  hintCodage,
  couleurHex,
  arbreThemes,
  ajouterTheme,
  ajouterSousTheme,
  modifierTheme,
  deplacerTheme,
  migrerTheme,
  themeASupprimer,
  demanderSuppressionTheme,
  confirmerSuppressionTheme,
  rafraichirUsages,
} = utiliserSonal()

/** Taille par défaut du texte de l'éditeur (px) : `.editeur` ne fixe pas de `font-size` →
 *  hérite du 16px navigateur. Affichée comme choix « par défaut » du sélecteur
 *  (valeur '' → pas de taille stockée). */
const TAILLE_TEXTE = 16
/** Autres tailles proposées (px), sans la taille par défaut. */
const TAILLES = [12, 14, 18, 20, 22, 24, 28, 32]

// Repli des sous-thèmes : état de VUE local (jamais persisté, sans effet multi-utilisateur).
// La catégorie repliée reste visible, seuls ses descendants sont masqués à l'affichage via visiblesThemes.
const replies = ref<Set<string>>(new Set())
const arbreVisible = computed(() => visiblesThemes(arbreThemes(), replies.value))
function basculerRepli(id: string) {
  const s = new Set(replies.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  replies.value = s
}

// UX de création : le thème neuf est AUTO-FOCUSÉ et son texte présélectionné,
// pour nommer directement sans effacer « Nouveau thème/sous-thème ».
const nouveauId = ref<string | null>(null)
// Registre des champs nom RENDUS (rempli à chaque rendu, vidé au démontage) :
// l'arbre se rafraîchit avant que creerTheme pose nouveauId, donc le focus se pose APRÈS nextTick,
// sur l'élément déjà présent — jamais au montage.
const champsNom = new Map<string, HTMLInputElement>()
function noterChampNom(el: HTMLInputElement | null, id: string) {
  if (el) champsNom.set(id, el)
  else champsNom.delete(id)
}
async function creerTheme(estEnfant: boolean, parentId?: string) {
  const id = estEnfant ? await ajouterSousTheme(parentId!) : await ajouterTheme()
  nouveauId.value = id
  await nextTick() // attendre que la ligne (le champ nom) soit rendue
  const el = champsNom.get(id)
  if (el) el.focus() // le @focus du champ sélectionne le texte
  nouveauId.value = null
}

function renommer(id: string, evt: Event) {
  const nom = (evt.target as HTMLInputElement).value.trim()
  if (nom) modifierTheme(id, { nom })
}
function changerTaille(id: string, evt: Event) {
  const v = (evt.target as HTMLSelectElement).value
  // '' = « Aa » → taille: undefined PRÉSENT dans le patch = retour à la taille du texte (le spread écrase, la clé disparaît à l'écriture).
  modifierTheme(id, { taille: v ? Number(v) : undefined })
}

const descriptionsOuvertes = ref<Set<string>>(new Set())
function basculerDescription(id: string) {
  const ouvertes = new Set(descriptionsOuvertes.value)
  if (ouvertes.has(id)) ouvertes.delete(id)
  else ouvertes.add(id)
  descriptionsOuvertes.value = ouvertes
}
function changerDescription(id: string, evt: Event) {
  const description = (evt.target as HTMLTextAreaElement).value.trim()
  modifierTheme(id, { description: description || undefined })
}
const usageTotal = computed(() => (themeASupprimer.value ? themeASupprimer.value.n + themeASupprimer.value.autres : 0))


// --- Migration d'un thème sous un nouveau parent ---
// ▲▼ ne réordonnent que DANS la fratrie ; le ⤵ change l'emplacement du thème dans l'arbre (sous un autre thème parent,
// ou à la racine).
const migrationDe = ref<string | null>(null)
const migrationVers = ref('') // '' = racine

/** Ouvre le choix de destination pour le thème `id`. */
function demanderMigration(id: string) {
  migrationDe.value = id
  const cat = arbreThemes().find((n) => n.cat.id === id)?.cat
  migrationVers.value = cat?.parent ?? ''
}
/** Destinations possibles : la racine + tous les thèmes SAUF le thème migré et ses descendants.
 *  Une branche ne peut pas devenir son propre ancêtre. */
function destinationsDe(id: string): { id: string; nom: string }[] {
  const arbre = arbreThemes()
  const i = arbre.findIndex((n) => n.cat.id === id)
  if (i < 0) return []
  const prof = arbre[i].profondeur
  const exclus = new Set<string>([id])
  for (let j = i + 1; j < arbre.length && arbre[j].profondeur > prof; j++) exclus.add(arbre[j].cat.id)
  return arbre
    .filter((n) => !exclus.has(n.cat.id))
    .map((n) => ({ id: n.cat.id, nom: '\u00A0'.repeat(n.profondeur * 2) + n.cat.nom }))
}
function confirmerMigration() {
  if (!migrationDe.value) return
  migrerTheme(migrationDe.value, migrationVers.value || null)
  migrationDe.value = null
}

onMounted(() => {
  // Repartir propre (pas de message d'un passage précédent) + compteurs frais.
  messageTheme.value = null
  if (props.contexte === 'entretien') hintCodage.value = null
  rafraichirUsages()
})
</script>

<template>
  <div class="voile" @click.self="$emit('fermer')">
    <div class="modale-themes">
      <div class="corpus-tete">
        <h3>Édition des thèmes</h3>
        <button class="mini" title="Ajouter un thème de premier niveau" @click="creerTheme(false)">+ Thème</button>
        <button class="fermer" title="Fermer" @click="$emit('fermer')">✕</button>
      </div>
      <p class="aide-thm">
        « + Thème » crée un thème de premier niveau · Nom, description, couleur et taille de police des passages codés ·
        « + enfant » crée un sous-thème · ▲▼ déplacent le thème parmi ceux du même niveau · ⤵ le place sous un autre thème
      </p>

      <p v-if="messageTheme" class="msg-thm">{{ messageTheme }}</p>
      <p v-if="contexte === 'entretien' && hintCodage" class="msg-thm">{{ hintCodage }}</p>

      <!-- La confirmation explique les conséquences et les éventuels blocages. -->
      <DialogueSuppression
        :ouvert="!!themeASupprimer"
        :titre="themeASupprimer ? `Supprimer le thème « ${themeASupprimer.nom} » ?` : ''"
        :peut-supprimer="!!themeASupprimer && !themeASupprimer.blocage && !(usageTotal > 0 && themeASupprimer.partage)"
        :libelle-supprimer="usageTotal > 0 ? 'Supprimer quand même' : 'Supprimer'"
        :occupe="operationGlobaleEnCours"
        @confirmer="confirmerSuppressionTheme"
        @annuler="themeASupprimer = null"
      >
        <template v-if="themeASupprimer">
          <p v-if="usageTotal > 0" class="alerte-usage">
            <span aria-hidden="true">⚠</span>
            <span>
              Ce thème est utilisé par <b>{{ usageTotal }} passage(s) codé(s)</b><template v-if="themeASupprimer.n > 0 && themeASupprimer.autres > 0">
                ({{ themeASupprimer.n }} dans cet entretien, {{ themeASupprimer.autres }} dans d’autres entretiens)</template><template v-else-if="themeASupprimer.autres > 0">
                dans le corpus</template>.
              Le supprimer retire aussi ces codages des textes — <b>irréversible</b>.
            </span>
          </p>
          <p v-else class="usage-nul">Ce thème n’est utilisé nulle part.</p>
          <p v-if="themeASupprimer.blocage" class="usage-partage">{{ themeASupprimer.blocage }}</p>
          <p v-if="usageTotal > 0 && themeASupprimer.partage" class="usage-partage">
            Sur un corpus partagé, un thème utilisé ne peut pas être supprimé d’ici.
            Utilisez plutôt « Fusionner » ou « Transférer » (onglet Thèmes du corpus).
          </p>
        </template>
      </DialogueSuppression>

      <!-- Choix de la destination d'une migration (⤵ d'une ligne) -->
      <div v-if="migrationDe" class="confirm-suppr">
        Déplacer « {{ arbreThemes().find((n) => n.cat.id === migrationDe)?.cat.nom }} » sous :
        <select v-model="migrationVers" class="dest-migration">
          <option value="">— racine du codebook —</option>
          <option v-for="d in destinationsDe(migrationDe)" :key="d.id" :value="d.id">{{ d.nom }}</option>
        </select>
        <div class="confirm-actions">
          <button @click="confirmerMigration">Déplacer</button>
          <button @click="migrationDe = null">Annuler</button>
        </div>
      </div>

      <p v-if="arbreThemes().length === 0" class="vide">Aucun thème — clique « + Thème ».</p>

      <!-- En-tête de colonnes : les clones .fantome sont les MÊMES éléments qu'une ligne (boutons, input),
           largeurs identiques par construction (un span n'a ni le padding ni la police par défaut d'un bouton) → chaque
           intitulé tombe pile au-dessus de sa colonne. -->
      <div v-if="arbreThemes().length" class="entete-liste" aria-hidden="true">
        <span class="depliant fantome"></span>
        <input type="color" class="swatch fantome" />
        <span class="entete-lbl entete-nom">thème</span>
        <span class="entete-lbl entete-aa" title="Taille de police des passages codés (16 = taille du texte)">Aa</span>
        <span class="entete-lbl entete-usage" title="Nombre de codages dans le corpus">Nbre</span>
        <span class="entete-lbl entete-actif" title="Décoché = thème désactivé (grisé)">Actif</span>
        <button class="description-action fantome">+ description</button>
        <button class="mini-sous fantome">+ enfant</button>
        <button class="fleche fantome">▲</button>
        <button class="fleche fantome">▼</button>
        <button class="fleche migrer fantome">⤵</button>
        <button class="x fantome">✕</button>
      </div>
      <ul class="liste-thm">
        <li
          v-for="n in arbreVisible"
          :key="n.cat.id"
          :class="{ inactif: !n.cat.actif }"
          :style="{ paddingLeft: n.profondeur * 1.1 + 'rem' }"
          :data-nom="n.cat.nom"
        >
          <button
            v-if="n.aEnfants"
            class="depliant"
            :title="replies.has(n.cat.id) ? 'Replier les sous-thèmes' : 'Déplier les sous-thèmes'"
            @click="basculerRepli(n.cat.id)"
          >
            {{ replies.has(n.cat.id) ? '▸' : '▾' }}
          </button>
          <span v-else class="depliant fantome"></span>
          <input
            type="color"
            class="swatch"
            :value="couleurHex(n.cat)"
            @change="modifierTheme(n.cat.id, { couleur: ($event.target as HTMLInputElement).value })"
          />
          <input
            class="nom-thm"
            :ref="(el) => noterChampNom(el as HTMLInputElement | null, n.cat.id)"
            :value="n.cat.nom"
            @focus="($event.target as HTMLInputElement).select()"
            @keyup.enter="($event.target as HTMLInputElement).blur()"
            @change="renommer(n.cat.id, $event)"
          />
          <select
            class="taille-thm"
            title="Taille de police des passages codés (16 = taille du texte)"
            :value="n.cat.taille ?? ''"
            @change="changerTaille(n.cat.id, $event)"
          >
            <option value="">{{ TAILLE_TEXTE }}</option>
            <option v-for="t in TAILLES" :key="t" :value="t">{{ t }}</option>
          </select>
          <span class="usage" :title="`${usages[n.cat.id] ?? 0} codage(s)`">{{
            usages[n.cat.id] ?? 0
          }}</span>
          <label class="actif" :title="n.cat.actif ? 'actif' : 'inactif'">
            <input
              type="checkbox"
              :checked="n.cat.actif"
              @change="modifierTheme(n.cat.id, { actif: ($event.target as HTMLInputElement).checked })"
            />
          </label>
          <button
            class="description-action"
            :aria-label="n.cat.description ? `Modifier la description de ${n.cat.nom}` : `Ajouter une description à ${n.cat.nom}`"
            :title="n.cat.description ? 'Modifier la description' : 'Ajouter une description'"
            @click="basculerDescription(n.cat.id)"
          >
            {{ n.cat.description ? '📝 description' : '+ description' }}
          </button>
          <button class="mini-sous" title="Ajouter un sous-thème (enfant de celui-ci)" @click="creerTheme(true, n.cat.id)">
            + enfant
          </button>
          <button class="fleche" title="Monter" :disabled="n.premier" @click="deplacerTheme(n.cat.id, -1)">
            ▲
          </button>
          <button class="fleche" title="Descendre" :disabled="n.dernier" @click="deplacerTheme(n.cat.id, 1)">
            ▼
          </button>
          <button
            class="fleche migrer"
            title="Déplacer sous un autre thème parent (ou à la racine)"
            @click="demanderMigration(n.cat.id)"
          >
            ⤵
          </button>
          <button class="x" title="Supprimer" :disabled="operationGlobaleEnCours" @click="demanderSuppressionTheme(n.cat.id)">✕</button>
          <div v-if="descriptionsOuvertes.has(n.cat.id)" class="edition-description">
            <label :for="`description-theme-${n.cat.id}`">Description facultative</label>
            <textarea
              :id="`description-theme-${n.cat.id}`"
              class="description-thm"
              rows="3"
              :value="n.cat.description ?? ''"
              placeholder="Précise ce qui doit être classé dans ce thème."
              @change="changerDescription(n.cat.id, $event)"
            ></textarea>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.voile {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 8vh;
  z-index: 50;
}
/* Largeurs PRÉVISIBLES (border-box) : bordures/padding comptés DANS la largeur →
   une colonne de ligne (select, input…) et son intitulé d'en-tête, déclarés à la
   même largeur, occupent exactement la même place (l'alignement en dépend). */
.modale-themes,
.modale-themes * {
  box-sizing: border-box;
}
.modale-themes {
  width: min(560px, 92vw);
  max-height: 80vh;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #d6dce8;
  border-radius: 10px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
  padding: 0.8rem 1rem 1rem;
}
/* .corpus-tete/.mini/.aide-thm/.msg-thm/.vide/.x : styles GLOBAUX (base.css). */
.corpus-tete {
  gap: 0.5rem;
}
/* Le bouton principal de création reste mis en avant. */
.corpus-tete .mini {
  font-weight: bold;
}
.corpus-tete h3 {
  flex: 1;
}
.fermer {
  border: none;
  background: none;
  color: #888;
  cursor: pointer;
  font-size: 0.9rem;
}
.liste-thm {
  list-style: none;
  margin: 0.3rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.liste-thm li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  border: 1px solid transparent;
  border-radius: 5px;
  padding: 0.1rem 0.15rem;
}
/* Icône de repli d'un parent : largeur FIXE partagée avec son fantôme d'en-tête (l'alignement des colonnes en dépend),
   bouton discret sans bords. */
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
.liste-thm li.inactif {
  opacity: 0.3;
}
.swatch {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
  flex: none;
}
/* Fait occuper la couleur à toute la surface (évite le « carré dans un carré »
 * du swatch natif, identique au sélecteur de couleur des locuteurs). */
.swatch::-webkit-color-swatch-wrapper {
  padding: 0;
}
.swatch::-webkit-color-swatch {
  border: none;
  border-radius: 4px;
}
.nom-thm {
  flex: 1;
  min-width: 0;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.15rem 0.35rem;
  font-size: 0.82rem;
}
.taille-thm {
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.75rem;
  padding: 0.1rem;
  flex: none;
  width: 3.2rem; /* fixe : l'en-tête « Aa » se cale sur cette colonne */
}
/* En-tête de colonnes : même flex/gap qu'une ligne ; les clones .fantome réservent les largeurs, seul « Aa » est visible. */
.entete-liste {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  /* Miroir EXACT d'une ligne li racine : bordure transparente, padding droit,
     et padding GAUCHE À 0 (les li racine ont `padding-left: 0rem` inline). */
  border: 1px solid transparent;
  padding: 0 0.15rem 0 0;
  margin-top: 0.3rem;
}
.fantome {
  visibility: hidden;
}
.entete-lbl {
  flex: none;
  text-align: center;
  font-size: 0.68rem;
  font-style: italic;
  color: #888;
}
.entete-nom {
  flex: 1;
  text-align: left;
  padding-left: 0.45rem; /* = bordure + padding du .nom-thm : « thème » démarre où le texte démarre */
}
.entete-aa {
  width: 3.2rem; /* = .taille-thm */
}
.entete-usage {
  width: 2.4rem; /* = .usage */
}
.entete-actif {
  width: 2.4rem; /* = .actif */
}
/* Colonnes nbre/actif : largeur FIXE partagée avec leur intitulé d'en-tête. */
.usage {
  font-size: 0.72rem;
  color: #888;
  font-family: monospace;
  width: 2.4rem;
  flex: none;
  text-align: center;
}
.actif {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.4rem;
  flex: none;
}
.fleche {
  border: none;
  background: none;
  color: #999;
  cursor: pointer;
  font-size: 0.65rem;
  padding: 0 0.1rem;
}
.fleche:disabled {
  color: #ddd;
  cursor: default;
}
/* ⤵ plus gros que ▲▼ : c'est un geste moins évident, on le rend repérable. */
.fleche.migrer {
  font-size: 0.95rem;
}
.description-action,
.mini-sous {
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  color: #666;
  cursor: pointer;
  font-size: 0.62rem;
  padding: 0 0.25rem;
  flex: none;
}
.description-action:hover,
.mini-sous:hover {
  border-color: #2e73d8;
  color: #1565c0;
}
.edition-description {
  flex-basis: 100%;
  margin: 0.1rem 0 0.35rem 1.7rem;
  padding: 0.45rem;
  border-left: 3px solid #b8c9df;
  background: #f7f9fc;
}
.edition-description label {
  display: block;
  margin-bottom: 0.2rem;
  color: #5f6875;
  font-size: 0.72rem;
  font-weight: 600;
}
.description-thm {
  display: block;
  width: 100%;
  resize: vertical;
  border: 1px solid #c8cfda;
  border-radius: 5px;
  padding: 0.4rem 0.5rem;
  font: inherit;
  font-size: 0.8rem;
  line-height: 1.35;
}
.dest-migration {
  margin-left: 0.4rem;
  max-width: 100%;
}
/* .confirm-suppr/.confirm-actions : styles GLOBAUX (base.css). */
</style>
