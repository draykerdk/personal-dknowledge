import { describe, expect, it } from 'vitest';
import { layoutParaGravar, packMasonry,
    LEGACY_PANELS, addCard, addPage, defaultPanelLayout, moveCard, movePage, reconcilePanelLayout, removeCard, removePage,
    renamePage, reorderPage, resizeCard, spanAt6, updateCard, MIN_H,
    SEEDED_PAGES, panelLayoutOnOpen, protocolsPage, missaoPage, seedPanelPages,
    abaPelaTecla, navRecolhida, podeRedesenharCartao, precisaGravar,
} from '../../src/board/panelLayout';
import { BOARD_CATALOG } from '../../src/board/boardSpec';
import { CINCO_PAGINAS, PARA_O_CATALOGO, agruparEmCinco, cartoesParaRecolher, chaveDoCartao } from '../../src/board/panelRegroup';
import { layoutDasCincoDe0827, layoutDeOnze } from '../fixtures/panelLayoutAntigo';

const ids = (state: ReturnType<typeof defaultPanelLayout>, page: string) => state.pages.find(p => p.id === page)!.cards.map(c => c.id);

describe('layout do painel: partida', () => {
    it('todas as visões do console antigo continuam no catálogo de cartões', () => {
        // As visões do console antigo (o layout dele, `ui/mission/layout.ts`, saiu em 03/11/2026 com a vista;
        // as aposentadas ficam conhecidas só para as migrações dos layouts antigos).
        const old = ['capture', 'noteFactory', 'intent', 'day', 'planPressure', 'pressure', 'drift', 'inbox', 'triage', 'plan', 'matrix',
            'timeline', 'radar', 'habits', 'funnel', 'week', 'waiting', 'protocols', 'mapModes', 'missionGraph', 'map', 'portfolioBoard', 'kanban',
            'portfolioActions', 'projects', 'trees', 'portfolioCompliance', 'areas', 'canvasTools', 'canvases', 'quarter', 'operatorCard', 'bench', 'integrity'];
        expect(Object.keys(LEGACY_PANELS).sort()).toEqual([...old].sort());
        const retired = new Set(SEEDED_PAGES.flatMap(s => s.retireFrom.map(r => r.panel)));
        expect([...retired]).toEqual(['protocols']);
        // Toda visão do layout de partida existe (nenhum cartão "não existe mais").
        const placed = defaultPanelLayout().pages.flatMap(p => p.cards).filter(c => c.source.kind === 'painel').map(c => (c.source as any).id);
        for (const id of placed) expect(LEGACY_PANELS[id], id).toBeDefined();
    });
    it('as cinco páginas de 29/10: Missão (a de abrir) · Projetos · Análise · Protocolos · Sistema', () => {
        expect(defaultPanelLayout().pages.map(p => p.label)).toEqual(['Missão', 'Projetos', 'Análise', 'Protocolos', 'Sistema']);
        expect(defaultPanelLayout().pages.map(p => p.id)).toEqual(CINCO_PAGINAS.map(p => p.id));
        expect(defaultPanelLayout().activePage).toBe('missao');
        const page = defaultPanelLayout().pages.find(p => p.id === 'protocolos')!;
        expect(page).toMatchObject({ icon: 'workflow' });
        const kinds = page.cards.map(c => (c.source as any).spec.kind);
        expect(kinds.sort()).toEqual(protocolsPage().cards.map(c => (c.source as any).spec.kind).sort());
        for (const kind of kinds) expect(BOARD_CATALOG.some(e => e.kind === kind), kind).toBe(true);

        const missao = defaultPanelLayout().pages.find(p => p.id === 'missao')!;
        expect(missao).toMatchObject({ icon: 'compass', tela: 'missao', cards: [] });
    });
    it('é o layout do dono do commit 0827bbee, como a vista o confere (o "vitals", que não existe, fica de fora)', () => {
        expect(defaultPanelLayout()).toEqual(reconcilePanelLayout(layoutDasCincoDe0827()));
        // E o agrupamento em cinco não tem nada a mudar nele.
        expect(agruparEmCinco(defaultPanelLayout()).igual).toBe(true);
    });
    it('restaurar nunca traz de volta as páginas aposentadas nem os cartões que a Missão já mostra', () => {
        const l = defaultPanelLayout();
        for (const id of ['inicio', 'hoje', 'plano', 'rotinas', 'executar', 'mapa', 'ferramentas']) expect(l.pages.map(p => p.id), id).not.toContain(id);
        expect(cartoesParaRecolher(l)).toEqual([]);
        const chaves = l.pages.flatMap(p => p.cards.map(c => chaveDoCartao(c.source)));
        for (const c of PARA_O_CATALOGO) expect(chaves, c.chave).not.toContain(c.chave);
        // O de partida passa pela abertura sem semear nada de volta.
        const aberto = panelLayoutOnOpen(undefined, undefined).layout;
        expect(aberto.pages.map(p => p.id)).toEqual(l.pages.map(p => p.id));
    });
});

