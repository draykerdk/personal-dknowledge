/**
 * A interação do cartão, um dono só para toda vista que mostra cartões (o mapa, o ramo da pinça, o
 * Sistema): o que o cartão oferece ao passar o mouse (as ações, o "+ <Tipo>" com a ligação já
 * respondida, o "+ Item" e o "Ligar"), a alça de ligar, o "+" do lugar vazio de uma coluna, e o modo
 * "Ligar" (o clique no outro cartão) com a escolha quando há mais de uma ligação.
 *
 * Por quê: no ramo, as opções dos botões não apareciam com o cursor sobre o cartão, nem havia como
 * adicionar componentes e fazer conexões; no mapa, não havia como fazer conexões nem criar tarefas,
 * tarefas SMART, países ou cidades (30/10/2026). O cartão é o mesmo em toda vista (`noEl`), e o que ele faz também: cada
 * parte aqui reusa o que já existia (as ações do painel, o `novosDoNo` do ramo e dos modelos, o Novo
 * com o campo respondido, as gravações com o Desfazer, o arrasto).
 *
 * O que cada botão faz mora no casco, pelos gestos de sempre (`data-act`): `novo` abre o Novo,
 * `item-abrir` a caixa do item no painel, `ligar` o modo Ligar (`ligarInteracao`). O que ligar dois nós
 * grava vem do modelo (`ligacoesEntre`, ligar.ts): aqui nada grava nem nomeia tipo.
 * Prova: tests/missao/interacao.test.ts e tests/navegador/prova.mjs.
 */
import { EXPANDIR, LIGAR, STATUS } from '../frases';
import { periodoDoId } from '../tempo';
import type { MissaoNo, OpcaoDeLigar, ResultadoDoLigar } from '../tipos';
import type { Contexto } from './contrato';
import { botao, el } from './dom';
import { botaoDoStatus, estadoDoNo } from './campos';

/** O que faz: um botão das ações à mão (`.mini`), com a dica. */
function mini(ctx: Contexto, rotulo: string, attrs: Record<string, string>, dica: string): HTMLButtonElement {
    const b = botao(ctx.doc, 'mini', rotulo, attrs);
    ctx.marcar(b, dica);
    return b;
}

/**
 * O que faz: as ações à mão de um nó, como no protótipo (template 1034–1038, 1068, 1079, 1086,
 * 1139, 2174): Nota · Canvas no nó que tem os arquivos; na tarefa aberta, 🤝 Fazer agora ·
 * ○ Concluir; na que ficou de antes, Mover para… (o do painel, com o dia e a hora); na sem data ou de
 * algum dia, Nova data (e Concluir); e, por
 * último, o ⋯ Status em todo nó com estados (02/11: o Algum dia, o Cancelar, o Arquivar e o Excluir
 * moram no menu dele, o mesmo do painel). Só onde a Missão grava; os gestos são os do painel do
 * nó (`data-act`), com as mesmas gravações e o mesmo Desfazer.
 * Entra → sai: o contexto e o nó → os botões (talvez nenhum).
 */
