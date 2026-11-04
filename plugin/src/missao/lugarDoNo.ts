/**
 * O lugar em camadas: o país, a cidade e a passagem de um nó, e o que cada camada tem (as cidades
 * de um país, as passagens de uma cidade), em qualquer ramo.
 *
 * Por quê: o diagnóstico do painel do nó (29/10, C4 e G6) e a proposta aprovada (o lugar em
 * camadas): a passagem e a cidade ficam separadas, com botões de atalho entre elas, e o painel da
 * cidade tem ao menos o botão do seu país (29/10/2026). Os três
 * painéis continuam separados; os atalhos e a trilha do lugar (`País › Cidade › passagem de 28/10`)
 * leem daqui, e nenhum painel monta a sua lista à mão. O vínculo cidade → país vem do modelo do tipo
 * (o campo de link da cidade cujo alvo é o país), e não da coleção de um ramo: por isso o país
 * sem nota também tem nó no ramo Missão.
 *
 * Nada aqui tem nome de tipo nem de campo: as regras (`regrasDoLugar`) saem dos modelos.
 *
 * Módulo puro: sem Obsidian e sem DOM. Prova: tests/missao/lugarDoNo.test.ts.
 */
import type { DomainModel } from '../engine/domainModel';
import { fold, linkTarget } from '../project/projectCanvasModel';
import type { NotaDeLugar } from './entrada';
import { semEmojiInicial } from './formatos';
import type { CamadasDoLugar, CidadeDoLugar, Passagem, LugarDoNo, PaisDoLugar, PassoDoLugar, RegrasDoLugar } from './tipos';

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const chave = (s: unknown) => fold(semEmojiInicial(s));
const primeiroTexto = (m: DomainModel | undefined) => m?.campos.find(c => c.tipo === 'texto' && c.obrigatorio)?.nome ?? null;

/**
 * O que faz: as regras do lugar pelos modelos: o modelo da cidade é o das notas de cidade lidas (o
 * `type` delas); o país é o alvo do campo de link da cidade cujo alvo tem modelo.
 * Por quê: §3.8 e G6: o vínculo cidade → país vem do modelo do tipo (`alvo`), em qualquer ramo.
 * Entra → sai: os modelos e as notas de cidade → `RegrasDoLugar` (os nulos dizem o que falta).
 * Erro e ataque: sem nota de cidade, ou sem campo de link com alvo que tenha modelo, as regras ficam
 * nulas e o país não tem nó (nunca um campo adivinhado).
 */
export function regrasDoLugar(modelos: readonly DomainModel[], cidades: readonly NotaDeLugar[]): RegrasDoLugar {
    const types = new Set(cidades.map(c => texto(c.campos?.type)).filter(Boolean));
    const cidade = modelos.find(m => types.has(m.candidatos.type));
    const link = cidade?.campos.find(c => c.tipo === 'link' && (c.alvo ?? []).some(a => modelos.some(m => m.dominio === a && m.dominio !== cidade.dominio)));
    const pais = link ? modelos.find(m => (link.alvo ?? []).includes(m.dominio)) : undefined;
    return {
        dominioDaCidade: cidade?.dominio ?? null, dominioDoPais: pais?.dominio ?? null, typeDoPais: pais?.candidatos.type ?? null,
        campoDoPais: link?.nome ?? null, nomeDaCidade: primeiroTexto(cidade), nomeDoPais: primeiroTexto(pais),
    };
}

/** O que faz: o id do nó de um país sem nota (`c:<domínio>:<nome dobrado>`); sem domínio, nenhum. */
export const idDoPaisSemNota = (regras: RegrasDoLugar, nome: string) => (regras.dominioDoPais ? `c:${regras.dominioDoPais}:${fold(nome)}` : null);

/**
 * O que faz: as camadas do lugar de uma versão do cofre: os países (os que têm nota e os que uma
 * cidade aponta sem nota), as cidades (as que têm nota e as das passagens sem nota) e as passagens.
 * Entra → sai: as passagens, as notas de cidade e de país e as regras → `CamadasDoLugar`.
 * Erro e ataque: o mesmo nome com grafias de caixa diferentes é um só (dobrado); o país que só a
 * passagem diz entra também; nada é inventado: sem nome, não há país.
 * Prova: tests/missao/lugarDoNo.test.ts ("as camadas").
 */
export function camadasDoLugar(passagens: readonly Passagem[], cidades: readonly NotaDeLugar[], paises: readonly NotaDeLugar[], regras: RegrasDoLugar): CamadasDoLugar {
    const ps: PaisDoLugar[] = [];
    const addPais = (nome: string, nota: string | null) => {
        if (!nome) return;
        const ja = ps.find(p => chave(p.nome) === chave(nome));
        if (ja) { if (nota && !ja.nota) { ja.nota = nota; ja.id = `n:${nota}`; } return; }
        ps.push({ id: nota ? `n:${nota}` : idDoPaisSemNota(regras, nome), nome, nota });
    };
    for (const p of paises) addPais((regras.nomeDoPais ? texto(p.campos?.[regras.nomeDoPais]) : '') || p.nome, p.caminho);
    const cs: CidadeDoLugar[] = [];
    for (const c of cidades) {
        const nome = (regras.nomeDaCidade ? texto(c.campos?.[regras.nomeDaCidade]) : '') || c.nome;
        const pais = regras.campoDoPais ? linkTarget(Array.isArray(c.campos?.[regras.campoDoPais]) ? (c.campos[regras.campoDoPais] as unknown[])[0] : c.campos?.[regras.campoDoPais]) || null : null;
        if (!cs.some(x => chave(x.nome) === chave(nome))) cs.push({ id: `n:${c.caminho}`, nome, nota: c.caminho, pais });
    }
    for (const e of passagens) {
        if (!cs.some(x => chave(x.nome) === chave(e.cidade) || (e.nota && x.nota === e.nota))) cs.push({ id: e.nota ? `n:${e.nota}` : null, nome: e.cidade, nota: e.nota, pais: e.pais });
    }
    for (const c of cs) if (c.pais) addPais(c.pais, null);
    for (const e of passagens) if (e.pais) addPais(e.pais, null);
    return { regras, paises: ps, cidades: cs, passagens };
}

