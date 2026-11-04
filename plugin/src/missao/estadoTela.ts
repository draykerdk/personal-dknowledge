/**
 * O estado de tela da Missão: escala, foco, nó escolhido, busca, "abrir tudo" e linhagem.
 *
 * Por quê: as regras de teclado e de troca de escala (↑↓, Hoje, `/`) precisam de teste, e
 * a vista não pode decidir a linha sozinha. Portado de `src/board/missaoViewModel.ts`
 * (`81095a6d`), que estava certo (arquitetura 11), com a escala "Ano" e o estado inicial
 * tirado dos filtros (o foco e o zoom do bloco).
 *
 * Módulo puro: sem DOM e sem Obsidian; a vista só desenha e chama estas funções.
 * Prova: tests/missao/estadoTela.test.ts.
 */
import type { Achado, EstadoTela } from './tipos';
import { chaveDeHoje, ESCALAS, escalaDoNivel, idDoPeriodo, levarFoco, type Escala, type NivelDoPanorama } from './tempo';
import { ehSemana, ehTrimestre } from './formatos';

/** O que dos filtros vale para abrir a tela (`filtros.ts` resolve antes). */
export interface InicioDaTela {
    escala?: Escala;
    /** A chave da linha em foco na escala; sem ela, hoje. */
    foco?: string | null;
    /** O nó aceso ao abrir (`p:<projeto>`, `s:<caminho>`). */
    selecionado?: string | null;
    zoom?: 'compacto' | 'foco' | 'tudo';
}

/** O que faz: o estado ao abrir: a escala e o foco dos filtros (sem eles, o dia de hoje). */
export function estadoInicial(hoje: string, inicio: InicioDaTela = {}): EstadoTela {
    const escala = inicio.escala && ESCALAS.includes(inicio.escala) ? inicio.escala : 'dia';
    return {
        escala, foco: inicio.foco || chaveDeHoje(escala, hoje), selecionado: inicio.selecionado ?? null, busca: '',
        abrirTudo: inicio.zoom === 'tudo', compacto: inicio.zoom === 'compacto', linhagem: true, seguir: true,
    };
}

/** O que faz: a linha seguinte (`delta` 1) ou a anterior (`-1`) na ordem da página, sem sair das pontas. */
export function passoDoFoco(chaves: readonly string[], foco: string, delta: 1 | -1): string {
    if (chaves.length === 0) return foco;
    const at = chaves.indexOf(foco);
    if (at < 0) return chaves[0];
    return chaves[Math.min(chaves.length - 1, Math.max(0, at + delta))];
}

/** O que faz: anda uma linha e segue o foco até a vista. */
export function andarFoco(estado: EstadoTela, chaves: readonly string[], delta: 1 | -1): EstadoTela {
    return { ...estado, foco: passoDoFoco(chaves, estado.foco, delta), seguir: true };
}

/** O que faz: troca a escala e leva o foco junto (`levarFoco`), sem perder o nó escolhido. */
export function comEscala(estado: EstadoTela, escala: Escala, hoje: string): EstadoTela {
    if (escala === estado.escala) return { ...estado, seguir: true };
    return { ...estado, escala, foco: levarFoco(estado.escala, estado.foco, escala, hoje), seguir: true };
}

/** O que faz: aproxima (`-1`, para o dia) ou afasta (`1`, para o ano) uma escala, sem passar das pontas. */
export function zoomDaEscala(estado: EstadoTela, delta: 1 | -1, hoje: string): EstadoTela {
    const i = ESCALAS.indexOf(estado.escala) + delta;
    return i < 0 || i >= ESCALAS.length ? estado : comEscala(estado, ESCALAS[i], hoje);
}

/**
 * O que faz: a escala que a tela desenha num nível do panorama: a do nível; o longo prazo (e o
 * grafo, que ainda não existe) desenham o Ano.
 * Por quê: a expansão da pinça (29/10) passa do Ano ao longo prazo; sem vista própria, o longo prazo
 * é o Ano com a coluna do horizonte mais longo em foco (`colunaDoHorizonte`).
 * Entra → sai: o nível → a escala.
 */
