# Revisão de segurança — Etapa 0

Data: 01/10/2026. Estado: auditoria da base existente, **não hardening final nem certificação de conformidade**. Novas funcionalidades e correções de runtime ficaram fora desta etapa.

Nota posterior — Etapa 1: implementados vínculo de acesso a dependentes, soft delete, auditoria de escritas, estrutura de aceites e consulta de estado do usuário no guard. Isso trata partes de SEC-01/02/03/08/09, **não encerra os achados**: sessões/privacidade/operação ainda estão incompletas e integração PostgreSQL não foi executada. O detalhe, evidências e limites estão na [fundação de domínio](../architecture/domain-foundation.md). Os achados abaixo permanecem como retrato da auditoria original.

Nota posterior — Etapa 2: sessões, refresh rotativo/revogável, logout, confirmação/recuperação hash-only, respostas neutras e limites persistentes de tentativas foram implementados, tratando partes de SEC-01/04/05. **Não representa encerramento final dos achados**: faltam PostgreSQL/SMTP reais, avaliação de abuso/carga e operação segura. Veja [segurança de conta](../architecture/account-security.md). A listagem original permanece histórica.

Nota posterior — Etapa 3: mecanismos de privacidade implementados tratam parte da governança técnica, sem encerrar SEC-08/09 nem certificar conformidade. Exportação limitada/reautenticada, revogação por escopo e pedido de exclusão com soft delete/audit; revisão final/retention/canal jurídico e PostgreSQL real continuam pendentes. Veja [privacidade](../architecture/privacy-foundation.md) e [inventário](../lgpd/data-inventory.md).

Nota posterior — Etapa 4: timeline usa autorização de vínculo na transação e filtro de escopo no repository da fonte, projeção mínima/allowlist, limit até 100 e cursor HMAC vinculado ao titular/dependente/filtros/ordem. Cursor não é credencial nem dado cifrado; URLs/metadados precisam proteção no proxy/analytics. Não expõe AuditLog ou conteúdo clínico integral. Veja [decisões, testes e limites](../architecture/timeline-foundation.md); não encerra os riscos operacionais nem substitui testes PostgreSQL.

## Método e limites

Nota posterior — Etapa 9 (02/10/2026): matrículas e relatórios usam vínculo/papel no serviço e SQL, DTOs/allowlists/projeções explícitos, transação Serializable com audit minimizado e FKs compostas de matrícula/documento/dependente. Texto escolar não entra em timeline ou audit; exportação 1.5 exige senha/OWNER selecionado. Relatório sobrevive ao soft delete da matrícula, sem ressuscitar vínculo arquivado. [Evidências, decisões e riscos](../architecture/education-foundation.md). Controle técnico não prova representação/autenticidade; PostgreSQL real, governança e controles operacionais permanecem pendentes. Não encerra achados nem inicia desenvolvimento.

Nota posterior — Etapa 8 (02/10/2026): vacina informada tem vínculo/papel no service e SQL, DTO/view/allowlist, soft delete/audit atômico; documento do mesmo dependente também protegido por FK composta. Referências só leitura autenticada, revisão explícita, origem/versão/vigência, sem seed médico. Comparação limitada sem truncar; não recomenda ou confirma imunização. [Decisões, evidências e riscos](../architecture/vaccinations-foundation.md). Imutabilidade/publicação/importação de referências exigem processo humano/credenciais separadas; operação e PG real seguem pendentes. Não encerra os achados originais.

Nota posterior — Etapa 7: documents acrescenta guard antes de multipart, conferência de conteúdo/tamanho/partes, keys do servidor, SHA-256, storage privado e scan obrigatório fail-closed. BOLA/papéis são rechecados no commit e após IO do download; audit sem nomes/bytes; quotas incluem soft delete. [Decisões, evidências e riscos residuais](../architecture/documents-foundation.md). A triagem não é parser/CDR ou detecção universal de malware; ClamAV real, ACL NTFS, backup/restauração, quotas globais/gateway, reconciliação de órfãos e PostgreSQL real ainda pendentes. SEC-06/07/08/09 não estão encerrados. Nenhum scanner público ou signed URL foi habilitado.

