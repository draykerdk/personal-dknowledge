/**
 * O formulário de um protocolo: os passos que cabem numa gaveta, na ordem, com o tipo de
 * campo, a resposta de abertura e a origem dela; a validação; e as variáveis com que o
 * protocolo roda depois (gravar = `run()` com as respostas, `_respondidos` e as datas).
 *
 * Por quê: o P11 da Missão (arquitetura de 27/10, §5.3 e §5.4): "a gaveta é outra forma de
 * pré-responder, que o motor já aceita; a derivação e a validação são as mesmas funções; toda
 * gravação passa por `run()`". Por isso tudo aqui usa as regras do passo do motor
 * (`stepRules.ts`, `stepDefault.ts`) e nada aqui grava: as gravações, os eventos, o
 * encadeamento e o rascunho são os de sempre, do `run()`.
 *
 * O que não cabe no formulário fica para o modal (§5.4): os routers, a árvore do agora, o
 * `returnTo` e o `suggest_task` (que cria a tarefa no meio da pergunta). O "📖 Pelo diário" cabe
 * com o contexto da rodada (as opções vêm de `JSONProtocol.opcoesDoDiario`, e o `run()` grava o
 * marcado no mesmo ponto do laço, P12a); sem o contexto, fica para o modal. O formulário misto
 * vale: o `run()` pergunta no modal o que ficou.
 *
 * Módulo puro: quem lê o cofre (o frontmatter das fontes de abertura, os marcadores do
 * caminho) é quem chama, pelo `LeitorDoFormulario`.
 */
import { aberturaDoPasso, fontesDaAbertura, type Abertura } from './stepDefault';
import { avisoDoProblema, chavesDaResposta, condicaoDoPasso, passosContinuados, problemaDaResposta, pulaNoSeletorDeNota, RESPONDIDOS, VALORES_INICIAIS } from './stepRules';
import { DIA } from './dia';
import { ehSemana, ehTrimestre } from './periodo';
import type { Papel } from './papeisDeProtocolo';

/** O tipo de um campo do formulário, pelo tipo do passo. */
export type TipoDoCampo = 'texto' | 'texto_longo' | 'escolha' | 'escolhas' | 'nota' | 'notas';

/** Por que um passo fica para o modal (§5.4). */
export type MotivoFora = 'router' | 'arvore_do_agora' | 'refazer' | 'tarefa_no_meio' | 'diario' | 'tipo_desconhecido';

/** Um campo do formulário: o passo e o que o desenho e a validação precisam saber dele. */
export interface CampoDoFormulario {
    id: string;
    tipo: TipoDoCampo;
    /** O passo do JSON (só leitura). */
    passo: any;
    obrigatorio: boolean;
    /** No máximo quantas marcadas (`maxSelect`), ou `null`. */
    maxSelect: number | null;
    /** A resposta vazia que o modal daria (o texto vazio, "Nenhum", o pular), ou `null` se não há. */
    vazio: string | null;
    /** As opções que o contexto da rodada já dá (as do "📖 Pelo diário"); sem elas, as do passo montado. */
    opcoes?: string[];
}

/**
 * Por que um passo visível não aparece nem no formulário nem no modal: a continuação do registro
 * de hoje (`continueFromDay`), ou o "📖 Pelo diário" sem nada citado no diário (ou sem o serviço).
 */
export type MotivoPulado = 'continuacao' | 'sem_diario';

/** O formulário de um protocolo para as respostas do momento. */
export interface EstadoDoFormulario {
    /** Os passos visíveis que cabem no formulário, na ordem do protocolo. */
    campos: CampoDoFormulario[];
    /** Os passos visíveis que ficam para o modal, e por quê. */
    fora: Array<{ id: string; motivo: MotivoFora }>;
    /** Os passos escondidos pela condição. */
    escondidos: string[];
    /** Os passos que a rodada pula sem perguntar (`continueFromDay`: já gravados na Day). */
    pulados: Array<{ id: string; motivo: MotivoPulado }>;
    /** As respostas sem as dos passos escondidos (a mesma regra do laço). */
    respostas: Record<string, unknown>;
}

