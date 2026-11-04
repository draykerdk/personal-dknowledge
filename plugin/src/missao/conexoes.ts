/**
 * As conexões de um nó, nas duas direções: os links que a nota dele faz (os campos de link do
 * modelo do tipo, os outros links do frontmatter e os do texto), as notas que apontam para ela
 * (agrupadas pelo `type` de quem aponta) e as ligações da Missão em que o nó está na linha dele.
 *
 * Por quê: o P10c (29/10/2026): "poder apertar ali na nota do país e ele já aparecer ali com
 * todos os campos editáveis e tudo mais e suas conexões, poder ir navegando de ponto em ponto".
 * O painel do nó lista as conexões, e cada uma abre o painel do nó do outro lado. Nada aqui tem
 * nome de tipo nem de campo: os campos de link vêm do modelo do tipo (`tipo: 'link'`), os links
 * do cache de metadados do cofre (pela borda) e os rótulos dos grupos do modelo e do ramo.
 *
 * Módulo puro: sem Obsidian e sem DOM. Prova: tests/missao/conexoes.test.ts.
 */
import type { DomainModel } from '../engine/domainModel';
import { fold, linkTarget } from '../project/projectCanvasModel';
import { linkNames } from '../engine/temporada';
import type { LigacoesDaNota, LinhaAberta, LinkDaNota, MissaoNo } from './tipos';

// O link e as ligações de uma nota moram na base (tipos.ts), porque o ramo do nó (compoe.modelo) também os lê; seguem daqui para quem já os importa.
export type { LigacoesDaNota, LinkDaNota };

/** Um nó do outro lado de uma conexão: o id para abrir o painel (`null` = o nome sem nota) e o título. */
export interface Conexao { id: string | null; titulo: string }

/** Um grupo de conexões: o rótulo, o sentido, os nós (até o limite) e quantos ficaram de fora. */
export interface GrupoDeConexoes {
    rotulo: string;
    sentido: 'sai' | 'entra' | 'linha' | 'tipo';
    /** O sentido do campo do modelo no ramo do tipo (acima, abaixo, lado); `null` = link livre. */
    ramo?: 'acima' | 'abaixo' | 'lado' | null;
    itens: Conexao[];
    mais: number;
}

/** O que acha o nó de uma nota e o de um nome sem nota (o modelo da Missão). */
export interface AchaNos {
    /** O nó de uma nota pelo caminho (a tarefa, o projeto, o dia, a nota de uma coleção…); `null` = nenhum. */
    noDaNota: (caminho: string) => Conexao | null;
    /** O nó de um nome sem nota (o alvo de um vínculo, como o país sem nota); `null` = nenhum. */
    noDoNome?: (nome: string) => Conexao | null;
    /** O nome de uma nota que o link escrito acha (o texto solto de um campo de link); `null` = não acha. */
    resolver?: (nome: string) => string | null;
    /** O rótulo do grupo das notas de um `type` (`null` = sem `type`), com o caminho de quem aponta (o canvas tem grupo próprio). */
    rotuloDoType: (type: string | null, caminho?: string) => string;
}

/** Quantos nós cada grupo mostra (o resto vira "+n"). */
export const CONEXOES_POR_GRUPO = 12;

/** A data no começo do nome de uma nota (`2026-10-28`, `2026-W44`, `2026-Q4`). */
// Forma própria (não é a `SEMANA`): qualquer período no começo do nome (o dia, a semana ou o trimestre).
const DATA_NO_NOME = /^\d{4}-(?:\d{2}-\d{2}|W\d{2}|Q\d)/;

const nomeDoCaminho = (c: string) => c.slice(c.lastIndexOf('/') + 1).replace(/\.md$/, '');

/** O que faz: os nomes de um valor de campo de link (um ou uma lista; o alias fica de fora do nome). */
function nomesDoValor(v: unknown): string[] {
    const itens = Array.isArray(v) ? v : v === null || v === undefined || v === '' ? [] : [v];
    const out: string[] = [];
    for (const it of itens) {
        const cru = it && typeof it === 'object' && !Array.isArray(it) ? (it as Record<string, unknown>).uid : it;
        const n = linkTarget(cru);
        if (n && !out.some(x => fold(x) === fold(n))) out.push(n);
    }
    return out;
}

