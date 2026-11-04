/**
 * O leitor da Missão: lê do cofre a `MissaoEntrada`, escuta só o que importa e entrega o
 * modelo puro de cada versão.
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, 3.7). Não usa o snapshot do Mission
 * Control (cache de 15 s, lê o corpo das tarefas e até 60 canvas, só as abertas): a Missão
 * precisa das concluídas e do frontmatter das notas de período, e nada mais. Lê o índice
 * das TaskNotes, os projetos pelas pastas do portfólio (a mesma varredura do snapshot,
 * `100 - AREAS/<área>/100 - PROJECTS/<coluna>/<projeto>` e `200 - DEPARTMENTS`, com o
 * canvas pelo resolvedor único do gerente), o frontmatter das Days, Weeks e Quarterlies,
 * das cidades e países, das pessoas, da visão, da reserva, das ideias e da Caixa de
 * entrada, os hábitos pela função pura do tracker, e as tabelas dos modelos dos tipos
 * (`Config/dominios/`: os estados da tarefa e do projeto, o `legado` da semana, do
 * trimestre e da SMART; Passo 0, 0b e 0f). Escuta o `changed` do metadataCache
 * e o `rename`/`delete` do vault só nas pastas que importam, a ligação nova do canvas
 * (`dfm:link-changed`) e o fim de um protocolo (`dfm:protocol-complete`); espera 250 ms e
 * passa à versão seguinte. O modelo de uma versão é montado quando alguém pede, uma vez.
 *
 * As coleções dos ramos (P10b): o leitor lê os ramos de `Config/ramos/` e, de cada fonte
 * das coleções delas, as notas do `type` dela na casa do protocolo dono (a `targetFolder`),
 * como já faz com as cidades e a visão; o modelo de cada ramo recebe as coleções dele.
 *
 * Só lê: nada aqui grava no cofre.
 * Inspeção: `await app.plugins.plugins['dfm-system'].board.missao.modelo()`.
 * Prova: tests/missao/missaoService.test.ts.
 */
import { TFile, TFolder, type App } from 'obsidian';
import { HABIT_TRACKER_FOLDER, parseHabit } from '../engine/habits';
import { focoDoTrimestre, linkNames, temporadaFrom } from '../engine/temporada';
import { declaredNextAction } from '../engine/proximaAcao';
import { triageCandidates, DEFAULT_INBOX_FOLDER } from '../engine/inboxRules';
import type { TaskRecord } from '../tasks/taskRecord';
import {
    CASAS_PADRAO, caminhoImporta, dentro, entradaVazia, excluido, periodoDaNota,
    type CasasDaMissao, type MarcaDoRamo, type MissaoEntrada, type NotaComCampos, type ParDaSemana, type ProjetoEntrada,
} from './entrada';
import { modeloDaMissao } from './borboleta';
import type { ItemDaTriagem, MissaoFiltros, MissaoModelo } from './tipos';
import { comPropostas, tiposDaIdeia } from './triagem';
import { filtrosPadrao, type ContextoDosFiltros } from './filtros';
import { addWeeks, chaveDeHoje } from './tempo';
import { quarterWeeks } from '../engine/calendario';
import { DOMAIN_MODELS_FOLDER, parseDomainModel, type DomainModel, type DomainState } from '../engine/domainModel';
import { chavesDoLegado, tabelasVazias, type TabelasDaMissao } from './estados';
import { DECISION_WEIGHTS_PATH, dayOf, type TaskScore } from '../engine/decisionWeights';
import { parsePanelWeights } from '../engine/panelWeights';
import { CAMPOS_DO_COMANDO } from '../engine/commitmentLeft';
import { isRecordPathCounted, matchesRecord } from '../engine/records';
import { EXPOSICAO_TIPO } from '../engine/exposicoes';
import { declaracoesDosModelos } from './sinais';
import { chaveDaFonte } from './colecoes';
import { lerRamoPrincipal, PASTA_DOS_RAMOS, type RamoPrincipal } from './ramoPrincipal';
import type { Papel, TabelaDosPapeis } from '../engine/papeisDeProtocolo';
import { DEFINICOES_PADRAO } from '../definicoes';

/** O domínio das estadias (30/10): a casa e o `type` vêm do modelo dele, nunca daqui. */
export const DOMINIO_DA_ESTADIA = 'estadia';

/** A espera depois do último aviso do cofre (arquitetura 3.7). */
export const ESPERA_MS = 250;

