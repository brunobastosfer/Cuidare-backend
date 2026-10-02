# Cuidarê — backend

API REST em NestJS, TypeScript estrito, Prisma e PostgreSQL. Nome técnico sem acentos: `cuidare-backend`. O projeto fica ao lado de `cuidare-app`; esta implementação não altera o aplicativo.

## Auditoria da V1 — Etapa 0

A auditoria da base atual está documentada em [estado atual](docs/architecture/current-state.md), [revisão de segurança](docs/security/security-review.md) e [roadmap V1](docs/architecture/v1-roadmap.md). Nenhum módulo novo da V1 foi implementado nesta etapa. Os documentos distinguem controles existentes, lacunas e verificações que não puderam ser concluídas; a base ainda não deve ser tratada como pronta para dados reais de crianças ou saúde.

Há uma pendência de formatação preexistente em `agents.md`, preservado durante a auditoria, que interrompe `npm run validate`/CI no check global de formato. As demais verificações foram executadas separadamente; os resultados e a falha inicial de setup HTTP constam na revisão de segurança.

## Fundação de domínio — Etapa 1

Implementados User ampliado, Dependent, UserDependentAccess (OWNER/EDITOR/VIEWER), Consent e AuditLog. Há perfil próprio, CRUD autorizado de dependentes com exclusão lógica, aceites versionados configuráveis e auditoria atômica. O guard agora recusa contas inexistentes, bloqueadas ou excluídas; não há sessões/refresh/logout nesta etapa.

Veja [decisões, contratos, migration e verificações da fundação](docs/architecture/domain-foundation.md). `CONSENT_POLICIES={}` desativa políticas por padrão; não configura automaticamente uma base legal. A migration nova está preparada, **não aplicada localmente**; Docker/integração PostgreSQL seguem pendentes. Nenhuma etapa clínica foi iniciada.

## Segurança de conta — Etapa 2

Implementadas sessões independentes, refresh rotativo com detecção de replay, logout atual/geral, confirmação de email e recuperação de senha com tokens de uso único armazenados somente como hash. Há limites persistentes por identidade/IP e limite de concorrência do Argon2id. Veja [contratos, decisões e verificações](docs/architecture/account-security.md).

**Mudança de contrato:** cadastro responde 202 neutro, sem autenticar. Login exige email confirmado por padrão; configure SMTP para confirmação/recuperação. `EMAIL_TRANSPORT=disabled` retorna 503 uniforme nessas solicitações. Somente desenvolvimento com dados fictícios pode desativar explicitamente `AUTH_REQUIRE_VERIFIED_EMAIL`. Tokens JWT anteriores, sem sessão, exigem novo login após deploy. O app não foi alterado.

A terceira migration está preparada, **não aplicada localmente**. Integração PostgreSQL e entrega SMTP real seguem pendentes; veja também a evolução autorizada da Etapa 3 abaixo.

## Privacidade — Etapa 3

Implementados módulo privacy, exportação JSON reautenticada da conta e dependentes OWNER explicitamente selecionados, solicitação de exclusão com fechamento imediato do acesso e revogação de consentimentos configurados como consent-based. O fluxo **não executa eliminação física** nem presume prazos legais: o recibo fica PENDING_REVIEW, com retenção configurável e revisão necessária. Dependentes/registro de outros responsáveis são preservados.

Veja [contratos, estratégia, migration e testes](docs/architecture/privacy-foundation.md), [inventário de dados](docs/lgpd/data-inventory.md) e [privacy by design](docs/lgpd/privacy-by-design.md). Nenhuma dependência nova nem alteração do app. A quarta migration também não foi aplicada; a Etapa 4 está descrita abaixo.

## Linha do tempo — Etapa 4

Implementado `GET /api/v1/dependents/:dependentId/timeline`, com vínculo ativo OWNER/EDITOR/VIEWER, filtros de período/tipo, ordem asc/desc e paginação por cursor assinado. Agregação sob demanda por fontes dos módulos, sem tabela duplicada nem uso do AuditLog como histórico clínico. Na entrega da Etapa 4 havia somente DEPENDENT_CREATED (cadastro no sistema, não nascimento); a Etapa 5 adiciona início/conclusão de tratamento.

Veja [contrato, consistência, extensão, índices e testes](docs/architecture/timeline-foundation.md). A Etapa 4 não adicionou dependências/migrations nem alterou o app; a fonte de medicamentos foi integrada na Etapa 5 abaixo.

