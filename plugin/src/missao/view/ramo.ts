/**
 * A vista do ramo: o zoom da pinça num nó, desenhado como ramos conectados, na linguagem do mapa da
 * Missão: os cartões do mapa (`noEl`, o dono único de cada espécie) em colunas e uma curva de cada cartão até o de onde ele sai, pelo mesmo
 * desenho e o mesmo agendador das ligações do mapa (`ligarCurvas`, view/ligacoes.ts). O nó do zoom fica no centro; o
 * que o contém se abre à esquerda, o que ele tem dentro se ramifica à direita, e os pares ficam na
 * coluna do nó de onde saem, ligados a ele.
 *
 * Por quê: a correção (30/10/2026): a navegação é por gestos, e tudo vira ramos conectados; antes, tudo
 * estava desconectado. As direções não têm título: são para onde os gestos levam (a vertical
 * pelo eixo principal do nó, a horizontal pelas conexões, a pinça mais fundo no nó sob os dedos), e
 * uma legenda pequena diz isso. O clique e a pinça continuam separados: o clique num cartão abre o
 * painel dele (`data-node`, como em toda a Missão).
 *
 * Só desenha o que chega pronto (`mapaDoRamo`, `migalhasDoZoom`, telaDoRamo.ts): nenhum nome de tipo,
 * de campo nem de ramo mora aqui. Os gestos saem como `data-node` (o painel), `data-act`
 * `ramo-parte` (voltar a uma parte do caminho) e `ramo-mais` (mais conexões), que o casco trata.
 */
import type { Formacao } from '../../engine/domainModel';
import { PINCA, RAMO } from '../frases';
import { TRACO_DAS_LIGACOES, type CartaoDoRamo, type MapaDoRamo, type MigalhaDoZoom } from '../telaDoRamo';
import { botao, el, svg } from './dom';
import type { Contexto } from './contrato';
import type { SuperficieDasLigacoes } from './ligacoes';
import { noEl } from './nos';
import { alternarEl, maisDoContexto } from './interacao';

/** O que a vista do ramo recebe do casco: o contexto da vista (o do cartão único), o nó escolhido e o item da vez. */
export type ContextoDoRamo = Contexto & { selecionado: string | null; cursor: number | null };

/** O que faz: o caminho do zoom: cada parte volta com um clique; a última é onde se está. */
export function caminhoDoZoomEl(ctx: ContextoDoRamo, partes: readonly MigalhaDoZoom[]): HTMLElement {
    const nav = el(ctx.doc, 'nav', 'ramo-caminho chain', { 'aria-label': PINCA.caminho });
    partes.forEach((p, i) => {
        if (i) nav.appendChild(el(ctx.doc, 'span', 'sep', { 'aria-hidden': 'true' }, '›'));
        if (p.atual) { nav.appendChild(el(ctx.doc, 'span', 'ramo-parte atual', { 'aria-current': 'true' }, p.rotulo)); return; }
        const b = nav.appendChild(botao(ctx.doc, 'ramo-parte', p.rotulo, { 'data-act': 'ramo-parte', 'data-manter': p.manter }));
        ctx.marcar(b, PINCA.dicaDaParte(p.rotulo));
    });
    return nav;
}

/**
 * O que faz: um cartão do mapa do ramo: o cartão único do nó (`noEl`, o mesmo do mapa, com o nó que o
 * modelo compõe), dentro de um invólucro que só diz a posição e a escolha no ramo: a chave do cartão
 * (`data-cartao`, a ponta das curvas), o nível, o centro e o item da vez do passo horizontal.
 * Por quê: o nó de tarefa, SMART ou comum, tem o mesmo tipo na tela inicial e no ramo; um tipo
 * diferente ali é um erro grave (30/10/2026).
 */
function envoltorioDoCartao(ctx: ContextoDoRamo, c: CartaoDoRamo): HTMLElement {
    const d = ctx.doc;
    const centro = c.profundidade === 0;
    const cursor = c.indice !== null && c.indice === ctx.cursor;
    const w = el(d, 'div', `n-ramo n${Math.min(c.profundidade, 4)}${centro ? ' ramo-centro-no' : ''}${cursor ? ' cursor' : ''}`, { 'data-cartao': c.chave, 'data-i': c.indice, 'aria-current': cursor ? 'true' : null });
    // O cartão do mapa com a interação do mapa (o que ele oferece ao passar o mouse e a alça de ligar).
    // O "+ <Tipo>" do centro mora no pé das colunas (abaixo, `ramoEl`): o cartão dele não o repete.
    const no = w.appendChild(noEl(ctx, c.no, { minis: true, maisNoPe: centro }));
    const cartao = (no.querySelector('.node') ?? no) as HTMLElement;
    if (c.id && c.id === ctx.selecionado) cartao.classList.add('selected');
    // A relação com quem o traz vai na dica do invólucro (a curva já a desenha).
    const sobre = [c.relacao ? RAMO.relacao[c.relacao] ?? c.relacao : null, c.rotulo].filter(Boolean).join(' · ');
    if (c.quantos) ctx.marcar(w, PINCA.dicaDoGrupo(c.quantos, c.titulo));
    else if (c.id) ctx.marcar(w, `${centro ? PINCA.dicaDoCentro(c.titulo) : PINCA.dicaDoItem(c.titulo)}${sobre ? ` · ${sobre}` : ''}`);
    // O expandir e o recolher do que o nó tem abaixo (30/10), pela interação única.
    if (c.id && c.filhos) { w.setAttribute('data-filhos', c.filhos); w.appendChild(alternarEl(ctx, c.id, c.titulo, c.filhos === 'aberto')); }
    return w;
}

