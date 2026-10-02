# Vacinas — Etapa 8

Data: 02/10/2026. Somente Etapa 8 de agents.md, no monólito modular existente. Etapa 9 não iniciada. Stack/lockfile preservados; nenhuma dependência instalada. Validação operacional, jurídica e PostgreSQL real continuam necessárias antes de dados sensíveis.

## Domínio e proveniência

VaccineCatalog é referência versionada; VaccineSchedule é calendário PUBLIC ou PRIVATE_COMPLEMENTARY; VaccineScheduleDose contém regras dessa versão; DependentVaccination é registro informado pelo responsável. Não são conceitos intercambiáveis.

Catálogo e calendário têm source, sourceVersion, validFrom e validUntil nullable. Regras filhas herdam proveniência do calendário e apontam à versão exata do catálogo. source é texto informativo, nunca URL acessada pelo servidor.

**Produção começa com referências vazias**: sem fonte previamente aprovada, nenhum nome de vacina, calendário clínico ou seed foi inventado. Dados fictícios existem somente nos testes. Cadastro de vacina depende de futura publicação de referência aprovada; não há calendário brasileiro/privado pronto para uso.

reviewedAt nullable é marcador técnico de publicação, não prova de validação clínica. Somente referências não excluídas e revisadas em data não futura são descobertas/aceitas para novos registros. API oferece somente GET autenticado; usuário comum não publica/edita calendário.

Antes de uso real: definir responsável humano, fonte verificável, revisão de conteúdo/vigência/modelo, aprovação e testes; implementar importação controlada com identidade operacional separada. A identidade da API deve ter apenas leitura nas referências. Publicar revisões como novas versões/linhas; não sobrescrever referências ou regras já utilizadas. Essa imutabilidade é requisito operacional, **não trigger de banco implementado**. Processo de importação/publicação não está implementado nesta etapa.

## Arquitetura e reaproveitamento

Controllers finos → VaccinationsService → UnitOfWorkRepository/VaccinationRepository → PrismaVaccinationRepository. Modelos e matemática civil puros no domínio; views enumeram respostas. Interface em repository e implementação em repository/prismaRepository, no mesmo cliente transacional de acesso/documentos/audit.

Reutilizados: JWT/estado de sessão, autorização de dependentes, paginação, validador civil, filtro de erros, AuditService, documentos, timeline e privacidade. Algoritmo DATE/keyset de medicamentos extraído para civil-event-timeline-where, mantendo wrapper/contrato e regressões anteriores. Sem microsserviços ou tabela duplicada de timeline.

## API e registro informado

Prefixo /api/v1, JWT obrigatório inclusive para referências. Listas comuns usam limit/offset existentes (máximo 100).

| Rota                                                      | Política                                           |
| --------------------------------------------------------- | -------------------------------------------------- |
| GET /vaccine-catalog e /vaccine-catalog/:id               | Catálogo revisado com origem/versão                |
| GET /vaccine-schedules e /vaccine-schedules/:id           | Calendários revisados; filtro type opcional        |
| GET /vaccine-schedules/:id/doses                          | Regras paginadas com proveniência do calendário    |
| GET /dependents/:dependentId/vaccinations e /:id          | OWNER/EDITOR/VIEWER                                |
| POST /dependents/:dependentId/vaccinations                | OWNER/EDITOR                                       |
| PATCH /dependents/:dependentId/vaccinations/:id           | OWNER/EDITOR                                       |
| DELETE /dependents/:dependentId/vaccinations/:id          | OWNER, soft delete                                 |
| GET /dependents/:dependentId/vaccinations/schedule-status | Três papéis; scheduleId obrigatório; asOf opcional |

POST: vaccineId UUID v4, dose 1–40 caracteres, administeredAt YYYY-MM-DD, institutionName até 160, batchNumber até 80, notes até 2000, documentId UUID opcional. Opcionais aceitam null; obrigatórios não. Textos normalizados, campos extras rejeitados. Servidor deriva criador; dependente vem da rota autorizada. Cliente não atribui papel, timestamps, fonte ou estado calculado.

