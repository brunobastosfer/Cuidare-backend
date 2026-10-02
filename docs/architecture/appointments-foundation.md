# Consultas — Etapa 6

Data: 01/10/2026. Escopo autorizado: somente Etapa 6 de agents.md, sobre a base existente. Etapa 7 não iniciada. Sem recriar projeto, atualizar dependências, alterar secrets/app ou executar migrations.

## Reutilização e arquitetura

Inspecionados schema/migrations, módulos, contratos e implementações existentes, autorização por vínculo, DTOs/views, auditoria, transação Serializable/retry, timeline/cursor, privacidade/retention, helpers/testes e configuração/CI. Mantido monólito modular MVC de API: controller HTTP → service/regra → interface em repository → prismaRepository. Domain não depende de ORM; views enumeram campos públicos.

Reutilizados JWT/sessão, Argon2id e reautenticação de privacy, validação global/JSON 32KiB, throttler/headers/CORS, DependentAuthorizationService/dependentScope, AuditService, UnitOfWorkRepository, timeline e exportação. Nenhuma biblioteca nova, refatoração ampla ou mecanismo duplicado. PrismaAppointmentRepository implementa AppointmentRepository, registrado por Symbol e entregue também dentro da mesma transação.

## Modelo e decisões

- Appointment: id/dependentId, date, specialty?, professionalName?, institutionName?, reason, notes?, followUpDate?, createdAt/updatedAt/deletedAt.
- MedicalRecommendation: entidade separada, id/appointmentId/dependentId, title, description, status, startDate, endDate?, completedAt técnico, timestamps/soft delete. O campo recommendations de Appointment é relação Prisma, não texto duplicado/array ilimitado no JSON. Listagem de recomendações é rota paginada; criação em duas chamadas independentes, sem bulk aninhado.
- date/followUpDate: TIMESTAMPTZ(3), API timestamp UTC com Z/segundos e até três casas de milissegundos. Datas/horários impossíveis, offsets implícitos, ano zero e precisão excessiva recusados. Consulta passada/futura aceita; título neutro não confirma atendimento. Retorno não pode anteceder consulta e não cria consulta realizada automaticamente.
- startDate/endDate: DATE, API YYYY-MM-DD, calendário real/anos 1–9999. Fim opcional não pode anteceder início. São período informado, inclusive planejado/futuro, não prova de realização. Não exigir endDate para conclusão nem interpretar o conteúdo clínico.
- Estado padrão PENDING. PENDING ↔ IN_PROGRESS permite pausa/retomada explicitamente; ambos → COMPLETED/CANCELLED. Estados terminais não mudam para outro estado; correções de texto/período permanecem possíveis. completedAt gerado no servidor na primeira marcação/criação COMPLETED; preservado em correções, fora de DTO/views/exportação.
- Nenhum cálculo, diagnóstico, prescrição, sugestão, referência médica, IA ou orientação criada pela aplicação. Futuros responsáveis/escolas não têm conta/link novo nesta etapa; só vínculos atuais explicitamente autorizados.

## API e segurança

Prefixo /api/v1/dependents/:dependentId/appointments:

| Método           | Sufixo                                            | Resultado                                       |
| ---------------- | ------------------------------------------------- | ----------------------------------------------- |
| POST/GET         | vazio                                             | Cria 201 / lista 200                            |
| GET/PATCH/DELETE | /:appointmentId                                   | Detalhe 200 / corrige 200 / exclusão lógica 204 |
| POST/GET         | /:appointmentId/recommendations                   | Cria 201 / lista 200                            |
| GET/PATCH/DELETE | /:appointmentId/recommendations/:recommendationId | Detalhe 200 / corrige 200 / exclusão lógica 204 |

OWNER/EDITOR criam/editam; VIEWER só lê; OWNER exclui. Sem vínculo/papel ou pai/filho fora de escopo retorna 404; recurso desconhecido não confirma existência. IDs sempre UUID v4 e precisam pertencer à consulta E dependente da rota, mesmo quando o titular tem acesso a ambos. Não usar somente criador/ID.

Listas limit 1–100 (50 padrão), offset 0–10000, createdAt desc/id asc. PATCH vazio 400; extras (incluindo dependentId/appointmentId/completedAt/deletedAt), null obrigatório e textos vazios/excessivos recusados. Campos opcionais explicitamente nullable podem ser removidos com null. DTOs separados evitam permissividade de PartialType; repository também enumera writes/creates.

