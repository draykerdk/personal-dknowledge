/**
 * O dinheiro da Missão: o que entrou e saiu em cada dia e a reserva.
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, 8.10) e o plano (3d.6). `entrou` e
 * `saiu` na Day, em reais, opcionais; vazio é "sem registro", nunca R$ 0. A reserva é o
 * último saldo informado, mais o que entrou e menos o que saiu desde então, só dos dias
 * com valor; os meses na média de gasto, dizendo qual (a declarada até haver 14 dias com
 * valor nos últimos 30, a recomendação da pergunta 1); e, em palavras, quantos dias
 * ficaram sem valor. Os valores são da pessoa: nada é estimado nem preenchido.
 *
 * Módulo puro. A leitura de número é a do núcleo (`fieldNumber`: "R$ 1.234,50").
 * Prova: tests/missao/dinheiro.test.ts.
 */
import { fieldNumber } from '../engine/choose';
import type { NotaComCampos, NotaDePeriodo } from './entrada';
import type { CustoDaPassagem, Passagem, Reserva } from './tipos';
import { addDays, diaMes } from './tempo';
import { diaDoArquivo, ehDia, reais, semEmojiInicial } from './formatos';

export interface ValorDoDia { entrou: number | null; saiu: number | null }

/** Os dias com valor nos últimos 30 a partir dos quais a média medida vale (pergunta 1). */
export const DIAS_PARA_MEDIR = 14;
export const JANELA_DA_MEDIA = 30;

/** O que faz: o que entrou e saiu num dia (a Day); sem o campo ou ilegível, `null` (sem registro). */
export function valorDoDia(nota: NotaDePeriodo | null | undefined): ValorDoDia {
    const campos = nota?.campos ?? {};
    const num = (v: unknown) => { const n = fieldNumber(v); return n === null ? null : Math.abs(n); };
    return { entrou: num(campos.entrou), saiu: num(campos.saiu) };
}

/** A conta dos dias sem registro numa janela: a janela até hoje, os dias com e os sem registro. */
export interface DiasSemRegistro {
    /** O primeiro e o último dia contados (o último é o de hoje quando a janela passa de hoje); `null` = nenhum dia até hoje. */
    de: string | null;
    ate: string | null;
    comRegistro: string[];
    semRegistro: string[];
}

/**
 * O que faz: a conta única do "dia sem registro" de dinheiro: de `de` até `ate` (e nunca depois de
 * hoje), os dias com `entrou` ou `saiu` e os dias sem nenhum dos dois.
 * Por quê: o diagnóstico do painel do nó (29/10, C3): três funções contavam o "dia sem valor", cada
 * uma com a sua janela e o seu critério ("2 dias sem valor" na passagem × "1 dia sem valor" na
 * reserva, com os mesmos dias). Agora o período, a passagem e a reserva contam por aqui, e cada texto
 * diz a sua janela com as datas.
 * Entra → sai: as Days, o primeiro e o último dia da janela e hoje → `DiasSemRegistro`.
 * Erro e ataque: a janela invertida, ou toda no futuro, não conta dia (`de` e `ate` nulos); data
 * malformada não conta; a volta tem um limite de dez anos.
 * Prova: tests/missao/dinheiro.test.ts ("a conta única").
 */
export function diasSemRegistro(dias: Record<string, NotaDePeriodo>, de: string, ate: string, hoje: string): DiasSemRegistro {
    const fim = ate < hoje ? ate : hoje;
    const comRegistro: string[] = [], semRegistro: string[] = [];
    if (!ehDia(de) || !ehDia(fim) || de > fim) return { de: null, ate: null, comRegistro, semRegistro };
    for (let d = de, guard = 0; d <= fim && guard < 3660; d = addDays(d, 1), guard++) {
        const v = valorDoDia(dias?.[d]);
        (v.entrou === null && v.saiu === null ? semRegistro : comRegistro).push(d);
    }
    return { de, ate: fim, comRegistro, semRegistro };
}

/**
 * O que faz: uma janela de dias em texto: "29/10", "28–29/10" (o mesmo mês), "30/09–02/10".
 * Entra → sai: o primeiro e o último dia → o texto.
 */
export function janelaEmTexto(de: string, ate: string): string {
    if (de === ate) return diaMes(de);
    return de.slice(5, 7) === ate.slice(5, 7) ? `${de.slice(8, 10)}–${diaMes(ate)}` : `${diaMes(de)}–${diaMes(ate)}`;
}

/** O que faz: "1 dia" e "2 dias". */
const nDias = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

export interface SomaDoPeriodo {
    entrou: number;
    saiu: number;
    /** Dias com `entrou` ou `saiu`. */
    diasComValor: number;
    /** Dias do período até hoje sem nenhum dos dois (o futuro não conta). */
    diasSemValor: number;
    /** "26–29/10: +R$ 300 · −R$ 52 · 2 dias sem registro"; sem nada, "26–29/10: nada registrado (4 dias)"; sem dia até hoje, vazio. */
    texto: string;
}

