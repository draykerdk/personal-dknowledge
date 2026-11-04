/**
 * Os campos de um nó, pelo modelo do tipo dele: qual modelo vale para a nota, e as linhas
 * do painel (o rótulo e o valor em texto), na ordem do modelo.
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, §4): cada tipo declara os campos
 * padrão em `Config/dominios/<tipo>.json`, e o painel do nó os mostra por uma função só.
 * Nenhum nome de tipo mora aqui (§3.8): o modelo se acha pelo `type` da nota contra o
 * `candidatos.type` de cada modelo, dentro da casa dele (`candidatos.pasta`); a nota sem
 * `type` (a Day antiga) fica com o único modelo cuja casa a contém. Melhorar um tipo é
 * mudar o arquivo dele, sem código novo.
 *
 * As chaves do `legado` que a nota tem saem à parte, como "modelo antigo" (0f): só para
 * ler, com o valor cru.
 *
 * Módulo puro: sem Obsidian e sem DOM. Prova: tests/missao/camposDoNo.test.ts.
 */
import { camposNoFormato, type DomainField, type DomainModel, type DomainState } from '../engine/domainModel';
import { fieldNumber } from '../engine/choose';
import { linkTarget } from '../project/projectCanvasModel';
import { diaEHoraNoInicio, minutosTexto, reais } from './formatos';
import { dentro } from './entrada';
import { diaComAno, semanaCurta } from './tempo';
import { ehSemana } from './formatos';

/** Uma linha do painel: o campo do modelo, o rótulo e o valor em texto. */
export interface LinhaDeCampo {
    nome: string;
    rotulo: string;
    valor: string;
    /** O valor veio do `vazio` do modelo (a nota não tem o campo). */
    vazio: boolean;
    /** O escritor do campo ainda não chegou (o passo dele). */
    planejado?: string;
    /** O campo de link: o que ele aponta, na ordem (o painel faz de cada um um botão quando acha o nó). */
    links?: LinkDoCampo[];
}

/** Um link de um campo: o nome que a tela mostra (o alias, quando há) e o alvo do link (a nota). */
export interface LinkDoCampo { nome: string; alvo: string }

/** Uma chave do modelo antigo presente na nota, com o valor cru em texto. */
export interface LinhaAntiga { nome: string; valor: string }

export interface CamposDoNo {
    /** O domínio do modelo que vale para a nota; `null` sem modelo. */
    tipo: string | null;
    campos: LinhaDeCampo[];
    antigos: LinhaAntiga[];
}

/** Como mostrar um valor de um vocabulário do sistema (o status pelo rótulo da tabela). */
export type RotulosDosVocabularios = Partial<Record<'contextos' | 'status' | 'prioridade', (valor: string) => string>>;

const texto = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const listaDe = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === null || v === undefined || v === '' ? [] : [v]);

/**
 * O que faz: o modelo do tipo que vale para uma nota.
 * Por quê: o `type` confirma o tipo, e a casa diz onde ele mora (convencoes.md, "Cada
 * tipo"); dois modelos com a mesma casa (a ação e a SMART, o projeto e a área) se
 * separam pelo `type`.
 * Entra → sai: o caminho, o frontmatter e os modelos → o modelo, ou `null`.
 * Erro e ataque: nota longe de toda casa, `type` de outro tipo ou sem `type` numa casa
 * que dois modelos dividem dão `null`: o painel não mostra campo de outro tipo. A nota
 * arquivada ao lado da casa (`TaskNotes/Archive`), com o `type` de um modelo só, acha o dele.
 */
export function modeloDaNota(caminho: string, campos: Record<string, unknown> | null | undefined, modelos: readonly DomainModel[]): DomainModel | null {
    const path = String(caminho ?? '');
    if (!path) return null;
    const naCasa = modelos.filter(m => dentro(path, m.candidatos.pasta) || m.candidatos.pasta === path);
    const type = texto(campos?.type);
    if (type) return naCasa.find(m => m.candidatos.type === type) ?? arquivadaAoLado(path, type, modelos);
    return naCasa.length === 1 ? naCasa[0] : null;
}