const daCidade = (c: CamadasDoLugar, cidade: CidadeDoLugar) => c.passagens.filter(e => (cidade.nota && e.nota === cidade.nota) || chave(e.cidade) === chave(cidade.nome));
const paisDe = (c: CamadasDoLugar, nome: string | null) => (nome ? c.paises.find(p => chave(p.nome) === chave(nome)) ?? null : null);

/**
 * O que faz: o lugar de um nó pelo id: a passagem (`l:`), a cidade (a nota dela, `n:`) ou o país (a
 * nota, `n:`, ou o nome sem nota, `c:<qualquer>:<nome>`, o do ramo Missão e o da coleção de um ramo).
 * Por quê: G6: os atalhos e a trilha leem daqui, e o mesmo país tem o mesmo painel em todo ramo.
 * Entra → sai: as camadas e o id → `LugarDoNo`, ou `null` (o id não é de lugar).
 * Erro e ataque: a volta a uma cidade já visitada dá as duas passagens dela; a cidade sem país dá o
 * país `null` (o painel diz em palavras); o `c:` de um nome que nenhum lugar tem dá `null`.
 * Prova: tests/missao/lugarDoNo.test.ts ("o lugar de um nó").
 */
export function lugarDoNo(c: CamadasDoLugar, id: string): LugarDoNo | null {
    const k = String(id ?? '');
    if (k.startsWith('l:')) {
        const e = c.passagens.find(x => x.id === k);
        if (!e) return null;
        const cidade = c.cidades.find(x => (e.nota && x.nota === e.nota) || chave(x.nome) === chave(e.cidade)) ?? null;
        const pais = paisDe(c, e.pais ?? cidade?.pais ?? null);
        return { pais, cidade, passagem: e, cidades: [], passagens: cidade ? daCidade(c, cidade) : [e], dominio: null };
    }
    const caminho = k.startsWith('n:') ? k.slice(2) : null;
    const cidade = caminho ? c.cidades.find(x => x.nota === caminho) : undefined;
    if (cidade) return { pais: paisDe(c, cidade.pais), cidade, passagem: null, cidades: [], passagens: daCidade(c, cidade), dominio: c.regras.dominioDaCidade };
    const nomeSemNota = k.startsWith('c:') ? chave(k.split(':').slice(2).join(':')) : null;
    const pais = caminho ? c.paises.find(p => p.nota === caminho) : nomeSemNota ? c.paises.find(p => chave(p.nome) === nomeSemNota && !p.nota) ?? c.paises.find(p => chave(p.nome) === nomeSemNota) : undefined;
    if (!pais) return null;
    const cidades = c.cidades.filter(x => x.pais && chave(x.pais) === chave(pais.nome));
    const passagens = c.passagens.filter(e => (e.pais && chave(e.pais) === chave(pais.nome)) || cidades.some(x => (x.nota && e.nota === x.nota) || chave(x.nome) === chave(e.cidade)));
    return { pais, cidade: null, passagem: null, cidades, passagens, dominio: c.regras.dominioDoPais };
}

/**
 * O que faz: o nó de um nome de lugar (o país ou a cidade), em qualquer ramo: o alvo de um link
 * escrito ("Vietnam" no campo da cidade) que nenhuma coleção do ramo tem.
 * Entra → sai: as camadas e o nome → `{ id, titulo }`, ou `null` (nenhum lugar com esse nome, ou sem id).
 */
export function noDoLugarPeloNome(c: CamadasDoLugar, nome: string): { id: string; titulo: string } | null {
    const k = chave(linkTarget(nome) || nome);
    if (!k) return null;
    const pais = c.paises.find(p => chave(p.nome) === k);
    if (pais?.id) return { id: pais.id, titulo: pais.nome };
    const cidade = c.cidades.find(x => chave(x.nome) === k);
    return cidade?.id ? { id: cidade.id, titulo: cidade.nome } : null;
}

/**
 * O que faz: a trilha do lugar de um nó, de cima para baixo: o país, a cidade e a passagem
 * (`País › Cidade › passagem de 28/10`); no painel da cidade, `País › Cidade`; no do país, só ele.
 * Por quê: G6, item 5: a trilha mostra onde o nó mora, mesmo quando se chega direto pela linha do tempo.
 * Entra → sai: o lugar e o texto da passagem → os passos (a camada que falta não entra).
 */
export function trilhaDoLugar(l: LugarDoNo, rotuloDaPassagem: (e: Passagem) => string): PassoDoLugar[] {
    const out: PassoDoLugar[] = [];
    if (l.pais) out.push({ id: l.pais.id, titulo: l.pais.nome });
    if (l.cidade) out.push({ id: l.cidade.id, titulo: l.cidade.nome });
    if (l.passagem) out.push({ id: l.passagem.id, titulo: rotuloDaPassagem(l.passagem) });
    return out;
}
