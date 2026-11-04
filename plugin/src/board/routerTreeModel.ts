/**
 * A árvore dos routers, como o 🧭 a percorre, para o mapa navegável do painel
 * "Protocolos" do Mission Control.
 *
 * A noção é a do gerador do mapa do 🧭 (`200 - FUNCTIONS/Scripts/generate_router_map.py`):
 * cada parada é uma pergunta (o router e o passo `suggest`); cada opção leva a um
 * protocolo, a outro router (pelo alias, com as `redirectVariables` e o `carry`) ou a
 * outro passo do mesmo router (o passo condicionado à resposta). "❔ Não sei" e "🔙"
 * estão em toda parada e ficam fora, como no mapa. O alcance a partir do
 * router central é o do juiz (`audit_protocols.py`, `reachable_from_central`): menus,
 * `nextProtocol` e `redirect`.
 *
 * Nas paradas com `rankOptions`, as opções vêm na ordem que o 🧭 mostra
 * (`rankOptions`, `protocolRank.ts`), com os mesmos campos (fase e uso em 14 dias).
 *
 * Módulo puro: sem Obsidian, sem DOM. Prova: tests/board/routerTreeModel.test.ts.
 */
import { isNavigationOption, rankOptions, rankableTargets, stepTargets } from '../engine/protocolRank';
import type { DomainChoice } from '../engine/domainModel';

/** Para onde uma opção leva. */
export type OptionTarget =
    | { kind: 'protocol'; id: string }
    | { kind: 'question'; key: string }
    | { kind: 'missing'; id: string }
    | { kind: 'end' }
    | { kind: 'next' };

export interface OptionLink {
    option: string;
    target: OptionTarget;
    /** A linha do porquê da ordem (a do 🧭), quando a parada ordena por pesos. */
    note: string;
}

export interface RouterQuestion {
    key: string;
    router: string;
    stepId: string;
    prompt: string;
    /** A parada ordena por pesos (`rankOptions`) como o 🧭. */
    ranked: boolean;
    options: OptionLink[];
}

export interface RouterGraph {
    /** As perguntas alcançadas a partir das raízes, por chave `router::passo`. */
    questions: Map<string, RouterQuestion>;
    /** As raízes: o router central primeiro, depois os outros routers pelo id. */
    roots: Array<{ router: string; key: string }>;
}

export interface RankInput {
    modelo: DomainChoice;
    tabela: Record<string, any>;
    /** Os campos do protocolo de destino (`fase_uso`, `uso_recente`), como o 🧭 os lê. */
    campos: (id: string) => Record<string, any>;
    /** O nível da reputação do protocolo de destino, citado na linha do porquê como o 🧭 cita; sem ele, não cita. */
    nivel?: (id: string) => string | null | undefined;
    /** O grau do nível da reputação do protocolo de destino, que desempata a ordem como no 🧭; sem ele, a ordem dos pesos. */
    grau?: (id: string) => number | null | undefined;
}

/** O que faz: os `dynamicNextProtocol` de uma definição como lista (objeto solto vira lista de um). */
export function routerEntries(def: any): Array<{ stepId?: string; map?: Record<string, string | null> }> {
    const raw = def?.dynamicNextProtocol;
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return list.filter((entry: any) => entry && typeof entry === 'object');
}

/** O que faz: o id é de um router de verdade (`router_*` sem `redirect`). */
export function isRouterDef(id: string, def: any): boolean {
    return String(id).startsWith('router_') && !(typeof def?.redirect === 'string' && def.redirect);
}

/** O que faz: a chave de uma pergunta. */
export function questionKey(router: string, stepId: string): string {
    return `${router}::${stepId}`;
}

function conditionOf(step: any): { variable: unknown; values: unknown[] } {
    const cond = step?.condition && typeof step.condition === 'object' ? step.condition : {};
    return { variable: cond.variable, values: Array.isArray(cond.value) ? cond.value : [cond.value] };
}

function suggestSteps(def: any): any[] {
    return (Array.isArray(def?.steps) ? def.steps : []).filter((s: any) => s && s.type === 'suggest' && Array.isArray(s.options) && s.options.length);
}

/**
 * O que faz: o destino real de um id: o alias que leva a router (ou a outro alias)
 * vira o router, com as `redirectVariables` somadas (as do alias de fora vencem).
 * Por quê: é assim que o gerador do mapa resolve (`_resolve`), até 4 saltos.
 */
export function resolveAlias(defs: ReadonlyMap<string, any>, id: string, depth = 0): { real: string; preset: Record<string, any> } {
    const def = defs.get(id);
    const target = def?.redirect;
    if (typeof target === 'string' && target && depth < 4 && defs.has(target)) {
        if (target.startsWith('router_') || defs.get(target)?.redirect) {
            const inner = resolveAlias(defs, target, depth + 1);
            return { real: inner.real, preset: { ...inner.preset, ...(def?.redirectVariables && typeof def.redirectVariables === 'object' ? def.redirectVariables : {}) } };
        }
    }
    return { real: id, preset: {} };
}

