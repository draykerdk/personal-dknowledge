/**
 * A visão da Missão: a versão vigente do 🔭 e o ciclo longo ativo.
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, 8.2). A visão vigente é a nota
 * `type: visao` mais nova que nenhuma outra aponta como `versao_anterior`
 * (`protocolo_visao.json`), lida só da casa do 🔭 (o `targetFolder` dele); as anteriores
 * são o histórico. Sem nenhuma, o nó diz "ainda não escrita" e oferece o 🔭 com o horizonte
 * de 3 anos. O ciclo longo ativo
 * (`type: longterm_note`) aparece como "Longo prazo".
 *
 * Módulo puro. Prova: tests/missao/visao.test.ts.
 */
import { FRASES } from './frases';
import { fold, linkTarget } from '../project/projectCanvasModel';
import type { MissaoEntrada, NotaComCampos } from './entrada';
import type { VisaoVigente } from './tipos';
import { ehDia } from './formatos';

export const VISAO_AUSENTE = FRASES.visaoNaoEscrita;
/**
 * O papel e o horizonte que o nó oferece quando não há visão: o 🔭 (o papel `visao`) com a
 * resposta do passo `horizonte` já dada (a opção de 3 anos do JSON; a prova confere que ela
 * existe lá). Sem protocolo para o papel no cofre, o botão não aparece (D1 do mapa da v0).
 */
export const VISAO_OFERTA = { papel: 'visao', horizonte: '3 anos', variaveis: { horizonte: '3 Anos (Estratégico)' } } as const;

const dateOf = (v: unknown) => { const s = String(v ?? '').trim().slice(0, 10); return ehDia(s) ? s : ''; };

/**
 * O que faz: a visão vigente das notas `type: visao`: a mais nova que nenhuma outra
 * aponta em `versao_anterior`; as outras, o histórico.
 * Entra → sai: as notas de visão e o ciclo longo → `VisaoVigente`.
 * Erro e ataque: `versao_anterior` vazio, com aspas ou como `[[link|rótulo]]` dá o mesmo
 * nome; ciclo (A aponta B e B aponta A) não some com as duas: fica a mais nova.
 * Prova: tests/missao/visao.test.ts.
 */
export function visaoVigente(visoes: readonly NotaComCampos[], longoPrazo: MissaoEntrada['longoPrazo'] = null): VisaoVigente {
    const lp = longoPrazo ? { nota: longoPrazo.caminho, nome: longoPrazo.nome, canvas: longoPrazo.canvas } : null;
    const list = [...(visoes ?? [])].filter(v => String(v.campos?.type ?? 'visao').trim() === 'visao');
    if (!list.length) {
        const oferta = { papel: VISAO_OFERTA.papel, horizonte: VISAO_OFERTA.horizonte, variaveis: { ...VISAO_OFERTA.variaveis } };
        return { nota: null, nome: null, horizonte: null, data: null, historico: [], longoPrazo: lp, linha: VISAO_AUSENTE, oferta };
    }
    const pointed = new Set(list.map(v => fold(linkTarget(String(v.campos.versao_anterior ?? '').replace(/^"|"$/g, '')))).filter(Boolean));
    const byNewest = list.sort((a, b) => (dateOf(b.campos.date) || '').localeCompare(dateOf(a.campos.date) || '') || b.nome.localeCompare(a.nome));
    const vigente = byNewest.find(v => !pointed.has(fold(v.nome))) ?? byNewest[0];
    const data = dateOf(vigente.campos.date) || null;
    const horizonte = String(vigente.campos.horizonte ?? '').trim() || null;
    const linha = [horizonte, data ? `versão de ${data.slice(8, 10)}/${data.slice(5, 7)}` : null].filter(Boolean).join(' · ') || 'escrita';
    return {
        nota: vigente.caminho, nome: vigente.nome, horizonte, data,
        historico: byNewest.filter(v => v !== vigente).map(v => v.caminho), longoPrazo: lp, linha, oferta: null,
    };
}