/**
 * O que faz: a soma de um período (os dias dele): o que entrou, o que saiu, quantos dias
 * têm valor e quantos, até hoje, não têm.
 * Prova: tests/missao/dinheiro.test.ts ("a soma do período").
 */
export function somaDoPeriodo(dias: Record<string, NotaDePeriodo>, datas: readonly string[], hoje: string): SomaDoPeriodo {
    const ordem = [...datas].filter(ehDia).sort();
    const conta = ordem.length ? diasSemRegistro(dias, ordem[0], ordem[ordem.length - 1], hoje) : diasSemRegistro(dias, '', '', hoje);
    let entrou = 0, saiu = 0;
    for (const d of conta.comRegistro) { const v = valorDoDia(dias?.[d]); entrou += v.entrou ?? 0; saiu += v.saiu ?? 0; }
    const com = conta.comRegistro.length, sem = conta.semRegistro.length;
    // A janela em datas; o período sem dia até hoje (o futuro) não tem o que contar.
    const janela = conta.de && conta.ate ? janelaEmTexto(conta.de, conta.ate) : '';
    const texto = !janela ? ''
        : com ? `${janela}: ${[`+${reais(entrou)}`, `−${reais(saiu)}`, ...(sem ? [`${nDias(sem)} sem registro`] : [])].join(' · ')}`
            : `${janela}: nada registrado (${nDias(sem)})`;
    return { entrou, saiu, diasComValor: com, diasSemValor: sem, texto };
}

/** O que faz: a marca do nó do dia: "💸 R$ 52" (o que saiu) ou "+R$ 300"; sem valor, `null` (o atalho "＋ R$"). */
export function marcaDoDia(nota: NotaDePeriodo | null | undefined): string | null {
    const v = valorDoDia(nota);
    if (v.entrou === null && v.saiu === null) return null;
    const parts: string[] = [];
    if (v.saiu !== null) parts.push(`💸 ${reais(v.saiu)}`);
    if (v.entrou !== null) parts.push(`+${reais(v.entrou)}`);
    return parts.join(' · ');
}

/**
 * O que faz: a reserva: o último saldo informado na nota (`saldo`, `atualizado_em`), mais
 * o que entrou e menos o que saiu nas Days depois dele (só os dias com valor), e os meses
 * pela média de gasto: a declarada (`gasto_mensal_medio`) até haver 14 dias com valor
 * nos últimos 30, então a medida, dizendo sempre qual.
 * Por quê: 8.10 e a pergunta 1 (a recomendação, enquanto a resposta não vem). A reserva é
 * opcional (A6 do mapa da v0): sem a nota, a linha e o rótulo ficam vazios e nada avisa.
 * Entra → sai: a nota da reserva, as Days e hoje → a reserva, com o saldo, os meses e o rótulo
 * (o nome da nota sem o símbolo do começo, como a tela a chama: "💰 Caixa" → "Caixa").
 * Erro e ataque: o `saldo_aprox` de hoje é texto ("R$ 5.000 disponíveis…") e não vira
 * número: o saldo fica sem número, dito em palavras. Valor negativo em `saiu` vale como
 * gasto (o sinal não inverte).
 * Prova: tests/missao/dinheiro.test.ts (o bloco da reserva).
 */
export function reserva(nota: NotaComCampos | null, dias: Record<string, NotaDePeriodo>, hoje: string): Reserva {
    const campos = nota?.campos ?? {};
    const saldoInformado = fieldNumber(campos.saldo);
    const em = String(campos.atualizado_em ?? '').trim().slice(0, 10);
    const informadoEm = ehDia(em) ? em : null;
    let entrouDesde = 0, saiuDesde = 0;
    // Depois do dia do saldo até hoje, pela conta única (a mesma da passagem e do período).
    const desde = informadoEm ? diasSemRegistro(dias, addDays(informadoEm, 1), hoje, hoje) : diasSemRegistro(dias, '', '', hoje);
    for (const d of desde.comRegistro) { const v = valorDoDia(dias?.[d]); entrouDesde += v.entrou ?? 0; saiuDesde += v.saiu ?? 0; }
    const semDesde = desde.semRegistro.length;
    const saldo = saldoInformado === null ? null : saldoInformado + entrouDesde - saiuDesde;

    let comValor = 0, gastoMedido = 0;
    for (let i = 0; i < JANELA_DA_MEDIA; i++) {
        const v = valorDoDia(dias?.[addDays(hoje, -i)]);
        if (v.entrou === null && v.saiu === null) continue;
        comValor++;
        gastoMedido += v.saiu ?? 0;
    }
    const declarada = fieldNumber(campos.gasto_mensal_medio);
    let gastoMensal: number | null = null;
    let media: Reserva['media'] = null;
    if (comValor >= DIAS_PARA_MEDIR) { gastoMensal = (gastoMedido / comValor) * 30; media = 'medida'; }
    else if (declarada !== null && declarada > 0) { gastoMensal = declarada; media = 'declarada'; }
    const meses = saldo !== null && gastoMensal ? Math.round((saldo / gastoMensal) * 10) / 10 : null;

    const parts: string[] = [];
    // Sem a nota da reserva, a linha fica vazia: nada aparece e nada avisa (A6).
    if (nota && saldoInformado === null) parts.push('saldo sem número na nota');
    else if (nota) parts.push(`saldo ${reais(saldo!)}${informadoEm ? ` (informado em ${informadoEm.slice(8, 10)}/${informadoEm.slice(5, 7)}${entrouDesde || saiuDesde ? `, +${reais(entrouDesde)} −${reais(saiuDesde)} desde então` : ''})` : ''}`);
    if (meses !== null) parts.push(`~${String(meses).replace('.', ',')} meses pela média ${media} (${reais(gastoMensal!)}/mês)`);
    // A janela dita com as datas: os dias depois do saldo, para não se ler como "desde a chegada" (C3).
    if (informadoEm && semDesde && desde.de && desde.ate) parts.push(`depois do saldo de ${diaMes(informadoEm)}, ${janelaEmTexto(desde.de, desde.ate)}: ${nDias(semDesde)} sem registro`);
    return { saldoInformado, informadoEm, saldo, entrouDesde, saiuDesde, diasSemValorDesde: semDesde, semRegistroDesde: desde.semRegistro, gastoMensal, media, meses, texto: parts.join(' · '), rotulo: nota ? semEmojiInicial(nota.nome) || 'Reserva' : '' };
}

