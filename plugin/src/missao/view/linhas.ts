/**
 * As linhas da Missão: a linha aberta (as duas asas, o centro e o lugar) e a linha
 * fechada (as marcas, o rótulo, a nota de começo e a faixa do lugar).
 *
 * Por quê: o protótipo aprovado (template, 1169–1260), com as colunas vindas do ramo
 * (§3.8): cada célula mora na coluna que o plano da grade dá a ela, na tela larga e no
 * celular, e o que vai dentro sai da fonte que o ramo declara. Nenhuma coluna é fixa aqui.
 *
 * Só desenha: a linha e o plano entram, o elemento sai (as ligações são desenhadas
 * depois do layout, por `ligacoes.ts`).
 */
import type { Passagem, Faixa, LinhaAberta, LinhaFechada, MissaoNo, TrechoDeLugar } from '../tipos';
import { nosDaFonte, type ColunaNoPlano, type PlanoDaGrade, type VazioDaColuna } from '../ramoPrincipal';
import { datasDaPassagem, ordemDosPaises } from '../lugares';
import { marcaDePessoas } from '../formatos';
import { fold } from '../../project/projectCanvasModel';
import { linhaAceitaSoltar } from '../intencoes';
import { idDoPeriodo, periodoDoId } from '../tempo';
import { el, botao, svg } from './dom';
import { FRASES } from '../frases';
import { cicloEl, marcaEl, noEl, periodoEl } from './nos';
import { alternarEl, ferramentasDoNo, maisDoContexto } from './interacao';
import { acolhidaEl, gestoEl } from './trilha';
import { mostraAcolhida } from '../trilha';
import type { Contexto } from './contrato';

const ehFaixa = (x: unknown): x is Faixa => !!x && typeof x === 'object' && Array.isArray((x as Faixa).nos);

/** A linha recebe a tarefa solta (P6): só onde a Missão grava, no dia e na semana, e não em "antes", "depois" nem "Algum dia". */
function aceitaSoltar(ctx: Contexto, chave: string): boolean {
    return !!ctx.arrastar && linhaAceitaSoltar(ctx.escala) && chave !== 'antes' && chave !== 'depois' && chave !== 'algum-dia';
}

function celula(ctx: Contexto, c: ColunaNoPlano, extra = ''): HTMLElement {
    const cls = c.papel === 'lugar' ? 'c-place' : c.papel === 'centro' ? 'c-center' : c.papel === 'trabalho' ? 'c-trabalho' : 'c-tempo';
    const e = el(ctx.doc, 'div', `cell ${cls}${c.junto ? ' c-junto' : ''}${extra}`, { 'data-col': c.id });
    e.style.setProperty('--cl', String(c.largo));
    e.style.setProperty('--cc', String(c.celular));
    return e;
}

/* ------------------------------------------------------------ o lugar */

/** A cor do país: a ordem em que aparece na viagem (§9.4). */
function classeDoLugar(passagens: Map<string, Passagem>, paises: string[], id: string | null): string {
    if (!id) return 'pl-unk';
    const e = passagens.get(id);
    if (!e?.pais) return 'pl-x';
    const i = paises.findIndex(p => fold(p) === fold(e.pais!));
    return i < 0 ? 'pl-x' : `pl-${i % 4}`;
}

function faixaDoLugar(ctx: Contexto, trechos: readonly TrechoDeLugar[]): HTMLElement {
    const doc = ctx.doc;
    const passagens = new Map(ctx.modelo.passagens.map(e => [e.id, e]));
    const paises = ordemDosPaises(ctx.modelo.passagens);
    const band = el(doc, 'span', 'band', { 'aria-hidden': 'true' });
    if (!trechos.length) band.appendChild(el(doc, 'i', 'pl-none'));
    for (const t of trechos) {
        const i = el(doc, 'i', classeDoLugar(passagens, paises, t.passagem));
        i.style.flex = String(t.dias);
        band.appendChild(i);
    }
    return band;
}

