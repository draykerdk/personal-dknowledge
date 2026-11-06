/**
 * O painel do nó: o que um nó é, de onde vem e para onde vai, só de leitura.
 *
 * Por quê: o protótipo aprovado (template, 1571–1639) e o P4 da arquitetura (§10): o
 * painel à direita (de baixo no celular) com a Linhagem, o Tempo, os Sinais e os Campos;
 * "Abrir no TaskNotes" na tarefa (o editor do próprio TaskNotes, `MissionBoard.openTask`),
 * "Abrir a nota" e "Abrir o canvas" quando existem. Onde a Missão grava (P6), o painel
 * ganha as ações, o "Mover para…", as ligações e os campos editáveis (`edicao.ts`); criar
 * entra no P8, planejar e revisar no P12.
 *
 * Os campos de cada nó vêm do modelo do tipo da nota dele (`Config/dominios/<tipo>.json`,
 * P5, §4), na ordem e com os rótulos do modelo, por uma função só (`secoesDosCampos`):
 * nenhum nome de tipo nem lista de campos mora aqui (§3.8). A chave do `legado` que a
 * nota tem aparece em "Modelo antigo", só para ler.
 *
 * Só desenha: o id entra, o conteúdo do painel sai; os gestos chegam como `data-goto`
 * (ir até outro nó) e `data-open` (abrir um arquivo), que o componente trata.
 */
import type { DetalheDoNo, Passagem, LugarDoNo, MissaoNo, MissaoTarefa, PessoaDaMissao } from '../tipos';
import { chaveDeHoje, diaComAno, diaDaSemana, diaMes, diasDoPeriodo, isChaveEspecial, periodoDoId, semanaCurta, type Escala } from '../tempo';
import { idDaArea, idDoProjeto, VISAO_ID } from '../linhagem';
import { datasDaPassagem } from '../lugares';
import { ehDia } from '../formatos';
import { trilhaDoLugar } from '../lugarDoNo';
import { camposCrus, camposDoNo, modeloDaNota, mostraCampos } from '../camposDoNo';
import { el, botao, botaoDeCorrente, icone } from './dom';
import { linhaDoEstado, secaoDeAcoes, secaoDeLigacoes, secaoMoverPara, secoesDosCamposEditaveis } from './edicao';
import { linhaDeCampo, rotulosDoCatalogo, valorDeLinks, valorEmSpan } from './campos';
import { cicloEl, noEl, tracos } from './nos';
import type { Contexto } from './contrato';
import { APRENDIZADO, CHECKLIST, FRASES, PAINEL, PAPEIS_DO_PROTOCOLO as PAPEIS, PROTOCOLOS, REGISTRO, REPUTACAO, SUBTAREFAS } from '../frases';
import { checklistDoTexto, idDoItem, textoLimpoDoItem } from '../checklist';
import { linhaDaPessoa, PREFIXO_DA_PESSOA } from '../pessoas';
import { destinosDoFeito } from '../registro';
import { rotuloDoType, secaoDasConexoes } from './conexoes';

const TIPO_DO_ID: Record<string, [string, string]> = {
    't:': ['Ação', 'acao'], 's:': ['SMART', 'smart'], 'p:': ['Projeto', 'projeto'], 'a:': ['Área', 'area'],
    'd:': ['Dia', 'dia'], 'w:': ['Semana', 'semana'], 'q:': ['Trimestre', 'trimestre'], 'y:': ['Ano', 'ano'],
    'v:': ['Visão', 'visao'], 'l:': ['Lugar', 'lugar'], 'x:': ['Prateleira', 'prateleira'],
    [PREFIXO_DA_PESSOA]: [REGISTRO.pessoa, 'pessoa'],
    'n:': ['Nota', 'nota'], 'r:': ['Trecho', 'trecho'], 'c:': ['Nota', 'nota'],
};

function secao(ctx: Contexto, titulo: string | null): HTMLElement {
    const s = el(ctx.doc, 'div', 'dsec');
    if (titulo) s.appendChild(el(ctx.doc, 'h3', null, null, titulo));
    return s;
}

function cadeia(ctx: Contexto, itens: Array<[string, string] | 'sep' | 'dot' | string>): HTMLElement {
    const c = el(ctx.doc, 'div', 'chain');
    for (const it of itens) {
        if (it === 'sep') c.appendChild(el(ctx.doc, 'span', 'sep', { 'aria-hidden': 'true' }, '›'));
        else if (it === 'dot') c.appendChild(el(ctx.doc, 'span', 'sep', { 'aria-hidden': 'true' }, '·'));
        else if (typeof it === 'string') c.appendChild(el(ctx.doc, 'span', 'none', null, it));
        else {
            const b = botaoDeCorrente(ctx.doc, null, it[1], { 'data-goto': it[0] });
            ctx.marcar(b, `Ir até ${it[1]}`);
            c.appendChild(b);
        }
    }
    return c;
}

/** O que faz: a grade de linhas só de leitura (o rótulo e o valor), pela linha de campo única. */
function campos(ctx: Contexto, linhas: Array<[string, string | null | undefined]>): HTMLElement {
    const f = el(ctx.doc, 'div', 'fields');
    for (const [k, v] of linhas) {
        if (v === undefined) continue;
        linhaDeCampo(ctx, f, k, valorEmSpan(ctx, v ?? '—', v === null));
    }
    return f;
}

function lista(ctx: Contexto, nos: MissaoNo[], vazio: string): HTMLElement {
    const l = el(ctx.doc, 'div', 'list');
    if (!nos.length) l.appendChild(el(ctx.doc, 'span', 'empty', null, vazio));
    for (const n of nos) l.appendChild(noEl(ctx, n, { compacto: true }));
    return l;
}

/**
 * O que faz: as seções dos campos de um nó: "Campos", pelo modelo do tipo da nota, e
 * "Modelo antigo", com as chaves do `legado` que ela tem.
 * Por quê: §4 e §3.8: o painel segue o modelo do tipo, sem código por tipo; trocar o
 * modelo troca o painel. O status se lê pelo rótulo da tabela de estados.
 * Entra → sai: o contexto, o id e a dica de baixo → as seções (nenhuma sem nota ou sem modelo).
 */
function secoesDosCampos(ctx: Contexto, id: string, dica: string): HTMLElement[] {
    const nota = ctx.modelo.arquivos(id).nota;
    if (!nota) return [];
    // P10c: a nota que nenhum modelo descreve (ou cujo modelo não declara campo) mostra o frontmatter, para ler.
    const fm = ctx.camposDaNota(nota);
    const tipo = modeloDaNota(nota, fm, ctx.modelo.indice.tabelas.tipos ?? []);
    if (!mostraCampos(tipo)) { const s = camposDaNotaSemModelo(ctx, fm, tipo ? PAINEL.modeloSemCampos : PAINEL.semModelo); return s ? [s] : []; }
    // P6: onde a Missão grava, os campos com dono na nota se editam no lugar.
    if (ctx.gravar) return secoesDosCamposEditaveis(ctx, nota, ctx.modelo.indice.porId.has(id), id);
    const c = camposDoNo(nota, ctx.camposDaNota(nota), ctx.modelo.indice.tabelas.tipos ?? [], rotulosDoCatalogo(ctx));
    const out: HTMLElement[] = [];
    if (c.campos.length) {
        const sec = secao(ctx, 'Campos');
        const f = el(ctx.doc, 'div', 'fields');
        for (const linha of c.campos) {
            const valor = linha.links?.length ? valorDeLinks(ctx, linha.links, nota) : valorEmSpan(ctx, linha.valor, linha.vazio);
            // O campo vazio com as opções de outra nota (05/11, os destinos pelo canal) diz o que a regra sugere.
            const sugerido = linha.vazio ? ctx.modelo.opcoesPelaOutraNota?.(nota, fm ?? {}, linha.nome) ?? null : null;
            linhaDeCampo(ctx, f, linha.rotulo, valor, { campo: linha.nome, ...(sugerido ? { origem: PAINEL.sugeridoPelaOutraNota(sugerido) } : {}) });
        }
        sec.appendChild(f);
        sec.appendChild(el(ctx.doc, 'p', 'hint', null, dica));
        out.push(sec);
    }
    if (c.antigos.length) {
        const sec = secao(ctx, 'Modelo antigo');
        sec.appendChild(el(ctx.doc, 'p', 'hint', null, 'Campos do modelo antigo: só para ler, a nota não se regrava.'));
        sec.appendChild(campos(ctx, c.antigos.map(a => [a.nome, a.valor] as [string, string])));
        out.push(sec);
    }
    return out;
}

const SO_LEITURA = 'Só leitura aqui: para mudar, abra a nota.';

/**
 * O que faz: o frontmatter de uma nota sem modelo, recolhido ("Campos da nota (n)"), chave por
 * chave, só para ler, com o porquê.
 * Entra → sai: o contexto, o frontmatter e o porquê → a seção, ou `null` (nota sem frontmatter).
 */
function camposDaNotaSemModelo(ctx: Contexto, fm: Record<string, unknown> | null, porque: string): HTMLElement | null {
    const linhas = camposCrus(fm);
    if (!linhas.length) return null;
    const s = secao(ctx, null);
    const d = el(ctx.doc, 'details', 'fm-cru');
    d.appendChild(el(ctx.doc, 'summary', null, null, PAINEL.camposDaNota(linhas.length)));
    d.appendChild(el(ctx.doc, 'p', 'hint', null, porque));
    d.appendChild(campos(ctx, linhas.map(l => [l.nome, l.valor] as [string, string])));
    s.appendChild(d);
    return s;
}

