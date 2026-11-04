import { describe, expect, it } from 'vitest';
import {
    BLOCK_LOG_END,
    BLOCK_LOG_START,
    addMinutes,
    blockLogPath,
    closeBlockRecords,
    lastChoice,
    learnedFit,
    parseBlockLog,
    previousMonth,
    renderBlockLog,
    withCompletion,
    type BlockRecord,
    type CompletionFact,
} from '../../src/engine/blockLog';

const rec = (over: Partial<BlockRecord> = {}): BlockRecord => ({
    id: '2026-10-19T10:00·Gravar', data: '2026-10-19', tarefa: 'Gravar', caminho: 'TaskNotes/Tasks/Gravar.md',
    projeto: 'Vídeos', tags: ['video'], lugar: '🚶 Campo', bloco_min: 60, inicio: '2026-10-19T10:00', ...over,
});

describe('o arquivo do mês', () => {
    it('um arquivo por mês, na pasta da reputação contextual', () => {
        expect(blockLogPath('2026-10-19')).toBe('400 - MEMORY/100 - DAILY/Reputação contextual/Blocos 2026-10.md');
        expect(previousMonth('2026-01')).toBe('2025-12');
        expect(previousMonth('2026-10')).toBe('2026-09');
    });

    it('nota nova: frontmatter, explicação e os registros entre os marcadores; ida e volta', () => {
        const text = renderBlockLog(null, '2026-10', [rec()]);
        expect(text).toContain('type: reputacao_contextual');
        expect(text).toContain(BLOCK_LOG_START);
        expect(parseBlockLog(text)).toEqual([rec()]);
    });

    it('o que ele escrever fora dos marcadores não muda', () => {
        const first = renderBlockLog(null, '2026-10', [rec()]);
        const edited = `${first}\n## Minhas notas\nvídeo rende de manhã\n`;
        const again = renderBlockLog(edited, '2026-10', [rec(), rec({ id: 'b', tarefa: 'Editar' })]);
        expect(again).toContain('vídeo rende de manhã');
        expect(parseBlockLog(again).map(r => r.id)).toEqual([rec().id, 'b']);
        expect(again.split(BLOCK_LOG_END).length).toBe(2);
    });

    it('linha estragada à mão fica de fora; o resto vale', () => {
        const text = `${BLOCK_LOG_START}\n\`\`\`jsonl\n{"id":"a","tarefa":"x"}\n{quebrada\n{"sem":"id"}\n\`\`\`\n${BLOCK_LOG_END}`;
        expect(parseBlockLog(text).map(r => r.id)).toEqual(['a']);
        expect(parseBlockLog('sem marcadores')).toEqual([]);
    });
});

describe('fechar o bloco', () => {
    it('sem pomodoro: o fim é o estimado (início + bloco), nunca depois de agora', () => {
        const { records, fechados } = closeBlockRecords([rec()], { agora: '2026-10-19T12:30', medida: 'estimado', saiu: () => 'nada' });
        expect(fechados).toHaveLength(1);
        expect(records[0]).toMatchObject({ fim: '2026-10-19T11:00', medida: 'estimado', saiu: 'nada' });
        const cedo = closeBlockRecords([rec()], { agora: '2026-10-19T10:20', medida: 'estimado', saiu: () => 'nada' });
        expect(cedo.records[0].fim).toBe('2026-10-19T10:20');
    });

    it('medido pelo pomodoro: o fim é agora', () => {
        const { records } = closeBlockRecords([rec()], { agora: '2026-10-19T10:25', medida: 'medido', saiu: () => 'concluída' });
        expect(records[0]).toMatchObject({ fim: '2026-10-19T10:25', medida: 'medido', saiu: 'concluída' });
    });

    it('bloco já fechado não muda; `somente` escolhe qual; a entrada não é mutada', () => {
        const fechado = rec({ id: 'f', fim: '2026-10-19T09:00', saiu: '📤', medida: 'medido' });
        const outro = rec({ id: 'o', caminho: 'TaskNotes/Tasks/Outra.md' });
        const input = [fechado, rec(), outro];
        const snapshot = JSON.stringify(input);
        const { records, fechados } = closeBlockRecords(input, {
            agora: '2026-10-19T10:30', medida: 'medido', saiu: () => 'nada', somente: r => r.caminho === 'TaskNotes/Tasks/Gravar.md',
        });
        expect(fechados.map(r => r.id)).toEqual([rec().id]);
        expect(records[0]).toEqual(fechado);
        expect(records[2].fim).toBeUndefined();
        expect(JSON.stringify(input)).toBe(snapshot);
    });

    it('"2 h ou mais" sem tamanho conta 120 min; a virada do dia soma certo', () => {
        expect(addMinutes('2026-10-31T23:30', 60)).toBe('2026-11-01T00:30');
        const { records } = closeBlockRecords([rec({ bloco_min: null })], { agora: '2026-10-19T20:00', medida: 'estimado', saiu: () => 'nada' });
        expect(records[0].fim).toBe('2026-10-19T12:00');
    });
});

