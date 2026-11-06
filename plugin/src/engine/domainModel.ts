/**
 * O modelo de um domínio (arquitetura do núcleo de 21/10, seções 1.1 e 3).
 *
 * "o núcleo faz; o domínio declara e personaliza": um domínio não traz lógica própria.
 * Ele diz, num arquivo só (`200 - FUNCTIONS/Config/dominios/<domínio>.json`), quais são
 * os seus candidatos, os campos que pesam e como, os filtros, as referências, os tipos
 * de registro que gera e o que conta. Os pontos de cada categoria moram na tabela única
 * (`pesos.<domínio>` em `pesos_decisao.json`); o modelo NÃO tem a chave `pesos`.
 *
 * Um modelo declara um ou mais blocos (arquitetura da página Missão, 27/10/2026, §4.1):
 * `escolher` deixou de ser obrigatório no Passo 0 (§10.1, 0b), e entraram `estados` (a
 * tabela de estado do tipo: um por status do catálogo, ou por coluna do portfólio) e
 * `legado` (as chaves do modelo antigo, que marcam a nota como "modelo antigo"). Sem
 * `escolher`, não há bloco de pesos a conferir. No P5 entraram os campos padrão de cada
 * tipo (`campos`, §4.2: o nome, o rótulo, o tipo e o formato, os valores, o alvo, o
 * obrigatório, a sugestão, o dono e onde aparece), como ele nasce (`criar`, §4.3) e duas
 * chaves reservadas: `situacoes` (o conteúdo é do P13, §6.1) e `sinais` (os números do tipo).
 * Em 30/10 entrou a `formacao` (a formação de cada tipo na vista do ramo da pinça, `parseFormacao`).
 *
 * Este módulo só lê e confere. A mesma conferência roda no juiz
 * (`audit_architecture.py`, `domain_model_problems`), com as mesmas mensagens; os casos
 * de `tests/fixtures/dominio/casos.json` são lidos pelos dois lados.
 */

/** A pasta dos modelos de domínio: um arquivo `<domínio>.json` por domínio. */
export const DOMAIN_MODELS_FOLDER = '200 - FUNCTIONS/Config/dominios';

/** As quatro regras de categoria (os pontos sempre na tabela). */
export const CATEGORY_RULES = ['valor', 'faixa_relativa', 'contagem', 'booleano'] as const;
export type CategoryRule = typeof CATEGORY_RULES[number];

/** As duas regras de filtro (eliminam, com o motivo; nunca somem). */
export const FILTER_RULES = ['igual', 'relativo_maior_que'] as const;
export type FilterRule = typeof FILTER_RULES[number];

/** Uma faixa da regra `faixa_relativa`: até `ate` (campo ÷ referência) vale a chave. */
export interface RelativeBand {
    ate: number;
    chave: string;
}

/**
 * As faixas da `faixa_relativa` quando o modelo não declara outras: até a referência,
 * até 20% acima e acima disso. São limites, não pontos; os pontos de cada chave estão
 * na tabela.
 */
export const DEFAULT_BANDS: ReadonlyArray<RelativeBand> = [
    { ate: 1.0, chave: 'ate_base' },
    { ate: 1.2, chave: 'ate_20_acima' },
];
export const DEFAULT_BAND_ELSE = 'acima';

export interface DomainCategory {
    /** O nome da categoria: a chave dos pontos em `pesos.<domínio>`. */
    chave: string;
    regra: CategoryRule;
    /** O campo do frontmatter da nota candidata. */
    campo: string;
    /** `faixa_relativa`: o nome da referência (em `escolher.referencias`). */
    referencia?: string;
    /** `faixa_relativa`: as faixas, em ordem crescente (padrão: `DEFAULT_BANDS`). */
    faixas?: RelativeBand[];
    /** `faixa_relativa`: a chave de quem passa da última faixa (padrão: `acima`). */
    senao?: string;
    /** `valor`: os valores esperados (opcional; com eles, cada um precisa de pontos). */
    valores?: string[];
}

export interface DomainFilter {
    regra: FilterRule;
    campo: string;
    /** `igual`: o valor do campo está nesta lista → elimina. */
    valores?: string[];
    /** `relativo_maior_que`: campo ÷ referência maior que `limite` → elimina. */
    referencia?: string;
    limite?: number;
    /** O texto que o eliminado mostra. */
    motivo: string;
}

/** Uma referência do contexto: o campo `campo` da nota `nota` (caminho ou nome). */
export interface DomainReference {
    nota: string;
    campo: string;
}

export interface DomainChoice {
    categorias: DomainCategory[];
    filtros: DomainFilter[];
    referencias: Record<string, DomainReference>;
    /** Rótulo curto de uma categoria ou referência na linha dos motivos. */
    rotulos: Record<string, string>;
}

export interface DomainRecordType {
    tipo: string;
    descricao?: string;
    campos?: string[];
}

export interface DomainCount {
    tipo: string;
    onde?: Record<string, string | string[]>;
    rotulo?: string;
}

/** Como o estado aparece (a forma do nó na Missão, §10.1, 0b): lista fechada. */
export const STATE_DISPLAYS = ['contorno', 'claro', 'cheio', 'oculto', 'faixa', 'faixa_recolhida'] as const;
export type StateDisplay = typeof STATE_DISPLAYS[number];

/** Onde a TaskNote cai no tempo pelo estado (arquitetura da Missão, 8.4): lista fechada. */
export const STATE_PLACES = ['tempo', 'algum_dia', 'conclusao', 'fora'] as const;
export type StatePlace = typeof STATE_PLACES[number];

/**
 * Uma linha da tabela de estados: o valor gravado (o status do TaskNotes, ou o `status`
 * que espelha a coluna), o estado, o rótulo da tela e como aparece.
 */
export interface DomainState {
    valor: string;
    estado: string;
    rotulo: string;
    mostrar: StateDisplay;
    /** A marca ao lado (⏳, ⏸, 🏁, a da triagem); sem ela, nada. */
    marca?: string;
    /** TaskNote: onde cai no tempo. */
    lugar?: StatePlace;
    /** Projeto: a coluna do portfólio (a pasta), dona do estágio. */
    coluna?: string;
    /**
     * A nota do hábito que a nota marca no dia em que entra neste estado (03/11: o roteiro que passa a gravado marca o
     * 🎥 Gravar 1 conteúdo); entre estados do mesmo hábito, nada se marca de novo. Sem ela, nada.
     */
    habito?: string;
}

/** Os cinco tipos de campo (arquitetura da página Missão, §4.2; plano 3b). */
export const FIELD_KINDS = ['texto', 'data', 'lista', 'escolha', 'link'] as const;
export type FieldKind = typeof FIELD_KINDS[number];

/** Os formatos de cada tipo de campo que tem formato (§4.2): lista fechada. */
export const FIELD_FORMATS: Readonly<Record<'texto' | 'data', readonly string[]>> = {
    texto: ['curto', 'longo', 'numero', 'minutos', 'reais'],
    data: ['dia', 'dia_hora', 'hora', 'semana', 'trimestre'],
};

/**
 * Os vocabulários do sistema que um campo pode usar em `valores` no lugar de uma lista
 * fixa (§4.2): os contextos (`taskContexts.ts`), o status e a prioridade (o catálogo do
 * TaskNotes, só lido).
 */
export const FIELD_VOCABULARIES = ['contextos', 'status', 'prioridade'] as const;
export type FieldVocabulary = typeof FIELD_VOCABULARIES[number];

/**
 * As fontes de `sugestao`, em lista fechada (§4.2): a primeira com valor vence, sempre com
 * o porquê. Quem as resolve é uma função pura só (o Novo, no P8). `checklist` (30/10): os itens
 * da checklist da nota de função que o `caminho` diz (a estadia nasce com as checagens do 🏨),
 * só num campo do tipo lista.
 */
export const SUGGESTION_SOURCES = [
    'linha.dia', 'linha.semana', 'linha.trimestre',
    'no.smart', 'no.projeto', 'no.central', 'no.area', 'no.cidade', 'no.pais',
    'fio.projeto', 'onde_estou', 'ultimo_lugar', 'lugar.do_dia', 'heranca.smart',
    'semana_alvo', 'trimestre_alvo', 'fixo', 'nota', 'checklist',
] as const;
export type SuggestionSource = typeof SUGGESTION_SOURCES[number];

/**
 * As vias de criar um tipo (§4.3, a coluna "Novo por"): o formulário do TaskNotes, o protocolo dono, ou a
 * nota simples (`nota`, 30/10: a estadia, uma nota pequena que nenhum protocolo cria), gravada pelo Novo na
 * pasta do modelo, com o `type` dele e os campos do formulário, e com o Desfazer.
 */
export const CREATE_VIAS = ['tasknotes', 'protocolo', 'nota'] as const;
export type CreateVia = typeof CREATE_VIAS[number];

/**
 * O sentido de um campo de link no ramo do tipo (a pinça, 29/10): `acima` = esta nota pertence ao
 * alvo (a tarefa à SMART, a cidade ao país); `abaixo` = o alvo pertence a esta nota (o trimestre e
 * os projetos da Temporada); `lado` = dependência ou par (o bloqueio). O inverso sai sozinho: o
 * ramo do alvo lista quem aponta para ele no sentido contrário (`lado` fica `lado`).
 */
export const BRANCH_DIRECTIONS = ['acima', 'abaixo', 'lado'] as const;
export type BranchDirection = typeof BRANCH_DIRECTIONS[number];

/**
 * A formação de um componente (30/10/2026): um componente pode ser mais temporal ou mais relacional,
 * e isso fica na rolagem vertical; a horizontal aprofunda em mais conexões.
 * Na vista do ramo da pinça, a rolagem vertical segue o eixo principal do componente: `tempo` (o
 * anterior e o seguinte no tempo, do mesmo tipo) ou `relacao` (a cadeia principal dele: as
 * dependências e, sem elas, para cima e para baixo no ramo); a horizontal (`conexoes`) anda pelas
 * conexões do nível e abre mais quando a lista é longa. Um ramo e um modelo de tipo a declaram
 * (`formacao`), cada eixo por si; o que não se declara fica com o padrão (`missao/formacao.ts`).
 */
export const FORMACAO_VERTICAL = ['tempo', 'relacao'] as const;
export type EixoVertical = typeof FORMACAO_VERTICAL[number];
export const FORMACAO_HORIZONTAL = ['conexoes'] as const;
export type EixoHorizontal = typeof FORMACAO_HORIZONTAL[number];
export interface Formacao { vertical: EixoVertical; horizontal: EixoHorizontal }

/**
 * A formação declarada (o que o leitor aceita): os eixos e, desde 02/11, a disposição das colunas do
 * ramo de um tipo. No ramo da semana (02/11/2026), depois dos projetos vêm as SMART, depois as
 * tarefas, os dias e as semanas, tudo com as conexões. As `colunas` dão a ordem, da
 * esquerda para a direita, pelo nome de uma relação ou de uma espécie de cartão, com `centro` no lugar
 * do nó do ramo; `mais` é a coluna que recebe o "+" do que se cria a partir dele; `aVista` é quantos
 * itens de cada nível o mapa mostra antes do "mais conexões" (o trimestre mostra as 14 semanas).
 */
export interface FormacaoDeclarada extends Partial<Formacao> { colunas?: string[]; mais?: string; aVista?: number }

/** Uma fonte de sugestão: de onde vem; na `fixo`, o valor; na `checklist`, o caminho da nota. */
export interface FieldSuggestion { de: SuggestionSource; valor?: string; caminho?: string }

/**
 * Um campo padrão do tipo (§4.2): o nome no frontmatter, o rótulo na tela, o tipo e o
 * formato, os valores, o alvo do link, se é obrigatório, de onde vem a sugestão e quem é
 * o dono. A ordem dos campos no modelo é a ordem na tela.
 */
export interface DomainField {
    nome: string;
    rotulo: string;
    tipo: FieldKind;
    formato?: string;
    /** Lista fixa, ou um vocabulário do sistema. */
    valores?: string[] | FieldVocabulary;
    /** `link`: os tipos aceitos (os domínios). */
    alvo?: string[];
    /** `link`: é lista. */
    multiplo?: boolean;
    /** `link`: o sentido no ramo (acima, abaixo ou lado); sem a chave, o campo não entra no ramo. */
    ramo?: BranchDirection;
    obrigatorio?: boolean;
    sugestao?: FieldSuggestion[];
    /** `nota` (o painel edita direto), `derivado` (só leitura) ou `protocolo:<id>#<passo>`. */
    dono: string;
    /** Onde o campo aparece: no painel (editar) e no Novo (criar). Sem a chave, nos dois. */
    editar?: boolean;
    criar?: boolean;
    /** O texto da tela quando a nota não tem valor; sem ele, o campo vazio não aparece. */
    vazio?: string;
    /** O passo em que o escritor do campo chega (P9, P10…): o leitor já existe, o escritor ainda não. */
    planejado?: string;
    /**
     * `texto`: os valores que o sistema grava e reconhece (a `origem: agente` da tarefa, 02/11); o texto
     * continua livre, e outro valor também vale.
     */
    conhecidos?: string[];
    /**
     * Os nomes antigos do campo (05/11: o `plataforma` da peça virou `destinos`): a leitura usa o primeiro que a nota
     * tem quando ela não tem o campo, sem migrar a nota (`camposComApelidos`); a gravação usa só o nome de agora.
     */
    antes?: string[];
    /** `lista`: as opções e o valor inicial que vêm de outra nota (os perfis do canal da peça, `opcoesDaOutraNota`). */
    opcoes?: OpcoesDeOutraNota;
}

