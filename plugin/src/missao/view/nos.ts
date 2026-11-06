/**
 * Os nós da Missão no DOM: a ação, a SMART, o projeto, a área, os nós do tempo, o lugar, a pessoa, a
 * nota, o item da checklist e o grupo de conexões; o período do centro, as marcas da linha fechada,
 * as amostras da legenda e os traços da forma de mostrar.
 *
 * O dono único do cartão de cada espécie (30/10/2026: o nó de tarefa tem o mesmo tipo no mapa e no ramo,
 * e os outros nós seguem o mesmo padrão): o
 * mapa, o ramo, o Sistema e as listas do painel desenham por `noEl`, com o nó que o modelo compõe
 * (`modelo.no`); nenhuma outra vista monta um `.node`. O que o cartão oferece (as ações, o "+ <Tipo>",
 * o Ligar) e a alça de ligar vêm de um dono só também, a interação (view/interacao.ts), igual em toda
 * vista que mostra cartões. Prova: tests/missao/cartaoUnico.test.ts e tests/missao/interacao.test.ts.
 *
 * Por quê: o protótipo aprovado (template, 1025–1156): o estado pela forma (cheio feita,
 * contorno aberta, tracejado pendente, claro algum dia), a cor pelo ramo da Temporada,
 * o texto pela função única (a linha do nó vem pronta do modelo; aqui nada se conta).
 * Cada nó é um botão com nome: título · estado · data (§9.3).
 *
 * Só desenha: recebe o nó do modelo e devolve o elemento.
 */
import type { GrammarCounts } from '../../engine/showGrammar';
import type { MarcaFechada, MissaoModelo, MissaoNo, Sinal } from '../tipos';
import { MODELO_ANTIGO } from '../estados';
import { PAINEL } from '../frases';
import type { CicloDoPeriodo } from '../ramoPrincipal';
import type { Escala } from '../tempo';
import { periodoDoId } from '../tempo';
import { FALTAS } from '../sinais';
import { el, botao, icone } from './dom';
import type { Contexto } from './contrato';
import { alcaDoNo, ferramentasDoNo } from './interacao';
import { partesDoTrimestre } from '../formatos';

/** Quantas cores de ramo o tema dá (ciano, amarelo, roxo, azul, laranja, verde). */
export const CORES_DE_RAMO = 6;

/** O que faz: a classe da cor do ramo e o "auxiliar" (tom mais leve), pelo projeto. */
export function classeDoRamo(modelo: MissaoModelo, ramo: number, projeto: string | null): string {
    const p = projeto ? modelo.indice.projetos.get(projeto) : null;
    const base = ramo >= 0 ? `br-${ramo % CORES_DE_RAMO}` : 'br-nb';
    return `${base}${p?.papel === 'auxiliar' ? ' aux' : !p ? ' aux' : ''}`;
}

/** O que faz: o projeto de um nó (o próprio, ou o da tarefa). */
export function projetoDoNo(modelo: MissaoModelo, id: string): string | null {
    if (id.startsWith('p:')) return id;
    return modelo.indice.porId.get(id)?.projeto ?? null;
}

const CLASSE_DO_ESTADO: Record<NonNullable<MissaoNo['estado']>, string> = {
    feita: 'st-done', aberta: 'st-open', pendente: 'st-pend', 'algum-dia': 'st-some',
};
export const classeDoEstado = (e?: MissaoNo['estado']) => (e ? CLASSE_DO_ESTADO[e] : 'st-open');

/** O que faz: os traços da forma de mostrar (cheio feita, contorno falta, pontilhado algum dia), até `max`. */
export function tracos(doc: Document, g: GrammarCounts | undefined, max = 16): HTMLElement | null {
    if (!g) return null;
    const n = g.feitas + g.faltam + g.algumDia;
    if (!n) return null;
    const escala = n > max ? max / n : 1;
    const nf = Math.round(g.feitas * escala), nm = Math.round(g.faltam * escala);
    const na = Math.max(0, Math.min(max, Math.round(n * escala)) - nf - nm);
    const box = el(doc, 'span', 'ticks', { 'aria-hidden': 'true' });
    for (let i = 0; i < nf; i++) box.appendChild(el(doc, 'i', 'f'));
    for (let i = 0; i < nm; i++) box.appendChild(el(doc, 'i'));
    for (let i = 0; i < na; i++) box.appendChild(el(doc, 'i', 's'));
    return box;
}

