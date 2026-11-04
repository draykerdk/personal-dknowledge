/**
 * As gravações da Missão e o Desfazer único (arquitetura da página Missão, §3.1, §4.4, §12),
 * com falsos no lugar do `MissionBoard`: o patch é calculado sobre o frontmatter do momento,
 * cada gravação pede a releitura, a pilha é uma só e o Desfazer só desfaz o que ainda está lá.
 */
import { describe, expect, it, vi } from 'vitest';
import type { LinkTask, Patch } from '../../src/canvas/edgeLinks';
import { diaDoGesto, GravacoesDaMissao, PilhaDoDesfazer, type DepsDaGravacao } from '../../src/missao/missaoWrites';

const SMART = 'TaskNotes/Tasks/S.md';
const SMART_B = 'TaskNotes/Tasks/SB.md';
const ACAO = 'TaskNotes/Tasks/A.md';
const PROJ = '100 - AREAS/x/Alfa/Alfa.md';

function cofre() {
    const fm: Record<string, Record<string, any>> = {
        [SMART]: { type: 'tarefa_smart', projects: ['[[Alfa]]'], week: '2026-W44', impacto: 7, status: 'in-progress' },
        [SMART_B]: { type: 'tarefa_smart', projects: ['[[Beta]]'], week: '2026-W45', status: 'next-action' },
        [ACAO]: { type: 'task', projects: ['[[Alfa]]'], status: 'next-action' },
        [PROJ]: { type: 'iniciativa' },
    };
    const avisos: Array<{ texto: string; desfazer?: () => void }> = [];
    const refrescos = { n: 0 };
    const aplicar = async (c: string, fn: (fm: Record<string, any>) => Patch | null) => {
        const atual = fm[c];
        if (!atual) return { changed: false, before: {} };
        const patch = fn(JSON.parse(JSON.stringify(atual)));
        if (!patch) return { changed: false, before: {} };
        const before: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(patch)) { before[k] = atual[k] === undefined ? undefined : JSON.parse(JSON.stringify(atual[k])); if (v === null) delete atual[k]; else atual[k] = v; }
        return { changed: true, before };
    };
    const nome = (c: string) => c.split('/').pop()!.replace(/\.md$/, '');
    const deps: DepsDaGravacao = {
        atualizarTarefa: vi.fn(aplicar),
        atualizarNota: vi.fn(aplicar),
        status: vi.fn(async (c, s) => { fm[c].status = s; return true; }),
        concluir: vi.fn(async c => { fm[c].status = 'done'; return true; }),
        reabrir: vi.fn(async (c, s) => { fm[c].status = s; return true; }),
        frontmatter: c => fm[c] ?? null,
        localizar: c => (fm[c] ? c : null),
        tarefa: (c): LinkTask | null => (fm[c] && String(fm[c].type).match(/task|smart/) ? { path: c, basename: nome(c), type: fm[c].type, projects: (fm[c].projects ?? []).map((l: string) => l.replace(/\[\[|\]\]/g, '')), week: fm[c].week, impacto: fm[c].impacto } : null),
        contexto: () => ({ isSmartName: n => ['s', 'sb'].includes(n.toLowerCase()), smartPorNome: n => deps.tarefa(`TaskNotes/Tasks/${n}.md`) }),
        fazerAgora: vi.fn(),
        refrescar: () => { refrescos.n++; },
        statusFechado: s => s === 'done' || s === 'cancelled',
    };
    const pilha = new PilhaDoDesfazer({ avisar: (texto, desfazer) => { avisos.push({ texto, desfazer }); } });
    return { fm, deps, pilha, avisos, refrescos, g: new GravacoesDaMissao(deps, pilha) };
}

