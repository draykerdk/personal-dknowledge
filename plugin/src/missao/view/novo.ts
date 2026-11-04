/**
 * O formulário do Novo na Missão (P8): o seletor de tipo, os campos do modelo do tipo, o
 * porquê de cada valor sugerido, o problema no campo e as ações (Criar, Abrir no TaskNotes ou
 * Abrir o protocolo completo, Cancelar).
 *
 * Por quê: o protótipo aprovado (template, 1920–1963 e 2290–2400): o Novo abre na gaveta do
 * painel do nó (a folha de baixo no celular), com o seletor Tarefa · SMART · Projeto · Cidade
 * · País em cima; a arquitetura (§4.2–4.4, §5.6): os campos, os rótulos, a ordem, o
 * obrigatório e as sugestões vêm do modelo do tipo, e o tipo vem do ramo. Nenhum nome de tipo
 * nem de campo mora aqui (§3.8): o que se desenha sai de `TipoDoNovo`.
 *
 * Em cima, quando o ramo diz o que escolher faz a partir do nó (29/10): "Escolher uma que já
 * existe", a busca com a lista das notas do tipo que fazem sentido ali, com o porquê; embaixo,
 * "Criar nova", o formulário de sempre. A lista não entra no Tab (a busca a percorre com ↑ ↓,
 * `aria-activedescendant`): o Tab vai da busca ao "Criar nova".
 *
 * Só desenha: os gestos saem como `data-act` (`novo-tipo`, `novo-criar`, `novo-completo`,
 * `novo-cancelar`, `novo-escolher`) e as caixas como `data-novo` (a busca, `data-escolher-busca`),
 * que o componente lê e grava.
 */
import type { DomainField } from '../../engine/domainModel';
import { textoParaEditar } from '../../engine/fieldModel';
import type { CampoDoNovo, TipoDoNovo } from '../novo';
import type { Candidato, OpcaoDeEscolher } from '../tipos';
import type { Sugestao } from '../sugestoes';
import { el, botao } from './dom';
import { caixaDoCampo, rotulosDoCatalogo } from './campos';
import { perguntasDoDonoEl, type PerguntasDoDono } from './gaveta';
import type { Contexto } from './contrato';
import { ADICIONAR, ESCOLHER, PAINEL } from '../frases';

/** O que o formulário desenha: os tipos, o escolhido, as entradas, as sugestões, os problemas e a origem. */
export interface FormDoNovo {
    tipos: readonly TipoDoNovo[];
    /** O tipo do "Criar nova"; `null` = o "＋ Adicionar" de um campo cujo alvo o Novo não cria (só a busca). */
    tipo: TipoDoNovo | null;
    /** A entrada de cada campo (a digitada, ou a sugerida). */
    entradas: Record<string, unknown>;
    /** Os campos que o operador já mexeu (a sugestão não vale mais neles). */
    digitados: ReadonlySet<string>;
    sugestoes: Record<string, Sugestao>;
    problemas: Record<string, string>;
    /** "Aberto em qui 29/10 · SMART X". */
    origem: string;
    /** Os candidatos de um campo de link (a lista de sugestões da caixa). */
    candidatos: (campo: DomainField) => Candidato[];
    /** O nome do protocolo dono (o emoji e o nome do JSON dele), para dizer por onde cria. */
    nomeDoProtocolo: string | null;
    /** O formulário nativo do TaskNotes está à mão (a via da tarefa). */
    noTaskNotes: boolean;
    /**
     * As perguntas do protocolo dono que o modelo do tipo não tem (P12b), pelo formulário do
     * protocolo: "Criar" não pergunta nada do que o Novo mostrou. `null` = o protocolo não se leu.
     */
    doProtocolo?: PerguntasDoDono | null;
    /** As etiquetas do ramo que a tarefa nova leva (P10c); vazio = nenhuma. */
    etiquetas?: readonly string[];
    /**
     * "Escolher uma que já existe" (29/10): o texto da busca, as opções (as primeiras), a da vez
     * (↑ ↓) e quantas há ao todo; sem a chave, o Novo só cria.
     */
    escolher?: { texto: string; opcoes: readonly OpcaoDeEscolher[]; ativa: number; total: number };
    /**
     * O "＋ Adicionar" de um campo (29/10): o rótulo do campo (a cabeça) e, no alvo sem tipo do Novo,
     * a nota nova pelo protocolo dono que o ramo declara (o texto da busca é o nome); sem a chave,
     * o Novo de sempre.
     */
    adicionar?: { rotulo: string; peloRamo: { rotulo: string; dica: string } | null };
}

