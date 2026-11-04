/**
 * Bancada DFM — o painel que roda e lê as checagens canônicas do vault
 * (quantas são, quem diz é o runner: `benchSubtitle` lê o cabeçalho dele).
 *
 * Esta superfície existe para substituir um lançador quebrado: o antigo
 * "Diagnóstico & Auditoria" oferecia três botões, e dois deles apontavam para
 * scripts que não auditavam o vault (um não existe; o outro tem o caminho do
 * vault cravado em outro lugar). Aqui há **um** comando — o runner canônico —
 * e ele é fixo: o operador não digita nada e o painel não aceita entrada.
 *
 * Três decisões que valem registrar:
 *
 * 1. **Exit 1 não é erro de execução.** A bancada devolve 1 quando um juiz
 *    falha — isso é *resultado*, e o painel mostra os checks. `state.error`
 *    fica reservado para o que não produziu leitura nenhuma (script ausente,
 *    child_process indisponível, saída irreconhecível).
 * 2. **Mobile vê o botão desabilitado, não a ausência dele.** Esconder o botão
 *    faria o operador concluir que a bancada não existe. O estado é declarado
 *    por escrito: "A bancada roda no desktop".
 * 3. **Nenhuma cor literal.** Tom vem de `applyTone`/`pill`, e o CSS só pinta
 *    `var(--...)`.
 */
import { Platform } from 'obsidian';
import { BENCH_COMMAND, BENCH_EMPTY_TEXT, BenchReport, benchSubtitle, parseBenchReport } from '../../engine/missionBench';
import { MissionPanelContext } from './context';
import { actionButton, applyTone, card, el, emptyState, pill } from './primitives';

/** Estado do painel. Vive na view: sobrevive a toda re-renderização. */
export interface BenchViewState {
    /** Último relatório lido. `null` = a bancada ainda não rodou nesta sessão. */
    report: BenchReport | null;
    /** Comando em execução agora. */
    running: boolean;
    /** Falha que impediu a leitura — nunca uma falha de juiz. */
    error: string | null;
}

export function emptyBenchState(): BenchViewState {
    return { report: null, running: false, error: null };
}

/**
 * Base do vault no disco. `adapter.basePath` existe no desktop; `getBasePath()`
 * é a mesma informação por método. Sem nenhuma das duas, o `exec` roda sem
 * `cwd` — o que falharia visivelmente, não em silêncio.
 */
function vaultBasePath(ctx: MissionPanelContext): string {
    const adapter = ctx.app.vault.adapter as { basePath?: string; getBasePath?: () => string };
    return String(adapter?.basePath ?? adapter?.getBasePath?.() ?? '');
}

/**
 * Mensagem de erro de execução: o erro do `exec`, o que o processo escreveu em
 * stderr e um trecho do que saiu em stdout. Nada é resumido a "falhou".
 */
function describeFailure(error: { message?: string } | null, stderr: string, raw: string): string {
    const parts: string[] = [];
    const message = String(error?.message ?? '').trim();
    const err = stderr.trim();
    if (message) parts.push(message);
    // O `exec` já costuma embutir o stderr na mensagem: não repetir a mesma linha.
    if (err && !message.includes(err)) parts.push(err);
    if (parts.length === 0) parts.push('A bancada não produziu nenhuma checagem legível.');
    const text = parts.join('\n').trim();
    const excerpt = raw.trim().slice(0, 400);
    return excerpt && !text.includes(excerpt) ? `${text}\n${excerpt}` : text;
}

/**
 * Dispara a bancada. Comando fixo, `cwd` no vault, callback único.
 *
 * O callback do `exec` recebe `error` para qualquer exit ≠ 0 — inclusive o 1
 * esperado quando um juiz falha. Por isso a leitura vem primeiro e o erro só é
 * declarado quando não existe relatório.
 */