/** O que faz: a pasta de cima de uma casa (`TaskNotes/Tasks` → `TaskNotes`); a casa de primeiro nível não tem (`null`). */
const paiDaCasa = (pasta: string) => { const i = pasta.lastIndexOf('/'); return i > 0 ? pasta.slice(0, i) : null; };

/**
 * O que faz: o modelo da nota arquivada ao lado da casa: fora dela, mas na mesma pasta de cima
 * (`TaskNotes/Archive` ao lado de `TaskNotes/Tasks`), com o `type` de um modelo só.
 * Por quê: o diagnóstico do painel do nó (29/10, C6.3): a tarefa e a SMART feitas vão para o
 * arquivo do TaskNotes e perdiam o modelo (134 notas, 28 delas SMART), caindo no frontmatter cru.
 * Entra → sai: o caminho, o `type` e os modelos → o modelo, ou `null`.
 * Erro e ataque: a casa de primeiro nível (`100 - AREAS`) não tem "ao lado" (seria o cofre
 * inteiro); dois modelos com o mesmo `type` ao lado não decidem (`null`); nota longe da casa, nada.
 */
function arquivadaAoLado(path: string, type: string, modelos: readonly DomainModel[]): DomainModel | null {
    const ao = modelos.filter(m => m.candidatos.type === type && (() => { const pai = paiDaCasa(m.candidatos.pasta); return !!pai && dentro(path, pai); })());
    return ao.length === 1 ? ao[0] : null;
}

/**
 * O que faz: o que um valor de campo de link aponta (um ou uma lista): o nome da tela (o alias,
 * quando há) e o alvo (a nota, sem o alias); o objeto `{ uid }` do TaskNotes, pelo uid.
 * Por quê: o diagnóstico do painel do nó (29/10, G1): o valor de link vira botão que leva ao nó,
 * e o nó se acha pelo alvo, não pelo apelido.
 * Entra → sai: o valor cru → os links, na ordem, sem repetir o alvo.
 */
export function linksDoCampo(cru: unknown): LinkDoCampo[] {
    const out: LinkDoCampo[] = [];
    for (const v of listaDe(cru)) {
        const nome = nomeDoLink(v);
        const cru = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>).uid : v;
        // O alvo guarda o caminho do link (`Pasta/README` acha a nota certa; o nome solto, não).
        const alvo = String(cru ?? '').trim().replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].split('#')[0].replace(/\.md$/, '').trim() || nome;
        if (nome && !out.some(x => x.alvo === alvo)) out.push({ nome, alvo });
    }
    return out;
}

/**
 * O que faz: um nome de link: o alias quando há (`[[…/README.md|Apelido]]` → `Apelido`),
 * senão o nome da nota (`[[Pasta/Nota]]` → `Nota`); o objeto `{ uid }` do TaskNotes, pelo uid.
 */
function nomeDoLink(v: unknown): string {
    const cru = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>).uid : v;
    const alias = String(cru ?? '').match(/^\s*\[\[[^\]|]*\|([^\]]+)\]\]\s*$/);
    return alias ? alias[1].trim() : linkTarget(cru);
}

/**
 * O campo onde quem cria uma nota diz de onde ela veio (convenções, "Cada tipo": o 🌙 grava
 * o id da revisão do dia, o "registrar o que fiz" grava o seu; um agente escreve o dele). O painel o
 * mostra embaixo do título (02/11), para quem usa ver de onde veio a tarefa.
 */
export const CAMPO_DA_ORIGEM = 'origem';