/**
 * As opções de um campo lista que vêm de outra nota (05/11, o gerenciamento dos destinos): `de` é o campo desta nota
 * que nomeia a outra (o `canal`); `lista`, o campo lista da outra que dá as opções (os `perfis`); e, juntos, `regra`, o
 * campo lista da outra com as linhas "<valor> → <opção>" (o `destino_por_formato`), e `por`, o campo desta nota cujo
 * valor escolhe as linhas da regra (o `formato`): elas dão o valor inicial.
 */
export interface OpcoesDeOutraNota { de: string; lista: string; regra?: string; por?: string }

/**
 * As variáveis de data que o motor dos protocolos lê como a data da rodada (§5.3, item 6: "as
 * datas vão sempre explícitas"): o campo do Novo que vai numa delas, e não num passo.
 */
export const CREATE_DATE_VARIABLES = ['_context_date', '_target_week_pin', '_target_quarter_pin'] as const;
export type CreateDateVariable = typeof CREATE_DATE_VARIABLES[number];

/**
 * Como o tipo nasce (§4.3): a via, o protocolo dono, o completo e o passo que recebe cada
 * campo; o passo que recebe o nome da nota nova quando o tipo não tem campo para ele (`nome`,
 * o título do projeto); e o campo que vai como a data da rodada (`datas`, a semana da SMART).
 */
export interface DomainCreate {
    via: CreateVia;
    protocolo?: string;
    completo?: string;
    passos?: Record<string, string>;
    nome?: string;
    datas?: Record<string, CreateDateVariable>;
    /**
     * Só na via `nota`: o campo de texto do modelo cujo valor dá o nome do arquivo novo; sem ele, o Novo pede o
     * nome (o "Nome" do formulário, que não vai ao frontmatter), como a nota de função (02/11).
     */
    titulo?: string;
    /**
     * Só na via `nota`: a casa que depende do módulo (o padrão fractal, decisão 4, 02/11): a nota nasce na pasta da
     * nota-índice que o `campo` (um link acima) aponta, na `subpasta` dela; a pasta numerada que já existe com o
     * mesmo nome (`NN - <subpasta>`) vale no lugar dela. Sem a chave, a casa é a `candidatos.pasta`.
     */
    casa?: DomainHome;
    /** Só na via `nota`: o molde da nota nova (o caminho de uma nota `.md`, com as fichas `{{…}}` do protocolo). */
    molde?: string;
}

/** A casa de uma nota que depende do módulo (`criar.casa`): o campo de link acima e a subpasta. */
export interface DomainHome { campo: string; subpasta: string }

/**
 * Os papéis de um protocolo declarado no modelo do tipo (a peça 2b, 30/10, o núcleo do P13): o que cria
 * notas do tipo, o que revisa, e o que se usa sobre o nó. Os donos dos campos (`dono: protocolo:…`) e o
 * do `criar` saem dos campos e do `criar`: não se repetem aqui.
 */
export const PROTOCOL_ROLES = ['cria', 'revisa', 'usa'] as const;
export type ProtocolRole = typeof PROTOCOL_ROLES[number];

/**
 * Um protocolo ligado ao tipo: o id, o papel e as respostas que o nó já dá (`preencher`, passo → texto, com
 * as fichas `{{no.nome}}`, `{{no.caminho}}` e `{{no.<campo>}}`, o mesmo formato do desenho do P13, §6.1).
 */
export interface DomainProtocol {
    id: string;
    papel: ProtocolRole;
    preencher?: Record<string, string>;
}

export interface DomainModel {
    dominio: string;
    descricao: string;
    candidatos: { pasta: string; type?: string; vinculo?: string };
    /** Só no modelo que escolhe (opcional desde o Passo 0, 0b). */
    escolher?: DomainChoice;
    registros: DomainRecordType[];
    contagens: DomainCount[];
    /** A tabela de estados do tipo; vazia quando o modelo não a declara. */
    estados: DomainState[];
    /** As chaves do modelo antigo (frontmatter); vazia quando o modelo não a declara. */
    legado: string[];
    /** Os campos padrão do tipo, na ordem da tela (P5); vazia quando o modelo não os declara. */
    campos: DomainField[];
    /** Como o tipo nasce; ausente quando o modelo não diz. */
    criar?: DomainCreate;
    /** Os protocolos que criam, revisam ou se usam sobre o tipo (30/10); vazia quando o modelo não os declara. */
    protocolos: DomainProtocol[];
    /**
     * As situações do nó (o P13, 02/11): o sinal ou o estado que leva a uma parada do 🧭, com o recorte dos
     * protocolos dela que sobem na seção Protocolos do painel; vazia quando o modelo não as declara.
     */
    situacoes: DomainSituation[];
    /** Reservado (os sinais por tipo, §8.8): os números do tipo, como os dias sem movimento. */
    sinais: Record<string, unknown>;
    /** A formação do tipo (30/10), só nos eixos que o modelo declara; sem a chave, o padrão da espécie. */
    formacao?: FormacaoDeclarada;
    /** Os formatos (03/11, o ramo Criação): cada um com a publicação dele; sem a chave, o tipo não tem formatos. */
    formatos?: DomainFormats;
    /** O módulo especial do aprendizado (05/11, o cartão de idioma): a escada e a fila; sem a chave, o tipo não se repete. */
    aprendizado?: DomainLearning;
}

/**
 * Os campos que o tipo com `aprendizado` precisa ter (05/11, o módulo de idiomas): o módulo acima, o nível, a `ordem`
 * na trilha (06/11: a fila traz as novas por ela), o estado da repetição, o intervalo em dias, a próxima revisão e as Days do uso de verdade. Os nomes são o esquema do cartão,
 * o mesmo em toda língua: o `lingua` diz a língua, e nada no código é de uma língua.
 */
export const CAMPOS_DO_APRENDIZADO = ['modulo', 'nivel', 'ordem', 'estado', 'intervalo', 'proxima_revisao', 'usado_em'] as const;
/** Os três estados da repetição, na ordem: a frase nova, a que se aprende e a consolidada (o intervalo na marca). */
export const ESTADOS_DO_APRENDIZADO = ['nova', 'aprendendo', 'consolidada'] as const;
export type EstadoDoAprendizado = typeof ESTADOS_DO_APRENDIZADO[number];

/** A fila do dia: as novas de partida, o teto das novas e o teto das revisões vencidas. */
export interface FilaDoAprendizado { novas: number; maxNovas: number; maxRevisoes: number }

/**
 * O módulo especial do aprendizado (05/11): a escada dos intervalos em dias (1·3·7·14·30·60·120), o intervalo a partir
 * do qual a frase está consolidada e a fila do dia. Os números são dele e moram no modelo, não no código.
 */
export interface DomainLearning {
    escada: number[];
    consolidada: number;
    fila: FilaDoAprendizado;
    /** O `type` das peças lógicas do módulo (a peça que o centro mostra por nível); sem a chave, o centro não as lista. */
    pecas?: string;
}

/**
 * Os tipos de sinal que a Missão calcula (`src/missao/sinais.ts`), a única lista: o `TipoDeSinal` da Missão sai
 * daqui, e uma situação (`situacoes.quando`, o P13) só se declara sobre um deles ou sobre um estado do tipo.
 * Nenhum sinal novo nasce no P13 (decisão 7 da proposta, 02/11); o juiz em Python tem a mesma lista
 * (`SITUATION_SIGNALS`), conferida pelos casos compartilhados.
 */
export const TIPOS_DE_SINAL = [
    'smart-sem-acao', 'prazo-vencido', 'ficou-de-antes', 'central-sem-movimento', 'semana-sem-plano',
    'sem-data', 'sem-projeto', 'sem-onde', 'sem-estimativa',
    /** P10b: uma data declarada no modelo de um tipo, de hoje em diante (a saída planejada). */
    'prazo-adiante',
    /** P10b: o último dia que os dias declarados permitem, contados da chegada no lugar (o visto). */
    'limite-no-lugar',
    /**
     * 02/11 (a viagem nos ciclos, §3, seção A conferência das datas): as datas de notas seguidas que não fecham
     * (a noite sem hospedagem, duas reservas na mesma noite, a saída antes da entrada, a data passada numa reserva aberta).
     */
    'datas-que-nao-fecham',
    /**
     * 02/11 (o inventário da aposentadoria, item 8, as conferências do plano da semana): a tarefa agendada fora
     * da semana que declara, a data planejada depois do prazo, os dias úteis sem nada marcado (no nó da semana)
     * e o projeto com tarefa na semana e fora do foco do trimestre (no nó do projeto).
     */
    'fora-da-semana', 'depois-do-prazo', 'dia-util-vazio', 'fora-do-foco',
    /**
     * 02/11 (o inventário da aposentadoria, itens 3 e 7, a direção do trabalho): a ação para fora mais antiga do
     * projeto com duas ou mais ações para dentro criadas depois dela (na tarefa) e a SMART com verbo sem fim e
     * sem entrega observável nem critério de suficiente (na SMART).
     */
    'pronto-para-exposicao', 'sem-condicao-de-fim',
    /** 02/11 (o 🔄 Revisar o trecho na SMART do trecho): a SMART do trecho concluída e ainda sem `revisado`. */
    'trecho-sem-revisao',
    /**
     * 05/11 (a conferência de uma pesquisa, declarada no `sinais.conferencias` do modelo): a tarefa de pesquisa
     * aberta sem a seção da conferência, e a concluída com item da conferência ainda aberto.
     */
    'pesquisa-sem-conferencia', 'conferencia-aberta',
    /**
     * 05/11 (a campanha da semana), só informativos: o valor de um campo (o canal) sem nota publicada na semana de hoje
     * (`cadencias` no modelo) e a nota que precisa da de origem e não a tem (o corte sem a peça-mãe, `origens`).
     */
    'sem-peca-publicada', 'sem-peca-mae',
    /**
     * 05/11 (o gerenciamento dos destinos), só informativo: a nota do tipo, num dos estados declarados, com o campo
     * vazio (a peça editada ou aprovada sem destino, `vazios` no modelo).
     */
    'campo-vazio',
] as const;

/** O prefixo da condição pelo estado do tipo (`estado:<estado>`, o `estado` de uma linha da tabela). */
export const QUANDO_ESTADO = 'estado:';

/**
 * Uma situação do nó (o P13, aprovado em 02/11): `quando` é um tipo de sinal (`TIPOS_DE_SINAL`) ou
 * `estado:<estado>` da tabela do tipo; `situacao` é uma parada do 🧭 (`<router>.<passo>`); `protocolos` é o
 * recorte dos destinos dela que sobe no nó (o juiz confere que cada um é destino daquela parada).
 */
export interface DomainSituation {
    quando: string; situacao: string; protocolos: string[];
    /**
     * As respostas com que cada protocolo do recorte abre a partir do nó (06/11), como o `preencher` do bloco
     * `protocolos`: protocolo → passo → ficha (`{{no.nome}}`, `{{no.caminho}}`, `{{no.<campo>}}`). O 🔄 que a tarefa
     * em curso sobe abre com a tarefa do nó, e não com a do dia.
     */
    preencher?: Record<string, Record<string, string>>;
}

/**
 * A publicação de um formato (03/11, o ramo Criação): o tipo neutro (`video`, `artigo`, `imagem`…), o rótulo, os
 * campos do modelo que ela pede (a plataforma, o dia, o link) e o estado em que a peça está publicada (o "no ar").
 * A plataforma concreta é um campo que a pessoa preenche, nunca um valor do modelo.
 */
export interface DomainPublication { id: string; rotulo: string; campos: string[]; estado: string }

/** O rótulo e o vazio de um campo num formato (o `de` do vídeo é "Corte de"; o do resto, "Desdobramento de"). */
export interface DomainFormatField { rotulo?: string; vazio?: string }

/**
 * Um formato da peça (03/11): o valor do campo de formato, o nome à vista, a publicação dele, os formatos que podem
 * desdobrar dele, se os hábitos dos estados marcam nele, os campos que não valem nele e o rótulo próprio de um campo.
 */
export interface DomainFormat {
    valor: string;
    rotulo: string;
    publicacao: string;
    desdobramentos: string[];
    /** `false`: o hábito dos estados não marca neste formato (o 🎥 Gravar 1 conteúdo é do vídeo). */
    habitos: boolean;
    /** Os campos do modelo que não valem neste formato: o painel não os mostra. */
    fora: string[];
    campos: Record<string, DomainFormatField>;
}

/** Os formatos de um tipo (03/11): o campo que diz o formato da nota, os formatos e as publicações. */
export interface DomainFormats { campo: string; valores: DomainFormat[]; publicacoes: DomainPublication[] }

/** O modelo que escolhe: o que o `rankWith`, o `escolher` do núcleo e o painel leem. */
export type ChoiceModel = DomainModel & { escolher: DomainChoice };

/** O que faz: diz se o modelo declara `escolher`. */
export function hasChoice(modelo: DomainModel | null | undefined): modelo is ChoiceModel {
    return !!modelo && !!modelo.escolher;
}

