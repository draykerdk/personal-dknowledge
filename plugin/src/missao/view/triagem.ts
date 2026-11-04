/**
 * A tela da triagem, desenhada: a prateleira do que ainda não tem lugar, um item por vez,
 * com as teclas à vista, ao lado da linha do tempo (que é o alvo do arrasto).
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, 8.6, 8.8, 9.3) e o plano (3d.1): "a
 * prateleira de um lado e a linha do tempo do outro, como alvo"; "pelo teclado, uma por
 * vez"; "na triagem as teclas mudam, e a legenda diz quais"; os sinais como filtro. O
 * protótipo aprovado não tem a tela (só os botões "Nova data · Algum dia · Cancelar" no
 * painel do nó); ela segue a mesma língua: o mesmo nó, os mesmos botões, as mesmas cores do
 * tema.
 *
 * Só desenha: o que cada botão faz mora no componente, pelo atributo (`data-tri-*`). Sem
 * nome de ramo nem de tipo de nota aqui (§3.8): os grupos, os rótulos e as teclas vêm de
 * `triagem.ts`. No celular, as ações ficam desligadas, com a nota que o lugar dá (§9.1).
 * Prova: tests/missao/componenteTriagem.test.ts.
 */
import type { ItemDaTriagem, MissaoModelo } from '../tipos';
import { GRUPOS, teclasDoItem, teclasDoTipo } from '../triagem';
import { ESTIMATIVAS, filtrosDaTriagem, itemAtual, pendentes, posicao, type EstadoDaTriagem } from '../telaDaTriagem';
import type { Vocabularios } from '../../engine/fieldModel';
import { addDays } from '../tempo';
import { botao, el, icone } from './dom';

/**
 * O formulário aberto no item (a tecla que pede uma escolha). O projeto e a SMART não têm formulário aqui
 * (02/11, um jeito por função): as teclas deles abrem o "＋ Adicionar" do campo do pai, o mesmo do painel.
 */
export type FormDaTriagem = 'dia' | 'onde' | 'estimativa';

export interface DadosDaTriagem {
    doc: Document;
    modelo: MissaoModelo;
    estado: EstadoDaTriagem;
    /** Grava aqui (o lugar deu as gravações; no celular, não). */
    grava: boolean;
    /** O arrasto vale aqui (grava e há espaço); sem ele, as teclas e os botões. */
    arrasta: boolean;
    /** O cofre tem o protocolo do 🗂️ destino da ideia? `false` = as teclas e o arrasto da ideia somem; sem dizer, aparecem. */
    destinoDaIdeia?: boolean;
    /** Sem gravações, o porquê que o lugar dá ("No celular é só para ver; as ações ficam no computador"). */
    motivo?: string;
    form: FormDaTriagem | null;
    vocabularios?: Vocabularios;
    marcar: (el: HTMLElement, texto: string, tecla?: string) => void;
}

/** O nome do tipo do item, para a linha de cima do cartão. */
const TIPO: Record<ItemDaTriagem['tipo'], string> = { acao: 'ação', smart: 'SMART', nota: 'captura', ideia: 'ideia', rascunho: 'rascunho', proposta: 'proposta' };
const ICONE: Record<ItemDaTriagem['tipo'], string> = { acao: 'acao', smart: 'smart', nota: 'prateleira', ideia: 'visao', rascunho: 'prateleira', proposta: 'prateleira' };

/** O que faz: o texto das faltas (o grupo e as marcas), pelos rótulos dos grupos. */
function faltasDe(item: ItemDaTriagem): string[] {
    const rot = (sinal: string) => GRUPOS.find(g => g.sinal === sinal)?.rotulo.toLowerCase() ?? sinal;
    return item.marcas.map(rot);
}

/** O que faz: o fato do item (o sinal do grupo dele, como o modelo o diz), ou o do tipo. */
function fatoDe(m: MissaoModelo, item: ItemDaTriagem): string {
    if (item.proposta) return `${item.proposta.texto} · ${item.proposta.porque}`;
    if (item.tipo === 'rascunho') return `parado há ${item.dias ?? '?'} dias${item.protocolo ? ` · ${item.protocolo}` : ''}`;
    if (item.tipo === 'ideia') return item.destino === 'Lista de Espera' ? 'na Lista de Espera' : 'sem destino';
    if (item.tipo === 'nota') return 'na Caixa de entrada';
    const sinal = GRUPOS.find(g => g.id === item.grupo)?.sinal;
    const s = m.sinaisDoNo(item.id).find(x => x.tipo === sinal);
    return s?.fato ?? GRUPOS.find(g => g.id === item.grupo)?.rotulo ?? '';
}

