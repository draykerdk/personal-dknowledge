/**
 * As conexões no painel do nó (P10c): o que a nota do nó aponta, quem aponta para ela e as
 * ligações da linha do tempo, cada uma um botão que abre o painel do nó do outro lado.
 *
 * Por quê: navegar de ponto em ponto pelo painel (29/10/2026). Os grupos saem da função pura
 * (`conexoes.ts`): os rótulos dos campos de link vêm do modelo do tipo, os das notas que apontam
 * vêm do tipo delas (o rótulo do seletor do ramo, o domínio do modelo, ou o `type` como está), e
 * nenhum nome de tipo nem de campo mora aqui (§3.8).
 *
 * Só desenha: os gestos saem como `data-goto`, que o componente trata (ir até o nó na linha do
 * tempo, ou abrir o painel dele por cima, com a trilha para voltar).
 */
import { modeloDaNota } from '../camposDoNo';
import { conexoesDaNota, relacoesNaLinha, type GrupoDeConexoes } from '../conexoes';
import { FRASES, PAINEL, RAMO } from '../frases';
import type { ItemDoRamo } from '../tipos';
import { periodoDoId } from '../tempo';
import { el, botao, botaoDeCorrente } from './dom';
import type { Contexto } from './contrato';

const nomeDoCaminho = (c: string) => c.slice(c.lastIndexOf('/') + 1).replace(/\.md$/, '');
const maiuscula = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

/**
 * O que faz: o rótulo do grupo das notas de um `type`, em palavras: os canvas num grupo "Canvas";
 * o rótulo do seletor do ramo para o tipo do modelo que tem esse `type` (senão o domínio dele); o
 * nome que o ramo dá às notas desse `type` nas coleções dele ("Candidato"); senão "Outras notas".
 * Por quê: o diagnóstico do painel do nó (29/10, C6.5): os grupos saíam com o `type` cru
 * ("longterm_note") e "Sem tipo" para os canvas e o BHAG.
 */
export function rotuloDoType(ctx: Contexto, type: string | null, caminho?: string): string {
    if (caminho && /\.canvas$/i.test(caminho)) return PAINEL.canvas;
    if (!type) return PAINEL.outrasNotas;
    const m = (ctx.modelo.indice.tabelas.tipos ?? []).find(x => x.candidatos.type === type);
    if (m) return ctx.ramoPrincipal.novo.tipos.find(t => t.tipo === m.dominio)?.rotulo ?? maiuscula(m.dominio);
    return ctx.ramoPrincipal.colecoes.flatMap(c => c.fontes).find(f => f.type === type)?.rotulo ?? PAINEL.outrasNotas;
}

/** O que faz: a linha aberta onde o nó mora agora (a dele, na escala do painel), ou `null`. */
function linhaDoNo(ctx: Contexto, id: string) {
    try {
        const p = periodoDoId(id);
        if (p) return ctx.modelo.linha(p.escala, p.chave);
        const k = ctx.modelo.linhaDoNo(id, ctx.escala);
        return k ? ctx.modelo.linha(ctx.escala, k) : null;
    } catch { return null; }
}

/**
 * O que faz: os grupos das conexões de um nó: as ligações da linha (sem os nós que o painel já
 * oferece em outra seção) e as da nota dele, nas duas direções.
 * Entra → sai: o contexto, o id e os ids que o painel já mostra → os grupos.
 */
