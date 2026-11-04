/**
 * Os passos comuns (arquitetura do núcleo de 21/10, seção 2, "Perguntar"; plano da
 * etapa 1, seção 4).
 *
 * "passos comuns escritos uma vez e usados por todos": cada arquivo de
 * `200 - FUNCTIONS/Protocolos/_comuns/` é `{ "comum", "objetivo", "steps" }`. Não é
 * protocolo (a pasta começa com `_`, e o carregador, o Cmd+D, os routers e os juízes
 * não a leem como tal). Um protocolo usa um comum no `steps`:
 *
 *   { "usar": "<nome>", "prefixo": "<p>", "next": "<id do passo seguinte>" }
 *
 * que se expande, na carga, nos passos do comum, com os ids prefixados (`<p>_<id>`) e
 * as referências internas acompanhando (condição, `returnTo`, `{{tokens}}`). O motor
 * segue a lista em ordem: o último passo do comum leva ao passo seguinte do protocolo,
 * e o `next` confere que esse passo é o que o autor quis (divergente é problema).
 * Sem `prefixo`, os ids ficam como no comum.
 *
 * Este módulo só calcula. A gêmea em Python é `Scripts/common_steps.py`, usada pelos
 * juízes (`validate_protocol_graph.py`, `audit_protocols.py`).
 */

/** A pasta dos comuns, dentro da pasta de protocolos. */
export const COMMONS_FOLDER = '_comuns';

export interface CommonDef {
    comum: string;
    objetivo: string;
    steps: any[];
}

const SNAKE = /^[a-z][a-z0-9_]*$/;
const COMMON_KEYS = ['comum', 'objetivo', 'steps'];
const USE_KEYS = ['usar', 'prefixo', 'next'];

/**
 * O que faz: confere um arquivo de comum e o devolve tipado.
 * Entra → sai: o JSON lido e o nome do arquivo (sem `.json`, opcional) → { comum,
 * problemas }; `comum` é `null` se ele não pode ser usado.
 * Erro e ataque: nome diferente do arquivo, objetivo em mais de uma linha, passo sem id
 * ou sem tipo, id repetido, `usar` dentro de um comum (não há comum de comum).
 * Prova: tests/engine/commonSteps.test.ts.
 */
export function parseCommon(raw: unknown, fileStem?: string): { comum: CommonDef | null; problemas: string[] } {
    const problemas: string[] = [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { comum: null, problemas: ['o comum não é um objeto JSON'] };
    const def: any = raw;
    const where = `comum '${typeof def.comum === 'string' ? def.comum : fileStem ?? '?'}'`;
    for (const key of Object.keys(def)) if (!COMMON_KEYS.includes(key)) problemas.push(`${where}: chave desconhecida '${key}'`);
    if (typeof def.comum !== 'string' || !SNAKE.test(def.comum)) problemas.push(`${where}: \`comum\` precisa ser um nome em snake_case`);
    else if (fileStem !== undefined && def.comum !== fileStem) problemas.push(`${where}: o nome difere do arquivo '${fileStem}.json'`);
    if (typeof def.objetivo !== 'string' || !def.objetivo.trim() || /[\r\n]/.test(def.objetivo)) problemas.push(`${where}: \`objetivo\` precisa ser uma linha de texto`);
    if (!Array.isArray(def.steps) || def.steps.length === 0) problemas.push(`${where}: \`steps\` precisa ser uma lista com ao menos um passo`);
    const ids = new Set<string>();
    let stepsOk = Array.isArray(def.steps) && def.steps.length > 0;
    for (const step of Array.isArray(def.steps) ? def.steps : []) {
        if (!step || typeof step !== 'object' || Array.isArray(step)) { problemas.push(`${where}: passo que não é objeto`); stepsOk = false; continue; }
        if (step.usar !== undefined) { problemas.push(`${where}: \`usar\` dentro de um comum não é aceito`); stepsOk = false; continue; }
        if (typeof step.id !== 'string' || !step.id) { problemas.push(`${where}: passo sem \`id\``); stepsOk = false; continue; }
        if (typeof step.type !== 'string' || !step.type) { problemas.push(`${where}: passo '${step.id}' sem \`type\``); stepsOk = false; }
        if (ids.has(step.id)) { problemas.push(`${where}: id repetido '${step.id}'`); stepsOk = false; }
        ids.add(step.id);
    }
    const usable = typeof def.comum === 'string' && SNAKE.test(def.comum) && stepsOk;
    return { comum: usable ? { comum: def.comum, objetivo: String(def.objetivo ?? ''), steps: def.steps } : null, problemas };
}

/** O que faz: o nome prefixado de uma variável do comum (o próprio nome, sem prefixo). */
function renamed(name: string, ids: string[], prefixo: string): string {
    if (!prefixo) return name;
    const own = ids.some(id => name === id || name.startsWith(`${id}_`));
    return own ? `${prefixo}_${name}` : name;
}

/** O que faz: copia o valor trocando os `{{tokens}}` que são variáveis do comum. */
function renameTokens(value: any, ids: string[], prefixo: string): any {
    if (typeof value === 'string') {
        return value.replace(/\{\{([^}]*)\}\}/g, (whole, token: string) => {
            const name = token.trim();
            return /^[A-Za-z0-9_]+$/.test(name) ? `{{${renamed(name, ids, prefixo)}}}` : whole;
        });
    }
    if (Array.isArray(value)) return value.map(item => renameTokens(item, ids, prefixo));
    if (value && typeof value === 'object') {
        const out: Record<string, any> = {};
        for (const [key, inner] of Object.entries(value)) out[key] = renameTokens(inner, ids, prefixo);
        return out;
    }
    return value;
}