/**
 * O que faz: o conteúdo da tela da triagem (o cabeçalho, os filtros, o item à vista com as
 * ações e o formulário aberto, os alvos Algum dia e Cancelar, os próximos e a legenda).
 * Entra → sai: os dados → o elemento (o componente troca o conteúdo inteiro a cada pintura).
 */
export function conteudoDaTriagem(d: DadosDaTriagem): HTMLElement {
    const { doc, modelo: m } = d;
    const p = m.triagem;
    const box = el(doc, 'div', 'tri-in');
    const hd = box.appendChild(el(doc, 'div', 'tri-hd'));
    hd.appendChild(el(doc, 'h2', null, null, 'Triagem'));
    const pos = posicao(p, d.estado);
    hd.appendChild(el(doc, 'span', 'tri-pos mono', { 'aria-live': 'polite' }, pos.n ? `${pos.i} de ${pos.n}` : 'nada a triar'));
    const x = hd.appendChild(botao(doc, 'x', '×', { 'data-act': 'tri-fechar', 'aria-label': 'Fechar a triagem' }));
    d.marcar(x, 'Fechar a triagem', 'Esc');

    const fs = box.appendChild(el(doc, 'div', 'tri-filtros', { role: 'group', 'aria-label': 'Filtro pelos sinais' }));
    for (const f of filtrosDaTriagem(p)) {
        const b = fs.appendChild(botao(doc, 'tri-f', null, { 'data-tri-filtro': f.id ?? '', 'aria-pressed': String(d.estado.filtro === f.id) }));
        b.append(el(doc, 'span', null, null, f.rotulo), el(doc, 'span', 'tri-n mono', null, String(f.n)));
        d.marcar(b, `Filtro: ${f.rotulo} (${f.n})`);
    }

    if (!d.grava) {
        box.appendChild(el(doc, 'p', 'tri-nota', { role: 'note' }, d.motivo || 'Aqui a triagem é só para ver: nada grava neste lugar.'));
    }

    const item = itemAtual(p, d.estado);
    if (!item) {
        box.appendChild(el(doc, 'p', 'empty tri-vazio', null, d.estado.filtro ? 'Nada mais neste filtro.' : 'Tudo tem lugar: nada a triar agora.'));
        return box;
    }

    const card = box.appendChild(el(doc, 'section', 'tri-item', { 'aria-label': `Item à vista: ${item.titulo}`, 'data-tri-item': item.id }));
    const kind = card.appendChild(el(doc, 'div', 'kind'));
    kind.append(icone(doc, ICONE[item.tipo]), el(doc, 'span', null, null, `${TIPO[item.tipo]} · ${GRUPOS.find(g => g.id === item.grupo)?.rotulo ?? ''}`));
    const tarefa = item.tipo === 'acao' || item.tipo === 'smart';
    // O título é o nó: arrasta até a linha do tempo (a tarefa e a ideia), e Enter abre no painel.
    const comDestino = d.destinoDaIdeia !== false;
    const arrasta = d.arrasta && (tarefa || (item.tipo === 'ideia' && comDestino));
    const titulo = card.appendChild(botao(doc, 'tri-titulo', null, {
        'data-tri-abrir': item.id, 'data-node': tarefa ? item.id : null, 'data-drag': arrasta ? (tarefa ? item.tipo : 'ideia') : null,
        'data-tri-ideia': item.tipo === 'ideia' ? item.caminho : null,
    }));
    titulo.append(el(doc, 'span', 'tt', null, item.titulo));
    d.marcar(titulo, arrasta ? `${item.titulo}: arraste até um dia, uma semana, um projeto ou uma SMART; Enter abre` : `${item.titulo}: Enter abre`);
    card.appendChild(el(doc, 'p', 'tri-fato', null, fatoDe(m, item)));
    const faltas = faltasDe(item);
    if (faltas.length) {
        const ms = card.appendChild(el(doc, 'div', 'tri-marcas', { 'aria-label': 'Outras faltas' }));
        for (const f of faltas) ms.appendChild(el(doc, 'span', 'tri-tag', null, f));
    }

    const acts = card.appendChild(el(doc, 'div', 'acts tri-acoes'));
    for (const t of teclasDoTipo(item.tipo, comDestino)) {
        const b = acts.appendChild(botao(doc, 'btn', null, { 'data-tri-tecla': t.tecla.toLowerCase(), disabled: !d.grava }));
        b.append(el(doc, 'span', null, null, t.rotulo), el(doc, 'span', 'k', null, t.tecla));
        d.marcar(b, `${t.rotulo}`, t.tecla);
    }
    if (d.form) card.appendChild(formulario(d, item));

    if (d.grava && tarefa) {
        const alvos = box.appendChild(el(doc, 'div', 'tri-alvos', { 'aria-label': 'Soltar aqui' }));
        for (const [id, rot] of [['algum-dia', 'Algum dia'], ['cancelar', 'Cancelar']] as const) {
            const z = alvos.appendChild(el(doc, 'div', 'tri-alvo', { 'data-tri-soltar': id }));
            z.append(el(doc, 'span', null, null, rot), el(doc, 'span', 'k', null, id === 'algum-dia' ? 'L' : 'X'));
        }
    }

    const resto = pendentes(p, d.estado).filter(i => i.id !== item.id).slice(0, 8);
    if (resto.length) {
        const lst = box.appendChild(el(doc, 'div', 'tri-prox'));
        lst.appendChild(el(doc, 'h3', null, null, 'Depois'));
        for (const r of resto) {
            const b = lst.appendChild(botao(doc, 'tri-li', null, { 'data-tri-ir': r.id }));
            b.append(icone(doc, ICONE[r.tipo]), el(doc, 'span', 'tt', null, r.titulo), el(doc, 'span', 'tri-g', null, GRUPOS.find(g => g.id === r.grupo)?.rotulo ?? ''));
            d.marcar(b, `Ir para ${r.titulo}`);
        }
    }

    const lg = box.appendChild(el(doc, 'div', 'keys tri-teclas', { 'aria-label': 'Teclas da triagem' }));
    for (const [k, txt] of teclasDoItem(item, comDestino)) lg.append(el(doc, 'kbd', null, null, k), el(doc, 'span', null, null, txt));
    return box;
}

