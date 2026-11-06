/**
 * A caixa de um campo e os rótulos do catálogo: o desenho de um campo de nota pelo tipo e pelo
 * formato do modelo, igual no painel do nó e no Novo.
 *
 * Por quê: o passo `campos` da divisão da Missão (H5, tests/missao/modeloDfm.test.ts). A caixa e os
 * rótulos moravam em view/edicao.ts, no painel, e o Novo (view/novo.ts, vista.gaveta) os importava
 * de lá, de lado na camada 4. Aqui, na base da vista (vista.base), as duas partes os leem de baixo.
 *
 * Só desenha: os atributos de quem trata a caixa vêm de fora (o painel grava ao sair; o Novo só lê).
 * Nenhum nome de tipo nem de campo mora aqui (§3.8): o que se mostra vem do modelo e do catálogo.
 */
import type { DomainField } from '../../engine/domainModel';
import { comoEdita, listaPorLinha, textoParaEditar, textoPorLinha, type OpcaoDoCampo } from '../../engine/fieldModel';
import { campoDoEstado, modeloDaNota, type LinkDoCampo, type RotulosDosVocabularios } from '../camposDoNo';
import { opcoesDoEstado, type OpcaoDoEstado } from '../intencoes';
import { STATUS } from '../frases';
import type { MissaoTarefa } from '../tipos';
import { rotuloDoStatus } from '../estados';
import { fold } from '../../project/projectCanvasModel';
import { el, botao, botaoDeCorrente } from './dom';
import type { Contexto } from './contrato';

/** Os rótulos dos vocabulários para mostrar (a prioridade e os contextos pelo catálogo, o status pela tabela). */
export function rotulosDoCatalogo(ctx: Contexto): RotulosDosVocabularios {
    const { tabelas } = ctx.modelo.indice;
    const por = (lista: OpcaoDoCampo[] | undefined) => (v: string) => lista?.find(o => o.valor === v)?.rotulo ?? v;
    return {
        status: v => rotuloDoStatus(v, tabelas.tarefa),
        ...(ctx.vocabularios ? { prioridade: por(ctx.vocabularios.prioridade), contextos: por(ctx.vocabularios.contextos) } : {}),
    };
}

/** O que faz: as opções de um campo de escolha ou de lista: a lista fixa do modelo, ou o vocabulário do catálogo. */
function opcoesDoCampo(ctx: Contexto, campo: DomainField, rotulos: RotulosDosVocabularios): OpcaoDoCampo[] {
    if (Array.isArray(campo.valores)) return campo.valores.map(v => ({ valor: v, rotulo: v }));
    if (typeof campo.valores !== 'string') return [];
    const lista = ctx.vocabularios?.[campo.valores] ?? [];
    const rot = rotulos[campo.valores];
    return lista.map(o => ({ valor: o.valor, rotulo: rot ? rot(o.valor) : o.rotulo }));
}

/**
 * O que faz: a caixa de um campo, pelo tipo e pelo formato do modelo: a escolha vira lista de
 * opções; a lista de um vocabulário, as marcas; a data, o seletor do dia ou da hora; o resto,
 * o texto. Os atributos de quem trata a caixa vêm de fora (o painel grava ao sair; o Novo só lê).
 * Entra → sai: o contexto, o campo, o valor cru, os rótulos e os atributos → o elemento.
 */
