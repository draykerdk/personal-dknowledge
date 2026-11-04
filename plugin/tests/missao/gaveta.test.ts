/**
 * A gaveta do ciclo, pura (P12b): o pedido de um botão (o protocolo, as datas explícitas, o modo e
 * os líderes), os campos com o valor de abertura e o porquê, as condições relidas, a resposta vazia
 * do modal, o título curto, a nota a criar no passo, a conferência e as rodadas.
 */
import { describe, expect, it } from 'vitest';
import {
    chaveDoRascunho, conferirGaveta, criacoesAoGravar, pedidoDoCiclo, resumoDoResto, rodadaCompletaDaGaveta, rodadaDaGaveta, rotuloDoPasso, vistaDaGaveta,
    type OpcoesDoPasso, type ProtocoloDaGaveta,
} from '../../src/missao/gaveta';

const DEF = {
    id: 'teste', name: 'Teste',
    steps: [
        { id: 'fato', type: 'text', required: true, prompt: 'OPCIONAL: o fato?\nmais', defaultFrom: [{ sugestao: 'feitas' }] },
        { id: 'modo', type: 'suggest', prompt: 'Modo', options: ['a', 'b'] },
        { id: 'so_b', type: 'text', prompt: 'Só no b', condition: { variable: 'modo', value: 'b' } },
        { id: 'marcas', type: 'multiselect', prompt: 'Marcas', options: ['X', 'Y'], maxSelect: 1 },
        { id: 'nota', type: 'suggest_note', prompt: 'Nota', allowCreate: true, optional: true },
        { id: 'acao', type: 'text', prompt: 'Ação' },
    ],
    createTask: { titleVar: 'acao', askTitle: true },
};
const P: Pick<ProtocoloDaGaveta, 'def' | 'contexto' | 'leitor' | 'doBotao' | 'tituloCurto'> = {
    def: DEF, doBotao: {}, contexto: { variaveis: {}, frontmatterDoDia: null },
    leitor: { frontmatter: () => null, caminho: s => s, sugestao: () => ({ valor: 'Vídeo no ar', porque: 'o que foi concluído' }) },
    tituloCurto: r => r.split('.')[0],
};
const SEM = new Map<string, OpcoesDoPasso>();

describe('o pedido do botão', () => {
    const base = { emoji: '🧪', protocolo: 'teste', ponta: 'fim' as const, valores: {} as Record<string, string> };
    it('o dia do ramo, senão hoje; os pinos; as outras variáveis como respostas do botão; o modo pela ponta', () => {
        expect(pedidoDoCiclo({ ...base, valores: { _context_date: '2026-10-27', x: '1' } }, '2026-10-28'))
            .toEqual({ protocolo: 'teste', datas: { dia: '2026-10-27' }, doBotao: { x: '1' }, modo: 'revisar', lideres: [] });
        expect(pedidoDoCiclo({ ...base, ponta: 'inicio', valores: { _target_week_pin: '2026-W45' } }, '2026-10-28'))
            .toEqual({ protocolo: 'teste', datas: { dia: '2026-10-28', semana: '2026-W45' }, doBotao: {}, modo: 'planejar', lideres: [] });
        expect(pedidoDoCiclo({ ...base, valores: { _context_date: '' } }, '2026-10-28')!.datas.dia).toBe('2026-10-28');
        expect(pedidoDoCiclo({ ...base, protocolo: '' }, '2026-10-28')).toBeNull();
        expect(pedidoDoCiclo(base, 'ontem')).toBeNull();
    });
    it('o 📨 da tabela dos botões traz os líderes; o mesmo emoji com outro protocolo não', () => {
        expect(pedidoDoCiclo({ ...base, emoji: '📨', protocolo: 'review_semanal' }, '2026-10-28')!.lideres).toEqual(['relatorio', 'fato_semana']);
        expect(pedidoDoCiclo({ ...base, emoji: '📨', protocolo: 'outro' }, '2026-10-28')!.lideres).toEqual([]);
        expect(chaveDoRascunho({ escala: 'semana', chave: '2026-W44', emoji: '📨', protocolo: 'review_semanal' })).not.toBe(chaveDoRascunho({ escala: 'semana', chave: '2026-W44', emoji: '📅', protocolo: 'review_semanal' }));
    });
});

