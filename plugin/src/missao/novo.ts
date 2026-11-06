/**
 * O Novo da Missão, puro: os tipos do seletor, os campos de cada tipo, de onde vem cada valor
 * (com o porquê), a validação, o frontmatter inicial com a herança e as respostas do protocolo.
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, §4.2–4.4, §5.2, §5.6 e §8.3) e o P8:
 * - o seletor de tipo é o do protótipo (Tarefa · SMART · Projeto · Cidade · País, template,
 *   1963), declarado no ramo (`novo.tipos`, §3.8); os campos, os rótulos, a ordem, o
 *   obrigatório e as sugestões vêm do modelo de cada tipo (`campos`, com `criar`, e o bloco
 *   `criar`), nunca de uma lista daqui;
 * - a tarefa nasce pelo formulário curto, pela API do TaskNotes; os outros nascem pelo
 *   protocolo dono, com os campos do formulário como respostas (o motor pula o que veio
 *   respondido e pergunta o resto, §5.2), e as datas da rodada sempre explícitas (§5.3, 6);
 * - a herança na criação dentro de uma SMART é o patch da mãe, a mesma regra da seta e do
 *   "Ligar a uma SMART…" (`edgeLinks.patchFor` com `motherLink`): só enche o que veio vazio.
 *
 * Nenhum nome de tipo nem de campo mora aqui: o que é a SMART, o projeto, a área ou o lugar
 * de um nó vem do modelo da Missão (o índice), e o resto do modelo do tipo.
 *
 * Módulo puro: sem Obsidian e sem DOM. Prova: tests/missao/novo.test.ts.
 */
import type { CreateDateVariable, DomainField, DomainHome, DomainModel } from '../engine/domainModel';
import { valorDoCampo, type RegrasDoValor } from '../engine/fieldModel';
import { motherLink, patchFor, type LinkTask } from '../canvas/edgeLinks';
import { fold } from '../project/projectCanvasModel';
import type { MissaoModelo, Candidato, OrigemDoNovo } from './tipos';
import { dataDoPeriodo, type RamoPrincipal, type NovoDoNo } from './ramoPrincipal';
import { sugestaoDoCampo, type ContextoDaSugestao, type Sugestao } from './sugestoes';
import { diaDaSemana, diaMes, isChaveEspecial, periodoDoId, semanaCurta, type Escala } from './tempo';
import { respostaVazia, rodadaCompleta, rodadaDoFormulario } from '../engine/protocolForm';

/** A chave do nome da nota nova, quando o tipo não tem campo para ele (o `criar.nome`): nunca um campo do frontmatter. */
export const NOME_DA_NOTA = '_nome';

/** Um campo do Novo: o do modelo e para onde vai: o frontmatter (tarefa), um passo do protocolo ou uma data da rodada. */
export interface CampoDoNovo {
    campo: DomainField;
    passo: string | null;
    data: CreateDateVariable | null;
}

/** Um tipo do seletor, pronto: o do modelo, o rótulo do ramo e os campos do formulário. */
export interface TipoDoNovo {
    dominio: string;
    rotulo: string;
    titulo: string;
    via: 'tasknotes' | 'protocolo' | 'nota';
    protocolo: string | null;
    completo: string | null;
    /**
     * Só na via `nota` (a estadia, 30/10): o campo cujo valor dá o nome do arquivo (sem o `titulo` do modelo, o
     * "Nome" do formulário, `NOME_DA_NOTA`); e a pasta do modelo, onde ela nasce.
     */
    campoDoNome: string | null;
    pasta: string | null;
    /** Só na via `nota` (a nota de função, 02/11): a casa no módulo que o campo aponta (`criar.casa`); `null` = a pasta. */
    casa: DomainHome | null;
    /** Só na via `nota`: o molde da nota nova (`criar.molde`), com as fichas do protocolo; `null` = só o frontmatter. */
    molde: string | null;
    /** O `type` das notas do tipo (as regras do valor: a SMART não tem `scheduled`). */
    type: string | null;
    campos: CampoDoNovo[];
}

const vazio = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

/**
 * O que faz: os campos do formulário de um tipo, na ordem do modelo.
 * Por quê: §4.3, "a tarefa nasce pelo formulário curto; os outros nascem pelo protocolo dono,
 * com os campos do formulário como respostas"; o bloco `criar` diz qual passo recebe cada
 * campo. Pela via do TaskNotes, os campos com dono na nota; pela do protocolo, só os que um
 * passo recebe (ou que vão como a data da rodada), mais o nome da nota quando o tipo não tem
 * campo para ele. O derivado, o `criar: false` e o planejado (o escritor ainda não chegou) ficam fora.
 * Entra → sai: o modelo do tipo → os campos (vazio sem `criar`).
 */