PATCH aceita somente dose/data/instituição/lote/notas/documento e exige ao menos um campo. vaccineId imutável pela API: para corrigir referência, soft delete e novo registro auditado, preservando proveniência anterior. Registros repetidos são permitidos; não há deduplicação clínica ou comprovação de aplicação.

Data informada não pode ser futura, pré-nascimento ou fora da vigência inclusiva da referência. Datas civis: DATE/UTC meia-noite internamente e YYYY-MM-DD na API; timestamps técnicos TIMESTAMPTZ UTC.

documentId exige documento ativo do mesmo dependente, autorizado; FK composta documento/dependente reforça isolamento. Soft delete documental conserva registro/arquivo, mas documentId vira null na view/exportação. Correções textuais continuam possíveis sem ressuscitar documento; novo vínculo explícito com documento excluído falha. Download permanece na rota protegida de documentos; não expõe bytes/key/checksum/scannedAt.

Referência retirada impede novo cadastro, não apaga registro informado: detalhe/exportação preservam versão exata originalmente utilizada. Histórico não afirma publicação atual ou validade clínica; catálogo permite consultar disponibilidade atual, não publicação histórica.

## Classificação, não aconselhamento

scheduleId explícito: não inferir país, público/privado ou última versão. asOf civil, hoje UTC por padrão, não futura/pré-nascimento e dentro da vigência inclusiva do calendário selecionado.

Modelo único BIRTH_AGE_FIXED_V1: idade fixa desde nascimento, meses com ajuste ao último dia e depois dias. Valores vêm da referência aprovada, não de regras médicas hardcoded. Bounds técnicos: 0–1200 meses, 0–366 dias, anos 1–9999.

- REGISTRADA: algum registro não excluído com mesmo vaccineId e texto exato de dose, aplicado até asOf.
- PREVISTA: sem registro correspondente e data prevista igual/posterior a asOf.
- ATRASADA: sem registro correspondente e data prevista anterior a asOf.

Retorna calendário/origem/versão, referência de cada item, data prevista, estado, IDs dos registros e aviso: **não confirma imunização nem substitui avaliação profissional**. Estado organiza registros contra referência, não declara imunidade/necessidade de aplicação/atraso clínico. Sem notificações, aconselhamento ou recomendação automática.

Não suporta resgate, intervalos dependentes de doses anteriores, grupos de risco, gestação, contraindicações, equivalência entre produtos/versões ou imunidade. Não importar calendários que exigem tais regras nem simplificá-los silenciosamente a idades fixas. Evoluir após revisão de requisitos/segurança clínica. Mesmo nome/código em outra versão não corresponde automaticamente a REGISTRADA.

VACCINATION_STATUS_MAX_ITEMS default 1000, faixa 1–5000, limita regras e registros. Cada coleção lê max+1: excesso retorna 413, sem classificação parcial. Calendário vazio, referência filha retirada/não revisada, modelo/regra temporal não suportado falham fechados com 400. asOf compara datas sobre registros atuais; cadastro posterior com data passada pode mudar resultado. Não é snapshot histórico imutável.

## Segurança, auditoria e privacidade

Vínculo/papel verificados na transação Serializable e no where Prisma das operações. Conta bloqueada, acesso revogado ou dependente excluído retiram acesso. Falta de papel e recurso alheio/inexistente retornam 404, conforme padrão existente, sem enumeração.

Criar/editar/excluir é atômico com VACCINATION_CREATED/UPDATED/DELETED, recurso DEPENDENT_VACCINATION. Audit só IDs, ação e nomes dos seis campos editáveis; nunca nomes de vacina, dose, data clínica, lote, instituição ou notas. Retry não faz IO externo ou duplica audit. Erros técnicos genéricos sem payloads/driver/secrets.

Timeline VACCINATION_RECORDED: administeredAt civil, título “Vacinação informada”, summary null, IDs e data técnica. SQL top-k/keyset, precisão de instantes vs DATE e corte createdAt; sem vacina/dose/documento/notas. Soft delete/revogação retiram próximos resultados; cursor não concede acesso ou snapshot imutável.