/** O que faz: a fila das pessoas (o botão leva ao painel de cada uma; o nome sem nota fica só escrito). */
function filaDePessoas(ctx: Contexto, pessoas: readonly PessoaDaMissao[]): HTMLElement {
    const c = el(ctx.doc, 'div', 'chain');
    pessoas.forEach((p, i) => {
        if (i) c.appendChild(el(ctx.doc, 'span', 'sep', { 'aria-hidden': 'true' }, '·'));
        if (!p.id) { c.appendChild(el(ctx.doc, 'span', 'none', null, p.nome)); return; }
        const b = botao(ctx.doc, null, p.nome, { 'data-goto': p.id });
        ctx.marcar(b, `${p.nome}: o painel da pessoa`);
        c.appendChild(b);
    });
    return c;
}

/** O que faz: uma linha de um formulário curto do painel (o rótulo e a caixa). */
function linhaDoForm(ctx: Contexto, f: HTMLElement, rotulo: string, caixa: HTMLElement): void {
    linhaDeCampo(ctx, f, rotulo, caixa, { label: true });
}

/**
 * O que faz: o registro do dia no painel (P9, §8.7, §8.9): o "＋ O que fiz" (o formulário curto:
 * o que, a hora, o projeto ou a SMART, o onde e o quanto levou), as pessoas do dia e, sem a Day,
 * o aviso de que pessoas e dinheiro esperam a nota. Os botões e os campos vêm do registro da
 * ramo; o dinheiro e as pessoas se editam nos Campos, pelo modelo do dia, e a pessoa nova é o
 * "Criar nova" do "＋ Adicionar" do campo (o Novo do tipo, pelo modelo dele, 29/10).
 * Entra → sai: o contexto e a chave do dia → a seção, ou `null` (sem gesto, ou o dia no futuro e sem pessoa).
 */
function registroDoDia(ctx: Contexto, chave: string): HTMLElement | null {
    const { doc, modelo } = ctx;
    const gestos = ctx.gravar ? ctx.ramoPrincipal.registro?.dia ?? {} : {};
    const pessoas = modelo.pessoasDoDia(chave);
    const passado = chave <= modelo.hoje;
    const nota = modelo.arquivos(`d:${chave}`).nota;
    if (!pessoas.length && !(passado && (gestos.feito || gestos.nota))) return null;
    const s = secao(ctx, REGISTRO.secaoDoDia);
    if (passado && gestos.feito) {
        const acts = el(doc, 'div', 'acts');
        const b = botao(doc, 'btn', gestos.feito.rotulo, { 'data-act': 'feito-abrir', 'aria-expanded': 'false' });
        ctx.marcar(b, gestos.feito.dica);
        acts.appendChild(b);
        s.appendChild(acts);
        const form = el(doc, 'div', 'linkbox rg-form', { hidden: true, 'data-form': 'feito' });
        const f = el(doc, 'div', 'fields fform');
        linhaDoForm(ctx, f, REGISTRO.oQueFiz, el(doc, 'input', null, { type: 'text', 'data-input': 'feito-titulo', 'aria-label': REGISTRO.oQueFiz }));
        linhaDoForm(ctx, f, REGISTRO.hora, el(doc, 'input', null, { type: 'time', 'data-input': 'feito-hora', 'aria-label': REGISTRO.hora }));
        const proj = el(doc, 'select', null, { 'data-input': 'feito-projeto', 'aria-label': REGISTRO.projeto });
        proj.appendChild(el(doc, 'option', null, { value: '' }, REGISTRO.nenhum));
        for (const d of destinosDoFeito(modelo.indice)) proj.appendChild(el(doc, 'option', null, { value: d.nome }, d.rotulo));
        linhaDoForm(ctx, f, REGISTRO.projeto, proj);
        const onde = el(doc, 'select', null, { 'data-input': 'feito-onde', 'aria-label': REGISTRO.onde });
        onde.appendChild(el(doc, 'option', null, { value: '' }, REGISTRO.nenhum));
        for (const o of ctx.vocabularios?.contextos ?? []) onde.appendChild(el(doc, 'option', null, { value: o.valor }, o.rotulo));
        linhaDoForm(ctx, f, REGISTRO.onde, onde);
        linhaDoForm(ctx, f, REGISTRO.minutos, el(doc, 'input', null, { type: 'number', min: '1', max: '1440', step: '5', 'data-input': 'feito-minutos', 'aria-label': REGISTRO.minutos }));
        form.appendChild(f);
        const ok = botao(doc, 'btn primary', REGISTRO.registrar, { 'data-act': 'feito-ok', 'data-dia': chave });
        ctx.marcar(ok, REGISTRO.dicaRegistrar);
        form.appendChild(ok);
        form.appendChild(el(doc, 'p', 'hint', null, REGISTRO.dicaDoFeito));
        s.appendChild(form);
    }
    if (pessoas.length) {
        s.appendChild(el(doc, 'h3', null, null, REGISTRO.pessoasDoDia));
        s.appendChild(filaDePessoas(ctx, pessoas));
    }
    // A nota nova do campo (a pessoa nova) é o "Criar nova" do "＋ Adicionar" do campo, nos Campos;
    // sem a Day, não há campo: o aviso diz que esperam a nota (o campo do registro do ramo: a nota nova ou o atalho).
    if (passado && (gestos.nota || gestos.atalho) && !nota) s.appendChild(el(doc, 'p', 'hint', null, REGISTRO.semDay));
    return s;
}

/**
 * O que faz: a seção "Dinheiro" de um período: a soma dele, com a janela em datas (a conta única,
 * `diasSemRegistro`); no trimestre de hoje, a linha da reserva uma vez e o "Informar saldo" (P9,
 * §8.10: o valor, gravado com a data de hoje na nota da reserva pelo campo do ramo; os valores são
 * da pessoa, nada é sugerido).
 * Por quê: o diagnóstico do painel do nó (29/10, C3 e G3): a reserva aparecia duas vezes no painel
 * do trimestre (na linha do período e no "Informar saldo") e o dinheiro ficava solto na Linha.
 * Entra → sai: o contexto, a escala, a chave e a soma em texto → a seção, ou `null` (nada a dizer).
 */
function dinheiroDoPeriodo(ctx: Contexto, escala: Escala, chave: string, soma: string): HTMLElement | null {
    const deHoje = escala === 'trimestre' && chave === chaveDeHoje('trimestre', ctx.modelo.hoje);
    const gesto = ctx.gravar && deHoje ? ctx.ramoPrincipal.registro?.trimestre?.saldo : undefined;
    const nota = ctx.modelo.notaDaReserva;
    const reserva = deHoje ? ctx.modelo.reserva.texto : '';
    if (!soma && !reserva && !(gesto && nota)) return null;
    const { doc } = ctx;
    const s = secao(ctx, PAINEL.dinheiro);
    if (soma) s.appendChild(el(doc, 'p', 'big-line', null, soma));
    if (reserva) s.appendChild(el(doc, 'p', 'rw-line', null, `${ctx.modelo.reserva.rotulo}: ${reserva}`));
    if (gesto && nota) {
        const f = el(doc, 'div', 'fields');
        const box = el(doc, 'div', 'linkbox');
        const input = el(doc, 'input', null, { type: 'text', inputmode: 'decimal', 'data-input': 'informar-valor', 'aria-label': REGISTRO.saldo, placeholder: REGISTRO.saldo });
        const b = botao(doc, 'btn primary', REGISTRO.gravar, { 'data-act': 'informar-saldo', 'data-path': nota });
        ctx.marcar(b, gesto.dica);
        box.append(input, b);
        linhaDeCampo(ctx, f, gesto.rotulo, box, { origem: REGISTRO.dicaDoSaldo.replace('{nota}', ctx.modelo.reserva.rotulo) });
        s.appendChild(f);
    }
    return s;
}

/**
 * O que faz: o Tempo da tarefa, pelo lugar no tempo dela (`colocacao`: o agendado, o prazo ou a semana):
 * o dia, a semana, o trimestre e a Visão; sem tempo, "sem data" (ou "algum dia") e o dia em que foi
 * criada, dito como "criada em", nunca como o período.
 */
function tempoDaTarefa(ctx: Contexto, t: MissaoTarefa): HTMLElement {
    const c = t.colocacao;
    if (!c.dia && !c.semana) {
        const criada = String(t.record.created ?? '').slice(0, 10);
        const quando = ehDia(criada) ? `criada em ${diaMes(criada)}/${criada.slice(0, 4)}` : '';
        return cadeia(ctx, [c.lugar === 'algum-dia' ? 'algum dia' : 'sem data', ...(quando ? ['dot' as const, quando] : [])]);
    }
    const itens: Array<[string, string] | 'sep' | 'dot' | string> = [];
    if (c.dia) itens.push([`d:${c.dia}`, `${diaDaSemana(c.dia)} ${diaMes(c.dia)}${c.hora ? ` · ${c.hora}` : ''}`], 'sep');
    if (c.semana) itens.push([`w:${c.semana}`, semanaCurta(c.semana)], 'sep');
    if (c.trimestre) itens.push([`q:${c.trimestre}`, c.trimestre], 'sep');
    itens.push([VISAO_ID, 'Visão']);
    if (c.dia) {
        const lugar = ctx.modelo.passagens.filter(e => e.de <= c.dia! && (!e.ate || c.dia! <= e.ate)).pop();
        if (lugar) itens.push('dot', [lugar.id, lugar.cidade]);
    }
    return cadeia(ctx, itens);
}

