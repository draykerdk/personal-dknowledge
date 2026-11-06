/**
 * As definições do sistema: o leitor do bloco `definicoes` do salvamento das configurações (B1).
 *
 * O esquema e os padrões são os de `config-padrao/definicoes.padrao.json` (versão 1) do pacote
 * aberto, com cada campo descrito em `config-padrao/README.md`: o que é de cada pessoa (os valores,
 * as áreas, o foco do trimestre, os ajustes dos pesos, os nomes, a nota da reserva) e que, por isso,
 * não fica escrito no código. Este arquivo só lê; quem grava é a aba e a inicialização (B2, C).
 * A lista dos papéis de protocolo é de `engine/papeisDeProtocolo.ts`; aqui ficam só os padrões da
 * v0 para ela (os protocolos do ciclo; o resto `null`).
 */
import { PAPEIS, tabelaDosPapeis, type Papel, type TabelaDosPapeis } from './engine/papeisDeProtocolo';

/** Um valor com o porquê dele (os da pessoa e os das relações). */
export interface ValorDefinido { nome: string; porque: string }

/** Uma área: o nome, a pasta dela em `100 - AREAS` e a etiqueta do organizador. */
export interface AreaDefinida { nome: string; pasta: string; etiqueta: string }

/** Um termo que a pessoa acrescenta ao vocabulário do que o sistema não usa para medir ninguém. */
export interface TermoExtra { termo: string; porque: string }

/**
 * A trilha de uso (05/11/2026): o que cada parte faz e quando. Os textos não moram aqui: estão no arquivo
 * da trilha (`arquivos.trilha`), para quem instala ler as boas-vindas na língua e no jeito dele.
 */
export interface TrilhaDefinida {
    /** Receber quem chega à tarde ou à noite: "o que você fez hoje?" no lugar da abertura da manhã. */
    acolhida: boolean;
    /** A hora (`HH:MM`) a partir da qual a Day de hoje vazia abre com a acolhida. */
    hora_da_tarde: string;
    /** Quantos dias para trás a acolhida olha atrás dos dias sem registro (0 = nenhum). */
    dias_passados: number;
    /** O cartão do gesto da semana no centro da Missão. */
    gesto_da_semana: boolean;
    /** Quantos dias de uso dão o gesto por feito (e a árvore de uso propõe o seguinte). */
    vezes: number;
    /** A dica da primeira vez de um gesto ou botão. */
    dicas: boolean;
}

/** As definições, com todos os campos sempre presentes (o leitor preenche o que falta com o padrão). */
export interface Definicoes {
    versao: number;
    inicializado: boolean;
    pessoa: { nome: string; fuso_horario: string };
    rotulos: { nivel_pessoal: string; agente: string };
    valores: ValorDefinido[];
    valores_relacoes: ValorDefinido[];
    areas: AreaDefinida[];
    trimestre: { foco: string[] };
    pesos: { ajustes: Record<string, unknown> };
    vocabulario: { termos_extra: TermoExtra[] };
    pastas: { inbox: string; protocolos: string; revisao_semanal: string; valores: string; excluidas: string[] };
    arquivos: { pesos: string; reputacao: string; ech: string; vocabulario: string; reserva: string; trilha: string };
    /** A ponte do agente local (o DSH): desligada por padrão; ligada, escuta só no loopback, na porta. */
    ponte: { ligada: boolean; porta: number };
    protocolos_por_papel: TabelaDosPapeis;
    trilha: TrilhaDefinida;
}

/** A versão do esquema que este leitor conhece. */
export const VERSAO_DAS_DEFINICOES = 1;

/** A porta de partida da ponte do agente (a mesma que o lado do DSH procura sem configuração). */
export const PORTA_DA_PONTE = 3082;

/** O tamanho máximo de uma lista lida (uma lista maior é cortada, nunca derruba a carga). */
const MAXIMO_DA_LISTA = 200;

/**
 * O que faz: congela um valor e tudo o que ele contém (o `Object.freeze` só congela o primeiro nível).
 * Por quê: os padrões são lidos por todos; ninguém pode mudá-los por engano através de um resultado.
 */
function congelar<T>(valor: T): T {
    if (valor && typeof valor === 'object') {
        for (const v of Object.values(valor as Record<string, unknown>)) congelar(v);
        Object.freeze(valor);
    }
    return valor;
}

