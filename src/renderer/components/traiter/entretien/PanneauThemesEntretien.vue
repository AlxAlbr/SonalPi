<script setup lang="ts">
import { computed, ref } from 'vue'
import { visiblesThemes } from '../../../../shared/corpus/categories'
import { utiliserSonal } from '../../../composables/sonal'
import EditionThemes from '../partages/themes/EditionThemes.vue'
import MenuTheme from '../partages/themes/MenuTheme.vue'
import icoThemes from '../../../assets/icones/themes.png'

const props = withDefaults(
  defineProps<{ lectureSeuleContenu: boolean; partie?: 'themes' | 'ponderation' }>(),
  { partie: 'themes' },
)

const {
  codebook,
  couleurHex,
  arbreThemes,
  ajouterTheme,
  modifierTheme,
  hintCodage,
  coderAvec,
  lectureSeule,
} = utiliserSonal()

const editerThemes = ref(false)
const menuTheme = ref<{ id: string; nom: string; x: number; y: number; actif: boolean } | null>(null)
const repliesThemes = ref<Set<string>>(new Set())
const arbreComplet = computed(() => arbreThemes())
const indexPonderations = computed(() =>
  arbreComplet.value.findIndex((n) =>
    n.profondeur === 0 && n.cat.nom.trim().toLocaleLowerCase('fr-FR') === 'pondérations',
  ),
)
const arbrePonderations = computed(() => {
  const index = indexPonderations.value
  if (index < 0) return []
  const racine = arbreComplet.value[index]
  let fin = index + 1
  while (fin < arbreComplet.value.length && arbreComplet.value[fin].profondeur > racine.profondeur) fin++
  return arbreComplet.value.slice(index, fin)
})
const idsPonderations = computed(() => new Set(arbrePonderations.value.map((n) => n.cat.id)))
const arbreVisible = computed(() =>
  visiblesThemes(arbreComplet.value.filter((n) => !idsPonderations.value.has(n.cat.id)), repliesThemes.value),
)

async function ajouterThemeDepuisPanneau() {
  await ajouterTheme()
}

function libellePonderation(id: string, nom: string): string {
  if (id === arbrePonderations.value[0]?.cat.id) return 'Normal'
  return nom.replace(/^[★☆]+\s*/, '')
}

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
    <div v-if="props.partie === 'themes'" class="corpus-tete">
      <h3><img class="icone-entete-panneau" :src="icoThemes" alt="" />Thématiques</h3>
      <button v-if="!lectureSeule" class="mini" @click="ajouterThemeDepuisPanneau">+ Thème</button>
      <button
        v-if="!lectureSeule"
        class="crayon"
        title="Modifier les thèmes"
        @click="editerThemes = true"
      >✏️</button>
    </div>
    <div v-else class="corpus-tete">
      <h3>Pondération</h3>
    </div>
    <p v-if="props.partie === 'themes' && hintCodage" class="hint-codage">{{ hintCodage }}</p>

    <p v-if="props.partie === 'themes' && codebook.length === 0" class="vide">Aucun thème.</p>
    <ul v-if="props.partie === 'themes'" class="liste-coder">
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
      </li>
    </ul>

    <section
      v-if="props.partie === 'ponderation' && arbrePonderations.length"
      class="section-ponderations"
      aria-label="Pondération"
    >
      <div class="boutons-ponderation">
        <button
          v-for="n in arbrePonderations"
          :key="n.cat.id"
          class="theme-coder bouton-ponderation"
          :class="{ inactif: !n.cat.actif }"
          :disabled="lectureSeuleContenu"
          :title="n.cat.nom"
          @click="coderAvec(n.cat.id)"
          @contextmenu.prevent="ouvrirMenuTheme(n.cat, $event)"
        >
          <span class="pastille" :style="{ background: couleurHex(n.cat) }"></span>
          <span class="theme-nom">{{ libellePonderation(n.cat.id, n.cat.nom) }}</span>
        </button>
      </div>
    </section>

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
.section-ponderations {
  margin-top: 0.45rem;
  padding-top: 0.35rem;
  border-top: 1px solid #e5e5ef;
}
.section-ponderations h4 {
  margin: 0 0 0.3rem;
  color: #555;
  font-size: 0.75rem;
}
.boutons-ponderation {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.bouton-ponderation {
  width: auto;
  min-width: 0;
  flex: 1 1 auto;
  padding: 0.25rem 0.35rem;
  font-size: 0.75rem;
}
</style>
