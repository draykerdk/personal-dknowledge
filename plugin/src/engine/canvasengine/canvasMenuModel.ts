/**
 * Modelo, inventário, alvo e execução pura de itens de menu do canvas.
 *
 * Módulo puro em relação à montagem visual do menu de contexto.
 */
import type { CanvasEngine } from './canvasEngineTypes';
import { applyDfmAction } from '../dfmBlocks';
import type { DfmBlockAction, DfmBlockHandlers } from '../dfmBlocks';
import { protocolGroup } from '../protocolGroups';
import { canvasViewsOf } from './canvasTargets';
import type { CanvasDropTarget } from './canvasTargets';

export const MENU_FALLBACK_GROUP = 'Outros';
export const MENU_COMMAND_PREFIX = 'dfm-system:';
export const PROTOCOL_COMMAND_PREFIX = `${MENU_COMMAND_PREFIX}dfm-`;

export type CanvasMenuKind = 'protocol' | 'command';

/** Uma função do DFM oferecida pelo menu. */
export interface CanvasMenuEntry {
    /** Id cru: id do protocolo, ou id completo do comando (`dfm-system:...`). */
    id: string;
    label: string;
    kind: CanvasMenuKind;
    /** Grupo declarado pela coleta (`protocolGroup`); vazio cai no fallback. */
    group?: string;
    icon?: string;
}

export interface CanvasMenuGroup {
    group: string;
    entries: CanvasMenuEntry[];
}

export interface CanvasMenuTree {
    groups: CanvasMenuGroup[];
    total: number;
    /** Nenhuma entrada sobrou: o menu **declara** isso, não inventa item. */
    empty: boolean;
}

/**
 * Monta a árvore do menu a partir de um inventário qualquer.
 *
 * Sem DOM, sem vault e sem Obsidian: é esta função que o teste exercita com
 * inventário vazio, id sem grupo e item duplicado.
 *
 * As regras, e o porquê de cada uma:
 *
 * - **id ou rótulo vazio cai fora.** Um botão sem rótulo é um botão mudo, e um
 *   item sem id não teria como executar; a lista sobrevive sem ele.
 * - **duplicado por `kind`+`id` entra uma vez.** O mesmo id como protocolo e
 *   como comando são coisas diferentes e as duas ficam; o mesmo id duas vezes
 *   na mesma espécie é o mesmo botão, e repetir seria afirmar duas funções onde
 *   existe uma.
 * - **grupo vazio/ausente vira `Outros`.** Nunca um grupo em branco na tela.
 * - **a ordem recebida é preservada.** Quem ordena é a coleta, que vê o acervo.
 */