export function camposDoNovo(modelo: DomainModel): CampoDoNovo[] {
    const criar = modelo.criar;
    if (!criar) return [];
    const aparece = (c: DomainField) => c.criar !== false && c.dono !== 'derivado' && !c.planejado;
    // A tarefa (pelo TaskNotes) e a nota simples (30/10): os campos com dono na nota vão no frontmatter.
    const daNota = modelo.campos.filter(c => aparece(c) && c.dono === 'nota').map(campo => ({ campo, passo: null, data: null }));
    if (criar.via === 'tasknotes') return daNota;
    // A nota simples sem `titulo` (a nota de função, 02/11): o "Nome" do formulário dá o nome do arquivo e não vai ao frontmatter.
    if (criar.via === 'nota') return criar.titulo ? daNota : [{ campo: { nome: NOME_DA_NOTA, rotulo: 'Nome', tipo: 'texto', formato: 'curto', obrigatorio: true, dono: 'nota' }, passo: null, data: null }, ...daNota];
    const out: CampoDoNovo[] = [];
    if (criar.nome) {
        out.push({ campo: { nome: NOME_DA_NOTA, rotulo: 'Nome', tipo: 'texto', formato: 'curto', obrigatorio: true, dono: `protocolo:${criar.protocolo}#${criar.nome}` }, passo: criar.nome, data: null });
    }
    for (const campo of modelo.campos) {
        if (!aparece(campo)) continue;
        const passo = criar.passos?.[campo.nome] ?? null;
        const data = criar.datas?.[campo.nome] ?? null;
        if (passo || data) out.push({ campo, passo, data });
    }
    return out;
}

/**
 * O que faz: os tipos do seletor do Novo: os do ramo, na ordem dele, cada um com o modelo
 * dele; o tipo sem modelo, ou cujo modelo não diz como nasce, sai.
 * Entra → sai: o ramo e os modelos dos tipos → os tipos.
 */
export function tiposDoNovo(ramoPrincipal: Pick<RamoPrincipal, 'novo'>, modelos: readonly DomainModel[]): TipoDoNovo[] {
    const out: TipoDoNovo[] = [];
    for (const t of ramoPrincipal.novo?.tipos ?? []) {
        const m = modelos.find(x => x.dominio === t.tipo);
        if (!m?.criar) continue;
        const campos = camposDoNovo(m);
        if (!campos.length) continue;
        out.push({
            dominio: m.dominio, rotulo: t.rotulo, titulo: t.titulo, via: m.criar.via,
            protocolo: m.criar.protocolo ?? null, completo: m.criar.completo ?? null, type: m.candidatos.type ?? null, campos,
            campoDoNome: m.criar.via === 'nota' ? m.criar.titulo ?? NOME_DA_NOTA : null, pasta: m.criar.via === 'nota' ? m.candidatos.pasta : null,
            casa: m.criar.via === 'nota' ? m.criar.casa ?? null : null, molde: m.criar.via === 'nota' ? m.criar.molde ?? null : null,
        });
    }
    return out;
}

/** As espécies de nó pelo prefixo do id (as mesmas do painel do nó). */
const ESPECIE_DO_PREFIXO: Record<string, string> = {
    't:': 'acao', 's:': 'smart', 'p:': 'projeto', 'a:': 'area', 'd:': 'dia', 'w:': 'semana', 'q:': 'trimestre', 'y:': 'ano', 'v:': 'visao', 'l:': 'lugar',
};

/** O que faz: a espécie de um nó pelo id (`s:…` = SMART, `d:…` = dia…); desconhecido → `null`. */
export function especieDoNo(id: string | null | undefined): string | null {
    return ESPECIE_DO_PREFIXO[String(id ?? '').slice(0, 2)] ?? null;
}

/** O nó como pai de um filho (29/10): o domínio do modelo dele e o nome que o link do filho grava. */
/**
 * O pai do Novo: o domínio, o nome e os modelos; `aprendizado` (05/11) diz que o módulo já tem notas de aprendizado,
 * e só então ele oferece os tipos do aprendizado (o "+ Cartão" não aparece em todo projeto e departamento).
 */
export interface PaiDoNovo { dominio: string | null; nome: string | null; modelos: readonly DomainModel[]; aprendizado?: boolean }

/**
 * O que faz: os filhos de um tipo pelos modelos: cada tipo com um campo de link `ramo: "acima"`
 * cujo alvo é o domínio do pai (a cidade pelo `pais`, a subtarefa pelo `projects` da tarefa).
 * Entra → sai: os modelos e o domínio → `{ tipo, campo }`, na ordem dos modelos e dos campos.
 */
export function filhosDoTipo(modelos: readonly DomainModel[], dominio: string): Array<{ tipo: string; campo: string }> {
    const out: Array<{ tipo: string; campo: string }> = [];
    for (const m of modelos) for (const c of m.campos ?? []) {
        if (c.tipo === 'link' && c.ramo === 'acima' && (c.alvo ?? []).includes(dominio) && !out.some(x => x.tipo === m.dominio)) out.push({ tipo: m.dominio, campo: c.nome });
    }
    return out;
}

/**
 * O que faz: o que se cria a partir de um nó, num lugar só (29/10): o que o ramo declara para a
 * espécie dele e, pelos modelos, cada filho do tipo do nó ("+ <Tipo>", com o link de volta já
 * respondido no campo do filho); só dos tipos que o seletor tem. O filho do mesmo tipo é o "Sub"
 * dele ("+ Subtarefa"); o tipo que o ramo já declara fica com o botão do ramo.
 * Por quê: o painel da cidade oferece adicionar uma passagem (29/10/2026), e cada painel oferece o que
 * fica abaixo do seu componente; os botões de cada painel saem daqui, e não de uma lista por painel.
 * Entra → sai: o ramo, os tipos prontos, o id e o pai (o domínio, o nome e os modelos; sem ele,
 * só o ramo) → os botões ("Nova ação" numa SMART, "+ Cidade" num país).
 * Erro e ataque: o filho sem Novo no ramo (a passagem, que nasce das Days) não tem botão; o nó sem
 * domínio ou sem nome não tem filho pelos modelos; a prateleira não cria nada.
 */