/** Os protocolos curtos da v0, pelo papel; todo papel fora daqui começa sem protocolo (`null`). */
const PROTOCOLOS_DA_V0: Readonly<Partial<Record<Papel, string>>> = {
    planejar_semana: 'planejamento_semanal',
    revisar_semana: 'review_semanal',
    planejar_trimestre: 'planejamento_trimestral',
    inicializar: 'inicializacao',
};

/**
 * O que faz: a tabela de partida da v0: cada papel de `PAPEIS` com o protocolo curto da v0, ou `null`.
 * Por quê: o pacote aberto só traz os protocolos do ciclo e o da inicialização; os outros papéis
 * existem (o código os pede), mas o botão deles some até um pacote ou a pessoa os preencher.
 */
function protocolosDaV0(): TabelaDosPapeis {
    return Object.fromEntries(PAPEIS.map(papel => [papel, PROTOCOLOS_DA_V0[papel] ?? null])) as Record<Papel, string | null>;
}

/**
 * Os padrões: os mesmos do esquema (sem as chaves `_`, que são comentários). Neutros: listas
 * vazias, textos vazios, as pastas do esqueleto e os protocolos curtos da v0.
 */
export const DEFINICOES_PADRAO: Readonly<Definicoes> = congelar({
    versao: VERSAO_DAS_DEFINICOES,
    inicializado: false,
    pessoa: { nome: '', fuso_horario: '' },
    rotulos: { nivel_pessoal: '', agente: '' },
    valores: [],
    valores_relacoes: [],
    areas: [],
    trimestre: { foco: [] },
    pesos: { ajustes: {} },
    vocabulario: { termos_extra: [] },
    pastas: {
        inbox: '300 - RUNTIME/001 - INBOX',
        protocolos: '200 - FUNCTIONS/Protocolos',
        revisao_semanal: '400 - MEMORY/200 - WEEKLY',
        valores: '400 - MEMORY/Valores',
        excluidas: ['000 - KERNEL', '200 - FUNCTIONS', '300 - RUNTIME'],
    },
    arquivos: {
        pesos: '200 - FUNCTIONS/Config/pesos_decisao.json',
        reputacao: '200 - FUNCTIONS/Config/reputacao.json',
        ech: '200 - FUNCTIONS/Config/ech.json',
        vocabulario: '200 - FUNCTIONS/Config/vocabulario.json',
        reserva: '',
        trilha: '200 - FUNCTIONS/Config/trilha.json',
    },
    ponte: { ligada: false, porta: PORTA_DA_PONTE },
    protocolos_por_papel: protocolosDaV0(),
    trilha: { acolhida: true, hora_da_tarde: '14:00', dias_passados: 7, gesto_da_semana: true, vezes: 3, dicas: true },
} as Definicoes);

type Objeto = Record<string, unknown>;

/**
 * O que faz: devolve o valor se ele é um objeto simples (`{…}`), senão `null`.
 * Erro e ataque: lista, data, classe e `null` não passam; o leitor só lê chaves conhecidas, então um
 * `__proto__` gravado não chega a nenhum objeto.
 */
function objeto(valor: unknown): Objeto | null {
    return Object.prototype.toString.call(valor) === '[object Object]' ? valor as Objeto : null;
}

/** O que faz: o texto, aparado, se o valor é texto; senão o padrão. */
function texto(valor: unknown, padrao: string): string {
    return typeof valor === 'string' ? valor.trim() : padrao;
}

/**
 * O que faz: diz se um texto é um fuso que o relógio conhece (um id IANA, como `America/Sao_Paulo`);
 * o vazio vale (é o fuso do sistema).
 * Por quê: o fuso decide a semana corrente e a anterior; um fuso que o `Intl` recusa derrubaria
 * quem formata uma data com ele. A aba recusa pelo mesmo critério.
 * Erro e ataque: o que não é texto, ou o fuso que o `Intl` recusa, dá `false`; nada lança.
 */
export function ehFuso(valor: unknown): boolean {
    if (typeof valor !== 'string') return false;
    if (!valor.trim()) return true;
    try { new Intl.DateTimeFormat('en-US', { timeZone: valor.trim() }).format(0); return true; } catch (e) { return false; }
}

/**
 * O que faz: diz se um texto é uma hora do relógio, `HH:MM` de 00:00 a 23:59.
 * Por quê: a hora da tarde da trilha decide quando a Missão recebe com "o que você fez hoje?"; a aba recusa
 * pelo mesmo critério.
 * Erro e ataque: o que não é texto, `24:00`, `9:00` e `14h` dão `false`; nada lança.
 * Prova: tests/definicoes/definicoes.test.ts ("a trilha").
 */
