import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const app = read('app.js');
const html = read('index.html');
const edgeQueue = read('supabase/functions/send-push-queue/index.ts');
const edgeTest = read('supabase/functions/push-test/index.ts');
const sqlLimit = read('SUPABASE_MIGRATION_SECURITY_RATE_LIMIT.sql');

new vm.Script(app, { filename: 'app.js' });
new vm.Script(read('sw.js'), { filename: 'sw.js' });
assert.doesNotMatch(app, /\b(?:eval\s*\(|debugger\s*;|document\.write\s*\()/);
assert.doesNotMatch(app, /\bon(?:error|load|click)\s*=\s*["']/i);
assert.doesNotMatch(app, /\bsb_secret_[a-zA-Z0-9_]+|SUPABASE_SERVICE_ROLE_KEY|VAPID_PRIVATE_KEY|PUSH_QUEUE_SECRET/);
assert.match(app, /SUPABASE_PUBLISHABLE_KEY='sb_publishable_/);
assert.match(html, /@supabase\/supabase-js@2\.118\.0\/dist\/umd\/supabase\.js/);
assert.match(html, /http-equiv="Content-Security-Policy"/);
assert.doesNotMatch(html, /script-src[^;"]*unsafe-inline/);
assert.match(html, /name="referrer" content="no-referrer"/);
assert.match(app, /function renderPeople\(\)\{\s*if\(!backendSession\?\.user\?\.id\|\|!backendRoles\.includes\('admin'\)\)/);
assert.match(app, /function renderSettings\(\)\{\s*if\(!backendSession\?\.user\?\.id\|\|!backendRoles\.includes\('admin'\)\)/);
assert.doesNotMatch(app, /detachPushOnLogout/);
assert.match(app, /async function deactivatePushOnDevice\(\)/);
assert.match(app, /async function signOutV3\(\)[\s\S]*?supabaseClient\?\.auth\.signOut\(\)/);
assert.match(app, /MIN_NEW_PASSWORD_LENGTH=12/);
assert.match(sqlLimit, /private\.user_action_rate_limits/);
assert.match(sqlLimit, /on conflict \(user_id,action_name\)/);
assert.match(edgeTest, /claim_push_test_slot/);
assert.match(edgeTest, /supabase\.auth\.getUser\(\)/);
assert.doesNotMatch(edgeTest, /"Access-Control-Allow-Origin":\s*"\*"/);
assert.match(edgeQueue, /note\.type === "nutrition"/);
assert.doesNotMatch(edgeTest, /error: error\?\.message/);

const helperStart = app.indexOf('function publicCacheSnapshot(');
const helperEnd = app.indexOf('function persistPublicCache(', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart);
const snapshot = new Function(app.slice(helperStart,helperEnd) + '\nreturn publicCacheSnapshot;')();
const fixture = {
  settings: {club:'ADC',activeSeasonId:'s1',nutritionTemplate:'SEGREDO ALIMENTAR',weightReference:'post'},
  players:[{id:'p1',name:'Jogador',status:'Lesionado',email:'privado@example.com'}],
  users:[{email:'privado@example.com'}],
  trainings:[{entries:{p1:{pre:76.4}}}],
  fines:[{notes:'PAGAMENTO INTERNO'}],
  games:[
    {id:'g1',status:'scheduled',roster:{p1:{status:'Convocado'}},weighIns:{p1:{pre:76.4}}},
    {id:'g2',status:'final',roster:{p1:{status:'Convocado',stats:{goals:2}}},weighIns:{p1:{post:76.4}}},
  ],
};
const snap=snapshot(fixture);
const json=JSON.stringify(snap);
for(const value of ['SEGREDO ALIMENTAR','Lesionado','privado@example.com','76.4','PAGAMENTO INTERNO'])
  assert.equal(json.includes(value),false,'Cache expôs dado privado: '+value);
assert.deepEqual(snap.games[0].roster,{});
assert.equal(snap.games[1].roster.p1.stats.goals,2);

const scrubStart = app.indexOf('function sanitizePlainText(');
const scrubEnd = app.indexOf('const money=',scrubStart);
assert.ok(scrubStart >= 0 && scrubEnd > scrubStart);
const sanitize=new Function(app.slice(scrubStart,scrubEnd)+'\nreturn sanitizePlainText;')();
assert.equal(sanitize('  <img src=x onerror=alert(1)>  ',120),'img src=x onerror=alert(1)');
assert.equal(sanitize('\u0000 Rui ',120),'Rui');

const urlStart=app.indexOf('function safeImageSource(');
const urlEnd=app.indexOf('function teamLogoHtml(',urlStart);
assert.ok(urlStart>=0&&urlEnd>urlStart);
const safeUrl=new Function('location',app.slice(urlStart,urlEnd)+'\nreturn safeImageSource;')({
  href:'https://adcfigueiras.github.io/',origin:'https://adcfigueiras.github.io'
});
assert.equal(safeUrl('javascript:alert(1)'),'');
assert.equal(safeUrl('data:image/svg+xml,<svg/>'),'');
assert.match(safeUrl('assets/icon-192.png'),/^https:\/\/adcfigueiras.github.io\/assets\//);

console.log('Verificações estáticas de segurança: OK. Testes de navegador, Supabase RLS e migrações exigem ambiente de teste.');
