# Estado atual — auditoria da Etapa 0

Data: 01/10/2026. Escopo: backend existente em `cuidare-backend`, conforme `agents.md`. Este documento descreve o que foi encontrado; não declara as funcionalidades planejadas como implementadas.

Nota posterior: este inventário foi preservado como retrato da **Etapa 0**. As evoluções autorizadas estão na [fundação de domínio — Etapa 1](domain-foundation.md) e [segurança de conta — Etapa 2](account-security.md); não reinterpretar as ausências deste retrato como estado do código após essas entregas.

Nota posterior — Etapa 3: exportação JSON, fechamento lógico/pedido de exclusão e revogação consent-based estão na [fundação de privacidade](privacy-foundation.md). Este documento permanece o retrato da auditoria inicial.

Nota posterior — Etapa 4: agregação autorizada e paginada da linha do tempo está na [fundação da timeline](timeline-foundation.md). Fonte atual limitada ao cadastro do dependente; módulos clínicos continuam futuros. Sem tabela duplicada/migration nova; integração real continua pendente.

Nota posterior — Etapa 5: produtos/tratamentos privados, auditoria sem valores clínicos, eventos mínimos de início/conclusão e exportação 1.1 estão na [fundação de medicamentos](medications-foundation.md). Este retrato da Etapa 0 não descreve o estado posterior dessas evoluções.

## Síntese

Nota posterior — Etapa 9 (02/10/2026): educação acrescenta matrículas/relatórios informados, CRUD com vínculo/papéis, FKs compostas para matrícula/anexo, exclusão lógica/audit atômico, timeline mínima e exportação 1.5. Relatório independente conserva texto ao excluir matrícula e oculta só referência pública. [Fundação de educação](education-foundation.md). Sem escola/professor/integração externa ou nova dependência; migration/PG real, governança/retention e operação continuam pendentes. Retrato inicial abaixo e notas anteriores preservados; Etapa 10 não iniciada.

Nota posterior — Etapa 8 (02/10/2026): catálogo/calendário versionados e registro de vacinação informado, CRUD autorizado/auditado, documento com FK composta, timeline mínima e exportação 1.4. [Fundação de vacinas](vaccinations-foundation.md). Sem seed clínico por falta de fonte aprovada; importação/publicação humana e PostgreSQL real pendentes. Sem novas dependências ou início de educação. Notas/retrato anteriores são históricos.

Nota posterior — Etapa 7: módulo documents, metadados no PG e storage privado abstrato local, scan ClamAV fail-closed, download autenticado/audit, timeline mínima e exportação 1.3 de metadados. Veja [fundação de documentos](documents-foundation.md). Não há storage público, nova dependência, vacinas ou compartilhamento externo; antivírus real/ACL/deploy/integração PG ainda exigem validação. O restante deste documento é histórico da auditoria inicial.

Nota posterior — Etapa 6: consultas e recomendações informadas pelo responsável têm CRUD autorizado, auditoria transacional, fontes mínimas de timeline e exportação 1.2. Veja [fundação de consultas](appointments-foundation.md). Não gera conteúdo clínico nem confirma atendimento. Documentos/compartilhamento continuam futuros; preservado o retrato da auditoria abaixo.

O projeto é uma base de API REST em um único processo NestJS, organizada em módulos e camadas compatíveis com um **monólito modular**. Já entrega cadastro, login por JWT e CRUD de cuidados pertencentes a um usuário. Ainda não implementa o domínio principal da V1: dependentes, relação de acesso, consentimentos, histórico de saúde, documentos, compartilhamento e governança de dados.

É possível evoluir reutilizando a base, sem recriar autenticação, ORM, validação ou repositories. O CRUD `care-tasks` é um exemplo técnico; não representa dependentes nem tratamentos de medicamentos.