## Medicamentos — Etapa 5

Implementados produto privado do dependente (Medication) e seu uso informado (MedicationTreatment), com CRUD autorizado, estados ACTIVE/COMPLETED/SUSPENDED, exclusão lógica e auditoria atômica. Não há catálogo global, recomendação, prescrição, cálculo de dose ou mudança automática de estado. Dosagem/unidade/frequência/instruções são textos informados pelo responsável.

OWNER/EDITOR podem criar/editar; VIEWER lê; somente OWNER exclui. A quinta migration inclui duas tabelas, índices, FKs RESTRICT e integridade composta produto/dependente. Está preparada, **não aplicada localmente**. Sem nova dependência ou alteração do app. Veja [fluxo, decisões, migration e testes](docs/architecture/medications-foundation.md).

## Consultas — Etapa 6

Implementados Appointment e MedicalRecommendation separados, com CRUD autorizado por dependente/consulta, estados PENDING/IN_PROGRESS/COMPLETED/CANCELLED, auditoria atômica e exclusão lógica. As informações são fornecidas pelo responsável: não há diagnóstico, prescrição ou geração de recomendações clínicas. Data da consulta/retorno UTC; período da recomendação civil. Timeline mostra eventos genéricos de consulta registrada, recomendação cadastrada e marcação de conclusão. Exportação evoluiu para 1.2.

A sexta migration está preparada, **não aplicada localmente**. Sem novas dependências, alterações do app ou início da Etapa 7. Veja [contratos, exemplo funcional, decisões e verificações](docs/architecture/appointments-foundation.md).

## Documentos e upload privado — Etapa 7

Implementado `documents`, com metadados no PostgreSQL e bytes em storage privado separado, atrás de `FileStorageRepository`. Adaptador inicial local, keys UUID geradas pelo servidor, SHA-256, validação de conteúdo PDF/PNG/JPEG, limites de multipart/concorrência e quotas por dependente (incluem arquivos retidos após soft delete). OWNER/EDITOR enviam/editam, VIEWER lê/baixa, OWNER exclui logicamente. Downloads autenticados são attachment/no-store; detalhe/download geram audit sem conteúdo.

**Uploads vêm bloqueados por padrão:** `DOCUMENT_SCANNER=disabled` retorna 503. Para habilitar, configure `clamav`, um clamd INSTREAM privado/atualizado e diretório exclusivo; não existe bypass de antivírus. A triagem de formatos não substitui parser completo/CDR nem garante que todo malware será detectado. Em produção, use caminho absoluto canônico, volume persistente, criptografia/backup e ACL do usuário de serviço revisadas (Windows exige permissões NTFS externas ao código).

A sétima migration está preparada, não aplicada. Sem novas dependências, etapa seguinte ou alteração do app. [Guia de operação, API, riscos e testes](docs/architecture/documents-foundation.md).

## Vacinas — Etapa 8

Módulo vaccinations: referências separadas de registros do dependente, calendários público/privado-complementar versionados, CRUD autorizado/auditado, documento protegido, timeline mínima e exportação JSON 1.4. Seleção explícita da versão para estados REGISTRADA/PREVISTA/ATRASADA; comparação não confirma imunização nem gera orientação médica.

Catálogo/calendários começam vazios: sem fonte previamente aprovada para seed, dados fictícios somente nos testes. Publicação/importação humana permanece pendente. Modelo inicial só suporta idades fixas desde o nascimento, sem resgate/equivalência/decisão clínica. VACCINATION_STATUS_MAX_ITEMS=1000 limita a comparação sem truncamento silencioso.

A oitava migration está preparada, não aplicada. Sem novas dependências, alteração do app ou início da Etapa 9. [API, limites, arquivos e verificações](docs/architecture/vaccinations-foundation.md).

## Educação e relatórios escolares — Etapa 9

Implementado `education`: matrículas e relatórios registrados pelo responsável, com CRUD por dependente, autorização OWNER/EDITOR/VIEWER, datas civis, exclusão lógica e auditoria atômica. Matrícula/anexo são opcionais e do mesmo dependente; excluir a matrícula preserva o relatório e oculta somente o vínculo público.

Timeline usa SCHOOL_REPORT_RECORDED com título genérico, sem conteúdo escolar. Exportação JSON 1.5 inclui schoolEnrollments/schoolReports somente após senha e seleção OWNER; EDUCATION tem retenção padrão null, sem expurgo automático. Sem escolas/professores, notas automáticas, integração externa, novas dependências ou alteração do app.