function linhagemDaTarefa(ctx: Contexto, t: MissaoTarefa): HTMLElement {
    const { indice } = ctx.modelo;
    const itens: Array<[string, string] | 'sep' | 'dot' | string> = [];
    if (t.smart && indice.porId.has(t.smart)) itens.push([t.smart, indice.porId.get(t.smart)!.titulo], 'sep');
    const p = t.projeto ? indice.projetos.get(t.projeto) : null;
    if (p) {
        itens.push([p.id, p.nome]);
        if (p.central && idDoProjeto(p.central) !== p.id) itens.push('sep', [idDoProjeto(p.central), p.central]);
        itens.push('sep', [idDaArea(p.area), p.area]);
    } else itens.push(t.motivo === 'vinculo-quebrado' ? `o vínculo "${t.quebrado ?? ''}" não é projeto nem SMART` : 'sem projeto');
    return cadeia(ctx, itens);
}

/**
 * O que faz: a tarefa mãe e as subtarefas de uma tarefa (o jeito do TaskNotes: o `projects` da
 * subtarefa aponta a mãe), pelas conexões padrão do modelo; as subtarefas como nós, a mãe como botão.
 * Por quê: além das subtarefas, as dependências e os itens da checklist (29/10/2026).
 * Entra → sai: o contexto e a tarefa → as seções (a mãe só se há; as subtarefas sempre, com o vazio).
 */
function subtarefasDaTarefa(ctx: Contexto, t: MissaoTarefa): HTMLElement[] {
    const padrao = ctx.modelo.conexoesPadrao(t.id);
    const out: HTMLElement[] = [];
    const mae = padrao.filter(r => r.relacao === 'mae' && r.id);
    if (mae.length) { const s = secao(ctx, SUBTAREFAS.mae); s.appendChild(cadeia(ctx, mae.map(r => [r.id!, r.titulo] as [string, string]))); out.push(s); }
    const filhas = padrao.filter(r => r.relacao === 'subtarefa' && r.id).map(r => ctx.modelo.indice.porId.get(r.id!)).filter((x): x is MissaoTarefa => !!x);
    const s = secao(ctx, SUBTAREFAS.titulo);
    s.setAttribute('data-secao', 'subtarefas');
    s.appendChild(lista(ctx, filhas.map(x => ctx.modelo.noDaTarefaNoPainel(x)), SUBTAREFAS.vazia));
    out.push(s);
    return out;
}

/**
 * O que faz: a checklist da nota da tarefa: cada linha `- [ ]` ou `- [x]` uma caixa que marca só
 * aquela linha (onde a Missão grava), e o "+ Item" com a caixa do item novo.
 * Por quê: os itens da checklist também viram nós ali (29/10/2026).
 * Entra → sai: o contexto e a tarefa → a seção, ou `null` (o lugar não lê o texto, ou a nota não existe).
 * Erro e ataque: enquanto o texto não chega, "lendo a nota…"; onde não grava, os itens só se leem.
 */
function checklistDaTarefa(ctx: Contexto, t: MissaoTarefa): HTMLElement | null {
    if (!ctx.textoDaNota) return null;
    const texto = ctx.textoDaNota(t.caminho);
    const lendo = texto === null && !!ctx.lendoTexto?.(t.caminho);
    if (texto === null && !lendo) return null;
    const { doc } = ctx;
    const s = secao(ctx, CHECKLIST.titulo);
    s.setAttribute('data-secao', 'checklist');
    if (lendo) { s.appendChild(el(doc, 'p', 'hint', null, CHECKLIST.lendo)); return s; }
    const itens = checklistDoTexto(texto!);
    const l = el(doc, 'div', 'list ck-list');
    if (!itens.length) l.appendChild(el(doc, 'span', 'empty', null, CHECKLIST.vazia));
    for (const i of itens) {
        const limpo = textoLimpoDoItem(i.texto);
        const linha = el(doc, 'div', `ck-item${i.feito ? ' feito' : ''}`, { 'data-item': idDoItem(t.caminho, i.linha) });
        if (ctx.checklist) {
            const b = botao(doc, 'ck', i.feito ? '☑' : '☐', { role: 'checkbox', 'aria-checked': String(i.feito), 'data-act': 'item-marcar', 'data-path': t.caminho, 'data-linha': String(i.linha), 'data-feito': i.feito ? 'nao' : 'sim', 'data-texto': i.texto });
            ctx.marcar(b, CHECKLIST.dicaMarcar(limpo, i.feito));
            linha.appendChild(b);
        } else linha.appendChild(el(doc, 'span', 'ck', { 'aria-hidden': 'true' }, i.feito ? '☑' : '☐'));
        linha.appendChild(el(doc, 'span', 'ck-t', null, limpo));
        l.appendChild(linha);
    }
    s.appendChild(l);
    if (ctx.checklist) {
        const acts = el(doc, 'div', 'acts');
        const b = botao(doc, 'btn b-item', CHECKLIST.novo, { 'data-act': 'item-abrir', 'aria-expanded': 'false' });
        ctx.marcar(b, CHECKLIST.dicaNovo);
        acts.appendChild(b);
        s.appendChild(acts);
        const form = el(doc, 'div', 'linkbox', { hidden: true, 'data-form': 'item' });
        form.appendChild(el(doc, 'input', null, { type: 'text', 'data-input': 'item-texto', 'aria-label': CHECKLIST.textoDoItem, placeholder: CHECKLIST.textoDoItem }));
        const ok = botao(doc, 'btn primary', CHECKLIST.gravar, { 'data-act': 'item-ok', 'data-path': t.caminho });
        ctx.marcar(ok, CHECKLIST.dicaNovo);
        form.appendChild(ok);
        s.appendChild(form);
    }
    return s;
}

/** Quantos motivos o "Por que agora" diz (os maiores). */
export const MOTIVOS_DO_PAINEL = 3;

/**
 * O que faz: o "Por que agora" da tarefa aberta: os motivos maiores da tabela única, em
 * palavras (o protótipo, template 1585; §1, a linha do painel do nó).
 * Por quê: "o 'Por que agora' da tarefa: os pesos que a puseram ali (`reasonsByPath`)" (plano
 * §3); a conta é a de `scoresByPath`, uma vez por versão, e não se refaz aqui.
 * Entra → sai: o contexto e a tarefa → a seção, ou `null` (feita, SMART, ou sem pontuação:
 * algum dia, esperando, sem a tabela).
 */
function porQueAgora(ctx: Contexto, t: MissaoTarefa): HTMLElement | null {
    if (t.feita || t.tipo !== 'acao') return null;
    const m = ctx.modelo.motivos(t.id);
    if (!m) return null;
    const sec = secao(ctx, 'Por que agora');
    sec.appendChild(el(ctx.doc, 'p', 'why', null, m.length ? m.slice(0, MOTIVOS_DO_PAINEL).map(x => x.texto).join(' · ') : FRASES.semPeso));
    sec.appendChild(el(ctx.doc, 'p', 'hint', null, 'Os pesos do plano que põem a tarefa aqui, pela tabela única.'));
    return sec;
}

/**
 * O que faz: a seção "Próxima ação" do projeto (02/11): o cartão da ação que vem primeiro (o clique abre o
 * painel dela) e de onde ela veio: fixada na nota, ou a primeira pela ordem padrão.
 * Entra → sai: o contexto e o id → a seção, ou `null` (o projeto não tem ação aberta: a seção não aparece).
 */
function proximaDoProjeto(ctx: Contexto, id: string): HTMLElement | null {
    const p = ctx.modelo.proximaAcao?.(id) ?? null;
    if (!p) return null;
    const sec = secao(ctx, PAINEL.proximaAcao);
    sec.setAttribute('data-secao', 'proxima-acao');
    sec.appendChild(noEl(ctx, ctx.modelo.noDaTarefaNoPainel(p.tarefa), { compacto: true }));
    const de = p.origem === 'fixada' ? PAINEL.proximaFixada : p.fixadaSemEfeito ? PAINEL.proximaFixadaSemEfeito(p.fixadaSemEfeito) : PAINEL.proximaPelaOrdem;
    sec.appendChild(el(ctx.doc, 'p', 'hint', null, de));
    return sec;
}

/**
 * O que faz: o valor de uma linha que aponta uma tarefa: o cartão dela (o clique abre o painel dela), quando
 * ela está no índice; senão o texto.
 * Entra → sai: o contexto, a tarefa (ou `null`) e o texto → o elemento.
 */
function valorDaTarefaOuTexto(ctx: Contexto, tarefa: MissaoTarefa | null, texto: string): HTMLElement {
    return tarefa ? noEl(ctx, ctx.modelo.noDaTarefaNoPainel(tarefa), { compacto: true }) : valorEmSpan(ctx, texto);
}

