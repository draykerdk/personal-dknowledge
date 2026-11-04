import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    choiceRankItems,
    choiceReasonLine,
    escolher,
    fieldBoolean,
    fieldNumber,
    fieldText,
    type Candidato,
} from '../../src/engine/choose';
import { parseDomainModel } from '../../src/engine/domainModel';

/**
 * Escolher, para qualquer lista de candidatos (núcleo de 21/10, plano da etapa 1,
 * seção 1), com o modelo de teste (não é um domínio real) e os pontos dele:
 * custo (faixa relativa ao orçamento) 2 · 1 · 0; nível alto 2, médio 1, baixo 0;
 * extras +1 cada, até 3; ativo sim 1, não 0. Orçamento de referência: 1000.
 */
const FIXTURES = resolve(__dirname, '../fixtures/dominio');
const read = (name: string) => JSON.parse(readFileSync(resolve(FIXTURES, name), 'utf8'));
const MODELO = parseDomainModel(read('fixture_escolha.json'), 'fixture_escolha').modelo!;
const PONTOS = read('pesos_decisao.json').pesos.fixture_escolha;
const CONTEXTO = { orcamento: 1000 };

const c = (titulo: string, campos: Record<string, any>): Candidato => ({ id: `Teste/Opcoes/${titulo}.md`, titulo, campos });
const pontosDe = (escolha: ReturnType<typeof escolher>, titulo: string) => escolha.ordenados.find(o => o.titulo === titulo)?.total;

