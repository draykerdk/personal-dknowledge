/**
 * O serviço do núcleo: liga as funções puras de escolher (`choose.ts`), do modelo de
 * domínio (`domainModel.ts`) e do registro com tipo (`records.ts`) ao vault.
 *
 * Liga:
 * - o modelo do domínio (`200 - FUNCTIONS/Config/dominios/<domínio>.json`) e o bloco
 *   `pesos.<domínio>` da tabela única, lidos a cada uso (o operador ajusta e vale na hora);
 * - as notas candidatas e as referências do contexto (frontmatter do metadataCache);
 * - a contagem dos registros pelo metadataCache do vault inteiro.
 *
 * Oferece às vistas em dataviewjs a mesma escolha do passo `suggest_note` com `rankWith`:
 *   `app.plugins.plugins['dfm-system'].nucleo.escolher('<domínio>', dv.pages(...))`
 *   `app.plugins.plugins['dfm-system'].nucleo.contarRegistros({ tipo, onde, desde, ate })`
 *   `app.plugins.plugins['dfm-system'].nucleo.exposicoesDaSemana('<AAAA-Www>', { meta, metaIdeias })`
 *   `app.plugins.plugins['dfm-system'].nucleo.reserva()` (a reserva de hoje, a conta da Missão; só com a nota da reserva definida)
 *   `await app.plugins.plugins['dfm-system'].nucleo.rotasDaSemana('<AAAA-Www>')` (o 📨: "🧭 Rotas da semana")
 *   `app.plugins.plugins['dfm-system'].nucleo.formaDaSemana('<AAAA-Www>')` (e `formaDoDia`,
 *   `formaDoTrimestre`, `formaDoProjeto` e `formaDasTarefas(itens, horizonte)`): a forma de
 *   mostrar pela função única (`showGrammar.ts`), a mesma dos canvas e do painel
 *   `await app.plugins.plugins['dfm-system'].nucleo.parDaSemana('<AAAA-Www>')`: o par de
 *   valores da semana (a sugestão, a nota e o padrão do 🌳; `valorSemana.ts`)
 *   `await app.plugins.plugins['dfm-system'].nucleo.ech('<AAAA-Www | AAAA-Qn | AAAA-MM-DD>')`: as três
 *   contagens do ECH do período (`ech.ts`, o que conta mora em `Config/ech.json`), com a linha (`echText`)
 *   `await app.plugins.plugins['dfm-system'].nucleo.reputacao('<AAAA-Www | AAAA-Qn | AAAA-MM-DD | id>')`: a
 *   reputação contextual das funções e dos módulos (`reputacao.ts`, os valores em `Config/reputacao.json`),
 *   com o porquê e o sinal de aprendizado, que não é aplicado; `reputacaoDaNota(caminho)` (a linha
 *   "Reputação" do painel do nó) e `niveisDaReputacao(ids)` (o nível que a ordem do 🧭 cita)
 *   `await app.plugins.plugins['dfm-system'].nucleo.suportesDoTrimestre('<AAAA-Qn>')`: os Suportes e decisões da
 *   nota do trimestre e das Weeks dele, lidos de cada nota (`suportes.ts`, 02/11)
 *   `await app.plugins.plugins['dfm-system'].nucleo.paraGravar('<AAAA-MM-DD>')`: o que gravar hoje, a peça pronta
 *   para gravar e a fala do teleprompter dela, para o bloco 🎥 da Day (`paraGravar.ts`, 05/11)
 * E ao passo `suggest` de router com `rankOptions` (Fase D), os campos dos protocolos de
 * destino: a `fase_uso` e o uso recente, lido nas Days (`camposDosProtocolos`).
 * Só lê; nada aqui decide pela pessoa.
 */
import { DECISION_WEIGHTS_PATH } from './decisionWeights';
import { choiceReasonLine, escolher, fieldNumber, type Candidato, type Escolha, type Ordenado } from './choose';
import {
    campoDaDataDePublicacao,
    DOMAIN_MODELS_FOLDER,
    domainModelPath,
    domainWeightProblems,
    domainWeightsOf,
    hasChoice,
    parseDomainModel,
    type ChoiceModel,
    type DomainModel,
} from './domainModel';
import { contarRegistros, isRecordPathCounted, registrosDe, type ConsultaRegistros, type NotaComCampos } from './records';
import { notasDoVault } from './recordsVault';
import { contarEch, ECH_CONFIG_PATH, fatosEch, lerEch, precisaDeTexto, type EchContagem, type NotaDoCofre, type Periodo } from './ech';
import {
    contextoDoCredito, funcaoDaNota, lerReputacao, lerReputacaoDoCofre, linhaDaReputacao, momentoDoFatoEch, niveisDasFuncoes, grausDasFuncoes, REPUTACAO_CONFIG_PATH, rodadasDasDays,
    type DefProtocolo, type EntradaDaReputacao, type LinhaDaReputacao, type ReputacaoConfig, type ReputacaoLida,
} from './reputacao';
import { parseBlockLog, type BlockRecord } from './blockLog';
import { EXPOSICAO_TIPO, TRILHAS_EXPOSICAO, exposicoesSemana, type ExposicoesSemana } from './exposicoes';
import { suportesDoTexto, type ItemDeSuporte } from './suportes';
import { teleprompterDoRoteiro } from './teleprompter';
import {
    blocoParaGravar, CAMPOS_DA_PECA, estadosDaGravacao, falaDoTeleprompter, ordemParaGravar, ordemPelaFala, pecasParaGravar, protocoloDoTeleprompter,
    type BotaoParaGravar, type ModeloDaPeca, type PecaLida, type ProtocoloDoBotao,
} from './paraGravar';

/** Os Suportes e decisões de um trimestre (`suportesDoTrimestre`): a seção da nota dele e as das Weeks dele. */
export interface SuportesDoTrimestre {
    trimestre: string;
    proprios: { caminho: string | null; itens: ItemDeSuporte[] };
    semanas: Array<{ semana: string; caminho: string; itens: ItemDeSuporte[] }>;
}
import { weekBounds, weekOf } from './missionPlan';
import { esperarProtocolos, protocolCampos, usoRecenteJanela, type DayRead } from './protocolRank';
import { linhaRotas, resumoRotas, RouteLogService, type RouteSummary } from './routeLog';
import { ECH_EMPTY, echCountsOf, echText, SMART_HORIZON, showGrammar, timeHorizon, type GrammarHorizon, type ShownGrammar } from './showGrammar';
import { linkName } from './decisionWeights';
import { parEmCadeia, pesosDaTabela, type ParSemana, type ParValores, type ValorFundamental } from './valorSemana';
import { fold, progressText, projectProgress, type TaskInfo } from '../project/projectCanvasModel';
import { currentQuarter, dayPeriod, isoWeekOf, quarterOfWeek, quarterPeriod, quarterWeeks, weekPeriod } from './calendario';
import { dayGrammar, dayLoad, loadText, parseBlockMinutes, quarterGrammar, weekGrammar, type BlockTask } from './tarefasNoPeriodo';
import { diasDasNotas, reserva } from '../missao/dinheiro';
import type { Reserva } from '../missao/tipos';
import { CASAS_PADRAO } from '../missao/entrada';
import { FRASES } from '../missao/frases';
import { DIA, diaDoArquivo } from './dia';
import { ehSemana, ehTrimestre } from './periodo';
import { definicoesDe } from '../definicoes';

