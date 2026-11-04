---
type: manual_operacional
gerado_por: 200 - FUNCTIONS/Scripts/generate_function_types.py
---

# 015 — Tipos de Função (gerado)

> ⚠️ **Arquivo gerado. Não editar à mão** — a próxima execução do script sobrescreve.
> Para atualizar: `~/.local/bin/python3.11 -B "200 - FUNCTIONS/Scripts/generate_function_types.py" --write`
>
> O nó como função: o tipo é a assinatura (o modelo em `Config/dominios/<tipo>.json`), a nota é a
> instância, com os valores dela, e o ramo é a execução dela. Esta é a vista legível dos modelos; a
> regra fica em `convencoes.md` ("Cada tipo…" e "O módulo por dentro"). Quando divergir dos modelos,
> os modelos vencem.

**2 tipos**, um por modelo.

## Índice

| Tipo | O que é | Onde mora | Acima | Abaixo · ao lado |
|---|---|---|---|---|
| [[#alfa]] (`alfa`) | O alfa (o módulo de cima, `type: alfa`). | `Casa/Alfa` | — | abaixo: beta |
| [[#beta]] (`beta`) | O beta \| a peça de baixo (liga ao alfa). | `Casa/Beta` | alfa | lado: beta |

## alfa

O alfa (o módulo de cima, `type: alfa`). Mora na pasta Alfa.

- **`type`:** `alfa`
- **Onde mora:** `Casa/Alfa`
- **Nasce:** pelo protocolo **🅰️ Criar Alfa** (`criar_alfa`)
- **Exemplo real:** [[Casa/Alfa/Meio]]
- **Modelo:** `200 - FUNCTIONS/Config/dominios/alfa.json`

### Campos

| Campo | Rótulo | Tipo | Dono | Obrigatório |
|---|---|---|---|---|
| `titulo` | Título | texto (curto) | a nota | sim |
| `fase` | Fase | escolha: `aberta`, `fechada` | **🅰️ Criar Alfa** (`criar_alfa`), passo `fase` |  |

### Ramo

- **Abaixo:** quem aponta para ele: beta (`alfa`)

### Estados

| valor | estado | rotulo | mostrar | marca |
|---|---|---|---|---|
| aberta | aberta | aberta | contorno |  |
| fechada | feita | feita | cheio | ✓ |

### Protocolos

- **cria:** **🅰️ Criar Alfa** (`criar_alfa`)
- **revisa:** **🔄 Rever Alfa** (`rever_alfa`)

## beta

O beta | a peça de baixo (liga ao alfa). Tem um par ao lado.

- **`type`:** `beta`
- **Onde mora:** `Casa/Beta`
- **Nasce:** pelo Novo da Missão, direto na nota (o nome vem de `titulo`)
- **Exemplo real:** nenhuma ainda
- **Modelo:** `200 - FUNCTIONS/Config/dominios/beta.json`

### Campos

| Campo | Rótulo | Tipo | Dono | Obrigatório |
|---|---|---|---|---|
| `alfa` | Alfa | link → alfa | a nota |  |
| `par` | Par | link → beta (vários) | derivado |  |

### Ramo

- **Acima:** `alfa` → alfa
- **Ao lado:** `par` → beta

### Protocolos

- **usa:** `usar_beta` (sem JSON em `Protocolos/`)

### Situações

| id | quando |
|---|---|
| parado | sem par |
