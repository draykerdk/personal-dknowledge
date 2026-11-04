/**
 * A edição das definições do sistema na aba de configurações (B2 do mapa da v0), sem o Obsidian:
 * o que cada campo mostra e o que uma edição vira no bloco `definicoes` do salvamento.
 *
 * O bloco salvo é esparso: guarda só o que a pessoa mudou, por cima das camadas de partida (os
 * padrões, os módulos opcionais, os nomes antigos do salvamento). Enquanto ninguém edita, nada é
 * gravado, e o cofre que tem uma camada de partida (o módulo do cofre) mostra os valores dela.
 * Quem valida é o leitor (`lerDefinicoes`): uma edição só vale se, lida de volta, dá o que a pessoa
 * escreveu; o que o leitor recusaria (um caminho de fora do cofre, um fuso desconhecido, um id com
 * espaço) volta como erro e não grava.
 *
 * Módulo puro: a aba (`abaDasDefinicoes.ts`) desenha e chama estas funções.
 * Prova: tests/ui/definicoesDaAba.test.ts.
 */
import { ehPorta, lerDefinicoes, type AreaDefinida, type Definicoes, type ValorDefinido } from '../definicoes';
import { PAPEIS, type Papel } from '../engine/papeisDeProtocolo';

/** Os campos de texto da seção, como caminho no bloco. */
export const CAMPOS_DE_TEXTO = [
    'pessoa.nome', 'pessoa.fuso_horario', 'rotulos.nivel_pessoal', 'rotulos.agente',
    'pastas.inbox', 'pastas.protocolos', 'pastas.revisao_semanal', 'pastas.valores', 'arquivos.reserva',
] as const;
export type CampoDeTexto = typeof CAMPOS_DE_TEXTO[number];

/** Os campos de lista da seção (um item por linha). */
export const CAMPOS_DE_LISTA = ['valores', 'valores_relacoes', 'areas', 'trimestre.foco', 'pastas.excluidas'] as const;
export type CampoDeLista = typeof CAMPOS_DE_LISTA[number];

/** O separador das partes de um item numa linha (o nome | o porquê; o nome | a pasta | a etiqueta). */
export const SEPARADOR = ' | ';

/** As pastas: o campo vazio volta ao de baixo (o padrão, ou o salvamento de antes), em vez de gravar vazio. */
const PASTAS: ReadonlySet<CampoDeTexto> = new Set(['pastas.inbox', 'pastas.protocolos', 'pastas.revisao_semanal', 'pastas.valores']);

/** O resultado de uma edição: o bloco novo a gravar, `null` (nada mudou, nada a gravar) ou o erro (nada grava). */
export type Edicao = { bloco: Record<string, unknown> | null } | { erro: string };

type Objeto = Record<string, unknown>;

const ehObjeto = (v: unknown): v is Objeto => Object.prototype.toString.call(v) === '[object Object]';

/** O que faz: o bloco salvo, numa cópia (o que não é objeto vale como vazio). */
function copiaDoBloco(salvo: unknown): Objeto {
    const bloco = ehObjeto(salvo) ? salvo.definicoes : undefined;
    return ehObjeto(bloco) ? JSON.parse(JSON.stringify(bloco)) : {};
}

/**
 * O que faz: um bloco novo com o valor posto no caminho (`pessoa.nome` → `{ pessoa: { nome } }`); com
 * `undefined`, tira a chave, e o objeto que fica vazio sai também.
 * Por quê: o bloco é esparso; mudar um campo não pode apagar os outros que a pessoa já mudou.
 * Entra → sai: o bloco (qualquer valor), o caminho e o valor → o bloco novo; o de entrada não muda.
 * Erro e ataque: as chaves do caminho são as da seção (nunca do usuário); um pedaço do caminho que
 * não é objeto é trocado por um objeto.
 * Prova: tests/ui/definicoesDaAba.test.ts ("o bloco esparso").
 */
