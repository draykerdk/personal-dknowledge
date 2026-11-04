/** Modelos prontos de consulta — o que mais se pergunta a um canvas. Dado puro. */
import type { BoardWidgetSpec } from './boardSpec';

type Spec = Partial<BoardWidgetSpec> & { kind: BoardWidgetSpec['kind'] };

export const QUERY_PRESETS: Array<{ label: string; icon: string; spec: Spec; size: { width: number; height: number } }> = [
    { label: 'Progresso deste canvas', icon: 'pie-chart', spec: { kind: 'consulta', titulo: 'Progresso deste canvas', escopo: 'canvas', mostrar: 'progresso', limite: 5 }, size: { width: 440, height: 300 } },
    { label: 'Kanban deste canvas', icon: 'columns-3', spec: { kind: 'consulta', titulo: 'Kanban deste canvas', escopo: 'canvas', mostrar: 'kanban', status: 'abertas', limite: 6 }, size: { width: 860, height: 420 } },
    { label: 'Próximas ações deste canvas', icon: 'zap', spec: { kind: 'consulta', titulo: 'Próximas ações', escopo: 'canvas', tarefas: 'acoes', status: 'next-action,in-progress', limite: 8 }, size: { width: 440, height: 360 } },
    { label: 'Vencidas deste canvas', icon: 'alarm-clock', spec: { kind: 'consulta', titulo: 'Vencidas', escopo: 'canvas', prazo: 'vencidas', limite: 8 }, size: { width: 420, height: 300 } },
    { label: 'Tarefas da semana neste canvas', icon: 'calendar-days', spec: { kind: 'consulta', titulo: 'Semana', escopo: 'canvas', semana: 'atual', mostrar: 'grupos', agrupar: 'status', limite: 6 }, size: { width: 460, height: 420 } },
    { label: 'Contagem por status deste canvas', icon: 'hash', spec: { kind: 'consulta', titulo: 'Neste canvas', escopo: 'canvas', mostrar: 'contagem', status: 'todas' }, size: { width: 560, height: 180 } },
];
