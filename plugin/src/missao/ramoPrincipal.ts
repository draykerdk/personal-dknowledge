/**
 * Os ramos da Missão: o que fica no centro, as colunas de cada asa, como cada coluna
 * se liga à vizinha e os painéis do celular, lidos de um arquivo de configuração.
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, §3.8): "um ramo não é uma tela
 * nova"; é a mesma Missão, com o mesmo gesto, o mesmo painel do nó e as mesmas ligações,
 * e tudo o que muda de um ramo para outro mora no arquivo dele
 * (`200 - FUNCTIONS/Config/ramos/<id>.json`). O componente não tem nome de ramo nem
 * coluna fixa: ele lê o ramo por aqui e desenha o plano da grade que sai dele.
 *
 * Módulo puro: sem Obsidian e sem DOM. Prova: tests/missao/ramoPrincipal.test.ts.
 */
import { DIA } from '../engine/dia';
import { parseFormacao, type FormacaoDeclarada } from '../engine/domainModel';
import { fold } from '../project/projectCanvasModel';
import { diasDoPeriodo, ESCALAS, isChaveEspecial, type Escala } from './tempo';
import type { EscolhaDoNo } from './tipos';

/** Onde moram os ramos. */
export const PASTA_DOS_RAMOS = '200 - FUNCTIONS/Config/ramos';
/** O ramo de partida (a chave `ramo:` do bloco, quando falta). */
export const RAMO_DE_PARTIDA = 'missao';
export const caminhoDoRamo = (id: string) => `${PASTA_DOS_RAMOS}/${id}.json`;

export type Traco = 'continuo' | 'pontilhado' | 'tracejado';
const TRACOS: readonly Traco[] = ['continuo', 'pontilhado', 'tracejado'];

type PorEscala<T> = T | Partial<Record<Escala, T>>;

export interface ColunaDoRamo {
    id: string;
    rotulo: string;
    /** A lista da linha aberta de onde vêm os nós (`areas`, `projetos`, `faixas`, `asa`…). */
    fonte: string;
    /** Só os nós destes tipos (`semana`, `visao`…); vazio = todos. */
    tipo: string[];
    /** A segunda lista, mostrada como "Pendentes de antes" (as faixas que ficaram). */
    pendentes: string | null;
    /** A lista das de hora marcada, mostrada no topo como "Com hora" (14:30 · título). */
    horarios: string | null;
    /** As escalas em que a coluna aparece; vazio = todas. */
    escalas: Escala[];
    largura: PorEscala<string>;
    /** A fração do painel no celular (1 = um painel inteiro). */
    celular: PorEscala<number>;
    painel: string;
    /** A fonte são faixas (as tarefas por projeto), e não nós soltos: o vazio diz "sem tarefas". */
    faixas: boolean;
    /** No celular, fica embaixo do centro, no painel dele. */
    junto: boolean;
    /** Na linha fechada, as marcas das tarefas moram aqui. */
    marcas: boolean;
    /** Na linha fechada, a nota ("W45 começa") mora aqui. */
    nota: boolean;
    /**
     * A coluna sem nó na linha: o texto do vazio (ausência em palavras) e os protocolos que já
     * existem e criariam o que falta (os botões, na linha em foco, onde a Missão grava).
     */
    vazio: VazioDaColuna | null;
    /** O ramo que amplia esta coluna (G7, a porta "Ver no ramo"); `null` = nenhuma. */
    amplia: Ampliacao | null;
    /**
     * De onde vêm as ligações que chegam aos nós da coluna (29/10): `padrao` = das conexões padrão dos
     * modelos de tipo (o nó acima mais perto que a linha mostra, o bloqueio); `null` = as da Missão.
     */
    ligacoes: 'padrao' | null;
    /**
     * A coluna da asa do tempo que vem antes do centro (30/10: na visão de ano, o ano vem depois
     * dos trimestres): os trimestres no Ano ficam entre o trabalho e o ano; `false` = depois do centro.
     */
    antesDoCentro: boolean;
}

/**
 * O ramo que amplia uma coluna ou o lugar (G7, 29/10): o id dele e os tipos de nó (os domínios
 * dos modelos) que também levam a ela. "Qual módulo pertence a qual ramo é configuração e não
 * código" (o diagnóstico do painel do nó, G7): nenhum nome de ramo no componente.
 */
export interface Ampliacao { ramo: string; tipos: string[] }

/**
 * O vazio de uma coluna: a frase, os protocolos que criam o que falta e os tipos do Novo do ramo que também o
 * criam (05/11: a estadia e o canal nascem pelo Novo, e não por um protocolo); `novos` vazio = nenhum.
 */
export interface VazioDaColuna { texto: string; protocolos: string[]; novos: string[] }

/**
 * Um botão do ciclo de uma escala (▶️ abrir o dia, 🌳 planejar a semana…): o protocolo que
 * ele roda, passo a passo, e as variáveis do período que vão junto (com `{chave}` = a chave
 * do período e `{data}` = o dia de contexto dele, `dataDoPeriodo`).
 */
export interface BotaoDoCiclo {
    emoji: string;
    rotulo: string;
    dica: string;
    protocolo: string;
    /** Onde mora no centro: em cima, junto do ▲▼ (`inicio`), ou embaixo do período (`fim`). */
    ponta: 'inicio' | 'fim';
    variaveis: Record<string, string>;
}

/** Um botão do ciclo pronto para um período: o índice dele na escala e as variáveis já resolvidas. */
export interface CicloDoPeriodo extends BotaoDoCiclo { escala: Escala; chave: string; i: number; valores: Record<string, string> }

export interface PainelDoRamo { id: string; rotulo: string; dica: string; alinhar: 'start' | 'center' | 'end'; noLargo: string | null }

/** Um tipo do seletor do Novo: o modelo do tipo (`Config/dominios/<tipo>.json`), o rótulo do botão e o título do formulário. */
export interface TipoDoSeletor { tipo: string; rotulo: string; titulo: string }

/**
 * O que se cria a partir de um nó: o tipo, o texto do botão ("Nova ação" numa SMART) e o que escolher
 * uma existente faz; o filho que sai dos modelos (29/10) leva também o campo de link do filho que
 * aponta este nó e o nome a gravar nele (o "+ Cidade" do país leva o país).
 */
export interface NovoDoNo { tipo: string; rotulo: string; escolher?: EscolhaDoNo; campo?: string; valor?: string }

/**
 * O Novo do ramo (P8, §4.3 e §5.6): os tipos do seletor, na ordem dele (o protótipo:
 * Tarefa · SMART · Projeto · Cidade · País), e o que se cria a partir de cada espécie de nó
 * (a SMART, o projeto, a área, o dia, a semana, o lugar). Os campos de cada tipo vêm do modelo dele.
 */
export interface NovoDoRamo {
    tipos: TipoDoSeletor[];
    no: Record<string, NovoDoNo[]>;
    /**
     * As etiquetas que a tarefa criada neste ramo leva (P10c: a tarefa nova da Viagem leva a
     * etiqueta do recorte dela e fica à vista nela); vazio = nenhuma. Só a tarefa pelo TaskNotes:
     * os tipos que nascem pelo protocolo dono gravam o que o protocolo grava.
     */
    etiquetas: string[];
}

/**
 * Um gesto de registro de um nó (P9, §8.7, §8.9, §8.10): o texto do botão e a dica; os campos
 * que ele grava (`campo`, `data`) e, na nota nova, o protocolo dono e o passo que recebe o nome.
 * Os nomes de campo e de protocolo moram aqui, no ramo, e não no componente (§3.8).
 */
export interface GestoDeRegistro { rotulo: string; dica: string; campo: string | null; data: string | null; protocolo: string | null; passo: string | null }

/**
 * O registro do ramo por escala (P9): `feito` ("＋ O que fiz"), `atalho` (o "＋ R$" do nó sem
 * valor, que abre o campo), `nota` ("+ pessoa nova": a nota pelo protocolo dono, que entra no
 * campo quando ele termina) e `saldo` ("Informar saldo": o campo e a data de hoje na nota dele).
 */
export type GestosDoRegistro = Partial<Record<'feito' | 'atalho' | 'nota' | 'saldo', GestoDeRegistro>>;

/* ------------------------------------------------------------ as coleções que o ramo declara */

/** Um campo de uma nota mostrado no painel (o rótulo, o formato e, quando há valor, a nota). */
export interface CampoDaFonte {
    nome: string;
    rotulo: string;
    formato: 'texto' | 'data' | 'reais';
    /** Dito depois do valor ("estimado pela pesquisa"); só quando há valor. */
    nota: string | null;
}

/** A fonte diz que cada nota é um trecho: os campos de onde sai, para onde vai e o dia. */
export interface TrechoDaFonte { de: string; para: string; data: string }

