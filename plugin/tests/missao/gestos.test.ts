/**
 * As regras dos gestos que gravam (arquitetura da página Missão, §3.2, §8.4, §12): a ordem
 * dos passos, os problemas em palavras, a hora no `scheduled` e o Desfazer que só desfaz o
 * que ainda está lá. A equivalência com a seta do canvas fica em gestosEquivalencia.test.ts.
 */
import { describe, expect, it } from 'vitest';
import type { LinkTask, ProjectRef } from '../../src/canvas/edgeLinks';
import { comporPassos, mesmoDiaNaSemana, passosDoGesto, patchDaHora, patchDeDesfazer, patchDoGesto, rotuloDoGesto, type ContextoDoGesto } from '../../src/missao/gestos';

const task = (basename: string, over: Partial<LinkTask> = {}): LinkTask => ({ path: `TaskNotes/Tasks/${basename}.md`, basename, type: 'task', projects: [], ...over });
const smart = task('S', { type: 'tarefa_smart', projects: ['Alfa'], week: '2026-W44', impacto: 7 });
const smartB = task('SB', { type: 'tarefa_smart', projects: ['Beta'], week: '2026-W45' });
const acao = task('A');
const alfa: ProjectRef = { name: 'Alfa', keys: ['alfa'] };
const beta: ProjectRef = { name: 'Beta', keys: ['beta'] };
const ctx: ContextoDoGesto = { isSmartName: n => ['s', 'sb'].includes(n.toLowerCase()), smartPorNome: n => ({ s: smart, sb: smartB } as Record<string, LinkTask>)[n.toLowerCase()] ?? null };

describe('os passos de cada gesto, pela tabela das setas', () => {
    it('mudar de projeto: tira a mãe, tira o projeto antigo e põe o novo, nessa ordem', () => {
        const { passos } = passosDoGesto({ projects: ['[[S]]'] }, acao, { gesto: 'projeto', projeto: beta, de: alfa }, ctx);
        expect(passos.map(p => `${p.op}:${p.link.kind}:${p.link.value}`)).toEqual(['desligar:mother:S', 'desligar:project:Alfa', 'ligar:project:Beta']);
    });

    it('pôr numa SMART só liga a mãe nova: a de agora fica (02/11, a segunda SMART se soma)', () => {
        const { passos } = passosDoGesto({ projects: ['[[S]]'] }, acao, { gesto: 'ligar-smart', smart: smartB }, ctx);
        expect(passos.map(p => `${p.op}:${p.link.value}`)).toEqual(['ligar:SB']);
        expect(patchDoGesto({ projects: ['[[S]]'], week: '2026-W44' }, acao, { gesto: 'ligar-smart', smart: smartB }, ctx).patch).toEqual({ projects: ['[[S]]', '[[SB]]'] });
    });

    it('a mudança de projeto com a mãe tirada primeiro não deixa o projeto antigo de volta', () => {
        const r = patchDoGesto({ projects: ['[[S]]'], week: '2026-W44' }, acao, { gesto: 'projeto', projeto: beta, de: alfa }, ctx);
        expect(r.patch).toEqual({ projects: ['[[Beta]]'] });
    });

    it('sem a ordem (pôr o novo antes de tirar a mãe), o projeto antigo voltaria: a ordem é a regra', () => {
        const fora = comporPassos({ projects: ['[[S]]'] }, [
            ...passosDoGesto({ projects: ['[[S]]'] }, acao, { gesto: 'projeto', projeto: beta, de: null }, ctx).passos.reverse(),
        ], ctx);
        expect(fora?.projects).toEqual(['[[Beta]]', '[[Alfa]]']);
    });

    it('a SMART não muda de dia: vai para a semana do dia', () => {
        const r = patchDoGesto({ week: '2026-W44' }, smart, { gesto: 'dia', data: '2026-11-04' }, ctx);
        expect(r.patch).toEqual({ week: '2026-W45' });
        expect(r.patch).not.toHaveProperty('scheduled');
    });

    it('mudar de dia mantém a hora (a seta dia → ação)', () => {
        expect(patchDoGesto({ scheduled: '2026-10-28T14:00', week: '2026-W44' }, acao, { gesto: 'dia', data: '2026-10-30' }, ctx).patch)
            .toEqual({ scheduled: '2026-10-30T14:00' });
    });

    it('soltar no mesmo lugar não grava nada', () => {
        expect(patchDoGesto({ scheduled: '2026-10-28', week: '2026-W44' }, acao, { gesto: 'dia', data: '2026-10-28' }, ctx).patch).toBeNull();
        expect(patchDoGesto({ projects: ['[[Alfa]]'] }, acao, { gesto: 'projeto', projeto: alfa, de: alfa }, ctx).problema).toBe('já está neste projeto');
        expect(patchDoGesto({ projects: ['[[S]]'], week: '2026-W44', impacto: 7 }, acao, { gesto: 'ligar-smart', smart }, ctx).patch).toBeNull();
    });

    it('os problemas vêm em palavras e não gravam', () => {
        expect(patchDoGesto({}, acao, { gesto: 'dia', data: '28/10' }, ctx)).toMatchObject({ patch: null, problema: expect.stringContaining('AAAA-MM-DD') });
        expect(patchDoGesto({}, acao, { gesto: 'semana', semana: 'W45' }, ctx)).toMatchObject({ patch: null });
        expect(patchDoGesto({}, smart, { gesto: 'ligar-smart', smart }, ctx).problema).toBeTruthy();
        expect(patchDoGesto({}, acao, { gesto: 'ligar-smart', smart: { ...smart, path: acao.path } }, ctx).problema).toContain('ela mesma');
    });

    it('"Sem data" tira o dia e a semana, e só eles', () => {
        expect(patchDoGesto({ scheduled: '2026-10-28T09:00', week: '2026-W44', due: '2026-11-01', projects: ['[[Alfa]]'] }, acao, { gesto: 'sem-data' }, ctx).patch)
            .toEqual({ scheduled: null, week: null });
    });

    it('a ação agendada vai para o mesmo dia da semana; sem dia, só a semana', () => {
        expect(mesmoDiaNaSemana('2026-10-28', '2026-W45')).toBe('2026-11-04');
        expect(mesmoDiaNaSemana('2026-11-01', '2026-W44')).toBe('2026-11-01');
        expect(mesmoDiaNaSemana('x', '2026-W45')).toBe('');
        expect(patchDoGesto({ week: '2026-W44' }, acao, { gesto: 'semana', semana: '2026-W45' }, ctx).patch).toEqual({ week: '2026-W45' });
    });
});