const SNAKE = /^[a-z][a-z0-9_]*$/;
/** A chave de uma resposta do protocolo: o id do passo, ou uma variável do motor (`_context_date`). */
const ANSWER_KEY = /^_?[a-z][a-z0-9_]*$/;
const MODEL_KEYS = ['dominio', 'descricao', 'candidatos', 'escolher', 'registros', 'contagens', 'estados', 'legado', 'campos', 'criar', 'protocolos', 'situacoes', 'sinais', 'formacao', 'formatos', 'aprendizado'];
const LEARNING_KEYS = ['escada', 'consolidada', 'fila', 'pecas'];
const LEARNING_QUEUE_KEYS = ['novas', 'maxNovas', 'maxRevisoes'];
const FORMATS_KEYS = ['campo', 'valores', 'publicacoes'];
const FORMAT_KEYS = ['valor', 'rotulo', 'publicacao', 'desdobramentos', 'habitos', 'fora', 'campos'];
const FORMAT_FIELD_KEYS = ['rotulo', 'vazio'];
const PUBLICATION_KEYS = ['id', 'rotulo', 'campos', 'estado'];
const PROTOCOL_KEYS = ['id', 'papel', 'preencher'];
const FORMACAO_KEYS = ['vertical', 'horizontal', 'colunas', 'mais', 'aVista'];
/** O nome da coluna do nó do ramo na disposição declarada (`formacao.colunas`). */
export const COLUNA_DO_CENTRO = 'centro';
/**
 * O nome da coluna do que fica ao lado do nó do ramo (02/11): os links da nota (os valores, o foco), as notas
 * que apontam para ela e os Suportes e decisões, num lugar só, o mesmo em toda escala; o que nenhuma coluna
 * nomeia também vai para ela.
 */