export function caixaDoCampo(ctx: Contexto, campo: DomainField, cru: unknown, rotulos: RotulosDosVocabularios, atributos: Record<string, string>, candidatas: ReadonlyArray<{ nome: string; rotulo: string }> = []): HTMLElement {
    const doc = ctx.doc;
    const base: Record<string, string> = { ...atributos, 'aria-label': campo.rotulo };
    const atual = textoParaEditar(campo, cru);
    if (campo.tipo === 'escolha') {
        const sel = el(doc, 'select', null, base);
        const ops = opcoesDoCampo(ctx, campo, rotulos);
        if (!campo.obrigatorio) sel.appendChild(el(doc, 'option', null, { value: '' }, campo.vazio ?? '—'));
        for (const o of ops) sel.appendChild(el(doc, 'option', null, { value: o.valor, selected: o.valor === atual }, o.rotulo));
        if (atual && !ops.some(o => o.valor === atual)) sel.appendChild(el(doc, 'option', null, { value: atual, selected: true }, atual));
        sel.value = atual;
        return sel;
    }
    // O link de várias notas com as candidatas dadas (P9: as pessoas do dia): as ligadas para desmarcar e o seletor das outras.
    if (campo.tipo === 'link' && candidatas.length) {
        const box = el(doc, 'div', 'ctxs', { role: 'group', ...base });
        const marcados = atual ? atual.split(', ').map(fold) : [];
        const opcoes = [...candidatas, ...(atual ? atual.split(', ') : []).filter(n => !candidatas.some(c => fold(c.nome) === fold(n))).map(n => ({ nome: n, rotulo: n }))];
        for (const o of opcoes.filter(x => marcados.includes(fold(x.nome)))) {
            const lab = el(doc, 'label', 'ctx');
            const input = el(doc, 'input', null, { ...atributos, type: 'checkbox', value: o.nome, 'data-lista': '1', checked: true });
            (input as HTMLInputElement).checked = true;
            (input as HTMLInputElement).value = o.nome;
            lab.append(input, el(doc, 'span', null, null, o.rotulo));
            box.appendChild(lab);
        }
        const livres = opcoes.filter(x => !marcados.includes(fold(x.nome)));
        if (livres.length) {
            const sel = el(doc, 'select', null, { ...atributos, 'data-lista': '1', 'aria-label': campo.rotulo });
            sel.appendChild(el(doc, 'option', null, { value: '' }, !marcados.length && campo.vazio ? campo.vazio : 'Escolher…'));
            for (const o of livres) sel.appendChild(el(doc, 'option', null, { value: o.nome }, o.rotulo));
            sel.value = '';
            box.appendChild(sel);
        }
        return box;
    }
    if (campo.tipo === 'lista' && typeof campo.valores === 'string') {
        const marcados = new Set(Array.isArray(cru) ? cru.map(String) : atual ? atual.split(', ') : []);
        return caixaDeMarcas(ctx, campo, opcoesDoCampo(ctx, campo, rotulos), marcados, atributos);
    }
    // A lista livre com vírgula num item (as checagens da estadia, 30/10): um item por linha.
    if (listaPorLinha(campo, cru)) {
        const texto = textoPorLinha(cru);
        const linhas = texto.split('\n').length;
        const area = el(doc, 'textarea', null, { ...base, rows: String(Math.min(Math.max(linhas, 2), 8)), 'data-por-linha': '' }) as HTMLTextAreaElement;
        area.value = texto;
        area.textContent = texto;
        return area;
    }
    const tipoDoInput = campo.tipo === 'data' && campo.formato === 'dia' ? 'date' : campo.tipo === 'data' && campo.formato === 'hora' ? 'time' : 'text';
    const longo = campo.tipo === 'texto' && campo.formato === 'longo';
    const dica = campo.tipo === 'data' ? ({ dia_hora: 'AAAA-MM-DD ou AAAA-MM-DDTHH:MM', semana: 'AAAA-Www', trimestre: 'AAAA-Qn' } as Record<string, string>)[campo.formato ?? ''] : campo.tipo === 'link' ? 'nomes, com vírgula' : undefined;
    const attrs = { ...base, placeholder: dica ?? campo.vazio ?? null };
    const input: HTMLInputElement | HTMLTextAreaElement = longo
        ? el(doc, 'textarea', null, { ...attrs, rows: '2' })
        : el(doc, 'input', null, { ...attrs, type: tipoDoInput, value: atual });
    input.value = atual;
    if (longo) input.textContent = atual;
    return input;
}

/**
 * O que faz: as caixas de marcar de um campo de lista: uma por opção, marcadas as do valor; cada caixa leva os
 * atributos de quem a trata (o painel grava a lista inteira ao marcar ou desmarcar uma).
 * Por quê: a lista do vocabulário (os contextos) e, desde 06/11, os destinos da peça pelos perfis do canal (a
 * percorrida achou os destinos num campo de texto de uma linha, cortado).
 * Entra → sai: o contexto, o campo, as opções, as marcadas e os atributos → o grupo (`.ctxs`).
 */
