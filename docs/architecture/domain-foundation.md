# Fundação de domínio — Etapa 1

Data: 01/10/2026. Escopo: somente a Etapa 1 de `agents.md`, autorizada após a auditoria. Código implementado no backend existente, sem recriar o projeto, alterar o app, instalar dependências ou iniciar etapas posteriores. **Migration e integração PostgreSQL ainda precisam ser executadas em banco descartável.**

Nota posterior: este documento preserva as decisões e verificações da Etapa 1. Sessões, confirmação de email, recuperação e mudança do contrato de cadastro foram acrescentadas na [Etapa 2](account-security.md); as ausências descritas abaixo são históricas.

## Modelo e limites

O monólito continua usando controllers finos, DTOs, services, modelos de domínio, views públicas, interfaces em `repository` e implementações em `repository/prismaRepository`. Novos módulos: `users`, `dependents`, `consents` e `audit`. `auth`, `care-tasks`, validação, filtro de erros, segurança HTTP, pool, configuração, rate limit e CI foram reutilizados.

- **User:** mantém identidade/hash e passa a ter status ACTIVE/BLOCKED, emailVerifiedAt, updatedAt e deletedAt. Cadastro só cria ACTIVE; não há endpoint para atribuir status, confirmar email ou excluir a conta. `GET /me` usa a mesma projeção pública do login.
- **Dependent:** perfil mínimo com nome completo, nome preferido opcional, data de nascimento, criador e timestamps/exclusão lógica. Não há CPF, RG, endereço, diagnóstico ou outro dado clínico.
- **UserDependentAccess:** relação explícita, única por usuário/dependente, com papel, parentesco opcional, criação e revogação. Parentesco fica no vínculo porque pode ser diferente para cada responsável. Valores limitados a PARENT/LEGAL_GUARDIAN/OTHER, sem JSON livre. São declarações do usuário, não comprovação jurídica.
- **Consent:** eventos de aceite com titular, dependente opcional, tipo, versão, acceptedAt/revokedAt e metadata fixa `{ "source": "SELF_SERVICE" }`. Datas e titular são do servidor; metadata não é aceita no corpo nem retornada na view. Não há revogação/exportação nesta etapa.
- **AuditLog:** ator, ação, tipo/ID do recurso, dependente quando aplicável, timestamp e metadata minimizada. O contrato só permite anexar eventos; não há rota pública de consulta, escrita, edição ou remoção.

Prisma define os campos de armazenamento completos; modelos/contratos não obrigam consumidores a manipular metadata de armazenamento de consentimentos. As views enumeram campos públicos, sem serializar entidades Prisma. Registro de eventos de auditoria e logs técnicos têm finalidades distintas.

## Acesso

| Operação sobre dependente  | OWNER | EDITOR | VIEWER |
| -------------------------- | ----- | ------ | ------ |
| Listar/consultar           | Sim   | Sim    | Sim    |
| Editar perfil              | Sim   | Sim    | Não    |
| Excluir logicamente        | Sim   | Não    | Não    |
| Registrar aceite associado | Sim   | Não    | Não    |

Criar dependente é permitido a uma conta autenticada ativa; o servidor deriva o criador e cria OWNER na mesma transação. Não aceita userId, createdByUserId, role, deletedAt ou timestamps informados pelo cliente.

Vínculo ausente/revogado, papel insuficiente ou dependente excluído resulta em **404**, como um recurso inexistente. Listas não incluem recursos estrangeiros/excluídos. O vínculo também exige usuário ativo e não excluído. OWNER não é inferido de createdByUserId, nem um UUID válido autoriza acesso.

`DependentAuthorizationService` concentra a policy do serviço. Repositories repetem os filtros em leituras e nas próprias escritas condicionais, evitando que um update/delete apenas por ID contorne autorização. Consents retorna só eventos próprios, e eventos associados a dependentes exigem acesso atual na leitura; não expõe aceites de outros responsáveis.

Não foram criadas rotas de convite, concessão/alteração/revogação de vínculos ou transferência de OWNER. As relações múltiplas são suportadas pelo modelo e exercitadas por fixtures internas; a gestão pública dessas relações exige uma etapa autorizada, com validação e auditoria próprias.

## Transações

`UnitOfWorkRepository` oferece repositories associados à mesma transação, sem vazar Prisma para services. `PrismaUnitOfWorkRepository` usa transações interativas PostgreSQL/Prisma 7 com isolamento Serializable, maxWait/timeout de 5 segundos e até três tentativas apenas para P2034. Conflito persistente vira erro genérico 503; outros erros não são repetidos automaticamente.

Operações atômicas:

1. Cadastro: User + USER_CREATED; Argon2 é calculado antes da transação e JWT emitido após commit.
2. Criação: Dependent + vínculo OWNER + DEPENDENT_CREATED.
3. Alteração/exclusão: autorização + escrita condicionada + evento correspondente.
4. Aceite: ator/vínculo + Consent + CONSENT_ACCEPTED.

Falha de auditoria aborta a operação; não existe caminho de sucesso sem o evento obrigatório. Callbacks não podem enviar email, chamar storage/rede ou realizar efeitos externos, pois conflitos podem reexecutá-las. Leituras comuns não precisam de transação com escrita.

Referência utilizada: [transações Prisma 7](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions). Não foi adotada a API de outra major version nem criada uma transação genérica em cada controller.

## Conta, email e datas

O guard JWT existente continua validando assinatura, HS256, expiração, issuer, audience e subject. Agora consulta o usuário em cada requisição privada e recusa conta inexistente, BLOCKED ou excluída. Falha do banco não é mascarada como token inválido. Login também recusa contas inativas com mensagem genérica e mantém verificação Argon2/dummy.

Isso **não implementa sessões, refresh, logout, revogação individual, verificação de email ou recuperação**. Um token roubado de uma conta ainda ativa permanece utilizável até expirar.

Email continua globalmente único, inclusive após soft delete: **reserva do email excluído** para impedir reaproveitamento silencioso. DTO e repository normalizam trim/lowercase. Consultas normais excluem deletedAt preenchido; índices não são removidos. Não existe reaproveitamento automático, anonimização ou prazo de retenção definido. A constraint atual é de igualdade textual PostgreSQL; processos administrativos/importações não podem ignorar a normalização do contrato. Avaliar constraint case-insensitive/canonicalização no banco antes de introduzir esses escritores.

Timestamps são TIMESTAMPTZ(3); a API serializa instantes ISO/UTC. birthDate usa PostgreSQL DATE e ISO YYYY-MM-DD, validado por calendário real (inclusive ano bissexto), ano maior que zero e sem data posterior ao dia UTC corrente. Não é timestamp nem cálculo clínico de idade. Conversão para Date é exclusivamente meia-noite UTC para transporte com Prisma e volta a YYYY-MM-DD na view.

Exclusão de dependente apenas preenche deletedAt. Vínculos, consentimentos e audit permanecem armazenados e fora das leituras normais correspondentes. Novas FKs usam RESTRICT, não cascade. O cascade do exemplo legado care-tasks foi preservado; não há endpoint de exclusão física da conta. Soft delete não satisfaz sozinho um pedido de eliminação de dados.

## Políticas de consentimento

`CONSENT_POLICIES` é um objeto JSON validado na inicialização, com no máximo 20 entradas. Cada tipo tem nome de até 64 caracteres `[A-Z][A-Z0-9_]*`, versão de até 64 caracteres alfanuméricos/ponto/hífen/underscore e escopo ACCOUNT ou DEPENDENT. Campos extras, JSON inválido, versão vazia e escopos desconhecidos impedem inicialização sem imprimir o valor recebido.

O padrão é `{}`: **nenhuma política ativada**. Tipos desconhecidos, versões divergentes ou IDs incompatíveis com o escopo retornam 400. Para escopo DEPENDENT, um vínculo OWNER válido é obrigatório. Repetir aceite cria novo evento; não há deduplicação nem interpretação do efeito jurídico dessa repetição nesta fundação.

Exemplo estritamente fictício para ambiente de desenvolvimento/teste, não política jurídica do produto:

```dotenv
CONSENT_POLICIES={"DEMO_NOTICE":{"version":"demo-v1","scope":"ACCOUNT"},"DEMO_DEPENDENT":{"version":"demo-v1","scope":"DEPENDENT"}}
```

Após configurar/reiniciar, o cliente poderia enviar `{ "type": "DEMO_NOTICE", "policyVersion": "demo-v1" }`. O frontend deve apresentar o texto correspondente à versão aprovada antes de oferecer aceite. O backend desta etapa verifica identificador/versão/escopo, **não entrega textos, prova leitura ou define base legal**. Catálogo/texto imutável, finalidade, comprovação de representação, retenção, revogação e direitos do titular precisam de decisões nas próximas etapas. As políticas TEST_* são exclusivamente fixtures.

## API acrescentada

Prefixo: `/api/v1`. Todas as rotas abaixo exigem Bearer JWT.

