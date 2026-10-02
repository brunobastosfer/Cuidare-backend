# Medicamentos — Etapa 5

Data: 01/10/2026. Escopo: somente Etapa 5 de agents.md, após a timeline existente. Etapa 6 não iniciada; consultas/documentos/vacinas/escola/desenvolvimento/compartilhamento continuam futuros. O projeto/app não foram recriados. Sem nova biblioteca, upgrade de versão, alteração de segredo ou execução de migration em banco real.

## Decisões e limites

Medication é um **produto privado do dependente**, com nome informado, não catálogo global/público ou referência farmacológica. MedicationTreatment é o uso informado desse produto por aquele dependente, com dosagem/unidade/frequência/via, datas civis, uso contínuo, instruções/prescritor/motivo/notas e estado. Um produto pode ser reutilizado em vários tratamentos do mesmo dependente. Duplicatas de nomes são permitidas: não inferir que nomes iguais sejam produtos clinicamente equivalentes.

Há modelos separados, interfaces em repository/medication.repository.ts e implementação em repository/prismaRepository/prisma-medication.repository.ts. Controller fino, MedicationsService para regras/policy/UnitOfWork, views explícitas e provider de timeline exportado pelo módulo. Monólito modular existente preservado.

Dosage/unit/frequency/instructions são **texto do responsável**, nunca dados para calculadora. “1 gota por kg” é armazenado literalmente; o backend não recebe peso para calcular, prescreve, indica produto, diagnostica ou afirma que informação registrada é clinicamente correta. PrescribedBy é texto informado, não assinatura/validação profissional. Não há catálogo/seed de medicamento real ou conteúdo médico gerado.

## Autorização e transações

Identidade vem do JWT/guard/sessão, dependentId vem da rota e a relação ativa é validada no backend. Todas as operações verificam UserDependentAccess e usam escopo adicional no where do repository: conta ativa/não excluída, vínculo não revogado e dependent/produto/tratamento não excluídos.

| Papel  | Produtos e tratamentos                                |
| ------ | ----------------------------------------------------- |
| OWNER  | Criar, listar/consultar, editar e excluir logicamente |
| EDITOR | Criar, listar/consultar e editar; não excluir         |
| VIEWER | Somente listar/consultar                              |

IDs filhos também devem pertencer ao dependentId da rota. Ter acesso a dois dependentes não permite misturar seus medicamentos/tratamentos. FK composta `(medicationId, dependentId) -> Medication(id, dependentId)` reforça essa integridade no PostgreSQL; UUID sozinho não concede acesso.

Escritas + audit e leituras autorizadas usam UnitOfWork Serializable existente. Falha de audit desfaz alterações; retries não fazem I/O externo nem mutam dados capturados pela callback. Produto não pode ser excluído enquanto existir qualquer tratamento não excluído (incluindo COMPLETED/SUSPENDED), com check transacional e predicado none no update. Tratamento/produto nunca são apagados fisicamente pela API. FKs RESTRICT; sem cascade clínico ou endpoint de purge.

## API

Prefixo `/api/v1`; todos os endpoints exigem Bearer token e vínculo adequado:

| Método | Rota                                             | Resultado                                                |
| ------ | ------------------------------------------------ | -------------------------------------------------------- |
| POST   | /dependents/:dependentId/medication-products     | Produto criado, 201                                      |
| GET    | /dependents/:dependentId/medication-products     | Array autorizado/paginado                                |
| GET    | /dependents/:dependentId/medication-products/:id | Produto, 200                                             |
| PATCH  | /dependents/:dependentId/medication-products/:id | Nome corrigido, 200                                      |
| DELETE | /dependents/:dependentId/medication-products/:id | Soft delete OWNER, 204; 409 se houver tratamento visível |
| POST   | /dependents/:dependentId/medications             | Tratamento criado, 201                                   |
| GET    | /dependents/:dependentId/medications             | Array autorizado/paginado                                |
| GET    | /dependents/:dependentId/medications/:id         | Tratamento + produto mínimo, 200                         |
| PATCH  | /dependents/:dependentId/medications/:id         | Campos permitidos/estado, 200                            |
| DELETE | /dependents/:dependentId/medications/:id         | Soft delete OWNER, 204                                   |

Listas reutilizam limit 1–100 (padrão 50) e offset 0–10000; ordenam createdAt desc/id asc. Cursor continua usado na timeline; contratos de listas existentes não foram refatorados.

Produto: corpo create/update `{ "name": "Produto fictício" }`, nome de 1–160 caracteres após trim.

Criar tratamento após criar produto (valores fictícios, **não orientação clínica**):

