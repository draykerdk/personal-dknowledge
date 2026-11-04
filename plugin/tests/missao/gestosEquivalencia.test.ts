/**
 * A prova de equivalência do P6 (arquitetura da página Missão, §3.2): o gesto na Missão e
 * a seta no canvas dão o mesmo frontmatter.
 *
 * O lado do canvas é o caminho real das setas: o canvas antes e depois de cada gesto,
 * `diffLinks` diz o que ligou e o que desligou, e os patches são aplicados como o
 * observador faz (`edgeLinkWatcher.compare`: acréscimos antes das remoções), um gesto de
 * canvas por vez. O lado da Missão é `patchDoGesto`, numa gravação só. Os dois partem do
 * mesmo frontmatter e têm de chegar ao mesmo.
 */
import { describe, expect, it } from 'vitest';
import { diffLinks, endOf, linkFor, patchFor, unpatchFor } from '../../src/canvas/edgeLinks';
import type { CanvasLike, EdgeContext, LinkTask, Patch, ProjectRef } from '../../src/canvas/edgeLinks';
import { patchDoGesto, type ContextoDoGesto, type Intencao } from '../../src/missao/gestos';

// Um hash qualquer para o id `pj-<hash>` das pontas (o djb2 do antigo `temporal/weekBlockModel.ts`, que
// saiu em 03/11/2026 com os canvas da semana e do trimestre; as setas só leem o mapa `projectsByHash`).
function hashId(value: string): string {
    let h = 5381;
    for (let i = 0; i < value.length; i++) h = ((h << 5) + h + value.charCodeAt(i)) >>> 0;
    return h.toString(36);
}

const task = (basename: string, over: Partial<LinkTask> = {}): LinkTask => ({
    path: `TaskNotes/Tasks/${basename}.md`, basename, type: 'task', projects: [], ...over,
});

const venda: ProjectRef = { name: 'Venda de afiliados', keys: ['venda de afiliados', 'venda'] };
const livro: ProjectRef = { name: 'Livro', keys: ['livro'] };
const smart = task('Publicar 2 vídeos (W42)', { type: 'tarefa_smart', projects: ['Venda de afiliados'], week: '2026-W42', impacto: 8 });
const smart2 = task('Cadastrar lojas (W41)', { type: 'tarefa_smart', projects: ['Venda de afiliados'], week: '2026-W41' });
const smartLivro = task('Revisar capítulo (W43)', { type: 'tarefa_smart', projects: ['Livro'], week: '2026-W43', impacto: 6 });
const acao = task('Gravar vídeo');
const solta = task('Editar vídeo');
const smartSolta = task('Abrir loja (W42)', { type: 'tarefa_smart', projects: ['Venda de afiliados'], week: '2026-W42' });

const TASKS = new Map([smart, smart2, smartLivro, acao, solta, smartSolta].map(t => [t.path, t]));
const SMARTS = new Map([smart, smart2, smartLivro, smartSolta].map(t => [t.basename.toLowerCase(), t]));

const ctxCanvas: EdgeContext = {
    taskAt: p => TASKS.get(p) ?? null,
    noteAt: () => null,
    isSmartName: n => SMARTS.has(n.toLowerCase()),
    blockWeeks: { 'dfm-qs-': '2026-W42' },
    projectsByHash: { [hashId(venda.name)]: venda, [hashId(livro.name)]: livro },
};
const ctxMissao: ContextoDoGesto = {
    isSmartName: n => SMARTS.has(n.toLowerCase()),
    smartPorNome: n => SMARTS.get(n.toLowerCase()) ?? null,
};

const fileNode = (id: string, file: string) => ({ id, type: 'file', file });
const textNode = (id: string) => ({ id, type: 'text', text: '' });
const NODES = [
    textNode('dfm-qw-2026-W42'), textNode('dfm-qw-2026-W43'), textNode('dfm-qw-2026-W45'),
    textNode('dfm-qs-day-2026-10-13'), textNode('dfm-qs-day-2026-10-14'), textNode('dfm-qs-day-2026-10-20'),
    textNode(`dfm-qs-pj-${hashId(venda.name)}`), textNode(`dfm-qs-pj-${hashId(livro.name)}`),
    fileNode('s1', smart.path), fileNode('s2', smart2.path), fileNode('s3', smartLivro.path), fileNode('s4', smartSolta.path),
    fileNode('a1', acao.path), fileNode('a2', solta.path),
];
const PJ_VENDA = `dfm-qs-pj-${hashId(venda.name)}`;
const PJ_LIVRO = `dfm-qs-pj-${hashId(livro.name)}`;
type Seta = [string, string, string];
const canvas = (edges: Seta[]): CanvasLike => ({ nodes: NODES, edges: edges.map(([id, fromNode, toNode]) => ({ id, fromNode, toNode })) });

const aplicar = (fm: Record<string, any>, patch: Patch | null) => {
    const out = JSON.parse(JSON.stringify(fm));
    for (const [k, v] of Object.entries(patch ?? {})) { if (v === null || v === undefined) delete out[k]; else out[k] = v; }
    return out;
};

