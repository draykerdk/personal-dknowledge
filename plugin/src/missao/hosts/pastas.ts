/**
 * As pastas do cofre que a Missão lê e cria: os tipos de recurso que já existem em
 * `500 - RESOURCES` (o destino Recursos da triagem) e a pasta que falta antes de mover ou
 * criar uma nota (o `garantirPasta` das gravações, que o quadro dá).
 *
 * Por quê: a aposentadoria do painel antigo (inventário de 02/11/2026, 2.12): as duas funções
 * moravam em `ui/mission/panelInbox.ts`, a triagem do Mission Control antigo, e a Missão as
 * importava de lá. Mudaram de casa, sem mudar o que fazem; o painel antigo as reexporta
 * enquanto o código dele existir.
 *
 * Prova: tests/ui/missionInboxContract.test.ts ("pastas mortas", os tipos de recurso).
 */
import { TFolder, type App } from 'obsidian';
import { RESOURCES_FOLDER, isDeadFolder, resourceTypes } from '../../engine/inboxRules';

/**
 * O que faz: os tipos de recurso do cofre (as subpastas de `500 - RESOURCES`), sem as ocultas
 * e sem as mortas, em ordem.
 * Entra → sai: o app → os nomes; sem a pasta, lista vazia.
 */
export function resourceTypeFolders(app: App): string[] {
    const node = app.vault.getAbstractFileByPath(RESOURCES_FOLDER);
    if (!(node instanceof TFolder)) return [];
    return resourceTypes(node.children.filter((c): c is TFolder => c instanceof TFolder).map(c => c.name));
}

/**
 * O que faz: cria a pasta quando falta, inclusive as intermediárias; pasta morta nunca renasce.
 * Erro e ataque: a pasta morta (`DEAD_FOLDERS`) é recusada antes de criar qualquer coisa.
 */
export async function ensureFolder(app: App, folder: string): Promise<void> {
    if (!folder) return;
    if (isDeadFolder(folder)) throw new Error(`${folder} é uma pasta antiga, que não existe mais — nada foi criado`);
    if (app.vault.getAbstractFileByPath(folder) instanceof TFolder) return;
    const parent = folder.split('/').slice(0, -1).join('/');
    if (parent) await ensureFolder(app, parent);
    if (!(app.vault.getAbstractFileByPath(folder) instanceof TFolder)) await app.vault.createFolder(folder);
}