```json
{
  "medicationId": "<UUID v4 do produto do mesmo dependente>",
  "dosage": "Conforme orientação informada",
  "unit": "Texto informado",
  "frequency": "Periodicidade informada",
  "startDate": "2026-01-01",
  "continuousUse": false,
  "instructions": "Transcrição fictícia fornecida pelo responsável"
}
```

medicationId é obrigatório. Não há atalho medicationName: evita misturar criação implícita de produto/uso e mantém produto reutilizável com identidade explícita. É uma das alternativas previstas no escopo (medicationId ou medicationName).

Campos obrigatórios: medicationId, dosage (1–120), unit (1–60), frequency (1–160), startDate. Opcionais: route (até 100), instructions (2000), prescribedBy (120), reason (500), notes (2000), endDate, continuousUse (boolean false por padrão), status (ACTIVE por padrão). Textos opcionais aceitam null para remoção, não string vazia/branca. Instruções não são convertidas para objetos/doses numéricas.

PATCH permite somente campos clínicos editáveis/estado; medicationId, dependentId e IDs são imutáveis. Para trocar de produto, crie outro tratamento. Nome do produto pode ser corrigido no endpoint explícito e afeta a apresentação de todos seus tratamentos; não é snapshot de marca/nome por tratamento. Dados históricos de valores anteriores não são reconstruídos pelo audit, que guarda somente nomes de campos.

DTOs separados create/update, sem PartialType que aceitaria null em obrigatórios; whitelist recusa extras. completedAt, createdAt/updatedAt/deletedAt, userId/role/ownerId, documentId, weight e medicationName não são propriedades de cliente. UUID v4, strings limitadas, boolean real, arrays indevidos, datas impossíveis, update vazio e atributos internos são recusados.

Sem autorização/recurso fora do escopo/excluído: 404 genérico; UUID/payload inválido: 400; produto em uso/reabertura de conclusão: 409; sem sessão: 401. Erros internos não expõem driver, texto médico ou stack. Cache-Control no-store e headers/rate limiting existentes preservados.

## Datas e estados

startDate/endDate são **DATE / YYYY-MM-DD**, não instantes de administração. Vias/frequência/horários ficam como texto informado; não há scheduler/alarme de dose, timezone clínico inferido ou registro de ingestões.

startDate deve ser uma data válida não futura; esta V1 registra uso iniciado, sem estado PLANNED. endDate >= startDate quando presente. ACTIVE pode ter fim planejado no passado/futuro: sistema não afirma adesão, conclui automaticamente ou recomenda suspender. continuousUse expressa a rotina informada e não calcula data final.

ACTIVE e SUSPENDED podem alternar explicitamente, e ambos podem ir para COMPLETED. Conclusão exige endDate válida/não futura. COMPLETED é terminal: corrigir textos/datas mantendo integridade é permitido; reabertura exige novo tratamento. Não há inferência clínica nessa máquina de estados.

completedAt é timestamp UTC técnico gerado pelo servidor na primeira conclusão (incluindo cadastro histórico já COMPLETED), não a data clínica do fim. Não sai na API/exportação. Correções não o reescrevem. createdAt/updatedAt/deletedAt/completedAt usam TIMESTAMPTZ(3).

## Auditoria

Novas ações MEDICATION_CREATED/UPDATED/DELETED e MEDICATION_TREATMENT_CREATED/UPDATED/DELETED, recursos correspondentes. Log contém ator/IDs/dependente/ação/tempo; metadata vazia ou changedFields de allowlist compatível com recurso.

Valores de nome, dose, notas, motivo, prescritor e instruções **não** vão para audit/logs. A allowlist anterior de Dependent não foi ampliada inadvertidamente: campo notes em evento de dependente é recusado. Capturas de changedFields permanecem válidas após retry transacional; não incluem completedAt técnico.

## Integração com timeline

MedicationTimelineSource implementa TimelineSource sem nova tabela/event store. Fonte da verdade continua MedicationTreatment:

- MEDICATION_STARTED: startDate, createdAt, ID `medication-started:<treatmentUUID>`.
- MEDICATION_COMPLETED: endDate, completedAt, ID `medication-completed:<treatmentUUID>`; somente estado COMPLETED. Fim planejado/suspensão não viram conclusão.
- Títulos fixos “Tratamento registrado: início/conclusão”, summary null, sourceType MEDICATION_TREATMENT, sourceId do tratamento. Sem nome do produto, dose, via/frequência, motivo, notas ou prescritor. Datas e existência do evento ainda são sensíveis.
- Detalhes em GET /dependents/:dependentId/medications/:sourceId, com autorização própria.

O provider obtém top-k por tipo já filtrado no repository, agrega e limita antes do merge global. Colunas DATE exigem arredondamento correto de filtros UTC: from com hora posterior à meia-noite usa o próximo dia, to usa o dia correspondente. Keyset aplica comparação de data e, quando empata, namespace + UUID na direção solicitada; não truncar after com hora a igualdade do mesmo dia.

