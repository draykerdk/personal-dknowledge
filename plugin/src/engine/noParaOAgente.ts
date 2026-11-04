/**
 * O nó para o agente: dado o caminho de uma nota, o tipo, o estado e a linha dele, o ramo (o que está
 * acima, abaixo e ao lado), os sinais com o próximo passo, os protocolos do nó na ordem dos pesos com o
 * porquê, e as situações do modelo do tipo (o P13) quando o modelo as declara.
 *
 * Por quê: a proposta do agente pessoal (02/11/2026, integração 4): o agente sugere "abra o 📅, porque a
 * SMART ficou sem ação" lendo uma lista pronta, sem interpretar a nota. O ramo é o da pinça
 * (`modelo.ramo`, nível 1), os protocolos são os da seção Protocolos do painel (`modelo.protocolosDoNo`,
 * `rankOptions` com o porquê), e os sinais são os da marca no nó: nada se recalcula aqui.
 *
 * Módulo puro: recebe o modelo da Missão e o que a borda leu (os campos da nota, as ligações, o lido dos
 * protocolos); sem Obsidian. Prova: tests/engine/noParaOAgente.test.ts.
 */
import { QUANDO_ESTADO } from './domainModel';
import { modeloDaNota } from '../missao/camposDoNo';
import type { ItemDoRamo, LeitorDoRamo, LidoDosProtocolos, MissaoModelo } from '../missao/tipos';

/** Quantos itens vêm por lado do ramo, quantos protocolos e quantas situações. */
export const TETOS_DO_NO = { porLado: 8, protocolos: 6, situacoes: 8, texto: 160 } as const;

export interface ItemDoNoParaOAgente {
    titulo: string;
    relacao: string;
    caminho?: string;
    rotulo?: string;
}

export interface NoParaOAgente {
    caminho: string;
    id: string;
    titulo: string;
    tipo: string;
    /** O domínio do modelo do tipo (`tarefa`, `smart`, `projeto`…), quando há. */
    dominio?: string;
    linha?: string;
    estado?: string;
    ramo: { acima: ItemDoNoParaOAgente[]; abaixo: ItemDoNoParaOAgente[]; lado: ItemDoNoParaOAgente[]; mais: number };
    sinais: Array<{ tipo: string; fato: string; proximo: string; protocolo?: string }>;
    protocolos: Array<{ id: string; porque: string; pode_abrir: boolean }>;
    /**
     * As situações do P13 que o nó vive agora: as do modelo do tipo cujo `quando` vale (um sinal do nó, ou
     * `estado:<estado>` do estado dele), com a parada do 🧭 e os protocolos que ela sobe; ausente quando
     * nenhuma vale (ou o modelo não as declara).
     */
    situacoes?: unknown[];
}

/** O que faz: o texto cortado no teto, com a reticência. */
function curto(texto: unknown, max: number = TETOS_DO_NO.texto): string {
    const t = String(texto ?? '').replace(/\s+/g, ' ').trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * O que faz: as situações do modelo em forma curta: cada uma com os campos de texto, número e sim/não
 * (o texto cortado), e as listas de texto; o resto (objetos fundos) fica fora. Até o teto.
 * Por quê: o conteúdo das situações é do P13 (`domainModel.ts`: a chave é reservada e a forma vem lá);
 * aqui só se encurta, sem supor nomes de campo.
 * Erro e ataque: lista ausente ou vazia dá `undefined` (a chave some); item que não é objeto vira texto.
 */
export function situacoesCurtas(raw: unknown): unknown[] | undefined {
    if (!Array.isArray(raw) || !raw.length) return undefined;
    return raw.slice(0, TETOS_DO_NO.situacoes).map(s => {
        if (!s || typeof s !== 'object' || Array.isArray(s)) return curto(s);
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
            if (typeof v === 'string') out[k] = curto(v);
            else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
            else if (Array.isArray(v) && v.every(x => typeof x === 'string')) out[k] = (v as string[]).slice(0, 8).map(x => curto(x, 80));
        }
        return out;
    });
}