export function novosDoNo(ramoPrincipal: Pick<RamoPrincipal, 'novo'>, tipos: readonly TipoDoNovo[], id: string, pai?: PaiDoNovo): NovoDoNo[] {
    if (isChaveEspecial(periodoDoId(id)?.chave ?? '')) return [];
    const especie = especieDoNo(id);
    const doRamoPrincipal = (especie ? ramoPrincipal.novo?.no?.[especie] ?? [] : []).filter(n => tipos.some(t => t.dominio === n.tipo));
    if (!pai?.dominio || !pai.nome) return doRamoPrincipal;
    const out = [...doRamoPrincipal];
    // Os tipos do aprendizado (o que declara o `aprendizado` e o das peças dele) só no módulo que já é de aprendizado.
    const doAprendizado = new Set(pai.modelos.filter(m => m.aprendizado).flatMap(m => [m.candidatos.type, m.aprendizado!.pecas]).filter(Boolean));
    for (const f of filhosDoTipo(pai.modelos, pai.dominio)) {
        const tipoDaNota = pai.modelos.find(m => m.dominio === f.tipo)?.candidatos.type;
        if (!pai.aprendizado && tipoDaNota && doAprendizado.has(tipoDaNota)) continue;
        const t = tipos.find(x => x.dominio === f.tipo);
        if (!t || out.some(n => n.tipo === f.tipo) || !t.campos.some(c => c.campo.nome === f.campo)) continue;
        out.push({ tipo: f.tipo, rotulo: f.tipo === pai.dominio ? `Sub${t.rotulo.toLowerCase()}` : t.rotulo, campo: f.campo, valor: pai.nome });
    }
    return out;
}

/**
 * O que faz: o nome que o link de um filho grava para apontar o nó: o nome da nota dele, ou, sem
 * nota, o nome do lugar (o país sem nota) ou do projeto.
 * Entra → sai: o modelo e o id → o nome, ou `null`.
 */
export function nomeParaOLink(modelo: Pick<MissaoModelo, 'arquivos' | 'lugarDoNo' | 'indice'>, id: string): string | null {
    const nota = modelo.arquivos(id).nota;
    if (nota) return nomeDoCaminho(nota);
    const l = modelo.lugarDoNo(id);
    if (l && !l.passagem) return l.cidade?.nome ?? l.pais?.nome ?? null;
    return modelo.indice.projetos.get(id)?.nome ?? modelo.indice.areas.get(id)?.nome ?? null;
}

const nomeDoCaminho = (caminho: string) => caminho.slice(caminho.lastIndexOf('/') + 1).replace(/\.md$/, '');

/**
 * O que faz: a origem do Novo: aberto num período, a linha é ele; numa TaskNote (a SMART), a
 * linha fica de fora, e o tempo vem da herança (a ação nasce na semana da SMART, como no ⚡);
 * em outro nó (projeto, área, lugar) ou no "+ Novo", a linha em foco.
 * Entra → sai: o modelo, o nó (ou nada) e a linha em foco → a origem.
 */
export function origemDoNovo(modelo: Pick<MissaoModelo, 'indice'>, no: string | null, foco: { escala: Escala; chave: string }): OrigemDoNovo {
    const periodo = no ? periodoDoId(no) : null;
    if (periodo) return { linha: periodo, no };
    if (no && modelo.indice.porId.has(no)) return { linha: null, no };
    return { linha: isChaveEspecial(foco.chave) ? null : foco, no };
}

/** O que faz: a origem em palavras, para o formulário ("Aberto em qui 29/10 · SMART X"). */
export function origemEmPalavras(modelo: Pick<MissaoModelo, 'indice' | 'passagens'>, origem: OrigemDoNovo): string {
    const partes: string[] = [];
    const l = origem.linha;
    if (l) partes.push(l.escala === 'dia' ? `${diaDaSemana(l.chave)} ${diaMes(l.chave)}` : l.escala === 'semana' ? semanaCurta(l.chave) : l.chave);
    const id = origem.no;
    if (id && !periodoDoId(id)) {
        const t = modelo.indice.porId.get(id);
        const p = modelo.indice.projetos.get(id);
        const a = modelo.indice.areas.get(id);
        const e = modelo.passagens.find(x => x.id === id);
        const nome = t?.titulo ?? p?.nome ?? a?.nome ?? e?.cidade;
        if (nome) partes.push(nome);
    }
    return partes.length ? `Aberto em ${partes.join(' · ')}` : '';
}

export interface ExtrasDoContexto {
    /** O "Onde estou" da Missão. */
    onde: string | null;
    /** Os contextos do vocabulário. */
    contextos: readonly string[];
    /** O frontmatter de uma nota, lido (a herança da SMART). */
    camposDaNota: (caminho: string) => Record<string, unknown> | null;
    /** As checagens de uma nota de função, lidas pela borda (a fonte `checklist`, 30/10); sem ela, a fonte não tem valor. */
    checklist?: ContextoDaSugestao['checklist'];
}

/**
 * O que faz: o contexto das sugestões a partir da origem: os nós que o nó de onde abriu dá
 * (a SMART dá a herança e o projeto; o projeto dá a central e a área; o lugar dá a cidade e o
 * país), o fio do projeto, o lugar do dia da linha e a última passagem.
 * Entra → sai: o modelo, a origem e os extras da borda → o contexto (a entrada não muda).
 * Erro e ataque: nó que o modelo não conhece não dá nada; SMART sem nota lida herda nada.
 */