/** O que faz: os passos de um comum com os ids e as referências internas prefixados. */
export function prefixCommonSteps(steps: any[], prefixo: string): any[] {
    const ids = (steps || []).map(step => String(step?.id ?? '')).filter(Boolean);
    return (steps || []).map(step => {
        const copy = renameTokens(JSON.parse(JSON.stringify(step)), ids, prefixo);
        if (!prefixo) return copy;
        copy.id = `${prefixo}_${copy.id}`;
        if (copy.condition && typeof copy.condition === 'object' && typeof copy.condition.variable === 'string') {
            copy.condition.variable = renamed(copy.condition.variable, ids, prefixo);
        }
        if (copy.returnTo && typeof copy.returnTo === 'object') {
            for (const [option, target] of Object.entries(copy.returnTo)) {
                if (typeof target === 'string' && ids.includes(target)) copy.returnTo[option] = `${prefixo}_${target}`;
            }
        }
        return copy;
    });
}

/**
 * O que faz: expande cada `{ usar, prefixo, next }` da lista de passos de um protocolo.
 * Por quê: o 📍 aceitar (e os próximos comuns) é escrito uma vez; cada protocolo o usa
 * sem copiar os passos, e a mudança no comum vale em todos.
 * Entra → sai: os passos do protocolo e os comuns por nome → { steps, problemas }. Sem
 * `usar`, devolve a mesma lista (mesma referência). Entrada com problema (comum que não
 * existe, chave desconhecida, prefixo inválido) sai da lista: o motor não recebe um
 * passo sem tipo, que abortaria a rodada no meio.
 * Erro e ataque: `next` que não é o passo seguinte, id do comum colidindo com um passo do
 * protocolo (o prefixo resolve), comum que não existe.
 * Prova: tests/engine/commonSteps.test.ts (o `usar: aceitar` expande igual ao 📍 do gesto).
 */
export function expandCommonSteps(steps: any[], commons: Map<string, CommonDef>): { steps: any[]; problemas: string[] } {
    if (!Array.isArray(steps) || !steps.some(step => step && typeof step === 'object' && 'usar' in step)) {
        return { steps, problemas: [] };
    }
    const problemas: string[] = [];
    const out: any[] = [];
    const checks: Array<{ nome: string; next: string; after: number }> = [];
    for (const step of steps) {
        if (!step || typeof step !== 'object' || !('usar' in step)) { out.push(step); continue; }
        const nome = String(step.usar ?? '');
        const where = `usar '${nome}'`;
        const extras = Object.keys(step).filter(key => !USE_KEYS.includes(key));
        if (extras.length) { problemas.push(`${where}: chave desconhecida ${extras.map(k => `'${k}'`).join(', ')}`); continue; }
        const comum = commons.get(nome);
        if (!comum) { problemas.push(`${where}: o comum não existe em _comuns/`); continue; }
        const prefixo = step.prefixo === undefined ? '' : step.prefixo;
        if (typeof prefixo !== 'string' || (prefixo !== '' && !SNAKE.test(prefixo))) { problemas.push(`${where}: \`prefixo\` precisa ser um nome em snake_case`); continue; }
        if (step.next !== undefined && typeof step.next !== 'string') { problemas.push(`${where}: \`next\` precisa ser o id de um passo`); continue; }
        out.push(...prefixCommonSteps(comum.steps, prefixo));
        if (typeof step.next === 'string') checks.push({ nome, next: step.next, after: out.length });
    }
    for (const check of checks) {
        const following = out[check.after]?.id ?? '';
        if (check.next !== following) {
            problemas.push(`usar '${check.nome}': next '${check.next}' não é o passo seguinte ('${following || 'fim'}'); o motor segue a ordem da lista`);
        }
    }
    const seen = new Set<string>();
    for (const step of out) {
        const id = step?.id;
        if (typeof id !== 'string') continue;
        if (seen.has(id)) problemas.push(`id repetido '${id}' depois de expandir os comuns (use \`prefixo\`)`);
        seen.add(id);
    }
    return { steps: out, problemas };
}
