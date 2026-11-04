/**
 * O protocolo da gaveta a partir do motor (P12b): o adaptador entre o `JSONProtocol` e a gaveta.
 *
 * Por quê: a arquitetura da página Missão (27/10/2026, §5.3 e §5.5): "um motor só". A gaveta lê o
 * contexto da rodada, o leitor das aberturas e as opções de cada passo pelas funções do motor
 * (`contextoDaRodada`, `leitorDoFormulario`, `montarPasso`), e grava pelo `run()`, pelo rascunho
 * do motor (`guardarRascunho`) e pela criação no passo (`criarNotaDoPasso`). O apelido
 * (`redirect`) se resolve aqui, como no `run()`: o destino roda com as `redirectVariables` dele.
 *
 * O motor chega pela interface (no plugin, o do gerente de protocolos; nos testes, o do cofre em
 * memória), e o que lê o cofre e o título curto do motor chegam pelas dependências
 * (`DepsDaGavetaDoMotor`): o lugar as dá (hosts/motor.ts, passo `motor` da divisão da Missão), e
 * daqui nada lê o cofre nem importa o jsonProtocol. Abrir a gaveta só lê: nada se escreve antes do Gravar.
 */
import type { DatasDaRodada } from '../engine/protocolForm';
import { variaveisDasDatas, type NotaCandidata, type OpcoesDoPasso, type ProtocoloDaGaveta } from './gaveta';

/** O que a gaveta usa do motor (o `JSONProtocol`). */
export interface MotorDaGaveta {
    id?: string;
    name?: string;
    def: any;
    app?: any;
    contextoDaRodada(iniciais: Record<string, unknown>): Promise<any>;
    leitorDoFormulario(variaveis: Record<string, unknown>): Promise<any>;
    montarPasso(step: any, variaveis: any): Promise<any>;
    run(variaveis: any): Promise<unknown> | unknown;
    guardarRascunho(variaveis: Record<string, unknown>): Promise<boolean>;
    criarNotaDoPasso(passo: string, titulo: string, variaveis: Record<string, unknown>, opts?: { contextos?: string[] }): Promise<any>;
    resolveFolderFilter?(folder: unknown): string;
    resolvePropertyFilter?(filtro: unknown): any;
}

/** O que a gaveta recebe do lugar: o título curto do motor e as notas que o seletor de um passo oferece. */
export interface DepsDaGavetaDoMotor {
    /** O título curto que o modal sugere para a tarefa de um `askTitle` (o do motor, `shortenTaskTitle`). */
    tituloCurto?: (resposta: string, config: any) => string;
    /** As notas que o seletor de um passo `suggest_note` oferece, lidas do cofre; `null` = sem o cofre. */
    notas?: (motor: MotorDaGaveta, passo: any) => NotaCandidata[] | null;
}

/**
 * O que faz: o protocolo da gaveta para um botão: resolve o apelido, lê o contexto da rodada e o
 * leitor das aberturas com as datas explícitas, e liga as opções, o `run()`, o rascunho e a criação
 * no passo às funções do motor.
 * Entra → sai: o id do protocolo, as datas, as variáveis do botão, quem acha o motor de um id e
 * o que o lugar dá (o título curto do motor e as notas de um passo, `DepsDaGavetaDoMotor`) →
 * o protocolo da gaveta, ou `null` (o protocolo, ou o destino do apelido, não está carregado).
 * Erro e ataque: um apelido de apelido não se resolve duas vezes (o `run()` também não).
 * Prova: tests/missao/componenteGaveta.test.ts (a gaveta grava o mesmo que o passo a passo).
 */
export async function gavetaDoProtocolo(
    id: string,
    datas: DatasDaRodada,
    doBotao: Record<string, unknown>,
    achar: (id: string) => MotorDaGaveta | null | undefined,
    deps: DepsDaGavetaDoMotor = {},
): Promise<ProtocoloDaGaveta | null> {
    const { tituloCurto, notas } = deps;
    let motor = achar(id);
    if (!motor?.def) return null;
    let redirecionadas: Record<string, unknown> = {};
    if (motor.def.redirect) {
        const alvo = achar(String(motor.def.redirect));
        if (!alvo?.def || alvo.def.redirect) return null;
        redirecionadas = { ...(motor.def.redirectVariables ?? {}) };
        motor = alvo;
    }
    const m = motor;
    const respostasDoBotao = { ...redirecionadas, ...(doBotao ?? {}) };
    const iniciais = { ...respostasDoBotao, ...variaveisDasDatas(datas) };
    const contexto = await m.contextoDaRodada(iniciais);
    const leitor = await m.leitorDoFormulario(iniciais);
    return {
        id: String(m.def.id ?? m.id ?? id), nome: String(m.def.name ?? m.name ?? id), descricao: String(m.def.description ?? ''),
        def: m.def, doBotao: respostasDoBotao, contexto, leitor,
        opcoes: async (step, variaveis): Promise<OpcoesDoPasso> => {
            const montado = await m.montarPasso(step, { ...iniciais, ...(contexto?.variaveis ?? {}), ...(variaveis ?? {}) });
            const info = typeof montado?.ui?.info === 'string' && montado.ui.info.trim() ? montado.ui.info : null;
            if (step?.type === 'suggest_note') return { lista: null, notas: notas ? notas(m, montado?.passoDaNota ?? step) : null, info };
            if (step?.type === 'multiselect_note') return { lista: Array.isArray(montado?.opcoes) ? montado.opcoes.map(String) : [], notas: null, info };
            const ops = montado?.ui?.options;
            return { lista: Array.isArray(ops) ? ops.map((o: unknown) => String(o)) : null, notas: null, info };
        },
        ...(tituloCurto ? { tituloCurto } : {}),
        rodar: async variaveis => { await m.run(variaveis); },
        rascunho: variaveis => m.guardarRascunho(variaveis),
        criarNota: (passo, titulo, variaveis, contextos) => m.criarNotaDoPasso(passo, titulo, variaveis, { contextos }),
    };
}
