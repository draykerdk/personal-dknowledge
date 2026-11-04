/**
 * Prova da gravação da checklist (29/10): marcar e acrescentar mudam só a linha do item, pelo texto
 * de agora (`processarTexto`, o `vault.process` da borda), com o Desfazer na pilha única.
 */
import { describe, expect, it, vi } from 'vitest';
import { GravacoesDaMissao, PilhaDoDesfazer, type DepsDaGravacao } from '../../src/missao/missaoWrites';

const NOTA = 'TaskNotes/Tasks/mala.md';
const TEXTO = '---\ntitle: mala\n---\nAntes de sair.\n\n- [ ] passaporte\n- [x] carregador\n\nFim.\n';

function cofre(texto = TEXTO, comTexto = true) {
    const textos: Record<string, string> = { [NOTA]: texto };
    const avisos: Array<{ texto: string; desfazer?: () => void }> = [];
    const refrescos = { n: 0 };
    const deps = {
        atualizarTarefa: vi.fn(), atualizarNota: vi.fn(), status: vi.fn(), concluir: vi.fn(), reabrir: vi.fn(),
        frontmatter: () => null, localizar: (c: string) => c, tarefa: () => null,
        contexto: () => ({ isSmartName: () => false, smartPorNome: () => null }),
        fazerAgora: vi.fn(), refrescar: () => { refrescos.n++; }, statusFechado: () => false,
        ...(comTexto ? {
            processarTexto: async (c: string, fn: (t: string) => string | null) => {
                if (!(c in textos)) return false;
                const novo = fn(textos[c]);
                if (novo === null || novo === textos[c]) return false;
                textos[c] = novo;
                return true;
            },
        } : {}),
    } as unknown as DepsDaGravacao;
    const pilha = new PilhaDoDesfazer({ avisar: (t, desfazer) => { avisos.push({ texto: t, desfazer }); } });
    return { textos, avisos, refrescos, pilha, g: new GravacoesDaMissao(deps, pilha) };
}

describe('marcar um item da checklist', () => {
    it('só a linha do item muda; o Desfazer volta exatamente o texto de antes', async () => {
        const c = cofre();
        const r = await c.g.checklist(NOTA, { via: 'marcar', linha: 5, feito: true, texto: 'passaporte' });
        expect(r).toEqual({ ok: true, texto: 'Feito: passaporte' });
        expect(c.textos[NOTA]).toBe(TEXTO.replace('- [ ] passaporte', '- [x] passaporte'));
        expect(c.refrescos.n).toBe(1);
        expect(c.pilha.tamanho()).toBe(1);
        const d = await c.g.desfazer();
        expect(d.feito).toBe(true);
        expect(c.textos[NOTA]).toBe(TEXTO);
    });
    it('a linha que mudou depois da leitura e o mesmo estado não gravam nem entram na pilha', async () => {
        const c = cofre();
        expect((await c.g.checklist(NOTA, { via: 'marcar', linha: 5, feito: true, texto: 'outro' })).ok).toBe(false);
        expect((await c.g.checklist(NOTA, { via: 'marcar', linha: 6, feito: true, texto: 'carregador' })).texto).toBe('Checklist: já estava assim');
        expect(c.textos[NOTA]).toBe(TEXTO);
        expect(c.pilha.tamanho()).toBe(0);
    });
    it('o Desfazer não mexe na linha que outro gesto mudou depois', async () => {
        const c = cofre();
        await c.g.checklist(NOTA, { via: 'marcar', linha: 5, feito: true, texto: 'passaporte' });
        c.textos[NOTA] = c.textos[NOTA].replace('- [x] passaporte', '- [x] passaporte novo');
        const antes = c.textos[NOTA];
        const d = await c.g.desfazer();
        expect(d.feito).toBe(false);
        expect(c.textos[NOTA]).toBe(antes);
    });
});

describe('acrescentar um item', () => {
    it('uma linha nova no fim do bloco, e nada mais muda; o Desfazer a tira', async () => {
        const c = cofre();
        const r = await c.g.checklist(NOTA, { via: 'acrescentar', texto: 'escova' });
        expect(r).toEqual({ ok: true, texto: 'Item: escova' });
        expect(c.textos[NOTA]).toBe(TEXTO.replace('- [x] carregador\n', '- [x] carregador\n- [ ] escova\n'));
        await c.g.desfazer();
        expect(c.textos[NOTA]).toBe(TEXTO);
    });
    it('o item vazio não grava; o lugar sem gravar texto diz o porquê', async () => {
        const c = cofre();
        expect((await c.g.checklist(NOTA, { via: 'acrescentar', texto: '  ' })).texto).toBe('Checklist: Escreva o item');
        const s = cofre(TEXTO, false);
        expect((await s.g.checklist(NOTA, { via: 'acrescentar', texto: 'x' })).ok).toBe(false);
        expect(s.pilha.tamanho()).toBe(0);
    });
});