export function caixaDeMarcas(ctx: Contexto, campo: DomainField, opcoes: readonly OpcaoDoCampo[], marcados: ReadonlySet<string>, atributos: Record<string, string>): HTMLElement {
    const doc = ctx.doc;
    const box = el(doc, 'div', 'ctxs', { role: 'group', ...atributos, 'aria-label': campo.rotulo });
    for (const o of opcoes) {
        const lab = el(doc, 'label', 'ctx');
        const input = el(doc, 'input', null, { ...atributos, type: 'checkbox', value: o.valor, 'data-lista': '1', checked: marcados.has(o.valor) });
        (input as HTMLInputElement).checked = marcados.has(o.valor);
        (input as HTMLInputElement).value = o.valor;
        lab.append(input, el(doc, 'span', null, null, o.rotulo));
        box.appendChild(lab);
    }
    return box;
}

/* ------------------------------------------------------------ a linha de campo (uma só para todo tipo) */

/** O que a linha de campo leva além do rótulo e do valor. */
export interface OpcoesDaLinha {
    /** O nome do campo do modelo (`data-campo` no rótulo). */
    campo?: string;
    /** O rótulo é um `<label>` (o campo que se edita no lugar). */
    label?: boolean;
    /** De onde vem o valor, ou quem é o dono dele: embaixo do valor, nunca ao lado. */
    origem?: HTMLElement | string | null;
}

/**
 * O que faz: uma linha de campo, a mesma para todo tipo de nó: o rótulo à esquerda e, na coluna
 * do valor, o valor em cima e a origem (o protocolo dono, "definido ao criar", o editor) embaixo.
 * Por quê: o diagnóstico do painel do nó (29/10, C1 e G1): seis desenhos de linha, cada um com
 * o seu defeito; o valor e a origem lado a lado num flex faziam o valor encolher até uma letra
 * ("SaP / a"). Uma função só: consertar uma linha conserta todas.
 * Entra → sai: o contexto, a grade (`.fields`), o rótulo, o valor (o elemento já feito) e as
 * opções → a coluna do valor (`.fval`), já na grade.
 * Erro e ataque: o rótulo e a origem são texto, nunca HTML.
 */
export function linhaDeCampo(ctx: Contexto, grade: HTMLElement, rotulo: string, valor: HTMLElement, o: OpcoesDaLinha = {}): HTMLElement {
    const doc = ctx.doc;
    grade.appendChild(el(doc, o.label ? 'label' : 'span', 'flabel', o.campo ? { 'data-campo': o.campo } : null, rotulo));
    const col = el(doc, 'div', 'fval');
    col.appendChild(valor);
    if (o.origem) col.appendChild(typeof o.origem === 'string' ? el(doc, 'span', 'forigem', null, o.origem) : o.origem);
    grade.appendChild(col);
    return col;
}

/** O que faz: o valor em texto de uma linha (`span.ro`; o vazio em tom apagado). */
export function valorEmSpan(ctx: Contexto, texto: string, vazio = false): HTMLElement {
    return el(ctx.doc, 'span', vazio ? 'ro none' : 'ro', null, texto);
}

/**
 * O que faz: o nó que um link acha, a partir de uma nota: a nota que o link escrito acha e o nó
 * dela; senão o nó do nome (o país sem nota); senão a nota, quando existe.
 * Entra → sai: o contexto, o alvo do link e a nota de onde ele sai → `{ id, titulo }`, ou `null`.
 */
export function noDoLink(ctx: Contexto, alvo: string, de: string | null): { id: string; titulo: string } | null {
    const caminho = de ? ctx.resolverLink?.(alvo, de) ?? null : null;
    const daNota = caminho ? ctx.modelo.noDaNota(caminho) : null;
    if (daNota) return daNota;
    const nome = alvo.slice(alvo.lastIndexOf('/') + 1);
    const doNome = ctx.modelo.noDoNome(nome);
    if (doNome) return doNome;
    return caminho && ctx.ligacoesDaNota?.(caminho) ? { id: `n:${caminho}`, titulo: nome } : null;
}

/**
 * O que faz: o valor de um campo de link: um botão por nó que o link acha (leva ao painel dele),
 * e o nome escrito quando não acha nada.
 * Por quê: G1: o país da cidade era só texto; o valor de link navega como as Conexões.
 * Entra → sai: o contexto, os links do campo e a nota de onde saem → o elemento (`.ro.links`).
 */