export function ehHora(valor: unknown): valor is string {
    return typeof valor === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(valor.trim());
}

/** O que faz: o inteiro de `min` a `max`, se o valor é um; senão o padrão. */
function inteiro(valor: unknown, padrao: number, min: number, max: number): number {
    return typeof valor === 'number' && Number.isInteger(valor) && valor >= min && valor <= max ? valor : padrao;
}

/** O que faz: sim ou não, se o valor é um; senão o padrão. */
function simOuNao(valor: unknown, padrao: boolean): boolean {
    return typeof valor === 'boolean' ? valor : padrao;
}

/** O que faz: o fuso, aparado, se ele vale (`ehFuso`); senão o padrão. */
function fuso(valor: unknown, padrao: string): string {
    return ehFuso(valor) ? (valor as string).trim() : padrao;
}

/**
 * O que faz: diz se um valor é uma porta que a ponte pode ocupar: um inteiro de 1024 a 65535.
 * Por quê: a ponte escuta no loopback; abaixo de 1024 o sistema pede permissão de administrador, e
 * fora do intervalo não há porta. A aba recusa pelo mesmo critério.
 * Erro e ataque: texto, fração, negativo, `NaN` e o fora do intervalo dão `false`; nada lança.
 * Prova: tests/definicoes/definicoes.test.ts ("a ponte").
 */
export function ehPorta(valor: unknown): valor is number {
    return typeof valor === 'number' && Number.isInteger(valor) && valor >= 1024 && valor <= 65535;
}

/**
 * O que faz: um caminho relativo do cofre, aparado e sem a barra do fim; o vazio só vale com
 * `aceitaVazio` (a nota da reserva vazia é o módulo desligado).
 * Erro e ataque: caminho absoluto, com `..`, com `\` ou com o caractere nulo volta ao padrão (o
 * caminho é de dentro do cofre, nunca de fora).
 */
function caminho(valor: unknown, padrao: string, aceitaVazio = false): string {
    if (typeof valor !== 'string') return padrao;
    const limpo = valor.trim().replace(/\/+$/, '');
    if (!limpo) return aceitaVazio ? '' : padrao;
    if (limpo.startsWith('/') || limpo.includes('\\') || limpo.includes('\0') || limpo.split('/').includes('..')) return padrao;
    return limpo;
}

/**
 * O que faz: uma lista lida item a item: o item que não serve sai, a lista que não é lista volta
 * `null` (o chamador fica com o padrão).
 * Erro e ataque: lista enorme é cortada em `MAXIMO_DA_LISTA`.
 */
function lista<T>(valor: unknown, item: (v: unknown) => T | null): T[] | null {
    if (!Array.isArray(valor)) return null;
    const out: T[] = [];
    for (const v of valor.slice(0, MAXIMO_DA_LISTA)) {
        const lido = item(v);
        if (lido !== null) out.push(lido);
    }
    return out;
}

