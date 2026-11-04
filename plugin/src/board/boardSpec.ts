/**
 * O contrato de autoria do quadro: um bloco ```dfm-widget``` num nó de texto.
 *
 * O bloco é renderizado pelo próprio Obsidian (processador de bloco de código),
 * então funciona igual em nó de canvas e em nota. O canvas cuida de posição,
 * tamanho, grupo e ligação; o bloco só diz **o que** desenhar:
 *
 *     ```dfm-widget
 *     tipo: projeto
 *     projeto: Um projeto de exemplo
 *     limite: 6
 *     ```
 *
 * Módulo puro: sem Obsidian, sem DOM.
 */
import { RAMO_DE_PARTIDA } from '../missao/ramoPrincipal';

export type BoardWidgetKind =
    | 'numeros'
    | 'matriz'
    | 'projeto'
    | 'projetos'
    | 'habitos'
    | 'tarefas'
    | 'consulta'
    | 'missao'
    | ProtocolWidgetKind;

/** Os módulos da página "Protocolos" (26/10/2026), também usáveis em canvas. */
export type ProtocolWidgetKind =
    | 'protocolos-saude'
    | 'protocolos-catalogo'
    | 'protocolos-mapa'
    | 'protocolos-uso'
    | 'protocolos-versoes'
    | 'protocolos-avisos'
    | 'protocolos-ferramentas';

export const PROTOCOL_WIDGET_KINDS: ReadonlyArray<ProtocolWidgetKind> = [
    'protocolos-saude', 'protocolos-catalogo', 'protocolos-mapa', 'protocolos-uso',
    'protocolos-versoes', 'protocolos-avisos', 'protocolos-ferramentas',
];

/** O que faz: o tipo é um dos módulos de protocolos. */
export function isProtocolWidgetKind(kind: string): kind is ProtocolWidgetKind {
    return (PROTOCOL_WIDGET_KINDS as readonly string[]).includes(kind);
}

export type QueryScopeKind = 'canvas' | 'projeto' | 'semana' | 'trimestre' | 'vault';
export type QueryShow = 'lista' | 'contagem' | 'progresso' | 'kanban' | 'grupos' | 'gantt' | 'matriz';
export type QueryGroup = 'status' | 'projeto' | 'semana' | 'contexto';
export type QueryPrazo = 'vencidas' | 'hoje' | 'semana' | 'sem-prazo';
export type QueryTaskKind = 'todas' | 'smart' | 'acoes';

export type BoardTaskFilter = 'abertas' | 'vencidas' | 'hoje' | 'execucao' | 'bloqueadas' | 'inbox' | 'proximas';

export interface BoardWidgetSpec {
    kind: BoardWidgetKind;
    /** Nome do projeto (`projeto`, e opcional em `tarefas`). */
    projeto?: string;
    /** Recorte da lista (`tarefas`). */
    filtro?: BoardTaskFilter;
    /** Quantos itens no máximo. */
    limite: number;
    /** Título que substitui o padrão. */
    titulo?: string;
    /** Dias de histórico (`habitos`): de 7 a 24, padrão 14. */
    dias?: number;
    /**
     * O ramo principal da Missão (`missao`), na chave `ramo_principal:` do bloco: o arquivo em
     * `Config/ramos/<id>.json`; padrão `missao` (§3.8). A chave `ramo:` do bloco é outra coisa: o filtro
     * que mostra o ramo do projeto (filtros.ts).
     */
    ramoPrincipal?: string;
    /* ---- consulta ---- */
    escopo?: QueryScopeKind;
    tarefas?: QueryTaskKind;
    /** `abertas`, `concluidas`, `todas` ou status do TaskNotes separados por vírgula. */
    status?: string;
    /** `atual` ou `AAAA-Www`. */
    semana?: string;
    contexto?: string;
    tag?: string;
    prazo?: QueryPrazo;
    mostrar?: QueryShow;
    agrupar?: QueryGroup;
}

export interface BoardCatalogEntry {
    kind: BoardWidgetKind;
    label: string;
    description: string;
    icon: string;
    /** Tamanho inicial do nó ao entrar no canvas. */
    size: { width: number; height: number };
    defaultLimit: number;
}

