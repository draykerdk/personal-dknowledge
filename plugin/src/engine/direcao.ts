/**
 * A direção do trabalho, lida do que a tarefa já escreve: para fora (o resultado depende do mundo
 * responder: publicar, enviar, vender) ou para dentro (revisar, pesquisar, organizar); o verbo sem fim
 * ("melhorar", "pesquisar"), que não diz quando acaba; e a ação para fora que espera enquanto o mesmo
 * projeto ganha ações para dentro.
 *
 * Por quê: o inventário da aposentadoria (02/11, seção O que se reaproveita, itens 3, 4 e 7; aprovado em
 * 02/11/2026 para implementar onde a função se encaixa na Missão). As contas moravam no meio da
 * intenção do painel antigo (`missionIntent`: `classifyWork`, `infiniteVerb`, `readyForExposure`), que só
 * as telas aposentadas mostravam. Mudaram de casa para cá, com um dono só: a intenção antiga lê daqui, com
 * os mesmos números, e a Missão também (`missao/sinaisDaDirecao.ts`).
 *
 * Funções puras: os pesos chegam como argumento (a categoria `painel_direcao` da tabela única,
 * `pesos_decisao.json`, lida por `panelWeights.ts`); nenhum peso mora aqui. O lugar (`contexts`) não é a
 * direção (manual 012, 29/10): só o verbo, o estado e a entrega declarada pesam.
 * Prova: tests/engine/direcao.test.ts e tests/engine/missionIntent.test.ts (a intenção antiga, que lê daqui).
 */
import type { PanelDirectionWeights } from './panelWeights';

/** Para fora, para dentro, ou nada decide (estado de primeira classe, nunca um palpite). */
export type Direcao = 'externo' | 'interno' | 'indeterminado';

export interface ClassificacaoDaDirecao {
    nucleo: Direcao;
    /** 0–1. Zero quando nada decidiu: `indeterminado` não recebe confiança inventada. */
    confidence: number;
    /** Cada sinal lido, em PT-BR, na ordem em que pesou. É o que o painel mostra. */
    reasons: string[];
}

/** O que a direção lê de uma tarefa: o título, o estado, a entrega declarada, os links de saída e os bloqueios. */
export interface TarefaDaDirecao {
    title?: unknown;
    status?: unknown;
    /** `entrega_observavel` declarada. */
    deliverable?: unknown;
    /** `criterio_suficiente` declarado. */
    sufficientCriteria?: unknown;
    /** Links `http(s)` no corpo; `undefined` = o corpo não foi lido (ausência, não zero). */
    outboundLinks?: unknown;
    blockedBy?: unknown;
}

/** Verbos do ato externo: o que só se resolve com o mundo respondendo. */
const EXPOSURE_VERBS: ReadonlyArray<string> = [
    'publicar', 'publicacao', 'postar', 'divulgar', 'lancar', 'lancamento',
    'enviar', 'mandar', 'vender', 'venda', 'contactar', 'contatar', 'ligar',
    'responder', 'entregar', 'apresentar', 'prospectar', 'negociar', 'submeter',
    'inscrever', 'campanha', 'anuncio', 'anunciar', 'convidar', 'perguntar',
    'pedir', 'cobrar', 'reuniao', 'entrevista', 'proposta', 'orcamento',
    'demo', 'beta', 'afiliado', 'afiliados', 'mostrar', 'agendar',
];

/**
 * Verbos do trabalho interno. Pesam **menos** que os do ato externo, e isso é deliberado: "Publicar o
 * artigo no site" com contexto de computador é trabalho externo (o corpo do trabalho é no computador, o
 * resultado é no mundo), e o problema a evitar é justamente o verbo interno dominar o dia.
 */
const INTERNAL_VERBS: ReadonlyArray<string> = [
    'revisar', 'revisao', 'pesquisar', 'pesquisa', 'estudar', 'estudo', 'analisar',
    'analise', 'mapear', 'documentar', 'planejar', 'planejamento', 'organizar',
    'estruturar', 'configurar', 'desenhar', 'refinar', 'ajustar', 'melhorar',
    'otimizar', 'polir', 'instalar', 'migrar', 'manter', 'criar', 'gravar',
    'editar', 'produzir', 'modelar', 'reorganizar', 'revisar',
];

/**
 * Verbos que abrem tarefa sem fim (o P2 do plano antigo). Não classificam direção: pedem uma condição
 * observável de encerramento, nos campos que a SMART já tem.
 */
