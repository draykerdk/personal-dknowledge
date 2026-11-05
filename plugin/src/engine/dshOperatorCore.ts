import { Notice, TFile } from 'obsidian';
import type DFMPlugin from '../main';
import {
    DEFAULT_PROJECTION_LIMITS,
    MISSION_SECTIONS,
    MissionProjectionLimits,
    projectMissionSnapshot,
} from './missionControl';

export const DSH_OPERATOR_CONTRACT_VERSION = 1;
export const DSH_OPERATOR_PORT = 3082;
export const DSH_OPERATOR_DESCRIPTOR = '.dfm-dsh-operator.json';
export const DSH_OPERATOR_AUDIT = '.dfm-dsh-operator-audit.jsonl';
export const DSH_OPERATOR_AUDIT_PREVIOUS = '.dfm-dsh-operator-audit.previous.jsonl';

const MAX_NOTICE_LENGTH = 280;
const MAX_QUERY_RESULTS = 50;
const SOURCE = 'dfm-dsh-vault-bridge';

const OPEN_STATUSES = new Set(['inbox', 'next-action', 'in-progress', 'waiting-on', 'someday']);
const FINAL_STATUSES = new Set(['done', 'cancelled']);
const PRIORITIES = new Set(['none', 'low', 'normal', 'high']);

import { PAPEIS_DA_PONTE, protocolosDaPonte } from './dshAllowlist';
import { comTipoNaCriacao } from './tasknotesCreate';
import { estadoDoPeriodo, ITENS_DO_ESTADO, PERIODOS_DO_ESTADO, type PeriodoDoEstado } from './estadoDaMissao';
import type { MissaoModelo } from '../missao/tipos';
import { ORIGEM_DO_AGENTE, RecusaDaProposta, type FilaDePropostas } from './propostasDoAgente';
import { noParaOAgente } from './noParaOAgente';
import type { LeitorDoRamo, LidoDosProtocolos } from '../missao/tipos';
import { ehSemana } from './periodo';
import { definicoesDe, fusoDoSistema } from '../definicoes';
import { definicoesParaOAgente } from './definicoesParaOAgente';

export { PAPEIS_DA_PONTE, protocolosDaPonte };

export type JsonRecord = Record<string, any>;

interface TaskNotesPluginInstance {
    manifest?: { version?: string };
    api?: any;
}

export interface OperatorAuditEntry {
    action: string;
    target: string;
    correlationId: string;
    ok: boolean;
    errorCode?: string;
}

export type OperatorAuditSink = (entry: OperatorAuditEntry) => Promise<void>;

export class OperatorBridgeError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly status = 400,
        public readonly details?: JsonRecord,
    ) {
        super(message);
        this.name = 'OperatorBridgeError';
    }
}

export function createCorrelationId(): string {
    const cryptoApi = globalThis.crypto;
    if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
    const random = Math.random().toString(36).slice(2);
    return `dfm-${Date.now().toString(36)}-${random}`;
}

export function asRecord(value: unknown): JsonRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new OperatorBridgeError('invalid_input', 'O corpo deve ser um objeto JSON.');
    }
    return value as JsonRecord;
}

function boundedString(value: unknown, field: string, max: number, required = false): string | undefined {
    if (value === undefined || value === null || value === '') {
        if (required) throw new OperatorBridgeError('invalid_input', `${field} é obrigatório.`);
        return undefined;
    }
    if (typeof value !== 'string') throw new OperatorBridgeError('invalid_input', `${field} deve ser texto.`);
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!normalized && required) throw new OperatorBridgeError('invalid_input', `${field} é obrigatório.`);
    if (normalized.length > max) throw new OperatorBridgeError('invalid_input', `${field} excede ${max} caracteres.`);
    return normalized || undefined;
}

function stringList(value: unknown, field: string, min: number, max: number, itemMax = 280): string[] {
    if (!Array.isArray(value)) throw new OperatorBridgeError('invalid_input', `${field} deve ser uma lista.`);
    const result = value.map((item, index) => boundedString(item, `${field}[${index}]`, itemMax, true) as string);
    if (result.length < min || result.length > max) {
        throw new OperatorBridgeError('invalid_input', `${field} deve conter entre ${min} e ${max} itens.`);
    }
    return [...new Set(result)];
}

function optionalStringList(value: unknown, field: string, max = 20): string[] | undefined {
    return value === undefined ? undefined : stringList(value, field, 0, max, 180);
}

function normalizeWikiLink(value: string): string {
    const inner = value.replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
    if (!inner || inner.includes('\n') || inner.includes('\r')) {
        throw new OperatorBridgeError('invalid_input', 'Projeto inválido.');
    }
    return `[[${inner}]]`;
}

function validateWeek(value: unknown, required = false): string | undefined {
    const week = boundedString(value, 'week', 8, required);
    if (week && (!ehSemana(week) || Number(week.slice(-2)) < 1 || Number(week.slice(-2)) > 53)) {
        throw new OperatorBridgeError('invalid_input', 'week deve usar YYYY-Wnn.');
    }
    return week;
}

function validateDate(value: unknown, field: string): string | undefined {
    const date = boundedString(value, field, 16);
    // Forma própria (não é a `DIA`): o contrato da ponte aceita o dia ou o dia com `THH:mm`, inteiro; a hora se confere abaixo.
    if (date && !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/.test(date)) {
        throw new OperatorBridgeError('invalid_input', `${field} deve usar YYYY-MM-DD ou YYYY-MM-DDTHH:mm.`);
    }
    if (date) {
        const [calendarDate, time] = date.split('T');
        const parsed = new Date(`${calendarDate}T${time ?? '00:00'}:00Z`);
        if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== calendarDate) {
            throw new OperatorBridgeError('invalid_input', `${field} contém data inválida.`);
        }
    }
    return date;
}