Exportação JSON schemaVersion 1.4 acrescenta vaccinations: OWNER selecionado explicitamente, senha revalidada, limites por coleção/bytes e no-store. Mesma view sem internos; documento excluído null, vacina informada excluída omitida. Textos/datas exportados permanecem saúde sensível. Retenção VACCINATION default null: decisão pendente, sem prazo presumido/expurgo ou reescrita de pedidos antigos. Conta encerrada conserva registros de dependentes/outros responsáveis.

## Banco e operação

Migration: prisma/migrations/20261002000800_vaccinations/migration.sql. Quatro tabelas, enums de calendário/modelo, ações de audit, índices por lista/acesso/cronologia, unicidade de referência/versão e regra/dose, FK composta documental e CHECKs de textos/períodos/bounds. Sem dados de negócio. FKs RESTRICT; sete migrations antigas preservadas. **Não aplicada localmente**.

Revisar backup/DDL/permissões; validar todas as oito migrations em banco descartável. prisma:deploy usa MIGRATION_DATABASE_URL (se definida), senão DATABASE_URL: configurar explicitamente a conexão de teste no processo, nunca o banco real. test:database exige TEST_DATABASE_URL com pathname /cuidare_test, não aplica migrations e não usa conexão real como fallback.

```powershell
npm run prisma:deploy
npm run test:database
```

Docker/engine indisponível; nenhum caso PostgreSQL executado. Testes preparados limpam somente os IDs próprios no banco exclusivo cuidare_test.

## Exemplo funcional seguro

Com referências realmente aprovadas/publicadas: autenticar, consultar catálogo/calendários, selecionar IDs retornados, cadastrar dose/data informadas pelo responsável e consultar schedule-status com a versão escolhida. Detalhes da timeline via sourceId na rota específica, com nova autorização. Não há exemplo médico/calendário inventado.

Fluxo executável sem dados clínicos:

```powershell
npm test -- --runTestsByPath src/modules/vaccinations/vaccinations.service.spec.ts
npm run test:e2e -- --runTestsByPath test/vaccinations.e2e-spec.ts
```

Fixtures fictícias exercitam CRUD, versões/estados, documentos, timeline e privacidade; nunca importar fixtures em produção.

## Verificações e inventário

Resultados locais:

| Verificação                                      | Resultado                                                                                                                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unitários                                        | 482 aprovados, 49 suítes; 80 casos acrescentados                                                                                                         |
| HTTP Nest com repositories em memória            | 266 aprovados, 9 suítes; 25 casos acrescentados                                                                                                          |
| Prisma schema/client, TypeScript, ESLint e build | Aprovados; sem nova dependência                                                                                                                          |
| Formato dos arquivos criados/alterados           | Aprovado                                                                                                                                                 |
| npm audit                                        | Zero vulnerabilidades reportadas; não garante ausência de falhas                                                                                         |
| npm run validate                                 | Schema/tipos/lint passam; interrompe no formato preexistente de agents.md, preservado                                                                    |
| PostgreSQL real                                  | 37 casos preparados em 9 suítes, 6 novos; **zero executado**. Setup recusa falta de TEST_DATABASE_URL exclusivo cuidare_test; engine Docker indisponível |
| Migrations / CI remota / fontes clínicas         | Não aplicadas/executada/publicadas nesta entrega                                                                                                         |

Testes novos: aritmética UTC/mês bissexto/overflow/vigência, três estados/dose/versão exatas e asOf, DTOs/identidades/mass assignment, BOLA/roles/conta/vínculo/dependente excluído, rollback/retry do audit, documento cruzado/excluído, referências retiradas/histórico, limites 413, SQL/keyset/DATE/top-k, contratos HTTP/no-store, timeline e exportação. Suites reais preparadas cobrem CHECK/unique/FKs, escopo/roles, documento composto, rollback, paginação/precisão temporal e histórico/exportação.

### Arquivos criados (22)

