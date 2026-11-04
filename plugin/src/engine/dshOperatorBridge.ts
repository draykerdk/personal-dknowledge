import { Platform } from 'obsidian';
import type DFMPlugin from '../main';
import {
    createCorrelationId,
    DSH_OPERATOR_AUDIT,
    DSH_OPERATOR_AUDIT_PREVIOUS,
    DSH_OPERATOR_CONTRACT_VERSION,
    DSH_OPERATOR_DESCRIPTOR,
    DSH_OPERATOR_PORT,
    DshOperatorCore,
    OperatorBridgeError,
    protocolosDaPonte,
    type JsonRecord,
    type OperatorAuditEntry,
} from './dshOperatorCore';

export {
    DSH_OPERATOR_AUDIT,
    DSH_OPERATOR_AUDIT_PREVIOUS,
    DSH_OPERATOR_CONTRACT_VERSION,
    DSH_OPERATOR_DESCRIPTOR,
    DSH_OPERATOR_PORT,
    PAPEIS_DA_PONTE,
    DshOperatorCore,
    OperatorBridgeError,
    protocolosDaPonte,
    safeMarkdownPath,
    validateTaskCreate,
    validateTaskUpdate,
} from './dshOperatorCore';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_AUDIT_BYTES = 1024 * 1024;

interface BridgeDescriptor {
    contractVersion: number;
    port: number;
    token: string;
    vault: string;
    vaultPath: string;
    dfmSystemVersion: string;
    startedAt: string;
}

/** Transporte HTTP exclusivo do desktop. O núcleo permanece multiplataforma. */
export class DshOperatorBridge {
    readonly core: DshOperatorCore;
    private server: any = null;
    private token = '';
    private startedAt = '';
    /** A porta em que a ponte escuta (ou escutou por último); a de partida antes do primeiro `start`. */
    porta = DSH_OPERATOR_PORT;

    constructor(private readonly plugin: DFMPlugin) {
        this.core = new DshOperatorCore(plugin, entry => this.audit(entry));
    }

    /** Se a ponte está escutando agora. */
    get ativa(): boolean {
        return !!this.server;
    }

    /**
     * O que faz: sobe a ponte HTTP no loopback, na porta dada (a de partida sem ela), e grava o
     * descritor com a porta e o token para o lado do agente achar.
     * Erro e ataque: fora do desktop, ou já ativa, não faz nada (`false`); a porta ocupada rejeita.
     */
    async start(porta: number = DSH_OPERATOR_PORT): Promise<boolean> {
        if (!Platform.isDesktopApp || this.server) return false;
        this.porta = porta;
        const nodeRequire = this.nodeRequire();
        const crypto = nodeRequire('crypto') as typeof import('crypto');
        const http = nodeRequire('http') as typeof import('http');
        this.token = crypto.randomBytes(32).toString('hex');
        this.startedAt = new Date().toISOString();
        this.core.setStartedAt(this.startedAt);
        this.server = http.createServer((request, response) => void this.handleHttp(request, response));
        await new Promise<void>((resolve, reject) => {
            const server = this.server;
            // A porta ocupada: a ponte fica descida (sem servidor), e o próximo `start` tenta de novo.
            const onError = (error: Error) => { this.server = null; reject(error); };
            server.once('error', onError);
            server.listen(this.porta, '127.0.0.1', () => {
                server.off('error', onError);
                resolve();
            });
        });
        try {
            await this.writeDescriptor();
        } catch (error) {
            await this.stop();
            throw error;
        }
        return true;
    }

    async stop(): Promise<void> {
        const server = this.server;
        this.server = null;
        if (server) await new Promise<void>(resolve => server.close(() => resolve()));
        await this.removeOwnDescriptor();
        this.token = '';
    }

    dispatch(route: string, body: unknown, correlationId?: string): Promise<JsonRecord> {
        return this.core.dispatch(route, body, correlationId);
    }

    private nodeRequire(): NodeRequire {
        if (!Platform.isDesktopApp || typeof require !== 'function') {
            throw new OperatorBridgeError('desktop_only', 'A ponte HTTP do DSH existe apenas no Obsidian Desktop.', 503);
        }
        return require;
    }

    private safeCorrelationId(raw: unknown): string {
        return typeof raw === 'string' && /^[A-Za-z0-9._:-]{8,128}$/.test(raw) ? raw : createCorrelationId();
    }

    private sameToken(actual: string, expected: string): boolean {
        try {
            const crypto = this.nodeRequire()('crypto') as typeof import('crypto');
            const BufferCtor = this.nodeRequire()('buffer').Buffer as typeof Buffer;
            const a = BufferCtor.from(actual);
            const b = BufferCtor.from(expected);
            return a.length === b.length && crypto.timingSafeEqual(a, b);
        } catch (_) {
            return false;
        }
    }

    private async writeDescriptor(): Promise<void> {
        const adapter = this.plugin.app.vault.adapter as any;
        const descriptor: BridgeDescriptor = {
            contractVersion: DSH_OPERATOR_CONTRACT_VERSION,
            port: this.porta,
            token: this.token,
            vault: this.plugin.app.vault.getName(),
            vaultPath: String(adapter.basePath ?? adapter.getBasePath?.() ?? ''),
            dfmSystemVersion: this.plugin.manifest.version,
            startedAt: this.startedAt,
        };
        await adapter.write(DSH_OPERATOR_DESCRIPTOR, JSON.stringify(descriptor, null, 2));
    }

