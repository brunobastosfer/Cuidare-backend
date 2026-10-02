# CUIDARÊ — BACKEND V1

## Contexto geral do produto

Você está trabalhando no backend do **Cuidarê**, uma plataforma de acompanhamento da vida de uma pessoa e, principalmente, de seus dependentes.

A aplicação deverá centralizar informações relacionadas a:

- saúde;
- medicamentos;
- consultas;
- vacinação;
- documentos;
- atestados;
- relatórios escolares;
- desenvolvimento;
- marcos da criança;
- histórico cronológico;
- compartilhamento controlado de informações.

O caso de uso principal da V1 é um responsável criar sua conta, cadastrar um ou mais dependentes e manter o histórico deles desde o nascimento.

O sistema lidará com **dados pessoais, dados de crianças e dados pessoais sensíveis, especialmente dados de saúde**. Portanto, segurança, privacidade, rastreabilidade, controle de acesso e princípios da LGPD devem fazer parte da arquitetura desde a concepção.

## Stack já existente

O projeto já foi inicializado.

Não recrie o projeto.

Atualmente existe:

- NestJS;
- TypeScript strict;
- PostgreSQL;
- Prisma ORM;
- arquitetura MVC adaptada para API;
- controllers;
- services;
- models;
- repository;
- `repository/prismaRepository`;
- repository definido através de interfaces;
- autenticação JWT;
- Argon2id;
- validação;
- rate limiting;
- CORS;
- headers de segurança;
- tratamento de erros;
- migrations;
- Docker Compose;
- testes;
- CI.

Antes de implementar qualquer etapa:

1. examine todo o projeto atual;
2. compreenda a arquitetura existente;
3. identifique código que pode ser reutilizado;
4. não recrie funcionalidades existentes;
5. não altere padrões arquiteturais sem necessidade;
6. não quebre testes existentes;
7. execute lint, testes e build ao terminar;
8. adicione testes para tudo que for criado;
9. atualize README e documentação técnica quando necessário.

Adote preferencialmente um **monólito modular** nesta V1.

Não crie microsserviços.

Os módulos devem ter baixo acoplamento e limites claros para que possam ser extraídos no futuro, caso exista necessidade real.

---

# ETAPA 0 — AUDITORIA DO PROJETO ATUAL

Antes de desenvolver novas funcionalidades, realize uma auditoria da implementação atual.

Analise:

- estrutura de diretórios;
- módulos NestJS;
- controllers;
- services;
- repositories;
- DTOs;
- entities/models;
- Prisma schema;
- migrations;
- autenticação;
- autorização;
- JWT;
- refresh token, se existir;
- Argon2id;
- guards;
- interceptors;
- exception filters;
- validação;
- Helmet/headers;
- CORS;
- rate limit;
- configuração;
- secrets;
- logging;
- Docker;
- testes;
- CI;
- tratamento de erros;
- exposição de dados sensíveis.

Verifique principalmente riscos de:

- Broken Object Level Authorization;
- Broken Authentication;
- Broken Object Property Level Authorization;
- mass assignment;
- SQL injection;
- exposição excessiva de campos;
- brute force;
- enumeração de usuários;
- IDOR;
- upload malicioso;
- vazamento de tokens;
- logs contendo dados sensíveis;
- secrets versionados.

Não faça uma grande refatoração nesta etapa.

Crie:

`docs/architecture/current-state.md`

e

`docs/security/security-review.md`

Documente:

- arquitetura encontrada;
- pontos positivos;
- problemas encontrados;
- riscos;
- dívida técnica;
- recomendações;
- decisões que precisam ser tomadas nas próximas etapas.

Crie também:

`docs/architecture/v1-roadmap.md`

contendo os módulos planejados da V1.

Ao terminar, mostre um resumo das descobertas antes de continuar qualquer outra implementação.

---

# ETAPA 1 — FUNDAÇÃO DE DOMÍNIO

Implemente a fundação de domínio do Cuidarê.

Os principais conceitos iniciais serão:

- User
- Dependent
- UserDependentAccess
- Consent
- AuditLog

Não implemente ainda medicamentos, consultas, vacinas etc.

## User

Representa uma pessoa autenticada.

Campos mínimos:

- id
- name
- email
- passwordHash
- status
- emailVerifiedAt
- createdAt
- updatedAt
- deletedAt