/** Os campos de cada nota de período que a Missão lê (o resto do frontmatter não entra). */
const CAMPOS_DO_DIA = ['cidade', 'pessoas', 'entrou', 'saiu'];
/** O que o ▶️ e o 🌙 gravam na Day (02/11): o Comando do Dia e o compromisso deixado (`CAMPOS_DO_COMANDO`, do motor). */
const CAMPOS_DO_DIA_COM_O_COMANDO = [...CAMPOS_DO_DIA, ...CAMPOS_DO_COMANDO];
const CAMPOS_DA_SEMANA = ['bloco_sagrado', 'status', 'valor_semana', 'valor_relacao'];
const CAMPOS_DO_TRIMESTRE = ['theme'];

/**
 * Os papéis donos de cada casa: a pasta é o `targetFolder` do protocolo que faz o papel (mudar a
 * casa é mudar o protocolo); o id vem da tabela (`idDoPapel`, a vigente; sem ela, a dos padrões da v0).
 */
export const PAPEIS_DAS_CASAS: ReadonlyArray<[keyof CasasDaMissao, Papel]> = [
    ['visao', 'visao'], ['cidades', 'criar_cidade'], ['paises', 'criar_pais'],
    ['pessoas', 'registrar_pessoa'], ['ideias', 'capturar_ideia'],
];

/** O que o leitor usa do plugin e do quadro (um objeto fino, para o teste não precisar do plugin inteiro). */
export interface DependenciasDoLeitor {
    app: App;
    tarefas: () => TaskRecord[];
    /** O caminho do canvas de um projeto pelo resolvedor único (`projectCanvasManager.canvasPathFor`). */
    canvasDoProjeto: (p: { name: string; path: string }) => string | null;
    /** O par de valores de uma semana (`nucleo.parDaSemana`). */
    parDaSemana: (semana: string) => Promise<{ daNota: { valor: string | null; relacao: string | null } | null; padrao: { valor: string | null; relacao: string | null } } | null>;
    pastaDaCaixa: () => string;
    /** A nota da reserva (`definicoes.arquivos.reserva`); vazia ou ausente = a reserva desligada. */
    notaDaReserva?: () => string;
    /** As pastas do TaskNotes (`tasksFolder`, `archiveFolder`); `null` = as de sempre. */
    pastasDasTarefas: () => string[] | null;
    /** A pasta dos protocolos (`folderProtocols` do plugin). */
    pastaDosProtocolos: () => string;
    /** Lê um arquivo do cofre (o JSON dos protocolos donos das casas). */
    lerArquivo: (path: string) => Promise<string>;
    /**
     * A tabela vigente dos papéis (`ProtocolManager.tabelaDosPapeis`), sem conferir a carga: a
     * casa se lê do arquivo do protocolo, que pode vir antes da carga. Sem ela, a dos padrões da v0.
     */
    tabelaDosPapeis?: () => TabelaDosPapeis | undefined;
    /** O registro de eventos do plugin (desligados no unload). */
    registrarEvento: (ref: any) => void;
    /**
     * Os pesos da tabela única de cada tarefa aberta (os pontos e os motivos, `scoresByPath`),
     * por caminho; `null` = sem a árvore do agora (a triagem fica na ordem do prazo).
     */
    pesos?: (hoje: string) => Promise<ReadonlyMap<string, TaskScore> | null>;
    /** As propostas do agente que esperam na triagem (02/11/2026, `board.propostas`); sem ela, nenhuma. */
    propostas?: () => readonly ItemDaTriagem[];
    /** O relógio: hoje em `AAAA-MM-DD`, no fuso local; o lugar o dá (`hosts/relogio.ts`), os testes dão o deles. */
    hoje: () => string;
    setTimer?: (fn: () => void, ms: number) => any;
    clearTimer?: (id: any) => void;
}

const pick = (fm: Record<string, unknown>, keys: readonly string[]) => {
    const out: Record<string, unknown> = {};
    for (const k of keys) if (fm[k] !== undefined) out[k] = fm[k];
    return out;
};