export const COLUNA_DO_LADO = 'lado';
const FIELD_KEYS = ['nome', 'rotulo', 'tipo', 'formato', 'valores', 'alvo', 'multiplo', 'ramo', 'obrigatorio', 'sugestao', 'dono', 'editar', 'criar', 'vazio', 'planejado', 'conhecidos', 'antes', 'opcoes'];
/** As chaves das opções que vêm de outra nota (`opcoes`, 05/11). */
const OPCOES_KEYS = ['de', 'lista', 'regra', 'por'];
const SUGGESTION_KEYS = ['de', 'valor', 'caminho'];
const CREATE_KEYS = ['via', 'protocolo', 'completo', 'passos', 'nome', 'datas', 'titulo', 'casa', 'molde'];
const HOME_KEYS = ['campo', 'subpasta'];
const SITUATION_KEYS = ['quando', 'situacao', 'protocolos', 'preencher'];
/** A parada do 🧭: o id do router e o id do passo. */
const STOP = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const OWNER = /^(nota|derivado|protocolo:[a-z][a-z0-9_]*(#[a-z][a-z0-9_]*)?)$/;
const STEP_ID = /^P\d+[a-z]?$/;
const STATE_KEYS = ['valor', 'estado', 'rotulo', 'mostrar', 'marca', 'lugar', 'coluna', 'habito'];
const CANDIDATE_KEYS = ['pasta', 'type', 'vinculo'];
const CHOICE_KEYS = ['categorias', 'filtros', 'referencias', 'rotulos'];
const CATEGORY_KEYS = ['chave', 'regra', 'campo', 'referencia', 'faixas', 'senao', 'valores'];
const FILTER_KEYS = ['regra', 'campo', 'valores', 'referencia', 'limite', 'motivo'];
const REFERENCE_KEYS = ['nota', 'campo'];
const RECORD_KEYS = ['tipo', 'descricao', 'campos'];
const COUNT_KEYS = ['tipo', 'onde', 'rotulo'];

const isObject = (value: unknown): value is Record<string, any> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isTextList = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0 && value.every(isText);
/** O valor na mensagem: só texto aparece (o juiz em Python escreve igual). */
const shown = (value: unknown): string => typeof value === 'string' ? value : '';

/** O que faz: as chaves de `value` fora de `allowed`, como problemas com `where`. */
function unknownKeys(value: Record<string, any>, allowed: string[], where: string): string[] {
    return Object.keys(value).filter(key => !allowed.includes(key)).map(key => `${where}: chave desconhecida '${key}'`);
}

/** O que faz: as faixas efetivas de uma categoria `faixa_relativa`. */
export function bandsOf(category: Pick<DomainCategory, 'faixas' | 'senao'>): { faixas: RelativeBand[]; senao: string } {
    return {
        faixas: Array.isArray(category.faixas) && category.faixas.length ? category.faixas : [...DEFAULT_BANDS],
        senao: isText(category.senao) ? category.senao : DEFAULT_BAND_ELSE,
    };
}

/**
 * O que faz: confere a forma de um modelo de domínio e o devolve tipado.
 * Por quê: o modelo é escrito à mão; chave desconhecida, regra inventada ou referência
 * sem declaração faria a escolha mentir em silêncio (um campo que "pesa" e não pesa).
 * Entra → sai: o JSON lido e o nome do arquivo (sem `.json`, opcional) → { modelo,
 * problemas }. `modelo` é `null` só quando nem a forma básica existe; com problemas
 * menores ele vem, e os problemas são ditos.
 * Erro e ataque: lista no lugar de objeto, número no lugar de texto, `pesos` dentro do
 * modelo (a segunda tabela), domínio com nome diferente do arquivo.
 * Prova: tests/engine/domainModel.test.ts e os casos compartilhados com o juiz.
 */
export function parseDomainModel(raw: unknown, fileStem?: string): { modelo: DomainModel | null; problemas: string[]; categorias: DomainCategory[] } {
    const problemas: string[] = [];
    if (!isObject(raw)) return { modelo: null, problemas: ['o modelo não é um objeto JSON'], categorias: [] };
    problemas.push(...unknownKeys(raw, MODEL_KEYS, 'modelo'));
    const dominio = raw.dominio;
    if (!isText(dominio) || !SNAKE.test(dominio)) problemas.push('modelo: `dominio` precisa ser um nome em snake_case');
    else if (fileStem !== undefined && dominio !== fileStem) problemas.push(`modelo: \`dominio\` '${dominio}' difere do arquivo '${fileStem}.json'`);
    if (!isText(raw.descricao)) problemas.push('modelo: `descricao` precisa ser texto');

    const candidatos = isObject(raw.candidatos) ? raw.candidatos : null;
    if (!candidatos) problemas.push('modelo: `candidatos` precisa ser um objeto');
    else {
        problemas.push(...unknownKeys(candidatos, CANDIDATE_KEYS, 'candidatos'));
        if (!isText(candidatos.pasta)) problemas.push('candidatos: `pasta` precisa ser texto');
        for (const key of ['type', 'vinculo']) {
            if (candidatos[key] !== undefined && !isText(candidatos[key])) problemas.push(`candidatos: \`${key}\` precisa ser texto`);
        }
    }

    // `escolher` é opcional (Passo 0, 0b); quando vem, precisa ser um objeto.
    if (raw.escolher !== undefined && !isObject(raw.escolher)) {
        problemas.push('modelo: `escolher` precisa ser um objeto');
        return { modelo: null, problemas, categorias: [] };
    }
    const temEscolher = isObject(raw.escolher);
    const escolher: Record<string, any> = temEscolher ? raw.escolher : {};
    problemas.push(...unknownKeys(escolher, CHOICE_KEYS, 'escolher'));

    const referencias: Record<string, DomainReference> = {};
    if (escolher.referencias !== undefined && !isObject(escolher.referencias)) problemas.push('escolher: `referencias` precisa ser um objeto');
    for (const [name, ref] of Object.entries(isObject(escolher.referencias) ? escolher.referencias : {})) {
        const where = `referencia '${name}'`;
        if (!isObject(ref)) { problemas.push(`${where}: precisa ser um objeto { nota, campo }`); continue; }
        problemas.push(...unknownKeys(ref, REFERENCE_KEYS, where));
        if (!isText(ref.nota) || !isText(ref.campo)) { problemas.push(`${where}: \`nota\` e \`campo\` precisam ser texto`); continue; }
        referencias[name] = { nota: ref.nota, campo: ref.campo };
    }

    const categorias: DomainCategory[] = [];
    const seen = new Set<string>();
    if (temEscolher && (!Array.isArray(escolher.categorias) || escolher.categorias.length === 0)) problemas.push('escolher: `categorias` precisa ser uma lista com ao menos uma categoria');
    for (const [index, cat] of (Array.isArray(escolher.categorias) ? escolher.categorias : []).entries()) {
        const where = `categoria ${index + 1}`;
        if (!isObject(cat)) { problemas.push(`${where}: precisa ser um objeto`); continue; }
        problemas.push(...unknownKeys(cat, CATEGORY_KEYS, where));
        if (!isText(cat.chave) || !SNAKE.test(cat.chave)) { problemas.push(`${where}: \`chave\` precisa ser um nome em snake_case`); continue; }
        const label = `categoria '${cat.chave}'`;
        if (seen.has(cat.chave)) { problemas.push(`${label}: chave repetida`); continue; }
        seen.add(cat.chave);
        if (!CATEGORY_RULES.includes(cat.regra)) { problemas.push(`${label}: regra desconhecida '${shown(cat.regra)}' (valor, faixa_relativa, contagem, booleano)`); continue; }
        if (!isText(cat.campo)) { problemas.push(`${label}: \`campo\` precisa ser texto`); continue; }
        const extra = (key: string) => cat[key] !== undefined;
        if (cat.regra === 'faixa_relativa') {
            if (!isText(cat.referencia) || !referencias[cat.referencia]) { problemas.push(`${label}: \`referencia\` precisa ser uma das \`escolher.referencias\``); continue; }
            if (extra('faixas')) {
                const ok = Array.isArray(cat.faixas) && cat.faixas.length > 0 && cat.faixas.every((band: any, i: number, all: any[]) =>
                    isObject(band) && isNumber(band.ate) && isText(band.chave) && SNAKE.test(band.chave)
                    && Object.keys(band).every(k => k === 'ate' || k === 'chave')
                    && (i === 0 || band.ate > all[i - 1].ate));
                if (!ok) { problemas.push(`${label}: \`faixas\` precisa ser uma lista de { ate, chave } em ordem crescente`); continue; }
            }
            if (extra('senao') && (!isText(cat.senao) || !SNAKE.test(cat.senao))) { problemas.push(`${label}: \`senao\` precisa ser um nome em snake_case`); continue; }
        } else {
            for (const key of ['referencia', 'faixas', 'senao']) if (extra(key)) problemas.push(`${label}: \`${key}\` só vale na regra faixa_relativa`);
        }
        if (cat.regra === 'valor') {
            if (extra('valores') && !isTextList(cat.valores)) { problemas.push(`${label}: \`valores\` precisa ser uma lista de textos`); continue; }
        } else if (extra('valores')) problemas.push(`${label}: \`valores\` só vale na regra valor`);
        categorias.push({
            chave: cat.chave,
            regra: cat.regra,
            campo: cat.campo,
            ...(isText(cat.referencia) ? { referencia: cat.referencia } : {}),
            ...(Array.isArray(cat.faixas) ? { faixas: cat.faixas.map((b: any) => ({ ate: b.ate, chave: b.chave })) } : {}),
            ...(isText(cat.senao) ? { senao: cat.senao } : {}),
            ...(isTextList(cat.valores) ? { valores: [...cat.valores] } : {}),
        });
    }

    const filtros: DomainFilter[] = [];
    if (escolher.filtros !== undefined && !Array.isArray(escolher.filtros)) problemas.push('escolher: `filtros` precisa ser uma lista');
    for (const [index, filtro] of (Array.isArray(escolher.filtros) ? escolher.filtros : []).entries()) {
        const where = `filtro ${index + 1}`;
        if (!isObject(filtro)) { problemas.push(`${where}: precisa ser um objeto`); continue; }
        problemas.push(...unknownKeys(filtro, FILTER_KEYS, where));
        if (!FILTER_RULES.includes(filtro.regra)) { problemas.push(`${where}: regra desconhecida '${shown(filtro.regra)}' (igual, relativo_maior_que)`); continue; }
        if (!isText(filtro.campo) || !isText(filtro.motivo)) { problemas.push(`${where}: \`campo\` e \`motivo\` precisam ser texto`); continue; }
        if (filtro.regra === 'igual') {
            if (!isTextList(filtro.valores)) { problemas.push(`${where}: \`valores\` precisa ser uma lista de textos`); continue; }
            for (const key of ['referencia', 'limite']) if (filtro[key] !== undefined) problemas.push(`${where}: \`${key}\` só vale na regra relativo_maior_que`);
            filtros.push({ regra: 'igual', campo: filtro.campo, valores: [...filtro.valores], motivo: filtro.motivo });
        } else {
            if (!isText(filtro.referencia) || !referencias[filtro.referencia]) { problemas.push(`${where}: \`referencia\` precisa ser uma das \`escolher.referencias\``); continue; }
            if (!isNumber(filtro.limite)) { problemas.push(`${where}: \`limite\` precisa ser número`); continue; }
            if (filtro.valores !== undefined) problemas.push(`${where}: \`valores\` só vale na regra igual`);
            filtros.push({ regra: 'relativo_maior_que', campo: filtro.campo, referencia: filtro.referencia, limite: filtro.limite, motivo: filtro.motivo });
        }
    }

    const rotulos: Record<string, string> = {};
    if (escolher.rotulos !== undefined && !isObject(escolher.rotulos)) problemas.push('escolher: `rotulos` precisa ser um objeto');
    for (const [key, text] of Object.entries(isObject(escolher.rotulos) ? escolher.rotulos : {})) {
        if (!seen.has(key) && !referencias[key]) problemas.push(`rotulos: '${key}' não é categoria nem referência`);
        else if (!isText(text)) problemas.push(`rotulos: '${key}' precisa ser texto`);
        else rotulos[key] = text;
    }

    const registros: DomainRecordType[] = [];
    if (raw.registros !== undefined && !Array.isArray(raw.registros)) problemas.push('modelo: `registros` precisa ser uma lista');
    for (const [index, reg] of (Array.isArray(raw.registros) ? raw.registros : []).entries()) {
        const where = `registro ${index + 1}`;
        if (!isObject(reg)) { problemas.push(`${where}: precisa ser um objeto`); continue; }
        problemas.push(...unknownKeys(reg, RECORD_KEYS, where));
        if (!isText(reg.tipo) || !SNAKE.test(reg.tipo)) { problemas.push(`${where}: \`tipo\` precisa ser um nome em snake_case`); continue; }
        if (reg.descricao !== undefined && !isText(reg.descricao)) problemas.push(`${where}: \`descricao\` precisa ser texto`);
        if (reg.campos !== undefined && !isTextList(reg.campos)) problemas.push(`${where}: \`campos\` precisa ser uma lista de textos`);
        registros.push({ tipo: reg.tipo, ...(isText(reg.descricao) ? { descricao: reg.descricao } : {}), ...(isTextList(reg.campos) ? { campos: [...reg.campos] } : {}) });
    }

    const contagens: DomainCount[] = [];
    if (raw.contagens !== undefined && !Array.isArray(raw.contagens)) problemas.push('modelo: `contagens` precisa ser uma lista');
    for (const [index, count] of (Array.isArray(raw.contagens) ? raw.contagens : []).entries()) {
        const where = `contagem ${index + 1}`;
        if (!isObject(count)) { problemas.push(`${where}: precisa ser um objeto`); continue; }
        problemas.push(...unknownKeys(count, COUNT_KEYS, where));
        if (!isText(count.tipo) || !SNAKE.test(count.tipo)) { problemas.push(`${where}: \`tipo\` precisa ser um nome em snake_case`); continue; }
        const ondeOk = count.onde === undefined || (isObject(count.onde)
            && Object.values(count.onde).every(v => isText(v) || isTextList(v)));
        if (!ondeOk) { problemas.push(`${where}: \`onde\` precisa ser um objeto de campo → texto ou lista de textos`); continue; }
        if (count.rotulo !== undefined && !isText(count.rotulo)) problemas.push(`${where}: \`rotulo\` precisa ser texto`);
        contagens.push({ tipo: count.tipo, ...(isObject(count.onde) ? { onde: { ...count.onde } } : {}), ...(isText(count.rotulo) ? { rotulo: count.rotulo } : {}) });
    }

    const estados = parseStates(raw.estados, problemas);
    const legado = parseLegacy(raw.legado, problemas);
    const campos = parseFields(raw.campos, legado, problemas);
    const criar = parseCreate(raw.criar, campos, problemas);
    const protocolos = parseProtocols(raw.protocolos, problemas);
    const situacoes = parseSituations(raw.situacoes, estados, problemas);
    if (raw.sinais !== undefined && !isObject(raw.sinais)) problemas.push('modelo: `sinais` precisa ser um objeto (os números do tipo)');
    else if (isObject(raw.sinais)) problemas.push(...signalProblems(raw.sinais));
    const formacao = parseFormacao(raw.formacao, problemas);
    const formatos = parseFormats(raw.formatos, campos, estados, problemas);
    const aprendizado = parseLearning(raw.aprendizado, campos, problemas);

    if (!isText(dominio) || !SNAKE.test(dominio) || !candidatos || !isText(candidatos.pasta)) return { modelo: null, problemas, categorias };
    return {
        categorias,
        modelo: {
            dominio,
            descricao: isText(raw.descricao) ? raw.descricao : '',
            candidatos: {
                pasta: candidatos.pasta,
                ...(isText(candidatos.type) ? { type: candidatos.type } : {}),
                ...(isText(candidatos.vinculo) ? { vinculo: candidatos.vinculo } : {}),
            },
            ...(temEscolher ? { escolher: { categorias, filtros, referencias, rotulos } } : {}),
            registros,
            contagens,
            estados,
            legado,
            campos,
            ...(criar ? { criar } : {}),
            protocolos,
            situacoes,
            sinais: isObject(raw.sinais) ? { ...raw.sinais } : {},
            ...(formacao ? { formacao } : {}),
            ...(formatos ? { formatos } : {}),
            ...(aprendizado ? { aprendizado } : {}),
        },
        problemas,
    };
}

/**
 * O que faz: confere o bloco `aprendizado` de um modelo (05/11, o módulo de idiomas) e devolve a escada e a fila.
 * Por quê: o cartão e a peça lógica são tipos próprios do aprendizado; o que é próprio de um domínio vira módulo
 * especial, declarado no modelo, e os números da repetição (a escada, o consolidado, a fila) são dele. O juiz em Python (`_learning_problems`)
 * diz as mesmas mensagens, na mesma ordem.
 * Entra → sai: o bloco cru, os campos já lidos e a lista de problemas (acrescida) → `DomainLearning`, ou `undefined`
 * sem a chave (ou com o bloco ruim).
 * Erro e ataque: a escada vazia, fora de ordem, com zero, número quebrado ou texto; o consolidado fora da escada; a
 * fila com número que não é inteiro, as novas acima do teto; o modelo sem um dos campos do esquema, ou com o `estado`
 * sem os três estados: o problema é dito e o bloco fica de fora.
 * Prova: os casos compartilhados com o juiz (`tests/fixtures/dominio/casos.json`) e tests/engine/repeticao.test.ts.
 */
function parseLearning(raw: unknown, campos: readonly DomainField[], problemas: string[]): DomainLearning | undefined {
    if (raw === undefined) return undefined;
    if (!isObject(raw)) { problemas.push('aprendizado: precisa ser um objeto { escada, consolidada, fila }'); return undefined; }
    const antes = problemas.length;
    problemas.push(...unknownKeys(raw, LEARNING_KEYS, 'aprendizado'));
    const inteiro = (v: unknown, min: number) => typeof v === 'number' && Number.isInteger(v) && v >= min;
    const escada = Array.isArray(raw.escada) ? raw.escada : null;
    if (!escada || !escada.length || !escada.every(v => inteiro(v, 1))) problemas.push('aprendizado: `escada` precisa ser uma lista de dias inteiros de 1 para cima');
    else if (escada.some((v, i) => i > 0 && v <= escada[i - 1])) problemas.push('aprendizado: `escada` precisa crescer a cada degrau');
    else if (!escada.includes(raw.consolidada)) problemas.push('aprendizado: `consolidada` precisa ser um degrau da `escada`');
    const fila = isObject(raw.fila) ? raw.fila : null;
    if (!fila) problemas.push('aprendizado: `fila` precisa ser um objeto { novas, maxNovas, maxRevisoes }');
    else {
        problemas.push(...unknownKeys(fila, LEARNING_QUEUE_KEYS, 'aprendizado.fila'));
        for (const k of LEARNING_QUEUE_KEYS) if (!inteiro(fila[k], 0)) problemas.push(`aprendizado.fila: \`${k}\` precisa ser um inteiro de 0 para cima`);
        if (inteiro(fila.novas, 0) && inteiro(fila.maxNovas, 0) && fila.novas > fila.maxNovas) problemas.push('aprendizado.fila: `novas` passa do `maxNovas`');
    }
    if (raw.pecas !== undefined && (!isText(raw.pecas) || !SNAKE.test(raw.pecas))) problemas.push('aprendizado: `pecas` precisa ser o `type` das peças, em snake_case');
    const nomes = new Set(campos.map(c => c.nome));
    const faltam = CAMPOS_DO_APRENDIZADO.filter(n => !nomes.has(n));
    if (faltam.length) problemas.push(`aprendizado: o modelo precisa dos campos ${faltam.map(n => `'${n}'`).join(', ')}`);
    const estado = campos.find(c => c.nome === 'estado');
    const valores = estado && Array.isArray(estado.valores) ? estado.valores : [];
    if (estado && ESTADOS_DO_APRENDIZADO.some(e => !valores.includes(e))) problemas.push(`aprendizado: o campo 'estado' precisa ter os valores ${ESTADOS_DO_APRENDIZADO.join(', ')}`);
    if (problemas.length > antes) return undefined;
    return { escada: [...(escada as number[])], consolidada: raw.consolidada as number, fila: { novas: fila!.novas, maxNovas: fila!.maxNovas, maxRevisoes: fila!.maxRevisoes }, ...(isText(raw.pecas) ? { pecas: raw.pecas } : {}) };
}

/**
 * O que faz: confere o bloco `formatos` de um modelo (03/11, o ramo Criação) e devolve os formatos e as publicações válidos.
 * Por quê: cada formato tem a sua publicação (o vídeo, o artigo, o carrossel, a imagem) e a declara no modelo do
 * tipo, e não no código. O juiz em Python
 * (`_format_problems`) diz as mesmas mensagens, na mesma ordem.
 * Entra → sai: o bloco cru, os campos e os estados já lidos e a lista de problemas (acrescida) → `DomainFormats`, ou
 * `undefined` sem a chave (ou sem campo de formato válido).
 * Erro e ataque: o campo que não é escolha do modelo; o formato fora dos valores dele, repetido, ou valor do campo sem
 * formato; a publicação que não existe, com campo que o modelo não tem ou estado que a tabela não tem; o desdobramento
 * que não é formato; o `fora` e o `campos` com nome que o modelo não tem: o problema é dito e a parte fica de fora.
 * Prova: os casos compartilhados com o juiz (`tests/fixtures/dominio/casos.json`) e tests/engine/formatosDoTipo.test.ts.
 */
function parseFormats(raw: unknown, campos: readonly DomainField[], estados: readonly DomainState[], problemas: string[]): DomainFormats | undefined {
    if (raw === undefined) return undefined;
    if (!isObject(raw)) { problemas.push('formatos: precisa ser um objeto { campo, valores, publicacoes }'); return undefined; }
    problemas.push(...unknownKeys(raw, FORMATS_KEYS, 'formatos'));
    const nomes = new Set(campos.map(c => c.nome));
    const campo = campos.find(c => c.nome === raw.campo && c.tipo === 'escolha' && Array.isArray(c.valores));
    if (!campo) { problemas.push('formatos: `campo` precisa ser um campo escolha do modelo'); return undefined; }
    const aceitos = campo.valores as string[];
    const valoresDeEstado = new Set(estados.map(e => e.valor));
    const publicacoes: DomainPublication[] = [];
    if (!Array.isArray(raw.publicacoes) || raw.publicacoes.length === 0) problemas.push('formatos: `publicacoes` precisa ser uma lista com ao menos uma publicação');
    for (const [index, p] of (Array.isArray(raw.publicacoes) ? raw.publicacoes : []).entries()) {
        const where = `publicação ${index + 1}`;
        if (!isObject(p)) { problemas.push(`${where}: precisa ser um objeto`); continue; }
        problemas.push(...unknownKeys(p, PUBLICATION_KEYS, where));
        if (!isText(p.id) || !SNAKE.test(p.id)) { problemas.push(`${where}: \`id\` precisa ser um nome em snake_case`); continue; }
        const label = `publicação '${p.id}'`;
        if (publicacoes.some(x => x.id === p.id)) { problemas.push(`${label}: id repetido`); continue; }
        if (!isText(p.rotulo)) { problemas.push(`${label}: \`rotulo\` precisa ser texto`); continue; }
        if (!isTextList(p.campos)) { problemas.push(`${label}: \`campos\` precisa ser uma lista de textos`); continue; }
        const fora = p.campos.filter((n: string) => !nomes.has(n));
        if (fora.length) { problemas.push(`${label}: o campo '${fora[0]}' não é do modelo`); continue; }
        if (!isText(p.estado) || !valoresDeEstado.has(p.estado)) { problemas.push(`${label}: \`estado\` precisa ser um valor da tabela de estados`); continue; }
        publicacoes.push({ id: p.id, rotulo: p.rotulo, campos: [...p.campos], estado: p.estado });
    }
    const valores: DomainFormat[] = [];
    if (!Array.isArray(raw.valores) || raw.valores.length === 0) problemas.push('formatos: `valores` precisa ser uma lista com ao menos um formato');
    const declarados = (Array.isArray(raw.valores) ? raw.valores : []).filter(isObject).map((f: Record<string, any>) => f.valor).filter(isText);
    for (const [index, f] of (Array.isArray(raw.valores) ? raw.valores : []).entries()) {
        const where = `formato ${index + 1}`;
        if (!isObject(f)) { problemas.push(`${where}: precisa ser um objeto`); continue; }
        problemas.push(...unknownKeys(f, FORMAT_KEYS, where));
        if (!isText(f.valor) || !aceitos.includes(f.valor)) { problemas.push(`${where}: \`valor\` precisa ser um dos valores do campo ${campo.nome}`); continue; }
        const label = `formato '${f.valor}'`;
        if (valores.some(x => x.valor === f.valor)) { problemas.push(`${label}: valor repetido`); continue; }
        if (!isText(f.rotulo)) { problemas.push(`${label}: \`rotulo\` precisa ser texto`); continue; }
        if (!isText(f.publicacao) || !publicacoes.some(p => p.id === f.publicacao)) { problemas.push(`${label}: \`publicacao\` precisa ser uma das publicações declaradas`); continue; }
        const desdobramentos = f.desdobramentos === undefined ? [] : f.desdobramentos;
        if (!Array.isArray(desdobramentos) || !desdobramentos.every(isText)) { problemas.push(`${label}: \`desdobramentos\` precisa ser uma lista de textos`); continue; }
        const semFormato = desdobramentos.find((d: string) => !declarados.includes(d));
        if (semFormato) { problemas.push(`${label}: o desdobramento '${semFormato}' não é um formato declarado`); continue; }
        if (f.habitos !== undefined && !isBool(f.habitos)) { problemas.push(`${label}: \`habitos\` precisa ser true ou false`); continue; }
        const fora = f.fora === undefined ? [] : f.fora;
        if (!Array.isArray(fora) || !fora.every(isText)) { problemas.push(`${label}: \`fora\` precisa ser uma lista de textos`); continue; }
        const foraDoModelo = fora.find((n: string) => !nomes.has(n));
        if (foraDoModelo) { problemas.push(`${label}: o campo '${foraDoModelo}' do \`fora\` não é do modelo`); continue; }
        const proprios: Record<string, DomainFormatField> = {};
        if (f.campos !== undefined && !isObject(f.campos)) { problemas.push(`${label}: \`campos\` precisa ser um objeto campo → { rotulo, vazio }`); continue; }
        let ruim = false;
        for (const [nome, v] of Object.entries(isObject(f.campos) ? f.campos : {})) {
            if (!nomes.has(nome)) { problemas.push(`${label}: o campo '${nome}' não é do modelo`); ruim = true; continue; }
            if (!isObject(v) || !Object.keys(v).length || Object.values(v).some(x => !isText(x))) { problemas.push(`${label}: o campo '${nome}' precisa de rotulo ou vazio em texto`); ruim = true; continue; }
            const extras = unknownKeys(v, FORMAT_FIELD_KEYS, `${label}, campo '${nome}'`);
            if (extras.length) { problemas.push(...extras); ruim = true; continue; }
            proprios[nome] = { ...(isText(v.rotulo) ? { rotulo: v.rotulo } : {}), ...(isText(v.vazio) ? { vazio: v.vazio } : {}) };
        }
        if (ruim) continue;
        valores.push({ valor: f.valor, rotulo: f.rotulo, publicacao: f.publicacao, desdobramentos: [...desdobramentos], habitos: f.habitos !== false, fora: [...fora], campos: proprios });
    }
    for (const v of aceitos) if (Array.isArray(raw.valores) && !declarados.includes(v)) problemas.push(`formatos: falta o formato '${v}' do campo ${campo.nome}`);
    return { campo: campo.nome, valores, publicacoes };
}

/**
 * O que faz: o formato de uma nota pelo campo que os formatos do modelo declaram; sem formatos, ou com um valor que
 * nenhum formato declara, `null`.
 * Por quê: 03/11, o ramo Criação: o painel, os rótulos e o hábito leem o formato da peça por aqui.
 * Entra → sai: os formatos do modelo e o frontmatter → o formato e a publicação dele, ou `null`.
 * Erro e ataque: o valor com espaços ou em maiúsculas casa igual; a lista de um item vale pelo item.
 */
export function formatoDaNota(formatos: DomainFormats | undefined, campos: Record<string, unknown> | null | undefined): { formato: DomainFormat; publicacao: DomainPublication | null } | null {
    if (!formatos) return null;
    const cru = campos?.[formatos.campo];
    const valor = String((Array.isArray(cru) ? cru[0] : cru) ?? '').trim().toLowerCase();
    const formato = valor ? formatos.valores.find(f => f.valor.toLowerCase() === valor) : undefined;
    if (!formato) return null;
    return { formato, publicacao: formatos.publicacoes.find(p => p.id === formato.publicacao) ?? null };
}

/**
 * O que faz: diz se uma nota está publicada pelo modelo do tipo: o estado dela (o `status`, pela tabela) é o estado da
 * publicação do formato dela ou um que vem depois dele na tabela, e não é um estado oculto (o arquivado).
 * Por quê: 05/11, a campanha da semana: a frente, o 📅 e o sinal de cadência contam "publicada" do mesmo jeito, pelo
 * que o modelo já declara (o "no ar" de cada publicação e a ordem dos estados: o revisado vem depois do no ar), e não
 * por uma lista de estados no código.
 * Entra → sai: o modelo (a tabela de estados e os formatos) e o frontmatter → publicada ou não.
 * Erro e ataque: sem formatos, sem o formato da nota, sem publicação nele, o estado que a tabela não tem ou o status
 * vazio: não publicada; o status em maiúsculas casa igual.
 * Prova: tests/engine/publicadaPeloModelo.test.ts.
 */
export function publicadaPeloModelo(modelo: Pick<DomainModel, 'estados' | 'formatos'>, campos: Record<string, unknown> | null | undefined): boolean {
    const publicacao = formatoDaNota(modelo.formatos, campos)?.publicacao;
    if (!publicacao) return false;
    const valor = String(campos?.status ?? '').trim().toLowerCase();
    const i = modelo.estados.findIndex(e => e.valor.toLowerCase() === valor);
    const desde = modelo.estados.findIndex(e => e.valor === publicacao.estado);
    return i >= 0 && desde >= 0 && i >= desde && modelo.estados[i].mostrar !== 'oculto';
}

/**
 * O que faz: os valores livres do campo `por` nas cadências declaradas no bloco `sinais` de um modelo (o `livres`).
 * Por quê: 05/11, o canal pessoal de testes ("sem obrigação"): ele não tem cadência, e nem o sinal da semana nem a conta
 * do publicado no 📅 o cobram quando não tem peça; uma leitura só para os dois.
 * Entra → sai: o bloco `sinais` e o nome do campo → os valores livres (texto, sem vazio).
 * Prova: tests/missao/sinaisDaCampanha.test.ts, tests/engine/publicadoDaSemana.test.ts.
 */
export function valoresLivres(sinais: Record<string, unknown> | undefined, por: string): string[] {
    const cadencias = Array.isArray(sinais?.cadencias) ? sinais.cadencias as Array<Record<string, unknown>> : [];
    return cadencias
        .filter(c => String(c?.por ?? '').trim() === por)
        .flatMap(c => (Array.isArray(c?.livres) ? c.livres : []).map(x => String(x ?? '').trim()).filter(Boolean));
}

/**
 * O que faz: o campo de data da publicação de um modelo com formatos: o primeiro campo `data` que alguma publicação pede
 * (o "vai ao ar em"), ou `null`.
 * Por quê: 05/11: a contagem do publicado na semana lê o dia de ir ao ar pelo que o modelo declara, sem o nome no código.
 * Prova: tests/engine/publicadaPeloModelo.test.ts.
 */
export function campoDaDataDePublicacao(modelo: Pick<DomainModel, 'campos' | 'formatos'>): string | null {
    const pedidos = new Set((modelo.formatos?.publicacoes ?? []).flatMap(p => p.campos));
    return modelo.campos.find(c => c.tipo === 'data' && pedidos.has(c.nome))?.nome ?? null;
}

/**
 * O que faz: os campos do modelo como valem para uma nota, pelo formato dela: sem os do `fora` do formato, sem os campos
 * de publicação que a publicação dele não pede, com o rótulo e o vazio próprios do formato, e o rótulo do campo de
 * formato dizendo a publicação ("Formato · publicação de vídeo"); sem formatos, ou com o formato que nenhum declara,
 * os campos do modelo como estão.
 * Por quê: 03/11, o ramo Criação: o vídeo é o primeiro formato e não muda ("Corte de", a bancada, o teleprompter, o
 * padrão), e cada outro formato mostra só o que vale para ele, com a publicação dele; o painel para ler e o de editar
 * leem esta lista, e nenhum tem código por formato.
 * Entra → sai: o modelo e o frontmatter → os campos, na ordem do modelo (cópias; o modelo não muda).
 * Erro e ataque: o campo de publicação que nenhuma publicação declara fica em todo formato; o rótulo próprio de um
 * campo que o formato tira não volta.
 */
export function camposNoFormato(modelo: Pick<DomainModel, 'campos' | 'formatos'>, campos: Record<string, unknown> | null | undefined): DomainField[] {
    const lido = formatoDaNota(modelo.formatos, campos);
    if (!lido || !modelo.formatos) return modelo.campos;
    const { formato, publicacao } = lido;
    const deAlgumaPublicacao = new Set(modelo.formatos.publicacoes.flatMap(p => p.campos));
    const out: DomainField[] = [];
    for (const campo of modelo.campos) {
        if (formato.fora.includes(campo.nome)) continue;
        if (deAlgumaPublicacao.has(campo.nome) && !(publicacao?.campos ?? []).includes(campo.nome)) continue;
        const proprio = formato.campos[campo.nome];
        const rotulo = campo.nome === modelo.formatos.campo && publicacao ? `${campo.rotulo} · ${publicacao.rotulo}` : proprio?.rotulo ?? campo.rotulo;
        out.push({ ...campo, rotulo, ...(proprio?.vazio ? { vazio: proprio.vazio } : {}) });
    }
    return out;
}

/**
 * O que faz: o frontmatter de uma nota com os nomes antigos dos campos lidos: o campo do modelo que a nota não tem (ou
 * tem vazio) toma o valor do primeiro nome do `antes` dele que a nota tem.
 * Por quê: 05/11, o gerenciamento dos destinos: o `plataforma` da peça virou `destinos` (uma lista), e as notas antigas
 * continuam valendo sem migrar; quem lê (o cartão, o painel, os sinais) lê pelo nome de agora.
 * Entra → sai: o modelo (os campos) e o frontmatter → uma cópia rasa com os campos preenchidos (a entrada não muda; sem
 * nada a ler, o mesmo objeto). O texto solto do nome antigo, no campo lista, vira a lista de um item.
 * Erro e ataque: o valor vazio (o texto em branco, a lista vazia) do nome antigo não conta; o campo que já tem valor
 * não muda; o nome antigo fica na nota como está (nada se grava).
 * Prova: tests/engine/destinosDaPeca.test.ts.
 */
export function camposComApelidos(modelo: Pick<DomainModel, 'campos'> | null | undefined, campos: Record<string, unknown>): Record<string, unknown> {
    const vazio = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
    let out: Record<string, unknown> | null = null;
    for (const campo of modelo?.campos ?? []) {
        if (!campo.antes?.length || !vazio(campos[campo.nome])) continue;
        const antigo = campo.antes.find(a => !vazio(campos[a]));
        if (!antigo) continue;
        const v = campos[antigo];
        (out ??= { ...campos })[campo.nome] = campo.tipo === 'lista' && !Array.isArray(v) ? [v] : v;
    }
    return out ?? campos;
}

/**
 * O que faz: as opções e o valor inicial de um campo lista pela outra nota (`opcoes`): as opções são a lista dela (os
 * perfis do canal); o inicial são as opções das linhas da regra dela ("<valor> → <opção>") cujo valor é o desta nota no
 * campo `por` (o formato), na ordem da regra, e o porquê em palavras.
 * Por quê: 05/11, o gerenciamento dos destinos: "para qual perfil ou rede vai cada conteúdo"; o canal diz os perfis e
 * para onde vai cada formato, e a peça parte disso (o operador tira ou põe um).
 * Entra → sai: o campo (com `opcoes`), o frontmatter desta nota, o da outra (ou `null`) e o nome dela → `{ opcoes,
 * inicial, porque }`, ou `null` (sem `opcoes`, ou sem a outra nota).
 * Erro e ataque: a linha da regra sem "→", ou com o valor de outro formato, não entra; a comparação ignora caixa,
 * acento e espaços; a opção da regra que a lista não tem entra assim mesmo (a regra é do operador); repetida, uma vez.
 * Prova: tests/engine/destinosDaPeca.test.ts.
 */
export function opcoesDaOutraNota(campo: Pick<DomainField, 'opcoes'>, campos: Record<string, unknown>, outra: Record<string, unknown> | null | undefined, nomeDaOutra = ''): { opcoes: string[]; inicial: string[]; porque: string } | null {
    const o = campo.opcoes;
    if (!o || !outra) return null;
    const textos = (v: unknown) => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]).map(x => String(x ?? '').trim()).filter(Boolean);
    const dobra = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    const sem = (lista: string[]) => lista.filter((x, i) => lista.findIndex(y => dobra(y) === dobra(x)) === i);
    const opcoes = sem(textos(outra[o.lista]));
    const valor = o.por ? dobra(textos(campos[o.por])[0] ?? '') : '';
    const inicial = !o.regra || !valor ? [] : sem(textos(outra[o.regra]).map(l => l.split('→')).filter(p => p.length === 2 && dobra(p[0]) === valor).map(p => p[1].trim()).filter(Boolean));
    const quem = nomeDaOutra || textos(campos[o.de])[0] || o.de;
    return { opcoes, inicial, porque: inicial.length ? `a regra de ${quem} para ${textos(campos[o.por!])[0]}` : `os perfis de ${quem}` };
}

