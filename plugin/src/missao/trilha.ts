/**
 * A trilha de uso da Missão (05/11/2026): receber quem chega à tarde ou à noite, o gesto da semana e a dica
 * da primeira vez.
 *
 * Por quê: muita gente não começa o dia pelo diário: vai fazendo as coisas e registra no fim da tarde, e
 * quem chega precisa de algo didático para ir aprendendo e se familiarizando com o sistema. Nenhum jeito novo de
 * registrar: a acolhida é só a porta de entrada para os gestos que já existem (o "＋ O que fiz", o 🌙 com o 📖
 * Pelo diário e o compromisso de amanhã), e o gesto da semana se marca pelo uso real, pela contagem única do
 * motor (`engine/usoDosGestos.ts`). Os textos moram no arquivo da trilha (`Config/trilha.json`) e o que liga,
 * as horas e os números, nas definições do sistema: nada disso fica no código, porque o plugin também sai no
 * pacote aberto e isto é a boas-vindas de quem instala.
 *
 * Módulo puro: sem Obsidian e sem DOM. Prova: tests/missao/trilha.test.ts.
 */
import { diasDeUso, lerContaDoGesto, type ContaDoGesto, type FontesDoUso } from '../engine/usoDosGestos';
import { CAMPOS_DO_COMANDO } from '../engine/commitmentLeft';
import { addDays } from './tempo';
import { DIA } from './formatos';
import type { ChavesDaTrilha, MissaoEntrada } from './entrada';
import type { AcolhidaDoDia, ConfigDaTrilha, DicaDaTrilha, GestoDaTrilha, GestoDaVez, MissaoIndice, TrilhaDoModelo } from './tipos';

/** A janela de partida do uso, quando o arquivo não diz (oito semanas). */
const JANELA_DE_PARTIDA = 56;
/** O que a Day guarda do registro do dia (P9): as pessoas e o dinheiro; o lugar (`cidade`) é do plano, não registro. */
const CAMPOS_DO_REGISTRO = ['pessoas', 'entrou', 'saiu'];

const ID = /^[a-z0-9_]+$/;
const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);
const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const preenchido = (v: unknown) => v !== undefined && v !== null && !(typeof v === 'string' && !v.trim()) && !(Array.isArray(v) && !v.length);

/** O que faz: um mapa de textos (só as chaves de texto não vazio). */
function textos(v: unknown): Record<string, string> {
    const o = objeto(v);
    const out: Record<string, string> = {};
    for (const [k, x] of Object.entries(o ?? {})) if (!k.startsWith('_') && texto(x)) out[k] = texto(x);
    return out;
}

/**
 * O que faz: o arquivo da trilha lido: os textos da acolhida e do cartão, os gestos na ordem (com as contas de
 * cada um) e as dicas.
 * Entra → sai: o JSON cru → a configuração, ou `null` quando não é um objeto.
 * Erro e ataque: o gesto sem id válido, sem título ou sem nenhuma conta que sirva fica de fora; o id repetido
 * vale pela primeira vez; a dica sem `act` ou sem texto fica de fora; a janela fora de 1 a 366 é a de partida.
 * Prova: tests/missao/trilha.test.ts ("o arquivo da trilha").
 */
export function lerConfigDaTrilha(raw: unknown): ConfigDaTrilha | null {
    const o = objeto(raw);
    if (!o) return null;
    const vistos = new Set<string>();
    const gestos: GestoDaTrilha[] = [];
    for (const g of Array.isArray(o.gestos) ? o.gestos : []) {
        const x = objeto(g);
        const id = texto(x?.id);
        const contas = (Array.isArray(x?.conta) ? x!.conta as unknown[] : []).map(lerContaDoGesto).filter((c): c is ContaDoGesto => !!c);
        if (!x || !ID.test(id) || vistos.has(id) || !texto(x.titulo) || !contas.length) continue;
        vistos.add(id);
        gestos.push({ id, emoji: texto(x.emoji), titulo: texto(x.titulo), como: texto(x.como), para: texto(x.para), guia: texto(x.guia), contas });
    }
    const dicas: DicaDaTrilha[] = [];
    for (const d of Array.isArray(o.dicas) ? o.dicas : []) {
        const x = objeto(d);
        const id = texto(x?.id), act = texto(x?.act), t = texto(x?.texto);
        if (!x || !ID.test(id) || !/^[a-z0-9-]+$/.test(act) || !t || dicas.some(y => y.id === id)) continue;
        const protocolo = texto(x.protocolo);
        dicas.push({ id, act, protocolo: ID.test(protocolo) ? protocolo : null, texto: t });
    }
    const janela = typeof o.janela_dias === 'number' && Number.isInteger(o.janela_dias) && o.janela_dias >= 1 && o.janela_dias <= 366 ? o.janela_dias : JANELA_DE_PARTIDA;
    return { janela, acolhida: textos(o.acolhida), cartao: textos(o.cartao), gestos, dicas, dicaFechar: texto(o.dica_fechar) };
}