function sinaisDoNo(ctx: Contexto, id: string, corpo: HTMLElement): void {
    const s = ctx.modelo.sinaisDoNo(id);
    if (!s.length) return;
    const sec = secao(ctx, 'Sinais');
    // O sinal que olha adiante (P10b) diz a data no próprio fato; o "desde" é dos que já passaram.
    for (const x of s) sec.appendChild(el(ctx.doc, 'p', 'why', null, `${x.fato}${x.desde && x.desde <= ctx.modelo.hoje ? ` · desde ${diaMes(x.desde)}` : ''}`));
    // O próximo passo que o modelo do tipo declara: o protocolo, onde a Missão grava. O que a seção Protocolos já
    // mostra (a situação do nó, o P13) aparece uma vez só, lá, e o botão daqui sai.
    const naLista = new Set((ctx.protocolosDoNo?.(id) ?? []).map(p => p.id));
    const passos = s.map(x => x.proximoPasso).filter(p => p.acao === 'protocolo' && p.protocolo && !naLista.has(p.protocolo));
    if (passos.length && ctx.rodaProtocolo) {
        const acts = el(ctx.doc, 'div', 'acts');
        for (const p of passos.filter((p, i) => passos.findIndex(q => q.protocolo === p.protocolo) === i)) {
            const b = botao(ctx.doc, 'btn', p.rotulo, { 'data-act': 'protocolo-do-sinal', 'data-protocolo': p.protocolo! });
            ctx.marcar(b, `${p.rotulo}: ${ctx.nomeDoProtocolo?.(p.protocolo!) || p.protocolo}, passo a passo`);
            acts.appendChild(b);
        }
        sec.appendChild(acts);
    }
    corpo.appendChild(sec);
}

/**
 * O que faz: o painel de um nó de coleção, de trecho ou de vínculo (P10b): o tipo, as linhas
 * que o modelo dá (os campos do ramo, a ausência em palavras), as notas ligadas com as linhas
 * delas, os sinais e os campos pelo modelo do tipo.
 * Entra → sai: o contexto, o id, o detalhe e a cabeça → o corpo.
 */
function painelDoDetalhe(ctx: Contexto, id: string, det: DetalheDoNo, corpo: HTMLElement, head: (t: string, k?: string) => void): HTMLElement {
    head(det.titulo, det.rotulo);
    const a = acoes(ctx, id, null);
    // O alvo de um vínculo sem nota (P10c): "Criar a nota" pelo Novo do tipo, com o nome já respondido.
    const novo = det.semNota ? ctx.novoDoType?.(det.semNota.type) ?? null : null;
    if (novo && det.semNota) {
        const s = a ?? secao(ctx, null);
        let acts = s.querySelector('.acts') as HTMLElement | null;
        if (!acts) { acts = el(ctx.doc, 'div', 'acts'); s.appendChild(acts); }
        const b = botao(ctx.doc, 'btn primary', PAINEL.criarANota, { 'data-act': 'novo', 'data-tipo': novo.dominio, 'data-id': id, ...(det.semNota.campo ? { 'data-campo': det.semNota.campo } : {}), 'data-valor': det.semNota.nome });
        ctx.marcar(b, PAINEL.dicaCriarANota(novo.titulo, det.semNota.nome));
        acts.appendChild(b);
        corpo.appendChild(s);
    } else if (a) corpo.appendChild(a);
    if (det.linhas.length) { const s = secao(ctx, 'Detalhes'); s.appendChild(campos(ctx, det.linhas)); corpo.appendChild(s); }
    if (det.ligadas.length) {
        const s = secao(ctx, 'Ligadas');
        for (const n of det.ligadas) {
            s.appendChild(noEl(ctx, n, { compacto: true }));
            const ls = det.linhasDasLigadas[n.id] ?? [];
            if (ls.length) s.appendChild(campos(ctx, ls));
        }
        corpo.appendChild(s);
    }
    corpo.append(...secoesDosCampos(ctx, id, SO_LEITURA));
    return corpo;
}

function acoes(ctx: Contexto, id: string, tarefa: MissaoTarefa | null): HTMLElement | null {
    const arq = ctx.modelo.arquivos(id);
    const acts = el(ctx.doc, 'div', 'acts');
    if (tarefa) {
        const b = botao(ctx.doc, 'btn primary', 'Abrir no TaskNotes', { 'data-open': 'tarefa', 'data-path': tarefa.caminho });
        ctx.marcar(b, 'Abrir no TaskNotes: o editor da tarefa');
        acts.appendChild(b);
    }
    if (arq.nota && !tarefa) {
        const b = botao(ctx.doc, 'btn', 'Abrir a nota', { 'data-open': 'nota', 'data-path': arq.nota });
        ctx.marcar(b, 'Abrir a nota numa aba', 'N');
        acts.appendChild(b);
    }
    if (arq.nota && tarefa) {
        const b = botao(ctx.doc, 'btn', 'Abrir a nota', { 'data-open': 'nota', 'data-path': arq.nota });
        ctx.marcar(b, 'Abrir a nota da tarefa numa aba', 'N');
        acts.appendChild(b);
    }
    if (arq.canvas) {
        const b = botao(ctx.doc, 'btn', 'Abrir o canvas', { 'data-open': 'nota', 'data-path': arq.canvas });
        ctx.marcar(b, 'Abrir o canvas numa aba', 'C');
        acts.appendChild(b);
    }
    // O que se cria a partir do nó (P8, o Novo do ramo): "+ Nova ação" na SMART, "+ Nova tarefa" no dia.
    for (const n of ctx.novos?.(id) ?? []) {
        const b = botao(ctx.doc, 'btn b-novo-no', `+ ${n.rotulo}`, { 'data-act': 'novo', 'data-tipo': n.tipo, 'data-id': id, ...(n.campo && n.valor ? { 'data-campo': n.campo, 'data-valor': n.valor } : {}) });
        ctx.marcar(b, `+ ${n.rotulo}: o Novo, já ligado a este nó`);
        acts.appendChild(b);
    }
    // G7, porta 3: o nó que outro ramo amplia (o lugar, a cidade, o país) leva a ela, com o painel aberto lá.
    const ver = ctx.verNoRamo?.(id);
    if (ver) {
        const b = botao(ctx.doc, 'btn b-ver-ramo', PAINEL.verNoRamo(ver.titulo), { 'data-ver-ramo': ver.id, 'data-id': id });
        ctx.marcar(b, PAINEL.dicaVerNoRamo(ver.titulo));
        acts.appendChild(b);
    }
    // O que falta, pelos comandos de sempre (o plano, §3: "Sem canvas ainda, aparece 'Criar canvas'").
    if (ctx.criar && !tarefa) {
        for (const que of ctx.modelo.criaveis(id)) {
            const b = botao(ctx.doc, 'btn', que === 'canvas' ? 'Criar o canvas' : 'Criar a nota', { 'data-act': 'criar', 'data-que': que, 'data-id': id });
            ctx.marcar(b, que === 'canvas' ? 'Criar o canvas: pelo mesmo comando do painel, e abre numa aba' : 'Criar a nota: a Day pelo modelo do Periodic Notes, e abre numa aba');
            acts.appendChild(b);
        }
    }
    if (!acts.childElementCount) return null;
    const sec = secao(ctx, null);
    sec.appendChild(acts);
    return sec;
}

/**
 * O que faz: as semanas de um trimestre como botões (G5): cada uma leva ao painel dela; a de agora,
 * marcada (`aria-current`).
 * Por quê: o diagnóstico do painel do nó (29/10, C5): faltavam as semanas no painel do trimestre.
 * Entra → sai: o contexto e a chave do trimestre → a seção, ou `null` (chave sem dias).
 */
function semanasDoPeriodo(ctx: Contexto, chave: string): HTMLElement | null {
    const semanas = [...new Set(diasDoPeriodo('trimestre', chave).map(d => chaveDeHoje('semana', d)))];
    if (!semanas.length) return null;
    const agora = chaveDeHoje('semana', ctx.modelo.hoje);
    const s = secao(ctx, PAINEL.semanas);
    const c = el(ctx.doc, 'div', 'chain', { 'data-atalhos': 'semanas' });
    for (const w of semanas) {
        const b = botaoDeCorrente(ctx.doc, w === agora ? 'agora' : null, semanaCurta(w), { 'data-goto': `w:${w}`, 'aria-current': w === agora ? 'true' : null });
        ctx.marcar(b, `${semanaCurta(w)}${w === agora ? ' (esta semana)' : ''}: o painel da semana`);
        c.appendChild(b);
    }
    s.appendChild(c);
    return s;
}

/* ------------------------------------------------------------ o lugar em camadas (G6) */

/** O que faz: um dia por extenso ("qua 28/10/2026"). */
const diaPorExtenso = diaComAno;

/** O que faz: o texto de uma passagem nos atalhos e na trilha ("passagem de 28/10"). */
const rotuloDaPassagem = (e: Passagem) => PAINEL.passagemDe(diaMes(e.de));

/** O que faz: um lugar como valor: o botão que leva ao painel dele, ou o nome escrito quando não tem nó. */
function alvoDoLugar(ctx: Contexto, id: string | null, nome: string): HTMLElement {
    if (!id) return valorEmSpan(ctx, nome);
    const box = el(ctx.doc, 'span', 'ro links');
    const b = botaoDeCorrente(ctx.doc, 'lk', nome, { 'data-goto': id });
    ctx.marcar(b, PAINEL.dicaDoLugar(nome));
    box.appendChild(b);
    return box;
}

