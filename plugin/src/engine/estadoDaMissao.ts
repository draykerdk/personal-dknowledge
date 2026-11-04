/**
 * O estado e a ordem da Missão de um período (hoje, amanhã, a semana, a próxima), já digeridos para o
 * agente: a lista curta do que vem primeiro, cada item com o porquê (os pesos que o puseram ali) e os
 * sinais do nó, a forma do período e o que espera na triagem.
 *
 * Por quê: a proposta do agente pessoal (02/11/2026, integração 1), aprovada: o agente escolhe, não
 * interpreta. A ordem já existe na Missão (`ordemPadrao`, a linha do período); aqui só se projeta a
 * linha que a Missão mostra, sem ordenar nada de novo, e o agente escolhe da lista. A forma do período é
 * a linha do centro (a função única de mostrar), e o porquê é o da tabela única de pesos.
 *
 * Módulo puro: recebe o modelo da Missão já montado (o leitor do cofre é do `MissaoService`); sem
 * Obsidian. Prova: tests/engine/estadoDaMissao.test.ts.
 */
import { addDays, addWeeks, chaveDeHoje } from '../missao/tempo';
import type { MissaoModelo, MissaoNo } from '../missao/tipos';

/** Os períodos que o agente pode pedir (a escolha fechada da tool). */
export const PERIODOS_DO_ESTADO = ['hoje', 'amanha', 'semana', 'proxima_semana'] as const;
export type PeriodoDoEstado = typeof PERIODOS_DO_ESTADO[number];

/** Quantos itens vêm por padrão e no máximo: a lista é para escolher, não para ler o estoque. */
export const ITENS_DO_ESTADO = { padrao: 12, maximo: 40 } as const;
/** Quantos motivos do peso viajam por item (os de mais pontos primeiro). */
export const MOTIVOS_POR_ITEM = 4;

/** Um item da lista: a tarefa ou a SMART, com a linha da Missão, o porquê e os sinais. */
export interface ItemDoEstado {
    /** A posição na ordem da Missão (1 = o primeiro). */
    n: number;
    caminho: string;
    titulo: string;
    tipo: 'acao' | 'smart';
    /** A linha do nó como a Missão a mostra (status · estimativa · data; na SMART, a forma das ações). */
    linha: string;
    projeto?: string;
    smart?: string;
    /** Ficou de um período anterior (a linha de hoje a mostra ao lado). */
    de_antes?: true;
    /** O porquê da posição: os motivos da tabela única de pesos, com os pontos. */
    porque?: string[];
    /** Os sinais do nó (o tipo de cada um: `sem-estimativa`, `prazo-vencido`…). */
    sinais?: string[];
}

export interface EstadoDoPeriodo {
    periodo: PeriodoDoEstado;
    escala: 'dia' | 'semana';
    chave: string;
    hoje: string;
    /** A forma do período, pela função única de mostrar (a linha do centro). */
    forma: string;
    lugar?: string;
    itens: ItemDoEstado[];
    /** Quantos itens abertos passaram do teto (`limite`). */
    mais: number;
    /** Quantas do período já estão feitas (não entram na lista). */
    feitas: number;
    /** O que espera na triagem: o total e os grupos com algo. */
    triagem: { total: number; grupos: Record<string, number> };
}

/**
 * O que faz: a escala e a chave de um período, a partir de hoje.
 * Erro e ataque: período fora da lista cai em `hoje` (a tool só oferece os da lista; o gateway confere antes).
 */
export function chaveDoPeriodo(periodo: PeriodoDoEstado, hoje: string): { escala: 'dia' | 'semana'; chave: string } {
    switch (periodo) {
        case 'amanha': return { escala: 'dia', chave: addDays(hoje, 1) };
        case 'semana': return { escala: 'semana', chave: chaveDeHoje('semana', hoje) };
        case 'proxima_semana': return { escala: 'semana', chave: addWeeks(chaveDeHoje('semana', hoje), 1) };
        default: return { escala: 'dia', chave: hoje };
    }
}

/** O que faz: o motivo do peso em texto curto: "o texto (+pontos)". */
function motivoEmTexto(m: { texto: string; pontos: number }): string {
    // Uma casa decimal: o agente lê "+3.3", não "+3.3333333333333335" (o impacto entra dividido).
    const p = Math.round(Number(m.pontos) * 10) / 10;
    return Number.isFinite(p) && p !== 0 ? `${m.texto} (${p > 0 ? '+' : ''}${p})` : m.texto;
}

