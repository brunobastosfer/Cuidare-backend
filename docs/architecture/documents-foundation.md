# Documentos e upload privado — Etapa 7

Data: 01/10/2026. Escopo: somente Etapa 7 de agents.md sobre a base existente. Etapa 8 não iniciada; sem nova biblioteca, alteração do aplicativo, secrets ou migrations anteriores. Nenhuma migration aplicada.

## Arquitetura e reutilização

Mantido monólito modular MVC de API: controller fino → service → interfaces em repository → prismaRepository para metadados. Inspecionados fontes próprios, schema/migrations, autenticação/guards, autorização, validação/erros, config, auditoria/transações, timeline/privacidade, testes/helpers, Docker, CI e documentação. Reutilizados JWT/sessão, roles, DependentAuthorizationService/dependentScope, AuditService, UnitOfWorkRepository Serializable/retry, DTOs/views, filtros/headers/CORS/throttling e cursor/exportação existentes.

DocumentRepository concentra metadados/autorização no PostgreSQL. FileStorageRepository guarda bytes fora do banco e do static/public; contrato imutável put, leitura limitada get e remove somente para compensação. LocalFileStorageRepository é o adaptador inicial configurável. MalwareScannerRepository separa verificação; ClamAvScannerRepository implementa INSTREAM por TCP, sem shell ou arquivo temporário. Config aceita somente driver local nesta entrega, não finge que adaptadores cloud existem.

FileStorageRepository tem capacidade opcional createReadUrl para futuros S3/Azure/GCS/compatíveis. Não há chamada/endpoint de URL assinada nem permissão pública no adaptador local: autorização precisa anteceder futura emissão, com TTL e janela residual de revogação explicitamente definidos quando esse provedor for implementado.

Nenhuma dependência instalada/atualizada: Nest 12.1.2 já fornece Multer/FileInterceptor e FileTypeValidator (file-type transitivo). Node 24.15.0 fornece crypto/fs/net. Package.json e lockfile preservados. Compartilhamento, vacinas, vinculação a tratamento/consulta e processamento clínico automático não foram iniciados.

## Modelo, dados e acesso

Document: id/dependentId, category, title, description?, storageKey, originalFileName, mimeType, size, checksum, createdByUserId, documentDate?, createdAt/updatedAt/deletedAt e scannedAt técnico obrigatório. Categorias: PRESCRIPTION, MEDICAL_REPORT, EXAM, MEDICAL_CERTIFICATE, SCHOOL_REPORT, VACCINE_RECORD, OTHER. Categoria não transforma arquivo em registro vacinal ou recomendação automática.

Metadata no PostgreSQL; nenhum campo blob/base64. documentDate é DATE, YYYY-MM-DD real, anos 1–9999, opcional inclusive futura, sem inferência clínica. Timestamps técnicos UTC. Nome original sanitizado NFC/basename, limitado a 180 caracteres; continua sendo dado potencialmente sensível e nunca determina key/download filename.

Views enumeram id, dependentId, category, title, description, originalFileName, mimeType, size, documentDate, createdAt, updatedAt. Não retornam storageKey/checksum/criador/scannedAt/deletedAt. PATCH só category/title/description/documentDate; não substitui bytes, MIME, hash, dependente ou autoria. DTOs separados, extras/null obrigatórios/textos vazios recusados; opcionais nullable removíveis com null no PATCH.

OWNER/EDITOR criam/editam; OWNER/EDITOR/VIEWER leem metadados/baixam; OWNER exclui logicamente. Todas as operações exigem conta/dependente/vínculo ativos, não só criador/UUID. Guard do upload checa papel antes de Multer ler/alocar corpo; service revalida autorização depois de IO e dentro da transação. SQL where repete escopo/papel em updates/deletes. ID desconhecido, outro dependente ou papel insuficiente retorna 404, sem confirmar existência. UUID v4 na API.

## API e exemplo funcional

Prefixo: /api/v1/dependents/:dependentId/documents.

