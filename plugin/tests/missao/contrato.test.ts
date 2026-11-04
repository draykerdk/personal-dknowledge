/**
 * Prova do contrato da vista (passo `dica` da divisão da Missão, H5): sem o lugar, o botão ganha o
 * mesmo nome que as dicas da casa (ui/dica.ts) dariam; com o lugar, as dicas dele. Teste
 * diferencial: as duas versões do nome nos mesmos casos.
 */
import { describe, expect, it, vi } from 'vitest';

const tooltips: string[] = [];
vi.mock('obsidian', () => ({ setTooltip: (_el: unknown, t: string) => { tooltips.push(t); }, displayTooltip: () => {} }));

import { marcarDica, textoDaDica } from '../../src/ui/dica';
import { DICAS_SO_DO_NOME, nomeComTecla } from '../../src/missao/view/contrato';

/** Um elemento que só guarda os atributos. */
const elemento = () => {
    const attrs = new Map<string, string>();
    return { attrs, setAttribute: (k: string, v: string) => { attrs.set(k, v); }, getAttribute: (k: string) => attrs.get(k) ?? null } as unknown as HTMLElement & { attrs: Map<string, string> };
};

const CASOS: Array<[string, string | undefined]> = [
    ['Hoje: volta ao período de hoje', 'H'], ['  Buscar  ', '/'], ['Legenda: cores, estados, gestos e teclas', undefined],
    ['', 'H'], ['   ', undefined], ['<b>texto</b>', 'Enter'], ['Desligar esta ligação', 'Delete'],
];

describe('o nome sem o lugar é o das dicas da casa', () => {
    it('nomeComTecla = textoDaDica, nos mesmos casos', () => {
        for (const [t, k] of CASOS) expect(nomeComTecla(t, k), `${t}|${k}`).toBe(textoDaDica(t, k));
    });

    it('DICAS_SO_DO_NOME.marcar deixa os mesmos atributos que marcarDica (sem posição)', () => {
        for (const [t, k] of CASOS) {
            const a = elemento(), b = elemento();
            DICAS_SO_DO_NOME.marcar(a, t, k ? { tecla: k } : {});
            marcarDica(b, t, k ? { tecla: k } : {});
            expect([...a.attrs.entries()], `${t}|${k}`).toEqual([...b.attrs.entries()]);
        }
    });

    it('o texto vazio não apaga o nome que havia', () => {
        const a = elemento();
        DICAS_SO_DO_NOME.marcar(a, 'Hoje');
        DICAS_SO_DO_NOME.marcar(a, '  ');
        expect(a.getAttribute('aria-label')).toBe('Hoje');
    });

    it('sem o lugar, ligar não liga nada e o desligar existe', () => {
        const raiz = { addEventListener: vi.fn() } as unknown as HTMLElement;
        const desligar = DICAS_SO_DO_NOME.ligar(raiz);
        expect(typeof desligar).toBe('function');
        expect((raiz.addEventListener as any).mock.calls).toHaveLength(0);
        desligar();
    });
});
