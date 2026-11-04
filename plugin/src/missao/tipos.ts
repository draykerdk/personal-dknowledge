/**
 * Os tipos do modelo da Missão e da gravação: o nó, a ligação, as linhas, o modelo inteiro de uma
 * versão do cofre, o índice das tarefas, a busca, os lugares, os sinais, a triagem, o dinheiro, as
 * pessoas, as coleções e o que o componente pede à gravação (o destino, o aviso, o resultado).
 *
 * Por quê: o passo `tipos` da divisão da Missão (H5, tests/missao/modeloDfm.test.ts). Os tipos
 * moravam nos arquivos que os compõem (a borboleta, a linhagem, o sinais, o missaoWrites…), e as
 * funções que a borboleta compõe os importavam de volta: 16 arquivos presos uns aos outros, só por
 * tipos. Aqui, na camada 0, cada módulo lê os tipos de baixo, e os imports só descem.
 *
 * Só tipos: nada roda aqui. Os textos de cada campo são os de antes, sem mudança.
 */
import type { DomainChoice } from '../engine/domainModel';
import type { Colocacao, Escala, Janela, Recorte } from './tempo';
import type { DomainField, DomainModel, DomainState, TIPOS_DE_SINAL } from '../engine/domainModel';
import type { GrammarCounts } from '../engine/showGrammar';
import type { ProjectRef } from '../canvas/edgeLinks';
import type { TabelasDaMissao } from './estados';
import type { TaskRecord } from '../tasks/taskRecord';
import type { WeightReason } from '../engine/decisionWeights';

/* ------------------------------------------------------------ o nó, as linhas e o modelo (vinham da borboleta) */

/**
 * A espécie de um cartão de nó, a mesma em toda tela (o mapa, o ramo, o Sistema, as listas do painel):
 * o desenho de cada uma tem um dono só, `noEl` (view/nos.ts). A pessoa, o item da checklist e o grupo
 * (as conexões de pouco valor do mesmo tipo juntas, "3 · Dia") entraram em 30/10, quando o ramo passou
 * a desenhar com o mesmo cartão do mapa.
 */
export type TipoDeNo = 'area' | 'projeto' | 'smart' | 'acao' | 'dia' | 'semana' | 'trimestre' | 'ano' | 'visao' | 'prateleira' | 'lugar' | 'nota' | 'trecho' | 'pessoa' | 'item' | 'grupo';

export interface MissaoNo {
    id: string;
    tipo: TipoDeNo;
    titulo: string;
    /** A linha de baixo: a forma de mostrar (pela função única), ou status · estimativa · data. */
    linha: string;
    /** A linha de cima ou de lado (as datas, o tema, a carga, o papel). */
    sub?: string;
    /** O estado pela forma: feita (cheio), aberta (contorno), pendente (tracejado), algum dia (claro). */
    estado?: 'feita' | 'aberta' | 'pendente' | 'algum-dia';
    /** A cor do ramo: a posição da central na Temporada; `-1` = neutro. */
    ramo: number;
    papel?: Papel;
    /** A contagem crua da forma de mostrar (para os traços), da mesma conta da linha. */
    contagens?: GrammarCounts;
    temCanvas?: boolean;
    /**
     * No projeto: o estágio, pela coluna dele, com a marca e o rótulo da tabela de estados do modelo
     * (`projeto.json`; decisão 9 do mapa dos tipos, 29/10, aceita em 02/11); sem a linha (o departamento,
     * que não tem tabela), nada.
     */
    estagio?: string;
    /** `HH:MM` da hora marcada. */
    hora?: string;
    /** O dia `AAAA-MM-DD` em que a tarefa está (com a hora, diz se a hora já passou). */
    dia?: string;
    /** Veio só pela semana (a marca "da semana"). */
    daSemana?: boolean;
    /** Os sinais do nó (a marca discreta). */
    sinais?: TipoDeSinal[];
    /** As marcas do dia: pessoas, dinheiro. */
    marcas?: string[];
    /** O texto inteiro de uma marca (a dica do botão e a linha do painel), pela marca. */
    dicas?: Record<string, string>;
    /** No dia que tem Day, até hoje, sem `entrou` nem `saiu`: o atalho do registro do dinheiro (P9). */
    semDinheiro?: boolean;
    /** Na central: a linha do ramo inteiro (ela e os auxiliares), pela mesma conta (`projectProgress`). */
    doRamo?: { linha: string; contagens: GrammarCounts };
    /** No dia: a carga contra o Bloco Sagrado (o fim do `sub`) e se ela passa do bloco (`overCapacity`). */
    carga?: string;
    excede?: boolean;
    /** Na SMART: a de manutenção de rotina (`natureza`, 02/11), fora das até 3 da semana e com a marca 🧰. */
    manutencao?: boolean;
    /** No projeto: o título da próxima ação real dele (`proximaAcaoDoProjeto`, 02/11); sem ação aberta, nada. */
    proxima?: string;
    /** No centro do dia: a ação do ▶️, ou o compromisso que o 🌙 deixou para hoje (`linhaDoComando`, 02/11); sem os dois, nada. */
    comando?: string;
}

export interface Faixa { projeto: string | null; rotulo: string; ramo: number; nos: MissaoNo[] }

export interface Ligacao { de: string; para: string; tipo: 'estrutura' | 'tempo' | 'pendente' | 'bloqueio' | 'lugar' }

export interface LugarDaLinha {
    /** "Kunming → Sapa", "Sapa" ou "sem lugar marcado". */
    texto: string;
    trechos: TrechoDeLugar[];
    passagens: Passagem[];
    viagem: boolean;
}

export interface HabitoDoDia { caminho: string; titulo: string; vezes: number }

export interface LinhaAberta {
    escala: Escala;
    chave: string;
    id: string;
    hoje: boolean;
    especial: boolean;
    centro: MissaoNo;
    lugar: LugarDaLinha;
    areas: MissaoNo[];
    projetos: MissaoNo[];
    smarts: MissaoNo[];
    /** As ações do período, em faixas por projeto ("sem projeto" por último). */
    faixas: Faixa[];
    /** As que ficaram de antes (só na linha de hoje). */
    pendentes: Faixa[];
    /** No dia: as tarefas com hora, na ordem do horário. */
    horarios: MissaoNo[];
    /** Dia → semana → trimestre → visão (sem o centro). */
    asa: MissaoNo[];
    ligacoes: Ligacao[];
    /** Ações e SMART que caem na linha. */
    contagem: number;
    /** Os hábitos do dia (contagem, nunca sequência); fora do dia, vazio. */
    habitos: HabitoDoDia[];
    /** No ano: os trimestres dele. */
    trimestres: MissaoNo[];
    /** As somas do dinheiro do período (o atalho "＋ R$" quando não há valor). */
    dinheiro: string;
    /** As passagens da linha como nós (a mais nova primeiro): o centro de um ramo de lugar (P10b). */
    passagens: MissaoNo[];
    /** Os trechos da linha: os feitos (pelas passagens) e os planejados (pelas coleções), pelo dia (P10b). */
    trechos: MissaoNo[];
    /** Os nós de cada coleção do ramo que caem na linha (P10b, `colecoes.ts`). */
    colecoes: Record<string, MissaoNo[]>;
}

