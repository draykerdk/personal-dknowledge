/**
 * Tokens visuais do Mission Control.
 *
 * Regra dura: **nenhuma cor literal**. Todo tom é resolvido em variável nativa
 * do Obsidian (`--color-*`, `--interactive-accent`, `--text-*`), então o console
 * acompanha qualquer tema — Minimal, padrão, claro ou escuro — sem override.
 *
 * A semântica de cor é a mesma do Canvas (README do plugin): verde = concluído,
 * laranja = em execução, roxo = próxima ação, ciano = capturado, vermelho =
 * esperando, amarelo = algum dia. Console e Canvas nunca discordam.
 */
import { MissionHealth } from '../../engine/missionControl';

export type MissionTone = 'accent' | 'green' | 'orange' | 'yellow' | 'cyan' | 'blue' | 'purple' | 'red' | 'muted';

export interface MissionToken {
    tone: MissionTone;
    label: string;
    icon: string;
}

const TONE_VARS: Record<MissionTone, string> = {
    accent: 'var(--interactive-accent)',
    green: 'var(--color-green)',
    orange: 'var(--color-orange)',
    yellow: 'var(--color-yellow)',
    cyan: 'var(--color-cyan)',
    blue: 'var(--color-blue)',
    purple: 'var(--color-purple)',
    red: 'var(--color-red)',
    muted: 'var(--text-faint)',
};

export function toneColor(tone: MissionTone): string {
    return TONE_VARS[tone] ?? TONE_VARS.muted;
}

const STATUS_TOKENS: Record<string, MissionToken> = {
    inbox: { tone: 'cyan', label: 'Inbox', icon: 'inbox' },
    open: { tone: 'cyan', label: 'Aberto', icon: 'circle-dashed' },
    todo: { tone: 'cyan', label: 'A fazer', icon: 'circle' },
    'next-action': { tone: 'purple', label: 'Próxima ação', icon: 'zap' },
    'in-progress': { tone: 'orange', label: 'Em execução', icon: 'activity' },
    'waiting-on': { tone: 'red', label: 'Aguardando', icon: 'hourglass' },
    blocked: { tone: 'red', label: 'Bloqueado', icon: 'octagon-alert' },
    someday: { tone: 'yellow', label: 'Algum dia', icon: 'archive' },
    done: { tone: 'green', label: 'Concluído', icon: 'check-circle-2' },
    completed: { tone: 'green', label: 'Concluído', icon: 'check-circle-2' },
    cancelled: { tone: 'muted', label: 'Cancelado', icon: 'circle-slash' },
};

export function statusToken(status: string): MissionToken {
    const key = String(status ?? '').toLowerCase();
    return STATUS_TOKENS[key] ?? { tone: 'muted', label: key || 'sem status', icon: 'circle-help' };
}

const HEALTH_TOKENS: Record<MissionHealth, MissionToken> = {
    'on-track': { tone: 'green', label: 'Em curso', icon: 'trending-up' },
    'at-risk': { tone: 'orange', label: 'Com bloqueio', icon: 'alert-triangle' },
    overdue: { tone: 'red', label: 'Atrasado', icon: 'alarm-clock' },
    completed: { tone: 'green', label: 'Fechado', icon: 'check-check' },
    'no-data': { tone: 'muted', label: 'Sem dados', icon: 'minus-circle' },
};

export function healthToken(health: MissionHealth): MissionToken {
    return HEALTH_TOKENS[health] ?? HEALTH_TOKENS['no-data'];
}

const TIER_TOKENS: Record<string, MissionToken> = {
    done: { tone: 'green', label: 'Concluído', icon: 'check-circle-2' },
    ativo: { tone: 'yellow', label: 'Ativo', icon: 'circle-dot' },
    locked: { tone: 'muted', label: 'Bloqueado', icon: 'lock' },
};

export function tierToken(status: string): MissionToken {
    return TIER_TOKENS[status] ?? TIER_TOKENS.locked;
}

const SEVERITY_TOKENS: Record<string, MissionToken> = {
    critical: { tone: 'red', label: 'Crítico', icon: 'flame' },
    warning: { tone: 'orange', label: 'Atenção', icon: 'alert-triangle' },
    info: { tone: 'blue', label: 'Info', icon: 'info' },
};

export function severityToken(severity: string): MissionToken {
    return SEVERITY_TOKENS[severity] ?? SEVERITY_TOKENS.info;
}

const PRIORITY_TOKENS: Record<string, MissionToken> = {
    high: { tone: 'red', label: 'Alta', icon: 'chevrons-up' },
    urgent: { tone: 'red', label: 'Urgente', icon: 'chevrons-up' },
    normal: { tone: 'muted', label: 'Normal', icon: 'minus' },
    medium: { tone: 'orange', label: 'Média', icon: 'equal' },
    low: { tone: 'blue', label: 'Baixa', icon: 'chevrons-down' },
};

export function priorityToken(priority: string): MissionToken {
    const key = String(priority ?? '').toLowerCase();
    return PRIORITY_TOKENS[key] ?? { tone: 'muted', label: key || 'normal', icon: 'minus' };
}

/** Impacto estratégico (1–10) vira tom: o alto-impacto domina a hierarquia visual. */
export function impactTone(impact: number | null): MissionTone {
    if (impact === null) return 'muted';
    if (impact >= 9) return 'red';
    if (impact >= 7) return 'orange';
    if (impact >= 4) return 'blue';
    return 'muted';
}
