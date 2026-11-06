/**
 * O painel do nó que edita (P6): as ações da tarefa, o "Mover para…", as ligações e os
 * campos diretos do modelo do tipo.
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, §4.4, §9.3) e o protótipo aprovado
 * (template, 1571–1639, 2463–2515): 🤝 Fazer agora e ○ Concluir; na tarefa que ficou de
 * antes, sem data ou de algum dia, "Nova data · Algum dia · Cancelar"; todo arrasto tem um
 * caminho pelo teclado ou pelo menu ("Mover para…", "Ligar a uma ação", "Desligar"); os
 * campos com `dono: nota` se editam no lugar, pelo tipo e pelo formato do modelo, e a
 * prioridade aparece pelo rótulo do catálogo do TaskNotes, nunca pelo valor cru.
 *
 * Só desenha: os gestos saem como `data-act` (e `data-campo-edit` nos campos), que o
 * componente trata e grava. Nenhum nome de tipo nem de campo mora aqui (§3.8): o que se
 * edita e como vem do modelo do tipo (`comoEdita`) e do catálogo.
 */
import { camposComApelidos, camposNoFormato, type DomainField } from '../../engine/domainModel';
import { comoEdita } from '../../engine/fieldModel';
import { CAMPO_DA_ORIGEM, campoDoEstado, camposDoNo, linksDoCampo, modeloDaNota, mostraCampos, valorEmTexto, type RotulosDosVocabularios } from '../camposDoNo';
import { acoesParaLigar, ligacoesDoNo, opcoesDeMover, ORDEM_DOS_GRUPOS } from '../intencoes';
import type { MissaoTarefa } from '../tipos';
import { periodoDoId } from '../tempo';
import { ADICIONAR, PAINEL, STATUS } from '../frases';
import { el, botao } from './dom';
import { botaoDoCiclo } from './nos';
import type { Contexto } from './contrato';
import { botaoDoStatus, caixaDeMarcas, caixaDoCampo, estadoDoNo, linhaDeCampo, rotulosDoCatalogo, valorDeLinks, valorEmSpan, type EstadoDoNo } from './campos';

function secao(ctx: Contexto, titulo: string): HTMLElement {
    const s = el(ctx.doc, 'div', 'dsec');
    s.appendChild(el(ctx.doc, 'h3', null, null, titulo));
    return s;
}

function btn(ctx: Contexto, cls: string, texto: string, attrs: Record<string, string>, dica: string, tecla?: string): HTMLButtonElement {
    const b = botao(ctx.doc, cls, texto, attrs);
    ctx.marcar(b, dica, tecla);
    return b;
}

/* ------------------------------------------------------------ o menu de status (02/11) */

/** O que faz: uma linha do menu (`.mi`, como o ⋯ do topo), com a dica. */
function itemDoMenu(ctx: Contexto, texto: string, attrs: Record<string, string>, dica: string, cls = 'mi'): HTMLButtonElement {
    return btn(ctx, cls, texto, { role: 'menuitem', ...attrs }, dica);
}

/**
 * O que faz: o menu de status de um nó, no painel, embaixo do botão: os estados da tabela pelo ciclo
 * (Planejar: os do tempo e algum dia, e o "Mover para…" da tarefa; Executar: o 🤝 Fazer agora e a
 * conclusão; Fechar: o de fora e o Arquivar da TaskNote), e por último, separado, o "Excluir…", que
 * pergunta na mesma caixa antes de mandar a nota para a lixeira (com quantas notas apontam para ela).
 * Por quê: um lugar por ação (02/11/2026): o que muda o estado mora aqui, e o que já existia em outro
 * lugar (o 🤝, o "Mover para…") é o mesmo gesto, ligado daqui; nada grava por caminho novo.
 * Entra → sai: o contexto e o estado do nó → o menu, ou `null` (fechado).
 */