export class MissaoService {
    private versao = 1;
    private entradaLida: { versao: number; hoje: string; entrada: MissaoEntrada } | null = null;
    private lendo: Promise<MissaoEntrada> | null = null;
    private modelos = new Map<string, MissaoModelo>();
    private timer: any = null;
    private ouvintes = new Set<(versao: number) => void>();
    /** As casas da última leitura (as de sempre até a primeira). */
    private casasLidas: CasasDaMissao = CASAS_PADRAO;
    /** As fontes das coleções dos ramos, com a casa de cada uma (a última leitura). */
    private fontesLidas: Array<{ chave: string; pasta: string; type: string }> = [];
    /** As marcas dos ramos da última leitura da pasta (02/11, `recorte.marca`), lidas junto com as fontes. */
    private marcasLidas: MarcaDoRamo[] = [];
    /** Os pesos de uma versão e de um dia (calculados uma vez, §9.2). */
    private pesosLidos: { chave: string; pesos: Promise<ReadonlyMap<string, TaskScore> | null> } | null = null;

    constructor(private readonly deps: DependenciasDoLeitor) {}

    /** O que faz: liga as escutas do cofre (só as pastas que importam) e dos dois avisos do sistema. */
    registrar(): void {
        const { app } = this.deps;
        const casas = () => this.casasSincronas();
        this.deps.registrarEvento(app.metadataCache.on('changed', (file: TFile) => {
            if (caminhoImporta('mudou', file?.path, casas())) this.agendar();
        }));
        this.deps.registrarEvento(app.vault.on('rename', (file: any, oldPath: string) => {
            if (caminhoImporta('moveu', file?.path, casas()) || caminhoImporta('moveu', oldPath, casas())) this.agendar();
        }));
        this.deps.registrarEvento(app.vault.on('delete', (file: any) => {
            if (caminhoImporta('moveu', file?.path, casas())) this.agendar();
        }));
        this.deps.registrarEvento(app.workspace.on('dfm:link-changed' as any, () => this.agendar()));
        this.deps.registrarEvento(app.workspace.on('dfm:protocol-complete' as any, () => this.agendar()));
    }

    /** O que faz: a versão de agora (sobe uma vez a cada rajada de mudanças, depois da espera). */
    versaoAtual(): number {
        return this.versao;
    }

    /** O que faz: avisa quem assina a cada versão nova; devolve o desligar. */
    assinar(fn: (versao: number) => void): () => void {
        this.ouvintes.add(fn);
        return () => this.ouvintes.delete(fn);
    }

    /** O que faz: espera 250 ms depois do último aviso e passa à versão seguinte (a entrada é relida no próximo pedido). */
    agendar(): void {
        const clear = this.deps.clearTimer ?? ((id: any) => clearTimeout(id));
        const set = this.deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
        if (this.timer !== null) clear(this.timer);
        this.timer = set(() => {
            this.timer = null;
            this.versao++;
            this.modelos.clear();
            for (const fn of [...this.ouvintes]) {
                try { fn(this.versao); } catch (e) { console.error('DFM Missão: um ouvinte falhou', e); }
            }
        }, ESPERA_MS);
    }

    /** O que faz: o modelo da versão de agora para os filtros dados (padrão: os da página); montado uma vez. */
    async modelo(filtros: MissaoFiltros = filtrosPadrao('pagina'), contexto: Partial<ContextoDosFiltros> = {}, ramoPrincipal: Pick<RamoPrincipal, 'id' | 'colecoes' | 'recorte'> | null = null): Promise<MissaoModelo> {
        const entrada = await this.entrada();
        const key = `${this.versao}|${entrada.hoje}|${JSON.stringify(filtros)}|${JSON.stringify(contexto)}|${ramoPrincipal ? JSON.stringify([ramoPrincipal.id, ramoPrincipal.colecoes, ramoPrincipal.recorte]) : ''}`;
        const cached = this.modelos.get(key);
        if (cached) return cached;
        const pesos = await this.pesosDaVersao(entrada.hoje);
        const modelo = modeloDaMissao(entrada, {
            versao: this.versao, filtros, contexto, ramoPrincipal,
            pontos: pesos ? new Map([...pesos].map(([caminho, p]) => [caminho, p.pontos])) : null,
            motivos: pesos ? new Map([...pesos].map(([caminho, p]) => [caminho, p.motivos])) : null,
        });
        const propostas = this.deps.propostas?.() ?? [];
        if (propostas.length) modelo.triagem = comPropostas(modelo.triagem, propostas);
        if (this.modelos.size > 8) this.modelos.clear();
        this.modelos.set(key, modelo);
        return modelo;
    }