A nona migration está preparada, **não aplicada localmente**. PostgreSQL real segue pendente. Veja [rotas, exemplo, decisões, arquivos e verificações](docs/architecture/education-foundation.md). Etapa 10 não iniciada.

## Começar

Requisitos: Node.js 24 LTS (versão de referência em `.nvmrc`), npm e Docker Desktop iniciado com containers Linux. O PostgreSQL do ambiente local usa a porta **5434**, para evitar conflito com um banco já instalado.

```powershell
cd C:\Users\BrunoBastos\Documents\projeto\cuidare-backend
npm run env:setup
npm ci
npm run db:up
npm run prisma:deploy
npm run start:dev
```

`env:setup` gera `.env` com senha local do banco e segredo JWT aleatórios, sem imprimi-los. Não sobrescreve um `.env` existente. Execute antes de `npm ci`, pois a instalação gera o cliente Prisma. As dependências e o `.env` já foram preparados nesta pasta.

- API: `http://127.0.0.1:3000/api/v1`.
- Liveness: `GET /api/v1/health` (não é uma verificação de disponibilidade do banco).
- Swagger local: `http://127.0.0.1:3000/docs`; use **Authorize** com o token de acesso.
- Para parar o banco sem apagar dados: `npm run db:stop`.

O volume do PostgreSQL preserva os dados. Alterar `POSTGRES_PASSWORD` depois da primeira inicialização não altera automaticamente a senha de um volume existente. Não apague o volume para resolver isso sem antes preservar os dados.

## Arquitetura MVC adaptada a uma API

Não há templates HTML: as "views" são projeções explícitas das respostas JSON. Controllers tratam HTTP; services orquestram regras e autorização; modelos representam os dados de domínio. Prisma fica atrás de interfaces, não dentro de controllers ou services.

```text
src/
  modules/
    auth/                     # Sessões, JWT, recuperação, confirmação e senhas
    care-tasks/               # Controller, service e DTOs do fluxo de exemplo
    health/                   # Liveness público
    users/                    # Perfil público da própria conta
    dependents/               # Perfil mínimo e policy de acesso por vínculo
    consents/                 # Aceites configuráveis, sem política jurídica presumida
    audit/                    # Eventos seguros anexados nas transações
    privacy/                  # Snapshot autorizado, exportação e pedido de exclusão
    timeline/                 # Agregação autorizada, filtros e keyset global
    medications/              # Produto privado, tratamento e fonte de timeline
    appointments/             # Consultas/recomendações informadas e fontes de timeline
    documents/                # Upload, metadados e download privado autorizado
    vaccinations/             # Referências versionadas e registros informados
    education/                # Matrículas e relatórios informados pelo responsável
  domain/models/              # Modelos e tipos independentes do ORM
  presentation/views/         # Projeções públicas sem hash/IDs internos de titular
  repository/
    user.repository.ts        # Interface UserRepository e token de injeção
    care-task.repository.ts   # Interface CareTaskRepository e token de injeção
    dependent*.repository.ts  # Interfaces de dependentes e vínculos
    consent.repository.ts     # Interface de eventos de aceite
    audit-log.repository.ts   # Interface append-only da trilha
    unit-of-work.repository.ts # Fronteira transacional, independente do ORM
    repository.module.ts      # Contrato -> implementação
    errors/                   # Erros de persistência independentes do Prisma
    prismaRepository/         # Implementações concretas das interfaces
  infrastructure/email/       # SMTP atrás de uma interface, sem ORM
  infrastructure/storage/     # FileStorageRepository local privado, sem blobs no PG
  infrastructure/scanning/    # MalwareScannerRepository: ClamAV INSTREAM fail-closed
  database/                   # Cliente Prisma, pool e ciclo de vida
  common/                     # Decorators, filtro de erros, tipos e utilitários
  config/                     # Validação das variáveis de ambiente
  generated/prisma/           # Gerado; não editar nem versionar
prisma/
  schema.prisma
  migrations/                 # Histórico de alterações, preparado para versionamento
test/
  helpers/                    # Repositories em memória e montagem do Nest real
  api.e2e-spec.ts             # Testes HTTP sem banco
  prisma.integration-spec.ts  # Teste opcional com PostgreSQL real
  foundation.*-spec.ts        # Fundação: HTTP e integração PostgreSQL
```