/**
 * O que faz: o rótulo do lugar na coluna LUGAR: o país, que é um alvo próprio (leva ao painel do
 * país), e a passagem (a cidade e as datas), que leva ao painel dela.
 * Por quê: o diagnóstico do painel do nó (29/10, C4): o país era um texto dentro do botão da
 * passagem, e todo clique nele abria a passagem (o país nem era clicável).
 * Entra → sai: o contexto, a passagem e as do período → o rótulo (`.place-w`).
 */
function rotuloDoLugar(ctx: Contexto, passagem: Passagem, varias: Passagem[]): HTMLElement {
    const doc = ctx.doc;
    const cidade = varias.length > 1 ? varias.map(e => e.cidade).join(' → ') : passagem.cidade;
    const nomes = [...new Set(varias.map(e => e.pais).filter((p): p is string => !!p))];
    const pais = nomes.join(' · ') || 'a definir';
    const datas = datasDaPassagem(passagem);
    const w = el(doc, 'div', 'place-w');
    // Um país só: o botão do painel dele; vários (a semana da travessia), o texto.
    const doPais = nomes.length === 1 ? ctx.modelo.lugarDoNo(passagem.id)?.pais ?? null : null;
    if (doPais?.id) {
        const c = botao(doc, 'ctry ctry-b', pais, { 'data-goto': doPais.id });
        ctx.marcar(c, `País: ${pais}, o painel dele`);
        w.appendChild(c);
    } else w.appendChild(el(doc, 'span', 'ctry', null, pais));
    const b = botao(doc, 'place', null, { 'data-node': passagem.id });
    b.append(el(doc, 'span', 'city', null, cidade), el(doc, 'span', 'dts', null, datas));
    // As pessoas da passagem (P9, §8.9): a marca discreta, com os nomes na dica.
    const pessoas = marcaDePessoas(ctx.modelo.pessoasDoLugar(passagem.id).map(p => p.nome));
    if (pessoas) b.appendChild(el(doc, 'span', 'dts', { title: pessoas.dica }, pessoas.marca));
    ctx.marcar(b, `Lugar: ${cidade}, ${pais} · ${datas}${pessoas ? ` · ${pessoas.dica}` : ''}`);
    w.appendChild(b);
    return w;
}

function celulaDoLugar(ctx: Contexto, c: ColunaNoPlano, trechos: readonly TrechoDeLugar[], mostrar: boolean, aberta = false, criarDe: string | null = null): HTMLElement {
    const cell = celula(ctx, c);
    cell.appendChild(faixaDoLugar(ctx, trechos));
    const ids = trechos.map(t => t.passagem).filter((x): x is string => !!x);
    const passagens = ids.map(id => ctx.modelo.passagens.find(e => e.id === id)).filter((e): e is Passagem => !!e);
    if (mostrar && passagens.length) {
        const col = el(ctx.doc, 'div', 'plcol');
        col.appendChild(rotuloDoLugar(ctx, passagens[passagens.length - 1], passagens));
        cell.appendChild(col);
    } else if (mostrar && aberta) {
        // A linha aberta sem passagem diz em palavras (ausência não é zero).
        cell.appendChild(el(ctx.doc, 'div', 'plcol', null)).appendChild(el(ctx.doc, 'span', 'place-none', null, FRASES.semLugar));
    }
    const mais = criarDe ? maisDoContexto(ctx, criarDe) : null;
    if (mais) { mais.classList.add('place-add'); cell.appendChild(mais); }
    return cell;
}

/* ------------------------------------------------------------ a linha aberta */

/** A expansão do mapa numa linha: o controle de cada nó com filho e os nós que o recolher esconde. */
type ExpansaoDaLinha = ReturnType<NonNullable<Contexto['expansaoDaLinha']>>;

/**
 * O que faz: o cartão de um nó no mapa principal (o cartão único, `noEl`) e, quando ele contém algo na
 * linha, o expandir e o recolher pelo controle único (`alternarEl`, o mesmo do ramo do zoom, 02/11),
 * num invólucro que diz o estado (`data-filhos`, o que a tecla lê).
 * Entra → sai: o contexto, o nó, as opções do cartão e a expansão da linha → o elemento.
 */
