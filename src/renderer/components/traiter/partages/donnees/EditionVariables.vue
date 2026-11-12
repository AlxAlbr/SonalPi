<script setup lang="ts">
import { ref, onMounted, nextTick, computed } from 'vue'
import { utiliserSonal } from '../../../../composables/sonal'
import { operationGlobaleEnCours } from '../../../../operationGlobaleCorpus'
import DialogueSuppression from '../DialogueSuppression.vue'

/**
 * Fenêtre d'ÉDITION des variables : « Ajouter/modifier une variable » — le
 * crayon ouvre une modale, la Table de données reste une grille de SAISIE plein
 * écran. On y définit la STRUCTURE de la base :
 *  - portée (entretien / locuteur) — fixée à la création : la VALEUR vit chez
 *    son propriétaire (meta.valeursGen ou Locuteur.valeursLoc), en changer
 *    orphelinerait les valeurs posées ;
 *  - statut publique/privée (privée = exclue des exports) ;
 *  - modalités (le dictionnaire), à la main, via un MODÈLE pré-rempli (intégré
 *    ou importé — « Mes modèles »), ou par export/import d'un fichier JSON.
 *  Supprimer une variable ou une modalité demande toujours une confirmation, qui signale ses valeurs saisies.
 *  Ces valeurs peuvent être effacées avec elle ; les règles des cas, elles, empêchent la suppression.
 */
defineEmits<{ fermer: [] }>()

/** Portée ciblée (crayon du panneau Données d’un entretien) : la fenêtre ne
 *  montre QUE les variables de cette portée et ne propose que le bouton
 *  « + var. » correspondant — comme les autres crayons de l’app, elle ouvre
 *  l’édition SANS créer quoi que ce soit. Sans portée (table de données), tout
 *  est visible. */
const props = defineProps<{ portee?: 'entretien' | 'locuteur' }>()

const {
  variables,
  messageVar,
  modelesUtilisateur,
  lireModelesUtilisateur,
  importerModeleUtilisateur,
  ajouterVariable,
  renommerVariable,
  basculerPriveeVariable,
  ajouterModalite,
  ajouterModalitesModele,
  renommerModalite,
  donneeASupprimer,
  demanderSuppressionDonnee,
  confirmerSuppressionDonnee,
} = utiliserSonal()

const valeursTotal = computed(() => (donneeASupprimer.value ? donneeASupprimer.value.n + donneeASupprimer.value.autres : 0))
const suppressionPossible = computed(() => !!donneeASupprimer.value
  && donneeASupprimer.value.cas === 0 && !(donneeASupprimer.value.autres > 0 && donneeASupprimer.value.partage))

/** Modèles de modalités pré-remplies INTÉGRÉS. Les modèles IMPORTÉS vivent à
 *  part (`modelesUtilisateur`, registre du profil) et sont proposés dans le
 *  même sélecteur. */