describe('escolher', () => {
    it('soma uma categoria de cada regra, com os pontos da tabela', () => {
        const escolha = escolher([
            c('A', { custo_mes: 900, nivel: 'alto', extras: ['x', 'y'], ativo: true }),
        ], MODELO.escolher, PONTOS, CONTEXTO);
        const [a] = escolha.ordenados;
        expect(a.total).toBe(2 + 2 + 2 + 1);
        expect(a.motivos.map(m => [m.chave, m.pontos])).toEqual([
            ['custo', 2], ['nivel', 2], ['extras', 2], ['ativo', 1],
        ]);
        expect(choiceReasonLine(a)).toBe('💰 custo 0,9× orçamento +2 · ⭐ nível alto +2 · ➕ extras 2 +2 · ✅ ativo sim +1');
    });

    it('faixa relativa: até a base, até 20% acima, acima', () => {
        const escolha = escolher([
            c('base', { custo_mes: 1000 }),
            c('vinte', { custo_mes: 1200 }),
            c('acima', { custo_mes: 1300 }),
        ], MODELO.escolher, PONTOS, CONTEXTO);
        const custo = (t: string) => escolha.ordenados.find(o => o.titulo === t)!.motivos.find(m => m.chave === 'custo')!.pontos;
        expect([custo('base'), custo('vinte'), custo('acima')]).toEqual([2, 1, 0]);
    });

    it('contagem: cada × tamanho, até o máximo da tabela; booleano em texto', () => {
        const escolha = escolher([
            c('muitos', { extras: ['a', 'b', 'c', 'd', 'e'], ativo: 'não' }),
            c('um', { extras: 'só um', ativo: 'sim' }),
        ], MODELO.escolher, PONTOS, CONTEXTO);
        const de = (t: string, k: string) => escolha.ordenados.find(o => o.titulo === t)!.motivos.find(m => m.chave === k)!;
        expect(de('muitos', 'extras').pontos).toBe(3);
        expect(de('muitos', 'extras').texto).toBe('➕ extras 5');
        expect(de('muitos', 'ativo')).toMatchObject({ pontos: 0, texto: '✅ ativo não' });
        expect(de('um', 'extras').pontos).toBe(1);
        expect(de('um', 'ativo').pontos).toBe(1);
    });

    it('campo ausente: 0 ponto e "sem dado: <campo>", visível', () => {
        const [vazio] = escolher([c('vazio', {})], MODELO.escolher, PONTOS, CONTEXTO).ordenados;
        expect(vazio.total).toBe(0);
        expect(vazio.motivos.map(m => m.texto)).toEqual(['sem dado: custo_mes', 'sem dado: nivel', 'sem dado: extras', 'sem dado: ativo']);
        expect(choiceReasonLine(vazio)).toBe('sem dado: custo_mes · sem dado: nivel · sem dado: extras · sem dado: ativo');
    });

    it('referência ausente no contexto: sem dado da referência, sem dividir por zero', () => {
        const [a] = escolher([c('A', { custo_mes: 900 })], MODELO.escolher, PONTOS, {}).ordenados;
        expect(a.motivos.find(m => m.chave === 'custo')).toEqual({ chave: 'custo', pontos: 0, texto: 'sem dado: orcamento' });
        const [b] = escolher([c('B', { custo_mes: 900 })], MODELO.escolher, PONTOS, { orcamento: 0 }).ordenados;
        expect(b.motivos.find(m => m.chave === 'custo')?.texto).toBe('sem dado: orcamento');
    });

    it('valor fora da tabela vale 0 e diz que não tem ponto', () => {
        const [a] = escolher([c('A', { nivel: 'raro' })], MODELO.escolher, PONTOS, CONTEXTO).ordenados;
        expect(a.motivos.find(m => m.chave === 'nivel')).toEqual({ chave: 'nivel', pontos: 0, texto: '⭐ nível raro (sem ponto na tabela)' });
    });

    it('os eliminados por filtro aparecem à parte, com o motivo, e nunca somem', () => {
        const escolha = escolher([
            c('Fica', { custo_mes: 1000, nivel: 'medio' }),
            c('Bloqueada', { custo_mes: 500, nivel: 'bloqueado' }),
            c('Cara', { custo_mes: 1600, nivel: 'alto' }),
            c('No limite', { custo_mes: 1500, nivel: 'baixo' }),
        ], MODELO.escolher, PONTOS, CONTEXTO);
        expect(escolha.ordenados.map(o => o.titulo)).toEqual(['Fica', 'No limite']);
        expect(escolha.eliminados).toEqual([
            { id: 'Teste/Opcoes/Bloqueada.md', titulo: 'Bloqueada', motivo: 'nível bloqueado' },
            { id: 'Teste/Opcoes/Cara.md', titulo: 'Cara', motivo: 'custo acima de 1,5 vez o orçamento' },
        ]);
    });

    it('sem dado no campo do filtro, não elimina', () => {
        const escolha = escolher([c('Sem custo', { nivel: 'alto' })], MODELO.escolher, PONTOS, {});
        expect(escolha.eliminados).toEqual([]);
        expect(escolha.ordenados).toHaveLength(1);
    });

    it('ordem: total decrescente e, no empate, o título', () => {
        const escolha = escolher([
            c('Beta', { nivel: 'medio' }),
            c('alfa', { nivel: 'medio' }),
            c('Gama', { nivel: 'alto' }),
        ], MODELO.escolher, PONTOS, CONTEXTO);
        expect(escolha.ordenados.map(o => o.titulo)).toEqual(['Gama', 'alfa', 'Beta']);
        expect(pontosDe(escolha, 'Gama')).toBe(2);
    });

    it('não muta a entrada; tabela vazia vale 0', () => {
        const lista = [c('A', { nivel: 'alto', extras: ['x'] })];
        const antes = JSON.stringify(lista);
        const escolha = escolher(lista, MODELO.escolher, {}, CONTEXTO);
        expect(JSON.stringify(lista)).toBe(antes);
        expect(escolha.ordenados[0].total).toBe(0);
    });

    it('as linhas do seletor: os 3 primeiros em destaque, os eliminados no fim, marcados', () => {
        const escolha = escolher([
            c('Um', { nivel: 'alto', ativo: true }),
            c('Dois', { nivel: 'alto' }),
            c('Três', { nivel: 'medio' }),
            c('Quatro', { nivel: 'baixo' }),
            c('Fora', { nivel: 'bloqueado' }),
        ], MODELO.escolher, PONTOS, CONTEXTO);
        const items = choiceRankItems(escolha);
        expect(items.map(i => i.title)).toEqual(['⭐ Um', '⭐ Dois', '⭐ Três', 'Quatro', '🚫 Fora']);
        expect(items.map(i => i.destaque)).toEqual([true, true, true, false, false]);
        expect(items[4]).toMatchObject({ eliminado: true, note: 'fora: nível bloqueado', pontos: 0 });
        expect(items[0]).toMatchObject({ path: 'Teste/Opcoes/Um.md', pontos: 3 });
        expect(items[0].note).toBe(items[0].motivo);
    });

    it('a leitura dos campos: link, número em texto, sim/não', () => {
        expect(fieldText('[[Nota|rótulo]]')).toBe('Nota');
        expect(fieldText(null)).toBe('');
        expect(fieldNumber('1200,5')).toBe(1200.5);
        expect(fieldNumber('abc')).toBeNull();
        expect(fieldBoolean('Sim')).toBe(true);
        expect(fieldBoolean('não')).toBe(false);
        expect(fieldBoolean('talvez')).toBeNull();
    });
});