    private async removeOwnDescriptor(): Promise<void> {
        const adapter = this.plugin.app.vault.adapter as any;
        try {
            if (!await adapter.exists?.(DSH_OPERATOR_DESCRIPTOR)) return;
            const current = JSON.parse(await adapter.read(DSH_OPERATOR_DESCRIPTOR));
            if (current?.token === this.token) await adapter.remove(DSH_OPERATOR_DESCRIPTOR);
        } catch (_) {
            // Descritor stale falha fechado no health/autenticacao.
        }
    }

    private async audit(entry: OperatorAuditEntry): Promise<void> {
        const adapter = this.plugin.app.vault.adapter as any;
        try {
            const stat = await adapter.stat?.(DSH_OPERATOR_AUDIT);
            if (stat?.size > MAX_AUDIT_BYTES) {
                if (await adapter.exists?.(DSH_OPERATOR_AUDIT_PREVIOUS)) await adapter.remove(DSH_OPERATOR_AUDIT_PREVIOUS);
                await adapter.rename(DSH_OPERATOR_AUDIT, DSH_OPERATOR_AUDIT_PREVIOUS);
            }
            const line = `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`;
            if (typeof adapter.append === 'function') await adapter.append(DSH_OPERATOR_AUDIT, line);
            else {
                const previous = await adapter.exists?.(DSH_OPERATOR_AUDIT) ? await adapter.read(DSH_OPERATOR_AUDIT) : '';
                await adapter.write(DSH_OPERATOR_AUDIT, `${previous}${line}`);
            }
        } catch (_) {
            // Auditoria e diagnostica e nao altera o resultado da acao.
        }
    }

    private async readJsonBody(request: any): Promise<JsonRecord> {
        const contentType = String(request.headers['content-type'] ?? '');
        if (!contentType.toLowerCase().startsWith('application/json')) {
            throw new OperatorBridgeError('unsupported_media_type', 'Content-Type deve ser application/json.', 415);
        }
        const BufferCtor = this.nodeRequire()('buffer').Buffer as typeof Buffer;
        return await new Promise<JsonRecord>((resolve, reject) => {
            const chunks: Buffer[] = [];
            let size = 0;
            let tooLarge = false;
            request.on('data', (chunk: unknown) => {
                if (tooLarge) return;
                const buffer = BufferCtor.isBuffer(chunk) ? chunk as Buffer : BufferCtor.from(chunk as any);
                size += buffer.length;
                if (size > MAX_BODY_BYTES) {
                    tooLarge = true;
                    chunks.length = 0;
                    return;
                }
                chunks.push(buffer);
            });
            request.on('end', () => {
                if (tooLarge) {
                    reject(new OperatorBridgeError('payload_too_large', 'Payload excede 64 KiB.', 413));
                    return;
                }
                try {
                    const text = BufferCtor.concat(chunks).toString('utf8');
                    const value = text ? JSON.parse(text) : {};
                    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
                    resolve(value);
                } catch (_) {
                    reject(new OperatorBridgeError('invalid_json', 'JSON inválido.'));
                }
            });
            request.on('error', reject);
        });
    }

    private send(response: any, status: number, payload: JsonRecord): void {
        response.statusCode = status;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.end(JSON.stringify(payload));
    }

    private async handleHttp(request: any, response: any): Promise<void> {
        let route = '/';
        let correlationId = createCorrelationId();
        try {
            route = new URL(request.url ?? '/', `http://127.0.0.1:${this.porta}`).pathname;
            correlationId = this.safeCorrelationId(request.headers['x-dfm-correlation-id']);
            const auth = String(request.headers.authorization ?? '');
            if (!auth.startsWith('Bearer ') || !this.sameToken(auth.slice(7), this.token)) {
                throw new OperatorBridgeError('unauthorized', 'Autenticação obrigatória.', 401);
            }
            if (route === '/v1/health') {
                if (request.method !== 'GET') throw new OperatorBridgeError('method_not_allowed', 'Método não permitido.', 405);
                this.send(response, 200, { ok: true, data: await this.dispatch(route, {}, correlationId) });
                return;
            }
            if (request.method !== 'POST') throw new OperatorBridgeError('method_not_allowed', 'Método não permitido.', 405);
            const body = await this.readJsonBody(request);
            this.send(response, 200, { ok: true, data: await this.dispatch(route, body, correlationId) });
        } catch (error) {
            const known = error instanceof OperatorBridgeError
                ? error
                : new OperatorBridgeError('internal_error', 'Falha interna da ponte.', 500);
            if (route !== '/v1/health' && !route.endsWith('/query')) {
                await this.audit({ action: 'request.failed', target: route, correlationId, ok: false, errorCode: known.code });
            }
            if (!response.headersSent) {
                this.send(response, known.status, {
                    ok: false,
                    error: { code: known.code, message: known.message, ...(known.details ? { details: known.details } : {}) },
                    correlationId,
                });
            }
        }
    }
}
