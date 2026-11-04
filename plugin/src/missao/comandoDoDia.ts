/**
 * O Comando do Dia e o compromisso que o 🌙 deixou, no centro do dia da Missão.
 *
 * Por quê: o inventário do painel antigo aposentado (02/11/2026, item 1): o centro do dia tem o ▶️ e o 🌙, mas
 * não mostrava o que eles gravaram, o elo entre fechar um dia e abrir o seguinte. O cartão do Dia
 * do painel antigo (aposentado) mostrava. As leituras mudaram de casa para o motor (`engine/commitmentLeft.ts`:
 * `comandoDaDay`, `inheritedCommitment`), que o painel antigo também lê; aqui só se acha a tarefa no índice.
 * É informação: nada pede, nada conta, e a Day sem o ▶️ é só a Day sem o ▶️ (a falta de registro é falta de dado).
 *
 * Módulo puro. Prova: tests/missao/comandoDoDia.test.ts.
 */
import { comandoDaDay, inheritedCommitment, leftTriggerLabel } from '../engine/commitmentLeft';
import type { MissaoEntrada } from './entrada';
import type { ComandoDoDia, CompromissoDeixado, DoDia, MissaoIndice, MissaoTarefa } from './tipos';

/** O que faz: a chave comparável do nome de uma nota (sem `.md`, sem caixa, NFC). */
const chave = (v: unknown) => String(v ?? '').trim().replace(/\.md$/i, '').normalize('NFC').toLowerCase();

/** O que faz: `[[Pasta/Nota|apelido]]` → `apelido`; `[[Nota]]` → `Nota`; o texto sem link fica como está. */
function semLink(texto: string): string {
    return texto.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_m, nome: string, apelido?: string) => (apelido || nome.split('/').pop() || nome).trim());
}

/**
 * O que faz: o que o ▶️ gravou na Day de um dia e, no dia de hoje, o compromisso que o 🌙 deixou para ele.
 * Por quê: o compromisso deixado é o de hoje pela regra da pauta (a última Day antes de hoje com
 * `gatilho_amanha`, a tarefa só enquanto segue executável); o de um dia que passou é história, e o da Day
 * de amanhã ainda não existe: os dois ficam de fora.
 * Entra → sai: as Days da entrada (os campos que o leitor pede: `CAMPOS_DO_COMANDO`), o índice, o dia e hoje
 * → { comando, deixado }, cada um `null` quando não há.
 * Erro e ataque: a Day sem nenhum campo do ▶️ não tem comando; o caminho da tarefa ligada que não está no
 * índice (apagada, fora do TaskNotes) deixa só o texto; o nome do compromisso que não é TaskNote fica como
 * texto, sem o link; o 🌙 que fechou sem compromisso não deixa nada (a noite mais recente decide).
 */
export function comandoDoDia(entrada: Pick<MissaoEntrada, 'dias'>, indice: Pick<MissaoIndice, 'tarefas' | 'porId'>, dia: string, hoje: string): DoDia {
    // O caminho acha a tarefa pelo id (`t:` ou `s:` + o caminho), sem varrer o índice a cada dia.
    const porCaminho = { get: (caminho: string): MissaoTarefa | undefined => indice.porId.get(`t:${caminho}`) ?? indice.porId.get(`s:${caminho}`) };

    const c = comandoDaDay(entrada.dias?.[dia]?.campos ?? null);
    const comando: ComandoDoDia | null = c.acao || c.unicaCoisa || c.valor || c.compromisso
        ? { acao: semLink(c.acao), suficiente: semLink(c.unicaCoisa), valor: semLink(c.valor), compromisso: semLink(c.compromisso), tarefa: (c.taskPath && porCaminho.get(c.taskPath)) || null }
        : null;

    let deixado: CompromissoDeixado | null = null;
    if (dia === hoje) {
        const days = Object.entries(entrada.dias ?? {}).map(([name, nota]) => ({ name, value: nota?.campos?.gatilho_amanha }));
        const left = inheritedCommitment(days, hoje, nome => {
            const t = indice.tarefas.find(x => chave(x.record.basename) === chave(nome));
            return t ? { path: t.caminho, status: t.status } : null;
        });
        if (left) {
            const tarefa = (left.taskPath && porCaminho.get(left.taskPath)) || null;
            deixado = { texto: tarefa ? tarefa.titulo : semLink(left.text), rotulo: leftTriggerLabel(left.when), tarefa };
        }
    }
    return { comando, deixado };
}

/**
 * O que faz: a linha curta do centro do dia: a ação do ▶️ quando a Day a tem, senão o compromisso que o 🌙
 * deixou para hoje; nenhum dos dois, vazio (o cartão não ganha linha).
 * Entra → sai: o que `comandoDoDia` achou → o texto, com o emoji de quem o gravou.
 */
export function linhaDoComando(d: DoDia): string {
    if (d.comando?.acao) return `▶️ ${d.comando.tarefa?.titulo || d.comando.acao}`;
    if (d.deixado) return `🌙 ${d.deixado.texto}`;
    return '';
}
