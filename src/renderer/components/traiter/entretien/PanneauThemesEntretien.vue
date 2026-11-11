<script setup lang="ts">
import { computed, ref } from 'vue'
import { visiblesThemes } from '../../../../shared/corpus/categories'
import { utiliserSonal } from '../../../composables/sonal'
import EditionThemes from '../partages/themes/EditionThemes.vue'
import MenuTheme from '../partages/themes/MenuTheme.vue'

defineProps<{ lectureSeuleContenu: boolean }>()

const {
  codebook,
  couleurHex,
  arbreThemes,
  modifierTheme,
  usages,
  hintCodage,
  coderAvec,
  lectureSeule,
} = utiliserSonal()

const editerThemes = ref(false)
const menuTheme = ref<{ id: string; nom: string; x: number; y: number; actif: boolean } | null>(null)
const descriptionsOuvertes = ref<Set<string>>(new Set())
const repliesThemes = ref<Set<string>>(new Set())
const arbreVisible = computed(() => visiblesThemes(arbreThemes(), repliesThemes.value))
const idsDescriptions = computed(() => arbreThemes().filter((n) => n.cat.description).map((n) => n.cat.id))
const toutesDescriptionsOuvertes = computed(() =>
  idsDescriptions.value.length > 0 && idsDescriptions.value.every((id) => descriptionsOuvertes.value.has(id)),
)

function ouvrirMenuTheme(cat: { id: string; nom: string; actif: boolean }, evt: MouseEvent) {
  if (lectureSeule.value) return
  menuTheme.value = { id: cat.id, nom: cat.nom, x: evt.clientX, y: evt.clientY, actif: cat.actif }
}

function basculerActifTheme() {
  const menu = menuTheme.value
  if (menu) modifierTheme(menu.id, { actif: !menu.actif })
  menuTheme.value = null
}

function basculerRepli(id: string) {
  const replies = new Set(repliesThemes.value)
  if (replies.has(id)) replies.delete(id)
  else replies.add(id)
  repliesThemes.value = replies
}

function basculerDescription(id: string) {
  const ouvertes = new Set(descriptionsOuvertes.value)
  if (ouvertes.has(id)) ouvertes.delete(id)
  else ouvertes.add(id)
  descriptionsOuvertes.value = ouvertes
}

function basculerToutesDescriptions() {
  descriptionsOuvertes.value = toutesDescriptionsOuvertes.value
    ? new Set()
    : new Set(idsDescriptions.value)
}
</script>

<template>
  <aside class="panneau themes-coder" aria-label="Thématiques">
    <div class="corpus-tete">
      <button
        v-if="idsDescriptions.length"
        class="toutes-descriptions"
        :aria-label="toutesDescriptionsOuvertes ? 'Masquer toutes les descriptions' : 'Afficher toutes les descriptions'"
        :aria-pressed="toutesDescriptionsOuvertes"
        :title="toutesDescriptionsOuvertes ? 'Masquer toutes les descriptions' : 'Afficher toutes les descriptions'"
        @click="basculerToutesDescriptions"
      >ⓘ tout</button>
      <button
        v-if="!lectureSeule"
        class="crayon"
        title="Éditer les thèmes"
        @click="editerThemes = true"
      >✏️</button>
    </div>
    <p v-if="hintCodage" class="hint-codage">{{ hintCodage }}</p>

    <p v-if="codebook.length === 0" class="vide">Aucun thème — ✏️ pour en créer.</p>
    <ul class="liste-coder">
      <li v-for="n in arbreVisible" :key="n.cat.id" class="ligne-coder">
        <button
          class="theme-coder"
          :class="{ inactif: !n.cat.actif }"
          :style="{ marginLeft: n.profondeur * 1.1 + 'rem' }"
          :disabled="lectureSeuleContenu"
          @click="coderAvec(n.cat.id)"
          @contextmenu.prevent="ouvrirMenuTheme(n.cat, $event)"
        >
          <span
            v-if="n.aEnfants"
            class="depliant"
            role="button"
            :title="repliesThemes.has(n.cat.id) ? 'Replier les sous-thèmes' : 'Déplier les sous-thèmes'"
            @click.stop="basculerRepli(n.cat.id)"
          >
            {{ repliesThemes.has(n.cat.id) ? '▸' : '▾' }}
          </span>
          <span v-else class="depliant depliant-masque"></span>
          <span class="pastille" :style="{ background: couleurHex(n.cat) }"></span>
          <span class="theme-nom">{{ n.cat.nom }}</span>
        </button>
        <button
          v-if="n.cat.description"
          class="info-theme"
          :aria-label="descriptionsOuvertes.has(n.cat.id) ? `Masquer la description de ${n.cat.nom}` : `Afficher la description de ${n.cat.nom}`"
          :aria-expanded="descriptionsOuvertes.has(n.cat.id)"
          :title="descriptionsOuvertes.has(n.cat.id) ? 'Masquer la description' : 'Afficher la description'"
          @click="basculerDescription(n.cat.id)"
        >ⓘ</button>
        <span v-else class="info-theme info-theme-masque" aria-hidden="true">ⓘ</span>
        <span class="usage" :title="`${usages[n.cat.id] ?? 0} codage(s)`">
          {{ usages[n.cat.id] ?? 0 }}
        </span>
        <p v-if="descriptionsOuvertes.has(n.cat.id)" class="description-theme">{{ n.cat.description }}</p>
      </li>
    </ul>

    <Teleport to="body">
      <EditionThemes v-if="editerThemes" contexte="entretien" @fermer="editerThemes = false" />
    </Teleport>
    <MenuTheme
      v-if="menuTheme"
      :x="menuTheme.x"
      :y="menuTheme.y"
      :nom="menuTheme.nom"
      :actif="menuTheme.actif"
      @basculer="basculerActifTheme"
      @fermer="menuTheme = null"
    />
  </aside>