export function acoesDoNo(ctx: Contexto, no: MissaoNo): HTMLButtonElement[] {
    const out: HTMLButtonElement[] = [];
    const t = ctx.modelo.indice.porId.get(no.id);
    // O menu de status (02/11): uma entrada só, a mesma do painel e da tecla S, em todo nó com estados.
    const status = ctx.gravar && estadoDoNo(ctx, no.id) ? botaoDoStatus(ctx, no.id, no.titulo, 'mini') : null;
    if (t && t.tipo === 'acao' && !t.feita && ctx.gravar) {
        const semData = !t.colocacao.dia && !t.colocacao.semana;
        const id = { 'data-id': t.id };
        // Sem data, de algum dia ou de antes: o tempo é o "Mover para…" (02/11, um jeito só).
        if (t.deAntes || semData || t.algumDia) out.push(mini(ctx, STATUS.remarcar, { 'data-act': 'mover-para', ...id }, `${STATUS.dicaRemarcar}: ${t.titulo}`));
        else out.push(mini(ctx, '🤝 Fazer agora', { 'data-act': 'agora', ...id }, `🤝 Fazer agora: ${t.titulo}`));
        out.push(mini(ctx, '○ Concluir', { 'data-act': 'concluir', ...id }, `Concluir: ${t.titulo} (pergunta quando terminou)`));
    }
    if (t) { if (status) out.push(status); return out; }
    const arq = ctx.modelo.arquivos(no.id);
    // O atalho do registro (P9): no dia com a Day e sem valor, o "＋ R$" do ramo abre o campo no painel.
    const periodo = periodoDoId(no.id);
    const atalho = periodo && ctx.gravar && no.semDinheiro ? ctx.ramoPrincipal.registro?.[periodo.escala]?.atalho : undefined;
    if (atalho?.campo) out.push(mini(ctx, atalho.rotulo, { 'data-act': 'atalho', 'data-id': no.id, 'data-campo': atalho.campo }, atalho.dica));
    if (arq.nota) out.push(mini(ctx, 'Nota', { 'data-open': 'nota', 'data-path': arq.nota }, `Abrir a nota de ${no.titulo}`));
    if (arq.canvas) out.push(mini(ctx, 'Canvas', { 'data-open': 'nota', 'data-path': arq.canvas }, `Abrir o canvas de ${no.titulo}`));
    if (status) out.push(status);
    return out;
}

/** O que faz: os atributos do Novo a partir de um nó (o "+ <Tipo>"), com o campo respondido quando há. */
function doNovo(id: string, n: { tipo: string; campo?: string; valor?: string }): Record<string, string> {
    return { 'data-act': 'novo', 'data-tipo': n.tipo, 'data-id': id, ...(n.campo && n.valor ? { 'data-campo': n.campo, 'data-valor': n.valor } : {}) };
}

/**
 * O que faz: diz se o nó entra numa ligação (como a origem ou o destino): o que tem nota, o período (o
 * soltar no tempo) e o projeto; o grupo, o item da checklist e o nome sem nó, não.
 */
export function podeLigar(ctx: Contexto, no: Pick<MissaoNo, 'id'>): boolean {
    if (!ctx.gravar || !no.id) return false;
    return !!ctx.modelo.arquivos(no.id).nota || !!periodoDoId(no.id) || ctx.modelo.indice.projetos.has(no.id);
}

/**
 * O que faz: o que o cartão oferece ao passar o mouse ou com o foco (`.minis`): as ações dele, um
 * "+ <Tipo>" por filho que o ramo e os modelos deixam (o Novo com a ligação a este nó já respondida),
 * o "+ Item" da checklist da tarefa e o "Ligar". O cartão do centro (o período da linha em foco, o
 * centro do ramo) não repete o "+ <Tipo>": o dele mora no pé do lugar (`maisDoContexto`), um "+" por
 * tipo em cada lugar (02/11, um jeito por função).
 * Por quê: o mesmo cartão faz o mesmo em toda vista; o que cria e o que liga saem dos dados (o ramo,
 * os modelos de tipo), nunca de um nome escrito aqui.
 * Entra → sai: o contexto, o nó e se o "+" dele mora no pé do lugar → a fila, ou `null` sem nada a oferecer.
 */
export function ferramentasDoNo(ctx: Contexto, no: MissaoNo, maisNoPe = false): HTMLElement | null {
    if (!no.id) return null;
    const box = el(ctx.doc, 'span', 'minis');
    for (const b of acoesDoNo(ctx, no)) box.appendChild(b);
    for (const n of maisNoPe ? [] : ctx.novos?.(no.id) ?? []) box.appendChild(mini(ctx, `+ ${n.rotulo}`, doNovo(no.id, n), LIGAR.novoNo(n.rotulo, no.titulo)));
    if (ctx.checklist && ctx.modelo.indice.porId.has(no.id)) box.appendChild(mini(ctx, '+ Item', { 'data-act': 'item-abrir', 'data-id': no.id }, LIGAR.item(no.titulo)));
    if (podeLigar(ctx, no)) box.appendChild(mini(ctx, LIGAR.botao, { 'data-act': 'ligar', 'data-id': no.id }, LIGAR.dica(no.titulo)));
    return box.childElementCount ? box : null;
}