/**
 * O que faz: a trilha do lugar no alto do painel (G6): `País › Cidade › passagem de 28/10`, cada
 * parte um botão que leva ao painel dela; a do nó aberto, escrita.
 * Por quê: a proposta aprovada ("O caminho no topo do painel mostra onde se está e volta com um
 * clique"); a trilha de navegação ("‹ Voltar") diz de onde se veio, esta diz onde o nó mora.
 * Entra → sai: o contexto, o lugar e o id aberto → a trilha, ou `null` (nada acima do nó).
 */
function trilhaDoLugarEl(ctx: Contexto, lugar: LugarDoNo, id: string): HTMLElement | null {
    const passos = trilhaDoLugar(lugar, rotuloDaPassagem);
    if (!passos.length) return null;
    const nav = el(ctx.doc, 'nav', 'chain trilha-lugar', { 'aria-label': PAINEL.ondeMora });
    passos.forEach((p, i) => {
        if (i) nav.appendChild(el(ctx.doc, 'span', 'sep', { 'aria-hidden': 'true' }, '›'));
        if (p.id === id || i === passos.length - 1) { nav.appendChild(el(ctx.doc, 'span', 'tr-aqui', { 'aria-current': 'page' }, p.titulo)); return; }
        if (!p.id) { nav.appendChild(el(ctx.doc, 'span', 'none', null, p.titulo)); return; }
        const b = botaoDeCorrente(ctx.doc, null, p.titulo, { 'data-goto': p.id });
        ctx.marcar(b, PAINEL.dicaDoLugar(p.titulo));
        nav.appendChild(b);
    });
    return nav;
}

/** O que faz: os atalhos para as passagens, um botão cada ("passagem de 28/10"), com as datas na dica. */
function atalhosDasPassagens(ctx: Contexto, passagens: readonly Passagem[], comCidade: boolean): HTMLElement {
    const c = el(ctx.doc, 'div', 'chain', { 'data-atalhos': 'passagens' });
    for (const e of passagens) {
        const t = comCidade ? `${e.cidade} · ${rotuloDaPassagem(e)}` : rotuloDaPassagem(e);
        const b = botaoDeCorrente(ctx.doc, null, t, { 'data-goto': e.id });
        ctx.marcar(b, `${t}: ${datasDaPassagem(e)}`);
        c.appendChild(b);
    }
    return c;
}

/** O que faz: o rótulo do tipo de um lugar: o do seletor do Novo do ramo, ou o domínio do modelo. */
function rotuloDoDominio(ctx: Contexto, dominio: string | null): string {
    if (!dominio) return PAINEL.nota;
    return ctx.ramoPrincipal.novo.tipos.find(t => t.tipo === dominio)?.rotulo ?? dominio[0].toUpperCase() + dominio.slice(1);
}

/**
 * O que faz: o painel da cidade e o do país (G6), separados do da passagem e ligados por atalhos:
 * a cidade tem o país, um botão por passagem nela e as tarefas dos dias dela; o país tem um botão
 * por cidade, as passagens e, sem a nota, "Criar a nota" pelo Novo do tipo (o protocolo dono). Os
 * campos vêm do modelo do tipo, e o que o ramo sabe da nota (os detalhes, as ligadas) vem junto.
 * Por quê: C4 (o painel do país nem era clicável) e a proposta aprovada (o lugar em camadas).
 * Entra → sai: o contexto, o id, o lugar, o corpo e a cabeça → o corpo.
 * Erro e ataque: a cidade sem país e o país sem cidade dizem o que falta em palavras; nada inventado.
 */
function painelDoLugar(ctx: Contexto, id: string, lugar: LugarDoNo, corpo: HTMLElement, head: (t: string, k?: string, ico?: string) => void): HTMLElement {
    const { doc, modelo } = ctx;
    const nome = lugar.cidade?.nome ?? lugar.pais?.nome ?? '';
    head(nome, rotuloDoDominio(ctx, lugar.dominio), 'lugar');
    const tr = trilhaDoLugarEl(ctx, lugar, id);
    if (tr) corpo.appendChild(tr);
    const a = acoes(ctx, id, null) ?? secao(ctx, null);
    // O país sem nota: "Criar a nota" pelo Novo do tipo, com o nome já respondido (o protocolo dono, P10c).
    const modeloDoTipo = (modelo.indice.tabelas.tipos ?? []).find(m => m.dominio === lugar.dominio);
    if (!lugar.cidade && lugar.pais && !lugar.pais.nota && modeloDoTipo) {
        const novo = ctx.novoDoType?.(modeloDoTipo.candidatos.type) ?? null;
        const campo = modeloDoTipo.campos.find(c => c.tipo === 'texto' && c.obrigatorio)?.nome;
        if (novo) {
            let acts = a.querySelector('.acts') as HTMLElement | null;
            if (!acts) { acts = el(doc, 'div', 'acts'); a.appendChild(acts); }
            const b = botao(doc, 'btn primary', PAINEL.criarANota, { 'data-act': 'novo', 'data-tipo': novo.dominio, 'data-id': id, ...(campo ? { 'data-campo': campo } : {}), 'data-valor': lugar.pais.nome });
            ctx.marcar(b, PAINEL.dicaCriarANota(novo.titulo, lugar.pais.nome));
            // A nota que falta vem primeiro; o "+ Cidade" (o filho do tipo, 29/10) depois dela.
            acts.insertBefore(b, acts.firstChild);
        }
    }
    if (a.childElementCount) corpo.appendChild(a);
    if (lugar.cidade) {
        const sp = secao(ctx, PAINEL.pais);
        sp.appendChild(lugar.pais ? alvoDoLugar(ctx, lugar.pais.id, lugar.pais.nome) : valorEmSpan(ctx, PAINEL.paisADefinir, true));
        corpo.appendChild(sp);
        // As estadias da cidade (30/10), com e sem data; o "+ Estadia" está nas ações, pelo filho do tipo.
        const est = secao(ctx, PAINEL.estadias);
        est.setAttribute('data-secao', 'estadias');
        est.appendChild(lista(ctx, modelo.estadiasDaCidade(lugar.cidade.nome), PAINEL.semEstadiaNaCidade));
        corpo.appendChild(est);
    } else {
        const sc = secao(ctx, PAINEL.cidades);
        if (lugar.cidades.length) {
            const c = el(doc, 'div', 'chain', { 'data-atalhos': 'cidades-do-pais' });
            for (const x of lugar.cidades) {
                if (!x.id) { c.appendChild(el(doc, 'span', 'none', null, x.nome)); continue; }
                const b = botaoDeCorrente(doc, null, x.nome, { 'data-goto': x.id });
                ctx.marcar(b, PAINEL.dicaDoLugar(x.nome));
                c.appendChild(b);
            }
            sc.appendChild(c);
        } else sc.appendChild(el(doc, 'p', 'empty', null, PAINEL.semCidade));
        corpo.appendChild(sc);
    }
    const se = secao(ctx, PAINEL.passagens);
    se.appendChild(lugar.passagens.length ? atalhosDasPassagens(ctx, lugar.passagens, !lugar.cidade) : el(doc, 'p', 'empty', null, PAINEL.semPassagem));
    corpo.appendChild(se);
    // O que o ramo sabe da nota (os detalhes da fonte, as que a seguem), sem repetir as cidades.
    const det = modelo.detalhe(id);
    if (det?.linhas.length && det.nota) { const s = secao(ctx, 'Detalhes'); s.appendChild(campos(ctx, det.linhas)); corpo.appendChild(s); }
    const ligadas = (det?.ligadas ?? []).filter(n => !lugar.cidades.some(c => c.id === n.id));
    if (ligadas.length) { const s = secao(ctx, 'Ligadas'); for (const n of ligadas) s.appendChild(noEl(ctx, n, { compacto: true })); corpo.appendChild(s); }
    // As tarefas dos dias das passagens (a cidade e o país), como no painel da passagem.
    const ids = new Set(lugar.passagens.flatMap(e => [...modelo.linhagem(e.id, 'dia')]));
    const nos = modelo.indice.vivas.filter(x => ids.has(x.id)).map(x => modelo.noDaTarefaNoPainel(x));
    if (nos.length) { const s = secao(ctx, lugar.cidade ? PAINEL.tarefasNaCidade : PAINEL.tarefasNoPais); s.appendChild(lista(ctx, nos, FRASES.semTarefas)); corpo.appendChild(s); }
    corpo.append(...secoesDosCampos(ctx, id, SO_LEITURA));
    return corpo;
}

/**
 * O que faz: o conteúdo do painel de um nó: o corpo do tipo dele e, no fim, as conexões (P10c),
 * sem repetir os nós que o corpo já oferece.
 * Entra → sai: o contexto e o id → o elemento; id que o modelo não conhece dá o aviso.
 */
export function conteudoDoPainel(ctx: Contexto, id: string): HTMLElement {
    const corpo = corpoDoPainel(ctx, id);
    const sr = secaoDaReputacao(ctx, id);
    if (sr) corpo.appendChild(sr);
    const sp = secaoDosProtocolos(ctx, id);
    if (sp) corpo.appendChild(sp);
    const ja = new Set<string>([id]);
    for (const e of Array.from(corpo.querySelectorAll('[data-goto], [data-node]'))) {
        const x = e.getAttribute('data-goto') ?? e.getAttribute('data-node');
        if (x) ja.add(x);
    }
    const cx = secaoDasConexoes(ctx, id, ja);
    if (cx) corpo.appendChild(cx);
    return corpo;
}

