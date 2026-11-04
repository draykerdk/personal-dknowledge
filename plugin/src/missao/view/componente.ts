/**
 * O componente da Missão: monta uma vez num lugar e se atualiza por dentro.
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, §3.3, §3.4, §3.8, §9) e o
 * protótipo aprovado (commit 94cbe1d4), que é o contrato de aparência e de gesto. O
 * mesmo componente mora em três lugares (a primeira página do Mission Control, a aba
 * própria e, no P14, o canvas); os três diferem só no adaptador. A fase 1 de 27/10
 * apagava e refazia a página a cada clique; aqui nada se apaga: a troca de foco refaz só
 * a linha que fecha e a que abre, e uma versão nova do cofre troca só as linhas cujo
 * conteúdo mudou, sem perder a rolagem, o foco, o painel do nó nem a busca.
 *
 * As partes, uma tarefa cada: as linhas (`linhas.ts`), os nós (`nos.ts`), as asas e as
 * ligações (`ligacoes.ts`), o painel do nó (`painelDoNo.ts`); aqui ficam o estado de tela,
 * o teclado e os gestos (roda, toque, painéis de lado), a busca e a legenda. Tudo o que
 * muda de um ramo para outro vem do arquivo do ramo: aqui não há nome de ramo nem
 * coluna fixa. Todo ouvinte fica preso à raiz do componente (nunca `window` nem
 * `document`), e nenhum método se chama open, close, load ou unload (R9).
 *
 * Grava (P6) só onde o lugar dá as gravações (`adaptador.gravar`: a página e a aba no
 * computador; no celular de verdade o lugar não as dá, e diz por quê, §9.1): arrastar no
 * tempo, para um projeto ou para uma SMART, a alça da SMART, escolher uma ligação e
 * Delete, e o painel do nó que edita. A vista estreita no computador grava pelos menus e
 * pelas teclas; o arrasto fica acima de 520 px (P7d). Cada gesto vira uma intenção (`intencoes.ts`), e a
 * gravação é do lugar (`missaoWrites.ts`, pela tabela das setas); o aviso traz Desfazer, e
 * ⌘Z (com a Missão em foco) desfaz a última da pilha única. Todo arrasto tem um caminho pelo
 * teclado ou pelo menu (§9.3): o "Mover para…" e as ligações do painel do nó.
 *
 * Cria (P8) pelo Novo: o "+ Novo" do cabeçalho e do ⋯, e o que cada nó cria (o ramo diz:
 * "+ Nova ação" na SMART, "+ Nova tarefa" na linha), num formulário na gaveta com o seletor de
 * tipo do ramo e os campos do modelo do tipo (`view/novo.ts`, `novo.ts`). Não há tecla de uma
 * letra para ele: N é a nota e C o canvas do nó, e A é "amanhã" na triagem; o "+ Novo" fica no
 * Tab e no ⋯. Onde o ramo diz o que escolher faz a partir do nó (29/10), o Novo abre com a busca
 * "Escolher uma que já existe" em cima (`escolher.ts`): escolher aplica o gesto de sempre (soltar
 * sobre o nó, ou o campo do painel), com o Desfazer, e nunca cria; nada achado, o texto vai para
 * o título do "Criar nova". No celular de verdade, nada cria nem escolhe (o lugar não dá as gravações).
 *
 * A pinça (29/10 e 30/10) é o terceiro eixo, com um dono só (`nav`, por `passoDaNavegacao`): a
 * pinça do trackpad e o ⌘ com a roda (`passoDaRoda`, eixo `z`), os dois dedos do toque
 * (`passoDaPinca`) e o `+`/`−` dão um nível por gesto, sem rolar. A expansão sobe Dia → Semana →
 * Trimestre → Ano → Longo prazo (o Ano com a coluna do horizonte em foco) → Sistema e, depois
 * dele, abre o grafo do Obsidian numa aba ao lado (a Missão fica no Sistema; fechar a aba volta a
 * ela). Acima da escala de onde a expansão partiu, o zoom volta um degrau, mesmo sobre um nó; na
 * escala de partida, o zoom num nó abre a vista do ramo (`view/ramo.ts`), mais fundo a cada
 * zoom, com o caminho do zoom e o Esc para voltar; ali as rolagens andam pela formação do nó. O
 * clique continua abrindo o painel. Prova: tests/missao/componentePinca.test.ts.
 * Prova: tests/missao/componente.test.ts, tests/missao/componenteGrava.test.ts e tests/missao/componenteNovo.test.ts.
 */
import type { Achado, Avisar, Destino, EstadoTela, ItemDaTriagem, Ligacao, LinhaAberta, MissaoModelo, RegistroDoFeito, ResultadoDaGravacao, ResultadoDoDesfazer, AdicaoAoCampo, GestoDaEscolha, LeitorDoEscolher, ListaDoEscolher, OrigemDoNovo, GestoDaChecklist } from '../tipos';
import type { Papel } from '../../engine/papeisDeProtocolo';
import { DEFINICOES_PADRAO } from '../../definicoes';
import { ciclosDoPeriodo, colunaDoHorizonte, dataDoPeriodo, ramoQueAmplia, planoDaGrade, type RamoPrincipal, type PlanoDaGrade } from '../ramoPrincipal';
import { alternarAbrirTudo, andarFoco, comEscala, comNivel, escalaDaTela, irParaAchado, irParaHoje, linhaAberta, podeTomarFoco } from '../estadoTela';
import {
    addDays, chaveDeHoje, diaDaSemana, diasDoPeriodo, diaMes, idDoPeriodo, isChaveEspecial, periodoDoId, semanaCurta, ESCALAS, type Escala,
    AFASTA, APROXIMA, navegacaoInicial, passoDaNavegacao, type NivelDaNavegacao, type PassoDeNivel,
} from '../tempo';
import { ehDia } from '../formatos';
import { quarterOfWeek } from '../../engine/calendario';
import { datasDaPassagem } from '../lugares';
import { ADICIONAR, FRASES, GAVETA, PINCA, EXPANDIR, STATUS } from '../frases';
import { fold } from '../../project/projectCanvasModel';
import { TASK_CONTEXTS } from '../../engine/taskContexts';
import { chaveDoContexto, lugaresDoOnde } from '../filtros';
import { VISAO_ID } from '../linhagem';
import { el, botao, janela, lupa } from './dom';
import { amostraEl, CORES_DE_RAMO } from './nos';
import { DICAS_SO_DO_NOME, type Contexto, type DicasDaMissao } from './contrato';
import { linhaAbertaEl, linhaFechadaEl } from './linhas';
import { acenderLinhagem, ligarCurvas, type SuperficieDasLigacoes } from './ligacoes';
import { ligarArrasto } from './arrasto';
import { ligarFerramentas, ligarInteracao, ligarRealce, previaDoLigar } from './interacao';
import { conteudoDoPainel } from './painelDoNo';
import { trilhaEl, type PassoDaTrilha } from './conexoes';
import { svg } from './dom';
import { valorDoCampo, type Vocabularios } from '../../engine/fieldModel';
import { modeloDaNota, valorEmTexto } from '../camposDoNo';
import { checagensDoTexto } from '../checklist';
import { estadoDoNo, rotulosDoCatalogo } from './campos';
import { intencaoDaAlca, intencaoDeDesligar, intencaoDeSoltar, ligacaoDesligavel, opcoesDeMover, valorDoEstado, type IntencaoDaTela } from '../intencoes';
import type { WeightReason } from '../../engine/decisionWeights';
import { intencaoDaTecla, type DestinoDaCaixa, type DestinoDaIdeia, type IntencaoDaTriagem } from '../triagem';
import {
    PAPEL_DA_IDEIA, TRIAGEM_INICIAL, comFiltro, depoisDoDesfazer, depoisDoGesto, itemAtual, pular as pularItem, voltar as voltarItem, type EstadoDaTriagem, type FiltroDaTriagem,
} from '../telaDaTriagem';
import { conteudoDaTriagem, type FormDaTriagem } from './triagem';
import { contextoDoNovo, entradasDoNovo, especieDoNo, nomeParaOLink, novosDoNo, origemDoNovo, origemEmPalavras, respostasDoProtocolo, smartDosValores, sugestoesDoNovo, candidatosDoCampo, comEtiquetas, NOME_DA_NOTA, pastaDoModulo, pedidoDaNota, tiposDoNovo, validarCampos, type PassoDoProtocolo, type PedidoDaNota, type TipoDoNovo } from '../novo';
import { campoDoTitulo, escolhaDoNovo, notaDoRamo, tiposDoCampo, tituloDaBusca } from '../escolha';
import { conteudoDoNovo, type FormDoNovo } from './novo';
import type { LigacoesDaNota } from '../conexoes';
import {
    chaveDoRascunho, conferirGaveta, criacoesAoGravar, pedidoDoCiclo, resumoDoResto, rodadaCompletaDaGaveta, rodadaDaGaveta, variaveisDasDatas, vistaDaGaveta,
    type CriacoesPedidas, type OpcoesDoPasso, type PedidoDoCiclo, type ProtocoloDaGaveta, type VistaDaGaveta,
} from '../gaveta';
import { conteudoDaGaveta, type FormDaGaveta } from './gaveta';
import type { CicloDoPeriodo } from '../ramoPrincipal';
import type { LidoDosProtocolos, ProtocoloDoNo, ReputacaoDoNo } from '../tipos';
import type { DatasDaRodada } from '../../engine/protocolForm';
import type { DomainField } from '../../engine/domainModel';
import {
    CURVA_DA_PINCA, DURACAO_DA_PINCA, RODA_PARADA, classeDaPinca, rolarNoBloco, ehDaProfundidade, escalasDaPinca, flipDe, origemDaPinca, passoDaRoda, transicaoDoPasso,
    type Caixa, type EstadoDaRoda,
} from '../movimento';
import { PINCA_PARADA, passoDaPinca, type EstadoDaPinca } from '../pinca';
import { CONEXOES_A_VISTA, CURSOR_INICIAL, EXPANSAO_DO_MAPA, abrirGrupo, comTopo, expansaoNoMapa, mapaDoRamo, maisConexoes, migalhasDoZoom, navegaveisDoRamo, passoHorizontal, vizinhoNaFormacao, voltarAte, type CursorDoRamo, type MapaDoRamo } from '../telaDoRamo';
import { disposicaoDoNo, formacaoDoDominio, formacaoDoNo, type DisposicaoDoRamo } from '../formacao';
import type { Formacao } from '../../engine/domainModel';
import type { LeitorDoRamo, RamoDoNo } from '../tipos';
import { ramoEl, superficieDoRamo } from './ramo';
import { sistemaEl } from './sistema';
import { periodoDaVisao } from '../sistema';
import { rotuloDoType } from './conexoes';

/** Quantos trimestres do nível Sistema pedem a linha do ECH (os mais novos; cada leitura lê notas do cofre). */
export const ECH_DO_SISTEMA = 8;

/** As linhas de cada lado do foco que ficam no DOM (§9.2: "o foco e 24 linhas para cada lado"). */
export const LINHAS_DE_CADA_LADO = 24;

/** O estado que um lugar guarda e devolve (a aba, pelo `getState`; o "⤢ Abrir em outra aba"). */
export interface EstadoDaMissao {
    escala: Escala;
    foco: string;
    selecionado: string | null;
    abrirTudo: boolean;
    /** O nó com o painel aberto. */
    aberto: string | null;
    /** O "Onde estou" (o contexto do TaskNotes); `null` = todos. */
    onde: string | null;
    /** O ramo escolhido (P10b, o id do arquivo em `Config/ramos/`); `null` = o do lugar. */
    ramoPrincipal?: string | null;
    /**
     * O que se expandiu e se recolheu em cada vista (30/10), pela raiz dela (o nó do ramo): id → aberto; a aba
     * reaberta volta como estava.
     */
    expansao?: Record<string, Record<string, boolean>>;
}

/** Um ramo que se escolhe (o id do arquivo, o título e, no seletor, o que ele é). */
export interface RamoParaEscolher { id: string; titulo: string; descricao?: string; antes?: string[] }

/** O nó que a troca de ramo leva junto (G7): o id, o título e a nota, para achá-lo no outro ramo. */
interface NoParaLevar { id: string; titulo: string; nota: string | null }

/** Quanto tempo (ms) depois de um nível da pinça do toque o clique no mapa não vale (o toque dos dedos não vira clique). */
export const CLIQUE_DEPOIS_DA_PINCA = 350;

/** A tecla do seletor dos ramos (G7, porta 2): livre na página e na triagem (as letras da triagem são outras). */
export const TECLA_DOS_RAMOS = 'G';

/** A gaveta do ciclo aberta (P12b): o botão, o pedido, o protocolo lido e o que o operador escreveu. */
interface EstadoDaGaveta {
    ciclo: CicloDoPeriodo;
    pedido: PedidoDoCiclo;
    chave: string;
    /** O protocolo lido pelo motor; `null` enquanto lê. */
    p: ProtocoloDaGaveta | null;
    falhou: boolean;
    digitadas: Record<string, unknown>;
    criar: CriacoesPedidas;
    restoAberto: boolean;
    /** O resto do 📨 já foi aberto uma vez (o Gravar não pede mais para conferir). */
    restoVisto: boolean;
    problemas: Record<string, string>;
    opcoes: Map<string, OpcoesDoPasso>;
    /** A leitura da vez (a resposta de uma leitura velha não vale). */
    versao: number;
    gravando: boolean;
}

/** O Novo aberto (P8): o tipo, de onde abriu, o que o operador escreveu e os problemas da última conferência. */
interface EstadoDoNovo {
    tipo: string;
    origem: OrigemDoNovo;
    digitadas: Record<string, unknown>;
    digitados: Set<string>;
    problemas: Record<string, string>;
    /** O que se escreveu nas perguntas do protocolo dono que o modelo do tipo não tem (P12b). */
    doDono?: Record<string, unknown>;
    /** O texto da busca do "Escolher uma que já existe" e a opção da vez (↑ ↓). */
    busca?: string;
    escolhaI?: number;
    /** O "＋ Adicionar" de um campo (29/10): o nó, a nota e o campo que recebe a escolhida ou a nova. */
    campo?: AdicaoAoCampo;
    /**
     * O item da triagem de onde o "＋ Adicionar" abriu (02/11, o projeto e a SMART pela tecla): a escolha grava
     * com o aviso da triagem e o item seguinte vem à vista, como em todo gesto da triagem.
     */
    triagem?: string;
}

/** O que o lugar onde a Missão mora dá a ela (o adaptador fino, §3.3). */
export interface AdaptadorDaMissao {
    /** O elemento onde a Missão monta (a raiz dela nasce dentro). */
    raiz: HTMLElement;
    lugar: 'pagina' | 'aba' | 'canvas';
    /** O modelo da versão de agora para o ramo lido (as coleções e o recorte dele, P10b). */
    modelo(ramoPrincipal?: RamoPrincipal | null): Promise<MissaoModelo>;
    /** O ramo pelo id (`Config/ramos/<id>.json`); sem id, o do lugar. */
    ramoPrincipal(id?: string | null): Promise<RamoPrincipal>;
    /** Os ramos que se escolhem no ⋯ (P10b); sem a função, ou com uma só, não há escolha. */
    ramosPrincipais?: () => Promise<RamoParaEscolher[]>;
    /** Abre a TaskNote no editor do TaskNotes (`MissionBoard.openTask`). */
    abrirTarefa(caminho: string): void;
    /** Abre uma nota ou um canvas numa aba. */
    abrirNota(caminho: string): void;
    /** O frontmatter de uma nota, só lido (o painel do nó mostra os campos pelo modelo do tipo). */
    camposDaNota?: (caminho: string) => Record<string, unknown> | null;
    /**
     * As ligações de uma nota, pelo cache de metadados (P10c, as conexões do painel): os links
     * que ela faz e as notas que a apontam; `null` = a nota não existe. Só lê.
     */
    ligacoesDaNota?: (caminho: string) => LigacoesDaNota | null;
    /** O texto de uma nota (`cachedRead`), só lido: a checklist da tarefa (29/10); `null` = a nota não existe. */
    textoDaNota?: (caminho: string) => Promise<string | null>;
    /**
     * O que a seção Protocolos de um nó lê do cofre e do motor (a peça 2b, 30/10): os campos de cada
     * protocolo para os pesos, as rodadas na nota (as linhas das Days que a ligam) e o modelo da escolha.
     */
    protocolosDaNota?: (caminho: string) => Promise<LidoDosProtocolos>;
    /**
     * A linha "Reputação" do painel do nó (o acabamento, 30/10): o nível e o porquê da nota que é uma
     * função com reputação, pelo núcleo; `null` = a nota não tem reputação (o painel não mostra a linha).
     */
    reputacaoDaNota?: (caminho: string) => Promise<ReputacaoDoNo | null>;
    /** A nota que um nome escrito acha a partir de outra (`getFirstLinkpathDest`); `null` = nenhuma. */
    resolverLink?: (nome: string, de: string) => string | null;
    /** O grafo do cofre (o último nível da expansão, 30/10): abre a vista de grafo do Obsidian numa aba ao lado da Missão, sem trocar a dela; `false` = o plugin dela está desligado. */
    abrirGrafo?: () => boolean;
    /** A linha do ECH de um período (`nucleo.ech`), só lida, para o nível Sistema; `null` = sem a leitura. */
    echDoPeriodo?: (periodo: string) => Promise<string | null>;
    /** O "⤢ Abrir em outra aba", levando o estado (só onde faz sentido). */
    abrirEmOutraAba?: (estado: EstadoDaMissao) => void;
    /** O nome de um protocolo como o JSON dele diz (o emoji e o nome); `null` = não se lê. */
    nomeDoProtocolo?: (id: string) => string | null;
    /** O protocolo carregado que faz o papel (`ProtocolManager.idDoPapel`); `null` = o cofre não tem. Sem a leitura, a dos padrões da v0. */
    protocoloDoPapel?: (papel: Papel) => string | null;
    /** O protocolo está carregado? Sem a leitura, todo botão do ciclo do ramo aparece. */
    protocoloExiste?: (id: string) => boolean;
    /** Sem gravações, o porquê, em palavras ("No celular é só para ver; as ações ficam no computador"). */
    somenteLeitura?: string;
    /** O catálogo para ler (os rótulos da prioridade e do status), também onde não se grava. */
    vocabularios?: () => Vocabularios;
    /** Avisa o lugar quando o estado muda (a aba guarda no workspace). */
    aoMudar?: (estado: EstadoDaMissao) => void;
    /**
     * As gravações (P6). Sem elas, a Missão é só leitura (o canvas até o P14, o celular até
     * o P15): nada de arrasto, alça, ligação que se escolhe nem campo que se edita.
     */
    gravar?: GravarDaMissao;
}

/** O que o lugar grava pela Missão (as `GravacoesDaMissao` do quadro, mais o catálogo). */
export interface GravarDaMissao {
    mover(caminho: string, destino: Destino, avisar: Avisar): Promise<ResultadoDaGravacao>;
    status(caminho: string, status: string, avisar: Avisar, rotulo?: string): Promise<ResultadoDaGravacao>;
    concluir(caminho: string, avisar: Avisar): Promise<ResultadoDaGravacao>;
    novaData(caminho: string, data: string, statusAberto: string, emAlgumDia: boolean, avisar: Avisar): Promise<ResultadoDaGravacao>;
    campo(caminho: string, nome: string, valor: unknown, rotulo: string, avisar: Avisar, mostrado?: string): Promise<ResultadoDaGravacao>;
    /** 🤝 Fazer agora, com os motivos dos pesos (a linha da Day diz o porquê, como o cartão do canvas). */
    fazerAgora(caminho: string, motivos?: readonly WeightReason[]): void;
    /** Roda um protocolo passo a passo com as variáveis do período (os botões do ciclo, `MissionBoard.runProtocol`). */
    protocolo?(id: string, variaveis: Record<string, string>): void;
    /**
     * A gaveta dos protocolos do ciclo (P12b): o protocolo de um botão, lido pelo motor para o
     * formulário (`missao/gavetaDoMotor.ts`). Sem ela, o botão roda passo a passo (`protocolo`).
     */
    ciclo?: GravarDoCiclo;
    /** O +1 de um hábito num dia (`MissionBoard.marcarHabito`, pelo `toggleHabit`, com o Desfazer). */
    habito?(caminho: string, dia: string, avisar: Avisar): Promise<ResultadoDaGravacao>;
    /** A 💡 Captura: a nota crua na Caixa de entrada, pela função única (`capturarNaCaixa`). */
    capturar?(texto: string): Promise<{ ok: boolean; texto: string }>;
    /** Cria a nota ou o canvas que o nó ainda não tem, pelos comandos de sempre. */
    criar?(id: string, que: 'nota' | 'canvas'): Promise<ResultadoDaGravacao>;
    /** ⌘Z: a última da pilha única do Desfazer. */
    desfazer(avisar: Avisar): Promise<ResultadoDoDesfazer>;
    /** O status, a prioridade e os contextos do catálogo, com os rótulos. */
    vocabularios(): Vocabularios;
    /** O campo que dá o nome do arquivo (edita pelo TaskNotes). */
    nomeDoArquivo?: string | null;
    /** O link existe no cofre? (a validação do campo de link). */
    existe?: (nome: string) => boolean;
    /** As gravações da triagem que não são de tarefa (a nota da Caixa, a ideia, o rascunho), P7. */
    triagem?: GravarDaTriagem;
    /** As propostas do agente na triagem (02/11/2026): aceitar grava pelas setas ou pelo Novo, com o Desfazer. */
    propostas?: { aceitar(id: string, avisar: Avisar): Promise<ResultadoDaGravacao>; recusar(id: string, avisar: Avisar): Promise<ResultadoDaGravacao> };
    /** O Novo (P8): a tarefa pelo TaskNotes e os passos dos protocolos donos (os outros tipos rodam por `protocolo`). */
    novo?: GravarDoNovo;
    /** Vários campos de uma nota numa gravação só, com um Desfazer (P9: o saldo e a data na nota da reserva). */
    campos?(caminho: string, patch: Record<string, unknown>, rotulo: string, avisar: Avisar): Promise<ResultadoDaGravacao>;
    /** "＋ O que fiz" (P9, §8.7): a função única `MissionBoard.registrarFeito`; sem Desfazer. */
    registrarFeito?(registro: RegistroDoFeito): Promise<ResultadoDaGravacao>;
    /**
     * A nota nova pelo protocolo dono (o "Criar nova" do "＋ Adicionar" de um campo, §8.9): roda o
     * protocolo com as variáveis e, quando ele termina (o mesmo protocolo e, com o passo, o mesmo
     * nome respondido), entrega a nota criada; quem pediu a liga ao campo. A rodada cancelada não
     * entrega nada, e o pedido seguinte troca o que esperava.
     */
    notaNova?(pedido: PedidoDaNotaNova, criada: (nota: { nome: string; caminho: string | null }) => void): void;
    /** A checklist da nota (29/10): marcar ou acrescentar um item, só aquela linha, com o Desfazer. */
    checklist?(caminho: string, gesto: GestoDaChecklist, avisar: Avisar): Promise<ResultadoDaGravacao>;
    /** O Arquivar do menu de status (02/11): o arquivo do TaskNotes (`sim` arquiva, `false` tira), com o Desfazer. */
    arquivar?(caminho: string, sim: boolean, avisar: Avisar, titulo?: string): Promise<ResultadoDaGravacao>;
    /** A TaskNote está no arquivo do TaskNotes? (o menu oferece "Tirar do arquivo"). */
    arquivada?(caminho: string): boolean;
    /** O Excluir do menu de status (02/11): a nota vai para a lixeira do Obsidian, nunca apaga; Desfazer quando fica na `.trash`. */
    excluir?(caminho: string, avisar: Avisar, titulo?: string): Promise<ResultadoDaGravacao>;
}

/** O pedido da nota nova: o protocolo dono, as variáveis da rodada e o passo que leva o nome (o fim confere). */
export interface PedidoDaNotaNova { protocolo: string; variaveis: Record<string, unknown>; passo: string | null; nome: string }

/** O que o lugar dá à gaveta do ciclo: o protocolo de um botão, com o apelido resolvido e as datas explícitas. */
export interface GravarDoCiclo {
    abrir(protocolo: string, datas: DatasDaRodada, doBotao: Record<string, unknown>): Promise<ProtocoloDaGaveta | null>;
}

/** O que o lugar grava pelo Novo (`board.novo`, na mesma pilha do Desfazer). */
export interface GravarDoNovo {
    /** A tarefa pela API do TaskNotes, com a herança da SMART (`smart` = o caminho dela) e o Desfazer. */
    tarefa(valores: Record<string, unknown>, smart: string | null, avisar: Avisar): Promise<ResultadoDaGravacao>;
    /** "Abrir no TaskNotes": o formulário nativo, preenchido; o `type` e a herança depois que ele salva. */
    noTaskNotes?(valores: Record<string, unknown>, smart: string | null, avisar: Avisar): Promise<ResultadoDaGravacao>;
    /** Os passos de um protocolo dono, como o JSON dele declara; `null` = não se lê. */
    passos(protocolo: string): PassoDoProtocolo[] | null;
    /** A nota simples de um tipo `via: nota` (30/10, a estadia), na pasta do modelo, com o Desfazer. */
    nota?(pedido: PedidoDaNota, avisar: Avisar): Promise<ResultadoDaGravacao>;
    /** As subpastas que uma pasta já tem (a casa no módulo, 02/11: o `NN - Funções/` que existe); sem ela, nenhuma. */
    subpastas?(pasta: string): string[];
}

/** O que o lugar grava pela triagem (`board.triagem`, na mesma pilha do Desfazer), mais a escolha da pasta. */
export interface GravarDaTriagem {
    caixa(caminho: string, destino: DestinoDaCaixa, pasta: string | null, avisar: Avisar): Promise<ResultadoDaGravacao>;
    ideia(caminho: string, destino: DestinoDaIdeia, smart: string | null, avisar: Avisar): Promise<ResultadoDaGravacao>;
    arquivarRascunho(caminho: string, avisar: Avisar): Promise<ResultadoDaGravacao>;
    retomarRascunho(caminho: string, avisar: Avisar): Promise<ResultadoDaGravacao>;
    /** A pasta de um destino que pede escolha: a de um projeto da mesa, ou um tipo de Recursos; `null` = não escolheu. */
    escolherPasta(destino: 'project' | 'resources', projetos: ReadonlyArray<{ nome: string; pasta: string }>): Promise<string | null>;
}

export interface DependenciasDaMissao {
    /** O estado de abertura (o da aba guardada, ou o que veio do "⤢"). */
    estado?: Partial<EstadoDaMissao>;
    /** As dicas dos botões, do lugar (`ui/dica.ts` no Obsidian); sem elas, só o nome (`DICAS_SO_DO_NOME`). */
    dicas?: DicasDaMissao;
    /** O relógio (`AAAA-MM-DD`): o do lugar (`hosts/relogio.ts`), ou o dos testes. */
    hoje: () => string;
    /** O instante em ms (a roda, o arrasto); só os testes trocam. */
    agora?: () => number;
    /** A hora de agora (`HH:MM`, no fuso local), para a hora marcada que já passou; só os testes trocam. */
    horaAgora?: () => string;
}

/** O que o componente devolve ao lugar (os únicos cinco gestos de fora). */
export interface MissaoMontada {
    /** Lê o modelo de novo e troca só o que mudou (o lugar chama a cada versão do cofre). */
    atualizar(): Promise<void>;
    /** O tamanho da vista mudou (o `ResizeObserver` do lugar). */
    redimensionar(): void;
    estado(): EstadoDaMissao;
    /** Leva a Missão até um nó (a linha dele, aceso, com o painel aberto). */
    focar(id: string): void;
    /** A vista ficou ativa (a aba, a página escolhida): o foco vem para a Missão, se não está num campo. */
    tomarFoco(): void;
    destruir(): void;
}

/**
 * O filtro "Onde estou": quais lugares ele mostra, em que ordem, e a dica de cada um, pelo id do
 * contexto (`chaveDoContexto`). O rótulo e o emoji vêm do vocabulário dos contextos (`TASK_CONTEXTS`).
 */
export const ONDE_DO_FILTRO = [
    ['computador', 'mostra só o que dá para fazer no computador'],
    ['celular', 'mostra só o que dá para fazer no celular'],
    ['externo', 'mostra só o que dá para fazer na rua'],
    ['campo', 'mostra só o que dá para fazer em campo'],
] as const;
const ONDE = lugaresDoOnde(ONDE_DO_FILTRO, TASK_CONTEXTS);
const ctxKey = chaveDoContexto;
const ROTULO_DA_ESCALA: Record<Escala, string> = { dia: 'Dia', semana: 'Semana', trimestre: 'Trimestre', ano: 'Ano' };

/**
 * O que faz: monta a Missão no lugar dado e devolve os cinco gestos de fora.
 * Entra → sai: o adaptador do lugar e as dependências → `MissaoMontada`.
 * Erro e ataque: o ramo ou o modelo que não se leem deixam o aviso na tela (e o motivo
 * no console); `atualizar` durante outra leitura espera a da vez.
 */