function runBench(ctx: MissionPanelContext, state: BenchViewState, onChange: () => void): void {
    if (state.running || Platform.isMobile) return;

    state.running = true;
    state.error = null;
    onChange();

    try {
        const { exec } = require('child_process') as typeof import('child_process');
        exec(BENCH_COMMAND, { cwd: vaultBasePath(ctx) }, (error, stdout, stderr) => {
            state.running = false;
            const report = parseBenchReport(String(stdout ?? ''));

            if (report.checks.length === 0) {
                state.report = null;
                state.error = describeFailure(error, String(stderr ?? ''), report.raw || String(stdout ?? ''));
                ctx.notice(`⚠️ Bancada DFM: ${state.error.split('\n')[0]}`);
            } else {
                state.report = report;
                state.error = null;
                ctx.notice(
                    report.ok
                        ? `✅ Bancada DFM: ${report.passed}/${report.checks.length} checks ok`
                        : `⚠️ Bancada DFM: ${report.failed} de ${report.checks.length} juiz(es) falharam`,
                );
            }
            onChange();
        });
    } catch (err) {
        // `require` indisponível (mobile disfarçado, sandbox): o estado é declarado.
        state.running = false;
        state.error = err instanceof Error ? err.message : String(err);
        ctx.notice(`⚠️ Bancada DFM: ${state.error}`);
        onChange();
    }
}

/** Uma linha por check; a saída de detalhe só abre onde o juiz falhou. */
function renderChecks(body: HTMLElement, report: BenchReport): void {
    for (const check of report.checks) {
        const block = el(body, 'div', `mc-bench-check${check.ok ? ' is-ok' : ' is-failed'}`);
        const row = el(block, 'div', 'mc-bench-check-row');

        pill(row, check.ok ? '✅' : '❌', check.ok ? 'green' : 'red');
        el(row, 'span', 'mc-bench-check-label', check.label);

        const meta = el(row, 'span', 'mc-bench-check-meta');
        el(meta, 'span', 'mc-bench-exit', `exit ${check.exitCode}`);
        el(meta, 'span', 'mc-bench-seconds', `${check.seconds.toFixed(2)}s`);
        if (check.advisory) el(meta, 'span', 'mc-bench-advisory', check.advisory);

        // Verde não abre saída: o detalhe interessa onde falhou. Um verde com
        // aviso continua fechado — o aviso já aparece na própria linha.
        if (!check.ok && check.output.length > 0) {
            const details = el(block, 'details', 'mc-bench-output');
            el(details, 'summary', 'mc-bench-output-title', `Saída do juiz · ${check.output.length} linha(s)`);
            el(details, 'pre', 'mc-bench-output-body', check.output.join('\n'));
        }
    }
}

/** Saída que o parser não reconheceu. Se existe, é mostrada — nunca engolida. */
function renderRaw(body: HTMLElement, raw: string): void {
    if (!raw.trim()) return;
    const details = el(body, 'details', 'mc-bench-output is-raw');
    el(details, 'summary', 'mc-bench-output-title', 'Saída não reconhecida pela bancada');
    el(details, 'pre', 'mc-bench-output-body', raw);
}

export function renderBench(
    host: HTMLElement,
    ctx: MissionPanelContext,
    state: BenchViewState,
    onChange: () => void,
): void {
    const bench = card(host, {
        title: 'Bancada DFM',
        icon: 'check-check',
        tone: 'purple',
        badge: state.report ? `${state.report.passed}/${state.report.checks.length}` : undefined,
        subtitle: benchSubtitle(state.report),
    });
    bench.root.addClass('mc-bench');
    if (state.running) bench.root.setAttribute('aria-busy', 'true');

    const controls = el(bench.body, 'div', 'mc-bench-run');
    const button = actionButton(controls, {
        label: 'Rodar bancada',
        icon: 'play',
        tone: 'purple',
        primary: true,
        title: BENCH_COMMAND,
        onClick: () => runBench(ctx, state, onChange),
    }) as HTMLButtonElement;

    if (Platform.isMobile) {
        // Desabilitado e visível: o estado precisa ser lido, não adivinhado.
        button.disabled = true;
        el(controls, 'span', 'mc-bench-status', 'A bancada roda no desktop');
    } else if (state.running) {
        button.disabled = true;
        el(controls, 'span', 'mc-bench-status', 'executando…');
    }

    if (state.error) {
        const box = applyTone(el(bench.body, 'div', 'mc-bench-error'), 'red');
        el(box, 'span', 'mc-bench-error-title', 'A bancada não pôde ser lida');
        el(box, 'pre', 'mc-bench-error-text', state.error);
    }

    if (state.report) {
        renderChecks(bench.body, state.report);
        if (state.report.summary) el(bench.body, 'p', 'mc-bench-summary', state.report.summary);
        renderRaw(bench.body, state.report.raw);
        return;
    }

    if (!state.running && !state.error) {
        emptyState(
            bench.body,
            BENCH_EMPTY_TEXT,
            'check-check',
        ).addClass('mc-bench-empty');
    }
}