O diretório inspecionado não é um repositório Git. Portanto, não foi possível verificar arquivos rastreados, histórico de segredos, branches, proteção de branch ou execuções remotas da CI. `.gitignore`, lockfile e workflow existem como arquivos locais, mas isso não comprova versionamento ou execução remota.

## Inventário da estrutura

| Área                 | Implementação encontrada                                              | Papel / observação                                                                      |
| -------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Bootstrap            | `src/main.ts`, `src/app.setup.ts`                                     | Express, prefixo `/api/v1`, validação, CORS, segurança HTTP, request ID e Swagger local |
| Composição           | `src/app.module.ts`                                                   | Configuração global, throttling, guards globais e filtro de exceções                    |
| Autenticação         | `src/modules/auth`                                                    | Controller, service, DTOs, Argon2id e guard JWT                                         |
| Cuidados             | `src/modules/care-tasks`                                              | CRUD autenticado, paginação e autorização por proprietário                              |
| Saúde técnica        | `src/modules/health`                                                  | Controller público de liveness; não existe `HealthModule` próprio                       |
| Domínio              | `src/domain/models`                                                   | Interfaces `User`, `CareTask` e tipos das operações; independentes do Prisma            |
| Views da API         | `src/presentation/views`                                              | Projeções JSON explícitas, sem templates HTML                                           |
| Contratos            | `src/repository`                                                      | Interfaces, tokens `Symbol`, erros de persistência e módulo de composição               |
| Prisma repositories  | `src/repository/prismaRepository`                                     | Classes concretas implementam as interfaces; filtros de owner também nas escritas       |
| Banco                | `src/database`                                                        | `PrismaService`, adapter PostgreSQL, pool e hooks de conexão/desconexão                 |
| Infraestrutura comum | `src/common`                                                          | Decorators `Public`/`CurrentUser`, filtro HTTP, tipos e normalização                    |
| Configuração         | `src/config/environment.ts`                                           | Schema Zod e validação de ambiente no início                                            |
| Schema / DDL         | `prisma/schema.prisma`, `prisma/migrations`                           | Dois modelos e uma migration inicial                                                    |
| Testes               | `src/**/*.spec.ts`, `test`                                            | Unitários, HTTP com repositories em memória e integração opcional com PostgreSQL        |
| Operação local       | `compose.yml`, `scripts/setup-env.cjs`                                | PostgreSQL local e geração de credenciais aleatórias                                    |
| Qualidade / CI       | Configurações TS, ESLint, Prettier, Jest e `.github/workflows/ci.yml` | Verificações locais e workflow preparado, não comprovado remotamente                    |

Não existem interceptors próprios, filas, cache de negócio, broker de eventos, microsserviços, storage de arquivos ou integrações externas de negócio. Middleware de request ID não é uma trilha de auditoria.

## Dependências efetivamente encontradas

Leitura de `package.json`, conferência com `npm ls --depth=0` e runtime local; nenhuma dependência foi instalada ou atualizada nesta etapa.

| Componente                                | Versão                                                   |
| ----------------------------------------- | -------------------------------------------------------- |
| Nest common/core/platform-express/testing | 12.1.2                                                   |
| Nest config / JWT / Swagger               | 12.0.1 / 12.0.2 / 12.0.2                                 |
| Nest throttler                            | 6.7.1                                                    |
| Prisma CLI / client / adapter-pg          | 7.10.0                                                   |
| Argon2 / pg                               | 0.45.1 / 8.23.1                                          |
| class-validator / class-transformer / Zod | 0.15.1 / 0.5.1 / 4.6.5                                   |
| TypeScript / Jest / ts-jest               | 6.0.3 / 30.5.2 / 29.4.14                                 |
| ESLint / Prettier                         | 10.11.0 / 3.9.9                                          |
| Node local / referência `.nvmrc`          | 24.15.0                                                  |
| PostgreSQL declarado no Compose           | `postgres:18.6-alpine`; não iniciado durante a auditoria |