const sep = (doc: Document) => el(doc, 'i', 'sep', null, '·');

function antigo(doc: Document, no: MissaoNo): HTMLElement | null {
    return no.marcas?.includes(MODELO_ANTIGO) ? el(doc, 'span', 'chip-old', null, MODELO_ANTIGO) : null;
}

/** O que faz: a hora marcada do nó (`HH:MM`), ou `null` sem hora. */
function horaDoNo(no: MissaoNo): string | null {
    return no.hora && /^\d{1,2}:\d{2}$/.test(no.hora) ? no.hora : null;
}

/**
 * O que faz: diz se a hora marcada da tarefa aberta já passou: o dia dela antes de hoje, ou hoje com a
 * hora antes da de agora (pelo relógio do contexto); sem relógio, sem dia ou feita, não.
 */
function horaPassou(ctx: Contexto, no: MissaoNo, hora: string): boolean {
    if (no.estado === 'feita' || !no.dia || !ctx.relogio) return false;
    const agora = ctx.relogio();
    return no.dia < agora.dia || (no.dia === agora.dia && hora.padStart(5, '0') < agora.hora.padStart(5, '0'));
}

/** O que faz: o nome falado do nó (título · estado · data). */
export function nomeDoNo(no: MissaoNo): string {
    const canvas = no.tipo === 'projeto' ? (no.temCanvas ? 'com canvas' : 'sem canvas') : '';
    return [no.titulo, no.estagio, no.sub, no.doRamo ? `ramo: ${no.doRamo.linha}` : no.linha, no.proxima ? PAINEL.nomeDaProxima(no.proxima) : '', no.aprendizado ?? '', no.conta ? `${no.conta.rotulo}: ${no.conta.linha}` : '', canvas, no.marcas?.includes(MODELO_ANTIGO) ? MODELO_ANTIGO : ''].filter(Boolean).join(' · ');
}

interface OpcoesDoNo {
    compacto?: boolean;
    pendente?: boolean;
    /**
     * A interação do cartão (view/interacao.ts): o que ele oferece ao passar o mouse ou com o foco e a
     * alça de ligar. Em toda vista que mostra cartões (o mapa, o ramo, o Sistema); nas listas do painel
     * e na legenda, não (o painel já é o lugar das ações).
     */
    minis?: boolean;
    /** O "+ <Tipo>" do nó mora no pé do lugar dele (o centro do ramo): a fila do cartão não o repete. */
    maisNoPe?: boolean;
}

/**
 * O que faz: os sinais do plano de um nó, para a marca discreta (§8.8): a SMART sem ação, o
 * prazo vencido, o que ficou de antes, a central sem movimento, a semana sem plano. As faltas
 * de dado (sem data, sem onde…) ficam no painel e no filtro da triagem, não no nó.
 */
export function sinaisDaMarca(ctx: Contexto, id: string): Sinal[] {
    return ctx.modelo.sinaisDoNo(id).filter(s => !FALTAS.includes(s.tipo));
}

/**
 * O que faz: a marca dos sinais no nó (um ponto; vermelho só no prazo vencido) e o nome falado
 * com os fatos; sem sinal, o nome de sempre.
 * Por quê: §8.8, "uma marca discreta no nó (um ponto, com o texto no título e no painel)"; o
 * sinal descreve o plano, nunca a pessoa: o texto é o fato dele, sem juízo.
 */
function marcarSinais(ctx: Contexto, b: HTMLElement, id: string, nome: string): void {
    const lista = sinaisDaMarca(ctx, id);
    if (!lista.length) { ctx.marcar(b, nome); return; }
    const vencida = lista.some(s => s.tipo === 'prazo-vencido');
    b.appendChild(el(ctx.doc, 'span', `sig${vencida ? ' sig-vencida' : ''}`, { 'aria-hidden': 'true', 'data-sinais': lista.map(s => s.tipo).join(' ') }));
    ctx.marcar(b, `${nome} · ${lista.map(s => s.fato).join(' · ')}`);
}

