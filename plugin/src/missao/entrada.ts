/**
 * A entrada da Missão: o que o leitor (`missaoService.ts`) tira do cofre e o modelo puro
 * (`src/missao/*`) recebe. Só dados, mais a regra de quais caminhos do cofre importam.
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, 3.1 e 3.7) separa o leitor do
 * modelo; o contrato entre os dois mora aqui, num lugar só, sem Obsidian. Os campos vêm
 * crus (o frontmatter como está) e cada módulo puro os lê pela função única dele
 * (`fieldNumber` no dinheiro, `linkTarget` nos lugares).
 *
 * Prova: tests/missao/missaoService.test.ts ("o que importa ao leitor").
 */
import type { Habit } from '../engine/habits';
import type { PanelDirectionWeights } from '../engine/panelWeights';
import type { TaskRecord } from '../tasks/taskRecord';
import { tabelasVazias, type TabelasDaMissao } from './estados';
import { DIA, SEMANA, TRIMESTRE } from './formatos';

/** Um projeto ou departamento, como o leitor o achou nas pastas do portfólio. */
export interface ProjetoEntrada {
    nome: string;
    /** O nome da área (`01 - Área A` → `Área A`); sem área, "Sem área". */
    area: string;
    tipo: 'projeto' | 'departamento';
    /** A coluna do portfólio (`2 - Active`…) ou `Departamento`. */
    fase: string;
    /** As notas que a nota do projeto aponta em `projects`: a central a que ele serve. */
    serve: string[];
    /** A pasta do projeto. */
    pasta: string;
    /** A nota-índice; `null` sem nota. */
    nota: string | null;
    /** O canvas, quando o arquivo existe (pelo resolvedor único do canvas de projeto). */
    canvas: string | null;
    /** A próxima ação fixada na nota (`proxima_acao_real`, `declaredNextAction`): o nome do link; sem o campo, vazio. */
    proxima?: string;
}

export interface AreaEntrada { nome: string; nota: string | null; canvas: string | null }

/** Uma nota de período (Day, Week, Quarterly) e os campos dela que a Missão lê. */
export interface NotaDePeriodo {
    caminho: string;
    /** O frontmatter cru, só os campos que a Missão usa. */
    campos: Record<string, unknown>;
    /**
     * A nota é do modelo antigo: existe sem `type` (as Days antigas), ou tem alguma chave do
     * `legado` do tipo dela (as Weeks e os trimestres antigos, Passo 0, 0f). Conta como nota
     * do período, marcada "modelo antigo"; nada se regrava.
     */
    modeloAntigo?: boolean;
}

/** O par de valores da semana como o núcleo o leu (`nucleo.parDaSemana`). */
export interface ParDaSemana {
    valor: string | null;
    relacao: string | null;
    /** `true` = o par está na nota da semana; `false` = é a sugestão do núcleo. */
    daNota: boolean;
}

/** Uma nota de lugar (cidade ou país), com o frontmatter cru. */
export interface NotaDeLugar { caminho: string; nome: string; campos: Record<string, unknown> }

/** Uma nota qualquer, com o frontmatter cru (visão, pessoa, ideia, reserva, Caixa de entrada). */
export interface NotaComCampos { caminho: string; nome: string; campos: Record<string, unknown> }

/**
 * A marca de um ramo (02/11, o ✈️ dos canvas da semana e do trimestre trazido à Missão): o emoji e o título do
 * ramo que a declara no recorte (`recorte.marca`), e o recorte dele (as tags e os projetos, a regra única de
 * `noRecorteDoRamo`). O dia e a semana em que uma tarefa do recorte cai mostram a marca em toda a Missão.
 */
export interface MarcaDoRamo { marca: string; titulo: string; recorte: { tags: readonly string[]; projetos: readonly string[] } }