/** O que faz: o formulário da tecla que pede escolha (o dia, onde, a estimativa). */
function formulario(d: DadosDaTriagem, item: ItemDaTriagem): HTMLElement {
    const { doc, modelo: m } = d;
    const f = el(doc, 'div', 'tri-form fields', { 'data-tri-form': d.form! });
    const ok = (txt = 'OK') => botao(doc, 'btn', txt, { 'data-act': 'tri-ok' });
    const fechar = botao(doc, 'btn', 'Cancelar', { 'data-act': 'tri-cancelar' });
    const linha = (rotulo: string, campo: HTMLElement) => { f.append(el(doc, 'label', null, null, rotulo), campo); };
    if (d.form === 'dia') {
        linha('Dia', el(doc, 'input', null, { type: 'date', 'data-tri-input': 'dia', value: addDays(m.hoje, 1), 'aria-label': 'Dia' }));
    } else if (d.form === 'onde') {
        const g = el(doc, 'div', 'ctxs', { role: 'group', 'aria-label': 'Onde dá para fazer' });
        const tem = new Set(m.indice.porId.get(item.id)?.record.contexts ?? []);
        for (const c of d.vocabularios?.contextos ?? []) {
            const l = g.appendChild(el(doc, 'label', 'ctx'));
            l.append(el(doc, 'input', null, { type: 'checkbox', value: c.valor, 'data-tri-onde': c.valor, checked: tem.has(c.valor) }), el(doc, 'span', null, null, c.rotulo));
        }
        linha('Onde', g);
    } else {
        const g = el(doc, 'div', 'acts', { role: 'group', 'aria-label': 'Estimativa' });
        for (const n of ESTIMATIVAS) g.appendChild(botao(doc, 'btn', `${n} min`, { 'data-tri-est': String(n) }));
        linha('Estimativa', g);
        f.append(el(doc, 'span'), fechar);
        return f;
    }
    const acts = el(doc, 'div', 'acts');
    acts.append(ok(), fechar);
    f.append(el(doc, 'span'), acts);
    return f;
}