export function valorDeLinks(ctx: Contexto, links: readonly LinkDoCampo[], de: string | null): HTMLElement {
    const doc = ctx.doc;
    const box = el(doc, 'span', 'ro links');
    links.forEach((l, i) => {
        if (i) box.appendChild(el(doc, 'span', 'sep', { 'aria-hidden': 'true' }, '·'));
        const no = noDoLink(ctx, l.alvo, de);
        if (!no) { box.appendChild(el(doc, 'span', 'lk-txt', null, l.nome)); return; }
        const b = botaoDeCorrente(doc, 'lk', l.nome, { 'data-goto': no.id });
        ctx.marcar(b, `${l.nome}: o painel dele`);
        box.appendChild(b);
    });
    return box;
}

/* ------------------------------------------------------------ o estado de um nó (o menu de status, 02/11) */

/** O que o menu de status sabe de um nó: as opções da tabela, por onde grava, a nota e o título. */
export interface EstadoDoNo {
    id: string;
    titulo: string;
    /** A nota do nó (o Excluir manda esta para a lixeira). */
    nota: string;
    /** A TaskNote (a tarefa, a SMART): o status pelo TaskNotes, o Arquivar e a conclusão única. */
    tarefa: MissaoTarefa | null;
    /** O campo da nota que guarda o estado, no tipo que não é TaskNote (a estadia): grava pelo campo, com o Desfazer. */
    campo: DomainField | null;
    opcoes: OpcaoDoEstado[];
    /** O rótulo do estado de agora (da tabela), ou `null` fora dela. */
    agora: string | null;
}

/**
 * O que faz: o estado de um nó para o menu de status: a TaskNote lê a tabela das TaskNotes (a SMART
 * inclusive); a nota de outro tipo lê a tabela do modelo dela, quando o campo dono do estado se edita
 * na nota. O resto não tem menu.
 * Por quê: o padrão e a simetria (02/11/2026): todo tipo com a tabela `estados` ganha o
 * mesmo menu, lido do modelo; o estado que tem outro dono (o estágio do projeto é da coluna do
 * portfólio) não se muda por aqui.
 * Entra → sai: o contexto e o id → o estado, ou `null` (sem nota, sem tabela, ou o campo não é da nota).
 */
export function estadoDoNo(ctx: Contexto, id: string): EstadoDoNo | null {
    let nota: string | null = null;
    try { nota = ctx.modelo.arquivos(id).nota; } catch { nota = null; }
    const t = ctx.modelo.indice.porId.get(id) ?? null;
    if (t) {
        const tabela = ctx.modelo.indice.tabelas.tarefa;
        const atual = String(t.record.status ?? '');
        const opcoes = opcoesDoEstado(tabela, atual);
        if (!opcoes.length) return null;
        return { id, titulo: t.titulo, nota: t.caminho, tarefa: t, campo: null, opcoes, agora: opcoes.find(o => o.atual)?.rotulo ?? null };
    }
    if (!nota) return null;
    const fm = ctx.camposDaNota(nota) ?? {};
    const modelo = modeloDaNota(nota, fm, ctx.modelo.indice.tabelas.tipos ?? []);
    const campo = modelo ? campoDoEstado(modelo, modelo.estados, fm) : null;
    if (!modelo || !campo || comoEdita(campo, { nomeDoArquivo: ctx.nomeDoArquivo }).via !== 'campo') return null;
    const opcoes = opcoesDoEstado(modelo.estados, String(fm[campo.nome] ?? ''));
    const titulo = ctx.modelo.no(id)?.titulo ?? nota.slice(nota.lastIndexOf('/') + 1).replace(/\.md$/, '');
    return { id, titulo, nota, tarefa: null, campo, opcoes, agora: opcoes.find(o => o.atual)?.rotulo ?? null };
}

/** O que faz: o botão que abre o menu de status (o mesmo no painel, no campo do estado e no cartão), com a tecla S. */
export function botaoDoStatus(ctx: Contexto, id: string, titulo: string, cls = 'btn b-status'): HTMLButtonElement {
    const aberto = !!ctx.menuDoStatus?.(id);
    const b = botao(ctx.doc, cls, STATUS.botao, { 'data-act': 'status-menu', 'data-id': id, 'aria-expanded': String(aberto) });
    ctx.marcar(b, STATUS.dica(titulo), STATUS.tecla);
    return b;
}
