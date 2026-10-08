import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as attendre } from "node:timers/promises";
import { promisify } from "node:util";
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const executerFichier = promisify(execFile);

type NomBanc = "gitlab" | "nextcloud-a" | "nextcloud-b";

interface DefinitionBanc {
  nom: NomBanc;
  libelle: string;
  delaiMs: number;
  sonder: (signal: AbortSignal) => Promise<boolean>;
  demarrer: (signal: AbortSignal) => Promise<void>;
}

interface ResultatBanc {
  nom: NomBanc;
  etat: "deja-operationnel" | "demarre";
  attenteMs: number;
}

interface DetailsBancs {
  resultats: ResultatBanc[];
}

function erreurAnnulation(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("Opération annulée.");
}

async function executer(
  commande: string,
  argumentsCommande: string[],
  signal: AbortSignal,
  cwd: string,
): Promise<void> {
  try {
    await executerFichier(commande, argumentsCommande, {
      cwd,
      signal,
      timeout: 120_000,
      maxBuffer: 64 * 1024,
    });
  } catch (erreur) {
    const execution = erreur as Error & { stdout?: string; stderr?: string };
    const sortie = [execution.stdout, execution.stderr].filter(Boolean).join("\n").trim();
    throw new Error(
      `Échec de ${commande} ${argumentsCommande.join(" ")}${sortie ? ` :\n${sortie}` : ""}`,
      { cause: erreur },
    );
  }
}

function lireVariables(contenu: string): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const ligne of contenu.split(/\r?\n/)) {
    const correspondance = ligne.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!correspondance) continue;
    let valeur = correspondance[2].trim();
    if (
      valeur.length >= 2 &&
      ((valeur.startsWith('"') && valeur.endsWith('"')) ||
        (valeur.startsWith("'") && valeur.endsWith("'")))
    ) {
      valeur = valeur.slice(1, -1);
    }
    variables[correspondance[1]] = valeur;
  }
  return variables;
}

async function configurationGitLab(): Promise<{ url: string; ca: Buffer }> {
  const repertoire = process.env.SONAL_GITLAB_BENCH_DIR ?? join(homedir(), "TestGitlabLocal");
  const variables = lireVariables(await readFile(join(repertoire, "qualification.env"), "utf8"));
  if (!variables.GITLAB_URL || !variables.GITLAB_CA) {
    throw new Error("Le banc GitLab ne fournit pas GITLAB_URL et GITLAB_CA.");
  }
  return {
    url: new URL("/users/sign_in", variables.GITLAB_URL).toString(),
    ca: await readFile(variables.GITLAB_CA),
  };
}

async function requete(
  url: string,
  signal: AbortSignal,
  ca?: Buffer,
): Promise<{ statut: number; corps: string }> {
  const moduleHttp = url.startsWith("https:") ? await import("node:https") : await import("node:http");
  return new Promise((resoudre, rejeter) => {
    let corps = "";
    const requeteHttp = moduleHttp.request(url, { method: "GET", ca, signal }, (reponse) => {
      reponse.setEncoding("utf8");
      reponse.on("data", (fragment: string) => {
        if (corps.length < 16 * 1024) corps += fragment;
      });
      reponse.on("end", () => resoudre({ statut: reponse.statusCode ?? 0, corps }));
    });
    requeteHttp.setTimeout(2_000, () => requeteHttp.destroy(new Error("Délai de sonde dépassé.")));
    requeteHttp.on("error", rejeter);
    requeteHttp.end();
  });
}

async function sonderNextcloud(url: string, signal: AbortSignal): Promise<boolean> {
  try {
    const reponse = await requete(url, signal);
    if (reponse.statut !== 200) return false;
    const etat = JSON.parse(reponse.corps) as {
      installed?: boolean;
      maintenance?: boolean;
      needsDbUpgrade?: boolean;
    };
    return etat.installed === true && etat.maintenance === false && etat.needsDbUpgrade === false;
  } catch (erreur) {
    if (signal.aborted) throw erreurAnnulation(signal);
    return false;
  }
}

async function sonderGitLab(signal: AbortSignal): Promise<boolean> {
  const configuration = await configurationGitLab();
  try {
    const reponse = await requete(configuration.url, signal, configuration.ca);
    return reponse.statut >= 200 && reponse.statut < 400;
  } catch (erreur) {
    if (signal.aborted) throw erreurAnnulation(signal);
    return false;
  }
}

async function attendreDisponibilite(
  banc: DefinitionBanc,
  signal: AbortSignal,
): Promise<number> {
  const debut = Date.now();
  while (Date.now() - debut < banc.delaiMs) {
    if (await banc.sonder(signal)) return Date.now() - debut;
    await attendre(1_000, undefined, { signal });
  }
  throw new Error(`${banc.libelle} n'est pas opérationnel après ${banc.delaiMs / 1_000} secondes.`);
}

