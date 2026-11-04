/**
 * Do catálogo de protocolos ao que cada módulo da página "Protocolos" do Mission
 * Control mostra: saúde, catálogo, uso recente, versões em paralelo e avisos.
 *
 * Tudo aqui conta ferramentas, nunca a pessoa: contagem de usos, sem porcentagem, sem
 * sequência, sem medalha. Sem Day lida, o uso é "sem leitura", não zero. As checagens
 * são as baratas e claras; a auditoria completa é a da bancada (`run_judges.py`).
 *
 * Módulo puro: sem Obsidian, sem DOM. Prova: tests/board/protocolModel.test.ts.
 */
import type { ProtocolCatalogInput } from '../engine/protocolCatalog';
import { protocolGroup } from '../engine/protocolGroups';
import { USO_RECENTE_DIAS } from '../engine/protocolRank';
import { windowStart } from '../engine/protocolCatalog';
import { buildRouterGraph, deadEnds, isRouterDef, openersOf, reachableFromCentral, type DeadEnd, type RouterGraph } from './routerTreeModel';
import type { Tone } from './boardModel';

/** Os valores de `fase_uso` que o sistema conhece (os mesmos do juiz, `FASES_USO`). */
export const FASES_USO = ['nova', 'em_uso', 'dominada', 'aposentada'] as const;
export type FaseUso = typeof FASES_USO[number];
export type FaseKey = FaseUso | 'sem_fase' | 'desconhecida';

export const FASE_LABEL: Record<FaseKey, string> = {
    em_uso: 'em uso',
    nova: 'nova',
    dominada: 'dominada',
    aposentada: 'aposentada',
    sem_fase: 'sem fase',
    desconhecida: 'fase desconhecida',
};

export const FASE_TONE: Record<FaseKey, Tone> = {
    em_uso: 'good', nova: 'accent', dominada: 'neutral', aposentada: 'muted', sem_fase: 'muted', desconhecida: 'warn',
};

/** O que faz: a fase de uso de uma definição; valor fora dos quatro vira `desconhecida`. */
export function faseKey(def: any): FaseKey {
    const raw = def?.fase_uso;
    if (raw === undefined || raw === null || raw === '') return 'sem_fase';
    return (FASES_USO as readonly string[]).includes(raw) ? raw as FaseUso : 'desconhecida';
}

/**
 * O que faz: o problema do `objetivo`, ou `null` quando é uma linha de texto (a regra do
 * juiz, `objetivo_problema`).
 */
export function objetivoProblem(value: unknown): string | null {
    if (typeof value !== 'string') return `tem de ser texto, veio ${value === null ? 'nulo' : typeof value}`;
    if (!value.trim()) return 'está vazio';
    if (value.includes('\n')) return 'tem mais de uma linha';
    return null;
}

export type WarningKind =
    | 'beco' | 'orfao' | 'fase_desconhecida' | 'objetivo_invalido' | 'redirect_inexistente'
    | 'next_inexistente' | 'paralela_inexistente' | 'sem_objetivo';

export const WARNING_LABEL: Record<WarningKind, string> = {
    beco: 'Opção que leva a protocolo que não existe',
    orfao: 'Sem caminho a partir do 🧭',
    fase_desconhecida: 'fase_uso desconhecida',
    objetivo_invalido: 'objetivo que não é uma linha',
    redirect_inexistente: 'redirect para protocolo que não existe',
    next_inexistente: 'nextProtocol para protocolo que não existe',
    paralela_inexistente: 'versaoParalelaDe para protocolo que não existe',
    sem_objetivo: 'Sem objetivo escrito',
};

export interface ProtocolWarning {
    kind: WarningKind;
    id: string;
    text: string;
    /** Só informa (o objetivo que falta): não conta como aviso no filtro "com aviso". */
    info: boolean;
}