export function gruposDoNo(ctx: Contexto, id: string, jaNoPainel: ReadonlySet<string>): GrupoDeConexoes[] {
    const nota = ctx.modelo.arquivos(id).nota;
    const ligacoes = nota ? ctx.ligacoesDaNota?.(nota) ?? null : null;
    const fm = nota ? ctx.camposDaNota(nota) : null;
    const daNota = nota && ligacoes ? conexoesDaNota(nota, fm, modeloDaNota(nota, fm, ctx.modelo.indice.tabelas.tipos ?? []), ligacoes, {
        noDaNota: c => ctx.modelo.noDaNota(c) ?? { id: `n:${c}`, titulo: nomeDoCaminho(c) },
        noDoNome: nome => ctx.modelo.noDoNome(nome),
        resolver: nome => ctx.resolverLink?.(nome, nota) ?? null,
        rotuloDoType: (t, caminho) => rotuloDoType(ctx, t, caminho),
    }, { noTexto: PAINEL.noTexto }) : [];
    // As conexões padrão do tipo (29/10): o que os modelos ligam ao nó, acima, abaixo e ao lado.
    // O que um campo de link da nota já diz fica no grupo do campo; o que entra pela nota e o modelo
    // explica sai do grupo do tipo de quem aponta e vai para o sentido dele.
    const doCampo = new Set(daNota.filter(g => g.ramo).flatMap(g => g.itens.map(c => c.id ?? '')));
    let padrao: ItemDoRamo[] = [];
    try { padrao = ctx.modelo.conexoesPadrao(id, { camposDaNota: c => ctx.camposDaNota(c), ligacoesDaNota: c => ctx.ligacoesDaNota?.(c) ?? null }); } catch { padrao = []; }
    padrao = padrao.filter(r => r.id && !doCampo.has(r.id) && !jaNoPainel.has(r.id));
    const doPadrao = new Set(padrao.map(r => r.id!));
    const livres = daNota.map(g => (g.ramo ? g : { ...g, itens: g.itens.filter(c => !c.id || !doPadrao.has(c.id)) })).filter(g => g.itens.length);
    const porRelacao = new Map<string, GrupoDeConexoes>();
    for (const r of padrao) {
        const k = `${r.sentido}|${r.relacao}`;
        if (!porRelacao.has(k)) porRelacao.set(k, { rotulo: RAMO.relacao[r.relacao] ?? r.relacao, sentido: 'tipo', ramo: r.sentido, itens: [], mais: 0 });
        porRelacao.get(k)!.itens.push({ id: r.id, titulo: r.titulo });
    }
    const ordem = (g: GrupoDeConexoes) => (g.ramo ? ORDEM_DOS_SENTIDOS.indexOf(g.ramo) : ORDEM_DOS_SENTIDOS.length);
    const doTipo = [...livres, ...porRelacao.values()].map((g, i) => ({ g, i })).sort((a, b) => ordem(a.g) - ordem(b.g) || a.i - b.i).map(x => x.g);
    // As ligações da linha que nem o painel, nem a nota, nem o tipo já dizem.
    const ditos = new Set([...jaNoPainel, ...doTipo.flatMap(g => g.itens.map(c => c.id ?? ''))]);
    const daLinha = relacoesNaLinha(linhaDoNo(ctx, id), id).filter(c => c.id && !ditos.has(c.id));
    return [...(daLinha.length ? [{ rotulo: PAINEL.naMissao, sentido: 'linha' as const, itens: daLinha, mais: 0 }] : []), ...doTipo];
}

/** A ordem dos sentidos nas Conexões: acima, abaixo, ao lado; os links livres por último. */
const ORDEM_DOS_SENTIDOS = ['acima', 'abaixo', 'lado'] as const;
const CABECA_DO_SENTIDO: Record<(typeof ORDEM_DOS_SENTIDOS)[number] | 'outros', string> = { acima: RAMO.acima, abaixo: RAMO.abaixo, lado: RAMO.lado, outros: RAMO.outros };

/** Um passo da trilha: o nó e o título do painel dele. */
export interface PassoDaTrilha { id: string; titulo: string }

/** Quantos passos da trilha aparecem no alto do painel (os de antes viram "…"). */
export const TRILHA_NA_TELA = 4;

/**
 * O que faz: a trilha no alto do painel (P10c): "‹ Voltar" e os painéis de onde se veio, cada um
 * um botão que volta até ele, e o título do painel de agora.
 * Por quê: navegar de ponto em ponto sem se perder; a volta é a mesma da gaveta (Esc e Alt+←).
 * Entra → sai: o contexto, a trilha (a mais velha primeiro) e o título de agora → o elemento.
 */