export interface MarcaFechada { id: string; tipo: 'acao' | 'smart' | 'projeto' | 'trimestre'; estado?: MissaoNo['estado']; ramo: number }

export interface LinhaFechada {
    escala: Escala;
    chave: string;
    id: string;
    rotulo: string;
    hoje: boolean;
    especial: boolean;
    /** O detalhe por escala: marcas no dia, SMART na semana, projetos no trimestre, trimestres no ano (até 14). */
    marcas: MarcaFechada[];
    /** Quantas marcas passaram das 14. */
    mais: number;
    linha: string;
    /** "W45 começa", "Q1 começa". */
    nota: string;
    lugar: TrechoDeLugar[];
}

export interface Contagens {
    /** TaskNotes por lugar: na linha, nas prateleiras, neutras (canceladas). */
    porLugar: Record<'linha' | 'algum-dia' | 'sem-data' | 'neutra', number>;
    taskNotes: number;
    /** O que tem a tag de tarefa e não é TaskNote (`type` de outra coisa). */
    fora: number;
    abertas: number;
    feitas: number;
    algumDia: number;
    canceladas: number;
    smart: number;
    acoes: number;
    projetos: Record<Papel, number>;
    semProjeto: { total: number; acoes: number; smart: number; porMotivo: Record<string, number> };
    sinais: number;
    sinaisPorTipo: Record<string, number>;
    passagens: number;
    deAntes: number;
}