export function menuDoStatus(ctx: Contexto, e: EstadoDoNo): HTMLElement | null {
    const modo = ctx.menuDoStatus?.(e.id) ?? null;
    if (!modo) return null;
    const { doc } = ctx;
    const box = el(doc, 'div', 'st-menu', { role: 'menu', 'aria-label': STATUS.dica(e.titulo), 'data-menu-status': '', 'data-id': e.id });
    if (modo === 'confirmar') {
        box.setAttribute('role', 'alertdialog');
        box.appendChild(el(doc, 'p', 'st-pergunta', null, STATUS.pergunta(e.titulo)));
        const entram = ctx.ligacoesDaNota?.(e.nota)?.entram.length ?? 0;
        box.appendChild(el(doc, 'p', 'hint', { 'data-links': String(entram) }, entram ? STATUS.links(entram) : STATUS.semLinks));
        const acts = el(doc, 'div', 'acts');
        acts.appendChild(btn(ctx, 'btn st-perigo', STATUS.confirmar, { 'data-act': 'status-excluir-ok', 'data-id': e.id, 'data-path': e.nota }, STATUS.dicaExcluir(e.titulo)));
        acts.appendChild(btn(ctx, 'btn', STATUS.naoExcluir, { 'data-act': 'status-excluir-nao', 'data-id': e.id }, STATUS.naoExcluir));
        box.appendChild(acts);
        return box;
    }
    const t = e.tarefa;
    const aberta = !!t && !t.feita;
    // O "Mover para…" leva à caixa do dia e da hora do painel, que só a ação tem (o da SMART é a semana).
    const daAcao = aberta && t!.tipo === 'acao';
    for (const grupo of ORDEM_DOS_GRUPOS) {
        const linhas: HTMLElement[] = [];
        for (const o of e.opcoes.filter(x => x.grupo === grupo)) {
            // Na TaskNote aberta, o 🤝 vem antes da conclusão (o executar começa por ele), como na seção Fazer.
            if (o.conclui && aberta) linhas.push(itemDoMenu(ctx, STATUS.fazerAgora, { 'data-act': 'agora', 'data-id': e.id }, `${STATUS.fazerAgora}: ${e.titulo}`));
            const attrs: Record<string, string> = { 'data-act': 'status-ir', 'data-id': e.id, 'data-path': e.nota, 'data-valor': o.valor, 'data-rotulo': o.rotulo, 'aria-pressed': String(o.atual) };
            if (o.conclui && t) attrs['data-conclui'] = 'sim';
            if (e.campo) attrs['data-campo'] = e.campo.nome;
            const dica = o.conclui && t ? STATUS.dicaDoConcluir(e.titulo) : o.neutro ? STATUS.dicaDoNeutro(o.rotulo, e.titulo) : STATUS.dicaDoEstado(o.rotulo, e.titulo);
            const b = itemDoMenu(ctx, o.atual ? STATUS.agora(o.rotulo) : o.rotulo, attrs, dica);
            if (o.atual) b.setAttribute('disabled', '');
            linhas.push(b);
        }
        if (grupo === 'planejar' && daAcao) linhas.push(itemDoMenu(ctx, STATUS.remarcar, { 'data-act': 'mover-para', 'data-id': e.id }, STATUS.dicaRemarcar));
        if (grupo === 'fechar' && t && ctx.arquivar) {
            const arquivada = !!ctx.arquivada?.(t.caminho);
            linhas.push(itemDoMenu(ctx, arquivada ? STATUS.desarquivar : STATUS.arquivar, { 'data-act': 'status-arquivar', 'data-id': e.id, 'data-path': t.caminho, 'data-sim': arquivada ? 'nao' : 'sim' }, arquivada ? STATUS.dicaDesarquivar(e.titulo) : STATUS.dicaArquivar(e.titulo)));
        }
        if (!linhas.length) continue;
        box.appendChild(el(doc, 'div', 'mgrp', { role: 'presentation' }, STATUS.grupos[grupo]));
        box.append(...linhas);
    }
    if (ctx.excluir) {
        box.appendChild(el(doc, 'div', 'st-sep', { role: 'separator' }));
        box.appendChild(itemDoMenu(ctx, STATUS.excluir, { 'data-act': 'status-excluir', 'data-id': e.id, 'data-path': e.nota }, STATUS.dicaExcluir(e.titulo), 'mi st-perigo'));
    }
    return box;
}