describe('as gravações passam pelo MissionBoard e pedem a releitura', () => {
    it('o gesto grava o patch calculado sobre o frontmatter do momento, uma vez', async () => {
        const c = cofre();
        const r = await c.g.mover(ACAO, { tipo: 'ligar-smart', smart: SMART });
        expect(r.ok).toBe(true);
        expect(c.fm[ACAO]).toMatchObject({ projects: ['[[S]]'], week: '2026-W44', impacto: 7 });
        expect(c.deps.atualizarTarefa).toHaveBeenCalledTimes(1);
        expect(c.refrescos.n).toBe(1);
        expect(c.avisos.at(-1)?.desfazer).toBeTypeOf('function');
    });

    it('a SMART de destino é lida na hora da gravação (a semana dela agora)', async () => {
        const c = cofre();
        c.fm[SMART].week = '2026-W46';
        await c.g.mover(ACAO, { tipo: 'ligar-smart', smart: SMART });
        expect(c.fm[ACAO].week).toBe('2026-W46');
    });

    it('o problema do gesto e o gesto sem mudança não gravam nem entram na pilha', async () => {
        const c = cofre();
        expect((await c.g.mover(SMART, { tipo: 'hora', hora: '10:00' })).ok).toBe(false);
        expect((await c.g.mover(ACAO, { tipo: 'projeto', projeto: { name: 'Alfa', keys: ['alfa'] }, de: { name: 'Alfa', keys: ['alfa'] } })).ok).toBe(false);
        expect((await c.g.mover('TaskNotes/Tasks/nada.md', { tipo: 'sem-data' })).ok).toBe(false);
        expect(c.pilha.tamanho()).toBe(0);
        expect(c.deps.atualizarTarefa).not.toHaveBeenCalled();
        expect(c.avisos.every(a => !a.desfazer)).toBe(true);
    });

    it('o campo da nota que não é tarefa vai por updateNoteWith', async () => {
        const c = cofre();
        const r = await c.g.campo(PROJ, 'projects', ['[[Central]]'], 'Serve a', undefined, 'Central');
        expect(r.texto).toBe('Serve a: Central');
        expect(c.deps.atualizarNota).toHaveBeenCalledTimes(1);
        expect(c.fm[PROJ].projects).toEqual(['[[Central]]']);
    });

    it('o status vai por setStatus, e o done pela conclusão única', async () => {
        const c = cofre();
        await c.g.campo(ACAO, 'status', 'someday', 'Status');
        expect(c.deps.status).toHaveBeenCalledWith(ACAO, 'someday');
        await c.g.concluir(ACAO);
        expect(c.deps.concluir).toHaveBeenCalledWith(ACAO);
        expect(c.deps.atualizarTarefa).not.toHaveBeenCalled();
    });

    it('🤝 só abre o gesto', () => {
        const c = cofre();
        c.g.fazerAgora(ACAO);
        expect(c.deps.fazerAgora).toHaveBeenCalledWith(ACAO, undefined);
        // Os motivos dos pesos vão juntos (a linha da Day diz o porquê, como o cartão do canvas).
        const motivos = [{ chave: 'agendada', pontos: 3, texto: 'agendada hoje' }];
        c.g.fazerAgora(ACAO, motivos);
        expect(c.deps.fazerAgora).toHaveBeenLastCalledWith(ACAO, motivos);
        expect(c.pilha.tamanho()).toBe(0);
    });
});