const MODELES: { cle: string; nom: string; libs: string[] }[] = [
  { cle: 'sexe', nom: 'Sexe', libs: ['Homme', 'Femme', 'Autre'] },
  {
    cle: 'age5',
    nom: 'Age en classes de 5',
    libs: ['Moins de 20 ans', '20-24 ans', '25-29 ans', '30-34 ans', '35-39 ans', '40-44 ans', '45-49 ans', '50-54 ans', '55-59 ans', '60-64 ans', '65 ans et plus'],
  },
  {
    cle: 'age10',
    nom: 'Age en classes de 10',
    libs: ['Moins de 18 ans', '18-24 ans', '25-34 ans', '35-44 ans', '45-54 ans', '55-64 ans', '65 ans et plus'],
  },
  {
    cle: 'pcs1',
    nom: 'PCS Niveau 1',
    libs: [
      '1 - Agriculteurs exploitants',
      '2 - Artisans, commerçants et chefs d’entreprise',
      '3 - Cadres et professions intellectuelles supérieures',
      '4 - Professions intermédiaires',
      '5 - Employés',
      '6 - Ouvriers',
      '7 - Autre',
    ],
  },
  {
    cle: 'pcs2',
    nom: 'PCS Niveau 2',
    libs: [
      '10 - Exploitants de l’agriculture, sylviculture, pêche et aquaculture',
      '21 - Artisans',
      '22 - Commerçants et assimilés',
      '23 - Chefs d’entreprise de plus de 10 personnes',
      '31 - Professions libérales',
      '33 - Cadres administratifs et techniques de la fonction publique',
      '34 - Professeurs et professions scientifiques supérieures',
      '35 - Professions de l’information, de l’art et des spectacles',
      '37 - Cadres des services administratifs et commerciaux d’entreprise',
      '38 - Ingénieurs et cadres techniques d’entreprise',
      '42 - Professions de l’enseignement primaire et professionnel, de la formation continue et du sport',
      '43 - Professions intermédiaires de la santé et du travail social',
      '44 - Ministres du culte et religieux consacrés',
      '45 - Professions intermédiaires de la fonction publique (administration, sécurité)',
      '46 - Professions intermédiaires administratives et commerciales des entreprises',
      '47 - Techniciens',
      '48 - Agents de maîtrise (hors maîtrise administrative)',
      '52 - Employés administratifs de la fonction publique, agents de service et auxiliaires de santé',
      '53 - Policiers, militaires, pompiers, agents de sécurité privée',
      "54 - Employés administratifs d'entreprise",
      '55 - Employés de commerce',
      '56 - Personnels des services directs aux particuliers',
      '62 - Ouvriers qualifiés de type industriel',
      '63 - Ouvriers qualifiés de type artisanal',
      '64 - Conducteurs de véhicules de transport, chauffeurs-livreurs, coursiers',
      '65 - Conducteurs d’engins, caristes, magasiniers et ouvriers du transport (non routier)',
      '67 - Ouvriers peu qualifiés de type industriel',
      '68 - Ouvriers peu qualifiés de type artisanal',
      '69 - Ouvriers agricoles, des travaux forestiers, de la pêche et de l’aquaculture',
    ],
  },
  {
    cle: 'statut',
    nom: "Statut d'activité",
    libs: ['Étudiant', 'Travailleur à temps plein', 'Travailleur à temps partiel', 'Chômeur', 'Retraité', 'Autre'],
  },
]

function appliquerModele(idVar: string, evt: Event) {
  const sel = evt.target as HTMLSelectElement
  const modele = modelesTous.value.find((m) => m.cle === sel.value)
  sel.value = '' // le select reste une COMMANDE (« modèles… »), pas un état
  if (modele) ajouterModalitesModele(idVar, modele.nom, modele.libs)
}

/** Modèles proposés au sélecteur : les INTÉGRÉS et les IMPORTÉS (registre du
 *  profil) normalisés sur le même gabarit — les importés portent une clé
 *  `user:…` (jamais de collision avec les clés intégrées). */
const modelesTous = computed(() => [
  ...MODELES.map((m) => ({ cle: m.cle, nom: m.nom, libs: m.libs, perso: false })),
  ...modelesUtilisateur.value.map((m) => ({
    cle: `user:${m.nom}`,
    nom: m.nom,
    libs: m.modalites,
    perso: true,
  })),
])
const modelesIntegres = computed(() => modelesTous.value.filter((m) => !m.perso))
const modelesPerso = computed(() => modelesTous.value.filter((m) => m.perso))

// UX de création : la variable neuve est AUTO-FOCUSÉE et son texte
// présélectionné, pour nommer directement sans effacer « Nouvelle variable ».
const nouveauId = ref<string | null>(null)
const variablesListees = computed(() =>
  props.portee ? variables.value.filter((v) => v.portee === props.portee) : variables.value,
)
// Registre des champs nom RENDUS (rempli à chaque rendu, vidé au démontage) :
// la liste se rafraîchit avant que creerVariable pose nouveauId, donc le focus
// se pose APRÈS nextTick, sur l'élément déjà présent — jamais au montage.
const champsNom = new Map<string, HTMLInputElement>()
function noterChampNom(el: HTMLInputElement | null, id: string) {
  if (el) champsNom.set(id, el)
  else champsNom.delete(id)
}
async function creerVariable(portee: 'entretien' | 'locuteur') {
  const id = await ajouterVariable(portee)
  nouveauId.value = id
  await nextTick() // attendre que la ligne (le champ nom) soit rendue
  const el = champsNom.get(id)
  if (el) el.focus() // le @focus du champ sélectionne le texte
  nouveauId.value = null
}