As classes `PrismaUserRepository` e `PrismaCareTaskRepository`, dentro de `repository/prismaRepository`, implementam respectivamente `UserRepository` e `CareTaskRepository`. Interfaces TypeScript não existem em runtime; por isso os services recebem tokens `Symbol` com `@Inject`, e `RepositoryModule` fornece as implementações via `useClass`.

Fluxo: request -> guard/DTO -> controller -> service -> interface de repository -> implementação Prisma -> PostgreSQL. Na resposta, a view projeta apenas os campos públicos. O ESLint impede imports diretos do Prisma, banco e implementações de repository nos services e controllers.

Para uma nova funcionalidade: crie modelo, contrato do repository, implementação Prisma, service, DTOs, controller, view e testes; registre o módulo. Evite um repository genérico "CRUD para tudo": operações específicas deixam filtros de autorização e regras de negócio visíveis.

## Fluxo funcional

1. `POST /api/v1/auth/register` com nome, email e senha de 15–128 caracteres retorna 202 neutro, inclusive para email existente.
2. Com SMTP configurado, envie email para `/auth/request-email-verification` e o código recebido para `/auth/verify-email` no campo `token`.
3. `/auth/login` com email/senha retorna `accessToken`, `expiresIn`, `refreshToken`, `refreshExpiresIn`, `tokenType: "Bearer"` e `user` sem senha/hash.
4. Envie `Authorization: Bearer <accessToken>` nas rotas protegidas. O titular vem do guard, nunca do corpo ou da query.
5. Renove em `/auth/refresh` com `refreshToken`, serializando chamadas e salvando o novo token. Reutilizar o anterior revoga aquela sessão. `/auth/logout` e `/auth/logout-all` aceitam somente corpo vazio.

Recuperação: `/auth/forgot-password` recebe email e responde 202 neutro; `/auth/reset-password` recebe `token`, `password` e `passwordConfirmation`, revogando todas as sessões anteriores. Configure armazenamento seguro no cliente e nunca registre credenciais.

Cadastro de exemplo (senha demonstrativa, não usar em produção):

```json
{
  "name": "Bruno",
  "email": "pessoa@example.com",
  "password": "Uma frase de senha só para o exemplo!"
}
```

| Método | Rota a partir de `/api/v1`         | Acesso / resultado                     |
| ------ | ---------------------------------- | -------------------------------------- |
| GET    | `/health`                          | Público; 200                           |
| POST   | `/auth/register`                   | Público; 202 neutro                    |
| POST   | `/auth/login`                      | Público; email e senha, 200 com sessão |
| POST   | `/auth/refresh`                    | Público; refreshToken, 200 rotacionado |
| POST   | `/auth/logout`, `/auth/logout-all` | Autenticado; corpo vazio, 204          |
| GET    | `/care-tasks?limit=50&offset=0`    | Autenticado; array de cuidados         |
| POST   | `/care-tasks`                      | Autenticado; título e descrição, 201   |
| GET    | `/care-tasks/:id`                  | Autenticado; 200 ou 404                |
| PATCH  | `/care-tasks/:id`                  | Autenticado; campos presentes, 200     |
| DELETE | `/care-tasks/:id`                  | Autenticado; 204 ou 404                |

Criar um cuidado:

```json
{ "title": "Organizar medicamentos", "description": "Conferir a rotina combinada." }
```

Atualizar parcialmente:

```json
{ "completed": true }
```

O JSON público contém `id`, `title`, `description`, `completed`, `createdAt` e `updatedAt`. A lista mantém formato de array compatível com o exemplo do app. A integração do login e envio de token no frontend é uma etapa separada; não foi alterada aqui. No emulador Android, o host do computador costuma ser `10.0.2.2`; acesso fora do loopback exige ajustar `HOST` e o firewall somente na rede de desenvolvimento.

Rotas da fundação: `GET /me`, `POST/GET /dependents`, `GET/PATCH/DELETE /dependents/:id` e `POST/GET /consents`. Criar dependente com `fullName`, `birthDate: "2020-02-29"` e `preferredName`/`relationship` opcionais atribui OWNER ao usuário autenticado. OWNER consulta/edita/exclui; EDITOR consulta/edita; VIEWER apenas consulta. Sem vínculo ou papel suficiente, a API retorna 404. Não há rota pública para gerenciar vínculos nesta etapa. O [guia da fundação](docs/architecture/domain-foundation.md) detalha os payloads e as políticas.