export function trilhaEl(ctx: Contexto, trilha: readonly PassoDaTrilha[], atual: string): HTMLElement {
    const doc = ctx.doc;
    const nav = el(doc, 'nav', 'chain trilha', { 'aria-label': PAINEL.trilha });
    const ultimo = trilha[trilha.length - 1];
    const v = botao(doc, 'tr-voltar', PAINEL.voltar, { 'data-act': 'voltar' });
    ctx.marcar(v, PAINEL.dicaVoltar(ultimo?.titulo ?? ''), 'Alt+←');
    nav.appendChild(v);
    const de = Math.max(0, trilha.length - TRILHA_NA_TELA);
    if (de) nav.appendChild(el(doc, 'span', 'sep', { 'aria-hidden': 'true' }, PAINEL.reticencias));
    for (let i = de; i < trilha.length; i++) {
        const b = botao(doc, null, trilha[i].titulo, { 'data-act': 'trilha', 'data-i': String(i) });
        ctx.marcar(b, PAINEL.voltarAte(trilha[i].titulo));
        nav.appendChild(b);
        nav.appendChild(el(doc, 'span', 'sep', { 'aria-hidden': 'true' }, '›'));
    }
    nav.appendChild(el(doc, 'span', 'tr-aqui', { 'aria-current': 'page' }, atual));
    return nav;
}

/**
 * O que faz: a seção "Conexões": cada grupo com a seta do sentido e o rótulo, e os nós como
 * botões (o nome sem nota fica escrito, sem botão); o grupo grande diz quantos ficaram de fora.
 * Entra → sai: o contexto, o id e os ids que o painel já mostra → a seção, ou `null` (sem conexão).
 */
export function secaoDasConexoes(ctx: Contexto, id: string, jaNoPainel: ReadonlySet<string>): HTMLElement | null {
    const grupos = gruposDoNo(ctx, id, jaNoPainel);
    if (!grupos.length) return null;
    const doc = ctx.doc;
    const s = el(doc, 'div', 'dsec cx', { 'data-conexoes': id });
    s.appendChild(el(doc, 'h3', null, null, PAINEL.conexoes));
    // O sentido das setas, uma vez, em palavras (antes, "· esta nota aponta" em cada grupo).
    s.appendChild(el(doc, 'p', 'hint', null, PAINEL.legendaDasSetas));
    // O sentido em palavras (29/10), uma cabeça por sentido, quando o tipo dá algum: acima, abaixo, ao lado e os outros links.
    const comSentido = grupos.some(g => g.ramo);
    let cabeca: string | null = null;
    for (const g of grupos) {
        const sentido = g.sentido === 'linha' ? null : g.ramo ?? 'outros';
        if (comSentido && sentido && sentido !== cabeca) {
            s.appendChild(el(doc, 'p', 'cx-ramo', { 'data-ramo': sentido }, CABECA_DO_SENTIDO[sentido]));
            cabeca = sentido;
        }
        const seta = PAINEL[g.sentido];
        const dica = g.sentido === 'sai' ? PAINEL.dicaSai : g.sentido === 'entra' ? PAINEL.dicaEntra : g.sentido === 'tipo' ? PAINEL.dicaTipo : PAINEL.dicaLinha;
        const cab = el(doc, 'p', 'cx-g', { 'data-sentido': g.sentido, title: `${g.rotulo}: ${dica}` });
        cab.appendChild(el(doc, 'span', 'cx-s', { 'aria-hidden': 'true' }, seta));
        cab.append(` ${g.rotulo}`);
        s.appendChild(cab);
        const c = el(doc, 'div', 'chain', { 'data-grupo': g.rotulo });
        g.itens.forEach((x, i) => {
            if (i) c.appendChild(el(doc, 'span', 'sep', { 'aria-hidden': 'true' }, '·'));
            if (!x.id) { c.appendChild(el(doc, 'span', 'none', null, `${x.titulo} · ${FRASES.semNota}`)); return; }
            const b = botaoDeCorrente(doc, null, x.titulo, { 'data-goto': x.id });
            ctx.marcar(b, `${seta} ${x.titulo}: o painel dele (${dica})`);
            c.appendChild(b);
        });
        if (g.mais) c.appendChild(el(doc, 'span', 'none', null, PAINEL.mais(g.mais)));
        s.appendChild(c);
    }
    return s;
}
