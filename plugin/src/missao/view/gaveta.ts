/**
 * A gaveta dos protocolos do ciclo na tela (P12b): a cabeça (o modo, o período, o nome do
 * protocolo), o plano do período, os campos do formulário com o valor e o porquê, o que já está
 * registrado, o que o protocolo pergunta no fim, a parte recolhida do 📅 e as ações.
 *
 * Por quê: o protótipo aprovado (template, 2209–2330, `planHtml`, `planField`, `planContext`): a
 * gaveta larga, com o plano do período ao lado da linha do tempo (a linha, as SMART "de até 3",
 * as tarefas e "Arraste uma tarefa da linha do tempo para a linha da W44"), os campos `.pf` com
 * o "por quê" e os botões Gravar · Abrir no protocolo; a arquitetura (§5.5, §5.6, §9.3).
 *
 * Só desenha: os gestos saem como `data-act` (`gv-gravar`, `gv-completo`, `gv-rascunho`,
 * `gv-cancelar`, `gv-fechar`, `gv-resto`) e as caixas como `data-gv` (o id do passo), que o
 * componente lê. Nenhum nome de protocolo nem de passo mora aqui: tudo sai do JSON do protocolo
 * (`ProtocoloDaGaveta`), do ramo e das frases (`GAVETA`). As tarefas do plano são os nós da
 * Missão (`noEl`), não uma segunda linha do tempo.
 */
import type { CampoNaGaveta, CriacoesPedidas, TituloNaGaveta, VistaDaGaveta } from '../gaveta';
import { primeiraFrase, respondidosPeloNo, rotuloDoPasso, resumoDoResto } from '../gaveta';
import type { Escala } from '../tempo';
import { diaDaSemana, diaMes, idDoPeriodo, semanaCurta } from '../tempo';
import { FRASES, GAVETA, SMART_DA_SEMANA_ATE } from '../frases';
import { el, botao } from './dom';
import { noEl, tracos } from './nos';
import type { Contexto } from './contrato';

/** O que a gaveta desenha. */
export interface FormDaGaveta {
    /** "Planejar" ou "Revisar". */
    modo: string;
    escala: Escala;
    chave: string;
    /** O nome e a descrição do protocolo (o JSON dele); `null` enquanto o motor lê. */
    nome: string | null;
    descricao: string;
    vista: VistaDaGaveta | null;
    /** Os passos do protocolo, para o rótulo do que já está registrado e do que fica para o fim. */
    passos: readonly any[];
    problemas: Record<string, string>;
    /** Há líderes (o 📅): o resto vem recolhido. */
    comDestaque: boolean;
    restoAberto: boolean;
    criar: CriacoesPedidas;
    /** Os contextos do catálogo (o "Onde dá para fazer?" da nota criada no passo). */
    contextos: readonly string[];
    /** O motor não deu o protocolo: o aviso no lugar do formulário. */
    falhou: boolean;
    /**
     * A gaveta abriu pelo protocolo de um nó (a seção Protocolos do painel), e não pelo botão do ciclo do período: o
     * plano do período fica de fora (a percorrida de 06/11: o 📹 de uma peça mostrava "No plano de sex 06/11 · sem
     * tarefas · + Nova tarefa" no meio do registro, sem relação com ele).
     */
    doNo?: boolean;
}

const idDoCampo = (id: string) => `gv-${id.replace(/[^\w-]/g, '_')}`;
const listaDoValor = (v: unknown): string[] => {
    const s = Array.isArray(v) ? v.map(String).join(', ') : String(v ?? '');
    if (!s.trim() || s.trim() === 'Nenhum') return [];
    // As notas do critério vêm como "[[A]], [[B]]"; as opções, como "A, B".
    const links = [...s.matchAll(/\[\[[^\[\]]+\]\]/g)].map(m => m[0]);
    return links.length ? links : s.split(',').map(x => x.trim()).filter(Boolean);
};
const semColchetes = (s: string) => s.replace(/^\[\[|\]\]$/g, '');

/** O que faz: o período em palavras curtas ("W44", "qua 28/10", "2026-Q4"). */
export function periodoEmPalavras(escala: Escala, chave: string): string {
    if (escala === 'dia') return `${diaDaSemana(chave)} ${diaMes(chave)}`;
    if (escala === 'semana') return semanaCurta(chave);
    return chave;
}