export interface FonteDaColecao {
    /** O protocolo que grava a nota: a casa é a `targetFolder` dele; `null` na fonte de um modelo (`dominio`). */
    protocolo: string | null;
    /**
     * O modelo de tipo da nota que nenhum protocolo grava (30/10: a estadia, nascida pelo Novo simples): a casa
     * é a `candidatos.pasta` dele. Uma fonte diz o protocolo ou o domínio, nunca os dois.
     */
    dominio: string | null;
    /**
     * A casa dita direto, para as notas que nenhum protocolo nem modelo grava (03/11: os bancos antigos de roteiros,
     * lidos sem mover nada): a pasta, ou a própria nota. Só leitura; uma fonte diz o protocolo, o domínio ou a casa.
     */
    casa: string | null;
    /** O `type` da nota. */
    type: string;
    /** O nome do tipo no painel ("Mala", "Candidato"). */
    rotulo: string;
    /** O campo do título; sem ele, o nome do arquivo. */
    titulo: string | null;
    /** O campo da data em que a nota começa no tempo. */
    de: string | null;
    /** O campo da data em que acaba; declarado e vazio na nota = aberta até hoje. */
    ate: string | null;
    /**
     * O dia em que a nota cai no tempo quando a fonte não tem `de`, ou a nota não tem a data dele (03/11: o banco antigo
     * entra no ramo no dia do índice); com `ate`, fica aberta até a data dele ou até hoje.
     */
    desde: string | null;
    /**
     * A nota sai da coleção quando uma nota destas coleções a aponta pelo `campo` (03/11: a ideia que virou roteiro
     * não aparece duas vezes); sem a chave, nada sai.
     */
    usada: { colecoes: string[]; campo: string } | null;
    /** O campo de link: a nota segue o tempo da nota ligada. */
    segue: string | null;
    /** A nota cai nos dias das passagens que a têm como nota. */
    lugar: boolean;
    /** Os campos da linha do nó, na ordem. */
    linha: string[];
    /** Os campos do painel do nó, na ordem. */
    campos: CampoDaFonte[];
    trecho: TrechoDaFonte | null;
    /**
     * Só as notas cujo campo tem um destes valores (02/11, o ramo de Roteiros: o longo e o corte são o
     * mesmo tipo, separados pelo `formato`); vazio ou sem a chave = todas. Campo → valores aceitos; todos têm de casar.
     */
    filtro?: Record<string, string[]>;
    /**
     * Só as notas com estes campos preenchidos (`com`) ou vazios (`sem`) (03/11, o ramo Criação: a peça que desdobra de
     * outra, pelo `de`, é desdobramento; a que não desdobra é peça); sem a chave, todas.
     */
    com?: string[];
    sem?: string[];
}

export interface ColecaoDoRamo {
    id: string;
    rotulo: string;
    /** As fontes; a coleção de vínculo sem fonte mostra só os valores do campo, sem nota (02/11: os canais). */
    fontes: FonteDaColecao[];
    /** A coleção de vínculo: as notas que o `campo` das notas da `colecao` aponta. */
    vinculo: { colecao: string; campo: string } | null;
    /**
     * A ordem pela data de um campo (02/11, um ramo de coleção com data de publicação: o próximo a publicar primeiro); sem a chave, a
     * de sempre (o começo no tempo, depois o título). `semValor`: onde ficam as notas sem a data, pelo começo.
     */
    ordem?: OrdemDaColecao;
    /**
     * A contagem das notas ligadas (05/11, a campanha da semana: as peças de cada frente e de cada canal), só numa coleção
     * de vínculo: na linha, o alvo mostra as notas que o apontam pela forma de mostrar; do plano é a nota com a data do
     * campo `data` no período, e feita é a que o modelo do tipo dela dá por feita (a peça publicada). `colecoes`: as
     * coleções cujas notas contam (as peças e os desdobramentos; sem a chave, a do vínculo). `vazio`: o texto de ausência.
     */
    conta?: ContaDaColecao;
}

/** A contagem de uma coleção de vínculo: o campo da data que põe a nota ligada no plano do período e o texto de ausência. */
export interface ContaDaColecao { data: string; colecoes: string[]; vazio: string }

/** A ordem de uma coleção: o campo de data e as sem valor dele, as mais novas (`recente`) ou as mais velhas (`antigo`) primeiro. */
export interface OrdemDaColecao { campo: string; semValor: 'recente' | 'antigo' }

/* ------------------------------------------------------------ o ramo */

export interface RamoPrincipal {
    id: string;
    /**
     * Os ids que o ramo teve antes (03/11: o Roteiros virou Criação): o ramo guardado no aparelho, na aba ou no bloco
     * com o id antigo abre este, e o estado passa a guardar o novo; vazio sem a chave.
     */
    antes: string[];
    titulo: string;
    /** O que o ramo é, para o seletor dos ramos (G7); vazio sem a chave. */
    descricao: string;
    // Sem a chave `escalas` (05/11): a tela nunca a leu (o seletor da escala mostra sempre as quatro,
    // `componente.ts`), e todo ramo serve às quatro, pela simetria dos ramos; a coluna é que diz em que
    // escalas aparece (`ColunaDoRamo.escalas`).
    lugar: { rotulo: string; largura: string; celular: string; amplia: Ampliacao | null } | null;
    /** O centro; `vazio` = o texto do centro quando a fonte não dá nó (sem ele, o período). */
    centro: {
        fonte: string; tipo: string[]; rotulo: Partial<Record<Escala, string>>; largura: PorEscala<string>; painel: string; vazio: string | null;
        /**
         * Os hábitos do dia no centro e no painel do período (P10c); `false` = o ramo não os mostra. Sem a chave, mostra.
         * Uma lista (03/11, o ramo de Roteiros) mostra só aqueles hábitos, pelo nome da nota ou pelo título.
         */
        habitos: boolean | string[];
    };
    /** A asa do trabalho, da coluna de fora (a mais à esquerda) até a vizinha do centro. */
    trabalho: ColunaDoRamo[];
    /** A asa do tempo, da vizinha do centro até a de fora. */
    tempo: ColunaDoRamo[];
    paineis: PainelDoRamo[];
    /** Os tipos de ligação que o ramo desenha, com o traço; o que falta não se desenha. */
    ligacoes: Record<string, { traco: Traco; rotulo: string }>;
    /** A largura natural da borboleta por escala (abaixo dela, o mapa rola de lado). */
    minimo: Partial<Record<Escala, number>>;
    /** Os botões do ciclo de cada escala (o que a escala não declara não tem botão). */
    ciclos: Partial<Record<Escala, BotaoDoCiclo[]>>;
    /** O Novo (P8): sem a chave, o ramo não cria nada. */
    novo: NovoDoRamo;
    /** O registro do dia e do período (P9): sem a chave, o ramo não registra nada. */
    registro: Partial<Record<Escala, GestosDoRegistro>>;
    /**
     * As coleções (P10b): as notas de tipos que já existem, da casa do protocolo dono, postas
     * no tempo pelos campos delas (`colecoes.ts`); uma coluna as mostra por `colecoes.<id>`.
     */
    colecoes: ColecaoDoRamo[];
    /**
     * O recorte das tarefas (P10b): só as que têm uma destas tags ou são da linhagem de um destes
     * projetos (a SMART mãe, os auxiliares; 02/11, a proposta da viagem nos ciclos, §5); as duas vazias = todas.
     * A `marca` (02/11, o que a Missão trouxe dos canvas da semana e do trimestre): o emoji que o dia e a semana
     * mostram, em toda a Missão, quando uma tarefa do recorte cai neles; sem ela, o recorte não marca nada.
     */
    recorte: { tags: string[]; projetos: string[]; marca?: string };
    /**
     * A formação do ramo (30/10), só nos eixos que ele declara: vale no ramo aberto nele para o
     * tipo que não declara a sua (`formacaoDoNo`, formacao.ts); sem a chave, o padrão da espécie.
     */
    formacao?: FormacaoDeclarada;
}

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const lista = (v: unknown) => (Array.isArray(v) ? v.map(texto).filter(Boolean) : typeof v === 'string' && v.trim() ? [v.trim()] : []);
const escalasDe = (v: unknown) => lista(v).filter((e): e is Escala => (ESCALAS as readonly string[]).includes(e));

/** A lista de uma fonte de coleção: só a lista (o texto solto não vale), como as coleções sempre leram. */
const listaDaColecao = (v: unknown) => (Array.isArray(v) ? v.map(texto).filter(Boolean) : []);
const FORMATOS: ReadonlyArray<CampoDaFonte['formato']> = ['texto', 'data', 'reais'];