export function escalaDaTela(nivel: NivelDoPanorama): Escala {
    return escalaDoNivel(nivel) ?? 'ano';
}

/**
 * O que faz: leva a tela ao nível do panorama em que a navegação chegou (a escala dele, com o foco
 * levado junto); a tela não guarda o nível, só a escala que ele desenha.
 * Por quê: um dono só para o estado da navegação (o terceiro eixo): a pinça, o ⌘ com a roda e o
 * `+`/`−` passam por `passoDaNavegacao`, e a tela segue o nível que sai de lá.
 * Entra → sai: o estado de tela, o nível e hoje → o estado de tela (o mesmo, se a escala não muda).
 * Prova: tests/missao/formacao.test.ts ("o nível na tela").
 */
export function comNivel(estado: EstadoTela, nivel: NivelDoPanorama, hoje: string): EstadoTela {
    return comEscala(estado, escalaDaTela(nivel), hoje);
}

/** O que faz: o "Hoje": volta ao período de hoje na escala atual. */
export function irParaHoje(estado: EstadoTela, hoje: string): EstadoTela {
    return { ...estado, foco: chaveDeHoje(estado.escala, hoje), seguir: true };
}

/** O que faz: um achado da busca leva à escala e à linha dele, acende o nó e limpa a busca. */
export function irParaAchado(estado: EstadoTela, achado: Achado): EstadoTela {
    return { ...estado, escala: achado.escala, foco: achado.chave, selecionado: achado.id, seguir: true, busca: '' };
}

/** O que faz: liga e desliga "Abrir tudo" (sai do compacto). */
export function alternarAbrirTudo(estado: EstadoTela): EstadoTela {
    return { ...estado, abrirTudo: !estado.abrirTudo, compacto: false };
}

/** O que faz: diz se uma linha abre as asas: o foco (fora do compacto) ou todas, com "Abrir tudo". */
export function linhaAberta(estado: EstadoTela, chave: string): boolean {
    if (estado.compacto) return false;
    return estado.abrirTudo || chave === estado.foco;
}

/** O que a página guarda entre uma abertura e outra, no aparelho: a escala, o Abrir tudo, o "Onde estou" e o ramo escolhido. */
export interface EstadoGuardado { escala: Escala; abrirTudo: boolean; onde: string | null; ramoPrincipal: string | null }

/** A chave do armazenamento local do aparelho (`app.saveLocalStorage`, fora do `data.json`). */
export const CHAVE_DA_PAGINA = 'dfm-missao-pagina';

/**
 * O que faz: o que se guarda do estado da página: só a escala, o Abrir tudo, o "Onde estou" e o
 * ramo escolhido (P10b);
 * nunca o foco (a linha, o nó escolhido, o painel aberto), que é da sessão.
 * Por quê: a revisão de 29/10: voltar à página no mesmo jeito de ver, sem o `data.json` (que
 * está no git) mudar a cada clique; o armazenamento é local do aparelho.
 * Entra → sai: um estado qualquer com esses campos → `EstadoGuardado`.
 * Prova: tests/missao/refinos.test.ts ("o estado da página").
 */
export function estadoParaGuardar(e: { escala: Escala; abrirTudo: boolean; onde: string | null; ramoPrincipal?: string | null }): EstadoGuardado {
    return { escala: e.escala, abrirTudo: !!e.abrirTudo, onde: typeof e.onde === 'string' && e.onde ? e.onde : null, ramoPrincipal: typeof e.ramoPrincipal === 'string' && e.ramoPrincipal ? e.ramoPrincipal : null };
}

/** A chave com que o ramo escolhido se guardava até 30/10, quando o nome "ramo" substituiu o antigo. */
export const CHAVE_ANTIGA_DO_RAMO = 'lente';

