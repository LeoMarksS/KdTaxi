# KD TAXI — Documentação do Workspace

## Visão geral

Monorepo gerenciado com pnpm e TypeScript. Contém o aplicativo móvel KD TAXI, sua API, o painel administrativo e bibliotecas compartilhadas.

O projeto utiliza PostgreSQL para persistência dos dados e Socket.IO para comunicação em tempo real.

## Tecnologias

- **Node.js:** 24
- **Gerenciador de pacotes:** pnpm
- **Workspace:** pnpm workspaces
- **TypeScript:** 5.9
- **API:** Express 5
- **Comunicação em tempo real:** Socket.IO
- **Banco de dados:** PostgreSQL
- **ORM e esquema:** Drizzle ORM
- **Driver PostgreSQL:** pg
- **Autenticação:** sessões com tokens aleatórios e senhas armazenadas com hash bcrypt
- **Validação:** Zod e drizzle-zod
- **Geração de código da API:** Orval
- **Build da API:** esbuild, com saída ESM
- **Aplicativo móvel:** Expo, React Native e Expo Router

## Estrutura do projeto

- `artifacts/kd-taxi`: aplicativo móvel KD TAXI.
- `artifacts/kd-taxi-admin`: painel administrativo.
- `artifacts/api-server`: servidor Express e Socket.IO.
- `lib/db`: conexão PostgreSQL, esquema Drizzle e ferramentas de banco.
- `lib/api-spec`: especificação e geração de código da API.
- `lib/api-zod`: schemas e validações compartilhadas.
- `lib/api-client-react`: cliente React para consumo da API.
- `scripts`: scripts auxiliares do workspace.
- `backups`: cópias locais de segurança, ignoradas pelo Git.

## Banco de dados

O sistema utiliza PostgreSQL com Drizzle ORM.

A conexão é fornecida pela variável de ambiente `DATABASE_URL`. Essa variável deve ser configurada nos ambientes de desenvolvimento e produção, sem ser incluída no código ou na documentação.

O esquema está localizado em:

`lib/db/src/schema/index.ts`

O pacote de banco disponibiliza:

- `push`: sincronização do esquema com o banco.
- `push-force`: sincronização forçada.

**Atenção:** operações de alteração de esquema devem ser avaliadas e ter backup antes de serem executadas em produção. Não executar `push-force` em produção sem análise específica.

O servidor também mantém estruturas em memória para cache e acesso rápido. Elas não substituem o PostgreSQL como armazenamento persistente.

## Aplicativo móvel

Localização: `artifacts/kd-taxi`

Aplicativo desenvolvido com Expo, React Native e Expo Router.

Possui os seguintes perfis:

- Passageiro (client).
- Motorista (driver).
- Administrador (admin).

O aplicativo utiliza Socket.IO para receber atualizações em tempo real relacionadas a corridas e mensagens.

## API Server

Localização: `artifacts/api-server`

Servidor Express 5 com Socket.IO.

Principais responsabilidades:

- Autenticação e gerenciamento de sessões.
- Cadastro e gerenciamento de usuários.
- Solicitação, aceitação, início, finalização e cancelamento de corridas.
- Comunicação em tempo real entre passageiros e motoristas.
- Mensagens associadas às corridas.
- Administração de usuários, corridas e tarifas.

### Autenticação e administrador inicial

O primeiro administrador é criado por meio das variáveis de ambiente:

- `ADMIN_INITIAL_PHONE`
- `ADMIN_INITIAL_PASSWORD`
- `ADMIN_INITIAL_NAME` (opcional)

A senha inicial deve ter entre 12 e 128 caracteres e é armazenada com hash bcrypt.

Não existe uma senha padrão fixa documentada para o administrador. As credenciais devem ser configuradas como segredos no ambiente de execução.

As rotas administrativas exigem autenticação e autorização de administrador.

### Sessões

As sessões utilizam tokens aleatórios armazenados no banco de dados, com prazo de validade definido no servidor.

A API verifica a validade da sessão e o estado da conta durante a autenticação.

### Socket.IO

A conexão em tempo real exige token de autenticação válido.

Os eventos de corrida e mensagens são direcionados às salas correspondentes aos usuários e motoristas.

## Comandos principais

### Verificação de tipos

Verificar todos os pacotes:

`pnpm run typecheck`

Verificar somente a API:

`pnpm --filter @workspace/api-server typecheck`

### Build

Compilar a API:

`pnpm --filter @workspace/api-server build`

Compilar o aplicativo móvel para distribuição web:

`pnpm --filter @workspace/kd-taxi build`

Executar o build geral:

`pnpm run build`

### Execução da API

`pnpm --filter @workspace/api-server run dev`

O comando de desenvolvimento executa o build da API e inicia o servidor.

### Banco de dados

`pnpm --filter @workspace/db run push`

Executar somente após verificar o ambiente e confirmar que a alteração do esquema é apropriada.

### Geração de código da API

`pnpm --filter @workspace/api-spec run codegen`

## Build e publicação

A API gera seus arquivos de produção em:

`artifacts/api-server/dist/`

O ponto de entrada gerado é:

`artifacts/api-server/dist/index.mjs`

O aplicativo Expo possui seu próprio processo de build e geração de arquivos de distribuição.

A geração de arquivos web não deve ser confundida com a geração de um APK ou IPA nativo. A distribuição móvel nativa exige o processo apropriado do Expo/EAS.

## Decisões de arquitetura

- PostgreSQL é a fonte persistente dos dados.
- Drizzle ORM é utilizado para consultas e gerenciamento do esquema.
- Express é responsável pelas rotas HTTP.
- Socket.IO é utilizado para comunicação em tempo real.
- Expo e React Native fornecem a interface móvel.
- O sistema mantém cache em memória para determinadas operações.
- Mapas e pagamentos devem ser tratados como funcionalidades separadas, conforme a evolução do produto.

## Cuidados operacionais

- Nunca incluir senhas, tokens ou URLs privadas de conexão em arquivos versionados.
- Manter backups antes de alterações importantes.
- Não executar alterações destrutivas no banco sem análise prévia.
- Preservar as configurações de segurança e dependências do workspace.
- Validar TypeScript e build depois de alterações no código.
- Não considerar um build web como comprovação de que um APK nativo foi gerado e testado.