describe('layout do painel: operações', () => {
    const base = layoutDeOnze();

    it('mover dentro da página e para outra página', () => {
        const [a, b] = ids(base, 'plano');
        expect(ids(moveCard(base, b, 'plano', 0), 'plano').slice(0, 2)).toEqual([b, a]);
        const moved = moveCard(base, a, 'rotinas', Infinity);
        expect(ids(moved, 'rotinas').at(-1)).toBe(a);
        expect(ids(moved, 'plano')).not.toContain(a);
        expect(ids(base, 'plano')[0]).toBe(a); // imutável
    });
    it('reordenar pela sequência vista na tela; ids desconhecidos não somem cartões', () => {
        const order = ids(base, 'plano').reverse();
        expect(ids(reorderPage(base, 'plano', order), 'plano')).toEqual(order);
        expect(ids(reorderPage(base, 'plano', ['x', order[0]]), 'plano')).toHaveLength(order.length);
    });
    it('redimensionar respeita os limites; null = altura automática', () => {
        const id = ids(base, 'plano')[0];
        const r = resizeCard(base, id, { w: 40, h: 10 });
        const card = r.pages.find(p => p.id === 'plano')!.cards[0];
        expect(card).toMatchObject({ w: 12, h: MIN_H });
        expect(resizeCard(r, id, { w: 1, h: null }).pages.find(p => p.id === 'plano')!.cards[0]).toMatchObject({ w: 3, h: null });
    });
    it('adicionar, recolher e remover cartão', () => {
        const added = addCard(base, 'rotinas', { kind: 'widget', spec: { kind: 'numeros' } }, 4);
        const card = added.pages.find(p => p.id === 'rotinas')!.cards.at(-1)!;
        expect(card).toMatchObject({ w: 4, h: null, source: { kind: 'widget' } });
        expect(updateCard(added, card.id, { collapsed: true }).pages.find(p => p.id === 'rotinas')!.cards.at(-1)!.collapsed).toBe(true);
        expect(ids(removeCard(added, card.id), 'rotinas')).not.toContain(card.id);
    });
    it('páginas: criar ativa a nova, renomear, mover, excluir (a última nunca sai)', () => {
        const created = addPage(base, '  Estudos ');
        const page = created.pages.at(-1)!;
        expect(page.label).toBe('Estudos');
        expect(created.activePage).toBe(page.id);
        expect(renamePage(created, page.id, 'Leituras').pages.at(-1)!.label).toBe('Leituras');
        expect(movePage(created, page.id, -1).pages.at(-2)!.id).toBe(page.id);
        const removed = removePage(created, page.id);
        expect(removed.pages.some(p => p.id === page.id)).toBe(false);
        expect(removed.activePage).toBe(removed.pages[0].id);
        const single = { ...base, pages: [base.pages[0]] };
        expect(removePage(single, base.pages[0].id).pages).toHaveLength(1);
    });
    it('largura em tela média: metade, nunca menos que 3; inteira continua inteira', () => {
        expect([3, 4, 6, 8, 12].map(spanAt6)).toEqual([3, 3, 3, 4, 6]);
    });
});