Nunca retornar:

- passwordHash;
- refresh token;
- secrets;
- campos internos desnecessários.

E-mail deve possuir índice único considerando a estratégia definida para exclusão.

## Dependent

Representa uma pessoa acompanhada.

Campos iniciais:

- id
- fullName
- preferredName opcional
- birthDate
- relationship metadata quando aplicável
- createdByUserId
- createdAt
- updatedAt
- deletedAt

Não armazene CPF, RG, endereço ou outros dados que não sejam necessários para a V1.

Aplicar o princípio de minimização de dados.

## UserDependentAccess

Não coloque simplesmente:

`dependent.userId`

como única estratégia de autorização.

Crie uma relação explícita de acesso para permitir futuramente múltiplos responsáveis.

Exemplo conceitual:

User
↕

UserDependentAccess

↕

Dependent

Papéis iniciais:

- OWNER
- EDITOR
- VIEWER

A arquitetura deve permitir futuramente permissões mais granulares.

O usuário que cadastra o dependente recebe OWNER.

Toda operação envolvendo um dependente deve verificar essa relação.

Nunca confie apenas em `dependentId`.

## Consent

Crie estrutura para registrar eventos de consentimento/aceite relacionados a privacidade.

Exemplo:

- id
- userId
- dependentId opcional
- type
- policyVersion
- acceptedAt
- revokedAt
- metadata limitada

Não armazene dados técnicos excessivos desnecessários.

Não determine sozinho qual base legal deverá ser usada em cada tratamento.

Prepare a estrutura técnica para que a política jurídica possa ser configurada posteriormente.

## AuditLog

Criar uma trilha de auditoria para operações relevantes.

Registrar:

- actorId
- action
- resourceType
- resourceId
- dependentId quando aplicável
- timestamp
- metadata segura

Exemplos:

DEPENDENT_CREATED
DEPENDENT_UPDATED
DEPENDENT_DELETED
DOCUMENT_VIEWED
DOCUMENT_DOWNLOADED
SHARE_CREATED
SHARE_REVOKED
CONSENT_ACCEPTED

Nunca registrar:

- senha;
- JWT;
- refresh token;
- conteúdo completo de documentos;
- informações médicas completas;
- secrets;
- payload integral das requisições.

Criar testes garantindo isolamento entre usuários.

Um usuário A jamais poderá acessar o dependente do usuário B apenas descobrindo seu ID.

---

# ETAPA 2 — AUTENTICAÇÃO E SEGURANÇA DE CONTA

Analise a autenticação existente e evolua-a.

Manter Argon2id.

Implementar, se ainda não existir:

### Access token

Curta duração e configurável por variável de ambiente.

### Refresh token

Implementar:

- rotação;
- revogação;
- hash do refresh token armazenado no banco;
- múltiplas sessões;
- logout da sessão atual;
- logout de todas as sessões.

Nunca armazenar refresh token puro no banco.

Criar entidade/session model apropriado.

Implementar proteção contra:

- credential stuffing;
- brute force;
- enumeração de e-mails.

As respostas de login/recuperação não devem revelar desnecessariamente se determinado usuário existe.

Adicionar arquitetura para:

- verificação de e-mail;
- recuperação de senha;
- expiração de tokens de recuperação;
- token de uso único;
- armazenamento do hash desses tokens.

Não implementar MFA obrigatória na V1, mas deixar arquitetura compatível com futura MFA.

Criar testes de segurança.

---

# ETAPA 3 — PRIVACIDADE E LGPD

Crie um módulo:

`privacy`

Ele será responsável pela infraestrutura relacionada aos direitos dos titulares e governança de dados.

Implementar inicialmente:

### Exportação

Permitir que o usuário solicite uma exportação estruturada de seus dados e dos dependentes para os quais possui autorização adequada.

Formato inicial:

JSON.

Preparar arquitetura para futuramente PDF/ZIP.

### Exclusão de conta

Criar fluxo seguro de solicitação de exclusão.

Não execute exclusão física indiscriminada.

Criar estratégia documentada envolvendo:

- soft delete;
- anonimização quando aplicável;
- retenção configurável;
- eventual exclusão definitiva;
- dependências relacionadas;
- preservação necessária de registros técnicos ou jurídicos.

Não inventar prazos legais de retenção.

