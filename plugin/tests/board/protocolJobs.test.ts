import { describe, expect, it } from 'vitest';
import { BENCH_SCRIPT, ROUTER_MAP_SCRIPT, benchJob, mapJob, scriptCommand } from '../../src/board/protocolJobs';

/**
 * Os scripts da página "Protocolos" (26/10/2026): comando fixo com o Python 3.11 do
 * usuário (o python3 do sistema, 3.9, abre a janela de crash) e a leitura da saída.
 */
describe('o comando', () => {
    it('roda o script do vault com o Python 3.11 e -B, nunca o python3 do sistema', () => {
        for (const script of [BENCH_SCRIPT, ROUTER_MAP_SCRIPT]) {
            const cmd = scriptCommand(script);
            expect(cmd).toBe(`"$HOME/.local/bin/python3.11" -B "${script}"`);
            expect(cmd).not.toMatch(/(^|\s)python3(\s|$)/);
        }
    });
});

describe('a bancada', () => {
    const clean = 'Bancada DFM · 2 checks somente leitura\n\n✅ Protocolos · grafo · exit 0 · 0.31s\n✅ Canvas · exit 0 · 0.20s\n\n✅ Bancada limpa · 0.98s\n';
    const failing = 'Bancada DFM · 2 checks somente leitura\n\n✅ Protocolos · grafo · exit 0 · 0.31s\n❌ Canvas · exit 1 · 0.20s\n    [LINK QUEBRADO] x.canvas\n\n❌ 1 juiz(es) falharam · 0.98s\n';
    it('limpa: a linha do resultado com o número que o runner declarou', () => {
        expect(benchJob(clean, '', null)).toEqual({ running: false, summary: '✅ Bancada limpa: 2 checagens', ok: true, detail: [] });
    });
    it('exit 1 com juízes lidos é resultado: diz quem falhou e o detalhe', () => {
        const job = benchJob(failing, '', 'Command failed: exit 1');
        expect(job).toMatchObject({ ok: false, summary: '❌ 1 de 2 juízes falharam' });
        expect(job.detail).toEqual(['❌ Canvas', '    [LINK QUEBRADO] x.canvas']);
    });
    it('saída vazia nunca vira limpa', () => {
        expect(benchJob('', 'python3.11: not found', 'Command failed')).toMatchObject({ ok: false, summary: 'A bancada não pôde ser lida.' });
    });
});

describe('o mapa do 🧭', () => {
    it('a linha ✅ do script é o resultado; erro mostra o que ele escreveu', () => {
        expect(mapJob('✅ Mapa gerado: 000 - KERNEL/x.canvas (3 perguntas · 4 protocolos · 9 setas)\n', '', null)).toMatchObject({ ok: true, summary: '✅ Mapa gerado: 000 - KERNEL/x.canvas (3 perguntas · 4 protocolos · 9 setas)' });
        expect(mapJob('❌ Protocolos ilegíveis ou sem router_central: []\n', '', 'Command failed')).toMatchObject({ ok: false, summary: '❌ Protocolos ilegíveis ou sem router_central: []' });
        expect(mapJob('', 'Traceback', 'Command failed')).toMatchObject({ ok: false, summary: 'O mapa não foi gerado.' });
    });
});