export function contextoDoNovo(modelo: MissaoModelo, origem: OrigemDoNovo, extras: ExtrasDoContexto): ContextoDaSugestao {
    const { indice } = modelo;
    const ctx: ContextoDaSugestao = {
        hoje: modelo.hoje, linha: origem.linha, no: {}, fio: {}, onde: extras.onde, lugarDoDia: null,
        ultimoLugar: null, heranca: null, contextos: extras.contextos, nota: null,
        ...(extras.checklist ? { checklist: extras.checklist } : {}),
    };
    const doProjeto = (pid: string | null) => {
        const p = pid ? indice.projetos.get(pid) : null;
        if (!p) return;
        ctx.no.projeto ??= { nome: p.nome };
        if (p.central) ctx.no.central ??= { nome: p.central };
        if (p.area) ctx.no.area ??= { nome: p.area };
    };
    const id = origem.no;
    const t = id ? indice.porId.get(id) : null;
    if (t) {
        const smart = t.tipo === 'smart' ? t : t.smart ? indice.porId.get(t.smart) ?? null : null;
        if (smart) {
            const nome = nomeDoCaminho(smart.caminho);
            ctx.no.smart = { nome };
            ctx.heranca = { nome, campos: extras.camposDaNota(smart.caminho) ?? {} };
        }
        const p = t.projeto ? indice.projetos.get(t.projeto) : null;
        if (p) ctx.fio.projeto = { nome: p.nome };
        doProjeto(t.projeto);
    } else if (id) {
        if (indice.projetos.has(id)) doProjeto(id);
        const a = indice.areas.get(id);
        if (a) ctx.no.area = { nome: a.nome };
        const e = modelo.passagens.find(x => x.id === id);
        if (e) { ctx.no.cidade = { nome: e.cidade }; if (e.pais) ctx.no.pais = { nome: e.pais }; }
    }
    const l = origem.linha;
    if (l?.escala === 'dia' && !isChaveEspecial(l.chave)) {
        try {
            const lugar = modelo.linha('dia', l.chave).lugar;
            ctx.lugarDoDia = { viagem: !!lugar.viagem, texto: lugar.texto };
        } catch { ctx.lugarDoDia = null; }
    }
    const ultima = [...modelo.passagens].sort((a, b) => a.de.localeCompare(b.de)).pop();
    if (ultima) ctx.ultimoLugar = { cidade: ultima.cidade, pais: ultima.pais };
    return ctx;
}

/**
 * Os domínios das coleções do índice da Missão que não são TaskNote (a TaskNote se reconhece
 * pelo `type` do modelo dela, `candidatos.type`): a área, a cidade e o país das passagens. O
 * projeto e o departamento já vêm com a espécie no índice (`MissaoProjeto.tipo`).
 */
const DOMINIO_DA_AREA = 'area';
const DOMINIO_DA_CIDADE = 'cidade';
const DOMINIO_DO_PAIS = 'pais';
/** A pessoa (P9): a nota do 👤, sem modelo de tipo, lida da casa dela (o `pessoas` da Day). */
const DOMINIO_DA_PESSOA = 'pessoa';
/** O domínio da mãe de uma ação (a herança, §8.3): a SMART. */
const DOMINIO_DA_MAE = 'smart';

/**
 * O que faz: os candidatos de um campo de link, pelos tipos do `alvo`, do modelo da Missão:
 * as TaskNotes abertas pelo `type` do modelo do alvo (a SMART, a ação), os projetos e os
 * departamentos que não se encerraram, as áreas, as cidades e os países das passagens.
 * Entra → sai: o modelo, o campo e os modelos dos tipos → os candidatos (sem repetir o nome).
 */
export function candidatosDoCampo(modelo: MissaoModelo, campo: DomainField, modelos: readonly DomainModel[]): Candidato[] {
    if (campo.tipo !== 'link') return [];
    const { indice } = modelo;
    const out: Candidato[] = [];
    const vistos = new Set<string>();
    const add = (c: Candidato) => { const k = fold(c.nome); if (c.nome && !vistos.has(k)) { vistos.add(k); out.push(c); } };
    for (const alvo of campo.alvo ?? []) {
        const type = modelos.find(m => m.dominio === alvo)?.candidatos.type ?? null;
        if (type) for (const t of indice.vivas) if (!t.feita && t.record.type === type) add({ nome: nomeDoCaminho(t.caminho), caminho: t.caminho, rotulo: t.titulo });
        for (const p of indice.projetos.values()) if (!p.encerrado && p.tipo === alvo) add({ nome: p.nome, caminho: p.nota, rotulo: p.nome });
        if (alvo === DOMINIO_DA_AREA) for (const a of indice.areas.values()) add({ nome: a.nome, caminho: a.nota, rotulo: a.nome });
        if (alvo === DOMINIO_DA_CIDADE) for (const e of modelo.passagens) add({ nome: e.cidade, caminho: e.nota, rotulo: e.cidade });
        if (alvo === DOMINIO_DO_PAIS) for (const e of modelo.passagens) if (e.pais) add({ nome: e.pais, caminho: null, rotulo: e.pais });
        if (alvo === DOMINIO_DA_PESSOA) for (const p of modelo.pessoas ?? []) add({ nome: p.nome, caminho: p.caminho, rotulo: p.nome });
    }
    return out;
}

/**
 * O que faz: a SMART que os valores do formulário ligam (o primeiro link que é de uma SMART
 * aberta do modelo), ou `null`.
 * Por quê: §8.3: a herança vale para a criação dentro de uma SMART, escolhida no nó ou no campo.
 */