export interface MissaoModelo {
    versao: number;
    hoje: string;
    filtros: FiltrosResolvidos;
    indice: MissaoIndice;
    /** As tarefas que os filtros deixam à vista (sem as neutras). */
    visiveis: MissaoTarefa[];
    janela(escala: Escala): Janela;
    /** As chaves das linhas, de cima para baixo: prateleiras, "depois", a janela do futuro ao passado, "antes". */
    chaves(escala: Escala): string[];
    linha(escala: Escala, chave: string): LinhaAberta;
    linhaFechada(escala: Escala, chave: string): LinhaFechada;
    linhagem(id: string, escala: Escala): Set<string>;
    buscar(consulta: string, escala: Escala, limite?: number): Achado[];
    /** A linha onde um nó mora numa escala (o foco por nó, a busca, "ir até"). */
    linhaDoNo(id: string, escala: Escala): string | null;
    estadoInicial(): EstadoTela;
    passagens: Passagem[];
    visao: VisaoVigente;
    sinais: Sinal[];
    sinaisDoNo(id: string): Sinal[];
    triagem: Prateleira;
    reserva: Reserva;
    contagens: Contagens;
    /** A nota e o canvas de um nó (para "Abrir a nota" e "Abrir o canvas"); o que não existe, `null`. */
    arquivos(id: string): ArquivosDoNo;
    /**
     * Os motivos da tabela única que põem a tarefa aqui (o "Por que agora"), do maior para o
     * menor; `null` = a tarefa não é pontuada (SMART, fechada, fora da grade do agora) ou não há pesos.
     */
    motivos(id: string): WeightReason[] | null;
    /** O que o nó ainda não tem e se cria pelos comandos de sempre ("Criar o canvas", "Criar a nota"). */
    criaveis(id: string): Criavel[];
    /** As notas de pessoa (P9, §8.9), para escolher no dia. */
    pessoas: PessoaDaMissao[];
    /** As pessoas do `pessoas` de um dia. */
    pessoasDoDia(dia: string): PessoaDaMissao[];
    /** O painel de uma pessoa: ela e os dias em que aparece (o mais novo primeiro); `null` sem a nota. */
    pessoa(id: string): { pessoa: PessoaDaMissao; dias: string[] } | null;
    /** As pessoas de uma passagem (os dias dela). */
    pessoasDoLugar(id: string): PessoaDaMissao[];
    /** A nota da reserva (o "Informar saldo"); `null` sem ela. */
    notaDaReserva: string | null;
    /** Os trechos: os feitos, pelas passagens, e os planejados, pelas coleções do ramo (P10b). */
    trechos: Trecho[];
    /** O painel de um nó de coleção (`n:`), de trecho (`r:`) ou de vínculo sem nota (`c:`); `null` nos outros. */
    detalhe(id: string): DetalheDoNo | null;
    /** O que saiu durante uma passagem (as Days dela, P9) e a reserva; `null` = o id não é de passagem. */
    custoDaPassagem(id: string): CustoDaPassagem | null;
    /**
     * Os protocolos de um nó (a peça 2b, 30/10): os donos dos campos, os que criam ou revisam o tipo e os que
     * rodaram na nota, na ordem dos pesos, com o porquê e as respostas do nó (`protocolosDoNo`); vazia sem nota.
     */
    protocolosDoNo(id: string, lido: LidoDosProtocolos, camposDaNota: (caminho: string) => Record<string, unknown> | null): ProtocoloDoNo[];
    /** As estadias que caem numa passagem (30/10), como cartões; vazia quando o id não é de passagem. */
    estadiasDaPassagem(id: string): MissaoNo[];
    /** As estadias de uma cidade (pelo nome), com e sem data, como cartões (30/10). */
    estadiasDaCidade(nome: string): MissaoNo[];
    /**
     * O nó de uma nota pelo caminho (P10c, as conexões do painel): a nota de uma coleção do ramo,
     * a tarefa, o projeto, a área, o período, a visão, a pessoa ou a passagem mais nova da cidade;
     * `null` = a Missão não tem nó para ela (o painel abre a nota como `n:`).
     */
    noDaNota(caminho: string): { id: string; titulo: string } | null;
    /**
     * O nó de um nome sem nota: o que um vínculo do ramo aponta (o país sem nota da coleção) e, em
     * qualquer ramo, o lugar com esse nome (G6: o país e a cidade pelo modelo do tipo); `null` = nenhum.
     */
    noDoNome(nome: string): { id: string; titulo: string } | null;
    /**
     * O lugar de um nó (G6, `lugarDoNo.ts`): o país, a cidade e a passagem em que ele mora, e o que a
     * camada dele tem (as cidades do país, as passagens); `null` = o id não é de lugar.
     */
    lugarDoNo(id: string): LugarDoNo | null;
    /** O "Escolher uma que já existe" do Novo sobre este modelo (`opcoesDeEscolher`, escolher.ts); `null` = o Novo só cria. */
    opcoesDeEscolher(escolha: EscolhaDoNo, tipo: { dominio: string; titulo: string }, origem: OrigemDoNovo, leitor: LeitorDoEscolher, texto?: string, limite?: number): ListaDoEscolher | null;
    /** As notas que o "＋ Adicionar" de um campo lista sobre este modelo (`opcoesDoCampo`); `null` = o campo não é do painel. */
    opcoesDoCampo(adicao: AdicaoAoCampo, leitor: LeitorDoEscolher, texto?: string, limite?: number, alvo?: readonly string[]): ListaDoEscolher | null;
    /** O gesto que pôr uma nota no campo de um nó grava, sobre este modelo (`gestoNoCampo`), ou o problema. */
    gestoNoCampo(adicao: AdicaoAoCampo, campo: DomainField, fm: Record<string, unknown>, nota: Pick<Candidato, 'nome' | 'caminho'>): GestoNoCampo;
    /** O campo de link que o painel edita, pelo modelo do tipo da nota (`campoDoAdicionar`); `null` = não é de link nem do painel. */
    campoDoAdicionar(adicao: Pick<AdicaoAoCampo, 'nota' | 'campo' | 'alvo'>, leitor: Pick<LeitorDoEscolher, 'modelos' | 'camposDaNota' | 'nomeDoArquivo'>): DomainField | null;
    /** O "＋ Adicionar" do campo do pai de uma tarefa, só com as notas de uma espécie de nó (`adicaoDoPai`, a triagem); `null` = nada a escolher. */
    adicaoDoPai(no: string, especie: string, leitor: LeitorDoEscolher): AdicaoAoCampo | null;
    /** O que ligar um nó a outro grava, sobre este modelo (`ligacoesEntre`, ligar.ts): as ligações que os modelos de tipo deixam, ou o porquê de nenhuma. */
    ligacoesEntre(de: string, para: string, leitor: LeitorDoEscolher): ResultadoDoLigar;
    /** O nó de uma tarefa como o painel do nó o mostra (`noDaTarefa`, com o contexto de painel.ts). */
    noDaTarefaNoPainel(t: MissaoTarefa): MissaoNo;
    /** O nó de um projeto no período, como o painel do nó o mostra (`noDoProjeto`); `null` = o projeto não existe. */
    noDoProjetoNoPainel(id: string, periodo: { escala: 'trimestre' | 'ano'; chave: string } | null): MissaoNo | null;
    /**
     * O ramo de um nó, em todos os períodos, até a profundidade pedida (`ramoDoNo`, ramo.ts): o que a
     * pinça mostra ao entrar no nó; `null` = a Missão não conhece o nó. Os links da nota vêm do leitor.
     */
    ramo(id: string, profundidade?: number, leitor?: LeitorDoRamo, expansao?: Readonly<Record<string, boolean>>): RamoDoNo | null;
    /**
     * A ordem padrão das tarefas numa escala (`ordemPadrao`: a hora, o peso, a reputação no empate, o título),
     * com os pontos e os graus desta versão: as candidatas do "＋ Adicionar" a usam (02/11). Sem ela, o título.
     */
    ordemDasTarefas?(escala: Escala): (a: MissaoTarefa, b: MissaoTarefa) => number;
    /** As conexões padrão de um nó, só pelos modelos de tipo (`conexoesPadraoDoNo`): acima, abaixo e ao lado. */
    conexoesPadrao(id: string, leitor?: LeitorDoRamo): ItemDoRamo[];
    /** O domínio do modelo de um nó (`dominioDoNo`); `null` = o nó não é de um tipo. */
    dominioDoNo(id: string, leitor?: LeitorDoRamo): string | null;
    /** O sistema inteiro no tempo (`linhaDoSistema`, sistema.ts): os anos e os trimestres desde a primeira nota de período. */
    sistema(): LinhaDoSistema;
    /**
     * O nó de qualquer id como o mapa o compõe (`noDoId`, borboleta.ts): a tarefa e a SMART, o projeto
     * no trimestre de hoje, a área, o período, a visão, a passagem, o lugar, a nota da coleção, o
     * trecho, a pessoa; `null` = a Missão não tem nó para o id. É o dado do cartão único de cada
     * espécie (`noEl`) no ramo, no Sistema e nas listas do painel (30/10: o mesmo tipo de nó em todo lugar).
     */
    no(id: string): MissaoNo | null;
    /**
     * A próxima ação real de um projeto (02/11, o inventário da aposentadoria, item 2): a fixada na nota dele
     * (`proxima_acao_real`), quando ainda é uma ação aberta dele, ou a primeira pela ordem padrão do Dia
     * (`ordemPadrao`); `null` = o id não é de projeto, ou o projeto não tem ação aberta (sem sinal novo).
     */
    proximaAcao?(id: string): ProximaAcao | null;
    /**
     * O que o ▶️ gravou na Day de um dia e, hoje, o compromisso que o 🌙 deixou (`comandoDoDia`, 02/11, o
     * inventário da aposentadoria, item 1); cada um `null` quando não há.
     */
    doDia?(dia: string): DoDia;
}

/** O que o ▶️ gravou na Day: a ação, a entrega suficiente, o valor, o compromisso 🤝 e a tarefa ligada (no índice). */
export interface ComandoDoDia {
    acao: string;
    suficiente: string;
    valor: string;
    compromisso: string;
    tarefa: MissaoTarefa | null;
}

/** O compromisso que o 🌙 deixou para hoje: o texto (o nome da tarefa), o rótulo de quando e a tarefa (no índice). */
export interface CompromissoDeixado {
    texto: string;
    rotulo: string;
    tarefa: MissaoTarefa | null;
}

/** O que o centro do dia mostra do ▶️ e do 🌙 (`comandoDoDia`, 02/11). */
export interface DoDia {
    comando: ComandoDoDia | null;
    deixado: CompromissoDeixado | null;
}

/** A próxima ação real de um projeto: a tarefa, de onde ela veio e, quando a fixada não vale, o que o campo aponta. */
export interface ProximaAcao {
    tarefa: MissaoTarefa;
    /** `fixada` = a nota do projeto a aponta (`proxima_acao_real`); `ordem` = a primeira pela ordem padrão. */
    origem: 'fixada' | 'ordem';
    /** O que o campo aponta quando não é uma ação aberta do projeto (feita, de outro projeto, sem nota); senão `null`. */
    fixadaSemEfeito: string | null;
}

export type Criavel = 'nota' | 'canvas';

export interface ArquivosDoNo { nota: string | null; canvas: string | null }

/* ------------------------------------------------------------ o índice das tarefas (vinham da linhagem) */

export type Papel = 'central' | 'auxiliar' | 'fora';

