/**
 * Os estados e o modelo antigo da Missão, lidos das tabelas dos tipos.
 *
 * Por quê: o Passo 0 da página Missão (27/10/2026, §10.1, 0b e 0f). O estado de uma
 * TaskNote vem da tabela `estados` de `Config/dominios/tarefa.json` (um por status do
 * catálogo do TaskNotes, a SMART inclusive); o de um projeto, da tabela de
 * `projeto.json` (um por coluna do portfólio, a dona do estágio). A nota com alguma chave
 * do `legado` do tipo dela (semana, trimestre, SMART) é "modelo antigo". Os rótulos que o
 * P2 escrevia no código passam a vir daqui; o juiz (`audit_architecture.py`) confere a
 * tabela contra o catálogo e contra a forma de mostrar.
 *
 * Módulo puro: sem Obsidian e sem DOM. Prova: tests/missao/estados.test.ts.
 */
import type { DomainModel, DomainState, StatePlace } from '../engine/domainModel';

/** Os sinais declarados nos modelos dos tipos (o bloco `sinais`, P10b): o passo, o prazo e o limite. */
export interface PassoDeclarado { protocolo: string; rotulo: string }

/** Um prazo: a data do `campo` de uma nota do `type`, de hoje em diante, é sinal. */
export interface PrazoDeclarado { type: string; campo: string; fato: string; passo: PassoDeclarado | null }

/**
 * Um limite no lugar que o campo `lugar` diz: a data do campo `ate` (o último dia, quando a nota o
 * tem), ou os dias do campo `dias`, contados da chegada. Ao menos um dos dois é declarado; as
 * declarações com o mesmo `fato` são o mesmo limite, e vale a primeira que tem o dado.
 */
export interface LimiteDeclarado { type: string; ate: string | null; dias: string | null; lugar: string; fato: string; recente: string | null; passo: PassoDeclarado | null }

/**
 * As datas de notas seguidas (02/11/2026, a proposta dos ciclos, §3, a conferência das datas): a entrada (`de`) e a
 * saída (`ate`) das notas do `type`, o campo do `estado`, os estados que entram na sequência (`conta`) e os da
 * reserva aberta (`aberta`); a conferência diz o que não fecha.
 */
export interface DatasDeclaradas { type: string; de: string; ate: string; estado: string; conta: string[]; aberta: string[]; fato: string; passo: PassoDeclarado | null }

export interface DeclaracoesDeSinais { prazos: PrazoDeclarado[]; limites: LimiteDeclarado[]; datas?: DatasDeclaradas[] }

/** As tabelas que a Missão lê dos modelos dos tipos (vazias quando o modelo não se lê). */
export interface TabelasDaMissao {
    /** `tarefa.json`, `estados`: por status. */
    tarefa: DomainState[];
    /** `projeto.json`, `estados`: por coluna. */
    projeto: DomainState[];
    /** As chaves do modelo antigo de cada tipo (`semana.json`, `trimestre.json`, `smart.json`). */
    legado: { semana: string[]; trimestre: string[]; smart: string[] };
    /**
     * Os modelos de tipo com campos (`Config/dominios/*.json`, P5): o painel do nó acha o do
     * nó pelo `type` da nota e mostra os campos na ordem dele (`camposDoNo.ts`).
     */
    tipos: DomainModel[];
    /**
     * As declarações de sinal dos modelos (o bloco `sinais`: `prazos` e `limites`, P10b), de
     * todos os modelos da pasta; sem elas, nenhum sinal declarado.
     */
    sinais?: DeclaracoesDeSinais;
}

/** As tabelas vazias: o ponto de partida da entrada, antes de o leitor ler os modelos. */
export function tabelasVazias(): TabelasDaMissao {
    return { tarefa: [], projeto: [], legado: { semana: [], trimestre: [], smart: [] }, tipos: [], sinais: { prazos: [], limites: [] } };
}

/** As quatro classes de lugar que o tempo usa: na linha (aberta ou feita), na prateleira, fora. */
export type ClasseDaTarefa = 'aberta' | 'feita' | 'algum-dia' | 'cancelada';

const CLASSE_DO_LUGAR: Record<StatePlace, ClasseDaTarefa> = {
    tempo: 'aberta', conclusao: 'feita', algum_dia: 'algum-dia', fora: 'cancelada',
};

/**
 * O que faz: a linha da tabela da tarefa para um status (sem diferença de maiúsculas).
 * Entra → sai: o status cru e a tabela → a linha, ou `null` (status vazio ou fora do catálogo).
 */