const INFINITE_VERBS: ReadonlyArray<string> = [
    'melhorar', 'revisar', 'pesquisar', 'estudar', 'organizar', 'desenvolver',
    'planejar', 'refinar', 'ajustar', 'otimizar', 'documentar', 'mapear',
];

/** Abaixo disso nada foi decidido: `indeterminado` em vez de palpite. */
export const MIN_DECIDING_SCORE = 2;

/** Teto de confiança quando há bloqueador nomeado: a peça pode nem ser a próxima. */
const BLOCKED_CONFIDENCE_CAP = 0.7;

/** Quantas ações para dentro, criadas depois da ação para fora, fazem a para fora "esperar" (o selo antigo). */
export const READY_INTERNAL_AFTER = 2;

/** O que faz: `Enviar o Relatório!` → `enviar o relatorio`: sem acento, sem emoji, sem pontuação. */
function normalizeToken(raw: unknown): string {
    return String(raw ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z]+/g, ' ')
        .trim()
        .toLowerCase();
}

/**
 * O que faz: as palavras do título normalizado, para casar um verbo sem casar a substring no meio de outra palavra.
 * Entra → sai: o título → as palavras, minúsculas e sem acento; vazio ou lixo → lista vazia.
 */
export function titleWords(title: unknown): string[] {
    return normalizeToken(title).split(/\s+/).filter(Boolean);
}

/** O que faz: os verbos presentes no título, dos dois lados. Nenhum verbo é inferido do corpo. */
function verbsOf(title: unknown): { exposure: string[]; internal: string[] } {
    const words = new Set(titleWords(title));
    const exposure = EXPOSURE_VERBS.filter(verb => words.has(verb));
    const internal = INTERNAL_VERBS.filter(verb => words.has(verb));
    return { exposure: [...new Set(exposure)], internal: [...new Set(internal)] };
}

/**
 * O que faz: a direção de uma tarefa a partir do que já está escrito nela, com o porquê de cada evidência.
 * Por quê: o verbo de ato externo é a evidência mais forte; o interno pesa menos; `waiting-on`, a entrega
 * declarada e o link de saída somam para fora. O lugar (`contexts`) não entra: o lugar não é a direção (29/10).
 * Entra → sai: a tarefa e os pesos da direção (`painel_direcao`) → { nucleo, confidence, reasons }.
 * Erro e ataque: sem verbo e sem entrega, ou a força abaixo do mínimo, ou o empate, dão `indeterminado` com
 * confiança 0 e a razão escrita; os pesos todos em zero (a tabela não lida) também. O bloqueio nomeado limita
 * a confiança. Campo que não é texto vale vazio.
 * Prova: tests/engine/direcao.test.ts e tests/engine/missionIntent.test.ts ("classifyWork").
 */
export function classificarDirecao(task: TarefaDaDirecao, weights: PanelDirectionWeights): ClassificacaoDaDirecao {
    const reasons: string[] = [];
    let external = 0;
    let internal = 0;

    const { exposure, internal: internalVerbs } = verbsOf(String(task?.title ?? ''));
    if (exposure.length > 0) {
        external += weights.verbo_externo * exposure.length;
        reasons.push(`verbo ${exposure.map(verb => `"${verb}"`).join(', ')} → ato externo`);
    }
    if (internalVerbs.length > 0) {
        internal += weights.verbo_interno * internalVerbs.length;
        reasons.push(`verbo ${internalVerbs.map(verb => `"${verb}"`).join(', ')} → trabalho interno`);
    }

    if (String(task?.status ?? '').trim().toLowerCase() === 'waiting-on') {
        external += weights.esperando;
        reasons.push('status waiting-on: o ciclo já está com terceiro');
    }

    if (Boolean(task?.deliverable) || Boolean(task?.sufficientCriteria)) {
        external += weights.declara_entrega;
        reasons.push('declara entrega observável ou critério suficiente');
    }

    const links = Number(task?.outboundLinks ?? NaN);
    if (Number.isFinite(links) && links > 0) {
        external += weights.link_de_saida;
        reasons.push(`link de saída no corpo (${links})`);
    }

    const blocked = Array.isArray(task?.blockedBy) ? task.blockedBy.length : 0;

    const winner = Math.max(external, internal);
    if (winner < MIN_DECIDING_SCORE) {
        reasons.push(winner === 0
            ? 'sem verbo de direção e sem entrega declarada (o lugar não decide a direção): nada decide'
            : `evidência insuficiente (força ${winner} < mínimo ${MIN_DECIDING_SCORE}; o lugar não decide a direção): nada decide`);
        return { nucleo: 'indeterminado', confidence: 0, reasons };
    }

    const nucleo: Direcao = external === internal ? 'indeterminado' : external > internal ? 'externo' : 'interno';
    if (nucleo === 'indeterminado') {
        reasons.push(`evidências equilibradas (fora ${external} × dentro ${internal}): nada decide`);
        return { nucleo, confidence: 0, reasons };
    }

    const margin = Math.abs(external - internal);
    let confidence = Math.min(0.95, 0.35 + 0.1 * winner);
    // Margem de um ponto é quase empate: a confiança cai em vez de fingir certeza.
    if (margin < 2) confidence -= 0.15;
    if (blocked > 0) {
        confidence = Math.min(confidence, BLOCKED_CONFIDENCE_CAP);
        reasons.push(`blockedBy nomeado (${blocked} peça${blocked === 1 ? '' : 's'}): a peça pode não ser a próxima`);
    }

    return { nucleo, confidence: Math.round(Math.max(0, confidence) * 100) / 100, reasons };
}