/**
 * O que faz: a busca do "Escolher uma que já existe": a caixa (o combobox), a lista das opções
 * com o porquê e o que acontece quando nada se acha.
 * Entra → sai: o contexto e o escolher do formulário → a seção.
 */
function escolherEl(ctx: Contexto, e: NonNullable<FormDoNovo['escolher']>): HTMLElement {
    const doc = ctx.doc;
    const sec = el(doc, 'section', 'nv-escolher', { 'aria-label': ESCOLHER.titulo });
    sec.appendChild(el(doc, 'label', 'nv-sec-t', { for: 'nv-escolher-busca' }, ESCOLHER.titulo));
    const ativa = e.opcoes.length ? Math.min(Math.max(0, e.ativa), e.opcoes.length - 1) : -1;
    const busca = el(doc, 'input', 'nv-busca', {
        id: 'nv-escolher-busca', type: 'search', autocomplete: 'off', role: 'combobox', 'data-escolher-busca': '',
        'aria-expanded': String(e.opcoes.length > 0), 'aria-controls': 'nv-escolher-lista', 'aria-autocomplete': 'list',
        ...(ativa >= 0 ? { 'aria-activedescendant': `nv-op-${ativa}` } : {}),
    }) as HTMLInputElement;
    busca.value = e.texto;
    sec.appendChild(busca);
    const lista = el(doc, 'ul', 'nv-opcoes', { id: 'nv-escolher-lista', role: 'listbox', 'aria-label': ESCOLHER.titulo });
    e.opcoes.forEach((o, i) => {
        const li = el(doc, 'li', i === ativa ? 'nv-op on' : 'nv-op', { id: `nv-op-${i}`, role: 'option', 'aria-selected': String(i === ativa), 'data-act': 'novo-escolher', 'data-i': String(i) });
        li.appendChild(el(doc, 'span', 'nv-op-t', null, o.rotulo));
        const marcas = [o.pendente ? ESCOLHER.pendente : null, o.semData ? ESCOLHER.semData : null].filter(Boolean).join(' · ');
        if (marcas) li.appendChild(el(doc, 'span', 'nv-op-m', null, marcas));
        const porque = o.porque ? ESCOLHER.porQueAgora(o.porque) : o.gesto.via === 'mover' ? o.gesto.texto : null;
        if (porque) li.appendChild(el(doc, 'span', 'nv-op-pq', null, porque));
        ctx.marcar(li, o.gesto.via === 'campo' ? `${o.gesto.rotulo}: ${o.rotulo}` : `${o.gesto.texto}: ${o.rotulo}`, 'Enter');
        lista.appendChild(li);
    });
    if (e.opcoes.length) sec.appendChild(lista);
    const texto = e.texto.trim();
    if (!e.total) sec.appendChild(el(doc, 'p', 'hint nv-nenhuma', { role: 'status' }, texto ? ESCOLHER.nenhuma(texto) : ESCOLHER.vazia));
    else if (e.total > e.opcoes.length) sec.appendChild(el(doc, 'p', 'hint', null, ESCOLHER.mais(e.total - e.opcoes.length)));
    if (e.total) sec.appendChild(el(doc, 'p', 'hint', null, ESCOLHER.dica));
    return sec;
}

/**
 * O que faz: o fim do "＋ Adicionar" sem tipo do Novo: o "Criar nova" pelo ramo (o texto da busca
 * é o nome, e o protocolo dono pergunta o resto), ou só a busca; e o Fechar.
 */
function peloRamoEl(ctx: Contexto, f: FormDoNovo): HTMLElement {
    const doc = ctx.doc;
    const acts = el(doc, 'div', 'facts');
    const ramoPrincipal = f.adicionar?.peloRamo;
    if (ramoPrincipal) {
        acts.appendChild(el(doc, 'h3', 'nv-sec-t nv-criar-t', null, ESCOLHER.criar));
        const b = botao(doc, 'btn primary', ramoPrincipal.rotulo, { 'data-act': 'adicionar-criar' });
        ctx.marcar(b, `${ramoPrincipal.dica} (${ADICIONAR.nomeDaBusca})`);
        acts.appendChild(b);
    }
    const fechar = botao(doc, 'btn', 'Cancelar', { 'data-act': 'novo-cancelar' });
    ctx.marcar(fechar, 'Cancelar: fecha sem gravar nada');
    acts.appendChild(fechar);
    acts.appendChild(el(doc, 'span', 'hint', null, ramoPrincipal ? ADICIONAR.dicaPeloRamo : ADICIONAR.soEscolher));
    return acts;
}

