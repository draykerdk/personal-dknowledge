/**
 * O mais provável primeiro em cada parada do 🧭 Router Central (Fase D; arquitetura do
 * núcleo de 21/10, 4.3; plano de 22/10, seção 4).
 *
 * Num passo `suggest` de router com `"rankOptions": "<domínio>"` (hoje, `protocolos`),
 * as opções que levam a um protocolo são ordenadas pela função de escolher do núcleo
 * (`choose.ts`), com os campos do protocolo de destino: a `fase_uso` do JSON e o uso
 * recente (as vezes em que ele rodou nos últimos 14 dias, pelas linhas que o motor grava
 * nas Days). O que não leva a protocolo (outro passo, "❔", "🔙") fica onde está. O peso
 * propõe a ordem, com o porquê; a escolha é sua: a opção devolvida é o texto escrito no JSON, e a linha do porquê
 * aparece discreta, abaixo dela.
 *
 * Este módulo só calcula; quem lê as Days é o serviço do núcleo (`nucleoService.ts`), e
 * quem mostra é o `DFM_Suggester`. Prova: tests/engine/protocolRank.test.ts.
 */
import { formatPoints } from './decisionWeights';
import { escolher, fieldList, type Motivo } from './choose';
import type { DomainChoice } from './domainModel';
import { DIA } from './dia';
import { protocoloDaMarca } from './protocolGroups';

/** O domínio que os routers usam (`Config/dominios/protocolos.json`). */
export const PROTOCOLOS_DOMINIO = 'protocolos';
/** A janela do uso recente, em dias (hoje incluído). */
export const USO_RECENTE_DIAS = 14;
/** A opção de toda parada de router que não sabe para onde ir: volta ao primeiro menu. */
export const DONT_KNOW_OPTION = '❔ Não sei / outra coisa';
/** Uma Day lida: a data (`AAAA-MM-DD`), o texto e o frontmatter. */
export interface DayRead {
    date: string;
    text: string;
    campos: Record<string, any>;
}

/** O que faz: a opção é de navegação ("🔙 …" ou "❔ …"), não um destino. */
export function isNavigationOption(option: unknown): boolean {
    return typeof option === 'string' && /^\s*(🔙|❔)/u.test(option);
}

/** O que faz: o `map` do primeiro router do `dynamicNextProtocol` com este passo, ou `null`. */
export function stepTargets(def: any, stepId: string): Record<string, string | null> | null {
    const raw = def?.dynamicNextProtocol;
    const routers = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const router = routers.find((r: any) => r?.stepId === stepId);
    return router && router.map && typeof router.map === 'object' ? router.map : null;
}

/**
 * O que faz: as opções de um passo sem as que levam a um protocolo que o cofre não tem.
 * Por quê: D1 do mapa da v0: o router do pacote (ou de outro cofre) pode citar protocolos que este
 * cofre não tem; a opção que levaria a eles some, sem aviso, em vez de abrir um beco.
 * Entra → sai: as opções, o `map` do passo (`stepTargets`) e o "existe?" do gerente → as opções que
 * ficam, na mesma ordem. Opção sem entrada no map (outro passo) ou com destino `null` (o fim) fica.
 * Erro e ataque: o "existe?" que lança conta como ausente; opções que não são lista dão `[]`.
 * Prova: tests/engine/protocolRank.test.ts ("as opções sem protocolo").
 */
export function opcoesComDestino(options: unknown, targets: Record<string, string | null> | null, existe: (id: string) => boolean): string[] {
    if (!Array.isArray(options)) return [];
    return options.filter(option => {
        const target = targets?.[String(option)];
        if (typeof target !== 'string' || !target) return true;
        try { return existe(target); } catch (e) { return false; }
    });
}

/**
 * O que faz: o protocolo de destino de cada opção que conta para a ordem.
 * Conta: a opção com destino no map (texto não vazio), que não é "🔙"/"❔" e não reabre
 * o próprio router. Outro passo (sem entrada no map), fim (`null`), "🔙" e "❔" ficam fora.
 */