Os prazos deverão ser configuráveis e posteriormente validados juridicamente.

### Revogação de consentimento

Permitir registro da revogação quando o tratamento estiver baseado em consentimento.

### Registro das operações

Criar documentação:

`docs/lgpd/data-inventory.md`

Listar para cada entidade:

- dado coletado;
- finalidade;
- categoria;
- sensibilidade;
- origem;
- quem pode acessar;
- período de retenção configurável;
- destino;
- compartilhamento.

Criar também:

`docs/lgpd/privacy-by-design.md`

Documentando as medidas técnicas adotadas.

Não afirmar que o software está "100% em conformidade com a LGPD".

A implementação técnica deverá fornecer mecanismos para conformidade, mas decisões jurídicas precisam de validação jurídica.

---

# ETAPA 4 — LINHA DO TEMPO

Criar módulo:

`timeline`

A linha do tempo será uma das funcionalidades centrais do Cuidarê.

Ela deverá apresentar cronologicamente eventos associados ao dependente.

Exemplos futuros:

- medicamento iniciado;
- medicamento encerrado;
- consulta;
- vacina;
- documento;
- relatório escolar;
- marco de desenvolvimento.

Preferencialmente não crie uma grande tabela duplicando todas as informações dos demais módulos.

Analise uma estratégia de read model/agregação que permita produzir a timeline mantendo os módulos como fontes da verdade.

Defina uma interface comum semelhante conceitualmente a:

TimelineEvent

com:

- id;
- dependentId;
- type;
- title;
- eventDate;
- summary;
- sourceId;
- sourceType;
- createdAt.

Não colocar informações médicas completas na timeline.

A timeline deve trazer apenas o resumo necessário e permitir que os detalhes sejam consultados pelo endpoint específico, sujeito à autorização.

Permitir:

- paginação cursor-based;
- filtro por período;
- filtro por tipo;
- ordenação cronológica.

Criar índices adequados.

---

# ETAPA 5 — MEDICAMENTOS

Criar módulo:

`medications`

Diferenciar os conceitos:

### Medication

Medicamento/produto informado pelo usuário.

### MedicationTreatment

Uso daquele medicamento por um dependente.

Campos conceituais:

- dependentId
- medicationId ou medicationName
- dosage
- unit
- frequency
- route opcional
- startDate
- endDate
- continuousUse
- instructions
- prescribedBy opcional
- reason opcional
- notes opcional
- createdAt
- updatedAt
- deletedAt

Exemplos:

Vitamina D
2 gotas
1 vez ao dia
Uso contínuo

ou:

Ferro
1 gota/kg
1 vez ao dia

A aplicação NÃO deverá calcular dose médica automaticamente na V1.

Se a orientação for "1 gota por kg", armazenar isso como instrução.

Não transformar uma orientação em recomendação clínica automatizada.

Criar estados como:

- ACTIVE
- COMPLETED
- SUSPENDED

Registrar alterações importantes no AuditLog.

Gerar eventos correspondentes na timeline.

Permitir anexar futuramente uma receita/documento através do módulo de documentos.

---

# ETAPA 6 — CONSULTAS

Criar módulo:

`appointments`

Uma consulta deverá possuir:

- id
- dependentId
- date
- specialty opcional
- professionalName opcional
- institutionName opcional
- reason
- notes
- recommendations
- followUpDate opcional
- createdAt
- updatedAt
- deletedAt

Criar estrutura para recomendações separadas quando isso fizer sentido.

Exemplo:

MedicalRecommendation:

- appointmentId
- title
- description
- status
- startDate
- endDate opcional

Status:

- PENDING
- IN_PROGRESS
- COMPLETED
- CANCELLED

Isso será importante futuramente para permitir que responsáveis e escolas acompanhem atividades recomendadas por profissionais.

Não diagnosticar.

Não criar conteúdo médico automaticamente.

O sistema registra informações fornecidas pelo usuário.

Integrar consultas e recomendações à timeline.

---

# ETAPA 7 — DOCUMENTOS E UPLOAD SEGURO

Criar módulo:

`documents`

Documentos NÃO devem ser armazenados diretamente como blob na tabela principal do PostgreSQL.

Criar abstração:

`FileStorageRepository`

com implementação inicial configurável.

Permitir posteriormente:

- AWS S3;
- Azure Blob Storage;
- Google Cloud Storage;
- armazenamento compatível com S3.

Não acoplar a regra de negócio a um fornecedor específico.

Entidade Document:

- id
- dependentId
- category
- title
- description opcional
- storageKey
- originalFileName
- mimeType
- size
- checksum
- createdByUserId
- documentDate opcional
- createdAt
- updatedAt
- deletedAt

Categorias iniciais:

- PRESCRIPTION
- MEDICAL_REPORT
- EXAM
- MEDICAL_CERTIFICATE
- SCHOOL_REPORT
- VACCINE_RECORD
- OTHER

Implementar segurança de upload:

- limite de tamanho configurável;
- whitelist de MIME types;
- validar conteúdo, não somente extensão;
- nomes de arquivo gerados pelo servidor;
- nunca utilizar diretamente o nome fornecido pelo usuário como storage key;
- impedir path traversal;
- checksum;
- preparar hook para antivírus/malware scanning;
- bloquear tipos executáveis;
- URLs temporárias/signed URLs quando suportado;
- autorização antes de gerar URL;
- impedir bucket/storage público.

Todo acesso a documentos deverá validar permissão do usuário sobre o dependente.

Registrar download/visualização quando apropriado no AuditLog.

---

# ETAPA 8 — VACINAS

Criar módulo:

`vaccinations`

Separar:

### VaccineCatalog

Catálogo de referência.

### VaccineSchedule

Recomendação/calendário versionado.

### DependentVaccination

Registro efetivamente informado pelo responsável.

Não codifique o calendário vacinal diretamente na regra de negócio.

O calendário muda ao longo do tempo.

Toda referência deverá possuir:

- source;
- sourceVersion;
- validFrom;
- validUntil opcional.

Preparar suporte a:

- calendário público;
- calendário privado/complementar.

Não inventar vacinas ou calendários durante esta implementação.

Se não houver uma fonte oficial previamente validada para seed, crie somente a estrutura e dados fictícios exclusivamente nos testes.

DependentVaccination poderá conter:

- dependentId
- vaccineId
- dose
- administeredAt
- institutionName opcional
- batchNumber opcional
- notes
- documentId opcional

Preparar serviço capaz de determinar:

- registrada;
- prevista;
- atrasada;

com base em um calendário versionado.

Não gerar aconselhamento médico.

Mostrar sempre a origem e versão do calendário utilizado.

Integrar vacina aplicada à timeline.

---

# ETAPA 9 — RELATÓRIOS ESCOLARES

Criar módulo:

`education`

Na V1 não haverá conta institucional de escola.

As informações serão cadastradas pelo responsável.

Criar inicialmente:

### SchoolEnrollment

- dependentId
- schoolName
- schoolYear
- grade/class opcional
- startDate
- endDate opcional

### SchoolReport

- dependentId
- enrollmentId opcional
- title
- reportDate
- summary opcional
- observations opcional
- documentId opcional

Não criar ainda:

- portal da escola;
- login de professor;
- integração escolar;
- notas automáticas;
- APIs externas.

Deixar o domínio preparado para evolução futura.

Adicionar relatórios escolares à timeline.

---

# ETAPA 10 — MARCOS DO DESENVOLVIMENTO

Criar módulo:

`development`

Separar:

### DevelopmentMilestoneCatalog

Referência do marco esperado.

### DependentMilestone

Observação realizada pelo responsável.

O catálogo deverá possuir:

- title
- description
- ageRangeStart
- ageRangeEnd
- category
- source
- sourceVersion

Categorias poderão incluir:

- MOTOR
- LANGUAGE
- COGNITIVE
- SOCIAL
- EMOTIONAL

Não colocar conteúdo médico inventado em migrations/seeds.

Estruturar para posteriormente importar referências de fontes confiáveis.

DependentMilestone:

- dependentId
- milestoneId
- status
- observedAt opcional
- notes opcional

Status:

- NOT_OBSERVED
- OBSERVED
- NOT_APPLICABLE

Não utilizar termos como "atrasado" ou gerar diagnóstico automaticamente.

A funcionalidade é de acompanhamento e organização, não de diagnóstico.

Registrar observações importantes na timeline.

---

# ETAPA 11 — COMPARTILHAMENTO BÁSICO

Criar módulo:

`sharing`