// Export d'un modèle : formulaire inline (nom du modèle) dans la ligne du bas.
const exportPour = ref<string | null>(null) // id de la variable en cours d'export
const nomExport = ref('')
function commencerExport(idVar: string) {
  exportPour.value = idVar
  const v = variables.value.find((x) => x.id === idVar)
  nomExport.value = v?.lib || ''
  // Focus APRÈS le rendu du formulaire (nextTick) — le clic sur le bouton a
  // prêté le focus au bouton lui-même, le champ doit le reprendre.
  void nextTick(() => document.getElementById('nom-export')?.focus())
}
function annulerExport() {
  exportPour.value = null
}
async function confirmerExport() {
  const v = variables.value.find((x) => x.id === exportPour.value)
  const nom = nomExport.value.trim()
  if (!v || !nom) return
  annulerExport()
  const contenu = JSON.stringify(
    { nom, modalites: v.modalites.map((m) => m.lib) },
    null,
    2,
  )
  // Écrit le fichier choisi ; renvoie le chemin ou null si annulé (pas d'erreur).
  await window.sonal.dialog.choisirExport(`${nom}.json`, contenu)
}

/** Import GLOBAL (« Importer un modèle… ») : dialogue JSON → registre du profil
 *  (remplacement par nom) → message de retour dans la ligne du haut. */
async function importerModele() {
  const msg = await importerModeleUtilisateur()
  if (msg) messageVar.value = msg
}

onMounted(() => {
  // Repartir propre (pas de message de refus d'un passage précédent).
  messageVar.value = null
  void lireModelesUtilisateur()
})
</script>

