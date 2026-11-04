/**
 * As respostas da inicialização nas definições (`definicoesRespondidas`, C do mapa da v0): o nome,
 * os valores, as áreas com a pasta do plano, o foco do trimestre e `inicializado: true`, pela mesma
 * edição da aba; só o que mudou entra, e rodar de novo não muda nada.
 */
import { describe, expect, it } from 'vitest';
import { lerDefinicoes } from '../../src/definicoes';
import { definicoesRespondidas, pastasDasAreas } from '../../src/engine/inicializacao';

const RESPOSTAS = { nome: 'Ana', areas: 'Saúde\nTrabalho', valores: 'Calma | para decidir sem pressa\nCuriosidade', foco: 'Trabalho' };
const pastas = (respostas: Record<string, unknown>, existentes: string[] = []) =>
    pastasDasAreas(String(respostas.areas ?? '').split('\n').filter(Boolean).map(nome => ({ nome })), existentes).pastas;

describe('definicoesRespondidas', () => {
    it('grava o nome, os valores, as áreas com a pasta, o foco e inicializado', () => {
        const r = definicoesRespondidas({}, [], RESPOSTAS, pastas(RESPOSTAS));
        expect(r.problemas).toEqual([]);
        expect(r.mudou).toBe(true);
        const d = lerDefinicoes({ definicoes: r.bloco });
        expect(d.inicializado).toBe(true);
        expect(d.pessoa.nome).toBe('Ana');
        expect(d.valores).toEqual([{ nome: 'Calma', porque: 'para decidir sem pressa' }, { nome: 'Curiosidade', porque: '' }]);
        expect(d.areas.map(a => [a.nome, a.pasta])).toEqual([['Saúde', '01 - Saúde'], ['Trabalho', '02 - Trabalho']]);
        expect(d.trimestre.foco).toEqual(['Trabalho']);
    });

    it('rodar de novo com as mesmas respostas não muda nada', () => {
        const primeira = definicoesRespondidas({}, [], RESPOSTAS, pastas(RESPOSTAS));
        const salvo = { definicoes: primeira.bloco };
        const segunda = definicoesRespondidas(salvo, [], RESPOSTAS, pastas(RESPOSTAS, ['01 - Saúde', '02 - Trabalho']));
        expect(segunda.mudou).toBe(false);
        expect(segunda.bloco).toEqual(primeira.bloco);
    });

    it('sem respostas, só marca inicializado e deixa as áreas gravadas como estão', () => {
        const salvo = { definicoes: { areas: [{ nome: 'Casa', pasta: '01 - Casa', etiqueta: '#projeto/casa' }] } };
        const r = definicoesRespondidas(salvo, [], {}, [['Casa', '01 - Casa']]);
        expect(r.bloco).toEqual({ areas: [{ nome: 'Casa', pasta: '01 - Casa', etiqueta: '#projeto/casa' }], inicializado: true });
        expect(salvo.definicoes).toEqual({ areas: [{ nome: 'Casa', pasta: '01 - Casa', etiqueta: '#projeto/casa' }] });
        expect(definicoesRespondidas({ definicoes: r.bloco }, [], {}, []).mudou).toBe(false);
    });

    it('a resposta vazia não mexe no campo; a camada de partida que já diz o mesmo não grava', () => {
        const partida = [{ pessoa: { nome: 'Ana' } }];
        const r = definicoesRespondidas({}, partida, { nome: 'Ana', valores: '  ', foco: '' }, []);
        expect(r.bloco).toEqual({ inicializado: true });
    });
});
