/**
 * Testes do modelo de trimestre.
 *
 * O que se prova aqui é uma coisa só, e ela é fácil de quebrar sem perceber:
 * **a ordem das substituições**. `{{date:Q}}` aparece dentro de `Q{{date:Q}}` no
 * modelo do operador; trocar na ordem errada produz `QQ3` ou perde o `Q` escrito
 * à mão. Como isso é contrato de formato de nota, e não detalhe de tela, mora no
 * motor e tem teste.
 */
import { describe, expect, it } from 'vitest';
import {
    QUARTER_TEMPLATE_PATH,
    fallbackQuarterNote,
    fillQuarterTemplate,
    formatQuarterDate,
    quarterNotePath,
    quarterNumber,
    quarterYear,
} from '../../src/engine/cycleTemplate';

describe('quarterYear / quarterNumber', () => {
    it('lê ano e número da chave canônica', () => {
        expect(quarterYear('2026-Q3')).toBe('2026');
        expect(quarterNumber('2026-Q3')).toBe('3');
        expect(quarterNumber('2026-Q1')).toBe('1');
        expect(quarterNumber('2026-Q4')).toBe('4');
    });

    it('devolve vazio em chave malformada em vez de inventar', () => {
        expect(quarterYear('2026')).toBe('');
        expect(quarterNumber('2026')).toBe('');
        expect(quarterNumber('2026-Q5')).toBe('');
        expect(quarterYear('')).toBe('');
        expect(quarterNumber('')).toBe('');
    });
});

describe('formatQuarterDate', () => {
    it('resolve o formato que o modelo do operador realmente usa', () => {
        // `# Trimestre {{date:YYYY-[Q]Q}}` é a linha 21 de
        // `200 - FUNCTIONS/Models/Modelo Trimestral 1 ano em 12 semanas.md`.
        // Nenhum dos três padrões que o Control Center antigo trocava casa com
        // ele — a nota nascia com o marcador literal no título.
        expect(formatQuarterDate('YYYY-[Q]Q', '2026-Q3')).toBe('2026-Q3');
        expect(formatQuarterDate('YYYY-[Q]Q', '2026-Q1')).toBe('2026-Q1');
    });

    it('distingue o literal entre colchetes do token de trimestre', () => {
        // `[Q]` é a letra Q; `Q` sozinho é o número. Sem essa distinção,
        // `YYYY-[Q]Q` sairia como `2026-33`.
        expect(formatQuarterDate('[Q]Q', '2026-Q3')).toBe('Q3');
        expect(formatQuarterDate('Q', '2026-Q3')).toBe('3');
        expect(formatQuarterDate('QQ', '2026-Q3')).toBe('33');
    });

    it('resolve ano, mês e semana', () => {
        expect(formatQuarterDate('YYYY', '2026-Q3')).toBe('2026');
        expect(formatQuarterDate('MM', '2026-Q3')).toBe('07');
        expect(formatQuarterDate('M', '2026-Q4')).toBe('10');
        expect(formatQuarterDate('YYYY-WW', '2026-Q3')).toBe('2026-27');
    });

    it('preserva texto que não é token', () => {
        // O formatador recebe só o FORMATO (o conteúdo de `{{date:…}}`), não o
        // marcador inteiro: texto solto no meio do formato é copiado.
        expect(formatQuarterDate('Ano YYYY', '2026-Q3')).toBe('Ano 2026');
        expect(formatQuarterDate('YYYY/Q', '2026-Q1')).toBe('2026/1');
    });

    it('trimestre malformado devolve vazio em vez de texto inventado', () => {
        expect(formatQuarterDate('YYYY-[Q]Q', 'sem-formato')).toBe('');
        expect(formatQuarterDate('YYYY', '2026')).toBe('');
    });
});

describe('fillQuarterTemplate', () => {
    it('a linha real do modelo vira o título certo', () => {
        const linha = '# Trimestre {{date:YYYY-[Q]Q}}';
        expect(fillQuarterTemplate(linha, '2026-Q4')).toBe('# Trimestre 2026-Q4');
        expect(fillQuarterTemplate(linha, '2026-Q4')).not.toContain('{{');
    });

    it('substitui todas as ocorrências e preserva o resto do texto', () => {
        const template = [
            '# {{date:YYYY}} — {{date:YYYY-[Q]Q}}',
            'Trimestre {{date:Q}} de {{date:YYYY}}.',
        ].join('\n');
        const filled = fillQuarterTemplate(template, '2026-Q3');
        expect(filled).toContain('# 2026 — 2026-Q3');
        expect(filled).toContain('Trimestre 3 de 2026.');
        expect(filled).not.toContain('{{date:');
    });

    it('mantém os marcadores que não são de data — quem os preenche é o protocolo', () => {
        // `{{visao}}`, `{{valores}}`, `{{compromisso}}`… são campos que o
        // planejamento trimestral preenche depois. Apagá-los aqui destruiria o
        // modelo do operador.
        const template = '> **Tema:** {{palavra_trimestre}}\n> **Visão:** {{visao}}';
        const filled = fillQuarterTemplate(template, '2026-Q3');
        expect(filled).toContain('{{palavra_trimestre}}');
        expect(filled).toContain('{{visao}}');
    });

    it('sem marcador nenhum, devolve o texto intacto', () => {
        const template = 'Nota sem marcador.';
        expect(fillQuarterTemplate(template, '2026-Q3')).toBe(template);
    });
});

describe('fallbackQuarterNote', () => {
    it('nasce com o mínimo que o resto do sistema lê', () => {
        const note = fallbackQuarterNote('2026-Q3');
        expect(note).toContain('type: quarterly_note');
        expect(note).toContain('quarter: "2026-Q3"');
        expect(note).toContain('year: "2026"');
        expect(note).toContain('status: open');
    });

    it('não inventa objetivo nem tema — deixa o campo aberto', () => {
        const note = fallbackQuarterNote('2026-Q4');
        expect(note).toContain('**Tema:** a definir');
        // O campo que o motor lê é a chave de frontmatter `theme:`; ela não pode
        // existir preenchida por um esqueleto, senão o trimestre nasceria com
        // tema declarado pelo sistema em vez de pelo operador.
        expect(note).not.toMatch(/^theme:/m);
        expect(note).not.toMatch(/^objetivos:/m);
    });
});

describe('caminhos', () => {
    it('a nota do trimestre mora onde o motor a lê', () => {
        expect(quarterNotePath('2026-Q3')).toBe('300 - RUNTIME/302 - Daymiss/Quarterly/2026-Q3.md');
    });

    it('o modelo é o do operador, no caminho declarado', () => {
        expect(QUARTER_TEMPLATE_PATH).toBe('200 - FUNCTIONS/Models/Modelo Trimestral 1 ano em 12 semanas.md');
    });
});
