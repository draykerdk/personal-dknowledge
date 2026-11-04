/**
 * Os campos do modelo do tipo, para editar: quem edita cada campo e como o valor digitado
 * vira valor do frontmatter, conferido.
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, §4.2, §4.4): o campo com
 * `dono: nota` o painel edita direto; `protocolo:<id>#<passo>` edita pelo formulário desse
 * protocolo; `derivado` é só leitura; `editar: false` não aparece no painel; o campo cujo
 * escritor ainda não chegou (`planejado`) fica para o passo dele. A validação é uma função
 * pura (`valorDoCampo`), usada pelo painel e pelos testes: confere obrigatório, formato,
 * valores do catálogo e as regras do tipo (a SMART sem `scheduled`, o impacto de 1 a 10).
 * O problema sai em palavras, e nada é gravado com ele.
 *
 * O resto vem do campo do modelo e do catálogo que a borda dá; os únicos nomes escritos
 * aqui são as duas regras do tipo que o §4.4 nomeia (a SMART sem `scheduled`, o impacto de
 * 1 a 10), e não chegam ao componente (§3.8).
 *
 * Módulo puro: sem Obsidian e sem DOM. Prova: tests/engine/fieldModel.test.ts.
 */
import type { DomainField } from './domainModel';
import { TASK_CONTEXTS } from './taskContexts';
import { DIA } from './dia';
import { SEMANA, TRIMESTRE } from './periodo';

/** Uma opção de um vocabulário: o valor gravado e o rótulo da tela. */
export interface OpcaoDoCampo { valor: string; rotulo: string }

/** Os vocabulários do sistema, lidos do catálogo do TaskNotes e das tabelas (a borda dá). */
export interface Vocabularios {
    status: OpcaoDoCampo[];
    prioridade: OpcaoDoCampo[];
    contextos: OpcaoDoCampo[];
}

/** Como o campo se edita no painel: direto, pelo editor do TaskNotes, pelo protocolo dono ou não se edita. */
export type ComoEdita =
    | { via: 'campo' }
    | { via: 'tasknotes'; porque: string }
    | { via: 'protocolo'; protocolo: string; passo: string | null }
    | { via: 'nenhum'; porque: string };

export interface OpcoesDoCampo {
    /** O campo que dá o nome do arquivo (o título, com `storeTitleInFilename`): edita pelo TaskNotes. */
    nomeDoArquivo?: string | null;
}

/**
 * O que faz: diz como o painel edita um campo do modelo.
 * Por quê: §4.2 (`dono`, `editar`, `planejado`) e o TaskNotes, que é dono do nome do arquivo:
 * trocar o título ali renomeia a nota e os links, o que o painel não faz por fora.
 * Entra → sai: o campo e as opções da borda → `ComoEdita`.
 */