Campos extras são recusados, e não apenas removidos. Updates vazios, `null` nos campos obrigatórios e booleanos como string são recusados. IDs precisam ser UUID v4; a paginação aceita `limit` de 1 a 100 e `offset` de 0 a 10000. Para conjuntos muito grandes, evolua para paginação por cursor.

Timeline: `GET /dependents/:id/timeline?limit=50&order=desc&type=DEPENDENT_CREATED`. Também aceita MEDICATION_STARTED, MEDICATION_COMPLETED, APPOINTMENT_RECORDED, MEDICAL_RECOMMENDATION_RECORDED, MEDICAL_RECOMMENDATION_COMPLETED, DOCUMENT_UPLOADED, VACCINATION_RECORDED e SCHOOL_REPORT_RECORDED; títulos genéricos/summary null, sem dose/nome do produto/notas. `from`/`to` são opcionais, inclusivos e exigem timestamp UTC com Z, por exemplo `2026-01-01T00:00:00Z`. Resposta: `{ items, nextCursor, hasMore }`. Continue com `cursor=nextCursor`, preservando filtros/ordem e identidade; `limit` pode mudar (1–100). Não aceita offset. Cursor expira em 30 minutos, não renova acesso nem substitui JWT/vínculo; detalhes em `GET /dependents/:id` (perfil) ou `GET /dependents/:id/medications/:sourceId` (tratamento), sempre autorizados.

Medicamentos: crie produto em `POST /dependents/:id/medication-products` com `{ "name": "Produto fictício" }`; depois `POST /dependents/:id/medications` com medicationId retornado, dosage/unit/frequency textuais e startDate YYYY-MM-DD. GET/list/PATCH/DELETE existem para ambas as coleções. Campos clínicos opcionais aceitam null para remoção; campos obrigatórios/identidades não aceitam null ou atribuição extra. Conclusão exige endDate não futura; fim planejado não conclui automaticamente, e retomada de SUSPENDED é explícita. Produto com tratamento não excluído não pode ser excluído. [Exemplos e regras](docs/architecture/medications-foundation.md).

Erros têm `statusCode`, `message`, `requestId` e `timestamp`. O header `X-Request-Id` é gerado pelo servidor. Erros internos não retornam SQL, stack ou informações do driver.

Consultas: POST/GET `/dependents/:id/appointments`, GET/PATCH/DELETE `.../appointments/:appointmentId`. Recomendações: POST/GET `.../:appointmentId/recommendations`, GET/PATCH/DELETE `.../recommendations/:recommendationId`. OWNER/EDITOR escrevem, VIEWER lê, OWNER exclui; listas usam limit/offset existentes. Consulta com recomendação não excluída retorna 409. Estados terminais COMPLETED/CANCELLED não reabrem, mas permitem correção de texto/período. Início/fim/retorno previstos não geram conclusão automática.

Tipos adicionais de timeline: APPOINTMENT_RECORDED (data informada, inclusive futuro; não atesta atendimento), MEDICAL_RECOMMENDATION_RECORDED (cadastro técnico) e MEDICAL_RECOMMENDATION_COMPLETED (marcação de conclusão). Detalhes são consultados nas rotas acima com nova autorização; use sourceId da consulta/recomendação. Recomendações exigem também appointmentId, obtido na lista autorizada da respectiva consulta; a timeline não fornece metadados clínicos extras.

Educação: POST/GET `/dependents/:id/education/enrollments` e `/dependents/:id/education/reports`, GET/PATCH/DELETE `.../enrollments/:enrollmentId` e `.../reports/:reportId`. Matrícula/anexo do relatório são opcionais, reassociáveis no mesmo dependente ou removíveis via null. Excluir matrícula preserva relatórios. Datas YYYY-MM-DD; relatório não futuro, matrícula planejada permitida. [Exemplo e regras](docs/architecture/education-foundation.md).

## Fluxos de privacidade

Com JWT válido, POST /privacy/exports recebe `format: "JSON"`, `password` e `dependentIds` opcionais. Lista vazia exporta somente dados próprios da conta; dependentes selecionados exigem OWNER ativo. A Etapa 9 evolui schemaVersion para **1.5**, acrescentando schoolEnrollments/schoolReports às coleções existentes, incluindo vaccinations (registro/proveniência) e documents somente com metadados públicos. Matrícula/anexo excluídos retornam vínculo null, sem ocultar o relatório independente. Não inclui bytes, storageKey, checksum, scannedAt, contas/vínculos de outros responsáveis, hashes ou tokens; textos clínicos e nomes de arquivo informados podem constar. Os binários são obtidos individualmente pela rota privada de download; JSON não é exportação ZIP completa dos arquivos. Resposta JSON é attachment/no-store; proteja o arquivo no dispositivo. Padrão 1000 itens por coleção e 2MiB, sem truncar silenciosamente: excesso retorna 413 e requer canal de atendimento do controlador.

