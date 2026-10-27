<script setup lang="ts">
import type { ApercuCrp } from '../../../shared/corpus/migrationCrp'
import type { ConservationMigration } from '../../../shared/corpus/conservationMigration'
import type { ImportTraitementsLexicoV1 } from '../../../shared/lexico/traitements'

defineProps<{
  apercu: ApercuCrp
  afficherEntretiens?: boolean
  lexico?: ImportTraitementsLexicoV1 | null
  conservation?: ConservationMigration | null
}>()
</script>

<template>
  <div class="resume-migration">
    <p v-if="afficherEntretiens">{{ apercu.nbEntretiens }} entretien(s) seront repris avec leurs annotations, notes et réglages.</p>
    <p v-if="lexico?.fichiers.length">Les réglages Lexico reconnus seront repris.</p>
    <template v-if="conservation">
      <p v-if="conservation.autres.length" class="documents-conserves">
        {{ conservation.autres.length }} document(s) supplémentaire(s) seront copiés dans <strong>Autres/</strong>, sans conversion.
        Les anciens résultats restent des fichiers, sans conversion en analyses SonalPi2.
      </p>
      <p v-if="conservation.nonRepris.length" class="avertissement">
        {{ conservation.nonRepris.length }} fichier(s) ou dossier(s) ne seront pas repris. Ils resteront intacts dans la source ; consultez les détails avant de continuer.
      </p>
      <p v-if="conservation.autresCorpus" class="avertissement">Plusieurs corpus partagent ce dossier. Seul le corpus choisi sera converti ; vérifiez les documents supplémentaires communs qui seront copiés.</p>
      <p v-for="message in conservation.avertissements" :key="message" class="avertissement">{{ message }}</p>
    </template>
    <p v-if="lexico?.diagnostics.length" class="avertissement">Certains réglages Lexico n’ont pas pu être repris entièrement. Leurs fichiers d’origine seront conservés dans « Autres » lorsqu’ils sont accessibles.</p>
    <details>
      <summary>Voir les détails</summary>
      <p>Thèmes : {{ apercu.themes.length }} · Variables : {{ apercu.variables.length }} · Règles de pseudonymisation : {{ apercu.reglesAnon.length }}.</p>
      <ul class="ligne-theme"><li v-for="(theme, index) in apercu.themes" :key="index">{{ theme.nom }}</li></ul>
      <ul class="ligne-variable"><li v-for="(variable, index) in apercu.variables" :key="index">{{ variable.lib }}</li></ul>
      <ul class="ligne-anon"><li v-for="(regle, index) in apercu.reglesAnon" :key="index">{{ regle.entite }}</li></ul>
      <p v-if="lexico?.fichiers.length">Réglages Lexico : {{ lexico.fichiers.join(', ') }}.</p>
      <ul v-if="lexico?.diagnostics.length"><li v-for="message in lexico.diagnostics" :key="message">{{ message }}</li></ul>
      <template v-if="conservation?.autres.length">
        <h4>Documents conservés sans conversion</h4>
        <ul><li v-for="fichier in conservation.autres" :key="fichier.cheminSource">{{ fichier.cheminSource }} → {{ fichier.cheminDestination }}</li></ul>
      </template>
      <template v-if="conservation?.nonRepris.length">
        <h4>Éléments non repris</h4>
        <ul><li v-for="fichier in conservation.nonRepris" :key="fichier.chemin">{{ fichier.chemin }} — {{ fichier.raison }}</li></ul>
      </template>
    </details>
  </div>
</template>

<style scoped>
.resume-migration { overflow-wrap: anywhere; }
.avertissement { background: #fff4df; padding: 0.6rem; border-radius: 5px; }
summary { cursor: pointer; }
ul { padding-left: 1.4rem; }
h4 { margin-bottom: 0.4rem; }
</style>
