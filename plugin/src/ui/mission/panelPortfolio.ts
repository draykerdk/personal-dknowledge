/**
 * Portfólio — quadro, movimentação e conformidade dos projetos.
 *
 * Esta é a superfície que o Control Center antigo tinha e o console novo perdeu:
 * o kanban de projetos por fase do ciclo de vida. Ela volta com três diferenças
 * que são o ponto do trabalho:
 *
 * 1. **O quadro não arrasta.** O legado movia a pasta com `fileManager.renameFile`
 *    e deixava os `.canvas` apontando para o caminho antigo — nó de arquivo
 *    guarda caminho COMPLETO, e a regra da casa proíbe. Aqui a leitura é
 *    read-only e a movimentação é o script do vault, que move a pasta, grava o
 *    frontmatter E reescreve os canvas.
 * 2. **Dry-run primeiro, sempre.** O botão de aplicar só habilita depois que o
 *    dry-run rodou para a seleção atual e a saída está na tela. O script já
 *    recusa sozinho (exit 1) quando o projeto não tem nota-índice; a tela mostra
 *    a recusa em vez de escondê-la atrás de um "falhou".
 * 3. **Ausência não vira zero.** Projeto sem tarefa registrada diz "sem tarefa
 *    registrada" — nunca `0/0`, nunca barra de progresso vazia. O mesmo vale para
 *    o canvas: projeto que existe sem desenho diz "sem canvas no projeto".
 *
 * O **canvas do projeto** não é mais derivado aqui por concatenação de caminho.
 * Ele vem de `missionCanvasIndex`, que é a casa da convenção — este painel era um
 * dos lugares que repetiam a regra por conta própria, e duas cópias da mesma
 * regra divergem na primeira exceção. Do modelo vêm o caminho, o tamanho
 * (`nodes`/`edges`) e o dono; o `mtime` continua no snapshot, porque o índice
 * publica a LIGAÇÃO e não os metadados do arquivo.
 *
 * Nenhuma cor literal: o tom vem de `pill`/`applyTone` e o CSS só pinta `var(--…)`.
 */
import { Platform } from 'obsidian';
import { PortfolioProject, STAGE, stageLabel } from '../../engine/missionPortfolio';
import { CanvasIndexEntry, canvasIndexOf, projectCanvasFor } from '../../engine/missionCanvasIndex';
import { MissionPanelContext, vaultBasePath } from './context';
import { actionButton, applyTone, card, el, emptyState, icon, pill, rowLink } from './primitives';

/* ==========================================================================
   Comandos sancionados
   ========================================================================== */

/** Comando canônico da movimentação. Fixo: o operador não digita nada. */
export const ACTIVATE_COMMAND = 'python3 "200 - FUNCTIONS/Scripts/activate_project.py"';

/** Comando canônico do juiz de projetos (o mesmo que a bancada roda por dentro). */
export const VALIDATE_PROJECTS_COMMAND = 'python3 "200 - FUNCTIONS/Scripts/validate_projects.py"';

export type PortfolioMoveMode = 'activate' | 'wait' | 'backlog';

/**
 * Modos do script. O rótulo diz o DESTINO antes do clique — mover pasta não é
 * uma ação autoexplicativa, e o operador precisa saber para onde o projeto vai
 * sem abrir o script.
 */
export const PORTFOLIO_MOVE_MODES: ReadonlyArray<{ id: PortfolioMoveMode; label: string; column: string; hint: string }> = [
    { id: 'activate', label: 'Ativar', column: STAGE.active, hint: 'grava status: active e o quarter de foco (D2: quarter = trimestre de foco)' },
    { id: 'wait', label: 'Pausar', column: STAGE.waiting, hint: 'grava status: waiting e limpa o quarter de foco' },
    { id: 'backlog', label: 'Devolver', column: STAGE.backlog, hint: 'grava status: backlog e limpa o quarter de foco' },
];