Há overrides específicos para `deepmerge-ts` e `mysql2`, descritos no README. A auditoria de dependências reportou zero vulnerabilidades conhecidas nessa execução, não ausência de riscos na aplicação.

## MVC adaptado e limites de módulos

Controllers recebem DTOs validados, obtêm a identidade pelo backend e delegam aos services. Services orquestram operações através das interfaces de repository. Implementações Prisma persistem os modelos. Views selecionam campos públicos da resposta.

`RepositoryModule` associa `USER_REPOSITORY` e `CARE_TASK_REPOSITORY` às classes Prisma via `useClass`; interfaces TypeScript são contratos, e os símbolos permitem injeção em runtime. `PrismaService` centraliza o client, adapter, pool de dez conexões e shutdown. Não há Prisma Client disperso nos controllers/services.

O ESLint restringe imports diretos de banco, client gerado e implementações Prisma nos controllers e services. O enforcement não cobre toda classe futura, como policies/use cases com outros nomes; é uma boa base, não isolamento absoluto.

Os módulos atuais compartilham um `RepositoryModule` agregador. Isso é suficiente para duas entidades; conforme a V1 crescer, prefira exports mínimos e composição por domínio dentro dos padrões atuais, sem criar uma refatoração geral agora. Services usam exceções Nest e, em auth, tipos dos DTOs: não se trata de um domínio completamente desacoplado do framework, o que é aceitável nesta API modular.

## Contratos HTTP atuais

| Método e rota                   | Acesso                    | Comportamento                                                                    |
| ------------------------------- | ------------------------- | -------------------------------------------------------------------------------- |
| `GET /api/v1/health`            | Público                   | Liveness `{ status: 'ok' }`; não testa PostgreSQL                                |
| `POST /api/v1/auth/register`    | Público                   | Cria usuário, retorna sessão; 3 chamadas/minuto por IP/handler                   |
| `POST /api/v1/auth/login`       | Público                   | Retorna sessão; 5 chamadas/minuto por IP/handler                                 |
| `GET /api/v1/care-tasks`        | JWT                       | Array de cuidados do proprietário, `limit`/`offset`                              |
| `POST /api/v1/care-tasks`       | JWT                       | Cria cuidado com proprietário derivado do token                                  |
| `GET /api/v1/care-tasks/:id`    | JWT                       | Consulta por UUID e proprietário                                                 |
| `PATCH /api/v1/care-tasks/:id`  | JWT                       | Atualização parcial com filtro de proprietário                                   |
| `DELETE /api/v1/care-tasks/:id` | JWT                       | Exclusão física com filtro de proprietário, 204                                  |
| `/docs`                         | Público quando habilitado | Middleware Swagger de desenvolvimento; configuração impede habilitar em produção |

Não há `/me`, refresh, logout, recuperação de senha, verificação de email, dependentes, uploads ou compartilhamento. Os DTOs de entrada existem, mas não há DTOs de resposta/OpenAPI completos: as views cumprem a projeção pública, enquanto a documentação dos schemas de saída deve evoluir.

Validação global recusa campos extras, não converte tipos implicitamente e não expõe `target`/`value` dos erros. Senhas aceitam 15–128 caracteres no cadastro; email é normalizado no DTO. Cuidados têm título até 160 e descrição até 2000 caracteres. Updates removem campos ausentes, rejeitam corpo vazio e não aceitam alteração de owner. Paginação: `limit` 1–100, padrão 50; `offset` 0–10000. UUID não substitui autorização.

## Persistência e integridade

`User` contém `id`, `name`, `email`, `passwordHash` e `createdAt`. Não contém status de conta, email verificado, `updatedAt`, soft delete ou relações com dependentes/sessões. Email tem índice único; a normalização ocorre na API, não por constraint case-insensitive no banco. Importações futuras precisam respeitar a estratégia de unicidade.