/**
 * O que faz: a alça de ligar do cartão (o ponto na borda direita): arrastada até outro cartão, liga os
 * dois (`ligacoesEntre`); só onde o arrasto vale e no nó que entra numa ligação.
 * Entra → sai: o contexto, o nó e a classe da cor do ramo → a alça, ou `null`.
 */
export function alcaDoNo(ctx: Contexto, no: MissaoNo, ramo: string): HTMLElement | null {
    if (!ctx.arrastar || no.estado === 'feita' || !podeLigar(ctx, no)) return null;
    const h = botao(ctx.doc, `handle ${ramo}`, null, { 'data-handle': no.id });
    ctx.marcar(h, LIGAR.alca(no.titulo));
    return h;
}

/**
 * O que faz: o "+" de um lugar vazio de uma linha ou de uma coluna: um botão por tipo que se cria a
 * partir do nó de contexto dela (a semana da linha, o projeto do centro, o nó do centro do ramo), pelo
 * mesmo Novo do "+ <Tipo>" do cartão, com a ligação já respondida.
 * Entra → sai: o contexto, o id do nó de contexto e, quando o lugar é de alguns tipos só (o pé da coluna do
 * tipo no ramo, 02/11), esses tipos → o grupo, ou `null` sem nada a criar ali.
 */
export function maisDoContexto(ctx: Contexto, id: string | null, tipos?: readonly string[]): HTMLElement | null {
    const novos = (id ? ctx.novos?.(id) ?? [] : []).filter(n => !tipos || tipos.includes(n.tipo));
    if (!id || !novos.length) return null;
    const titulo = ctx.modelo.no(id)?.titulo ?? id;
    const box = el(ctx.doc, 'div', 'mais', { role: 'group', 'aria-label': `Criar a partir de ${titulo}` });
    for (const n of novos) {
        const b = botao(ctx.doc, 'row-add', `+ ${n.rotulo}`, doNovo(id, n));
        ctx.marcar(b, LIGAR.novoNo(n.rotulo, titulo));
        box.appendChild(b);
    }
    return box;
}

/**
 * O que faz: o controle de expandir ou recolher de um cartão (30/10), o mesmo em toda vista que tem o que
 * abrir abaixo de um nó: "▸" fechado, "▾" aberto, com a tecla na dica; o clique sai como intenção
 * (`ramo-expandir`, o id e o estado de agora), e o casco guarda o estado da vista.
 * Entra → sai: o contexto, o id, o título e se está aberto → o botão.
 */
export function alternarEl(ctx: Contexto, id: string, titulo: string, aberto: boolean): HTMLElement {
    const b = botao(ctx.doc, `expandir${aberto ? ' aberto' : ''}`, aberto ? EXPANDIR.recolher : EXPANDIR.expandir, { 'data-act': 'ramo-expandir', 'data-id': id, 'data-aberto': aberto ? 'sim' : 'nao', 'aria-expanded': String(aberto) });
    ctx.marcar(b, aberto ? EXPANDIR.dicaRecolher(titulo) : EXPANDIR.dicaExpandir(titulo), EXPANDIR.tecla);
    return b;
}

/* ------------------------------------------------------------ as ferramentas à vista */

/** A classe do invólucro cujas ferramentas estão à vista (uma fila por vez na raiz). */
export const FERRAMENTAS_A_VISTA = 'ferr-on';
/** A variável de estilo com o meio do cartão (a altura da alça) enquanto a fila está à vista. */
const MEIO_DO_CARTAO = '--meio-do-cartao';

/** O que faz: o invólucro de cartão (`.tw`, `.wrapn`) com ferramentas (`.minis`) em que um elemento mora; `null` fora de um. */
export function involucroComFerramentas(alvo: Element | null): HTMLElement | null {
    for (let e = alvo?.closest?.('.tw, .wrapn') as HTMLElement | null; e; e = e.parentElement?.closest?.('.tw, .wrapn') as HTMLElement | null) {
        if (Array.from(e.children).some(c => c.classList.contains('minis'))) return e;
    }
    return null;
}