/**
 * O que faz: lê e confere as coleções de um ramo.
 * Por quê: as notas de cada coluna moram na casa de quem as grava, o protocolo dono (a `targetFolder`) ou,
 * na nota que nenhum protocolo grava, o modelo dela (`dominio`, a estadia, 30/10); o juiz em Python confere
 * a mesma forma (`branch_problems`).
 * Entra → sai: o bloco cru e a lista de problemas (acrescida) → as coleções válidas.
 * Erro e ataque: coleção sem id ou repetida sai; fonte sem protocolo ou tipo sai; fonte sem
 * modo de cair no tempo (fora de uma coleção de vínculo) sai; `ate` sem `de` é ignorado com o
 * problema dito; vínculo que aponta coleção que não existe, ou a própria, sai.
 * Prova: tests/missao/colecoes.test.ts ("ler").
 */
export function lerColecoes(raw: unknown, problemas: string[]): ColecaoDoRamo[] {
    if (raw === undefined) return [];
    if (!Array.isArray(raw)) { problemas.push('colecoes: precisa ser uma lista'); return []; }
    const out: ColecaoDoRamo[] = [];
    raw.forEach((c: any, i: number) => {
        const id = texto(c?.id);
        const onde = `colecoes[${i}]`;
        if (!id) { problemas.push(`${onde}: a coleção precisa de id`); return; }
        if (out.some(x => x.id === id)) { problemas.push(`${onde}: a coleção ${id} se repete`); return; }
        // A coleção por referência (05/11) chega aqui já trocada pela do outro ramo (`comAsColecoesDosOutros`); a que
        // ainda diz `de` não foi resolvida: o ramo dela não foi lido, ou não tem a coleção.
        if (c?.de !== undefined) { problemas.push(`${onde}: a coleção ${id} vem do ramo ${texto(c.de) || '(vazio)'}, que não foi lido ou não a tem`); return; }
        const vinculo = c?.vinculo && texto(c.vinculo.colecao) && texto(c.vinculo.campo) ? { colecao: texto(c.vinculo.colecao), campo: texto(c.vinculo.campo) } : null;
        if (c?.vinculo !== undefined && !vinculo) problemas.push(`${onde}: o vínculo precisa de colecao e campo`);
        const fontes: FonteDaColecao[] = [];
        (Array.isArray(c?.fontes) ? c.fontes : []).forEach((f: any, j: number) => {
            const where = `${onde}.fontes[${j}]`;
            const protocolo = texto(f?.protocolo), dominio = texto(f?.dominio), casa = texto(f?.casa).replace(/\/+$/, ''), type = texto(f?.type);
            if ((!protocolo && !dominio && !casa) || !type) { problemas.push(`${where}: a fonte precisa de protocolo (ou dominio, ou casa) e type`); return; }
            if (protocolo && dominio) { problemas.push(`${where}: a fonte diz protocolo e dominio; a casa é de um só`); return; }
            if (casa && (protocolo || dominio)) { problemas.push(`${where}: a fonte diz casa e ${protocolo ? 'protocolo' : 'dominio'}; a casa é de um só`); return; }
            const de = texto(f?.de) || null, segue = texto(f?.segue) || null, lugar = f?.lugar === true;
            let desde = texto(f?.desde) || null;
            if (desde && !DIA.test(desde)) { problemas.push(`${where}: \`desde\` precisa ser um dia (AAAA-MM-DD)`); desde = null; }
            let ate = texto(f?.ate) || null;
            if (ate && !de && !desde) { problemas.push(`${where}: \`ate\` sem \`de\` não vale`); ate = null; }
            if (!vinculo && !de && !desde && !segue && !lugar) { problemas.push(`${where}: a fonte precisa de de, desde, segue ou lugar (como a nota cai no tempo)`); return; }
            const usada = lerUsada(f?.usada, where, problemas);
            const campos: CampoDaFonte[] = (Array.isArray(f?.campos) ? f.campos : []).map((x: any) => ({
                nome: texto(x?.nome), rotulo: texto(x?.rotulo) || texto(x?.nome),
                formato: (FORMATOS as readonly string[]).includes(x?.formato) ? x.formato : 'texto', nota: texto(x?.nota) || null,
            })).filter((x: CampoDaFonte) => x.nome);
            const t = f?.trecho;
            const trecho = t && texto(t.de) && texto(t.para) && texto(t.data) ? { de: texto(t.de), para: texto(t.para), data: texto(t.data) } : null;
            if (t !== undefined && !trecho) problemas.push(`${where}: o trecho precisa de de, para e data`);
            const com = lerPresenca(f?.com, `${where}.com`, problemas), sem = lerPresenca(f?.sem, `${where}.sem`, problemas);
            const nosDois = com.find(c => sem.includes(c));
            if (nosDois) problemas.push(`${where}: o campo ${nosDois} está no com e no sem`);
            fontes.push({ protocolo: protocolo || null, dominio: dominio || null, casa: casa || null, type, rotulo: texto(f?.rotulo) || type, titulo: texto(f?.titulo) || null, de, ate, desde, usada, segue, lugar, linha: listaDaColecao(f?.linha), campos, trecho, filtro: lerFiltro(f?.filtro, where, problemas), ...(com.length ? { com } : {}), ...(sem.length ? { sem } : {}) });
        });
        // O vínculo sem fonte (02/11) é a coleção dos valores do campo: o nó só com o nome, sem nota.
        const soValores = !!vinculo && Array.isArray(c?.fontes) && c.fontes.length === 0;
        if (!fontes.length && !soValores) { problemas.push(`${onde}: a coleção ${id} não tem fonte válida`); return; }
        const ordem = lerOrdem(c?.ordem, onde, problemas);
        const conta = lerConta(c?.conta, !!vinculo, onde, problemas);
        out.push({ id, rotulo: texto(c?.rotulo) || id, fontes, vinculo, ...(ordem ? { ordem } : {}), ...(conta ? { conta } : {}) });
    });
    for (const c of out) {
        if (c.vinculo && (c.vinculo.colecao === c.id || !out.some(x => x.id === c.vinculo!.colecao))) {
            problemas.push(`colecoes: o vínculo de ${c.id} aponta a coleção ${c.vinculo.colecao}, que não existe`);
            c.vinculo = null;
        }
        // A contagem só lê coleções que existem e não a própria; sem nenhuma, a do vínculo.
        if (c.conta && c.vinculo) {
            const fora = c.conta.colecoes.filter(x => x === c.id || !out.some(o => o.id === x));
            for (const x of fora) problemas.push(`colecoes: a conta de ${c.id} lê a coleção ${x}, que não existe ou é a própria`);
            const ficam = c.conta.colecoes.filter(x => !fora.includes(x));
            c.conta = { ...c.conta, colecoes: ficam.length ? ficam : [c.vinculo.colecao] };
        }
        // A `usada` só lê coleções que existem e não a própria (a nota não sai por apontar a si mesma).
        for (const f of c.fontes) {
            if (!f.usada) continue;
            const fora = f.usada.colecoes.filter(x => x === c.id || !out.some(o => o.id === x));
            for (const x of fora) problemas.push(`colecoes: a usada de ${c.id} lê a coleção ${x}, que não existe ou é a própria`);
            const ficam = f.usada.colecoes.filter(x => !fora.includes(x));
            f.usada = ficam.length ? { colecoes: ficam, campo: f.usada.campo } : null;
        }
    }
    return out;
}

/**
 * O que faz: os ids dos ramos que as coleções por referência de um ramo cru citam (`{ "id": "<coleção>", "de": "<ramo>" }`),
 * sem repetir e sem o próprio.
 * Por quê: quem lê o ramo do cofre lê também esses arquivos antes de `comAsColecoesDosOutros` (a leitura é da borda).
 * Entra → sai: o ramo cru → os ids, na ordem em que aparecem.
 */
export function ramosCitadosPelasColecoes(raw: unknown): string[] {
    const r = raw as any;
    if (!r || typeof r !== 'object' || !Array.isArray(r.colecoes)) return [];
    const out: string[] = [];
    for (const c of r.colecoes) { const de = texto(c?.de); if (de && de !== texto(r.id) && !out.includes(de)) out.push(de); }
    return out;
}

/**
 * O que faz: o ramo cru com as coleções por referência resolvidas: cada `{ "id": "<coleção>", "de": "<ramo>" }` vira
 * uma cópia da coleção de mesmo id do outro ramo, um nível só (a coleção de lá que também é referência não se segue).
 * Por quê: 05/11, a frente de renda no Projetos: o projeto conta as peças da semana pelas mesmas coleções da Criação, e
 * a coleção tem um dono só (as sete fontes das peças moram no ramo Criação, e não numa cópia no Projetos). O juiz em
 * Python resolve igual (`resolve_branch_references`).
 * Entra → sai: o ramo cru e o leitor dos outros ramos crus pelo id → o ramo cru (uma cópia rasa; a entrada não muda).
 * Erro e ataque: o ramo que não se lê (o leitor lança ou devolve nada), a coleção que ele não tem e a referência ao
 * próprio ramo ficam como estão, e `lerColecoes` diz o problema; o leitor é chamado uma vez por ramo.
 * Prova: tests/engine/refinosDosRamos.test.ts e os casos compartilhados com o juiz.
 */