export function blocoComMudanca(bloco: unknown, caminho: string, valor: unknown): Objeto {
    const raiz: Objeto = ehObjeto(bloco) ? JSON.parse(JSON.stringify(bloco)) : {};
    const partes = caminho.split('.');
    const pais: Objeto[] = [raiz];
    let atual = raiz;
    for (const parte of partes.slice(0, -1)) {
        if (!ehObjeto(atual[parte])) atual[parte] = {};
        atual = atual[parte] as Objeto;
        pais.push(atual);
    }
    const ultima = partes[partes.length - 1];
    if (valor === undefined) delete atual[ultima];
    else atual[ultima] = valor;
    for (let i = partes.length - 2; i >= 0; i--) {
        const filho = pais[i + 1];
        if (!Object.keys(filho).length) delete pais[i][partes[i]];
    }
    return raiz;
}

/** O que faz: o valor de um caminho num objeto (as definições lidas, ou o bloco); `undefined` sem ele. */
function valorEm(objeto: unknown, caminho: string): unknown {
    return caminho.split('.').reduce<unknown>((v, parte) => (ehObjeto(v) ? v[parte] : undefined), objeto);
}

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * O que faz: confere a edição pelo leitor: com o bloco novo, o campo lido tem de dar o esperado
 * (senão, o erro); o bloco igual ao salvo, ou o valor que já valia sem estar no bloco, não grava.
 * Por quê: o leitor é o único juiz do que vale; e o cofre que só tem camadas de partida não ganha
 * nada no `data.json` enquanto a pessoa não muda um valor de verdade.
 */
function conferir(salvo: unknown, partida: ReadonlyArray<unknown>, caminho: string, bloco: Objeto, esperado: unknown, erro: string): Edicao {
    const atual = copiaDoBloco(salvo);
    if (igual(bloco, atual)) return { bloco: null };
    const base = ehObjeto(salvo) ? salvo : {};
    const depois = valorEm(lerDefinicoes({ ...base, definicoes: bloco }, partida), caminho);
    if (esperado !== undefined && !igual(depois, esperado)) return { erro };
    const jaValia = igual(depois, valorEm(lerDefinicoes(salvo, partida), caminho));
    if (esperado !== undefined && jaValia && valorEm(atual, caminho) === undefined) return { bloco: null };
    return { bloco };
}

/**
 * O que faz: o que a edição de um campo de texto vira no bloco: o texto aparado no caminho; nas
 * pastas, o vazio tira a chave (volta ao de baixo).
 * Por quê: B2: a aba grava no bloco `definicoes`, e só o que mudou.
 * Entra → sai: o salvamento, as camadas de partida, o campo e o texto digitado → a edição.
 * Erro e ataque: o texto que o leitor recusaria (caminho absoluto, com `..`, fuso desconhecido) dá
 * o erro e nada grava; o mesmo valor de antes dá `bloco: null` (nada a gravar).
 * Prova: tests/ui/definicoesDaAba.test.ts ("os campos de texto").
 */
export function editarTexto(salvo: unknown, partida: ReadonlyArray<unknown>, campo: CampoDeTexto, texto: string): Edicao {
    const aparado = String(texto ?? '').trim();
    const limpo = campo.startsWith('pastas.') || campo === 'arquivos.reserva' ? aparado.replace(/\/+$/, '') : aparado;
    const bloco = copiaDoBloco(salvo);
    if (PASTAS.has(campo) && !limpo) return conferir(salvo, partida, campo, blocoComMudanca(bloco, campo, undefined), undefined, '');
    const erro = campo === 'pessoa.fuso_horario'
        ? `"${limpo}" não é um fuso que o relógio conheça (use um id como America/Sao_Paulo; vazio = o do sistema)`
        : `"${limpo}" não é um caminho de dentro do cofre`;
    return conferir(salvo, partida, campo, blocoComMudanca(bloco, campo, limpo), limpo, erro);
}

/** O que faz: as linhas de um texto, aparadas, sem as vazias. */
function linhas(texto: string): string[] {
    return String(texto ?? '').split('\n').map(l => l.trim()).filter(Boolean);
}

/** O que faz: as partes de uma linha pelo separador, aparadas. */
function partes(linha: string): string[] {
    return linha.split('|').map(p => p.trim());
}

/**
 * O que faz: os itens de um campo de lista a partir do texto (um por linha): o valor é
 * `nome | porquê`; a área, `nome | pasta | etiqueta`; o foco e as pastas excluídas, um texto.
 * Entra → sai: o campo e o texto → os itens e as linhas que não servem (o número, a partir de 1).
 * Erro e ataque: a linha sem nome não serve; a área com mais de três partes não serve.
 */
