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

## Preparação dos dados e aprovações no painel Web

- Aprovações reúne motoristas com situação pendente, incluindo alterações de veículo. A navegação mostra a quantidade e todas as páginas exibem um aviso enquanto houver pendências. Novos IDs pendentes geram um aviso no painel aberto, conferidos a cada minuto e ao retornar à janela; não é uma notificação push com o navegador fechado.
- Configurações permite alterar a própria senha, informando a atual e repetindo a nova (12–128 caracteres). Outras sessões da conta são revogadas.
- A limpeza não ocorre automaticamente. Faça um backup do Neon antes de usar. Selecione corridas ou todos os dados de teste; tarifas são preservadas por padrão e podem ser incluídas explicitamente. Administradores são sempre preservados.
- A limpeza exige a senha atual e a frase LIMPAR DADOS, é limitada a cinco tentativas a cada 15 minutos e fica bloqueada com corridas aceitas/em andamento. A exclusão é permanente e transacional, incluindo mensagens e avaliações. No modo completo, clientes e motoristas (inclusive ocultos) são excluídos fisicamente e suas sessões são revogadas. A exclusão individual continua preservando o histórico.
- A rota antiga DELETE /admin/rides não permite contornar a confirmação.
- Validação manual: verificar a área de aprovações com motorista pendente; revisar, aprovar e ver o contador baixar; verificar nova pendência; alterar senha com divergência e senha atual errada; testar limpeza apenas em banco descartável com usuários, sessões, corridas e chats; conferir tarifas preservadas por padrão e todas as contas administrativas mantidas. Nunca executar limpeza no banco compartilhado apenas para validar a interface.