export function rankableTargets(options: string[], targets: Record<string, string | null> | null, selfId: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const option of options || []) {
        const target = targets?.[option];
        if (typeof target !== 'string' || !target || target === selfId || isNavigationOption(option)) continue;
        out[option] = target;
    }
    return out;
}

const CHAVES_GENERICAS = ['type', 'status', 'date', 'day', 'week', 'quarter', 'tags'];

const escapeRegex = (text: string) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const filled = (value: unknown): boolean => {
    if (value === undefined || value === null) return false;
    if (Array.isArray(value)) return value.some(filled);
    return String(value).trim() !== '';
};

/**
 * O que faz: as linhas dos registros automáticos de uma Day (entre DFM_LOGS_START e
 * DFM_LOGS_END; sem os marcadores, o texto todo), sem as linhas de botão ("> button: …"),
 * que trazem os rótulos dos protocolos sem que eles tenham rodado.
 */
function logLines(text: string): string[] {
    const all = String(text || '');
    const start = all.indexOf('<!-- DFM_LOGS_START -->');
    const end = all.indexOf('<!-- DFM_LOGS_END -->');
    const part = start !== -1 && end > start ? all.slice(start, end) : all;
    return part.split('\n').filter(line => !/^\s*(>\s*)?button:/.test(line));
}

/**
 * O que faz: as datas das Days em que o protocolo rodou (uma por uso), na mesma regra do
 * painel "🧰 Ferramentas na superfície" (`week_act_adler.js`, `rastroDe`) e do P3:
 * - `logMode: append` com campo próprio nas `properties`: um desses campos preenchido
 *   no frontmatter da Day (um uso por dia);
 * - os outros: a linha do motor "**[HH:mm] Protocolo <rótulo> executado:**" (o rótulo é
 *   o `dailyLedgerLabel` ou o `name`) e, no `append`, "**[HH:mm] <rótulo>**";
 *   "interrompido (rascunho)" não conta;
 * - a linha com a marca do id (`<!-- dfm-protocolo:<id> -->`, desde 02/11) conta pelo id, e não pelo
 *   rótulo: trocar o nome não apaga o uso, e o rótulo igual de outro protocolo não conta aqui;
 * - alias: o uso do destino (`resolveDef`).
 * Erro e ataque: definição ausente, Day sem texto, rótulo com caracteres de regex.
 */
export function usoDatas(def: any, days: DayRead[], resolveDef: (id: string) => any = () => null, depth = 0): string[] {
    if (!def || typeof def !== 'object') return [];
    if (typeof def.redirect === 'string' && def.redirect) {
        return depth < 3 ? usoDatas(resolveDef(def.redirect), days, resolveDef, depth + 1) : [];
    }
    const props = def.properties && typeof def.properties === 'object' ? def.properties : {};
    if (def.logMode === 'append') {
        const keys = Object.keys(props).filter(key => !CHAVES_GENERICAS.includes(key));
        if (keys.length) return (days || []).filter(day => keys.some(key => filled(day?.campos?.[key]))).map(day => day.date);
    }
    const label = String(def.dailyLedgerLabel || def.name || def.id || '').trim();
    const id = String(def.id || '');
    // A marca do id: deste protocolo, ou de um alias que aponta para ele.
    const ehDeste = (marca: string) => marca === id || resolveDef(marca)?.redirect === id;
    const executed = label ? new RegExp(`Protocolo ${escapeRegex(label)} executado`) : null;
    const section = label && def.logMode === 'append' ? new RegExp(`^\\s*(-\\s*)?\\*\\*\\[\\d{1,2}:\\d{2}\\] ${escapeRegex(label)}\\*\\*\\s*$`) : null;
    const execucao = /Protocolo .+ executado|^\s*(-\s*)?\*\*\[\d{1,2}:\d{2}\] .+\*\*/;
    const dates: string[] = [];
    for (const day of days || []) {
        if (!day?.date) continue;
        for (const line of logLines(day.text)) {
            const marca = protocoloDaMarca(line);
            if (marca) { if (ehDeste(marca) && execucao.test(line) && !/interrompido/.test(line)) dates.push(day.date); continue; }
            if (Boolean(executed && executed.test(line)) || Boolean(section && section.test(line))) dates.push(day.date);
        }
    }
    return dates;
}