function cartaoNoMapa(ctx: Contexto, no: MissaoNo, o: Parameters<typeof noEl>[2], ex: ExpansaoDaLinha | null): HTMLElement {
    const cartao = noEl(ctx, no, o);
    const f = ex && no.id ? ex.filhos[no.id] : undefined;
    if (!f) return cartao;
    const w = el(ctx.doc, 'div', 'n-mapa', { 'data-filhos': f });
    w.append(cartao, alternarEl(ctx, no.id, no.titulo, f === 'aberto'));
    return w;
}

function faixas(ctx: Contexto, lista: Faixa[], pendente: boolean, compacto: boolean, ex: ExpansaoDaLinha | null = null): HTMLElement[] {
    const out: HTMLElement[] = [];
    for (const f of lista) {
        const nos = ex ? f.nos.filter(n => !ex.escondidos.has(n.id)) : f.nos;
        if (!nos.length) continue;
        const lane = el(ctx.doc, 'div', 'lane', { 'data-faixa': f.projeto ?? '' });
        for (const no of nos) lane.appendChild(cartaoNoMapa(ctx, no, { compacto, pendente, minis: true }, ex));
        out.push(lane);
    }
    return out;
}

/**
 * O que faz: a linha aberta: o lugar, a asa do trabalho, o centro (com ▲▼ e os hábitos do
 * dia, quando é o foco), a asa do tempo; e o SVG das ligações por baixo.
 * Por quê: "a linha em foco centrada e aberta" (protótipo); as outras abertas (Abrir
 * tudo) são compactas, com nós menores.
 */
export function linhaAbertaEl(ctx: Contexto, linha: LinhaAberta, plano: PlanoDaGrade, foco: boolean): HTMLElement {
    const doc = ctx.doc;
    const row = el(doc, 'div', `grid row open${foco ? ' focus' : ''}${linha.hoje ? ' today' : ''}`, { 'data-row': linha.chave, 'data-drop': aceitaSoltar(ctx, linha.chave) ? 'row' : null });
    row.appendChild(svg(doc, 'svg', { class: 'edges', 'aria-hidden': 'true' }));
    const cmp = !foco;
    const fonte = linha as unknown as Record<string, unknown>;
    // O nó do centro não se repete numa coluna (30/10, o ramo de Projetos: o projeto no centro e a
    // coluna das centrais e dos auxiliares leem a mesma lista; o centro é o primeiro dela).
    const doCentro = nosDaFonte<MissaoNo>(fonte, ctx.ramoPrincipal.centro.fonte, ctx.ramoPrincipal.centro.tipo)[0]?.id ?? null;
    // O expandir e o recolher do mapa (02/11): o mesmo estado da vista do ramo; o centro nunca some.
    const ex = ctx.expansaoDaLinha?.(linha.ligacoes ?? [], doCentro) ?? null;
    const visivel = (n: MissaoNo | Faixa) => !ex || ehFaixa(n) || !ex.escondidos.has((n as MissaoNo)?.id);
    for (const c of plano.colunas) {
        if (c.papel === 'lugar') {
            // O lugar da linha em foco também cria a partir da passagem dela (o ramo diz o quê: a cidade, o país).
            const passagem = foco && !linha.especial ? linha.lugar.passagens[linha.lugar.passagens.length - 1]?.id ?? null : null;
            row.appendChild(celulaDoLugar(ctx, c, linha.lugar.trechos, !linha.especial, true, passagem));
            continue;
        }
        if (c.papel === 'centro') { row.appendChild(centro(ctx, c, linha, foco, ex)); continue; }
        const col = c.coluna!;
        const itens = nosDaFonte<MissaoNo | Faixa>(fonte, col.fonte, col.tipo).filter(n => !doCentro || ehFaixa(n) || (n as MissaoNo)?.id !== doCentro).filter(visivel);
        const lanes = col.faixas || itens.some(ehFaixa);
        const cell = celula(ctx, c, lanes ? ' c-faixas' : '');
        if (lanes) {
            const own = itens.filter(ehFaixa);
            const pend = col.pendentes ? nosDaFonte<Faixa>(fonte, col.pendentes).filter(ehFaixa) : [];
            // As de hora marcada primeiro, na ordem do horário (§8.4; a fonte é do ramo), e só ali: cada
            // tarefa aparece uma vez, pelo cartão de sempre, com a hora no selo dele (02/11).
            const horas = col.horarios ? nosDaFonte<MissaoNo>(fonte, col.horarios).filter(n => n && n.hora).filter(visivel) : [];
            if (horas.length) cell.appendChild(comHora(ctx, horas, cmp, ex));
            const lanesProprias = faixas(ctx, semAsDeHora(own, horas), false, cmp, ex);
            if (lanesProprias.length) for (const lane of lanesProprias) cell.appendChild(lane);
            // A faixa que o recolher escondeu não é "sem tarefas": o vazio só quando a linha não tem nenhuma.
            else if (!own.length) cell.appendChild(el(doc, 'span', 'empty', null, linha.smarts.length ? FRASES.semAcoesNoPeriodo : FRASES.semTarefas));
            if (pend.length) {
                cell.appendChild(el(doc, 'span', 'sub-lbl', null, 'Pendentes de antes'));
                for (const lane of faixas(ctx, pend, true, cmp, ex)) cell.appendChild(lane);
            }
            // O "+" da linha em foco (P8, e a interação de 30/10): o que se cria no período da linha, pelo mesmo Novo do "+ <Tipo>" do cartão.
            const mais = foco && !linha.especial ? maisDoContexto(ctx, idDoPeriodo(ctx.escala, linha.chave)) : null;
            if (mais) cell.appendChild(mais);
        } else {
            const pendIds = new Set(linha.pendentes.flatMap(f => f.nos.map(n => n.id)));
            for (const no of itens as MissaoNo[]) cell.appendChild(cartaoNoMapa(ctx, no, { compacto: cmp, pendente: no.estado === 'pendente' || pendIds.has(no.id), minis: true }, ex));
            // A coluna sem nó diz o vazio do ramo e, na linha em foco, os protocolos que criam o que falta (P10b).
            if (!itens.length && col.vazio && !linha.especial) vazioDaColuna(ctx, cell, col.vazio, linha.chave, foco);
        }
        row.appendChild(cell);
    }
    return row;
}

