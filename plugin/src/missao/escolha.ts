/**
 * O "Escolher uma que já existe" do Novo, sem compor: o nó de onde se escolhe, o que o ramo diz que
 * escolher faz, a nota pelo protocolo dono que o ramo declara, os tipos do "Criar nova" de um campo,
 * o campo do título e o título da busca.
 *
 * Por quê: o passo `escolher` da divisão da Missão (H5, tests/missao/modeloDfm.test.ts). O que
 * compõe (a lista das opções e o gesto de cada uma, sobre o modelo) foi para escolher.ts, no
 * compositor, e a vista o recebe pelo modelo; estas funções não compõem nada (leem o ramo, o tipo e
 * a origem), e ficam com os formulários, onde a vista as importa como antes.
 *
 * Módulo puro: sem Obsidian e sem DOM. Prova: tests/missao/escolher.test.ts.
 */
import type { DomainField } from '../engine/domainModel';
import type { EscolhaDoNo, OrigemDoNovo } from './tipos';
import type { GestoDeRegistro, RamoPrincipal } from './ramoPrincipal';
import { especieDoNo, NOME_DA_NOTA, type TipoDoNovo } from './novo';
import { idDoPeriodo, isChaveEspecial } from './tempo';

/**
 * O que faz: o nó de onde se escolhe: o nó do Novo, ou a linha (o "+ Novo" do cabeçalho abre na
 * linha em foco, e escolher ali põe na linha).
 * Entra → sai: a origem do Novo → o id do nó, ou `null` (a prateleira, nada aberto).
 */
export function noDaEscolha(origem: OrigemDoNovo): string | null {
    if (origem.no) return origem.no;
    const l = origem.linha;
    return l && !isChaveEspecial(l.chave) ? idDoPeriodo(l.escala, l.chave) : null;
}

/**
 * O que faz: o que escolher faz para o tipo a partir da origem: o `escolher` do item do ramo
 * para a espécie do nó e o tipo; sem ele, `null` (o Novo só cria, como antes).
 * Entra → sai: o ramo, o domínio do tipo e a origem → a escolha, ou `null`.
 */
export function escolhaDoNovo(ramoPrincipal: Pick<RamoPrincipal, 'novo'> | null, dominio: string, origem: OrigemDoNovo): EscolhaDoNo | null {
    const no = noDaEscolha(origem);
    const especie = especieDoNo(no);
    if (!ramoPrincipal || !especie) return null;
    return ramoPrincipal.novo?.no?.[especie]?.find(n => n.tipo === dominio)?.escolher ?? null;
}

/**
 * O que faz: os tipos que o "Criar nova" de um campo cria: os do Novo (o seletor do ramo) que estão
 * no `alvo` do campo, na ordem do seletor.
 * Entra → sai: os tipos do Novo e o campo → os tipos (vazio = o Novo não cria nenhum deles).
 */
export function tiposDoCampo(tipos: readonly TipoDoNovo[], campo: Pick<DomainField, 'alvo'>): TipoDoNovo[] {
    return tipos.filter(t => (campo.alvo ?? []).includes(t.dominio));
}

/**
 * O que faz: a nota nova pelo protocolo dono que o ramo declara para o campo, no nó (o `nota` do
 * registro da espécie do nó com o mesmo campo, P9: a pessoa nova pelo 👤 com o nome respondido),
 * para o tipo que não tem modelo nem Novo; `null` = o ramo não declara.
 * Entra → sai: o ramo, o nó e o campo → o gesto do ramo, com o protocolo e o passo do nome.
 */
export function notaDoRamo(ramoPrincipal: Pick<RamoPrincipal, 'registro'> | null, no: string, campo: Pick<DomainField, 'nome'>): (GestoDeRegistro & { protocolo: string; passo: string }) | null {
    const especie = especieDoNo(no);
    const g = especie ? (ramoPrincipal?.registro as Record<string, { nota?: GestoDeRegistro } | undefined> | undefined)?.[especie]?.nota : undefined;
    return g && g.campo === campo.nome && g.protocolo && g.passo ? g as GestoDeRegistro & { protocolo: string; passo: string } : null;
}

/**
 * O que faz: o campo do título da nota nova (onde o texto da busca vai quando nada se acha): o
 * nome da nota (o projeto), o campo do nome do arquivo (a tarefa, a SMART), o primeiro texto
 * obrigatório, ou o primeiro texto (a cidade, o país).
 * Entra → sai: os campos do tipo e o campo do nome do arquivo → o nome do campo, ou `null`.
 */
export function campoDoTitulo(tipo: Pick<TipoDoNovo, 'campos'>, nomeDoArquivo?: string | null): string | null {
    const campos = tipo.campos.map(c => c.campo);
    return campos.find(c => c.nome === NOME_DA_NOTA)?.nome
        ?? (nomeDoArquivo ? campos.find(c => c.nome === nomeDoArquivo)?.nome : undefined)
        ?? campos.find(c => c.obrigatorio && c.tipo === 'texto')?.nome
        ?? campos.find(c => c.tipo === 'texto')?.nome
        ?? null;
}

/**
 * O que faz: o título que a busca dá ao "Criar nova": o texto digitado, quando nada o acha.
 * Entra → sai: o total achado e o texto → o título, ou `null` (achou alguma, ou nada digitado).
 */
export function tituloDaBusca(total: number, texto: string): string | null {
    const t = texto.trim();
    return t && total === 0 ? t : null;
}
