/** Prova da próxima ação fixada (02/11): o leitor do `proxima_acao_real:` e a fixada entre as candidatas. */
import { describe, expect, it } from 'vitest';
import { CAMPO_DA_PROXIMA_ACAO, declaredNextAction, fixadaEntre } from '../../src/engine/proximaAcao';

describe('o leitor do campo', () => {
    it('lê o nome do link, também de uma lista; sem o campo, vazio', () => {
        expect(declaredNextAction({ [CAMPO_DA_PROXIMA_ACAO]: '[[Enviar a proposta|enviar]]' })).toBe('Enviar a proposta');
        expect(declaredNextAction({ [CAMPO_DA_PROXIMA_ACAO]: ['[[Enviar a proposta]]', '[[Outra]]'] })).toBe('Enviar a proposta');
        expect(declaredNextAction({})).toBe('');
        expect(declaredNextAction(undefined)).toBe('');
        expect(declaredNextAction({ [CAMPO_DA_PROXIMA_ACAO]: null })).toBe('');
    });
});

describe('a fixada entre as candidatas', () => {
    const cands = [
        { path: 'TaskNotes/Tasks/Revisar o texto.md', nome: 'Revisar o texto' },
        { path: 'TaskNotes/Tasks/Enviar a proposta.md', nome: 'Enviar a proposta' },
    ];
    const chaves = (c: typeof cands[number]) => [c.path, c.nome];
    it('acha pelo nome ou pelo caminho, sem caixa, sem .md e sem espaço nas pontas', () => {
        expect(fixadaEntre(cands, 'Enviar a proposta', chaves)).toBe(cands[1]);
        expect(fixadaEntre(cands, ' enviar a proposta.md ', chaves)).toBe(cands[1]);
        expect(fixadaEntre(cands, 'TaskNotes/Tasks/Revisar o texto.md', chaves)).toBe(cands[0]);
    });
    it('a fixada que não é candidata (feita, de outro projeto) não inventa nada; o campo vazio também não', () => {
        expect(fixadaEntre(cands, 'Publicar', chaves)).toBeNull();
        expect(fixadaEntre(cands, '', chaves)).toBeNull();
        expect(fixadaEntre([], 'Enviar a proposta', chaves)).toBeNull();
    });
});
