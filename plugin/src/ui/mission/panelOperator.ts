/**
 * Painel do operador — integração com o DSH.
 *
 * O painel mostra o que é verificável, não o que se espera: estado real da
 * ponte 3082, o sinal de contexto com a idade dele, o journal de auditoria e a
 * allowlist de protocolos que o gateway realmente pode iniciar. Quando a ponte
 * está offline a tela diz offline — nunca um "ok" decorativo.
 *
 * A invocação de skill/protocolo é **proposta, não despachada**: o console monta
 * o texto canônico e abre uma confirmação para o humano decidir. Nada é enviado
 * ao agente sem um gesto explícito.
 */
import { actionButton, card, el, icon, kv, pill, emptyState, rowLink } from './primitives';
import { MissionPanelContext, formatAge, formatTimestamp, truncate } from './context';
import { MissionOperator, MissionProtocol } from '../../engine/missionControl';

export function renderOperatorCard(host: HTMLElement, ctx: MissionPanelContext): void {
    const operator = ctx.snapshot.operator;
    const online = !!operator.bridge;
    const node = card(host, {
        title: 'Operador DSH',
        icon: 'bot',
        tone: online ? 'green' : 'muted',
        subtitle: online ? `ponte ativa na porta ${operator.bridge?.port}` : 'ponte operacional offline',
        badge: online ? 'online' : 'offline',
        wide: true,
    });

    const head = el(node.header, 'div', 'mc-card-actions');
    pill(head, online ? 'Ponte ativa' : 'Ponte offline', online ? 'green' : 'muted', online ? 'plug-zap' : 'plug');
    actionButton(head, {
        label: 'Abrir DSH',
        icon: 'bot',
        tone: 'accent',
        primary: true,
        onClick: () => ctx.executeCommand('open-dsh'),
    });
    actionButton(head, {
        label: 'Atualizar',
        icon: 'refresh-cw',
        tone: 'accent',
        onClick: () => void ctx.refresh(true),
    });

    if (!online) {
        emptyState(node.body,
            'A ponte HTTP do DSH só existe no Obsidian Desktop com o plugin carregado. No mobile o console continua lendo o vault — apenas o gateway fica indisponível.',
            'plug');
    } else {
        const rows = el(node.body, 'div', 'mc-rows');
        kv(rows, 'Porta', String(operator.bridge?.port ?? '—'), { tone: 'green', icon: 'radio' });
        kv(rows, 'Vault da ponte', operator.bridge?.vault ?? '—', { icon: 'vault' });
        kv(rows, 'Versão do plugin', operator.bridge?.version ?? '—', { icon: 'git-commit' });
        kv(rows, 'Iniciada em', formatTimestamp(operator.bridge?.startedAt ?? ''), { icon: 'play' });
        if (operator.health) {
            kv(rows, 'Integridade',
                operator.health.ok
                    ? `ok · TaskNotes ${operator.health.taskNotesVersion ?? '—'} · ${operator.health.capabilities.length} capabilities`
                    : `falha: ${operator.health.error}`,
                { tone: operator.health.ok ? 'green' : 'red', icon: 'shield-check' });
        }
    }

    const signal = operator.signal;
    const signalBox = el(node.body, 'div', 'mc-signal');
    icon(signalBox, 'file-text', 'mc-signal-icon');
    const signalText = el(signalBox, 'div', 'mc-signal-text');
    if (signal) {
        const age = operator.signalAgeMinutes ?? 999;
        el(signalText, 'span', 'mc-signal-label', 'Nota em foco');
        el(signalText, 'span', 'mc-signal-value', truncate(signal.title || signal.path, 80));
        const ageRow = el(signalBox, 'div', 'mc-signal-age');
        pill(ageRow, formatAge(operator.signalAgeMinutes), age <= 15 ? 'green' : 'yellow', age <= 15 ? 'activity' : 'hourglass');
        rowLink(ageRow, {
            classes: ['mc-signal-open'],
            onClick: () => void ctx.openPath(signal.path),
        }).setText('abrir');
    } else {
        el(signalText, 'span', 'mc-signal-label', 'Nota em foco');
        el(signalText, 'span', 'mc-signal-value', 'nenhum sinal registrado');
    }

    renderSkills(node.body, ctx);
    renderAllowlist(node.body, ctx);
    renderJournal(node.body, operator);
}

function renderSkills(parent: HTMLElement, ctx: MissionPanelContext): void {
    const skills = ctx.snapshot.operator.skills;
    el(parent, 'h4', 'mc-subhead', 'Skills DFM invocáveis');
    if (skills.length === 0) {
        emptyState(parent, 'Catálogo de skills vazio.');
        return;
    }
    const strip = el(parent, 'div', 'mc-chipstrip');
    const primaries = skills.filter(skill => skill.primary);
    const others = skills.filter(skill => !skill.primary);

    for (const skill of primaries) {
        const chip = rowLink(strip, {
            classes: ['mc-chip', 'is-primary'],
            onClick: () => void ctx.invokeDsh({ kind: 'skill', id: skill.id }),
            title: skill.description,
        });
        pill(chip, skill.label, 'accent', 'sparkles');
    }
    for (const skill of others) {
        const chip = rowLink(strip, {
            classes: ['mc-chip'],
            onClick: () => void ctx.invokeDsh({ kind: 'skill', id: skill.id }),
            title: skill.description,
        });
        pill(chip, skill.label, 'muted', 'circle');
    }

    const footer = el(parent, 'div', 'mc-note');
    icon(footer, 'info', 'mc-note-icon');
    el(footer, 'span', 'mc-note-text', 'Clique prepara a invocação canônica para confirmação — o console nunca despacha trabalho ao agente sozinho.');
}