export function itensDoTexto(campo: CampoDeLista, texto: string): { itens: unknown[]; invalidas: number[] } {
    const itens: unknown[] = [];
    const invalidas: number[] = [];
    linhas(texto).forEach((linha, i) => {
        const p = partes(linha);
        if (campo === 'valores' || campo === 'valores_relacoes') {
            const [nome, ...resto] = p;
            if (!nome) invalidas.push(i + 1);
            else itens.push({ nome, porque: resto.join(' | ') } satisfies ValorDefinido);
        } else if (campo === 'areas') {
            const [nome, pasta = '', etiqueta = ''] = p;
            if (!nome || p.length > 3) invalidas.push(i + 1);
            else itens.push({ nome, pasta, etiqueta } satisfies AreaDefinida);
        } else {
            itens.push(linha);
        }
    });
    return { itens, invalidas };
}

/**
 * O que faz: o texto que a caixa de um campo de lista mostra: um item por linha, no formato de
 * `itensDoTexto` (ler o texto de volta dá os mesmos itens).
 * Prova: tests/ui/definicoesDaAba.test.ts ("os campos de lista").
 */
export function textoDaLista(definicoes: Definicoes, campo: CampoDeLista): string {
    const lista = valorEm(definicoes, campo);
    if (!Array.isArray(lista)) return '';
    return lista.map(item => {
        if (typeof item === 'string') return item;
        const o = item as Partial<ValorDefinido & AreaDefinida>;
        if (campo === 'areas') return [o.nome, o.pasta, o.etiqueta].join(SEPARADOR).replace(/( \| )+$/, '');
        return o.porque ? `${o.nome}${SEPARADOR}${o.porque}` : String(o.nome ?? '');
    }).join('\n');
}

/**
 * O que faz: o que a edição de um campo de lista vira no bloco: a lista inteira, lida do texto.
 * Por quê: B2: os valores, as áreas, o foco e as pastas excluídas são listas; a lista que a pessoa
 * escreve troca a de baixo inteira (a lista vazia também: ela disse "nenhum").
 * Entra → sai: o salvamento, as camadas de partida, o campo e o texto → a edição.
 * Erro e ataque: uma linha que não serve dá o erro com o número dela, e nada grava; o item que o
 * leitor recusaria (a pasta de fora do cofre) também; a mesma lista de antes não grava.
 * Prova: tests/ui/definicoesDaAba.test.ts ("os campos de lista").
 */
export function editarLista(salvo: unknown, partida: ReadonlyArray<unknown>, campo: CampoDeLista, texto: string): Edicao {
    const { itens, invalidas } = itensDoTexto(campo, texto);
    if (invalidas.length) return { erro: `a linha ${invalidas.join(', ')} não está no formato (${formatoDaLista(campo)})` };
    const bloco = blocoComMudanca(copiaDoBloco(salvo), campo, itens);
    return conferir(salvo, partida, campo, bloco, itens, `algum item não serve (${formatoDaLista(campo)}; a pasta, de dentro do cofre)`);
}

/** O que faz: o formato de uma linha do campo de lista, para a descrição e para o erro. */
export function formatoDaLista(campo: CampoDeLista): string {
    if (campo === 'valores' || campo === 'valores_relacoes') return `nome${SEPARADOR}porquê`;
    if (campo === 'areas') return `nome${SEPARADOR}pasta em 100 - AREAS${SEPARADOR}etiqueta`;
    if (campo === 'pastas.excluidas') return 'uma pasta por linha';
    return 'uma área, um departamento ou um projeto por linha';
}

/**
 * O que faz: o que a escolha do protocolo de um papel vira no bloco: o id, ou `null` ("nenhum": o
 * botão e as opções do papel somem).
 * Por quê: B2: a lista dos papéis com um seletor entre os protocolos carregados ou "nenhum".
 * Entra → sai: o salvamento, as camadas de partida, o papel e o id escolhido (`''` ou `null` = nenhum)
 * → a edição.
 * Erro e ataque: id fora do formato (espaço, barra, ponto) dá o erro; papel fora da lista dá o erro;
 * a mesma escolha de antes não grava.
 * Prova: tests/ui/definicoesDaAba.test.ts ("os protocolos por papel").
 */
