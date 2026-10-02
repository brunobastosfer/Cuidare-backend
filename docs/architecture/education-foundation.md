# Educação — Etapa 9

Data: 02/10/2026. Escopo exclusivo: matrículas e relatórios escolares informados pelo responsável. Projeto e arquitetura existentes foram preservados; Etapa 10 não iniciada. Não há contas institucionais, portal de escola, professor, notas automáticas, integração externa ou nova dependência. A implementação não atesta autenticidade de relatório ou representação jurídica do responsável.

## Arquitetura e reutilização

Monólito modular/MVC adaptado para API: controller fino → EducationService → EducationRepository → PrismaEducationRepository em repository/prismaRepository → PostgreSQL. Modelos independentes do ORM e views enumeradas. Reutilizados JWT/guard global, validação/normalização, paginação, filtro de erros, headers/CORS/rate limiting, DependentAuthorizationService, UnitOfWorkRepository Serializable, AuditService, DocumentsRepository, timeline/cursor/filtro civil e privacy/formatter. Não foram duplicados upload, autenticação, storage ou canal de exportação.

Escritas e audit usam o mesmo cliente transacional; a callback pode ser repetida até três vezes em conflito e não faz IO externo nem captura mutações. Escritas Prisma repetem papéis/vínculo/conta/dependente ativos no where. Nenhum service/controller importa ORM, banco ou implementação Prisma; o lint preserva essa fronteira.

## Modelos e decisões

- SchoolEnrollment: UUID/dependentId, schoolName até 160, schoolYear inteiro 1–9999, grade até 120 e className até 80 opcionais, startDate e endDate opcional, criador/timestamps/soft delete do servidor.
- SchoolReport: UUID/dependentId, enrollmentId opcional, title até 160, reportDate, summary/observations até 2000 cada, documentId opcional, criador/timestamps/soft delete do servidor.
- Campos textuais são aparados; obrigatórios não aceitam null/vazio. Opcionais aceitam null para remoção. PATCH vazio, identidades, timestamps, papéis e propriedades extras são recusados.
- Datas escolares são civis YYYY-MM-DD/DATE, representadas à meia-noite UTC; timestamps técnicos TIMESTAMPTZ(3). Início da matrícula não pode preceder nascimento; fim não precede início. Planejamento futuro é permitido.
- Ano escolar é metadado informado, não inferido ou obrigado a coincidir com ano das datas. Série/turma não são calculadas por idade. Não impomos matrícula única ou prazo máximo presumido.
- ReportDate não precede nascimento nem é futura. Pode ser posterior ao fim de uma matrícula: data de emissão não precisa estar contida no período letivo. Textos são relatos informados, não notas, diagnósticos ou decisões automatizadas.
- Na criação ou alteração explícita de enrollmentId/documentId, o vínculo precisa existir, estar ativo e pertencer ao mesmo dependente autorizado. Pode ser reassociado ou removido via null. Não buscar URLs/documentos externos ou aceitar storageKey do cliente.
- Relatório é independente: excluir logicamente a matrícula não exclui relatórios ligados. Views/exportação retornam enrollmentId null se a matrícula estiver arquivada; o FK interno conserva história. Documento arquivado também vira documentId null, sem excluir relatório ou seus textos. Timeline não inclui esses vínculos.
- Uma correção textual não precisa revincular referências antigas arquivadas. Reatribuir explicitamente uma referência arquivada é recusado; removê-la é permitido. Não há cascade/purge, restauração de vínculo automática ou borramento retroativo de conteúdo.

## API

Todas as rotas abaixo têm prefixo /api/v1, JWT/sessão/conta válidos e dependente/vínculo ativos. OWNER/EDITOR criam/editam; OWNER/EDITOR/VIEWER leem; somente OWNER exclui. Falta de escopo/registro retorna 404 neutro, sem indicar proprietário ou conteúdo.

| Rota                                                          | Métodos            | Contrato                                                 |
| ------------------------------------------------------------- | ------------------ | -------------------------------------------------------- |
| /dependents/:dependentId/education/enrollments                | GET, POST          | Lista paginada; cria matrícula                           |
| /dependents/:dependentId/education/enrollments/:id            | GET, PATCH, DELETE | Detalhe, correção e soft delete                          |
| /dependents/:dependentId/education/reports                    | GET, POST          | Lista paginada; cria relatório independente ou vinculado |
| /dependents/:dependentId/education/reports/:id                | GET, PATCH, DELETE | Detalhe, correção/reassociação e soft delete             |
| /dependents/:dependentId/timeline?type=SCHOOL_REPORT_RECORDED | GET                | Histórico mínimo, cursor e filtros existentes            |
| /privacy/exports                                              | POST               | JSON 1.5, senha e seleção OWNER de dependentes           |

