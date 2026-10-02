# Privacidade — Etapa 3

Nota posterior — Etapa 5: [medicamentos](medications-foundation.md) amplia a exportação para schemaVersion 1.1 com produtos/tratamentos de dependentes OWNER explicitamente selecionados e adiciona retenção MEDICATION default null. Este relatório permanece histórico da Etapa 3; decisões jurídicas e eliminação definitiva continuam pendentes.

Data: 01/10/2026. Escopo: somente Etapa 3 de `agents.md`, após autenticação/sessões existentes. O app e os módulos clínicos não foram alterados; Etapa 4 não iniciada. Esta entrega fornece mecanismos técnicos, não certificação LGPD nem parecer jurídico.

## Arquitetura e reutilização

Monólito modular preservado. `privacy` tem controller fino, DTOs, PrivacyService, views explícitas, PrivacyRepository em `repository` e PrismaPrivacyRepository em `repository/prismaRepository`. UnitOfWork Serializable engloba snapshot/escritas/audit. PasswordService é exportado por AuthModule e reutiliza **a mesma instância e o mesmo limite Argon2**, não um serviço duplicado.

ConsentsService permanece dono dos aceites/revogação; PrivacyController apenas delega. JwtAuthGuard, filtros, validação, CORS, headers no-store, testes em memória e CI existentes foram reutilizados. Nenhuma dependência nova.

Snapshot autorizado é separado da representação por PrivacyExportFormatter genérico. JSON é o único formato instalado/aceito. PDF/ZIP futuros podem usar o mesmo snapshot e um formatter binário; exigirão transporte adequado e aprovação explícita, sem refazer autorização. Não foram instaladas ferramentas PDF/ZIP nem criada fila.

## Contratos

Todas as rotas exigem Bearer JWT e utilizam prefixo /api/v1.

| Método / rota                           | Corpo                                                                       | Resultado                                                                                                |
| --------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| POST /privacy/exports                   | format: JSON, password; dependentIds opcionais, no máximo 20 UUID v4 únicos | 200 JSON em attachment; 401/404/413/429 sem conteúdo parcial                                             |
| POST /privacy/account-deletion-requests | password, confirmation: DELETE_MY_ACCOUNT                                   | 202 com recibo PENDING_REVIEW, accountAccessClosed: true                                                 |
| POST /privacy/consents/:id/revoke       | vazio                                                                       | 200 com a view de consentimento existente; 404 para outro titular/desconhecido; 409 se não consent-based |

Campos extras, null, formato não suportado, UUID inválido e valores de confirmação incorretos são recusados. Cliente não escolhe userId, status, datas, política de retenção ou classificação jurídica.

### Exportação

Reautenticação por senha antes da leitura; hash/credentialVersion são revalidados dentro da transação, evitando usar prova antiga após reset concorrente. O formato público não contém senha/hash, tokens, credentialVersion, metadados de consentimento/audit ou dados de outros responsáveis.

Por padrão, **nenhum dependente** é exportado. Seleção explícita exige vínculo ativo **OWNER** e dependente não excluído. EDITOR/VIEWER continuam com suas permissões de consulta normais, mas não possuem exportação em massa. UUID desconhecido, sem acesso, revogado ou excluído retorna o mesmo 404; seleção mista inválida falha inteira, sem exportação parcial.

Incluídos: perfil próprio, cuidados próprios, aceites próprios da conta/dos dependentes selecionados, perfis/vínculos próprios OWNER selecionados, resumos seguros das próprias sessões, eventos de audit do próprio ator no escopo e histórico mínimo de exportações anteriores. Não são exportados vínculos/consentimentos/audit de outro responsável, mesmo para dependente compartilhado. Data de nascimento conserva data civil.

Essa projeção inicial **não é uma resposta integral a todo pedido jurídico de acesso/portabilidade**: registros de dependentes excluídos, vínculos antigos, dados retidos após fechamento, trilhas completas e registros operacionais exigem atendimento autenticado pelo controlador, com proteção de terceiros. Registrar isso como limitação, não alegar que a exportação satisfaz todos os direitos.