/**
 * O contexto da rodada que o formulário lê (`JSONProtocol.contextoDaRodada` o calcula): as
 * variáveis de sistema que o `run()` calcularia (`_active_*`, `_target_week`, `_context_week`) e
 * o frontmatter da Day da data de contexto (o `continueFromDay`).
 */
export interface ContextoDaRodada {
    variaveis: Record<string, unknown>;
    frontmatterDoDia: Record<string, unknown> | null;
    /** Os rótulos do "📖 Pelo diário" do dia (`[]` sem nada citado), ou `null` sem a leitura. */
    diario?: string[] | null;
}

const TIPOS: Record<string, TipoDoCampo> = {
    text: 'texto', textarea: 'texto_longo', suggest: 'escolha', select: 'escolha',
    multiselect: 'escolhas', suggest_note: 'nota', multiselect_note: 'notas',
};

/** O que faz: o tipo de campo de um passo; tipo que o motor não conhece → `null`. */
export function tipoDoCampo(step: any): TipoDoCampo | null {
    return TIPOS[String(step?.type ?? '')] ?? null;
}

/**
 * O que faz: por que um passo fica para o modal, ou `null` se ele cabe no formulário.
 * Por quê: §5.4: o router é caminho, não formulário; a árvore do agora é um fluxo em si; o
 * `returnTo` é "refazer"; o `suggest_task` cria a tarefa no meio da pergunta; o "📖 Pelo
 * diário" sem o contexto da rodada não tem as opções (com ele, cabe: `formularioDoProtocolo`).
 * Entra → sai: o protocolo (o `id`) e o passo → o motivo ou `null`.
 */
export function foraDoFormulario(def: any, step: any): MotivoFora | null {
    if (String(def?.id ?? '').startsWith('router_')) return 'router';
    if (step?.type === 'suggest_note' && step.nowTree) return 'arvore_do_agora';
    if (step?.returnTo && typeof step.returnTo === 'object') return 'refazer';
    if (step?.type === 'suggest_task') return 'tarefa_no_meio';
    if (step?.type === 'multiselect' && step.fromDiary) return 'diario';
    if (!tipoDoCampo(step)) return 'tipo_desconhecido';
    return null;
}

/**
 * O que faz: a resposta vazia que o modal daria a um passo: o texto vazio no texto; "Nenhum"
 * nas seleções; no seletor de notas, o pular (vazio) quando o passo o oferece; nas escolhas,
 * nenhuma (o seletor de opções não tem resposta vazia).
 * Por quê: §5.3, 5: o campo deixado vazio no formulário vale como respondido, com a mesma
 * resposta que o modal gravaria; o que o modal não deixa vazio é perguntado.
 * Entra → sai: o passo → o texto vazio, "Nenhum", ou `null`.
 */
export function respostaVazia(step: any): string | null {
    if (step?.type === 'text' || step?.type === 'textarea') return '';
    if (step?.type === 'multiselect' || step?.type === 'multiselect_note') return 'Nenhum';
    // O pular do seletor: `optional`, ou, sem a chave, o passo de contexto genérico (a regra do modal).
    if (step?.type === 'suggest_note' && pulaNoSeletorDeNota(step)) return '';
    return null;
}

