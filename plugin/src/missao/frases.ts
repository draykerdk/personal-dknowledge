/**
 * As frases visíveis da Missão para a ausência e o vazio: uma frase por sentido, nas
 * linhas, nos nós e nos painéis.
 *
 * Por quê: a revisão de 29/10 achou o mesmo vazio dito de jeitos diferentes ("nada no dia"
 * no centro e "sem tarefas" na linha fechada; a SMART vazia com uma frase no nó e outra no
 * painel; a visão ausente que o protótipo chama "ainda não escrita"). Como a tabela de
 * estados (Passo 0, 0b), as frases moram num lugar só: quem desenha lê daqui, e um teste
 * confere que nenhuma parte da Missão volta a escrevê-las por conta própria. Ausência não é
 * zero: o vazio vai em palavras (dfm-canvas-dev, §1).
 *
 * Módulo puro: só dados. Prova: tests/missao/refinos.test.ts ("as frases").
 */
export const FRASES = {
    /** Nenhuma tarefa no período, na linha, no centro, na faixa, na prateleira e no painel. */
    semTarefas: 'sem tarefas',
    /** A estadia sem a entrada (30/10): ainda na triagem, ou sem a data marcada. */
    datasADefinir: 'datas a definir',
    /** Há SMART no período, e nenhuma ação dela cai nele. */
    semAcoesNoPeriodo: 'sem ações neste período',
    /** A SMART sem ação ligada: o nó e o painel dizem igual. */
    semAcoesLigadas: 'sem ações ligadas',
    /** A semana, o trimestre e o ano sem nada no horizonte. */
    semPlanejamento: 'sem planejamento',
    /** O dia sem ação agendada (a carga). */
    nadaAgendado: 'nada agendado',
    /** A visão que ainda não existe (o 🔭 a escreve). */
    visaoNaoEscrita: 'ainda não escrita',
    /** O período sem passagem: na linha aberta e no chip do celular. */
    semLugar: 'sem lugar marcado',
    /** A área sem projeto ativo nem departamento. */
    semFrentesAtivas: 'sem frentes ativas',
    /** A área sem nenhum projeto. */
    semFrentes: 'sem frentes',
    /** A tarefa pontuada sem nenhum peso. */
    semPeso: 'sem peso marcado',
    /** O alvo de um vínculo (o país de uma cidade) que não tem nota. */
    semNota: 'sem nota',
    /** O campo da nota que está vazio, no painel. */
    semDado: 'sem dado',
    /** O trecho planejado cuja nota ainda não diz para onde. */
    destinoADecidir: 'destino a decidir',
    /** A passagem ou a cidade cujo país não se sabe (o `sub` do cartão do lugar). */
    paisADefinir: 'país a definir',
} as const;

export type Frase = keyof typeof FRASES;

/**
 * Os rótulos e as frases do registro do dia (P9): o "＋ O que fiz", as pessoas, o dinheiro e
 * o "Informar saldo". O texto dos botões de cada gesto vem do ramo (`registro`); aqui ficam
 * os títulos das seções, os rótulos dos campos dos formulários e as frases do painel, num
 * lugar só, como as frases do vazio. Nada aqui fala da pessoa nem cobra registro.
 */
export const REGISTRO = {
    /** A seção do painel do dia com os gestos do registro. */
    secaoDoDia: 'Registrar o dia',
    /** As pessoas do `pessoas` do dia, no painel. */
    pessoasDoDia: 'Pessoas do dia',
    /** As pessoas dos dias de uma passagem, no painel do lugar. */
    pessoasDaPassagem: 'Pessoas da passagem',
    /** O painel de uma pessoa. */
    pessoa: 'Pessoa',
    /** A seção do painel da pessoa com os dias calculados. */
    noRegistro: 'Nos dias',
    /** O último dia em que a pessoa aparece no `pessoas` de uma Day. */
    ultimoDia: 'último dia no registro',
    /** A pessoa que ainda não está em nenhum dia. */
    emNenhumDia: 'em nenhum dia ainda',
    /** O "Último encontro" da nota é do 👤: o painel só diz de onde vem a conta. */
    dicaDaPessoa: 'Calculado pelas Days; o "Último encontro" da nota continua do 👤.',
    /** O formulário do "＋ O que fiz". */
    oQueFiz: 'O que fiz',
    hora: 'Hora',
    projeto: 'Projeto ou SMART',
    onde: 'Onde',
    minutos: 'Quanto levou (min)',
    nenhum: '—',
    registrar: 'Registrar',
    dicaRegistrar: 'Registrar: a tarefa nasce feita neste dia, sem data de plano; o quanto levou vai com o onde para o registro dos blocos',
    dicaDoFeito: 'Nasce feita neste dia, sem data de plano. Sem Desfazer: a conclusão pontua e escreve na Day ou na Week.',
    abrirO: 'Abrir',
    /** O dia sem Day: as pessoas e o dinheiro esperam a nota. */
    semDay: 'Sem a Day deste dia: as pessoas e o dinheiro entram depois de criar a nota.',
    /** O "Informar saldo". */
    saldo: 'Saldo de hoje (R$)',
    gravar: 'Gravar',
    /** `{nota}` é o rótulo da nota da reserva (o nome dela, sem o símbolo do começo). */
    dicaDoSaldo: 'O número e a data de hoje vão para o cabeçalho da nota do {nota}; o texto dela não muda. Os valores são seus: nada é estimado.',
} as const;