describe('layout do painel: o que veio salvo', () => {
    it('nada salvo ou ilegível → partida', () => {
        expect(reconcilePanelLayout(null).pages).toHaveLength(defaultPanelLayout().pages.length);
        expect(reconcilePanelLayout({ version: 2 }).pages).toHaveLength(defaultPanelLayout().pages.length);
    });
    it('visão que não existe mais sai; tamanhos voltam à faixa; ids repetidos não duplicam', () => {
        const stored = {
            version: 1, navCollapsed: true, activePage: 'x',
            pages: [{ id: 'a', label: 'A', icon: 'x', cards: [
                { id: '1', source: { kind: 'painel', id: 'capture' }, w: 99, h: 5 },
                { id: '2', source: { kind: 'painel', id: 'naoExiste' }, w: 6, h: null },
                { id: '1', source: { kind: 'painel', id: 'inbox' }, w: 6, h: null },
                { id: '3', source: { kind: 'widget', spec: { kind: 'agora' } }, w: 6, h: 300 },
            ] }],
        };
        const r = reconcilePanelLayout(stored);
        expect(r.pages[0].cards.map(c => c.id)).toEqual(['1', '3']);
        expect(r.pages[0].cards[0]).toMatchObject({ w: 12, h: MIN_H });
        expect(r).toMatchObject({ navCollapsed: true, activePage: 'a' });
    });
});

describe('mural (packMasonry) — sem vão entre cartões', () => {
    const rows = (px: number) => Math.ceil((px + 14) / 2);
    /** Maior vão vertical entre um cartão e o próximo embaixo, e fundo livre por coluna. */
    function holes(places: ReturnType<typeof packMasonry>, cols: number) {
        const end = Math.max(...places.map(p => p.row + p.rows));
        let free = 0;
        for (let c = 1; c <= cols; c++) {
            const inCol = places.filter(p => p.col <= c && c < p.col + p.span).sort((a, b) => a.row - b.row);
            let cursor = 1;
            for (const p of inCol) { free = Math.max(free, p.row - cursor); cursor = p.row + p.rows; }
            free = Math.max(free, end - cursor);
        }
        return free;
    }

    it('página Hoje: cartão baixo ao lado de alto não deixa buraco (era 765 px)', () => {
        const items = [[8, 120], [4, 885], [8, 1200], [4, 1495], [8, 151], [4, 387], [8, 184], [4, 130]]
            .map(([span, px]) => ({ span, rows: rows(px), stretchable: true }));
        const places = packMasonry(items, 12);
        // O vão relatado: embaixo do cartão baixo (120 px) ao lado do alto (885 px).
        expect(places[2]).toMatchObject({ col: 1, row: places[0].row + places[0].rows });
        // Vão interno eliminado: cartões de 8 e 4 colunas alinham-se perfeitamente
        // sem deixar espaço ocioso (era 201 linhas / ~400px).
        expect(holes(places, 12)).toBe(0);
    });

    it('página Sistema: estreito depois de largos sobe para o lado (era 1038 px)', () => {
        const items = [[8, 1677], [4, 910], [8, 205], [8, 154], [4, 213]].map(([span, px]) => ({ span, rows: rows(px), stretchable: true }));
        const places = packMasonry(items, 12);
        expect(places[4]).toMatchObject({ col: 9, row: 1 + rows(910) });
        expect(places[4].stretched).toBe(true);
        expect(holes(places, 12)).toBe(0);
    });

    it('mantém a ordem salva por coluna e não estica cartão de altura fixa', () => {
        const places = packMasonry([{ span: 6, rows: 10, stretchable: false }, { span: 6, rows: 50, stretchable: true }], 12);
        expect(places[0]).toMatchObject({ col: 1, row: 1, rows: 10, stretched: false });
        expect(places[1]).toMatchObject({ col: 7, row: 1 });
    });

    it('uma coluna: empilha em ordem', () => {
        const places = packMasonry([{ span: 8, rows: 5, stretchable: true }, { span: 4, rows: 7, stretchable: true }], 1);
        expect(places.map(p => [p.col, p.row])).toEqual([[1, 1], [1, 6]]);
    });
});