/** Um gesto no canvas: compara antes e depois e grava como o observador (acréscimos antes das remoções). */
function seta(fm: Record<string, any>, antes: Seta[], depois: Seta[]): Record<string, any> {
    const diff = diffLinks(canvas(antes), canvas(depois), ctxCanvas);
    let cur = fm;
    for (const link of diff.added) cur = aplicar(cur, patchFor(cur, link));
    for (const link of diff.removed) cur = aplicar(cur, unpatchFor(cur, link, ctxCanvas));
    return cur;
}

/** Vários gestos de canvas em sequência (o canvas redesenha a zona entre um e outro). */
function setas(fm: Record<string, any>, estados: Seta[][]): Record<string, any> {
    let cur = fm;
    for (let i = 1; i < estados.length; i++) cur = seta(cur, estados[i - 1], estados[i]);
    return cur;
}

const missao = (fm: Record<string, any>, t: LinkTask, i: Intencao) => {
    const r = patchDoGesto(fm, t, i, ctxMissao);
    expect(r.problema).toBeUndefined();
    return aplicar(fm, r.patch);
};

describe('o gesto na Missão e a seta no canvas dão o mesmo frontmatter', () => {
    it('arrastar a ação para um dia = a seta dia → ação (a hora fica, a semana segue o dia)', () => {
        const fm = { scheduled: '2026-10-13T09:30', week: '2026-W42', projects: ['[[Publicar 2 vídeos (W42)]]'] };
        const canvasFm = seta(fm, [], [['e', 'dfm-qs-day-2026-10-20', 'a1']]);
        expect(missao(fm, acao, { gesto: 'dia', data: '2026-10-20' })).toEqual(canvasFm);
        expect(canvasFm).toMatchObject({ scheduled: '2026-10-20T09:30', week: '2026-W43' });
    });

    it('arrastar a SMART para a linha de uma semana = a seta semana → SMART', () => {
        const fm = { week: '2026-W42', projects: ['[[Venda de afiliados]]'] };
        const canvasFm = seta(fm, [], [['e', 'dfm-qw-2026-W43', 's1']]);
        expect(missao(fm, smart, { gesto: 'semana', semana: '2026-W43' })).toEqual(canvasFm);
        expect(canvasFm.week).toBe('2026-W43');
    });

    it('a SMART solta num dia vai para a semana do dia = a seta semana → SMART', () => {
        const fm = { week: '2026-W42' };
        expect(missao(fm, smart, { gesto: 'dia', data: '2026-10-21' })).toEqual(seta(fm, [], [['e', 'dfm-qw-2026-W43', 's1']]));
    });

    it('a ação sem dia arrastada para uma semana = a seta semana → ação', () => {
        const fm = { week: '2026-W42' };
        expect(missao(fm, acao, { gesto: 'semana', semana: '2026-W45' })).toEqual(seta(fm, [], [['e', 'dfm-qw-2026-W45', 'a1']]));
    });

    it('a ação agendada arrastada para outra semana fica no mesmo dia da semana = a seta do dia novo → ação', () => {
        const fm = { scheduled: '2026-10-13T08:00', week: '2026-W42' };
        const canvasFm = seta(fm, [], [['e', 'dfm-qs-day-2026-10-20', 'a1']]);
        expect(missao(fm, acao, { gesto: 'semana', semana: '2026-W43' })).toEqual(canvasFm);
        expect(canvasFm).toEqual({ scheduled: '2026-10-20T08:00', week: '2026-W43' });
    });

    it('"Sem data" = apagar as setas dia → ação e semana → ação', () => {
        const fm = { scheduled: '2026-10-13T10:00', week: '2026-W42', projects: ['[[Venda de afiliados]]'] };
        const base: Seta[] = [['d', 'dfm-qs-day-2026-10-13', 'a2'], ['w', 'dfm-qw-2026-W42', 'a2']];
        const canvasFm = seta(fm, base, []);
        expect(missao(fm, solta, { gesto: 'sem-data' })).toEqual(canvasFm);
        expect(canvasFm).toEqual({ projects: ['[[Venda de afiliados]]'] });
    });

    it('soltar a ação da SMART no fio de outro projeto = tirar a seta da mãe, tirar a do projeto antigo e pôr a do novo', () => {
        const fm = { projects: ['[[Publicar 2 vídeos (W42)]]'], week: '2026-W42', impacto: 8 };
        // No canvas, três gestos: apagar a seta da mãe (volta o projeto da SMART, e a zona
        // desenha a seta dele), apagar essa seta e desenhar a do projeto novo.
        let passoAPasso = seta(fm, [['m', 's1', 'a1']], []);
        expect(passoAPasso.projects).toEqual(['[[Venda de afiliados]]']);
        passoAPasso = seta(passoAPasso, [['p', PJ_VENDA, 'a1']], []);
        passoAPasso = seta(passoAPasso, [], [['n', PJ_LIVRO, 'a1']]);
        const gesto = missao(fm, acao, { gesto: 'projeto', projeto: livro, de: venda });
        expect(gesto).toEqual(passoAPasso);
        expect(gesto.projects).toEqual(['[[Livro]]']);
        expect(gesto).toMatchObject({ week: '2026-W42', impacto: 8 });
        // Por que a ordem importa: num gesto só de canvas (apagar a mãe e desenhar o novo),
        // o acréscimo vem antes da remoção, e o projeto antigo volta junto com o novo.
        const umGestoSo = seta(fm, [['m', 's1', 'a1']], [['n', PJ_LIVRO, 'a1']]);
        expect(umGestoSo.projects).toEqual(['[[Livro]]', '[[Venda de afiliados]]']);
    });

    it('a ação solta no projeto muda de projeto = apagar a seta do projeto antigo e desenhar a do novo', () => {
        const fm = { projects: ['[[Venda de afiliados]]'] };
        const canvasFm = setas(fm, [[['p', PJ_VENDA, 'a2']], [], [['n', PJ_LIVRO, 'a2']]]);
        expect(missao(fm, solta, { gesto: 'projeto', projeto: livro, de: venda })).toEqual(canvasFm);
        expect(canvasFm.projects).toEqual(['[[Livro]]']);
    });

    it('a SMART muda de projeto = apagar a seta projeto → SMART antiga e desenhar a nova', () => {
        const fm = { projects: ['[[Venda de afiliados]]'], week: '2026-W42' };
        const canvasFm = setas(fm, [[['p', PJ_VENDA, 's4']], [], [['n', PJ_LIVRO, 's4']]]);
        expect(missao(fm, smartSolta, { gesto: 'projeto', projeto: livro, de: venda })).toEqual(canvasFm);
    });

    it('a ação sem projeto solta num projeto = desenhar a seta projeto → ação', () => {
        const fm = { week: '2026-W42' };
        expect(missao(fm, solta, { gesto: 'projeto', projeto: venda, de: null })).toEqual(seta(fm, [], [['n', PJ_VENDA, 'a2']]));
    });

    it('pôr numa SMART = desenhar a seta SMART → ação; a mãe nova herda a semana e o impacto vazios (§8.3)', () => {
        const fm = { projects: ['[[Venda de afiliados]]'] };
        const canvasFm = setas(fm, [[['p', PJ_VENDA, 'a2']], [['p', PJ_VENDA, 'a2'], ['m', 's1', 'a2']]]);
        const gesto = missao(fm, solta, { gesto: 'ligar-smart', smart });
        expect(gesto).toEqual(canvasFm);
        expect(gesto).toEqual({ projects: ['[[Publicar 2 vídeos (W42)]]'], week: '2026-W42', impacto: 8 });
    });

    it('pôr numa SMART de outro projeto soma (02/11): o projeto de onde a ação saiu fica, como desenhar só a seta SMART → ação', () => {
        const fm = { projects: ['[[Venda de afiliados]]'], week: '2026-W42' };
        const canvasFm = setas(fm, [[['p', PJ_VENDA, 'a2']], [['p', PJ_VENDA, 'a2'], ['m', 's3', 'a2']]]);
        const gesto = missao(fm, solta, { gesto: 'ligar-smart', smart: smartLivro });
        expect(gesto).toEqual(canvasFm);
        expect(gesto.projects).toEqual(['[[Venda de afiliados]]', '[[Revisar capítulo (W43)]]']);
        expect(gesto.week).toBe('2026-W42');
    });

    it('a alça da SMART = desenhar a seta SMART → ação (acrescenta, não apaga as outras mães)', () => {
        const fm = { projects: ['[[Cadastrar lojas (W41)]]'], week: '2026-W41' };
        const canvasFm = seta(fm, [['m', 's2', 'a1']], [['m', 's2', 'a1'], ['h', 's1', 'a1']]);
        expect(missao(fm, acao, { gesto: 'ligar-smart', smart })).toEqual(canvasFm);
        expect(canvasFm.projects).toEqual(['[[Cadastrar lojas (W41)]]', '[[Publicar 2 vídeos (W42)]]']);
    });

    it('desligar a ligação da mãe = apagar a seta SMART → ação (sem outra mãe, volta o projeto da SMART)', () => {
        const fm = { projects: ['[[Publicar 2 vídeos (W42)]]'], week: '2026-W42' };
        const link = linkFor(endOf(NODES.find(n => n.id === 's1'), ctxCanvas)!, endOf(NODES.find(n => n.id === 'a1'), ctxCanvas)!)!;
        const canvasFm = seta(fm, [['m', 's1', 'a1']], []);
        expect(missao(fm, acao, { gesto: 'desligar', ligacao: link })).toEqual(canvasFm);
        expect(canvasFm.projects).toEqual(['[[Venda de afiliados]]']);
    });

    it('desligar a ligação do projeto = apagar a seta projeto → ação', () => {
        const fm = { projects: ['[[Venda de afiliados]]', '[[Livro]]'] };
        const link = linkFor(endOf(NODES.find(n => n.id === PJ_VENDA), ctxCanvas)!, endOf(NODES.find(n => n.id === 'a2'), ctxCanvas)!)!;
        expect(missao(fm, solta, { gesto: 'desligar', ligacao: link })).toEqual(seta(fm, [['p', PJ_VENDA, 'a2']], []));
    });
});