/** O que a fila única recebe do casco: a raiz e o `on` (os ouvintes saem com os do casco). */
export interface ContextoDasFerramentas {
    root: HTMLElement;
    on(alvo: EventTarget, tipo: string, fn: (ev: any) => void, opt?: AddEventListenerOptions | boolean): void;
}

/** O que o casco pergunta da fila única. */
export interface FerramentasLigadas {
    /** O invólucro com as ferramentas à vista agora; `null` = nenhum. */
    atual(): HTMLElement | null;
    /** Tira as ferramentas da vista (a tela mudou por baixo). */
    fechar(): void;
}

/**
 * O que faz: a fila de ferramentas à vista, uma só na raiz: o cartão com o mouse em cima (ou com o foco
 * do teclado dentro) ganha a classe `ferr-on`, e a de antes sai na mesma hora; o mouse que sai do cartão
 * (para o vazio ou para fora da Missão) e o foco que sai dele a tiram.
 * Por quê: 02/11, a fila do cartão flutuava por baixo dele e cobria o título do cartão de baixo, e uma
 * cópia apagada ficava à vista noutro cartão (o do foco devolvido ao fechar o painel) depois que o mouse
 * saía. Agora a fila ocupa o seu lugar debaixo do cartão (o estilo abre o espaço, sem cobrir ninguém) e
 * só uma existe na tela: as outras não se desenham. A coluna centrada na linha, que cresce com a fila,
 * subiria metade dela e tiraria o cartão de baixo do mouse (o clique cairia na fila): ela volta pelo
 * quanto moveu (`transform`), e o cartão fica parado enquanto a fila está à vista.
 * Entra → sai: o contexto → a fila ligada.
 * Erro e ataque: o cartão repintado (o invólucro velho saiu da página) não guarda a classe; o elemento
 * que não sabe dizer `:focus-visible` (um DOM antigo) conta como foco do teclado.
 */
export function ligarFerramentas(c: ContextoDasFerramentas): FerramentasLigadas {
    let atual: HTMLElement | null = null;
    let peloFoco = false;
    // A coluna que a fila fez crescer, devolvida ao lugar (a coluna centrada na linha subia metade da fila
    // e levava o cartão para longe do mouse: o clique caía na fila, 02/11).
    let segurada: HTMLElement | null = null;
    const soltar = () => { if (segurada) { segurada.style.removeProperty('transform'); segurada = null; } };
    const apagar = (v: HTMLElement) => { v.classList.remove(FERRAMENTAS_A_VISTA); v.style.removeProperty(MEIO_DO_CARTAO); };
    const mostrar = (w: HTMLElement | null, foco: boolean) => {
        if (w === atual) { if (w) peloFoco = foco; return; }
        if (atual) apagar(atual);
        for (const v of Array.from(c.root.querySelectorAll(`.${FERRAMENTAS_A_VISTA}`))) apagar(v as HTMLElement);
        soltar();
        atual = w;
        peloFoco = foco;
        if (!w) return;
        // A alça fica no meio do cartão, não do invólucro, que cresce com a fila debaixo.
        const cartao = w.firstElementChild as HTMLElement | null;
        if (cartao?.offsetHeight) w.style.setProperty(MEIO_DO_CARTAO, `${cartao.offsetHeight / 2}px`);
        // O cartão não sai de baixo do mouse: a coluna que o centrar moveu volta pelo quanto moveu.
        const coluna = w.closest('.cell, .ramo-col') as HTMLElement | null;
        const antes = cartao?.getBoundingClientRect?.().top ?? 0;
        w.classList.add(FERRAMENTAS_A_VISTA);
        const desvio = cartao && coluna && !coluna.style.transform ? antes - cartao.getBoundingClientRect().top : 0;
        if (coluna && Math.abs(desvio) > 0.5) { coluna.style.transform = `translateY(${Math.round(desvio * 10) / 10}px)`; segurada = coluna; }
    };
    const focoDoTeclado = (e: Element) => { try { return e.matches(':focus-visible'); } catch { return true; } };
    c.on(c.root, 'pointerover', (ev: PointerEvent) => {
        if (ev.pointerType === 'touch') return;
        const w = involucroComFerramentas(ev.target as Element | null);
        if (w) mostrar(w, false);
        // O mouse no vazio tira a fila do mouse; a do teclado fica até o foco sair.
        else if (atual && !peloFoco) mostrar(null, false);
    });
    c.on(c.root, 'pointerleave', () => { if (atual && !peloFoco) mostrar(null, false); });
    c.on(c.root, 'focusin', (ev: FocusEvent) => {
        const t = ev.target as Element | null;
        const w = t ? involucroComFerramentas(t) : null;
        if (w && focoDoTeclado(t!)) mostrar(w, true);
    });
    c.on(c.root, 'focusout', (ev: FocusEvent) => {
        const para = ev.relatedTarget as Node | null;
        if (atual && peloFoco && !(para && atual.contains(para))) mostrar(null, false);
    });
    return { atual: () => (atual?.isConnected === false ? null : atual), fechar: () => mostrar(null, false) };
}