export function comoEdita(campo: DomainField, opcoes: OpcoesDoCampo = {}): ComoEdita {
    if (campo.editar === false) return { via: 'nenhum', porque: 'o campo não é do painel' };
    if (campo.planejado) return { via: 'nenhum', porque: `o escritor chega no ${campo.planejado}` };
    if (campo.dono === 'derivado') return { via: 'nenhum', porque: 'o sistema calcula' };
    const m = campo.dono.match(/^protocolo:([a-z][a-z0-9_]*)(?:#([a-z][a-z0-9_]*))?$/);
    if (m) return { via: 'protocolo', protocolo: m[1], passo: m[2] ?? null };
    if (campo.dono !== 'nota') return { via: 'nenhum', porque: 'o dono do campo não é a nota' };
    if (opcoes.nomeDoArquivo && campo.nome === opcoes.nomeDoArquivo) return { via: 'tasknotes', porque: 'o título é o nome do arquivo: o TaskNotes renomeia a nota e os links' };
    return { via: 'campo' };
}

/** O resultado de ler o que se digitou: o valor a gravar (`null` apaga) ou o problema. */
export type ValorDoCampo = { ok: true; valor: unknown } | { ok: false; problema: string };

export interface RegrasDoValor {
    /** O `type` da nota (as regras do tipo: a SMART não tem `scheduled`). */
    type?: string;
    vocabularios?: Partial<Vocabularios>;
    /** O link existe? Sem a função, não se confere. */
    existe?: (nome: string) => boolean;
    /** O frontmatter atual da nota (as regras entre campos: a saída nunca antes da chegada). */
    nota?: Record<string, unknown>;
}

// Forma própria (não é a `DIA` nem o `diaEHoraNoInicio`): o campo `dia_hora` inteiro, com a hora conferida (00–23, 00–59) e só o `T`.
const DIA_HORA = /^(\d{4}-\d{2}-\d{2})(?:T(([01]\d|2[0-3]):[0-5]\d))?$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const vazio = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

function diaValido(d: string): boolean {
    const t = new Date(`${d}T00:00:00Z`);
    return Number.isFinite(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

/** O que faz: um número de um texto em português ou inglês (`1,5`, `1.5`, `R$ 2.000,00`). */
function numero(v: unknown): number | null {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    let t = String(v ?? '').replace(/R\$|\s/g, '');
    if (!t) return null;
    if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    else t = t.replace(/,/g, '');
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
}

/** Um link inteiro: `[[X]]`, com o X sem colchetes, ou um link dentro de outro (`[[[[X]]]]`). */
const LINK_INTEIRO = /^\[\[\s*(\[\[.*\]\]|[^\[\]]*?)\s*\]\]$/;

/**
 * O que faz: o texto de um link sem os colchetes que já tem, quantas camadas houver (`[[Vietnã]]` e
 * `[[[[Vietnã]]]]` dão `Vietnã`); o que não é um link inteiro passa como está, sem as pontas.
 * Por quê: o P15 (29/10): o país digitado com colchetes ("[[Vietnã]]") virava `[[[[Vietnã]]]]`, porque
 * quem embrulha o nome em link tirava uma camada só, e a sugestão já vinha embrulhada.
 * Entra → sai: o valor → o texto. Erro e ataque: "[[A]], [[B]]" não é um link inteiro e não se corta.
 * Prova: tests/engine/fieldModel.test.ts ("o link que já vem com colchetes").
 */
export function semColchetes(v: unknown): string {
    let t = String(v ?? '').trim();
    for (let m = t.match(LINK_INTEIRO); m; m = t.match(LINK_INTEIRO)) t = m[1].trim();
    return t;
}

/**
 * O que faz: o link de um nome, `[[nome]]`, num lugar só: o nome que já vem como link não se embrulha
 * de novo; vazio dá ''.
 * Entra → sai: o nome (ou o link) → o link.
 * Prova: tests/engine/fieldModel.test.ts ("o link que já vem com colchetes").
 */
export function linkDoNome(v: unknown): string {
    const n = semColchetes(v);
    return n ? `[[${n}]]` : '';
}

/** O que faz: o nome de um link digitado (`[[Nota]]`, `Nota`, `[[Pasta/Nota|Alias]]`, `[[[[Nota]]]]`). */
function nomeDoLink(v: unknown): string {
    return semColchetes(v).split('|')[0].split('/').pop()!.replace(/\.md$/, '').trim();
}

/**
 * O que faz: a regra da estadia (página Missão, §4.4 e §8.1): na nota da cidade, a saída
 * nunca vem antes da chegada. Devolve o problema em palavras, ou `null`.
 * Entra → sai: o nome do campo, o dia digitado e o frontmatter atual → o problema ou `null`.
 * Erro e ataque: o outro campo vazio ou malformado não barra nada (a conferência do cofre diz).
 * Prova: tests/engine/fieldModel.test.ts ("a saída nunca antes da chegada").
 */
function ordemDaEstadia(nome: string, dia: string, nota: Record<string, unknown> | undefined): string | null {
    const outro = (k: string) => { const v = String(nota?.[k] ?? '').trim().slice(0, 10); return DIA.test(v) ? v : ''; };
    if (nome === 'saida') { const c = outro('chegada'); if (c && dia < c) return `a saída vem depois da chegada (${c})`; }
    if (nome === 'chegada') { const sa = outro('saida'); if (sa && dia > sa) return `a chegada vem antes da saída (${sa})`; }
    return null;
}

const listaDe = (v: unknown): unknown[] => (Array.isArray(v) ? v : String(v ?? '').split(/[,;\n]/));
/**
 * Os itens de uma lista livre: escrita uma por linha (a caixa de várias linhas, quando um item tem
 * vírgula: as checagens da estadia, 30/10), divide-se só nas linhas; numa linha só, na vírgula.
 */
const itensDaLista = (v: unknown): unknown[] => (typeof v === 'string' && /\n/.test(v) ? v.split(/\r?\n/) : listaDe(v));

/**
 * O que faz: a lista livre (sem `valores`) cujo valor tem um item com vírgula ou ponto e vírgula, ou
 * que já se escreve uma por linha: a caixa dela é de várias linhas, um item por linha.
 * Por quê: na caixa de uma linha os itens se separam na vírgula, e a checagem "O dia da semana e o
 * mês no carrinho, antes de pagar" viraria duas ao ser editada.
 * Entra → sai: o campo e o valor cru → se a caixa é de várias linhas.
 */
export function listaPorLinha(campo: DomainField, cru: unknown): boolean {
    if (campo.tipo !== 'lista' || campo.valores !== undefined) return false;
    if (typeof cru === 'string') return /\n/.test(cru);
    return Array.isArray(cru) && cru.some(v => /[,;]/.test(String(v ?? '')));
}

/** O que faz: o texto da caixa de várias linhas de uma lista livre: um item por linha. */
export function textoPorLinha(cru: unknown): string {
    return Array.isArray(cru) ? cru.map(v => String(v ?? '')).join('\n') : String(cru ?? '');
}

/**
 * O que faz: o valor que o painel grava para o que se digitou (ou escolheu) num campo.
 * Por quê: §4.4, "valida: uma função pura"; o problema aparece no campo, em palavras.
 * Entra → sai: o campo do modelo, a entrada (texto, número ou lista) e as regras → o valor
 * (`null` apaga o campo) ou o problema.
 * Erro e ataque: vazio no obrigatório; data que não existe (`2026-02-30`); semana 54; valor
 * fora do catálogo; contexto inventado; impacto fora de 1 a 10; número com vírgula; link
 * que não existe; `scheduled` numa SMART; texto com quebra de linha no campo curto.
 */
export function valorDoCampo(campo: DomainField, entrada: unknown, regras: RegrasDoValor = {}): ValorDoCampo {
    const erro = (problema: string): ValorDoCampo => ({ ok: false, problema });
    if (vazio(entrada)) return campo.obrigatorio ? erro(`${campo.rotulo} é obrigatório`) : { ok: true, valor: null };
    if (campo.nome === 'scheduled' && regras.type === 'tarefa_smart') return erro('a SMART não tem dia: ela é da semana');
    const texto = typeof entrada === 'string' ? entrada.trim() : entrada;
    const vocab = typeof campo.valores === 'string' ? regras.vocabularios?.[campo.valores] : undefined;
    const valoresFixos = Array.isArray(campo.valores) ? campo.valores : null;
    const dentroDe = (v: string): boolean => {
        if (valoresFixos) return valoresFixos.includes(v);
        if (vocab) return vocab.some(o => o.valor === v);
        return true;
    };
    switch (campo.tipo) {
        case 'texto': {
            const f = campo.formato ?? 'curto';
            if (f === 'numero' || f === 'minutos' || f === 'reais') {
                const n = numero(texto);
                if (n === null) return erro(`${campo.rotulo}: escreva um número`);
                if (f === 'minutos') return n < 0 ? erro(`${campo.rotulo}: os minutos não são negativos`) : { ok: true, valor: Math.round(n) };
                if (campo.nome === 'impacto' && (n < 1 || n > 10 || !Number.isInteger(n))) return erro('o impacto vai de 1 a 10');
                return { ok: true, valor: n };
            }
            const s = String(texto);
            if (f === 'curto' && /\n/.test(s)) return erro(`${campo.rotulo}: uma linha só`);
            return { ok: true, valor: s };
        }
        case 'data': {
            const s = String(texto);
            const f = campo.formato ?? 'dia';
            if (f === 'dia') {
                if (!DIA.test(s) || !diaValido(s)) return erro(`${campo.rotulo}: o dia é AAAA-MM-DD`);
                const ordem = ordemDaEstadia(campo.nome, s, regras.nota);
                return ordem ? erro(ordem) : { ok: true, valor: s };
            }
            if (f === 'dia_hora') {
                const m = s.replace(' ', 'T').match(DIA_HORA);
                return m && diaValido(m[1]) ? { ok: true, valor: m[2] ? `${m[1]}T${m[2]}` : m[1] } : erro(`${campo.rotulo}: o dia é AAAA-MM-DD, e a hora, HH:MM`);
            }
            if (f === 'hora') return HORA.test(s) ? { ok: true, valor: s } : erro(`${campo.rotulo}: a hora é HH:MM`);
            if (f === 'semana') return SEMANA.test(s) ? { ok: true, valor: s } : erro(`${campo.rotulo}: a semana é AAAA-Www`);
            if (f === 'trimestre') return TRIMESTRE.test(s) ? { ok: true, valor: s } : erro(`${campo.rotulo}: o trimestre é AAAA-Qn`);
            return erro(`${campo.rotulo}: formato de data desconhecido`);
        }
        case 'escolha': {
            const s = String(texto);
            return dentroDe(s) ? { ok: true, valor: s } : erro(`${campo.rotulo}: “${s}” não está entre as opções`);
        }
        case 'lista': {
            const itens = [...new Set(itensDaLista(texto).map(v => String(v).trim()).filter(Boolean))];
            const conhecidos = campo.valores === 'contextos' ? (vocab?.map(o => o.valor) ?? [...TASK_CONTEXTS]) : null;
            const fora = itens.filter(v => (conhecidos ? !conhecidos.includes(v) : !dentroDe(v)));
            if (fora.length) return erro(`${campo.rotulo}: “${fora.join(', ')}” não está entre as opções`);
            return itens.length ? { ok: true, valor: itens } : (campo.obrigatorio ? erro(`${campo.rotulo} é obrigatório`) : { ok: true, valor: null });
        }
        case 'link': {
            const nomes = [...new Set(listaDe(texto).map(nomeDoLink).filter(Boolean))];
            if (!nomes.length) return campo.obrigatorio ? erro(`${campo.rotulo} é obrigatório`) : { ok: true, valor: null };
            if (!campo.multiplo && nomes.length > 1) return erro(`${campo.rotulo}: um link só`);
            const faltam = regras.existe ? nomes.filter(n => !regras.existe!(n)) : [];
            if (faltam.length) return erro(`${campo.rotulo}: “${faltam.join(', ')}” não existe no cofre`);
            const links = nomes.map(linkDoNome);
            return { ok: true, valor: campo.multiplo ? links : links[0] };
        }
    }
    return erro(`${campo.rotulo}: tipo de campo desconhecido`);
}

/** O que faz: o texto que a caixa do campo mostra para editar (o valor cru, legível). */
export function textoParaEditar(campo: DomainField, cru: unknown): string {
    if (cru === undefined || cru === null) return '';
    const itens = Array.isArray(cru) ? cru : [cru];
    if (campo.tipo === 'link') return itens.map(v => nomeDoLink(v && typeof v === 'object' ? (v as Record<string, unknown>).uid : v)).filter(Boolean).join(', ');
    // Forma própria (não é a `DIA`): reescreve o dia com hora (`T` ou espaço, segundos e fuso fora) como `AAAA-MM-DDTHH:mm`.
    if (campo.tipo === 'data' && campo.formato === 'dia_hora') return String(itens[0] ?? '').replace(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}).*$/, '$1T$2');
    if (campo.tipo === 'data' && campo.formato === 'dia') return String(itens[0] ?? '').slice(0, 10);
    return itens.map(v => String(v)).join(', ');
}