/**
 * O que faz: o formulário do protocolo para as respostas do momento: passo a passo, na ordem,
 * o passo com condição que não casa fica escondido e as chaves da resposta desse passo saem (a mesma
 * regra do laço, `chavesDaResposta`); o visível cabe no formulário ou fica para o modal.
 * Por quê: §5.3, 3. As condições são as do laço (`condicaoDoPasso`), lidas com as respostas
 * de antes do passo e com as variáveis de sistema da rodada (o `contexto`, que valem por cima,
 * como no `run()`); o passo que a continuação do registro de hoje pula (`continueFromDay`, com
 * a Day do contexto) não aparece, como no laço (P12a, follow-ups 2 e 4 do P11).
 * Entra → sai: o protocolo, as respostas (com as variáveis que a condição pode ler, como
 * `_target_quarter_pin`) e o contexto da rodada (opcional: sem ele, nenhuma variável de sistema
 * e nenhuma continuação) → o estado (a entrada não muda; as variáveis de sistema não entram nas
 * respostas).
 * Erro e ataque: passo sem id é ignorado; protocolo sem passos dá um formulário vazio; um
 * router fica todo para o modal.
 * Prova: tests/engine/protocolForm.test.ts ("os passos visíveis", "o contexto da rodada").
 */
export function formularioDoProtocolo(def: any, respostas: Record<string, unknown>, contexto?: ContextoDaRodada | null): EstadoDoFormulario {
    const vars: Record<string, unknown> = { ...(respostas ?? {}) };
    const sistema: Record<string, unknown> = { ...(contexto?.variaveis ?? {}) };
    const campos: CampoDoFormulario[] = [];
    const fora: Array<{ id: string; motivo: MotivoFora }> = [];
    const escondidos: string[] = [];
    const pulados: Array<{ id: string; motivo: MotivoPulado }> = [];
    // A continuação é decidida uma vez, com as variáveis do início, como no laço.
    const continuados = contexto ? passosContinuados(def?.continueFromDay, { ...vars, ...sistema }, contexto.frontmatterDoDia) : null;
    for (const step of Array.isArray(def?.steps) ? def.steps : []) {
        if (!step || typeof step.id !== 'string' || !step.id) continue;
        if (step.condition && !condicaoDoPasso(step.condition, { ...vars, ...sistema }, def?.steps)) {
            escondidos.push(step.id);
            for (const key of chavesDaResposta(step.id)) delete vars[key];
            continue;
        }
        if (continuados?.has(step.id)) { pulados.push({ id: step.id, motivo: 'continuacao' }); continue; }
        // O "📖 Pelo diário" com o contexto: as opções do dia, ou o passo não aparece (sem nada
        // citado, ou sem o serviço), como no modal.
        const diario = step.type === 'multiselect' && step.fromDiary && contexto ? contexto.diario ?? [] : null;
        if (diario && diario.length === 0) { pulados.push({ id: step.id, motivo: 'sem_diario' }); continue; }
        const motivo = diario ? null : foraDoFormulario(def, step);
        if (motivo) { fora.push({ id: step.id, motivo }); continue; }
        const max = Number(step.maxSelect) || 0;
        campos.push({
            id: step.id, tipo: tipoDoCampo(step)!, passo: step, obrigatorio: step.required === true,
            maxSelect: max > 0 && (step.type === 'multiselect' || step.type === 'multiselect_note') ? max : null,
            vazio: respostaVazia(step),
            ...(diario ? { opcoes: [...diario] } : {}),
        });
    }
    return { campos, fora, escondidos, pulados, respostas: vars };
}

/**
 * O que o formulário lê do cofre para a abertura: o frontmatter de uma nota, o caminho com os
 * marcadores resolvidos e, quando o motor o dá (`JSONProtocol.leitorDoFormulario`), as sugestões
 * declaradas (`sugestao`) e o par da semana (`daSemana`, o `sugestaoDaSemana` do 🌳).
 */
export interface LeitorDoFormulario {
    frontmatter(path: string): Record<string, unknown> | null | undefined;
    caminho(modelo: string): string;
    sugestao?(nome: string, step: any, opcoes: readonly string[] | null): { valor: string; porque: string } | null;
    daSemana?(grupo: 'valor' | 'relacao'): { nome: string; origem: string } | null;
}