/* ------------------------------------------------------------ o realce sob o mouse e o foco */

/** Uma superfície com pontas: o conteúdo (a linha do mapa, o mapa do ramo) e o atributo das pontas. */
export interface SuperficieComPontas { conteudo: HTMLElement; atributo: string }

/** O alvo do realce: a ponta sob o mouse (ou com o foco do teclado) e a superfície dela. */
export interface AlvoDoRealce { conteudo: HTMLElement; ponta: string }

/** O que o realce recebe do casco: a raiz, o `on`, as superfícies à vista e o aviso de que o alvo mudou. */
export interface ContextoDoRealce extends ContextoDasFerramentas {
    superficies(): readonly SuperficieComPontas[];
    mudou(alvo: AlvoDoRealce | null): void;
}

/** O que faz: a ponta de uma superfície em que um elemento mora (o cartão, ou a fila de ferramentas dele); `null` fora de uma. */
export function pontaSobOAlvo(alvo: Element | null, superficies: readonly SuperficieComPontas[]): AlvoDoRealce | null {
    if (!alvo) return null;
    for (const s of superficies) {
        if (!s.conteudo.contains(alvo)) continue;
        const e = (alvo.closest?.(`[${s.atributo}]`) ?? involucroComFerramentas(alvo)?.querySelector(`[${s.atributo}]`)) as Element | null;
        const ponta = e && s.conteudo.contains(e) ? e.getAttribute(s.atributo) : null;
        return ponta ? { conteudo: s.conteudo, ponta } : null;
    }
    return null;
}

/**
 * O que faz: o alvo do realce, um só na raiz, para o mapa e para qualquer ramo: o cartão sob o mouse (ou
 * a fila de ferramentas dele), ou o que tem o foco do teclado; o mouse no vazio ou fora da Missão e o
 * foco que sai o tiram. Cada mudança vai ao casco (`mudou`), que acende pela `acenderLinhagem`.
 * Por quê: as coisas são padronizadas (02/11/2026): o realce do mapa valia só no mapa.
 * Entra → sai: o contexto → nada (os ouvintes saem com os do casco).
 * Erro e ataque: o toque não acende (o dedo não passa por cima); o mesmo alvo não avisa de novo.
 * Prova: tests/missao/interacao.test.ts ("o realce") e tests/navegador/prova.mjs.
 */
