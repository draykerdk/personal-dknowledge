/**
 * Guarda positivo do CSS das peças novas: cada classe que o código desenha tem
 * regra no styles.css. Nasceu de um caso real — uma remoção de bloco levou junto
 * o CSS do kanban da consulta, e nada acusou.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
const src = (f: string) => readFileSync(new URL(`../../src/${f}`, import.meta.url), 'utf8');

describe('CSS das peças novas', () => {
    it.each([
        '.dfm-bw-kanban', '.dfm-bw-kcol', '.dfm-bw-kcard', '.dfm-bw-group', '.dfm-bw-gantt', '.dfm-bw-matrix',
        // O nó de tarefa de 19/10 (arquitetura 4.7) não desenha mais a barra de avanço nem o
        // botão ✎: a SMART mostra a linha da gramática e o ↗️ Abrir está nas ações.
        '.dfm-tc', '.dfm-tc-check', '.dfm-tc-top', '.dfm-tc-title', '.dfm-tc-why', '.dfm-tc-actions', '.dfm-tc-act',
        '.dfm-pc-grid', '.dfm-pc-card', '.dfm-pc-grip', '.dfm-pc-resize', '.dfm-bp-tabs', '.dfm-bp-tab', '.dfm-bp-nav', '.dfm-bp-empty', '.dfm-bp-row',
        '.dfm-triage-card',
        '.dfm-cbar', '.dfm-cbar-btn', '.dfm-cbar-sep', '.dfm-cbar-ghost', '.dfm-sel', '.dfm-sel-sep',
    ])('%s tem regra', cls => {
        expect(css).toMatch(new RegExp(`${cls.replace('.', '\\.')}[\\s{:.,>)]`));
    });

    it('toda classe dfm-tc- desenhada pelo cartão de tarefa tem regra', () => {
        const drawn = new Set([...src('canvas/taskCard.ts').matchAll(/\$\{ROOT\}-([a-z]+)/g)].map(m => `dfm-tc-${m[1]}`));
        expect(drawn.size).toBeGreaterThan(5);
        for (const cls of drawn) expect(css, cls).toContain(`.${cls}`);
    });

    it('toda classe dfm-bw-pr-/dfm-prm desenhada pela página Protocolos tem regra', () => {
        const drawn = new Set(['board/protocolRender.ts', 'board/protocolActions.ts'].flatMap(f => [...src(f).matchAll(/['\s](dfm-(?:bw-pr|prm)(?:-[a-z]+)*)['\s]/g)].map(m => m[1])));
        expect(drawn.size).toBeGreaterThan(30);
        for (const cls of drawn) expect(css, cls).toMatch(new RegExp(`\\.${cls}[\\s{:.,>)\\[]`));
    });

    it('toda classe dfm-pc-/dfm-bp- desenhada pelo painel tem regra', () => {
        const drawn = new Set([...src('board/boardPanel.ts').matchAll(/'(dfm-(?:pc|bp)-[a-z-]+)'/g)].map(m => m[1]));
        for (const cls of drawn) expect(css, cls).toContain(`.${cls}`);
    });

    it('toda classe desenhada pelo componente da Missão tem regra (ou é um gancho declarado)', () => {
        // Os ganchos: classes que só o código e os testes procuram (a escala do mapa, o
        // campo da busca, o tipo do nó, o título do painel, a faixa das de hora marcada, que se
        // desenha como as outras faixas) e os prefixos montados (k-, t-).
        const GANCHOS = new Set(['per-txt', 'sc-dia', 'q', 'k-', 't-', 'card', 'n-task', 'dr-title', 'horas']);
        const files = ['componente', 'linhas', 'nos', 'ligacoes', 'painelDoNo', 'dom', 'triagem', 'gaveta'].map(f => src(`missao/view/${f}.ts`));
        const drawn = new Set<string>();
        for (const s of files) {
            const calls = [...s.matchAll(/\bel\(\s*(?:ctx\.)?doc,\s*'[a-z0-9]+',\s*[`']([^`']*)[`']/g), ...s.matchAll(/\bbotao\(\s*(?:ctx\.)?doc,\s*[`']([^`']*)[`']/g)];
            for (const m of calls) for (const t of m[1].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) if (/^[a-z][a-z0-9-]*$/.test(t)) drawn.add(t);
        }
        expect(drawn.size).toBeGreaterThan(60);
        const sem = [...drawn].filter(c => !GANCHOS.has(c) && !new RegExp(`\\.${c}(?![a-z0-9-])`).test(css));
        expect(sem).toEqual([]);
        // As classes montadas pelo ramo e pelo estado também têm regra.
        for (const c of ['.br-0', '.br-5', '.br-nb', '.pl-0', '.pl-3', '.pl-unk', '.t-pontilhado', '.t-tracejado', '.st-done', '.st-pend', '.st-some', '.c-trabalho', '.c-tempo', '.c-junto', '.sn-cel', '.is-tela-missao']) expect(css, c).toContain(c);
    });
});