export interface MissaoProjeto {
    id: string;
    nome: string;
    area: string;
    tipo: 'projeto' | 'departamento';
    fase: string;
    /** A linha da tabela de estados do projeto pela coluna (`projeto.json`, 0b); o departamento não tem. */
    estado: DomainState | null;
    /** No estado feito (`5 - Done`, pela tabela): segue destino de vínculo, mas sai da mesa. */
    encerrado: boolean;
    papel: Papel;
    /** O nome da central a que pertence (ela mesma, se é central); `null` = fora da Temporada. */
    central: string | null;
    /** A posição da central na Temporada (0, 1…), que escolhe a cor do ramo; `-1` = fora. */
    ramo: number;
    /** As notas que a nota do projeto aponta como a central a que ele serve, como vieram (o ramo genérico lê o campo daqui). */
    serve?: string[];
    /** O que a nota do projeto fixa como próxima ação (`proxima_acao_real`, o nome do link); vazio sem o campo. */
    fixada?: string;
    nota: string | null;
    canvas: string | null;
    pasta: string;
}

export interface MissaoArea { id: string; nome: string; nota: string | null; canvas: string | null; projetos: string[] }

/** Por que a tarefa tem (ou não tem) projeto. */
export type MotivoDoProjeto = 'direto' | 'pela-smart' | 'pela-tarefa' | 'sem-vinculo' | 'vinculo-quebrado' | 'smart-sem-projeto' | 'outro-destino';

export interface MissaoTarefa {
    id: string;
    caminho: string;
    titulo: string;
    tipo: 'acao' | 'smart';
    status: string;
    feita: boolean;
    algumDia: boolean;
    aberta: boolean;
    colocacao: Colocacao;
    /** Aberta, na linha, com o dia passado (a da semana, só depois do domingo). */
    deAntes: boolean;
    /** O id da SMART mãe (`s:`), quando é ação de uma SMART. */
    smart: string | null;
    /** O id do projeto (`p:`), direto ou pela SMART; `null` = sem projeto. */
    projeto: string | null;
    motivo: MotivoDoProjeto;
    /** O link que não aponta para nada (com `vinculo-quebrado`). */
    quebrado: string | null;
    estimativa: number | null;
    /** A linha da tabela de estados da tarefa (`tarefa.json`, 0b); `null` com status vazio ou fora do catálogo. */
    estado: DomainState | null;
    /** Tem alguma chave do `legado` da SMART: "modelo antigo" (0f). */
    modeloAntigo: boolean;
    record: TaskRecord;
}

export interface MissaoIndice {
    hoje: string;
    /** Toda TaskNote (`task` e `tarefa_smart`), inclusive as neutras (canceladas). */
    tarefas: MissaoTarefa[];
    /** As que têm lugar visível (sem as neutras). */
    vivas: MissaoTarefa[];
    porId: Map<string, MissaoTarefa>;
    projetos: Map<string, MissaoProjeto>;
    areas: Map<string, MissaoArea>;
    /** As unidades das funções únicas: todas as TaskNotes do índice, como vieram. */
    registros: TaskRecord[];
    /** O que o índice traz com a tag de tarefa e não é TaskNote da casa (`type` de outra coisa, modelo, fora das pastas do TaskNotes). */
    fora: TaskRecord[];
    /** As centrais, na ordem da Temporada (as que existem no portfólio). */
    centrais: string[];
    /**
     * O ramo de cada central, na ordem das centrais: o nome, o id do projeto (`idDoProjeto`) e a
     * família (ela e os auxiliares, `familiaDe`). Os sinais leem o ramo daqui, já composto.
     */
    ramos: Array<{ central: string; id: string; familia: Set<string> }>;
    /** As tabelas dos tipos (estados e legado) que o índice usou: os nós leem os rótulos daqui. */
    tabelas: TabelasDaMissao;
}

/* ------------------------------------------------------------ os filtros (vinham dos filtros) */

export type Coluna = 'lugar' | 'areas' | 'projetos' | 'smart' | 'tarefas' | 'semana' | 'trimestre' | 'visao';

/**
 * O recorte das tarefas de um ramo (P10b; a linhagem, 02/11, parte 1 da proposta da viagem nos ciclos, §5): a
 * tarefa entra com uma das etiquetas (`tags`) ou quando o projeto dela, direto ou pela SMART mãe, é um dos
 * `projetos` (ou um auxiliar dele). As duas listas vazias = todas as tarefas.
 */
export interface RecorteDoRamo { tags: readonly string[]; projetos: readonly string[] }

/** O período como veio: um recorte já em datas, ou `hoje`/`este`, resolvidos com o contexto. */
export type PeriodoFiltro = { tipo: 'tudo' } | { tipo: 'recorte'; de: string; ate: string } | { tipo: 'hoje' } | { tipo: 'este' };

export type FocoFiltro = { tipo: 'hoje' } | { tipo: 'periodo'; escala: Escala; chave: string } | { tipo: 'no'; id: string };

export type ProjetoFiltro = { tipo: 'todos' } | { tipo: 'nome'; nome: string } | { tipo: 'este' };

export interface MissaoFiltros {
    escala: Escala;
    periodo: PeriodoFiltro;
    foco: FocoFiltro;
    /** Os nomes das áreas; vazio = todas. */
    areas: string[];
    projeto: ProjetoFiltro;
    /** Com um projeto central: traz os auxiliares dele. */
    ramo: boolean;
    /** Só as centrais e os auxiliares. */
    temporada: boolean;
    zoom: 'compacto' | 'foco' | 'tudo';
    modo: 'leitura' | 'edicao';
    /** As colunas à vista (o centro sempre fica). */
    colunas: Coluna[];
    /** Quantas linhas fechadas à vista. */
    linhas: number;
    titulo: string;
}

/** Os filtros com `este` e `hoje` traduzidos: o recorte em datas, o projeto pelo nome e a linha em foco. */
export interface FiltrosResolvidos {
    filtros: MissaoFiltros;
    /** As datas do período; `null` = tudo. */
    recorte: Recorte | null;
    /** O nome do projeto escolhido; `null` = todos. */
    projeto: string | null;
    /** A chave da linha em foco na escala; `null` = hoje (ou a linha do nó em foco, que o modelo acha). */
    focoChave: string | null;
    /** O nó em foco (`p:`, `s:`…), quando o foco é um nó. */
    focoNo: string | null;
    problemas: string[];
}

/* ------------------------------------------------------------ a busca e o estado de tela */

export interface Achado {
    id: string;
    /** O que é: dia, semana, trimestre, ano, projeto, departamento, SMART, ação. */
    tipo: string;
    titulo: string;
    escala: Escala;
    /** A linha onde mora na escala do achado. */
    chave: string;
}