export function editarPapel(salvo: unknown, partida: ReadonlyArray<unknown>, papel: Papel, id: string | null): Edicao {
    if (!(PAPEIS as readonly string[]).includes(papel)) return { erro: `"${papel}" não é um papel` };
    const valor = id && id.trim() ? id.trim() : null;
    const caminho = `protocolos_por_papel.${papel}`;
    return conferir(salvo, partida, caminho, blocoComMudanca(copiaDoBloco(salvo), caminho, valor), valor, `"${valor}" não é um id de protocolo`);
}

/**
 * O que faz: o que ligar ou desligar a ponte do agente vira no bloco (`ponte.ligada`).
 * Por quê: a ponte só sobe quando a pessoa a liga; o cofre que tem a camada de partida ligada não
 * ganha nada no bloco enquanto a escolha não muda.
 * Entra → sai: o salvamento, as camadas de partida e a escolha → a edição.
 * Erro e ataque: o que não é sim/não dá o erro; a mesma escolha de antes não grava.
 * Prova: tests/ui/definicoesDaAba.test.ts ("a ponte").
 */
export function editarPonteLigada(salvo: unknown, partida: ReadonlyArray<unknown>, ligada: boolean): Edicao {
    if (typeof ligada !== 'boolean') return { erro: 'a ponte liga com sim ou não' };
    return conferir(salvo, partida, 'ponte.ligada', blocoComMudanca(copiaDoBloco(salvo), 'ponte.ligada', ligada), ligada, '');
}

/**
 * O que faz: o que a porta digitada vira no bloco (`ponte.porta`); o vazio tira a chave (volta à de partida).
 * Por quê: a porta de partida pode estar ocupada por outro programa; a pessoa escolhe outra, e o lado
 * do agente a lê do descritor que a ponte grava no cofre.
 * Entra → sai: o salvamento, as camadas de partida e o texto digitado → a edição.
 * Erro e ataque: o que não é um inteiro de 1024 a 65535 dá o erro e nada grava; a mesma porta de antes não grava.
 * Prova: tests/ui/definicoesDaAba.test.ts ("a ponte").
 */
export function editarPortaDaPonte(salvo: unknown, partida: ReadonlyArray<unknown>, texto: string): Edicao {
    const limpo = String(texto ?? '').trim();
    const bloco = copiaDoBloco(salvo);
    if (!limpo) return conferir(salvo, partida, 'ponte.porta', blocoComMudanca(bloco, 'ponte.porta', undefined), undefined, '');
    const porta = /^\d+$/.test(limpo) ? Number(limpo) : Number.NaN;
    if (!ehPorta(porta)) return { erro: `"${limpo}" não é uma porta (um número de 1024 a 65535)` };
    return conferir(salvo, partida, 'ponte.porta', blocoComMudanca(bloco, 'ponte.porta', porta), porta, `"${limpo}" não é uma porta`);
}

/** Uma opção do seletor de um papel: o valor (o id; `''` = nenhum) e o que o seletor mostra. */
export interface OpcaoDoPapel { valor: string; rotulo: string }

/**
 * O que faz: as opções do seletor de um papel: "nenhum", os protocolos carregados (um por id, pelo
 * nome, em ordem) e, quando o papel aponta um id que não carregou, esse id marcado.
 * Por quê: a pessoa escolhe entre o que o cofre tem; o id atual que não carregou continua à vista,
 * para ela ver por que o botão não aparece.
 * Entra → sai: os protocolos carregados (`{ id, name }`) e o id atual → as opções.
 * Prova: tests/ui/definicoesDaAba.test.ts ("os protocolos por papel").
 */
export function opcoesDoPapel(carregados: ReadonlyArray<{ id: string; name?: string }>, atual: string | null): OpcaoDoPapel[] {
    const out: OpcaoDoPapel[] = [{ valor: '', rotulo: '— nenhum (o botão some)' }];
    const vistos = new Set<string>();
    const unicos = carregados.filter(p => p?.id && !vistos.has(p.id) && vistos.add(p.id));
    for (const p of unicos.sort((a, b) => String(a.name ?? a.id).localeCompare(String(b.name ?? b.id), 'pt-BR'))) {
        out.push({ valor: p.id, rotulo: p.name && p.name !== p.id ? `${p.name} (${p.id})` : p.id });
    }
    if (atual && !vistos.has(atual)) out.push({ valor: atual, rotulo: `${atual} (não carregado)` });
    return out;
}