/**
 * O que faz: a resposta com que um campo abre e a origem dela, a mesma com que o modal abre o
 * passo: a que já está no formulário; no seletor de notas, o par da semana (`sugestaoDaSemana`);
 * senão a do `defaultFrom` (a nota, o valor fixo ou a sugestão declarada, com o porquê); senão
 * todas marcadas (`preselectAll`). A mesma função do laço (`aberturaDoPasso`).
 * Por quê: §5.5, "o porquê de cada valor"; o formulário abre cada campo como o modal o abriria.
 * Entra → sai: o protocolo (o `defaultFromNote`), o passo, as respostas, o leitor e as opções
 * do passo (para as seleções; `null` sem elas) → a abertura (`fonte`: 'anterior' é a resposta
 * já dada no formulário; no seletor de notas, o valor é o nome da nota).
 * Erro e ataque: a escolha (`suggest`) só abre com uma opção do passo; sem o leitor das
 * sugestões, a sugestão declarada não vale (a próxima fonte vale).
 * Prova: tests/engine/protocolForm.test.ts ("a abertura") e tests/engine/sugestoesDoPasso.test.ts.
 */
export function aberturaDoCampo(def: any, step: any, respostas: Record<string, unknown>, leitor: LeitorDoFormulario, opcoes: readonly string[] | null): Abertura {
    const anterior = respostas?.[step?.id];
    if (step?.type === 'suggest_note' && (anterior === undefined || anterior === null)) {
        const grupo = step.sugestaoDaSemana;
        const par = (grupo === 'valor' || grupo === 'relacao') && leitor.daSemana ? leitor.daSemana(grupo) : null;
        if (par?.nome) return { value: par.nome, origem: par.origem, kind: step.type, fonte: 'defaultFrom' };
    }
    const escolhas = (step?.type === 'suggest' || step?.type === 'select') && !opcoes && Array.isArray(step.options) ? step.options.map(String) : opcoes;
    const sugestaoDe = leitor.sugestao ? (nome: string) => leitor.sugestao!(nome, step, escolhas) : null;
    return aberturaDoPasso(step, anterior, undefined,
        () => fontesDaAbertura(step, def?.defaultFromNote, leitor.caminho), leitor.frontmatter, escolhas, sugestaoDe);
}

/**
 * O que faz: os problemas das respostas do formulário, por passo: o obrigatório vazio e as
 * marcadas a mais, com o aviso que o laço mostraria; só dos campos visíveis com resposta (o
 * campo sem resposta fica para o modal, que o pergunta).
 * Por quê: §5.3, 4: `required` e `maxSelect` pelas mesmas funções do laço (`problemaDaResposta`).
 * Entra → sai: o protocolo e as respostas → id → aviso (vazio = tudo vale).
 * Prova: tests/engine/protocolForm.test.ts ("a validação").
 */
export function validarFormulario(def: any, respostas: Record<string, unknown>, contexto?: ContextoDaRodada | null): Record<string, string> {
    const estado = formularioDoProtocolo(def, respostas, contexto);
    const out: Record<string, string> = {};
    for (const campo of estado.campos) {
        const value = estado.respostas[campo.id];
        if (value === undefined || value === null) continue;
        const problema = problemaDaResposta(campo.passo, value);
        if (problema) out[campo.id] = avisoDoProblema(problema);
    }
    return out;
}

/** As datas da rodada, sempre explícitas (§5.3, 6): o dia e, quando o protocolo planeja, a semana ou o trimestre. */
export interface DatasDaRodada {
    /** `AAAA-MM-DD`: o `_context_date`. */
    dia: string;
    /** `AAAA-Www`: o `_target_week_pin`. */
    semana?: string;
    /** `AAAA-Qn`: o `_target_quarter_pin`. */
    trimestre?: string;
}

/** As variáveis de uma rodada pelo formulário, ou o problema das datas. */
export type RodadaDoFormulario = { variaveis: Record<string, unknown> } | { problema: string };

