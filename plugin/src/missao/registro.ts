/**
 * O registro do dia, sem gravar: os destinos que o "＋ O que fiz" oferece (os projetos, os
 * departamentos e as SMART abertas).
 *
 * Por quê: o passo `registro` da divisão da Missão (H5, tests/missao/modeloDfm.test.ts). A lista é
 * pura e não grava; morava em registrarFeito.ts, na gravação, e o painel do nó a importava de lá
 * (vista.painel -> liga.gravar, para cima). Aqui, nos formulários, o painel a lê de baixo.
 *
 * Módulo puro: sem Obsidian e sem DOM. Prova: tests/missao/registrarFeito.test.ts ("os destinos").
 */
import type { MissaoIndice } from './tipos';

/** Um destino do registro: o nome do link e o rótulo da lista. */
export interface DestinoDoFeito { nome: string; rotulo: string }

/**
 * O que faz: os destinos que o "＋ O que fiz" oferece: os projetos e departamentos vivos (pela
 * ordem da Temporada) e as SMART abertas, cada um pelo nome do link.
 * Entra → sai: o índice da Missão → a lista (a entrada não muda).
 * Prova: tests/missao/registrarFeito.test.ts ("os destinos").
 */
export function destinosDoFeito(indice: Pick<MissaoIndice, 'projetos' | 'vivas'>): DestinoDoFeito[] {
    const projetos = [...indice.projetos.values()].filter(p => !p.encerrado)
        .sort((a, b) => (a.ramo < 0 ? 99 : a.ramo) - (b.ramo < 0 ? 99 : b.ramo) || a.nome.localeCompare(b.nome, 'pt-BR'))
        .map(p => ({ nome: p.nome, rotulo: p.nome }));
    const smarts = indice.vivas.filter(t => t.tipo === 'smart' && !t.feita)
        .map(t => ({ nome: t.record.basename, rotulo: `SMART · ${t.titulo}` }))
        .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
    return [...projetos, ...smarts];
}
