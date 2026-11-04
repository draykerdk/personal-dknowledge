/**
 * O contrato da vista da Missão: o que cada parte do desenho recebe (o Contexto) e o que o lugar
 * dá ao componente para os nomes e as dicas dos botões (DicasDaMissao).
 *
 * Por quê: o passo `dica` da divisão da Missão (H5, tests/missao/modeloDfm.test.ts). O componente e
 * as ligações importavam marcarDica e ligarDicas de ui/dica.ts, que chega ao Obsidian
 * (`setTooltip`, `displayTooltip`): a vista, que não chega ao Obsidian, chegava por ali. Agora as
 * dicas vêm do lugar (liga.lugares), pelas dependências do componente, e as partes as recebem pelo
 * Contexto (`marcar`).
 *
 * Sem DOM próprio e sem Obsidian. Prova: tests/missao/contrato.test.ts.
 */
import type { CicloDoPeriodo, RamoPrincipal, NovoDoNo } from '../ramoPrincipal';
import type { DomainField } from '../../engine/domainModel';
import type { Escala } from '../tempo';
import type { LigacoesDaNota } from '../conexoes';
import type { Ligacao, MissaoModelo, ProtocoloDoNo, ReputacaoDoNo } from '../tipos';
import type { Vocabularios } from '../../engine/fieldModel';
import type { Papel } from '../../engine/papeisDeProtocolo';


/** O que cada parte do desenho recebe. */
export interface Contexto {
    doc: Document;
    modelo: MissaoModelo;
    ramoPrincipal: RamoPrincipal;
    escala: Escala;
    /** Dá o nome e a dica a um botão, pelas dicas que o lugar deu (`DicasDaMissao`). */
    marcar: (el: HTMLElement, texto: string, tecla?: string) => void;
    /** O frontmatter de uma nota, como está (o painel do nó mostra os campos pelo modelo do tipo); `null` sem nota. */
    camposDaNota: (caminho: string) => Record<string, unknown> | null;
    /**
     * A Missão grava aqui e agora (P6: a página e a aba no computador; o celular e o canvas
     * ficam só leitura): os nós ganham o arrasto e a alça, e o painel, a edição.
     */
    gravar?: boolean;
    /** Os vocabulários do catálogo (o status, a prioridade e os contextos, com os rótulos). */
    vocabularios?: Vocabularios;
    /** O campo que dá o nome do arquivo (edita pelo TaskNotes). */
    nomeDoArquivo?: string | null;
    /** Os botões do ciclo de um período, do ramo (vazio onde a Missão não grava). */
    ciclos?: (escala: Escala, chave: string) => CicloDoPeriodo[];
    /** O nome de um protocolo como o JSON dele diz (emoji e nome); `null` = não se lê. */
    nomeDoProtocolo?: (id: string) => string | null;
    /** O protocolo carregado que faz o papel (`ProtocolManager.idDoPapel`); `null` = o cofre não tem, e o botão não aparece. */
    protocoloDoPapel?: (papel: Papel) => string | null;
    /** O lugar roda protocolos aqui (onde a Missão grava): os botões do vazio e do próximo passo de um sinal (P10b). */
    rodaProtocolo?: boolean;
    /** Cria aqui a nota ou o canvas que falta ("Criar o canvas", "Criar a nota"). */
    criar?: boolean;
    /** O arrasto vale aqui (grava e há espaço: acima de 520 px); sem ele, os menus e as teclas. */
    arrastar?: boolean;
    /** O que se cria a partir de um nó (o Novo do ramo, P8); vazio onde a Missão não cria. */
    novos?: (id: string) => NovoDoNo[];
    /** As notas que um campo de link oferece para escolher (pelo `alvo` do modelo, P9: as pessoas do dia). */
    candidatos?: (campo: DomainField) => Array<{ nome: string; rotulo: string }>;
    /** As ligações de uma nota no cofre (P10c): os links que ela faz e as notas que a apontam; `null` = a nota não existe. */
    ligacoesDaNota?: (caminho: string) => LigacoesDaNota | null;
    /** A nota que um nome escrito acha, a partir de outra nota (o texto solto de um campo de link); `null` = nenhuma. */
    resolverLink?: (nome: string, de: string) => string | null;
    /** O "＋ Adicionar" de cada campo de link do painel (29/10) vale aqui (onde a Missão grava; no celular, não). */
    adicionar?: boolean;
    /** O tipo do Novo que cria as notas de um `type` (P10c: o "Criar a nota" do vínculo sem nota); `null` = o ramo não cria. */
    novoDoType?: (type: string) => { dominio: string; titulo: string } | null;
    /** O ramo que amplia um nó (G7, a porta "Ver no ramo <Título>"), pelo que o ramo de agora declara; `null` = nenhuma. */
    verNoRamo?: (id: string) => { id: string; titulo: string } | null;
    /** O texto de uma nota já lido pelo lugar (a checklist da tarefa, 29/10); `null` = ainda não lido ou sem nota. */
    textoDaNota?: (caminho: string) => string | null;
    /** O texto da nota ainda está sendo lido (o painel diz "lendo a nota…"). */
    lendoTexto?: (caminho: string) => boolean;
    /** A checklist se marca e se acrescenta aqui (onde a Missão grava e o lugar grava o texto). */
    checklist?: boolean;
    /**
     * Os protocolos de um nó (a peça 2b, 30/10), na ordem dos pesos e com o porquê, onde o lugar roda
     * protocolos; `null` = ainda lendo (o painel diz) ou o lugar não lê.
     */
    protocolosDoNo?: (id: string) => ProtocoloDoNo[] | null;
    /** Os protocolos do nó ainda estão sendo lidos. */
    lendoProtocolos?: (id: string) => boolean;
    /**
     * A linha "Reputação" de um nó (o acabamento, 30/10): o nível e o porquê, só para o nó cuja nota é
     * uma função com reputação; `null` = sem reputação, ou ainda lendo (o painel não mostra a linha).
     */
    reputacaoDoNo?: (id: string) => ReputacaoDoNo | null;
    /**
     * A expansão do mapa principal numa linha (02/11), pelo mesmo estado da vista do ramo do zoom: o
     * controle de cada nó que tem filho e os nós que o recolher esconde; o fixo (o centro) nunca some.
     * Sem a função, tudo aberto e sem controle.
     */
    expansaoDaLinha?: (ligacoes: readonly Ligacao[], fixo: string | null) => { filhos: Readonly<Record<string, 'aberto' | 'fechado'>>; escondidos: ReadonlySet<string> };
    /** O menu de status (02/11) no painel deste nó: aberto, ou na confirmação do Excluir; `null` = fechado. */
    menuDoStatus?: (id: string) => 'aberto' | 'confirmar' | null;
    /** O lugar arquiva a TaskNote pelo arquivo do TaskNotes (o Arquivar do menu de status), com o Desfazer. */
    arquivar?: boolean;
    /** A TaskNote está no arquivo do TaskNotes (o menu oferece "Tirar do arquivo"); sem a função, nenhuma. */
    arquivada?: (caminho: string) => boolean;
    /** O lugar manda a nota para a lixeira (o Excluir do menu de status), com o Desfazer quando ela fica na `.trash` do cofre. */
    excluir?: boolean;
    /** O dia e a hora de agora (`AAAA-MM-DD`, `HH:MM`), para marcar no cartão a hora marcada que já passou; sem ele, não marca. */
    relogio?: () => { dia: string; hora: string };
}

