/**
 * O que o painel do nó compõe: o contexto com que os nós de tarefa e de projeto se desenham no
 * painel (o índice, os registros e os sinais de cada alvo), tirado do modelo da versão.
 *
 * Por quê: o passo `painel` da divisão da Missão (H5, tests/missao/modeloDfm.test.ts). O painel
 * (view/painelDoNo.ts) montava esse contexto e chamava noDaTarefa e noDoProjeto da borboleta em
 * execução: a vista compondo pelo compositor. Agora o compositor compõe aqui, e a borboleta entrega
 * os nós prontos pelo modelo (`MissaoModelo.noDaTarefaNoPainel` e `noDoProjetoNoPainel`).
 *
 * Módulo puro: sem Obsidian e sem DOM. Prova: tests/missao/painel.test.ts.
 */
import type { BlockTask } from '../engine/tarefasNoPeriodo';
import { sinaisPorAlvo } from './sinais';
import type { MissaoIndice, MissaoModelo, ProximaAcao, Sinal } from './tipos';

/** O contexto de que noDaTarefa e noDoProjeto precisam: o índice, os registros, os sinais por alvo e a próxima ação do projeto. */
export interface ContextoDosNos {
    indice: MissaoIndice;
    registros: BlockTask[];
    porAlvo: Map<string, Sinal[]>;
    /** A próxima ação real de um projeto, a do modelo (02/11); sem ela, o cartão não a mostra. */
    proxima?: (id: string) => ProximaAcao | null;
}

/**
 * O que faz: o contexto dos nós do painel, a partir do modelo: o índice dele, os registros do
 * índice e os sinais do modelo agrupados por alvo (`sinaisPorAlvo`).
 * Por quê: o painel mostra o nó com a mesma conta da linha (a forma de mostrar e os sinais do nó);
 * esse contexto era montado na vista a cada nó, e é do compositor.
 * Entra → sai: o modelo (o índice, os sinais e a próxima ação, quando ele a tem) → o contexto, novo a cada chamada.
 * Erro e ataque: sem sinais, o mapa vem vazio; os registros são os do índice, como vieram.
 * Prova: tests/missao/painel.test.ts.
 */
export function contextoDoPainel(modelo: Pick<MissaoModelo, 'indice' | 'sinais' | 'proximaAcao'>): ContextoDosNos {
    const proxima = modelo.proximaAcao;
    return { indice: modelo.indice, registros: modelo.indice.registros as BlockTask[], porAlvo: sinaisPorAlvo(modelo.sinais), ...(proxima ? { proxima: (id: string) => proxima(id) } : {}) };
}