/**
 * O que faz: confere a formação declarada num ramo ou num modelo de tipo e devolve os eixos válidos.
 * Por quê: a formação de cada ramo e de cada tipo (desde 30/10/2026) é declarada na configuração; o ramo
 * (`lerRamoPrincipal`) e o modelo (`parseDomainModel`) a leem por aqui, e o juiz em Python
 * (`formation_problems`) diz as mesmas mensagens.
 * Entra → sai: o valor cru da chave `formacao` e a lista de problemas (acrescida) → os eixos
 * declarados e válidos, ou `undefined` sem a chave (ou sem nenhum eixo válido).
 * Erro e ataque: lista, texto ou `null` no lugar do objeto; chave desconhecida; eixo fora das listas
 * fechadas (`FORMACAO_VERTICAL`, `FORMACAO_HORIZONTAL`) ou que não é texto: o problema é dito e o
 * eixo fica com o padrão. As `colunas` (02/11) que não são uma lista de nomes, que repetem um nome ou
 * que não têm o `centro`; o `mais` fora das colunas, ou no centro; o `aVista` que não é inteiro
 * positivo: o problema é dito e a chave fica de fora (o ramo volta à disposição do caminho).
 * Prova: tests/engine/domainModel.test.ts, tests/missao/ramoPrincipal.test.ts e os casos compartilhados.
 */
