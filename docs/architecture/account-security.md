# Segurança de conta — Etapa 2

Data: 01/10/2026. Implementação autorizada da Etapa 2 de agents.md, sobre a fundação existente. Nenhuma funcionalidade de privacidade/saúde das etapas seguintes foi iniciada. Código e testes em cuidare-backend; o app não foi alterado.

Nota posterior: este documento preserva a entrega e verificações da Etapa 2. A [Etapa 3](privacy-foundation.md) acrescentou reautenticação para privacidade e fechamento lógico de conta com revogação; as ausências descritas como futuras aqui são históricas.

## Decisões e contrato

Mantidos NestJS, Argon2id, DTOs/validação, JWT HS256, views explícitas, interfaces de repository, Prisma centralizado e UnitOfWork Serializable. Controllers não usam ORM. Novos contratos de persistência: AuthSessionRepository, AccountTokenRepository e AuthRateLimitRepository. A implementação SMTP é infraestrutura atrás de AccountNotificationGateway.

**Mudanças intencionais de API:**

- POST /auth/register agora retorna **202** com `{ "message": "Solicitação recebida." }`, tanto para email novo quanto existente, bloqueado ou excluído. Não retorna usuário, sessão ou 409 de unicidade. Cadastro duplicado não altera nome/senha e email excluído continua reservado. Limites HTTP ainda podem retornar 429, sem depender da existência de conta.
- Cadastro não autentica automaticamente e não envia confirmação automaticamente. O cliente chama request-email-verification, apresenta o código ao usuário e conclui verify-email; depois chama login.
- Login/refresh retornam accessToken, tokenType, expiresIn, refreshToken, refreshExpiresIn e user com os mesmos campos públicos de antes. **Refresh aparece somente nessa resposta de credenciais**, nunca no perfil/entidade User.
- Access JWT agora exige sub, sid, cv, tokenUse=access, exp, issuer/audience e HS256. Tokens legados sem sessão **não são aceitos**; é necessário novo login após deploy.
- O guard consulta usuário e sessão ativa em cada requisição: conta ACTIVE/não excluída, versão atual, titular correto e sessão não revogada/expirada. Falha do banco não vira falso erro de assinatura.
- AUTH_REQUIRE_VERIFIED_EMAIL=true é padrão e obrigatório em produção. Conta não verificada recebe o mesmo 401 de credenciais inválidas. Em desenvolvimento com dados fictícios, false é permitido explicitamente; os testes de regressão usam esse ajuste, e um teste específico habilita a exigência.
- Recuperação/solicitação de confirmação usam 202 neutro, sem códigos no JSON. Com transporte desativado, ambas respondem 503 **para qualquer endereço, antes da consulta de usuário**, sem fingir envio.

O frontend ainda precisa adaptar o novo fluxo de cadastro e usar armazenamento seguro de credenciais (Keychain/Keystore) e transporte HTTPS. Não gravar tokens em AsyncStorage, URLs, analytics ou logs. Não há autenticação por cookie nem implementação de CSRF baseada em cookies.

## Sessões e refresh

AuthSession tem UUID, titular, credentialVersion, authenticationMethod=PASSWORD, criação, expiração absoluta e revogação. O método explícito cria uma fronteira para exigir outra prova antes de iniciar sessão no futuro; **MFA não foi implementada nem simulada**.

RefreshCredential pertence à sessão e guarda somente hash SHA-256, criação, expiração e usedAt. Tokens opacos têm 32 bytes aleatórios (256 bits), prefixos separados rf_/ev_/pr_ e hash com separação de finalidade. SHA-256 é apropriado aqui para segredos aleatórios de alta entropia, não para senhas humanas, que continuam Argon2id.

Refresh consome o registro anterior condicionalmente e cria o próximo na mesma transação da auditoria. A expiração não é estendida: a família termina no expiresAt inicial. Usar token já consumido revoga **toda aquela sessão/família**, incluindo acesso JWT, mas não sessões independentes. Credencial desconhecida/expirada/revogada recebe 401 genérico.