<template>
  <div class="voile" @click.self="$emit('fermer')">
    <div class="modale-vars">
      <div class="corpus-tete">
        <h3>Édition des variables</h3>
        <button
          v-if="!portee || portee === 'entretien'"
          class="mini"
          title="Créer une variable d'entretien (une valeur par entretien)"
          @click="creerVariable('entretien')"
        >
          + var. d'entretien
        </button>
        <button
          v-if="!portee || portee === 'locuteur'"
          class="mini"
          title="Créer une variable de locuteur (une valeur par locuteur)"
          @click="creerVariable('locuteur')"
        >
          + var. de locuteur
        </button>
        <button class="mini" title="Importer un modèle de modalités (JSON) dans « Mes modèles »" @click="importerModele()">
          ⬆ Importer un modèle…
        </button>
        <button class="fermer" title="Fermer" @click="$emit('fermer')">✕</button>
      </div>
      <p class="aide-thm">
        Nom, statut (publique = visible dans les exports), modalités · « modèles… » pré-remplit les
        modalités (intégrés ou importés) · sans modalité, la variable se saisit en texte libre dans la table
        <template v-if="portee">· seules les variables de portée {{ portee }} sont listées</template>
      </p>

      <p v-if="messageVar" class="msg-thm">{{ messageVar }}</p>

      <!-- Confirmation de suppression : les valeurs saisies sont signalées, jamais bloquantes ; les cas, si. -->
      <DialogueSuppression
        :ouvert="!!donneeASupprimer"
        :titre="donneeASupprimer ? `Supprimer ${donneeASupprimer.idMod === undefined ? 'la variable' : 'la modalité'} « ${donneeASupprimer.nom} » ?` : ''"
        :peut-supprimer="suppressionPossible"
        :libelle-supprimer="valeursTotal > 0 ? 'Supprimer quand même' : 'Supprimer'"
        :occupe="operationGlobaleEnCours"
        @confirmer="confirmerSuppressionDonnee"
        @annuler="donneeASupprimer = null"
      >
        <template v-if="donneeASupprimer">
          <p v-if="valeursTotal > 0" class="alerte-usage">
            <span aria-hidden="true">⚠</span>
            <span>
              {{ donneeASupprimer.idMod === undefined ? 'Cette variable a' : 'Cette modalité est choisie dans' }}
              <b>{{ valeursTotal }} valeur(s) saisie(s)</b><template v-if="donneeASupprimer.n > 0 && donneeASupprimer.autres > 0">
                ({{ donneeASupprimer.n }} dans cet entretien, {{ donneeASupprimer.autres }} dans d’autres entretiens)</template><template v-else-if="donneeASupprimer.autres > 0">
                dans le corpus</template>.
              La supprimer efface aussi ces valeurs, qui redeviennent vides — <b>irréversible</b>.
            </span>
          </p>
          <p v-else-if="donneeASupprimer.cas === 0" class="usage-nul">Aucune valeur n’est saisie.</p>
          <p v-if="donneeASupprimer.cas > 0" class="alerte-usage">
            <span aria-hidden="true">⚠</span>
            <span>
              Elle sert aussi à <b>{{ donneeASupprimer.cas }} cas ou famille(s) de cas</b> (règles ou dérivations).
              Retirez d’abord ces usages dans « Organiser & Exporter », onglet Cas : elle ne peut pas être supprimée d’ici.
            </span>
          </p>
          <p v-if="donneeASupprimer.cas === 0 && donneeASupprimer.autres > 0 && donneeASupprimer.partage" class="usage-partage">
            Sur un corpus partagé, une valeur saisie dans d’autres entretiens ne peut pas être effacée d’ici.
            Videz d’abord ces valeurs dans la table de données.
          </p>
        </template>
      </DialogueSuppression>

      <p v-if="variablesListees.length === 0" class="vide">
        <template v-if="portee">Aucune variable de portée {{ portee }} — « + var. de {{ portee }} ».</template>
        <template v-else>Aucune variable — « + var. d'entretien » ou « + var. de locuteur ».</template>
      </p>

      <ul class="liste-var">
        <li v-for="v in variablesListees" :key="v.id">
          <div class="var-tete">
            <span
              class="portee"
              :class="v.portee"
              :title="v.portee === 'entretien' ? 'Une valeur par entretien' : 'Une valeur par locuteur'"
            >{{ v.portee === 'entretien' ? 'ent' : 'loc' }}</span>
            <input
              class="nom-var"
              :ref="(el) => noterChampNom(el as HTMLInputElement | null, v.id)"
              :value="v.lib"
              :title="v.lib"
              @focus="($event.target as HTMLInputElement).select()"
              @keyup.enter="($event.target as HTMLInputElement).blur()"
              @change="renommerVariable(v.id, $event)"
            />
            <select
              class="modeles"
              title="Ajouter les modalités d'un modèle pré-rempli (intégré ou importé)"
              @change="appliquerModele(v.id, $event)"
            >
              <option value="" selected>modèles…</option>
              <optgroup label="Intégrés">
                <option v-for="m in modelesIntegres" :key="m.cle" :value="m.cle">{{ m.nom }}</option>
              </optgroup>
              <optgroup v-if="modelesPerso.length" label="Mes modèles">
                <option v-for="m in modelesPerso" :key="m.cle" :value="m.cle">{{ m.nom }}</option>
              </optgroup>
            </select>
            <button
              class="statut"
              :class="{ privee: v.priv }"
              :title="v.priv ? 'Privée — exclue des exports (clic : rendre publique)' : 'Publique — visible dans les exports (clic : rendre privée)'"
              @click="basculerPriveeVariable(v.id, !v.priv)"
            >
              {{ v.priv ? '🔒 privée' : '🔓 publique' }}
            </button>
            <button class="x" title="Supprimer la variable" :disabled="operationGlobaleEnCours" @click="demanderSuppressionDonnee(v.id)">✕</button>
          </div>
          <p v-if="v.modalites.length === 0" class="note-libre">
            Aucune modalité — saisie en <b>texte libre</b> dans la table (chaque valeur saisie crée sa
            modalité ; « autre… » garde ensuite la saisie libre).
          </p>
          <ul class="liste-mod">
            <li v-for="m in v.modalites" :key="m.id" class="lig-mod">
              <span class="code-mod" title="Code d'export de la modalité">{{ m.mExport }}</span>
              <input
                class="lib-mod"
                :value="m.lib"
                @keyup.enter="($event.target as HTMLInputElement).blur()"
                @change="renommerModalite(v.id, m.id, $event)"
              />
              <button class="x-mod" title="Supprimer la modalité" :disabled="operationGlobaleEnCours" @click="demanderSuppressionDonnee(v.id, m.id)">✕</button>
            </li>
          </ul>
          <div class="actions-mod">
            <button class="mini" @click="ajouterModalite(v.id)">+ modalité</button>
            <button
              class="mini export"
              title="Exporter le nom et les modalités de cette variable comme modèle (JSON)"
              :disabled="v.modalites.length === 0"
              @click="commencerExport(v.id)"
            >⤓ Exporter ce  modèle</button>
            <span v-if="exportPour === v.id" class="export-form">
              <label for="nom-export">Nom du modèle :</label>
              <input
                id="nom-export"
                v-model="nomExport"
                placeholder="ex. Niveau d'études"
                @keyup.enter="confirmerExport()"
                @keyup.esc="annulerExport()"
              />
              <button class="mini" @click="confirmerExport()">Exporter</button>
              <button class="mini" @click="annulerExport()">Annuler</button>
            </span>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