/**
 * O que faz: um campo do formulário na gaveta: o rótulo (a pergunta do passo, com * no
 * obrigatório e "opcional"), a caixa pelo tipo do campo, o porquê do valor sugerido e o problema.
 * Entra → sai: o contexto, o campo, o problema e o pedido de criar (a nota do passo) → o `.pf`.
 */
export function campoDaGavetaEl(ctx: Contexto, c: CampoNaGaveta, problema: string | undefined, criar: { contextos: string[] } | null, contextos: readonly string[]): HTMLElement {
    const doc = ctx.doc;
    const { campo } = c;
    const id = idDoCampo(campo.id);
    const pf = el(doc, 'div', 'pf', { 'data-campo-gv': campo.id });
    const rotulo = rotuloDoPasso(campo.passo);
    const grupo = campo.tipo === 'escolhas' || campo.tipo === 'notas';
    const lab = grupo ? el(doc, 'span', 'pq', { id: `${id}-q` }) : el(doc, 'label', null, { for: id });
    lab.append(rotulo);
    if (campo.obrigatorio) lab.appendChild(el(doc, 'span', 'req', { 'aria-hidden': 'true' }, '*'));
    if (campo.passo?.optional === true && !campo.obrigatorio) lab.appendChild(el(doc, 'span', 'opt', null, GAVETA.opcional));
    pf.appendChild(lab);
    // O texto de apoio do passo (o `info`; na Herança do trimestre, o que veio do anterior), em cima da caixa.
    if (c.info) pf.appendChild(el(doc, 'p', 'hint gv-info', { 'data-info': campo.id }, c.info));
    const attrs: Record<string, string> = { 'data-gv': campo.id };
    if (campo.obrigatorio) attrs['aria-required'] = 'true';
    if (problema) attrs['aria-invalid'] = 'true';
    const valor = c.valor;
    if (grupo) {
        const marcadas = listaDoValor(valor);
        const opcoes = [...new Set([...(c.opcoes ?? (Array.isArray(campo.passo?.options) ? campo.passo.options.map(String) : [])), ...marcadas])];
        if (!opcoes.length) pf.appendChild(el(doc, 'span', 'hint', null, FRASES.semDado));
        else {
            const box = el(doc, 'div', 'ctxs', { role: 'group', 'aria-labelledby': `${id}-q`, ...(problema ? { 'aria-invalid': 'true' } : {}) });
            for (const o of opcoes) {
                const l = el(doc, 'label', 'ctx');
                const i = el(doc, 'input', null, { type: 'checkbox', value: o, 'data-gv': campo.id, 'data-gv-lista': '' });
                (i as HTMLInputElement).value = o;
                (i as HTMLInputElement).checked = marcadas.includes(o);
                if ((i as HTMLInputElement).checked) i.setAttribute('checked', '');
                l.append(i, el(doc, 'span', null, null, campo.tipo === 'notas' ? semColchetes(o) : o));
                box.appendChild(l);
            }
            pf.appendChild(box);
        }
    } else if (campo.tipo === 'escolha') {
        const opcoes = c.opcoes ?? (Array.isArray(campo.passo?.options) ? campo.passo.options.map(String) : []);
        const sel = el(doc, 'select', null, { ...attrs, id });
        sel.appendChild(el(doc, 'option', null, { value: '' }, GAVETA.nenhuma));
        const atual = valor === undefined || valor === null ? '' : String(valor);
        for (const o of atual && !opcoes.includes(atual) ? [...opcoes, atual] : opcoes) {
            const op = el(doc, 'option', null, { value: o }, o);
            if (o === atual) op.setAttribute('selected', '');
            sel.appendChild(op);
        }
        (sel as HTMLSelectElement).value = atual;
        pf.appendChild(sel);
    } else if (campo.tipo === 'texto_longo') {
        const t = el(doc, 'textarea', null, { ...attrs, id, rows: '3', ...(campo.passo?.placeholder ? { placeholder: String(campo.passo.placeholder) } : {}) });
        const atual = valor === undefined || valor === null ? '' : String(valor);
        (t as HTMLTextAreaElement).value = atual;
        t.textContent = atual;
        pf.appendChild(t);
    } else {
        const atual = valor === undefined || valor === null ? '' : String(valor);
        const i = el(doc, 'input', null, { ...attrs, id, type: 'text', autocomplete: 'off', value: atual, ...(campo.passo?.placeholder ? { placeholder: String(campo.passo.placeholder) } : {}) });
        (i as HTMLInputElement).value = atual;
        if (campo.tipo === 'nota' && c.notas?.length) {
            const lista = el(doc, 'datalist', null, { id: `${id}-notas` });
            for (const n of c.notas) lista.appendChild(el(doc, 'option', null, { value: n.nome }));
            i.setAttribute('list', `${id}-notas`);
            pf.append(i, lista);
        } else pf.appendChild(i);
        // O passo que cria a nota (o "➕ Criar" do seletor): o nome que nenhuma candidata tem pode nascer ao gravar.
        if (campo.tipo === 'nota' && campo.passo?.allowCreate === true && atual.trim() && !(c.notas ?? []).some(n => n.nome === atual.trim())) {
            const l = el(doc, 'label', 'ctx gv-criar');
            const marca = el(doc, 'input', null, { type: 'checkbox', 'data-gv-criar': campo.id });
            (marca as HTMLInputElement).checked = !!criar;
            if (criar) marca.setAttribute('checked', '');
            l.append(marca, el(doc, 'span', null, null, GAVETA.criar(atual.trim())));
            pf.appendChild(l);
            if (criar && contextos.length) {
                pf.appendChild(el(doc, 'span', 'pq', { id: `${id}-onde` }, GAVETA.criarOnde));
                const box = el(doc, 'div', 'ctxs', { role: 'group', 'aria-labelledby': `${id}-onde` });
                for (const o of contextos) {
                    const lc = el(doc, 'label', 'ctx');
                    const ic = el(doc, 'input', null, { type: 'checkbox', value: o, 'data-gv-onde': campo.id });
                    (ic as HTMLInputElement).value = o;
                    (ic as HTMLInputElement).checked = criar.contextos.includes(o);
                    if ((ic as HTMLInputElement).checked) ic.setAttribute('checked', '');
                    lc.append(ic, el(doc, 'span', null, null, o));
                    box.appendChild(lc);
                }
                pf.appendChild(box);
            }
        }
    }
    if (c.sugerido && (c.origem || campo.tipo === 'notas')) {
        const w = el(doc, 'span', 'pwhy', { 'data-porque': campo.id });
        w.appendChild(el(doc, 'b', null, null, GAVETA.sugerido));
        w.append(` ${c.origem || GAVETA.todasMarcadas}`);
        pf.appendChild(w);
    }
    if (problema) pf.appendChild(el(doc, 'p', 'f-err', { role: 'alert', 'data-problema': campo.id }, problema));
    return pf;
}