/** `AAAA-MM-DD` deslocado em `dias` (aritmética em UTC). */
function shiftIso(date: string, dias: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
}

/** Hoje, `AAAA-MM-DD` no fuso local. */
function localToday(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** O dia local `AAAA-MM-DD` de um instante em milissegundos (a data de criação do arquivo). */
function localDayOf(ms: unknown): string | undefined {
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return undefined;
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * O que faz: o período da conta do ECH: a semana (`AAAA-Www`, de segunda a domingo), o
 * trimestre (`AAAA-Qn`, as semanas dele), o dia (`AAAA-MM-DD`) ou `{ desde, ate }` já pronto.
 * Entra → sai: o valor → `{ desde, ate }`, ou `null` quando ilegível.
 * Prova: tests/engine/nucleoService.test.ts ("o ECH").
 */
export function periodoDoEch(valor: unknown): Periodo | null {
    if (valor && typeof valor === 'object') {
        const desde = String((valor as any).desde ?? '').trim();
        const ate = String((valor as any).ate ?? '').trim();
        return DIA.test(desde) && DIA.test(ate) && desde <= ate ? { desde, ate } : null;
    }
    const texto = String(valor ?? '').trim();
    if (DIA.test(texto)) return { desde: texto, ate: texto };
    if (ehSemana(texto)) {
        const b = weekBounds(texto);
        return b ? { desde: b.start, ate: b.end } : null;
    }
    if (ehTrimestre(texto)) {
        const dates = quarterPeriod(texto).dates;
        return dates.length ? { desde: dates[0], ate: dates[dates.length - 1] } : null;
    }
    return null;
}

/** O ECH de um período, como o núcleo o lê: a conta, a linha e o que estiver errado no arquivo. */
export interface EchLido {
    periodo: Periodo;
    /** A conta (`contarEch`); sem o arquivo lido, `null`. */
    contagem: EchContagem | null;
    /** A linha na forma de mostrar (`echText`); sem nada para contar, "sem registro no período". */
    texto: string;
    shown: boolean;
    /** Os caminhos do que entrou e está solto. */
    soltos: string[];
    problemas: string[];
}

/** A reputação contextual como o núcleo a lê: a leitura, o período (ou `null`, quando o pedido é um id) e os problemas dos arquivos. */
export interface ReputacaoNoNucleo extends ReputacaoLida {
    periodo: Periodo | null;
    problemas: string[];
}

/** O que a reputação leu do cofre: a entrada pronta e o arquivo (`null` sem um dos arquivos), e os problemas. */
interface EntradaLida {
    entrada: EntradaDaReputacao | null;
    config: ReputacaoConfig | null;
    problemas: string[];
}

/** A pasta das Days (a mesma do diário e da árvore do agora). */
const DAY_FOLDER = '300 - RUNTIME/302 - Daymiss/Day';
/** As notas da semana e do trimestre (a pasta das notas de valor é das definições, `pastas.valores`). */
const WEEK_FOLDER = '300 - RUNTIME/302 - Daymiss/Week';
const QUARTER_FOLDER = '300 - RUNTIME/302 - Daymiss/Quarterly';

/** O par de valores de uma semana, como o núcleo o lê (a sugestão, a nota e o que vale). */
export interface ParDaSemanaLido {
    semana: string;
    /** O trimestre da semana (o da quinta-feira dela, D6). */
    trimestre: string | null;
    /** A sugestão (o sorteio da semana, `valorSemana.ts`). */
    sugestao: ParSemana;
    /** O par da semana anterior que a sugestão evita (o da nota; sem ele, a sugestão dela). */
    anterior: ParValores | null;
    /** O que a nota da semana já tem (`valor_semana`, `valor_relacao`); sem nota, `null`. */
    daNota: ParValores | null;
    /** O que vale como resposta padrão no 🌳: o da nota e, onde ela não tem, a sugestão. */
    padrao: ParValores;
    problemas: string[];
}

export interface DomainLoad {
    /** Só o modelo que escolhe (com `escolher`); o que só declara estados ou legado não ordena. */
    modelo: ChoiceModel | null;
    /** O bloco `pesos.<domínio>` (objeto vazio se faltar). */
    tabela: Record<string, any>;
    problemas: string[];
}

/** O que faz: um valor qualquer de nota (página do Dataview, TFile, caminho) → caminho. */
export function notePathOf(item: any): string {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
        if (typeof item.file?.path === 'string') return item.file.path;
        if (typeof item.path === 'string') return item.path;
    }
    return '';
}

export class NucleoService {
    app: any;
    plugin: any;

    constructor(plugin: any) {
        this.plugin = plugin;
        this.app = plugin.app;
    }

    /** O JSON de um arquivo do vault, ou `null` (com o motivo em `erro`). */
    private async readJson(path: string): Promise<{ data: any; erro: string | null }> {
        try {
            return { data: JSON.parse(await this.app.vault.adapter.read(path)), erro: null };
        } catch (e) {
            return { data: null, erro: `${path} não foi lido` };
        }
    }

    /**
     * O que faz: o modelo do domínio, o bloco de pontos dele e os problemas dos dois.
     * Por quê: o passo `rankWith` e a API leem a mesma coisa, do mesmo jeito; um modelo
     * com problema ainda ordena (o que falta vale 0), e o problema é dito.
     */
    async loadDomain(dominio: string): Promise<DomainLoad> {
        const model = await this.readJson(domainModelPath(dominio));
        if (model.erro) return { modelo: null, tabela: {}, problemas: [model.erro] };
        const { modelo, problemas } = parseDomainModel(model.data, dominio);
        if (!modelo) return { modelo: null, tabela: {}, problemas };
        // Desde o Passo 0 (0b) um modelo pode não escolher (só estados ou legado): não ordena.
        if (!hasChoice(modelo)) return { modelo: null, tabela: {}, problemas: [...problemas, `${domainModelPath(dominio)}: o modelo não declara \`escolher\``] };
        const table = await this.readJson(DECISION_WEIGHTS_PATH);
        const bloco = table.erro ? undefined : domainWeightsOf(table.data, dominio);
        const extra = table.erro ? [table.erro] : domainWeightProblems(modelo, bloco);
        const tabela = bloco && typeof bloco === 'object' && !Array.isArray(bloco) ? bloco as Record<string, any> : {};
        return { modelo, tabela, problemas: [...problemas, ...extra] };
    }

    /** O frontmatter de uma nota por caminho (ou nome de link); sem nota → `{}`. */
    frontmatterOf(pathOrName: string): Record<string, any> {
        const vault = this.app.vault;
        let file = vault.getAbstractFileByPath?.(pathOrName);
        if (!file && !pathOrName.endsWith('.md')) file = vault.getAbstractFileByPath?.(`${pathOrName}.md`);
        if (!file) file = this.app.metadataCache?.getFirstLinkpathDest?.(pathOrName.replace(/\.md$/, ''), '');
        return (file && this.app.metadataCache?.getFileCache?.(file)?.frontmatter) || {};
    }

    /** O que faz: as referências do modelo como números (`{ nome: valor }`); a sem número fica de fora. */
    contextOf(modelo: ChoiceModel): Record<string, number> {
        const out: Record<string, number> = {};
        for (const [name, ref] of Object.entries(modelo.escolher.referencias)) {
            const value = fieldNumber(this.frontmatterOf(ref.nota)?.[ref.campo]);
            if (value !== null) out[name] = value;
        }
        return out;
    }

    /**
     * O que faz: as notas como candidatos (caminho, nome e frontmatter do metadataCache).
     * Um item que já é candidato (`{ id?, titulo?, campos }`, com `campos` objeto) entra
     * como veio, sem ler o vault: a conferência da escolha em memória, sem nota criada.
     */
    candidatesOf(notas: Iterable<any>): Candidato[] {
        const out: Candidato[] = [];
        for (const item of Array.from(notas || [])) {
            if (item && typeof item === 'object' && item.campos && typeof item.campos === 'object' && !Array.isArray(item.campos) && !item.file) {
                const id = String(item.id ?? item.titulo ?? '');
                if (!id) continue;
                out.push({ id, titulo: String(item.titulo ?? id.split('/').pop()!.replace(/\.md$/, '')), campos: item.campos });
                continue;
            }
            const path = notePathOf(item);
            if (!path) continue;
            const file = this.app.vault.getAbstractFileByPath?.(path);
            const campos = (file && this.app.metadataCache?.getFileCache?.(file)?.frontmatter) || {};
            out.push({ id: path, titulo: path.split('/').pop()!.replace(/\.md$/, ''), campos });
        }
        return out;
    }

    /** O que faz: as notas candidatas que o modelo declara (pasta e, se houver, `type`). */
    declaredCandidates(modelo: DomainModel): string[] {
        const prefix = `${modelo.candidatos.pasta.replace(/\/+$/, '')}/`;
        return (this.app.vault.getMarkdownFiles?.() || [])
            .filter((file: any) => file.path.startsWith(prefix))
            .filter((file: any) => !modelo.candidatos.type
                || String(this.app.metadataCache?.getFileCache?.(file)?.frontmatter?.type ?? '') === modelo.candidatos.type)
            .map((file: any) => file.path);
    }

    /**
     * O que faz: a escolha de um domínio para as notas dadas (ou, sem notas, para as que
     * o modelo declara). Entra: o domínio e notas (páginas do Dataview, TFiles ou
     * caminhos). Sai: { ordenados, eliminados, problemas }. Só lê.
     */
    async escolher(dominio: string, notas?: Iterable<any>): Promise<Escolha & { problemas: string[] }> {
        const { modelo, tabela, problemas } = await this.loadDomain(dominio);
        if (!modelo) return { ordenados: [], eliminados: [], problemas };
        const candidatos = this.candidatesOf(notas ?? this.declaredCandidates(modelo));
        return { ...escolher(candidatos, modelo.escolher, tabela, this.contextOf(modelo)), problemas };
    }

    /** O que faz: a linha dos motivos de um candidato ordenado, no padrão do gesto (`choiceReasonLine`). */
    linha(item: Pick<Ordenado, 'motivos'>): string {
        return choiceReasonLine(item);
    }

    /** O que faz: quantos registros do tipo há no vault (ver `records.ts`). */
    contarRegistros(consulta: ConsultaRegistros): number {
        return contarRegistros(consulta, notasDoVault(this.app));
    }

    /** O que faz: os registros do tipo no vault, na ordem da data. */
    registros(consulta: ConsultaRegistros): NotaComCampos[] {
        return registrosDe(consulta, notasDoVault(this.app));
    }

    /**
     * O que faz: as exposições de uma semana (`AAAA-Www`), por trilha, contra a meta, com a
     * linha na forma de mostrar (ver `exposicoes.ts`). A contagem é `contarRegistros`
     * (tipo `exposicao`, de segunda a domingo da semana). Semana ilegível → `null`.
     * Uso na Week: `nucleo.exposicoesDaSemana(dv.current().week, { meta: 3, metaIdeias: 1 })`.
     */
    exposicoesDaSemana(semana: string, opcoes: { meta?: number; metaIdeias?: number } = {}): ExposicoesSemana | null {
        const limites = weekBounds(String(semana ?? ''));
        if (!limites) return null;
        const consulta = (onde?: Record<string, string>): ConsultaRegistros => ({
            tipo: EXPOSICAO_TIPO, desde: limites.start, ate: limites.end, ...(onde ? { onde } : {}),
        });
        const porTrilha: Record<string, number> = {};
        for (const { chave } of TRILHAS_EXPOSICAO) porTrilha[chave] = this.contarRegistros(consulta({ trilha: chave }));
        return exposicoesSemana(this.contarRegistros(consulta()), porTrilha, opcoes.meta ?? 3, opcoes.metaIdeias ?? 0);
    }
    /**
     * O que faz: os "Suportes e decisões" de um trimestre (`AAAA-Qn`): a seção da nota dele e a de cada
     * Week das semanas dele, lidas do texto de cada nota (sem cópia), na ordem das semanas; a semana sem
     * nota, ou sem item na seção, fica de fora. As notas se acham pela casa e pelo `type` dos modelos da
     * semana e do trimestre (`Config/dominios`), nunca por um caminho no código.
     * Por quê: cada semana tem a sua seção, e o trimestre reúne todas (02/11/2026).
     * Entra → sai: `AAAA-Qn` → `{ trimestre, proprios, semanas }`; trimestre ilegível → `null`; sem o
     * modelo de um dos tipos, a parte dele vem vazia.
     * Uso na nota do trimestre: `(await nucleo.suportesDoTrimestre(dv.current().quarter)).semanas`.
     * Prova: tests/engine/suportes.test.ts ("o núcleo").
     */
    async suportesDoTrimestre(trimestre: unknown): Promise<SuportesDoTrimestre | null> {
        const q = String(trimestre ?? '').trim();
        if (!ehTrimestre(q)) return null;
        const modeloDe = async (dominio: string) => { const r = await this.readJson(domainModelPath(dominio)); return r.erro ? null : parseDomainModel(r.data, dominio).modelo; };
        const [daSemana, doTrimestre] = await Promise.all([modeloDe('semana'), modeloDe('trimestre')]);
        const notaDe = (modelo: DomainModel | null, nome: string) => (modelo ? this.declaredCandidates(modelo).find(p => p.slice(p.lastIndexOf('/') + 1).replace(/\.md$/, '') === nome) ?? null : null);
        const itensDe = async (caminho: string | null) => {
            const file = caminho ? this.app.vault.getAbstractFileByPath?.(caminho) : null;
            if (!file) return [];
            try { return suportesDoTexto(await this.app.vault.cachedRead(file)); } catch { return []; }
        };
        const nota = notaDe(doTrimestre, q);
        const semanas: SuportesDoTrimestre['semanas'] = [];
        for (const semana of quarterWeeks(q)) {
            const caminho = notaDe(daSemana, semana);
            const itens = await itensDe(caminho);
            if (caminho && itens.length) semanas.push({ semana, caminho, itens });
        }
        return { trimestre: q, proprios: { caminho: nota, itens: await itensDe(nota) }, semanas };
    }

    /** As unidades da forma de mostrar: as TaskNotes do índice do plugin (abertas e concluídas). */
    private tarefas(): TaskInfo[] {
        return this.plugin?.board?.tasks?.all?.() ?? [];
    }

    /**
     * O que faz: a forma de mostrar de uma semana (`AAAA-Www`): horizonte `week` (e o
     * `scheduled` nos dias dela), pela função única. Semana ilegível → `null`.
     * Uso na Week: `nucleo.formaDaSemana(dv.current().week).text`.
     */
    formaDaSemana(semana: string): ShownGrammar | null {
        const week = String(semana ?? '').trim();
        if (!ehSemana(week)) return null;
        return weekGrammar(week, this.tarefas(), 'sem planejamento');
    }

    /**
     * O que faz: a reserva de hoje, a mesma conta da Missão (`reserva`, `src/missao/dinheiro.ts`):
     * o último `saldo` informado (número) na nota da reserva, mais o que entrou e menos o que saiu
     * nas Days depois do `atualizado_em`, só dos dias com valor, e os meses pela média (a declarada
     * até haver 14 dias com valor nos últimos 30, então a medida, dizendo qual), com a linha em palavras.
     * Por quê: o bloco que se atualiza sozinho na nota da reserva (página Missão, §8.10), sem
     * regravar a nota nem mudar o texto dela. O `saldo_aprox` em texto não vira número. A nota é a
     * das definições (`arquivos.reserva`, A6): sem ela definida, ou definida e ausente, a linha fica
     * vazia e nada avisa.
     * Entra → sai: hoje (opcional) → `Reserva`; sem a nota, `texto` e `rotulo` vazios.
     * Uso na nota: `app.plugins.plugins['dfm-system'].nucleo.reserva().texto`.
     * Prova: tests/engine/nucleoService.test.ts ("a reserva").
     */
    reserva(hoje: string = localToday()): Reserva {
        const casas = this.plugin?.board?.missao?.casasSincronas?.()
            ?? { ...CASAS_PADRAO, reserva: definicoesDe(this.plugin).arquivos.reserva };
        const notas = notasDoVault(this.app);
        const nota = casas.reserva ? notas.find(n => n.path === casas.reserva) : undefined;
        const daReserva = nota ? { caminho: nota.path, nome: nota.path.split('/').pop()!.replace(/\.md$/, ''), campos: nota.frontmatter ?? {} } : null;
        return reserva(daReserva, diasDasNotas(notas, `${casas.daymiss}/Day`), hoje);
    }

    /**
     * O que faz: as notas do cofre como a conta do ECH as lê: o frontmatter, quantas notas
     * cada uma aponta (`resolvedLinks`), a data de criação do arquivo e, só onde a conta
     * pede (`precisaDeTexto`, ou `lerTambem`, para a reputação), o texto. Fora da lixeira, dos
     * modelos e de `_archive`.
     */
    private async cofreDoEch(config: Parameters<typeof precisaDeTexto>[0], periodo: Periodo, lerTambem?: (path: string) => boolean): Promise<NotaDoCofre[]> {
        const resolved = this.app.metadataCache?.resolvedLinks ?? {};
        const out: NotaDoCofre[] = [];
        for (const file of (this.app.vault.getMarkdownFiles?.() || [])) {
            const path = String(file?.path ?? '');
            if (!isRecordPathCounted(path)) continue;
            const nota: NotaDoCofre = {
                path,
                frontmatter: this.app.metadataCache?.getFileCache?.(file)?.frontmatter ?? null,
                ligacoes: Object.keys(resolved[path] ?? {}).filter(alvo => alvo !== path).length,
                criadaEm: localDayOf(file?.stat?.ctime),
            };
            if (precisaDeTexto(config, periodo, path) || lerTambem?.(path)) {
                try {
                    nota.texto = await (this.app.vault.cachedRead ? this.app.vault.cachedRead(file) : this.app.vault.read(file));
                } catch (e) {
                    nota.texto = '';
                }
            }
            out.push(nota);
        }
        return out;
    }

    /**
     * O que faz: as três contagens do ECH de um período: o que entrou, quanto disso está
     * organizado e ligado e o que está solto, as contradições resolvidas e abertas, os
     * atritos e os dias com registro e tarefa feita, com a linha na forma de mostrar.
     * Por quê: o 📅 e o 🔄 leem o ECH como contagem de fatos, por momento e por escala
     * (012, §3, "Os dois eixos"), sem nota da pessoa e sem multiplicar (29/10/2026). O que
     * conta mora em `Config/ech.json`, lido a cada uso (ajustar vale na hora).
     * Entra → sai: `AAAA-Www`, `AAAA-Qn`, `AAAA-MM-DD` ou `{ desde, ate }` → `EchLido`;
     * período ilegível → `null`; sem o arquivo, a linha diz "sem o ech.json".
     * Uso na Week: `(await nucleo.ech(dv.current().week)).texto`.
     * Prova: tests/engine/nucleoService.test.ts ("o ECH") e tests/engine/ech.test.ts.
     */
    async ech(periodo: unknown): Promise<EchLido | null> {
        const p = periodoDoEch(periodo);
        if (!p) return null;
        const lido = await this.readJson(ECH_CONFIG_PATH);
        if (lido.erro) return { periodo: p, contagem: null, texto: 'sem o ech.json', shown: false, soltos: [], problemas: [lido.erro] };
        const { config, problemas } = lerEch(lido.data);
        if (!config) return { periodo: p, contagem: null, texto: 'o ech.json não declara o que conta', shown: false, soltos: [], problemas };
        const contagem = contarEch(p, await this.cofreDoEch(config, p), config);
        const texto = echText(echCountsOf(contagem));
        return { periodo: p, contagem, texto, shown: texto !== ECH_EMPTY, soltos: contagem.complexidade.soltos, problemas };
    }

    /**
     * O que faz: a reputação contextual de um período (as funções com fato nele) ou de uma
     * função pelo id: para cada função, R, o nível, n, as células com as passagens, o porquê em
     * palavras e o sinal de aprendizado (calculado e não aplicado); e os módulos declarados,
     * cada um pelo elo mais fraco.
     * Por quê: a base simplificada pedida em 29/10/2026 ("a reputação contextual deve começar
     * já com a base dando um tipo de peso a cada tipo de função executada"); os valores moram em
     * `Config/reputacao.json` e o que conta como fato em `Config/ech.json`, os dois lidos a cada
     * uso (ajustar vale na hora). Só lê: nada se grava, e nenhuma ordem do sistema muda.
     * Entra → sai: `AAAA-Www`, `AAAA-Qn`, `AAAA-MM-DD`, `{ desde, ate }` ou o id da função (o id
     * do protocolo, a função de uma origem, `habito:<nota>`), e o dia de hoje (para os testes) →
     * `ReputacaoNoNucleo`; o dia de referência é o fim do período, ou hoje se vier antes; vazio →
     * `null`; sem um dos arquivos, a lista vem vazia com o problema.
     * Uso: `(await nucleo.reputacao(dv.current().week)).funcoes.map(f => f.porque)`.
     * Prova: tests/engine/nucleoService.test.ts ("a reputação") e tests/engine/reputacao.test.ts.
     */
    async reputacao(alvo: unknown, hoje: string = localToday()): Promise<ReputacaoNoNucleo | null> {
        const periodo = periodoDoEch(alvo);
        const id = periodo ? '' : (typeof alvo === 'string' ? alvo.trim() : '');
        if (!periodo && !id) return null;
        const ref = periodo && periodo.ate < hoje ? periodo.ate : hoje;
        const lido = await this.entradaDaReputacao(ref);
        if (!lido.entrada || !lido.config) return { hoje: ref, periodo, funcoes: [], modulos: [], problemas: lido.problemas };
        const lida = lerReputacaoDoCofre(lido.entrada, lido.config, ref, periodo ? { periodo } : { id });
        return { ...lida, periodo, problemas: lido.problemas };
    }

    /**
     * O que faz: a linha "Reputação" do painel do nó de uma nota: o nível e o porquê, quando a nota é
     * ela mesma uma função com reputação (`funcaoDaNota`, hoje o tracker de hábito); `null` para as
     * outras notas, sem os arquivos ou sem nível.
     * Por quê: o acabamento (30/10) pede uma linha Reputação no painel do nó, com o nível e o porquê
     * (proposta, 29/10). Só lê: nada se grava, e o porquê diz os fatos, nunca um número da pessoa.
     * Entra → sai: o caminho da nota e o dia de hoje (para os testes) → `LinhaDaReputacao | null`.
     * Prova: tests/engine/nucleoService.test.ts ("a reputação").
     */
    async reputacaoDaNota(caminho: string, hoje: string = localToday()): Promise<LinhaDaReputacao | null> {
        const path = String(caminho ?? '');
        if (!path) return null;
        const rep = await this.readJson(REPUTACAO_CONFIG_PATH);
        const config = rep.erro ? null : lerReputacao(rep.data).config;
        if (!config) return null;
        const file = this.app.vault.getAbstractFileByPath?.(path) ?? (this.app.vault.getMarkdownFiles?.() || []).find((f: any) => f?.path === path);
        const funcao = file ? funcaoDaNota(path, this.app.metadataCache?.getFileCache?.(file)?.frontmatter ?? null, config) : null;
        if (!funcao) return null;
        const lido = await this.entradaDaReputacao(hoje, true);
        if (!lido.entrada || !lido.config) return null;
        const f = lerReputacaoDoCofre(lido.entrada, lido.config, hoje, { id: funcao }).funcoes.find(x => x.id === funcao) ?? null;
        return linhaDaReputacao(funcao, f, hoje, lido.config);
    }

    /**
     * O que faz: o nível de cada protocolo, para a ordem que o peso propõe citar (o 🧭, a seção
     * Protocolos do painel do nó, a árvore do painel de protocolos); o alias vale pelo destino.
     * Por quê: a ordem que o peso propõe passa a citar o nível (proposta, 29/10); o rótulo só se
     * cita (o desempate da ordem vem do grau, `grausDaReputacao`).
     * Entra → sai: os ids e o dia de hoje → id → o rótulo do nível; sem os arquivos, `{}`. A
     * leitura do cofre vale por 30 segundos (o 🧭 pede a cada parada).
     * Prova: tests/engine/nucleoService.test.ts ("a reputação").
     */
    async niveisDaReputacao(ids: readonly string[], hoje: string = localToday()): Promise<Record<string, string>> {
        if (!Array.isArray(ids) || !ids.length) return {};
        const lido = await this.entradaDaReputacao(hoje, true);
        if (!lido.entrada || !lido.config) return {};
        return niveisDasFuncoes(lido.entrada, lido.config, hoje, ids);
    }

    /**
     * O que faz: o grau do nível de cada protocolo, para o desempate da ordem que o peso propõe (o 🧭, a
     * seção Protocolos do painel do nó, a árvore do painel de protocolos), pela mesma leitura do nível.
     * Por quê: sem esses status, a regra geral é que mais reputação dá mais prioridade (02/11/2026);
     * o peso declarado decide antes, e o grau só desempata.
     * Entra → sai: os ids e o dia de hoje → id → o grau; sem os arquivos, `{}`. Vale o cache de 30 s.
     * Prova: tests/engine/nucleoService.test.ts ("a reputação").
     */
    async grausDaReputacao(ids: readonly string[], hoje: string = localToday()): Promise<Record<string, number>> {
        if (!Array.isArray(ids) || !ids.length) return {};
        const lido = await this.entradaDaReputacao(hoje, true);
        if (!lido.entrada || !lido.config) return {};
        return grausDasFuncoes(lido.entrada, lido.config, hoje, ids);
    }

    /** A última leitura do cofre para a reputação (o dia, quando foi lida e o que se leu), para a ordem e o painel. */
    private memoDaReputacao: { ref: string; em: number; lido: Promise<EntradaLida> } | null = null;

    /**
     * O que faz: o que a reputação lê do cofre até o dia de referência: os dois arquivos, as Days, as
     * rodadas, os fatos do ECH e os blocos, já prontos para as funções puras.
     * Entra → sai: o dia e se vale a leitura dos últimos 30 segundos → a entrada, o arquivo e os problemas
     * (sem um dos arquivos, a entrada vem `null` com o problema).
     */
    private entradaDaReputacao(ref: string, memo = false): Promise<EntradaLida> {
        const agora = Date.now();
        if (memo && this.memoDaReputacao && this.memoDaReputacao.ref === ref && agora - this.memoDaReputacao.em < 30_000) return this.memoDaReputacao.lido;
        const lido = this.lerEntradaDaReputacao(ref);
        if (memo) this.memoDaReputacao = { ref, em: agora, lido };
        return lido;
    }

    private async lerEntradaDaReputacao(ref: string): Promise<EntradaLida> {
        const vazio = (problemas: string[]): EntradaLida => ({ entrada: null, config: null, problemas });
        const rep = await this.readJson(REPUTACAO_CONFIG_PATH);
        if (rep.erro) return vazio([rep.erro]);
        const lidaRep = lerReputacao(rep.data);
        if (!lidaRep.config) return vazio(lidaRep.problemas);
        const ech = await this.readJson(ECH_CONFIG_PATH);
        if (ech.erro) return vazio([...lidaRep.problemas, ech.erro]);
        const lidaEch = lerEch(ech.data);
        const problemas = [...lidaRep.problemas, ...lidaEch.problemas];
        if (!lidaEch.config) return vazio(problemas);

        const toda = { desde: '0000-01-01', ate: ref };
        const ehDay = (path: string) => path.startsWith(`${DAY_FOLDER}/`) && diaDoArquivo(path.split('/').pop() ?? '') !== '';
        const cofre = await this.cofreDoEch(lidaEch.config, toda, path => ehDay(path) && path.split('/').pop()!.slice(0, 10) <= ref);
        const days: DayRead[] = cofre.filter(n => ehDay(n.path) && n.path.split('/').pop()!.slice(0, 10) <= ref)
            .map(n => ({ date: n.path.split('/').pop()!.slice(0, 10), text: n.texto ?? '', campos: n.frontmatter ?? {} }));
        // O gerente dá os protocolos carregados (`JSONProtocol`, com a definição em `def`); a conta lê a
        // definição: a `fase`, a pasta, o `redirect` e o rótulo só existem nela (a prévia de 02/11). E,
        // logo depois de recarregar o plugin, espera a primeira carga, para não ler uma lista vazia.
        await esperarProtocolos(this.plugin?.manager);
        const defs: DefProtocolo[] = (this.plugin?.manager?.getAll?.() ?? [])
            .map((p: any) => (p && typeof p === 'object' && p.def && typeof p.def === 'object' ? p.def : p))
            .filter((d: any) => d && typeof d === 'object');
        const rodadas = rodadasDasDays(days, defs);
        const fatos = fatosEch(toda, cofre, lidaEch.config, momentoDoFatoEch(contextoDoCredito(rodadas, defs, lidaRep.config)));
        const blocos: BlockRecord[] = [];
        const pastaDosBlocos = lidaRep.config.origens.blocos?.pasta;
        if (pastaDosBlocos) {
            for (const file of (this.app.vault.getMarkdownFiles?.() || [])) {
                if (!String(file?.path ?? '').startsWith(`${pastaDosBlocos}/Blocos `)) continue;
                try {
                    blocos.push(...parseBlockLog(await (this.app.vault.cachedRead ? this.app.vault.cachedRead(file) : this.app.vault.read(file))));
                } catch (e) {
                    problemas.push(`${file.path} não foi lido`);
                }
            }
        }
        return { entrada: { fatos, rodadas, defs, cofre, blocos, trimestre: currentQuarter(ref) }, config: lidaRep.config, problemas };
    }

    /**
     * O que faz: a forma de mostrar de um dia (`AAAA-MM-DD`, horizonte `scheduled`). Data ilegível → `null`.
     * O dia vazio diz a frase da tabela única (`FRASES.semTarefas`, "sem tarefas"), a mesma da
     * Missão: um texto só para o mesmo vazio na Day, na Week e na Missão (29/10/2026).
     */
    formaDoDia(data: string): ShownGrammar | null {
        const date = String(data ?? '').trim();
        if (!DIA.test(date)) return null;
        return dayGrammar(date, this.tarefas(), FRASES.semTarefas);
    }

    /**
     * O que faz: a carga de um dia (`AAAA-MM-DD`) em horas: a soma das estimativas das
     * ações com `scheduled` nele (abertas e concluídas; SMART, canceladas e "algum dia"
     * não entram), contra o Bloco Sagrado da nota da semana do dia. É a conta do nó de
     * cada dia no bloco da semana (`dayLoad` e `loadText`), numa linha: "1,5 h de 2,5 h",
     * "· passa do bloco", "· +1 sem estimativa"; sem ação agendada, "nada agendado".
     * Por quê: a olhada da Day mostra a carga sem conta feita à parte (27/10/2026).
     * Data ilegível → `null`.
     * Uso na Day: `nucleo.cargaDoDia(dv.current().file.name).text`.
     */
    cargaDoDia(data: string): { minutos: number; acoes: number; semEstimativa: number; capacidade: number | null; text: string } | null {
        const date = String(data ?? '').trim();
        if (!DIA.test(date)) return null;
        const load = dayLoad(date, this.tarefas() as BlockTask[]);
        const file = this.app.vault?.getAbstractFileByPath?.(`${WEEK_FOLDER}/${isoWeekOf(date)}.md`);
        const fm = file ? this.app.metadataCache?.getFileCache?.(file)?.frontmatter || {} : {};
        const capacidade = parseBlockMinutes(fm.bloco_sagrado);
        const text = load.actions ? loadText(load, capacidade).replace(/^⏱ /, '').replace('\n', ' · ') : 'nada agendado';
        return { minutos: load.minutes, acoes: load.actions, semEstimativa: load.noEstimate, capacidade, text };
    }

    /**
     * O que faz: o que gravar hoje: as peças do estado pronto para gravar (pelo dia de ir ao ar mais perto, ou a mais
     * antiga sem dia) ou, sem nenhuma, as do estado de antes (o roteiro), cada uma com a fala do teleprompter dela e as
     * faltas do roteiro; e o bloco em Markdown, com os botões (o 📱 da peça sem teleprompter, o 🎬 sem peça).
     * Por quê: 05/11, "próxima vez que sai deve estar ali na nota diária": o bloco 🎥 da Day. Os estados, o protocolo do
     * teleprompter e o campo dele vêm do modelo de cada tipo com formatos (`paraGravar.ts`); as peças são as notas do
     * tipo na casa do modelo, a mesma leitura do ramo Criação e do 📅. Só lê: nada grava, nada muda de estado.
     * Entra → sai: o dia (`AAAA-MM-DD`) → a leitura, ou `null` com o dia ilegível.
     * Erro e ataque: o modelo que não se lê fica de fora (o problema dele é do juiz); a nota que não se lê fica sem
     * fala e sem faltas; o link do teleprompter que não resolve conta como teleprompter que falta.
     * Uso na Day: `(await nucleo.paraGravar(dv.current().file.name)).texto` e os `botoes`.
     * Prova: tests/engine/paraGravar.test.ts (a leitura pura e este leitor, com o modelo do cofre).
     */
    async paraGravar(dia: string = localToday()): Promise<{ prontas: boolean; pecas: PecaLida[]; texto: string; botoes: BotaoParaGravar[] } | null> {
        const hoje = String(dia ?? '').trim();
        if (!DIA.test(hoje)) return null;
        const vault = this.app.vault;
        const arquivos: any[] = vault?.getMarkdownFiles?.() ?? [];
        const fmDe = (f: any) => this.app.metadataCache?.getFileCache?.(f)?.frontmatter ?? {};
        const ler = async (f: any): Promise<string> => {
            try { return vault.cachedRead ? await vault.cachedRead(f) : await vault.adapter.read(f.path); } catch (e) { return ''; }
        };
        const jsons: string[] = (vault?.getFiles?.() ?? []).map((f: any) => f.path).filter((p: string) => p.startsWith(`${DOMAIN_MODELS_FOLDER}/`) && p.endsWith('.json')).sort();
        const lidos: Array<{ modelo: ModeloDaPeca; prontas: boolean; pecas: ReturnType<typeof pecasParaGravar>['pecas'] }> = [];
        for (const caminho of jsons) {
            const { data } = await this.readJson(caminho);
            const modelo = data ? parseDomainModel(data, caminho.split('/').pop()!.replace(/\.json$/, '')).modelo : null;
            if (!modelo?.formatos || !modelo.candidatos.type || !estadosDaGravacao(modelo)) continue;
            const pasta = modelo.candidatos.pasta.replace(/\/+$/, '');
            const notas = arquivos.filter(f => f.path.startsWith(`${pasta}/`) && String(fmDe(f)?.type ?? '').trim() === modelo.candidatos.type)
                .map(f => ({ caminho: f.path, nome: f.basename ?? f.path.split('/').pop().replace(/\.md$/, ''), campos: fmDe(f) }));
            lidos.push({ modelo, ...pecasParaGravar(modelo, notas) });
        }
        const prontas = lidos.some(l => l.prontas);
        const doModelo = new Map<string, ModeloDaPeca>();
        const escolhidas = lidos.filter(l => l.prontas === prontas).flatMap(l => l.pecas.map(p => { doModelo.set(p.caminho, l.modelo); return p; })).sort(ordemParaGravar);
        const pecas: PecaLida[] = [];
        for (const p of escolhidas) {
            const arquivo = vault?.getAbstractFileByPath?.(p.caminho);
            const roteiro = arquivo ? await ler(arquivo) : '';
            const tele = p.teleprompter ? this.app.metadataCache?.getFirstLinkpathDest?.(p.teleprompter.split('#')[0], p.caminho) : null;
            const fala = tele ? falaDoTeleprompter(await ler(tele)) || null : null;
            pecas.push({ ...p, teleprompterCaminho: tele?.path ?? null, fala, faltas: roteiro ? teleprompterDoRoteiro(roteiro).faltas : [] });
        }
        pecas.sort(ordemPelaFala);
        // Os botões pelo modelo da primeira peça (ou do primeiro tipo que grava, sem peça).
        const modelo = (pecas[0] ? doModelo.get(pecas[0].caminho) : undefined) ?? lidos[0]?.modelo ?? null;
        const nomeDe = (id: string) => String(this.plugin?.manager?.get?.(id)?.name ?? id);
        const botaoDe = (id: string | null | undefined): ProtocoloDoBotao | null => {
            if (!id || !modelo) return null;
            return { id, rotulo: nomeDe(id), preencher: modelo.protocolos.find(x => x.id === id)?.preencher ?? {} };
        };
        const estados = modelo ? estadosDaGravacao(modelo) : null;
        const idTele = modelo && estados ? protocoloDoTeleprompter(modelo, estados.pronto) : null;
        const vazioDe = (nome: string | null, padrao: string) => (nome && modelo?.campos.find(c => c.nome === nome)?.vazio) || padrao;
        const { texto, botoes } = blocoParaGravar(hoje, { prontas, pecas }, { teleprompter: botaoDe(idTele), roteiro: botaoDe(modelo?.criar?.protocolo) }, {
            destinos: vazioDe(CAMPOS_DA_PECA.destinos, 'sem destino'),
            publicar: vazioDe(modelo ? campoDaDataDePublicacao(modelo) : null, 'a definir'),
        });
        return { prontas, pecas, texto, botoes };
    }

    /** O que faz: a forma de mostrar de um trimestre (`AAAA-Qn`, as semanas dele). Trimestre ilegível → `null`. */
    formaDoTrimestre(trimestre: string): ShownGrammar | null {
        const quarter = String(trimestre ?? '').trim();
        if (!ehTrimestre(quarter)) return null;
        const forma = quarterGrammar(quarter, this.tarefas());
        return forma.shown ? forma : { ...forma, text: 'sem planejamento' };
    }

    /**
     * O que faz: a forma de mostrar de um projeto (as SMART e as ações dele) no trimestre
     * (`AAAA-Qn`; sem ele, o de hoje), a mesma conta do canvas e do painel
     * (`projectProgress`). O projeto vem do portfólio pelo nome; desconhecido, conta pelo
     * nome dado.
     */
    formaDoProjeto(nome: string, trimestre?: string): (ShownGrammar & { projeto: string; trimestre: string }) | null {
        const name = String(nome ?? '').trim();
        if (!name) return null;
        const quarter = ehTrimestre(String(trimestre ?? '')) ? String(trimestre) : currentQuarter(localToday());
        const known = (this.plugin?.board?.projectCanvas?.projectsSync?.() ?? []).find((p: any) => fold(p.name) === fold(name));
        const project = known ? { name: known.name, index: known.index ?? null } : { name, index: null };
        const progress = projectProgress(project, this.tarefas(), quarterPeriod(quarter));
        const g = progress.grammar;
        const shown = g.feitas > 0 || g.plano > 0 || g.algumDia > 0;
        return { counts: g, text: progressText(progress), shown, projeto: project.name, trimestre: quarter };
    }

    /**
     * O que faz: a forma de mostrar de um conjunto de TaskNotes que quem mostra escolheu
     * (páginas do Dataview, caminhos ou arquivos), pela função única (`showGrammar.ts`).
     * O horizonte: `AAAA-Www` (a semana), `AAAA-MM-DD` (o dia), `AAAA-Qn` (o trimestre)
     * ou nada (o de trabalho, como a SMART: a aberta é do plano). Item que não é TaskNote
     * do índice do plugin fica de fora.
     * Uso: o Radar do trimestre (as SMART e as ações de cada semana) e o Accountability
     * da Week (as ações que os protocolos geraram). Horizonte ilegível → `null`.
     */
    formaDasTarefas(itens: Iterable<any>, horizonte?: string, vazio = 'sem ações'): ShownGrammar | null {
        const h = String(horizonte ?? '').trim();
        let horizon: GrammarHorizon | null = null;
        if (!h) horizon = SMART_HORIZON;
        else if (ehSemana(h)) horizon = timeHorizon(weekPeriod(h));
        else if (DIA.test(h)) horizon = timeHorizon(dayPeriod(h));
        else if (ehTrimestre(h)) horizon = timeHorizon(quarterPeriod(h));
        if (!horizon) return null;
        const index = this.plugin?.board?.tasks;
        const byPath = typeof index?.get === 'function' ? null : new Map(this.tarefas().map(t => [t.path, t]));
        const units: TaskInfo[] = [];
        const seen = new Set<string>();
        for (const item of Array.from(itens || [])) {
            const path = notePathOf(item);
            if (!path || seen.has(path)) continue;
            seen.add(path);
            const task = byPath ? byPath.get(path) : index.get(path);
            if (task) units.push(task);
        }
        return showGrammar(units, horizon, vazio);
    }

    /** O par que a nota da semana guarda (`valor_semana`, `valor_relacao`); sem nota, `null`. */
    private parDaNota(semana: string): ParValores | null {
        const file = this.app.vault.getAbstractFileByPath?.(`${WEEK_FOLDER}/${semana}.md`);
        if (!file) return null;
        const fm = this.app.metadataCache?.getFileCache?.(file)?.frontmatter || {};
        return { valor: linkName(fm.valor_semana) || null, relacao: linkName(fm.valor_relacao) || null };
    }

    /**
     * O que faz: os valores fundamentais com a ordem da rotação de seis: as notas de valor da pasta das
     * definições (`type: valor` e `ordem` numérica); sem nenhuma nota, os valores das definições, os
     * da pessoa e depois os das relações, na ordem (o primeiro é a ordem 1).
     * Por quê: A1 do mapa da v0: a pasta deixa de ser constante, e um cofre novo, que ainda não tem as
     * notas de valor, roda pelos valores que a pessoa disse na aba ou na inicialização.
     */
    private valoresFundamentais(): ValorFundamental[] {
        const definicoes = definicoesDe(this.plugin);
        const pasta = definicoes.pastas.valores;
        const dasNotas = (this.app.vault.getMarkdownFiles?.() || [])
            .filter((file: any) => String(file.path).startsWith(`${pasta}/`))
            .map((file: any) => ({ file, fm: this.app.metadataCache?.getFileCache?.(file)?.frontmatter || {} }))
            .filter(({ fm }: any) => fm.type === 'valor' && Number.isFinite(Number(fm.ordem)))
            .map(({ file, fm }: any) => ({ nome: file.basename, ordem: Number(fm.ordem) }));
        if (dasNotas.length) return dasNotas;
        return [...definicoes.valores, ...definicoes.valores_relacoes].map((v, i) => ({ nome: v.nome, ordem: i + 1 }));
    }

    /**
     * O que faz: o par de valores de uma semana (`AAAA-Www`): a sugestão (o sorteio com
     * peso pela ordem do trimestre, sem repetir a semana anterior, fixo para a semana;
     * `valorSemana.ts`), o que a nota já tem e o padrão do 🌳 (o da nota; onde ela não
     * tem, a sugestão). As listas são `valores` e `valores_relacoes` da nota do trimestre
     * da semana; os pesos, `pesos.valor_da_semana` da tabela única.
     * Uso: o passo `sugestaoDaSemana` do 🌳 e a Week (`await nucleo.parDaSemana(semana)`).
     * Semana ilegível → `null`.
     */
    async parDaSemana(semana: string): Promise<ParDaSemanaLido | null> {
        const week = String(semana ?? '').trim();
        const bounds = ehSemana(week) ? weekBounds(week) : null;
        if (!bounds) return null;
        const trimestre = quarterOfWeek(week);
        const qfm = trimestre ? this.frontmatterOf(`${QUARTER_FOLDER}/${trimestre}.md`) : {};
        const table = await this.readJson(DECISION_WEIGHTS_PATH);
        const { pesos, problemas } = table.erro ? { pesos: [], problemas: [table.erro] } : pesosDaTabela(table.data);
        const semanas = trimestre ? quarterWeeks(trimestre) : [];
        const primeira = semanas.length ? weekBounds(semanas[0]) : null;
        const antesDaPrimeira = primeira ? this.parDaNota(weekOf(shiftIso(primeira.start, -7))) : null;
        const { sugestao, anterior } = parEmCadeia(week, semanas, antesDaPrimeira, s => this.parDaNota(s), {
            valores: qfm.valores, relacoes: qfm.valores_relacoes, pesos, seis: this.valoresFundamentais(),
        });
        const daNota = this.parDaNota(week);
        const padrao = { valor: daNota?.valor || sugestao.valor, relacao: daNota?.relacao || sugestao.relacao };
        return { semana: week, trimestre, sugestao, anterior, daNota, padrao, problemas };
    }

    /**
     * O que faz: as Days de `desde` a `ate` (inclusivos), com o texto e o frontmatter.
     * Só as notas `AAAA-MM-DD.md` da pasta das Days; o texto vem do cache do vault.
     */
    async daysBetween(desde: string, ate: string): Promise<DayRead[]> {
        const files = (this.app.vault.getMarkdownFiles?.() || [])
            .filter((file: any) => String(file.path).startsWith(`${DAY_FOLDER}/`)
                && DIA.test(file.basename) && file.basename >= desde && file.basename <= ate);
        const out: DayRead[] = [];
        for (const file of files) {
            let text = '';
            try {
                text = await (this.app.vault.cachedRead ? this.app.vault.cachedRead(file) : this.app.vault.read(file));
            } catch (e) {
                text = '';
            }
            out.push({ date: file.basename, text, campos: this.app.metadataCache?.getFileCache?.(file)?.frontmatter || {} });
        }
        return out;
    }

    /**
     * O que faz: os campos de cada protocolo (`fase_uso` e `uso_recente`) para o domínio
     * `protocolos`, com o uso dos últimos 14 dias até `hoje` (`AAAA-MM-DD`).
     * Entra: os ids e quem acha a definição de um id (o gerente de protocolos).
     */
    async camposDosProtocolos(ids: string[], defOf: (id: string) => any, hoje: string): Promise<Record<string, Record<string, any>>> {
        const { desde, ate } = usoRecenteJanela(hoje);
        const days = desde ? await this.daysBetween(desde, ate) : [];
        const out: Record<string, Record<string, any>> = {};
        for (const id of ids || []) out[id] = protocolCampos(defOf(id), days, defOf);
        return out;
    }

    /**
     * O que faz: as rotas do 🧭 de uma semana (`AAAA-Www`), por situação, com a linha do
     * 📨 ("🧭 Rotas da semana"). Semana ilegível → `null`.
     */
    async rotasDaSemana(semana: string): Promise<(RouteSummary & { linha: string }) | null> {
        const limites = weekBounds(String(semana ?? ''));
        if (!limites) return null;
        const registros = await new RouteLogService(this.app).registros(limites.start, limites.end);
        const resumo = resumoRotas(registros, limites.start, limites.end);
        return { ...resumo, linha: linhaRotas(resumo) };
    }
}