function validateImpact(value: unknown, required = false): number | undefined {
    if (value === undefined || value === null || value === '') {
        if (required) throw new OperatorBridgeError('invalid_input', 'impacto é obrigatório.');
        return undefined;
    }
    const impact = Number(value);
    if (!Number.isInteger(impact) || impact < 1 || impact > 10) {
        throw new OperatorBridgeError('invalid_input', 'impacto deve ser inteiro entre 1 e 10.');
    }
    return impact;
}

function validateTimeEstimate(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const minutes = Number(value);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
        throw new OperatorBridgeError('invalid_input', 'timeEstimate deve ser inteiro entre 1 e 1440 minutos.');
    }
    return minutes;
}

function normalizeTags(value: unknown, required: string[]): string[] {
    const extra = optionalStringList(value, 'tags', 10) ?? [];
    const cleaned = extra.map(tag => tag.replace(/^#/, '').trim()).filter(Boolean);
    return [...new Set([...required, ...cleaned])];
}

function customProperty(task: JsonRecord, key: string): any {
    return task?.customProperties?.[key] ?? task?.[key];
}

function taskType(task: JsonRecord): string {
    return String(customProperty(task, 'type') ?? 'task');
}

function mutationContext(correlationId: string, reason: string) {
    return { source: SOURCE, correlationId, reason };
}

function taskProjection(task: JsonRecord, includeDetails = false): JsonRecord {
    const projected: JsonRecord = {
        path: task.path,
        title: task.title,
        type: taskType(task),
        status: task.status,
        priority: task.priority,
        impacto: customProperty(task, 'impacto') ?? null,
        week: customProperty(task, 'week') ?? null,
        scheduled: task.scheduled ?? null,
        due: task.due ?? null,
        timeEstimate: task.timeEstimate ?? null,
        projects: task.projects ?? [],
        contexts: task.contexts ?? [],
        tags: task.tags ?? [],
        archived: Boolean(task.archived),
        recurrence: task.recurrence ?? null,
    };
    if (includeDetails) projected.details = task.details ?? '';
    return projected;
}

function buildAtomicDetails(title: string, checklist: string[]): string {
    return [`# ${title}`, '', '## Evidência de conclusão', '', ...checklist.map(item => `- [ ] ${item}`)].join('\n');
}

function buildSmartDetails(title: string, input: JsonRecord): string {
    return [
        `# ${title}`, '', `> ${input.entregaObservavel}`, '', '## Critério de conclusão', '',
        `- [ ] ${input.criterioSuficiente}`, '', '## Valor e contribuição', '', input.valorContribuicao,
        '', '## Limite de escopo', '', input.limiteEscopo,
    ].join('\n');
}

export function validateTaskCreate(raw: unknown): JsonRecord {
    const body = asRecord(raw);
    const kind = boundedString(body.kind, 'kind', 16, true);
    if (kind !== 'atomic' && kind !== 'smart') {
        throw new OperatorBridgeError('invalid_input', 'kind deve ser atomic ou smart.');
    }
    const title = boundedString(body.title, 'title', 140, true) as string;
    const week = validateWeek(body.week, true) as string;
    const projects = stringList(body.projects, 'projects', 1, 8, 180).map(normalizeWikiLink);
    const status = boundedString(body.status, 'status', 32) ?? 'next-action';
    const priority = boundedString(body.priority, 'priority', 32) ?? 'normal';
    if (!OPEN_STATUSES.has(status)) throw new OperatorBridgeError('invalid_input', 'status inicial não é permitido pelo DFM.');
    if (!PRIORITIES.has(priority)) throw new OperatorBridgeError('invalid_input', 'priority não é permitida pelo DFM.');
    const common: JsonRecord = {
        kind, title, week, projects, status, priority,
        due: validateDate(body.due, 'due'),
        timeEstimate: validateTimeEstimate(body.timeEstimate),
        contexts: optionalStringList(body.contexts, 'contexts', 10),
    };
    if (kind === 'atomic') {
        const checklist = stringList(body.checklist, 'checklist', 1, 3);
        return {
            ...common,
            scheduled: validateDate(body.scheduled, 'scheduled'),
            impacto: validateImpact(body.impacto),
            checklist,
            tags: normalizeTags(body.tags, ['task']),
            type: 'task',
            details: buildAtomicDetails(title, checklist),
        };
    }
    if (body.scheduled !== undefined && body.scheduled !== null && body.scheduled !== '') {
        throw new OperatorBridgeError('invalid_input', 'Tarefa SMART não recebe scheduled.');
    }
    const smart = {
        entregaObservavel: boundedString(body.entregaObservavel, 'entregaObservavel', 500, true),
        criterioSuficiente: boundedString(body.criterioSuficiente, 'criterioSuficiente', 500, true),
        valorContribuicao: boundedString(body.valorContribuicao, 'valorContribuicao', 500, true),
        limiteEscopo: boundedString(body.limiteEscopo, 'limiteEscopo', 500, true),
        impacto: validateImpact(body.impacto, true),
    };
    return {
        ...common,
        ...smart,
        tags: normalizeTags(body.tags, ['task', 'tarefa-smart']),
        type: 'tarefa_smart',
        details: buildSmartDetails(title, smart),
    };
}

/**
 * O que faz: o pedido de criar uma tarefa pela ponte (`/v1/tasks/create`) como a proposta `criar_tarefa` da
 * fila (02/11, um jeito por função): o título, o pai (a SMART ou o projeto), a semana e o porquê.
 * Por quê: dois lugares para praticamente a mesma coisa eram duplicação (02/11/2026): tudo o que um agente quer
 * acrescentar espera no grupo único da triagem, Propostas, para o sim (Y) ou o não (X). A conferência
 * é a da proposta (`conferirProposta`, a mesma do `/v1/proposals/create`).
 * Entra → sai: o corpo cru → o pedido da proposta.
 * Erro e ataque: a SMART (a meta é do operador), o campo que a proposta não leva (checklist, status, prazo…):
 * recusa com o porquê, para o agente propor do jeito certo; nada se cria aqui.
 * Prova: tests/engine/dshOperatorBridge.test.ts ("criar pela ponte é propor").
 */
export function propostaDaCriacao(raw: unknown): JsonRecord {
    const body = asRecord(raw);
    const aceitos = new Set(['kind', 'title', 'titulo', 'projects', 'pai', 'valor', 'week', 'semana', 'porque', 'reason']);
    for (const key of Object.keys(body)) {
        if (!aceitos.has(key)) throw new OperatorBridgeError('invalid_input', `Campo não vale na proposta: ${key}. Para acrescentar uma tarefa, proponha o título, o pai, a semana e o porquê; o resto o operador decide na triagem.`);
    }
    if (body.kind !== undefined && body.kind !== 'atomic') throw new OperatorBridgeError('invalid_input', 'A SMART é decisão do operador: proponha a ação (kind atomic) ou abra o protocolo tarefa_smart.');
    const projects = Array.isArray(body.projects) ? body.projects : body.projects !== undefined ? [body.projects] : [];
    if (projects.length > 1) throw new OperatorBridgeError('invalid_input', 'A proposta leva um pai só: a SMART ou o projeto.');
    const pai = body.pai ?? body.valor ?? projects[0];
    const proposta: JsonRecord = { acao: 'criar_tarefa', titulo: body.titulo ?? body.title, valor: typeof pai === 'string' ? pai.trim() : pai, porque: body.porque ?? body.reason };
    const semana = body.semana ?? body.week;
    if (semana !== undefined) proposta.semana = semana;
    return proposta;
}

export function validateTaskUpdate(raw: unknown): JsonRecord {
    const body = asRecord(raw);
    const path = safeMarkdownPath(body.path);
    const allowed = new Set([
        'path', 'status', 'priority', 'impacto', 'scheduled', 'due', 'clearScheduled',
        'clearDue', 'week', 'timeEstimate', 'projects', 'addProjects', 'removeProjects', 'contexts',
    ]);
    for (const key of Object.keys(body)) {
        if (!allowed.has(key)) throw new OperatorBridgeError('invalid_input', `Campo não permitido em update: ${key}.`);
    }
    const patch: JsonRecord = {};
    if (body.status !== undefined) {
        const status = boundedString(body.status, 'status', 32, true) as string;
        if (FINAL_STATUSES.has(status)) {
            throw new OperatorBridgeError('completion_requires_evidence', 'Use dfm_task_complete para concluir; cancelamento exige decisão humana.');
        }
        if (!OPEN_STATUSES.has(status)) throw new OperatorBridgeError('invalid_input', 'status não permitido pelo DFM.');
        patch.status = status;
    }
    if (body.priority !== undefined) {
        const priority = boundedString(body.priority, 'priority', 32, true) as string;
        if (!PRIORITIES.has(priority)) throw new OperatorBridgeError('invalid_input', 'priority não permitida pelo DFM.');
        patch.priority = priority;
    }
    if (body.impacto !== undefined) patch.impacto = validateImpact(body.impacto);
    if (body.week !== undefined) patch.week = validateWeek(body.week, true);
    if (body.timeEstimate !== undefined) patch.timeEstimate = validateTimeEstimate(body.timeEstimate);
    if (body.projects !== undefined && (body.addProjects !== undefined || body.removeProjects !== undefined)) {
        throw new OperatorBridgeError('invalid_input', 'Use projects (troca a lista) ou addProjects/removeProjects (acrescenta ou tira um pai), não os dois.');
    }
    if (body.projects !== undefined) patch.projects = stringList(body.projects, 'projects', 1, 8, 180).map(normalizeWikiLink);
    // Acrescentar e tirar um pai sem reescrever a lista (02/11/2026): um modelo pequeno que mandava só o
    // pai novo em `projects` apagava os outros; a conta da lista nova é do gateway, sobre a tarefa de agora.
    if (body.addProjects !== undefined) patch.addProjects = stringList(body.addProjects, 'addProjects', 1, 4, 180).map(normalizeWikiLink);
    if (body.removeProjects !== undefined) patch.removeProjects = stringList(body.removeProjects, 'removeProjects', 1, 4, 180).map(normalizeWikiLink);
    if (body.contexts !== undefined) patch.contexts = optionalStringList(body.contexts, 'contexts', 10);
    if (body.scheduled !== undefined) patch.scheduled = validateDate(body.scheduled, 'scheduled');
    if (body.due !== undefined) patch.due = validateDate(body.due, 'due');
    if (body.clearScheduled === true) patch.scheduled = null;
    if (body.clearDue === true) patch.due = null;
    if (Object.keys(patch).length === 0) throw new OperatorBridgeError('invalid_input', 'Nenhuma alteração válida foi informada.');
    return { path, patch };
}

export function safeMarkdownPath(raw: unknown): string {
    const path = boundedString(raw, 'path', 500, true) as string;
    if (path.startsWith('/') || path.includes('..') || path.includes('\\') || !path.toLowerCase().endsWith('.md')) {
        throw new OperatorBridgeError('invalid_path', 'Apenas caminho Markdown relativo ao vault é permitido.');
    }
    return path;
}

export class DshOperatorCore {
    private mutationTail: Promise<void> = Promise.resolve();
    private noticeTimes: number[] = [];
    private startedAt = '';

    constructor(
        private readonly plugin: DFMPlugin,
        private readonly auditSink?: OperatorAuditSink,
    ) {}

    setStartedAt(startedAt: string): void {
        this.startedAt = startedAt;
    }

    /**
     * O que faz: os ids que o agente pode abrir: os papéis da ponte pela tabela vigente do gerente.
     * Erro e ataque: sem gerente (a carga falhou), a lista é vazia e nada se abre.
     */
    private protocolosDaPonte(): ReadonlySet<string> {
        return protocolosDaPonte(this.plugin.manager?.tabelaDosPapeis?.());
    }

    private taskNotesPlugin(): TaskNotesPluginInstance | null {
        return (this.plugin.app as any).plugins?.getPlugin?.('tasknotes')
            ?? (this.plugin.app as any).plugins?.plugins?.tasknotes
            ?? null;
    }

    private taskNotesApi(requiredCapabilities: string[]): any {
        const tasknotes = this.taskNotesPlugin();
        const api = tasknotes?.api;
        if (!api || api.apiVersion !== 1) {
            throw new OperatorBridgeError('tasknotes_unavailable', 'TaskNotes Runtime API v1 não está disponível.', 503);
        }
        const missing = requiredCapabilities.filter(capability => !api.hasCapability?.(capability));
        if (missing.length > 0) {
            throw new OperatorBridgeError('tasknotes_incompatible', 'TaskNotes não oferece capabilities obrigatórias.', 503, { missing });
        }
        return api;
    }

    private async enqueueMutation<T>(action: () => Promise<T>): Promise<T> {
        const previous = this.mutationTail;
        let release!: () => void;
        this.mutationTail = new Promise<void>(resolve => { release = resolve; });
        await previous;
        try {
            return await action();
        } finally {
            release();
        }
    }

    async dispatch(route: string, rawBody: unknown, correlationId = createCorrelationId()): Promise<JsonRecord> {
        const body = rawBody && typeof rawBody === 'object' ? rawBody : {};
        switch (route) {
            case '/v1/health': return this.health();
            case '/v1/tasks/query': return this.queryTasks(body);
            // Um jeito por função (02/11): o agente que quer acrescentar uma tarefa propõe; a ponte não cria.
            case '/v1/tasks/create': return this.enqueueMutation(() => this.propose(propostaDaCriacao(body), correlationId));
            case '/v1/tasks/update': return this.enqueueMutation(() => this.updateTask(body, correlationId));
            case '/v1/tasks/complete': return this.enqueueMutation(() => this.completeTask(body, correlationId));
            case '/v1/notes/open': return this.openNote(body, correlationId);
            case '/v1/mission/query': return this.queryMission(body);
            case '/v1/mission/state': return this.missionState(body);
            case '/v1/proposals/create': return this.enqueueMutation(() => this.propose(body, correlationId));
            case '/v1/proposals/list': return this.listProposals(body);
            case '/v1/definitions/query': return this.queryDefinitions(body);
            case '/v1/node/query': return this.queryNode(body);
            case '/v1/protocols/run': return this.runProtocol(body, correlationId);
            case '/v1/notices/show': return this.showNotice(body, correlationId);
            default: throw new OperatorBridgeError('not_found', 'Rota inexistente.', 404);
        }
    }

    private async health(): Promise<JsonRecord> {
        const api = this.taskNotesApi(['tasks.read', 'tasks.write', 'system.health']);
        const runtime = await api.system.health();
        const adapter = this.plugin.app.vault.adapter as any;
        return {
            contractVersion: DSH_OPERATOR_CONTRACT_VERSION,
            status: 'ok',
            vault: this.plugin.app.vault.getName(),
            vaultPath: String(adapter.basePath ?? adapter.getBasePath?.() ?? ''),
            dfmSystemVersion: this.plugin.manifest.version,
            taskNotesVersion: this.taskNotesPlugin()?.manifest?.version ?? null,
            taskNotesApiVersion: api.apiVersion,
            capabilities: runtime.capabilities ?? [],
            startedAt: this.startedAt,
        };
    }

    /**
     * Leitura read-only do Mission Control para o agente.
     *
     * O snapshot completo carrega centenas de mapas e todo o catálogo de
     * protocolos; devolver isso inteiro custaria contexto sem servir à decisão.
     * A rota corta por seção e por teto, e **declara o corte** (`truncated`)
     * em vez de mentir por omissão. Nada é inferido do vault aqui: a projeção é
     * pura, recebe o que o motor já leu.
     */
    private async queryMission(raw: unknown): Promise<JsonRecord> {
        const body = asRecord(raw);
        const allowed = new Set(['sections', 'limits', 'fresh']);
        for (const key of Object.keys(body)) {
            if (!allowed.has(key)) throw new OperatorBridgeError('invalid_input', `Filtro não permitido: ${key}.`);
        }
        const sections = body.sections === undefined
            ? [...MISSION_SECTIONS]
            : stringList(body.sections, 'sections', 1, MISSION_SECTIONS.length, 32);
        for (const section of sections) {
            if (!(MISSION_SECTIONS as readonly string[]).includes(section)) {
                throw new OperatorBridgeError('invalid_input', `Seção desconhecida: ${section}.`);
            }
        }
        const limits = this.missionLimits(body.limits);
        const snapshot = await this.plugin.getMissionControl().build(body.fresh === true);
        return projectMissionSnapshot(snapshot, sections, limits);
    }

    /**
     * O modelo da Missão da versão de agora, pelo leitor do cofre do quadro (`board.missao`), com os
     * filtros da página: o mesmo que ele vê.
     * Erro e ataque: sem o quadro (o plugin ainda carregando), recusa com `missao_unavailable`.
     */
    private async missaoModelo(): Promise<MissaoModelo> {
        const missao = (this.plugin as any).board?.missao;
        if (!missao?.modelo) throw new OperatorBridgeError('missao_unavailable', 'A Missão ainda não está carregada.', 503);
        return missao.modelo();
    }

    /**
     * O estado e a ordem da Missão de um período (a integração 1 do agente pessoal, 02/11/2026): a lista
     * curta, na ordem que a Missão mostra, com o porquê dos pesos (`estadoDaMissao.ts`). Só lê.
     * Erro e ataque: período fora da lista, teto fora de 1 a 40 e chave desconhecida falham.
     */
    private async missionState(raw: unknown): Promise<JsonRecord> {
        const body = asRecord(raw);
        const allowed = new Set(['periodo', 'limite']);
        for (const key of Object.keys(body)) {
            if (!allowed.has(key)) throw new OperatorBridgeError('invalid_input', `Campo não permitido: ${key}.`);
        }
        const periodo = (boundedString(body.periodo, 'periodo', 20) ?? 'hoje') as PeriodoDoEstado;
        if (!(PERIODOS_DO_ESTADO as readonly string[]).includes(periodo)) {
            throw new OperatorBridgeError('invalid_input', `periodo deve ser um de: ${PERIODOS_DO_ESTADO.join(', ')}.`);
        }
        const limite = body.limite === undefined ? ITENS_DO_ESTADO.padrao : Number(body.limite);
        if (!Number.isInteger(limite) || limite < 1 || limite > ITENS_DO_ESTADO.maximo) {
            throw new OperatorBridgeError('invalid_input', `limite deve estar entre 1 e ${ITENS_DO_ESTADO.maximo}.`);
        }
        return { ...estadoDoPeriodo(await this.missaoModelo(), periodo, limite) };
    }

    /** A fila das propostas do quadro (`board.propostas`); sem ela, a Missão não carregou. */
    private filaDePropostas(): FilaDePropostas {
        const fila = (this.plugin as any).board?.propostas;
        if (!fila?.propor) throw new OperatorBridgeError('missao_unavailable', 'A Missão ainda não está carregada.', 503);
        return fila;
    }

    /**
     * A proposta do agente (a integração 2 do agente pessoal, 02/11/2026): confere pela mesma função do arrasto
     * e põe na fila da triagem; quem grava é a Missão, quando o operador aceita. Esta rota nunca grava a
     * TaskNote: só a fila (o arquivo de runtime das propostas).
     * Erro e ataque: a recusa da fila (o alvo que não existe, o gesto sem mudança, a fila cheia) volta com o
     * código e o porquê, para o agente corrigir.
     */
    private async propose(raw: unknown, correlationId: string): Promise<JsonRecord> {
        const body = asRecord(raw);
        const fila = this.filaDePropostas();
        let r: Awaited<ReturnType<FilaDePropostas['propor']>>;
        try {
            r = await fila.propor(body);
        } catch (error) {
            if (error instanceof RecusaDaProposta) {
                const status = error.code === 'task_exists' || error.code === 'proposals_full' ? 409 : error.code === 'proposal_target_not_found' ? 404 : 400;
                throw new OperatorBridgeError(error.code, error.message, status);
            }
            throw error;
        }
        await this.audit('proposal.create', r.proposta.id, correlationId, true);
        return {
            proposta: { id: r.proposta.id, acao: r.proposta.acao, texto: r.proposta.texto, porque: r.proposta.porque },
            repetida: r.repetida,
            pendentes: r.pendentes,
            onde: 'Espera na triagem da Missão (Propostas): só o operador aceita ou recusa.',
            correlationId,
        };
    }

    /**
     * O nó de uma nota para o agente (a integração 4 do agente pessoal, 02/11/2026): o ramo, os sinais, os
     * protocolos do painel com o porquê e as situações do P13 (`noParaOAgente.ts`). Só lê: os campos e as
     * ligações pelo cache de metadados, e o lido dos protocolos pela mesma leitura do painel do nó.
     * Erro e ataque: caminho fora do cofre ou não Markdown recusa; a nota sem nó na Missão dá 404.
     */
    private async queryNode(raw: unknown): Promise<JsonRecord> {
        const body = asRecord(raw);
        const allowed = new Set(['caminho', 'protocolos']);
        for (const key of Object.keys(body)) {
            if (!allowed.has(key)) throw new OperatorBridgeError('invalid_input', `Campo não permitido: ${key}.`);
        }
        const caminho = safeMarkdownPath(body.caminho);
        const modelo = await this.missaoModelo();
        // O que o painel do nó lê da borda (os campos, as ligações e os protocolos), pelo quadro.
        const borda: { leitor: LeitorDoRamo; protocolos(caminho: string, hoje: string): Promise<LidoDosProtocolos> } | null =
            (this.plugin as any).board?.leitorDoAgente?.() ?? null;
        const lido = body.protocolos === false || !borda ? null : await borda.protocolos(caminho, modelo.hoje);
        const no = noParaOAgente(modelo, caminho, lido, borda?.leitor ?? {}, this.protocolosDaPonte());
        if (!no) throw new OperatorBridgeError('node_not_found', 'A Missão não tem nó para esta nota.', 404);
        return { ...no };
    }

    /**
     * As propostas que esperam o operador, em forma curta: o que aceitar faz, o porquê, de onde veio e o que
     * muda (a tarefa, ou a nota e a seção da linha). Só lê.
     * Erro e ataque: campo no pedido recusa (a lista não tem filtro); sem a Missão, `missao_unavailable`.
     */
    private async listProposals(raw: unknown): Promise<JsonRecord> {
        const body = asRecord(raw);
        const extra = Object.keys(body)[0];
        if (extra !== undefined) throw new OperatorBridgeError('invalid_input', `Campo não permitido: ${extra}.`);
        const lista = await this.filaDePropostas().listar();
        return {
            total: lista.length,
            propostas: lista.map(p => ({
                id: p.id, acao: p.acao, titulo: p.titulo, texto: p.texto, porque: p.porque, criada: p.criada,
                origem: p.origem ?? ORIGEM_DO_AGENTE,
                ...(p.tarefa ? { tarefa: p.tarefa } : {}),
                ...(p.acao === 'linha' ? { nota: p.nota, secao: p.secao } : {}),
            })),
            onde: 'Esperam na triagem da Missão (Propostas): só o operador aceita (Y) ou recusa (X).',
        };
    }

    /**
     * As definições do sistema para o agente (05/11): as que o plugin usa (`definicoesDe`: os padrões, as camadas
     * de partida dos módulos e o bloco salvo), na forma curta (`definicoesParaOAgente`). Só lê.
     * Erro e ataque: campo no pedido recusa; nada da ponte (o token, a porta real em uso) sai daqui além do que
     * as definições dizem.
     */
    private async queryDefinitions(raw: unknown): Promise<JsonRecord> {
        const body = asRecord(raw);
        const extra = Object.keys(body)[0];
        if (extra !== undefined) throw new OperatorBridgeError('invalid_input', `Campo não permitido: ${extra}.`);
        const definicoes = definicoesDe(this.plugin);
        const salvo = !!(this.plugin as any).settings?.definicoes && typeof (this.plugin as any).settings.definicoes === 'object';
        return definicoesParaOAgente(definicoes, { fusoEfetivo: fusoDoSistema(definicoes), salvo });
    }

    /** Tetos nomeados da projeção; chave desconhecida falha em vez de ser ignorada. */
    private missionLimits(raw: unknown): Partial<MissionProjectionLimits> {
        if (raw === undefined) return {};
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            throw new OperatorBridgeError('invalid_input', 'limits deve ser um objeto.');
        }
        const limits: Partial<MissionProjectionLimits> = {};
        for (const [key, value] of Object.entries(raw as JsonRecord)) {
            if (!(key in DEFAULT_PROJECTION_LIMITS)) {
                throw new OperatorBridgeError('invalid_input', `Limite desconhecido: ${key}.`);
            }
            const num = Number(value);
            if (!Number.isInteger(num) || num < 1 || num > 500) {
                throw new OperatorBridgeError('invalid_input', `Limite inválido: ${key}.`);
            }
            (limits as JsonRecord)[key] = num;
        }
        return limits;
    }

    private async queryTasks(raw: unknown): Promise<JsonRecord> {
        const body = asRecord(raw);
        const allowed = new Set(['path', 'text', 'status', 'week', 'project', 'dueBefore', 'dueAfter', 'includeArchived', 'includeDetails', 'limit']);
        for (const key of Object.keys(body)) {
            if (!allowed.has(key)) throw new OperatorBridgeError('invalid_input', `Filtro não permitido: ${key}.`);
        }
        const api = this.taskNotesApi(['tasks.read']);
        let tasks: JsonRecord[] = await api.tasks.list();
        if (!Array.isArray(tasks)) tasks = [];
        const path = body.path === undefined ? undefined : safeMarkdownPath(body.path);
        const text = boundedString(body.text, 'text', 160)?.toLocaleLowerCase();
        const statuses = body.status === undefined
            ? undefined
            : (Array.isArray(body.status) ? stringList(body.status, 'status', 1, 7, 32) : [boundedString(body.status, 'status', 32, true) as string]);
        const week = body.week === undefined ? undefined : validateWeek(body.week, true);
        const project = boundedString(body.project, 'project', 180)?.replace(/^\[\[/, '').replace(/\]\]$/, '');
        const dueBefore = body.dueBefore === undefined ? undefined : validateDate(body.dueBefore, 'dueBefore');
        const dueAfter = body.dueAfter === undefined ? undefined : validateDate(body.dueAfter, 'dueAfter');
        const includeArchived = body.includeArchived === true;
        const includeDetails = body.includeDetails === true;
        const limit = body.limit === undefined ? 20 : Number(body.limit);
        if (!Number.isInteger(limit) || limit < 1 || limit > MAX_QUERY_RESULTS) {
            throw new OperatorBridgeError('invalid_input', `limit deve estar entre 1 e ${MAX_QUERY_RESULTS}.`);
        }
        tasks = tasks.filter(task => {
            if (!includeArchived && task.archived) return false;
            if (path && task.path !== path) return false;
            if (text && !String(task.title ?? '').toLocaleLowerCase().includes(text)) return false;
            if (statuses && !statuses.includes(String(task.status))) return false;
            if (week && String(customProperty(task, 'week') ?? '') !== week) return false;
            if (project) {
                const projects = Array.isArray(task.projects) ? task.projects : [];
                if (!projects.some((item: unknown) => String(item).replace(/^\[\[/, '').replace(/\]\]$/, '').includes(project))) return false;
            }
            const due = String(task.due ?? '').slice(0, 10);
            if (dueBefore && (!due || due > dueBefore.slice(0, 10))) return false;
            if (dueAfter && (!due || due < dueAfter.slice(0, 10))) return false;
            return true;
        });
        tasks.sort((a, b) => String(a.due ?? '9999').localeCompare(String(b.due ?? '9999')) || String(a.title ?? '').localeCompare(String(b.title ?? '')));
        return { total: tasks.length, tasks: tasks.slice(0, limit).map(task => taskProjection(task, includeDetails)) };
    }

    private assertCatalogValue(api: any, type: 'status' | 'priority', value: string): void {
        const entries = type === 'status' ? api.catalog.statuses() : api.catalog.priorities();
        const accepted = new Set((entries ?? []).flatMap((entry: any) => [entry.value, entry.id].filter(Boolean).map(String)));
        if (!accepted.has(value)) {
            throw new OperatorBridgeError('tasknotes_catalog_mismatch', `${type} não existe no catálogo atual do TaskNotes.`, 409, { value });
        }
    }

    /**
     * A criação que o operador aprovou na hora (o celular: cada chamada do agente pede o sim dele antes de
     * gravar). Fora da ponte HTTP: lá, criar uma tarefa é propor (`/v1/tasks/create` → a fila das propostas).
     * A tarefa nasce com `origem: agente`, como a proposta aceita.
     */
    createApprovedTask(raw: unknown, correlationId = createCorrelationId()): Promise<JsonRecord> {
        return this.enqueueMutation(() => this.createTask(raw, correlationId));
    }

    private async createTask(raw: unknown, correlationId: string): Promise<JsonRecord> {
        const input = validateTaskCreate(raw);
        const api = this.taskNotesApi(['tasks.read', 'tasks.write']);
        this.assertCatalogValue(api, 'status', input.status);
        this.assertCatalogValue(api, 'priority', input.priority);
        const existing = (await api.tasks.list()).find((task: JsonRecord) =>
            !task.archived && String(task.title ?? '').trim().toLocaleLowerCase() === input.title.toLocaleLowerCase());
        if (existing) throw new OperatorBridgeError('task_exists', 'Já existe uma tarefa ativa com este título.', 409, { path: existing.path });
        const customProperties: JsonRecord = { type: input.type, week: input.week, origem: ORIGEM_DO_AGENTE };
        for (const key of ['impacto', 'entregaObservavel', 'criterioSuficiente', 'valorContribuicao', 'limiteEscopo']) {
            if (input[key] !== undefined) {
                const targetKey: Record<string, string> = {
                    entregaObservavel: 'entrega_observavel', criterioSuficiente: 'criterio_suficiente',
                    valorContribuicao: 'valor_contribuicao', limiteEscopo: 'limite_escopo',
                };
                customProperties[targetKey[key] ?? key] = input[key];
            }
        }
        const taskData: JsonRecord = {
            title: input.title, status: input.status, priority: input.priority, tags: input.tags,
            projects: input.projects, contexts: input.contexts, scheduled: input.scheduled, due: input.due,
            timeEstimate: input.timeEstimate, details: input.details, customProperties,
        };
        for (const key of Object.keys(taskData)) if (taskData[key] === undefined) delete taskData[key];
        // O `type` (e as chaves da casa) em `customFrontmatter`: o TaskNotes grava de `customProperties`
        // só os campos do usuário, e a tarefa nascia sem `type` (`comTipoNaCriacao`).
        const created = await api.tasks.create(comTipoNaCriacao(taskData), mutationContext(correlationId, `criar tarefa DFM ${input.kind}`));
        await this.audit('task.create', created.path, correlationId, true);
        return { task: taskProjection(created, true), correlationId };
    }

    private async updateTask(raw: unknown, correlationId: string): Promise<JsonRecord> {
        const { path, patch } = validateTaskUpdate(raw);
        const api = this.taskNotesApi(['tasks.read', 'tasks.write']);
        const task = await api.tasks.get(path);
        if (!task) throw new OperatorBridgeError('task_not_found', 'Tarefa não encontrada.', 404);
        if (patch.status) this.assertCatalogValue(api, 'status', patch.status);
        if (patch.priority) this.assertCatalogValue(api, 'priority', patch.priority);
        if (taskType(task) === 'tarefa_smart' && patch.scheduled) {
            throw new OperatorBridgeError('smart_scheduled_forbidden', 'Tarefa SMART não recebe scheduled.');
        }
        const runtimePatch: JsonRecord = { ...patch };
        if (patch.addProjects || patch.removeProjects) {
            runtimePatch.projects = this.parentsAfter(task, path, patch.addProjects ?? [], patch.removeProjects ?? []);
            delete runtimePatch.addProjects;
            delete runtimePatch.removeProjects;
        }
        const custom = { ...(task.customProperties ?? {}) };
        for (const key of ['impacto', 'week']) {
            if (key in runtimePatch) {
                custom[key] = runtimePatch[key];
                delete runtimePatch[key];
            }
        }
        if (Object.keys(custom).length > 0) runtimePatch.customProperties = custom;
        const updated = await api.tasks.update(path, runtimePatch, mutationContext(correlationId, 'atualizar campos operacionais DFM'));
        await this.audit('task.update', path, correlationId, true);
        return { task: taskProjection(updated), correlationId };
    }

    /**
     * A lista de pais depois de acrescentar e tirar, sobre a tarefa de agora.
     * Erro e ataque: tirar o pai que a tarefa não tem (`parent_not_linked`), acrescentar uma nota que o cofre
     * não acha (`parent_not_found`, quando o cache de links responde) e ficar sem pai (`parent_required`:
     * acrescente o novo antes de tirar o último). O pai que já está não se repete.
     */
    private parentsAfter(task: JsonRecord, path: string, add: string[], remove: string[]): string[] {
        const key = (link: string) => link.replace(/^\[\[|\]\]$/g, '').split('|')[0].trim().toLocaleLowerCase();
        const current: string[] = (Array.isArray(task.projects) ? task.projects : task.projects ? [task.projects] : []).map(String);
        const removed = new Set(remove.map(key));
        for (const link of remove) {
            if (!current.some(item => key(item) === key(link))) {
                throw new OperatorBridgeError('parent_not_linked', `${link} não é pai desta tarefa.`, 409, { projects: current });
            }
        }
        const cache = (this.plugin.app as any).metadataCache;
        const name = (link: string) => link.replace(/^\[\[|\]\]$/g, '').split('|')[0].trim();
        for (const link of add) {
            if (typeof cache?.getFirstLinkpathDest === 'function' && !cache.getFirstLinkpathDest(name(link), path)) {
                throw new OperatorBridgeError('parent_not_found', `${link} não é uma nota do cofre.`, 404);
            }
        }
        const kept = current.filter(item => !removed.has(key(item)));
        for (const link of add) if (!kept.some(item => key(item) === key(link))) kept.push(link);
        if (kept.length === 0) throw new OperatorBridgeError('parent_required', 'A tarefa ficaria sem pai: acrescente o novo antes de tirar o último.', 409);
        return kept;
    }

    private async completeTask(raw: unknown, correlationId: string): Promise<JsonRecord> {
        const body = asRecord(raw);
        const path = safeMarkdownPath(body.path);
        const evidence = stringList(body.evidence, 'evidence', 1, 5, 500);
        const api = this.taskNotesApi(['tasks.read', 'tasks.write']);
        const task = await api.tasks.get(path);
        if (!task) throw new OperatorBridgeError('task_not_found', 'Tarefa não encontrada.', 404);
        if (task.archived || FINAL_STATUSES.has(String(task.status))) {
            throw new OperatorBridgeError('task_already_final', 'A tarefa já está em estado final.', 409);
        }
        if (task.recurrence || task.recurrence_parent) {
            throw new OperatorBridgeError('recurrence_not_supported', 'Conclusão de recorrência não faz parte do contrato v1.', 409);
        }
        const marker = `<!-- dfm-dsh:${correlationId} -->`;
        let details = String(task.details ?? '').trimEnd();
        if (!details.includes(marker)) {
            const section = ['', '## Evidências registradas pelo DSH', '', ...evidence.map(item => `- [x] ${item} ${marker}`)].join('\n');
            details = `${details}${section}\n`;
            await api.tasks.update(path, { details }, mutationContext(correlationId, 'registrar evidência antes da conclusão'));
        }
        const completed = await api.tasks.complete(path, undefined, mutationContext(correlationId, 'concluir tarefa com evidência'));
        await this.audit('task.complete', path, correlationId, true);
        return { task: taskProjection(completed, true), evidenceCount: evidence.length, correlationId };
    }

    private async openNote(raw: unknown, correlationId: string): Promise<JsonRecord> {
        const body = asRecord(raw);
        const path = safeMarkdownPath(body.path);
        const file = this.plugin.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) throw new OperatorBridgeError('note_not_found', 'Nota não encontrada.', 404);
        const leaf = this.plugin.app.workspace.getLeaf(false);
        await leaf.openFile(file);
        this.plugin.app.workspace.revealLeaf(leaf);
        await this.audit('note.open', path, correlationId, true);
        return { path, opened: true, correlationId };
    }

    private async runProtocol(raw: unknown, correlationId: string): Promise<JsonRecord> {
        const body = asRecord(raw);
        const id = boundedString(body.id, 'id', 100, true) as string;
        if (!this.protocolosDaPonte().has(id)) {
            throw new OperatorBridgeError('protocol_not_allowed', 'Protocolo fora da allowlist do DSH.', 403, { id });
        }
        const protocol = this.plugin.manager?.get(id);
        if (!protocol) throw new OperatorBridgeError('protocol_not_found', 'Protocolo não carregado.', 404, { id });
        void Promise.resolve(protocol.run()).catch((error: unknown) => {
            console.error(`DFM System: protocolo ${id} iniciado pelo DSH falhou:`, error);
        });
        await this.audit('protocol.run', id, correlationId, true);
        return { id, name: protocol.name, started: true, interactive: true, correlationId };
    }

    private async showNotice(raw: unknown, correlationId: string): Promise<JsonRecord> {
        const body = asRecord(raw);
        const message = boundedString(body.message, 'message', MAX_NOTICE_LENGTH, true) as string;
        const duration = body.durationMs === undefined ? 6000 : Number(body.durationMs);
        if (!Number.isInteger(duration) || duration < 3000 || duration > 15000) {
            throw new OperatorBridgeError('invalid_input', 'durationMs deve estar entre 3000 e 15000.');
        }
        const now = Date.now();
        this.noticeTimes = this.noticeTimes.filter(timestamp => now - timestamp < 60_000);
        if (this.noticeTimes.length >= 5) {
            throw new OperatorBridgeError('notice_rate_limited', 'Limite de cinco avisos por minuto atingido.', 429);
        }
        this.noticeTimes.push(now);
        new Notice(message, duration);
        await this.audit('notice.show', 'obsidian', correlationId, true);
        return { shown: true, durationMs: duration, correlationId };
    }

    private async audit(action: string, target: string, correlationId: string, ok: boolean, errorCode?: string): Promise<void> {
        await this.auditSink?.({ action, target, correlationId, ok, errorCode });
    }
}