/**
 * O que faz: a linha do estado embaixo do título do painel: o estado de agora, o "⋯ Status" e, aberto, o
 * menu; na nota que diz de onde veio (o campo da origem do modelo), "Veio de: …", com o nome do
 * protocolo quando é um.
 * Por quê: o mesmo lugar em todo nó que tem estados (a simetria, 02/11), e quem usa vê de onde veio a tarefa
 * (02/11: uma tarefa que o agente pôs pode não fazer sentido).
 * Entra → sai: o contexto e o id → a linha, ou `null` (sem estado e sem origem).
 */
export function linhaDoEstado(ctx: Contexto, id: string): HTMLElement | null {
    const e = estadoDoNo(ctx, id);
    let nota: string | null = null;
    try { nota = ctx.modelo.arquivos(id).nota; } catch { nota = null; }
    const origem = nota ? texto(ctx.camposDaNota(nota)?.[CAMPO_DA_ORIGEM]) : '';
    if (!e && !origem) return null;
    const { doc } = ctx;
    const box = el(doc, 'div', 'dh-estado', { 'data-secao': 'status' });
    if (e) {
        const linha = el(doc, 'div', 'st-linha');
        linha.appendChild(el(doc, 'span', 'st-agora', null, e.agora ?? '—'));
        if (ctx.gravar) linha.appendChild(botaoDoStatus(ctx, id, e.titulo));
        box.appendChild(linha);
        const m = ctx.gravar ? menuDoStatus(ctx, e) : null;
        if (m) box.appendChild(m);
    }
    if (origem) {
        const nome = ctx.nomeDoProtocolo?.(origem) || origem;
        box.appendChild(el(doc, 'p', 'st-origem', { 'data-origem': origem }, `${STATUS.origem}: ${nome.length > 140 ? `${nome.slice(0, 139)}…` : nome}`));
    }
    return box;
}

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/**
 * O que faz: as ações de uma tarefa: 🤝 Fazer agora e ○ Concluir (as mais usadas, à mão); o "Nova data"
 * na sem data ou de algum dia. O Algum dia e o Cancelar moram no menu de status (02/11), aberto pelo
 * ⋯ Status embaixo do título, o mesmo lugar em todo nó com estados.
 * Por quê: na que ficou de antes, o novo dia é o "Mover para…" (02/11/2026: fica só ele, que tem o dia e a
 * hora); o "Nova data" ali repetia o mesmo gesto no mesmo painel e saiu. A linha diz onde fica.
 */
export function secaoDeAcoes(ctx: Contexto, t: MissaoTarefa): HTMLElement | null {
    if (t.feita) return null;
    const s = secao(ctx, 'Fazer');
    const acts = el(ctx.doc, 'div', 'acts');
    acts.appendChild(btn(ctx, 'btn', '🤝 Fazer agora', { 'data-act': 'agora', 'data-id': t.id }, '🤝 Fazer agora: abre o gesto com esta tarefa (onde estou, quanto tempo, o registro no fim)'));
    acts.appendChild(btn(ctx, 'btn', '○ Concluir', { 'data-act': 'concluir', 'data-id': t.id }, 'Concluir: pergunta quando terminou (fechar sem escolher não conclui)'));
    s.appendChild(acts);
    const semData = !t.colocacao.dia && !t.colocacao.semana;
    if (t.deAntes) {
        s.appendChild(el(ctx.doc, 'p', 'hint', null, 'Ficou de antes: o novo dia e a hora estão em Mover para… (Algum dia e Cancelar, no ⋯ Status).'));
    } else if (semData || t.algumDia) {
        s.appendChild(el(ctx.doc, 'p', 'hint', null, `${t.algumDia ? 'Em algum dia' : 'Sem data'}: o dia e a hora estão em Mover para… (ganhando um dia, volta a ser a próxima).`));
    }
    return s;
}

