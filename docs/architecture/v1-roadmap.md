# Roadmap V1 — plano após a auditoria

Data: 02/10/2026. Fonte de escopo: `agents.md`. Etapa 0 concluída; **Etapas 1–9 implementadas no escopo inicial**, com migrations/integração real pendentes por indisponibilidade do ambiente. Veja [fundação de domínio](domain-foundation.md), [segurança de conta](account-security.md), [privacidade](privacy-foundation.md), [timeline](timeline-foundation.md), [medicamentos](medications-foundation.md), [consultas](appointments-foundation.md), [documentos](documents-foundation.md), [vacinas](vaccinations-foundation.md) e [educação](education-foundation.md). SMTP/ClamAV reais, governança/revisão de exclusão definitiva, ACL/storage/backup e canal de direitos seguem pendentes. Referências vacinais aprovadas/publicação humana ainda pendentes. As etapas 10–18 continuam planejamento, não autorizações automáticas de execução.

## Direção arquitetural

Manter um **monólito modular NestJS**, uma API e PostgreSQL/Prisma existentes. Preservar controllers finos, services/use cases, modelos, views/DTOs explícitos, interfaces em `repository` e implementações de banco em `repository/prismaRepository`. Não criar microsserviços, Kafka, event sourcing completo ou infraestrutura de filas sem uma necessidade demonstrada.

Baixo acoplamento significa interfaces/exports mínimos entre módulos; não consultar o Prisma ou tabelas de outro domínio diretamente no controller. Módulos permanecem fontes da verdade dos seus dados. Timeline agrega resumos autorizados; audit registra eventos minimizados e não vira depósito de payloads.

Criar entidade relacionada e sua autorização/auditoria de forma atômica quando necessário. A fundação introduziu UnitOfWorkRepository com repositories no mesmo cliente transacional e isolamento Serializable. Contratos futuros de storage serão independentes de fornecedor; implementações Prisma se aplicam à persistência de metadados, não ao conteúdo de arquivos.

## Módulos planejados e limites