describe('o que o registro ensina', () => {
    const rendeu = rec({ fim: '2026-10-19T11:00', saiu: 'concluída', medida: 'medido' });

    it('rendeu: mesmo lugar, mesmo tamanho, mesmo projeto ou tag em comum, e saiu', () => {
        expect(learnedFit([rendeu], { projeto: 'Vídeos', tags: [], lugar: '🚶 Campo', bloco_min: 60 })).toBe(true);
        expect(learnedFit([rendeu], { projeto: 'Outro', tags: ['video'], lugar: '🚶 Campo', bloco_min: 60 })).toBe(true);
        expect(learnedFit([rendeu], { projeto: 'Outro', tags: ['texto'], lugar: '🚶 Campo', bloco_min: 60 })).toBe(false);
        expect(learnedFit([rec()], { projeto: 'Vídeos', tags: [], lugar: '🚶 Campo', bloco_min: 60 })).toBe(false); // aberto
        expect(learnedFit([], { projeto: 'Vídeos', tags: [], lugar: '🚶 Campo', bloco_min: 60 })).toBe(false);
    });

    it('a última escolha (o provável) é a do último início', () => {
        const a = rec({ inicio: '2026-10-18T10:00', lugar: '💻 Computador', bloco_min: 30 });
        const b = rec({ inicio: '2026-10-19T10:00', lugar: '📱 Celular', bloco_min: 15 });
        expect(lastChoice([b, a])).toEqual({ lugar: '📱 Celular', bloco_min: 15 });
        expect(lastChoice([])).toEqual({});
    });
});