export const BOARD_CATALOG: ReadonlyArray<BoardCatalogEntry> = [
    { kind: 'numeros', label: 'Números do dia', description: 'Abertas, vencidas, hoje, em execução, hábitos', icon: 'gauge', size: { width: 720, height: 116 }, defaultLimit: 6 },
    { kind: 'matriz', label: 'Matriz', description: 'Urgência × impacto das tarefas na mesa', icon: 'layout-grid', size: { width: 560, height: 420 }, defaultLimit: 3 },
    { kind: 'projeto', label: 'Projeto', description: 'Progresso e próximas tarefas de um projeto', icon: 'folder-kanban', size: { width: 460, height: 380 }, defaultLimit: 5 },
    { kind: 'projetos', label: 'Projetos', description: 'Todos os projetos com tarefas, por progresso', icon: 'folders', size: { width: 460, height: 400 }, defaultLimit: 8 },
    { kind: 'habitos', label: 'Hábitos', description: 'Últimos 14 dias de cada hábito ativo', icon: 'repeat', size: { width: 460, height: 320 }, defaultLimit: 10 },
    { kind: 'tarefas', label: 'Lista de tarefas', description: 'Um recorte: vencidas, hoje, em execução, bloqueadas…', icon: 'list-checks', size: { width: 420, height: 340 }, defaultLimit: 8 },
    { kind: 'protocolos-saude', label: 'Protocolos · saúde', description: 'Quantos protocolos por fase, sem objetivo, órfãos, becos e sem uso; cada número filtra o catálogo', icon: 'heart-pulse', size: { width: 760, height: 200 }, defaultLimit: 10 },
    { kind: 'protocolos-catalogo', label: 'Protocolos · catálogo', description: 'Todos os protocolos com fase, uso, quem leva até cada um, objetivo e avisos; rodar, abrir, mudar a fase', icon: 'list', size: { width: 760, height: 560 }, defaultLimit: 40 },
    { kind: 'protocolos-mapa', label: 'Protocolos · mapa dos routers', description: 'A árvore do 🧭 e dos routers, na ordem em que o 🧭 mostra, com órfãos e becos', icon: 'git-fork', size: { width: 760, height: 520 }, defaultLimit: 50 },
    { kind: 'protocolos-uso', label: 'Protocolos · uso recente', description: 'Quantas vezes cada ferramenta rodou em 14 e 30 dias, e as sem uso', icon: 'activity', size: { width: 460, height: 420 }, defaultLimit: 10 },
    { kind: 'protocolos-versoes', label: 'Protocolos · versões em paralelo', description: 'Cada versão nova ao lado da que está em uso: fase e uso de cada uma', icon: 'git-compare', size: { width: 560, height: 260 }, defaultLimit: 10 },
    { kind: 'protocolos-avisos', label: 'Protocolos · avisos', description: 'Becos, órfãos, fase desconhecida, objetivo que falta, JSON com erro; e a bancada completa', icon: 'alert-triangle', size: { width: 460, height: 420 }, defaultLimit: 12 },
    { kind: 'protocolos-ferramentas', label: 'Protocolos · ferramentas', description: 'Gerar o mapa do 🧭, abrir o mapa e o inventário, rodar a bancada', icon: 'wrench', size: { width: 560, height: 260 }, defaultLimit: 4 },
    { kind: 'consulta', label: 'Consulta', description: 'Tarefas deste canvas (ou do projeto, semana, trimestre) filtradas e mostradas como lista, contagem, progresso, kanban ou grupos', icon: 'search', size: { width: 460, height: 360 }, defaultLimit: 10 },
    { kind: 'missao', label: 'Missão', description: 'Linha do tempo fractal em borboleta', icon: 'compass', size: { width: 900, height: 600 }, defaultLimit: 1 },
];

export const TASK_FILTERS: ReadonlyArray<{ id: BoardTaskFilter; label: string }> = [
    { id: 'proximas', label: 'Próximas ações' },
    { id: 'execucao', label: 'Em execução' },
    { id: 'hoje', label: 'Para hoje' },
    { id: 'vencidas', label: 'Vencidas' },
    { id: 'bloqueadas', label: 'Bloqueadas' },
    { id: 'inbox', label: 'Inbox' },
    { id: 'abertas', label: 'Todas abertas' },
];

