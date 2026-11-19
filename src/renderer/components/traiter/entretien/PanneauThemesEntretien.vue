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
const aideOuverte = ref(false)
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
    <div class="gabarit-entete">
      <button
        type="button"
        class="gabarit-icone"
        :aria-expanded="aideOuverte"
        aria-label="Aide sur les thématiques"
        title="Aide"
        @click="aideOuverte = !aideOuverte"
      ><span class="ico-info" aria-hidden="true"></span></button>
      <div class="gabarit-actions">
        <button
          v-if="idsDescriptions.length"
          type="button"
          class="gabarit-icone gabarit-libelle"
          :aria-label="toutesDescriptionsOuvertes ? 'Masquer toutes les descriptions' : 'Afficher toutes les descriptions'"
          :aria-pressed="toutesDescriptionsOuvertes"
          :title="toutesDescriptionsOuvertes ? 'Masquer toutes les descriptions' : 'Afficher toutes les descriptions'"
          @click="basculerToutesDescriptions"
        >Descriptions</button>
        <button
          v-if="!lectureSeule"
          type="button"
          class="gabarit-action"
          title="Éditer les thèmes"
          aria-label="Éditer les thèmes"
          @click="editerThemes = true"
        >Modifier</button>
      </div>
    </div>
    <div v-if="aideOuverte" class="gabarit-aide">
      <p>
        Cliquez sur un thème pour coder le passage sélectionné. Le chiffre à droite indique combien de passages sont déjà codés avec ce thème.
        Un thème grisé est inactif : il n’apparaît plus dans le texte.
      </p>
    </div>
    <p v-if="hintCodage" class="gabarit-indication hint-codage">{{ hintCodage }}</p>

    <p v-if="codebook.length === 0" class="gabarit-vide">Aucun thème pour le moment. Cliquez sur « Modifier » pour en créer.</p>
    <p v-else class="gabarit-legende" aria-hidden="true">Codages</p>
    <ul class="gabarit-liste liste-coder">
      <li v-for="n in arbreVisible" :key="n.cat.id" class="ligne-coder">
        <button
          type="button"
          class="gabarit-ligne theme-coder"
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
          <span class="gabarit-pastille pastille" :style="{ background: couleurHex(n.cat) }"></span>
          <span class="theme-nom gabarit-ligne-titre">{{ n.cat.nom }}</span>
        </button>
        <button
          v-if="n.cat.description"
          type="button"
          class="info-theme"
          :aria-label="descriptionsOuvertes.has(n.cat.id) ? `Masquer la description de ${n.cat.nom}` : `Afficher la description de ${n.cat.nom}`"
          :aria-expanded="descriptionsOuvertes.has(n.cat.id)"
          :title="descriptionsOuvertes.has(n.cat.id) ? 'Masquer la description' : 'Afficher la description'"
          @click="basculerDescription(n.cat.id)"
        ><span class="ico-info" aria-hidden="true"></span></button>
        <span v-else class="info-theme info-theme-masque" aria-hidden="true"><span class="ico-info" aria-hidden="true"></span></span>
        <span class="usage gabarit-meta" :title="`${usages[n.cat.id] ?? 0} codage(s)`">
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
.gabarit-libelle {
  width: auto;
  padding: 0 0.55rem;
  font-size: 0.8rem;
}
.gabarit-legende {
  margin: 0 0.2rem 0.2rem;
  text-align: right;
  color: #8a8f98;
  font-size: 0.72rem;
}
.liste-coder {
  padding: 0 0 0.5rem;
}
.theme-coder {
  cursor: pointer;
}
.theme-coder.inactif {
  opacity: 0.3;
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
.info-theme {
  width: 1.3rem;
  height: 1.3rem;
  margin-right: -0.1rem;
  flex: none;
  border: 1px solid transparent;
  border-radius: 50%;
  background: #fff;
  color: #55708f;
  cursor: pointer;
  padding: 0;
  font-size: 0.9rem;
  line-height: 1;
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