| Método | Sufixo       | Contrato                                                                     |
| ------ | ------------ | ---------------------------------------------------------------------------- |
| POST   | vazio        | Multipart com file, category/title e description/documentDate opcionais; 201 |
| GET    | vazio        | Lista metadata, limit 1–100 (50 padrão), offset 0–10000; 200                 |
| GET    | /:id         | Detalhe metadata, DOCUMENT_VIEWED; 200                                       |
| PATCH  | /:id         | Corrige metadata permitida, corpo não vazio; 200                             |
| DELETE | /:id         | Soft delete, preserva bytes; 204                                             |
| GET    | /:id/content | Binário privado attachment/no-store com audit; 200                           |

No Swagger local, após configurar scanner/storage e aplicar migrations em desenvolvimento, autentique com JWT e selecione POST da coleção. Use um PNG/PDF/JPEG fictício válido no campo file, category=OTHER, title=Documento demonstrativo e documentDate=2020-02-29. O identificador do dependente precisa ter vínculo OWNER/EDITOR da conta.

Use o id retornado para GET .../documents/:id/content: resposta binária com MIME validado, Content-Length conferido, nosniff, CSP default-src 'none'; sandbox e Content-Disposition attachment; filename="document-UUID.ext". Nunca usar nome pessoal no header nem renderização inline. Exemplo de correção:

```json
{ "title": "Registro demonstrativo corrigido", "description": null, "documentDate": null }
```

DELETE torna metadata/arquivo/timeline indisponíveis na API, não elimina o objeto físico. Não abrir arquivos automaticamente no aplicativo; proteger downloads no dispositivo. Sem scanner habilitado POST responde 503; não criar arquivo de teste real com dados de saúde para experimentar.

## Upload e limites

- PDF/PNG/JPEG somente, whitelist configurável como subconjunto. Declarado MIME pode ser o detectado ou application/octet-stream; nunca determina formato sozinho. Extensão precisa concordar; executáveis/HTML/SVG/ZIP/Office recusados.
- FileTypeValidator usa conteúdo/magic bytes, sem fallback para tipo/extensão do cliente. Triagem adicional: PDF header/EOF, JPEG término e PNG IHDR/IEND/dimensões (até 20 mil por eixo e 40 milhões de pixels). Não é parser completo, CDR, validação integral/CRC, prevenção universal de polyglot, JavaScript embutido em PDF ou todos os tipos de bombas de imagem. Antivírus também não fornece essas garantias.
- Multipart aceita uma file, quatro fields, cinco parts, campo até 2048 bytes/nome até 100; limite do arquivo configurável (5MiB padrão, 20MiB teto). Parser em memória por arquivo, sob orçamento de concorrência. JSON global segue 32KiB.
- DOCUMENT_IO_CONCURRENCY padrão 2 (1–8), sem fila, 429 quando ocupado. Interceptor segura slot até concluir processamento E finalizar/fechar resposta: cliente lento não libera buffer cedo, e fechamento anterior ao término do trabalho não libera scan pendente. Limite por processo; gateway precisa limites compartilhados, request/body timeout e defesa contra muitos usuários/instâncias/slow clients.
- Throttler de upload 10/minuto e download 20/minuto por IP/handler; guard JWT e throttling existentes mantidos. Metadata/listas têm limites globais existentes.
- Quota por dependente: 500 objetos/100MiB padrão, máximo 10 mil/1GiB, incluindo registros soft-deleted cujo conteúdo continua retido. Checagem/insert Serializable evita bypass concorrente; casos de banco real ainda não executados. Quota não contabiliza órfãos não confirmados, outros arquivos/backup ou uso global de todos os dependentes: operação precisa limites/monitoramento de volume e reconciliação.

## Storage, scanner e consistência

Key aleatória UUID v4.bin do servidor; SHA-256 dos bytes. Diretório exclusivo canônico, não raiz do volume/cwd ou symlink/junction; valida basename/dirname e key estrita. Criação exclusiva sem sobrescrever, modos POSIX 0700/0600, sync e remoção apenas do novo objeto em falha. Leituras limitadas recusam diretórios/links/hardlinks, vazio e excesso; O_NOFOLLOW quando disponível. Windows NTFS exige ACL externa aprovada; modos POSIX não a configuram. Administrador/usuário local com acesso ao volume continuam parte do limite de confiança, não ameaça resolvida pelo path check. No Linux, o root privado rejeita permissões group/other; esta execução foi em Windows, não inspeção de uma implantação POSIX.