/**
 * O que faz: o item de um nó da linha: o caminho, o título, a linha da Missão, o projeto e a SMART pelos
 * nomes, o porquê (os motivos de mais pontos primeiro) e os sinais.
 * Erro e ataque: o nó sem tarefa no índice (não deveria vir numa faixa) dá `null` e fica fora.
 */
function itemDoNo(modelo: MissaoModelo, no: MissaoNo, n: number, deAntes: boolean): ItemDoEstado | null {
    const t = modelo.indice.porId.get(no.id);
    if (!t) return null;
    const item: ItemDoEstado = { n, caminho: t.caminho, titulo: t.titulo, tipo: t.tipo, linha: no.linha };
    const projeto = t.projeto ? modelo.indice.projetos.get(t.projeto)?.nome : undefined;
    if (projeto) item.projeto = projeto;
    const smart = t.smart ? modelo.indice.porId.get(t.smart)?.titulo : undefined;
    if (smart) item.smart = smart;
    if (deAntes) item.de_antes = true;
    const motivos = [...(modelo.motivos(no.id) ?? [])].sort((a, b) => Math.abs(b.pontos) - Math.abs(a.pontos)).slice(0, MOTIVOS_POR_ITEM);
    if (motivos.length) item.porque = motivos.map(motivoEmTexto);
    if (no.sinais?.length) item.sinais = [...no.sinais];
    return item;
}

/**
 * O que faz: o estado de um período: a linha da Missão (a mesma que ele vê, na ordem padrão), as abertas
 * em ordem com o porquê e os sinais (as SMART do período primeiro na semana, as que ficaram de antes por
 * último na de hoje), a forma do centro, o lugar, quantas já estão feitas e o que espera na triagem.
 * Entra → sai: o modelo da versão, o período e o teto → `EstadoDoPeriodo`.
 * Erro e ataque: o teto fora da faixa fica na ponta (1 a `ITENS_DO_ESTADO.maximo`, `NaN` vale o padrão);
 * o corte é declarado em `mais`, nunca calado; a feita não entra na lista, só na conta.
 * Prova: tests/engine/estadoDaMissao.test.ts.
 */
export function estadoDoPeriodo(modelo: MissaoModelo, periodo: PeriodoDoEstado = 'hoje', limite: number = ITENS_DO_ESTADO.padrao): EstadoDoPeriodo {
    const teto = Math.max(1, Math.min(ITENS_DO_ESTADO.maximo, Math.floor(Number.isFinite(limite) ? limite : ITENS_DO_ESTADO.padrao)));
    const { escala, chave } = chaveDoPeriodo(periodo, modelo.hoje);
    const linha = modelo.linha(escala, chave);
    const abertos: Array<{ no: MissaoNo; deAntes: boolean }> = [];
    let feitas = 0;
    const vistos = new Set<string>();
    const juntar = (nos: readonly MissaoNo[], deAntes: boolean) => {
        for (const no of nos) {
            if (vistos.has(no.id)) continue;
            vistos.add(no.id);
            const t = modelo.indice.porId.get(no.id);
            if (!t) continue;
            if (t.feita) { feitas++; continue; }
            if (!t.aberta) continue;
            abertos.push({ no, deAntes });
        }
    };
    // Na semana, a SMART é a entrega do período: vem antes das ações, na ordem da linha.
    if (escala === 'semana') juntar(linha.smarts, false);
    juntar(linha.faixas.flatMap(f => f.nos), false);
    juntar(linha.pendentes.flatMap(f => f.nos), true);
    const itens = abertos.slice(0, teto)
        .map((x, i) => itemDoNo(modelo, x.no, i + 1, x.deAntes))
        .filter((x): x is ItemDoEstado => !!x);
    const grupos: Record<string, number> = {};
    for (const g of modelo.triagem.grupos) if (g.itens.length) grupos[g.id] = g.itens.length;
    const out: EstadoDoPeriodo = {
        periodo, escala, chave, hoje: modelo.hoje,
        forma: linha.centro.linha,
        itens,
        mais: Math.max(0, abertos.length - teto),
        feitas,
        triagem: { total: modelo.triagem.total, grupos },
    };
    if (linha.lugar?.texto) out.lugar = linha.lugar.texto;
    return out;
}