A revogação por replay é confirmada no banco **antes de lançar 401**. Lançar a exceção dentro da transação faria rollback da defesa. Transações concorrentes são Serializable, com até três tentativas para P2034; disputas P2002 especificamente de criação de buckets recebem o mesmo retry limitado, não se confundindo com emails duplicados.

**Não há período de tolerância para replay.** Clientes devem serializar refresh por sessão e salvar a nova credencial antes de novas tentativas. Duas chamadas simultâneas ou retry do token antigo após resposta perdida podem revogar a família; o cliente deverá pedir login novamente. Um JWT anterior ao refresh ainda funciona até seu TTL se a sessão continuar ativa; logout/replay/reset invalidam a sessão no guard.

Logout usa apenas a identidade/sessão do guard, aceita corpo vazio e revoga a sessão atual atomicamente com audit. Logout-all revoga sessões existentes do titular, sem aceitar IDs do cliente. Novo login válido posterior pode iniciar nova sessão.

## Verificação e recuperação

AccountToken guarda titular, finalidade, hash único, versão de credencial, createdAt/expiresAt/usedAt/revokedAt. Uma reemissão revoga códigos ainda não utilizados da mesma finalidade.

- Verificação consome um código EMAIL_VERIFICATION válido e marca emailVerifiedAt do titular. Não cria sessão e não aceita userId/emailVerifiedAt no corpo.
- Reset exige token PASSWORD_RESET, nova senha de 15–128 caracteres e passwordConfirmation correspondente. Hash calculado fora da transação.
- Consumo, alteração do hash, incremento de credentialVersion, revogação de sessões/códigos pendentes e audit são atômicos. Não há login automático. Uma notificação sem senha avisa da alteração.
- Login revalida hash/versão depois de verificar a senha, dentro da transação. Um reset concorrente impede que a prova da senha antiga crie uma sessão válida.
- CV também protege guard/refresh contra sessões anteriores ao reset. Verificação de email e reset possuem finalidades separadas; reset não confirma email automaticamente.
- Tokens expirados, consumidos, revogados, de outra finalidade ou de usuário inativo não alteram conta. Não há perguntas de segurança ou identificação pelo ID informado pelo cliente.

## Abuso e enumeração

O throttler por rota/IP foi mantido: login 5/minuto, cadastro/solicitação de email/recuperação 3/minuto, refresh 20/minuto, confirmação/reset 5/minuto.

Além dele, login/cadastro/solicitações têm orçamento **compartilhado no PostgreSQL**, por identidade normalizada e IP, em transação. Buckets guardam apenas chaves HMAC-SHA256 com domínio separado, contagem e janela/expiração, sem email/IP puro. O segredo deriva da chave JWT configurada; instâncias devem compartilhar configuração e rotação dessa chave reinicia logicamente os buckets.

O orçamento considera tentativas independentemente de a conta existir ou a senha estar certa. Limites padrão por janela de 900 segundos: login 10 por identidade, solicitações 3 por identidade e 20 por IP/ação. Login bloqueado por orçamento recebe 429 genérico; solicitações limitadas internamente permanecem neutras, sem envio. Validar esses parâmetros para usuários atrás de NAT, sem aumentar limites às cegas.

Argon2id mantém 64MiB/t=3/p=1, com hash dummy para email inexistente e no máximo dois trabalhos concorrentes por instância, sem fila ilimitada. Saturação retorna 503 genérico. Dois trabalhos equivalem a aproximadamente 128MiB de memória configurada do Argon2, além da memória normal da aplicação.

Cadastro faz hashing também para duplicados; login verifica hash real/dummy; as respostas públicas têm piso de 250ms (mínimo 200ms em produção). SMTP não é aguardado pela resposta. Essas medidas **não provam tempo constante**, nem eliminam credential stuffing distribuído ou ataques de indisponibilidade. Monitoramento de abuso, limites globais/concurrency no gateway, reputação/bot controls e avaliação de senhas comprometidas ainda exigem decisões operacionais. CAPTCHA/MFA não foram adicionados.

## SMTP e dependências