</template>

<style scoped>
/* Sans titre dans l'en-tête : « ⓘ tout » reste à gauche, le crayon est
 * poussé au bord droit (le .corpus-tete global étale en space-between). */
.corpus-tete {
  justify-content: flex-start;
  gap: 0.4rem;
}
.corpus-tete .crayon {
  margin-left: auto;
  font-size: 1.2rem;
  min-width: 2.75rem;
  min-height: 2.75rem;
}
.hint-codage {
  background: #fff3e0;
  color: #b06e0f;
  border: 1px solid #e0a03a;
  border-radius: 6px;
  padding: 0.3rem 0.5rem;
  font-size: 0.75rem;
  margin: 0.3rem 0;
}
.liste-coder {
  list-style: none;
  margin: 0.3rem 0 0;
  padding: 0 0 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.theme-coder {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  width: 100%;
  text-align: left;
  border: 1px solid #e5e5ef;
  border-radius: 6px;
  background: #fff;
  padding: 0.3rem 0.5rem;
  cursor: pointer;
  font-size: 0.85rem;
}
.depliant {
  width: 1.1rem;
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
.usage {
  width: 1.8rem;
  font-size: 0.68rem;
  color: #888;
  font-family: monospace;
  flex: none;
  text-align: center;
}
.theme-coder:hover {
  border-color: #2e73d8;
  background: #f0f6ff;
}
.theme-coder.inactif {
  opacity: 0.3;
}
.pastille {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex: none;
  border: 1px solid rgba(0, 0, 0, 0.15);
}
.theme-nom {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ligne-coder {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.2rem;
}
.ligne-coder .theme-coder {
  width: auto;
  min-width: 0;
  flex: 1;
}
.toutes-descriptions {
  border: 1px solid #d3dae5;
  border-radius: 5px;
  background: #fff;
  color: #55708f;
  cursor: pointer;
  padding: 0.12rem 0.35rem;
  font-size: 0.68rem;
}
.toutes-descriptions[aria-pressed="true"],
.toutes-descriptions:hover {
  border-color: #2e73d8;
  color: #1565c0;
  background: #f0f6ff;
}
.info-theme {
  width: 1.3rem;
  height: 1.3rem;
  margin-right: -0.1rem;
  flex: none;
  border: 1px solid #d3dae5;
  border-radius: 50%;
  background: #fff;
  color: #55708f;
  cursor: pointer;
  padding: 0;
  font-size: 0.66rem;
}
.info-theme:hover {
  border-color: #2e73d8;
  color: #1565c0;
  background: #f0f6ff;
}
.info-theme-masque {
  visibility: hidden;
}
.description-theme {
  flex-basis: 100%;
  margin: 0 0 0.2rem 1.4rem;
  padding: 0.4rem 0.5rem;
  border-left: 3px solid #b8c9df;
  background: #f7f9fc;
  color: #4f5966;
  font-size: 0.76rem;
  line-height: 1.35;
  white-space: pre-wrap;
}
</style>
