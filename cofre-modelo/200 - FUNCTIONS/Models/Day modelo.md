---
type: daily_note
week: {{date:GGGG-[W]WW}}
quarter: {{date:YYYY-[Q]Q}}
---

## 🧭 Direção do dia

```dataviewjs
// Duas linhas lidas do plugin: a forma do dia (`nucleo.formaDoDia`: feitas · do plano ·
// faltam · fora do plano · algum dia) e a carga (`nucleo.cargaDoDia`: as estimativas das
// ações do dia contra o bloco da semana, o campo `bloco_sagrado` da Week).
// Sem o plugin carregado, a linha diz "sem leitura" e nenhum número é calculado aqui.
try {
  const nucleo = app.plugins.plugins['dfm-system']?.nucleo;
  const dia = String(dv.current().file.name);
  const forma = nucleo?.formaDoDia?.(dia);
  const carga = nucleo?.cargaDoDia?.(dia);
  dv.el('div', [
    `📊 **O dia:** ${forma ? forma.text : 'sem leitura (o dfm-system não está carregado)'}`,
    `⏱ **Carga:** ${carga ? carga.text : 'sem leitura'}`
  ].join('  \n'));
} catch (e) { dv.el('div', '—'); }
```

```dataviewjs
// O bloco só chama `day_context.js` quando o arquivo existe no cofre; sem ele, a seção fica vazia.
const vista = "200 - FUNCTIONS/Scripts/day_context";
if (app.vault.getAbstractFileByPath(`${vista}.js`)) await dv.view(vista, { mode: "compact", parte: "olhada" });
```

### 🎥 Para gravar hoje

```dataviewjs
// 🎥 A peça pronta para gravar e a fala do teleprompter dela, para ler no celular longe do computador
// (`nucleo.paraGravar`: os estados, o teleprompter e os botões vêm do modelo da peça). Sem nada
// pronto, o roteiro que falta terminar. Só mostra: nada grava nem muda de estado. Sem o plugin,
// "sem leitura". O texto vai num `div`, não num parágrafo: no celular o tema dá a largura fixa da
// linha ao parágrafo do dataviewjs, e a fala sairia cortada à direita.
try {
  const plugin = app.plugins.plugins['dfm-system'];
  const lido = await plugin?.nucleo?.paraGravar?.(String(dv.current().file.name));
  if (!lido) dv.el('div', 'sem leitura (o dfm-system não está carregado)');
  else {
    dv.el('div', lido.texto);
    for (const b of lido.botoes) {
      const protocolo = plugin?.manager?.get?.(b.protocolo);
      if (!protocolo) continue;
      const botao = dv.el('button', b.rotulo);
      botao.addEventListener('click', () => protocolo.run(b.variaveis));
    }
  }
} catch (e) { dv.el('div', '—'); }
```

---

# 🗓️ O plano — aceitar e escolher

<!-- O resumo abaixo lê as propriedades que os protocolos do dia gravam nesta nota. -->
```dataviewjs
// O bloco só chama `day_context.js` quando o arquivo existe no cofre; sem ele, a seção fica vazia.
const vista = "200 - FUNCTIONS/Scripts/day_context";
if (app.vault.getAbstractFileByPath(`${vista}.js`)) await dv.view(vista, { mode: "compact", parte: "plano" });
```

```dfm
button: 🛰️ Abrir a Missão
id: command:dfm-system:dfm-abrir-missao
```

> [!note]- 🗓️ Agenda do dia
> ```dataviewjs
> await dv.view("200 - FUNCTIONS/Scripts/day_agenda")
> ```

---

# ⚡ Durante — fazer e registrar

> [!note]- 🔁 Hábitos
> ```dfm-habits
> path: 200 - FUNCTIONS/Habits/Tracker
> days: 7
> ```

## ✍️ Diário

*Escreva o dia na ordem em que ele acontece. Nada aqui é obrigatório.*
*Para registrar uma virada, duas linhas bastam: 📍 Aceito que… · 🤝 Escolho…*



### 🌙 Noite
*O fechamento da noite entra aqui, abaixo do que foi escrito no dia.*

---

# 🌙 Fechar — revisar

## 🌃 Fechamento da noite

<!-- Leituras dos registros do dia: só aparece o que aconteceu. Dia sem registro é dia sem dado. -->
```dataviewjs
// O bloco só chama `day_sentinel.js` quando o arquivo existe no cofre; sem ele, a seção fica vazia.
const vista = "200 - FUNCTIONS/Scripts/day_sentinel";
if (app.vault.getAbstractFileByPath(`${vista}.js`)) await dv.view(vista, { actionableOnly: true });
```

```dataviewjs
// O bloco só chama `day_nucleo.js` quando o arquivo existe no cofre; sem ele, a seção fica vazia.
const vista = "200 - FUNCTIONS/Scripts/day_nucleo";
if (app.vault.getAbstractFileByPath(`${vista}.js`)) await dv.view(vista, { mode: "compact" });
```

> [!success] Basta para fechar
> O que aconteceu hoje, o que ficou para depois e o primeiro passo de amanhã.

---

<!-- Os protocolos registram o dia entre os dois marcadores abaixo. Eles ficam fora de
     qualquer callout, no fim da nota, para o registro continuar visível. -->

<details open>
<summary>🗂️ Registros automáticos</summary>

<br>

<!-- DFM_LOGS_START -->
<!-- Os registros dos protocolos entram entre estes marcadores. -->
<!-- DFM_LOGS_END -->

</details>