Nodemailer **10.0.13** e @types/nodemailer **8.0.2** foram conferidos no registro npm antes de instalar, fixados no package/lock e testados com Node 24. Node/Nest existentes não forneciam transporte SMTP pronto; a dependência evita implementar manualmente protocolo, autenticação e TLS. Nenhuma biblioteca existente foi atualizada de major.

EMAIL_TRANSPORT=disabled é o padrão. Para ativar, configurar host/remetente aprovados e credenciais locais via ambiente/secret manager. Credenciais nunca são impressas. SMTP_USER/SMTP_PASSWORD devem estar presentes juntos quando utilizados; relay sem autenticação é uma decisão explícita da infraestrutura.

SMTP usa TLS implícito com secure=true (porta padrão 465) ou STARTTLS obrigatório com secure=false (por exemplo 587), TLS >=1.2 e validação de certificado/hostname. Não há opção de desabilitar verificação. Debug/logger do driver, acessos a arquivo/URL e anexos estão desativados. Não envia email a partir de nome/endereço arbitrário da requisição: o destinatário vem da conta armazenada.

Mensagens entregam código textual para copiar no app, não link baseado em Host/callbackUrl informado pelo cliente. Nenhuma tela/deep link de frontend foi criada.

Entrega é assíncrona **best-effort em memória**, no máximo 25 pendências por instância, com timeouts de conexão/saudação de 5s e socket de 10s. Shutdown aguarda até 5s e fecha transporte. Falhas/capacidade registram só event técnico, sem destinatário, token, senha ou erro bruto. Não há fila persistida com credenciais puras.

**Limite importante:** queda do processo, saturação ou falha SMTP pode perder a notificação. 202 significa solicitação recebida, não entrega comprovada. Reemissão é possível, sujeita a limites. Entrega durável/retry exige desenho posterior (por exemplo canal gerenciado/credenciais protegidas), sem salvar token puro em uma outbox. Nenhum email real foi enviado nesta entrega; falta configuração e teste de entrega com provedor aprovado.

## Rotas

Prefixo /api/v1/auth.

| Método | Rota                        | Acesso / resultado                                         |
| ------ | --------------------------- | ---------------------------------------------------------- |
| POST   | /register                   | Público; name/email/password; 202 neutro                   |
| POST   | /login                      | Público; email/password; 200 com sessão, 401/429           |
| POST   | /refresh                    | Público; refreshToken; 200 ou 401                          |
| POST   | /logout                     | Bearer; corpo vazio; 204                                   |
| POST   | /logout-all                 | Bearer; corpo vazio; 204                                   |
| POST   | /request-email-verification | Público; email; 202 ou transporte desativado 503           |
| POST   | /verify-email               | Público; token ev_; 204/400                                |
| POST   | /forgot-password            | Público; email; 202 ou transporte desativado 503           |
| POST   | /reset-password             | Público; token pr_, password/passwordConfirmation; 204/400 |

DTOs rejeitam campos extras e tokens em formatos incorretos. Credenciais vão no corpo de POST ou Authorization, nunca query string. Views de usuário/dependente/consentimento permanecem explícitas. Headers no-store, CORS, request ID e erro genérico existentes foram reutilizados.

## Configuração nova

| Variável                       | Padrão           | Limite / finalidade           |
| ------------------------------ | ---------------- | ----------------------------- |
| JWT_TTL_SECONDS (existente)    | 900              | Access 60–3600s               |
| REFRESH_TTL_SECONDS            | 2592000          | Sessão absoluta 3600–7776000s |
| EMAIL_VERIFICATION_TTL_SECONDS | 86400            | Código 300–172800s            |
| PASSWORD_RESET_TTL_SECONDS     | 1800             | Código 300–3600s              |
| AUTH_REQUIRE_VERIFIED_EMAIL    | true             | Produção não aceita false     |
| AUTH_LOGIN_IDENTITY_MAX        | 10               | 1–100 por janela              |
| AUTH_REQUEST_IDENTITY_MAX      | 3                | 1–20 por janela               |
| AUTH_IP_MAX                    | 20               | 1–200 por ação/janela         |
| AUTH_RATE_WINDOW_SECONDS       | 900              | 60–3600s                      |
| AUTH_RESPONSE_MIN_MS           | 250              | 0–2000; produção >=200        |
| EMAIL_TRANSPORT                | disabled         | disabled ou smtp              |
| EMAIL_FROM / SMTP_HOST         | Não configurados | Obrigatórios em smtp          |
| SMTP_PORT / SMTP_SECURE        | 465 / true       | STARTTLS obrigatório se false |
| SMTP_USER / SMTP_PASSWORD      | Não configurados | Ambos ou nenhum               |