A privacidade deve ser prioridade.

Na V1 implementar compartilhamento somente leitura.

Permitir ao responsável compartilhar informações de um dependente através de um link seguro.

Um compartilhamento deve possuir:

- id
- dependentId
- createdByUserId
- tokenHash
- expiresAt
- revokedAt
- createdAt

Nunca armazenar token puro.

O token entregue ao usuário deve possuir alta entropia criptográfica.

Permitir selecionar os módulos compartilhados:

- PROFILE
- MEDICATIONS
- APPOINTMENTS
- VACCINATIONS
- DOCUMENTS
- EDUCATION
- DEVELOPMENT

Por padrão:

nenhum módulo deve ser compartilhado implicitamente.

O responsável deverá selecionar explicitamente.

Permitir definir:

- data de expiração;
- revogação imediata.

O acesso compartilhado deve ser read-only.

Registrar acesso relevante no AuditLog sem coletar informações excessivas.

Implementar rate limiting específico.

Não permitir que um token de compartilhamento seja utilizado para descobrir outros recursos.

Não retornar IDs ou campos internos que não sejam necessários.

Preparar arquitetura futura para compartilhamento com:

- escola;
- professor;
- médico;
- outro responsável;

mas NÃO implementar esses perfis nesta etapa.

---

# ETAPA 12 — AUTORIZAÇÃO CENTRALIZADA

Revise todos os módulos implementados.

Crie uma camada consistente de autorização.

Evite código espalhado como:

`if (entity.userId !== user.id)`

em dezenas de services.

Criar Policies/AuthorizationService/Guards adequados à arquitetura NestJS.

Exemplo conceitual:

`canReadDependent(userId, dependentId)`

`canEditDependent(userId, dependentId)`

`canDeleteDependent(userId, dependentId)`

`canManageSharing(userId, dependentId)`

Todo endpoint que recebe IDs de recursos deverá primeiro estabelecer a relação daquele recurso com um dependente e depois verificar autorização.

Crie testes especificamente para:

User A
Dependent A

User B
Dependent B

O User A tenta:

- consultar B;
- alterar B;
- apagar B;
- listar medicamentos de B;
- acessar consulta de B;
- baixar documento de B;
- consultar relatório de B;
- acessar vacina de B;
- criar compartilhamento de B.

TODOS deverão falhar.

Faça também testes para UUIDs aleatórios e recursos inexistentes evitando vazamento de informação através de mensagens diferentes quando não necessário.

---

# ETAPA 13 — API E PADRONIZAÇÃO

Padronizar API REST.

Utilizar versionamento:

`/api/v1/...`

Exemplos:

`/api/v1/auth`

`/api/v1/me`

`/api/v1/dependents`

`/api/v1/dependents/:dependentId/medications`

`/api/v1/dependents/:dependentId/appointments`

`/api/v1/dependents/:dependentId/vaccinations`

`/api/v1/dependents/:dependentId/documents`

`/api/v1/dependents/:dependentId/education`

`/api/v1/dependents/:dependentId/development`

`/api/v1/dependents/:dependentId/timeline`

`/api/v1/dependents/:dependentId/shares`

Implementar:

- DTOs separados para create/update/response;
- whitelist de propriedades;
- transformação segura;
- paginação padronizada;
- cursor pagination onde apropriado;
- filtros validados;
- error response padronizado;
- correlation/request ID;
- Swagger/OpenAPI.

Swagger não deverá expor secrets.

Em produção, Swagger deverá ser desabilitável via configuração ou protegido conforme estratégia definida.

---

# ETAPA 14 — OBSERVABILIDADE E LOGS

Implementar logging estruturado.

Nunca registrar:

- Authorization header;
- JWT;
- refresh token;
- senha;
- conteúdo de receita;
- laudo;
- relatório médico;
- relatório escolar completo;
- conteúdo de documentos;
- dados sensíveis desnecessários.

Implementar sanitização/redaction.

Logs devem conter, quando apropriado:

- timestamp;
- requestId;
- route;
- statusCode;
- duration;
- actorId pseudonimizado/ID interno quando necessário;
- evento técnico.

Criar health checks:

`/health/live`

`/health/ready`

O readiness pode verificar PostgreSQL.

Preparar aplicação para ferramentas futuras de observabilidade sem acoplar o domínio.

---

