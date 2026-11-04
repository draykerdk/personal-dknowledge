/**
 * O relógio do lugar: o dia de hoje no fuso local.
 *
 * Por quê: o passo `hoje` da divisão da Missão (H5, tests/missao/modeloDfm.test.ts). O leitor
 * (missaoService.ts) e o casco (view/componente.ts) escreviam cada um o mesmo relógio; o relógio é
 * um efeito, e mora no lugar (liga.lugares), que o dá aos dois pelas dependências (o quadro, ao
 * criar o leitor; hosts/lugar.ts, ao montar o componente). Os testes dão o deles.
 *
 * Prova: tests/missao/relogio.test.ts.
 */

/**
 * O que faz: hoje em `AAAA-MM-DD`, pelo relógio e pelo fuso da máquina.
 * Por quê: o dia da Missão é o dia de quem a usa, não o do UTC (à noite no Brasil, o UTC já é amanhã).
 * Entra → sai: nada → `AAAA-MM-DD`.
 * Erro e ataque: lê o relógio a cada chamada (passar da meia-noite muda o dia); mês e dia com dois dígitos.
 * Prova: tests/missao/relogio.test.ts.
 */
export function hojeLocal(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
