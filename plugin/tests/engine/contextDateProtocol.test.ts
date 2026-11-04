import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * `JSONProtocol.getContextDate` com um canvas de semana ou de trimestre ativo:
 * hoje, se hoje cai no período; senão, o início do período. A hora é a do relógio.
 */
vi.mock('obsidian', () => ({
    App: class {},
    Notice: class {},
    TFile: class {},
    Modal: class { open() {} close() {} },
    SuggestModal: class { open() {} close() {} },
    FuzzySuggestModal: class { open() {} close() {} },
    ItemView: class {},
    Setting: class {},
    PluginSettingTab: class {},
    Plugin: class {},
}));

import { JSONProtocol } from '../../src/engine/jsonProtocol';

const TODAY = '2026-10-14';

/** Um `moment` mínimo: só datas `AAAA-MM-DD`, hora ajustável. */
function fakeMoment(date: string, clock = { h: 9, m: 30, s: 5, ms: 7 }) {
    const st = { date, ...clock };
    const api: any = {
        isValid: () => /^\d{4}-\d{2}-\d{2}$/.test(st.date),
        format: (fmt: string) => (fmt === 'YYYY-MM-DD' ? st.date : `${st.date} ${st.h}:${st.m}`),
    };
    for (const [name, key] of [['hour', 'h'], ['minute', 'm'], ['second', 's'], ['millisecond', 'ms']] as const) {
        api[name] = (v?: number) => (v === undefined ? (st as any)[key] : ((st as any)[key] = v, api));
    }
    return api;
}

function protocolWithActive(active: { name: string; basename: string; extension: string } | null) {
    const plugin: any = { app: { workspace: { getActiveFile: () => active } }, settings: {} };
    return new JSONProtocol(plugin, { id: 'teste', name: 'Teste' });
}

const original = (globalThis as any).window;
afterEach(() => { (globalThis as any).window = original; });

function withMoment() {
    (globalThis as any).window = { moment: (input?: string) => fakeMoment(input ?? TODAY, input ? { h: 0, m: 0, s: 0, ms: 0 } : undefined) };
}

describe('data de contexto com canvas temporal ativo', () => {
    it('canvas da semana atual: hoje, com a hora do relógio', () => {
        withMoment();
        const d = protocolWithActive({ name: '2026-W42.canvas', basename: '2026-W42', extension: 'canvas' }).getContextDate();
        expect(d.format('YYYY-MM-DD')).toBe(TODAY);
        expect(d.hour()).toBe(9);
    });

    it('canvas de outra semana: a segunda-feira dela', () => {
        withMoment();
        expect(protocolWithActive({ name: '2026-W43.canvas', basename: '2026-W43', extension: 'canvas' }).getContextDate().format('YYYY-MM-DD')).toBe('2026-10-19');
    });

    it('canvas do trimestre atual: hoje (antes virava 01/10)', () => {
        withMoment();
        expect(protocolWithActive({ name: '2026-Q4.canvas', basename: '2026-Q4', extension: 'canvas' }).getContextDate().format('YYYY-MM-DD')).toBe(TODAY);
    });

    it('canvas de outro trimestre: o primeiro dia dele', () => {
        withMoment();
        expect(protocolWithActive({ name: '2026-Q3.canvas', basename: '2026-Q3', extension: 'canvas' }).getContextDate().format('YYYY-MM-DD')).toBe('2026-07-01');
    });

    it('nota diária .md segue valendo a data dela', () => {
        withMoment();
        expect(protocolWithActive({ name: '2026-10-05.md', basename: '2026-10-05', extension: 'md' }).getContextDate().format('YYYY-MM-DD')).toBe('2026-10-05');
    });
});