/**
 * O que faz: o "Mover para…" (o caminho do teclado para cada arrasto no tempo): hoje, amanhã, a
 * semana que vem e "Sem data"; um dia; a hora dentro do dia. Na SMART, "Ligar a uma ação" é o
 * caminho da alça.
 * Por quê: um jeito por função (02/11/2026: o que já cumpre a função dentro da lógica se reusa):
 * trocar o projeto ou a SMART da tarefa é o "＋ Adicionar" do campo do pai (o mesmo `intencaoDeSoltar`,
 * genérico para todo campo de link de todo tipo); os seletores de projeto e de SMART daqui repetiam
 * o mesmo gesto no mesmo painel e saíram.
 */
export function secaoMoverPara(ctx: Contexto, t: MissaoTarefa): HTMLElement {
    const doc = ctx.doc;
    const s = secao(ctx, 'Mover para…');
    const rapidas = el(doc, 'div', 'acts');
    for (const o of opcoesDeMover(ctx.modelo, t.id)) rapidas.appendChild(btn(ctx, 'btn', o.rotulo, { 'data-act': 'mover', 'data-opcao': o.id, 'data-id': t.id }, `Mover para: ${o.rotulo}`));
    s.appendChild(rapidas);
    const f = el(doc, 'div', 'fields');
    // Os controles (a caixa e o botão) ficam juntos na coluna do valor, pela linha de campo única.
    const linha = (rotulo: string, ...filhos: HTMLElement[]) => {
        const box = el(doc, 'div', 'linkbox');
        box.append(...filhos);
        linhaDeCampo(ctx, f, rotulo, box);
    };
    if (t.tipo === 'acao') {
        linha('Dia', el(doc, 'input', null, { type: 'date', 'data-input': 'mover-dia', 'aria-label': 'Mover para o dia' }),
            btn(ctx, 'btn', 'Agendar', { 'data-act': 'mover-dia', 'data-id': t.id }, 'Agendar neste dia (a hora fica)'));
        if (t.colocacao.dia && t.colocacao.fonte === 'agendado') {
            const hora = el(doc, 'input', null, { type: 'time', step: '1800', 'data-input': 'mover-hora', 'aria-label': 'Hora dentro do dia', value: t.colocacao.hora || null });
            if (t.colocacao.hora) hora.value = t.colocacao.hora;
            linha('Hora', hora,
                btn(ctx, 'btn', 'Marcar', { 'data-act': 'mover-hora', 'data-id': t.id }, 'Marcar a hora dentro do dia'),
                ...(t.colocacao.hora ? [btn(ctx, 'btn', 'Tirar', { 'data-act': 'tirar-hora', 'data-id': t.id }, 'Tirar a hora (fica o dia)')] : []));
        }
    }
    const acoes = t.tipo === 'smart' ? acoesParaLigar(ctx.modelo, t.id) : [];
    if (acoes.length) {
        const sel = el(doc, 'select', null, { 'data-input': 'ligar-acao', 'aria-label': 'Ligar a uma ação' });
        sel.appendChild(el(doc, 'option', null, { value: '' }, 'Ação…'));
        for (const x of acoes) sel.appendChild(el(doc, 'option', null, { value: x.id }, x.nome));
        linha('Ligar a uma ação', sel, btn(ctx, 'btn', 'Ligar', { 'data-act': 'ligar-acao', 'data-id': t.id }, 'Ligar esta SMART a uma ação (como a alça)'));
    }
    if (f.childElementCount) s.appendChild(f);
    return s;
}