export function estadoDaTarefa(status: unknown, tabela: readonly DomainState[]): DomainState | null {
    const valor = String(status ?? '').trim().toLowerCase();
    if (!valor) return null;
    return tabela.find(e => e.valor.toLowerCase() === valor) ?? null;
}

/**
 * O que faz: a classe de lugar de uma TaskNote pelo `lugar` do estado dela.
 * Por quê: a cancelada fica fora, a de algum dia vai à prateleira, a feita cai na
 * conclusão e o resto fica no lugar dele no tempo (8.4), cada um pela tabela.
 * Erro e ataque: status vazio, ou que a tabela não conhece (o juiz o recusa), é aberto:
 * fica à vista, no tempo, e não some em silêncio.
 */
export function classeDaTarefa(status: unknown, tabela: readonly DomainState[]): ClasseDaTarefa {
    const estado = estadoDaTarefa(status, tabela);
    return estado?.lugar ? CLASSE_DO_LUGAR[estado.lugar] : 'aberta';
}

/** O que faz: o rótulo do status na tela (o da tabela); sem linha, o próprio status, ou "aberta" quando vazio. */
export function rotuloDoStatus(status: unknown, tabela: readonly DomainState[]): string {
    const estado = estadoDaTarefa(status, tabela);
    if (estado) return estado.rotulo;
    const cru = String(status ?? '').trim();
    return cru || 'aberta';
}

/** O que faz: a linha da tabela do projeto para uma coluna do portfólio; o departamento (sem coluna) não tem. */
export function estadoDoProjeto(coluna: string, tabela: readonly DomainState[]): DomainState | null {
    return tabela.find(e => e.coluna === coluna) ?? null;
}

/**
 * O que faz: as chaves do `legado` presentes no frontmatter, na ordem da lista.
 * Por quê: a nota com alguma delas é "modelo antigo" (0f): a Missão lê só os campos do
 * modelo de hoje e marca o nó, sem regravar a nota.
 * Entra → sai: o frontmatter cru e a lista → as chaves presentes (vazia = modelo de hoje).
 */
export function chavesDoLegado(campos: Record<string, unknown> | null | undefined, legado: readonly string[]): string[] {
    if (!campos) return [];
    return legado.filter(chave => Object.prototype.hasOwnProperty.call(campos, chave));
}

/**
 * O que faz: a linha da tabela de estados de uma nota pelo modelo do tipo dela (o `type`) e pelo `status`
 * dela, o campo do estado, como na TaskNote (30/10: a estadia na triagem, reservada, em curso…).
 * Por quê: o estado de toda nota vem da tabela do modelo dela (Passo 0, 0b), e não de uma lista no código;
 * a estadia é o primeiro tipo de nota, fora a TaskNote, com a tabela.
 * Entra → sai: o frontmatter e os modelos → a linha, ou `null` (sem modelo, sem tabela ou status de fora).
 * Erro e ataque: sem `type`, ou com o `type` de nenhum modelo, `null`; o status em outra caixa vale.
 * Prova: tests/missao/estadias.test.ts ("as estadias, pelo modelo do tipo").
 */
export function estadoDaNota(campos: Record<string, unknown> | null | undefined, modelos: readonly DomainModel[]): DomainState | null {
    const type = String(campos?.type ?? '').trim();
    const m = type ? modelos.find(x => x.candidatos.type === type) : undefined;
    return m?.estados.length ? estadoDaTarefa(campos?.status, m.estados) : null;
}

/** A forma do cartão pela forma de mostrar do estado: cheio é feito, claro é algum dia, o resto aberto. */
const FORMA_DO_MOSTRAR: Partial<Record<DomainState['mostrar'], 'feita' | 'aberta' | 'algum-dia'>> = { cheio: 'feita', claro: 'algum-dia', oculto: 'algum-dia' };

/**
 * O que faz: a forma do cartão de um estado da tabela (a mesma do cartão da tarefa: cheio, contorno, claro).
 * Por quê: o cartão único (30/10) diz o estado pela forma, em todo tipo de nó.
 * Erro e ataque: sem estado, nada (`undefined`): o cartão fica com a forma de sempre.
 * Prova: tests/missao/estadias.test.ts.
 */
export function formaDoEstado(st: DomainState | null): 'feita' | 'aberta' | 'algum-dia' | undefined {
    return st ? FORMA_DO_MOSTRAR[st.mostrar] ?? 'aberta' : undefined;
}

/** A marca da nota de período sem `type` (as Days antigas): conta como nota do período. */
export const MODELO_ANTIGO = 'modelo antigo';
/** A marca da SMART de manutenção de rotina no cartão (a proposta da viagem nos ciclos, 29/10, §3). */
export const MARCA_MANUTENCAO = '🧰 manutenção';