/**
 * O que faz: o campo do modelo que guarda o estado da tabela `estados`: o de escolha cuja lista de
 * valores contém todos os valores da tabela; sem lista (o catálogo do TaskNotes, `valores: "status"`),
 * o de escolha cujo valor de agora está na tabela.
 * Por quê: o menu de status (02/11) muda o estado pelo campo dono, e o campo de escolha que repete o
 * mesmo estado sai dos Campos (um lugar por ação); nenhum nome de campo mora no código.
 * Entra → sai: o modelo, a tabela (a do modelo, ou a das TaskNotes para a SMART) e o frontmatter → o campo, ou `null`.
 * Erro e ataque: tabela vazia, nenhum campo de escolha, ou o valor de agora fora da tabela (sem lista) dão `null`.
 * Prova: tests/missao/camposDoNo.test.ts ("o campo do estado").
 */
export function campoDoEstado(modelo: Pick<DomainModel, 'campos'> | null, estados: readonly DomainState[], fm: Record<string, unknown> | null | undefined): DomainField | null {
    if (!modelo || !estados.length) return null;
    const escolhas = modelo.campos.filter(c => c.tipo === 'escolha');
    const pelaLista = escolhas.find(c => Array.isArray(c.valores) && estados.every(e => (c.valores as readonly string[]).includes(e.valor)));
    if (pelaLista) return pelaLista;
    return escolhas.find(c => !Array.isArray(c.valores) && estados.some(e => e.valor === texto(fm?.[c.nome]))) ?? null;
}

/** O que faz: o texto como está; o texto que é um link só (`[[Valor A]]`) mostra o nome. */
const textoOuLink = (v: unknown) => (/^\s*\[\[[^\]]+\]\]\s*$/.test(texto(v)) ? nomeDoLink(v) : texto(v));

/** O que faz: uma data em texto, pelo formato do campo. */
function data(v: unknown, formato: string | undefined): string {
    const t = texto(v);
    if (!t) return '';
    if (formato === 'semana') return ehSemana(t) ? semanaCurta(t) : t;
    if (formato === 'trimestre' || formato === 'hora') return t;
    const lido = diaEHoraNoInicio(t);
    if (!lido.dia) return t;
    const dia = diaComAno(lido.dia);
    return formato === 'dia_hora' && lido.hora ? `${dia} · ${lido.hora}` : dia;
}

/**
 * O que faz: o valor de um campo em texto, pelo tipo e pelo formato do modelo.
 * Entra → sai: o campo, o valor cru e os rótulos dos vocabulários → o texto (vazio = sem valor).
 * Erro e ataque: lista de um valor só, número em texto, link com alias ou caminho, o
 * objeto `{ uid, reltype }` do `blockedBy`, data com hora; o que não se lê pelo formato
 * aparece cru, nunca some.
 */
export function valorEmTexto(campo: DomainField, cru: unknown, rotulos: RotulosDosVocabularios = {}, estados: readonly DomainState[] = []): string {
    const itens = listaDe(cru).filter(v => texto(v) !== '' || (v && typeof v === 'object'));
    if (!itens.length) return '';
    if (campo.tipo === 'link') return itens.map(nomeDoLink).filter(Boolean).join(', ');
    const vocab = typeof campo.valores === 'string' ? rotulos[campo.valores] : undefined;
    // A escolha que é um estado do próprio modelo (o status espelho da coluna) mostra o rótulo da tabela.
    const doEstado = (v: string) => (campo.tipo === 'escolha' ? estados.find(e => e.valor === v)?.rotulo : undefined);
    if (campo.tipo === 'lista' || campo.tipo === 'escolha') {
        return itens.map(v => (vocab ? vocab(texto(v)) : doEstado(texto(v)) ?? textoOuLink(v))).filter(Boolean).join(campo.tipo === 'lista' ? ' · ' : ', ');
    }
    if (campo.tipo === 'data') return itens.map(v => data(v, campo.formato)).filter(Boolean).join(', ');
    const um = itens.length === 1 ? itens[0] : null;
    if (um !== null && campo.formato === 'minutos') {
        const n = fieldNumber(um);
        return n === null ? texto(um) : (minutosTexto(n) ?? texto(um));
    }
    if (um !== null && campo.formato === 'reais') {
        const n = fieldNumber(um);
        return n === null ? texto(um) : reais(n);
    }
    return itens.map(textoOuLink).join(' · ');
}