describe('migração da página Protocolos (uma vez, registrada)', () => {
    /** Um layout salvo como o de antes de 26/10: sem a página e com o "Protocolos DFM" no Executar. */
    function savedBefore() {
        const state = layoutDeOnze();
        state.pages = state.pages.filter(p => p.id !== 'protocolos' && p.id !== 'missao');
        state.pages.find(p => p.id === 'executar')!.cards.splice(1, 0, { id: 'p-protocols', source: { kind: 'painel', id: 'protocols' }, w: 4, h: null });
        return JSON.parse(JSON.stringify(state));
    }
    const pageIds = (s: { pages: Array<{ id: string }> }) => s.pages.map(p => p.id);
    const executar = (s: any) => s.pages.find((p: any) => p.id === 'executar').cards.map((c: any) => c.source.id ?? c.source.spec?.kind);

    it('layout de partida (nada salvo): já traz a página; fica registrada como semeada', () => {
        const opened = panelLayoutOnOpen(undefined, undefined);
        expect(pageIds(opened.layout)).toContain('protocolos');
        expect(pageIds(opened.layout)).toContain('missao');
        expect(opened.seeded).toEqual(['protocolos', 'missao', 'missao-principal']);
        expect(opened).toMatchObject({ save: true, saveLayout: false });
    });

    it('layout salvo sem a página: ela entra no fim e o cartão antigo sai do Executar', () => {
        const opened = panelLayoutOnOpen(savedBefore(), undefined);
        expect(pageIds(opened.layout)).toContain('protocolos');
        expect(pageIds(opened.layout)).toContain('missao');
        expect(opened.layout.pages.find(p => p.id === 'protocolos')!.cards).toEqual(protocolsPage().cards);
        expect(opened.layout.pages.find(p => p.id === 'missao')!.cards).toEqual(missaoPage().cards);
        expect(executar(savedBefore())).toContain('protocols');
        expect(executar(opened.layout)).not.toContain('protocols');
        expect(opened).toMatchObject({ seeded: ['protocolos', 'missao', 'missao-principal'], save: true, saveLayout: true });
    });

    it('depois que o operador apagou a página, ela não volta', () => {
        const first = panelLayoutOnOpen(savedBefore(), undefined);
        const deleted = removePage(removePage(first.layout, 'protocolos'), 'missao');
        const again = panelLayoutOnOpen(deleted, first.seeded);
        expect(pageIds(again.layout)).not.toContain('protocolos');
        expect(pageIds(again.layout)).not.toContain('missao');
        expect(again).toMatchObject({ save: false, saveLayout: false });
    });

    it('idempotente: abrir de novo não muda nada; o cartão antigo que ele levou a outra página fica', () => {
        const first = seedPanelPages(reconcilePanelLayout(savedBefore()), []);
        const twice = seedPanelPages(first.layout, first.seeded);
        expect(twice).toEqual({ layout: first.layout, seeded: ['protocolos', 'missao', 'missao-principal'], changed: false });
        const moved = moveCard(reconcilePanelLayout(savedBefore()), 'p-protocols', 'sistema', Infinity);
        const seeded = seedPanelPages(moved, []);
        expect(seeded.layout.pages.find(p => p.id === 'sistema')!.cards.map(c => c.id)).toContain('p-protocols');
    });

    it('lista de semeadas ilegível vale vazia; o catálogo de cartões ainda oferece o antigo', () => {
        expect(seedPanelPages(reconcilePanelLayout(savedBefore()), 'lixo').seeded).toEqual(['protocolos', 'missao', 'missao-principal']);
        expect(LEGACY_PANELS.protocols.label).toBe('Protocolos DFM');
    });
});