Corte técnico por createdAt para início e completedAt para fim impede incluir conclusões novas só porque tratamento é antigo. Persistem limites da Etapa 4: corte pela data armazenada, não pelo commit; relógios API/PG precisam sincronização; edições de datas podem reordenar e não há snapshot histórico imutável entre páginas. Soft delete/revogação prevalecem. Suspender/retomar não cria ciclos artificiais de início; uma ocorrência de início/conclusão por tratamento, audit registra mudanças.

## Privacidade e futura receita

Exportação JSON passa a schemaVersion **1.1**, adicionando medications e medicationTreatments com as mesmas views explícitas/datas civis. Somente dependentes OWNER selecionados/reautenticados, conta ativa e limites de itens/bytes já existentes; nenhum dependente implícito. Coleções são limitadas a max+1 e excesso falha, sem truncamento silencioso. Não exporta completedAt/deletedAt internos, hashes ou contas/vínculos de outros responsáveis.

A exportação contém saúde e pode conter profissionais/terceiros mencionados nos textos inseridos: app deve armazenar arquivo em local privado, nunca analytics/logs/backup público. Categoria MEDICATION em PRIVACY_RETENTION_DAYS é nullable/default null e cobre as duas entidades, sem prazo legal inventado ou expurgo. Pedidos anteriores não são reescritos. Fechar conta revoga acesso, mas não apaga registros do dependente de outros responsáveis.

Base/finalidade, representação de criança, necessidade dos campos opcionais, retenção, revisão/eliminação e processadores precisam validação jurídica/operacional antes de dados reais. Nenhum consentimento ou base legal universal foi presumido. Caso o controlador decida usar consentimento em operação específica, precisa validar e configurar a ligação entre política/escopo/versão e gate efetivo de processamento; existência de um aceite ou hasActive não autoriza tratamento automaticamente. Não se afirma conformidade integral.

Receita/documento: a Etapa 7 adicionará associação ao tratamento via módulo documents/FileStorageRepository, com mesmo dependentId/autorização, FKs e access audit. Hoje não há documento real, campo client documentId aceito, upload, storage público ou referência pendente não verificada. O módulo exporta contratos de domínio/repository extensíveis, sem acoplamento a fornecedor de storage ou criação antecipada do módulo futuro.

## Migration e índices

Nova migration `20261001000500_medications` preparada em prisma/migrations, com BEGIN/COMMIT:

- Tabelas medications/medication_treatments e enum MedicationTreatmentStatus.
- Acréscimos aos enums de auditoria, sem usar valores recém-adicionados em escritas dentro da migration.
- FKs RESTRICT de dependent e produto/dependent composto; PK/UUIDs, textos limitados, DATE e TIMESTAMPTZ.
- CHECK de produto/dosagem/unidade/frequência não vazios, endDate >= startDate e coerência COMPLETED/endDate/completedAt.
- Índices por dependentId/deletedAt/createdAt/id para listas, dependentId/deletedAt/startDate/id e dependentId/deletedAt/status/endDate/id para timeline, medicationId/dependentId/deletedAt para referências/exclusão. Unique (id,dependentId) sustenta FK composta.

Sem alteração das quatro migrations anteriores ou remoção de dados. Não aplicado banco local/produção; SQL/custom CHECKs, SSI concorrente e planos/performance devem ser validados em PostgreSQL descartável antes de implantação. Prisma não expressa esses CHECKs no schema: conservar SQL ao evoluir migrations. Reversão que removesse tabelas/enums seria destrutiva; usar backup e plano de roll-forward revisado, não drop automático.

## Verificações

- Suítes completas após os ajustes: **223 unitários (31 suítes) e 182 HTTP (6 suítes) aprovados**, incluindo todos os anteriores. Novos: 48 unitários e 44 HTTP; cinco casos PostgreSQL preparados.
- TypeScript estrito, ESLint, build, validação/generation do Prisma, Prisma formatter e formato dos fontes/docs suportados aprovados. SQL revisado; não aplicado.
- `npm run validate` executado: schema/tipos/lint aprovados; check global interrompe **somente por formatação preexistente de agents.md**, preservado byte a byte. Testes/build foram executados também separadamente, sem ocultar essa pendência.
- `npm run test:database` tentado: setup recusa ausência de TEST_DATABASE_URL exclusivo cuidare_test. Zero testes executados; seis suítes sem inicializar, total de **19 casos preparados** contando os 14 anteriores. Docker confirma engine Linux indisponível.
- Integração SQL/constraints/SSI/concorrência e EXPLAIN, migrations em banco, SMTP, CI remota/carga/produção não executados. Não usar banco com dados reais para testes.
- Primeiras verificações identificaram ajustes de fixtures/tipagem, lint, sintaxe de teardown e expectativa HTTP de exportação (200 existente, não 201); corrigidos sem mudar contrato da rota. Revisão encontrou closure mutável na conclusão/retry: corrigido e coberto por regressão. Suítes completas reexecutadas com aprovação.