describe('a conclusão com a hora ("Quando terminou?", 4.6)', () => {
    const fact = (over: Partial<CompletionFact> = {}): CompletionFact => ({
        caminho: 'TaskNotes/Tasks/Gravar.md', tarefa: 'Gravar', projeto: 'Vídeos', tags: ['video'],
        data: '2026-10-19', hora: '10:40', medida: 'estimado', ...over,
    });

    it('o bloco aberto da tarefa fecha na hora dita, concluída; o de outra tarefa não muda', () => {
        const outra = rec({ id: 'x', tarefa: 'Editar', caminho: 'TaskNotes/Tasks/Editar.md' });
        const out = withCompletion([rec(), outra], fact());
        expect(out[0]).toMatchObject({ fim: '2026-10-19T10:40', saiu: 'concluída', medida: 'estimado' });
        expect(out[1]).toBe(outra);
    });

    it('agora com o pomodoro rodando: medido; a tarefa arquivada (outra pasta) acha o bloco pelo nome', () => {
        const out = withCompletion([rec()], fact({ caminho: 'TaskNotes/Archive/Gravar.md', medida: 'medido' }));
        expect(out[0]).toMatchObject({ fim: '2026-10-19T10:40', medida: 'medido' });
    });

    it('a hora dita antes do início não fecha o bloco antes de ele abrir; sem hora, o fim vem do tamanho, estimado', () => {
        expect(withCompletion([rec()], fact({ hora: '09:00' }))[0].fim).toBe('2026-10-19T10:00');
        expect(withCompletion([rec()], fact({ hora: null, medida: 'medido' }))[0]).toMatchObject({ fim: '2026-10-19T11:00', medida: 'estimado' });
    });

    it('o bloco fechado como "nada" no mesmo dia (o pomodoro acabou antes) passa a concluída, sem mexer no fim', () => {
        const fechado = rec({ fim: '2026-10-19T10:25', saiu: 'nada', medida: 'medido' });
        expect(withCompletion([fechado], fact({ hora: '11:00' }))).toEqual([{ ...fechado, saiu: 'concluída' }]);
    });

    it('sem bloco e com hora: o registro só de conclusão (sem lugar nem tempo); de novo, não duplica', () => {
        const once = withCompletion([], fact());
        expect(once).toEqual([{
            id: '2026-10-19T10:40·Gravar·conclusão', data: '2026-10-19', tarefa: 'Gravar', caminho: 'TaskNotes/Tasks/Gravar.md',
            projeto: 'Vídeos', tags: ['video'], lugar: '', bloco_min: null, inicio: '2026-10-19T10:40', fim: '2026-10-19T10:40',
            saiu: 'concluída', medida: 'estimado',
        }]);
        expect(withCompletion(once, fact())).toBe(once);
    });

    it('sem bloco e sem hora ("Ontem"), ou só fechando (o mês anterior): nada entra, o mesmo array volta', () => {
        const list: BlockRecord[] = [];
        expect(withCompletion(list, fact({ hora: null }))).toBe(list);
        expect(withCompletion(list, fact(), { append: false })).toBe(list);
    });

    it('"Ontem" sem hora, com o lugar e o tamanho confirmados: um bloco estimado no dia dito, no meio-dia, marcado sem hora; de novo, não duplica', () => {
        const once = withCompletion([], fact({ data: '2026-10-18', hora: null, lugar: '🎬 Criação', bloco_min: 60 }));
        expect(once).toEqual([{
            id: '2026-10-18·Gravar·conclusão', data: '2026-10-18', tarefa: 'Gravar', caminho: 'TaskNotes/Tasks/Gravar.md',
            projeto: 'Vídeos', tags: ['video'], lugar: '🎬 Criação', bloco_min: 60, inicio: '2026-10-18T11:00', fim: '2026-10-18T12:00',
            saiu: 'concluída', medida: 'estimado', sem_hora: true,
        }]);
        expect(withCompletion(once, fact({ data: '2026-10-18', hora: null, lugar: '🎬 Criação', bloco_min: 60 }))).toBe(once);
        // É dado que ensina: o mesmo tipo rendeu neste lugar e neste tamanho.
        expect(learnedFit(once, { projeto: 'Vídeos', tags: [], lugar: '🎬 Criação', bloco_min: 60 })).toBe(true);
    });

    it('"Mais cedo hoje" com o lugar e o tamanho: o bloco termina na hora dita e começa o tamanho antes', () => {
        const [only] = withCompletion([], fact({ hora: '10:40', lugar: '💻 Computador', bloco_min: 30 }));
        expect(only).toMatchObject({ lugar: '💻 Computador', bloco_min: 30, inicio: '2026-10-19T10:10', fim: '2026-10-19T10:40', medida: 'estimado' });
        expect(only.sem_hora).toBeUndefined();
    });

    it('com o bloco aberto, o lugar dito não troca o do bloco', () => {
        const out = withCompletion([rec()], fact({ lugar: '📱 Celular', bloco_min: 15 }));
        expect(out[0].lugar).toBe(rec().lugar);
    });

    it('o registro só de conclusão não ensina nada nem vira o provável das perguntas', () => {
        const [only] = withCompletion([], fact({ hora: '12:00' }));
        const lugar = rec({ id: 'antes', inicio: '2026-10-19T08:00', fim: '2026-10-19T09:00', saiu: 'concluída', lugar: '📱 Celular', bloco_min: 15 });
        expect(lastChoice([lugar, only])).toEqual({ lugar: '📱 Celular', bloco_min: 15 });
        expect(learnedFit([only], { projeto: 'Vídeos', tags: ['video'], lugar: '🚶 Campo', bloco_min: null })).toBe(false);
    });
});