describe('a moldura (proposta do Mission Control, 27/10/2026, item 4)', () => {
    it('trocar de aba não grava; mudar o layout grava', () => {
        const base = layoutDeOnze();
        expect(precisaGravar(base, { ...base, activePage: 'hoje' })).toBe(false);
        expect(precisaGravar(base, renamePage(base, 'hoje', 'Hoje!'))).toBe(true);
        expect(precisaGravar(base, { ...base, navCollapsed: !base.navCollapsed })).toBe(true);
    });
    it('a navegação começa recolhida abaixo de 760 px; o gesto da sessão vence', () => {
        expect(navRecolhida(700, false)).toBe(true);
        expect(navRecolhida(1200, false)).toBe(false);
        expect(navRecolhida(1200, true)).toBe(true);
        expect(navRecolhida(700, false, false)).toBe(false);
        expect(navRecolhida(0, false)).toBe(false);
    });
    it('as abas andam por ← → Home End, dando a volta', () => {
        const ids = ['a', 'b', 'c'];
        expect(abaPelaTecla(ids, 'a', 'ArrowRight')).toBe('b');
        expect(abaPelaTecla(ids, 'a', 'ArrowLeft')).toBe('c');
        expect(abaPelaTecla(ids, 'b', 'End')).toBe('c');
        expect(abaPelaTecla(ids, 'c', 'Home')).toBe('a');
        expect(abaPelaTecla(ids, 'b', 'Enter')).toBeNull();
    });
    it('nunca redesenha o cartão com o foco num campo dele, e só o que mudou', () => {
        expect(podeRedesenharCartao({ focoEmCampoDentro: true, desenhoMudou: true })).toBe(false);
        expect(podeRedesenharCartao({ focoEmCampoDentro: false, desenhoMudou: false })).toBe(false);
        expect(podeRedesenharCartao({ focoEmCampoDentro: false, desenhoMudou: true })).toBe(true);
    });
    it('a vista do painel usa as regras (guarda de fonte): grava por precisaGravar e desenha pelo podeRedesenharCartao', async () => {
        const { readFileSync } = await import('node:fs');
        const src = readFileSync(new URL('../../src/board/boardPanel.ts', import.meta.url), 'utf8');
        expect(src).toMatch(/if \(precisaGravar\(previous, next\)\) this\.save\(\)/);
        expect(src).toContain('podeRedesenharCartao(');
        expect(src).toContain("role: 'tablist'");
        expect(src).not.toMatch(/'title': |title: label/);
    });
});

