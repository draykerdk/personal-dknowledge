import { describe, expect, it } from 'vitest';
import { gravacaoVista, minutosDoAvisoDeSync } from '../../src/engine/avisoDeSync';

/** O aviso de sync ao abrir (a percorrida de 06/11): não avisa do que este aparelho gravou. */
const DAY = '300 - RUNTIME/302 - Daymiss/Day/2026-11-06.md';
const AGORA = 1_000_000_000;
const MIN = 60_000;

describe('o aviso de sync da Day', () => {
    it('a Day que mudou há 3 minutos sem registro deste aparelho avisa; a de 10 minutos não', () => {
        expect(minutosDoAvisoDeSync({ caminho: DAY, mtime: AGORA - 3 * MIN }, AGORA, null)).toBe(3);
        expect(minutosDoAvisoDeSync({ caminho: DAY, mtime: AGORA - 10 * MIN }, AGORA, null)).toBeNull();
    });
    it('o que a Missão (ou este aparelho) gravou não avisa; a mudança depois do registro avisa', () => {
        const vista = { caminho: DAY, mtime: AGORA - 3 * MIN };
        expect(minutosDoAvisoDeSync({ caminho: DAY, mtime: AGORA - 3 * MIN }, AGORA, vista)).toBeNull();
        // O sistema de arquivos arredonda: um segundo de diferença ainda é a mesma gravação.
        expect(minutosDoAvisoDeSync({ caminho: DAY, mtime: AGORA - 3 * MIN + 1000 }, AGORA, vista)).toBeNull();
        expect(minutosDoAvisoDeSync({ caminho: DAY, mtime: AGORA - MIN }, AGORA, vista)).toBe(1);
        // O registro de outra Day não vale para a de hoje.
        expect(minutosDoAvisoDeSync({ caminho: DAY, mtime: AGORA - MIN }, AGORA, { caminho: 'Day/2026-11-05.md', mtime: AGORA })).toBe(1);
    });
    it('o registro guardado se lê com cuidado: o que não tem a forma vale como sem registro', () => {
        expect(gravacaoVista({ caminho: DAY, mtime: 5 })).toEqual({ caminho: DAY, mtime: 5 });
        for (const raw of [null, 'x', [DAY, 5], { caminho: '', mtime: 5 }, { caminho: DAY, mtime: '5' }, { caminho: DAY, mtime: Number.NaN }]) expect(gravacaoVista(raw)).toBeNull();
    });
});