export function parseFormacao(raw: unknown, problemas: string[]): FormacaoDeclarada | undefined {
    if (raw === undefined) return undefined;
    if (!isObject(raw)) { problemas.push('formacao: precisa ser um objeto { vertical, horizontal }'); return undefined; }
    problemas.push(...unknownKeys(raw, FORMACAO_KEYS, 'formacao'));
    const out: FormacaoDeclarada = {};
    if (raw.vertical !== undefined) {
        if ((FORMACAO_VERTICAL as readonly unknown[]).includes(raw.vertical)) out.vertical = raw.vertical as EixoVertical;
        else problemas.push(`formacao: \`vertical\` desconhecido '${shown(raw.vertical)}' (${FORMACAO_VERTICAL.join(', ')})`);
    }
    if (raw.horizontal !== undefined) {
        if ((FORMACAO_HORIZONTAL as readonly unknown[]).includes(raw.horizontal)) out.horizontal = raw.horizontal as EixoHorizontal;
        else problemas.push(`formacao: \`horizontal\` desconhecido '${shown(raw.horizontal)}' (${FORMACAO_HORIZONTAL.join(', ')})`);
    }
    // As colunas do ramo (02/11): nomes, sem repetir, com o centro entre eles.
    if (raw.colunas !== undefined) {
        const lista = Array.isArray(raw.colunas) ? raw.colunas : null;
        const nomes = lista && lista.every(c => typeof c === 'string' && c.trim() !== '') ? (lista as string[]).map(c => c.trim()) : null;
        if (!nomes || !nomes.length) problemas.push('formacao: `colunas` precisa ser uma lista de nomes');
        else if (new Set(nomes).size !== nomes.length) problemas.push('formacao: `colunas` repete um nome');
        else if (!nomes.includes(COLUNA_DO_CENTRO)) problemas.push(`formacao: \`colunas\` precisa ter '${COLUNA_DO_CENTRO}' (o nó do ramo)`);
        else out.colunas = nomes;
    }
    if (raw.mais !== undefined) {
        if (typeof raw.mais !== 'string' || !out.colunas || !out.colunas.includes(raw.mais) || raw.mais === COLUNA_DO_CENTRO) problemas.push(`formacao: \`mais\` precisa ser uma das \`colunas\`, fora do centro ('${shown(raw.mais)}')`);
        else out.mais = raw.mais;
    }
    if (raw.aVista !== undefined) {
        if (typeof raw.aVista === 'number' && Number.isInteger(raw.aVista) && raw.aVista >= 1) out.aVista = raw.aVista;
        else problemas.push('formacao: `aVista` precisa ser um inteiro de 1 para cima');
    }
    return Object.keys(out).length ? out : undefined;
}

/**
 * O que faz: confere o bloco `estados` e devolve as linhas válidas (os problemas vão na lista dos problemas).
 * Por quê: a tabela de estados é a fonte única do estado de cada status e de cada coluna
 * (Passo 0, 0b); valor repetido, forma inventada ou lugar fora da lista fariam um nó
 * aparecer de dois jeitos.
 * Entra → sai: o bloco cru e a lista de problemas (acrescida) → as linhas válidas.
 * Erro e ataque: lista vazia, objeto no lugar de lista, valor repetido, `mostrar` e
 * `lugar` fora das listas fechadas, chave desconhecida.
 * Prova: os casos compartilhados com o juiz (`tests/fixtures/dominio/casos.json`).
 */
function parseStates(raw: unknown, problemas: string[]): DomainState[] {
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || raw.length === 0) { problemas.push('modelo: `estados` precisa ser uma lista com ao menos um estado'); return []; }
    const out: DomainState[] = [];
    const seen = new Set<string>();
    for (const [index, st] of raw.entries()) {
        const where = `estado ${index + 1}`;
        if (!isObject(st)) { problemas.push(`${where}: precisa ser um objeto`); continue; }
        problemas.push(...unknownKeys(st, STATE_KEYS, where));
        if (!isText(st.valor)) { problemas.push(`${where}: \`valor\` precisa ser texto`); continue; }
        const label = `estado '${st.valor}'`;
        if (seen.has(st.valor)) { problemas.push(`${label}: valor repetido`); continue; }
        seen.add(st.valor);
        if (!isText(st.estado) || !SNAKE.test(st.estado)) { problemas.push(`${label}: \`estado\` precisa ser um nome em snake_case`); continue; }
        if (!isText(st.rotulo)) { problemas.push(`${label}: \`rotulo\` precisa ser texto`); continue; }
        if (!STATE_DISPLAYS.includes(st.mostrar)) { problemas.push(`${label}: \`mostrar\` desconhecido '${shown(st.mostrar)}' (${STATE_DISPLAYS.join(', ')})`); continue; }
        if (st.lugar !== undefined && !STATE_PLACES.includes(st.lugar)) { problemas.push(`${label}: \`lugar\` desconhecido '${shown(st.lugar)}' (${STATE_PLACES.join(', ')})`); continue; }
        for (const key of ['marca', 'coluna', 'habito']) if (st[key] !== undefined && !isText(st[key])) problemas.push(`${label}: \`${key}\` precisa ser texto`);
        out.push({
            valor: st.valor, estado: st.estado, rotulo: st.rotulo, mostrar: st.mostrar,
            ...(isText(st.marca) ? { marca: st.marca } : {}),
            ...(st.lugar !== undefined ? { lugar: st.lugar } : {}),
            ...(isText(st.coluna) ? { coluna: st.coluna } : {}),
            ...(isText(st.habito) ? { habito: st.habito.trim() } : {}),
        });
    }
    return out;
}

/**
 * As declarações de sinal de um modelo (P10b, §8.8): as listas e as chaves de cada item; `umaDe` =
 * ao menos uma destas é texto (o limite pela data `ate` ou pelos `dias`, 30/10).
 */
const SIGNAL_LISTS: Record<string, { obrigatorias: string[]; opcionais: string[]; umaDe?: string[]; listas?: string[] }> = {
    prazos: { obrigatorias: ['type', 'campo', 'fato'], opcionais: ['passo'] },
    limites: { obrigatorias: ['type', 'lugar', 'fato'], opcionais: ['ate', 'dias', 'recente', 'passo'], umaDe: ['ate', 'dias'] },
    // 02/11: as datas de notas seguidas (as estadias): a entrada (`de`), a saída (`ate`), o campo do estado, os
    // estados que contam na sequência (`conta`) e os da reserva aberta (`aberta`), listas de textos.
    datas: { obrigatorias: ['type', 'de', 'ate', 'estado', 'fato'], opcionais: ['conta', 'aberta', 'passo'], listas: ['conta', 'aberta'] },
    // 05/11: a conferência de uma pesquisa: a tag da tarefa de pesquisa e a seção da nota dela onde mora a lista.
    conferencias: { obrigatorias: ['tag', 'secao', 'fato'], opcionais: ['passo'] },
    // 05/11 (a campanha da semana): a cadência (cada valor do campo `por` sem nota publicada na semana de hoje; o `fato`
    // diz o valor por `{valor}`; os `livres` não têm cadência, como o canal pessoal de testes) e a origem (a nota dos
    // `formatos` sem a de origem no `campo`, ou com ela inexistente).
    cadencias: { obrigatorias: ['type', 'por', 'fato'], opcionais: ['livres', 'passo'], listas: ['livres'] },
    origens: { obrigatorias: ['type', 'campo', 'fato'], opcionais: ['formatos', 'passo'], listas: ['formatos'] },
    // 05/11 (o gerenciamento dos destinos): a nota do tipo, num dos `estados` (sem eles, em qualquer um que não é oculto),
    // com o `campo` vazio.
    vazios: { obrigatorias: ['type', 'campo', 'fato'], opcionais: ['estados', 'passo'], listas: ['estados'] },
};

/**
 * O que faz: confere o bloco `sinais` de um modelo: os números do tipo (toda chave que não é
 * lista de declarações é um número) e as declarações de sinal (P10b): `prazos` (a data de um
 * campo de uma nota do `type`, de hoje em diante, vira sinal), `limites` (a data de um campo,
 * `ate`, ou os dias de outro, `dias`, contados da chegada no lugar que o campo `lugar` diz, viram o
 * último dia; ao menos um dos dois) e `datas` (02/11: a entrada e a saída das notas do `type`, em
 * sequência, conferidas; `conta` é a lista dos estados que entram, `aberta` a das reservas abertas) e
 * `conferencias` (05/11: a tag da tarefa de pesquisa e a seção da nota dela onde mora a lista de verificação).
 * Por quê: §8.8, os sinais por uma função só (`missao/sinais.ts`), declarados no modelo e não no
 * código; o juiz (`_signal_problems`) diz o mesmo, com as mesmas mensagens.
 * Entra → sai: o bloco (objeto) → os problemas.
 * Prova: os casos compartilhados com o juiz (`tests/fixtures/dominio/casos.json`).
 */
function signalProblems(raw: Record<string, any>): string[] {
    const problemas: string[] = [];
    for (const [key, value] of Object.entries(raw)) {
        const forma = SIGNAL_LISTS[key];
        if (!forma) {
            if (!isNumber(value)) problemas.push(`sinais: \`${key}\` precisa ser um número (os números do tipo)`);
            continue;
        }
        if (!Array.isArray(value)) { problemas.push(`sinais: \`${key}\` precisa ser uma lista`); continue; }
        value.forEach((item: unknown, i: number) => {
            const where = `sinais.${key} ${i + 1}`;
            if (!isObject(item)) { problemas.push(`${where}: precisa ser um objeto`); return; }
            problemas.push(...unknownKeys(item, [...forma.obrigatorias, ...forma.opcionais], where));
            const faltam = forma.obrigatorias.filter(k => !isText(item[k]));
            if (faltam.length) problemas.push(`${where}: ${faltam.map(k => `\`${k}\``).join(', ')} precisa${faltam.length > 1 ? 'm' : ''} ser texto`);
            if (forma.umaDe && forma.umaDe.every(k => item[k] === undefined)) problemas.push(`${where}: ${forma.umaDe.map(k => `\`${k}\``).join(' ou ')} precisa ser texto`);
            for (const k of ['recente', ...(forma.umaDe ?? [])]) if (item[k] !== undefined && !isText(item[k])) problemas.push(`${where}: \`${k}\` precisa ser texto`);
            for (const k of forma.listas ?? []) if ((k === 'conta' || item[k] !== undefined) && !isTextList(item[k])) problemas.push(`${where}: \`${k}\` precisa ser uma lista de textos`);
            if (item.passo !== undefined && !(isObject(item.passo) && isText(item.passo.protocolo) && isText(item.passo.rotulo) && Object.keys(item.passo).every(k => k === 'protocolo' || k === 'rotulo'))) {
                problemas.push(`${where}: \`passo\` precisa ser { protocolo, rotulo } em texto`);
            }
        });
    }
    return problemas;
}

/**
 * O que faz: confere o bloco `legado` (as chaves do modelo antigo) e devolve a lista.
 * Por quê: a lista é fechada (0b e 0f): é ela que marca "modelo antigo"; chave repetida
 * ou vazia seria uma marca que ninguém lê.
 * Entra → sai: o bloco cru e a lista de problemas (acrescida) → as chaves.
 * Prova: os casos compartilhados com o juiz.
 */
function parseLegacy(raw: unknown, problemas: string[]): string[] {
    if (raw === undefined) return [];
    if (!isTextList(raw)) { problemas.push('modelo: `legado` precisa ser uma lista de textos'); return []; }
    const out: string[] = [];
    for (const key of raw) {
        if (out.includes(key)) problemas.push(`legado: chave repetida '${key}'`);
        else out.push(key);
    }
    return out;
}

const isBool = (value: unknown): value is boolean => value === true || value === false;