.env.example foi ampliado; .env local foi preservado. Sem SMTP, somente desenvolvimento com dados fictícios pode escolher AUTH_REQUIRE_VERIFIED_EMAIL=false para testar cadastro/login. Isso não habilita recuperação real nem deve ser levado para produção.

## Migration, testes e limites de validação

Migration nova: **20261001000300_account_security**. Amplia AuditAction/resourceType e User.credentialVersion, cria sessões, hashes de refresh/account tokens e buckets com índices e FKs RESTRICT. Migrations anteriores não foram modificadas. Não apaga dados nem confirma email de usuários legados.

Aplicar todas as migrations em banco descartável cuidare_test antes de integração; usar npm run prisma:deploy com URL de teste, nunca o banco de dados reais. Em desenvolvimento normal, após iniciar Docker, npm run db:up e npm run prisma:deploy. Rever a premissa UTC da migration anterior antes de aplicar a sequência em base existente e preservar backup. Não executar reset, truncar ou apagar volume.

Verificações locais:

- Types, ESLint, build, schema/client e formato dos arquivos desta entrega.
- **98 unitários (18 suítes) e 79 HTTP (3 suítes) aprovados** nesta etapa; 40 unitários e 16 HTTP a mais, preservando as regressões anteriores com ajuste explícito dos contratos de cadastro/JWT.
- Cobertura acrescentada: rotação/replay/concorrência, logout entre titulares, expiração/estado/CV, corrida login/reset, recuperação/confirmação de uso único, hash-only, rollback de audit, rate por identidade/IP, SMTP TLS/erro sanitizado, piso temporal, limite Argon2 e DTOs.
- Três testes reais PostgreSQL adicionados para refresh concorrente, reset concorrente e orçamento por identidade concorrente. Junto aos cinco anteriores, oito casos em três suítes; **não executados localmente**.
- test:database tentado: setup recusou ausência de TEST_DATABASE_URL. Docker engine Linux continua indisponível. A migration **não foi aplicada**, não há resultado de concorrência PostgreSQL nem entrega SMTP real confirmado.
- npm audit: zero vulnerabilidades na execução, não garantia permanente.
- Check global/validate ainda para na formatação preexistente de agents.md; arquivo preservado e não incluído em ignore. CI remota não executada.

HTTP usa Nest/guards/Argon2 reais com persistência/delivery em memória. Concorrência em memória não substitui validação de locks/isolamento em PostgreSQL. Testes brutos/strict não escondem vazamento de campos por parse que remove extras. Testes de algoritmo/issuer/audience/expiração usam claims de sessão válidos para não passarem apenas pela ausência de sid.

Eventos novos: SESSION_CREATED/REVOKED, ALL_SESSIONS_REVOKED, REFRESH_ROTATED/REUSE_DETECTED, EMAIL_VERIFIED e PASSWORD_RESET. Audit contém IDs/ação/tempo, metadata vazia e nunca credenciais/hashes/PII no payload. Falha do audit desfaz escrita; limite de taxa fica separado da operação para impedir rollback das tentativas.

Faltam antes de produção: validação real de banco/SMTP, política de entrega durável, operação/TLS do banco, privilégios, backups, monitoramento de abuso, redaction do bootstrap e testes de carga. Expiração impede uso, mas **não remove linhas automaticamente**: configurar manutenção/retention de buckets e credenciais expiradas, preservando refresh consumido pelo menos enquanto a família estiver válida para detectar replay. Política de retenção/eliminação deve ser decidida na governança, sem prazo jurídico inventado.