/**
 * O que faz: diz se um dia ficou sem registro: sem a Day, ou com a Day sem o que o ▶️ e o 🌙 gravam, sem as
 * pessoas e o dinheiro, sem linha de protocolo do motor, sem tarefa concluída e sem marca de hábito nesse dia.
 * Por quê: a acolhida aparece quando o dia de hoje ainda não tem nada, e os dias de antes sem nada ficam à mão
 * para registrar depois; o dia com qualquer registro já foi tocado.
 * Entra → sai: a entrada, o índice, os protocolos de cada Day e o dia → `true` quando nada se registrou.
 * Erro e ataque: a tarefa cancelada não é registro; o lugar do dia (`cidade`) não conta (é do plano).
 * Prova: tests/missao/trilha.test.ts ("o dia sem registro").
 */
export function diaSemRegistro(entrada: Pick<MissaoEntrada, 'dias' | 'habitos'>, indice: Pick<MissaoIndice, 'tarefas'>, protocolosPorDia: Readonly<Record<string, readonly string[]>>, dia: string): boolean {
    const campos = entrada.dias?.[dia]?.campos ?? {};
    if ([...CAMPOS_DO_COMANDO, ...CAMPOS_DO_REGISTRO].some(k => preenchido(campos[k]))) return false;
    if ((protocolosPorDia[dia] ?? []).length) return false;
    if (indice.tarefas.some(t => t.feita && t.record.completedDate === dia)) return false;
    if ((entrada.habitos ?? []).some(h => h.entries?.includes(dia))) return false;
    return true;
}

/**
 * O que faz: os dias de antes de hoje sem registro, do mais recente ao mais antigo, até `n` dias para trás.
 * Entra → sai: a entrada, o índice, os protocolos de cada Day, hoje e n → os dias `AAAA-MM-DD`.
 * Erro e ataque: n zero ou negativo dá a lista vazia.
 * Prova: tests/missao/trilha.test.ts ("o dia sem registro").
 */
export function diasPassadosSemRegistro(entrada: Pick<MissaoEntrada, 'dias' | 'habitos'>, indice: Pick<MissaoIndice, 'tarefas'>, protocolosPorDia: Readonly<Record<string, readonly string[]>>, hoje: string, n: number): string[] {
    const out: string[] = [];
    for (let i = 1; i <= Math.max(0, n); i++) {
        const d = addDays(hoje, -i);
        if (d && diaSemRegistro(entrada, indice, protocolosPorDia, d)) out.push(d);
    }
    return out;
}

/**
 * O que faz: a acolhida aparece agora? Só depois da hora da tarde (`HH:MM`, a das definições).
 * Entra → sai: a acolhida do dia (ou `null`) e a hora de agora → sim ou não.
 * Erro e ataque: sem acolhida, ou a hora fora do formato, não aparece.
 * Prova: tests/missao/trilha.test.ts ("a acolhida").
 */
export function mostraAcolhida(acolhida: AcolhidaDoDia | null | undefined, hora: string | null | undefined): boolean {
    const h = String(hora ?? '');
    return !!acolhida && /^([01]\d|2[0-3]):[0-5]\d$/.test(h) && h >= acolhida.horaDaTarde;
}

/**
 * O que faz: o que a trilha põe no centro de uma linha, em texto: a acolhida do dia, se ela aparece agora, e o
 * cartão do gesto da semana. A linha da Missão se redesenha quando este texto muda.
 * Por quê: a percorrida de 06/11 nas Definições: desligar a acolhida (ou ligá-la, ou passar da hora da tarde) não
 * mudava a linha aberta, porque a assinatura da linha só lia os dados dela, e a trilha vem à parte no modelo; a
 * acolhida só saía ao reabrir a Missão.
 * Entra → sai: a trilha do modelo (ou nada), o dia da linha e a hora de agora → o texto (vazio sem trilha).
 * Erro e ataque: sem trilha, o texto vazio; nada lança.
 * Prova: tests/missao/componenteTrilha.test.ts ("desligar nas Definições").
 */