/**
 * O que faz: o vazio de uma coluna: a frase do ramo e, na linha em foco e onde a Missão grava,
 * um botão por protocolo que já existe e criaria o que falta (com o nome que o JSON dele diz) e um
 * "+ <Tipo>" por tipo do Novo que o vazio declara (05/11: o "+ Estadia", o "+ Canal"), pelo mesmo Novo
 * do ramo, aberto no período da linha.
 */
function vazioDaColuna(ctx: Contexto, cell: HTMLElement, vazio: VazioDaColuna, chave: string, foco: boolean): void {
    cell.appendChild(el(ctx.doc, 'span', 'empty', null, vazio.texto));
    if (!foco) return;
    if (ctx.rodaProtocolo) for (const id of vazio.protocolos) {
        const nome = ctx.nomeDoProtocolo?.(id) || id;
        const b = botao(ctx.doc, 'row-add', nome, { 'data-act': 'protocolo-da-coluna', 'data-protocolo': id, 'data-escala': ctx.escala, 'data-chave': chave });
        ctx.marcar(b, `${nome}: o protocolo, passo a passo, com a data desta linha`);
        cell.appendChild(b);
    }
    // O Novo só onde a Missão cria (o `novos` do contexto existe só aí), e só o tipo que o seletor do ramo tem.
    const periodo = ctx.novos ? idDoPeriodo(ctx.escala, chave) : null;
    for (const tipo of periodo ? vazio.novos : []) {
        const doSeletor = ctx.ramoPrincipal.novo.tipos.find(t => t.tipo === tipo);
        if (!doSeletor) continue;
        const b = botao(ctx.doc, 'row-add', `+ ${doSeletor.rotulo}`, { 'data-act': 'novo', 'data-tipo': tipo, 'data-id': periodo });
        ctx.marcar(b, `${doSeletor.titulo}: o Novo do ramo, nesta linha`);
        cell.appendChild(b);
    }
}