const idDoCampo = (nome: string) => `nv-${nome.replace(/[^\w-]/g, '_')}`;

/** O que faz: a linha de um campo: o rótulo (com * no obrigatório), a caixa, o porquê da sugestão e o problema. */
function linhaDoCampo(ctx: Contexto, f: FormDoNovo, item: CampoDoNovo, alvo: HTMLElement): void {
    const doc = ctx.doc;
    const { campo } = item;
    const id = idDoCampo(campo.nome);
    const lab = el(doc, 'label', 'flabel', { for: id, 'data-campo': campo.nome }, campo.rotulo);
    if (campo.obrigatorio) lab.appendChild(el(doc, 'span', 'req', { 'aria-hidden': 'true' }, '*'));
    alvo.appendChild(lab);
    const cru = f.entradas[campo.nome];
    const caixa = caixaDoCampo(ctx, campo, cru, rotulosDoCatalogo(ctx), { 'data-novo': campo.nome });
    if (!caixa.classList.contains('ctxs')) caixa.id = id;
    if (campo.obrigatorio) caixa.setAttribute('aria-required', 'true');
    const problema = f.problemas[campo.nome];
    if (problema) caixa.setAttribute('aria-invalid', 'true');
    const candidatos = campo.tipo === 'link' ? f.candidatos(campo) : [];
    if (candidatos.length && caixa.tagName.toLowerCase() === 'input') {
        const lista = el(doc, 'datalist', null, { id: `${id}-opcoes` });
        for (const c of candidatos) lista.appendChild(el(doc, 'option', null, { value: c.nome }, c.rotulo !== c.nome ? c.rotulo : null));
        caixa.setAttribute('list', `${id}-opcoes`);
        const box = el(doc, 'div', 'nv-caixa');
        box.append(caixa, lista);
        alvo.appendChild(box);
    } else alvo.appendChild(caixa);
    const sug = f.sugestoes[campo.nome];
    if (sug && !f.digitados.has(campo.nome) && textoParaEditar(campo, cru)) {
        alvo.appendChild(el(doc, 'span', 'nv-vazio', { 'aria-hidden': 'true' }));
        alvo.appendChild(el(doc, 'p', 'hint nv-porque', { 'data-porque': campo.nome }, `Sugerido: ${sug.porque}`));
    }
    if (problema) {
        alvo.appendChild(el(doc, 'span', 'nv-vazio', { 'aria-hidden': 'true' }));
        alvo.appendChild(el(doc, 'p', 'f-err', { role: 'alert', 'data-problema': campo.nome }, problema));
    }
}

/**
 * O que faz: o conteúdo da gaveta do Novo: a cabeça, o seletor de tipo, os campos (os que
 * têm valor ou são obrigatórios à vista; os outros em "Mais campos") e as ações.
 * Entra → sai: o contexto do desenho e o formulário → o elemento.
 */