Scanner desabilitado padrão, upload 503 antes de parsing. Somente veredito CLEAN permite storage/metadata; INFECTED 400 genérico, indisponível/erro/timeout/má resposta 503, sem armazenar bytes/metadata de quarentena. ClamAV TCP usa INSTREAM, chunks de 64KiB, timeout total configurável, resposta limitada a 1KiB; sem nomes/paths/command injection ou laudo/log de malware.

Clamd precisa ser controlado/atualizado, loopback/rede privada e StreamMaxLength >= DOCUMENT_MAX_BYTES. Esta conexão não cifra/autentica TCP: não expor porta a Internet, não enviar bytes a scanner público/terceiro sem avaliação e não configurar daemon desconhecido. Habilitar variável não instala ClamAV nem atualiza assinaturas. Testes de protocolo usam servidor fictício, não provaram detecção por daemon real.

Ordem upload: autorização → validação → scan → put imutável → transação reautoriza/quota/create/audit. Nenhum IO externo na callback que pode ser repetida pelo retry. Se commit/audit falha, remove somente key recém-gerada; falha de limpeza emite evento document_upload_cleanup_failed sem key/nome/payload e requer investigação. Storage/PG não são uma transação distribuída: crash entre put e commit ou limpeza falha pode deixar objeto privado órfão. Definir reconciliação operacional segura, sem apagar arquivos por varredura indiscriminada; não foi criado job/queue/purge.

Download: read autorizado → get limitado → size/hash → nova transação reautoriza e verifica documento ainda ativo/mesma key/hash → audit → attachment. Revogação/exclusão durante IO bloqueia retorno antes de emissão; depois de resposta aprovada/começada não se recuperam bytes entregues ao cliente. DOCUMENT_DOWNLOADED significa aprovação de resposta, não confirmação de leitura/recebimento integral.

Audits DOCUMENT_UPLOADED/UPDATED/DELETED/VIEWED/DOWNLOADED são atômicos com metadata correspondente; só IDs/tempo e nomes permitidos de campos editados, sem conteúdo/título/nome/descrição/key/hash/scan. Listagem não gera evento por item. Não logging de multipart ou binários em proxy/APM/analytics.

## Configuração e operação

| Variável                    | Padrão / faixa                                                           |
| --------------------------- | ------------------------------------------------------------------------ |
| DOCUMENT_STORAGE_DRIVER     | local; único adaptador desta etapa                                       |
| DOCUMENT_STORAGE_ROOT       | .private-documents local; produção com scanner habilitado exige absoluto |
| DOCUMENT_MAX_BYTES          | 5242880; 1024–20971520                                                   |
| DOCUMENT_MAX_STORED_BYTES   | 104857600; 1024–1073741824, >= máximo por arquivo                        |
| DOCUMENT_MAX_STORED_FILES   | 500; 1–10000                                                             |
| DOCUMENT_IO_CONCURRENCY     | 2; 1–8                                                                   |
| DOCUMENT_ALLOWED_MIME_TYPES | application/pdf,image/png,image/jpeg; subconjunto único não vazio        |
| DOCUMENT_SCANNER            | disabled ou clamav; disabled bloqueia novos uploads                      |
| DOCUMENT_SCAN_HOST / PORT   | 127.0.0.1 / 3310; host de configuração do servidor, nunca URL do cliente |
| DOCUMENT_SCAN_TIMEOUT_MS    | 5000; 100–30000                                                          |

.env.example documenta variáveis sem secrets; .env real preservado. Storage é ignorado por Git/Prettier, nunca usado como diretório public/static. Não configura automaticamente volume/ACL, criptografia, daemon, imagem de scanner, região, backup ou limite de disco. Futuro deployment deve separar dados/artefatos e garantir durabilidade/restauração coordenada entre metadados e bytes. Docker Compose/CI existentes mantidos; CI encontra novos testes pelo padrão de nomes, não examina malware real.

## Timeline, privacidade e retenção

