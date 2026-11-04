/**
 * A formação de cada ramo e de cada tipo: o eixo da rolagem vertical (o tempo ou a relação) e o da
 * horizontal (as conexões) na vista do ramo da pinça.
 *
 * Por quê: cada tipo de ramo pode ter a sua formação, como os ramos: um componente pode ser mais
 * temporal ou mais relacional, e isso fica na rolagem vertical; a horizontal aprofunda as conexões ou,
 * quando a cadeia de conexões é longa, navega entre elas (30/10/2026). A formação é declarada na
 * configuração (`formacao` no modelo
 * do tipo e no ramo, lido por `parseFormacao`), com um padrão para quem não declara: o período e a
 * passagem andam no tempo (a semana anda no tempo; a passagem anda pela rota); a tarefa, a SMART, o
 * projeto, a área e o resto andam pela relação (a tarefa anda pela cadeia de dependências). A
 * horizontal é sempre as conexões.
 *
 * A ordem: o modelo do tipo vence, depois o ramo em que o ramo se abre, depois o padrão da espécie;
 * cada eixo por si (o tipo que só declara a vertical fica com a horizontal do ramo ou do padrão).
 *
 * Módulo puro: sem DOM nem Obsidian. Prova: tests/missao/formacao.test.ts.
 */
import { COLUNA_DO_CENTRO, type DomainModel, type Formacao, type FormacaoDeclarada } from '../engine/domainModel';
import type { EspecieDoRamo } from './tipos';

/**
 * As espécies que andam no tempo sem declarar: o período (o dia, a semana, o trimestre, o ano) e a
 * passagem. A visão vigente é uma só (não tem anterior nem seguinte no tempo) e fica com a relação.
 */
export const ESPECIES_DO_TEMPO: ReadonlySet<EspecieDoRamo> = new Set<EspecieDoRamo>(['periodo', 'passagem']);

/**
 * O que faz: a formação padrão de uma espécie de nó: `tempo` nas espécies do tempo, `relacao` nas
 * outras; a horizontal, sempre `conexoes`.
 * Entra → sai: a espécie → `Formacao` (nunca vazia).
 * Erro e ataque: uma espécie desconhecida fica com a relação (o ramo é relacional por natureza).
 * Prova: tests/missao/formacao.test.ts ("o padrão").
 */
export function formacaoPadrao(especie: EspecieDoRamo | string): Formacao {
    return { vertical: ESPECIES_DO_TEMPO.has(especie as EspecieDoRamo) ? 'tempo' : 'relacao', horizontal: 'conexoes' };
}

/**
 * O que faz: a formação de um nó: o que o modelo do tipo declara, senão o que o ramo declara, senão
 * o padrão da espécie, eixo por eixo.
 * Por quê: cada ramo e cada tipo declara a sua formação na configuração, com um padrão para quem não declara (30/10/2026).
 * Entra → sai: a espécie, a formação do tipo e a do ramo (parciais, ou nada) → `Formacao`.
 * Erro e ataque: um eixo que não está nas listas fechadas (um objeto montado à mão, sem passar pelo
 * leitor) é ignorado e o seguinte vale; nada declarado dá o padrão.
 * Prova: tests/missao/formacao.test.ts ("a ordem").
 */
export function formacaoDoNo(especie: EspecieDoRamo | string, doTipo?: FormacaoDeclarada | null, doRamoPrincipal?: FormacaoDeclarada | null): Formacao {
    const padrao = formacaoPadrao(especie);
    const vertical = [doTipo?.vertical, doRamoPrincipal?.vertical].find(v => v === 'tempo' || v === 'relacao') ?? padrao.vertical;
    const horizontal = [doTipo?.horizontal, doRamoPrincipal?.horizontal].find(h => h === 'conexoes') ?? padrao.horizontal;
    return { vertical, horizontal };
}

/**
 * O que faz: a formação que o modelo de um domínio declara; `null` sem o modelo ou sem a chave.
 * Entra → sai: o domínio do nó (`dominioDoNo`) e os modelos de tipo → a formação parcial, ou `null`.
 */
export function formacaoDoDominio(dominio: string | null, modelos: readonly Pick<DomainModel, 'dominio' | 'formacao'>[]): FormacaoDeclarada | null {
    return dominio ? modelos.find(m => m.dominio === dominio)?.formacao ?? null : null;
}

/**
 * A disposição do mapa de um ramo (02/11): a ordem das colunas, a coluna do "+" e quantos itens de
 * cada nível ficam à vista. Sem as colunas, o mapa segue o caminho (o que contém à esquerda, o que tem
 * dentro à direita); com elas, cada cartão vai para a coluna do nome da relação dele, ou da espécie.
 */
export interface DisposicaoDoRamo {
    /** A ordem das colunas, da esquerda para a direita, com `centro` no nó do ramo; `null` = pelo caminho. */
    colunas: readonly string[] | null;
    /** A coluna do "+" do que se cria a partir do nó do ramo; `null` = a primeira de fora, à direita. */
    mais: string | null;
    /** Quantos itens de cada nível o mapa mostra antes do "mais conexões". */
    aVista: number;
}

/**
 * O que faz: a disposição do mapa de um nó: as colunas e o "+" do modelo do tipo (são do tipo, nunca do
 * ramo principal, que vale para todo nó); o quanto fica à vista, do tipo, senão do ramo, senão o padrão.
 * Por quê: no ramo da semana, depois dos projetos vêm as SMART, depois as tarefas, os dias e as semanas,
 * tudo com as conexões (02/11/2026); e o trimestre mostrava 12 das 14 semanas
 * (o teto único de `CONEXOES_A_VISTA`), que passa a ser de cada ramo.
 * Entra → sai: a formação do tipo, a do ramo principal e o padrão do quanto à vista → `DisposicaoDoRamo`.
 * Erro e ataque: um `aVista` que não é inteiro positivo, ou colunas sem o centro (um objeto montado à
 * mão, sem passar pelo leitor), ficam com o padrão.
 * Prova: tests/missao/formacao.test.ts ("a disposição").
 */
export function disposicaoDoNo(doTipo: FormacaoDeclarada | null | undefined, doRamoPrincipal: FormacaoDeclarada | null | undefined, aVistaPadrao: number): DisposicaoDoRamo {
    const colunas = Array.isArray(doTipo?.colunas) && doTipo!.colunas.includes(COLUNA_DO_CENTRO) ? [...doTipo!.colunas] : null;
    const mais = colunas && typeof doTipo?.mais === 'string' && colunas.includes(doTipo.mais) && doTipo.mais !== COLUNA_DO_CENTRO ? doTipo.mais : null;
    const valido = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1;
    const aVista = [doTipo?.aVista, doRamoPrincipal?.aVista].find(valido) ?? aVistaPadrao;
    return { colunas, mais, aVista };
}