# ETAPA 15 — BANCO DE DADOS E PERFORMANCE

Revisar schema Prisma completo.

Adicionar índices para padrões reais de consulta.

Avaliar índices especialmente em:

- dependentId;
- userId;
- createdAt;
- eventDate;
- deletedAt;
- status;
- relações de autorização.

Evitar over-indexing.

Garantir:

- foreign keys;
- constraints;
- cascades analisadas cuidadosamente;
- integridade referencial;
- migrations reversíveis quando possível;
- migrations sem perda acidental de dados.

Não utilizar cascade delete indiscriminadamente para dados sensíveis ou auditáveis.

Documentar decisões.

---

# ETAPA 16 — TESTES

Criar estratégia completa de testes.

Manter:

- unit tests;
- integration tests;
- e2e tests.

Os testes E2E deverão utilizar PostgreSQL real através do ambiente de testes/Docker quando disponível.

Cobrir principalmente:

### Autenticação

- cadastro;
- login;
- logout;
- refresh;
- refresh rotation;
- token expirado;
- token revogado;
- recuperação de senha.

### Autorização

- owner;
- editor;
- viewer;
- usuário sem acesso;
- acesso cruzado entre dependentes.

### Medicamentos

CRUD + autorização.

### Consultas

CRUD + autorização.

### Documentos

upload + autorização + validação.

### Vacinas

registro + autorização.

### Relatórios escolares

CRUD + autorização.

### Desenvolvimento

CRUD + autorização.

### Timeline

ordenação + paginação + autorização.

### Sharing

criação;
expiração;
revogação;
token inválido;
token expirado;
escopo de módulos.

### LGPD

exportação;
solicitação de exclusão;
revogação de consentimento.

Criar testes de regressão para vulnerabilidades encontradas durante a auditoria.

---

# ETAPA 17 — HARDENING DE SEGURANÇA

Faça uma revisão final de segurança da V1.

Basear a análise, entre outras referências, no OWASP API Security Top 10.

Verificar:

- Broken Object Level Authorization;
- Broken Authentication;
- Broken Object Property Level Authorization;
- unrestricted resource consumption;
- SSRF quando aplicável;
- misconfiguration;
- injection;
- mass assignment;
- excessive data exposure;
- rate limiting;
- upload;
- secrets;
- CORS;
- headers;
- error handling.

Executar:

- lint;
- typecheck;
- testes;
- build;
- npm audit ou ferramenta equivalente;
- verificação de dependências.

Não altere automaticamente uma dependência major apenas para zerar alertas.

Analise impacto antes.

Criar:

`docs/security/threat-model.md`

Utilize uma metodologia como STRIDE ou equivalente e avalie pelo menos:

- autenticação;
- dependentes;
- documentos;
- compartilhamento;
- saúde;
- endpoints públicos.

Criar:

`docs/security/security-checklist.md`

---

# ETAPA 18 — DOCUMENTAÇÃO FINAL

Atualize o README com:

## Cuidarê

### Objetivo

Centralização de informações relacionadas à saúde, desenvolvimento e vida escolar de pessoas e seus dependentes.

### Arquitetura

Descrever o monólito modular.

### Módulos

- auth
- users
- dependents
- privacy
- timeline
- medications
- appointments
- documents
- vaccinations
- education
- development
- sharing
- audit

### Stack

Documentar stack efetivamente instalada, lendo `package.json`.

Não inventar versões.

### Setup

Documentar:

- Node;
- banco;
- Docker;
- `.env`;
- migrations;
- seed;
- testes;
- execução.

Criar `.env.example` sem secrets reais.

Documentar variáveis.

Criar:

`docs/architecture/overview.md`

incluindo diagrama Mermaid.

Criar também:

`docs/database/erd.md`

com ERD em Mermaid.

---

# REGRAS GERAIS PARA TODAS AS ETAPAS

Estas regras têm prioridade durante toda a implementação.

## 1. Não confiar no cliente

Nunca confiar em:

- userId;
- ownerId;
- role;
- permissões;
- dependentId relacionado;
- MIME type;
- nomes de arquivos;

quando enviados pelo frontend.

Derivar identidade e autorização no backend.

## 2. Menor privilégio

Usuários devem acessar somente o necessário.

## 3. Privacy by Design

Coletar somente os dados necessários.