/**
 * O que faz: os grupos das conexões de uma nota: um por campo de link do modelo (o rótulo do
 * modelo, na ordem dele), um por chave do frontmatter que linka fora do modelo (a chave como
 * está), "no texto" e as que apontam para ela, por `type` (o grupo maior primeiro).
 * Por quê: §3.8 e o P10c: o modelo diz o que é link e o rótulo; o cofre diz o resto.
 * Entra → sai: o caminho, o frontmatter, o modelo do tipo (ou `null`), as ligações lidas, quem
 * acha os nós e os rótulos dos grupos fixos → os grupos (sem os vazios).
 * Erro e ataque: o link para a própria nota não conta; a mesma nota não se repete no grupo; o
 * nome que não acha nota fica com o título e sem id (ausência em palavras, nunca um nó
 * inventado); o grupo grande mostra até `CONEXOES_POR_GRUPO` e conta o resto.
 */
export function conexoesDaNota(
    caminho: string,
    fm: Record<string, unknown> | null,
    modelo: DomainModel | null,
    ligacoes: LigacoesDaNota,
    acha: AchaNos,
    rotulos: { noTexto: string },
    limite = CONEXOES_POR_GRUPO,
): GrupoDeConexoes[] {
    const grupos: GrupoDeConexoes[] = [];
    const vistos = new Set<string>();
    const deUm = (cam: string | null, nome: string): Conexao | null => {
        if (cam && cam === caminho) return null;
        const no = cam ? acha.noDaNota(cam) : null;
        if (no) return no;
        const doNome = acha.noDoNome?.(nome) ?? null;
        return doNome ?? { id: null, titulo: cam ? nomeDoCaminho(cam) : nome };
    };
    const chaveDe = (c: Conexao) => c.id ?? `?${fold(c.titulo)}`;
    const grupo = (rotulo: string, sentido: GrupoDeConexoes['sentido'], lista: Conexao[], marcar = true, ramo: GrupoDeConexoes['ramo'] = null) => {
        const unicos: Conexao[] = [];
        for (const c of lista) {
            const k = chaveDe(c);
            if (unicos.some(x => chaveDe(x) === k) || (marcar && vistos.has(k))) continue;
            unicos.push(c);
        }
        if (marcar) for (const c of unicos) vistos.add(chaveDe(c));
        if (unicos.length) grupos.push({ rotulo, sentido, itens: unicos.slice(0, limite), mais: Math.max(0, unicos.length - limite), ...(ramo ? { ramo } : {}) });
    };
    // O link para um título da própria nota (`[[#…]]`) não é conexão: não leva a outra nota (C6.5).
    const saem = ligacoes.saem.filter(l => l.caminho || linkTarget(l.nome));
    const doFrontmatter = saem.filter(l => l.chave);
    // Os campos de link do modelo: o rótulo dele; o texto solto do campo também é link.
    const doModelo = new Set<string>();
    for (const campo of modelo?.campos ?? []) {
        if (campo.tipo !== 'link') continue;
        doModelo.add(campo.nome);
        const nomes = nomesDoValor(fm?.[campo.nome]);
        const lista = nomes.map(nome => {
            const l = doFrontmatter.find(x => x.chave === campo.nome && fold(linkTarget(x.nome)) === fold(nome));
            return deUm(l?.caminho ?? acha.resolver?.(nome) ?? null, nome);
        }).filter((c): c is Conexao => !!c);
        grupo(campo.rotulo, 'sai', lista, true, campo.ramo ?? null);
    }
    // As outras chaves do frontmatter que linkam, pela chave como está na nota.
    const chaves = [...new Set(doFrontmatter.map(l => l.chave!))].filter(k => !doModelo.has(k));
    for (const k of chaves) grupo(k, 'sai', doFrontmatter.filter(l => l.chave === k).map(l => deUm(l.caminho, linkTarget(l.nome) || l.nome)).filter((c): c is Conexao => !!c));
    grupo(rotulos.noTexto, 'sai', saem.filter(l => !l.chave).map(l => deUm(l.caminho, linkTarget(l.nome) || l.nome)).filter((c): c is Conexao => !!c));
    // As que apontam para cá, pelo type de quem aponta (o grupo maior primeiro).
    // Dentro do grupo, a nota com data no nome vem antes, a mais nova primeiro (as Days); as outras pelo título.
    const porType = new Map<string, Array<{ c: Conexao; data: string }>>();
    for (const e of ligacoes.entram) {
        if (e.caminho === caminho) continue;
        const c = acha.noDaNota(e.caminho) ?? { id: `n:${e.caminho}`, titulo: nomeDoCaminho(e.caminho) };
        const rotulo = acha.rotuloDoType(e.type, e.caminho);
        porType.set(rotulo, [...(porType.get(rotulo) ?? []), { c, data: nomeDoCaminho(e.caminho).match(DATA_NO_NOME)?.[0] ?? '' }]);
    }
    for (const [rotulo, lista] of [...porType.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'pt-BR'))) {
        const ordem = lista.sort((a, b) => (a.data && b.data ? b.data.localeCompare(a.data) : a.data ? -1 : b.data ? 1 : a.c.titulo.localeCompare(b.c.titulo, 'pt-BR')));
        grupo(rotulo, 'entra', ordem.map(x => x.c), false);
    }
    return grupos;
}