Fonte DOCUMENT: DOCUMENT_UPLOADED, id document-uploaded:UUID, eventDate/createdAt = registro técnico do upload, nunca documentDate clínica/civil prevista. Título Documento enviado, summary null, sem nome/título/categoria/key/hash/descrição. IDs/datas ainda são sensíveis. Consulta escopada e keyset/top-k no SQL antes da agregação. Helpers de timestamp/keyset de consultas foram extraídos para instantTimelineWhere sem mudar seu contrato; testes de regressão anteriores preservados.

Exportação JSON schemaVersion 1.3 acrescenta documents, somente projeção pública de metadados ativos de dependentes OWNER explicitamente selecionados; nenhum por padrão, senha/limites existentes. Não inclui bytes/key/checksum/scannedAt/criador ou arquivos excluídos. Binários são baixados individualmente; ainda não há ZIP/fluxo assíncrono completo. Excesso por coleção/bytes retorna 413 sem truncar, e canal de direitos deve cobrir arquivo/dados retidos/terceiros.

DOCUMENT adicionada à configuração de retenção, default null, sem prazo jurídico presumido, purge ou mudança de pedidos antigos. Soft delete e fechamento de conta não removem bytes/backups ou registros de outros responsáveis. Inventário e privacy by design incluem arquivo/scanner/audit/cópias. Validar finalidade/base/representação/região/operadores/retention e canal de direitos antes de dados reais; não afirmar conformidade integral.

## Migration

20261001000700_documents/migration.sql: DocumentCategory, tabela documents, cinco ações e recurso de auditoria, UNIQUE storageKey, índices dependentId/deletedAt/createdAt/id e criador. FKs de dependente/criador onDelete RESTRICT. CHECKs: textos não vazios, size 1–20MiB, MIME whitelist, SHA hex minúsculo 64, key UUID v4.bin e data civil 1–9999. scannedAt obrigatório evidencia passagem pelo serviço, não prova criptográfica de scan/arquivo inofensivo.

Gerada por diff offline do schema anterior, revisada com BEGIN/COMMIT; nenhuma tabela anterior recriada ou dados apagados, seis migrations anteriores intactas. Valores novos de enums antigos só usados em runtime após commit. Alvo PostgreSQL 18.6. Schema/client podem ser validados sem executar DDL; migration/regras/concorrência precisam banco descartável antes de deploy.

## Verificações e pendências

| Verificação                                        | Resultado local                                                             |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| Prisma schema / client                             | Aprovados; geração de client e diff offline, sem DDL aplicado               |
| TypeScript strict / ESLint                         | Aprovados, sem avisos de lint                                               |
| Unitários                                          | 402 aprovados, 45 suítes; 99 casos a mais que na Etapa 6                    |
| HTTP Nest real / persistência e scanner em memória | 241 aprovados, 8 suítes; 32 casos a mais que na Etapa 6                     |
| Build                                              | Aprovado                                                                    |
| npm audit                                          | Zero vulnerabilidades conhecidas reportadas; nenhuma dependência atualizada |
| Formatter dos arquivos alterados                   | Aprovado                                                                    |
| npm run validate                                   | Interrompe somente no formato global de agents.md preexistente, preservado  |
| PostgreSQL real                                    | 31 casos preparados, 8 suítes; zero executados, 6 novos casos de documentos |

PostgreSQL real indisponível: Docker Linux engine não encontrado e ausência de TEST_DATABASE_URL; test:database foi tentado e o setup recusou a execução antes dos casos, sem usar banco real do usuário. CI remota, ClamAV real/assinaturas, SMTP, ACL produtiva, carga/EXPLAIN, TLS/proxy e backups/restauração não verificados.

Primeiras rodadas unitárias encontraram um detalhe de fixture com caminho temporário Windows 8.3 e a checagem de ENOENT entre contextos do Jest. Corrigidos com diretório temporário canônico e checagem segura do código do erro, sem relaxar root/key/links; a rodada completa posterior passou. Eventos 500/503 dos testes HTTP são falhas deliberadas de audit/integridade/scanner para conferir erros neutros, não falhas dos testes. Aviso experimental VM Modules permanece esperado pelo script Jest existente.