export function ligarRealce(c: ContextoDoRealce): void {
    let atual: AlvoDoRealce | null = null;
    let peloFoco = false;
    const trocar = (a: AlvoDoRealce | null, foco: boolean) => {
        peloFoco = !!a && foco;
        if (a?.ponta === atual?.ponta && a?.conteudo === atual?.conteudo) return;
        atual = a;
        c.mudou(a);
    };
    c.on(c.root, 'pointerover', (ev: PointerEvent) => {
        if (ev.pointerType === 'touch') return;
        const a = pontaSobOAlvo(ev.target as Element | null, c.superficies());
        if (a || !peloFoco) trocar(a, false);
    });
    c.on(c.root, 'pointerleave', () => { if (!peloFoco) trocar(null, false); });
    c.on(c.root, 'focusin', (ev: FocusEvent) => {
        const t = ev.target as Element | null;
        let visivel = true;
        try { visivel = !!t?.matches(':focus-visible'); } catch { visivel = true; }
        const a = visivel ? pontaSobOAlvo(t, c.superficies()) : null;
        if (a) trocar(a, true);
    });
    c.on(c.root, 'focusout', (ev: FocusEvent) => {
        const para = ev.relatedTarget as Element | null;
        if (peloFoco && !(para && pontaSobOAlvo(para, c.superficies()))) trocar(null, false);
    });
}

/* ------------------------------------------------------------ o modo Ligar */

/**
 * O que faz: o que ligar os dois faria, em palavras (a dica da alça sobre o outro cartão): a ligação que
 * grava direto, a pergunta da escolha quando há mais de uma, ou o porquê de nenhuma.
 * Entra → sai: o que o modelo diz (`ligacoesEntre`) e os títulos dos dois → o texto ('' sem modelo).
 */
export function previaDoLigar(r: ResultadoDoLigar | null, tituloDe: string, tituloPara: string): string {
    if (!r) return '';
    if ('problema' in r) return r.problema;
    return r.direta || r.opcoes.length === 1 ? r.opcoes[0].rotulo : LIGAR.qual(tituloDe, tituloPara);
}

/** O que o modo Ligar recebe do casco: os elementos, o modelo pela pergunta, a gravação e o aviso. */
export interface ContextoDaInteracao {
    doc: Document;
    root: HTMLElement;
    /** As vistas com cartões à vista (o mapa, o ramo, o Sistema): só ali um clique escolhe o outro cartão. */
    superficies(): HTMLElement[];
    /** O que ligar os dois grava (`modelo.ligacoesEntre`); `null` sem modelo. */
    ligacoes(de: string, para: string): ResultadoDoLigar | null;
    titulo(id: string): string;
    /** Grava a ligação escolhida pelo gesto de sempre (o aviso e o Desfazer vêm da gravação). */
    gravar(opcao: OpcaoDeLigar, de: string, para: string): void;
    avisar(texto: string): void;
    marcar(el: HTMLElement, texto: string): void;
    on(alvo: EventTarget, tipo: string, fn: (ev: any) => void, opt?: AddEventListenerOptions | boolean): void;
}

/** O que o casco pergunta do modo Ligar. */
export interface InteracaoLigada {
    /** Liga `de` a `para`: a alça solta no outro cartão, ou o clique depois do Ligar. */
    ligar(de: string, para: string): void;
    /** O "Ligar" de um cartão: o próximo clique num cartão é o destino. */
    comecar(de: string): void;
    /** Desiste do Ligar, ou da escolha aberta (Esc); devolve se havia do que desistir. */
    cancelar(): boolean;
    /** A origem do Ligar em curso; `null` = nenhum. */
    origem(): string | null;
}

/**
 * O que faz: liga o modo Ligar na raiz: o "Ligar" marca a origem e o próximo clique num cartão de
 * qualquer vista liga os dois; o clique fora, ou o Esc, desiste; mais de uma ligação possível abre a
 * escolha (uma por botão), e uma só grava direto. O aviso diz o porquê quando não há ligação.
 * Por quê: ligar pelo clique é o caminho do teclado e do toque para a alça (§9.3: todo arrasto tem um
 * caminho sem arrastar), e o mesmo `ligar` serve aos dois.
 * Entra → sai: o contexto → o modo ligado (os ouvintes saem com os do casco, pelo `on`).
 * Erro e ataque: o clique no próprio cartão de origem não liga; a vista sem modelo não liga; a escolha
 * fechada sem botão não grava.
 */