Todas as operações passam por transação; reads/writes incluem conta/dependente/vínculo ativos, e recomendações exigem consulta não excluída. Writes repetem papel no where; callbacks não fazem I/O externo nem mutam payload capturado quando repetidas. Auditoria e dado atômicos; metadata contém nomes permitidos por recurso, nunca notas/motivo/profissionais/título/descrição. Erros internos/log HTTP não recebem payloads/SQL/stack.

Excluir consulta com qualquer recomendação não excluída retorna 409, mesmo terminal; exclua cada recomendação primeiro. Não fazer cascade silencioso ou ocultar filhos sem audit próprio. Exclusão lógica não elimina fisicamente dados/backups nem cumpre automaticamente solicitação jurídica.

## Timeline e exportação

Fontes APPOINTMENT e MEDICAL_RECOMMENDATION registradas na agregação existente:

- APPOINTMENT_RECORDED: eventDate = date informada; corte por createdAt; título Consulta registrada.
- MEDICAL_RECOMMENDATION_RECORDED: eventDate/corte = createdAt técnico; não startDate prevista.
- MEDICAL_RECOMMENDATION_COMPLETED: eventDate/corte = completedAt da marcação; somente status COMPLETED. Não endDate prevista, cancelamento ou prova clínica.

IDs prefixados appointment-recorded:/recommendation-recorded:/recommendation-completed: + UUID; sourceId aponta a entidade correspondente, sourceType identifica módulo/entidade. summary null; títulos genéricos. Sem especialidade, profissionais/instituição, motivo/notas ou título/descrição informados. Essas datas/eventos ainda são dados sensíveis.

Período inclusivo UTC, keyset global (eventDate,id) com namespace e milissegundos preservados, ordenação/limite aplicados no SQL por tipo antes de unir top-k. Reutiliza cursor assinado, vínculo por página, prazo/escopo existentes. Não é snapshot histórico por commit: correções de date podem reordenar; exclusão/revogação prevalecem. Detalhe de recomendação usa rota aninhada e exige appointmentId obtido em coleção autorizada; timeline não expõe esse dado adicional.

Exportação passa a schemaVersion 1.2, acrescenta appointments/medicalRecommendations às coleções anteriores, com projeções explícitas. Padrão sem dependentes; senha + OWNER ativo + seleção explícita; consultas/recomendações/pais excluídos omitidos. Mesmos limites por coleção (max+1), bytes e 413 sem truncar; recibo/audit sem copiar conteúdo.

APPOINTMENT adicionada à retenção configurável, default null, cobrindo ambas as entidades. Sem prazo presumido, purge ou alteração de JSON de pedidos antigos. Inventário/privacy by design atualizados. Bases/finalidades/representação e gate de consentimento, se juridicamente adotado, precisam validação antes de dados reais; não presumir consentimento ou conformidade só pelo código.

## Exemplo funcional mínimo (somente fictício)

Após criar conta, confirmar email, obter JWT e cadastrar dependente:

POST /api/v1/dependents/:dependentId/appointments:

```json
{
  "date": "2026-01-01T14:30:00Z",
  "reason": "Motivo fictício registrado pelo responsável",
  "professionalName": "Profissional fictício",
  "notes": "Registro demonstrativo, sem orientação clínica"
}
```

Use id da consulta em POST .../appointments/:appointmentId/recommendations:

```json
{
  "title": "Registro demonstrativo",
  "description": "Texto fictício fornecido pelo responsável",
  "startDate": "2026-01-01"
}
```

PATCH .../recommendations/:id com {"status":"IN_PROGRESS"} e depois {"status":"COMPLETED"}. GET .../timeline?type=MEDICAL_RECOMMENDATION_COMPLETED mostra marcação mínima; GET nas rotas acima retorna detalhes autorizados. Para excluir, DELETE recomendação antes de DELETE consulta.

## Migration e índices

20261001000600_appointments/migration.sql: duas tabelas, enum de estados e seis ações/dois recursos de audit. Gerada por diff offline da base anterior e revisada com BEGIN/COMMIT + CHECKs: textos não vazios, períodos ordenados, anos válidos e equivalência COMPLETED/completedAt.

FK composta (appointmentId,dependentId) → Appointment(id,dependentId) impede associação entre dependentes. FKs novas onDelete RESTRICT; nenhuma tabela anterior apagada/recriada, migrations anteriores intactas. Enum novo pode ser usado nos CHECKs na mesma transação; valores adicionados nos enums antigos só usados após commit. Ambiente alvo PostgreSQL 18.6, não versões antigas.