/**
 * O que faz: troca, num estado guardado (o da página, no aparelho, ou o da aba, no workspace), a
 * chave antiga do ramo escolhido pela nova (`ramoPrincipal`); o resto passa igual.
 * Por quê: o nome único "ramo" (decisão de 30/10/2026): o estado que o aparelho e o workspace
 * guardaram antes da troca ainda traz a chave antiga, e o ramo escolhido não pode se perder. A
 * chave antiga vale uma vez: quem lê grava de volta com a nova quando `migrou` (o `boardPanel` e a
 * aba), e daí em diante só a nova existe.
 * Entra → sai: o estado cru → `{ estado, migrou }`; a chave nova, quando já existe, vence a antiga.
 * Erro e ataque: o que não é objeto passa sem mudar (`migrou: false`); a chave antiga que não é texto
 * sai sem virar ramo.
 * Prova: tests/missao/refinos.test.ts ("a chave antiga do ramo").
 */
export function migrarChaveDoRamo<T>(raw: T): { estado: T; migrou: boolean } {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !(CHAVE_ANTIGA_DO_RAMO in (raw as object))) return { estado: raw, migrou: false };
    const { [CHAVE_ANTIGA_DO_RAMO]: antiga, ...resto } = raw as Record<string, unknown>;
    const novo: Record<string, unknown> = { ...resto };
    if (novo.ramoPrincipal === undefined && typeof antiga === 'string') novo.ramoPrincipal = antiga;
    return { estado: novo as T, migrou: true };
}

/**
 * O que faz: lê o que a página guardou, conferido; o que não se lê vira nada (o padrão da página).
 * Erro e ataque: escala desconhecida, tipos trocados, texto em vez de objeto: o campo sai.
 */
export function estadoGuardado(raw: unknown): Partial<EstadoGuardado> {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const out: Partial<EstadoGuardado> = {};
    if (typeof r.escala === 'string' && (ESCALAS as readonly string[]).includes(r.escala)) out.escala = r.escala as Escala;
    if (typeof r.abrirTudo === 'boolean') out.abrirTudo = r.abrirTudo;
    if (typeof r.onde === 'string' && r.onde.trim()) out.onde = r.onde;
    // O ramo escolhido (P10b): só um id de arquivo (letras, números, hífen e sublinhado).
    if (typeof r.ramoPrincipal === 'string' && /^[a-z0-9_-]+$/i.test(r.ramoPrincipal)) out.ramoPrincipal = r.ramoPrincipal;
    return out;
}

/**
 * O que faz: diz se a Missão pode tomar o foco agora (a aba ficou ativa, a página foi escolhida):
 * nunca de um campo em que se digita (input, select, textarea, texto editável).
 * Entra → sai: o elemento com o foco agora → pode ou não.
 */
export function podeTomarFoco(ativo: { tagName?: string; isContentEditable?: boolean } | null | undefined): boolean {
    if (!ativo) return true;
    if (ativo.isContentEditable) return false;
    return !/^(input|select|textarea)$/i.test(String(ativo.tagName ?? ''));
}

/** Uma porta da Missão (02/11): a escala, o foco e o nó do período que a nota é. */
export interface PortaDoPeriodo { escala: 'semana' | 'trimestre'; foco: string; selecionado: string }

/**
 * O que faz: o período de uma nota pelo nome dela, para abrir a Missão nele: a Week (`AAAA-Www`) e a nota
 * do trimestre (`AAAA-Qn`), que se chamam pelo período (as casas e os moldes as nomeiam assim).
 * Por quê: as portas do levantamento de 02/11 (itens 26 e 27): a Week, a nota do trimestre e o fim do 🌳
 * abrem a Missão naquela semana ou naquele trimestre, como o canvas fazia.
 * Entra → sai: o nome da nota (sem `.md`) → a escala, o foco e o nó do período; outra nota → `null`.
 * Erro e ataque: o nome com outra coisa em volta (uma TaskNote com a semana no título) não é a nota do
 * período; a semana 54 e o trimestre 5 não existem.
 * Prova: tests/missao/portas.test.ts.
 */
export function portaDoPeriodo(nome: unknown): PortaDoPeriodo | null {
    const k = String(nome ?? '').trim().replace(/\.md$/, '');
    if (ehSemana(k)) return { escala: 'semana', foco: k, selecionado: idDoPeriodo('semana', k) };
    if (ehTrimestre(k)) return { escala: 'trimestre', foco: k, selecionado: idDoPeriodo('trimestre', k) };
    return null;
}
