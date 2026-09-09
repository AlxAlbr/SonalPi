<script setup lang="ts">
import { computed, ref } from 'vue'
import { visiblesThemes } from '../../../shared/corpus/categories'
import { utiliserSonal } from '../../composables/sonal'
import EditionThemes from '../themes/EditionThemes.vue'
import MenuTheme from '../themes/MenuTheme.vue'

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
const repliesThemes = ref<Set<string>>(new Set())
const arbreVisible = computed(() => visiblesThemes(arbreThemes(), repliesThemes.value))

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
</script>

<template>
  <aside class="panneau themes-coder">
    <div class="corpus-tete">
      <h3>Thématiques</h3>
      <button
        v-if="!lectureSeule"
        class="crayon"
        title="Éditer les thèmes"
        @click="editerThemes = true"
      >✏️</button>
    </div>
    <p class="aide-thm">Sélectionne du texte, puis clique un thème pour le coder (re-clic = retirer).</p>
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
          <span class="usage" :title="`${usages[n.cat.id] ?? 0} codage(s)`">
            {{ usages[n.cat.id] ?? 0 }}
          </span>
        </button>
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
  padding: 0;
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
  font-size: 0.68rem;
  color: #888;
  font-family: monospace;
  flex: none;
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
  align-items: center;
  gap: 0.2rem;
}
.ligne-coder .theme-coder {
  flex: 1;
}
</style>