export interface EstadoTela {
    escala: Escala;
    /** A linha em foco (uma chave de período, ou prateleira). */
    foco: string;
    /** O nó aberto no painel (`t:`, `p:`, `d:`…); `null` = nenhum. */
    selecionado: string | null;
    busca: string;
    /** "Abrir tudo": todas as linhas da janela com as asas abertas. */
    abrirTudo: boolean;
    /** "Compacto": só linhas fechadas, nem o foco abre. */
    compacto: boolean;
    /** A linhagem do nó escolhido fica acesa. */
    linhagem: boolean;
    /** Rola a linha em foco até a vista na próxima pintura (teclado, Hoje, troca de escala). */
    seguir: boolean;
}

/* ------------------------------------------------------------ os lugares, os trechos e as coleções */

export interface Passagem {
    /** `l:<cidade>:<chegada>`. */
    id: string;
    cidade: string;
    /** O país (o link da nota da cidade, ou o texto); `null` sem país. */
    pais: string | null;
    /** O caminho da nota da cidade, quando existe. */
    nota: string | null;
    /** A chegada (`AAAA-MM-DD`). */
    de: string;
    /** O último dia; `null` = aberta (vale até hoje). */
    ate: string | null;
    /** De onde veio a chegada: a Day ou a nota da cidade. */
    fonte: 'dia' | 'cidade';
}

/**
 * O nome antigo da passagem (até 30/10 o plugin chamava de "estadia" a presença numa cidade; a estadia
 * agora é a nota do lugar onde se fica, `Config/dominios/estadia.json`). Fica só para o motor
 * (`engine/sugestoesDoPasso.ts`), que outra cópia refaz agora; sai quando o motor importar `Passagem`.
 */
export type Estadia = Passagem;

/* ------------------------------------------------------------ o lugar em camadas (G6, `lugarDoNo.ts`) */

/** O que o modelo do tipo diz do lugar: os domínios, o campo do país na cidade e o do nome de cada um. */
export interface RegrasDoLugar {
    /** O domínio da cidade e o do país (o id do país sem nota é `c:<domínio>:<nome>`). */
    dominioDaCidade: string | null;
    dominioDoPais: string | null;
    /** O `type` das notas do país (o "Criar a nota" pelo Novo do tipo). */
    typeDoPais: string | null;
    /** O campo de link da cidade que aponta o país. */
    campoDoPais: string | null;
    /** O campo do nome na nota da cidade e na do país (o primeiro texto obrigatório do modelo). */
    nomeDaCidade: string | null;
    nomeDoPais: string | null;
}

/** Um país: o id do nó (a nota, ou o nome sem nota), o nome e a nota (`null` = sem nota ainda). */
export interface PaisDoLugar { id: string | null; nome: string; nota: string | null }

/** Uma cidade: o id do nó (`n:<nota>`; `null` sem nota), o nome, a nota e o país dela. */
export interface CidadeDoLugar { id: string | null; nome: string; nota: string | null; pais: string | null }

export interface CamadasDoLugar {
    regras: RegrasDoLugar;
    paises: PaisDoLugar[];
    cidades: CidadeDoLugar[];
    passagens: readonly Passagem[];
}

/**
 * O lugar de um nó: o país, a cidade e a passagem em que ele mora (a camada de baixo que falta fica
 * `null`: o nó do país não tem cidade), e o que a camada dele tem por dentro: as cidades do país e
 * as passagens (do país ou da cidade).
 */
export interface LugarDoNo {
    pais: PaisDoLugar | null;
    cidade: CidadeDoLugar | null;
    passagem: Passagem | null;
    cidades: CidadeDoLugar[];
    passagens: Passagem[];
    /** O domínio do tipo do nó (a cidade, o país); `null` na passagem, que não é tipo de nota. */
    dominio: string | null;
}

/** Um passo da trilha do lugar: o id do nó (`null` = sem nó, só o nome) e o texto. */
export interface PassoDoLugar { id: string | null; titulo: string }

/** Um trecho da faixa do lugar num período: a passagem (ou nada) e quantos dias seguidos. */
export interface TrechoDeLugar { passagem: string | null; dias: number; desde: string }

/** Um trecho: a mudança de um lugar para outro num dia, feita (pelas passagens) ou planejada (por uma nota). */
export interface Trecho {
    /** `r:<dia>:<de>><para>`. */
    id: string;
    de: string;
    /** Para onde; `null` = a nota não diz ainda. */
    para: string | null;
    dia: string;
    planejado: boolean;
    /** A nota que planeja o trecho (o planejado); `null` no feito. */
    nota: string | null;
}

/** O que o painel de um nó de coleção, de trecho ou de vínculo mostra. */
export interface DetalheDoNo {
    titulo: string;
    /** O tipo, em palavras ("Mala", "Trecho"). */
    rotulo: string;
    nota: string | null;
    /** As linhas do painel: o rótulo e o valor (a ausência em palavras). */
    linhas: Array<[string, string]>;
    /** As notas ligadas a esta (as que a seguem; as que apontam o alvo do vínculo). */
    ligadas: MissaoNo[];
    /** As linhas de cada ligada (os campos dela), pelo id. */
    linhasDasLigadas: Record<string, Array<[string, string]>>;
    /**
     * O alvo de um vínculo sem nota (P10c): o `type` da nota que falta (o da fonte da coleção), o
     * campo que dá o título dela e o nome, para o "Criar a nota" pelo Novo do tipo.
     */
    semNota?: { type: string; campo: string | null; nome: string };
}

/** Uma pessoa como a Missão a mostra: o id do painel, o nome (o da nota) e o caminho. */
/* ------------------------------------------------------------ as pessoas, o dinheiro e a visão */

/** Uma pessoa como a Missão a mostra: o id do painel, o nome (o da nota) e o caminho. */
export interface PessoaDaMissao { id: string; nome: string; caminho: string | null }

export interface Reserva {
    /** O último saldo informado (`saldo` em número); `null` = a nota não tem número. */
    saldoInformado: number | null;
    /** A data do saldo (`atualizado_em`). */
    informadoEm: string | null;
    /** O saldo de agora: o informado, mais o que entrou e menos o que saiu desde então. */
    saldo: number | null;
    entrouDesde: number;
    saiuDesde: number;
    diasSemValorDesde: number;
    /** Os dias sem registro depois do saldo, até hoje (a mesma conta da passagem e do período, `diasSemRegistro`). */
    semRegistroDesde: string[];
    /** O gasto do mês usado e de onde veio. */
    gastoMensal: number | null;
    media: 'declarada' | 'medida' | null;
    meses: number | null;
    /** A linha em palavras; vazia sem a nota da reserva (nada aparece, nada avisa). */
    texto: string;
    /** O nome da nota da reserva, sem o símbolo do começo ("💰 Caixa" → "Caixa"), o rótulo da linha na tela; vazio sem a nota. */
    rotulo: string;
}