describe('os campos na gaveta', () => {
    it('cada campo abre como o modal: a sugestão com o porquê, a resposta vazia, a escolha sem padrão sem resposta', () => {
        const v = vistaDaGaveta(P, {}, SEM);
        const por = Object.fromEntries([...v.topo, ...v.resto].map(c => [c.campo.id, c]));
        expect(por.fato).toMatchObject({ valor: 'Vídeo no ar', origem: 'o que foi concluído', sugerido: true });
        expect(por.marcas.valor).toBe('Nenhum');
        expect(por.nota.valor).toBe('');
        expect(v.semResposta).toEqual(['modo']);
        expect(v.respostas).not.toHaveProperty('modo');
        expect(Object.keys(por)).not.toContain('so_b');
        // A ação vazia não cria tarefa: sem título curto.
        expect(v.titulos).toEqual({});
    });
    it('o digitado vence a sugestão; a condição mostra o passo; voltar o esconde e a resposta dele sai', () => {
        const v = vistaDaGaveta(P, { fato: 'Outro', modo: 'b', so_b: 'x' }, SEM);
        expect([...v.topo, ...v.resto].find(c => c.campo.id === 'fato')).toMatchObject({ valor: 'Outro', sugerido: false });
        expect(v.respostas.so_b).toBe('x');
        const w = vistaDaGaveta(P, { fato: 'Outro', modo: 'a', so_b: 'x' }, SEM);
        expect(w.respostas).not.toHaveProperty('so_b');
        expect(w.estado.escondidos).toEqual(['so_b']);
    });
    it('o título curto da tarefa (askTitle): a sugestão do motor, ou o digitado; vai como `<titleVar>_titulo`', () => {
        const v = vistaDaGaveta(P, { acao: 'Gravar o vídeo. Depois editar' }, SEM);
        expect(v.titulos.acao).toMatchObject({ chave: 'acao_titulo', valor: 'Gravar o vídeo', sugerido: true });
        expect(v.respostas.acao_titulo).toBe('Gravar o vídeo');
        const w = vistaDaGaveta(P, { acao: 'Gravar o vídeo. Depois editar', acao_titulo: 'Vídeo' }, SEM);
        expect(w.respostas.acao_titulo).toBe('Vídeo');
        expect(w.titulos.acao.sugerido).toBe(false);
    });
    it('os líderes no topo; o resumo do resto conta os preenchidos e os sugeridos', () => {
        const v = vistaDaGaveta(P, {}, SEM, ['modo', 'nada']);
        expect(v.topo.map(c => c.campo.id)).toEqual(['modo']);
        expect(resumoDoResto(v)).toEqual({ campos: 4, preenchidos: 1, sugeridos: 1 });
    });
    it('a entrada não muda', () => {
        const digitadas = { fato: 'x' };
        vistaDaGaveta(P, digitadas, SEM);
        expect(digitadas).toEqual({ fato: 'x' });
    });
});

describe('criar no passo, a conferência e as rodadas', () => {
    it('cria só o pedido, com título que nenhuma candidata tem, no passo que deixa criar', () => {
        const op = new Map<string, OpcoesDoPasso>([['nota', { lista: null, notas: [{ nome: 'Existe', caminho: 'T/Existe.md' }] }]]);
        expect(criacoesAoGravar(vistaDaGaveta(P, { nota: 'Nova' }, op), { nota: { contextos: ['💻'] } })).toEqual([{ passo: 'nota', titulo: 'Nova', contextos: ['💻'] }]);
        expect(criacoesAoGravar(vistaDaGaveta(P, { nota: 'Existe' }, op), { nota: { contextos: [] } })).toEqual([]);
        expect(criacoesAoGravar(vistaDaGaveta(P, { nota: 'Nova' }, op), {})).toEqual([]);
        expect(criacoesAoGravar(vistaDaGaveta(P, { fato: 'Nova' }, op), { fato: { contextos: [] } })).toEqual([]);
    });
    it('a conferência: o obrigatório vazio e as marcadas a mais', () => {
        const v = vistaDaGaveta(P, { fato: '', marcas: 'X, Y' }, SEM);
        expect(Object.keys(conferirGaveta(P, v)).sort()).toEqual(['fato', 'marcas']);
    });
    it('Gravar: as respostas, as da nota criada, `_respondidos` e as datas; Abrir no protocolo: `_valoresIniciais`', () => {
        const v = vistaDaGaveta({ ...P, doBotao: { modo_x: 'y' } }, { modo: 'a' }, SEM);
        const r = rodadaDaGaveta(P, v, { nota: 'Nova', nota_path: 'T/Nova.md', nota_created: true }, { dia: '2026-10-28', semana: '2026-W44' });
        if (!('variaveis' in r)) throw new Error(r.problema);
        expect(r.variaveis).toMatchObject({ fato: 'Vídeo no ar', modo: 'a', nota: 'Nova', nota_path: 'T/Nova.md', modo_x: 'y', _context_date: '2026-10-28', _target_week_pin: '2026-W44' });
        expect(r.variaveis._respondidos).toEqual(['fato', 'modo', 'marcas', 'nota', 'acao']);
        const c = rodadaCompletaDaGaveta({ ...P, doBotao: { modo_x: 'y' } }, v, { dia: '2026-10-28' });
        if (!('variaveis' in c)) throw new Error(c.problema);
        expect(c.variaveis).toMatchObject({ modo_x: 'y', _context_date: '2026-10-28', _valoresIniciais: { fato: 'Vídeo no ar', modo: 'a' } });
        expect(rodadaDaGaveta(P, v, {}, { dia: 'x' })).toHaveProperty('problema');
    });
    it('o rótulo: a primeira linha da pergunta, sem o OPCIONAL da frente', () => {
        expect(rotuloDoPasso(DEF.steps[0])).toBe('o fato?');
        expect(rotuloDoPasso({ id: 'z' })).toBe('z');
    });
});