export interface MissaoEntrada {
    /** `AAAA-MM-DD`: o relógio entra pela borda. */
    hoje: string;
    /** As casas de cada tipo de nota (de onde a Missão lê cada coisa). */
    casas: CasasDaMissao;
    /**
     * O índice inteiro das TaskNotes do plugin (abertas, concluídas e canceladas): as
     * unidades das funções únicas de contar, como o núcleo as passa. Os nós da Missão
     * saem só das que moram nas casas das tarefas (`tarefaEmCasa`).
     */
    tarefas: TaskRecord[];
    projetos: ProjetoEntrada[];
    areas: AreaEntrada[];
    /** As centrais do trimestre de hoje (`temporadaFrom`), na ordem da nota. */
    temporada: string[];
    /** A lista de foco do trimestre (`focoDoTrimestre`) quando a nota tem `projetos_foco`; senão vazia. */
    foco: string[];
    /** As notas de período que existem, pela chave (`AAAA-MM-DD`, `AAAA-Www`, `AAAA-Qn`). */
    dias: Record<string, NotaDePeriodo>;
    semanas: Record<string, NotaDePeriodo>;
    trimestres: Record<string, NotaDePeriodo>;
    /** O par de valores das semanas perto de hoje (as outras ficam sem par na entrada). */
    pares: Record<string, ParDaSemana>;
    cidades: NotaDeLugar[];
    paises: NotaDeLugar[];
    pessoas: NotaComCampos[];
    /** As notas `type: visao` da casa do 🔭 (as versões). */
    visoes: NotaComCampos[];
    /** O ciclo longo ativo (`type: longterm_note`, fora de `closed`); `null` sem ele. */
    longoPrazo: { caminho: string; nome: string; canvas: string | null } | null;
    /** A nota da reserva (pelo `type`); `null` sem ela. */
    reserva: NotaComCampos | null;
    habitos: Habit[];
    /** As notas da Caixa de entrada (pela regra da triagem antiga). */
    caixaDeEntrada: NotaComCampos[];
    /** As ideias (`type: idea` e o outro tipo de ideia que o leitor aceita) com o frontmatter cru. */
    ideias: NotaComCampos[];
    /**
     * Os rascunhos dos protocolos (`type: rascunho_protocolo`), onde estiverem fora do
     * arquivo: o motor os grava na pasta do protocolo ou na Caixa de entrada.
     */
    rascunhos: NotaComCampos[];
    /** Os registros `exposicao` (P9, as marcas 🎭 do dia): o dia e a trilha, onde estiverem fora da lixeira e dos modelos. */
    exposicoes?: Array<{ caminho: string; data: string; trilha: string | null }>;
    /**
     * As tabelas dos modelos dos tipos (Passo 0, 0b): os estados da tarefa e do projeto e
     * as chaves do modelo antigo. O leitor as lê de `Config/dominios/`; sem elas, vazias.
     */
    tabelas: TabelasDaMissao;
    /** As TaskNotes com alguma chave do `legado` da SMART (os caminhos): "modelo antigo" (0f). */
    tarefasAntigas: string[];
    /**
     * As notas das coleções que os ramos declaram (P10b), por fonte (`protocolo#type`, a
     * `chaveDaFonte`): lidas da casa do protocolo dono, só as do `type` dela.
     */
    notasDosRamos?: Record<string, NotaComCampos[]>;
    /**
     * As estadias (30/10): as notas do modelo da estadia (`Config/dominios/estadia.json`), lidas da casa
     * dele (a `candidatos.pasta`), só as do `type` dele; as que caem numa passagem aparecem dentro dela.
     */
    estadias?: NotaComCampos[];
    /**
     * Os pesos da direção da tarefa (02/11, o inventário da aposentadoria, itens 3 e 4): a categoria
     * `painel_direcao` da tabela única (`pesos_decisao.json`), lida pelo leitor; sem ela, nenhuma tarefa
     * tem direção (e o sinal da ação para fora que espera não aparece).
     */
    direcao?: PanelDirectionWeights;
    /** As marcas dos ramos (02/11): os ramos de `Config/ramos/` cujo recorte declara a `marca`; sem elas, nenhuma. */
    marcasDosRamos?: MarcaDoRamo[];
}

/**
 * O que faz: uma entrada vazia para hoje: o ponto de partida dos testes e do leitor.
 * Por quê: o leitor enche a entrada campo a campo, e o teste a monta com o que importa; um começo só.
 * Erro e ataque: nada a ler; as listas nascem vazias, e as tabelas, as vazias (`tabelasVazias`).
 * Prova: tests/missao/missaoService.test.ts.
 */
export function entradaVazia(hoje: string): MissaoEntrada {
    return {
        hoje, casas: CASAS_PADRAO, tarefas: [], projetos: [], areas: [], temporada: [], foco: [],
        dias: {}, semanas: {}, trimestres: {}, pares: {},
        cidades: [], paises: [], pessoas: [], visoes: [], longoPrazo: null, reserva: null,
        habitos: [], caixaDeEntrada: [], ideias: [], rascunhos: [], exposicoes: [], tabelas: tabelasVazias(), tarefasAntigas: [],
        notasDosRamos: {}, estadias: [],
    };
}

/* ------------------------------------------------------------------ as casas */