/** O que faz: as ligações do nó que são campo da tarefa, cada uma com "Desligar" (o caminho do menu para "selecionar e Delete"). */
export function secaoDeLigacoes(ctx: Contexto, t: MissaoTarefa): HTMLElement | null {
    const ls = ligacoesDoNo(ctx.modelo, t.id);
    if (!ls.length) return null;
    const s = secao(ctx, 'Ligações');
    // Uma lista, fora da grade dos campos: o nome inteiro numa linha e o "Desligar" pequeno ao lado.
    const lista = el(ctx.doc, 'ul', 'ligs');
    for (const l of ls) {
        const li = el(ctx.doc, 'li', 'lig');
        li.appendChild(el(ctx.doc, 'span', 'lig-n', null, l.rotulo));
        li.appendChild(btn(ctx, 'btn lig-b', 'Desligar', { 'data-act': 'desligar', 'data-de': l.ligacao.de, 'data-para': l.ligacao.para, 'data-tipo': l.ligacao.tipo }, `Desligar: ${l.rotulo}`));
        lista.appendChild(li);
    }
    s.appendChild(lista);
    return s;
}

/** Até quantas notas o campo de link do painel mostra para marcar; acima disso, os nomes por escrito. */
export const NOTAS_PARA_MARCAR = 24;

/**
 * O que faz: a caixa de edição de um campo de uma nota (o painel do nó grava ao sair dela). O link
 * de várias notas com poucas candidatas do alvo (P9: as pessoas do dia) mostra as ligadas e o seletor das outras.
 */
function caixa(ctx: Contexto, nota: string, campo: DomainField, cru: unknown, rotulos: RotulosDosVocabularios): HTMLElement {
    const candidatas = campo.tipo === 'link' && campo.multiplo ? (ctx.candidatos?.(campo) ?? []) : [];
    const marcar = candidatas.length > 0 && candidatas.length <= NOTAS_PARA_MARCAR ? candidatas : [];
    return caixaDoCampo(ctx, campo, cru, rotulos, { 'data-campo-edit': campo.nome, 'data-path': nota }, marcar);
}

/**
 * O que faz: as caixas de marcar de um campo com as opções de outra nota (os destinos pelos perfis do canal): as
 * opções da outra nota e as que a nota já tem; marcadas as da nota, ou, no campo vazio, as da regra, com o
 * "✓ Gravar estes" (o valor da regra está só nas caixas, não na nota) e o porquê embaixo.
 * Por quê: a percorrida de 06/11: os destinos num texto de uma linha, cortado, e a dica repetindo os valores.
 * Entra → sai: o contexto, a nota, o campo, o valor cru e as opções → as caixas e a origem, ou `null` (sem opção
 * nenhuma: o campo fica com o texto).
 */
function marcasDaOutraNota(ctx: Contexto, nota: string, campo: DomainField, cru: unknown, o: { opcoes: readonly string[]; inicial: readonly string[]; porque: string }): { caixa: HTMLElement; origem: HTMLElement | null } | null {
    const atuais = (Array.isArray(cru) ? cru : cru === undefined || cru === null || cru === '' ? [] : String(cru).split(',')).map(x => String(x ?? '').trim()).filter(Boolean);
    const todas = [...new Set([...o.opcoes, ...o.inicial, ...atuais])];
    if (!todas.length) return null;
    const pelaRegra = !atuais.length && o.inicial.length > 0;
    const marcados = new Set(pelaRegra ? o.inicial : atuais);
    const atributos: Record<string, string> = { 'data-campo-edit': campo.nome, 'data-path': nota };
    const caixa = caixaDeMarcas(ctx, campo, todas.map(v => ({ valor: v, rotulo: v })), marcados, atributos);
    if (!pelaRegra) return { caixa, origem: null };
    const origem = el(ctx.doc, 'div', 'forigem marcas-regra');
    origem.append(PAINEL.marcadosPelaOutraNota(o), ' ');
    origem.appendChild(btn(ctx, 'btn btn-s', PAINEL.gravarMarcados, { 'data-act': 'campo-gravar', 'data-campo': campo.nome, 'data-path': nota }, PAINEL.dicaGravarMarcados(campo.rotulo)));
    return { caixa, origem };
}

