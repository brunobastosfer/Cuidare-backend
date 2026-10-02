# Linha do tempo — Etapa 4

Data: 01/10/2026. Implementação limitada à Etapa 4 de `agents.md`; Etapa 5 não iniciada. O backend existente foi preservado: monólito modular, controllers finos, services, modelos, views, interfaces em repository e Prisma isolado na infraestrutura. Não foi recriado projeto, alterado o app, instalado pacote, atualizado versão ou modificado secret.

Nota posterior — Etapa 5: a [fonte de medicamentos](medications-foundation.md) adiciona MEDICATION_STARTED/MEDICATION_COMPLETED. O restante deste relatório permanece histórico da entrega da Etapa 4, inclusive seu limite de um evento real/sem migrations.

## Decisão arquitetural

Agregação sob demanda, não tabela TimelineEvent, event sourcing ou espelho clínico. Os módulos permanecem fontes da verdade. `TimelineSource` é um contrato de leitura em `repository/timeline-source.repository.ts`; cada módulo exporta seu provider, que usa os repositories transacionais existentes. `TimelineModule` registra as fontes, sem importar ORM. `DependentTimelineSource` pertence a dependents; helpers de comparação/consulta estão no domínio, sem dependência do módulo timeline.

Fluxo: guard JWT/sessão -> DTO -> TimelineController -> TimelineService -> UnitOfWork Serializable -> autorização do vínculo + providers/repositories escopados -> merge global -> view explícita. Nenhum I/O externo dentro da transação/retry; autorização e dados são lidos no mesmo snapshot PostgreSQL de cada página.

Somente `DEPENDENT_CREATED`, fonte `DEPENDENT`, está registrado hoje. Origem: Dependent.createdAt, ID `dependent-created:<uuid>`, título fixo “Dependente cadastrado”, summary null. **Cadastro no Cuidarê não é nascimento**. Não expõe fullName, preferredName, birthDate, criador, vínculos ou dados de outros responsáveis. Alterar perfil não cria falso evento clínico ou histórico de todas as alterações. AuditLog permanece trilha técnica privada e care-tasks permanece exemplo sem relação com dependente.

Hoje cada dependente tem no máximo um evento real. Paginação multi-evento/multi-fonte foi testada com fixtures explicitamente sintéticas; não se criaram medicamentos/consultas/vacinas/documentos/relatórios/marcos para preencher a timeline. Essas integrações são entregas posteriores.

## Contrato HTTP

`GET /api/v1/dependents/:dependentId/timeline` exige JWT válido e vínculo ativo OWNER, EDITOR ou VIEWER. Não há escrita, compartilhamento público ou gestão de vínculos nessa rota.

| Query  | Contrato                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------- |
| limit  | Inteiro de 1–100; padrão 50                                                                           |
| order  | asc ou desc; padrão desc                                                                              |
| from   | Início inclusivo opcional; timestamp UTC com Z, segundos obrigatórios, fração de 1–3 dígitos opcional |
| to     | Fim inclusivo opcional; mesmo formato de from; não anterior ao início                                 |
| type   | Um tipo registrado; atualmente DEPENDENT_CREATED                                                      |
| cursor | nextCursor da página anterior; até 1024 caracteres; não aceitar offset                                |

Exemplo: `GET /api/v1/dependents/<uuid>/timeline?order=asc&limit=20&from=2026-01-01T00:00:00Z&type=DEPENDENT_CREATED`.

Resposta conceitual (IDs fictícios):

```json
{
  "items": [
    {
      "id": "dependent-created:11111111-1111-4111-8111-111111111111",
      "dependentId": "11111111-1111-4111-8111-111111111111",
      "type": "DEPENDENT_CREATED",
      "title": "Dependente cadastrado",
      "eventDate": "2026-01-01T12:00:00.000Z",
      "summary": null,
      "sourceId": "11111111-1111-4111-8111-111111111111",
      "sourceType": "DEPENDENT",
      "createdAt": "2026-01-01T12:00:00.000Z"
    }
  ],
  "nextCursor": null,
  "hasMore": false
}
```

Seguir nextCursor mantendo identidade, dependente, filtros e ordem. limit pode mudar. Sem mais itens: nextCursor null/hasMore false; período vazio retorna items []. Campos extras, arrays em filtros escalares, UUID inválido, datas civis/sem timezone/offset e filtros inválidos retornam 400. Sem vínculo, vínculo revogado ou dependente excluído/inexistente: mesmo 404 genérico. Conta/sessão inválida: 401.