describe('o Desfazer único', () => {
    it('⌘Z desfaz a última gravação, e o aviso diz', async () => {
        const c = cofre();
        await c.g.mover(ACAO, { tipo: 'dia', data: '2026-10-30' });
        expect(c.fm[ACAO]).toMatchObject({ scheduled: '2026-10-30', week: '2026-W44' });
        const r = await c.g.desfazer();
        expect(r.feito).toBe(true);
        expect(c.fm[ACAO].scheduled).toBeUndefined();
        expect(c.fm[ACAO].week).toBeUndefined();
        expect(c.avisos.at(-1)?.texto).toMatch(/^Desfeito/);
        expect((await c.g.desfazer()).texto).toBe('Nada para desfazer');
    });

    it('só desfaz o que ainda está lá: o campo mudado depois fica', async () => {
        const c = cofre();
        await c.g.mover(ACAO, { tipo: 'dia', data: '2026-10-30' });
        c.fm[ACAO].scheduled = '2026-11-02';
        const r = await c.g.desfazer();
        expect(c.fm[ACAO].scheduled).toBe('2026-11-02');
        expect(c.fm[ACAO].week).toBeUndefined();
        expect(r.texto).toContain('em parte');
        expect(r.texto).toContain('scheduled');
    });

    it('nada desfeito quando tudo mudou depois', async () => {
        const c = cofre();
        await c.g.campo(ACAO, 'due', '2026-11-04', 'Prazo');
        c.fm[ACAO].due = '2026-11-10';
        const r = await c.g.desfazer();
        expect(r.feito).toBe(false);
        expect(c.fm[ACAO].due).toBe('2026-11-10');
    });

    it('o aviso clicado desfaz aquela entrada, mesmo que não seja a última; duas vezes não faz nada', async () => {
        const c = cofre();
        await c.g.campo(ACAO, 'due', '2026-11-04', 'Prazo');
        const primeiro = c.avisos.at(-1)!;
        await c.g.campo(ACAO, 'timeEstimate', 30, 'Estimativa');
        primeiro.desfazer!();
        await Promise.resolve(); await Promise.resolve(); await new Promise(r => setTimeout(r, 0));
        expect(c.fm[ACAO].due).toBeUndefined();
        expect(c.fm[ACAO].timeEstimate).toBe(30);
        expect(c.pilha.tamanho()).toBe(1);
        primeiro.desfazer!();
        await new Promise(r => setTimeout(r, 0));
        expect(c.pilha.tamanho()).toBe(1);
    });

    it('a conclusão se desfaz pela volta (reopenTask) só se ainda está concluída', async () => {
        const c = cofre();
        await c.g.concluir(ACAO);
        await c.g.desfazer();
        expect(c.deps.reabrir).toHaveBeenCalledWith(ACAO, 'next-action');
        expect(c.fm[ACAO].status).toBe('next-action');
        await c.g.status(ACAO, 'cancelled');
        c.fm[ACAO].status = 'in-progress';
        const r = await c.g.desfazer();
        expect(r.feito).toBe(false);
        expect(c.fm[ACAO].status).toBe('in-progress');
    });

    it('algum dia se desfaz por setStatus, de volta ao status de antes', async () => {
        const c = cofre();
        await c.g.status(ACAO, 'someday');
        await c.g.desfazer();
        expect(c.deps.status).toHaveBeenLastCalledWith(ACAO, 'next-action');
        expect(c.deps.reabrir).not.toHaveBeenCalled();
    });

    it('"Nova data" na tarefa de algum dia agenda e volta a próxima, com um Desfazer para as duas', async () => {
        const c = cofre();
        c.fm[ACAO].status = 'someday';
        const r = await c.g.novaData(ACAO, '2026-11-03', 'next-action', true);
        expect(r.ok).toBe(true);
        expect(c.fm[ACAO]).toMatchObject({ scheduled: '2026-11-03', week: '2026-W45', status: 'next-action' });
        expect(c.pilha.tamanho()).toBe(1);
        await c.g.desfazer();
        expect(c.fm[ACAO].status).toBe('someday');
        expect(c.fm[ACAO].scheduled).toBeUndefined();
    });

    it('a pilha é uma só: quem registra de fora (o canvas, o painel) desfaz pelo mesmo ⌘Z', async () => {
        const c = cofre();
        const desfazer = vi.fn(async () => ({ feito: true, texto: 'Desfeito: layout' }));
        await c.g.campo(ACAO, 'due', '2026-11-04', 'Prazo');
        c.pilha.registrar({ rotulo: 'Página excluída', desfazer });
        await c.g.desfazer();
        expect(desfazer).toHaveBeenCalled();
        expect(c.fm[ACAO].due).toBe('2026-11-04');
    });

    it('a pilha guarda até o limite, e a entrada que falha sai com o aviso', async () => {
        const avisos: string[] = [];
        const p = new PilhaDoDesfazer({ avisar: t => avisos.push(t), limite: 2 });
        for (const i of [1, 2, 3]) p.registrar({ rotulo: `e${i}`, desfazer: async () => ({ feito: true, texto: `ok ${i}` }) });
        expect(p.tamanho()).toBe(2);
        p.registrar({ rotulo: 'quebra', desfazer: async () => { throw new Error('x'); } });
        const r = await p.desfazerUltimo();
        expect(r).toEqual({ feito: false, texto: 'Não deu para desfazer: quebra' });
        expect(p.ultima()).toBe('e3');
    });
});

describe('vários campos de uma nota numa gravação (P9, o "Informar saldo")', () => {
    it('grava os que mudam, com um Desfazer só que volta só o que ainda está lá', async () => {
        const c = cofre();
        c.fm[PROJ].atualizado_em = '2026-10-03';
        const r = await c.g.campos(PROJ, { saldo: 9943.2, atualizado_em: '2026-10-29' }, 'Informar saldo: R$ 9.943,20');
        expect(r).toEqual({ ok: true, texto: 'Informar saldo: R$ 9.943,20' });
        expect(c.fm[PROJ]).toMatchObject({ saldo: 9943.2, atualizado_em: '2026-10-29' });
        expect(c.pilha.tamanho()).toBe(1);
        c.avisos.at(-1)!.desfazer!();
        await new Promise(r => setTimeout(r, 0));
        expect(c.fm[PROJ].saldo).toBeUndefined();
        expect(c.fm[PROJ].atualizado_em).toBe('2026-10-03');
    });
    it('o igual ao que está não grava nem entra na pilha', async () => {
        const c = cofre();
        c.fm[PROJ].saldo = 10;
        expect((await c.g.campos(PROJ, { saldo: 10 }, 'Saldo')).ok).toBe(false);
        expect(c.pilha.tamanho()).toBe(0);
    });
});