POST /privacy/account-deletion-requests recebe `password` e `confirmation: "DELETE_MY_ACCOUNT"`. Exportar antes, se desejado: após 202 a conta fica bloqueada/excluída logicamente e sessões/acessos são revogados. O recibo não afirma eliminação definitiva; não há cancelamento/restauração automática, status online pós-fechamento ou purge. Definir atendimento seguro de revisão e eliminação antes de produção.

POST /privacy/consents/:id/revoke aceita corpo vazio e retira aceites próprios do mesmo tipo/escopo, inclusive versões/repetições, quando foram registrados sob política `consentBased: true`. Padrão false; não reclassifica legados nem presume que todo tratamento depende de consentimento. Configurar bases/textos somente após validação jurídica. O contrato de resposta existente de consentimentos foi preservado.

`PRIVACY_RETENTION_DAYS={}` mantém categorias sem prazo definido e exige revisão; não autoriza retenção indefinida nem dispara eliminação automática. MEDICATION, APPOINTMENT, DOCUMENT, VACCINATION e EDUCATION têm padrão null, sem alterar pedidos antigos ou inventar prazos. DOCUMENT abrange metadados/bytes/backups; exclusão lógica não remove o objeto. `PRIVACY_EXPORT_MAX_ITEMS` e `PRIVACY_EXPORT_MAX_BYTES` limitam a exportação síncrona. Detalhes e exemplos no [guia da Etapa 3](docs/architecture/privacy-foundation.md).

## Segurança implementada

- Todas as rotas exigem JWT por padrão; apenas as marcadas explicitamente como públicas são liberadas.
- JWT HS256 com assinatura, expiração obrigatória, emissor/audiência, usuário ativo e sessão/versão de credencial válidas. TTL padrão de 15 minutos, revogação por sessão e refresh com validade absoluta, hash-only e rotação atômica.
- Argon2id com salt por senha, 64 MiB, três iterações, paralelismo 1 e no máximo dois trabalhos concorrentes por instância. Login inexistente verifica hash dummy; respostas públicas têm piso temporal, sem promessa de tempo constante.
- Limites por IP e rota: padrão 100/minuto, login 5/minuto e cadastro 3/minuto. `trust proxy` desligado por padrão para não confiar em IP informado pelo cliente.
- Orçamentos adicionais por identidade/IP compartilhados no PostgreSQL, com chaves HMAC sem email/IP puro. Cadastro e solicitações de email/recuperação têm respostas neutras; códigos expiram, são de uso único e nunca saem no JSON.
- Validação centralizada, limite de JSON de 32 KiB e consultas Prisma sem SQL montado por concatenação.
- Autorização por proprietário também nas escritas atômicas do repository, evitando checagem seguida de update sem filtro. Recursos inexistentes e pertencentes a outro usuário retornam 404.
- Dependentes exigem vínculo ativo e papéis nas leituras/escritas; exclusão lógica e novas FKs RESTRICT preservam o histórico. Cadastro, alterações de dependente e aceites registram auditoria na mesma transação.
- Headers de segurança nativos do NestJS, CSP, bloqueio de frames e `Cache-Control: no-store`.
- CORS por origens exatas, sem wildcard ou cookies. Clientes nativos sem `Origin` são permitidos; **CORS não substitui autenticação**.
- Configuração validada no início; `.gitignore` exclui os arquivos locais de secrets, sem comprovar ausência em um eventual histórico Git. Swagger público é proibido pela configuração em produção.
- Banco local exposto apenas no loopback, credenciais aleatórias e autenticação SCRAM-SHA-256.

Veja `SECURITY.md` para limites dessa base e preparação de produção. MFA não foi implementada; banco/SMTP reais, operação, retenção e monitoramento ainda precisam de validação. Não há promessa de segurança absoluta ou conformidade automática.

## Banco e migrations