export interface CatalogRow {
    id: string;
    name: string;
    icon: string;
    group: string;
    path: string | null;
    fase: FaseKey;
    /** O valor escrito, quando é desconhecido. */
    faseRaw: string | null;
    objetivo: string | null;
    /** Usos nos últimos 14 e 30 dias; `null` sem Day lida (sem leitura). */
    uses14: number | null;
    uses30: number | null;
    /** O último dia com uso na janela de 30 dias, ou `null`. */
    lastUsed: string | null;
    /** Quem abre este protocolo (menus, `nextProtocol`, alias). */
    openedBy: string[];
    isRouter: boolean;
    /** O destino, quando é alias (`redirect`). */
    aliasOf: string | null;
    parallelOf: string | null;
    orphan: boolean;
    /** Exceção declarada de cobertura do 🧭 (o motivo), quando há. */
    coverageException: string | null;
    warnings: ProtocolWarning[];
}

export type CatalogFlag = 'todos' | 'sem_uso' | 'sem_objetivo' | 'com_aviso' | 'orfao' | 'beco';

export interface CatalogFilter {
    query: string;
    fase: FaseKey | 'todas';
    group: string;
    flag: CatalogFlag;
}

export const EMPTY_FILTER: CatalogFilter = { query: '', fase: 'todas', group: 'todos', flag: 'todos' };

export interface ProtocolPanelModel {
    today: string;
    /** O primeiro menu (o papel `perguntar_a_situacao`); `null` = o cofre não tem, e ninguém é órfão. */
    central: string | null;
    rows: CatalogRow[];
    groups: string[];
    graph: RouterGraph;
    defs: ReadonlyMap<string, any>;
    deadEnds: DeadEnd[];
    failures: Array<{ path: string; error: string }>;
    /** Uso legível (alguma Day da janela foi lida). */
    usageReadable: boolean;
    daysRead: number;
    window: { desde: string; ate: string };
}

const isAlias = (def: any) => typeof def?.redirect === 'string' && !!def.redirect;

/**
 * O que faz: os avisos baratos de um protocolo: becos nos menus dele, sem caminho no
 * 🧭, fase desconhecida, objetivo inválido ou ausente, e `redirect`, `nextProtocol` e
 * `versaoParalelaDe` para id que não existe.
 * Por quê: o painel aponta o que está quebrado antes da bancada completa.
 * Entra → sai: id, definição, todas as definições, os becos e se é órfão → avisos.
 * Erro e ataque: alias sem `objetivo` conta como coberto quando o destino tem (a regra
 * do juiz); objetivo `null` ou número é inválido, não ausente.
 */
export function protocolWarnings(id: string, def: any, defs: ReadonlyMap<string, any>, ends: DeadEnd[], orphan: boolean): ProtocolWarning[] {
    const out: ProtocolWarning[] = [];
    for (const end of ends) if (end.from === id) out.push({ kind: 'beco', id, text: `"${end.option}" → ${end.target}`, info: false });
    if (orphan) out.push({ kind: 'orfao', id, text: 'nenhum caminho a partir do primeiro menu', info: false });
    if (faseKey(def) === 'desconhecida') out.push({ kind: 'fase_desconhecida', id, text: `fase_uso: ${JSON.stringify(def.fase_uso)}`, info: false });
    if (def && Object.prototype.hasOwnProperty.call(def, 'objetivo')) {
        const problem = objetivoProblem(def.objetivo);
        if (problem) out.push({ kind: 'objetivo_invalido', id, text: `objetivo ${problem}`, info: false });
    } else if (!(isAlias(def) && typeof defs.get(def.redirect)?.objetivo === 'string')) {
        out.push({ kind: 'sem_objetivo', id, text: 'sem objetivo', info: true });
    }
    const missing: Array<[WarningKind, string]> = [['redirect_inexistente', 'redirect'], ['next_inexistente', 'nextProtocol'], ['paralela_inexistente', 'versaoParalelaDe']];
    for (const [kind, key] of missing) {
        const target = def?.[key];
        if (typeof target === 'string' && target && !defs.has(target)) out.push({ kind, id, text: `${key} → ${target}`, info: false });
    }
    return out;
}

/** O que faz: quantas datas caem a partir de `desde` (inclusive). */
function countSince(dates: string[], desde: string): number {
    return dates.filter(date => date >= desde).length;
}