/** O que faz: o campo do título curto de uma tarefa (`askTitle`), com o porquê da sugestão. */
function tituloEl(ctx: Contexto, t: TituloNaGaveta): HTMLElement {
    const doc = ctx.doc;
    const id = idDoCampo(t.chave);
    const pf = el(doc, 'div', 'pf', { 'data-campo-gv': t.chave });
    const lab = el(doc, 'label', null, { for: id });
    lab.append(t.rotulo);
    pf.appendChild(lab);
    const i = el(doc, 'input', null, { 'data-gv': t.chave, id, type: 'text', autocomplete: 'off', value: t.valor });
    (i as HTMLInputElement).value = t.valor;
    pf.appendChild(i);
    if (t.sugerido && t.valor) {
        const w = el(doc, 'span', 'pwhy', { 'data-porque': t.chave });
        w.appendChild(el(doc, 'b', null, null, GAVETA.sugerido));
        w.append(` ${GAVETA.tituloSugerido}`);
        pf.appendChild(w);
    }
    return pf;
}

/**
 * O que faz: o plano do período ao lado da linha do tempo (o protótipo, `planContext`): a linha
 * pela forma de mostrar, as SMART da semana "de até 3" ou a carga do dia, as tarefas como os nós
 * da Missão, o que se cria a partir do período (o ramo) e o convite a arrastar; no trimestre, a
 * linha e os projetos.
 * Entra → sai: o contexto e o período → o `.planctx`, ou `null` (a escala sem plano).
 */
