<script setup lang="ts">
/** Guide de préparation d'un projet GitLab avant sa première ouverture dans Sonal. */
const emit = defineEmits<{ (e: 'fermer'): void }>()
</script>

<template>
  <Teleport to="body">
    <div class="voile-aide" @click.self="emit('fermer')">
      <section class="aide-gitlab-fenetre" role="dialog" aria-modal="true" aria-labelledby="titre-aide-gitlab">
        <header class="entete-aide">
          <svg width="28" height="28" viewBox="0 0 380 380" aria-hidden="true">
            <path fill="#e24329" d="M282.83 170.73l-.27-.69-26.14-68.22a6.81 6.81 0 00-2.69-3.24 7 7 0 00-8 .43 7 7 0 00-2.32 3.52l-17.65 54h-71.47l-17.65-54a6.86 6.86 0 00-2.32-3.52 7 7 0 00-8-.43 6.87 6.87 0 00-2.69 3.24L97.44 170l-.26.69a48.54 48.54 0 0016.1 56.1l40.15 30 31.7 24a8.07 8.07 0 009.19 0l31.7-24 40.16-30a48.56 48.56 0 0016.09-56.1z" />
            <path fill="#fc6d26" d="M282.83 170.73a88.3 88.3 0 00-35.42 15.11L190 229.25l36.57 27.64 40.16-30a48.56 48.56 0 0016.1-56.16z" />
            <path fill="#fca326" d="M153.43 256.89l31.7 23.97a8.07 8.07 0 009.19 0l31.7-23.97L190 229.25z" />
            <path fill="#fc6d26" d="M132.58 185.84A88.19 88.19 0 0097.44 170l-.26.69a48.54 48.54 0 0016.19 56.17l40.06 30L190 229.21z" />
          </svg>
          <h2 id="titre-aide-gitlab">Préparer GitLab pour Sonal</h2>
          <button class="fermer-aide" aria-label="Fermer l’aide" @click="emit('fermer')">×</button>
        </header>

        <div class="contenu-aide">
          <p class="introduction">
            Ces opérations se font dans l’interface web de votre instance GitLab.
            Le responsable du projet les réalise une seule fois pour toute l’équipe.
          </p>

          <h3>Configuration du projet</h3>

          <article class="etape">
            <div class="numero optionnel">1</div>
            <div>
              <h4>Créer un groupe pour l’équipe <span>Optionnel</span></h4>
              <p>
                Un groupe permet de gérer les membres une seule fois pour plusieurs projets.
                Dans GitLab, choisissez <b>New group → Create group</b>, puis une visibilité privée.
              </p>
            </div>
          </article>

          <article class="etape">
            <div class="numero">2</div>
            <div>
              <h4>Créer un projet privé et l’initialiser</h4>
              <ul>
                <li>Choisissez <b>New project → Create blank project</b>.</li>
                <li>Sélectionnez la visibilité <b>Private</b>.</li>
                <li>Cochez <b>Initialize repository with a README</b>.</li>
              </ul>
              <p class="avertissement">
                Un dépôt initialisé est nécessaire pour disposer d’une branche par défaut.
                Un projet public exposerait les données du corpus.
              </p>
            </div>
          </article>

          <article class="etape">
            <div class="numero">3</div>
            <div>
              <h4>Donner accès aux collaborateurs</h4>
              <ul>
                <li>Invitez-les depuis <b>Manage → Members</b>.</li>
                <li>Attribuez au minimum le rôle <b>Developer</b>.</li>
                <li>
                  Si la branche principale est protégée, autorisez les Developers à pousser
                  depuis <b>Settings → Repository → Protected branches</b>.
                </li>
              </ul>
            </div>
          </article>

          <h3>Connexion de Sonal</h3>

          <article class="etape">
            <div class="numero">4</div>
            <div>
              <h4>Choisir l’authentification</h4>
              <p>
                Utilisez OAuth par défaut. Si l’instance ne permet pas de créer une application
                OAuth, choisissez <b>Jeton d’accès personnel</b> dans Sonal et créez ce jeton dans
                vos préférences GitLab avec le scope <code>api</code>.
              </p>
              <p>
                Pour OAuth, utilisez le Client ID Sonal fourni par votre institution. Sinon, une
                personne crée une application OAuth GitLab, puis partage son <b>Application ID</b>
                avec l’équipe. Ce Client ID est public et ne constitue pas un mot de passe.
              </p>
              <ul>
                <li><b>Name :</b> <code>Sonal</code>.</li>
                <li><b>Redirect URI :</b> <code>http://127.0.0.1:7474/callback</code>.</li>
                <li><b>Confidential :</b> désactivé.</li>
                <li><b>PKCE :</b> activé lorsque GitLab propose ce réglage.</li>
                <li><b>Scopes :</b> uniquement <code>api</code>.</li>
              </ul>
              <p class="information">
                Le secret client éventuellement affiché par GitLab n’est pas utilisé par Sonal.
              </p>
            </div>
          </article>

          <article class="etape">
            <div class="numero">5</div>
            <div>
              <h4>Copier les informations utiles</h4>
              <div class="recapitulatif">
                <div>
                  <b>URL du projet</b>
                  <code>https://gitlab.exemple.fr/equipe/mon-corpus</code>
                </div>
                <div>
                  <b>Accès</b>
                  <span>Client ID OAuth, ou jeton personnel si OAuth est indisponible.</span>
                </div>
              </div>
              <p>
                Dans Sonal, renseignez ces valeurs puis utilisez le bouton unique de création
                ou d’ouverture. Avec OAuth, le navigateur s’ouvrira pour la connexion et le
                consentement. Un jeton personnel est vérifié directement par Sonal.
              </p>
            </div>
          </article>

          <p class="information finale">
            Sonal place toujours le corpus à la racine du projet. Les fichiers audio ne sont pas
            envoyés dans GitLab : un dossier Nextcloud/WebDAV distinct peut être configuré pendant
            la création du corpus ou plus tard. Aucun réglage Git LFS n’est nécessaire.
          </p>
        </div>

        <footer>
          <button class="bouton-fermer" @click="emit('fermer')">J’ai compris</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.voile-aide {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3vh 3vw;
  background: rgba(25, 30, 36, 0.62);
}
.aide-gitlab-fenetre {
  display: flex;
  flex-direction: column;
  width: min(780px, 96vw);
  max-height: 94vh;
  overflow: hidden;
  border-radius: 10px;
  background: #f6f8fa;
  color: #24292f;
  box-shadow: 0 18px 55px rgba(0, 0, 0, 0.35);
}
.entete-aide {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.9rem 1.2rem;
  border-bottom: 1px solid #d0d7de;
  background: #fff;
}
.entete-aide h2 {
  flex: 1;
  margin: 0;
  font-size: 1.05rem;
}
.fermer-aide {
  border: 0;
  background: transparent;
  color: #57606a;
  cursor: pointer;
  font-size: 1.7rem;
  line-height: 1;
}
.contenu-aide {
  overflow: auto;
  padding: 1.25rem 1.5rem;
}
.introduction,
.etape {
  border: 1px solid #d0d7de;
  border-radius: 8px;
  background: #fff;
}
.introduction {
  margin: 0 0 1.3rem;
  padding: 1rem 1.2rem;
  color: #57606a;
  font-size: 0.88rem;
}
h3 {
  margin: 1.5rem 0 0.8rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid #d0d7de;
  font-size: 1rem;
}
.etape {
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 0.85rem;
  margin-bottom: 0.8rem;
  padding: 1rem 1.15rem;
}
.numero {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 27px;
  height: 27px;
  border-radius: 50%;
  background: #fc6d26;
  color: #fff;
  font-size: 0.8rem;
  font-weight: 700;
}
.numero.optionnel {
  background: #8c959f;
}
h4 {
  margin: 0 0 0.55rem;
  font-size: 0.92rem;
}
h4 span {
  margin-left: 0.4rem;
  padding: 0.1rem 0.45rem;
  border: 1px solid #d0d7de;
  border-radius: 10px;
  color: #6e7781;
  font-size: 0.62rem;
  font-weight: 600;
  text-transform: uppercase;
}
p,
ul {
  margin: 0.35rem 0;
  color: #57606a;
  font-size: 0.82rem;
}
ul {
  padding-left: 1.2rem;
}
li {
  margin: 0.25rem 0;
}
code {
  padding: 0.08rem 0.3rem;
  border: 1px solid #d0d7de;
  border-radius: 4px;
  background: #f6f8fa;
  color: #0550ae;
  font-size: 0.76rem;
}
.avertissement,
.information {
  margin-top: 0.65rem;
  padding: 0.65rem 0.8rem;
  border-left: 3px solid #d4a72c;
  border-radius: 0 4px 4px 0;
  background: #fff8c5;
}
.information {
  border-left-color: #54aeff;
  background: #ddf4ff;
}
.recapitulatif {
  display: grid;
  gap: 0.45rem;
  margin: 0.6rem 0;
}
.recapitulatif div {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 0.6rem;
  align-items: center;
  padding: 0.5rem 0.65rem;
  border: 1px solid #d8dee4;
  border-radius: 5px;
  font-size: 0.78rem;
}
.finale {
  margin-top: 1rem;
}
footer {
  display: flex;
  justify-content: flex-end;
  padding: 0.8rem 1.2rem;
  border-top: 1px solid #d0d7de;
  background: #fff;
}
.bouton-fermer {
  padding: 0.45rem 0.9rem;
  border: 0;
  border-radius: 6px;
  background: #fc6d26;
  color: #fff;
  cursor: pointer;
  font-weight: 600;
}
</style>