export function smartDosValores(modelo: MissaoModelo, valores: Record<string, unknown>, modelos: readonly DomainModel[]): { nome: string; caminho: string } | null {
    const smartType = modelos.find(m => m.dominio === DOMINIO_DA_MAE)?.candidatos.type ?? null;
    if (!smartType) return null;
    const smarts = modelo.indice.vivas.filter(t => t.record.type === smartType);
    for (const v of Object.values(valores)) {
        for (const item of Array.isArray(v) ? v : [v]) {
            const nome = String(item ?? '').trim().replace(/^\[\[|\]\]$/g, '').split('|')[0];
            if (!nome) continue;
            const s = smarts.find(x => fold(nomeDoCaminho(x.caminho)) === fold(nome));
            if (s) return { nome: nomeDoCaminho(s.caminho), caminho: s.caminho };
        }
    }
    return null;
}

/**
 * O que faz: as sugestões de todos os campos de um tipo, pela função única (`sugestaoDoCampo`).
 * Entra → sai: o tipo e o contexto → nome do campo → sugestão (o campo sem sugestão não aparece).
 */
export function sugestoesDoNovo(tipo: TipoDoNovo, ctx: ContextoDaSugestao): Record<string, Sugestao> {
    const out: Record<string, Sugestao> = {};
    for (const { campo } of tipo.campos) {
        const s = sugestaoDoCampo(campo, ctx);
        if (s) out[campo.nome] = s;
    }
    return out;
}

/** O que faz: a entrada de cada campo: a digitada (mesmo vazia) vence a sugestão. */
export function entradasDoNovo(tipo: TipoDoNovo, sugestoes: Record<string, Sugestao>, digitadas: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const { campo } of tipo.campos) {
        out[campo.nome] = Object.prototype.hasOwnProperty.call(digitadas, campo.nome) ? digitadas[campo.nome] : sugestoes[campo.nome]?.valor ?? null;
    }
    return out;
}

/** A chave das etiquetas da TaskNote (a do TaskNotes, `CAMPOS_DO_TASKNOTES`). */
export const CHAVE_DAS_ETIQUETAS = 'tags';

/**
 * O que faz: os valores da tarefa nova com as etiquetas do ramo (`novo.etiquetas`, P10c), sem
 * repetir as que já vieram.
 * Por quê: a tarefa criada dentro de um ramo que recorta por etiqueta (a Viagem, pela
 * `viagem`) tem de ficar à vista nela; a etiqueta é do ramo, não do modelo do tipo.
 * Entra → sai: os valores conferidos e as etiquetas → os valores (a entrada não muda).
 * Erro e ataque: sem etiqueta, os valores como vieram; a etiqueta que já está (com ou sem `#`,
 * em outra caixa) não se repete; a chave das etiquetas é a do TaskNotes (`tags`).
 */