export function planoDoPeriodoEl(ctx: Contexto, escala: Escala, chave: string): HTMLElement | null {
    if (escala === 'ano') return null;
    const doc = ctx.doc;
    const linha = ctx.modelo.linha(escala, chave);
    const periodo = periodoEmPalavras(escala, chave);
    const box = el(doc, 'div', 'planctx', { 'data-plano': idDoPeriodo(escala, chave) });
    const sec = box.appendChild(el(doc, 'div', 'dsec'));
    sec.appendChild(el(doc, 'h3', null, null, escala === 'semana' ? GAVETA.noPlanoDa(periodo) : escala === 'dia' ? GAVETA.noPlanoDe(periodo) : GAVETA.noTrimestre(periodo)));
    const big = sec.appendChild(el(doc, 'p', 'big-line'));
    const t = tracos(doc, linha.centro.contagens, 16);
    if (t) big.append(t, ' ');
    big.append(linha.centro.linha || FRASES.semTarefas);
    if (escala === 'trimestre') {
        const chain = sec.appendChild(el(doc, 'div', 'list'));
        for (const p of linha.projetos.slice(0, 12)) chain.appendChild(noEl({ ...ctx, arrastar: false }, p, { compacto: true }));
        if (!linha.projetos.length) chain.appendChild(el(doc, 'span', 'empty', null, FRASES.semPlanejamento));
        return box;
    }
    if (escala === 'semana') {
        // A SMART de manutenção de rotina não conta nas até 3 (29/10, §3): a linha dela vem à parte.
        const manutencao = linha.smarts.filter(n => n.manutencao).length;
        sec.appendChild(el(doc, 'p', 'hint', null, GAVETA.smartsDaSemana(linha.smarts.length - manutencao, SMART_DA_SEMANA_ATE)));
        if (manutencao) sec.appendChild(el(doc, 'p', 'hint', null, GAVETA.manutencaoDaSemana(manutencao)));
    }
    else sec.appendChild(el(doc, 'p', 'hint', null, linha.centro.carga || FRASES.nadaAgendado));
    const lista = sec.appendChild(el(doc, 'div', 'list', { 'data-plano-lista': '' }));
    const nos = [...linha.smarts, ...linha.faixas.flatMap(f => f.nos)].slice(0, 12);
    for (const no of nos) lista.appendChild(noEl({ ...ctx, arrastar: false }, no, { compacto: true }));
    if (!nos.length) lista.appendChild(el(doc, 'span', 'empty', null, FRASES.semTarefas));
    const novos = ctx.novos?.(linha.centro.id) ?? [];
    if (novos.length) {
        const acts = sec.appendChild(el(doc, 'div', 'acts'));
        for (const n of novos) {
            const b = botao(doc, 'btn', `+ ${n.rotulo}`, { 'data-act': 'novo', 'data-tipo': n.tipo, 'data-id': linha.centro.id, ...(n.campo && n.valor ? { 'data-campo': n.campo, 'data-valor': n.valor } : {}) });
            ctx.marcar(b, `+ ${n.rotulo}: o Novo, já ligado a ${periodo}`);
            acts.appendChild(b);
        }
    }
    if (ctx.arrastar) sec.appendChild(el(doc, 'p', 'dropnote', null, GAVETA.arraste(escala === 'semana' ? `da ${periodo}` : `de ${periodo}`)));
    return box;
}

/** As perguntas de um protocolo dono no Novo (P12b): o título da parte, os campos e os títulos curtos deles. */
export interface PerguntasDoDono {
    titulo: string;
    campos: CampoNaGaveta[];
    titulos: VistaDaGaveta['titulos'];
    problemas: Record<string, string>;
    contextos: readonly string[];
}

/**
 * O que faz: a parte do Novo com as perguntas do protocolo dono que o modelo do tipo não tem,
 * pelos mesmos campos da gaveta (`data-gv`, com o valor de abertura e o porquê).
 * Entra → sai: o contexto e as perguntas → o elemento.
 */