/**
 * O que faz: as tarefas de hora marcada no topo da coluna das tarefas, na ordem do horário: os cartões
 * de sempre (`noEl`, com a hora no selo do próprio cartão), num grupo sem faixa nem rótulo à vista.
 * Por quê: 02/11, a faixa "Com hora" desenhava a sua linha (a hora num selo e o título) e a mesma
 * tarefa voltava logo abaixo como cartão: duas caras para a mesma tarefa. Ele: "não precisar repetir o
 * que tem data e hora e só marcar na própria tarefa ali". O cartão é um só em toda tela; aqui só a ordem.
 * Entra → sai: o contexto, as tarefas com hora (já na ordem), se a linha é compacta e a expansão → o grupo.
 */
function comHora(ctx: Contexto, horas: readonly MissaoNo[], compacto: boolean, ex: ExpansaoDaLinha | null): HTMLElement {
    const box = el(ctx.doc, 'div', 'lane horas', { role: 'group', 'aria-label': 'Com hora' });
    for (const n of horas) box.appendChild(cartaoNoMapa(ctx, n, { compacto, minis: true }, ex));
    return box;
}

/** O que faz: as faixas sem as tarefas que já estão no grupo "Com hora" (a faixa que fica vazia sai). */
function semAsDeHora(lista: readonly Faixa[], horas: readonly MissaoNo[]): Faixa[] {
    if (!horas.length) return [...lista];
    const ids = new Set(horas.map(n => n.id));
    return lista.map(f => ({ ...f, nos: f.nos.filter(n => !ids.has(n.id)) })).filter(f => f.nos.length > 0);
}

/** O que faz: a chegada num lugar, na linha fechada (o protótipo, template 1257): "📍 Sapa" no dia em que a passagem começa; nas outras escalas, "→ <última cidade>" quando o período tem mais de uma. */
function chegadaDaLinha(ctx: Contexto, f: LinhaFechada): string {
    if (f.especial) return '';
    const est = f.lugar.map(t => t.passagem).filter((x): x is string => !!x).map(id => ctx.modelo.passagens.find(e => e.id === id)).filter((e): e is Passagem => !!e);
    if (!est.length) return '';
    if (ctx.escala === 'dia') { const e = est.find(x => x.de === f.chave); return e ? `📍 ${e.cidade}` : ''; }
    const ids = [...new Set(est.map(e => e.id))];
    return ids.length > 1 ? `→ ${est[est.length - 1].cidade}` : '';
}

