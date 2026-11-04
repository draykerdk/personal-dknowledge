/**
 * Os protocolos de um nó, puro (a peça 2b, 30/10, o núcleo do P13 trazido para antes): os que são donos
 * dos campos do tipo, os que criam ou revisam o tipo, e os que já rodaram sobre a nota, cada um com o
 * contexto do nó já respondido e na ordem que o peso propõe, com o porquê.
 *
 * Por quê: o painel de um componente mostra também os botões dos protocolos ligados a ele (29/10/2026). O
 * que liga um protocolo a um tipo mora no modelo do tipo (os donos dos campos, o `criar` e o bloco
 * `protocolos`); o que rodou sobre a nota sai das linhas que o motor grava na Day (`usoDatas`, a mesma
 * regra do uso recente); a ordem é a dos routers (`rankOptions`, o modelo `protocolos` e a tabela única):
 * o peso propõe a ordem, com o porquê, e a escolha é de quem usa. Nada aqui tem nome de protocolo nem de tipo.
 *
 * Módulo puro: sem Obsidian e sem DOM. Prova: tests/missao/protocolosDoNo.test.ts.
 */
import { QUANDO_ESTADO, type DomainModel } from '../engine/domainModel';
import { comReputacao, CONTEXTO_DO_NO, rankOptions, usoDatas, type DayRead } from '../engine/protocolRank';
import { linkTarget } from '../project/projectCanvasModel';
import { diaMes } from './tempo';
import { PAPEIS_DO_PROTOCOLO as PAPEIS } from './frases';
import type { LidoDosProtocolos, NoDosProtocolos, PapelDoProtocolo, ProtocoloDoNo } from './tipos';

const ORDEM_DOS_PAPEIS: readonly PapelDoProtocolo[] = ['campos', 'cria', 'revisa', 'usa', 'rodou', 'sinal'];

const vazio = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