    /**
     * O que faz: os pesos da tabela única da versão de agora (uma vez por versão e por dia).
     * Erro e ataque: a árvore do agora que falha deixa a Missão sem pesos (a ordem do prazo e
     * sem "Por que agora"), com o motivo no console; nada é gravado.
     */
    private pesosDaVersao(hoje: string): Promise<ReadonlyMap<string, TaskScore> | null> {
        const chave = `${this.versao}|${hoje}`;
        if (this.pesosLidos?.chave !== chave) {
            const ler = this.deps.pesos;
            this.pesosLidos = {
                chave,
                pesos: ler ? ler(hoje).catch(e => { console.error('DFM Missão: os pesos não foram calculados', e); return null; }) : Promise.resolve(null),
            };
        }
        return this.pesosLidos.pesos;
    }

    /** O que faz: a entrada da versão de agora; relida só quando a versão ou o dia mudam. */
    async entrada(): Promise<MissaoEntrada> {
        const hoje = this.deps.hoje();
        const lida = this.entradaLida;
        if (lida && lida.versao === this.versao && lida.hoje === hoje) return lida.entrada;
        if (this.lendo) return this.lendo;
        const versao = this.versao;
        this.lendo = this.lerEntrada(hoje).then(entrada => {
            this.entradaLida = { versao, hoje, entrada };
            return entrada;
        }).finally(() => { this.lendo = null; });
        return this.lendo;
    }

    /** O que faz: desliga a espera e os ouvintes (o plugin chama ao descarregar). */
    destruir(): void {
        if (this.timer !== null) (this.deps.clearTimer ?? ((id: any) => clearTimeout(id)))(this.timer);
        this.timer = null;
        this.ouvintes.clear();
        this.modelos.clear();
    }

    /* ------------------------------------------------------------ leitura */

    private fm(file: TFile | null): Record<string, any> {
        return (file && this.deps.app.metadataCache.getFileCache(file)?.frontmatter) || {};
    }

    private arquivo(path: string): TFile | null {
        const f = this.deps.app.vault.getAbstractFileByPath(path);
        return f instanceof TFile ? f : null;
    }

    /** O que faz: as casas que se sabem sem ler nada (as do plugin e do TaskNotes; as dos protocolos, da última leitura). */
    casasSincronas(): CasasDaMissao {
        const tarefas = (this.deps.pastasDasTarefas() ?? []).filter(Boolean);
        return {
            ...this.casasLidas,
            tarefas: tarefas.length ? tarefas : CASAS_PADRAO.tarefas,
            // Sem configuração própria (o `folderReview` do plugin é outra pasta): a de sempre,
            // a mesma do núcleo e dos canvas de período.
            daymiss: CASAS_PADRAO.daymiss,
            caixa: this.deps.pastaDaCaixa() || CASAS_PADRAO.caixa,
            // A nota da reserva é opcional (A6): sem a definição, nenhuma (nada se lê nem avisa).
            reserva: this.deps.notaDaReserva?.() || CASAS_PADRAO.reserva,
            habitos: HABIT_TRACKER_FOLDER,
            ramosPrincipais: [...new Set(this.fontesLidas.map(f => f.pasta))],
        };
    }

