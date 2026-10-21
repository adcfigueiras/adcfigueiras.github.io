import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import vm from 'node:vm';

const root=resolve(import.meta.dirname,'..');
const dir=join(root,'dist','preprod-smoke');
const build=join(root,'scripts','build-staging.mjs');
const mockUrl='https://preprod-ficticio123.supabase.co';
const mockKey='sb_publishable_EXCLUSIVAMENTE_TESTE_1234567890';

function run(env){
 return spawnSync(process.execPath,[build],{
  cwd:root,
  env:{...process.env,STAGING_OUTPUT_DIR:dir,STAGING_VAPID_PUBLIC_KEY:'',...env},
  encoding:'utf8',timeout:30000
 });
}
const safe={STAGING_SUPABASE_URL:mockUrl,STAGING_SUPABASE_PUBLISHABLE_KEY:mockKey};
try{
 const forbidden=run({...safe,STAGING_SUPABASE_URL:'https://kfihltycbnambszmefqa.supabase.co'});
 assert.notEqual(forbidden.status,0,'Build não bloqueou backend de produção');
 const missing=run({...safe,STAGING_SUPABASE_PUBLISHABLE_KEY:''});
 assert.notEqual(missing.status,0,'Build aceitou ausência de chave pública de testes');
 const result=run(safe);
 assert.equal(result.status,0,result.stderr||result.stdout);

 const app=readFileSync(join(dir,'app.js'),'utf8');
 const html=readFileSync(join(dir,'index.html'),'utf8');
 const css=readFileSync(join(dir,'styles.css'),'utf8');
 const sw=readFileSync(join(dir,'sw.js'),'utf8');
 new vm.Script(app);
 new vm.Script(sw);

 assert.ok(app.includes(mockUrl));
 assert.ok(app.includes(mockKey));
 assert.ok(html.includes(mockUrl));
 assert.ok(!app.includes('kfihltycbnambszmefqa'));
 assert.ok(!html.includes('kfihltycbnambszmefqa'));
 assert.ok(!app.includes('adc-figueiras-team-manager-v3-dev'));
 assert.ok(app.includes('adc-figueiras-team-manager-v3-preprod'));
 assert.ok(app.includes('VAPID_PUBLIC_KEY&&'));
 assert.ok(html.includes('AMBIENTE DE TESTES'));
 assert.ok(css.includes('.preprod-ribbon'));
 assert.ok(sw.includes('adc-figueiras-preprod-v1-4-0'));
 assert.ok(sw.includes("k.startsWith('adc-figueiras-preprod-')"));
 assert.ok(!app.includes('adc-figueiras-v3-preview-mode'));
 assert.ok(!app.includes('adc-figueiras-testes-v3-cache'));
 assert.equal(JSON.parse(readFileSync(join(dir,'manifest.webmanifest'),'utf8')).short_name,'Figueiras TESTES');

 for(const file of ['termos.html','privacidade.html','cookies.html','legal.css','assets/icon-192.png','manifest.webmanifest'])
  assert.ok(existsSync(join(dir,file)),'Falta ficheiro estático: '+file);
 for(const file of ['SUPABASE_MIGRATION_CALLUP_PUBLIC.sql','.env','.gitignore','AUDITORIA_PRE_LANCAMENTO_RGPD.md'])
  assert.ok(!existsSync(join(dir,file)),'Build inclui ficheiro de manutenção: '+file);

 console.log('Build de pré-produção: OK. Backend e caches isolados; nenhum acesso ao Supabase de produção.');
}finally{rmSync(dir,{recursive:true,force:true})}
