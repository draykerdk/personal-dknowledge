/**
 * O dia escrito (`AAAA-MM-DD`): a forma única do plugin inteiro.
 *
 * Por quê: o passo `dia` da divisão do motor (tests/engine/modeloMotor.test.ts). A regex do dia
 * estava escrita 33 vezes em 16 arquivos do motor, mais 6 fora dele (o quadro, o canvas, o
 * `main.ts`, o temporal) e a `DIA` da Missão (missao/formatos.ts). Aqui, na base do motor
 * (camada 0), ela mora num lugar só: o motor, o quadro, o canvas, o temporal e o `main.ts` a
 * importam daqui, e a Missão a reexporta pelos formatos dela.
 *
 * Depois (30/10), as variantes: o dia no começo de um texto, em qualquer lugar dele, com a hora,
 * os números do dia e o nome do arquivo da Day estavam escritos à mão 24 vezes em 23 arquivos;
 * as cinco leituras moram aqui também, cada uma com o nome dela. O que fica escrito fora daqui é
 * outra forma (o dia com a hora conferida, o mês, o dia sem hífen, um nome com prefixo), com a
 * linha do porquê no lugar e na lista do guarda tests/engine/diaSemCopia.test.ts.
 *
 * Módulo puro: sem DOM, sem cofre, sem relógio. Prova: tests/missao/formatos.test.ts ("o dia
 * escrito"), pela reexportação da Missão, tests/engine/dia.test.ts e os testes de cada leitor que
 * confere o dia.
 */

/**
 * A forma do dia escrito, `AAAA-MM-DD`, inteira (nada antes nem depois). É uma expressão
 * regular sem a flag `g`: o `test` não guarda estado entre chamadas, e o mesmo objeto serve a
 * todos. Confere a forma, não o calendário (`2026-02-31` passa); quem precisa do dia que existe
 * confere à parte, como sempre conferiu.
 */
export const DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * O que faz: diz se o texto é um dia escrito (`AAAA-MM-DD`), pela regex única (`DIA`).
 * Por quê: o mesmo teste estava escrito à mão onde se lia uma data; a cópia em cada arquivo é o
 * que os guardas vigiam (`copia:regex-do-dia`, no do motor e no da Missão).
 * Entra → sai: texto → boolean.
 * Erro e ataque: vazio, hora junto (`2026-10-29T10:00`) ou espaço na ponta dão `false`; a forma
 * só, não o calendário.
 * Prova: tests/missao/formatos.test.ts ("o dia escrito").
 */
export function ehDia(texto: string): boolean {
    return DIA.test(texto);
}

/* ------------------------------------------------------- o dia dentro de um texto maior */

/**
 * O que faz: o dia escrito no começo do texto (`2026-10-29T10:00` → `2026-10-29`); sem dia no
 * começo, ''.
 * Por quê: o campo de data do TaskNotes vem como dia ou como dia com hora (e com fuso); a mesma
 * leitura do começo estava escrita à mão em oito leitores (o grafo, a intenção, o Mission Control,
 * o trilho do canvas, o protocolo, o registro da tarefa, o mapa de conteúdos e a triagem).
 * Entra → sai: texto → `AAAA-MM-DD` ou ''.
 * Erro e ataque: espaço antes do dia dá '' (quem aceita espaço apara antes); o que vem depois do
 * dia não é conferido; a forma só, não o calendário (`2026-02-31T09:00` → `2026-02-31`).
 * Prova: tests/engine/dia.test.ts ("o dia no começo").
 */
export function diaNoInicio(texto: string): string {
    return /^(\d{4}-\d{2}-\d{2})/.exec(texto)?.[1] ?? '';
}

/**
 * O que faz: o primeiro dia escrito em qualquer lugar do texto (`[[2026-07-20]]` →
 * `2026-07-20`); sem dia, ''.
 * Por quê: as marcas dos hábitos e o dia dos pesos aceitam o dia dentro de um link ou de um
 * texto maior; a busca estava escrita à mão em três leitores (os hábitos, o registro do hábito e
 * os pesos).
 * Entra → sai: texto → `AAAA-MM-DD` ou ''.
 * Erro e ataque: o primeiro que casa vence; a borda não é conferida (`12026-07-201` dá
 * `2026-07-20`, como dava), nem o calendário.
 * Prova: tests/engine/dia.test.ts ("o dia em qualquer lugar").
 */
export function diaNoTexto(texto: string): string {
    return /\d{4}-\d{2}-\d{2}/.exec(texto)?.[0] ?? '';
}