/**
 * O que faz: o elemento de um nó de qualquer tipo, pela forma do tipo (o protótipo).
 * Erro e ataque: tipo que o desenho não conhece sai como nó do tempo, com título e linha.
 */
export function noEl(ctx: Contexto, no: MissaoNo, o: OpcoesDoNo = {}): HTMLElement {
    const { doc, modelo } = ctx;
    const ramo = classeDoRamo(modelo, no.ramo, projetoDoNo(modelo, no.id));
    const cmp = o.compacto ? ' cmp' : '';
    let b: HTMLElement;
    // O nome sem nó (o país sem nota, o bloqueio que não acha tarefa) é o mesmo cartão, escrito e sem clique.
    const casca = (cls: string): HTMLElement => (no.id ? botao(doc, cls, null, { 'data-node': no.id }) : el(doc, 'span', `${cls} sem-no`));
    if (no.tipo === 'grupo') {
        // O grupo de conexões de pouco valor do mesmo tipo ("3 · Dia"): o clique o abre.
        b = botao(doc, `node n-grupo${cmp}`, null, { 'data-act': 'ramo-grupo', 'data-grupo': no.id });
        b.appendChild(icone(doc, 'nota'));
        b.appendChild(el(doc, 'span', 'tt', null, no.titulo));
        const meta = el(doc, 'span', 'meta');
        meta.appendChild(el(doc, 'span', 'grow', null, no.linha));
        b.appendChild(meta);
        return b;
    }
    if (no.tipo === 'item') {
        // O item da checklist da nota: feito (cheio) ou aberto (contorno), como a ação.
        b = casca(`node n-item ${classeDoEstado(no.estado)}${cmp}`);
        b.appendChild(icone(doc, no.estado === 'feita' ? 'acaoFeita' : 'acao'));
        b.appendChild(el(doc, 'span', 'tt', null, no.titulo));
        const meta = el(doc, 'span', 'meta');
        meta.appendChild(el(doc, 'span', 'grow', null, no.linha));
        b.appendChild(meta);
        return b;
    }
    if (no.tipo === 'acao') {
        const st = classeDoEstado(o.pendente ? 'pendente' : no.estado);
        b = casca(`node n-task ${ramo} ${st}${cmp}`);
        b.appendChild(icone(doc, no.estado === 'feita' ? 'acaoFeita' : 'acao'));
        // A hora marcada é um selo no começo do próprio cartão (02/11: a data e a hora não se repetem, só se
        // marcam na própria tarefa): no início do título, que nunca se corta, e a
        // linha de baixo sem repeti-la.
        const hora = horaDoNo(no);
        const tt = b.appendChild(el(doc, 'span', 'tt'));
        // A hora que já passou, na tarefa ainda aberta, leva a marca de alerta (02/11).
        const passou = !!hora && horaPassou(ctx, no, hora);
        if (hora) {
            const selo = tt.appendChild(el(doc, 'span', `num hora${passou ? ' passou' : ''}`, null, hora));
            if (passou) selo.setAttribute('title', 'a hora já passou');
            tt.append(' ');
        }
        tt.append(no.titulo);
        const [status, est, ...data] = no.linha.split(' · ');
        if (hora && data[data.length - 1] === hora) data.pop();
        const meta = el(doc, 'span', 'meta');
        meta.append(el(doc, 'span', 'pill', null, status), sep(doc), el(doc, 'span', 'num', null, est ?? ''), sep(doc), el(doc, 'span', 'num grow', null, (o.pendente ? 'desde ' : '') + data.join(' · ')));
        b.appendChild(meta);
    } else if (no.tipo === 'smart') {
        const st = classeDoEstado(o.pendente ? 'pendente' : no.estado);
        b = casca(`node n-smart ${ramo} ${st}${cmp}`);
        b.appendChild(icone(doc, 'smart'));
        b.appendChild(el(doc, 'span', 'tt', null, no.titulo));
        const meta = el(doc, 'span', 'meta');
        const t = tracos(doc, no.contagens, 10);
        if (t) meta.appendChild(t);
        meta.appendChild(el(doc, 'span', 'grow', null, no.linha));
        const old = antigo(doc, no);
        if (old) meta.appendChild(old);
        b.appendChild(meta);
    } else if (no.tipo === 'projeto') {
        const central = no.papel === 'central' ? ' central' : '';
        b = casca(`node n-proj ${ramo}${central}${cmp}`);
        b.appendChild(icone(doc, 'projeto'));
        b.appendChild(el(doc, 'span', 'tt', null, no.titulo));
        const meta = el(doc, 'span', 'meta');
        const q = (no.sub ?? '').split(' · ')[0];
        // O "Q4 ·" só onde diz algo (no trimestre e no ano); no dia e na semana a trilha já diz.
        if (/^Q\d$|^\d{4}$/.test(q) && (ctx.escala === 'trimestre' || ctx.escala === 'ano')) meta.append(el(doc, 'span', 'num', null, q), sep(doc));
        // O estágio (a coluna, pela tabela de estados do modelo) no próprio cartão: o mapa, o ramo, as listas e a legenda o mostram.
        if (no.estagio) meta.appendChild(el(doc, 'span', 'pill estagio', null, no.estagio));
        // A central diz o ramo inteiro (ela e os auxiliares), pela mesma conta do projeto.
        meta.appendChild(el(doc, 'span', 'grow', null, no.doRamo ? `ramo · ${no.doRamo.linha}` : no.linha));
        const cv = el(doc, 'span', `chip-canvas${no.temCanvas ? '' : ' sem'}`, { 'aria-hidden': 'true' });
        cv.appendChild(icone(doc, 'canvas'));
        meta.appendChild(cv);
        b.appendChild(meta);
        // A próxima ação real do projeto (02/11), numa linha embaixo; nas listas compactas, só no nome.
        if (no.proxima && !o.compacto) b.appendChild(el(doc, 'span', 'prox', null, PAINEL.marcaDaProxima(no.proxima)));
        // O centro do módulo de aprendizado (05/11): a fila de hoje e o nível em curso, na mesma linha de baixo.
        if (no.aprendizado && !o.compacto) b.appendChild(el(doc, 'span', 'prox', null, no.aprendizado));
        // A frente de renda (05/11): a contagem das peças da linha que apontam o projeto, a mesma da Criação.
        if (no.conta && !o.compacto) b.appendChild(el(doc, 'span', 'prox', { 'data-conta': no.conta.rotulo }, `${no.conta.rotulo}: ${no.conta.linha}`));
    } else if (no.tipo === 'area') {
        b = casca(`node n-area${cmp}`);
        b.appendChild(icone(doc, 'area'));
        b.appendChild(el(doc, 'span', 'tt', null, no.titulo));
        const meta = el(doc, 'span', 'meta');
        meta.appendChild(el(doc, 'span', 'grow', null, no.linha));
        b.appendChild(meta);
    } else {
        // A nota com estado na tabela do modelo dela (30/10: a estadia na triagem, reservada, concluída) leva a forma dele.
        b = casca(`node n-wing${no.tipo === 'visao' ? ' vision' : ''}${no.estado ? ` ${classeDoEstado(no.estado)}` : ''}${cmp}`);
        b.appendChild(icone(doc, no.tipo));
        b.appendChild(el(doc, 'span', 'tt', null, no.titulo));
        if (no.sub) b.appendChild(el(doc, 'span', `wsub${no.tipo === 'trimestre' && !/^W\d/.test(no.sub) ? ' txt' : ''}`, null, no.sub));
        const meta = el(doc, 'span', 'meta');
        const t = tracos(doc, no.contagens, 10);
        if (t) meta.appendChild(t);
        meta.appendChild(el(doc, 'span', 'grow', null, no.linha));
        const old = antigo(doc, no);
        if (old) meta.appendChild(old);
        b.appendChild(meta);
        // As marcas do período (02/11): a de um ramo, o 📤 no ar, as pessoas e o dinheiro do dia, as mesmas do
        // período aberto (`periodoEl`), discretas, com o texto inteiro na dica: o dia no ramo da semana e a semana no
        // do trimestre são o mesmo nó do centro.
        const marcas = (no.marcas ?? []).filter(m => m !== MODELO_ANTIGO);
        if (marcas.length) {
            const fila = el(doc, 'span', 'marks');
            for (const m of marcas) {
                const cap = fila.appendChild(el(doc, 'span', 'cap', null, m));
                if (no.dicas?.[m]) cap.setAttribute('title', no.dicas[m]);
            }
            b.appendChild(fila);
        }
    }
    const dicas = (no.marcas ?? []).map(m => no.dicas?.[m]).filter(Boolean);
    if (no.id) marcarSinais(ctx, b, no.id, `${nomeDoNo(no)}${dicas.length ? ` · ${dicas.join(' · ')}` : ''}`);
    // P6: a ação e a SMART se arrastam (no tempo, para um projeto, para uma SMART); o projeto
    // recebe. A alça de ligar e o que o cartão oferece vêm da interação, iguais em toda vista.
    if (ctx.arrastar && no.id && (no.tipo === 'acao' || no.tipo === 'smart')) b.setAttribute('data-drag', no.tipo);
    if (ctx.arrastar && no.id && no.tipo === 'projeto') b.setAttribute('data-drop-project', no.id);
    const minis = o.minis && no.id ? ferramentasDoNo(ctx, no, !!o.maisNoPe) : null;
    const alca = o.minis && no.id ? alcaDoNo(ctx, no, ramo) : null;
    if (no.tipo === 'smart' || no.tipo === 'projeto' || no.tipo === 'area') {
        const w = el(doc, 'div', 'wrapn');
        w.appendChild(b);
        if (alca) w.appendChild(alca);
        if (minis) w.appendChild(minis);
        return w;
    }
    if (!minis && !alca) return b;
    // A ação vai num invólucro (`.tw`); o nó do tempo, alinhado à esquerda (`.wl`), como no protótipo.
    const w = el(doc, 'div', no.tipo === 'acao' ? 'tw' : 'wrapn wl');
    w.appendChild(b);
    if (alca) w.appendChild(alca);
    if (minis) w.appendChild(minis);
    return w;
}