export interface CustoDaPassagem {
    /** A soma do que saiu nos dias da passagem com valor. */
    saiu: number;
    diasComValor: number;
    /** Os dias da passagem até hoje sem `entrou` e sem `saiu` (o futuro não conta), pela conta única. */
    diasSemValor: number;
    /** Esses dias, em ordem (`diasSemRegistro`). */
    semRegistro: string[];
    /** "28–31/10: saiu R$ 152 em 3 dias · 1 dia sem registro"; sem nada, "28–29/10: nada registrado (2 dias)". */
    texto: string;
    /** A linha da reserva de hoje (a conta do dinheiro), a mesma do trimestre; vazia sem a nota da reserva. */
    reserva: string;
}

/** O que o nó oferece: o protocolo e as respostas já dadas. */
/** A oferta do 🔭: o papel (o protocolo é o que a tabela vigente dá; sem ele, não há botão), o horizonte e as respostas já dadas. */
export interface OfertaDaVisao { papel: 'visao'; horizonte: string; variaveis: Record<string, string> }

/** Um trimestre na linha do sistema: o que se conta dele sem dado novo. */
export interface TrimestreDoSistema {
    chave: string;
    /** As notas de período do trimestre: as Days, as Weeks e a nota dele. */
    notas: number;
    feitas: number;
    abertas: number;
    /** O trimestre tem a nota dele. */
    temNota: boolean;
    atual: boolean;
}

/** A linha do sistema: desde quando, os anos (do mais novo ao mais antigo) e quantos trimestres ficaram de fora. */
export interface LinhaDoSistema {
    /** O primeiro trimestre com nota de período; `null` = o cofre não tem nenhuma. */
    desde: string | null;
    anos: Array<{ ano: string; trimestres: TrimestreDoSistema[] }>;
    antes: number;
}

export interface VisaoVigente {
    /** A nota vigente; `null` = ainda não escrita. */
    nota: string | null;
    nome: string | null;
    horizonte: string | null;
    /** `AAAA-MM-DD` da versão (o `date` da nota). */
    data: string | null;
    /** As versões anteriores, da mais nova à mais antiga. */
    historico: string[];
    /** O ciclo longo ativo (`LongTermTime1`…), quando há. */
    longoPrazo: { nota: string; nome: string; canvas: string | null } | null;
    /** A linha do nó: "3 anos · versão de 16/10" ou "ainda não escrita". */
    linha: string;
    /** Sem visão escrita, o 🔭 com o horizonte de 3 anos; com visão, `null`. */
    oferta: OfertaDaVisao | null;
}

/* ------------------------------------------------------------ os sinais e a triagem */

/**
 * Os tipos de sinal, da lista única (`TIPOS_DE_SINAL`, engine/domainModel.ts): a mesma que as situações do
 * modelo de tipo (o P13) aceitam no `quando`.
 */
export type TipoDeSinal = typeof TIPOS_DE_SINAL[number];

/** O próximo passo: um gesto da página, com o texto do botão. */
export interface ProximoPasso {
    acao: 'mais-acao' | 'mais-smart' | 'mover-para' | 'planejar-semana' | 'ligar-projeto' | 'dar-onde' | 'dar-estimativa' | 'protocolo' | 'abrir-nota'
        /** Escrever a entrega observável (ou o critério de suficiente) da SMART, nos campos do painel (02/11). */
        | 'dar-condicao';
    rotulo: string;
    /** O protocolo do passo `protocolo` (o que o modelo do tipo declara). */
    protocolo?: string;
}

export interface Sinal {
    tipo: TipoDeSinal;
    /** O id do nó (`t:`, `s:`, `p:`, `w:`). */
    alvo: string;
    /** O fato, em palavras sobre o plano. */
    fato: string;
    /** Desde quando (`AAAA-MM-DD`); `null` quando não há data. */
    desde: string | null;
    proximoPasso: ProximoPasso;
}

export type GrupoDaTriagem =
    /** As propostas do agente do sistema (02/11/2026): o que ele propõe e espera o sim. */
    | 'propostas'
    | 'entrada' | 'vencidas' | 'smart-de-antes' | 'smart-sem-acao' | 'sem-data' | 'sem-projeto' | 'sem-onde' | 'sem-estimativa'
    | 'caixa-de-entrada' | 'rascunhos' | 'ideias';

export interface ItemDaTriagem {
    /** O id do nó (`t:`, `s:`) ou da nota (`n:<caminho>`). */
    id: string;
    tipo: 'acao' | 'smart' | 'nota' | 'ideia' | 'rascunho' | 'proposta';
    titulo: string;
    caminho: string;
    grupo: GrupoDaTriagem;
    /** Da proposta do agente (02/11/2026): o id na fila, o que aceitar faz e o porquê dele. */
    proposta?: { id: string; texto: string; porque: string };
    /** As outras faltas do item (os sinais além do do grupo). */
    marcas: TipoDeSinal[];
    /** Da ideia: "Lista de Espera" ou "sem destino". */
    destino?: string;
    /** Do rascunho: o protocolo (o id) e há quantos dias está parado. */
    protocolo?: string;
    dias?: number;
}

export interface Prateleira {
    grupos: Array<{ id: GrupoDaTriagem; rotulo: string; itens: ItemDaTriagem[] }>;
    total: number;
}

/* ------------------------------------------------------------ o que o componente pede à gravação */

export interface ResultadoDoDesfazer { feito: boolean; texto: string }

/** Mostra um aviso; com `desfazer`, o aviso traz o botão "Desfazer". */
export type Avisar = (texto: string, desfazer?: () => void) => void;

/** O resultado de uma gravação: deu ou não, e o texto do aviso. */
export interface ResultadoDaGravacao { ok: boolean; texto: string }

/**
 * Um gesto na checklist da nota (29/10): marcar ou desmarcar o item da linha (com o texto como o
 * painel o leu, para não gravar numa linha que mudou) ou acrescentar um item aberto.
 */
export type GestoDaChecklist =
    | { via: 'marcar'; linha: number; feito: boolean; texto: string }
    | { via: 'acrescentar'; texto: string };

/** Para onde o gesto do componente leva a tarefa, em dados que se serializam. */
export type Destino =
    | { tipo: 'dia'; data: string }
    | { tipo: 'semana'; semana: string }
    | { tipo: 'sem-data' }
    | { tipo: 'hora'; hora: string | null }
    | { tipo: 'projeto'; projeto: ProjectRef; de: ProjectRef | null }
    /** Pôr numa SMART: acrescenta a SMART às mães da ação (`projects`), sem tirar as outras (30/10, 02/11). */
    | { tipo: 'ligar-smart'; smart: string }
    /** A subtarefa (30/10): acrescenta a tarefa mãe (o caminho dela) ao `projects`, sem tirar as outras mães. */
    | { tipo: 'mae-tarefa'; mae: string }
    /** Desligar (a seta apagada): a SMART mãe, o projeto ou a tarefa que bloqueia (o caminho dela). */
    | { tipo: 'desligar-smart'; smart: string }
    | { tipo: 'desligar-projeto'; projeto: ProjectRef }
    | { tipo: 'desligar-bloqueio'; bloqueio: string };

