/**
 * Os layouts antigos do painel, só como dado de teste: o de partida das 11 páginas (o que
 * `defaultPanelLayout` devolvia até 30/10/2026) e o layout do dono gravado no commit
 * `0827bbee` (29/10), o das cinco páginas aprovadas.
 *
 * Por quê: as migrações (as semeadas, o Recolher, o agrupamento em cinco) continuam
 * precisando provar que pegam o layout de quem ainda tem as 11 páginas; o código não guarda
 * mais esse layout, porque restaurar não pode trazer as páginas aposentadas de volta.
 */
import { missaoPage, protocolsPage, type CardSource, type PanelCard, type PanelLayoutState } from '../../src/board/panelLayout';

const legacy = (id: string, w: number, h: number | null = null): PanelCard => ({ id: `p-${id}`, source: { kind: 'painel', id }, w, h });
const widget = (id: string, spec: Extract<CardSource, { kind: 'widget' }>['spec'], w: number, h: number | null = null): PanelCard => ({ id: `w-${id}`, source: { kind: 'widget', spec }, w, h });

/** O layout de partida das 11 páginas do console antigo (até 30/10/2026). */
export function layoutDeOnze(): PanelLayoutState {
    return {
        version: 1,
        navCollapsed: false,
        activePage: 'missao',
        pages: [
            missaoPage(),
            {
                id: 'inicio', label: 'Início', icon: 'home', cards: [
                    widget('numeros', { kind: 'numeros' }, 12),
                    legacy('capture', 6),
                    // `agora` e `semana` saíram dos tipos de widget em 03/11/2026 (o quadro aposentado); o layout
                    // antigo ainda os tem, e as migrações precisam pegá-los.
                    widget('agora', { kind: 'agora', limite: 6 } as any, 6),
                    widget('semana', { kind: 'semana' } as any, 8),
                    widget('vencidas', { kind: 'tarefas', filtro: 'vencidas', limite: 6 }, 4),
                    widget('projetos', { kind: 'projetos' }, 6),
                    widget('habitos', { kind: 'habitos' }, 6),
                ],
            },
            { id: 'hoje', label: 'Hoje', icon: 'target', cards: [legacy('noteFactory', 8), legacy('pressure', 4), legacy('intent', 8), legacy('drift', 4), legacy('day', 8), legacy('inbox', 4), legacy('planPressure', 8), legacy('triage', 4)] },
            { id: 'plano', label: 'Plano', icon: 'calendar-range', cards: [legacy('plan', 8), legacy('matrix', 4), legacy('timeline', 6), legacy('radar', 6)] },
            { id: 'rotinas', label: 'Rotinas', icon: 'flame', cards: [widget('habitos', { kind: 'habitos', limite: 20, dias: 14 }, 12), legacy('habits', 12)] },
            { id: 'executar', label: 'Executar', icon: 'zap', cards: [legacy('funnel', 8), legacy('week', 6), legacy('waiting', 6)] },
            protocolsPage(),
            { id: 'mapa', label: 'Mapa', icon: 'git-fork', cards: [legacy('mapModes', 12), legacy('missionGraph', 12), legacy('map', 12)] },
            { id: 'projetos', label: 'Projetos', icon: 'folder-kanban', cards: [legacy('portfolioBoard', 12), legacy('kanban', 12), legacy('portfolioActions', 8), legacy('portfolioCompliance', 4), legacy('projects', 6), legacy('trees', 6), legacy('areas', 12)] },
            { id: 'ferramentas', label: 'Ferramentas', icon: 'wrench', cards: [legacy('canvasTools', 8), legacy('canvases', 4)] },
            { id: 'sistema', label: 'Sistema', icon: 'cpu', cards: [legacy('operatorCard', 4), legacy('quarter', 8), legacy('bench', 8), legacy('integrity', 4)] },
        ],
    };
}

/** O `boardPanelLayout` do `data.json` no commit `0827bbee` (29/10), byte a byte nos dados. */
export function layoutDasCincoDe0827(): PanelLayoutState {
    const w = (id: string, kind: string, largura: number): PanelCard => ({ id, source: { kind: 'widget', spec: { kind } as any }, w: largura, h: null });
    const v = (id: string, largura: number): PanelCard => ({ id: `p-${id}`, source: { kind: 'painel', id }, w: largura, h: null });
    return {
        version: 1, navCollapsed: false, activePage: 'missao',
        pages: [
            { id: 'missao', label: 'Missão', icon: 'compass', tela: 'missao', cards: [] },
            { id: 'projetos', label: 'Projetos', icon: 'folder-kanban', cards: [
                w('w-projetos', 'projetos', 6), v('portfolioBoard', 12), v('trees', 6), v('areas', 12), v('portfolioActions', 8),
                v('kanban', 12), v('projects', 6), v('portfolioCompliance', 4),
            ] },
            { id: 'analise', label: 'Análise', icon: 'bar-chart-3', cards: [
                w('w-numeros', 'numeros', 12), w('w-habitos', 'habitos', 6), v('funnel', 8), v('matrix', 4), v('habits', 12), v('waiting', 6),
            ] },
            { id: 'protocolos', label: 'Protocolos', icon: 'workflow', cards: [
                w('w-pr-saude', 'protocolos-saude', 12), w('w-pr-avisos', 'protocolos-avisos', 4), w('w-pr-mapa', 'protocolos-mapa', 8),
                w('w-pr-catalogo', 'protocolos-catalogo', 8), w('w-pr-ferramentas', 'protocolos-ferramentas', 6), w('w-pr-uso', 'protocolos-uso', 4),
                w('w-pr-versoes', 'protocolos-versoes', 6),
            ] },
            { id: 'sistema', label: 'Sistema', icon: 'cpu', cards: [
                v('canvases', 4), v('canvasTools', 8), v('vitals', 8), v('operatorCard', 4), v('bench', 8), v('integrity', 4),
            ] },
        ],
    };
}