/**
 * O que faz: os campos de um protocolo como candidato do domínio `protocolos`:
 * `fase_uso` (a do JSON; num alias sem a sua, a do destino) e `uso_recente` (as datas
 * dos usos nas Days dadas, que já são as da janela).
 */
export function protocolCampos(def: any, days: DayRead[], resolveDef: (id: string) => any = () => null): Record<string, any> {
    let fase = def?.fase_uso;
    if (!fase && typeof def?.redirect === 'string') fase = resolveDef(def.redirect)?.fase_uso;
    return {
        ...(typeof fase === 'string' && fase ? { fase_uso: fase } : {}),
        uso_recente: usoDatas(def, days, resolveDef),
    };
}

/** O que faz: as datas `AAAA-MM-DD` da janela do uso recente que termina em `hoje`. */
export function usoRecenteJanela(hoje: string, dias = USO_RECENTE_DIAS): { desde: string; ate: string } {
    const base = new Date(`${hoje}T12:00:00Z`);
    if (!DIA.test(String(hoje)) || Number.isNaN(base.getTime())) return { desde: '', ate: '' };
    const start = new Date(base.getTime() - (Math.max(1, dias) - 1) * 86400000);
    return { desde: start.toISOString().slice(0, 10), ate: hoje };
}

const FASE_TEXTO: Record<string, string> = {
    em_uso: '⭐ em uso',
    nova: '🌱 nova',
    dominada: '✔️ dominada',
    aposentada: 'aposentada',
};

const pts = (n: number) => (n ? ` ${n > 0 ? '+' : ''}${formatPoints(n)}` : '');

/**
 * A categoria das situações do nó (o P13, 02/11): os fatos da situação do nó que leva a este protocolo (o sinal ou
 * o estado), em `Config/dominios/protocolos.json`; nos routers o campo não existe e vale 0, sem aparecer.
 */
export const CONTEXTO_DO_NO = 'contexto_do_no';

/**
 * O que faz: a linha do porquê de uma opção, discreta, como nos outros lugares do núcleo
 * (o texto e os pontos de cada categoria): "⭐ em uso +2 · rodou 2× em 14 dias +2".
 * Sem fase e sem uso, a linha fica vazia (a falta de uso não é dita como falta).
 * Outra categoria que o modelo ganhar entra como o núcleo a escreve.
 */
export function protocolReasonLine(motivos: Motivo[], campos: Record<string, any>): string {
    const parts: string[] = [];
    for (const motivo of motivos || []) {
        if (motivo.chave === 'fase_uso') {
            const fase = String(campos?.fase_uso ?? '');
            if (fase && FASE_TEXTO[fase]) parts.push(`${FASE_TEXTO[fase]}${pts(motivo.pontos)}`);
            continue;
        }
        if (motivo.chave === 'uso_recente') {
            const n = fieldList(campos?.uso_recente).length;
            if (n > 0) parts.push(`rodou ${n}× em ${USO_RECENTE_DIAS} dias${pts(motivo.pontos)}`);
            continue;
        }
        // A situação do nó (o P13): "porque <o fato>", com os pontos da tabela; sem fato, nada.
        if (motivo.chave === CONTEXTO_DO_NO) {
            const fatos = fieldList(campos?.[CONTEXTO_DO_NO]).map(f => String(f).trim()).filter(Boolean);
            if (fatos.length) parts.push(`porque ${fatos.join(', ')}${pts(motivo.pontos)}`);
            continue;
        }
        if (motivo.texto.startsWith('sem dado:')) continue;
        parts.push(`${motivo.texto}${pts(motivo.pontos)}`);
    }
    return parts.join(' · ');
}