/** O que se registra: o título e o dia; a hora, o projeto (ou a SMART), o onde e o quanto levou, opcionais. */
export interface RegistroDoFeito {
    titulo: string;
    /** `AAAA-MM-DD`. */
    dia: string;
    /** `HH:MM`. */
    hora?: string | null;
    /** O nome (ou o link) do projeto, do departamento ou da SMART. */
    projeto?: string | null;
    /** Um dos contextos do sistema (o "onde"). */
    onde?: string | null;
    /** O quanto levou, em minutos (vai para o registro dos blocos, com o onde). */
    minutos?: number | string | null;
}

/**
 * O que "Escolher uma que já existe" faz a partir de um nó (29/10): `soltar` é o gesto de
 * soltar a escolhida sobre o nó (a tabela das setas, o mesmo do arrasto); `campo` é o campo do
 * painel, com o link do outro lado: na escolhida (`grava: 'escolhida'`, o projeto auxiliar ganha
 * o central) ou na nota do nó (`grava: 'origem'`). Sem a chave, o nó só cria.
 */
export type EscolhaDoNo = { gesto: 'soltar' } | { gesto: 'campo'; campo: string; grava: 'escolhida' | 'origem' };

/** De onde o Novo abriu: a linha (a escala e a chave; `null` quando o nó dá o próprio tempo) e o nó. */
export interface OrigemDoNovo { linha: { escala: Escala; chave: string } | null; no: string | null }

/** Um candidato de um campo de link: o nome que o link grava, o caminho da nota (se há) e o texto da lista. */
export interface Candidato { nome: string; caminho: string | null; rotulo: string }

/** O gesto de uma opção, nos dados que as gravações da Missão entendem (`mover` ou `campo`). */
export type GestoDaEscolha =
    | { via: 'mover'; caminho: string; destino: Destino; texto: string }
    | { via: 'campo'; caminho: string; campo: string; valor: unknown; rotulo: string; mostrado: string }
    /**
     * O campo do protocolo dono (30/10): o Ligar abre o protocolo, pela gaveta, com o passo do campo já
     * respondido (o nó dono do campo em `no`); nada se grava antes do Gravar da gaveta.
     */
    | { via: 'protocolo'; no: string; protocolo: string; valores: Record<string, string>; texto: string };

/** O gesto de uma escolha e, no campo de um valor só, o valor que ela troca (para o aviso do Desfazer). */
export type GestoNoCampo = { gesto: GestoDaEscolha; antes: string | null } | { problema: string; esperar?: boolean };

/** Uma ligação que o "Ligar" (ou a alça) pode gravar entre dois nós: o texto da escolha e o gesto da gravação de sempre. */
export interface OpcaoDeLigar { rotulo: string; gesto: GestoDaEscolha; antes: string | null }

/**
 * O que ligar dois nós dá: as ligações possíveis, na ordem (o ramo que a alça desenha primeiro), e se a
 * primeira se grava direto (a alça desenha o ramo, ou só há uma); ou o porquê de nenhuma (sem campo
 * de link entre os dois tipos nos modelos: nada se inventa).
 */
export type ResultadoDoLigar = { opcoes: OpcaoDeLigar[]; direta: boolean } | { problema: string };

/** Uma nota que se escolhe: o nome, o nó (para acender depois), o porquê e o gesto. */
export interface OpcaoDeEscolher {
    chave: string;
    rotulo: string;
    /** O nó da escolhida na Missão; `null` = ela não tem nó. */
    no: string | null;
    /** Os motivos dos pesos ("Por que agora"), em palavras; `null` = sem peso. */
    porque: string | null;
    /** Pendente de antes (a linha dela já passou). */
    pendente: boolean;
    /** Sem lugar no tempo (sem dia nem semana). */
    semData: boolean;
    pontos: number;
    gesto: GestoDaEscolha;
    /** O valor que a escolha troca no campo de um valor só (o aviso diz "antes: …"); `null` = acrescenta. */
    antes?: string | null;
    /** A candidata do nó (02/11, `candidatasDoNo`): a posição na ordem padrão; vem antes das outras. */
    candidata?: number;
}

/** O que a lista lê da borda: os modelos dos tipos, o frontmatter de uma nota e o campo do nome do arquivo. */
export interface LeitorDoEscolher {
    modelos: readonly DomainModel[];
    camposDaNota: (caminho: string) => Record<string, unknown> | null;
    nomeDoArquivo?: string | null;
    /** O recorte do ramo (P10b, as tags e os projetos): no ramo que recorta, só as tarefas que ele mostra; sem ele, todas. */
    recorte?: RecorteDoRamo;
    /** O nome de um protocolo como o JSON dele diz (o Ligar pelo dono do campo, 30/10); sem ele, o id. */
    nomeDoProtocolo?: (id: string) => string | null;
}

/** As opções filtradas: as primeiras e quantas há ao todo. */
export interface ListaDoEscolher { opcoes: OpcaoDeEscolher[]; total: number }

/* ---------------------------------------------------------------- o "＋ Adicionar" de cada campo */

/**
 * O campo de link de um nó que recebe o "＋ Adicionar" (29/10): o nó, a nota dele e o nome do campo
 * do modelo do tipo da nota.
 */
export interface AdicaoAoCampo {
    no: string;
    nota: string;
    campo: string;
    /**
     * Só estes tipos do `alvo` do campo (02/11): o "＋ Adicionar" do pai que a triagem abre pela tecla do
     * projeto ou da SMART (`adicaoDoPai`); sem a chave, o alvo inteiro do campo.
     */
    alvo?: readonly string[];
}

/* ---------------------------------------------------------------- os links de uma nota (vinham das conexões) */

/** Um link que a nota faz: a chave do frontmatter (`null` = no texto), o nome escrito e a nota que ele acha. */
export interface LinkDaNota { chave: string | null; nome: string; caminho: string | null }

/** O que o cofre diz das ligações de uma nota (a borda lê do cache de metadados). */
export interface LigacoesDaNota {
    /** Os links que a nota faz, na ordem dela (os do frontmatter e os do texto). */
    saem: LinkDaNota[];
    /** As notas que apontam para ela, com o `type` de cada uma (`null` sem `type`). */
    entram: Array<{ caminho: string; type: string | null }>;
}

/* ---------------------------------------------------------------- o ramo de um nó (a pinça, o zoom) */

/**
 * O que liga um item do ramo ao nó de onde ele sai: as dependências da tarefa, a hierarquia do
 * trabalho, o lugar em camadas, o tempo e os links da nota.
 */