export function comAsColecoesDosOutros(raw: unknown, outro: (id: string) => unknown): unknown {
    const r = raw as any;
    if (!r || typeof r !== 'object' || Array.isArray(r) || !Array.isArray(r.colecoes)) return raw;
    const lidos = new Map<string, unknown[] | null>();
    const colecoesDe = (id: string): unknown[] | null => {
        if (!lidos.has(id)) {
            let lista: unknown[] | null = null;
            try { const o = outro(id) as any; lista = Array.isArray(o?.colecoes) ? o.colecoes : null; } catch (e) { lista = null; }
            lidos.set(id, lista);
        }
        return lidos.get(id) ?? null;
    };
    const colecoes = r.colecoes.map((c: any) => {
        const de = texto(c?.de), id = texto(c?.id);
        if (!de || !id || de === texto(r.id)) return c;
        const achada = colecoesDe(de)?.find((x: any) => texto(x?.id) === id && x?.de === undefined);
        return achada ? JSON.parse(JSON.stringify(achada)) : c;
    });
    return { ...r, colecoes };
}

/**
 * O que faz: a `usada` de uma fonte: `{ "colecoes": ["<coleção>", …], "campo": "<campo de link>" }`; sem a chave, `null`.
 * Por quê: 03/11, o fluxo da ideia ao vídeo: a ideia (a capturada ou a do banco antigo) sai da coluna Ideias quando um
 * roteiro a aponta pelo campo `ideia`, e não aparece duas vezes.
 * Erro e ataque: o que não é objeto, sem campo ou sem coleção vira problema e fica `null` (nada sai).
 * Prova: tests/missao/colecoesDosBancos.test.ts e os casos compartilhados com o juiz.
 */
function lerUsada(raw: unknown, onde: string, problemas: string[]): FonteDaColecao['usada'] {
    if (raw === undefined) return null;
    const ok = raw && typeof raw === 'object' && !Array.isArray(raw);
    const campo = ok ? texto((raw as any).campo) : '';
    const colecoes = ok ? listaDaColecao((raw as any).colecoes) : [];
    if (!campo || !colecoes.length) { problemas.push(`${onde}.usada: precisa de colecoes e campo`); return null; }
    return { colecoes, campo };
}

/**
 * O que faz: o filtro de uma fonte de coleção: `{ "<campo>": ["valor", …] }`; sem a chave, `{}` (todas as notas).
 * Por quê: 02/11, o ramo de Roteiros: o longo e o corte são o mesmo tipo e moram em colunas diferentes.
 * Erro e ataque: o que não é objeto, ou o campo cuja lista não tem texto, vira problema e fica de fora
 * (a fonte segue sem aquele filtro).
 * Prova: tests/missao/colecoesFiltradas.test.ts e os casos compartilhados com o juiz.
 */