## Referências

Orientações consultadas: [OWASP recuperação](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [OWASP autenticação](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [RFC 9700 — replay/rotação](https://www.rfc-editor.org/rfc/rfc9700.html) e [SMTP Nodemailer](https://nodemailer.com/smtp). A API não é um servidor OAuth completo; a referência de rotação foi aplicada ao risco de credenciais bearer.

## Inventário de arquivos

Novos/alterados listados abaixo; client Prisma gerado e dependências instaladas não são arquivos autorais.

### Novos

- `docs/architecture/account-security.md`
- `prisma/migrations/20261001000300_account_security/migration.sql`
- `src/common/validation/empty-body.pipe.spec.ts`
- `src/common/validation/empty-body.pipe.ts`
- `src/domain/models/auth-session.model.ts`
- `src/infrastructure/email/smtp-account-notification.gateway.spec.ts`
- `src/infrastructure/email/smtp-account-notification.gateway.ts`
- `src/modules/auth/account-notification.gateway.ts`
- `src/modules/auth/account-security.service.spec.ts`
- `src/modules/auth/account-security.service.ts`
- `src/modules/auth/auth-rate-limit.service.spec.ts`
- `src/modules/auth/auth-rate-limit.service.ts`
- `src/modules/auth/auth.service.spec.ts`
- `src/modules/auth/opaque-token.service.spec.ts`
- `src/modules/auth/opaque-token.service.ts`
- `src/modules/auth/public-response.service.spec.ts`
- `src/modules/auth/public-response.service.ts`
- `src/modules/auth/dto/account-email.dto.ts`
- `src/modules/auth/dto/auth-tokens.dto.ts`
- `src/repository/account-token.repository.ts`
- `src/repository/auth-rate-limit.repository.ts`
- `src/repository/auth-session.repository.ts`
- `src/repository/prismaRepository/prisma-account-token.repository.ts`
- `src/repository/prismaRepository/prisma-auth-rate-limit.repository.ts`
- `src/repository/prismaRepository/prisma-auth-session.repository.ts`
- `src/repository/prismaRepository/prisma-auth.repositories.spec.ts`
- `test/auth-security.e2e-spec.ts`
- `test/auth-security.integration-spec.ts`
- `test/helpers/auth-fixture.ts`
- `test/helpers/in-memory-auth.ts`

### Alterados

- `.env.example`
- `package-lock.json`
- `package.json`
- `README.md`
- `SECURITY.md`
- `docs/architecture/current-state.md`
- `docs/architecture/domain-foundation.md`
- `docs/architecture/v1-roadmap.md`
- `docs/security/security-review.md`
- `prisma/schema.prisma`
- `src/common/types/request.types.ts`
- `src/config/environment.spec.ts`
- `src/config/environment.ts`
- `src/domain/models/audit-log.model.ts`
- `src/domain/models/user.model.ts`
- `src/modules/audit/audit.service.ts`
- `src/modules/auth/auth.controller.ts`
- `src/modules/auth/auth.module.ts`
- `src/modules/auth/auth.service.ts`
- `src/modules/auth/jwt-auth.guard.ts`
- `src/modules/auth/password.service.spec.ts`
- `src/modules/auth/password.service.ts`
- `src/repository/repository.module.ts`
- `src/repository/unit-of-work.repository.ts`
- `src/repository/user.repository.ts`
- `src/repository/errors/repository.error.ts`
- `src/repository/prismaRepository/prisma-unit-of-work.repository.spec.ts`
- `src/repository/prismaRepository/prisma-unit-of-work.repository.ts`
- `src/repository/prismaRepository/prisma-user.repository.ts`
- `test/api.e2e-spec.ts`
- `test/foundation.e2e-spec.ts`
- `test/setup-env.ts`
- `test/helpers/create-test-app.ts`
- `test/helpers/in-memory-foundation.ts`
- `test/helpers/in-memory.repositories.ts`