Nota posterior — Etapa 6: consultas/recomendações mantêm vínculo/papel, FK composta consulta/dependente, campos de escrita/resposta enumerados e soft delete; audit só registra IDs/ações/nomes de campos. Timeline não contém profissionais, motivos/notas ou descrições; exportação 1.2 selecionada OWNER inclui esses dados informados. Testes cobrem troca de pai/dependente, papéis, retirada de acesso, mass assignment, datas e rollback; ver [evidências e limitações](../architecture/appointments-foundation.md). Integração real/concorrência/PostgreSQL, governança jurídica e proteção operacional permanecem pendentes.

Nota posterior — Etapa 5: módulo de medicamentos aplica produto/dependente por FK composta, papéis/vínculos no repository, DTOs estritos, exclusão lógica e audit transacional sem dados clínicos. Timeline não expõe orientação completa; exportação de saúde é opt-in OWNER/reautenticada e versionada 1.1. Há regressões para IDOR entre dependentes próprios/A/B, permissões, timestamps/datas, mass assignment e falhas de auditoria. [Decisões, migration e evidências](../architecture/medications-foundation.md); testes PostgreSQL/concorrência real e governança jurídica/operacional ainda pendentes, sem certificação de segurança.

Foram examinados todos os fontes próprios de `src` (exceto código gerado), contratos e implementações de repository, DTOs, schema/migration, testes/helpers, configuração, scripts, Compose, workflow, lockfile/metadados de dependências, README, SECURITY e `agents.md`. A revisão combinou leitura de código, verificações existentes e uma sonda HTTP isolada em memória; não houve teste invasivo, carga, acesso a dados reais, instalação, alteração de segredos ou migração de banco.