    /**
     * O que faz: as fontes das coleções de todos os ramos da pasta, cada uma com a casa (a
     * `targetFolder` do protocolo dono) e o `type`.
     * Por quê: P10b; a casa de uma nota é a do protocolo que a grava, como nas cidades e na
     * visão (mudar a casa é mudar o protocolo), e o `type` só confirma.
     * Erro e ataque: o ramo que não se lê, a fonte cujo protocolo não se lê ou não tem
     * `targetFolder` ficam de fora (com o motivo no console); nada é gravado.
     */
    async lerFontesDosRamos(): Promise<Array<{ chave: string; pasta: string; type: string }>> {
        const pasta = this.deps.app.vault.getAbstractFileByPath(PASTA_DOS_RAMOS);
        const arquivos = pasta instanceof TFolder ? pasta.children.filter((f): f is TFile => f instanceof TFile && f.extension === 'json').map(f => f.path).sort() : [];
        const dir = (this.deps.pastaDosProtocolos() || '200 - FUNCTIONS/Protocolos').replace(/\/+$/, '');
        const pastas = new Map<string, string | null>();
        const out: Array<{ chave: string; pasta: string; type: string }> = [];
        const marcas: MarcaDoRamo[] = [];
        for (const caminho of arquivos) {
            let ramoPrincipal: RamoPrincipal | null = null;
            try { ramoPrincipal = lerRamoPrincipal(JSON.parse(await this.deps.lerArquivo(caminho))).ramoPrincipal; } catch (e) { console.warn(`DFM Missão: o ramo ${caminho} não se lê`, e); }
            // A marca do recorte (02/11): o dia e a semana das tarefas dele a mostram em toda a Missão.
            if (ramoPrincipal?.recorte.marca) marcas.push({ marca: ramoPrincipal.recorte.marca, titulo: ramoPrincipal.titulo, recorte: { tags: ramoPrincipal.recorte.tags, projetos: ramoPrincipal.recorte.projetos } });
            for (const fonte of (ramoPrincipal?.colecoes ?? []).flatMap(c => c.fontes)) {
                // A casa dita direto (03/11, os bancos antigos de roteiros): a pasta, ou a própria nota, só leitura.
                if (fonte.casa) {
                    const chave = chaveDaFonte(fonte);
                    if (!out.some(f => f.chave === chave)) out.push({ chave, pasta: fonte.casa, type: fonte.type });
                    continue;
                }
                // A fonte de um modelo (30/10): a casa é a `candidatos.pasta` dele, e o `type` confirma.
                if (fonte.dominio) {
                    const chave = `@${fonte.dominio}`;
                    if (!pastas.has(chave)) {
                        let folder: string | null = null;
                        try { folder = String(JSON.parse(await this.deps.lerArquivo(`${DOMAIN_MODELS_FOLDER}/${fonte.dominio}.json`))?.candidatos?.pasta ?? '').trim().replace(/\/+$/, '') || null; } catch (e) { folder = null; }
                        if (!folder) console.warn(`DFM Missão: a fonte ${chaveDaFonte(fonte)} de ${caminho} fica de fora (o modelo não diz a casa)`);
                        pastas.set(chave, folder);
                    }
                    const folder = pastas.get(chave);
                    if (folder && !out.some(f => f.chave === chaveDaFonte(fonte))) out.push({ chave: chaveDaFonte(fonte), pasta: folder, type: fonte.type });
                    continue;
                }
                if (!fonte.protocolo) continue;
                if (!pastas.has(fonte.protocolo)) {
                    let folder: string | null = null;
                    try { folder = String(JSON.parse(await this.deps.lerArquivo(`${dir}/${fonte.protocolo}.json`))?.targetFolder ?? '').trim().replace(/\/+$/, '') || null; } catch (e) { folder = null; }
                    if (!folder) console.warn(`DFM Missão: a fonte ${chaveDaFonte(fonte)} de ${caminho} fica de fora (o protocolo não diz a casa)`);
                    pastas.set(fonte.protocolo, folder);
                }
                const folder = pastas.get(fonte.protocolo);
                const chave = chaveDaFonte(fonte);
                if (folder && !out.some(f => f.chave === chave)) out.push({ chave, pasta: folder, type: fonte.type });
            }
        }
        this.fontesLidas = out;
        this.marcasLidas = marcas;
        return out;
    }

    /**
     * O que faz: as casas de cada coisa: as do plugin, as do TaskNotes e o `targetFolder`
     * dos protocolos donos (o 🔭, o ✈️, o 🏳️, o 👤, o 💡). O protocolo que não se lê deixa a
     * casa de sempre.
     */
    async lerCasas(): Promise<CasasDaMissao> {
        const casas: CasasDaMissao = { ...this.casasSincronas() };
        const dir = (this.deps.pastaDosProtocolos() || '200 - FUNCTIONS/Protocolos').replace(/\/+$/, '');
        for (const [chave, papel] of PAPEIS_DAS_CASAS) {
            const id = (this.deps.tabelaDosPapeis?.() ?? DEFINICOES_PADRAO.protocolos_por_papel)[papel];
            if (!id) continue;
            try {
                const folder = String(JSON.parse(await this.deps.lerArquivo(`${dir}/${id}.json`))?.targetFolder ?? '').trim();
                if (folder) (casas as any)[chave] = folder.replace(/\/+$/, '');
            } catch (e) {
                // Sem o protocolo, fica a casa de sempre.
            }
        }
        this.casasLidas = casas;
        return casas;
    }