describe('Arquivar e Excluir (o menu de status, 02/11)', () => {
    /** O arquivo do TaskNotes e a lixeira, falsos: a nota muda de caminho, e a `.trash` guarda o que entrou. */
    function comArquivoELixeira(c: ReturnType<typeof cofre>, lixeira: 'cofre' | 'sistema' = 'cofre') {
        const trash = new Map<string, Record<string, any>>();
        const mover = (de: string, para: string) => { c.fm[para] = c.fm[de]; delete c.fm[de]; };
        c.deps.arquivar = vi.fn(async (caminho: string, sim: boolean) => {
            if (!c.fm[caminho]) return null;
            const nome = caminho.split('/').pop()!;
            const para = `${sim ? 'TaskNotes/Archive' : 'TaskNotes/Tasks'}/${nome}`;
            if (para !== caminho) mover(caminho, para);
            return para;
        });
        c.deps.lixeira = vi.fn(async (caminho: string) => {
            if (!c.fm[caminho]) return null;
            const naLixeira = lixeira === 'cofre' ? `.trash/${caminho.split('/').pop()}` : null;
            if (naLixeira) trash.set(naLixeira, c.fm[caminho]);
            delete c.fm[caminho];
            return { naLixeira };
        });
        c.deps.restaurar = vi.fn(async (naLixeira: string, para: string) => {
            if (!trash.has(naLixeira)) return 'sumiu' as const;
            if (c.fm[para]) return 'ocupado' as const;
            c.fm[para] = trash.get(naLixeira)!;
            trash.delete(naLixeira);
            return 'ok' as const;
        });
        return trash;
    }

    it('Arquivar vai pelo arquivo do TaskNotes, e o Desfazer traz de volta pelo gesto contrário, onde ela ficou', async () => {
        const c = cofre();
        comArquivoELixeira(c);
        const r = await c.g.arquivar(ACAO, true, undefined, 'A');
        expect(r).toEqual({ ok: true, texto: 'Arquivada: A' });
        expect(c.fm['TaskNotes/Archive/A.md']).toBeTruthy();
        expect(c.fm[ACAO]).toBeUndefined();
        expect(c.refrescos.n).toBe(1);
        const d = await c.g.desfazer();
        expect(d).toEqual({ feito: true, texto: 'Desfeito: Arquivada: A' });
        expect(c.deps.arquivar).toHaveBeenLastCalledWith('TaskNotes/Archive/A.md', false);
        expect(c.fm[ACAO]).toBeTruthy();
    });

    it('sem o arquivo no lugar, ou com a nota que sumiu, nada grava nem entra na pilha', async () => {
        const c = cofre();
        expect((await c.g.arquivar(ACAO, true)).ok).toBe(false);
        comArquivoELixeira(c);
        expect((await c.g.arquivar('TaskNotes/Tasks/nada.md', true)).ok).toBe(false);
        expect(c.pilha.tamanho()).toBe(0);
    });

    it('Excluir manda para a .trash do cofre; o Desfazer a traz de volta ao mesmo caminho, sem sobrescrever', async () => {
        const c = cofre();
        const trash = comArquivoELixeira(c);
        const r = await c.g.excluir(ACAO, undefined, 'A');
        expect(r).toEqual({ ok: true, texto: 'Na lixeira: A' });
        expect(c.fm[ACAO]).toBeUndefined();
        expect(trash.has('.trash/A.md')).toBe(true);
        expect(c.avisos.at(-1)?.desfazer).toBeTypeOf('function');
        expect(await c.g.desfazer()).toEqual({ feito: true, texto: 'Desfeito: Na lixeira: A' });
        expect(c.fm[ACAO]).toMatchObject({ type: 'task' });
        // Outra nota no caminho: o Desfazer não sobrescreve e diz o porquê.
        await c.g.excluir(ACAO);
        c.fm[ACAO] = { type: 'task', title: 'outra' };
        const d = await c.g.desfazer();
        expect(d.feito).toBe(false);
        expect(d.texto).toContain('outra nota está em');
        expect(c.fm[ACAO].title).toBe('outra');
    });

    it('na lixeira do sistema, o aviso diz para recuperar por lá, sem um Desfazer que não alcança', async () => {
        const c = cofre();
        comArquivoELixeira(c, 'sistema');
        const r = await c.g.excluir(ACAO, undefined, 'A');
        expect(r.ok).toBe(true);
        expect(r.texto).toContain('lixeira do sistema');
        expect(c.pilha.tamanho()).toBe(0);
        expect(c.avisos.at(-1)?.desfazer).toBeUndefined();
    });

    it('a fechada (feita, cancelada) que volta a um estado aberto passa pela volta (reopenTask), que a tira do arquivo', async () => {
        const c = cofre();
        c.fm[ACAO].status = 'done';
        await c.g.status(ACAO, 'next-action', undefined, 'Próxima: A');
        expect(c.deps.reabrir).toHaveBeenCalledWith(ACAO, 'next-action');
        expect(c.deps.status).not.toHaveBeenCalled();
    });
});