Cobertura: CRUD de ambas as entidades, papéis/vínculos/revogação/soft delete/conta/sessão, A/B e mistura de filhos entre dependentes próprios, UUIDs/propriedades internas, textos/booleanos/datas/estados inválidos, transições e terminalidade, rollback de auditoria/retry, views mínimas, instrução textual sem cálculo, keyset asc/desc entre fontes e empates, período UTC com DATE, corte técnico de conclusão, exportação OWNER/opt-in/1.1/limite clínico, fechamento com outro responsável. Fixtures são fictícias, não seeds/recomendações.

Pendências: decisões jurídicas e gates específicos se base consent-based for adotada, retenção/eliminação operacional/canal de direitos, integração e implantação seguras, app/UI/armazenamento de dados de saúde, futura receita no módulo documents, histórico versionado de valores clínicos se exigido pelo produto, políticas de granularidade além de OWNER/EDITOR/VIEWER. Essas pendências não autorizam implementação da Etapa 6 neste turno.

## Inventário de alterações

22 arquivos novos, 33 alterados e nenhum excluído; client gerado/caches e arquivo temporário de diff não são fontes autorais.

### Novos

- `test/medications.integration-spec.ts`
- `test/medications.e2e-spec.ts`
- `docs/architecture/medications-foundation.md`
- `prisma/migrations/20261001000500_medications/migration.sql`
- `src/common/validation/civil-date.ts`
- `src/common/validation/civil-date.spec.ts`
- `src/domain/models/medication.model.ts`
- `src/modules/medications/medications.service.ts`
- `src/modules/medications/medications.service.spec.ts`
- `src/modules/medications/medications.module.ts`
- `src/modules/medications/medications.controller.ts`
- `src/modules/medications/medication-timeline.source.ts`
- `src/modules/medications/medication-timeline.source.spec.ts`
- `src/presentation/views/medication.view.ts`
- `src/presentation/views/medication.view.spec.ts`
- `src/modules/medications/dto/medication.dto.ts`
- `src/repository/medication.repository.ts`
- `test/helpers/medication-schemas.ts`
- `test/helpers/medication-fixture.ts`
- `test/helpers/in-memory-medications.ts`
- `src/repository/prismaRepository/prisma-medication.repository.ts`
- `src/repository/prismaRepository/prisma-medication.repository.spec.ts`

### Alterados

- `.env.example`
- `README.md`
- `docs/security/security-review.md`
- `test/privacy.e2e-spec.ts`
- `docs/architecture/v1-roadmap.md`
- `docs/architecture/timeline-foundation.md`
- `docs/architecture/privacy-foundation.md`
- `docs/architecture/current-state.md`
- `SECURITY.md`
- `docs/lgpd/privacy-by-design.md`
- `docs/lgpd/data-inventory.md`
- `src/app.module.ts`
- `prisma/schema.prisma`
- `src/config/privacy-settings.ts`
- `src/config/privacy-settings.spec.ts`
- `src/domain/models/timeline-event.model.ts`
- `src/domain/models/privacy.model.ts`
- `src/domain/models/data-retention.model.ts`
- `src/domain/models/audit-log.model.ts`
- `src/presentation/views/privacy.view.ts`
- `src/modules/dependents/dependent-timeline.source.ts`
- `src/modules/privacy/privacy.service.spec.ts`
- `test/helpers/in-memory-foundation.ts`
- `test/helpers/create-test-app.ts`
- `src/modules/timeline/timeline.module.ts`
- `src/repository/repository.module.ts`
- `src/modules/audit/audit.service.ts`
- `src/modules/audit/audit.service.spec.ts`
- `src/repository/unit-of-work.repository.ts`
- `src/repository/prismaRepository/prisma-unit-of-work.repository.ts`
- `src/repository/prismaRepository/prisma-unit-of-work.repository.spec.ts`
- `src/repository/prismaRepository/prisma-privacy.repository.ts`
- `src/repository/prismaRepository/prisma-privacy.repository.spec.ts`

agents.md, package.json/lock, secrets reais, scripts/CI e as quatro migrations anteriores permanecem inalterados. Fixture/contratos de privacidade foram evoluídos para as novas entidades, sem reduzir testes de segurança anteriores. Os números anteriores nos relatórios de etapas anteriores permanecem históricos.