sourceType/sourceId identificam a origem; detalhes atuais no endpoint `GET /api/v1/dependents/:sourceId`, com autorização própria. Cursor/ID do evento jamais substitui essa verificação. Views enumeram somente campos do contrato e respostas herdam Cache-Control no-store.

## Ordenação, cursor e consistência

Keyset global por `(eventDate, id)`, ambos na direção solicitada. ID qualificado estável e único; comparação textual determinística por códigos, sem localeCompare. Cada fonte aplica período/tipo/corte/keyset **antes** de limitar a limit+1 e retorna seus primeiros candidatos nessa ordem. O agregador ordena os candidatos, usa um item extra para hasMore e entrega somente limit. Não varre todo o histórico nem usa offsets.

Cursor versionado tl1: payload base64url e HMAC-SHA256 com domínio separado usando JWT_SECRET existente; verificação timingSafeEqual e forma canônica da assinatura. Escopo é HMAC de titular/dependente/datas/tipo/ordem, não IDs em texto nesses campos. Payload estrito contém versão, hash de escopo, snapshotAt, expiração e última posição. Expira 30 minutos após primeira página, sem renovação por paginação. Adulteração, uso cruzado, filtros alterados ou expiração recebem 400 genérico. Rotação do segredo invalida cursores existentes.

**Assinado não significa cifrado/anônimo.** Posição/data e ID qualificado são decodificáveis; ID pode conter UUID da fonte. Cursor não concede qualquer acesso e não deve ir para logs/analytics ou URLs públicas. HTTPS e redaction de query no proxy precisam configuração de implantação. Não se introduziu secret novo nem armazenamento de cursor.

Corte `createdAt <= snapshotAt` mantém inserções posteriores fora do percurso, mesmo se eventDate for retrodatado. Cada página revalida permissão/soft delete e usa transação consistente. **Não é snapshot histórico persistente entre requisições:** futuras alterações de eventDate podem mover eventos, e exclusões/retirada de acesso devem prevalecer. Para cadastro atual, createdAt/ID são imutáveis. Corte é hora UTC do servidor; relógios da API/PostgreSQL devem estar sincronizados. Eventos com eventDate futuro podem aparecer caso a fonte futura represente agendas; o corte é pela criação, não pela data do evento.

Provider com campo extra, dependente/tipo/origem fora do contrato, resumo >240 caracteres, título >120, timestamp inválido, duplicata ou mais de take itens falha fechado, sem resposta parcial. Isso é defesa contra erros de integração, **não sanitização automática de texto médico**. Revisar minimização de cada fonte humana/explicitamente; nunca colocar receita/laudo/dose/observações completas no resumo.

## Índices e migrations

**Nenhuma migration criada; schema e quatro migrations anteriores preservados.** A única fonte real busca um dependente por PK UUID e verifica vínculo ativo:

- Dependent.id: índice PK; no máximo uma linha, sem varredura cronológica.
- UserDependentAccess(userId, dependentId): unique existente; papel/revogação e estado da conta verificados pelo escopo existente.
- User.id: PK para estado ativo/não excluído.

Índice por eventDate/createdAt adicional para esta consulta unitária não melhoraria a seleção e duplicaria custo de escrita. Cada fonte multi-linha futura deve introduzir/revisar índices no módulo de origem, por exemplo `(dependentId, eventDateDaFonte, id)`, filtros de soft delete/tipo e plano real PostgreSQL. Não se inventou índice de coluna/tabela inexistente. Migrations existentes continuam precisando aplicação em ambiente descartável.

## Como integrar o próximo módulo

1. Implementar seu domínio/repository Prisma/autorizações conforme a etapa autorizada, sem gravar cópia integral em timeline.
2. Adicionar tipos reais em TIMELINE_EVENT_TYPES e testar contrato; provider exportado pelo módulo implementa TimelineSource.
3. Consultar fonte por dependentId **e vínculo/política atual**, usando repositories da mesma UnitOfWork; nunca confiar só no guard ou ID.
4. Projetar IDs qualificados imutáveis, origem UUID, datas UTC, título/resumo mínimos. Separar eventDate (fato/agenda) de createdAt (registro). Não criar diagnóstico/recomendação.
5. Aplicar bounds e keyset na consulta antes de take; múltiplos tipos em uma fonte exigem top-k correto entre subconsultas. Ordem de empate deve corresponder à comparação global, não à collation local por acidente.
6. Registrar/exportar fonte no TimelineModule; evoluir TransactionRepositories se necessário. Não adicionar HTTP/storage externo no retry da transação.
7. Testar empates nas duas direções, filtros inclusivos, inserções retrodatadas, isolamento A/B, papéis, revogação, soft delete, propriedade excessiva e PostgreSQL. Atualizar inventário de dados e documentação.

