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

## Financeiro: taxa acrescentada à tarifa e recebimentos manuais

- A inicialização da API cria, em uma transação idempotente, quatro tabelas adicionais: platform_fee_settings, ride_financials, driver_settlements e platform_fee_audit. Não recalcula nem cobra corridas antigas. O esquema Drizzle inclui essas tabelas.
- Configuração inicial: cobrança desativada. Percentual preparado de 8,33% sobre a tarifa base, apenas para simulação até o administrador ativar. Moto de R$ 6 fica R$ 6,50 quando ativada. Arredondamento comercial ao centavo por corrida. Não é desconto da remuneração base do motorista.
- O orçamento público autenticado e a solicitação usam a taxa do servidor. Tarifa base, taxa em centavos e percentual aplicado são registrados juntos com a corrida, na mesma transação. Trocar o percentual ou desligar a cobrança depois não modifica as solicitações já registradas, mesmo que sejam concluídas após a mudança.
- Só corridas concluídas geram saldo devido. Corridas antigas sem registro financeiro ficam fora da cobrança. Canceladas/aguardando/aceitas/em andamento não geram débito. O motorista recebe o total do passageiro e repassa a taxa ao KD TAXI posteriormente. Dinheiro e Pix entram no mesmo controle manual.
- Financeiro mostra base, taxa gerada, recebimentos e saldo por motorista, incluindo contas ocultas que tenham histórico. Valores são calculados do banco; o navegador não define a dívida. Alterar configuração e registrar/anular acertos exige senha atual de administrador.
- A exclusão individual de conta com saldo financeiro pendente é bloqueada até o acerto. Recebimentos podem ser parciais; o servidor bloqueia valores maiores que o saldo e serializa lançamentos por motorista. Cada formulário tem referência única, evitando registrar duas vezes ao repetir o envio. Apenas registre dinheiro efetivamente recebido: não há gateway nem transferência automática nesta etapa.
- Correções anulam um registro com motivo e autor, sem apagá-lo; a dívida volta ao saldo. Últimos 100 registros aparecem no painel. Configurações alteradas ficam em trilha própria no banco.
- A limpeza de dados de teste também exclui acertos; corridas financeiras são removidas por cascata. Configuração da taxa e sua trilha são preservadas. Não usar essa limpeza depois de começar a operação real sem revisão e backup.
- Antes de ativar: informar motoristas sobre o repasse, comunicar a taxa aos passageiros e repetir uma corrida completa de cada categoria. O APK atual consulta o preço total na API; a apresentação detalhada da taxa no aplicativo pode ser ampliada numa próxima versão.
- Verificações: pnpm run test:finance (cálculos e PostgreSQL isolado com rotas HTTP reais, sem Neon); pnpm run test:security; tipos e builds. Testes cobrem lançamento gratuito, 8,33%, arredondamento, preservação de valores, cancelamentos, recebimentos parciais, anulação, envio repetido, excesso sobre saldo, senha incorreta e integridade do banco.

## Histórico por data no painel Web

A aba Histórico e o atalho Consultar dias anteriores na Visão geral permitem consultar hoje, ontem, últimos sete dias, mês atual ou um período personalizado de até 366 dias por consulta. A busca por passageiro, motorista ou trajeto aplica-se ao resumo, aos dias e à lista. Cada página lista até 25 corridas; dias sem movimento aparecem com zero.

O resumo de hoje também usa a meia-noite de Recife, independente do fuso do servidor. A consulta de estatísticas deixa de buscar fotos, senhas e dados pessoais desnecessários. O agrupamento usa a data da solicitação no fuso America/Recife, incluindo o dia final inteiro. Os status mostrados são os atuais: uma corrida solicitada ontem e concluída hoje compõe o valor do dia da solicitação. O total financeiro dessa tela corresponde ao preço das corridas concluídas, não ao saldo de comissão da plataforma. Disponibilidade de motoristas continua sendo um dado atual; não se reconstrói presença histórica a partir dessas corridas.

A rota GET /api/admin/history exige administrador. As consultas são limitadas ao período no banco, com índice de criação existente, sem fotos ou tokens e sem apagar dados. Resumo e paginação são lidos numa mesma transação consistente. Dados anteriormente excluídos pela limpeza não podem ser reconstruídos por este filtro. Nenhuma alteração nativa nem build novo é necessário.

Verificação: pnpm run test:history testa datas inválidas, virada à meia-noite de Recife, canceladas fora do faturamento, dias zerados, busca parametrizada e paginação em PostgreSQL isolado.

## Economia de dados e tarifa noturna local

- As estatísticas usam agregação no PostgreSQL; o painel consulta apenas seis corridas sem fotos na visão geral e apenas IDs para o aviso de aprovações. A autenticação de consultas GET e a revalidação do Socket.IO não transferem a coluna de foto. A sessão e as permissões continuam sendo conferidas no banco.
- A inicialização cria night_fare_settings e night_fare_audit de forma aditiva, transacional e idempotente. Não exclui dados nem altera tarifas locais existentes. A configuração começa desativada, com referência noturna de carro R$ 25, moto R$ 10, início 00:00, fim 05:00, fuso America/Recife. Ativar e ajustar na página Preços do painel.
- O início está incluído; às 05:00 já vale a tarifa diurna. A tarifa diurna continua sendo a regra local existente; destinos específicos mantêm seus próprios preços. A categoria sem tarifa diurna continua indisponível à noite. A taxa da plataforma é calculada depois da tarifa base.
- O preço é calculado com a hora do servidor e salvo quando o passageiro solicita a corrida. Aceitar, iniciar ou finalizar depois da virada não recalcula o preço. O app novo envia o total exibido; se a tarifa mudar antes da solicitação, a API retorna FARE_CHANGED sem criar corrida, e o app atualiza o orçamento para nova confirmação. APKs anteriores continuam compatíveis, mas não têm essa conferência adicional da prévia exibida.
- Fotos novas de cadastro/perfil/câmera passam por JPEG de até 320 px de largura, qualidade 60%, antes do envio. Fotos antigas não são modificadas. A dependência nativa expo-image-manipulator requer nova compilação do aplicativo se não estiver incluída no APK instalado; não distribuir essa alteração por atualização remota a binários sem o módulo.
- As mudanças na API/painel não exigem plano novo. Publicações usam os serviços existentes e suas franquias; testes são locais em PostgreSQL isolado, sem Neon. A exportação local Android/iOS verifica a compilação JavaScript, mas não gera nem instala APK/IPA.