/**
 * O que faz: o verbo sem fim do título ("melhorar", "pesquisar"), quando existe.
 * Por quê: esse verbo não diz quando a tarefa acaba; a condição observável é o que a fecha.
 * Entra → sai: o título → o verbo (o primeiro da lista que o título tem), ou `null` com o título concreto.
 * Erro e ataque: acento e caixa não contam ("Revisão" não é "revisar", "REVISAR" é); a substring no meio
 * de outra palavra não casa.
 * Prova: tests/engine/direcao.test.ts e tests/engine/missionIntent.test.ts ("infiniteVerb").
 */
export function infiniteVerb(title: unknown): string | null {
    const words = new Set(titleWords(title));
    return INFINITE_VERBS.find(verb => words.has(verb)) ?? null;
}

/** Como ler cada candidata da "para fora que espera": a direção, o bloqueio, o dia de criação e o desempate. */
export interface LeitorDaEspera<T> {
    direcao: (t: T) => Direcao;
    bloqueada: (t: T) => boolean;
    /** O dia de criação (`AAAA-MM-DD`); vazio = sem data. */
    criada: (t: T) => string;
    titulo: (t: T) => string;
    /** O que distingue duas candidatas (o caminho). */
    chave: (t: T) => string;
}

/**
 * O que faz: entre as ações executáveis de um projeto, a para fora mais antiga, sem bloqueio, quando o
 * mesmo projeto tem `READY_INTERNAL_AFTER` ou mais ações para dentro criadas depois dela.
 * Por quê: era o selo "pronto para exposição" do painel antigo: a ação para fora parada enquanto o projeto
 * acumula trabalho para dentro. Descreve o plano (as datas de criação e os verbos), nunca a pessoa.
 * Entra → sai: as candidatas (já só as executáveis do projeto) e o leitor → { tarefa, internasDepois,
 * desde }, ou `null`.
 * Erro e ataque: sem para fora sem bloqueio, `null`; a para fora sem data de criação conta toda para
 * dentro como "depois" (e `desde` vem vazio: quem mostra diz a falta); a para dentro sem data não conta
 * depois de uma com data; o empate de data desempata pelo título.
 * Prova: tests/engine/direcao.test.ts e tests/engine/missionIntent.test.ts ("readyForExposure").
 */
export function externaQueEspera<T>(candidatas: readonly T[], ler: LeitorDaEspera<T>): { tarefa: T; internasDepois: number; desde: string } | null {
    const external = candidatas
        .filter(t => ler.direcao(t) === 'externo' && !ler.bloqueada(t))
        .sort((a, b) => (ler.criada(a) || '9999').localeCompare(ler.criada(b) || '9999') || ler.titulo(a).localeCompare(ler.titulo(b)))[0];
    if (!external) return null;
    const since = String(ler.criada(external) ?? '');
    const internasDepois = candidatas.filter(t =>
        ler.direcao(t) === 'interno'
        && ler.chave(t) !== ler.chave(external)
        && (!since || (ler.criada(t) || '') > since),
    ).length;
    if (internasDepois < READY_INTERNAL_AFTER) return null;
    return { tarefa: external, internasDepois, desde: since };
}