export function montarMissao(adaptador: AdaptadorDaMissao, deps: DependenciasDaMissao): MissaoMontada {
    const doc = adaptador.raiz.ownerDocument;
    const win = janela(doc);
    const hoje = deps.hoje;
    const agora = deps.agora ?? (() => Date.now());
    const horaAgora = deps.horaAgora ?? (() => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; });
    const dicas = deps.dicas ?? DICAS_SO_DO_NOME;
    const marcarDica = (el: HTMLElement, texto: string, opcoes: { tecla?: string } = {}) => dicas.marcar(el, texto, opcoes);
    /** Movimento reduzido (§9.3): todo passo, deslize e pulso vira um salto. */
    const reduzido = () => !!win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const raf = (fn: () => void) => (win.requestAnimationFrame ? win.requestAnimationFrame(fn) : win.setTimeout(fn, 16));
    const desligar: Array<() => void> = [];
    const on = (alvo: EventTarget, tipo: string, fn: (ev: any) => void, opt?: AddEventListenerOptions | boolean) => {
        alvo.addEventListener(tipo, fn as EventListener, opt);
        desligar.push(() => alvo.removeEventListener(tipo, fn as EventListener, opt));
    };

    /* ----------------------------------------------------------- o estado */
    let modelo: MissaoModelo | null = null;
    let ramoPrincipal: RamoPrincipal | null = null;
    let plano: PlanoDaGrade | null = null;
    const ini = deps.estado ?? {};
    let tela: EstadoTela = {
        escala: ini.escala && ESCALAS.includes(ini.escala) ? ini.escala : 'dia', foco: ini.foco ?? '', selecionado: ini.selecionado ?? null,
        busca: '', abrirTudo: !!ini.abrirTudo, compacto: false, linhagem: true, seguir: true,
    };
    let aberto: string | null = ini.aberto ?? null;
    /** O menu de status aberto no painel (02/11): o nó e se está na confirmação do Excluir; `null` = fechado. */
    let menuStatus: { id: string; modo: 'aberto' | 'confirmar' } | null = null;
    /** O expandido e o recolhido de cada vista do ramo (30/10), guardado no estado da vista. */
    let expansao: Record<string, Record<string, boolean>> = JSON.parse(JSON.stringify(ini.expansao ?? {}));
    /**
     * O terceiro eixo (a pinça, 29/10): o nível do panorama e a pilha dos zooms no ramo. Um dono só:
     * a pinça do trackpad, a do toque, o ⌘ com a roda e o `+`/`−` passam por `passoDaNavegacao`, e a
     * escala da tela segue o nível (`comNivel`); trocar a escala por outro caminho (os botões, o
     * caminho do período, ir até um nó) começa a navegação de novo nela.
     */
    let nav: NivelDaNavegacao = navegacaoInicial(tela.escala);
    /** O passo horizontal na vista do ramo: o item da vez e quantos itens do nível atual se mostram. */
    let cursorDoRamo: CursorDoRamo = CURSOR_INICIAL;
    /** O instante do último nível da pinça do toque: o clique que chega logo depois não abre o painel. */
    let ultimaPinca = -Infinity;
    /** Os painéis de onde se veio, navegando pelas conexões (P10c); a volta tira o último. */
    let trilha: PassoDaTrilha[] = [];
    /** A nota que o "Criar a nota" de um vínculo sem nota pediu (P10c): quando ela chega, o painel dela abre. */
    let esperandoNota: { id: string; nome: string } | null = null;
    /** O ramo escolhido (P10b); `null` = o do lugar. */
    let ramoId: string | null = typeof ini.ramoPrincipal === 'string' && ini.ramoPrincipal ? ini.ramoPrincipal : null;
    /** Os ramos que se escolhem (lidos ao montar, para o seletor sempre à vista, G7). */
    let ramosParaEscolher: RamoParaEscolher[] = [];
    /** O ramo de onde se veio pela última troca (a trilha dos ramos, G7); `null` = o de partida. */
    let origemDoRamo: RamoParaEscolher | null = null;
    /** A ligação escolhida (um clique na curva): Delete ou × desliga (P6). */
    let ligacaoEscolhida: { de: string; para: string; tipo: Ligacao['tipo']; row: string } | null = null;
    /** O painel tem um campo em edição: a versão nova do cofre espera o campo sair. */
    let painelPendente = false;
    let onde: string | null = ini.onde ?? null;
    let hover: string | null = null;
    // O cartão do ramo sob o mouse ou com o foco (a chave do cartão, `data-cartao`): o mesmo realce do mapa.
    let hoverDoRamo: string | null = null;
    let panY: number | null = null;
    let centrado = false;
    let pular = true;
    let snapCentro = true;
    let pane = 'centro';
    let destruido = false;
    let lendo: Promise<void> | null = null;
    let lidoAs = '';
    /** A tela da triagem: `null` = fechada. */
    let triagem: EstadoDaTriagem | null = null;
    /** O formulário aberto no item da triagem (a tecla que pede escolha). */
    let triForm: FormDaTriagem | null = null;
    /** A triagem tem um campo em edição: a versão nova do cofre espera ele sair. */
    let triPendente = false;
    /** O Novo aberto na gaveta (P8): `null` = fechado. */
    let novo: EstadoDoNovo | null = null;
    /** O Novo fechado com respostas: volta no próximo "+ Novo", até fechar a vista (§5.6). */
    let rascunhoDoNovo: EstadoDoNovo | null = null;
    /** O Novo tem um campo em edição: a versão nova do cofre espera ele sair. */
    let novoPendente = false;
    /** O que faz: o rascunho que um Novo deixa (o que se escreveu); o "＋ Adicionar" de um campo não deixa rascunho. */
    const rascunhoDe = (n: EstadoDoNovo): EstadoDoNovo | null => (!n.campo && Object.keys(n.digitadas).length ? { ...n, problemas: {} } : null);
    /** A gaveta do ciclo aberta (P12b): `null` = fechada. */
    let gaveta: EstadoDaGaveta | null = null;
    /** O que se escreveu na gaveta de cada botão, por período: volta no mesmo botão até fechar a vista (§5.6). */
    const rascunhosDaGaveta = new Map<string, { digitadas: Record<string, unknown>; criar: CriacoesPedidas; restoAberto: boolean }>();
    /** A gaveta tem um campo em edição: a versão nova do cofre espera ele sair. */
    let gavetaPendente = false;
    const linhaEls = new Map<string, { el: HTMLElement; sig: string }>();

    /* ----------------------------------------------------------- o esqueleto */
    const root = el(doc, 'div', 'dfm-missao', { tabindex: '-1', 'data-lugar': adaptador.lugar, 'data-forma': 'borboleta' });
    adaptador.raiz.appendChild(root);
    const app = root.appendChild(el(doc, 'div', 'app'));
    const hdr = app.appendChild(el(doc, 'header', 'hdr'));
    const brand = hdr.appendChild(el(doc, 'div', 'brand'));
    const titulo = brand.appendChild(el(doc, 'h1', null, null, 'Missão'));
    // G7, porta 2: a trilha dos ramos ("Missão › Viagem › Vietnam"), ao lado do seletor no título.
    const trilhaDosRamos = brand.appendChild(el(doc, 'nav', 'ramo-trilha chain', { 'aria-label': 'Ramos', hidden: true }));
    const crumbs = brand.appendChild(el(doc, 'nav', 'crumbs', { 'aria-label': 'Período em foco' }));
    // O longo prazo (a expansão depois do Ano): a marca diz onde se está, sem uma vista própria.
    const nivelChip = brand.appendChild(el(doc, 'span', 'nivel-chip', { hidden: true }));
    const perbtn = brand.appendChild(botao(doc, 'perbtn', null, { 'data-act': 'periodo', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' }));
    const perTxt = perbtn.appendChild(el(doc, 'span', 'per-txt'));
    perbtn.appendChild(el(doc, 'span', null, { 'aria-hidden': 'true' }, '▾'));
    const tools = hdr.appendChild(el(doc, 'div', 'tools'));
    const segEscala = (parent: HTMLElement) => {
        const seg = parent.appendChild(el(doc, 'div', 'seg', { role: 'group', 'aria-label': 'Escala' }));
        for (const e of ESCALAS) seg.appendChild(botao(doc, null, ROTULO_DA_ESCALA[e], { 'data-scale': e, 'aria-pressed': 'false' }));
        return seg;
    };
    segEscala(tools);
    const bHoje = tools.appendChild(botao(doc, 'btn today b-hoje', 'Hoje ', { 'data-act': 'today' }));
    bHoje.appendChild(el(doc, 'span', 'k', null, 'H'));
    marcarDica(bHoje, 'Hoje: volta ao período de hoje', { tecla: 'H' });
    const bTudo = tools.appendChild(botao(doc, 'btn b-tudo', 'Abrir tudo ', { 'data-act': 'tudo', 'aria-pressed': 'false' }));
    bTudo.appendChild(el(doc, 'span', 'k', null, 'E'));
    marcarDica(bTudo, 'Abrir tudo: abre todas as linhas da linha do tempo', { tecla: 'E' });
    const bBusca = tools.appendChild(botao(doc, 'btn b-busca', null, { 'data-act': 'search' }));
    bBusca.appendChild(el(doc, 'span', 'lbl', null, 'Buscar'));
    bBusca.append(' ');
    bBusca.appendChild(el(doc, 'span', 'k', null, '/'));
    bBusca.appendChild(lupa(doc));
    marcarDica(bBusca, 'Buscar projeto, SMART, tarefa ou data', { tecla: '/' });
    const here = tools.appendChild(el(doc, 'div', 'seg here', { role: 'group', 'aria-label': 'Onde estou' }));
    here.appendChild(el(doc, 'span', 'here-l', null, 'Onde estou'));
    for (const [v, nome, txt] of ONDE) {
        const b = here.appendChild(botao(doc, null, v.split(' ')[0], { 'data-here': v, 'aria-pressed': 'false' }));
        marcarDica(b, `Onde estou: ${nome} — ${txt}`);
    }
    const bTri = tools.appendChild(botao(doc, 'btn b-tri', 'Triagem ', { 'data-act': 'triagem', 'aria-pressed': 'false', 'aria-controls': 'tri' }));
    const triN = bTri.appendChild(el(doc, 'span', 'tri-n mono'));
    bTri.appendChild(el(doc, 'span', 'k', null, 'T'));
    marcarDica(bTri, 'Triagem: o que ainda não tem lugar, um por vez, com as teclas à vista', { tecla: 'T' });
    const bNovo = tools.appendChild(botao(doc, 'btn b-novo', '+ Novo', { 'data-act': 'novo', 'aria-haspopup': 'dialog', hidden: true }));
    const bCaptura = tools.appendChild(botao(doc, 'btn b-captura', '💡 Captura', { 'data-act': 'captura', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', hidden: true }));
    marcarDica(bCaptura, '💡 Captura rápida: anota uma ideia na Caixa de entrada, sem data; a triagem decide depois');
    const bLegenda = tools.appendChild(botao(doc, 'btn b-legenda', 'Legenda', { 'data-act': 'legenda', 'aria-expanded': 'false' }));
    marcarDica(bLegenda, 'Legenda: cores, estados, gestos e teclas');
    const bMais = tools.appendChild(botao(doc, 'btn b-mais', '⋯', { 'data-act': 'mais', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' }));
    marcarDica(bMais, 'Mais: abrir tudo, legenda e onde estou');
    if (adaptador.abrirEmOutraAba) {
        const bAba = tools.appendChild(botao(doc, 'btn b-aba', '⤢', { 'data-act': 'aba' }));
        marcarDica(bAba, '⤢ Abrir em outra aba: a Missão numa aba própria, no mesmo período e no mesmo nó');
    }
    const status = hdr.appendChild(el(doc, 'div', 'proto'));

    // O corpo: a tela da triagem (P7) de um lado e a linha do tempo do outro, como alvo (8.6).
    const corpo = app.appendChild(el(doc, 'div', 'corpo'));
    const tri = corpo.appendChild(el(doc, 'aside', 'tri', { hidden: true, id: 'tri', role: 'region', 'aria-label': 'Triagem', tabindex: '-1' }));
    const mapwrap = corpo.appendChild(el(doc, 'div', 'mapwrap'));
    const mapbar = mapwrap.appendChild(el(doc, 'div', 'mapbar'));
    const pchip = mapbar.appendChild(botao(doc, 'pchip', null, { 'data-act': 'place-chip' }));
    const map = mapwrap.appendChild(el(doc, 'main', 'map sc-dia'));
    const panes = map.appendChild(el(doc, 'div', 'panes'));
    const snaps = panes.appendChild(el(doc, 'div', 'grid snaps', { 'aria-hidden': 'true' }));
    const cols = panes.appendChild(el(doc, 'div', 'grid cols', { 'aria-hidden': 'true' }));
    const vp = panes.appendChild(el(doc, 'div', 'vp'));
    const track = vp.appendChild(el(doc, 'div', 'track'));
    // A vista do ramo (o zoom da pinça num nó): no lugar do mapa enquanto há zoom na pilha.
    const ramoVista = mapwrap.appendChild(el(doc, 'div', 'ramo-vista', { hidden: true }));
    // O sistema inteiro no tempo (o nível Sistema da expansão, 30/10), no lugar do mapa nesse nível.
    const sistemaVista = mapwrap.appendChild(el(doc, 'div', 'sistema-vista', { hidden: true }));
    // O véu da pinça: a cópia da vista que sai, por cima, enquanto ela cresce ou encolhe e some (só na transição).
    const veu = mapwrap.appendChild(el(doc, 'div', 'pinca-veu', { hidden: true, 'aria-hidden': 'true' }));
    mapwrap.appendChild(el(doc, 'span', 'hfade hf-l', { 'aria-hidden': 'true' }));
    mapwrap.appendChild(el(doc, 'span', 'hfade hf-r', { 'aria-hidden': 'true' }));
    const pind = mapwrap.appendChild(el(doc, 'nav', 'pind', { 'aria-label': 'Painéis do mapa', hidden: true }));
    const bbar = app.appendChild(el(doc, 'nav', 'bbar', { 'aria-label': 'Escala e hoje' }));
    segEscala(bbar);
    const bHoje2 = bbar.appendChild(botao(doc, 'btn today', 'Hoje', { 'data-act': 'today' }));
    marcarDica(bHoje2, 'Hoje: volta ao período de hoje e ao Centro', { tecla: 'H' });

    const scrim = root.appendChild(el(doc, 'div', 'scrim', { hidden: true }));
    const drawer = root.appendChild(el(doc, 'aside', 'drawer', { hidden: true, role: 'dialog', 'aria-label': 'Painel do nó', tabindex: '-1' }));
    const grab = drawer.appendChild(botao(doc, 'grab', null, { 'data-grab': 'drawer' }));
    marcarDica(grab, 'Alça da folha: toque alterna meia altura e tela cheia; arraste para baixo para fechar');
    const dbody = drawer.appendChild(el(doc, 'div', 'dbody'));
    const search = root.appendChild(el(doc, 'div', 'pop search', { hidden: true, role: 'dialog', 'aria-label': 'Buscar' }));
    const q = search.appendChild(el(doc, 'input', 'q', { type: 'search', placeholder: 'Projeto, SMART, tarefa, 29/10, W45, Q4…', autocomplete: 'off', 'aria-label': 'Buscar' }));
    const results = search.appendChild(el(doc, 'div', 'results', { role: 'listbox', 'aria-label': 'Resultados' }));
    const capPop = root.appendChild(el(doc, 'div', 'pop captura', { hidden: true, role: 'dialog', 'aria-label': '💡 Captura rápida' }));
    capPop.appendChild(el(doc, 'p', 'hint', null, 'Vai para a Caixa de entrada, sem data; a triagem decide depois.'));
    const capRow = capPop.appendChild(el(doc, 'div', 'cap-row'));
    const capIn = capRow.appendChild(el(doc, 'input', null, { type: 'text', placeholder: 'O que apareceu agora?', autocomplete: 'off', 'aria-label': 'Título da captura', 'data-captura': '' }));
    const capOk = capRow.appendChild(botao(doc, 'btn primary', 'Capturar', { 'data-act': 'captura-ok' }));
    marcarDica(capOk, 'Capturar: cria a nota na Caixa de entrada', { tecla: 'Enter' });
    const legend = root.appendChild(el(doc, 'div', 'pop legend', { hidden: true, role: 'dialog', 'aria-label': 'Legenda' }));
    const menu = root.appendChild(el(doc, 'div', 'pop menu', { hidden: true, role: 'dialog', 'aria-label': 'Mais' }));
    const popRamos = root.appendChild(el(doc, 'div', 'pop ramos', { hidden: true, role: 'dialog', 'aria-label': 'Ramos' }));
    const perpick = root.appendChild(el(doc, 'div', 'pop perpick', { hidden: true, role: 'dialog', 'aria-label': 'Escolher o período' }));
    const ppCrumbs = perpick.appendChild(el(doc, 'nav', 'crumbs', { 'aria-label': 'Período em foco' }));
    const ppActs = perpick.appendChild(el(doc, 'div', 'pp-acts'));
    marcarDica(ppActs.appendChild(botao(doc, 'btn today', 'Hoje', { 'data-act': 'today' })), 'Hoje: volta ao período de hoje', { tecla: 'H' });
    marcarDica(ppActs.appendChild(botao(doc, 'btn', '🔍 Buscar data, semana…', { 'data-act': 'search' })), 'Buscar uma data, uma semana, um projeto ou uma tarefa', { tecla: '/' });
    const toastEl = root.appendChild(el(doc, 'div', 'toast', { hidden: true, role: 'status', 'aria-live': 'polite' }));
    const toastMsg = toastEl.appendChild(el(doc, 'span', 'toast-msg'));
    const toastUndo = toastEl.appendChild(botao(doc, 'toast-undo', 'Desfazer', { 'data-act': 'desfazer-aviso', hidden: true }));
    marcarDica(toastUndo, 'Desfazer esta gravação', { tecla: '⌘Z' });
    const dropTip = root.appendChild(el(doc, 'div', 'droptip', { hidden: true, 'aria-hidden': 'true' }));
    const linkLine = root.appendChild(svg(doc, 'svg', { class: 'linkline', 'aria-hidden': 'true' }) as unknown as HTMLElement);
    linkLine.style.display = 'none';
    const linkPath = linkLine.appendChild(svg(doc, 'path', {}) as unknown as HTMLElement);
    desligar.push(dicas.ligar(root));
    /**
     * As curvas de toda vista têm um dono só (view/ligacoes.ts): o agendador mede de novo quando o
     * tamanho de um conteúdo ou de um cartão muda, quando uma animação acaba e quando o casco pede;
     * desenha todas as superfícies à vista (as linhas abertas do mapa e o mapa do ramo) e acende a
     * linhagem depois. Nenhum outro caminho desenha curva.
     */
    const curvas = ligarCurvas(win, mapwrap, () => superficiesDasCurvas(), () => acender());
    desligar.push(() => curvas.desligar());

    const camposDaNota = (caminho: string) => { try { return adaptador.camposDaNota?.(caminho) ?? null; } catch (e) { return null; } };
    /**
     * O texto das notas que o painel leu (a checklist da tarefa, 29/10): a borda lê sem pressa
     * (`cachedRead`), e o painel se pinta de novo quando o texto chega; a versão nova do cofre limpa.
     */
    const textos = new Map<string, string | null>();
    const lendoTexto = new Set<string>();
    /** As notas que o Novo pediu (a fonte `checklist`, 30/10): quando o texto chega, o Novo refaz as sugestões. */
    const pedidasPeloNovo = new Set<string>();
    const textoDaNota = (caminho: string): string | null => {
        if (textos.has(caminho)) return textos.get(caminho) ?? null;
        if (!adaptador.textoDaNota || lendoTexto.has(caminho)) return null;
        lendoTexto.add(caminho);
        void adaptador.textoDaNota(caminho)
            .then(t => { textos.set(caminho, typeof t === 'string' ? t : null); }, () => { textos.set(caminho, null); })
            .then(() => {
                lendoTexto.delete(caminho);
                if (!destruido && aberto) pintarPainel(false);
                if (!destruido && nav.pilha.length) agendarRamo();
                // O Novo aberto (a checklist de uma nota de função, 30/10): as sugestões refazem com o texto que chegou.
                if (pedidasPeloNovo.delete(caminho) && !destruido && novo) pintarNovo(false);
            });
        return null;
    };
    /** O que a seção Protocolos leu de cada nota (a peça 2b): lido sem pressa, pintado quando chega; a versão nova limpa. */
    const lidosDosProtocolos = new Map<string, LidoDosProtocolos | null>();
    const lendoOsProtocolos = new Set<string>();
    const lidoDosProtocolos = (caminho: string): LidoDosProtocolos | null => {
        if (lidosDosProtocolos.has(caminho)) return lidosDosProtocolos.get(caminho) ?? null;
        if (!adaptador.protocolosDaNota || lendoOsProtocolos.has(caminho)) return null;
        lendoOsProtocolos.add(caminho);
        void adaptador.protocolosDaNota(caminho)
            .then(l => { lidosDosProtocolos.set(caminho, l ?? null); }, () => { lidosDosProtocolos.set(caminho, { campos: {}, rodaram: {}, escolha: null }); })
            .then(() => { lendoOsProtocolos.delete(caminho); if (!destruido && aberto) pintarPainel(false); });
        return null;
    };
    /**
     * A reputação que o painel leu de cada nota (o acabamento, 30/10): lida sem pressa e pintada quando
     * chega, só se a nota tem reputação; enquanto lê, nada aparece; a versão nova do cofre limpa.
     */
    const reputacoes = new Map<string, ReputacaoDoNo | null>();
    const lendoReputacao = new Set<string>();
    const reputacaoDoNoAgora = (id: string): ReputacaoDoNo | null => {
        const nota = modelo?.arquivos(id).nota;
        if (!nota || !adaptador.reputacaoDaNota) return null;
        if (reputacoes.has(nota)) return reputacoes.get(nota) ?? null;
        if (lendoReputacao.has(nota)) return null;
        lendoReputacao.add(nota);
        void adaptador.reputacaoDaNota(nota)
            .then(r => { reputacoes.set(nota, r ?? null); }, () => { reputacoes.set(nota, null); })
            .then(() => { lendoReputacao.delete(nota); if (!destruido && aberto && reputacoes.get(nota)) pintarPainel(false); });
        return null;
    };
    /** O que faz: os protocolos de um nó, pelo modelo e pelo que a borda leu; `null` = ainda lendo. */
    const protocolosDoNoAgora = (id: string): ProtocoloDoNo[] | null => {
        const nota = modelo?.arquivos(id).nota;
        if (!modelo || !nota) return [];
        const lido = adaptador.protocolosDaNota ? lidoDosProtocolos(nota) : { campos: {}, rodaram: {}, escolha: null };
        return lido ? modelo.protocolosDoNo(id, lido, camposDaNota) : null;
    };
    const vocabularios = (): Vocabularios | undefined => { try { return adaptador.gravar?.vocabularios() ?? adaptador.vocabularios?.(); } catch (e) { return undefined; } };
    /** O protocolo do papel pelo lugar (`protocoloDoPapel`); sem a leitura, a dos padrões da v0. */
    const idDoPapel = (papel: Papel): string | null => {
        if (!adaptador.protocoloDoPapel) return DEFINICOES_PADRAO.protocolos_por_papel[papel];
        try { return adaptador.protocoloDoPapel(papel); } catch (e) { return null; }
    };
    /**
     * O 🗂️ destino da ideia é oferecido (as teclas, os botões e o arrasto da ideia)? Só com o protocolo
     * do papel; o lugar que não diz o protocolo do papel oferece, como o 🤝 (D1 do mapa da v0: sem
     * protocolo, some, sem aviso).
     */
    const ofereceDestinoDaIdeia = (): boolean => !adaptador.protocoloDoPapel || idDoPapel(PAPEL_DA_IDEIA) !== null;
    const contexto = (): Contexto => ({
        doc, modelo: modelo!, ramoPrincipal: ramoPrincipal!, escala: tela.escala, marcar: (e, t, k) => { marcarDica(e, t, k ? { tecla: k } : {}); }, camposDaNota,
        gravar: podeGravar(), vocabularios: vocabularios(), nomeDoArquivo: adaptador.gravar?.nomeDoArquivo ?? null, adicionar: podeGravar(),
        ciclos: (e, k) => (podeGravar() && (adaptador.gravar?.protocolo || adaptador.gravar?.ciclo) && ramoPrincipal && modelo ? ciclosDoPeriodo(ramoPrincipal, e, k, modelo.hoje, adaptador.protocoloExiste) : []),
        criar: podeGravar() && !!adaptador.gravar?.criar,
        rodaProtocolo: podeGravar() && !!adaptador.gravar?.protocolo,
        arrastar: podeArrastar(),
        nomeDoProtocolo: id => { try { return adaptador.nomeDoProtocolo?.(id) ?? null; } catch (e) { return null; } },
        protocoloDoPapel: idDoPapel,
        // O que se cria a partir de um nó, num lugar só (29/10): o do ramo e os filhos do tipo pelos modelos.
        novos: podeCriar() ? (id: string) => (ramoPrincipal && modelo ? novosDoNo(ramoPrincipal, tiposAgora(), id, { dominio: modelo.dominioDoNo(id, { camposDaNota }), nome: nomeParaOLink(modelo, id), modelos: modelo.indice.tabelas.tipos ?? [] }) : []) : undefined,
        candidatos: campo => candidatosDoNovo(campo),
        ligacoesDaNota: caminho => { try { return adaptador.ligacoesDaNota?.(caminho) ?? null; } catch (e) { return null; } },
        novoDoType: podeCriar() ? (type: string) => { const t = tiposAgora().find(x => x.type === type); return t ? { dominio: t.dominio, titulo: t.titulo } : null; } : undefined,
        resolverLink: (nome, de) => { try { return adaptador.resolverLink?.(nome, de) ?? null; } catch (e) { return null; } },
        verNoRamo: id => verNoRamo(id),
        textoDaNota: adaptador.textoDaNota ? caminho => textoDaNota(caminho) : undefined,
        lendoTexto: caminho => lendoTexto.has(caminho),
        protocolosDoNo: id => protocolosDoNoAgora(id),
        lendoProtocolos: id => { const n = modelo?.arquivos(id).nota; return !!n && lendoOsProtocolos.has(n); },
        reputacaoDoNo: adaptador.reputacaoDaNota ? id => reputacaoDoNoAgora(id) : undefined,
        checklist: podeGravar() && !!adaptador.gravar?.checklist,
        // O expandir e o recolher do mapa principal (02/11): o mesmo estado da vista, pela chave do mapa.
        expansaoDaLinha: (ligacoes, fixo) => expansaoNoMapa(ligacoes, expansao[EXPANSAO_DO_MAPA] ?? {}, fixo),
        relogio: () => ({ dia: hoje(), hora: horaAgora() }),
        // O menu de status (02/11): o estado do menu no painel e o que o lugar sabe fazer (arquivar, a lixeira).
        menuDoStatus: id => (menuStatus && menuStatus.id === id && aberto === id ? menuStatus.modo : null),
        arquivar: podeGravar() && !!adaptador.gravar?.arquivar,
        arquivada: caminho => { try { return !!adaptador.gravar?.arquivada?.(caminho); } catch (e) { return false; } },
        excluir: podeGravar() && !!adaptador.gravar?.excluir,
    });
    const estado = (): EstadoDaMissao => ({ escala: tela.escala, foco: tela.foco, selecionado: tela.selecionado, abrirTudo: tela.abrirTudo, aberto, onde, ramoPrincipal: ramoId, ...(Object.keys(expansao).length ? { expansao: JSON.parse(JSON.stringify(expansao)) } : {}) });
    const avisar = () => adaptador.aoMudar?.(estado());
    const largura = () => root.clientWidth;
    const ehCelular = () => largura() > 0 && largura() <= 520;
    const ehFolha = () => largura() > 0 && largura() <= 720;
    /**
     * Grava aqui: o lugar deu as gravações. Só leitura é só o celular de verdade (o lugar não dá
     * as gravações lá, `Platform.isMobile`); a vista estreita no computador (a aba na barra
     * lateral) grava pelos menus e pelas teclas.
     */
    const podeGravar = () => !!adaptador.gravar;
    /** O arrasto fica no computador e com espaço: abaixo de 520 px, só os menus e as teclas. */
    const podeArrastar = () => podeGravar() && !ehCelular();
    /** Os tipos do Novo agora (o ramo e os modelos do tipo); vazio sem ramo ou sem modelo. */
    const tiposAgora = (): TipoDoNovo[] => (ramoPrincipal && modelo ? tiposDoNovo(ramoPrincipal, modelo.indice.tabelas.tipos ?? []) : []);
    /** Cria aqui: o lugar grava, dá o Novo, e o ramo declara algum tipo (no celular, não). */
    const podeCriar = () => podeGravar() && !!adaptador.gravar?.novo && tiposAgora().length > 0;
    let arrastavaAoPintar = false;
    const motivoDaLeitura = () => adaptador.somenteLeitura || 'nada aqui grava no cofre';

    /* ----------------------------------------------------------- avisos */
    let toastTimer: any = null;
    let toastDesfazer: (() => void) | null = null;
    /** O aviso fica enquanto o mouse ou o foco está nele (dá tempo de chegar ao Desfazer). */
    let toastParado = false;
    const esconderAviso = () => { if (toastParado) return; toastEl.hidden = true; toastDesfazer = null; };
    const contarAviso = (ms: number) => { win.clearTimeout(toastTimer); if (!toastParado) toastTimer = win.setTimeout(esconderAviso, ms); };
    const toast = (msg: string, desfazer?: () => void) => {
        toastMsg.textContent = msg;
        toastDesfazer = desfazer ?? null;
        toastUndo.hidden = !desfazer;
        toastEl.hidden = false;
        contarAviso(desfazer ? 9000 : 5000);
    };
    /** O aviso das gravações: o toast da Missão, com "Desfazer" quando há o que desfazer. */
    const aviso: Avisar = (texto, desfazer) => toast(texto, desfazer);

    /* ----------------------------------------------------------- a leitura */
    async function carregar(): Promise<void> {
        if (lendo) return lendo;
        lendo = (async () => {
            try {
                // O ramo primeiro: o modelo dele leva as coleções e o recorte que ele declara (P10b).
                let l: RamoPrincipal;
                try { l = await adaptador.ramoPrincipal(ramoId); } catch (e) {
                    if (!ramoId) throw e;
                    console.warn(`DFM Missão: o ramo ${ramoId} não se leu; volta o do lugar`, e);
                    ramoId = null;
                    l = await adaptador.ramoPrincipal(null);
                }
                const m = await adaptador.modelo(l);
                if (destruido) return;
                // O ramo guardado com o id antigo (03/11: o Roteiros virou Criação) abre o novo, e o estado passa a guardar o novo.
                const renomeado = !!ramoId && ramoId !== l.id && l.antes.includes(ramoId);
                if (renomeado) ramoId = l.id;
                ramoPrincipal = l;
                modelo = m;
                // A versão nova do cofre: o texto das notas se lê de novo (a checklist do painel).
                textos.clear();
                lidosDosProtocolos.clear();
                reputacoes.clear();
                ramos.clear();
                echs.clear();
                const d = new Date();
                lidoAs = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                pintar();
                if (renomeado) avisar();
                seguirNotaCriada();
                // A nota criada pelo "＋ Adicionar" que esperava o modelo (o pai que é nó) entra agora.
                ligarCriada();
                // A versão nova do cofre: a gaveta relê o protocolo (as tarefas que os campos listam, as sugestões).
                if (gaveta?.p) carregarGaveta(false);
            } catch (e) {
                console.error('DFM Missão: a leitura falhou', e);
                if (!modelo) {
                    track.replaceChildren(el(doc, 'p', 'empty aviso', null, `A Missão não se leu: ${(e as Error)?.message ?? e}`));
                }
            } finally {
                lendo = null;
            }
        })();
        return lendo;
    }

    /* ----------------------------------------------------------- o desenho */
    function chavesDaEscala(): string[] {
        return modelo ? modelo.chaves(tela.escala) : [];
    }

    function focoValido(chaves: string[]): string {
        if (chaves.includes(tela.foco)) return tela.foco;
        const h = chaveDeHoje(tela.escala, modelo?.hoje ?? hoje());
        return chaves.includes(h) ? h : chaves[0] ?? h;
    }

    /** O que faz: desenha o que o estado de tela pede, trocando só o que mudou. */
    function pintar(): void {
        if (!modelo || !ramoPrincipal || destruido) return;
        // A escala mudou por outro caminho (a busca, ir até um nó): a navegação começa nela.
        if (escalaDaTela(nav.nivel) !== tela.escala) nav = navegacaoInicial(tela.escala);
        const escala = tela.escala;
        plano = planoDaGrade(ramoPrincipal, escala);
        pintarSeletor();
        const chaves = chavesDaEscala();
        tela = { ...tela, foco: focoValido(chaves) };
        map.className = `map sc-${escala}`;
        map.style.setProperty('--cols-largo', plano.largo);
        map.style.setProperty('--cols-cel', plano.celular);
        map.style.setProperty('--n', String(plano.n));
        map.style.setProperty('--minimo', `${plano.minimo}px`);
        for (const b of Array.from(root.querySelectorAll('[data-scale]'))) b.setAttribute('aria-pressed', String(b.getAttribute('data-scale') === escala));
        bTudo.setAttribute('aria-pressed', String(tela.abrirTudo));
        bCaptura.hidden = !(podeGravar() && adaptador.gravar?.capturar);
        bNovo.hidden = !podeCriar();
        if (!bNovo.hidden) marcarDica(bNovo, `+ Novo: ${tiposAgora().map(t => t.rotulo).join(', ')}, pelos campos do modelo de cada tipo`);
        if (bCaptura.hidden) capPop.hidden = true;
        pintarColunas();
        pintarLinhas(chaves);
        pintarTrilha();
        pintarMolduraDoCelular();
        const st = el(doc, 'span');
        arrastavaAoPintar = podeArrastar();
        if (podeGravar()) {
            st.appendChild(el(doc, 'b', null, null, 'Grava no cofre'));
            st.append(` · ${arrastavaAoPintar ? 'arraste, ligue e edite' : 'edite pelo painel e pelas teclas'} · ⌘Z desfaz · lida às ${lidoAs}`);
        } else {
            st.appendChild(el(doc, 'b', null, null, 'Só leitura'));
            st.append(` · ${motivoDaLeitura()} · lida às ${lidoAs}`);
        }
        status.replaceChildren(st);
        if (aberto) pintarPainel(false);
        if (novo) pintarNovo(false, true);
        if (gaveta) pintarGaveta(false, true);
        pintarTriagem();
        pintarProfundidade();
        // Centrar aqui, logo depois do DOM: a medida sai do quadro de animação, e o passo só anima o `transform`.
        if (vp.clientHeight > 0) { centralizar(); centradoNaPintura = true; } else centradoNaPintura = false;
        pulsarSeVisivel();
        depoisDoLayout();
        avisar();
    }

    function pintarColunas(): void {
        if (!plano) return;
        cols.replaceChildren();
        snaps.replaceChildren();
        for (const c of plano.colunas) {
            const s = el(doc, 'span', `k-${c.papel}${c.papel === 'trabalho' ? ' wing-l' : ''}${c.papel === 'centro' ? ' ctr' : ''}`, { 'data-col': c.id });
            s.style.setProperty('--cl', String(c.largo));
            if (c.papel === 'trabalho') { s.appendChild(el(doc, 'span', 'arrow', null, '←')); s.append(` ${c.rotulo}`); }
            else if (c.papel === 'tempo') { s.append(`${c.rotulo} `); s.appendChild(el(doc, 'span', 'arrow', null, '→')); }
            else s.append(c.rotulo);
            cols.appendChild(s);
        }
        for (const p of plano.paineis) {
            if (p.largo) {
                const m = el(doc, 'i', 'sn sn-largo', { 'data-pane': p.id });
                m.style.gridColumn = `${p.largo.de} / ${p.largo.ate}`;
                m.style.setProperty('scroll-snap-align', p.largo.alinhar);
                snaps.appendChild(m);
            }
            if (p.celular) {
                const m = el(doc, 'i', 'sn sn-cel', { 'data-pane': p.id });
                m.style.gridColumn = `${p.celular.de} / ${p.celular.ate}`;
                snaps.appendChild(m);
            }
        }
    }

    function janelaDeLinhas(chaves: string[]): string[] {
        const i = Math.max(0, chaves.indexOf(tela.foco));
        return chaves.slice(Math.max(0, i - LINHAS_DE_CADA_LADO), i + LINHAS_DE_CADA_LADO + 1);
    }

    /**
     * O que faz: as linhas da janela em volta do foco: as que não mudaram ficam (o mesmo
     * elemento), as que mudaram trocam no lugar, as de fora saem.
     */
    function pintarLinhas(chaves: string[]): void {
        if (!modelo || !plano) return;
        const ctx = contexto();
        const escala = tela.escala;
        const keys = janelaDeLinhas(chaves);
        const ativo = doc.activeElement as HTMLElement | null;
        const ativoNo = ativo && track.contains(ativo) ? ativo.getAttribute('data-node') : null;
        const vistas = new Set<string>();
        let antes: Element | null = null;
        for (const k of keys) {
            const chave = `${escala}|${k}`;
            vistas.add(chave);
            const aberta = linhaAberta(tela, k);
            const foco = k === tela.foco;
            const dado = aberta ? modelo.linha(escala, k) : modelo.linhaFechada(escala, k);
            const sig = `${aberta ? 'A' : 'F'}|${foco}|${plano.largo}|${ctx.gravar ? 'G' : 'L'}${ctx.arrastar ? 'D' : ''}${ctx.novos ? 'N' : ''}|${aberta ? JSON.stringify(expansao[EXPANSAO_DO_MAPA] ?? {}) : ''}|${JSON.stringify(dado)}`;
            let item = linhaEls.get(chave);
            if (!item || item.sig !== sig) {
                const novo = aberta ? linhaAbertaEl(ctx, dado as LinhaAberta, plano, foco) : linhaFechadaEl(ctx, dado as any, plano);
                if (item) item.el.replaceWith(novo);
                item = { el: novo, sig };
                linhaEls.set(chave, item);
            }
            const esperado: Element | null = antes ? antes.nextElementSibling : track.firstElementChild;
            if (esperado !== item.el) track.insertBefore(item.el, esperado);
            antes = item.el;
        }
        for (const [chave, item] of [...linhaEls]) if (!vistas.has(chave)) { item.el.remove(); linhaEls.delete(chave); }
        if (ativoNo && !(ativo && ativo.isConnected)) (track.querySelector(`[data-node="${cssEsc(ativoNo)}"]`) as HTMLElement | null)?.focus();
    }

    const cssEsc = (s: string) => s.replace(/["\\]/g, '\\$&');

    function pintarTrilha(): void {
        if (!modelo) return;
        const escala = tela.escala, k = tela.foco;
        const partes: Array<[Escala, string, string, boolean]> = [];
        let dia: string | null = null, semana: string | null = null, trim: string | null = null, ano: string | null = null;
        if (!isChaveEspecial(k)) {
            if (escala === 'dia') { dia = k; semana = chaveDeHoje('semana', k); trim = quarterOfWeek(semana); }
            else if (escala === 'semana') { semana = k; trim = quarterOfWeek(k); }
            else if (escala === 'trimestre') trim = k;
            else ano = k;
            ano = ano ?? (trim ? trim.slice(0, 4) : k.slice(0, 4));
        }
        if (ano) partes.push(['ano', ano, ano, escala === 'ano']);
        if (trim) partes.push(['trimestre', trim, trim.slice(5), escala === 'trimestre']);
        if (semana) partes.push(['semana', semana, semanaCurta(semana), escala === 'semana']);
        if (dia) partes.push(['dia', dia, `${diaDaSemana(dia)} ${Number(dia.slice(8))}`, true]);
        if (isChaveEspecial(k)) partes.push([escala, k, modelo.linha(escala, k).centro.titulo, true]);
        for (const alvo of [crumbs, ppCrumbs]) {
            alvo.replaceChildren();
            partes.forEach(([e, chave, rot, atual], i) => {
                if (i) alvo.appendChild(el(doc, 'span', 'sep', { 'aria-hidden': 'true' }, '›'));
                alvo.appendChild(botao(doc, null, rot, { 'data-crumb': e, 'data-k': chave, 'aria-current': atual ? 'true' : null }));
            });
        }
    }

    function textoDoPeriodo(): string {
        const e = tela.escala, k = tela.foco;
        if (!modelo) return '';
        if (nav.nivel === 'longo-prazo') return PINCA.longoPrazo;
        if (isChaveEspecial(k)) return modelo.linha(e, k).centro.titulo;
        if (e === 'dia') return `${diaDaSemana(k)} ${diaMes(k)} · ${semanaCurta(chaveDeHoje('semana', k))}`;
        if (e === 'semana') return modelo.linhaFechada(e, k).rotulo;
        return k;
    }

    /** A barra de cima do celular (o período) e a faixa do lugar (o chip). */
    function pintarMolduraDoCelular(): void {
        if (!modelo) return;
        const txt = textoDoPeriodo();
        perTxt.textContent = txt;
        marcarDica(perbtn, `Período em foco: ${txt} · toque para escolher outro`);
        const menuTudo = menu.querySelector('[data-menu="tudo"]');
        if (menuTudo) menuTudo.setAttribute('aria-pressed', String(tela.abrirTudo));
        if (isChaveEspecial(tela.foco)) { pchip.hidden = true; return; }
        const lugar = modelo.linha(tela.escala, tela.foco).lugar;
        const e = lugar.passagens[lugar.passagens.length - 1];
        pchip.hidden = false;
        if (!e) {
            // Sem passagem, o chip diz em palavras (a mesma frase da linha aberta).
            pchip.removeAttribute('data-node');
            pchip.replaceChildren(el(doc, 'span', null, { 'aria-hidden': 'true' }, '📍'), el(doc, 'span', null, null, FRASES.semLugar));
            marcarDica(pchip, `Lugar: ${FRASES.semLugar} neste período`);
            return;
        }
        pchip.setAttribute('data-node', e.id);
        pchip.replaceChildren(el(doc, 'span', null, { 'aria-hidden': 'true' }, '📍'), el(doc, 'span', null, null, lugar.passagens.map(x => x.cidade).join(' → ')), el(doc, 'span', 'pdt', null, datasDaPassagem(e)));
        marcarDica(pchip, `Lugar: ${lugar.texto}${e.pais ? `, ${e.pais}` : ''} · ${datasDaPassagem(e)} · toque para ver o lugar`);
    }

    /* ----------------------------------------------------------- depois do layout */
    let bilhete = 0;
    let centradoNaPintura = false;
    function depoisDoLayout(): void {
        const meu = ++bilhete;
        let feito = false;
        const rodar = () => {
            if (feito || meu !== bilhete || destruido) return;
            feito = true;
            if (!centradoNaPintura) centralizar();
            curvas.agora();
            atualizarHScroll();
            if (snapCentro) { snapCentro = false; snapTo(paneDoNivel(), false); }
        };
        raf(rodar);
        win.setTimeout(rodar, 80);
    }

    function linhaEmFoco(): HTMLElement | null {
        return track.querySelector('.row.focus') as HTMLElement | null ?? (track.querySelector(`.row[data-row="${cssEsc(tela.foco)}"]`) as HTMLElement | null);
    }

    function faixaDePan() {
        const row = linhaEmFoco();
        if (!row) return { alta: false, max: 0, min: 0 };
        const h = vp.clientHeight, pad = ehCelular() ? 52 : 28;
        return { alta: row.offsetHeight + pad * 2 > h, max: pad - row.offsetTop, min: h - pad - (row.offsetTop + row.offsetHeight) };
    }

    function centralizar(): void {
        const row = linhaEmFoco();
        if (!row) return;
        const r = faixaDePan();
        const y = r.alta ? (panY === null ? r.max : Math.max(r.min, Math.min(r.max, panY))) : Math.round(vp.clientHeight / 2 - (row.offsetTop + row.offsetHeight / 2));
        if (r.alta) panY = y;
        if (!centrado || pular) {
            track.style.transition = 'none';
            track.style.transform = `translateY(${y}px)`;
            void track.offsetHeight;
            track.style.transition = transicaoDoPasso(reduzido());
            centrado = true;
            pular = false;
            return;
        }
        // O passo: só o `transform` muda, com a curva de saída (ease-out); a medida já foi feita antes.
        track.style.transition = transicaoDoPasso(reduzido());
        track.style.transform = `translateY(${y}px)`;
    }

    /** O que faz: a linha em foco ainda desliza por dentro naquele sentido (mais alta que a vista, sem estar na borda)? */
    function podePan(dy: number): boolean {
        const r = faixaDePan();
        if (!r.alta || !dy) return false;
        const y = panY === null ? r.max : panY;
        return !((dy > 0 && y <= r.min + 1) || (dy < 0 && y >= r.max - 1));
    }
    function pan(dy: number): boolean {
        const r = faixaDePan();
        if (!r.alta) return false;
        const y = panY === null ? r.max : panY;
        if ((dy > 0 && y <= r.min + 1) || (dy < 0 && y >= r.max - 1)) return false;
        panY = Math.max(r.min, Math.min(r.max, y - dy));
        track.style.transition = 'none';
        track.style.transform = `translateY(${Math.round(panY)}px)`;
        raf(() => { track.style.transition = ''; });
        return true;
    }

    function realce(): { alvo: string | null; set: Set<string> | null } {
        const alvo = tela.selecionado ?? hover;
        return { alvo, set: alvo && modelo ? modelo.linhagem(alvo, tela.escala) : null };
    }

    /**
     * O que faz: as superfícies das curvas à vista: cada linha aberta do mapa (com a linhagem, a ligação
     * escolhida e as que se desligam na linha em foco) e, no zoom, o mapa do ramo.
     * Por quê: o agendador (`ligarCurvas`) desenha todas pelo mesmo caminho; aqui só se diz o que há.
     */
    function superficiesDasCurvas(): SuperficieDasLigacoes[] {
        if (!modelo || !ramoPrincipal) return [];
        const out: SuperficieDasLigacoes[] = [];
        if (!map.hidden) {
            const { set } = realce();
            const grava = podeGravar();
            const m = modelo, l = ramoPrincipal;
            for (const row of Array.from(track.querySelectorAll('.row.open')) as HTMLElement[]) {
                const k = row.getAttribute('data-row') ?? '';
                const foco = row.classList.contains('focus');
                out.push({
                    conteudo: row, ligacoes: m.linha(tela.escala, k).ligacoes, ramoPrincipal: l, realce: set, soLinhagem: tela.abrirTudo && !foco,
                    opcoes: {
                        desligavel: grava && foco ? (lig: Ligacao) => ligacaoDesligavel(m, lig) : undefined,
                        escolhida: ligacaoEscolhida && ligacaoEscolhida.row === k ? ligacaoEscolhida : null,
                        marcar: (e, t, tecla) => { marcarDica(e, t, tecla ? { tecla } : {}); },
                    },
                });
            }
        }
        const doRamo = ultimoMapa && nav.pilha.length ? superficieDoRamo(ramoVista, ultimoMapa) : null;
        if (doRamo) out.push(doRamo);
        return out;
    }

    function acender(): void {
        if (!modelo) return;
        const { alvo, set } = realce();
        acenderLinhagem(track, alvo, set, tela.selecionado);
        acenderRamo();
        for (const n of Array.from(ramoVista.querySelectorAll('[data-node]')) as HTMLElement[]) n.classList.toggle('selected', !!tela.selecionado && n.getAttribute('data-node') === tela.selecionado);
        for (const b of Array.from(root.querySelectorAll('[data-here]'))) b.setAttribute('aria-pressed', String(b.getAttribute('data-here') === onde));
        for (const n of Array.from(track.querySelectorAll('[data-node^="t:"], [data-node^="s:"], [data-tid]'))) {
            const id = n.getAttribute('data-node') ?? n.getAttribute('data-tid') ?? '';
            const t = modelo.indice.porId.get(id);
            const ctxs = t?.record.contexts ?? [];
            n.classList.toggle('away', !!onde && !!t && ctxs.length > 0 && !ctxs.some(c => ctxKey(c) === ctxKey(onde!)));
        }
    }

    /**
     * O que faz: o realce do mapa do ramo, o mesmo do mapa: o alvo é o cartão do nó escolhido, senão o
     * de baixo do mouse ou do foco, senão o do cursor do passo; a linhagem do nó dele (a do modelo) vira as
     * chaves dos cartões em que o nó aparece, e a `acenderLinhagem` faz o resto.
     * Por quê: os ramos não tinham o mesmo realce do mapa (02/11/2026).
     */
    function acenderRamo(): void {
        const mapa = ramoVista.querySelector('.ramo-mapa') as HTMLElement | null;
        if (!mapa || !modelo || !ultimoMapa) return;
        const cartoes = ultimoMapa.colunas.flatMap(c => c.cartoes);
        const doNo = (id: string | null) => (id ? cartoes.find(c => c.id === id)?.chave ?? null : null);
        const cursor = (mapa.querySelector('.n-ramo.cursor') as HTMLElement | null)?.getAttribute('data-cartao') ?? null;
        const alvo = doNo(tela.selecionado) ?? hoverDoRamo ?? cursor;
        const id = alvo ? cartoes.find(c => c.chave === alvo)?.id ?? null : null;
        const linhagem = id ? modelo.linhagem(id, tela.escala) : null;
        const set = linhagem ? new Set(cartoes.filter(c => c.id && linhagem.has(c.id)).map(c => c.chave)) : null;
        acenderLinhagem(mapa, alvo, set, undefined, 'data-cartao');
    }

    /* ----------------------------------------------------------- os painéis de lado */
    const marcas = () => (Array.from(snaps.querySelectorAll('.sn')) as HTMLElement[]).filter(m => win.getComputedStyle(m).display !== 'none');
    function paneLeft(m: HTMLElement): number {
        const mr = map.getBoundingClientRect(), r = m.getBoundingClientRect();
        const al = String(win.getComputedStyle(m).scrollSnapAlign || 'start').trim().split(/\s+/).pop();
        const pad = parseFloat(win.getComputedStyle(map).scrollPaddingLeft) || 0, cw = map.clientWidth;
        const x0 = r.left - mr.left + map.scrollLeft;
        const L = al === 'center' ? x0 + r.width / 2 - (pad + (cw - pad) / 2) : al === 'end' ? x0 + r.width - cw : x0 - pad;
        return Math.max(0, Math.min(map.scrollWidth - cw, Math.round(L)));
    }
    function paneProximo(): string {
        let best = 'centro', bd = Infinity;
        for (const m of marcas()) { const d = Math.abs(paneLeft(m) - map.scrollLeft); if (d < bd) { bd = d; best = m.getAttribute('data-pane') ?? best; } }
        return best;
    }
    function snapTo(nome: string, suave: boolean): void {
        const ms = marcas();
        const m = ms.find(x => x.getAttribute('data-pane') === nome) ?? ms.find(x => x.getAttribute('data-pane') === ramoPrincipal?.centro.painel);
        if (!m || map.scrollWidth <= map.clientWidth + 1) return;
        const reduz = !!win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        map.scrollTo({ left: paneLeft(m), behavior: suave && !reduz ? 'smooth' : 'instant' as ScrollBehavior });
        pane = m.getAttribute('data-pane') ?? pane;
        atualizarHScroll();
    }
    let indChave = '';
    function atualizarHScroll(): void {
        const hs = map.scrollWidth > map.clientWidth + 1;
        root.classList.toggle('hscroll', hs);
        root.classList.toggle('can-l', hs && map.scrollLeft > 2);
        root.classList.toggle('can-r', hs && map.scrollLeft < map.scrollWidth - map.clientWidth - 2);
        const pl = track.querySelector('.c-place') as HTMLElement | null;
        root.style.setProperty('--rail-w', `${pl ? pl.offsetWidth : 0}px`);
        const w = largura();
        root.setAttribute('data-forma', w > 0 && w <= 520 ? 'celular' : hs ? 'paineis' : 'borboleta');
        if (!hs || !ramoPrincipal) { pind.hidden = true; indChave = ''; return; }
        const ms = marcas();
        const cur = paneProximo();
        const chave = `${ms.map(m => m.getAttribute('data-pane')).join()}|${cur}|${root.classList.contains('can-l')}${root.classList.contains('can-r')}`;
        pind.hidden = false;
        if (chave === indChave) return;
        indChave = chave;
        pind.replaceChildren(el(doc, 'span', 'ar', { 'aria-hidden': 'true' }, root.classList.contains('can-l') ? '←' : '\u2003'));
        ms.forEach((m, i) => {
            const id = m.getAttribute('data-pane') ?? '';
            const p = ramoPrincipal!.paineis.find(x => x.id === id);
            if (i) pind.appendChild(el(doc, 'span', 'sep', { 'aria-hidden': 'true' }, '·'));
            const b = botao(doc, null, null, { 'data-pane': id, 'aria-current': String(id === cur) });
            b.appendChild(el(doc, 'span', 'dot', { 'aria-hidden': 'true' }));
            b.appendChild(el(doc, 'span', 'pl', null, p?.rotulo ?? id));
            marcarDica(b, `Painel ${p?.rotulo ?? id}: ${p?.dica ?? ''}${id === cur ? ' (você está aqui)' : ''}`);
            pind.appendChild(b);
        });
        pind.appendChild(el(doc, 'span', 'ar', { 'aria-hidden': 'true' }, root.classList.contains('can-r') ? '→' : '\u2003'));
    }
    let scrollT = 0;
    on(map, 'scroll', () => { win.cancelAnimationFrame?.(scrollT); scrollT = raf(() => { atualizarHScroll(); pane = paneProximo(); }); }, { passive: true });

    /* ----------------------------------------------------------- o painel do nó */
    function folha(estadoFolha: 'half' | 'full'): void {
        drawer.classList.toggle('sheet-half', estadoFolha === 'half');
        drawer.classList.toggle('sheet-full', estadoFolha === 'full');
        drawer.style.transform = '';
    }
    /**
     * O que faz: marca na raiz que a gaveta estreita (o painel do nó, o Novo) está aberta, para a
     * página abrir espaço ao lado dela na tela larga, como a gaveta larga do ciclo (`plan-open`).
     * Por quê: o diagnóstico do painel do nó (29/10, C2): a gaveta cobria o cabeçalho ("Triag"
     * cortado em todas as capturas); acima de 720 px ela fica ao lado da linha do tempo.
     */
    function marcarGaveta(): void {
        root.classList.toggle('panel-open', !drawer.hidden && !drawer.classList.contains('wide'));
        pintarTrilhaDosRamos();
        // O painel ao lado muda a largura da vista por dentro: as curvas e a rolagem de lado se medem de novo.
        atualizarHScroll();
        curvas.pedir();
    }
    function pintarPainel(novo: boolean): void {
        if (!aberto || !modelo) return;
        const top = dbody.scrollTop;
        const ativo = doc.activeElement as HTMLElement | null;
        // O campo em edição não se perde com a versão nova do cofre: o painel espera ele sair.
        if (!novo && ativo && dbody.contains(ativo) && /^(input|select|textarea)$/i.test(ativo.tagName)) { painelPendente = true; return; }
        painelPendente = false;
        const ativoGoto = ativo && dbody.contains(ativo) ? (ativo.getAttribute('data-goto') ?? ativo.getAttribute('data-open') ?? ativo.getAttribute('data-act')) : null;
        const conteudo = conteudoDoPainel(contexto(), aberto);
        // A trilha (P10c): de onde se veio, no alto do painel, com a volta.
        if (trilha.length) conteudo.insertBefore(trilhaEl(contexto(), trilha, conteudo.querySelector('.dr-title')?.textContent ?? ''), conteudo.firstChild);
        dbody.replaceChildren(conteudo);
        const h = dbody.querySelector('.dr-title');
        drawer.setAttribute('aria-label', `Painel do nó: ${h?.textContent ?? ''}`);
        if (!novo) dbody.scrollTop = top;
        if (ativoGoto) (dbody.querySelector(`[data-goto="${cssEsc(ativoGoto)}"], [data-open="${cssEsc(ativoGoto)}"], [data-act="${cssEsc(ativoGoto)}"]`) as HTMLElement | null)?.focus();
        abrirItemPedido();
    }
    /** O nó que abriu o painel: o foco volta para ele quando o painel fecha. */
    let voltarAoNo: string | null = null;
    /** O "+ Item" de um cartão: o nó cujo painel abre com a caixa do item novo (quando a checklist chegar). */
    let itemDepois: string | null = null;
    /** O que faz: abre a caixa do item novo no painel do nó que o "+ Item" do cartão pediu, quando ela já está lá. */
    function abrirItemPedido(): void {
        if (!itemDepois || itemDepois !== aberto) return;
        const b = dbody.querySelector('[data-act="item-abrir"]') as HTMLElement | null;
        const f = dbody.querySelector('[data-form="item"]') as HTMLElement | null;
        if (!b || !f) return;
        itemDepois = null;
        if (f.hidden) acaoDoPainel('item-abrir', b);
    }
    /** O que faz: o foco na primeira opção que se escolhe do menu de status aberto (o teclado anda nele com ↑ ↓). */
    function focarMenuDoStatus(): void {
        (dbody.querySelector('[data-menu-status] [role="menuitem"]:not([disabled])') as HTMLElement | null)?.focus({ preventScroll: false } as FocusOptions);
    }
    /** O que faz: abre ou fecha o menu de status do nó (a tecla S): no painel dele, aberto se preciso; nada no nó sem estados. */
    function teclaDoStatus(id: string): boolean {
        if (!modelo || !podeGravar() || !estadoDoNo(contexto(), id)) return false;
        if (aberto === id && !drawer.hidden) {
            menuStatus = menuStatus && menuStatus.id === id ? null : { id, modo: 'aberto' };
            pintarPainel(false);
        } else {
            menuStatus = { id, modo: 'aberto' };
            tela = { ...tela, selecionado: id };
            acender();
            abrirPainel(id);
        }
        if (menuStatus) focarMenuDoStatus();
        else (dbody.querySelector('[data-act="status-menu"]') as HTMLElement | null)?.focus();
        return true;
    }
    function abrirPainel(id: string, focar = true, manterTrilha = false): void {
        if (!manterTrilha) trilha = [];
        if (esperandoNota && esperandoNota.id !== id) esperandoNota = null;
        cederGaveta();
        // O Novo aberto vira rascunho (volta no próximo "+ Novo"): a gaveta agora é do nó.
        if (novo) { rascunhoDoNovo = rascunhoDe(novo); novo = null; novoPendente = false; }
        const estava = !drawer.hidden;
        if (menuStatus && menuStatus.id !== id) menuStatus = null;
        aberto = id;
        pintarPainel(true);
        drawer.hidden = false;
        if (!estava) folha('half');
        scrim.hidden = !ehFolha();
        // O foco entra no painel (role=dialog, §9.3), e o Tab fica nele até fechar.
        if (focar) { voltarAoNo = id; drawer.focus({ preventScroll: true } as FocusOptions); }
        marcarGaveta();
        avisar();
    }
    function fecharPainel(): void {
        if (gaveta) { fecharGaveta(true); return; }
        if (novo) { fecharNovo(true); return; }
        const ativo = doc.activeElement as HTMLElement | null;
        const devolver = !ativo || ativo === doc.body || drawer.contains(ativo) || !ativo.isConnected;
        aberto = null;
        menuStatus = null;
        trilha = [];
        ligacaoEscolhida = null;
        drawer.hidden = true;
        scrim.hidden = true;
        marcarGaveta();
        tela = { ...tela, selecionado: null };
        curvas.agora();
        if (devolver) {
            const no = voltarAoNo ? (track.querySelector(`[data-node="${cssEsc(voltarAoNo)}"]`) as HTMLElement | null) : null;
            (no ?? root).focus({ preventScroll: true } as FocusOptions);
        }
        voltarAoNo = null;
        avisar();
    }
    /** O que faz: prende o Tab dentro do painel aberto (o último volta ao primeiro, e o contrário). */
    function prenderTab(ev: KeyboardEvent): void {
        if (ev.key !== 'Tab' || drawer.hidden) return;
        const focaveis = (Array.from(drawer.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')) as HTMLElement[])
            .filter(e => !e.hasAttribute('disabled') && !e.closest('[hidden]'));
        if (!focaveis.length) { ev.preventDefault(); drawer.focus(); return; }
        const primeiro = focaveis[0], ultimo = focaveis[focaveis.length - 1];
        const ativo = doc.activeElement;
        if (ev.shiftKey && (ativo === primeiro || ativo === drawer)) { ev.preventDefault(); ultimo.focus(); }
        else if (!ev.shiftKey && ativo === ultimo) { ev.preventDefault(); primeiro.focus(); }
    }

    /* ----------------------------------------------------------- foco, escala, ir até */
    function andar(d: 1 | -1): void {
        const chaves = chavesDaEscala();
        const antes = tela.foco;
        ligacaoEscolhida = null;
        tela = andarFoco(tela, chaves, d);
        if (tela.foco !== antes) { panY = null; pintar(); }
    }
    /** A troca de escala troca as linhas: em vez de deslizar sobre outro conteúdo, a trilha entra (opacidade e um passo curto). */
    function entrada(): void {
        if (reduzido()) return;
        track.classList.remove('entra');
        void track.offsetWidth;
        track.classList.add('entra');
    }
    function irEscala(e: Escala): void {
        snapCentro = true;
        // O botão da escala sai do ramo e do longo prazo: a navegação começa na escala escolhida.
        const saiu = nav.pilha.length > 0 || nav.nivel !== e;
        nav = navegacaoInicial(e);
        if (e === tela.escala) { if (saiu) { pular = true; pintar(); } else depoisDoLayout(); return; }
        tela = comEscala(tela, e, modelo?.hoje ?? hoje());
        pular = true;
        panY = null;
        pintar();
        entrada();
    }
    function irHoje(): void {
        snapCentro = true;
        panY = null;
        nav = voltarAte(nav, 0);
        const antes = tela.escala;
        tela = irParaHoje(tela, modelo?.hoje ?? hoje());
        if (tela.escala !== antes) pular = true;
        pintar();
        if (tela.escala !== antes) entrada();
    }
    function irPeriodo(e: Escala, chave: string): void {
        if (e !== tela.escala) pular = true;
        // O período escolhido sai do ramo; na mesma escala, o nível (o longo prazo) fica.
        nav = escalaDaTela(nav.nivel) === e ? voltarAte(nav, 0) : navegacaoInicial(e);
        tela = { ...tela, escala: e, foco: chave, seguir: true };
        panY = null;
        pintar();
    }
    /**
     * O que faz: depois do "Criar a nota" de um vínculo sem nota (P10c), quando a versão nova do
     * cofre traz a nota, abre o painel dela (os campos do modelo do tipo, as conexões); o painel do
     * vínculo que ficou aberto também passa para a nota. Outro painel aberto no meio tempo vence.
     */
    function seguirNotaCriada(): void {
        if (!modelo) return;
        // O país sem nota (G6) também vale em todo ramo: o nome vem do lugar quando o ramo não tem o vínculo.
        const alvo = esperandoNota ?? (aberto?.startsWith('c:') ? { id: aberto, nome: modelo.detalhe(aberto)?.titulo ?? modelo.lugarDoNo(aberto)?.pais?.nome ?? '' } : null);
        if (!alvo || !alvo.nome) return;
        const no = modelo.noDoNome(alvo.nome);
        if (!no || no.id === alvo.id || !no.id.startsWith('n:')) return;
        if (aberto && aberto !== alvo.id) { esperandoNota = null; return; }
        esperandoNota = null;
        tela = { ...tela, selecionado: no.id };
        acender();
        // Sem tirar o foco de onde ele está (o protocolo acabou de fechar): o painel só aparece.
        abrirPainel(no.id, false, true);
    }
    /** Quantos painéis a trilha guarda (os mais velhos saem). */
    const TRILHA_GUARDA = 12;
    /**
     * O que faz: abre o painel de uma conexão (P10c): o nó que está na tela, "ir até" ele (a linha
     * dele, aceso); o que não está, o painel dele por cima do de agora, sem mexer na linha do tempo.
     * O painel de agora entra na trilha; voltar a um painel da trilha corta a trilha ali.
     */
    function navegar(id: string): void {
        if (!modelo || !id || id === aberto) return;
        const i = trilha.findIndex(x => x.id === id);
        if (i >= 0) trilha = trilha.slice(0, i);
        else if (aberto) trilha = [...trilha, { id: aberto, titulo: dbody.querySelector('.dr-title')?.textContent ?? aberto }].slice(-TRILHA_GUARDA);
        abrirDaTrilha(id);
    }
    /** O que faz: abre o painel de um nó sem mexer na trilha (o da tela, indo até ele; o outro, por cima). */
    function abrirDaTrilha(id: string): void {
        // Na vista do ramo, a conexão do painel abre por cima, sem sair do ramo.
        if (!nav.pilha.length && track.querySelector(`[data-node="${cssEsc(id)}"]`)) { irPara(id, true); return; }
        tela = { ...tela, selecionado: id };
        acender();
        abrirPainel(id, true, true);
    }
    /** O que faz: volta ao último painel da trilha (o "‹ Voltar", Alt+← e Esc com trilha); sem trilha, nada. */
    function voltar(ate?: number): boolean {
        if (!trilha.length || !aberto) return false;
        const i = ate === undefined ? trilha.length - 1 : Math.max(0, Math.min(trilha.length - 1, ate));
        const alvo = trilha[i];
        trilha = trilha.slice(0, i);
        abrirDaTrilha(alvo.id);
        return true;
    }
    /** Leva até um nó: a linha dele na escala de agora (o período, na escala dele), aceso e com o painel. */
    function irPara(id: string, manterTrilha = false): void {
        if (!modelo) return;
        nav = voltarAte(nav, 0);
        const periodo = periodoDoId(id);
        if (periodo) irPeriodo(periodo.escala, periodo.chave);
        else {
            const k = modelo.linhaDoNo(id, tela.escala);
            if (k) { tela = { ...tela, foco: k }; panY = null; }
        }
        tela = { ...tela, selecionado: id };
        pintar();
        abrirPainel(id, true, manterTrilha);
    }
    /* ----------------------------------------------------------- a pinça: o terceiro eixo (29/10) */
    /** O que faz: o que o ramo lê da borda: o frontmatter, os links e o texto da nota (o mesmo do painel). */
    const leitorDoRamo = (raiz?: string): LeitorDoRamo => ({
        camposDaNota,
        ligacoesDaNota: caminho => { try { return adaptador.ligacoesDaNota?.(caminho) ?? null; } catch (e) { return null; } },
        rotuloDoType: t => rotuloDoType(contexto(), t),
        // Só a nota do nó do centro se lê (a checklist dele); no ramo da semana e no do trimestre, a nota dele e,
        // no trimestre, as Weeks dele (os Suportes e decisões, 02/11); as outras dão o texto que já chegou.
        textoDaNota: adaptador.textoDaNota ? caminho => (textos.has(caminho) || caminho === notaDoCentro() || notasDoPeriodo(raiz).has(caminho) ? textoDaNota(caminho) : null) : undefined,
    });
    /** O que faz: a nota do nó do centro do ramo (o topo da pilha); `null` sem pilha ou sem nota. */
    function notaDoCentro(): string | null {
        const topo = nav.pilha[nav.pilha.length - 1];
        if (!topo || !modelo) return null;
        try { return modelo.arquivos(topo.id).nota; } catch (e) { return null; }
    }
    /**
     * O que faz: as notas que o ramo de um período lê para os Suportes e decisões (02/11): a da semana; a do
     * trimestre e as das Weeks dele. O ramo se monta antes de a pinça pôr o nó no topo da pilha, então a
     * regra é pela raiz do ramo que se monta, e não pelo centro da vista. Outro nó: nenhuma.
     */
    function notasDoPeriodo(raiz: string | undefined): Set<string> {
        const p = raiz ? periodoDoId(raiz) : null;
        if (!p || (p.escala !== 'semana' && p.escala !== 'trimestre') || isChaveEspecial(p.chave) || !modelo) return new Set();
        const ids = [raiz!, ...(p.escala === 'trimestre' ? [...new Set(diasDoPeriodo('trimestre', p.chave).map(d => chaveDeHoje('semana', d)))].map(w => idDoPeriodo('semana', w)) : [])];
        const out = new Set<string>();
        for (const id of ids) {
            try { const n = modelo.arquivos(id).nota; if (n) out.add(n); } catch (e) { /* sem nota */ }
        }
        return out;
    }
    /**
     * Os ramos já montados nesta versão do cofre, pelo nó e pela profundidade: cada pintura, o caminho
     * e os passos leem daqui, e o ramo se monta uma vez (o congelamento de 30/10: o mesmo ramo grande se
     * montava de novo a cada nota lida). A versão nova do cofre e o texto que chega limpam.
     */
    const ramos = new Map<string, RamoDoNo | null>();
    /** O que faz: o ramo de um nó pelo modelo (`modelo.ramo`), uma vez por versão; `null` = a Missão não conhece o nó, ou a leitura falhou. */
    function ramoDe(id: string, profundidade = 1): RamoDoNo | null {
        if (!modelo || !id) return null;
        const k = `${profundidade}|${id}|${JSON.stringify(expansao[id] ?? {})}`;
        if (ramos.has(k)) return ramos.get(k)!;
        let r: RamoDoNo | null = null;
        try { r = modelo.ramo(id, profundidade, leitorDoRamo(id), expansao[id] ?? {}); } catch (e) { console.warn('DFM Missão: o ramo não se montou', e); }
        ramos.set(k, r);
        return r;
    }
    /** O texto das notas que chega pede uma pintura do ramo só, no quadro seguinte (nunca uma por nota). */
    let ramoAgendado = false;
    function agendarRamo(): void {
        if (ramoAgendado) return;
        ramoAgendado = true;
        raf(() => { ramoAgendado = false; if (destruido) return; ramos.clear(); pintarRamo(); });
    }
    /** O mapa do ramo desenhado agora (as curvas se redesenham depois do layout e ao mudar o tamanho). */
    let ultimoMapa: MapaDoRamo | null = null;
    /** O que faz: a formação de um nó: a do modelo do tipo dele, a do ramo, ou o padrão da espécie. */
    function formacaoDoRamo(ramo: RamoDoNo): Formacao {
        return formacaoDoNo(ramo.especie, formacaoDoDominio(dominioDoRamo(ramo), modelo?.indice.tabelas?.tipos ?? []), ramoPrincipal?.formacao ?? null);
    }
    /**
     * O que faz: o domínio do modelo do nó do ramo: o da nota (o `type`); o período sem nota (a semana que
     * ainda não tem Week, a que se planeja no domingo) fica com o domínio da escala dele.
     */
    function dominioDoRamo(ramo: RamoDoNo): string | null {
        const daNota = modelo ? modelo.dominioDoNo(ramo.id, leitorDoRamo()) : null;
        return daNota ?? (ramo.especie === 'periodo' ? especieDoNo(ramo.id) : null);
    }
    /** O que faz: a disposição do mapa do ramo (02/11): as colunas, o "+" e o quanto à vista, pelo modelo do tipo. */
    function disposicaoDoRamo(ramo: RamoDoNo): DisposicaoDoRamo {
        return disposicaoDoNo(formacaoDoDominio(dominioDoRamo(ramo), modelo?.indice.tabelas?.tipos ?? []), ramoPrincipal?.formacao ?? null, CONEXOES_A_VISTA);
    }
    /** O que faz: o nó sob o gesto (os dedos ou o cursor): o ponto, ou o alvo do evento; fora do painel do nó. */
    function noSobOGesto(x: number, y: number, alvo: EventTarget | null): string | null {
        const noPonto = typeof (doc as any).elementFromPoint === 'function' && Number.isFinite(x) && Number.isFinite(y) ? (doc as any).elementFromPoint(x, y) : null;
        const sob = (noPonto ?? alvo) as HTMLElement | null;
        // No ramo, o invólucro do cartão (a posição) leva ao cartão de dentro.
        const n = (sob?.closest?.('[data-node]') ?? sob?.closest?.('[data-cartao]')?.querySelector('[data-node]')) as HTMLElement | null;
        return n && root.contains(n) && !drawer.contains(n) ? n.getAttribute('data-node') : null;
    }
    /** O que faz: o nó do `+` pelo teclado: o item da vez no ramo, ou o escolhido; sem nenhum, `null` (o nível de baixo). */
    function alvoDoTeclado(): string | null {
        const topo = nav.pilha[nav.pilha.length - 1];
        if (!topo) return tela.selecionado;
        if (cursorDoRamo.cursor !== null) { const ramo = ramoDe(topo.id, topo.profundidade); const id = ramo ? navegaveisDoRamo(ramo, cursorDoRamo.abertos)[cursorDoRamo.cursor] : null; if (id && !id.startsWith('#')) return id; }
        return tela.selecionado && ramoVista.querySelector(`[data-node="${cssEsc(tela.selecionado)}"]`) ? tela.selecionado : null;
    }
    /**
     * O que faz: um passo no terceiro eixo: aproximar sobre um nó entra no ramo dele (ou desce mais um
     * nível nele); sem nó, desce mais um nível no ramo de cima ou uma escala; acima da escala de onde a
     * expansão partiu, aproximar desce uma escala, mesmo sobre um nó (a volta, 30/10); afastar desfaz o
     * último zoom e, sem zoom, abre a escala de cima até o Sistema; depois dele, o grafo do Obsidian
     * abre numa aba ao lado, com o aviso de como voltar.
     * Por quê: a proposta da pinça (29/10); um dono só para a navegação (`passoDaNavegacao`).
     * Entra → sai: o passo, o nó sob o gesto e o ponto do gesto → a tela no nível novo (nada muda sem passo).
     * Erro e ataque: o nó que a Missão não conhece vale como nenhum; o nível mais fundo que o ramo tem
     * não entra (o aviso diz); a pilha cheia e o grafo avisam e não mudam nada.
     */
    function passoDeNivel(passo: PassoDeNivel, alvo: string | null, ponto: { x: number; y: number } | null): void {
        if (!modelo || !ramoPrincipal) return;
        const id = passo === APROXIMA && alvo && ramoDe(alvo) ? alvo : null;
        const r = passoDaNavegacao(nav, passo, id);
        if (!r.mudou) {
            if (r.porque === 'ainda-nao-existe') toast(PINCA.naoExiste);
            // O grafo é a vista de grafo do próprio Obsidian: o lugar a abre numa aba ao lado e o aviso diz como voltar; desligada, onde ligar.
            else if (r.porque === 'fora-da-missao') { let abriu = false; try { abriu = !!adaptador.abrirGrafo?.(); } catch (e) { abriu = false; } toast(abriu ? PINCA.grafoAberto : PINCA.grafoDesligado); }
            else if (r.porque === 'fundo-do-ramo') toast(PINCA.fundo);
            else if (r.porque === 'pilha-cheia') toast(PINCA.pilhaCheia);
            return;
        }
        const antes = nav.pilha[nav.pilha.length - 1];
        const depois = r.estado.pilha[r.estado.pilha.length - 1];
        // Mais fundo no mesmo nó só quando o ramo dele tem esse nível.
        if (passo === APROXIMA && antes && depois && depois.id === antes.id && (ramoDe(depois.id, depois.profundidade)?.niveis.length ?? 0) < depois.profundidade) { toast(PINCA.fundo); return; }
        irNavegacao(r.estado, passo, ponto);
    }
    /** O que faz: leva a tela à navegação dada: a escala do nível, a vista do ramo e a transição do gesto. */
    function irNavegacao(novo: NivelDaNavegacao, passo: PassoDeNivel, ponto: { x: number; y: number } | null): void {
        const antes = nav;
        if (novo === antes) return;
        nav = novo;
        cursorDoRamo = CURSOR_INICIAL;
        ligacaoEscolhida = null;
        const trocaEscala = escalaDaTela(novo.nivel) !== tela.escala;
        if (trocaEscala) { tela = comNivel(tela, novo.nivel, modelo?.hoje ?? hoje()); panY = null; }
        if (trocaEscala || novo.nivel !== antes.nivel || !novo.pilha.length !== !antes.pilha.length) { pular = true; snapCentro = true; }
        // FLIP: medir antes da pintura (a pintura troca os elementos), pintar, medir depois e animar a diferença.
        const foto = reduzido() ? null : fotografar();
        pintar();
        if (trocaEscala) entrada();
        animarPinca(passo, ponto, foto);
    }

    /* ----------------------------------------------------------- a transição da pinça (FLIP) */
    /** O que a transição guarda da tela de antes: a caixa de cada nó à vista e a cópia da vista que sai. */
    interface FotoDaPinca { caixas: Map<string, Caixa>; vista: HTMLElement | null; copia: HTMLElement | null; centro: string | null }
    /** O que faz: a caixa de um elemento na tela (só a que tem tamanho). */
    const caixaDe = (e: Element | null): Caixa | null => {
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return r.width && r.height ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
    };
    /**
     * O que faz: mede a tela antes da pintura: a caixa de cada nó da vista à vista (o mapa ou o ramo) e a
     * cópia dela, que a transição põe no véu enquanto a vista nova chega.
     */
    function fotografar(): FotoDaPinca {
        const emRamo = !ramoVista.hidden;
        const vista = emRamo ? ramoVista : !sistemaVista.hidden ? sistemaVista : map;
        const caixas = new Map<string, Caixa>();
        for (const n of Array.from(vista.querySelectorAll('[data-node]'))) {
            const id = n.getAttribute('data-node');
            // No ramo, a caixa é a do invólucro do cartão (o que a transição move).
            const c = id && !caixas.has(id) ? caixaDe((n as HTMLElement).closest?.('[data-cartao]') ?? n) : null;
            if (id && c) caixas.set(id, c);
        }
        const copia = typeof (vista as any).cloneNode === 'function' ? vista.cloneNode(true) as HTMLElement : null;
        // A cópia é só imagem: sem nó, sem gesto, sem foco (nada a acha como se fosse a vista de verdade).
        if (copia) {
            for (const n of Array.from(copia.querySelectorAll('[data-node], [data-act], [data-cartao], [tabindex]')) as HTMLElement[]) {
                for (const a of ['data-node', 'data-act', 'data-cartao', 'tabindex']) n.removeAttribute(a);
            }
            copia.classList.add('pinca-copia');
        }
        const centro = emRamo ? ramoVista.querySelector('.ramo-centro-no [data-node]')?.getAttribute('data-node') ?? null : null;
        return { caixas, vista, copia, centro };
    }
    /** O que faz: as partes de um ramo desenhado que entram ou saem esmaecendo: tudo, menos o cartão do centro (que voa). */
    function partesDoRamo(raiz: Element): HTMLElement[] {
        const partes = Array.from(raiz.querySelectorAll('.ramo-caminho, .ramo-pe')) as HTMLElement[];
        for (const c of Array.from(raiz.querySelectorAll('.ramo-col > *')) as HTMLElement[]) if (!c.classList.contains('ramo-centro-no')) partes.push(c);
        return partes;
    }
    /** Os elementos que a transição tocou, o relógio do fim dela e o fim. */
    let tocadosPelaPinca: HTMLElement[] = [];
    let relogioDaPinca: any = null;
    /** O que faz: uma transição de um elemento só, pelo `transform` e pela opacidade: de onde ele parte até onde fica. */
    function tocar(e: HTMLElement, de: { transform?: string; opacity?: string; origem?: string }, para: { transform?: string; opacity?: string }): void {
        e.style.transition = 'none';
        // De onde partiu, à vista no elemento enquanto a transição dura (a prova e a inspeção leem daqui).
        e.setAttribute('data-pinca-de', de.transform ?? '');
        e.style.transformOrigin = de.origem ?? '';
        e.style.transform = de.transform ?? '';
        e.style.opacity = de.opacity ?? '';
        void e.offsetWidth;
        e.style.transition = `transform ${DURACAO_DA_PINCA}ms ${CURVA_DA_PINCA}, opacity ${DURACAO_DA_PINCA}ms ${CURVA_DA_PINCA}`;
        e.style.transform = para.transform ?? '';
        e.style.opacity = para.opacity ?? '';
        tocadosPelaPinca.push(e);
    }
    /**
     * O que faz: a transição de um nível da pinça (30/10: o efeito de zoom e a transição suave). No
     * zoom num nó, o cartão sob os dedos cresce do lugar dele até o centro do ramo, enquanto a vista de
     * antes cresce e some; na expansão, o centro encolhe de volta ao lugar dele e a vista de antes
     * encolhe e some; na troca de escala, a vista nova cresce ou encolhe a partir do ponto do gesto. Só
     * `transform` e opacidade, em `DURACAO_DA_PINCA` ms, com a curva de saída; a vista de antes é uma
     * cópia no véu (a pintura já trocou os elementos). No fim, tudo volta ao normal e as curvas se
     * redesenham (medidas sem escala: a curva medida no meio da escala ficava curta, 30/10).
     * Entra → sai: o passo, o ponto do gesto e a foto de antes (`null` = sem transição) → nada.
     */
    function animarPinca(passo: PassoDeNivel, ponto: { x: number; y: number } | null, foto: FotoDaPinca | null): void {
        acabarPinca();
        if (!foto) return;
        const classe = classeDaPinca(false, passo)!;
        mapwrap.classList.add('pinca-anima', classe);
        const esc = escalasDaPinca(passo);
        const base = mapwrap.getBoundingClientRect();
        const origem = ponto ? origemDaPinca(ponto, base) : '50% 50%';
        const emRamo = nav.pilha.length > 0;
        // A vista que chega.
        if (emRamo) {
            const centro = ramoVista.querySelector('.ramo-centro-no') as HTMLElement | null;
            const id = centro?.querySelector('[data-node]')?.getAttribute('data-node') ?? null;
            const de = id ? foto.caixas.get(id) ?? null : null;
            const flip = de && centro ? flipDe(de, caixaDe(centro) ?? de) : null;
            if (flip && centro) {
                // O cartão sob os dedos cresce do lugar dele até o centro; o resto do ramo chega esmaecendo.
                tocar(centro, { transform: flip, origem: '0 0' }, {});
                for (const x of partesDoRamo(ramoVista)) tocar(x, { opacity: '0' }, {});
            } else tocar(ramoVista, { opacity: '0', transform: `scale(${esc.chega})`, origem }, {});
        } else tocar(sistemaVista.hidden ? map : sistemaVista, { opacity: '0', transform: `scale(${esc.chega})`, origem }, {});
        // A vista que sai: a cópia no véu, no mesmo lugar, crescendo (zoom) ou encolhendo (expansão) até sumir.
        if (foto.copia && foto.vista) {
            const de = caixaDe(foto.vista);
            const c = foto.copia;
            c.removeAttribute('hidden');
            if (de) { c.style.position = 'absolute'; c.style.left = `${de.left - base.left}px`; c.style.top = `${de.top - base.top}px`; c.style.width = `${de.width}px`; c.style.height = `${de.height}px`; }
            veu.replaceChildren(c);
            veu.hidden = false;
            if (foto.vista === map) c.scrollLeft = map.scrollLeft; else c.scrollTop = ramoVista.scrollTop;
            // Na expansão a partir do ramo, o centro de antes encolhe até o lugar dele na vista nova.
            const voltaPara = passo !== APROXIMA && foto.centro ? caixaDe((emRamo ? ramoVista : track).querySelector(`[data-node="${cssEsc(foto.centro)}"]`)) : null;
            const centroCopia = voltaPara ? c.querySelector('.ramo-centro-no') as HTMLElement | null : null;
            const deCentro = centroCopia && foto.centro ? foto.caixas.get(foto.centro) ?? null : null;
            const flipVolta = voltaPara && deCentro ? flipDe(voltaPara, deCentro) : null;
            if (flipVolta && centroCopia) {
                // O centro encolhe até o lugar dele; o resto do ramo some; a vista nova chega esmaecendo.
                tocar(centroCopia, { origem: '0 0' }, { transform: flipVolta });
                for (const x of partesDoRamo(c)) tocar(x, {}, { opacity: '0' });
            } else tocar(c, { origem }, { opacity: '0', transform: `scale(${esc.sai})` });
        }
        relogioDaPinca = win.setTimeout(() => acabarPinca(), DURACAO_DA_PINCA + 40);
    }
    /** O que faz: acaba a transição da pinça: tira os estilos dela, esvazia o véu e redesenha as curvas, já sem escala. */
    function acabarPinca(): void {
        if (relogioDaPinca !== null) { win.clearTimeout(relogioDaPinca); relogioDaPinca = null; }
        const tocados = tocadosPelaPinca;
        tocadosPelaPinca = [];
        for (const e of tocados) { e.style.transition = ''; e.style.transform = ''; e.style.opacity = ''; e.style.transformOrigin = ''; e.removeAttribute('data-pinca-de'); }
        const animava = mapwrap.classList.contains('pinca-anima');
        mapwrap.classList.remove('pinca-anima', 'pinca-entra', 'pinca-sai');
        if (!veu.hidden || veu.firstElementChild) { veu.hidden = true; veu.replaceChildren(); }
        if (animava && !destruido) curvas.agora();
    }
    /** O que faz: o painel em que o nível se mostra: o da coluna do horizonte no longo prazo; senão o centro. */
    function paneDoNivel(): string {
        const longo = nav.nivel === 'longo-prazo' && ramoPrincipal && plano ? colunaDoHorizonte(ramoPrincipal, plano) : null;
        if (!longo) return 'centro';
        const ms = marcas().map(m => m.getAttribute('data-pane'));
        return longo.paineis.find(p => ms.includes(p)) ?? 'centro';
    }
    /** O que faz: o texto do começo do caminho do zoom: o período de onde se partiu (ou o longo prazo). */
    function rotuloDoInicio(): string {
        const e = tela.escala, k = tela.foco;
        if (nav.nivel === 'longo-prazo') return PINCA.longoPrazo;
        if (!modelo) return k;
        if (isChaveEspecial(k)) return modelo.linha(e, k).centro.titulo;
        if (e === 'dia') return `${diaDaSemana(k)} ${diaMes(k)}`;
        if (e === 'semana') return semanaCurta(k);
        return k;
    }
    /** O que faz: desenha o terceiro eixo: o mapa ou a vista do ramo, e o longo prazo (o Ano com a coluna do horizonte em foco). */
    function pintarProfundidade(): void {
        if (!modelo || !ramoPrincipal || !plano) return;
        // A versão nova do cofre pode tirar um nó da pilha: ela volta até o que ainda existe.
        while (nav.pilha.length && !ramoDe(nav.pilha[nav.pilha.length - 1].id)) nav = voltarAte(nav, nav.pilha.length - 1);
        const emRamo = nav.pilha.length > 0;
        root.setAttribute('data-nivel', nav.nivel);
        root.classList.toggle('em-ramo', emRamo);
        const emSistema = !emRamo && nav.nivel === 'sistema';
        map.hidden = emRamo || emSistema;
        mapbar.hidden = emRamo || emSistema;
        ramoVista.hidden = !emRamo;
        sistemaVista.hidden = !emSistema;
        if (emSistema) pintarSistema(); else sistemaVista.replaceChildren();
        if (emSistema) pind.hidden = true;
        if (emRamo) pind.hidden = true;
        const longo = nav.nivel === 'longo-prazo' ? colunaDoHorizonte(ramoPrincipal, plano) : null;
        map.classList.toggle('longo', !!longo);
        for (const c of Array.from(map.querySelectorAll('[data-col]')) as HTMLElement[]) c.classList.toggle('foco-longo', !!longo && c.getAttribute('data-col') === longo.coluna);
        nivelChip.hidden = nav.nivel !== 'longo-prazo';
        if (!nivelChip.hidden) {
            // O longo prazo é o período da visão (os anos que o horizonte dela cobre).
            const p = periodoDaVisao(modelo.visao, modelo.hoje);
            nivelChip.textContent = PINCA.longoPrazoDe(p.de, p.ate);
            marcarDica(nivelChip, PINCA.dicaLongoPrazo(plano.colunas.find(c => c.id === longo?.coluna)?.rotulo ?? PINCA.longoPrazo, p.de, p.ate, modelo.visao.horizonte));
        }
        pintarRamo();
    }
    /**
     * A linha do ECH de cada trimestre do sistema, lida pela borda (`nucleo.ech`), uma vez por versão do
     * cofre: `undefined` = lendo; `null` = sem a leitura. Só os `ECH_DO_SISTEMA` trimestres mais novos
     * pedem a leitura (cada uma lê notas do cofre); os outros mostram só as contas.
     */
    const echs = new Map<string, string | null | undefined>();
    let sistemaAgendado = false;
    /** O que faz: desenha o nível Sistema (a linha dos anos e dos trimestres) e pede a linha do ECH dos mais novos. */
    function pintarSistema(): void {
        if (!modelo) return;
        const linha = modelo.sistema();
        const recentes = new Set(linha.anos.flatMap(a => [...a.trimestres].reverse()).map(q => q.chave).slice(0, ECH_DO_SISTEMA));
        const ech = (chave: string): string | null | undefined => {
            if (!adaptador.echDoPeriodo || !recentes.has(chave)) return null;
            if (!echs.has(chave)) {
                echs.set(chave, undefined);
                void adaptador.echDoPeriodo(chave).then(t => { echs.set(chave, typeof t === 'string' ? t : null); }, () => { echs.set(chave, null); }).then(() => {
                    if (sistemaAgendado || destruido) return;
                    sistemaAgendado = true;
                    raf(() => { sistemaAgendado = false; if (!destruido && !sistemaVista.hidden) pintarSistema(); });
                });
            }
            return echs.get(chave);
        };
        // O cartão do trimestre é o do mapa (o cartão único, com o nó do modelo e a interação dele).
        sistemaVista.replaceChildren(sistemaEl(contexto(), linha, ech, tela.selecionado));
    }
    /** O que faz: desenha a vista do ramo do topo da pilha (só pelo `modelo.ramo`), com o caminho do zoom e a formação. */
    function pintarRamo(): void {
        const topo = nav.pilha[nav.pilha.length - 1];
        const ramo = topo ? ramoDe(topo.id, topo.profundidade) : null;
        if (!ramo || !modelo || !ramoPrincipal) { ramoVista.replaceChildren(); ultimoMapa = null; return; }
        // O período de onde se partiu: o zoom nele é a raiz, uma parte só (02/11).
        const idDoInicio = nav.nivel === 'longo-prazo' || nav.nivel === 'sistema' ? null : idDoPeriodo(tela.escala, tela.foco);
        const partes = migalhasDoZoom(nav, rotuloDoInicio(), id => (id === ramo.id ? ramo.titulo : ramoDe(id)?.titulo ?? null), idDoInicio);
        const ativo = doc.activeElement as HTMLElement | null;
        const focado = ativo && ramoVista.contains(ativo) ? ativo.getAttribute('data-node') ?? ativo.getAttribute('data-act') : null;
        // O cartão de cada nó é o do mapa (o cartão único, `noEl`, com o nó do modelo e a interação dele).
        const ctx = { ...contexto(), selecionado: tela.selecionado, cursor: cursorDoRamo.cursor };
        // O quanto à vista é do ramo (02/11); o "mais conexões" soma ao dele o que o cursor já abriu.
        const disposicao = disposicaoDoRamo(ramo);
        const visiveis = disposicao.aVista + Math.max(0, cursorDoRamo.visiveis - CONEXOES_A_VISTA);
        const mapa = mapaDoRamo(ramo, visiveis, cursorDoRamo.abertos, id => modelo!.no(id), disposicao);
        ultimoMapa = mapa;
        // A rolagem de quem está rolando fica onde está (02/11: a rolagem vertical travava):
        // trocar o conteúdo da vista a levava de volta ao topo e à esquerda a cada pintura (o texto que chega, a
        // versão nova do cofre, o expandir), no meio do gesto.
        const rolagem = { left: ramoVista.scrollLeft, top: ramoVista.scrollTop };
        ramoVista.replaceChildren(ramoEl(ctx, mapa, partes, formacaoDoRamo(ramo)));
        // Um centro novo (outro nó, ou mais fundo): a vista começa com ele no meio, nos dois eixos; o mesmo
        // centro volta à rolagem de antes.
        const chave = `${topo!.id}|${topo!.profundidade}`;
        if (chave !== ramoCentrado) { ramoCentrado = chave; centrarRamo(); }
        else { ramoVista.scrollLeft = rolagem.left; ramoVista.scrollTop = rolagem.top; }
        if (focado) (ramoVista.querySelector(`[data-node="${cssEsc(focado)}"], [data-act="${cssEsc(focado)}"]`) as HTMLElement | null)?.focus({ preventScroll: true } as FocusOptions);
        // A vista só vai até o cartão da vez quando o passo o pediu (a seta do teclado): pintar de novo (o texto que
        // chega, a versão nova do cofre, as curvas) nunca mexe na rolagem de quem está rolando (02/11).
        if (levarAoCursor) { levarAoCursor = false; (ramoVista.querySelector('.n-ramo.cursor') as HTMLElement | null)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }
        // As curvas depois do layout, pelo agendador de todas (uma de cada cartão até o de onde ele sai).
        curvas.pedir();
    }
    /**
     * O que faz: expande ou recolhe um nó (30/10; o mapa principal, 02/11): guarda no estado da vista, pela
     * raiz do ramo do zoom ou pela chave do mapa principal, pinta de novo com o que ele tem abaixo, ou sem,
     * e avisa o lugar (a aba guarda).
     */
    function alternarExpansao(id: string, estavaAberto: boolean): void {
        if (!id) return;
        const topo = nav.pilha[nav.pilha.length - 1];
        const chave = topo ? topo.id : EXPANSAO_DO_MAPA;
        expansao = { ...expansao, [chave]: { ...(expansao[chave] ?? {}), [id]: !estavaAberto } };
        if (topo) { pintarRamo(); avisar(); } else pintar();
    }
    /** O centro em que a vista do ramo se centrou por último (o nó e a profundidade). */
    let ramoCentrado = '';
    /** O que faz: rola a vista do ramo para o cartão do centro ficar no meio dela, na horizontal e na vertical. */
    function centrarRamo(): void {
        const c = ramoVista.querySelector('.ramo-centro-no');
        if (!c) return;
        const v = ramoVista.getBoundingClientRect(), r = c.getBoundingClientRect();
        if (!v.width || !v.height || !r.width) return;
        ramoVista.scrollLeft = Math.max(0, Math.round(ramoVista.scrollLeft + (r.left + r.width / 2) - (v.left + v.width / 2)));
        ramoVista.scrollTop = Math.max(0, Math.round(ramoVista.scrollTop + (r.top + r.height / 2) - (v.top + v.height / 2)));
    }
    /** O que faz: a rolagem vertical no ramo: anda pela formação do nó (o tempo ou a cadeia), sem entrar mais fundo. */
    function passoVerticalNoRamo(sentido: 1 | -1): void {
        const topo = nav.pilha[nav.pilha.length - 1];
        const ramo = topo ? ramoDe(topo.id, topo.profundidade) : null;
        if (!ramo || !modelo) return;
        const vizinho = vizinhoNaFormacao(formacaoDoRamo(ramo), ramo, sentido, modelo, id => !!ramoDe(id));
        if (!vizinho) return;
        nav = comTopo(nav, vizinho);
        cursorDoRamo = CURSOR_INICIAL;
        pintarRamo();
        avisar();
    }
    /** O passo do teclado pediu a vista até o cartão da vez (só ele; a pintura comum não rola nada). */
    let levarAoCursor = false;
    /** O que faz: o passo horizontal no ramo (as setas): anda pelas conexões do nível atual e abre mais quando passa do que se mostra. */
    function passoHorizontalNoRamo(sentido: 1 | -1): void {
        const topo = nav.pilha[nav.pilha.length - 1];
        const ramo = topo ? ramoDe(topo.id, topo.profundidade) : null;
        if (!ramo) return;
        cursorDoRamo = passoHorizontal(ramo, cursorDoRamo, sentido);
        levarAoCursor = true;
        pintarRamo();
    }

    function alternarTudo(): void {
        tela = alternarAbrirTudo(tela);
        pular = true;
        pintar();
    }

    /* ----------------------------------------------------------- busca */
    let achados: Achado[] = [];
    let achadoI = 0;
    function pintarAchados(): void {
        results.replaceChildren();
        if (!achados.length) {
            results.appendChild(el(doc, 'p', 'hint', null, q.value.trim() ? 'Nada encontrado. Tente um projeto, uma SMART, 29/10, W45 ou Q4.' : 'Digite um projeto, uma SMART, uma tarefa ou uma data.'));
            return;
        }
        achados.forEach((a, i) => {
            const b = botao(doc, null, null, { role: 'option', 'data-ri': String(i), 'aria-selected': String(i === achadoI) });
            b.append(el(doc, 'span', 'rk', null, a.tipo), el(doc, 'span', 'rt', null, a.titulo));
            results.appendChild(b);
        });
    }
    function buscar(): void {
        if (!modelo) return;
        const v = q.value.trim();
        achados = v ? modelo.buscar(v, tela.escala, 30) : [
            ...modelo.indice.centrais.map(c => modelo!.indice.projetos.get(`p:${fold(c)}`)).filter(Boolean).map(p => ({ id: p!.id, tipo: 'central', titulo: p!.nome, escala: tela.escala, chave: modelo!.linhaDoNo(p!.id, tela.escala) ?? chaveDeHoje(tela.escala, modelo!.hoje) })),
            { id: `d:${modelo.hoje}`, tipo: 'dia', titulo: `Hoje · ${diaDaSemana(modelo.hoje)} ${diaMes(modelo.hoje)}`, escala: 'dia' as Escala, chave: modelo.hoje },
        ];
        achadoI = 0;
        pintarAchados();
    }
    function abrirBusca(): void {
        fecharPops();
        search.hidden = false;
        q.value = '';
        buscar();
        q.focus();
    }
    function fecharBusca(): void { search.hidden = true; }

    /* ----------------------------------------------------------- a 💡 Captura */
    let capturando = false;
    function abrirCaptura(): void {
        if (!podeGravar() || !adaptador.gravar?.capturar) return;
        fecharPops();
        fecharBusca();
        capPop.hidden = false;
        bCaptura.setAttribute('aria-expanded', 'true');
        capIn.focus();
    }
    function fecharCaptura(): void {
        capPop.hidden = true;
        bCaptura.setAttribute('aria-expanded', 'false');
    }
    /** O que faz: captura o que se digitou pela função única; o aviso diz para onde foi. */
    function capturar(): void {
        const g = adaptador.gravar;
        if (!g?.capturar || capturando || !podeGravar()) return;
        capturando = true;
        void g.capturar(capIn.value).then(r => {
            toast(r.texto);
            if (r.ok) { capIn.value = ''; fecharCaptura(); root.focus(); } else capIn.focus();
        }).catch(e => { console.error('DFM Missão: a captura falhou', e); toast(`⚠️ Falha ao capturar: ${(e as Error)?.message ?? e}`); })
            .finally(() => { capturando = false; });
    }

    /* ----------------------------------------------------------- a gaveta do ciclo (P12b) */
    /*
     * Os botões do ciclo abrem o formulário do protocolo na gaveta larga (§5.5, protótipo 2209):
     * a linha do tempo fica à esquerda e continua viva (arrastar grava pela tabela das setas), o
     * plano do período fica no topo da gaveta, e cada campo abre com o valor e o porquê, pelas
     * funções do motor. Gravar roda o `run()` com as respostas; Abrir no protocolo roda passo a
     * passo, aberto com elas; Guardar rascunho usa o rascunho do motor. Fechar guarda o que se
     * escreveu até fechar a vista.
     */
    /** O que faz: a vista da gaveta para o que está escrito agora (`null` enquanto o motor lê). */
    const vistaDaGavetaAgora = (gv: EstadoDaGaveta): VistaDaGaveta | null => (gv.p ? vistaDaGaveta(gv.p, gv.digitadas, gv.opcoes, gv.pedido.lideres) : null);
    /**
     * O que faz: lê pelo motor as opções dos campos que pedem (as seleções, as notas do critério, as
     * candidatas do seletor, o texto de apoio do passo montado) e as guarda no mapa.
     */
    async function lerOpcoes(p: ProtocoloDaGaveta, digitadas: Record<string, unknown>, mapa: Map<string, OpcoesDoPasso>, lideres: readonly string[] = []): Promise<void> {
        for (let volta = 0; volta < 2; volta++) {
            const v = vistaDaGaveta(p, digitadas, mapa, lideres);
            const pedir = [...v.topo, ...v.resto].filter(c => !c.campo.opcoes && (c.campo.tipo !== 'texto' && c.campo.tipo !== 'texto_longo'));
            const lidas = await Promise.all(pedir.map(c => p.opcoes(c.campo.passo, v.respostas).catch(() => ({ lista: null, notas: null } as OpcoesDoPasso))));
            let mudou = false;
            pedir.forEach((c, i) => {
                if (JSON.stringify(mapa.get(c.campo.id) ?? null) !== JSON.stringify(lidas[i])) { mapa.set(c.campo.id, lidas[i]); mudou = true; }
            });
            if (!mudou) return;
        }
    }
    const lerOpcoesDaGaveta = (gv: EstadoDaGaveta) => (gv.p ? lerOpcoes(gv.p, gv.digitadas, gv.opcoes, gv.pedido.lideres) : Promise.resolve());
    /** O que faz: o valor de uma caixa da gaveta (as marcas de uma lista como o modal as dá, ou o texto). */
    function valorDaCaixa(alvo: HTMLElement, id: string): unknown {
        if (!alvo.hasAttribute('data-gv-lista')) return (alvo as HTMLInputElement).value;
        const marcadas = (Array.from(dbody.querySelectorAll(`input[data-gv="${cssEsc(id)}"][data-gv-lista]`)) as HTMLInputElement[]).filter(i => i.checked).map(i => i.value);
        return marcadas.length ? marcadas.join(', ') : 'Nenhum';
    }
    /** O que faz: lê o protocolo do botão pelo motor (de novo a cada versão do cofre) e redesenha. */
    function carregarGaveta(focar: boolean): void {
        const gv = gaveta;
        const g = adaptador.gravar;
        if (!gv || !g?.ciclo) return;
        const meu = ++gv.versao;
        void g.ciclo.abrir(gv.pedido.protocolo, gv.pedido.datas, gv.pedido.doBotao).then(async p => {
            if (gaveta !== gv || gv.versao !== meu) return;
            if (!p) { gv.falhou = true; pintarGaveta(false); return; }
            gv.p = p;
            await lerOpcoesDaGaveta(gv);
            if (gaveta !== gv || gv.versao !== meu) return;
            pintarGaveta(focar, !focar);
        }).catch(e => {
            console.error('DFM Missão: a gaveta não leu o protocolo', e);
            if (gaveta === gv) { gv.falhou = true; pintarGaveta(false); }
        });
    }
    /** O que faz: desenha a gaveta; `doCofre` = a versão nova do cofre (espera o campo em edição sair). */
    function pintarGaveta(focar: boolean, doCofre = false): void {
        const gv = gaveta;
        if (!gv || !modelo) return;
        const ativo = doc.activeElement as HTMLElement | null;
        if (doCofre && ativo && dbody.contains(ativo) && /^(input|select|textarea)$/i.test(ativo.tagName)) { gavetaPendente = true; return; }
        gavetaPendente = false;
        const vista = vistaDaGavetaAgora(gv);
        const f: FormDaGaveta = {
            modo: gv.pedido.modo === 'planejar' ? GAVETA.planejar : GAVETA.revisar, escala: gv.ciclo.escala, chave: gv.ciclo.chave,
            nome: gv.p?.nome ?? null, descricao: gv.p?.descricao ?? '', vista, passos: gv.p?.def?.steps ?? [], problemas: gv.problemas,
            comDestaque: gv.pedido.lideres.length > 0, restoAberto: gv.restoAberto, criar: gv.criar,
            contextos: (vocabularios()?.contextos ?? []).map(o => o.valor), falhou: gv.falhou,
        };
        const voltarCampo = ativo && dbody.contains(ativo) ? (ativo.getAttribute('data-gv') ?? null) : null;
        const voltarAct = ativo && dbody.contains(ativo) && !voltarCampo ? ativo.getAttribute('data-act') : null;
        const top = dbody.scrollTop;
        dbody.replaceChildren(conteudoDaGaveta(contexto(), f));
        drawer.setAttribute('aria-label', `${f.modo}: ${f.nome ?? GAVETA.carregando}`);
        dbody.scrollTop = top;
        if (focar && vista) {
            const primeiro = Object.keys(gv.problemas)[0];
            const alvo = (primeiro ? dbody.querySelector(`[data-gv="${cssEsc(primeiro)}"]`) : null) ?? dbody.querySelector('[data-form="gaveta"] [data-gv]');
            (alvo as HTMLElement | null)?.focus();
        } else if (voltarCampo) {
            const caixas = Array.from(dbody.querySelectorAll(`[data-gv="${cssEsc(voltarCampo)}"]`)) as HTMLInputElement[];
            (caixas.find(c => c.value === (ativo as HTMLInputElement).value) ?? caixas[0])?.focus();
        } else if (voltarAct) (dbody.querySelector(`[data-act="${cssEsc(voltarAct)}"]`) as HTMLElement | null)?.focus();
    }
    /** O que faz: abre a gaveta de um botão do ciclo (com o que estava escrito nele neste período). */
    function abrirGaveta(c: CicloDoPeriodo): void {
        const g = adaptador.gravar;
        if (!g || !modelo || !podeGravar()) return;
        const pedido = pedidoDoCiclo(c, modelo.hoje, idDoPapel);
        if (!g.ciclo || !pedido) { g.protocolo?.(c.protocolo, c.valores); return; }
        fecharPops();
        if (novo) { rascunhoDoNovo = rascunhoDe(novo); novo = null; novoPendente = false; }
        if (gaveta) guardarGaveta();
        aberto = null;
        trilha = [];
        const chave = chaveDoRascunho(c);
        const guardado = rascunhosDaGaveta.get(chave);
        gaveta = {
            ciclo: c, pedido, chave, p: null, falhou: false,
            digitadas: { ...(guardado?.digitadas ?? {}) }, criar: { ...(guardado?.criar ?? {}) }, restoAberto: !!guardado?.restoAberto, restoVisto: !!guardado?.restoAberto,
            problemas: {}, opcoes: new Map(), versao: 0, gravando: false,
        };
        const estava = !drawer.hidden;
        drawer.hidden = false;
        drawer.classList.add('wide');
        root.classList.add('plan-open');
        marcarGaveta();
        if (!estava) folha('full');
        scrim.hidden = !ehFolha();
        voltarAoNo = null;
        pintarGaveta(false);
        drawer.focus({ preventScroll: true } as FocusOptions);
        carregarGaveta(true);
        win.setTimeout(() => { atualizarHScroll(); centralizar(); curvas.agora(); }, 0);
        avisar();
    }
    /**
     * O que faz: abre um protocolo do nó (a seção Protocolos e o Ligar pelo dono do campo, a peça 2b) pela
     * mesma gaveta dos botões do ciclo, com as respostas do nó e as datas dele; sem a gaveta, passo a passo.
     */
    function abrirProtocoloDoNo(id: string, p: ProtocoloDoNo): void {
        const g = adaptador.gravar;
        if (!g || !modelo || !podeGravar()) return;
        const periodo = periodoDoId(id);
        const escala: Escala = periodo && !isChaveEspecial(periodo.chave) ? periodo.escala : 'dia';
        const chave = periodo && !isChaveEspecial(periodo.chave) ? periodo.chave : modelo.hoje;
        const nome = adaptador.nomeDoProtocolo?.(p.id) ?? p.id;
        const c: CicloDoPeriodo = {
            emoji: '', rotulo: nome, dica: nome, protocolo: p.id, ponta: p.papeis.includes('revisa') ? 'fim' : 'inicio',
            variaveis: {}, escala, chave, i: -1, valores: { ...p.valores },
        };
        if (g.ciclo) abrirGaveta(c);
        else g.protocolo?.(p.id, c.valores);
    }
    /** O que faz: guarda o que se escreveu na gaveta aberta (o rascunho em memória do botão). */
    function guardarGaveta(): void {
        const gv = gaveta;
        if (!gv) return;
        if (Object.keys(gv.digitadas).length || Object.keys(gv.criar).length) rascunhosDaGaveta.set(gv.chave, { digitadas: gv.digitadas, criar: gv.criar, restoAberto: gv.restoAberto });
        else rascunhosDaGaveta.delete(gv.chave);
    }
    /** O que faz: fecha a gaveta; `guardar` mantém o que se escreveu; o foco volta ao botão do ciclo. */
    function fecharGaveta(guardar: boolean): void {
        const gv = gaveta;
        if (!gv) return;
        if (guardar) guardarGaveta(); else rascunhosDaGaveta.delete(gv.chave);
        gaveta = null;
        gavetaPendente = false;
        drawer.hidden = true;
        drawer.classList.remove('wide');
        root.classList.remove('plan-open');
        marcarGaveta();
        scrim.hidden = true;
        const sel = `[data-act="ciclo"][data-escala="${cssEsc(gv.ciclo.escala)}"][data-chave="${cssEsc(gv.ciclo.chave)}"][data-i="${gv.ciclo.i}"]`;
        ((root.querySelector(sel) as HTMLElement | null) ?? root).focus({ preventScroll: true } as FocusOptions);
        win.setTimeout(() => { atualizarHScroll(); centralizar(); curvas.agora(); }, 0);
        avisar();
    }
    /** O que faz: a gaveta deixa o lugar para o painel do nó ou o Novo (o que se escreveu fica guardado). */
    function cederGaveta(): void {
        if (!gaveta) return;
        guardarGaveta();
        gaveta = null;
        gavetaPendente = false;
        drawer.classList.remove('wide');
        root.classList.remove('plan-open');
        marcarGaveta();
    }
    /** O que faz: o que a caixa de um campo da gaveta tem agora (as marcas de uma lista, ou o texto). */
    function anotarGaveta(alvo: HTMLElement): boolean {
        const gv = gaveta;
        if (!gv) return false;
        const criar = alvo.getAttribute('data-gv-criar');
        if (criar) {
            const { [criar]: _fora, ...resto } = gv.criar;
            gv.criar = (alvo as HTMLInputElement).checked ? { ...resto, [criar]: { contextos: gv.criar[criar]?.contextos ?? [] } } : resto;
            return true;
        }
        const onde = alvo.getAttribute('data-gv-onde');
        if (onde) {
            const marcados = (Array.from(dbody.querySelectorAll(`input[data-gv-onde="${cssEsc(onde)}"]`)) as HTMLInputElement[]).filter(i => i.checked).map(i => i.value);
            gv.criar = { ...gv.criar, [onde]: { contextos: marcados } };
            return true;
        }
        const id = alvo.getAttribute('data-gv');
        if (!id) return false;
        const valor = valorDaCaixa(alvo, id);
        const digitadas: Record<string, unknown> = { ...gv.digitadas, [id]: valor };
        // A nota escolhida leva o caminho dela (o `_path` que o seletor daria); outro nome, sem caminho.
        const nota = gv.opcoes.get(id)?.notas?.find(n => n.nome === String(valor).trim());
        if (nota) digitadas[`${id}_path`] = nota.caminho; else delete digitadas[`${id}_path`];
        gv.digitadas = digitadas;
        if (gv.problemas[id]) { const { [id]: _fora, ...resto } = gv.problemas; gv.problemas = resto; }
        return true;
    }
    /** O que faz: depois de uma escolha, as condições e as opções se releem, e a gaveta se redesenha. */
    function reabrirGaveta(): void {
        const gv = gaveta;
        if (!gv?.p) { pintarGaveta(false); return; }
        void lerOpcoesDaGaveta(gv).then(() => { if (gaveta === gv) pintarGaveta(false); }).catch(e => console.error('DFM Missão: as opções da gaveta não se leram', e));
        pintarGaveta(false);
    }
    const falhouNaGaveta = (e: unknown) => { console.error('DFM Missão: a gaveta não gravou', e); toast(`Não gravou: ${(e as Error)?.message ?? e}`); };
    /**
     * O que faz: "Gravar": confere (nada grava com problema), pede para conferir o resto recolhido
     * que tem valor sugerido, cria a nota do passo pedida, monta a rodada pelo formulário do motor e
     * roda o protocolo pelo `run()`.
     */
    async function gravarGaveta(): Promise<void> {
        const gv = gaveta;
        const p = gv?.p;
        if (!gv || !p || gv.gravando || !podeGravar()) return;
        const vista = vistaDaGaveta(p, gv.digitadas, gv.opcoes, gv.pedido.lideres);
        const problemas = conferirGaveta(p, vista);
        if (Object.keys(problemas).length) {
            gv.problemas = problemas;
            const id = Object.keys(problemas)[0];
            if (vista.resto.some(c => c.campo.id === id)) { gv.restoAberto = true; gv.restoVisto = true; }
            pintarGaveta(true);
            toast(problemas[id]);
            return;
        }
        const resumo = resumoDoResto(vista);
        if (gv.pedido.lideres.length && !gv.restoVisto && resumo.sugeridos > 0) {
            gv.restoAberto = true;
            gv.restoVisto = true;
            pintarGaveta(false);
            (dbody.querySelector('#gv-resto-campos [data-gv]') as HTMLElement | null)?.focus();
            toast(GAVETA.confiraResto(resumo.sugeridos));
            return;
        }
        gv.gravando = true;
        try {
            const criadas: Record<string, unknown> = {};
            for (const c of criacoesAoGravar(vista, gv.criar)) {
                const r = await p.criarNota(c.passo, c.titulo, variaveisDasDatas(gv.pedido.datas), c.contextos);
                if (!r) { toast(GAVETA.naoCriou(c.titulo)); return; }
                Object.assign(criadas, r.respostas);
            }
            const rodada = rodadaDaGaveta(p, vista, criadas, gv.pedido.datas);
            if ('problema' in rodada) { toast(rodada.problema); return; }
            const perguntas = vista.fora.length + vista.semResposta.length;
            if (gaveta === gv) fecharGaveta(false);
            toast(perguntas ? GAVETA.gravadoComPerguntas(p.nome, perguntas) : GAVETA.gravado(p.nome));
            await p.rodar(rodada.variaveis);
        } catch (e) { falhouNaGaveta(e); } finally { gv.gravando = false; }
    }
    /** O que faz: "Abrir no protocolo": passo a passo, cada passo aberto com o valor da gaveta. */
    function completoDaGaveta(): void {
        const gv = gaveta;
        const p = gv?.p;
        if (!gv || !p || !podeGravar()) return;
        const r = rodadaCompletaDaGaveta(p, vistaDaGaveta(p, gv.digitadas, gv.opcoes, gv.pedido.lideres), gv.pedido.datas);
        if ('problema' in r) { toast(r.problema); return; }
        fecharGaveta(false);
        toast(GAVETA.completoAberto(p.nome));
        void p.rodar(r.variaveis).catch(falhouNaGaveta);
    }
    /** O que faz: "Guardar rascunho": o rascunho do motor, com as respostas daqui. */
    function rascunhoDaGaveta(): void {
        const gv = gaveta;
        const p = gv?.p;
        if (!gv || !p || gv.gravando || !podeGravar()) return;
        const r = rodadaDaGaveta(p, vistaDaGaveta(p, gv.digitadas, gv.opcoes, gv.pedido.lideres), {}, gv.pedido.datas);
        if ('problema' in r) { toast(r.problema); return; }
        gv.gravando = true;
        void p.rascunho(r.variaveis).then(escrito => {
            if (!escrito) { toast(GAVETA.rascunhoVazio); return; }
            if (gaveta === gv) fecharGaveta(false);
            toast(GAVETA.rascunhoGuardado(p.nome));
        }).catch(falhouNaGaveta).finally(() => { gv.gravando = false; });
    }
    /** O que faz: os botões da gaveta (`gv-*`); `false` = não é dela. */
    function acaoDaGaveta(a: string): boolean {
        if (!gaveta || !a.startsWith('gv-')) return false;
        switch (a) {
            case 'gv-gravar': void gravarGaveta(); return true;
            case 'gv-completo': completoDaGaveta(); return true;
            case 'gv-rascunho': rascunhoDaGaveta(); return true;
            case 'gv-cancelar': fecharGaveta(false); return true;
            case 'gv-fechar': fecharGaveta(true); return true;
            case 'gv-resto': {
                gaveta.restoAberto = !gaveta.restoAberto;
                if (gaveta.restoAberto) gaveta.restoVisto = true;
                pintarGaveta(false);
                if (gaveta.restoAberto) (dbody.querySelector('#gv-resto-campos [data-gv]') as HTMLElement | null)?.focus();
                return true;
            }
        }
        return false;
    }

    /* ----------------------------------------------------------- o Novo (P8) */
    /*
     * O Novo (§4.3, §5.6): o formulário na gaveta, com o seletor de tipo do ramo e os campos
     * do modelo do tipo; cada valor sugerido diz o porquê; o problema aparece no campo, e nada
     * se grava com ele. A tarefa nasce pela API do TaskNotes (com a herança e o Desfazer); os
     * outros tipos, pelo protocolo dono, com as respostas daqui (o motor pergunta o que falta).
     */
    const extrasDoNovo = () => ({
        onde: onde ? (vocabularios()?.contextos ?? []).map(o => o.valor).find(v => ctxKey(v) === ctxKey(onde!)) ?? onde : null,
        contextos: (vocabularios()?.contextos ?? []).map(o => o.valor),
        camposDaNota: (c: string) => camposDaNota(c) as Record<string, unknown> | null,
        // A fonte `checklist` (30/10): as checagens da nota de função, pelo texto que o lugar lê sem pressa.
        checklist: (caminho: string) => {
            let alvo: string | null = caminho;
            if (!/\.md$/i.test(caminho)) { try { alvo = adaptador.resolverLink?.(caminho, '') ?? null; } catch (e) { alvo = null; } }
            if (alvo && !textos.has(alvo)) pedidasPeloNovo.add(alvo);
            const texto = alvo ? textoDaNota(alvo) : null;
            return alvo && texto !== null ? { nome: alvo.slice(alvo.lastIndexOf('/') + 1).replace(/\.md$/i, ''), itens: checagensDoTexto(texto) } : null;
        },
    });
    /** O leitor das listas do escolher (os modelos dos tipos, o frontmatter, o nome do arquivo e o recorte do ramo). */
    const leitorDoEscolher = (): LeitorDoEscolher => ({
        modelos: modelo?.indice.tabelas.tipos ?? [], camposDaNota: c => camposDaNota(c) as Record<string, unknown> | null,
        nomeDoArquivo: adaptador.gravar?.nomeDoArquivo ?? null, recorte: ramoPrincipal?.recorte ?? undefined,
        nomeDoProtocolo: id => { try { return adaptador.nomeDoProtocolo?.(id) ?? null; } catch (e) { return null; } },
    });
    /** O campo do "＋ Adicionar" de um Novo, pelo modelo do tipo da nota; `null` = não é o "＋ Adicionar". */
    const campoDoEstado = (n: EstadoDoNovo | null) => (n?.campo && modelo ? modelo.campoDoAdicionar(n.campo, leitorDoEscolher()) : null);
    /** Os tipos do Novo aberto: os do ramo; no "＋ Adicionar", só os do `alvo` do campo (pode não haver nenhum). */
    const tiposDoEstado = (n: EstadoDoNovo | null): TipoDoNovo[] => {
        if (!n?.campo) return tiposAgora();
        const campo = campoDoEstado(n);
        return campo ? tiposDoCampo(tiposAgora(), campo) : [];
    };
    const tipoDoNovo = (dominio: string, n: EstadoDoNovo | null = novo): TipoDoNovo | null => {
        const lista = tiposDoEstado(n);
        return lista.find(t => t.dominio === dominio) ?? lista[0] ?? null;
    };
    const candidatosDoNovo = (campo: DomainField) => (modelo ? candidatosDoCampo(modelo, campo, modelo.indice.tabelas.tipos ?? []) : []);
    const candidatoDoLink = (campo: DomainField, nomeDoLink: string) => candidatosDoNovo(campo).find(x => fold(x.nome) === fold(nomeDoLink)) ?? null;
    /** O protocolo dono do tipo, lido pelo motor (P12b), por protocolo e dia da rodada; `p` = `null` enquanto lê. */
    let donoDoNovo: { chave: string; p: ProtocoloDaGaveta | null; opcoes: Map<string, OpcoesDoPasso> } | null = null;
    /** O que faz: o protocolo dono pelo motor (pede a leitura uma vez; o Novo se redesenha quando ela chega). */
    function protocoloDono(tipo: TipoDoNovo, origem: OrigemDoNovo): ProtocoloDaGaveta | null {
        const g = adaptador.gravar;
        if (tipo.via !== 'protocolo' || !tipo.protocolo || !g?.ciclo || !modelo) return null;
        const l = origem.linha;
        const dia = (l && dataDoPeriodo(l.escala, l.chave, modelo.hoje)) || modelo.hoje;
        const chave = `${tipo.protocolo}|${dia}`;
        if (donoDoNovo?.chave === chave) return donoDoNovo.p;
        const lendo = { chave, p: null as ProtocoloDaGaveta | null, opcoes: new Map<string, OpcoesDoPasso>() };
        donoDoNovo = lendo;
        void g.ciclo.abrir(tipo.protocolo, { dia }, {}).then(async p => {
            if (donoDoNovo !== lendo || !p) return;
            lendo.p = p;
            await lerOpcoes(p, novo?.doDono ?? {}, lendo.opcoes);
            if (novo && donoDoNovo === lendo) pintarNovo(false, true);
        }).catch(e => console.warn('DFM Missão: o protocolo dono não se leu para o Novo', e));
        return null;
    }
    /** As regras do valor dos campos do tipo (o catálogo e os links que existem). */
    const regrasDoNovo = (tipo: TipoDoNovo, g: GravarDaMissao) => ({
        type: tipo.type ?? undefined, vocabularios: g.vocabularios(),
        existeNoCampo: (campo: DomainField, nome: string) => candidatosDoNovo(campo).some(x => fold(x.nome) === fold(nome)) || !!g.existe?.(nome),
    });
    /**
     * O que faz: as perguntas do protocolo dono que o modelo do tipo não tem, pelo formulário do
     * protocolo (P12b): abertas como o modal as abriria, com o que os campos do tipo já respondem.
     * `respostas` = as delas com que "Criar" roda (nada que o Novo não mostrou).
     */
    function perguntasDoDono(tipo: TipoDoNovo, entradas: Record<string, unknown>, n: EstadoDoNovo): { p: ProtocoloDaGaveta; vista: VistaDaGaveta; campos: VistaDaGaveta['topo']; respostas: Record<string, unknown> } | null {
        const g = adaptador.gravar;
        const p = protocoloDono(tipo, n.origem);
        if (!p || !g || !modelo || !donoDoNovo) return null;
        const conf = validarCampos(tipo.campos, entradas, regrasDoNovo(tipo, g), false);
        const base = respostasDoProtocolo(tipo, p.def?.steps ?? [], conf.valores, candidatoDoLink, n.origem, modelo.hoje, p.nome, 'criar').respostas;
        const doTipo = new Set(tipo.campos.map(x => x.passo).filter(Boolean) as string[]);
        const vista = vistaDaGaveta(p, { ...base, ...(n.doDono ?? {}) }, donoDoNovo.opcoes);
        const campos = [...vista.topo, ...vista.resto].filter(x => !doTipo.has(x.campo.id));
        const respostas: Record<string, unknown> = {};
        for (const x of campos) {
            if (vista.respostas[x.campo.id] !== undefined) respostas[x.campo.id] = vista.respostas[x.campo.id];
            if (vista.respostas[`${x.campo.id}_path`] !== undefined) respostas[`${x.campo.id}_path`] = vista.respostas[`${x.campo.id}_path`];
            const t = vista.titulos[x.campo.id];
            if (t && vista.respostas[t.chave] !== undefined) respostas[t.chave] = vista.respostas[t.chave];
        }
        return { p, vista, campos, respostas };
    }
    /** O que faz: anota o que se escreveu numa pergunta do protocolo dono. */
    function anotarDoDono(alvo: HTMLElement): void {
        const id = alvo.getAttribute('data-gv');
        if (!novo || !id) return;
        const valor = valorDaCaixa(alvo, id);
        const doDono: Record<string, unknown> = { ...(novo.doDono ?? {}), [id]: valor };
        const nota = donoDoNovo?.opcoes.get(id)?.notas?.find(x => x.nome === String(valor).trim());
        if (nota) doDono[`${id}_path`] = nota.caminho; else delete doDono[`${id}_path`];
        novo.doDono = doDono;
        if (novo.problemas[id]) { const { [id]: _fora, ...resto } = novo.problemas; novo.problemas = resto; }
    }
    /** O que faz: depois de uma escolha numa pergunta do dono, as opções se releem e o Novo se redesenha. */
    function reabrirDono(): void {
        const d = donoDoNovo;
        if (d?.p && novo) void lerOpcoes(d.p, novo.doDono ?? {}, d.opcoes).then(() => { if (novo && donoDoNovo === d) pintarNovo(false); }).catch(e => console.warn('DFM Missão: as opções do protocolo dono não se leram', e));
        pintarNovo(false);
    }
    /**
     * O que faz: as opções do "Escolher uma que já existe" para o tipo e a origem do Novo, pelo
     * `escolher` do ramo; `null` = o ramo não diz o que escolher faz aqui (o Novo só cria).
     */
    function listaDoEscolher(n: EstadoDoNovo, tipo: TipoDoNovo | null): ListaDoEscolher | null {
        if (!modelo || !ramoPrincipal || !podeGravar()) return null;
        // O "＋ Adicionar" de um campo: as notas do `alvo` dele, pelo gesto do campo.
        if (n.campo) return modelo.opcoesDoCampo(n.campo, leitorDoEscolher(), n.busca ?? '');
        const escolha = tipo ? escolhaDoNovo(ramoPrincipal, tipo.dominio, n.origem) : null;
        if (!escolha || !tipo) return null;
        return modelo.opcoesDeEscolher(escolha, tipo, n.origem, leitorDoEscolher(), n.busca ?? '');
    }
    /** O que faz: o texto da busca mudou: a lista se refaz, e, sem nada achado, o texto vira o título do "Criar nova". */
    function buscarNoNovo(texto: string): void {
        if (!novo) return;
        novo.busca = texto;
        novo.escolhaI = 0;
        const tipo = tipoDoNovo(novo.tipo);
        const lista = listaDoEscolher(novo, tipo);
        const titulo = lista && tipo ? tituloDaBusca(lista.total, texto) : null;
        const campo = titulo !== null && tipo ? campoDoTitulo(tipo, adaptador.gravar?.nomeDoArquivo ?? null) : null;
        if (campo && titulo !== null) {
            novo.digitadas = { ...novo.digitadas, [campo]: titulo };
            novo.digitados.add(campo);
        }
        pintarNovo(false);
    }
    /** O que faz: ↑ ↓ na busca: a opção da vez anda, sem sair da lista. */
    function andarNoEscolher(passo: number): void {
        if (!novo) return;
        const n = listaDoEscolher(novo, tipoDoNovo(novo.tipo))?.opcoes.length ?? 0;
        if (!n) return;
        novo.escolhaI = Math.min(n - 1, Math.max(0, (novo.escolhaI ?? 0) + passo));
        pintarNovo(false);
    }
    /**
     * O que faz: escolhe uma que já existe: o gesto de sempre (soltar sobre o nó pelo `mover`, ou
     * o campo do painel pelo `campo`), com o aviso e o Desfazer da pilha única; nada se cria.
     */
    function escolherNoNovo(i: number): void {
        if (!novo || !adaptador.gravar || !podeGravar()) return;
        const o = listaDoEscolher(novo, tipoDoNovo(novo.tipo))?.opcoes[i];
        if (!o) return;
        const n = novo;
        const daTriagem = n.triagem ?? null;
        void gravarEscolha(o.gesto, o.antes ?? null, 'Escolher', daTriagem ? avisoDaTriagem(daTriagem) : aviso).then(r => {
            if (daTriagem) depoisDaTriagem(daTriagem, r);
            if (!r?.ok) return;
            if (novo === n) { rascunhoDoNovo = null; fecharNovo(false); }
            if (o.no) pulsar(o.no);
        });
    }
    /**
     * O que faz: grava o gesto de uma escolha (o `mover` da tabela das setas, ou o campo do painel),
     * com o aviso e o Desfazer da pilha única; no campo de um valor só, o aviso diz o que estava.
     * `avisar` = o aviso de base (o da triagem, quando a escolha veio dela).
     */
    function gravarEscolha(gesto: GestoDaEscolha, antes: string | null, quem: string, avisar: Avisar = aviso): Promise<ResultadoDaGravacao | null> {
        const g = adaptador.gravar;
        if (!g) return Promise.resolve(null);
        const avisoDaTroca: Avisar = antes ? (texto, desfazer) => avisar(desfazer ? ADICIONAR.antes(texto, antes) : texto, desfazer) : avisar;
        // O campo do protocolo dono (30/10): abre o protocolo pela gaveta, com o passo já respondido; grava no Gravar dela.
        if (gesto.via === 'protocolo') {
            abrirProtocoloDoNo(gesto.no, { id: gesto.protocolo, papeis: ['campos'], porque: '', valores: { _context_date: modelo?.hoje ?? '', ...gesto.valores } });
            return Promise.resolve({ ok: true, texto: gesto.texto });
        }
        const feito = gesto.via === 'mover'
            ? g.mover(gesto.caminho, gesto.destino, avisoDaTroca)
            : g.campo(gesto.caminho, gesto.campo, gesto.valor, gesto.rotulo, avisoDaTroca, gesto.mostrado);
        return feito.catch(e => { console.error(`DFM Missão: o ${quem} não gravou`, e); toast(`Não mudou: ${(e as Error)?.message ?? e}`); return null; });
    }
    /**
     * A nota criada pelo "Criar nova" de um "＋ Adicionar", à espera de entrar no campo: o pai que é
     * nó espera a versão do cofre que traz a nota (até `TENTATIVAS_DA_NOTA_NOVA` leituras).
     */
    let criadaParaLigar: { campo: AdicaoAoCampo; nota: { nome: string; caminho: string | null }; tentativas: number; triagem: string | null } | null = null;
    const TENTATIVAS_DA_NOTA_NOVA = 6;
    /**
     * O que faz: liga a nota criada ao campo de onde o "＋ Adicionar" abriu, pelo mesmo gesto da
     * escolha (`gestoNoCampo`): o pai pelo arrasto, o resto pelo campo; com o aviso e o Desfazer.
     * Erro e ataque: a que já está no campo, ou cujo gesto tem problema, não grava, e o aviso diz;
     * a que o modelo ainda não leu espera a próxima versão do cofre.
     */
    function ligarCriada(): void {
        const p = criadaParaLigar;
        if (!p || !modelo || !adaptador.gravar || !podeGravar()) return;
        const campo = modelo.campoDoAdicionar(p.campo, leitorDoEscolher());
        if (!campo) { criadaParaLigar = null; return; }
        const r = modelo.gestoNoCampo(p.campo, campo, (camposDaNota(p.campo.nota) ?? {}) as Record<string, unknown>, p.nota);
        if ('problema' in r) {
            if (r.esperar && ++p.tentativas < TENTATIVAS_DA_NOTA_NOVA) return;
            criadaParaLigar = null;
            toast(ADICIONAR.naoEntrou(p.nota.nome, campo.rotulo, r.problema));
            return;
        }
        criadaParaLigar = null;
        const daTriagem = p.triagem;
        void gravarEscolha(r.gesto, r.antes, 'Adicionar', daTriagem ? avisoDaTriagem(daTriagem) : aviso).then(x => { if (daTriagem) depoisDaTriagem(daTriagem, x); });
    }
    /** O que faz: a nota nova chegou (o protocolo dono terminou, ou o TaskNotes criou): ela entra no campo. */
    function aoCriarNoCampo(campo: AdicaoAoCampo, nota: { nome: string; caminho: string | null }, triagem: string | null = null): void {
        criadaParaLigar = { campo, nota, tentativas: 0, triagem };
        ligarCriada();
    }
    /**
     * O que faz: o "＋ Adicionar" de um campo: o Novo aberto com a busca das notas do `alvo` e o "Criar nova" dos tipos dele;
     * `triagem` = o item da triagem de onde abriu (a escolha anda a triagem).
     */
    function abrirAdicionar(campo: AdicaoAoCampo, triagem: string | null = null): void {
        if (!podeGravar() || !modelo || !adaptador.gravar) { if (!podeGravar()) toast(motivoDaLeitura()); return; }
        const n: EstadoDoNovo = { tipo: '', origem: origemDoNovo(modelo, campo.no, { escala: tela.escala, chave: tela.foco }), digitadas: {}, digitados: new Set(), problemas: {}, campo, ...(triagem ? { triagem } : {}) };
        if (!campoDoEstado(n)) return;
        n.tipo = tiposDoEstado(n)[0]?.dominio ?? '';
        abrirNovoCom(n, campo.no);
    }
    /**
     * O que faz: o "Criar nova" pelo ramo (o tipo sem Novo, P9: a pessoa nova): o protocolo dono com
     * o texto da busca no passo do nome e o dia da origem; quando ele termina, a nota entra no campo.
     */
    function criarPeloRamo(): void {
        const g = adaptador.gravar;
        const n = novo;
        const campo = campoDoEstado(n);
        if (!g?.notaNova || !n?.campo || !campo || !modelo || !podeGravar()) return;
        const gesto = notaDoRamo(ramoPrincipal, n.campo.no, campo);
        if (!gesto) return;
        const nome = (n.busca ?? '').trim();
        if (!nome) { toast(ADICIONAR.escrevaONome(gesto.rotulo)); (dbody.querySelector('[data-escolher-busca]') as HTMLElement | null)?.focus(); return; }
        const l = n.origem.linha;
        const dia = (l && dataDoPeriodo(l.escala, l.chave, modelo.hoje)) || modelo.hoje;
        const alvo = n.campo;
        rascunhoDoNovo = null;
        fecharNovo(false);
        g.notaNova({ protocolo: gesto.protocolo, variaveis: { [gesto.passo]: nome, _context_date: dia }, passo: gesto.passo, nome }, nota => aoCriarNoCampo(alvo, nota, n.triagem ?? null));
    }
    /** O que faz: as sugestões e as entradas do Novo, com a herança da SMART que os valores ligam agora. */
    function calcularNovo(n: EstadoDoNovo): { tipo: TipoDoNovo; sugestoes: ReturnType<typeof sugestoesDoNovo>; entradas: Record<string, unknown>; smart: { nome: string; caminho: string } | null } | null {
        const tipo = tipoDoNovo(n.tipo);
        if (!tipo || !modelo) return null;
        const base = contextoDoNovo(modelo, n.origem, extrasDoNovo());
        const primeiro = entradasDoNovo(tipo, sugestoesDoNovo(tipo, base), n.digitadas);
        const smart = smartDosValores(modelo, primeiro, modelo.indice.tabelas.tipos ?? []);
        const ctx = { ...base, heranca: smart ? { nome: smart.nome, campos: (camposDaNota(smart.caminho) ?? {}) as Record<string, unknown> } : null };
        const sugestoes = sugestoesDoNovo(tipo, ctx);
        const entradas = entradasDoNovo(tipo, sugestoes, n.digitadas);
        return { tipo, sugestoes, entradas, smart: smartDosValores(modelo, entradas, modelo.indice.tabelas.tipos ?? []) };
    }
    /** O que faz: desenha o Novo; `doCofre` = a versão nova do cofre (espera o campo em edição sair). */
    function pintarNovo(focar: boolean, doCofre = false): void {
        if (!novo || !modelo) return;
        const ativo = doc.activeElement as HTMLElement | null;
        // O campo em edição não se perde com a versão nova do cofre: o Novo espera ele sair.
        if (doCofre && ativo && dbody.contains(ativo) && /^(input|select|textarea)$/i.test(ativo.tagName)) { novoPendente = true; return; }
        novoPendente = false;
        const c = calcularNovo(novo);
        const campoDoAdd = campoDoEstado(novo);
        // O "＋ Adicionar" sem tipo do Novo fica só com a busca (e o "Criar nova" pelo ramo).
        if (!c && !campoDoAdd) { fecharNovo(false); return; }
        if (c) novo = { ...novo, tipo: c.tipo.dominio };
        const f: FormDoNovo = {
            tipos: tiposDoEstado(novo), tipo: c?.tipo ?? null, entradas: c?.entradas ?? {}, digitados: novo.digitados, sugestoes: c?.sugestoes ?? {}, problemas: novo.problemas,
            origem: origemEmPalavras(modelo, novo.origem), candidatos: candidatosDoNovo,
            nomeDoProtocolo: c?.tipo.protocolo ? (adaptador.nomeDoProtocolo?.(c.tipo.protocolo) ?? null) : null,
            noTaskNotes: !!adaptador.gravar?.novo?.noTaskNotes,
            etiquetas: ramoPrincipal?.novo.etiquetas ?? [],
        };
        if (novo.campo && campoDoAdd) {
            const peloRamo = !c && adaptador.gravar?.notaNova ? notaDoRamo(ramoPrincipal, novo.campo.no, campoDoAdd) : null;
            f.adicionar = { rotulo: campoDoAdd.rotulo, peloRamo: peloRamo ? { rotulo: peloRamo.rotulo, dica: peloRamo.dica } : null };
        }
        const lista = listaDoEscolher(novo, c?.tipo ?? null);
        if (lista) f.escolher = { texto: novo.busca ?? '', opcoes: lista.opcoes, ativa: novo.escolhaI ?? 0, total: lista.total };
        const dono = c ? perguntasDoDono(c.tipo, c.entradas, novo) : null;
        if (dono) f.doProtocolo = { titulo: GAVETA.doProtocolo(dono.p.nome), campos: dono.campos, titulos: dono.vista.titulos, problemas: novo.problemas, contextos: (vocabularios()?.contextos ?? []).map(o => o.valor) };
        const voltar = ativo && dbody.contains(ativo) ? (ativo.getAttribute('data-act') ?? null) : null;
        const voltarCampo = ativo && dbody.contains(ativo) && !ativo.getAttribute('data-lista') ? ativo.getAttribute('data-novo') : null;
        const voltarDono = ativo && dbody.contains(ativo) && !ativo.hasAttribute('data-gv-lista') ? ativo.getAttribute('data-gv') : null;
        const voltarBusca = !!ativo && dbody.contains(ativo) && ativo.hasAttribute('data-escolher-busca');
        dbody.replaceChildren(conteudoDoNovo(contexto(), f));
        const busca = dbody.querySelector('[data-escolher-busca]') as HTMLInputElement | null;
        drawer.setAttribute('aria-label', f.adicionar ? `${ADICIONAR.titulo}: ${f.adicionar.rotulo}` : `Novo: ${c?.tipo.titulo ?? ''}`);
        if (focar) {
            const primeiro = Object.keys(novo.problemas)[0];
            // A busca vem primeiro (29/10), menos quando um campo tem problema.
            const alvo = (primeiro ? dbody.querySelector(`[data-novo="${cssEsc(primeiro)}"]`) : null)
                ?? busca
                ?? (Array.from(dbody.querySelectorAll('[data-novo]')) as HTMLInputElement[]).find(i => /^(input|textarea)$/i.test(i.tagName) && i.type !== 'checkbox' && !i.value)
                ?? (dbody.querySelector('[data-novo]') as HTMLElement | null);
            (alvo as HTMLElement | null)?.focus();
        } else if (voltarBusca && busca) {
            busca.focus();
            try { busca.setSelectionRange(busca.value.length, busca.value.length); } catch { /* a caixa sem seleção (o DOM falso) */ }
        } else if (voltarCampo) (dbody.querySelector(`[data-novo="${cssEsc(voltarCampo)}"]`) as HTMLElement | null)?.focus();
        else if (voltarDono) (dbody.querySelector(`[data-gv="${cssEsc(voltarDono)}"]`) as HTMLElement | null)?.focus();
        else if (voltar) (dbody.querySelector(`[data-act="${cssEsc(voltar)}"]`) as HTMLElement | null)?.focus();
    }
    /** O que faz: abre o Novo: num tipo e num nó (o "+ Nova ação" da SMART), ou o rascunho guardado, ou o primeiro tipo na linha em foco. */
    function abrirNovo(tipo: string | null, no: string | null, nome: { campo: string | null; valor: string } | null = null): void {
        if (!podeCriar() || !modelo) { if (!podeGravar()) toast(motivoDaLeitura()); return; }
        fecharPops();
        const foco = { escala: tela.escala, chave: tela.foco };
        // O nome já respondido (o "Criar a nota" do vínculo): no campo do título, ou no nome da nota.
        const t = tipo ? tipoDoNovo(tipo) : null;
        const campoDoNome = !nome || !t ? null : t.campos.some(c => c.campo.nome === nome.campo) ? nome.campo : t.campos.some(c => c.campo.nome === NOME_DA_NOTA) ? NOME_DA_NOTA : null;
        const digitadas: Record<string, unknown> = campoDoNome && nome ? { [campoDoNome]: nome.valor } : {};
        abrirNovoCom(!tipo && !no && rascunhoDoNovo
            ? rascunhoDoNovo
            : { tipo: tipo ?? tiposAgora()[0].dominio, origem: origemDoNovo(modelo, no, foco), digitadas, digitados: new Set(Object.keys(digitadas)), problemas: {} }, no);
    }
    /** O que faz: abre a gaveta com um Novo pronto (o de um tipo, o rascunho, ou o "＋ Adicionar" de um campo). */
    function abrirNovoCom(n: EstadoDoNovo, no: string | null): void {
        fecharPops();
        novo = n;
        rascunhoDoNovo = null;
        cederGaveta();
        aberto = null;
        trilha = [];
        const estava = !drawer.hidden;
        drawer.hidden = false;
        marcarGaveta();
        if (!estava) folha('full');
        scrim.hidden = !ehFolha();
        voltarAoNo = no;
        pintarNovo(true);
        avisar();
    }
    /** O que faz: fecha o Novo; `guardar` mantém o que foi escrito para o próximo "+ Novo". */
    function fecharNovo(guardar: boolean): void {
        if (!novo) return;
        rascunhoDoNovo = guardar ? rascunhoDe(novo) : null;
        novo = null;
        novoPendente = false;
        drawer.hidden = true;
        scrim.hidden = true;
        marcarGaveta();
        const no = voltarAoNo ? (track.querySelector(`[data-node="${cssEsc(voltarAoNo)}"]`) as HTMLElement | null) : null;
        (no ?? root).focus({ preventScroll: true } as FocusOptions);
        voltarAoNo = null;
    }
    /** O que faz: o que a caixa de um campo do Novo tem agora (as marcas de uma lista, ou o texto). */
    function lerCaixaDoNovo(alvo: HTMLElement): { nome: string; entrada: unknown } | null {
        const nome = alvo.getAttribute('data-novo');
        if (!nome) return null;
        const grupo = alvo.getAttribute('data-lista') ? (alvo.closest('.ctxs') as HTMLElement | null) : null;
        if (grupo) return { nome, entrada: (Array.from(grupo.querySelectorAll('input[data-lista]')) as HTMLInputElement[]).filter(i => i.checked).map(i => i.value) };
        return { nome, entrada: (alvo as HTMLInputElement).value };
    }
    function anotarNovo(alvo: HTMLElement, repintar: boolean): void {
        if (!novo) return;
        const lido = lerCaixaDoNovo(alvo);
        if (!lido) return;
        novo.digitadas = { ...novo.digitadas, [lido.nome]: lido.entrada };
        novo.digitados.add(lido.nome);
        if (novo.problemas[lido.nome]) { const { [lido.nome]: _fora, ...resto } = novo.problemas; novo.problemas = resto; }
        // A escolha que muda a herança (a SMART no campo de link) refaz as sugestões dos outros campos.
        if (repintar) pintarNovo(false);
    }
    function trocarTipoDoNovo(dominio: string): void {
        if (!novo || novo.tipo === dominio) return;
        const tipo = tipoDoNovo(dominio);
        if (!tipo) return;
        // O que já foi escrito nos campos que os dois tipos têm vai junto (o título, o onde).
        const nomes = new Set(tipo.campos.map(c => c.campo.nome));
        const digitadas = Object.fromEntries(Object.entries(novo.digitadas).filter(([k]) => nomes.has(k)));
        novo = { ...novo, tipo: dominio, digitadas, digitados: new Set([...novo.digitados].filter(k => nomes.has(k))), problemas: {}, doDono: {}, escolhaI: 0 };
        pintarNovo(false);
        (dbody.querySelector(`[data-act="novo-tipo"][data-tipo="${cssEsc(dominio)}"]`) as HTMLElement | null)?.focus();
    }
    /**
     * O que faz: grava o Novo. `criar` confere tudo (o obrigatório também) e cria pela via do
     * tipo; `completo` deixa o protocolo perguntar o que falta (o obrigatório vazio não para);
     * `tasknotes` abre o formulário nativo dele, preenchido.
     */
    function gravarNovo(modo: 'criar' | 'completo' | 'tasknotes'): void {
        const g = adaptador.gravar;
        if (!novo || !modelo || !g?.novo || !podeGravar()) return;
        const c = calcularNovo(novo);
        if (!c) return;
        const n = novo;
        const conf = validarCampos(c.tipo.campos, c.entradas, regrasDoNovo(c.tipo, g), modo === 'criar');
        const falhou = (problemas: Record<string, string>) => {
            n.problemas = problemas;
            pintarNovo(true);
            toast(Object.values(problemas)[0] ?? 'Confira os campos');
        };
        if (Object.keys(conf.problemas).length) { falhou(conf.problemas); return; }
        const erro = (e: unknown) => { console.error('DFM Missão: o Novo não gravou', e); toast(`Não criou: ${(e as Error)?.message ?? e}`); };
        if (c.tipo.via === 'tasknotes') {
            const smart = c.smart?.caminho ?? null;
            // As etiquetas do ramo (P10c): a tarefa nova fica à vista no ramo onde nasceu.
            conf.valores = comEtiquetas(conf.valores, ramoPrincipal?.novo.etiquetas ?? []);
            // A tarefa criada pelo "＋ Adicionar" de um campo entra nele (o gesto da escolha).
            const criada = (caminho: string) => { if (n.campo) aoCriarNoCampo(n.campo, { nome: caminho.slice(caminho.lastIndexOf('/') + 1).replace(/\.md$/, ''), caminho }, n.triagem ?? null); };
            if (modo === 'tasknotes') {
                if (!g.novo.noTaskNotes) return;
                fecharNovo(false);
                void g.novo.noTaskNotes(conf.valores, smart, aviso).then(r => { if (r?.ok && (r as any).caminho) { pulsar(`t:${(r as any).caminho}`); criada((r as any).caminho); } }).catch(erro);
                return;
            }
            void g.novo.tarefa(conf.valores, smart, aviso).then(r => {
                if (!r?.ok) return;
                if (novo === n) fecharNovo(false);
                if ((r as any).caminho) { pulsar(`t:${(r as any).caminho}`); criada((r as any).caminho); }
            }).catch(erro);
            return;
        }
        if (c.tipo.via === 'nota') {
            // A nota simples (30/10): o pedido pelo modelo, a gravação com o Desfazer; a criada pelo "＋ Adicionar" entra no campo.
            // A casa no módulo (02/11, a nota de função): a pasta da nota-índice que o campo aponta, e as subpastas dela.
            const doModulo = pastaDoModulo(c.tipo, conf.valores, candidatoDoLink);
            let subpastas: string[] = [];
            try { subpastas = doModulo ? g.novo.subpastas?.(doModulo) ?? [] : []; } catch (e) { subpastas = []; }
            const pedido = pedidoDaNota(c.tipo, conf.valores, doModulo ? { pasta: doModulo, subpastas } : null);
            if ('problema' in pedido) { toast(`Não criou: ${pedido.problema}`); return; }
            if (!g.novo.nota) { toast('Este lugar não cria a nota'); return; }
            void g.novo.nota(pedido, aviso).then(r => {
                if (!r?.ok) return;
                if (novo === n) fecharNovo(false);
                const caminho = (r as any).caminho as string | undefined;
                if (caminho) { pulsar(`n:${caminho}`); if (n.campo) aoCriarNoCampo(n.campo, { nome: caminho.slice(caminho.lastIndexOf('/') + 1).replace(/\.md$/, ''), caminho }, n.triagem ?? null); }
            }).catch(erro);
            return;
        }
        const protocolo = c.tipo.protocolo;
        // As perguntas do dono que o Novo mostrou (P12b): conferidas pelas funções do laço; "Criar" não grava com problema.
        const dono = perguntasDoDono(c.tipo, c.entradas, n);
        if (dono && modo === 'criar') {
            const doDono = new Set(dono.campos.map(x => x.campo.id));
            const problemas = Object.fromEntries(Object.entries(conferirGaveta(dono.p, dono.vista)).filter(([k]) => doDono.has(k)));
            if (Object.keys(problemas).length) { falhou(problemas); return; }
        }
        const passos = dono?.p.def?.steps ?? (protocolo ? g.novo.passos(protocolo) : null);
        if (!protocolo || !passos || !g.protocolo) { toast('O protocolo dono deste tipo não está carregado'); return; }
        const nome = adaptador.nomeDoProtocolo?.(protocolo) ?? protocolo;
        // "Criar" roda pelo formulário do motor (`_respondidos`: o opcional em branco não é perguntado
        // de novo); "Abrir o protocolo completo", com `_valoresIniciais` (todo passo aparece no modal).
        const r = respostasDoProtocolo(c.tipo, passos, conf.valores, candidatoDoLink, n.origem, modelo.hoje, nome, modo === 'completo' ? 'completo' : 'criar', dono?.respostas ?? {});
        if (Object.keys(r.problemas).length) { falhou(r.problemas); return; }
        fecharNovo(false);
        // Do vínculo sem nota (P10c): quando a nota chegar, o painel dela abre.
        const deVinculo = n.origem.no?.startsWith('c:') ? modelo.detalhe(n.origem.no) : null;
        if (deVinculo?.semNota) esperandoNota = { id: n.origem.no!, nome: deVinculo.semNota.nome };
        if (n.campo && g.notaNova) {
            // O "＋ Adicionar" de um campo: quando o protocolo dono termina, a nota nova entra no campo.
            // "Criar" confere o fim pelo título respondido; o passo a passo pode mudá-lo, e vale o protocolo.
            const titulo = campoDoTitulo(c.tipo, g.nomeDoArquivo ?? null);
            const passo = modo === 'criar' && titulo ? c.tipo.campos.find(x => x.campo.nome === titulo)?.passo ?? null : null;
            const nome = passo ? String(r.variaveis[passo] ?? '').trim() : '';
            const alvo = n.campo;
            g.notaNova({ protocolo, variaveis: r.variaveis, passo: nome ? passo : null, nome }, nota => aoCriarNoCampo(alvo, nota, n.triagem ?? null));
        } else g.protocolo(protocolo, r.variaveis as Record<string, string>);
        toast(modo === 'completo'
            ? `${nome}: passo a passo, aberto com o que estava aqui`
            : `${nome}: aberto com as respostas daqui; o que ficou em branco e é obrigatório ele pergunta`);
    }

    function irAchado(a: Achado): void {
        fecharBusca();
        const antes = tela.escala;
        tela = irParaAchado(tela, a);
        // Na mesma escala, a trilha desliza até a linha; noutra, entra; e o nó pulsa.
        if (tela.escala !== antes) pular = true;
        panY = null;
        pulsar(a.id);
        pintar();
        if (tela.escala !== antes) entrada();
        if (!periodoDoId(a.id)) abrirPainel(a.id);
        else root.focus();
    }
    on(q, 'input', () => buscar());
    on(q, 'keydown', (e: KeyboardEvent) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); achadoI = Math.min(achados.length - 1, achadoI + 1); pintarAchados(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); achadoI = Math.max(0, achadoI - 1); pintarAchados(); }
        else if (e.key === 'Enter') { e.preventDefault(); const a = achados[achadoI]; if (a) irAchado(a); }
    });

    /* ----------------------------------------------------------- legenda e menus */
    function pintarLegenda(): void {
        if (!modelo) return;
        const amostra = (cls: string, st: string, rotulo: string) => amostraEl(doc, `${cls} ${st}`, rotulo);
        const linha = (n: HTMLElement, txt: string) => { const r = el(doc, 'div', 'lg-row'); r.append(n, el(doc, 'span', null, null, txt)); return r; };
        const bloco = (t: string, ...filhos: HTMLElement[]) => { const d = el(doc, 'div'); d.appendChild(el(doc, 'h3', null, null, t)); const l = el(doc, 'div', 'list'); filhos.forEach(f => l.appendChild(f)); d.appendChild(l); return d; };
        const centrais = modelo.indice.centrais;
        legend.replaceChildren(
            bloco('Cor · ramo da missão',
                ...centrais.flatMap((c, i) => [
                    linha(amostra(`br-${i % CORES_DE_RAMO}`, 'st-open', c), 'central da Temporada'),
                    linha(amostra(`br-${i % CORES_DE_RAMO} aux`, 'st-open', 'auxiliar'), `auxiliar de ${c}, tom mais claro`),
                ]),
                linha(amostra('br-nb', 'st-open', 'fora'), 'fora da Temporada')),
            bloco('Preenchimento · estado',
                linha(amostra('br-nb', 'st-done', 'feita'), 'cheio: feita'),
                linha(amostra('br-nb', 'st-open', 'próxima'), 'contorno: a fazer (próxima, em curso, esperando)'),
                linha(amostra('br-nb', 'st-pend', 'pendente'), 'tracejado: pendente de antes'),
                linha(amostra('br-nb', 'st-some', 'algum dia'), 'contorno claro: algum dia'),
                linha(el(doc, 'span', 'tag-hoje', null, 'hoje'), 'o período de hoje')),
            bloco('Ligações', ...Object.entries(ramoPrincipal?.ligacoes ?? {}).map(([k, v]) => linha(el(doc, 'span', `lg-edge t-${v.traco}`, { 'aria-hidden': 'true' }), v.rotulo || k))),
            (() => {
                const d = el(doc, 'div');
                d.appendChild(el(doc, 'h3', null, null, 'Gestos'));
                d.appendChild(el(doc, 'p', 'hint', null, podeGravar()
                    ? 'Clique num nó para ver de onde vem e para onde vai. Arraste uma tarefa até um dia ou uma semana (muda a data), até um projeto (muda o projeto) ou até uma SMART (liga a ela); puxe a alça da SMART até uma ação para ligá-las; clique numa ligação e aperte Delete para desligar. Tudo isso também pelo painel do nó (Mover para…, Ligações). O aviso traz Desfazer.'
                    : 'Só leitura aqui: clique num nó para ver de onde vem e para onde vai; a roda e o ▲▼ andam no tempo; com a borboleta estreita, deslize de lado entre Trabalho, SMART, Centro e Tempo (Shift + roda).'));
                return d;
            })(),
            (() => {
                const d = el(doc, 'div');
                d.appendChild(el(doc, 'h3', null, null, 'Teclado'));
                const k = el(doc, 'div', 'keys');
                const teclas = [['↑ ↓', 'período seguinte ou anterior'], ['+ −', 'aproximar ou afastar a escala'], ['H', 'hoje'], ['E', 'abrir tudo'], ['/', 'buscar'], ['T', 'triagem'], ['N C', 'abrir a nota ou o canvas do nó escolhido'], ['Esc', 'fechar']];
                if (ramosParaEscolher.length > 1) teclas.push([TECLA_DOS_RAMOS, 'escolher o ramo']);
                if (podeGravar()) teclas.push(['Delete', 'desligar a ligação escolhida'], ['⌘Z', 'desfazer a última gravação']);
                for (const [a, b] of teclas) {
                    k.append(el(doc, 'kbd', null, null, a), el(doc, 'span', null, null, b));
                }
                d.appendChild(k);
                return d;
            })(),
        );
    }
    function alternarLegenda(): void {
        const abrir = legend.hidden;
        fecharPops();
        if (abrir) pintarLegenda();
        legend.hidden = !abrir;
        bLegenda.setAttribute('aria-expanded', String(abrir));
    }
    function pintarMenu(): void {
        menu.replaceChildren();
        const item = (attrs: Record<string, string>, txt: string, dica: string) => { const b = botao(doc, 'mi', txt, attrs); marcarDica(b, dica); menu.appendChild(b); return b; };
        item({ 'data-menu': 'tudo', 'aria-pressed': String(tela.abrirTudo) }, '⤢ Abrir tudo', 'Abrir tudo: abre todas as linhas da linha do tempo').classList.add('m-ph');
        item({ 'data-menu': 'legenda' }, '🗺️ Legenda', 'Legenda: cores, estados, gestos e teclas');
        item({ 'data-act': 'triagem', 'aria-pressed': String(!!triagem) }, '📥 Triagem', 'Triagem: o que ainda não tem lugar, um por vez (T)');
        if (podeCriar()) item({ 'data-act': 'novo' }, '+ Novo', `+ Novo: ${tiposAgora().map(t => t.rotulo).join(', ')}`);
        if (podeGravar() && adaptador.gravar?.capturar) item({ 'data-act': 'captura' }, '💡 Captura rápida', '💡 Captura rápida: anota uma ideia na Caixa de entrada, sem data');
        menu.appendChild(el(doc, 'div', 'mgrp', { role: 'presentation' }, 'Onde estou'));
        for (const [v, nome, txt] of ONDE) item({ 'data-here': v, 'aria-pressed': String(onde === v) }, v, `Onde estou: ${nome} — ${txt}`);
        if (adaptador.abrirEmOutraAba) item({ 'data-act': 'aba' }, '⤢ Abrir em outra aba', 'Abrir em outra aba: a Missão numa aba própria, no mesmo período');
        // O ramo (P10b, §3.8): a mesma Missão para outro planejamento, pelo título do arquivo dele.
        if (ramosParaEscolher.length > 1) {
            menu.appendChild(el(doc, 'div', 'mgrp', { role: 'presentation' }, 'Ramo'));
            for (const l of ramosParaEscolher) item({ 'data-ramo-principal': l.id, 'aria-pressed': String(l.id === ramoPrincipal?.id) }, l.titulo, `Ramo: ${l.titulo} — a mesma Missão, com o centro e as colunas deste ramo`);
        }
        menu.appendChild(el(doc, 'p', 'mnote', null, podeGravar() ? 'Grava no cofre · o aviso traz Desfazer · ⌘Z desfaz' : `Só leitura · ${motivoDaLeitura()}`));
    }
    /**
     * O que faz: o seletor dos ramos no título (G7, porta 2): o nome do ramo de agora num botão
     * que abre a lista de todas, quando há mais de uma; com uma só, o título como texto. E a trilha.
     * Por quê: o diagnóstico do painel do nó (29/10, C8): a escolha morava só no ⋯, que some na tela
     * larga; não havia como chegar à Viagem.
     */
    function pintarSeletor(): void {
        const nome = ramoPrincipal?.titulo ?? titulo.textContent ?? '';
        if (ramosParaEscolher.length > 1) {
            const b = botao(doc, 'ramo-sel', nome, { 'data-act': 'ramos', 'aria-haspopup': 'dialog', 'aria-expanded': String(!popRamos.hidden) });
            marcarDica(b, `Ramo: ${nome} · escolher outro ramo`, { tecla: TECLA_DOS_RAMOS });
            titulo.replaceChildren(b);
        } else titulo.textContent = nome;
        pintarTrilhaDosRamos();
    }
    /**
     * O que faz: a trilha dos ramos ao lado do seletor (G7): a de onde se veio (um botão que volta),
     * a de agora e o nó aberto ("Missão › Viagem › Vietnam"); sem troca, escondida.
     */
    function pintarTrilhaDosRamos(): void {
        const origem = origemDoRamo;
        trilhaDosRamos.hidden = !origem || !ramoPrincipal;
        if (!origem || !ramoPrincipal) { trilhaDosRamos.replaceChildren(); return; }
        const partes: HTMLElement[] = [];
        const volta = botao(doc, null, origem.titulo, { 'data-ramo-principal': origem.id });
        marcarDica(volta, `Voltar ao ramo ${origem.titulo}`);
        partes.push(volta, el(doc, 'span', 'sep', { 'aria-hidden': 'true' }, '›'), el(doc, 'span', 'tr-aqui', null, ramoPrincipal.titulo));
        const noAberto = aberto ? dbody.querySelector('.dr-title')?.textContent ?? '' : '';
        if (noAberto) partes.push(el(doc, 'span', 'sep', { 'aria-hidden': 'true' }, '›'), el(doc, 'span', 'tr-no', null, noAberto));
        trilhaDosRamos.replaceChildren(...partes);
    }
    /** O que faz: a lista dos ramos do seletor: o título e o que cada uma é; a de agora, marcada. */
    function pintarPopRamos(): void {
        popRamos.replaceChildren();
        for (const l of ramosParaEscolher) {
            const b = botao(doc, 'mi mi-ramo', null, { 'data-ramo-principal': l.id, 'aria-pressed': String(l.id === ramoPrincipal?.id) });
            b.appendChild(el(doc, 'span', 'mi-t', null, l.titulo));
            if (l.descricao) b.appendChild(el(doc, 'span', 'mi-d', null, l.descricao));
            marcarDica(b, `Ramo: ${l.titulo} — a mesma Missão, com o centro e as colunas deste ramo`);
            popRamos.appendChild(b);
        }
        popRamos.appendChild(el(doc, 'p', 'mnote', null, `${TECLA_DOS_RAMOS} abre esta lista · Esc fecha`));
    }
    /**
     * O que faz: o domínio do tipo de um nó (o lugar pelo modelo dele; a nota pelo modelo do tipo dela;
     * sem nota de um tipo, o que a Missão sabe do nó: a área pela pasta, o projeto e o departamento
     * pelo portfólio, a TaskNote pelo `type`, `dominioDoNo`).
     * Por quê: o ramo de Projetos (30/10): a área não tem modelo com campos e o departamento pode
     * não ter a nota no cofre (o de um submódulo), e os dois levam a ela pelo "Ver no ramo".
     */
    function tipoDoNo(id: string): string | null {
        if (!modelo) return null;
        const doLugar = modelo.lugarDoNo(id)?.dominio;
        if (doLugar) return doLugar;
        const nota = modelo.arquivos(id).nota;
        const daNota = nota ? modeloDaNota(nota, camposDaNota(nota), modelo.indice.tabelas.tipos ?? [])?.dominio ?? null : null;
        return daNota ?? modelo.dominioDoNo(id, { camposDaNota });
    }
    /**
     * O que faz: o ramo que amplia um nó (G7, porta 3: "Ver no ramo <Título>"), pelo que o ramo de
     * agora declara (`amplia` no lugar e nas colunas, `ramoQueAmplia`); só um ramo que existe.
     */
    function verNoRamo(id: string): { id: string; titulo: string } | null {
        if (!ramoPrincipal || !modelo) return null;
        const alvo = ramoQueAmplia(ramoPrincipal, { lugar: modelo.passagens.some(e => e.id === id), tipo: tipoDoNo(id) });
        const l = alvo ? ramosParaEscolher.find(x => x.id === alvo) : undefined;
        return l ? { id: l.id, titulo: l.titulo } : null;
    }
    /** O que faz: diz se o modelo de agora tem o nó (o painel dele abre com conteúdo). */
    function temNo(id: string): boolean {
        if (!modelo || !id) return false;
        const { indice } = modelo;
        return indice.porId.has(id) || indice.projetos.has(id) || indice.areas.has(id) || id === VISAO_ID || !!periodoDoId(id)
            || modelo.passagens.some(e => e.id === id) || !!modelo.lugarDoNo(id) || !!modelo.detalhe(id) || !!modelo.pessoa(id)
            || (id.startsWith('n:') && !!(() => { try { return adaptador.ligacoesDaNota?.(id.slice(2)); } catch (e) { return null; } })());
    }
    /**
     * O que faz: o nó levado no outro ramo: o mesmo id, quando ela o tem; o país sem nota pelo nó que
     * o ramo mostra (o vínculo dela, outro id para o mesmo país); senão o da nota ou o do nome.
     */
    function noNoRamo(no: NoParaLevar): string | null {
        if (!modelo) return null;
        const l = modelo.lugarDoNo(no.id);
        const paisSemNota = l && !l.cidade && !l.passagem && l.pais && !l.pais.nota ? l.pais.id : null;
        const candidatos = [paisSemNota, no.id, no.nota ? modelo.noDaNota(no.nota)?.id : null, modelo.noDoNome(no.titulo)?.id];
        return candidatos.find((x): x is string => !!x && temNo(x)) ?? null;
    }
    /**
     * O que faz: troca o ramo (P10b; G7, a função única das três portas: o ⋯, o seletor e a trilha
     * dos ramos, e o "Ver no ramo" do painel): lê a escolhida e o modelo dele e repinta no mesmo
     * período. Sem nó, o painel fecha; com o nó (a porta 3), o painel dele reabre no outro ramo,
     * achado pela nota ou pelo nome, quando ele existe lá.
     */
    function trocarRamo(id: string, no: NoParaLevar | null = null): void {
        if (!id || id === ramoPrincipal?.id) return;
        const antes = ramoPrincipal ? { id: ramoPrincipal.id, titulo: ramoPrincipal.titulo } : null;
        // A trilha dos ramos guarda o de partida; voltar a ela apaga a trilha.
        origemDoRamo = origemDoRamo?.id === id ? null : origemDoRamo ?? antes;
        ramoId = id;
        aberto = null;
        trilha = [];
        cederGaveta();
        tela = { ...tela, selecionado: null };
        drawer.hidden = true;
        scrim.hidden = true;
        marcarGaveta();
        // As linhas do ramo de antes saem: o outro ramo desenha outras colunas.
        for (const it of linhaEls.values()) it.el.remove();
        linhaEls.clear();
        void carregar().then(() => {
            const alvo = no ? noNoRamo(no) : null;
            if (alvo) irPara(alvo);
            avisar();
        });
    }
    function fecharPops(): void {
        menu.hidden = true;
        bMais.setAttribute('aria-expanded', 'false');
        popRamos.hidden = true;
        titulo.querySelector('.ramo-sel')?.setAttribute('aria-expanded', 'false');
        perpick.hidden = true;
        perbtn.setAttribute('aria-expanded', 'false');
    }
    function abrirPop(pop: HTMLElement, btn: HTMLElement): void {
        const estava = !pop.hidden;
        fecharPops();
        if (estava) return;
        if (pop === menu) {
            pintarMenu();
            // Os ramos se leem quando o ⋯ abre pela primeira vez; o menu se refaz quando chegam.
            if (!ramosParaEscolher.length && adaptador.ramosPrincipais) void adaptador.ramosPrincipais().then(ls => { ramosParaEscolher = ls; if (!menu.hidden) pintarMenu(); }).catch(e => console.warn('DFM Missão: os ramos não se listaram', e));
        }
        if (pop === popRamos) pintarPopRamos();
        pop.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        const rr = root.getBoundingClientRect(), b = btn.getBoundingClientRect();
        pop.style.top = `${b.bottom - rr.top + 6}px`;
        if (pop === menu) { pop.style.left = 'auto'; pop.style.right = `${Math.max(8, rr.right - b.right)}px`; }
        else if (pop === popRamos) { pop.style.right = 'auto'; pop.style.left = `${Math.max(8, b.left - rr.left)}px`; }
        else { pop.style.right = 'auto'; pop.style.left = `${Math.max(8, Math.min(b.left - rr.left, rr.width - pop.offsetWidth - 8))}px`; }
        (pop.querySelector('button') as HTMLElement | null)?.focus({ preventScroll: true } as FocusOptions);
    }

    /* ----------------------------------------------------------- as gravações (P6) */
    /** O que faz: grava uma intenção pronta; o problema vira aviso, sem gravar. */
    function gravarIntencao(i: IntencaoDaTela, depois?: (r: ResultadoDaGravacao) => void): void {
        const g = adaptador.gravar;
        if (!g || !podeGravar()) return;
        if ('problema' in i) { if (i.problema) toast(i.problema); return; }
        void g.mover(i.caminho, i.destino, aviso).then(r => { if (r?.ok) depois?.(r); }).catch(e => { console.error('DFM Missão: a gravação falhou', e); toast(`Não gravou: ${(e as Error)?.message ?? e}`); });
    }

    /* ----------------------------------------------------------- o pulso (P7c) */
    /** O nó que pulsa quando aparecer (depois de soltar, de uma busca): some sozinho em 6 s. */
    let pulsoPendente: { id: string; ate: number } | null = null;
    function pulsar(id: string): void {
        if (reduzido() || !id) return;
        pulsoPendente = { id, ate: agora() + 6000 };
    }
    /** O que faz: o nó pendente pulsa no acento, uma vez, se já está à vista (a linha em foco primeiro). */
    function pulsarSeVisivel(): void {
        const p = pulsoPendente;
        if (!p) return;
        if (agora() > p.ate) { pulsoPendente = null; return; }
        const sel = `[data-node="${cssEsc(p.id)}"]`;
        const n = (track.querySelector(`.row.focus ${sel}`) ?? track.querySelector(sel)) as HTMLElement | null;
        if (!n) return;
        pulsoPendente = null;
        n.classList.remove('pulso');
        void n.offsetWidth;
        n.classList.add('pulso');
        win.setTimeout(() => n.classList.remove('pulso'), 1900);
    }
    /**
     * O que faz: depois de soltar e gravar: a linha onde a tarefa caiu vem ao foco (na escala
     * de agora), e o nó pulsa quando a versão nova do cofre o puser lá.
     */
    function aposSoltar(id: string, alvoId: string | null): void {
        const per = alvoId ? periodoDoId(alvoId) : null;
        if (per && per.escala === tela.escala && !isChaveEspecial(per.chave) && per.chave !== tela.foco) { tela = { ...tela, foco: per.chave }; panY = null; }
        pulsar(id);
        pintar();
    }

    function desligarLigacao(l: { de: string; para: string; tipo: Ligacao['tipo'] }): void {
        if (!modelo) return;
        ligacaoEscolhida = null;
        gravarIntencao(intencaoDeDesligar(modelo, l));
        curvas.agora();
    }

    /** O que faz: o valor de um campo do painel, conferido pelo modelo do tipo; o problema aparece no campo. */
    function gravarCampo(alvo: HTMLElement): void {
        const g = adaptador.gravar;
        if (!g || !modelo || !podeGravar()) return;
        const nome = alvo.getAttribute('data-campo-edit') ?? '';
        const nota = alvo.getAttribute('data-path') ?? '';
        const fm = camposDaNota(nota) ?? {};
        const campo = modeloDaNota(nota, fm, modelo.indice.tabelas.tipos ?? [])?.campos.find(c => c.nome === nome);
        if (!campo) return;
        const grupo = alvo.getAttribute('data-lista') ? (alvo.closest('.ctxs') as HTMLElement | null) : null;
        const escolhida = grupo && String(alvo.tagName).toLowerCase() === 'select' ? (alvo as HTMLSelectElement).value : '';
        const entrada = grupo
            ? [...(Array.from(grupo.querySelectorAll('input[data-lista]')) as HTMLInputElement[]).filter(i => i.checked).map(i => i.value), ...(escolhida ? [escolhida] : [])]
            : (alvo as HTMLInputElement).value;
        const r = valorDoCampo(campo, entrada, { type: String(fm.type ?? ''), vocabularios: g.vocabularios(), existe: g.existe, nota: fm });
        const caixa = grupo ?? alvo;
        const erro = caixa.nextElementSibling;
        if (erro && erro.classList.contains('f-err')) erro.remove();
        if ('problema' in r) {
            caixa.setAttribute('aria-invalid', 'true');
            caixa.insertAdjacentElement('afterend', el(doc, 'p', 'f-err', { role: 'alert' }, r.problema));
            return;
        }
        caixa.removeAttribute('aria-invalid');
        const valor = 'valor' in r ? r.valor : null;
        void g.campo(nota, nome, valor, campo.rotulo, aviso, valorEmTexto(campo, valor, rotulosDoCatalogo(contexto())));
    }

    /** O que faz: os botões do painel do nó que gravam (as ações, o "Mover para…", as ligações). */
    function acaoDoPainel(a: string, act: HTMLElement): boolean {
        const g = adaptador.gravar;
        if (!g || !modelo || !podeGravar()) return false;
        const id = act.getAttribute('data-id') ?? '';
        const t = modelo.indice.porId.get(id);
        const tabela = modelo.indice.tabelas.tarefa;
        const campo = (nome: string) => (dbody.querySelector(`[data-input="${nome}"]`) as HTMLInputElement | null)?.value ?? '';
        switch (a) {
            case 'agora': if (t) g.fazerAgora(t.caminho, modelo.motivos(t.id) ?? undefined); return true;
            case 'concluir': if (t) void g.concluir(t.caminho, aviso); return true;
            // O menu de status (02/11): o mesmo do painel, do cartão (⋯ Status) e da tecla S.
            case 'status-menu': {
                // Do cartão: abre o painel do nó com o menu aberto.
                if (!dbody.contains(act) && id) {
                    menuStatus = { id, modo: 'aberto' };
                    tela = { ...tela, selecionado: id };
                    acender();
                    abrirPainel(id);
                    focarMenuDoStatus();
                    return true;
                }
                menuStatus = menuStatus && menuStatus.id === id ? null : { id, modo: 'aberto' };
                pintarPainel(false);
                if (menuStatus) focarMenuDoStatus();
                else (dbody.querySelector('[data-act="status-menu"]') as HTMLElement | null)?.focus();
                return true;
            }
            case 'status-ir': {
                const valor = act.getAttribute('data-valor') ?? '', caminho = act.getAttribute('data-path') ?? '', nomeDoCampo = act.getAttribute('data-campo');
                const titulo = modelo.no(id)?.titulo ?? t?.titulo ?? '';
                const rotulo = STATUS.gravado(act.getAttribute('data-rotulo') || valor, titulo);
                menuStatus = null;
                pintarPainel(false);
                if (!valor || !caminho) return true;
                if (t && act.getAttribute('data-conclui') === 'sim') void g.concluir(t.caminho, aviso);
                else if (t) void g.status(t.caminho, valor, aviso, rotulo);
                else if (nomeDoCampo) void g.campo(caminho, nomeDoCampo, valor, rotulo.split(':')[0], aviso, act.getAttribute('data-rotulo') ?? valor);
                return true;
            }
            case 'mover-para': {
                // O tempo da tarefa (02/11, um jeito por função): o "Mover para…" do painel, com o dia e a hora; do
                // cartão ou do ⋯ Status, abre o painel do nó e põe o foco na caixa do dia.
                menuStatus = null;
                if (!dbody.contains(act) && id) {
                    tela = { ...tela, selecionado: id };
                    acender();
                    abrirPainel(id);
                } else pintarPainel(false);
                const dia = dbody.querySelector('[data-input="mover-dia"]') as HTMLInputElement | null;
                if (dia) { dia.scrollIntoView?.({ block: 'center' }); dia.focus(); }
                return true;
            }
            case 'status-arquivar': {
                const caminho = act.getAttribute('data-path') ?? '';
                menuStatus = null;
                pintarPainel(false);
                if (g.arquivar && caminho) void g.arquivar(caminho, act.getAttribute('data-sim') !== 'nao', aviso, t?.titulo);
                return true;
            }
            case 'status-excluir': {
                menuStatus = { id, modo: 'confirmar' };
                pintarPainel(false);
                (dbody.querySelector('[data-act="status-excluir-nao"]') as HTMLElement | null)?.focus();
                return true;
            }
            case 'status-excluir-nao': {
                menuStatus = { id, modo: 'aberto' };
                pintarPainel(false);
                focarMenuDoStatus();
                return true;
            }
            case 'status-excluir-ok': {
                const caminho = act.getAttribute('data-path') ?? '';
                const titulo = modelo.no(id)?.titulo ?? t?.titulo ?? '';
                menuStatus = null;
                if (!g.excluir || !caminho) { pintarPainel(false); return true; }
                // A nota sai: o painel dela fecha (o Desfazer a traz de volta, e o clique no cartão reabre).
                fecharPainel();
                void g.excluir(caminho, aviso, titulo);
                return true;
            }
            case 'habito': {
                const caminho = act.getAttribute('data-habito') ?? '', dia = act.getAttribute('data-dia') ?? '';
                if (g.habito && caminho && dia) void g.habito(caminho, dia, aviso).catch(e => { console.error('DFM Missão: o hábito não gravou', e); toast(`Não gravou: ${(e as Error)?.message ?? e}`); });
                return true;
            }
            case 'criar': {
                const que = act.getAttribute('data-que') === 'canvas' ? 'canvas' : 'nota';
                if (g.criar && id) void g.criar(id, que).then(r => { if (r?.texto) toast(r.texto); }).catch(e => { console.error('DFM Missão: não criou', e); toast(`Não criou: ${(e as Error)?.message ?? e}`); });
                return true;
            }
            case 'mover': {
                const o = opcoesDeMover(modelo, id).find(x => x.id === act.getAttribute('data-opcao'));
                // A de algum dia que ganha um dia volta a ser a próxima (02/11: um jeito só, o "Mover para…").
                const aberta = valorDoEstado(tabela, 'aberta');
                if (t && o && o.destino.tipo === 'dia' && t.algumDia && aberta) { void g.novaData(t.caminho, o.destino.data, aberta, true, aviso); return true; }
                if (t && o) void g.mover(t.caminho, o.destino, aviso);
                return true;
            }
            case 'mover-dia': {
                const data = campo('mover-dia');
                if (!ehDia(data)) { toast('Escolha o dia'); return true; }
                const aberta = valorDoEstado(tabela, 'aberta');
                if (t && t.algumDia && aberta) { void g.novaData(t.caminho, data, aberta, true, aviso); return true; }
                gravarIntencao(intencaoDeSoltar(modelo, id, `d:${data}`));
                return true;
            }
            case 'mover-hora': {
                const hora = campo('mover-hora');
                if (t) void g.mover(t.caminho, { tipo: 'hora', hora: hora || null }, aviso);
                return true;
            }
            case 'tirar-hora': if (t) void g.mover(t.caminho, { tipo: 'hora', hora: null }, aviso); return true;
            case 'ligar-acao': {
                const alvo = campo('ligar-acao');
                if (alvo) gravarIntencao(intencaoDaAlca(modelo, id, alvo)); else toast('Escolha a ação');
                return true;
            }
            case 'desligar': {
                const de = act.getAttribute('data-de'), para = act.getAttribute('data-para'), tipo = act.getAttribute('data-tipo') as Ligacao['tipo'] | null;
                if (de && para && tipo) desligarLigacao({ de, para, tipo });
                return true;
            }
            case 'desligar-escolhida': if (ligacaoEscolhida) desligarLigacao(ligacaoEscolhida); return true;
            case 'feito-abrir': {
                // "＋ O que fiz" (P9): abre o formulário curto no painel do dia.
                const f = dbody.querySelector('[data-form="feito"]') as HTMLElement | null;
                if (!f) return true;
                f.hidden = !f.hidden;
                act.setAttribute('aria-expanded', String(!f.hidden));
                if (!f.hidden) (f.querySelector('[data-input="feito-titulo"]') as HTMLInputElement | null)?.focus();
                return true;
            }
            case 'feito-ok': {
                const dia = act.getAttribute('data-dia') ?? '';
                const form = act.closest('[data-form]') as HTMLElement | null;
                if (!g.registrarFeito || !dia || !form) return true;
                const registro: RegistroDoFeito = {
                    titulo: campo('feito-titulo'), dia, hora: campo('feito-hora') || null, projeto: campo('feito-projeto') || null,
                    onde: campo('feito-onde') || null, minutos: campo('feito-minutos') || null,
                };
                act.setAttribute('disabled', 'true');
                void g.registrarFeito(registro).then(r => {
                    act.removeAttribute('disabled');
                    form.querySelector('.f-err')?.remove();
                    if (!r.ok && !r.texto.startsWith('Criada')) { form.insertBefore(el(doc, 'p', 'f-err', { role: 'alert' }, r.texto), act); return; }
                    toast(r.texto);
                    for (const i of Array.from(form.querySelectorAll('input, select')) as HTMLInputElement[]) i.value = '';
                    form.hidden = true;
                }).catch(e => { act.removeAttribute('disabled'); console.error('DFM Missão: o registro não gravou', e); toast(`Não registrou: ${(e as Error)?.message ?? e}`); });
                return true;
            }
            case 'item-marcar':
            case 'item-ok': {
                // A checklist da tarefa (29/10): marcar o item, ou acrescentar um, só aquela linha da nota.
                const nota = act.getAttribute('data-path') ?? '';
                if (!g.checklist || !nota) return true;
                let gesto: GestoDaChecklist;
                if (a === 'item-marcar') gesto = { via: 'marcar', linha: Number(act.getAttribute('data-linha')), feito: act.getAttribute('data-feito') === 'sim', texto: act.getAttribute('data-texto') ?? '' };
                else {
                    const input = dbody.querySelector('[data-input="item-texto"]') as HTMLInputElement | null;
                    gesto = { via: 'acrescentar', texto: input?.value ?? '' };
                }
                act.setAttribute('disabled', 'true');
                void g.checklist(nota, gesto, aviso).then(r => {
                    act.removeAttribute('disabled');
                    if (!r.ok) return;
                    textos.delete(nota);
                    pintarPainel(false);
                }).catch(e => { act.removeAttribute('disabled'); console.error('DFM Missão: a checklist não gravou', e); toast(`Não gravou: ${(e as Error)?.message ?? e}`); });
                return true;
            }
            case 'item-abrir': {
                // Do cartão (a interação): abre o painel do nó, e a caixa do item novo quando a checklist chegar.
                if (!dbody.contains(act) && id) {
                    itemDepois = id;
                    tela = { ...tela, selecionado: id };
                    acender();
                    abrirPainel(id);
                    abrirItemPedido();
                    return true;
                }
                // "+ Item": abre a caixa do item novo, embaixo da checklist.
                const f = dbody.querySelector('[data-form="item"]') as HTMLElement | null;
                if (!f) return true;
                f.hidden = !f.hidden;
                act.setAttribute('aria-expanded', String(!f.hidden));
                if (!f.hidden) (f.querySelector('[data-input="item-texto"]') as HTMLInputElement | null)?.focus();
                return true;
            }
            case 'adicionar': {
                // O "＋ Adicionar" de um campo de link (29/10): a busca do Novo e o "Criar nova" do alvo.
                const nota = act.getAttribute('data-path') ?? '', nome = act.getAttribute('data-adicionar') ?? '';
                const no = id || modelo.noDaNota(nota)?.id || '';
                if (nota && nome && no) abrirAdicionar({ no, nota, campo: nome });
                return true;
            }
            case 'informar-saldo': {
                const gesto = ramoPrincipal?.registro?.trimestre?.saldo;
                const nota = act.getAttribute('data-path') ?? '';
                const input = dbody.querySelector('[data-input="informar-valor"]') as HTMLInputElement | null;
                if (!g.campos || !gesto?.campo || !gesto.data || !nota || !input) return true;
                const fm = camposDaNota(nota) ?? {};
                const def = modeloDaNota(nota, fm, modelo.indice.tabelas.tipos ?? [])?.campos.find(c => c.nome === gesto.campo);
                const r = def ? valorDoCampo(def, input.value, { type: String(fm.type ?? '') }) : { ok: false as const, problema: `${gesto.rotulo}: o modelo da nota não tem o campo` };
                const erro = input.nextElementSibling;
                if (erro && erro.classList.contains('f-err')) erro.remove();
                const valor = 'valor' in r ? r.valor : null;
                if ('problema' in r || valor === null) {
                    input.setAttribute('aria-invalid', 'true');
                    input.insertAdjacentElement('afterend', el(doc, 'p', 'f-err', { role: 'alert' }, 'problema' in r ? r.problema : `${def?.rotulo ?? gesto.rotulo}: escreva o número`));
                    return true;
                }
                input.removeAttribute('aria-invalid');
                void g.campos(nota, { [gesto.campo]: valor, [gesto.data]: modelo.hoje }, `${gesto.rotulo}: ${valorEmTexto(def!, valor)}`, aviso);
                return true;
            }
            case 'atalho': {
                // O "＋ R$" do nó (P9): o painel do dia, com o campo do ramo em foco.
                const nome = act.getAttribute('data-campo') ?? '';
                if (!id || !nome) return true;
                tela = { ...tela, selecionado: id };
                acender();
                abrirPainel(id);
                const caixa = dbody.querySelector(`[data-campo-edit="${cssEsc(nome)}"]`) as HTMLInputElement | null;
                caixa?.focus();
                return true;
            }
            case 'protocolo-da-coluna': {
                // O vazio de uma coluna (P10b): o protocolo que cria o que falta, com a data da linha.
                const pid = act.getAttribute('data-protocolo') ?? '';
                const e = act.getAttribute('data-escala') as Escala, k = act.getAttribute('data-chave') ?? '';
                const data = ESCALAS.includes(e) ? dataDoPeriodo(e, k, modelo.hoje) : null;
                if (pid && g.protocolo) g.protocolo(pid, data ? { _context_date: data } : {});
                return true;
            }
            case 'protocolo-do-no': {
                // A seção Protocolos (a peça 2b): o protocolo com o contexto do nó já respondido, pela gaveta (ou passo a passo).
                const nid = act.getAttribute('data-id') ?? '';
                const p = (protocolosDoNoAgora(nid) ?? [])[Number(act.getAttribute('data-i'))];
                if (!p || p.id !== act.getAttribute('data-protocolo')) return true;
                abrirProtocoloDoNo(nid, p);
                return true;
            }
            case 'protocolo-do-sinal': {
                // O próximo passo de um sinal declarado no modelo do tipo (P10b): o protocolo, passo a passo.
                const pid = act.getAttribute('data-protocolo') ?? '';
                if (pid && g.protocolo) g.protocolo(pid, {});
                return true;
            }
            case 'oferta': {
                // A visão ainda não escrita (P10, §8.2): o 🔭 com as respostas que o modelo já dá.
                const o = modelo.visao.oferta;
                const pid = o ? idDoPapel(o.papel) : null;
                if (o && pid && g.protocolo) g.protocolo(pid, { ...o.variaveis });
                return true;
            }
            case 'ciclo': {
                // O botão do ciclo: o protocolo do ramo, com o contexto do período.
                const e = act.getAttribute('data-escala') as Escala, k = act.getAttribute('data-chave') ?? '';
                const c = ramoPrincipal && ESCALAS.includes(e) ? ciclosDoPeriodo(ramoPrincipal, e, k, modelo.hoje, adaptador.protocoloExiste)[Number(act.getAttribute('data-i'))] : undefined;
                // Com a gaveta (P12b), o formulário do protocolo; sem ela, passo a passo.
                if (c && g.ciclo) abrirGaveta(c);
                else if (c && g.protocolo) g.protocolo(c.protocolo, c.valores);
                return true;
            }
        }
        return false;
    }

    function desfazerUltima(): void {
        const g = adaptador.gravar;
        if (!g || !podeGravar()) return;
        void g.desfazer(aviso);
    }

    /* ----------------------------------------------------------- a triagem (P7) */
    /**
     * A tela da triagem (8.6): a prateleira do modelo, um item por vez, ao lado da linha do
     * tempo. Nada grava sozinho: só a tecla, o botão ou o arrasto do operador; e cada gravação
     * vai pelas mesmas do P6 (a tarefa pela tabela das setas; a nota, a ideia e o rascunho
     * pelas da triagem), com o aviso e o Desfazer da pilha única.
     */
    function pintarTriagem(): void {
        if (!modelo) return;
        const total = modelo.triagem.total;
        triN.textContent = total ? String(total) : '';
        bTri.setAttribute('aria-pressed', String(!!triagem));
        root.classList.toggle('triando', !!triagem);
        if (!triagem) { tri.hidden = true; tri.replaceChildren(); return; }
        const ativo = doc.activeElement as HTMLElement | null;
        // O campo em edição não se perde com a versão nova do cofre: a tela espera ele sair.
        if (triForm && ativo && tri.contains(ativo) && /^(input|select|textarea)$/i.test(ativo.tagName)) { triPendente = true; return; }
        triPendente = false;
        const foco = ativo && tri.contains(ativo) ? (ativo.getAttribute('data-tri-tecla') ?? ativo.getAttribute('data-tri-filtro') ?? null) : null;
        tri.hidden = false;
        tri.replaceChildren(conteudoDaTriagem({
            doc, modelo, estado: triagem, grava: podeGravar(), arrasta: podeArrastar(), destinoDaIdeia: ofereceDestinoDaIdeia(), motivo: adaptador.somenteLeitura, form: triForm,
            vocabularios: vocabularios(), marcar: (e, t, k) => { marcarDica(e, t, k ? { tecla: k } : {}); },
        }));
        const volta = foco !== null ? (tri.querySelector(`[data-tri-tecla="${cssEsc(foco)}"], [data-tri-filtro="${cssEsc(foco)}"]`) as HTMLElement | null) : null;
        if (volta) volta.focus();
        else if (ativo && !ativo.isConnected) tri.focus();
    }
    function abrirTriagem(): void {
        fecharPops();
        triagem = { ...TRIAGEM_INICIAL };
        triForm = null;
        pintarTriagem();
        tri.focus();
        win.setTimeout(() => { atualizarHScroll(); centralizar(); curvas.agora(); }, 0);
    }
    function fecharTriagem(): void {
        triagem = null;
        triForm = null;
        pintarTriagem();
        root.focus();
        win.setTimeout(() => { atualizarHScroll(); centralizar(); curvas.agora(); }, 0);
    }
    const itemDaTriagem = (): ItemDaTriagem | null => (modelo && triagem ? itemAtual(modelo.triagem, triagem) : null);
    /** O aviso da triagem: o toast; o Desfazer dele também devolve o item à vista. */
    const avisoDaTriagem = (id: string): Avisar => (texto, desfazer) => toast(texto, desfazer ? () => {
        desfazer();
        if (triagem) { triagem = depoisDoDesfazer(triagem, id); triForm = null; pintarTriagem(); }
    } : undefined);
    /** Depois de uma gravação que deu certo: o item fica tratado e o seguinte vem à vista. */
    function depoisDaTriagem(id: string, r: ResultadoDaGravacao | null | undefined): void {
        if (!r?.ok || !triagem || !modelo) return;
        triagem = depoisDoGesto(modelo.triagem, triagem, id);
        triForm = null;
        pintarTriagem();
    }
    const falhou = (e: unknown) => { console.error('DFM Missão: a triagem não gravou', e); toast(`Não gravou: ${(e as Error)?.message ?? e}`); };
    /** O que faz: grava uma intenção de soltar (dia, semana, projeto, SMART) para o item e anda. */
    function triarPorIntencao(item: ItemDaTriagem, i: IntencaoDaTela, depois?: () => void): void {
        const g = adaptador.gravar;
        if (!g) return;
        if ('problema' in i) { if (i.problema) toast(i.problema); return; }
        void g.mover(i.caminho, i.destino, avisoDaTriagem(item.id)).then(r => { depoisDaTriagem(item.id, r); if (r?.ok) depois?.(); }).catch(falhou);
    }
    /** O que faz: o status pela tabela de estados (algum dia, cancelada) para o item e anda. */
    function triarStatus(item: ItemDaTriagem, estado: 'algum_dia' | 'cancelada'): void {
        const g = adaptador.gravar;
        const v = modelo ? valorDoEstado(modelo.indice.tabelas.tarefa, estado) : null;
        if (!g || !v) return;
        void g.status(item.caminho, v, avisoDaTriagem(item.id), `${estado === 'algum_dia' ? 'Algum dia' : 'Cancelada'}: ${item.titulo}`).then(r => depoisDaTriagem(item.id, r)).catch(falhou);
    }
    /** O que faz: um campo da tarefa (onde, estimativa), conferido pelo modelo do tipo, e anda. */
    function triarCampo(item: ItemDaTriagem, nome: string, entrada: unknown): void {
        const g = adaptador.gravar;
        if (!g || !modelo) return;
        const fm = camposDaNota(item.caminho) ?? {};
        const campo = modeloDaNota(item.caminho, fm, modelo.indice.tabelas.tipos ?? [])?.campos.find(c => c.nome === nome);
        if (!campo) { toast('Este item não tem esse campo'); return; }
        const r = valorDoCampo(campo, entrada as any, { type: String(fm.type ?? ''), vocabularios: g.vocabularios(), existe: g.existe });
        if ('problema' in r) { toast(r.problema); return; }
        const valor = 'valor' in r ? r.valor : null;
        void g.campo(item.caminho, nome, valor, campo.rotulo, avisoDaTriagem(item.id), valorEmTexto(campo, valor, rotulosDoCatalogo(contexto()))).then(x => depoisDaTriagem(item.id, x)).catch(falhou);
    }
    /**
     * O que faz: o projeto ou a SMART do item (02/11, um jeito por função): o "＋ Adicionar" do campo do pai, o mesmo
     * do painel, só com as notas da espécie da tecla; a escolha grava pelo gesto de sempre e anda a triagem.
     */
    function adicionarNaTriagem(item: ItemDaTriagem, especie: string): void {
        if (!modelo) return;
        const adicao = modelo.adicaoDoPai(item.id, especie, leitorDoEscolher());
        if (!adicao) { toast(ADICIONAR.nadaParaEscolher); return; }
        triForm = null;
        pintarTriagem();
        abrirAdicionar(adicao, item.id);
    }
    /** O que faz: abre o formulário de uma escolha no item e põe o foco no primeiro campo. */
    function abrirForm(f: FormDaTriagem): void {
        triForm = f;
        pintarTriagem();
        (tri.querySelector('.tri-form input, .tri-form select, .tri-form button') as HTMLElement | null)?.focus();
    }
    /**
     * O que faz: executa a intenção da triagem para o item à vista. Andar (→ ←), abrir (Enter)
     * e desfazer valem sempre; o que grava só onde a Missão grava (no celular, o aviso diz).
     */
    function executarTriagem(i: IntencaoDaTriagem, item: ItemDaTriagem): void {
        if (!modelo || !triagem) return;
        const p = modelo.triagem;
        switch (i.tipo) {
            case 'pular': triagem = pularItem(p, triagem); triForm = null; pintarTriagem(); return;
            case 'voltar': triagem = voltarItem(p, triagem); triForm = null; pintarTriagem(); return;
            case 'abrir':
                if (item.tipo === 'acao' || item.tipo === 'smart') { tela = { ...tela, selecionado: item.id }; curvas.agora(); abrirPainel(item.id); }
                else if (item.caminho) adaptador.abrirNota(item.caminho);
                return;
            case 'desfazer':
                if (!podeGravar()) return;
                desfazerUltima();
                triagem = depoisDoDesfazer(triagem);
                triForm = null;
                pintarTriagem();
                return;
        }
        const g = adaptador.gravar;
        if (!g || !podeGravar()) { toast(adaptador.somenteLeitura || 'Aqui a triagem é só para ver'); return; }
        const t = g.triagem;
        switch (i.tipo) {
            case 'agendar': triarPorIntencao(item, intencaoDeSoltar(modelo, item.id, `d:${i.dia}`)); return;
            case 'semana': triarPorIntencao(item, intencaoDeSoltar(modelo, item.id, `w:${i.semana}`)); return;
            case 'escolher-dia': abrirForm('dia'); return;
            case 'escolher-pai': adicionarNaTriagem(item, i.especie); return;
            case 'escolher-onde': abrirForm('onde'); return;
            case 'estimar': abrirForm('estimativa'); return;
            case 'status': triarStatus(item, i.status === 'someday' ? 'algum_dia' : 'cancelada'); return;
            case 'ideia-destino':
                if (!t) return;
                void t.ideia(item.caminho, i.destino, null, avisoDaTriagem(item.id)).then(r => depoisDaTriagem(item.id, r)).catch(falhou);
                return;
            case 'caixa-destino': {
                if (!t) return;
                const destino = i.destino;
                void (async () => {
                    let pasta: string | null = null;
                    if (destino === 'project' || destino === 'resources') {
                        const projetos = [...modelo!.indice.projetos.values()].filter(x => !x.encerrado && x.pasta).map(x => ({ nome: x.nome, pasta: x.pasta }));
                        pasta = await t.escolherPasta(destino, projetos.sort((a, b) => a.nome.localeCompare(b.nome)));
                        if (!pasta) { toast('Nada foi movido: nenhuma pasta escolhida'); return; }
                    }
                    depoisDaTriagem(item.id, await t.caixa(item.caminho, destino, pasta, avisoDaTriagem(item.id)));
                })().catch(falhou);
                return;
            }
            case 'rascunho-arquivar':
                if (!t) return;
                void t.arquivarRascunho(item.caminho, avisoDaTriagem(item.id)).then(r => depoisDaTriagem(item.id, r)).catch(falhou);
                return;
            case 'rascunho-retomar':
                if (!t) return;
                void t.retomarRascunho(item.caminho, avisoDaTriagem(item.id)).then(r => depoisDaTriagem(item.id, r)).catch(falhou);
                return;
            case 'proposta': {
                const pr = g.propostas;
                if (!pr || !item.proposta) return;
                void pr[i.decisao](item.proposta.id, avisoDaTriagem(item.id)).then(r => depoisDaTriagem(item.id, r)).catch(falhou);
                return;
            }
        }
    }
    /** O que faz: o OK do formulário aberto (o dia, onde). */
    function confirmarForm(): void {
        const item = itemDaTriagem();
        if (!item || !modelo || !triForm) return;
        const valor = (n: string) => (tri.querySelector(`[data-tri-input="${n}"]`) as HTMLInputElement | null)?.value ?? '';
        if (triForm === 'dia') {
            const d = valor('dia');
            if (!ehDia(d)) { toast('Escolha o dia'); return; }
            triarPorIntencao(item, intencaoDeSoltar(modelo, item.id, `d:${d}`));
        } else if (triForm === 'onde') {
            const marcados = (Array.from(tri.querySelectorAll('input[data-tri-onde]')) as HTMLInputElement[]).filter(x => x.checked).map(x => x.getAttribute('data-tri-onde') ?? x.value);
            triarCampo(item, 'contexts', marcados);
        }
    }
    function teclaDaTriagem(ev: KeyboardEvent): boolean {
        if (!triagem || !modelo) return false;
        const item = itemDaTriagem();
        if (!item) return false;
        // Enter num botão é o clique dele (a ação, o filtro), não "abrir".
        if (ev.key === 'Enter' && String((ev.target as HTMLElement)?.tagName ?? '').toUpperCase() === 'BUTTON') return false;
        const i = intencaoDaTecla(ev.key, item, modelo.hoje, ev.metaKey || ev.ctrlKey, ofereceDestinoDaIdeia());
        if (!i) return false;
        ev.preventDefault();
        ev.stopPropagation();
        executarTriagem(i, item);
        return true;
    }

    /* ----------------------------------------------------------- o arrasto (P6, view/arrasto.ts) */
    /** As vistas com cartões à vista (o mapa, o ramo, o Sistema): onde o arrasto, a alça e o Ligar valem. */
    const superficies = (): HTMLElement[] => ([map.hidden ? null : track, ramoVista.hidden ? null : ramoVista, sistemaVista.hidden ? null : sistemaVista] as Array<HTMLElement | null>).filter((e): e is HTMLElement => !!e);
    /**
     * O modo Ligar e a escolha da ligação (view/interacao.ts): o "Ligar" do cartão, o clique no outro, a
     * alça solta no outro; o que grava vem do modelo (`ligacoesEntre`) e vai pela gravação de sempre.
     */
    const ligacoesEntre = (de: string, para: string) => (modelo && podeGravar() ? modelo.ligacoesEntre(de, para, leitorDoEscolher()) : null);
    const tituloDoNo = (id: string) => modelo?.no(id)?.titulo ?? id;
    const interacao = ligarInteracao({
        doc, root, superficies,
        ligacoes: ligacoesEntre,
        titulo: tituloDoNo,
        gravar: (o, _de, para) => { void gravarEscolha(o.gesto, o.antes, 'Ligar').then(r => { if (r?.ok) pulsar(para); }); },
        avisar: texto => toast(texto),
        marcar: (e, t) => { marcarDica(e, t); },
        on,
    });
    // As ferramentas do cartão: uma fila à vista por vez, no lugar dela debaixo do cartão (02/11).
    ligarFerramentas({ root, on });
    const arrasto = ligarArrasto({
        doc, root, app, track, tri, map, vp, linkLine, linkPath, dropTip, superficies,
        ligar: (de, para) => interacao.ligar(de, para),
        previaDoLigar: (de, para) => previaDoLigar(ligacoesEntre(de, para), tituloDoNo(de), tituloDoNo(para)),
        modelo: () => modelo, escala: () => tela.escala, destruido: () => destruido, podeArrastar, agora, raf, andar, on, itemDaTriagem,
        soltarIdeia: (item, smart) => {
            const t = adaptador.gravar?.triagem;
            if (t && ofereceDestinoDaIdeia()) void t.ideia(item.caminho, 'smart', smart, avisoDaTriagem(item.id)).then(r => depoisDaTriagem(item.id, r)).catch(falhou);
        },
        soltarNaTriagem: (id, item, onde) => {
            const alvo = item && item.id === id ? item : modelo?.indice.porId.get(id);
            if (alvo) triarStatus(item && item.id === id ? item : { id, tipo: 'acao', titulo: (alvo as any).titulo, caminho: (alvo as any).caminho, grupo: 'sem-data', marcas: [] }, onde === 'algum-dia' ? 'algum_dia' : 'cancelada');
        },
        triarPorIntencao, gravarIntencao, aposSoltar,
    });

    /* ----------------------------------------------------------- os campos do painel (P6) */
    on(root, 'change', (ev: Event) => {
        const t = ev.target as HTMLElement;
        if (t?.getAttribute?.('data-campo-edit') && dbody.contains(t)) gravarCampo(t);
        // A gaveta do ciclo: a escolha (e o texto, ao sair) relê as condições e as opções.
        else if (gaveta && dbody.contains(t) && (t?.hasAttribute?.('data-gv') || t?.hasAttribute?.('data-gv-criar') || t?.hasAttribute?.('data-gv-onde'))) { if (anotarGaveta(t)) reabrirGaveta(); }
        // O Novo: as perguntas do protocolo dono (P12b) relêem as condições e as opções.
        else if (novo && dbody.contains(t) && t?.hasAttribute?.('data-gv')) { anotarDoDono(t); reabrirDono(); }
        // O Novo: a escolha (lista, marca, link) refaz as sugestões; o texto só se anota.
        else if (t?.getAttribute?.('data-novo') && dbody.contains(t)) {
            const tag = String(t.tagName).toLowerCase();
            anotarNovo(t, tag !== 'input' || (t as HTMLInputElement).type === 'checkbox' || t.hasAttribute('list'));
        }
    });
    on(dbody, 'input', (ev: Event) => {
        const t = ev.target as HTMLElement;
        if (t?.getAttribute?.('data-novo')) anotarNovo(t, false);
        else if (novo && t?.hasAttribute?.('data-escolher-busca')) buscarNoNovo((t as HTMLInputElement).value);
        else if (gaveta && t?.hasAttribute?.('data-gv') && !t.hasAttribute('data-gv-lista')) anotarGaveta(t);
        else if (novo && t?.hasAttribute?.('data-gv') && !t.hasAttribute('data-gv-lista')) anotarDoDono(t);
    });
    on(dbody, 'focusout', () => {
        if (!painelPendente && !novoPendente && !gavetaPendente) return;
        win.setTimeout(() => {
            const ativo = doc.activeElement as HTMLElement | null;
            const digitando = ativo && dbody.contains(ativo) && /^(input|select|textarea)$/i.test(ativo.tagName);
            if (painelPendente && !digitando) pintarPainel(false);
            if (novoPendente && !digitando) pintarNovo(false, true);
            if (gavetaPendente && !digitando) pintarGaveta(false, true);
        }, 0);
    });

    on(tri, 'focusout', () => {
        if (!triPendente) return;
        win.setTimeout(() => {
            const ativo = doc.activeElement as HTMLElement | null;
            if (triPendente && !(ativo && tri.contains(ativo) && /^(input|select|textarea)$/i.test(ativo.tagName))) { triPendente = false; pintarTriagem(); }
        }, 0);
    });

    /* ----------------------------------------------------------- cliques */
    on(root, 'pointerdown', (ev: PointerEvent) => {
        const t = ev.target as HTMLElement;
        if (!t.closest?.('button, input, select, textarea, a, [tabindex]:not(.dfm-missao)')) root.focus({ preventScroll: true } as FocusOptions);
    });
    on(root, 'click', (ev: MouseEvent) => {
        const t = ev.target as HTMLElement;
        if (!t.closest) return;
        if (arrasto.suprimido() && (superficies().some(s => s.contains(t)) || tri.contains(t))) { arrasto.soltarSupressao(); return; }
        // O clique e a pinça são coisas diferentes (29/10): o toque que acabou de dar um nível não abre o painel.
        if (agora() - ultimaPinca < CLIQUE_DEPOIS_DA_PINCA && mapwrap.contains(t)) return;
        if (!legend.hidden && !t.closest('.legend') && !t.closest('.b-legenda') && !t.closest('[data-menu="legenda"]')) { legend.hidden = true; bLegenda.setAttribute('aria-expanded', 'false'); }
        if (!search.hidden && !t.closest('.search') && !t.closest('[data-act="search"]')) fecharBusca();
        if (!capPop.hidden && !t.closest('.captura') && !t.closest('[data-act="captura"]')) fecharCaptura();
        if (!t.closest('.menu, .perpick, .b-mais, .perbtn, .ramos, .ramo-sel')) fecharPops();
        const sc = t.closest('[data-scale]');
        if (sc) { irEscala(sc.getAttribute('data-scale') as Escala); return; }
        const cr = t.closest('[data-crumb]');
        if (cr) { fecharPops(); irPeriodo(cr.getAttribute('data-crumb') as Escala, cr.getAttribute('data-k') ?? ''); return; }
        const pn = t.closest('[data-pane]');
        if (pn && pind.contains(pn)) { ev.stopPropagation(); snapTo(pn.getAttribute('data-pane') ?? 'centro', true); return; }
        const ri = t.closest('[data-ri]');
        if (ri) { const a = achados[Number(ri.getAttribute('data-ri'))]; if (a) irAchado(a); return; }
        if (tri.contains(t)) {
            const fl = t.closest('[data-tri-filtro]');
            if (fl && triagem) { triagem = comFiltro(triagem, (fl.getAttribute('data-tri-filtro') || null) as FiltroDaTriagem); triForm = null; pintarTriagem(); return; }
            const ir = t.closest('[data-tri-ir]');
            if (ir && triagem) { triagem = { ...triagem, atual: ir.getAttribute('data-tri-ir') }; triForm = null; pintarTriagem(); return; }
            const item = itemDaTriagem();
            const tk = t.closest('[data-tri-tecla]');
            if (tk && item && modelo) { const i = intencaoDaTecla(tk.getAttribute('data-tri-tecla') ?? '', item, modelo.hoje, false, ofereceDestinoDaIdeia()); if (i) executarTriagem(i, item); return; }
            const est = t.closest('[data-tri-est]');
            if (est && item) { triarCampo(item, 'timeEstimate', est.getAttribute('data-tri-est') ?? ''); return; }
            if (t.closest('[data-tri-abrir]') && item) { executarTriagem({ tipo: 'abrir' }, item); return; }
            const ta = t.closest('[data-act]')?.getAttribute('data-act');
            if (ta === 'tri-fechar') { fecharTriagem(); return; }
            if (ta === 'tri-ok') { confirmarForm(); return; }
            if (ta === 'tri-cancelar') { triForm = null; pintarTriagem(); tri.focus(); return; }
        }
        const go = t.closest('[data-goto]');
        // Dentro do painel, a conexão navega (com a trilha); fora dele, vai até o nó.
        if (go) { if (dbody.contains(go)) navegar(go.getAttribute('data-goto') ?? ''); else irPara(go.getAttribute('data-goto') ?? ''); return; }
        const op = t.closest('[data-open]');
        if (op) {
            const path = op.getAttribute('data-path') ?? '';
            if (op.getAttribute('data-open') === 'tarefa') adaptador.abrirTarefa(path); else adaptador.abrirNota(path);
            return;
        }
        const hb = t.closest('[data-here]');
        if (hb) {
            const v = hb.getAttribute('data-here');
            onde = onde === v ? null : v;
            fecharPops();
            acender();
            if (aberto) pintarPainel(false);
            toast(onde ? `Onde estou: ${onde} · o que não dá para fazer daqui fica apagado` : 'Onde estou: todos os lugares');
            avisar();
            return;
        }
        // G7, porta 3: "Ver no ramo <Título>" leva o nó aberto junto, e o painel dele reabre lá.
        const vl = t.closest('[data-ver-ramo]');
        if (vl) {
            const id = vl.getAttribute('data-id') ?? '';
            fecharPops();
            trocarRamo(vl.getAttribute('data-ver-ramo') ?? '', id ? { id, titulo: dbody.querySelector('.dr-title')?.textContent ?? '', nota: modelo?.arquivos(id).nota ?? null } : null);
            return;
        }
        const lb = t.closest('[data-ramo-principal]');
        if (lb) { fecharPops(); trocarRamo(lb.getAttribute('data-ramo-principal') ?? ''); return; }
        const mi = t.closest('[data-menu]');
        if (mi) { fecharPops(); if (mi.getAttribute('data-menu') === 'tudo') alternarTudo(); else alternarLegenda(); return; }
        const hit = t.closest('[data-edge]');
        if (hit && podeGravar()) {
            const row = hit.closest('.row')?.getAttribute('data-row') ?? '';
            ligacaoEscolhida = { de: hit.getAttribute('data-a') ?? '', para: hit.getAttribute('data-b') ?? '', tipo: (hit.getAttribute('data-edge') ?? 'estrutura') as Ligacao['tipo'], row };
            tela = { ...tela, selecionado: ligacaoEscolhida.para };
            curvas.agora();
            toast('Ligação escolhida · Delete ou × desliga');
            return;
        }
        const act = t.closest('[data-act]');
        const a = act?.getAttribute('data-act');
        if (a === 'close') { fecharPainel(); return; }
        if (a === 'voltar') { voltar(); return; }
        if (a === 'trilha') { voltar(Number(act!.getAttribute('data-i'))); return; }
        // O caminho do zoom: cada parte volta com um clique; o "mais conexões" abre mais itens do nível.
        if (a === 'ramo-parte') { irNavegacao(voltarAte(nav, Number(act!.getAttribute('data-manter'))), AFASTA, null); return; }
        if (a === 'ramo-mais') { cursorDoRamo = maisConexoes(cursorDoRamo, ultimoMapa?.grupos ?? []); pintarRamo(); return; }
        if (a === 'ramo-expandir') { alternarExpansao(act!.getAttribute('data-id') ?? '', act!.getAttribute('data-aberto') === 'sim'); return; }
        if (a === 'ramo-grupo') { cursorDoRamo = abrirGrupo(cursorDoRamo, act!.getAttribute('data-grupo') ?? ''); pintarRamo(); return; }
        if (a && acaoDaGaveta(a)) return;
        if (a === 'novo') {
            ev.stopPropagation();
            // O "Criar a nota" do vínculo sem nota (P10c) já vem com o nome no campo do título.
            const campo = act!.getAttribute('data-campo'), valor = act!.getAttribute('data-valor');
            abrirNovo(act!.getAttribute('data-tipo'), act!.getAttribute('data-id'), valor ? { campo, valor } : null);
            return;
        }
        if (a === 'ligar') { ev.stopPropagation(); interacao.comecar(act!.getAttribute('data-id') ?? ''); return; }
        if (a === 'novo-tipo') { trocarTipoDoNovo(act!.getAttribute('data-tipo') ?? ''); return; }
        if (a === 'novo-escolher') { escolherNoNovo(Number(act!.getAttribute('data-i'))); return; }
        if (a === 'novo-criar') { gravarNovo('criar'); return; }
        if (a === 'adicionar-criar') { criarPeloRamo(); return; }
        if (a === 'novo-completo') { gravarNovo('completo'); return; }
        if (a === 'novo-tasknotes') { gravarNovo('tasknotes'); return; }
        if (a === 'novo-cancelar') { rascunhoDoNovo = null; fecharNovo(false); return; }
        if (a === 'novo-fechar') { fecharNovo(true); return; }
        if (a === 'desfazer-aviso') { const d = toastDesfazer; toastDesfazer = null; toastEl.hidden = true; d?.(); return; }
        if (a && acaoDoPainel(a, act as HTMLElement)) return;
        if (a === 'step') { andar(Number(act!.getAttribute('data-d')) > 0 ? 1 : -1); return; }
        if (a === 'today') { fecharPops(); irHoje(); return; }
        if (a === 'tudo') { alternarTudo(); return; }
        if (a === 'search') { ev.stopPropagation(); abrirBusca(); return; }
        if (a === 'legenda') { ev.stopPropagation(); alternarLegenda(); return; }
        if (a === 'captura') { ev.stopPropagation(); if (capPop.hidden) abrirCaptura(); else fecharCaptura(); return; }
        if (a === 'captura-ok') { capturar(); return; }
        if (a === 'triagem') { ev.stopPropagation(); if (triagem) fecharTriagem(); else abrirTriagem(); return; }
        if (a === 'mais') { ev.stopPropagation(); abrirPop(menu, bMais); return; }
        if (a === 'ramos') { ev.stopPropagation(); abrirSeletor(); return; }
        if (a === 'periodo') { ev.stopPropagation(); abrirPop(perpick, perbtn); return; }
        if (a === 'aba') { fecharPops(); adaptador.abrirEmOutraAba?.(estado()); return; }
        if (a === 'place-chip') { const id = pchip.getAttribute('data-node'); if (id) { tela = { ...tela, selecionado: id }; acender(); abrirPainel(id); } return; }
        const node = t.closest('[data-node]');
        if (node) {
            const id = node.getAttribute('data-node') ?? '';
            const row = node.closest('.row');
            if (row && row.classList.contains('compact')) { focarLinha(row.getAttribute('data-row') ?? ''); return; }
            if (dbody.contains(node)) { navegar(id); return; }
            tela = { ...tela, selecionado: id };
            curvas.agora();
            abrirPainel(id);
            return;
        }
        if (a === 'focus-row') { focarLinha(act!.getAttribute('data-row') ?? ''); return; }
        if (t.closest('.track') && tela.selecionado) { tela = { ...tela, selecionado: null }; curvas.agora(); }
    });
    on(scrim, 'click', () => fecharPainel());
    on(drawer, 'keydown', (ev: KeyboardEvent) => prenderTab(ev));
    on(toastEl, 'pointerenter', () => { toastParado = true; win.clearTimeout(toastTimer); });
    on(toastEl, 'pointerleave', () => { toastParado = toastEl.contains(doc.activeElement); if (!toastEl.hidden) contarAviso(4000); });
    on(toastEl, 'focusin', () => { toastParado = true; win.clearTimeout(toastTimer); });
    on(toastEl, 'focusout', () => { win.setTimeout(() => { toastParado = toastEl.contains(doc.activeElement) || toastEl.matches?.(':hover'); if (!toastEl.hidden) contarAviso(4000); }, 0); });
    function focarLinha(k: string): void {
        if (!k) return;
        tela = { ...tela, foco: k };
        panY = null;
        pintar();
    }

    /* ----------------------------------------------------------- passar o mouse (e o foco do teclado) */
    // Um realce só, o de view/interacao.ts, no mapa e em qualquer ramo; as ações à mão (a fila debaixo do
    // cartão) mantêm o nó aceso.
    ligarRealce({
        root, on,
        superficies: () => superficiesDasCurvas().map(s => ({ conteudo: s.conteudo, atributo: s.opcoes?.atributo ?? 'data-node' })),
        mudou: a => {
            const noMapa = a && track.contains(a.conteudo) ? a.ponta : null;
            const noRamo = a && !track.contains(a.conteudo) ? a.ponta : null;
            const mapaMudou = noMapa !== hover;
            hover = noMapa;
            hoverDoRamo = noRamo;
            if (mapaMudou && !tela.selecionado && tela.abrirTudo) curvas.agora();
            else acender();
        },
    });

    /* ----------------------------------------------------------- teclado (preso à raiz) */
    on(root, 'keydown', (ev: KeyboardEvent) => {
        const tag = String((ev.target as HTMLElement)?.tagName ?? '').toLowerCase();
        const digitando = tag === 'input' || tag === 'select' || tag === 'textarea';
        if (ev.key === 'Escape') {
            if (arrasto.ativo()) { arrasto.cancelar(); ev.stopPropagation(); return; }
            if (interacao.cancelar()) { ev.stopPropagation(); return; }
            if (ligacaoEscolhida) { ligacaoEscolhida = null; curvas.agora(); ev.stopPropagation(); return; }
            if (!menu.hidden || !perpick.hidden || !popRamos.hidden) { fecharPops(); ev.stopPropagation(); return; }
            if (!search.hidden) { fecharBusca(); root.focus(); ev.stopPropagation(); return; }
            if (!capPop.hidden) { fecharCaptura(); root.focus(); ev.stopPropagation(); return; }
            if (!legend.hidden) { legend.hidden = true; ev.stopPropagation(); return; }
            if (triagem && triForm) { triForm = null; pintarTriagem(); tri.focus(); ev.stopPropagation(); return; }
            if (gaveta) { fecharGaveta(true); ev.stopPropagation(); return; }
            if (novo) { fecharNovo(true); ev.stopPropagation(); return; }
            // O menu de status aberto fecha primeiro (a confirmação do Excluir volta ao menu), e o foco volta ao botão.
            if (menuStatus && !drawer.hidden) {
                menuStatus = menuStatus.modo === 'confirmar' ? { ...menuStatus, modo: 'aberto' } : null;
                pintarPainel(false);
                if (menuStatus) focarMenuDoStatus(); else (dbody.querySelector('[data-act="status-menu"]') as HTMLElement | null)?.focus();
                ev.stopPropagation();
                return;
            }
            // Com a trilha, o Esc volta ao painel de antes (o de cima fecha); sem ela, fecha o painel.
            if (!drawer.hidden && voltar()) { ev.stopPropagation(); return; }
            if (!drawer.hidden) { fecharPainel(); ev.stopPropagation(); return; }
            // O Esc volta um nível do zoom; no longo prazo, volta ao Ano.
            if (nav.pilha.length) { passoDeNivel(AFASTA, null, null); ev.stopPropagation(); return; }
            if (nav.nivel === 'longo-prazo' || nav.nivel === 'sistema') { passoDeNivel(APROXIMA, null, null); ev.stopPropagation(); return; }
            if (triagem) { fecharTriagem(); ev.stopPropagation(); return; }
            if (tela.selecionado) { tela = { ...tela, selecionado: null }; curvas.agora(); }
            return;
        }
        // ⌘Enter na gaveta do ciclo: Gravar (o que está na caixa em edição vale; nada grava com problema).
        if (gaveta && ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey) && !ev.shiftKey && !ev.altKey && drawer.contains(ev.target as HTMLElement)) {
            ev.preventDefault();
            ev.stopPropagation();
            if (digitando) anotarGaveta(ev.target as HTMLElement);
            void gravarGaveta();
            return;
        }
        if (!digitando && (ev.metaKey || ev.ctrlKey) && !ev.shiftKey && !ev.altKey && String(ev.key).toLowerCase() === 'z' && podeGravar()) {
            if (triagem && drawer.hidden && teclaDaTriagem(ev)) return;
            ev.preventDefault();
            ev.stopPropagation();
            desfazerUltima();
            return;
        }
        // Enter na caixa do item novo da checklist acrescenta, como o botão.
        if (digitando && ev.key === 'Enter' && tag === 'input' && (ev.target as HTMLElement).getAttribute?.('data-input') === 'item-texto') {
            ev.preventDefault();
            const ok = dbody.querySelector('[data-act="item-ok"]') as HTMLElement | null;
            if (ok) acaoDoPainel('item-ok', ok);
            return;
        }
        if (digitando && ev.key === 'Enter' && tag === 'input' && (ev.target as HTMLElement).getAttribute?.('data-campo-edit')) {
            ev.preventDefault();
            (ev.target as HTMLElement).blur();
            if (doc.activeElement === ev.target) gravarCampo(ev.target as HTMLElement);
            return;
        }
        if (digitando && ev.key === 'Enter' && triForm && tri.contains(ev.target as HTMLElement)) { ev.preventDefault(); confirmarForm(); return; }
        // A busca do "Escolher uma que já existe": ↑ ↓ andam na lista; Enter escolhe a da vez, ou,
        // sem nenhuma, leva ao "Criar nova" (com o texto no título); nada se cria daqui.
        if (digitando && novo && (ev.target as HTMLElement).hasAttribute?.('data-escolher-busca') && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
            if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); andarNoEscolher(ev.key === 'ArrowDown' ? 1 : -1); return; }
            if (ev.key === 'Enter') {
                ev.preventDefault();
                const lista = listaDoEscolher(novo, tipoDoNovo(novo.tipo));
                if (lista?.opcoes.length) { escolherNoNovo(Math.min(novo.escolhaI ?? 0, lista.opcoes.length - 1)); return; }
                // Nada achado: o "Criar nova" (o primeiro campo do formulário, ou o do ramo no tipo sem Novo).
                ((dbody.querySelector('[data-form="novo"] [data-novo]') ?? dbody.querySelector('[data-act="adicionar-criar"]')) as HTMLElement | null)?.focus();
                return;
            }
        }
        // Enter no Novo cria (no texto longo, Enter é a quebra de linha).
        if (digitando && ev.key === 'Enter' && novo && tag !== 'textarea' && dbody.contains(ev.target as HTMLElement)) {
            ev.preventDefault();
            anotarNovo(ev.target as HTMLElement, false);
            gravarNovo('criar');
            return;
        }
        if (digitando && ev.key === 'Enter' && ev.target === capIn) { ev.preventDefault(); capturar(); return; }
        // Alt+← volta pela trilha do painel (P10c), como o "‹ Voltar".
        if (!digitando && ev.altKey && !ev.metaKey && !ev.ctrlKey && ev.key === 'ArrowLeft' && !drawer.hidden && trilha.length) { ev.preventDefault(); voltar(); return; }
        if (digitando || ev.metaKey || ev.ctrlKey || ev.altKey) return;
        // No menu de status (02/11), ↑ ↓ andam pelas opções, como num menu; o Esc o fecha (acima, pelo painel).
        const noMenu = (ev.target as HTMLElement)?.closest?.('[data-menu-status]') as HTMLElement | null;
        if (noMenu && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) {
            ev.preventDefault();
            const itens = Array.from(noMenu.querySelectorAll('[role="menuitem"]:not([disabled]), .acts button')) as HTMLElement[];
            const i = itens.indexOf(ev.target as HTMLElement);
            itens[(i + (ev.key === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length]?.focus();
            return;
        }
        // Na triagem, as teclas do item à vista mudam e valem antes das da linha do tempo (8.6);
        // ↑ ↓ + − continuam andando no tempo, que é o alvo. Com o painel do nó aberto, valem as dele.
        if (triagem && drawer.hidden && !triForm && teclaDaTriagem(ev)) return;
        if ((ev.key === 't' || ev.key === 'T') && !triagem) { ev.preventDefault(); abrirTriagem(); return; }
        if ((ev.key === 'Delete' || ev.key === 'Backspace') && ligacaoEscolhida && podeGravar()) { ev.preventDefault(); desligarLigacao(ligacaoEscolhida); return; }
        // Na vista do ramo, as setas andam pela formação: ↑ ↓ o eixo principal, ← → as conexões.
        if (nav.pilha.length && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) { ev.preventDefault(); passoVerticalNoRamo(ev.key === 'ArrowDown' ? 1 : -1); return; }
        if (nav.pilha.length && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) { ev.preventDefault(); passoHorizontalNoRamo(ev.key === 'ArrowRight' ? 1 : -1); return; }
        if (ev.key === 'ArrowUp') { ev.preventDefault(); andar(-1); }
        else if (ev.key === 'ArrowDown') { ev.preventDefault(); andar(1); }
        // + e − mudam o nível sobre o que está escolhido (a proposta da pinça), pelo mesmo dono da navegação.
        else if (ev.key === '+' || ev.key === '=') { ev.preventDefault(); passoDeNivel(APROXIMA, alvoDoTeclado(), null); }
        else if (ev.key === '-' || ev.key === '_') { ev.preventDefault(); passoDeNivel(AFASTA, null, null); }
        else if (ev.key === 'h' || ev.key === 'H') irHoje();
        else if (ev.key.toUpperCase() === TECLA_DOS_RAMOS && ramosParaEscolher.length > 1) { ev.preventDefault(); abrirSeletor(); }
        else if (ev.key === 'e' || ev.key === 'E') alternarTudo();
        // O expandir e o recolher do nó escolhido, na vista do ramo (30/10) e no mapa principal (02/11).
        else if (ev.key.toUpperCase() === EXPANDIR.tecla) {
            const id = nav.pilha.length ? alvoDoTeclado() : tela.selecionado;
            const w = !id ? null : nav.pilha.length
                ? ramoVista.querySelector(`[data-cartao="${cssEsc(id)}"][data-filhos]`)
                : track.querySelector(`[data-node="${cssEsc(id)}"]`)?.closest('.n-mapa[data-filhos]') ?? null;
            if (id && w) { ev.preventDefault(); alternarExpansao(id, w.getAttribute('data-filhos') === 'aberto'); }
        }
        else if (ev.key === '/') { ev.preventDefault(); abrirBusca(); }
        else if (ev.key.toUpperCase() === STATUS.tecla && modelo && (aberto || tela.selecionado)) {
            if (teclaDoStatus((aberto ?? tela.selecionado)!)) ev.preventDefault();
        }
        else if ((ev.key === 'n' || ev.key === 'N' || ev.key === 'c' || ev.key === 'C') && modelo && (aberto || tela.selecionado)) {
            const arq = modelo.arquivos(aberto ?? tela.selecionado!);
            const alvo = ev.key.toLowerCase() === 'n' ? arq.nota : arq.canvas;
            if (alvo) adaptador.abrirNota(alvo);
            else toast(ev.key.toLowerCase() === 'n' ? 'Este nó não tem nota' : 'Este nó não tem canvas');
        }
    });

    /* ----------------------------------------------------------- roda e toque (no mapa) */
    /*
     * A roda e o trackpad (P7c): cada gesto escolhe um eixo e fica nele (`passoDaRoda`). No
     * vertical, o entalhe do mouse anda uma linha; o deslize do trackpad soma até o limiar, e
     * a cauda da inércia não empurra mais linhas; o forte anda um número limitado. De lado, o
     * trackpad rola nativo e livre (na tela larga, sem encaixe que puxe); Shift + roda vai de painel em painel.
     */
    let roda: EstadoDaRoda = RODA_PARADA, paneRodaT = 0;
    /*
     * A pinça do trackpad (o Chromium a entrega como roda com Ctrl) e o ⌘ com a roda são o eixo da
     * profundidade (`passoDaRoda`, eixo `z`): um gesto dá um nível só e nunca rola, nem a linha alta
     * desliza por dentro (o `pan`) enquanto Ctrl ou ⌘ está apertado.
     */
    const aRoda = (ev: WheelEvent) => {
        const profundo = ehDaProfundidade(ev);
        const r = passoDaRoda(roda, { deltaX: ev.deltaX, deltaY: ev.deltaY, deltaMode: ev.deltaMode, t: agora(), shiftKey: ev.shiftKey, ctrlKey: ev.ctrlKey, metaKey: ev.metaKey, wheelDeltaY: (ev as any).wheelDeltaY });
        roda = r.estado;
        if (r.eixo === 'z' || profundo) {
            ev.preventDefault();
            if (r.nivel) passoDeNivel(r.nivel, r.nivel === APROXIMA ? noSobOGesto(ev.clientX, ev.clientY, ev.target) : null, { x: ev.clientX, y: ev.clientY });
            return;
        }
        // Na vista do ramo, a roda e o trackpad sem Ctrl nem ⌘ rolam a vista nativa, nos dois eixos, com a inércia
        // do sistema (02/11: aparecia o contorno vermelho pontilhado, só a barra manual rolava para o lado e o
        // gesto de rolagem no touchpad ficava travado): o gesto de lado virava o passo do cursor do
        // teclado (o contorno tracejado) e a vista pulava até o cartão dele; o vertical rolava à mão e perdia o
        // lado. O cursor anda só pelas setas. Só na borda de baixo ou de cima, quando a vista já mostrou tudo e
        // com um gesto novo, a vertical anda na cadeia da formação (a semana seguinte), como antes.
        if (nav.pilha.length) {
            // Shift com a roda do mouse (só o vertical, sem o lado): de lado, à mão, porque nem todo sistema o
            // converte; o trackpad de lado já chega com o deltaX e fica com a rolagem nativa.
            if (ev.shiftKey && ev.deltaY && !ev.deltaX) {
                ev.preventDefault();
                ramoVista.scrollLeft = Math.max(0, Math.min(ramoVista.scrollWidth - ramoVista.clientWidth, ramoVista.scrollLeft + pixelsDaRoda(ev, ramoVista.clientWidth)));
                return;
            }
            if (r.eixo !== 'y') return;
            const dpx = pixelsDaRoda(ev, ramoVista.clientHeight);
            const b = rolarNoBloco(r, ramoRola(dpx));
            roda = b.estado;
            if (b.rolar) return;
            ev.preventDefault();
            if (b.passos) passoVerticalNoRamo(b.passos > 0 ? 1 : -1);
            return;
        }
        if (r.eixo === 'x') {
            if (!(ev.shiftKey && ev.deltaY && !ev.deltaX)) return; // o trackpad de lado: a rolagem nativa, livre
            if (map.scrollWidth <= map.clientWidth + 1) return;
            ev.preventDefault();
            const t = agora();
            if (t - paneRodaT < 280) return;
            paneRodaT = t;
            const ms = marcas().map(m => m.getAttribute('data-pane') ?? '');
            const i = ms.indexOf(paneProximo());
            snapTo(ms[Math.max(0, Math.min(ms.length - 1, i + (ev.deltaY > 0 ? 1 : -1)))], true);
            return;
        }
        ev.preventDefault();
        if (r.eixo !== 'y') return;
        // A linha mais alta que a vista desliza por dentro antes de trocar de período; na borda, o
        // passo só vem com um gesto novo (30/10: ver todas as tarefas antes de pular).
        const dpx = pixelsDaRoda(ev, vp.clientHeight);
        const b = rolarNoBloco(r, podePan(dpx));
        roda = b.estado;
        if (b.rolar) { pan(dpx); return; }
        if (b.passos) andar(b.passos > 0 ? 1 : -1);
    };
    /** O que faz: os pixels de um evento vertical da roda (a linha vale 30 px; a página, a altura da vista). */
    const pixelsDaRoda = (ev: WheelEvent, altura: number) => (ev.deltaMode === 1 ? ev.deltaY * 30 : ev.deltaMode === 2 ? ev.deltaY * altura : ev.deltaY);
    /** O que faz: a vista do ramo ainda rola naquele sentido (há cartão escondido abaixo ou acima)? */
    const ramoRola = (dy: number) => (dy > 0 ? ramoVista.scrollTop + ramoVista.clientHeight < ramoVista.scrollHeight - 1 : dy < 0 ? ramoVista.scrollTop > 0 : false);
    on(vp, 'wheel', aRoda, { passive: false });
    on(ramoVista, 'wheel', aRoda, { passive: false });
    // Na vista do Sistema, a pinça do trackpad e o ⌘ com a roda também dão o nível (a volta, 30/10: na
    // última tela não havia zoom de volta); a rolagem comum fica com a própria vista.
    on(sistemaVista, 'wheel', (ev: WheelEvent) => { if (ehDaProfundidade(ev)) aRoda(ev); }, { passive: false });
    /* O primeiro movimento escolhe o eixo (a trava): vertical anda no tempo, horizontal fica com os painéis. */
    let TS: { x0: number; y0: number; last: number; eixo: 'x' | 'y' | null; off: number; base: number; vy: number; lt: number; rolou?: boolean } | null = null;
    const trackY = () => { const m = /translateY\((-?[\d.]+)px\)/.exec(track.style.transform || ''); return m ? Number(m[1]) : 0; };
    on(vp, 'touchstart', (ev: TouchEvent) => {
        if (ev.touches.length !== 1) { TS = null; return; }
        const t = ev.touches[0];
        TS = { x0: t.clientX, y0: t.clientY, last: t.clientY, eixo: null, off: 0, base: 0, vy: 0, lt: Date.now() };
    }, { passive: true });
    on(vp, 'touchmove', (ev: TouchEvent) => {
        if (!TS) return;
        const t = ev.touches[0];
        const dx = t.clientX - TS.x0, dy = t.clientY - TS.y0;
        if (!TS.eixo) { if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return; TS.eixo = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x'; }
        if (TS.eixo !== 'y') return;
        if (ev.cancelable) ev.preventDefault();
        const d = t.clientY - TS.last;
        const agora = Date.now();
        TS.vy = d / Math.max(1, agora - TS.lt);
        TS.lt = agora;
        TS.last = t.clientY;
        // O toque que deslizou a linha alta por dentro não troca de período no mesmo gesto (30/10).
        if (TS.off === 0 && pan(-d)) { TS.rolou = true; return; }
        if (TS.rolou) return;
        if (TS.off === 0) TS.base = trackY();
        TS.off += d;
        track.style.transition = 'none';
        track.style.transform = `translateY(${Math.round(TS.base + TS.off)}px)`;
    }, { passive: false });
    const fimDoToque = () => {
        const g = TS;
        TS = null;
        if (!g || g.eixo !== 'y' || !g.off) return;
        track.style.transition = '';
        const vr = vp.getBoundingClientRect();
        const meio = vr.top + vr.height / 2;
        let melhor: HTMLElement | null = null, bd = Infinity;
        for (const r of Array.from(track.querySelectorAll('.row')) as HTMLElement[]) {
            const b = r.getBoundingClientRect();
            const d = meio < b.top ? b.top - meio : meio > b.bottom ? meio - b.bottom : 0;
            if (d < bd) { bd = d; melhor = r; }
        }
        const atual = tela.foco;
        let k = melhor?.getAttribute('data-row') ?? atual;
        if (k === atual && (Math.abs(g.off) > 48 || Math.abs(g.vy) > 0.5)) {
            const chaves = chavesDaEscala();
            const i = chaves.indexOf(atual);
            const dir = (Math.abs(g.off) > 48 ? g.off : g.vy) < 0 ? 1 : -1;
            k = chaves[Math.max(0, Math.min(chaves.length - 1, i + dir))];
        }
        if (k !== atual) focarLinha(k);
        else track.style.transform = `translateY(${g.base}px)`;
    };
    on(vp, 'touchend', fimDoToque);
    on(vp, 'touchcancel', fimDoToque);
    /*
     * A pinça do toque (dois dedos, pelos eventos de ponteiro): o mesmo nível da pinça do trackpad
     * (`passoDaPinca`). Um dedo continua sendo rolagem; quando o segundo desce, a rolagem de um dedo
     * para e a trilha volta para onde estava (a pinça não rola).
     */
    let pinca: EstadoDaPinca = PINCA_PARADA;
    const aoDedo = (tipo: 'desce' | 'move' | 'sobe') => (ev: PointerEvent) => {
        if (ev.pointerType !== 'touch') return;
        const r = passoDaPinca(pinca, { tipo, id: ev.pointerId, x: ev.clientX, y: ev.clientY, t: agora(), pointerType: ev.pointerType });
        pinca = r.estado;
        if (pinca.dedos.length >= 2 && TS) {
            if (TS.off) { track.style.transition = ''; track.style.transform = `translateY(${TS.base}px)`; }
            TS = null;
        }
        if (!r.nivel) return;
        ultimaPinca = agora();
        const c = r.estado.inicio;
        passoDeNivel(r.nivel, r.nivel === APROXIMA ? noSobOGesto(c?.x ?? NaN, c?.y ?? NaN, ev.target) : null, c ? { x: c.x, y: c.y } : null);
    };
    on(mapwrap, 'pointerdown', aoDedo('desce'));
    on(mapwrap, 'pointermove', aoDedo('move'));
    on(mapwrap, 'pointerup', aoDedo('sobe'));
    on(mapwrap, 'pointercancel', aoDedo('sobe'));

    /* ----------------------------------------------------------- a folha de baixo (a alça) */
    let SG: { y0: number; dy: number; id: number; alca: boolean; moveu: boolean } | null = null;
    on(drawer, 'pointerdown', (ev: PointerEvent) => {
        if (ev.button !== 0 || !ehFolha()) return;
        const t = ev.target as HTMLElement;
        const alca = !!t.closest('.grab');
        const cabeca = !alca && !!t.closest('.dh') && !t.closest('button, input, select, textarea, a');
        if (!alca && !cabeca) return;
        SG = { y0: ev.clientY, dy: 0, id: ev.pointerId, alca, moveu: false };
        drawer.style.transition = 'none';
        try { t.setPointerCapture(ev.pointerId); } catch { /* sem captura */ }
    });
    on(drawer, 'pointermove', (ev: PointerEvent) => {
        if (!SG || ev.pointerId !== SG.id) return;
        SG.dy = ev.clientY - SG.y0;
        if (Math.abs(SG.dy) > 5) SG.moveu = true;
        drawer.style.transform = `translateY(${Math.max(-24, SG.dy)}px)`;
    });
    const fimDaFolha = (ev: PointerEvent) => {
        if (!SG || ev.pointerId !== SG.id) return;
        const g = SG;
        SG = null;
        drawer.style.transition = '';
        drawer.style.transform = '';
        if (g.dy > 90) { if (drawer.classList.contains('sheet-full') && g.dy < 260) folha('half'); else fecharPainel(); return; }
        if (g.dy < -40) { folha('full'); return; }
        if (g.alca && !g.moveu) folha(drawer.classList.contains('sheet-full') ? 'half' : 'full');
    };
    on(drawer, 'pointerup', fimDaFolha);
    on(drawer, 'pointercancel', fimDaFolha);

    /* ----------------------------------------------------------- os cinco gestos de fora */
    let ultimaLargura = 0;
    const montada: MissaoMontada = {
        atualizar: async () => { await carregar(); },
        redimensionar: () => {
            if (!modelo) return;
            const w = largura();
            centralizar();
            curvas.agora();
            atualizarHScroll();
            scrim.hidden = drawer.hidden || !ehFolha();
            if (w !== ultimaLargura) { ultimaLargura = w; snapTo(pane, false); pintarMolduraDoCelular(); }
            // Abaixo de 520 px o arrasto sai (os menus e as teclas ficam): cruzar a largura troca os nós.
            if (podeArrastar() !== arrastavaAoPintar) pintar();
        },
        estado,
        focar: id => { if (modelo) irPara(id); else void carregar().then(() => irPara(id)); },
        tomarFoco: () => {
            // A vista ficou ativa: o foco vem para a raiz (as teclas valem), mas nunca sai de um campo.
            const ativo = doc.activeElement as HTMLElement | null;
            if (destruido || (ativo && root.contains(ativo)) || !podeTomarFoco(ativo)) return;
            root.focus({ preventScroll: true } as FocusOptions);
        },
        destruir: () => {
            destruido = true;
            for (const d of desligar.splice(0)) { try { d(); } catch { /* já solto */ } }
            win.clearTimeout(toastTimer);
            linhaEls.clear();
            root.remove();
        },
    };
    /** O que faz: abre a lista dos ramos debaixo do seletor do título (G7, porta 2; a tecla G). */
    function abrirSeletor(): void {
        const b = titulo.querySelector('.ramo-sel') as HTMLElement | null;
        if (!b || !popRamos.hidden) { fecharPops(); return; }
        abrirPop(popRamos, b);
        b.setAttribute('aria-expanded', 'true');
    }
    // G7: os ramos se leem ao montar (o seletor fica sempre à vista, sem abrir o ⋯).
    if (adaptador.ramosPrincipais) void adaptador.ramosPrincipais().then(ls => { if (destruido) return; ramosParaEscolher = ls; pintarSeletor(); if (!menu.hidden) pintarMenu(); }).catch(e => console.warn('DFM Missão: os ramos não se listaram', e));
    void carregar().then(() => { if (aberto && modelo) abrirPainel(aberto, false); });
    return montada;
}