/**
 * O que faz: o painel de uma nota que não é nó da linha do tempo (P10c: aberta por uma conexão):
 * o nome, "Abrir a nota" e os campos pelo modelo do tipo dela (ou o frontmatter, para ler).
 * Entra → sai: o contexto, o id (`n:<caminho>`), o corpo e a cabeça → o corpo.
 */
function painelDaNota(ctx: Contexto, id: string, corpo: HTMLElement, head: (t: string, k?: string) => void): HTMLElement {
    const caminho = id.slice(2);
    const fm = ctx.camposDaNota(caminho);
    const tipoDaNota = typeof fm?.type === 'string' && fm.type.trim() ? rotuloDoType(ctx, fm.type.trim()) : PAINEL.nota;
    head(caminho.slice(caminho.lastIndexOf('/') + 1).replace(/\.md$/, ''), tipoDaNota === PAINEL.outrasNotas ? PAINEL.nota : tipoDaNota);
    const a = acoes(ctx, id, null);
    if (a) corpo.appendChild(a);
    corpo.append(...secoesDosCampos(ctx, id, SO_LEITURA));
    return corpo;
}

/** O que faz: o corpo do painel de um nó (a cabeça, as ações, as seções do tipo dele). */
function corpoDoPainel(ctx: Contexto, id: string): HTMLElement {
    const { doc, modelo } = ctx;
    const { indice } = modelo;
    const corpo = el(doc, 'div', 'dpanel');
    const [tipo, ic] = TIPO_DO_ID[id.slice(0, 2)] ?? ['Nó', 'acao'];
    const head = (titulo: string, kind = tipo, ico = ic) => {
        const dh = el(doc, 'div', 'dh');
        const box = el(doc, 'div', 'dh-txt');
        const k = el(doc, 'div', 'kind');
        k.appendChild(icone(doc, ico));
        k.append(kind);
        box.appendChild(k);
        box.appendChild(el(doc, 'h2', 'dr-title', null, titulo));
        dh.appendChild(box);
        const x = botao(doc, 'x', '×', { 'data-act': 'close' });
        ctx.marcar(x, 'Fechar o painel', 'Esc');
        dh.appendChild(x);
        corpo.appendChild(dh);
        // O estado e o ⋯ Status embaixo do título (02/11), no mesmo lugar em todo nó com estados; e de onde veio.
        const st = linhaDoEstado(ctx, id);
        if (st) corpo.appendChild(st);
        // Os sinais logo abaixo do título, em todo tipo (06/11, a simetria): no fim de um painel longo, o sinal da
        // pesquisa sem a conferência ficava fora da vista.
        sinaisDoNo(ctx, id, corpo);
    };

    const t = indice.porId.get(id);
    if (t) {
        head(t.titulo);
        const a = acoes(ctx, id, t);
        if (a) corpo.appendChild(a);
        // G5 (C6.4): a SMART mostra os campos dela primeiro (o essencial do tipo, na primeira vista).
        const camposPrimeiro = t.tipo !== 'acao';
        if (camposPrimeiro) corpo.append(...secoesDosCampos(ctx, id, 'Só leitura aqui: para mudar, abra no TaskNotes.'));
        if (ctx.gravar) { const f = secaoDeAcoes(ctx, t); if (f) corpo.appendChild(f); }
        const lin = secao(ctx, 'Linhagem'); lin.appendChild(linhagemDaTarefa(ctx, t)); corpo.appendChild(lin);
        const tem = secao(ctx, 'Tempo'); tem.appendChild(tempoDaTarefa(ctx, t)); corpo.appendChild(tem);
        // O ramo da tarefa (29/10): a tarefa mãe, as subtarefas e a checklist da nota, como nós.
        corpo.append(...subtarefasDaTarefa(ctx, t));
        const ck = checklistDaTarefa(ctx, t);
        if (ck) corpo.appendChild(ck);
        const pq = porQueAgora(ctx, t);
        if (pq) corpo.appendChild(pq);
        if (ctx.gravar && !t.feita) {
            corpo.appendChild(secaoMoverPara(ctx, t));
            const l = secaoDeLigacoes(ctx, t);
            if (l) corpo.appendChild(l);
        }
        if (t.tipo === 'smart') {
            const filhos = indice.vivas.filter(x => x.smart === t.id).map(x => ctx.modelo.noDaTarefaNoPainel(x));
            const no = ctx.modelo.noDaTarefaNoPainel(t);
            const sec = secao(ctx, 'Ações ligadas');
            // "sem ações ligadas" uma vez só (C6.5): a linha com os traços só quando há ação.
            if (filhos.length) {
                const p = el(doc, 'p', 'big-line');
                const tr = tracos(doc, no.contagens, 16);
                if (tr) p.append(tr, ' ');
                p.append(no.linha);
                sec.appendChild(p);
            }
            sec.appendChild(lista(ctx, filhos, FRASES.semAcoesLigadas));
            corpo.appendChild(sec);
        }
        if (!camposPrimeiro) corpo.append(...secoesDosCampos(ctx, id, 'Só leitura aqui: para mudar, abra no TaskNotes.'));
        return corpo;
    }

    const proj = indice.projetos.get(id);
    if (proj) {
        head(proj.nome, proj.tipo === 'departamento' ? 'Departamento' : 'Projeto');
        const a = acoes(ctx, id, null);
        if (a) corpo.appendChild(a);
        const papel = proj.papel === 'central' ? 'central da Temporada' : proj.papel === 'auxiliar' ? `auxiliar de ${proj.central}` : proj.encerrado ? 'encerrado' : 'fora da Temporada';
        const sp = secao(ctx, 'Papel');
        sp.appendChild(cadeia(ctx, [papel, 'sep', [idDaArea(proj.area), proj.area], ...(proj.estado ? ['dot', proj.estado.rotulo] : [])]));
        corpo.appendChild(sp);
        corpo.append(...secoesDosCampos(ctx, id, SO_LEITURA));
        const q = chaveDeHoje('trimestre', modelo.hoje);
        const no = ctx.modelo.noDoProjetoNoPainel(id, { escala: 'trimestre', chave: q });
        if (no) {
            const sq = secao(ctx, `No trimestre ${q}`);
            const p = el(doc, 'p', 'big-line');
            const tr = tracos(doc, no.contagens, 18);
            if (tr) p.append(tr, ' ');
            p.append(no.linha);
            sq.appendChild(p);
            // A central: o ramo inteiro (ela e os auxiliares), pela mesma conta.
            if (no.doRamo) {
                const pr = el(doc, 'p', 'big-line');
                const trr = tracos(doc, no.doRamo.contagens, 18);
                if (trr) pr.append(trr, ' ');
                pr.append(`Ramo: ${no.doRamo.linha}`);
                sq.appendChild(pr);
            }
            corpo.appendChild(sq);
        }
        const px = proximaDoProjeto(ctx, id);
        if (px) corpo.appendChild(px);
        const ap = aprendizadoDoModulo(ctx, id);
        if (ap) corpo.appendChild(ap);
        const aux = [...indice.projetos.values()].filter(x => x.papel === 'auxiliar' && x.central === proj.nome);
        if (aux.length) { const s = secao(ctx, 'Auxiliares'); s.appendChild(cadeia(ctx, aux.map(x => [x.id, x.nome] as [string, string]))); corpo.appendChild(s); }
        const tarefas = indice.vivas.filter(x => x.projeto === id).sort((x, y) => (x.tipo === y.tipo ? (x.feita === y.feita ? 0 : x.feita ? 1 : -1) : x.tipo === 'smart' ? -1 : 1)).slice(0, 40);
        const sl = secao(ctx, 'SMART e ações');
        sl.appendChild(lista(ctx, tarefas.map(x => ctx.modelo.noDaTarefaNoPainel(x)), FRASES.semTarefas));
        corpo.appendChild(sl);
        return corpo;
    }

    const area = indice.areas.get(id);
    if (area) {
        head(area.nome);
        const a = acoes(ctx, id, null);
        if (a) corpo.appendChild(a);
        corpo.append(...secoesDosCampos(ctx, id, SO_LEITURA));
        const s = secao(ctx, 'Frentes');
        s.appendChild(lista(ctx, area.projetos.map(pid => ctx.modelo.noDoProjetoNoPainel(pid, null)).filter((n): n is MissaoNo => !!n), FRASES.semFrentes));
        corpo.appendChild(s);
        return corpo;
    }

    const pessoa = id.startsWith(PREFIXO_DA_PESSOA) ? modelo.pessoa(id) : null;
    if (pessoa) {
        head(pessoa.pessoa.nome);
        const a = acoes(ctx, id, null);
        if (a) corpo.appendChild(a);
        const s = secao(ctx, REGISTRO.noRegistro);
        s.appendChild(el(doc, 'p', 'big-line', null, linhaDaPessoa(pessoa.dias)));
        if (pessoa.dias.length) s.appendChild(cadeia(ctx, pessoa.dias.slice(0, 12).map(d => [`d:${d}`, `${diaDaSemana(d)} ${diaMes(d)}`] as [string, string])));
        s.appendChild(el(doc, 'p', 'hint', null, REGISTRO.dicaDaPessoa));
        corpo.appendChild(s);
        corpo.append(...secoesDosCampos(ctx, id, SO_LEITURA));
        return corpo;
    }

    const passagem = modelo.passagens.find(e => e.id === id);
    if (passagem) {
        head(passagem.cidade);
        const lugar = modelo.lugarDoNo(id);
        const tr = lugar ? trilhaDoLugarEl(ctx, lugar, id) : null;
        if (tr) corpo.appendChild(tr);
        const a = acoes(ctx, id, null);
        if (a) corpo.appendChild(a);
        // G6: a passagem é separada da cidade, com os atalhos para a cidade e para o país; os campos
        // da nota da cidade ficam no painel da cidade.
        const se = secao(ctx, 'Passagem');
        const f = el(doc, 'div', 'fields');
        linhaDeCampo(ctx, f, PAINEL.pais, lugar?.pais ? alvoDoLugar(ctx, lugar.pais.id, lugar.pais.nome) : valorEmSpan(ctx, PAINEL.paisADefinir, true));
        linhaDeCampo(ctx, f, PAINEL.cidade, alvoDoLugar(ctx, lugar?.cidade?.id ?? null, passagem.cidade));
        linhaDeCampo(ctx, f, PAINEL.chegada, valorEmSpan(ctx, diaPorExtenso(passagem.de)));
        linhaDeCampo(ctx, f, PAINEL.saida, valorEmSpan(ctx, passagem.ate ? diaPorExtenso(passagem.ate) : PAINEL.aberta, !passagem.ate));
        linhaDeCampo(ctx, f, PAINEL.registro, valorEmSpan(ctx, passagem.fonte === 'dia' ? 'pela Day da chegada' : 'pela nota da cidade'));
        se.appendChild(f);
        corpo.appendChild(se);
        // As estadias que caem nos dias da passagem (30/10): as notas do lugar onde se fica, com o estado no cartão.
        const est = secao(ctx, PAINEL.estadias);
        est.setAttribute('data-secao', 'estadias');
        est.appendChild(lista(ctx, modelo.estadiasDaPassagem(id), PAINEL.semEstadiaNaPassagem));
        corpo.appendChild(est);
        // O que saiu na passagem (P10b, §8.10): a soma das Days dela, os dias sem valor em palavras, e a reserva.
        const custo = modelo.custoDaPassagem(id);
        if (custo) {
            const sd = secao(ctx, 'Dinheiro da passagem');
            sd.appendChild(el(doc, 'p', 'big-line', null, custo.texto));
            if (custo.reserva) sd.appendChild(el(doc, 'p', 'rw-line', null, `${modelo.reserva.rotulo}: ${custo.reserva}`));
            sd.appendChild(el(doc, 'p', 'hint', null, 'Pelo que entrou e saiu em cada Day da passagem; nada é estimado.'));
            corpo.appendChild(sd);
        }
        const daPassagem = modelo.pessoasDoLugar(id);
        if (daPassagem.length) { const sp = secao(ctx, REGISTRO.pessoasDaPassagem); sp.appendChild(filaDePessoas(ctx, daPassagem)); corpo.appendChild(sp); }
        const ids = modelo.linhagem(id, 'dia');
        const nos = indice.vivas.filter(x => ids.has(x.id)).map(x => ctx.modelo.noDaTarefaNoPainel(x));
        const s = secao(ctx, 'Tarefas nesse lugar');
        s.appendChild(lista(ctx, nos, FRASES.semTarefas));
        corpo.appendChild(s);
        return corpo;
    }

    if (id === VISAO_ID) {
        head('Visão de longo prazo');
        const a = acoes(ctx, id, null);
        if (a) corpo.appendChild(a);
        // G5 (C7): a visão e o longo prazo separados, cada um com o seu rótulo.
        const s = secao(ctx, PAINEL.aVisao);
        s.appendChild(el(doc, 'p', 'big-line', null, modelo.visao.linha));
        // Sem visão escrita (P10, §8.2): o 🔭 com o horizonte já respondido, onde a Missão grava.
        const oferta = modelo.visao.oferta;
        const doPapel = oferta ? ctx.protocoloDoPapel?.(oferta.papel) ?? null : null;
        if (oferta && doPapel && ctx.gravar) {
            const nome = ctx.nomeDoProtocolo?.(doPapel) || 'o protocolo da visão';
            const b = botao(doc, 'btn primary', `${nome} · ${oferta.horizonte}`, { 'data-act': 'oferta' });
            ctx.marcar(b, `${nome}: escrever a visão, com o horizonte de ${oferta.horizonte} já respondido`);
            s.appendChild(b);
        }
        if (modelo.visao.historico.length) s.appendChild(el(doc, 'p', 'hint', null, `Versões anteriores: ${modelo.visao.historico.join(', ')}`));
        corpo.appendChild(s);
        // O ciclo longo ativo (§8.2): "Longo prazo", com a nota dele.
        const lp = modelo.visao.longoPrazo;
        if (lp) {
            const sl = secao(ctx, PAINEL.longoPrazo);
            sl.appendChild(el(doc, 'p', 'hint', null, PAINEL.dicaDoLongoPrazo));
            const acts = el(doc, 'div', 'acts');
            const b = botao(doc, 'btn', lp.nome, { 'data-open': 'nota', 'data-path': lp.nota });
            ctx.marcar(b, `Longo prazo: abrir ${lp.nome} numa aba`);
            acts.appendChild(b);
            if (lp.canvas) {
                const c = botao(doc, 'btn', PAINEL.canvasDoLongoPrazo, { 'data-open': 'nota', 'data-path': lp.canvas });
                ctx.marcar(c, `Longo prazo: abrir o canvas de ${lp.nome} numa aba`);
                acts.appendChild(c);
            }
            sl.appendChild(acts);
            // Os campos do longo prazo (sem modelo de tipo ainda): o frontmatter, para ler, dentro da seção dele.
            const cru = camposDaNotaSemModelo(ctx, ctx.camposDaNota(lp.nota), PAINEL.semModelo);
            if (cru) sl.appendChild(cru);
            corpo.appendChild(sl);
        }
        corpo.append(...secoesDosCampos(ctx, id, SO_LEITURA));
        return corpo;
    }

    const periodo = periodoDoId(id);
    if (periodo) {
        const linha = modelo.linha(periodo.escala, periodo.chave);
        const c = linha.centro;
        head(periodo.escala === 'semana' && !isChaveEspecial(periodo.chave) ? `${c.titulo} · ${(c.sub ?? '').split(' · ')[0]}` : c.titulo);
        const a = acoes(ctx, id, null);
        if (a) corpo.appendChild(a);
        const s = secao(ctx, 'Linha');
        const p = el(doc, 'p', 'big-line');
        const tr = tracos(doc, c.contagens, 18);
        if (tr) p.append(tr, ' ');
        p.append(c.linha);
        s.appendChild(p);
        // A legenda dos traços da forma de mostrar (C5: apareciam sem legenda no painel).
        if (tr) s.appendChild(el(doc, 'p', 'hint', null, PAINEL.legendaDosTracos));
        // O texto de baixo do centro (o Tema no trimestre) não se repete quando os Campos já o mostram (C5).
        const camposDoPeriodo = secoesDosCampos(ctx, id, SO_LEITURA);
        const nosCampos = new Set(camposDoPeriodo.flatMap(x => Array.from(x.querySelectorAll('.ro')).map(r => r.textContent ?? '')));
        if (c.sub && !nosCampos.has(c.sub)) s.appendChild(el(doc, 'p', 'hint', null, c.sub));
        for (const m of c.marcas ?? []) s.appendChild(el(doc, 'p', 'hint', null, m));
        corpo.appendChild(s);
        // G3: o dinheiro do período numa seção própria (com a reserva e o "Informar saldo" no trimestre de hoje).
        const din = linha.especial ? null : dinheiroDoPeriodo(ctx, periodo.escala, periodo.chave, linha.dinheiro);
        if (din) corpo.appendChild(din);
        // G5: as semanas do trimestre, um botão cada, com a de agora marcada.
        const semanas = !linha.especial && periodo.escala === 'trimestre' ? semanasDoPeriodo(ctx, periodo.chave) : null;
        if (semanas) corpo.appendChild(semanas);
        if (!linha.especial) {
            const st = secao(ctx, 'Tempo');
            const itens: Array<[string, string] | 'sep' | 'dot' | string> = [];
            for (const n of linha.asa) { if (itens.length) itens.push('sep'); itens.push([n.id, n.titulo]); }
            if (linha.lugar.passagens.length) { itens.push('dot'); for (const e of linha.lugar.passagens) itens.push([e.id, e.cidade]); }
            if (itens.length) { st.appendChild(cadeia(ctx, itens)); corpo.appendChild(st); }
        }
        // Os botões do ciclo do período (o protótipo, template 2276–2286): todos juntos aqui.
        // G2 (29/10): à esquerda e rotulados, os do começo e os do fim, pela linha de campo única.
        const comeco = cicloEl(ctx, periodo.escala, periodo.chave, 'inicio');
        const fim = cicloEl(ctx, periodo.escala, periodo.chave, 'fim');
        // O que o ▶️ gravou e o que o 🌙 deixou para hoje (02/11), ao lado dos botões que os gravam.
        const doDia = !linha.especial && periodo.escala === 'dia' ? modelo.doDia?.(periodo.chave) ?? null : null;
        if (comeco || fim || doDia?.comando || doDia?.deixado) {
            const sc = secao(ctx, 'Ciclo');
            sc.setAttribute('data-secao', 'ciclo');
            const f = el(doc, 'div', 'fields');
            if (doDia?.deixado) linhaDeCampo(ctx, f, doDia.deixado.rotulo, valorDaTarefaOuTexto(ctx, doDia.deixado.tarefa, doDia.deixado.texto));
            if (comeco) linhaDeCampo(ctx, f, PAINEL.cicloComeco, comeco);
            const cmd = doDia?.comando;
            if (cmd?.acao || cmd?.tarefa) linhaDeCampo(ctx, f, PAINEL.comandoAcao, valorDaTarefaOuTexto(ctx, cmd.tarefa, cmd.acao));
            if (cmd?.suficiente) linhaDeCampo(ctx, f, PAINEL.comandoSuficiente, valorEmSpan(ctx, cmd.suficiente));
            if (cmd?.valor) linhaDeCampo(ctx, f, PAINEL.comandoValor, valorEmSpan(ctx, cmd.valor));
            if (cmd?.compromisso) linhaDeCampo(ctx, f, PAINEL.comandoCompromisso, valorEmSpan(ctx, cmd.compromisso));
            if (fim) linhaDeCampo(ctx, f, PAINEL.cicloFim, fim);
            sc.appendChild(f);
            corpo.appendChild(sc);
        }
        // O registro do dia e o saldo do trimestre (P9), pelo registro do ramo.
        const registro = linha.especial ? null : periodo.escala === 'dia' ? registroDoDia(ctx, periodo.chave) : null;
        if (registro) corpo.appendChild(registro);
        corpo.append(...camposDoPeriodo);
        if (linha.habitos.length && ctx.ramoPrincipal.centro.habitos !== false) {
            const sh = secao(ctx, 'Hábitos do dia');
            const fh = campos(ctx, linha.habitos.map(h => [h.titulo, h.vezes ? `${h.vezes} ${h.vezes === 1 ? 'vez' : 'vezes'}` : 'sem marca'] as [string, string]));
            fh.classList.add('f-habitos');
            sh.appendChild(fh);
            corpo.appendChild(sh);
        }
        if (linha.trimestres.length) { const sq = secao(ctx, 'Trimestres'); sq.appendChild(lista(ctx, linha.trimestres, '')); corpo.appendChild(sq); }
        const nos = [...linha.smarts, ...linha.faixas.flatMap(f => f.nos), ...linha.pendentes.flatMap(f => f.nos)];
        const sl = secao(ctx, 'Tarefas');
        sl.appendChild(lista(ctx, nos, FRASES.semTarefas));
        corpo.appendChild(sl);
        return corpo;
    }

    // G6: a cidade e o país têm o painel deles em qualquer ramo, com os atalhos entre as camadas.
    const lugar = modelo.lugarDoNo(id);
    if (lugar && !lugar.passagem) return painelDoLugar(ctx, id, lugar, corpo, head);
    const det = modelo.detalhe(id);
    if (det) return painelDoDetalhe(ctx, id, det, corpo, head);
    // A nota que a Missão não mostra na linha do tempo (P10c): o painel dela, se ela existe.
    if (id.startsWith('n:') && ctx.ligacoesDaNota?.(id.slice(2))) return painelDaNota(ctx, id, corpo, head);

    head('Nó');
    corpo.appendChild(el(doc, 'p', 'hint', null, 'Este nó não está mais no modelo (a nota mudou ou saiu).'));
    return corpo;
}