export type RelacaoDoRamo =
    | 'bloqueada-por' | 'bloqueia'
    | 'acao' | 'smart' | 'projeto' | 'auxiliar' | 'central' | 'area' | 'trimestre'
    | 'quando' | 'tarefa' | 'periodo'
    | 'pais' | 'cidade' | 'passagem' | 'lugar' | 'pessoa'
    | 'mae' | 'subtarefa' | 'par' | 'item'
    | 'ligada' | 'sai' | 'entra'
    /** O projeto que as SMART e as tarefas do período servem (02/11): à vista no ramo dele, sem campo que o ligue ao período. */
    | 'frente'
    /** O que ficou de um período anterior e a linha de hoje, ou a que se planeja, mostra (02/11, `pendentesDe`). */
    | 'pendente'
    /** Um item dos "Suportes e decisões" da nota do período (02/11): o link, ou a decisão escrita. */
    | 'suporte';

/** De que espécie é o nó na raiz de um ramo (como a Missão o trata, não o `type` da nota). */
export type EspecieDoRamo = 'acao' | 'smart' | 'projeto' | 'area' | 'periodo' | 'visao' | 'pais' | 'cidade' | 'passagem' | 'pessoa' | 'nota' | 'item';

/**
 * Um item do ramo: o nó (o id para entrar mais fundo; `null` = o nome sem nó), de onde sai e por quê.
 * O item da checklist da tarefa tem o id `k:<caminho>#<linha>` e não desce.
 */
export interface ItemDoRamo {
    id: string | null;
    titulo: string;
    /** O id do nó do nível de cima de que este item sai. */
    de: string;
    relacao: RelacaoDoRamo;
    /** Para cima (o que o contém), para baixo (o que ele contém) ou de lado (o tempo, o lugar, os links). */
    sentido: 'acima' | 'abaixo' | 'lado';
    /** O nó tem o que mostrar abaixo dele (30/10): fechado (o "expandir") ou aberto (o "recolher"). */
    filhos?: 'fechado' | 'aberto';
    /** A chave do link, o tipo de quem aponta, ou uma nota sobre a relação; `null` quando a relação já diz. */
    rotulo: string | null;
}

/** Um nível do ramo: os itens que saem do nível de cima (o 1 sai da raiz) e quantos passaram do limite. */
export interface NivelDoRamo { profundidade: number; itens: ItemDoRamo[]; mais: number }

/** O ramo de um nó: a raiz e os níveis, do 1 até a profundidade pedida (ou até onde há o que mostrar). */
export interface RamoDoNo {
    id: string; titulo: string; especie: EspecieDoRamo; niveis: NivelDoRamo[];
    /** As ligações entre nós do ramo além da de onde cada um saiu (30/10: a tarefa com duas SMART, a dependência). */
    extras?: Array<Pick<ItemDoRamo, 'de' | 'relacao' | 'sentido'> & { para: string }>;
}

/**
 * O que o ramo lê da borda: os links de uma nota (o cache de metadados), o rótulo de um `type`, o
 * frontmatter de uma nota (os campos de link dos tipos que a Missão não tem na memória) e o texto
 * dela (a checklist da tarefa); o que falta fica de fora.
 */
export interface LeitorDoRamo {
    ligacoesDaNota?: (caminho: string) => LigacoesDaNota | null;
    rotuloDoType?: (type: string | null) => string;
    camposDaNota?: (caminho: string) => Record<string, unknown> | null;
    /** O texto da nota, já lido pela borda; `null` = ainda não lido (nada se inventa). */
    textoDaNota?: (caminho: string) => string | null;
}

/* ------------------------------------------------------------ os protocolos do nó (a peça 2b, 30/10, `protocolosDoNo.ts`) */

/** Por que um protocolo é do nó: dono dos campos, cria o tipo, revisa, se usa sobre ele, ou já rodou nele. */
/** O papel de um protocolo no nó; `sinal` = entrou só pela situação do nó (o P13, 02/11), sem outro papel. */
export type PapelDoProtocolo = 'campos' | 'cria' | 'revisa' | 'usa' | 'rodou' | 'sinal';


/** O que a borda lê para a seção: os campos de cada protocolo para os pesos, as rodadas na nota e o modelo da escolha. */
export interface LidoDosProtocolos {
    /** A `fase_uso` e o `uso_recente` de cada protocolo (`protocolCampos`), pelo id. */
    campos: Readonly<Record<string, Record<string, unknown>>>;
    /** Os dias em que cada protocolo rodou sobre esta nota (`rodadasNaNota`), pelo id. */
    rodaram: Readonly<Record<string, readonly string[]>>;
    /** O modelo `protocolos` (o bloco `escolher`) e os pontos dele; `null` = a ordem da declaração. */
    escolha: { modelo: DomainChoice; tabela: Record<string, any> } | null;
    /** O nível da reputação de cada protocolo (`nucleo.niveisDaReputacao`), citado no porquê; sem a chave, não cita. */
    niveis?: Readonly<Record<string, string>>;
    /** O grau do nível de cada protocolo (`nucleo.grausDaReputacao`), que desempata a ordem; sem a chave, a ordem dos pesos. */
    graus?: Readonly<Record<string, number>>;
    /**
     * Os destinos de cada parada do 🧭 (`<router>.<passo>` → os ids do `map`, `destinosDasParadas`): o recorte das
     * situações do nó (o P13) só vale para o que a parada oferece; sem a chave, nenhuma situação sobe.
     */
    destinos?: Readonly<Record<string, readonly string[]>>;
}

/** A linha "Reputação" do painel do nó (`nucleo.reputacaoDaNota`): o nível e o porquê, pelos fatos. */
export interface ReputacaoDoNo {
    funcao: string;
    nivel: string;
    porque: string;
}

/** O nó, no que a seção lê: o nome e o caminho da nota, o frontmatter e as datas da rodada. */
export interface NoDosProtocolos {
    nome: string;
    caminho: string;
    campos: Readonly<Record<string, unknown>>;
    /** `_context_date` e, no período, `_target_week_pin` ou `_target_quarter_pin`. */
    datas: Readonly<Record<string, string>>;
    /** Os sinais do nó agora (o tipo e o fato), que as situações do modelo (o P13) leem; sem a chave, nenhum. */
    sinais?: ReadonlyArray<{ tipo: string; fato: string }>;
    /** O estado do nó, pela linha da tabela do tipo (o `estado` e o rótulo dela); `null` = sem estado. */
    estado?: { estado: string; rotulo: string } | null;
}

/** Um protocolo da seção, pronto: o id, os papéis, a linha do porquê e as respostas que o nó dá. */
export interface ProtocoloDoNo {
    id: string;
    papeis: PapelDoProtocolo[];
    porque: string;
    valores: Record<string, string>;
}