export function perguntasDoDonoEl(ctx: Contexto, d: PerguntasDoDono): HTMLElement {
    const doc = ctx.doc;
    const sec = el(doc, 'div', 'dsec nv-dono', { 'data-dono': '' });
    sec.appendChild(el(doc, 'h3', null, null, d.titulo));
    const form = sec.appendChild(el(doc, 'div', 'pform'));
    for (const c of d.campos) {
        form.appendChild(campoDaGavetaEl(ctx, c, d.problemas[c.campo.id], null, d.contextos));
        const t = d.titulos[c.campo.id];
        if (t) form.appendChild(tituloEl(ctx, t));
    }
    return sec;
}

/** O que faz: uma lista curta de passos (o que já está registrado, o que fica para o fim), com a pergunta de cada um. */
function listaDePassos(ctx: Contexto, titulo: string, dica: string, itens: Array<{ id: string; nota?: string }>, passos: readonly any[], marca: string): HTMLElement {
    const doc = ctx.doc;
    const sec = el(doc, 'div', 'dsec gv-sec', { [marca]: '' });
    sec.appendChild(el(doc, 'h3', null, null, titulo));
    const ol = sec.appendChild(el(doc, 'ul', 'stepslist'));
    for (const it of itens) {
        const li = ol.appendChild(el(doc, 'li', null, { 'data-passo': it.id }, rotuloDoPasso(passos.find(s => s?.id === it.id) ?? { id: it.id })));
        if (it.nota) li.appendChild(el(doc, 'span', 'pre', null, it.nota));
    }
    sec.appendChild(el(doc, 'p', 'hint', null, dica));
    return sec;
}

/** O que faz: as ações da gaveta (Gravar, Abrir no protocolo e, no rodapé, Guardar rascunho e Cancelar). */
function acoes(ctx: Contexto, rodape: boolean, nome: string): HTMLElement {
    const doc = ctx.doc;
    const acts = el(doc, 'div', rodape ? 'facts' : 'acts');
    const b = (cls: string, txt: string, act: string, dica: string, tecla?: string) => {
        const x = botao(doc, cls, txt, { 'data-act': act });
        ctx.marcar(x, dica.replace(': ', `: ${nome} · `), tecla);
        acts.appendChild(x);
    };
    b('btn primary', GAVETA.gravar, 'gv-gravar', GAVETA.dicaGravar, '⌘Enter');
    b('btn', GAVETA.completo, 'gv-completo', GAVETA.dicaCompleto);
    if (rodape) {
        b('btn', GAVETA.rascunho, 'gv-rascunho', GAVETA.dicaRascunho);
        b('btn', GAVETA.cancelar, 'gv-cancelar', GAVETA.dicaCancelar);
        acts.appendChild(el(doc, 'span', 'hint', null, GAVETA.rodape));
    }
    return acts;
}

/**
 * O que faz: o conteúdo da gaveta: a cabeça, as ações de cima, o plano do período, o que já está
 * registrado, os campos (o topo e, no 📅, o resto recolhido com o resumo), o que o protocolo
 * pergunta no fim e as ações do rodapé.
 * Entra → sai: o contexto do desenho e o formulário → o elemento.
 */