/**
 * O que faz: o passo em que o router abre: o primeiro `suggest` sem condição; com a
 * resposta desse passo já dada (carry ou alias), o passo condicionado a essa resposta.
 */
export function entryStep(def: any, preset: Record<string, any>): any | null {
    const steps = suggestSteps(def);
    const first = steps.find(s => !s.condition) ?? steps[0] ?? null;
    if (first && Object.prototype.hasOwnProperty.call(preset, first.id)) {
        const answer = preset[first.id];
        const sub = steps.find(s => conditionOf(s).variable === first.id && conditionOf(s).values.includes(answer));
        if (sub) return sub;
    }
    return first;
}

/**
 * O que faz: as opções de uma parada com o destino de cada uma, na ordem do 🧭.
 * Entra → sai: definições, o router, o passo e (opcional) os pesos → `OptionLink[]`.
 * Erro e ataque: destino que não existe vira `missing` (beco); opção sem destino no
 * map e sem passo condicionado vira `next` (segue no protocolo); `null` vira `end`.
 */
function optionsOf(defs: ReadonlyMap<string, any>, router: string, step: any, rank: RankInput | null, ask: (router: string, step: any) => string): OptionLink[] {
    const def = defs.get(router);
    const map = stepTargets(def, step.id) ?? {};
    const steps = suggestSteps(def);
    const carry = def?.carry && typeof def.carry === 'object' ? def.carry : {};
    let order: string[] = (step.options as unknown[]).filter((o): o is string => typeof o === 'string');
    let notes: Record<string, string> = {};
    if (rank && typeof step.rankOptions === 'string' && step.rankOptions) {
        const ranked = rankOptions(order, rankableTargets(order, map, router), rank.campos, rank.modelo, rank.tabela, rank.nivel, rank.grau);
        order = ranked.options;
        notes = ranked.notes;
    }
    const out: OptionLink[] = [];
    for (const option of order) {
        if (isNavigationOption(option)) continue;
        let target: OptionTarget;
        if (Object.prototype.hasOwnProperty.call(map, option)) {
            const dest = map[option];
            if (typeof dest !== 'string' || !dest) target = { kind: 'end' };
            else if (!defs.has(dest)) target = { kind: 'missing', id: dest };
            else {
                const { real, preset } = resolveAlias(defs, dest);
                if (isRouterDef(real, defs.get(real))) {
                    const entry = entryStep(defs.get(real), { ...preset, ...(carry[dest] && typeof carry[dest] === 'object' ? carry[dest] : {}) });
                    target = entry ? { kind: 'question', key: ask(real, entry) } : { kind: 'protocol', id: dest };
                } else {
                    target = { kind: 'protocol', id: dest };
                }
            }
        } else {
            const sub = steps.find(s => conditionOf(s).variable === step.id && conditionOf(s).values.includes(option));
            target = sub ? { kind: 'question', key: ask(router, sub) } : { kind: 'next' };
        }
        out.push({ option, target, note: notes[option] ?? '' });
    }
    return out;
}

/**
 * O que faz: as perguntas de todos os routers alcançadas a partir das raízes (o
 * primeiro menu e cada router), com as opções na ordem do 🧭.
 * Por quê: o mapa do painel mostra a mesma árvore do mapa gerado do 🧭, navegável.
 * Entra → sai: definições por id, (opcional) os pesos e o id do primeiro menu (o papel
 * `perguntar_a_situacao` da tabela vigente; `null` = nenhum, todos em ordem de id) → `RouterGraph`.
 * Erro e ataque: ciclos (router que volta a outro) não repetem pergunta; router sem
 * passo `suggest` não vira raiz.
 * Prova: tests/board/routerTreeModel.test.ts.
 */
export function buildRouterGraph(defs: ReadonlyMap<string, any>, rank: RankInput | null = null, central: string | null = null): RouterGraph {
    const questions = new Map<string, RouterQuestion>();
    const pending: Array<{ router: string; step: any }> = [];
    const ask = (router: string, step: any): string => {
        const key = questionKey(router, String(step.id));
        if (!questions.has(key) && !pending.some(p => questionKey(p.router, String(p.step.id)) === key)) pending.push({ router, step });
        return key;
    };
    const routerIds = [...defs.keys()].filter(id => isRouterDef(id, defs.get(id)))
        .sort((a, b) => (a === central ? -1 : b === central ? 1 : a.localeCompare(b)));
    const roots: RouterGraph['roots'] = [];
    for (const router of routerIds) {
        const entry = entryStep(defs.get(router), {});
        if (entry) roots.push({ router, key: ask(router, entry) });
    }
    while (pending.length) {
        const { router, step } = pending.shift()!;
        const key = questionKey(router, String(step.id));
        if (questions.has(key)) continue;
        // A pergunta entra antes das opções: uma opção que volta a ela não a enfileira de novo.
        const question: RouterQuestion = { key, router, stepId: String(step.id), prompt: String(step.prompt ?? ''), ranked: typeof step.rankOptions === 'string' && !!step.rankOptions && !!rank, options: [] };
        questions.set(key, question);
        question.options = optionsOf(defs, router, step, rank, ask);
    }
    return { questions, roots };
}

