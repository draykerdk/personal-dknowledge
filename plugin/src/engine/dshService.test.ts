import { describe, expect, it } from 'vitest';
import { parseDshControllerOutput } from './dshService';

describe('parseDshControllerOutput', () => {
    it('le o estado JSON do controlador', () => {
        expect(parseDshControllerOutput('{"running":true,"managed":true,"url":"http://127.0.0.1:3080"}\n')).toEqual({
            running: true,
            managed: true,
            url: 'http://127.0.0.1:3080'
        });
    });

    it('tolera uma linha de diagnostico antes do JSON', () => {
        const output = 'aviso local\n{"running":false,"managed":false}\n';
        expect(parseDshControllerOutput(output).running).toBe(false);
    });

    it('recusa saida sem estado valido', () => {
        expect(() => parseDshControllerOutput('DSH indisponivel')).toThrow(/JSON válido/);
    });
});