/**
 * O que faz: confere o bloco `campos` (os campos padrão do tipo) e devolve os válidos.
 * Por quê: o modelo é a fonte única dos campos de cada tipo (§4.1 e §4.2): o painel do
 * nó, o Novo e os protocolos de criação leem o mesmo arquivo. Tipo inventado, formato do
 * tipo errado, fonte de sugestão fora da lista ou dono sem forma fariam a tela mostrar,
 * sugerir ou gravar o que nenhum leitor entende.
 * Entra → sai: o bloco cru, o `legado` do modelo e a lista de problemas (acrescida) → os
 * campos válidos, na ordem do arquivo.
 * Erro e ataque: lista vazia, nome repetido, chave desconhecida, `formato` ou `valores`
 * em tipo que não os tem, `escolha` sem valores, `link` sem alvo, booleano em texto,
 * campo que também é chave do modelo antigo.
 * Prova: os casos compartilhados com o juiz (`tests/fixtures/dominio/casos.json`).
 */
function parseFields(raw: unknown, legado: readonly string[], problemas: string[]): DomainField[] {
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || raw.length === 0) { problemas.push('modelo: `campos` precisa ser uma lista com ao menos um campo'); return []; }
    const out: DomainField[] = [];
    const seen = new Set<string>();
    // Os nomes dos campos do modelo, para o `antes` e as `opcoes` (05/11) citarem só o que existe.
    const nomes = raw.filter(isObject).map((f: any) => f.nome).filter(isText);
    for (const [index, f] of raw.entries()) {
        const where = `campo ${index + 1}`;
        if (!isObject(f)) { problemas.push(`${where}: precisa ser um objeto`); continue; }
        problemas.push(...unknownKeys(f, FIELD_KEYS, where));
        if (!isText(f.nome)) { problemas.push(`${where}: \`nome\` precisa ser texto`); continue; }
        const label = `campo '${f.nome}'`;
        if (seen.has(f.nome)) { problemas.push(`${label}: nome repetido`); continue; }
        seen.add(f.nome);
        if (legado.includes(f.nome)) { problemas.push(`${label}: é chave do \`legado\` (o modelo antigo não é campo)`); continue; }
        if (!isText(f.rotulo)) { problemas.push(`${label}: \`rotulo\` precisa ser texto`); continue; }
        if (!FIELD_KINDS.includes(f.tipo)) { problemas.push(`${label}: \`tipo\` desconhecido '${shown(f.tipo)}' (${FIELD_KINDS.join(', ')})`); continue; }
        const tipo = f.tipo as FieldKind;
        let ok = true;
        const bad = (msg: string) => { problemas.push(`${label}: ${msg}`); ok = false; };
        if (f.formato !== undefined) {
            const formatos = tipo === 'texto' || tipo === 'data' ? FIELD_FORMATS[tipo] : null;
            if (!formatos) bad('`formato` só vale nos tipos texto e data');
            else if (!formatos.includes(f.formato)) bad(`\`formato\` desconhecido '${shown(f.formato)}' para o tipo ${tipo} (${formatos.join(', ')})`);
        }
        if (f.valores !== undefined) {
            if (tipo !== 'lista' && tipo !== 'escolha') bad('`valores` só vale nos tipos lista e escolha');
            else if (!isTextList(f.valores) && !FIELD_VOCABULARIES.includes(f.valores)) bad(`\`valores\` precisa ser uma lista de textos ou um vocabulário do sistema (${FIELD_VOCABULARIES.join(', ')})`);
        } else if (tipo === 'escolha') bad('o tipo escolha precisa de `valores`');
        if (tipo === 'link') {
            if (!isTextList(f.alvo) || !f.alvo.every((a: string) => SNAKE.test(a))) bad('o tipo link precisa de `alvo` (uma lista de tipos)');
            if (f.ramo !== undefined && !(BRANCH_DIRECTIONS as readonly unknown[]).includes(f.ramo)) bad(`\`ramo\` desconhecido '${shown(f.ramo)}' (${BRANCH_DIRECTIONS.join(', ')})`);
        } else {
            if (f.alvo !== undefined) bad('`alvo` só vale no tipo link');
            if (f.multiplo !== undefined) bad('`multiplo` só vale no tipo link');
            if (f.ramo !== undefined) bad('`ramo` só vale no tipo link');
        }
        for (const key of ['multiplo', 'obrigatorio', 'editar', 'criar']) {
            if (f[key] !== undefined && !isBool(f[key])) bad(`\`${key}\` precisa ser true ou false`);
        }
        const sugestao: FieldSuggestion[] = [];
        if (f.sugestao !== undefined) {
            if (!Array.isArray(f.sugestao) || f.sugestao.length === 0) bad('`sugestao` precisa ser uma lista de fontes { de }');
            else for (const [i, sug] of f.sugestao.entries()) {
                if (!isObject(sug)) { bad(`a sugestão ${i + 1} precisa ser um objeto { de }`); continue; }
                for (const key of Object.keys(sug)) if (!SUGGESTION_KEYS.includes(key)) bad(`a sugestão ${i + 1} tem a chave desconhecida '${key}'`);
                if (!SUGGESTION_SOURCES.includes(sug.de)) { bad(`fonte de sugestão desconhecida '${shown(sug.de)}'`); continue; }
                if (sug.de === 'fixo' && !isText(sug.valor)) { bad('a fonte fixo precisa de `valor`'); continue; }
                if (sug.de !== 'fixo' && sug.valor !== undefined) { bad('`valor` só vale na fonte fixo'); continue; }
                if (sug.de === 'checklist' && !isText(sug.caminho)) { bad('a fonte checklist precisa de `caminho` (a nota da checklist)'); continue; }
                if (sug.de !== 'checklist' && sug.caminho !== undefined) { bad('`caminho` só vale na fonte checklist'); continue; }
                if (sug.de === 'checklist' && tipo !== 'lista') { bad('a fonte checklist só vale no tipo lista'); continue; }
                sugestao.push({ de: sug.de, ...(isText(sug.valor) ? { valor: sug.valor } : {}), ...(isText(sug.caminho) ? { caminho: sug.caminho } : {}) });
            }
        }
        if (!isText(f.dono) || !OWNER.test(f.dono)) bad('`dono` precisa ser nota, derivado ou protocolo:<id>#<passo>');
        if (f.vazio !== undefined && !isText(f.vazio)) bad('`vazio` precisa ser texto');
        if (f.planejado !== undefined && (!isText(f.planejado) || !STEP_ID.test(f.planejado))) bad('`planejado` precisa ser o passo em que o escritor chega (P9, P10…)');
        if (f.conhecidos !== undefined) {
            if (tipo !== 'texto') bad('`conhecidos` só vale no tipo texto');
            else if (!isTextList(f.conhecidos) || !f.conhecidos.length) bad('`conhecidos` precisa ser uma lista de textos');
        }
        if (f.antes !== undefined) {
            if (!isTextList(f.antes) || !f.antes.length || !f.antes.every((a: string) => SNAKE.test(a))) bad('`antes` precisa ser uma lista de nomes de campo');
            else if (f.antes.some((a: string) => nomes.includes(a))) bad('`antes` não pode citar um campo do modelo');
        }
        if (f.opcoes !== undefined) {
            const o = f.opcoes;
            if (tipo !== 'lista') bad('`opcoes` só vale no tipo lista');
            else if (!isObject(o) || !isText(o.de) || !isText(o.lista) || Object.keys(o).some(k => !OPCOES_KEYS.includes(k))) bad('`opcoes` precisa ser { de, lista, regra, por }, com de e lista em texto');
            else if ((o.regra === undefined) !== (o.por === undefined) || (o.regra !== undefined && (!isText(o.regra) || !isText(o.por)))) bad('`opcoes`: `regra` e `por` vão juntos, em texto');
            else for (const k of ['de', 'por'] as const) if (o[k] !== undefined && !nomes.includes(o[k])) bad(`\`opcoes.${k}\` precisa ser um campo do modelo`);
        }
        if (!ok) continue;
        out.push({
            nome: f.nome, rotulo: f.rotulo, tipo, dono: f.dono,
            ...(f.formato !== undefined ? { formato: f.formato } : {}),
            ...(f.valores !== undefined ? { valores: Array.isArray(f.valores) ? [...f.valores] : f.valores } : {}),
            ...(f.alvo !== undefined ? { alvo: [...f.alvo] } : {}),
            ...(f.multiplo !== undefined ? { multiplo: f.multiplo } : {}),
            ...(f.ramo !== undefined ? { ramo: f.ramo as BranchDirection } : {}),
            ...(f.obrigatorio !== undefined ? { obrigatorio: f.obrigatorio } : {}),
            ...(sugestao.length ? { sugestao } : {}),
            ...(f.editar !== undefined ? { editar: f.editar } : {}),
            ...(f.criar !== undefined ? { criar: f.criar } : {}),
            ...(f.vazio !== undefined ? { vazio: f.vazio } : {}),
            ...(f.planejado !== undefined ? { planejado: f.planejado } : {}),
            ...(f.conhecidos !== undefined ? { conhecidos: [...f.conhecidos] } : {}),
            ...(f.antes !== undefined ? { antes: [...f.antes] } : {}),
            ...(f.opcoes !== undefined ? { opcoes: { de: f.opcoes.de, lista: f.opcoes.lista, ...(f.opcoes.regra !== undefined ? { regra: f.opcoes.regra, por: f.opcoes.por } : {}) } } : {}),
        });
    }
    return out;
}

/**
 * O que faz: confere o bloco `criar` (como o tipo nasce) e o devolve, ou `undefined`.
 * Por quê: o Novo abre o formulário do TaskNotes ou o protocolo dono do tipo (§4.3); a
 * via sem protocolo, ou o passo de um campo que o modelo não tem, abriria o lugar errado.
 * O `nome` (o passo do nome da nota nova) e as `datas` (o campo de data que vai como a data
 * da rodada, numa das variáveis do motor) entraram no P8: o Novo pré-responde o protocolo.
 * Entra → sai: o bloco cru, os campos válidos e a lista de problemas → o bloco tipado.
 * Prova: os casos compartilhados com o juiz.
 */
function parseCreate(raw: unknown, campos: readonly DomainField[], problemas: string[]): DomainCreate | undefined {
    if (raw === undefined) return undefined;
    if (!isObject(raw)) { problemas.push('modelo: `criar` precisa ser um objeto'); return undefined; }
    problemas.push(...unknownKeys(raw, CREATE_KEYS, 'criar'));
    if (!CREATE_VIAS.includes(raw.via)) { problemas.push(`criar: \`via\` precisa ser ${CREATE_VIAS.join(' ou ')}`); return undefined; }
    let ok = true;
    for (const key of ['protocolo', 'completo']) {
        if (raw[key] !== undefined && (!isText(raw[key]) || !SNAKE.test(raw[key]))) { problemas.push(`criar: \`${key}\` precisa ser o id de um protocolo`); ok = false; }
    }
    if (raw.via === 'protocolo' && raw.protocolo === undefined) { problemas.push('criar: a via protocolo precisa de `protocolo` (o id)'); ok = false; }
    if (raw.via === 'nota') {
        for (const key of ['protocolo', 'completo', 'passos', 'nome', 'datas']) if (raw[key] !== undefined) { problemas.push(`criar: \`${key}\` não vale na via nota`); ok = false; }
        // Sem `titulo`, o Novo pede o nome da nota (02/11, a nota de função: o nome do arquivo é o da função).
        if (raw.titulo !== undefined && (!isText(raw.titulo) || !campos.some(c => c.nome === raw.titulo && c.tipo === 'texto'))) { problemas.push(`criar: o \`titulo\` '${shown(raw.titulo)}' não é um campo de texto do modelo`); ok = false; }
        const casa = raw.casa === undefined ? undefined : parseHome(raw.casa, campos, problemas);
        if (raw.casa !== undefined && !casa) ok = false;
        if (raw.molde !== undefined && !(isText(raw.molde) && /\.md$/.test(raw.molde))) { problemas.push('criar: `molde` precisa ser o caminho de uma nota .md'); ok = false; }
        // A via nota não tem passos nem datas: o resto do bloco não se lê (o juiz para aqui também).
        return ok ? { via: 'nota', ...(isText(raw.titulo) ? { titulo: raw.titulo } : {}), ...(casa ? { casa } : {}), ...(isText(raw.molde) ? { molde: raw.molde } : {}) } : undefined;
    }
    if (raw.titulo !== undefined) { problemas.push('criar: `titulo` só vale na via nota'); ok = false; }
    for (const key of ['casa', 'molde']) if (raw[key] !== undefined) { problemas.push(`criar: \`${key}\` só vale na via nota`); ok = false; }
    const passos: Record<string, string> = {};
    if (raw.passos !== undefined) {
        if (!isObject(raw.passos) || !Object.values(raw.passos).every(v => isText(v) && SNAKE.test(v as string))) { problemas.push('criar: `passos` precisa ser um objeto de campo → passo'); ok = false; }
        else for (const [campo, passo] of Object.entries(raw.passos)) {
            if (!campos.some(c => c.nome === campo)) { problemas.push(`criar: o passo de '${campo}' não é de um campo do modelo`); ok = false; }
            else passos[campo] = passo as string;
        }
    }
    if (raw.nome !== undefined && (!isText(raw.nome) || !SNAKE.test(raw.nome))) { problemas.push('criar: `nome` precisa ser o id de um passo'); ok = false; }
    const datas: Record<string, CreateDateVariable> = {};
    if (raw.datas !== undefined) {
        if (!isObject(raw.datas) || !Object.values(raw.datas).every(v => (CREATE_DATE_VARIABLES as readonly unknown[]).includes(v))) { problemas.push(`criar: \`datas\` precisa ser um objeto de campo → ${CREATE_DATE_VARIABLES.join(', ')}`); ok = false; }
        else for (const [campo, variavel] of Object.entries(raw.datas)) {
            const c = campos.find(x => x.nome === campo);
            if (!c || c.tipo !== 'data') { problemas.push(`criar: a data de '${campo}' não é de um campo de data do modelo`); ok = false; }
            else datas[campo] = variavel as CreateDateVariable;
        }
    }
    if (!ok) return undefined;
    return {
        via: raw.via,
        ...(isText(raw.protocolo) ? { protocolo: raw.protocolo } : {}),
        ...(isText(raw.completo) ? { completo: raw.completo } : {}),
        ...(Object.keys(passos).length ? { passos } : {}),
        ...(isText(raw.nome) ? { nome: raw.nome } : {}),
        ...(Object.keys(datas).length ? { datas } : {}),
    };
}