/** O que faz: o nome de um protocolo como o JSON dele diz, ou "o protocolo dono" (nunca o id cru). */
const nomeDoDono = (ctx: Contexto, protocolo: string) => ctx.nomeDoProtocolo?.(protocolo) || 'o protocolo dono';

/**
 * O que faz: o botão do ciclo deste período que roda o protocolo dono (o 🌳 da semana, o 🧭 do
 * trimestre), com o contexto do período; `null` quando o protocolo não é um botão do ciclo dele.
 * Por quê: rodar o protocolo de criação a partir de um nó que já existe criaria outro; o do
 * ciclo é o que regrava o campo daquele período, com o período fixado.
 */
function cicloDoDono(ctx: Contexto, protocolo: string, id: string): HTMLElement | null {
    const periodo = periodoDoId(id);
    // O do ciclo vence: o 🌳 cria a Week e também a regrava, com a semana fixada.
    const ciclo = periodo ? (ctx.ciclos?.(periodo.escala, periodo.chave) ?? []).find(c => c.protocolo === protocolo) : undefined;
    if (!ciclo) return null;
    const nome = nomeDoDono(ctx, protocolo);
    const b = botaoDoCiclo(ctx, ciclo, nome);
    ctx.marcar(b, `${nome}: muda estes campos pelo protocolo, no contexto deste período`);
    return b;
}

/** O que faz: a frase da origem de um campo de protocolo ("definido ao criar, pelo 🚀 Novo Projeto", "pelo …"). */
function origemDoDono(ctx: Contexto, protocolo: string, criador: string | null, varios: boolean): string {
    const nome = nomeDoDono(ctx, protocolo);
    return protocolo === criador ? `${varios ? 'Definidos' : 'definido'} ao criar, pelo ${nome}` : `${varios ? 'Pelo' : 'pelo'} ${nome}`;
}

/** Um campo na fila do painel: a linha dele, ou um grupo dos campos de um mesmo protocolo. */
type ItemDosCampos = { tipo: 'linha'; faz: (f: HTMLElement) => void } | { tipo: 'grupo'; protocolo: string; linhas: Array<(f: HTMLElement) => void> };

/**
 * O que faz: as seções dos campos de um nó, editáveis onde o modelo deixa (`comoEdita`): o
 * campo da nota vira caixa; o do TaskNotes (o título, nome do arquivo) abre o editor dele; o
 * do protocolo e o derivado aparecem para ler, com o porquê embaixo do valor. Os campos de um
 * mesmo protocolo (dois ou mais) ficam sob um título só, com um botão só (o do ciclo, quando é).
 * Por quê: o diagnóstico do painel do nó (29/10, C1 e C5): o botão do 🧭 em cada uma das 17
 * linhas do trimestre espremia o valor; a linha única (`linhaDeCampo`) põe a origem embaixo.
 * Entra → sai: o contexto e o caminho da nota → as seções (nenhuma sem modelo).
 */