/** O que faz: um texto não vazio, ou `null` (o item de uma lista de textos). */
function itemDeTexto(v: unknown): string | null {
    return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** O que faz: um `{ nome, porque }` com nome, ou `null`. */
function itemDeValor(v: unknown): ValorDefinido | null {
    const o = objeto(v);
    const nome = texto(o?.nome, '');
    return o && nome ? { nome, porque: texto(o.porque, '') } : null;
}

/** O que faz: um `{ nome, pasta, etiqueta }` com nome, ou `null`; a pasta passa pela regra do caminho. */
function itemDeArea(v: unknown): AreaDefinida | null {
    const o = objeto(v);
    const nome = texto(o?.nome, '');
    return o && nome ? { nome, pasta: caminho(o.pasta, '', true), etiqueta: texto(o.etiqueta, '') } : null;
}

/** O que faz: um `{ termo, porque }` com termo, ou `null`. */
function itemDeTermo(v: unknown): TermoExtra | null {
    const o = objeto(v);
    const termo = texto(o?.termo, '');
    return o && termo ? { termo, porque: texto(o.porque, '') } : null;
}

/**
 * O que faz: os ajustes dos pesos, uma cópia só com as categorias que valem (número finito ou
 * objeto), sem as chaves de comentário (`_`); o que não é objeto volta `null`.
 * Erro e ataque: a cópia passa por JSON, então nada do salvamento fica ligado ao que o leitor
 * devolve; um valor que o JSON não representa sai.
 */
function ajustes(valor: unknown): Record<string, unknown> | null {
    const o = objeto(valor);
    if (!o) return null;
    const out: Record<string, unknown> = {};
    for (const [chave, v] of Object.entries(o)) {
        if (chave.startsWith('_') || chave === 'constructor' || chave === 'prototype') continue;
        if (typeof v === 'number' && Number.isFinite(v)) out[chave] = v;
        else if (objeto(v)) {
            try { out[chave] = JSON.parse(JSON.stringify(v)); } catch { /* o que não vira JSON sai */ }
        }
    }
    return out;
}

/**
 * O que faz: põe uma camada de definições por cima de outras: cada campo conhecido que a camada
 * traz, no tipo certo, troca o da base; o resto fica.
 * Por quê: o salvamento é texto que a pessoa (e versões antigas do plugin) podem ter escrito à mão;
 * nada nele pode derrubar a carga, e um campo de outra versão não pode apagar o que se sabe.
 * Entra → sai: as definições de base e a camada (qualquer valor) → definições novas; a base não muda.
 * Erro e ataque: camada que não é objeto devolve a base; campo desconhecido é ignorado; campo no tipo
 * errado fica com o da base; listas vêm item a item (o item ruim sai, a lista boa fica).
 * Prova: tests/definicoes/definicoes.test.ts.
 */
export function aplicarCamada(base: Definicoes, camada: unknown): Definicoes {
    const c = objeto(camada);
    if (!c) return base;
    const pessoa = objeto(c.pessoa), rotulos = objeto(c.rotulos), trimestre = objeto(c.trimestre);
    const pesos = objeto(c.pesos), vocabulario = objeto(c.vocabulario), pastas = objeto(c.pastas), arquivos = objeto(c.arquivos), ponte = objeto(c.ponte);
    const trilha = objeto(c.trilha);
    return {
        versao: VERSAO_DAS_DEFINICOES,
        inicializado: typeof c.inicializado === 'boolean' ? c.inicializado : base.inicializado,
        pessoa: {
            nome: texto(pessoa?.nome, base.pessoa.nome),
            fuso_horario: fuso(pessoa?.fuso_horario, base.pessoa.fuso_horario),
        },
        rotulos: {
            nivel_pessoal: texto(rotulos?.nivel_pessoal, base.rotulos.nivel_pessoal),
            agente: texto(rotulos?.agente, base.rotulos.agente),
        },
        valores: lista(c.valores, itemDeValor) ?? base.valores,
        valores_relacoes: lista(c.valores_relacoes, itemDeValor) ?? base.valores_relacoes,
        areas: lista(c.areas, itemDeArea) ?? base.areas,
        trimestre: { foco: lista(trimestre?.foco, itemDeTexto) ?? base.trimestre.foco },
        pesos: { ajustes: ajustes(pesos?.ajustes) ?? base.pesos.ajustes },
        vocabulario: { termos_extra: lista(vocabulario?.termos_extra, itemDeTermo) ?? base.vocabulario.termos_extra },
        pastas: {
            inbox: caminho(pastas?.inbox, base.pastas.inbox),
            protocolos: caminho(pastas?.protocolos, base.pastas.protocolos),
            revisao_semanal: caminho(pastas?.revisao_semanal, base.pastas.revisao_semanal),
            valores: caminho(pastas?.valores, base.pastas.valores),
            excluidas: lista(pastas?.excluidas, v => (typeof v === 'string' ? caminho(v, '') || null : null)) ?? base.pastas.excluidas,
        },
        arquivos: {
            pesos: caminho(arquivos?.pesos, base.arquivos.pesos),
            reputacao: caminho(arquivos?.reputacao, base.arquivos.reputacao),
            ech: caminho(arquivos?.ech, base.arquivos.ech),
            vocabulario: caminho(arquivos?.vocabulario, base.arquivos.vocabulario),
            reserva: caminho(arquivos?.reserva, base.arquivos.reserva, true),
            trilha: caminho(arquivos?.trilha, base.arquivos.trilha, true),
        },
        ponte: {
            ligada: typeof ponte?.ligada === 'boolean' ? ponte.ligada : base.ponte.ligada,
            porta: ehPorta(ponte?.porta) ? ponte.porta : base.ponte.porta,
        },
        protocolos_por_papel: tabelaDosPapeis(base.protocolos_por_papel, c.protocolos_por_papel),
        trilha: {
            acolhida: simOuNao(trilha?.acolhida, base.trilha.acolhida),
            hora_da_tarde: ehHora(trilha?.hora_da_tarde) ? String(trilha?.hora_da_tarde).trim() : base.trilha.hora_da_tarde,
            dias_passados: inteiro(trilha?.dias_passados, base.trilha.dias_passados, 0, 31),
            gesto_da_semana: simOuNao(trilha?.gesto_da_semana, base.trilha.gesto_da_semana),
            vezes: inteiro(trilha?.vezes, base.trilha.vezes, 1, 30),
            dicas: simOuNao(trilha?.dicas, base.trilha.dicas),
        },
    };
}

/**
 * O que faz: a camada dos nomes antigos do salvamento: as pastas e o fuso que as configurações de
 * antes guardavam fora do bloco (`folderInbox`, `folderProtocols`, `folderReview`,
 * `excludedFolders` e o `timezone` do agente do celular), com os nomes das definições.
 * Por quê: essas chaves estão no `data.json` de quem já usa o plugin; o leitor as lê como uma camada
 * por baixo do bloco, então nada se perde e nenhuma migração grava nada. O que o bloco disser vale
 * por cima delas.
 * Entra → sai: o salvamento (qualquer valor) → a camada (só com as chaves que existem), ou `null`.
 * Erro e ataque: chave no tipo errado fica de fora; o valor passa pelas mesmas regras do bloco
 * (`aplicarCamada`: caminho de fora do cofre e fuso desconhecido voltam ao de baixo).
 * Prova: tests/definicoes/definicoes.test.ts ("os nomes antigos do salvamento").
 */
export function camadaDoSalvamentoAntigo(salvo: unknown): Objeto | null {
    const s = objeto(salvo);
    if (!s) return null;
    const pastas: Objeto = {};
    if (typeof s.folderInbox === 'string') pastas.inbox = s.folderInbox;
    if (typeof s.folderProtocols === 'string') pastas.protocolos = s.folderProtocols;
    if (typeof s.folderReview === 'string') pastas.revisao_semanal = s.folderReview;
    if (Array.isArray(s.excludedFolders)) pastas.excluidas = s.excludedFolders;
    const fusoAntigo = objeto(s.mobileAgent)?.timezone;
    return { pastas, ...(typeof fusoAntigo === 'string' ? { pessoa: { fuso_horario: fusoAntigo } } : {}) };
}

/**
 * O que faz: as definições do sistema a partir do salvamento das configurações (o objeto do
 * `data.json`): os padrões, por cima as camadas de partida (as dos módulos opcionais do cofre, na
 * ordem), por cima os nomes antigos do salvamento (`camadaDoSalvamentoAntigo`) e por cima o bloco
 * `definicoes` do salvamento.
 * Por quê: B1 do mapa da v0. O salvamento antigo (sem o bloco) e o vazio dão as mesmas definições de
 * partida, menos as pastas e o fuso que ele já guardava, que continuam valendo; a pessoa que já usa
 * o plugin não precisa de migração para nada mudar.
 * Entra → sai: o salvamento (qualquer valor) e as camadas de partida → `Definicoes` completas, numa
 * cópia nova (mudar o resultado não muda os padrões nem o salvamento).
 * Erro e ataque: salvamento ausente, `null`, lista ou texto vale como vazio; o bloco de uma versão
 * futura é lido no que este leitor conhece; nada lança.
 * Prova: tests/definicoes/definicoes.test.ts.
 */
export function lerDefinicoes(salvo: unknown, partida: ReadonlyArray<unknown> = []): Definicoes {
    let atual: Definicoes = JSON.parse(JSON.stringify(DEFINICOES_PADRAO));
    for (const camada of partida) atual = aplicarCamada(atual, camada);
    atual = aplicarCamada(atual, camadaDoSalvamentoAntigo(salvo));
    return aplicarCamada(atual, objeto(salvo)?.definicoes);
}

/**
 * O que faz: as definições de quem tem um plugin: as que ele lê (`plugin.definicoes`, com as camadas
 * dos módulos) ou, sem o leitor dele, as do salvamento dele sem camadas.
 * Por quê: os leitores do motor recebem o plugin (ou um dublê dele, nos testes); todos pedem aqui,
 * pelo mesmo caminho, em vez de cada um ler uma configuração solta.
 * Entra → sai: o plugin (qualquer valor) → `Definicoes`.
 * Erro e ataque: plugin ausente dá os padrões.
 */
export function definicoesDe(plugin: unknown): Definicoes {
    const p = plugin as { definicoes?: unknown; settings?: unknown } | null | undefined;
    const lidas = p?.definicoes;
    return lidas && typeof lidas === 'object' ? lidas as Definicoes : lerDefinicoes(p?.settings);
}

/** Uma regra do organizador: a etiqueta que leva a nota e a pasta para onde ela vai. */
export interface RegraDoOrganizador { tag: string; folder: string }

/** A pasta dos projetos de uma área, debaixo da pasta dela em `100 - AREAS`. */
const PROJETOS_DA_AREA = '100 - PROJECTS';

/**
 * O que faz: as regras do organizador: as salvas, na ordem, e depois uma por área com etiqueta e
 * pasta (a etiqueta leva a nota para os projetos da área), sem repetir uma etiqueta que já tem regra.
 * Por quê: A1 do mapa da v0: as regras das áreas deixam de estar escritas no código e passam a ser
 * derivadas das áreas das definições; as regras que a pessoa já salvou vêm primeiro e ganham.
 * Entra → sai: as regras salvas (qualquer valor) e as áreas → a lista de regras.
 * Erro e ataque: regra salva sem `tag` ou sem `folder` de texto fica de fora; área sem etiqueta ou
 * sem pasta não gera regra; a etiqueta sem `#` ganha o `#`.
 * Prova: tests/definicoes/definicoes.test.ts ("as regras do organizador").
 */
export function regrasDoOrganizador(salvas: unknown, areas: readonly AreaDefinida[]): RegraDoOrganizador[] {
    const out: RegraDoOrganizador[] = [];
    for (const r of Array.isArray(salvas) ? salvas : []) {
        const o = objeto(r);
        if (o && typeof o.tag === 'string' && o.tag.trim() && typeof o.folder === 'string' && o.folder.trim()) out.push({ tag: o.tag.trim(), folder: o.folder.trim() });
    }
    for (const area of areas) {
        const etiqueta = area.etiqueta.trim();
        if (!etiqueta || !area.pasta) continue;
        const tag = etiqueta.startsWith('#') ? etiqueta : `#${etiqueta}`;
        if (out.some(r => r.tag === tag)) continue;
        out.push({ tag, folder: `100 - AREAS/${area.pasta}/${PROJETOS_DA_AREA}` });
    }
    return out;
}

/** A chave do nível pessoal quando a pessoa não tem nome nas definições. */
export const CHAVE_DO_NIVEL_SEM_NOME = 'nivel_pessoal';

/**
 * O que faz: a chave do nível pessoal no frontmatter das notas (o número de 0 a 10 que os protocolos
 * gravam ao lado do ECH, do sono e da energia): o nome da pessoa em minúsculas, sem acento, com `_`
 * no lugar do que não é letra nem número.
 * Por quê: A1 do mapa da v0: a chave era o nome do autor escrito no código; o nome vem das
 * definições, e as notas que já levam a chave do nome continuam lidas igual.
 * Entra → sai: as definições → a chave (`CHAVE_DO_NIVEL_SEM_NOME` sem nome).
 * Prova: tests/definicoes/definicoes.test.ts ("a chave do nível pessoal").
 */
export function chaveDoNivelPessoal(definicoes: Pick<Definicoes, 'pessoa'>): string {
    const chave = definicoes.pessoa.nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return chave || CHAVE_DO_NIVEL_SEM_NOME;
}

/** O que faz: o nome que a tela dá ao agente que só propõe (`rotulos.agente`; vazio = "o agente"). */
export function rotuloDoAgente(definicoes: Pick<Definicoes, 'rotulos'>): string {
    return definicoes.rotulos.agente || 'o agente';
}

/**
 * O que faz: o fuso do sistema: o das definições, ou o do relógio do sistema, ou UTC.
 * Por quê: A1 do mapa da v0: o fuso morava nas configurações do agente do celular, com um valor de
 * uma pessoa escrito no código; ele é da pessoa e vale para o sistema inteiro.
 * Entra → sai: as definições → um id IANA que o `Intl` aceita.
 * Prova: tests/definicoes/definicoes.test.ts ("o fuso").
 */
export function fusoDoSistema(definicoes: Pick<Definicoes, 'pessoa'>): string {
    if (definicoes.pessoa.fuso_horario) return definicoes.pessoa.fuso_horario;
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; }
}