| Método | Rota                          | Contrato                                                                     |
| ------ | ----------------------------- | ---------------------------------------------------------------------------- |
| GET    | /me                           | id, name, email, createdAt da própria conta                                  |
| POST   | /dependents                   | fullName, birthDate, preferredName opcional/null, relationship opcional; 201 |
| GET    | /dependents?limit=50&offset=0 | Array dos perfis acessíveis                                                  |
| GET    | /dependents/:id               | Perfil autorizado; 200/404                                                   |
| PATCH  | /dependents/:id               | fullName, preferredName ou birthDate presentes; 200/404                      |
| DELETE | /dependents/:id               | Exclusão lógica OWNER; 204/404                                               |
| POST   | /consents                     | type, policyVersion e dependentId conforme escopo; 201                       |
| GET    | /consents?limit=50&offset=0   | Array de aceites próprios visíveis                                           |

A view Dependent contém id, fullName, preferredName, birthDate, createdAt e updatedAt; não expõe createdByUserId, deletedAt ou todos os vínculos. A view Consent contém id, dependentId, type, policyVersion, acceptedAt e revokedAt; não expõe userId/metadata. UUIDs v4, limit 1–100 e offset 0–10000. Campos extras e patch vazio são recusados. preferredName pode receber null para limpeza; fullName/birthDate não.

Fluxo mínimo após cadastro/login:

```json
{
  "fullName": "Pessoa de exemplo",
  "preferredName": "Exemplo",
  "birthDate": "2020-02-29",
  "relationship": "PARENT"
}
```

Envie a POST /dependents, guarde o id retornado, consulte GET /dependents/:id e altere com PATCH `{ "preferredName": null }`. Outro usuário sem vínculo recebe 404. O contrato care-tasks permanece inalterado e separado, sem transformar seus dados em registros clínicos.

## Migration e operação

Nova migration: `prisma/migrations/20261001000200_domain_foundation/migration.sql`. A inicial foi preservada. A nova cria enums/tabelas/índices/FKs, amplia User e converte os timestamps existentes explicitamente com `AT TIME ZONE 'UTC'`; updatedAt dos usuários preexistentes é preenchido com createdAt. Não apaga registros nem reseta banco/volume. Usa BEGIN/COMMIT para atomicidade do DDL.

**Pré-condição:** validar que timestamps antigos realmente representam UTC antes de aplicar em banco existente. Se vierem de outro fuso, revisar a conversão antes da primeira aplicação, preservando os instantes. Alteração de tipos pode bloquear tabelas; planejar backup, janela e restauração em bases grandes. Uma migration já aplicada não deve ser editada.

Com Docker iniciado e credenciais locais previamente preparadas:

```powershell
npm run db:up
npm run prisma:deploy
npm run start:dev
```

Não foi executada a migration no banco local nem no ambiente de produção. Não apagar volume, rodar reset ou apontar testes para cuidare com dados reais.

Para integração real, provisionar **outro banco descartável chamado cuidare_test**, configurar TEST_DATABASE_URL e aplicar ambas as migrations nesse alvo. Pode executar migrations com DATABASE_URL/MIGRATION_DATABASE_URL temporárias do banco de testes, restaurando os valores do processo depois; não substituir .env de trabalho. A CI existente já declara PostgreSQL descartável, deploy e test:database, mas tem a pendência global de formato indicada abaixo.

## Verificações e regressões

- Prisma validate/generate, TypeScript, ESLint e build executados com sucesso.
- 58 testes unitários em 10 suítes: regras de calendário, configuração/policy, metadata segura, papéis/isolamento, exclusão lógica, projeções dos repositories, scope atômico, transações/retry/rollback e regressões existentes.
- 63 testes HTTP em 2 suítes: Nest/guard/DTO/Argon2 reais; isolamento A/B, OWNER/EDITOR/VIEWER, vínculo revogado, conta bloqueada/excluída/inexistente, raw JSON estrito, políticas, mass assignment, paginação e falhas de audit.
- Testes HTTP não passam as respostas por parsers que removem campos antes de verificar vazamentos; novas views usam schemas strict. O helper antigo agora inspeciona o JSON bruto de cadastro.
- Timeout de teste aumentado de 5 para 15 segundos para bootstrap Nest + Argon2 real, sem trocar o hash por mock. Teardown HTTP protege contra falha de setup; fixture de Unit of Work simula rollback/serializa escritas, sem pretender reproduzir locks do PostgreSQL.
- Adicionados quatro testes PostgreSQL para data civil/vínculos, isolamento/papéis, soft delete/consentimentos, rollback por falha FK do audit e unicidade após exclusão. Junto ao teste legado, há cinco casos preparados; **nenhum executado localmente**. test:database foi tentado e bloqueado no setup por ausência de TEST_DATABASE_URL. Docker client existe, mas engine Linux não está disponível.
- Formatação dos arquivos da entrega verificada. O check global/validate permanece com warning preexistente em agents.md, preservado; não foi escondido em ignore.
- Nenhuma dependência nova, alteração de secrets locais ou execução remota da CI.

