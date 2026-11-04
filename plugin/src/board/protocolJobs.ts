/**
 * Os dois scripts que a página "Protocolos" roda no desktop, e a leitura do que eles
 * devolvem: a bancada (`run_judges.py`) e o gerador do mapa do 🧭
 * (`generate_router_map.py`).
 *
 * Os comandos são fixos (o operador não digita nada) e usam o Python 3.11 do usuário,
 * nunca o `python3` do sistema (o 3.9 do macOS abre a janela de crash). Quem executa é
 * `protocolActions.ts`, pelo mesmo caminho da Bancada DFM (`child_process.exec`, `cwd`
 * no vault); a leitura da bancada é a do painel dela (`parseBenchReport`).
 *
 * Módulo puro: sem Obsidian, sem DOM. Prova: tests/board/protocolJobs.test.ts.
 */
import { parseBenchReport } from '../engine/missionBench';
import type { ProtocolJobState } from './protocolRender';

/** O Python do usuário, com `-B` (sem `__pycache__` no vault). */
export const DESKTOP_PYTHON = '"$HOME/.local/bin/python3.11" -B';
export const BENCH_SCRIPT = '200 - FUNCTIONS/Scripts/run_judges.py';
export const ROUTER_MAP_SCRIPT = '200 - FUNCTIONS/Scripts/generate_router_map.py';
export const ROUTER_MAP_CANVAS = '000 - KERNEL/03 - MANUAIS_OPERACIONAIS/🧭 Router Central — Mapa.canvas';
export const PROTOCOL_INVENTORY = '200 - FUNCTIONS/Inventário de Protocolos DFM (ponteiro — canônico no Kernel).md';

/** O que faz: o comando fixo que roda um script do vault com o Python do usuário. */
export function scriptCommand(script: string): string {
    return `${DESKTOP_PYTHON} "${script.replace(/"/g, '')}"`;
}

export function idleJob(): ProtocolJobState {
    return { running: false, summary: null, ok: null, detail: [] };
}

/**
 * O que faz: o estado da bancada a partir da saída do runner.
 * Por quê: exit 1 com juízes lidos é resultado (o que falhou), não erro de execução; só
 * saída sem checagem nenhuma é "não pôde ser lida" (a regra do painel da Bancada).
 * Entra → sai: stdout, stderr e a mensagem do erro do processo → `ProtocolJobState`.
 * Erro e ataque: saída vazia ou irreconhecível nunca vira "limpa".
 */
export function benchJob(stdout: string, stderr: string, error: string | null): ProtocolJobState {
    const report = parseBenchReport(String(stdout ?? ''));
    if (report.checks.length === 0) {
        const detail = [error ?? '', String(stderr ?? '').trim(), report.raw.trim().slice(0, 600)].filter(Boolean);
        return { running: false, summary: 'A bancada não pôde ser lida.', ok: false, detail };
    }
    const failed = report.checks.filter(check => !check.ok);
    const total = report.declared ?? report.checks.length;
    const detail = failed.flatMap(check => [`❌ ${check.label}`, ...check.output.slice(0, 8).map(line => `    ${line}`)]);
    return {
        running: false,
        summary: report.ok ? `✅ Bancada limpa: ${total} checagens` : `❌ ${failed.length} de ${report.checks.length} juízes falharam`,
        ok: report.ok,
        detail,
    };
}

/**
 * O que faz: o estado do gerador do mapa a partir da saída dele: a linha "✅ …" do
 * script; sem ela (ou com erro), o que ele escreveu.
 */
export function mapJob(stdout: string, stderr: string, error: string | null): ProtocolJobState {
    const lines = String(stdout ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const done = lines.find(line => line.startsWith('✅'));
    if (done && !error) return { running: false, summary: done, ok: true, detail: [] };
    const detail = [error ?? '', ...lines, String(stderr ?? '').trim()].filter(Boolean).slice(0, 20);
    return { running: false, summary: lines.find(line => line.startsWith('❌')) ?? 'O mapa não foi gerado.', ok: false, detail };
}