/**
 * O que faz: confere a casa que depende do módulo (`criar.casa`, 02/11) e a devolve, ou `undefined`.
 * Por quê: a nota de função mora na pasta do módulo dono (o padrão fractal, decisão 4); o campo que diz o
 * módulo precisa ser o link acima do tipo (o ramo de cima), e a subpasta, um nome de pasta só (sem `/`).
 * Prova: os casos compartilhados com o juiz.
 */
function parseHome(raw: unknown, campos: readonly DomainField[], problemas: string[]): DomainHome | undefined {
    if (!isObject(raw)) { problemas.push('criar: `casa` precisa ser um objeto { campo, subpasta }'); return undefined; }
    problemas.push(...unknownKeys(raw, HOME_KEYS, 'criar.casa'));
    let ok = true;
    if (!isText(raw.campo) || !campos.some(c => c.nome === raw.campo && c.tipo === 'link' && c.ramo === 'acima')) { problemas.push(`criar: o \`campo\` da casa '${shown(raw.campo)}' não é um campo de link acima do modelo`); ok = false; }
    if (!isText(raw.subpasta) || /[\\/]/.test(raw.subpasta)) { problemas.push('criar: a `subpasta` da casa precisa ser o nome de uma pasta'); ok = false; }
    return ok ? { campo: raw.campo, subpasta: raw.subpasta.trim() } : undefined;
}

/**
 * O que faz: confere o bloco `situacoes` (o P13, 02/11) e devolve as válidas, na ordem do arquivo.
 * Por quê: a situação liga o que já existe (um sinal da Missão ou um estado da tabela do tipo) a uma parada do
 * 🧭 que já existe; uma condição inventada nunca dispararia, e uma parada fora da forma não se acharia. Que a
 * parada exista e que cada protocolo seja destino dela confere o juiz (`audit_architecture.py`), que lê os routers.
 * Entra → sai: o bloco cru, as linhas de estado válidas e a lista de problemas (acrescida) → as situações.
 * Erro e ataque: objeto no lugar da lista, chave desconhecida, `quando` fora dos sinais e dos estados do tipo,
 * parada sem o ponto, recorte vazio, id fora da forma ou repetido: o problema é dito e a situação sai.
 * Prova: os casos compartilhados com o juiz (`tests/fixtures/dominio/casos.json`).
 */
function parseSituations(raw: unknown, estados: readonly DomainState[], problemas: string[]): DomainSituation[] {
    if (raw === undefined) return [];
    if (!Array.isArray(raw)) { problemas.push('modelo: `situacoes` precisa ser uma lista de { quando, situacao, protocolos }'); return []; }
    const out: DomainSituation[] = [];
    const doTipo = new Set(estados.map(e => e.estado));
    for (const [index, s] of raw.entries()) {
        const where = `situacao ${index + 1}`;
        if (!isObject(s)) { problemas.push(`${where}: precisa ser um objeto { quando, situacao, protocolos }`); continue; }
        problemas.push(...unknownKeys(s, SITUATION_KEYS, where));
        let ok = true;
        const quando = isText(s.quando) ? s.quando.trim() : '';
        const conhecido = (TIPOS_DE_SINAL as readonly string[]).includes(quando) || (quando.startsWith(QUANDO_ESTADO) && doTipo.has(quando.slice(QUANDO_ESTADO.length)));
        if (!conhecido) { problemas.push(`${where}: \`quando\` desconhecido '${shown(s.quando)}' (um tipo de sinal, ou estado:<estado> da tabela do tipo)`); ok = false; }
        if (!isText(s.situacao) || !STOP.test(s.situacao)) { problemas.push(`${where}: \`situacao\` precisa ser uma parada do 🧭, <router>.<passo>`); ok = false; }
        if (!Array.isArray(s.protocolos) || !s.protocolos.length || !s.protocolos.every((id: unknown) => isText(id) && SNAKE.test(id))) { problemas.push(`${where}: \`protocolos\` precisa ser uma lista de ids de protocolo`); ok = false; }
        else if (new Set(s.protocolos).size !== s.protocolos.length) { problemas.push(`${where}: \`protocolos\` tem id repetido`); ok = false; }
        // `preencher` (06/11): protocolo do recorte → passo → texto, a mesma forma do `preencher` do bloco `protocolos`.
        const doRecorte = Array.isArray(s.protocolos) ? s.protocolos : [];
        if (s.preencher !== undefined && !(isObject(s.preencher) && Object.entries(s.preencher).every(([id, fichas]) => doRecorte.includes(id) && isObject(fichas) && Object.entries(fichas).every(([k, v]) => ANSWER_KEY.test(k) && isText(v))))) {
            problemas.push(`${where}: \`preencher\` precisa ser um objeto de protocolo do recorte → { passo: texto }`); ok = false;
        }
        if (ok) out.push({ quando, situacao: s.situacao, protocolos: [...s.protocolos], ...(isObject(s.preencher) ? { preencher: Object.fromEntries(Object.entries(s.preencher).map(([id, f]) => [id, { ...(f as Record<string, string>) }])) } : {}) });
    }
    return out;
}

/**
 * O que faz: confere o bloco `protocolos` (os protocolos que criam, revisam ou se usam sobre o tipo) e
 * devolve os válidos, na ordem do arquivo.
 * Por quê: a seção "Protocolos" do painel do nó (a peça 2b, 30/10) lê daqui o que nem os donos dos campos
 * nem o `criar` dizem (a revisão da cidade, a do trimestre, a avaliação da estadia); id fora da forma,
 * papel inventado ou resposta que não é texto abririam o protocolo errado, ou com respostas que ele não lê.
 * Entra → sai: o bloco cru e a lista de problemas (acrescida) → os protocolos válidos.
 * Erro e ataque: objeto no lugar de lista, id repetido, papel fora de `PROTOCOL_ROLES`, `preencher` com
 * passo fora da forma ou valor que não é texto, chave desconhecida. Que o protocolo e o passo existam
 * confere o contrato dos modelos (`tests/contracts/modelosDeTipo.test.ts`).
 * Prova: os casos compartilhados com o juiz (`tests/fixtures/dominio/casos.json`).
 */
function parseProtocols(raw: unknown, problemas: string[]): DomainProtocol[] {
    if (raw === undefined) return [];
    if (!Array.isArray(raw)) { problemas.push('modelo: `protocolos` precisa ser uma lista'); return []; }
    const out: DomainProtocol[] = [];
    for (const [index, p] of raw.entries()) {
        const where = `protocolo ${index + 1}`;
        if (!isObject(p)) { problemas.push(`${where}: precisa ser um objeto`); continue; }
        problemas.push(...unknownKeys(p, PROTOCOL_KEYS, where));
        if (!isText(p.id) || !SNAKE.test(p.id)) { problemas.push(`${where}: \`id\` precisa ser o id de um protocolo`); continue; }
        const label = `protocolo '${p.id}'`;
        if (out.some(x => x.id === p.id)) { problemas.push(`${label}: id repetido`); continue; }
        if (!(PROTOCOL_ROLES as readonly unknown[]).includes(p.papel)) { problemas.push(`${label}: \`papel\` desconhecido '${shown(p.papel)}' (${PROTOCOL_ROLES.join(', ')})`); continue; }
        if (p.preencher !== undefined && !(isObject(p.preencher) && Object.entries(p.preencher).every(([k, v]) => ANSWER_KEY.test(k) && isText(v)))) {
            problemas.push(`${label}: \`preencher\` precisa ser um objeto de passo → texto`);
            continue;
        }
        out.push({ id: p.id, papel: p.papel as ProtocolRole, ...(isObject(p.preencher) ? { preencher: { ...p.preencher } as Record<string, string> } : {}) });
    }
    return out;
}

/** As chaves de pontos que cada regra pede na tabela (a `valor` aceita qualquer valor). */
function expectedPointKeys(category: DomainCategory): string[] | null {
    if (category.regra === 'contagem') return ['cada', 'maximo'];
    if (category.regra === 'booleano') return ['sim', 'nao'];
    if (category.regra === 'faixa_relativa') {
        const { faixas, senao } = bandsOf(category);
        return [...faixas.map(band => band.chave), senao];
    }
    return null;
}

/**
 * O que faz: confere os pontos do domínio na tabela única contra as categorias do modelo.
 * Por quê: "toda categoria declarada tem os seus pontos em `pesos.<domínio>`"; categoria
 * sem pontos pesaria 0 em silêncio, e ponto sem categoria é número que ninguém lê.
 * Entra → sai: o modelo e o bloco `pesos.<domínio>` (qualquer valor) → problemas.
 * Erro e ataque: bloco ausente, texto no lugar de número, chave de faixa faltando,
 * chave a mais no bloco ou dentro de uma categoria de chaves fixas.
 * Prova: tests/engine/domainModel.test.ts e os casos compartilhados com o juiz.
 */
export function domainWeightProblems(modelo: Pick<DomainModel, 'dominio'> & { escolher?: Pick<DomainChoice, 'categorias'> }, bloco: unknown): string[] {
    const where = `pesos.${modelo.dominio}`;
    if (!isObject(bloco)) return [`${where}: o bloco não existe na tabela de pesos`];
    const problemas: string[] = [];
    const categorias = modelo.escolher?.categorias ?? [];
    const chaves = new Set(categorias.map(cat => cat.chave));
    for (const key of Object.keys(bloco)) {
        if (!chaves.has(key)) problemas.push(`${where}: chave desconhecida '${key}' (não é categoria do modelo)`);
    }
    for (const cat of categorias) {
        const pontos = bloco[cat.chave];
        const label = `${where}.${cat.chave}`;
        if (!isObject(pontos)) { problemas.push(`${label}: a categoria não tem pontos`); continue; }
        for (const [key, value] of Object.entries(pontos)) {
            if (!isNumber(value)) problemas.push(`${label}.${key}: não é número`);
        }
        const expected = expectedPointKeys(cat);
        if (expected) {
            for (const key of expected) if (!(key in pontos)) problemas.push(`${label}: falta o ponto '${key}'`);
            for (const key of Object.keys(pontos)) if (!expected.includes(key)) problemas.push(`${label}: chave desconhecida '${key}'`);
        } else {
            if (Object.keys(pontos).length === 0) problemas.push(`${label}: a categoria não tem pontos`);
            for (const value of cat.valores ?? []) if (!(value in pontos)) problemas.push(`${label}: falta o ponto '${value}'`);
        }
    }
    return problemas;
}

/**
 * O que faz: todos os problemas de um modelo de domínio: a forma e, quando o modelo tem
 * nome e `escolher`, os pontos dele na tabela única (sem `escolher`, não há pontos a conferir).
 * Por quê: é o mesmo veredito do juiz (`audit_architecture.py`), arquivo por arquivo; os
 * casos de `tests/fixtures/dominio/casos.json` provam que os dois dizem o mesmo.
 * Entra → sai: o JSON do modelo, o nome do arquivo e o JSON da tabela → problemas.
 */
export function domainModelProblems(raw: unknown, fileStem: string | undefined, tableRaw: unknown): string[] {
    const { problemas, categorias } = parseDomainModel(raw, fileStem);
    const dominio = isObject(raw) ? raw.dominio : undefined;
    if (!isObject(raw) || !isObject(raw.escolher) || !isText(dominio) || !SNAKE.test(dominio)) return problemas;
    return [...problemas, ...domainWeightProblems({ dominio, escolher: { categorias } }, domainWeightsOf(tableRaw, dominio))];
}

/** O que faz: o bloco `pesos.<domínio>` do JSON da tabela única (ou `undefined`). */
export function domainWeightsOf(tableRaw: unknown, dominio: string): unknown {
    const pesos = isObject(tableRaw) && isObject((tableRaw as any).pesos) ? (tableRaw as any).pesos : null;
    return pesos ? pesos[dominio] : undefined;
}

/** O que faz: o caminho do modelo de um domínio. */
export function domainModelPath(dominio: string): string {
    return `${DOMAIN_MODELS_FOLDER}/${dominio}.json`;
}