/**
 * O que faz: o modelo inteiro da página a partir do catálogo do snapshot.
 * Por quê: os sete módulos leem a mesma conta; um modelo único evita que a saúde e o
 * catálogo discordem.
 * Entra → sai: `ProtocolCatalogInput` → `ProtocolPanelModel` (linhas por grupo e nome).
 * Erro e ataque: definição sem id fica de fora; sem modelo de pesos, as paradas ficam na
 * ordem do JSON; uso `null` vira "sem leitura" em todas as linhas.
 * Prova: tests/board/protocolModel.test.ts.
 */
export function buildProtocolPanel(input: ProtocolCatalogInput): ProtocolPanelModel {
    const defs = new Map<string, any>();
    const paths = new Map<string, string | null>();
    for (const entry of input.defs || []) {
        if (!entry?.id) continue;
        defs.set(entry.id, entry.def);
        paths.set(entry.id, entry.path ?? null);
    }
    const usage = input.usage;
    const since14 = windowStart(input.today, USO_RECENTE_DIAS);
    const dates = (id: string): string[] => usage?.[id] ?? [];
    const rank = input.rank
        ? {
            modelo: input.rank.modelo,
            tabela: input.rank.tabela,
            campos: (id: string) => {
                const def = defs.get(id);
                const fase = def?.fase_uso || (isAlias(def) ? defs.get(def.redirect)?.fase_uso : undefined);
                return { ...(typeof fase === 'string' && fase ? { fase_uso: fase } : {}), uso_recente: dates(id).filter(d => d >= since14) };
            },
            nivel: (id: string) => input.rank?.niveis?.[id] ?? null,
            grau: (id: string) => input.rank?.graus?.[id] ?? null,
        }
        : null;
    const central = input.central ?? null;
    const graph = buildRouterGraph(defs, rank, central);
    const reach = reachableFromCentral(defs, central);
    const openers = openersOf(defs);
    const ends = deadEnds(defs);
    const exceptions = input.coverageExceptions ?? {};
    const rows: CatalogRow[] = [];
    for (const [id, def] of defs) {
        const fase = faseKey(def);
        const orphan = !!central && id !== central && !reach.has(id) && !isAlias(def) && fase !== 'aposentada';
        const used = dates(id);
        rows.push({
            id,
            name: String(def?.name ?? id),
            icon: String(def?.icon ?? 'star'),
            group: protocolGroup(id),
            path: paths.get(id) ?? null,
            fase,
            faseRaw: fase === 'desconhecida' ? String(def.fase_uso) : null,
            objetivo: typeof def?.objetivo === 'string' && def.objetivo.trim() ? def.objetivo : null,
            uses14: usage ? countSince(used, since14) : null,
            uses30: usage ? used.length : null,
            lastUsed: used.length ? [...used].sort().pop()! : null,
            openedBy: openers.get(id) ?? [],
            isRouter: isRouterDef(id, def),
            aliasOf: isAlias(def) ? def.redirect : null,
            parallelOf: typeof def?.versaoParalelaDe === 'string' && def.versaoParalelaDe ? def.versaoParalelaDe : null,
            orphan,
            coverageException: orphan && typeof exceptions[id] === 'string' ? exceptions[id] : null,
            warnings: protocolWarnings(id, def, defs, ends, orphan),
        });
    }
    rows.sort((a, b) => a.group.localeCompare(b.group, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id));
    return {
        today: input.today,
        central,
        rows,
        groups: [...new Set(rows.map(r => r.group))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
        graph,
        defs,
        deadEnds: ends,
        failures: [...(input.failures ?? [])],
        usageReadable: usage !== null,
        daysRead: input.daysRead,
        window: input.window,
    };
}

/** O que faz: a linha tem algum aviso que não é só informação. */
export function hasWarning(row: CatalogRow): boolean {
    return row.warnings.some(w => !w.info);
}

/**
 * O que faz: as linhas que passam no filtro (busca, fase, grupo e marca).
 * Busca: nome, id, grupo e objetivo, sem acento e sem caixa. "Sem uso" deixa de fora os
 * alias (rodam o destino, que conta o uso) e, sem leitura das Days, não devolve nada.
 */
export function filterRows(rows: readonly CatalogRow[], filter: CatalogFilter): CatalogRow[] {
    const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const words = fold(filter.query || '').split(/\s+/).filter(Boolean);
    return rows.filter(row => {
        if (filter.fase !== 'todas' && row.fase !== filter.fase) return false;
        if (filter.group !== 'todos' && row.group !== filter.group) return false;
        switch (filter.flag) {
            case 'sem_uso': if (row.uses14 !== 0 || row.aliasOf) return false; break;
            case 'sem_objetivo': if (!row.warnings.some(w => w.kind === 'sem_objetivo')) return false; break;
            case 'com_aviso': if (!hasWarning(row)) return false; break;
            case 'orfao': if (!row.orphan) return false; break;
            case 'beco': if (!row.warnings.some(w => w.kind === 'beco')) return false; break;
            default: break;
        }
        if (!words.length) return true;
        const hay = fold(`${row.name} ${row.id} ${row.group} ${row.objetivo ?? ''}`);
        return words.every(word => hay.includes(word));
    });
}

export interface HealthTile {
    key: string;
    label: string;
    /** O número, ou "sem leitura" quando não há dado. */
    value: string;
    tone: Tone;
    /** O filtro do catálogo que o clique aplica; `null` = não filtra. */
    filter: CatalogFilter | null;
    hint: string;
}

/**
 * O que faz: os números da saúde do catálogo, cada um com o filtro do catálogo que ele abre.
 * Por quê: a saúde é a porta do catálogo: o número leva às linhas que ele conta.
 * Erro e ataque: sem Day lida, "sem uso em 14 dias" diz "sem leitura", não 0.
 */
export function healthTiles(model: ProtocolPanelModel): HealthTile[] {
    const rows = model.rows;
    const tile = (key: string, label: string, count: number, tone: Tone, filter: Partial<CatalogFilter> | null, hint: string): HealthTile => ({
        key, label, value: String(count), tone: count ? tone : 'muted', filter: filter ? { ...EMPTY_FILTER, ...filter } : null, hint,
    });
    const byFase = (fase: FaseKey) => rows.filter(r => r.fase === fase).length;
    const tiles: HealthTile[] = [
        tile('total', 'Protocolos', rows.length, 'accent', {}, 'todos os protocolos carregados'),
        tile('em_uso', FASE_LABEL.em_uso, byFase('em_uso'), FASE_TONE.em_uso, { fase: 'em_uso' }, 'fase_uso: em_uso'),
        tile('nova', FASE_LABEL.nova, byFase('nova'), FASE_TONE.nova, { fase: 'nova' }, 'fase_uso: nova'),
        tile('dominada', FASE_LABEL.dominada, byFase('dominada'), FASE_TONE.dominada, { fase: 'dominada' }, 'fase_uso: dominada'),
        tile('aposentada', FASE_LABEL.aposentada, byFase('aposentada'), FASE_TONE.aposentada, { fase: 'aposentada' }, 'fase_uso: aposentada (o arquivo fica; no 🧭, vem por último)'),
        tile('sem_fase', FASE_LABEL.sem_fase, byFase('sem_fase'), 'neutral', { fase: 'sem_fase' }, 'sem fase_uso no JSON'),
    ];
    const unknown = byFase('desconhecida');
    if (unknown) tiles.push(tile('desconhecida', FASE_LABEL.desconhecida, unknown, 'warn', { fase: 'desconhecida' }, 'fase_uso fora de nova, em_uso, dominada, aposentada'));
    tiles.push(
        tile('sem_objetivo', 'sem objetivo', rows.filter(r => r.warnings.some(w => w.kind === 'sem_objetivo')).length, 'neutral', { flag: 'sem_objetivo' }, 'sem a linha de objetivo (o texto é seu)'),
        tile('orfao', 'órfãos', rows.filter(r => r.orphan).length, 'warn', { flag: 'orfao' }, 'nenhum caminho a partir do 🧭 (alias e aposentada não contam)'),
        tile('beco', 'becos', model.deadEnds.length, 'bad', { flag: 'beco' }, 'opções que levam a protocolo que não existe'),
    );
    const semUso = model.usageReadable ? rows.filter(r => r.uses14 === 0 && !r.aliasOf).length : null;
    tiles.push(semUso === null
        ? { key: 'sem_uso', label: `sem uso em ${USO_RECENTE_DIAS} dias`, value: 'sem leitura', tone: 'muted', filter: null, hint: 'nenhuma Day da janela pôde ser lida' }
        : tile('sem_uso', `sem uso em ${USO_RECENTE_DIAS} dias`, semUso, 'neutral', { flag: 'sem_uso' }, 'nenhuma linha do motor nas Days dos últimos 14 dias (alias não contam)'));
    if (model.failures.length) {
        tiles.push({ key: 'falha', label: 'JSON com erro', value: String(model.failures.length), tone: 'bad', filter: null, hint: model.failures.map(f => f.path).join('\n') });
    }
    return tiles;
}

export interface UsageBar { id: string; name: string; icon: string; count: number }

export interface UsageModel {
    readable: boolean;
    daysRead: number;
    window: { desde: string; ate: string };
    top14: UsageBar[];
    top30: UsageBar[];
    /** O maior número de cada janela (para desenhar as barras). */
    max14: number;
    max30: number;
    unused14: Array<{ id: string; name: string; fase: FaseKey }>;
}

/**
 * O que faz: o uso das ferramentas nas duas janelas: as mais usadas (com uso) e as sem
 * uso em 14 dias. Alias ficam de fora (o uso é do destino).
 * Por quê: contagem das ferramentas, não da pessoa: sem porcentagem, sem sequência.
 */
export function usageModel(model: ProtocolPanelModel, limit: number): UsageModel {
    const own = model.rows.filter(r => !r.aliasOf);
    const top = (pick: (r: CatalogRow) => number | null) => own
        .map(r => ({ id: r.id, name: r.name, icon: r.icon, count: pick(r) ?? 0 }))
        .filter(b => b.count > 0)
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'))
        .slice(0, Math.max(1, limit));
    const top14 = model.usageReadable ? top(r => r.uses14) : [];
    const top30 = model.usageReadable ? top(r => r.uses30) : [];
    return {
        readable: model.usageReadable,
        daysRead: model.daysRead,
        window: model.window,
        top14,
        top30,
        max14: Math.max(0, ...top14.map(b => b.count)),
        max30: Math.max(0, ...top30.map(b => b.count)),
        unused14: model.usageReadable ? own.filter(r => r.uses14 === 0).map(r => ({ id: r.id, name: r.name, fase: r.fase })) : [],
    };
}

export interface ParallelPair {
    /** A versão nova (a que declara `versaoParalelaDe`). */
    nova: CatalogRow;
    /** A versão em uso; `null` quando o id declarado não existe. */
    atual: CatalogRow | null;
    atualId: string;
}

/** O que faz: os pares de versões em paralelo (`versaoParalelaDe`), lado a lado. */
export function parallelPairs(model: ProtocolPanelModel): ParallelPair[] {
    const byId = new Map(model.rows.map(r => [r.id, r]));
    return model.rows
        .filter(r => r.parallelOf)
        .map(r => ({ nova: r, atual: byId.get(r.parallelOf!) ?? null, atualId: r.parallelOf! }))
        .sort((a, b) => a.atualId.localeCompare(b.atualId));
}

export interface WarningGroup { kind: WarningKind; label: string; info: boolean; items: ProtocolWarning[] }

/** O que faz: os avisos agrupados por tipo: os que pedem conserto primeiro, os informativos no fim. */
export function warningGroups(model: ProtocolPanelModel): WarningGroup[] {
    const groups = new Map<WarningKind, ProtocolWarning[]>();
    for (const row of model.rows) for (const w of row.warnings) groups.set(w.kind, [...(groups.get(w.kind) ?? []), w]);
    const order = Object.keys(WARNING_LABEL) as WarningKind[];
    return order.filter(kind => groups.has(kind)).map(kind => ({
        kind, label: WARNING_LABEL[kind], info: kind === 'sem_objetivo', items: groups.get(kind)!,
    }));
}

/**
 * O que faz: as fases que o menu oferece para um protocolo (as quatro conhecidas, menos a atual).
 * A ordem é a do ciclo da ferramenta: nova → em uso → dominada → aposentada.
 */
export function faseChoices(current: FaseKey): FaseUso[] {
    return FASES_USO.filter(f => f !== current);
}