function lerFiltro(raw: unknown, onde: string, problemas: string[]): Record<string, string[]> {
    if (raw === undefined) return {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { problemas.push(`${onde}.filtro: precisa ser um objeto campo → valores`); return {}; }
    const out: Record<string, string[]> = {};
    for (const [campo, v] of Object.entries(raw as Record<string, unknown>)) {
        const valores = listaDaColecao(v);
        if (!campo.trim() || !valores.length) { problemas.push(`${onde}.filtro.${campo}: precisa de uma lista de valores`); continue; }
        out[campo.trim()] = valores;
    }
    return out;
}

/**
 * O que faz: a lista do `com` ou do `sem` de uma fonte: os nomes dos campos; sem a chave, vazia.
 * Por quê: 03/11, o ramo Criação: a peça e o desdobramento são o mesmo tipo, separados por ter ou não o `de`.
 * Erro e ataque: o que não é lista de textos vira problema e fica vazio (a fonte segue sem a condição).
 * Prova: tests/missao/colecoesDaCriacao.test.ts e os casos compartilhados com o juiz.
 */
function lerPresenca(raw: unknown, onde: string, problemas: string[]): string[] {
    if (raw === undefined) return [];
    const nomes = listaDaColecao(raw);
    if (!Array.isArray(raw) || !nomes.length || nomes.length !== raw.length) { problemas.push(`${onde}: precisa ser uma lista de campos`); return []; }
    return nomes;
}

/**
 * O que faz: a ordem de uma coleção: `{ "campo": "<campo de data>", "semValor": "recente" | "antigo" }`; sem a chave, `null`.
 * Por quê: 02/11, o ramo de Roteiros: o centro e a coluna mostram primeiro o próximo a publicar.
 * Erro e ataque: sem campo, ou o que não é objeto, vira problema e fica `null` (a ordem de sempre); o `semValor`
 * desconhecido vira problema e fica `antigo` (o de sempre).
 * Prova: tests/missao/colecoesOrdem.test.ts e os casos compartilhados com o juiz.
 */
/**
 * O que faz: lê a contagem de uma coleção (`conta`, 05/11): o campo da data e o texto de ausência.
 * Erro e ataque: sem o campo da data, ou numa coleção que não é de vínculo, o problema é dito e a contagem fica de fora
 * (o juiz em Python, `_branch_collections`, diz as mesmas mensagens); sem o `vazio`, "sem nota no plano".
 * Prova: tests/missao/contaDaColecao.test.ts.
 */
function lerConta(raw: unknown, deVinculo: boolean, onde: string, problemas: string[]): ContaDaColecao | null {
    if (raw === undefined) return null;
    const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? texto((raw as any).data) : '';
    if (!data) { problemas.push(`${onde}.conta: precisa de data`); return null; }
    if (!deVinculo) { problemas.push(`${onde}.conta: só vale numa coleção de vínculo`); return null; }
    const cols = (raw as any).colecoes;
    if (cols !== undefined && !(Array.isArray(cols) && cols.length && cols.every((x: unknown) => texto(x)))) problemas.push(`${onde}.conta.colecoes: precisa ser uma lista de coleções`);
    const colecoes = Array.isArray(cols) ? cols.map(texto).filter(Boolean) : [];
    return { data, colecoes, vazio: texto((raw as any).vazio) || 'sem nota no plano' };
}

function lerOrdem(raw: unknown, onde: string, problemas: string[]): OrdemDaColecao | null {
    if (raw === undefined) return null;
    const campo = raw && typeof raw === 'object' && !Array.isArray(raw) ? texto((raw as any).campo) : '';
    if (!campo) { problemas.push(`${onde}.ordem: precisa de campo`); return null; }
    const sem = (raw as any).semValor;
    if (sem !== undefined && sem !== 'recente' && sem !== 'antigo') problemas.push(`${onde}.ordem.semValor: só vale "recente" ou "antigo"`);
    return { campo, semValor: sem === 'recente' ? 'recente' : 'antigo' };
}

/**
 * O que faz: os hábitos do dia que o centro do ramo mostra: todos (`true`), nenhum (`false`) ou só os da lista, pelo nome
 * da nota (sem a pasta e o `.md`) ou pelo título, sem maiúscula nem acento.
 * Por quê: 03/11, o fluxo da ideia ao vídeo: o dia do ramo de Roteiros mostra o hábito de gravar, e não os outros.
 * Entra → sai: os hábitos da linha e a escolha do ramo → os que ficam, na ordem de entrada.
 * Erro e ataque: o nome da lista que não é hábito não mostra nada; a lista vazia não chega aqui (vira problema na leitura).
 * Prova: tests/missao/colecoesDosBancos.test.ts ("o hábito no dia do ramo").
 */
export function habitosDoCentro<T extends { caminho: string; titulo: string }>(habitos: readonly T[], escolha: boolean | readonly string[] | undefined): T[] {
    if (escolha === false) return [];
    if (!Array.isArray(escolha)) return [...habitos];
    const quero = new Set(escolha.map(n => fold(n)));
    const nome = (c: string) => fold(c.slice(c.lastIndexOf('/') + 1).replace(/\.md$/, ''));
    return habitos.filter(h => quero.has(nome(h.caminho)) || quero.has(fold(h.titulo)));
}

/** O que faz: um valor por escala (o mesmo em todas, ou um por escala). */
export function naEscala<T>(v: PorEscala<T> | undefined, escala: Escala, padrao: T): T {
    if (v === undefined || v === null) return padrao;
    if (typeof v === 'object' && !Array.isArray(v)) return ((v as Partial<Record<Escala, T>>)[escala] ?? padrao) as T;
    return v as T;
}

function lerColuna(raw: any, onde: string, problemas: string[], doRamoPrincipal: string): ColunaDoRamo | null {
    const id = texto(raw?.id), fonte = texto(raw?.fonte), painel = texto(raw?.painel);
    if (!id || !fonte || !painel) { problemas.push(`${onde}: a coluna precisa de id, fonte e painel`); return null; }
    return {
        id, fonte, painel, rotulo: texto(raw.rotulo) || id, tipo: lista(raw.tipo), pendentes: texto(raw.pendentes) || null, horarios: texto(raw.horarios) || null,
        escalas: escalasDe(raw.escalas), largura: raw.largura ?? 'minmax(110px,1fr)', celular: raw.celular ?? 1,
        faixas: raw.faixas === true, junto: raw.junto === true, marcas: raw.marcas === true, nota: raw.nota === true,
        vazio: lerVazio(raw.vazio, onde, problemas), amplia: lerAmplia(raw.amplia, onde, doRamoPrincipal, problemas), ligacoes: lerLigacoesDaColuna(raw.ligacoes, onde, problemas),
        antesDoCentro: lerAntesDoCentro(raw.antesDoCentro, onde, problemas),
    };
}

/**
 * O que faz: se a coluna da asa do tempo vem antes do centro (`"antesDoCentro": true`); sem a chave, `false`.
 * Erro e ataque: o que não é `true` nem `false` vira problema e fica `false` (a coluna segue depois do centro).
 * Prova: os casos compartilhados com o juiz (tests/fixtures/ramos/casos.json) e tests/missao/ramoPrincipal.test.ts.
 */
function lerAntesDoCentro(raw: unknown, onde: string, problemas: string[]): boolean {
    if (raw === undefined) return false;
    if (typeof raw === 'boolean') return raw;
    problemas.push(`${onde}.antesDoCentro: precisa ser true ou false`);
    return false;
}

/**
 * O que faz: de onde vêm as ligações da coluna: `"ligacoes": "padrao"` (as conexões padrão dos
 * modelos de tipo); sem a chave, `null` (as da Missão).
 * Erro e ataque: outro valor vira problema e fica `null` (a coluna segue com as da Missão).
 * Prova: os casos compartilhados com o juiz (tests/fixtures/ramos/casos.json).
 */
function lerLigacoesDaColuna(raw: unknown, onde: string, problemas: string[]): 'padrao' | null {
    if (raw === undefined || raw === null) return null;
    if (raw === 'padrao') return 'padrao';
    problemas.push(`${onde}.ligacoes: só vale "padrao"`);
    return null;
}

/**
 * O que faz: o ramo que amplia uma coluna ou o lugar: o id dele (`"amplia": "<ramo>"`), ou
 * `{ "ramo": "<id>", "tipos": ["<domínio>", …] }`; sem a chave, `null`.
 * Por quê: G7 (29/10): a porta "Ver no ramo" e o seletor leem do ramo quem pertence a quem.
 * Erro e ataque: a chave sem o id de um ramo, os tipos que não são lista de textos e o ramo
 * que amplia a si mesmo viram problema e ficam de fora (a porta não aparece); o tipo vazio cai.
 * Prova: tests/missao/ramoPrincipal.test.ts ("a ampliação") e os casos compartilhados com o juiz.
 */
function lerAmplia(raw: unknown, onde: string, doRamoPrincipal: string, problemas: string[]): Ampliacao | null {
    if (raw === undefined || raw === null) return null;
    const ramo = typeof raw === 'string' ? raw.trim() : texto((raw as any)?.ramo);
    if (!ramo || Array.isArray(raw)) { problemas.push(`${onde}.amplia: precisa do id de um ramo`); return null; }
    const tiposCrus = typeof raw === 'object' ? (raw as any).tipos : undefined;
    if (tiposCrus !== undefined && (!Array.isArray(tiposCrus) || tiposCrus.some(t => typeof t !== 'string'))) { problemas.push(`${onde}.amplia: os tipos precisam ser uma lista de textos`); return null; }
    if (ramo === doRamoPrincipal) { problemas.push(`${onde}.amplia: o ramo não amplia a si mesmo`); return null; }
    return { ramo, tipos: Array.isArray(tiposCrus) ? tiposCrus.map(texto).filter(Boolean) : [] };
}

/**
 * O que faz: o ramo que amplia um nó: o do lugar, quando o nó mora no lugar (a passagem); a da
 * coluna dele; ou a que declara o tipo dele (o domínio do modelo: a cidade, o país).
 * Por quê: G7, a porta 3 ("Ver no ramo Viagem" no painel do nó): quem amplia o quê mora no
 * arquivo do ramo, e o componente só pergunta aqui.
 * Entra → sai: o ramo e onde o nó mora → o id do ramo que o amplia, ou `null` (nenhuma porta).
 * Erro e ataque: um nó sem lugar, coluna nem tipo que o ramo declare não tem porta; nunca o próprio ramo.
 * Prova: tests/missao/ramoPrincipal.test.ts ("a ampliação").
 */
export function ramoQueAmplia(ramoPrincipal: RamoPrincipal, onde: { lugar?: boolean; coluna?: string | null; tipo?: string | null }): string | null {
    const todas = [...(ramoPrincipal.lugar?.amplia ? [ramoPrincipal.lugar.amplia] : []), ...[...ramoPrincipal.trabalho, ...ramoPrincipal.tempo].map(c => c.amplia).filter((a): a is Ampliacao => !!a)];
    const achada = (onde.lugar ? ramoPrincipal.lugar?.amplia : null)
        ?? (onde.coluna ? [...ramoPrincipal.trabalho, ...ramoPrincipal.tempo].find(c => c.id === onde.coluna)?.amplia : null)
        ?? (onde.tipo ? todas.find(a => a.tipos.includes(onde.tipo!)) : null);
    return achada && achada.ramo !== ramoPrincipal.id ? achada.ramo : null;
}

/**
 * O que faz: o vazio de uma coluna (a frase, ou `{ texto, protocolos, novos }`); sem a chave, `null`.
 * Os `novos` são tipos do Novo do ramo: quem confere que estão no seletor é `vaziosComONovo`, depois do Novo lido.
 */
function lerVazio(raw: unknown, onde: string, problemas: string[]): VazioDaColuna | null {
    if (raw === undefined || raw === null) return null;
    if (typeof raw === 'string') return raw.trim() ? { texto: raw.trim(), protocolos: [], novos: [] } : null;
    const t = texto((raw as any)?.texto);
    if (!t) { problemas.push(`${onde}: o vazio precisa de texto`); return null; }
    return { texto: t, protocolos: lista((raw as any)?.protocolos), novos: lista((raw as any)?.novos) };
}

/**
 * O que faz: confere os `novos` do vazio de cada coluna contra o seletor do Novo do ramo: o tipo que o seletor
 * não tem sai, com o problema dito (o botão não aparece).
 * Por quê: 05/11, o diagnóstico dos ramos: a Estadia vazia da Viagem oferece também o "+ Estadia", e a Canais vazia
 * da Criação, o "+ Canal": o vazio abre o mesmo Novo do ramo, e não um caminho novo; o juiz em Python
 * (`branch_problems`) diz a mesma mensagem.
 * Entra → sai: as colunas, o Novo lido e os problemas (acrescidos) → nada (o `novos` de cada vazio fica só com os do seletor).
 * Prova: os casos compartilhados com o juiz (tests/fixtures/ramos/casos.json) e tests/engine/refinosDosRamos.test.ts.
 */
function vaziosComONovo(colunas: ColunaDoRamo[], novo: NovoDoRamo, problemas: string[]): void {
    for (const c of colunas) {
        if (!c.vazio?.novos.length) continue;
        const fora = c.vazio.novos.filter(t => !novo.tipos.some(x => x.tipo === t));
        for (const t of fora) problemas.push(`a coluna ${c.id}: o vazio cria o tipo ${t}, que não está no seletor do Novo`);
        if (fora.length) c.vazio = { ...c.vazio, novos: c.vazio.novos.filter(t => !fora.includes(t)) };
    }
}

/**
 * O que faz: os botões do ciclo de cada escala, conferidos.
 * Erro e ataque: botão sem emoji, rótulo ou protocolo sai (com o problema dito); escala
 * desconhecida sai; variável que não é texto sai; a ponta que falta é `inicio` no primeiro
 * botão e `fim` nos outros (como no protótipo, template 2250).
 */
function lerCiclos(raw: unknown, problemas: string[]): RamoPrincipal['ciclos'] {
    const out: RamoPrincipal['ciclos'] = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [escala, lista] of Object.entries(raw as Record<string, unknown>)) {
        if (!(ESCALAS as readonly string[]).includes(escala)) { problemas.push(`ciclos: a escala ${escala} não existe`); continue; }
        const botoes: BotaoDoCiclo[] = [];
        (Array.isArray(lista) ? lista : []).forEach((b: any, i: number) => {
            const emoji = texto(b?.emoji), rotulo = texto(b?.rotulo), protocolo = texto(b?.protocolo);
            if (!emoji || !rotulo || !protocolo) { problemas.push(`ciclos.${escala}[${i}]: o botão precisa de emoji, rótulo e protocolo`); return; }
            const variaveis: Record<string, string> = {};
            for (const [k, v] of Object.entries(b?.variaveis ?? {})) if (typeof v === 'string') variaveis[k] = v;
            const ponta = b?.ponta === 'inicio' || b?.ponta === 'fim' ? b.ponta : botoes.length ? 'fim' : 'inicio';
            botoes.push({ emoji, rotulo, dica: texto(b?.dica) || `${emoji} ${rotulo}`, protocolo, ponta, variaveis });
        });
        if (botoes.length) out[escala as Escala] = botoes;
    }
    return out;
}

