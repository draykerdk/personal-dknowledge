# Como contribuir

Obrigado por querer ajudar. Este projeto é experimental e ainda muito inicial: as regras abaixo podem mudar de uma versão para outra.

## O jeito de mudar

- **Uma mudança por vez.** Um pedido de mudança resolve uma coisa só, e diz o que muda e por quê.
- **Com a prova.** Toda mudança de código vem com o teste que a prova (`cd plugin && npm test`). Se mexe na tela, diga como conferiu.
- **Cada função explica a si mesma.** No código, cada função diz o que faz, por quê, o que pode dar errado e onde está a prova. Siga o que já está escrito nos arquivos.
- **Nada de dados pessoais.** Os exemplos e os testes usam o cofre de exemplo (`cofre-exemplo/`), com a pessoa fictícia. Nenhum nome real, nenhum caminho do seu computador, nenhum e-mail.
- **Nada escrito no código que é da pessoa.** Áreas, projetos, valores, nomes e textos moram nas configurações e nas notas, nunca no código. O código conhece a estrutura (as pastas 000–900, os tipos, as convenções), e só ela.
- **A guarda passa.** Antes de pedir a mudança, rode `python3 -B scripts/guarda_vazamento.py --teste`. Quem mantém o projeto roda a varredura completa.

## O pacote bônus de protocolos

O sistema funciona com os protocolos curtos que vêm no pacote. Além deles existe um conjunto maior de protocolos, escrito pelo autor do sistema ao longo do uso diário: o dia completo, a revisão da noite, as práticas de foco e de desbloqueio, os planejamentos de viagem, de estudo, de criação e de decisões, entre outros.

Esse conjunto não vem no pacote. Ele vai ser oferecido depois, como um pacote extra, de bônus para quem contribui com o projeto. A forma de receber o pacote ainda está sendo definida e vai estar escrita aqui quando estiver pronta.

Os protocolos do pacote são dados (arquivos de protocolo e notas), e não código: o plugin funciona igual com ou sem eles.

## Dúvidas

Abra uma discussão ou um pedido de mudança com a pergunta. Toda pergunta boa vira documentação.