describe('a Missão principal (arquitetura de 27/10/2026, §3.4)', () => {
    /** O layout do dono depois de `81095a6d`: a página Missão por último, com o cartão do widget recusado. */
    function depoisDaFase1() {
        const state = layoutDeOnze();
        state.pages = state.pages.filter(p => p.id !== 'missao');
        state.pages.push({ id: 'missao', label: 'Missão', icon: 'compass', cards: [{ id: 'w-missao', source: { kind: 'widget', spec: { kind: 'missao' } }, w: 12, h: null }] });
        state.activePage = 'inicio';
        return JSON.parse(JSON.stringify(state));
    }

    it('a semente converte a página da fase 1 na tela, em primeiro e a de abrir, uma vez', () => {
        const opened = panelLayoutOnOpen(depoisDaFase1(), ['protocolos', 'missao']);
        const first = opened.layout.pages[0];
        expect(first).toMatchObject({ id: 'missao', tela: 'missao', cards: [] });
        expect(opened.layout.activePage).toBe('missao');
        expect(opened.layout.pages.filter(p => p.id === 'missao')).toHaveLength(1);
        expect(opened).toMatchObject({ seeded: ['protocolos', 'missao', 'missao-principal'], save: true, saveLayout: true });
    });

    it('depois, o gesto do dono vale: a Missão movida para o fim fica lá', () => {
        const opened = panelLayoutOnOpen(depoisDaFase1(), ['protocolos', 'missao']);
        let moved = opened.layout;
        for (let i = 0; i < moved.pages.length; i++) moved = movePage(moved, 'missao', 1);
        const again = panelLayoutOnOpen(moved, opened.seeded);
        expect(again.layout.pages[again.layout.pages.length - 1].id).toBe('missao');
        expect(again).toMatchObject({ save: false, saveLayout: false });
    });

    it('a tela fica tela ao conferir o salvo, e cartão nela sai', () => {
        const opened = panelLayoutOnOpen(depoisDaFase1(), ['protocolos', 'missao']).layout;
        const sujo = JSON.parse(JSON.stringify(opened));
        sujo.pages[0].cards = [{ id: 'x', source: { kind: 'widget', spec: { kind: 'numeros' } }, w: 6, h: null }];
        const r = reconcilePanelLayout(sujo);
        expect(r.pages[0]).toMatchObject({ tela: 'missao', cards: [] });
        expect(reconcilePanelLayout({ ...sujo, pages: [{ ...sujo.pages[1], tela: 'outra' }] }).pages[0].tela).toBeUndefined();
    });

    it('abre na Missão quando ela é a primeira, mesmo com outra aba salva', () => {
        const opened = panelLayoutOnOpen(depoisDaFase1(), ['protocolos', 'missao']);
        const saved = { ...opened.layout, activePage: 'hoje' };
        expect(panelLayoutOnOpen(saved, opened.seeded).layout.activePage).toBe('missao');
        const semMissaoPrimeiro = movePage(saved, 'missao', 1);
        expect(panelLayoutOnOpen(semMissaoPrimeiro, opened.seeded).layout.activePage).toBe('hoje');
    });
});

describe('a forma gravada (P7d: o data.json sem a sobra)', () => {
    const salvo = {
        version: 1, navCollapsed: false, activePage: 'inicio',
        pages: [
            { id: 'inicio', label: 'Início', icon: 'home', cards: [
                { id: 'w-a', source: { kind: 'widget', spec: { kind: 'agora' } }, w: 12, h: null },
                { id: 'p-c', source: { kind: 'painel', id: 'capture' }, w: 6, h: 300, collapsed: true },
            ] },
            { id: 'missao', label: 'Missão', icon: 'compass', cards: [], tela: 'missao' },
        ],
    };
    it('o layout que não mudou se grava igual, byte a byte (sem collapsed: false, na mesma ordem das chaves)', () => {
        const texto = JSON.stringify(salvo, null, 2);
        expect(JSON.stringify(layoutParaGravar(reconcilePanelLayout(JSON.parse(texto))), null, 2)).toBe(texto);
    });
    it('a reconciliação não acrescenta o padrão; expandir tira a chave; o recolhido fica', () => {
        const r = reconcilePanelLayout(salvo);
        expect(Object.keys(r.pages[0].cards[0])).toEqual(['id', 'source', 'w', 'h']);
        expect(r.pages[0].cards[1].collapsed).toBe(true);
        const aberto = updateCard(r, 'p-c', { collapsed: false });
        expect('collapsed' in aberto.pages[0].cards[1]).toBe(false);
        expect(JSON.stringify(layoutParaGravar(aberto))).not.toContain('collapsed');
        // Idempotente: gravar o gravado não muda nada.
        const uma = layoutParaGravar(r);
        expect(JSON.stringify(layoutParaGravar(reconcilePanelLayout(uma)))).toBe(JSON.stringify(uma));
    });
});
