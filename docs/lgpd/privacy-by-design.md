# Privacy by Design — mecanismos e limites

Data: 02/10/2026. Backend após Etapa 9. Mecanismos técnicos para apoiar privacidade; **não atesta 100% de conformidade com a LGPD**. Validar decisões jurídicas/operacionais e responsabilidades humanas.

## Medidas implementadas

- Educação: matrícula e relatório são privados por dependente. OWNER/EDITOR registram/corrigem, VIEWER lê, OWNER soft delete; FK composta protege links opcionais de matrícula/documento. Relatório independente não desaparece com a matrícula arquivada, mas vínculos excluídos são null na view. Sem contas institucionais, integração, notas ou classificação automática.
- Textos escolares podem conter dados de crianças/terceiros e saúde: não copiar em logs, analytics ou audit. Timeline mostra título genérico, IDs e data informada, não conteúdo ou data de matrícula. Exportação 1.5 sob senha/seleção OWNER inclui schoolEnrollments/schoolReports com textos, sem internos/bytes; EDUCATION null exige revisão, não prazo infinito/expurgo. Conta fechada preserva dados de outros responsáveis. [Limites e operação](../architecture/education-foundation.md).

- Vacinação: registro informado protegido por vínculo/papel, FK de referência e documento/dependente, DTOs/views explícitos e audit atômico sem dados clínicos. Datas/dose/lote/instituição/notas podem ser altamente sensíveis. Sem seed inventado ou recomendação; comparação limitada usa versão escolhida e proveniência, não confirma imunização. Calendários só leitura; publicação/importação humana aprovada continua pendente.
- Direitos vacinais: exportação 1.5 acrescenta vaccinations sob senha/seleção OWNER, mesma minimização/no-store/limites, sem internos ou vínculo com documento excluído. Soft delete retém histórico, conta encerrada não apaga dependentes de outros responsáveis. VACCINATION default null exige revisão jurídica/operacional, sem prazo presumido ou expurgo. Referência retirada conserva proveniência de registros antigos, não alega aprovação atual. [Limites do modelo](../architecture/vaccinations-foundation.md).

- Documentos privados por padrão: bytes fora do PostgreSQL/static, chave aleatória sem nome pessoal, conteúdo/MIME/extensão limitados e scanner fail-closed. Autorização antes de buffering e nova checagem após IO; erros/audit não incluem arquivo/key/hash/nomes. Nenhum download público ou URL assinada neste adaptador local; backend entrega attachment, não renderiza/abre conteúdo automaticamente.
- Direitos documentais: exportação 1.5 inclui metadados opt-in OWNER, sem binários/keys/checksum/scan; arquivo é obtido pela rota autenticada. Soft delete conserva bytes e quota, conta encerrada preserva dependentes/registros de outros responsáveis. DOCUMENT null exige revisão de metadados/arquivos/backups e possíveis órfãos; não define prazo ou elimina dados sozinho.
- Scan processa bytes integrais num daemon controlado privado, não serviço público. Revisar contrato/região/logs/durabilidade/ACL/criptografia de volume; NTFS não é configurado pelo modo POSIX. Validação estrutural/antivírus reduzem riscos, não garantem arquivo inofensivo ou conformidade. Conteúdo de terceiros requer minimização/governança humana.

- Consultas e recomendações: registros fornecidos pelo responsável, sem diagnóstico, prescrição ou orientação gerada. FK composta impede trocar dependente/consulta. OWNER/EDITOR escrevem, VIEWER lê, OWNER exclui. Exclusão da consulta exige exclusão prévia das recomendações; conta encerrada não apaga saúde de outros responsáveis.
- Timeline de consultas mostra data informada com título neutro, inclusive agendamento futuro; não afirma consulta realizada. Recomendações mostram cadastro técnico e marcação explícita de conclusão, não início/fim previstos. Nenhum nome de profissional/instituição, motivo, notas, título ou descrição informados entram no resumo/audit. Metadados/datas continuam sensíveis.
- Exportação atual 1.5 mantém appointments/medicalRecommendations entre as coleções. Mesmas exigências de senha, OWNER selecionado, limites por coleção/bytes e no-store. Categoria APPOINTMENT padrão null cobre ambas as fontes; não inventa prazo, não reescreve pedidos antigos ou dispara expurgo.