Cada coleção usa take=max+1 para detectar excesso, sem truncar silenciosamente. Padrões: 1000 itens por coleção e 2MiB UTF-8 por resposta; configuráveis, com teto 10000/10MiB. Seleção até 20 dependentes. Exportação HTTP limitada a 2/minuto por IP/rota; rate por processo ainda exige proteção compartilhada no gateway para escala. A transação mantém limite de tempo existente de 5s.

Conteúdo não é salvo em tabela, arquivo, bucket, URL ou email. PrivacyExportRecord guarda só UUID, titular, formato e tempo. DATA_EXPORTED e recibo são atômicos; evento significa geração autorizada, não prova de download/entrega. Content-Disposition usa nome fixo cuidare-export.json e Cache-Control no-store. Proteja o arquivo no aparelho; a resposta contém dados pessoais e potencialmente sensíveis.

Exemplo com dados fictícios, substituir a senha localmente sem registrá-la:

```json
{
  "format": "JSON",
  "password": "Senha longa fictícia do titular!",
  "dependentIds": []
}
```

### Solicitação de exclusão

**Exportar antes de fechar**, se desejado. Não há fase de cancelamento/restauração automática. Senha e confirmação literal são obrigatórias; senha é verificada fora da transação e revalidada contra hash/versão dentro dela.

Uma transação cria AccountDeletionRequest único por usuário com status PENDING_REVIEW e snapshot da política, marca User.deletedAt e BLOCKED, incrementa credentialVersion, revoga sessões/códigos pendentes e todos os vínculos de acesso desse usuário, e anexa ACCOUNT_DELETION_REQUESTED. Falha de audit desfaz tudo. Requisições concorrentes só podem gerar um fechamento/recibo.

Depois do commit, JWTs/refresh/login deixam de funcionar. Não é uma operação de eliminação física: dados, aceites, audit, credenciais revogadas e referências são preservados para revisão. Nenhum dependente é apagado por fechamento de um responsável. Outro OWNER mantém acesso; casos sem responsável ativo exigem revisão de representação/interesse da criança, sem atribuir novos responsáveis automaticamente.

Recibo informa id, status, requestedAt, retentionNotBeforeAt, accountAccessClosed e mensagem; não inclui identidade interna, política inteira, senha ou hash. Guarde-o: sessão fechada não consulta status no app. Atendimento/status pós-fechamento precisa de canal privado de identidade validada do controlador; esse canal e interface operacional **não estão implementados** e são bloqueadores recomendados antes de produção.

### Revogação

Política em CONSENT_POLICIES pode declarar consentBased=true **somente após validação jurídica da finalidade/base/texto**. Padrão false, incluindo registros legados e simples avisos/aceites. Essa classificação é salva no evento ao aceitar e nunca recebida do cliente. A migration não reclassifica históricos automaticamente.

Revogar um evento próprio consent-based retira **todos os aceites ativos do mesmo titular/type/dependentId**, inclusive repetições e versões antigas; não altera outro titular/escopo nem avisos não classificados. Repetição sem novo aceite é idempotente e não duplica audit. Uma nova manifestação posterior pode produzir novo aceite: revogar novamente pelo mesmo escopo retira esse aceite também.

A política não precisa continuar publicada. Titular pode retirar o próprio consentimento mesmo após perder o vínculo ao dependente; isso não lhe devolve acesso nem permite retirar o consentimento de outro responsável. Mensagens não distinguem consentimento inexistente de outro titular.

CONSENT_REVOKED é atômico. ConsentsService.hasActive fornece verificação de versão/escopo/vínculo para tratamentos futuros baseados em consentimento. Não foram arbitrariamente bloqueados login, perfil ou registros existentes cuja base não foi definida como consentimento. Nenhum módulo atual executa processamento opcional baseado nesses consentimentos; módulos futuros deverão verificar a validade efetiva antes de tratar dados, além de autorização. Revogação não apaga audit nem representa automaticamente eliminação.

## Retenção e encerramento definitivo

PRIVACY_RETENTION_DAYS aceita JSON estrito das categorias ACCOUNT, DEPENDENT, CARE_TASK, CONSENT, AUDIT, AUTH, ABUSE e PRIVACY. Valores: null ou dias inteiros de 0 a 36500; o teto é técnico, **não um prazo jurídico recomendado**. Padrão {} converte todas para null.