Casos novos cobrem conteúdo/MIME/extensão/dimensões/tamanho, DTO/allowlist, roles/BOLA/revogação após IO, rollback/compensação/quotas/soft delete/integridade, views/audit, protocolo INSTREAM/indisponibilidade, filesystem privado/links/leitura, concorrência/vida da resposta, timelines entre namespaces e exportação metadata-only. Fixtures fictícias, scanner fake somente em testes; não conteúdo de titulares.

## Arquivos da entrega

Inventário de fontes próprios: **34 novos, 38 alterados, 0 removidos**. Prisma client gerado e build não integram essa contagem. Snapshot temporário de comparação removido, não era arquivo do usuário. Sem mudança de agents.md, package.json/lockfile, seis migrations anteriores ou .env real.

### Novos

- docs/architecture/documents-foundation.md
- prisma/migrations/20261001000700_documents/migration.sql
- src/domain/models/document.model.ts
- src/infrastructure/scanning/clamav-scanner.repository.spec.ts
- src/infrastructure/scanning/clamav-scanner.repository.ts
- src/infrastructure/storage/local-file-storage.repository.spec.ts
- src/infrastructure/storage/local-file-storage.repository.ts
- src/modules/documents/document-file-validator.spec.ts
- src/modules/documents/document-file-validator.ts
- src/modules/documents/document-io-budget.spec.ts
- src/modules/documents/document-io-budget.ts
- src/modules/documents/document-io.interceptor.spec.ts
- src/modules/documents/document-io.interceptor.ts
- src/modules/documents/document-timeline.source.spec.ts
- src/modules/documents/document-timeline.source.ts
- src/modules/documents/document-upload.guard.ts
- src/modules/documents/documents.controller.ts
- src/modules/documents/documents.module.ts
- src/modules/documents/documents.service.spec.ts
- src/modules/documents/documents.service.ts
- src/modules/documents/dto/document.dto.spec.ts
- src/modules/documents/dto/document.dto.ts
- src/presentation/views/document.view.ts
- src/repository/document.repository.ts
- src/repository/file-storage.repository.ts
- src/repository/malware-scanner.repository.ts
- src/repository/prismaRepository/instant-timeline-where.ts
- src/repository/prismaRepository/prisma-document.repository.spec.ts
- src/repository/prismaRepository/prisma-document.repository.ts
- test/documents.e2e-spec.ts
- test/documents.integration-spec.ts
- test/helpers/document-fixture.ts
- test/helpers/document-schemas.ts
- test/helpers/in-memory-documents.ts

### Alterados

- .env.example
- .gitignore
- .prettierignore
- README.md
- SECURITY.md
- docs/architecture/current-state.md
- docs/architecture/v1-roadmap.md
- docs/lgpd/data-inventory.md
- docs/lgpd/privacy-by-design.md
- docs/security/security-review.md
- prisma/schema.prisma
- src/app.module.ts
- src/config/environment.spec.ts
- src/config/environment.ts
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
- src/repository/prismaRepository/appointment-timeline-where.ts
- src/repository/prismaRepository/prisma-privacy.repository.spec.ts
- src/repository/prismaRepository/prisma-privacy.repository.ts
- src/repository/prismaRepository/prisma-unit-of-work.repository.spec.ts
- src/repository/prismaRepository/prisma-unit-of-work.repository.ts
- src/repository/repository.module.ts
- src/repository/unit-of-work.repository.ts
- test/appointments.e2e-spec.ts
- test/helpers/create-test-app.ts
- test/helpers/in-memory-foundation.ts
- test/medications.e2e-spec.ts
- test/privacy.e2e-spec.ts
- test/setup-env.ts

## Referências verificadas

[Nest — upload e FileTypeValidator](https://docs.nestjs.com/techniques/file-upload), [OWASP — File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html), [Node — filesystem](https://nodejs.org/api/fs.html), [ClamAV — scanning](https://docs.clamav.net/manual/Usage/Scanning.html). Documentação e implementações instaladas conferidas antes de reutilizar recursos; nenhuma dependência nova. Essas referências orientam controles, não certificação de segurança.

Próxima etapa possível: Etapa 8, somente com nova solicitação. Não foram criados vacinas/calendários/seeds clínicos ou compartilhamento externo.