export function conteudoDaGaveta(ctx: Contexto, f: FormDaGaveta): HTMLElement {
    const doc = ctx.doc;
    const nome = f.nome ?? '';
    const corpo = el(doc, 'div', 'dpanel gv', { 'data-gaveta': idDoPeriodo(f.escala, f.chave) });
    const dh = el(doc, 'div', 'dh');
    const txt = el(doc, 'div', 'dh-txt');
    txt.appendChild(el(doc, 'div', 'kind', null, `${f.modo} · ${periodoEmPalavras(f.escala, f.chave)}`));
    txt.appendChild(el(doc, 'h2', 'dr-title', null, nome || GAVETA.carregando));
    // A primeira frase da descrição à vista e o resto (o histórico) recolhido (a percorrida de 06/11).
    if (f.descricao) {
        const { primeira, resto } = primeiraFrase(f.descricao);
        txt.appendChild(el(doc, 'p', 'origem', null, primeira));
        if (resto) {
            const mais = el(doc, 'details', 'gv-mais');
            mais.appendChild(el(doc, 'summary', null, null, GAVETA.maisDaDescricao));
            mais.appendChild(el(doc, 'p', 'origem', null, resto));
            txt.appendChild(mais);
        }
    }
    dh.appendChild(txt);
    const x = botao(doc, 'x', '×', { 'data-act': 'gv-fechar' });
    ctx.marcar(x, GAVETA.fechar, 'Esc');
    dh.appendChild(x);
    corpo.appendChild(dh);
    const vista = f.vista;
    if (vista) corpo.appendChild(acoes(ctx, false, nome));
    const plano = f.doNo ? null : planoDoPeriodoEl(ctx, f.escala, f.chave);
    if (plano) corpo.appendChild(plano);
    if (!vista) {
        corpo.appendChild(el(doc, 'p', f.falhou ? 'hint aviso' : 'hint', { role: 'status' }, f.falhou ? GAVETA.naoCarregou : GAVETA.carregando));
        return corpo;
    }
    if (vista.pulados.length) {
        corpo.appendChild(listaDePassos(ctx, GAVETA.jaRegistrado, GAVETA.dicaJaRegistrado,
            vista.pulados.map(p => ({ id: p.id, nota: p.motivo === 'sem_diario' ? GAVETA.semDiario : undefined })), f.passos, 'data-gv-pulados'));
    }
    // Aberta pelo protocolo de um nó, o que o nó já responde (a peça do 📹, a tarefa do 🔎) não se pergunta de
    // novo: uma linha diz o que veio dele, e a resposta vai na gravação como sempre.
    const doNo = f.doNo ? respondidosPeloNo(vista) : [];
    const ocultos = new Set(doNo.map(c => c.campo.id));
    if (doNo.length) corpo.appendChild(el(doc, 'p', 'hint gv-do-no', { 'data-gv-do-no': '' }, GAVETA.doNo(doNo.map(c => String(c.valor)))));
    const form = el(doc, 'div', 'pform', { 'data-form': 'gaveta' });
    const campo = (c: CampoNaGaveta) => {
        const pf = campoDaGavetaEl(ctx, c, f.problemas[c.campo.id], f.criar[c.campo.id] ?? null, f.contextos);
        const titulo = vista.titulos[c.campo.id];
        if (!titulo) return pf;
        // O título curto da tarefa que esta resposta cria (`askTitle`): logo depois dela, como o modal pergunta.
        const box = el(doc, 'div', 'gv-par');
        box.append(pf, tituloEl(ctx, titulo));
        return box;
    };
    for (const c of f.comDestaque ? vista.topo : [...vista.topo, ...vista.resto]) if (!ocultos.has(c.campo.id)) form.appendChild(campo(c));
    corpo.appendChild(form);
    if (f.comDestaque && vista.resto.length) {
        const r = resumoDoResto(vista);
        const sec = el(doc, 'div', 'gv-resto', { 'data-gv-resto': '' });
        const cab = sec.appendChild(el(doc, 'div', 'gv-resto-cab'));
        cab.appendChild(el(doc, 'span', 'hint', null, GAVETA.resto(nome, r.campos, r.sugeridos)));
        const b = botao(doc, 'btn', f.restoAberto ? GAVETA.recolherResto : GAVETA.abrirResto, { 'data-act': 'gv-resto', 'aria-expanded': String(f.restoAberto), 'aria-controls': 'gv-resto-campos' });
        ctx.marcar(b, `${GAVETA.resto(nome, r.campos, r.sugeridos)}; Gravar grava todos`);
        cab.appendChild(b);
        const dentro = sec.appendChild(el(doc, 'div', 'pform', { id: 'gv-resto-campos', hidden: !f.restoAberto }));
        for (const c of vista.resto) if (!ocultos.has(c.campo.id)) dentro.appendChild(campo(c));
        corpo.appendChild(sec);
    }
    const noFim = [...vista.fora.map(x => ({ id: x.id })), ...vista.semResposta.map(id => ({ id }))];
    if (noFim.length) corpo.appendChild(listaDePassos(ctx, GAVETA.noFim, GAVETA.dicaNoFim, noFim, f.passos, 'data-gv-no-fim'));
    corpo.appendChild(acoes(ctx, true, nome));
    return corpo;
}