export function assinaturaDaTrilha(trilha: Pick<TrilhaDoModelo, 'acolhida' | 'gesto'> | null | undefined, dia: string, hora: string | null | undefined): string {
    if (!trilha) return '';
    const acolhida = trilha.acolhida(dia);
    return JSON.stringify([acolhida, mostraAcolhida(acolhida, hora), trilha.gesto]);
}

/**
 * O que faz: as fontes do uso (a contagem do motor) pela entrada da Missão: os protocolos de cada Day, as
 * TaskNotes com a origem, a conclusão, a criação e a SMART mãe, e as marcas do salvamento.
 * Prova: tests/missao/trilha.test.ts ("o gesto da vez").
 */
export function fontesDoUso(trilha: Pick<NonNullable<MissaoEntrada['trilha']>, 'protocolosPorDia' | 'marcas'>, indice: Pick<MissaoIndice, 'tarefas'>): FontesDoUso {
    return {
        protocolosPorDia: trilha.protocolosPorDia ?? {},
        marcas: trilha.marcas ?? {},
        tarefas: indice.tarefas.map(t => ({
            ...(t.record.origem ? { origem: t.record.origem } : {}),
            ...(t.feita && t.record.completedDate ? { concluida: t.record.completedDate } : {}),
            ...(t.record.created ? { criada: t.record.created } : {}),
            comSmart: t.tipo === 'acao' && !!t.smart,
        })),
    };
}

/**
 * O que faz: os dias de uso de cada gesto da trilha, na janela do arquivo (de hoje para trás).
 * Entra → sai: a configuração, as fontes e hoje → id → dias de uso.
 * Prova: tests/missao/trilha.test.ts ("o gesto da vez").
 */
export function usosDosGestos(config: ConfigDaTrilha, fontes: FontesDoUso, hoje: string): Record<string, number> {
    const desde = addDays(hoje, -(config.janela - 1)) ?? '';
    return Object.fromEntries(config.gestos.map(g => [g.id, diasDeUso(g.contas, fontes, desde).filter(d => d <= hoje).length]));
}

/**
 * O que faz: o gesto da vez: o primeiro da ordem da trilha com menos dias de uso que a meta; todos na meta, o fim.
 * Por quê: um gesto por vez até virar hábito; o uso real o marca, e o seguinte vem quando ele chega à meta (a
 * árvore de uso, com o critério `uso`, propõe o seguinte pela triagem).
 * Entra → sai: a configuração, os usos e a meta → o gesto da vez, ou `null` sem gesto declarado.
 * Prova: tests/missao/trilha.test.ts ("o gesto da vez").
 */
export function gestoDaVez(config: ConfigDaTrilha, usos: Readonly<Record<string, number>>, meta: number): GestoDaVez | null {
    if (!config.gestos.length) return null;
    const i = config.gestos.findIndex(g => (usos[g.id] ?? 0) < meta);
    if (i < 0) return { fim: true, textos: config.cartao };
    return { fim: false, gesto: config.gestos[i], n: usos[config.gestos[i].id] ?? 0, meta, i, total: config.gestos.length, proximo: config.gestos[i + 1] ?? null, textos: config.cartao };
}

/**
 * O que faz: um texto do arquivo com os valores no lugar das chaves (`{n} de {meta} dias`).
 * Erro e ataque: a chave sem valor fica como está; o texto vazio dá vazio.
 * Prova: tests/missao/trilha.test.ts ("o gesto da vez").
 */
export function comValores(modelo: string | undefined, valores: Readonly<Record<string, string | number>>): string {
    return String(modelo ?? '').replace(/\{([a-z_]+)\}/g, (m, k: string) => (k in valores ? String(valores[k]) : m));
}

/**
 * O que faz: a trilha no modelo de uma versão: a acolhida de cada dia, o gesto da vez, os usos e as dicas, cada
 * parte pelo que as definições ligam.
 * Entra → sai: a entrada, o índice e hoje → a trilha, ou `null` sem o arquivo da trilha (ou com ele ilegível).
 * Prova: tests/missao/trilha.test.ts ("no modelo").
 */