O schema inclui usuários, cuidados, dependentes/vínculos, consentimentos, audit, sessões, hashes de refresh/códigos de conta, buckets de tentativas, recibos mínimos de exportação, pedidos de exclusão, medicamentos/tratamentos, consultas/recomendações, metadados de documentos referências/calendários/registros de vacinação e matrículas/relatórios escolares. As nove migrations estão em `prisma/migrations`; a Etapa 9 adiciona duas tabelas/constraints de educação e FKs compostas matrícula/documento/dependente, sem alterar migrations anteriores ou apagar dados. Email permanece único mesmo após soft delete. A migration da Etapa 1 interpreta timestamps legados como UTC e converte para TIMESTAMPTZ; confira essa premissa/backup antes de aplicá-la em banco existente. birthDate/startDate/endDate/documentDate/reportDate/administeredAt/validFrom/validUntil são DATE; timestamps de consulta/sistema são UTC.

```powershell
# Após mudar o schema, criar uma nova migration no banco de desenvolvimento
npm run prisma:migrate -- --name nome_da_alteracao

# Aplicar migrations existentes; usado também em deploy
npm run prisma:deploy

# Inspecionar o banco apenas em ambiente local
npm run prisma:studio
```

Prisma 7 usa `prisma.config.ts` para a URL das migrations e `@prisma/adapter-pg` para o runtime. `DATABASE_URL` é a conexão da API. `MIGRATION_DATABASE_URL`, opcional, permite usar uma identidade distinta para alterações de schema em produção. Nunca execute `migrate dev` em produção.

O PostgreSQL do Compose é **somente para desenvolvimento**: `POSTGRES_USER` tem privilégios de administração. Em produção, use usuário da API sem DDL/superuser, usuário separado para migrations, TLS validado, rede privada, backups e secret manager.

## Qualidade e testes

```powershell
npm run validate       # Schema, tipos, lint, formato, unitários, HTTP e build
npm test               # Testes unitários
npm run test:e2e       # Nest real, repositories em memória
npm run test:coverage  # Cobertura unitária
npm run lint:fix
npm run format
npm audit --audit-level=high
```

Os testes HTTP usam controllers, services, autenticação, hashes, validação, multipart e middlewares reais; persistência, storage e scanning/email externos são substituídos. Os testes dos repositories verificam filtros enviados ao Prisma. Há testes do filesystem local com fixtures temporárias e do protocolo INSTREAM com servidor TCP fictício, não um antivírus real. Isso **não equivale a executar queries contra PostgreSQL, examinar malware com ClamAV ou enviar email real**.

O teste opcional `npm run test:database` usa os repositories/transações reais de PostgreSQL; nos casos de documentos, somente storage/scanner externos são substituídos. Para segurança, exige `TEST_DATABASE_URL` apontando para um banco exclusivo chamado `cuidare_test`, com migrations previamente aplicadas. Ele remove apenas registros que criou. Não aponte testes para bancos com dados reais.

O workflow em `.github/workflows/ci.yml` prepara PostgreSQL descartável, aplica migrations e executa esse teste, além da validação e auditoria. Actions são fixadas por commit e o token tem acesso somente de leitura. O workflow está preparado, mas não foi executado remotamente durante esta inicialização.

Validação local da Etapa 3: 126 unitários e 107 HTTP, schema, tipos, lint, build e formato dos arquivos alterados aprovados. [Resultados e limitações](docs/architecture/privacy-foundation.md). Check global de formato continua apontando apenas `agents.md`, preservado. Docker engine indisponível; migrations, 12 casos PostgreSQL e CI remota não foram executados. SMTP real não foi configurado nem utilizado.

Validação local da Etapa 4: 175 unitários e 138 HTTP aprovados, além de schema/client, tipos, lint, build e formato dos arquivos alterados. Check global continua apontando somente `agents.md` preexistente. Agora há 14 casos PostgreSQL preparados, nenhum executado; Docker/banco de testes indisponíveis. [Resultados, alterações e limites da timeline](docs/architecture/timeline-foundation.md). As verificações acima da Etapa 3 são o retrato da entrega anterior, não execução de integração real.

## Versões e decisões

Validação da Etapa 9: 564 unitários/54 suítes e 298 HTTP/10 suítes aprovados (82 unitários e 32 HTTP novos); schema/client, tipos, lint e build aprovados. Auditoria de dependências: zero vulnerabilidades reportadas. São 44 casos PostgreSQL preparados/10 suítes (7 novos), nenhum executado: Docker sem engine e sem TEST_DATABASE_URL exclusivo. Nona migration não aplicada. Formato dos arquivos alterados aprovado; npm run validate interrompe apenas no formato preexistente de agents.md, preservado. Inventário e evidências no [relatório e inventário](docs/architecture/education-foundation.md). Etapa 10 não iniciada.