/**
 * O que faz: o nó de uma nota para o agente (o que o painel do nó mostra, em lista curta).
 * Entra → sai: o modelo da versão, o caminho, o que a borda leu dos protocolos (ou `null`, sem a seção) e
 * o leitor do ramo (os campos e as ligações da nota) e os ids que a ponte abre (`protocolosDaPonte`) → o nó,
 * ou `null` quando a Missão não tem nó para a nota.
 * Erro e ataque: cada lado do ramo tem teto e conta o resto em `mais`; o item sem nó entra sem caminho; o
 * protocolo fora da lista do operador vem com `pode_abrir: false` (o agente não abre o que o gateway recusa);
 * sem a lista, nenhum abre.
 * Prova: tests/engine/noParaOAgente.test.ts.
 */
export function noParaOAgente(modelo: MissaoModelo, caminho: string, lido: LidoDosProtocolos | null, leitor: LeitorDoRamo = {}, ponte: ReadonlySet<string> = new Set()): NoParaOAgente | null {
    const ref = modelo.noDaNota(caminho);
    if (!ref) return null;
    const no = modelo.no(ref.id);
    const out: NoParaOAgente = {
        caminho, id: ref.id, titulo: ref.titulo, tipo: no?.tipo ?? 'nota',
        ramo: { acima: [], abaixo: [], lado: [], mais: 0 }, sinais: [], protocolos: [],
    };
    const dominio = modelo.dominioDoNo(ref.id, leitor);
    if (dominio) out.dominio = dominio;
    if (no?.linha) out.linha = no.linha;
    if (no?.estado) out.estado = no.estado;

    const nivel = modelo.ramo(ref.id, 1, leitor)?.niveis[0];
    const item = (r: ItemDoRamo): ItemDoNoParaOAgente => {
        const x: ItemDoNoParaOAgente = { titulo: curto(r.titulo, 120), relacao: r.relacao };
        const nota = r.id ? modelo.arquivos(r.id).nota : null;
        if (nota) x.caminho = nota;
        if (r.rotulo) x.rotulo = curto(r.rotulo, 60);
        return x;
    };
    for (const r of nivel?.itens ?? []) {
        const lado = out.ramo[r.sentido];
        if (lado.length < TETOS_DO_NO.porLado) lado.push(item(r));
        else out.ramo.mais++;
    }
    out.ramo.mais += nivel?.mais ?? 0;

    out.sinais = modelo.sinaisDoNo(ref.id).map(s => ({
        tipo: s.tipo, fato: curto(s.fato), proximo: s.proximoPasso.rotulo,
        ...(s.proximoPasso.protocolo ? { protocolo: s.proximoPasso.protocolo } : {}),
    }));

    if (lido) {
        const campos = (c: string) => leitor.camposDaNota?.(c) ?? null;
        out.protocolos = modelo.protocolosDoNo(ref.id, lido, campos).slice(0, TETOS_DO_NO.protocolos)
            .map(p => ({ id: p.id, porque: curto(p.porque), pode_abrir: ponte.has(p.id) }));
    }

    const nota = modelo.arquivos(ref.id).nota ?? caminho;
    const tipoDaNota = modeloDaNota(nota, leitor.camposDaNota?.(nota) ?? null, modelo.indice.tabelas?.tipos ?? []);
    // A situação que o nó vive (o P13): a mesma regra de `pelasSituacoes` (o sinal do nó, ou o estado dele).
    const estado = modelo.indice.projetos.get(ref.id)?.estado ?? modelo.indice.porId.get(ref.id)?.estado ?? null;
    const sinais = new Set(out.sinais.map(s => s.tipo));
    const declaradas = (tipoDaNota as { situacoes?: unknown } | null)?.situacoes;
    const vivem = (Array.isArray(declaradas) ? declaradas : []).filter((s: any) => typeof s?.quando === 'string' && (s.quando.startsWith(QUANDO_ESTADO)
        ? !!estado && estado.estado === s.quando.slice(QUANDO_ESTADO.length)
        : sinais.has(s.quando)));
    const situacoes = situacoesCurtas(vivem);
    if (situacoes) out.situacoes = situacoes;
    return out;
}
