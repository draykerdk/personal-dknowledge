/**
 * O nome dos protocolos na Missão aberta antes da carga deles (03/11/2026): o lugar se redesenha quando o
 * gerente dos protocolos termina de carregar, para o botão do vazio de uma coluna mostrar o nome, e não o id.
 * Contrato da fonte: o lugar espera a promessa `carregado` do gerente e para de ouvir ao ser destruído.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const fonte = readFileSync(new URL('../../src/missao/hosts/lugar.ts', import.meta.url), 'utf8');

describe('a Missão se redesenha quando os protocolos carregam', () => {
    it('espera o carregado do gerente e só atualiza enquanto o lugar existe', () => {
        expect(fonte).toMatch(/manager\?\.carregado\?\.then\?\.\(\(\) => \{ if \(vivo\) void api\.atualizar\(\); \}\)/);
        expect(fonte).toMatch(/destruir: \(\) => \{\n\s+vivo = false;/);
    });
});