IDs são UUIDv4. Listas usam limit (1–100, padrão 50) e offset (0–10000, padrão 0), ordenadas createdAt desc/id asc. Criar retorna 201, leituras/PATCH 200, DELETE 204 sem corpo. Ausência de autenticação retorna 401; DTO inválido 400. Nas respostas não saem criador, deletedAt, objetos de relação, chaves/hash/scan de arquivo ou dados de outros responsáveis. Limites gerais JSON 32KiB e rate limit continuam aplicados, sem política global nova nesta etapa.

### Exemplo mínimo

Após cadastro/login e criação de dependente, envie JWT no header Authorization: Bearer <token>. IDs abaixo são apenas placeholders fictícios; substitua pelo dependente autorizado e pela matrícula devolvida.

POST /api/v1/dependents/<dependentId>/education/enrollments:

```json
{
  "schoolName": "Escola fictícia",
  "schoolYear": 2025,
  "grade": "1º ano",
  "className": "A",
  "startDate": "2025-02-01",
  "endDate": "2025-12-20"
}
```

POST /api/v1/dependents/<dependentId>/education/reports:

```json
{
  "enrollmentId": "00000000-0000-4000-8000-000000000001",
  "title": "Relatório fictício do semestre",
  "reportDate": "2025-06-20",
  "summary": "Texto fictício registrado pelo responsável.",
  "observations": null,
  "documentId": null
}
```

Sem enrollmentId/documentId, o relatório é aceito de forma independente. Para anexar arquivo, use o módulo documents existente (upload privado, scan obrigatório), depois informe seu ID autorizado. Não há nova rota de upload educacional nem bypass de scanner. Corrija summary via PATCH; remova vínculo com { "enrollmentId": null }. Excluir matrícula não apaga o relatório.

## Timeline, auditoria e privacidade

SchoolReportTimelineSource usa EducationRepository no mesmo UnitOfWork e filtra apenas relatórios ativos do dependente autorizado. Evento SCHOOL_REPORT_RECORDED, sourceType SCHOOL_REPORT, ID school-report-recorded:<UUID>, eventDate reportDate à meia-noite UTC, título “Relatório escolar informado” e summary null. Não contém escola, série/turma, título/resumo/observações, anexos ou criador; é informação registrada, não comprovação de avaliação. Matrículas não geram eventos.

Query Prisma limita top-k antes da agregação, aplica createdAt <= snapshotAt, filtro civil preciso para instantes from/to e desempate global por data/ID/namespace. Cursor HMAC continua limitado a usuário/dependente/filtros/ordem e 30 minutos. Soft delete/revogação são refletidos nas próximas páginas. Corte por criação não promete snapshot histórico imutável: edição de reportDate pode reordenar entre páginas.

Seis ações de audit: SCHOOL_ENROLLMENT_CREATED/UPDATED/DELETED e SCHOOL_REPORT_CREATED/UPDATED/DELETED, com recursos SCHOOL_ENROLLMENT/SCHOOL_REPORT. Metadata de edição enumera somente nomes dos seis campos de cada modelo; nenhum valor textual, link de arquivo, documento ou payload é registrado.

Exportação JSON evolui de 1.4 para 1.5 e acrescenta schoolEnrollments/schoolReports por views públicas. Continua reautenticada, opt-in OWNER, no-store/attachment, com limite max+1 por coleção e teto de bytes. Excesso retorna 413, sem truncamento ou recibo parcial. Textos podem conter dados escolares, saúde e terceiros: proteger arquivo no dispositivo e impedir logs/analytics de corpos e snapshots.

EDUCATION é a 13ª categoria de PRIVACY_RETENTION_DAYS, padrão null/decisão pendente, sem prazo legal presumido ou expurgo. Snapshot de pedidos antigos não é reescrito; parser completa categoria ausente com null em leitura. Fechamento de conta preserva dependentes/dados de outros responsáveis. Inventário e privacy-by-design foram atualizados; controles técnicos não certificam conformidade.

## Migration e operação

Nona migration: prisma/migrations/20261002000900_education/migration.sql. Diff offline entre schema anterior e atual; BEGIN/COMMIT, dois modelos novos, índices de listas/timeline, unique id/dependentId da matrícula, seis ações/dois recursos de audit, FKs RESTRICT e FKs compostas matrícula/documento/dependente. CHECKs cobrem textos não vazios, ano 1–9999, faixa civil 0001–9999 e período fim >= início. Regras entre nascimento/data atual são checadas pelo serviço transacional, não CHECK temporal mutável.

Migration preparada, **não aplicada**; migrations anteriores não foram editadas. Não foi usado reset, db push, banco real ou volume do usuário. Nenhum seed, storage, segredo, package/lock, frontend ou agents.md foi alterado. Arquivo temporário de comparação de schema foi removido; fonte original e schema atual permanecem disponíveis.