    /**
     * O que faz: lê a entrada de hoje: as TaskNotes, os projetos, a Temporada e o foco, as
     * notas de período, os lugares, as pessoas, a visão, a reserva, os hábitos, a Caixa de
     * entrada, as ideias e o par de valores das semanas perto de hoje.
     * Erro e ataque: nota sem frontmatter lê vazio; pasta que falta dá lista vazia; o par
     * que o núcleo não lê fica de fora; nada é gravado.
     */
    async lerEntrada(hoje: string): Promise<MissaoEntrada> {
        const { app } = this.deps;
        const fontes = await this.lerFontesDosRamos();
        const casas = await this.lerCasas();
        const entrada = entradaVazia(hoje);
        entrada.casas = casas;
        const notasDosRamos: Record<string, NotaComCampos[]> = {};
        entrada.tabelas = await this.lerTabelas();
        // Os pesos da direção (02/11): `painel_direcao` da tabela única; o arquivo que não se lê deixa a direção sem pesos.
        try { entrada.direcao = parsePanelWeights(JSON.parse(await this.deps.lerArquivo(DECISION_WEIGHTS_PATH))).weights.direcao; } catch (e) { console.warn('DFM Missão: os pesos da direção não se leem', e); }
        const legado = entrada.tabelas.legado;
        // As estadias (30/10): a casa e o `type` são os do modelo dela.
        const daEstadia = entrada.tabelas.tipos.find(m => m.dominio === DOMINIO_DA_ESTADIA) ?? null;
        const estadias: NotaComCampos[] = [];
        entrada.tarefas = this.deps.tarefas();
        const { projetos, areas } = this.lerPortfolio(casas);
        entrada.projetos = projetos;
        entrada.areas = areas;

        const quarter = chaveDeHoje('trimestre', hoje);
        const qfm = this.fm(this.arquivo(`${casas.daymiss}/Quarterly/${quarter}.md`));
        entrada.temporada = temporadaFrom(qfm);
        entrada.foco = linkNames(qfm.projetos_foco).length ? focoDoTrimestre(qfm) : [];

        const longTerm = `${casas.daymiss}/Long-Term`;
        const daIdeia = tiposDaIdeia(this.deps.tabelaDosPapeis?.() ?? DEFINICOES_PADRAO.protocolos_por_papel);
        const longos: Array<{ caminho: string; nome: string }> = [];
        const canvasPorNome = new Map<string, string>();
        for (const file of app.vault.getFiles()) {
            const path = file.path;
            if (excluido(path)) continue;
            if (file.extension === 'canvas') {
                // O canvas da semana e o do trimestre não se leem mais: aposentados em 02/11/2026, a Missão é a tela deles.
                if (!canvasPorNome.has(file.basename)) canvasPorNome.set(file.basename, path);
                continue;
            }
            if (file.extension !== 'md') continue;
            const fm = this.fm(file);
            const type = String(fm.type ?? '').trim();
            const nota: NotaComCampos = { caminho: path, nome: file.basename, campos: fm };
            // O registro `exposicao` mora onde o protocolo o grava (a nota dele ou a Day): a marca 🎭 do dia (P9).
            if (fm.registro !== undefined && isRecordPathCounted(path) && matchesRecord(fm, { tipo: EXPOSICAO_TIPO })) {
                (entrada.exposicoes ??= []).push({ caminho: path, data: dayOf(fm.data), trilha: String(fm.trilha ?? '').trim() || null });
            }
            // As coleções dos ramos (P10b): a nota do `type` da fonte, na casa do protocolo dono.
            // A casa dita direto pode ser a própria nota (03/11: o kit de criativos dos afiliados, no meio da pasta do projeto).
            for (const f of fontes) if (type === f.type && (dentro(path, f.pasta) || path === f.pasta)) (notasDosRamos[f.chave] ??= []).push(nota);
            // Cada coisa é lida da casa dela; o `type` só confirma.
            const periodo = periodoDaNota(path, casas);
            if (periodo) {
                const campos = pick(fm, periodo.pasta === 'Day' ? CAMPOS_DO_DIA_COM_O_COMANDO : periodo.pasta === 'Week' ? CAMPOS_DA_SEMANA : CAMPOS_DO_TRIMESTRE);
                const target = periodo.pasta === 'Day' ? entrada.dias : periodo.pasta === 'Week' ? entrada.semanas : entrada.trimestres;
                // Modelo antigo: sem `type`, ou com alguma chave do `legado` do tipo (0f).
                const lista = periodo.pasta === 'Week' ? legado.semana : periodo.pasta === 'Quarterly' ? legado.trimestre : [];
                const antigo = !type || chavesDoLegado(fm, lista).length > 0;
                target[periodo.chave] = { caminho: path, campos, ...(antigo ? { modeloAntigo: true } : {}) };
                continue;
            }
            if (dentro(path, casas.habitos)) entrada.habitos.push(parseHabit(path, fm));
            else if (casas.reserva && path === casas.reserva) entrada.reserva = nota;
            else if (dentro(path, longTerm)) { if (type === 'longterm_note' && String(fm.status ?? '') !== 'closed') longos.push({ caminho: path, nome: file.basename }); }
            else {
                if (dentro(path, casas.cidades) && type === 'hub_cidade') entrada.cidades.push(nota);
                if (daEstadia && dentro(path, daEstadia.candidatos.pasta) && type === daEstadia.candidatos.type) estadias.push(nota);
                if (dentro(path, casas.paises) && type === 'hub_pais') entrada.paises.push(nota);
                if (dentro(path, casas.visao) && type === 'visao') entrada.visoes.push(nota);
                if (dentro(path, casas.pessoas) && type === 'person_profile') entrada.pessoas.push(nota);
                if (dentro(path, casas.ideias) && daIdeia.includes(type)) entrada.ideias.push(nota);
                // O rascunho não tem casa própria (nasce na pasta do protocolo ou na Caixa de
                // entrada): conta pelo tipo, fora do arquivo.
                if (type === 'rascunho_protocolo' && !dentro(path, '900 - ARCHIVE')) entrada.rascunhos.push(nota);
            }
        }
        entrada.notasDosRamos = notasDosRamos;
        entrada.estadias = estadias;
        entrada.marcasDosRamos = [...this.marcasLidas];
        // A SMART do modelo velho (`legado` de smart.json): "modelo antigo", e não é reescrita (0f).
        entrada.tarefasAntigas = entrada.tarefas
            .filter(r => r.type === 'tarefa_smart' && chavesDoLegado(this.fm(this.arquivo(r.path)), legado.smart).length > 0)
            .map(r => r.path);
        const lt = longos.sort((a, b) => a.caminho.localeCompare(b.caminho))[0] ?? null;
        entrada.longoPrazo = lt ? { ...lt, canvas: canvasPorNome.get(lt.nome) ?? null } : null;
        entrada.caixaDeEntrada = triageCandidates(app.vault.getMarkdownFiles(), casas.caixa || DEFAULT_INBOX_FOLDER)
            .filter(f => !excluido(f.path))
            .map(f => ({ caminho: f.path, nome: f.basename, campos: {} }));

        // O par de valores das semanas do trimestre de hoje e das duas seguintes, pelo núcleo.
        const week = chaveDeHoje('semana', hoje);
        const weeks = [...new Set([...quarterWeeks(quarter), addWeeks(week, 1), addWeeks(week, 2)])];
        for (const w of weeks) {
            try {
                const par = await this.deps.parDaSemana(w);
                if (!par) continue;
                const daNota = !!par.daNota && !!(par.daNota.valor || par.daNota.relacao);
                const fonte = daNota ? par.daNota! : par.padrao;
                const out: ParDaSemana = { valor: fonte.valor ?? null, relacao: fonte.relacao ?? null, daNota };
                entrada.pares[w] = out;
            } catch (e) {
                // O par que não se lê fica de fora; a semana segue sem ele.
            }
        }
        return entrada;
    }