describe('o aviso de carga ao pôr uma tarefa num dia (02/11, o inventário da aposentadoria, fase 2, item 3)', () => {
    const PASSA = ' · o dia passa de 2 h (2,5 h agendadas)';

    it('o dia em que o gesto põe a ação: o dia e a semana (o mesmo dia da semana nova); a SMART, a hora e o sem-data, nada', () => {
        const acao = { type: 'task' };
        expect(diaDoGesto({ scheduled: '2026-11-03T14:00' }, acao, { gesto: 'dia' })).toBe('2026-11-03');
        expect(diaDoGesto({ scheduled: '2026-11-10', week: '2026-W46' }, acao, { gesto: 'semana' })).toBe('2026-11-10');
        expect(diaDoGesto({ week: '2026-W46' }, acao, { gesto: 'semana' })).toBeNull();
        expect(diaDoGesto({ scheduled: '2026-11-03T15:00' }, acao, { gesto: 'hora' })).toBeNull();
        expect(diaDoGesto({ scheduled: '2026-11-03' }, { type: 'tarefa_smart' }, { gesto: 'dia' })).toBeNull();
        expect(diaDoGesto({ scheduled: null }, acao, { gesto: 'sem-data' })).toBeNull();
        expect(diaDoGesto(null, acao, { gesto: 'dia' })).toBeNull();
    });

    it('o arrasto e o "Mover para…" dizem que o dia passa do bloco; o Desfazer guarda só o rótulo', async () => {
        const c = cofre();
        c.deps.cargaDoDia = vi.fn((_caminho: string, data: string) => (data === '2026-11-03' ? PASSA : ''));
        const r = await c.g.mover(ACAO, { tipo: 'dia', data: '2026-11-03' });
        expect(r.texto.endsWith(PASSA)).toBe(true);
        expect(c.avisos.at(-1)?.texto).toBe(r.texto);
        expect(c.deps.cargaDoDia).toHaveBeenCalledWith(ACAO, '2026-11-03');
        expect(c.pilha.ultima()?.endsWith(PASSA)).toBe(false);
        // Dentro do bloco, o aviso é o de sempre.
        const dentro = await c.g.mover(ACAO, { tipo: 'dia', data: '2026-11-04' });
        expect(dentro.texto).toBe(c.pilha.ultima());
        // A tarefa de algum dia que ganha um dia (o "Mover para…" dela) avisa igual.
        const nova = await c.g.novaData(ACAO, '2026-11-03', 'next-action', true);
        expect(nova.texto.endsWith(PASSA)).toBe(true);
        expect(c.avisos.at(-1)?.texto).toBe(nova.texto);
    });

    it('a hora no mesmo dia e a SMART não avisam; a leitura que falha não derruba o gesto; sem a leitura, o aviso de sempre', async () => {
        const c = cofre();
        c.deps.cargaDoDia = vi.fn(() => PASSA);
        await c.g.mover(ACAO, { tipo: 'dia', data: '2026-11-03' });
        (c.deps.cargaDoDia as ReturnType<typeof vi.fn>).mockClear();
        const hora = await c.g.mover(ACAO, { tipo: 'hora', hora: '10:00' });
        expect(hora.ok).toBe(true);
        expect(hora.texto.endsWith(PASSA)).toBe(false);
        const smart = await c.g.mover(SMART, { tipo: 'dia', data: '2026-11-05' });
        expect(smart.ok).toBe(true);
        expect(smart.texto.endsWith(PASSA)).toBe(false);
        expect(c.deps.cargaDoDia).not.toHaveBeenCalled();
        c.deps.cargaDoDia = () => { throw new Error('sem índice'); };
        expect((await c.g.mover(ACAO, { tipo: 'dia', data: '2026-11-06' })).ok).toBe(true);
        delete c.deps.cargaDoDia;
        expect((await c.g.mover(ACAO, { tipo: 'dia', data: '2026-11-07' })).texto).toBe(c.pilha.ultima());
    });
});
