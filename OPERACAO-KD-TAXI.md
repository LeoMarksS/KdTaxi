# Versão unificada do KD TAXI

A base funcional do aplicativo é a revisão `03782ef`, com Expo 58, início/cancelamento de corrida, sons próprios e recuperação de chat. A revisão oficial em `origin/main` integra essa base ao servidor atual e às melhorias de identificação e aprovação de motoristas.

## Atualizar o Replit

No Shell, a partir do projeto:

```sh
git fetch origin main
git show origin/main:scripts/sync-replit.sh | bash
```

O sincronizador cria um arquivo de segurança verificado em `backups/`, preserva o estado anterior em uma branch e em stash e passa a usar a revisão oficial. Reinicie o workflow após terminar.

## Gerar APK

Use somente este comando, na raiz do projeto:

```sh
pnpm run apk:preview
```

Ele consulta `origin/main`, exige a mesma revisão e a árvore sem alterações, confere o projeto Expo, API, Firebase e os dois sons, verifica os tipos e inicia a compilação. O projeto Expo oficial é `@leomarkss/kd-taxi` (`5fb3cb5d-d1c2-4bf7-b2a7-aef44055f44a`); a API compartilhada é `api.kdtaxi.com.br`. A versão e a revisão aparecem no perfil do aplicativo.

Não há configuração Expo/EAS na raiz: elas pertencem a `artifacts/kd-taxi`. Arquivos de segurança, pastas de cópias antigas, dependências locais e saídas geradas ficam fora do arquivo enviado ao Expo. O Metro também exclui cópias de segurança.

## Banco e exclusão de contas

Antes da primeira publicação desta revisão, executar `lib/db/scripts/add-account-deletion.mjs` em ambiente com `DATABASE_URL`, na pasta `lib/db`. A migração é aditiva e idempotente. Contas excluídas perdem o acesso e saem da lista; corridas e mensagens permanecem. Contas com corridas ativas exigem concluir/cancelar a corrida antes da exclusão.

## Verificação de uma versão candidata

- Entrar como cliente e motorista; conferir tarifas de carro/moto.
- Motorista online: receber, aceitar, iniciar, finalizar e cancelar uma corrida de teste.
- Motorista offline: não receber chamadas novas.
- Chat aberto, em segundo plano e após reabrir: mensagens e contadores.
- Conferir som de corrida e som de chat em Android real.
- Conferir foto/veículo após aceite e aprovação administrativa de cadastros novos.
- No painel, excluir uma conta de teste sem corrida ativa e conferir a preservação do histórico.

A geração do APK e os testes automáticos não substituem essas verificações em aparelhos reais.