function centro(ctx: Contexto, c: ColunaNoPlano, linha: LinhaAberta, foco: boolean, ex: ExpansaoDaLinha | null = null): HTMLElement {
    const doc = ctx.doc;
    const cell = celula(ctx, c);
    const fonte = linha as unknown as Record<string, unknown>;
    const doCentro = nosDaFonte<MissaoNo>(fonte, ctx.ramoPrincipal.centro.fonte, ctx.ramoPrincipal.centro.tipo)[0];
    // Sem nó da fonte, o vazio do ramo (P10b: "sem lugar marcado"), ainda no período; sem vazio, o período.
    const vazio = !doCentro && ctx.ramoPrincipal.centro.vazio && !linha.especial ? ctx.ramoPrincipal.centro.vazio : null;
    const no = doCentro ?? (vazio ? { ...linha.centro, titulo: vazio, sub: linha.centro.titulo, linha: '', marcas: [], contagens: undefined } : linha.centro);
    // A trilha de uso (05/11): a Day de hoje vazia depois da hora da tarde recebe com "o que você fez hoje?",
    // no lugar do ▶️ da manhã (que segue no painel do dia).
    const acolhida = foco && !linha.especial && ctx.escala === 'dia' && ctx.gravar ? ctx.modelo.trilha?.acolhida(linha.chave) ?? null : null;
    const recebe = mostraAcolhida(acolhida, ctx.relogio?.().hora);
    if (foco && !linha.especial) {
        const top = el(doc, 'div', 'center-top');
        const step = el(doc, 'div', 'stepper');
        const unidade = ctx.escala === 'dia' ? 'dia' : ctx.escala === 'semana' ? 'semana' : ctx.escala === 'trimestre' ? 'trimestre' : 'ano';
        const up = botao(doc, null, '▲', { 'data-act': 'step', 'data-d': '-1' });
        ctx.marcar(up, `Subir: ${unidade} seguinte (o futuro fica em cima)`, '↑');
        const down = botao(doc, null, '▼', { 'data-act': 'step', 'data-d': '1' });
        ctx.marcar(down, `Descer: ${unidade} anterior (o passado fica embaixo)`, '↓');
        step.append(up, down);
        top.appendChild(step);
        const inicio = recebe ? null : cicloEl(ctx, ctx.escala, linha.chave, 'inicio');
        if (inicio) top.appendChild(inicio);
        cell.appendChild(top);
    }
    const pend = linha.pendentes.reduce((n, f) => n + f.nos.length, 0);
    if (doCentro && !periodoDoId(doCentro.id) && !linha.especial) {
        // O nó que o ramo põe no centro (o projeto, a passagem) é o cartão dele, o mesmo do mapa, do
        // ramo e do painel (30/10: o mesmo tipo de nó, o cartão único); o período da linha fica na
        // coluna do tempo do ramo. Um período no centro é o período aberto, abaixo.
        cell.appendChild(cartaoNoMapa(ctx, doCentro, { minis: true }, ex));
    } else {
        // O período da linha no centro: o período aberto (o centro da Missão padrão, e o vazio do ramo).
        const p = periodoEl(ctx, no, { hoje: linha.hoje, especial: linha.especial, pendentes: pend });
        if (linha.dinheiro && !linha.especial) p.appendChild(el(doc, 'span', 'cap', null, linha.dinheiro));
        // O período com nota ou canvas: Nota · Canvas à mão (`.wrapn.wc`, template 1139).
        // Na linha em foco, o "+ <Tipo>" do período mora no pé da linha (abaixo): o cartão não o repete.
        const minis = linha.especial ? null : ferramentasDoNo(ctx, no, foco);
        if (minis) { const w = el(doc, 'div', 'wrapn wc'); w.append(p, minis); cell.appendChild(w); }
        else cell.appendChild(p);
    }
    // G6: no cartão da passagem (o centro de um ramo de lugar), o país é um alvo próprio.
    const doCartao = doCentro && !linha.especial ? ctx.modelo.lugarDoNo(doCentro.id) : null;
    if (doCartao?.passagem && doCartao.pais?.id) {
        const c = botao(doc, 'ctry-go', doCartao.pais.nome, { 'data-goto': doCartao.pais.id });
        ctx.marcar(c, `País: ${doCartao.pais.nome}, o painel dele`);
        cell.appendChild(c);
    }
    const fim = foco && !linha.especial ? cicloEl(ctx, ctx.escala, linha.chave, 'fim') : null;
    if (recebe && acolhida) cell.appendChild(acolhidaEl(ctx, linha.chave, acolhida, fim));
    else if (fim) cell.appendChild(fim);
    // Os hábitos do dia, onde o ramo os mostra (P10c: a Viagem não mostra; sem a chave, mostra).
    if (foco && linha.habitos.length && ctx.ramoPrincipal.centro.habitos !== false) {
        const hab = el(doc, 'div', 'habits', { role: 'group', 'aria-label': 'Hábitos do dia' });
        const quando = linha.hoje ? 'hoje' : 'neste dia';
        for (const h of linha.habitos) {
            const icon = (h.titulo.match(/^[^\p{L}\p{N}]+/u)?.[0] ?? '').trim() || '•';
            const nome = h.titulo.replace(/^[^\p{L}\p{N}]+/u, '').trim() || h.titulo;
            const estado = h.vezes ? (h.vezes > 1 ? `${h.vezes} marcas ${quando}` : `feito ${quando}`) : `nenhuma marca ${quando}`;
            // Onde a Missão grava, o hábito é o botão +1 (o protótipo, template 2256–2263); no celular,
            // só se lê, e não é uma parada vazia do Tab.
            const item = ctx.gravar
                ? botao(doc, `hab hab-b${h.vezes ? ' on' : ''}`, null, { 'data-act': 'habito', 'data-habito': h.caminho, 'data-dia': linha.chave })
                : el(doc, 'span', `hab${h.vezes ? ' on' : ''}`, { role: 'img', 'data-habito': h.caminho });
            item.append(icon);
            item.appendChild(el(doc, 'span', 'hab-n', null, nome));
            if (h.vezes) item.appendChild(el(doc, 'span', 'num', null, String(h.vezes)));
            ctx.marcar(item, `Hábito: ${nome} (${estado})${ctx.gravar ? (h.vezes ? '' : ' · toque marca +1') : ''}`);
            hab.appendChild(item);
        }
        cell.appendChild(hab);
    }
    // O gesto da semana (05/11): o cartão da trilha no centro da linha de agora.
    const gesto = foco && linha.hoje && !linha.especial ? ctx.modelo.trilha?.gesto ?? null : null;
    if (gesto) cell.appendChild(gestoEl(ctx, gesto));
    return cell;
}

