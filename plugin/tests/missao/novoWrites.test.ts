/**
 * As gravações do Novo (P8): a tarefa pela API do TaskNotes com o `type` e a herança da SMART
 * lida na hora; o Desfazer que manda a nota para a lixeira do sistema só se ela está como
 * nasceu; e o formulário nativo, com o `type` e a herança depois que ele salva.
 */
import { describe, expect, it, vi } from 'vitest';
import { GravacoesDoNovo, type DepsDoNovo } from '../../src/missao/novoWrites';
import { PilhaDoDesfazer } from '../../src/missao/missaoWrites';
import type { LinkTask } from '../../src/canvas/edgeLinks';

const SMART: LinkTask = { path: 'TaskNotes/Tasks/SMART z.md', basename: 'SMART z', type: 'tarefa_smart', projects: ['Projeto Alfa'], week: '2026-W44', impacto: 6 };

function cofre(over: Partial<DepsDoNovo> = {}) {
    const textos = new Map<string, string>();
    const avisos: string[] = [];
    const desfazeres: Array<() => void> = [];
    const deps: DepsDoNovo = {
        criarTarefa: vi.fn(async pedido => { const c = `TaskNotes/Tasks/${pedido.title}.md`; textos.set(c, JSON.stringify(pedido)); return c; }),
        abrirFormulario: vi.fn(async () => 'TaskNotes/Tasks/Pelo formulário.md'),
        tarefa: vi.fn(c => (c === SMART.path ? SMART : null)),
        atualizarTarefa: vi.fn(async () => ({ changed: true, before: {} })),
        lerTexto: vi.fn(async c => textos.get(c) ?? null),
        lixeira: vi.fn(async c => textos.delete(c)),
        refrescar: vi.fn(),
        ...over,
    };
    const pilha = new PilhaDoDesfazer({ avisar: (t, d) => { avisos.push(t); if (d) desfazeres.push(d); } });
    return { deps, pilha, g: new GravacoesDoNovo(deps, pilha), textos, avisos, desfazeres };
}

describe('a tarefa pela API', () => {
    it('cria com o type e o patch da mãe (a semana e o impacto vazios vêm da SMART lida agora)', async () => {
        const c = cofre();
        const r = await c.g.tarefa({ title: 'Escrever', status: 'next-action', projects: ['[[Projeto Alfa]]', '[[SMART z]]'], week: null }, SMART.path);
        expect(r).toMatchObject({ ok: true, caminho: 'TaskNotes/Tasks/Escrever.md' });
        const pedido = (c.deps.criarTarefa as any).mock.calls[0][0];
        expect(pedido).toMatchObject({ title: 'Escrever', status: 'next-action', projects: ['[[SMART z]]'], scheduled: '' });
        expect(pedido.customFrontmatter).toEqual({ week: '2026-W44', impacto: 6, type: 'task' });
        expect(c.pilha.tamanho()).toBe(1);
        expect(c.avisos[0]).toBe('Criada: Escrever · SMART SMART z');
    });
    it('a SMART que sumiu não cria; o título vazio não cria; a recusa do TaskNotes vira aviso, sem pilha', async () => {
        const c = cofre();
        expect((await c.g.tarefa({ title: 'x' }, 'TaskNotes/Tasks/sumiu.md')).ok).toBe(false);
        expect((await c.g.tarefa({ title: '' }, null)).texto).toBe('Não criou: o título é obrigatório');
        const d = cofre({ criarTarefa: async () => { throw new Error('Title is required'); } });
        expect((await d.g.tarefa({ title: 'x' }, null)).texto).toBe('Não criou: Title is required');
        expect(c.pilha.tamanho() + d.pilha.tamanho()).toBe(0);
        expect(c.deps.criarTarefa).not.toHaveBeenCalled();
    });
});

describe('o Desfazer da criação', () => {
    it('a tarefa como nasceu vai para a lixeira do sistema', async () => {
        const c = cofre();
        await c.g.tarefa({ title: 'Nova', status: 'next-action' }, null);
        const r = await c.pilha.desfazerUltimo();
        expect(r).toEqual({ feito: true, texto: 'Desfeito: Nova foi para a lixeira do sistema' });
        expect(c.deps.lixeira).toHaveBeenCalledWith('TaskNotes/Tasks/Nova.md');
    });
    it('a tarefa que mudou depois fica; a que já saiu, também diz', async () => {
        const c = cofre();
        await c.g.tarefa({ title: 'Mexida', status: 'next-action' }, null);
        c.textos.set('TaskNotes/Tasks/Mexida.md', 'outro texto');
        expect((await c.pilha.desfazerUltimo()).feito).toBe(false);
        expect(c.deps.lixeira).not.toHaveBeenCalled();
        await c.g.tarefa({ title: 'Saiu', status: 'next-action' }, null);
        c.textos.delete('TaskNotes/Tasks/Saiu.md');
        expect((await c.pilha.desfazerUltimo()).texto).toMatch(/não está mais no cofre/);
    });
});

describe('o formulário nativo', () => {
    it('abre preenchido e, salvo, ganha o type e a herança (só se ficou na SMART)', async () => {
        const c = cofre();
        const r = await c.g.noTaskNotes({ title: 'Pelo formulário', projects: ['[[SMART z]]'] }, SMART.path);
        expect(r.ok).toBe(true);
        expect((c.deps.abrirFormulario as any).mock.calls[0][0]).toMatchObject({ title: 'Pelo formulário', projects: ['[[SMART z]]'], week: '2026-W44', impacto: 6 });
        const fn = (c.deps.atualizarTarefa as any).mock.calls[0][1];
        expect(fn({ title: 'Pelo formulário', projects: ['[[SMART z]]'] })).toEqual({ type: 'task', week: '2026-W44', impacto: 6 });
        expect(fn({ type: 'task', projects: ['[[Outro]]'] })).toBeNull();
    });
    it('fechado sem salvar, nada', async () => {
        const c = cofre({ abrirFormulario: async () => null });
        expect(await c.g.noTaskNotes({ title: 'x' }, null)).toEqual({ ok: false, texto: 'O formulário do TaskNotes fechou sem criar' });
        expect(c.deps.atualizarTarefa).not.toHaveBeenCalled();
    });
});