/* ------------------------------------------------------------ as dicas que o lugar dá */

/** O que o lugar dá ao componente para os botões: o nome e a dica de um, e os ouvintes do foco e do toque longo na raiz. */
export interface DicasDaMissao {
    /** Dá ao botão o nome (`aria-label`, com a tecla quando há) e a dica do lugar. */
    marcar(el: HTMLElement, texto: string, opcoes?: { tecla?: string }): void;
    /** Liga, na raiz, a dica pelo foco do teclado e pelo toque longo; devolve o desligar. */
    ligar(raiz: HTMLElement): () => void;
}

/**
 * O que faz: o nome de um botão com a tecla de atalho, quando há ("Hoje · H").
 * Por quê: o nome que o leitor de tela lê tem a mesma forma com e sem o lugar; a forma é a das
 * dicas da casa (`textoDaDica`, ui/dica.ts), e um teste diferencial compara as duas.
 * Entra → sai: o texto e a tecla → o nome (as pontas sem espaço).
 * Erro e ataque: texto vazio dá ''; o texto é texto, nunca HTML.
 * Prova: tests/missao/contrato.test.ts.
 */
export function nomeComTecla(texto: string, tecla?: string): string {
    const t = String(texto ?? '').trim();
    return tecla ? `${t} · ${tecla}` : t;
}

/**
 * As dicas sem o lugar (os testes, um lugar que não as dá): só o nome do botão (`aria-label` e a
 * marca `data-dica`), que o leitor de tela lê; sem a dica do Obsidian e sem ouvintes na raiz.
 */
export const DICAS_SO_DO_NOME: DicasDaMissao = {
    marcar(el, texto, opcoes = {}) {
        const t = nomeComTecla(texto, opcoes.tecla);
        if (!t) return;
        el.setAttribute('aria-label', t);
        el.setAttribute('data-dica', '');
    },
    ligar: () => () => {},
};
