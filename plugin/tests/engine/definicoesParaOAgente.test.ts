/**
 * As definições para o agente (05/11, o Dk pessoal): a forma curta das definições que o plugin usa, de cópias,
 * com os protocolos só dos papéis que têm um e, dos pesos, só as categorias ajustadas.
 */
import { describe, expect, it } from 'vitest';
import { DEFINICOES_PADRAO, lerDefinicoes } from '../../src/definicoes';
import { definicoesParaOAgente } from '../../src/engine/definicoesParaOAgente';

describe('as definições para o agente', () => {
    it('os padrões: nada da pessoa, os protocolos do ciclo, o resto pelo nome do papel', () => {
        const r: any = definicoesParaOAgente(lerDefinicoes({}), { fusoEfetivo: 'UTC', salvo: false });
        expect(r.pessoa).toEqual({ nome: '', fuso_horario: '', fuso_efetivo: 'UTC' });
        expect(r.valores).toEqual([]);
        expect(r.protocolos_por_papel).toEqual({ planejar_semana: 'planejamento_semanal', revisar_semana: 'review_semanal', planejar_trimestre: 'planejamento_trimestral', inicializar: 'inicializacao' });
        expect(r.papeis_sem_protocolo).toContain('fechar_dia');
        expect(r.pastas.protocolos).toBe(DEFINICOES_PADRAO.pastas.protocolos);
        expect(r.fonte).toMatch(/não tem o bloco/);
    });

    it('a camada de partida e o bloco salvo valem; os pesos vêm só pelo nome da categoria', () => {
        const d = lerDefinicoes({ definicoes: { pesos: { ajustes: { prazo: 2, _nota: 'x', foco: { peso: 1 } } }, trimestre: { foco: ['Renda'] } } }, [{ areas: [{ nome: 'A', pasta: '01 - A', etiqueta: '#a' }] }]);
        const r: any = definicoesParaOAgente(d, { fusoEfetivo: 'America/Sao_Paulo', salvo: true });
        expect(r.areas).toEqual([{ nome: 'A', pasta: '01 - A', etiqueta: '#a' }]);
        expect(r.trimestre.foco).toEqual(['Renda']);
        expect(r.pesos).toEqual({ categorias_ajustadas: ['prazo', 'foco'] });
        expect(r.salvo).toBe(true);
    });

    it('o resultado é de cópias: mudar não muda as definições', () => {
        const d = lerDefinicoes({}, [{ valores: [{ nome: 'Valor A', porque: '' }] }]);
        const r: any = definicoesParaOAgente(d, { fusoEfetivo: 'UTC', salvo: false });
        r.valores[0].nome = 'outro';
        r.pastas.excluidas.push('x');
        expect(d.valores[0].nome).toBe('Valor A');
        expect(d.pastas.excluidas).not.toContain('x');
    });
});
