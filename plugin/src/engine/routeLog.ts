/**
 * O caminho vira registro (Fase D; arquitetura do núcleo de 21/10, 4.3; plano de 22/10,
 * seção 5).
 *
 * Quando um protocolo é aberto a partir do 🧭 Router Central (por qualquer número de
 * paradas), uma linha guarda a data, a hora, a situação escolhida no primeiro menu e o
 * protocolo. O 📨 lê as rotas da semana: as situações mais escolhidas e os protocolos a
 * que levaram, sem julgamento. Só registra: a falta de linha é ausência de dado.
 *
 * Um arquivo por mês, `400 - MEMORY/100 - DAILY/Reputação contextual/Rotas AAAA-MM.md`,
 * no mesmo padrão do registro dos blocos (`blockLog.ts`): as linhas num bloco ```jsonl
 * entre marcadores, e o resto da nota é livre. As funções daqui só calculam; quem grava
 * é o `RouteLogService`, em fila.
 * Prova: tests/engine/routeLog.test.ts.
 */
import { BLOCK_LOG_FOLDER } from './blockLog';

export const ROUTE_LOG_START = '<!-- dfm-rotas:start -->';
export const ROUTE_LOG_END = '<!-- dfm-rotas:end -->';

export interface RouteRecord {
    /** O dia, `AAAA-MM-DD`. */
    data: string;
    /** A hora, `HH:mm`. */
    hora: string;
    /** A situação escolhida no primeiro menu do 🧭 (o texto da opção). */
    situacao: string;
    /** O id do protocolo aberto. */
    protocolo: string;
    /** O nome do protocolo, para ler sem abrir o JSON. */
    nome?: string;
    /** O router da última parada, o que abriu o protocolo. */
    via?: string;
}

/** O que faz: o caminho do arquivo do mês de um dia `AAAA-MM-DD`. */
export function routeLogPath(day: string): string {
    return `${BLOCK_LOG_FOLDER}/Rotas ${String(day ?? '').slice(0, 7)}.md`;
}

/**
 * O que faz: os registros do bloco ```jsonl entre os marcadores.
 * Erro e ataque: linha que não é JSON, ou sem `data`, `situacao` e `protocolo`, fica de
 * fora (o resto vale); sem marcadores, não há registro.
 */
export function parseRouteLog(text: string | null | undefined): RouteRecord[] {
    const source = String(text ?? '');
    const start = source.indexOf(ROUTE_LOG_START);
    const end = source.indexOf(ROUTE_LOG_END);
    if (start < 0 || end < start) return [];
    const out: RouteRecord[] = [];
    for (const line of source.slice(start + ROUTE_LOG_START.length, end).split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('{')) continue;
        try {
            const value = JSON.parse(trimmed);
            if (value && typeof value === 'object' && typeof value.data === 'string'
                && typeof value.situacao === 'string' && value.situacao && typeof value.protocolo === 'string' && value.protocolo) {
                out.push(value as RouteRecord);
            }
        } catch (e) {
            // linha estragada à mão: fica de fora, o resto vale
        }
    }
    return out;
}

/**
 * O que faz: o texto da nota do mês com os registros entre os marcadores; o que estiver
 * fora deles não muda. Sem texto (nota nova), monta a nota inteira.
 */
export function renderRouteLog(text: string | null | undefined, month: string, records: RouteRecord[]): string {
    const lines = (records || []).map(record => JSON.stringify(record));
    const block = `${ROUTE_LOG_START}\n\`\`\`jsonl\n${lines.join('\n')}${lines.length ? '\n' : ''}\`\`\`\n${ROUTE_LOG_END}`;
    const source = String(text ?? '');
    const start = source.indexOf(ROUTE_LOG_START);
    const end = source.indexOf(ROUTE_LOG_END);
    if (start >= 0 && end > start) return `${source.slice(0, start)}${block}${source.slice(end + ROUTE_LOG_END.length)}`;
    if (source.trim()) return `${source.trimEnd()}\n\n${block}\n`;
    return [
        '---',
        'type: reputacao_contextual',
        `mes: "${month}"`,
        '---',
        '',
        `# Rotas ${month}`,
        '',
        '> Registro automático dos caminhos do 🧭 Router Central: a situação escolhida no primeiro menu e o protocolo aberto. O 📨 lê as rotas da semana. Só registra; a falta de registro é ausência de dado.',
        '',
        block,
        '',
    ].join('\n');
}

export interface RouteSummary {
    total: number;
    situacoes: Array<{ situacao: string; n: number; protocolos: Array<{ protocolo: string; nome: string; n: number }> }>;
}

/**
 * O que faz: as rotas de `desde` a `ate` (inclusivos, `AAAA-MM-DD`) por situação, cada uma
 * com os protocolos a que levou. Ordem: mais vezes primeiro; no empate, o texto.
 */