/**
 * As frases da gaveta dos protocolos do ciclo (P12b): os botões, as partes e os avisos. As do
 * protótipo (template, 2700–2725: "Gravar", "Abrir no protocolo", "No plano da W44", "SMART da
 * semana: 2 de até 3", "Arraste uma tarefa da linha do tempo para a linha da W44: ela entra no
 * plano.") ficam como lá; as outras dizem o que o motor faz (o protocolo pergunta no fim, o
 * rascunho do motor). O nome e as perguntas vêm do JSON do protocolo; o modo, do botão.
 */
export const GAVETA = {
    planejar: 'Planejar',
    revisar: 'Revisar',
    gravar: 'Gravar',
    dicaGravar: 'Gravar: roda o protocolo com estas respostas, pelo caminho de sempre; o que ficou sem resposta ele pergunta no fim',
    completo: 'Abrir no protocolo',
    dicaCompleto: 'Abrir no protocolo: passo a passo, cada passo aberto com o valor daqui (Enter mantém)',
    rascunho: 'Guardar rascunho',
    dicaRascunho: 'Guardar rascunho: o rascunho do protocolo, na Caixa de entrada, com o botão de continuar',
    cancelar: 'Cancelar',
    dicaCancelar: 'Cancelar: fecha e esquece o que foi escrito aqui',
    fechar: 'Fechar (as respostas ficam aqui até fechar a vista)',
    rodape: '⌘Enter grava · Esc fecha e guarda as respostas · * obrigatório',
    sugerido: 'Sugerido:',
    todasMarcadas: 'todas marcadas, como o protocolo abre',
    tituloSugerido: 'a versão curta da resposta; o texto inteiro vai para o corpo da tarefa',
    opcional: 'opcional',
    nenhuma: '—',
    jaRegistrado: 'Já registrado hoje',
    dicaJaRegistrado: 'O registro de hoje já tem estes passos; o protocolo não os pergunta de novo.',
    semDiario: 'nada citado no diário de hoje',
    noFim: 'O protocolo pergunta no fim',
    dicaNoFim: 'Estes passos não cabem no formulário (ou ficaram sem resposta): ao gravar, o protocolo os pergunta no modal.',
    criar: (titulo: string) => `➕ Criar «${titulo}» ao gravar`,
    criarOnde: 'Onde dá para fazer?',
    resto: (nome: string, n: number, sugeridos: number) => `O resto do ${nome}: ${n} campo${n === 1 ? '' : 's'}, ${sugeridos ? `${sugeridos} preenchido${sugeridos === 1 ? '' : 's'} por sugestão` : 'nenhum preenchido por sugestão'}`,
    abrirResto: 'Abrir',
    recolherResto: 'Recolher',
    confiraResto: (n: number) => `Confira os ${n} campo${n === 1 ? '' : 's'} preenchido${n === 1 ? '' : 's'} por sugestão antes de gravar; Gravar de novo grava`,
    carregando: 'Lendo o protocolo…',
    naoCarregou: 'O protocolo deste botão não está carregado; abre passo a passo',
    noPlanoDa: (periodo: string) => `No plano da ${periodo}`,
    noPlanoDe: (periodo: string) => `No plano de ${periodo}`,
    noTrimestre: (periodo: string) => `No trimestre ${periodo}`,
    smartsDaSemana: (n: number, ate: number) => `SMART da semana: ${n ? `${n} de até ${ate}` : `nenhuma ainda (até ${ate})`}`,
    /** As SMART de manutenção de rotina da semana, fora das até 3 (29/10, §3). */
    manutencaoDaSemana: (n: number) => `🧰 Manutenção da semana: ${n}, fora das até 3`,
    arraste: (alvo: string) => `Arraste uma tarefa da linha do tempo para a linha ${alvo}: ela entra no plano.`,
    gravado: (nome: string) => `${nome}: gravando pelo protocolo`,
    gravadoComPerguntas: (nome: string, n: number) => `${nome}: gravando; o protocolo pergunta ${n} passo${n === 1 ? '' : 's'} no fim`,
    rascunhoGuardado: (nome: string) => `${nome}: rascunho na Caixa de entrada, com o botão de continuar`,
    rascunhoVazio: 'Nada para guardar: nenhuma resposta ainda',
    completoAberto: (nome: string) => `${nome}: passo a passo, aberto com o que estava aqui`,
    naoCriou: (titulo: string) => `Não criou «${titulo}»: nada foi gravado`,
    doProtocolo: (nome: string) => `As outras perguntas do ${nome}`,
} as const;

