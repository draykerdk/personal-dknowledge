/**
 * Bancada DFM — leitura pura da saída do runner canônico.
 *
 * O "DFM Control Center" legado lançava três scripts por `child_process.exec`,
 * e dois deles estavam quebrados: `validate_kanbans.py` não existe no vault e
 * `validate_canvases.py` tem `VAULT_DIR` cravado em outro vault — auditava o
 * vault errado sem avisar. A bancada substitui os três por uma fonte única e
 * declarada: `200 - FUNCTIONS/Scripts/run_judges.py`, checagens somente
 * leitura, exit 0 quando tudo passa. Quantas são é o runner que diz (a lista
 * `JUDGES` e o cabeçalho "Bancada DFM · N checks"): nenhum texto deste módulo
 * nem do painel guarda esse número, que defasou quando a bancada passou de 9
 * para 10 checks.
 *
 * Este módulo é **puro**: não faz I/O, não executa nada, não importa
 * `obsidian`. Ele só traduz texto em estrutura — o que permite testar o parser
 * contra a saída real medida no vault, sem processo nenhum no meio.
 *
 * Duas promessas do parser:
 * 1. **Nada é descartado em silêncio.** O que não casa com nenhum padrão
 *    conhecido vai inteiro para `raw` — quem exibe decide o que fazer.
 * 2. **Nunca finge sucesso.** Saída vazia ou irreconhecível devolve
 *    `checks: []`, `ok: false`. Zero checks não é "tudo verde".
 */

export interface BenchCheck {
    /** "Protocolos · grafo" — o rótulo do juiz, que pode conter `·`. */
    label: string;
    /** O juiz passou? Verdade de máquina: `exitCode === 0`. */
    ok: boolean;
    exitCode: number;
    seconds: number;
    /** "27 aviso(s)" ou '' quando o check não declara aviso. */
    advisory: string;
    /** Linhas de detalhe que vieram indentadas abaixo deste check (4 espaços removidos). */
    output: string[];
}

export interface BenchReport {
    checks: BenchCheck[];
    passed: number;
    failed: number;
    /** "Resumo: 17 erro(s), 2 aviso(s)." — vazio quando o runner não imprime resumo. */
    summary: string;
    /**
     * Quantos checks o cabeçalho do runner declarou ("Bancada DFM · 10 checks
     * somente leitura"). `null` quando o cabeçalho não veio. É o número que o
     * painel mostra: vem da bancada, não de um texto escrito à mão.
     */
    declared: number | null;
    /** Todos passaram — e existe pelo menos um check. */
    ok: boolean;
    /** A saída que não casou com nenhum padrão conhecido (nunca descartada). */
    raw: string;
}

/**
 * Comando canônico da bancada. Fixo: o operador não digita nada. O Python é o 3.11
 * do usuário, nunca o `python3` do sistema: o 3.9 do macOS abre a janela de crash.
 */
export const BENCH_COMMAND = '"$HOME/.local/bin/python3.11" -B "200 - FUNCTIONS/Scripts/run_judges.py"';

/**
 * Linha de check. O separador é ` · exit `, **não** o primeiro `·`: o rótulo do
 * juiz também usa `·` ("Protocolos · grafo", "Projetos e tarefas · pipeline").
 * Ancorar no primeiro `·` cortaria o rótulo pela metade.
 */
const CHECK_LINE = /^(✅|❌)\s+(.+?)\s+·\s+exit\s+(\d+)\s+·\s+([\d.]+)s(?:\s+·\s+(.+))?$/;

/** Cabeçalho "Bancada DFM · 10 checks somente leitura" — a contagem é lida, o resto é estrutura. */
const BANNER_LINE = /^Bancada DFM\s+·\s+(\d+)\s+checks somente leitura$/;

/**
 * "Resumo: 17 erro(s), 2 aviso(s)." — aceita indentação porque no vault esse
 * resumo é a última linha da saída do juiz Agent Commons, que o runner indenta
 * como todo o resto. Ancorar em `^Resumo:` deixaria o campo vazio justamente na
 * saída real.
 */
const SUMMARY_LINE = /^\s*Resumo:\s*(.*)$/;

