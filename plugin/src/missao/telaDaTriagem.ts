/**
 * A tela da triagem: o filtro pelos sinais, o item à vista (um por vez), o andar e a volta.
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, 8.6 e 8.8) e o plano (3d.1): "uma
 * tela que abre com as opções para pegar o que existe e arrastar para o tempo e conexão
 * certas", "dá para fazer só pelo teclado, uma tarefa por vez". Os sinais são o filtro
 * (8.8: "onde aparecem: ... e o filtro da triagem"): um item passa no filtro pelo grupo dele
 * ou por uma das marcas (as outras faltas).
 *
 * O andar não espera o cofre: depois de um gesto, o item à vista passa ao próximo, e o que
 * já foi tratado nesta abertura fica para trás (a versão nova do cofre pode demorar, e o
 * item que ainda tem outra falta não volta sozinho para a frente). ← volta ao anterior; o
 * Desfazer da triagem devolve o item à vista.
 *
 * Módulo puro: sem Obsidian e sem DOM. Prova: tests/missao/telaDaTriagem.test.ts.
 */
import { GRUPOS } from './triagem';
import type { Papel } from '../engine/papeisDeProtocolo';
import type { GrupoDaTriagem, ItemDaTriagem, Prateleira } from './tipos';

/** O filtro: um grupo da prateleira (o sinal dele), ou `null` = todos. */
export type FiltroDaTriagem = GrupoDaTriagem | null;

export interface EstadoDaTriagem {
    filtro: FiltroDaTriagem;
    /** O id do item à vista; `null` = o primeiro que falta tratar. */
    atual: string | null;
    /** Os ids tratados nesta abertura, na ordem (o último é o do Desfazer). */
    feitos: string[];
}

export const TRIAGEM_INICIAL: EstadoDaTriagem = { filtro: null, atual: null, feitos: [] };

/**
 * O que faz: o item passa no filtro? Pelo grupo, ou pela marca do sinal do grupo.
 * Por quê: o filtro "Sem estimativa" mostra também a vencida sem estimativa (a marca), e
 * não só as que caíram no grupo dela.
 */
export function passaNoFiltro(item: Pick<ItemDaTriagem, 'grupo' | 'marcas'>, filtro: FiltroDaTriagem): boolean {
    if (!filtro) return true;
    if (item.grupo === filtro) return true;
    const sinal = GRUPOS.find(g => g.id === filtro)?.sinal;
    return !!sinal && item.marcas.includes(sinal);
}

/** O que faz: os itens da prateleira, na ordem dos grupos, que passam no filtro. */
export function itensDoFiltro(p: Prateleira, filtro: FiltroDaTriagem): ItemDaTriagem[] {
    return p.grupos.flatMap(g => g.itens).filter(i => passaNoFiltro(i, filtro));
}

/** Um filtro, com o rótulo e quantos itens passam nele (os vazios ficam fora, menos "Todos"). */
export interface OpcaoDeFiltro { id: FiltroDaTriagem; rotulo: string; n: number }

/** O que faz: os filtros com contagem: "Todos" e cada grupo que tem item (pelo grupo ou pela marca). */
export function filtrosDaTriagem(p: Prateleira): OpcaoDeFiltro[] {
    const todos = p.grupos.flatMap(g => g.itens);
    const out: OpcaoDeFiltro[] = [{ id: null, rotulo: 'Todos', n: todos.length }];
    for (const g of GRUPOS) {
        const n = todos.filter(i => passaNoFiltro(i, g.id)).length;
        if (n) out.push({ id: g.id, rotulo: g.rotulo, n });
    }
    return out;
}

/** O que falta tratar: os itens do filtro que não estão em `feitos`. */
export function pendentes(p: Prateleira, e: EstadoDaTriagem): ItemDaTriagem[] {
    const feitos = new Set(e.feitos);
    return itensDoFiltro(p, e.filtro).filter(i => !feitos.has(i.id));
}

/**
 * O que faz: o item à vista: o `atual`, se ainda falta tratar; senão o primeiro pendente.
 * Entra → sai: a prateleira e o estado → o item, ou `null` (nada a tratar neste filtro).
 */
export function itemAtual(p: Prateleira, e: EstadoDaTriagem): ItemDaTriagem | null {
    const lista = pendentes(p, e);
    return lista.find(i => i.id === e.atual) ?? lista[0] ?? null;
}

/** O que faz: a posição do item à vista entre os pendentes (para "3 de 12"). */
export function posicao(p: Prateleira, e: EstadoDaTriagem): { i: number; n: number } {
    const lista = pendentes(p, e);
    const atual = itemAtual(p, e);
    return { i: atual ? lista.indexOf(atual) + 1 : 0, n: lista.length };
}