/**
 * As frases do painel do nó navegável (P10c): as conexões em duas direções, a trilha de onde se
 * veio, o "Criar a nota" do vínculo sem nota e as etiquetas que a tarefa nova leva do ramo.
 * Os nomes dos campos e dos tipos vêm do modelo e do ramo; aqui só o que a tela diz.
 */
/** As palavras de cada papel, na ordem em que os papéis aparecem na linha. */
export const PAPEIS_DO_PROTOCOLO: Readonly<Record<'campos' | 'cria' | 'revisa' | 'usa' | 'rodou' | 'sinal', string>> = {
    campos: 'dono dos campos', cria: 'cria este tipo', revisa: 'revisa', usa: 'para este nó', rodou: 'já rodou aqui', sinal: 'pelo sinal',
};

/** A seção Protocolos do painel do nó (a peça 2b, 30/10). */
export const PROTOCOLOS = {
    titulo: 'Protocolos',
    lendo: 'lendo os protocolos…',
    vazio: 'nenhum protocolo ligado a este tipo',
    dica: (nome: string) => `${nome}: abre com o contexto deste nó já respondido`,
    rodape: 'O peso propõe a ordem, com o porquê; a escolha é sua.',
};

/** A linha "Reputação" do painel do nó (o acabamento, 30/10): só de leitura, o nível e o porquê pelos fatos. */
export const REPUTACAO = {
    rotulo: 'Reputação',
    dica: 'A reputação desta função no uso, pelos fatos com data no cofre; só para ler, nada se grava na nota.',
};

