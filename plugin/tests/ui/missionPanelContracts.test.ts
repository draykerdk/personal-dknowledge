/**
 * Contrato entre os painéis e a folha de estilo.
 *
 * Uma classe usada no TypeScript e ausente no CSS não dá erro em lugar nenhum:
 * o elemento simplesmente sai sem estilo, e ninguém descobre até olhar a tela —
 * ou até que alguém perceba que o cartão está centralizado por herdar a base de
 * outra linha (foi exatamente o que aconteceu com `.mc-plan-node`).
 *
 * Este teste fecha essa porta: toda classe `mc-*` referenciada pelos painéis do
 * console precisa existir em `styles.css`, e nenhuma delas pode ser órfã ao
 * contrário — classe definida e nunca usada é peso morto que confunde a próxima
 * leitura.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
const MISSION_DIR = new URL('../../src/ui/mission/', import.meta.url);
const HOST_FILE = new URL('../../src/board/hostedPanels.ts', import.meta.url);

const panelFiles = readdirSync(MISSION_DIR).filter(name => name.endsWith('.ts'));
const sources: Array<{ name: string; text: string }> = panelFiles.map(name => ({
    name,
    text: readFileSync(new URL(name, MISSION_DIR), 'utf8'),
}));
sources.push({ name: 'hostedPanels.ts', text: readFileSync(HOST_FILE, 'utf8') });

/** Classes `mc-*` citadas em strings dos painéis. */
function referencedClasses(text: string): Set<string> {
    const found = new Set<string>();
    for (const match of text.matchAll(/['"`]([^'"`]*\bmc-[a-z0-9-]+[^'"`]*)['"`]/g)) {
        for (const token of match[1].split(/\s+/)) {
            if (/^mc-[a-z0-9-]+$/.test(token)) found.add(token);
        }
    }
    return found;
}

/** Classes `mc-*` definidas como seletor no CSS. */
function definedClasses(text: string): Set<string> {
    const found = new Set<string>();
    for (const match of text.matchAll(/\.(mc-[a-z0-9-]+)/g)) found.add(match[1]);
    return found;
}

const defined = definedClasses(css);

describe('painéis × folha de estilo', () => {
    it('as fontes existem (o teste não pode passar por vacuidade)', () => {
        expect(sources.length).toBeGreaterThan(8);
        expect(sources.map(s => s.name)).toContain('panelMatrix.ts');
        expect(defined.size).toBeGreaterThan(50);
    });

    it('toda classe das superfícies novas existe no CSS', () => {
        // Escopo deliberado: os painéis antigos usam classes-gancho sem regra
        // própria (`.mc-nudge`, `.mc-project`, `.mc-canvas`…) que existem só para
        // o teste e para o toggle de estado — cobrar CSS para elas seria cobrar
        // estilo onde não há o que estilizar. As superfícies desta janela, ao
        // contrário, nasceram com contrato visual: cada classe delas PINTА algo.
        const NEW_NAMESPACES = ['mc-graph-', 'mc-plan-', 'mc-matrix-', 'mc-timeline-', 'mc-radar-', 'mc-habit-', 'mc-bench-', 'mc-capture-', 'mc-tool-', 'mc-blocker-', 'mc-nudge-', 'mc-viewport-', 'mc-portfolio-', 'mc-inbox-', 'mc-chart-'];
        const missing: Array<{ file: string; cls: string }> = [];
        for (const source of sources) {
            for (const cls of referencedClasses(source.text)) {
                if (!NEW_NAMESPACES.some(prefix => cls.startsWith(prefix))) continue;
                if (!defined.has(cls)) missing.push({ file: source.name, cls });
            }
        }
        // O relatório é a própria asserção: aponta arquivo e classe em vez de
        // só dizer que algo falta.
        expect(missing).toEqual([]);
    });
    // O grafo da missão, o plano da semana e o mapa de canvas (com as provas das classes deles) saíram em
    // 03/11/2026 com o código aposentado.
});