- Saúde: produto e tratamento pertencem a um dependente com autorização explícita; FK composta impede associação a produto de outro dependente. CRUD tem views/DTOs/soft delete e transações com audit sem valores clínicos. Não calcula dose, recomenda ou diagnostica; as informações são textos do responsável.
- Timeline médica: só início/conclusão informados, títulos genéricos/summary null e IDs/datas; sem dose, nome do medicamento, prescritor, motivo ou notas. Details exigem autorização própria. Datas/eventos ainda são sensíveis, não anonimizados. Fim planejado não vira conclusão; completedAt separa data clínica da data técnica.
- Exportação atual 1.5 mantém medications/medicationTreatments e consultas/recomendações apenas por seleção OWNER reautenticada, sob limites de itens/bytes e no-store. O arquivo contém saúde/textos eventualmente sobre terceiros: não armazenar em pasta pública ou analytics. Categoria MEDICATION default null, sem expurgo ou prazo presumido. Fechamento de conta preserva registros de dependentes com outros responsáveis.

- Timeline minimizada: fontes por módulo em transação autorizada, sem copiar conteúdo clínico/audit. Cadastro usa título genérico/summary null, sem nome/nascimento/autor. Permissão atual é revalidada por página; cursor assinado é escopado, expira e não concede acesso. Projeções futuras exigem revisão humana de finalidade/necessidade: limite de texto não é anonimização nem detector de conteúdo sensível.
- Sem snapshot materializado: corte técnico por createdAt/completedAt limita novas inserções/conclusões entre páginas, sem promessa de snapshot histórico imutável ou corte pelo commit. Não conserva conteúdos excluídos nem direitos antigos; soft delete/revogação ocultam as próximas leituras. Cursor contém posição decodificável; não registrar URLs/query/metadata em analytics, e proteger cópias no dispositivo.
- Minimização: dependente só perfil mínimo/data civil; sem CPF/RG/endereço. Relacionamento fica no vínculo, não em uma lista de responsáveis retornada ao cliente. Dados clínicos estão nos módulos medicamentos/consultas/documentos/vacinação/educação e no escopo autorizado.
- Privado por padrão: JWT global, conta/sessão ativas, links/papéis explícitos, nenhum módulo externamente compartilhado. Exportação não inclui dependentes por padrão e exige seleção OWNER, senha e nova checagem de versão.
- Menor privilégio: guard deriva titular; Prisma aplica escopo do proprietário/vínculo; DTOs não permitem atribuir userId, status de conta, basis ou retention. Estado do tratamento é enum clínico informado e autorizado, não estado da conta. Leitura de perfil por VIEWER não equivale a permissão de exportação em massa.
- Projeções: views enumeram campos. Hashes/senhas/tokens, metadados internos e dados de outros responsáveis não saem na exportação. Dados de nascimento usam DATE e YYYY-MM-DD, timestamps de sistema UTC.
- Segredos: senhas Argon2id; credenciais opacas de 256 bits persistidas somente como hash. Sessões/versões/replay/logout/reset tornam credenciais revogáveis. Reautenticação de exportação e exclusão usa PasswordService único e sua proteção de concorrência.
- Rastreamento mínimo: audit grava IDs, ação/recurso/tempo e metadata allowlist, sem textos, códigos ou valores pessoais. Exportação/pedido/revogação e seus audits são atômicos em Serializable. Não há alegação de trilha inviolável contra DBA.
- Transparência operacional: recibo de exclusão informa fechamento imediato e revisão pendente; não diz que dados foram fisicamente eliminados. Exportação tem versão/escopo explícitos e não salva cópia integral em tabela/storage/email.
- Controles de recursos: corpo JSON 32KiB, DTOs limitados, até 20 dependentes e bounds de itens/bytes de exportação. Excesso não vira arquivo parcial. Throttling HTTP existe; escala requer orçamento compartilhado adicional no gateway.
- Retirada específica: consentBased é configuração de servidor salva no evento, false por padrão. Retirada própria funciona mesmo após perda de acesso, sem afetar outro titular; retira todos os eventos ativos de mesmo tipo/escopo. Avisos não viram consentimento retroativamente.
- Preparação de governança: inventário por entidade, configuração de retenção sem prazo presumido, snapshot no pedido e status de revisão. Nenhuma purge/anonymização automática sem decisão aprovada.