Materialização/outbox/filas só serão avaliadas com carga medida. Não há microsserviços, Kafka, jobs ou evento de saúde inventado nessa etapa.

## Verificações e pendências

- Suíte completa: **175 testes unitários (26 suítes) e 138 HTTP (5 suítes) aprovados**, incluindo os anteriores. Novos: 49 unitários e 31 HTTP; dois casos PostgreSQL preparados, não executados.
- Schema Prisma, geração do client, TypeScript estrito, ESLint e build aprovados; formato dos arquivos criados/alterados verificado separadamente.
- `npm run validate` executado: schema/tipos/lint passam e o check global de formato interrompe somente por `agents.md` preexistente. Arquivo de instruções preservado byte a byte; testes/build executados também fora desse comando. Não foi ocultado/excluído do check.
- `npm run test:database` tentado: setup bloqueado pela ausência de TEST_DATABASE_URL exclusivo; 0 testes executados, cinco suítes sem inicializar. Docker confirma engine Linux indisponível.
- Inventário por hashes confirmou 18 arquivos novos, 9 alterados e nenhum excluído; package/lock, schema, migrations e repositories existentes inalterados.
- Na primeira execução, IDs de fixtures sintéticas usavam underscore no namespace e violavam o contrato; fixtures corrigidas. Uma tipagem de jest.fn foi ajustada ao contrato da versão instalada. As suítes completas foram reexecutadas com aprovação.

Cobertura nova: cursor/assinatura/versão/expiração/escopo, projeção e fonte, merge global/keyset/limites/período/snapshot, falhas de provider, OWNER/EDITOR/VIEWER, IDOR A/B e desconhecidos, revogação/soft delete/status/sessão, DTOs/propriedades excessivas, resposta minimizada/cache/erros. Fixtures de ordenação são sintéticas, não seeds clínicos.

Limite de consistência adicional: o corte compara a data de criação armazenada, não o horário de commit. Uma transação iniciada antes do corte e concluída depois pode aparecer numa página posterior, pois PostgreSQL now() usa o início da transação. Isso reforça que o cursor não promete snapshot histórico imutável entre requisições; avaliar requisitos e carga ao adicionar fontes multi-linha.

PostgreSQL: dois novos casos preparados em timeline.integration-spec (fontes reais, datas, isolamento, papéis, revogação e exclusão), mais os 12 casos anteriores. Engine Docker não disponível; TEST_DATABASE_URL exclusivo não configurado. Não houve execução bem-sucedida dos casos, aplicação de migrations, EXPLAIN/medição de performance, SMTP ou CI remota. Não usar dados reais sem resolver pendências de segurança/operação/governança das etapas anteriores.

## Inventário de alterações

18 arquivos novos e 9 alterados; nenhum excluído, nenhuma migration/pacote novo. Gerados/caches não contam como fontes autorais.

Novos:

- docs/architecture/timeline-foundation.md
- src/domain/models/timeline-event.model.ts
- src/domain/timeline-query.ts
- src/modules/dependents/dependent-timeline.source.ts
- src/modules/dependents/dependent-timeline.source.spec.ts
- src/modules/timeline/dto/list-timeline.dto.ts
- src/modules/timeline/timeline.controller.ts
- src/modules/timeline/timeline-cursor.service.ts
- src/modules/timeline/timeline-cursor.service.spec.ts
- src/modules/timeline/timeline.module.ts
- src/modules/timeline/timeline.service.ts
- src/modules/timeline/timeline.service.spec.ts
- src/presentation/views/timeline.view.ts
- src/presentation/views/timeline.view.spec.ts
- src/repository/timeline-source.repository.ts
- test/helpers/timeline-fixture.ts
- test/timeline.e2e-spec.ts
- test/timeline.integration-spec.ts

Alterados:

- README.md
- SECURITY.md
- docs/architecture/current-state.md
- docs/architecture/v1-roadmap.md
- docs/lgpd/data-inventory.md
- docs/lgpd/privacy-by-design.md
- docs/security/security-review.md
- src/app.module.ts
- src/modules/dependents/dependents.module.ts

agents.md, .env, configuração de ambiente, package.json/lock, ORM/schema, migrations e contratos/implementações dos repositories existentes foram preservados. A nova fonte **reutiliza** findForUser e dependentScope; não replica autorização ou SQL no módulo.