/**
 * O que faz: os protocolos que este abre: os destinos do `dynamicNextProtocol`, o
 * `nextProtocol` e o `redirect` (a mesma lista do juiz, `protocol_edges`).
 */
export function protocolEdges(def: any): string[] {
    const out = new Set<string>();
    for (const entry of routerEntries(def)) {
        for (const target of Object.values(entry.map ?? {})) if (typeof target === 'string' && target) out.add(target);
    }
    for (const key of ['nextProtocol', 'redirect']) if (typeof def?.[key] === 'string' && def[key]) out.add(def[key]);
    return [...out];
}

/**
 * O que faz: os ids alcançáveis a partir do primeiro menu por qualquer caminho (o do juiz).
 * Entra → sai: as definições e o id do primeiro menu (`null` = nenhum) → os ids alcançados.
 */
export function reachableFromCentral(defs: ReadonlyMap<string, any>, central: string | null): Set<string> {
    const seen = new Set<string>();
    const stack = central ? [central] : [];
    while (stack.length) {
        const id = stack.pop()!;
        if (seen.has(id) || !defs.has(id)) continue;
        seen.add(id);
        stack.push(...protocolEdges(defs.get(id)));
    }
    return seen;
}

/** O que faz: quem abre cada protocolo (o inverso de `protocolEdges`), em ordem de id. */
export function openersOf(defs: ReadonlyMap<string, any>): Map<string, string[]> {
    const out = new Map<string, string[]>();
    for (const [id, def] of defs) {
        for (const target of protocolEdges(def)) {
            if (target === id) continue;
            const list = out.get(target) ?? [];
            if (!list.includes(id)) list.push(id);
            out.set(target, list);
        }
    }
    for (const list of out.values()) list.sort((a, b) => a.localeCompare(b));
    return out;
}

/** Uma opção que aponta para um id que não existe. */
export interface DeadEnd { from: string; stepId: string; option: string; target: string }

/** O que faz: toda opção de `dynamicNextProtocol` (de qualquer protocolo) que aponta para id inexistente. */
export function deadEnds(defs: ReadonlyMap<string, any>): DeadEnd[] {
    const out: DeadEnd[] = [];
    for (const [id, def] of defs) {
        for (const entry of routerEntries(def)) {
            for (const [option, target] of Object.entries(entry.map ?? {})) {
                if (typeof target === 'string' && target && !defs.has(target)) out.push({ from: id, stepId: String(entry.stepId ?? ''), option, target });
            }
        }
    }
    return out.sort((a, b) => a.from.localeCompare(b.from) || a.option.localeCompare(b.option));
}

/**
 * O que faz: o caminho de perguntas, a partir de uma raiz, até a primeira pergunta com
 * uma opção que abre o protocolo `id` (direto ou por um alias dele). `null` se nenhuma.
 * Por quê: "mostrar no mapa" abre a árvore até onde o protocolo aparece.
 * Entra → sai: o grafo, as definições e o id → chaves da raiz até a pergunta (inclusive).
 */
export function pathToProtocol(graph: RouterGraph, defs: ReadonlyMap<string, any>, id: string): string[] | null {
    const leadsTo = (link: OptionLink) => link.target.kind === 'protocol' && (link.target.id === id || defs.get(link.target.id)?.redirect === id);
    for (const root of graph.roots) {
        const parent = new Map<string, string | null>([[root.key, null]]);
        const queue = [root.key];
        while (queue.length) {
            const key = queue.shift()!;
            const question = graph.questions.get(key);
            if (!question) continue;
            const routerReached = isRouterDef(id, defs.get(id)) && question.router === id && key !== root.key;
            if (question.options.some(leadsTo) || routerReached) {
                const path: string[] = [];
                for (let at: string | null = key; at !== null; at = parent.get(at) ?? null) path.unshift(at);
                return path;
            }
            for (const link of question.options) {
                if (link.target.kind === 'question' && !parent.has(link.target.key)) {
                    parent.set(link.target.key, key);
                    queue.push(link.target.key);
                }
            }
        }
        if (root.router === id) return [root.key];
    }
    return null;
}