/** O que faz: todos os nós de uma linha aberta, pelo id (o centro, as asas, as faixas, as coleções). */
export function nosDaLinha(linha: LinhaAberta): Map<string, MissaoNo> {
    const out = new Map<string, MissaoNo>();
    const add = (n: MissaoNo | null | undefined) => { if (n && !out.has(n.id)) out.set(n.id, n); };
    add(linha.centro);
    for (const lista of [linha.areas, linha.projetos, linha.smarts, linha.horarios, linha.asa, linha.trimestres, linha.passagens, linha.trechos]) for (const n of lista ?? []) add(n);
    for (const f of [...(linha.faixas ?? []), ...(linha.pendentes ?? [])]) for (const n of f.nos) add(n);
    for (const lista of Object.values(linha.colecoes ?? {})) for (const n of lista) add(n);
    return out;
}

/**
 * O que faz: as ligações da Missão de um nó na linha dele: o outro lado de cada ligação em que
 * ele está (de onde vem e para onde vai, na asa do trabalho e na do tempo).
 * Entra → sai: a linha aberta e o id → as conexões (sem repetir, na ordem da linha).
 * Erro e ataque: o nó que não está na linha não tem ligação; a ponta que a linha não desenha fica de fora.
 */
export function relacoesNaLinha(linha: LinhaAberta | null, id: string): Conexao[] {
    if (!linha) return [];
    const nos = nosDaLinha(linha);
    const out: Conexao[] = [];
    for (const l of linha.ligacoes ?? []) {
        const outro = l.de === id ? l.para : l.para === id ? l.de : null;
        const n = outro ? nos.get(outro) : undefined;
        if (n && n.id !== id && !out.some(x => x.id === n.id)) out.push({ id: n.id, titulo: n.titulo });
    }
    return out;
}

/**
 * O que faz: os nomes de um link de propriedade do cache: o próprio link; ou, quando o texto da propriedade
 * tem vários links ("[[A]], [[B]]", que o cache entrega como um só, "A]], [[B"), um nome por link, pela leitura
 * única dos campos de links (`linkNames`).
 * Prova: tests/missao/linksDaNota.test.ts.
 */
export function nomesDoLinkDoCache(l: { link: string; original?: string }): string[] {
    const link = String(l.link ?? '');
    if (!link.includes(']]') && !link.includes('[[')) return link ? [link] : [];
    return linkNames(typeof l.original === 'string' && l.original.includes('[[') ? l.original : `[[${link}]]`);
}