`CareTask` contém `id`, `title`, `description`, `completed`, `ownerId`, `createdAt` e `updatedAt`. A FK de usuário utiliza `ON DELETE CASCADE`; índice composto inclui owner, criação e ID. IDs são UUID gerados pelo Prisma, não sequenciais. Na migration, `uuid()` não aparece como default SQL: o client gera o valor.

A migration `20261001000100_init` corresponde ao SQL produzido pelo schema atual, desconsiderando comentários e espaços. Essa comparação não aplica nem valida o DDL contra um servidor PostgreSQL. Não há seed de negócio, estratégia de rollback, soft delete, retenção ou trilha de auditoria.

Timestamps são `TIMESTAMP(3)` na migration, sem timezone. Prisma utiliza `Date`, mas a política UTC do banco e dos defaults precisa ser explícita na evolução. `birthDate` ainda não existe; deve ser modelada como data civil, não timestamp de um instante.

`prisma.config.ts` permite `MIGRATION_DATABASE_URL` separada de `DATABASE_URL`. O runtime usa `@prisma/adapter-pg`. Mapeamento de erros existe, mas cobre apenas alguns códigos de `PrismaClientKnownRequestError`; o comportamento de falhas reais do adapter ainda precisa de testes específicos.

## Componentes a reutilizar

- Auth, `PasswordService`, guard JWT e decorators, evoluindo sessões em vez de recriar login.
- Schema de configuração, validação global e estrutura de DTOs.
- Tokens/interfaces de repository, implementações em `prismaRepository` e lifecycle do banco.
- Views explícitas; estender para respostas da V1 sem retornar entidades completas.
- Filtro de erros, request ID e headers, acrescentando redaction e auditoria nos limites certos.
- Test fixtures de usuário A/B e checks de owner como ponto de partida dos testes de dependentes.
- Migration inicial, comandos e workflow, depois de resolver as pendências de execução.

## Dívida técnica e decisões pendentes

1. Definir `Dependent` + `UserDependentAccess`, com OWNER/EDITOR/VIEWER e checks desde a Etapa 1; a Etapa 12 será uma revisão transversal, não o primeiro controle de acesso.
2. Separar identidade de usuário, status de conta e sessão revogável; definir rotação e revogação de tokens.
3. Definir unicidade de email com soft delete, política UTC/datas civis e retenção antes de novas migrations.
4. Definir transações para dependente + owner + evento de auditoria; não há abstração transacional entre repositories hoje.
5. Registrar eventos de auditoria seguros, separados dos logs técnicos e da timeline.
6. Decidir destino de `care-tasks`: manter exemplo, evoluir ou descontinuar com migração explícita. Não convertê-lo silenciosamente em tratamento médico.
7. Definir bases/finalidades, representação de responsável, inventário de dados, retenção, exclusão e exportação com validação jurídica; não presumir que todo tratamento depende de consentimento.
8. Completar schemas de resposta OpenAPI, paginação consistente e readiness.
9. Executar migrations e testes com PostgreSQL real em ambiente descartável; criar rastreabilidade Git/CI sem afirmar que já existe.

Detalhes e prioridades estão em [revisão de segurança](../security/security-review.md) e [roadmap V1](v1-roadmap.md). Nenhuma dessas recomendações foi implementada nesta auditoria.

## Verificação desta etapa

Os resultados finais e limitações estão na seção de verificações da revisão de segurança. A primeira execução HTTP teve timeout no hook de preparação e falhas derivadas; isso foi registrado e não corrigido silenciosamente. A verificação global de formato já falhava exclusivamente em `agents.md`, antes dos documentos novos.

Escopo de alteração: criação dos três documentos da Etapa 0 e README (índice e precisão sobre versionamento/secrets). Código, schema, migrations, testes, dependências, configuração, secrets e `agents.md` preservados. Builds regeneram apenas os artefatos previstos em `dist` e no client Prisma.