export function comEtiquetas(valores: Record<string, unknown>, etiquetas: readonly string[]): Record<string, unknown> {
    if (!etiquetas.length) return valores;
    const atuais = (Array.isArray(valores[CHAVE_DAS_ETIQUETAS]) ? valores[CHAVE_DAS_ETIQUETAS] as unknown[] : vazio(valores[CHAVE_DAS_ETIQUETAS]) ? [] : [valores[CHAVE_DAS_ETIQUETAS]]).map(x => String(x));
    const tem = new Set(atuais.map(x => fold(x.replace(/^#/, ''))));
    return { ...valores, [CHAVE_DAS_ETIQUETAS]: [...atuais, ...etiquetas.filter(e => !tem.has(fold(e)))] };
}

/** O resultado de conferir o formulário: os valores a gravar (`null` = vazio) e os problemas, por campo. */
export interface ConferenciaDoNovo { valores: Record<string, unknown>; problemas: Record<string, string> }

/**
 * O que faz: confere os campos do formulário (`validarCampos`, §4.4) pela validação única do
 * campo (`valorDoCampo`): obrigatório, formato, valores do catálogo, link que existe e as
 * regras do tipo. O problema sai em palavras, no campo; nada é gravado com ele.
 * Por quê: §4.4, "Valida: uma função pura (`validarCampos`), usada pelo painel, pelo
 * 'registrar o que fiz' e pelos testes".
 * Entra → sai: os campos, as entradas, as regras e se o obrigatório vale (o "Abrir o protocolo
 * completo" deixa o protocolo perguntar o que falta) → os valores e os problemas.
 * Erro e ataque: campo sem entrada vale `null`; o obrigatório vazio é problema só com `exigir`.
 * Prova: tests/missao/novo.test.ts ("validarCampos").
 */
export function validarCampos(campos: readonly (DomainField | CampoDoNovo)[], entradas: Record<string, unknown>, regras: RegrasDoValor & { existeNoCampo?: (campo: DomainField, nome: string) => boolean } = {}, exigir = true): ConferenciaDoNovo {
    const valores: Record<string, unknown> = {};
    const problemas: Record<string, string> = {};
    for (const item of campos) {
        const campo = 'campo' in item ? item.campo : item;
        const c = exigir ? campo : { ...campo, obrigatorio: false };
        const existe = regras.existeNoCampo ? (nome: string) => regras.existeNoCampo!(campo, nome) : regras.existe;
        const r = valorDoCampo(c, entradas[campo.nome], { ...regras, existe });
        if ('problema' in r) problemas[campo.nome] = r.problema;
        else valores[campo.nome] = r.valor;
    }
    return { valores, problemas };
}

/**
 * O que faz: o frontmatter inicial da tarefa nova: os valores conferidos e, dentro de uma
 * SMART, o patch da mãe, a mesma regra da seta e do "Ligar a uma SMART…" (sai o vínculo direto
 * com o projeto dela, entra a SMART; a semana e o impacto só onde vieram vazios).
 * Por quê: §8.3, "o frontmatter inicial é o patch da mãe … Herda só o que veio vazio".
 * Entra → sai: os valores (sem os vazios) e a SMART lida agora (ou `null`) → o frontmatter.
 * Erro e ataque: valor vazio não entra; sem SMART, os valores como vieram; a entrada não muda.
 * Prova: tests/missao/novo.test.ts ("a herança": o mesmo frontmatter que o ⚡ dá).
 */
export function frontmatterInicial(valores: Record<string, unknown>, smart: LinkTask | null): Record<string, unknown> {
    const fm: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valores)) if (!vazio(v) && k !== NOME_DA_NOTA) fm[k] = JSON.parse(JSON.stringify(v));
    if (!smart) return fm;
    const patch = patchFor(fm, motherLink({ path: '', basename: String(fm.title ?? '') }, smart));
    for (const [k, v] of Object.entries(patch ?? {})) {
        if (v === null || v === undefined) delete fm[k];
        else fm[k] = v;
    }
    return fm;
}

/**
 * O que o Novo simples grava (30/10, `via: nota`): a pasta, o nome do arquivo e o frontmatter; e, quando o
 * modelo tem molde (02/11), o caminho dele e as fichas (`{{titulo}}`, `{{<campo>}}`) que a borda resolve.
 */
export interface PedidoDaNota { pasta: string; nome: string; fm: Record<string, unknown>; molde?: { caminho: string; variaveis: Record<string, string> } }

/** A casa de um módulo, lida pela borda: a pasta da nota-índice dele e as subpastas que ela já tem. */
export interface CasaDoModulo { pasta: string; subpastas: readonly string[] }

/**
 * O que faz: a pasta onde a nota nasce dentro de um módulo: a subpasta numerada que já existe com o nome
 * (`NN - <subpasta>`, como um `04 - Funções/` que um projeto já tem), senão a própria subpasta, que nasce com a nota.
 * Por quê: o padrão fractal, decisão 4 (02/11): a subpasta é `Funções/`, e a numerada que um projeto já tem
 * fica como está; o nome da subpasta vem do modelo do tipo (`criar.casa.subpasta`), nunca do código.
 * Entra → sai: a pasta do módulo, o nome da subpasta e as subpastas que existem → o caminho.
 * Erro e ataque: a comparação ignora acento e caixa ("Funcoes" acha "Funções"); duas numeradas, vale a primeira
 * em ordem; a barra no fim da pasta sai.
 * Prova: tests/missao/novaFuncao.test.ts.
 */
export function casaNoModulo(pasta: string, subpasta: string, existentes: readonly string[]): string {
    const base = pasta.replace(/\/+$/, '');
    const alvo = fold(subpasta);
    const numerada = [...existentes].sort().find(n => { const m = n.match(/^\d+\s*-\s*(.+)$/); return !!m && fold(m[1]) === alvo; });
    const igual = existentes.find(n => fold(n) === alvo);
    return `${base}/${numerada ?? igual ?? subpasta}`;
}

/**
 * O que faz: a pasta do módulo que o campo da casa aponta: o link do campo (`criar.casa.campo`) achado pelo
 * candidato do Novo, e a pasta da nota-índice dele.
 * Entra → sai: o tipo, os valores conferidos e o achador de candidato → a pasta, ou `null` (sem casa, sem valor,
 * ou o módulo sem nota-índice no cofre).
 */
export function pastaDoModulo(tipo: Pick<TipoDoNovo, 'casa' | 'campos'>, valores: Record<string, unknown>, candidato: (campo: DomainField, nome: string) => Candidato | null): string | null {
    if (!tipo.casa) return null;
    const campo = tipo.campos.find(c => c.campo.nome === tipo.casa!.campo)?.campo;
    const v = valores[tipo.casa.campo];
    const nome = nomeDoLink(Array.isArray(v) ? v[0] : v);
    const caminho = campo && nome ? candidato(campo, nome)?.caminho ?? null : null;
    return caminho && caminho.includes('/') ? caminho.slice(0, caminho.lastIndexOf('/')) : null;
}

/** Os caracteres que o nome de um arquivo do cofre não leva (o Obsidian recusa, ou viram link). */
const FORA_DO_NOME = /[\\/:*?"<>|#^[\]]/g;

/**
 * O que faz: o pedido da nota simples de um tipo `via: nota` (a estadia, 30/10): a pasta do modelo, o nome
 * do arquivo pelo campo do título (sem os caracteres que o cofre recusa) e o frontmatter inicial, com o
 * `type` do modelo na frente e os valores conferidos (sem os vazios).
 * Por quê: a nota pequena que nenhum protocolo grava nasce do modelo, pelo mesmo Novo e com o Desfazer; o
 * nome repetido ganha sufixo na borda, que conhece o cofre.
 * Entra → sai: o tipo do Novo e os valores conferidos → o pedido, ou o problema (outra via, sem pasta, sem
 * nome que sirva).
 * Prova: tests/missao/novoWrites.test.ts ("a nota simples").
 */
export function pedidoDaNota(tipo: Pick<TipoDoNovo, 'via' | 'pasta' | 'campoDoNome' | 'type'> & Partial<Pick<TipoDoNovo, 'casa' | 'molde'>>, valores: Record<string, unknown>, modulo: CasaDoModulo | null = null): PedidoDaNota | { problema: string } {
    if (tipo.via !== 'nota' || !tipo.pasta || !tipo.campoDoNome) return { problema: 'o tipo não nasce pelo Novo simples' };
    const nome = String(valores[tipo.campoDoNome] ?? '').replace(FORA_DO_NOME, ' ').replace(/\s+/g, ' ').trim();
    if (!nome) return { problema: 'o nome é obrigatório' };
    // A casa no módulo (02/11): a nota nasce na pasta do módulo que o campo aponta, nunca na pasta larga do modelo.
    if (tipo.casa && !modulo) return { problema: `a pasta do módulo não se achou (o campo ${tipo.casa.campo})` };
    const pasta = tipo.casa && modulo ? casaNoModulo(modulo.pasta, tipo.casa.subpasta, modulo.subpastas) : tipo.pasta.replace(/\/+$/, '');
    const fm = { ...(tipo.type ? { type: tipo.type } : {}), ...frontmatterInicial(valores, null) };
    if (!tipo.molde) return { pasta, nome, fm };
    // As fichas do molde: o nome da nota e cada valor do formulário em texto (o link pelo nome da nota).
    const variaveis: Record<string, string> = { titulo: nome };
    for (const [k, v] of Object.entries(valores)) {
        if (k === NOME_DA_NOTA || vazio(v)) continue;
        variaveis[k] = (Array.isArray(v) ? v : [v]).map(x => (/^\s*\[\[/.test(String(x)) ? nomeDoLink(x) : String(x))).join(', ');
    }
    return { pasta, nome, fm, molde: { caminho: tipo.molde, variaveis } };
}

/**
 * O que faz: a nota nova pelo molde já renderizado (02/11, a nota de função): o frontmatter do pedido na frente,
 * as chaves do molde que o pedido não tem logo depois (como vieram, linha por linha: a data do `created`), e o
 * corpo do molde (📋 Planejar · ✅ Executar · 🔄 Revisar).
 * Por quê: o molde segue a convenção do 🚀 (`templateFile`, as fichas do protocolo), e o frontmatter do pedido
 * é o do modelo do tipo; a chave do molde fica como texto, sem passar por um leitor de YAML que trocaria a data
 * por outra forma.
 * Entra → sai: o molde renderizado, o frontmatter do pedido e quem escreve o YAML → o texto da nota.
 * Erro e ataque: o molde sem frontmatter é todo corpo; a chave do molde com o nome de uma do pedido sai (vale a
 * do pedido), com as linhas recuadas dela.
 * Prova: tests/missao/novaFuncao.test.ts.
 */
export function notaDoMolde(renderizado: string, fm: Record<string, unknown>, escrever: (o: Record<string, unknown>) => string): string {
    const m = renderizado.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
    const corpo = m ? renderizado.slice(m[0].length) : renderizado;
    const ficam: string[] = [];
    let fica = false;
    for (const linha of m ? m[1].split(/\r?\n/) : []) {
        const chave = linha.match(/^([^\s#][^:]*):/);
        if (chave) fica = !Object.prototype.hasOwnProperty.call(fm, chave[1].trim());
        if (fica && linha.trim()) ficam.push(linha);
    }
    const topo = escrever(fm);
    return `---\n${topo}${topo && !topo.endsWith('\n') ? '\n' : ''}${ficam.length ? `${ficam.join('\n')}\n` : ''}---\n${corpo}`;
}

/** Um passo do protocolo, como o JSON dele declara (o que importa para pré-responder). */
export interface PassoDoProtocolo { id: string; type?: string; options?: unknown[]; optionValues?: unknown[]; optional?: boolean; required?: boolean; condition?: unknown }

/**
 * As respostas pré-dadas ao protocolo e os problemas (o valor que nenhuma opção do passo aceita);
 * `respostas` = as de cada passo, antes da rodada (o que o formulário do protocolo lê, P12b).
 */
export interface RespostasDoProtocolo { variaveis: Record<string, unknown>; problemas: Record<string, string>; respostas: Record<string, unknown> }

const nomeDoLink = (v: unknown) => String(v ?? '').trim().replace(/^\[\[|\]\]$/g, '').split('|')[0].split('/').pop()!.replace(/\.md$/, '').trim();

/**
 * O que faz: as variáveis com que o protocolo dono roda a partir do formulário do Novo: a
 * resposta de cada passo como o modal a daria (o texto como veio; a opção do `suggest` pelo valor
 * dela ou pelo texto; a nota do `suggest_note` pelo nome, com o caminho dela em `_path`, que é a
 * nota escolhida, não um derivado) e as datas da rodada, sempre explícitas (`_context_date`, o
 * dia da linha ou hoje, e as do `criar.datas`). "Criar" (`modo: 'criar'`) roda pelo formulário
 * do motor (`rodadaDoFormulario`): os passos respondidos vão em `_respondidos`, e o campo
 * opcional deixado vazio vai com a resposta vazia que o modal daria, para não ser perguntado de
 * novo; os derivados (`_value`, `_num`, `_display`, `_folder`, `_prop_*`) são do motor, pela
 * mesma função da resposta dada no modal. "Abrir o protocolo completo" (`modo: 'completo'`)
 * roda com `_valoresIniciais` (`rodadaCompleta`): todo passo aparece, aberto com o valor daqui.
 * Por quê: §5.2, §5.3 e §5.6, e o P11: o motor aprende o formulário; antes a página escrevia os
 * derivados à mão (como o 🤝 do cartão), e o campo opcional vazio era perguntado de novo.
 * Entra → sai: o tipo, os passos do protocolo, os valores conferidos, os candidatos dos links,
 * a origem, hoje, o nome do protocolo, o modo e as respostas das perguntas do protocolo que o
 * modelo do tipo não tem (as que o Novo mostra pelo formulário do protocolo, P12b; não trocam as
 * dos campos do tipo) → as variáveis, os problemas e as respostas de cada passo.
 * Erro e ataque: passo que o protocolo não tem é problema (o contrato dos modelos o confere);
 * a opção que não existe é problema no campo, em palavras; a lista num passo de uma escolha só
 * leva a primeira e diz isso; a data da rodada fora do formato é problema; o campo obrigatório
 * vazio não vai (o motor o pergunta); nada aqui roda o protocolo.
 * Prova: tests/missao/novo.test.ts ("as respostas do protocolo") e
 * tests/missao/novoPeloMotor.test.ts (o Novo pelo motor grava o mesmo que o passo a passo).
 */
export function respostasDoProtocolo(
    tipo: TipoDoNovo,
    passos: readonly PassoDoProtocolo[],
    valores: Record<string, unknown>,
    candidato: (campo: DomainField, nome: string) => Candidato | null,
    origem: OrigemDoNovo,
    hoje: string,
    nomeDoProtocolo = 'protocolo',
    modo: 'criar' | 'completo' = 'criar',
    doProtocolo: Record<string, unknown> = {},
): RespostasDoProtocolo {
    const respostas: Record<string, unknown> = {};
    const problemas: Record<string, string> = {};
    const l = origem.linha;
    const datas: Record<string, string> = { _context_date: (l && dataDoPeriodo(l.escala, l.chave, hoje)) || hoje };
    for (const { campo, passo, data } of tipo.campos) {
        const v = valores[campo.nome];
        const step = passo ? passos.find(s => s.id === passo) : null;
        if (passo && !step) { problemas[campo.nome] = `${campo.rotulo}: o ${nomeDoProtocolo} não tem o passo ${passo}`; continue; }
        if (vazio(v)) {
            // O opcional deixado vazio vale como respondido, com a resposta vazia do modal; o
            // obrigatório (do modelo ou do passo) não vai, e o motor o pergunta.
            const branco = step && !campo.obrigatorio && !step.required ? respostaVazia(step) : null;
            if (step && branco !== null && modo === 'criar') respostas[step.id] = branco;
            continue;
        }
        if (data) { datas[data] = String(Array.isArray(v) ? v[0] : v); }
        if (!step) continue;
        const itens = Array.isArray(v) ? v : [v];
        const um = itens[0];
        const tipoDoPasso = step.type ?? 'text';
        if (tipoDoPasso === 'suggest_note') {
            const nome = nomeDoLink(um);
            const c = candidato(campo, nome);
            respostas[step.id] = nome;
            if (c?.caminho) respostas[`${step.id}_path`] = c.caminho;
        } else if (tipoDoPasso === 'suggest' || tipoDoPasso === 'select') {
            const opcoes = (step.options ?? []).map(o => String(o));
            const valoresDasOpcoes = Array.isArray(step.optionValues) ? step.optionValues.map(o => String(o)) : null;
            const nome = campo.tipo === 'link' ? nomeDoLink(um) : String(um);
            const c = campo.tipo === 'link' ? candidato(campo, nome) : null;
            const alvos = [nome, ...(c?.caminho ? c.caminho.replace(/\.md$/, '').split('/') : [])].map(fold);
            let i = valoresDasOpcoes ? valoresDasOpcoes.findIndex(o => o !== '' && alvos.includes(fold(o))) : -1;
            if (i < 0) i = opcoes.findIndex(o => alvos.includes(fold(o)));
            if (i < 0) { problemas[campo.nome] = `${campo.rotulo}: “${nome}” não é uma opção do ${nomeDoProtocolo}`; continue; }
            if (itens.length > 1) problemas[campo.nome] = `${campo.rotulo}: o ${nomeDoProtocolo} aceita um só`;
            respostas[step.id] = opcoes[i];
        } else {
            respostas[step.id] = campo.tipo === 'link' ? itens.map(nomeDoLink).filter(Boolean).join(', ') : itens.map(x => String(x)).join(', ');
        }
    }
    for (const [k, v] of Object.entries(doProtocolo ?? {})) if (!(k in respostas) && v !== undefined && v !== null) respostas[k] = v;
    const def = { id: tipo.protocolo ?? '', steps: passos };
    const rodadaDatas = { dia: datas._context_date, ...(datas._target_week_pin ? { semana: datas._target_week_pin } : {}), ...(datas._target_quarter_pin ? { trimestre: datas._target_quarter_pin } : {}) };
    const r = modo === 'completo' ? rodadaCompleta(def, respostas, rodadaDatas) : rodadaDoFormulario(def, respostas, rodadaDatas);
    if ('problema' in r) {
        const campoDaData = tipo.campos.find(c => c.data)?.campo.nome ?? '_datas';
        problemas[campoDaData] = `As datas da rodada: ${r.problema}`;
        return { variaveis: {}, problemas, respostas: { ...respostas } };
    }
    return { variaveis: r.variaveis, problemas, respostas: { ...respostas } };
}