/**
 * A casa de cada coisa que a Missão lê. Cada tipo de nota é lido só da casa dele; o `type`
 * só confirma. Ler um `type` onde quer que a nota esteja dava nós falsos: os modelos
 * (`200 - FUNCTIONS/Models`, `Templates`) carregam `type` vivo, há iniciativas arquivadas
 * em `300 - ARCHIVES` e notas de desenho com `type: visao` em `305 - P&D` (inventário do
 * cofre, 27/10/2026).
 */
export interface CasasDaMissao {
    /** As pastas das TaskNotes (as do TaskNotes: `tasksFolder` e `archiveFolder`). */
    tarefas: string[];
    /** A raiz das notas de período (`Day`, `Week`, `Quarterly`, `Long-Term` dentro dela). */
    daymiss: string;
    /** As pastas do portfólio, dentro de cada área. */
    areas: string;
    caixa: string;
    ideias: string;
    pessoas: string;
    /** O `targetFolder` do 🔭 protocolo da visão. */
    visao: string;
    /** O `targetFolder` do ✈️ protocolo da cidade nova e do protocolo do país novo; vazio = o cofre não tem. */
    cidades: string;
    paises: string;
    /** A nota da reserva (`definicoes.arquivos.reserva`); vazia = o módulo da reserva desligado. */
    reserva: string;
    habitos: string;
    /** As casas das coleções dos ramos (P10b): a `targetFolder` de cada protocolo dono que um ramo declara. */
    ramosPrincipais?: string[];
}

/** As casas de hoje, quando a configuração não diz outra (o leitor lê a configuração). */
export const CASAS_PADRAO: CasasDaMissao = {
    tarefas: ['TaskNotes/Tasks', 'TaskNotes/Archive'],
    daymiss: '300 - RUNTIME/302 - Daymiss',
    areas: '100 - AREAS',
    caixa: '300 - RUNTIME/001 - INBOX',
    ideias: '500 - RESOURCES/Ideias',
    pessoas: '500 - RESOURCES/Pessoas',
    visao: '400 - MEMORY/400 - QUARTERLY/Visão',
    // As cidades e os países só têm casa quando o cofre tem o protocolo dono (o papel `criar_cidade`
    // e `criar_pais`): a pasta é o `targetFolder` dele (`MissaoService.lerCasas`).
    cidades: '',
    paises: '',
    reserva: '',
    habitos: '200 - FUNCTIONS/Habits/Tracker',
};

const semBarra = (p: string) => String(p ?? '').replace(/\/+$/, '');

/** O que faz: diz se um caminho está dentro de uma pasta (a própria pasta não conta). */
export function dentro(caminho: string, pasta: string): boolean {
    const base = semBarra(pasta);
    return !!base && String(caminho ?? '').startsWith(`${base}/`);
}

/** O que faz: diz se o arquivo está direto na pasta (sem subpasta no meio). */
export function direto(caminho: string, pasta: string): boolean {
    return dentro(caminho, pasta) && !String(caminho).slice(semBarra(pasta).length + 1).includes('/');
}

/**
 * O que faz: as exclusões que valem para todas as casas: os modelos e os templates
 * (`200 - FUNCTIONS/Models`, `200 - FUNCTIONS/Templates`, toda pasta com "Templates" no
 * nome), os arquivos (`300 - ARCHIVES`) e a lixeira.
 * Prova: tests/missao/missaoService.test.ts ("as casas").
 */
export function excluido(caminho: string): boolean {
    const path = String(caminho ?? '');
    if (dentro(path, '200 - FUNCTIONS/Models') || dentro(path, '200 - FUNCTIONS/Templates') || path.startsWith('.trash/')) return true;
    const pastas = path.split('/').slice(0, -1);
    return pastas.some(seg => /templates/i.test(seg) || /^\d+\s*-\s*ARCHIVES$/i.test(seg) || seg === '.trash');
}

/** O que faz: diz se o nome é de um modelo de nota (`Task modelo`, `NotaExecução_template`). */
export function nomeDeModelo(nome: string): boolean {
    return /(^|[\s_-])(modelo|template)$/i.test(String(nome ?? '').replace(/\.md$/, '').trim());
}

/**
 * O que faz: diz se uma TaskNote mora na casa das tarefas (as pastas do TaskNotes), fora
 * dos modelos.
 * Prova: tests/missao/linhagem.test.ts ("só as TaskNotes da casa").
 */