function renderAllowlist(parent: HTMLElement, ctx: MissionPanelContext): void {
    const allowlist = ctx.snapshot.operator.allowlist ?? [];
    el(parent, 'h4', 'mc-subhead', `Protocolos que o DSH pode iniciar · ${allowlist.length}`);
    if (allowlist.length === 0) {
        emptyState(parent, 'Nenhum protocolo na allowlist do gateway.');
        return;
    }
    const strip = el(parent, 'div', 'mc-chipstrip');
    for (const id of allowlist) {
        const chip = rowLink(strip, {
            classes: ['mc-chip'],
            onClick: () => void ctx.runProtocol(id),
            title: `Iniciar ${id} no Obsidian (fluxo interativo do humano)`,
        });
        pill(chip, id, 'purple', 'play');
    }
}

function renderJournal(parent: HTMLElement, operator: MissionOperator): void {
    el(parent, 'h4', 'mc-subhead', 'Journal da ponte');
    if (operator.audit.length === 0) {
        emptyState(parent, 'Nenhuma entrada no journal — nenhuma operação falhou ou o journal ainda não foi criado.', 'scroll-text');
        return;
    }
    const rows = el(parent, 'div', 'mc-rows');
    for (const entry of operator.audit) {
        const row = el(rows, 'div', 'mc-journal');
        pill(row, entry.ok ? 'ok' : entry.errorCode ?? 'erro', entry.ok ? 'green' : 'red', entry.ok ? 'check' : 'x');
        el(row, 'span', 'mc-journal-action', entry.action);
        el(row, 'span', 'mc-journal-target', truncate(entry.target, 48));
        el(row, 'span', 'mc-journal-ts', formatTimestamp(entry.ts));
    }
}

export function renderProtocols(host: HTMLElement, ctx: MissionPanelContext): void {
    const protocols = ctx.snapshot.protocols;
    const node = card(host, {
        title: 'Protocolos DFM',
        icon: 'workflow',
        tone: 'purple',
        subtitle: 'catálogo carregado do vault',
        badge: `${protocols.length}`,
        wide: true,
    });

    if (protocols.length === 0) {
        emptyState(node.body, 'Nenhum protocolo JSON carregado.', 'workflow');
        return;
    }

    const search = node.body.createEl('input', { type: 'text' });
    search.className = 'mc-search';
    search.placeholder = 'filtrar por nome, id ou grupo…';
    search.setAttribute('aria-label', 'Filtrar protocolos');

    const groups = new Map<string, MissionProtocol[]>();
    for (const protocol of protocols) {
        const list = groups.get(protocol.group) ?? [];
        list.push(protocol);
        groups.set(protocol.group, list);
    }

    const list = el(node.body, 'div', 'mc-protocol-list');
    const rows: Array<{ node: HTMLElement; haystack: string }> = [];

    for (const [group, items] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        el(list, 'h4', 'mc-subhead', group);
        for (const protocol of items) {
            const row = rowLink(list, {
                classes: ['mc-protocol'],
                onClick: () => void ctx.runProtocol(protocol.id),
                title: `Iniciar ${protocol.id}`,
            });
            icon(row, protocol.icon || 'star', 'mc-row-icon');
            const body = el(row, 'div', 'mc-task-body');
            el(body, 'span', 'mc-task-title', protocol.name);
            const meta = el(body, 'div', 'mc-task-meta');
            el(meta, 'span', 'mc-task-project', protocol.id);
            if (protocol.dshEnabled) el(meta, 'span', 'mc-task-week', 'DSH');
            rows.push({ node: row, haystack: `${protocol.name} ${protocol.id} ${group}`.toLowerCase() });
        }
    }

    const empty = el(list, 'p', 'mc-hint', 'nenhum protocolo corresponde ao filtro');
    empty.style.display = 'none';

    search.addEventListener('input', () => {
        const query = search.value.trim().toLowerCase();
        let visible = 0;
        for (const row of rows) {
            const match = !query || row.haystack.includes(query);
            row.node.style.display = match ? '' : 'none';
            if (match) visible += 1;
        }
        empty.style.display = visible === 0 ? '' : 'none';
    });
}

export function renderIntegrity(host: HTMLElement, ctx: MissionPanelContext): void {
    const notes = ctx.snapshot.notes;
    const node = card(host, {
        title: 'Integridade do console',
        icon: 'shield-alert',
        tone: notes.length > 0 ? 'yellow' : 'green',
        subtitle: 'o que o snapshot não conseguiu sustentar',
        badge: notes.length > 0 ? `${notes.length} aviso(s)` : 'limpo',
    });

    if (notes.length === 0) {
        emptyState(node.body, 'Todos os motores responderam e todos os campos lidos existem.', 'check-circle-2');
    } else {
        for (const note of notes) {
            const row = el(node.body, 'div', 'mc-warning');
            icon(row, 'alert-triangle', 'mc-warning-icon');
            el(row, 'span', 'mc-warning-text', note);
        }
    }

    const rows = el(node.body, 'div', 'mc-rows');
    kv(rows, 'Snapshot gerado', formatTimestamp(ctx.snapshot.generatedAt), { icon: 'clock' });
    kv(rows, 'Vault', ctx.snapshot.vaultName, { icon: 'vault' });
    kv(rows, 'Plugin', ctx.snapshot.pluginVersion, { icon: 'package' });
    kv(rows, 'Notas', String(ctx.app.vault.getMarkdownFiles().length), { icon: 'files' });
}