/**
 * Aspas duplas em volta do nome, ou `null` quando não dá para escapar.
 *
 * A recusa é deliberada: `"`, `'`, `$`, crase, `\` e quebra de linha são
 * justamente o que o shell interpreta, e o script procura o projeto por
 * igualdade (depois por substring) sem escapar nada. Um nome que precisa de
 * escape é um nome que ele não vai encontrar de qualquer forma — recusar em voz
 * alta é mais honesto do que montar um comando que falha por outro motivo.
 */
export function safeProjectName(name: string): string | null {
    const value = String(name ?? '').trim();
    if (!value) return null;
    if (/["'`$\\\r\n]/.test(value)) return null;
    return `"${value}"`;
}

/**
 * Comando do movimento: **fixo + nome escapado + modo**, nunca entrada livre de
 * shell. `null` quando o nome não é seguro — e aí nada é executado.
 */
export function moveCommand(name: string, mode: PortfolioMoveMode, apply: boolean): string | null {
    const quoted = safeProjectName(name);
    if (!quoted) return null;
    return `${ACTIVATE_COMMAND} ${quoted} ${mode}${apply ? ' --apply' : ''}`;
}

/* ==========================================================================
   Estado
   ========================================================================== */

/** Última execução exibida no painel. */
export interface PortfolioRun {
    /** `projeto|modo` a que esta saída pertence: trocar a seleção invalida o apply. */
    key: string;
    /** `exit 0`. A recusa do script (exit 1) não é erro de execução — é resultado. */
    ok: boolean;
    exitCode: number | null;
    output: string;
    /** Já rodou com `--apply`: o mesmo botão não repete o movimento. */
    applied: boolean;
}

export interface PortfolioValidationState {
    running: boolean;
    exitCode: number | null;
    output: string;
    /** Falha que impediu LEITURA (sem `child_process`, sem saída). Nunca um juiz vermelho. */
    error: string | null;
}

/** Estado do painel. Vive na view: sobrevive a toda re-renderização. */
export interface PortfolioViewState {
    /** Projeto escolhido no seletor — a re-renderização não pode perder a escolha. */
    project: string;
    mode: PortfolioMoveMode;
    running: boolean;
    /** Falha de execução da movimentação; a recusa do script vive em `last`. */
    error: string | null;
    last: PortfolioRun | null;
    validation: PortfolioValidationState;
}

export function emptyPortfolioState(): PortfolioViewState {
    return {
        project: '',
        mode: 'activate',
        running: false,
        error: null,
        last: null,
        validation: { running: false, exitCode: null, output: '', error: null },
    };
}

/* ==========================================================================
   Execução — o mesmo padrão da bancada
   ========================================================================== */

/**
 * Exit code do `exec`: `error.code` é número quando o processo rodou e saiu ≠ 0,
 * e string quando nem subiu (`ENOENT`). Os dois casos não podem virar a mesma
 * coisa: o primeiro é resposta do script, o segundo é falha de execução.
 */
function exitCodeOf(error: unknown): number | null {
    if (!error) return 0;
    const code = (error as { code?: unknown }).code;
    return typeof code === 'number' ? code : null;
}

/** O erro do `exec` com o stderr anexado quando ele não veio embutido. */
function describeFailure(error: { message?: string } | null, stderr: string): string {
    const message = String(error?.message ?? '').trim();
    const err = stderr.trim();
    if (!message) return err || 'O script não produziu saída nenhuma.';
    if (err && !message.includes(err)) return `${message}\n${err}`;
    return message;
}

function plural(count: number, singular: string, pluralForm: string): string {
    return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * Dispara `activate_project.py`. Comando fixo, `cwd` no vault, callback único.
 *
 * O callback recebe `error` para qualquer exit ≠ 0 — inclusive o 1 que o script
 * usa para RECUSAR (projeto inexistente, nome ambíguo, pasta sem nota-índice).
 * Por isso a leitura vem primeiro e o erro de execução só é declarado quando não
 * existe saída nenhuma.
 */
function runMove(
    ctx: MissionPanelContext,
    state: PortfolioViewState,
    mode: PortfolioMoveMode,
    apply: boolean,
    onChange: () => void,
): void {
    if (state.running || Platform.isMobile) return;
    const command = moveCommand(state.project, mode, apply);
    if (!command) {
        state.error = `Nome de projeto com caractere que o shell não recebe com segurança: ${state.project || '(vazio)'}. Nada foi executado.`;
        ctx.notice('⚠️ Movimentação recusada: nome inseguro para o shell.', 8000);
        onChange();
        return;
    }

    const key = `${state.project}|${mode}`;
    state.running = true;
    state.error = null;
    onChange();

    try {
        const { exec } = require('child_process') as typeof import('child_process');
        exec(command, { cwd: vaultBasePath(ctx) }, (error, stdout, stderr) => {
            state.running = false;
            const output = String(stdout ?? '').trim();
            const exitCode = exitCodeOf(error);

            if (!output) {
                // Sem saída não há leitura: aqui é falha de execução (script
                // ausente, `python3` fora do PATH, `cwd` errado).
                state.error = describeFailure(error, String(stderr ?? ''));
                state.last = null;
                ctx.notice(`⚠️ Movimentação: ${state.error.split('\n')[0]}`, 8000);
            } else {
                state.error = null;
                state.last = { key, ok: exitCode === 0, exitCode, output, applied: apply && exitCode === 0 };
                ctx.notice(
                    exitCode === 0
                        ? (apply
                            ? `✅ ${state.project}: movimento aplicado.`
                            : `🧪 ${state.project}: dry-run pronto — revise a saída antes de aplicar.`)
                        : `⚠️ ${state.project}: o script recusou (exit ${exitCode}). Nada foi alterado.`,
                    8000,
                );
            }

            // O vault mudou de verdade: a próxima leitura não pode vir do cache.
            if (apply && exitCode === 0) void ctx.refresh(true);
            else onChange();
        });
    } catch (err) {
        state.running = false;
        state.error = err instanceof Error ? err.message : String(err);
        ctx.notice(`⚠️ Movimentação: ${state.error}`, 8000);
        onChange();
    }
}

/** Dispara `validate_projects.py` — o juiz P1/P2/P3 e as checagens T1–T4. */
function runValidation(ctx: MissionPanelContext, state: PortfolioViewState, onChange: () => void): void {
    if (state.validation.running || Platform.isMobile) return;
    state.validation.running = true;
    state.validation.error = null;
    onChange();

    try {
        const { exec } = require('child_process') as typeof import('child_process');
        exec(VALIDATE_PROJECTS_COMMAND, { cwd: vaultBasePath(ctx) }, (error, stdout, stderr) => {
            state.validation.running = false;
            const output = String(stdout ?? '').trim();
            const exitCode = exitCodeOf(error);
            if (!output) {
                state.validation.output = '';
                state.validation.exitCode = null;
                state.validation.error = describeFailure(error, String(stderr ?? ''));
                ctx.notice(`⚠️ Validação de projetos: ${state.validation.error.split('\n')[0]}`, 8000);
            } else {
                state.validation.output = output;
                state.validation.exitCode = exitCode;
                state.validation.error = null;
                ctx.notice(
                    exitCode === 0
                        ? '✅ validate_projects.py: pipeline de projetos consistente.'
                        : `⚠️ validate_projects.py: exit ${exitCode} — a saída está no painel.`,
                    8000,
                );
            }
            onChange();
        });
    } catch (err) {
        // `require` indisponível (mobile disfarçado, sandbox): o estado é declarado.
        state.validation.running = false;
        state.validation.error = err instanceof Error ? err.message : String(err);
        ctx.notice(`⚠️ Validação de projetos: ${state.validation.error}`, 8000);
        onChange();
    }
}

/* ==========================================================================
   a) Quadro
   ========================================================================== */

/**
 * O que o painel precisa saber sobre o canvas de um projeto.
 *
 * `entry` é a resposta do modelo (caminho, tamanho, dono); `mtime` vem do
 * snapshot porque o índice publica a ligação, não o carimbo do arquivo. Os dois
 * andam juntos de propósito: separá-los faria o painel procurar o canvas duas
 * vezes e poder discordar de si mesmo no meio da renderização.
 */
interface ProjectCanvas {
    entry: CanvasIndexEntry;
    mtime: number | null;
}

/**
 * O canvas do projeto **pelo modelo** — a convenção não é recalculada aqui.
 *
 * A busca é pelo **caminho da pasta**, não pelo nome: nome de projeto pode repetir
 * entre áreas, e o modelo devolve `null` para nome ambíguo em vez de entregar o
 * desenho de outro projeto. O frescor também vem do modelo, que já o publica.
 */
function projectCanvas(project: PortfolioProject, ctx: MissionPanelContext): ProjectCanvas | null {
    const entry = projectCanvasFor(canvasIndexOf(ctx.snapshot), project);
    if (!entry) return null;
    return { entry, mtime: entry.mtime };
}

/**
 * Frescor do desenho em dias, como texto. `null` é ausência de dado — nunca
 * "hoje", que afirmaria um carimbo que não foi lido.
 */
export function canvasAgeLabel(mtime: number | null, now: number = Date.now()): string {
    if (mtime === null || !Number.isFinite(mtime)) return 'sem data de alteração';
    const days = Math.max(0, Math.floor((now - mtime) / 86_400_000));
    if (days === 0) return 'alterado hoje';
    return `alterado há ${days} d`;
}

/**
 * O tamanho do desenho em palavras, ou `null` quando o canvas é grande demais
 * para ter sido lido — "sem contagem" é fato, e não `0 nós`.
 */
export function canvasSizeLabel(entry: CanvasIndexEntry): string | null {
    if (entry.nodes === null) return null;
    return `${entry.nodes} nós · ${entry.edges ?? '?'} arestas`;
}

/** Alvo do clique: a nota-índice, senão o canvas do projeto (do modelo), senão nada. */
function projectTarget(project: PortfolioProject, ctx: MissionPanelContext): string | null {
    if (project.index) return project.index;
    return projectCanvas(project, ctx)?.entry.path ?? null;
}

export function renderPortfolioBoard(host: HTMLElement, ctx: MissionPanelContext): void {
    const { portfolio } = ctx.snapshot;
    const node = card(host, {
        title: 'Quadro de projetos',
        icon: 'folder-kanban',
        tone: 'blue',
        badge: `${portfolio.totals.projects}`,
        subtitle: `${portfolio.totals.indexed} com nota-índice type: iniciativa · ${portfolio.totals.withTree} com árvore de progressão`,
        wide: true,
    });

    if (portfolio.totals.projects === 0) {
        emptyState(
            node.body,
            'Nenhum projeto lido em 100 - AREAS/<área>/100 - PROJECTS — ausência de dado, não ausência de trabalho.',
            'folder-open',
        );
        return;
    }

    const lanes = el(node.body, 'div', 'mc-portfolio-lanes');
    for (const column of portfolio.columns) {
        const lane = el(lanes, 'section', 'mc-portfolio-column');
        const head = el(lane, 'header', 'mc-portfolio-column-head');
        el(head, 'span', 'mc-portfolio-column-label', column.label);
        el(head, 'span', 'mc-portfolio-column-count', `${column.projects.length}`);

        // Coluna vazia continua na tela: ela diz que a fase não está em uso, e
        // sumir com ela faria o operador concluir que a fase não existe.
        if (column.projects.length === 0) {
            el(lane, 'p', 'mc-portfolio-empty', 'Nenhum projeto nesta fase.');
            continue;
        }
        for (const project of column.projects) portfolioCard(lane, project, ctx);
    }
}

function portfolioCard(parent: HTMLElement, project: PortfolioProject, ctx: MissionPanelContext): void {
    const target = projectTarget(project, ctx);
    // `block`, não `card`: `card` é a primitiva que desenha a moldura do painel,
    // e sombreá-la aqui confundiria a próxima leitura.
    const block = rowLink(parent, {
        classes: ['mc-portfolio-card'],
        title: target ? `${project.name} · ${project.path}` : `${project.name} · ${project.path} — sem nota-índice e sem canvas`,
        onClick: () => {
            if (target) void ctx.openPath(target);
            else ctx.notice(`⚠️ ${project.name}: sem nota-índice e sem canvas em ${project.path}`, 8000);
        },
    });

    const head = el(block, 'div', 'mc-portfolio-card-head');
    el(head, 'span', 'mc-portfolio-card-name', project.name);
    const badges = el(head, 'div', 'mc-portfolio-card-badges');
    // O selo de conformidade vem primeiro: é o que o juiz cobra, e é o que faz o
    // projeto ser reprovado na bancada hoje.
    if (!project.hasIndexType) {
        pill(badges, project.index ? 'índice sem type: iniciativa' : 'sem nota-índice', 'red', 'shield-alert');
    }
    if (project.tree) pill(badges, 'árvore', 'purple', 'git-branch');

    const meta = el(block, 'div', 'mc-portfolio-card-meta');
    // O canvas vem antes das tarefas porque é o dado que este painel não tinha:
    // tamanho do desenho e quando ele mudou pela última vez. A contagem de
    // tarefas logo abaixo continua sendo a mesma de antes — um dado, uma casa.
    const canvas = projectCanvas(project, ctx);
    if (!canvas) {
        // Projeto sem desenho é fato operacional, não falha e não zero: o projeto
        // existe, o canvas é que não. Dizer isso em palavras evita que a ausência
        // seja lida como "mapa vazio". A classe é a mesma da ausência de tarefa
        // (`mc-portfolio-no-tasks`) porque é a MESMA coisa — ausência declarada,
        // e reaproveitá-la não inventa estilo novo num CSS que tem dono único.
        el(meta, 'span', 'mc-portfolio-no-tasks', 'sem canvas no projeto');
    } else {
        const size = canvasSizeLabel(canvas.entry);
        // `mc-portfolio-tasks` é a classe do dado numérico desta linha. O canvas
        // é dado novo, mas o tratamento visual é o mesmo — e uma classe a mais
        // seria CSS novo sem regra nova.
        el(meta, 'span', 'mc-portfolio-tasks',
            size ? `canvas: ${size} · ${canvasAgeLabel(canvas.mtime)}` : `canvas: sem contagem · ${canvasAgeLabel(canvas.mtime)}`);
    }
    if (project.tasks.total === 0) {
        // Ausência de dado em palavras: `0/0` faria o vault parecer um projeto
        // sem trabalho feito, quando ele só não registrou trabalho nenhum.
        el(meta, 'span', 'mc-portfolio-no-tasks', 'sem tarefa registrada');
    } else {
        el(meta, 'span', 'mc-portfolio-tasks', plural(project.tasks.total, 'tarefa', 'tarefas'));
        if (project.tasks.completed > 0) {
            el(meta, 'span', 'mc-portfolio-tasks', plural(project.tasks.completed, 'concluída', 'concluídas'));
        }
        if (project.tasks.blocked > 0) {
            el(meta, 'span', 'mc-portfolio-blocked', plural(project.tasks.blocked, 'bloqueada', 'bloqueadas'));
        }
    }
    el(meta, 'span', 'mc-portfolio-area', project.area);
}

/* ==========================================================================
   b) Movimentação sancionada
   ========================================================================== */

/** A saída crua do script, sempre inteira: é ela que sustenta o botão de aplicar. */
function renderRunOutput(parent: HTMLElement, run: PortfolioRun): void {
    const box = el(parent, 'div', 'mc-portfolio-output');
    const meta = el(box, 'div', 'mc-portfolio-output-meta');
    pill(
        meta,
        run.applied ? 'aplicado' : run.ok ? 'dry-run' : 'recusado',
        run.applied ? 'green' : run.ok ? 'cyan' : 'yellow',
        run.applied ? 'check-check' : run.ok ? 'flask-conical' : 'octagon-alert',
    );
    el(meta, 'span', 'mc-portfolio-exit', `exit ${run.exitCode ?? '?'}`);
    el(meta, 'span', 'mc-portfolio-output-note',
        run.applied
            ? 'o movimento foi aplicado — o vault mudou'
            : 'nada foi alterado: dry-run' + (run.ok ? '' : ' recusado pelo script'));
    el(box, 'pre', 'mc-portfolio-output-body', run.output);
}

export function renderPortfolioActions(
    host: HTMLElement,
    ctx: MissionPanelContext,
    state: PortfolioViewState,
    onChange: () => void,
): void {
    const { portfolio } = ctx.snapshot;
    const projects = portfolio.columns.flatMap(column => column.projects);
    const node = card(host, {
        title: 'Movimentar projeto',
        icon: 'move-right',
        tone: 'orange',
        subtitle: 'Move a PASTA de coluna, grava status e quarter na nota-índice e reescreve os canvas que apontam para ela.',
        wide: true,
    });

    const warning = applyTone(el(node.body, 'div', 'mc-portfolio-warning'), 'yellow');
    icon(warning, 'alert-triangle', 'mc-portfolio-warning-icon');
    el(warning, 'span', 'mc-portfolio-warning-text',
        'Isto altera o vault: o projeto muda de coluna, o frontmatter é gravado e os canvas são reescritos. O dry-run é o padrão e não escreve nada — só o botão Aplicar executa.');

    if (projects.length === 0) {
        emptyState(node.body, 'Nenhum projeto no quadro para mover.', 'folder-open');
        return;
    }

    // Um `<select>` em vez de um botão "mover" em cada card, e a razão é a
    // segurança: o comando é montado a partir de UMA escolha explícita, o modo
    // fica visível antes do clique e o nome vem da lista do quadro — não há como
    // o operador mandar um nome arbitrário para o shell. Botão por card também
    // multiplicaria por 34 os pontos de disparo do mesmo script.
    const controls = el(node.body, 'div', 'mc-portfolio-controls');
    const projectSelect = el(controls, 'select', 'mc-portfolio-select');
    projectSelect.setAttribute('aria-label', 'Projeto a mover');
    const placeholder = el(projectSelect, 'option', undefined, 'Escolha o projeto…');
    placeholder.setAttribute('value', '');
    for (const column of portfolio.columns) {
        if (column.projects.length === 0) continue;
        const group = el(projectSelect, 'optgroup', 'mc-portfolio-group');
        group.setAttribute('label', `${column.label} · ${column.projects.length}`);
        for (const project of column.projects) {
            const option = el(group, 'option', undefined, `${project.name} · ${project.area}`);
            option.setAttribute('value', project.name);
        }
    }
    projectSelect.value = state.project;
    projectSelect.addEventListener('change', () => {
        state.project = projectSelect.value;
        // O dry-run anterior era de outro projeto: manter o apply habilitado
        // aplicaria um movimento que ninguém revisou.
        state.last = null;
        state.error = null;
        onChange();
    });

    const modeSelect = el(controls, 'select', 'mc-portfolio-select');
    modeSelect.setAttribute('aria-label', 'Modo do movimento');
    for (const option of PORTFOLIO_MOVE_MODES) {
        const item = el(modeSelect, 'option', undefined, `${option.label} → ${option.column}`);
        item.setAttribute('value', option.id);
    }
    modeSelect.value = state.mode;
    modeSelect.addEventListener('change', () => {
        state.mode = modeSelect.value as PortfolioMoveMode;
        state.last = null;
        state.error = null;
        onChange();
    });

    const mode = PORTFOLIO_MOVE_MODES.find(candidate => candidate.id === state.mode) ?? PORTFOLIO_MOVE_MODES[0];
    el(node.body, 'p', 'mc-portfolio-hint', `${mode.hint}. O script nunca cria projeto nem decide qual ativar — isso é decisão humana do planejamento.`);

    const run = el(node.body, 'div', 'mc-portfolio-run');
    const dry = actionButton(run, {
        label: 'Rodar dry-run',
        icon: 'play',
        tone: 'cyan',
        primary: true,
        title: moveCommand(state.project, state.mode, false) ?? ACTIVATE_COMMAND,
        onClick: () => runMove(ctx, state, state.mode, false, onChange),
    }) as HTMLButtonElement;

    const current = state.last && state.last.key === `${state.project}|${state.mode}` ? state.last : null;
    const apply = actionButton(run, {
        label: 'Aplicar (--apply)',
        icon: 'check',
        tone: 'orange',
        title: current && current.ok ? moveCommand(state.project, state.mode, true) ?? undefined : 'O apply só habilita depois do dry-run desta seleção.',
        onClick: () => runMove(ctx, state, state.mode, true, onChange),
    }) as HTMLButtonElement;
    apply.disabled = !current || !current.ok || current.applied || state.running || !state.project;

    if (!state.project) {
        dry.disabled = true;
        el(run, 'span', 'mc-portfolio-status', 'Escolha um projeto para começar.');
    } else if (Platform.isMobile) {
        dry.disabled = true;
        apply.disabled = true;
        el(run, 'span', 'mc-portfolio-status', 'A movimentação roda no desktop');
    } else if (state.running) {
        dry.disabled = true;
        apply.disabled = true;
        el(run, 'span', 'mc-portfolio-status', 'executando…');
    } else if (!current) {
        el(run, 'span', 'mc-portfolio-status', 'O apply só habilita depois do dry-run desta seleção.');
    } else if (current.applied) {
        el(run, 'span', 'mc-portfolio-status', 'Movimento aplicado. Rode um novo dry-run para mexer de novo.');
    } else if (!current.ok) {
        el(run, 'span', 'mc-portfolio-status', `O script recusou (exit ${current.exitCode}) — corrija o que a mensagem aponta antes de aplicar.`);
    } else {
        el(run, 'span', 'mc-portfolio-status', 'Dry-run ok e visível: revise a saída antes de aplicar.');
    }

    if (state.error) {
        const box = applyTone(el(node.body, 'div', 'mc-portfolio-error'), 'red');
        el(box, 'span', 'mc-portfolio-error-title', 'A movimentação não pôde ser lida');
        el(box, 'pre', 'mc-portfolio-error-text', state.error);
    }

    if (current) renderRunOutput(node.body, current);
}

/* ==========================================================================
   c) Conformidade ao vivo
   ========================================================================== */

export function renderPortfolioCompliance(
    host: HTMLElement,
    ctx: MissionPanelContext,
    state: PortfolioViewState,
    onChange: () => void,
): void {
    const { portfolio } = ctx.snapshot;
    const failures = portfolio.missingIndex.length;
    const node = card(host, {
        title: 'Conformidade dos projetos',
        icon: 'shield-check',
        tone: failures > 0 ? 'red' : 'green',
        badge: failures > 0 ? `${failures}` : 'ok',
        subtitle: 'juiz P1 · validate_projects.py',
    });

    el(node.body, 'p', 'mc-portfolio-rule',
        'O P1 cobra: toda pasta nas colunas 1 - Backlog, 2 - Active, 3 - Waiting e 4 - Review precisa de README.md (ou <nome>.md) com frontmatter type: iniciativa. Sem isso a bancada reprova hoje — e um projeto em Active reprova estando em uso.');

    if (portfolio.totals.projects === 0) {
        emptyState(node.body, 'Nenhum projeto lido — não há o que conferir.', 'folder-open');
    } else if (failures === 0) {
        emptyState(node.body, `Nenhum dos ${portfolio.totals.projects} projetos reprova o P1 hoje.`, 'shield-check');
    } else {
        const list = el(node.body, 'div', 'mc-portfolio-missing');
        for (const project of portfolio.missingIndex) {
            const target = projectTarget(project, ctx);
            const row = rowLink(list, {
                classes: ['mc-portfolio-missing-item'],
                title: `${project.path}${target ? ` · abrir ${target.split('/').pop()}` : ' · sem nota-índice e sem canvas'}`,
                onClick: () => {
                    if (target) void ctx.openPath(target);
                    else ctx.notice(`⚠️ ${project.name}: sem nota-índice e sem canvas em ${project.path}`, 8000);
                },
            });
            const head = el(row, 'div', 'mc-portfolio-missing-head');
            el(head, 'span', 'mc-portfolio-missing-name', project.name);
            pill(head, stageLabel(project.column), 'red', 'layout-grid');
            el(row, 'span', 'mc-portfolio-missing-reason',
                project.index
                    ? 'nota-índice sem type: iniciativa'
                    : 'pasta sem nota-índice (README.md ou <nome>.md)');
            el(row, 'span', 'mc-portfolio-missing-path', project.path);
        }
    }

    // Botão de verdade. O antigo "Validar projetos" da aba Executar só emitia uma
    // Notice mandando rodar no terminal — este roda o juiz e mostra a saída.
    const run = el(node.body, 'div', 'mc-portfolio-run');
    const button = actionButton(run, {
        label: 'Rodar validação de projetos',
        icon: 'play',
        tone: 'purple',
        primary: true,
        title: VALIDATE_PROJECTS_COMMAND,
        onClick: () => runValidation(ctx, state, onChange),
    }) as HTMLButtonElement;

    if (Platform.isMobile) {
        button.disabled = true;
        el(run, 'span', 'mc-portfolio-status', 'A validação roda no desktop');
    } else if (state.validation.running) {
        button.disabled = true;
        el(run, 'span', 'mc-portfolio-status', 'executando…');
    }

    if (state.validation.error) {
        const box = applyTone(el(node.body, 'div', 'mc-portfolio-error'), 'red');
        el(box, 'span', 'mc-portfolio-error-title', 'A validação não pôde ser lida');
        el(box, 'pre', 'mc-portfolio-error-text', state.validation.error);
    }

    if (state.validation.output) {
        const box = el(node.body, 'div', 'mc-portfolio-output');
        const meta = el(box, 'div', 'mc-portfolio-output-meta');
        const clean = state.validation.exitCode === 0;
        // Exit 1 aqui é RESULTADO: o juiz encontrou problema. Só a ausência de
        // saída é falha de execução (§ `runValidation`).
        pill(meta, clean ? 'pipeline consistente' : 'problemas encontrados', clean ? 'green' : 'red', clean ? 'check-circle-2' : 'alert-triangle');
        el(meta, 'span', 'mc-portfolio-exit', `exit ${state.validation.exitCode ?? '?'}`);
        el(box, 'pre', 'mc-portfolio-output-body', state.validation.output);
    } else if (!state.validation.error && !state.validation.running) {
        el(node.body, 'p', 'mc-portfolio-hint',
            'A validação ainda não foi rodada nesta sessão. Ela é somente leitura: percorre projetos e tarefas e não altera nenhum arquivo.');
    }
}