As categorias do [OWASP API Security Top 10 2023](https://api-security.owasp.org/editions/2023/en/0x11-t10/) organizam a análise de autenticação, acesso a objetos/propriedades, consumo de recursos e configuração. Os achados abaixo são avaliações sobre o código local, não resultados de pentest de uma implantação pública.

**Alta** indica bloqueador recomendado antes de dados reais de crianças/saúde; **média**, risco relevante ou cobertura incompleta; **baixa**, dívida de manutenção/verificação. Lacuna de módulo futuro não é apresentada como endpoint vulnerável já existente. Riscos de infraestrutura são condicionais à implantação, que não foi inspecionada.

## Controles positivos encontrados

- Guard JWT global, depois do throttling, com liberação pública explícita. Assinatura, HS256 permitido, expiração obrigatória, issuer, audience e subject UUID são verificados.
- Argon2id com salt, 64 MiB, três iterações e paralelismo 1; hash dummy para login sem usuário; mensagem de credenciais uniforme. Não se deve inferir tempo constante de toda a aplicação.
- `ownerId` derivado do guard; filtros `{ id, ownerId }` nas leituras, updates e deletes. Escritas atômicas evitam uma consulta de autorização seguida de alteração sem escopo.
- Whitelist de DTOs com rejeição de campos extras, bounds de strings/paginação/JSON e projeção de updates parciais.
- Views explícitas: senha/hash não saem de `userView`; owner não sai de `careTaskView`.
- Operações Prisma parametrizadas, sem `$queryRaw`/`$executeRaw` ou SQL concatenado na aplicação inspecionada.
- Headers nativos de segurança do Nest, CSP, proteção de frames, ausência de `X-Powered-By` e respostas `no-store`. Não instalar Helmet adicional apenas por nome: o controle já existe.
- CORS de origens exatas, cookies desabilitados e `trust proxy` falso por padrão. Native clients sem Origin são permitidos; isso não é bypass de autenticação.
- Erros inesperados HTTP retornam mensagem genérica; logs do filtro contêm somente evento, status e request ID.
- `.env.example` usa placeholders; setup usa gerador criptográfico e preserva arquivo existente. `.gitignore` exclui `.env` e variantes, logs, builds e client gerado.
- Compose local expõe PostgreSQL somente no loopback, usa SCRAM e volume persistente. CI usa Actions fixadas por commit, token read-only e banco descartável declarado.

## Cobertura dos riscos solicitados

| Risco / área                      | Situação encontrada                                                                     | Limitação / próxima ação                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| BOLA / IDOR                       | Filtros por proprietário e testes A/B no CRUD atual                                     | Não generalizar a garantia a dependentes/documentos, que ainda não existem          |
| Broken Authentication             | Verificação criptográfica correta; sessão sem revogação/status                          | SEC-01                                                                              |
| BOPLA / mass assignment           | `role`/`ownerId` extras recusados; updates projetados                                   | Políticas por campo/role serão necessárias quando houver acesso compartilhado       |
| SQL injection                     | Nenhum SQL raw ou concatenado encontrado nos fluxos atuais                              | Revisar imports, filtros e queries raw futuras                                      |
| Exposição excessiva               | Views selecionam campos; sem hash nas views atuais                                      | Teste de não exposição tem um ponto cego, SEC-09                                    |
| Brute force / credential stuffing | Login 5/min, cadastro 3/min, por IP/handler                                             | IP distribuído, custo/concurrency e multi-instância, SEC-05                         |
| Enumeração de usuários            | Login uniforme; cadastro distingue email duplicado                                      | SEC-04                                                                              |
| Upload malicioso / path traversal | Não há endpoint de upload ou storage                                                    | Não aplicável à base; bloquear liberação do módulo futuro sem controles específicos |
| Vazamento de tokens               | Apenas resposta de sessão e header Bearer; sem URL/cookie de autenticação               | Cliente, proxy, APM e backups não foram auditados; rotação ausente                  |
| Logs sensíveis                    | Filtro HTTP não registra corpo/token/SQL                                                | Logger de bootstrap/framework não tem redaction central, SEC-07                     |
| Secrets versionados               | Nenhuma repetição dos segredos locais fora de `.env` encontrada na varredura delimitada | Sem Git/histórico, não há como confirmar ausência em commits/artefatos remotos      |
| CORS / headers / Swagger          | Restrição explícita, headers existentes, Swagger proibido em produção                   | Validar no proxy; headers não implementam HTTPS                                     |
| SSRF / terceiros                  | Não há fetch de URL de usuário nem integração de negócio externa                        | Reavaliar importação de documentos, callbacks e provedores futuros                  |
| Integridade / exclusão            | FK e filtros presentes; exclusão física/cascade                                         | SEC-08                                                                              |
| LGPD / rastreabilidade            | Guia operacional orienta cuidados; mecanismos do produto ausentes                       | SEC-02 e SEC-03                                                                     |

## Achados prioritários

### SEC-01 — Tokens não acompanham estado da conta ou revogação

**Alta — lacuna confirmada de ciclo de vida da autenticação.** Evidências: `src/modules/auth/jwt-auth.guard.ts:38–47`, `auth.service.ts:36–42`, `src/repository/user.repository.ts` e modelo `User` no schema.

O guard valida assinatura/claims, mas não consulta existência/status do usuário nem uma sessão ativa. Não existem refresh tokens, session model, logout/revogação, recuperação de senha, email verificado ou rotação de chaves. Tokens emitidos permanecem aceitos até expirar, mesmo se o usuário for removido diretamente. O TTL reduz a janela, mas não implementa cancelamento imediato.

Uma sonda isolada usou a chave **fictícia de testes**, JWT corretamente assinado e UUID sem usuário correspondente: `GET /api/v1/care-tasks` retornou 200 com lista vazia. Isso demonstra ausência de verificação de usuário ativo; **não demonstra forjar assinatura, descobrir dados de outro owner ou explorar produção**. Nenhum token ou segredo foi impresso/persistido.

Recomendação para Etapas 1–2: status de conta, sessão revogável, refresh de alta entropia armazenado apenas como hash, rotação/reuse detection, logout individual/global e estratégia de invalidar access tokens. Definir comportamento de recuperação/exclusão da conta e rotação de chaves. Regressão necessária: token de conta excluída/bloqueada ou sessão revogada não autoriza operações.

### SEC-02 — Isolamento atual não cobre o domínio de dependentes

**Alta — requisito futuro, não vulnerabilidade em endpoint existente.** Evidências: `prisma/schema.prisma:11–34`, `src/modules/care-tasks/care-tasks.service.ts`, `repository/prismaRepository/prisma-care-task.repository.ts`.

Só existe ownership de `CareTask` por `User`. Não há `Dependent`, relação `UserDependentAccess`, papéis ou policies. Reutilizar apenas `dependent.userId` impediria o modelo de múltiplos responsáveis e aumentaria risco de regras inconsistentes entre módulos.

Recomendação: relação explícita OWNER/EDITOR/VIEWER, autorização desde a primeira operação e escopo do dependente também no repository. Criar dependente, owner e auditoria de modo transacional. A Etapa 12 consolida/revisa políticas, sem deixar módulos anteriores desprotegidos. Testar IDs de objetos de outros usuários, recursos inexistentes e alterações de campos internos.

### SEC-03 — Privacidade e auditoria ainda são orientação, não mecanismos

**Alta — bloqueador de prontidão para dados reais da V1.** Evidências: ausência de `Consent`, `AuditLog` e módulo privacy no schema/fontes; `SECURITY.md` descreve requisitos ainda não implementados.

Não há registro de aceites/revogações, exportação, solicitação de exclusão, retenção, inventário de dados ou trilha de leitura/alteração/compartilhamento. Request ID e logs 5xx não substituem esses mecanismos.

Recomendação: construir fundação/consentimentos/audit na Etapa 1 e privacy na Etapa 3; definir acesso, retenção e integridade do próprio audit. Metadados devem ser minimizados, sem payloads médicos, senha, JWT ou conteúdo de documentos.

A [LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) trata saúde como dado sensível, estabelece princípios de necessidade/segurança e proteção de dados desde a concepção. A [orientação da ANPD sobre crianças e adolescentes](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-divulga-enunciado-sobre-o-tratamento-de-dados-pessoais-de-criancas-e-adolescentes) enfatiza o melhor interesse. Essas referências motivam os controles técnicos; **não definem automaticamente a base legal de cada tratamento**. Finalidades, representação de responsáveis, direitos, retenção e eventuais transferências devem ser validados juridicamente. Não foram escolhidos prazos legais nem declarada conformidade integral.

### SEC-04 — Cadastro permite enumeração de email

**Média — comportamento confirmado por teste existente.** Evidências: `auth.service.ts:20–26`, `prisma-operation.ts`, `http-exception.filter.ts:43–45` e `test/api.e2e-spec.ts:98–105`.

Email novo retorna 201/sessão; duplicado retorna 409. Mensagem genérica evita detalhes do banco, mas o status ainda revela existência de conta. Limite por IP reduz velocidade, não elimina enumeração distribuída.

Recomendação para Etapa 2: decidir resposta uniforme e fluxo de verificação/continuação apropriado ao produto. Login e recuperação devem continuar sem revelar existência. Documentar tradeoff de experiência sem afirmar que trocar apenas a frase resolve o problema.

### SEC-05 — Limites não são uma proteção global/distribuída de recursos

**Média; alta se exposto publicamente sem proteção adicional.** Evidências: `app.module.ts`, decorators de `auth.controller.ts`, `PasswordService` e storage/key generation do throttler instalado.

O limite é por IP e handler, em memória de cada processo. Reiniciar limpa contadores; várias réplicas e IPs distribuídos não compartilham orçamento. Cada verificação Argon2 consome recursos significativos. Não há controle explícito de concorrência/fila, limites por conta com proteção contra lockout abusivo ou detecção de credential stuffing. O parser processa o corpo antes do guard; o bound JSON ajuda, mas o rate limiter não cobre sozinho toda a camada HTTP.

Recomendação: orçamento e concorrência no gateway, timeout/body limits, configuração validada de proxy e, quando existir mais de uma instância, storage compartilhado. Medir Argon2 no ambiente alvo, sem reduzir a proteção indiscriminadamente. Testar `Retry-After`, spoofing de IP, múltiplas réplicas e cenários de abuso sem atacar ambientes reais.

### SEC-06 — Produção depende de controles de infraestrutura não fornecidos

**Alta se Compose/.env local forem reutilizados como produção; não indica exposição pública atual.** Evidências: `compose.yml`, `src/database/prisma.service.ts`, `src/config/environment.ts` e `scripts/setup-env.cjs`.

Compose provisiona usuário administrativo e não configura TLS de banco, backups, gestão de chaves, limites de recursos ou imagem da API com usuário não-root. A API não configura HTTPS; TLS depende da implantação. `MIGRATION_DATABASE_URL` possibilita separar identidades, mas não cria permissões. O validador mede tamanho do segredo JWT, não sua entropia. A imagem PostgreSQL está fixada por tag, não digest.

Recomendação: API com menor privilégio, usuário DDL separado, rede privada, TLS com certificado validado, secrets gerenciados, backups/restauração e hardening de deploy. No Windows, `0600` do script não comprova ACL NTFS segura. Validar proxy por topologia real; hops numéricos só são seguros com caminhos controlados. Não houve inspeção de infraestrutura produtiva nesta etapa.

### SEC-07 — Redaction de logs não cobre bootstrap/framework

**Média — caminho sem sanitização confirmado por inspeção; nenhum vazamento real observado.** Evidências: `src/main.ts:10–24`, `HttpExceptionFilter` e `node_modules/@nestjs/core/errors/exception-handler.js` / `exceptions-zone.js` da versão instalada.

O filtro HTTP evita payload/stack do driver, mas não intercepta bootstrap ou hooks de inicialização. `NestFactory` usa o logger padrão; seu handler registra a exceção recebida antes do tratamento externo. Portanto, a mensagem genérica do `bootstrap().catch` não garante sanitização de toda saída do processo. Exceções HTTP deliberadas também repassam a mensagem definida pelo código, exigindo disciplina ao criar novas exceções.

Recomendação para Etapa 14 e hardening pré-dados reais: logger estruturado com redaction allowlist também em bootstrap, dependências, proxy/APM e tarefas assíncronas. Testar erros sentinela sem secrets reais em logs e respostas. Registrar métricas/401/429 de forma minimizada para investigar abuso; hoje não há observabilidade de segurança completa.

### SEC-08 — Exclusão física e cascade sem política de retenção

**Média na base; alta ao reutilizar para histórico sensível/auditável.** Evidências: DELETE de `CareTasksService`, `PrismaCareTaskRepository.deleteByOwner` e `prisma/schema.prisma:28` / migration inicial.

A API apaga cuidados fisicamente. Exclusão de usuário no banco apaga cuidados em cascade. Não há soft delete, solicitação de exclusão, tombstone, retenção configurável ou evento de auditoria. Não existe endpoint de exclusão de usuário; o cenário cascade exige outra operação com acesso ao banco.

Recomendação: avaliar relações individualmente antes dos novos modelos. Definir retenção/exclusão/anonimização e unicidade de email por política; não copiar cascade para audit, documentos ou histórico por conveniência. Testar integridade e preservação de registros necessários, sem inventar prazo legal.

### SEC-09 — Testes de segurança têm pontos cegos e fragilidade de setup

**Média — dívida de verificação confirmada.** Evidências: `test/api.e2e-spec.ts:10–15,33–47,70–81`, helpers e `prisma.integration-spec.ts`.

O helper de cadastro faz `sessionSchema.parse(response.body)`; objetos Zod descartam propriedades desconhecidas. A assertion de não exposição é aplicada ao objeto já projetado, podendo passar mesmo se um campo privado adicional viesse na resposta bruta. A view atual está correta; o problema é a capacidade desse teste de detectar uma regressão.

Os testes HTTP substituem persistência e não validam FK/transações/driver real. Há um teste separado com PostgreSQL declarado, mas não executado nesta auditoria. O setup de integração exige database name `cuidare_test`, porém não garante servidor descartável: isso continua dependendo do ambiente. Faltam casos dedicados de revogação/status, SQL/error mapping, redaction de logs, schemas de saída e módulos ainda ausentes.

A primeira execução HTTP desta auditoria excedeu os 5 segundos do hook inicial; o `afterEach` tentou fechar app não definido, e a criação assíncrona atrasada pode misturar fixtures entre casos seguintes. A falha foi registrada, não atribuída a uma vulnerabilidade funcional sem evidência. A repetição isolada consta nos resultados finais.

Recomendação: assertions no JSON bruto ou schemas de resposta estritos, init/teardown seguros e timeout de teste justificado para hashing/imports na infraestrutura alvo. Executar E2E também com banco real descartável e testes de regressão para cada achado corrigido. Não alterar os testes silenciosamente nesta etapa de auditoria.

### SEC-10 — Evidências de secrets, versionamento e CI são limitadas

**Baixa como evidência operacional; potencial alto se segredos externos tiverem vazado.** Evidências: `.gitignore`, script de setup, workflow, varredura local e ausência de `.git`.

A varredura delimitada de 66 arquivos de fonte/configuração/documentação não encontrou repetição do JWT secret/senha locais fora de `.env`, nem marcadores de chave privada. Não houve impressão dos valores. Isso não detecta todo segredo possível, não substitui secret scanner e não cobre histórico Git, `dist`, dependências, backups, uploads, logs remotos ou artefatos de deploy. Credenciais fictícias dos testes e CI não são credenciais produtivas.

`npm run format:check` já falhava somente no `agents.md`, adicionado pelo usuário. A CI chama `npm run validate` antes de audit/migrations/integração e, portanto, com esse estado seria interrompida nesse check. `agents.md` foi preservado, não reformatado nem ignorado para esconder a falha.

Recomendação: regularizar formato do arquivo de instruções em mudança específica autorizada, estabelecer repositório/proveniência e executar CI real. Adicionar secret scanning e política de resposta/rotação. Confirmar regras de branch, acesso aos runners e retenção de artefatos/logs no ambiente efetivo.

## Verificações e evidências de execução

| Verificação                                  | Resultado nesta auditoria                                                           |
| -------------------------------------------- | ----------------------------------------------------------------------------------- |
| Formatter dos documentos novos e README      | Executado apenas nesses arquivos; sem reformatar `agents.md` ou código              |
| `npm run format:check` global                | Pendência preexistente exclusivamente em `agents.md`; não declarar aprovação global |
| `npm run lint`                               | Aprovado                                                                            |
| `npm run typecheck`                          | Aprovado                                                                            |
| `npm test`                                   | 15 testes aprovados, quatro suites                                                  |
| `npm run test:e2e`, primeira execução        | 23 aprovados e 2 falhas relacionadas ao timeout/setup; SEC-09                       |
| `npm run test:e2e`, repetição isolada        | 25 testes aprovados, uma suite; falha inicial mantida no registro                   |
| `npm run prisma:validate` / `npm run build`  | Ambos aprovados, incluindo geração do client Prisma                                 |
| Comparação SQL inicial/schema                | Correspondência confirmada, ignorando comentários/espaços; sem aplicar migration    |
| `npm audit --json`                           | 0 vulnerabilidades reportadas; retrato de dependências conhecidas                   |
| `npm ls --depth=0`                           | Versões diretas conferidas, sem dependências inválidas reportadas                   |
| `docker compose config --quiet`              | Sintaxe/configuração válidas; não comprova banco em execução                        |
| Docker Engine                                | Indisponível: pipe `dockerDesktopLinuxEngine` não encontrado                        |
| Migrations contra servidor / `test:database` | Não executados; não havia ambiente descartável PostgreSQL disponível via Docker     |
| CI remota                                    | Não executada/verificada; sem Git/remote no diretório inspecionado                  |
| Sonda de subject inexistente                 | JWT fictício válido aceito, HTTP 200/lista vazia; sem banco ou dados reais          |
| Varredura delimitada de secrets              | Sem repetição dos valores locais fora de `.env`; limitações descritas acima         |

O aviso `ExperimentalWarning: VM Modules` é esperado pelo script Jest atual. O evento 500 usado pelo teste de erro sanitizado é deliberado; não indica falha desse teste. Resultados anteriores à auditoria não substituem as verificações acima.

## Recomendações e decisões antes de prosseguir

Priorizar acesso explícito a dependentes, estado de usuário/sessão, auditoria/privacidade e segurança de operação antes de dados reais. Registrar decisão de produto/jurídica para autoridade do responsável, bases/finalidades, retirada de acesso, retenção e eventual uso de links compartilhados. Planejar storage privado e scanning antes de uploads; timeline e logs não devem duplicar conteúdo clínico integral.

Apenas esta revisão, o [estado atual](../architecture/current-state.md), o [roadmap](../architecture/v1-roadmap.md) e o README (índice e precisão sobre versionamento/secrets) foram criados/alterados. Nenhuma correção de runtime, migration ou teste novo foi implementado. Esta auditoria termina na Etapa 0; a execução das próximas etapas depende de nova solicitação.