/**
 * O que faz: a amostra de um cartão na legenda (a cor do ramo e o preenchimento do estado), compacta e
 * sem nó: o mesmo `.node` do mapa, só com o rótulo.
 * Por quê: a legenda montava o seu `.node` no casco; o cartão tem um dono só (30/10).
 */
export function amostraEl(doc: Document, classes: string, rotulo: string): HTMLElement {
    const s = el(doc, 'span', `node cmp ${classes}`);
    s.append(el(doc, 'span', 'tt', null, rotulo));
    return s;
}

/**
 * O que faz: o nó do centro aberto (o período grande): "hoje", o título, a linha de
 * cima, as marcas (pessoas, dinheiro, modelo antigo) e a forma de mostrar com os traços.
 */
export function periodoEl(ctx: Contexto, no: MissaoNo, o: { hoje: boolean; especial: boolean; pendentes: number }): HTMLButtonElement {
    const { doc } = ctx;
    const b = botao(doc, `period${o.hoje ? ' today' : ''}${o.especial ? ' special' : ''}`, null, { 'data-node': no.id });
    if (o.hoje) b.appendChild(el(doc, 'span', 'tag-hoje', null, ctx.escala === 'dia' ? 'hoje' : ctx.escala === 'semana' ? 'esta semana' : ctx.escala === 'trimestre' ? 'este trimestre' : 'este ano'));
    const big = el(doc, 'span', 'big');
    const q = partesDoTrimestre(no.titulo);
    const partes = (no.sub ?? '').split(' · ');
    let sub = no.sub ?? '';
    if (q) { big.append(`Q${q.trimestre}`); big.appendChild(el(doc, 'small', null, null, String(q.ano))); }
    else if (no.tipo === 'semana' && partes.length) { big.append(no.titulo); big.appendChild(el(doc, 'small', null, null, partes[0])); sub = partes.slice(1).join(' · '); }
    else big.textContent = no.titulo;
    b.appendChild(big);
    // A carga do dia vai à parte (`.cap`), com a marca quando passa do Bloco Sagrado (`.over`).
    const carga = no.carga && sub.endsWith(` · ${no.carga}`) ? no.carga : null;
    if (carga) sub = sub.slice(0, -(carga.length + 3));
    if (sub) b.appendChild(el(doc, 'span', 'sub', null, sub));
    if (carga) b.appendChild(el(doc, 'span', `cap${no.excede ? ' over' : ''}`, null, carga));
    for (const m of no.marcas ?? []) {
        const cap = b.appendChild(el(doc, 'span', m === MODELO_ANTIGO ? 'cap chip-old' : 'cap', null, m));
        // A marca discreta leva o texto inteiro na dica (as pessoas pelo nome, P9).
        if (no.dicas?.[m]) cap.setAttribute('title', no.dicas[m]);
    }
    const pend = o.pendentes ? ` · ${o.pendentes} ${o.pendentes === 1 ? 'pendente' : 'pendentes'} de antes` : '';
    // O que o ▶️ gravou, ou o que o 🌙 deixou para hoje (02/11): uma linha curta, sem cortar o centro.
    if (no.comando) b.appendChild(el(doc, 'span', 'prox', null, no.comando));
    if (no.linha || pend) {
        const gl = el(doc, 'span', 'gl');
        const t = tracos(doc, no.contagens, 14);
        if (t) gl.append(t, ' ');
        gl.append(`${no.linha}${pend}`);
        b.appendChild(gl);
    }
    const dicas = (no.marcas ?? []).map(m => no.dicas?.[m]).filter(Boolean);
    marcarSinais(ctx, b, no.id, `${nomeDoNo(no)}${no.comando ? ` · ${no.comando}` : ''}${pend}${dicas.length ? ` · ${dicas.join(' · ')}` : ''}`);
    return b;
}