/**
 * O que faz: os destinos de cada parada de router: `<router>.<passo>` → os protocolos do `map` dela (sem o fim,
 * `null`, nem o vazio), uma vez cada, na ordem do `map`.
 * Por quê: as situações do nó (o P13, 02/11) só sobem o que a parada do 🧭 oferece; é o mesmo `map` que o
 * `stepTargets` lê para a ordem dos routers e que o juiz (`situation_route_problems`) confere.
 * Entra → sai: as definições (id e JSON) → as paradas com destino.
 * Erro e ataque: definição sem `dynamicNextProtocol`, entrada sem `stepId` ou sem `map`: fica de fora.
 * Prova: tests/engine/protocolRank.test.ts ("os destinos das paradas").
 */
export function destinosDasParadas(defs: ReadonlyArray<{ id: string; def: unknown }>): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const { id, def } of defs) {
        const raw = (def as any)?.dynamicNextProtocol;
        for (const r of Array.isArray(raw) ? raw : raw ? [raw] : []) {
            if (!r || typeof r.stepId !== 'string' || !r.map || typeof r.map !== 'object') continue;
            const chave = `${id}.${r.stepId}`;
            if (out[chave]) continue;
            out[chave] = [...new Set(Object.values(r.map as Record<string, unknown>).filter((v): v is string => typeof v === 'string' && !!v))];
        }
    }
    return out;
}

/** Quanto se espera, no máximo, pela primeira carga dos protocolos (ms). */
export const ESPERA_DOS_PROTOCOLOS_MS = 15_000;

/**
 * O que faz: espera a primeira carga dos protocolos do gerente (`ProtocolManager.carregado`), até
 * um teto; o gerente já carregado, ou sem a promessa (os testes, outro lugar), volta na hora.
 * Por quê: a prévia de 02/11: logo depois de recarregar o plugin, a Missão abre antes de o gerente
 * ler os protocolos; o que se lia então (os campos para os pesos, o nível da reputação, os tipos)
 * vinha vazio e ficava guardado, e o porquê da seção Protocolos saía sem o peso e sem o nível.
 * Entra → sai: o gerente (ou nada) e o teto → quando a carga terminou (ou o teto passou).
 * Prova: tests/missao/reputacaoNoLugar.test.ts.
 */
export async function esperarProtocolos(manager: any, ms: number = ESPERA_DOS_PROTOCOLOS_MS): Promise<void> {
    const carregado = manager?.carregado;
    if (!carregado || typeof carregado.then !== 'function' || manager?.protocols?.size) return;
    let teto: ReturnType<typeof setTimeout> | undefined;
    try {
        await Promise.race([carregado, new Promise<void>(r => { teto = setTimeout(r, Math.max(0, ms)); })]);
    } finally {
        if (teto !== undefined) clearTimeout(teto);
    }
}

/** O nível da reputação de um protocolo, como a ordem o cita (`niveisDaReputacao`); vazio = não cita. */
export type NivelDoProtocolo = (protocolId: string) => string | null | undefined;
/** O grau do nível da reputação de um protocolo (`grausDaReputacao`), para o desempate; sem número = sem grau. */
export type GrauDoProtocolo = (protocolId: string) => number | null | undefined;

/**
 * O que faz: a linha do porquê com o nível da reputação do protocolo citado no fim:
 * "⭐ em uso +2 · reputação: com base"; sem nível, a linha como veio.
 * Por quê: "a ordem que o peso propõe passa a citar o nível" (proposta da reputação contextual,
 * 29/10/2026). O nível não entra nos pontos (o aprendizado está desligado); o grau dele só desempata a
 * ordem (`rankOptions`, 02/11).
 * Prova: tests/engine/protocolRank.test.ts ("cita a reputação").
 */