/**
 * O que faz: o dia e a hora no começo do texto (`2026-10-29T10:00` ou `2026-10-29 10:00` →
 * `{ dia: '2026-10-29', hora: '10:00' }`); sem dia no começo, os dois vazios; sem hora, a hora
 * vazia.
 * Por quê: o agendado do TaskNotes (`scheduled`) e o campo `dia_hora` dos modelos se leem assim,
 * com `T` ou espaço entre o dia e a hora; a leitura estava escrita à mão em três lugares (a
 * semântica da tarefa, os campos do nó da Missão e o widget da tarefa).
 * Entra → sai: texto → `{ dia, hora }` (`AAAA-MM-DD` e `HH:mm`, ou '').
 * Erro e ataque: a hora não é conferida (`25:99` passa, como passava); o que vem depois da hora
 * (segundos, fuso) fica de fora; espaço antes do dia dá vazio.
 * Prova: tests/engine/dia.test.ts ("o dia e a hora no começo").
 */
export function diaEHoraNoInicio(texto: string): { dia: string; hora: string } {
    const casou = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(texto);
    return casou ? { dia: casou[1], hora: casou[2] ?? '' } : { dia: '', hora: '' };
}

/**
 * O que faz: os números do dia escrito inteiro (`2026-10-29` → `{ ano: 2026, mes: 10, dia: 29 }`);
 * o que não é dia escrito (`DIA`), `null`.
 * Por quê: as contas do dia (o dia seguinte, a semana ISO, o dia da semana, a véspera) partem dos
 * três números; a mesma regex com os grupos estava escrita à mão em sete lugares.
 * Entra → sai: texto → `{ ano, mes, dia }` ou `null`.
 * Erro e ataque: a forma só, não o calendário (`2026-02-31` dá `{ 2026, 2, 31 }`); quem precisa do
 * dia que existe confere a data montada, como sempre conferiu.
 * Prova: tests/engine/dia.test.ts ("as partes do dia").
 */
export function partesDoDia(texto: string): { ano: number; mes: number; dia: number } | null {
    if (!DIA.test(texto)) return null;
    return { ano: Number(texto.slice(0, 4)), mes: Number(texto.slice(5, 7)), dia: Number(texto.slice(8, 10)) };
}

/**
 * O que faz: o dia do nome de arquivo de uma Day (`2026-10-29.md` → `2026-10-29`); outro nome, ''.
 * Por quê: a nota do dia se chama pelo dia; o teste do nome estava escrito à mão em três lugares
 * (o núcleo, o dinheiro da Missão e o conserto das notas de período).
 * Entra → sai: o nome do arquivo (sem a pasta) → `AAAA-MM-DD` ou ''.
 * Erro e ataque: nome com sufixo (`2026-10-27 - Valor A.md`), outra extensão (`.MD`,
 * `.canvas`) ou caminho com pasta dão ''; a forma só, não o calendário.
 * Prova: tests/engine/dia.test.ts ("o dia do nome do arquivo").
 */
export function diaDoArquivo(nome: string): string {
    return nome.endsWith('.md') && DIA.test(nome.slice(0, -3)) ? nome.slice(0, -3) : '';
}

/**
 * O que faz: o carimbo de um momento na forma do TaskNotes (`2026-10-28T10:00:00.000-03:00`): o dia,
 * a hora com os milissegundos e o fuso do relógio local.
 * Por quê: o criador único de tarefa (o diagnóstico do fluxo SMART, D5, 05/11): o `dateCreated` saía
 * em quatro formas (o dia só, a hora sem os milissegundos, `Z`, a do TaskNotes); a API do TaskNotes
 * grava esta, e a volta pelo cofre e as notas do protocolo gravam a mesma. Também a hora das datas da
 * reputação (a marca do hábito), que pedem o momento e não só o dia.
 * Entra → sai: um `Date` (o relógio chega pela borda) → o texto.
 * Erro e ataque: data inválida dá ''; fuso de meia hora (`+05:30`) sai com os minutos; fuso negativo
 * com o sinal.
 * Prova: tests/engine/dia.test.ts ("o carimbo").
 */
export function carimboDoMomento(momento: Date): string {
    if (!(momento instanceof Date) || Number.isNaN(momento.getTime())) return '';
    const dois = (n: number) => String(Math.abs(n)).padStart(2, '0');
    const fuso = -momento.getTimezoneOffset();
    const sinal = fuso >= 0 ? '+' : '-';
    const dia = `${momento.getFullYear()}-${dois(momento.getMonth() + 1)}-${dois(momento.getDate())}`;
    const hora = `${dois(momento.getHours())}:${dois(momento.getMinutes())}:${dois(momento.getSeconds())}.${String(momento.getMilliseconds()).padStart(3, '0')}`;
    return `${dia}T${hora}${sinal}${dois(Math.floor(Math.abs(fuso) / 60))}:${dois(Math.abs(fuso) % 60)}`;
}