/** O que faz: diz se o modelo mostra algum campo no painel (o que tem `editar: false` é só do Novo). */
export const mostraCampos = (modelo: DomainModel | null | undefined) => !!modelo && modelo.campos.some(c => c.editar !== false);

/** O que faz: um valor cru do frontmatter em texto (a lista junta, o link pelo nome, o objeto em JSON). */
function cruEmTexto(v: unknown): string {
    if (Array.isArray(v)) return v.map(cruEmTexto).filter(Boolean).join(', ');
    if (v && typeof v === 'object') return JSON.stringify(v);
    return textoOuLink(v);
}

/**
 * O que faz: o frontmatter de uma nota que nenhum modelo descreve (ou cujo modelo não declara
 * campo), chave por chave, em texto, para ler.
 * Por quê: P10c: todo nó com nota mostra o que a nota tem; sem modelo, a tela não sabe o rótulo
 * nem o dono de cada campo, então mostra a chave como está e não edita nada.
 * Entra → sai: o frontmatter → as linhas (a chave e o valor), na ordem da nota, sem as vazias.
 * Erro e ataque: a chave interna do Obsidian (`position`) não aparece; o objeto vira JSON, nunca some.
 */
export function camposCrus(campos: Record<string, unknown> | null | undefined): LinhaAntiga[] {
    return Object.entries(campos ?? {})
        .filter(([k]) => k !== 'position')
        .map(([nome, v]) => ({ nome, valor: cruEmTexto(v) }))
        .filter(l => l.valor !== '');
}

/**
 * O que faz: as linhas do painel de um nó, na ordem do modelo do tipo, e as chaves do
 * modelo antigo que a nota tem.
 * Por quê: §4 e §3.8: o painel segue o modelo, sem código por tipo. O campo sem valor
 * aparece com o `vazio` do modelo, e sem ele não aparece; o campo só do Novo
 * (`editar: false`) não entra no painel.
 * Entra → sai: o caminho da nota, o frontmatter, os modelos e os rótulos dos vocabulários → `CamposDoNo`.
 */
export function camposDoNo(caminho: string | null | undefined, campos: Record<string, unknown> | null | undefined, modelos: readonly DomainModel[], rotulos: RotulosDosVocabularios = {}): CamposDoNo {
    const modelo = caminho ? modeloDaNota(caminho, campos, modelos) : null;
    if (!modelo) return { tipo: null, campos: [], antigos: [] };
    const fm = campos ?? {};
    const linhas: LinhaDeCampo[] = [];
    // Os campos como valem no formato da nota (03/11, o ramo Criação): sem formatos, os do modelo.
    for (const campo of camposNoFormato(modelo, fm)) {
        if (campo.editar === false) continue;
        const valor = valorEmTexto(campo, fm[campo.nome], rotulos, modelo.estados);
        if (!valor && !campo.vazio) continue;
        linhas.push({
            nome: campo.nome, rotulo: campo.rotulo, valor: valor || campo.vazio!, vazio: !valor,
            ...(campo.planejado ? { planejado: campo.planejado } : {}),
            ...(campo.tipo === 'link' && valor ? { links: linksDoCampo(fm[campo.nome]) } : {}),
        });
    }
    const antigos = modelo.legado
        .filter(chave => Object.prototype.hasOwnProperty.call(fm, chave))
        .map(chave => ({ nome: chave, valor: listaDe(fm[chave]).map(v => (v && typeof v === 'object' ? JSON.stringify(v) : texto(v))).filter(Boolean).join(' · ') || '—' }));
    return { tipo: modelo.dominio, campos: linhas, antigos };
}