/* .voile/.modale-* : même idiome que EditionThemes (fenêtre au-dessus de la vue). */
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
.modale-vars,
.modale-vars * {
  box-sizing: border-box;
}
.modale-vars {
  width: min(620px, 92vw);
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
  flex-wrap: wrap; /* l'en-tête porte désormais 3 boutons + le titre */
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
.liste-var {
  list-style: none;
  margin: 0.3rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.liste-var > li {
  border: 1px solid #e5e5ef;
  border-radius: 6px;
  padding: 0.4rem 0.45rem;
  background: #fafafe;
}
.var-tete {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.portee {
  font-size: 0.62rem;
  font-weight: 700;
  padding: 0.05rem 0.3rem;
  border-radius: 3px;
  color: #fff;
  flex: none;
}
.portee.entretien {
  background: #5c6bc0;
}
.portee.locuteur {
  background: #8a6d3b;
}
/* Nom de la variable : largeur RÉDUITE pour laisser la place au sélecteur
 * « modèles… » qui suit — un nom trop long se TRONQUE (ellipsis, supporté par
 * Chromium sur les inputs) et s'affiche en entier au survol (title) ou au
 * focus (sélection). */
.nom-var {
  flex: 1 1 6rem;
  min-width: 0;
  max-width: 13rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.15rem 0.35rem;
  font-size: 0.82rem;
  text-overflow: ellipsis;
}
/* Statut publique/privée : bascule à deux états. */
.statut {
  flex: none;
  border: 1px solid #ccc;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  font-size: 0.68rem;
  padding: 0.1rem 0.4rem;
  color: #555;
}
.statut.privee {
  border-color: #b06e0f;
  background: #fff8ec;
  color: #b06e0f;
}
/* Variable sans modalité = saisie libre dans la table (l'affordance est ICI,
   au moment où l'utilisateur décide de ne pas en définir). */
.note-libre {
  margin: 0.3rem 0 0 1.3rem;
  font-size: 0.7rem;
  color: #999;
  font-style: italic;
}
/* Modalités en LIGNES (code d'export + libellé) : les libellés longs (PCS…)
   ont la place, contrairement à des puces. */
.liste-mod {
  list-style: none;
  margin: 0.35rem 0 0;
  padding: 0 0 0 1.3rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.lig-mod {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.code-mod {
  font-family: monospace;
  font-size: 0.7rem;
  color: #888;
  width: 1.6rem;
  flex: none;
  text-align: right;
}
.lib-mod {
  flex: 1;
  min-width: 0;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 0.1rem 0.3rem;
  font-size: 0.75rem;
  background: #fff;
}
.x-mod {
  border: none;
  background: none;
  color: #c33;
  cursor: pointer;
  font-size: 0.7rem;
  flex: none;
}
.actions-mod {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0.3rem 0 0 1.3rem;
}
/* Le sélecteur « modèles… » vit dans la ligne du haut, à côté du nom : il ne
 * pousse pas le reste de la ligne (flex: none) et reste plafonné à la largeur
 * de « Age en classes de 10 » (le plus long des intégrés) — au-delà, le select
 * tronque le libellé choisi. */
.modeles {
  border: 1px solid #ccc;
  border-radius: 5px;
  font-size: 0.72rem;
  padding: 0.1rem 0.2rem;
  color: #666;
  background: #fff;
  flex: none;
  min-width: 7rem;
  max-width: 10.5rem;
}
/* Export d'un modèle : bouton grisé sans modalités, formulaire inline qui prend
 * la place du bouton le temps de la saisie (Entrée = exporter, Échap = quitter). */
.mini.export:disabled {
  opacity: 0.5;
  cursor: default;
}
.export-form {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.export-form label {
  font-size: 0.72rem;
  color: #666;
}
.export-form input {
  width: 11rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.12rem 0.35rem;
  font-size: 0.75rem;
}
</style>