    /**
     * O que faz: as tabelas dos modelos dos tipos: os estados da tarefa e do projeto e o
     * `legado` da semana, do trimestre e da SMART (`Config/dominios/<tipo>.json`).
     * Por quê: o estado e o "modelo antigo" vêm da tabela, não do código (Passo 0, 0b).
     * Erro e ataque: o modelo que não se lê, ou não passa na forma, deixa a tabela vazia
     * (o juiz `audit_architecture.py` acusa o modelo), e fica fora dos modelos de tipo;
     * nada é gravado.
     */
    /** O que faz: a tabela de estados da tarefa já lida (vazia antes da primeira leitura), para o contexto dos gestos. */
    estadosDaTarefa(): readonly DomainState[] {
        return this.entradaLida?.entrada.tabelas?.tarefa ?? [];
    }

    async lerTabelas(): Promise<TabelasDaMissao> {
        const ler = async (dominio: string): Promise<DomainModel | null> => {
            try {
                return parseDomainModel(JSON.parse(await this.deps.lerArquivo(`${DOMAIN_MODELS_FOLDER}/${dominio}.json`)), dominio).modelo;
            } catch (e) {
                return null;
            }
        };
        const [tarefa, projeto, semana, trimestre, smart] = await Promise.all(['tarefa', 'projeto', 'semana', 'trimestre', 'smart'].map(ler));
        const tabelas = tabelasVazias();
        tabelas.tarefa = tarefa?.estados ?? [];
        tabelas.projeto = projeto?.estados ?? [];
        tabelas.legado = { semana: semana?.legado ?? [], trimestre: trimestre?.legado ?? [], smart: smart?.legado ?? [] };
        // Os modelos de tipo (P5): todo modelo da pasta com `type` nos candidatos e campos ou
        // legado; o painel do nó acha o do nó pelo `type` da nota, sem nome de tipo no código.
        const pasta = this.deps.app.vault.getAbstractFileByPath(DOMAIN_MODELS_FOLDER);
        const nomes = pasta instanceof TFolder
            ? pasta.children.filter((f): f is TFile => f instanceof TFile && f.extension === 'json').map(f => f.basename).sort()
            : [];
        const tipos = await Promise.all(nomes.map(ler));
        tabelas.tipos = tipos.filter((m): m is DomainModel => !!m && !!m.candidatos.type && (m.campos.length > 0 || m.legado.length > 0));
        // As declarações de sinal (P10b): de todo modelo da pasta, com campos ou não.
        tabelas.sinais = declaracoesDosModelos(tipos.filter((m): m is DomainModel => !!m));
        return tabelas;
    }