/** O que faz: as variáveis das datas, ou o problema delas (o dia é obrigatório; o resto, no formato). */
function variaveisDasDatas(datas: DatasDaRodada): Record<string, string> | string {
    if (!DIA.test(String(datas?.dia ?? ''))) return 'o dia da rodada (AAAA-MM-DD) é obrigatório';
    const out: Record<string, string> = { _context_date: datas.dia };
    if (datas.semana !== undefined) {
        if (!ehSemana(datas.semana)) return 'a semana da rodada precisa ser AAAA-Www';
        out._target_week_pin = datas.semana;
    }
    if (datas.trimestre !== undefined) {
        if (!ehTrimestre(datas.trimestre)) return 'o trimestre da rodada precisa ser AAAA-Qn';
        out._target_quarter_pin = datas.trimestre;
    }
    return out;
}

/**
 * O que faz: as variáveis com que o protocolo roda depois do formulário: as respostas sem as
 * dos passos escondidos e sem as dos passos que ficam para o modal, `_respondidos` (os campos
 * visíveis com resposta, mesmo vazia) e as datas explícitas.
 * Por quê: §5.3, 6: "Gravar = `run({ ...respostas, _respondidos, _context_date,
 * _target_week_pin | _target_quarter_pin })`"; o motor pula os respondidos, deriva o resto pela
 * função do modal (`gravarResposta`) e pergunta o que faltou.
 * Entra → sai: o protocolo, as respostas (as chaves que não são passo, como `<titleVar>_titulo`
 * e `<id>_path`, seguem), as datas e o contexto da rodada (opcional) → as variáveis, ou o
 * problema das datas. A resposta de passo pulado pela continuação sai, como a do que fica
 * para o modal: o laço não a pergunta e ela não vale nesta rodada.
 * Erro e ataque: a data fora do formato é problema (a rodada não roda com o dia da nota ativa,
 * que é o painel); a resposta inválida vai assim mesmo (o motor a pergunta no modal, aberta
 * com ela): quem quer barrar antes chama `validarFormulario`.
 * Prova: tests/engine/protocolForm.test.ts ("o formulário e o passo a passo gravam igual").
 */
export function rodadaDoFormulario(def: any, respostas: Record<string, unknown>, datas: DatasDaRodada, contexto?: ContextoDaRodada | null): RodadaDoFormulario {
    const dasDatas = variaveisDasDatas(datas);
    if (typeof dasDatas === 'string') return { problema: dasDatas };
    const estado = formularioDoProtocolo(def, { ...respostas, ...dasDatas }, contexto);
    const variaveis: Record<string, unknown> = { ...estado.respostas };
    for (const { id } of [...estado.fora, ...estado.pulados]) for (const key of chavesDaResposta(id)) delete variaveis[key];
    variaveis[RESPONDIDOS] = estado.campos.filter(c => variaveis[c.id] !== undefined && variaveis[c.id] !== null).map(c => c.id);
    delete variaveis[VALORES_INICIAIS];
    return { variaveis: { ...variaveis, ...dasDatas } };
}

/**
 * O que faz: as variáveis com que o protocolo roda inteiro, passo a passo, aberto com o que
 * estava no formulário: `_valoresIniciais` (as respostas sem as dos passos escondidos) e as
 * datas explícitas; nenhum passo é pulado por elas.
 * Por quê: §5.6, "Abrir o protocolo completo": todo passo aparece no modal, aberto com o que
 * já estava na gaveta, e Enter mantém.
 * Entra → sai: o protocolo, as respostas e as datas → as variáveis, ou o problema das datas.
 * Prova: tests/engine/protocolForm.test.ts ("_valoresIniciais").
 */