## 4. Privacy by Default

As configurações padrão devem ser as mais privadas.

## 5. Dados de crianças

Considerar o melhor interesse da criança em decisões de produto e tratamento de dados.

## 6. Saúde

Considerar dados relacionados à saúde como altamente sensíveis.

## 7. Logs

Não registrar conteúdo sensível desnecessariamente.

## 8. IDs

Utilizar IDs não sequenciais apropriados para recursos expostos.

Mesmo assim, nunca considerar UUID como mecanismo de autorização.

## 9. DTO

Nunca retornar entidades Prisma diretamente sem avaliar os campos expostos.

Utilizar DTO/serializer apropriado.

## 10. Repository

Manter regra definida no projeto:

interfaces ficam em `repository`.

Implementações Prisma ficam em:

`repository/prismaRepository`.

Services dependem das abstrações e não diretamente do Prisma quando a arquitetura existente determinar isso.

## 11. Controllers

Controllers devem ser finos.

Não colocar regra de negócio significativa dentro deles.

## 12. Services

Regras de negócio ficam nos services/use cases conforme arquitetura existente.

## 13. Prisma

Não espalhar Prisma Client por todos os módulos.

Centralizar sua utilização na camada de infraestrutura/repositories conforme padrão do projeto.

## 14. Transações

Usar transações para operações que precisam ser atômicas.

## 15. Datas

Armazenar timestamps de sistema em UTC.

Datas conceituais como `birthDate` devem utilizar tipo apropriado evitando problemas desnecessários de timezone.

## 16. Soft delete

Queries normais não devem retornar registros excluídos.

Centralizar estratégia para reduzir risco de esquecimento.

## 17. Medical safety

O Cuidarê registra e organiza informações.

Não implementar:

- diagnóstico;
- prescrição;
- recomendação automática de medicamento;
- cálculo automático de dose;
- decisão clínica.

## 18. Referências externas

Vacinas e marcos de desenvolvimento deverão possuir origem e versão.

Não hardcode informações médicas sem origem validada.

## 19. Dependências

Não instalar biblioteca sem necessidade.

Antes de adicionar um pacote:

- verificar se o Nest/Node já resolve;
- justificar a dependência;
- verificar manutenção e segurança.

## 20. Qualidade

Ao terminar CADA etapa:

1. executar formatter;
2. executar lint;
3. executar typecheck;
4. executar testes;
5. executar build;
6. informar arquivos criados;
7. informar arquivos alterados;
8. informar migrations criadas;
9. informar testes adicionados;
10. informar decisões arquiteturais tomadas;
11. informar pendências ou riscos encontrados.

Se Docker/PostgreSQL estiver indisponível, não finja que testes de integração foram executados.

Informe claramente quais verificações não puderam ser realizadas.

---

# RESTRIÇÕES DA V1

NÃO implementar nesta versão:

- portal de escolas;
- login de professores;
- login de médicos;
- prontuário eletrônico médico;
- diagnóstico por IA;
- recomendação médica por IA;
- cálculo automático de doses;
- chat médico;
- telemedicina;
- integração com hospitais;
- integração com laboratórios;
- integração automática com escolas;
- microsserviços;
- Kafka;
- event sourcing completo;
- blockchain;
- sistemas complexos de filas sem necessidade real.

Manter o sistema simples, seguro e evolutivo.

---

# CRITÉRIO FINAL DE ACEITE DA V1

A V1 estará funcional quando for possível:

1. criar uma conta;
2. autenticar-se com segurança;
3. cadastrar um dependente;
4. visualizar seu perfil;
5. cadastrar medicamentos;
6. cadastrar consultas e recomendações;
7. cadastrar vacinas;
8. enviar documentos;
9. cadastrar relatórios escolares;
10. acompanhar marcos do desenvolvimento;
11. visualizar tudo cronologicamente na timeline;
12. compartilhar seletivamente informações através de link temporário e revogável;
13. exportar dados;
14. solicitar exclusão;
15. manter trilha de auditoria;
16. impedir acesso entre usuários não autorizados;
17. possuir documentação OpenAPI;
18. possuir migrations reproduzíveis;
19. possuir testes automatizados;
20. possuir documentação de arquitetura, segurança e privacidade.

A segurança dos dados e o isolamento entre usuários têm prioridade maior que conveniência de implementação.