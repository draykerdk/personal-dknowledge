import type DFMPlugin from '../main';

export interface DshStatus {
    running: boolean;
    managed?: boolean;
    pid?: number | null;
    host?: string;
    port?: number;
    url?: string;
    workspace?: string;
    log_file?: string;
    started?: boolean;
    stopped?: boolean;
    already_running?: boolean;
    planned?: boolean;
    error?: string;
    voice?: {
        running: boolean;
        healthy?: boolean;
        provider?: string;
        model?: string;
        error?: string;
    };
}

export interface RemeStatus {
    running: boolean;
    healthy?: boolean;
    managed?: boolean;
    pid?: number | null;
    chunks?: number;
    embedded_chunks?: number;
    semantic?: boolean;
    pid_file_stale?: boolean;
    error?: string;
}

export function parseDshControllerOutput(stdout: string): DshStatus {
    const lines = stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    for (let index = lines.length - 1; index >= 0; index--) {
        try {
            const parsed = JSON.parse(lines[index]);
            if (typeof parsed?.running === 'boolean') return parsed as DshStatus;
        } catch (_) {
            // Procura a ultima linha JSON valida para tolerar avisos do runtime.
        }
    }
    throw new Error('O controlador do DSH não retornou um estado JSON válido.');
}

export function parseRemeControllerOutput(stdout: string): RemeStatus {
    return parseDshControllerOutput(stdout) as RemeStatus;
}

/**
 * Para onde a vista do DSH aponta, ou por que não aponta.
 *
 * Desde o DSH 0.2.1 a interface só abre com o token: o index sem token dá 401, a
 * origem `app://obsidian.md` dá 403 e o cookie da sessão é `SameSite=Strict`. A
 * vista carrega a URL com token num contexto de topo (o `<webview>`), e o
 * servidor fica como está, sem exceção para o Obsidian (decisão de 02/11/2026).
 */
export type DshViewTarget =
    | { ok: true; url: string }
    | { ok: false; reason: 'offline' | 'sem-token' | 'url-invalida'; title: string; detail: string };

export const DSH_OFFLINE_TITLE = 'DSH não está rodando — agent-commons dsh-start';

/**
 * Escolhe a URL que a vista carrega a partir do estado do Agent Commons.
 *
 * Faz: valida a `url` do `dsh-start`/`dsh-status --json` (que o controlador lê do
 * log do DSH, a fonte única desse formato) e devolve a mesma string, ou o motivo
 * da recusa com título e detalhe para o estado de erro.
 * Por quê: sem token a vista daria 401 em silêncio; com token de outro host ou de
 * outra porta, o token iria para quem não é o DSH local.
 * Erro e ataque: estado nulo ou parado vira `offline`; URL sem token vira
 * `sem-token` (nunca se abre o index sem token, nem se pede exceção ao servidor);
 * host diferente de 127.0.0.1, protocolo diferente de http, porta diferente da do
 * estado ou credencial embutida vira `url-invalida`. O detalhe nunca contém o token.
 * Prova: tests/engine/dshService.test.ts.
 */
export function resolveDshViewTarget(status: DshStatus | null | undefined): DshViewTarget {
    if (!status || !status.running) {
        return {
            ok: false,
            reason: 'offline',
            title: DSH_OFFLINE_TITLE,
            detail: 'Use Conectar para iniciar pelo Agent Commons, ou rode agent-commons dsh-start --apply no Terminal.'
        };
    }
    const raw = typeof status.url === 'string' ? status.url.trim() : '';
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch (_) {
        return invalidTarget('O Agent Commons não devolveu uma URL válida para o DSH.');
    }
    if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || parsed.username || parsed.password) {
        return invalidTarget('A URL do DSH não é a do serviço local em http://127.0.0.1; a vista recusa abrir outro endereço com o token.');
    }
    if (typeof status.port === 'number' && Number(parsed.port || 80) !== status.port) {
        return invalidTarget(`A URL do DSH aponta para a porta ${parsed.port || 80}, e o serviço gerenciado está na ${status.port}.`);
    }
    const token = parsed.searchParams.get('token');
    if (!token) {
        return {
            ok: false,
            reason: 'sem-token',
            title: 'DSH rodando, mas sem a URL com token',
            detail: 'O Agent Commons não achou a URL com token no log do DSH. Reinicie com agent-commons dsh-stop --apply e agent-commons dsh-start --apply. A vista não abre sem token: o servidor não tem exceção para o Obsidian.'
        };
    }
    return { ok: true, url: raw };
}