/** O que faz: → pula: o item à vista passa ao seguinte pendente (no fim, volta ao primeiro). */
export function pular(p: Prateleira, e: EstadoDaTriagem): EstadoDaTriagem {
    const lista = pendentes(p, e);
    const atual = itemAtual(p, e);
    if (!atual || lista.length < 2) return e;
    const i = lista.indexOf(atual);
    return { ...e, atual: lista[(i + 1) % lista.length].id };
}

/** O que faz: ← volta: o item anterior pendente (no começo, o último). */
export function voltar(p: Prateleira, e: EstadoDaTriagem): EstadoDaTriagem {
    const lista = pendentes(p, e);
    const atual = itemAtual(p, e);
    if (!atual || lista.length < 2) return e;
    const i = lista.indexOf(atual);
    return { ...e, atual: lista[(i - 1 + lista.length) % lista.length].id };
}

/**
 * O que faz: depois de um gesto que gravou: o item fica tratado e o seguinte vem à vista.
 * Erro e ataque: o mesmo item tratado duas vezes entra uma vez só.
 */
export function depoisDoGesto(p: Prateleira, e: EstadoDaTriagem, id: string): EstadoDaTriagem {
    const lista = pendentes(p, e);
    const i = lista.findIndex(x => x.id === id);
    const proximo = i >= 0 ? (lista[i + 1] ?? lista[i - 1] ?? null) : itemAtual(p, e);
    return { ...e, feitos: [...e.feitos.filter(x => x !== id), id], atual: proximo && proximo.id !== id ? proximo.id : null };
}

/**
 * O que faz: o Desfazer da triagem: o item desfeito (o do aviso clicado, ou o último tratado,
 * no ⌘Z) volta a ser o item à vista.
 * Erro e ataque: o id que não foi tratado nesta abertura não muda nada.
 */
export function depoisDoDesfazer(e: EstadoDaTriagem, id: string | null = null): EstadoDaTriagem {
    const alvo = id ?? e.feitos[e.feitos.length - 1];
    if (!alvo || !e.feitos.includes(alvo)) return e;
    return { ...e, feitos: e.feitos.filter(x => x !== alvo), atual: alvo };
}

/** O que faz: troca o filtro; o item à vista volta ao primeiro do filtro novo. */
export function comFiltro(e: EstadoDaTriagem, filtro: FiltroDaTriagem): EstadoDaTriagem {
    return { ...e, filtro, atual: null };
}

/** As estimativas da tecla E, em minutos (as mesmas do ⚡ e do 🗂️, mais as curtas). */
export const ESTIMATIVAS: readonly number[] = [15, 25, 30, 50, 60, 90, 120, 180];

/**
 * As opções do 🗂️ protocolo do destino da ideia (o passo do destino), pelo destino da triagem. O
 * texto é a resposta do protocolo, igual ao JSON (um teste confere contra o arquivo).
 */
export const OPCAO_DA_IDEIA: Readonly<Record<'smart' | 'Lista de Espera' | 'Caixa de Areia' | 'Fica de fora', string>> = {
    smart: '🎯 Peça da Temporada (vira tarefa)',
    'Lista de Espera': '🧠 Lista de Espera (ideia grande demais para a semana)',
    'Caixa de Areia': '🏖️ Caixa de Areia',
    'Fica de fora': '🚫 Fica de fora',
};

/** O papel do 🗂️ (o destino da ideia): o protocolo é o que a tabela vigente dá. */
export const PAPEL_DA_IDEIA: Papel = 'destino_da_ideia';

/**
 * O que faz: as respostas que o 🗂️ recebe já dadas: a ideia (o passo `ideia`, como o
 * seletor de nota grava) e o destino; com a SMART (a ideia solta sobre uma SMART), também
 * o passo `tarefa_smart`. O resto (o nome da 🔥, a estimativa, o porquê) o protocolo
 * pergunta, passo a passo.
 * Entra → sai: o caminho da ideia, o destino e a SMART (caminho) → as variáveis do `run()`.
 */
export function variaveisDaIdeia(caminho: string, destino: keyof typeof OPCAO_DA_IDEIA, smart: string | null = null): Record<string, unknown> {
    const nome = (p: string) => p.split('/').pop()!.replace(/\.md$/, '');
    const pasta = (p: string) => p.slice(0, Math.max(0, p.lastIndexOf('/')));
    const out: Record<string, unknown> = {
        ideia: nome(caminho), ideia_display: `[[${nome(caminho)}]]`, ideia_path: caminho, ideia_folder: pasta(caminho),
        destino_ideia: OPCAO_DA_IDEIA[destino],
    };
    if (smart && destino === 'smart') Object.assign(out, { tarefa_smart: nome(smart), tarefa_smart_display: `[[${nome(smart)}]]`, tarefa_smart_path: smart, tarefa_smart_folder: pasta(smart) });
    return out;
}