export function rodadaCompleta(def: any, respostas: Record<string, unknown>, datas: DatasDaRodada, contexto?: ContextoDaRodada | null): RodadaDoFormulario {
    const dasDatas = variaveisDasDatas(datas);
    if (typeof dasDatas === 'string') return { problema: dasDatas };
    const estado = formularioDoProtocolo(def, { ...respostas, ...dasDatas }, contexto);
    const iniciais: Record<string, unknown> = {};
    // As variáveis de sistema que vieram (`_pedir_projeto`, as que uma condição lê) seguem como estão.
    const sistema: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(estado.respostas)) {
        if (value === undefined || value === null || key === RESPONDIDOS || key === VALORES_INICIAIS) continue;
        if (key.startsWith('_')) sistema[key] = value;
        else iniciais[key] = value;
    }
    return { variaveis: { ...sistema, ...dasDatas, [VALORES_INICIAIS]: iniciais } };
}

/** Um botão do ciclo na gaveta: o papel do protocolo que ele abre, se planeja ou revisa, e os passos que vêm no topo. */
export interface BotaoDoCiclo {
    /** O papel (`papeisDeProtocolo.ts`): o protocolo é o que a tabela vigente dá para ele. */
    papel: Papel;
    modo: 'planejar' | 'revisar';
    /** Os passos que abrem a gaveta, nesta ordem; o resto vem logo abaixo, recolhido e preenchido. */
    lideres?: readonly string[];
}

/**
 * Os botões do ciclo, como no protótipo (`CYCLE_PROTO`, arquitetura de 27/10, §5.5): ▶️ o
 * protocolo de abrir o dia, 🌙 a revisão do dia, 🌳 o planejamento da semana, 📅 a revisão da semana, 📨 a
 * revisão da semana com o `relatorio` (o estado do 📨) e o fato da semana no topo, 🧭 o
 * planejamento do trimestre e 🔄 a revisão do trimestre. O 📨 grava o 📅 inteiro: os líderes só
 * mudam a ordem de mostrar. Cada botão diz o papel, não o id (D1 do mapa da v0): o id vem da
 * tabela vigente, e o cofre sem o protocolo do papel não mostra o botão.
 */
export const BOTOES_DO_CICLO: Readonly<Record<string, BotaoDoCiclo>> = Object.freeze({
    '▶️': { papel: 'abrir_dia', modo: 'planejar' },
    '🌙': { papel: 'fechar_dia', modo: 'revisar' },
    '🌳': { papel: 'planejar_semana', modo: 'planejar' },
    '📅': { papel: 'revisar_semana', modo: 'revisar' },
    '📨': { papel: 'revisar_semana', modo: 'revisar', lideres: ['relatorio', 'fato_semana'] },
    '🧭': { papel: 'planejar_trimestre', modo: 'planejar' },
    '🔄': { papel: 'revisar_trimestre', modo: 'revisar' },
});

/**
 * O que faz: os campos do formulário em duas partes: os do topo (os líderes visíveis, na ordem
 * dada) e o resto (na ordem do protocolo), que a gaveta mostra recolhido e preenchido.
 * Por quê: §5.5, o 📨 "abre o 📅 com o `relatorio` e o fato da semana no topo, e o resto do 📅
 * logo abaixo, recolhido e preenchido; gravar roda o 📅 inteiro" (P12a): a ordem de mostrar não
 * muda o que se grava, que segue por `rodadaDoFormulario` com todas as respostas.
 * Entra → sai: o estado do formulário e os ids dos líderes → `{ topo, resto }` (todo campo cai
 * em um dos dois, uma vez só).
 * Erro e ataque: líder que não é campo visível (escondido, para o modal, inexistente) não entra;
 * líder repetido conta uma vez; sem líderes, tudo é resto.
 * Prova: tests/engine/protocolForm.test.ts ("o 📨").
 */
export function camposComDestaque(estado: EstadoDoFormulario, lideres: readonly string[] = []): { topo: CampoDoFormulario[]; resto: CampoDoFormulario[] } {
    const porId = new Map(estado.campos.map(campo => [campo.id, campo]));
    const topo: CampoDoFormulario[] = [];
    for (const id of lideres ?? []) {
        const campo = porId.get(id);
        if (campo && !topo.includes(campo)) topo.push(campo);
    }
    return { topo, resto: estado.campos.filter(campo => !topo.includes(campo)) };
}