/**
 * O que faz: a seção "Protocolos" de um nó (a peça 2b, 30/10, o núcleo do P13): os donos dos campos, os que
 * criam ou revisam o tipo e os que rodaram na nota, na ordem dos pesos; cada um na linha de campo única, com
 * o papel à esquerda, o botão que o abre com o contexto do nó e o porquê embaixo.
 * Entra → sai: o contexto e o id → a seção, ou `null` (o lugar não roda protocolos, ou o nó não tem nenhum).
 */
function secaoDosProtocolos(ctx: Contexto, id: string): HTMLElement | null {
    if (!ctx.rodaProtocolo || !ctx.protocolosDoNo) return null;
    const lista = ctx.protocolosDoNo(id);
    const lendo = lista === null && !!ctx.lendoProtocolos?.(id);
    if (lista === null && !lendo) return null;
    if (lista && !lista.length) return null;
    const s = secao(ctx, PROTOCOLOS.titulo);
    s.setAttribute('data-secao', 'protocolos');
    if (lendo || !lista) { s.appendChild(el(ctx.doc, 'p', 'hint', null, PROTOCOLOS.lendo)); return s; }
    const f = el(ctx.doc, 'div', 'fields');
    lista.forEach((p, i) => {
        const nome = ctx.nomeDoProtocolo?.(p.id) || p.id;
        const b = botao(ctx.doc, 'btn', nome, { 'data-act': 'protocolo-do-no', 'data-id': id, 'data-i': String(i), 'data-protocolo': p.id });
        ctx.marcar(b, PROTOCOLOS.dica(nome));
        const papel = PAPEIS[p.papeis[0]];
        linhaDeCampo(ctx, f, papel[0].toUpperCase() + papel.slice(1), b, { origem: p.porque });
    });
    s.appendChild(f);
    s.appendChild(el(ctx.doc, 'p', 'hint', null, PROTOCOLOS.rodape));
    return s;
}