Validação da Etapa 8: 482 unitários/49 suítes e 266 HTTP/9 suítes aprovados (80 unitários e 25 HTTP novos); schema/client, tipos, lint, build e formatter dos arquivos alterados aprovados. Auditoria de dependências: zero vulnerabilidades reportadas. npm run validate continua interrompendo somente no formato preexistente de agents.md, preservado. Há 37 casos PostgreSQL preparados/9 suítes (6 novos), nenhum executado: engine Docker indisponível e sem TEST_DATABASE_URL exclusivo. Oitava migration não aplicada; referências/importação/publicação humanas ainda pendentes. [Inventário, decisões e limitações](docs/architecture/vaccinations-foundation.md). Retrato histórico; Etapa 9 descrita acima.

Validação da Etapa 7: 402 unitários/45 suítes e 241 HTTP/8 suítes aprovados; schema/client, tipos, lint, build e formato dos arquivos alterados aprovados. Check global só aponta agents.md preexistente, preservado. São 31 casos PostgreSQL preparados (6 novos), nenhum executado por falta do banco exclusivo/Docker. Migration nova preparada, não aplicada; ClamAV real/ACL/storage produtivo precisam validação. [Relatório, inventário de arquivos e decisões](docs/architecture/documents-foundation.md). Retrato histórico; Etapa 8 descrita acima.

Validação da Etapa 6: 303 unitários e 209 HTTP aprovados; schema/client, tipos, lint e build aprovados. Formato dos arquivos alterados aprovado; npm run validate interrompe somente em agents.md preexistente, preservado. Há 25 casos PostgreSQL preparados (6 novos), nenhum executado por ausência do banco exclusivo/Docker; migration nova não aplicada. [Relatório, arquivos e decisões](docs/architecture/appointments-foundation.md). Não iniciou documentos/Etapa 7.

Validação da Etapa 5: 223 unitários e 182 HTTP aprovados; schema/client, tipos, lint, build e formatter aprovados. Check global só aponta agents.md preexistente. Migration nova preparada, não aplicada; 19 casos PostgreSQL preparados, nenhum executado por falta do banco exclusivo/Docker. [Arquivos, decisões e limitações](docs/architecture/medications-foundation.md). As contagens e migrations descritas nas validações anteriores são retratos históricos.

Versões conferidas no registro npm e na documentação oficial em **01/10/2026**, com dependências diretas fixadas e `package-lock.json` presente para instalações reproduzíveis:

| Componente                | Versão escolhida |
| ------------------------- | ---------------- |
| NestJS                    | 12.1.2           |
| Prisma / client / adapter | 7.10.0           |
| PostgreSQL local          | 18.6             |
| Node.js de referência     | 24.15.0 LTS      |
| TypeScript                | 6.0.3            |
| Jest                      | 30.5.2           |
| ESLint / Prettier         | 10.11.0 / 3.9.9  |
| Nodemailer / tipos        | 10.0.13 / 8.0.2  |

O tag `latest` do Prisma apontava para Prisma 8 RC; foi preferida a versão estável 7.10.0. TypeScript 6 é compatível com a faixa suportada pelo tooling escolhido, sem forçar TypeScript 7. O NestJS 12 publica pacotes ESM e suporta aplicações CommonJS no Node moderno; este projeto usa CommonJS com `NodeNext` e o cliente Prisma em `cjs`. Jest usa `--experimental-vm-modules` para carregar essas dependências, portanto um aviso experimental do Node durante os testes é esperado. A API compilada não precisa desse flag.

Dois `overrides` específicos corrigem dependências transitivas da ferramenta Prisma: `deepmerge-ts` 8.0.2 e `mysql2` 3.24.5. Geração/validação do Prisma e testes passaram com esses ajustes; revise os overrides ao atualizar Prisma, sem aplicar downgrade automático de versão principal. A auditoria local reportou zero vulnerabilidades no momento da verificação; isso é um retrato, não uma garantia permanente.

Referências: [migração NestJS 12](https://docs.nestjs.com/migration-guide), [headers de segurança](https://docs.nestjs.com/security/helmet), [validação](https://docs.nestjs.com/techniques/validation), [Prisma com NestJS](https://docs.prisma.io/docs/guides/frameworks/nestjs), [armazenamento de senhas OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [releases PostgreSQL](https://www.postgresql.org/docs/current/release.html), advisories [deepmerge-ts](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) e [mysql2](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3).
