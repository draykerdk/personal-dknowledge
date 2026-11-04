/**
 * As portas aposentadas (02/11/2026): o id fica, a porta abre a Missão, o painel, ou a Missão na
 * semana ou no trimestre, e não aparece na paleta; o ⌘T dele (`dfm-create-tasknote-canvas`) segue
 * registrado e intocado. Fase 2: os canvas da semana e do trimestre não se criam nem se sincronizam.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { PORTAS_APOSENTADAS, comandoDaPorta, periodoDaPorta, type DestinoDaPorta } from '../../src/ui/portasAposentadas';

const MAIN = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
const BOARD = readFileSync(new URL('../../src/board/boardPlugin.ts', import.meta.url), 'utf8');
const PANEL = readFileSync(new URL('../../src/board/boardPanel.ts', import.meta.url), 'utf8');
const lido = (caminho: string) => readFileSync(new URL(`../../src/${caminho}`, import.meta.url), 'utf8');
const DESTINOS: readonly DestinoDaPorta[] = ['missao', 'painel', 'semana', 'trimestre'];

function destinos() {
    return {
        missao: vi.fn(async () => undefined), painel: vi.fn(async () => undefined),
        semana: vi.fn(async () => undefined), trimestre: vi.fn(async () => undefined),
    } satisfies Record<DestinoDaPorta, () => Promise<void>>;
}

describe('as portas aposentadas', () => {
    it('são as cinco do (a) do inventário e as oito da família da semana e do trimestre, cada id uma vez', () => {
        const ids = PORTAS_APOSENTADAS.map(p => p.id);
        expect(ids).toEqual([
            'open-dfm-dashboard', 'dfm-update-dashboard', 'open-mission-control', 'dfm-console-diagnostico', 'dfm-board-open',
            'dfm-week-canvas-open-current', 'dfm-week-canvas-open-focus', 'dfm-week-canvas-sync', 'dfm-week-focus-open',
            'dfm-quarter-canvas-open', 'dfm-sync-quarterly-canvas', 'open-action-matrix', 'open-planning-timeline',
        ]);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('fase 2: as da semana abrem a semana, as do trimestre o trimestre; a Matriz, a semana; a Linha do Tempo, o trimestre', () => {
        const destino = Object.fromEntries(PORTAS_APOSENTADAS.map(p => [p.id, p.destino]));
        for (const id of ['dfm-week-canvas-open-current', 'dfm-week-canvas-open-focus', 'dfm-week-canvas-sync', 'dfm-week-focus-open', 'open-action-matrix']) expect(destino[id], id).toBe('semana');
        for (const id of ['dfm-quarter-canvas-open', 'dfm-sync-quarterly-canvas', 'open-planning-timeline']) expect(destino[id], id).toBe('trimestre');
    });

    it('a paleta não mostra a porta: checando, responde false e não abre nada', () => {
        const d = destinos();
        for (const porta of PORTAS_APOSENTADAS) {
            const cmd = comandoDaPorta(porta, d, () => undefined);
            expect(cmd.id).toBe(porta.id);
            expect(cmd.checkCallback(true)).toBe(false);
        }
        for (const k of DESTINOS) expect(d[k], k).not.toHaveBeenCalled();
    });

    it('chamada pelo id (um botão, um atalho), abre o destino dela, e só ele', () => {
        for (const porta of PORTAS_APOSENTADAS) {
            const d = destinos();
            expect(comandoDaPorta(porta, d, () => undefined).checkCallback(false)).toBe(true);
            expect(d[porta.destino]).toHaveBeenCalledTimes(1);
            for (const outro of DESTINOS.filter(k => k !== porta.destino)) expect(d[outro], `${porta.id} → ${outro}`).not.toHaveBeenCalled();
        }
    });

    it('o destino que falha vira aviso, não exceção solta', async () => {
        const avisos: string[] = [];
        const d = { ...destinos(), missao: async () => { throw new Error('sem aba'); } };
        comandoDaPorta(PORTAS_APOSENTADAS[0], d, m => avisos.push(m)).checkCallback(false);
        await new Promise(r => setTimeout(r, 0));
        expect(avisos).toEqual(['Não abriu: sem aba']);
    });

    it('o plugin registra as portas pela tabela, e nenhum outro addCommand repete um id dela', () => {
        expect(MAIN).toContain('for (const porta of PORTAS_APOSENTADAS) this.addCommand(comandoDaPorta(porta,');
        for (const porta of PORTAS_APOSENTADAS) {
            expect(MAIN, porta.id).not.toContain(`id: '${porta.id}'`);
            expect(BOARD, porta.id).not.toContain(`id: '${porta.id}'`);
        }
    });

    it('o painel não tem mais o botão do quadro nem o "Abrir painel antigo"', () => {
        expect(PANEL).not.toContain('this.board.openBoard()');
        expect(PANEL).not.toContain('open-mission-control');
    });

    it('o período da porta: o da nota aberta (a Week, a nota do trimestre), senão o de hoje', () => {
        const HOJE = '2026-11-02';
        expect(periodoDaPorta('semana', '2026-W44', HOJE)).toEqual({ escala: 'semana', foco: '2026-W44', selecionado: 'w:2026-W44' });
        expect(periodoDaPorta('trimestre', '2026-Q4', HOJE)).toEqual({ escala: 'trimestre', foco: '2026-Q4', selecionado: 'q:2026-Q4' });
        // A Week aberta numa porta do trimestre: o trimestre da quinta-feira dela (a W13/2027 é do Q2).
        expect(periodoDaPorta('trimestre', '2027-W13', HOJE).foco).toBe('2027-Q2');
        // A nota do trimestre numa porta da semana não diz a semana: a de hoje.
        expect(periodoDaPorta('semana', '2026-Q4', HOJE).foco).toBe('2026-W45');
        // Outra nota, ou nenhuma: o de hoje.
        expect(periodoDaPorta('semana', 'Central de Tarefas', HOJE).foco).toBe('2026-W45');
        expect(periodoDaPorta('trimestre', undefined, HOJE).foco).toBe('2026-Q4');
        expect(periodoDaPorta('trimestre', null, '2027-03-30').foco).toBe('2027-Q2');
    });

    it('fase 2: nada cria nem sincroniza os canvas da semana e do trimestre', () => {
        // Os gerentes não se registram: sem comandos, sem sincronizar ao abrir, na Day ou quando uma nota muda,
        // sem o gancho do fim do 🌳 e do 🧭, sem o menu do clique-direito e sem as setas que gravam neles.
        expect(MAIN).not.toMatch(/quarterCanvas\.register\(\)|weekCanvas\.register\(\)/);
        // Quem os abria ou criava pela tela: o painel, o menu da tarefa, a barra do canvas, a subida fractal,
        // a Missão (o "Criar o canvas" do nó) e o cabeçalho do canvas de projeto.
        for (const arquivo of ['board/boardPanel.ts', 'board/taskMenus.ts', 'board/canvasToolbar.ts', 'board/boardPlugin.ts', 'main.ts', 'project/projectCanvasManager.ts', 'engine/canvasengine/canvasEngine.ts']) {
            const fonte = lido(arquivo);
            expect(fonte, arquivo).not.toMatch(/(quarterCanvas|weekCanvas)\??!?\.(open|sync|openFocusWeek|focusWeek|canvasPath|quarterNote|weekNotePath)\(/);
            expect(fonte, arquivo).not.toMatch(/\b(qc|qcm|wcm)\??\.(open|sync|openFocusWeek)\(/);
        }
    });

    it('o ⌘T (dfm-create-tasknote-canvas) fica registrado, fora das portas', () => {
        expect(MAIN).toContain("id: 'dfm-create-tasknote-canvas'");
        expect(PORTAS_APOSENTADAS.map(p => p.id)).not.toContain('dfm-create-tasknote-canvas');
    });
});