/**
 * O que faz: a vista do ramo inteira: o caminho do zoom, o mapa (as colunas de cartões sobre o SVG
 * das curvas), a legenda dos gestos e o "mais conexões" quando o nível atual tem mais do que se mostra.
 * As curvas são as de toda a Missão (`superficieDoRamo` dá ao agendador único de view/ligacoes.ts o
 * que desenhar aqui), medidas de novo sempre que o layout muda.
 * Entra → sai: o contexto, o mapa, o caminho e a formação do nó → o elemento.
 */
export function ramoEl(ctx: ContextoDoRamo, m: MapaDoRamo, partes: readonly MigalhaDoZoom[], f: Formacao): HTMLElement {
    const d = ctx.doc;
    const raiz = el(d, 'section', 'ramo', { 'aria-label': PINCA.ramoDe(m.titulo), 'data-ramo': m.id, 'data-vertical': f.vertical, 'data-profundidade': m.profundidade });
    raiz.appendChild(caminhoDoZoomEl(ctx, partes));
    const mapa = raiz.appendChild(el(d, 'div', 'ramo-mapa'));
    mapa.appendChild(svg(d, 'svg', { class: 'edges', 'aria-hidden': 'true' }) as unknown as HTMLElement);
    for (const col of m.colunas) {
        const c = mapa.appendChild(el(d, 'div', `ramo-col${col.x === 0 ? ' ramo-col-centro' : ''}`, { 'data-x': col.x, 'data-coluna': col.grupo ?? null }));
        // A coluna da disposição declarada diz o nome dela (02/11: Projetos, SMART, Tarefas, Dias), quando tem
        // cartões ou recebe o "+"; sem ela, a coluna só de SMART, ou só de tarefas, diz o grupo (30/10).
        const tipos = new Set(col.cartoes.map(k => k.no.tipo));
        const nome = col.grupo ?? (col.x !== 0 && tipos.size === 1 ? [...tipos][0] : undefined);
        const grupo = col.grupo ? (col.cartoes.length || col.x === m.xDoMais ? RAMO.colunaDeclarada[col.grupo] : undefined) : nome ? RAMO.grupoDaColuna[nome] : undefined;
        if (grupo) c.appendChild(el(d, 'div', 'ramo-col-grupo', { 'data-grupo-da-coluna': nome }, grupo));
        for (const cartao of col.cartoes) c.appendChild(envoltorioDoCartao(ctx, cartao));
    }
    // O "+" do que se cria a partir do centro (o mesmo Novo do "+ <Tipo>" do cartão, com a ligação ao centro já
    // respondida), um lugar por tipo (02/11: o botão de adicionar tarefa SMART fica no campo da tarefa SMART, e
    // não no da tarefa): no pé da coluna do tipo, quando ela tem cartões; senão, na coluna do "+" (`formacao.mais`),
    // junto dos outros. Sem a coluna do "+", ela nasce para ele.
    const porColuna = new Map<number, string[]>();
    for (const n of ctx.novos?.(m.id) ?? []) {
        const x = m.colunas.find(c => c.grupo === n.tipo && c.cartoes.length)?.x ?? m.xDoMais;
        porColuna.set(x, [...(porColuna.get(x) ?? []), n.tipo]);
    }
    for (const [x, tipos] of porColuna) {
        const mais = maisDoContexto(ctx, m.id, tipos);
        if (!mais) continue;
        const coluna = (mapa.querySelector(`.ramo-col[data-x="${x}"]`) as HTMLElement | null) ?? mapa.appendChild(el(d, 'div', 'ramo-col', { 'data-x': x }));
        coluna.appendChild(mais);
    }
    const pe = raiz.appendChild(el(d, 'div', 'ramo-pe'));
    pe.appendChild(el(d, 'p', 'ramo-legenda', null, PINCA.legenda(Math.max(1, m.profundidade), PINCA.vertical[f.vertical])));
    if (m.escondidos) pe.appendChild(el(d, 'span', 'ramo-escondidos', null, PINCA.escondidos(m.escondidos)));
    const nosGrupos = m.colunas.flatMap(c => c.cartoes).reduce((s, c) => s + (c.quantos ?? 0), 0);
    if (m.mais > 0 || nosGrupos > 0) {
        const b = pe.appendChild(botao(d, 'btn ramo-mais', PINCA.maisConexoes(m.mais + nosGrupos), { 'data-act': 'ramo-mais' }));
        ctx.marcar(b, PINCA.dicaMais);
    }
    return raiz;
}

/**
 * O que faz: a superfície das curvas do mapa do ramo (uma de cada cartão até o de onde sai), para o
 * mesmo desenho e o mesmo agendador das ligações do mapa da Missão (`ligarCurvas`, view/ligacoes.ts):
 * o conteúdo é o mapa do ramo, a ponta é o cartão de dentro de cada invólucro (`data-cartao`), e os
 * pares na mesma coluna vão por um colchete.
 * Entra → sai: a vista do ramo no DOM e o mapa → a superfície, ou `null` sem o mapa à vista.
 */
export function superficieDoRamo(vista: HTMLElement, m: MapaDoRamo): SuperficieDasLigacoes | null {
    const mapa = vista.querySelector('.ramo-mapa') as HTMLElement | null;
    if (!mapa || vista.hidden) return null;
    return { conteudo: mapa, ligacoes: m.ligacoes, ramoPrincipal: { ligacoes: TRACO_DAS_LIGACOES }, realce: null, soLinhagem: false, opcoes: { atributo: 'data-cartao', emColuna: true } };
}