/* ------------------------------------------------------------ a linha fechada */

/**
 * O que faz: a linha fechada: o lugar (com a cidade no dia da chegada), as marcas na
 * coluna que o ramo diz, o rótulo no centro (com "hoje"/"agora") e a nota de começo.
 */
export function linhaFechadaEl(ctx: Contexto, f: LinhaFechada, plano: PlanoDaGrade): HTMLElement {
    const doc = ctx.doc;
    const mon = ctx.escala === 'dia' && !!f.nota;
    const row = el(doc, 'div', `grid row compact${f.hoje ? ' today' : ''}${mon ? ' mon' : ''}`, { 'data-row': f.chave, 'data-act': 'focus-row', 'data-drop': aceitaSoltar(ctx, f.chave) ? 'row' : null });
    const colMarcas = plano.colunas.find(c => c.coluna?.marcas) ?? [...plano.colunas].reverse().find(c => c.papel === 'trabalho');
    const colNota = plano.colunas.find(c => c.coluna?.nota) ?? plano.colunas.find(c => c.papel === 'tempo');
    for (const c of plano.colunas) {
        if (c.papel === 'lugar') {
            const chegada = ctx.escala !== 'dia' || f.lugar.some(t => t.passagem && ctx.modelo.passagens.find(e => e.id === t.passagem)?.de === f.chave);
            row.appendChild(celulaDoLugar(ctx, c, f.lugar, chegada));
            continue;
        }
        if (c.papel === 'centro') {
            const cell = celula(ctx, c);
            const wrap = el(doc, 'span', 'lbl-wrap');
            wrap.appendChild(el(doc, 'span', 'spine-dot'));
            const lbl = el(doc, 'span', `lbl${f.especial ? ' special' : ''}`);
            if (ctx.escala === 'dia' && !f.especial) {
                const [wd, ...rest] = f.rotulo.split(' ');
                lbl.append(el(doc, 'span', 'wd', null, wd), el(doc, 'span', null, null, rest.join(' ')));
                if (f.hoje) lbl.appendChild(el(doc, 'span', 'tag-hoje', null, 'hoje'));
            } else {
                lbl.append(f.rotulo);
                if (f.hoje) lbl.appendChild(el(doc, 'span', 'tag-hoje', null, 'agora'));
            }
            wrap.appendChild(lbl);
            // A marca da chegada, para o celular (`.pchg`, só aparece lá).
            const chegada = chegadaDaLinha(ctx, f);
            if (chegada) wrap.appendChild(el(doc, 'span', 'pchg', null, chegada));
            cell.appendChild(wrap);
            row.appendChild(cell);
            continue;
        }
        if (c === colMarcas) {
            const cell = celula(ctx, c, ' chips');
            for (const m of f.marcas) cell.appendChild(marcaEl(ctx, m));
            if (f.mais) cell.appendChild(el(doc, 'span', 'gtx', null, `+${f.mais}`));
            cell.appendChild(el(doc, 'span', 'gtx', null, f.linha));
            row.appendChild(cell);
            continue;
        }
        const cell = celula(ctx, c);
        if (c === colNota && f.nota) {
            const [a, ...b] = f.nota.split(' ');
            const mark = el(doc, 'span', 'mark');
            mark.appendChild(el(doc, 'b', null, null, a));
            if (b.length) mark.append(` ${b.join(' ')}`);
            cell.appendChild(mark);
        }
        row.appendChild(cell);
    }
    return row;
}