## Crianças, consentimento e limites jurídicos

A LGPD diferencia dados sensíveis, trata especificamente dados de crianças e prevê direitos de acesso/revogação/eliminação e hipóteses de conservação; essas decisões precisam avaliação do controlador. O papel OWNER é uma autorização técnica, não prova automática de representação jurídica. Não se definiu que todo tratamento depende de consentimento. [LGPD — texto compilado](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm)

O atendimento dos titulares não se limita a um botão/exportação parcial: controlador deve organizar canal verificável, resposta e proteção de terceiros. Isso inclui contas encerradas e dados retidos não disponíveis na projeção online. [ANPD — direitos dos titulares](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares)

Texto/versão/finalidade/representação e consentBased precisam validação jurídica. Nenhum prazo legal foi inventado. null de retenção indica decisão pendente, não licença para conservar indefinidamente; 0 não executa destruição. Revogação não declara ilegal automaticamente o passado nem elimina prova técnica.

## Encerramento, anonimização e exclusão

O pedido exige senha/confirmation, fecha a conta via soft delete, revoga sessões/códigos/vínculos, incrementa versão e registra audit. Não apaga dependentes, aceites ou dados de outros responsáveis. Fluxo deliberadamente sem cancelamento/restauração automática; guardar/exportar antes de fechar.

Revisão de anonimização, eventual eliminação física, preservação mínima e tombstones devem seguir a [estratégia da Etapa 3](../architecture/privacy-foundation.md). IDs/relacionamentos mantidos são potencialmente reidentificáveis; pseudonimização não deve ser descrita como anonimização plena. Índices únicos e FKs RESTRICT precisam decisão explícita antes de expurgo.

Não há job, cron, endpoint de purge ou admin público. Mecanismos finais/retention devem incluir backups/restauração, operadores SMTP e futuras entidades/arquivos/links. Evitar apagar volumes ou cascade amplo como forma de atender um pedido.

## Antes de produção

1. Aprovar inventário, bases/finalidades, textos/representação, retention, destinatários/processadores e transferências. Definir encarregado/canal público apropriado, autenticação dos pedidos pós-fechamento e atendimento de exportações maiores/dados retidos.
2. Implementar procedimento operacional controlado de revisão/preservação/minimização/eliminação e comunicação do resultado. PENDING_REVIEW não é atendimento concluído; ACCOUNT em dias não é prazo legal automático.
3. Validar migrations/concorrência/rollback em PostgreSQL descartável, testar SMTP real e testes de carga. Nesta entrega o engine Docker está indisponível.
4. Implantar HTTPS, TLS de PostgreSQL validado, rede privada, API role sem DDL, secret manager, backups/restauração, audit restrito, redaction do bootstrap e controles de abuso compartilhados.
5. Adaptar app para confirmação informada de fechamento, reautenticação, armazenamento seguro de tokens/exports e nenhuma telemetria contendo dados pessoais/sensíveis.
6. Fazer revisão de segurança/privacidade antes de cada módulo clínico/compartilhamento; não atribuir diagnóstico, calcular dose ou gerar conteúdo médico.

Verificações automatizadas não substituem avaliação jurídica, ameaça operacional, pentest ou inspeção de uma implantação. Documentos históricos da auditoria permanecem retratos das etapas anteriores.