Índices: dependente/deletedAt/createdAt/id para listas/registro; dependente/deletedAt/date/id para timeline da consulta; dependente/deletedAt/status/completedAt/id para conclusão; appointmentId/dependentId/deletedAt/createdAt/id para filhos. Limites/planos reais dependem de carga; nenhum EXPLAIN ou benchmark executado localmente.

## Verificação e pendências

| Verificação                                     | Resultado local                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| Prisma schema / geração de client               | Aprovados                                                                      |
| TypeScript strict / ESLint                      | Aprovados, sem avisos de lint                                                  |
| Unitários                                       | 303 aprovados, 36 suítes (80 casos a mais que a Etapa 5)                       |
| HTTP (Nest real, persistência/email em memória) | 209 aprovados, 7 suítes (27 novos casos)                                       |
| Build                                           | Aprovado                                                                       |
| Formato de arquivos alterados                   | Aprovado                                                                       |
| npm run validate                                | Interrompe no check global: somente agents.md preexistente; arquivo preservado |
| PostgreSQL real                                 | 25 casos preparados, 7 suítes; 0 executados                                    |

Testes novos cobrem UTC/calendário/limites de DTO, papéis e perda de vínculo, IDOR entre dependentes/consultas, estados/soft delete, mass assignment/projeções, auditoria sem valores e rollback/retry, queries escopadas, filtros/top-k/keyset entre namespaces/empates e exportação limitada 1.2. Casos reais novos (6): FK/CHECKs/datas, autorização/exclusão, rollback, paginação SQL/empates/milissegundos, corrida criação/exclusão e escopo/limites de exportação.

test:database foi tentado: setup recusou ausência de TEST_DATABASE_URL; Docker Linux engine indisponível. Não foi usado banco com dados do usuário nem aplicada migration. Integração PostgreSQL não se confunde com testes de mock/HTTP em memória. CI remota, SMTP/TLS reais, EXPLAIN/carga, backups e concorrência em banco continuam sem execução local. Logs de erro nos testes HTTP são falhas intencionais para verificar respostas neutras/redaction.

## Arquivos da entrega

Inventário líquido de fontes próprios: **23 novos, 31 alterados, 0 removidos**. Cliente Prisma foi regenerado pela ferramenta, fora dessa contagem; snapshot temporário de comparação foi removido. Sem alteração de agents.md, dependências/lockfile, migrations anteriores ou .env real.

### Novos

- docs/architecture/appointments-foundation.md
- prisma/migrations/20261001000600_appointments/migration.sql
- src/common/validation/utc-instant.spec.ts
- src/common/validation/utc-instant.ts
- src/domain/models/appointment.model.ts
- src/modules/appointments/appointment-timeline.source.spec.ts
- src/modules/appointments/appointment-timeline.source.ts
- src/modules/appointments/appointments.controller.ts
- src/modules/appointments/appointments.module.ts
- src/modules/appointments/appointments.service.spec.ts
- src/modules/appointments/appointments.service.ts
- src/modules/appointments/dto/appointment.dto.spec.ts
- src/modules/appointments/dto/appointment.dto.ts
- src/presentation/views/appointment.view.ts
- src/repository/appointment.repository.ts
- src/repository/prismaRepository/appointment-timeline-where.ts
- src/repository/prismaRepository/prisma-appointment.repository.spec.ts
- src/repository/prismaRepository/prisma-appointment.repository.ts
- test/appointments.e2e-spec.ts
- test/appointments.integration-spec.ts
- test/helpers/appointment-fixture.ts
- test/helpers/appointment-schemas.ts
- test/helpers/in-memory-appointments.ts

### Alterados

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
- test/helpers/create-test-app.ts
- test/helpers/in-memory-foundation.ts
- test/medications.e2e-spec.ts
- test/privacy.e2e-spec.ts

## Próximos passos e limites

Antes de produção: aplicar/revisar migrations em banco descartável e executar integração/concorrência; resolver formatação preexistente de agents.md com autorização; validar CI/SMTP/TLS, privilégios, backups/restauração/retention, logs/proxies/analytics e governança de saúde/crianças. Nenhum acesso a dados reais, upload/storage, compartilhamento externo ou etapa seguinte implementado.
