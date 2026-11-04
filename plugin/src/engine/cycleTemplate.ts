/**
 * Modelo do trimestre — a substituição de placeholders, pura e testável.
 *
 * O Control Center antigo criava a nota do trimestre a partir de
 * `200 - FUNCTIONS/Models/Modelo Trimestral 1 ano em 12 semanas.md` trocando
 * três marcadores escritos à mão (`{{date:YYYY}}`, `{{date:Q}}` e `Q{{date:Q}}`).
 * O modelo real **não usa nenhum dos três**: a linha 21 é
 * `# Trimestre {{date:YYYY-[Q]Q}}`. O resultado é que a nota nascia com o
 * marcador literal no título — defeito que a primeira versão desta peça
 * reproduziu por fidelidade ao legado, e que a revisão adversarial pegou.
 *
 * Aqui o formato é interpretado de verdade: qualquer `{{date:FMT}}` é resolvido
 * pelo formato, com literais entre colchetes preservados. É o mesmo subconjunto
 * que o modelo do operador usa, e nada além dele é inventado.
 *
 * Desde 27/10/2026 o modelo usa `{{targetquarter:…}}` (não resolvido aqui) e o botão
 * "Iniciar planejamento" do Mission Control abre o 🧭 Planejamento Trimestral em vez de
 * criar a nota com esta função; ela fica para o reparo e os testes de período.
 */

/** Ano do trimestre (`2026-Q3` → `2026`). Vazio quando a chave não casa. */
export function quarterYear(quarter: string): string {
    const match = String(quarter ?? '').match(/^(\d{4})-/);
    return match ? match[1] : '';
}

/** Número do trimestre (`2026-Q3` → `3`). Vazio quando a chave não casa. */
export function quarterNumber(quarter: string): string {
    // Forma própria (não é a `SEMANA`): o número no fim da chave, sem conferir o ano.
    const match = String(quarter ?? '').match(/-Q([1-4])$/);
    return match ? match[1] : '';
}

/**
 * Resolve um formato de data no subconjunto que o vault usa.
 *
 * Suporta o que aparece nos modelos e nada mais: `YYYY` (ano), `Q` (trimestre),
 * `MM`/`M` (mês de início do trimestre), `WW` (semana ISO do início), e
 * literais entre colchetes — `[Q]` é a letra Q, não o token de trimestre. É o
 * que faz `YYYY-[Q]Q` virar `2026-Q3` em vez de `2026-Q3` por acidente.
 *
 * Formato sem token reconhecido devolve string vazia: melhor um marcador vazio
 * do que um texto inventado no título da nota.
 */
export function formatQuarterDate(format: string, quarter: string): string {
    const year = quarterYear(quarter);
    const number = quarterNumber(quarter);
    if (!year || !number) return '';
    const month = String((Number(number) - 1) * 3 + 1).padStart(2, '0');
    // Semana ISO do primeiro dia do trimestre.
    const start = new Date(`${year}-${month}-01T12:00:00Z`);
    const thursday = new Date(start);
    thursday.setUTCDate(thursday.getUTCDate() + 3 - ((thursday.getUTCDay() + 6) % 7));
    const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(
        ((thursday.getTime() - firstThursday.getTime()) / 86_400_000
            - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7,
    );

    let out = '';
    let index = 0;
    const source = String(format ?? '');
    while (index < source.length) {
        // Literal entre colchetes: copia o conteúdo sem interpretar.
        if (source[index] === '[') {
            const end = source.indexOf(']', index);
            if (end > index) {
                out += source.slice(index + 1, end);
                index = end + 1;
                continue;
            }
        }
        const rest = source.slice(index);
        const token = ['YYYY', 'WW', 'MM', 'M', 'Q'].find(candidate => rest.startsWith(candidate));
        if (token) {
            out += token === 'YYYY' ? year
                : token === 'Q' ? number
                : token === 'MM' ? month
                : token === 'M' ? String(Number(month))
                : String(week).padStart(2, '0');
            index += token.length;
            continue;
        }
        out += source[index];
        index += 1;
    }
    return out;
}

/**
 * Substitui **todo** `{{date:FMT}}` do modelo pelo formato resolvido.
 *
 * Não há ordem a respeitar: o marcador inteiro é um token só, e literais como o
 * `Q` de `[Q]` são reconhecidos pelo colchete. A versão anterior desta função
 * tentava trocar três padrões em ordem — e o teste que dizia provar a ordem
 * passava nas duas ordens, porque os três produziam o mesmo resultado.
 *
 * Marcadores que não são de data (`{{visao}}`, `{{valores}}`…) **ficam como
 * estão**: quem os preenche é o protocolo de planejamento trimestral, e apagá-los
 * aqui destruiria o modelo do operador.
 */
export function fillQuarterTemplate(template: string, quarter: string): string {
    return String(template ?? '').replace(/\{\{date:([^}]*)\}\}/g, (_full, format: string) =>
        formatQuarterDate(format, quarter));
}

/**
 * Esqueleto usado quando o modelo não existe no vault.
 *
 * Declarado como fallback, não como preferência: o modelo do operador é a fonte
 * da verdade; isto aqui só evita que a ausência dele deixe o trimestre sem nota.
 * Mantém o mínimo que o resto do sistema lê (`type`, `quarter`, `status`).
 */
export function fallbackQuarterNote(quarter: string): string {
    return [
        '---',
        'type: quarterly_note',
        `quarter: "${quarter}"`,
        `year: "${quarterYear(quarter)}"`,
        'status: open',
        'rating:',
        'tags:',
        '  - quarterly',
        '---',
        '',
        `# Trimestre ${quarter}`,
        '',
        '> **Tema:** a definir',
        '> **Direção:** a definir',
        '',
        '## Objetivos do trimestre',
        '',
        '- ',
        '',
    ].join('\n');
}

/** Caminho canônico da nota do trimestre — o mesmo que o motor lê. */
export function quarterNotePath(quarter: string): string {
    return `300 - RUNTIME/302 - Daymiss/Quarterly/${quarter}.md`;
}

/** Onde o modelo do trimestre vive, e como o operador o nomeia. */
export const QUARTER_TEMPLATE_PATH = '200 - FUNCTIONS/Models/Modelo Trimestral 1 ano em 12 semanas.md';