Para validar PostgreSQL: disponibilizar banco descartável exclusivo cuidare_test, configurar TEST_DATABASE_URL e, para deploy de migrations no mesmo alvo, DATABASE_URL/MIGRATION_DATABASE_URL. Conferir destino sem expor credenciais. Aplicar migrations e executar npm run test:database nesse banco, nunca na base com dados reais. O setup da suíte rejeita qualquer nome de banco diferente de cuidare_test; teardown remove somente UUIDs gerados pela própria suíte.

## Verificações da entrega

- Schema validado e cliente Prisma 7.10 gerado; TypeScript strict, lint e build aprovados.
- 564 unitários/54 suítes e 298 HTTP/10 suítes aprovados, incluindo regressões anteriores; 82 unitários e 32 HTTP novos nesta etapa.
- Cobertura nova: ambos CRUDs, roles/conta/vínculo, IDOR entre dependentes próprios e usuários distintos, mass assignment/projeções, nulls/limites/datas, reassociação/anexo arquivado, relatório independente, todas seis escritas com rollback, retry, timeline DATE/keyset/filtros/snapshot e exportação 1.5 com limites e soft delete.
- 44 casos PostgreSQL preparados/10 suítes, 7 novos nesta etapa, **0 executados**: TEST_DATABASE_URL ausente e Docker sem engine. Constraints/FKs/SQL/locks reais não são considerados validados pelos doubles.
- Auditoria de dependências completas e de produção: 0 vulnerabilidades reportadas. Nenhuma dependência atualizada.
- Formatter de todos os arquivos criados/alterados com suporte aprovado. npm run validate passa por schema, tipos e lint, mas interrompe no formato preexistente de agents.md; o check global aponta somente esse arquivo, preservado. Testes e build foram executados separadamente com os resultados acima.

## Arquivos entregues

Inventário comparado ao início desta etapa; exclui cliente gerado, dist/coverage/dependências. 21 arquivos criados e 34 modificados.

### Criados

- docs/architecture/education-foundation.md
- prisma/migrations/20261002000900_education/migration.sql
- src/domain/models/education.model.ts
- src/modules/education/dto/education.dto.spec.ts
- src/modules/education/dto/education.dto.ts
- src/modules/education/education.controller.ts
- src/modules/education/education.module.ts
- src/modules/education/education.service.spec.ts
- src/modules/education/education.service.ts
- src/modules/education/school-report-timeline.source.ts
- src/modules/privacy/education-privacy.spec.ts
- src/presentation/views/education.view.spec.ts
- src/presentation/views/education.view.ts
- src/repository/education.repository.ts
- src/repository/prismaRepository/prisma-education.repository.spec.ts
- src/repository/prismaRepository/prisma-education.repository.ts
- test/education.e2e-spec.ts
- test/education.integration-spec.ts
- test/helpers/education-fixture.ts
- test/helpers/education-schemas.ts
- test/helpers/in-memory-education.ts

### Modificados

- .env.example
- README.md
- SECURITY.md
- docs/architecture/current-state.md
- docs/architecture/v1-roadmap.md
- docs/lgpd/data-inventory.md
- docs/lgpd/privacy-by-design.md
- docs/security/security-review.md
- prisma/schema.prisma
- src/app.module.ts
- src/config/privacy-settings.spec.ts
- src/config/privacy-settings.ts
- src/domain/models/audit-log.model.ts
- src/domain/models/data-retention.model.ts
- src/domain/models/privacy.model.ts
- src/domain/models/timeline-event.model.ts
- src/modules/audit/audit.service.spec.ts
- src/modules/audit/audit.service.ts
- src/modules/privacy/privacy.service.spec.ts
- src/modules/timeline/timeline.module.ts
- src/presentation/views/privacy.view.ts
- src/repository/prismaRepository/prisma-privacy.repository.spec.ts
- src/repository/prismaRepository/prisma-privacy.repository.ts
- src/repository/prismaRepository/prisma-unit-of-work.repository.spec.ts
- src/repository/prismaRepository/prisma-unit-of-work.repository.ts
- src/repository/repository.module.ts
- src/repository/unit-of-work.repository.ts
- test/appointments.e2e-spec.ts
- test/documents.e2e-spec.ts
- test/helpers/create-test-app.ts
- test/helpers/in-memory-foundation.ts
- test/medications.e2e-spec.ts
- test/privacy.e2e-spec.ts
- test/vaccinations.e2e-spec.ts

## Pendências e próximo limite

Validar migrations e todos os testes em PostgreSQL exclusivo; revisar governança de textos escolares/terceiros, bases/finalidades/representação e retenção/backups. Seguem pendentes SMTP/ClamAV reais, storage/ACL NTFS, segurança de implantação e direitos após fechamento já descritos nas etapas anteriores. Não há alegação de trilha inviolável, autenticação de escola ou origem comprovada de documento.

Somente depois de nova solicitação: Etapa 10 — desenvolvimento. Nenhum catálogo/marco/diagnóstico ou compartilhamento externo foi implementado aqui.