export function ligarInteracao(c: ContextoDaInteracao): InteracaoLigada {
    let de: string | null = null;
    let escolha: HTMLElement | null = null;
    const marcarOrigem = (id: string | null) => {
        for (const n of Array.from(c.root.querySelectorAll('.ligando-de'))) n.classList.remove('ligando-de');
        if (!id) return;
        for (const n of Array.from(c.root.querySelectorAll('[data-node]'))) if (n.getAttribute('data-node') === id) n.classList.add('ligando-de');
    };
    function parar(): void {
        de = null;
        c.root.classList.remove('ligando');
        marcarOrigem(null);
    }
    function fecharEscolha(): void {
        escolha?.remove();
        escolha = null;
    }
    /** O que faz: a escolha da ligação perto do cartão de destino: um botão por ligação possível. */
    function abrirEscolha(opcoes: OpcaoDeLigar[], origem: string, para: string): void {
        fecharEscolha();
        const pop = el(c.doc, 'div', 'pop menu ligar-escolha', { role: 'dialog', 'aria-label': LIGAR.qual(c.titulo(origem), c.titulo(para)) });
        pop.appendChild(el(c.doc, 'p', 'hint', null, LIGAR.qual(c.titulo(origem), c.titulo(para))));
        opcoes.forEach((o, i) => {
            const b = pop.appendChild(botao(c.doc, 'mi', o.rotulo, { 'data-ligar-i': String(i) }));
            c.marcar(b, o.rotulo);
        });
        c.root.appendChild(pop);
        escolha = pop;
        const alvo = Array.from(c.root.querySelectorAll('[data-node]')).find(n => n.getAttribute('data-node') === para) as HTMLElement | undefined;
        const rr = c.root.getBoundingClientRect(), r = alvo?.getBoundingClientRect();
        if (r) { pop.style.left = `${Math.max(8, r.left - rr.left)}px`; pop.style.top = `${r.bottom - rr.top + 6}px`; }
        (pop.querySelector('button') as HTMLElement | null)?.focus({ preventScroll: true } as FocusOptions);
        const escolher = (ev: MouseEvent) => {
            const b = (ev.target as HTMLElement)?.closest?.('[data-ligar-i]');
            if (!b || !pop.contains(b)) return;
            ev.stopPropagation();
            const o = opcoes[Number(b.getAttribute('data-ligar-i'))];
            fecharEscolha();
            if (o) c.gravar(o, origem, para);
        };
        pop.addEventListener('click', escolher as EventListener);
    }
    function ligar(origem: string, para: string): void {
        if (!origem || !para || origem === para) return;
        const r = c.ligacoes(origem, para);
        if (!r) return;
        if ('problema' in r) { c.avisar(r.problema); return; }
        if (r.direta || r.opcoes.length === 1) { c.gravar(r.opcoes[0], origem, para); return; }
        abrirEscolha(r.opcoes, origem, para);
    }
    // O clique depois do Ligar: na fase de captura, antes do clique de sempre (que abriria o painel).
    c.on(c.root, 'click', (ev: MouseEvent) => {
        const t = ev.target as HTMLElement;
        if (escolha && !escolha.contains(t)) fecharEscolha();
        if (!de) return;
        ev.stopPropagation();
        ev.preventDefault();
        const no = t?.closest?.('[data-node]') as HTMLElement | null;
        const naVista = !!no && c.superficies().some(s => s.contains(no));
        const id = naVista ? no!.getAttribute('data-node') : null;
        const origem = de;
        parar();
        if (!id || id === origem) { c.avisar(LIGAR.cancelado); return; }
        ligar(origem, id);
    }, true);
    return {
        ligar,
        comecar: (id: string) => {
            if (!id) return;
            fecharEscolha();
            de = id;
            c.root.classList.add('ligando');
            marcarOrigem(id);
            c.avisar(LIGAR.escolhaOOutro(c.titulo(id)));
        },
        cancelar: () => {
            if (escolha) { fecharEscolha(); return true; }
            if (de) { parar(); c.avisar(LIGAR.cancelado); return true; }
            return false;
        },
        origem: () => de,
    };
}