describe('a hora (§8.4)', () => {
    it('é o próprio scheduled, com a hora; tirar a hora deixa o dia', () => {
        expect(patchDaHora({ scheduled: '2026-10-28' }, acao, '14:30').patch).toEqual({ scheduled: '2026-10-28T14:30' });
        expect(patchDaHora({ scheduled: '2026-10-28T14:30' }, acao, null).patch).toEqual({ scheduled: '2026-10-28' });
        expect(patchDaHora({ scheduled: '2026-10-28T14:30' }, acao, '14:30').patch).toBeNull();
    });
    it('sem dia, na SMART ou fora do formato, diz por quê', () => {
        expect(patchDaHora({}, acao, '14:00').problema).toContain('precisa de um dia');
        expect(patchDaHora({ scheduled: '2026-10-28' }, smart, '14:00').problema).toContain('SMART');
        expect(patchDaHora({ scheduled: '2026-10-28' }, acao, '25:00').problema).toContain('HH:MM');
    });
});

describe('o Desfazer só desfaz o que ainda está lá (§12)', () => {
    it('volta cada campo que ainda tem o valor gravado', () => {
        const r = patchDeDesfazer({ scheduled: '2026-10-30T14:00', week: '2026-W44' }, { scheduled: '2026-10-28T14:00' }, { scheduled: '2026-10-30T14:00' });
        expect(r).toEqual({ patch: { scheduled: '2026-10-28T14:00' }, ficaram: [] });
    });
    it('o campo que mudou depois (a seta, o TaskNotes, o Sync) fica', () => {
        const r = patchDeDesfazer({ scheduled: '2026-11-02' }, { scheduled: '2026-10-28' }, { scheduled: '2026-10-30' });
        expect(r).toEqual({ patch: null, ficaram: ['scheduled'] });
    });
    it('o campo que não existia antes sai; o que foi apagado volta, se ainda está apagado', () => {
        expect(patchDeDesfazer({ week: '2026-W45', impacto: 7 }, { week: undefined, impacto: undefined }, { week: '2026-W45', impacto: 7 }).patch).toEqual({ week: null, impacto: null });
        expect(patchDeDesfazer({}, { scheduled: '2026-10-28' }, { scheduled: null }).patch).toEqual({ scheduled: '2026-10-28' });
        expect(patchDeDesfazer({ scheduled: '2026-11-01' }, { scheduled: '2026-10-28' }, { scheduled: null })).toEqual({ patch: null, ficaram: ['scheduled'] });
    });
    it('desfaz em parte: só o que ficou como o gesto deixou', () => {
        const r = patchDeDesfazer({ projects: ['[[Beta]]'], week: '2026-W50' }, { projects: ['[[S]]'], week: '2026-W44' }, { projects: ['[[Beta]]'], week: '2026-W45' });
        expect(r).toEqual({ patch: { projects: ['[[S]]'] }, ficaram: ['week'] });
    });
});

describe('o aviso', () => {
    it('diz quem foi para onde', () => {
        expect(rotuloDoGesto(acao, { gesto: 'projeto', projeto: beta, de: alfa })).toBe('Ação A → projeto Beta');
        expect(rotuloDoGesto(smart, { gesto: 'semana', semana: '2026-W45' })).toBe('SMART S → W45');
        expect(rotuloDoGesto(acao, { gesto: 'hora', hora: null })).toBe('Ação A → sem hora');
    });
});

describe('a saída da entrada (D1, 02/11)', () => {
    const comEntrada: ContextoDoGesto = { ...ctx, aoGanharLugar: s => (s === 'inbox' ? 'next-action' : null) };
    it('o dia ou a semana dados à tarefa da entrada a tiram de lá no mesmo patch; os outros gestos e estados não mudam o status', () => {
        expect(patchDoGesto({ status: 'inbox' }, acao, { gesto: 'dia', data: '2026-11-04' }, comEntrada).patch).toMatchObject({ scheduled: '2026-11-04', status: 'next-action' });
        expect(patchDoGesto({ status: 'inbox' }, acao, { gesto: 'semana', semana: '2026-W46' }, comEntrada).patch).toMatchObject({ week: '2026-W46', status: 'next-action' });
        expect(patchDoGesto({ status: 'waiting-on' }, acao, { gesto: 'dia', data: '2026-11-04' }, comEntrada).patch?.status).toBeUndefined();
        expect(patchDoGesto({ status: 'inbox' }, acao, { gesto: 'dia', data: '2026-11-04' }, ctx).patch?.status).toBeUndefined();
    });
});