null significa decisão pendente/revisão obrigatória, **não autorização para retenção indefinida**. Número é parâmetro administrativo validado pelo controlador, não fundamento legal. Nenhuma categoria possui prazo legal inventado. O pedido salva snapshot completo; ACCOUNT calcula retentionNotBeforeAt a partir da solicitação. Mudanças posteriores de ambiente não reescrevem recibos. Outros parâmetros são preparação de governança, ainda sem motor de expurgo.

retentionNotBeforeAt é limite mínimo de revisão/eliminação quando aplicável, **não agendamento nem promessa de eliminação nessa data**. Mesmo 0 não apaga nada. Status continua PENDING_REVIEW até procedimento operacional explicitamente implementado/aprovado; não há worker, cron, endpoint administrativo de purge ou falsa marcação COMPLETED.

Plano a validar antes de implementar anonimização/eliminação:

1. Identificar agente responsável, finalidade/base de cada retenção, necessidade de prova, pendências, representação do dependente e eventual preservação juridicamente necessária; registrar decisão minimizada e comunicar o titular pelo canal validado.
2. Separar dados exclusivos da conta, dados de dependentes compartilhados e registros de outros responsáveis. Rever casos sem OWNER ativo e futuras referências de documentos/compartilhamento; nunca inferir autorização jurídica somente do papel técnico.
3. Quando não houver necessidade de identificação, minimizar/remover nome, email e credenciais. Manter UUID/relacionamentos técnicos pode ser **pseudonimização**, não anonimização. Avaliar reidentificação e validar a estratégia; email único reservado exige decisão explícita sobre tombstone/reuso antes de mudança.
4. Preservar somente os registros técnicos/jurídicos efetivamente necessários com acesso restrito e prazo aprovado. FKs de audit/criador/consentimentos/pedido RESTRICT impedem apagar User diretamente; se um tombstone mínimo for necessário, isso não significa eliminação integral.
5. Para eliminação definitiva autorizada, revisar relações e esquema antes de qualquer exclusão; credenciais/recibos/aceites/audit não devem ser descartados em cascata. CareTask ainda tem cascade legado, registrado no inventário; não é utilizado pelo fechamento.
6. Integrar backups/restauração, SMTP/processadores e futura comunicação de revogação/eliminação, sem apagar volume indiscriminadamente. Definir expurgo verificável, supervisão, evidência minimizada e confirmação ao titular. Não restaurar conta encerrada inadvertidamente por backup.

Detalhes por entidade e medidas: [inventário](../lgpd/data-inventory.md) e [privacy by design](../lgpd/privacy-by-design.md).

## Banco e verificações

Migration: **20261001000400_privacy_foundation**. Acrescenta consent_based=false, índices por escopo, enums/eventos e tabelas mínimas de exportação/pedido com FKs RESTRICT. Não reclassifica aceites, não apaga dados e não altera migrations anteriores. **Não aplicada localmente**, Docker Linux engine indisponível.

Após ambiente disponível, aplicar migrations em banco de desenvolvimento ou descartável cuidare_test. Usar npm run prisma:deploy; teste real exige TEST_DATABASE_URL para cuidare_test e migrations previamente aplicadas com conexão de teste. Rever premissa UTC da migration da Etapa 1 e backups antes de banco existente. Nunca usar migrate reset, truncate ou excluir volume como atalho.

Verificações finais:

- Prisma schema/client, typecheck, ESLint e build aprovados. Formatação dos arquivos desta entrega aprovada; validate global para apenas no formato preexistente de agents.md, preservado e não ignorado.
- **126 unitários em 22 suítes e 107 HTTP em 4 suítes aprovados**; 28 unitários e 28 HTTP adicionados, preservando as regressões das etapas anteriores.
- Cobertura: isolamento entre titulares, OWNER/EDITOR/VIEWER e acesso revogado/dependente excluído, projeções estritas/hash-only, quantidade/bytes/DTO/rate, reautenticação e reset concorrente, fechamento concorrente, preservação de outro responsável, retirada por escopo/versão/idempotência e rollback de audit.
- Quatro casos PostgreSQL novos preparados: snapshot/OWNER, fechamento concorrente, revogação concorrente e rollback FK. Total com anteriores: **12 casos em 4 suítes**, nenhum executado localmente. test:database foi tentado e recusado no setup por ausência de TEST_DATABASE_URL para cuidare_test; Docker engine indisponível. A migration não foi aplicada.
- npm audit reportou **zero vulnerabilidades** nesta execução; retrato, não garantia permanente. Nenhuma dependência nova; package/lock, agents.md e migrations anteriores confirmados sem alterações por hashes. Nenhum arquivo preexistente removido.
- Testes HTTP utilizam Nest/guards/Argon2 reais com persistência em memória, não provam locks/queries PostgreSQL. Um primeiro teste novo identificou vazamento de configuração entre fixtures via ConfigService.set; as fixtures foram isoladas e toda a suíte reexecutada com aprovação. Não altera ambiente real.
- CI remota, SMTP real, testes de carga/produção e processo jurídico/operacional final não foram executados.