/** O que faz: o valor de um campo como resposta de um passo: o link pelo nome dele, a lista pelos itens. */
function comoResposta(v: unknown): string {
    if (vazio(v)) return '';
    const um = (x: unknown) => { const t = String(x ?? '').trim(); return /^\[\[/.test(t) ? linkTarget(t) : t; };
    return Array.isArray(v) ? v.map(um).filter(Boolean).join(', ') : um(v);
}

/**
 * O que faz: resolve as fichas de uma resposta declarada (`{{no.nome}}`, `{{no.caminho}}` e
 * `{{no.<campo>}}`, o formato do desenho do P13, §6.1); a ficha sem valor deixa a resposta vazia.
 */
export function resolverFichas(modelo: string, no: Pick<NoDosProtocolos, 'nome' | 'caminho' | 'campos'>): string {
    let faltou = false;
    const out = modelo.replace(/\{\{no\.([^}]+)\}\}/g, (_m, k: string) => {
        const v = k === 'nome' ? no.nome : k === 'caminho' ? no.caminho : comoResposta(no.campos[k]);
        if (!v) faltou = true;
        return v;
    });
    return faltou ? '' : out;
}

/**
 * O que faz: os protocolos que a situação do nó sobe (o P13, aprovado em 02/11): para cada situação do modelo do
 * tipo cujo `quando` vale agora (um sinal do nó, ou `estado:<estado>` do estado dele), os ids do recorte que são
 * destino da parada do 🧭, cada um com os fatos que o levam ("prazo em 24/10", o rótulo do estado).
 * Por quê: o estado do nó aponta para uma parada que o 🧭 já tem; o nó nunca oferece o que a parada não oferece
 * (o id fora dela não entra), e o peso a mais vai pela mesma tabela (`contexto_do_no`).
 * Entra → sai: o modelo do tipo (ou `null`), os sinais do nó, o estado dele e os destinos das paradas → id → fatos.
 * Erro e ataque: sem os destinos (o lugar não leu os routers), nada sobe; a parada que não existe, nada; o mesmo
 * fato por duas situações conta uma vez.
 * Prova: tests/missao/protocolosDoNo.test.ts ("as situações do nó").
 */
export function pelasSituacoes(
    modelo: Pick<DomainModel, 'situacoes'> | null,
    sinais: ReadonlyArray<{ tipo: string; fato: string }>,
    estado: { estado: string; rotulo: string } | null,
    destinos: Readonly<Record<string, readonly string[]>> | undefined,
): Map<string, string[]> {
    const out = new Map<string, string[]>();
    if (!destinos) return out;
    for (const s of modelo?.situacoes ?? []) {
        const fatos = s.quando.startsWith(QUANDO_ESTADO)
            ? (estado && estado.estado === s.quando.slice(QUANDO_ESTADO.length) ? [estado.rotulo] : [])
            : sinais.filter(x => x.tipo === s.quando).map(x => x.fato);
        if (!fatos.length) continue;
        const da = destinos[s.situacao] ?? [];
        for (const id of s.protocolos) {
            if (!da.includes(id)) continue;
            const ja = out.get(id) ?? [];
            out.set(id, [...ja, ...fatos.filter(f => !ja.includes(f))]);
        }
    }
    return out;
}

/**
 * O que faz: os protocolos do tipo e da nota, antes da ordem: os donos dos campos (`dono:
 * protocolo:<id>#<passo>`, a resposta é o valor do campo), o do `criar` (o protocolo e o completo, as
 * respostas pelos `passos`), os do bloco `protocolos` (o papel e o `preencher`) e os que já rodaram, cada um
 * uma vez, com os papéis somados e as datas da rodada na frente.
 * Entra → sai: o modelo do tipo (ou `null`), o nó e as rodadas → os candidatos, na ordem dos papéis.
 * Erro e ataque: a resposta sem valor não vai (o protocolo pergunta); a ficha sem valor também não.
 */
export function candidatosDoNo(modelo: DomainModel | null, no: NoDosProtocolos, rodaram: Readonly<Record<string, readonly string[]>> = {}, daSituacao: ReadonlySet<string> = new Set()): Array<{ id: string; papeis: PapelDoProtocolo[]; valores: Record<string, string> }> {
    const porId = new Map<string, { id: string; papeis: PapelDoProtocolo[]; valores: Record<string, string> }>();
    const de = (id: string) => { let c = porId.get(id); if (!c) { c = { id, papeis: [], valores: { ...no.datas } }; porId.set(id, c); } return c; };
    const papel = (id: string, p: PapelDoProtocolo) => { const c = de(id); if (!c.papeis.includes(p)) c.papeis.push(p); return c; };
    const responder = (c: { valores: Record<string, string> }, passo: string, valor: string) => { if (valor && !(passo in c.valores)) c.valores[passo] = valor; };
    for (const campo of modelo?.campos ?? []) {
        const m = campo.dono.match(/^protocolo:([^#]+)(?:#(.+))?$/);
        if (!m) continue;
        const valor = comoResposta(no.campos[campo.nome]);
        if (!valor && !campo.obrigatorio && !campo.vazio && modelo?.criar?.protocolo !== m[1]) continue;
        const c = papel(m[1], 'campos');
        if (m[2]) responder(c, m[2], valor);
    }
    const criar = modelo?.criar;
    for (const id of [criar?.protocolo, criar?.completo].filter((x): x is string => !!x)) {
        const c = papel(id, 'cria');
        if (id === criar?.protocolo) for (const [campo, passo] of Object.entries(criar?.passos ?? {})) responder(c, passo, comoResposta(no.campos[campo]));
    }
    for (const p of modelo?.protocolos ?? []) {
        const c = papel(p.id, p.papel);
        for (const [passo, ficha] of Object.entries(p.preencher ?? {})) responder(c, passo, resolverFichas(ficha, no));
    }
    for (const [id, dias] of Object.entries(rodaram)) if (dias.length) papel(id, 'rodou');
    // A situação do nó (o P13): o que já estava ganha só o peso; o que não estava entra "pelo sinal".
    for (const id of daSituacao) if (!porId.has(id)) papel(id, 'sinal');
    const peso = (c: { papeis: PapelDoProtocolo[] }) => Math.min(...c.papeis.map(p => ORDEM_DOS_PAPEIS.indexOf(p)));
    const lista = [...porId.values()];
    for (const c of lista) c.papeis.sort((a, b) => ORDEM_DOS_PAPEIS.indexOf(a) - ORDEM_DOS_PAPEIS.indexOf(b));
    return lista.map((c, i) => ({ c, i })).sort((a, b) => peso(a.c) - peso(b.c) || a.i - b.i).map(x => x.c);
}

/**
 * O que faz: a seção "Protocolos" de um nó: os candidatos (`candidatosDoNo`) na ordem dos pesos
 * (`rankOptions`, o mesmo dos routers, com os campos de cada protocolo), cada um com a linha do porquê
 * (os papéis, o porquê do peso com o nível da reputação citado e os dias em que rodou nesta nota) e as
 * respostas do nó.
 * Por quê: "na ordem que o peso propõe, com o porquê"; sem o modelo da escolha, a ordem dos papéis.
 * Entra → sai: o modelo do tipo, o nó e o que a borda leu → os protocolos.
 * Prova: tests/missao/protocolosDoNo.test.ts.
 */
export function protocolosDoNo(modelo: DomainModel | null, no: NoDosProtocolos, lido: LidoDosProtocolos): ProtocoloDoNo[] {
    const situacao = pelasSituacoes(modelo, no.sinais ?? [], no.estado ?? null, lido.destinos);
    const cands = candidatosDoNo(modelo, no, lido.rodaram, new Set(situacao.keys()));
    if (!cands.length) return [];
    const ids = cands.map(c => c.id);
    const nivel = (id: string) => lido.niveis?.[id] ?? null;
    const grau = (id: string) => lido.graus?.[id] ?? null;
    // O peso da situação vai nos campos de cada protocolo (a categoria `contexto_do_no`), na mesma tabela e na mesma ordem.
    const campos = (id: string) => (situacao.has(id) ? { ...(lido.campos[id] ?? {}), [CONTEXTO_DO_NO]: situacao.get(id)! } : lido.campos[id] ?? {});
    // Sem o modelo da escolha, a situação vem primeiro, e o resto na ordem dos papéis.
    const semEscolha = [...ids.filter(id => situacao.has(id)), ...ids.filter(id => !situacao.has(id))];
    const ranked = lido.escolha
        ? rankOptions(ids, Object.fromEntries(ids.map(id => [id, id])), campos, lido.escolha.modelo, lido.escolha.tabela, nivel, grau)
        : { options: semEscolha, notes: Object.fromEntries(ids.map(id => [id, comReputacao(situacao.has(id) ? `porque ${situacao.get(id)!.join(', ')}` : '', nivel(id))]).filter(([, l]) => l)) as Record<string, string> };
    return ranked.options.map(id => {
        const c = cands.find(x => x.id === id)!;
        const dias = [...(lido.rodaram[id] ?? [])].sort().reverse();
        const partes = [c.papeis.map(p => PAPEIS[p]).join(', '), ranked.notes[id] ?? '', dias.length ? `nesta nota em ${dias.slice(0, 3).map(diaMes).join(', ')}` : ''];
        return { id, papeis: c.papeis, porque: partes.filter(Boolean).join(' · '), valores: c.valores };
    });
}

/**
 * O que faz: os dias em que cada protocolo rodou sobre uma nota: as linhas das Days que ligam a nota
 * (`[[Nome]]`, com ou sem o rótulo), lidas pela regra do uso recente (`usoDatas`), protocolo por protocolo.
 * Por quê: o painel mostra os protocolos que já rodaram sobre a nota (29/10/2026), pelas linhas que o motor grava; a
 * regra de "rodou" é uma só, a do peso.
 * Entra → sai: as Days, o nome da nota e as definições (id e JSON) → id → os dias (sem os que não rodaram).
 * Erro e ataque: a linha que só cita a nota sem ser do motor não conta (a regra é a do `usoDatas`); o
 * nome com caracteres de regex vale como texto.
 */
export function rodadasNaNota(dias: readonly DayRead[], nome: string, defs: ReadonlyArray<{ id: string; def: unknown }>, resolver: (id: string) => unknown = () => null): Record<string, string[]> {
    const alvo = String(nome ?? '').trim().toLowerCase();
    if (!alvo) return {};
    const ligam = (linha: string) => [...linha.matchAll(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g)].some(m => m[1].trim().split('/').pop()!.toLowerCase() === alvo);
    const soAsDaNota = dias
        .map(d => ({ ...d, text: String(d.text ?? '').split('\n').filter(ligam).join('\n') }))
        .filter(d => d.text);
    if (!soAsDaNota.length) return {};
    const out: Record<string, string[]> = {};
    for (const { id, def } of defs) {
        // Só as linhas do motor ("Protocolo … executado"); o campo próprio do `append` não diz sobre qual nota.
        const datas = [...new Set(usoDatas({ ...(def as object), logMode: 'link' }, soAsDaNota.map(d => ({ ...d, campos: {} })), resolver as (id: string) => any))];
        if (datas.length) out[id] = datas;
    }
    return out;
}