function definitions(racineProjet: string): Record<NomBanc, DefinitionBanc> {
  return {
    gitlab: {
      nom: "gitlab",
      libelle: "GitLab",
      delaiMs: 300_000,
      sonder: sonderGitLab,
      demarrer: (signal) =>
        executer("docker", ["start", "gitlab-qualification"], signal, racineProjet),
    },
    "nextcloud-a": {
      nom: "nextcloud-a",
      libelle: "Nextcloud A",
      delaiMs: 180_000,
      sonder: (signal) => sonderNextcloud("http://127.0.0.1:8080/status.php", signal),
      demarrer: (signal) => executer("npm", ["run", "nc:up"], signal, racineProjet),
    },
    "nextcloud-b": {
      nom: "nextcloud-b",
      libelle: "Nextcloud B",
      delaiMs: 180_000,
      sonder: (signal) => sonderNextcloud("http://127.0.0.1:8081/status.php", signal),
      demarrer: (signal) => executer("npm", ["run", "nc-b:up"], signal, racineProjet),
    },
  };
}

const preparerBancsDocker = defineTool({
  name: "preparer_bancs_docker",
  label: "Préparer les bancs Docker",
  description:
    "Vérifie et prépare les bancs Docker GitLab et Nextcloud du projet. Utilise toujours cet outil avant les tests concernés, à la place de docker start, de npm run nc:up et des boucles de readiness maison. Il sonde d'abord le service réel et retourne immédiatement s'il est déjà opérationnel. Sinon, il démarre uniquement le banc demandé, sans pull ni provisioning, puis attend une URL fiable.",
  promptSnippet: "Préparer rapidement les bancs Docker locaux avant leurs tests",
  promptGuidelines: [
    "Avant un test GitLab ou Nextcloud réel, appelle preparer_bancs_docker plutôt que de lancer Docker et d'écrire une boucle d'attente avec bash.",
  ],
  parameters: Type.Object({
    bancs: Type.Array(
      Type.Union([
        Type.Literal("gitlab"),
        Type.Literal("nextcloud-a"),
        Type.Literal("nextcloud-b"),
      ]),
      {
        description: "Bancs nécessaires au test à exécuter.",
        minItems: 1,
        uniqueItems: true,
      },
    ),
  }),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },

  async execute(_toolCallId, parametres, signal, onUpdate, contexte) {
    const signalExecution = signal ?? new AbortController().signal;
    const catalogue = definitions(contexte.cwd);
    const bancs = parametres.bancs.map((nom) => catalogue[nom]);
    const disponibles = await Promise.all(bancs.map((banc) => banc.sonder(signalExecution)));
    const resultats: ResultatBanc[] = [];
    const aDemarrer: DefinitionBanc[] = [];

    for (const [index, banc] of bancs.entries()) {
      if (disponibles[index]) {
        resultats.push({ nom: banc.nom, etat: "deja-operationnel", attenteMs: 0 });
      } else {
        aDemarrer.push(banc);
      }
    }

    if (aDemarrer.length > 0) {
      onUpdate?.({
        content: [{
          type: "text",
          text: `Démarrage nécessaire : ${aDemarrer.map((banc) => banc.libelle).join(", ")}.`,
        }],
        details: { resultats } satisfies DetailsBancs,
      });
      for (const banc of aDemarrer) await banc.demarrer(signalExecution);
      const attentes = await Promise.all(
        aDemarrer.map(async (banc) => ({
          banc,
          attenteMs: await attendreDisponibilite(banc, signalExecution),
        })),
      );
      for (const { banc, attenteMs } of attentes) {
        resultats.push({ nom: banc.nom, etat: "demarre", attenteMs });
      }
    }

    const ordre = new Map(bancs.map((banc, index) => [banc.nom, index]));
    resultats.sort((a, b) => (ordre.get(a.nom) ?? 0) - (ordre.get(b.nom) ?? 0));
    const lignes = resultats.map((resultat) => {
      const banc = catalogue[resultat.nom];
      return resultat.etat === "deja-operationnel"
        ? `${banc.libelle} : déjà opérationnel, aucune commande Docker exécutée.`
        : `${banc.libelle} : démarré et opérationnel après ${(resultat.attenteMs / 1_000).toFixed(1)} s.`;
    });

    return {
      content: [{ type: "text", text: lignes.join("\n") }],
      details: { resultats } satisfies DetailsBancs,
    };
  },
});

export default function (pi: ExtensionAPI) {
  pi.registerTool(preparerBancsDocker);
}