/**
 * O que faz: os dias de uma lista de notas (o caminho e o frontmatter): as Days direto na pasta
 * dos dias, com o nome `AAAA-MM-DD`, e só o que entrou e saiu.
 * Por quê: a função do núcleo que pinta o bloco da nota da reserva faz a mesma conta da Missão sem o leitor dela.
 * Erro e ataque: nota fora da pasta, numa subpasta, com outro nome ou sem frontmatter não entra.
 * Prova: tests/missao/dinheiro.test.ts ("os dias das notas").
 */
export function diasDasNotas(notas: ReadonlyArray<{ path: string; frontmatter: Record<string, any> | null }>, pasta: string): Record<string, NotaDePeriodo> {
    const out: Record<string, NotaDePeriodo> = {};
    const base = `${String(pasta ?? '').replace(/\/+$/, '')}/`;
    for (const n of notas ?? []) {
        const resto = String(n?.path ?? '').startsWith(base) ? n.path.slice(base.length) : '';
        const dia = diaDoArquivo(resto);
        if (!dia || !n.frontmatter) continue;
        out[dia] = { caminho: n.path, campos: { entrou: n.frontmatter.entrou, saiu: n.frontmatter.saiu } };
    }
    return out;
}

/**
 * O que faz: o que saiu durante uma passagem: a soma do `saiu` das Days dela, os dias com valor
 * e, em palavras, os dias sem valor; e a linha da reserva de hoje.
 * Por quê: a arquitetura (§3.8, o custo da passagem na reserva) e o §8.10: vazio é "sem
 * registro", nunca R$ 0; nada é estimado pelo sistema.
 * Entra → sai: a passagem, as Days, hoje e a reserva → `CustoDaPassagem`.
 * Erro e ataque: a passagem que começa depois de hoje não tem dia até hoje (nada a somar,
 * nenhum dia sem valor); o `entrou` não entra (é o que saiu na passagem).
 * Prova: tests/missao/dinheiro.test.ts ("o custo da passagem").
 */
export function custoDaPassagem(e: Passagem, dias: Record<string, NotaDePeriodo>, hoje: string, rw: Reserva): CustoDaPassagem {
    const conta = diasSemRegistro(dias, e.de, e.ate ?? hoje, hoje);
    let saiu = 0, entrou = 0, comSaida = false, comEntrada = false;
    for (const d of conta.comRegistro) {
        const v = valorDoDia(dias?.[d]);
        if (v.saiu !== null) { comSaida = true; saiu += v.saiu; }
        if (v.entrou !== null) { comEntrada = true; entrou += v.entrou; }
    }
    const com = conta.comRegistro.length, sem = conta.semRegistro.length;
    const janela = conta.de && conta.ate ? janelaEmTexto(conta.de, conta.ate) : '';
    // O que saiu e o que entrou, só o que foi registrado (nunca um "R$ 0" que ninguém escreveu).
    const valores = [...(comSaida ? [`saiu ${reais(saiu)}`] : []), ...(comEntrada ? [`entrou ${reais(entrou)}`] : [])].join(', ');
    const texto = !janela ? `começa em ${diaMes(e.de)}: nada a contar ainda`
        : com ? `${janela}: ${[`${valores} (${nDias(com)} com registro)`, ...(sem ? [`${nDias(sem)} sem registro`] : [])].join(' · ')}`
            : `${janela}: nada registrado (${nDias(sem)})`;
    return { saiu, diasComValor: com, diasSemValor: sem, semRegistro: conta.semRegistro, texto, reserva: rw.texto };
}