export const PAINEL = {
    /** As etiquetas do ramo que a tarefa nova leva (o Novo diz antes de criar). */
    etiquetas: (lista: string) => `Leva a etiqueta do ramo: ${lista}`,
    /** O frontmatter da nota que nenhum modelo de tipo descreve, só para ler. */
    camposDaNota: (n: number) => `Campos da nota (${n})`,
    semModelo: 'Só para ler: nenhum modelo de tipo vale para esta nota (o type e a pasta dela).',
    modeloSemCampos: 'Só para ler: o modelo do tipo desta nota ainda não declara campos.',
    /** A seção das conexões do nó e os grupos fixos (os outros têm o rótulo do campo ou do tipo). */
    conexoes: 'Conexões',
    naMissao: 'Na Missão',
    noTexto: 'No texto da nota',
    /** O grupo maior que o limite: quantos ficaram de fora. */
    mais: (n: number) => `+${n}`,
    /** A seta de cada sentido: a nota aponta, apontam para ela, a ligação da linha. */
    sai: '→',
    entra: '←',
    linha: '↔',
    /** A conexão padrão do tipo (29/10): o que o modelo liga, sem link escrito nesta nota. */
    tipo: '⇅',
    dicaSai: 'esta nota aponta',
    dicaEntra: 'apontam para esta nota',
    dicaLinha: 'ligado na linha do tempo',
    dicaTipo: 'pela conexão padrão do tipo',
    /** O painel de uma nota que não é um nó da linha do tempo (aberto por uma conexão). */
    nota: 'Nota',
    /** A visão e o longo prazo separados no painel da visão (G5, C7). */
    aVisao: 'Visão',
    longoPrazo: 'Longo prazo (o ciclo, não a visão)',
    dicaDoLongoPrazo: 'A nota do ciclo longo ativo: o período, o horizonte e o estado dele. A visão vigente é a nota do 🔭, à parte.',
    canvasDoLongoPrazo: 'O canvas do longo prazo',
    /** As semanas do trimestre (G5). */
    semanas: 'Semanas',
    /** As Conexões em palavras (G5): o grupo dos canvas, o das notas sem tipo conhecido e o sentido de cada seta. */
    canvas: 'Canvas',
    outrasNotas: 'Outras notas',
    legendaDasSetas: '→ o que esta nota aponta · ← o que aponta para ela · ↔ ligado na linha do tempo',
    /** A porta 3 dos ramos (G7): o nó que outro ramo amplia leva a ela. */
    verNoRamo: (titulo: string) => `Ver no ramo ${titulo}`,
    /** A próxima ação real do projeto (02/11): a seção do painel, a marca no cartão e de onde ela veio. */
    proximaAcao: 'Próxima ação',
    marcaDaProxima: (titulo: string) => `→ ${titulo}`,
    nomeDaProxima: (titulo: string) => `próxima ação: ${titulo}`,
    proximaFixada: 'Fixada na nota do projeto (proxima_acao_real).',
    proximaPelaOrdem: 'A primeira ação aberta do projeto pela ordem padrão (a hora, o peso, a reputação); para fixar outra, o campo proxima_acao_real na nota do projeto.',
    proximaFixadaSemEfeito: (nome: string) => `A fixada (${nome}) não é uma ação aberta deste projeto; vale a ordem padrão.`,
    dicaVerNoRamo: (titulo: string) => `Ver no ramo ${titulo}: a mesma Missão, com o painel deste nó aberto lá`,
    /** O lugar em camadas (G6): os rótulos das linhas e das seções, a trilha e os atalhos. */
    pais: 'País',
    cidade: 'Cidade',
    cidades: 'Cidades',
    passagens: 'Passagens',
    chegada: 'Chegada',
    saida: 'Saída',
    registro: 'Registro',
    aberta: 'aberta, até hoje',
    paisADefinir: 'sem país na nota da cidade',
    semCidade: 'nenhuma cidade deste país no cofre',
    semPassagem: 'nenhuma passagem registrada',
    /** As estadias (30/10): as notas dos lugares onde se fica, na cidade e na passagem. */
    estadias: 'Estadias',
    semEstadiaNaCidade: 'nenhuma estadia nesta cidade ainda',
    semEstadiaNaPassagem: 'nenhuma estadia nestes dias',
    tarefasNaCidade: 'Tarefas nos dias da cidade',
    tarefasNoPais: 'Tarefas nos dias do país',
    ondeMora: 'Onde mora',
    passagemDe: (dia: string) => `passagem de ${dia}`,
    dicaDoLugar: (nome: string) => `${nome}: o painel dele`,
    /** A seção do dinheiro do período (G3): a soma, a reserva e o "Informar saldo". */
    dinheiro: 'Dinheiro',
    /** O Ciclo no painel do período: os botões do começo e os do fim, rotulados (G2). */
    cicloComeco: 'No começo',
    cicloFim: 'No fim',
    /** O que o ▶️ gravou na Day e o que o 🌙 deixou para hoje, no Ciclo do dia (02/11): só informação. */
    comandoAcao: '▶️ Ação',
    comandoSuficiente: 'Suficiente agora',
    comandoValor: 'Valor',
    comandoCompromisso: 'Compromisso 🤝',
    /** A legenda dos traços da forma de mostrar, embaixo da linha do período. */
    legendaDosTracos: '▮ feita · ▯ falta · ░ algum dia',
    /** A trilha: os painéis de onde se veio, e a volta (Alt+← ou Esc). */
    trilha: 'De onde veio',
    voltar: '‹ Voltar',
    dicaVoltar: (titulo: string) => `Voltar ao painel de ${titulo}`,
    voltarAte: (titulo: string) => `Voltar até ${titulo}`,
    /** As pontas da trilha que não cabem na tela. */
    reticencias: '…',
    /** O alvo de um vínculo sem nota: criar a nota pelo Novo do tipo, com o nome já respondido. */
    criarANota: 'Criar a nota',
    dicaCriarANota: (titulo: string, nome: string) => `Criar a nota: o ${titulo}, com «${nome}» já respondido, pelo protocolo dono; depois o painel mostra os campos dela`,
} as const;

/** Quantas SMART uma semana leva (a mesma regra da sugestão do 🌳, `sugestoesDoPasso.ts`, "até 3"). */
export const SMART_DA_SEMANA_ATE = 3;

