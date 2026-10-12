import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CorpusStore } from '../../src/main/corpusStore'
import { CorrespondancesWebDAV } from '../../src/main/distant/correspondancesWebDAV'
import { ProviderPutConditionnel } from '../../src/main/verrous/providerPutConditionnel'
import { ProviderFilesLock } from '../../src/main/verrous/providerFilesLock'
import { empreinteCorrespondance, empreinteDefinitionsCorrespondance } from '../../src/main/tablesCorrespondance'
import { decoderCorrespondances, preparerImportCorrespondances } from '../../src/shared/corpus/importCorrespondances'
import { preparerCiblesCorrespondances } from '../../src/shared/corpus/importCorrespondancesEntretiens'
import { corpusDistantValide, entretienDistantValide } from '../webdav/fixturesCorpusDistant'
import type { ClientWebDAV } from '../../src/main/webdav/client'
import type { InstantaneOperationTheme } from '../../src/main/operationsThemes'

export const documentsImportWebDAV = [{ nom: 'table.json', texte: JSON.stringify({ format: 'sonalpi-correspondances', version: 2, correspondances: [
  { nature: 'texte', portee: 'texte-local', entite: ['Alias sans occurrence', 'Autre graphie'], pseudos: ['Lieu témoin'], categorie: 'LOC', etatLocal: 'declaration' },
  { nature: 'locuteur', nom: 'Karine', pseudo: 'Claire', origines: [{ entretienId: 'etranger', locuteurIndex: 99, pseudoEtat: 'confirme' }] },
] }) }]
export const corpusImportWebDAV = () => corpusDistantValide(['e1', 'e2'])
export const entretienImportWebDAV = () => entretienDistantValide({
  locuteurs: [{ index: 1, nom: 'Karine', valeursLoc: {}, personneRef: 'personne-synthetique' }],
  corpsTexte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Texte intact.' }] }] },
})
export function serviceImportWebDAV(client: ClientWebDAV, dir: string, natif: boolean, sessions: string[] = [], miroir = (_chemin: string, _contenu: string, _etag: string) => {}) {
  writeFileSync(join(dir, 'corpus.json'), corpusDistantValide([]))
  const store = new CorpusStore(dir); store.lectureSeule = true
  const identite = { userId: 'max', machineId: 'banc-correspondances', sessionId: randomUUID() }
  const creer = () => new CorrespondancesWebDAV({ client, store, dirLocal: dir, sessionsLocales: () => sessions, miroir,
    verrouCorpus: () => ({ provider: new ProviderPutConditionnel(client, () => identite), chemin: 'verrous/corpus.lock.json' }),
    verrouEntretien: (id) => ({ provider: natif ? new ProviderFilesLock(client, () => identite) : new ProviderPutConditionnel(client, () => identite), chemin: natif ? `entretiens/${id}.json` : `verrous/${id}.lock.json` }),
  })
  return { service: creer(), creer, store }
}
export function preparationImportWebDAV(store: CorpusStore, instantane: InstantaneOperationTheme, documents = documentsImportWebDAV) {
  const lignes = preparerImportCorrespondances(decoderCorrespondances(documents), Object.values(instantane.corpus.reglesAnon))
  const cibles = preparerCiblesCorrespondances({ lignes }, instantane.corpus, Object.fromEntries(instantane.entretiens.flatMap((e) => e.ok ? [[e.id, e.data]] : [])))
  return { store, lignes, cibles, choix: {}, empreinte: empreinteDefinitionsCorrespondance(instantane.corpus.reglesAnon),
    empreinteCorpus: empreinteCorrespondance(instantane.corpus),
    empreintesEntretiens: Object.fromEntries(instantane.entretiens.flatMap((e) => e.ok ? [[e.id, empreinteCorrespondance(e.avant)]] : [])),
    choixCibles: cibles.map((c) => ({ cibleId: c.id, action: c.actionsPossibles[0], ...(c.nature === 'locuteur' ? { etat: 'confirme' as const } : {}) })),
  }
}