export function comReputacao(linha: string, nivel: string | null | undefined): string {
    const n = String(nivel ?? '').trim();
    if (!n) return linha;
    return [linha, `reputação: ${n}`].filter(Boolean).join(' · ');
}

export interface RankedOptions {
    /** As opções na ordem de mostrar (os textos do JSON, sem mudança). */
    options: string[];
    /** A linha do porquê de cada opção que conta para a ordem (vazia não entra). */
    notes: Record<string, string>;
}

/**
 * O que faz: a ordem das opções de um passo pelos pontos dos protocolos de destino.
 * Por quê: "em cada parada o mais provável vem primeiro" (núcleo, 4.3), sem mexer no que
 * não é destino: as opções que levam a protocolo trocam de lugar entre si, nas posições
 * que já eram delas; outro passo, "❔" e "🔙" ficam onde estavam.
 * Entra → sai: as opções, o destino de cada uma que conta (`rankableTargets`), os campos
 * de cada destino, o bloco `escolher` do modelo e os pontos → { options, notes }.
 * Ordem: total decrescente; no empate, o grau da reputação mais alto e, depois, a ordem escrita
 * no JSON (sem dado nenhum, nada muda). O eliminado por filtro vai para a última posição de protocolo, com o motivo.
 * O nível da reputação de cada destino (`nivelDe`, opcional) é citado no fim da linha
 * (`comReputacao`); o grau dele (`grauDe`, opcional) só desempata: no mesmo total, o grau mais alto
 * primeiro (desde 02/11/2026: sem esses status, a regra geral é que mais reputação dá mais
 * prioridade); os pontos declarados decidem antes, e sem grau vale a ordem escrita.
 * Erro e ataque: destino sem campos (0 ponto), opção repetida, modelo sem categorias.
 */
export function rankOptions(
    options: string[],
    targets: Record<string, string>,
    camposDe: (protocolId: string) => Record<string, any>,
    modelo: DomainChoice,
    tabela: Record<string, any>,
    nivelDe: NivelDoProtocolo = () => null,
    grauDe: GrauDoProtocolo = () => null,
): RankedOptions {
    const list = Array.isArray(options) ? [...options] : [];
    const slots: number[] = [];
    list.forEach((option, index) => { if (targets?.[option]) slots.push(index); });
    if (slots.length < 1) return { options: list, notes: {} };
    const candidatos = slots.map(index => ({ id: list[index], titulo: list[index], campos: camposDe(targets[list[index]]) || {} }));
    const escolha = escolher(candidatos, modelo, tabela);
    const order = new Map(slots.map((slot, i) => [list[slot], i]));
    const notes: Record<string, string> = {};
    const grau = (option: string) => { try { const g = grauDe(targets[option]); return typeof g === 'number' && Number.isFinite(g) ? g : -1; } catch (e) { return -1; } };
    const ranked = [...escolha.ordenados].sort((a, b) => b.total - a.total || grau(b.id) - grau(a.id) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    const nivel = (option: string) => { try { return nivelDe(targets[option]); } catch (e) { return null; } };
    for (const item of ranked) {
        const line = comReputacao(protocolReasonLine(item.motivos, candidatos.find(c => c.id === item.id)?.campos || {}), nivel(item.id));
        if (line) notes[item.id] = line;
    }
    const eliminados = [...escolha.eliminados].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    for (const item of eliminados) notes[item.id] = comReputacao(`fora: ${item.motivo}`, nivel(item.id));
    const sequence = [...ranked.map(item => item.id), ...eliminados.map(item => item.id)];
    const out = [...list];
    slots.forEach((slot, i) => { out[slot] = sequence[i]; });
    return { options: out, notes };
}