/**
 * As frases do "Escolher uma que já existe" no Novo (29/10): a busca em cima, a lista com o
 * porquê, e o "Criar nova" embaixo. O que cada escolha grava diz o aviso da gravação de sempre.
 */
export const ESCOLHER = {
    titulo: 'Escolher uma que já existe',
    criar: 'Criar nova',
    dica: '↑ ↓ e Enter escolhem · Tab vai para Criar nova',
    /** Nada achado com o texto: ele vai para o título do "Criar nova". */
    nenhuma: (texto: string) => `Nenhuma com “${texto}”: o texto vai para o título de Criar nova`,
    vazia: 'Nenhuma para escolher aqui',
    mais: (n: number) => `e mais ${n}: digite para achar`,
    pendente: 'pendente de antes',
    semData: 'sem data',
    porQueAgora: (motivos: string) => `Por que agora: ${motivos}`,
} as const;

/**
 * As frases do "＋ Adicionar" de cada campo de link do painel (29/10): a mesma busca do Novo e, embaixo,
 * o "Criar nova" pelo protocolo dono do tipo, que liga a nova ao campo quando termina.
 */
/**
 * O "Ligar" de dois cartões (30/10): a alça arrastada até outro cartão, ou o "Ligar" e o clique no outro.
 * A ligação é sempre um campo de link dos modelos de tipo (ligar.ts); os textos dizem qual.
 */
export const LIGAR = {
    botao: 'Ligar',
    dica: (titulo: string) => `Ligar ${titulo} a outro cartão: clique no outro (ou arraste a alça até ele); Esc cancela`,
    alca: (titulo: string) => `Alça de ${titulo}: arraste até outro cartão para ligar os dois (pelo teclado: o Ligar, depois o outro cartão)`,
    escolhaOOutro: (titulo: string) => `Ligar ${titulo}: clique no cartão de destino · Esc cancela`,
    cancelado: 'Ligar: cancelado',
    mesmo: 'é o mesmo cartão',
    semCampo: (de: string, para: string) => `Nenhum campo dos modelos liga ${de} a ${para}: nada se grava`,
    /** Há o campo, mas o gesto não grava (já estão ligados, a regra da seta): o porquê dele. */
    recusada: (de: string, para: string, porque: string) => `${de} e ${para}: ${porque}`,
    qual: (de: string, para: string) => `Ligar ${de} a ${para}: qual ligação?`,
    /** A ligação pelo campo de quem a guarda: o outro entra no campo dele ("a1 · SMART ou projeto: S1"). */
    noCampo: (dono: string, campo: string, outro: string) => `${dono} · ${campo}: ${outro}`,
    /** A ligação pelo soltar (o tempo, o projeto, a SMART), com o texto do gesto. */
    soltar: (titulo: string, texto: string) => `${titulo}: ${texto}`,
    /** A subtarefa (30/10): a filha embaixo da mãe, no `projects` dela. */
    subtarefa: (filha: string, mae: string) => `${filha} · subtarefa de ${mae}`,
    /** O campo do protocolo dono (30/10): o Ligar abre o protocolo com o campo já respondido. */
    peloDono: (dono: string, campo: string, outro: string, protocolo: string) => `${dono} · ${campo}: ${outro} (pelo ${protocolo})`,
    novoNo: (rotulo: string, titulo: string) => `+ ${rotulo}: a partir de ${titulo}, com a ligação já respondida`,
    item: (titulo: string) => `+ Item: uma linha na checklist de ${titulo}`,
};

export const ADICIONAR = {
    titulo: 'Adicionar',
    botao: '＋ Adicionar',
    dica: (campo: string) => `＋ Adicionar em ${campo}: escolher uma que já existe ou criar nova`,
    /** O "Criar nova" pelo ramo: o texto da busca vai como o nome. */
    nomeDaBusca: 'o nome é o texto da busca',
    dicaPeloRamo: 'Enter na busca escolhe · o nome da nova é o texto da busca · Esc fecha',
    soEscolher: 'Enter na busca escolhe · Esc fecha',
    escrevaONome: (rotulo: string) => `${rotulo}: escreva o nome na busca`,
    /** A nota nova que não entrou no campo (já estava, ou não chegou ao modelo). */
    naoEntrou: (nome: string, campo: string, porque: string) => `${nome} não entrou em ${campo}: ${porque}`,
    esperando: (nome: string, campo: string) => `${nome}: entra em ${campo} quando o protocolo terminar`,
    antes: (texto: string, antes: string) => `${texto} · antes: ${antes}`,
    /** A tecla do projeto ou da SMART na triagem sem nada daquela espécie para escolher (02/11). */
    nadaParaEscolher: 'Nada para escolher aqui',
} as const;