Limitações: governança jurídica/retention/canal de direitos, revisão/anonimização/eliminação definitiva operacional, exportações grandes/assíncronas, proteção de abuso compartilhada, testes PostgreSQL/carga/produção, backups/TLS/privilégios e proteção dos arquivos pelo app. Não foram inventados textos jurídicos, responsável legal, região de hospedagem ou políticas clínicas.

## Inventário de alterações

23 arquivos novos e 32 alterados; client Prisma gerado e caches/dependências não contam como fontes autorais. Lista abaixo.

### Novos

- `docs/architecture/privacy-foundation.md`
- `docs/lgpd/data-inventory.md`
- `docs/lgpd/privacy-by-design.md`
- `prisma/migrations/20261001000400_privacy_foundation/migration.sql`
- `src/config/privacy-settings.spec.ts`
- `src/config/privacy-settings.ts`
- `src/domain/models/data-retention.model.ts`
- `src/domain/models/privacy.model.ts`
- `src/modules/privacy/json-privacy-export.formatter.ts`
- `src/modules/privacy/privacy-export-formatter.ts`
- `src/modules/privacy/privacy.controller.ts`
- `src/modules/privacy/privacy.module.ts`
- `src/modules/privacy/privacy.service.spec.ts`
- `src/modules/privacy/privacy.service.ts`
- `src/modules/privacy/dto/privacy.dto.ts`
- `src/presentation/views/privacy.view.spec.ts`
- `src/presentation/views/privacy.view.ts`
- `src/repository/privacy.repository.ts`
- `src/repository/prismaRepository/prisma-privacy.repository.spec.ts`
- `src/repository/prismaRepository/prisma-privacy.repository.ts`
- `test/privacy.e2e-spec.ts`
- `test/privacy.integration-spec.ts`
- `test/helpers/privacy-fixture.ts`

### Alterados

- `.env.example`
- `README.md`
- `SECURITY.md`
- `docs/architecture/account-security.md`
- `docs/architecture/current-state.md`
- `docs/architecture/v1-roadmap.md`
- `docs/security/security-review.md`
- `prisma/schema.prisma`
- `src/app.module.ts`
- `src/config/consent-policies.ts`
- `src/config/environment.ts`
- `src/domain/models/audit-log.model.ts`
- `src/domain/models/consent.model.ts`
- `src/modules/audit/audit.service.ts`
- `src/modules/auth/auth.module.ts`
- `src/modules/consents/consents.module.ts`
- `src/modules/consents/consents.service.spec.ts`
- `src/modules/consents/consents.service.ts`
- `src/repository/consent.repository.ts`
- `src/repository/dependent-access.repository.ts`
- `src/repository/repository.module.ts`
- `src/repository/unit-of-work.repository.ts`
- `src/repository/user.repository.ts`
- `src/repository/prismaRepository/prisma-consent.repository.ts`
- `src/repository/prismaRepository/prisma-dependent-access.repository.ts`
- `src/repository/prismaRepository/prisma-foundation.repositories.spec.ts`
- `src/repository/prismaRepository/prisma-unit-of-work.repository.spec.ts`
- `src/repository/prismaRepository/prisma-unit-of-work.repository.ts`
- `src/repository/prismaRepository/prisma-user.repository.ts`
- `test/helpers/create-test-app.ts`
- `test/helpers/in-memory-foundation.ts`
- `test/helpers/in-memory.repositories.ts`