- `docs/architecture/vaccinations-foundation.md`
- `prisma/migrations/20261002000800_vaccinations/migration.sql`
- `src/domain/models/vaccination.model.ts`
- `src/domain/vaccination-schedule.spec.ts`
- `src/domain/vaccination-schedule.ts`
- `src/modules/vaccinations/dto/vaccination.dto.spec.ts`
- `src/modules/vaccinations/dto/vaccination.dto.ts`
- `src/modules/vaccinations/vaccination-timeline.source.ts`
- `src/modules/vaccinations/vaccinations.controller.ts`
- `src/modules/vaccinations/vaccinations.module.ts`
- `src/modules/vaccinations/vaccinations.service.spec.ts`
- `src/modules/vaccinations/vaccinations.service.ts`
- `src/presentation/views/vaccination.view.ts`
- `src/repository/prismaRepository/civil-event-timeline-where.ts`
- `src/repository/prismaRepository/prisma-vaccination.repository.spec.ts`
- `src/repository/prismaRepository/prisma-vaccination.repository.ts`
- `src/repository/vaccination.repository.ts`
- `test/helpers/in-memory-vaccinations.ts`
- `test/helpers/vaccination-fixture.ts`
- `test/helpers/vaccination-schemas.ts`
- `test/vaccinations.e2e-spec.ts`
- `test/vaccinations.integration-spec.ts`

### Arquivos alterados (37)

- `.env.example`
- `README.md`
- `SECURITY.md`
- `docs/architecture/current-state.md`
- `docs/architecture/v1-roadmap.md`
- `docs/lgpd/data-inventory.md`
- `docs/lgpd/privacy-by-design.md`
- `docs/security/security-review.md`
- `prisma/schema.prisma`
- `src/app.module.ts`
- `src/config/environment.spec.ts`
- `src/config/environment.ts`
- `src/config/privacy-settings.spec.ts`
- `src/config/privacy-settings.ts`
- `src/domain/models/audit-log.model.ts`
- `src/domain/models/data-retention.model.ts`
- `src/domain/models/privacy.model.ts`
- `src/domain/models/timeline-event.model.ts`
- `src/modules/audit/audit.service.spec.ts`
- `src/modules/audit/audit.service.ts`
- `src/modules/privacy/privacy.service.spec.ts`
- `src/modules/timeline/timeline.module.ts`
- `src/presentation/views/privacy.view.ts`
- `src/repository/prismaRepository/prisma-medication.repository.ts`
- `src/repository/prismaRepository/prisma-privacy.repository.spec.ts`
- `src/repository/prismaRepository/prisma-privacy.repository.ts`
- `src/repository/prismaRepository/prisma-unit-of-work.repository.spec.ts`
- `src/repository/prismaRepository/prisma-unit-of-work.repository.ts`
- `src/repository/repository.module.ts`
- `src/repository/unit-of-work.repository.ts`
- `test/appointments.e2e-spec.ts`
- `test/documents.e2e-spec.ts`
- `test/helpers/create-test-app.ts`
- `test/helpers/in-memory-foundation.ts`
- `test/medications.e2e-spec.ts`
- `test/privacy.e2e-spec.ts`
- `test/setup-env.ts`

Inventário relativo à base anterior da Etapa 7, excluindo artefatos gerados/dependências e secrets. Nenhum arquivo próprio anterior removido. agents.md, package/lock, sete migrations anteriores, Compose, CI e .env preservados; Prisma gerado/dist são artefatos reconstruídos. O snapshot temporário do schema anterior criado apenas para diff foi removido, sem afetar arquivos do usuário.

### Decisões e pendências

- Monólito MVC/API existente preservado; abstrações específicas e UOW comum. Comparação de datas isolada no domínio; timeline reaproveita algoritmo civil anterior.
- Referências vazias, proveniência explícita, apenas leitura; publicação e imutabilidade operacionais precisam aprovação humana/credenciais separadas. Nenhum importador/seed clínico.
- Modelo limitado a idade fixa desde nascimento, correspondência exata de versão/dose, sem decisão clínica. Não simplificar calendários complexos ou afirmar imunização.
- Referência original conservada no histórico; documento só do mesmo dependente, soft delete oculta vínculo sem eliminar vacina; vaccineId não é sobrescrito pela API.
- Validar oito migrations e 37 testes PG em banco descartável; CI remota ainda não executada. Check global de formatter preexistente precisa decisão do usuário sobre agents.md.
- Referências clínicas, retenção/finalidades/representação, SMTP/ClamAV/ACL/backup/carga e operação produtiva seguem pendentes. Não certifica conformidade LGPD ou prontidão clínica.
- Etapa 9 não iniciada.