export function secoesDosCamposEditaveis(ctx: Contexto, nota: string, emTarefa: boolean, id = ''): HTMLElement[] {
    const lido = ctx.camposDaNota(nota) ?? {};
    const modelo = modeloDaNota(nota, lido, ctx.modelo.indice.tabelas.tipos ?? []);
    // Os nomes antigos dos campos (05/11: o `plataforma` da peça aparece em `destinos`); gravar usa o nome de agora.
    const fm = camposComApelidos(modelo, lido);
    // Sem modelo, ou com o modelo que não declara campo, o painel mostra o frontmatter para ler (P10c).
    if (!modelo || !mostraCampos(modelo)) return [];
    const rotulos = rotulosDoCatalogo(ctx);
    const criador = modelo.criar?.via === 'protocolo' ? modelo.criar.protocolo ?? null : null;
    const itens: ItemDosCampos[] = [];
    const grupos = new Map<string, Extract<ItemDosCampos, { tipo: 'grupo' }>>();
    // O campo do estado muda pelo menu de status (02/11, um lugar por ação): aqui, o valor e o ⋯ Status.
    const doEstado = id && ctx.gravar ? estadoDoNo(ctx, id) : null;
    const campoDoMenu = doEstado ? (doEstado.campo ?? campoDoEstado(modelo, emTarefa ? ctx.modelo.indice.tabelas.tarefa : modelo.estados, fm)) : null;
    // Os campos como valem no formato da nota (03/11, o ramo Criação): sem formatos, os do modelo.
    for (const campo of camposNoFormato(modelo, fm)) {
        if (campo.editar === false) continue;
        const como = comoEdita(campo, { nomeDoArquivo: ctx.nomeDoArquivo });
        const texto = valorEmTexto(campo, fm[campo.nome], rotulos, modelo.estados);
        if (doEstado && campoDoMenu && campo.nome === campoDoMenu.nome) {
            const rotulo = doEstado.agora ?? (texto || campo.vazio || '—');
            itens.push({ tipo: 'linha', faz: f => linhaDeCampo(ctx, f, campo.rotulo, valorEmSpan(ctx, rotulo, !doEstado.agora && !texto), { campo: campo.nome, origem: botaoDoStatus(ctx, id, doEstado.titulo, 'btn btn-s b-status') }) });
            continue;
        }
        if (como.via !== 'campo' && !texto && !campo.vazio) continue;
        if (como.via === 'campo') {
            itens.push({ tipo: 'linha', faz: f => {
                const rot = `${campo.rotulo}${campo.obrigatorio ? ' *' : ''}`;
                // O campo com as opções de outra nota (05/11, os destinos pelos perfis do canal): as caixas de marcar,
                // uma por perfil, e no campo vazio as da regra já marcadas (06/11; antes, um texto de uma linha).
                const opcoes = ctx.modelo.opcoesPelaOutraNota?.(nota, fm, campo.nome) ?? null;
                const marcas = opcoes ? marcasDaOutraNota(ctx, nota, campo, fm[campo.nome], opcoes) : null;
                if (marcas) { linhaDeCampo(ctx, f, rot, marcas.caixa, { campo: campo.nome, origem: marcas.origem }); return; }
                // O campo vazio com as opções de outra nota e nenhum perfil: o texto, com o porquê.
                const sugerido = !texto ? opcoes : null;
                const c = caixa(ctx, nota, campo, sugerido?.inicial.length ? sugerido.inicial : fm[campo.nome], rotulos);
                // O valor da regra está só na caixa, não na nota: sair do campo sem mudar nada também o grava (a
                // percorrida de 06/11: o "change" não vem quando o valor não muda, e os destinos ficavam sem gravar).
                if (sugerido?.inicial.length) c.setAttribute('data-sugerido', '');
                if (sugerido) { linhaDeCampo(ctx, f, rot, c, { campo: campo.nome, label: true, origem: PAINEL.sugeridoPelaOutraNota(sugerido) }); return; }
                // O campo de link tem o próprio "＋ Adicionar" (29/10): a busca das que já existem e o "Criar nova".
                if (campo.tipo === 'link' && ctx.adicionar) {
                    const box = el(ctx.doc, 'div', 'add-campo');
                    box.append(c, btn(ctx, 'btn add-campo-b', ADICIONAR.botao, { 'data-act': 'adicionar', 'data-adicionar': campo.nome, 'data-path': nota, 'data-id': id }, ADICIONAR.dica(campo.rotulo)));
                    linhaDeCampo(ctx, f, rot, box, { campo: campo.nome, label: true });
                } else linhaDeCampo(ctx, f, rot, c, { campo: campo.nome, label: true });
            } });
            continue;
        }
        const valor = () => (campo.tipo === 'link' && texto ? valorDeLinks(ctx, linksDoCampo(fm[campo.nome]), nota) : valorEmSpan(ctx, texto || campo.vazio || '—', !texto));
        if (como.via === 'protocolo') {
            let g = grupos.get(como.protocolo);
            if (!g) { g = { tipo: 'grupo', protocolo: como.protocolo, linhas: [] }; grupos.set(como.protocolo, g); itens.push(g); }
            g.linhas.push(f => linhaDeCampo(ctx, f, campo.rotulo, valor(), { campo: campo.nome }));
            continue;
        }
        const editar = como.via === 'tasknotes' && emTarefa ? btn(ctx, 'btn btn-s', 'Editar no TaskNotes', { 'data-open': 'tarefa', 'data-path': nota }, `Editar no TaskNotes: ${como.porque}`) : null;
        itens.push({ tipo: 'linha', faz: f => { linhaDeCampo(ctx, f, campo.rotulo, valor(), { campo: campo.nome, origem: editar }); } });
    }
    const sec = secao(ctx, 'Campos');
    let grade: HTMLElement | null = null;
    const gradeAberta = () => { if (!grade) { grade = el(ctx.doc, 'div', 'fields fform'); sec.appendChild(grade); } return grade; };
    for (const it of itens) {
        if (it.tipo === 'linha') { it.faz(gradeAberta()); continue; }
        // Um campo só do protocolo: a origem embaixo do valor; dois ou mais: um título e um botão para o grupo.
        if (it.linhas.length === 1) {
            const f = gradeAberta();
            it.linhas[0](f);
            const col = f.lastElementChild as HTMLElement;
            col.appendChild(cicloDoDono(ctx, it.protocolo, id) ?? el(ctx.doc, 'span', 'forigem', null, origemDoDono(ctx, it.protocolo, criador, false)));
            continue;
        }
        grade = null;
        const g = el(ctx.doc, 'div', 'fgrupo fform', { 'data-protocolo': it.protocolo });
        const cab = el(ctx.doc, 'p', 'fgrupo-cab');
        // Com o botão do ciclo, o título diz só "Mudam pelo" e o botão diz o protocolo (o nome uma vez).
        const b = cicloDoDono(ctx, it.protocolo, id);
        cab.appendChild(el(ctx.doc, 'span', 'fgrupo-t', null, b ? 'Mudam pelo' : origemDoDono(ctx, it.protocolo, criador, true)));
        if (b) cab.appendChild(b);
        g.appendChild(cab);
        const f = el(ctx.doc, 'div', 'fields');
        for (const faz of it.linhas) faz(f);
        g.appendChild(f);
        sec.appendChild(g);
    }
    sec.appendChild(el(ctx.doc, 'p', 'hint', null, 'Grava ao sair do campo (ou com Enter); o aviso traz Desfazer, e ⌘Z desfaz.'));
    const out = [sec];
    const { antigos } = camposDoNo(nota, fm, ctx.modelo.indice.tabelas.tipos ?? [], rotulos);
    if (antigos.length) {
        const sa = secao(ctx, 'Modelo antigo');
        sa.appendChild(el(ctx.doc, 'p', 'hint', null, 'Campos do modelo antigo: só para ler, a nota não se regrava.'));
        const fa = el(ctx.doc, 'div', 'fields');
        for (const a of antigos) linhaDeCampo(ctx, fa, a.nome, valorEmSpan(ctx, a.valor));
        sa.appendChild(fa);
        out.push(sa);
    }
    return out;
}