/**
 * As palavras do ramo de um nó (a pinça e as Conexões do painel, 29/10): por onde veio o que está
 * acima ("pela SMART"), o sentido em palavras (acima, abaixo, ao lado) e o nome de cada relação.
 */
/** As portas da Missão (02/11): o comando da nota de período e o aviso do fim do 🌳 e do 🧭. */
export const PORTAS = {
    comando: 'DFM: Abrir a Missão nesta semana ou trimestre',
    /** O aviso do fim do protocolo de planejamento: o período e o link. */
    fim: (periodo: string) => `${periodo}: `,
    abrir: 'Abrir na Missão',
} as const;

export const RAMO = {
    /** O título da coluna do ramo que só tem SMART, ou só tarefas (30/10: os grupos separados, com o nome). */
    grupoDaColuna: { smart: 'SMART', acao: 'Tarefas' } as Readonly<Partial<Record<string, string>>>,
    /** Por onde veio o que está acima do que está acima, pela espécie do passo de baixo. */
    pelo: { smart: 'pela SMART', projeto: 'pelo projeto', acao: 'pela tarefa mãe', area: 'pela área', cidade: 'pela cidade', pais: 'pelo país' } as Readonly<Partial<Record<string, string>>>,
    /** De onde ficou a tarefa que a linha mostra ao lado (02/11): "ficou da W44", "ficou de qua 28/10". */
    ficouDe: (periodo: string) => (/^W\d/.test(periodo) ? `ficou da ${periodo}` : `ficou de ${periodo}`),
    /** Por que a tarefa é candidata no "＋ Adicionar" (02/11): sem semana, num projeto do foco; agendada fora; do projeto da SMART. */
    /** De onde vem o item dos Suportes e decisões (02/11): a semana, ou o próprio trimestre. */
    suporteDe: (onde: string) => `Suportes e decisões · ${onde}`,
    doTrimestre: 'do trimestre',
    candidataSemSemana: 'sem semana, num projeto do foco',
    semDia: 'sem data',
    candidataFora: (quando: string) => `da SMART da semana, ${quando}`,
    candidataDoProjeto: (projeto: string) => `de ${projeto}, sem SMART`,
    /** O item marcado da checklist. */
    itemFeito: 'feito',
    /** O item da checklist ainda por marcar (a linha `- [ ]`). */
    itemAberto: 'aberto',
    /** O grupo de links sem chave de propriedade (os do texto da nota), em palavras: "10 · links do texto" (02/11). */
    grupoDoLink: { sai: 'links do texto', entra: 'notas que apontam', ligada: 'ligadas' } as Readonly<Partial<Record<string, string>>>,
    /** Os sentidos, em palavras, nas Conexões do painel. */
    acima: 'Acima: a que pertence',
    abaixo: 'Abaixo: o que tem dentro',
    lado: 'Ao lado: dependências e pares',
    outros: 'Outros links',
    /** O nome de cada relação dos modelos, em palavras (o grupo nas Conexões). */
    relacao: {
        smart: 'SMART', projeto: 'Projeto', area: 'Área', acao: 'Ações', mae: 'Tarefa mãe', subtarefa: 'Subtarefas',
        central: 'A central a que serve', auxiliar: 'Auxiliares', 'bloqueada-por': 'Bloqueada por', bloqueia: 'Bloqueia',
        pais: 'País', cidade: 'Cidades', passagem: 'Passagens', pessoa: 'Pessoas', periodo: 'Período', par: 'Pares', item: 'Checklist', ligada: 'Ligadas',
        frente: 'Projeto do período', pendente: 'Ficou de antes', suporte: 'Suportes e decisões',
    } as Readonly<Partial<Record<string, string>>>,
    /**
     * O título de cada coluna da disposição declarada (02/11, `formacao.colunas`), pelo nome dela; a
     * coluna sem título aqui fica sem título.
     */
    colunaDeclarada: {
        projeto: 'Projetos', smart: 'SMART', acao: 'Tarefas', dia: 'Dias', semana: 'Semanas', trimestre: 'Trimestre', ano: 'Ano', visao: 'Visão', lado: 'Ao lado: links e decisões',
    } as Readonly<Partial<Record<string, string>>>,
} as const;