/**
 * O que faz: a linha "Reputação" de um nó (o acabamento, 30/10), na linha de campo única: o nível e,
 * embaixo, o porquê pelos fatos (as passagens, a última, as células). Só de leitura.
 * Por quê: uma linha Reputação no painel do nó, com o nível e o porquê (proposta, 29/10); a
 * reputação é da função no uso, nunca da pessoa, e só o nó cuja nota é uma função a tem.
 * Entra → sai: o contexto e o id → a seção, ou `null` (o nó sem reputação, ou ainda lendo).
 */
function secaoDaReputacao(ctx: Contexto, id: string): HTMLElement | null {
    const r = ctx.reputacaoDoNo?.(id) ?? null;
    if (!r) return null;
    const s = secao(ctx, null);
    s.setAttribute('data-secao', 'reputacao');
    const f = el(ctx.doc, 'div', 'fields');
    linhaDeCampo(ctx, f, REPUTACAO.rotulo, valorEmSpan(ctx, r.nivel), { origem: r.porque });
    s.appendChild(f);
    s.appendChild(el(ctx.doc, 'p', 'hint', null, REPUTACAO.dica));
    return s;
}

/**
 * O que faz: a seção Aprendizado do painel do módulo (05/11, o módulo de idiomas): a fila de hoje (as revisões
 * vencidas e a nova, cada cartão com o porquê), o nível em curso na forma de mostrar, com os traços e os usos de
 * campo, os outros níveis e as peças do nível. O gesto do dia é o botão da seção Protocolos (o modelo do tipo).
 * Entra → sai: o contexto e o id → a seção, ou `null` (o módulo sem notas de aprendizado).
 */
function aprendizadoDoModulo(ctx: Contexto, id: string): HTMLElement | null {
    const c = ctx.modelo.aprendizadoDoProjeto?.(id) ?? null;
    if (!c) return null;
    const { doc } = ctx;
    const s = secao(ctx, APRENDIZADO.secao);
    s.setAttribute('data-secao', 'aprendizado');
    const notaNo = (caminho: string, titulo: string, linha: string): MissaoNo => ({ id: `n:${caminho}`, tipo: 'nota', titulo, linha, ramo: -1 });
    s.appendChild(el(doc, 'p', 'big-line', null, `${APRENDIZADO.hoje}: ${c.linhaDaFila}`));
    if (c.fila.length) s.appendChild(lista(ctx, c.fila.map(i => notaNo(i.caminho, i.nome, i.motivo)), APRENDIZADO.filaVazia));
    s.appendChild(el(doc, 'p', 'hint', null, APRENDIZADO.dicaDaFila));
    if (c.nivel) {
        const p = el(doc, 'p', 'big-line');
        const tr = tracos(doc, c.nivel.contagens, 18);
        if (tr) p.append(tr, ' ');
        p.append(`${APRENDIZADO.nivel(c.nivel.nivel)}: ${c.nivel.linha}${c.nivel.usos ? ` · ${APRENDIZADO.usos(c.nivel.usos)}` : ''}`);
        s.appendChild(p);
    }
    if (c.niveis.length > 1) {
        const f = el(doc, 'div', 'fields');
        for (const n of c.niveis) linhaDeCampo(ctx, f, n.nivel, valorEmSpan(ctx, n.linha));
        s.appendChild(el(doc, 'p', 'hint', null, APRENDIZADO.niveis));
        s.appendChild(f);
    }
    if (c.pecas.length) {
        s.appendChild(el(doc, 'p', 'hint', null, APRENDIZADO.pecas));
        s.appendChild(lista(ctx, c.pecas.map(x => notaNo(x.caminho, x.nome, c.nivel?.nivel ?? '')), ''));
    }
    return s;
}

/** O que faz: a escala e a linha onde um nó do painel mora, para "ir até" ele. */
export function linhaDoNoPainel(ctx: Contexto, id: string, escala: Escala): { escala: Escala; chave: string } | null {
    const periodo = periodoDoId(id);
    if (periodo) return periodo;
    const k = ctx.modelo.linhaDoNo(id, escala);
    return k ? { escala, chave: k } : null;
}