## Pendências e limites

A fundação não declara conformidade LGPD nem prontidão para dados reais. Faltam integração real/migration aplicada, sessões/refresh e resposta de cadastro resistente à enumeração, políticas jurídicas/textos aprovados, exportação/eliminação/revogação, gestão de vínculos, readiness/redaction de bootstrap e controles de produção.

A audit trail é append-only **pela API/contrato**, não inviolável contra administrador/credencial de banco. Separação de identidade DDL/runtime, privilégios INSERT/SELECT adequados, restrição de UPDATE/DELETE, retenção, acesso administrativo rastreável e backup ainda exigem operação segura. IDs de usuário/dependente em audit também são dados protegidos; não publicar essa tabela.

A Etapa 2 só deve começar quando solicitada. O frontend não foi alterado.

## Arquivos desta entrega

O inventário abaixo registra os arquivos próprios novos/alterados; o cliente Prisma regenerado não entra na lista.

### Novos

- `docs/architecture/domain-foundation.md`
- `prisma/migrations/20261001000200_domain_foundation/migration.sql`
- `src/common/dto/pagination.dto.ts`
- `src/common/validation/birth-date.spec.ts`
- `src/common/validation/birth-date.ts`
- `src/config/consent-policies.ts`
- `src/domain/models/audit-log.model.ts`
- `src/domain/models/consent.model.ts`
- `src/domain/models/dependent.model.ts`
- `src/modules/audit/audit.module.ts`
- `src/modules/audit/audit.service.spec.ts`
- `src/modules/audit/audit.service.ts`
- `src/modules/consents/consents.controller.ts`
- `src/modules/consents/consents.module.ts`
- `src/modules/consents/consents.service.spec.ts`
- `src/modules/consents/consents.service.ts`
- `src/modules/consents/dto/accept-consent.dto.ts`
- `src/modules/dependents/dependent-authorization.service.ts`
- `src/modules/dependents/dependents.controller.ts`
- `src/modules/dependents/dependents.module.ts`
- `src/modules/dependents/dependents.service.spec.ts`
- `src/modules/dependents/dependents.service.ts`
- `src/modules/dependents/dto/create-dependent.dto.ts`
- `src/modules/dependents/dto/update-dependent.dto.ts`
- `src/modules/users/users.controller.ts`
- `src/modules/users/users.module.ts`
- `src/modules/users/users.service.ts`
- `src/presentation/views/consent.view.ts`
- `src/presentation/views/dependent.view.ts`
- `src/repository/audit-log.repository.ts`
- `src/repository/consent.repository.ts`
- `src/repository/dependent-access.repository.ts`
- `src/repository/dependent.repository.ts`
- `src/repository/prismaRepository/dependent-scope.ts`
- `src/repository/prismaRepository/prisma-audit-log.repository.ts`
- `src/repository/prismaRepository/prisma-consent.repository.ts`
- `src/repository/prismaRepository/prisma-dependent-access.repository.ts`
- `src/repository/prismaRepository/prisma-dependent.repository.ts`
- `src/repository/prismaRepository/prisma-foundation.repositories.spec.ts`
- `src/repository/prismaRepository/prisma-unit-of-work.repository.spec.ts`
- `src/repository/prismaRepository/prisma-unit-of-work.repository.ts`
- `src/repository/unit-of-work.repository.ts`
- `test/foundation.e2e-spec.ts`
- `test/foundation.integration-spec.ts`
- `test/helpers/in-memory-foundation.ts`

### Alterados

- `.env.example`
- `docs/architecture/current-state.md`
- `docs/architecture/v1-roadmap.md`
- `docs/security/security-review.md`
- `jest.config.cjs`
- `prisma/schema.prisma`
- `README.md`
- `SECURITY.md`
- `src/app.module.ts`
- `src/config/environment.spec.ts`
- `src/config/environment.ts`
- `src/domain/models/user.model.ts`
- `src/modules/auth/auth.module.ts`
- `src/modules/auth/auth.service.ts`
- `src/modules/auth/jwt-auth.guard.ts`
- `src/repository/prismaRepository/prisma-user.repository.ts`
- `src/repository/repository.module.ts`
- `src/repository/user.repository.ts`
- `test/api.e2e-spec.ts`
- `test/helpers/create-test-app.ts`
- `test/helpers/in-memory.repositories.ts`
- `test/setup-env.ts`