/**
 * O que faz: o "escolher" de um item do `novo.no`: `"soltar"`, ou `{ "campo": "<nome>", "grava":
 * "escolhida" | "origem" }`; o que não for nenhum dos dois → `null` (o problema é de quem chama).
 */
function lerEscolha(raw: unknown): EscolhaDoNo | null {
    if (texto(raw) === 'soltar') return { gesto: 'soltar' };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const campo = texto((raw as any).campo);
    const grava = texto((raw as any).grava);
    if (!campo || (grava !== 'escolhida' && grava !== 'origem')) return null;
    return { gesto: 'campo', campo, grava };
}

/**
 * O que faz: o Novo do ramo, conferido: os tipos do seletor, o que cada espécie de nó cria e as
 * etiquetas que a tarefa criada nela leva.
 * Erro e ataque: tipo sem id sai (com o problema dito); rótulo ou título que falta vira o id;
 * tipo repetido no seletor sai; o que um nó cria e o seletor não tem sai (com o problema); as
 * etiquetas que não são lista, ou a etiqueta vazia, saem (com o problema); o `#` da frente cai;
 * o `escolher` que não é `"soltar"` nem um campo com `grava` sai (com o problema), e o item só cria.
 */
function lerNovo(raw: unknown, problemas: string[]): NovoDoRamo {
    const out: NovoDoRamo = { tipos: [], no: {}, etiquetas: [] };
    if (!raw || typeof raw !== 'object') return out;
    const r = raw as any;
    (Array.isArray(r.tipos) ? r.tipos : []).forEach((t: any, i: number) => {
        const tipo = texto(t?.tipo);
        if (!tipo) { problemas.push(`novo.tipos[${i}]: o tipo precisa de id`); return; }
        if (out.tipos.some(x => x.tipo === tipo)) { problemas.push(`novo.tipos[${i}]: o tipo ${tipo} se repete`); return; }
        out.tipos.push({ tipo, rotulo: texto(t?.rotulo) || tipo, titulo: texto(t?.titulo) || texto(t?.rotulo) || tipo });
    });
    for (const [especie, lista] of Object.entries(r.no && typeof r.no === 'object' ? r.no : {})) {
        const itens: NovoDoNo[] = [];
        for (const it of Array.isArray(lista) ? lista : []) {
            const tipo = texto((it as any)?.tipo);
            const doSeletor = out.tipos.find(x => x.tipo === tipo);
            if (!doSeletor) { problemas.push(`novo.no.${especie}: o tipo ${tipo || '(vazio)'} não está no seletor`); continue; }
            const item: NovoDoNo = { tipo, rotulo: texto((it as any)?.rotulo) || doSeletor.titulo };
            const escolher = (it as any)?.escolher;
            if (escolher !== undefined) {
                const e = lerEscolha(escolher);
                if (e) item.escolher = e;
                else problemas.push(`novo.no.${especie}: o escolher de ${tipo} precisa ser "soltar" ou um campo com grava escolhida ou origem`);
            }
            itens.push(item);
        }
        if (itens.length) out.no[especie] = itens;
    }
    if (r.etiquetas !== undefined) {
        if (!Array.isArray(r.etiquetas)) problemas.push('novo.etiquetas: precisa ser uma lista');
        else r.etiquetas.forEach((e: unknown, i: number) => {
            const t = texto(e).replace(/^#/, '');
            if (!t) { problemas.push(`novo.etiquetas[${i}]: a etiqueta precisa ser um texto`); return; }
            if (!out.etiquetas.includes(t)) out.etiquetas.push(t);
        });
    }
    return out;
}

const GESTOS_DO_REGISTRO = ['feito', 'atalho', 'nota', 'saldo'] as const;
/** O que cada gesto precisa declarar, além do rótulo. */
const PEDE: Record<(typeof GESTOS_DO_REGISTRO)[number], Array<'campo' | 'data' | 'protocolo' | 'passo'>> = {
    feito: [], atalho: ['campo'], nota: ['campo', 'protocolo', 'passo'], saldo: ['campo', 'data'],
};

/**
 * O que faz: lê o registro do ramo (P9): por escala, os gestos conhecidos, cada um com o
 * rótulo e o que ele grava.
 * Erro e ataque: escala ou gesto desconhecido, sem rótulo ou sem o campo que o gesto pede
 * viram problema e ficam de fora (o botão não aparece).
 * Prova: tests/missao/ramoPrincipal.test.ts ("o registro").
 */
function lerRegistro(raw: unknown, problemas: string[]): RamoPrincipal['registro'] {
    const out: RamoPrincipal['registro'] = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [escala, gestos] of Object.entries(raw as Record<string, unknown>)) {
        if (!(ESCALAS as readonly string[]).includes(escala)) { problemas.push(`registro: a escala ${escala} não existe`); continue; }
        const daEscala: GestosDoRegistro = {};
        for (const [nome, g] of Object.entries(gestos && typeof gestos === 'object' ? gestos as Record<string, any> : {})) {
            if (!(GESTOS_DO_REGISTRO as readonly string[]).includes(nome)) { problemas.push(`registro.${escala}: o gesto ${nome} não existe`); continue; }
            const gesto: GestoDeRegistro = {
                rotulo: texto(g?.rotulo), dica: texto(g?.dica) || texto(g?.rotulo),
                campo: texto(g?.campo) || null, data: texto(g?.data) || null, protocolo: texto(g?.protocolo) || null, passo: texto(g?.passo) || null,
            };
            const faltam = PEDE[nome as keyof typeof PEDE].filter(k => !gesto[k]);
            if (!gesto.rotulo || faltam.length) { problemas.push(`registro.${escala}.${nome}: falta ${[!gesto.rotulo ? 'rotulo' : '', ...faltam].filter(Boolean).join(', ')}`); continue; }
            daEscala[nome as keyof GestosDoRegistro] = gesto;
        }
        if (Object.keys(daEscala).length) out[escala as Escala] = daEscala;
    }
    return out;
}

/**
 * O que faz: o dia de contexto de um período: hoje, quando hoje cai nele; senão, o primeiro
 * dia dele (a segunda-feira da semana; no trimestre, a da primeira semana dele, cuja
 * quinta-feira é do trimestre).
 * Por quê: os protocolos do ciclo leem o período pela data de contexto (`_context_date`) e a
 * nota de ciclo usa a segunda-feira (`jsonProtocol.getLedgerDate`); hoje vence quando é do período.
 * Entra → sai: a escala, a chave e hoje → `AAAA-MM-DD`, ou `null` (prateleira, chave inválida).
 */
export function dataDoPeriodo(escala: Escala, chave: string, hoje: string): string | null {
    if (isChaveEspecial(chave)) return null;
    const dias = diasDoPeriodo(escala, chave);
    if (!dias.length) return null;
    return dias.includes(hoje) ? hoje : dias[0];
}

/**
 * O que faz: os botões do ciclo de um período, com as variáveis resolvidas (`{chave}`, `{data}`).
 * Por quê: §1 ("os botões do ciclo"), plano §3 ("os botões do ciclo nas pontas: ▶️/🌙 no dia,
 * 🌳/📨/📅 na semana, 🧭/🔄 no trimestre"); a lista é do ramo (§3.8), e o componente só os
 * desenha e chama o protocolo do jeito que o painel já chama (`MissionBoard.runProtocol`).
 * Com `existe` (o "o protocolo existe?" do gerente), o botão cujo protocolo o cofre não tem sai
 * (D1 do mapa da v0: o botão só com protocolo, sem aviso nem erro); o índice `i` é o da lista
 * que sobra, o mesmo que o clique lê.
 * Entra → sai: o ramo, a escala, a chave, hoje e o `existe` → os botões (vazio na prateleira e na escala sem ciclo).
 * Erro e ataque: variável com marcador desconhecido fica como está; `{data}` sem dia sai da lista;
 * o `existe` que lança conta como ausente.
 * Prova: tests/missao/ramoPrincipal.test.ts ("os ciclos", "o botão só com protocolo").
 */
