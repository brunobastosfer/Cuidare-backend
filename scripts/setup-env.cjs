const { existsSync, readFileSync, writeFileSync, constants } = require('node:fs');
const { randomBytes } = require('node:crypto');
const { resolve } = require('node:path');

const root = resolve(__dirname, '..');
const file = resolve(root, '.env');
if (existsSync(file)) {
  console.info('.env já existe; configuração preservada.');
} else {
  const template = readFileSync(resolve(root, '.env.example'), 'utf8');
  const content = template
    .replaceAll('CHANGE_ME_DB_PASSWORD', randomBytes(24).toString('hex'))
    .replaceAll('CHANGE_ME_JWT_SECRET', randomBytes(48).toString('base64url'));
  writeFileSync(file, content, { flag: 'wx', mode: constants.S_IRUSR | constants.S_IWUSR });
  console.info('.env criado com credenciais locais aleatórias.');
}