/** As frases da checklist da tarefa no painel (29/10): os itens da nota como nós, marcar e acrescentar. */
export const CHECKLIST = {
    titulo: 'Checklist',
    vazia: 'sem itens na checklist',
    lendo: 'lendo a nota…',
    novo: '+ Item',
    dicaNovo: '+ Item: uma linha "- [ ]" no fim da checklist da nota (ou no fim da nota, se ela não tem checklist)',
    textoDoItem: 'O item',
    gravar: 'Acrescentar',
    dicaMarcar: (texto: string, feito: boolean) => `${feito ? 'Desmarcar' : 'Marcar'}: ${texto} (só esta linha da nota muda)`,
    marcado: (texto: string) => `Feito: ${texto}`,
    desmarcado: (texto: string) => `Aberto: ${texto}`,
    acrescentado: (texto: string) => `Item: ${texto}`,
    mudou: 'a linha mudou na nota depois que o painel a leu; o painel lê de novo',
    escrevaOItem: 'Escreva o item',
} as const;

/** As frases da tarefa mãe e das subtarefas no painel (29/10, o jeito do TaskNotes: o `projects` aponta a mãe). */
export const SUBTAREFAS = {
    mae: 'Tarefa mãe',
    titulo: 'Subtarefas',
    vazia: 'sem subtarefas',
} as const;

/**
 * As frases do menu de status (02/11): um lugar só para mudar o estado de um nó que tem a tabela de
 * estados (a tarefa, a SMART e qualquer tipo cujo modelo a declara), no painel, no cartão e na tecla S.
 * Por quê: o painel precisa de um jeito de excluir a tarefa, ou um menu de status com as opções de
 * arquivar, excluir e deixar para algum dia (02/11/2026). Os grupos seguem o ciclo
 * (planejar, executar, fechar); o que destrói vem por último, separado, e pede a confirmação.
 */
export const STATUS = {
    botao: '⋯ Status',
    tecla: 'S',
    dica: (titulo: string) => `Status de ${titulo}: o estado, arquivar e excluir, num menu só`,
    titulo: 'Status',
    grupos: { planejar: 'Planejar', executar: 'Executar', fechar: 'Fechar', estado: 'Estado' } as Readonly<Record<'planejar' | 'executar' | 'fechar' | 'estado', string>>,
    agora: (rotulo: string) => `${rotulo} · agora`,
    dicaDoEstado: (rotulo: string, titulo: string) => `${rotulo}: ${titulo} (o aviso traz Desfazer)`,
    dicaDoConcluir: (titulo: string) => `Concluir: ${titulo} (pergunta quando terminou; fechar sem escolher não conclui)`,
    dicaDoNeutro: (rotulo: string, titulo: string) => `${rotulo}: ${titulo} (neutro, não conta como falta)`,
    gravado: (rotulo: string, titulo: string) => `${rotulo[0].toUpperCase()}${rotulo.slice(1)}: ${titulo}`,
    /** O tempo no menu (02/11, um jeito por função): leva ao "Mover para…" do painel, que tem o dia e a hora. */
    remarcar: 'Mover para…',
    dicaRemarcar: 'Mover para…: o dia e a hora, no painel',
    fazerAgora: '🤝 Fazer agora',
    arquivar: 'Arquivar',
    dicaArquivar: (titulo: string) => `Arquivar: ${titulo} vai para o arquivo do TaskNotes (o Desfazer a traz de volta)`,
    desarquivar: 'Tirar do arquivo',
    dicaDesarquivar: (titulo: string) => `Tirar do arquivo: ${titulo} volta para as tarefas`,
    arquivada: (titulo: string) => `Arquivada: ${titulo}`,
    foraDoArquivo: (titulo: string) => `Fora do arquivo: ${titulo}`,
    excluir: 'Excluir…',
    dicaExcluir: (titulo: string) => `Excluir: ${titulo} vai para a lixeira (pede confirmação)`,
    pergunta: (titulo: string) => `Excluir "${titulo}"? Vai para a lixeira, dá para recuperar.`,
    links: (n: number) => (n === 1 ? '1 nota aponta para ela; o link fica sem destino até ela voltar.' : `${n} notas apontam para ela; os links ficam sem destino até ela voltar.`),
    semLinks: 'Nenhuma nota aponta para ela.',
    confirmar: 'Excluir',
    naoExcluir: 'Voltar',
    excluida: (titulo: string) => `Na lixeira: ${titulo}`,
    naLixeiraDoSistema: (titulo: string) => `Na lixeira do sistema: ${titulo} (recupere por lá; o Desfazer não alcança)`,
    origem: 'Veio de',
} as const;