function invalidTarget(detail: string): DshViewTarget {
    return { ok: false, reason: 'url-invalida', title: 'URL do DSH recusada', detail };
}

/**
 * Esconde o valor do token para mostrar ou registrar a URL.
 * Faz: troca o valor de `token=` por `…`. Por quê: o token só existe na memória
 * da vista; título de botão, aviso e log nunca o carregam.
 * Prova: tests/engine/dshService.test.ts.
 */
export function redactDshUrl(url: string): string {
    return url.replace(/([?&]token=)[^&#\s]*/g, '$1…');
}

export interface DoctorSummary {
    ok: boolean;
    errors: number;
    warnings: number;
}

export class DshService {
    constructor(private readonly plugin: DFMPlugin) {}

    isDesktopAvailable(): boolean {
        return typeof (this.plugin.app.vault.adapter as any).getBasePath === 'function';
    }

    async status(): Promise<DshStatus> {
        return this.runController(['dsh-status', '--json'], 8_000);
    }

    async ensureRunning(): Promise<DshStatus> {
        // dsh-start e idempotente e tambem reconcilia o servico STT local.
        // Chamar sempre evita que um DSH ja vivo esconda um STT parado.
        return this.runController(['dsh-start', '--apply', '--json'], 35_000);
    }

    async stop(): Promise<DshStatus> {
        return this.runController(['dsh-stop', '--apply', '--json'], 15_000);
    }

    async memoryStatus(): Promise<RemeStatus> {
        return this.runController<RemeStatus>(['reme-status', '--json'], 8_000, parseRemeControllerOutput);
    }

    /** Diagnóstico geral do Agent Commons (texto, não JSON). */
    async doctor(): Promise<DoctorSummary> {
        const stdout = await this.runText(['doctor'], 20_000);
        const match = /Resumo:\s*(\d+)\s*erro\(s\),\s*(\d+)\s*aviso\(s\)/.exec(stdout);
        if (!match) {
            throw new Error('O diagnóstico do Agent Commons não retornou um resumo válido.');
        }
        const errors = Number(match[1]);
        const warnings = Number(match[2]);
        return { ok: errors === 0, errors, warnings };
    }

    private runText(args: string[], timeout: number): Promise<string> {
        const vaultPath = this.getVaultPath();
        const path = require('path') as typeof import('path');
        const { execFile } = require('child_process') as typeof import('child_process');
        const controller = path.join(vaultPath, '200 - FUNCTIONS', 'Scripts', 'agent_commons.py');
        return new Promise((resolve, reject) => {
            execFile(
                controller,
                args,
                { cwd: vaultPath, timeout, maxBuffer: 1024 * 1024, encoding: 'utf8' },
                (error, stdout, stderr) => {
                    if (error && !String(stdout || '').trim()) {
                        reject(new Error(String(stderr || error.message || 'Falha ao executar o controlador.').trim()));
                        return;
                    }
                    resolve(String(stdout || ''));
                }
            );
        });
    }

    private getVaultPath(): string {
        const adapter = this.plugin.app.vault.adapter as any;
        if (typeof adapter.getBasePath !== 'function') {
            throw new Error('A integração local do DSH está disponível apenas no Obsidian Desktop.');
        }
        return adapter.getBasePath();
    }

    private runController<T extends { running: boolean; error?: string } = DshStatus>(
        args: string[],
        timeout: number,
        parser: (stdout: string) => T = parseDshControllerOutput as (stdout: string) => T
    ): Promise<T> {
        const vaultPath = this.getVaultPath();
        const path = require('path') as typeof import('path');
        const { execFile } = require('child_process') as typeof import('child_process');
        const controller = path.join(vaultPath, '200 - FUNCTIONS', 'Scripts', 'agent_commons.py');

        return new Promise((resolve, reject) => {
            execFile(
                controller,
                args,
                { cwd: vaultPath, timeout, maxBuffer: 1024 * 1024, encoding: 'utf8' },
                (error, stdout, stderr) => {
                    let payload: T | null = null;
                    try {
                        payload = parser(String(stdout || ''));
                    } catch (_) {
                        // O erro de processo abaixo inclui stderr quando nao houve JSON.
                    }

                    if (error || payload?.error) {
                        const detail = payload?.error || String(stderr || error?.message || 'Falha desconhecida ao controlar o DSH.').trim();
                        reject(new Error(detail));
                        return;
                    }
                    if (!payload) {
                        reject(new Error('O Agent Commons não retornou o estado do DSH.'));
                        return;
                    }
                    resolve(payload);
                }
            );
        });
    }
}