/**
 * Rodapé do runner: "❌ 3 juiz(es) falharam · 0.97s" ou "✅ Bancada limpa ·
 * 0.98s". Parece check, não é: se entrasse na lista, `checks` teria um a mais
 * e o painel contaria um juiz que não existe.
 */
const FOOTER_LINE = /^(✅|❌)\s+(\d+\s+juiz\(es\)\s+falharam|Bancada limpa)\s+·\s+[\d.]+s$/;

/** Detalhe de um juiz: o runner indenta a saída dele em 4 espaços. */
const DETAIL_LINE = /^ {4}/;

/**
 * Lê a saída do `run_judges.py` e devolve o relatório da bancada.
 *
 * Reconhecidas (e consumidas): cabeçalho, linha de check, detalhe indentado,
 * `Resumo:` e rodapé de total. Linhas em branco são separadores. Todo o resto —
 * traceback solto, aviso de import, saída de um juiz que não respeitou a
 * indentação — vai para `raw`, na ordem em que apareceu.
 */
export function parseBenchReport(stdout: string): BenchReport {
    const text = String(stdout ?? '').replace(/\r\n?/g, '\n');
    const lines = text.split('\n');

    const checks: BenchCheck[] = [];
    const rawLines: string[] = [];
    let summary = '';
    let declared: number | null = null;
    /** Check dono dos próximos detalhes indentados. `null` antes do primeiro. */
    let current: BenchCheck | null = null;

    for (const line of lines) {
        const check = CHECK_LINE.exec(line);
        if (check) {
            current = {
                label: check[2].trim(),
                exitCode: Number(check[3]),
                ok: Number(check[3]) === 0,
                seconds: Number(check[4]),
                advisory: (check[5] ?? '').trim(),
                output: [],
            };
            checks.push(current);
            continue;
        }

        // O resumo é lido antes da regra de detalhe — é ele que o painel exibe
        // como total da bancada. Quando vem indentado (o caso real), a linha
        // também continua pertencendo ao juiz que a imprimiu: não se apaga a
        // saída de um juiz só porque ela foi reconhecida.
        if (SUMMARY_LINE.test(line)) {
            summary = line.trim();
            if (current !== null && DETAIL_LINE.test(line)) {
                current.output.push(line.slice(4));
            } else {
                current = null;
            }
            continue;
        }

        // O detalhe pertence ao último check lido — e só enquanto ele existir.
        if (current !== null && DETAIL_LINE.test(line)) {
            current.output.push(line.slice(4));
            continue;
        }

        if (line.trim() === '') continue;
        const banner = BANNER_LINE.exec(line);
        if (banner) {
            declared = Number(banner[1]);
            current = null;
            continue;
        }
        if (FOOTER_LINE.test(line)) {
            current = null;
            continue;
        }

        rawLines.push(line);
        // Fora do bloco de um check: detalhe indentado depois daqui não é do juiz.
        current = null;
    }

    const passed = checks.filter(check => check.ok).length;
    const failed = checks.length - passed;

    return {
        checks,
        passed,
        failed,
        summary,
        declared,
        // Zero check nunca é sucesso: ausência de evidência não é evidência de saúde.
        ok: checks.length > 0 && failed === 0,
        raw: rawLines.join('\n'),
    };
}

/**
 * Subtítulo do painel da Bancada. Com relatório, diz quantas checagens a
 * bancada declarou (ou, sem cabeçalho, quantas leu); sem relatório, não
 * inventa número: a contagem só existe depois de rodar.
 */
export function benchSubtitle(report: BenchReport | null): string {
    const count = report ? report.declared ?? report.checks.length : null;
    const what = count ? `${count} checagens somente leitura` : 'checagens somente leitura do runner canônico';
    return `Bancada canônica do vault: ${what}. Nada é alterado aqui.`;
}

/** Texto do painel antes da primeira rodada: sem número, que ainda não foi lido. */
export const BENCH_EMPTY_TEXT =
    'A bancada ainda não foi rodada nesta sessão. Ela é somente leitura: percorre as checagens do runner canônico e não altera nenhum arquivo.';
