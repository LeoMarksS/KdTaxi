# Checkup do KD TAXI — 7 de novembro de 2026

Revisão da base oficial `7760307`, com correções nesta etapa. Resultado: proteções reforçadas e verificações locais aprovadas. O projeto pode continuar em testes; esta revisão não equivale a uma certificação de segurança nem comprova funcionamento perfeito em produção.

## O que foi conferido

| Área | Resultado |
| --- | --- |
| Administração | Rotas administrativas exigem administrador no servidor. Cadastro público não cria administradores. Exclusão individual preserva histórico; limpeza total exige senha e confirmação. |
| Privacidade | Passageiro consulta suas corridas; motorista consulta suas corridas e solicitações da categoria permitida. Chat exige participação ou acesso administrativo no histórico. O telefone do passageiro é removido das respostas destinadas aos motoristas. |
| Corridas | Aceite usa atualização condicional no banco e bloqueio da conta; índice impede duas corridas ativas para o mesmo motorista. Início, finalização e cancelamento conferem participante e estado anterior. Tarifas são calculadas pelo servidor. |
| Motoristas | Novos cadastros aguardam aprovação. Alteração do veículo exige nova revisão. Nesta etapa, alteração do próprio nome ou foto também passa a exigir revisão e fica bloqueada durante corrida aceita/em andamento. |
| Sessões | Token aleatório de 256 bits, expiração de sete dias e senhas armazenadas com bcrypt. Permissões agora são relidas do banco em cada autenticação. |
| Publicação | API compartilhada, Firebase, projeto Expo e sons mantidos. Proteções contra compilar cópia antiga continuam verificadas. |
| Segredos | A busca limitada aos arquivos rastreados e aos padrões examinados não encontrou arquivos de credenciais nem chaves privadas literais. Isso não cobre todo o histórico Git, contas externas ou segredos de produção. O `google-services.json` é configuração do aplicativo, não chave privada de conta de serviço. |

## Correções aplicadas

- Chat: sessão validada em cada evento, desconexão de sessão inválida, verificação periódica a cada minuto para conexões silenciosas, limite de 30 eventos por dez segundos por conexão e pacote máximo de 16 KiB. Dados do remetente continuam definidos pelo servidor.
- Logout: desconecta os sockets da sessão encerrada. Conta excluída ou desativada não passa na autenticação.
- Entrada: rejeita tipos errados, textos excessivos, fotos fora dos formatos permitidos, registros push inválidos e valores de tarifa que excedem a coluna do banco. Novas senhas acima de 72 bytes são rejeitadas para impedir truncamento silencioso do bcrypt; o login mantém compatibilidade com contas existentes.
- Tentativas: limite adicional por IP no login impede contornar o limite apenas trocando o telefone informado.
- Erros: respostas não expõem consultas SQL ou pilhas internas. Erros de banco não registram os objetos completos com possíveis parâmetros pessoais. Respostas da API usam `no-store`, `nosniff`, bloqueio de enquadramento e política de referência restrita.
- Avaliações: bloqueio do usuário avaliado durante a transação evita perder uma atualização concorrente de média.
- Dependências: correções de Engine.IO, Socket.IO Parser, ws, ip-address, validação da API e ferramentas de geração/compilação. Dependências Zod sem uso foram removidas. SDK Expo e versões de React/React Native foram mantidos.
- Painel: identificação em português e orientação para não indexar em buscadores; isso complementa a autenticação, sem substituir a proteção do servidor.

Auditoria completa de dependências ao final: **zero alertas críticos, zero altos e três moderados**, limitados aos caminhos das ferramentas Expo descritos abaixo. A classificação do registro de pacotes não substitui análise de exploração no aplicativo.

## Evidências e limites dos testes

- Verificação TypeScript de todo o workspace aprovada.
- Compilação da API e do painel aprovada; exportação Android pelo Metro aprovada.
- 20 testes automatizados aprovados: contratos administrativos, limpeza transacional com transporte de banco simulado, proteções da configuração/sincronização e segurança HTTP/Socket.IO.
- O teste HTTP usa a aplicação Express real em servidor local, com endereço de banco inválido: acessos anônimos e entradas rejeitadas não dependem de dados reais. O teste Socket.IO usa cliente e servidor reais locais para entregar uma mensagem autorizada e impedir uma segunda após revogação simulada.
- Nenhuma conta, corrida, mensagem ou tarifa do banco compartilhado foi apagada ou alterada para executar os testes.
- Não foi feito teste de carga, auditoria externa de invasão, teste completo de restauração do Neon nem novo teste em aparelhos nesta etapa. A exportação Android não é um APK novo.

## Pendências antes de liberar para uso real

1. **Hospedagem e recuperação:** ativar o plano pago combinado para a API; conferir limites do Neon, política de backups e executar uma restauração em banco separado. Definir monitoramento e alertas de indisponibilidade.
2. **Aparelhos:** repetir cadastro/aprovação, online/offline, solicitação, aceite, início, cancelamento, finalização, avaliação, chat e push em segundo plano. Testar também alteração de nome/foto do motorista e nova aprovação.
3. **Token no celular:** o APK atual guarda a sessão em AsyncStorage. Migrar para armazenamento protegido do sistema, com migração da sessão existente, em uma próxima versão nativa e testar no Android/iPhone. O painel Web usa localStorage; segurança do navegador e prevenção de scripts indevidos continuam relevantes.
4. **Ferramentas Expo:** restam três avisos moderados, em `uuid` do ngrok, `glob` e `minimatch`. As versões corrigidas exigem troca de versão principal. Não foram forçadas sobre o SDK estável. São caminhos das ferramentas de desenvolvimento/compilação do Expo, sem evidência nesta revisão de exploração pela API publicada. Reavaliar numa atualização controlada do ambiente Expo.
5. **Crescimento:** histórico, mensagens e fotos podem gerar respostas grandes. Planejar paginação, armazenamento de imagens e teste de carga antes de ampliar o volume. A API mantém estado em memória; múltiplas instâncias exigem revisão de sincronização/adaptador de eventos.
6. **Operação:** telefone informado não é validado por SMS; recuperação automática de senha e autenticação em dois fatores no painel ainda não foram implementadas. O campo atual de quantidade de corridas por usuário acompanha avaliações recebidas; separar total de corridas e total de avaliações para obter a métrica correta. Definir também documentos de privacidade, atendimento e regras de retenção antes da publicação.
7. **Push:** o código verifica a aceitação do envio pelo Expo; isso não confirma entrega no aparelho. Consulta dos recibos de entrega e limpeza de tokens inválidos ainda precisam ser implementadas para melhorar o diagnóstico.

## Referências

- [Boas práticas do Express](https://expressjs.com/en/advanced/best-practice-security/)
- [Opções do servidor Socket.IO](https://socket.io/docs/v4/server-options/)
- [Alerta de esgotamento de conexões Engine.IO](https://github.com/advisories/GHSA-r635-g3xr-vw7x)
- [Alerta Zod corrigido nas dependências usadas pela API](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
- [Alerta residual do Glob](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)