export function conteudoDoNovo(ctx: Contexto, f: FormDoNovo): HTMLElement {
    const doc = ctx.doc;
    const corpo = el(doc, 'div', 'dpanel nv', { 'data-novo-tipo': f.tipo?.dominio ?? '', ...(f.adicionar ? { 'data-adicionar': '' } : {}) });
    const dh = el(doc, 'div', 'dh');
    const box = el(doc, 'div', 'dh-txt');
    box.appendChild(el(doc, 'div', 'kind', null, f.adicionar ? ADICIONAR.titulo : 'Criar'));
    box.appendChild(el(doc, 'h2', 'dr-title', null, f.adicionar ? f.adicionar.rotulo : f.tipo?.titulo ?? ''));
    if (f.origem) box.appendChild(el(doc, 'p', 'origem', null, f.origem));
    dh.appendChild(box);
    const x = botao(doc, 'x', '×', { 'data-act': 'novo-fechar' });
    ctx.marcar(x, 'Fechar o Novo (o que você escreveu fica até fechar a vista)', 'Esc');
    dh.appendChild(x);
    corpo.appendChild(dh);

    // O "＋ Adicionar": a busca vem antes do seletor (o seletor é só do "Criar nova").
    if (f.adicionar && f.escolher) corpo.appendChild(escolherEl(ctx, f.escolher));
    const tipo = f.tipo;
    if (!tipo) {
        corpo.appendChild(peloRamoEl(ctx, f));
        return corpo;
    }
    if (f.adicionar) corpo.appendChild(el(doc, 'h3', 'nv-sec-t nv-criar-t', null, ESCOLHER.criar));
    if (!f.adicionar || f.tipos.length > 1) {
        const sel = el(doc, 'div', 'typepick', { role: 'group', 'aria-label': 'Tipo do novo' });
        for (const t of f.tipos) {
            const b = botao(doc, null, t.rotulo, { 'data-act': 'novo-tipo', 'data-tipo': t.dominio, 'aria-pressed': String(t.dominio === tipo.dominio) });
            ctx.marcar(b, `${t.titulo}: os campos do modelo do tipo`);
            sel.appendChild(b);
        }
        corpo.appendChild(sel);
    }
    if (f.escolher && !f.adicionar) {
        corpo.appendChild(escolherEl(ctx, f.escolher));
        corpo.appendChild(el(doc, 'h3', 'nv-sec-t nv-criar-t', null, ESCOLHER.criar));
    }

    const form = el(doc, 'div', 'fields fform', { 'data-form': 'novo' });
    const mais = el(doc, 'details', 'nv-mais');
    const maisCampos = el(doc, 'div', 'fields fform');
    let escondidos = 0;
    for (const item of tipo.campos) {
        const temValor = !!textoParaEditar(item.campo, f.entradas[item.campo.nome]);
        const aVista = item.campo.obrigatorio || temValor || f.digitados.has(item.campo.nome) || !!f.problemas[item.campo.nome];
        if (aVista) linhaDoCampo(ctx, f, item, form);
        else { linhaDoCampo(ctx, f, item, maisCampos); escondidos++; }
    }
    corpo.appendChild(form);
    if (tipo.via === 'tasknotes' && f.etiquetas?.length) corpo.appendChild(el(doc, 'p', 'hint nv-etiquetas', null, PAINEL.etiquetas(f.etiquetas.map(e => `#${e}`).join(' '))));
    if (f.doProtocolo?.campos.length) corpo.appendChild(perguntasDoDonoEl(ctx, f.doProtocolo));
    if (escondidos) {
        mais.appendChild(el(doc, 'summary', null, null, `Mais campos (${escondidos})`));
        mais.appendChild(maisCampos);
        corpo.appendChild(mais);
    }

    const acts = el(doc, 'div', 'facts');
    const criar = botao(doc, 'btn primary', 'Criar', { 'data-act': 'novo-criar' });
    const porProtocolo = tipo.via === 'protocolo';
    ctx.marcar(criar, porProtocolo
        ? `Criar pelo ${f.nomeDoProtocolo ?? 'protocolo dono'}, com estas respostas; o que ficar em branco o protocolo pergunta`
        : 'Criar a tarefa pelo TaskNotes; o aviso traz Desfazer', 'Enter');
    acts.appendChild(criar);
    if (porProtocolo) {
        const b = botao(doc, 'btn', 'Abrir o protocolo completo', { 'data-act': 'novo-completo' });
        ctx.marcar(b, `Abrir o protocolo completo: o ${f.nomeDoProtocolo ?? 'protocolo dono'} passo a passo, com o que já está aqui respondido`);
        acts.appendChild(b);
    } else if (f.noTaskNotes) {
        const b = botao(doc, 'btn', 'Abrir no TaskNotes', { 'data-act': 'novo-tasknotes' });
        ctx.marcar(b, 'Abrir no TaskNotes: o formulário dele, com o título, o onde, a estimativa e o projeto daqui');
        acts.appendChild(b);
    }
    const cancelar = botao(doc, 'btn', 'Cancelar', { 'data-act': 'novo-cancelar' });
    ctx.marcar(cancelar, 'Cancelar: fecha e esquece o que foi escrito');
    acts.appendChild(cancelar);
    acts.appendChild(el(doc, 'span', 'hint', null, porProtocolo
        ? `Enter cria pelo ${f.nomeDoProtocolo ?? 'protocolo dono'} · Esc fecha · * obrigatório`
        : 'Enter cria · Esc fecha · * obrigatório'));
    corpo.appendChild(acts);
    return corpo;
}
