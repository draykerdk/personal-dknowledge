/**
 * Contexto compartilhado dos painéis.
 *
 * Um painel só recebe `(host, ctx)`: ele não conhece a view, não busca estado e
 * não guarda cache próprio. Todos os dados vêm do `snapshot` — por isso dois
 * painéis nunca discordam sobre a mesma tarefa na mesma renderização.
 */
import { App, Notice, TFile } from 'obsidian';
import type DFMPlugin from '../../main';
import { MissionSnapshot } from '../../engine/missionControl';

export type MissionDshAction = { kind: 'skill'; id: string } | { kind: 'protocol'; id: string };

export interface MissionPanelContext {
    app: App;
    plugin: DFMPlugin;
    snapshot: MissionSnapshot;
    /** Recoleta o snapshot (com `force` ignora o cache de 15 s) e repinta a view. */
    refresh(force?: boolean): Promise<void>;
    /** Abre uma nota do vault no leaf ativo. */
    openPath(path: string): Promise<void>;
    /** Abre um wikilink `[[Nota]]` ou um caminho cru. */
    openLink(link: string): Promise<void>;
    /**
     * Dispara um protocolo DFM interativo pelo mesmo caminho que os botões das notas.
     * `vars` pré-responde a rodada (ex.: `_target_week_pin`, a semana do cartão).
     */
    runProtocol(id: string, vars?: Record<string, any>): Promise<void>;
    /** Abre a janela DSH já com uma invocação de skill/protocolo preparada. */
    invokeDsh(action: MissionDshAction): Promise<void>;
    /** Executa um comando do próprio plugin (id sem o prefixo `dfm-system:`). */
    executeCommand(commandId: string): void;
    /** Abre uma folha lateral com os itens de um bucket/filtro. */
    focusTasks(statuses: string[], label: string, toneClass?: string): Promise<void>;
    notice(message: string, timeout?: number): void;
}

/**
 * Base do vault no disco, para os painéis que executam script com `cwd` na raiz.
 *
 * `adapter.basePath` existe no desktop; `getBasePath()` é a mesma informação por
 * método. Sem nenhuma das duas o `exec` roda sem `cwd` — o que falharia
 * visivelmente, não em silêncio.
 */
export function vaultBasePath(ctx: MissionPanelContext): string {
    const adapter = ctx.app.vault.adapter as { basePath?: string; getBasePath?: () => string };
    return String(adapter?.basePath ?? adapter?.getBasePath?.() ?? '');
}

export function openVaultPath(app: App, path: string): Promise<void> {
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
        new Notice(`⚠️ Nota não encontrada: ${path}`);
        return Promise.resolve();
    }
    const leaf = (app.workspace.getLeaf ? (app.workspace.getLeaf('tab' as any) ?? app.workspace.getLeaf(false)) : app.workspace.getLeaf(false));
    return Promise.resolve(leaf.openFile(file));
}

export async function openVaultLink(app: App, link: string): Promise<void> {
    const clean = String(link ?? '').replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim();
    if (!clean) return;
    // Resolução por link primeiro: o campo `projects` do TaskNotes guarda o nome
    // da nota, não o caminho — só o metadataCache sabe onde ela vive.
    const resolved = app.metadataCache.getFirstLinkpathDest(clean, '');
    const getTabLeaf = () => app.workspace.getLeaf ? (app.workspace.getLeaf('tab' as any) ?? app.workspace.getLeaf(false)) : app.workspace.getLeaf(false);
    if (resolved) {
        await getTabLeaf().openFile(resolved);
        return;
    }
    const direct = app.vault.getAbstractFileByPath(clean.endsWith('.md') ? clean : `${clean}.md`);
    if (direct instanceof TFile) {
        await getTabLeaf().openFile(direct);
        return;
    }
    new Notice(`⚠️ Alvo não resolvido no vault: ${clean}`);
}

/** "há 12 min" / "há 3 h" / "há 2 d" — usado no sinal de contexto do DSH. */
export function formatAge(minutes: number | null): string {
    if (minutes === null || !Number.isFinite(minutes)) return 'sem registro';
    if (minutes < 1) return 'agora';
    if (minutes < 60) return `há ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `há ${hours} h`;
    return `há ${Math.floor(hours / 24)} d`;
}

export function formatTimestamp(ts: string): string {
    if (!ts) return '—';
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return ts;
    return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function truncate(text: string, max = 120): string {
    const value = String(text ?? '').trim();
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