export function ciclosDoPeriodo(ramoPrincipal: RamoPrincipal, escala: Escala, chave: string, hoje: string, existe?: (id: string) => boolean): CicloDoPeriodo[] {
    const tem = (id: string) => { if (!existe) return true; try { return existe(id); } catch (e) { return false; } };
    const lista = (ramoPrincipal.ciclos?.[escala] ?? []).filter(b => tem(b.protocolo));
    if (!lista.length || isChaveEspecial(chave)) return [];
    const data = dataDoPeriodo(escala, chave, hoje);
    return lista.map((b, i) => {
        const valores: Record<string, string> = {};
        for (const [k, v] of Object.entries(b.variaveis)) {
            if (v.includes('{data}') && !data) continue;
            valores[k] = v.replace(/\{chave\}/g, chave).replace(/\{data\}/g, data ?? '');
        }
        return { ...b, escala, chave, i, valores };
    });
}

/** O id de um ramo: o nome do arquivo (letras, números, hífen e sublinhado), o mesmo que o estado guardado aceita. */
const ID_DO_RAMO = /^[a-z0-9_-]+$/i;

/**
 * O que faz: os ids antigos de um ramo (`antes`): uma lista de ids de arquivo, sem o próprio.
 * Por quê: 03/11, o Roteiros virou Criação: o id muda com o arquivo, e o que se guardou com o antigo não se perde.
 * Erro e ataque: o que não é lista de ids, ou o próprio id, vira problema e fica de fora.
 * Prova: tests/missao/ramoRenomeado.test.ts e os casos compartilhados com o juiz.
 */
function lerAntes(raw: unknown, id: string, problemas: string[]): string[] {
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || !raw.length || !raw.every(x => typeof x === 'string' && ID_DO_RAMO.test(x.trim()))) { problemas.push('antes: precisa ser uma lista de ids de ramo'); return []; }
    const out = [...new Set(raw.map(x => (x as string).trim()))];
    if (out.includes(id)) { problemas.push('antes: o ramo não pode ter o próprio id entre os antigos'); return out.filter(x => x !== id); }
    return out;
}

/**
 * O que faz: o id atual de um ramo pedido por um id que talvez seja antigo: o próprio, quando um ramo tem esse id; o do
 * ramo que o tem no `antes`, quando é antigo; senão, `null`.
 * Por quê: 03/11, o Roteiros virou Criação: o ramo escolhido guardado no aparelho, na aba ou no bloco do canvas com o
 * id antigo abre o novo, sem migrar nada à mão.
 * Entra → sai: o id pedido e os ramos (o id e os antigos de cada um) → o id atual, ou `null`.
 * Erro e ataque: o id que dois ramos dizem ter tido fica com o primeiro da lista; o id atual de um ramo vence o antigo
 * de outro; o vazio não acha nada.
 */
export function idAtualDoRamo(pedido: string | null | undefined, ramos: ReadonlyArray<{ id: string; antes?: readonly string[] }>): string | null {
    const id = String(pedido ?? '').trim();
    if (!id) return null;
    if (ramos.some(r => r.id === id)) return id;
    return ramos.find(r => (r.antes ?? []).includes(id))?.id ?? null;
}

/**
 * O que faz: lê e confere um ramo: o centro, as duas asas, os painéis, as ligações e a formação.
 * Por quê: tudo o que muda de um ramo para outro mora no arquivo dele (§3.8), e o juiz em Python
 * (`branch_problems`) confere a mesma forma com as mesmas mensagens.
 * Entra → sai: o JSON cru → { ramo (ou `null`), problemas }.
 * Erro e ataque: coluna sem id, fonte ou painel sai (com o problema dito); painel que
 * nenhuma declara é problema; traço desconhecido vira contínuo; sem centro, não há ramo.
 * Prova: tests/missao/ramoPrincipal.test.ts ("ler").
 */