/**
 * O que faz: um botão do ciclo (▶️ abrir o dia, 🌳 planejar…), com a dica dele; o componente
 * roda o protocolo pelo `data-act="ciclo"` (a escala, a chave e o índice levam ao botão do ramo).
 */
export function botaoDoCiclo(ctx: Contexto, c: CicloDoPeriodo, rotulo?: string): HTMLButtonElement {
    const b = botao(ctx.doc, 'cyc', rotulo ?? `${c.emoji} ${c.rotulo}`, { 'data-act': 'ciclo', 'data-escala': c.escala, 'data-chave': c.chave, 'data-i': String(c.i), 'data-protocolo': c.protocolo });
    ctx.marcar(b, `${c.emoji} ${c.dica}`);
    return b;
}

/** O que faz: a fila dos botões do ciclo de um período numa ponta (todas, sem `ponta`); `null` sem botão. */
export function cicloEl(ctx: Contexto, escala: Escala, chave: string, ponta?: 'inicio' | 'fim'): HTMLElement | null {
    const lista = (ctx.ciclos?.(escala, chave) ?? []).filter(c => !ponta || c.ponta === ponta);
    if (!lista.length) return null;
    const box = el(ctx.doc, 'div', 'cycle', { role: 'group', 'aria-label': 'Ciclo' });
    for (const c of lista) box.appendChild(botaoDoCiclo(ctx, c));
    return box;
}

/** O que faz: a marca de uma tarefa (ou SMART, projeto, trimestre) na linha fechada. */
export function marcaEl(ctx: Contexto, m: MarcaFechada): HTMLElement {
    const ramo = classeDoRamo(ctx.modelo, m.ramo, projetoDoNo(ctx.modelo, m.id));
    return el(ctx.doc, 'span', `chip ${m.tipo === 'smart' ? 'smart ' : ''}${ramo} ${classeDoEstado(m.estado)}`, { 'data-tid': m.id, 'aria-hidden': 'true' });
}