export function buildCanvasMenuTree(entries: readonly CanvasMenuEntry[] | null | undefined): CanvasMenuTree {
    const groups: CanvasMenuGroup[] = [];
    const seen = new Set<string>();
    let total = 0;

    for (const raw of entries ?? []) {
        const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
        const label = typeof raw?.label === 'string' ? raw.label.trim() : '';
        if (!id || !label) continue;

        const kind: CanvasMenuKind = raw.kind === 'command' ? 'command' : 'protocol';
        const key = `${kind}:${id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const groupName = typeof raw.group === 'string' && raw.group.trim()
            ? raw.group.trim()
            : MENU_FALLBACK_GROUP;

        let group = groups.find(candidate => candidate.group === groupName);
        if (!group) {
            group = { group: groupName, entries: [] };
            groups.push(group);
        }
        group.entries.push({ id, label, kind, group: groupName, icon: raw.icon });
        total++;
    }

    return { groups, total, empty: total === 0 };
}

/* ==========================================================================
   O inventário: o acervo vivo, não uma lista nossa
   ========================================================================== */

/**
 * As funções do DFM que existem **agora**.
 *
 * Protocolos: `plugin.manager.getAll()`. Comandos: o registro vivo do Obsidian,
 * só os deste plugin e sem os invólucros `dfm-system:dfm-<id>` (um por
 * protocolo, ver `registerCommandsAndRibbon` em `main.ts`).
 *
 * Quando o registro de comandos não está acessível, a resposta é **nenhum
 * comando** — a lista vazia é declarada como vazia pelo menu; inventar ids aqui
 * seria prometer um clique que não executa.
 */
export function collectCanvasMenuInventory(engine: CanvasEngine): CanvasMenuEntry[] {
    const plugin: any = (engine as any)?.plugin ?? null;
    const entries: CanvasMenuEntry[] = [];

    const manager = plugin?.manager;
    const protocols: any[] = typeof manager?.getAll === 'function' ? (manager.getAll() ?? []) : [];
    for (const protocol of protocols) {
        const id = String(protocol?.id ?? '').trim();
        if (!id) continue;
        entries.push({
            id,
            label: String(protocol?.name ?? id),
            kind: 'protocol',
            group: protocolGroup(id),
            icon: protocol?.icon ? String(protocol.icon) : undefined,
        });
    }

    const registry = plugin?.app?.commands?.commands;
    if (registry && typeof registry === 'object') {
        for (const commandId of Object.keys(registry)) {
            if (!commandId.startsWith(MENU_COMMAND_PREFIX)) continue;
            if (commandId.startsWith(PROTOCOL_COMMAND_PREFIX)) continue;
            const declared: any = (registry as any)[commandId]?.name;
            const label = typeof declared === 'string' && declared.trim()
                ? declared.trim()
                : commandId.substring(MENU_COMMAND_PREFIX.length);
            entries.push({ id: commandId, label, kind: 'command', group: protocolGroup(commandId) });
        }
    }

    // Estável e legível: grupo, depois rótulo. `localeCompare` como no console.
    return entries.sort((a, b) => String(a.group).localeCompare(String(b.group)) || a.label.localeCompare(b.label));
}

/* ==========================================================================
   A execução: pelo caminho que já existe
   ========================================================================== */

/**
 * Um item do menu na forma de ação `dfm`.
 *
 * Comando vai pelo campo `command` com `type: 'command'`; protocolo pelo `id` —
 * exatamente as duas formas que `resolveDfmAction` já sabe decidir. O id **cru**
 * é preservado: prefixar `dfm-system:` aqui faria o mesmo comando funcionar na
 * nota e falhar no canvas (o defeito que `dfmBlocks.ts` documenta).
 */
export function menuEntryAsAction(entry: CanvasMenuEntry): DfmBlockAction {
    if (entry.kind === 'command') {
        return { button: entry.label, id: '', command: entry.id, type: 'command', vars: '' };
    }
    return { button: entry.label, id: entry.id, command: '', type: '', vars: '' };
}

/** Executa a escolha pelo caminho de sempre: `resolveDfmAction` → `applyDfmAction`. */
export function runCanvasMenuEntry(entry: CanvasMenuEntry, handlers: DfmBlockHandlers): void {
    applyDfmAction(menuEntryAsAction(entry), handlers);
}

/**
 * Os executores reais, tirados do motor — os mesmos do processador de blocos.
 *
 * Nenhuma mensagem afirma causa não medida: comando executado não rende aviso (o
 * `true` de `executeCommandById` diz que o comando rodou, não que ele deu certo);
 * comando que não rodou rende "indisponível", com o id; protocolo ausente rende
 * "não encontrado"; falha rende a mensagem de erro observada.
 */
export function canvasMenuHandlers(engine: CanvasEngine, notice: (message: string) => void): DfmBlockHandlers {
    const plugin: any = (engine as any)?.plugin ?? null;

    return {
        executeCommand: (commandId: string) => {
            const commands = plugin?.app?.commands;
            let executed = false;
            try {
                executed = Boolean(commands?.executeCommandById?.(commandId));
            } catch (error) {
                notice(`Comando "${commandId}" falhou: ${String(error)}`);
                return;
            }
            if (!executed) notice(`Comando indisponível: ${commandId}`);
        },
        runProtocol: (protocolId: string) => {
            const protocol = plugin?.manager?.get?.(protocolId);
            if (!protocol || typeof protocol.run !== 'function') {
                notice(`Protocolo não encontrado: ${protocolId}`);
                return;
            }
            try {
                // O menu não carrega `vars`: a retomada de rascunho é do bloco da
                // nota. Aqui o protocolo começa do zero, como o comando do registro.
                const result = protocol.run({});
                if (result && typeof result.catch === 'function') {
                    result.catch((error: unknown) => notice(`Protocolo "${protocolId}" falhou: ${String(error)}`));
                }
            } catch (error) {
                notice(`Protocolo "${protocolId}" falhou: ${String(error)}`);
            }
        },
        notice,
    };
}

/* ==========================================================================
   O nó alvo — declarado, não adivinhado
   ========================================================================== */

export interface CanvasMenuTarget {
    canvasPath: string;
    nodeId: string;
    /** Rótulo do nó como o operador o vê; cai no id quando o nó não tem texto. */
    label: string;
}

function nodesOfCanvas(canvas: any): any[] {
    const nodes = canvas?.nodes;
    if (!nodes) return [];
    if (typeof nodes.values === 'function') return Array.from(nodes.values());
    if (Array.isArray(nodes)) return nodes;
    return [];
}

/**
 * Descreve o nó que o menu vai usar como alvo.
 *
 * O rótulo sai do **próprio nó** (texto declarado, ou o arquivo que ele aponta),
 * lido do canvas em memória — nenhuma releitura de arquivo só para desenhar um
 * título. Sem texto e sem arquivo, o rótulo é o id: o menu diz o que mediu.
 */
export function describeCanvasTarget(engine: CanvasEngine, target: CanvasDropTarget): CanvasMenuTarget {
    const nodeId = String(target?.nodeId ?? '');
    let label = '';

    try {
        for (const view of canvasViewsOf(engine)) {
            if (view.path !== target?.canvasPath) continue;
            const node = nodesOfCanvas(view.canvas).find(candidate => String(candidate?.id ?? '') === nodeId);
            if (!node) continue;
            const text = typeof node.text === 'string' ? node.text : '';
            const firstLine = text.split('\n')[0].trim();
            const filePath = typeof node.file === 'string' ? node.file : '';
            const fileName = filePath.split('/').filter(Boolean).pop() ?? '';
            label = firstLine || fileName;
            break;
        }
    } catch (_) {
        // Sem rótulo medido, o id responde — e a UI não inventa texto.
    }

    return { canvasPath: String(target?.canvasPath ?? ''), nodeId, label: label || nodeId };
}