/** As frases da pinça (29/10 e 30/10): o longo prazo, o grafo que ainda não existe e a vista do ramo. */
/** O expandir e o recolher de um nó (30/10): o que ele tem abaixo, no lugar, na coluna da frente. */
export const EXPANDIR = {
    /** A tecla sobre o nó escolhido (livre na página e na triagem; o teste confere). */
    tecla: 'X',
    expandir: '▸',
    recolher: '▾',
    dicaExpandir: (titulo: string) => `Expandir ${titulo}: o que ele tem abaixo, na coluna da frente`,
    dicaRecolher: (titulo: string) => `Recolher ${titulo}: esconde o que saiu dele`,
};

export const PINCA = {
    longoPrazo: 'Longo prazo',
    /** O longo prazo é o período da visão: os anos que o horizonte dela cobre (30/10). */
    longoPrazoDe: (de: string, ate: string) => `Longo prazo · ${de}–${ate}`,
    dicaLongoPrazo: (coluna: string, de: string, ate: string, horizonte: string | null) =>
        `Longo prazo: o período da visão, ${de} a ${ate}${horizonte ? ` (${horizonte})` : ''}; o Ano com ${coluna} em foco`,
    naoExiste: 'este nível ainda não existe',
    /** O grafo é a vista de grafo do Obsidian; desligado, o aviso diz onde ligar. */
    grafoDesligado: 'o grafo do Obsidian está desligado (Configurações › Plugins principais › Visualização de gráfico)',
    /** O grafo abre numa aba nova, ao lado da Missão, que fica no Sistema; fechar a aba volta a ela (30/10). */
    grafoAberto: 'Grafo aberto ao lado; feche a aba (⌘W) para voltar à Missão',
    sistema: 'O sistema, do começo até hoje',
    sistemaDesde: (desde: string | null) => (desde ? `O sistema desde ${desde}, do começo até hoje` : 'O sistema: ainda sem nota de período'),
    sistemaAntes: (n: number) => `+${n} trimestres antes`,
    contasDoTrimestre: (notas: number, feitas: number, abertas: number) => [notas ? `${notas} notas` : '', feitas ? `${feitas} feitas` : '', abertas ? `${abertas} abertas` : ''].filter(Boolean).join(' · ') || 'sem registro',
    lendoEch: 'ECH: lendo…',
    dicaDoTrimestre: (q: string) => `${q}: o clique abre o painel; abrir os dedos volta ao longo prazo`,
    fundo: 'o ramo não desce mais aqui',
    pilhaCheia: 'zoom demais: volte um nível antes de entrar em outro ramo',
    ramoDe: (titulo: string) => `O ramo de ${titulo}`,
    caminho: 'O caminho do zoom',
    dicaDaParte: (rotulo: string) => `Voltar a ${rotulo}`,
    maisConexoes: (n: number) => `mais conexões (${n})`,
    /** O cartão de um grupo de conexões de pouco valor do mesmo tipo (30/10): "3 · Dia". */
    grupo: (n: number, nome: string) => `${n} · ${nome}`,
    dicaDoGrupo: (n: number, nome: string) => `${n} conexões (${nome}) num cartão só: o clique, a rolagem para o lado ou o "mais conexões" as abrem`,
    dicaMais: 'Mais conexões: mostra os próximos itens deste nível (a rolagem para o lado também abre)',
    escondidos: (n: number) => `+${n} nos níveis de cima`,
    vertical: { tempo: '↕ no tempo', relacao: '↕ pela cadeia' } as Readonly<Record<'tempo' | 'relacao', string>>,
    /** A legenda dos gestos no mapa do ramo: as direções são para onde os gestos levam. */
    legenda: (nivel: number, vertical: string) => `nível ${nivel} · ← o que contém · o que tem dentro → · ${vertical} · ↔ pelas conexões · abrir os dedos sobre um nó: mais fundo · fechar os dedos ou Esc: volta`,
    dicaDoCentro: (titulo: string) => `${titulo}: o clique abre o painel; abrir os dedos (ou ⌘ e a roda) desce mais um nível no ramo; fechar os dedos ou Esc volta`,
    dicaDoItem: (titulo: string) => `${titulo}: o clique abre o painel; abrir os dedos sobre ele entra no ramo dele`,
} as const;