export function trilhaDoModelo(entrada: Pick<MissaoEntrada, 'dias' | 'habitos' | 'trilha'>, indice: Pick<MissaoIndice, 'tarefas'>, hoje: string): TrilhaDoModelo | null {
    const lida = entrada.trilha;
    const config = lida ? lerConfigDaTrilha(lida.config) : null;
    if (!lida || !config) return null;
    const chaves: ChavesDaTrilha = lida.chaves;
    const usos = usosDosGestos(config, fontesDoUso(lida, indice), hoje);
    let passados: string[] | null = null;
    return {
        acolhida: dia => {
            if (!chaves.acolhida || dia !== hoje || !diaSemRegistro(entrada, indice, lida.protocolosPorDia, dia)) return null;
            passados ??= diasPassadosSemRegistro(entrada, indice, lida.protocolosPorDia, hoje, chaves.dias_passados);
            return { textos: config.acolhida, horaDaTarde: chaves.hora_da_tarde, passados };
        },
        gesto: chaves.gesto_da_semana ? gestoDaVez(config, usos, chaves.vezes) : null,
        usos,
        dicas: chaves.dicas ? config.dicas : [],
        dicaFechar: config.dicaFechar,
    };
}

/* ------------------------------------------------------------ o que a Missão guarda no salvamento */

/** O que a trilha guarda no salvamento do plugin: as marcas dos gestos sem rastro próprio, as dicas vistas e o último gesto da vez. */
export interface EstadoDaTrilha { marcas: Record<string, string[]>; vistas: string[]; gesto: string }

/** Quantos dias de marca cada gesto guarda (o resto sai: a janela do uso é menor). */
const DIAS_GUARDADOS = 120;

/**
 * O que faz: o estado da trilha lido do salvamento, limpo: as marcas só com dias válidos, as dicas vistas só
 * com ids, o gesto da vez como texto.
 * Erro e ataque: o que não é objeto vale como vazio; a chave que não é id fica de fora; nada lança.
 * Prova: tests/missao/trilha.test.ts ("o salvamento").
 */
export function estadoDaTrilha(raw: unknown): EstadoDaTrilha {
    const o = objeto(raw);
    const marcas: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(objeto(o?.marcas) ?? {})) {
        if (!ID.test(k) || !Array.isArray(v)) continue;
        const dias = [...new Set(v.map(String).filter(d => DIA.test(d)))].sort().slice(-DIAS_GUARDADOS);
        if (dias.length) marcas[k] = dias;
    }
    const vistas = Array.isArray(o?.vistas) ? [...new Set((o!.vistas as unknown[]).map(String).filter(x => ID.test(x)))] : [];
    return { marcas, vistas, gesto: texto(o?.gesto) };
}

/**
 * O que faz: o estado com a marca de um gesto num dia; o mesmo dia de novo não muda nada (`null`).
 * Entra → sai: o estado, o gesto e o dia → o estado novo, ou `null` quando já estava marcado ou o pedido não serve.
 * Prova: tests/missao/trilha.test.ts ("o salvamento").
 */
export function comMarca(estado: EstadoDaTrilha, gesto: string, dia: string): EstadoDaTrilha | null {
    if (!ID.test(gesto) || !DIA.test(dia) || (estado.marcas[gesto] ?? []).includes(dia)) return null;
    const dias = [...(estado.marcas[gesto] ?? []), dia].sort().slice(-DIAS_GUARDADOS);
    return { ...estado, marcas: { ...estado.marcas, [gesto]: dias } };
}

/**
 * O que faz: a marca que um movimento da Missão deixa na trilha: pôr a tarefa numa SMART é `ligar_smart`; dar
 * um dia ou uma semana à que ficou de antes é `mover_de_antes`; o resto, nenhuma.
 * Por quê: os dois gestos não deixam rastro próprio na nota (o `projects` e o `scheduled` mudam igual por
 * qualquer caminho); a Missão marca quando o gesto é feito nela.
 * Entra → sai: se a tarefa ficou de antes e o destino → o nome da marca, ou `null`.
 * Prova: tests/missao/trilha.test.ts ("o salvamento").
 */
export function marcaDoMovimento(deAntes: boolean, destino: { tipo: string }): string | null {
    if (destino?.tipo === 'ligar-smart') return 'ligar_smart';
    if (deAntes && (destino?.tipo === 'dia' || destino?.tipo === 'semana')) return 'mover_de_antes';
    return null;
}