| Módulo         | Responsabilidade V1                                                   | Base atual / limites                                                                                                                                                       |
| -------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth`         | Sessões, tokens, verificação de email, recuperação, rotação/revogação | Etapa 2 implementada com Argon2id/hash-only; banco real/SMTP e operação pendentes                                                                                          |
| `users`        | Identidade/perfil, status, email verificado e ciclo de vida da conta  | Fundação: perfil/status/datas; ciclo de vida completo ainda futuro                                                                                                         |
| `dependents`   | Perfil mínimo e relação `UserDependentAccess`                         | Fundação implementada com OWNER/EDITOR/VIEWER e exclusão lógica, sem CPF/RG/endereço                                                                                       |
| `audit`        | Registro de ator, ação, recurso, tempo e metadata segura              | Fundação de escritas implementada; proteção operacional/retention ainda pendentes                                                                                          |
| `privacy`      | Aceites/revogações, exportação, solicitação de exclusão e governança  | Etapa 3: JSON reautenticado/OWNER selecionado, retirada por escopo e pedido com soft delete; revisão final/governança jurídica pendentes                                   |
| `timeline`     | Histórico cronológico agregado e paginado por cursor                  | Etapas 4–9: fontes autorizadas de cadastro, medicamentos, consultas/recomendações upload documental e vacinação informada e relatórios escolares; projeções mínimas/keyset |
| `medications`  | Produto privado e tratamento informado do dependente                  | Etapa 5: CRUD autorizado, estados/audit, fontes mínimas de início/conclusão e exportação 1.1; sem calcular dose ou recomendar medicamento                                  |
| `appointments` | Consultas e recomendações registradas pelo responsável                | Etapa 6: CRUD por vínculo/consulta, estados explícitos, audit, fontes mínimas e exportação 1.2; sem geração clínica                                                        |
| `documents`    | Metadados, upload/download autorizado e storage privado               | Etapa 7: FileStorageRepository local privado, scan fail-closed, PDF/PNG/JPEG, quotas, audit/timeline e exportação 1.3 metadata-only                                        |
| `vaccinations` | Catálogo/calendário versionados e registro informado                  | Etapa 8: referências vazias até aprovação, CRUD/audit/doc protegido, comparação explícita sem aconselhamento, timeline e exportação 1.4                                    |
| `education`    | Matrícula e relatório escolar registrados pelo responsável            | Etapa 9: CRUD/audit, FKs compostas para links opcionais, relatório independente, timeline mínima e exportação 1.5; sem instituição/professor                               |
| `development`  | Catálogo referenciado e observações do responsável                    | Novo; sem diagnóstico ou classificação automática de atraso                                                                                                                |
| `sharing`      | Links seletivos, read-only, temporários e revogáveis                  | Novo; token de alta entropia armazenado como hash; nenhum módulo compartilhado implicitamente                                                                              |

Autorização é transversal: `DependentAuthorizationService` e repositories aplicam vínculos/papéis na fundação; módulos futuros devem usar essa capacidade desde sua criação, sem esperar a Etapa 12. `health`/observabilidade são infraestrutura, não domínio clínico. `care-tasks` permanece exemplo existente até decisão explícita sobre seu destino.

## Sequência das etapas

| Etapa                         | Entrega planejada                                                | Dependências / critério mínimo de saída                                                                                 |
| ----------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 0 — Auditoria                 | Estado atual, revisão de segurança e este roadmap                | Entrega desta solicitação; código preservado, riscos e verificações documentados                                        |
| 1 — Fundação de domínio       | User ampliado, Dependent, acesso explícito, Consent e AuditLog   | Decidir acesso/ciclo de vida/transações; criação com owner atômica; testes A/B e de menor privilégio                    |
| 2 — Autenticação              | Sessões, refresh rotativo/revogável, logout, email e recuperação | Evoluir auth existente; hashing de tokens, uso único, revogação/status e regressões SEC-01/04/05                        |
| 3 — Privacidade               | Exportação JSON, pedido de exclusão, revogação e inventário      | Retenção configurável e decisões jurídicas; exportação por escopo, sem cascade indiscriminado                           |
| 4 — Timeline                  | Interface comum, providers/read model, filtros e cursor          | Autorização do dependente obrigatória; sem duplicar conteúdo clínico completo                                           |
| 5 — Medicamentos              | Medication + MedicationTreatment                                 | Acesso, audit e timeline; instruções registradas, não dose calculada                                                    |
| 6 — Consultas                 | Consulta e recomendações quando cabíveis                         | Acesso, audit, timeline; informação fornecida pelo responsável                                                          |
| 7 — Documentos                | Metadados, storage abstrato e upload seguro                      | Whitelist/conteúdo real, tamanho, key do servidor, checksum, path safety, storage privado e hook de scanning            |
| 8 — Vacinas                   | Catálogo/calendário versionados e registros                      | Fonte/versão explícitas; sem seed médico inventado; acesso e timeline                                                   |
| 9 — Educação                  | Matrícula/relatório e referência a documento                     | Cadastro pelo responsável; acesso, audit e timeline; sem portal de escola                                               |
| 10 — Desenvolvimento          | Catálogo referenciado e observações                              | Origem/versionamento; NOT_OBSERVED/OBSERVED/NOT_APPLICABLE, sem diagnóstico                                             |
| 11 — Compartilhamento         | Escopos explícitos, token hash, expiração e revogação            | Acesso read-only por token, rate limit e regressões de travessia/escopo                                                 |
| 12 — Autorização centralizada | Revisão/consolidação de policies de todos os módulos             | Testar owner/editor/viewer, desconhecido e recursos de outros dependentes; nenhum módulo espera até aqui para autorizar |
| 13 — API                      | Contratos REST `/api/v1`, DTOs de resposta, paginação/OpenAPI    | Reutilizar prefixo/validação/filtro/request ID; preservar contratos existentes ou migrar explicitamente                 |
| 14 — Observabilidade          | Logs estruturados/redaction e live/ready                         | Redaction também no bootstrap; readiness PostgreSQL; auditoria e conteúdo clínico fora dos logs                         |
| 15 — Banco/performance        | Índices, constraints, integridade, cascades e migrations         | Padrões reais de consulta, UTC/data civil, soft delete, execução sem perda acidental e plano de recuperação             |
| 16 — Testes                   | Unitários, integração e E2E com PostgreSQL descartável           | Coverage por risco, respostas brutas, setup/teardown seguros e regressões dos achados                                   |
| 17 — Hardening                | Revisão OWASP, modelo de ameaças e checklist                     | Segurança de deploy, storage, secrets, uploads e dependências; sem major upgrade automático                             |
| 18 — Documentação             | README final, overview, ERD e operação                           | Documentar somente o instalado/implementado; exemplos fictícios e pendências claramente identificados                   |

Testes, segurança, atualização de documentação e autorização são requisitos de **cada etapa**, não atividades deixadas exclusivamente para 12/16/17/18. Problemas encontrados na auditoria devem gerar regressões na etapa que os corrigir. Não extrapolar a aprovação da auditoria para autorização de implementar etapas seguintes.

## Decisões que precisam de validação

1. **Acesso:** quais ações OWNER/EDITOR/VIEWER podem realizar, quem gerencia compartilhamento e exclusão, como retirar acesso e resolver múltiplos responsáveis. ID do dependente jamais basta.
2. **Conta/sessão:** Etapa 2 exige email confirmado por padrão, usa refresh rotativo com prazo absoluto e revogação por família/logout/reset; validar parâmetros e canal SMTP na implantação, rotação de chaves, retenção e futura compatibilidade com MFA sem obrigatoriedade nesta V1.
3. **Privacidade:** finalidade/base por operação, comprovação/representação do responsável, versão das políticas, retenção, exportação, anonimização e exclusão. O documento não define sozinho bases ou prazos legais.
4. **Dados:** `birthDate` como data civil; timestamps UTC explicitamente; unicidade de email após soft delete; nenhuma consulta normal inclui registros excluídos por acidente.
5. **Auditoria:** acesso ao audit, integridade, retenção, quais leituras/downloads registrar e quais metadados são necessários, sem conteúdo sensível integral.
6. **Storage:** Etapa 7 usa adaptador local privado e ClamAV fail-closed antes da persistência; sem upload em quarentena disponível nem bypass. Aprovar região/ACL/volume/backups/assinaturas/scanner, quotas globais e reconciliação controlada de órfãos antes de dados reais. Contrato permite futuro provedor cloud; signed URL não foi habilitada e exigirá autorização/prazo/revogação residual próprios.
7. **Compartilhamento:** módulos/campos, máxima expiração configurável, revogação imediata do link, minimização de IDs e proteção contra token em logs/referrer. Links são credenciais bearer, não identificação de um médico/escola.
8. **Timeline:** Etapa 4 adota agregação sob demanda, keyset global e cursor assinado/escopado com corte por criação. Não é snapshot histórico entre páginas: futuras alterações de datas podem reordenar eventos. Cada módulo novo deve implementar fontes autorizadas/minimizadas e índices reais; materialização ou mecanismos assíncronos somente se carga real justificar.
9. **Operação:** contexto Git/CI, disponibilidade de PostgreSQL descartável, menor privilégio, TLS, redaction, backups e limites compartilhados/concurrency conforme topologia real.
10. **Exemplo atual:** manter/remover/evoluir `care-tasks` somente com decisão explícita de compatibilidade; não reinterpretar os dados existentes como histórico clínico.

## Critérios transversais de aceite

- Reutilizar a estrutura e bibliotecas existentes; cada dependência nova exige necessidade e avaliação.
- DTOs separados e projeções de resposta; identity/owner/role derivados no backend.
- Testes de leitura/criação/alteração/exclusão com dois usuários/dependentes, papéis e recursos inexistentes; testar também relações entre IDs filhos e dependente.
- Formatter, lint, typecheck, testes e build ao fechar cada etapa, com registro fiel de falhas/limitações. Integração real só é aprovada após execução em banco descartável.
- Migrations revisadas, transações onde necessário e política de exclusão/retention aplicada a cada relação.
- Sem segredos ou conteúdo sensível em logs, fixtures, examples ou documentação; apenas dados fictícios em testes.
- A V1 organiza registros; não diagnostica, prescreve, calcula doses nem inventa referências de vacinas/desenvolvimento.

Antes de usar dados reais, resolver os bloqueadores da [revisão de segurança](../security/security-review.md) ainda abertos, em especial validação real de transações/sessões, canal de direitos/revisão de exclusão, governança de audit/privacy, ClamAV/storage/ACL e operação segura. O próximo passo potencial é a Etapa 10 — Desenvolvimento, **somente quando solicitada**, além de validar migrations/testes em PostgreSQL descartável, entrega SMTP e scanner real. Etapa 9 implementada no escopo inicial; Etapas 10–18 não iniciadas. Referências vacinais continuam sem conteúdo aprovado.