export function lerRamoPrincipal(raw: unknown): { ramoPrincipal: RamoPrincipal | null; problemas: string[] } {
    const problemas: string[] = [];
    const r = raw as any;
    if (!r || typeof r !== 'object' || Array.isArray(r)) return { ramoPrincipal: null, problemas: ['o ramo não é um objeto JSON'] };
    const id = texto(r.id);
    if (!id) problemas.push('o ramo precisa de id');
    const antes = lerAntes(r.antes, id, problemas);
    const centroFonte = texto(r.centro?.fonte);
    if (!centroFonte) { problemas.push('o ramo precisa de centro.fonte'); return { ramoPrincipal: null, problemas }; }
    const listaDeHabitos = Array.isArray(r.centro.habitos) ? r.centro.habitos.map(texto).filter(Boolean) : null;
    if (r.centro.habitos !== undefined && typeof r.centro.habitos !== 'boolean' && !listaDeHabitos?.length) problemas.push('centro.habitos: precisa ser true, false ou uma lista de hábitos');
    const formacao = parseFormacao(r.formacao, problemas);
    const ampliaDoLugar = r.lugar ? lerAmplia(r.lugar.amplia, 'lugar', id, problemas) : null;
    const trabalho = (Array.isArray(r.trabalho) ? r.trabalho : []).map((c: unknown, i: number) => lerColuna(c, `trabalho[${i}]`, problemas, id)).filter(Boolean) as ColunaDoRamo[];
    const tempo = (Array.isArray(r.tempo) ? r.tempo : []).map((c: unknown, i: number) => lerColuna(c, `tempo[${i}]`, problemas, id)).filter(Boolean) as ColunaDoRamo[];
    const paineis: PainelDoRamo[] = (Array.isArray(r.paineis) ? r.paineis : []).map((p: any) => ({
        id: texto(p?.id), rotulo: texto(p?.rotulo) || texto(p?.id), dica: texto(p?.dica) || texto(p?.rotulo),
        alinhar: (['start', 'center', 'end'].includes(p?.alinhar) ? p.alinhar : 'start') as PainelDoRamo['alinhar'], noLargo: texto(p?.noLargo) || null,
    })).filter((p: PainelDoRamo) => p.id);
    const centroPainel = texto(r.centro?.painel) || 'centro';
    if (!paineis.some(p => p.id === centroPainel)) paineis.push({ id: centroPainel, rotulo: 'Centro', dica: 'o período em foco', alinhar: 'center', noLargo: null });
    for (const c of [...trabalho, ...tempo]) if (!paineis.some(p => p.id === c.painel)) problemas.push(`a coluna ${c.id} aponta o painel ${c.painel}, que o ramo não declara`);
    const ligacoes: RamoPrincipal['ligacoes'] = {};
    for (const [tipo, v] of Object.entries(r.ligacoes ?? {})) {
        const traco = texto((v as any)?.traco) as Traco;
        ligacoes[tipo] = { traco: TRACOS.includes(traco) ? traco : 'continuo', rotulo: texto((v as any)?.rotulo) || tipo };
    }
    const ramoPrincipal: RamoPrincipal = {
        id: id || 'sem-id', antes, titulo: texto(r.titulo) || id || 'Missão', descricao: texto(r.descricao),
        lugar: r.lugar ? { rotulo: texto(r.lugar.rotulo) || 'Lugar', largura: texto(r.lugar.largura) || '86px', celular: texto(r.lugar.celular) || '10px', amplia: ampliaDoLugar } : null,
        centro: { fonte: centroFonte, tipo: lista(r.centro.tipo), rotulo: r.centro.rotulo ?? {}, largura: r.centro.largura ?? '170px', painel: centroPainel, vazio: texto(r.centro.vazio) || null, habitos: listaDeHabitos?.length ? listaDeHabitos : r.centro.habitos !== false },
        trabalho, tempo, paineis, ligacoes, minimo: r.minimo ?? {}, ciclos: lerCiclos(r.ciclos, problemas), novo: lerNovo(r.novo, problemas), registro: lerRegistro(r.registro, problemas),
        colecoes: lerColecoes(r.colecoes, problemas), recorte: { tags: lista(r.recorte?.tags).map(t => t.replace(/^#/, '').toLowerCase()), projetos: lista(r.recorte?.projetos), ...(texto(r.recorte?.marca) ? { marca: texto(r.recorte?.marca) } : {}) },
        ...(formacao ? { formacao } : {}),
    };
    vaziosComONovo([...trabalho, ...tempo], ramoPrincipal.novo, problemas);
    // A coluna que mostra uma coleção aponta uma que o ramo declara.
    for (const c of [...trabalho, ...tempo]) {
        const m = c.fonte.match(/^colecoes\.(.+)$/);
        if (m && !ramoPrincipal.colecoes.some(x => x.id === m[1])) problemas.push(`a coluna ${c.id} mostra a coleção ${m[1]}, que o ramo não declara`);
    }
    return { ramoPrincipal, problemas };
}

/* ------------------------------------------------------------ o plano da grade */

export interface ColunaNoPlano {
    /** O id da coluna; o centro é `centro` e o lugar é `lugar` (os dois papéis fixos de todo ramo). */
    id: string;
    papel: 'lugar' | 'trabalho' | 'centro' | 'tempo';
    rotulo: string;
    /** A coluna da grade na tela larga e no celular (começam em 1). */
    largo: number;
    celular: number;
    junto: boolean;
    coluna: ColunaDoRamo | null;
}

export interface PainelNoPlano {
    id: string;
    rotulo: string;
    dica: string;
    /** De qual a qual coluna da grade (o fim é exclusivo, como no CSS); `null` = não tem painel nesta forma. */
    largo: { de: number; ate: number; alinhar: PainelDoRamo['alinhar'] } | null;
    celular: { de: number; ate: number } | null;
}

export interface PlanoDaGrade {
    escala: Escala;
    colunas: ColunaNoPlano[];
    /** O `grid-template-columns` da tela larga e do celular (`--P` é a largura de um painel). */
    largo: string;
    celular: string;
    paineis: PainelNoPlano[];
    /** Quantos painéis o celular tem. */
    n: number;
    minimo: number;
}

const fracao = (f: number) => (f >= 1 ? 'var(--P)' : `calc(var(--P) * ${Number(f.toFixed(3))} - 4px)`);

/**
 * O que faz: o plano da grade de um ramo numa escala: as colunas à vista (lugar, asa
 * do trabalho, centro, asa do tempo), o `grid-template-columns` largo e o do celular, e
 * a extensão de cada painel nas duas formas.
 * Por quê: o protótipo aprovado cravava nove colunas e três grades no CSS; no ramo, as
 * larguras e os painéis são dados, e a mesma conta serve a qualquer ramo.
 * Entra → sai: o ramo e a escala → `PlanoDaGrade`.
 * Erro e ataque: painel sem coluna na escala fica sem extensão (não aparece no indicador);
 * a coluna `junto` não ganha trilha no celular (mora embaixo do centro).
 * Prova: tests/missao/ramoPrincipal.test.ts ("o plano").
 */
export function planoDaGrade(ramoPrincipal: RamoPrincipal, escala: Escala): PlanoDaGrade {
    const naEsc = (c: ColunaDoRamo) => !c.escalas.length || c.escalas.includes(escala);
    const colunas: ColunaNoPlano[] = [];
    const largo: string[] = [];
    const cel: string[] = [];
    let l = 0, p = 0;
    const push = (c: Omit<ColunaNoPlano, 'largo' | 'celular'>, w: string, f: string | null) => {
        largo.push(w); l++;
        let pc = p;
        if (f !== null) { cel.push(f); p++; pc = p; }
        colunas.push({ ...c, largo: l, celular: pc });
    };
    if (ramoPrincipal.lugar) push({ id: 'lugar', papel: 'lugar', rotulo: ramoPrincipal.lugar.rotulo, junto: false, coluna: null }, ramoPrincipal.lugar.largura, ramoPrincipal.lugar.celular);
    const trabalho = ramoPrincipal.trabalho.filter(naEsc);
    const tempo = ramoPrincipal.tempo.filter(naEsc);
    const juntos: ColunaDoRamo[] = [];
    for (const c of trabalho) {
        if (c.junto) { juntos.push(c); continue; }
        push({ id: c.id, papel: 'trabalho', rotulo: c.rotulo, junto: false, coluna: c }, naEscala(c.largura, escala, 'minmax(110px,1fr)'), fracao(naEscala(c.celular, escala, 1)));
    }
    // A coluna junto do centro: na tela larga fica ao lado dele; no celular, embaixo dele.
    for (const c of juntos) {
        largo.push(naEscala(c.largura, escala, 'minmax(200px,1.6fr)')); l++;
        colunas.push({ id: c.id, papel: 'trabalho', rotulo: c.rotulo, junto: true, coluna: c, largo: l, celular: p + 1 });
    }
    // A asa do tempo que vem antes do centro (os trimestres antes do ano, 30/10), na ordem dela.
    const doTempo = (c: ColunaDoRamo) => push({ id: c.id, papel: 'tempo', rotulo: c.rotulo, junto: false, coluna: c }, naEscala(c.largura, escala, 'minmax(110px,1fr)'), fracao(naEscala(c.celular, escala, 1)));
    for (const c of tempo) if (c.antesDoCentro) doTempo(c);
    push({ id: 'centro', papel: 'centro', rotulo: ramoPrincipal.centro.rotulo[escala] ?? escala, junto: false, coluna: null }, naEscala(ramoPrincipal.centro.largura, escala, '170px'), 'var(--P)');
    for (const c of tempo.filter(x => !x.antesDoCentro)) push({ id: c.id, papel: 'tempo', rotulo: c.rotulo, junto: false, coluna: c }, naEscala(c.largura, escala, 'minmax(110px,1fr)'), fracao(naEscala(c.celular, escala, 1)));

    const painelDe = (c: ColunaNoPlano) => (c.papel === 'centro' ? ramoPrincipal.centro.painel : c.coluna?.painel ?? null);
    const paineis: PainelNoPlano[] = ramoPrincipal.paineis.map(pn => {
        const merged = ramoPrincipal.paineis.filter(x => x.noLargo === pn.id).map(x => x.id);
        const doLargo = colunas.filter(c => { const id = painelDe(c); return id === pn.id || (!!id && merged.includes(id)); });
        const doCel = colunas.filter(c => painelDe(c) === pn.id && !c.junto);
        return {
            id: pn.id, rotulo: pn.rotulo, dica: pn.dica,
            largo: pn.noLargo || !doLargo.length ? null : { de: Math.min(...doLargo.map(c => c.largo)), ate: Math.max(...doLargo.map(c => c.largo)) + 1, alinhar: pn.alinhar },
            celular: doCel.length ? { de: Math.min(...doCel.map(c => c.celular)), ate: Math.max(...doCel.map(c => c.celular)) + 1 } : null,
        };
    });
    return {
        escala, colunas, largo: largo.join(' '), celular: cel.join(' '), paineis,
        n: paineis.filter(x => x.celular).length, minimo: ramoPrincipal.minimo[escala] ?? 1100,
    };
}

/**
 * O que faz: a coluna do horizonte mais longo de um plano: a de fora da asa do tempo, e o painel dela.
 * Por quê: a expansão da pinça (29/10) chega ao longo prazo depois do Ano; sem uma vista própria, o
 * longo prazo é o Ano com essa coluna em foco. A asa do tempo vai "da semana à visão" (o ramo
 * padrão), e a de fora é a mais longa: a coluna vem do arquivo do ramo, nunca de um nome no código.
 * Entra → sai: o ramo e o plano da grade → `{ coluna, paineis }` (o painel da coluna e, depois, o
 * que o abriga na tela larga), ou `null` quando o plano não tem asa do tempo.
 * Erro e ataque: o painel que mora noutro no largo (`noLargo`) traz também o de lá, que é o que existe
 * na tela larga; a coluna sem painel não traz nenhum.
 * Prova: tests/missao/formacao.test.ts ("o longo prazo").
 */
export function colunaDoHorizonte(ramoPrincipal: Pick<RamoPrincipal, 'paineis'>, plano: Pick<PlanoDaGrade, 'colunas'>): { coluna: string; paineis: string[] } | null {
    const tempo = plano.colunas.filter(c => c.papel === 'tempo');
    const fora = tempo[tempo.length - 1];
    if (!fora) return null;
    const painel = fora.coluna?.painel ?? null;
    const doLargo = ramoPrincipal.paineis.find(p => p.id === painel)?.noLargo ?? null;
    return { coluna: fora.id, paineis: [painel, doLargo].filter((x): x is string => !!x) };
}

/**
 * O que faz: os nós de uma coluna numa linha aberta: a lista da fonte, só os tipos pedidos.
 * A fonte com ponto anda pelas chaves (`colecoes.cidades` = a coleção `cidades` da linha).
 */
export function nosDaFonte<T = unknown>(linha: Record<string, unknown>, fonte: string, tipo: readonly string[] = []): T[] {
    let v: unknown = linha;
    for (const parte of fonte.split('.')) v = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>)[parte] : undefined;
    const arr = (Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : []) as T[];
    return tipo.length ? arr.filter(n => !n || typeof n !== "object" || !("tipo" in (n as object)) || tipo.includes(String((n as { tipo?: unknown }).tipo))) : arr;
}