/** Minúsculas e sem acento: `Hábitos` e `habitos` são o mesmo tipo. */
export function fold(value: string): string {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

const KIND_ALIASES: Record<string, BoardWidgetKind> = {
    missao: 'missao', mission: 'missao',
    numeros: 'numeros', vitais: 'numeros', kpis: 'numeros', stats: 'numeros',
    matriz: 'matriz', matrix: 'matriz',
    projeto: 'projeto', project: 'projeto',
    projetos: 'projetos', projects: 'projetos', portfolio: 'projetos',
    habitos: 'habitos', habits: 'habitos', rotina: 'habitos',
    tarefas: 'tarefas', tasks: 'tarefas', lista: 'tarefas',
    consulta: 'consulta', query: 'consulta', filtro: 'consulta',
    'protocolos-saude': 'protocolos-saude', 'saude-protocolos': 'protocolos-saude',
    'protocolos-catalogo': 'protocolos-catalogo', 'catalogo-protocolos': 'protocolos-catalogo', protocolos: 'protocolos-catalogo', protocols: 'protocolos-catalogo',
    'protocolos-mapa': 'protocolos-mapa', 'mapa-routers': 'protocolos-mapa', 'mapa-dos-routers': 'protocolos-mapa', routers: 'protocolos-mapa',
    'protocolos-uso': 'protocolos-uso', 'uso-protocolos': 'protocolos-uso', 'uso-recente': 'protocolos-uso',
    'protocolos-versoes': 'protocolos-versoes', 'versoes-paralelas': 'protocolos-versoes', 'versoes-em-paralelo': 'protocolos-versoes',
    'protocolos-avisos': 'protocolos-avisos', 'avisos-protocolos': 'protocolos-avisos',
    'protocolos-ferramentas': 'protocolos-ferramentas', 'ferramentas-protocolos': 'protocolos-ferramentas',
};

const pick = <T extends string>(allowed: readonly T[], raw: string | undefined): T | undefined => {
    if (!raw) return undefined;
    const v = fold(raw).replace(/\s+/g, '-');
    return (allowed as readonly string[]).includes(v) ? v as T : undefined;
};
const SCOPES = ['canvas', 'projeto', 'semana', 'trimestre', 'vault'] as const;
const SHOWS = ['lista', 'contagem', 'progresso', 'kanban', 'grupos', 'gantt', 'matriz'] as const;
const GROUPS = ['status', 'projeto', 'semana', 'contexto'] as const;
const PRAZOS = ['vencidas', 'hoje', 'semana', 'sem-prazo'] as const;
const KINDS = ['todas', 'smart', 'acoes'] as const;

const FILTER_ALIASES: Record<string, BoardTaskFilter> = {
    abertas: 'abertas', todas: 'abertas', open: 'abertas',
    vencidas: 'vencidas', atrasadas: 'vencidas', overdue: 'vencidas',
    hoje: 'hoje', today: 'hoje',
    execucao: 'execucao', 'em-execucao': 'execucao', fazendo: 'execucao', doing: 'execucao',
    bloqueadas: 'bloqueadas', esperando: 'bloqueadas', blocked: 'bloqueadas',
    inbox: 'inbox', entrada: 'inbox',
    proximas: 'proximas', 'proximas-acoes': 'proximas', next: 'proximas',
};

/** `[[Projeto X|alias]]` → `Projeto X`. */
function unlink(value: string): string {
    return value.replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim();
}

export type ParseResult = { ok: true; spec: BoardWidgetSpec } | { ok: false; error: string };

export function parseWidgetSpec(source: string): ParseResult {
    const fields: Record<string, string> = {};
    for (const raw of String(source ?? '').split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const match = line.match(/^([^:]+):\s*(.*)$/);
        if (!match) {
            // Uma palavra solta é o tipo: ```dfm-widget\nnumeros\n```.
            if (!fields.tipo) fields.tipo = line;
            continue;
        }
        fields[fold(match[1])] = match[2].trim().replace(/^["']|["']$/g, '');
    }

    const rawKind = fields.tipo ?? fields.type ?? fields.widget ?? '';
    if (!rawKind) return { ok: false, error: 'Falta dizer o tipo (ex.: `tipo: consulta`).' };
    const kind = KIND_ALIASES[fold(rawKind)] ?? KIND_ALIASES[fold(rawKind).replace(/\s+/g, '-')];
    if (!kind) {
        const known = BOARD_CATALOG.map(entry => entry.kind).join(', ');
        return { ok: false, error: `Tipo desconhecido: "${rawKind}". Tipos: ${known}.` };
    }

    const entry = BOARD_CATALOG.find(item => item.kind === kind)!;
    const spec: BoardWidgetSpec = { kind, limite: entry.defaultLimit };

    const projeto = unlink(fields.projeto ?? fields.project ?? '');
    if (projeto) spec.projeto = projeto;
    if (kind === 'projeto' && !spec.projeto) {
        return { ok: false, error: 'O widget de projeto precisa de `projeto: <nome>`.' };
    }

    const rawFilter = fields.filtro ?? fields.filter ?? '';
    if (rawFilter) {
        const filtro = FILTER_ALIASES[fold(rawFilter).replace(/\s+/g, '-')];
        if (!filtro) return { ok: false, error: `Filtro desconhecido: "${rawFilter}".` };
        spec.filtro = filtro;
    } else if (kind === 'tarefas') {
        spec.filtro = 'proximas';
    }

    const limite = Number.parseInt(fields.limite ?? fields.limit ?? '', 10);
    if (Number.isFinite(limite) && limite > 0) spec.limite = Math.min(limite, 50);

    const titulo = fields.titulo ?? fields.title ?? '';
    if (titulo) spec.titulo = titulo;

    if (kind === 'habitos') {
        const dias = Number.parseInt(fields.dias ?? fields.days ?? '', 10);
        // O snapshot guarda 24 dias; menos de 7 não mostra nem a semana.
        if (Number.isFinite(dias) && dias > 0) spec.dias = Math.max(7, Math.min(24, dias));
    }

    if (kind === 'missao') {
        // O ramo principal escolhe o centro e as colunas (arquitetura da Missão, §3.8); o nome é o do arquivo.
        const ramoPrincipal = fold(fields.ramo_principal ?? '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
        spec.ramoPrincipal = ramoPrincipal || RAMO_DE_PARTIDA;
    }

    if (kind === 'consulta') {
        const checks: Array<[keyof BoardWidgetSpec, readonly string[], string | undefined]> = [
            ['escopo', SCOPES, fields.escopo], ['mostrar', SHOWS, fields.mostrar], ['agrupar', GROUPS, fields.agrupar],
            ['prazo', PRAZOS, fields.prazo], ['tarefas', KINDS, fields.tarefas],
        ];
        for (const [key, allowed, raw] of checks) {
            if (raw === undefined || raw === '') continue;
            const value = pick(allowed, raw);
            if (!value) return { ok: false, error: `Valor desconhecido em ${String(key)}: "${raw}". Opções: ${allowed.join(', ')}.` };
            (spec as any)[key] = value;
        }
        spec.escopo = spec.escopo ?? 'canvas';
        spec.mostrar = spec.mostrar ?? 'lista';
        if (spec.mostrar === 'grupos' && !spec.agrupar) spec.agrupar = 'status';
        for (const key of ['status', 'semana', 'contexto', 'tag'] as const) {
            const raw = fields[key];
            if (raw) spec[key] = raw;
        }
        delete spec.filtro;
    }

    return { ok: true, spec };
}

/** O texto do nó que declara o widget — o inverso de `parseWidgetSpec`. */
export function widgetBlock(spec: Partial<BoardWidgetSpec> & { kind: BoardWidgetKind }): string {
    const lines = [`tipo: ${spec.kind}`];
    if (spec.projeto) lines.push(`projeto: ${spec.projeto}`);
    if (spec.filtro) lines.push(`filtro: ${spec.filtro}`);
    if (spec.titulo) lines.push(`titulo: ${spec.titulo}`);
    for (const key of ['escopo', 'tarefas', 'status', 'semana', 'contexto', 'tag', 'prazo', 'mostrar', 'agrupar'] as const) {
        if (spec[key]) lines.push(`${key}: ${spec[key]}`);
    }
    if (spec.dias) lines.push(`dias: ${spec.dias}`);
    if (spec.ramoPrincipal && spec.ramoPrincipal !== RAMO_DE_PARTIDA) lines.push(`ramo_principal: ${spec.ramoPrincipal}`);
    if (spec.limite) lines.push(`limite: ${spec.limite}`);
    return '```dfm-widget\n' + lines.join('\n') + '\n```';
}
