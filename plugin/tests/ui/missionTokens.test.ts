/**
 * Testes dos tokens visuais.
 *
 * O contrato que estes testes protegem é o requisito do usuário: usar as cores
 * padrão do Obsidian. Nenhum token pode devolver cor literal — todo tom resolve
 * em `var(--*)`. Se alguém colar um `#ff4015` no arquivo, isto quebra.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('obsidian', () => ({ Notice: class {}, setIcon: () => {} }));

import {
    healthToken,
    impactTone,
    priorityToken,
    severityToken,
    statusToken,
    tierToken,
    toneColor,
    MissionTone,
} from '../../src/ui/mission/tokens';

const TONES: MissionTone[] = ['accent', 'green', 'orange', 'yellow', 'cyan', 'blue', 'purple', 'red', 'muted'];

describe('toneColor', () => {
    it('resolve todo tom em variável nativa do Obsidian', () => {
        for (const tone of TONES) {
            expect(toneColor(tone)).toMatch(/^var\(--/);
        }
    });

    it('não contém nenhuma cor literal', () => {
        for (const tone of TONES) {
            expect(toneColor(tone)).not.toMatch(/#[0-9a-f]{3,8}/i);
            expect(toneColor(tone)).not.toMatch(/rgb|hsl/i);
        }
    });
});

describe('statusToken', () => {
    it('respeita a semântica do Canvas (mesma cor do nó)', () => {
        expect(statusToken('in-progress').tone).toBe('orange');
        expect(statusToken('done').tone).toBe('green');
        expect(statusToken('next-action').tone).toBe('purple');
        expect(statusToken('inbox').tone).toBe('cyan');
        expect(statusToken('waiting-on').tone).toBe('red');
        expect(statusToken('someday').tone).toBe('yellow');
    });

    it('é tolerante a caixa e a status desconhecido', () => {
        expect(statusToken('IN-PROGRESS').tone).toBe('orange');
        expect(statusToken('qualquer').tone).toBe('muted');
        expect(statusToken('').label).toBe('sem status');
    });

    it('sempre traz rótulo e ícone', () => {
        for (const status of ['inbox', 'next-action', 'in-progress', 'waiting-on', 'someday', 'done', 'cancelled']) {
            const token = statusToken(status);
            expect(token.label.length).toBeGreaterThan(0);
            expect(token.icon.length).toBeGreaterThan(0);
        }
    });
});

describe('healthToken / tierToken / cycleStateToken / severityToken', () => {
    it('projeto sem dados não é pintado como falha', () => {
        expect(healthToken('no-data').tone).toBe('muted');
        expect(healthToken('at-risk').tone).toBe('orange');
        expect(healthToken('on-track').tone).toBe('green');
    });

    it('tier ativo é amarelo, concluído verde, bloqueado apagado', () => {
        expect(tierToken('ativo').tone).toBe('yellow');
        expect(tierToken('done').tone).toBe('green');
        expect(tierToken('locked').tone).toBe('muted');
    });

    it('severidade desconhecida cai em info', () => {
        expect(severityToken('critical').tone).toBe('red');
        expect(severityToken('warning').tone).toBe('orange');
        expect(severityToken('seja-o-que-for').tone).toBe('blue');
    });
});

describe('priorityToken / impactTone / ratioTone', () => {
    it('prioridade normal fica discreta', () => {
        expect(priorityToken('normal').tone).toBe('muted');
        expect(priorityToken('high').tone).toBe('red');
        expect(priorityToken('low').tone).toBe('blue');
    });

    it('impacto cresce em tom, e ausência de impacto é muted', () => {
        expect(impactTone(null)).toBe('muted');
        expect(impactTone(2)).toBe('muted');
        expect(impactTone(5)).toBe('blue');
        expect(impactTone(8)).toBe('orange');
        expect(impactTone(10)).toBe('red');
    });
});