export function resumoRotas(records: RouteRecord[], desde: string, ate: string): RouteSummary {
    const bySituation = new Map<string, Map<string, { nome: string; n: number }>>();
    let total = 0;
    for (const record of records || []) {
        if (!record?.data || record.data < desde || record.data > ate) continue;
        total += 1;
        const protocols = bySituation.get(record.situacao) ?? new Map();
        const entry = protocols.get(record.protocolo) ?? { nome: record.nome || record.protocolo, n: 0 };
        entry.n += 1;
        protocols.set(record.protocolo, entry);
        bySituation.set(record.situacao, protocols);
    }
    const byCount = <T extends { n: number }>(key: (x: T) => string) => (a: T, b: T) => b.n - a.n || key(a).localeCompare(key(b), 'pt-BR');
    const situacoes = [...bySituation.entries()].map(([situacao, protocols]) => ({
        situacao,
        n: [...protocols.values()].reduce((sum, p) => sum + p.n, 0),
        protocolos: [...protocols.entries()].map(([protocolo, p]) => ({ protocolo, nome: p.nome, n: p.n }))
            .sort(byCount(p => p.nome)),
    })).sort(byCount(s => s.situacao));
    return { total, situacoes };
}

/**
 * O que faz: a linha "🧭 Rotas da semana" do 📨: "🆘 Travei / estado difícil 3 (→ 🔓
 * Desbloqueio 2, 🔋 Energia 1) · 🌙 Fechar o dia ou a semana 1 (→ 🌙 Revisão Diária 1)".
 * Sem rota, "sem rota registrada" (dado, não conclusão).
 */
export function linhaRotas(resumo: RouteSummary): string {
    if (!resumo?.total) return 'sem rota registrada';
    return resumo.situacoes
        .map(s => `${s.situacao} ${s.n} (→ ${s.protocolos.map(p => `${p.nome} ${p.n}`).join(', ')})`)
        .join(' · ');
}

/** O que faz: os meses (`AAAA-MM`) que o intervalo toca. */
export function mesesDoIntervalo(desde: string, ate: string): string[] {
    const out: string[] = [];
    const first = String(desde ?? '').slice(0, 7);
    const last = String(ate ?? '').slice(0, 7);
    // Forma própria (não é a `DIA`): o mês `AAAA-MM` dos dois arquivos de registro, sem o dia.
    if (!/^\d{4}-\d{2}$/.test(first) || !/^\d{4}-\d{2}$/.test(last)) return out;
    let [year, month] = first.split('-').map(Number);
    for (let guard = 0; guard < 24; guard++) {
        const key = `${year}-${String(month).padStart(2, '0')}`;
        out.push(key);
        if (key >= last) break;
        month += 1;
        if (month > 12) { month = 1; year += 1; }
    }
    return out;
}

/**
 * Grava e lê o registro das rotas no vault. Gravar é em fila (duas rotas seguidas não
 * se atropelam no mesmo arquivo); a falha só vai para o console: registrar nunca para o
 * protocolo que está abrindo.
 */
export class RouteLogService {
    app: any;
    private writing: Promise<void> = Promise.resolve();

    constructor(app: any) {
        this.app = app;
    }

    registrar(record: RouteRecord): Promise<void> {
        const run = async () => {
            const path = routeLogPath(record.data);
            const month = String(record.data).slice(0, 7);
            const vault = this.app.vault;
            const existing = vault.getAbstractFileByPath(path);
            const text = existing ? await vault.read(existing) : null;
            const content = renderRouteLog(text, month, [...parseRouteLog(text), record]);
            if (existing) {
                await vault.modify(existing, content);
                return;
            }
            const folder = path.split('/').slice(0, -1).join('/');
            if (!vault.getAbstractFileByPath(folder)) {
                try { await vault.createFolder(folder); } catch (e) { /* já existe */ }
            }
            await vault.create(path, content);
        };
        const next = this.writing.then(run, run);
        this.writing = next.catch(error => console.error('DFM 🧭 rotas: registro não gravado:', error));
        return this.writing;
    }

    /** O que faz: os registros de `desde` a `ate`, dos arquivos dos meses que o intervalo toca. */
    async registros(desde: string, ate: string): Promise<RouteRecord[]> {
        const out: RouteRecord[] = [];
        for (const month of mesesDoIntervalo(desde, ate)) {
            const file = this.app.vault.getAbstractFileByPath(routeLogPath(`${month}-01`));
            if (!file) continue;
            const text = await this.app.vault.read(file);
            out.push(...parseRouteLog(text).filter(r => r.data >= desde && r.data <= ate));
        }
        return out;
    }
}
