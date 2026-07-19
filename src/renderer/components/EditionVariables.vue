<script setup lang="ts">
import { onMounted } from 'vue'
import { utiliserSonal } from '../composables/sonal'

/**
 * Fenêtre d'ÉDITION des variables (parité SonalPi : « Ajouter/modifier une
 * variable » — le crayon ouvre une modale, la Table de données reste une grille
 * de SAISIE plein écran). On y définit la STRUCTURE de la base :
 *  - portée (entretien / locuteur) — fixée à la création : la VALEUR vit chez
 *    son propriétaire (meta.valeursGen ou Locuteur.valeursLoc), en changer
 *    orphelinerait les valeurs posées ;
 *  - statut publique/privée (SonalPi : privée = exclue des exports) ;
 *  - modalités (le dictionnaire), à la main ou via un MODÈLE pré-rempli
 *    (sexe, âge, PCS… — les listes de SonalPi `ajoutListeModas`).
 */
defineEmits<{ fermer: [] }>()

const {
  variables,
  messageVar,
  ajouterVariable,
  renommerVariable,
  basculerPriveeVariable,
  supprimerVariable,
  ajouterModalite,
  ajouterModalitesModele,
  renommerModalite,
  supprimerModalite,
} = utiliserSonal()

/** Modèles de modalités pré-remplies — listes SonalPi (gestion_data.js). */
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
  const modele = MODELES.find((m) => m.cle === sel.value)
  sel.value = '' // le select reste une COMMANDE (« modèles… »), pas un état
  if (modele) ajouterModalitesModele(idVar, modele.nom, modele.libs)
}

onMounted(() => {
  // Repartir propre (pas de message de refus d'un passage précédent).
  messageVar.value = null
})
</script>

<template>
  <div class="voile" @click.self="$emit('fermer')">
    <div class="modale-vars">
      <div class="corpus-tete">
        <h3>Édition des variables</h3>
        <button class="mini" title="Variable d'entretien (une valeur par entretien)" @click="ajouterVariable('entretien')">
          + var. d'entretien
        </button>
        <button class="mini" title="Variable de locuteur (une valeur par locuteur)" @click="ajouterVariable('locuteur')">
          + var. de locuteur
        </button>
        <button class="fermer" title="Fermer" @click="$emit('fermer')">✕</button>
      </div>
      <p class="aide-thm">
        Nom, statut (publique = visible dans les exports), modalités · « modèles… » pré-remplit les
        modalités (sexe, âge, PCS…) · sans modalité, la variable se saisit en texte libre dans la table
      </p>

      <p v-if="messageVar" class="msg-thm">{{ messageVar }}</p>

      <p v-if="variables.length === 0" class="vide">
        Aucune variable — « + var. d'entretien » ou « + var. de locuteur ».
      </p>

      <ul class="liste-var">
        <li v-for="v in variables" :key="v.id">
          <div class="var-tete">
            <span
              class="portee"
              :class="v.portee"
              :title="v.portee === 'entretien' ? 'Une valeur par entretien' : 'Une valeur par locuteur'"
            >{{ v.portee === 'entretien' ? 'ent' : 'loc' }}</span>
            <input
              class="nom-var"
              :value="v.lib"
              @keyup.enter="($event.target as HTMLInputElement).blur()"
              @change="renommerVariable(v.id, $event)"
            />
            <button
              class="statut"
              :class="{ privee: v.priv }"
              :title="v.priv ? 'Privée — exclue des exports (clic : rendre publique)' : 'Publique — visible dans les exports (clic : rendre privée)'"
              @click="basculerPriveeVariable(v.id, !v.priv)"
            >
              {{ v.priv ? '🔒 privée' : '🔓 publique' }}
            </button>
            <button class="x" title="Supprimer la variable" @click="supprimerVariable(v.id)">✕</button>
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
              <button class="x-mod" title="Supprimer la modalité" @click="supprimerModalite(v.id, m.id)">✕</button>
            </li>
          </ul>
          <div class="actions-mod">
            <button class="mini" @click="ajouterModalite(v.id)">+ modalité</button>
            <select class="modeles" title="Ajouter les modalités d'un modèle pré-rempli" @change="appliquerModele(v.id, $event)">
              <option value="" selected>modèles…</option>
              <option v-for="m in MODELES" :key="m.cle" :value="m.cle">{{ m.nom }}</option>
            </select>
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
  background: rgba(20, 24, 20, 0.35);
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
  border: 1px solid #d8ddd8;
  border-radius: 10px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
  padding: 0.8rem 1rem 1rem;
}
/* .corpus-tete/.mini/.aide-thm/.msg-thm/.vide/.x : styles GLOBAUX (base.css). */
.corpus-tete {
  gap: 0.5rem;
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
.nom-var {
  flex: 1;
  min-width: 0;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 0.15rem 0.35rem;
  font-size: 0.82rem;
}
/* Statut publique/privée (SonalPi) : bascule à deux états. */
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
/* Modalités en LIGNES (code d'export + libellé), comme le dictionnaire SonalPi —
   les libellés longs (PCS…) ont la place, contrairement à des puces. */
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
  gap: 0.4rem;
  margin: 0.3rem 0 0 1.3rem;
}
.modeles {
  border: 1px solid #ccc;
  border-radius: 5px;
  font-size: 0.72rem;
  padding: 0.1rem 0.2rem;
  color: #666;
  background: #fff;
  max-width: 12rem;
}
</style>