export function tarefaEmCasa(caminho: string, casas: CasasDaMissao = CASAS_PADRAO): boolean {
    const nome = String(caminho ?? '').split('/').pop() ?? '';
    return casas.tarefas.some(p => direto(caminho, p)) && !excluido(caminho) && !nomeDeModelo(nome);
}

/** Os nomes estritos das notas de período: o resto das pastas não é nota de período. */
export const NOME_DO_PERIODO = { Day: DIA, Week: SEMANA, Quarterly: TRIMESTRE } as const;

/**
 * O que faz: o período de uma nota pela casa e pelo nome estrito (`Day/2026-10-27.md` →
 * dia `2026-10-27`); qualquer outra nota dessas pastas (a do mês "2026-10-", a duplicada
 * " 2024-02-18", o banco de sugestões) → `null`.
 * Prova: tests/missao/missaoService.test.ts ("as casas").
 */
export function periodoDaNota(caminho: string, casas: CasasDaMissao = CASAS_PADRAO): { pasta: keyof typeof NOME_DO_PERIODO; chave: string } | null {
    if (excluido(caminho) || !caminho.endsWith('.md')) return null;
    const nome = caminho.split('/').pop()!.slice(0, -3);
    for (const pasta of Object.keys(NOME_DO_PERIODO) as Array<keyof typeof NOME_DO_PERIODO>) {
        if (direto(caminho, `${semBarra(casas.daymiss)}/${pasta}`) && NOME_DO_PERIODO[pasta].test(nome)) return { pasta, chave: nome };
    }
    return null;
}

/**
 * O que faz: diz se uma nota é o índice de um projeto ou departamento:
 * `100 - AREAS/<área>/100 - PROJECTS/<coluna>/<P>/<P>.md` ou
 * `100 - AREAS/<área>/200 - DEPARTMENTS/<D>/<D>.md`.
 */
export function indiceDeProjeto(caminho: string, casas: CasasDaMissao = CASAS_PADRAO): boolean {
    if (excluido(caminho) || !dentro(caminho, casas.areas)) return false;
    const parts = caminho.slice(semBarra(casas.areas).length + 1).split('/');
    const nome = (parts[parts.length - 1] ?? '').replace(/\.md$/, '');
    if (parts.length === 5 && parts[1] === '100 - PROJECTS') return parts[3] === nome;
    if (parts.length === 4 && parts[1] === '200 - DEPARTMENTS') return parts[2] === nome;
    return false;
}

/**
 * O que faz: diz se uma mudança num caminho do cofre pede remontar a Missão: só as casas
 * (as TaskNotes, as notas de período, os índices de projeto, a Caixa, as ideias, as
 * pessoas, a visão, as cidades e os países, a reserva e o tracker), fora das exclusões.
 * Por quê: o leitor escuta só as pastas que importam (arquitetura 3.7); um cofre com
 * milhares de notas não pode remontar a página a cada nota salva em outro lugar.
 * Entra → sai: o evento (`mudou`: o frontmatter de uma nota; `moveu`: renomear ou apagar,
 * arquivo ou pasta), o caminho e as casas → sim/não. Mover qualquer coisa no portfólio
 * de uma área importa (a pasta do projeto troca de coluna).
 * Erro e ataque: caminho vazio ou só parecido ("TaskNotesX/") não importa; um capítulo
 * salvo numa área não importa; um modelo com `type` vivo não importa.
 * Prova: tests/missao/missaoService.test.ts ("o que importa ao leitor").
 */
export function caminhoImporta(evento: 'mudou' | 'moveu', caminho: string, casas: CasasDaMissao = CASAS_PADRAO): boolean {
    const path = String(caminho ?? '');
    if (!path || excluido(path)) return false;
    if (casas.reserva && path === casas.reserva) return true;
    const pastas = [...casas.tarefas, casas.daymiss, casas.caixa, casas.ideias, casas.pessoas, casas.visao, casas.cidades, casas.paises, casas.habitos, ...(casas.ramosPrincipais ?? [])];
    if (pastas.some(p => dentro(path, p) || semBarra(p) === path)) return true;
    // O rascunho de protocolo mora na pasta do protocolo, fora das casas: conta pelo nome.
    if (/ - RASCUNHO\.md$/.test(path) && !dentro(path, '900 - ARCHIVE')) return true;
    if (evento === 'moveu') {
        if (!dentro(path, casas.areas)) return false;
        const seg = path.slice(semBarra(casas.areas).length + 1).split('/');
        return seg.length <= 1 || seg[1] === '100 - PROJECTS' || seg[1] === '200 - DEPARTMENTS';
    }
    return indiceDeProjeto(path, casas);
}