    /**
     * O que faz: os projetos e departamentos pelas pastas do portfólio, com a área, a coluna,
     * a nota-índice, a central a que servem e o canvas.
     * Por quê: a mesma varredura do snapshot (`missionControl.collectPortfolio`) sem montar o
     * snapshot. A nota-índice é só a da casa: `<P>/<P>.md` (projeto e departamento), e a
     * central a que serve é o `projects` dela; `300 - ARCHIVES` e os modelos ficam de fora.
     */
    lerPortfolio(casas: CasasDaMissao = this.casasSincronas()): { projetos: ProjetoEntrada[]; areas: MissaoEntrada['areas'] } {
        const root = this.deps.app.vault.getAbstractFileByPath(casas.areas);
        const projetos: ProjetoEntrada[] = [];
        const areas: MissaoEntrada['areas'] = [];
        if (!(root instanceof TFolder)) return { projetos, areas };
        const existing = (path: string) => (this.arquivo(path) ? path : null);
        const add = (folder: TFolder, area: string, tipo: ProjetoEntrada['tipo'], fase: string) => {
            const nota = existing(`${folder.path}/${folder.name}.md`);
            const canvas = this.deps.canvasDoProjeto({ name: folder.name, path: folder.path });
            const fm = nota ? this.fm(this.arquivo(nota)) : {};
            // A próxima ação fixada na nota (02/11): o leitor do campo é o do motor (`declaredNextAction`).
            const proxima = declaredNextAction(fm);
            projetos.push({
                nome: folder.name, area, tipo, fase, pasta: folder.path, nota,
                serve: nota ? linkNames(fm.projects) : [],
                canvas: canvas && this.arquivo(canvas) ? canvas : null,
                ...(proxima ? { proxima } : {}),
            });
        };
        const folders = (parent: unknown): TFolder[] => (parent instanceof TFolder ? parent.children.filter((c): c is TFolder => c instanceof TFolder && !excluido(`${c.path}/x`)) : []);
        for (const areaFolder of folders(root)) {
            const area = areaFolder.name.replace(/^\d+\s*-\s*/, '').trim();
            areas.push({ nome: area, nota: existing(`${areaFolder.path}/000 - INDEX/README.md`), canvas: existing(`${areaFolder.path}/${area}.canvas`) });
            for (const column of folders(this.deps.app.vault.getAbstractFileByPath(`${areaFolder.path}/100 - PROJECTS`))) {
                for (const p of folders(column)) add(p, area, 'projeto', column.name);
            }
            for (const d of folders(this.deps.app.vault.getAbstractFileByPath(`${areaFolder.path}/200 - DEPARTMENTS`))) {
                if (!projetos.some(p => p.nome === d.name)) add(d, area, 'departamento', 'Departamento');
            }
        }
        return { projetos, areas };
    }
}
